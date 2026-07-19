import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("storage_manager")

class StorageManager:
    @staticmethod
    async def get_storage_stats(tenant_id: str) -> Dict[str, Any]:
        """Retrieves storage statistics, limits, and usage."""
        # Standard default limit: 10 GB (in bytes)
        default_limit = 10 * 1024 * 1024 * 1024
        
        doc = await db.customer_usage.find_one({"tenant_id": tenant_id, "metric": "storage_bytes"})
        used_bytes = doc.get("value", 0) if doc else 0
        
        return {
            "tenant_id": tenant_id,
            "used_bytes": used_bytes,
            "limit_bytes": default_limit,
            "available_bytes": max(0, default_limit - used_bytes),
            "percentage_used": round((used_bytes / default_limit) * 100, 2) if default_limit > 0 else 0.0
        }

    @staticmethod
    async def record_storage_allocation(tenant_id: str, file_size_bytes: int) -> bool:
        """Tracks storage allocation and increments metric usage."""
        now = datetime.now(timezone.utc).isoformat()
        await db.customer_usage.update_one(
            {"tenant_id": tenant_id, "metric": "storage_bytes"},
            {"$inc": {"value": file_size_bytes}, "$set": {"updated_at": now}},
            upsert=True
        )
        logger.info(f"Allocated {file_size_bytes} bytes for tenant {tenant_id}.")
        return True

    @staticmethod
    async def check_storage_quota(tenant_id: str, incoming_file_size: int) -> bool:
        """Verifies if tenant has enough storage space available."""
        stats = await StorageManager.get_storage_stats(tenant_id)
        return stats["available_bytes"] >= incoming_file_size
