import logging
from typing import Dict, Any, Optional
from backend.learning.feedback_engine import FeedbackEngine
from backend.learning.knowledge_base import KnowledgeBase
from backend.learning.background_jobs import BackgroundLearningJobs
from backend.learning.recommendation_engine import RecommendationEngine

logger = logging.getLogger("learning_engine")

class LearningEngine:
    @classmethod
    async def process_learning(
        cls,
        company_id: str,
        user_id: str,
        event_type: str,
        source_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """
        Processes a validated and approved business outcome (e.g. approved journal posting,
        verified bank statement matching, or manual corrections) and incorporates it into
        the Knowledge Base asynchronously.
        """
        try:
            logger.info(f"LearningEngine: Processing approved learning event '{event_type}' for source '{source_id}'")
            
            # Step 1: Record positive feedback in our event storage
            event_id = await FeedbackEngine.capture_positive_feedback(
                event_type=event_type,
                source_id=source_id,
                company_id=company_id,
                user_id=user_id,
                data=data,
                description=f"Auto-learned from approved {event_type} ledger posting."
            )
            if not event_id:
                return False

            # Step 2: Analyze and update organizational knowledge
            # 2a. Learn Vendor-to-Ledger mapping
            vendor_name = data.get("vendor_name") or data.get("vendor") or ""
            ledger_code = data.get("ledger_code") or data.get("account_code") or ""
            if vendor_name and ledger_code:
                vendor_key = vendor_name.strip().lower()
                # Update vendor-to-ledger mapping with 0.95 baseline confidence for approved items
                await KnowledgeBase.store_knowledge_item(
                    category="vendor_ledger",
                    key=vendor_key,
                    company_id=company_id,
                    value=ledger_code,
                    confidence=0.98,
                    meta={"vendor_name": vendor_name, "last_source_id": source_id}
                )

            # 2b. Learn Document Type-to-GST Rate pattern
            doc_type = data.get("document_type") or ""
            gst_rate = data.get("gst_rate") or data.get("tax_rate")
            if doc_type and gst_rate is not None:
                await KnowledgeBase.store_knowledge_item(
                    category="gst_rate_patterns",
                    key=doc_type.strip().lower(),
                    company_id=company_id,
                    value=float(gst_rate),
                    confidence=0.95,
                    meta={"last_source_id": source_id}
                )

            # 2c. Learn standard Narration Pattern
            narration = data.get("narration") or data.get("memo") or ""
            if vendor_name and narration:
                await KnowledgeBase.store_knowledge_item(
                    category="narration_patterns",
                    key=vendor_name.strip().lower(),
                    company_id=company_id,
                    value=narration,
                    confidence=0.90,
                    meta={"last_source_id": source_id}
                )

            # Step 3: Trigger background task to generate embeddings of text content (if provided)
            text_content = data.get("raw_text") or data.get("ocr_text") or narration
            if text_content:
                await BackgroundLearningJobs.queue_learning_task(
                    task_type="generate_embedding",
                    company_id=company_id,
                    payload={
                        "target_id": source_id,
                        "target_type": "document_text",
                        "text": text_content
                    }
                )

            logger.info(f"LearningEngine successfully updated knowledge layers for event: {source_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to process learning for event {source_id}: {e}", exc_info=True)
            # Never raise exception so it does not interrupt accounting processing
            return False
