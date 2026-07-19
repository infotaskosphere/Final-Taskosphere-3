import re
import logging
from typing import Any, Dict, List, Optional, Tuple
from backend.dependencies import db
from backend.ai.vendor_storage import find_vendor_profile_by_gstin

logger = logging.getLogger("vendor_mapper")

def _normalize_name(name: str) -> str:
    """Normalizes vendor name by stripping suffixes like pvt, ltd, etc."""
    s = (name or "").lower()
    s = re.sub(r"\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|co\.?|company|the|enterprises|traders|industries|corp\.?|corporation)\b", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s

def extract_pan_from_gstin(gstin: str) -> str:
    """Extrcts a 10-character PAN from 15-character GSTIN if valid."""
    gstin = (gstin or "").strip().upper()
    if len(gstin) == 15:
        # Standard GSTIN format: 2-digit state, 10-char PAN, 1-char entity code, 1-char blank, 1-char check digit
        pan = gstin[2:12]
        if re.match(r"^[A-Z]{5}\d{4}[A-Z]$", pan):
            return pan
    return ""

async def find_best_vendor_match(
    vendor_name: str,
    gstin: str = ""
) -> Tuple[Optional[Dict[str, Any]], float, str]:
    """
    Finds the best matching vendor profile.
    Priority: GSTIN > PAN > Normalized Name fuzzy match.
    Returns (profile, score, match_reason)
    """
    gstin = (gstin or "").strip().upper()
    if gstin:
        profile = await find_vendor_profile_by_gstin(gstin)
        if profile:
            logger.info(f"Vendor Match Found (Exact GSTIN: {gstin})")
            return profile, 1.0, "Matched by exact GSTIN"
            
        pan = extract_pan_from_gstin(gstin)
        if pan:
            profile_by_pan = await db.vendor_profiles.find_one({"pan": pan, "status": "Active"}, {"_id": 0})
            if profile_by_pan:
                logger.info(f"Vendor Match Found (PAN: {pan})")
                return profile_by_pan, 0.95, "Matched by PAN extracted from GSTIN"

    normalized_target = _normalize_name(vendor_name)
    if not normalized_target:
        return None, 0.0, "Empty vendor name"

    # Fetch all active profiles for fuzzy matching
    profiles = await db.vendor_profiles.find({"status": "Active"}, {"_id": 0}).to_list(1000)
    best_profile = None
    best_score = 0.0
    
    target_tokens = set(normalized_target.split())
    
    for p in profiles:
        p_norm = _normalize_name(p.get("vendor_name", ""))
        if not p_norm:
            continue
            
        if p_norm == normalized_target:
            return p, 1.0, "Exact vendor name match"
            
        # Token overlap Jaccard-like distance
        p_tokens = set(p_norm.split())
        overlap = len(target_tokens & p_tokens)
        union = len(target_tokens | p_tokens) or 1
        score = overlap / union
        
        if normalized_target in p_norm or p_norm in normalized_target:
            score = max(score, 0.85)
            
        if score > best_score:
            best_score = score
            best_profile = p

    if best_score >= 0.70:
        logger.info(f"Vendor Match Found (Fuzzy Name match score: {best_score:.2f})")
        return best_profile, best_score, f"Fuzzy name match (score: {best_score:.2f})"

    return None, 0.0, "No confident match found"

async def lookup_vendor_from_ocr(raw_ocr_text: str) -> Optional[Dict[str, Any]]:
    """
    Scans raw OCR text for known GSTINs or normalized vendor names to perform vendor lookup.
    """
    if not raw_ocr_text:
        return None
        
    try:
        # 1. Scan for any 15-digit GSTINs in raw text
        gstins = re.findall(r"\b\d{2}[A-Z]{5}\d{4}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b", raw_ocr_text, re.I)
        for g in gstins:
            profile = await find_vendor_profile_by_gstin(g.upper())
            if profile:
                logger.info(f"OCR Lookup: Matched vendor by GSTIN {g} in text")
                return profile
                
        # 2. Match by normalized name inside raw_ocr_text
        profiles = await db.vendor_profiles.find({"status": "Active"}, {"_id": 0}).to_list(1000)
        for p in profiles:
            name = p.get("vendor_name", "")
            norm = _normalize_name(name)
            if norm and norm in raw_ocr_text.lower():
                logger.info(f"OCR Lookup: Matched vendor by name '{name}' in text")
                return p
    except Exception as e:
        logger.error(f"Error in lookup_vendor_from_ocr: {e}", exc_info=True)
        
    return None

