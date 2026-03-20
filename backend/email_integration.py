# =============================================================================
# email_integration.py
# FastAPI router — IMAP email connection management + AI event extraction
# Specialized for: CA/CS/Legal Firm (Trademark Hearings, NCLT, GST, ROC)
# Stack: FastAPI · MongoDB (motor) · Google Gemini 2.0 Flash-Lite · imaplib
# =============================================================================

import imaplib
import email
import email.header
import re
import json
import asyncio
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
try:
    from cryptography.fernet import Fernet
    import os as _os
    _fernet_key = _os.environ.get("EMAIL_ENCRYPT_KEY", "").encode()
    _fernet = Fernet(_fernet_key) if len(_fernet_key) == 44 else None
except Exception:
    _fernet = None

# Google Gemini for richer event extraction.
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

# =============================================================================
# IMAP provider defaults
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
# AI EXTRACTION — LEGAL/TAX SPECIALIZED
# =============================================================================

_AI_SYSTEM = """
You are a specialized legal and tax assistant for a firm in India.
Extract structured events from the email text. 

STRICT RULES:
1. FOCUS: Trademark hearings (IP India), Court hearings (NCLT, High Court), ROC compliance, GST deadlines, and Client visits.
2. DISCARD JUNK: Newsletters, OTPs, Bank transactions, Personal chats, Marketing offers, and "Transaction Successful" alerts.
3. DATES: If year is missing but a month/day is present, assume 2026.
4. JSON: Return ONLY a valid JSON array. Each object must have keys: 
   title, event_type (Trademark Hearing, Court Hearing, Online Meeting, Deadline, Visit, Other), 
   date (yyyy-MM-dd), time (HH:mm), organizer, description (max 100 chars), urgency (high|medium|low).
"""

async def _extract_events_from_email(subject: str, body: str, from_addr: str, msg_date: str) -> List[Dict]:
    if _gemini:
        try:
            prompt = f"{_AI_SYSTEM}\n\nFrom: {from_addr}\nSubject: {subject}\nBody: {body}"
            resp = await _gemini.generate_content_async(prompt)
            raw = re.sub(r"```[a-z]*\n?|```", "", resp.text.strip())
            return json.loads(raw)
        except Exception: pass
    return _regex_extract(subject, body, from_addr)

def _regex_extract(subject: str, body: str, from_addr: str) -> List[Dict]:
    text = f"{subject} {body}".lower()
    junk = ["offer", "discount", "otp", "statement", "transaction successful"]
    if any(j in text for j in junk): return []

    date_pat = r"\b(\d{1,4})[/-|\.](\d{1,2})[/-|\.](\d{1,4})\b"
    m = re.search(date_pat, text)
    date_str = None
    if m:
        p1, p2, p3 = m.groups()
        if len(p1) == 4: date_str = f"{p1}-{p2.zfill(2)}-{p3.zfill(2)}"
        else: date_str = f"{p3 if len(p3)==4 else '20'+p3}-{p2.zfill(2)}-{p1.zfill(2)}"

    if not date_str: return []

    if any(w in text for w in ["trademark", "ipindia", "opposition"]): etype = "Trademark Hearing"
    elif any(w in text for w in ["court", "nclt", "tribunal"]): etype = "Court Hearing"
    elif "visit" in text: etype = "Visit"
    else: etype = "Deadline"

    return [{
        "title": subject[:100], "event_type": etype, "date": date_str, "time": None,
        "organizer": from_addr[:50], "description": body[:100], "urgency": "high"
    }]

# =============================================================================
# MONGO DOC TO PYDANTIC
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
# API ROUTES
# =============================================================================

@router.get("/connections")
async def list_connections(current_user=Depends(get_current_user)):
    cursor = db[COL_CONNECTIONS].find({"user_id": str(current_user.id)}, {"app_password_enc": 0})
    docs = await cursor.to_list(length=100)
    return {"connections": [_conn_doc_to_out(d) for d in docs]}

@router.post("/connections", status_code=201)
async def add_connection(body: ConnectionCreateRequest, current_user=Depends(get_current_user)):
    host, port, provider = _infer_provider(body.email_address)
    host, port = body.imap_host or host, body.imap_port or port
    _test_imap(host, port, body.email_address, body.app_password)
    
    doc = {
        "user_id": str(current_user.id), "email_address": body.email_address,
        "app_password_enc": _encrypt(body.app_password), "imap_host": host, "imap_port": port,
        "label": body.label, "provider": provider, "is_active": True, "connected_at": datetime.now(timezone.utc).isoformat()
    }
    await db[COL_CONNECTIONS].update_one({"user_id": str(current_user.id), "email_address": body.email_address}, {"$set": doc}, upsert=True)
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
        await db[COL_CONNECTIONS].update_one({"_id": doc["_id"]}, {"$set": {"sync_error": None, "last_synced": datetime.now(timezone.utc).isoformat()}})
        return {"status": "ok"}
    except Exception as e:
        await db[COL_CONNECTIONS].update_one({"_id": doc["_id"]}, {"$set": {"sync_error": str(e)}})
        raise

# =============================================================================
# CORE PARALLEL ENGINE
# =============================================================================

@router.get("/extract-events", response_model=List[ExtractedEventOut])
async def extract_events(current_user=Depends(get_current_user), limit: int = Query(30), force_refresh: bool = Query(False)):
    conns = await db[COL_CONNECTIONS].find({"user_id": str(current_user.id), "is_active": True}).to_list(50)
    if not conns: return []

    async def process_account(conn):
        email_addr = conn["email_address"]
        # Cache Logic
        if not force_refresh and conn.get("last_synced"):
            last = datetime.fromisoformat(conn["last_synced"])
            if (datetime.now(timezone.utc) - last).total_seconds() < 1800:
                cached = await db[COL_EVENTS].find({"user_id": str(current_user.id), "email_account": email_addr}).sort("_id", -1).limit(limit).to_list(limit)
                return [_doc_to_out(d) for d in cached]

        # Scan (Async Executor)
        loop = asyncio.get_event_loop()
        raw_emails = await loop.run_in_executor(None, _scan_mailbox, conn["imap_host"], conn["imap_port"], email_addr, _decrypt(conn["app_password_enc"]), 50)
        
        acc_results = []
        for raw in raw_emails:
            mid = raw.get("message_id")
            exists = await db[COL_EVENTS].find_one({"user_id": str(current_user.id), "message_id": mid})
            if exists:
                acc_results.append(_doc_to_out(exists))
                continue
            
            extracted = await _extract_events_from_email(raw["subject"], raw["body"], raw["from_addr"], raw["msg_date"])
            for ev in extracted:
                doc = {
                    "user_id": str(current_user.id), "email_account": email_addr, "message_id": mid,
                    "title": ev.get("title") or raw["subject"][:120], "event_type": ev.get("event_type", "Other"),
                    "date": ev.get("date"), "time": ev.get("time"), "organizer": ev.get("organizer"),
                    "description": ev.get("description"), "urgency": ev.get("urgency", "medium"),
                    "source_subject": raw["subject"][:200], "source_from": raw["from_addr"][:200],
                    "source_date": raw["msg_date"][:100], "raw_snippet": raw["body"][:300],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                res = await db[COL_EVENTS].insert_one(doc)
                doc["id"] = str(res.inserted_id)
                acc_results.append(_doc_to_out(doc))

        await db[COL_CONNECTIONS].update_one({"_id": conn["_id"]}, {"$set": {"last_synced": datetime.now(timezone.utc).isoformat(), "sync_error": None}})
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
    from bson import ObjectId
    await db[COL_EVENTS].delete_one({"_id": ObjectId(event_id), "user_id": str(current_user.id)})

@router.get("/importer/events", response_model=List[ExtractedEventOut])
async def importer_events(current_user=Depends(get_current_user), limit: int = 30, force_refresh: bool = False):
    count = await db[COL_EVENTS].count_documents({"user_id": str(current_user.id)})
    if count == 0 or force_refresh:
        return await extract_events(current_user, limit, force_refresh)
    docs = await db[COL_EVENTS].find({"user_id": str(current_user.id)}).sort("date", -1).limit(limit).to_list(limit)
    return [_doc_to_out(d) for d in docs]
