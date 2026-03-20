# ═══════════════════════════════════════════════════════════════════════════════
# backend/email_integration.py
#
# Pure IMAP — NO OAuth, NO Google Cloud Console, NO API keys required.
#
# How to connect Gmail:
#   1. Enable 2-Step Verification on Google account
#   2. Go to myaccount.google.com/apppasswords
#   3. Generate App Password → select "Mail" → copy 16-char password
#   4. Enter email + that password here → connects via imap.gmail.com:993
#
# Works the same for Outlook, Yahoo, iCloud, Zoho, Rediffmail, etc.
# Multiple accounts per user are each stored as separate documents.
# ═══════════════════════════════════════════════════════════════════════════════

import re
import asyncio
import imaplib
import email as email_lib
import logging
from email.header import decode_header
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from backend.dependencies import db, get_current_user
from backend.models import User

router = APIRouter(prefix="/email", tags=["email"])

# ═══════════════════════════════════════════════════════════════════════════════
# IMAP HOST AUTO-DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

IMAP_HOSTS: Dict[str, tuple] = {
    "gmail":      ("imap.gmail.com", 993),
    "googlemail": ("imap.gmail.com", 993),
    "yahoo":      ("imap.mail.yahoo.com", 993),
    "ymail":      ("imap.mail.yahoo.com", 993),
    "outlook":    ("outlook.office365.com", 993),
    "hotmail":    ("outlook.office365.com", 993),
    "live":       ("outlook.office365.com", 993),
    "msn":        ("outlook.office365.com", 993),
    "icloud":     ("imap.mail.me.com", 993),
    "me":         ("imap.mail.me.com", 993),
    "zoho":       ("imap.zoho.com", 993),
    "rediffmail": ("imap.rediffmail.com", 993),
    "proton":     ("127.0.0.1", 1143),
}

def _detect_imap_host(email_address: str) -> Optional[tuple]:
    """Auto-detect IMAP host from email domain."""
    try:
        domain = email_address.split("@")[1].lower()
        # exact domain match first
        for key, val in IMAP_HOSTS.items():
            if domain == f"{key}.com" or domain == key:
                return val
        # subdomain match
        for key, val in IMAP_HOSTS.items():
            if key in domain:
                return val
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class EmailConnectRequest(BaseModel):
    email_address: str
    app_password: str
    imap_host: Optional[str] = None
    imap_port: Optional[int] = 993
    label: Optional[str] = None          # friendly name e.g. "Work Gmail"


class EmailConnectionUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None


class ExtractedEvent(BaseModel):
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
    source_account: Optional[str] = None
    raw_snippet: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# CONNECTION KEY HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def _conn_key(user_id: str, email_address: str) -> str:
    """Unique document key per user+email so multiple accounts coexist."""
    return f"{user_id}::{email_address.lower().strip()}"


# ═══════════════════════════════════════════════════════════════════════════════
# EVENT EXTRACTION ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

_MONTH_MAP = {
    "january": 1, "jan": 1, "february": 2, "feb": 2,
    "march": 3, "mar": 3, "april": 4, "apr": 4,
    "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

_EVENT_KEYWORDS = [
    "meeting", "conference", "call", "hearing", "court", "tribunal",
    "arbitration", "appointment", "interview", "review", "session",
    "webinar", "seminar", "workshop", "visit", "inspection", "audit",
    "presentation", "demo", "standup", "sync", "deadline", "due date",
    "reminder", "follow-up", "followup", "discussion", "zoom", "teams",
    "meet", "google meet", "skype", "video call", "online meeting",
    "client visit", "site visit", "field visit", "customer meeting",
    "show cause", "trademark", "ip hearing", "ipo", "patent",
    "schedule", "invitation", "invite", "rsvp", "agenda",
]

_URGENCY_HIGH = [
    "urgent", "asap", "immediately", "important", "critical",
    "priority", "action required", "respond by", "deadline",
]
_URGENCY_MED = ["please", "kindly", "request", "schedule", "plan", "upcoming"]


def _strip_html(html: str) -> str:
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "head", "meta", "link"]):
            tag.decompose()
        return soup.get_text(separator="\n")
    except ImportError:
        return re.sub(r"<[^>]+>", " ", html)


def _parse_date_from_text(text: str) -> Optional[str]:
    text = text.strip()
    now = datetime.now()

    m = re.search(r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b", text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            pass

    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        except ValueError:
            pass

    m = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(january|february|march|april|may|june|july|august|september|"
        r"october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)"
        r"(?:\s+(\d{4}))?\b",
        text, re.IGNORECASE,
    )
    if m:
        try:
            yr = int(m.group(3)) if m.group(3) else now.year
            mo = _MONTH_MAP.get(m.group(2).lower(), 0)
            if mo:
                return date(yr, mo, int(m.group(1))).isoformat()
        except ValueError:
            pass

    m = re.search(
        r"\b(january|february|march|april|may|june|july|august|september|"
        r"october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)"
        r"\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b",
        text, re.IGNORECASE,
    )
    if m:
        try:
            mo = _MONTH_MAP.get(m.group(1).lower(), 0)
            yr = int(m.group(3)) if m.group(3) else now.year
            if mo:
                return date(yr, mo, int(m.group(2))).isoformat()
        except ValueError:
            pass

    try:
        from dateutil import parser as du
        return du.parse(text, fuzzy=True).date().isoformat()
    except Exception:
        return None


def _parse_time_from_text(text: str) -> Optional[str]:
    m = re.search(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?\b", text)
    if m:
        h, mn = int(m.group(1)), int(m.group(2))
        p = (m.group(3) or "").lower()
        if p == "pm" and h != 12: h += 12
        if p == "am" and h == 12: h = 0
        return f"{h:02d}:{mn:02d}"
    m = re.search(r"\b(\d{1,2})\s*(am|pm|AM|PM)\b", text)
    if m:
        h = int(m.group(1))
        p = m.group(2).lower()
        if p == "pm" and h != 12: h += 12
        if p == "am" and h == 12: h = 0
        return f"{h:02d}:00"
    return None


def _detect_event_type(text: str, subject: str) -> str:
    c = (text + " " + subject).lower()
    if any(k in c for k in ["hearing","court","tribunal","show cause","arbitration","ipo","patent","trademark"]):
        return "hearing"
    if any(k in c for k in ["visit","site visit","field visit","client visit","inspection"]):
        return "visit"
    if any(k in c for k in ["deadline","due date","last date","submit by","filing"]):
        return "deadline"
    if any(k in c for k in ["meeting","conference","call","zoom","teams","google meet","video"]):
        return "meeting"
    return "other"


def _detect_urgency(text: str, subject: str) -> str:
    c = (text + " " + subject).lower()
    if any(k in c for k in _URGENCY_HIGH): return "urgent"
    if any(k in c for k in _URGENCY_MED): return "medium"
    return "low"


def _extract_location(text: str) -> Optional[str]:
    for pat in [
        r"(?:venue|location|place|address|held at|at)\s*[:\-]?\s*([^\n,]{5,80})",
        r"(?:zoom link|meet link|teams link|join at)\s*[:\-]?\s*(https?://[^\s]{10,120})",
        r"(https?://(?:zoom\.us|teams\.microsoft|meet\.google)\S+)",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:120]
    return None


def _extract_organizer(text: str, from_addr: str) -> Optional[str]:
    for pat in [
        r"(?:organizer|organiser|hosted by|invited by)\s*[:\-]?\s*([A-Za-z\s\.]{3,50})",
        r"([A-Za-z\s\.]{3,40})\s+(?:has invited|invites you|is inviting)",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            if len(name) > 3: return name
    m = re.match(r"^([^<@]+)", from_addr)
    if m:
        return m.group(1).strip().strip('"') or None
    return None


def extract_events_from_email_body(
    subject: str, body_text: str,
    from_addr: str, email_date: str,
    source_account: Optional[str] = None,
) -> List[ExtractedEvent]:
    lower_body = body_text.lower()
    lower_subj = subject.lower()
    if not any(kw in lower_body or kw in lower_subj for kw in _EVENT_KEYWORDS):
        return []

    chunks = re.split(r"[\n\r]{1,3}|(?<=[.!?])\s+", body_text)
    events: List[ExtractedEvent] = []
    seen_dates: set = set()

    for chunk in chunks:
        if len(chunk.strip()) < 8:
            continue
        dv = _parse_date_from_text(chunk)
        if not dv or dv in seen_dates:
            continue
        try:
            if date.fromisoformat(dv) < date.today() - timedelta(days=30):
                continue
        except Exception:
            continue
        seen_dates.add(dv)
        clean_subj = re.sub(r"^(re:|fwd?:|fw:)\s*", "", subject, flags=re.IGNORECASE).strip()
        ev_type = _detect_event_type(body_text, subject)
        events.append(ExtractedEvent(
            title=clean_subj or f"{ev_type.title()} on {dv}",
            event_type=ev_type,
            date=dv,
            time=_parse_time_from_text(chunk) or _parse_time_from_text(body_text[:500]),
            location=_extract_location(body_text),
            organizer=_extract_organizer(body_text, from_addr),
            description=body_text[:400].strip(),
            urgency=_detect_urgency(body_text, subject),
            source_subject=subject,
            source_from=from_addr,
            source_date=email_date,
            source_account=source_account,
            raw_snippet=chunk.strip()[:200],
        ))

    if not events:
        dv = _parse_date_from_text(body_text[:800])
        if dv:
            clean_subj = re.sub(r"^(re:|fwd?:|fw:)\s*", "", subject, flags=re.IGNORECASE).strip()
            ev_type = _detect_event_type(body_text, subject)
            events.append(ExtractedEvent(
                title=clean_subj or "Event",
                event_type=ev_type,
                date=dv,
                time=_parse_time_from_text(body_text[:500]),
                location=_extract_location(body_text),
                organizer=_extract_organizer(body_text, from_addr),
                description=body_text[:400].strip(),
                urgency=_detect_urgency(body_text, subject),
                source_subject=subject,
                source_from=from_addr,
                source_date=email_date,
                source_account=source_account,
                raw_snippet=body_text[:200].strip(),
            ))
    return events


# ═══════════════════════════════════════════════════════════════════════════════
# IMAP FETCHER
# ═══════════════════════════════════════════════════════════════════════════════

def _get_email_text(msg) -> str:
    parts = []
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if "attachment" in str(part.get("Content-Disposition", "")):
                continue
            try:
                raw = part.get_payload(decode=True).decode("utf-8", errors="replace")
                if ct == "text/html":
                    parts.append(_strip_html(raw))
                elif ct == "text/plain":
                    parts.append(raw)
            except Exception:
                pass
    else:
        try:
            raw = msg.get_payload(decode=True).decode("utf-8", errors="replace")
            parts.append(_strip_html(raw) if msg.get_content_type() == "text/html" else raw)
        except Exception:
            pass
    return "\n".join(filter(None, parts))


def _decode_header_value(val: str) -> str:
    parts = decode_header(val or "")
    return " ".join(
        b.decode(enc or "utf-8", errors="replace") if isinstance(b, bytes) else str(b)
        for b, enc in parts
    )


def fetch_events_via_imap(
    email_address: str,
    app_password: str,
    imap_host: str,
    imap_port: int,
    days_back: int = 30,
    max_emails: int = 100,
) -> List[ExtractedEvent]:
    """Connect to IMAP, fetch recent emails, extract events. Pure blocking — run in executor."""
    try:
        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        mail.login(email_address, app_password)
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed for {email_address}: {str(exc)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cannot connect to {imap_host}: {str(exc)}",
        )

    mail.select("INBOX")
    since = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
    st, msgs = mail.search(None, f'(SINCE "{since}")')
    if st != "OK":
        mail.logout()
        return []

    msg_ids = msgs[0].split()[-max_emails:]
    all_events: List[ExtractedEvent] = []

    for mid in reversed(msg_ids):
        try:
            st2, data = mail.fetch(mid, "(RFC822)")
            if st2 != "OK":
                continue
            msg   = email_lib.message_from_bytes(data[0][1])
            subj  = _decode_header_value(msg.get("Subject", ""))
            frm   = _decode_header_value(msg.get("From", ""))
            dt    = _decode_header_value(msg.get("Date", ""))
            body  = _get_email_text(msg)
            all_events.extend(
                extract_events_from_email_body(subj, body, frm, dt, source_account=email_address)
            )
        except Exception as exc:
            logger.warning(f"Parse error msg {mid} ({email_address}): {exc}")
            continue

    mail.logout()
    return all_events


def test_imap_connection(email_address: str, app_password: str, imap_host: str, imap_port: int) -> bool:
    """Quick connection test — returns True on success, raises HTTPException on failure."""
    try:
        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        mail.login(email_address, app_password)
        mail.logout()
        return True
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(exc)}. Make sure you're using an App Password, not your regular password.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cannot connect to {imap_host}:{imap_port} — {str(exc)}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# API ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/provider-info")
async def get_provider_info():
    """
    Returns setup instructions for each supported email provider.
    Frontend uses this to show the correct help text and auto-fill IMAP settings.
    No auth required — public endpoint used on the settings page.
    """
    return {
        "providers": [
            {
                "id": "gmail",
                "label": "Gmail",
                "color": "#EA4335",
                "icon": "G",
                "imap_host": "imap.gmail.com",
                "imap_port": 993,
                "domains": ["gmail.com", "googlemail.com"],
                "steps": [
                    "Go to myaccount.google.com",
                    "Security → 2-Step Verification → turn ON",
                    "Security → App passwords (search 'App passwords')",
                    "Select app: Mail → Select device: Other → type 'Taskosphere'",
                    "Copy the 16-character password shown",
                    "Paste it in the App Password field below",
                ],
                "app_password_url": "https://myaccount.google.com/apppasswords",
                "note": "Must have 2-Step Verification enabled first.",
            },
            {
                "id": "outlook",
                "label": "Outlook / Hotmail",
                "color": "#0078D4",
                "icon": "M",
                "imap_host": "outlook.office365.com",
                "imap_port": 993,
                "domains": ["outlook.com", "hotmail.com", "live.com", "msn.com"],
                "steps": [
                    "Go to account.microsoft.com",
                    "Security → Advanced security options",
                    "App passwords → Create a new app password",
                    "Copy the generated password",
                    "Paste it in the App Password field below",
                ],
                "app_password_url": "https://account.microsoft.com/security",
                "note": "Only available if 2-step verification is enabled.",
            },
            {
                "id": "yahoo",
                "label": "Yahoo Mail",
                "color": "#720E9E",
                "icon": "Y",
                "imap_host": "imap.mail.yahoo.com",
                "imap_port": 993,
                "domains": ["yahoo.com", "yahoo.in", "ymail.com"],
                "steps": [
                    "Go to login.yahoo.com → My Account → Account Security",
                    "Generate App Password",
                    "Select app: Mail → Generate",
                    "Copy the 16-character password",
                    "Paste it in the App Password field below",
                ],
                "app_password_url": "https://login.yahoo.com/myaccount/security/",
                "note": "Do NOT use your Yahoo login password.",
            },
            {
                "id": "icloud",
                "label": "iCloud Mail",
                "color": "#3B82F6",
                "icon": "iC",
                "imap_host": "imap.mail.me.com",
                "imap_port": 993,
                "domains": ["icloud.com", "me.com", "mac.com"],
                "steps": [
                    "Go to appleid.apple.com",
                    "Sign In & Security → App-Specific Passwords",
                    "Click + to generate a new password",
                    "Name it 'Taskosphere' → Create",
                    "Copy the password shown",
                ],
                "app_password_url": "https://appleid.apple.com",
                "note": "Requires Apple ID with 2FA enabled.",
            },
            {
                "id": "other",
                "label": "Other / Custom",
                "color": "#374151",
                "icon": "@",
                "imap_host": "",
                "imap_port": 993,
                "domains": [],
                "steps": [
                    "Contact your email provider for IMAP settings",
                    "Typical IMAP host: imap.yourdomain.com",
                    "Typical port: 993 (SSL) or 143 (STARTTLS)",
                    "Use your email password or an app-specific password",
                ],
                "app_password_url": "",
                "note": "Enter your IMAP server host and port manually.",
            },
        ]
    }


@router.post("/connections")
async def add_email_connection(
    payload: EmailConnectRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Connect an email account via IMAP App Password.
    Auto-detects IMAP host from email domain.
    Tests the connection before saving.
    """
    email_address = payload.email_address.lower().strip()

    # Auto-detect IMAP host if not provided
    imap_host = payload.imap_host
    imap_port = payload.imap_port or 993

    if not imap_host:
        detected = _detect_imap_host(email_address)
        if detected:
            imap_host, imap_port = detected
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot auto-detect IMAP server for '{email_address}'. "
                    "Please enter the IMAP host manually."
                ),
            )

    # Test connection before saving anything
    test_imap_connection(email_address, payload.app_password, imap_host, imap_port)

    # Detect provider label from domain
    provider = "other"
    try:
        domain = email_address.split("@")[1].lower()
        if "gmail" in domain or "googlemail" in domain:
            provider = "gmail"
        elif "outlook" in domain or "hotmail" in domain or "live" in domain or "msn" in domain:
            provider = "outlook"
        elif "yahoo" in domain or "ymail" in domain:
            provider = "yahoo"
        elif "icloud" in domain or "me.com" in domain or "mac.com" in domain:
            provider = "icloud"
    except Exception:
        pass

    conn_key = _conn_key(current_user.id, email_address)

    await db.email_connections.update_one(
        {"conn_id": conn_key},
        {"$set": {
            "conn_id": conn_key,
            "user_id": current_user.id,
            "provider": provider,
            "method": "imap",
            "email_address": email_address,
            "label": payload.label or email_address,
            "app_password_enc": payload.app_password,   # TODO: encrypt in production
            "imap_host": imap_host,
            "imap_port": imap_port,
            "is_active": True,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "last_synced": None,
            "sync_error": None,
        }},
        upsert=True,
    )

    logger.info(f"Email connected: user={current_user.id} email={email_address} host={imap_host}")
    return {
        "message": f"{email_address} connected successfully",
        "provider": provider,
        "imap_host": imap_host,
        "imap_port": imap_port,
    }


@router.get("/connections")
async def get_email_connections(current_user: User = Depends(get_current_user)):
    """List all connected email accounts for the current user."""
    conns = await db.email_connections.find(
        {"user_id": current_user.id},
        {"_id": 0, "app_password_enc": 0, "conn_id": 0},   # never return passwords
    ).to_list(50)
    return {"connections": conns, "total": len(conns)}


@router.patch("/connections/{email_address:path}")
async def update_email_connection(
    email_address: str,
    payload: EmailConnectionUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update label or active status of a connection."""
    conn_key = _conn_key(current_user.id, email_address)
    update   = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.email_connections.update_one({"conn_id": conn_key}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"message": "Updated"}


@router.delete("/connections/{email_address:path}")
async def delete_email_connection(
    email_address: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a connected email account."""
    conn_key = _conn_key(current_user.id, email_address)
    result   = await db.email_connections.delete_one({"conn_id": conn_key})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"message": f"{email_address} disconnected"}


@router.post("/connections/{email_address:path}/test")
async def test_email_connection(
    email_address: str,
    current_user: User = Depends(get_current_user),
):
    """Re-test an existing connection to verify it still works."""
    conn_key = _conn_key(current_user.id, email_address)
    conn = await db.email_connections.find_one({"conn_id": conn_key}, {"_id": 0})
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        test_imap_connection(
            conn["email_address"],
            conn["app_password_enc"],
            conn["imap_host"],
            conn["imap_port"],
        )
        await db.email_connections.update_one(
            {"conn_id": conn_key},
            {"$set": {"sync_error": None, "last_tested": datetime.now(timezone.utc).isoformat()}},
        )
        return {"status": "ok", "message": "Connection is working"}
    except HTTPException as exc:
        await db.email_connections.update_one(
            {"conn_id": conn_key},
            {"$set": {"sync_error": exc.detail}},
        )
        raise


@router.get("/fetch-events")
async def fetch_email_events(
    account: Optional[str]  = Query(None, description="Filter by specific email address"),
    days_back: int  = Query(30, ge=1, le=90),
    max_emails: int = Query(100, ge=5, le=500),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch and extract events from all active connected email accounts in parallel.
    Each account is fetched concurrently using asyncio + thread pool for IMAP.
    """
    query: Dict = {"user_id": current_user.id, "is_active": True}
    if account:
        query["email_address"] = account.lower().strip()

    conns = await db.email_connections.find(query, {"_id": 0}).to_list(50)
    if not conns:
        raise HTTPException(
            status_code=404,
            detail="No active email accounts found. Connect an account in Email Settings first.",
        )

    loop = asyncio.get_event_loop()

    async def _fetch_one(conn: dict):
        ea = conn["email_address"]
        try:
            events = await loop.run_in_executor(
                None,
                lambda: fetch_events_via_imap(
                    email_address=ea,
                    app_password=conn["app_password_enc"],
                    imap_host=conn["imap_host"],
                    imap_port=conn.get("imap_port", 993),
                    days_back=days_back,
                    max_emails=max_emails,
                ),
            )
            # Update last_synced
            await db.email_connections.update_one(
                {"conn_id": conn.get("conn_id", _conn_key(current_user.id, ea))},
                {"$set": {"last_synced": datetime.now(timezone.utc).isoformat(), "sync_error": None}},
            )
            return events, None
        except HTTPException as exc:
            await db.email_connections.update_one(
                {"conn_id": conn.get("conn_id", _conn_key(current_user.id, ea))},
                {"$set": {"sync_error": exc.detail}},
            )
            return [], f"{ea}: {exc.detail}"
        except Exception as exc:
            logger.error(f"Fetch error {ea}: {exc}", exc_info=True)
            return [], f"{ea}: unexpected error — {str(exc)}"

    results = await asyncio.gather(*[_fetch_one(c) for c in conns])

    all_events: List[ExtractedEvent] = []
    errors: List[str] = []
    for evts, err in results:
        all_events.extend(evts)
        if err:
            errors.append(err)

    # Deduplicate
    seen: set = set()
    unique: List[ExtractedEvent] = []
    for ev in all_events:
        key = (ev.title.lower(), ev.date, ev.time, ev.source_account)
        if key not in seen:
            seen.add(key)
            unique.append(ev)

    urgency_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    unique.sort(key=lambda e: (e.date or "9999-12-31", urgency_order.get(e.urgency, 3)))

    return {
        "events":           [ev.model_dump() for ev in unique],
        "total":            len(unique),
        "accounts_scanned": [c["email_address"] for c in conns],
        "errors":           errors,
    }
