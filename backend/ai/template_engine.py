import logging
import uuid
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.dependencies import db
from backend.ai.layout_analyzer import analyze_layout
from backend.ai.template_matcher import find_best_template
from backend.ai.template_storage import save_template, update_template, increment_usage

logger = logging.getLogger("template_engine")

async def find_matching_template(contents: bytes, filename: str, ocr_text: str = "") -> Optional[Dict[str, Any]]:
    """
    Analyzes layout and searches template library for a matching template.
    """
    try:
        layout_sig = analyze_layout(contents, filename)
        best_temp, score, confidence, reason = await find_best_template(layout_sig, filename, ocr_text)
        if best_temp and confidence >= 0.82:
            return best_temp
    except Exception as e:
        logger.error(f"Error in find_matching_template: {e}", exc_info=True)
    return None

def _sanitize_regex_pattern(val: str) -> str:
    """Escapes string for regex usage."""
    return re.escape(val)

def _learn_anchors_for_field(field_key: str, value: Any, ocr_text: str) -> Optional[Dict[str, Any]]:
    """
    Finds preceding anchor keyword or regex pattern for a field value in OCR text.
    """
    if not value or not ocr_text:
        return None
    
    val_str = str(value).strip()
    if not val_str:
        return None
    
    # Escape special regex characters in value
    val_esc = re.escape(val_str)
    
    # Look for value in OCR text
    ocr_lines = ocr_text.split("\n")
    for line in ocr_lines:
        line_strip = line.strip()
        if val_str in line_strip:
            # We found the line containing our value. Let's extract preceding text as the anchor keyword
            parts = line_strip.split(val_str, 1)
            prefix = parts[0].strip()
            
            # If prefix is too long, take the last few words
            if len(prefix) > 30:
                prefix = " ".join(prefix.split()[-3:])
                
            # If prefix exists, we can use it as anchor keyword
            if prefix:
                # Standardize common symbols
                prefix_clean = re.sub(r'[^a-zA-Z0-9\s\:\#\-]', '', prefix).strip()
                if prefix_clean:
                    return {
                        "anchor": prefix_clean,
                        "regex": f"{re.escape(prefix_clean)}\\s*[:\\-\\#\\s]*\\s*([^\\n\\r\\t\\s]+)" if field_key in ("invoice_number", "vendor_gstin") else f"{re.escape(prefix_clean)}\\s*[:\\-\\#\\s]*\\s*([\\d\\,\\.\\-\\s\\/]+)"
                    }
                    
    # Fallback to general patterns if no line match
    if field_key == "vendor_gstin":
        return {"regex": r"\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b"}
    elif field_key == "invoice_date":
        return {"regex": r"\b\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\b"}
        
    return None

async def learn_template(
    contents: bytes,
    filename: str,
    doc_type: str,
    extracted_json: dict,
    ocr_text: str
) -> Optional[dict]:
    """
    Automatically creates a document template if extraction confidence is high
    and a duplicate template does not already exist.
    """
    try:
        # Check confidence and required fields
        confidence = float(extracted_json.get("confidence", 1.0) or 1.0)
        if confidence < 0.80:
            logger.info("Template Miss: Extraction confidence too low to learn template")
            return None

        layout_sig = analyze_layout(contents, filename)
        
        # Check if matching template already exists to avoid duplication
        existing = await find_matching_template(contents, filename, ocr_text)
        if existing:
            logger.info("Template Miss: Matching layout already learned")
            return existing

        vendor_name = extracted_json.get("vendor_or_customer_name") or extracted_json.get("vendor_name") or ""
        vendor_gstin = extracted_json.get("tax_registration_number") or extracted_json.get("vendor_gstin") or ""
        
        # Version control: support multiple versions for same vendor if layout changed
        latest_version = 1
        if vendor_gstin:
            vendor_templates = await db.template_library.find({
                "vendor_gstin": vendor_gstin,
                "is_active": True
            }).to_list(length=10)
            if vendor_templates:
                latest_version = max(vt.get("template_version", 1) for vt in vendor_templates) + 1
                logger.info(f"Template Version Created: Version {latest_version} for vendor GSTIN {vendor_gstin}")

        # Build learned anchor mappings for key fields
        field_positions = {}
        for k in ["vendor_name", "vendor_gstin", "invoice_number", "invoice_date", "invoice_total", "taxable_amount", "gst_amount"]:
            val = extracted_json.get(k) or extracted_json.get({
                "vendor_name": "vendor_or_customer_name",
                "vendor_gstin": "tax_registration_number",
                "invoice_number": "invoice_number",
                "invoice_date": "invoice_date",
                "invoice_total": "total_invoice_value",
                "taxable_amount": "taxable_value",
                "gst_amount": "total_tax"
            }.get(k, k))
            
            anchor_info = _learn_anchors_for_field(k, val, ocr_text)
            if anchor_info:
                field_positions[k] = anchor_info

        # Extract keywords for matching (first line headers or prominent content words)
        header_kws = []
        footer_kws = []
        if ocr_text:
            lines = [l.strip() for l in ocr_text.split("\n") if l.strip()]
            if lines:
                # Top header lines (first 5)
                for l in lines[:5]:
                    words = [w for w in re.sub(r'[^a-zA-Z\s]', '', l).split() if len(w) > 3]
                    header_kws.extend(words[:3])
                # Bottom footer lines (last 5)
                for l in lines[-5:]:
                    words = [w for w in re.sub(r'[^a-zA-Z\s]', '', l).split() if len(w) > 3]
                    footer_kws.extend(words[:3])

        template_id = str(uuid.uuid4())
        new_template = {
            "template_id": template_id,
            "document_type": doc_type,
            "vendor_name": vendor_name,
            "vendor_gstin": vendor_gstin,
            "template_name": f"{doc_type} Template - {vendor_name or 'Unknown Vendor'}",
            "template_version": latest_version,
            "page_count": layout_sig.get("page_count", 1),
            "page_size": layout_sig.get("page_size", "A4"),
            "header_keywords": list(set(header_kws))[:8],
            "footer_keywords": list(set(footer_kws))[:8],
            "logo_hash": "",
            "layout_signature": layout_sig,
            "table_structure": {},
            "field_positions": field_positions,
            "column_structure": {},
            "sample_values": extracted_json,
            "confidence": confidence,
            "times_used": 0,
            "last_used": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system",
            "is_active": True
        }

        await save_template(new_template)
        logger.info(f"Template Created")
        return new_template
    except Exception as exc:
        logger.error(f"Error in learn_template: {exc}", exc_info=True)
    return None

def extract_using_template(template: dict, ocr_text: str) -> dict:
    """
    Extracts structured fields from raw OCR text using stored template field anchors/regexes.
    Bypasses any Gemini/Groq calls completely.
    """
    logger.info(f"Extracting using template: {template.get('template_id')}")
    
    # Start with template's baseline/sample format
    baseline = dict(template.get("sample_values", {}))
    
    # Overwrite dynamic fields using layout anchors/regex patterns
    field_positions = template.get("field_positions", {})
    for field_key, anchor_info in field_positions.items():
        pattern = anchor_info.get("regex")
        if pattern:
            try:
                match = re.search(pattern, ocr_text, re.IGNORECASE)
                if match:
                    extracted_val = match.group(1).strip()
                    # Clean punctuation or currency symbols from totals/amounts
                    if field_key in ["invoice_total", "taxable_amount", "gst_amount"]:
                        extracted_val = re.sub(r'[^\d\.]', '', extracted_val)
                        try:
                            extracted_val = float(extracted_val)
                        except ValueError:
                            pass
                    
                    # Map back to correct standard JSON keys
                    target_key = {
                        "vendor_name": "vendor_or_customer_name",
                        "vendor_gstin": "tax_registration_number",
                        "invoice_number": "invoice_number",
                        "invoice_date": "invoice_date",
                        "invoice_total": "total_invoice_value",
                        "taxable_amount": "taxable_value",
                        "gst_amount": "total_tax"
                    }.get(field_key, field_key)
                    
                    baseline[target_key] = extracted_val
            except Exception:
                pass
                
    baseline["template_matched_id"] = template["template_id"]
    baseline["extraction_method"] = "template"
    return baseline

async def update_template_learning(template_id: str, updates: dict) -> None:
    """
    Updates stored template details.
    """
    await update_template(template_id, updates)
