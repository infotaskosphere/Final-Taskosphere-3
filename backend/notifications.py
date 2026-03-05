from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging

from backend.dependencies import db, get_current_user, require_admin, _get_perm
from pydantic import BaseModel, Field, ConfigDict
from backend.dependencies import safe_dt
from backend.models import User

logger = logging.getLogger(__name__)


# ====================== MODELS ======================

class NotificationBase(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Prevents crashes on schema drift
    title: str
    message: str
    type: str = "system"  # task | dsc | system | lead


class Notification(NotificationBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    is_read: bool = False
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


# ====================== ADMIN SEND MODEL ======================

class AdminNotificationRequest(BaseModel):
    title: str
    message: str
    type: str = "system"
    user_id: Optional[str] = None
    broadcast: bool = False


# ====================== STABILITY HELPERS ======================

def normalize_notification(doc: dict) -> dict:
    """Standardises MongoDB data to prevent Pydantic 500 errors."""
    if not doc:
        return doc

    # Ensure ID consistency (handle both 'id' and '_id')
    if "_id" in doc and "id" not in doc:
        doc["id"] = str(doc["_id"])

    # Safe datetime normalisation
    doc["created_at"] = safe_dt(doc.get("created_at"))

    return doc


# ====================== ROUTER ======================

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ====================== INTERNAL LOGIC ======================

async def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str = "system"
) -> Optional[Notification]:
    """
    Internal utility used by other modules to trigger alert notifications.
    Does NOT enforce permissions — callers are responsible for scoping correctly.
    Returns the Notification object, or None on failure.
    """
    try:
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type
        )
        doc = notification.model_dump()
        # Store as naive UTC datetime (MongoDB friendly)
        doc["created_at"] = datetime.now(timezone.utc)

        await db.notifications.insert_one(doc)
        return notification
    except Exception as e:
        logger.error(f"Failed to create notification for {user_id}: {str(e)}")
        return None


# ====================== ADMIN: SEND NOTIFICATION ======================

@router.post("/send")
async def send_notification(
    payload: AdminNotificationRequest,
    current_user: User = Depends(require_admin())
):
    """
    Admin-only endpoint to send notifications.
    Matrix: Admin only (require_admin dependency enforces this).

    Supports:
      • Single-user notification  → provide user_id
      • Broadcast to all users    → set broadcast=true
    """
    now = datetime.now(timezone.utc)

    # ── BROADCAST ──────────────────────────────────────────
    if payload.broadcast:
        users = await db.users.find({}, {"id": 1}).to_list(length=5000)

        if not users:
            return {"status": "success", "message": "No users found to broadcast to"}

        notifications = [
            {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "title": payload.title,
                "message": payload.message,
                "type": payload.type,
                "is_read": False,
                "created_at": now
            }
            for user in users
        ]

        if notifications:
            await db.notifications.insert_many(notifications)

        return {
            "status": "success",
            "message": f"Notification broadcasted to {len(notifications)} users"
        }

    # ── SINGLE USER ─────────────────────────────────────────
    if payload.user_id:
        result = await create_notification(
            user_id=payload.user_id,
            title=payload.title,
            message=payload.message,
            type=payload.type
        )

        if result:
            return {"status": "success", "message": "Notification sent"}
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to create notification"
            )

    raise HTTPException(
        status_code=400,
        detail="Provide user_id or set broadcast=true"
    )


# ====================== USER: FETCH OWN NOTIFICATIONS ======================

@router.get("/", response_model=List[Notification])
async def get_my_notifications(
    current_user: User = Depends(get_current_user)
):
    """
    Fetches the current user's notifications, sorted newest first.
    Matrix: Ownership — users only see their own notifications.
    """
    cursor = db.notifications.find(
        {"user_id": current_user.id},
        {"_id": 0}
    )
    notifications_raw = await cursor.sort("created_at", -1).to_list(500)

    return [normalize_notification(n) for n in notifications_raw]


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user)
):
    """
    Lightweight endpoint for navbar unread badge count.
    Matrix: Ownership — own notifications only.
    """
    count = await db.notifications.count_documents({
        "user_id": current_user.id,
        "is_read": False
    })
    return {"unread_count": count}


# ====================== USER: MARK AS READ ======================

@router.put("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user)
):
    """
    Marks ALL of the current user's unread notifications as read.
    Matrix: Ownership — only own notifications.
    """
    await db.notifications.update_many(
        {
            "user_id": current_user.id,
            "is_read": False
        },
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Marks a single notification as read.
    Matrix: Ownership — user_id must match to prevent cross-user access.
    """
    result = await db.notifications.update_one(
        {
            "id": notification_id,
            "user_id": current_user.id   # ownership enforced here
        },
        {"$set": {"is_read": True}}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    return {"message": "Notification marked as read"}


# ====================== USER: DELETE NOTIFICATION ======================

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Deletes a notification.
    Matrix: Ownership — user_id must match; cannot delete other users' notifications.
    """
    result = await db.notifications.delete_one({
        "id": notification_id,
        "user_id": current_user.id   # ownership enforced here
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    return {"message": "Notification removed"}
