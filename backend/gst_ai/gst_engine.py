from typing import Dict, Any, List, Optional
import logging
from backend.gst_ai.gst_classifier import GSTClassifier
from backend.gst_ai.gst_validator import GSTValidator
from backend.gst_ai.itc_engine import ITCEngine
from backend.gst_ai.rcm_engine import RCMEngine
from backend.gst_ai.gst_learning import GSTLearningEngine
from backend.gst_ai.gst_audit import GSTAuditLogger
from backend.gst_ai.gst_storage import GSTStorage

logger = logging.getLogger("gst_engine")

class GSTEngine:
    @classmethod
    async def process_gst(
        cls,
        invoice_data: Dict[str, Any],
        company_id: str,
        user_id: str,
        rule_version: str = "v1.0.0"
    ) -> Dict[str, Any]:
        """
        Coordinates full GST processing pipeline for an incoming transaction/invoice.
        """
        try:
            logger.info("Initializing GST Intelligence processing.")
            
            # 1. Classification
            classification = GSTClassifier.classify_transaction(invoice_data)
            logger.info(f"Transaction classified as: {classification}")

            # 2. Validation
            validation_report = GSTValidator.validate_invoice(invoice_data)
            logger.info(f"Validation completed. Is valid: {validation_report['is_valid']}")

            # 3. ITC calculation (for Purchases / Inward supplies)
            is_purchase = invoice_data.get("is_purchase", True)
            itc_report = {}
            if is_purchase:
                # Apply vendor defaults/history learning check
                itc_category = invoice_data.get("itc_category") or "general_inputs"
                
                # Check for historical recommendation
                gstin = (invoice_data.get("supplier_gstin") or "").strip()
                suggested_cat = await GSTLearningEngine.get_smart_recommendation(gstin, "itc_category", itc_category)
                if suggested_cat:
                    logger.info(f"Applying learned ITC category suggestion: {suggested_cat}")
                    invoice_data["itc_category"] = suggested_cat
                    itc_category = suggested_cat

                itc_report = await ITCEngine.analyze_itc_eligibility(invoice_data)
                logger.info(f"ITC Eligibility computed. Eligible total: {itc_report['eligible_total']}")

            # 4. RCM Impact
            rcm_report = await RCMEngine.process_rcm_impact(invoice_data)
            if rcm_report["rcm_applicable"]:
                logger.info("RCM treatment is applicable on transaction.")

            # 5. Generate Posting Instructions
            # Map taxes to standard COA asset (GST Input Credit) and liability (GST Output Payable)
            posting_instructions = []
            
            # If RCM, load RCM posting instructions
            if rcm_report["rcm_applicable"]:
                posting_instructions.extend(rcm_report["posting_instructions"])
            else:
                # Standard non-RCM posting instructions
                igst = float(invoice_data.get("igst") or 0.0)
                cgst = float(invoice_data.get("cgst") or 0.0)
                sgst = float(invoice_data.get("sgst") or 0.0)
                
                if is_purchase:
                    # Inward supplies claim Input Credit (Asset)
                    if igst > 0:
                        posting_instructions.append({
                            "account_code": "1200", # GST Input Credit
                            "account_name": "GST Input Credit (IGST)",
                            "debit": igst,
                            "credit": 0.0,
                            "memo": f"Purchase GST IGST on invoice {invoice_data.get('invoice_no') or invoice_data.get('invoice_number')}"
                        })
                    if cgst > 0:
                        posting_instructions.append({
                            "account_code": "1200",
                            "account_name": "GST Input Credit (CGST)",
                            "debit": cgst,
                            "credit": 0.0,
                            "memo": f"Purchase GST CGST on invoice {invoice_data.get('invoice_no') or invoice_data.get('invoice_number')}"
                        })
                    if sgst > 0:
                        posting_instructions.append({
                            "account_code": "1200",
                            "account_name": "GST Input Credit (SGST)",
                            "debit": sgst,
                            "credit": 0.0,
                            "memo": f"Purchase GST SGST on invoice {invoice_data.get('invoice_no') or invoice_data.get('invoice_number')}"
                        })
                else:
                    # Outward supplies incur Output Payable (Liability)
                    if igst > 0:
                        posting_instructions.append({
                            "account_code": "2100", # GST Output Payable
                            "account_name": "GST Output Payable (IGST)",
                            "debit": 0.0,
                            "credit": igst,
                            "memo": f"Sales GST IGST on invoice {invoice_data.get('invoice_no') or invoice_data.get('invoice_number')}"
                        })
                    if cgst > 0:
                        posting_instructions.append({
                            "account_code": "2100",
                            "account_name": "GST Output Payable (CGST)",
                            "debit": 0.0,
                            "credit": cgst,
                            "memo": f"Sales GST CGST on invoice {invoice_data.get('invoice_no') or invoice_data.get('invoice_number')}"
                        })
                    if sgst > 0:
                        posting_instructions.append({
                            "account_code": "2100",
                            "account_name": "GST Output Payable (SGST)",
                            "debit": 0.0,
                            "credit": sgst,
                            "memo": f"Sales GST SGST on invoice {invoice_data.get('invoice_no') or invoice_data.get('invoice_number')}"
                        })

            # Compile Full Results
            results = {
                "invoice_no": invoice_data.get("invoice_no") or invoice_data.get("invoice_number"),
                "gst_treatment_classification": classification,
                "validation_report": validation_report,
                "itc_report": itc_report,
                "rcm_report": rcm_report,
                "posting_instructions": posting_instructions
            }

            # 6. Immutable Audit Logging
            ai_recommendation = {
                "classification": classification,
                "itc_eligible": itc_report.get("eligible_total", 0.0) if is_purchase else 0.0,
                "rcm_applicable": rcm_report["rcm_applicable"]
            }
            
            await GSTAuditLogger.log_decision(
                company_id=company_id,
                user_id=user_id,
                document_id=invoice_data.get("id") or "txn_direct",
                action="AUTO_POSTED" if validation_report["is_valid"] else "PENDING_REVIEW",
                invoice_no=results["invoice_no"],
                ai_recommendation=ai_recommendation,
                final_outcome=results,
                validation_report=validation_report,
                rule_version=rule_version
            )

            # 7. Store processing history via Storage engine
            history_record = {
                "company_id": company_id,
                "invoice_id": invoice_data.get("id") or "txn_direct",
                "invoice_no": results["invoice_no"],
                "classification": classification,
                "is_valid": validation_report["is_valid"],
                "results": results
            }
            await GSTStorage.save_processing_history(history_record)

            logger.info("GST processing pipeline executed successfully.")
            return results

        except Exception as e:
            logger.error(f"Critical error in GST processing pipeline: {e}", exc_info=True)
            # If GST engine fails, preserve existing flow with fallback to prevent losing user data
            return {
                "invoice_no": invoice_data.get("invoice_no") or invoice_data.get("invoice_number"),
                "gst_treatment_classification": "Intra-State Supply",
                "validation_report": {"is_valid": False, "errors": [f"GST Engine failure: {str(e)}"]},
                "itc_report": {},
                "rcm_report": {"rcm_applicable": False, "tax_impact": {}},
                "posting_instructions": []
            }
