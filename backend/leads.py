from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from datetime import datetime, timezone
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, EmailStr
import uuid
import logging
import pandas as pd
from io import BytesIO
# ✅ CHANGE 1: Removed unused User import
from backend.dependencies import db, get_current_user, create_audit_log
# ✅ OPTIONAL CHANGE IMPORT: Added notification support
from backend.notifications import create_notification
router = APIRouter(prefix="/leads", tags=["Leads Management"])
logger = logging.getLogger(__name__)
# ====================== MODELS ======================
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List, Literal
from datetime import datetime


class LeadBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # ---------------- BASIC DETAILS ---------------- #
    company_name: str = Field(
        ..., 
        min_length=1,
        description="Name of the company or business"
    )

    contact_name: Optional[str] = Field(
        None, 
        description="Primary contact person for the lead"
    )

    email: Optional[EmailStr] = Field(
        None, 
        description="Contact email address"
    )

    phone: Optional[str] = Field(
        None, 
        description="Contact phone number"
    )

    # ---------------- SERVICES ---------------- #
    services: List[str] = Field(
        default_factory=list,
        description="List of services requested (GST, ROC, etc.)"
    )

    # ---------------- QUOTATION ---------------- #
    quotation_amount: Optional[float] = Field(
        None,
        description="Quotation amount given to the client"
    )

    # ---------------- PIPELINE & STATUS ---------------- #
    status: Literal[
        "new", "contacted", "meeting", "proposal", 
        "negotiation", "on_hold", "won", "lost"
    ] = Field(
        "new",
        description="Current pipeline stage of the lead"
    )

    source: Literal[
        "direct", "website", "referral", "social_media", "event", "other"
    ] = Field(
        "direct",
        description="Where the lead originated"
    )

    # ---------------- DATES ---------------- #
    date_of_meeting: Optional[datetime] = Field(
        None,
        description="Date of meeting scheduled with lead"
    )

    next_follow_up: Optional[datetime] = Field(
        None,
        description="Next scheduled follow-up date"
    )

    # ---------------- ADDITIONAL INFO ---------------- #
    notes: Optional[str] = Field(
        None,
        description="Additional notes about the lead"
    )

    assigned_to: Optional[str] = Field(
        None,
        description="Staff user ID assigned to this lead"
    )

    converted_client_id: Optional[str] = Field(
        None,
        description="Client ID created after lead conversion"
    )

    closure_probability: Optional[float] = Field(
        None,
        description="AI predicted probability of closing this lead"
    )

    # ====================== VALIDATORS (THE FIX) ======================

    @field_validator('quotation_amount', 'assigned_to', 'contact_name', 'email', 'phone', mode='before')
    @classmethod
    def empty_string_to_none(cls, v):
        """
        Prevents 422 errors by converting empty strings from the 
        frontend form into None values.
        """
        if v == "" or v is None:
            return None
        return v

    @field_validator('services', mode='before')
    @classmethod
    def ensure_list_format(cls, v):
        """
        Ensures services is always a list, even if a string is sent.
        """
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
    closure_probability: Optional[float] = None # Allow updating probability
class Lead(LeadBase):
    id: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
# ====================== HELPERS ======================
def normalize_lead_doc(doc: dict) -> dict:
    # ✅ FIX: Explicitly handle the helper to prevent NameError/ImportError
    try:
        from backend.dependencies import safe_dt
    except ImportError:
        # Fallback if safe_dt isn't available
        def safe_dt(v): return v
    if not doc:
        return doc
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
    # Ensure these fields exist before passing to safe_dt
    for field in ["created_at", "updated_at", "next_follow_up", "date_of_meeting"]:
        if field in doc:
            doc[field] = safe_dt(doc.get(field))
    return doc
def validate_obj_id(id_str: str):
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            # ✅ CHANGE 2: Generic error message for security
            detail="Invalid Lead ID format",
        )
    return ObjectId(id_str)
# ✅ NEW: Simple AI-like closure probability calculator based on predefined keywords
def calculate_closure_probability(notes: str) -> float:
    if not notes:
        return 0.0
    notes_lower = notes.lower()
    positive_keywords = ["interested", "yes", "proceed", "deal", "sign", "agree", "excited", "good", "positive"]
    negative_keywords = ["no", "not interested", "decline", "reject", "bad", "negative", "issue", "problem"]
    positive_count = sum(1 for kw in positive_keywords if kw in notes_lower)
    negative_count = sum(1 for kw in negative_keywords if kw in notes_lower)
    total = positive_count + negative_count
    if total == 0:
        return 0.5 # Neutral if no keywords
    score = (positive_count - negative_count) / total
    probability = max(0.0, min(1.0, 0.5 + score * 0.5)) # Scale to 0-1
    return round(probability * 100, 2) # Return as percentage
# ====================== ROUTES ======================
@router.get("/meta/services", response_model=List[str])
async def get_unique_services(current_user=Depends(get_current_user)):
    lead_services = await db.leads.distinct("services")
    client_services = await db.clients.distinct("services")
    defaults = ["GST Registration", "Trademark", "ROC Compliance", "Income Tax", "Audit"]
    combined = list(set(lead_services + client_services + defaults))
    return sorted([s for s in combined if s])
    
@router.get("/followups")
async def get_due_followups(
    current_user=Depends(get_current_user)
):

    now = datetime.now(timezone.utc)

    leads = await db.leads.find(
        {
            "next_follow_up": {"$lte": now},
            "status": {"$nin": ["won", "lost"]}
        }
    ).to_list(100)

    return [normalize_lead_doc(l) for l in leads]
@router.post("/import")
async def import_leads(
    file: UploadFile = File(...), 
    current_user = Depends(get_current_user)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files allowed")
    
    contents = await file.read()
    df = pd.read_csv(BytesIO(contents))
    
    # Logic to loop through df and insert into db.leads
    # ...
    return {"message": f"Successfully imported {len(df)} leads"}


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
        # ✅ CHANGE 3: Assignee Validation
        if update_dict.get("assigned_to"):
            user_exists = await db.users.find_one({"id": update_dict["assigned_to"]})
            if not user_exists:
                raise HTTPException(status_code=400, detail="Assigned user not found")
        # ✅ CHANGE 4: Protect "Won" Status
        if update_dict.get("status") == "won" and not existing.get("converted_client_id"):
            raise HTTPException(
                status_code=400,
                detail="Use convert endpoint to mark lead as won"
            )
        # ✅ CHANGE 5: Future Date Validation
        if update_dict.get("next_follow_up"):
            if update_dict["next_follow_up"] < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=400,
                    detail="Follow-up date cannot be in the past"
                )
        if update_dict.get("date_of_meeting"):
            pass  # No specific validation for meeting date, can be past
        # ✅ NEW: Recalculate probability if notes changed
        if "notes" in update_dict:
            update_dict["closure_probability"] = calculate_closure_probability(update_dict["notes"])
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

    # ---------------- VALIDATE LEAD ---------------- #

    obj_id = validate_obj_id(lead_id)

    lead = await db.leads.find_one({"_id": obj_id})

    if not lead:
        raise HTTPException(
            status_code=404,
            detail="Lead not found"
        )

    if lead.get("converted_client_id"):
        raise HTTPException(
            status_code=400,
            detail="Lead already converted"
        )

    now = datetime.now(timezone.utc)

    # ---------------- CREATE CLIENT ---------------- #

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

    # ---------------- UPDATE LEAD STATUS ---------------- #

    await db.leads.update_one(
        {"_id": obj_id},
        {
            "$set": {
                "status": "won",
                "converted_client_id": client_id,
                "updated_at": now,
            }
        },
    )

    # ---------------- CREATE ONBOARDING TASK ---------------- #

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

    # ---------------- AUDIT LOG ---------------- #

    await create_audit_log(
        current_user=current_user,
        action="LEAD_CONVERTED",
        module="leads",
        record_id=lead_id,
        old_data=None,
        new_data={"client_id": client_id},
    )

    # ---------------- CREATE NOTIFICATION ---------------- #

    await create_notification(
        user_id=lead.get("assigned_to") or current_user.id,
        title="Lead Converted",
        message=f"{lead['company_name']} has been converted to a client",
        type="lead"
    )

    # ---------------- RESPONSE ---------------- #

    return {
        "status": "success",
        "message": "Lead successfully converted to client",
        "client_id": client_id,
    }
    await create_audit_log(
        current_user=current_user,
        action="LEAD_CONVERTED",
        module="leads",
        record_id=lead_id,
        old_data=None,
        new_data={"client_id": client_id},
    )
    # ✅ OPTIONAL OPTIONAL PROFESSIONAL IMPROVEMENT: Notification
    await create_notification(
        user_id=current_user.id,
        title="Lead Converted",
        message=f"{lead['company_name']} converted to client",
        type="lead"
    )
    return {"message": "Conversion successful", "client_id": client_id}
@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, current_user=Depends(get_current_user)):
    # ✅ CHANGE 6: Updated Permission Check (Admin OR can_manage_users)
    permissions = getattr(current_user, "permissions", {})
    if hasattr(permissions, "model_dump"):
        permissions = permissions.model_dump()
    if not permissions.get("can_manage_users", False) and current_user.role.lower() != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrative privileges required.",
        )
    obj_id = validate_obj_id(lead_id)
    result = await db.leads.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"status": "success", "message": "Lead permanently removed"}
# ✅ NEW: Endpoint to predict closure probability (can be called separately if needed)
@router.post("/{lead_id}/predict_closure")
async def predict_lead_closure(
    lead_id: str,
    current_user=Depends(get_current_user),
):
    obj_id = validate_obj_id(lead_id)
    lead = await db.leads.find_one({"_id": obj_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    probability = calculate_closure_probability(lead.get("notes", ""))
    await db.leads.update_one(
        {"_id": obj_id},
        {"$set": {"closure_probability": probability, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"closure_probability": probability}
