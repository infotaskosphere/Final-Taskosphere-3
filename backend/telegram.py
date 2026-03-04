from fastapi import APIRouter, Request
from backend.models import User
from datetime import datetime, timezone
import os
import uuid
import httpx
from backend.dependencies import db
from backend.notifications import create_notification

router = APIRouter(prefix="/telegram", tags=["Telegram"])
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_TOKEN:
    raise Exception("TELEGRAM_BOT_TOKEN not configured")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

# =========================================================
# UTILITIES
# =========================================================
async def send_message(chat_id: int, text: str, keyboard=None):
    payload = {
        "chat_id": chat_id,
        "text": text
    }
    if keyboard:
        payload["reply_markup"] = keyboard
    async with httpx.AsyncClient() as client:
        await client.post(f"{TELEGRAM_API}/sendMessage", json=payload)

# UPDATED: Generic cancel callback (works for both tasks and leads)
def inline_keyboard(buttons, include_cancel=True):
    keyboard_buttons = [
        [{"text": b["text"], "callback_data": b["callback"]}]
        for b in buttons
    ]
    if include_cancel:
        keyboard_buttons.append(
            [{"text": "❌ Cancel", "callback_data": "cancel_convo"}]
        )
    return {"inline_keyboard": keyboard_buttons}

# =========================================================
# WEBHOOK
# =========================================================
@router.post("/webhook")
async def telegram_webhook(request: Request):
    try:
        secret_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if secret_token != os.getenv("TELEGRAM_WEBHOOK_SECRET"):
            return {"status": "unauthorized"}

        payload = await request.json()
        # =====================================================
        # HANDLE CALLBACK BUTTONS
        # =====================================================
        if "callback_query" in payload:
            callback = payload["callback_query"]
            chat_id = callback["message"]["chat"]["id"]
            clicked = callback["data"]
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{TELEGRAM_API}/answerCallbackQuery",
                    json={"callback_query_id": callback["id"]}
                )
            # ===============================
            # GENERIC CANCEL (works for Task & Lead)
            # ===============================
            if clicked == "cancel_convo":
                await db.telegram_conversations.delete_many({"telegram_id": chat_id})
                await send_message(chat_id, "❌ Action cancelled.")
                return {"status": "cancelled"}
            # ===============================
            # DELETE TASK (kept exactly as original)
            # ===============================
            if clicked.startswith("delete_"):
                task_id = clicked.replace("delete_", "")
                await db.tasks.delete_one({"id": task_id})
                await send_message(chat_id, "🗑 Task deleted successfully.")
                return {"status": "task_deleted"}
            convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
            if not convo:
                return {"status": "no_convo"}
            data = convo.get("data", {})
            convo_type = convo.get("type", "task") # NEW: type support for leads
            # ===============================
            # LEAD CALLBACKS (UPDATED FOR FULL FIELDS)
            # ===============================
            if convo_type == "lead":
                # SERVICE
                if clicked.startswith("service_"):
                    data["service"] = clicked.replace("service_", "")
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "source", "data": data}}
                    )
                    await send_message(
                        chat_id,
                        "🌐 Select Source:",
                        inline_keyboard([
                            {"text": "Direct", "callback": "source_direct"},
                            {"text": "Website", "callback": "source_website"},
                            {"text": "Referral", "callback": "source_referral"},
                            {"text": "Social Media", "callback": "source_social_media"},
                            {"text": "Event", "callback": "source_event"},
                        ])
                    )
                    return {"status": "service_selected"}
                # SOURCE
                if clicked.startswith("source_"):
                    data["source"] = clicked.replace("source_", "")
                    users = await db.users.find({"role": {"$ne": "admin"}}, {"id": 1, "full_name": 1}).to_list(50)
                    buttons = [
                        {"text": u["full_name"], "callback": f"assign_{u['id']}"}
                        for u in users
                    ]
                    buttons.append({"text": "Unassigned", "callback": "assign_unassigned"})
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "lead_assign", "data": data}}
                    )
                    await send_message(chat_id, "👤 Assign this lead to:", inline_keyboard(buttons))
                    return {"status": "source_selected"}
                # ASSIGNEE
                if clicked.startswith("assign_"):
                    assignee_id = clicked.replace("assign_", "")
                    data["assigned_to"] = None if assignee_id == "unassigned" else assignee_id
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "next_follow_up", "data": data}}
                    )
                    await send_message(chat_id, "📅 Enter Next Follow-up Date (YYYY-MM-DD) or SKIP:")
                    return {"status": "assignee_selected"}
            # ===============================
            # CONFIRM LEAD
            # ===============================
            if clicked == "confirm_lead":

                user = await db.users.find_one({"telegram_id": chat_id})

                now = datetime.now(timezone.utc)

                # convert follow-up to datetime
                follow_up = None
                if data.get("next_follow_up"):
                    try:
                        follow_up = datetime.fromisoformat(data["next_follow_up"])
                    except:
                        follow_up = None

                new_lead = {
                    "company_name": data.get("company_name"),
                    "contact_name": data.get("contact_person"),
                    "email": data.get("email"),
                    "phone": data.get("phone"),

                    # services must be list (backend model)
                    "services": [data.get("service")] if data.get("service") else [],

                    "quotation_amount": float(data["quotation_amount"]) if data.get("quotation_amount") else None,

                    "status": "new",
                    "source": data.get("source"),

                    "date_of_meeting": data.get("date_of_meeting"),

                    "next_follow_up": follow_up,

                    "notes": data.get("notes"),

                    "assigned_to": data.get("assigned_to") or None,

                    "created_by": user["id"] if user else "telegram_bot",

                    "created_at": now,
                    "updated_at": now
                }

                await db.leads.insert_one(new_lead)

                # create notification if assigned
                if data.get("assigned_to"):
                    await create_notification(
                        user_id=data["assigned_to"],
                        title="New Lead Assigned",
                        message=f"Lead '{new_lead['company_name']}' assigned to you",
                        type="lead"
                    )

                await db.telegram_conversations.delete_many({"telegram_id": chat_id})

                await send_message(
                    chat_id,
                    f"✅ Lead '{new_lead['company_name']}' created successfully!"
                )

                return {"status": "lead_created"}
            # ===============================
            # EXISTING TASK CALLBACKS (100% unchanged from your original)
            # ===============================
            # DEPARTMENT
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
                await send_message(chat_id, "🏢 Select Client:", inline_keyboard(buttons))
                return {"status": "department_selected"}
            # CLIENT
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
                await send_message(chat_id, "👤 Select Assignee:", inline_keyboard(buttons))
                return {"status": "client_selected"}
            # ASSIGNEE
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
                await send_message(chat_id, "Select Sub-Assignees:", inline_keyboard(buttons))
                return {"status": "assignee_selected"}
            # SUB ASSIGNEES
            if clicked.startswith("sub_"):
                uid = clicked.replace("sub_", "")
                if uid == "done":
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "priority", "data": data}}
                    )
                    await send_message(
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
                if uid not in data.get("sub_assignees", []):
                    data.setdefault("sub_assignees", []).append(uid)
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"data": data}}
                )
                return {"status": "sub_added"}
            # PRIORITY
            if clicked.startswith("priority_"):
                data["priority"] = clicked.replace("priority_", "")
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "status", "data": data}}
                )
                await send_message(
                    chat_id,
                    "📌 Select Status:",
                    inline_keyboard([
                        {"text": "To Do", "callback": "status_pending"},
                        {"text": "In Progress", "callback": "status_in_progress"},
                        {"text": "Completed", "callback": "status_completed"},
                    ])
                )
                return {"status": "priority_selected"}
            # STATUS
            if clicked.startswith("status_"):
                data["status"] = clicked.replace("status_", "")
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "recurring", "data": data}}
                )
                await send_message(
                    chat_id,
                    "🔁 Is this recurring?",
                    inline_keyboard([
                        {"text": "Yes", "callback": "rec_yes"},
                        {"text": "No", "callback": "rec_no"},
                    ])
                )
                return {"status": "status_selected"}
            # RECURRING
            if clicked == "rec_yes":
                data["is_recurring"] = True
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "pattern", "data": data}}
                )
                await send_message(
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
                await send_message(chat_id, "📅 Enter Due Date (YYYY-MM-DD):")
                return {"status": "recurring_no"}
            if clicked.startswith("pattern_"):
                data["recurrence_pattern"] = clicked.replace("pattern_", "")
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "interval", "data": data}}
                )
                await send_message(chat_id, "Enter recurrence interval (number):")
                return {"status": "pattern_selected"}
            # CONFIRM TASK
            if clicked == "confirm_task":
                now = datetime.now(timezone.utc)
                user = await db.users.find_one({"telegram_id": chat_id})
                if not user:
                    return {"status": "user_not_found"}
                new_task = {
                    "id": str(uuid.uuid4()),
                    "title": data.get("title"),
                    "description": data.get("description"),
                    "assigned_to": data.get("assigned_to") or None,
                    "sub_assignees": data.get("sub_assignees", []),
                    "priority": data.get("priority", "medium"),
                    "status": data.get("status", "pending"),
                    "category": data.get("category"),
                    "client_id": data.get("client_id"),
                    "is_recurring": data.get("is_recurring", False),
                    "recurrence_pattern": data.get("recurrence_pattern"),
                    "recurrence_interval": data.get("recurrence_interval", 1),
                    "created_by": user["id"],
                    "created_at": now,
                    "updated_at": now,
                    "due_date": data.get("due_date")
                }
                await db.tasks.insert_one(new_task)
                await db.telegram_conversations.delete_many({"telegram_id": chat_id})
                await send_message(chat_id, "✅ Task Created Successfully!")
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
            await db.telegram_conversations.delete_many({"telegram_id": chat_id})
            await send_message(chat_id, "❌ Action cancelled.")
            return {"status": "cancelled"}
        # SHOW MY TASKS
        if text.lower() == "/mytasks":
            user = await db.users.find_one({"telegram_id": chat_id})
            if not user:
                await send_message(chat_id, "User not linked.")
                return {"status": "no_user"}
            tasks = await db.tasks.find(
                {
                    "$or": [
                        {"created_by": user["id"]},
                        {"assigned_to": user["id"]},
                        {"sub_assignees": user["id"]}
                    ]
                },
                {"_id": 0}
            ).to_list(20)
            if not tasks:
                await send_message(chat_id, "No tasks found.")
                return {"status": "no_tasks"}
            for task in tasks:
                await send_message(
                    chat_id,
                    f"📋 {task['title']}\n📅 Due: {task.get('due_date')}",
                    inline_keyboard([
                        {"text": "🗑 Delete", "callback": f"delete_{task['id']}"}
                    ])
                )
            return {"status": "tasks_listed"}
        # NEW: ADD LEAD COMMAND
        if text.lower() == "/addlead":
            user = await db.users.find_one({"telegram_id": chat_id})
            
            # Check if user is admin OR has permission to handle leads
            permissions = user.get("permissions", {}) if user else {}
            is_authorized = user and (user["role"] == "admin" or permissions.get("can_view_all_leads"))
            
            if not is_authorized:
                await send_message(chat_id, "🚫 You do not have permission to add leads.")
                return {"status": "unauthorized"}
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "company_name", "type": "lead", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "🏢 Enter Company Name:")
            return {"status": "lead_started"}
        # START (original task flow)
        if text == "/start":
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "title", "type": "task", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "📝 Enter Task Title:")
            return {"status": "started"}
        convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
        if not convo:
            await send_message(chat_id, "Send /start to create task or /addlead to add a lead.")
            return {"status": "no_convo"}
        step = convo.get("step")
        data = convo.get("data", {})
        convo_type = convo.get("type", "task")
        # =====================================================
        # LEAD FLOW STEPS (UPDATED FOR FULL FORM)
        # =====================================================
        if convo_type == "lead":
            if step == "company_name":
                if not text:
                    await send_message(chat_id, "Company name required.")
                    return {"status": "invalid"}
                data["company_name"] = text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "contact_person", "data": data}}
                )
                await send_message(chat_id, "👤 Enter Contact Person (or SKIP):")
                return {"status": "company_name_saved"}
            if step == "contact_person":
                data["contact_person"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "email", "data": data}}
                )
                await send_message(chat_id, "✉️ Enter Email (or SKIP):")
                return {"status": "contact_person_saved"}
            if step == "email":
                data["email"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "phone", "data": data}}
                )
                await send_message(chat_id, "📞 Enter Phone Number (or SKIP):")
                return {"status": "email_saved"}
            if step == "phone":
                if text.lower() != "skip" and (not text.isdigit() or len(text) < 10):
                    await send_message(chat_id, "Invalid phone number.")
                    return {"status": "invalid_phone"}
                data["phone"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "service", "data": data}}
                )
                await send_message(
                    chat_id,
                    "📂 Select Service:",
                    inline_keyboard([
                        {"text": "GST", "callback": "service_gst"},
                        {"text": "INCOME TAX", "callback": "service_income_tax"},
                        {"text": "ACCOUNTS", "callback": "service_accounts"},
                        {"text": "TDS", "callback": "service_tds"},
                        {"text": "ROC", "callback": "service_roc"},
                        {"text": "TRADEMARK", "callback": "service_trademark"},
                        {"text": "MSME SMADHAN", "callback": "service_msme_smadhan"},
                        {"text": "FEMA", "callback": "service_fema"},
                        {"text": "DSC", "callback": "service_dsc"},
                        {"text": "OTHER", "callback": "service_other"},
                    ])
                )
                return {"status": "phone_saved"}
            if step == "next_follow_up":
                if text.lower() != "skip":
                    try:
                        due = datetime.fromisoformat(text) if "T" in text else datetime.fromisoformat(text + "T00:00:00")
                        data["next_follow_up"] = due.isoformat()
                    except:
                        await send_message(chat_id, "Invalid format. Use YYYY-MM-DD")
                        return {"status": "invalid_date"}
                else:
                    data["next_follow_up"] = None
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "notes", "data": data}}
                )
                await send_message(chat_id, "📝 Enter Notes (or SKIP):")
                return {"status": "next_follow_up_saved"}
            if step == "notes":
                data["notes"] = None if text.lower() == "skip" else text
                summary = f"""
✅ Confirm Lead Details
🏢 Company: {data.get('company_name')}
👤 Contact: {data.get('contact_person') or 'None'}
✉️ Email: {data.get('email') or 'None'}
📞 Phone: {data.get('phone') or 'None'}
📂 Service: {data.get('service') or 'None'}
🌐 Source: {data.get('source') or 'None'}
👤 Assigned: {data.get('assigned_to') or 'Unassigned'}
📅 Follow-up: {data.get('next_follow_up') or 'None'}
📝 Notes: {data.get('notes') or 'None'}
"""
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "confirm", "data": data}}
                )
                await send_message(
                    chat_id,
                    summary,
                    inline_keyboard([
                        {"text": "Confirm ✅", "callback": "confirm_lead"}
                    ])
                )
                return {"status": "notes_saved"}
        # =====================================================
        # TASK FLOW STEPS (your original logic – unchanged)
        # =====================================================
        if convo_type == "task":
            if step == "title":
                data["title"] = text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "description", "data": data}}
                )
                await send_message(chat_id, "Enter Description (or type SKIP):")
                return {"status": "title_saved"}
            if step == "description":
                data["description"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "department", "data": data}}
                )
                await send_message(
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
                    await send_message(chat_id, "Enter valid number (e.g., 1)")
                    return {"status": "invalid_interval"}
                data["recurrence_interval"] = interval
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "due_date", "data": data}}
                )
                await send_message(chat_id, "📅 Enter Due Date (YYYY-MM-DD):")
                return {"status": "interval_saved"}
            if step == "due_date":
                try:
                    due = datetime.fromisoformat(text) if "T" in text else datetime.fromisoformat(text + "T00:00:00")
                except:
                    await send_message(chat_id, "Invalid format. Use YYYY-MM-DD")
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
                await send_message(
                    chat_id,
                    summary,
                    inline_keyboard([
                        {"text": "Confirm ✅", "callback": "confirm_task"}
                    ])
                )
                return {"status": "awaiting_confirm"}
        return {"status": "unknown"}
    except Exception as e:
        print("Telegram Error:", e)
        return {"status": "error"}
