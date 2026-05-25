"""
whatsapp_integration.py — Multi-session WhatsApp Web integration

Architecture:
  - Admin can connect MULTIPLE WhatsApp numbers via QR scan
  - Each session lives in the wa-bridge (Node.js / Baileys)
  - Taskosphere backend proxies session management to the bridge
  - All authenticated users with WA access can send from any connected number
  - Full audit trail in MongoDB (whatsapp_messages collection)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time as _time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.dependencies import get_current_user, require_admin
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

WA_BRIDGE_URL = os.getenv("WA_BRIDGE_URL", "http://localhost:3002")

def _db():
    from backend.server import db
    return db

# ── Pydantic models ──────────────────────────────────────────────────────────

class WASessionCreate(BaseModel):
    label: Optional[str] = None

class WAAccessRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)

class WAAccessDecision(BaseModel):
    user_id: str
    approved: bool
    admin_note: Optional[str] = None

class WASendMessageRequest(BaseModel):
    to: str
    message: str = Field(..., min_length=1, max_length=4096)
    message_type: str = "general"
    context_id: Optional[str] = None
    session_id: Optional[str] = None

class WABulkSendRequest(BaseModel):
    recipients: List[str]
    message: str
    message_type: str = "general"
    context_id: Optional[str] = None
    session_id: Optional[str] = None

# ── Bridge helpers ───────────────────────────────────────────────────────────

async def _bridge_get(path: str) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{WA_BRIDGE_URL}{path}")
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "WhatsApp bridge not running. Start wa-bridge.")
    except Exception as e:
        raise HTTPException(502, f"WA bridge error: {e}")

async def _bridge_post(path: str, payload: Dict) -> Dict:
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{WA_BRIDGE_URL}{path}", json=payload)
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "WhatsApp bridge not running.")
    except Exception as e:
        raise HTTPException(502, f"WA bridge error: {e}")

async def _bridge_delete(path: str) -> Dict:
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.delete(f"{WA_BRIDGE_URL}{path}")
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "WhatsApp bridge not running.")
    except Exception as e:
        raise HTTPException(502, f"WA bridge error: {e}")

async def _has_wa_access(user: User) -> bool:
    if user.role == "admin":
        return True
    rec = await _db()["whatsapp_access_requests"].find_one({"user_id": user.id, "status": "approved"})
    return rec is not None

async def _store_message(sent_by, to, message, message_type, context_id, status_val, session_id=None, error=None):
    await _db()["whatsapp_messages"].insert_one({
        "sent_by": sent_by, "to": to, "message": message,
        "message_type": message_type, "context_id": context_id,
        "session_id": session_id, "status": status_val, "error": error,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    })

# ── Multi-session endpoints ──────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(current_user: User = Depends(get_current_user)):
    try:
        data = await _bridge_get("/sessions")
        bridge_sessions = data.get("sessions", [])
    except HTTPException:
        bridge_sessions = []

    db = _db()
    db_records = await db["whatsapp_sessions"].find({}).to_list(100)
    labels = {d["session_id"]: d for d in db_records}

    result = []
    for s in bridge_sessions:
        sid = s["sessionId"]
        db_rec = labels.get(sid, {})
        result.append({
            **s,
            "label": db_rec.get("label") or s.get("displayName") or sid,
            "added_by": db_rec.get("added_by_name"),
        })
    return {"sessions": result}


@router.post("/sessions")
async def add_session(body: WASessionCreate, current_user: User = Depends(require_admin())):
    session_id = f"wa_{int(_time.time() * 1000)}"
    bridge_resp = await _bridge_post("/sessions", {"sessionId": session_id})
    db = _db()
    await db["whatsapp_sessions"].insert_one({
        "session_id": session_id,
        "label": body.label or f"Number {session_id[-6:]}",
        "added_by": current_user.id,
        "added_by_name": current_user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "connecting",
    })
    return {"sessionId": session_id, "label": body.label,
            "message": "Poll /whatsapp/sessions/{id}/qr for QR code."}


@router.get("/sessions/{session_id}/qr")
async def get_session_qr(session_id: str, current_user: User = Depends(require_admin())):
    return await _bridge_get(f"/sessions/{session_id}/qr")


@router.delete("/sessions/{session_id}")
async def remove_session(session_id: str, current_user: User = Depends(require_admin())):
    await _bridge_delete(f"/sessions/{session_id}")
    await _db()["whatsapp_sessions"].delete_one({"session_id": session_id})
    return {"message": f"Session {session_id} removed"}


@router.patch("/sessions/{session_id}/label")
async def update_session_label(session_id: str, body: WASessionCreate, current_user: User = Depends(require_admin())):
    await _db()["whatsapp_sessions"].update_one({"session_id": session_id}, {"$set": {"label": body.label}})
    return {"message": "Label updated"}


# ── Webhooks from bridge ─────────────────────────────────────────────────────

@router.post("/webhook/connected")
async def wa_connected_webhook(payload: Dict[str, Any]):
    session_id = payload.get("sessionId")
    await _db()["whatsapp_sessions"].update_one(
        {"session_id": session_id},
        {"$set": {
            "phone_number": payload.get("phoneNumber"),
            "display_name": payload.get("displayName"),
            "status": "connected",
            "connected_at": payload.get("connectedAt"),
        }},
        upsert=True,
    )
    logger.info("WA connected: %s (%s)", payload.get("displayName"), payload.get("phoneNumber"))
    return {"ok": True}


@router.post("/webhook/disconnected")
async def wa_disconnected_webhook(payload: Dict[str, Any]):
    session_id = payload.get("sessionId")
    if session_id:
        await _db()["whatsapp_sessions"].update_one(
            {"session_id": session_id},
            {"$set": {"status": "disconnected", "disconnected_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"ok": True}


# ── User access requests ─────────────────────────────────────────────────────

@router.post("/access/request")
async def request_wa_access(body: WAAccessRequest, current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        return {"message": "Admins always have access"}
    existing = await _db()["whatsapp_access_requests"].find_one({
        "user_id": current_user.id, "status": {"$in": ["pending", "approved"]}
    })
    if existing:
        return {"message": "Request already exists", "status": existing["status"]}
    await _db()["whatsapp_access_requests"].insert_one({
        "user_id": current_user.id, "user_name": current_user.name,
        "user_email": current_user.email, "reason": body.reason,
        "status": "pending", "requested_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"message": "Access request submitted. Awaiting admin approval."}


@router.get("/access/my-status")
async def my_wa_access_status(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        return {"access": "admin", "status": "approved"}
    rec = await _db()["whatsapp_access_requests"].find_one(
        {"user_id": current_user.id}, sort=[("requested_at", -1)]
    )
    if not rec:
        return {"access": "none", "status": "not_requested"}
    return {"access": "user", "status": rec["status"], "admin_note": rec.get("admin_note")}


@router.get("/access/requests")
async def list_access_requests(status_filter: Optional[str] = None, current_user: User = Depends(require_admin())):
    query = {"status": status_filter} if status_filter else {}
    docs = await _db()["whatsapp_access_requests"].find(query).sort("requested_at", -1).to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


@router.post("/access/decide")
async def decide_access_request(body: WAAccessDecision, current_user: User = Depends(require_admin())):
    new_status = "approved" if body.approved else "rejected"
    result = await _db()["whatsapp_access_requests"].update_one(
        {"user_id": body.user_id, "status": "pending"},
        {"$set": {"status": new_status, "decided_by": current_user.name,
                  "decided_at": datetime.now(timezone.utc).isoformat(), "admin_note": body.admin_note}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Pending request not found")
    return {"message": f"Access {new_status}"}


# ── Send ─────────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_message(body: WASendMessageRequest, current_user: User = Depends(get_current_user)):
    if not await _has_wa_access(current_user):
        raise HTTPException(403, "You do not have permission to send WhatsApp messages.")
    try:
        result = await _bridge_post("/send", {"to": body.to, "message": body.message, "sessionId": body.session_id})
        await _store_message(current_user.id, body.to, body.message, body.message_type, body.context_id, "sent", body.session_id)
        return {"success": True, "messageId": result.get("messageId")}
    except Exception as exc:
        await _store_message(current_user.id, body.to, body.message, body.message_type, body.context_id, "failed", body.session_id, str(exc))
        raise


@router.post("/send/bulk")
async def send_bulk(body: WABulkSendRequest, current_user: User = Depends(get_current_user)):
    if not await _has_wa_access(current_user):
        raise HTTPException(403, "WhatsApp access not granted")
    results = []
    for recipient in body.recipients:
        try:
            await _bridge_post("/send", {"to": recipient, "message": body.message, "sessionId": body.session_id})
            await _store_message(current_user.id, recipient, body.message, body.message_type, body.context_id, "sent", body.session_id)
            results.append({"to": recipient, "status": "sent"})
        except Exception as exc:
            await _store_message(current_user.id, recipient, body.message, body.message_type, body.context_id, "failed", body.session_id, str(exc))
            results.append({"to": recipient, "status": "failed", "error": str(exc)})
        await asyncio.sleep(0.8)
    return {"results": results}


@router.get("/status")
async def get_wa_status(current_user: User = Depends(get_current_user)):
    try:
        data = await _bridge_get("/sessions")
        sessions = data.get("sessions", [])
        connected = [s for s in sessions if s.get("status") == "connected"]
        return {"connected": len(connected) > 0, "sessions_count": len(sessions),
                "connected_count": len(connected)}
    except HTTPException:
        return {"connected": False, "sessions_count": 0, "connected_count": 0}


@router.get("/messages")
async def list_messages(message_type: Optional[str] = None, limit: int = 50, current_user: User = Depends(get_current_user)):
    query: Dict[str, Any] = {}
    if current_user.role != "admin":
        query["sent_by"] = current_user.id
    if message_type:
        query["message_type"] = message_type
    docs = await _db()["whatsapp_messages"].find(query).sort("sent_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


# ── Internal helper ──────────────────────────────────────────────────────────

async def send_whatsapp_notification(to, message, message_type="general", context_id=None, sent_by="system", session_id=None):
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{WA_BRIDGE_URL}/send", json={"to": to, "message": message, "sessionId": session_id})
            r.raise_for_status()
        status_val, error = "sent", None
    except Exception as exc:
        logger.error("WA notification failed to %s: %s", to, exc)
        status_val, error = "failed", str(exc)
    try:
        await _db()["whatsapp_messages"].insert_one({
            "sent_by": sent_by, "to": to, "message": message, "message_type": message_type,
            "context_id": context_id, "session_id": session_id, "status": status_val,
            "error": error, "sent_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass


@router.post("/jobs/run/{job_name}")
async def trigger_job_manually(job_name: str, current_user: User = Depends(require_admin())):
    from backend.whatsapp_scheduler import _send_birthday_wishes, _send_dsc_expiry_alerts, _send_compliance_reminders
    JOBS = {"birthday": _send_birthday_wishes, "dsc_expiry": _send_dsc_expiry_alerts, "compliance": _send_compliance_reminders}
    fn = JOBS.get(job_name)
    if not fn:
        raise HTTPException(400, f"Unknown job '{job_name}'")
    try:
        await fn()
        return {"message": f"Job '{job_name}' completed"}
    except Exception as exc:
        raise HTTPException(500, f"Job failed: {exc}")
