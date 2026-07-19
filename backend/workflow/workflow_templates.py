import logging
from typing import Dict, Any, List, Optional
from backend.workflow.workflow_storage import WorkflowStorage

logger = logging.getLogger("workflow_templates")

class WorkflowTemplates:
    DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
        {
            "id": "tpl_purchase_approval",
            "name": "Purchase Approval Workflow",
            "description": "Standard multi-level purchase approval based on expense threshold rules.",
            "category": "Accounting",
            "steps": [
                {"step_no": 1, "name": "Document Parsing", "action": "parse_ocr", "role": "SYSTEM"},
                {"step_no": 2, "name": "Policy Adherence Check", "action": "policy_check", "role": "SYSTEM"},
                {"step_no": 3, "name": "Rule-based Approval Routing", "action": "maker_checker", "role": "ROUTED"},
                {"step_no": 4, "name": "General Ledger Posting", "action": "post_ledger", "role": "SYSTEM"}
            ],
            "version": 1,
            "is_system": True
        },
        {
            "id": "tpl_vendor_onboarding",
            "name": "Vendor Onboarding Workflow",
            "description": "KYC check, bank verification and profile matching of new vendors.",
            "category": "Operations",
            "steps": [
                {"step_no": 1, "name": "GSTIN Validation", "action": "verify_gstin", "role": "SYSTEM"},
                {"step_no": 2, "name": "Bank Detail Validation", "action": "verify_bank", "role": "SYSTEM"},
                {"step_no": 3, "name": "Risk Audit Check", "action": "risk_audit", "role": "MANAGER"}
            ],
            "version": 1,
            "is_system": True
        },
        {
            "id": "tpl_gst_filing",
            "name": "GST Filing & Review Workflow",
            "description": "GST portal sync, reconciliation and automated return filing.",
            "category": "GST",
            "steps": [
                {"step_no": 1, "name": "Retrieve GST Returns", "action": "sync_portal", "role": "SYSTEM"},
                {"step_no": 2, "name": "Automated Reconciliation", "action": "reconcile", "role": "SYSTEM"},
                {"step_no": 3, "name": "Compliance Review", "action": "review_gst", "role": "ACCOUNTANT"},
                {"step_no": 4, "name": "Mark Filed on Portal", "action": "mark_filed", "role": "SYSTEM"}
            ],
            "version": 1,
            "is_system": True
        },
        {
            "id": "tpl_roc_filing",
            "name": "ROC Filing Workflow",
            "description": "Draft AOC-4 and MGT-7 forms compliance check for companies registration.",
            "category": "Compliance",
            "steps": [
                {"step_no": 1, "name": "Financial Data Validation", "action": "validate_data", "role": "SYSTEM"},
                {"step_no": 2, "name": "ROC Document Assembly", "action": "assemble_documents", "role": "SYSTEM"},
                {"step_no": 3, "name": "Professional Review", "action": "partner_sign_off", "role": "COMPANY_SECRETARY"}
            ],
            "version": 1,
            "is_system": True
        }
    ]

    @classmethod
    async def bootstrap_templates(cls):
        """Bootstraps default workflow templates into database."""
        for tpl in cls.DEFAULT_TEMPLATES:
            try:
                await WorkflowStorage.save_workflow_template(tpl)
            except Exception as e:
                logger.warning(f"Failed to bootstrap workflow template {tpl['id']}: {e}")

    @classmethod
    async def get_template(cls, tpl_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves template by ID from db, falling back to static ones."""
        from backend.dependencies import db
        stored = await db.workflow_templates.find_one({"id": tpl_id}, {"_id": 0})
        if stored:
            return stored
        for tpl in cls.DEFAULT_TEMPLATES:
            if tpl["id"] == tpl_id:
                return tpl
        return None

    @classmethod
    async def list_templates(cls, category: Optional[str] = None) -> List[Dict[str, Any]]:
        query = {}
        if category:
            query["category"] = category
        stored_list = await WorkflowStorage.list_workflow_templates(query)
        if not stored_list:
            # Fallback/default bootstrap output
            if category:
                return [tpl for tpl in cls.DEFAULT_TEMPLATES if tpl["category"] == category]
            return cls.DEFAULT_TEMPLATES
        return stored_list
