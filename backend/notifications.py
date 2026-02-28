from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List
import uuid

from backend.dependencies import db, get_current_user
from pydantic import BaseModel, Field, ConfigDict


# ==========================================================
# MODELS
# ==========================================================

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "system"  # task | dsc | system


class Notification(NotificationBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    is_read: bool = False
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


# ==========================================================
# ROUTER - DEFINED BEFORE ROUTES TO PREVENT NAMEERROR
# ==========================================================

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ==========================================================
# INTERNAL FUNCTION
# ==========================================================

async def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str = "system"
):
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type
    )

    doc = notification.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()

    await db.notifications.insert_one(doc)

    return notification


# ==========================================================
# ROUTES
# ==========================================================

@router.get("/", response_model=List[Notification])
async def get_my_notifications(
    current_user = Depends(get_current_user)
):
    # ✅ Use current_user.id to match UUID consistency fix
    notifications = await db.notifications.find(
        {"user_id": current_user.id}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    for n in notifications:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"])

    return [Notification(**n) for n in notifications]


@router.get("/unread-count")
async def get_unread_count(
    current_user = Depends(get_current_user)
):
    # ✅ Use current_user.id
    count = await db.notifications.count_documents({
        "user_id": current_user.id,
        "is_read": False
    })

    return {"unread_count": count}


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user = Depends(get_current_user)
):
    # ✅ Use current_user.id
    result = await db.notifications.update_one(
        {
            "id": notification_id,
            "user_id": current_user.id
        },
        {"$set": {"is_read": True}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Notification marked as read"}


@router.put("/read-all")
async def mark_all_read(
    current_user = Depends(get_current_user)
):
    # ✅ Use current_user.id
    await db.notifications.update_many(
        {
            "user_id": current_user.id,
            "is_read": False
        },
        {"$set": {"is_read": True}}
    )

    return {"message": "All notifications marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user = Depends(get_current_user)
):
    # ✅ Use current_user.id
    result = await db.notifications.delete_one(
        {
            "id": notification_id,
            "user_id": current_user.id
        }
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Notification deleted"}
