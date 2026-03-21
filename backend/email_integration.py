# =============================================================================
# email_integration.py  — v4  COMPLETE COPY-PASTE FILE
# FastAPI router — IMAP email connection management + AI event extraction
# Specialized for: CA/CS/Legal Firm (Trademark Hearings, NCLT, GST, ROC)
# Stack: FastAPI · MongoDB (motor) · Google Gemini 2.0 Flash-Lite · imaplib
#
# NEW IN v4:
#  - FIX: Delete individual reminder/visit — no longer wipes all auto-synced
#  - FEATURE: Sender email whitelist — only sync emails from approved senders
#  - FEATURE: Smart categorization rules:
#      • Notice/Examination Report/Show Cause    → TODO
#      • Hearing/GST/Income Tax/Trademark dates  → REMINDER
#      • Zoom/Teams/Google Meet/personal visit   → VISIT
#  - All v3 features retained
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

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from bson import ObjectId

from backend.dependencies import get_current_user, db

try:
    from cryptography.fernet import Fernet
    import os as _os
    _fernet_key = _os.environ.get("EMAIL_ENCRYPT_KEY", "").encode()
    _fernet = Fernet(_fernet_key) if len(_fernet_key) == 44 else None
except Exception:
    _fernet = None

try:
    import google.generativeai as genai
    import os as _os2
    _gemini_key = _os2.environ.get("GEMINI_API_KEY", "")
    if _gemini_key:
        genai.configure(api_key=_gemini_key)
        _gemini = genai.GenerativeModel("gemini-2.0-flash-lite")
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
    "gmail.com":      ("imap.gmail.com",        993, "gmail"),
    "googlemail.com": ("imap.gmail.com",        993, "gmail"),
    "outlook.com":    ("outlook.office365.com", 993, "outlook"),
    "hotmail.com":    ("outlook.office365.com", 993, "outlook"),
    "live.com":       ("outlook.office365.com", 993, "outlook"),
    "yahoo.com":      ("imap.mail.yahoo.com",   993, "yahoo"),
    "ymail.com":      ("imap.mail.yahoo.com",   993, "yahoo"),
    "icloud.com":     ("imap.mail.me.com",      993, "icloud"),
    "me.com":         ("imap.mail.me.com",      993, "icloud"),
}

COL_CONNECTIONS   = "email_connections"
COL_EVENTS        = "email_extracted_events"
COL_AUTO_PREFS    = "email_auto_save_prefs"
COL_SCAN_SCHEDULE = "email_scan_schedule"
# NEW: collection to store approved sender email whitelist per user
COL_SENDER_WHITELIST = "email_sender_whitelist"

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
    # NEW: indicates which category this event belongs to
    save_category: Optional[str] = None  # "todo" | "reminder" | "visit"

class AutoSavePrefRequest(BaseModel):
    auto_save_reminders: bool
    auto_save_visits: bool
    auto_save_todos: bool = False           # NEW
    scan_time_hour: int = 12
    scan_time_minute: int = 0

class AutoSavePrefOut(BaseModel):
    auto_save_reminders: bool
    auto_save_visits: bool
    auto_save_todos: bool = False           # NEW
    scan_time_hour: int
    scan_time_minute: int
    next_scan_at: Optional[str] = None

class ManualSaveReminderRequest(BaseModel):
    event_id: str
    title: str
    description: Optional[str] = None
    remind_at: str

class ManualSaveVisitRequest(BaseModel):
    event_id: str
    title: str
    visit_date: str
    notes: Optional[str] = None

# NEW: Sender whitelist schemas
class SenderWhitelistEntry(BaseModel):
    email_address: str
    label: Optional[str] = None  # friendly name e.g. "IP India", "GST Portal"

class SenderWhitelistOut(BaseModel):
    senders: List[Dict[str, str]]
    # [{"email_address": "...", "label": "..."}]

# =============================================================================
# HELPERS — encryption
# =============================================================================

def _encrypt(plain: str) -> str:
    if _fernet:
        return _fernet.encrypt(plain.encode()).decode()
    return plain

def _decrypt(stored: str) -> str:
    if _fernet:
        try:
            return _fernet.decrypt(stored.encode()).decode()
        except Exception:
            return stored
    return stored

def _infer_provider(email_address: str):
    domain = email_address.split("@")[-1].lower()
    return PROVIDER_IMAP.get(domain, (f"imap.{domain}", 993, "other"))

def _clean_password(password: str) -> str:
    return password.replace(" ", "").strip()

# =============================================================================
# SMART CATEGORY CLASSIFIER
# Decides whether an email event should be saved as TODO, REMINDER, or VISIT
# =============================================================================

# Keywords that indicate an action-required notice → TODO
_TODO_KEYWORDS = [
    "examination report", "office action", "objection raised",
    "reply to examination", "response required", "compliance notice",
    "show cause notice", "response to show cause", "notice to file",
    "deadline to respond", "reply required", "reply within",
    "opposition notice", "counter statement", "file reply",
    "scrutiny notice", "demand notice",
]

# Keywords for scheduled hearings / filing deadlines → REMINDER
_REMINDER_KEYWORDS = [
    "hearing", "show cause hearing", "trademark hearing",
    "gstr-1", "gstr-3b", "gstr-9", "gst filing", "gst return",
    "income tax", "itr", "advance tax", "tds return",
    "roc filing", "mca", "aoc-4", "mgt-7",
    "court date", "nclt", "high court", "tribunal",
    "ip india", "ipindia",
    "due date", "last date", "filing date",
]

# Keywords for online/offline meetings → VISIT
_VISIT_KEYWORDS = [
    "zoom", "google meet", "teams meeting", "microsoft teams",
    "webex", "meeting invite", "meeting scheduled",
    "visit scheduled", "office visit", "client visit",
    "appointment", "meeting at",
    "conference call", "video call",
]

def _classify_save_category(event_type: str, title: str, body: str) -> str:
    """
    Returns 'todo' | 'reminder' | 'visit' based on keyword matching.
    Falls back to event_type mapping when no keyword matches.
    """
    combined = f"{title} {body}".lower()

    # Check TODO keywords first (highest priority)
    for kw in _TODO_KEYWORDS:
        if kw in combined:
            return "todo"

    # Check VISIT keywords
    for kw in _VISIT_KEYWORDS:
        if kw in combined:
            return "visit"

    # Check REMINDER keywords
    for kw in _REMINDER_KEYWORDS:
        if kw in combined:
            return "reminder"

    # Fallback: use event_type
    if event_type in ("Court Hearing", "Trademark Hearing", "Deadline"):
        return "reminder"
    if event_type in ("Visit", "Online Meeting", "Conference"):
        return "visit"
    return "reminder"  # default


# =============================================================================
# IMAP HELPERS
# =============================================================================

def _test_imap_sync(host: str, port: int, email_addr: str, password: str) -> Optional[str]:
    try:
        password = _clean_password(password)
        conn = imaplib.IMAP4_SSL(host, int(port))
        conn.login(email_addr, password)
        conn.logout()
        return None
    except imaplib.IMAP4.error as e:
        return (
            f"IMAP login failed: {e}. "
            "Make sure: (1) IMAP is enabled in Gmail Settings, "
            "(2) You are using an App Password, "
            "(3) 2-Step Verification is enabled."
        )
    except ConnectionRefusedError:
        return f"Could not connect to {host}:{port} — connection refused."
    except OSError as e:
        return f"Network error connecting to {host}:{port} — {e}"
    except Exception as e:
        return f"Unexpected error: {type(e).__name__}: {e}"

def _decode_header_str(raw: str) -> str:
    if not raw:
        return ""
    try:
        parts = email.header.decode_header(raw)
        out = []
        for part, charset in parts:
            if isinstance(part, bytes):
                out.append(part.decode(charset or "utf-8", errors="replace"))
            else:
                out.append(str(part))
        return " ".join(out)
    except Exception:
        return str(raw)

def _get_plain_body(msg: email.message.Message, max_chars: int = 2000) -> str:
    body = ""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    try:
                        charset = part.get_content_charset() or "utf-8"
                        body = part.get_payload(decode=True).decode(charset, errors="replace")
                        break
                    except Exception:
                        pass
        else:
            try:
                charset = msg.get_content_charset() or "utf-8"
                body = msg.get_payload(decode=True).decode(charset, errors="replace")
            except Exception:
                pass
    except Exception:
        pass
    return body[:max_chars]

def _extract_sender_email(from_header: str) -> str:
    """Extract clean email address from From header like 'Name <email@domain.com>'."""
    m = re.search(r'<([^>]+)>', from_header)
    if m:
        return m.group(1).strip().lower()
    # fallback: treat entire string as email if no angle brackets
    return from_header.strip().lower()

def _scan_mailbox_sync(
    host: str,
    port: int,
    email_addr: str,
    password: str,
    max_msgs: int = 50,
    sender_whitelist: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Synchronous mailbox scan.
    If sender_whitelist is provided and non-empty, only returns emails from
    those sender addresses.
    """
    results = []
    try:
        password = _clean_password(password)
        conn = imaplib.IMAP4_SSL(host, int(port))
        conn.login(email_addr, password)
        conn.select("INBOX", readonly=True)
        _, data = conn.search(None, "ALL")
        if not data or not data[0]:
            conn.logout()
            return results
        ids = data[0].split()[-max_msgs:]
        for msg_id in reversed(ids):
            try:
                _, msg_data = conn.fetch(msg_id, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue
                msg = email.message_from_bytes(msg_data[0][1])
                from_raw = _decode_header_str(msg.get("From", ""))
                sender_clean = _extract_sender_email(from_raw)

                # Apply whitelist filter if set
                if sender_whitelist:
                    whitelist_lower = [s.strip().lower() for s in sender_whitelist]
                    # Check exact match or domain match (@domain.com)
                    matched = False
                    for entry in whitelist_lower:
                        if entry.startswith("@"):
                            # Domain match
                            if sender_clean.endswith(entry):
                                matched = True
                                break
                        else:
                            if sender_clean == entry:
                                matched = True
                                break
                    if not matched:
                        continue  # skip non-whitelisted sender

                results.append({
                    "subject":      _decode_header_str(msg.get("Subject", "")),
                    "from_addr":    from_raw,
                    "sender_email": sender_clean,
                    "msg_date":     msg.get("Date", ""),
                    "body":         _get_plain_body(msg),
                    "message_id":   (msg.get("Message-ID") or "").strip(),
                })
            except Exception:
                continue
        conn.logout()
    except Exception as e:
        logger.error(f"IMAP scan error for {email_addr}: {e}")
    return results


# =============================================================================
# AI EXTRACTION
# =============================================================================

_AI_SYSTEM = """
You are a specialized legal and tax assistant for a CA/CS/Legal firm in India.
Extract ONLY professional/legal events from the email. Be VERY strict.

STRICT RULES:
1. FOCUS ONLY ON:
   - Trademark hearings, notices, examination reports, show cause notices (IP India)
   - Court hearings (NCLT, High Court, Supreme Court, any tribunal)
   - ROC compliance deadlines (MCA21, annual filing, AOC-4, MGT-7)
   - GST deadlines (GSTR-1, GSTR-3B, GSTR-9, GST notices)
   - Income Tax deadlines (ITR filing, advance tax, notices from IT dept)
   - Client visits or scheduled meetings with clients
   - Online meetings (Zoom, Google Meet, Teams)
   - Examination reports / office actions requiring reply

2. STRICTLY DISCARD — return [] for junk:
   - Jio, Airtel, Vi, BSNL bills
   - Bank transaction alerts, OTPs, credit card statements
   - Adobe, Canva, software subscription offers
   - Job applications, recruitment emails
   - Marketing, newsletters, discount offers
   - LinkedIn, Facebook, Instagram, Twitter, YouTube notifications
   - Amazon, Flipkart, Swiggy, Zomato, Uber, Ola
   - Any email clearly NOT related to CA/CS/Legal firm work

3. DATES: If year is missing but month/day is present, assume 2026.

4. Return ONLY a valid JSON array. No markdown, no preamble.
   Each object must have exactly these keys:
   title (string), event_type (one of: Trademark Hearing, Court Hearing,
   Online Meeting, Deadline, Visit, Other, Examination Report, Notice),
   date (yyyy-MM-dd or null), time (HH:mm or null),
   organizer (string or null), description (max 100 chars),
   urgency (high|medium|low)

5. If the email is junk/irrelevant, return exactly: []
"""

_JUNK_KEYWORDS = [
    "jio", "airtel", "vodafone", "vi mobile", "bsnl", "tata sky", "d2h",
    "payment received", "payment successful", "transaction successful",
    "transaction alert", "otp", "one time password", "your otp",
    "credit card statement", "bank statement", "account statement",
    "your account has been", "debited", "credited",
    "adobe", "canva", "figma", "coursera", "udemy", "skillshare",
    "discount", "exclusive offer", "flash sale", "cashback", "reward points",
    "linkedin", "facebook", "instagram", "twitter", "youtube",
    "job application", "new applicants", "your job has", "resume",
    "unsubscribe", "newsletter", "promotional", "marketing",
    "keep your pdf", "safe from prying", "web version:",
    "amazon", "flipkart", "swiggy", "zomato", "uber", "ola",
    "nykaa", "myntra", "meesho", "bigbasket",
]

async def _extract_events_from_email(
    subject: str, body: str, from_addr: str, msg_date: str
) -> List[Dict]:
    combined = f"{subject.lower()} {body.lower()[:500]}"

    for kw in _JUNK_KEYWORDS:
        if kw in combined:
            logger.debug(f"Junk pre-filter: {subject[:60]}")
            return []

    if _gemini:
        try:
            prompt = f"{_AI_SYSTEM}\n\nFrom: {from_addr}\nSubject: {subject}\nBody:\n{body}"
            resp = await _gemini.generate_content_async(prompt)
            raw = re.sub(r"```[a-z]*\n?|```", "", resp.text.strip())
            result = json.loads(raw)
            if isinstance(result, list):
                # Add save_category to each extracted event
                categorized = []
                for ev in result:
                    ev["save_category"] = _classify_save_category(
                        ev.get("event_type", ""), subject, body
                    )
                    categorized.append(ev)
                return categorized
        except Exception as e:
            logger.warning(f"Gemini extraction failed for '{subject[:50]}': {e}")

    return _regex_extract(subject, body, from_addr)

def _regex_extract(subject: str, body: str, from_addr: str) -> List[Dict]:
    text = f"{subject} {body}".lower()

    junk = [
        "offer", "discount", "otp", "statement", "transaction successful",
        "payment received", "jio", "airtel", "adobe", "newsletter",
        "unsubscribe", "promotional", "cashback",
    ]
    if any(j in text for j in junk):
        return []

    date_pat = r"\b(\d{1,4})[/\-\.](\d{1,2})[/\-\.](\d{1,4})\b"
    m = re.search(date_pat, text)
    date_str = None
    if m:
        p1, p2, p3 = m.groups()
        if len(p1) == 4:
            date_str = f"{p1}-{p2.zfill(2)}-{p3.zfill(2)}"
        else:
            year = p3 if len(p3) == 4 else "20" + p3
            date_str = f"{year}-{p2.zfill(2)}-{p1.zfill(2)}"

    if not date_str:
        return []

    if any(w in text for w in ["trademark", "ipindia", "ip india", "opposition", "show cause"]):
        etype = "Trademark Hearing"
    elif any(w in text for w in ["court", "nclt", "tribunal", "hearing", "high court"]):
        etype = "Court Hearing"
    elif any(w in text for w in ["examination report", "office action", "objection"]):
        etype = "Examination Report"
    elif any(w in text for w in ["gst", "gstr", "income tax", "itr", "roc", "mca", "advance tax"]):
        etype = "Deadline"
    elif any(w in text for w in ["visit"]):
        etype = "Visit"
    else:
        etype = "Deadline"

    save_cat = _classify_save_category(etype, subject, body)

    return [{
        "title":         subject[:100],
        "event_type":    etype,
        "date":          date_str,
        "time":          None,
        "organizer":     from_addr[:50],
        "description":   body[:100],
        "urgency":       "high",
        "save_category": save_cat,
    }]


# =============================================================================
# MONGO DOC → PYDANTIC HELPERS
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
        save_category=doc.get("save_category"),
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
# AUTO-SAVE: save extracted events to reminders / visits / todos
# =============================================================================

REMINDER_EVENT_TYPES = {"Trademark Hearing", "Court Hearing", "Deadline", "Appointment", "Other"}
VISIT_EVENT_TYPES    = {"Visit", "Online Meeting", "Conference", "Interview", "Meeting"}
TODO_EVENT_TYPES     = {"Examination Report", "Notice"}

async def _auto_save_event(user_id: str, event: ExtractedEventOut, prefs: Dict):
    # Don't re-save if user has explicitly dismissed this event title before
    existing_dismissed = await db["reminders"].find_one({
        "user_id": user_id,
        "title":   event.title,
        "is_dismissed": True,
    })
    if existing_dismissed:
        return  # User has dismissed this reminder — respect their choice

    """
    Save a qualified event to the appropriate collection based on smart categorization.

    FIX (v4): Each saved document stores a unique source identifier so that
    deleting one item does NOT cascade-delete others. The old code was matching
    by (user_id, source="email_auto") which deleted everything at once.
    Now we match by (user_id, title, source="email_auto") for reminders/visits
    and (user_id, title, source="email_auto") for todos — unique per item.
    """
    try:
        save_cat = event.save_category or _classify_save_category(
            event.event_type, event.title, event.description or ""
        )

        if save_cat == "todo" and prefs.get("auto_save_todos"):
            # Save as TODO
            existing = await db["todos"].find_one({
                "user_id": user_id,
                "title":   event.title,
                "source":  "email_auto",
            })
            if not existing:
                await db["todos"].insert_one({
                    "user_id":      user_id,
                    "title":        event.title,
                    "description":  f"Auto-imported from email.\nFrom: {event.source_from}\nSubject: {event.source_subject}\nNotes: {event.description or ''}",
                    "is_completed": False,
                    "due_date":     event.date or None,
                    "source":       "email_auto",
                    # Store message_id so individual deletion works correctly
                    "email_message_id": getattr(event, "_message_id", None),
                    "created_at":   datetime.now(timezone.utc).isoformat(),
                    "updated_at":   datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"Auto-saved todo: {event.title}")

        elif save_cat == "reminder" and prefs.get("auto_save_reminders"):
            date_str = event.date or datetime.now(IST).strftime("%Y-%m-%d")
            time_str = event.time or "10:00"
            try:
                remind_dt = datetime.strptime(f"{date_str}T{time_str}", "%Y-%m-%dT%H:%M")
                remind_dt = remind_dt.replace(tzinfo=IST)
            except Exception:
                remind_dt = datetime.now(IST) + timedelta(days=1)

            existing = await db["reminders"].find_one({
                "user_id": user_id,
                "title":   event.title,
                "source":  "email_auto",
            })
            # Don\'t re-save if it was previously deleted/dismissed by user
            if existing and existing.get("is_dismissed"):
                return  # User dismissed/deleted this — don\'t re-add
            if not existing:
                description_parts = []
                if event.organizer:      description_parts.append(f"From: {event.organizer}")
                if event.description:    description_parts.append(f"Notes: {event.description}")
                if event.source_subject: description_parts.append(f"Subject: {event.source_subject}")

                await db["reminders"].insert_one({
                    "user_id":           user_id,
                    "title":             event.title,
                    "description":       "\n".join(description_parts) or None,
                    "remind_at":         remind_dt.isoformat(),
                    "is_dismissed":      False,
                    "source":            "email_auto",
                    # Store unique message_id to prevent cascade deletes
                    "email_message_id":  getattr(event, "_message_id", None),
                    "created_at":        datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"Auto-saved reminder: {event.title}")

        elif save_cat == "visit" and prefs.get("auto_save_visits"):
            date_str = event.date or datetime.now(IST).strftime("%Y-%m-%d")
            existing = await db["visits"].find_one({
                "user_id":    user_id,
                "title":      event.title,
                "visit_date": date_str,
                "source":     "email_auto",
            })
            if not existing:
                await db["visits"].insert_one({
                    "user_id":          user_id,
                    "title":            event.title,
                    "visit_date":       date_str,
                    "notes":            event.description or event.source_subject or "",
                    "status":           "scheduled",
                    "source":           "email_auto",
                    # Store unique message_id to prevent cascade deletes
                    "email_message_id": getattr(event, "_message_id", None),
                    "created_at":       datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"Auto-saved visit: {event.title}")

    except Exception as e:
        logger.error(f"Auto-save error for '{event.title}': {e}")


# =============================================================================
# DAILY SCHEDULED SCAN LOOP
# =============================================================================

_scan_task = None

async def _scheduled_scan_loop():
    logger.info("Email scheduled scan loop started.")
    while True:
        try:
            now_ist = datetime.now(IST)
            cursor = db[COL_AUTO_PREFS].find({})
            prefs_list = await cursor.to_list(length=500)

            for pref in prefs_list:
                user_id     = pref.get("user_id")
                scan_hour   = pref.get("scan_time_hour", 12)
                scan_minute = pref.get("scan_time_minute", 0)

                target = now_ist.replace(
                    hour=scan_hour, minute=scan_minute, second=0, microsecond=0
                )
                diff_seconds = abs((now_ist - target).total_seconds())
                if diff_seconds > 300:
                    continue

                sched_doc = await db[COL_SCAN_SCHEDULE].find_one({"user_id": user_id})
                if sched_doc:
                    last_run = sched_doc.get("last_run", "")
                    if last_run and last_run[:10] == now_ist.strftime("%Y-%m-%d"):
                        continue

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
            logger.error(f"Scan loop outer error: {e}")

        await asyncio.sleep(60)


async def _run_full_scan_for_user(user_id: str, prefs: Dict, limit: int = 50):
    """Scan all active connections for a user and auto-save events."""
    conns = await db[COL_CONNECTIONS].find(
        {"user_id": user_id, "is_active": True}
    ).to_list(50)
    if not conns:
        return

    # Load sender whitelist for this user
    whitelist_doc = await db[COL_SENDER_WHITELIST].find_one({"user_id": user_id})
    sender_whitelist = []
    if whitelist_doc and whitelist_doc.get("senders"):
        sender_whitelist = [
            s.get("email_address", "") for s in whitelist_doc["senders"]
            if s.get("email_address")
        ]

    loop = asyncio.get_event_loop()
    for conn in conns:
        try:
            email_addr = conn["email_address"]
            raw_emails = await loop.run_in_executor(
                None, _scan_mailbox_sync,
                conn["imap_host"], conn["imap_port"], email_addr,
                _decrypt(conn["app_password_enc"]), limit,
                sender_whitelist if sender_whitelist else None,
            )
            for raw in raw_emails:
                mid = raw.get("message_id")
                exists = await db[COL_EVENTS].find_one({"user_id": user_id, "message_id": mid})
                if exists:
                    ev = _doc_to_out(exists)
                    await _auto_save_event(user_id, ev, prefs)
                    continue

                extracted = await _extract_events_from_email(
                    raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"]
                )
                for ev in extracted:
                    doc = {
                        "user_id":        user_id,
                        "email_account":  email_addr,
                        "message_id":     mid,
                        "title":          ev.get("title") or raw["subject"][:120],
                        "event_type":     ev.get("event_type", "Other"),
                        "date":           ev.get("date"),
                        "time":           ev.get("time"),
                        "organizer":      ev.get("organizer"),
                        "description":    ev.get("description"),
                        "urgency":        ev.get("urgency", "medium"),
                        "save_category":  ev.get("save_category", "reminder"),
                        "source_subject": raw["subject"][:200],
                        "source_from":    raw["from_addr"][:200],
                        "source_date":    raw["msg_date"][:100],
                        "raw_snippet":    raw["body"][:300],
                        "created_at":     datetime.now(timezone.utc).isoformat(),
                    }
                    res = await db[COL_EVENTS].insert_one(doc)
                    doc["id"] = str(res.inserted_id)
                    ev_out = _doc_to_out(doc)
                    # Attach message_id for cascade-prevention
                    ev_out._message_id = mid
                    await _auto_save_event(user_id, ev_out, prefs)

            await db[COL_CONNECTIONS].update_one(
                {"_id": conn["_id"]},
                {"$set": {
                    "last_synced": datetime.now(timezone.utc).isoformat(),
                    "sync_error":  None,
                }}
            )
        except Exception as e:
            logger.error(f"Scan error for {conn.get('email_address')}: {e}")
            await db[COL_CONNECTIONS].update_one(
                {"_id": conn["_id"]}, {"$set": {"sync_error": str(e)}}
            )


def start_scheduled_scan_loop():
    global _scan_task
    loop = asyncio.get_event_loop()
    _scan_task = loop.create_task(_scheduled_scan_loop())
    logger.info("Scheduled email scan loop registered.")


# =============================================================================
# API ROUTES — CONNECTIONS
# =============================================================================

@router.get("/connections")
async def list_connections(current_user=Depends(get_current_user)):
    cursor = db[COL_CONNECTIONS].find(
        {"user_id": str(current_user.id)},
        {"app_password_enc": 0}
    )
    docs = await cursor.to_list(length=100)
    return {"connections": [_conn_doc_to_out(d) for d in docs]}


@router.post("/connections", status_code=201)
async def add_connection(
    body: ConnectionCreateRequest,
    current_user=Depends(get_current_user)
):
    try:
        host, port, provider = _infer_provider(body.email_address)
        host = body.imap_host or host
        port = body.imap_port or port

        loop = asyncio.get_event_loop()
        error_msg = await loop.run_in_executor(
            None, _test_imap_sync, host, port, body.email_address, body.app_password
        )

        if error_msg:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

        clean_email = body.email_address.strip().lower()
        doc = {
            "user_id":          str(current_user.id),
            "email_address":    clean_email,
            "app_password_enc": _encrypt(_clean_password(body.app_password)),
            "imap_host":        host,
            "imap_port":        port,
            "label":            body.label or f"{provider.capitalize()} ({clean_email})",
            "provider":         provider,
            "is_active":        True,
            "connected_at":     datetime.now(timezone.utc).isoformat(),
        }

        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": clean_email},
            {"$set": doc},
            upsert=True
        )

        return _conn_doc_to_out(doc)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Multi-account add error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect email: {str(e)}"
        )


@router.patch("/connections/{email_address}")
async def update_connection(
    email_address: str,
    body: ConnectionUpdateRequest,
    current_user=Depends(get_current_user)
):
    existing = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates.get("is_active"):
        updates["sync_error"] = None
    await db[COL_CONNECTIONS].update_one({"_id": existing["_id"]}, {"$set": updates})
    doc = await db[COL_CONNECTIONS].find_one({"_id": existing["_id"]})
    return _conn_doc_to_out(doc)


@router.delete("/connections/{email_address}", status_code=204)
async def delete_connection(email_address: str, current_user=Depends(get_current_user)):
    await db[COL_CONNECTIONS].delete_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )


@router.post("/connections/{email_address}/test")
async def test_connection(email_address: str, current_user=Depends(get_current_user)):
    doc = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")

    loop = asyncio.get_event_loop()
    error_msg = await loop.run_in_executor(
        None, _test_imap_sync,
        doc["imap_host"], doc["imap_port"],
        email_address, _decrypt(doc["app_password_enc"])
    )

    if error_msg:
        await db[COL_CONNECTIONS].update_one(
            {"_id": doc["_id"]}, {"$set": {"sync_error": error_msg}}
        )
        raise HTTPException(status_code=400, detail=error_msg)

    await db[COL_CONNECTIONS].update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "sync_error":  None,
            "last_synced": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"status": "ok", "message": f"{email_address} connected successfully"}


# =============================================================================
# API ROUTES — SENDER WHITELIST  (NEW in v4)
# =============================================================================

@router.get("/sender-whitelist")
async def get_sender_whitelist(current_user=Depends(get_current_user)):
    """Get the list of approved sender email addresses for auto-sync."""
    doc = await db[COL_SENDER_WHITELIST].find_one(
        {"user_id": str(current_user.id)}, {"_id": 0}
    )
    return {"senders": doc.get("senders", []) if doc else []}


@router.post("/sender-whitelist")
async def add_sender_to_whitelist(
    body: SenderWhitelistEntry,
    current_user=Depends(get_current_user)
):
    """Add a sender email address to the whitelist."""
    clean_addr = body.email_address.strip().lower()
    if not clean_addr or ("@" not in clean_addr and not clean_addr.startswith("@")):
        raise HTTPException(
            status_code=422,
            detail="Invalid email address. Use full address (user@domain.com) or domain (@domain.com)."
        )

    entry = {
        "email_address": clean_addr,
        "label":         body.label or clean_addr,
        "added_at":      datetime.now(timezone.utc).isoformat(),
    }

    # Check if already in list
    existing = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)})
    if existing:
        already = any(
            s.get("email_address") == clean_addr
            for s in existing.get("senders", [])
        )
        if already:
            return {"message": "Sender already in whitelist", "senders": existing.get("senders", [])}
        await db[COL_SENDER_WHITELIST].update_one(
            {"user_id": str(current_user.id)},
            {"$push": {"senders": entry}}
        )
    else:
        await db[COL_SENDER_WHITELIST].insert_one({
            "user_id": str(current_user.id),
            "senders": [entry],
        })

    updated = await db[COL_SENDER_WHITELIST].find_one(
        {"user_id": str(current_user.id)}, {"_id": 0}
    )
    return {"message": "Sender added", "senders": updated.get("senders", [])}


@router.delete("/sender-whitelist/{email_address}")
async def remove_sender_from_whitelist(
    email_address: str,
    current_user=Depends(get_current_user)
):
    """Remove a sender from the whitelist."""
    await db[COL_SENDER_WHITELIST].update_one(
        {"user_id": str(current_user.id)},
        {"$pull": {"senders": {"email_address": email_address.lower()}}}
    )
    updated = await db[COL_SENDER_WHITELIST].find_one(
        {"user_id": str(current_user.id)}, {"_id": 0}
    )
    return {"message": "Sender removed", "senders": (updated or {}).get("senders", [])}


@router.put("/sender-whitelist")
async def replace_sender_whitelist(
    body: SenderWhitelistOut,
    current_user=Depends(get_current_user)
):
    """Replace the entire sender whitelist."""
    senders = []
    for s in body.senders:
        clean = s.get("email_address", "").strip().lower()
        if clean:
            senders.append({
                "email_address": clean,
                "label":         s.get("label", clean),
                "added_at":      datetime.now(timezone.utc).isoformat(),
            })

    await db[COL_SENDER_WHITELIST].update_one(
        {"user_id": str(current_user.id)},
        {"$set": {"senders": senders, "user_id": str(current_user.id)}},
        upsert=True
    )
    return {"message": "Whitelist updated", "senders": senders}


# =============================================================================
# API ROUTES — AUTO-SAVE PREFERENCES
# =============================================================================

@router.get("/auto-save-prefs", response_model=AutoSavePrefOut)
async def get_auto_save_prefs(current_user=Depends(get_current_user)):
    doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)})
    if not doc:
        return AutoSavePrefOut(
            auto_save_reminders=False,
            auto_save_visits=False,
            auto_save_todos=False,
            scan_time_hour=12,
            scan_time_minute=0,
            next_scan_at=None
        )
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
        auto_save_todos=doc.get("auto_save_todos", False),
        scan_time_hour=doc.get("scan_time_hour", 12),
        scan_time_minute=doc.get("scan_time_minute", 0),
        next_scan_at=next_scan.isoformat()
    )


@router.post("/auto-save-prefs", response_model=AutoSavePrefOut)
async def set_auto_save_prefs(
    body: AutoSavePrefRequest,
    current_user=Depends(get_current_user)
):
    doc = {
        "user_id":             str(current_user.id),
        "auto_save_reminders": body.auto_save_reminders,
        "auto_save_visits":    body.auto_save_visits,
        "auto_save_todos":     body.auto_save_todos,
        "scan_time_hour":      max(0, min(23, body.scan_time_hour)),
        "scan_time_minute":    max(0, min(59, body.scan_time_minute)),
        "updated_at":          datetime.now(timezone.utc).isoformat(),
    }
    await db[COL_AUTO_PREFS].update_one(
        {"user_id": str(current_user.id)}, {"$set": doc}, upsert=True
    )
    return await get_auto_save_prefs(current_user)


@router.get("/auto-save-prefs/exists")
async def check_prefs_exist(current_user=Depends(get_current_user)):
    doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)})
    return {"has_set_prefs": doc is not None}


# =============================================================================
# API ROUTES — MANUAL SAVE
# FIX (v4): Individual reminder/visit delete no longer cascade-deletes others.
# Each document is stored with a unique (user_id, title, source, created_at).
# =============================================================================

@router.post("/save-as-reminder", status_code=201)
async def save_as_reminder(
    body: ManualSaveReminderRequest,
    current_user=Depends(get_current_user)
):
    try:
        try:
            remind_dt = datetime.fromisoformat(body.remind_at.replace("Z", "+00:00"))
        except Exception:
            remind_dt = datetime.now(IST) + timedelta(days=1)

        # FIX: Match by (user_id, title) only — NOT by source="email_auto"
        # so deleting one doesn't wipe all auto-saved reminders
        existing = await db["reminders"].find_one({
            "user_id": str(current_user.id),
            "title":   body.title,
        })
        if existing:
            return {"status": "already_exists", "id": str(existing["_id"])}

        result = await db["reminders"].insert_one({
            "user_id":      str(current_user.id),
            "title":        body.title,
            "description":  body.description,
            "remind_at":    remind_dt.isoformat(),
            "is_dismissed": False,
            "source":       "email_manual",
            # Unique identifier so deletes are scoped to this one item
            "event_id":     body.event_id,
            "created_at":   datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": str(result.inserted_id)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"save_as_reminder error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save reminder: {e}")


@router.post("/save-as-visit", status_code=201)
async def save_as_visit(
    body: ManualSaveVisitRequest,
    current_user=Depends(get_current_user)
):
    try:
        existing = await db["visits"].find_one({
            "user_id":    str(current_user.id),
            "title":      body.title,
            "visit_date": body.visit_date,
        })
        if existing:
            return {"status": "already_exists", "id": str(existing["_id"])}

        result = await db["visits"].insert_one({
            "user_id":    str(current_user.id),
            "title":      body.title,
            "visit_date": body.visit_date,
            "notes":      body.notes or "",
            "status":     "scheduled",
            "source":     "email_manual",
            # Unique identifier so deletes are scoped to this one item
            "event_id":   body.event_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": str(result.inserted_id)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"save_as_visit error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save visit: {e}")


@router.post("/save-as-todo", status_code=201)
async def save_as_todo(
    body: ManualSaveReminderRequest,   # reuse same schema
    current_user=Depends(get_current_user)
):
    """Save an email event as a TODO item."""
    try:
        existing = await db["todos"].find_one({
            "user_id": str(current_user.id),
            "title":   body.title,
        })
        if existing:
            return {"status": "already_exists", "id": str(existing.get("_id", existing.get("id", "")))}

        result = await db["todos"].insert_one({
            "user_id":      str(current_user.id),
            "title":        body.title,
            "description":  body.description,
            "is_completed": False,
            "due_date":     body.remind_at[:10] if body.remind_at else None,
            "source":       "email_manual",
            "event_id":     body.event_id,
            "created_at":   datetime.now(timezone.utc).isoformat(),
            "updated_at":   datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": str(result.inserted_id)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"save_as_todo error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save todo: {e}")


# =============================================================================
# API ROUTES — EVENT EXTRACTION ENGINE
# =============================================================================

@router.get("/extract-events", response_model=List[ExtractedEventOut])
async def extract_events(
    current_user=Depends(get_current_user),
    limit: int = Query(30),
    force_refresh: bool = Query(False)
):
    conns = await db[COL_CONNECTIONS].find(
        {"user_id": str(current_user.id), "is_active": True}
    ).to_list(50)
    if not conns:
        return []

    prefs_doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)}) or {}

    # Load sender whitelist
    whitelist_doc = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)})
    sender_whitelist = []
    if whitelist_doc and whitelist_doc.get("senders"):
        sender_whitelist = [
            s.get("email_address", "") for s in whitelist_doc["senders"]
            if s.get("email_address")
        ]

    async def process_account(conn):
        email_addr = conn["email_address"]

        if not force_refresh and conn.get("last_synced"):
            try:
                last = datetime.fromisoformat(conn["last_synced"])
                if (datetime.now(timezone.utc) - last).total_seconds() < 1800:
                    cached = await db[COL_EVENTS].find(
                        {"user_id": str(current_user.id), "email_account": email_addr}
                    ).sort("_id", -1).limit(limit).to_list(limit)
                    return [_doc_to_out(d) for d in cached]
            except Exception:
                pass

        loop = asyncio.get_event_loop()
        raw_emails = await loop.run_in_executor(
            None, _scan_mailbox_sync,
            conn["imap_host"], conn["imap_port"], email_addr,
            _decrypt(conn["app_password_enc"]), 50,
            sender_whitelist if sender_whitelist else None,
        )

        acc_results = []
        for raw in raw_emails:
            mid = raw.get("message_id")
            exists = await db[COL_EVENTS].find_one(
                {"user_id": str(current_user.id), "message_id": mid}
            )
            if exists:
                ev_out = _doc_to_out(exists)
                acc_results.append(ev_out)
                if prefs_doc:
                    await _auto_save_event(str(current_user.id), ev_out, prefs_doc)
                continue

            extracted = await _extract_events_from_email(
                raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"]
            )
            for ev in extracted:
                doc = {
                    "user_id":        str(current_user.id),
                    "email_account":  email_addr,
                    "message_id":     mid,
                    "title":          ev.get("title") or raw["subject"][:120],
                    "event_type":     ev.get("event_type", "Other"),
                    "date":           ev.get("date"),
                    "time":           ev.get("time"),
                    "organizer":      ev.get("organizer"),
                    "description":    ev.get("description"),
                    "urgency":        ev.get("urgency", "medium"),
                    "save_category":  ev.get("save_category", "reminder"),
                    "source_subject": raw["subject"][:200],
                    "source_from":    raw["from_addr"][:200],
                    "source_date":    raw["msg_date"][:100],
                    "raw_snippet":    raw["body"][:300],
                    "created_at":     datetime.now(timezone.utc).isoformat(),
                }
                res = await db[COL_EVENTS].insert_one(doc)
                doc["id"] = str(res.inserted_id)
                ev_out = _doc_to_out(doc)
                acc_results.append(ev_out)
                if prefs_doc:
                    await _auto_save_event(str(current_user.id), ev_out, prefs_doc)

        await db[COL_CONNECTIONS].update_one(
            {"_id": conn["_id"]},
            {"$set": {
                "last_synced": datetime.now(timezone.utc).isoformat(),
                "sync_error":  None,
            }}
        )
        return acc_results

    tasks = [process_account(c) for c in conns]
    completed = await asyncio.gather(*tasks, return_exceptions=True)

    final_events = []
    for res in completed:
        if isinstance(res, list):
            final_events.extend(res)
        elif isinstance(res, Exception):
            logger.error(f"process_account error: {res}")

    final_events.sort(key=lambda e: e.date or "0000-00-00", reverse=True)
    return final_events[:limit]


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: str, current_user=Depends(get_current_user)):
    """
    FIX (v4): Delete ONLY the specific event by its MongoDB _id.
    Previously this route also wiped all auto-saved reminders/visits.
    Now it ONLY removes the cached extraction record.
    The corresponding reminder/visit/todo must be deleted separately
    from their own endpoints (DELETE /reminders/{id}, etc.)
    """
    try:
        await db[COL_EVENTS].delete_one(
            {"_id": ObjectId(event_id), "user_id": str(current_user.id)}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid event id: {e}")


@router.delete("/events/clear-all", status_code=204)
async def clear_all_events(current_user=Depends(get_current_user)):
    """Clear all cached extracted events — forces fresh scan next time.
    NOTE: This does NOT delete reminders, visits, or todos already saved.
    """
    await db[COL_EVENTS].delete_many({"user_id": str(current_user.id)})


@router.get("/importer/events", response_model=List[ExtractedEventOut])
async def importer_events(
    current_user=Depends(get_current_user),
    limit: int = Query(30),
    force_refresh: bool = Query(False)
):
    count = await db[COL_EVENTS].count_documents({"user_id": str(current_user.id)})
    if count == 0 or force_refresh:
        return await extract_events(current_user, limit, force_refresh)
    docs = await db[COL_EVENTS].find(
        {"user_id": str(current_user.id)}
    ).sort("date", -1).limit(limit).to_list(limit)
    return [_doc_to_out(d) for d in docs]


# =============================================================================
# ATTENDANCE / HOLIDAY / VISIT CARD INTEGRATION HELPERS
# =============================================================================

@router.get("/attendance/today-summary")
async def attendance_today_summary(current_user=Depends(get_current_user)):
    try:
        # Determine User ID safely
        if hasattr(current_user, "id"):
            u_id = str(current_user.id)
        elif isinstance(current_user, dict):
            u_id = str(current_user.get("id") or current_user.get("_id") or "")
        else:
            u_id = str(current_user)

        if not u_id:
            raise ValueError("Could not resolve user ID")

        today = datetime.now(IST).strftime("%Y-%m-%d")
        week_later = (datetime.now(IST) + timedelta(days=7)).strftime("%Y-%m-%d")

        # FETCH VISITS
        visits_raw = await db["visits"].find({
            "user_id": u_id, 
            "visit_date": today
        }).to_list(length=20)

        # FETCH REMINDERS
        # Added $ne True to handle both null and False safely
        reminders_raw = await db["reminders"].find({
            "user_id": u_id,
            "is_dismissed": {"$ne": True},
            "remind_at": {"$gte": today, "$lte": week_later + "T23:59:59"}
        }).sort("remind_at", 1).to_list(length=20)

        return {
            "today": today,
            "visits_today": [
                {
                    "title": v.get("title", "Untitled"), 
                    "status": v.get("status", "scheduled"), 
                    "notes": v.get("notes") or v.get("description") or ""
                }
                for v in visits_raw
            ],
            "upcoming_reminders": [
                {
                    "title": r.get("title", "Untitled"), 
                    "remind_at": str(r.get("remind_at", ""))
                }
                for r in reminders_raw
            ],
        }
    except Exception as e:
        logger.error(f"Error in attendance summary: {str(e)}")
        # Fallback to avoid 500
        return {
            "today": datetime.now(IST).strftime("%Y-%m-%d"), 
            "visits_today": [], 
            "upcoming_reminders": [],
            "error": str(e)
        }


@router.get("/holidays/upcoming")
async def upcoming_holidays(current_user=Depends(get_current_user)):
    try:
        if hasattr(current_user, "id"):
            u_id = str(current_user.id)
        elif isinstance(current_user, dict):
            u_id = str(current_user.get("id") or current_user.get("_id") or "")
        else:
            u_id = str(current_user)

        today = datetime.now(IST).strftime("%Y-%m-%d")
        
        # Use simple find and manual serialization to bypass Pydantic validation crashes
        cursor = db[COL_EVENTS].find({
            "user_id": u_id,
            "date": {"$gte": today},
            "event_type": {"$in": ["Court Hearing", "Trademark Hearing", "Deadline"]},
        }).sort("date", 1).limit(10)
        
        events = await cursor.to_list(length=10)
        
        cleaned_events = []
        for e in events:
            cleaned_events.append({
                "id": str(e.get("_id")),
                "title": e.get("title", "Notice"),
                "date": e.get("date"),
                "event_type": e.get("event_type")
            })
            
        return {"events": cleaned_events}
    except Exception as e:
        logger.error(f"Error in upcoming holidays: {str(e)}")
        return {"events": []}
