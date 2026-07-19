"""
Accounting Audit — Compiles and logs immutable audit trails for automated postings, tracking recommendation delta,
decisions, versions, and checksum-backed integrity proofs.
"""

from typing import Dict, Any, List, Optional
import hashlib
import json
import logging
from datetime import datetime, timezone
from backend.accounting_ai.posting_storage import PostingStorage

logger = logging.getLogger("accounting_audit")

class AccountingAuditTrail:
    @staticmethod
    def calculate_audit_checksum(data_dict: Dict[str, Any]) -> str:
        """Computes a SHA-256 integrity checksum for a transaction payload to secure the audit block."""
        serialized = json.dumps(data_dict, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @classmethod
    async def log_posting_event(
        cls,
        user_id: str,
        document_id: str,
        company_id: str,
        ai_recommendation: Dict[str, Any],
        final_decision: Dict[str, Any],
        corrections: Dict[str, Any],
        journal_version: int = 1,
        voucher_version: int = 1,
        approval_history: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """Records an immutable audit entry into the database."""
        approval_hist = approval_history or []
        approval_hist.append({
            "user_id": user_id,
            "action": "POSTED",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        payload_to_checksum = {
            "document_id": document_id,
            "company_id": company_id,
            "ai_recommendation_ledger": ai_recommendation.get("ledger_code"),
            "final_decision_ledger": final_decision.get("ledger_code"),
            "corrections": corrections,
            "journal_version": journal_version,
            "voucher_version": voucher_version
        }
        
        checksum = cls.calculate_audit_checksum(payload_to_checksum)
        
        audit_data = {
            "user_id": user_id,
            "document_id": document_id,
            "company_id": company_id,
            "ai_recommendation": ai_recommendation,
            "final_decision": final_decision,
            "corrections": corrections,
            "journal_version": journal_version,
            "voucher_version": voucher_version,
            "approval_history": approval_hist,
            "checksum": checksum
        }
        
        try:
            audit_id = await PostingStorage.save_posting_audit(audit_data)
            logger.info(f"Immutable Posting Audit logged successfully: {audit_id}")
            return audit_id
        except Exception as e:
            logger.error(f"Audit logging failed: {e}", exc_info=True)
            raise
