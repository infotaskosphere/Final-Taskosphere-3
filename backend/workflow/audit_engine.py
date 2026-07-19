import logging
from typing import Dict, Any, List
from backend.workflow.workflow_storage import WorkflowStorage

logger = logging.getLogger("workflow_audit_engine")

class WorkflowAuditEngine:
    @staticmethod
    async def log_audit_event(
        company_id: str,
        user_id: str,
        action: str,
        entity_id: str,
        entity_type: str,
        details: str,
        before_state: Any = None,
        after_state: Any = None,
        meta_data: Dict[str, Any] = None
    ) -> str:
        """
        Maintains an immutable workflow audit history of all organizational events/decisions.
        Records can never be deleted.
        """
        try:
            audit_entry = {
                "company_id": company_id,
                "user_id": user_id,
                "action": action,
                "entity_id": entity_id,
                "entity_type": entity_type,
                "details": details,
                "before_state": before_state,
                "after_state": after_state,
                "meta_data": meta_data or {},
            }
            audit_id = await WorkflowStorage.save_workflow_audit(audit_entry)
            logger.info(f"Immutable audit entry logged: {audit_id} - {action} for {entity_type} {entity_id}")
            return audit_id
        except Exception as e:
            logger.error(f"Failed to log immutable audit event: {e}", exc_info=True)
            return ""

    @staticmethod
    async def get_audit_trail(company_id: str, entity_id: str = None, limit: int = 200) -> List[Dict[str, Any]]:
        """
        Retrieves complete audit trail matching specific criteria.
        """
        query = {"company_id": company_id}
        if entity_id:
            query["entity_id"] = entity_id
        return await WorkflowStorage.get_audit_trail(query, limit)
