import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from backend.dependencies import db

logger = logging.getLogger("rate_limiter")

class RateLimiter:
    @staticmethod
    async def is_rate_limited(user_id: str, limit_per_minute: int = 120) -> bool:
        """Throttles incoming user requests to prevent DDoS or API exhaust."""
        now = datetime.now(timezone.utc)
        current_minute_key = f"{user_id}:{now.strftime('%Y%m%d%H%M')}"
        
        # Increment request count for this minute bucket
        doc = await db.rate_limits.find_one_and_update(
            {"key": current_minute_key},
            {"$inc": {"count": 1}, "$set": {"updated_at": now.isoformat()}},
            upsert=True,
            return_document=True
        )
        # Note: if mock or motor, return_document has count. Let's make it robust
        count = 1
        if doc:
            # Let's handle both Pydantic models, dicts, or custom DB wrappers
            count = doc.get("count", 1) if isinstance(doc, dict) else getattr(doc, "count", 1)
            
        if count > limit_per_minute:
            logger.warning(f"Rate limit exceeded for user {user_id}: {count}/{limit_per_minute}")
            return True
            
        return False
