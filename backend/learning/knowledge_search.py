import logging
from typing import List, Dict, Any, Optional
from backend.learning.embedding_engine import EmbeddingEngine
from backend.learning.similarity_engine import SimilarityEngine
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("knowledge_search")

class KnowledgeSearch:
    @classmethod
    async def semantic_search(
        cls,
        query: str,
        company_id: str,
        target_type: str,
        threshold: float = 0.5,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Executes a semantic search against the Knowledge Base items by projecting the
        query string into vector space and ranking stored items using cosine similarity.
        """
        try:
            logger.info(f"Initiating knowledge semantic search for query: '{query}' [company_id={company_id}, target_type={target_type}]")
            # Generate embedding vector for the search query
            query_vector = await EmbeddingEngine.get_or_create_embedding(
                target_id=f"query_{hash(query)}",
                target_type="search_query",
                text=query
            )
            
            # Find closest matching entries via similarity engine
            similar_items = await SimilarityEngine.find_similar_items(
                target_vector=query_vector,
                target_type=target_type,
                threshold=threshold,
                limit=limit
            )
            
            # Enrich matches with their actual KB values
            enriched_results = []
            for item in similar_items:
                kb_id = item["target_id"]
                kb_data = await LearningStorage.get_knowledge(kb_id)
                if kb_data and kb_data.get("company_id") == company_id:
                    enriched_results.append({
                        "score": item["score"],
                        "explanation": item["explanation"],
                        "category": kb_data.get("category"),
                        "key": kb_data.get("key"),
                        "value": kb_data.get("value"),
                        "confidence": kb_data.get("confidence", 1.0),
                        "meta": kb_data.get("meta", {})
                    })
            
            return enriched_results
        except Exception as e:
            logger.error(f"Semantic search failed: {e}", exc_info=True)
            return []
