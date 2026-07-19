import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("organization_manager")

class OrganizationManager:
    @staticmethod
    async def create_organization(org_id: str, name: str, tenant_id: str, org_type: str = "business", parent_org_id: Optional[str] = None) -> Dict[str, Any]:
        """Creates a business, CA firm, or Holding Company organization."""
        now = datetime.now(timezone.utc).isoformat()
        org_doc = {
            "id": org_id or str(uuid.uuid4()),
            "name": name,
            "tenant_id": tenant_id,
            "org_type": org_type, # business, ca_firm, holding_company, franchise, reseller
            "parent_org_id": parent_org_id,
            "status": "active",
            "metadata": {},
            "created_at": now,
            "updated_at": now
        }
        await db.organizations.update_one({"id": org_doc["id"]}, {"$set": org_doc}, upsert=True)
        logger.info(f"Organization {org_doc['id']} ({name}) created or updated under tenant {tenant_id}.")
        return org_doc

    @staticmethod
    async def get_organization(org_id: str) -> Optional[Dict[str, Any]]:
        return await db.organizations.find_one({"id": org_id})

    @staticmethod
    async def get_subsidiaries(parent_org_id: str) -> List[Dict[str, Any]]:
        """Retrieves child organizations for corporate groups and franchise networks."""
        return await db.organizations.find({"parent_org_id": parent_org_id}).to_list(100)

    @staticmethod
    async def list_organizations_by_tenant(tenant_id: str) -> List[Dict[str, Any]]:
        return await db.organizations.find({"tenant_id": tenant_id}).to_list(500)
