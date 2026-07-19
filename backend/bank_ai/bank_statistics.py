"""
Bank Statistics & KPI Aggregator (Phase 8)
Calculates key performance metrics, reconciliation match success rates, monthly transaction volumes,
and cash-flow KPIs for executive dashboards.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List

from backend.dependencies import db
from backend.bank_ai.bank_storage import BankStorage

logger = logging.getLogger("bank_statistics")

class BankStatistics:
    @classmethod
    async def compute_and_save(cls, bank_account_id: str) -> Dict[str, Any]:
        """
        Aggregates KPI metrics from database for a specific bank account.
        Metrics computed:
        - Total parsed transactions.
        - Reconciled count & percentage.
        - Method breakout (by rules, by matching, manual).
        - Total debit vs credit volume.
        """
        try:
            # Query all transactions for account
            total_count = await db.bank_transaction_history.count_documents({"bank_account_id": bank_account_id})
            reconciled_count = await db.bank_transaction_history.count_documents({
                "bank_account_id": bank_account_id,
                "status": "reconciled"
            })
            
            recon_rate = (reconciled_count / total_count * 100.0) if total_count > 0 else 0.0

            # Method breakdown from reconciliations
            rules_match = await db.bank_reconciliation.count_documents({
                "bank_account_id": bank_account_id,
                "type": "rule"
            })
            fuzzy_match = await db.bank_reconciliation.count_documents({
                "bank_account_id": bank_account_id,
                "type": "fuzzy"
            })
            manual_match = await db.bank_reconciliation.count_documents({
                "bank_account_id": bank_account_id,
                "type": "manual"
            })

            # Inflow vs Outflow volumes
            total_credits = 0.0
            total_debits = 0.0
            
            cursor = db.bank_transaction_history.find({"bank_account_id": bank_account_id})
            async for doc in cursor:
                amt = float(doc.get("amount", 0.0))
                if doc.get("type") == "credit":
                    total_credits += amt
                else:
                    total_debits += amt

            stats = {
                "bank_account_id": bank_account_id,
                "total_transactions": total_count,
                "reconciled_transactions": reconciled_count,
                "reconciliation_rate": round(recon_rate, 2),
                "breakdown": {
                    "by_rules": rules_match,
                    "by_matching": fuzzy_match,
                    "manual": manual_match
                },
                "total_inflow": round(total_credits, 2),
                "total_outflow": round(total_debits, 2),
                "net_change": round(total_credits - total_debits, 2),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            # Save statistics to persistence layer
            await BankStorage.save_bank_statistics(stats)
            return stats

        except Exception as e:
            logger.error(f"Failed to calculate bank statistics for account {bank_account_id}: {e}")
            return {
                "bank_account_id": bank_account_id,
                "total_transactions": 0,
                "reconciled_transactions": 0,
                "reconciliation_rate": 0.0,
                "breakdown": {"by_rules": 0, "by_matching": 0, "manual": 0},
                "total_inflow": 0.0,
                "total_outflow": 0.0,
                "net_change": 0.0,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
