import logging
from typing import Dict, Any, List, Optional
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("knowledge_base")

class KnowledgeBase:
    _cache: Dict[str, Dict[str, Any]] = {}

    @classmethod
    async def store_knowledge_item(
        cls,
        category: str,
        key: str,
        company_id: str,
        value: Any,
        confidence: float = 1.0,
        meta: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Saves or updates an entry in the structured Knowledge Base.
        """
        try:
            kb_id = f"{company_id}_{category}_{key}"
            doc = {
                "id": kb_id,
                "category": category,
                "key": key,
                "company_id": company_id,
                "value": value,
                "confidence": round(confidence, 4),
                "meta": meta or {}
            }
            stored_id = await LearningStorage.save_knowledge(doc)
            
            # Update local cache
            cls._cache[kb_id] = doc
            logger.info(f"Knowledge Base updated: category={category}, key={key}, company={company_id}")
            return stored_id
        except Exception as e:
            logger.error(f"Failed to store knowledge item: {e}", exc_info=True)
            return ""

    @classmethod
    async def get_knowledge_item(cls, category: str, key: str, company_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a knowledge item, prioritizing the local memory cache.
        """
        kb_id = f"{company_id}_{category}_{key}"
        if kb_id in cls._cache:
            return cls._cache[kb_id]
        
        try:
            item = await LearningStorage.get_knowledge(kb_id)
            if item:
                cls._cache[kb_id] = item
                return item
        except Exception as e:
            logger.error(f"Failed to fetch from knowledge base: {e}", exc_info=True)
        return None

    @classmethod
    async def list_by_category(cls, category: str, company_id: str) -> List[Dict[str, Any]]:
        """
        Lists all knowledge items for a category.
        """
        try:
            return await LearningStorage.list_knowledge({"category": category, "company_id": company_id})
        except Exception as e:
            logger.error(f"Failed to list knowledge: {e}", exc_info=True)
            return []

    @classmethod
    def invalidate_cache(cls):
        cls._cache.clear()
        logger.info("Knowledge Base cache invalidated.")
