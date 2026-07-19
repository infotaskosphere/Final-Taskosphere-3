import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db
from backend.plugins.plugin_registry import PluginRegistry
from backend.plugins.plugin_permissions import PluginPermissions
from backend.plugins.plugin_events import PluginEvents
from backend.plugins.plugin_loader import PluginLoader

logger = logging.getLogger("plugin_manager")

class PluginManager:
    @staticmethod
    async def install_plugin(tenant_id: str, plugin_id: str) -> bool:
        """Installs a plugin for a specific tenant."""
        now = datetime.now(timezone.utc).isoformat()
        
        # Verify if plugin exists in central registry
        plugin = await PluginRegistry.get_plugin(plugin_id)
        if not plugin:
            logger.error(f"Plugin {plugin_id} not found in central marketplace.")
            return False
            
        # Log to tenant plugins list
        await db.plugins.update_one(
            {"id": plugin_id},
            {"$addToSet": {"installed_tenants": tenant_id}}
        )
        
        # Record event
        await PluginEvents.dispatch_event(
            plugin_id=plugin_id,
            event_name="plugin_installed",
            payload={"tenant_id": tenant_id}
        )
        
        # Log global audit
        await db.audit_platform.insert_one({
            "id": str(uuid.uuid4()),
            "action": "plugin_installed",
            "status": "SUCCESS",
            "details": f"Plugin {plugin_id} installed for tenant {tenant_id}.",
            "created_at": now
        })
        logger.info(f"Plugin {plugin_id} installed successfully for tenant {tenant_id}.")
        return True

    @staticmethod
    async def trigger_plugin_action(tenant_id: str, plugin_id: str, hook_name: str, args: List[Any], kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """Loads and executes a sandboxed plugin action securely."""
        plugin = await PluginRegistry.get_plugin(plugin_id)
        if not plugin:
            return {"status": "FAILED", "error": "Plugin not registered"}
            
        # Check permissions
        permissions = plugin.get("permissions", [])
        if not PluginPermissions.verify_plugin_access(plugin_id, hook_name, permissions):
            return {"status": "FAILED", "error": f"Permission denied for hook {hook_name}"}
            
        # Load and run code
        hook_callback = PluginLoader.load_plugin_hook(plugin_id, hook_name)
        if not hook_callback:
            return {"status": "FAILED", "error": "Hook logic load failure"}
            
        try:
            # Inject isolated storage or helper context
            kwargs["tenant_id"] = tenant_id
            result = hook_callback(*args, **kwargs)
            
            # Dispatch event
            await PluginEvents.dispatch_event(
                plugin_id=plugin_id,
                event_name="hook_executed",
                payload={"hook": hook_name, "tenant_id": tenant_id, "result": result}
            )
            return result
        except Exception as e:
            logger.error(f"Failed to execute plugin hook {plugin_id}.{hook_name}: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}
