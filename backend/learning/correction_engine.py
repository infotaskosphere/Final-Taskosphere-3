import logging
from typing import Dict, Any, List, Optional
from backend.learning.learning_storage import LearningStorage
from backend.learning.feedback_engine import FeedbackEngine

logger = logging.getLogger("correction_engine")

class CorrectionEngine:
    @classmethod
    async def record_correction(
        cls,
        correction_type: str,
        source_id: str,
        company_id: str,
        user_id: str,
        field_name: str,
        original_value: Any,
        corrected_value: Any,
        meta: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Public API to track a specific manual override.
        Saves details and triggers audit logs.
        """
        try:
            # Delegate to feedback engine for underlying storage and logging
            correction_id = await FeedbackEngine.record_user_correction(
                correction_type=correction_type,
                source_id=source_id,
                company_id=company_id,
                user_id=user_id,
                original_value=original_value,
                corrected_value=corrected_value,
                field_name=field_name
            )
            
            # Additional classification or template updates if relevant
            if correction_type == "classification" and field_name == "document_type":
                await cls._update_classification_learning(company_id, source_id, corrected_value)
                
            logger.info(f"Correction logged successfully: {correction_type}.{field_name} (ID: {correction_id})")
            return correction_id
        except Exception as e:
            logger.error(f"Failed to record correction: {e}", exc_info=True)
            return None

    @classmethod
    async def get_correction_history(
        cls,
        company_id: str,
        correction_type: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Retrieves historical user corrections.
        """
        query = {"company_id": company_id}
        if correction_type:
            query["correction_type"] = correction_type
        return await LearningStorage.list_manual_corrections(query, limit)

    @classmethod
    async def _update_classification_learning(cls, company_id: str, document_id: str, corrected_type: str):
        # Store helper indicator in knowledge base
        from backend.learning.knowledge_base import KnowledgeBase
        await KnowledgeBase.store_knowledge_item(
            category="document_classification_override",
            key=document_id,
            company_id=company_id,
            value=corrected_type,
            confidence=1.0,
            meta={"note": "Manual document type classification update override"}
        )
