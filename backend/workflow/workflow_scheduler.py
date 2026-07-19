import asyncio
import logging
from typing import Set
from backend.workflow.approval_engine import ApprovalEngine
from backend.workflow.automation_engine import AutomationEngine

logger = logging.getLogger("workflow_scheduler")

class WorkflowScheduler:
    _task: asyncio.Task = None
    _active_companies: Set[str] = set()

    @classmethod
    def start(cls):
        """Starts the asynchronous background loop for escalations and automation tasks."""
        if cls._task is not None and not cls._task.done():
            logger.info("Workflow background scheduler is already running.")
            return

        cls._task = asyncio.create_task(cls._loop())
        logger.info("Workflow background scheduler loop initiated.")

    @classmethod
    def stop(cls):
        if cls._task:
            cls._task.cancel()
            cls._task = None
            logger.info("Workflow background scheduler loop stopped.")

    @classmethod
    def register_company(cls, company_id: str):
        cls._active_companies.add(company_id)

    @classmethod
    async def _loop(cls):
        while True:
            try:
                # Runs every 60 seconds (or 10 seconds for real-time responsiveness)
                await asyncio.sleep(15)
                
                # Default safety fallback company ID
                companies = list(cls._active_companies) or ["default_comp"]
                
                for company_id in companies:
                    # 1. Escalate and notify expired approvals
                    await ApprovalEngine.escalate_and_notify_expiry(company_id)
                    
                    # 2. Trigger periodic automation checks
                    await AutomationEngine.run_scheduled_automations(company_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in workflow scheduler execution step: {e}", exc_info=True)
