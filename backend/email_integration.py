# =============================================================================
# email_integration.py  — v9  COMPLETE CORRECTED FILE
# FastAPI router — IMAP email connection management + AI event extraction
# Specialized for: CA/CS/Legal Firm (Trademark Hearings, NCLT, GST, ROC)
# Stack: FastAPI · MongoDB (motor) · Google Gemini 2.0 Flash-Lite · imaplib
#
# FIXED IN v9 (bug fixes over v8):
#
#  [BUG FIX 1 — DELETE/PATCH 404 on auto-saved reminders]
#  - _auto_save_event reminder INSERT now generates a UUID string "id" field
#    before insert_one, so DELETE /reminders/{id} and PATCH /reminders/{id}
#    can find the document. Previously only manual saves had a string id.
#
#  [BUG FIX 2 — DELETE/PATCH 404 on auto-saved todos]
#  - _auto_save_event todo INSERT now generates a UUID string "id" field
#    before insert_one, matching the pattern used by save_as_todo route.
#
#  [BUG FIX 3 — _doc_to_out empty id for auto-saved records]
#  - _doc_to_out now falls back to str(_id) when string "id" field is absent,
#    so cached auto-saved events always expose a usable id to the frontend.
#
#  [NEW ROUTE — /migrate-fix-ids]
#  - One-time backfill: sets string "id" = str(_id) on all existing reminders
#    and todos that were auto-saved without a string id (v8 and earlier).
#    Safe to call multiple times. Run once after deploying v9.
#
#  [v8 RETAINED — all original features unchanged]
#  - IP India hearing / exam report / reminder-I/II/III / adjournment parsing
#  - TM app number deduplication for reminders and todos
#  - HTML→plain text, _clean_text, charset fallback
#  - Whitelist subdomain matching, junk pre-filter
#  - All existing API routes unchanged
# =============================================================================

import imaplib
import email
import email.header
import re
import json
import asyncio
import logging
import html
import uuid as _uuid
from html.parser import HTMLParser
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Set, Tuple
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

COL_CONNECTIONS      = "email_connections"
COL_EVENTS           = "email_extracted_events"
COL_AUTO_PREFS       = "email_auto_save_prefs"
COL_SCAN_SCHEDULE    = "email_scan_schedule"
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
    save_category: Optional[str] = None   # "todo" | "reminder" | "visit"
    tm_app_no: Optional[str] = None       # TM Application Number

class AutoSavePrefRequest(BaseModel):
    auto_save_reminders: bool
    auto_save_visits: bool
    auto_save_todos: bool = False
    scan_time_hour: int = 12
    scan_time_minute: int = 0

class AutoSavePrefOut(BaseModel):
    auto_save_reminders: bool
    auto_save_visits: bool
    auto_save_todos: bool = False
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

class SenderWhitelistEntry(BaseModel):
    email_address: str
    label: Optional[str] = None

class SenderWhitelistOut(BaseModel):
    senders: List[Dict[str, str]]


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
# TEXT CLEANING
# =============================================================================

class _HTMLTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "p", "div", "br", "tr", "td", "th", "li", "ul", "ol",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "blockquote", "pre", "hr", "section", "article", "header",
        "footer", "table", "thead", "tbody", "tfoot",
    }
    SKIP_TAGS = {"script", "style", "head", "noscript", "iframe", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._parts: List[str] = []
        self._skip_depth: int = 0

    def handle_starttag(self, tag: str, attrs):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str):
        if self._skip_depth > 0:
            return
        self._parts.append(data)

    def get_text(self) -> str:
        return "".join(self._parts)


def _html_to_text(html_content: str) -> str:
    if not html_content:
        return ""
    text = html.unescape(html_content)
    text = text.replace("\xa0", " ").replace("&nbsp;", " ")
    try:
        extractor = _HTMLTextExtractor()
        extractor.feed(text)
        text = extractor.get_text()
    except Exception:
        text = re.sub(r"<[^>]+>", " ", text)
    lines = [line.strip() for line in text.splitlines()]
    cleaned: List[str] = []
    prev_blank = False
    for line in lines:
        is_blank = (line == "")
        if is_blank and prev_blank:
            continue
        cleaned.append(line)
        prev_blank = is_blank
    return "\n".join(cleaned).strip()


def _clean_text(text: str, max_chars: int = 0) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = text.replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    text  = "\n".join(lines).strip()
    if max_chars and len(text) > max_chars:
        text = text[:max_chars].rstrip()
    return text


# =============================================================================
# IP INDIA EMAIL PARSER
# =============================================================================

_MONTH_MAP = {
    "january": 1,  "february": 2,  "march": 3,    "april": 4,
    "may": 5,      "june": 6,      "july": 7,      "august": 8,
    "september": 9,"october": 10,  "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _extract_tm_app_no(text: str) -> Optional[str]:
    """
    Extract TM application number from text.
    Priority: explicit "No" prefix first → bare 7-digit fallback.
    """
    for pat in [
        r"Application\s+No\.?\s*(\d{5,9})",
        r"\bNo\.?\s*(\d{5,9})(?:\s|$|[^\d])",
        r"Application\s+Number\s*[:\-]?\s*(\d{5,9})",
        r"App(?:lication)?\s*#\s*(\d{5,9})",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            candidate = m.group(1)
            if 5 <= len(candidate) <= 9:
                return candidate

    for m in re.finditer(r"\b(\d{7})\b", text):
        return m.group(1)

    for m in re.finditer(r"\b(\d{5,9})\b", text):
        candidate = m.group(1)
        if 2000 <= int(candidate) <= 2099:
            continue
        return candidate

    return None


def _parse_date_from_text(text: str) -> Optional[str]:
    """Extract first plausible date from text. Returns 'YYYY-MM-DD' or None."""
    for m in re.finditer(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b", text):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31 and 2020 <= y <= 2035:
            try:
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                continue

    for m in re.finditer(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})\b",
        text, re.IGNORECASE
    ):
        d, mo_str, y = int(m.group(1)), m.group(2).lower(), int(m.group(3))
        mo = _MONTH_MAP.get(mo_str)
        if mo and 1 <= d <= 31 and 2020 <= y <= 2035:
            try:
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                continue

    for m in re.finditer(
        r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b",
        text, re.IGNORECASE
    ):
        mo_str, d, y = m.group(1).lower(), int(m.group(2)), int(m.group(3))
        mo = _MONTH_MAP.get(mo_str)
        if mo and 1 <= d <= 31 and 2020 <= y <= 2035:
            try:
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                continue

    return None


def _extract_tm_class(text: str) -> Optional[str]:
    """Extract trademark class number from subject/body."""
    for pat in [
        r"in\s+class\s+(\d{1,2})\b",
        r"(?:class|वर्ग)\s*(?:no\.?)?\s*(\d{1,2})\b",
        r"वर्ग\s*/\s*in\s+class\s+(\d{1,2})\b",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def _is_adjournment(subject: str, body: str) -> bool:
    combined = (subject + " " + body[:600]).lower()
    return any(kw in combined for kw in [
        "adjourned", "adjournment", "rescheduled", "reschedule",
        "new date", "revised date", "postponed", "new hearing date",
        "hearing rescheduled", "changed to",
    ])


def _get_reminder_sequence(subject: str) -> int:
    """Returns 0=original, 1=Reminder-I, 2=Reminder-II, 3=Reminder-III …"""
    m = re.search(r"Reminder[-\s]*(I{1,3}|IV|V?\d*)", subject, re.IGNORECASE)
    if not m:
        return 0
    roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
    return roman_map.get(m.group(1).upper(), 1)


class _IPIndiaResult:
    __slots__ = [
        "event_type", "tm_app_no", "tm_class",
        "event_date",
        "reply_deadline",
        "new_date",
        "title", "description", "urgency", "save_category",
        "reminder_seq", "is_adjournment",
    ]
    def __init__(self):
        for a in self.__slots__:
            setattr(self, a, None)
        self.reminder_seq   = 0
        self.is_adjournment = False


def _parse_ipindia_email(subject: str, body: str, msg_date: str) -> Optional["_IPIndiaResult"]:
    """
    Parse an IP India (noreply.tmr@gov.in) email with precision.
    Handles: Hearing Notices, Examination Reports, Reminder-I/II/III,
    and Adjournment emails.
    """
    r = _IPIndiaResult()
    subj_lower  = subject.lower()
    body_lower  = body.lower()
    full_lower  = subj_lower + " " + body_lower[:800]

    is_hearing = (
        "hearing notice" in subj_lower
        or ("hearing" in subj_lower and "application" in subj_lower
            and "examination" not in subj_lower)
    )
    is_exam_report = (
        "examination report" in subj_lower
        or "परीक्षा रिपोर्ट" in subject
        or ("examination report" in body_lower[:400] and "reply" not in subj_lower)
    )
    is_reminder_for_exam = (
        re.search(r"reminder[-\s]*(i{1,3}|iv|v?\d*)", subj_lower) is not None
        and any(kw in subj_lower for kw in ["examination", "reply", "response", "report"])
    )
    is_adjournment = _is_adjournment(subject, body)

    if is_reminder_for_exam:
        is_exam_report = True
        is_hearing     = False

    if not is_hearing and not is_exam_report:
        return None

    r.tm_app_no = (
        _extract_tm_app_no(subject)
        or _extract_tm_app_no(body[:800])
    )
    if not r.tm_app_no:
        return None

    r.tm_class     = _extract_tm_class(subject) or _extract_tm_class(body[:400])
    r.reminder_seq = _get_reminder_sequence(subject)
    r.is_adjournment = is_adjournment

    class_sfx     = f" (Class {r.tm_class})" if r.tm_class else ""
    is_show_cause = "show cause" in full_lower

    # ── PATH 1: HEARING NOTICE ─────────────────────────────────────────────
    if is_hearing:
        r.event_type = "Trademark Hearing"

        sched_m = re.search(
            r"scheduled\s+on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
            body, re.IGNORECASE
        )
        if sched_m:
            r.event_date = _parse_date_from_text(sched_m.group(1))
        if not r.event_date:
            r.event_date = _parse_date_from_text(body[:1200])
        if not r.event_date:
            r.event_date = _parse_date_from_text(subject)
        if not r.event_date and msg_date:
            r.event_date = _parse_date_from_text(msg_date)

        if is_adjournment:
            new_m = re.search(
                r"(?:new|revised|rescheduled|adjourned\s+to|postponed\s+to)"
                r"\s+(?:date\s+is\s+)?(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
                body, re.IGNORECASE
            )
            if new_m:
                r.new_date = _parse_date_from_text(new_m.group(1))
            else:
                all_dates = [
                    _parse_date_from_text(m.group(0))
                    for m in re.finditer(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b", body)
                ]
                valid_dates = sorted([d for d in all_dates if d])
                r.new_date = valid_dates[-1] if valid_dates else r.event_date

            r.event_type  = "Adjournment"
            display_date  = r.new_date or "see notice"
            r.title       = f"Adjourned: Hearing — TM App No. {r.tm_app_no}{class_sfx}"
            r.description = (
                f"Hearing for TM Application No. {r.tm_app_no}{class_sfx} has been "
                f"adjourned. New hearing date: {display_date}."
            )
            r.urgency       = "high"
            r.save_category = "reminder"
        else:
            sc_note = " (Show Cause)" if is_show_cause else ""
            r.title = f"Trademark Hearing{sc_note} — TM App No. {r.tm_app_no}{class_sfx}"
            r.description = (
                f"Hearing scheduled on {r.event_date or 'date in notice'} "
                f"for TM Application No. {r.tm_app_no}{class_sfx}."
                + (" Show Cause hearing — attendance mandatory." if is_show_cause else "")
                + " Issued by Registrar of Trade Marks (IP India)."
            )
            r.urgency       = "high"
            r.save_category = "reminder"

    # ── PATH 2: EXAMINATION REPORT ─────────────────────────────────────────
    elif is_exam_report:
        r.event_type = "Examination Report"

        dated_m = re.search(
            r"dated\s+(\d{1,2}[-/]\d{1,2}[-/]\d{4})",
            subject + " " + body[:400], re.IGNORECASE
        )
        if dated_m:
            r.event_date = _parse_date_from_text(dated_m.group(1))
        if not r.event_date:
            r.event_date = _parse_date_from_text(body[:1200])
        if not r.event_date and msg_date:
            r.event_date = _parse_date_from_text(msg_date)
        if not r.event_date:
            r.event_date = datetime.now(IST).strftime("%Y-%m-%d")

        try:
            issue_dt         = datetime.strptime(r.event_date, "%Y-%m-%d")
            r.reply_deadline = (issue_dt + timedelta(days=30)).strftime("%Y-%m-%d")
        except Exception:
            r.reply_deadline = None

        r.urgency = {0: "medium", 1: "medium", 2: "high", 3: "high"}.get(
            r.reminder_seq, "high"
        )

        roman_labels = {0: "", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V"}
        if r.reminder_seq > 0:
            seq_lbl = roman_labels.get(r.reminder_seq, str(r.reminder_seq))
            r.title = (
                f"Reminder-{seq_lbl}: Reply to Examination Report — "
                f"TM App No. {r.tm_app_no}{class_sfx}"
            )
            r.description = (
                f"Reminder-{seq_lbl} — Reply to Examination Report for "
                f"TM Application No. {r.tm_app_no}{class_sfx}. "
                f"Deadline to file response: {r.reply_deadline or '30 days from issue date'}."
            )
        else:
            r.title = f"Examination Report — TM App No. {r.tm_app_no}{class_sfx}"
            r.description = (
                f"Examination Report issued on {r.event_date} for "
                f"TM Application No. {r.tm_app_no}{class_sfx}. "
                f"Objections raised under Trade Marks Act 1999. "
                f"File response by {r.reply_deadline or 'N/A'} (30-day deadline)."
            )

        r.save_category = "todo"

    return r


# =============================================================================
# SMART CATEGORY CLASSIFIER
# =============================================================================

_TODO_KEYWORDS = [
    "examination report", "office action", "objection raised",
    "reply to examination", "response required", "compliance notice",
    "show cause notice", "response to show cause", "notice to file",
    "deadline to respond", "reply required", "reply within",
    "opposition notice", "counter statement", "file reply",
    "scrutiny notice", "demand notice",
]
_REMINDER_KEYWORDS = [
    "hearing", "show cause hearing", "trademark hearing",
    "gstr-1", "gstr-3b", "gstr-9", "gst filing", "gst return",
    "income tax", "itr", "advance tax", "tds return",
    "roc filing", "mca", "aoc-4", "mgt-7",
    "court date", "nclt", "high court", "tribunal",
    "ip india", "ipindia", "due date", "last date", "filing date",
]
_VISIT_KEYWORDS = [
    "zoom", "google meet", "teams meeting", "microsoft teams",
    "webex", "meeting invite", "meeting scheduled",
    "visit scheduled", "office visit", "client visit",
    "appointment", "meeting at", "conference call", "video call",
]

def _classify_save_category(event_type: str, title: str, body: str) -> str:
    combined = f"{title} {body}".lower()
    for kw in _TODO_KEYWORDS:
        if kw in combined:
            return "todo"
    for kw in _VISIT_KEYWORDS:
        if kw in combined:
            return "visit"
    for kw in _REMINDER_KEYWORDS:
        if kw in combined:
            return "reminder"
    if event_type in ("Court Hearing", "Trademark Hearing", "Deadline"):
        return "reminder"
    if event_type in ("Visit", "Online Meeting", "Conference"):
        return "visit"
    return "reminder"


# =============================================================================
# WHITELIST HELPERS
# =============================================================================

def _normalize_whitelist_entry(entry: str) -> str:
    return entry.strip().lower()

def _sender_matches_whitelist(sender_email: str, whitelist: List[str]) -> bool:
    sender_lower = sender_email.strip().lower()
    for entry in whitelist:
        entry = _normalize_whitelist_entry(entry)
        if not entry:
            continue
        if entry.startswith("@"):
            domain_part = entry[1:]
            if sender_lower.endswith("@" + domain_part) or sender_lower.endswith("." + domain_part):
                return True
        else:
            if sender_lower == entry:
                return True
    return False


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
            f"IMAP login failed: {e}. Make sure: (1) IMAP is enabled in Gmail Settings, "
            "(2) You are using an App Password, (3) 2-Step Verification is enabled."
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

def _decode_part_payload(part: email.message.Message) -> str:
    try:
        raw_bytes = part.get_payload(decode=True)
        if raw_bytes is None:
            return ""
        charset = part.get_content_charset()
        if charset:
            try:
                return raw_bytes.decode(charset, errors="replace")
            except (LookupError, UnicodeDecodeError):
                pass
        for enc in ("utf-8", "latin-1", "windows-1252", "ascii"):
            try:
                return raw_bytes.decode(enc, errors="strict")
            except (UnicodeDecodeError, LookupError):
                continue
        return raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        return ""

def _get_plain_body(msg: email.message.Message, max_chars: int = 4000) -> str:
    """
    Extract clean plain-text body.
    Priority: text/plain → text/html (stripped) → raw payload
    """
    plain_parts: List[str] = []
    html_parts:  List[str] = []

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp  = str(part.get("Content-Disposition") or "")
            if "attachment" in disp.lower():
                continue
            if ctype == "text/plain":
                decoded = _decode_part_payload(part)
                if decoded.strip():
                    plain_parts.append(decoded)
            elif ctype == "text/html":
                decoded = _decode_part_payload(part)
                if decoded.strip():
                    html_parts.append(decoded)
    else:
        decoded = _decode_part_payload(msg)
        if msg.get_content_type() == "text/html":
            html_parts.append(decoded)
        else:
            plain_parts.append(decoded)

    if plain_parts:
        body = _clean_text("\n\n".join(plain_parts))
    elif html_parts:
        body = _clean_text(_html_to_text("\n".join(html_parts)))
    else:
        body = ""

    if max_chars and len(body) > max_chars:
        body = body[:max_chars].rstrip() + "…"
    return body

def _extract_sender_email(from_header: str) -> str:
    m = re.search(r'<([^>]+)>', from_header)
    if m:
        return m.group(1).strip().lower()
    return from_header.strip().lower()

def _scan_mailbox_sync(
    host: str, port: int, email_addr: str, password: str,
    max_msgs: int = 50, sender_whitelist: Optional[List[str]] = None,
) -> List[Dict]:
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
                msg          = email.message_from_bytes(msg_data[0][1])
                from_raw     = _decode_header_str(msg.get("From", ""))
                sender_clean = _extract_sender_email(from_raw)
                if sender_whitelist:
                    if not _sender_matches_whitelist(sender_clean, sender_whitelist):
                        continue
                results.append({
                    "subject":      _clean_text(_decode_header_str(msg.get("Subject", "")), 200),
                    "from_addr":    from_raw,
                    "sender_email": sender_clean,
                    "msg_date":     msg.get("Date", ""),
                    "body":         _get_plain_body(msg, max_chars=4000),
                    "message_id":   (msg.get("Message-ID") or "").strip(),
                })
            except Exception:
                continue
        conn.logout()
    except Exception as e:
        logger.error(f"IMAP scan error for {email_addr}: {e}")
    return results


# =============================================================================
# AI EXTRACTION  (generic fallback after IP India parser)
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
   - Jio/Airtel/Vi bills, OTPs, bank alerts, Adobe/Canva subscriptions
   - Marketing, newsletters, LinkedIn/social media, e-commerce notifications
   - Any email NOT related to CA/CS/Legal firm work

3. DATES: If year is missing assume 2026.

4. Return ONLY a valid JSON array. No markdown, no preamble.
   Keys: title, event_type (Trademark Hearing|Court Hearing|Online Meeting|
   Deadline|Visit|Other|Examination Report|Notice), date (yyyy-MM-dd|null),
   time (HH:mm|null), organizer (string|null),
   description (plain text, max 150 chars), urgency (high|medium|low)

5. Junk/irrelevant → return exactly: []
"""

_JUNK_KEYWORDS = [
    "jio", "airtel", "vodafone", "vi mobile", "bsnl", "tata sky",
    "payment received", "payment successful", "transaction successful",
    "transaction alert", "otp", "one time password",
    "credit card statement", "bank statement", "debited", "credited",
    "adobe", "canva", "figma", "coursera", "udemy",
    "discount", "exclusive offer", "flash sale", "cashback",
    "linkedin", "facebook", "instagram", "twitter", "youtube",
    "job application", "resume", "unsubscribe", "newsletter", "promotional",
    "amazon", "flipkart", "swiggy", "zomato", "uber", "ola",
    "nykaa", "myntra", "meesho", "bigbasket",
]

async def _get_dismissed_titles(user_id: str) -> Set[str]:
    try:
        docs = await db["reminders"].find(
            {"user_id": user_id, "is_dismissed": True}, {"_id": 0, "title": 1}
        ).to_list(500)
        return {d["title"].lower().strip() for d in docs if d.get("title")}
    except Exception:
        return set()


async def _extract_events_from_email(
    subject: str, body: str, from_addr: str, msg_date: str,
    dismissed_titles: Optional[Set[str]] = None,
) -> List[Dict]:
    """
    Extraction pipeline (priority order):
      1. IP India dedicated parser   → precise structured result
      2. Google Gemini AI            → general legal events
      3. Regex fallback              → last resort
    """
    sender_clean = _extract_sender_email(from_addr)
    combined     = f"{subject.lower()} {body.lower()[:500]}"

    for kw in _JUNK_KEYWORDS:
        if kw in combined:
            return []

    if dismissed_titles and subject.lower().strip() in dismissed_titles:
        return []

    # ── 1. IP India parser ────────────────────────────────────────────────────
    _IPINDIA_SENDER_PATTERNS = (
        "noreply.tmr",
        "tmr.gov.in",
        "ipindia",
        "trademarks.gov.in",
    )
    is_ipindia = any(pat in sender_clean for pat in _IPINDIA_SENDER_PATTERNS)

    if not is_ipindia:
        subj_l = subject.lower()
        is_ipindia = (
            ("hearing notice" in subj_l and "application no" in subj_l)
            or "examination report" in subj_l
            or "परीक्षा रिपोर्ट" in subject
            or (re.search(r"reminder[-\s]*(i{1,3}|iv)", subj_l) and "examination" in subj_l)
        )

    if is_ipindia:
        r = _parse_ipindia_email(subject, body, msg_date)
        if r:
            if r.is_adjournment and r.new_date:
                ev_date = r.new_date
            elif r.save_category == "todo":
                ev_date = r.reply_deadline
            else:
                ev_date = r.event_date

            ev = {
                "title":          r.title,
                "event_type":     r.event_type,
                "date":           ev_date,
                "time":           None,
                "organizer":      "IP India / Trade Marks Registry",
                "description":    r.description,
                "urgency":        r.urgency,
                "save_category":  r.save_category,
                "tm_app_no":      r.tm_app_no,
                "tm_class":       r.tm_class,
                "reminder_seq":   r.reminder_seq,
                "is_adjournment": r.is_adjournment,
                "raw_event_date": r.event_date,
                "reply_deadline": r.reply_deadline,
            }
            logger.info(
                f"[IPIndia] {r.event_type} App#{r.tm_app_no} "
                f"date={ev_date} seq={r.reminder_seq} adj={r.is_adjournment}"
            )
            return [ev]

    # ── 2. Gemini AI ──────────────────────────────────────────────────────────
    if _gemini:
        try:
            prompt = (
                f"{_AI_SYSTEM}\n\nFrom: {from_addr}\nSubject: {subject}\n"
                f"Body (plain text):\n{body[:3000]}"
            )
            resp   = await _gemini.generate_content_async(prompt)
            raw    = re.sub(r"```[a-z]*\n?|```", "", resp.text.strip())
            result = json.loads(raw)
            if isinstance(result, list):
                out = []
                for ev in result:
                    desc = ev.get("description") or ""
                    ev["description"]    = _clean_text(_html_to_text(desc) if "<" in desc else desc, 200)
                    ev["save_category"]  = _classify_save_category(ev.get("event_type",""), subject, body)
                    ev["tm_app_no"]      = _extract_tm_app_no(subject) or _extract_tm_app_no(body[:600])
                    ev["is_adjournment"] = False
                    ev["reminder_seq"]   = 0
                    out.append(ev)
                return out
        except Exception as e:
            logger.warning(f"Gemini failed for '{subject[:50]}': {e}")

    # ── 3. Regex fallback ─────────────────────────────────────────────────────
    return _regex_extract(subject, body, from_addr)


def _regex_extract(subject: str, body: str, from_addr: str) -> List[Dict]:
    text = f"{subject} {body}".lower()
    if any(j in text for j in ["offer", "discount", "otp", "statement",
                                 "transaction successful", "payment received",
                                 "jio", "airtel", "adobe", "newsletter",
                                 "unsubscribe", "cashback"]):
        return []

    date_str = _parse_date_from_text(body[:1200]) or _parse_date_from_text(subject)
    if not date_str:
        return []

    if any(w in text for w in ["trademark","ipindia","ip india","opposition","show cause"]):
        etype = "Trademark Hearing"
    elif any(w in text for w in ["court","nclt","tribunal","hearing","high court"]):
        etype = "Court Hearing"
    elif any(w in text for w in ["examination report","office action","objection"]):
        etype = "Examination Report"
    elif any(w in text for w in ["gst","gstr","income tax","itr","roc","mca","advance tax"]):
        etype = "Deadline"
    elif "visit" in text:
        etype = "Visit"
    else:
        etype = "Deadline"

    return [{
        "title":          subject[:100],
        "event_type":     etype,
        "date":           date_str,
        "time":           None,
        "organizer":      from_addr[:50],
        "description":    _clean_text(body[:200], 200),
        "urgency":        "high",
        "save_category":  _classify_save_category(etype, subject, body),
        "tm_app_no":      _extract_tm_app_no(subject) or _extract_tm_app_no(body[:600]),
        "is_adjournment": False,
        "reminder_seq":   0,
    }]


# =============================================================================
# MONGO DOC → PYDANTIC
# =============================================================================

def _doc_to_out(doc: Dict) -> ExtractedEventOut:
    # ── FIX: Prefer string "id" field; fall back to str(_id) for auto-saved docs
    # that were inserted before v9 (which had no string id field).
    raw_id = doc.get("id") or doc.get("_id")
    str_id = str(raw_id) if raw_id is not None else ""
    return ExtractedEventOut(
        id=str_id,
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
        tm_app_no=doc.get("tm_app_no"),
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
# AUTO-SAVE WITH TM APP NUMBER DEDUPLICATION
# =============================================================================

async def _auto_save_event(user_id: str, event: ExtractedEventOut, prefs: Dict):
    """
    Save/update event to todos / reminders / visits.

    DEDUPLICATION LOGIC:
    ─────────────────────
    IP India events (tm_app_no present):
      TODO  → key = (user_id, tm_app_no, source="email_auto", is_completed=False)
              If found & new seq > old seq: UPDATE title + urgency + reminder_seq
              If found & same seq: skip
              If not found: INSERT with UUID string "id"

      REMINDER → key = (user_id, tm_app_no, source="email_auto")
              If found & is_dismissed: skip
              If found & is_adjournment: UPDATE remind_at + description + title
              If found & not adjournment: skip
              If not found: INSERT with UUID string "id"

    Generic events (no tm_app_no):
      Deduplicate by (user_id, title, source).

    v9 FIX: All INSERT operations now pre-generate a UUID string "id" field
    so that DELETE /reminders/{id} and PATCH /reminders/{id} routes resolve
    correctly. Previously auto-saved docs only had MongoDB ObjectId (_id)
    and the string "id" field was absent, causing 404 errors on delete/update.
    """
    dismissed_check = await db["reminders"].find_one(
        {"user_id": user_id, "title": event.title, "is_dismissed": True},
        {"_id": 0, "title": 1}
    )
    if dismissed_check:
        return

    try:
        save_cat       = event.save_category or _classify_save_category(
            event.event_type, event.title, event.description or ""
        )
        email_msg_id   = getattr(event, "_message_id",    None)
        tm_app_no      = event.tm_app_no
        clean_desc     = _clean_text(event.description or "", 300)
        reminder_seq   = getattr(event, "_reminder_seq",   0) or 0
        is_adjournment = getattr(event, "_is_adjournment", False) or False

        # ──────────────────────────────────────────────────────────────────────
        #  TODO  (Examination Report / Reminder-I / Reminder-II / Reminder-III)
        # ──────────────────────────────────────────────────────────────────────
        if save_cat == "todo" and prefs.get("auto_save_todos"):
            existing = None
            if tm_app_no:
                existing = await db["todos"].find_one(
                    {
                        "user_id":      user_id,
                        "tm_app_no":    tm_app_no,
                        "source":       "email_auto",
                        "is_completed": False,
                    },
                    {"_id": 1, "reminder_seq": 1, "title": 1, "due_date": 1}
                )
            if not existing:
                existing = await db["todos"].find_one(
                    {"user_id": user_id, "title": event.title, "source": "email_auto"},
                    {"_id": 1, "reminder_seq": 1}
                )

            if existing:
                old_seq = existing.get("reminder_seq") or 0
                if reminder_seq > old_seq:
                    update_fields = {
                        "title":        event.title,
                        "urgency":      event.urgency,
                        "reminder_seq": reminder_seq,
                        "updated_at":   datetime.now(timezone.utc).isoformat(),
                    }
                    if event.date:
                        existing_due = existing.get("due_date") or ""
                        if not existing_due or event.date > existing_due:
                            update_fields["due_date"] = event.date
                    await db["todos"].update_one(
                        {"_id": existing["_id"]},
                        {"$set": update_fields}
                    )
                    logger.info(
                        f"[TODO] Updated TM#{tm_app_no}: "
                        f"seq {old_seq}→{reminder_seq}, urgency={event.urgency}"
                    )
                else:
                    logger.debug(f"[TODO] Skip duplicate seq={reminder_seq} TM#{tm_app_no}")
            else:
                # ── v9 FIX: generate UUID string "id" before insert ──────────
                new_id = str(_uuid.uuid4())
                await db["todos"].insert_one({
                    "id":               new_id,          # ← string id for API routes
                    "user_id":          user_id,
                    "title":            event.title,
                    "description":      (
                        f"Auto-imported from email.\n"
                        f"From: {event.source_from}\n"
                        f"Subject: {event.source_subject}\n"
                        f"Notes: {clean_desc}"
                    ),
                    "is_completed":     False,
                    "due_date":         event.date or None,
                    "source":           "email_auto",
                    "email_message_id": email_msg_id,
                    "tm_app_no":        tm_app_no,
                    "reminder_seq":     reminder_seq,
                    "urgency":          event.urgency,
                    "created_at":       datetime.now(timezone.utc).isoformat(),
                    "updated_at":       datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"[TODO] New: {event.title} (TM#{tm_app_no}, id={new_id})")

        # ──────────────────────────────────────────────────────────────────────
        #  REMINDER  (Hearing / Adjournment)
        # ──────────────────────────────────────────────────────────────────────
        elif save_cat == "reminder" and prefs.get("auto_save_reminders"):
            date_str = event.date or datetime.now(IST).strftime("%Y-%m-%d")
            time_str = event.time or "10:00"
            try:
                remind_dt = datetime.strptime(f"{date_str}T{time_str}", "%Y-%m-%dT%H:%M")
                remind_dt = remind_dt.replace(tzinfo=IST)
            except Exception:
                remind_dt = datetime.now(IST) + timedelta(days=1)

            existing = None
            if tm_app_no:
                existing = await db["reminders"].find_one(
                    {"user_id": user_id, "tm_app_no": tm_app_no, "source": "email_auto"},
                    {"_id": 1, "is_dismissed": 1, "remind_at": 1, "title": 1}
                )
            if not existing:
                existing = await db["reminders"].find_one(
                    {"user_id": user_id, "title": event.title, "source": "email_auto"},
                    {"_id": 1, "is_dismissed": 1}
                )

            if existing:
                if existing.get("is_dismissed"):
                    logger.debug(f"[REMINDER] Skip dismissed TM#{tm_app_no}")
                    return
                if is_adjournment:
                    await db["reminders"].update_one(
                        {"_id": existing["_id"]},
                        {"$set": {
                            "title":       event.title,
                            "description": (
                                f"⚠️ ADJOURNED — Hearing rescheduled.\n"
                                f"New date: {date_str}\n"
                                f"From: {event.source_from}\n"
                                f"Notes: {clean_desc}"
                            ),
                            "remind_at":   remind_dt.isoformat(),
                            "urgency":     "high",
                            "updated_at":  datetime.now(timezone.utc).isoformat(),
                        }}
                    )
                    logger.info(f"[REMINDER] Adjourned TM#{tm_app_no} → new date {date_str}")
                else:
                    logger.debug(f"[REMINDER] Skip duplicate hearing TM#{tm_app_no}")
                return

            # New reminder — build description
            desc_parts = []
            if event.organizer:       desc_parts.append(f"From: {event.organizer}")
            if clean_desc:            desc_parts.append(f"Notes: {clean_desc}")
            if event.source_subject:  desc_parts.append(f"Subject: {event.source_subject}")

            # ── v9 FIX: generate UUID string "id" before insert ──────────────
            new_id = str(_uuid.uuid4())
            await db["reminders"].insert_one({
                "id":               new_id,          # ← string id for DELETE/PATCH routes
                "user_id":          user_id,
                "title":            event.title,
                "description":      "\n".join(desc_parts) or None,
                "remind_at":        remind_dt.isoformat(),
                "is_dismissed":     False,
                "source":           "email_auto",
                "email_message_id": email_msg_id,
                "tm_app_no":        tm_app_no,
                "urgency":          event.urgency,
                "created_at":       datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"[REMINDER] New: {event.title} (TM#{tm_app_no}, date={date_str}, id={new_id})")

        # ──────────────────────────────────────────────────────────────────────
        #  VISIT
        # ──────────────────────────────────────────────────────────────────────
        elif save_cat == "visit" and prefs.get("auto_save_visits"):
            date_str = event.date or datetime.now(IST).strftime("%Y-%m-%d")
            existing = await db["visits"].find_one(
                {
                    "user_id":    user_id,
                    "title":      event.title,
                    "visit_date": date_str,
                    "source":     "email_auto",
                },
                {"_id": 0}
            )
            if not existing:
                new_id = str(_uuid.uuid4())
                await db["visits"].insert_one({
                    "id":               new_id,
                    "user_id":          user_id,
                    "title":            event.title,
                    "visit_date":       date_str,
                    "notes":            clean_desc or event.source_subject or "",
                    "status":           "scheduled",
                    "source":           "email_auto",
                    "email_message_id": email_msg_id,
                    "tm_app_no":        tm_app_no,
                    "created_at":       datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"[VISIT] New: {event.title} on {date_str} (id={new_id})")

    except Exception as e:
        logger.error(f"Auto-save error '{event.title}': {e}", exc_info=True)


# =============================================================================
# HELPERS — build event doc + attach extra attrs
# =============================================================================

def _build_event_doc(user_id: str, email_addr: str, raw: Dict, ev: Dict) -> Dict:
    return {
        "user_id":        user_id,
        "email_account":  email_addr,
        "message_id":     raw.get("message_id"),
        "title":          _clean_text(ev.get("title") or raw["subject"], 120),
        "event_type":     ev.get("event_type", "Other"),
        "date":           ev.get("date"),
        "time":           ev.get("time"),
        "organizer":      _clean_text(ev.get("organizer") or "", 100),
        "description":    _clean_text(ev.get("description") or "", 300),
        "urgency":        ev.get("urgency", "medium"),
        "save_category":  ev.get("save_category", "reminder"),
        "tm_app_no":      ev.get("tm_app_no"),
        "tm_class":       ev.get("tm_class"),
        "reminder_seq":   ev.get("reminder_seq", 0),
        "is_adjournment": ev.get("is_adjournment", False),
        "raw_event_date": ev.get("raw_event_date"),
        "reply_deadline": ev.get("reply_deadline"),
        "source_subject": raw["subject"][:200],
        "source_from":    raw["from_addr"][:200],
        "source_date":    raw["msg_date"][:100],
        "raw_snippet":    _clean_text(raw["body"][:500], 500),
        "created_at":     datetime.now(timezone.utc).isoformat(),
    }

def _attach_extra_attrs(ev_out: ExtractedEventOut, ev: Dict, mid: str):
    ev_out._message_id     = mid
    ev_out._reminder_seq   = ev.get("reminder_seq", 0)
    ev_out._is_adjournment = ev.get("is_adjournment", False)


# =============================================================================
# SCHEDULED SCAN LOOP
# =============================================================================

_scan_task = None

async def _scheduled_scan_loop():
    logger.info("Email scheduled scan loop started.")
    while True:
        try:
            now_ist    = datetime.now(IST)
            prefs_list = await db[COL_AUTO_PREFS].find({}).to_list(length=500)
            for pref in prefs_list:
                user_id     = pref.get("user_id")
                scan_hour   = pref.get("scan_time_hour", 12)
                scan_minute = pref.get("scan_time_minute", 0)
                target       = now_ist.replace(hour=scan_hour, minute=scan_minute, second=0, microsecond=0)
                if abs((now_ist - target).total_seconds()) > 300:
                    continue
                sched = await db[COL_SCAN_SCHEDULE].find_one({"user_id": user_id}, {"_id": 0})
                if sched and (sched.get("last_run", "")[:10] == now_ist.strftime("%Y-%m-%d")):
                    continue
                logger.info(f"Scheduled scan: user {user_id}")
                try:
                    await _run_full_scan_for_user(user_id, pref)
                    await db[COL_SCAN_SCHEDULE].update_one(
                        {"user_id": user_id},
                        {"$set": {"last_run": now_ist.isoformat(), "user_id": user_id}},
                        upsert=True
                    )
                except Exception as e:
                    logger.error(f"Scheduled scan error user {user_id}: {e}")
        except Exception as e:
            logger.error(f"Scan loop error: {e}")
        await asyncio.sleep(60)


async def _run_full_scan_for_user(user_id: str, prefs: Dict, limit: int = 50):
    conns = await db[COL_CONNECTIONS].find(
        {"user_id": user_id, "is_active": True}, {"_id": 0}
    ).to_list(50)
    if not conns:
        return

    wl_doc = await db[COL_SENDER_WHITELIST].find_one({"user_id": user_id}, {"_id": 0})
    sender_whitelist: List[str] = (
        [s.get("email_address","") for s in wl_doc.get("senders",[]) if s.get("email_address")]
        if wl_doc else []
    )
    dismissed_titles = await _get_dismissed_titles(user_id)
    loop             = asyncio.get_event_loop()

    for conn in conns:
        try:
            email_addr = conn["email_address"]
            raw_emails = await loop.run_in_executor(
                None, _scan_mailbox_sync,
                conn["imap_host"], conn["imap_port"], email_addr,
                _decrypt(conn["app_password_enc"]), limit,
                sender_whitelist or None,
            )
            for raw in raw_emails:
                mid    = raw.get("message_id")
                exists = await db[COL_EVENTS].find_one(
                    {"user_id": user_id, "message_id": mid}, {"_id": 0}
                )
                if exists:
                    ev_out = _doc_to_out(exists)
                    ev_out._is_adjournment = exists.get("is_adjournment", False)
                    ev_out._reminder_seq   = exists.get("reminder_seq", 0)
                    ev_out._message_id     = mid
                    await _auto_save_event(user_id, ev_out, prefs)
                    continue

                extracted = await _extract_events_from_email(
                    raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"],
                    dismissed_titles=dismissed_titles,
                )
                for ev in extracted:
                    doc = _build_event_doc(user_id, email_addr, raw, ev)
                    res = await db[COL_EVENTS].insert_one(doc)
                    doc["id"] = str(res.inserted_id)
                    ev_out = _doc_to_out(doc)
                    _attach_extra_attrs(ev_out, ev, mid)
                    await _auto_save_event(user_id, ev_out, prefs)

            await db[COL_CONNECTIONS].update_one(
                {"user_id": user_id, "email_address": email_addr},
                {"$set": {"last_synced": datetime.now(timezone.utc).isoformat(), "sync_error": None}}
            )
        except Exception as e:
            logger.error(f"Scan error {conn.get('email_address')}: {e}")
            await db[COL_CONNECTIONS].update_one(
                {"user_id": user_id, "email_address": conn.get("email_address")},
                {"$set": {"sync_error": str(e)}}
            )

def start_scheduled_scan_loop():
    global _scan_task
    _scan_task = asyncio.get_event_loop().create_task(_scheduled_scan_loop())
    logger.info("Scheduled email scan loop registered.")


async def create_email_indexes():
    """
    Create MongoDB indexes for email integration collections.
    Call once from app startup (lifespan / on_startup).
    """
    try:
        await db[COL_CONNECTIONS].create_index(
            [("user_id", 1), ("email_address", 1)], unique=True, background=True
        )
        await db[COL_EVENTS].create_index(
            [("user_id", 1), ("message_id", 1)], unique=True,
            sparse=True, background=True
        )
        await db[COL_EVENTS].create_index(
            [("user_id", 1), ("tm_app_no", 1)], background=True, sparse=True
        )
        await db[COL_EVENTS].create_index(
            [("user_id", 1), ("date", -1)], background=True
        )
        await db["reminders"].create_index(
            [("user_id", 1), ("tm_app_no", 1)], background=True, sparse=True
        )
        await db["reminders"].create_index(
            [("user_id", 1), ("id", 1)], background=True, sparse=True
        )
        await db["todos"].create_index(
            [("user_id", 1), ("tm_app_no", 1), ("is_completed", 1)],
            background=True, sparse=True
        )
        await db["todos"].create_index(
            [("user_id", 1), ("id", 1)], background=True, sparse=True
        )
        logger.info("Email integration indexes created/verified.")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")


# =============================================================================
# API ROUTES — CONNECTIONS
# =============================================================================

@router.get("/connections")
async def list_connections(current_user=Depends(get_current_user)):
    docs = await db[COL_CONNECTIONS].find(
        {"user_id": str(current_user.id)}, {"app_password_enc": 0, "_id": 0}
    ).to_list(100)
    return {"connections": [_conn_doc_to_out(d) for d in docs]}

@router.post("/connections", status_code=201)
async def add_connection(body: ConnectionCreateRequest, current_user=Depends(get_current_user)):
    try:
        host, port, provider = _infer_provider(body.email_address)
        host = body.imap_host or host
        port = body.imap_port or port
        err  = await asyncio.get_event_loop().run_in_executor(
            None, _test_imap_sync, host, port, body.email_address, body.app_password
        )
        if err:
            raise HTTPException(status_code=400, detail=err)
        clean_email = body.email_address.strip().lower()
        doc = {
            "user_id": str(current_user.id), "email_address": clean_email,
            "app_password_enc": _encrypt(_clean_password(body.app_password)),
            "imap_host": host, "imap_port": port,
            "label": body.label or f"{provider.capitalize()} ({clean_email})",
            "provider": provider, "is_active": True,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": clean_email},
            {"$set": doc}, upsert=True
        )
        return _conn_doc_to_out(doc)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect email: {e}")

@router.patch("/connections/{email_address}")
async def update_connection(
    email_address: str, body: ConnectionUpdateRequest, current_user=Depends(get_current_user)
):
    existing = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates.get("is_active"):
        updates["sync_error"] = None
    await db[COL_CONNECTIONS].update_one(
        {"user_id": str(current_user.id), "email_address": email_address}, {"$set": updates}
    )
    doc = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address},
        {"_id": 0, "app_password_enc": 0}
    )
    return _conn_doc_to_out(doc)

@router.delete("/connections/{email_address}", status_code=204)
async def delete_connection(email_address: str, current_user=Depends(get_current_user)):
    await db[COL_CONNECTIONS].delete_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )

@router.post("/connections/{email_address}/test")
async def test_connection(email_address: str, current_user=Depends(get_current_user)):
    doc = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")
    err = await asyncio.get_event_loop().run_in_executor(
        None, _test_imap_sync,
        doc["imap_host"], doc["imap_port"], email_address, _decrypt(doc["app_password_enc"])
    )
    if err:
        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": {"sync_error": err}}
        )
        raise HTTPException(status_code=400, detail=err)
    await db[COL_CONNECTIONS].update_one(
        {"user_id": str(current_user.id), "email_address": email_address},
        {"$set": {"sync_error": None, "last_synced": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "ok", "message": f"{email_address} connected successfully"}


# =============================================================================
# API ROUTES — SENDER WHITELIST
# =============================================================================

@router.get("/sender-whitelist")
async def get_sender_whitelist(current_user=Depends(get_current_user)):
    doc = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)}, {"_id": 0})
    return {"senders": doc.get("senders", []) if doc else []}

@router.post("/sender-whitelist")
async def add_sender_to_whitelist(body: SenderWhitelistEntry, current_user=Depends(get_current_user)):
    clean = body.email_address.strip().lower()
    if not clean or "@" not in clean:
        raise HTTPException(status_code=422, detail="Invalid email address or domain.")
    entry = {"email_address": clean, "label": body.label or clean,
             "added_at": datetime.now(timezone.utc).isoformat()}
    existing = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)}, {"_id": 0})
    if existing:
        if any(s.get("email_address") == clean for s in existing.get("senders", [])):
            return {"message": "Sender already in whitelist", "senders": existing.get("senders", [])}
        await db[COL_SENDER_WHITELIST].update_one(
            {"user_id": str(current_user.id)}, {"$push": {"senders": entry}}
        )
    else:
        await db[COL_SENDER_WHITELIST].insert_one({"user_id": str(current_user.id), "senders": [entry]})
    updated = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)}, {"_id": 0})
    return {"message": "Sender added", "senders": updated.get("senders", [])}

@router.delete("/sender-whitelist/{email_address}")
async def remove_sender_from_whitelist(email_address: str, current_user=Depends(get_current_user)):
    await db[COL_SENDER_WHITELIST].update_one(
        {"user_id": str(current_user.id)},
        {"$pull": {"senders": {"email_address": email_address.lower()}}}
    )
    updated = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)}, {"_id": 0})
    return {"message": "Sender removed", "senders": (updated or {}).get("senders", [])}

@router.put("/sender-whitelist")
async def replace_sender_whitelist(body: SenderWhitelistOut, current_user=Depends(get_current_user)):
    senders = [
        {"email_address": s.get("email_address","").strip().lower(),
         "label": s.get("label", s.get("email_address","")),
         "added_at": datetime.now(timezone.utc).isoformat()}
        for s in body.senders if s.get("email_address","").strip()
    ]
    await db[COL_SENDER_WHITELIST].update_one(
        {"user_id": str(current_user.id)},
        {"$set": {"senders": senders, "user_id": str(current_user.id)}}, upsert=True
    )
    return {"message": "Whitelist updated", "senders": senders}


# =============================================================================
# API ROUTES — AUTO-SAVE PREFERENCES
# =============================================================================

@router.get("/auto-save-prefs", response_model=AutoSavePrefOut)
async def get_auto_save_prefs(current_user=Depends(get_current_user)):
    doc = await db[COL_AUTO_PREFS].find_one({"user_id": str(current_user.id)}, {"_id": 0})
    if not doc:
        return AutoSavePrefOut(
            auto_save_reminders=False, auto_save_visits=False, auto_save_todos=False,
            scan_time_hour=12, scan_time_minute=0, next_scan_at=None
        )
    now_ist   = datetime.now(IST)
    next_scan = now_ist.replace(hour=doc.get("scan_time_hour",12),
                                minute=doc.get("scan_time_minute",0), second=0, microsecond=0)
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
async def set_auto_save_prefs(body: AutoSavePrefRequest, current_user=Depends(get_current_user)):
    doc = {
        "user_id": str(current_user.id),
        "auto_save_reminders": body.auto_save_reminders,
        "auto_save_visits": body.auto_save_visits,
        "auto_save_todos": body.auto_save_todos,
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
    doc = await db[COL_AUTO_PREFS].find_one(
        {"user_id": str(current_user.id)}, {"_id": 0, "user_id": 1}
    )
    return {"has_set_prefs": doc is not None}


# =============================================================================
# API ROUTES — MANUAL SAVE
# =============================================================================

@router.post("/save-as-reminder", status_code=201)
async def save_as_reminder(body: ManualSaveReminderRequest, current_user=Depends(get_current_user)):
    try:
        try:
            remind_dt = datetime.fromisoformat(body.remind_at.replace("Z", "+00:00"))
        except Exception:
            remind_dt = datetime.now(IST) + timedelta(days=1)
        existing = await db["reminders"].find_one(
            {"user_id": str(current_user.id), "title": body.title}, {"_id": 0, "id": 1}
        )
        if existing:
            return {"status": "already_exists", "id": existing.get("id", "")}
        nid = str(_uuid.uuid4())
        await db["reminders"].insert_one({
            "id": nid, "user_id": str(current_user.id), "title": body.title,
            "description": _clean_text(body.description or "", 500),
            "remind_at": remind_dt.isoformat(), "is_dismissed": False,
            "source": "email_manual", "event_id": body.event_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": nid}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save reminder: {e}")

@router.post("/save-as-visit", status_code=201)
async def save_as_visit(body: ManualSaveVisitRequest, current_user=Depends(get_current_user)):
    try:
        existing = await db["visits"].find_one(
            {"user_id": str(current_user.id), "title": body.title, "visit_date": body.visit_date},
            {"_id": 0, "id": 1}
        )
        if existing:
            return {"status": "already_exists", "id": existing.get("id", "")}
        nid = str(_uuid.uuid4())
        await db["visits"].insert_one({
            "id": nid, "user_id": str(current_user.id), "title": body.title,
            "visit_date": body.visit_date, "notes": _clean_text(body.notes or "", 500),
            "status": "scheduled", "source": "email_manual", "event_id": body.event_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": nid}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save visit: {e}")

@router.post("/save-as-todo", status_code=201)
async def save_as_todo(body: ManualSaveReminderRequest, current_user=Depends(get_current_user)):
    try:
        existing = await db["todos"].find_one(
            {"user_id": str(current_user.id), "title": body.title}, {"_id": 0, "id": 1}
        )
        if existing:
            return {"status": "already_exists", "id": existing.get("id", "")}
        nid = str(_uuid.uuid4())
        await db["todos"].insert_one({
            "id": nid, "user_id": str(current_user.id), "title": body.title,
            "description": _clean_text(body.description or "", 500),
            "is_completed": False, "due_date": body.remind_at[:10] if body.remind_at else None,
            "source": "email_manual", "event_id": body.event_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "created", "id": nid}
    except HTTPException:
        raise
    except Exception as e:
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
        {"user_id": str(current_user.id), "is_active": True}, {"_id": 0}
    ).to_list(50)
    if not conns:
        return []

    prefs_doc = await db[COL_AUTO_PREFS].find_one(
        {"user_id": str(current_user.id)}, {"_id": 0}
    ) or {}
    wl_doc = await db[COL_SENDER_WHITELIST].find_one({"user_id": str(current_user.id)}, {"_id": 0})
    sender_whitelist: List[str] = (
        [s.get("email_address","") for s in wl_doc.get("senders",[]) if s.get("email_address")]
        if wl_doc else []
    )
    dismissed_titles = await _get_dismissed_titles(str(current_user.id))

    async def process_account(conn):
        email_addr = conn["email_address"]

        if not force_refresh and conn.get("last_synced"):
            try:
                last = datetime.fromisoformat(conn["last_synced"])
                if (datetime.now(timezone.utc) - last).total_seconds() < 1800:
                    cached = await db[COL_EVENTS].find(
                        {"user_id": str(current_user.id), "email_account": email_addr},
                        {"_id": 0}
                    ).sort("created_at", -1).limit(limit).to_list(limit)
                    return [_doc_to_out(d) for d in cached]
            except Exception:
                pass

        loop       = asyncio.get_event_loop()
        raw_emails = await loop.run_in_executor(
            None, _scan_mailbox_sync,
            conn["imap_host"], conn["imap_port"], email_addr,
            _decrypt(conn["app_password_enc"]), 50, sender_whitelist or None,
        )
        acc = []
        for raw in raw_emails:
            mid    = raw.get("message_id")
            exists = await db[COL_EVENTS].find_one(
                {"user_id": str(current_user.id), "message_id": mid}, {"_id": 0}
            )
            if exists:
                ev_out = _doc_to_out(exists)
                ev_out._is_adjournment = exists.get("is_adjournment", False)
                ev_out._reminder_seq   = exists.get("reminder_seq", 0)
                ev_out._message_id     = mid
                acc.append(ev_out)
                if prefs_doc:
                    await _auto_save_event(str(current_user.id), ev_out, prefs_doc)
                continue

            extracted = await _extract_events_from_email(
                raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"],
                dismissed_titles=dismissed_titles,
            )
            for ev in extracted:
                doc = _build_event_doc(str(current_user.id), email_addr, raw, ev)
                res = await db[COL_EVENTS].insert_one(doc)
                doc["id"] = str(res.inserted_id)
                ev_out = _doc_to_out(doc)
                _attach_extra_attrs(ev_out, ev, mid)
                acc.append(ev_out)
                if prefs_doc:
                    await _auto_save_event(str(current_user.id), ev_out, prefs_doc)

        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_addr},
            {"$set": {"last_synced": datetime.now(timezone.utc).isoformat(), "sync_error": None}}
        )
        return acc

    completed = await asyncio.gather(*[process_account(c) for c in conns], return_exceptions=True)
    final: List[ExtractedEventOut] = []
    for res in completed:
        if isinstance(res, list):
            final.extend(res)
        elif isinstance(res, Exception):
            logger.error(f"process_account error: {res}")

    final.sort(key=lambda e: e.date or "0000-00-00", reverse=True)
    return final[:limit]


# NOTE: /events/clear-all MUST be defined before /events/{event_id}
# otherwise FastAPI matches "clear-all" as an event_id and tries ObjectId("clear-all")
@router.delete("/events/clear-all", status_code=204)
async def clear_all_events(current_user=Depends(get_current_user)):
    """Clear all cached extracted events — forces fresh scan next time.
    Does NOT delete reminders, visits, or todos already saved."""
    await db[COL_EVENTS].delete_many({"user_id": str(current_user.id)})

@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: str, current_user=Depends(get_current_user)):
    """Delete a single cached extraction record. Does NOT cascade to reminders/visits/todos."""
    try:
        await db[COL_EVENTS].delete_one(
            {"_id": ObjectId(event_id), "user_id": str(current_user.id)}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid event id: {e}")

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
        {"user_id": str(current_user.id)}, {"_id": 0}
    ).sort("date", -1).limit(limit).to_list(limit)
    return [_doc_to_out(d) for d in docs]


# =============================================================================
# API ROUTES — UTILITY / ADMIN
# =============================================================================

@router.post("/scan-now", status_code=202)
async def trigger_scan_now(current_user=Depends(get_current_user)):
    """
    Manually trigger a full email scan + auto-save for the current user.
    Runs in the background — returns immediately with a confirmation.
    """
    prefs = await db[COL_AUTO_PREFS].find_one(
        {"user_id": str(current_user.id)}, {"_id": 0}
    ) or {}

    async def _bg():
        try:
            await _run_full_scan_for_user(str(current_user.id), prefs, limit=50)
            logger.info(f"Manual scan complete for user {current_user.id}")
        except Exception as e:
            logger.error(f"Manual scan error for user {current_user.id}: {e}")

    asyncio.create_task(_bg())
    return {"status": "scan_started", "message": "Scan running in background. Refresh in ~30 seconds."}


@router.post("/migrate-clean", status_code=200)
async def migrate_clean_descriptions(current_user=Depends(get_current_user)):
    """
    One-time migration: strip HTML from any existing description/raw_snippet
    fields saved before v6 (when HTML was stored raw).
    Safe to run multiple times. Returns counts of updated records.
    """
    user_id  = str(current_user.id)
    counts   = {"events": 0, "todos": 0, "reminders": 0, "visits": 0}
    html_sig = re.compile(r"<(?:html|head|body|div|span|p|br|table|td|tr)[^>]*>", re.IGNORECASE)

    async def _clean_collection(col_name: str, fields: List[str]) -> int:
        updated = 0
        async for doc in db[col_name].find({"user_id": user_id}, {"_id": 1, **{f: 1 for f in fields}}):
            needs_update = False
            patch: Dict[str, str] = {}
            for field in fields:
                val = doc.get(field) or ""
                if val and html_sig.search(val):
                    cleaned = _clean_text(_html_to_text(val), 500)
                    patch[field] = cleaned
                    needs_update = True
            if needs_update:
                await db[col_name].update_one({"_id": doc["_id"]}, {"$set": patch})
                updated += 1
        return updated

    counts["events"]    = await _clean_collection(COL_EVENTS,   ["description", "raw_snippet"])
    counts["todos"]     = await _clean_collection("todos",       ["description"])
    counts["reminders"] = await _clean_collection("reminders",   ["description"])
    counts["visits"]    = await _clean_collection("visits",      ["notes"])

    logger.info(f"migrate-clean complete for user {user_id}: {counts}")
    return {"status": "ok", "updated": counts}


@router.post("/migrate-fix-ids", status_code=200)
async def migrate_fix_missing_ids(current_user=Depends(get_current_user)):
    """
    v9 ONE-TIME MIGRATION — backfill missing string 'id' field.

    Auto-saved reminders, todos, and visits created by v8 and earlier were
    inserted WITHOUT a string 'id' field (only MongoDB ObjectId '_id' existed).
    The frontend DELETE and PATCH routes look up by the string 'id' field,
    so those operations returned 404.

    This endpoint sets id = str(_id) on every affected document.
    Safe to call multiple times — skips documents that already have 'id'.

    Call this ONCE after deploying v9, then you can remove it in v10.
    """
    user_id = str(current_user.id)
    counts  = {"reminders": 0, "todos": 0, "visits": 0}

    for col_name in ("reminders", "todos", "visits"):
        async for doc in db[col_name].find(
            {"user_id": user_id, "id": {"$exists": False}},
            {"_id": 1}
        ):
            await db[col_name].update_one(
                {"_id": doc["_id"]},
                {"$set": {"id": str(doc["_id"])}}
            )
            counts[col_name] += 1

    logger.info(f"migrate-fix-ids complete for user {user_id}: {counts}")
    return {"status": "ok", "backfilled": counts}


@router.get("/events/by-tm/{tm_app_no}", response_model=List[ExtractedEventOut])
async def get_events_by_tm_app_no(tm_app_no: str, current_user=Depends(get_current_user)):
    """
    Fetch all extracted events for a specific TM application number.
    Useful for frontend to show full history of a trademark case.
    """
    docs = await db[COL_EVENTS].find(
        {"user_id": str(current_user.id), "tm_app_no": tm_app_no},
        {"_id": 0}
    ).sort("date", 1).to_list(50)
    return [_doc_to_out(d) for d in docs]


# =============================================================================
# ATTENDANCE / HOLIDAY / VISIT CARD INTEGRATION
# =============================================================================

@router.get("/attendance/today-summary")
async def attendance_today_summary(current_user=Depends(get_current_user)):
    try:
        u_id = (
            str(current_user.id) if hasattr(current_user, "id")
            else str(current_user.get("id") or current_user.get("_id") or "")
            if isinstance(current_user, dict) else str(current_user)
        )
        today      = datetime.now(IST).strftime("%Y-%m-%d")
        week_later = (datetime.now(IST) + timedelta(days=7)).strftime("%Y-%m-%d")
        visits = await db["visits"].find({"user_id": u_id, "visit_date": today}, {"_id": 0}).to_list(20)
        reminders = await db["reminders"].find(
            {"user_id": u_id, "is_dismissed": {"$ne": True},
             "remind_at": {"$gte": today, "$lte": week_later + "T23:59:59"}},
            {"_id": 0}
        ).sort("remind_at", 1).to_list(20)
        return {
            "today": today,
            "visits_today": [
                {"title": v.get("title","Untitled"), "status": v.get("status","scheduled"),
                 "notes": v.get("notes") or ""} for v in visits
            ],
            "upcoming_reminders": [
                {"title": r.get("title","Untitled"), "remind_at": str(r.get("remind_at",""))}
                for r in reminders
            ],
        }
    except Exception as e:
        return {"today": datetime.now(IST).strftime("%Y-%m-%d"),
                "visits_today": [], "upcoming_reminders": [], "error": str(e)}

@router.get("/holidays/upcoming")
async def upcoming_holidays(current_user=Depends(get_current_user)):
    try:
        u_id  = str(current_user.id) if hasattr(current_user, "id") else str(current_user)
        today = datetime.now(IST).strftime("%Y-%m-%d")
        events = await db[COL_EVENTS].find(
            {"user_id": u_id, "date": {"$gte": today},
             "event_type": {"$in": ["Court Hearing","Trademark Hearing","Deadline","Examination Report"]}},
            {"_id": 0, "title": 1, "date": 1, "event_type": 1, "id": 1, "tm_app_no": 1}
        ).sort("date", 1).limit(10).to_list(10)
        return {"events": [
            {"id": e.get("id",""), "title": e.get("title","Notice"),
             "date": e.get("date"), "event_type": e.get("event_type"),
             "tm_app_no": e.get("tm_app_no")} for e in events
        ]}
    except Exception as e:
        return {"events": [], "error": str(e)}
