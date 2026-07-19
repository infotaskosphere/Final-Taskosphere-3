"""
Posting Rules — Configurable, dynamic rules framework mapping transactions (Purchases, Sales, Payroll,
Depreciation, Provisions, etc.) to structured posting guidelines. Designed to support flexible statutory changes.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging
from backend.accounting_ai.posting_storage import PostingStorage

logger = logging.getLogger("posting_rules")

DEFAULT_RULES: Dict[str, Dict[str, Any]] = {
    "PURCHASE": {
        "debit_mapping": [
            {"account_group": "purchases", "ratio": 1.0, "memo_prefix": "Purchase Item"}
        ],
        "credit_mapping": [
            {"account_group": "payable", "ratio": 1.0, "memo_prefix": "Accounts Payable"}
        ],
        "gst_allowed": True,
        "tds_allowed": True
    },
    "SALE": {
        "debit_mapping": [
            {"account_group": "receivable", "ratio": 1.0, "memo_prefix": "Accounts Receivable"}
        ],
        "credit_mapping": [
            {"account_group": "sales", "ratio": 1.0, "memo_prefix": "Sales / Fee Income"}
        ],
        "gst_allowed": True,
        "tds_allowed": False
    },
    "EXPENSE": {
        "debit_mapping": [
            {"account_group": "software", "ratio": 1.0, "memo_prefix": "Expense allocation"}
        ],
        "credit_mapping": [
            {"account_group": "payable", "ratio": 1.0, "memo_prefix": "Vendor Payable"}
        ],
        "gst_allowed": True,
        "tds_allowed": True
    },
    "DEPRECIATION": {
        "debit_mapping": [
            {"account_code": "5300", "ratio": 1.0, "memo_prefix": "Depreciation Expense"}  # Office & Admin
        ],
        "credit_mapping": [
            {"account_code": "1300", "ratio": 1.0, "memo_prefix": "Accumulated Depreciation"}  # Fixed Assets
        ],
        "gst_allowed": False,
        "tds_allowed": False
    },
    "PAYROLL": {
        "debit_mapping": [
            {"account_code": "5100", "ratio": 1.0, "memo_prefix": "Salary disbursement"}  # Salaries & Wages
        ],
        "credit_mapping": [
            {"account_code": "1010", "ratio": 1.0, "memo_prefix": "Salary Payable / Bank payout"}  # Bank Accounts
        ],
        "gst_allowed": False,
        "tds_allowed": True
    }
}

class PostingRulesEvaluator:
    @staticmethod
    async def get_rules_for_event(company_id: str, event_type: str) -> Dict[str, Any]:
        """Retrieves rules for the event, defaulting to predefined templates."""
        event_key = str(event_type).upper().strip()
        try:
            stored = await PostingStorage.get_accounting_rules(company_id, event_key)
            if stored and "rules" in stored:
                return stored["rules"]
        except Exception as e:
            logger.error(f"Error loading stored posting rules: {e}")
            
        return DEFAULT_RULES.get(event_key, DEFAULT_RULES["PURCHASE"])

    @staticmethod
    async def save_custom_rules(company_id: str, event_type: str, rules: Dict[str, Any]):
        """Saves custom rules to database for a company."""
        await PostingStorage.save_accounting_rules(company_id, event_type.upper().strip(), rules)
