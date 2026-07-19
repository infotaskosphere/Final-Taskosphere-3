import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("feature_manager")

class FeatureManager:
    DEFAULT_FEATURES = {
        "accounting": True,
        "gst": True,
        "income_tax": True,
        "roc": False,
        "trademark": False,
        "payroll": False,
        "hr": False,
        "crm": False,
        "inventory": False,
        "project_management": False,
        "task_management": True,
        "ai_copilot": True,
        "banking": True,
        "document_management": True,
        "workflow": True,
        "analytics": True,
        "custom_modules": False
    }

    @staticmethod
    async def get_tenant_features(tenant_id: str) -> Dict[str, bool]:
        """Retrieves active features for a given tenant."""
        flag_doc = await db.feature_flags.find_one({"tenant_id": tenant_id})
        if not flag_doc:
            # Seed default feature flags
            now = datetime.now(timezone.utc).isoformat()
            new_flags = {
                "tenant_id": tenant_id,
                "features": FeatureManager.DEFAULT_FEATURES,
                "created_at": now,
                "updated_at": now
            }
            await db.feature_flags.update_one({"tenant_id": tenant_id}, {"$set": new_flags}, upsert=True)
            return FeatureManager.DEFAULT_FEATURES
        
        # Merge with defaults to prevent missing keys
        merged = {**FeatureManager.DEFAULT_FEATURES, **flag_doc.get("features", {})}
        return merged

    @staticmethod
    async def is_feature_enabled(tenant_id: str, feature_name: str) -> bool:
        """Checks if a modular feature is unlocked for a tenant without code changes."""
        features = await FeatureManager.get_tenant_features(tenant_id)
        return features.get(feature_name, False)

    @staticmethod
    async def enable_feature(tenant_id: str, feature_name: str, enabled: bool = True) -> bool:
        """Enables/disables a feature flag for a tenant dynamically."""
        now = datetime.now(timezone.utc).isoformat()
        key = f"features.{feature_name}"
        result = await db.feature_flags.update_one(
            {"tenant_id": tenant_id},
            {"$set": {key: enabled, "updated_at": now}},
            upsert=True
        )
        logger.info(f"Feature '{feature_name}' set to {enabled} for tenant {tenant_id}.")
        return True
