import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("license_engine")

class LicenseEngine:
    @staticmethod
    async def verify_tenant_license(tenant_id: str) -> Dict[str, Any]:
        """Queries database records to determine current active license status."""
        lic = await db.licenses.find_one({"tenant_id": tenant_id})
        if not lic:
            return {
                "status": "TRIAL",
                "message": "Running on standard community trial.",
                "max_users": 5,
                "unlocked_features": ["accounting", "task_management"]
            }
            
        is_active = lic.get("status") == "active"
        lic_type = lic.get("license_type", "standard").upper()
        
        return {
            "status": "LICENSED" if is_active else "EXPIRED",
            "license_type": lic_type,
            "max_users": lic.get("max_users", 50),
            "assigned_at": lic.get("assigned_at")
        }
