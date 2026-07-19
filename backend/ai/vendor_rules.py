import logging
from typing import Any, Dict, Optional
from datetime import datetime, timezone
from backend.ai.vendor_storage import get_rule_overrides, set_rule_override

logger = logging.getLogger("vendor_rules")

# Default system rules (fallback when no overrides exist)
DEFAULT_RULES = {
    "preferred_expense_ledger": "5250",  # Default to Software & Cloud
    "default_gst_applicability": "Regular",
    "tds_requirements": "194C",
    "default_cost_centre": "General",
    "department_mapping": "Operations",
    "payment_term_defaults": "Net 30",
    "narration_templates": "Purchase from {vendor_name} - Inv {invoice_number}"
}

async def apply_rules_to_profile(vendor_id: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Applies overrides/rules on top of a vendor profile.
    Merges profile with overrides stored in vendor_rule_overrides.
    """
    try:
        overrides = await get_rule_overrides(vendor_id)
        
        # Apply specific overrides to relevant fields
        if "preferred_expense_ledger" in overrides:
            profile["default_ledger"] = overrides["preferred_expense_ledger"]
            
        if "default_gst_applicability" in overrides:
            profile["preferred_gst_treatment"] = overrides["default_gst_applicability"]
            
        if "tds_requirements" in overrides:
            profile["preferred_tds_section"] = overrides["tds_requirements"]
            
        if "default_cost_centre" in overrides:
            profile["cost_centre"] = overrides["default_cost_centre"]
            
        if "department_mapping" in overrides:
            profile["department"] = overrides["department_mapping"]
            
        if "payment_term_defaults" in overrides:
            profile["default_payment_terms"] = overrides["payment_term_defaults"]
            
        if "narration_templates" in overrides:
            profile["common_narration_pattern"] = overrides["narration_templates"]
            
    except Exception as e:
        logger.error(f"Error applying rules to vendor profile: {e}", exc_info=True)
        
    return profile

async def save_rule_override(vendor_id: str, rule_key: str, rule_value: Any, updated_by: str = "system") -> None:
    """
    Saves a configurable and versioned rule override for a vendor.
    """
    if rule_key not in DEFAULT_RULES:
        logger.warning(f"Unknown rule key configured: {rule_key}")
    await set_rule_override(vendor_id, rule_key, rule_value, updated_by)
