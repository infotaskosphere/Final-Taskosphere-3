"""
Bank Storage Layer (Phase 8)
Manages persistent storage for all bank intelligence collections in MongoDB.
Features query optimization, asynchronous CRUD operations, and fallback safety.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import uuid

from backend.dependencies import db

logger = logging.getLogger("bank_storage")

class BankStorage:
    @staticmethod
    async def ensure_indexes():
        """
        Creates necessary indexes for bank intelligence collections to ensure high performance
        on enterprise volume datasets.
        """
        try:
            # We assume a real Motor client. If using a mock, these are safe no-ops.
            if hasattr(db.bank_transaction_history, "create_index"):
                # Composite index for querying transactions by bank account & date
                await db.bank_transaction_history.create_index([("bank_account_id", 1), ("date", -1)])
                # Index on transaction hash for deduplication
                await db.bank_transaction_history.create_index("transaction_hash", unique=True)
                # Index for status querying
                await db.bank_transaction_history.create_index("status")

            if hasattr(db.bank_reconciliation, "create_index"):
                # Index for tracking matches by bank transaction and ledger transaction
                await db.bank_reconciliation.create_index("bank_transaction_id")
                await db.bank_reconciliation.create_index("accounting_transaction_id")
                await db.bank_reconciliation.create_index("status")

            if hasattr(db.bank_rules, "create_index"):
                # Index on active rules sorted by priority
                await db.bank_rules.create_index([("is_active", 1), ("priority", -1)])

            if hasattr(db.bank_reconciliation_audit, "create_index"):
                await db.bank_reconciliation_audit.create_index("bank_transaction_id")
                await db.bank_reconciliation_audit.create_index("reconciliation_id")

            if hasattr(db.bank_learning, "create_index"):
                await db.bank_learning.create_index([("narration_pattern", 1), ("confidence", -1)])

            logger.info("Successfully ensured all indexes for Bank Intelligence collections.")
        except Exception as e:
            logger.warning(f"Could not create database indexes: {e}. Proceeding with standard execution.")

    # ────────────────────────────────────────────────────────
    # TRANSACTION HISTORY CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def save_bank_transactions(transactions: List[Dict[str, Any]]) -> List[str]:
        """
        Bulk inserts or updates bank transactions. Avoids duplicates using hash matching.
        """
        inserted_ids = []
        for txn in transactions:
            if "id" not in txn:
                txn["id"] = str(uuid.uuid4())
            if "created_at" not in txn:
                txn["created_at"] = datetime.now(timezone.utc).isoformat()
            if "status" not in txn:
                txn["status"] = "unreconciled"  # unreconciled, reconciled, flag, partial

            # Basic deduplication using narration + date + amount hash if transaction_hash isn't set
            if "transaction_hash" not in txn:
                import hashlib
                raw_str = f"{txn.get('bank_account_id')}_{txn.get('date')}_{txn.get('narration')}_{txn.get('amount')}_{txn.get('type')}"
                txn["transaction_hash"] = hashlib.sha256(raw_str.encode('utf-8')).hexdigest()

            try:
                # Upsert transaction based on unique hash to prevent duplicate parsing
                existing = await db.bank_transaction_history.find_one({"transaction_hash": txn["transaction_hash"]})
                if existing:
                    # Update fields that may have changed or been enriched
                    update_data = {k: v for k, v in txn.items() if k not in ["_id", "id", "created_at"]}
                    await db.bank_transaction_history.update_one(
                        {"transaction_hash": txn["transaction_hash"]},
                        {"$set": update_data}
                    )
                    inserted_ids.append(existing["id"])
                else:
                    await db.bank_transaction_history.insert_one(txn)
                    inserted_ids.append(txn["id"])
            except Exception as e:
                logger.error(f"Error storing bank transaction {txn.get('id')}: {e}")
                # Fallback to simple insert if index constraint fails
                try:
                    await db.bank_transaction_history.insert_one(txn)
                    inserted_ids.append(txn["id"])
                except Exception:
                    pass
        return inserted_ids

    @staticmethod
    async def get_bank_transactions(
        bank_account_id: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Retrieves filtered bank transactions. Optimised with pagination and sorting.
        """
        query: Dict[str, Any] = {}
        if bank_account_id:
            query["bank_account_id"] = bank_account_id
        if status:
            query["status"] = status
        
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        if date_query:
            query["date"] = date_query

        cursor = db.bank_transaction_history.find(query).sort("date", -1).skip(offset).limit(limit)
        txns = []
        async for doc in cursor:
            doc.pop("_id", None)
            txns.append(doc)
        return txns

    @staticmethod
    async def update_bank_transaction_status(transaction_id: str, status: str, reconciliation_id: Optional[str] = None) -> bool:
        """
        Updates a transaction's reconciliation status.
        """
        update_doc: Dict[str, Any] = {"status": status}
        if reconciliation_id:
            update_doc["reconciliation_id"] = reconciliation_id
        
        result = await db.bank_transaction_history.update_one(
            {"id": transaction_id},
            {"$set": update_doc}
        )
        return result.modified_count > 0

    # ────────────────────────────────────────────────────────
    # BANK RECONCILIATION CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def create_reconciliation(recon_record: Dict[str, Any]) -> str:
        """
        Saves a bank reconciliation record.
        """
        if "id" not in recon_record:
            recon_record["id"] = str(uuid.uuid4())
        recon_record["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.bank_reconciliation.insert_one(recon_record)
        return recon_record["id"]

    @staticmethod
    async def get_reconciliations(bank_account_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        query = {}
        if bank_account_id:
            query["bank_account_id"] = bank_account_id
        
        cursor = db.bank_reconciliation.find(query).sort("created_at", -1).limit(limit)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    # ────────────────────────────────────────────────────────
    # RECONCILIATION AUDIT CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def log_audit_trail(audit_record: Dict[str, Any]) -> str:
        """
        Stores explainability and decision confidence factors for compliance and auditable ERP rules.
        """
        if "id" not in audit_record:
            audit_record["id"] = str(uuid.uuid4())
        audit_record["timestamp"] = datetime.now(timezone.utc).isoformat()
        
        await db.bank_reconciliation_audit.insert_one(audit_record)
        return audit_record["id"]

    @staticmethod
    async def get_audit_trail_for_transaction(transaction_id: str) -> List[Dict[str, Any]]:
        cursor = db.bank_reconciliation_audit.find({"bank_transaction_id": transaction_id}).sort("timestamp", -1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    # ────────────────────────────────────────────────────────
    # BANK RULES CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def save_bank_rule(rule: Dict[str, Any]) -> str:
        """
        Upserts auto-reconciliation rules configured by users.
        """
        if "id" not in rule:
            rule["id"] = str(uuid.uuid4())
            rule["created_at"] = datetime.now(timezone.utc).isoformat()
        rule["updated_at"] = datetime.now(timezone.utc).isoformat()
        if "is_active" not in rule:
            rule["is_active"] = True

        await db.bank_rules.update_one(
            {"id": rule["id"]},
            {"$set": rule},
            upsert=True
        )
        return rule["id"]

    @staticmethod
    async def get_active_rules() -> List[Dict[str, Any]]:
        cursor = db.bank_rules.find({"is_active": True}).sort("priority", -1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    # ────────────────────────────────────────────────────────
    # REINFORCEMENT LEARNING CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def update_reinforcement_feedback(pattern: str, chosen_category: str, feedback: int) -> None:
        """
        Increment or decrement neural feedback mappings for categorization patterns.
        feedback: +1 for correct validation, -1 for user manual correction override.
        """
        increment = 1 if feedback > 0 else -1
        await db.bank_learning.update_one(
            {"narration_pattern": pattern, "category": chosen_category},
            {
                "$inc": {"score": increment},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            },
            upsert=True
        )

    @staticmethod
    async def get_learning_patterns() -> List[Dict[str, Any]]:
        cursor = db.bank_learning.find({"score": {"$gt": 0}}).sort("score", -1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    # ────────────────────────────────────────────────────────
    # STATEMENT TEMPLATES CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def save_template(template: Dict[str, Any]) -> str:
        if "id" not in template:
            template["id"] = str(uuid.uuid4())
        template["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bank_statement_templates.update_one(
            {"id": template["id"]},
            {"$set": template},
            upsert=True
        )
        return template["id"]

    @staticmethod
    async def get_template(template_id: str) -> Optional[Dict[str, Any]]:
        res = await db.bank_statement_templates.find_one({"id": template_id})
        if res:
            res.pop("_id", None)
        return res

    @staticmethod
    async def list_templates() -> List[Dict[str, Any]]:
        cursor = db.bank_statement_templates.find({})
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    # ────────────────────────────────────────────────────────
    # CASH FLOW HISTORY & STATISTICS CRUD
    # ────────────────────────────────────────────────────────

    @staticmethod
    async def save_cashflow_projection(projection: Dict[str, Any]) -> None:
        projection["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.cashflow_history.insert_one(projection)

    @staticmethod
    async def get_latest_cashflow_projections(limit: int = 30) -> List[Dict[str, Any]]:
        cursor = db.cashflow_history.find({}).sort("created_at", -1).limit(limit)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results

    @staticmethod
    async def save_bank_statistics(stats: Dict[str, Any]) -> None:
        stats["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bank_statistics.update_one(
            {"bank_account_id": stats.get("bank_account_id")},
            {"$set": stats},
            upsert=True
        )

    @staticmethod
    async def get_bank_statistics(bank_account_id: str) -> Optional[Dict[str, Any]]:
        res = await db.bank_statistics.find_one({"bank_account_id": bank_account_id})
        if res:
            res.pop("_id", None)
        return res
