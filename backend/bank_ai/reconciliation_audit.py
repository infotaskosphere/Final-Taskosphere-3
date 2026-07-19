"""
Reconciliation Audit Module (Phase 8)
Records and maintains compliance-grade audit trails for every reconciliation action.
Enables explainability of AI-driven and rule-based matching choices.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import uuid

from backend.bank_ai.bank_storage import BankStorage

logger = logging.getLogger("reconciliation_audit")

class ReconciliationAudit:
    @staticmethod
    async def log_decision(
        bank_transaction: Dict[str, Any],
        matched_record_id: Optional[str],
        match_type: str,  # "rule", "fuzzy", "manual", "unmatched_post"
        confidence: float,
        reasons: List[str],
        user_id: Optional[str] = None
    ) -> str:
        """
        Logs a detailed explainable matching record to bank_reconciliation_audit database.
        """
        audit_record = {
            "id": str(uuid.uuid4()),
            "bank_transaction_id": bank_transaction.get("id"),
            "bank_account_id": bank_transaction.get("bank_account_id"),
            "transaction_details": {
                "date": bank_transaction.get("date"),
                "narration": bank_transaction.get("narration"),
                "amount": bank_transaction.get("amount"),
                "type": bank_transaction.get("type")
            },
            "matched_record_id": matched_record_id,
            "match_type": match_type,
            "confidence": confidence,
            "reasons": reasons,
            "matched_by_user": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        try:
            audit_id = await BankStorage.log_audit_trail(audit_record)
            logger.info(f"Logged reconciliation audit record {audit_id} for bank txn {bank_transaction.get('id')}.")
            return audit_id
        except Exception as e:
            logger.error(f"Failed to log reconciliation audit trail: {e}")
            return audit_record["id"]

    @staticmethod
    async def get_audit_trail(bank_transaction_id: str) -> List[Dict[str, Any]]:
        """
        Retrieves matching justifications for audit reporting.
        """
        return await BankStorage.get_audit_trail_for_transaction(bank_transaction_id)
