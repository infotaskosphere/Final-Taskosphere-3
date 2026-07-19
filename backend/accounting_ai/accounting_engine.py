"""
Accounting Engine — Central orchestration brain of the Autonomous Accounting Intelligence Engine.
Identifies accounting events, delegates to specialised calculation engines (GST, TDS, Cost Centers),
assembles balanced double-entry lines, and returns fully validated posting instructions.
No direct database writes are performed inside this file.
"""

from typing import Dict, Any, Optional
import logging
from backend.accounting_ai.ledger_mapper import LedgerMapper
from backend.accounting_ai.gst_engine import GSTEngine
from backend.accounting_ai.tds_engine import TDSEngine
from backend.accounting_ai.cost_center_engine import CostCenterEngine
from backend.accounting_ai.narration_generator import NarrationGenerator
from backend.accounting_ai.journal_builder import JournalBuilder
from backend.accounting_ai.financial_validator import FinancialValidator

logger = logging.getLogger("accounting_engine")

class AccountingEngine:
    @classmethod
    async def process_document(
        cls,
        company_id: str,
        extracted_data: Dict[str, Any],
        vendor_profile: Optional[Dict[str, Any]] = None,
        cumulative_vendor_annual_spend: float = 0.0
    ) -> Dict[str, Any]:
        """Orchestrates structured mapping, taxation (GST, TDS), cost centering, narration,
        journal building, and validation steps.
        
        Returns: {
            "success": bool,
            "accounting_event": str,
            "ledger_code": str,
            "ledger_name": str,
            "confidence": float,
            "gst_split": Dict[str, float],
            "tds_result": Dict[str, Any],
            "dimensions": Dict[str, str],
            "narration": str,
            "journal_lines": List[Dict[str, Any]],
            "validation_report": Dict[str, Any]
        }
        """
        logger.info("Autonomous accounting processing started...")

        # 1. Identify Accounting Event Type (e.g. PURCHASE, SALE, EXPENSE)
        doc_type = str(extracted_data.get("document_type") or "PURCHASE").upper().strip()
        if doc_type not in ("SALE", "PURCHASE"):
            doc_type = "PURCHASE"

        # 2. Identify Target Ledger Account
        ledger_code, ledger_name, mapper_confidence = await LedgerMapper.resolve_ledger(
            company_id=company_id,
            extracted_data=extracted_data,
            vendor_profile=vendor_profile
        )
        logger.info(f"Ledger Selected: {ledger_code} ({ledger_name}) with confidence {mapper_confidence}")

        # 3. Determine GST Splits and Treatment
        total_tax = float(extracted_data.get("total_tax") or 0.0)
        company_gst = str(extracted_data.get("billed_to_gstin") or "").strip()
        vendor_gst = str(extracted_data.get("tax_registration_number") or "").strip()
        
        # If company GST is missing, query the actual company profile
        if not company_gst and company_id:
            try:
                from backend.dependencies import db
                company_doc = await db.companies.find_one({"id": company_id}, {"_id": 0, "gstin": 1})
                if company_doc:
                    company_gst = str(company_doc.get("gstin") or "").strip()
            except Exception:
                pass

        gst_split = GSTEngine.determine_gst_split(
            company_gstin=company_gst,
            vendor_gstin=vendor_gst,
            total_tax_amount=total_tax
        )
        logger.info(f"GST Calculated: {gst_split}")

        # 4. Determine TDS Requirements
        taxable_val = float(extracted_data.get("taxable_value") or 0.0)
        tds_result = TDSEngine.evaluate_tds(
            account_code=ledger_code,
            taxable_value=taxable_val,
            cumulative_vendor_annual_spend=cumulative_vendor_annual_spend,
            vendor_profile=vendor_profile
        )
        if tds_result.get("applicable"):
            logger.info(f"TDS Calculated: Deduction {tds_result.get('deduction_amount')} under Sec {tds_result.get('section')}")

        # 5. Resolve Cost Centers & Dimensions
        dimensions = CostCenterEngine.resolve_dimensions(
            extracted_data=extracted_data,
            vendor_profile=vendor_profile
        )

        # 6. Generate Cohesive, Consistent Narration Description
        narration = NarrationGenerator.generate(
            event_type=doc_type,
            extracted_data=extracted_data,
            category=ledger_name
        )

        # 7. Construct and Balance Journal Entry Debits & Credits
        journal_lines = await JournalBuilder.build_journal_lines(
            company_id=company_id,
            doc_type=doc_type,
            extracted_data=extracted_data,
            resolved_ledger_code=ledger_code,
            gst_split=gst_split,
            tds_result=tds_result,
            dimensions=dimensions
        )
        logger.info(f"Journal Created with {len(journal_lines)} lines.")

        # 8. Conduct Financial & Bookkeeping Validation
        validation_report = await FinancialValidator.validate_posting(
            company_id=company_id,
            doc_type=doc_type,
            extracted_data=extracted_data,
            journal_lines=journal_lines
        )
        if validation_report.get("passed"):
            logger.info("Validation Passed successfully.")
        else:
            logger.warning(f"Validation Failed: {validation_report.get('errors')}")

        return {
            "success": validation_report.get("passed", False),
            "accounting_event": doc_type,
            "ledger_code": ledger_code,
            "ledger_name": ledger_name,
            "confidence": mapper_confidence,
            "gst_split": gst_split,
            "tds_result": tds_result,
            "dimensions": dimensions,
            "narration": narration,
            "journal_lines": journal_lines,
            "validation_report": validation_report
        }

    @classmethod
    async def process_posting(
        cls,
        company_id: str,
        extracted_data: Dict[str, Any],
        created_by: str,
        source_id: str,
        vendor_profile: Optional[Dict[str, Any]] = None,
        cumulative_vendor_annual_spend: float = 0.0
    ) -> Dict[str, Any]:
        """Surgical posting handler that performs validation checks, commits balanced double-entry
        transactions, saves vouchers, trains Ledger Learning, updates history, and stamps audits.
        """
        # Resolve instructions
        instructions = await cls.process_document(
            company_id=company_id,
            extracted_data=extracted_data,
            vendor_profile=vendor_profile,
            cumulative_vendor_annual_spend=cumulative_vendor_annual_spend
        )

        if not instructions.get("success"):
            err_list = instructions.get("validation_report", {}).get("errors", [])
            raise ValueError(f"Deterministic bookkeeping validation failed: {', '.join(err_list)}")

        from backend.accounting_core import post_journal_entry
        
        # Post the balanced double-entry lines
        entry = await post_journal_entry(
            company_id=company_id,
            entry_date=extracted_data.get("invoice_date") or "",
            narration=instructions["narration"],
            lines=instructions["journal_lines"],
            source="ai_zero_touch",
            source_id=source_id,
            created_by=created_by
        )

        # Generate and save Voucher
        from backend.accounting_ai.voucher_builder import VoucherBuilder
        voucher = await VoucherBuilder.create_and_save_voucher(
            company_id=company_id,
            voucher_type=instructions["accounting_event"],
            document_id=source_id,
            journal_entry_id=entry["id"],
            party_name=extracted_data.get("vendor_or_customer_name") or "Unknown Party",
            total_amount=float(extracted_data.get("total_invoice_value") or 0.0),
            journal_lines=instructions["journal_lines"]
        )

        # Update Ledger Learning with approved results
        from backend.accounting_ai.ledger_learning import LedgerLearningEngine
        await LedgerLearningEngine.learn_from_approval(
            vendor_name=extracted_data.get("vendor_or_customer_name") or "",
            gstin=extracted_data.get("tax_registration_number") or "",
            company_id=company_id,
            approved_ledger_code=instructions["ledger_code"],
            meta={
                "department": instructions["dimensions"].get("department"),
                "cost_center": instructions["dimensions"].get("cost_center"),
                "project": instructions["dimensions"].get("project"),
                "narration_template": instructions["narration"]
            }
        )

        # Save to Posting History
        from backend.accounting_ai.posting_storage import PostingStorage
        history_payload = {
            "id": entry["id"],
            "accounting_event": instructions["accounting_event"],
            "posting_instructions": instructions,
            "journal_entry_id": entry["id"],
            "voucher_id": voucher["id"],
            "status": "posted"
        }
        await PostingStorage.save_posting_history(
            document_id=source_id,
            company_id=company_id,
            payload=history_payload
        )

        # Log to Immutable Posting Audit Trail
        from backend.accounting_ai.accounting_audit import AccountingAuditTrail
        await AccountingAuditTrail.log_posting_event(
            user_id=created_by,
            document_id=source_id,
            company_id=company_id,
            ai_recommendation={
                "ledger_code": instructions["ledger_code"],
                "ledger_name": instructions["ledger_name"]
            },
            final_decision={
                "ledger_code": instructions["ledger_code"],
                "ledger_name": instructions["ledger_name"]
            },
            corrections={},
            journal_version=1,
            voucher_version=1,
            approval_history=[]
        )

        logger.info(f"Posting completed and recorded: {entry['id']}")
        return entry

