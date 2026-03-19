# ═══════════════════════════════════════════════════════════════════════════════
# backend/email_integration.py
# Supports: Gmail OAuth2, Outlook OAuth2, Yahoo/any IMAP (app password)
# Extracts meetings, hearings, court dates, visits, events from emails
# ═══════════════════════════════════════════════════════════════════════════════

import os
import re
import json
import uuid
import base64
import imaplib
import email as email_lib
import logging
from email.header import decode_header
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Dict, Any
from io import BytesIO

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from backend.dependencies import db, get_current_user
from backend.models import User

router = APIRouter(prefix="/email", tags=["email"])

# ═══════════════════════════════════════════════════════════════════════════════
# ENV VARS — add these to your .env file
# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
# MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
# FRONTEND_URL   e.g. https://your-frontend.onrender.com
# ═══════════════════════════════════════════════════════════════════════════════

GOOGLE_CLIENT_ID       = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET   = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI    = os.getenv("GOOGLE_REDIRECT_URI", "")

MICROSOFT_CLIENT_ID     = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
MICROSOFT_REDIRECT_URI  = os.getenv("MICROSOFT_REDIRECT_URI", "")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]

MICROSOFT_SCOPES = [
    "openid",
    "email",
    "profile",
    "offline_access",
    "https://graph.microsoft.com/Mail.Read",
]

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class IMAPConnectRequest(BaseModel):
    provider: str
    email_address: str
    app_password: str
    imap_host: Optional[str] = None
    imap_port: Optional[int] = 993


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
    raw_snippet: Optional[str] = None


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
_URGENCY_MED = [
    "please", "kindly", "request", "schedule", "plan", "upcoming",
]


def _strip_html(html: str) -> str:
    """Remove HTML tags and return plain text."""
    try:
        # Try beautifulsoup if available
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "head", "meta", "link"]):
            tag.decompose()
        return soup.get_text(separator="\n")
    except ImportError:
        # Fallback: simple regex
        return re.sub(r"<[^>]+>", " ", html)


def _parse_date_from_text(text: str) -> Optional[str]:
    """Try many date patterns. Returns YYYY-MM-DD or None."""
    text = text.strip()
    now = datetime.now()

    # ISO: YYYY-MM-DD or YYYY/MM/DD
    m = re.search(r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b", text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            pass

    # DD/MM/YYYY or DD-MM-YYYY
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        except ValueError:
            pass

    # "15 August 2025" or "15th August 2025"
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

    # "August 15, 2025" or "August 15"
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

    # Try dateutil as last resort
    try:
        from dateutil import parser as dateutil_parser
        return dateutil_parser.parse(text, fuzzy=True).date().isoformat()
    except Exception:
        return None


def _parse_time_from_text(text: str) -> Optional[str]:
    """Extract time from text. Returns HH:MM in 24h format."""
    m = re.search(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?\b", text)
    if m:
        h = int(m.group(1))
        mn = int(m.group(2))
        period = (m.group(3) or "").lower()
        if period == "pm" and h != 12:
            h += 12
        if period == "am" and h == 12:
            h = 0
        return f"{h:02d}:{mn:02d}"

    m = re.search(r"\b(\d{1,2})\s*(am|pm|AM|PM)\b", text)
    if m:
        h = int(m.group(1))
        period = m.group(2).lower()
        if period == "pm" and h != 12:
            h += 12
        if period == "am" and h == 12:
            h = 0
        return f"{h:02d}:00"

    return None


def _detect_event_type(text: str, subject: str) -> str:
    combined = (text + " " + subject).lower()
    if any(k in combined for k in ["hearing", "court", "tribunal", "show cause", "arbitration", "ipo", "patent", "trademark"]):
        return "hearing"
    if any(k in combined for k in ["visit", "site visit", "field visit", "client visit", "inspection"]):
        return "visit"
    if any(k in combined for k in ["deadline", "due date", "last date", "submit by", "filing"]):
        return "deadline"
    if any(k in combined for k in ["meeting", "conference", "call", "zoom", "teams", "google meet", "video"]):
        return "meeting"
    return "other"


def _detect_urgency(text: str, subject: str) -> str:
    combined = (text + " " + subject).lower()
    if any(k in combined for k in _URGENCY_HIGH):
        return "urgent"
    if any(k in combined for k in _URGENCY_MED):
        return "medium"
    return "low"


def _extract_location(text: str) -> Optional[str]:
    patterns = [
        r"(?:venue|location|place|address|held at|at)\s*[:\-]?\s*([^\n,]{5,80})",
        r"(?:zoom link|meet link|teams link|join at|join here)\s*[:\-]?\s*(https?://[^\s]{10,120})",
        r"(https?://(?:zoom\.us|teams\.microsoft|meet\.google)\S+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:120]
    return None


def _extract_organizer(text: str, from_addr: str) -> Optional[str]:
    patterns = [
        r"(?:organizer|organiser|hosted by|invited by)\s*[:\-]?\s*([A-Za-z\s\.]{3,50})",
        r"([A-Za-z\s\.]{3,40})\s+(?:has invited|invites you|is inviting)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            if len(name) > 3:
                return name
    m = re.match(r"^([^<@]+)", from_addr)
    if m:
        return m.group(1).strip().strip('"') or None
    return None


def extract_events_from_email_body(
    subject: str,
    body_text: str,
    from_addr: str,
    email_date: str,
) -> List[ExtractedEvent]:
    """Core parser: given one email, return list of ExtractedEvent objects."""
    lower_body = body_text.lower()
    lower_subj = subject.lower()

    has_keyword = any(kw in lower_body or kw in lower_subj for kw in _EVENT_KEYWORDS)
    if not has_keyword:
        return []

    chunks = re.split(r"[\n\r]{1,3}|(?<=[.!?])\s+", body_text)
    events: List[ExtractedEvent] = []
    seen_dates = set()

    for chunk in chunks:
        if len(chunk.strip()) < 8:
            continue
        date_val = _parse_date_from_text(chunk)
        if not date_val:
            continue
        if date_val in seen_dates:
            continue
        try:
            parsed_d = date.fromisoformat(date_val)
            if parsed_d < date.today() - timedelta(days=30):
                continue
        except Exception:
            continue

        seen_dates.add(date_val)
        time_val = _parse_time_from_text(chunk) or _parse_time_from_text(body_text[:500])
        location = _extract_location(body_text)
        organizer = _extract_organizer(body_text, from_addr)
        event_type = _detect_event_type(body_text, subject)
        urgency = _detect_urgency(body_text, subject)

        clean_subject = re.sub(r"^(re:|fwd?:|fw:)\s*", "", subject, flags=re.IGNORECASE).strip()
        title = clean_subject if clean_subject else f"{event_type.title()} on {date_val}"

        events.append(ExtractedEvent(
            title=title,
            event_type=event_type,
            date=date_val,
            time=time_val,
            location=location,
            organizer=organizer,
            description=body_text[:400].strip(),
            urgency=urgency,
            source_subject=subject,
            source_from=from_addr,
            source_date=email_date,
            raw_snippet=chunk.strip()[:200],
        ))

    if not events:
        date_val = _parse_date_from_text(body_text[:800])
        if date_val:
            clean_subject = re.sub(r"^(re:|fwd?:|fw:)\s*", "", subject, flags=re.IGNORECASE).strip()
            events.append(ExtractedEvent(
                title=clean_subject or "Event",
                event_type=_detect_event_type(body_text, subject),
                date=date_val,
                time=_parse_time_from_text(body_text[:500]),
                location=_extract_location(body_text),
                organizer=_extract_organizer(body_text, from_addr),
                description=body_text[:400].strip(),
                urgency=_detect_urgency(body_text, subject),
                source_subject=subject,
                source_from=from_addr,
                source_date=email_date,
                raw_snippet=body_text[:200].strip(),
            ))

    return events


# ═══════════════════════════════════════════════════════════════════════════════
# IMAP FETCHER
# ═══════════════════════════════════════════════════════════════════════════════

IMAP_HOSTS = {
    "gmail":   ("imap.gmail.com", 993),
    "yahoo":   ("imap.mail.yahoo.com", 993),
    "outlook": ("outlook.office365.com", 993),
    "hotmail": ("outlook.office365.com", 993),
    "live":    ("outlook.office365.com", 993),
}


def _get_email_text(msg) -> str:
    parts = []
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                continue
            if ct == "text/plain":
                try:
                    parts.append(part.get_payload(decode=True).decode("utf-8", errors="replace"))
                except Exception:
                    pass
            elif ct == "text/html":
                try:
                    raw = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    parts.append(_strip_html(raw))
                except Exception:
                    pass
    else:
        ct = msg.get_content_type()
        try:
            raw = msg.get_payload(decode=True).decode("utf-8", errors="replace")
            parts.append(_strip_html(raw) if ct == "text/html" else raw)
        except Exception:
            pass
    return "\n".join(parts)


def _decode_header_value(val: str) -> str:
    parts = decode_header(val or "")
    decoded = []
    for b, enc in parts:
        if isinstance(b, bytes):
            decoded.append(b.decode(enc or "utf-8", errors="replace"))
        else:
            decoded.append(str(b))
    return " ".join(decoded)


def fetch_events_via_imap(
    provider: str,
    email_address: str,
    app_password: str,
    imap_host: Optional[str],
    imap_port: int,
    days_back: int = 30,
    max_emails: int = 50,
) -> List[ExtractedEvent]:
    if not imap_host:
        key = provider.lower().split("@")[-1].split(".")[0]
        host_port = IMAP_HOSTS.get(key, IMAP_HOSTS.get(provider.lower(), None))
        if not host_port:
            raise ValueError(f"Unknown provider '{provider}'. Please supply imap_host manually.")
        imap_host, imap_port = host_port

    try:
        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        mail.login(email_address, app_password)
    except imaplib.IMAP4.error as e:
        raise ValueError(f"IMAP login failed: {str(e)}. Use an App Password, not your regular password.")

    mail.select("INBOX")
    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
    status, messages = mail.search(None, f'(SINCE "{since_date}")')
    if status != "OK":
        mail.logout()
        return []

    msg_ids = messages[0].split()
    msg_ids = msg_ids[-max_emails:]
    all_events: List[ExtractedEvent] = []

    for mid in reversed(msg_ids):
        try:
            status, data = mail.fetch(mid, "(RFC822)")
            if status != "OK":
                continue
            raw = data[0][1]
            msg = email_lib.message_from_bytes(raw)
            subject   = _decode_header_value(msg.get("Subject", ""))
            from_addr = _decode_header_value(msg.get("From", ""))
            email_date = _decode_header_value(msg.get("Date", ""))
            body_text = _get_email_text(msg)
            events = extract_events_from_email_body(subject, body_text, from_addr, email_date)
            all_events.extend(events)
        except Exception as e:
            logger.warning(f"Failed to parse email {mid}: {e}")
            continue

    mail.logout()
    return all_events


# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE OAUTH2
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/auth/google")
async def google_auth_start(current_user: User = Depends(get_current_user)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env")
    scope = " ".join(GOOGLE_SCOPES)
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scope}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={current_user.id}"
    )
    return RedirectResponse(url)


@router.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
    if token_resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {token_resp.text}")

    tokens = token_resp.json()
    await db.email_connections.update_one(
        {"user_id": state, "provider": "google"},
        {"$set": {
            "user_id": state,
            "provider": "google",
            "method": "oauth",
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat(),
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return RedirectResponse(f"{FRONTEND_URL}/attendance?email_connected=google")


async def _refresh_google_token(user_id: str, refresh_token: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Google token refresh failed. Please reconnect Gmail.")
    tokens = resp.json()
    new_access = tokens["access_token"]
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat()
    await db.email_connections.update_one(
        {"user_id": user_id, "provider": "google"},
        {"$set": {"access_token": new_access, "expires_at": expires_at}},
    )
    return new_access


async def _get_valid_google_token(user_id: str) -> str:
    conn = await db.email_connections.find_one({"user_id": user_id, "provider": "google"}, {"_id": 0})
    if not conn:
        raise HTTPException(401, "Gmail not connected. Please connect via OAuth first.")
    expires_at = datetime.fromisoformat(conn["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
        return await _refresh_google_token(user_id, conn["refresh_token"])
    return conn["access_token"]


def _extract_gmail_body(payload: dict) -> str:
    parts_text = []
    mime_type = payload.get("mimeType", "")
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            parts_text.append(base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace"))
    elif mime_type == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            raw = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            parts_text.append(_strip_html(raw))
    for part in payload.get("parts", []):
        parts_text.append(_extract_gmail_body(part))
    return "\n".join(filter(None, parts_text))


async def fetch_events_via_gmail_api(user_id: str, days_back: int = 30, max_emails: int = 50) -> List[ExtractedEvent]:
    access_token = await _get_valid_google_token(user_id)
    headers = {"Authorization": f"Bearer {access_token}"}
    since_epoch = int((datetime.now() - timedelta(days=days_back)).timestamp())

    async with httpx.AsyncClient(timeout=30) as client:
        params = {"q": f"after:{since_epoch}", "maxResults": max_emails, "labelIds": "INBOX"}
        list_resp = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers=headers, params=params,
        )
        if list_resp.status_code != 200:
            raise HTTPException(502, f"Gmail API error: {list_resp.text}")

        messages = list_resp.json().get("messages", [])
        all_events: List[ExtractedEvent] = []

        for msg_meta in messages:
            try:
                msg_resp = await client.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_meta['id']}",
                    headers=headers,
                    params={"format": "full"},
                )
                if msg_resp.status_code != 200:
                    continue
                msg_data = msg_resp.json()
                payload = msg_data.get("payload", {})
                headers_list = payload.get("headers", [])

                def _hdr(name):
                    return next((h["value"] for h in headers_list if h["name"].lower() == name.lower()), "")

                subject   = _hdr("Subject")
                from_addr = _hdr("From")
                date_str  = _hdr("Date")
                body_text = _extract_gmail_body(payload)
                events = extract_events_from_email_body(subject, body_text, from_addr, date_str)
                all_events.extend(events)
            except Exception as e:
                logger.warning(f"Gmail parse error for {msg_meta.get('id')}: {e}")

    return all_events


# ═══════════════════════════════════════════════════════════════════════════════
# MICROSOFT OAUTH2
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/auth/microsoft")
async def microsoft_auth_start(current_user: User = Depends(get_current_user)):
    if not MICROSOFT_CLIENT_ID:
        raise HTTPException(400, "Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID in .env")
    scope = " ".join(MICROSOFT_SCOPES)
    url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        f"?client_id={MICROSOFT_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={MICROSOFT_REDIRECT_URI}"
        f"&scope={scope}"
        f"&state={current_user.id}"
    )
    return RedirectResponse(url)


@router.get("/auth/microsoft/callback")
async def microsoft_auth_callback(code: str, state: str):
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "code": code,
                "client_id": MICROSOFT_CLIENT_ID,
                "client_secret": MICROSOFT_CLIENT_SECRET,
                "redirect_uri": MICROSOFT_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
    if token_resp.status_code != 200:
        raise HTTPException(400, f"Microsoft token error: {token_resp.text}")

    tokens = token_resp.json()
    await db.email_connections.update_one(
        {"user_id": state, "provider": "microsoft"},
        {"$set": {
            "user_id": state,
            "provider": "microsoft",
            "method": "oauth",
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat(),
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return RedirectResponse(f"{FRONTEND_URL}/attendance?email_connected=microsoft")


async def _get_valid_microsoft_token(user_id: str) -> str:
    conn = await db.email_connections.find_one({"user_id": user_id, "provider": "microsoft"}, {"_id": 0})
    if not conn:
        raise HTTPException(401, "Outlook not connected. Please connect first.")
    expires_at = datetime.fromisoformat(conn["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                data={
                    "client_id": MICROSOFT_CLIENT_ID,
                    "client_secret": MICROSOFT_CLIENT_SECRET,
                    "refresh_token": conn["refresh_token"],
                    "grant_type": "refresh_token",
                    "scope": " ".join(MICROSOFT_SCOPES),
                },
            )
        tokens = resp.json()
        new_access = tokens["access_token"]
        await db.email_connections.update_one(
            {"user_id": user_id, "provider": "microsoft"},
            {"$set": {
                "access_token": new_access,
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat(),
            }},
        )
        return new_access
    return conn["access_token"]


async def fetch_events_via_outlook_api(user_id: str, days_back: int = 30, max_emails: int = 50) -> List[ExtractedEvent]:
    access_token = await _get_valid_microsoft_token(user_id)
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    since = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
            headers=headers,
            params={
                "$filter": f"receivedDateTime ge {since}",
                "$top": max_emails,
                "$select": "subject,from,receivedDateTime,body",
                "$orderby": "receivedDateTime desc",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"Outlook API error: {resp.text}")

        messages = resp.json().get("value", [])
        all_events: List[ExtractedEvent] = []

        for msg in messages:
            try:
                subject   = msg.get("subject", "")
                from_addr = msg.get("from", {}).get("emailAddress", {}).get("address", "")
                date_str  = msg.get("receivedDateTime", "")
                body_raw  = msg.get("body", {}).get("content", "")
                body_type = msg.get("body", {}).get("contentType", "text")
                body_text = _strip_html(body_raw) if body_type == "html" else body_raw
                events = extract_events_from_email_body(subject, body_text, from_addr, date_str)
                all_events.extend(events)
            except Exception as e:
                logger.warning(f"Outlook parse error: {e}")

    return all_events


# ═══════════════════════════════════════════════════════════════════════════════
# API ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/connections")
async def get_email_connections(current_user: User = Depends(get_current_user)):
    conns = await db.email_connections.find(
        {"user_id": current_user.id},
        {"_id": 0, "access_token": 0, "refresh_token": 0, "app_password_enc": 0}
    ).to_list(10)
    return {"connections": conns}


@router.delete("/connections/{provider}")
async def disconnect_email(provider: str, current_user: User = Depends(get_current_user)):
    await db.email_connections.delete_one({"user_id": current_user.id, "provider": provider})
    return {"message": f"{provider} disconnected successfully"}


@router.post("/connect/imap")
async def connect_imap(
    payload: IMAPConnectRequest,
    current_user: User = Depends(get_current_user),
):
    key = payload.provider.lower().split("@")[-1].split(".")[0]
    host_port = IMAP_HOSTS.get(key, None)
    host = payload.imap_host or (host_port[0] if host_port else None)
    port = payload.imap_port or (host_port[1] if host_port else 993)

    if not host:
        raise HTTPException(400, f"Cannot auto-detect IMAP host for '{payload.provider}'. Please supply imap_host.")

    try:
        mail = imaplib.IMAP4_SSL(host, port)
        mail.login(payload.email_address, payload.app_password)
        mail.logout()
    except Exception as e:
        raise HTTPException(400, f"IMAP connection failed: {str(e)}")

    await db.email_connections.update_one(
        {"user_id": current_user.id, "provider": payload.provider},
        {"$set": {
            "user_id": current_user.id,
            "provider": payload.provider,
            "method": "imap",
            "email_address": payload.email_address,
            "app_password_enc": payload.app_password,
            "imap_host": host,
            "imap_port": port,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": f"{payload.provider} connected successfully via IMAP"}


@router.get("/fetch-events")
async def fetch_email_events(
    provider: Optional[str] = Query(None),
    days_back: int = Query(30, ge=1, le=90),
    max_emails: int = Query(50, ge=5, le=200),
    current_user: User = Depends(get_current_user),
):
    conns_query = {"user_id": current_user.id}
    if provider:
        conns_query["provider"] = provider

    conns = await db.email_connections.find(conns_query, {"_id": 0}).to_list(10)
    if not conns:
        raise HTTPException(404, "No email accounts connected. Please connect at least one email account first.")

    all_events: List[ExtractedEvent] = []
    errors: List[str] = []

    for conn in conns:
        prov = conn["provider"]
        method = conn.get("method", "oauth")
        try:
            if prov == "google" and method != "imap":
                events = await fetch_events_via_gmail_api(current_user.id, days_back, max_emails)
            elif prov == "microsoft" and method != "imap":
                events = await fetch_events_via_outlook_api(current_user.id, days_back, max_emails)
            else:
                events = fetch_events_via_imap(
                    provider=prov,
                    email_address=conn["email_address"],
                    app_password=conn["app_password_enc"],
                    imap_host=conn.get("imap_host"),
                    imap_port=conn.get("imap_port", 993),
                    days_back=days_back,
                    max_emails=max_emails,
                )
            all_events.extend(events)
        except HTTPException as e:
            errors.append(f"{prov}: {e.detail}")
        except Exception as e:
            logger.error(f"Email fetch error for {prov}: {e}")
            errors.append(f"{prov}: {str(e)}")

    seen = set()
    unique_events = []
    for ev in all_events:
        key = (ev.title[:40].lower(), ev.date)
        if key not in seen:
            seen.add(key)
            unique_events.append(ev)

    urgency_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    unique_events.sort(key=lambda e: (
        e.date or "9999-12-31",
        urgency_order.get(e.urgency, 3),
    ))

    return {
        "events": [ev.model_dump() for ev in unique_events],
        "total": len(unique_events),
        "providers_scanned": [c["provider"] for c in conns],
        "errors": errors,
    }
