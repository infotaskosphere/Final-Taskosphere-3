from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from .dependencies import get_current_user # Ensure correct path

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
    from backend.server import db
    
    # 1. Admins see everything
    if current_user.role == "admin":
        query = {}
    else:
        # 2. Check for specific permission or if the lead is assigned to them
        permissions = current_user.permissions or {}
        if permissions.get("can_view_all_leads", False):
            query = {}
        else:
            # 3. Staff only see leads assigned to them OR created by them
            query = {
                "$or": [
                    {"assigned_to": current_user.id},
                    {"created_by": current_user.id}
                ]
            }
            
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return leads
