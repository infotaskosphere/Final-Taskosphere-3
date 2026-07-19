import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.dependencies import db

class WorkflowStorage:
    @staticmethod
    def _generate_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    # --- Workflow Definitions ---
    @classmethod
    async def save_workflow_definition(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.workflow_definitions.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_workflow_definition(cls, wf_id: str) -> Optional[Dict[str, Any]]:
        return await db.workflow_definitions.find_one({"id": wf_id}, {"_id": 0})

    @classmethod
    async def list_workflow_definitions(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.workflow_definitions.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- Workflow Instances ---
    @classmethod
    async def save_workflow_instance(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.workflow_instances.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_workflow_instance(cls, inst_id: str) -> Optional[Dict[str, Any]]:
        return await db.workflow_instances.find_one({"id": inst_id}, {"_id": 0})

    @classmethod
    async def list_workflow_instances(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.workflow_instances.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # --- Workflow History ---
    @classmethod
    async def save_workflow_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.workflow_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_workflow_history(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.workflow_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    # --- Workflow Templates ---
    @classmethod
    async def save_workflow_template(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        await db.workflow_templates.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def list_workflow_templates(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.workflow_templates.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- Approval Requests & History ---
    @classmethod
    async def save_approval_request(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.approval_requests.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def get_approval_request(cls, app_id: str) -> Optional[Dict[str, Any]]:
        return await db.approval_requests.find_one({"id": app_id}, {"_id": 0})

    @classmethod
    async def list_approval_requests(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.approval_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    @classmethod
    async def save_approval_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.approval_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_approval_history(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.approval_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    # --- Automation Rules ---
    @classmethod
    async def save_automation_rule(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "created_at" not in doc:
            doc["created_at"] = cls._now_iso()
        doc["updated_at"] = cls._now_iso()
        await db.automation_rules.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        return doc["id"]

    @classmethod
    async def list_automation_rules(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.automation_rules.find(query, {"_id": 0}).limit(limit).to_list(limit)

    # --- Business Events ---
    @classmethod
    async def save_business_event(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.business_events.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_business_events(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.business_events.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    # --- Notification History ---
    @classmethod
    async def save_notification_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.notification_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_notification_history(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.notification_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    # --- Dashboard Cache ---
    @classmethod
    async def save_dashboard_cache(cls, key: str, data: Dict[str, Any]) -> str:
        doc = {
            "key": key,
            "data": data,
            "updated_at": cls._now_iso()
        }
        await db.dashboard_cache.update_one({"key": key}, {"$set": doc}, upsert=True)
        return key

    @classmethod
    async def get_dashboard_cache(cls, key: str) -> Optional[Dict[str, Any]]:
        return await db.dashboard_cache.find_one({"key": key}, {"_id": 0})

    # --- Analytics & KPI Data ---
    @classmethod
    async def save_analytics_data(cls, company_id: str, metric_type: str, data: Dict[str, Any]) -> str:
        doc = {
            "company_id": company_id,
            "metric_type": metric_type,
            "data": data,
            "updated_at": cls._now_iso()
        }
        await db.analytics_data.update_one({"company_id": company_id, "metric_type": metric_type}, {"$set": doc}, upsert=True)
        return f"{company_id}_{metric_type}"

    @classmethod
    async def get_analytics_data(cls, company_id: str, metric_type: str) -> Optional[Dict[str, Any]]:
        return await db.analytics_data.find_one({"company_id": company_id, "metric_type": metric_type}, {"_id": 0})

    @classmethod
    async def save_kpi_history(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.kpi_history.insert_one(doc)
        return doc["id"]

    @classmethod
    async def list_kpi_history(cls, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        return await db.kpi_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

    # --- Workflow Audit ---
    @classmethod
    async def save_workflow_audit(cls, doc: Dict[str, Any]) -> str:
        if "id" not in doc:
            doc["id"] = cls._generate_id()
        if "timestamp" not in doc:
            doc["timestamp"] = cls._now_iso()
        await db.workflow_audit.insert_one(doc)
        return doc["id"]

    @classmethod
    async def get_audit_trail(cls, query: Dict[str, Any], limit: int = 500) -> List[Dict[str, Any]]:
        return await db.workflow_audit.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
