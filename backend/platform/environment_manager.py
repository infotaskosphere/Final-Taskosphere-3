import os
import logging
from typing import Dict, Any

logger = logging.getLogger("environment_manager")

class EnvironmentManager:
    @staticmethod
    def get_environment_info() -> Dict[str, Any]:
        """Provides state of cloud integration properties."""
        return {
            "mode": os.getenv("ENV_MODE", "development"),
            "has_mongo_url": bool(os.getenv("MONGO_URL")),
            "has_gemini_key": bool(os.getenv("GEMINI_API_KEY")),
            "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
            "has_claud_key": bool(os.getenv("ANTHROPIC_API_KEY")),
            "active_ai_provider": os.getenv("DEFAULT_AI_PROVIDER", "gemini"),
            "port_configured": os.getenv("PORT", "3000")
        }

    @staticmethod
    def is_production() -> bool:
        return os.getenv("ENV_MODE") == "production"
