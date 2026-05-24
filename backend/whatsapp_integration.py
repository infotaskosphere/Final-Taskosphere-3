"""
whatsapp_integration.py — WhatsApp QR-based integration router

Architecture:
  - Connects via whatsapp-web.js (local Baileys/WA-Web bridge, no Meta API)
  - Admin can connect/disconnect the shared WhatsApp session via QR scan
  - Non-admin users must request approval to use WhatsApp sending features
  - All sent messages are stored in MongoDB for audit trail
  - Supports: DSC alerts, compliance reminders, birthday wishes
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.dependencies import get_current_user, require_admin, check_permission
from backend.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────

WA_BRIDGE_URL = os.getenv("WA_BRIDGE_URL", "http://localhost:3002")

# ──────────────────────────────────────────────────────────────────────────────
# DB HELPER — lazy import so we don't cause circular deps
# ──────────────────────────────────────────────────────────────────────────────

def _db():
    from backend.server import db
    return db


# ──────────────────────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ──────────────────────────────────────────────────────────────────────────────

class WAAccessRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


class WAAccessDecision(BaseModel):
    user_id: str
    approved: bool
    admin_note: Optional[str] = None


class WASendMessageRequest(BaseModel):
    to: str = Field(..., description="Phone number with country code e.g. 919898989898")
    message: str = Field(..., min_length=1, max_length=4096)
    message_type: str = Field(default="general", description="dsc | compliance | birthday | general")
    context_id: Optional[str] = None       # task / compliance / client id for reference


class WABulkSendRequest(BaseModel):
    recipients: List[str]
    message: str
    message_type: str = "general"
    context_id: Optional[str] = None


class WAIntegrationStatus(BaseModel):
    connected: bool
    phone_number: Optional[str]
    display_name: Optional[str]
    connected_at: Optional[str]
    connected_by: Optional[str]
    qr_available: bool


# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────

async def _bridge_get(path: str) -> Dict[str, Any]:
    """Call the local WA bridge (whatsapp-web.js service)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{WA_BRIDGE_URL}{path}")
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bridge service is not running. Start the wa-bridge service.",
        )
    except Exception as exc:
        logger.error("WA bridge GET %s error: %s", path, exc)
        raise HTTPException(status_code=502, detail=f"WA bridge error: {exc}")


async def _bridge_post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{WA_BRIDGE_URL}{path}", json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp bridge service is not running.",
        )
    except Exception as exc:
        logger.error("WA bridge POST %s error: %s", path, exc)
        raise HTTPException(status_code=502, detail=f"WA bridge error: {exc}")


async def _has_wa_access(user: User) -> bool:
    """Returns True if user is admin OR has approved WA access."""
    if user.role == "admin":
        return True
    db = _db()
    rec = await db["whatsapp_access_requests"].find_one(
        {"user_id": user.id, "status": "approved"}
    )
    return rec is not None


async def _store_message(
    sent_by: str,
    to: str,
    message: str,
    message_type: str,
    context_id: Optional[str],
    status_val: str,
    error: Optional[str] = None,
):
    db = _db()
    await db["whatsapp_messages"].insert_one({
        "sent_by": sent_by,
        "to": to,
        "message": message,
        "message_type": message_type,
        "context_id": context_id,
        "status": status_val,
        "error": error,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    })


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN: CONNECTION MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=WAIntegrationStatus)
async def get_wa_status(current_user: User = Depends(get_current_user)):
    """Return current WhatsApp connection status (all authenticated users)."""
    db = _db()
    config = await db["whatsapp_config"].find_one({"_id": "singleton"}) or {}

    # Ask bridge for live status
    try:
        bridge = await _bridge_get("/status")
        connected = bridge.get("connected", False)
        qr_available = bridge.get("qrAvailable", False)
    except HTTPException:
        connected = False
        qr_available = False

    return WAIntegrationStatus(
        connected=connected,
        phone_number=config.get("phone_number"),
        display_name=config.get("display_name"),
        connected_at=config.get("connected_at"),
        connected_by=config.get("connected_by_name"),
        qr_available=qr_available,
    )


@router.get("/qr")
async def get_qr_code(current_user: User = Depends(require_admin())):
    """
    Admin: get the current QR code image (base64 PNG) from the bridge.
    Triggers bridge to generate a fresh QR if not connected.
    """
    data = await _bridge_get("/qr")
    return {"qr": data.get("qr"), "status": data.get("status")}


@router.post("/connect")
async def initiate_connection(current_user: User = Depends(require_admin())):
    """Admin: tell the bridge to start a new WA session (returns QR)."""
    data = await _bridge_post("/connect", {})
    return data


@router.post("/disconnect")
async def disconnect_wa(current_user: User = Depends(require_admin())):
    """Admin: disconnect the active WhatsApp session."""
    db = _db()
    await _bridge_post("/disconnect", {})
    await db["whatsapp_config"].update_one(
        {"_id": "singleton"},
        {"$set": {
            "phone_number": None,
            "display_name": None,
            "connected": False,
            "disconnected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "WhatsApp disconnected"}


@router.post("/webhook/connected")
async def wa_connected_webhook(payload: Dict[str, Any]):
    """
    Called by the WA bridge when QR scan completes and session is ready.
    Saves phone number + display name to DB.
    """
    db = _db()
    await db["whatsapp_config"].update_one(
        {"_id": "singleton"},
        {"$set": {
            "phone_number": payload.get("phoneNumber"),
            "display_name": payload.get("displayName"),
            "connected": True,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    logger.info("WhatsApp connected: %s (%s)", payload.get("displayName"), payload.get("phoneNumber"))
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# USER GOVERNANCE — ACCESS REQUESTS
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/access/request")
async def request_wa_access(
    body: WAAccessRequest,
    current_user: User = Depends(get_current_user),
):
    """Non-admin: request access to use WhatsApp sending."""
    if current_user.role == "admin":
        return {"message": "Admins always have access"}

    db = _db()
    existing = await db["whatsapp_access_requests"].find_one({
        "user_id": current_user.id,
        "status": {"$in": ["pending", "approved"]},
    })
    if existing:
        return {"message": "Request already exists", "status": existing["status"]}

    await db["whatsapp_access_requests"].insert_one({
        "user_id": current_user.id,
        "user_name": current_user.name,
        "user_email": current_user.email,
        "reason": body.reason,
        "status": "pending",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "decided_by": None,
        "decided_at": None,
        "admin_note": None,
    })
    return {"message": "Access request submitted. Awaiting admin approval."}


@router.get("/access/my-status")
async def my_wa_access_status(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        return {"access": "admin", "status": "approved"}
    db = _db()
    rec = await db["whatsapp_access_requests"].find_one(
        {"user_id": current_user.id},
        sort=[("requested_at", -1)],
    )
    if not rec:
        return {"access": "none", "status": "not_requested"}
    return {
        "access": "user",
        "status": rec["status"],
        "requested_at": rec.get("requested_at"),
        "admin_note": rec.get("admin_note"),
    }


@router.get("/access/requests")
async def list_access_requests(
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_admin()),
):
    """Admin: list all access requests."""
    db = _db()
    query: Dict[str, Any] = {}
    if status_filter:
        query["status"] = status_filter

    cursor = db["whatsapp_access_requests"].find(query).sort("requested_at", -1)
    docs = await cursor.to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


@router.post("/access/decide")
async def decide_access_request(
    body: WAAccessDecision,
    current_user: User = Depends(require_admin()),
):
    """Admin: approve or reject a user's access request."""
    db = _db()
    new_status = "approved" if body.approved else "rejected"
    result = await db["whatsapp_access_requests"].update_one(
        {"user_id": body.user_id, "status": "pending"},
        {"$set": {
            "status": new_status,
            "decided_by": current_user.name,
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "admin_note": body.admin_note,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Pending request not found")
    return {"message": f"Access {new_status}"}


@router.delete("/access/revoke/{user_id}")
async def revoke_wa_access(
    user_id: str,
    current_user: User = Depends(require_admin()),
):
    db = _db()
    await db["whatsapp_access_requests"].update_many(
        {"user_id": user_id, "status": "approved"},
        {"$set": {"status": "revoked", "revoked_by": current_user.name,
                   "revoked_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Access revoked"}


# ──────────────────────────────────────────────────────────────────────────────
# SEND MESSAGES
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_message(
    body: WASendMessageRequest,
    current_user: User = Depends(get_current_user),
):
    """Send a WhatsApp message. Requires admin OR approved access."""
    if not await _has_wa_access(current_user):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to send WhatsApp messages. Request access first.",
        )

    try:
        result = await _bridge_post("/send", {
            "to": body.to,
            "message": body.message,
        })
        await _store_message(
            sent_by=current_user.id,
            to=body.to,
            message=body.message,
            message_type=body.message_type,
            context_id=body.context_id,
            status_val="sent",
        )
        return {"success": True, "messageId": result.get("messageId")}
    except Exception as exc:
        await _store_message(
            sent_by=current_user.id,
            to=body.to,
            message=body.message,
            message_type=body.message_type,
            context_id=body.context_id,
            status_val="failed",
            error=str(exc),
        )
        raise


@router.post("/send/bulk")
async def send_bulk(
    body: WABulkSendRequest,
    current_user: User = Depends(get_current_user),
):
    """Send the same message to multiple recipients."""
    if not await _has_wa_access(current_user):
        raise HTTPException(403, "WhatsApp access not granted")

    results = []
    for recipient in body.recipients:
        try:
            await _bridge_post("/send", {"to": recipient, "message": body.message})
            await _store_message(
                sent_by=current_user.id,
                to=recipient,
                message=body.message,
                message_type=body.message_type,
                context_id=body.context_id,
                status_val="sent",
            )
            results.append({"to": recipient, "status": "sent"})
        except Exception as exc:
            await _store_message(
                sent_by=current_user.id,
                to=recipient,
                message=body.message,
                message_type=body.message_type,
                context_id=body.context_id,
                status_val="failed",
                error=str(exc),
            )
            results.append({"to": recipient, "status": "failed", "error": str(exc)})
        # Small delay to avoid rate limiting
        await asyncio.sleep(0.8)

    return {"results": results}


# ──────────────────────────────────────────────────────────────────────────────
# MESSAGE LOG / HISTORY
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/messages")
async def list_messages(
    message_type: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """Admins see all messages; others see only their own."""
    db = _db()
    query: Dict[str, Any] = {}
    if current_user.role != "admin":
        query["sent_by"] = current_user.id
    if message_type:
        query["message_type"] = message_type

    cursor = db["whatsapp_messages"].find(query).sort("sent_at", -1).limit(limit)
    docs = await cursor.to_list(limit)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


@router.get("/messages/stats")
async def message_stats(current_user: User = Depends(require_admin())):
    db = _db()
    pipeline = [
        {"$group": {
            "_id": "$message_type",
            "total": {"$sum": 1},
            "sent": {"$sum": {"$cond": [{"$eq": ["$status", "sent"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
        }}
    ]
    result = await db["whatsapp_messages"].aggregate(pipeline).to_list(20)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# QUICK-SEND HELPERS (called internally by other modules)
# ──────────────────────────────────────────────────────────────────────────────

async def send_whatsapp_notification(
    to: str,
    message: str,
    message_type: str = "general",
    context_id: Optional[str] = None,
    sent_by: str = "system",
):
    """
    Internal helper: send a WhatsApp message without user auth check.
    Used by compliance, DSC, birthday scheduler.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{WA_BRIDGE_URL}/send",
                json={"to": to, "message": message},
            )
            resp.raise_for_status()
    except Exception as exc:
        logger.error("WA notification send failed to %s: %s", to, exc)
        status_val = "failed"
        error = str(exc)
    else:
        status_val = "sent"
        error = None

    try:
        db = _db()
        await db["whatsapp_messages"].insert_one({
            "sent_by": sent_by,
            "to": to,
            "message": message,
            "message_type": message_type,
            "context_id": context_id,
            "status": status_val,
            "error": error,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN: MANUAL JOB TRIGGERS (for testing / on-demand runs)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/jobs/run/{job_name}")
async def trigger_job_manually(
    job_name: str,
    current_user: User = Depends(require_admin()),
):
    """
    Admin: manually trigger a scheduled WhatsApp notification job.
    job_name: birthday | dsc_expiry | compliance
    """
    from backend.whatsapp_scheduler import (
        _send_birthday_wishes,
        _send_dsc_expiry_alerts,
        _send_compliance_reminders,
    )

    JOBS = {
        "birthday":   _send_birthday_wishes,
        "dsc_expiry": _send_dsc_expiry_alerts,
        "compliance": _send_compliance_reminders,
    }
    fn = JOBS.get(job_name)
    if not fn:
        raise HTTPException(400, f"Unknown job '{job_name}'. Valid: {list(JOBS)}")

    try:
        await fn()
        return {"message": f"Job '{job_name}' completed"}
    except Exception as exc:
        raise HTTPException(500, f"Job failed: {exc}")


@router.get("/jobs/schedule")
async def list_scheduled_jobs(current_user: User = Depends(require_admin())):
    """Admin: list WhatsApp-related APScheduler jobs and their next run times."""
    try:
        from backend.server import scheduler
        jobs = []
        for job in scheduler.get_jobs():
            if job.id.startswith("wa_"):
                jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                })
        return jobs
    except Exception as exc:
        raise HTTPException(500, str(exc))
