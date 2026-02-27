from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId
from backend.dependencies import db, get_current_user

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)


# -----------------------------
# Get all notifications
# -----------------------------
@router.get("")
async def get_notifications(current_user = Depends(get_current_user)):

    notifications = await db.notifications.find(
        {"user_id": str(current_user["_id"])}
    ).sort("created_at", -1).to_list(100)

    for n in notifications:
        n["id"] = str(n["_id"])
        del n["_id"]

    return notifications


# -----------------------------
# Get unread count
# -----------------------------
@router.get("/unread-count")
async def get_unread_count(current_user = Depends(get_current_user)):

    count = await db.notifications.count_documents({
        "user_id": str(current_user["_id"]),
        "is_read": False
    })

    return {"count": count}


# -----------------------------
# Mark notification as read
# -----------------------------
@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user = Depends(get_current_user)
):

    result = await db.notifications.update_one(
        {
            "_id": ObjectId(notification_id),
            "user_id": str(current_user["_id"])
        },
        {"$set": {"is_read": True}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Marked as read"}


# -----------------------------
# Internal helper to create notification
# -----------------------------
async def create_notification(user_id: str, title: str, message: str):

    await db.notifications.insert_one({
        "user_id": str(user_id),  # MUST be string of Mongo _id
        "title": title,
        "message": message,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    })
