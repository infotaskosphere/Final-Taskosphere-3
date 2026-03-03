from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from .dependencies import get_current_user # Ensure this path is correct

router = APIRouter(prefix="/api/leads", tags=["Leads"])

class LeadCreate(BaseModel):
    client_name: str
    contact_number: str
    email: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None # Staff User ID

@router.post("/")
async def create_lead(lead_data: LeadCreate, current_user = Depends(get_current_user)):
    from .main import db # Import your DB instance
    
    lead_doc = lead_data.model_dump()
    lead_doc.update({
        "id": str(uuid.uuid4()),
        "source": "manual",
        "status": "new",
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    await db.leads.insert_one(lead_doc)
    return {"status": "success", "lead_id": lead_doc["id"]}

@router.get("/")
async def get_leads(current_user = Depends(get_current_user)):
    from .main import db
    # Admins see all; Staff see only leads assigned to them
    query = {} if current_user.role == "admin" else {"assigned_to": current_user.id}
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return leads

@router.patch("/{lead_id}/assign")
async def assign_lead(lead_id: str, staff_id: str, current_user = Depends(get_current_user)):
    from .main import db
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can assign leads")
    
    await db.leads.update_one({"id": lead_id}, {"$set": {"assigned_to": staff_id}})
    return {"message": "Lead assigned successfully"}
