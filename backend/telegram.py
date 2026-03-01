from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import os
import uuid
import requests

from backend.dependencies import check_permission

router = APIRouter(prefix="/telegram", tags=["Telegram"])

# =========================================================
# ENV CONFIG
# =========================================================

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not TELEGRAM_TOKEN:
    raise Exception("TELEGRAM_BOT_TOKEN not configured")

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

# Your admin email for first-time auto linking
ADMIN_EMAIL = "csmanthandesai@gmail.com"


# =========================================================
# MODELS
# =========================================================

class TelegramSendRequest(BaseModel):
    user_id: str
    message: str


class TelegramBroadcastRequest(BaseModel):
    message: str


# =========================================================
# HELPER: SEND TELEGRAM MESSAGE
# =========================================================

def send_telegram_message(chat_id: int, text: str):
    try:
        requests.post(
            f"{TELEGRAM_API}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": text
            },
            timeout=5
        )
    except Exception as e:
        print("Telegram send error:", e)


# =========================================================
# WEBHOOK
# =========================================================

@router.post("/webhook")
async def telegram_webhook(request: Request):
    from backend.server import db

    payload = await request.json()

    if "message" not in payload:
        return {"status": "ignored"}

    message = payload["message"]
    chat_id = message["chat"]["id"]
    text = message.get("text", "").strip()

    print("CHAT ID:", chat_id)

    # =====================================================
    # FIND USER BY TELEGRAM ID
    # =====================================================

    user = await db.users.find_one({"telegram_id": chat_id})

    # =====================================================
    # AUTO LINK IF NOT LINKED (FIRST TIME SETUP)
    # =====================================================

    if not user:
        user = await db.users.find_one({"email": ADMIN_EMAIL})

        if user:
            await db.users.update_one(
                {"email": ADMIN_EMAIL},
                {"$set": {"telegram_id": chat_id}}
            )

            user = await db.users.find_one({"telegram_id": chat_id})

            send_telegram_message(chat_id, "✅ Telegram linked successfully!")
        else:
            send_telegram_message(chat_id, "❌ No matching account found.")
            return {"status": "user_not_found"}

    # =====================================================
    # GET EXISTING CONVERSATION
    # =====================================================

    convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})

    # =====================================================
    # START COMMAND
    # =====================================================

    if text == "/start":
        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {
                "$set": {
                    "telegram_id": chat_id,
                    "user_id": user["id"],
                    "step": "title",
                    "data": {}
                }
            },
            upsert=True
        )

        send_telegram_message(chat_id, "📝 Let's create a new task.\n\nEnter Task Title:")
        return {"status": "started"}

    # =====================================================
    # NO ACTIVE CONVERSATION
    # =====================================================

    if not convo:
        send_telegram_message(chat_id, "Send /start to create a task.")
        return {"status": "no_conversation"}

    step = convo.get("step")
    data = convo.get("data", {})

    # =====================================================
    # STEP 1 — TITLE
    # =====================================================

    if step == "title":
        data["title"] = text

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "description", "data": data}}
        )

        send_telegram_message(chat_id, "Enter Task Description:")
        return {"status": "title_saved"}

    # =====================================================
    # STEP 2 — DESCRIPTION
    # =====================================================

    if step == "description":
        data["description"] = text

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "priority", "data": data}}
        )

        send_telegram_message(chat_id, "Enter Priority (low / medium / high):")
        return {"status": "description_saved"}

    # =====================================================
    # STEP 3 — PRIORITY
    # =====================================================

    if step == "priority":
        data["priority"] = text.lower()

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "due_date", "data": data}}
        )

        send_telegram_message(chat_id, "Enter Due Date (YYYY-MM-DD):")
        return {"status": "priority_saved"}

    # =====================================================
    # STEP 4 — DUE DATE & CREATE TASK
    # =====================================================

    if step == "due_date":
        try:
            due_date = datetime.fromisoformat(text)
        except:
            send_telegram_message(chat_id, "❌ Invalid date format. Use YYYY-MM-DD")
            return {"status": "invalid_date"}

        data["due_date"] = due_date.isoformat()

        now = datetime.now(timezone.utc)

        new_task = {
            "id": str(uuid.uuid4()),
            "title": data["title"],
            "description": data.get("description"),
            "assigned_to": user["id"],
            "sub_assignees": [],
            "priority": data.get("priority", "medium"),
            "status": "pending",
            "category": "other",
            "client_id": None,
            "is_recurring": False,
            "type": "task",
            "created_by": user["id"],
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "due_date": data["due_date"]
        }

        await db.tasks.insert_one(new_task)

        await db.telegram_conversations.delete_one({"telegram_id": chat_id})

        send_telegram_message(chat_id, "✅ Task created successfully!")
        return {"status": "task_created"}

    return {"status": "unknown_step"}


# =========================================================
# ADMIN: SEND MESSAGE TO USER
# =========================================================

@router.post("/send")
async def send_message_to_user(
    payload: TelegramSendRequest,
    current_user = Depends(check_permission("can_manage_users"))
):
    from backend.server import db

    user = await db.users.find_one({"id": payload.user_id})

    if not user or not user.get("telegram_id"):
        raise HTTPException(status_code=404, detail="User not linked with Telegram")

    send_telegram_message(user["telegram_id"], payload.message)

    await db.telegram_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": payload.user_id,
        "message": payload.message,
        "direction": "OUT",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    return {"message": "Telegram message sent successfully"}


# =========================================================
# ADMIN: BROADCAST
# =========================================================

@router.post("/broadcast")
async def broadcast_message(
    payload: TelegramBroadcastRequest,
    current_user = Depends(check_permission("can_manage_users"))
):
    from backend.server import db

    users = await db.users.find(
        {"telegram_id": {"$ne": None}},
        {"_id": 0}
    ).to_list(1000)

    count = 0

    for user in users:
        send_telegram_message(user["telegram_id"], payload.message)
        count += 1

    return {"message": f"Broadcast sent to {count} users"}
