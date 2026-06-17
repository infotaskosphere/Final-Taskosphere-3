"""
whatsapp_hub.py  —  WhatsApp Hub: unified inbox for all connected numbers

Features
────────
• Incoming-message webhook  (POST /whatsapp/hub/webhook/message)
• Bulk history sync         (POST /whatsapp/hub/webhook/bulk-sync)
• Unified inbox            (GET  /whatsapp/hub/inbox)
• Per-conversation thread  (GET  /whatsapp/hub/conversations/{contact_jid})
• Reply — text             (POST /whatsapp/hub/reply)
• Reply — media attachment (POST /whatsapp/hub/reply-media)
• Mark conversation read   (PATCH /whatsapp/hub/conversations/{contact_jid}/read)
• Unread badge count       (GET  /whatsapp/hub/unread-count)
• Delete conversation      (DELETE /whatsapp/hub/conversations/{contact_jid})
• Assign conversation      (PATCH /whatsapp/hub/conversations/{contact_jid}/assign)
• Profile picture proxy    (GET  /whatsapp/hub/contacts/{jid}/profile-pic)
• Access management        (GET/PATCH /whatsapp/hub/access/*)

@lid JID handling
─────────────────
Baileys uses @lid (Linked Device ID) JIDs for multi-device contacts.
@lid numbers are NOT phone numbers — resolving them requires the per-session
LID map maintained in the bridge.  When a @lid JID appears in a reply request,
this backend calls GET /sessions/:id/resolve-jid on the bridge to get the real
@s.whatsapp.net JID before sending.
"""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.dependencies import get_current_user, require_admin
from backend.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp/hub", tags=["whatsapp-hub"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _db():
    from backend.server import db
    return db


def _normalize_jid(jid: str) -> str:
    """
    Light normalization only — do NOT blindly replace @lid with @s.whatsapp.net
    because the LID number is NOT a phone number.  We keep @lid JIDs as-is so
    the Hub can display them; the bridge resolves them when sending.
    """
    if not jid:
        return jid
    return jid.strip()


async def _resolve_send_jid(jid: str, session_id: str) -> str:
    """
    If jid is an @lid JID, call the bridge to resolve it to an actual
    @s.whatsapp.net JID.  Returns the resolved JID, or the original if
    the bridge can't resolve it.
    """
    if not jid.endswith("@lid"):
        return jid
    from backend.whatsapp_integration import _bridge_get, _get_cached_sessions
    try:
        import urllib.parse
        encoded = urllib.parse.quote(jid, safe="")
        result = await _bridge_get(f"/sessions/{session_id}/resolve-jid?jid={encoded}")
        resolved = result.get("resolved_jid", jid)
        if resolved and resolved != jid:
            logger.info("Resolved @lid JID %s → %s", jid, resolved)
            return resolved
    except Exception as e:
        logger.warning("JID resolution failed for %s: %s", jid, e)
    return jid


async def _has_hub_access(user: User) -> bool:
    if user.role == "admin":
        return True
    if getattr(user.permissions, "can_access_whatsapp_hub", False):
        return True
    doc = await _db()["users"].find_one({"_id": user.id})
    return bool(doc and doc.get("wa_hub_access"))


# ── Pydantic ─────────────────────────────────────────────────────────────────

class HubReply(BaseModel):
    jid: str
    message: str = Field(..., min_length=1, max_length=4096)
    session_id: Optional[str] = None


class HubReplyMedia(BaseModel):
    jid: str
    session_id: Optional[str] = None
    base64: str                         # base64-encoded file content
    mime_type: str                      # e.g. "image/jpeg"
    filename: str = "file"
    caption: Optional[str] = None       # optional caption for images/videos


class ConversationAssign(BaseModel):
    user_id: Optional[str] = None


class HubAccessUpdate(BaseModel):
    user_id: str
    grant: bool


# ── Bulk sync Pydantic models ─────────────────────────────────────────────────

class BulkSyncContact(BaseModel):
    jid: str
    phone: Optional[str] = None
    display_name: Optional[str] = None
    last_message_at: Optional[str] = None


class BulkSyncMessage(BaseModel):
    session_id: str
    session_label: Optional[str] = None
    jid: str
    message_id: Optional[str] = ""
    from_phone: Optional[str] = None
    contact_name: Optional[str] = None
    body: Optional[str] = ""
    direction: Optional[str] = "in"
    timestamp: Optional[int] = None


class BulkSyncPayload(BaseModel):
    session_id: str
    session_label: Optional[str] = None
    contacts: List[BulkSyncContact] = []
    messages: List[BulkSyncMessage] = []


# ── Webhook: single incoming message ─────────────────────────────────────────

@router.post("/webhook/message")
async def hub_incoming_message(request: Request):
    """
    wa-bridge calls this for every new real-time incoming message.
    The bridge already resolves @lid JIDs before calling us, but we keep
    the jid as-is and store whatever we receive.
    """
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    jid        = payload.get("jid", "").strip()
    session_id = payload.get("session_id", "unknown")
    msg_id     = payload.get("message_id", "")
    body       = payload.get("body", "")
    ts_raw     = payload.get("timestamp")

    if not jid or not body:
        return {"ok": True}

    ts = (
        datetime.fromtimestamp(ts_raw, tz=timezone.utc)
        if ts_raw
        else datetime.now(timezone.utc)
    )

    db = _db()

    if msg_id:
        existing = await db["whatsapp_hub_messages"].find_one(
            {"message_id": msg_id, "session_id": session_id}
        )
        if existing:
            return {"ok": True, "duplicate": True}

    await db["whatsapp_hub_messages"].insert_one({
        "jid":           jid,
        "message_id":    msg_id,
        "session_id":    session_id,
        "session_label": payload.get("session_label", session_id),
        "direction":     "in",
        "from":          payload.get("from", jid.split("@")[0]),
        "to":            session_id,
        "contact_name":  payload.get("contact_name"),
        "body":          body,
        "media_url":     payload.get("media_url"),
        "media_type":    payload.get("media_type"),
        "timestamp":     ts,
        "read":          False,
        "assigned_to":   None,
    })

    phone        = jid.split("@")[0]
    contact_name = payload.get("contact_name") or phone
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": jid},
        {"$set": {
            "jid":             jid,
            "phone":           phone,
            "display_name":    contact_name,
            "last_message_at": ts,
            "session_id":      session_id,
        },
        "$inc": {"unread_count": 1}},
        upsert=True,
    )

    logger.info("WA Hub: incoming from %s via %s", jid, session_id)
    return {"ok": True}


# ── Webhook: bulk history sync ────────────────────────────────────────────────

@router.post("/webhook/bulk-sync")
async def hub_bulk_sync(request: Request):
    """
    wa-bridge calls this when a session connects and messaging-history.set fires.
    Accepts batched contacts + messages and upserts them efficiently.
    """
    try:
        raw: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    session_id    = raw.get("session_id", "unknown")
    session_label = raw.get("session_label", session_id)
    contacts_raw  = raw.get("contacts", [])
    messages_raw  = raw.get("messages", [])

    db = _db()
    contacts_upserted = 0
    messages_stored   = 0

    # ── Upsert contacts ───────────────────────────────────────────────────────
    for c in contacts_raw:
        jid = (c.get("jid") or "").strip()
        if not jid:
            continue
        phone        = c.get("phone") or jid.split("@")[0]
        display_name = c.get("display_name") or phone
        last_at      = None
        ts_str       = c.get("last_message_at")
        if ts_str:
            try:
                last_at = datetime.fromisoformat(ts_str.rstrip("Z")).replace(tzinfo=timezone.utc)
            except Exception:
                pass
        if not last_at:
            last_at = datetime.now(timezone.utc)

        await db["whatsapp_hub_contacts"].update_one(
            {"jid": jid},
            {
                "$setOnInsert": {
                    "display_name": display_name,
                    "unread_count": 0,
                    "session_id":   session_id,
                },
                "$set": {"jid": jid, "phone": phone},
                "$max": {"last_message_at": last_at},
            },
            upsert=True,
        )
        contacts_upserted += 1

    # ── Store messages ────────────────────────────────────────────────────────
    for m in messages_raw:
        jid  = (m.get("jid") or "").strip()
        body = m.get("body", "")
        if not jid or not body:
            continue

        msg_id    = m.get("message_id", "")
        m_session = m.get("session_id", session_id)
        direction = m.get("direction", "in")
        ts_raw    = m.get("timestamp")
        ts        = (
            datetime.fromtimestamp(ts_raw, tz=timezone.utc)
            if ts_raw
            else datetime.now(timezone.utc)
        )

        if msg_id:
            existing = await db["whatsapp_hub_messages"].find_one(
                {"message_id": msg_id, "session_id": m_session}
            )
            if existing:
                continue

        phone      = jid.split("@")[0]
        contact_nm = m.get("contact_name")

        await db["whatsapp_hub_messages"].insert_one({
            "jid":           jid,
            "message_id":    msg_id,
            "session_id":    m_session,
            "session_label": m.get("session_label", session_label),
            "direction":     direction,
            "from":          m.get("from_phone", phone),
            "to":            m_session if direction == "out" else phone,
            "contact_name":  contact_nm,
            "body":          body,
            "media_url":     None,
            "media_type":    None,
            "timestamp":     ts,
            "read":          direction == "out",
            "assigned_to":   None,
        })
        messages_stored += 1

        await db["whatsapp_hub_contacts"].update_one(
            {"jid": jid},
            {
                "$set": {"jid": jid, "phone": phone, "session_id": m_session},
                "$max": {"last_message_at": ts},
                "$setOnInsert": {"display_name": contact_nm or phone, "unread_count": 0},
            },
            upsert=True,
        )
        if contact_nm and contact_nm != phone:
            await db["whatsapp_hub_contacts"].update_one(
                {"jid": jid, "$or": [
                    {"display_name": {"$exists": False}},
                    {"display_name": phone},
                ]},
                {"$set": {"display_name": contact_nm}},
            )

    logger.info("WA Hub bulk-sync: session=%s, contacts=%d, messages=%d", session_id, contacts_upserted, messages_stored)
    return {"ok": True, "contacts_upserted": contacts_upserted, "messages_stored": messages_stored}


# ── Inbox ────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def hub_inbox(
    session_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 50,
    skip: int = 0,
    current_user: User = Depends(get_current_user),
):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    db = _db()
    contact_filter: Dict[str, Any] = {}
    if session_id:
        contact_filter["session_id"] = session_id
    if unread_only:
        contact_filter["unread_count"] = {"$gt": 0}

    contacts = await db["whatsapp_hub_contacts"].find(contact_filter) \
        .sort("last_message_at", -1).skip(skip).limit(limit).to_list(limit)

    result = []
    for c in contacts:
        latest = await db["whatsapp_hub_messages"].find_one(
            {"jid": c["jid"]}, sort=[("timestamp", -1)]
        )
        result.append({
            "jid":             c["jid"],
            "phone":           c.get("phone"),
            "display_name":    c.get("display_name"),
            "last_message_at": c.get("last_message_at"),
            "unread_count":    c.get("unread_count", 0),
            "session_id":      c.get("session_id"),
            "profile_pic_url": c.get("profile_pic_url"),
            "latest_message":  {
                "body":      latest.get("body") if latest else "",
                "direction": latest.get("direction") if latest else "in",
                "timestamp": latest.get("timestamp") if latest else None,
            } if latest else None,
            "assigned_to": latest.get("assigned_to") if latest else None,
        })

    total = await db["whatsapp_hub_contacts"].count_documents(contact_filter)
    return {"contacts": result, "total": total}


# ── Profile picture proxy ─────────────────────────────────────────────────────

@router.get("/contacts/{contact_jid:path}/profile-pic")
async def hub_contact_profile_pic(
    contact_jid: str,
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    from backend.whatsapp_integration import _bridge_get, _get_cached_sessions

    db = _db()
    cached = await db["whatsapp_hub_contacts"].find_one({"jid": contact_jid})
    if cached and cached.get("profile_pic_url"):
        return {"url": cached["profile_pic_url"], "jid": contact_jid, "cached": True}

    if not session_id:
        sessions = await _get_cached_sessions()
        connected = [s for s in sessions if s.get("status") == "connected"]
        if not connected:
            return {"url": None, "jid": contact_jid}
        session_id = connected[0].get("sessionId") or connected[0].get("id")

    import urllib.parse
    phone = contact_jid.split("@")[0]
    try:
        encoded_jid = urllib.parse.quote(f"{phone}@s.whatsapp.net", safe="")
        result = await _bridge_get(f"/sessions/{session_id}/contacts/{encoded_jid}/profile-pic")
        url = result.get("url")
        if url:
            await db["whatsapp_hub_contacts"].update_one(
                {"jid": contact_jid},
                {"$set": {"profile_pic_url": url}},
            )
        return {"url": url, "jid": contact_jid, "cached": False}
    except Exception as e:
        logger.debug("Profile pic fetch failed for %s: %s", contact_jid, e)
        return {"url": None, "jid": contact_jid}


# ── Conversation thread ───────────────────────────────────────────────────────

@router.get("/conversations/{contact_jid:path}")
async def hub_conversation(
    contact_jid: str,
    limit: int = 50,
    before_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    db = _db()
    q: Dict[str, Any] = {"jid": contact_jid}
    if before_id:
        anchor = await db["whatsapp_hub_messages"].find_one({"_id": before_id})
        if anchor:
            q["timestamp"] = {"$lt": anchor["timestamp"]}

    msgs = await db["whatsapp_hub_messages"].find(q) \
        .sort("timestamp", -1).limit(limit).to_list(limit)
    msgs.reverse()

    contact = await db["whatsapp_hub_contacts"].find_one({"jid": contact_jid})

    return {
        "contact": contact,
        "messages": [
            {
                "id":            str(m["_id"]),
                "message_id":    m.get("message_id"),
                "session_id":    m.get("session_id"),
                "session_label": m.get("session_label"),
                "direction":     m.get("direction"),
                "from":          m.get("from"),
                "body":          m.get("body"),
                "media_url":     m.get("media_url"),
                "media_type":    m.get("media_type"),
                "timestamp":     m.get("timestamp"),
                "read":          m.get("read", False),
                "assigned_to":   m.get("assigned_to"),
            }
            for m in msgs
        ],
    }


# ── Reply — text ──────────────────────────────────────────────────────────────

@router.post("/reply")
async def hub_reply(body: HubReply, current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    from backend.whatsapp_integration import _get_cached_sessions, _bridge_post, _store_message

    session_id = body.session_id
    if not session_id:
        sessions = await _get_cached_sessions()
        connected = [s for s in sessions if s.get("status") == "connected"]
        if not connected:
            raise HTTPException(503, "No connected WhatsApp session available.")
        session_id = connected[0].get("id") or connected[0].get("sessionId")

    # ★ Resolve @lid JID → real @s.whatsapp.net JID before sending
    send_jid = await _resolve_send_jid(body.jid, session_id)
    phone    = send_jid.split("@")[0]

    try:
        result = await _bridge_post(
            "/send",
            {"to": send_jid, "message": body.message, "sessionId": session_id}
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Bridge error: {exc}")

    db  = _db()
    now = datetime.now(timezone.utc)

    await db["whatsapp_hub_messages"].insert_one({
        "jid":           body.jid,          # store original JID for thread lookup
        "message_id":    result.get("messageId", ""),
        "session_id":    session_id,
        "session_label": session_id,
        "direction":     "out",
        "from":          session_id,
        "to":            phone,
        "contact_name":  None,
        "body":          body.message,
        "media_url":     None,
        "media_type":    None,
        "timestamp":     now,
        "read":          True,
        "assigned_to":   None,
        "sent_by_user":  str(current_user.id),
    })

    await _store_message(
        sent_by=str(current_user.id), to=phone, message=body.message,
        message_type="hub_reply", context_id=None, status_val="sent", session_id=session_id,
    )

    await db["whatsapp_hub_contacts"].update_one(
        {"jid": body.jid},
        {"$set": {"last_message_at": now}},
        upsert=True,
    )

    return {"success": True, "messageId": result.get("messageId")}


# ── Reply — media attachment ──────────────────────────────────────────────────

@router.post("/reply-media")
async def hub_reply_media(body: HubReplyMedia, current_user: User = Depends(get_current_user)):
    """
    Send a media attachment (image, video, PDF, document) from the Hub.
    Accepts base64-encoded file content.  Proxies to the bridge's
    /send-media-base64 endpoint.
    """
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    from backend.whatsapp_integration import _get_cached_sessions, _bridge_post_large

    session_id = body.session_id
    if not session_id:
        sessions = await _get_cached_sessions()
        connected = [s for s in sessions if s.get("status") == "connected"]
        if not connected:
            raise HTTPException(503, "No connected WhatsApp session available.")
        session_id = connected[0].get("id") or connected[0].get("sessionId")

    # ★ Resolve @lid JID
    send_jid = await _resolve_send_jid(body.jid, session_id)
    phone    = send_jid.split("@")[0]

    try:
        result = await _bridge_post_large(
            "/send-media-base64",
            {
                "to":        send_jid,
                "sessionId": session_id,
                "base64":    body.base64,
                "mimeType":  body.mime_type,
                "filename":  body.filename,
                "caption":   body.caption or "",
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Bridge error: {exc}")

    db  = _db()
    now = datetime.now(timezone.utc)

    # Caption or fallback body for the message record
    body_text = body.caption or f"[{body.filename}]"
    media_type = body.mime_type.split("/")[0]  # "image", "video", "application" etc.
    if media_type not in ("image", "video", "audio"):
        media_type = "document"

    await db["whatsapp_hub_messages"].insert_one({
        "jid":           body.jid,
        "message_id":    result.get("messageId", ""),
        "session_id":    session_id,
        "session_label": session_id,
        "direction":     "out",
        "from":          session_id,
        "to":            phone,
        "contact_name":  None,
        "body":          body_text,
        "media_url":     None,
        "media_type":    media_type,
        "timestamp":     now,
        "read":          True,
        "assigned_to":   None,
        "sent_by_user":  str(current_user.id),
        "filename":      body.filename,
    })

    await db["whatsapp_hub_contacts"].update_one(
        {"jid": body.jid},
        {"$set": {"last_message_at": now}},
        upsert=True,
    )

    return {"success": True, "messageId": result.get("messageId"), "filename": body.filename}


# ── Mark read ────────────────────────────────────────────────────────────────

@router.patch("/conversations/{contact_jid:path}/read")
async def hub_mark_read(contact_jid: str, current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")
    db = _db()
    await db["whatsapp_hub_messages"].update_many(
        {"jid": contact_jid, "direction": "in", "read": False},
        {"$set": {"read": True}},
    )
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": contact_jid},
        {"$set": {"unread_count": 0}},
    )
    return {"ok": True}


# ── Unread badge count ────────────────────────────────────────────────────────

@router.get("/unread-count")
async def hub_unread_count(current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        return {"unread": 0, "has_access": False}
    db = _db()
    result = await db["whatsapp_hub_contacts"].aggregate(
        [{"$group": {"_id": None, "total": {"$sum": "$unread_count"}}}]
    ).to_list(1)
    return {"unread": result[0]["total"] if result else 0, "has_access": True}


# ── Delete conversation ───────────────────────────────────────────────────────

@router.delete("/conversations/{contact_jid:path}")
async def hub_delete_conversation(contact_jid: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Only admins can delete conversations.")
    db = _db()
    await db["whatsapp_hub_messages"].delete_many({"jid": contact_jid})
    await db["whatsapp_hub_contacts"].delete_one({"jid": contact_jid})
    return {"ok": True}


# ── Assign conversation ───────────────────────────────────────────────────────

@router.patch("/conversations/{contact_jid:path}/assign")
async def hub_assign(contact_jid: str, body: ConversationAssign, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Only admins can assign conversations.")
    db = _db()
    latest = await db["whatsapp_hub_messages"].find_one({"jid": contact_jid}, sort=[("timestamp", -1)])
    if latest:
        await db["whatsapp_hub_messages"].update_one({"_id": latest["_id"]}, {"$set": {"assigned_to": body.user_id}})
    return {"ok": True, "assigned_to": body.user_id}


# ── Access management ─────────────────────────────────────────────────────────

@router.get("/access")
async def hub_list_access(current_user: User = Depends(require_admin())):
    db = _db()
    users = await db["users"].find({}, {"_id": 1, "name": 1, "email": 1, "role": 1, "wa_hub_access": 1}).to_list(200)
    return {"users": [{"id": str(u["_id"]), "name": u.get("name"), "email": u.get("email"), "role": u.get("role"), "wa_hub_access": u.get("wa_hub_access", False)} for u in users]}


@router.patch("/access/{user_id}")
async def hub_update_access(user_id: str, body: HubAccessUpdate, current_user: User = Depends(require_admin())):
    from bson import ObjectId
    db = _db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user_id")
    result = await db["users"].update_one({"_id": oid}, {"$set": {"wa_hub_access": body.grant}})
    if result.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True, "user_id": user_id, "wa_hub_access": body.grant}


class HubAccessRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


@router.post("/access/request")
async def hub_request_access(body: HubAccessRequest, current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        return {"message": "Admins always have access"}
    if await _has_hub_access(current_user):
        return {"message": "You already have access"}
    db = _db()
    existing = await db["whatsapp_hub_access_requests"].find_one({"user_id": str(current_user.id), "status": "pending"})
    if existing:
        return {"message": "Request already pending"}
    await db["whatsapp_hub_access_requests"].insert_one({
        "user_id": str(current_user.id), "user_name": current_user.name, "user_email": current_user.email,
        "reason": body.reason, "status": "pending", "created_at": datetime.now(timezone.utc),
    })
    return {"message": "Access request submitted. Awaiting admin approval."}


@router.get("/access/requests")
async def hub_list_requests(current_user: User = Depends(require_admin())):
    db = _db()
    reqs = await db["whatsapp_hub_access_requests"].find({"status": "pending"}).to_list(100)
    return {"requests": [{"id": str(r["_id"]), "user_id": r["user_id"], "user_name": r.get("user_name"), "user_email": r.get("user_email"), "reason": r.get("reason"), "created_at": r.get("created_at")} for r in reqs]}


class HubAccessDecision(BaseModel):
    request_id: str
    approved: bool


@router.post("/access/decide")
async def hub_decide_access(body: HubAccessDecision, current_user: User = Depends(require_admin())):
    from bson import ObjectId
    db = _db()
    req = await db["whatsapp_hub_access_requests"].find_one({"_id": ObjectId(body.request_id)})
    if not req:
        raise HTTPException(404, "Request not found")
    new_status = "approved" if body.approved else "rejected"
    await db["whatsapp_hub_access_requests"].update_one({"_id": ObjectId(body.request_id)}, {"$set": {"status": new_status}})
    if body.approved:
        from bson import ObjectId as OID
        await db["users"].update_one({"_id": OID(req["user_id"])}, {"$set": {"wa_hub_access": True}})
    return {"ok": True, "status": new_status}
