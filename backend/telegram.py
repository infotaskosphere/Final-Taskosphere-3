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


def inline_keyboard(buttons, include_cancel=True):
    keyboard_buttons = [
        [{"text": b["text"], "callback_data": b["callback"]}]
        for b in buttons
    ]

    if include_cancel:
        keyboard_buttons.append(
            [{"text": "❌ Cancel", "callback_data": "cancel_task"}]
        )

    return {"inline_keyboard": keyboard_buttons}


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

        requests.post(
            f"{TELEGRAM_API}/answerCallbackQuery",
            json={"callback_query_id": callback["id"]}
        )

        # ===============================
        # CANCEL CREATION
        # ===============================
        if clicked == "cancel_task":
            await db.telegram_conversations.delete_one({"telegram_id": chat_id})
            send_message(chat_id, "❌ Task creation cancelled.")
            return {"status": "cancelled"}

        # ===============================
        # DELETE TASK
        # ===============================
        if clicked.startswith("delete_"):
            task_id = clicked.replace("delete_", "")
            await db.tasks.delete_one({"id": task_id})
            send_message(chat_id, "🗑 Task deleted successfully.")
            return {"status": "task_deleted"}

        convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
        if not convo:
            return {"status": "no_convo"}

        data = convo.get("data", {})

        # ===============================
        # DEPARTMENT
        # ===============================
        if clicked.startswith("dept_"):
            data["category"] = clicked.replace("dept_", "")

            clients = await db.clients.find({}, {"_id": 0}).to_list(50)
            buttons = [
                {"text": c["company_name"], "callback": f"client_{c['id']}"}
                for c in clients
            ]
            buttons.append({"text": "No Client", "callback": "client_none"})

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "client", "data": data}}
            )

            send_message(chat_id, "🏢 Select Client:", inline_keyboard(buttons))
            return {"status": "department_selected"}

        # ===============================
        # CLIENT
        # ===============================
        if clicked.startswith("client_"):
            client = clicked.replace("client_", "")
            data["client_id"] = None if client == "none" else client

            users = await db.users.find({}, {"_id": 0}).to_list(50)
            buttons = [
                {"text": u["full_name"], "callback": f"assign_{u['id']}"}
                for u in users
            ]
            buttons.append({"text": "Unassigned", "callback": "assign_unassigned"})

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "assignee", "data": data}}
            )

            send_message(chat_id, "👤 Select Assignee:", inline_keyboard(buttons))
            return {"status": "client_selected"}

        # ===============================
        # ASSIGNEE
        # ===============================
        if clicked.startswith("assign_"):
            assignee = clicked.replace("assign_", "")
            data["assigned_to"] = None if assignee == "unassigned" else assignee
            data["sub_assignees"] = []

            users = await db.users.find({}, {"_id": 0}).to_list(50)
            buttons = [
                {"text": u["full_name"], "callback": f"sub_{u['id']}"}
                for u in users if u["id"] != data["assigned_to"]
            ]
            buttons.append({"text": "Done ✅", "callback": "sub_done"})

            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "sub_assignees", "data": data}}
            )

            send_message(chat_id, "Select Sub-Assignees:", inline_keyboard(buttons))
            return {"status": "assignee_selected"}

        # ===============================
        # SUB ASSIGNEES
        # ===============================
        if clicked.startswith("sub_"):
            uid = clicked.replace("sub_", "")

            if uid == "done":
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

            if uid not in data["sub_assignees"]:
                data["sub_assignees"].append(uid)

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
                {"$set": {"step": "status", "data": data}}
            )

            send_message(
                chat_id,
                "📌 Select Status:",
                inline_keyboard([
                    {"text": "To Do", "callback": "status_pending"},
                    {"text": "In Progress", "callback": "status_in_progress"},
                    {"text": "Completed", "callback": "status_completed"},
                ])
            )
            return {"status": "priority_selected"}

        # ===============================
        # STATUS
        # ===============================
        if clicked.startswith("status_"):
            data["status"] = clicked.replace("status_", "")

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
            return {"status": "status_selected"}

        # ===============================
        # RECURRING
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

        if clicked.startswith("pattern_"):
            data["recurrence_pattern"] = clicked.replace("pattern_", "")
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "interval", "data": data}}
            )
            send_message(chat_id, "Enter recurrence interval (number):")
            return {"status": "pattern_selected"}

        # ===============================
        # CONFIRM
        # ===============================
        if clicked == "confirm_task":
            now = datetime.now(timezone.utc)
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
                "status": data.get("status", "pending"),
                "category": data.get("category"),
                "client_id": data.get("client_id"),
                "is_recurring": data.get("is_recurring", False),
                "recurrence_pattern": data.get("recurrence_pattern"),
                "recurrence_interval": data.get("recurrence_interval", 1),
                "created_by": user["id"],
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

    # CANCEL VIA COMMAND
    if text.lower() == "/cancel":
        await db.telegram_conversations.delete_one({"telegram_id": chat_id})
        send_message(chat_id, "❌ Task creation cancelled.")
        return {"status": "cancelled"}

    # SHOW MY TASKS
    if text.lower() == "/mytasks":
        user = await db.users.find_one({"telegram_id": chat_id})
        if not user:
            send_message(chat_id, "User not linked.")
            return {"status": "no_user"}

        tasks = await db.tasks.find(
            {"created_by": user["id"]},
            {"_id": 0}
        ).to_list(20)

        if not tasks:
            send_message(chat_id, "No tasks found.")
            return {"status": "no_tasks"}

        for task in tasks:
            send_message(
                chat_id,
                f"📋 {task['title']}\n📅 Due: {task.get('due_date')}",
                inline_keyboard([
                    {"text": "🗑 Delete", "callback": f"delete_{task['id']}"}
                ])
            )

        return {"status": "tasks_listed"}

    # START
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

    if step == "title":
        data["title"] = text
        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "description", "data": data}}
        )
        send_message(chat_id, "Enter Description (or type SKIP):")
        return {"status": "title_saved"}

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
        return {"status": "description_saved"}

    if step == "interval":
        try:
            interval = int(text)
            if interval <= 0:
                raise Exception()
        except:
            send_message(chat_id, "Enter valid number (e.g., 1)")
            return {"status": "invalid_interval"}

        data["recurrence_interval"] = interval
        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "due_date", "data": data}}
        )
        send_message(chat_id, "📅 Enter Due Date (YYYY-MM-DD):")
        return {"status": "interval_saved"}

    if step == "due_date":
        try:
            due = datetime.fromisoformat(text)
        except:
            send_message(chat_id, "Invalid format. Use YYYY-MM-DD")
            return {"status": "invalid_date"}

        data["due_date"] = due.isoformat()

        await db.telegram_conversations.update_one(
            {"telegram_id": chat_id},
            {"$set": {"step": "confirm", "data": data}}
        )

        summary = f"""
📋 Confirm Task Details

📝 Title: {data.get('title')}
📂 Department: {data.get('category')}
🏢 Client: {data.get('client_id')}
👤 Assignee: {data.get('assigned_to')}
⚡ Priority: {data.get('priority')}
📌 Status: {data.get('status')}
🔁 Recurring: {data.get('is_recurring')}
📅 Due Date: {text}
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
