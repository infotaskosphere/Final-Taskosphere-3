import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

logger = logging.getLogger("action_engine")

class ActionEngine:
    @staticmethod
    async def confirm_and_execute_action(user_id: str, company_id: str, action_type: str, details: Dict[str, Any]) -> Dict[str, Any]:
        """Saves and executes database modifications confirmed via copilot."""
        now = datetime.now(timezone.utc).isoformat()
        action_id = str(uuid.uuid4())
        
        # Log the action record
        action_doc = {
            "id": action_id,
            "user_id": user_id,
            "company_id": company_id,
            "action_type": action_type, # post_journal, approve_invoice, correct_ledger
            "details": details,
            "status": "EXECUTED",
            "executed_at": now
        }
        await db.copilot_actions.insert_one(action_doc)
        
        # Apply actual modification using existing DB collections
        if action_type == "post_journal":
            # Seed entry to journal
            await db.journals.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "created_by": user_id,
                "amount": details.get("amount", 0.0),
                "narrative": details.get("narrative", "Auto-posted via Taskosphere AI Copilot"),
                "status": "POSTED",
                "created_at": now
            })
        elif action_type == "approve_invoice":
            doc_id = details.get("document_id")
            if doc_id:
                await db.ai_document_memory.update_one(
                    {"document_id": doc_id},
                    {"$set": {"decision": "APPROVED", "updated_at": now}}
                )
                
        logger.info(f"Copilot Action {action_id} of type '{action_type}' successfully executed.")
        return {"status": "SUCCESS", "action_id": action_id, "action_type": action_type}
