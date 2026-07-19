import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from backend.dependencies import db

logger = logging.getLogger("usage_tracker")

class UsageTracker:
    @staticmethod
    async def track_metric_usage(tenant_id: str, metric_name: str, increment_value: int = 1) -> int:
        """Increments usage counters for metered billing plans dynamically."""
        now = datetime.now(timezone.utc).isoformat()
        
        doc = await db.customer_usage.find_one_and_update(
            {"tenant_id": tenant_id, "metric": metric_name},
            {"$inc": {"value": increment_value}, "$set": {"updated_at": now}},
            upsert=True,
            return_document=True
        )
        val = increment_value
        if doc:
            val = doc.get("value", increment_value) if isinstance(doc, dict) else getattr(doc, "value", increment_value)
            
        logger.info(f"Usage tracked for {tenant_id}: {metric_name} is now {val}.")
        return val

    @staticmethod
    async def get_monthly_usage(tenant_id: str) -> Dict[str, Any]:
        """Provides dynamic resource consumption reports."""
        cursor = db.customer_usage.find({"tenant_id": tenant_id})
        docs = await cursor.to_list(100)
        return {doc.get("metric", "unknown"): doc.get("value", 0) for doc in docs}
