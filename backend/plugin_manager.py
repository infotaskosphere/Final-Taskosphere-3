import logging
from typing import Dict, Any, List

logger = logging.getLogger("plugin_permissions")

class PluginPermissions:
    @staticmethod
    def verify_plugin_access(plugin_id: str, action_requested: str, granted_permissions: List[str]) -> bool:
        """Checks if a third-party plugin is allowed to run the requested action."""
        # Simple security matrix
        dangerous_actions = ["delete_database", "modify_auth_keys", "bypass_audit"]
        if action_requested in dangerous_actions:
            logger.warning(f"Plugin {plugin_id} attempted a blocked system-level action: {action_requested}")
            return False
            
        # Standard plugin action checks
        if action_requested in granted_permissions:
            return True
            
        logger.warning(f"Plugin {plugin_id} denied permission for {action_requested}.")
        return False
