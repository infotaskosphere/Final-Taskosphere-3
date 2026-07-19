"""
Payment Matcher Module (Phase 8)
Fuzzy-matches bank transaction lines against outstanding invoices, bills, and ledgers in the database.
Generates candidate matches with confidence scores and explainable reason logs.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from backend.dependencies import db

logger = logging.getLogger("payment_matcher")

class PaymentMatcher:
    @staticmethod
    def calculate_match_score(bank_txn: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates a confidence match score between a bank transaction and an invoice/ledger candidate.
        Max score: 100.
        Factors:
        - Amount exact match (50 pts)
        - Amount partial/variance match (up to 30 pts)
        - Date proximity (up to 30 pts: 30 pts for 0-3 days, 15 pts for 4-10 days, 5 pts for 11-30 days)
        - Party name fuzzy match in narration (20 pts)
        """
        score = 0
        reasons = []

        # 1. Amount matching
        bank_amount = float(bank_txn.get("amount", 0.0))
        cand_amount = float(candidate.get("total_amount") or candidate.get("amount") or candidate.get("total") or 0.0)
        
        if abs(bank_amount - cand_amount) < 0.01:
            score += 50
            reasons.append("Exact amount match (+50)")
        elif abs(bank_amount - cand_amount) <= (bank_amount * 0.05):  # 5% variance (charges/deductions)
            score += 25
            reasons.append("Approximate amount match (within 5% variance) (+25)")
        else:
            reasons.append("Significant amount mismatch (0)")

        # 2. Date Proximity matching
        try:
            b_date = datetime.strptime(bank_txn.get("date")[:10], "%Y-%m-%d")
            c_date_str = candidate.get("date") or candidate.get("invoice_date") or candidate.get("created_at")
            c_date = datetime.strptime(c_date_str[:10], "%Y-%m-%d")
            
            delta_days = abs((b_date - c_date).days)
            if delta_days <= 3:
                score += 30
                reasons.append(f"Date proximity: {delta_days} days difference (+30)")
            elif delta_days <= 10:
                score += 15
                reasons.append(f"Date proximity: {delta_days} days difference (+15)")
            elif delta_days <= 30:
                score += 5
                reasons.append(f"Date proximity: {delta_days} days difference (+5)")
            else:
                reasons.append(f"Date difference too large: {delta_days} days (0)")
        except Exception as e:
            logger.warning(f"Failed to calculate date difference in payment matcher: {e}")
            reasons.append("Date format mismatch/unparseable (0)")

        # 3. Party Name / Narration matching
        party_name = (candidate.get("client_name") or candidate.get("supplier_name") or candidate.get("party_name") or "").lower().strip()
        narration = bank_txn.get("narration", "").lower().strip()

        if party_name and party_name in narration:
            score += 20
            reasons.append(f"Party name '{party_name}' found in narration (+20)")
        elif party_name:
            # Check individual tokens
            tokens = [t for t in party_name.split() if len(t) > 3]
            token_matches = [t for t in tokens if t in narration]
            if token_matches:
                score += 10
                reasons.append(f"Fuzzy party token match '{', '.join(token_matches)}' (+10)")
            else:
                reasons.append("No party name reference in narration (0)")

        return {
            "score": min(100, score),
            "confidence": min(1.0, score / 100.0),
            "reasons": reasons
        }

    @classmethod
    async def find_matches(cls, bank_transaction: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
        """
        Finds candidate invoice, bill, or journal entry matches in the database.
        Searches 'invoices' and 'purchases' or journal entry transaction records.
        """
        candidates = []
        bank_amount = float(bank_transaction.get("amount", 0.0))
        txn_type = bank_transaction.get("type", "debit").lower()

        # Query standard invoices for credit transactions (sales income), or bills/purchases for debit (expenses)
        try:
            if txn_type == "credit":
                # Income: search client invoices
                # Search invoices with amount +/- 10%
                min_amt = bank_amount * 0.90
                max_amt = bank_amount * 1.10
                
                # Fetch pending or unpaid invoices
                cursor = db.invoices.find({
                    "total_amount": {"$gte": min_amt, "$lte": max_amt},
                    "status": {"$ne": "paid"}
                }).limit(50)
                
                async for inv in cursor:
                    inv["_id"] = str(inv["_id"])
                    inv["match_type"] = "invoice"
                    candidates.append(inv)
            else:
                # Debit: search purchase bills/expenses
                min_amt = bank_amount * 0.90
                max_amt = bank_amount * 1.10
                cursor = db.purchases.find({
                    "total_amount": {"$gte": min_amt, "$lte": max_amt},
                    "status": {"$ne": "paid"}
                }).limit(50)
                
                async for bill in cursor:
                    bill["_id"] = str(bill["_id"])
                    bill["match_type"] = "bill"
                    candidates.append(bill)

        except Exception as e:
            logger.error(f"Failed to fetch matching candidates from db: {e}")

        # Score and filter candidates
        results = []
        for cand in candidates:
            scoring = cls.calculate_match_score(bank_transaction, cand)
            if scoring["score"] >= 30:  # Threshold of 30 to be considered a candidate match
                results.append({
                    "candidate_id": cand.get("id") or cand.get("_id"),
                    "match_type": cand["match_type"],
                    "party_name": cand.get("client_name") or cand.get("supplier_name") or cand.get("party_name") or "Unknown",
                    "amount": cand.get("total_amount") or cand.get("amount") or cand.get("total"),
                    "date": cand.get("date") or cand.get("invoice_date") or cand.get("created_at"),
                    "score": scoring["score"],
                    "confidence": scoring["confidence"],
                    "reasons": scoring["reasons"]
                })

        # Sort by highest score first
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]
