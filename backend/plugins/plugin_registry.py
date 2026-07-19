import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("plugin_registry")

class PluginRegistry:
    @staticmethod
    async def register_plugin(plugin_id: str, name: str, category: str, version: str = "1.0.0", description: str = "") -> Dict[str, Any]:
        """Saves a plugin metadata profile to the centralized marketplace."""
        now = datetime.now(timezone.utc).isoformat()
        plugin_doc = {
            "id": plugin_id,
            "name": name,
            "category": category, # HR, CRM, Payroll, Inventory, Custom
            "version": version,
            "description": description,
            "status": "installed", # installed, active, disabled
            "permissions": ["read_ledger", "write_ledger"],
            "created_at": now,
            "updated_at": now
        }
        await db.plugins.update_one({"id": plugin_id}, {"$set": plugin_doc}, upsert=True)
        logger.info(f"Plugin {name} ({plugin_id}) registered successfully.")
        return plugin_doc

    @staticmethod
    async def get_plugin(plugin_id: str) -> Optional[Dict[str, Any]]:
        return await db.plugins.find_one({"id": plugin_id})

    @staticmethod
    async def list_plugins(category: Optional[str] = None) -> List[Dict[str, Any]]:
        query = {"category": category} if category else {}
        return await db.plugins.find(query).to_list(200)
