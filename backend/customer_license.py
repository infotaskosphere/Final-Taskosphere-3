import logging
from typing import Dict, Any, List
from backend.licensing.license_engine import LicenseEngine

logger = logging.getLogger("feature_unlock")

class FeatureUnlock:
    LICENSED_TIER_FEATURES = {
        "TRIAL": ["accounting", "task_management"],
        "STANDARD": ["accounting", "gst", "task_management", "document_management", "workflow"],
        "ENTERPRISE": ["accounting", "gst", "income_tax", "roc", "task_management", "ai_copilot", "banking", "document_management", "workflow", "analytics"]
    }

    @staticmethod
    async def can_tenant_access_feature(tenant_id: str, feature_name: str) -> bool:
        """Enforces functional level restrictions based on active SaaS licenses."""
        status_info = await LicenseEngine.verify_tenant_license(tenant_id)
        tier = status_info.get("license_type", "TRIAL").upper()
        
        unlocked_features = FeatureUnlock.LICENSED_TIER_FEATURES.get(tier, FeatureUnlock.LICENSED_TIER_FEATURES["TRIAL"])
        return feature_name in unlocked_features
