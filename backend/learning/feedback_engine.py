import logging
from typing import Dict, Any, Optional
from backend.learning.learning_storage import LearningStorage
from backend.learning.audit_engine import LearningAuditEngine

logger = logging.getLogger("feedback_engine")

class FeedbackEngine:
    @classmethod
    async def capture_positive_feedback(
        cls,
        event_type: str,
        source_id: str,
        company_id: str,
        user_id: str,
        data: Dict[str, Any],
        description: str = ""
    ) -> Optional[str]:
        """
        Processes approved/validated accounting, bank, or document transactions.
        Only validated events feed into our model.
        """
        try:
            logger.info(f"FeedbackEngine capturing positive reinforcement event: {event_type} (source: {source_id})")
            
            # Save to learning_events
            event_id = await LearningStorage.save_learning_event({
                "event_type": event_type,
                "source_id": source_id,
                "company_id": company_id,
                "user_id": user_id,
                "data": data,
                "outcome": "APPROVED"
            })
            
            # Log to immutable audit
            await LearningAuditEngine.log_learning_event(
                event_type=f"positive_feedback_{event_type}",
                source_id=source_id,
                company_id=company_id,
                user_id=user_id,
                description=description or f"Captured verified event approval for {event_type}",
                before_state=None,
                after_state=data,
                meta_data={"event_id": event_id}
            )
            return event_id
        except Exception as e:
            logger.error(f"Failed to record positive feedback event: {e}", exc_info=True)
            return None

    @classmethod
    async def record_user_correction(
        cls,
        correction_type: str,
        source_id: str,
        company_id: str,
        user_id: str,
        original_value: Any,
        corrected_value: Any,
        field_name: str
    ) -> Optional[str]:
        """
        Explicitly tracks and isolates user-corrected values so that the similarity engine
        can learn from manual deviations or changes to past suggestions.
        """
        try:
            logger.info(f"FeedbackEngine capturing correction: {correction_type}.{field_name} (source: {source_id})")
            
            # Save correction event
            correction_id = await LearningStorage.save_manual_correction({
                "correction_type": correction_type,
                "source_id": source_id,
                "company_id": company_id,
                "user_id": user_id,
                "field_name": field_name,
                "original_value": original_value,
                "corrected_value": corrected_value
            })
            
            # Record audit trace
            await LearningAuditEngine.log_learning_event(
                event_type=f"user_correction_{correction_type}",
                source_id=source_id,
                company_id=company_id,
                user_id=user_id,
                description=f"User corrected {field_name} from '{original_value}' to '{corrected_value}'",
                before_state=original_value,
                after_state=corrected_value,
                meta_data={"correction_id": correction_id, "field_name": field_name}
            )
            return correction_id
        except Exception as e:
            logger.error(f"Failed to save manual user correction: {e}", exc_info=True)
            return None
