from typing import Dict, Any, List
import logging
from backend.gst_ai.gst_rules import GSTRulesManager

logger = logging.getLogger("itc_engine")

class ITCEngine:
    @classmethod
    async def analyze_itc_eligibility(cls, invoice: Dict[str, Any], business_use_pct: float = 100.0) -> Dict[str, Any]:
        """
        Determines the eligible Input Tax Credit for an invoice based on section 17(5) and category rules.
        """
        category = invoice.get("itc_category") or "general_inputs"
        rule = await GSTRulesManager.get_itc_rule(category)

        igst = float(invoice.get("igst") or 0.0)
        cgst = float(invoice.get("cgst") or 0.0)
        sgst = float(invoice.get("sgst") or 0.0)
        cess = float(invoice.get("cess") or 0.0)
        total_tax = igst + cgst + sgst + cess

        is_blocked = rule.get("is_blocked", False)
        eligible_pct_rule = rule.get("eligible_pct", 100.0)

        # Apply partial business use percentage if provided
        final_eligible_pct = (eligible_pct_rule / 100.0) * (business_use_pct / 100.0)

        is_capital_goods = invoice.get("is_capital_goods") or category == "capital_goods"
        is_rcm = invoice.get("is_rcm") or str(invoice.get("reverse_charge", "")).lower() in ("y", "yes", "true")

        eligible_igst = 0.0 if is_blocked else round(igst * final_eligible_pct, 2)
        eligible_cgst = 0.0 if is_blocked else round(cgst * final_eligible_pct, 2)
        eligible_sgst = 0.0 if is_blocked else round(sgst * final_eligible_pct, 2)
        eligible_cess = 0.0 if is_blocked else round(cess * final_eligible_pct, 2)
        eligible_total = eligible_igst + eligible_cgst + eligible_sgst + eligible_cess

        blocked_total = total_tax - eligible_total

        reversal_required = False
        reversal_reason = ""
        if business_use_pct < 100.0 and total_tax > 0:
            reversal_required = True
            reversal_reason = "Partial non-business use (Rule 42/43)"

        return {
            "category": category,
            "is_blocked": is_blocked,
            "blocked_amount": round(blocked_total, 2),
            "is_capital_goods": is_capital_goods,
            "is_rcm_itc": is_rcm,
            "eligible_igst": eligible_igst,
            "eligible_cgst": eligible_cgst,
            "eligible_sgst": eligible_sgst,
            "eligible_cess": eligible_cess,
            "eligible_total": eligible_total,
            "reversal_required": reversal_required,
            "reversal_reason": reversal_reason,
            "description": rule.get("description", "Standard processing")
        }

    @staticmethod
    def compute_itc_utilization(
        itc_balance: Dict[str, float],
        liability: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Simulates the statutory sequence of utilizing ITC balances to pay off tax liabilities.
        Rules:
        1. IGST credit must be fully exhausted first. It can offset IGST, then CGST and SGST in any order.
        2. CGST credit offsets CGST liability first, then IGST. (Never SGST).
        3. SGST credit offsets SGST liability first, then IGST. (Never CGST).
        """
        # Copy inputs
        itc = {k: float(v) for k, v in itc_balance.items()}
        liab = {k: float(v) for k, v in liability.items()}

        utilization = {
            "igst": {"igst": 0.0, "cgst": 0.0, "sgst": 0.0},
            "cgst": {"igst": 0.0, "cgst": 0.0},
            "sgst": {"igst": 0.0, "sgst": 0.0}
        }

        # --- 1. UTILIZE IGST CREDIT ---
        # First offset IGST liability
        igst_for_igst = min(itc.get("igst", 0.0), liab.get("igst", 0.0))
        itc["igst"] = round(itc.get("igst", 0.0) - igst_for_igst, 2)
        liab["igst"] = round(liab.get("igst", 0.0) - igst_for_igst, 2)
        utilization["igst"]["igst"] = igst_for_igst

        # Then offset CGST liability
        igst_for_cgst = min(itc.get("igst", 0.0), liab.get("cgst", 0.0))
        itc["igst"] = round(itc.get("igst", 0.0) - igst_for_cgst, 2)
        liab["cgst"] = round(liab.get("cgst", 0.0) - igst_for_cgst, 2)
        utilization["igst"]["cgst"] = igst_for_cgst

        # Then offset SGST liability
        igst_for_sgst = min(itc.get("igst", 0.0), liab.get("sgst", 0.0))
        itc["igst"] = round(itc.get("igst", 0.0) - igst_for_sgst, 2)
        liab["sgst"] = round(liab.get("sgst", 0.0) - igst_for_sgst, 2)
        utilization["igst"]["sgst"] = igst_for_sgst

        # --- 2. UTILIZE CGST CREDIT ---
        # First offset CGST liability
        cgst_for_cgst = min(itc.get("cgst", 0.0), liab.get("cgst", 0.0))
        itc["cgst"] = round(itc.get("cgst", 0.0) - cgst_for_cgst, 2)
        liab["cgst"] = round(liab.get("cgst", 0.0) - cgst_for_cgst, 2)
        utilization["cgst"]["cgst"] = cgst_for_cgst

        # Then offset IGST liability
        cgst_for_igst = min(itc.get("cgst", 0.0), liab.get("igst", 0.0))
        itc["cgst"] = round(itc.get("cgst", 0.0) - cgst_for_igst, 2)
        liab["igst"] = round(liab.get("igst", 0.0) - cgst_for_igst, 2)
        utilization["cgst"]["igst"] = cgst_for_igst

        # --- 3. UTILIZE SGST CREDIT ---
        # First offset SGST liability
        sgst_for_sgst = min(itc.get("sgst", 0.0), liab.get("sgst", 0.0))
        itc["sgst"] = round(itc.get("sgst", 0.0) - sgst_for_sgst, 2)
        liab["sgst"] = round(liab.get("sgst", 0.0) - sgst_for_sgst, 2)
        utilization["sgst"]["sgst"] = sgst_for_sgst

        # Then offset IGST liability
        sgst_for_igst = min(itc.get("sgst", 0.0), liab.get("igst", 0.0))
        itc["sgst"] = round(itc.get("sgst", 0.0) - sgst_for_igst, 2)
        liab["igst"] = round(liab.get("igst", 0.0) - sgst_for_igst, 2)
        utilization["sgst"]["igst"] = sgst_for_igst

        return {
            "utilization_matrix": utilization,
            "remaining_itc_balance": itc,
            "unpaid_liability": liab
        }
