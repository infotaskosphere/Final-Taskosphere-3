import logging
from typing import Any, Dict, Tuple
from backend.dependencies import db

logger = logging.getLogger("template_matcher")

def compare_layout(sig1: Dict[str, Any], sig2: Dict[str, Any]) -> float:
    """
    Compares two layout signatures and returns a score from 0.0 to 1.0.
    """
    if not sig1 or not sig2:
        return 0.0
    
    # Compare file types
    if sig1.get("file_type") != sig2.get("file_type"):
        return 0.0

    # Compare page dimensions (within 5% tolerance)
    dim1 = sig1.get("dimensions", {})
    dim2 = sig2.get("dimensions", {})
    w1, h1 = dim1.get("width", 0.0), dim1.get("height", 0.0)
    w2, h2 = dim2.get("width", 0.0), dim2.get("height", 0.0)

    if w1 > 0 and w2 > 0 and h1 > 0 and h2 > 0:
        w_diff = abs(w1 - w2) / max(w1, w2)
        h_diff = abs(h1 - h2) / max(h1, h2)
        if w_diff > 0.05 or h_diff > 0.05:
            return 0.0  # Mismatched dimensions
    
    score = 1.0
    
    # Compare text blocks (layout structure density)
    tb1 = sig1.get("text_blocks", [])
    tb2 = sig2.get("text_blocks", [])
    if tb1 or tb2:
        match_count = 0
        for b1 in tb1:
            for b2 in tb2:
                # Compare proximity of bounding boxes
                if abs(b1["x0"] - b2["x0"]) < 20 and abs(b1["y0"] - b2["y0"]) < 20:
                    match_count += 1
                    break
        total = max(len(tb1), len(tb2), 1)
        tb_score = match_count / total
        score = score * 0.7 + tb_score * 0.3

    # Compare table positions
    tab1 = sig1.get("table_positions", [])
    tab2 = sig2.get("table_positions", [])
    if tab1 or tab2:
        table_match = 0
        for t1 in tab1:
            for t2 in tab2:
                if abs(t1["x0"] - t2["x0"]) < 30 and abs(t1["y0"] - t2["y0"]) < 30:
                    table_match += 1
                    break
        total_tab = max(len(tab1), len(tab2), 1)
        tab_score = table_match / total_tab
        score = score * 0.8 + tab_score * 0.2

    return round(score, 3)

def compare_keywords(text: str, keywords: list) -> float:
    """
    Compares layout-specific or header/footer keywords with extracted OCR text.
    Returns percentage of keywords found.
    """
    if not keywords or not text:
        return 0.0
    
    text_lower = text.lower()
    found = 0
    for kw in keywords:
        if kw.lower() in text_lower:
            found += 1
    
    return round(found / len(keywords), 3)

def compare_logo(logo1: Dict[str, Any], logo2: Dict[str, Any]) -> float:
    """
    Compares logo bounding box positions if available.
    """
    if not logo1 or not logo2:
        return 1.0  # neutral if logos are not specified/present
    
    x_diff = abs(logo1.get("x0", 0) - logo2.get("x0", 0))
    y_diff = abs(logo1.get("y0", 0) - logo2.get("y0", 0))
    
    if x_diff < 15 and y_diff < 15:
        return 1.0
    elif x_diff < 50 and y_diff < 50:
        return 0.6
    return 0.0

def calculate_template_score(
    layout_score: float,
    keyword_score: float,
    logo_score: float,
    vendor_match: bool
) -> float:
    """
    Combines layout score, keyword score, logo, and vendor metadata match
    to produce a final score between 0.0 and 1.0.
    """
    # Weight: layout (45%), keywords (35%), logo/vendor (20%)
    weight_layout = 0.45
    weight_keywords = 0.35
    weight_logo_vendor = 0.20

    vendor_score = 1.0 if vendor_match else 0.0
    logo_vendor_score = (logo_score * 0.3) + (vendor_score * 0.7)

    final_score = (layout_score * weight_layout) + (keyword_score * weight_keywords) + (logo_vendor_score * weight_logo_vendor)
    return round(final_score, 3)

async def find_best_template(
    layout_signature: Dict[str, Any],
    filename: str,
    ocr_text: str = ""
) -> Tuple[Any, float, float, str]:
    """
    Queries active templates from template_library and scores them against
    the current layout signature and extracted OCR text.
    Returns (best_template, match_score, confidence, reason)
    """
    logger.info("Template Search Started")
    
    # Try exact layout_signature_hash matching first as a fast path
    hash_signature = layout_signature.get("layout_signature_hash")
    if hash_signature:
        exact_match = await db.template_library.find_one({
            "layout_signature.layout_signature_hash": hash_signature,
            "is_active": True
        }, {"_id": 0})
        if exact_match:
            logger.info("Template Match Found (Exact Signature Hash)")
            return exact_match, 1.0, 1.0, "Exact signature hash match found in template library"

    active_templates = await db.template_library.find({"is_active": True}).to_list(length=100)
    if not active_templates:
        logger.info("Template Miss: No templates stored in library")
        return None, 0.0, 0.0, "No active templates available in library"

    best_template = None
    best_score = 0.0
    best_reason = "No template exceeded similarity threshold"

    # Quick extraction of GSTIN / Vendor info from OCR to help vendor match
    current_gstin = ""
    if ocr_text:
        import re
        gstin_re = re.compile(r'\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b', re.I)
        gstin_match = gstin_re.search(ocr_text)
        if gstin_match:
            current_gstin = gstin_match.group(0).upper()

    for t in active_templates:
        # 1. Compare layout signature
        t_layout = t.get("layout_signature", {})
        layout_score = compare_layout(layout_signature, t_layout)
        
        # 2. Compare keywords
        t_keywords = t.get("header_keywords", []) + t.get("footer_keywords", [])
        keyword_score = compare_keywords(ocr_text, t_keywords) if ocr_text else 0.5
        
        # 3. Compare logo
        logo_score = compare_logo(layout_signature.get("logo_location"), t_layout.get("logo_location"))
        
        # 4. Compare vendor details
        vendor_match = False
        t_gstin = t.get("vendor_gstin")
        if t_gstin and current_gstin and t_gstin.upper() == current_gstin:
            vendor_match = True

        score = calculate_template_score(layout_score, keyword_score, logo_score, vendor_match)
        if score > best_score:
            best_score = score
            best_template = t
            best_reason = f"Layout match score: {layout_score:.2f}, keywords match score: {keyword_score:.2f}, vendor_match: {vendor_match}"

    # Require score threshold of 0.82 to avoid false positives
    threshold = 0.82
    if best_score >= threshold:
        logger.info(f"Template Match Found. Score: {best_score}")
        confidence = best_score
        return best_template, best_score, confidence, best_reason
    else:
        logger.info(f"Template Miss. Highest score was {best_score} which is below threshold {threshold}")
        return None, best_score, 0.0, f"Template match score ({best_score}) was below confidence threshold ({threshold})"
