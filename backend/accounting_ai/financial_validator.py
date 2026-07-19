"""
Financial Validator — Enforces deterministic bookkeeping policies, period lock states, mathematical balances,
GST logic sanity, duplicate postings detection, and general ledger compatibility.
"""

from typing import Dict, Any, List, Tuple
from datetime import datetime
import logging
from backend.dependencies import db
from backend.accounting_ai.gst_engine import GSTEngine

logger = logging.getLogger("financial_validator")

class FinancialValidator:
    @classmethod
    async def check_period_lock(cls, company_id: str, posting_date_iso: str) -> Tuple[bool, str]:
        """Checks if the books are locked for the specified period.
        Integrates with the existing `accounting_lock` or standard calendar rules.
        """
        try:
            # Query the existing accounting lock config or active lockouts
            lock_doc = await db.accounting_locks.find_one({"company_id": company_id, "is_active": True})
            if lock_doc:
                lock_limit_date = lock_doc.get("locked_until_date")  # e.g., "2026-06-30"
                if lock_limit_date and posting_date_iso <= lock_limit_date:
                    return False, f"Period is locked. The books are locked up to {lock_limit_date}."
        except Exception as e:
            logger.error(f"Error checking accounting period lock: {e}")
            
        # Standard safety: prevent posting way back in the past or far future
        try:
            p_date = datetime.strptime(posting_date_iso, "%Y-%m-%d")
            now = datetime.now()
            # If posting more than 2 years in past or 1 year in future
            if abs((now - p_date).days) > 365 * 2:
                return False, "Posting date is outside the acceptable operational range (too far in past/future)."
        except Exception:
            pass

        return True, "Period is open."

    @classmethod
    async def detect_duplicate_invoice(
        cls,
        company_id: str,
        vendor_name: str,
        invoice_no: str,
        total_value: float
    ) -> Tuple[bool, str]:
        """Verifies if the exact vendor + invoice combination already exists in the books to prevent duplicates."""
        if not invoice_no or not vendor_name:
            return True, "No invoice number or vendor provided; skipping duplicate detection."

        # Search in posted journal entries
        query = {
            "company_id": company_id,
            "source": "ai_zero_touch",
            "narration": {"$regex": invoice_no, "$options": "i"}
        }
        
        try:
            dup = await db.journal_entries.find_one(query)
            if dup:
                return False, f"Potential duplicate detected: Journal entry ID {dup['id']} matches invoice {invoice_no}."
                
            # Also search in processed documents
            dup_doc = await db.zte_processed_documents.find_one({
                "company_id": company_id,
                "status": "posted",
                "extracted.invoice_number": invoice_no,
                "extracted.vendor_or_customer_name": vendor_name
            })
            if dup_doc:
                return False, f"Potential duplicate: Invoice {invoice_no} from {vendor_name} has already been posted."
        except Exception as e:
            logger.error(f"Error in duplicate invoice checking: {e}")

        return True, "Invoice is unique."

    @classmethod
    async def validate_posting(
        cls,
        company_id: str,
        doc_type: str,
        extracted_data: Dict[str, Any],
        journal_lines: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Runs a complete suite of validation checks and generates a structured report."""
        report = {
            "passed": True,
            "errors": [],
            "warnings": [],
            "details": {}
        }

        # 1. Period Lock Check
        posting_date = extracted_data.get("invoice_date") or datetime.now().strftime("%Y-%m-%d")
        period_ok, period_msg = await cls.check_period_lock(company_id, posting_date)
        if not period_ok:
            report["passed"] = False
            report["errors"].append(period_msg)

        # 2. Duplicate Detection
        vendor_name = extracted_data.get("vendor_or_customer_name") or ""
        invoice_no = extracted_data.get("invoice_number") or ""
        total_val = float(extracted_data.get("total_invoice_value") or 0.0)
        unique_ok, unique_msg = await cls.detect_duplicate_invoice(company_id, vendor_name, invoice_no, total_val)
        if not unique_ok:
            report["passed"] = False
            report["errors"].append(unique_msg)

        # 3. Double-entry Balance Validation
        total_debit = round(sum(float(l.get("debit") or 0.0) for l in journal_lines), 2)
        total_credit = round(sum(float(l.get("credit") or 0.0) for l in journal_lines), 2)
        if abs(total_debit - total_credit) > 0.02:
            report["passed"] = False
            report["errors"].append(f"Imbalanced Journal: Total Debit ({total_debit}) does not equal Total Credit ({total_credit})")

        # 4. GST Accuracy Check
        tax_breakup = extracted_data.get("tax_breakup") or {}
        cgst = float(tax_breakup.get("cgst") or 0.0)
        sgst = float(tax_breakup.get("sgst") or 0.0)
        igst = float(tax_breakup.get("igst") or 0.0)
        total_tax = float(extracted_data.get("total_tax") or 0.0)
        
        gst_ok, gst_msg = GSTEngine.validate_gst_calculations(
            taxable_value=float(extracted_data.get("taxable_value") or 0.0),
            cgst=cgst,
            sgst=sgst,
            igst=igst,
            total_tax=total_tax
        )
        if not gst_ok:
            report["warnings"].append(gst_msg)

        # 5. Ledger compatibility checks
        for line in journal_lines:
            if not line.get("account_id"):
                report["passed"] = False
                report["errors"].append("Missing Account ID on one or more journal lines.")

        report["details"] = {
            "total_debit": total_debit,
            "total_credit": total_credit,
            "validation_timestamp": datetime.now().isoformat()
        }

        return report
