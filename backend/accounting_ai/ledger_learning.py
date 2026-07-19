"""
Ledger Learning — Analyzes successfully approved postings to dynamically update vendor-specific rules,
preferred ledger allocations, cost centers, departments, projects, and narrations.
"""

from typing import Dict, Any, Optional
from datetime import datetime, timezone
import logging
from backend.dependencies import db
from backend.accounting_ai.posting_storage import PostingStorage

logger = logging.getLogger("ledger_learning")

class LedgerLearningEngine:
    @staticmethod
    async def get_recommendation(vendor_name: str, gstin: str, company_id: str) -> Optional[Dict[str, Any]]:
        """Queries the learned mapping history for a vendor to suggest ledger routing."""
        try:
            record = await PostingStorage.get_ledger_learning(vendor_name, gstin, company_id)
            if record:
                return {
                    "preferred_ledger": record.get("preferred_ledger"),
                    "department": record.get("department"),
                    "cost_center": record.get("cost_center"),
                    "project": record.get("project"),
                    "confidence_score": min(0.95, 0.5 + (record.get("frequency", 1) * 0.1) - (record.get("corrections_count", 0) * 0.15))
                }
        except Exception as e:
            logger.error(f"Error reading ledger learning recommendation: {e}")
        return None

    @staticmethod
    async def learn_from_approval(
        vendor_name: str,
        gstin: str,
        company_id: str,
        approved_ledger_code: str,
        meta: Optional[Dict[str, Any]] = None
    ):
        """Processes an approved posting. Updates learned weights, cost centers, and narrations.
        Increments frequency or handles corrections counter if the user changed the ledger.
        """
        if not vendor_name and not gstin:
            return

        now = datetime.now(timezone.utc).isoformat()
        meta = meta or {}
        
        try:
            # Check existing learned record
            existing = await PostingStorage.get_ledger_learning(vendor_name, gstin, company_id)
            
            if existing:
                # If the ledger code is exactly what was previously preferred, increase frequency/weight
                if existing.get("preferred_ledger") == approved_ledger_code:
                    updates = {
                        "frequency": existing.get("frequency", 1) + 1,
                        "updated_at": now
                    }
                    # Update optional properties if supplied
                    for key in ("department", "cost_center", "project", "narration_template"):
                        if meta.get(key):
                            updates[key] = meta[key]
                            
                    await db.ledger_learning.update_one(
                        {"vendor_name": vendor_name, "gstin": gstin, "company_id": company_id},
                        {"$set": updates}
                    )
                else:
                    # The user corrected the ledger or chose a different one - increment corrections count
                    # and set the new ledger code as preferred
                    await db.ledger_learning.update_one(
                        {"vendor_name": vendor_name, "gstin": gstin, "company_id": company_id},
                        {"$set": {
                            "preferred_ledger": approved_ledger_code,
                            "frequency": 1,
                            "corrections_count": existing.get("corrections_count", 0) + 1,
                            "department": meta.get("department") or existing.get("department"),
                            "cost_center": meta.get("cost_center") or existing.get("cost_center"),
                            "project": meta.get("project") or existing.get("project"),
                            "narration_template": meta.get("narration_template") or existing.get("narration_template"),
                            "updated_at": now
                        }}
                    )
            else:
                # First time seeing this vendor + ledger pairing
                new_data = {
                    "preferred_ledger": approved_ledger_code,
                    "frequency": 1,
                    "corrections_count": 0,
                    "department": meta.get("department"),
                    "cost_center": meta.get("cost_center"),
                    "project": meta.get("project"),
                    "narration_template": meta.get("narration_template")
                }
                await PostingStorage.save_ledger_learning(vendor_name, gstin, company_id, new_data)
                
            logger.info(f"Ledger Learning updated successfully for: {vendor_name or gstin}")
        except Exception as e:
            logger.error(f"Failed to record ledger learning patterns: {e}", exc_info=True)
