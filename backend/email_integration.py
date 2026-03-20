# ═══════════════════════════════════════════════════════════════════════════════
# backend/email_integration.py
#
# Supports:
#   - Multiple Gmail accounts per user (OAuth2) ← NEW
#   - Multiple Outlook accounts per user (OAuth2) ← NEW
#   - Multiple Yahoo / custom IMAP accounts per user
#
# Key changes vs previous version:
#   1. Connection ID is now (user_id + provider + email_address) so multiple
#      Gmail accounts can coexist — previously (user_id + provider) meant the
#      second Gmail account would overwrite the first.
#   2. OAuth start endpoints accept ?token= query param (popup fix) AND
#      ?account_hint= so the user can pre-select which Google account to use.
#   3. /connections returns all accounts grouped by provider.
#   4. /fetch-events fans out across ALL connected accounts in parallel.
# ═══════════════════════════════════════════════════════════════════════════════

import os
import re
import asyncio
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
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from backend.dependencies import db, get_current_user, JWT_SECRET, ALGORITHM
from backend.models import User

router = APIRouter(prefix="/email", tags=["email"])

# ═══════════════════════════════════════════════════════════════════════════════
# ENV VARS
# ═══════════════════════════════════════════════════════════════════════════════

GOOGLE_CLIENT_ID       = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET   = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI    = os.getenv("GOOGLE_REDIRECT_URI", "")

MICROSOFT_CLIENT_ID     = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
MICROSOFT_REDIRECT_URI  = os.getenv("MICROSOFT_REDIRECT_URI", "")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

GOOGLE_SCOPES = [
    "openid", "email", "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]

MICROSOFT_SCOPES = [
    "openid", "email", "profile", "offline_access",
    "https://graph.microsoft.com/Mail.Read",
]

IMAP_HOSTS: Dict[str, tuple] = {
    "gmail":   ("imap.gmail.com", 993),
    "yahoo":   ("imap.mail.yahoo.com", 993),
    "outlook": ("outlook.office365.com", 993),
    "hotmail": ("outlook.office365.com", 993),
    "live":    ("outlook.office365.com", 993),
}

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class IMAPConnectRequest(BaseModel):
    provider: str          # "yahoo", "gmail", "other", etc.
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
    source_account: Optional[str] = None   # ← which email account this came from
    raw_snippet: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# CONNECTION ID HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def _conn_id(user_id: str, provider: str, email_address: str) -> str:
    """
    Unique key for a connection record.
    Using (user_id + provider + email_address) instead of (user_id + provider)
    allows multiple Gmail / Outlook accounts per user.
    """
    return f"{user_id}::{provider}::{email_address.lower().strip()}"


# ═══════════════════════════════════════════════════════════════════════════════
# JWT QUERY-PARAM VALIDATOR (popup OAuth fix)
# ═══════════════════════════════════════════════════════════════════════════════

def _validate_token_param(token: str) -> str:
    """
    Validate a JWT passed as ?token= query param.
    Popups opened via window.open() cannot send Authorization headers,
    so the frontend appends the stored token to the popup URL instead.
    Returns user_id on success, raises HTTP 401 on failure.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token. Please log in again.",
        )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
            )
        return user_id
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(exc)}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# EVENT EXTRACTION ENGINE  (unchanged from previous version)
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
        from dateutil import parser as dateutil_parser
        return dateutil_parser.parse(text, fuzzy=True).date().isoformat()
    except Exception:
        return None


def _parse_time_from_text(text: str) -> Optional[str]:
    m = re.search(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)?\b", text)
    if m:
        h, mn = int(m.group(1)), int(m.group(2))
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
    for pat in [
        r"(?:venue|location|place|address|held at|at)\s*[:\-]?\s*([^\n,]{5,80})",
        r"(?:zoom link|meet link|teams link|join at|join here)\s*[:\-]?\s*(https?://[^\s]{10,120})",
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
        date_val = _parse_date_from_text(chunk)
        if not date_val or date_val in seen_dates:
            continue
        try:
            if date.fromisoformat(date_val) < date.today() - timedelta(days=30):
                continue
        except Exception:
            continue

        seen_dates.add(date_val)
        clean_subject = re.sub(r"^(re:|fwd?:|fw:)\s*", "", subject, flags=re.IGNORECASE).strip()
        events.append(ExtractedEvent(
            title=clean_subject or f"{_detect_event_type(body_text, subject).title()} on {date_val}",
            event_type=_detect_event_type(body_text, subject),
            date=date_val,
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
                parts.append(_strip_html(raw) if ct == "text/html" else raw if ct == "text/plain" else "")
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
        host_port = IMAP_HOSTS.get(key)
        if not host_port:
            raise ValueError(f"Unknown provider '{provider}'. Please supply imap_host.")
        imap_host, imap_port = host_port

    try:
        mail = imaplib.IMAP4_SSL(imap_host, imap_port)
        mail.login(email_address, app_password)
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"IMAP login failed for {email_address}: {str(exc)}. Use an App Password.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"IMAP connection error for {email_address}: {str(exc)}",
        )

    mail.select("INBOX")
    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
    search_status, messages = mail.search(None, f'(SINCE "{since_date}")')
    if search_status != "OK":
        mail.logout()
        return []

    msg_ids = messages[0].split()[-max_emails:]
    all_events: List[ExtractedEvent] = []

    for mid in reversed(msg_ids):
        try:
            fetch_status, data = mail.fetch(mid, "(RFC822)")
            if fetch_status != "OK":
                continue
            msg        = email_lib.message_from_bytes(data[0][1])
            subject    = _decode_header_value(msg.get("Subject", ""))
            from_addr  = _decode_header_value(msg.get("From", ""))
            email_date = _decode_header_value(msg.get("Date", ""))
            body_text  = _get_email_text(msg)
            all_events.extend(
                extract_events_from_email_body(
                    subject, body_text, from_addr, email_date,
                    source_account=email_address,
                )
            )
        except Exception as exc:
            logger.warning(f"Failed to parse IMAP email {mid} ({email_address}): {exc}")
            continue

    mail.logout()
    return all_events


# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE OAUTH2  — multiple accounts support
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/auth/google")
async def google_auth_start(
    token: str = Query(..., description="JWT — passed as query param because popups can't send headers"),
    account_hint: Optional[str] = Query(None, description="Pre-select Google account email"),
):
    """
    Start Google OAuth2 flow for ONE Gmail account.
    Call this endpoint multiple times (one popup per account) to connect
    multiple Gmail accounts. Each connected account is stored as a separate
    document keyed by (user_id, provider, email_address).

    The ?account_hint= param pre-fills the Google account chooser so the user
    doesn't have to manually pick which Gmail account to authorise.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="GOOGLE_CLIENT_ID not set in .env")

    user_id = _validate_token_param(token)

    # Encode user_id + account_hint in state so callback knows which user/account
    state_val = f"{user_id}|||{account_hint or ''}"

    scope = " ".join(GOOGLE_SCOPES)
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scope}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={state_val}"
    )
    # If account_hint provided, pre-fill the Google account chooser
    if account_hint:
        url += f"&login_hint={account_hint}"

    return RedirectResponse(url)


@router.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    """
    Google OAuth2 callback.
    Stores connection keyed by (user_id, provider, email_address) so multiple
    Gmail accounts per user are each stored as separate documents.
    """
    # Decode state: "user_id|||account_hint"
    parts   = state.split("|||", 1)
    user_id = parts[0]

    async with httpx.AsyncClient() as client:
        try:
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
            token_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(f"Google token exchange failed: {exc.response.text}")
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    tokens = token_resp.json()

    # Fetch the actual email address from Google's userinfo endpoint
    try:
        ui_resp = await _fetch_google_userinfo(tokens["access_token"])
        email_address = ui_resp.get("email", "unknown@gmail.com")
    except Exception:
        email_address = "unknown@gmail.com"

    conn_key = _conn_id(user_id, "google", email_address)

    await db.email_connections.update_one(
        {"conn_id": conn_key},
        {"$set": {
            "conn_id": conn_key,
            "user_id": user_id,
            "provider": "google",
            "method": "oauth",
            "email_address": email_address,
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
            ).isoformat(),
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    logger.info(f"Gmail connected: user={user_id} email={email_address}")
    return RedirectResponse(
        f"{FRONTEND_URL}/attendance?email_connected=google&account={email_address}"
    )


async def _fetch_google_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def _refresh_google_token(conn: dict) -> str:
    """Refresh an expired Google access token. Updates the DB record."""
    user_id       = conn["user_id"]
    email_address = conn.get("email_address", "")
    conn_key      = conn["conn_id"]

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "refresh_token": conn["refresh_token"],
                    "grant_type": "refresh_token",
                },
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(f"Google refresh failed for {email_address}: {exc.response.text}")
            raise HTTPException(
                status_code=401,
                detail=f"Google token refresh failed for {email_address}. Please reconnect.",
            )

    tokens     = resp.json()
    new_access = tokens["access_token"]
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
    ).isoformat()
    await db.email_connections.update_one(
        {"conn_id": conn_key},
        {"$set": {"access_token": new_access, "expires_at": expires_at}},
    )
    return new_access


async def _get_valid_google_token(conn: dict) -> str:
    """Return a valid (possibly refreshed) access token for a Gmail connection."""
    expires_at = datetime.fromisoformat(conn["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
        return await _refresh_google_token(conn)
    return conn["access_token"]


def _extract_gmail_body(payload: dict) -> str:
    parts_text = []
    mime_type = payload.get("mimeType", "")
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            parts_text.append(
                base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            )
    elif mime_type == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            raw = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            parts_text.append(_strip_html(raw))
    for part in payload.get("parts", []):
        parts_text.append(_extract_gmail_body(part))
    return "\n".join(filter(None, parts_text))


async def fetch_events_via_gmail_api(
    conn: dict,
    days_back: int = 30,
    max_emails: int = 50,
) -> List[ExtractedEvent]:
    """Fetch events from ONE Gmail account (connection record)."""
    access_token  = await _get_valid_google_token(conn)
    email_address = conn.get("email_address", "unknown")
    headers       = {"Authorization": f"Bearer {access_token}"}
    since_epoch   = int((datetime.now() - timedelta(days=days_back)).timestamp())

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            list_resp = await client.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers=headers,
                params={"q": f"after:{since_epoch}", "maxResults": max_emails, "labelIds": "INBOX"},
            )
            list_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(f"Gmail list failed for {email_address}: {exc.response.text}")
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=str(exc))

        messages   = list_resp.json().get("messages", [])
        all_events: List[ExtractedEvent] = []

        for msg_meta in messages:
            try:
                msg_resp = await client.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_meta['id']}",
                    headers=headers,
                    params={"format": "full"},
                )
                msg_resp.raise_for_status()
                payload      = msg_resp.json().get("payload", {})
                headers_list = payload.get("headers", [])

                def _hdr(name: str) -> str:
                    return next(
                        (h["value"] for h in headers_list if h["name"].lower() == name.lower()), ""
                    )

                all_events.extend(
                    extract_events_from_email_body(
                        _hdr("Subject"), _extract_gmail_body(payload),
                        _hdr("From"), _hdr("Date"),
                        source_account=email_address,
                    )
                )
            except Exception as exc:
                logger.warning(f"Gmail parse error {msg_meta.get('id')} ({email_address}): {exc}")
                continue

    return all_events


# ═══════════════════════════════════════════════════════════════════════════════
# MICROSOFT OAUTH2  — multiple accounts support
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/auth/microsoft")
async def microsoft_auth_start(
    token: str = Query(..., description="JWT — passed as query param because popups can't send headers"),
    account_hint: Optional[str] = Query(None, description="Pre-select Outlook account email"),
):
    """
    Start Microsoft OAuth2 flow for ONE Outlook account.
    Call multiple times to connect multiple Outlook accounts.
    """
    if not MICROSOFT_CLIENT_ID:
        raise HTTPException(status_code=400, detail="MICROSOFT_CLIENT_ID not set in .env")

    user_id   = _validate_token_param(token)
    state_val = f"{user_id}|||{account_hint or ''}"
    scope     = " ".join(MICROSOFT_SCOPES)
    url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        f"?client_id={MICROSOFT_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={MICROSOFT_REDIRECT_URI}"
        f"&scope={scope}"
        f"&state={state_val}"
    )
    if account_hint:
        url += f"&login_hint={account_hint}"
    return RedirectResponse(url)


@router.get("/auth/microsoft/callback")
async def microsoft_auth_callback(code: str, state: str):
    parts   = state.split("|||", 1)
    user_id = parts[0]

    async with httpx.AsyncClient() as client:
        try:
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
            token_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    tokens = token_resp.json()

    # Fetch the actual email address from Microsoft Graph
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            me_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            me_resp.raise_for_status()
            email_address = me_resp.json().get("mail") or me_resp.json().get("userPrincipalName", "unknown@outlook.com")
    except Exception:
        email_address = "unknown@outlook.com"

    conn_key = _conn_id(user_id, "microsoft", email_address)

    await db.email_connections.update_one(
        {"conn_id": conn_key},
        {"$set": {
            "conn_id": conn_key,
            "user_id": user_id,
            "provider": "microsoft",
            "method": "oauth",
            "email_address": email_address,
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
            ).isoformat(),
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return RedirectResponse(
        f"{FRONTEND_URL}/attendance?email_connected=microsoft&account={email_address}"
    )


async def _get_valid_microsoft_token(conn: dict) -> str:
    expires_at = datetime.fromisoformat(conn["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
        email_address = conn.get("email_address", "")
        async with httpx.AsyncClient() as client:
            try:
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
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=401,
                    detail=f"Microsoft refresh failed for {email_address}. Please reconnect.",
                )

        tokens = resp.json()
        await db.email_connections.update_one(
            {"conn_id": conn["conn_id"]},
            {"$set": {
                "access_token": tokens["access_token"],
                "expires_at": (
                    datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
                ).isoformat(),
            }},
        )
        return tokens["access_token"]

    return conn["access_token"]


async def fetch_events_via_outlook_api(
    conn: dict,
    days_back: int = 30,
    max_emails: int = 50,
) -> List[ExtractedEvent]:
    access_token  = await _get_valid_microsoft_token(conn)
    email_address = conn.get("email_address", "unknown")
    headers       = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    since         = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")

    async with httpx.AsyncClient(timeout=30) as client:
        try:
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
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=500, detail=str(exc))

        all_events: List[ExtractedEvent] = []
        for msg in resp.json().get("value", []):
            try:
                body_raw  = msg.get("body", {}).get("content", "")
                body_type = msg.get("body", {}).get("contentType", "text")
                all_events.extend(
                    extract_events_from_email_body(
                        msg.get("subject", ""),
                        _strip_html(body_raw) if body_type == "html" else body_raw,
                        msg.get("from", {}).get("emailAddress", {}).get("address", ""),
                        msg.get("receivedDateTime", ""),
                        source_account=email_address,
                    )
                )
            except Exception as exc:
                logger.warning(f"Outlook parse error ({email_address}): {exc}")
        return all_events


# ═══════════════════════════════════════════════════════════════════════════════
# API ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/connections")
async def get_email_connections(current_user: User = Depends(get_current_user)):
    """
    Return all email connections for the current user.
    Multiple Gmail / Outlook accounts each appear as separate entries.
    Sensitive fields (tokens, passwords) are excluded.
    """
    conns = await db.email_connections.find(
        {"user_id": current_user.id},
        {"_id": 0, "access_token": 0, "refresh_token": 0, "app_password_enc": 0, "conn_id": 0},
    ).to_list(50)
    return {"connections": conns, "total": len(conns)}


@router.delete("/connections/{provider}/{email_address:path}")
async def disconnect_email(
    provider: str,
    email_address: str,
    current_user: User = Depends(get_current_user),
):
    """
    Disconnect a specific email account.
    DELETE /api/email/connections/google/me@gmail.com
    """
    conn_key = _conn_id(current_user.id, provider, email_address)
    result   = await db.email_connections.delete_one({"conn_id": conn_key})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No connection found for {provider} / {email_address}",
        )
    return {"message": f"{email_address} ({provider}) disconnected"}


@router.delete("/connections/{provider}")
async def disconnect_all_provider_accounts(
    provider: str,
    current_user: User = Depends(get_current_user),
):
    """Disconnect ALL accounts for a given provider (e.g. all Gmail accounts)."""
    result = await db.email_connections.delete_many(
        {"user_id": current_user.id, "provider": provider}
    )
    return {"message": f"Disconnected {result.deleted_count} {provider} account(s)"}


@router.post("/connect/imap")
async def connect_imap(
    payload: IMAPConnectRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Connect a Yahoo / custom IMAP account.
    Multiple IMAP accounts (different email addresses) are each stored separately.
    """
    host = payload.imap_host
    port = payload.imap_port

    if not host:
        key = payload.provider.lower().split("@")[-1].split(".")[0]
        host_port = IMAP_HOSTS.get(key)
        if host_port:
            host, port = host_port
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot auto-detect IMAP host for '{payload.provider}'. Supply imap_host.",
            )

    # Test connection before saving
    try:
        mail = imaplib.IMAP4_SSL(host, port)
        mail.login(payload.email_address, payload.app_password)
        mail.logout()
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=401,
            detail=f"IMAP login failed for {payload.email_address}: {str(exc)}. Use an App Password.",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    conn_key = _conn_id(current_user.id, payload.provider, payload.email_address)
    await db.email_connections.update_one(
        {"conn_id": conn_key},
        {"$set": {
            "conn_id": conn_key,
            "user_id": current_user.id,
            "provider": payload.provider,
            "method": "imap",
            "email_address": payload.email_address,
            "app_password_enc": payload.app_password,  # TODO: encrypt in production
            "imap_host": host,
            "imap_port": port,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": f"{payload.email_address} connected via IMAP"}


@router.get("/fetch-events")
async def fetch_email_events(
    provider: Optional[str] = Query(None, description="Filter by provider (google/microsoft/yahoo)"),
    account: Optional[str]  = Query(None, description="Filter by specific email address"),
    days_back: int  = Query(30, ge=1, le=90),
    max_emails: int = Query(50, ge=5, le=200),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch and extract events from ALL connected email accounts in parallel.
    Supports multiple Gmail accounts, multiple Outlook accounts, multiple IMAP accounts.

    Optional filters:
      ?provider=google          → only Gmail accounts
      ?account=me@gmail.com     → only that specific account
    """
    query: dict = {"user_id": current_user.id}
    if provider:
        query["provider"] = provider
    if account:
        query["email_address"] = account.lower().strip()

    conns = await db.email_connections.find(query, {"_id": 0}).to_list(50)
    if not conns:
        raise HTTPException(
            status_code=404,
            detail="No email accounts connected. Connect at least one account first.",
        )

    # ── Fan out across ALL accounts in parallel ──────────────────────────────
    async def _fetch_one(conn: dict) -> tuple[List[ExtractedEvent], Optional[str]]:
        """Returns (events, error_string | None) for one connection."""
        prov   = conn["provider"]
        method = conn.get("method", "oauth")
        ea     = conn.get("email_address", prov)
        try:
            if prov == "google" and method == "oauth":
                events = await fetch_events_via_gmail_api(conn, days_back, max_emails)
            elif prov == "microsoft" and method == "oauth":
                events = await fetch_events_via_outlook_api(conn, days_back, max_emails)
            elif method == "imap":
                # IMAP is blocking — run in thread pool to avoid blocking the event loop
                loop   = asyncio.get_event_loop()
                events = await loop.run_in_executor(
                    None,
                    lambda: fetch_events_via_imap(
                        provider=prov,
                        email_address=conn["email_address"],
                        app_password=conn["app_password_enc"],
                        imap_host=conn.get("imap_host"),
                        imap_port=conn.get("imap_port", 993),
                        days_back=days_back,
                        max_emails=max_emails,
                    ),
                )
            else:
                return [], f"{ea}: unsupported method '{method}'"
            return events, None
        except HTTPException as exc:
            return [], f"{ea}: {exc.detail}"
        except Exception as exc:
            logger.error(f"Fetch error for {ea}: {exc}", exc_info=True)
            return [], f"{ea}: unexpected error — {str(exc)}"

    results = await asyncio.gather(*[_fetch_one(c) for c in conns])

    all_events: List[ExtractedEvent] = []
    errors: List[str] = []
    for events, err in results:
        all_events.extend(events)
        if err:
            errors.append(err)

    # Deduplicate on (title, date, time, location, source_account)
    seen: set = set()
    unique_events: List[ExtractedEvent] = []
    for ev in all_events:
        key = (ev.title.lower(), ev.date, ev.time, ev.location, ev.source_account)
        if key not in seen:
            seen.add(key)
            unique_events.append(ev)

    urgency_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    unique_events.sort(key=lambda e: (
        e.date or "9999-12-31",
        urgency_order.get(e.urgency, 3),
    ))

    return {
        "events":            [ev.model_dump() for ev in unique_events],
        "total":             len(unique_events),
        "accounts_scanned":  [c.get("email_address", c["provider"]) for c in conns],
        "errors":            errors,
    }
