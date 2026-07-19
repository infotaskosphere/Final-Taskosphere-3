import logging
from typing import Dict, Any, List, Optional
from backend.dependencies import db

logger = logging.getLogger("anomaly_detector")

async def detect_anomalies(
    extracted_data: Dict[str, Any],
    ocr_metadata: Dict[str, Any],
    vendor_profile: Optional[Dict[str, Any]] = None,
    validation_details: Optional[Dict[str, Any]] = None,
    company_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Scans the transaction, validation reports, and historical company records to flag
    any compliance, financial, or processing anomalies.
    
    Returns a list of dicts representing detected anomalies:
      {
        "anomaly_type": str,
        "severity": "LOW" | "MEDIUM" | "HIGH",
        "recommendation": str,
        "details": str
      }
    """
    anomalies: List[Dict[str, Any]] = []
    
    # 1. Check OCR Quality
    quality_score = float(ocr_metadata.get("quality_score", 1.0))
    if quality_score < 0.50:
        anomalies.append({
            "anomaly_type": "LOW_OCR_QUALITY",
            "severity": "MEDIUM",
            "recommendation": "Review document manually or re-upload high resolution copy.",
            "details": f"OCR composite quality score is exceptionally low ({quality_score}). Risks extraction errors."
        })

    # 2. Check Unknown Vendor
    vendor_name = extracted_data.get("vendor_or_customer_name") or ""
    if not vendor_profile:
        anomalies.append({
            "anomaly_type": "UNKNOWN_VENDOR",
            "severity": "MEDIUM",
            "recommendation": "Verify vendor credentials and create vendor profile.",
            "details": f"Vendor '{vendor_name}' is not registered in the active database."
        })

    # Parse pricing info
    def parse_float(val) -> float:
        if val is None or str(val).strip() == "":
            return 0.0
        try:
            return float(str(val).replace(",", "").strip())
        except ValueError:
            return 0.0

    total_val = parse_float(extracted_data.get("total_invoice_value"))
    taxable = parse_float(extracted_data.get("taxable_value"))
    
    # 3. Sudden price spike check compared to vendor averages
    if vendor_profile and total_val > 0.0:
        try:
            # Query vendor history to find standard deviation or simple moving average
            vendor_id = vendor_profile.get("vendor_id") or vendor_profile.get("id")
            cursor = db.journal_entries.find(
                {"company_id": company_id, "vendor_or_customer_name": vendor_profile.get("vendor_name")},
                {"amount_inr": 1}
            ).sort("timestamp", -1)
            history = await cursor.to_list(15)
            if history:
                amounts = [float(doc.get("amount_inr") or 0.0) for doc in history if doc.get("amount_inr")]
                if amounts:
                    avg_amt = sum(amounts) / len(amounts)
                    # If this transaction exceeds 2.5x the historical average
                    if total_val > (avg_amt * 2.5) and len(amounts) >= 3:
                        anomalies.append({
                            "anomaly_type": "PRICE_SPIKE",
                            "severity": "HIGH",
                            "recommendation": "Manually inspect quantities, item prices, or service scope.",
                            "details": f"Invoice amount ({total_val:.2f}) is 2.5x higher than historical average for this vendor ({avg_amt:.2f})."
                        })
        except Exception as e:
            logger.error(f"Error checking historical price spikes: {e}")

    # 4. Check for Negative Values
    if total_val < 0 or taxable < 0:
        anomalies.append({
            "anomaly_type": "NEGATIVE_VALUES",
            "severity": "HIGH",
            "recommendation": "Reject or manually inspect. Credits / debit notes should be classified explicitly.",
            "details": "Negative values detected in extracted financial figures."
        })

    # 5. Missing taxes anomaly (GST Regular vendor missing any CGST/SGST/IGST)
    supplier_gst = str(extracted_data.get("tax_registration_number") or "").strip()
    cgst = parse_float(extracted_data.get("cgst"))
    sgst = parse_float(extracted_data.get("sgst"))
    igst = parse_float(extracted_data.get("igst"))
    
    # If a valid GSTIN exists and taxable value is non-zero, taxes should usually be positive
    if len(supplier_gst) == 15 and taxable > 500.0 and (cgst + sgst + igst) == 0.0:
        # Check if the vendor profile explicitly flags exempt/nil-rated treatment
        exempt = vendor_profile.get("preferred_gst_treatment") == "Exempt" if vendor_profile else False
        if not exempt:
            anomalies.append({
                "anomaly_type": "MISSING_TAX",
                "severity": "MEDIUM",
                "recommendation": "Verify if vendor has charged GST. Update vendor GST treatment profile.",
                "details": "Regular GSTIN registered supplier with positive taxable value contains zero taxes."
            })

    # 6. Suspicious narration or keywords
    narration = str(extracted_data.get("narration") or "").lower()
    suspicious_keywords = ["personal", "gift", "cash only", "confidential", "bribe", "suspense"]
    matched_suspicious = [kw for kw in suspicious_keywords if kw in narration]
    if matched_suspicious:
        anomalies.append({
            "anomaly_type": "SUSPICIOUS_NARRATION",
            "severity": "HIGH",
            "recommendation": "Review compliance context and verify policy conformity.",
            "details": f"Invoice description contains suspicious/unusual terms: {', '.join(matched_suspicious)}"
        })

    # 7. Unexpected ledger assignment
    if vendor_profile:
        expected_ledger = vendor_profile.get("default_ledger")
        extracted_ledger = extracted_data.get("ledger_mapping")
        if expected_ledger and extracted_ledger and str(expected_ledger) != str(extracted_ledger):
            anomalies.append({
                "anomaly_type": "UNEXPECTED_LEDGER",
                "severity": "LOW",
                "recommendation": "Confirm whether the expense category requires standard vs custom ledger mappings.",
                "details": f"Extracted ledger code ({extracted_ledger}) differs from default vendor profile ledger ({expected_ledger})."
            })

    # 8. Duplicate check from validation warnings/errors
    if validation_details:
        for err in validation_details.get("errors", []):
            if "duplicate" in err.lower():
                anomalies.append({
                    "anomaly_type": "DUPLICATE_INVOICE",
                    "severity": "HIGH",
                    "recommendation": "Do NOT post. Delete or archive duplicate.",
                    "details": err
                })

    logger.info(f"Anomaly Detector: Completed scanning. Detected {len(anomalies)} anomalies.")
    return anomalies
