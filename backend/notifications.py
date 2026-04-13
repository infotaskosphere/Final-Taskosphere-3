""" 
notifications.py
================
Full notification router + internal event helpers.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging

from backend.dependencies import db, get_current_user, require_admin
from pydantic import BaseModel, Field, ConfigDict
from backend.models import User

logger = logging.getLogger(__name__)


# ====================== HELPERS ======================

def safe_dt(value):
    if not value:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


# ====================== PYDANTIC MODELS ======================

class NotificationBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = Field(min_length=1)
    message: str = Field(min_length=1)
    type: str = "system"


class Notification(NotificationBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    is_read: bool = False
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class AdminNotificationRequest(BaseModel):
    title: str = Field(min_length=1)
    message: str = Field(min_length=1)
    type: str = "system"
    user_id: Optional[str] = None
    broadcast: bool = False


# ====================== STABILITY HELPERS ======================

def normalize_notification(doc: dict) -> dict:
    if not doc:
        return doc
    if "_id" in doc and "id" not in doc:
        doc["id"] = str(doc["_id"])
    doc.pop("_id", None)
    doc["created_at"] = safe_dt(doc.get("created_at"))
    return doc


# ====================== ROUTER ======================

router = APIRouter(prefix="/notifications", tags=["Notifications"])


async def create_notification_indexes():
    try:
        await db.notifications.create_index("user_id")
        await db.notifications.create_index("is_read")
        await db.notifications.create_index("created_at")
    except Exception as e:
        logger.error(f"Index creation failed: {e}")


# ====================== INTERNAL UTILITY ======================

async def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str = "system",
) -> Optional[Notification]:
    try:
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
        )
        doc = notification.model_dump()
        doc["created_at"] = datetime.now(timezone.utc)
        result = await db.notifications.insert_one(doc)
        if not result.inserted_id:
            raise Exception("Insert failed")
        doc.pop("_id", None)
        return notification
    except Exception as e:
        logger.error(f"[Notification] Failed to create for user {user_id}: {e}")
        return None


async def _get_admin_user_ids() -> List[str]:
    admins = await db.users.find(
        {"role": "admin"},
        {"id": 1, "_id": 0},
    ).to_list(length=500)
    return [u["id"] for u in admins if "id" in u]


async def _get_permitted_user_ids() -> List[str]:
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
    admin_ids = await _get_admin_user_ids()
    permitted_ids = await _get_permitted_user_ids()

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
        if docs:
            await db.notifications.insert_many(docs, ordered=False)
    except Exception as e:
        logger.error(f"[Notification] bulk insert failed: {e}")


# ====================== EVENT HELPERS ======================

def _role_value(user: User) -> str:
    role = user.role
    return role.value if hasattr(role, "value") else str(role)


async def on_task_status_changed(
    task_id: str,
    task_title: str,
    new_status: str,
    changed_by_user: User,
) -> None:
    exclude = changed_by_user.id if _role_value(changed_by_user) == "admin" else None
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
    is_admin_assigning = _role_value(assigned_by_user) == "admin"

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
    if _role_value(created_by_user) == "admin":
        return

    await notify_admins_and_permitted(
        title="New Todo Created",
        message=(
            f'{created_by_user.full_name or created_by_user.email} '
            f'created a new todo: "{todo_title}".'
        ),
        type="todo",
        exclude_user_id=created_by_user.id,
    )


async def on_todo_completed(
    todo_title: str,
    completed_by_user: User,
) -> None:
    if _role_value(completed_by_user) == "admin":
        return

    await notify_admins_and_permitted(
        title="Todo Completed",
        message=(
            f'{completed_by_user.full_name or completed_by_user.email} '
            f'completed todo: "{todo_title}".'
        ),
        type="todo",
        exclude_user_id=completed_by_user.id,
    )


# ====================== SEND NOTIFICATION ======================
# Accessible by any logged-in user (not admin-only)
# so that todos, tasks etc. can call it from frontend onSuccess.

@router.post("/send")
async def send_notification(
    payload: AdminNotificationRequest,
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)

    # ── BROADCAST — admin only ─────────────────────────────────────────────
    if payload.broadcast:
        # Only admins can broadcast
        if _role_value(current_user) != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can broadcast notifications.",
            )

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
            await db.notifications.insert_many(docs, ordered=False)

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create notification",
        )

    # ── SELF NOTIFICATION (no user_id, no broadcast) ───────────────────────
    # This handles frontend calls from todos/tasks onSuccess
    result = await create_notification(
        user_id=current_user.id,
        title=payload.title,
        message=payload.message,
        type=payload.type,
    )
    if result:
        return {"status": "success", "message": "Notification sent"}
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to create notification",
    )


# ====================== GET NOTIFICATIONS ======================

@router.get("", response_model=List[Notification])
async def get_my_notifications(
    current_user: User = Depends(get_current_user),
    limit: int = 100,
    skip: int = 0,
    unread_only: bool = False,
):
    query: dict = {"user_id": current_user.id}
    if unread_only:
        query["is_read"] = False

    raw = await db.notifications.find(query, {"_id": 0}) \
        .sort("created_at", -1) \
        .skip(skip) \
        .limit(limit) \
        .to_list(length=limit)

    return [normalize_notification(n) for n in raw]


# ── Unread count ──────────────────────────────────────────────────────────────

@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
):
    try:
        count = await db.notifications.count_documents(
            {"user_id": current_user.id, "is_read": False}
        )
        return {"count": int(count or 0)}
    except Exception as e:
        logger.error(f"[Notification] unread-count error: {e}")
        return {"count": 0}


# NOTE: /read-all and /clear-all MUST be declared BEFORE /{notification_id}
# to prevent FastAPI treating them as path parameters.

@router.patch("/read-all")
@router.put("/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
):
    await db.notifications.update_many(
        {"user_id": current_user.id, "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"message": "All notifications marked as read"}


@router.delete("/clear-all")
async def clear_all_notifications(
    current_user: User = Depends(get_current_user),
):
    await db.notifications.delete_many({"user_id": current_user.id})
    return {"message": "All notifications cleared"}


@router.patch("/{notification_id}/read")
@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user.id},
        {"$set": {"is_read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Notification not found or not authorized",
        )
    return {"message": "Notification marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    result = await db.notifications.delete_one(
        {"id": notification_id, "user_id": current_user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Notification not found or not authorized",
        )
    return {"message": "Notification deleted"}
