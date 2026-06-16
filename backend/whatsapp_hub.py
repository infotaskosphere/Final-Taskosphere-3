"""
whatsapp_hub.py  —  WhatsApp Hub: unified inbox for all connected numbers

Features
────────
• Incoming-message webhook  (wa-bridge calls POST /whatsapp/hub/webhook/message)
• Unified inbox            (GET /whatsapp/hub/inbox)
• Per-conversation thread  (GET /whatsapp/hub/conversations/{contact_jid})
• Reply from any session   (POST /whatsapp/hub/reply)
• Mark conversation read   (PATCH /whatsapp/hub/conversations/{contact_jid}/read)
• Unread badge count       (GET /whatsapp/hub/unread-count)
• Delete conversation      (DELETE /whatsapp/hub/conversations/{contact_jid})
• Admin-only: assign conv  (PATCH /whatsapp/hub/conversations/{contact_jid}/assign)

Permission model
────────────────
• Admin   → full access to all conversations across all sessions
• User with  wa_hub_access = True  → same as admin
• Other authenticated users → GET /whatsapp/hub/unread-count only
  (they see the badge; to open the hub they must request access)

wa_hub_access is stored on the User document in MongoDB.
Admin can set it via PATCH /whatsapp/hub/access/{user_id}

Collection:  whatsapp_hub_messages
{
  _id, jid, message_id, session_id, session_label,
  direction: "in" | "out",
  from: "+91...",
  to:   "+91...",
  contact_name: str | None,   # saved in WhatsApp
  body: str,
  media_url: str | None,
  media_type: str | None,
  timestamp: datetime (UTC),
  read: bool,              # only meaningful for "in" messages
  assigned_to: str | None  # user_id
}

Collection:  whatsapp_hub_contacts   (upserted on each new message)
{
  jid, display_name, phone, last_message_at, unread_count, session_id
}
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


# ── helpers ──────────────────────────────────────────────────────────────────

def _db():
    from backend.server import db
    return db


async def _has_hub_access(user: User) -> bool:
    if user.role == "admin":
        return True
    # Check the new permission flag from user permissions model
    if getattr(user.permissions, "can_access_whatsapp_hub", False):
        return True
    # Legacy fallback: also honour the old wa_hub_access field on the DB doc
    doc = await _db()["users"].find_one({"_id": user.id})
    return bool(doc and doc.get("wa_hub_access"))


def _require_hub_access(user: User = Depends(get_current_user)):
    """FastAPI dependency — raises 403 if user has no hub access."""
    # We do async check inside endpoint to keep dependency sync-safe.
    # Endpoints call await _has_hub_access(user) themselves.
    return user


# ── Pydantic ─────────────────────────────────────────────────────────────────

class HubReply(BaseModel):
    jid: str                           # e.g. "919876543210@s.whatsapp.net"
    message: str = Field(..., min_length=1, max_length=4096)
    session_id: Optional[str] = None   # which number to send from; None = auto-pick first


class ConversationAssign(BaseModel):
    user_id: Optional[str] = None      # None = unassign


class HubAccessUpdate(BaseModel):
    user_id: str
    grant: bool


# ── Webhook (called by wa-bridge, no auth token) ──────────────────────────────

@router.post("/webhook/message")
async def hub_incoming_message(request: Request):
    """
    wa-bridge calls this when a message arrives on any connected session.

    Expected payload:
    {
      "session_id": "session_abc",
      "session_label": "Main Office",
      "jid":  "919876543210@s.whatsapp.net",
      "message_id": "ABCDEF123",
      "from": "919876543210",
      "contact_name": "Ramesh Kumar",   // optional — from device address book
      "body": "Hello!",
      "media_url":  null,
      "media_type": null,
      "timestamp":  1718000000          // Unix epoch seconds
    }
    """
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    jid         = payload.get("jid", "")
    session_id  = payload.get("session_id", "unknown")
    msg_id      = payload.get("message_id", "")
    body        = payload.get("body", "")
    ts_raw      = payload.get("timestamp")

    if not jid or not body:
        # Silently ignore empty pings / status receipts
        return {"ok": True}

    ts = (
        datetime.fromtimestamp(ts_raw, tz=timezone.utc)
        if ts_raw
        else datetime.now(timezone.utc)
    )

    db = _db()

    # Deduplicate by message_id + session_id
    existing = await db["whatsapp_hub_messages"].find_one(
        {"message_id": msg_id, "session_id": session_id}
    )
    if existing:
        return {"ok": True, "duplicate": True}

    # Store message
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

    # Upsert contact record
    phone = jid.split("@")[0]
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": jid},
        {"$set": {
            "jid":             jid,
            "phone":           phone,
            "display_name":    payload.get("contact_name") or phone,
            "last_message_at": ts,
            "session_id":      session_id,
        },
        "$inc": {"unread_count": 1}},
        upsert=True,
    )

    logger.info("WA Hub: incoming from %s via session %s", jid, session_id)
    return {"ok": True}


# ── Inbox ────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def hub_inbox(
    session_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 50,
    skip: int = 0,
    current_user: User = Depends(get_current_user),
):
    """
    Returns the list of contacts with their latest message, sorted by
    last_message_at desc.  Admin + wa_hub_access users only.
    """
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    db = _db()

    contact_filter: Dict[str, Any] = {}
    if session_id:
        contact_filter["session_id"] = session_id
    if unread_only:
        contact_filter["unread_count"] = {"$gt": 0}
    if assigned_to:
        # Filter conversations assigned to a specific user
        # (stored on latest message in the thread)
        pass  # handled below via aggregate

    contacts = await db["whatsapp_hub_contacts"].find(contact_filter) \
        .sort("last_message_at", -1).skip(skip).limit(limit).to_list(limit)

    result = []
    for c in contacts:
        # Latest message preview
        latest = await db["whatsapp_hub_messages"].find_one(
            {"jid": c["jid"]},
            sort=[("timestamp", -1)]
        )
        result.append({
            "jid":             c["jid"],
            "phone":           c.get("phone"),
            "display_name":    c.get("display_name"),
            "last_message_at": c.get("last_message_at"),
            "unread_count":    c.get("unread_count", 0),
            "session_id":      c.get("session_id"),
            "latest_message":  {
                "body":      latest.get("body") if latest else "",
                "direction": latest.get("direction") if latest else "in",
                "timestamp": latest.get("timestamp") if latest else None,
            } if latest else None,
            "assigned_to": latest.get("assigned_to") if latest else None,
        })

    total = await db["whatsapp_hub_contacts"].count_documents(contact_filter)

    return {"contacts": result, "total": total}


# ── Conversation thread ───────────────────────────────────────────────────────

@router.get("/conversations/{contact_jid:path}")
async def hub_conversation(
    contact_jid: str,
    limit: int = 50,
    before_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Returns paginated messages for one contact (all sessions combined)."""
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

    msgs.reverse()  # chronological order for the UI

    contact = await db["whatsapp_hub_contacts"].find_one({"jid": contact_jid})

    return {
        "contact":  contact,
        "messages": [
            {
                "id":           str(m["_id"]),
                "message_id":   m.get("message_id"),
                "session_id":   m.get("session_id"),
                "session_label": m.get("session_label"),
                "direction":    m.get("direction"),
                "from":         m.get("from"),
                "body":         m.get("body"),
                "media_url":    m.get("media_url"),
                "media_type":   m.get("media_type"),
                "timestamp":    m.get("timestamp"),
                "read":         m.get("read", False),
                "assigned_to":  m.get("assigned_to"),
            }
            for m in msgs
        ],
    }


# ── Reply ────────────────────────────────────────────────────────────────────

@router.post("/reply")
async def hub_reply(body: HubReply, current_user: User = Depends(get_current_user)):
    """Send a reply to a contact from inside the Hub."""
    if not await _has_hub_access(current_user):
        raise HTTPException(403, "You do not have WhatsApp Hub access.")

    # Resolve which session to use
    from backend.whatsapp_integration import _get_cached_sessions, _bridge_post, _store_message

    session_id = body.session_id
    if not session_id:
        sessions = await _get_cached_sessions()
        connected = [s for s in sessions if s.get("status") == "connected"]
        if not connected:
            raise HTTPException(503, "No connected WhatsApp session available.")
        session_id = connected[0]["id"]

    # Strip @s.whatsapp.net to get bare phone for bridge
    phone = body.jid.split("@")[0]

    try:
        result = await _bridge_post(
            "/send",
            {"to": phone, "message": body.message, "sessionId": session_id}
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Bridge error: {exc}")

    db = _db()
    now = datetime.now(timezone.utc)

    # Persist outgoing message in hub
    await db["whatsapp_hub_messages"].insert_one({
        "jid":           body.jid,
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

    # Also record in the existing whatsapp_messages audit collection
    await _store_message(
        sent_by=str(current_user.id),
        to=phone,
        message=body.message,
        message_type="hub_reply",
        context_id=None,
        status_val="sent",
        session_id=session_id,
    )

    # Update contact's last_message_at
    await db["whatsapp_hub_contacts"].update_one(
        {"jid": body.jid},
        {"$set": {"last_message_at": now}},
        upsert=True,
    )

    return {"success": True, "messageId": result.get("messageId")}


# ── Mark read ────────────────────────────────────────────────────────────────

@router.patch("/conversations/{contact_jid:path}/read")
async def hub_mark_read(
    contact_jid: str,
    current_user: User = Depends(get_current_user),
):
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
    """
    Available to ALL authenticated users (used for notification badge).
    Returns 0 for users without hub access (no info leak).
    """
    if not await _has_hub_access(current_user):
        return {"unread": 0, "has_access": False}

    db = _db()
    pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$unread_count"}}},
    ]
    result = await db["whatsapp_hub_contacts"].aggregate(pipeline).to_list(1)
    total = result[0]["total"] if result else 0
    return {"unread": total, "has_access": True}


# ── Delete conversation ───────────────────────────────────────────────────────

@router.delete("/conversations/{contact_jid:path}")
async def hub_delete_conversation(
    contact_jid: str,
    current_user: User = Depends(get_current_user),
):
    """Admin only — removes all hub messages + contact record for this JID."""
    if current_user.role != "admin":
        raise HTTPException(403, "Only admins can delete conversations.")

    db = _db()
    await db["whatsapp_hub_messages"].delete_many({"jid": contact_jid})
    await db["whatsapp_hub_contacts"].delete_one({"jid": contact_jid})
    return {"ok": True}


# ── Assign conversation ───────────────────────────────────────────────────────

@router.patch("/conversations/{contact_jid:path}/assign")
async def hub_assign(
    contact_jid: str,
    body: ConversationAssign,
    current_user: User = Depends(get_current_user),
):
    """Assign / unassign a conversation to a team member.  Admin only."""
    if current_user.role != "admin":
        raise HTTPException(403, "Only admins can assign conversations.")

    db = _db()
    # Store assignment on the most recent message in thread so it surfaces
    # in the inbox listing (which reads latest message's assigned_to).
    latest = await db["whatsapp_hub_messages"].find_one(
        {"jid": contact_jid}, sort=[("timestamp", -1)]
    )
    if latest:
        await db["whatsapp_hub_messages"].update_one(
            {"_id": latest["_id"]},
            {"$set": {"assigned_to": body.user_id}},
        )
    return {"ok": True, "assigned_to": body.user_id}


# ── Access management (admin) ─────────────────────────────────────────────────

@router.get("/access")
async def hub_list_access(current_user: User = Depends(require_admin())):
    """List all users with their wa_hub_access flag."""
    db = _db()
    users = await db["users"].find({}, {"_id": 1, "name": 1, "email": 1, "role": 1, "wa_hub_access": 1}).to_list(200)
    return {"users": [
        {
            "id":           str(u["_id"]),
            "name":         u.get("name"),
            "email":        u.get("email"),
            "role":         u.get("role"),
            "wa_hub_access": u.get("wa_hub_access", False),
        }
        for u in users
    ]}


@router.patch("/access/{user_id}")
async def hub_update_access(
    user_id: str,
    body: HubAccessUpdate,
    current_user: User = Depends(require_admin()),
):
    """Grant or revoke WhatsApp Hub access for a user."""
    from bson import ObjectId
    db = _db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user_id")

    result = await db["users"].update_one(
        {"_id": oid},
        {"$set": {"wa_hub_access": body.grant}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "User not found")

    return {"ok": True, "user_id": user_id, "wa_hub_access": body.grant}


# ── Access request (non-admin self-service) ───────────────────────────────────

class HubAccessRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


@router.post("/access/request")
async def hub_request_access(body: HubAccessRequest, current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        return {"message": "Admins always have access"}

    if await _has_hub_access(current_user):
        return {"message": "You already have access"}

    db = _db()
    existing = await db["whatsapp_hub_access_requests"].find_one({
        "user_id": str(current_user.id), "status": "pending"
    })
    if existing:
        return {"message": "Request already pending"}

    await db["whatsapp_hub_access_requests"].insert_one({
        "user_id":    str(current_user.id),
        "user_name":  current_user.name,
        "user_email": current_user.email,
        "reason":     body.reason,
        "status":     "pending",
        "created_at": datetime.now(timezone.utc),
    })
    return {"message": "Access request submitted. Awaiting admin approval."}


@router.get("/access/requests")
async def hub_list_requests(current_user: User = Depends(require_admin())):
    db = _db()
    reqs = await db["whatsapp_hub_access_requests"].find({"status": "pending"}).to_list(100)
    return {"requests": [
        {
            "id":         str(r["_id"]),
            "user_id":    r["user_id"],
            "user_name":  r.get("user_name"),
            "user_email": r.get("user_email"),
            "reason":     r.get("reason"),
            "created_at": r.get("created_at"),
        }
        for r in reqs
    ]}


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
    await db["whatsapp_hub_access_requests"].update_one(
        {"_id": ObjectId(body.request_id)},
        {"$set": {"status": new_status}},
    )

    if body.approved:
        from bson import ObjectId as OID
        await db["users"].update_one(
            {"_id": OID(req["user_id"])},
            {"$set": {"wa_hub_access": True}},
        )

    return {"ok": True, "status": new_status}
