import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("copilot_audit")

class CopilotAudit:
    @staticmethod
    async def log_copilot_interaction(
        user_id: str,
        company_id: str,
        session_id: str,
        query: str,
        response: str,
        matched_tools: Optional[list] = None,
        tokens_used: int = 0
    ) -> str:
        """Saves a permanent log of an AI interaction for platform security and metrics tracking."""
        now = datetime.now(timezone.utc).isoformat()
        audit_id = str(uuid.uuid4())
        
        interaction = {
            "id": audit_id,
            "user_id": user_id,
            "company_id": company_id,
            "session_id": session_id,
            "query": query,
            "response": response,
            "matched_tools": matched_tools or [],
            "tokens_used": tokens_used,
            "created_at": now
        }
        await db.copilot_actions.insert_one(interaction)
        
        # Log to platform global audit
        await db.audit_platform.insert_one({
            "id": str(uuid.uuid4()),
            "action": "copilot_query",
            "status": "SUCCESS",
            "details": f"User {user_id} executed copilot request in session {session_id}.",
            "created_at": now
        })
        
        # Track AI Usage Metric for Licensing
        await db.customer_usage.update_one(
            {"tenant_id": company_id, "metric": "copilot_tokens"},
            {"$inc": {"value": tokens_used or len(query + response) // 4}, "$set": {"updated_at": now}},
            upsert=True
        )
        return audit_id
