import logging
from typing import Dict, Any, List, Optional
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("model_registry")

DEFAULT_MODELS = [
    {
        "id": "gemini_flash_2_5",
        "name": "Gemini 2.5 Flash",
        "provider": "Google Gemini",
        "type": "classification",
        "version": "2.5.0",
        "active": True,
        "performance_score": 0.98,
        "parameters": {"temperature": 0.0}
    },
    {
        "id": "text_embedding_004",
        "name": "Text Embedding 004",
        "provider": "Google Gemini",
        "type": "embedding",
        "version": "1.0.0",
        "active": True,
        "performance_score": 0.96,
        "parameters": {"dimension": 768}
    },
    {
        "id": "google_vision_ocr",
        "name": "Google Cloud Vision OCR",
        "provider": "Google Cloud",
        "type": "ocr",
        "version": "3.0.0",
        "active": True,
        "performance_score": 0.97,
        "parameters": {}
    }
]

class ModelRegistry:
    @classmethod
    async def get_active_model(cls, model_type: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves the configured active model for a task category.
        """
        try:
            # Look up in database config, if not found, use default
            configs = await LearningStorage.list_learning_versions({"entity_type": "model_config"}, limit=100)
            for c in configs:
                state = c.get("state", {})
                if state.get("type") == model_type and state.get("active") is True:
                    return state

            # Fallback to predefined defaults
            for m in DEFAULT_MODELS:
                if m["type"] == model_type and m["active"] is True:
                    return m
            return None
        except Exception as e:
            logger.error(f"Error querying model registry: {e}", exc_info=True)
            return None

    @classmethod
    async def register_model(cls, model_doc: Dict[str, Any], user_id: str) -> bool:
        """
        Registers a new model version or updates its performance score and parameter mapping.
        """
        try:
            from backend.learning.version_manager import VersionManager
            await VersionManager.create_version(
                entity_id=model_doc["id"],
                entity_type="model_config",
                company_id="system",
                state=model_doc,
                created_by=user_id,
                description=f"Model config registration for {model_doc['name']}"
            )
            logger.info(f"Registered model: {model_doc['id']} in Registry.")
            return True
        except Exception as e:
            logger.error(f"Failed to register model in Registry: {e}", exc_info=True)
            return False
