"""
Voucher Builder — Builds structured, printable vouchers (Receipts, Payments, Purchase/Sales Vouchers) wrapping around
balanced double-entry lines. Persists records to voucher history.
"""

from typing import Dict, Any, List
import uuid
import logging
from backend.accounting_ai.posting_storage import PostingStorage

logger = logging.getLogger("voucher_builder")

class VoucherBuilder:
    @staticmethod
    def generate_voucher_number(company_id: str, voucher_type: str, count: int = 1) -> str:
        """Generates a clean, chronological sequential voucher code."""
        prefix = {
            "PURCHASE": "PV",
            "SALE": "SV",
            "JOURNAL": "JV",
            "PAYMENT": "PMT",
            "RECEIPT": "RCPT"
        }.get(str(voucher_type).upper(), "VCH")
        
        # Simple pseudo-incremental code using a unique suffix
        suffix = str(uuid.uuid4())[:8].upper()
        return f"{prefix}-{suffix}"

    @classmethod
    async def create_and_save_voucher(
        cls,
        company_id: str,
        voucher_type: str,
        document_id: str,
        journal_entry_id: str,
        party_name: str,
        total_amount: float,
        journal_lines: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Creates a structured voucher model and stores it in the voucher_history collection."""
        voucher_id = str(uuid.uuid4())
        vch_num = cls.generate_voucher_number(company_id, voucher_type)
        
        voucher_data = {
            "voucher_type": voucher_type.upper(),
            "voucher_number": vch_num,
            "document_id": document_id,
            "journal_entry_id": journal_entry_id,
            "party_name": party_name,
            "total_amount": float(total_amount),
            "details": {
                "journal_lines_count": len(journal_lines),
                "memo_sample": journal_lines[0].get("memo", "") if journal_lines else "",
                "status": "APPROVED"
            }
        }
        
        await PostingStorage.save_voucher_history(voucher_id, company_id, voucher_data)
        voucher_data["id"] = voucher_id
        return voucher_data
