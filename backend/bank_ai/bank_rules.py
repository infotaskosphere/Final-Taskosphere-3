"""
Bank Rules Configuration Manager (Phase 8)
Defines structure and matching mechanisms for auto-categorization and routing policies.
"""

import logging
from typing import Dict, Any, List, Optional
import uuid

from backend.bank_ai.bank_storage import BankStorage

logger = logging.getLogger("bank_rules")

class BankRulesManager:
    @staticmethod
    async def create_rule(
        name: str,
        pattern: str,
        category: str,
        account_id: Optional[str] = None,
        account_name: Optional[str] = None,
        priority: int = 10
    ) -> str:
        """
        Creates a new matching rule.
        """
        rule = {
            "id": f"rule_{str(uuid.uuid4())[:8]}",
            "name": name,
            "pattern": pattern.strip(),
            "category": category,
            "account_id": account_id,
            "account_name": account_name,
            "priority": priority,
            "is_active": True
        }
        return await BankStorage.save_bank_rule(rule)

    @staticmethod
    async def get_all_rules() -> List[Dict[str, Any]]:
        return await BankStorage.get_active_rules()

    @staticmethod
    async def delete_rule(rule_id: str) -> bool:
        """
        Deactivates a rule by setting is_active to False.
        """
        from backend.dependencies import db
        result = await db.bank_rules.update_one(
            {"id": rule_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0
