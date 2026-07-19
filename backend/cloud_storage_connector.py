import logging
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("connector_base")

class FutureConnectorBase:
    def __init__(self, service_name: str):
        self.service_name = service_name

    async def log_integration_call(self, company_id: str, action: str, status: str, payload: Optional[Dict[str, Any]] = None, response: Optional[Dict[str, Any]] = None) -> str:
        """Centralized logging for external integrations audit trail."""
        now = datetime.now(timezone.utc).isoformat()
        log_id = str(uuid.uuid4())
        
        doc = {
            "id": log_id,
            "company_id": company_id,
            "service_name": self.service_name,
            "action": action,
            "status": status,
            "payload_preview": str(payload)[:200] if payload else "",
            "response_preview": str(response)[:200] if response else "",
            "created_at": now
        }
        await db.integration_logs.insert_one(doc)
        return log_id

    async def execute_with_retry(self, callback: Any, max_retries: int = 3, delay_seconds: float = 1.0, *args, **kwargs) -> Any:
        """Executes a connection task with exponential backoff retry."""
        attempt = 0
        while attempt < max_retries:
            try:
                return await callback(*args, **kwargs)
            except Exception as e:
                attempt += 1
                logger.warning(f"Connector {self.service_name} failed attempt {attempt}/{max_retries}: {e}")
                if attempt >= max_retries:
                    raise e
                await asyncio.sleep(delay_seconds * (2 ** attempt))
