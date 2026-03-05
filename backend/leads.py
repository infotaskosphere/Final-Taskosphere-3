from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from datetime import datetime, timezone
from bson import ObjectId
import uuid
import logging
import pandas as pd
from io import BytesIO

from backend.dependencies import (
    db,
    get_current_user,
    create_audit_log,
    apply_data_scope,
    verify_record_access,
    verify_record_edit_access,
    verify_record_delete_access,
    has_permission,
    get_team_user_ids
)

from backend.notifications import create_notification

router = APIRouter(prefix="/leads", tags=["Leads Management"])

logger = logging.getLogger(__name__)


# ====================== MODELS ======================

class LeadBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # ---------------- BASIC DETAILS ----------------
    company_name: str = Field(..., description="Name of the company or business")
    contact_name: Optional[str] = Field(None)
    email: Optional[EmailStr] = Field(None)
    phone: Optional[str] = Field(None)

    # ---------------- SERVICES & DEAL ----------------
    services: List[str] = Field(default_factory=list)
    quotation_amount: Optional[float] = Field(None)

    # ---------------- PIPELINE STATUS ----------------
    status: Literal["new", "contacted", "meeting", "proposal", "negotiation", "on_hold", "won", "lost"] = "new"
    source: Optional[str] = "direct"

    # ---------------- DATES & ASSIGNMENT ----------------
    date_of_meeting: Optional[datetime] = None
    next_follow_up: Optional[datetime] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    converted_client_id: Optional[str] = None
    closure_probability: Optional[float] = None

    # ====================== VALIDATORS ======================
    @field_validator('quotation_amount', 'assigned_to', 'contact_name', 'email', 'phone', mode='before')
    @classmethod
    def empty_string_to_none(cls, v):
        """Converts empty strings from frontend to None"""
        if v == "" or v is None:
            return None
        return v

    @field_validator('services', mode='before')
    @classmethod
    def ensure_list_format(cls, v):
        """Convert comma-separated string to list if needed"""
        if isinstance(v, str):
            return [s.strip() for s in v.split(',') if s.strip()]
        return v or []


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    services: Optional[List[str]] = None
    quotation_amount: Optional[float] = None
    date_of_meeting: Optional[datetime] = None
    status: Optional[Literal["new", "contacted", "qualified", "won", "lost"]] = None
    source: Optional[Literal["direct", "website", "referral", "social_media", "event"]] = None
    next_follow_up: Optional[datetime] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    converted_client_id: Optional[str] = None
    closure_probability: Optional[float] = None


class Lead(LeadBase):
    id: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ====================== HELPERS ======================

def normalize_lead_doc(doc: dict) -> dict:
    """Normalize MongoDB document for API response"""
    if not doc:
        return doc

    if "_id" in doc:
        doc["id"] = str(doc["_id"])

    # Safely convert datetime fields
    for field in ["created_at", "updated_at", "next_follow_up", "date_of_meeting"]:
        if field in doc and doc[field]:
            doc[field] = doc[field].isoformat() if hasattr(doc[field], 'isoformat') else doc[field]

    return doc


def validate_obj_id(id_str: str):
    """Validate MongoDB ObjectId format"""
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Lead ID format"
        )
    return ObjectId(id_str)


def calculate_closure_probability(notes: str) -> float:
    """Calculate lead closure probability based on notes sentiment"""
    if not notes:
        return 0.0
    notes_lower = notes.lower()
    positive_keywords = ["interested", "yes", "proceed", "deal", "sign", "agree", "excited", "good", "positive"]
    negative_keywords = ["no", "not interested", "decline", "reject", "bad", "negative", "issue", "problem"]
    positive_count = sum(1 for kw in positive_keywords if kw in notes_lower)
    negative_count = sum(1 for kw in negative_keywords if kw in notes_lower)
    total = positive_count + negative_count
    if total == 0:
        return 50.0
    score = (positive_count - negative_count) / total
    probability = max(0.0, min(1.0, 0.5 + score * 0.5))
    return round(probability * 100, 2)


# ====================== ROUTES ======================

@router.get("/meta/services", response_model=List[str])
async def get_unique_services(current_user=Depends(get_current_user)):
    """Get list of all available services"""
    lead_services = await db.leads.distinct("services")
    client_services = await db.clients.distinct("services")
    defaults = ["GST Registration", "Trademark", "ROC Compliance", "Income Tax", "Audit"]
    combined = list(set(lead_services + client_services + defaults))
    return sorted([s for s in combined if s])


@router.get("/followups")
async def get_due_followups(current_user=Depends(get_current_user)):
    """Get leads with overdue follow-ups"""
    now = datetime.now(timezone.utc)

    scope_filter = await apply_data_scope(current_user, "assigned_to")

    query = {
        "next_follow_up": {"$lte": now},
        "status": {"$nin": ["won", "lost"]}
    }
    query.update(scope_filter)

    leads = await db.leads.find(query).to_list(100)
    return [normalize_lead_doc(l) for l in leads]


@router.post("/import")
async def import_leads(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    """Import leads from CSV file"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files allowed")

    contents = await file.read()
    df = pd.read_csv(BytesIO(contents))

    # TODO: implement proper import logic with validation + assigned_to mapping
    # count = 0
    # for _, row in df.iterrows():
    #     ...

    return {"message": f"Imported {len(df)} leads (processing logic pending)"}


@router.post("/", response_model=Lead)
async def create_lead(
    lead_data: LeadCreate,
    current_user=Depends(get_current_user),
):
    """
    CREATE LEAD
    
    PERMISSION HIERARCHY:
    • Any authenticated user can create leads
    • Leads are assigned to creator by default
    """
    now = datetime.now(timezone.utc)
    lead_dict = lead_data.model_dump()

    lead_dict.update({
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
    })

    result = await db.leads.insert_one(lead_dict)
    lead_dict["_id"] = result.inserted_id

    # Audit log
    await create_audit_log(
        current_user=current_user,
        action="CREATE_LEAD",
        module="leads",
        record_id=str(result.inserted_id),
        new_data=lead_dict,
    )

    return normalize_lead_doc(lead_dict)


@router.get("/", response_model=List[Lead])
async def get_leads(
    status_filter: Optional[Literal["new", "contacted", "qualified", "won", "lost"]] = Query(None, alias="status"),
    current_user=Depends(get_current_user),
):
    """
    VIEW LEADS
    
    PERMISSION HIERARCHY:
    1. Admin → all leads
    2. Universal permission (can_view_all_leads) → all leads
    3. Default (assigned_to or created_by) → own leads
    
    Frontend Note: Manager can view team's leads by default
    """
    query = {}
    
    # Apply data scope based on role and permissions
    # Admins see all leads
    if current_user.role == "admin":
        scope_filter = {}
    # Check universal permission
    elif has_permission(current_user, "can_view_all_leads"):
        scope_filter = {}
    # Default: own leads (handles manager team access)
    else:
        scope_filter = await apply_data_scope(current_user, "assigned_to")
    
    query.update(scope_filter)

    if status_filter:
        query["status"] = status_filter

    cursor = db.leads.find(query).sort("updated_at", -1)
    leads_raw = await cursor.to_list(length=1000)

    return [normalize_lead_doc(l) for l in leads_raw]


@router.get("/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, current_user=Depends(get_current_user)):
    """
    VIEW SINGLE LEAD
    
    PERMISSION HIERARCHY:
    1. Admin → all leads
    2. Universal permission (can_view_all_leads) → all leads
    3. Ownership (assigned_to or created_by) → own leads
    """
    obj_id = validate_obj_id(lead_id)

    raw_lead = await db.leads.find_one({"_id": obj_id})
    if not raw_lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Admin bypass
    if current_user.role != "admin":
        # Check universal permission
        if not has_permission(current_user, "can_view_all_leads"):
            # Fall back to ownership check
            await verify_record_access(
                current_user,
                record_owner_id=raw_lead.get("assigned_to"),
                record_created_by=raw_lead.get("created_by"),
                module="leads"
            )

    return normalize_lead_doc(raw_lead)


@router.patch("/{lead_id}", response_model=Lead)
async def update_lead(
    lead_id: str,
    updates: LeadUpdate,
    current_user=Depends(get_current_user),
):
    """
    EDIT LEAD
    
    PERMISSION HIERARCHY:
    1. Admin → edit all
    2. Universal permission (can_edit_tasks) → edit all
    3. Ownership (assigned_to or created_by) → can edit own
    """
    obj_id = validate_obj_id(lead_id)

    existing = await db.leads.find_one({"_id": obj_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Verify edit permission
    await verify_record_edit_access(
        current_user,
        record_owner_id=existing.get("assigned_to"),
        record_created_by=existing.get("created_by"),
        module="leads"
    )

    update_dict = updates.model_dump(exclude_unset=True)
    if not update_dict:
        return normalize_lead_doc(existing)

    # Assignee validation
    if update_dict.get("assigned_to"):
        user_exists = await db.users.find_one({"id": update_dict["assigned_to"]})
        if not user_exists:
            raise HTTPException(status_code=400, detail="Assigned user not found")

    # Protect won status transition
    if update_dict.get("status") == "won" and not existing.get("converted_client_id"):
        raise HTTPException(
            status_code=400,
            detail="Use convert endpoint to mark lead as won"
        )

    # Future follow-up date validation
    if update_dict.get("next_follow_up"):
        if update_dict["next_follow_up"] < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400,
                detail="Follow-up date cannot be in the past"
            )

    # Auto-calculate probability when notes are updated
    if "notes" in update_dict:
        update_dict["closure_probability"] = calculate_closure_probability(update_dict["notes"])

    update_dict["updated_at"] = datetime.now(timezone.utc)

    await db.leads.update_one(
        {"_id": obj_id},
        {"$set": update_dict}
    )

    # Audit log
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
    """
    CONVERT LEAD TO CLIENT
    
    PERMISSION HIERARCHY:
    1. Admin → convert any lead
    2. Ownership (assigned_to or created_by) → convert own leads
    """
    obj_id = validate_obj_id(lead_id)

    lead = await db.leads.find_one({"_id": obj_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Verify access
    await verify_record_access(
        current_user,
        record_owner_id=lead.get("assigned_to"),
        record_created_by=lead.get("created_by"),
        module="leads"
    )

    if lead.get("converted_client_id"):
        raise HTTPException(status_code=400, detail="Lead already converted")

    now = datetime.now(timezone.utc)

    # Create client
    client_id = str(uuid.uuid4())
    client_data = {
        "id": client_id,
        "company_name": lead["company_name"],
        "contact_name": lead.get("contact_name"),
        "email": lead.get("email"),
        "phone": lead.get("phone") or "0000000000",
        "services": lead.get("services", []),
        "client_type": "other",
        "assigned_to": lead.get("assigned_to") or current_user.id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "notes": f"Converted from Lead. Original Notes: {lead.get('notes', 'N/A')}",
    }

    await db.clients.insert_one(client_data)

    # Update lead
    await db.leads.update_one(
        {"_id": obj_id},
        {
            "$set": {
                "status": "won",
                "converted_client_id": client_id,
                "updated_at": now,
            }
        }
    )

    # Create onboarding task
    task = {
        "id": str(uuid.uuid4()),
        "title": f"Client Onboarding - {lead['company_name']}",
        "description": "Lead converted to client. Start onboarding process.",
        "assigned_to": lead.get("assigned_to") or current_user.id,
        "status": "pending",
        "priority": "medium",
        "created_by": current_user.id,
        "client_id": client_id,
        "lead_id": str(obj_id),
        "created_at": now,
        "updated_at": now,
    }
    await db.tasks.insert_one(task)

    # Audit + Notifications
    await create_audit_log(
        current_user=current_user,
        action="LEAD_CONVERTED",
        module="leads",
        record_id=lead_id,
        old_data=None,
        new_data={"client_id": client_id},
    )

    target_user = lead.get("assigned_to") or current_user.id

    await create_notification(
        user_id=target_user,
        title="Lead Converted",
        message=f"{lead['company_name']} has been converted to a client",
        type="lead"
    )

    if target_user != current_user.id:
        await create_notification(
            user_id=current_user.id,
            title="Lead Converted",
            message=f"You converted {lead['company_name']} to client",
            type="lead"
        )

    return {
        "status": "success",
        "message": "Lead successfully converted to client",
        "client_id": client_id
    }


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, current_user=Depends(get_current_user)):
    """
    DELETE LEAD
    
    PERMISSION HIERARCHY:
    1. Admin only
    2. Creator (created_by) only
    """
    obj_id = validate_obj_id(lead_id)

    existing = await db.leads.find_one({"_id": obj_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Verify delete permission (admin or creator only)
    await verify_record_delete_access(
        current_user,
        record_created_by=existing.get("created_by"),
        module="leads"
    )

    result = await db.leads.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Audit log
    await create_audit_log(
        current_user=current_user,
        action="DELETE_LEAD",
        module="leads",
        record_id=lead_id,
        old_data=None,
        new_data=None
    )

    return {"status": "success", "message": "Lead permanently removed"}


@router.post("/{lead_id}/predict_closure")
async def predict_lead_closure(
    lead_id: str,
    current_user=Depends(get_current_user),
):
    """
    PREDICT LEAD CLOSURE
    
    PERMISSION HIERARCHY:
    Same as VIEW (user must be able to view the lead to predict closure)
    """
    obj_id = validate_obj_id(lead_id)

    lead = await db.leads.find_one({"_id": obj_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Verify access (same as view)
    await verify_record_access(
        current_user,
        record_owner_id=lead.get("assigned_to"),
        record_created_by=lead.get("created_by"),
        module="leads"
    )

    probability = calculate_closure_probability(lead.get("notes", ""))

    await db.leads.update_one(
        {"_id": obj_id},
        {
            "$set": {
                "closure_probability": probability,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

    return {"closure_probability": probability}
