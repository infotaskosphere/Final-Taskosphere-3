from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Literal
from datetime import datetime, timezone
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, EmailStr
import uuid
import logging

from backend.dependencies import db, get_current_user
from backend.server import create_audit_log  # correct location
from backend.models import User  # only if actually needed

router = APIRouter(prefix="/leads", tags=["Leads Management"])
logger = logging.getLogger(__name__)

# ====================== MODELS ======================

class LeadBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company_name: str
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    status: Literal["new", "contacted", "qualified", "won", "lost"] = "new"
    source: Literal["direct", "website", "referral", "social_media", "event"] = "direct"
    next_follow_up: Optional[datetime] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    converted_client_id: Optional[str] = None


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    status: Optional[Literal["new", "contacted", "qualified", "won", "lost"]] = None
    source: Optional[Literal["direct", "website", "referral", "social_media", "event"]] = None
    next_follow_up: Optional[datetime] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    converted_client_id: Optional[str] = None


class Lead(LeadBase):
    id: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ====================== HELPERS ======================

def normalize_lead_doc(doc: dict) -> dict:
    from backend.dependencies import safe_dt

    if not doc:
        return doc

    if "_id" in doc:
        doc["id"] = str(doc["_id"])

    for field in ["created_at", "updated_at", "next_follow_up"]:
        doc[field] = safe_dt(doc.get(field))

    return doc


def validate_obj_id(id_str: str):
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Lead ID: {id_str}",
        )
    return ObjectId(id_str)


# ====================== ROUTES ======================

@router.post("/", response_model=Lead)
async def create_lead(
    lead_data: LeadCreate,
    current_user=Depends(get_current_user),
):
    now = datetime.now(timezone.utc)

    lead_dict = lead_data.model_dump()
    lead_dict.update({
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
    })

    result = await db.leads.insert_one(lead_dict)
    lead_dict["_id"] = result.inserted_id

    return normalize_lead_doc(lead_dict)


@router.get("/", response_model=List[Lead])
async def get_leads(
    status_filter: Optional[Literal["new", "contacted", "qualified", "won", "lost"]] = Query(None, alias="status"),
    current_user=Depends(get_current_user),
):
    query = {}

    permissions = getattr(current_user, "permissions", {})
    if hasattr(permissions, "model_dump"):
        permissions = permissions.model_dump()

    can_view_all = permissions.get("can_view_all_leads", False)

    if current_user.role.lower() != "admin" and not can_view_all:
        query["$or"] = [
            {"assigned_to": current_user.id},
            {"created_by": current_user.id},
        ]

    if status_filter:
        query["status"] = status_filter

    cursor = db.leads.find(query).sort("updated_at", -1)
    leads_raw = await cursor.to_list(length=1000)

    return [normalize_lead_doc(l) for l in leads_raw]


@router.get("/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, current_user=Depends(get_current_user)):
    obj_id = validate_obj_id(lead_id)

    raw_lead = await db.leads.find_one({"_id": obj_id})
    if not raw_lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    return normalize_lead_doc(raw_lead)


@router.patch("/{lead_id}", response_model=Lead)
async def update_lead(
    lead_id: str,
    updates: LeadUpdate,
    current_user=Depends(get_current_user),
):
    obj_id = validate_obj_id(lead_id)

    existing = await db.leads.find_one({"_id": obj_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")

    update_dict = updates.model_dump(exclude_unset=True)

    if update_dict:
        update_dict["updated_at"] = datetime.now(timezone.utc)

        await db.leads.update_one(
            {"_id": obj_id},
            {"$set": update_dict},
        )

        await create_audit_log(
            current_user=current_user,
            action="UPDATE_LEAD",
            module="leads",
            record_id=lead_id,
            old_data={"status": existing.get("status")},
            new_data=update_dict,
        )

    updated_doc = await db.leads.find_one({"_id": obj_id})
    return normalize_lead_doc(updated_doc)


@router.post("/{lead_id}/convert", status_code=status.HTTP_201_CREATED)
async def convert_lead_to_client(
    lead_id: str,
    current_user=Depends(get_current_user),
):
    obj_id = validate_obj_id(lead_id)

    lead = await db.leads.find_one({"_id": obj_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if lead.get("converted_client_id"):
        raise HTTPException(status_code=400, detail="Lead already converted")

    client_id = str(uuid.uuid4())

    client_data = {
        "id": client_id,
        "company_name": lead["company_name"],
        "email": lead.get("email"),
        "phone": lead.get("phone") or "0000000000",
        "client_type": "other",
        "assigned_to": lead.get("assigned_to") or current_user.id,
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "notes": f"Converted from Lead. Original Notes: {lead.get('notes', 'N/A')}",
    }

    await db.clients.insert_one(client_data)

    await db.leads.update_one(
        {"_id": obj_id},
        {
            "$set": {
                "status": "won",
                "converted_client_id": client_id,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    await create_audit_log(
        current_user=current_user,
        action="LEAD_CONVERTED",
        module="leads",
        record_id=lead_id,
        old_data=None,
        new_data={"client_id": client_id},
    )

    return {"message": "Conversion successful", "client_id": client_id}


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, current_user=Depends(get_current_user)):
    if current_user.role.lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrative privileges required.",
        )

    obj_id = validate_obj_id(lead_id)

    result = await db.leads.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    return {"status": "success", "message": "Lead permanently removed"}
