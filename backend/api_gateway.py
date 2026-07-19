import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("license_manager")

class LicenseManager:
    @staticmethod
    async def assign_license(tenant_id: str, license_key: str, license_type: str = "enterprise", max_users: int = 100) -> Dict[str, Any]:
        """Assigns an enterprise or reseller software license to a tenant."""
        now = datetime.now(timezone.utc).isoformat()
        license_doc = {
            "tenant_id": tenant_id,
            "license_key": license_key,
            "license_type": license_type, # white_label, partner, reseller, enterprise
            "max_users": max_users,
            "status": "active",
            "assigned_at": now,
            "updated_at": now
        }
        await db.licenses.update_one({"tenant_id": tenant_id}, {"$set": license_doc}, upsert=True)
        logger.info(f"License key {license_key} assigned to tenant {tenant_id}.")
        return license_doc

    @staticmethod
    async def get_license(tenant_id: str) -> Optional[Dict[str, Any]]:
        return await db.licenses.find_one({"tenant_id": tenant_id})

    @staticmethod
    async def validate_license(tenant_id: str) -> bool:
        lic = await db.licenses.find_one({"tenant_id": tenant_id})
        if not lic:
            return False
        return lic.get("status") == "active"
