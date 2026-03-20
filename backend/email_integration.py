# =============================================================================
# email_integration.py
# FastAPI router — IMAP email connection management + AI event extraction
# Stack: FastAPI · MongoDB (motor) · OpenAI · imaplib · APScheduler
# =============================================================================

import imaplib
import email
import email.header
import re
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

# ── adjust these two imports to match your project paths ─────────────────────
from backend.auth import get_current_user          # returns your User model
from backend.database import get_database          # returns AsyncIOMotorDatabase
# ─────────────────────────────────────────────────────────────────────────────

try:
    from cryptography.fernet import Fernet
    import os
    _FERNET_KEY = os.environ.get("EMAIL_ENCRYPT_KEY", "").encode()
    _fernet = Fernet(_FERNET_KEY) if len(_FERNET_KEY) == 44 else None
except Exception:
    _fernet = None

try:
    from openai import AsyncOpenAI
    import os as _os
    _openai_client = AsyncOpenAI(api_key=_os.environ.get("OPENAI_API_KEY", ""))
except Exception:
    _openai_client = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])

# =============================================================================
# CONSTANTS
# =============================================================================

PROVIDER_IMAP: Dict[str, tuple] = {
    "gmail.com":       ("imap.gmail.com",          993, "gmail"),
    "googlemail.com":  ("imap.gmail.com",          993, "gmail"),
    "outlook.com":     ("outlook.office365.com",   993, "outlook"),
    "hotmail.com":     ("outlook.office365.com",   993, "outlook"),
    "live.com":        ("outlook.office365.com",   993, "outlook"),
    "yahoo.com":       ("imap.mail.yahoo.com",     993, "yahoo"),
    "ymail.com":       ("imap.mail.yahoo.com",     993, "yahoo"),
    "icloud.com":      ("imap.mail.me.com",        993, "icloud"),
    "me.com":          ("imap.mail.me.com",        993, "icloud"),
}

COLLECTION_CONNECTIONS = "email_connections"
COLLECTION_EVENTS      = "email_extracted_events"

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
    """Encrypt app password before storing. Falls back to plain if no key set."""
    if _fernet:
        return _fernet.encrypt(plain.encode()).decode()
    return plain


def _decrypt(stored: str) -> str:
    """Decrypt stored app password."""
    if _fernet:
        try:
            return _fernet.decrypt(stored.encode()).decode()
        except Exception:
            return stored   # already plain (legacy row)
    return stored


# =============================================================================
# HELPERS — IMAP
# =============================================================================

def _infer_provider(email_address: str):
    """Return (imap_host, imap_port, provider_id) from email domain."""
    domain = email_address.split("@")[-1].lower()
    return PROVIDER_IMAP.get(domain, (f"imap.{domain}", 993, "other"))


def _test_imap_connection(host: str, port: int, email_addr: str, password: str) -> None:
    """
    Open an IMAP SSL connection and attempt LOGIN.
    Raises HTTPException(400) on failure.
    """
    try:
        conn = imaplib.IMAP4_SSL(host, int(port))
        conn.login(email_addr, password)
        conn.logout()
    except imaplib.IMAP4.error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"IMAP login failed for {email_addr}: {exc}. "
                "Make sure IMAP is enabled and the App Password is correct."
            ),
        )
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reach mail server {host}:{port} — {exc}",
        )


def _decode_header(raw: str) -> str:
    """Decode RFC-2047 encoded email header to plain string."""
    if not raw:
        return ""
    parts = email.header.decode_header(raw)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(str(part))
    return " ".join(decoded)


def _get_body(msg: email.message.Message, max_chars: int = 2000) -> str:
    """Extract plain-text body from an email.message.Message."""
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
            # fall back to text/html stripped of tags
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


# =============================================================================
# HELPERS — AI extraction
# =============================================================================

_EXTRACTION_SYSTEM = """
You are an assistant that extracts structured event data from email text.
Return ONLY a JSON array (no markdown). Each element must have:
  title        (string, concise event name)
  event_type   (one of: Trademark Hearing, Court Hearing, Online Meeting,
                Deadline, Appointment, Conference, Interview, Other)
  date         (string yyyy-MM-dd or null)
  time         (string HH:mm 24h or null)
  location     (string or null)
  organizer    (string or null)
  description  (<=120 char summary or null)
  urgency      (low | medium | high)

Rules:
- Only extract REAL upcoming events / deadlines with clear dates.
- Ignore marketing, promotional, and newsletter emails.
- If no event is found return an empty array [].
- Do NOT invent dates that are not in the text.
"""

async def _ai_extract_events(subject: str, body: str, from_addr: str, msg_date: str) -> List[Dict]:
    """
    Call OpenAI to extract structured events from an email.
    Falls back to regex heuristics if OpenAI is unavailable.
    """
    if _openai_client:
        try:
            prompt = (
                f"From: {from_addr}\n"
                f"Date: {msg_date}\n"
                f"Subject: {subject}\n\n"
                f"Body:\n{body}"
            )
            resp = await _openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": _EXTRACTION_SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0,
                max_tokens=800,
            )
            raw = resp.choices[0].message.content.strip()
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            return json.loads(raw)
        except Exception as exc:
            logger.warning("OpenAI extraction failed: %s — falling back to regex", exc)

    return _regex_extract_events(subject, body, from_addr, msg_date)


def _regex_extract_events(subject: str, body: str, from_addr: str, msg_date: str) -> List[Dict]:
    """Simple regex-based event detector used when OpenAI is unavailable."""
    text = f"{subject} {body}"
    keywords = [
        "hearing", "meeting", "deadline", "reminder", "appointment",
        "schedule", "conference", "webinar", "trademark", "court",
        "session", "call", "interview", "tribunal", "arbitration",
    ]
    if not any(k in text.lower() for k in keywords):
        return []

    # date patterns
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

    # time pattern
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

    t = text.lower()
    if any(w in t for w in ["trademark", "ip office", "show cause"]):
        etype = "Trademark Hearing"
    elif any(w in t for w in ["court", "tribunal", "arbitration"]):
        etype = "Court Hearing"
    elif "interview" in t:
        etype = "Interview"
    elif any(w in t for w in ["zoom", "meet", "teams", "webinar", "conference"]):
        etype = "Online Meeting"
    elif "deadline" in t:
        etype = "Deadline"
    else:
        etype = "Meeting"

    urgency = "high" if any(w in t for w in ["urgent", "immediately", "asap", "show cause"]) else "medium"

    return [{
        "title":       subject[:120] or "Email Event",
        "event_type":  etype,
        "date":        date_str,
        "time":        time_str,
        "location":    None,
        "organizer":   from_addr[:100],
        "description": body[:120] if body else None,
        "urgency":     urgency,
    }]


# =============================================================================
# HELPERS — fetch raw emails from IMAP
# =============================================================================

def _scan_mailbox(
    host: str,
    port: int,
    email_addr: str,
    password: str,
    max_messages: int = 50,
) -> List[Dict]:
    """
    Connect via IMAP SSL, scan the last `max_messages` inbox emails.
    Returns list of dicts: subject, from_addr, msg_date, body, message_id.
    """
    results = []
    conn = imaplib.IMAP4_SSL(host, int(port))
    try:
        conn.login(email_addr, password)
        conn.select("INBOX", readonly=True)

        _, data = conn.search(None, "ALL")
        ids = data[0].split()
        ids = ids[-max_messages:]

        for msg_id in reversed(ids):
            try:
                _, msg_data = conn.fetch(msg_id, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                subject    = _decode_header(msg.get("Subject", ""))
                from_addr  = _decode_header(msg.get("From", ""))
                msg_date   = msg.get("Date", "")
                message_id = msg.get("Message-ID", "")
                body       = _get_body(msg)

                results.append({
                    "subject":    subject,
                    "from_addr":  from_addr,
                    "msg_date":   msg_date,
                    "body":       body,
                    "message_id": message_id.strip(),
                })
            except Exception as e:
                logger.debug("Skipping message %s: %s", msg_id, e)
                continue
    finally:
        try:
            conn.logout()
        except Exception:
            pass

    return results


# =============================================================================
# ROUTES — connections
# =============================================================================

@router.get("/connections")
async def list_connections(
    db=Depends(get_database),
    current_user=Depends(get_current_user),
):
    """Return all email connections for the current user."""
    cursor = db[COLLECTION_CONNECTIONS].find(
        {"user_id": str(current_user.id)},
        {"app_password_enc": 0},
    )
    docs = await cursor.to_list(length=100)
    connections = []
    for doc in docs:
        connections.append(ConnectionOut(
            email_address = doc.get("email_address", ""),
            imap_host     = doc.get("imap_host", ""),
            imap_port     = doc.get("imap_port", 993),
            label         = doc.get("label"),
            provider      = doc.get("provider", "other"),
            is_active     = doc.get("is_active", True),
            last_synced   = doc.get("last_synced"),
            connected_at  = doc.get("connected_at"),
            sync_error    = doc.get("sync_error"),
        ))
    return {"connections": connections}


@router.post("/connections", status_code=status.HTTP_201_CREATED)
async def add_connection(
    body: ConnectionCreateRequest,
    db=Depends(get_database),
    current_user=Depends(get_current_user),
):
    """
    Validate IMAP credentials live, then upsert the connection in MongoDB.
    """
    inferred_host, inferred_port, provider = _infer_provider(body.email_address)
    host = body.imap_host or inferred_host
    port = body.imap_port or inferred_port

    _test_imap_connection(host, port, body.email_address, body.app_password)

    encrypted_pw = _encrypt(body.app_password)
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "user_id":          str(current_user.id),
        "email_address":    body.email_address,
        "app_password_enc": encrypted_pw,
        "imap_host":        host,
        "imap_port":        port,
        "label":            body.label,
        "provider":         provider,
        "is_active":        True,
        "sync_error":       None,
        "connected_at":     now_iso,
        "last_synced":      None,
    }

    await db[COLLECTION_CONNECTIONS].update_one(
        {"user_id": str(current_user.id), "email_address": body.email_address},
        {"$set": doc},
        upsert=True,
    )

    return ConnectionOut(
        email_address = body.email_address,
        imap_host     = host,
        imap_port     = port,
        label         = body.label,
        provider      = provider,
        is_active     = True,
        connected_at  = now_iso,
    )


@router.patch("/connections/{email_address}")
async def update_connection(
    email_address: str,
    body: ConnectionUpdateRequest,
    db=Depends(get_database),
    current_user=Depends(get_current_user),
):
    """Update label or is_active for a connection."""
    existing = await db[COLLECTION_CONNECTIONS].find_one(
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
            updates["sync_error"] = None

    if updates:
        await db[COLLECTION_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": updates},
        )

    doc = await db[COLLECTION_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address},
        {"app_password_enc": 0},
    )
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


@router.delete("/connections/{email_address}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    email_address: str,
    db=Depends(get_database),
    current_user=Depends(get_current_user),
):
    """Disconnect and remove an email account."""
    result = await db[COLLECTION_CONNECTIONS].delete_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")


@router.post("/connections/{email_address}/test")
async def test_connection(
    email_address: str,
    db=Depends(get_database),
    current_user=Depends(get_current_user),
):
    """Live-test an IMAP connection and update sync_error accordingly."""
    doc = await db[COLLECTION_CONNECTIONS].find_one(
        {"user_id": str(current_user.id), "email_address": email_address}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Connection not found")

    password = _decrypt(doc["app_password_enc"])
    now_iso  = datetime.now(timezone.utc).isoformat()

    try:
        _test_imap_connection(
            doc["imap_host"], doc["imap_port"], email_address, password
        )
        await db[COLLECTION_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": {"sync_error": None, "last_synced": now_iso}},
        )
        return {"status": "ok", "message": f"{email_address} is reachable and credentials are valid"}
    except HTTPException as exc:
        await db[COLLECTION_CONNECTIONS].update_one(
            {"user_id": str(current_user.id), "email_address": email_address},
            {"$set": {"sync_error": exc.detail}},
        )
        raise


# =============================================================================
# ROUTES — event extraction
# =============================================================================

@router.get("/extract-events", response_model=List[ExtractedEventOut])
async def extract_events(
    db=Depends(get_database),
    current_user=Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    force_refresh: bool = Query(default=False),
):
    """
    Scan all active IMAP connections, extract events with AI (or regex fallback),
    cache in MongoDB, and return results.
    Pass force_refresh=true to bypass the 30-minute cache.
    """
    connections_cursor = db[COLLECTION_CONNECTIONS].find(
        {"user_id": str(current_user.id), "is_active": True}
    )
    connections = await connections_cursor.to_list(length=50)

    if not connections:
        return []

    all_events: List[ExtractedEventOut] = []

    for conn in connections:
        email_addr = conn["email_address"]

        # 30-minute cache check
        if not force_refresh and conn.get("last_synced"):
            try:
                last = datetime.fromisoformat(conn["last_synced"])
                if (datetime.now(timezone.utc) - last).total_seconds() < 1800:
                    cached = await db[COLLECTION_EVENTS].find(
                        {"user_id": str(current_user.id), "email_account": email_addr}
                    ).sort("_id", -1).limit(limit).to_list(length=limit)
                    for ev in cached:
                        all_events.append(_doc_to_event(ev))
                    continue
            except Exception:
                pass

        # Scan IMAP
        try:
            password = _decrypt(conn["app_password_enc"])
            raw_emails = _scan_mailbox(
                conn["imap_host"], conn["imap_port"],
                email_addr, password,
                max_messages=50,
            )
        except Exception as exc:
            err_msg = str(exc)[:255]
            logger.warning("IMAP scan failed for %s: %s", email_addr, err_msg)
            await db[COLLECTION_CONNECTIONS].update_one(
                {"_id": conn["_id"]},
                {"$set": {"sync_error": err_msg}},
            )
            continue

        # Extract events
        seen_message_ids = set()
        for raw in raw_emails:
            mid = raw.get("message_id", "")
            if mid and mid in seen_message_ids:
                continue
            if mid:
                seen_message_ids.add(mid)

            if mid:
                exists = await db[COLLECTION_EVENTS].find_one(
                    {"user_id": str(current_user.id), "message_id": mid}
                )
                if exists:
                    all_events.append(_doc_to_event(exists))
                    continue

            try:
                extracted = await _ai_extract_events(
                    raw["subject"], raw["body"],
                    raw["from_addr"], raw["msg_date"]
                )
            except Exception as exc:
                logger.debug("Extraction error for msg %s: %s", mid, exc)
                continue

            for ev in extracted:
                doc = {
                    "user_id":        str(current_user.id),
                    "email_account":  email_addr,
                    "message_id":     mid,
                    "title":          ev.get("title", raw["subject"][:120]),
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
                result = await db[COLLECTION_EVENTS].insert_one(doc)
                doc["id"] = str(result.inserted_id)
                all_events.append(_doc_to_event(doc))

        # Update last_synced
        await db[COLLECTION_CONNECTIONS].update_one(
            {"_id": conn["_id"]},
            {"$set": {
                "last_synced": datetime.now(timezone.utc).isoformat(),
                "sync_error":  None,
            }},
        )

    def _sort_key(e: ExtractedEventOut):
        return e.date or "0000-00-00"

    all_events.sort(key=_sort_key, reverse=True)
    return all_events[:limit]


@router.get("/events", response_model=List[ExtractedEventOut])
async def list_cached_events(
    db=Depends(get_database),
    current_user=Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    event_type: Optional[str] = Query(default=None),
):
    """Return previously extracted events from cache without rescanning."""
    query: Dict[str, Any] = {"user_id": str(current_user.id)}
    if event_type:
        query["event_type"] = event_type

    docs = await db[COLLECTION_EVENTS].find(query).sort("date", -1).limit(limit).to_list(length=limit)
    return [_doc_to_event(doc) for doc in docs]


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    db=Depends(get_database),
    current_user=Depends(get_current_user),
):
    """Delete a single extracted event from the cache."""
    from bson import ObjectId
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid event id")

    result = await db[COLLECTION_EVENTS].delete_one(
        {"_id": oid, "user_id": str(current_user.id)}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")


# =============================================================================
# ROUTES — EmailEventImporter modal (Attendance.jsx "From Email" button)
# =============================================================================

@router.get("/importer/events", response_model=List[ExtractedEventOut])
async def importer_get_events(
    db=Depends(get_database),
    current_user=Depends(get_current_user),
    limit: int = Query(default=30, ge=1, le=100),
):
    """
    Endpoint for the EmailEventImporter modal in Attendance.jsx.
    Returns recently extracted events. Triggers a fresh scan on first use.
    """
    count = await db[COLLECTION_EVENTS].count_documents(
        {"user_id": str(current_user.id)}
    )
    if count == 0:
        return await extract_events(
            db=db, current_user=current_user,
            limit=limit, force_refresh=False,
        )

    docs = (
        await db[COLLECTION_EVENTS]
        .find({"user_id": str(current_user.id)})
        .sort("date", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    return [_doc_to_event(doc) for doc in docs]


# =============================================================================
# INTERNAL UTILITY
# =============================================================================

def _doc_to_event(doc: Dict) -> ExtractedEventOut:
    """Convert a MongoDB document to ExtractedEventOut."""
    from bson import ObjectId
    event_id = str(doc.get("_id", doc.get("id", "")))
    return ExtractedEventOut(
        id             = event_id,
        title          = doc.get("title", ""),
        event_type     = doc.get("event_type", "Other"),
        date           = doc.get("date"),
        time           = doc.get("time"),
        location       = doc.get("location"),
        organizer      = doc.get("organizer"),
        description    = doc.get("description"),
        urgency        = doc.get("urgency", "medium"),
        source_subject = doc.get("source_subject", ""),
        source_from    = doc.get("source_from", ""),
        source_date    = doc.get("source_date", ""),
        raw_snippet    = doc.get("raw_snippet"),
        email_account  = doc.get("email_account"),
    )


# =============================================================================
# BACKGROUND SYNC — wire up with APScheduler in server.py
# =============================================================================

async def sync_all_users_emails(db) -> None:
    """
    Scheduled task — scans emails for ALL users with active connections.

    Add to your server.py APScheduler setup:

        from backend.email_integration import sync_all_users_emails
        scheduler.add_job(
            lambda: asyncio.create_task(sync_all_users_emails(db)),
            "interval", minutes=30, id="email_sync"
        )
    """
    cursor = db[COLLECTION_CONNECTIONS].find({"is_active": True})
    connections = await cursor.to_list(length=500)

    for conn in connections:
        try:
            password = _decrypt(conn["app_password_enc"])
            raw_emails = _scan_mailbox(
                conn["imap_host"], conn["imap_port"],
                conn["email_address"], password,
                max_messages=30,
            )
            for raw in raw_emails:
                mid = raw.get("message_id", "")
                if mid:
                    exists = await db[COLLECTION_EVENTS].find_one(
                        {"user_id": conn["user_id"], "message_id": mid}
                    )
                    if exists:
                        continue

                extracted = await _ai_extract_events(
                    raw["subject"], raw["body"],
                    raw["from_addr"], raw["msg_date"]
                )
                for ev in extracted:
                    doc = {
                        "user_id":        conn["user_id"],
                        "email_account":  conn["email_address"],
                        "message_id":     mid,
                        "title":          ev.get("title", raw["subject"][:120]),
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
                    await db[COLLECTION_EVENTS].insert_one(doc)

            await db[COLLECTION_CONNECTIONS].update_one(
                {"_id": conn["_id"]},
                {"$set": {
                    "last_synced": datetime.now(timezone.utc).isoformat(),
                    "sync_error":  None,
                }},
            )
        except Exception as exc:
            logger.warning(
                "Background sync failed for %s: %s",
                conn.get("email_address"), exc
            )
            await db[COLLECTION_CONNECTIONS].update_one(
                {"_id": conn["_id"]},
                {"$set": {"sync_error": str(exc)[:255]}},
            )
