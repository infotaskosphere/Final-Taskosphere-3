"""
Bank Classifier Module (Phase 8)
Identifies the bank brand, statement format, and matching statement template from raw file inputs or text.
"""

import logging
import re
from typing import Dict, Any, Optional

logger = logging.getLogger("bank_classifier")

class BankClassifier:
    # Known Indian and international banks with narration keyword matching rules
    BANK_SIGNATURES = {
        "HDFC": [r"hdfc", r"rtgs\-hdfc", r"neft\s*hdfc", r"hdfc\s*bank"],
        "SBI": [r"state\s*bank\s*of\s*india", r"sbi", r"sbi\-", r"rtgs\-sbi"],
        "ICICI": [r"icici", r"icic", r"rtgs\-icici", r"neft\-icici"],
        "Citi": [r"citi", r"citibank", r"citicard"],
        "HSBC": [r"hsbc", r"hsbc\s*bank"],
        "Barclays": [r"barclays", r"barc"],
        "Chase": [r"chase", r"jpmorgan", r"jpm"],
        "Axis": [r"axis", r"axisb", r"rtgs\-axis", r"neft\-axis"],
        "KOTAK": [r"kotak", r"kmbl", r"neft\-kotak"]
    }

    @classmethod
    def classify_bank(cls, raw_text: str, filename: str) -> Dict[str, Any]:
        """
        Classifies the bank brand and format by examining filename patterns and OCR/text samples.
        """
        raw_text_lower = (raw_text or "").lower()
        filename_lower = (filename or "").lower()

        # Try to identify bank brand by signatures
        detected_bank = "Generic Bank"
        highest_score = 0

        for bank, patterns in cls.BANK_SIGNATURES.items():
            score = 0
            for pattern in patterns:
                if re.search(pattern, filename_lower):
                    score += 5
                if re.search(pattern, raw_text_lower):
                    score += 3
            if score > highest_score:
                highest_score = score
                detected_bank = bank

        # Classify statement format
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
        detected_format = ext.upper()

        confidence = 0.5 + min(0.45, highest_score * 0.1) if highest_score > 0 else 0.5

        return {
            "bank_name": detected_bank,
            "format": detected_format,
            "confidence": confidence,
            "suggested_template_id": f"tpl_{detected_bank.lower()}_{detected_format.lower()}"
        }
