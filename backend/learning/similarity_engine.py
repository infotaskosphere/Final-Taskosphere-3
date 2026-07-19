import math
import logging
from typing import List, Dict, Any
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("similarity_engine")

class SimilarityEngine:
    @staticmethod
    def cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """Computes the cosine similarity between two vectors."""
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot_product = sum(a * b for a, b in zip(v1, v2))
        magnitude_v1 = math.sqrt(sum(a * a for a in v1))
        magnitude_v2 = math.sqrt(sum(b * b for b in v2))
        if magnitude_v1 == 0.0 or magnitude_v2 == 0.0:
            return 0.0
        return dot_product / (magnitude_v1 * magnitude_v2)

    @classmethod
    async def find_similar_items(
        cls,
        target_vector: List[float],
        target_type: str,
        threshold: float = 0.7,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Finds database items of target_type most similar to target_vector.
        Returns a sorted list of matched items, score, and match details.
        """
        try:
            # Load embeddings for this category
            all_embeddings = await LearningStorage.list_embeddings({"target_type": target_type}, limit=1000)
            
            results = []
            for emb in all_embeddings:
                score = cls.cosine_similarity(target_vector, emb.get("vector", []))
                if score >= threshold:
                    results.append({
                        "target_id": emb["target_id"],
                        "score": round(score, 4),
                        "text_preview": emb.get("text_preview", ""),
                        "explanation": f"Matched with {round(score * 100, 1)}% semantic similarity based on text fingerprint: '{emb.get('text_preview', '')[:60]}...'"
                    })
            
            results.sort(key=lambda x: x["score"], reverse=True)
            return results[:limit]
        except Exception as e:
            logger.error(f"Failed in find_similar_items: {e}", exc_info=True)
            return []
