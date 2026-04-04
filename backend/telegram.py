"""
telegram.py — v2.0
─────────────────────────────────────────────────────────────────────────────
NEW in v2.0:
  • /inv   → Full GST invoice creation via bot (all fields, multi-item loop)
  • /invlist → List your 10 most recent invoices with status
  • /invpdf <invoice_no>  → Get PDF of any invoice by number
  • /invemail <invoice_no> → Email invoice PDF to client
  • PDF is generated using the same _build_invoice_pdf engine as the web app
  • Email uses the same _send_email helper — no new infra needed

Existing flows preserved exactly:
  • /ts  → Create Task
  • /ld  → Create Lead  (admin / can_view_all_leads)
  • /qo  → Create Quotation + PDF
  • /mt  → My Tasks
  • /cl  → Cancel current action
  • /help → Help menu
"""

import uuid
import os
import asyncio
import httpx

from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Request
from backend.dependencies import db
from backend.notifications import create_notification

# ── Invoice helpers (shared with web app — no duplication) ────────────────────
from backend.invoicing import (
    _build_invoice_pdf,
    _compute_invoice_totals,
    _next_invoice_no,
    _send_email,
)

router = APIRouter(prefix="/telegram", tags=["Telegram"])

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_TOKEN:
    raise Exception("TELEGRAM_BOT_TOKEN not configured")

TELEGRAM_API    = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"
BACKEND_URL     = os.getenv("BACKEND_URL", "http://localhost:8000")
DEFAULT_COMPANY_ID = os.getenv("DEFAULT_COMPANY_ID", "")


# ═══════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════

DEPARTMENTS = [
    {"value": "gst",          "label": "GST"},
    {"value": "income_tax",   "label": "IT"},
    {"value": "accounts",     "label": "ACC"},
    {"value": "tds",          "label": "TDS"},
    {"value": "roc",          "label": "ROC"},
    {"value": "other",        "label": "OTHER"},
    {"value": "dsc",          "label": "DSC"},
    {"value": "fema",         "label": "FEMA"},
    {"value": "msme_smadhan", "label": "MSME"},
    {"value": "trademark",    "label": "TM"},
]

# ── Invoice-specific constants ────────────────────────────
INV_TYPES_TG = [
    {"value": "tax_invoice",  "label": "Tax Invoice"},
    {"value": "proforma",     "label": "Proforma"},
    {"value": "estimate",     "label": "Estimate"},
    {"value": "credit_note",  "label": "Credit Note"},
]

PAY_TERMS_TG = [
    "Due on receipt",
    "Due in 7 days",
    "Due in 15 days",
    "Due in 30 days",
    "Due in 45 days",
    "Due in 60 days",
    "Advance payment",
]

UNITS_TG     = ["service", "nos", "kg", "ltr", "hr", "day", "pcs", "month", "lot"]
GST_RATES_TG = [0, 5, 12, 18, 28]


# ═══════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════

async def send_message(chat_id: int, text: str, keyboard=None):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if keyboard:
        payload["reply_markup"] = keyboard
    async with httpx.AsyncClient() as client:
        await client.post(f"{TELEGRAM_API}/sendMessage", json=payload)


async def send_document(chat_id: int, file_bytes: bytes, filename: str = "invoice.pdf"):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{TELEGRAM_API}/sendDocument",
            data={"chat_id": chat_id},
            files={"document": (filename, file_bytes, "application/pdf")},
        )


def inline_keyboard(buttons, include_cancel: bool = True):
    """Build a Telegram inline keyboard from a list of {text, callback} dicts."""
    rows = [[{"text": b["text"], "callback_data": b["callback"]}] for b in buttons]
    if include_cancel:
        rows.append([{"text": "❌ Cancel", "callback_data": "cancel_convo"}])
    return {"inline_keyboard": rows}


def _safe_float(val, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _fmt_inr(amount) -> str:
    """Format a number as ₹ with commas."""
    try:
        return f"₹{float(amount):,.2f}"
    except Exception:
        return f"₹{amount}"


def _today() -> str:
    return date.today().isoformat()


def _today_plus(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


# ── Build a human-readable invoice summary for the confirm step ───────────────
def _build_invoice_summary(data: dict) -> str:
    inv_type_label = next(
        (t["label"] for t in INV_TYPES_TG if t["value"] == data.get("invoice_type", "tax_invoice")),
        "Tax Invoice"
    )

    # Items block
    items_lines = []
    for i, it in enumerate(data.get("items", []), 1):
        total_amt = _safe_float(it.get("total_amount") or it.get("unit_price", 0) * it.get("quantity", 1))
        disc_str  = f" | Disc {it.get('discount_pct', 0)}%" if it.get("discount_pct") else ""
        hsn_str   = f" | HSN: {it['hsn_sac']}" if it.get("hsn_sac") else ""
        items_lines.append(
            f"  {i}. {it.get('description','—')}\n"
            f"     {it.get('quantity',1)} {it.get('unit','service')} × {_fmt_inr(it.get('unit_price',0))}"
            f"{disc_str} | GST {it.get('gst_rate',18)}%{hsn_str}\n"
            f"     *Total: {_fmt_inr(total_amt)}*"
        )

    # Totals
    is_inter   = data.get("is_interstate", False)
    disc_extra = _safe_float(data.get("discount_amount"))
    shipping   = _safe_float(data.get("shipping_charges"))
    other      = _safe_float(data.get("other_charges"))

    taxable   = _safe_float(data.get("total_taxable"))
    total_gst = _safe_float(data.get("total_gst"))
    grand     = _safe_float(data.get("grand_total"))

    gst_line = (
        f"  IGST: {_fmt_inr(data.get('total_igst',0))}"
        if is_inter else
        f"  CGST: {_fmt_inr(data.get('total_cgst',0))} | SGST: {_fmt_inr(data.get('total_sgst',0))}"
    )

    extra_lines = []
    if disc_extra:  extra_lines.append(f"  Extra Disc: −{_fmt_inr(disc_extra)}")
    if shipping:    extra_lines.append(f"  Shipping: +{_fmt_inr(shipping)}")
    if other:       extra_lines.append(f"  Other Charges: +{_fmt_inr(other)}")

    supply_tag = "Interstate (IGST)" if is_inter else "Intrastate (CGST+SGST)"

    summary = (
        f"📄 *Invoice Preview*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🏢 *Company:* {data.get('company_name','—')}\n"
        f"📋 *Type:* {inv_type_label}\n"
        f"🏷 *Supply:* {supply_tag}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *Client:* {data.get('client_name','—')}\n"
    )
    if data.get("client_email"):   summary += f"📧 {data['client_email']}\n"
    if data.get("client_phone"):   summary += f"📞 {data['client_phone']}\n"
    if data.get("client_gstin"):   summary += f"🏷 GSTIN: `{data['client_gstin']}`\n"
    if data.get("client_address"): summary += f"📍 {data['client_address'][:60]}\n"
    if data.get("client_state"):   summary += f"📌 State: {data['client_state']}\n"

    summary += (
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📦 *Line Items:*\n"
        + "\n".join(items_lines) + "\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"  Taxable: {_fmt_inr(taxable)}\n"
        + gst_line + "\n"
        + ("  Total GST: " + _fmt_inr(total_gst) + "\n")
        + "\n".join(extra_lines) + ("\n" if extra_lines else "")
        + f"  💎 *Grand Total: {_fmt_inr(grand)}*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 Date: {data.get('invoice_date', _today())}\n"
        f"📆 Due:  {data.get('due_date', _today_plus(30))}\n"
    )
    if data.get("reference_no"):    summary += f"🔑 Ref: {data['reference_no']}\n"
    if data.get("payment_terms"):   summary += f"💳 Terms: {data['payment_terms']}\n"
    if data.get("notes"):           summary += f"📝 Notes: {data['notes']}\n"
    return summary


# ═══════════════════════════════════════════════════════════
# WEBHOOK
# ═══════════════════════════════════════════════════════════

@router.post("/webhook")
async def telegram_webhook(request: Request):  # noqa: C901  (complex but intentional)
    try:
        # ── Security ─────────────────────────────────────────────
        secret_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if secret_token != os.getenv("TELEGRAM_WEBHOOK_SECRET"):
            return {"status": "unauthorized"}

        payload = await request.json()

        # ═══════════════════════════════════════════════════════════
        # CALLBACK QUERY HANDLER
        # ═══════════════════════════════════════════════════════════
        if "callback_query" in payload:
            callback = payload["callback_query"]
            chat_id  = callback["message"]["chat"]["id"]
            clicked  = callback["data"]

            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{TELEGRAM_API}/answerCallbackQuery",
                    json={"callback_query_id": callback["id"]}
                )

            # ── Generic cancel ────────────────────────────────────
            if clicked == "cancel_convo":
                await db.telegram_conversations.delete_many({"telegram_id": chat_id})
                await send_message(chat_id, "❌ Action cancelled.")
                return {"status": "cancelled"}

            # ── Delete task shortcut ──────────────────────────────
            if clicked.startswith("delete_"):
                task_id = clicked.replace("delete_", "")
                await db.tasks.delete_one({"id": task_id})
                await send_message(chat_id, "🗑 Task deleted successfully.")
                return {"status": "task_deleted"}

            # Load conversation
            convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
            if not convo:
                return {"status": "no_convo"}

            data       = convo.get("data", {})
            convo_type = convo.get("type", "task")

            # ═══════════════════════════════════════════════════════
            # ── INVOICE CALLBACKS ──────────────────────────────────
            # ═══════════════════════════════════════════════════════
            if convo_type == "invoice":

                # Company selected
                if clicked.startswith("invc_company_"):
                    company_id   = clicked.replace("invc_company_", "")
                    company_doc  = await db.companies.find_one({"id": company_id}, {"_id": 0}) or {}
                    data["company_id"]   = company_id
                    data["company_name"] = company_doc.get("name", company_id)
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_type", "data": data}}
                    )
                    await send_message(
                        chat_id, "📋 Select Invoice Type:",
                        inline_keyboard([
                            {"text": t["label"], "callback": f"invc_type_{t['value']}"}
                            for t in INV_TYPES_TG
                        ])
                    )
                    return {"status": "inv_company_selected"}

                # Invoice type selected
                if clicked.startswith("invc_type_"):
                    data["invoice_type"] = clicked.replace("invc_type_", "")
                    # Offer existing clients
                    clients = await db.clients.find({}, {"_id": 0}).to_list(30)
                    buttons = [
                        {"text": c["company_name"][:30], "callback": f"invc_client_{c['id']}"}
                        for c in clients
                    ]
                    buttons.append({"text": "✏️ Enter manually", "callback": "invc_client_manual"})
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_client_select", "data": data}}
                    )
                    await send_message(
                        chat_id, "🏢 Select existing client or enter manually:",
                        inline_keyboard(buttons)
                    )
                    return {"status": "inv_type_selected"}

                # Existing client selected
                if clicked.startswith("invc_client_") and clicked != "invc_client_manual":
                    client_id  = clicked.replace("invc_client_", "")
                    client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0}) or {}
                    data["client_id"]      = client_id
                    data["client_name"]    = client_doc.get("company_name", "")
                    data["client_email"]   = client_doc.get("email", "")
                    data["client_phone"]   = client_doc.get("phone", "")
                    data["client_gstin"]   = client_doc.get("client_gstin", "") or client_doc.get("gstin", "")
                    addr_parts             = [client_doc.get("address",""), client_doc.get("city",""), client_doc.get("state","")]
                    data["client_address"] = ", ".join(p for p in addr_parts if p)
                    data["client_state"]   = client_doc.get("state", "")
                    # skip manual entry — go straight to supply state
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_supply_state", "data": data}}
                    )
                    await send_message(
                        chat_id,
                        f"✅ Client auto-filled: *{data['client_name']}*\n\n"
                        f"🏛 Enter *your supply state* (e.g. Gujarat) — used to determine IGST vs CGST/SGST.\n"
                        f"Type SKIP if unsure (defaults to intrastate)."
                    )
                    return {"status": "inv_client_autofilled"}

                # Manual client entry
                if clicked == "invc_client_manual":
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_client_name", "data": data}}
                    )
                    await send_message(chat_id, "👤 Enter *Client / Company Name*:")
                    return {"status": "inv_client_manual"}

                # Payment terms
                if clicked.startswith("invc_terms_"):
                    idx = int(clicked.replace("invc_terms_", ""))
                    data["payment_terms"] = PAY_TERMS_TG[idx]
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_item_desc", "data": data}}
                    )
                    await send_message(
                        chat_id,
                        f"✅ Terms: *{data['payment_terms']}*\n\n"
                        f"📦 Now let's add *Line Items*.\n\n"
                        f"Enter *Item Description* (e.g. GST Filing, Software License):"
                    )
                    return {"status": "inv_terms_selected"}

                # Item unit
                if clicked.startswith("invc_unit_"):
                    data.setdefault("current_item", {})["unit"] = clicked.replace("invc_unit_", "")
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_item_price", "data": data}}
                    )
                    await send_message(chat_id, f"💰 Enter *Unit Price* (₹):")
                    return {"status": "inv_unit_selected"}

                # Item GST rate
                if clicked.startswith("invc_gst_"):
                    rate = float(clicked.replace("invc_gst_", ""))
                    ci   = data.get("current_item", {})
                    ci["gst_rate"] = rate
                    # Compute this item's amounts
                    is_inter = data.get("is_interstate", False)
                    disc  = ci.get("unit_price", 0) * ci.get("quantity", 1) * ci.get("discount_pct", 0) / 100
                    tax   = round(ci.get("unit_price", 0) * ci.get("quantity", 1) - disc, 2)
                    if is_inter:
                        igst = round(tax * rate / 100, 2)
                        ci.update(taxable_value=tax, cgst_rate=0, sgst_rate=0, igst_rate=rate,
                                  cgst_amount=0, sgst_amount=0, igst_amount=igst,
                                  total_amount=round(tax + igst, 2))
                    else:
                        half = rate / 2
                        cg   = round(tax * half / 100, 2)
                        ci.update(taxable_value=tax, cgst_rate=half, sgst_rate=half, igst_rate=0,
                                  cgst_amount=cg, sgst_amount=cg, igst_amount=0,
                                  total_amount=round(tax + cg * 2, 2))
                    data.setdefault("items", []).append(ci)
                    data["current_item"] = {}
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_more_items", "data": data}}
                    )
                    await send_message(
                        chat_id,
                        f"✅ Item added — *{ci.get('description','Item')}* → {_fmt_inr(ci.get('total_amount',0))}\n\n"
                        f"Total items so far: {len(data['items'])}",
                        inline_keyboard([
                            {"text": "➕ Add Another Item",  "callback": "invc_more_yes"},
                            {"text": "✅ Done — Next Step",   "callback": "invc_more_no"},
                        ], include_cancel=True)
                    )
                    return {"status": "inv_item_added"}

                # More items?
                if clicked == "invc_more_yes":
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_item_desc", "data": data}}
                    )
                    await send_message(chat_id, f"📦 Enter *Item Description* for item #{len(data.get('items',[])) + 1}:")
                    return {"status": "inv_more_items_yes"}

                if clicked == "invc_more_no":
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "inv_extra_disc", "data": data}}
                    )
                    await send_message(
                        chat_id,
                        f"💸 Enter *additional discount amount* (₹) to deduct from total, or SKIP:"
                    )
                    return {"status": "inv_more_items_no"}

                # Confirm invoice creation
                if clicked == "confirm_invoice":
                    return await _handle_confirm_invoice(chat_id, data)

                # Resend PDF callback from invlist
                if clicked.startswith("inv_getpdf_"):
                    inv_id = clicked.replace("inv_getpdf_", "")
                    return await _send_invoice_pdf_by_id(chat_id, inv_id)

                # Email invoice callback from invlist
                if clicked.startswith("inv_email_"):
                    inv_id = clicked.replace("inv_email_", "")
                    return await _send_invoice_email_by_id(chat_id, inv_id)

            # ═══════════════════════════════════════════════════════
            # ── LEAD CALLBACKS (unchanged) ─────────────────────────
            # ═══════════════════════════════════════════════════════
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
                    assignee_id   = clicked.replace("lead_assign_", "")
                    data["assigned_to"] = None if assignee_id == "unassigned" else assignee_id
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "next_follow_up", "data": data}}
                    )
                    await send_message(chat_id, "📅 Enter Next Follow-up Date (YYYY-MM-DD) or SKIP:")
                    return {"status": "lead_assignee_selected"}

            # ═══════════════════════════════════════════════════════
            # ── QUOTATION CALLBACKS (unchanged) ────────────────────
            # ═══════════════════════════════════════════════════════
            if convo_type == "quotation":
                if clicked.startswith("qservice_"):
                    data["service"] = clicked.replace("qservice_", "").upper()
                    await db.telegram_conversations.update_one(
                        {"telegram_id": chat_id},
                        {"$set": {"step": "scope_of_work", "data": data}}
                    )
                    await send_message(chat_id, "📋 Enter Scope of Work (comma separated):")
                    return {"status": "service_selected"}

            # ═══════════════════════════════════════════════════════
            # ── TASK CALLBACKS (unchanged) ─────────────────────────
            # ═══════════════════════════════════════════════════════
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
                users   = await db.users.find({}, {"_id": 0}).to_list(50)
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
                data["assigned_to"]   = None if assignee == "unassigned" else assignee
                data["sub_assignees"] = []
                users   = await db.users.find({}, {"_id": 0}).to_list(50)
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
                    await send_message(chat_id, "⚡ Select Priority:", inline_keyboard([
                        {"text": "Low",      "callback": "priority_low"},
                        {"text": "Medium",   "callback": "priority_medium"},
                        {"text": "High",     "callback": "priority_high"},
                        {"text": "Critical", "callback": "priority_critical"},
                    ]))
                    return {"status": "sub_done"}
                if uid not in data.get("sub_assignees", []):
                    data.setdefault("sub_assignees", []).append(uid)
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id}, {"$set": {"data": data}}
                )
                return {"status": "sub_added"}

            if clicked.startswith("priority_"):
                data["priority"] = clicked.replace("priority_", "")
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "confirm", "data": data}}
                )
                await send_message(chat_id, "✅ Ready to create task?",
                    inline_keyboard([{"text": "✅ Confirm Task", "callback": "confirm_task"}]))
                return {"status": "priority_selected"}

            if clicked.startswith("status_"):
                data["status"] = clicked.replace("status_", "")
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "recurring", "data": data}}
                )
                await send_message(chat_id, "🔁 Is this recurring?", inline_keyboard([
                    {"text": "Yes", "callback": "rec_yes"},
                    {"text": "No",  "callback": "rec_no"},
                ]))
                return {"status": "status_selected"}

            if clicked == "rec_yes":
                data["is_recurring"] = True
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "pattern", "data": data}}
                )
                await send_message(chat_id, "Repeat Pattern:", inline_keyboard([
                    {"text": "Daily",   "callback": "pattern_daily"},
                    {"text": "Weekly",  "callback": "pattern_weekly"},
                    {"text": "Monthly", "callback": "pattern_monthly"},
                    {"text": "Yearly",  "callback": "pattern_yearly"},
                ]))
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

            # ── Confirm lead ──────────────────────────────────────
            if clicked == "confirm_lead":
                try:
                    user = await db.users.find_one({"telegram_id": chat_id})
                    now  = datetime.now(timezone.utc)
                    follow_up = None
                    if data.get("next_follow_up"):
                        try:
                            follow_up = datetime.fromisoformat(data["next_follow_up"])
                        except Exception:
                            follow_up = None
                    new_lead = {
                        "company_name":     data.get("company_name"),
                        "contact_name":     data.get("contact_person"),
                        "email":            data.get("email"),
                        "phone":            data.get("phone"),
                        "services":         [data["service"]] if data.get("service") else [],
                        "quotation_amount": float(data.get("quotation_amount") or 0) if data.get("quotation_amount") else None,
                        "status":           "new",
                        "source":           data.get("source"),
                        "next_follow_up":   follow_up,
                        "notes":            data.get("notes"),
                        "assigned_to":      data.get("assigned_to") or None,
                        "created_by":       user["id"] if user else "telegram_bot",
                        "created_at":       now,
                        "updated_at":       now,
                    }
                    await db.leads.insert_one(new_lead)
                    if new_lead.get("assigned_to"):
                        await create_notification(
                            user_id=new_lead["assigned_to"],
                            title="New Lead Assigned",
                            message=f"Lead '{new_lead['company_name']}' assigned to you",
                            type="lead"
                        )
                    await db.telegram_conversations.delete_one({"telegram_id": chat_id})
                    await send_message(chat_id, f"✅ Lead *{new_lead['company_name']}* created!")
                    return {"status": "lead_created"}
                except Exception as e:
                    await send_message(chat_id, f"❌ Error: {e}")
                    return {"status": "error"}

            # ── Confirm task ──────────────────────────────────────
            if clicked == "confirm_task":
                try:
                    now  = datetime.now(timezone.utc)
                    user = await db.users.find_one({"telegram_id": chat_id})
                    if not user:
                        await send_message(chat_id, "User not found.")
                        return {"status": "user_not_found"}
                    new_task = {
                        "id":                  str(uuid.uuid4()),
                        "title":               data.get("title"),
                        "description":         data.get("description"),
                        "assigned_to":         data.get("assigned_to") or None,
                        "sub_assignees":       data.get("sub_assignees", []),
                        "priority":            data.get("priority", "medium"),
                        "status":              data.get("status", "pending"),
                        "category":            data.get("category"),
                        "client_id":           data.get("client_id"),
                        "is_recurring":        data.get("is_recurring", False),
                        "recurrence_pattern":  data.get("recurrence_pattern"),
                        "recurrence_interval": data.get("recurrence_interval", 1),
                        "created_by":          user["id"],
                        "created_at":          now,
                        "updated_at":          now,
                        "due_date":            data.get("due_date"),
                        "type":                "task",
                    }
                    await db.tasks.insert_one(new_task)
                    await db.telegram_conversations.delete_many({"telegram_id": chat_id})
                    if new_task.get("assigned_to"):
                        await create_notification(
                            user_id=new_task["assigned_to"],
                            title="New Task Assigned",
                            message=f"Task '{new_task['title']}' assigned via Telegram",
                            type="assignment"
                        )
                    await send_message(chat_id, "✅ Task Created Successfully!")
                    return {"status": "task_created"}
                except Exception as e:
                    await send_message(chat_id, f"❌ Error creating task: {e}")
                    return {"status": "error"}

            # ── Confirm quotation ─────────────────────────────────
            if clicked == "confirm_quotation":
                try:
                    if not DEFAULT_COMPANY_ID:
                        await send_message(chat_id, "❌ DEFAULT_COMPANY_ID not configured.")
                        return {"status": "config_error"}
                    quotation_payload = {
                        "company_id":    DEFAULT_COMPANY_ID,
                        "client_name":   data.get("client_name"),
                        "client_phone":  data.get("client_phone"),
                        "client_email":  data.get("client_email"),
                        "service":       data.get("service"),
                        "scope_of_work": data.get("scope_of_work", []),
                        "items": [{
                            "description": data.get("service"),
                            "quantity":    1,
                            "unit_price":  float(data.get("amount") or 0),
                            "amount":      float(data.get("amount") or 0),
                        }],
                        "gst_rate":      float(data.get("gst_rate") or 18),
                        "payment_terms": data.get("payment_terms"),
                        "timeline":      data.get("timeline"),
                    }
                    async with httpx.AsyncClient() as client:
                        r = await client.post(f"{BACKEND_URL}/quotations", json=quotation_payload, timeout=30.0)
                        r.raise_for_status()
                        q_data = r.json()
                        q_id   = q_data.get("id") or q_data.get("_id")
                    async with httpx.AsyncClient() as client:
                        pdf_r = await client.get(f"{BACKEND_URL}/quotations/{q_id}/pdf", timeout=30.0)
                        pdf_r.raise_for_status()
                        pdf_bytes = pdf_r.content
                    await send_document(chat_id, pdf_bytes, f"Quotation_{q_id[:8]}.pdf")
                    await db.telegram_conversations.delete_one({"telegram_id": chat_id})
                    await send_message(chat_id, f"✅ Quotation created!\nID: `{q_id}`\n📄 PDF sent above.")
                    return {"status": "quotation_created"}
                except Exception as e:
                    await send_message(chat_id, f"❌ Error: {e}")
                    return {"status": "error"}

            return {"status": "unknown_callback"}

        # ═══════════════════════════════════════════════════════════
        # TEXT MESSAGE HANDLER
        # ═══════════════════════════════════════════════════════════
        if "message" not in payload:
            return {"status": "ignored"}

        message = payload["message"]
        chat_id = message["chat"]["id"]
        text    = message.get("text", "").strip()

        # ── Help ──────────────────────────────────────────────────
        if text.lower() in ["/help", "/h"]:
            await send_message(chat_id,
                "🤖 *Available Commands*\n\n"
                "📄 *Invoicing*\n"
                "• `/inv`  → Create new GST invoice\n"
                "• `/invlist` → List recent invoices\n"
                "• `/invpdf INV-0001` → Get PDF of invoice\n"
                "• `/invemail INV-0001` → Email invoice to client\n\n"
                "📋 *Tasks & CRM*\n"
                "• `/ld`   → New Lead\n"
                "• `/ts`   → New Task\n"
                "• `/qo`   → New Quotation (PDF)\n"
                "• `/mt`   → My Tasks\n"
                "• `/cl`   → Cancel current action\n"
                "• `/help` → This menu"
            )
            return {"status": "help"}

        # ── Lead ──────────────────────────────────────────────────
        if text.lower() in ["/ld", "/lead"]:
            user = await db.users.find_one({"telegram_id": chat_id})
            if not (user and (user.get("role") == "admin" or user.get("permissions", {}).get("can_view_all_leads"))):
                await send_message(chat_id, "🚫 You do not have permission to add leads.")
                return {"status": "unauthorized"}
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "company_name", "type": "lead", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "🏢 Enter Company Name:")
            return {"status": "lead_started"}

        # ── Task ──────────────────────────────────────────────────
        if text.lower() in ["/ts", "/task", "/start"]:
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "title", "type": "task", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "📝 Enter Task Title:")
            return {"status": "task_started"}

        # ── Quotation ─────────────────────────────────────────────
        if text.lower() in ["/qo", "/quotation"]:
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "client_name", "type": "quotation", "data": {}}},
                upsert=True
            )
            await send_message(chat_id, "👤 Enter Client Name:")
            return {"status": "quotation_started"}

        # ── Cancel ────────────────────────────────────────────────
        if text.lower() in ["/cl", "/cancel"]:
            await db.telegram_conversations.delete_many({"telegram_id": chat_id})
            await send_message(chat_id, "❌ Action cancelled.")
            return {"status": "cancelled"}

        # ── My Tasks ──────────────────────────────────────────────
        if text.lower() in ["/mt", "/mytasks"]:
            user = await db.users.find_one({"telegram_id": chat_id})
            if not user:
                await send_message(chat_id, "❌ Your Telegram is not linked to a user account.")
                return {"status": "no_user"}
            tasks = await db.tasks.find(
                {"$or": [
                    {"created_by": user["id"]},
                    {"assigned_to": user["id"]},
                    {"sub_assignees": user["id"]}
                ]}, {"_id": 0}
            ).to_list(20)
            if not tasks:
                await send_message(chat_id, "No tasks found.")
                return {"status": "no_tasks"}
            for task in tasks:
                await send_message(
                    chat_id,
                    f"📋 *{task['title']}*\n📅 Due: {task.get('due_date','—')}",
                    inline_keyboard([{"text": "🗑 Delete", "callback": f"delete_{task['id']}"}])
                )
            return {"status": "tasks_listed"}

        # ════════════════════════════════════════════════════════
        # ── INVOICE COMMANDS ────────────────────────────────────
        # ════════════════════════════════════════════════════════

        # /inv — start invoice creation
        if text.lower() in ["/inv", "/invoice"]:
            companies = await db.companies.find({}, {"_id": 0}).to_list(20)
            if not companies:
                await send_message(
                    chat_id,
                    "❌ No company profiles found. Create one in the web app first."
                )
                return {"status": "no_companies"}
            await db.telegram_conversations.update_one(
                {"telegram_id": chat_id},
                {"$set": {"step": "inv_company", "type": "invoice", "data": {"items": [], "current_item": {}}}},
                upsert=True
            )
            await send_message(
                chat_id,
                "🧾 *Create Invoice* — I'll guide you through every field.\n\n"
                "🏢 *Step 1:* Select your Company Profile:",
                inline_keyboard([
                    {"text": c["name"][:40], "callback": f"invc_company_{c['id']}"}
                    for c in companies
                ])
            )
            return {"status": "inv_started"}

        # /invlist — list recent invoices
        if text.lower() in ["/invlist", "/invoicelist"]:
            return await _cmd_invlist(chat_id)

        # /invpdf [invoice_no] — get PDF
        if text.lower().startswith("/invpdf"):
            parts   = text.split(maxsplit=1)
            inv_no  = parts[1].strip() if len(parts) > 1 else ""
            if inv_no:
                inv = await db.invoices.find_one(
                    {"invoice_no": {"$regex": inv_no, "$options": "i"}}, {"_id": 0}
                )
                if inv:
                    return await _send_invoice_pdf_by_id(chat_id, inv["id"])
                else:
                    await send_message(chat_id, f"❌ No invoice found matching `{inv_no}`.")
                    return {"status": "not_found"}
            else:
                return await _cmd_invlist(chat_id, action="pdf")

        # /invemail [invoice_no] — email invoice
        if text.lower().startswith("/invemail"):
            parts  = text.split(maxsplit=1)
            inv_no = parts[1].strip() if len(parts) > 1 else ""
            if inv_no:
                inv = await db.invoices.find_one(
                    {"invoice_no": {"$regex": inv_no, "$options": "i"}}, {"_id": 0}
                )
                if inv:
                    return await _send_invoice_email_by_id(chat_id, inv["id"])
                else:
                    await send_message(chat_id, f"❌ No invoice found matching `{inv_no}`.")
                    return {"status": "not_found"}
            else:
                return await _cmd_invlist(chat_id, action="email")

        # ── Load existing conversation ────────────────────────────
        convo = await db.telegram_conversations.find_one({"telegram_id": chat_id})
        if not convo:
            await send_message(
                chat_id,
                "👋 *Welcome to TaskOsphere Bot!*\n\n"
                "📄 *Invoicing:* `/inv` · `/invlist` · `/invpdf` · `/invemail`\n"
                "📋 *CRM / Tasks:* `/ld` · `/ts` · `/qo` · `/mt`\n"
                "❌ Cancel: `/cl`  |  Help: `/help`"
            )
            return {"status": "welcome"}

        step       = convo.get("step")
        data       = convo.get("data", {})
        convo_type = convo.get("type", "task")

        # ════════════════════════════════════════════════════════
        # ── INVOICE FLOW STEPS ──────────────────────────────────
        # ════════════════════════════════════════════════════════
        if convo_type == "invoice":
            # Client name (manual entry)
            if step == "inv_client_name":
                data["client_name"] = text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_client_email", "data": data}}
                )
                await send_message(chat_id, "📧 Enter *Client Email* (or SKIP):")
                return {"status": "inv_client_name_saved"}

            if step == "inv_client_email":
                data["client_email"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_client_phone", "data": data}}
                )
                await send_message(chat_id, "📞 Enter *Client Phone* (or SKIP):")
                return {"status": "inv_client_email_saved"}

            if step == "inv_client_phone":
                data["client_phone"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_client_gstin", "data": data}}
                )
                await send_message(chat_id, "🏷 Enter *Client GSTIN* (15 chars) or SKIP:")
                return {"status": "inv_client_phone_saved"}

            if step == "inv_client_gstin":
                data["client_gstin"] = "" if text.lower() == "skip" else text.upper()
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_client_address", "data": data}}
                )
                await send_message(chat_id, "📍 Enter *Billing Address* (or SKIP):")
                return {"status": "inv_client_gstin_saved"}

            if step == "inv_client_address":
                data["client_address"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_client_state", "data": data}}
                )
                await send_message(chat_id, "📌 Enter *Client State* (e.g. Gujarat) or SKIP:")
                return {"status": "inv_client_address_saved"}

            if step == "inv_client_state":
                data["client_state"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_supply_state", "data": data}}
                )
                await send_message(
                    chat_id,
                    "🏛 Enter *your supply state* (e.g. Gujarat) or SKIP.\n"
                    "_Used to determine IGST (interstate) vs CGST+SGST (intrastate)._"
                )
                return {"status": "inv_client_state_saved"}

            if step == "inv_supply_state":
                supply_state = "" if text.lower() == "skip" else text
                data["supply_state"]  = supply_state
                # Auto-detect interstate
                cs = (data.get("client_state") or "").strip().lower()
                ss = supply_state.strip().lower()
                data["is_interstate"] = bool(cs and ss and cs != ss)
                inter_msg = (
                    "🌐 *Interstate supply detected* — IGST will apply."
                    if data["is_interstate"]
                    else "🏠 *Intrastate supply* — CGST + SGST will apply."
                )
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_date", "data": data}}
                )
                await send_message(
                    chat_id,
                    f"{inter_msg}\n\n"
                    f"📅 Enter *Invoice Date* (YYYY-MM-DD) or SKIP (defaults to today {_today()}):"
                )
                return {"status": "inv_supply_state_saved"}

            if step == "inv_date":
                if text.lower() == "skip" or not text.strip():
                    data["invoice_date"] = _today()
                else:
                    try:
                        datetime.strptime(text.strip(), "%Y-%m-%d")
                        data["invoice_date"] = text.strip()
                    except ValueError:
                        await send_message(chat_id, "❌ Invalid date. Use YYYY-MM-DD or SKIP.")
                        return {"status": "invalid_date"}
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_due_date", "data": data}}
                )
                await send_message(
                    chat_id,
                    f"📆 Enter *Due Date* (YYYY-MM-DD) or SKIP (defaults to +30 days: {_today_plus(30)}):"
                )
                return {"status": "inv_date_saved"}

            if step == "inv_due_date":
                if text.lower() == "skip" or not text.strip():
                    data["due_date"] = _today_plus(30)
                else:
                    try:
                        datetime.strptime(text.strip(), "%Y-%m-%d")
                        data["due_date"] = text.strip()
                    except ValueError:
                        await send_message(chat_id, "❌ Invalid date. Use YYYY-MM-DD or SKIP.")
                        return {"status": "invalid_date"}
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_reference", "data": data}}
                )
                await send_message(chat_id, "🔑 Enter *Reference / PO Number* or SKIP:")
                return {"status": "inv_due_date_saved"}

            if step == "inv_reference":
                data["reference_no"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_payment_terms", "data": data}}
                )
                await send_message(
                    chat_id,
                    "💳 Select *Payment Terms*:",
                    inline_keyboard([
                        {"text": t, "callback": f"invc_terms_{i}"}
                        for i, t in enumerate(PAY_TERMS_TG)
                    ])
                )
                return {"status": "inv_reference_saved"}

            # ── Item entry loop ───────────────────────────────────
            if step == "inv_item_desc":
                data.setdefault("current_item", {})["description"] = text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_item_hsn", "data": data}}
                )
                await send_message(chat_id, "🏷 Enter *HSN / SAC code* (or SKIP):")
                return {"status": "inv_item_desc_saved"}

            if step == "inv_item_hsn":
                data.setdefault("current_item", {})["hsn_sac"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_item_qty", "data": data}}
                )
                await send_message(chat_id, "🔢 Enter *Quantity* (e.g. 1, 2.5):")
                return {"status": "inv_item_hsn_saved"}

            if step == "inv_item_qty":
                try:
                    qty = float(text)
                    if qty <= 0: raise ValueError
                except ValueError:
                    await send_message(chat_id, "❌ Enter a valid positive number.")
                    return {"status": "invalid_qty"}
                data.setdefault("current_item", {})["quantity"] = qty
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_item_unit", "data": data}}
                )
                await send_message(
                    chat_id, "📦 Select *Unit*:",
                    inline_keyboard([
                        {"text": u, "callback": f"invc_unit_{u}"} for u in UNITS_TG
                    ])
                )
                return {"status": "inv_item_qty_saved"}

            if step == "inv_item_price":
                try:
                    price = float(text)
                    if price < 0: raise ValueError
                except ValueError:
                    await send_message(chat_id, "❌ Enter a valid price (e.g. 5000).")
                    return {"status": "invalid_price"}
                data.setdefault("current_item", {})["unit_price"] = price
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_item_disc", "data": data}}
                )
                await send_message(chat_id, "💸 Enter *Discount %* (0–100) or SKIP (0%):")
                return {"status": "inv_item_price_saved"}

            if step == "inv_item_disc":
                disc = 0.0
                if text.lower() != "skip":
                    try:
                        disc = float(text)
                        if not (0 <= disc <= 100): raise ValueError
                    except ValueError:
                        await send_message(chat_id, "❌ Enter a number between 0 and 100, or SKIP.")
                        return {"status": "invalid_disc"}
                data.setdefault("current_item", {})["discount_pct"] = disc
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_item_gst", "data": data}}
                )
                await send_message(
                    chat_id, "📊 Select *GST Rate*:",
                    inline_keyboard([
                        {"text": f"{r}%", "callback": f"invc_gst_{r}"} for r in GST_RATES_TG
                    ])
                )
                return {"status": "inv_item_disc_saved"}

            # ── After items: additional charges ──────────────────
            if step == "inv_extra_disc":
                data["discount_amount"] = 0.0
                if text.lower() != "skip":
                    try:
                        data["discount_amount"] = float(text)
                    except ValueError:
                        await send_message(chat_id, "❌ Enter a valid amount or SKIP.")
                        return {"status": "invalid_amount"}
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_shipping", "data": data}}
                )
                await send_message(chat_id, "🚚 Enter *Shipping Charges* (₹) or SKIP:")
                return {"status": "inv_extra_disc_saved"}

            if step == "inv_shipping":
                data["shipping_charges"] = 0.0
                if text.lower() != "skip":
                    try:
                        data["shipping_charges"] = float(text)
                    except ValueError:
                        await send_message(chat_id, "❌ Enter a valid amount or SKIP.")
                        return {"status": "invalid_amount"}
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_other_charges", "data": data}}
                )
                await send_message(chat_id, "🏷 Enter *Other Charges* (₹) or SKIP:")
                return {"status": "inv_shipping_saved"}

            if step == "inv_other_charges":
                data["other_charges"] = 0.0
                if text.lower() != "skip":
                    try:
                        data["other_charges"] = float(text)
                    except ValueError:
                        await send_message(chat_id, "❌ Enter a valid amount or SKIP.")
                        return {"status": "invalid_amount"}
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_notes", "data": data}}
                )
                await send_message(chat_id, "📝 Enter *Notes* to print on invoice (or SKIP):")
                return {"status": "inv_other_charges_saved"}

            if step == "inv_notes":
                data["notes"] = "" if text.lower() == "skip" else text
                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_terms_conditions", "data": data}}
                )
                await send_message(chat_id, "📜 Enter *Terms & Conditions* (or SKIP):")
                return {"status": "inv_notes_saved"}

            if step == "inv_terms_conditions":
                data["terms_conditions"] = "" if text.lower() == "skip" else text
                # Recompute totals with all items
                inv_for_totals = {
                    "items":            data.get("items", []),
                    "is_interstate":    data.get("is_interstate", False),
                    "discount_amount":  data.get("discount_amount", 0),
                    "shipping_charges": data.get("shipping_charges", 0),
                    "other_charges":    data.get("other_charges", 0),
                }
                try:
                    computed = _compute_invoice_totals(inv_for_totals)
                    data.update({
                        "items":          computed["items"],
                        "subtotal":       computed["subtotal"],
                        "total_discount": computed["total_discount"],
                        "total_taxable":  computed["total_taxable"],
                        "total_cgst":     computed["total_cgst"],
                        "total_sgst":     computed["total_sgst"],
                        "total_igst":     computed["total_igst"],
                        "total_gst":      computed["total_gst"],
                        "grand_total":    computed["grand_total"],
                    })
                except Exception as e:
                    await send_message(chat_id, f"❌ Calculation error: {e}")
                    return {"status": "calc_error"}

                await db.telegram_conversations.update_one(
                    {"telegram_id": chat_id},
                    {"$set": {"step": "inv_confirm", "data": data}}
                )
                summary = _build_invoice_summary(data)
                await send_message(
                    chat_id, summary,
                    inline_keyboard([
                        {"text": "✅ Confirm & Create Invoice",  "callback": "confirm_invoice"},
                        {"text": "❌ Cancel",                     "callback": "cancel_convo"},
                    ], include_cancel=False)
                )
                return {"status": "inv_confirm_shown"}

            return {"status": "inv_unknown_step"}

        # ═══════════════════════════════════════════════════════════
        # ── LEAD FLOW (unchanged) ──────────────────────────────────
        # ═══════════════════════════════════════════════════════════
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
                data["quotation_amount"] = None if text.lower() == "skip" else _safe_float(text) or None
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "source", "data": data}})
                await send_message(chat_id, "🌐 Select Source:", inline_keyboard([
                    {"text": s, "callback": f"source_{s.lower().replace(' ', '_')}"} for s in ["Direct", "Website", "Referral", "Social Media", "Event"]
                ]))
                return {"status": "quotation_amount_saved"}
            if step == "next_follow_up":
                if text.lower() != "skip":
                    try:
                        dt = datetime.fromisoformat(text) if "T" in text else datetime.fromisoformat(text + "T00:00:00")
                        data["next_follow_up"] = dt.isoformat()
                    except Exception:
                        await send_message(chat_id, "Invalid date. Use YYYY-MM-DD or SKIP.")
                        return {"status": "invalid_date"}
                else:
                    data["next_follow_up"] = None
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "notes", "data": data}})
                await send_message(chat_id, "📝 Enter Notes (or SKIP):")
                return {"status": "next_follow_up_saved"}
            if step == "notes":
                data["notes"] = None if text.lower() == "skip" else text
                summary = (
                    f"✅ *Confirm Lead*\n\n"
                    f"🏢 {data.get('company_name')}\n"
                    f"👤 {data.get('contact_person') or '—'}\n"
                    f"📞 {data.get('phone') or '—'}\n"
                    f"✉️ {data.get('email') or '—'}\n"
                    f"📂 {data.get('service') or '—'}\n"
                    f"💰 {data.get('quotation_amount') or '—'}\n"
                    f"🌐 {data.get('source') or '—'}\n"
                    f"📅 Follow-up: {data.get('next_follow_up') or '—'}\n"
                    f"📝 {data.get('notes') or '—'}"
                )
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "confirm", "data": data}})
                await send_message(chat_id, summary, inline_keyboard([{"text": "✅ Confirm Lead", "callback": "confirm_lead"}]))
                return {"status": "notes_saved"}

        # ═══════════════════════════════════════════════════════════
        # ── TASK FLOW (unchanged) ──────────────────────────────────
        # ═══════════════════════════════════════════════════════════
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
                except Exception:
                    await send_message(chat_id, "Invalid format. Use YYYY-MM-DD")
                    return {"status": "invalid_date"}
                await db.telegram_conversations.update_one({"telegram_id": chat_id}, {"$set": {"step": "priority", "data": data}})
                await send_message(chat_id, "⚡ Select Priority:", inline_keyboard([
                    {"text": "Low",      "callback": "priority_low"},
                    {"text": "Medium",   "callback": "priority_medium"},
                    {"text": "High",     "callback": "priority_high"},
                    {"text": "Critical", "callback": "priority_critical"},
                ]))
                return {"status": "due_date_saved"}

        # ═══════════════════════════════════════════════════════════
        # ── QUOTATION FLOW (unchanged) ─────────────────────────────
        # ═══════════════════════════════════════════════════════════
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
                    f"✅ *Confirm Quotation*\n\n"
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
        import traceback
        traceback.print_exc()
        try:
            if "chat_id" in locals():
                await send_message(chat_id, "❌ An unexpected error occurred. Please try again.")
        except Exception:
            pass
        return {"status": "error", "detail": str(e)}


# ═══════════════════════════════════════════════════════════
# INVOICE HELPER COROUTINES
# (called from both callback and text handlers)
# ═══════════════════════════════════════════════════════════

async def _handle_confirm_invoice(chat_id: int, data: dict) -> dict:
    """Create invoice in DB, generate PDF, send it via Telegram."""
    try:
        now       = datetime.now(timezone.utc).isoformat()
        user      = await db.users.find_one({"telegram_id": chat_id})
        created_by = user["id"] if user else "telegram_bot"

        company_id = data.get("company_id") or DEFAULT_COMPANY_ID
        if not company_id:
            await send_message(chat_id, "❌ No company ID available. Set DEFAULT_COMPANY_ID or select a company.")
            return {"status": "no_company"}

        # Generate invoice number
        inv_type   = data.get("invoice_type", "tax_invoice")
        prefix_map = {"proforma": "PRO", "estimate": "EST", "credit_note": "CN", "debit_note": "DN"}
        prefix     = prefix_map.get(inv_type, "INV")
        inv_no     = await _next_invoice_no(prefix, company_id)

        grand_total = _safe_float(data.get("grand_total"))

        invoice_doc = {
            "id":                 str(uuid.uuid4()),
            "invoice_no":         inv_no,
            "invoice_type":       inv_type,
            "company_id":         company_id,
            "client_id":          data.get("client_id"),
            "client_name":        data.get("client_name", ""),
            "client_email":       data.get("client_email", ""),
            "client_phone":       data.get("client_phone", ""),
            "client_gstin":       data.get("client_gstin", ""),
            "client_address":     data.get("client_address", ""),
            "client_state":       data.get("client_state", ""),
            "supply_state":       data.get("supply_state", ""),
            "is_interstate":      data.get("is_interstate", False),
            "invoice_date":       data.get("invoice_date", _today()),
            "due_date":           data.get("due_date", _today_plus(30)),
            "reference_no":       data.get("reference_no", ""),
            "payment_terms":      data.get("payment_terms", "Due on receipt"),
            "notes":              data.get("notes", ""),
            "terms_conditions":   data.get("terms_conditions", ""),
            "items":              data.get("items", []),
            "subtotal":           _safe_float(data.get("subtotal")),
            "total_discount":     _safe_float(data.get("total_discount")),
            "total_taxable":      _safe_float(data.get("total_taxable")),
            "total_cgst":         _safe_float(data.get("total_cgst")),
            "total_sgst":         _safe_float(data.get("total_sgst")),
            "total_igst":         _safe_float(data.get("total_igst")),
            "total_gst":          _safe_float(data.get("total_gst")),
            "grand_total":        grand_total,
            "discount_amount":    _safe_float(data.get("discount_amount")),
            "shipping_charges":   _safe_float(data.get("shipping_charges")),
            "other_charges":      _safe_float(data.get("other_charges")),
            "amount_paid":        0.0,
            "amount_due":         grand_total,
            "status":             "draft",
            "is_recurring":       False,
            "recurrence_pattern": "monthly",
            "recurrence_end":     None,
            "next_invoice_date":  None,
            "invoice_template":   "prestige",
            "invoice_theme":      "classic_blue",
            "invoice_custom_color": "#0D3B66",
            "pdf_drive_link":     "",
            "created_by":         created_by,
            "created_at":         now,
            "updated_at":         now,
        }

        await db.invoices.insert_one(invoice_doc)
        invoice_doc.pop("_id", None)

        # Notify the user in the web app
        if user:
            await create_notification(
                user_id=user["id"],
                title="Invoice Created via Telegram",
                message=f"Invoice {inv_no} for {data.get('client_name','')} ({_fmt_inr(grand_total)}) created via bot.",
                type="invoice"
            )

        # Generate PDF using the same engine as the web app
        company = await db.companies.find_one({"id": company_id}, {"_id": 0}) or {}
        try:
            pdf_buf   = _build_invoice_pdf(invoice_doc, company)
            pdf_bytes = pdf_buf.getvalue()
        except Exception as pdf_err:
            await send_message(
                chat_id,
                f"✅ Invoice *{inv_no}* created!\n"
                f"💎 Total: {_fmt_inr(grand_total)}\n\n"
                f"⚠️ PDF generation failed: {pdf_err}\n"
                f"Download from the web app."
            )
            await db.telegram_conversations.delete_one({"telegram_id": chat_id})
            return {"status": "inv_created_no_pdf"}

        safe_no = inv_no.replace("/", "_").replace("\\", "_")
        await send_document(chat_id, pdf_bytes, f"Invoice_{safe_no}.pdf")
        await db.telegram_conversations.delete_one({"telegram_id": chat_id})
        await send_message(
            chat_id,
            f"✅ *Invoice Created Successfully!*\n\n"
            f"📄 Invoice No: `{inv_no}`\n"
            f"👤 Client: {data.get('client_name','—')}\n"
            f"💎 Grand Total: *{_fmt_inr(grand_total)}*\n"
            f"📅 Due: {invoice_doc['due_date']}\n\n"
            f"📩 PDF sent above. Use `/invemail {inv_no}` to email it to your client."
        )
        return {"status": "invoice_created"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        await send_message(chat_id, f"❌ Error creating invoice: {e}")
        return {"status": "error"}


async def _cmd_invlist(chat_id: int, action: str = "view") -> dict:
    """Show a list of the 10 most recent invoices with PDF / Email buttons."""
    user = await db.users.find_one({"telegram_id": chat_id})
    q: dict = {} if (user and user.get("role") == "admin") else ({"created_by": user["id"]} if user else {})

    invoices = await (
        db.invoices.find(q, {"_id": 0})
        .sort("created_at", -1)
        .limit(10)
        .to_list(10)
    )

    if not invoices:
        await send_message(chat_id, "📋 No invoices found.")
        return {"status": "no_invoices"}

    STATUS_EMOJI = {
        "draft": "✏️", "sent": "📤", "paid": "✅",
        "partially_paid": "⏳", "overdue": "⚠️",
        "cancelled": "❌", "credit_note": "🔄",
    }
    lines = ["📋 *Recent Invoices:*\n"]
    buttons = []
    for inv in invoices:
        emoji = STATUS_EMOJI.get(inv.get("status", "draft"), "📄")
        lines.append(
            f"{emoji} `{inv.get('invoice_no','—')}` — {inv.get('client_name','—')}\n"
            f"   {_fmt_inr(inv.get('grand_total',0))} | {inv.get('invoice_date','—')} | {inv.get('status','—')}"
        )
        if action == "pdf":
            buttons.append({"text": f"📄 {inv.get('invoice_no','—')}", "callback": f"inv_getpdf_{inv['id']}"})
        elif action == "email":
            buttons.append({"text": f"📧 {inv.get('invoice_no','—')}", "callback": f"inv_email_{inv['id']}"})

    await send_message(chat_id, "\n".join(lines))

    if buttons:
        label = "Select invoice to get PDF:" if action == "pdf" else "Select invoice to email:"
        await send_message(chat_id, label, inline_keyboard(buttons, include_cancel=False))

    return {"status": "invlist_shown"}


async def _send_invoice_pdf_by_id(chat_id: int, inv_id: str) -> dict:
    """Fetch invoice + company, generate PDF, send to chat."""
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        await send_message(chat_id, "❌ Invoice not found.")
        return {"status": "not_found"}

    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0}) or {}
    try:
        pdf_buf   = _build_invoice_pdf(inv, company)
        pdf_bytes = pdf_buf.getvalue()
    except Exception as e:
        await send_message(chat_id, f"❌ PDF generation failed: {e}")
        return {"status": "pdf_error"}

    safe_no = (inv.get("invoice_no") or inv_id).replace("/", "_").replace("\\", "_")
    await send_document(chat_id, pdf_bytes, f"Invoice_{safe_no}.pdf")
    await send_message(
        chat_id,
        f"📄 *{inv.get('invoice_no','—')}*\n"
        f"👤 {inv.get('client_name','—')}\n"
        f"💎 {_fmt_inr(inv.get('grand_total',0))}\n"
        f"📅 Due: {inv.get('due_date','—')}\n"
        f"Status: {inv.get('status','—')}\n\n"
        f"📩 Use `/invemail {inv.get('invoice_no','')}` to email this to the client."
    )
    return {"status": "pdf_sent"}


async def _send_invoice_email_by_id(chat_id: int, inv_id: str) -> dict:
    """Generate PDF and email it to the client's email address."""
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        await send_message(chat_id, "❌ Invoice not found.")
        return {"status": "not_found"}

    client_email = (inv.get("client_email") or "").strip()
    if not client_email:
        await send_message(
            chat_id,
            f"❌ Invoice *{inv.get('invoice_no','')}* has no client email address.\n"
            f"Update it in the web app and try again."
        )
        return {"status": "no_email"}

    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0}) or {}
    try:
        pdf_buf   = _build_invoice_pdf(inv, company)
        pdf_bytes = pdf_buf.getvalue()
    except Exception as e:
        await send_message(chat_id, f"❌ PDF generation failed: {e}")
        return {"status": "pdf_error"}

    inv_no      = inv.get("invoice_no", inv_id)
    comp_name   = company.get("name", "Your Company")
    client_name = inv.get("client_name", "Customer")
    grand_total = _fmt_inr(inv.get("grand_total", 0))
    due_date    = inv.get("due_date", "")

    subject   = f"Invoice {inv_no} from {comp_name}"
    html_body = (
        f"<h2>Invoice {inv_no}</h2>"
        f"<p>Dear {client_name},</p>"
        f"<p>Please find attached invoice <strong>{inv_no}</strong> "
        f"for <strong>{grand_total}</strong>.</p>"
        f"<p>Due Date: <strong>{due_date}</strong></p>"
        f"<p>Payment Terms: {inv.get('payment_terms','Due on receipt')}</p>"
        f"{'<p>Notes: ' + inv['notes'] + '</p>' if inv.get('notes') else ''}"
        f"<br><p>Regards,<br>{comp_name}</p>"
    )
    company_email = company.get("email", "")
    safe_no       = inv_no.replace("/", "_").replace("\\", "_")

    try:
        # _send_email is synchronous — run in thread to avoid blocking the event loop
        await asyncio.to_thread(
            _send_email,
            client_email,
            subject,
            html_body,
            pdf_bytes,
            f"Invoice_{safe_no}.pdf",
            company_email,
        )
    except Exception as e:
        await send_message(chat_id, f"❌ Email sending failed: {e}\n\nCheck SMTP settings in environment variables.")
        return {"status": "email_error"}

    # Update invoice status to "sent" if still draft
    if inv.get("status") == "draft":
        await db.invoices.update_one(
            {"id": inv_id},
            {"$set": {"status": "sent", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    await send_message(
        chat_id,
        f"✅ Invoice *{inv_no}* emailed to `{client_email}`!\n"
        f"Status updated to *Sent*."
    )
    return {"status": "email_sent"}
