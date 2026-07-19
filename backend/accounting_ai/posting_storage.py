"""
Posting Storage — Database persistence layer for the Autonomous Accounting Intelligence Engine.
Handles raw storage/retrieval for posting instructions, journals, vouchers, validation results, and audits.
Strictly decoupled from accounting business logic.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
from backend.dependencies import db

class PostingStorage:
    @staticmethod
    async def save_ledger_learning(vendor_name: str, gstin: str, company_id: str, data: Dict[str, Any]) -> str:
        """Stores or updates vendor learning patterns."""
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "vendor_name": vendor_name,
            "gstin": gstin,
            "company_id": company_id,
            "preferred_ledger": data.get("preferred_ledger"),
            "frequency": data.get("frequency", 1),
            "corrections_count": data.get("corrections_count", 0),
            "department": data.get("department"),
            "cost_center": data.get("cost_center"),
            "project": data.get("project"),
            "narration_template": data.get("narration_template"),
            "updated_at": now
        }
        await db.ledger_learning.update_one(
            {"vendor_name": vendor_name, "gstin": gstin, "company_id": company_id},
            {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True
        )
        return gstin or vendor_name

    @staticmethod
    async def get_ledger_learning(vendor_name: str, gstin: str, company_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves learned ledger patterns for a vendor."""
        q = {"company_id": company_id}
        if gstin:
            q["gstin"] = gstin
        elif vendor_name:
            q["vendor_name"] = vendor_name
        else:
            return None
        return await db.ledger_learning.find_one(q, {"_id": 0})

    @staticmethod
    async def save_posting_history(document_id: str, company_id: str, payload: Dict[str, Any]) -> str:
        """Saves final posting details to posting_history."""
        now = datetime.now(timezone.utc).isoformat()
        doc_id = payload.get("id") or str(uuid.uuid4())
        doc = {
            "id": doc_id,
            "document_id": document_id,
            "company_id": company_id,
            "accounting_event": payload.get("accounting_event", "PURCHASE"),
            "posting_instructions": payload.get("posting_instructions", {}),
            "journal_entry_id": payload.get("journal_entry_id"),
            "voucher_id": payload.get("voucher_id"),
            "status": payload.get("status", "pending"),
            "created_at": now,
            "updated_at": now
        }
        await db.posting_history.insert_one(doc)
        return doc_id

    @staticmethod
    async def get_posting_history_by_doc(document_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves posting history for a document."""
        return await db.posting_history.find_one({"document_id": document_id}, {"_id": 0})

    @staticmethod
    async def save_journal_template(company_id: str, name: str, lines: List[Dict[str, Any]]) -> str:
        """Stores a reusable journal template for automation."""
        now = datetime.now(timezone.utc).isoformat()
        template_id = str(uuid.uuid4())
        doc = {
            "id": template_id,
            "company_id": company_id,
            "name": name,
            "lines": lines,
            "created_at": now,
            "updated_at": now
        }
        await db.journal_templates.insert_one(doc)
        return template_id

    @staticmethod
    async def get_journal_template(company_id: str, name: str) -> Optional[Dict[str, Any]]:
        """Retrieves a specific journal template."""
        return await db.journal_templates.find_one({"company_id": company_id, "name": name}, {"_id": 0})

    @staticmethod
    async def save_accounting_rules(company_id: str, event_type: str, rules: Dict[str, Any]) -> str:
        """Stores or updates general posting and taxation rules."""
        now = datetime.now(timezone.utc).isoformat()
        await db.accounting_rules.update_one(
            {"company_id": company_id, "event_type": event_type},
            {"$set": {"rules": rules, "updated_at": now}, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True
        )
        return event_type

    @staticmethod
    async def get_accounting_rules(company_id: str, event_type: str) -> Optional[Dict[str, Any]]:
        """Retrieves rules for a specific accounting event."""
        return await db.accounting_rules.find_one({"company_id": company_id, "event_type": event_type}, {"_id": 0})

    @staticmethod
    async def save_financial_validation(document_id: str, report: Dict[str, Any]) -> str:
        """Saves verification reports for a document's posting."""
        now = datetime.now(timezone.utc).isoformat()
        validation_id = str(uuid.uuid4())
        doc = {
            "id": validation_id,
            "document_id": document_id,
            "report": report,
            "passed": report.get("passed", False),
            "errors": report.get("errors", []),
            "warnings": report.get("warnings", []),
            "created_at": now
        }
        await db.financial_validations.insert_one(doc)
        return validation_id

    @staticmethod
    async def save_voucher_history(voucher_id: str, company_id: str, data: Dict[str, Any]) -> str:
        """Stores the voucher details and its history."""
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": voucher_id,
            "company_id": company_id,
            "voucher_type": data.get("voucher_type"),
            "voucher_number": data.get("voucher_number"),
            "document_id": data.get("document_id"),
            "journal_entry_id": data.get("journal_entry_id"),
            "party_name": data.get("party_name"),
            "total_amount": data.get("total_amount", 0.0),
            "details": data.get("details", {}),
            "created_at": now,
            "updated_at": now
        }
        await db.voucher_history.update_one(
            {"id": voucher_id},
            {"$set": doc},
            upsert=True
        )
        return voucher_id

    @staticmethod
    async def save_posting_audit(audit_data: Dict[str, Any]) -> str:
        """Appends immutable audit logs for postings."""
        now = datetime.now(timezone.utc).isoformat()
        audit_id = str(uuid.uuid4())
        doc = {
            "id": audit_id,
            "posting_time": now,
            "posting_user": audit_data.get("user_id"),
            "document_id": audit_data.get("document_id"),
            "company_id": audit_data.get("company_id"),
            "ai_recommendation": audit_data.get("ai_recommendation"),
            "final_decision": audit_data.get("final_decision"),
            "corrections": audit_data.get("corrections", {}),
            "journal_version": audit_data.get("journal_version", 1),
            "voucher_version": audit_data.get("voucher_version", 1),
            "approval_history": audit_data.get("approval_history", []),
            "checksum": audit_data.get("checksum")
        }
        await db.posting_audit.insert_one(doc)
        return audit_id
