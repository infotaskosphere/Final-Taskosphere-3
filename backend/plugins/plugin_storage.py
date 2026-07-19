import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("plugin_storage")

class PluginStorage:
    @staticmethod
    async def get_isolated_data(plugin_id: str, tenant_id: str, key: str) -> Optional[Dict[str, Any]]:
        """Retrieves tenant-isolated, sandboxed config for plugins."""
        doc = await db.plugin_events.find_one({
            "plugin_id": plugin_id,
            "tenant_id": tenant_id,
            "key": key
        })
        return doc.get("value") if doc else None

    @staticmethod
    async def save_isolated_data(plugin_id: str, tenant_id: str, key: str, value: Dict[str, Any]) -> bool:
        """Saves custom plugin data variables inside sandboxed namespace."""
        now = datetime.now(timezone.utc).isoformat()
        await db.plugin_events.update_one(
            {"plugin_id": plugin_id, "tenant_id": tenant_id, "key": key},
            {"$set": {"value": value, "updated_at": now}},
            upsert=True
        )
        return True
