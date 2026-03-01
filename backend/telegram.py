from fastapi import APIRouter, Request
from datetime import datetime, timezone
import os
import uuid
import requests

router = APIRouter(prefix="/telegram", tags=["Telegram"])

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not TELEGRAM_TOKEN:
    raise Exception("TELEGRAM_BOT_TOKEN not configured")

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
ADMIN_EMAIL = "csmanthandesai@gmail.com"

# =========================================================
# UTILITIES
# =========================================================

def send_message(chat_id: int, text: str, keyboard=None):
    payload = {
        "chat_id": chat_id,
        "text": text
    }
    if keyboard:
        payload["reply_markup"] = keyboard

    requests.post(f"{TELEGRAM_API}/sendMessage", json=payload)


def inline_keyboard(buttons):
    return {
        "inline_keyboard": [
            [{"text": b["text"], "callback_data": b["callback"]}]
            for b in buttons
        ]
    }


# =========================================================
# WEBHOOK
# =========================================================

@router.post("/webhook")
async def telegram_webhook(request: Request):
    from backend.server import db

    payload = await request.json()

    # =====================================================
    # HANDLE CALLBACK BUTTONS
    # =====================================================

    if "callback_query" in payload:
        callback = payload["callback_query"]
        chat_id = callback["message"]["chat"]["id"]
        clicked = callback["data"]

        # remove Telegram loading spinner
        requests.post(
            f"{TELEGRAM_API}/answerCallbackQuery",
            json={"callback_query_id": callback["id"]}
        )

        convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
        if not convo:
            return {"status": "no_convo"}

        data = convo.get("data", {})

        # ===============================
        # DEPARTMENT
        # ===============================
        if clicked.startswith("dept_"):
            data["category"] = clicked.replace("dept_", "")

            users = await db.users.find({}, {"_id": 0}).to_list(50)

            buttons = []
            for u in users:
                buttons.append({
                    "text": u["full_name"],
                    "callback": f"assign_{u['id']}"
                })

            buttons.append({"text": "Unassigned", "callback": "assign_unassigned"})

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "assignee", "data": data}}
            )

            send_message(chat_id, "👤 Select Assignee:", inline_keyboard(buttons))
            return {"status": "dept_selected"}

        # ===============================
        # ASSIGNEE
        # ===============================
        if clicked.startswith("assign_"):
            assignee = clicked.replace("assign_", "")

            data["assigned_to"] = None if assignee == "unassigned" else assignee
            data["sub_assignees"] = []

            users = await db.users.find({}, {"_id": 0}).to_list(50)

            buttons = []
            for u in users:
                if u["id"] != data["assigned_to"]:
                    buttons.append({
                        "text": u["full_name"],
                        "callback": f"sub_{u['id']}"
                    })

            buttons.append({"text": "Done ✅", "callback": "sub_done"})

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "sub_assignees", "data": data}}
            )

            send_message(chat_id, "Select Sub-Assignees:", inline_keyboard(buttons))
            return {"status": "assignee_selected"}

        # ===============================
        # SUB ASSIGNEE MULTI SELECT
        # ===============================
        if clicked.startswith("sub_"):
            user_id = clicked.replace("sub_", "")

            if user_id == "done":
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "priority", "data": data}}
                )

                send_message(
                    chat_id,
                    "⚡ Select Priority:",
                    inline_keyboard([
                        {"text": "Low", "callback": "priority_low"},
                        {"text": "Medium", "callback": "priority_medium"},
                        {"text": "High", "callback": "priority_high"},
                        {"text": "Critical", "callback": "priority_critical"},
                    ])
                )
                return {"status": "sub_done"}

            if user_id not in data["sub_assignees"]:
                data["sub_assignees"].append(user_id)

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"data": data}}
            )

            return {"status": "sub_added"}

        # ===============================
        # PRIORITY
        # ===============================
        if clicked.startswith("priority_"):
            data["priority"] = clicked.replace("priority_", "")

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "recurring", "data": data}}
            )

            send_message(
                chat_id,
                "🔁 Is this recurring?",
                inline_keyboard([
                    {"text": "Yes", "callback": "rec_yes"},
                    {"text": "No", "callback": "rec_no"},
                ])
            )
            return {"status": "priority_selected"}

        # ===============================
        # RECURRING YES / NO
        # ===============================
        if clicked == "rec_yes":
            data["is_recurring"] = True

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "pattern", "data": data}}
            )

            send_message(
                chat_id,
                "Repeat Pattern:",
                inline_keyboard([
                    {"text": "Daily", "callback": "pattern_daily"},
                    {"text": "Weekly", "callback": "pattern_weekly"},
                    {"text": "Monthly", "callback": "pattern_monthly"},
                    {"text": "Yearly", "callback": "pattern_yearly"},
                ])
            )
            return {"status": "recurring_yes"}

        if clicked == "rec_no":
            data["is_recurring"] = False

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "due_date", "data": data}}
            )

            send_message(chat_id, "📅 Enter Due Date (YYYY-MM-DD):")
            return {"status": "recurring_no"}

        # ===============================
        # PATTERN
        # ===============================
        if clicked.startswith("pattern_"):
            data["recurrence_pattern"] = clicked.replace("pattern_", "")
            data["recurrence_interval"] = 1

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "due_date", "data": data}}
            )

            send_message(chat_id, "📅 Enter Due Date (YYYY-MM-DD):")
            return {"status": "pattern_selected"}

        # ===============================
        # CONFIRM TASK CREATION
        # ===============================
        if clicked == "confirm_task":
            now = datetime.now(timezone.utc)

            # Fetch user again to guarantee created_by
            user = await db.users.find_one({"telegram_id": chat_id})

            if not user:
                return {"status": "user_not_found"}

            new_task = {
                "id": str(uuid.uuid4()),
                "title": data.get("title"),
                "description": data.get("description"),
                "assigned_to": data.get("assigned_to"),
                "sub_assignees": data.get("sub_assignees", []),
                "priority": data.get("priority", "medium"),
                "status": "pending",  # ALWAYS DEFAULT
                "category": data.get("category", "other"),
                "client_id": None,
                "is_recurring": data.get("is_recurring", False),
                "recurrence_pattern": data.get("recurrence_pattern"),
                "recurrence_interval": data.get("recurrence_interval", 1),
                "type": "task",
                "created_by": user["id"],  # CRITICAL FIX
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "due_date": data.get("due_date")
            }

            await db.tasks.insert_one(new_task)
            await db.telegram_conversations.delete_one({"telegram_id": chat_id})

            send_message(chat_id, "✅ Task Created Successfully!")
            return {"status": "task_created"}

    # =====================================================
    # NORMAL MESSAGE FLOW
    # =====================================================

    if "message" not in payload:
        return {"status": "ignored"}

    message = payload["message"]
    chat_id = message["chat"]["id"]
    text = message.get("text", "").strip()

    user = await db.users.find_one({"telegram_id": chat_id})

    # LINK ADMIN IF NOT LINKED
    if not user:
        user = await db.users.find_one({"email": ADMIN_EMAIL})
        if user:
            await db.users.update_one(
                {"email": ADMIN_EMAIL},
                {"$set": {"telegram_id": chat_id}}
            )
            send_message(chat_id, "✅ Telegram Linked!")
        else:
            send_message(chat_id, "❌ No account found.")
            return {"status": "no_user"}

    # START COMMAND
    if text == "/start":
        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "title", "data": {}}},
            upsert=True
        )
        send_message(chat_id, "📝 Enter Task Title:")
        return {"status": "started"}

    convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
    if not convo:
        send_message(chat_id, "Send /start to create task.")
        return {"status": "no_convo"}

    step = convo.get("step")
    data = convo.get("data", {})

    # TITLE
    if step == "title":
        data["title"] = text

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "description", "data": data}}
        )

        send_message(chat_id, "Enter Description (or type SKIP):")
        return {"status": "title_saved"}

    # DESCRIPTION
    if step == "description":
        data["description"] = None if text.lower() == "skip" else text

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "department", "data": data}}
        )

        send_message(
            chat_id,
            "📂 Select Department:",
            inline_keyboard([
                {"text": "GST", "callback": "dept_gst"},
                {"text": "INCOME TAX", "callback": "dept_income_tax"},
                {"text": "ACCOUNTS", "callback": "dept_accounts"},
                {"text": "TDS", "callback": "dept_tds"},
                {"text": "ROC", "callback": "dept_roc"},
                {"text": "TRADEMARK", "callback": "dept_trademark"},
                {"text": "OTHER", "callback": "dept_other"},
            ])
        )

        return {"status": "desc_saved"}

    # DUE DATE
    if step == "due_date":
        try:
            due = datetime.fromisoformat(text)
        except Exception:
            send_message(chat_id, "Invalid format. Use YYYY-MM-DD")
            return {"status": "invalid_date"}

        data["due_date"] = due.isoformat()

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "confirm", "data": data}}
        )

        summary = f"""
Confirm Task:

Title: {data.get('title')}
Department: {data.get('category')}
Priority: {data.get('priority')}
Recurring: {data.get('is_recurring')}
Due Date: {text}
"""

        send_message(
            chat_id,
            summary,
            inline_keyboard([
                {"text": "Confirm ✅", "callback": "confirm_task"}
            ])
        )

        return {"status": "awaiting_confirm"}

    return {"status": "unknown"}
