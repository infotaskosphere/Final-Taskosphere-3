import logging
from typing import Dict, Any, List
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("plugin_events")

class PluginEvents:
    @staticmethod
    async def dispatch_event(plugin_id: str, event_name: str, payload: Dict[str, Any]) -> str:
        """Publishes an event to the plugin_events database log."""
        now = datetime.now(timezone.utc).isoformat()
        event_id = str(uuid.uuid4())
        
        event_doc = {
            "id": event_id,
            "plugin_id": plugin_id,
            "event_name": event_name, # ledger_posted, invoice_uploaded, payroll_run
            "payload": payload,
            "created_at": now
        }
        await db.plugin_events.insert_one(event_doc)
        logger.info(f"Dispatched event '{event_name}' from plugin {plugin_id}.")
        return event_id

    @staticmethod
    async def get_recent_events(limit: int = 50) -> List[Dict[str, Any]]:
        return await db.plugin_events.find({}).sort("created_at", -1).limit(limit).to_list(limit)
