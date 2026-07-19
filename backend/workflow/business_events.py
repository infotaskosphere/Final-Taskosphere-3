import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.audit_engine import WorkflowAuditEngine

logger = logging.getLogger("business_events")

class BusinessEventCreator:
    @staticmethod
    async def create_event(
        company_id: str,
        event_type: str,
        source_id: str,
        user_id: str,
        payload: Dict[str, Any],
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates, logs and stores a new structured business event.
        These events drive organizational automation.
        """
        event_doc = {
            "company_id": company_id,
            "event_type": event_type,
            "source_id": source_id,
            "user_id": user_id,
            "payload": payload,
            "description": description or f"Event {event_type} triggered for source {source_id}.",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        event_id = await WorkflowStorage.save_business_event(event_doc)
        event_doc["id"] = event_id

        # Log to the audit engine
        await WorkflowAuditEngine.log_audit_event(
            company_id=company_id,
            user_id=user_id,
            action=f"EVENT_{event_type.upper()}",
            entity_id=source_id,
            entity_type="business_event",
            details=description or f"Business event '{event_type}' was raised.",
            after_state=payload,
            meta_data={"event_id": event_id}
        )

        logger.info(f"Business event registered successfully: ID={event_id}, TYPE={event_type}")
        return event_doc
