import logging
from typing import Dict, Any, List, Optional
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("version_manager")

class VersionManager:
    @classmethod
    async def create_version(
        cls,
        entity_id: str,
        entity_type: str,
        company_id: str,
        state: Dict[str, Any],
        created_by: str,
        description: str = ""
    ) -> str:
        """
        Saves a snapshot of an entity's state as a new immutable version.
        """
        try:
            # Query existing snapshots to calculate next version number
            existing = await LearningStorage.list_learning_versions(
                {"entity_id": entity_id, "entity_type": entity_type, "company_id": company_id}
            )
            next_version_num = len(existing) + 1
            version_str = f"v{next_version_num}.0.0"

            version_doc = {
                "entity_id": entity_id,
                "entity_type": entity_type,
                "company_id": company_id,
                "version": version_str,
                "state": state,
                "created_by": created_by,
                "description": description
            }
            version_id = await LearningStorage.save_learning_version(version_doc)
            logger.info(f"Version recorded: {entity_type} {entity_id} -> {version_str} (Audit ID: {version_id})")
            return version_str
        except Exception as e:
            logger.error(f"Failed to snapshot version for {entity_type} {entity_id}: {e}", exc_info=True)
            return "v1.0.0"

    @classmethod
    async def get_latest_version(cls, entity_id: str, entity_type: str, company_id: str) -> Optional[Dict[str, Any]]:
        try:
            records = await LearningStorage.list_learning_versions({
                "entity_id": entity_id,
                "entity_type": entity_type,
                "company_id": company_id
            }, limit=1)
            return records[0] if records else None
        except Exception as e:
            logger.error(f"Failed to fetch latest version: {e}", exc_info=True)
            return None
