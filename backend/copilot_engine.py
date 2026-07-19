import logging
from typing import Dict, Any, Optional
from backend.dependencies import db

logger = logging.getLogger("context_manager")

class ContextManager:
    @staticmethod
    async def gather_user_context(company_id: str, tenant_id: str) -> Dict[str, Any]:
        """Collects metrics, settings, and pending tasks for prompt enrichment."""
        try:
            # Query active stats
            pending_invoices_count = await db.ai_document_memory.count_documents({
                "company_id": company_id,
                "decision": "REQUIRES_REVIEW"
            })
            
            pending_approvals_count = await db.approval_requests.count_documents({
                "company_id": company_id,
                "status": "PENDING"
            })
            
            return {
                "company_id": company_id,
                "tenant_id": tenant_id,
                "pending_invoices_to_review": pending_invoices_count,
                "pending_approvals": pending_approvals_count,
                "timestamp": True
            }
        except Exception as e:
            logger.error(f"Error gathering user context: {e}")
            return {"company_id": company_id, "tenant_id": tenant_id}
