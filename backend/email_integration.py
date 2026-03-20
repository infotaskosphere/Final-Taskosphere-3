# =============================================================================
# email_integration.py
# FastAPI router — IMAP email connection management + AI event extraction
# Stack: FastAPI · MongoDB (motor) via db from backend.dependencies
#        · OpenAI gpt-4o-mini · imaplib · no OAuth needed
#
# Features:
#   - Connect multiple email accounts (Gmail, Outlook, Yahoo, iCloud, other)
#   - Test / pause / resume / disconnect accounts
#   - Scan inbox and extract events (hearings, meetings, deadlines) via AI
#   - Results can be used to create Reminders or Visits from the frontend
# =============================================================================

import imaplib
import email
import email.header
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

# ── exact same imports your server.py uses ───────────────────────────────────
from backend.dependencies import get_current_user, db
# ─────────────────────────────────────────────────────────────────────────────

# Optional: encrypt stored app passwords.
# Set EMAIL_ENCRYPT_KEY in Render env vars (44-char Fernet key).
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# If not set, passwords are stored as-is (still fine for a private internal tool).
try:
    from cryptography.fernet import Fernet
    import os as _os
    _fernet_key = _os.environ.get("EMAIL_ENCRYPT_KEY", "").encode()
    _fernet = Fernet(_fernet_key) if len(_fernet_key) == 44 else None
except Exception:
    _fernet = None

# Optional: OpenAI for richer event extraction.
# Set OPENAI_API_KEY in Render env vars.
# Falls back to regex heuristics if not set.
try:
    from openai import AsyncOpenAI
    import os as _os2
    _openai = AsyncOpenAI(api_key=_os2.environ.get("OPENAI_API_KEY", ""))
except Exception:
    _openai = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])

# =============================================================================
# IMAP provider defaults (auto-detected from email domain)
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
COL_CONNECTIONS = "email_connections"
COL_EVENTS      = "email_extracted_events"

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


# =============================================================================
# HELPERS — IMAP
# =============================================================================

def _infer_provider(email_address: str):
    """Return (imap_host, imap_port, provider_id) from email domain."""
    domain = email_address.split("@")[-1].lower()
    return PROVIDER_IMAP.get(domain, (f"imap.{domain}", 993, "other"))


def _test_imap(host: str, port: int, email_addr: str, password: str) -> None:
    """
    Open IMAP SSL and attempt LOGIN.
    Raises HTTPException(400) with a clear message on failure.
    """
    try:
        conn = imaplib.IMAP4_SSL(host, int(port))
        conn.login(email_addr, password)
        conn.logout()
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"IMAP login failed: {exc}. "
                "Check that IMAP is enabled in your email settings "
                "and that you are using an App Password (not your login password)."
            ),
        )
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reach mail server {host}:{port} — {exc}",
        )


def _decode_header_str(raw: str) -> str:
    """Decode RFC-2047 encoded email header to plain string."""
    if not raw:
        return ""
    parts = email.header.decode_header(raw)
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            out.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(str(part))
    return " ".join(out)


def _get_plain_body(msg: email.message.Message, max_chars: int = 2000) -> str:
    """Extract plain-text body from email.message.Message."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    charset = part.get_content_charset() or "utf-8"
                    body = part.get_payload(decode=True).decode(charset, errors="replace")
                    break
                except Exception:
                    pass
        if not body:
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    try:
                        charset = part.get_content_charset() or "utf-8"
                        html = part.get_payload(decode=True).decode(charset, errors="replace")
                        body = re.sub(r"<[^>]+>", " ", html)
                        break
                    except Exception:
                        pass
    else:
        try:
            charset = msg.get_content_charset() or "utf-8"
            body = msg.get_payload(decode=True).decode(charset, errors="replace")
        except Exception:
            pass
    return body[:max_chars]


def _scan_mailbox(host: str, port: int, email_addr: str, password: str, max_msgs: int = 50) -> List[Dict]:
    """
    Connect via IMAP SSL, scan last `max_msgs` inbox emails.
    Returns list of: subject, from_addr, msg_date, body, message_id
    """
    results = []
    conn = imaplib.IMAP4_SSL(host, int(port))
    try:
        conn.login(email_addr, password)
        conn.select("INBOX", readonly=True)
        _, data = conn.search(None, "ALL")
        ids = data[0].split()[-max_msgs:]
        for msg_id in reversed(ids):
            try:
                _, msg_data = conn.fetch(msg_id, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue
                msg = email.message_from_bytes(msg_data[0][1])
                results.append({
                    "subject":    _decode_header_str(msg.get("Subject", "")),
                    "from_addr":  _decode_header_str(msg.get("From", "")),
                    "msg_date":   msg.get("Date", ""),
                    "body":       _get_plain_body(msg),
                    "message_id": (msg.get("Message-ID") or "").strip(),
                })
            except Exception as e:
                logger.debug("Skip message %s: %s", msg_id, e)
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    return results


# =============================================================================
# HELPERS — AI / regex event extraction
# =============================================================================

_AI_SYSTEM = """
You are an assistant that extracts structured event data from email text.
Return ONLY a valid JSON array. Each element must have exactly these keys:
  title        (string)
  event_type   (one of: Trademark Hearing, Court Hearing, Online Meeting,
                Deadline, Appointment, Conference, Interview, Other)
  date         (string yyyy-MM-dd or null)
  time         (string HH:mm 24h or null)
  location     (string or null)
  organizer    (string or null)
  description  (string max 120 chars or null)
  urgency      (low | medium | high)

Rules:
- Only extract REAL upcoming events/deadlines with clear dates.
- Ignore newsletters, promotions, OTPs, account alerts.
- Return [] if no event found.
- Never invent dates not present in the text.
"""


async def _extract_events_from_email(
    subject: str, body: str, from_addr: str, msg_date: str
) -> List[Dict]:
    """Use OpenAI if available, else fall back to regex."""
    if _openai:
        try:
            prompt = f"From: {from_addr}\nDate: {msg_date}\nSubject: {subject}\n\nBody:\n{body}"
            resp = await _openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": _AI_SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0,
                max_tokens=600,
            )
            raw = resp.choices[0].message.content.strip()
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            return json.loads(raw)
        except Exception as exc:
            logger.warning("OpenAI extraction failed: %s — using regex fallback", exc)

    return _regex_extract(subject, body, from_addr)


def _regex_extract(subject: str, body: str, from_addr: str) -> List[Dict]:
    """Simple keyword + regex event extractor."""
    text = f"{subject} {body}"
    keywords = [
        "hearing", "meeting", "deadline", "reminder", "appointment",
        "schedule", "conference", "webinar", "trademark", "court",
        "session", "call", "interview", "tribunal", "arbitration", "visit",
    ]
    if not any(k in text.lower() for k in keywords):
        return []

    # Extract date
    date_str = None
    for pat in [
        r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b",
        r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b",
    ]:
        m = re.search(pat, text)
        if m:
            try:
                if len(m.group(1)) == 4:
                    date_str = f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
                else:
                    yr = m.group(3)
                    if len(yr) == 2:
                        yr = "20" + yr
                    date_str = f"{yr}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
                break
            except Exception:
                pass

    # Extract time
    time_str = None
    tm = re.search(r"\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\b", text)
    if tm:
        h, mi = int(tm.group(1)), tm.group(2)
        period = (tm.group(3) or "").upper()
        if period == "PM" and h < 12:
            h += 12
        elif period == "AM" and h == 12:
            h = 0
        time_str = f"{h:02d}:{mi}"

    # Classify
    t = text.lower()
    if any(w in t for w in ["trademark", "ip office", "show cause", "ipindia"]):
        etype = "Trademark Hearing"
    elif any(w in t for w in ["court", "tribunal", "arbitration"]):
        etype = "Court Hearing"
    elif "interview" in t:
        etype = "Interview"
    elif any(w in t for w in ["zoom", "meet", "teams", "webinar", "conference"]):
        etype = "Online Meeting"
    elif any(w in t for w in ["visit", "site visit", "field visit"]):
        etype = "Visit"
    elif "deadline" in t:
        etype = "Deadline"
    else:
        etype = "Meeting"

    urgency = "high" if any(w in t for w in ["urgent", "immediately", "asap", "show cause", "final notice"]) else "medium"

    return [{
        "title":       (subject[:120] or "Email Event"),
        "event_type":  etype,
        "date":        date_str,
        "time":        time_str,
        "location":    None,
        "organizer":   from_addr[:100],
        "description": body[:120] if body else None,
        "urgency":     urgency,
    }]


# =============================================================================
# HELPER — MongoDB doc → Pydantic out
# =============================================================================

def _doc_to_out(doc: Dict) -> ExtractedEventOut:
    from bson import ObjectId
    eid = str(doc.get("_id", doc.get("id", "")))
    return ExtractedEventOut(
        id            = eid,
        title         = doc.get("title", ""),
        event_type    = doc.get("event_type", "Other"),
        date          = doc.get("date"),
        time          = doc.get("time"),
        location      = doc.get("location"),
        organizer     = doc.get("organizer"),
        description   = doc.get("description"),
        urgency       = doc.get("urgency", "medium"),
        source_subject= doc.get("source_subject", ""),
        source_from   = doc.get("source_from", ""),
        source_date   = doc.get("source_date", ""),
        raw_snippet   = doc.get("raw_snippet"),
        email_account = doc.get("email_account"),
    )


def _conn_doc_to_out(doc: Dict) -> ConnectionOut:
    return ConnectionOut(
        email_address = doc.get("email_address", ""),
        imap_host     = doc.get("imap_host", ""),
        imap_port     = doc.get("imap_port", 993),
        label         = doc.get("label"),
        provider      = doc.get("provider", "other"),
        is_active     = doc.get("is_active", True),
        last_synced   = doc.get("last_synced"),
        connected_at  = doc.get("connected_at"),
        sync_error    = doc.get("sync_error"),
    )


# =============================================================================
# ROUTES — email account connections
# =============================================================================

@router.get("/connections")
async def list_connections(current_user=Depends(get_current_user)):
    """List all email accounts connected by the current user."""
    cursor = db[COL_CONNECTIONS].find(
        {"user_id": str(current_user.id)},
        {"app_password_enc": 0},
    )
    docs = await cursor.to_list(length=100)
    return {"connections": [_conn_doc_to_out(d) for d in docs]}


@router.post("/connections", status_code=201)
async def add_connection(
    body: ConnectionCreateRequest,
    current_user=Depends(get_current_user),
):
    """
    Validate IMAP credentials live, then save the connection.
    Upserts if the same email_address was previously added by this user.
    """
    inferred_host, inferred_port, provider = _infer_provider(body.email_address)
    host = body.imap_host or inferred_host
    port = body.imap_port or inferred_port

    # Test before saving — raises 400 if credentials are wrong
    _test_imap(host, port, body.email_address, body.app_password)

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id":          str(current_user.id),
        "email_address":    body.email_address,
        "app_password_enc": _encrypt(body.app_password),
        "imap_host":        host,
        "imap_port":        port,
        "label":            body.label,
        "provider":         provider,
        "is_active":        True,
        "sync_error":       None,
        "connected_at":     now,
        "last_synced":      None,
    }
    await db[COL_CONNECTIONS].update_one(
        {"user_id": str(current_user.id), "email_address": body.email_address},
        {"$set": doc},
        upsert=True,
    )
    return _conn_doc_to_out(doc)


@router.patch("/connections/{email_address}")
async def update_connection(
    email_address: str,
    body: ConnectionUpdateRequest,
    current_user=Depends(get_current_user),
):
    """Update label or pause/resume an email connection."""
    existing = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address},
        {"app_password_enc": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")

    updates: Dict[str, Any] = {}
    if body.label is not None:
        updates["label"] = body.label
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        if body.is_active:
            updates["sync_error"] = None  # clear error on resume

    if updates:
        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": updates},
        )

    doc = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address},
        {"app_password_enc": 0},
    )
    return _conn_doc_to_out(doc)


@router.delete("/connections/{email_address}", status_code=204)
async def delete_connection(
    email_address: str,
    current_user=Depends(get_current_user),
):
    """Disconnect and remove an email account."""
    result = await db[COL_CONNECTIONS].delete_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")


@router.post("/connections/{email_address}/test")
async def test_connection(
    email_address: str,
    current_user=Depends(get_current_user),
):
    """Live-test an IMAP connection and update sync_error status."""
    doc = await db[COL_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")

    password = _decrypt(doc["app_password_enc"])
    now = datetime.now(timezone.utc).isoformat()

    try:
        _test_imap(doc["imap_host"], doc["imap_port"], email_address, password)
        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": {"sync_error": None, "last_synced": now}},
        )
        return {"status": "ok", "message": f"{email_address} is connected and working"}
    except HTTPException as exc:
        await db[COL_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": {"sync_error": exc.detail}},
        )
        raise


# =============================================================================
# ROUTES — event extraction
# Used by the "From Email" button in Attendance.jsx (EmailEventImporter modal)
# Events can then be saved as Reminders or Visits from the frontend
# =============================================================================

@router.get("/extract-events", response_model=List[ExtractedEventOut])
async def extract_events(
    current_user=Depends(get_current_user),
    limit: int = Query(default=30, ge=1, le=100),
    force_refresh: bool = Query(default=False),
):
    """
    Scan all active IMAP inboxes for the current user.
    Extracts meetings, hearings, deadlines, and visits using AI (or regex).
    Results are cached in MongoDB — re-scan happens after 30 minutes or
    when force_refresh=true.

    Frontend usage:
      GET /api/email/extract-events
      → returns list of events
      → user picks one → frontend pre-fills reminder or visit form
    """
    connections = await db[COL_CONNECTIONS].find(
        {"user_id": str(current_user.id), "is_active": True}
    ).to_list(length=50)

    if not connections:
        return []

    all_events: List[ExtractedEventOut] = []

    for conn in connections:
        email_addr = conn["email_address"]

        # 30-minute cache: return stored events unless force_refresh
        if not force_refresh and conn.get("last_synced"):
            try:
                last = datetime.fromisoformat(conn["last_synced"])
                age_secs = (datetime.now(timezone.utc) - last).total_seconds()
                if age_secs < 1800:
                    cached = await db[COL_EVENTS].find(
                        {"user_id": str(current_user.id), "email_account": email_addr}
                    ).sort("_id", -1).limit(limit).to_list(length=limit)
                    all_events.extend(_doc_to_out(d) for d in cached)
                    continue
            except Exception:
                pass

        # Scan IMAP inbox
        try:
            password = _decrypt(conn["app_password_enc"])
            raw_emails = _scan_mailbox(
                conn["imap_host"], conn["imap_port"],
                email_addr, password,
                max_msgs=50,
            )
        except Exception as exc:
            err = str(exc)[:255]
            logger.warning("IMAP scan failed for %s: %s", email_addr, err)
            await db[COL_CONNECTIONS].update_one(
                {"_id": conn["_id"]}, {"$set": {"sync_error": err}}
            )
            continue

        # Extract events from each email
        seen_ids: set = set()
        for raw in raw_emails:
            mid = raw.get("message_id", "")
            if mid:
                if mid in seen_ids:
                    continue
                seen_ids.add(mid)
                # Already in cache?
                exists = await db[COL_EVENTS].find_one(
                    {"user_id": str(current_user.id), "message_id": mid}
                )
                if exists:
                    all_events.append(_doc_to_out(exists))
                    continue

            try:
                extracted = await _extract_events_from_email(
                    raw["subject"], raw["body"],
                    raw["from_addr"], raw["msg_date"],
                )
            except Exception as exc:
                logger.debug("Extraction error msg %s: %s", mid, exc)
                continue

            for ev in extracted:
                doc = {
                    "user_id":        str(current_user.id),
                    "email_account":  email_addr,
                    "message_id":     mid,
                    "title":          ev.get("title") or raw["subject"][:120],
                    "event_type":     ev.get("event_type", "Other"),
                    "date":           ev.get("date"),
                    "time":           ev.get("time"),
                    "location":       ev.get("location"),
                    "organizer":      ev.get("organizer") or raw["from_addr"][:100],
                    "description":    ev.get("description"),
                    "urgency":        ev.get("urgency", "medium"),
                    "source_subject": raw["subject"][:200],
                    "source_from":    raw["from_addr"][:200],
                    "source_date":    raw["msg_date"][:100],
                    "raw_snippet":    raw["body"][:300],
                    "created_at":     datetime.now(timezone.utc).isoformat(),
                }
                result = await db[COL_EVENTS].insert_one(doc)
                doc["id"] = str(result.inserted_id)
                all_events.append(_doc_to_out(doc))

        # Update last_synced
        await db[COL_CONNECTIONS].update_one(
            {"_id": conn["_id"]},
            {"$set": {
                "last_synced": datetime.now(timezone.utc).isoformat(),
                "sync_error":  None,
            }},
        )

    # Sort by date descending, nulls last
    all_events.sort(key=lambda e: e.date or "0000-00-00", reverse=True)
    return all_events[:limit]


@router.get("/events", response_model=List[ExtractedEventOut])
async def list_cached_events(
    current_user=Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    event_type: Optional[str] = Query(default=None),
):
    """
    Return already-extracted events from the cache without rescanning.
    Optionally filter by event_type (e.g. 'Trademark Hearing', 'Visit').
    """
    query: Dict[str, Any] = {"user_id": str(current_user.id)}
    if event_type:
        query["event_type"] = event_type

    docs = await db[COL_EVENTS].find(query).sort("date", -1).limit(limit).to_list(length=limit)
    return [_doc_to_out(d) for d in docs]


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: str,
    current_user=Depends(get_current_user),
):
    """Remove a single extracted event from the cache."""
    from bson import ObjectId
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid event id")

    result = await db[COL_EVENTS].delete_one(
        {"_id": oid, "user_id": str(current_user.id)}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")


# =============================================================================
# ROUTE — EmailEventImporter modal endpoint
# Called by the "From Email" button in Attendance.jsx
# Returns events ready for the user to pick and turn into a Reminder or Visit
# =============================================================================

@router.get("/importer/events", response_model=List[ExtractedEventOut])
async def importer_events(
    current_user=Depends(get_current_user),
    limit: int = Query(default=30, ge=1, le=100),
    force_refresh: bool = Query(default=False),
):
    """
    Lightweight endpoint for the EmailEventImporter modal.
    - First call: triggers a fresh IMAP scan
    - Subsequent calls: returns cached results (fast)
    - Pass force_refresh=true to rescan

    Frontend flow:
      1. User clicks "From Email" in Attendance.jsx
      2. EmailEventImporter modal calls GET /api/email/importer/events
      3. User selects an event
      4. handleEmailEventForReminder() pre-fills the reminder form
         (or you can add a similar handler to pre-fill the visits form)
    """
    count = await db[COL_EVENTS].count_documents(
        {"user_id": str(current_user.id)}
    )
    if count == 0 or force_refresh:
        return await extract_events(
            current_user=current_user,
            limit=limit,
            force_refresh=force_refresh,
        )

    docs = await db[COL_EVENTS].find(
        {"user_id": str(current_user.id)}
    ).sort("date", -1).limit(limit).to_list(length=limit)

    return [_doc_to_out(d) for d in docs]
