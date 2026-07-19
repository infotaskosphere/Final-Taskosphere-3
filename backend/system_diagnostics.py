import logging
from typing import Dict, Any, List
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("error_monitor")

class ErrorMonitor:
    @staticmethod
    async def log_exception(error_msg: str, stack_trace: str, module: str) -> str:
        """Saves code failures with severity alerts for system engineers."""
        now = datetime.now(timezone.utc).isoformat()
        err_id = str(uuid.uuid4())
        
        doc = {
            "id": err_id,
            "module": module,
            "error_msg": error_msg,
            "stack_trace": stack_trace,
            "severity": "high",
            "logged_at": now
        }
        await db.system_logs.insert_one(doc)
        logger.error(f"Error captured in module '{module}': {error_msg}")
        return err_id
