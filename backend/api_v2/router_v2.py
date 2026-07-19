import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from backend.dependencies import get_current_user

# Import our new modules
from backend.platform.tenant_manager import TenantManager
from backend.platform.feature_manager import FeatureManager
from backend.copilot.copilot_engine import CopilotEngine
from backend.copilot.action_engine import ActionEngine
from backend.search.enterprise_search import EnterpriseSearch
from backend.exports.json_export import JSONExport
from backend.exports.xml_export import XMLExport
from backend.exports.pdf_export import PDFExport
from backend.licensing.activation_engine import ActivationEngine

logger = logging.getLogger("api_v2")
router = APIRouter(prefix="/v2", tags=["enterprise_api_v2"])

# --- Request Schemas ---

class CreateTenantRequest(BaseModel):
    id: str
    name: str
    schema_type: Optional[str] = "isolated"
    settings: Optional[Dict[str, Any]] = None

class CopilotChatRequest(BaseModel):
    session_id: Optional[str] = None
    query: str
    role_preset: Optional[str] = "assistant"

class CopilotActionRequest(BaseModel):
    action_type: str
    details: Dict[str, Any]

class ActivateLicenseRequest(BaseModel):
    license_key: str


# --- PLATFORM ROUTES ---

@router.post("/platform/tenant")
async def api_create_tenant(body: CreateTenantRequest, user=Depends(get_current_user)):
    """SaaS Admin: Creates or overrides a tenant's deployment details."""
    role = getattr(user, "role", "staff")
    if role != "admin":
        raise HTTPException(status_code=403, detail="SaaS Administrative rights are required.")
    tenant = await TenantManager.create_tenant(body.id, body.name, body.schema_type, body.settings)
    return {"status": "SUCCESS", "tenant": tenant}


# --- COPILOT ROUTES ---

@router.post("/copilot/chat")
async def api_copilot_chat(body: CopilotChatRequest, user=Depends(get_current_user)):
    """Active user interaction with the global AI Copilot."""
    try:
        result = await CopilotEngine.process_copilot_request(
            user=user,
            session_id=body.session_id,
            query=body.query,
            role_preset=body.role_preset
        )
        return result
    except Exception as e:
        logger.error(f"Copilot API error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/copilot/action")
async def api_copilot_action(body: CopilotActionRequest, user=Depends(get_current_user)):
    """User approval confirmation to run ledger/invoice changes."""
    user_id = getattr(user, "id", "system")
    company_id = getattr(user, "company_id", "default_comp")
    result = await ActionEngine.confirm_and_execute_action(user_id, company_id, body.action_type, body.details)
    return result


# --- ENTERPRISE SEARCH ---

@router.get("/search")
async def api_enterprise_search(
    query: str = Query(..., min_length=1),
    category: Optional[str] = Query("all"),
    user=Depends(get_current_user)
):
    """Deep parallel semantic searching across files, invoices, and general journals."""
    company_id = getattr(user, "company_id", "default_comp")
    results = await EnterpriseSearch.global_enterprise_search(company_id, query, category)
    return results


# --- DYNAMIC EXPORTS ---

@router.get("/exports/ledger")
async def api_export_ledger(
    format: str = Query("json"),
    user=Depends(get_current_user)
):
    """Exports corporate journals in Excel, XML, JSON or PDF formats."""
    company_id = getattr(user, "company_id", "default_comp")
    from backend.dependencies import db
    journals = await db.journals.find({"company_id": company_id}).to_list(100)
    
    if format.lower() == "xml":
        xml_data = XMLExport.export_to_tally_xml(journals)
        return {"format": "XML", "data": xml_data}
    elif format.lower() == "pdf":
        pdf_bytes = PDFExport.render_pdf_report("Taskosphere Ledger Audit", journals)
        return {"format": "PDF", "bytes_length": len(pdf_bytes)}
    else:
        json_data = JSONExport.export_to_json(journals)
        return {"format": "JSON", "data": json_data}


# --- LICENSING ROUTES ---

@router.post("/licensing/activate")
async def api_activate_license(body: ActivateLicenseRequest, user=Depends(get_current_user)):
    """Activates commercial licenses using activation codes."""
    company_id = getattr(user, "company_id", "default_comp")
    success = await ActivationEngine.activate_license_key(company_id, body.license_key)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to activate license. Code invalid.")
    return {"status": "SUCCESS", "message": "SaaS License activated successfully."}
