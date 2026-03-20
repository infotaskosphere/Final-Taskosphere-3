# =============================================================================
# email_integration.py
# FastAPI router — IMAP email connection management + AI event extraction
# Specialized for: CA/CS/Legal Firm (Trademark Hearings, NCLT, GST, ROC)
# Stack: FastAPI · MongoDB (motor) · Google Gemini 2.0 Flash-Lite · imaplib
#
# FEATURES (v2):
#  - Fixed reminder/visit save (correct payload + error handling)
#  - Auto-save preference: ask once, then silently save all future events
#  - Daily scheduled scan at 12:00 PM IST (UTC+5:30 → 06:30 UTC)
#  - Improved AI junk filtering (Jio bills, Adobe, marketing, OTPs)
#  - Clear-all events endpoint
#  - Attendance / Holiday / Visit card integration helpers
# =============================================================================

import imaplib
import email
import email.header
import re
import json
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from pydantic import BaseModel
from bson import ObjectId

# ── exact same imports your server.py uses ───────────────────────────────────
from backend.dependencies import get_current_user, db
# ─────────────────────────────────────────────────────────────────────────────

# Optional: encrypt stored app passwords
try:
    from cryptography.fernet import Fernet
    import os as _os
    _fernet_key = _os.environ.get("EMAIL_ENCRYPT_KEY", "").encode()
    _fernet = Fernet(_fernet_key) if len(_fernet_key) == 44 else None
except Exception:
    _fernet = None

# Google Gemini for richer event extraction
try:
    import google.generativeai as genai
    import os as _os2
    _gemini_key = _os2.environ.get("GEMINI_API_KEY", "")
    if _gemini_key:
        genai.configure(api_key=_gemini_key)
        _gemini = genai.GenerativeModel('gemini-2.0-flash-lite')
    else:
        _gemini = None
except Exception:
    _gemini = None

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email", tags=["email"])

IST = ZoneInfo("Asia/Kolkata")

# =============================================================================
# IMAP PROVIDER DEFAULTS
# =============================================================================
PROVIDER_IMAP: Dict[str, tuple] = {
    "gmail.com":      ("imap.gmail.com",         993, "gmail"),
    "googlemail.com": ("imap.gmail.com",         993, "gmail"),
    "outlook.com":    ("outlook.office365.com",  993, "outlook"),
    "hotmail.com":    ("outlook.office365.com",  993, "outlook"),
    "live.com":       ("outlook.office365.com",  993, "outlook"),
    "yahoo.com":      ("imap.mail.yahoo.com",    993, "yahoo"),
    "ymail.com":      ("imap.mail.yahoo.com",    993, "yahoo"),
    "icloud.com":     ("imap.mail.me.com",       993, "icloud"),
    "me.com":         ("imap.mail.me.com",       993, "icloud"),
}

# MongoDB collection names
COL_CONNECTIONS   = "email_connections"
COL_EVENTS        = "email_extracted_events"
COL_AUTO_PREFS    = "email_auto_save_prefs"   # NEW: stores per-user auto-save preference
COL_SCAN_SCHEDULE = "email_scan_schedule"      # NEW: tracks scheduled scan state

# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class ConnectionCreateRequest(BaseModel):
    email_address: str
    app_password: str
    imap_host: Optional[str] = None
    imap_port: Optional[int] = 993
    label: Optional[str] = None

class ConnectionUpdateRequest(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None

class ConnectionOut(BaseModel):
    email_address: str
    imap_host: str
    imap_port: int
    label: Optional[str] = None
    provider: str
    is_active: bool
    last_synced: Optional[str] = None
    connected_at: Optional[str] = None
    sync_error: Optional[str] = None

class ExtractedEventOut(BaseModel):
    id: Optional[str] = None
    title: str
    event_type: str
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    organizer: Optional[str] = None
    description: Optional[str] = None
    urgency: str = "medium"
    source_subject: str
    source_from: str
    source_date: str
    raw_snippet: Optional[str] = None
    email_account: Optional[str] = None

# NEW: Auto-save preference schema
class AutoSavePrefRequest(BaseModel):
    auto_save_reminders: bool   # True = automatically save hearing/deadline events as reminders
    auto_save_visits: bool      # True = automatically save meeting/visit events as visits
    scan_time_hour: int = 12    # IST hour for daily scan (default 12 = noon)
    scan_time_minute: int = 0

class AutoSavePrefOut(BaseModel):
    auto_save_reminders: bool
    auto_save_visits: bool
    scan_time_hour: int
    scan_time_minute: int
    next_scan_at: Optional[str] = None

# =============================================================================
# HELPERS — encryption & IMAP
# =============================================================================

def _encrypt(plain: str) -> str:
    if _fernet: return _fernet.encrypt(plain.encode()).decode()
    return plain

def _decrypt(stored: str) -> str:
    if _fernet:
        try: return _fernet.decrypt(stored.encode()).decode()
        except Exception: return stored
    return stored

def _infer_provider(email_address: str):
    domain = email_address.split("@")[-1].lower()
    return PROVIDER_IMAP.get(domain, (f"imap.{domain}", 993, "other"))

def _test_imap(host: str, port: int, email_addr: str, password: str) -> None:
    try:
        conn = imaplib.IMAP4_SSL(host, int(port))
        conn.login(email_addr, password)
        conn.logout()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"IMAP login failed: {exc}. Check App Password & IMAP settings."
        )

def _decode_header_str(raw: str) -> str:
    if not raw: return ""
    parts = email.header.decode_header(raw)
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            out.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(str(part))
    return " ".join(out)

def _get_plain_body(msg: email.message.Message, max_chars: int = 2000) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    charset = part.get_content_charset() or "utf-8"
                    body = part.get_payload(decode=True).decode(charset, errors="replace")
                    break
                except Exception: pass
    else:
        try:
            charset = msg.get_content_charset() or "utf-8"
            body = msg.get_payload(decode=True).decode(charset, errors="replace")
        except Exception: pass
    return body[:max_chars]

def _scan_mailbox(host: str, port: int, email_addr: str, password: str, max_msgs: int = 50) -> List[Dict]:
    results = []
    try:
        conn = imaplib.IMAP4_SSL(host, int(port))
        conn.login(email_addr, password)
        conn.select("INBOX", readonly=True)
        _, data = conn.search(None, "ALL")
        ids = data[0].split()[-max_msgs:]
        for msg_id in reversed(ids):
            try:
                _, msg_data = conn.fetch(msg_id, "(RFC822)")
                if not msg_data or not msg_data[0]: continue
                msg = email.message_from_bytes(msg_data[0][1])
                results.append({
                    "subject":    _decode_header_str(msg.get("Subject", "")),
                    "from_addr":  _decode_header_str(msg.get("From", "")),
                    "msg_date":   msg.get("Date", ""),
                    "body":       _get_plain_body(msg),
                    "message_id": (msg.get("Message-ID") or "").strip(),
                })
            except Exception: continue
        conn.logout()
    except Exception as e:
        logger.error(f"IMAP Error: {e}")
    return results

# =============================================================================
# AI EXTRACTION — LEGAL/TAX SPECIALIZED (STRICT JUNK FILTER)
# =============================================================================

_AI_SYSTEM = """
You are a specialized legal and tax assistant for a CA/CS/Legal firm in India.
Extract ONLY professional/legal events from the email. Be VERY strict.

STRICT RULES:
1. FOCUS ONLY ON:
   - Trademark hearings (IP India, trademark registry)
   - Court hearings (NCLT, High Court, Supreme Court, any tribunal)
   - ROC compliance deadlines (MCA21, annual filing, AOC-4, MGT-7)
   - GST deadlines (GSTR-1, GSTR-3B, GSTR-9, notices)
   - Income Tax deadlines (ITR, advance tax, notices from Income Tax dept)
   - Client visits or scheduled meetings with clients
   - Professional conference/seminar invites from ICAI/ICSI/Bar Council

2. STRICTLY DISCARD (return empty array [] for these):
   - Jio, Airtel, BSNL bills and payment reminders
   - Bank transaction alerts, OTPs, credit card statements
   - Adobe, software subscription offers
   - Job applications or recruitment emails
   - Marketing newsletters, discount offers, promotional emails
   - Social media notifications (LinkedIn, Facebook, etc.)
   - Any email that is clearly NOT related to CA/CS/Legal firm work

3. DATES: If year is missing but month/day is present, assume 2026.
4. Return ONLY a valid JSON array. No markdown, no preamble.
   Each object must have:
   title (string), event_type (one of: Trademark Hearing, Court Hearing, Online Meeting,
   Deadline, Visit, Other), date (yyyy-MM-dd or null), time (HH:mm or null),
   organizer (string or null), description (max 100 chars), urgency (high|medium|low)
5. If the email is junk/irrelevant, return exactly: []
"""

async def _extract_events_from_email(subject: str, body: str, from_addr: str, msg_date: str) -> List[Dict]:
    # Pre-filter obvious junk BEFORE calling AI (saves API quota)
    junk_keywords = [
        "jio", "airtel", "vodafone", "bsnl", "tata sky", "d2h",
        "payment received", "transaction successful", "otp", "one time password",
        "credit card statement", "bank statement", "your account has been",
        "adobe", "canva", "figma", "coursera", "udemy",
        "discount", "offer", "sale", "cashback", "reward points",
        "linkedin", "facebook", "instagram", "twitter", "youtube",
        "job application", "new applicants", "your job has",
        "unsubscribe", "newsletter", "promotional",
        "keep your pdf", "safe from prying", "web version",
        "amazon", "flipkart", "swiggy", "zomato", "uber",
    ]
    subject_lower = subject.lower()
    body_lower = body.lower()[:500]
    combined = f"{subject_lower} {body_lower}"

    for kw in junk_keywords:
        if kw in combined:
            logger.debug(f"Pre-filtered junk email: {subject[:60]}")
            return []

    if _gemini:
        try:
            prompt = f"{_AI_SYSTEM}\n\nFrom: {from_addr}\nSubject: {subject}\nBody:\n{body}"
            resp = await _gemini.generate_content_async(prompt)
            raw = re.sub(r"```[a-z]*\n?|```", "", resp.text.strip())
            result = json.loads(raw)
            if isinstance(result, list):
                return result
        except Exception as e:
            logger.warning(f"Gemini extraction failed: {e}")
    return _regex_extract(subject, body, from_addr)

def _regex_extract(subject: str, body: str, from_addr: str) -> List[Dict]:
    text = f"{subject} {body}".lower()
    junk = [
        "offer", "discount", "otp", "statement", "transaction successful",
        "payment received", "jio", "airtel", "adobe", "newsletter",
        "unsubscribe", "promotional"
    ]
    if any(j in text for j in junk): return []

    date_pat = r"\b(\d{1,4})[/-|\.](\d{1,2})[/-|\.](\d{1,4})\b"
    m = re.search(date_pat, text)
    date_str = None
    if m:
        p1, p2, p3 = m.groups()
        if len(p1) == 4: date_str = f"{p1}-{p2.zfill(2)}-{p3.zfill(2)}"
        else: date_str = f"{p3 if len(p3)==4 else '20'+p3}-{p2.zfill(2)}-{p1.zfill(2)}"

    if not date_str: return []

    if any(w in text for w in ["trademark", "ipindia", "opposition", "ip india"]): etype = "Trademark Hearing"
    elif any(w in text for w in ["court", "nclt", "tribunal", "hearing"]): etype = "Court Hearing"
    elif any(w in text for w in ["gst", "gstr", "income tax", "itr", "roc", "mca"]): etype = "Deadline"
    elif "visit" in text: etype = "Visit"
    else: etype = "Deadline"

    return [{
        "title": subject[:100], "event_type": etype, "date": date_str, "time": None,
        "organizer": from_addr[:50], "description": body[:100], "urgency": "high"
    }]

# =============================================================================
# MONGO DOC HELPERS
# =============================================================================

def _doc_to_out(doc: Dict) -> ExtractedEventOut:
    return ExtractedEventOut(
        id=str(doc.get("_id", doc.get("id", ""))),
        title=doc.get("title", ""),
        event_type=doc.get("event_type", "Other"),
        date=doc.get("date"),
        time=doc.get("time"),
        location=doc.get("location"),
        organizer=doc.get("organizer"),
        description=doc.get("description"),
        urgency=doc.get("urgency", "medium"),
        source_subject=doc.get("source_subject", ""),
        source_from=doc.get("source_from", ""),
        source_date=doc.get("source_date", ""),
        raw_snippet=doc.get("raw_snippet"),
        email_account=doc.get("email_account"),
    )

def _conn_doc_to_out(doc: Dict) -> ConnectionOut:
    return ConnectionOut(
        email_address=doc.get("email_address", ""),
        imap_host=doc.get("imap_host", ""),
        imap_port=doc.get("imap_port", 993),
        label=doc.get("label"),
        provider=doc.get("provider", "other"),
        is_active=doc.get("is_active", True),
        last_synced=doc.get("last_synced"),
        connected_at=doc.get("connected_at"),
        sync_error=doc.get("sync_error"),
    )

# =============================================================================
# AUTO-SAVE: save extracted events directly to reminders / visits collections
# =============================================================================

REMINDER_EVENT_TYPES = {"Trademark Hearing", "Court Hearing", "Deadline", "Appointment", "Other"}
VISIT_EVENT_TYPES    = {"Visit", "Online Meeting", "Conference", "Interview", "Meeting"}

async def _auto_save_event(user_id: str, event: ExtractedEventOut, prefs: Dict):
    """Automatically save a qualified event as reminder or visit based on user preferences."""
    try:
        ev_type = event.event_type

        if prefs.get("auto_save_reminders") and ev_type in REMINDER_EVENT_TYPES:
            # Build remind_at datetime
            date_str = event.date or datetime.now(IST).strftime("%Y-%m-%d")
            time_str = event.time or "10:00"
            try:
                remind_dt = datetime.strptime(f"{date_str}T{time_str}", "%Y-%m-%dT%H:%M")
                remind_dt = remind_dt.replace(tzinfo=IST)
            except Exception:
                remind_dt = datetime.now(IST) + timedelta(days=1)

            # Check if reminder with same title+date already exists
            existing = await db["reminders"].find_one({
                "user_id": user_id,
                "title": event.title,
                "remind_at": {"$gte": remind_dt.replace(hour=0, minute=0, second=0).isoformat()}
            })
            if not existing:
                description_parts = []
                if event.organizer:   description_parts.append(f"From: {event.organizer}")
                if event.description: description_parts.append(f"Notes: {event.description}")
                if event.source_subject: description_parts.append(f"Subject: {event.source_subject}")

                await db["reminders"].insert_one({
                    "user_id": user_id,
                    "title": event.title,
                    "description": "\n".join(description_parts) or None,
                    "remind_at": remind_dt.isoformat(),
                    "is_completed": False,
                    "source": "email_auto",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"Auto-saved reminder: {event.title}")

        elif prefs.get("auto_save_visits") and ev_type in VISIT_EVENT_TYPES:
            date_str = event.date or datetime.now(IST).strftime("%Y-%m-%d")

            existing = await db["visits"].find_one({
                "user_id": user_id,
                "title": event.title,
                "visit_date": date_str,
            })
            if not existing:
                await db["visits"].insert_one({
                    "user_id": user_id,
                    "title": event.title,
                    "visit_date": date_str,
                    "notes": event.description or event.source_subject or "",
                    "status": "scheduled",
                    "source": "email_auto",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"Auto-saved visit: {event.title}")
    except Exception as e:
        logger.error(f"Auto-save failed for event '{event.title}': {e}")

# =============================================================================
# DAILY SCHEDULED SCAN ENGINE
# =============================================================================

_scan_task: asyncio.Task = None  # holds the background scan loop task

async def _scheduled_scan_loop():
    """Background loop: runs a full email scan once per day at the user-configured time (IST)."""
    logger.info("Email scheduled scan loop started.")
    while True:
        try:
            now_ist = datetime.now(IST)
            # Fetch all users who have auto-save prefs enabled
            cursor = db[COL_AUTO_PREFS].find({})
            prefs_list = await cursor.to_list(length=500)

            for pref in prefs_list:
                user_id = pref.get("user_id")
                scan_hour   = pref.get("scan_time_hour", 12)
                scan_minute = pref.get("scan_time_minute", 0)

                # Check if we're within 5 minutes of the configured scan time
                target = now_ist.replace(hour=scan_hour, minute=scan_minute, second=0, microsecond=0)
                diff_seconds = abs((now_ist - target).total_seconds())
                if diff_seconds > 300:
                    continue

                # Check we haven't already run today
                last_run_key = f"last_scheduled_scan_{user_id}"
                sched_doc = await db[COL_SCAN_SCHEDULE].find_one({"user_id": user_id})
                if sched_doc:
                    last_run = sched_doc.get("last_run", "")
                    if last_run and last_run[:10] == now_ist.strftime("%Y-%m-%d"):
                        continue  # already ran today

                logger.info(f"Running scheduled scan for user {user_id}")
                try:
                    await _run_full_scan_for_user(user_id, pref)
                    await db[COL_SCAN_SCHEDULE].update_one(
                        {"user_id": user_id},
                        {"$set": {"last_run": now_ist.isoformat(), "user_id": user_id}},
                        upsert=True
                    )
                except Exception as e:
                    logger.error(f"Scheduled scan error for user {user_id}: {e}")

        except Exception as e:
            logger.error(f"Scan loop error: {e}")

        await asyncio.sleep(60)  # check every minute

async def _run_full_scan_for_user(user_id: str, prefs: Dict, limit: int = 50):
    """Runs a full inbox scan for all active connections of a user and auto-saves events."""
    conns = await db[COL_CONNECTIONS].find({"user_id": user_id, "is_active": True}).to_list(50)
    if not conns:
        return

    loop = asyncio.get_event_loop()
    for conn in conns:
        try:
            email_addr = conn["email_address"]
            raw_emails = await loop.run_in_executor(
                None, _scan_mailbox,
                conn["imap_host"], conn["imap_port"], email_addr,
                _decrypt(conn["app_password_enc"]), limit
            )
            for raw in raw_emails:
                mid = raw.get("message_id")
                exists = await db[COL_EVENTS].find_one({"user_id": user_id, "message_id": mid})
                if exists:
                    # Auto-save even cached events if not yet saved
                    ev_out = _doc_to_out(exists)
                    await _auto_save_event(user_id, ev_out, prefs)
                    continue

                extracted = await _extract_events_from_email(
                    raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"]
                )
                for ev in extracted:
                    doc = {
                        "user_id": user_id, "email_account": email_addr,
                        "message_id": mid,
                        "title": ev.get("title") or raw["subject"][:120],
                        "event_type": ev.get("event_type", "Other"),
                        "date": ev.get("date"), "time": ev.get("time"),
                        "organizer": ev.get("organizer"),
                        "description": ev.get("description"),
                        "urgency": ev.get("urgency", "medium"),
                        "source_subject": raw["subject"][:200],
                        "source_from": raw["from_addr"][:200],
                        "source_date": raw["msg_date"][:100],
                        "raw_snippet": raw["body"][:300],
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    res = await db[COL_EVENTS].insert_one(doc)
                    doc["id"] = str(res.inserted_id)
                    ev_out = _doc_to_out(doc)
                    await _auto_save_event(user_id, ev_out, prefs)

            await db[COL_CONNECTIONS].update_one(
                {"_id": conn["_id"]},
                {"$set": {"last_synced": datetime.now(timezone.utc).isoformat(), "sync_error": None}}
            )
        except Exception as e:
            logger.error(f"Scan error for {conn.get('email_address')}: {e}")
            await db[COL_CONNECTIONS].update_one(
                {"_id": conn["_id"]}, {"$set": {"sync_error": str(e)}}
            )

def start_scheduled_scan_loop():
    """Call this from your main app startup to begin the daily scan loop."""
    global _scan_task
    loop = asyncio.get_event_loop()
    _scan_task = loop.create_task(_scheduled_scan_loop())
    logger.info("Scheduled email scan loop registered.")

# =============================================================================
# API ROUTES — CONNECTIONS
# =============================================================================

@router.get("/connections")
async def list_connections(current_user=Depends(get_current_user)):
    cursor = db[COL_CONNECTIONS].find({"user_id": str(current_user.id)}, {"app_password_enc": 0})
    docs = await cursor.to_list(length=100)
    return {"connections": [_conn_doc_to_out(d) for d in docs]}

@router.post("/connections", status_code=201)
async def add_connection(body: ConnectionCreateRequest, current_user=Depends(get_current_user)):
    host, port, provider = _infer_provider(body.email_address)
    host = body.imap_host or host
    port = body.imap_port or port
    _test_imap(host, port, body.email_address, body.app_password)

    doc = {
        "user_id": str(current_user.id),
        "email_address": body.email_address,
        "app_password_enc": _encrypt(body.app_password),
        "imap_host": host, "imap_port": port,
        "label": body.label, "provider": provider,
        "is_active": True,
        "connected_at": datetime.now(timezone.utc).isoformat()
    }
    await db[COL_CONNECTIONS].update_one(
        {"user_id": str(current_user.id), "email_address": body.email_address},
        {"$set": doc}, upsert=True
    )
    return _conn_doc_to_out(doc)

@router.patch("/connections/{email_address}")
async def update_connection(email_address: str, body: ConnectionUpdateRequest, current_user=Depends(get_current_user)):
    existing = await db[COL_CONNECTIONS].find_one({"user_id": str(current_user.id), "email_address": email_address})
    if not existing: raise HTTPException(status_code=404)
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates.get("is_active"): updates["sync_error"] = None
    await db[COL_CONNECTIONS].update_one({"_id": existing["_id"]}, {"$set": updates})
    doc = await db[COL_CONNECTIONS].find_one({"_id": existing["_id"]})
    return _conn_doc_to_out(doc)

@router.delete("/connections/{email_address}", status_code=204)
async def delete_connection(email_address: str, current_user=Depends(get_current_user)):
    await db[COL_CONNECTIONS].delete_one({"user_id": str(current_user.id), "email_address": email_address})

@router.post("/connections/{email_address}/test")
async def test_connection(email_address: str, current_user=Depends(get_current_user)):
    doc = await db[COL_CONNECTIONS].find_one({"user_id": str(current_user.id), "email_address": email_address})
    if not doc: raise HTTPException(status_code=404)
    try:
        _test_imap(doc["imap_host"], doc["imap_port"], email_address, _decrypt(doc["app_password_enc"]))
        await db[COL_CONNECTIONS].update_one(
            {"_id": doc["_id"]},
            {"$set": {"sync_error": None, "last_synced": datetime.now(timezone.utc).isoformat()}}
        )
        return {"status": "ok"}
    except Exception as e:
        await db[COL_CONNECTIONS].update_one({"_id": doc["_id"]}, {"$set": {"sync_error": str(e)}})
        raise

# =============================================================================
# API ROUTES — AUTO-SAVE PREFERENCES (NEW)
# =============================================================================

@router.get("/auto-save-prefs", response_model=AutoSavePrefOut)
async def get_auto_save_prefs(current_user=Depends(get_current_user)):
    """Get current auto-save preferences for this user."""
    doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)})
    if not doc:
        # Return defaults (not set yet — show the first-time dialog on frontend)
        return AutoSavePrefOut(
            auto_save_reminders=False,
            auto_save_visits=False,
            scan_time_hour=12,
            scan_time_minute=0,
            next_scan_at=None
        )

    # Calculate next scan time
    now_ist = datetime.now(IST)
    next_scan = now_ist.replace(
        hour=doc.get("scan_time_hour", 12),
        minute=doc.get("scan_time_minute", 0),
        second=0, microsecond=0
    )
    if next_scan <= now_ist:
        next_scan += timedelta(days=1)

    return AutoSavePrefOut(
        auto_save_reminders=doc.get("auto_save_reminders", False),
        auto_save_visits=doc.get("auto_save_visits", False),
        scan_time_hour=doc.get("scan_time_hour", 12),
        scan_time_minute=doc.get("scan_time_minute", 0),
        next_scan_at=next_scan.isoformat()
    )

@router.post("/auto-save-prefs", response_model=AutoSavePrefOut)
async def set_auto_save_prefs(body: AutoSavePrefRequest, current_user=Depends(get_current_user)):
    """Set auto-save preferences. Called when user answers the first-time dialog."""
    doc = {
        "user_id": str(current_user.id),
        "auto_save_reminders": body.auto_save_reminders,
        "auto_save_visits": body.auto_save_visits,
        "scan_time_hour": max(0, min(23, body.scan_time_hour)),
        "scan_time_minute": max(0, min(59, body.scan_time_minute)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db[COL_AUTO_PREFS].update_one(
        {"user_id": str(current_user.id)}, {"$set": doc}, upsert=True
    )
    return await get_auto_save_prefs(current_user)

@router.get("/auto-save-prefs/exists")
async def check_prefs_exist(current_user=Depends(get_current_user)):
    """Check if user has ever set auto-save preferences (to know if we should show first-time dialog)."""
    doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)})
    return {"has_set_prefs": doc is not None}

# =============================================================================
# API ROUTES — MANUAL SAVE (FIXED — correct collection field names)
# =============================================================================

class ManualSaveReminderRequest(BaseModel):
    event_id: str
    title: str
    description: Optional[str] = None
    remind_at: str  # ISO datetime string

class ManualSaveVisitRequest(BaseModel):
    event_id: str
    title: str
    visit_date: str  # yyyy-MM-dd
    notes: Optional[str] = None

@router.post("/save-as-reminder", status_code=201)
async def save_as_reminder(body: ManualSaveReminderRequest, current_user=Depends(get_current_user)):
    """Manually save an extracted event as a reminder."""
    try:
        # Validate remind_at
        try:
            remind_dt = datetime.fromisoformat(body.remind_at.replace("Z", "+00:00"))
        except Exception:
            remind_dt = datetime.now(IST) + timedelta(days=1)

        # Check for duplicate
        existing = await db["reminders"].find_one({
            "user_id": str(current_user.id),
            "title": body.title,
        })
        if existing:
            return {"status": "already_exists", "id": str(existing["_id"])}

        result = await db["reminders"].insert_one({
            "user_id": str(current_user.id),
            "title": body.title,
            "description": body.description,
            "remind_at": remind_dt.isoformat(),
            "is_completed": False,
            "source": "email_manual",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": str(result.inserted_id)}
    except Exception as e:
        logger.error(f"Save reminder error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save reminder: {str(e)}")

@router.post("/save-as-visit", status_code=201)
async def save_as_visit(body: ManualSaveVisitRequest, current_user=Depends(get_current_user)):
    """Manually save an extracted event as a client visit."""
    try:
        existing = await db["visits"].find_one({
            "user_id": str(current_user.id),
            "title": body.title,
            "visit_date": body.visit_date,
        })
        if existing:
            return {"status": "already_exists", "id": str(existing["_id"])}

        result = await db["visits"].insert_one({
            "user_id": str(current_user.id),
            "title": body.title,
            "visit_date": body.visit_date,
            "notes": body.notes or "",
            "status": "scheduled",
            "source": "email_manual",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": str(result.inserted_id)}
    except Exception as e:
        logger.error(f"Save visit error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save visit: {str(e)}")

# =============================================================================
# API ROUTES — EVENT EXTRACTION ENGINE
# =============================================================================

@router.get("/extract-events", response_model=List[ExtractedEventOut])
async def extract_events(
    current_user=Depends(get_current_user),
    limit: int = Query(30),
    force_refresh: bool = Query(False)
):
    conns = await db[COL_CONNECTIONS].find({"user_id": str(current_user.id), "is_active": True}).to_list(50)
    if not conns: return []

    prefs_doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)}) or {}

    async def process_account(conn):
        email_addr = conn["email_address"]
        # Cache: skip re-scan if synced within last 30 min and not force
        if not force_refresh and conn.get("last_synced"):
            last = datetime.fromisoformat(conn["last_synced"])
            if (datetime.now(timezone.utc) - last).total_seconds() < 1800:
                cached = await db[COL_EVENTS].find(
                    {"user_id": str(current_user.id), "email_account": email_addr}
                ).sort("_id", -1).limit(limit).to_list(limit)
                return [_doc_to_out(d) for d in cached]

        loop = asyncio.get_event_loop()
        raw_emails = await loop.run_in_executor(
            None, _scan_mailbox,
            conn["imap_host"], conn["imap_port"], email_addr,
            _decrypt(conn["app_password_enc"]), 50
        )

        acc_results = []
        for raw in raw_emails:
            mid = raw.get("message_id")
            exists = await db[COL_EVENTS].find_one({"user_id": str(current_user.id), "message_id": mid})
            if exists:
                ev_out = _doc_to_out(exists)
                acc_results.append(ev_out)
                # Still auto-save if prefs say so
                if prefs_doc:
                    await _auto_save_event(str(current_user.id), ev_out, prefs_doc)
                continue

            extracted = await _extract_events_from_email(
                raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"]
            )
            for ev in extracted:
                doc = {
                    "user_id": str(current_user.id), "email_account": email_addr,
                    "message_id": mid,
                    "title": ev.get("title") or raw["subject"][:120],
                    "event_type": ev.get("event_type", "Other"),
                    "date": ev.get("date"), "time": ev.get("time"),
                    "organizer": ev.get("organizer"),
                    "description": ev.get("description"),
                    "urgency": ev.get("urgency", "medium"),
                    "source_subject": raw["subject"][:200],
                    "source_from": raw["from_addr"][:200],
                    "source_date": raw["msg_date"][:100],
                    "raw_snippet": raw["body"][:300],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                res = await db[COL_EVENTS].insert_one(doc)
                doc["id"] = str(res.inserted_id)
                ev_out = _doc_to_out(doc)
                acc_results.append(ev_out)
                if prefs_doc:
                    await _auto_save_event(str(current_user.id), ev_out, prefs_doc)

        await db[COL_CONNECTIONS].update_one(
            {"_id": conn["_id"]},
            {"$set": {"last_synced": datetime.now(timezone.utc).isoformat(), "sync_error": None}}
        )
        return acc_results

    tasks = [process_account(c) for c in conns]
    completed = await asyncio.gather(*tasks, return_exceptions=True)

    final_events = []
    for res in completed:
        if isinstance(res, list): final_events.extend(res)

    final_events.sort(key=lambda e: e.date or "0000-00-00", reverse=True)
    return final_events[:limit]

@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: str, current_user=Depends(get_current_user)):
    await db[COL_EVENTS].delete_one({"_id": ObjectId(event_id), "user_id": str(current_user.id)})

@router.delete("/events/clear-all", status_code=204)
async def clear_all_events(current_user=Depends(get_current_user)):
    """Clear all cached extracted events for this user (force fresh scan next time)."""
    await db[COL_EVENTS].delete_many({"user_id": str(current_user.id)})

@router.get("/importer/events", response_model=List[ExtractedEventOut])
async def importer_events(
    current_user=Depends(get_current_user),
    limit: int = 30,
    force_refresh: bool = False
):
    count = await db[COL_EVENTS].count_documents({"user_id": str(current_user.id)})
    if count == 0 or force_refresh:
        return await extract_events(current_user, limit, force_refresh)
    docs = await db[COL_EVENTS].find({"user_id": str(current_user.id)}).sort("date", -1).limit(limit).to_list(limit)
    return [_doc_to_out(d) for d in docs]

# =============================================================================
# ATTENDANCE / HOLIDAY / VISIT CARD INTEGRATION HELPERS
# =============================================================================

@router.get("/attendance/today-summary")
async def attendance_today_summary(current_user=Depends(get_current_user)):
    """
    Returns today's attendance status + any scheduled visits + upcoming reminders.
    Used by attendance page to show contextual info from email events.
    """
    today = datetime.now(IST).strftime("%Y-%m-%d")

    # Today's visits from email
    visits = await db["visits"].find({
        "user_id": str(current_user.id),
        "visit_date": today,
    }).to_list(20)

    # Upcoming reminders (today + next 7 days)
    week_later = (datetime.now(IST) + timedelta(days=7)).strftime("%Y-%m-%d")
    reminders = await db["reminders"].find({
        "user_id": str(current_user.id),
        "is_completed": False,
        "remind_at": {"$gte": today, "$lte": week_later + "T23:59:59"},
    }).sort("remind_at", 1).to_list(10)

    return {
        "today": today,
        "visits_today": [
            {"title": v.get("title"), "status": v.get("status"), "notes": v.get("notes")}
            for v in visits
        ],
        "upcoming_reminders": [
            {"title": r.get("title"), "remind_at": r.get("remind_at")}
            for r in reminders
        ],
    }

@router.get("/holidays/upcoming")
async def upcoming_holidays(current_user=Depends(get_current_user)):
    """
    Returns email-extracted events that coincide with or might be holidays/closures.
    Frontend holiday card can call this to show court holidays etc.
    """
    today = datetime.now(IST).strftime("%Y-%m-%d")
    events = await db[COL_EVENTS].find({
        "user_id": str(current_user.id),
        "date": {"$gte": today},
        "event_type": {"$in": ["Court Hearing", "Trademark Hearing", "Deadline"]},
    }).sort("date", 1).limit(10).to_list(10)
    return {"events": [_doc_to_out(e).dict() for e in events]}
