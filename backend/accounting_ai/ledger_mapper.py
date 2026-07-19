"""
Ledger Mapper — Determines the precise ledger account to map a transaction to, leveraging vendor intelligence,
historical postings, ledger learning, chart of accounts, and keyword filters.
"""

from typing import Dict, Any, Optional, Tuple
import logging
from backend.accounting_ai.chart_of_accounts import ChartOfAccountsManager
from backend.accounting_ai.ledger_learning import LedgerLearningEngine
from backend.accounting_ai.posting_rules import PostingRulesEvaluator

logger = logging.getLogger("ledger_mapper")

class LedgerMapper:
    @classmethod
    async def resolve_ledger(
        cls,
        company_id: str,
        extracted_data: Dict[str, Any],
        vendor_profile: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, str, float]:
        """Resolves the correct debit account code for a PURCHASE or expense invoice.
        Returns: (account_code, account_name, confidence_score)
        """
        vendor_name = extracted_data.get("vendor_or_customer_name") or ""
        vendor_gstin = extracted_data.get("tax_registration_number") or ""
        doc_type = (extracted_data.get("document_type") or "PURCHASE").upper()

        if doc_type == "SALE":
            # For sales, revenue is mapped to Sales account
            acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "sales")
            return acct["code"], acct["name"], 1.0

        # For purchases, apply intelligent lookup cascading
        
        # 1. Vendor intelligence profile explicitly configured
        if vendor_profile and vendor_profile.get("default_ledger"):
            code = vendor_profile["default_ledger"]
            acct = await ChartOfAccountsManager.lookup_by_code(company_id, code)
            if acct:
                return acct["code"], acct["name"], 0.95

        # 2. Check dynamic Ledger Learning Engine (history based)
        learned = await LedgerLearningEngine.get_recommendation(vendor_name, vendor_gstin, company_id)
        if learned and learned.get("preferred_ledger"):
            code = learned["preferred_ledger"]
            acct = await ChartOfAccountsManager.lookup_by_code(company_id, code)
            if acct:
                return acct["code"], acct["name"], learned.get("confidence_score", 0.80)

        # 3. Check regular expression keyword match defaults (ZTE style rules)
        # We can dynamically retrieve ZTE rules if present
        from backend.dependencies import db
        rows = await db.zte_category_rules.find({"company_id": company_id}, {"_id": 0}).to_list(500)
        from backend.zero_touch_entry import DEFAULT_CATEGORY_RULES
        rules = rows if rows else DEFAULT_CATEGORY_RULES
        
        vn = vendor_name.lower()
        import re
        for rule in rules:
            if re.search(rule["match"], vn, flags=re.IGNORECASE):
                code = rule["account_code"]
                acct = await ChartOfAccountsManager.lookup_by_code(company_id, code)
                if acct:
                    return acct["code"], acct["name"], 0.75

        # 4. Deep content scan of description lines
        lines = extracted_data.get("line_items") or []
        combined_text = " ".join(str(item.get("description") or "").lower() for item in lines)
        for rule in rules:
            if re.search(rule["match"], combined_text, flags=re.IGNORECASE):
                code = rule["account_code"]
                acct = await ChartOfAccountsManager.lookup_by_code(company_id, code)
                if acct:
                    return acct["code"], acct["name"], 0.70

        # 5. Deterministic fallback
        acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "purchases")
        return acct["code"], acct["name"], 0.50  # Low confidence, requires human review
