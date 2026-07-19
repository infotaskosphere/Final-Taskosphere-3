import logging
import hashlib
import asyncio
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from backend.services.gemini_client import get_gemini_client
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("embedding_engine")

class EmbeddingProvider(ABC):
    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        pass

class GeminiEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str = "text-embedding-004"):
        self.model_name = model_name

    async def generate_embedding(self, text: str) -> List[float]:
        if not text:
            return [0.0] * 768
        try:
            client = get_gemini_client()
            def _call_api():
                # text-embedding-004 expects client.models.embed_content
                res = client.models.embed_content(
                    model=self.model_name,
                    contents=text
                )
                if hasattr(res, "embedding") and res.embedding:
                    return res.embedding.values
                elif hasattr(res, "embeddings") and res.embeddings:
                    return res.embeddings[0].values
                return None

            embedding = await asyncio.to_thread(_call_api)
            if embedding:
                return list(embedding)
            raise ValueError("No embedding returned from Gemini API")
        except Exception as e:
            logger.warning(f"Gemini embedding failed: {e}. Falling back to Local/Mock embedding.")
            # Fall back to local hash provider on any failure
            local_prov = LocalEmbeddingProvider()
            return await local_prov.generate_embedding(text)

class LocalEmbeddingProvider(EmbeddingProvider):
    """
    Deterministic mock/local embedding provider that converts text to a 768-dimension vector
    using SHA-256 hashes. Perfect for offline, fallback, and cost-effective environments.
    """
    async def generate_embedding(self, text: str) -> List[float]:
        if not text:
            return [0.0] * 768
        
        # Split text into chunks to generate visual variation
        vector = []
        for i in range(768):
            # Seed based on the position and text
            seed = f"{text}_{i}"
            h = hashlib.sha256(seed.encode("utf-8")).hexdigest()
            # Map hash to a value between -1.0 and 1.0
            val = (int(h[:8], 16) / 4294967295.0) * 2.0 - 1.0
            vector.append(round(val, 6))
        return vector

class EmbeddingEngine:
    _provider: EmbeddingProvider = GeminiEmbeddingProvider()

    @classmethod
    def set_provider(cls, provider: EmbeddingProvider):
        cls._provider = provider
        logger.info(f"Embedding provider updated to: {provider.__class__.__name__}")

    @classmethod
    async def get_or_create_embedding(cls, target_id: str, target_type: str, text: str) -> List[float]:
        """
        Fetches an existing embedding or generates a new one, storing it in the DB.
        """
        try:
            cached = await LearningStorage.get_embedding(target_id, target_type)
            if cached and "vector" in cached:
                return cached["vector"]
            
            vector = await cls._provider.generate_embedding(text)
            
            await LearningStorage.save_embedding({
                "target_id": target_id,
                "target_type": target_type,
                "text_preview": text[:200],
                "vector": vector
            })
            return vector
        except Exception as e:
            logger.error(f"Error in EmbeddingEngine: {e}", exc_info=True)
            # Safe fallback so we never crash
            local_prov = LocalEmbeddingProvider()
            return await local_prov.generate_embedding(text)
