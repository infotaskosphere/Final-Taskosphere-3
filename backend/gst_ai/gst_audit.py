from typing import Dict, Any, List, Optional
import logging
import uuid
from datetime import datetime, timezone
from backend.gst_ai.gst_storage import GSTStorage

logger = logging.getLogger("gst_audit")

class GSTAuditLogger:
    @classmethod
    async def log_decision(
        cls,
        company_id: str,
        user_id: str,
        document_id: str,
        action: str,
        invoice_no: str,
        ai_recommendation: Dict[str, Any],
        final_outcome: Dict[str, Any],
        validation_report: Dict[str, Any],
        rule_version: str = "v1.0.0"
    ) -> str:
        """
        Inserts an immutable, detailed audit record of a GST compliance / processing decision.
        """
        audit_id = str(uuid.uuid4())
        record = {
            "id": audit_id,
            "company_id": company_id,
            "user_id": user_id,
            "document_id": document_id,
            "invoice_no": invoice_no,
            "action": action, # e.g. "AUTO_POSTED", "MANUALLY_CORRECTED", "RECONCILED"
            "rule_version": rule_version,
            "ai_recommendation": ai_recommendation,
            "final_outcome": final_outcome,
            "validation_report": validation_report,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            await GSTStorage.save_audit(record)
            logger.info(f"GST decision audit trial saved for document_id {document_id}. Audit ID: {audit_id}")
            return audit_id
        except Exception as e:
            logger.error(f"Failed to log GST decision audit trial: {e}", exc_info=True)
            return ""

    @classmethod
    async def fetch_audit_trail_for_document(cls, document_id: str) -> List[Dict[str, Any]]:
        """
        Retrieves the chronological audit logs of all actions on a specific document.
        """
        try:
            return await GSTStorage.get_audit_trail({"document_id": document_id})
        except Exception as e:
            logger.error(f"Error fetching audit trail for document {document_id}: {e}")
            return []

    @classmethod
    async def list_audit_trail(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        """
        Returns full audit records matching query parameters.
        """
        try:
            return await GSTStorage.get_audit_trail(query)
        except Exception as e:
            logger.error(f"Error listing general audit trails: {e}")
            return []
