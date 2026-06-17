"""
whatsapp_hub.py  —  WhatsApp Hub: unified inbox for all connected numbers

Routes
──────
POST /whatsapp/hub/webhook/message       — bridge → incoming message
POST /whatsapp/hub/webhook/bulk-sync     — bridge → history on connect
GET  /whatsapp/hub/inbox                 — paginated chat list
GET  /whatsapp/hub/conversations/{jid}   — thread (last N messages)
POST /whatsapp/hub/reply                 — send text message
POST /whatsapp/hub/reply-media           — send attachment (base64 JSON)
PATCH /whatsapp/hub/conversations/{jid}/read
GET  /whatsapp/hub/unread-count
DELETE /whatsapp/hub/conversations/{jid}
PATCH /whatsapp/hub/conversations/{jid}/assign
GET  /whatsapp/hub/contacts/{jid}/profile-pic
GET|PATCH /whatsapp/hub/access/*

@lid JID fix
────────────
Baileys multi-device assigns @lid JIDs to contacts — these are Linked Device
IDs, not phone numbers.  When the bridge resolves them (via contacts.upsert +
messaging-history.set) it sends the real @s.whatsapp.net JID.  If a stored JID
is still @lid (old data), this backend calls the bridge's resolve-jid endpoint
before sending so the real phone JID is used.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.dependencies import get_current_user, require_admin
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp/hub", tags=["whatsapp-hub"])


def _db():
    from backend.server import db
    return db


async def _has_hub_access(user: User) -> bool:
    if user.role == "admin":
        return True
    doc = await _db()["users"].find_one({"_id": user.id})
    return bool(doc and doc.get("wa_hub_access"))


async def _resolve_send_jid(jid: str, session_id: str) -> str:
    """If jid is @lid, ask the bridge for the real @s.whatsapp.net JID."""
    if not jid.endswith("@lid"):
        return jid
    from backend.whatsapp_integration import _bridge_get
    try:
        import urllib.parse
        encoded = urllib.parse.quote(jid, safe="")
        result  = await _bridge_get(f"/sessions/{session_id}/resolve-jid?jid={encoded}")
        resolved = result.get("resolved_jid", jid)
        if resolved and resolved != jid:
            logger.info("Resolved @lid %s → %s", jid, resolved)
            return resolved
    except Exception as e:
        logger.warning("JID resolution failed for %s: %s", jid, e)
    return jid


# ── Pydantic ──────────────────────────────────────────────────────────────────

class HubReply(BaseModel):
    jid: str
    message: str = Field(..., min_length=1, max_length=4096)
    session_id: Optional[str] = None


class HubReplyMedia(BaseModel):
    jid: str
    session_id: Optional[str] = None
    base64: str
    mime_type: str
    filename: str = "file"
    caption: Optional[str] = None


class ConversationAssign(BaseModel):
    user_id: Optional[str] = None


class HubAccessUpdate(BaseModel):
    user_id: str
    grant: bool


# ── Webhook: single incoming message ─────────────────────────────────────────

@router.post("/webhook/message")
async def hub_incoming_message(request: Request):
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    jid        = (payload.get("jid") or "").strip()
    session_id = payload.get("session_id", "unknown")
    msg_id     = payload.get("message_id", "")
    body       = payload.get("body", "")

    if not jid or not body:
        return {"ok": True}

    ts_raw = payload.get("timestamp")
    ts     = datetime.fromtimestamp(ts_raw, tz=timezone.utc) if ts_raw else datetime.now(timezone.utc)
    db     = _db()

    if msg_id:
        if await db["whatsapp_hub_messages"].find_one({"message_id": msg_id, "session_id": session_id}):
            return {"ok": True, "duplicate": True}

    phone = jid.split("@")[0]
    await db["whatsapp_hub_messages"].insert_one({
        "jid": jid, "message_id": msg_id,
        "session_id": session_id, "session_label": payload.get("session_label", session_id),
        "direction": "in",
        "from": payload.get("from", phone), "to": session_id,
        "contact_name": payload.get("contact_name"),
        "body": body, "media_url": payload.get("media_url"),
        "media_type": payload.get("media_type"),
        "timestamp": ts, "read": False, "assigned_to": None,
    })

    contact_name = payload.get("contact_name") or phone
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": jid},
        {"$set": {"jid": jid, "phone": phone, "display_name": contact_name, "last_message_at": ts, "session_id": session_id},
         "$inc": {"unread_count": 1}},
        upsert=True,
    )
    return {"ok": True}


# ── Webhook: bulk history sync ────────────────────────────────────────────────

@router.post("/webhook/bulk-sync")
async def hub_bulk_sync(request: Request):
    try:
        raw: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    session_id    = raw.get("session_id", "unknown")
    session_label = raw.get("session_label", session_id)
    db = _db()
    contacts_upserted = 0
    messages_stored   = 0

    for c in raw.get("contacts", []):
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
        last_at = last_at or datetime.now(timezone.utc)
        await db["whatsapp_hub_contacts"].update_one(
            {"jid": jid},
            {"$setOnInsert": {"display_name": display_name, "unread_count": 0, "session_id": session_id},
             "$set": {"jid": jid, "phone": phone},
             "$max": {"last_message_at": last_at}},
            upsert=True,
        )
        contacts_upserted += 1

    for m in raw.get("messages", []):
        jid  = (m.get("jid") or "").strip()
        body = m.get("body", "")
        if not jid or not body:
            continue
        msg_id    = m.get("message_id", "")
        m_session = m.get("session_id", session_id)
        direction = m.get("direction", "in")
        ts_raw    = m.get("timestamp")
        ts        = datetime.fromtimestamp(ts_raw, tz=timezone.utc) if ts_raw else datetime.now(timezone.utc)

        if msg_id:
            if await db["whatsapp_hub_messages"].find_one({"message_id": msg_id, "session_id": m_session}):
                continue

        phone      = jid.split("@")[0]
        contact_nm = m.get("contact_name")
        await db["whatsapp_hub_messages"].insert_one({
            "jid": jid, "message_id": msg_id,
            "session_id": m_session, "session_label": m.get("session_label", session_label),
            "direction": direction,
            "from": m.get("from_phone", phone), "to": m_session if direction == "out" else phone,
            "contact_name": contact_nm, "body": body,
            "media_url": None, "media_type": None,
            "timestamp": ts, "read": direction == "out", "assigned_to": None,
        })
        messages_stored += 1

        await db["whatsapp_hub_contacts"].update_one(
            {"jid": jid},
            {"$set": {"jid": jid, "phone": phone, "session_id": m_session},
             "$max": {"last_message_at": ts},
             "$setOnInsert": {"display_name": contact_nm or phone, "unread_count": 0}},
            upsert=True,
        )
        if contact_nm and contact_nm != phone:
            await db["whatsapp_hub_contacts"].update_one(
                {"jid": jid, "$or": [{"display_name": {"$exists": False}}, {"display_name": phone}]},
                {"$set": {"display_name": contact_nm}},
            )

    logger.info("WA Hub bulk-sync: session=%s contacts=%d messages=%d", session_id, contacts_upserted, messages_stored)
    return {"ok": True, "contacts_upserted": contacts_upserted, "messages_stored": messages_stored}


# ── Inbox ─────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def hub_inbox(
    session_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 200,
    skip: int = 0,
    current_user: User = Depends(get_current_user),
):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")
    db     = _db()
    filt: Dict[str, Any] = {}
    if session_id:  filt["session_id"] = session_id
    if unread_only: filt["unread_count"] = {"$gt": 0}

    contacts = await db["whatsapp_hub_contacts"].find(filt) \
        .sort("last_message_at", -1).skip(skip).limit(limit).to_list(limit)
    result = []
    for c in contacts:
        latest = await db["whatsapp_hub_messages"].find_one({"jid": c["jid"]}, sort=[("timestamp", -1)])
        result.append({
            "jid":             c["jid"],
            "phone":           c.get("phone"),
            "display_name":    c.get("display_name"),
            "last_message_at": c.get("last_message_at"),
            "unread_count":    c.get("unread_count", 0),
            "session_id":      c.get("session_id"),
            "profile_pic_url": c.get("profile_pic_url"),
            "latest_message":  {
                "body":      latest.get("body", "") if latest else "",
                "direction": latest.get("direction", "in") if latest else "in",
                "timestamp": latest.get("timestamp") if latest else None,
            } if latest else None,
        })
    total = await db["whatsapp_hub_contacts"].count_documents(filt)
    return {"contacts": result, "total": total}


# ── Profile picture proxy ─────────────────────────────────────────────────────

@router.get("/contacts/{contact_jid:path}/profile-pic")
async def hub_contact_profile_pic(
    contact_jid: str,
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "No access")
    from backend.whatsapp_integration import _bridge_get, _get_cached_sessions
    db = _db()

    cached = await db["whatsapp_hub_contacts"].find_one({"jid": contact_jid})
    if cached and cached.get("profile_pic_url"):
        return {"url": cached["profile_pic_url"], "jid": contact_jid, "cached": True}

    if not session_id:
        all_sessions = await _get_cached_sessions()
        connected    = [s for s in all_sessions if s.get("status") == "connected"]
        if not connected:
            return {"url": None, "jid": contact_jid}
        session_id = connected[0].get("sessionId") or connected[0].get("id")

    import urllib.parse
    phone = contact_jid.split("@")[0]
    try:
        enc = urllib.parse.quote(f"{phone}@s.whatsapp.net", safe="")
        result = await _bridge_get(f"/sessions/{session_id}/contacts/{enc}/profile-pic")
        url = result.get("url")
        if url:
            await db["whatsapp_hub_contacts"].update_one({"jid": contact_jid}, {"$set": {"profile_pic_url": url}})
        return {"url": url, "jid": contact_jid, "cached": False}
    except Exception as e:
        logger.debug("Profile pic fetch failed: %s", e)
        return {"url": None, "jid": contact_jid}


# ── Conversation thread ───────────────────────────────────────────────────────

@router.get("/conversations/{contact_jid:path}")
async def hub_conversation(
    contact_jid: str,
    limit: int = 80,
    current_user: User = Depends(get_current_user),
):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "No access")
    db   = _db()
    msgs = await db["whatsapp_hub_messages"].find({"jid": contact_jid}) \
        .sort("timestamp", -1).limit(limit).to_list(limit)
    msgs.reverse()
    contact = await db["whatsapp_hub_contacts"].find_one({"jid": contact_jid})
    return {
        "contact": contact,
        "messages": [{
            "id":            str(m["_id"]),
            "message_id":    m.get("message_id"),
            "session_id":    m.get("session_id"),
            "session_label": m.get("session_label"),
            "direction":     m.get("direction"),
            "from":          m.get("from"),
            "body":          m.get("body"),
            "media_url":     m.get("media_url"),
            "media_type":    m.get("media_type"),
            "filename":      m.get("filename"),
            "timestamp":     m.get("timestamp"),
            "read":          m.get("read", False),
            "assigned_to":   m.get("assigned_to"),
        } for m in msgs],
    }


# ── Reply — text ──────────────────────────────────────────────────────────────

@router.post("/reply")
async def hub_reply(body: HubReply, current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "No access")
    from backend.whatsapp_integration import _get_cached_sessions, _bridge_post

    session_id = body.session_id
    if not session_id:
        sess = await _get_cached_sessions()
        conn = [s for s in sess if s.get("status") == "connected"]
        if not conn:
            raise HTTPException(503, "No connected WhatsApp session")
        session_id = conn[0].get("id") or conn[0].get("sessionId")

    # ★ Resolve @lid before sending
    send_jid = await _resolve_send_jid(body.jid, session_id)
    phone    = send_jid.split("@")[0]

    try:
        result = await _bridge_post("/send", {"to": send_jid, "message": body.message, "sessionId": session_id})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Bridge error: {exc}")

    db  = _db()
    now = datetime.now(timezone.utc)
    await db["whatsapp_hub_messages"].insert_one({
        "jid": body.jid, "message_id": result.get("messageId", ""),
        "session_id": session_id, "session_label": session_id,
        "direction": "out", "from": session_id, "to": phone,
        "contact_name": None, "body": body.message,
        "media_url": None, "media_type": None,
        "timestamp": now, "read": True, "assigned_to": None,
        "sent_by_user": str(current_user.id),
    })
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": body.jid}, {"$set": {"last_message_at": now}}, upsert=True,
    )
    return {"success": True, "messageId": result.get("messageId")}


# ── Reply — media ─────────────────────────────────────────────────────────────

@router.post("/reply-media")
async def hub_reply_media(body: HubReplyMedia, current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "No access")
    from backend.whatsapp_integration import _get_cached_sessions, _bridge_post_large

    session_id = body.session_id
    if not session_id:
        sess = await _get_cached_sessions()
        conn = [s for s in sess if s.get("status") == "connected"]
        if not conn:
            raise HTTPException(503, "No connected WhatsApp session")
        session_id = conn[0].get("id") or conn[0].get("sessionId")

    send_jid = await _resolve_send_jid(body.jid, session_id)
    phone    = send_jid.split("@")[0]

    try:
        result = await _bridge_post_large("/send-media-base64", {
            "to": send_jid, "sessionId": session_id,
            "base64": body.base64, "mimeType": body.mime_type,
            "filename": body.filename, "caption": body.caption or "",
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Bridge error: {exc}")

    db        = _db()
    now       = datetime.now(timezone.utc)
    body_text = body.caption or f"[{body.filename}]"
    mt        = body.mime_type.split("/")[0]
    if mt not in ("image", "video", "audio"):
        mt = "document"

    await db["whatsapp_hub_messages"].insert_one({
        "jid": body.jid, "message_id": result.get("messageId", ""),
        "session_id": session_id, "session_label": session_id,
        "direction": "out", "from": session_id, "to": phone,
        "contact_name": None, "body": body_text,
        "media_url": None, "media_type": mt, "filename": body.filename,
        "timestamp": now, "read": True, "assigned_to": None,
        "sent_by_user": str(current_user.id),
    })
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": body.jid}, {"$set": {"last_message_at": now}}, upsert=True,
    )
    return {"success": True, "messageId": result.get("messageId"), "filename": body.filename}


# ── Mark read ────────────────────────────────────────────────────────────────

@router.patch("/conversations/{contact_jid:path}/read")
async def hub_mark_read(contact_jid: str, current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "No access")
    db = _db()
    await db["whatsapp_hub_messages"].update_many(
        {"jid": contact_jid, "direction": "in", "read": False}, {"$set": {"read": True}})
    await db["whatsapp_hub_contacts"].update_one({"jid": contact_jid}, {"$set": {"unread_count": 0}})
    return {"ok": True}


# ── Unread count ──────────────────────────────────────────────────────────────

@router.get("/unread-count")
async def hub_unread_count(current_user: User = Depends(get_current_user)):
    if not await _has_hub_access(current_user):
        return {"unread": 0, "has_access": False}
    db = _db()
    r  = await db["whatsapp_hub_contacts"].aggregate(
        [{"$group": {"_id": None, "total": {"$sum": "$unread_count"}}}]).to_list(1)
    return {"unread": r[0]["total"] if r else 0, "has_access": True}


# ── Delete conversation ───────────────────────────────────────────────────────

@router.delete("/conversations/{contact_jid:path}")
async def hub_delete_conversation(contact_jid: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Admins only")
    db = _db()
    await db["whatsapp_hub_messages"].delete_many({"jid": contact_jid})
    await db["whatsapp_hub_contacts"].delete_one({"jid": contact_jid})
    return {"ok": True}


# ── Assign ────────────────────────────────────────────────────────────────────

@router.patch("/conversations/{contact_jid:path}/assign")
async def hub_assign(contact_jid: str, body: ConversationAssign, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Admins only")
    db     = _db()
    latest = await db["whatsapp_hub_messages"].find_one({"jid": contact_jid}, sort=[("timestamp", -1)])
    if latest:
        await db["whatsapp_hub_messages"].update_one({"_id": latest["_id"]}, {"$set": {"assigned_to": body.user_id}})
    return {"ok": True, "assigned_to": body.user_id}


# ── Access management ─────────────────────────────────────────────────────────

@router.get("/access")
async def hub_list_access(current_user: User = Depends(require_admin())):
    db    = _db()
    users = await db["users"].find({}, {"_id":1,"name":1,"email":1,"role":1,"wa_hub_access":1}).to_list(200)
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
    if current_user.role == "admin" or await _has_hub_access(current_user):
        return {"message": "Already have access"}
    db       = _db()
    existing = await db["whatsapp_hub_access_requests"].find_one({"user_id": str(current_user.id), "status": "pending"})
    if existing:
        return {"message": "Request already pending"}
    await db["whatsapp_hub_access_requests"].insert_one({
        "user_id": str(current_user.id), "user_name": current_user.name, "user_email": current_user.email,
        "reason": body.reason, "status": "pending", "created_at": datetime.now(timezone.utc),
    })
    return {"message": "Access request submitted."}


@router.get("/access/requests")
async def hub_list_requests(current_user: User = Depends(require_admin())):
    db   = _db()
    reqs = await db["whatsapp_hub_access_requests"].find({"status": "pending"}).to_list(100)
    return {"requests": [{"id": str(r["_id"]), "user_id": r["user_id"], "user_name": r.get("user_name"), "user_email": r.get("user_email"), "reason": r.get("reason"), "created_at": r.get("created_at")} for r in reqs]}


class HubAccessDecision(BaseModel):
    request_id: str
    approved: bool


@router.post("/access/decide")
async def hub_decide_access(body: HubAccessDecision, current_user: User = Depends(require_admin())):
    from bson import ObjectId
    db  = _db()
    req = await db["whatsapp_hub_access_requests"].find_one({"_id": ObjectId(body.request_id)})
    if not req:
        raise HTTPException(404, "Not found")
    status = "approved" if body.approved else "rejected"
    await db["whatsapp_hub_access_requests"].update_one({"_id": ObjectId(body.request_id)}, {"$set": {"status": status}})
    if body.approved:
        await db["users"].update_one({"_id": ObjectId(req["user_id"])}, {"$set": {"wa_hub_access": True}})
    return {"ok": True, "status": status}
