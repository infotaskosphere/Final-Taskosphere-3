from typing import Dict, Any, List, Optional
import logging
from backend.gst_ai.gst_storage import GSTStorage

logger = logging.getLogger("gst_rules")

DEFAULT_TAX_RATES = [
    {"hsn_sac": "default", "cgst_rate": 9.0, "sgst_rate": 9.0, "igst_rate": 18.0, "cess_rate": 0.0, "is_active": True},
    {"hsn_sac": "goods_5", "cgst_rate": 2.5, "sgst_rate": 2.5, "igst_rate": 5.0, "cess_rate": 0.0, "is_active": True},
    {"hsn_sac": "goods_12", "cgst_rate": 6.0, "sgst_rate": 6.0, "igst_rate": 12.0, "cess_rate": 0.0, "is_active": True},
    {"hsn_sac": "goods_18", "cgst_rate": 9.0, "sgst_rate": 9.0, "igst_rate": 18.0, "cess_rate": 0.0, "is_active": True},
    {"hsn_sac": "goods_28", "cgst_rate": 14.0, "sgst_rate": 14.0, "igst_rate": 28.0, "cess_rate": 15.0, "is_active": True},
    {"hsn_sac": "services_18", "cgst_rate": 9.0, "sgst_rate": 9.0, "igst_rate": 18.0, "cess_rate": 0.0, "is_active": True},
    {"hsn_sac": "exempt", "cgst_rate": 0.0, "sgst_rate": 0.0, "igst_rate": 0.0, "cess_rate": 0.0, "is_active": True}
]

DEFAULT_RCM_RULES = [
    {"rule_id": "rcm_goods_cashew", "description": "Cashew nuts, not shelled or peeled", "hsn_sac": "0801", "rcm_applicable": True, "category": "goods"},
    {"rule_id": "rcm_services_gta", "description": "Goods Transport Agency services", "hsn_sac": "9965", "rcm_applicable": True, "category": "services"},
    {"rule_id": "rcm_services_legal", "description": "Legal services by Advocate/Firm", "hsn_sac": "9982", "rcm_applicable": True, "category": "services"},
    {"rule_id": "rcm_services_sponsor", "description": "Sponsorship services", "hsn_sac": "9983", "rcm_applicable": True, "category": "services"}
]

DEFAULT_ITC_RULES = [
    {"rule_id": "itc_eligible_default", "category": "general_inputs", "is_blocked": False, "eligible_pct": 100.0, "description": "General inputs and services"},
    {"rule_id": "itc_blocked_motor_vehicles", "category": "motor_vehicles", "is_blocked": True, "eligible_pct": 0.0, "description": "Motor vehicles for passenger transport under 13 capacity"},
    {"rule_id": "itc_blocked_food_beverages", "category": "food_beverages", "is_blocked": True, "eligible_pct": 0.0, "description": "Food and beverages, catering, beauty treatment"},
    {"rule_id": "itc_blocked_club_membership", "category": "memberships", "is_blocked": True, "eligible_pct": 0.0, "description": "Club memberships, health and fitness centre"}
]

DEFAULT_POS_RULES = [
    {"rule_id": "pos_goods_default", "type": "goods", "rule_logic": "Location of goods at the time of delivery"},
    {"rule_id": "pos_services_immovable", "type": "services_immovable", "rule_logic": "Location where the immovable property is located"},
    {"rule_id": "pos_services_default_b2b", "type": "services_b2b", "rule_logic": "Location of the registered recipient"}
]

class GSTRulesManager:
    _cache: Dict[str, Any] = {}

    @classmethod
    async def load_and_cache_rules(cls) -> None:
        """Loads and caches GST rules from storage, seeding defaults if empty."""
        try:
            stored_rules = await GSTStorage.get_rules({})
            if not stored_rules:
                logger.info("No GST rules found in DB. Seeding defaults.")
                # Seed defaults
                for rate in DEFAULT_TAX_RATES:
                    await GSTStorage.save_rule({"type": "tax_rate", "key": rate["hsn_sac"], "value": rate})
                for rcm in DEFAULT_RCM_RULES:
                    await GSTStorage.save_rule({"type": "rcm_rule", "key": rcm["rule_id"], "value": rcm})
                for itc in DEFAULT_ITC_RULES:
                    await GSTStorage.save_rule({"type": "itc_rule", "key": itc["rule_id"], "value": itc})
                for pos in DEFAULT_POS_RULES:
                    await GSTStorage.save_rule({"type": "pos_rule", "key": pos["rule_id"], "value": pos})
                stored_rules = await GSTStorage.get_rules({})

            # Rebuild cache
            cls._cache = {
                "tax_rates": {},
                "rcm_rules": {},
                "itc_rules": {},
                "pos_rules": {}
            }
            for r in stored_rules:
                rtype = r.get("type")
                rkey = r.get("key")
                rval = r.get("value")
                if rtype == "tax_rate":
                    cls._cache["tax_rates"][rkey] = rval
                elif rtype == "rcm_rule":
                    cls._cache["rcm_rules"][rkey] = rval
                elif rtype == "itc_rule":
                    cls._cache["itc_rules"][rkey] = rval
                elif rtype == "pos_rule":
                    cls._cache["pos_rules"][rkey] = rval

            logger.info("GST rules successfully loaded into memory cache.")
        except Exception as e:
            logger.error(f"Failed to load/cache GST rules: {e}", exc_info=True)

    @classmethod
    async def get_tax_rate(cls, hsn_sac: str) -> Dict[str, float]:
        """Gets the applicable tax rate for a given HSN/SAC code."""
        if not cls._cache:
            await cls.load_and_cache_rules()
        rates_cache = cls._cache.get("tax_rates", {})
        
        # Exact match or prefix match or fallback
        match = rates_cache.get(hsn_sac)
        if not match:
            # prefix matching e.g., if HSN starts with goods_18
            for k, val in rates_cache.items():
                if hsn_sac.startswith(k):
                    return val
            # global default
            match = rates_cache.get("default") or {
                "cgst_rate": 9.0, "sgst_rate": 9.0, "igst_rate": 18.0, "cess_rate": 0.0
            }
        return match

    @classmethod
    async def get_rcm_applicable(cls, hsn_sac: str) -> bool:
        """Check if RCM is applicable based on HSN/SAC."""
        if not cls._cache:
            await cls.load_and_cache_rules()
        rcm_rules = cls._cache.get("rcm_rules", {})
        for rule in rcm_rules.values():
            if hsn_sac.startswith(rule.get("hsn_sac", "")):
                return rule.get("rcm_applicable", False)
        return False

    @classmethod
    async def get_itc_rule(cls, category: str) -> Dict[str, Any]:
        """Gets ITC eligibility rules for a specific category."""
        if not cls._cache:
            await cls.load_and_cache_rules()
        itc_rules = cls._cache.get("itc_rules", {})
        for rule in itc_rules.values():
            if rule.get("category") == category:
                return rule
        return {"is_blocked": False, "eligible_pct": 100.0, "description": "Standard input credit"}

    @classmethod
    async def save_custom_rule(cls, rule_type: str, key: str, value: Dict[str, Any]) -> str:
        """Saves a custom or statutory rule and refreshes the cache."""
        rule_id = await GSTStorage.save_rule({"type": rule_type, "key": key, "value": value})
        await cls.load_and_cache_rules()
        return rule_id

    @classmethod
    async def delete_rule(cls, rule_id: str) -> bool:
        """Deletes a rule and refreshes cache."""
        success = await GSTStorage.delete_rule(rule_id)
        if success:
            await cls.load_and_cache_rules()
        return success
