import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("tenant_manager")

class TenantManager:
    @staticmethod
    async def create_tenant(tenant_id: str, name: str, schema_type: str = "isolated", settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Creates a new isolated tenant profile."""
        now = datetime.now(timezone.utc).isoformat()
        tenant_doc = {
            "id": tenant_id or str(uuid.uuid4()),
            "name": name,
            "schema_type": schema_type, # isolated, shared
            "status": "active",
            "settings": settings or {},
            "branding": {
                "theme": "light",
                "logo_url": "",
                "custom_domain": ""
            },
            "created_at": now,
            "updated_at": now
        }
        await db.tenants.update_one({"id": tenant_doc["id"]}, {"$set": tenant_doc}, upsert=True)
        logger.info(f"Tenant {tenant_id} created or updated.")
        return tenant_doc

    @staticmethod
    async def get_tenant(tenant_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves tenant profile by ID."""
        return await db.tenants.find_one({"id": tenant_id})

    @staticmethod
    async def update_branding(tenant_id: str, theme: str, logo_url: str, custom_domain: str) -> bool:
        """Updates custom white-label branding for a tenant."""
        now = datetime.now(timezone.utc).isoformat()
        result = await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "branding.theme": theme,
                "branding.logo_url": logo_url,
                "branding.custom_domain": custom_domain,
                "updated_at": now
            }}
        )
        return result.modified_count > 0

    @staticmethod
    async def list_tenants() -> List[Dict[str, Any]]:
        """Lists all tenants."""
        return await db.tenants.find({}).to_list(1000)
