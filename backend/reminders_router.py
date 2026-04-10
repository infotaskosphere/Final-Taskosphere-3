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
from datetime import datetime, timezone
from bson import ObjectId

# ─── ADJUST THESE IMPORTS TO MATCH YOUR PROJECT ──────────────────────────────
# from app.auth import get_current_user          # your JWT dependency
# from app.database import db                     # your motor database instance
# Example placeholders (replace with your actual imports):
from backend.dependencies import get_current_user, db

router = APIRouter()

# ─── Collections ──────────────────────────────────────────────────────────────
reminders_col = db["reminders"]


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
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch reminders for the current user.
    Admin can pass ?user_id=<id> to view another user's reminders.
    """
    query_uid = current_user.id

    # If admin requests another user's reminders
    if user_id and current_user.get("role") == "admin":
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
):
    """Update a reminder (title, description, remind_at, is_dismissed, etc.)."""
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID")

    # Build update dict from non-None fields
    update_fields = {}
    for field, value in body.dict(exclude_unset=True).items():
        if value is not None:
            update_fields[field] = value

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Verify ownership (admin can update any)
    query = {"_id": obj_id}
    if current_user.get("role") != "admin":
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
    current_user: dict = Depends(get_current_user),
):
    """Delete a reminder permanently."""
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID")

    # Verify ownership (admin can delete any)
    query = {"_id": obj_id}
    if current_user.get("role") != "admin":
        query["user_id"] = str(current_user.id)

    result = await reminders_col.delete_one(query)

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {"message": "Reminder deleted", "id": reminder_id}
