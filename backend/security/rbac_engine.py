import logging
from typing import Dict, Any, List
from backend.dependencies import db, _get_perm

logger = logging.getLogger("rbac_engine")

class RBACEngine:
    @staticmethod
    def verify_rbac_access(user: Any, required_permission: str) -> bool:
        """Enforces RBAC matrix: Admin bypass, or named bool permission flag matches."""
        role = getattr(user, "role", "staff")
        if role == "admin":
            return True
            
        return _get_perm(user, required_permission, False)
