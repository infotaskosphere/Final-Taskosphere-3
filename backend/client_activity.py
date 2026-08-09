"""
Client Activity Timeline
========================
Adds a unified, chronological activity feed per client — the foundation of
the CRM upgrade. Two ways to add entries:

1. Manual — a user logs a note / call / meeting via the API (used by the
   frontend timeline's "Add note" / "Log call" composer).
2. Automatic — other modules (WhatsApp hub, email integration, the client
   status-change code in server.py, task assignment, etc.) call
   `log_client_activity(...)` directly to drop a system entry into the same
   feed. This is what makes the timeline feel unified instead of being just
   another notes box.

Mount pattern matches backend/leads.py: a standalone APIRouter included into
api_router in server.py.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
import uuid
import logging

from backend.dependencies import (
    db,
    get_current_user,
    check_module_permission,
    assert_module_permission,
)

router = APIRouter(prefix="/clients/{client_id}/activities", tags=["Client Activity Timeline"])

logger = logging.getLogger(__name__)

ActivityType = Literal[
    "note", "call", "meeting", "whatsapp", "email",
    "status_change", "task", "system", "document",
]


# ====================== MODELS ======================

class ClientActivityCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: ActivityType = "note"
    content: str = Field(..., min_length=1, max_length=5000)
    pinned: bool = False
    metadata: Optional[Dict[str, Any]] = None


class ClientActivityUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    content: Optional[str] = Field(None, min_length=1, max_length=5000)
    pinned: Optional[bool] = None


class ClientActivity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    type: ActivityType
    content: str
    pinned: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_by: str
    created_by_name: str = "System"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    edited_at: Optional[datetime] = None


# ====================== INTERNAL HELPER (import this elsewhere) ======================

async def log_client_activity(
    client_id: str,
    type: ActivityType,
    content: str,
    created_by: str = "system",
    created_by_name: str = "System",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Fire-and-forget logger for other modules to call, e.g.:

        from backend.client_activity import log_client_activity
        await log_client_activity(
            client_id=client["id"],
            type="whatsapp",
            content=f"WhatsApp message sent: {text[:120]}",
            created_by=current_user.id,
            created_by_name=current_user.full_name,
            metadata={"direction": "outbound", "wa_message_id": msg_id},
        )

    Never raises — a logging failure should not break the calling flow.
    """
    try:
        entry = ClientActivity(
            client_id=client_id,
            type=type,
            content=content,
            created_by=created_by,
            created_by_name=created_by_name,
            metadata=metadata or {},
        )
        await db.client_activities.insert_one(entry.model_dump())
    except Exception:
        logger.exception("Failed to log client activity (client_id=%s, type=%s)", client_id, type)


# ====================== ROUTES ======================

@router.get("", response_model=List[ClientActivity])
async def list_client_activities(
    client_id: str,
    type: Optional[ActivityType] = Query(None, description="Filter by activity type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    current_user=Depends(check_module_permission("clients", "view")),
):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    query: Dict[str, Any] = {"client_id": client_id}
    if type:
        query["type"] = type

    skip = (page - 1) * page_size
    cursor = (
        db.client_activities.find(query, {"_id": 0})
        .sort([("pinned", -1), ("created_at", -1)])
        .skip(skip)
        .limit(page_size)
    )
    return await cursor.to_list(page_size)


@router.post("", response_model=ClientActivity, status_code=201)
async def create_client_activity(
    client_id: str,
    payload: ClientActivityCreate,
    current_user=Depends(check_module_permission("clients", "view")),
):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    entry = ClientActivity(
        client_id=client_id,
        type=payload.type,
        content=payload.content.strip(),
        pinned=payload.pinned,
        metadata=payload.metadata or {},
        created_by=current_user.id,
        created_by_name=getattr(current_user, "full_name", None) or "Unknown",
    )
    await db.client_activities.insert_one(entry.model_dump())
    return entry


@router.patch("/{activity_id}", response_model=ClientActivity)
async def update_client_activity(
    client_id: str,
    activity_id: str,
    payload: ClientActivityUpdate,
    current_user=Depends(check_module_permission("clients", "view")),
):
    existing = await db.client_activities.find_one({"id": activity_id, "client_id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Activity not found")

    is_owner = existing.get("created_by") == current_user.id
    if not is_owner and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own entries")

    update_data: Dict[str, Any] = {}
    if payload.content is not None:
        update_data["content"] = payload.content.strip()
        update_data["edited_at"] = datetime.now(timezone.utc)
    if payload.pinned is not None:
        update_data["pinned"] = payload.pinned

    if update_data:
        await db.client_activities.update_one(
            {"id": activity_id, "client_id": client_id}, {"$set": update_data}
        )

    updated = await db.client_activities.find_one({"id": activity_id, "client_id": client_id}, {"_id": 0})
    return updated


@router.delete("/{activity_id}", status_code=204)
async def delete_client_activity(
    client_id: str,
    activity_id: str,
    current_user=Depends(check_module_permission("clients", "view")),
):
    existing = await db.client_activities.find_one({"id": activity_id, "client_id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Activity not found")

    is_owner = existing.get("created_by") == current_user.id
    if not is_owner and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own entries")

    # Manual entries (note/call/meeting) can be deleted; auto-logged system
    # entries (whatsapp/email/status_change/system) are kept for audit trail.
    if existing.get("type") not in ("note", "call", "meeting", "task", "document") and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="System-logged entries cannot be deleted")

    await db.client_activities.delete_one({"id": activity_id, "client_id": client_id})
    return None
