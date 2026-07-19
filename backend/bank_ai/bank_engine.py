"""
Bank Intelligence Engine (Phase 8)
Master orchestrator class that acts as the single unified orchestration API for the Bank Intelligence domain.
Provides static entry points for statement processing, classification, rules management, reconciliation, fraud auditing, and statistics.
"""

import logging
from typing import Dict, Any, List, Optional

from backend.bank_ai.bank_statement_parser import BankStatementParser
from backend.bank_ai.bank_classifier import BankClassifier
from backend.bank_ai.transaction_classifier import TransactionClassifier
from backend.bank_ai.payment_matcher import PaymentMatcher
from backend.bank_ai.narration_analyser import NarrationAnalyser
from backend.bank_ai.reconciliation_engine import ReconciliationEngine
from backend.bank_ai.reconciliation_audit import ReconciliationAudit
from backend.bank_ai.bank_rules import BankRulesManager
from backend.bank_ai.bank_learning import BankLearning
from backend.bank_ai.cashflow_engine import CashflowEngine
from backend.bank_ai.fraud_detector import FraudDetector
from backend.bank_ai.bank_statistics import BankStatistics
from backend.bank_ai.bank_storage import BankStorage

logger = logging.getLogger("bank_engine")

class BankIntelligenceEngine:
    @staticmethod
    async def process_bank_statement(
        file_bytes: bytes,
        filename: str,
        bank_account_id: str,
        company_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Coordinates full statement pipeline:
        1. Classifies bank brand & file structure format.
        2. Parses transactions using rule-based/AI fuzzy parser.
        3. Enriches narratives with analytical metadata (mode, ref_id).
        4. Bulk-saves structured transactions to history.
        5. Runs auto-reconciliation engine.
        6. Runs anomaly/fraud scanning.
        7. Recalculates cashflow and KPI statistics.
        """
        logger.info(f"Starting processing for statement file: {filename}")
        
        # 0. Initialise DB indexes (failsafe check)
        await BankStorage.ensure_indexes()

        # 1. Classify format and bank
        classification = BankClassifier.classify_bank("", filename)
        logger.info(f"Classified statement: Bank={classification['bank_name']}, Format={classification['format']}")

        # 2. Parse transactions based on file format extension
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        transactions = []
        if ext == "csv":
            transactions = BankStatementParser.parse_csv(file_bytes, bank_account_id)
        elif ext in ("xlsx", "xls"):
            transactions = BankStatementParser.parse_excel(file_bytes, bank_account_id)
        elif ext == "pdf":
            transactions = BankStatementParser.parse_pdf(file_bytes, bank_account_id)
        elif ext in ("png", "jpg", "jpeg"):
            transactions = BankStatementParser.parse_image(file_bytes, bank_account_id)
        else:
            # Fallback to general parsing
            transactions = BankStatementParser.parse_csv(file_bytes, bank_account_id)

        if not transactions:
            return {
                "status": "error",
                "message": f"Zero transactions parsed from bank statement {filename}. Ensure file layout is valid."
            }

        logger.info(f"Successfully parsed {len(transactions)} transactions.")

        # 3. Enrich narratives with metadata
        for txn in transactions:
            analysis = NarrationAnalyser.analyse(txn.get("narration", ""))
            txn["payment_mode"] = analysis["payment_mode"]
            txn["reference_id"] = analysis["reference_id"]
            txn["counterparty"] = analysis["counterparty"]

        # 4. Store parsed transactions (bulk upsert with deduplication)
        saved_ids = await BankStorage.save_bank_transactions(transactions)
        logger.info(f"Stored {len(saved_ids)} transactions in bank_transaction_history.")

        # 5. Run auto-reconciliation engine
        recon_run = await ReconciliationEngine.run_auto_reconciliation(
            bank_account_id=bank_account_id,
            company_id=company_id,
            user_id=user_id
        )

        # 6. Run fraud & anomalies detection
        anomalies = await FraudDetector.analyse_transactions(transactions)
        if anomalies:
            logger.warning(f"Fraud audit flagged {len(anomalies)} suspicious transactions in statement {filename}.")

        # 7. Refresh Cashflow analytics & KPI statistics
        cashflow = await CashflowEngine.analyse_and_project(bank_account_id, company_id)
        statistics = await BankStatistics.compute_and_save(bank_account_id)

        return {
            "status": "success",
            "filename": filename,
            "bank_name": classification["bank_name"],
            "format": classification["format"],
            "parsed_count": len(transactions),
            "saved_count": len(saved_ids),
            "reconciliation_summary": recon_run,
            "anomalies_detected": len(anomalies),
            "latest_statistics": statistics
        }
