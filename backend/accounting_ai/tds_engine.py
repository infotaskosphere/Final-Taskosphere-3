"""
TDS Engine — Determines and computes Tax Deducted at Source (TDS) under various sections of the Indian Income Tax Act.
Matches thresholds, rates, vendor compliance status, and outputs required entries.
"""

from typing import Dict, Any, Optional, Tuple

TDS_CONFIG = {
    "194C": {
        "name": "Payments to Contractors",
        "threshold_single": 30000.0,
        "threshold_annual": 100000.0,
        "rate_individual": 0.01,
        "rate_company": 0.02
    },
    "194J": {
        "name": "Professional or Technical Services",
        "threshold_single": 30000.0,
        "threshold_annual": 30000.0,
        "rate_standard": 0.10,
        "rate_technical": 0.02
    },
    "194I": {
        "name": "Rent for Land/Building/Furniture",
        "threshold_annual": 240000.0,
        "rate_rent": 0.10
    }
}

class TDSEngine:
    @staticmethod
    def evaluate_tds(
        account_code: str,
        taxable_value: float,
        cumulative_vendor_annual_spend: float = 0.0,
        vendor_profile: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Scans account code and vendor profile to evaluate if TDS is triggered.
        Returns: {
            "applicable": bool,
            "section": str,
            "rate": float,
            "deduction_amount": float,
            "reason": str
        }
        """
        code = str(account_code).strip()
        taxable_val = float(taxable_value or 0.0)
        cumulative_spend = float(cumulative_vendor_annual_spend or 0.0) + taxable_val
        
        result = {
            "applicable": False,
            "section": "N/A",
            "rate": 0.0,
            "deduction_amount": 0.0,
            "reason": "TDS is not triggered for this account class/spend threshold."
        }

        # Determine section from account code
        section = None
        rate = 0.0
        
        if code == "5200":  # Rent Expense
            section = "194I"
            sec_cfg = TDS_CONFIG[section]
            if cumulative_spend >= sec_cfg["threshold_annual"]:
                rate = sec_cfg["rate_rent"]
        elif code == "5250":  # Software & Cloud / Technical Services
            section = "194J"
            sec_cfg = TDS_CONFIG[section]
            if taxable_val >= sec_cfg["threshold_single"] or cumulative_spend >= sec_cfg["threshold_annual"]:
                # Use technical services rate
                rate = sec_cfg["rate_technical"]
        elif code == "5100" or code == "5500" or code == "5000":  # Contractors / Freight
            section = "194C"
            sec_cfg = TDS_CONFIG[section]
            if taxable_val >= sec_cfg["threshold_single"] or cumulative_spend >= sec_cfg["threshold_annual"]:
                is_company = False
                if vendor_profile:
                    is_company = vendor_profile.get("legal_entity_type") in ("company", "llp", "pvt_ltd")
                rate = sec_cfg["rate_company"] if is_company else sec_cfg["rate_individual"]

        # Override/force TDS rate or section from vendor profile directly if configured
        if vendor_profile and vendor_profile.get("tds_section"):
            section = vendor_profile.get("tds_section")
            rate = float(vendor_profile.get("tds_rate") or 0.0)

        # Apply withholding logic if applicable
        if section and rate > 0:
            deduction = round(taxable_val * rate, 2)
            result.update({
                "applicable": True,
                "section": section,
                "rate": rate,
                "deduction_amount": deduction,
                "reason": f"Triggered under Sec {section} ({TDS_CONFIG.get(section, {}).get('name', 'General')}) at {rate:.1%}"
            })

        return result
