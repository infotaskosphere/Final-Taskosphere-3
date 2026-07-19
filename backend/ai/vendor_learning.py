import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.dependencies import db
from backend.ai.vendor_profile import create_default_vendor_profile, VendorProfileModel
from backend.ai.vendor_storage import (
    save_vendor_profile,
    update_vendor_profile as db_update_profile,
    get_vendor_profile as db_get_profile,
    log_learning_event
)
from backend.ai.vendor_mapper import find_best_vendor_match, extract_pan_from_gstin
from backend.ai.vendor_rules import apply_rules_to_profile

logger = logging.getLogger("vendor_learning")

# Simple in-memory cache to cache frequently accessed profiles as requested
_PROFILE_CACHE: Dict[str, Dict[str, Any]] = {}

def calculate_vendor_confidence(profile: Dict[str, Any]) -> float:
    """
    Calculates a confidence score based on times processed vs manual corrections count.
    """
    times = max(profile.get("times_processed", 0), 1)
    corrections = profile.get("manual_corrections_count", 0)
    
    # Confidence is baseline of 0.70, grows with experience, and degrades with manual corrections
    base_confidence = 0.70 + min(0.30, times * 0.05)
    correction_penalty = (corrections / times) * 0.40
    
    score = max(0.50, min(1.0, base_confidence - correction_penalty))
    return round(score, 2)

async def learn_vendor_profile(
    vendor_name: str,
    gstin: str,
    doc_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Finds or creates a vendor profile and learns patterns from a processed invoice/document.
    """
    if not vendor_name:
        return {}

    try:
        profile, score, match_reason = await find_best_vendor_match(vendor_name, gstin)
        now_str = datetime.now(timezone.utc).isoformat()
        
        # Determine taxonomy fields
        doc_type = doc_data.get("document_type") or "PURCHASE"
        amount = float(doc_data.get("total_invoice_value") or doc_data.get("amount") or 0.0)
        currency = doc_data.get("currency") or "INR"
        tax_rate = doc_data.get("tax_rate") or 0.0
        hsn_sac = doc_data.get("hsn_sac") or ""
        bank_account = doc_data.get("bank_account") or ""

        if not profile:
            # Create a new profile
            profile = create_default_vendor_profile(vendor_name, gstin)
            profile["pan"] = extract_pan_from_gstin(gstin) if gstin else ""
            profile["times_processed"] = 1
            profile["last_processed"] = now_str
            profile["currency"] = currency
            profile["average_invoice_amount"] = amount
            if doc_type not in profile["document_types_seen"]:
                profile["document_types_seen"].append(doc_type)
            if tax_rate and tax_rate not in profile["typical_tax_rates"]:
                profile["typical_tax_rates"].append(tax_rate)
            if hsn_sac and hsn_sac not in profile["frequently_used_hsn_sac"]:
                profile["frequently_used_hsn_sac"].append(hsn_sac)
            if bank_account and bank_account not in profile["common_bank_accounts"]:
                profile["common_bank_accounts"].append(bank_account)
                
            profile["confidence_score"] = calculate_vendor_confidence(profile)
            await save_vendor_profile(profile)
            await log_learning_event(profile["vendor_id"], "Profile Created", {"reason": "Initial extraction", "match_reason": match_reason})
        else:
            # Update existing profile
            times = profile.get("times_processed", 0) + 1
            avg_amount = profile.get("average_invoice_amount", 0.0)
            new_avg = ((avg_amount * (times - 1)) + amount) / times
            
            updates = {
                "times_processed": times,
                "last_processed": now_str,
                "average_invoice_amount": round(new_avg, 2),
                "currency": currency or profile.get("currency")
            }
            
            # Append unseen types, tax rates, hsn/sac codes, bank accounts
            doc_types = list(profile.get("document_types_seen") or [])
            if doc_type and doc_type not in doc_types:
                doc_types.append(doc_type)
                updates["document_types_seen"] = doc_types
                
            tax_rates = list(profile.get("typical_tax_rates") or [])
            if tax_rate and tax_rate not in tax_rates:
                tax_rates.append(tax_rate)
                updates["typical_tax_rates"] = tax_rates
                
            hsn_sacs = list(profile.get("frequently_used_hsn_sac") or [])
            if hsn_sac and hsn_sac not in hsn_sacs:
                hsn_sacs.append(hsn_sac)
                updates["frequently_used_hsn_sac"] = hsn_sacs
                
            bank_accs = list(profile.get("common_bank_accounts") or [])
            if bank_account and bank_account not in bank_accs:
                bank_accs.append(bank_account)
                updates["common_bank_accounts"] = bank_accs

            # Set GSTIN if it was previously empty
            if gstin and not profile.get("gstin"):
                updates["gstin"] = gstin.upper().strip()
                updates["pan"] = extract_pan_from_gstin(gstin)

            profile.update(updates)
            profile["confidence_score"] = calculate_vendor_confidence(profile)
            updates["confidence_score"] = profile["confidence_score"]
            
            await db_update_profile(profile["vendor_id"], updates)
            await log_learning_event(profile["vendor_id"], "Profile Learned Update", {"times_processed": times})

        # Clear cache for this vendor ID
        _PROFILE_CACHE.pop(profile["vendor_id"], None)
        return profile
    except Exception as exc:
        logger.error(f"Error in learn_vendor_profile: {exc}", exc_info=True)
        return {}

async def get_vendor_profile(vendor_id: str) -> Optional[Dict[str, Any]]:
    """
    Gets a vendor profile, checks cache first. Applies current rules dynamically.
    """
    if vendor_id in _PROFILE_CACHE:
        return _PROFILE_CACHE[vendor_id]
        
    profile = await db_get_profile(vendor_id)
    if profile:
        profile = await apply_rules_to_profile(vendor_id, profile)
        _PROFILE_CACHE[vendor_id] = profile
    return profile

async def update_vendor_profile(vendor_id: str, updates: Dict[str, Any]) -> None:
    """
    Direct update of a profile.
    """
    await db_update_profile(vendor_id, updates)
    _PROFILE_CACHE.pop(vendor_id, None)

async def apply_vendor_defaults(
    vendor_name: str,
    gstin: str,
    doc_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Locates matching vendor profile and applies defaults (e.g., default_ledger, cost_centre, dept)
    to the document data structure.
    """
    try:
        profile, score, match_reason = await find_best_vendor_match(vendor_name, gstin)
        if profile and profile.get("confidence_score", 0.0) >= 0.60:
            profile = await apply_rules_to_profile(profile["vendor_id"], profile)
            
            doc_data["vendor_profile_matched"] = True
            doc_data["vendor_id"] = profile["vendor_id"]
            doc_data["vendor_confidence"] = profile["confidence_score"]
            
            # Apply recommended defaults
            doc_data["default_ledger"] = profile.get("default_ledger")
            doc_data["expense_category"] = profile.get("expense_category")
            doc_data["cost_centre"] = profile.get("cost_centre")
            doc_data["department"] = profile.get("department")
            doc_data["branch"] = profile.get("branch")
            doc_data["preferred_gst_treatment"] = profile.get("preferred_gst_treatment")
            doc_data["preferred_tds_section"] = profile.get("preferred_tds_section")
            doc_data["default_payment_terms"] = profile.get("default_payment_terms")
            
            # Format custom narration
            pattern = profile.get("common_narration_pattern") or "Purchase from {vendor_name}"
            inv_num = doc_data.get("invoice_number") or doc_data.get("invoice_no") or ""
            doc_data["suggested_narration"] = pattern.format(
                vendor_name=profile["vendor_name"],
                invoice_number=inv_num
            )
            logger.info(f"Vendor Defaults Applied: {profile['vendor_name']} (ID: {profile['vendor_id']})")
    except Exception as exc:
        logger.error(f"Error in apply_vendor_defaults: {exc}", exc_info=True)
        
    return doc_data

async def record_manual_correction(
    vendor_name: str,
    gstin: str,
    corrections: Dict[str, Any]
) -> None:
    """
    Logs when a user overrides the suggested Defaults (e.g. changed ledger, GST, TDS).
    Increments manual_corrections_count and adjusts defaults dynamically.
    """
    try:
        profile, score, match_reason = await find_best_vendor_match(vendor_name, gstin)
        if profile:
            corrections_count = profile.get("manual_corrections_count", 0) + 1
            updates: Dict[str, Any] = {
                "manual_corrections_count": corrections_count
            }
            
            # If the user changed ledger, we update the profile's default ledger to reflect their preference
            if "ledger" in corrections or "default_ledger" in corrections:
                new_ledger = corrections.get("ledger") or corrections.get("default_ledger")
                updates["default_ledger"] = new_ledger
                
            if "expense_category" in corrections:
                updates["expense_category"] = corrections["expense_category"]
                
            if "gst_treatment" in corrections:
                updates["preferred_gst_treatment"] = corrections["gst_treatment"]
                
            if "tds_section" in corrections:
                updates["preferred_tds_section"] = corrections["tds_section"]
                
            if "cost_centre" in corrections:
                updates["cost_centre"] = corrections["cost_centre"]
                
            if "department" in corrections:
                updates["department"] = corrections["department"]

            profile.update(updates)
            profile["confidence_score"] = calculate_vendor_confidence(profile)
            updates["confidence_score"] = profile["confidence_score"]
            
            await db_update_profile(profile["vendor_id"], updates)
            await log_learning_event(
                profile["vendor_id"],
                "Manual Correction Recorded",
                {"corrections": corrections, "new_confidence": profile["confidence_score"]}
            )
            _PROFILE_CACHE.pop(profile["vendor_id"], None)
            logger.info(f"Manual Correction Recorded and updated vendor: {profile['vendor_name']}")
    except Exception as exc:
        logger.error(f"Error in record_manual_correction: {exc}", exc_info=True)

async def merge_vendor_profiles(profile1_id: str, profile2_id: str) -> Optional[str]:
    """
    Merges duplicate vendor profiles. Keeps profile1 as primary, moves counts/data from profile2,
    then archives profile2.
    """
    try:
        p1 = await db_get_profile(profile1_id)
        p2 = await db_get_profile(profile2_id)
        if not p1 or not p2:
            return None
            
        times = p1.get("times_processed", 0) + p2.get("times_processed", 0)
        corrections = p1.get("manual_corrections_count", 0) + p2.get("manual_corrections_count", 0)
        
        avg_amt1 = p1.get("average_invoice_amount", 0.0)
        avg_amt2 = p2.get("average_invoice_amount", 0.0)
        merged_avg = ((avg_amt1 * p1.get("times_processed", 0)) + (avg_amt2 * p2.get("times_processed", 0))) / max(times, 1)
        
        updates = {
            "times_processed": times,
            "manual_corrections_count": corrections,
            "average_invoice_amount": round(merged_avg, 2),
            "document_types_seen": list(set((p1.get("document_types_seen") or []) + (p2.get("document_types_seen") or []))),
            "typical_tax_rates": list(set((p1.get("typical_tax_rates") or []) + (p2.get("typical_tax_rates") or []))),
            "frequently_used_hsn_sac": list(set((p1.get("frequently_used_hsn_sac") or []) + (p2.get("frequently_used_hsn_sac") or []))),
            "common_bank_accounts": list(set((p1.get("common_bank_accounts") or []) + (p2.get("common_bank_accounts") or [])))
        }
        
        p1.update(updates)
        p1["confidence_score"] = calculate_vendor_confidence(p1)
        updates["confidence_score"] = p1["confidence_score"]
        
        await db_update_profile(profile1_id, updates)
        await db_update_profile(profile2_id, {"status": "Archived"})
        
        _PROFILE_CACHE.pop(profile1_id, None)
        _PROFILE_CACHE.pop(profile2_id, None)
        
        await log_learning_event(profile1_id, "Profile Merged", {"merged_from_id": profile2_id})
        return profile1_id
    except Exception as exc:
        logger.error(f"Error merging vendor profiles: {exc}", exc_info=True)
        return None

async def archive_vendor_profile(vendor_id: str) -> None:
    """
    Archives a vendor profile.
    """
    await db_update_profile(vendor_id, {"status": "Archived"})
    _PROFILE_CACHE.pop(vendor_id, None)
    logger.info(f"Vendor Profile Archived: {vendor_id}")
