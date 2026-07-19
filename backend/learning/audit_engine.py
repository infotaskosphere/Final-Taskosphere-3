import logging
from typing import Dict, Any, List, Optional
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("learning_audit_engine")


class LearningAuditEngine:
    @classmethod
    async def log_learning_event(
        cls,
        event_type: str,
        source_id: str,
        company_id: str,
        user_id: str,
        description: str,
        before_state: Any,
        after_state: Any,
        meta_data: Dict[str, Any],
        version: str = "1.0.0"
    ) -> str:
        """
        Creates an immutable learning audit log of all events that changed the model or knowledge state.
        """
        audit_record = {
            "event_type": event_type,
            "source_id": source_id,
            "company_id": company_id,
            "user_id": user_id,
            "description": description,
            "before_state": before_state,
            "after_state": after_state,
            "meta_data": meta_data,
            "version": version
        }
        try:
            audit_id = await LearningStorage.save_learning_audit(audit_record)
            logger.info(f"Immutable Learning Audit logged: {event_type} | ID: {audit_id} | company_id: {company_id}")
            return audit_id
        except Exception as e:
            logger.error(f"Failed to record learning audit trace: {e}", exc_info=True)
            return ""

    @classmethod
    async def get_audit_trail_for_entity(cls, company_id: str, source_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query = {"company_id": company_id}
        if source_id:
            query["source_id"] = source_id
        return await LearningStorage.get_audit_trail(query)
