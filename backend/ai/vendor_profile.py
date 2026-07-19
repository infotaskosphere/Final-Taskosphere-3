import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class VendorProfileModel(BaseModel):
    vendor_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vendor_name: str
    gstin: Optional[str] = ""
    pan: Optional[str] = ""
    default_ledger: Optional[str] = "5000"  # Fallback to general Purchases
    expense_category: Optional[str] = "Purchases (uncategorised)"
    cost_centre: Optional[str] = "General"
    department: Optional[str] = "Operations"
    branch: Optional[str] = "Head Office"
    preferred_gst_treatment: Optional[str] = "Regular"
    preferred_tds_section: Optional[str] = "194C"
    default_payment_terms: Optional[str] = "Net 30"
    currency: Optional[str] = "INR"
    common_narration_pattern: Optional[str] = "Purchase from {vendor}"
    frequently_used_hsn_sac: List[str] = Field(default_factory=list)
    typical_tax_rates: List[float] = Field(default_factory=list)
    average_invoice_amount: float = 0.0
    average_payment_cycle: float = 30.0  # in days
    common_bank_accounts: List[str] = Field(default_factory=list)
    preferred_journal_pattern: Optional[str] = "Debit Expense / Credit AP"
    associated_templates: List[str] = Field(default_factory=list)
    document_types_seen: List[str] = Field(default_factory=list)
    confidence_score: float = 1.0
    times_processed: int = 0
    manual_corrections_count: int = 0
    last_processed: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    version: int = 1
    status: str = "Active"  # Active or Archived

def create_default_vendor_profile(vendor_name: str, gstin: str = "") -> Dict[str, Any]:
    """
    Creates a new dictionary-based vendor profile structure.
    """
    profile = VendorProfileModel(
        vendor_name=vendor_name,
        gstin=gstin
    )
    return profile.model_dump()
