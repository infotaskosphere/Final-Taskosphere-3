"""
visits.py — Client Visit Planning Module  v3  COMPLETE REWRITE
Attach to your FastAPI app via:
    from backend.visits import router as visits_router
    api_router.include_router(visits_router)

Collections used:
    db.visits   — visit records
    db.users    — for name enrichment
    db.clients  — for client info enrichment

Permissions model (stored in user.permissions dict):
    can_view_all_visits   : bool   — see every user's visits (admin auto-gets this)
    view_other_visits     : [uid]  — list of user IDs whose visits this user can read
    can_edit_visits       : bool   — create/edit any visit (admin auto-gets this)

FIXES in v3:
  - DELETE 404 BUG FIXED: The root cause was that the frontend was calling
    DELETE /visits/<id> but sometimes the visit_id contained characters
    (spaces, slashes) that FastAPI couldn't route correctly, OR the visit
    document was stored with a different id format. Now we do a
    find_one_and_delete with {"id": visit_id} AND a fallback lookup by
    string-coerced _id so the delete always finds the document.
    Additionally added explicit 404 with detail message so the frontend
    can display it meaningfully rather than a generic network error.

  - DUPLICATE PREVENTION: create_visit now checks for an existing visit
    with the same (client_id, assigned_to, visit_date) before inserting.
    Returns HTTP 409 Conflict with a clear message.

  - SMART RECURRENCE: Added new RecurrencePattern values and a
    generate_smart_recurrence() helper that supports:
      * "weekly"         — every 7 days from start_date
      * "biweekly"       — every 14 days
      * "monthly"        — same day-of-month each month
      * "nth_weekday"    — e.g. "every 2nd Thursday of the month"
      * "last_weekday"   — e.g. "every last Friday of the month"
    The frontend sends recurrence_weekday (0=Mon…6=Sun) and
    recurrence_week_number (1-5, or 0 = "last") alongside the
    recurrence pattern.

  - list_visits: manager branch guarded with filter(None, ...) to prevent
    None values crashing $in.
  - list_visits: month filter now uses $gte/$lte instead of $regex to avoid
    MongoDB conflict between $regex and comparison operators on the same key.
  - All routes: {"_id": 0} projection consistently applied everywhere to
    prevent ObjectId serialisation errors.
  - get_visit: client lookup handles missing client gracefully.
  - _expand_recurrence: child docs get all required fields.
  - VisitCreate validator: accepts both date objects and strings.
  - Robust null guards on every field that touches DB data.

IMPORTANT — Route ordering:
    All static-path routes (/summary, /upcoming, /bulk-schedule,
    /admin/monthly-plan, /from-email, /check-duplicate) MUST be declared
    BEFORE any parameterised routes (/{visit_id}).
"""

import uuid
import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional, Literal
from zoneinfo import ZoneInfo
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, ConfigDict

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

# Extended recurrence patterns — v3
RecurrencePattern = Literal[
    "none",
    "weekly",        # every 7 days from start
    "biweekly",      # every 14 days
    "monthly",       # same calendar date each month (e.g. 15th)
    "nth_weekday",   # nth occurrence of a weekday in a month (e.g. 2nd Thursday)
    "last_weekday",  # last occurrence of a weekday in a month (e.g. last Friday)
]


class VisitCreate(BaseModel):
    client_id:              str
    client_name:            Optional[str] = None
    assigned_to:            str
    visit_date:             str                         # YYYY-MM-DD
    visit_time:             Optional[str] = None        # HH:MM (24-h)
    purpose:                str = Field(..., min_length=2, max_length=200)
    services:               List[str] = Field(default_factory=list)
    priority:               VisitPriority = "medium"
    notes:                  Optional[str] = None
    location:               Optional[str] = None
    recurrence:             RecurrencePattern = "none"
    recurrence_end_date:    Optional[str] = None        # YYYY-MM-DD
    # Smart recurrence fields
    recurrence_weekday:     Optional[int] = None        # 0=Mon, 1=Tue … 6=Sun
    recurrence_week_number: Optional[int] = None        # 1=first, 2=second … 5=fifth, 0=last

    @field_validator("visit_date", "recurrence_end_date", mode="before")
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        if isinstance(v, date):
            return v.isoformat()
        try:
            date.fromisoformat(str(v)[:10])
            return str(v)[:10]
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD.")


class VisitUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    visit_date:             Optional[str] = None
    visit_time:             Optional[str] = None
    purpose:                Optional[str] = None
    services:               Optional[List[str]] = None
    priority:               Optional[VisitPriority] = None
    status:                 Optional[VisitStatus] = None
    notes:                  Optional[str] = None
    location:               Optional[str] = None
    outcome:                Optional[str] = None
    follow_up_date:         Optional[str] = None
    recurrence:             Optional[RecurrencePattern] = None
    recurrence_end_date:    Optional[str] = None
    recurrence_weekday:     Optional[int] = None
    recurrence_week_number: Optional[int] = None

    @field_validator("visit_date", "follow_up_date", "recurrence_end_date", mode="before")
    @classmethod
    def validate_date(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, date):
            return v.isoformat()
        try:
            date.fromisoformat(str(v)[:10])
            return str(v)[:10]
        except ValueError:
            return None


class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


class BulkSchedulePayload(BaseModel):
    assigned_to:  str
    client_id:    str
    client_name:  Optional[str] = None
    purpose:      str
    services:     List[str] = Field(default_factory=list)
    priority:     VisitPriority = "medium"
    location:     Optional[str] = None
    notes:        Optional[str] = None
    visit_dates:  List[str]      # list of YYYY-MM-DD


class DuplicateCheckPayload(BaseModel):
    client_id:   str
    assigned_to: str
    visit_date:  str


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_perms(user: User) -> dict:
    if isinstance(user.permissions, dict):
        return user.permissions
    if user.permissions:
        try:
            return user.permissions.model_dump()
        except Exception:
            return {}
    return {}


def _can_read_visit(current_user: User, visit_owner_id: str) -> bool:
    if current_user.role == "admin":
        return True
    if str(current_user.id) == str(visit_owner_id):
        return True
    perms = _get_perms(current_user)
    if perms.get("can_view_all_visits"):
        return True
    allowed = perms.get("view_other_visits") or []
    return str(visit_owner_id) in [str(x) for x in allowed]


def _can_write_visit(current_user: User, visit_owner_id: str) -> bool:
    if current_user.role == "admin":
        return True
    if str(current_user.id) == str(visit_owner_id):
        return True
    perms = _get_perms(current_user)
    return bool(perms.get("can_edit_visits"))


def _nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> Optional[date]:
    """
    Return the nth occurrence (1-based) of `weekday` (0=Mon…6=Sun)
    in the given year/month, or None if it doesn't exist.
    `n=0` means the LAST occurrence.
    """
    # Python's weekday(): Monday=0 … Sunday=6
    first_day = date(year, month, 1)
    # Offset from first_day to the first occurrence of `weekday` in this month
    offset = (weekday - first_day.weekday()) % 7
    first_occurrence = first_day + timedelta(days=offset)

    if n == 0:
        # Last occurrence: go to the last day and walk back
        last_day = date(year, month, monthrange(year, month)[1])
        offset_back = (last_day.weekday() - weekday) % 7
        result = last_day - timedelta(days=offset_back)
        return result if result.month == month else None
    else:
        result = first_occurrence + timedelta(weeks=n - 1)
        return result if result.month == month else None


def _generate_smart_recurrence(
    base_date_str: str,
    recurrence: RecurrencePattern,
    end_date_str: str,
    weekday: Optional[int] = None,
    week_number: Optional[int] = None,
) -> List[date]:
    """
    Generate all recurrence dates between base_date (exclusive) and end_date (inclusive).
    Returns a list of date objects.
    """
    if recurrence == "none" or not end_date_str:
        return []

    try:
        base_date = date.fromisoformat(base_date_str)
        end_date  = date.fromisoformat(end_date_str[:10])
    except (ValueError, TypeError):
        return []

    # Hard safety cap — never generate more than 1 year of occurrences
    hard_cap = base_date + timedelta(days=366)
    end_date  = min(end_date, hard_cap)

    dates: List[date] = []

    if recurrence == "weekly":
        current = base_date + timedelta(weeks=1)
        while current <= end_date:
            dates.append(current)
            current += timedelta(weeks=1)

    elif recurrence == "biweekly":
        current = base_date + timedelta(weeks=2)
        while current <= end_date:
            dates.append(current)
            current += timedelta(weeks=2)

    elif recurrence == "monthly":
        # Same calendar date each month
        month_offset = 1
        while True:
            year  = base_date.year + (base_date.month - 1 + month_offset) // 12
            month = (base_date.month - 1 + month_offset) % 12 + 1
            # Clamp day to last valid day of that month
            max_day = monthrange(year, month)[1]
            day = min(base_date.day, max_day)
            d = date(year, month, day)
            if d > end_date:
                break
            dates.append(d)
            month_offset += 1
            if month_offset > 120:  # 10-year hard cap
                break

    elif recurrence in ("nth_weekday", "last_weekday"):
        if weekday is None:
            return []
        # Determine n: for nth_weekday use week_number (1-5), for last use 0
        n = 0 if recurrence == "last_weekday" else (week_number or 1)

        month_offset = 1
        while True:
            year  = base_date.year + (base_date.month - 1 + month_offset) // 12
            month = (base_date.month - 1 + month_offset) % 12 + 1
            d = _nth_weekday_of_month(year, month, weekday, n)
            if d is None:
                month_offset += 1
                if month_offset > 120:
                    break
                continue
            if d > end_date:
                break
            if d > base_date:
                dates.append(d)
            month_offset += 1
            if month_offset > 120:
                break

    return sorted(set(dates))


def _expand_recurrence(
    base: dict,
    recurrence: RecurrencePattern,
    end_date_str: Optional[str],
    weekday: Optional[int] = None,
    week_number: Optional[int] = None,
) -> List[dict]:
    """Build child visit documents for all recurrence dates."""
    if recurrence == "none" or not end_date_str:
        return []

    generated_dates = _generate_smart_recurrence(
        base["visit_date"], recurrence, end_date_str, weekday, week_number
    )

    parent_id = base["id"]
    children  = []
    for d in generated_dates:
        child = {**base}
        child["id"]                      = str(uuid.uuid4())
        child["visit_date"]              = d.isoformat()
        child["status"]                  = "scheduled"
        child["parent_visit_id"]         = parent_id
        child["recurrence"]              = recurrence
        child["recurrence_end_date"]     = end_date_str
        child["recurrence_weekday"]      = weekday
        child["recurrence_week_number"]  = week_number
        child["created_at"]              = base["created_at"]
        child["updated_at"]              = base["created_at"]
        child["comments"]                = []
        child["outcome"]                 = None
        child["follow_up_date"]          = None
        children.append(child)

    return children


async def _check_duplicate(client_id: str, assigned_to: str, visit_date: str, exclude_id: Optional[str] = None) -> Optional[dict]:
    """
    Return an existing visit document if one already exists for the same
    client + user + date combination, else return None.
    Pass exclude_id when editing to avoid self-conflict.
    """
    query: dict = {
        "client_id":   client_id,
        "assigned_to": assigned_to,
        "visit_date":  visit_date,
        "status":      {"$nin": ["cancelled"]},   # cancelled visits don't block re-scheduling
    }
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    return await db.visits.find_one(query, {"_id": 0, "id": 1, "purpose": 1, "status": 1})


async def _enrich_visits(visits: list) -> list:
    """Add assigned_to_name, assigned_to_picture, created_by_name to each visit."""
    if not visits:
        return visits

    uid_set = set()
    for v in visits:
        if v.get("assigned_to"):
            uid_set.add(str(v["assigned_to"]))
        if v.get("created_by"):
            uid_set.add(str(v["created_by"]))
    uid_set.discard(None)

    user_map = {}
    if uid_set:
        users_raw = await db.users.find(
            {"id": {"$in": list(uid_set)}},
            {"_id": 0, "id": 1, "full_name": 1, "profile_picture": 1},
        ).to_list(500)
        user_map = {u["id"]: u for u in users_raw}

    for v in visits:
        au = user_map.get(str(v.get("assigned_to", "")), {})
        cu = user_map.get(str(v.get("created_by", "")), {})
        v["assigned_to_name"]    = au.get("full_name", "Unknown")
        v["assigned_to_picture"] = au.get("profile_picture")
        v["created_by_name"]     = cu.get("full_name", "Unknown")

    return visits


def _build_date_filter(
    month: Optional[str],
    from_date: Optional[str],
    to_date: Optional[str],
) -> Optional[dict]:
    """
    FIX: MongoDB does not allow $regex and $gte/$lte in the same field query dict.
    Convert month (YYYY-MM) to an equivalent $gte / $lte range.
    """
    date_filter: dict = {}

    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
            first_day = date(year, mon, 1).isoformat()
            if mon == 12:
                last_day = date(year + 1, 1, 1) - timedelta(days=1)
            else:
                last_day = date(year, mon + 1, 1) - timedelta(days=1)
            date_filter["$gte"] = first_day
            date_filter["$lte"] = last_day.isoformat() if not isinstance(last_day, str) else last_day
        except (ValueError, TypeError, AttributeError):
            pass

    if from_date:
        if "$gte" not in date_filter or from_date > date_filter["$gte"]:
            date_filter["$gte"] = from_date
    if to_date:
        if "$lte" not in date_filter or to_date < date_filter["$lte"]:
            date_filter["$lte"] = to_date

    return date_filter if date_filter else None


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

    # ── DUPLICATE CHECK (v3 FIX) ────────────────────────────────────────────
    existing = await _check_duplicate(data.client_id, data.assigned_to, data.visit_date)
    if existing:
        raise HTTPException(
            409,
            f"A visit for this client on {data.visit_date} is already scheduled "
            f"(id={existing['id']}, purpose='{existing.get('purpose', '')}', "
            f"status={existing.get('status', 'scheduled')}). "
            "Cancel the existing visit before creating a new one, or choose a different date."
        )

    now_iso  = datetime.now(timezone.utc).isoformat()
    visit_id = str(uuid.uuid4())

    visit_doc = {
        "id":                      visit_id,
        "client_id":               data.client_id,
        "client_name":             data.client_name or "",
        "assigned_to":             data.assigned_to,
        "created_by":              str(current_user.id),
        "visit_date":              data.visit_date,
        "visit_time":              data.visit_time,
        "purpose":                 data.purpose,
        "services":                data.services or [],
        "priority":                data.priority,
        "status":                  "scheduled",
        "notes":                   data.notes,
        "location":                data.location,
        "recurrence":              data.recurrence,
        "recurrence_end_date":     data.recurrence_end_date,
        "recurrence_weekday":      data.recurrence_weekday,
        "recurrence_week_number":  data.recurrence_week_number,
        "parent_visit_id":         None,
        "outcome":                 None,
        "follow_up_date":          None,
        "comments":                [],
        "source":                  "manual",
        "created_at":              now_iso,
        "updated_at":              now_iso,
    }

    await db.visits.insert_one(visit_doc)
    visit_doc.pop("_id", None)

    children = _expand_recurrence(
        visit_doc,
        data.recurrence,
        data.recurrence_end_date,
        data.recurrence_weekday,
        data.recurrence_week_number,
    )

    # Deduplicate children against existing visits before inserting
    if children:
        filtered_children = []
        for child in children:
            dup = await _check_duplicate(child["client_id"], child["assigned_to"], child["visit_date"])
            if not dup:
                filtered_children.append(child)
            else:
                logger.warning(
                    f"Skipped duplicate recurring child: client={child['client_id']} "
                    f"date={child['visit_date']}"
                )
        children = filtered_children
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
    month:     Optional[str] = Query(None),
    status:    Optional[str] = Query(None),
    priority:  Optional[str] = Query(None),
    source:    Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date:   Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    query: dict = {}

    # ── Role-based visibility scoping ────────────────────────────────────────
    if current_user.role == "admin":
        if user_id:
            query["assigned_to"] = user_id

    elif current_user.role == "manager":
        try:
            raw_team_ids = await get_team_user_ids(current_user.id)
            team_ids = [str(i) for i in (raw_team_ids or []) if i is not None]
        except Exception:
            team_ids = []

        visible = list(set(team_ids + [str(current_user.id)]))

        if user_id:
            if user_id not in visible:
                raise HTTPException(403, "User outside your team")
            query["assigned_to"] = user_id
        else:
            query["assigned_to"] = {"$in": visible}

    else:
        perms   = _get_perms(current_user)
        allowed = [str(x) for x in (perms.get("view_other_visits") or []) if x is not None]

        if perms.get("can_view_all_visits"):
            if user_id:
                query["assigned_to"] = user_id
        elif user_id:
            if user_id != str(current_user.id) and user_id not in allowed:
                raise HTTPException(403, "Not authorised to view this user's visits")
            query["assigned_to"] = user_id
        else:
            visible = list(set([str(current_user.id)] + allowed))
            query["assigned_to"] = {"$in": visible}

    if client_id:
        query["client_id"] = client_id
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if source:
        query["source"] = source

    date_filter = _build_date_filter(month, from_date, to_date)
    if date_filter:
        query["visit_date"] = date_filter

    try:
        visits = (
            await db.visits.find(query, {"_id": 0})
            .sort("visit_date", 1)
            .to_list(2000)
        )
    except Exception as e:
        logger.error(f"list_visits DB error: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to fetch visits: {str(e)}")

    visits = await _enrich_visits(visits)
    return visits


# ── 3. SUMMARY — static path, BEFORE /{visit_id} ─────────────────────────────
@router.get("/summary")
async def visit_summary(
    user_id: Optional[str] = Query(None),
    month:   Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    target_uid = user_id or str(current_user.id)
    if not _can_read_visit(current_user, target_uid):
        raise HTTPException(403, "Not authorised")

    now   = datetime.now(IST)
    month = month or now.strftime("%Y-%m")

    date_filter = _build_date_filter(month, None, None)
    db_query    = {"assigned_to": target_uid}
    if date_filter:
        db_query["visit_date"] = date_filter

    visits = await db.visits.find(
        db_query,
        {"_id": 0, "status": 1, "priority": 1},
    ).to_list(1000)

    total        = len(visits)
    by_status:   dict = {}
    by_priority: dict = {}
    for v in visits:
        s = v.get("status", "scheduled")
        p = v.get("priority", "medium")
        by_status[s]   = by_status.get(s, 0) + 1
        by_priority[p] = by_priority.get(p, 0) + 1

    return {
        "month":           month,
        "user_id":         target_uid,
        "total":           total,
        "by_status":       by_status,
        "by_priority":     by_priority,
        "completion_rate": round(by_status.get("completed", 0) / total * 100, 1) if total else 0,
    }


# ── 4. UPCOMING — static path, BEFORE /{visit_id} ───────────────────────────
@router.get("/upcoming")
async def upcoming_visits(
    days: int = Query(7, ge=1, le=60),
    current_user: User = Depends(get_current_user),
):
    today    = date.today()
    end_date = today + timedelta(days=days)

    perms   = _get_perms(current_user)
    allowed = [str(x) for x in (perms.get("view_other_visits") or []) if x is not None]

    if current_user.role == "admin":
        query: dict = {}
    elif current_user.role == "manager":
        try:
            raw_team = await get_team_user_ids(current_user.id)
            team_ids = [str(i) for i in (raw_team or []) if i is not None]
        except Exception:
            team_ids = []
        visible = list(set(team_ids + [str(current_user.id)]))
        query   = {"assigned_to": {"$in": visible}}
    else:
        visible = list(set([str(current_user.id)] + allowed))
        query   = {"assigned_to": {"$in": visible}}

    query["visit_date"] = {"$gte": today.isoformat(), "$lte": end_date.isoformat()}
    query["status"]     = {"$in": ["scheduled", "rescheduled"]}

    visits = (
        await db.visits.find(query, {"_id": 0})
        .sort("visit_date", 1)
        .to_list(50)
    )

    visits = await _enrich_visits(visits)
    for v in visits:
        try:
            v["days_until"] = (date.fromisoformat(v["visit_date"]) - today).days
        except (ValueError, TypeError):
            v["days_until"] = None

    return visits


# ── 5. BULK SCHEDULE — static path, BEFORE /{visit_id} ──────────────────────
@router.post("/bulk-schedule", status_code=201)
async def bulk_schedule(
    payload: BulkSchedulePayload,
    current_user: User = Depends(get_current_user),
):
    if not _can_write_visit(current_user, payload.assigned_to):
        raise HTTPException(403, "Not authorised")

    now_iso    = datetime.now(timezone.utc).isoformat()
    docs       = []
    duplicates = []

    for d in payload.visit_dates:
        try:
            date.fromisoformat(str(d)[:10])
        except (ValueError, TypeError):
            continue

        # Duplicate check per date
        dup = await _check_duplicate(payload.client_id, payload.assigned_to, str(d)[:10])
        if dup:
            duplicates.append(str(d)[:10])
            continue

        docs.append({
            "id":                      str(uuid.uuid4()),
            "client_id":               payload.client_id,
            "client_name":             payload.client_name or "",
            "assigned_to":             payload.assigned_to,
            "created_by":              str(current_user.id),
            "visit_date":              str(d)[:10],
            "visit_time":              None,
            "purpose":                 payload.purpose,
            "services":                payload.services or [],
            "priority":                payload.priority,
            "status":                  "scheduled",
            "notes":                   payload.notes,
            "location":                payload.location,
            "recurrence":              "none",
            "recurrence_end_date":     None,
            "recurrence_weekday":      None,
            "recurrence_week_number":  None,
            "parent_visit_id":         None,
            "outcome":                 None,
            "follow_up_date":          None,
            "comments":                [],
            "source":                  "manual",
            "created_at":              now_iso,
            "updated_at":              now_iso,
        })

    if docs:
        await db.visits.insert_many(docs)
        for d in docs:
            d.pop("_id", None)

    return {"created": len(docs), "skipped_duplicates": duplicates, "visits": docs}


# ── 6. FROM EMAIL — static path, BEFORE /{visit_id} ─────────────────────────
@router.get("/from-email")
async def list_email_visits(
    month:  Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    query: dict = {
        "assigned_to": str(current_user.id),
        "source":      {"$in": ["email_auto", "email_manual"]},
    }
    if status:
        query["status"] = status

    date_filter = _build_date_filter(month, None, None)
    if date_filter:
        query["visit_date"] = date_filter

    visits = (
        await db.visits.find(query, {"_id": 0})
        .sort("visit_date", 1)
        .to_list(500)
    )
    visits = await _enrich_visits(visits)
    return visits


# ── 7. CHECK DUPLICATE — static path, BEFORE /{visit_id} ────────────────────
@router.post("/check-duplicate")
async def check_duplicate_endpoint(
    data: DuplicateCheckPayload,
    current_user: User = Depends(get_current_user),
):
    """
    Lightweight pre-flight check so the frontend can warn the user
    before they submit the form.
    """
    existing = await _check_duplicate(data.client_id, data.assigned_to, data.visit_date)
    return {
        "is_duplicate": existing is not None,
        "existing":     existing,
    }


# ── 8. ADMIN MONTHLY PLAN — static path, BEFORE /{visit_id} ─────────────────
@router.get("/admin/monthly-plan")
async def admin_monthly_plan(
    month: str = Query(...),
    current_user: User = Depends(require_admin),
):
    date_filter = _build_date_filter(month, None, None)
    db_query    = {}
    if date_filter:
        db_query["visit_date"] = date_filter

    visits = (
        await db.visits.find(db_query, {"_id": 0})
        .sort([("assigned_to", 1), ("visit_date", 1)])
        .to_list(5000)
    )

    uid_set   = {v.get("assigned_to") for v in visits if v.get("assigned_to")}
    users_raw = await db.users.find(
        {"id": {"$in": list(uid_set)}},
        {"_id": 0, "id": 1, "full_name": 1},
    ).to_list(200)
    user_map = {u["id"]: u["full_name"] for u in users_raw}

    grouped: dict = {}
    for v in visits:
        uid  = v.get("assigned_to", "")
        name = user_map.get(uid, "Unknown")
        if uid not in grouped:
            grouped[uid] = {"user_id": uid, "user_name": name, "visits": [], "total": 0, "completed": 0}
        grouped[uid]["visits"].append(v)
        grouped[uid]["total"] += 1
        if v.get("status") == "completed":
            grouped[uid]["completed"] += 1

    return {"month": month, "users": list(grouped.values())}


# ── 9. QUICK STATUS — /{visit_id}/quick-status ───────────────────────────────
@router.post("/{visit_id}/quick-status")
async def quick_status(
    visit_id: str,
    data: dict,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, f"Visit not found: id={visit_id}")
    if not _can_write_visit(current_user, visit.get("assigned_to", "")):
        raise HTTPException(403, "Not authorised")

    done    = bool(data.get("done", True))
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "status":     "completed" if done else "missed",
        "updated_at": now_iso,
    }
    if done:
        payload["completed_at"] = now_iso

    await db.visits.update_one({"id": visit_id}, {"$set": payload})
    updated = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    logger.info(f"quick_status: visit={visit_id} done={done} by={current_user.id}")
    return updated


# ── 10. ADD COMMENT — /{visit_id}/comments ───────────────────────────────────
@router.post("/{visit_id}/comments", status_code=201)
async def add_comment(
    visit_id: str,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, f"Visit not found: id={visit_id}")
    if not _can_read_visit(current_user, visit.get("assigned_to", "")):
        raise HTTPException(403, "Not authorised")

    comment = {
        "id":         str(uuid.uuid4()),
        "user_id":    str(current_user.id),
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


# ── 11. DELETE COMMENT — /{visit_id}/comments/{comment_id} ──────────────────
@router.delete("/{visit_id}/comments/{comment_id}")
async def delete_comment(
    visit_id:   str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, f"Visit not found: id={visit_id}")

    comment = next(
        (c for c in (visit.get("comments") or []) if c.get("id") == comment_id),
        None,
    )
    if not comment:
        raise HTTPException(404, "Comment not found")

    if str(comment.get("user_id")) != str(current_user.id) and current_user.role != "admin":
        raise HTTPException(403, "Can only delete your own comments")

    await db.visits.update_one(
        {"id": visit_id},
        {"$pull": {"comments": {"id": comment_id}}},
    )
    return {"message": "Comment deleted"}


# ── 12. GET SINGLE — PARAMETERISED, AFTER all static routes ──────────────────
@router.get("/{visit_id}")
async def get_visit(
    visit_id: str,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, f"Visit not found: id={visit_id}")
    if not _can_read_visit(current_user, visit.get("assigned_to", "")):
        raise HTTPException(403, "Not authorised")

    visit = (await _enrich_visits([visit]))[0]

    client_id = visit.get("client_id")
    if client_id:
        try:
            client = await db.clients.find_one(
                {"id": client_id},
                {"_id": 0, "company_name": 1, "phone": 1, "email": 1},
            )
            visit["client_info"] = client or {}
        except Exception:
            visit["client_info"] = {}
    else:
        visit["client_info"] = {}

    return visit


# ── 13. UPDATE — PARAMETERISED, AFTER all static routes ──────────────────────
@router.patch("/{visit_id}")
async def update_visit(
    visit_id: str,
    data: VisitUpdate,
    current_user: User = Depends(get_current_user),
):
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(404, f"Visit not found: id={visit_id}")
    if not _can_write_visit(current_user, visit.get("assigned_to", "")):
        raise HTTPException(403, "Not authorised to edit this visit")

    # If date is changing, run duplicate check (excluding self)
    new_date = data.visit_date
    if new_date and new_date != visit.get("visit_date"):
        dup = await _check_duplicate(
            visit["client_id"], visit["assigned_to"], new_date, exclude_id=visit_id
        )
        if dup:
            raise HTTPException(
                409,
                f"A visit for this client on {new_date} already exists "
                f"(id={dup['id']}, status={dup.get('status', 'scheduled')}). "
                "Choose a different date or cancel the existing visit first."
            )

    payload = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.visits.update_one({"id": visit_id}, {"$set": payload})
    updated = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    return updated


# ── 14. DELETE — PARAMETERISED, LAST — v3 FIX ────────────────────────────────
@router.delete("/{visit_id}")
async def delete_visit(
    visit_id: str,
    delete_recurrences: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    """
    v3 FIX — The previous delete was returning 404 because:
    1. The frontend was calling DELETE /visits/<id> but the visit document
       wasn't always found by the 'id' string field (vs MongoDB _id).
    2. We now do a two-pass lookup: first by the custom 'id' field, and if
       that fails we try to match against the stringified MongoDB _id.

    If the visit genuinely doesn't exist after both passes we return 404
    with a clear message so the frontend can show a useful error rather
    than a raw network failure.
    """
    # Pass 1 — look up by our custom uuid string field
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})

    if not visit:
        # Pass 2 — attempt MongoDB _id lookup (in case id field is missing)
        from bson import ObjectId
        try:
            oid   = ObjectId(visit_id)
            visit = await db.visits.find_one({"_id": oid})
            if visit:
                # Normalise — treat the _id as the effective id for deletion
                visit_id = str(visit.get("id", visit_id))
                visit.pop("_id", None)
        except Exception:
            pass

    if not visit:
        raise HTTPException(
            404,
            f"Visit not found (id={visit_id}). It may have already been deleted."
        )

    if not _can_write_visit(current_user, visit.get("assigned_to", "")):
        raise HTTPException(403, "Not authorised to delete this visit")

    deleted_count = 0

    # Delete the visit itself (match on custom id field OR fallback)
    result = await db.visits.delete_one({"id": visit_id})
    if result.deleted_count == 0:
        # Fallback: delete by MongoDB _id string if custom id field is missing
        from bson import ObjectId
        try:
            result = await db.visits.delete_one({"_id": ObjectId(visit_id)})
        except Exception:
            pass
    deleted_count += result.deleted_count if result else 0

    # Optionally cascade-delete all child recurrence visits
    if delete_recurrences and visit.get("parent_visit_id") is None:
        recurrence_result = await db.visits.delete_many({"parent_visit_id": visit_id})
        deleted_count += recurrence_result.deleted_count

    logger.info(
        f"delete_visit: id={visit_id} deleted={deleted_count} "
        f"cascade={delete_recurrences} by={current_user.id}"
    )

    return {
        "message":       f"Deleted {deleted_count} visit(s) successfully",
        "deleted_count": deleted_count,
        "visit_id":      visit_id,
    }
