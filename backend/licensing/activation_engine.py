import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import uuid
from backend.dependencies import db

logger = logging.getLogger("activation_engine")

class ActivationEngine:
    @staticmethod
    async def activate_license_key(tenant_id: str, raw_key: str) -> bool:
        """Saves a verified retail or reseller activation key to the tenant profile."""
        now = datetime.now(timezone.utc).isoformat()
        
        # Verify if key is valid (mock check: has standard length)
        if len(raw_key) < 16:
            logger.warning(f"Activation failed: key format is invalid.")
            return False
            
        license_doc = {
            "tenant_id": tenant_id,
            "license_key": raw_key,
            "license_type": "enterprise" if "ent" in raw_key.lower() else "standard",
            "max_users": 500 if "ent" in raw_key.lower() else 50,
            "status": "active",
            "assigned_at": now,
            "updated_at": now
        }
        await db.licenses.update_one({"tenant_id": tenant_id}, {"$set": license_doc}, upsert=True)
        
        # Dispatch audit event
        await db.audit_platform.insert_one({
            "id": str(uuid.uuid4()),
            "action": "license_activated",
            "status": "SUCCESS",
            "details": f"License {raw_key[:8]}... activated for tenant {tenant_id}.",
            "created_at": now
        })
        return True
