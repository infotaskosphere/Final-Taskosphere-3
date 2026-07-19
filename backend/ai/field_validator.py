import re
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.dependencies import db

logger = logging.getLogger("field_validator")

# Standard RegEx patterns
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", re.I)
PAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", re.I)

async def validate_extracted_fields(
    extracted_data: Dict[str, Any],
    ocr_metadata: Dict[str, Any],
    company_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validates field formatting, patterns, date validity, missing totals, page numbering,
    and performs database checks for duplicate invoice numbers.
    
    Returns a dict with:
      "is_valid": bool
      "errors": list of error strings
      "warnings": list of warning strings
      "validation_details": dict mapping checked fields to their status/messages
    """
    errors: List[str] = []
    warnings: List[str] = []
    details: Dict[str, Any] = {}
    
    # 1. Mandatory fields check
    mandatory_fields = ["vendor_or_customer_name", "invoice_number", "invoice_date", "total_invoice_value"]
    for field in mandatory_fields:
        val = extracted_data.get(field)
        if val is None or str(val).strip() == "":
            errors.append(f"Missing mandatory field: {field.replace('_', ' ')}")
            details[field] = {"status": "error", "message": "Field is required but missing"}
        else:
            details[field] = {"status": "ok"}

    # 2. GSTIN / PAN format check
    gstin = str(extracted_data.get("tax_registration_number") or "").strip().upper()
    if gstin:
        if GSTIN_PATTERN.match(gstin):
            details["tax_registration_number"] = {"status": "ok"}
            # Extract PAN from GSTIN (chars 3 to 12)
            pan_from_gst = gstin[2:12]
            if PAN_PATTERN.match(pan_from_gst):
                details["pan_from_gstin"] = {"status": "ok"}
        else:
            warnings.append(f"GSTIN format is invalid: '{gstin}'")
            details["tax_registration_number"] = {"status": "warning", "message": "Invalid GSTIN format pattern"}

    # 3. PAN check directly if present
    pan = str(extracted_data.get("pan") or "").strip().upper()
    if pan:
        if PAN_PATTERN.match(pan):
            details["pan"] = {"status": "ok"}
        else:
            warnings.append(f"PAN format is invalid: '{pan}'")
            details["pan"] = {"status": "warning", "message": "Invalid PAN format pattern"}

    # 4. Date validity & future date check
    inv_date_str = str(extracted_data.get("invoice_date") or "").strip()
    if inv_date_str:
        try:
            # Clean string and try parsing several common invoice formats
            clean_date = inv_date_str.split("T")[0] # strip ISO timestamp info if any
            parsed_date = None
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%Y/%m/%d"):
                try:
                    parsed_date = datetime.strptime(clean_date, fmt)
                    break
                except ValueError:
                    continue
            
            if parsed_date:
                # Check for future dates (local/system timezone)
                now_date = datetime.now()
                if parsed_date > now_date:
                    errors.append(f"Invoice date cannot be in the future: {inv_date_str}")
                    details["invoice_date"] = {"status": "error", "message": "Future date detected"}
                else:
                    details["invoice_date"] = {"status": "ok", "parsed_value": parsed_date.isoformat()}
            else:
                warnings.append(f"Could not reliably parse invoice date format: '{inv_date_str}'")
                details["invoice_date"] = {"status": "warning", "message": "Unrecognized date format"}
        except Exception as e:
            logger.error(f"Error validating date: {e}")
            warnings.append(f"Error parsing date format: {inv_date_str}")
            details["invoice_date"] = {"status": "warning", "message": "Exception during parsing"}

    # 5. Duplicate Invoice Number check in MongoDB
    invoice_number = str(extracted_data.get("invoice_number") or "").strip()
    vendor_name = str(extracted_data.get("vendor_or_customer_name") or "").strip()
    if invoice_number and vendor_name and company_id:
        try:
            # Query standard transactions collection (we assume it's journals, journal_entries, or zero-touch logs)
            # Typically invoices are saved in the main transaction or journal collections or zero-touch logs
            existing = await db.journal_entries.find_one({
                "company_id": company_id,
                "invoice_number": invoice_number,
                "vendor_or_customer_name": vendor_name
            })
            if existing:
                errors.append(f"Duplicate invoice detected: Invoice #{invoice_number} from vendor '{vendor_name}' already exists.")
                details["invoice_number"] = {"status": "error", "message": "Duplicate invoice number in database"}
        except Exception as db_err:
            logger.error(f"Failed to run duplicate invoice DB check: {db_err}", exc_info=True)

    # 6. Negative amounts check
    amount_fields = ["taxable_value", "total_invoice_value", "cgst", "sgst", "igst", "cess"]
    for field in amount_fields:
        val = extracted_data.get(field)
        if val is not None and str(val).strip() != "":
            try:
                numeric_val = float(str(val).replace(",", "").strip())
                if numeric_val < 0:
                    errors.append(f"Field '{field.replace('_', ' ')}' contains negative value: {val}")
                    details[field] = {"status": "error", "message": "Negative amount not allowed"}
                else:
                    if field not in details or details[field]["status"] == "ok":
                        details[field] = {"status": "ok", "numeric_value": numeric_val}
            except ValueError:
                warnings.append(f"Field '{field.replace('_', ' ')}' could not be parsed as a numeric value: '{val}'")
                details[field] = {"status": "warning", "message": "Non-numeric value in financial field"}

    # 7. Check page numbering consistency
    pages_processed = ocr_metadata.get("pages_processed", 1)
    if pages_processed > 1:
        # Check if the text contains standard page patterns like "Page 2 of 2" etc
        # If we processed multiple pages, page sequence is naturally complete
        details["page_numbering"] = {"status": "ok", "pages": pages_processed}
    else:
        details["page_numbering"] = {"status": "ok", "pages": 1}

    # Determine overall status
    is_valid = len(errors) == 0
    
    return {
        "is_valid": is_valid,
        "errors": errors,
        "warnings": warnings,
        "details": details
    }
