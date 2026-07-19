"""
Chart of Accounts — Configurable, cached ledger lookup, account search, group mapping, and defaults.
Supports dynamic lookup and handles mapping of Nature of Accounts.
"""

from typing import Dict, Any, List, Optional, Tuple
from backend.dependencies import db
from backend.accounting_core import ensure_default_chart_of_accounts, DEFAULT_ACCOUNTS

# Cache structure to avoid repeated DB scans: company_id -> list of account dicts
_coa_cache: Dict[str, List[Dict[str, Any]]] = {}

class ChartOfAccountsManager:
    @staticmethod
    def clear_cache(company_id: str = ""):
        """Clears the local COA cache."""
        if company_id:
            _coa_cache.pop(company_id, None)
        else:
            _coa_cache.clear()

    @classmethod
    async def get_all_accounts(cls, company_id: str) -> List[Dict[str, Any]]:
        """Fetches all accounts for a company (with smart caching)."""
        if company_id in _coa_cache:
            return _coa_cache[company_id]
        
        # Ensure default codes are seeded first
        await ensure_default_chart_of_accounts(company_id, "system")
        
        accounts = await db.chart_of_accounts.find({"company_id": company_id}, {"_id": 0}).sort("code", 1).to_list(1000)
        _coa_cache[company_id] = accounts
        return accounts

    @classmethod
    async def lookup_by_code(cls, company_id: str, code: str) -> Optional[Dict[str, Any]]:
        """Looks up an account by its unique code."""
        accounts = await cls.get_all_accounts(company_id)
        for acct in accounts:
            if acct.get("code") == str(code).strip():
                return acct
        # Fallback to direct DB lookup if not cached
        acct = await db.chart_of_accounts.find_one({"company_id": company_id, "code": str(code).strip()}, {"_id": 0})
        return acct

    @classmethod
    async def lookup_by_id(cls, company_id: str, account_id: str) -> Optional[Dict[str, Any]]:
        """Looks up an account by its unique internal ID."""
        accounts = await cls.get_all_accounts(company_id)
        for acct in accounts:
            if acct.get("id") == account_id:
                return acct
        # Fallback to direct DB lookup
        acct = await db.chart_of_accounts.find_one({"id": account_id}, {"_id": 0})
        return acct

    @classmethod
    async def find_matching_accounts(cls, company_id: str, query_text: str) -> List[Dict[str, Any]]:
        """Searches accounts matching name or code (case-insensitive)."""
        accounts = await cls.get_all_accounts(company_id)
        q = str(query_text).strip().lower()
        if not q:
            return []
        
        matches = []
        for acct in accounts:
            if q in acct.get("name", "").lower() or q in acct.get("code", "").lower():
                matches.append(acct)
        return matches

    @classmethod
    def get_nature_of_account(cls, account_type: str) -> str:
        """Determines if the account type has Debit-normal or Credit-normal balance.
        Debit-normal: asset, expense
        Credit-normal: liability, equity, income
        """
        typ = str(account_type).strip().lower()
        if typ in ("asset", "expense"):
            return "DEBIT"
        return "CREDIT"

    @classmethod
    async def get_default_account_for_category(cls, company_id: str, group: str) -> Dict[str, Any]:
        """Maps specific logical categories (e.g., Accounts Receivable, GST Input Credit)
        to their standard system accounts and returns the account document.
        """
        # Mapping general categories to standard DEFAULT_ACCOUNTS codes
        group_to_code = {
            "receivable": "1100",
            "payable": "2000",
            "sales": "4000",
            "purchases": "5000",
            "gst_input": "1200",
            "gst_output": "2100",
            "tds": "2200",
            "cash": "1000",
            "bank": "1010",
            "roundoff": "5900",
            "software": "5250"
        }
        
        code = group_to_code.get(group.strip().lower(), "5000")
        acct = await cls.lookup_by_code(company_id, code)
        if not acct:
            # Emergency fallback: construct the default account dict
            # (Usually ensure_default_chart_of_accounts ensures this is populated)
            fallback_accts = {c: (n, t, s) for c, n, t, s in DEFAULT_ACCOUNTS}
            n, t, s = fallback_accts.get(code, ("Purchases", "expense", "cost_of_service"))
            acct = {
                "id": f"fallback_{code}",
                "company_id": company_id,
                "code": code,
                "name": n,
                "type": t,
                "sub_type": s,
                "is_system": True,
                "is_active": True
            }
        return acct
