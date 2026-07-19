"""
Journal Builder — Constructs fully balanced, double-entry journal entries (Debits/Credits) representing
various transaction scenarios including GST, TDS, RCM, discounts, freight, and round-offs.
"""

from typing import Dict, Any, List, Optional
import logging
from backend.accounting_ai.chart_of_accounts import ChartOfAccountsManager

logger = logging.getLogger("journal_builder")

class JournalBuilder:
    @classmethod
    async def build_journal_lines(
        cls,
        company_id: str,
        doc_type: str,
        extracted_data: Dict[str, Any],
        resolved_ledger_code: str,
        gst_split: Dict[str, float],
        tds_result: Dict[str, Any],
        dimensions: Dict[str, str]
    ) -> List[Dict[str, Any]]:
        """Assembles and matches balanced journal line debit/credit pairs."""
        doc_type = str(doc_type).upper().strip()
        
        taxable_value = float(extracted_data.get("taxable_value") or 0.0)
        total_invoice_value = float(extracted_data.get("total_invoice_value") or 0.0)
        vendor_name = extracted_data.get("vendor_or_customer_name") or "Unknown Party"
        invoice_no = extracted_data.get("invoice_number") or ""

        # Load appropriate standard system accounts
        ar_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "receivable")
        ap_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "payable")
        gst_in_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "gst_input")
        gst_out_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "gst_output")
        tds_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "tds")
        roundoff_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "roundoff")
        
        # Load core expense/income ledger
        core_acct = await ChartOfAccountsManager.lookup_by_code(company_id, resolved_ledger_code)
        if not core_acct:
            core_acct = await ChartOfAccountsManager.get_default_account_for_category(company_id, "purchases")

        lines = []
        memo_suffix = f" — Inv {invoice_no}" if invoice_no else ""

        cgst = round(gst_split.get("cgst", 0.0), 2)
        sgst = round(gst_split.get("sgst", 0.0), 2)
        igst = round(gst_split.get("igst", 0.0), 2)
        total_tax = round(cgst + sgst + igst, 2)

        # Apply multi-currency scaling or historical FX conversions if present in metadata
        fx = extracted_data.get("fx") or {}
        fx_rate = float(fx.get("rate_to_inr") or 1.0)
        if fx_rate != 1.0:
            taxable_value = round(taxable_value * fx_rate, 2)
            cgst = round(cgst * fx_rate, 2)
            sgst = round(sgst * fx_rate, 2)
            igst = round(igst * fx_rate, 2)
            total_tax = round(total_tax * fx_rate, 2)
            total_invoice_value = round(total_invoice_value * fx_rate, 2)

        if doc_type == "PURCHASE":
            # 1. Base expense line
            lines.append({
                "account_id": core_acct["id"],
                "account_name": core_acct["name"],
                "debit": taxable_value,
                "credit": 0.0,
                "memo": f"{vendor_name}{memo_suffix}",
                **dimensions
            })

            # 2. GST Input Credits lines
            if cgst > 0:
                lines.append({
                    "account_id": gst_in_acct["id"],
                    "account_name": "GST Input Credit (CGST)",
                    "debit": cgst,
                    "credit": 0.0,
                    "memo": f"CGST Input{memo_suffix}",
                    **dimensions
                })
            if sgst > 0:
                lines.append({
                    "account_id": gst_in_acct["id"],
                    "account_name": "GST Input Credit (SGST)",
                    "debit": sgst,
                    "credit": 0.0,
                    "memo": f"SGST Input{memo_suffix}",
                    **dimensions
                })
            if igst > 0:
                lines.append({
                    "account_id": gst_in_acct["id"],
                    "account_name": "GST Input Credit (IGST)",
                    "debit": igst,
                    "credit": 0.0,
                    "memo": f"IGST Input{memo_suffix}",
                    **dimensions
                })

            # 3. TDS deduction line (reduces vendor payable)
            net_vendor_payable = total_invoice_value
            if tds_result and tds_result.get("applicable"):
                ded_amt = round(tds_result["deduction_amount"], 2)
                net_vendor_payable = round(net_vendor_payable - ded_amt, 2)
                lines.append({
                    "account_id": tds_acct["id"],
                    "account_name": f"TDS Payable Sec {tds_result.get('section')}",
                    "debit": 0.0,
                    "credit": ded_amt,
                    "memo": f"TDS deduction Sec {tds_result.get('section')}{memo_suffix}",
                    **dimensions
                })

            # 4. Net Vendor Payable line
            lines.append({
                "account_id": ap_acct["id"],
                "account_name": "Accounts Payable",
                "debit": 0.0,
                "credit": net_vendor_payable,
                "memo": f"Payable to {vendor_name}{memo_suffix}",
                **dimensions
            })

        elif doc_type == "SALE":
            # 1. Base Accounts Receivable line
            lines.append({
                "account_id": ar_acct["id"],
                "account_name": "Accounts Receivable",
                "debit": total_invoice_value,
                "credit": 0.0,
                "memo": f"Billed to {vendor_name}{memo_suffix}",
                **dimensions
            })

            # 2. Revenue sales line
            lines.append({
                "account_id": core_acct["id"],
                "account_name": core_acct["name"],
                "debit": 0.0,
                "credit": taxable_value,
                "memo": f"Sales revenue{memo_suffix}",
                **dimensions
            })

            # 3. GST Output liability lines
            if cgst > 0:
                lines.append({
                    "account_id": gst_out_acct["id"],
                    "account_name": "GST Output Payable (CGST)",
                    "debit": 0.0,
                    "credit": cgst,
                    "memo": f"CGST Liability{memo_suffix}",
                    **dimensions
                })
            if sgst > 0:
                lines.append({
                    "account_id": gst_out_acct["id"],
                    "account_name": "GST Output Payable (SGST)",
                    "debit": 0.0,
                    "credit": sgst,
                    "memo": f"SGST Liability{memo_suffix}",
                    **dimensions
                })
            if igst > 0:
                lines.append({
                    "account_id": gst_out_acct["id"],
                    "account_name": "GST Output Payable (IGST)",
                    "debit": 0.0,
                    "credit": igst,
                    "memo": f"IGST Liability{memo_suffix}",
                    **dimensions
                })

        # Calculate imbalance and apply smart Round-Off
        total_debit = round(sum(l["debit"] for l in lines), 2)
        total_credit = round(sum(l["credit"] for l in lines), 2)
        diff = round(total_debit - total_credit, 2)

        if abs(diff) > 0.0:
            if abs(diff) <= 5.0:  # Allow up to 5 INR round-off variance
                if diff > 0:
                    # Debit is higher -> add Credit round-off
                    lines.append({
                        "account_id": roundoff_acct["id"],
                        "account_name": "Round Off",
                        "debit": 0.0,
                        "credit": abs(diff),
                        "memo": "Auto round-off adjustment",
                        **dimensions
                    })
                else:
                    # Credit is higher -> add Debit round-off
                    lines.append({
                        "account_id": roundoff_acct["id"],
                        "account_name": "Round Off",
                        "debit": abs(diff),
                        "credit": 0.0,
                        "memo": "Auto round-off adjustment",
                        **dimensions
                    })
            else:
                logger.error(f"High balance discrepancy: debits {total_debit} != credits {total_credit}")
                raise ValueError(f"Journal balance mismatch of {diff} is too high to automatically round off.")

        return lines
