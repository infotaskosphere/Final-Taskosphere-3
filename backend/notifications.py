@router.get("", response_model=List[Notification])
async def get_my_notifications(
    current_user = Depends(get_current_user)
):
    # ✅ FIXED: Use current_user["id"] (the UUID string)
    notifications = await db.notifications.find(
        {"user_id": current_user["id"]}, 
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
    # ✅ FIXED: Use current_user["id"]
    count = await db.notifications.count_documents({
        "user_id": current_user["id"],
        "is_read": False
    })

    return {"unread_count": count}


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user = Depends(get_current_user)
):
    # ✅ FIXED: Use current_user["id"]
    result = await db.notifications.update_one(
        {
            "id": notification_id,
            "user_id": current_user["id"]
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
    # ✅ FIXED: Use current_user["id"]
    await db.notifications.update_many(
        {
            "user_id": current_user["id"],
            "is_read": False
        },
        {"$set": {"is_read": True}}
    )

    return {"message": "All notifications marked as read"}
