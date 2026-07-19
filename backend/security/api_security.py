import logging
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("api_security")

class APISecurity:
    @staticmethod
    async def generate_api_key_for_client(client_id: str, company_id: str) -> str:
        """Generates a secure API key for third party developers."""
        raw_key = f"tko_live_{uuid.uuid4().hex}"
        hashed = hashlib.sha256(raw_key.encode()).hexdigest()
        
        now = datetime.now(timezone.utc).isoformat()
        key_doc = {
            "client_id": client_id,
            "company_id": company_id,
            "api_key_hash": hashed,
            "status": "active",
            "created_at": now
        }
        await db.api_usage.insert_one(key_doc)
        logger.info(f"Generated API key for developer client {client_id}.")
        return raw_key

    @staticmethod
    async def validate_api_key(api_key: str) -> Optional[Dict[str, Any]]:
        """Validates incoming API key signature."""
        hashed = hashlib.sha256(api_key.encode()).hexdigest()
        doc = await db.api_usage.find_one({"api_key_hash": hashed, "status": "active"})
        return doc
