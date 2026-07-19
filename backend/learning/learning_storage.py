import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.dependencies import db

class LearningStorage:
    @staticmethod
    def _generate_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # --- Knowledge Base ---
    @classmethod
    async def save_knowledge(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.knowledge_base.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_knowledge(cls, kb_id: str) -> Optional[Dict[str, Any]]:
        return await db.knowledge_base.find_one({"id": kb_id}, {"_id": 0})

    @classmethod
    async def list_knowledge(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.knowledge_base.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- Learning Events ---
    @classmethod
    async def save_learning_event(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.learning_events.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_learning_events(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.learning_events.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # --- Manual Corrections ---
    @classmethod
    async def save_manual_correction(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.manual_corrections.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_manual_corrections(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.manual_corrections.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # --- Recommendation History ---
    @classmethod
    async def save_recommendation_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.recommendation_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def update_recommendation_status(cls, rec_id: str, status: str, action_details: Optional[Dict[str, Any]] = None) -> bool:
        update_doc = {
            "status": status,
            "updated_at": cls._now_iso()
        }
        if action_details:
            update_doc["action_details"] = action_details
        res = await db.recommendation_history.update_one({"id": rec_id}, {"$set": update_doc})
        return res.modified_count > 0

    @classmethod
    async def list_recommendations(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.recommendation_history.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # --- Embeddings ---
    @classmethod
    async def save_embedding(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.embeddings.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_embedding(cls, target_id: str, target_type: str) -> Optional[Dict[str, Any]]:
        return await db.embeddings.find_one({"target_id": target_id, "target_type": target_type}, {"_id": 0})

    @classmethod
    async def list_embeddings(cls, query: Dict[str, Any], limit: int = 1000) -> List[Dict[str, Any]]:
        return await db.embeddings.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- Learning Versions ---
    @classmethod
    async def save_learning_version(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.learning_versions.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_learning_versions(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.learning_versions.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # --- Rule Improvements ---
    @classmethod
    async def save_rule_improvement(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.rule_improvements.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def list_rule_improvements(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.rule_improvements.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # --- Learning Queue ---
    @classmethod
    async def push_to_learning_queue(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["status"] = "pending"
        await db.learning_queue.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_next_queue_item(cls) -> Optional[Dict[str, Any]]:
        return await db.learning_queue.find_one_and_update(
            {"status": "pending"},
            {"$set": {"status": "processing", "started_at": cls._now_iso()}},
            sort=[("created_at", 1)],
            return_document=True
        )

    @classmethod
    async def update_queue_status(cls, item_id: str, status: str, error: Optional[str] = None) -> bool:
        update_doc = {
            "status": status,
            "updated_at": cls._now_iso()
        }
        if error:
            update_doc["error"] = error
        res = await db.learning_queue.update_one({"id": item_id}, {"$set": update_doc})
        return res.modified_count > 0

    # --- Learning Statistics ---
    @classmethod
    async def save_learning_statistics(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "updated_at" not in doc:
            doc["updated_at"] = cls._now_iso()
        await db.learning_statistics.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_learning_statistics(cls, stats_id: str) -> Optional[Dict[str, Any]]:
        return await db.learning_statistics.find_one({"id": stats_id}, {"_id": 0})

    # --- Learning Audit ---
    @classmethod
    async def save_learning_audit(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.learning_audit.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_audit_trail(cls, query: Dict[str, Any], limit: int = 2000) -> List[Dict[str, Any]]:
        return await db.learning_audit.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
