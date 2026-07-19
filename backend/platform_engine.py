import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("api_gateway")

class APIGateway:
    @staticmethod
    async def log_api_call(tenant_id: str, endpoint: str, method: str, status_code: int, response_time_ms: float) -> str:
        """Logs and tracks billing/usage metrics for API integrations."""
        now = datetime.now(timezone.utc).isoformat()
        call_id = str(uuid.uuid4())
        
        api_log = {
            "id": call_id,
            "tenant_id": tenant_id,
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "response_time_ms": response_time_ms,
            "created_at": now
        }
        await db.api_usage.insert_one(api_log)
        
        # Increment developer portal metrics
        await db.customer_usage.update_one(
            {"tenant_id": tenant_id, "metric": "api_calls"},
            {"$inc": {"value": 1}, "$set": {"updated_at": now}},
            upsert=True
        )
        return call_id

    @staticmethod
    async def get_api_usage_metrics(tenant_id: str) -> Dict[str, Any]:
        """Calculates api usage metrics for subscription checks."""
        now = datetime.now(timezone.utc).isoformat()
        usage_doc = await db.customer_usage.find_one({"tenant_id": tenant_id, "metric": "api_calls"})
        total_calls = usage_doc.get("value", 0) if usage_doc else 0
        return {
            "tenant_id": tenant_id,
            "total_calls": total_calls,
            "billing_period_limit": 100000, # Max calls per month
            "remaining": max(0, 100000 - total_calls)
        }
