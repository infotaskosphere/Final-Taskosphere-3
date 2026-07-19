import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.dependencies import db

class GSTStorage:
    @staticmethod
    def _generate_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # --- GST Processing History ---
    @classmethod
    async def save_processing_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_processing_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_processing_history(cls, doc_id: str) -> Optional[Dict[str, Any]]:
        return await db.gst_processing_history.find_one({"id": doc_id}, {"_id": 0})

    @classmethod
    async def list_processing_history(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.gst_processing_history.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- GST Reconciliation History ---
    @classmethod
    async def save_reconciliation_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_reconciliation_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_reconciliation_history(cls, rec_id: str) -> Optional[Dict[str, Any]]:
        return await db.gst_reconciliation_history.find_one({"id": rec_id}, {"_id": 0})

    @classmethod
    async def list_reconciliation_history(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.gst_reconciliation_history.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- GST Rules ---
    @classmethod
    async def save_rule(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_rules.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_rule(cls, rule_id: str) -> Optional[Dict[str, Any]]:
        return await db.gst_rules.find_one({"id": rule_id}, {"_id": 0})

    @classmethod
    async def get_rules(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.gst_rules.find(query, {"_id": 0}).to_list(2000)

    @classmethod
    async def delete_rule(cls, rule_id: str) -> bool:
        res = await db.gst_rules.delete_one({"id": rule_id})
        return res.deleted_count > 0

    # --- GST Learning ---
    @classmethod
    async def save_learning(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_learning.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_learning(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.gst_learning.find(query, {"_id": 0}).to_list(2000)

    # --- GST Validation ---
    @classmethod
    async def save_validation(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_validation.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_validation(cls, val_id: str) -> Optional[Dict[str, Any]]:
        return await db.gst_validation.find_one({"id": val_id}, {"_id": 0})

    # --- GST Returns ---
    @classmethod
    async def save_return(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_returns.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_return(cls, ret_id: str) -> Optional[Dict[str, Any]]:
        return await db.gst_returns.find_one({"id": ret_id}, {"_id": 0})

    @classmethod
    async def list_returns(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.gst_returns.find(query, {"_id": 0}).to_list(1000)

    # --- GST Audit ---
    @classmethod
    async def save_audit(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.gst_audit.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_audit_trail(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.gst_audit.find(query, {"_id": 0}).sort("timestamp", -1).to_list(2000)

    # --- GST Compliance ---
    @classmethod
    async def save_compliance(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.gst_compliance.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_compliance(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.gst_compliance.find(query, {"_id": 0}).to_list(1000)

    # --- ITC Register ---
    @classmethod
    async def save_itc_record(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.itc_register.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def list_itc_register(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.itc_register.find(query, {"_id": 0}).to_list(2000)

    # --- E-way Bill History ---
    @classmethod
    async def save_ewaybill(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.ewaybill_history.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def list_ewaybill_history(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.ewaybill_history.find(query, {"_id": 0}).to_list(1000)

    # --- E-invoice History ---
    @classmethod
    async def save_einvoice(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.einvoice_history.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def list_einvoice_history(cls, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return await db.einvoice_history.find(query, {"_id": 0}).to_list(1000)
