import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("memory_manager")

class MemoryManager:
    @staticmethod
    async def index_vector_embedding(entity_id: str, text: str, embedding: List[float], metadata: Optional[Dict[str, Any]] = None) -> str:
        """Saves a semantic embedding vector for enterprise searches."""
        now = datetime.now(timezone.utc).isoformat()
        embedding_id = str(uuid.uuid4())
        
        doc = {
            "id": embedding_id,
            "entity_id": entity_id,
            "text": text,
            "embedding": embedding,
            "metadata": metadata or {},
            "created_at": now
        }
        await db.vector_embeddings.insert_one(doc)
        logger.info(f"Vector indexed for entity {entity_id}.")
        return embedding_id

    @staticmethod
    async def find_similar_memories(embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        """Finds matching semantic memories (simulated vector search fallback)."""
        # Falls back to standard projection or search in DB
        return await db.vector_embeddings.find({}).limit(limit).to_list(limit)
