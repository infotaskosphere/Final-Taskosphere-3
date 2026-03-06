"""
notifications.py
================
Full notification router + internal event helpers.

Notification visibility rules (enforced here and in notification_events.py):
  • Admin          → always receives ALL system/task/todo/dsc/lead notifications
  • Specific users → receive task/todo notifications only if their permissions
                     include  can_receive_task_notifications = True
                     (add this flag to UserPermissions in models.py — see NOTE below)
  • Notification owners → always see their own notifications (ownership layer)

NOTE: Add the following field to UserPermissions in models.py:
    can_receive_task_notifications: bool = False

And add it to DEFAULT_ROLE_PERMISSIONS:
    admin   → True
    manager → False   (admin can toggle per-user)
    staff   → False   (admin can toggle per-user)
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging

from backend.dependencies import db, get_current_user, require_admin, _get_perm
from pydantic import BaseModel, Field, ConfigDict
from backend.dependencies import safe_dt
from backend.models import User

logger = logging.getLogger(__name__)


# ====================== PYDANTIC MODELS ======================

class NotificationBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    message: str
    type: str = "system"   # task | todo | dsc | system | lead


class Notification(NotificationBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    is_read: bool = False
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class AdminNotificationRequest(BaseModel):
    title: str
    message: str
    type: str = "system"
    user_id: Optional[str] = None
    broadcast: bool = False


# ====================== STABILITY HELPERS ======================

def normalize_notification(doc: dict) -> dict:
    """Standardises MongoDB document to prevent Pydantic 500 errors."""
    if not doc:
        return doc
    if "_id" in doc and "id" not in doc:
        doc["id"] = str(doc["_id"])
    doc["created_at"] = safe_dt(doc.get("created_at"))
    return doc


# ====================== ROUTER ======================

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ====================== INTERNAL UTILITY ======================

async def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str = "system",
) -> Optional[Notification]:
    """
    Low-level helper — inserts a single notification for one user.
    Does NOT check permissions. Callers must decide who to notify.
    Returns the Notification object or None on failure.
    """
    try:
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
        )
        doc = notification.model_dump()
        doc["created_at"] = datetime.now(timezone.utc)
        await db.notifications.insert_one(doc)
        return notification
    except Exception as e:
        logger.error(f"[Notification] Failed to create for user {user_id}: {e}")
        return None


async def _get_admin_user_ids() -> List[str]:
    """Returns all user IDs whose role is 'admin'."""
    admins = await db.users.find(
        {"role": "admin"},
        {"id": 1, "_id": 0},
    ).to_list(length=500)
    return [u["id"] for u in admins if "id" in u]


async def _get_permitted_user_ids() -> List[str]:
    """
    Returns user IDs (non-admin) who have can_receive_task_notifications = True.
    These users receive task/todo event notifications alongside admins.
    """
    permitted = await db.users.find(
        {
            "role": {"$ne": "admin"},
            "permissions.can_receive_task_notifications": True,
            "is_active": True,
        },
        {"id": 1, "_id": 0},
    ).to_list(length=500)
    return [u["id"] for u in permitted if "id" in u]


async def notify_admins_and_permitted(
    title: str,
    message: str,
    type: str = "task",
    exclude_user_id: Optional[str] = None,
) -> None:
    """
    Fires a notification to:
      • All admin users
      • All non-admin users who have can_receive_task_notifications = True

    Pass exclude_user_id to avoid notifying the actor themselves
    (e.g. don't notify an admin who created a task about their own action).
    """
    admin_ids = await _get_admin_user_ids()
    permitted_ids = await _get_permitted_user_ids()

    # Merge, deduplicate, exclude actor
    recipient_ids = list(
        {uid for uid in (admin_ids + permitted_ids) if uid != exclude_user_id}
    )

    if not recipient_ids:
        return

    now = datetime.now(timezone.utc)
    docs = [
        {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": title,
            "message": message,
            "type": type,
            "is_read": False,
            "created_at": now,
        }
        for uid in recipient_ids
    ]

    try:
        await db.notifications.insert_many(docs)
    except Exception as e:
        logger.error(f"[Notification] bulk insert failed: {e}")


# ====================== EVENT HELPERS ======================
# Import and call these from your tasks / todos routers.

async def on_task_status_changed(
    task_id: str,
    task_title: str,
    new_status: str,
    changed_by_user: User,
) -> None:
    """
    Call this whenever a task's status is updated.
    Notifies admins + permitted users (excludes the actor if they are admin).
    """
    exclude = changed_by_user.id if changed_by_user.role.value == "admin" else None
    await notify_admins_and_permitted(
        title="Task Status Updated",
        message=(
            f'Task "{task_title}" was marked as '
            f'"{new_status}" by {changed_by_user.full_name or changed_by_user.email}.'
        ),
        type="task",
        exclude_user_id=exclude,
    )


async def on_task_completed(
    task_id: str,
    task_title: str,
    completed_by_user: User,
) -> None:
    """
    Call this when a task reaches 'completed' status specifically.
    Wrapper around on_task_status_changed for clarity.
    """
    await on_task_status_changed(
        task_id=task_id,
        task_title=task_title,
        new_status="completed",
        changed_by_user=completed_by_user,
    )


async def on_task_assigned(
    task_id: str,
    task_title: str,
    assigned_to_user_id: str,
    assigned_by_user: User,
) -> None:
    """
    Call this when a NON-ADMIN user assigns a task.
    Admin self-assignments are excluded from generating a notification.

    Also sends a personal notification to the assignee.
    """
    is_admin_assigning = assigned_by_user.role.value == "admin"

    # Notify admins + permitted users only when a non-admin triggers assignment
    if not is_admin_assigning:
        await notify_admins_and_permitted(
            title="Task Assigned by Staff/Manager",
            message=(
                f'{assigned_by_user.full_name or assigned_by_user.email} assigned '
                f'task "{task_title}" to a team member.'
            ),
            type="task",
            exclude_user_id=assigned_by_user.id,
        )

    # Always notify the assignee personally (unless they assigned it to themselves)
    if assigned_to_user_id != assigned_by_user.id:
        await create_notification(
            user_id=assigned_to_user_id,
            title="New Task Assigned",
            message=(
                f'You have been assigned the task "{task_title}" '
                f'by {assigned_by_user.full_name or assigned_by_user.email}.'
            ),
            type="task",
        )


async def on_todo_created(
    todo_title: str,
    created_by_user: User,
) -> None:
    """
    Call this when any user creates a todo.
    Notifies admins + permitted users (non-admin creator triggers the alert).
    Admin-created todos do NOT generate an alert (avoids self-spam).
    """
    if created_by_user.role.value == "admin":
        return  # Admins creating todos don't need to alert themselves

    await notify_admins_and_permitted(
        title="New Todo Created",
        message=(
            f'{created_by_user.full_name or created_by_user.email} '
            f'created a new todo: "{todo_title}".'
        ),
        type="todo",
        exclude_user_id=created_by_user.id,
    )


# ====================== ADMIN: SEND NOTIFICATION ======================

@router.post("/send")
async def send_notification(
    payload: AdminNotificationRequest,
    current_user: User = Depends(require_admin()),
):
    """
    Admin-only endpoint to manually send notifications.
    • Single-user  → provide user_id
    • Broadcast    → set broadcast=true (max 5 000 users)
    """
    now = datetime.now(timezone.utc)

    # ── BROADCAST ──────────────────────────────────────────────────────────
    if payload.broadcast:
        users = await db.users.find(
            {"is_active": True}, {"id": 1, "_id": 0}
        ).to_list(length=5000)

        if not users:
            return {"status": "success", "message": "No active users found"}

        docs = [
            {
                "id": str(uuid.uuid4()),
                "user_id": u["id"],
                "title": payload.title,
                "message": payload.message,
                "type": payload.type,
                "is_read": False,
                "created_at": now,
            }
            for u in users
            if "id" in u
        ]

        if docs:
            await db.notifications.insert_many(docs)

        return {
            "status": "success",
            "message": f"Broadcasted to {len(docs)} users",
        }

    # ── SINGLE USER ────────────────────────────────────────────────────────
    if payload.user_id:
        result = await create_notification(
            user_id=payload.user_id,
            title=payload.title,
            message=payload.message,
            type=payload.type,
        )
        if result:
            return {"status": "success", "message": "Notification sent"}
        raise HTTPException(status_code=500, detail="Failed to create notification")

    raise HTTPException(
        status_code=400,
        detail="Provide user_id or set broadcast=true",
    )


# ====================== USER: FETCH OWN NOTIFICATIONS ======================

@router.get("/", response_model=List[Notification])
async def get_my_notifications(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the current user's own notifications, newest first.
    Ownership enforced — users only see their own records.
    """
    cursor = db.notifications.find(
        {"user_id": current_user.id},
        {"_id": 0},
    )
    raw = await cursor.sort("created_at", -1).to_list(500)
    return [normalize_notification(n) for n in raw]


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
):
    """Lightweight unread badge count for the navbar."""
    count = await db.notifications.count_documents({
        "user_id": current_user.id,
        "is_read": False,
    })
    return {"unread_count": count}


# ====================== USER: MARK AS READ ======================

@router.put("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
):
    """Marks ALL of the current user's unread notifications as read."""
    await db.notifications.update_many(
        {"user_id": current_user.id, "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"message": "All notifications marked as read"}


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    """Marks a single notification as read. Ownership enforced."""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user.id},
        {"$set": {"is_read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


# ====================== USER: DELETE NOTIFICATION ======================

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    """Deletes a notification. Ownership enforced — cannot delete others'."""
    result = await db.notifications.delete_one({
        "id": notification_id,
        "user_id": current_user.id,
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification removed"}


# ====================== ADMIN: VIEW ANY USER'S NOTIFICATIONS ======================

@router.get("/admin/user/{user_id}", response_model=List[Notification])
async def admin_get_user_notifications(
    user_id: str,
    current_user: User = Depends(require_admin()),
):
    """
    Admin-only: inspect any user's notification inbox.
    Useful for debugging notification delivery.
    """
    cursor = db.notifications.find(
        {"user_id": user_id},
        {"_id": 0},
    )
    raw = await cursor.sort("created_at", -1).to_list(200)
    return [normalize_notification(n) for n in raw]


@router.delete("/admin/clear/{user_id}")
async def admin_clear_user_notifications(
    user_id: str,
    current_user: User = Depends(require_admin()),
):
    """Admin-only: wipe all notifications for a specific user."""
    result = await db.notifications.delete_many({"user_id": user_id})
    return {"message": f"Deleted {result.deleted_count} notifications for user {user_id}"}
