"""
visits.py — Client Visit Planning Module
Attach to your FastAPI app via:
    from backend.visits import router as visits_router
    api_router.include_router(visits_router)

Collections used:
    db.visits          — visit records

Permissions model (stored in user.permissions dict):
    can_view_all_visits   : bool   — see every user's visits (admin auto-gets this)
    view_other_visits     : [uid]  — list of user IDs whose visits this user can read
    can_edit_visits       : bool   — create/edit any visit (admin auto-gets this)

IMPORTANT — Route ordering:
    FastAPI matches routes top-to-bottom. All static-path routes
    (/summary, /upcoming, /bulk-schedule, /admin/monthly-plan)
    MUST be declared BEFORE any parameterised routes (/{visit_id})
    otherwise FastAPI treats the literal string as the visit_id value.
"""

import uuid
import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from backend.dependencies import db, get_current_user, require_admin, get_team_user_ids
from backend.models import User

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")

router = APIRouter(prefix="/visits", tags=["visits"])

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

VisitStatus       = Literal["scheduled", "completed", "cancelled", "missed", "rescheduled"]
VisitPriority     = Literal["low", "medium", "high", "urgent"]
RecurrencePattern = Literal["none", "weekly", "biweekly", "monthly"]


class VisitCreate(BaseModel):
    client_id:           str
    client_name:         Optional[str] = None
    assigned_to:         str
    visit_date:          str                        # YYYY-MM-DD
    visit_time:          Optional[str] = None       # HH:MM  (24-h)
    purpose:             str = Field(..., min_length=2, max_length=200)
    services:            List[str] = []
    priority:            VisitPriority = "medium"
    notes:               Optional[str] = None
    location:            Optional[str] = None
    recurrence:          RecurrencePattern = "none"
    recurrence_end_date: Optional[str] = None       # YYYY-MM-DD

    @field_validator("visit_date", "recurrence_end_date", mode="before")
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        if isinstance(v, date):
            return v.isoformat()
        try:
            date.fromisoformat(str(v))
            return str(v)
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD.")


class VisitUpdate(BaseModel):
    visit_date:          Optional[str] = None
    visit_time:          Optional[str] = None
    purpose:             Optional[str] = None
    services:            Optional[List[str]] = None
    priority:            Optional[VisitPriority] = None
    status:              Optional[VisitStatus] = None
    notes:               Optional[str] = None
    location:            Optional[str] = None
    outcome:             Optional[str] = None
    follow_up_date:      Optional[str] = None
    recurrence:          Optional[RecurrencePattern] = None
    recurrence_end_date: Optional[str] = None


class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


class BulkSchedulePayload(BaseModel):
    assigned_to:  str
    client_id:    str
    client_name:  Optional[str] = None
    purpose:      str
    services:     List[str] = []
    priority:     VisitPriority = "medium"
    location:     Optional[str] = None
    notes:        Optional[str] = None
    visit_dates:  List[str]     # list of YYYY-MM-DD


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_perms(user: User) -> dict:
    if isinstance(user.permissions, dict):
        return user.permissions
    if user.permissions:
        return user.permissions.model_dump()
    return {}


def _can_read_visit(current_user: User, visit_owner_id: str) -> bool:
    if current_user.role == "admin":
        return True
    if current_user.id == visit_owner_id:
        return True
    perms = _get_perms(current_user)
    if perms.get("can_view_all_visits"):
        return True
    allowed = perms.get("view_other_visits", [])
    return visit_owner_id in (allowed or [])


def _can_write_visit(current_user: User, visit_owner_id: str) -> bool:
    if current_user.role == "admin":
        return True
    if current_user.id == visit_owner_id:
        return True
    perms = _get_perms(current_user)
    return bool(perms.get("can_edit_visits"))


def _expand_recurrence(
    base: dict,
    recurrence: RecurrencePattern,
    end_date_str: Optional[str],
) -> List[dict]:
    if recurrence == "none" or not end_date_str:
        return []

    delta_map = {
        "weekly":   timedelta(weeks=1),
        "biweekly": timedelta(weeks=2),
        "monthly":  timedelta(days=30),
    }
    delta = delta_map.get(recurrence)
    if not delta:
        return []

    try:
        start   = date.fromisoformat(base["visit_date"])
        end_max = date.fromisoformat(end_date_str)
    except ValueError:
        return []

    hard_limit = start + timedelta(days=366)
    end_max    = min(end_max, hard_limit)

    children  = []
    current   = start + delta
    parent_id = base["id"]

    while current <= end_max:
        child = {**base}
        child["id"]              = str(uuid.uuid4())
        child["visit_date"]      = current.isoformat()
        child["status"]          = "scheduled"
        child["parent_visit_id"] = parent_id
        child["recurrence"]      = recurrence
        child["created_at"]      = base["created_at"]
        child["updated_at"]      = base["created_at"]
        child["comments"]        = []
        child["outcome"]         = None
        child["follow_up_date"]  = None
        children.append(child)
        current += delta

    return children


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES — static paths FIRST, parameterised paths LAST
# ═══════════════════════════════════════════════════════════════════════════════

# ── 1. CREATE ─────────────────────────────────────────────────────────────────
@router.post("", status_code=201)
async def create_visit(
    data: VisitCreate,
    current_user: User = Depends(get_current_user),
):
    if not _can_write_visit(current_user, data.assigned_to):
        raise HTTPException(403, "Not authorised to create visits for this user")

    now_iso  = datetime.now(timezone.utc).isoformat()
    visit_id = str(uuid.uuid4())

    visit_doc = {
        "id":                visit_id,
        "client_id":         data.client_id,
        "client_name":       data.client_name or "",
        "assigned_to":       data.assigned_to,
        "created_by":        current_user.id,
        "visit_date":        data.visit_date,
        "visit_time":        data.visit_time,
        "purpose":           data.purpose,
        "services":          data.services,
        "priority":          data.priority,
        "status":            "scheduled",
        "notes":             data.notes,
        "location":          data.location,
        "recurrence":        data.recurrence,
        "recurrence_end_date": data.recurrence_end_date,
        "parent_visit_id":   None,
        "outcome":           None,
        "follow_up_date":    None,
        "comments":          [],
        "created_at":        now_iso,
        "updated_at":        now_iso,
    }

    await db.visits.insert_one(visit_doc)
    visit_doc.pop("_id", None)

    children = _expand_recurrence(visit_doc, data.recurrence, data.recurrence_end_date)
    if children:
        await db.visits.insert_many(children)
        for c in children:
            c.pop("_id", None)

    logger.info(
        f"Visit created: id={visit_id} by={current_user.id} "
        f"for={data.assigned_to} recurrence={data.recurrence} "
        f"children={len(children)}"
    )
    return {**visit_doc, "recurring_count": len(children)}


# ── 2. LIST (with filters) ────────────────────────────────────────────────────
@router.get("")
async def list_visits(
    user_id:   Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    month:     Optional[str] = Query(None),   # YYYY-MM
    status:    Optional[str] = Query(None),
    priority:  Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),   # YYYY-MM-DD
    to_date:   Optional[str] = Query(None),   # YYYY-MM-DD
    current_user: User = Depends(get_current_user),
):
    query: dict = {}

    if current_user.role == "admin":
        if user_id:
            query["assigned_to"] = user_id
    elif current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        visible  = list(set(team_ids + [current_user.id]))
        if user_id:
            if user_id not in visible:
                raise HTTPException(403, "User outside your team")
            query["assigned_to"] = user_id
        else:
            query["assigned_to"] = {"$in": visible}
    else:
        perms   = _get_perms(current_user)
        allowed = perms.get("view_other_visits", []) or []
        if user_id:
            if user_id != current_user.id and user_id not in allowed and not perms.get("can_view_all_visits"):
                raise HTTPException(403, "Not authorised to view this user's visits")
            query["assigned_to"] = user_id
        else:
            visible = list(set([current_user.id] + list(allowed)))
            query["assigned_to"] = {"$in": visible}

    if client_id:
        query["client_id"] = client_id
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority

    date_filter: dict = {}
    if month:
        date_filter["$regex"] = f"^{month}"
    if from_date:
        date_filter["$gte"] = from_date
    if to_date:
        date_filter["$lte"] = to_date
    if date_filter:
        query["visit_date"] = date_filter

    visits = (
        await db.visits.find(query, {"_id": 0})
        .sort("visit_date", 1)
        .to_list(2000)
    )

    uid_set = {v["assigned_to"] for v in visits} | {v.get("created_by") for v in visits}
    uid_set.discard(None)
    users_raw = await db.users.find(
        {"id": {"$in": list(uid_set)}},
        {"_id": 0, "id": 1, "full_name": 1, "profile_picture": 1},
    ).to_list(500)
    user_map = {u["id"]: u for u in users_raw}

    for v in visits:
        au = user_map.get(v.get("assigned_to"), {})
        cu = user_map.get(v.get("created_by"), {})
        v["assigned_to_name"]    = au.get("full_name", "Unknown")
        v["assigned_to_picture"] = au.get("profile_picture")
        v["created_by_name"]     = cu.get("full_name", "Unknown")

    return visits


# ── 3. SUMMARY — /visits/summary  ← MUST be before /{visit_id} ───────────────
@router.get("/summary")
async def visit_summary(
    user_id: Optional[str] = Query(None),
    month:   Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    target_uid = user_id or current_user.id
    if not _can_read_visit(current_user, target_uid):
        raise HTTPException(403, "Not authorised")

    now   = datetime.now(IST)
    month = month or now.strftime("%Y-%m")

    visits = await db.visits.find(
        {"assigned_to": target_uid, "visit_date": {"$regex": f"^{month}"}},
        {"_id": 0, "status": 1, "priority": 1},
    ).to_list(1000)

    total       = len(visits)
    by_status   = {}
    by_priority = {}
    for v in visits:
        by_status[v["status"]]     = by_status.get(v["status"], 0) + 1
        by_priority[v["priority"]] = by_priority.get(v["priority"], 0) + 1

    return {
        "month":           month,
        "user_id":         target_uid,
        "total":           total,
        "by_status":       by_status,
        "by_priority":     by_priority,
        "completion_rate": round(by_status.get("completed", 0) / total * 100, 1) if total else 0,
    }


# ── 4. UPCOMING — /visits/upcoming  ← MUST be before /{visit_id} ─────────────
@router.get("/upcoming")
async def upcoming_visits(
    days: int = Query(7, ge=1, le=60),
    current_user: User = Depends(get_current_user),
):
    today    = date.today()
    end_date = today + timedelta(days=days)

    perms   = _get_perms(current_user)
    allowed = perms.get("view_other_visits", []) or []

    if current_user.role == "admin":
        query = {}
    elif current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        visible  = list(set(team_ids + [current_user.id]))
        query    = {"assigned_to": {"$in": visible}}
    else:
        visible = list(set([current_user.id] + list(allowed)))
        query   = {"assigned_to": {"$in": visible}}

    query["visit_date"] = {"$gte": today.isoformat(), "$lte": end_date.isoformat()}
    query["status"]     = {"$in": ["scheduled", "rescheduled"]}

    visits = (
        await db.visits.find(query, {"_id": 0})
        .sort("visit_date", 1)
        .to_list(50)
    )

    uid_set   = {v["assigned_to"] for v in visits}
    users_raw = await db.users.find(
        {"id": {"$in": list(uid_set)}},
        {"_id": 0, "id": 1, "full_name": 1, "profile_picture": 1},
    ).to_list(200)
    user_map = {u["id"]: u for u in users_raw}

    for v in visits:
        au = user_map.get(v.get("assigned_to"), {})
        v["assigned_to_name"]    = au.get("full_name", "Unknown")
        v["assigned_to_picture"] = au.get("profile_picture")
        v["days_until"] = (date.fromisoformat(v["visit_date"]) - today).days

    return visits


# ── 5. BULK SCHEDULE — /visits/bulk-schedule  ← MUST be before /{visit_id} ───
@router.post("/bulk-schedule", status_code=201)
async def bulk_schedule(
    payload: BulkSchedulePayload,
    current_user: User = Depends(get_current_user),
):
    if not _can_write_visit(current_user, payload.assigned_to):
        raise HTTPException(403, "Not authorised")

    now_iso = datetime.now(timezone.utc).isoformat()
    docs    = []
    for d in payload.visit_dates:
        try:
            date.fromisoformat(d)
        except ValueError:
            continue
        docs.append({
            "id":                str(uuid.uuid4()),
            "client_id":         payload.client_id,
            "client_name":       payload.client_name or "",
            "assigned_to":       payload.assigned_to,
            "created_by":        current_user.id,
            "visit_date":        d,
            "visit_time":        None,
            "purpose":           payload.purpose,
            "services":          payload.services,
            "priority":          payload.priority,
            "status":            "scheduled",
            "notes":             payload.notes,
            "location":          payload.location,
            "recurrence":        "none",
            "recurrence_end_date": None,
            "parent_visit_id":   None,
            "outcome":           None,
            "follow_up_date":    None,
            "comments":          [],
            "created_at":        now_iso,
            "updated_at":        now_iso,
        })

    if docs:
        await db.visits.insert_many(docs)
        for d in docs:
            d.pop("_id", None)

    return {"created": len(docs), "visits": docs}


# ── 6. ADMIN MONTHLY PLAN — /visits/admin/monthly-plan  ← before /{visit_id} ─
@router.get("/admin/monthly-plan")
async def admin_monthly_plan(
    month: str = Query(...),
    current_user: User = Depends(require_admin),
):
    visits = (
        await db.visits.find(
            {"visit_date": {"$regex": f"^{month}"}},
            {"_id": 0},
        )
        .sort([("assigned_to", 1), ("visit_date", 1)])
        .to_list(5000)
    )

    uid_set   = {v["assigned_to"] for v in visits}
    users_raw = await db.users.find(
        {"id": {"$in": list(uid_set)}},
        {"_id": 0, "id": 1, "full_name": 1},
    ).to_list(200)
    user_map = {u["id"]: u["full_name"] for u in users_raw}

    grouped: dict = {}
    for v in visits:
        uid  = v["assigned_to"]
        name = user_map.get(uid, "Unknown")
        if uid not in grouped:
            grouped[uid] = {"user_id": uid, "user_name": name, "visits": [], "total": 0, "completed": 0}
        grouped[uid]["visits"].append(v)
        grouped[uid]["total"] += 1
        if v["status"] == "completed":
            grouped[uid]["completed"] += 1

    return {"month": month, "users": list(grouped.values())}


# ── 7. GET SINGLE — /{visit_id}  ← parameterised, comes LAST ─────────────────
@router.get("/{visit_id}")
async def get_visit(
    visit_id: str,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    if not _can_read_visit(current_user, visit["assigned_to"]):
        raise HTTPException(403, "Not authorised")

    uid_set = {visit["assigned_to"], visit.get("created_by")}
    uid_set.discard(None)
    users_raw = await db.users.find(
        {"id": {"$in": list(uid_set)}},
        {"_id": 0, "id": 1, "full_name": 1, "profile_picture": 1},
    ).to_list(10)
    user_map = {u["id"]: u for u in users_raw}

    au = user_map.get(visit.get("assigned_to"), {})
    cu = user_map.get(visit.get("created_by"), {})
    visit["assigned_to_name"]    = au.get("full_name", "Unknown")
    visit["assigned_to_picture"] = au.get("profile_picture")
    visit["created_by_name"]     = cu.get("full_name", "Unknown")

    client = await db.clients.find_one(
        {"id": visit["client_id"]},
        {"_id": 0, "company_name": 1, "phone": 1, "email": 1},
    )
    visit["client_info"] = client or {}

    return visit


# ── 8. UPDATE — /{visit_id}  ← parameterised ─────────────────────────────────
@router.patch("/{visit_id}")
async def update_visit(
    visit_id: str,
    data: VisitUpdate,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    if not _can_write_visit(current_user, visit["assigned_to"]):
        raise HTTPException(403, "Not authorised to edit this visit")

    payload = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.visits.update_one({"id": visit_id}, {"$set": payload})
    updated = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    return updated


# ── 9. DELETE — /{visit_id}  ← parameterised ─────────────────────────────────
@router.delete("/{visit_id}")
async def delete_visit(
    visit_id: str,
    delete_recurrences: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    if not _can_write_visit(current_user, visit["assigned_to"]):
        raise HTTPException(403, "Not authorised")

    deleted = 1
    await db.visits.delete_one({"id": visit_id})

    if delete_recurrences and visit.get("parent_visit_id") is None:
        result = await db.visits.delete_many({"parent_visit_id": visit_id})
        deleted += result.deleted_count

    return {"message": f"Deleted {deleted} visit(s)"}


# ── 10. ADD COMMENT — /{visit_id}/comments  ← parameterised ──────────────────
@router.post("/{visit_id}/comments", status_code=201)
async def add_comment(
    visit_id: str,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")
    if not _can_read_visit(current_user, visit["assigned_to"]):
        raise HTTPException(403, "Not authorised")

    comment = {
        "id":         str(uuid.uuid4()),
        "user_id":    current_user.id,
        "user_name":  current_user.full_name,
        "text":       data.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.visits.update_one(
        {"id": visit_id},
        {
            "$push": {"comments": comment},
            "$set":  {"updated_at": comment["created_at"]},
        },
    )
    return comment


# ── 11. DELETE COMMENT — /{visit_id}/comments/{comment_id}  ← parameterised ──
@router.delete("/{visit_id}/comments/{comment_id}")
async def delete_comment(
    visit_id:   str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, "Visit not found")

    comment = next((c for c in visit.get("comments", []) if c["id"] == comment_id), None)
    if not comment:
        raise HTTPException(404, "Comment not found")

    if comment["user_id"] != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Can only delete your own comments")

    await db.visits.update_one(
        {"id": visit_id},
        {"$pull": {"comments": {"id": comment_id}}},
    )
    return {"message": "Comment deleted"}
