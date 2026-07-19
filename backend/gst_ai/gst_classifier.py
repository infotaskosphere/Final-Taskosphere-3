from typing import Dict, Any, Optional
import logging

logger = logging.getLogger("gst_classifier")

class GSTClassifier:
    @staticmethod
    def classify_transaction(txn: Dict[str, Any]) -> str:
        """
        Classifies a transaction into standard GST categories.
        Expects keys:
          - supplier_gstin (str)
          - recipient_gstin (str)
          - place_of_supply (str - state code or name)
          - tax_rate (float)
          - is_sez (bool)
          - is_export (bool)
          - is_import (bool)
          - is_rcm (bool)
          - is_composition (bool)
          - is_isd (bool)
          - is_branch_transfer (bool)
          - is_job_work (bool)
          - exempt_type (str - "exempt", "nil", "non-gst")
        """
        try:
            # Extract GSTINs and state codes
            sgstin = (txn.get("supplier_gstin") or "").strip().upper()
            rgstin = (txn.get("recipient_gstin") or "").strip().upper()
            
            s_state = sgstin[:2] if len(sgstin) >= 2 and sgstin[:2].isdigit() else ""
            r_state = rgstin[:2] if len(rgstin) >= 2 and rgstin[:2].isdigit() else ""

            # 1. Reverse Charge
            if txn.get("is_rcm") or str(txn.get("reverse_charge", "")).lower() in ("y", "yes", "true"):
                return "Reverse Charge"

            # 2. ISD
            if txn.get("is_isd") or txn.get("invoice_type") == "ISD":
                return "ISD Transactions"

            # 3. Job Work
            if txn.get("is_job_work"):
                return "Job Work"

            # 4. Branch / Stock Transfer
            if txn.get("is_branch_transfer") or txn.get("is_stock_transfer"):
                return "Branch Transfer"

            # 5. Composition Dealer
            if txn.get("is_composition") or txn.get("supplier_type") == "composition":
                return "Composition Dealer"

            # 6. SEZ Supply vs Purchase
            if txn.get("is_sez") or "SEZ" in str(txn.get("invoice_type", "")).upper():
                # If recipient is SEZ, it's SEZ Supply. If supplier is SEZ, it's SEZ Purchase.
                # Usually we detect based on who is our company. Let's use a flag or check.
                if txn.get("is_purchase", True):
                    return "SEZ Purchase"
                return "SEZ Supply"

            # 7. Exports & Imports
            if txn.get("is_export") or str(txn.get("place_of_supply", "")).upper() == "EXPORTS":
                return "Exports"
            if txn.get("is_import") or txn.get("invoice_type") == "IMPG":
                return "Imports"

            # 8. Exempt, Nil, Non-GST
            exempt_type = str(txn.get("exempt_type", "")).lower()
            tax_rate = float(txn.get("tax_rate") or txn.get("rate") or 0.0)
            if tax_rate == 0.0 or exempt_type:
                if exempt_type == "nil" or txn.get("is_nil_rated"):
                    return "Nil Rated Supply"
                elif exempt_type == "non-gst" or txn.get("is_non_gst"):
                    return "Non-GST Supply"
                elif exempt_type == "exempt" or txn.get("is_exempt"):
                    return "Exempt Supply"
                else:
                    return "Zero Rated Supply"

            # 9. Intra-State vs Inter-State based on GSTINs
            if s_state and r_state:
                if s_state == r_state:
                    return "Intra-State Supply"
                else:
                    return "Inter-State Supply"

            # Fallback based on place of supply vs company registered state code
            pos = str(txn.get("place_of_supply", "")).strip()[:2]
            company_state = str(txn.get("company_state_code", "")).strip()
            if pos and company_state:
                if pos == company_state:
                    return "Intra-State Supply"
                else:
                    return "Inter-State Supply"

            # Default fallback
            return "Intra-State Supply"
        except Exception as e:
            logger.error(f"Error in GST classification: {e}", exc_info=True)
            return "Intra-State Supply"
