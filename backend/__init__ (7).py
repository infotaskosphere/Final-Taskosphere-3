import logging
from typing import Any
from fastapi import HTTPException

logger = logging.getLogger("copilot_permissions")

class CopilotPermissions:
    @staticmethod
    def assert_can_query_financials(user: Any) -> None:
        """Enforces permission check before sharing delicate reports."""
        role = getattr(user, "role", "staff")
        if role == "admin":
            return
            
        perms = getattr(user, "permissions", {})
        if isinstance(perms, dict):
            can_view = perms.get("can_view_reports", False)
        else:
            can_view = getattr(perms, "can_view_reports", False)
            
        if not can_view:
            logger.warning(f"User {getattr(user, 'id', 'unknown')} denied financial query permission.")
            raise HTTPException(status_code=403, detail="Forbidden: You do not have permission to view financial sheets via AI Copilot.")

    @staticmethod
    def assert_can_reconcile(user: Any) -> None:
        """Enforces permission check for ledger reconciliation."""
        role = getattr(user, "role", "staff")
        if role in ["admin", "manager"]:
            return
            
        perms = getattr(user, "permissions", {})
        if isinstance(perms, dict):
            can_edit = perms.get("can_edit_tasks", False)
        else:
            can_edit = getattr(perms, "can_edit_tasks", False)
            
        if not can_edit:
            raise HTTPException(status_code=403, detail="Forbidden: Reconciling ledgers requires Manager or Admin status.")
