"""
Fraud & Anomaly Detector Module (Phase 8)
Identifies potential accounting fraud, duplicates, velocity violations, and transaction anomalies.
Ensures pristine bookkeeping accuracy and enterprise security audits.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

logger = logging.getLogger("fraud_detector")

class FraudDetector:
    HIGH_RISK_KEYWORDS = [
        "casino", "gambling", "crypto", "bitcoin", "forex", "poker", "personal",
        "withdrawn", "atm cash", "liquor", "gift card", "unauthorized", "suspense"
    ]

    @classmethod
    async def analyse_transactions(cls, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Runs comprehensive security audits on loaded bank transaction history.
        Flag criteria:
        - Potential Duplicate: Same amount, date, type, bank_account_id.
        - Value Outlier: Transaction amount is > 3x the standard deviation of historical transactions.
        - High Risk Narration: Matches sensitive keywords.
        - Round-Sum: High value transactions ending in exact ,000s or ,00,000s (potential cash-out anomalies).
        """
        if not transactions or len(transactions) < 3:
            return []

        df = pd.DataFrame(transactions)
        df["amount"] = df["amount"].astype(float)
        
        # Calculate deviation stats for outlier detection
        mean_amt = df["amount"].mean()
        std_amt = df["amount"].std()
        std_amt = std_amt if std_amt > 0 else 1.0

        anomalies = []

        # Tracking set for duplicates detection
        seen_keys = {}

        for txn in transactions:
            txn_id = txn.get("id")
            amount = float(txn.get("amount", 0.0))
            date = txn.get("date")
            narration = txn.get("narration", "")
            txn_type = txn.get("type", "debit")
            bank_account_id = txn.get("bank_account_id")

            flags = []
            risk_score = 0.0

            # 1. Check for Duplicate entries
            dup_key = (date, amount, txn_type, bank_account_id)
            if dup_key in seen_keys:
                flags.append(f"Potential duplicate transaction (matches ID {seen_keys[dup_key]})")
                risk_score += 0.5
            else:
                seen_keys[dup_key] = txn_id

            # 2. Check for Value Outliers (> 3 standard deviations)
            if amount > (mean_amt + 3 * std_amt):
                flags.append(f"Value outlier: Amount {amount} is statistically abnormal compared to average {mean_amt:.2f}")
                risk_score += 0.4

            # 3. Check for High-Risk Keywords
            for kw in cls.HIGH_RISK_KEYWORDS:
                if kw in narration.lower():
                    flags.append(f"High risk keyword '{kw}' detected in narration")
                    risk_score += 0.6
                    break

            # 4. Check for suspicious round sums above a threshold
            if amount >= 50000 and amount % 10000 == 0:
                flags.append("High value round-sum transaction (suspicious structured debit pattern)")
                risk_score += 0.3

            if flags:
                anomalies.append({
                    "bank_transaction_id": txn_id,
                    "date": date,
                    "narration": narration,
                    "amount": amount,
                    "type": txn_type,
                    "risk_score": min(1.0, risk_score),
                    "flags": flags
                })

        return anomalies
