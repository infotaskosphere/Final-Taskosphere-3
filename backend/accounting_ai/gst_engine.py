"""
GST Engine — Decides and calculates GST types (CGST, SGST, IGST, Cess), Reverse Charge (RCM), and ITC eligibility.
Performs deterministic tax split validation relative to company state vs vendor state.
"""

from typing import Dict, Any, Tuple
import logging

logger = logging.getLogger("gst_engine")

class GSTEngine:
    @staticmethod
    def determine_gst_split(
        company_gstin: str,
        vendor_gstin: str,
        total_tax_amount: float
    ) -> Dict[str, float]:
        """Calculates CGST, SGST, and IGST splits based on Indian GST guidelines.
        First 2 digits of GSTIN indicate state code.
        Same State -> Intra-state (CGST + SGST split 50/50)
        Different State -> Inter-state (IGST 100%)
        """
        cgst = 0.0
        sgst = 0.0
        igst = 0.0

        company_gstin = str(company_gstin or "").strip()
        vendor_gstin = str(vendor_gstin or "").strip()
        total_tax_amount = round(float(total_tax_amount or 0.0), 2)

        if total_tax_amount <= 0:
            return {"cgst": 0.0, "sgst": 0.0, "igst": 0.0}

        # Safe defaults if either GSTIN is missing
        if not company_gstin or not vendor_gstin or len(company_gstin) < 2 or len(vendor_gstin) < 2:
            # Assume CGST/SGST split by default as fallback
            cgst = round(total_tax_amount / 2, 2)
            sgst = round(total_tax_amount - cgst, 2)
            return {"cgst": cgst, "sgst": sgst, "igst": 0.0}

        company_state = company_gstin[:2]
        vendor_state = vendor_gstin[:2]

        if company_state == vendor_state:
            # Intra-state
            cgst = round(total_tax_amount / 2, 2)
            sgst = round(total_tax_amount - cgst, 2)
        else:
            # Inter-state
            igst = total_tax_amount

        return {"cgst": cgst, "sgst": sgst, "igst": igst}

    @staticmethod
    def evaluate_rcm(vendor_profile: Optional[Dict[str, Any]] = None, extracted_data: Optional[Dict[str, Any]] = None) -> bool:
        """Determines if Reverse Charge Mechanism (RCM) is applicable.
        E.g., unregistered GTA services, legal expenses from advocates, or explicit RCM flag.
        """
        if vendor_profile and vendor_profile.get("is_rcm_applicable"):
            return True
            
        if extracted_data:
            desc = str(extracted_data.get("notes") or "").lower() + " " + " ".join(
                str(item.get("description") or "").lower() for item in extracted_data.get("line_items", [])
            )
            if "reverse charge" in desc or "rcm" in desc or "legal fees" in desc or "advocate" in desc:
                return True

        return False

    @staticmethod
    def check_itc_eligibility(account_code: str, vendor_profile: Optional[Dict[str, Any]] = None) -> str:
        """Determines Input Tax Credit (ITC) eligibility status under CGST Sec 17(5).
        Returns: "ELIGIBLE" | "BLOCKED" | "PARTIALLY_ELIGIBLE"
        Blocked credits apply to: Food & beverages, motor vehicles, personal usage, etc.
        """
        # Blocked expense accounts by code
        # E.g., 5600 (Travel & Conveyance - blocked for personal or unregistered travel),
        # 5300 (Office & Admin Expenses if it relates to office pantry/catering)
        code = str(account_code).strip()
        if code in ("5600", "5300"):
            # Check vendor profile flags too
            if vendor_profile and vendor_profile.get("itc_status") == "blocked":
                return "BLOCKED"
            return "PARTIALLY_ELIGIBLE"
            
        if vendor_profile and vendor_profile.get("itc_status") == "eligible":
            return "ELIGIBLE"

        return "ELIGIBLE"

    @classmethod
    def validate_gst_calculations(
        cls,
        taxable_value: float,
        cgst: float,
        sgst: float,
        igst: float,
        total_tax: float
    ) -> Tuple[bool, str]:
        """Validates that computed tax parameters reconcile mathematically.
        Also guarantees CGST = SGST, and either IGST or CGST/SGST is populated, but not both.
        """
        total_calc = round(cgst + sgst + igst, 2)
        if abs(total_calc - round(total_tax, 2)) > 0.05:
            return False, f"Sum of CGST ({cgst}) + SGST ({sgst}) + IGST ({igst}) does not match total tax ({total_tax})"

        if cgst > 0 or sgst > 0:
            if abs(cgst - sgst) > 0.02:
                return False, f"Asymmetrical GST: CGST ({cgst}) must equal SGST ({sgst})"
            if igst > 0:
                return False, "Invalid GST mix: CGST/SGST and IGST cannot both be non-zero"

        return True, "GST calculations are balanced and valid."
class Optional:
    pass
