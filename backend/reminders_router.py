"""
reminders_router.py
───────────────────────────────────────────────────────────────
FastAPI router for Reminders & Meetings.
Add this to your main server:
    from reminders_router import router as reminders_router
    app.include_router(reminders_router)

Assumes:
  - MongoDB (motor) with a "reminders" collection
  - Your existing `get_current_user` dependency for JWT auth
  - Your existing `get_current_user_admin` for admin-level checks
  - Adjust imports to match YOUR project structure
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo
from bson import ObjectId

# ─── ADJUST THESE IMPORTS TO MATCH YOUR PROJECT ──────────────────────────────
# from app.auth import get_current_user          # your JWT dependency
# from app.database import db                     # your motor database instance
# Example placeholders (replace with your actual imports):
from backend.dependencies import get_current_user, db
from backend.models import User

router = APIRouter()

IST = ZoneInfo("Asia/Kolkata")

# ─── Collections ──────────────────────────────────────────────────────────────
reminders_col = db["reminders"]
reminder_settings_col = db["reminder_settings"]
reminder_fires_col = db["reminder_fires"]  # dedupe log for daily / visit popups

# Universal popup time — always fires for every user, every day, regardless
# of their personal settings.
UNIVERSAL_POPUP_TIME = "11:00"


# ─── Pydantic Models ─────────────────────────────────────────────────────────
class ReminderCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    remind_at: str  # ISO datetime string
    event_id: Optional[str] = None
    source: Optional[str] = "manual"
    priority: Optional[str] = "medium"  # low, medium, high
    reminder_type: Optional[str] = "reminder"  # reminder, meeting
    related_task_id: Optional[str] = None


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    remind_at: Optional[str] = None
    is_dismissed: Optional[bool] = None
    priority: Optional[str] = None
    reminder_type: Optional[str] = None
    status: Optional[str] = None
    # Trademark Hearing outcome fields
    brand_name: Optional[str] = None
    hearing_attended: Optional[str] = None   # "yes" | "no"
    hearing_decision: Optional[str] = None   # "favourable" | "unfavourable"
    hearing_adjourned: Optional[bool] = None
    hearing_notes: Optional[str] = None


class ReminderSettings(BaseModel):
    """Per-user popup reminder preferences.

    `custom_times` are extra times (besides the fixed 11:00 AM universal
    popup) the user wants to be shown a daily summary popup, e.g. ["09:00","17:30"].
    `enabled` lets a user turn off the popup entirely (the universal 11:00
    reminder still respects this flag).
    """
    custom_times: Optional[List[str]] = Field(default_factory=list)  # "HH:MM" 24h strings
    enabled: Optional[bool] = True


# ─── Helpers ──────────────────────────────────────────────────────────────────
def serialize_reminder(doc: dict) -> dict:
    """Convert MongoDB document to JSON-safe dict."""
    if not doc:
        return doc
    doc["_id"] = str(doc["_id"])
    doc["id"] = doc["_id"]
    return doc


# ─── GET /api/email/reminders ────────────────────────────────────────────────
@router.get("/email/reminders")
async def get_reminders(
    user_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch reminders for the current user.
    Admin can pass ?user_id=<id> to view another user's reminders.
    """
    query_uid = current_user.id

    # If admin requests another user's reminders
    if user_id and current_user.role == "admin":
        query_uid = user_id

    cursor = reminders_col.find({
        "user_id": str(query_uid),
        "$or": [
            {"is_dismissed": {"$ne": True}},
            {"is_dismissed": {"$exists": False}},
        ],
    }).sort("remind_at", 1)

    results = []
    async for doc in cursor:
        results.append(serialize_reminder(doc))

    return results


# ─── POST /api/email/save-as-reminder ────────────────────────────────────────
@router.post("/email/save-as-reminder")
async def create_reminder(
    body: ReminderCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new reminder."""
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "user_id": str(current_user.id),
        "title": body.title,
        "description": body.description or "",
        "remind_at": body.remind_at,
        "event_id": body.event_id or f"manual-{int(datetime.now().timestamp() * 1000)}",
        "source": body.source or "manual",
        "priority": body.priority or "medium",
        "reminder_type": body.reminder_type or "reminder",
        "related_task_id": body.related_task_id,
        "is_dismissed": False,
        "is_fired": False,
        "created_at": now,
        "updated_at": now,
    }

    result = await reminders_col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc["id"] = doc["_id"]

    return doc


# ─── PATCH /api/email/reminders/{reminder_id} ────────────────────────────────
@router.patch("/email/reminders/{reminder_id}")
async def update_reminder(
    reminder_id: str,
    body: ReminderUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update a reminder (title, description, remind_at, is_dismissed, etc.)."""
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID")

    # Build update dict from explicitly-set fields.
    # For boolean hearing fields (e.g. hearing_adjourned=False) and string fields
    # that may be intentionally set to empty (""), we must NOT skip them — only
    # skip fields that were never sent (excluded by exclude_unset=True).
    ALLOW_FALSY_FIELDS = {
        "hearing_adjourned", "hearing_attended", "hearing_decision",
        "hearing_notes", "brand_name",
    }
    update_fields = {}
    for field, value in body.dict(exclude_unset=True).items():
        if value is not None or field in ALLOW_FALSY_FIELDS:
            update_fields[field] = value

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Verify ownership (admin can update any)
    query = {"_id": obj_id}
    if current_user.role != "admin":
        query["user_id"] = str(current_user.id)

    result = await reminders_col.update_one(query, {"$set": update_fields})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")

    updated = await reminders_col.find_one({"_id": obj_id})
    return serialize_reminder(updated)


# ─── DELETE /api/email/reminders/{reminder_id} ───────────────────────────────
@router.delete("/email/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a reminder permanently."""
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID")

    # Verify ownership (admin can delete any)
    query = {"_id": obj_id}
    if current_user.role != "admin":
        query["user_id"] = str(current_user.id)

    result = await reminders_col.delete_one(query)

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {"message": "Reminder deleted", "id": reminder_id}


# ════════════════════════════════════════════════════════════════════════════
# POPUP SYSTEM
# ────────────────────────────────────────────────────────────────────────────
# Three kinds of popups can appear on ANY page of the app for a logged-in
# user:
#   1. Manual / scheduled reminders the user (or admin) created — including
#      "New Task Assigned" popups, which are inserted the instant a task is
#      assigned (remind_at = now, so they fire on the very next poll).
#   2. Daily summary popups — the UNIVERSAL 11:00 AM popup (always on, every
#      user, every day) plus any extra times the user configured in
#      Reminder Settings.
#   3. Visit popups — fired at 11:00 AM on the day a visit is scheduled, for
#      the specific user assigned to that visit.
#
# The frontend polls GET /reminders/due-popups every ~30s. Anything this
# endpoint returns should be shown as a popup immediately; calling it also
# marks those items as fired so they are not shown again.
# ════════════════════════════════════════════════════════════════════════════


@router.get("/reminders/settings")
async def get_reminder_settings(current_user: User = Depends(get_current_user)):
    """Get this user's popup reminder preferences."""
    doc = await reminder_settings_col.find_one({"user_id": str(current_user.id)})
    if not doc:
        return {
            "user_id": str(current_user.id),
            "custom_times": [],
            "enabled": True,
            "universal_time": UNIVERSAL_POPUP_TIME,
        }
    return {
        "user_id": str(current_user.id),
        "custom_times": doc.get("custom_times", []),
        "enabled": doc.get("enabled", True),
        "universal_time": UNIVERSAL_POPUP_TIME,
    }


@router.put("/reminders/settings")
async def update_reminder_settings(
    body: ReminderSettings,
    current_user: User = Depends(get_current_user),
):
    """Update this user's popup reminder preferences (custom popup times)."""
    # Validate HH:MM format, dedupe, drop the universal time if duplicated
    clean_times = []
    for t in body.custom_times or []:
        t = (t or "").strip()
        try:
            hh, mm = t.split(":")
            hh, mm = int(hh), int(mm)
            assert 0 <= hh <= 23 and 0 <= mm <= 59
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid time format: '{t}' (expected HH:MM)")
        norm = f"{hh:02d}:{mm:02d}"
        if norm != UNIVERSAL_POPUP_TIME and norm not in clean_times:
            clean_times.append(norm)

    now = datetime.now(timezone.utc).isoformat()
    await reminder_settings_col.update_one(
        {"user_id": str(current_user.id)},
        {
            "$set": {
                "user_id": str(current_user.id),
                "custom_times": clean_times,
                "enabled": body.enabled if body.enabled is not None else True,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    return {
        "user_id": str(current_user.id),
        "custom_times": clean_times,
        "enabled": body.enabled if body.enabled is not None else True,
        "universal_time": UNIVERSAL_POPUP_TIME,
    }


async def _already_fired(key: str) -> bool:
    return bool(await reminder_fires_col.find_one({"key": key}))


async def _mark_fired(key: str, user_id: str, popup_type: str):
    try:
        await reminder_fires_col.insert_one({
            "key": key,
            "user_id": user_id,
            "type": popup_type,
            "fired_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # duplicate key race — fine, it just means another request beat us to it


@router.get("/reminders/due-popups")
async def get_due_popups(current_user: User = Depends(get_current_user)):
    """
    Returns every popup that should be shown to the current user RIGHT NOW,
    across every page of the app. Marks each one as fired so it won't repeat.
    """
    uid = str(current_user.id)
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(IST)
    today_str = now_ist.date().isoformat()
    popups: List[dict] = []

    # ── 1. Manual reminders (incl. instant "New Task Assigned" popups) ─────
    cursor = reminders_col.find({
        "user_id": uid,
        "is_fired": {"$ne": True},
        "$or": [
            {"is_dismissed": {"$ne": True}},
            {"is_dismissed": {"$exists": False}},
        ],
    })
    due_ids = []
    async for doc in cursor:
        try:
            remind_at = datetime.fromisoformat(str(doc["remind_at"]).replace("Z", "+00:00"))
            if remind_at.tzinfo is None:
                remind_at = remind_at.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if remind_at <= now_utc:
            popups.append({
                "id": str(doc["_id"]),
                "type": doc.get("reminder_type", "reminder"),
                "title": doc.get("title", "Reminder"),
                "message": doc.get("description", ""),
                "priority": doc.get("priority", "medium"),
                "source": doc.get("source", "manual"),
            })
            due_ids.append(doc["_id"])
    if due_ids:
        await reminders_col.update_many(
            {"_id": {"$in": due_ids}},
            {"$set": {"is_fired": True, "fired_at": now_utc.isoformat()}},
        )

    # ── 2. Daily summary popups (universal 11:00 AM + user custom times) ───
    settings = await reminder_settings_col.find_one({"user_id": uid}) or {}
    settings_enabled = settings.get("enabled", True)
    custom_times = settings.get("custom_times", []) if settings_enabled else []
    daily_times = [UNIVERSAL_POPUP_TIME] + [t for t in custom_times if t != UNIVERSAL_POPUP_TIME]

    cur_hhmm = now_ist.strftime("%H:%M")
    for t in daily_times:
        if cur_hhmm < t:
            continue  # that time hasn't arrived yet today
        fire_key = f"daily-{uid}-{today_str}-{t}"
        if await _already_fired(fire_key):
            continue

        # Build a quick summary of what's relevant today for this user
        hearings_today = await reminders_col.count_documents({
            "user_id": uid,
            "reminder_type": "meeting",
        })
        visits_today = await db.visits.count_documents({
            "assigned_to": uid,
            "visit_date": today_str,
            "status": "scheduled",
        })
        tasks_due_today = await db.tasks.count_documents({
            "assigned_to": uid,
            "status": {"$nin": ["completed", "cancelled"]},
        })

        is_universal = t == UNIVERSAL_POPUP_TIME
        popups.append({
            "id": fire_key,
            "type": "daily_summary",
            "title": "Daily Reminder" if is_universal else f"Reminder ({t})",
            "message": (
                f"You have {visits_today} visit(s) scheduled today and "
                f"{tasks_due_today} open task(s)."
            ),
            "priority": "medium",
            "source": "daily",
        })
        await _mark_fired(fire_key, uid, "daily_summary")

    # ── 3. Visit popups — fire at 11:00 AM IST on the scheduled day ────────
    if cur_hhmm >= UNIVERSAL_POPUP_TIME:
        visits_cursor = db.visits.find({
            "assigned_to": uid,
            "visit_date": today_str,
            "status": "scheduled",
        })
        async for v in visits_cursor:
            vid = v.get("id") or str(v.get("_id"))
            fire_key = f"visit-{vid}-{today_str}"
            if await _already_fired(fire_key):
                continue
            popups.append({
                "id": fire_key,
                "type": "visit",
                "title": "Client Visit Today",
                "message": (
                    f"You have a visit scheduled today with "
                    f"{v.get('client_name') or 'a client'}"
                    + (f" at {v.get('visit_time')}" if v.get("visit_time") else "")
                    + (f" — {v.get('purpose')}" if v.get("purpose") else "")
                    + "."
                ),
                "priority": v.get("priority", "medium"),
                "source": "visit",
            })
            await _mark_fired(fire_key, uid, "visit")

    return popups
