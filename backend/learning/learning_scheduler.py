import asyncio
import logging
from typing import Dict, Any
from backend.learning.background_jobs import BackgroundLearningJobs
from backend.learning.learning_storage import LearningStorage

logger = logging.getLogger("learning_scheduler")

class LearningScheduler:
    _running = False
    _loop_task = None

    @classmethod
    def start(cls):
        """
        Starts the background processing loop if not already running.
        """
        if cls._running:
            return
        cls._running = True
        cls._loop_task = asyncio.create_task(cls._scheduler_loop())
        logger.info("Self-Learning AI Scheduler loop started.")

    @classmethod
    def stop(cls):
        cls._running = False
        if cls._loop_task:
            cls._loop_task.cancel()
        logger.info("Self-Learning AI Scheduler loop stopped.")

    @classmethod
    async def _scheduler_loop(cls):
        """
        Main scheduler loop that periodically processes the queue and compiles statistics.
        """
        iteration_count = 0
        while cls._running:
            try:
                # Process pending tasks
                processed_any = True
                while processed_any:
                    processed_any = await BackgroundLearningJobs.process_queue_once()
                    await asyncio.sleep(0.1)

                # Periodic operations: every 60 iterations (approx. 10 minutes)
                if iteration_count % 60 == 0:
                    await cls.refresh_learning_statistics()

                iteration_count += 1
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in LearningScheduler loop: {e}", exc_info=True)

            await asyncio.sleep(10)

    @classmethod
    async def refresh_learning_statistics(cls):
        """
        Gathers stats on user corrections, recommendations, and KB size.
        """
        try:
            logger.info("Compiling Self-Learning statistics and KPI indicators...")
            
            # Simple collection counts
            from backend.dependencies import db
            kb_count = await db.knowledge_base.count_documents({})
            events_count = await db.learning_events.count_documents({})
            corrections_count = await db.manual_corrections.count_documents({})
            
            recs_total = await db.recommendation_history.count_documents({})
            recs_accepted = await db.recommendation_history.count_documents({"status": "accepted"})
            
            acceptance_rate = 1.0
            if recs_total > 0:
                acceptance_rate = round(recs_accepted / recs_total, 4)

            stats_doc = {
                "id": "global_kpis",
                "knowledge_base_size": kb_count,
                "total_learning_events": events_count,
                "total_manual_corrections": corrections_count,
                "total_recommendations": recs_total,
                "recommendation_acceptance_rate": acceptance_rate,
                "updated_at": LearningStorage._now_iso()
            }
            await LearningStorage.save_learning_statistics(stats_doc)
            logger.info("Self-Learning statistics synchronized successfully.")
        except Exception as e:
            logger.error(f"Failed to refresh learning statistics: {e}", exc_info=True)
