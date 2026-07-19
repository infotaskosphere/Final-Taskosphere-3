import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
import uuid
from backend.dependencies import db

logger = logging.getLogger("session_manager")

class SessionManager:
    @staticmethod
    async def create_user_session(user_id: str, client_ip: str, user_agent: str) -> str:
        """Saves a user session record during successful authentication."""
        now = datetime.now(timezone.utc).isoformat()
        session_token = f"sess_{uuid.uuid4().hex}"
        
        session_doc = {
            "session_token": session_token,
            "user_id": user_id,
            "client_ip": client_ip,
            "user_agent": user_agent,
            "status": "active",
            "login_at": now,
            "last_activity_at": now
        }
        await db.session_manager.update_one({"session_token": session_token}, {"$set": session_doc}, upsert=True)
        return session_token

    @staticmethod
    async def revoke_session(session_token: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        result = await db.session_manager.update_one(
            {"session_token": session_token},
            {"$set": {"status": "revoked", "logout_at": now}}
        )
        return result.modified_count > 0

    @staticmethod
    async def is_session_active(session_token: str) -> bool:
        sess = await db.session_manager.find_one({"session_token": session_token})
        if not sess:
            return False
        return sess.get("status") == "active"
