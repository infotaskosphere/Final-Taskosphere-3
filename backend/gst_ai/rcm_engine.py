from typing import Dict, Any, List
import logging
from backend.gst_ai.gst_rules import GSTRulesManager

logger = logging.getLogger("rcm_engine")

class RCMEngine:
    @classmethod
    async def process_rcm_impact(cls, invoice: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detects if RCM is applicable on the transaction, then calculates tax and accounting impact.
        """
        hsn_sac = str(invoice.get("hsn") or invoice.get("hsn_code") or "").strip()
        is_rcm_by_flag = str(invoice.get("reverse_charge") or invoice.get("is_rcm") or "").lower() in ("y", "yes", "true")

        # Configurable RCM lookup based on statutory rule manager
        is_rcm_by_rule = await GSTRulesManager.get_rcm_applicable(hsn_sac) if hsn_sac else False

        rcm_applicable = is_rcm_by_flag or is_rcm_by_rule

        if not rcm_applicable:
            return {
                "rcm_applicable": False,
                "tax_impact": {},
                "posting_instructions": []
            }

        taxable_value = float(invoice.get("taxable_value") or invoice.get("taxable_amount") or 0.0)
        rate = float(invoice.get("rate") or invoice.get("tax_rate") or 18.0) # Default to standard 18% for services if not specified

        # Determine state rules for Intra vs Inter
        s_gstin = (invoice.get("supplier_gstin") or "").strip()
        r_gstin = (invoice.get("recipient_gstin") or "").strip()
        
        s_state = s_gstin[:2] if len(s_gstin) >= 2 and s_gstin[:2].isdigit() else ""
        r_state = r_gstin[:2] if len(r_gstin) >= 2 and r_gstin[:2].isdigit() else ""

        computed_igst = 0.0
        computed_cgst = 0.0
        computed_sgst = 0.0

        if s_state and r_state and s_state != r_state:
            computed_igst = round(taxable_value * (rate / 100.0), 2)
        else:
            computed_cgst = round(taxable_value * (rate / 200.0), 2)
            computed_sgst = computed_cgst

        tax_impact = {
            "rcm_taxable_value": taxable_value,
            "rcm_rate": rate,
            "rcm_igst": computed_igst,
            "rcm_cgst": computed_cgst,
            "rcm_sgst": computed_sgst,
            "rcm_total_liability": round(computed_igst + computed_cgst + computed_sgst, 2)
        }

        # Generate Posting Instructions:
        # Under RCM, recipient pays tax to government and is eligible to claim ITC for it.
        # So we create a temporary liability and an asset (ITC) entry.
        posting_instructions = []
        company_id = invoice.get("company_id") or ""

        if computed_igst > 0:
            posting_instructions.append({
                "account_code": "1200", # GST Input Credit
                "account_name": "GST Input Credit (IGST RCM Asset)",
                "debit": computed_igst,
                "credit": 0.0,
                "memo": "RCM IGST Asset Creation"
            })
            posting_instructions.append({
                "account_code": "2100", # GST Output/Payable
                "account_name": "GST RCM Payable (IGST Liability)",
                "debit": 0.0,
                "credit": computed_igst,
                "memo": "RCM IGST Liability Provision"
            })

        if computed_cgst > 0:
            posting_instructions.append({
                "account_code": "1200",
                "account_name": "GST Input Credit (CGST RCM Asset)",
                "debit": computed_cgst,
                "credit": 0.0,
                "memo": "RCM CGST Asset Creation"
            })
            posting_instructions.append({
                "account_code": "2100",
                "account_name": "GST RCM Payable (CGST Liability)",
                "debit": 0.0,
                "credit": computed_cgst,
                "memo": "RCM CGST Liability Provision"
            })

        if computed_sgst > 0:
            posting_instructions.append({
                "account_code": "1200",
                "account_name": "GST Input Credit (SGST RCM Asset)",
                "debit": computed_sgst,
                "credit": 0.0,
                "memo": "RCM SGST Asset Creation"
            })
            posting_instructions.append({
                "account_code": "2100",
                "account_name": "GST RCM Payable (SGST Liability)",
                "debit": 0.0,
                "credit": computed_sgst,
                "memo": "RCM SGST Liability Provision"
            })

        return {
            "rcm_applicable": True,
            "tax_impact": tax_impact,
            "posting_instructions": posting_instructions
        }
