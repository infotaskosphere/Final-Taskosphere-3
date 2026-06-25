"""
email_integration.py — Email account connections, OAuth, scanning and import cache.

Fixes the /api/email/* 404s used by:
  • frontend/src/components/EmailSettings.jsx
  • frontend/src/pages/ActionCenter.jsx

The module supports:
  • IMAP app-password connections for Gmail/Outlook/Yahoo/custom mailboxes
  • Gmail "Connect with Google" OAuth, similar to sign-in flows
  • Cached extracted email events for Action Center
  • Save-as-todo and save-as-visit endpoints used by the preview panels
"""

import base64
import email
import hashlib
import hmac
import imaplib
import json
import logging
import os
import re
import uuid
from datetime import datetime, date, timezone, timedelta
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict

from backend.dependencies import db, get_current_user
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email", tags=["email"])

# server.py imports this symbol defensively for legacy AI extraction hooks.
_gemini = None

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://final-taskosphere-frontend.onrender.com").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "https://final-taskosphere-backend.onrender.com").rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_EMAIL_REDIRECT_URI = (
    os.getenv("GOOGLE_EMAIL_REDIRECT_URI")
    or f"{BACKEND_URL}/api/email/oauth/google/callback"
)
STATE_SECRET = os.getenv("JWT_SECRET") or GOOGLE_CLIENT_SECRET or "taskosphere-email-oauth"

GMAIL_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
]


# ═══════════════════════════════════════════════════════════════════════════════
# Models
# ═══════════════════════════════════════════════════════════════════════════════

class EmailConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email_address: str
    app_password: str
    imap_host: Optional[str] = None
    imap_port: int = 993
    label: Optional[str] = None
    linked_page: str = "all"
    auto_sync: bool = False


class EmailConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: Optional[str] = None
    linked_page: Optional[str] = None
    auto_sync: Optional[bool] = None
    is_active: Optional[bool] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None


class SaveTodoRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    remind_at: Optional[str] = None
    due_date: Optional[str] = None
    email_account: Optional[str] = None


class SaveVisitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: Optional[str] = None
    title: str
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    email_account: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _uid(user: User) -> str:
    return str(getattr(user, "id", ""))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalise_email(value: str) -> str:
    value = (value or "").strip().lower()
    if not value or "@" not in value:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    return value


def _infer_provider(address: str) -> str:
    domain = address.split("@")[-1].lower()
    if domain in {"gmail.com", "googlemail.com"}:
        return "gmail"
    if domain in {"outlook.com", "hotmail.com", "live.com", "msn.com"}:
        return "outlook"
    if domain in {"yahoo.com", "ymail.com", "rocketmail.com"}:
        return "yahoo"
    if domain in {"icloud.com", "me.com", "mac.com"}:
        return "icloud"
    return "other"


def _default_imap_host(address: str) -> str:
    provider = _infer_provider(address)
    return {
        "gmail": "imap.gmail.com",
        "outlook": "outlook.office365.com",
        "yahoo": "imap.mail.yahoo.com",
        "icloud": "imap.mail.me.com",
    }.get(provider, f"imap.{address.split('@')[-1]}")


def _clean_connection(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = dict(doc or {})
    doc.pop("_id", None)
    doc.pop("app_password", None)
    doc.pop("access_token", None)
    doc.pop("refresh_token", None)
    doc["oauth_connected"] = doc.get("provider_type") == "google_oauth"
    return doc


def _decode_mime(value: Optional[str]) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _message_body(msg: email.message.Message) -> str:
    parts: List[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition", "")).lower()
            if "attachment" in disp or ctype not in {"text/plain", "text/html"}:
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            text = payload.decode(charset, errors="replace")
            if ctype == "text/html":
                text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
                text = re.sub(r"<[^>]+>", " ", text)
            parts.append(text)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            parts.append(payload.decode(charset, errors="replace"))
    text = "\n".join(parts)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:12000]


def _parse_email_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def _parse_date_candidate(raw: str) -> Optional[str]:
    raw = (raw or "").strip()
    today = date.today()
    if raw.lower() == "today":
        return today.isoformat()
    if raw.lower() == "tomorrow":
        return (today + timedelta(days=1)).isoformat()

    for fmt in (
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
        "%Y-%m-%d", "%d %b %Y", "%d %B %Y",
        "%b %d %Y", "%B %d %Y", "%d %b, %Y", "%d %B, %Y",
        "%b %d, %Y", "%B %d, %Y",
    ):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except Exception:
            pass
    return None


def _extract_dates(text: str) -> List[str]:
    if not text:
        return []

    month = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b",
        r"\b\d{4}-\d{1,2}-\d{1,2}\b",
        rf"\b\d{{1,2}}\s+{month},?\s+\d{{4}}\b",
        rf"\b{month}\s+\d{{1,2}},?\s+\d{{4}}\b",
        r"\b(?:today|tomorrow)\b",
    ]

    found: List[str] = []
    seen = set()
    for pat in patterns:
        for match in re.finditer(pat, text, flags=re.I):
            parsed = _parse_date_candidate(match.group(0))
            if parsed and parsed not in seen:
                seen.add(parsed)
                found.append(parsed)
    return found[:6]


def _extract_time(text: str) -> Optional[str]:
    m = re.search(r"\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b", text, flags=re.I)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or "00")
    suffix = (m.group(3) or "").lower()
    if suffix == "pm" and hour < 12:
        hour += 12
    if suffix == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def _classify_event(subject: str, body: str) -> Dict[str, str]:
    text = f"{subject} {body}".lower()
    if any(k in text for k in ["meeting", "appointment", "visit", "conference", "interview"]):
        event_type = "Meeting"
        save_category = "visit"
    elif any(k in text for k in ["submit", "reply", "file ", "filing", "payment", "action required"]):
        event_type = "Action Required"
        save_category = "todo"
    elif any(k in text for k in ["hearing", "deadline", "due date", "notice", "renewal"]):
        event_type = "Deadline"
        save_category = "reminder"
    else:
        event_type = "Reminder"
        save_category = "reminder"

    urgency = "high" if any(k in text for k in ["urgent", "hearing", "deadline", "last date", "today", "tomorrow"]) else "medium"
    return {"event_type": event_type, "save_category": save_category, "urgency": urgency}


def _event_from_message(
    *,
    user_id: str,
    email_account: str,
    message_id: str,
    subject: str,
    sender: str,
    sent_at: Optional[str],
    body: str,
) -> List[Dict[str, Any]]:
    text = f"{subject}\n{body}"
    dates = _extract_dates(text)
    if not dates:
        return []

    meta = _classify_event(subject, body)
    time_value = _extract_time(text)
    events: List[Dict[str, Any]] = []

    for idx, event_date in enumerate(dates):
        raw_key = f"{user_id}|{email_account}|{message_id}|{event_date}|{idx}|{subject}"
        event_id = hashlib.sha1(raw_key.encode("utf-8")).hexdigest()
        events.append({
            "id": event_id,
            "event_id": event_id,
            "user_id": user_id,
            "email_account": email_account,
            "message_id": message_id,
            "title": subject[:180] or meta["event_type"],
            "description": body[:700],
            "date": event_date,
            "time": time_value,
            "event_type": meta["event_type"],
            "save_category": meta["save_category"],
            "urgency": meta["urgency"],
            "source": "email",
            "source_subject": subject,
            "source_from": sender,
            "source_sent_at": sent_at,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return events


def _serialise_event(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = dict(doc or {})
    doc.pop("_id", None)
    return doc


def _imap_search_since(since_date: Optional[str]) -> str:
    if since_date:
        try:
            dt = datetime.fromisoformat(str(since_date).replace("Z", "+00:00"))
        except Exception:
            try:
                dt = datetime.strptime(str(since_date)[:10], "%Y-%m-%d")
            except Exception:
                dt = datetime.now(timezone.utc) - timedelta(days=30)
    else:
        dt = datetime.now(timezone.utc) - timedelta(days=30)
    return dt.strftime("%d-%b-%Y")


def _test_imap_connection(address: str, password: str, host: str, port: int) -> None:
    try:
        mail = imaplib.IMAP4_SSL(host, int(port), timeout=20)
        mail.login(address, password)
        mail.select("INBOX")
        mail.logout()
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=400,
            detail="Authentication failed. Use an app password and make sure IMAP is enabled.",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not connect to IMAP server: {exc}") from exc


def _fetch_imap_events(conn: Dict[str, Any], user_id: str, limit: int, since_date: Optional[str]) -> List[Dict[str, Any]]:
    address = conn["email_address"]
    host = conn.get("imap_host") or _default_imap_host(address)
    port = int(conn.get("imap_port") or 993)
    password = conn.get("app_password") or ""
    if not password:
        raise HTTPException(status_code=400, detail=f"No app password saved for {address}")

    try:
        mail = imaplib.IMAP4_SSL(host, port, timeout=30)
        mail.login(address, password)
        mail.select("INBOX")
        status, data = mail.search(None, "SINCE", _imap_search_since(since_date))
        if status != "OK":
            return []
        ids = (data[0] or b"").split()
        ids = ids[-max(limit * 3, limit):]

        events: List[Dict[str, Any]] = []
        for msg_id in reversed(ids):
            if len(events) >= limit:
                break
            status, fetched = mail.fetch(msg_id, "(RFC822)")
            if status != "OK" or not fetched:
                continue
            raw = None
            for item in fetched:
                if isinstance(item, tuple):
                    raw = item[1]
                    break
            if not raw:
                continue
            msg = email.message_from_bytes(raw)
            subject = _decode_mime(msg.get("Subject")) or "(No subject)"
            sender = _decode_mime(msg.get("From"))
            message_id = (msg.get("Message-ID") or f"{address}-{msg_id.decode()}").strip()
            sent_at = _parse_email_date(msg.get("Date"))
            body = _message_body(msg)
            events.extend(_event_from_message(
                user_id=user_id,
                email_account=address,
                message_id=message_id,
                subject=subject,
                sender=sender,
                sent_at=sent_at,
                body=body,
            ))
        mail.logout()
        return events[:limit]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Email scan failed for {address}: {exc}") from exc


def _build_state(payload: Dict[str, Any]) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    sig = hmac.new(STATE_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _read_state(state: str) -> Dict[str, Any]:
    try:
        body, sig = state.rsplit(".", 1)
        expected = hmac.new(STATE_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        return json.loads(base64.urlsafe_b64decode(body.encode()).decode())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc


def _oauth_flow(state: Optional[str] = None):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=501,
            detail="Google email OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_EMAIL_REDIRECT_URI.",
        )
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GMAIL_SCOPES,
        state=state,
        redirect_uri=GOOGLE_EMAIL_REDIRECT_URI,
    )
    return flow


def _fetch_gmail_events(conn: Dict[str, Any], user_id: str, limit: int, since_date: Optional[str]) -> List[Dict[str, Any]]:
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request as GoogleRequest
        from googleapiclient.discovery import build
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Google API packages are not installed") from exc

    refresh_token = conn.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=400, detail=f"Google refresh token missing for {conn.get('email_address')}")

    creds = Credentials(
        token=conn.get("access_token"),
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )
    if not creds.valid and creds.refresh_token:
        creds.refresh(GoogleRequest())

    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    if since_date:
        after = str(since_date)[:10].replace("-", "/")
        query = f"after:{after}"
    else:
        query = "newer_than:30d"

    listed = service.users().messages().list(userId="me", q=query, maxResults=limit).execute()
    messages = listed.get("messages", []) or []
    events: List[Dict[str, Any]] = []

    for item in messages:
        if len(events) >= limit:
            break
        msg = service.users().messages().get(userId="me", id=item["id"], format="full").execute()
        headers = {h["name"].lower(): h.get("value", "") for h in msg.get("payload", {}).get("headers", [])}
        subject = _decode_mime(headers.get("subject")) or "(No subject)"
        sender = _decode_mime(headers.get("from"))
        sent_at = _parse_email_date(headers.get("date"))
        message_id = headers.get("message-id") or item["id"]
        body = _gmail_payload_text(msg.get("payload", {})) or msg.get("snippet", "")
        events.extend(_event_from_message(
            user_id=user_id,
            email_account=conn["email_address"],
            message_id=message_id,
            subject=subject,
            sender=sender,
            sent_at=sent_at,
            body=body,
        ))

    return events[:limit]


def _gmail_payload_text(payload: Dict[str, Any]) -> str:
    chunks: List[str] = []

    def walk(part: Dict[str, Any]):
        mime = part.get("mimeType")
        body = part.get("body", {}) or {}
        data = body.get("data")
        if data and mime in {"text/plain", "text/html"}:
            try:
                raw = base64.urlsafe_b64decode(data.encode())
                text = raw.decode("utf-8", errors="replace")
                if mime == "text/html":
                    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
                    text = re.sub(r"<[^>]+>", " ", text)
                chunks.append(text)
            except Exception:
                pass
        for child in part.get("parts", []) or []:
            walk(child)

    walk(payload)
    return re.sub(r"\s+", " ", "\n".join(chunks)).strip()[:12000]


async def _cache_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cached: List[Dict[str, Any]] = []
    for ev in events:
        insert_doc = dict(ev)
        insert_doc.pop("updated_at", None)
        await db.email_imported_events.update_one(
            {"user_id": ev["user_id"], "id": ev["id"]},
            {"$setOnInsert": insert_doc, "$set": {"updated_at": _now_iso()}},
            upsert=True,
        )
        doc = await db.email_imported_events.find_one({"user_id": ev["user_id"], "id": ev["id"]})
        cached.append(_serialise_event(doc or ev))
    return cached


# ═══════════════════════════════════════════════════════════════════════════════
# Connection routes
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/connections")
async def list_connections(current_user: User = Depends(get_current_user)):
    cursor = db.email_connections.find({"user_id": _uid(current_user)}).sort("created_at", -1)
    docs = [_clean_connection(doc) async for doc in cursor]
    return {"connections": docs}


@router.post("/connections")
async def create_connection(body: EmailConnectionCreate, current_user: User = Depends(get_current_user)):
    address = _normalise_email(body.email_address)
    host = body.imap_host or _default_imap_host(address)
    port = int(body.imap_port or 993)
    password = (body.app_password or "").strip()
    if not password:
        raise HTTPException(status_code=400, detail="App Password is required")

    _test_imap_connection(address, password, host, port)

    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": _uid(current_user),
        "email_address": address,
        "provider": _infer_provider(address),
        "provider_type": "imap",
        "imap_host": host,
        "imap_port": port,
        "app_password": password,
        "label": body.label or address,
        "linked_page": body.linked_page or "all",
        "auto_sync": bool(body.auto_sync),
        "is_active": True,
        "status": "connected",
        "last_error": None,
        "last_synced": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.email_connections.update_one(
        {"user_id": _uid(current_user), "email_address": address},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "connection": _clean_connection(doc)}


@router.patch("/connections/{email_address}")
async def update_connection(
    email_address: str,
    body: EmailConnectionUpdate,
    current_user: User = Depends(get_current_user),
):
    address = _normalise_email(email_address)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return {"ok": True}
    updates["updated_at"] = _now_iso()
    result = await db.email_connections.update_one(
        {"user_id": _uid(current_user), "email_address": address},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Email connection not found")
    return {"ok": True}


@router.delete("/connections/{email_address}")
async def delete_connection(email_address: str, current_user: User = Depends(get_current_user)):
    address = _normalise_email(email_address)
    await db.email_connections.delete_one({"user_id": _uid(current_user), "email_address": address})
    return {"ok": True}


@router.post("/connections/{email_address}/test")
async def test_connection(email_address: str, current_user: User = Depends(get_current_user)):
    address = _normalise_email(email_address)
    conn = await db.email_connections.find_one({"user_id": _uid(current_user), "email_address": address})
    if not conn:
        raise HTTPException(status_code=404, detail="Email connection not found")

    if conn.get("provider_type") == "google_oauth":
        _fetch_gmail_events(conn, _uid(current_user), limit=1, since_date=date.today().isoformat())
    else:
        _test_imap_connection(address, conn.get("app_password") or "", conn.get("imap_host") or _default_imap_host(address), int(conn.get("imap_port") or 993))

    await db.email_connections.update_one(
        {"_id": conn["_id"]},
        {"$set": {"status": "connected", "last_error": None, "updated_at": _now_iso()}},
    )
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# Gmail OAuth routes
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/oauth/google/start")
async def google_oauth_start(
    linked_page: str = "all",
    auto_sync: bool = False,
    label: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    payload = {
        "user_id": _uid(current_user),
        "linked_page": linked_page or "all",
        "auto_sync": bool(auto_sync),
        "label": label or "",
        "ts": int(datetime.now(timezone.utc).timestamp()),
    }
    state = _build_state(payload)
    flow = _oauth_flow(state)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    return {"auth_url": auth_url}


@router.get("/oauth/google/callback")
async def google_oauth_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/settings/email?email=denied")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/settings/email?email=error")

    try:
        state_data = _read_state(state)
        flow = _oauth_flow(state)
        flow.fetch_token(code=code)
        creds = flow.credentials

        if not creds.refresh_token:
            return RedirectResponse(f"{FRONTEND_URL}/settings/email?email=error&reason=no_refresh_token")

        import requests

        profile = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=20,
        ).json()
        address = _normalise_email(profile.get("email") or "")
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": state_data["user_id"],
            "email_address": address,
            "provider": "gmail",
            "provider_type": "google_oauth",
            "label": state_data.get("label") or f"Gmail — {address}",
            "linked_page": state_data.get("linked_page") or "all",
            "auto_sync": bool(state_data.get("auto_sync")),
            "is_active": True,
            "status": "connected",
            "last_error": None,
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "last_synced": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.email_connections.update_one(
            {"user_id": state_data["user_id"], "email_address": address},
            {"$set": doc},
            upsert=True,
        )
        return RedirectResponse(f"{FRONTEND_URL}/settings/email?email=connected")
    except Exception as exc:
        logger.exception("Gmail OAuth callback failed")
        return RedirectResponse(f"{FRONTEND_URL}/settings/email?email=error&reason={str(exc)[:80]}")


# ═══════════════════════════════════════════════════════════════════════════════
# Event scanning/cache routes
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/importer/events")
async def list_imported_events(
    limit: int = Query(200, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    cursor = (
        db.email_imported_events
        .find({"user_id": _uid(current_user)})
        .sort([("date", 1), ("created_at", -1)])
        .limit(limit)
    )
    return [_serialise_event(doc) async for doc in cursor]


@router.get("/extract-events")
async def extract_events(
    force_refresh: bool = False,
    limit: int = Query(100, ge=1, le=500),
    since_date: Optional[str] = None,
    email: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    user_id = _uid(current_user)

    if not force_refresh:
        cursor = (
            db.email_imported_events
            .find({"user_id": user_id})
            .sort([("date", 1), ("created_at", -1)])
            .limit(limit)
        )
        return [_serialise_event(doc) async for doc in cursor]

    query: Dict[str, Any] = {"user_id": user_id, "is_active": {"$ne": False}}
    if email:
        query["email_address"] = _normalise_email(email)

    connections = await db.email_connections.find(query).to_list(length=50)
    if not connections:
        return []

    all_events: List[Dict[str, Any]] = []
    per_account_limit = max(1, min(limit, 300))

    for conn in connections:
        address = conn.get("email_address")
        try:
            if conn.get("provider_type") == "google_oauth":
                events = _fetch_gmail_events(conn, user_id, per_account_limit, since_date)
            else:
                events = _fetch_imap_events(conn, user_id, per_account_limit, since_date)
            all_events.extend(events)
            await db.email_connections.update_one(
                {"_id": conn["_id"]},
                {"$set": {"last_synced": _now_iso(), "status": "connected", "last_error": None, "updated_at": _now_iso()}},
            )
        except HTTPException as exc:
            await db.email_connections.update_one(
                {"_id": conn["_id"]},
                {"$set": {"status": "error", "last_error": exc.detail, "updated_at": _now_iso()}},
            )
            if email:
                raise
            logger.warning("Email scan failed for %s: %s", address, exc.detail)

    cached = await _cache_events(all_events[:limit])
    return cached


@router.delete("/events/clear-all")
async def clear_email_events(current_user: User = Depends(get_current_user)):
    result = await db.email_imported_events.delete_many({"user_id": _uid(current_user)})
    return {"ok": True, "deleted": result.deleted_count}


@router.delete("/events/{event_id}")
async def delete_email_event(event_id: str, current_user: User = Depends(get_current_user)):
    result = await db.email_imported_events.delete_one({"user_id": _uid(current_user), "id": event_id})
    if result.deleted_count == 0 and ObjectId.is_valid(event_id):
        await db.email_imported_events.delete_one({"user_id": _uid(current_user), "_id": ObjectId(event_id)})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# Save actions
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/save-as-todo")
async def save_as_todo(body: SaveTodoRequest, current_user: User = Depends(get_current_user)):
    now = _now_iso()
    due = body.due_date or body.remind_at
    if due and "T" in due:
        due = due[:10]

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": _uid(current_user),
        "title": body.title,
        "description": body.description or "",
        "is_completed": False,
        "status": "pending",
        "due_date": due,
        "source": "email_sync",
        "auto_imported": True,
        "event_id": body.event_id,
        "email_account": body.email_account,
        "created_at": now,
        "updated_at": now,
    }
    await db.todos.insert_one(doc)
    if body.event_id:
        await db.email_imported_events.update_one(
            {"user_id": _uid(current_user), "id": body.event_id},
            {"$set": {"saved_to": "todo", "saved_at": now}},
        )
    return {k: v for k, v in doc.items() if k != "_id"}


@router.post("/save-as-visit")
async def save_as_visit(body: SaveVisitRequest, current_user: User = Depends(get_current_user)):
    now = _now_iso()
    visit_date = body.visit_date or date.today().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": body.client_id or "",
        "client_name": body.client_name or "",
        "assigned_to": _uid(current_user),
        "created_by": _uid(current_user),
        "visit_date": visit_date[:10],
        "visit_time": body.visit_time,
        "purpose": body.title[:200],
        "services": [],
        "priority": "medium",
        "status": "scheduled",
        "notes": body.notes or body.description or "",
        "location": None,
        "recurrence": "none",
        "recurrence_end_date": None,
        "recurrence_weekday": None,
        "recurrence_week_number": None,
        "parent_visit_id": None,
        "outcome": None,
        "follow_up_date": None,
        "comments": [],
        "source": "email_manual",
        "event_id": body.event_id,
        "email_account": body.email_account,
        "created_at": now,
        "updated_at": now,
    }
    await db.visits.insert_one(doc)
    if body.event_id:
        await db.email_imported_events.update_one(
            {"user_id": _uid(current_user), "id": body.event_id},
            {"$set": {"saved_to": "visit", "saved_at": now}},
        )
    return {k: v for k, v in doc.items() if k != "_id"}


# Sender whitelist used by EmailSettings.
@router.get("/sender-whitelist")
async def get_sender_whitelist(current_user: User = Depends(get_current_user)):
    doc = await db.email_sender_whitelists.find_one({"user_id": _uid(current_user)})
    return {"senders": (doc or {}).get("senders", [])}


@router.put("/sender-whitelist")
async def put_sender_whitelist(payload: Dict[str, Any], current_user: User = Depends(get_current_user)):
    senders = payload.get("senders") if isinstance(payload, dict) else []
    if not isinstance(senders, list):
        raise HTTPException(status_code=400, detail="senders must be a list")
    await db.email_sender_whitelists.update_one(
        {"user_id": _uid(current_user)},
        {"$set": {"senders": senders, "updated_at": _now_iso()}},
        upsert=True,
    )
    return {"ok": True, "senders": senders}
