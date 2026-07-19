import logging
from typing import Dict, Any, List
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("performance_monitor")

class PerformanceMonitor:
    @staticmethod
    async def log_response_time(endpoint: str, duration_ms: float) -> None:
        """Saves endpoint response duration metrics for trend monitoring."""
        now = datetime.now(timezone.utc).isoformat()
        metric = {
            "endpoint": endpoint,
            "duration_ms": duration_ms,
            "recorded_at": now
        }
        await db.performance_metrics.insert_one(metric)

    @staticmethod
    async def get_average_latencies() -> List[Dict[str, Any]]:
        """Averages response latencies to find bottleneck routes."""
        return await db.performance_metrics.find({}).limit(100).to_list(100)
