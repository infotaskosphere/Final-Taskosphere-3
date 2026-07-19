import logging
from typing import Dict, Any, List
from backend.dependencies import db

logger = logging.getLogger("logging_dashboard")

class LoggingDashboard:
    @staticmethod
    async def fetch_aggregated_logs(limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieves system warning and error logs dynamically."""
        return await db.system_logs.find({}).sort("logged_at", -1).limit(limit).to_list(limit)
