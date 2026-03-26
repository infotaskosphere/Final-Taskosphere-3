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
# GLOBAL CONFIG
# =========================================================
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
DEFAULT_COMPANY_ID = os.getenv("DEFAULT_COMPANY_ID", "")

# =========================================================
# DEPARTMENTS (From your image)
# =========================================================
DEPARTMENTS = [
    {"value": "gst", "label": "GST"},
    {"value": "income_tax", "label": "IT"},
    {"value": "accounts", "label": "ACC"},
    {"value": "tds", "label": "TDS"},
    {"value": "roc", "label": "ROC"},
    {"value": "other", "label": "OTHER"},
    {"value": "dsc", "label": "DSC"},
    {"value": "fema", "label": "FEMA"},
    {"value": "msme_smadhan", "label": "MSME"},
    {"value": "trademark", "label": "TM"},
]

# =========================================================
# UTILITIES
# =========================================================
async def send_message(chat_id: int, text: str, keyboard=None):
    payload = {"chat_id": chat_id, "text": text}
    if keyboard:
        payload["reply_markup"] = keyboard
    async with httpx.AsyncClient() as client:
        await client.post(f"{TELEGRAM_API}/sendMessage", json=payload)


async def send_document(chat_id: int, file_bytes, filename="quotation.pdf"):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{TELEGRAM_API}/sendDocument",
            data={"chat_id": chat_id},
            files={"document": (filename, file_bytes, "application/pdf")},
        )


def inline_keyboard(buttons, include_cancel=True):
    keyboard_buttons = [[{"text": b["text"], "callback_data": b["callback"]}] for b in buttons]
    if include_cancel:
        keyboard_buttons.append([{"text": "❌ Cancel", "callback_data": "cancel_convo"}])
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
                await client.post(f"{TELEGRAM_API}/answerCallbackQuery", json={"callback_query_id": callback["id"]})

            # Generic Cancel
            if clicked == "cancel_convo":
                await db.telegram_conversations.delete_many({"telegram_id": chat_id})
                await send_message(chat_id, "❌ Action cancelled.")
                return {"status": "cancelled"}

            # Delete Task
            if clicked.startswith("delete_"):
                task_id = clicked.replace("delete_", "")
                await db.tasks.delete_one({"id": task_id})
                await send_message(chat_id, "🗑 Task deleted successfully.")
                return {"status": "task_deleted"}

            convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
            if not convo:
                return {"status": "no_convo"}

            data = convo.get("data", {})
            convo_type = convo.get("type", "task")

            # ===================== LEAD CALLBACKS =====================
            if convo_type == "lead":
                if clicked.startswith("service_"):
                    data["service"] = clicked.replace("service_", "")
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "quotation_amount", "data": data}}
                    )
                    await send_message(chat_id, "💰 Enter Quotation Amount (or SKIP):")
                    return {"status": "service_selected"}

                if clicked.startswith("source_"):
                    data["source"] = clicked.replace("source_", "")
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "next_follow_up", "data": data}}
                    )
                    await send_message(chat_id, "📅 Enter Next Follow-up Date (YYYY-MM-DD) or SKIP:")
                    return {"status": "source_selected"}

                if clicked.startswith("lead_assign_"):
                    assignee_id = clicked.replace("lead_assign_", "")
                    data["assigned_to"] = None if assignee_id == "unassigned" else assignee_id
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "next_follow_up", "data": data}}
                    )
                    await send_message(chat_id, "📅 Enter Next Follow-up Date (YYYY-MM-DD) or SKIP:")
                    return {"status": "lead_assignee_selected"}

            # ===================== QUOTATION CALLBACKS =====================
            if convo_type == "quotation":
                if clicked.startswith("qservice_"):
                    data["service"] = clicked.replace("qservice_", "").upper()
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "scope_of_work", "data": data}}
                    )
                    await send_message(chat_id, "📋 Enter Scope of Work (comma separated):")
                    return {"status": "service_selected"}

            # ===================== TASK CALLBACKS (FULL ORIGINAL) =====================
            if clicked.startswith("dept_"):
                data["category"] = clicked.replace("dept_", "")
                clients = await db.clients.find({}, {"_id": 0}).to_list(50)
                buttons = [{"text": c["company_name"], "callback": f"client_{c['id']}"} for c in clients]
                buttons.append({"text": "No Client", "callback": "client_none"})
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "client", "data": data}}
                )
                await send_message(chat_id, "🏢 Select Client:", inline_keyboard(buttons))
                return {"status": "department_selected"}

            if clicked.startswith("client_"):
                client = clicked.replace("client_", "")
                data["client_id"] = None if client == "none" else client
                users = await db.users.find({}, {"_id": 0}).to_list(50)
                buttons = [{"text": u["full_name"], "callback": f"assign_{u['id']}"} for u in users]
                buttons.append({"text": "Unassigned", "callback": "assign_unassigned"})
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "assignee", "data": data}}
                )
                await send_message(chat_id, "👤 Select Assignee:", inline_keyboard(buttons))
                return {"status": "client_selected"}

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

            if clicked.startswith("priority_"):
                data["priority"] = clicked.replace("priority_", "")
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "confirm", "data": data}}
                )
                await send_message(
                    chat_id,
                    "✅ Ready to create task?",
                    inline_keyboard([{"text": "✅ Confirm Task", "callback": "confirm_task"}])
                )
                return {"status": "priority_selected"}

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

            # CONFIRM LEAD & TASK & QUOTATION
            if clicked == "confirm_lead":
                # Original confirm_lead logic
                try:
                    user = await db.users.find_one({"telegram_id": chat_id})
                    now = datetime.now(timezone.utc)
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
                        "services": [data["service"]] if data.get("service") else [],
                        "quotation_amount": float(data.get("quotation_amount") or 0) if data.get("quotation_amount") else None,
                        "status": "new",
                        "source": data.get("source"),
                        "next_follow_up": follow_up,
                        "notes": data.get("notes"),
                        "assigned_to": data.get("assigned_to") or None,
                        "created_by": user["id"] if user else "telegram_bot",
                        "created_at": now,
                        "updated_at": now,
                    }
                    result = await db.leads.insert_one(new_lead)
                    if new_lead.get("assigned_to"):
                        await create_notification(
                            user_id=new_lead["assigned_to"],
                            title="New Lead Assigned",
                            message=f"Lead '{new_lead['company_name']}' assigned to you",
                            type="lead"
                        )
                    await db.telegram_conversations.delete_one({"telegram_id": chat_id})
                    await send_message(chat_id, f"✅ Lead '{new_lead['company_name']}' created successfully!")
                    return {"status": "lead_created"}
                except Exception as e:
                    await send_message(chat_id, f"❌ Error: {str(e)}")
                    return {"status": "error"}

            if clicked == "confirm_task":
                # Full original confirm_task logic
                try:
                    now = datetime.now(timezone.utc)
                    user = await db.users.find_one({"telegram_id": chat_id})
                    if not user:
                        await send_message(chat_id, "User not found.")
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
                        "due_date": data.get("due_date"),
                        "type": "task",
                    }
                    await db.tasks.insert_one(new_task)
                    await db.telegram_conversations.delete_many({"telegram_id": chat_id})

                    if new_task.get("assigned_to"):
                        await create_notification(
                            user_id=new_task["assigned_to"],
                            title="New Task Assigned",
                            message=f"Task '{new_task['title']}' has been assigned to you via Telegram",
                            type="assignment"
                        )
                    await send_message(chat_id, "✅ Task Created Successfully!")
                    return {"status": "task_created"}
                except Exception as e:
                    await send_message(chat_id, f"❌ Error creating task: {str(e)}")
                    return {"status": "error"}

            if clicked == "confirm_quotation":
                try:
                    if not DEFAULT_COMPANY_ID:
                        await send_message(chat_id, "❌ DEFAULT_COMPANY_ID not configured.")
                        return {"status": "config_error"}

                    quotation_payload = {
                        "company_id": DEFAULT_COMPANY_ID,
                        "client_name": data.get("client_name"),
                        "client_phone": data.get("client_phone"),
                        "client_email": data.get("client_email"),
                        "service": data.get("service"),
                        "scope_of_work": data.get("scope_of_work", []),
                        "items": [{
                            "description": data.get("service"),
                            "quantity": 1,
                            "unit_price": float(data.get("amount") or 0),
                            "amount": float(data.get("amount") or 0),
                        }],
                        "gst_rate": float(data.get("gst_rate") or 18),
                        "payment_terms": data.get("payment_terms"),
                        "timeline": data.get("timeline"),
                    }

                    async with httpx.AsyncClient() as client:
                        create_resp = await client.post(f"{BACKEND_URL}/quotations", json=quotation_payload, timeout=30.0)
                        create_resp.raise_for_status()
                        q_data = create_resp.json()
                        q_id = q_data.get("id") or q_data.get("_id")

                    async with httpx.AsyncClient() as client:
                        pdf_resp = await client.get(f"{BACKEND_URL}/quotations/{q_id}/pdf", timeout=30.0)
                        pdf_resp.raise_for_status()
                        pdf_bytes = pdf_resp.content

                    await send_document(chat_id, pdf_bytes, f"Quotation_{q_id[:8]}.pdf")
                    await db.telegram_conversations.delete_one({"telegram_id": chat_id})
                    await send_message(chat_id, f"✅ Quotation created successfully!\nID: {q_id}\n📄 PDF sent to you.")
                    return {"status": "quotation_created"}
                except Exception as e:
                    await send_message(chat_id, f"❌ Error: {str(e)}")
                    return {"status": "error"}

            return {"status": "unknown_callback"}

        # =====================================================
        # NORMAL MESSAGE FLOW
        # =====================================================
        if "message" not in payload:
            return {"status": "ignored"}

        message = payload["message"]
        chat_id = message["chat"]["id"]
        text = message.get("text", "").strip()

        # Short Commands + Help
        if text.lower() in ["/help", "/h"]:
            await send_message(chat_id,
                "🤖 **Available Commands**\n\n"
                "• `/ld` → Create New Lead\n"
                "• `/ts` → Create New Task\n"
                "• `/qo` → Create New Quotation (PDF)\n"
                "• `/mt` → Show My Tasks\n"
                "• `/cl` → Cancel Current Action\n"
                "• `/help` → Show this help\n\n"
                "Type any command to begin."
            )
            return {"status": "help"}

        if text.lower() in ["/ld", "/lead"]:
            user = await db.users.find_one({"telegram_id": chat_id})
            is_authorized = user and (user.get("role") == "admin" or user.get("permissions", {}).get("can_view_all_leads"))
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

        if text.lower() in ["/ts", "/task", "/start"]:
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "title", "type": "task", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "📝 Enter Task Title:")
            return {"status": "task_started"}

        if text.lower() in ["/qo", "/quotation"]:
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "client_name", "type": "quotation", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "👤 Enter Client Name:")
            return {"status": "quotation_started"}

        if text.lower() in ["/cl", "/cancel"]:
            await db.telegram_conversations.delete_many({"telegram_id": chat_id})
            await send_message(chat_id, "❌ Action cancelled.")
            return {"status": "cancelled"}

        if text.lower() in ["/mt", "/mytasks"]:
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
                    inline_keyboard([{"text": "🗑 Delete", "callback": f"delete_{task['id']}"}])
                )
            return {"status": "tasks_listed"}

        # Load conversation
        convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
        if not convo:
            await send_message(chat_id,
                "👋 Welcome!\n\n"
                "Quick Commands:\n"
                "• `/ld` → New Lead\n"
                "• `/ts` → New Task\n"
                "• `/qo` → New Quotation\n"
                "• `/mt` → My Tasks\n"
                "• `/cl` → Cancel\n"
                "• `/help` → Help\n\n"
                "Type any command to begin."
            )
            return {"status": "welcome"}

        step = convo.get("step")
        data = convo.get("data", {})
        convo_type = convo.get("type", "task")

        # ===================== LEAD FLOW =====================
        if convo_type == "lead":
            if step == "company_name":
                data["company_name"] = text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "contact_person", "data": data}})
                await send_message(chat_id, "👤 Enter Contact Person (or SKIP):")
                return {"status": "company_name_saved"}

            if step == "contact_person":
                data["contact_person"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "phone", "data": data}})
                await send_message(chat_id, "📞 Enter Phone (or SKIP):")
                return {"status": "contact_person_saved"}

            if step == "phone":
                data["phone"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "email", "data": data}})
                await send_message(chat_id, "✉️ Enter Email (or SKIP):")
                return {"status": "phone_saved"}

            if step == "email":
                data["email"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "service", "data": data}})
                await send_message(chat_id, "📂 Select Service:", inline_keyboard([
                    {"text": s, "callback": f"service_{s.lower()}"} for s in ["GST", "IT", "ACC", "TDS", "ROC", "DSC", "FEMA", "MSME", "TM", "OTHER"]
                ]))
                return {"status": "email_saved"}

            if step == "quotation_amount":
                try:
                    data["quotation_amount"] = float(text) if text.lower() != "skip" else None
                except:
                    data["quotation_amount"] = None
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "source", "data": data}})
                await send_message(chat_id, "🌐 Select Source:", inline_keyboard([
                    {"text": s, "callback": f"source_{s.lower().replace(' ', '_')}"} for s in ["Direct", "Website", "Referral", "Social Media", "Event"]
                ]))
                return {"status": "quotation_amount_saved"}

            if step == "next_follow_up":
                if text.lower() != "skip":
                    try:
                        due = datetime.fromisoformat(text) if "T" in text else datetime.fromisoformat(text + "T00:00:00")
                        data["next_follow_up"] = due.isoformat()
                    except:
                        await send_message(chat_id, "Invalid date. Use YYYY-MM-DD or SKIP.")
                        return {"status": "invalid_date"}
                else:
                    data["next_follow_up"] = None
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "notes", "data": data}})
                await send_message(chat_id, "📝 Enter Notes (or SKIP):")
                return {"status": "next_follow_up_saved"}

            if step == "notes":
                data["notes"] = None if text.lower() == "skip" else text
                summary = f"✅ Confirm Lead\n\n🏢 {data.get('company_name')}\n👤 {data.get('contact_person') or '—'}\n📞 {data.get('phone') or '—'}\n✉️ {data.get('email') or '—'}\n📂 {data.get('service') or '—'}\n💰 {data.get('quotation_amount') or '—'}\n🌐 {data.get('source') or '—'}\n📅 Follow-up: {data.get('next_follow_up') or '—'}\n📝 {data.get('notes') or '—'}"
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "confirm", "data": data}})
                await send_message(chat_id, summary, inline_keyboard([{"text": "✅ Confirm Lead", "callback": "confirm_lead"}]))
                return {"status": "notes_saved"}

        # ===================== TASK FLOW =====================
        if convo_type == "task":
            if step == "title":
                data["title"] = text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "description", "data": data}})
                await send_message(chat_id, "📝 Enter Description (or SKIP):")
                return {"status": "title_saved"}

            if step == "description":
                data["description"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "department", "data": data}})
                await send_message(chat_id, "📂 Select Department:", inline_keyboard([
                    {"text": d["label"], "callback": f"dept_{d['value']}"} for d in DEPARTMENTS
                ]))
                return {"status": "description_saved"}

            if step == "due_date":
                try:
                    due = datetime.fromisoformat(text) if "T" in text else datetime.fromisoformat(text + "T00:00:00")
                    data["due_date"] = due.isoformat()
                except:
                    await send_message(chat_id, "Invalid format. Use YYYY-MM-DD")
                    return {"status": "invalid_date"}
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "priority", "data": data}})
                await send_message(chat_id, "⚡ Select Priority:", inline_keyboard([
                    {"text": "Low", "callback": "priority_low"},
                    {"text": "Medium", "callback": "priority_medium"},
                    {"text": "High", "callback": "priority_high"},
                    {"text": "Critical", "callback": "priority_critical"},
                ]))
                return {"status": "due_date_saved"}

        # ===================== QUOTATION FLOW =====================
        if convo_type == "quotation":
            if step == "client_name":
                data["client_name"] = text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "client_phone", "data": data}})
                await send_message(chat_id, "📞 Enter Client Phone (or SKIP):")
                return {"status": "client_name_saved"}

            if step == "client_phone":
                data["client_phone"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "client_email", "data": data}})
                await send_message(chat_id, "✉️ Enter Client Email (or SKIP):")
                return {"status": "client_phone_saved"}

            if step == "client_email":
                data["client_email"] = None if text.lower() == "skip" else text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "service", "data": data}})
                await send_message(chat_id, "📂 Select Service:", inline_keyboard([
                    {"text": s, "callback": f"qservice_{s.lower()}"} for s in ["GST", "IT", "ACC", "TDS", "ROC", "DSC", "FEMA", "MSME", "TM", "OTHER"]
                ]))
                return {"status": "client_email_saved"}

            if step == "scope_of_work":
                data["scope_of_work"] = [s.strip() for s in text.split(",") if s.strip()]
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "amount", "data": data}})
                await send_message(chat_id, "💰 Enter Total Amount (₹):")
                return {"status": "scope_saved"}

            if step == "amount":
                try:
                    data["amount"] = float(text)
                except ValueError:
                    await send_message(chat_id, "Please enter a valid number.")
                    return {"status": "invalid_amount"}
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "gst_rate", "data": data}})
                await send_message(chat_id, "📊 Enter GST Rate % (or SKIP for 18):")
                return {"status": "amount_saved"}

            if step == "gst_rate":
                data["gst_rate"] = float(text) if text.lower() != "skip" else 18.0
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "payment_terms", "data": data}})
                await send_message(chat_id, "💵 Enter Payment Terms:")
                return {"status": "gst_saved"}

            if step == "payment_terms":
                data["payment_terms"] = text
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "timeline", "data": data}})
                await send_message(chat_id, "⏱️ Enter Timeline:")
                return {"status": "payment_terms_saved"}

            if step == "timeline":
                data["timeline"] = text
                summary = (
                    f"✅ Confirm Quotation\n\n"
                    f"👤 {data.get('client_name')}\n"
                    f"📞 {data.get('client_phone') or '—'}\n"
                    f"✉️ {data.get('client_email') or '—'}\n"
                    f"📂 {data.get('service')}\n"
                    f"📋 {', '.join(data.get('scope_of_work', []))}\n"
                    f"💰 ₹{data.get('amount')}\n"
                    f"📊 GST {data.get('gst_rate')}%\n"
                    f"💵 {data.get('payment_terms')}\n"
                    f"⏱️ {data.get('timeline')}"
                )
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "confirm", "data": data}})
                await send_message(chat_id, summary, inline_keyboard([{"text": "✅ Confirm & Generate PDF", "callback": "confirm_quotation"}]))
                return {"status": "timeline_saved"}

        return {"status": "unknown_step"}

    except Exception as e:
        print("Telegram Error:", str(e))
        try:
            if 'chat_id' in locals():
                await send_message(chat_id, "❌ An unexpected error occurred.")
        except:
            pass
        return {"status": "error"}
