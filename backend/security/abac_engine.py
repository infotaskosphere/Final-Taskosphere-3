import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, time
from fastapi import HTTPException

logger = logging.getLogger("abac_engine")

class ABACEngine:
    @staticmethod
    def enforce_abac_policies(user: Any, resource_dept: Optional[str] = None, client_ip: Optional[str] = None) -> None:
        """Enforces department boundary checks and working hour constraints."""
        # 1. Check Department Boundary
        if resource_dept:
            user_depts = getattr(user, "departments", []) or []
            role = getattr(user, "role", "staff")
            if role != "admin" and resource_dept not in user_depts:
                logger.warning(f"ABAC blocked user {getattr(user, 'id', '')} - department mismatch.")
                raise HTTPException(status_code=403, detail="ABAC Policy: You do not belong to the required department.")

        # 2. Check Work Hours (Optional standard security policy)
        now = datetime.now()
        current_hour = now.time()
        # Non-critical warning if working at unusual hours (11 PM to 5 AM)
        if current_hour > time(23, 0) or current_hour < time(5, 0):
            logger.info(f"User {getattr(user, 'id', '')} accessing system during off-hours.")
