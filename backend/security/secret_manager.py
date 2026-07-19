import os
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("secret_manager")

class SecretManager:
    @staticmethod
    def get_secured_key(provider_name: str) -> Optional[str]:
        """Hides and retrieves client API keys dynamically without committing secrets."""
        env_mappings = {
            "gemini": "GEMINI_API_KEY",
            "openai": "OPENAI_API_KEY",
            "claude": "ANTHROPIC_API_KEY",
            "mca": "MCA_API_SECRET",
            "gstin": "GST_PORTAL_SECRET"
        }
        env_var = env_mappings.get(provider_name.lower())
        if not env_var:
            return None
        return os.getenv(env_var)

    @staticmethod
    def is_configured(provider_name: str) -> bool:
        return bool(SecretManager.get_secured_key(provider_name))
