"""
Narration Generator — Assembles polished, audit-compliant narrations from structured invoice metadata.
Supports configurable templates to format narrations consistently across books.
"""

from typing import Dict, Any, Optional
from datetime import datetime

class NarrationGenerator:
    DEFAULT_TEMPLATES = {
        "PURCHASE": "Purchase of {category} from {vendor_name} Invoice {invoice_number} dated {invoice_date}.",
        "SALE": "Sales / Fee billing to {vendor_name} Invoice {invoice_number} dated {invoice_date}.",
        "EXPENSE": "Expense recorded for {category} from {vendor_name} Invoice {invoice_number} dated {invoice_date}."
    }

    @classmethod
    def generate(
        cls,
        event_type: str,
        extracted_data: Dict[str, Any],
        category: str = "Goods/Services",
        custom_template: Optional[str] = None
    ) -> str:
        """Generates dynamic accounting narration for transaction logging."""
        event_key = str(event_type).upper().strip()
        template = custom_template or cls.DEFAULT_TEMPLATES.get(event_key, cls.DEFAULT_TEMPLATES["PURCHASE"])

        vendor_name = extracted_data.get("vendor_or_customer_name") or "Unknown Vendor"
        invoice_number = extracted_data.get("invoice_number") or "N/A"
        invoice_date_raw = extracted_data.get("invoice_date") or ""
        
        # Format date for readability if possible
        formatted_date = invoice_date_raw
        if invoice_date_raw:
            try:
                # Convert YYYY-MM-DD to DD-MM-YYYY
                dt = datetime.strptime(invoice_date_raw, "%Y-%m-%d")
                formatted_date = dt.strftime("%d-%m-%Y")
            except Exception:
                pass

        try:
            narration = template.format(
                category=category,
                vendor_name=vendor_name,
                invoice_number=invoice_number,
                invoice_date=formatted_date or "N/A"
            )
        except Exception:
            # Emergency safe fallback
            narration = f"AI entry - {event_key} from {vendor_name}, Inv {invoice_number} dt {formatted_date or 'N/A'}"

        # Add fx metadata to narration suffix if non-INR
        currency = (extracted_data.get("currency") or "INR").upper()
        total_val = extracted_data.get("total_invoice_value") or 0.0
        if currency != "INR" and "original_currency" not in narration:
            narration += f" [Original: {currency} {total_val}]"

        return narration
