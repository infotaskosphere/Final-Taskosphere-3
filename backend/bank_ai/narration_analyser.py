"""
Narration Analyser Module (Phase 8)
Extracts key metadata from raw banking transaction narration text.
Identifies payment mode (UPI, NEFT, IMPS, RTGS, Cheque, Card, Cash), reference transaction IDs, and counterparty.
"""

import logging
import re
from typing import Dict, Any

logger = logging.getLogger("narration_analyser")

class NarrationAnalyser:
    # Payment mode signature patterns
    MODE_PATTERNS = {
        "UPI": [r"upi", r"bhim", r"gpay", r"paytm", r"phonepe"],
        "IMPS": [r"imps", r"m m p s"],
        "NEFT": [r"neft", r"n e f t"],
        "RTGS": [r"rtgs", r"r t g s"],
        "Cheque": [r"chq", r"cheque", r"clg\b", r"clearing"],
        "ATM/Card": [r"atm", r"pos", r"debit\s*card", r"visa", r"mastercard", r"rupay", r"card\s*tx"],
        "Cash": [r"cash\s*dep", r"cash\s*wd", r"self\s*withdrawal", r"by\s*cash"]
    }

    @classmethod
    def analyse(cls, narration: str) -> Dict[str, Any]:
        """
        Parses transaction narration and extracts:
        - payment_mode: UPI, NEFT, etc.
        - reference_id: Extracted transaction reference number (e.g., UTR, UPI Txn ID, Cheque No)
        - counterparty: Derived name of the company or person involved
        """
        narration_clean = (narration or "").strip()
        narration_lower = narration_clean.lower()

        # 1. Detect Payment Mode
        payment_mode = "Other"
        for mode, patterns in cls.MODE_PATTERNS.items():
            if any(re.search(pat, narration_lower) for pat in patterns):
                payment_mode = mode
                break

        # 2. Extract Reference ID
        reference_id = ""
        # UPI ref matching (usually 12 digits, or starts with UPI/txn)
        upi_ref = re.search(r'\b\d{12}\b', narration_clean)
        if upi_ref:
            reference_id = upi_ref.group(0)
        else:
            # General transaction ID / UTR number patterns
            utr_ref = re.search(r'\b[A-Z]{4}[R-T]\d{11}\b', narration_clean, re.I) # UTR pattern
            if utr_ref:
                reference_id = utr_ref.group(0).upper()
            else:
                # Cheque numbers (usually 6 digits)
                chq_ref = re.search(r'\b(?:chq|cheque|instrument)\s*(?:no|num)?\.?\s*(\d{6})\b', narration_clean, re.I)
                if chq_ref:
                    reference_id = chq_ref.group(1)
                else:
                    # Generic alphanumerical reference id
                    generic_ref = re.search(r'(?:ref|txn|id|trf)[:\-/\s]*([a-z0-9\-]{8,20})', narration_clean, re.I)
                    if generic_ref:
                        reference_id = generic_ref.group(1).upper()

        # 3. Extract Counterparty name (heuristic)
        counterparty = ""
        # Remove common prefixes and reference IDs to leave the core party name
        party_text = narration_clean
        # Remove reference IDs
        if reference_id:
            party_text = party_text.replace(reference_id, "")
        
        # Remove common keywords
        keywords_to_strip = [
            r"upi", r"imps", r"neft", r"rtgs", r"chq", r"cheque", r"transfer", r"trf", r"from", r"to",
            r"payment", r"by", r"cash", r"self", r"bhim", r"gpay", r"paytm", r"phonepe", r"fund\s*transfer"
        ]
        for kw in keywords_to_strip:
            party_text = re.sub(kw, "", party_text, flags=re.I)

        # Cleanup special characters and extra spaces
        party_text = re.sub(r'[:\-/\\*#@]', ' ', party_text)
        party_text = re.sub(r'\s+', ' ', party_text).strip()

        # Pick the first 3-4 words as party name if long
        words = party_text.split()
        if len(words) > 0:
            # Exclude purely numeric tokens
            cleaned_words = [w for w in words if not w.isdigit()]
            if cleaned_words:
                counterparty = " ".join(cleaned_words[:4])
            else:
                counterparty = "Unknown Party"
        else:
            counterparty = "Unknown Party"

        return {
            "raw_narration": narration_clean,
            "payment_mode": payment_mode,
            "reference_id": reference_id,
            "counterparty": counterparty
        }
