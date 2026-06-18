"""
whatsapp_scheduler.py

Scheduled WhatsApp notification jobs:
  1. Birthday wishes       — 09:00 IST daily
  2. DSC expiry alerts     — 09:30 IST daily  (7-day and 1-day warnings)
  3. Compliance reminders  — 10:00 IST daily  (7-day and 1-day due-date warnings)

Each job is a sync wrapper (APScheduler-compatible) around an async inner function.
All messages are routed through send_whatsapp_notification() which logs every send
to the whatsapp_messages collection.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import pytz

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")


# ─── Async inner helpers ─────────────────────────────────────────────────────

async def _is_wa_connected() -> bool:
    """Check if the WhatsApp bridge is live before sending."""
    try:
        from backend.whatsapp_integration import _bridge_get
        data = await _bridge_get("/status")
        return data.get("connected", False)
    except Exception:
        return False


def _fmt_phone(raw: Optional[str]) -> Optional[str]:
    """Normalize phone to digits-only, add 91 country code if missing."""
    if not raw:
        return None
    digits = "".join(c for c in raw if c.isdigit())
    if not digits:
        return None
    # If it looks like a 10-digit Indian number, prepend 91
    if len(digits) == 10:
        digits = "91" + digits
    return digits


async def _send_birthday_wishes():
    """
    Send WhatsApp birthday greetings to clients (and their contact persons)
    whose birthday falls on today's date.
    """
    from backend.server import db
    from backend.whatsapp_integration import send_whatsapp_notification, get_auto_settings

    if not await _is_wa_connected():
        logger.info("[WA Scheduler] Birthday job skipped — WhatsApp not connected")
        return

    auto = await get_auto_settings()
    if not auto.get("birthday_enabled", True):
        logger.info("[WA Scheduler] Birthday job skipped — birthday auto-send disabled")
        return
    template = auto.get("birthday_template") or "🎂 Happy Birthday, {name}!"


    today = date.today()
    today_month = today.month
    today_day = today.day

    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)

    sent, skipped = 0, 0
    for client in clients:
        # Per-client opt-out: skip if birthday auto-send turned off for this client
        if client.get("wa_auto_birthday") is False:
            continue

        targets = []  # (phone, name) pairs to wish

        # Check main client birthday
        bday_raw = client.get("birthday")
        if bday_raw:
            try:
                if isinstance(bday_raw, str):
                    bday = date.fromisoformat(bday_raw[:10])
                else:
                    bday = bday_raw
                if bday.month == today_month and bday.day == today_day:
                    name = client.get("company_name") or "Valued Client"
                    phone = _fmt_phone(client.get("phone"))
                    if phone:
                        targets.append((phone, name))
            except (ValueError, TypeError):
                pass

        # Check contact persons' birthdays
        for cp in client.get("contact_persons") or []:
            cp_bday_raw = cp.get("birthday")
            if not cp_bday_raw:
                continue
            try:
                if isinstance(cp_bday_raw, str):
                    cp_bday = date.fromisoformat(str(cp_bday_raw)[:10])
                else:
                    cp_bday = cp_bday_raw
                if cp_bday.month == today_month and cp_bday.day == today_day:
                    cp_name = cp.get("name") or client.get("company_name") or "Friend"
                    cp_phone = _fmt_phone(cp.get("phone"))
                    if cp_phone:
                        targets.append((cp_phone, cp_name))
            except (ValueError, TypeError):
                pass

        # Custom per-client message overrides the global template
        client_msg = client.get("wa_birthday_message")
        raw_tpl = client_msg if (client_msg and client_msg.strip()) else template
        for phone, name in targets:
            try:
                message = raw_tpl.format(name=name)
            except (KeyError, IndexError, ValueError):
                message = raw_tpl

            await send_whatsapp_notification(
                to=phone,
                message=message,
                message_type="birthday",
                context_id=client.get("id"),
                sent_by="scheduler:birthday",
            )
            sent += 1
            await asyncio.sleep(0.8)   # rate-limit guard

    logger.info("[WA Scheduler] Birthday wishes sent=%d skipped=%d", sent, skipped)


async def _send_dsc_expiry_alerts():
    """
    Send WhatsApp alerts for DSC certificates expiring in 7 days or 1 day.
    Looks up the assigned client's phone number from the DSC record.
    """
    from backend.server import db
    from backend.whatsapp_integration import send_whatsapp_notification, get_auto_settings

    if not await _is_wa_connected():
        logger.info("[WA Scheduler] DSC expiry job skipped — WhatsApp not connected")
        return

    if not (await get_auto_settings()).get("dsc_enabled", True):
        logger.info("[WA Scheduler] DSC expiry job skipped — disabled in settings")
        return


    today = date.today()
    alert_offsets = [7, 1]  # days before expiry

    sent = 0
    for days_ahead in alert_offsets:
        target_date = today + timedelta(days=days_ahead)
        target_str = target_date.isoformat()

        dscs = await db.dsc_register.find(
            {"expiry_date": {"$regex": f"^{target_str}"}},
            {"_id": 0},
        ).to_list(500)

        for dsc in dscs:
            holder = dsc.get("holder_name") or "Holder"
            serial = dsc.get("serial_number") or dsc.get("certificate_number") or "N/A"
            expiry = dsc.get("expiry_date", target_str)[:10]

            # Try to get phone from linked client
            phone = None
            client_id = dsc.get("client_id")
            if client_id:
                client = await db.clients.find_one({"id": client_id}, {"_id": 0})
                if client:
                    phone = _fmt_phone(client.get("phone"))
                    if not phone:
                        for cp in client.get("contact_persons") or []:
                            ph = _fmt_phone(cp.get("phone"))
                            if ph:
                                phone = ph
                                break

            if not phone:
                logger.debug("[WA Scheduler] DSC %s — no phone found, skipping", serial)
                continue

            urgency = "⚠️ URGENT" if days_ahead == 1 else "🔔 Reminder"
            message = (
                f"{urgency}: *DSC Expiring in {days_ahead} Day{'s' if days_ahead > 1 else ''}*\n\n"
                f"*Holder:* {holder}\n"
                f"*Serial:* {serial}\n"
                f"*Expiry Date:* {expiry}\n\n"
                f"Please renew the DSC at the earliest to avoid disruption.\n\n"
                f"_Taskosphere — DSC Manager_"
            )
            await send_whatsapp_notification(
                to=phone,
                message=message,
                message_type="dsc",
                context_id=dsc.get("id"),
                sent_by="scheduler:dsc",
            )
            sent += 1
            await asyncio.sleep(0.8)

    logger.info("[WA Scheduler] DSC expiry alerts sent=%d", sent)


async def _send_compliance_reminders():
    """
    Send WhatsApp reminders for compliance tasks due in 7 days or 1 day.
    Fetches client phone from the compliance master's client_id.
    """
    from backend.server import db
    from backend.whatsapp_integration import send_whatsapp_notification, get_auto_settings

    if not await _is_wa_connected():
        logger.info("[WA Scheduler] Compliance job skipped — WhatsApp not connected")
        return

    if not (await get_auto_settings()).get("compliance_enabled", True):
        logger.info("[WA Scheduler] Compliance job skipped — disabled in settings")
        return


    today = date.today()
    alert_offsets = [7, 1]

    sent = 0
    for days_ahead in alert_offsets:
        target_date = today + timedelta(days=days_ahead)
        target_str = target_date.isoformat()

        # compliance_masters and due_dates both store "YYYY-MM-DD" strings
        compliance_items = await db.compliance_masters.find(
            {"due_date": target_str, "status": {"$nin": ["completed", "filed"]}},
            {"_id": 0},
        ).to_list(500)

        for item in compliance_items:
            title = item.get("title") or item.get("compliance_name") or "Compliance Task"
            due = item.get("due_date", target_str)
            client_id = item.get("client_id")
            client_name = item.get("client_name") or "Client"

            phone = None
            if client_id:
                client = await db.clients.find_one({"id": client_id}, {"_id": 0})
                if client:
                    client_name = client.get("company_name") or client_name
                    phone = _fmt_phone(client.get("phone"))
                    if not phone:
                        for cp in client.get("contact_persons") or []:
                            ph = _fmt_phone(cp.get("phone"))
                            if ph:
                                phone = ph
                                break

            if not phone:
                continue

            urgency = "⚠️ URGENT" if days_ahead == 1 else "📋 Reminder"
            message = (
                f"{urgency}: *Compliance Due in {days_ahead} Day{'s' if days_ahead > 1 else ''}*\n\n"
                f"*Task:* {title}\n"
                f"*Client:* {client_name}\n"
                f"*Due Date:* {due}\n\n"
                f"Please ensure timely filing to avoid penalties.\n\n"
                f"_Taskosphere — Compliance Manager_"
            )
            await send_whatsapp_notification(
                to=phone,
                message=message,
                message_type="compliance",
                context_id=item.get("id"),
                sent_by="scheduler:compliance",
            )
            sent += 1
            await asyncio.sleep(0.8)

    logger.info("[WA Scheduler] Compliance reminders sent=%d", sent)


# ─── APScheduler-compatible sync wrappers ────────────────────────────────────
# Pattern mirrors mark_absent_users_task: creates a fresh event loop so
# APScheduler (which runs jobs in threads) must use the main event loop
# so that Motor (async MongoDB) futures are not attached to a different loop.

def _run_on_main_loop(coro, timeout=55):
    """Run an async coroutine on the main FastAPI/Uvicorn event loop from a thread."""
    from backend.server import app_event_loop
    if app_event_loop is None or app_event_loop.is_closed():
        logger.warning("_run_on_main_loop: main event loop not ready, skipping job.")
        return
    future = asyncio.run_coroutine_threadsafe(coro, app_event_loop)
    future.result(timeout=timeout)


def wa_birthday_job():
    try:
        _run_on_main_loop(_send_birthday_wishes())
    except Exception as exc:
        logger.error("wa_birthday_job failed: %s", exc)


def wa_dsc_expiry_job():
    try:
        _run_on_main_loop(_send_dsc_expiry_alerts())
    except Exception as exc:
        logger.error("wa_dsc_expiry_job failed: %s", exc)


def wa_compliance_job():
    try:
        _run_on_main_loop(_send_compliance_reminders())
    except Exception as exc:
        logger.error("wa_compliance_job failed: %s", exc)
