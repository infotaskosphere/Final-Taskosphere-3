import logging
import asyncio
from typing import Dict, Any, Optional
from backend.learning.learning_storage import LearningStorage
from backend.learning.embedding_engine import EmbeddingEngine
from backend.learning.knowledge_base import KnowledgeBase
from backend.learning.audit_engine import LearningAuditEngine

logger = logging.getLogger("learning_background_jobs")

class BackgroundLearningJobs:
    _lock = asyncio.Lock()

    @classmethod
    async def queue_learning_task(cls, task_type: str, company_id: str, payload: Dict[str, Any]) -> str:
        """
        Enqueues a task for background processing.
        """
        task_data = {
            "task_type": task_type,
            "company_id": company_id,
            "payload": payload,
            "retries": 0,
            "max_retries": 3
        }
        task_id = await LearningStorage.push_to_learning_queue(task_data)
        logger.info(f"Queued background learning task: {task_type} (Task ID: {task_id})")
        return task_id

    @classmethod
    async def process_queue_once(cls) -> bool:
        """
        Pulls a single pending item from the queue and processes it with full error safety.
        """
        async with cls._lock:
            item = await LearningStorage.get_next_queue_item()
            if not item:
                return False

            item_id = item["id"]
            task_type = item["task_type"]
            company_id = item["company_id"]
            payload = item["payload"]
            retries = item.get("retries", 0)
            max_retries = item.get("max_retries", 3)

            logger.info(f"Processing background learning task: {task_type} (ID: {item_id})")
            try:
                # Dispatch tasks based on task_type
                if task_type == "generate_embedding":
                    target_id = payload["target_id"]
                    target_type = payload["target_type"]
                    text = payload["text"]
                    await EmbeddingEngine.get_or_create_embedding(target_id, target_type, text)

                elif task_type == "consolidate_knowledge":
                    category = payload["category"]
                    key = payload["key"]
                    value = payload["value"]
                    confidence = payload.get("confidence", 1.0)
                    meta = payload.get("meta")
                    await KnowledgeBase.store_knowledge_item(category, key, company_id, value, confidence, meta)

                else:
                    logger.warning(f"Unknown background learning task type: {task_type}")

                await LearningStorage.update_queue_status(item_id, "completed")
                logger.info(f"Successfully processed learning task {item_id}")
                return True

            except Exception as e:
                logger.error(f"Failed processing learning task {item_id}: {e}", exc_info=True)
                if retries < max_retries:
                    # Increment retry counter and put back in queue
                    await LearningStorage.update_queue_status(item_id, "pending", error=str(e))
                    await LearningStorage.push_to_learning_queue({
                        "id": item_id,
                        "task_type": task_type,
                        "company_id": company_id,
                        "payload": payload,
                        "retries": retries + 1,
                        "max_retries": max_retries,
                        "error_log": f"Attempt {retries + 1} failed: {e}"
                    })
                else:
                    await LearningStorage.update_queue_status(item_id, "failed", error=str(e))
                    await LearningAuditEngine.log_learning_event(
                        event_type="learning_task_exhausted",
                        source_id=item_id,
                        company_id=company_id,
                        user_id="system",
                        description=f"Task {task_type} permanently failed after {max_retries} retries.",
                        before_state=None,
                        after_state=None,
                        meta_data={"error": str(e)}
                    )
                return False
