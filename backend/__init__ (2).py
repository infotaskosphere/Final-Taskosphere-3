import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("configuration_manager")

class ConfigurationManager:
    @staticmethod
    async def get_tenant_config(tenant_id: str) -> Dict[str, Any]:
        """Retrieves tenant-specific settings and fallback to defaults."""
        default_config = {
            "currency": "INR",
            "timezone": "Asia/Kolkata",
            "fiscal_year_start": "04-01", # April 1st
            "enable_auto_posting": True,
            "ocr_preferred_language": "eng",
            "backup_enabled": True
        }
        
        tenant = await db.tenants.find_one({"id": tenant_id})
        if not tenant:
            return default_config
        
        tenant_settings = tenant.get("settings", {})
        return {**default_config, **tenant_settings}

    @staticmethod
    async def update_tenant_config(tenant_id: str, new_settings: Dict[str, Any]) -> bool:
        """Saves custom tenant configuration parameters."""
        now = datetime.now(timezone.utc).isoformat()
        current_config = await ConfigurationManager.get_tenant_config(tenant_id)
        updated_config = {**current_config, **new_settings}
        
        result = await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"settings": updated_config, "updated_at": now}},
            upsert=True
        )
        logger.info(f"Updated configuration parameters for tenant {tenant_id}.")
        return True
