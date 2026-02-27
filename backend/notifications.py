from fastapi import APIRouter, Depends
from datetime import datetime
from bson import ObjectId
from database import db  # adjust if your db import is different
from auth import get_current_user  # adjust if different

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
async def get_notifications(current_user=Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": current_user["id"]}
    ).sort("created_at", -1).to_list(100)

    for n in notifications:
        n["id"] = str(n["_id"])
        del n["_id"]

    return notifications


@router.put("/{notification_id}/read")
async def mark_as_read(notification_id: str, current_user=Depends(get_current_user)):
    await db.notifications.update_one(
        {
            "_id": ObjectId(notification_id),
            "user_id": current_user["id"]
        },
        {"$set": {"is_read": True}}
    )

    return {"message": "Marked as read"}


async def create_notification(user_id: str, title: str, message: str):
    await db.notifications.insert_one({
        "user_id": user_id,
        "title": title,
        "message": message,
        "is_read": False,
        "created_at": datetime.utcnow()
    })
