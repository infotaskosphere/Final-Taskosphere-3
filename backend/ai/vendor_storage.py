import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.dependencies import db

logger = logging.getLogger("vendor_storage")

async def init_vendor_indexes():
    """
    Initializes indexes on the vendor collections.
    """
    try:
        await db.vendor_profiles.create_index("vendor_id", unique=True)
        await db.vendor_profiles.create_index("gstin")
        await db.vendor_profiles.create_index("vendor_name")
        await db.vendor_rule_overrides.create_index([("vendor_id", 1), ("rule_key", 1)], unique=True)
        logger.info("Vendor intelligence MongoDB indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing vendor intelligence indexes: {e}", exc_info=True)

async def save_vendor_profile(profile: Dict[str, Any]) -> None:
    """
    Saves a new vendor profile.
    """
    try:
        profile["created_at"] = datetime.now(timezone.utc).isoformat()
        profile["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.vendor_profiles.insert_one(profile)
        logger.info(f"Vendor Profile Created: {profile.get('vendor_name')} (ID: {profile.get('vendor_id')})")
    except Exception as e:
        logger.error(f"Failed to save vendor profile: {e}", exc_info=True)

async def update_vendor_profile(vendor_id: str, updates: Dict[str, Any]) -> None:
    """
    Updates an existing vendor profile.
    """
    try:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.vendor_profiles.update_one(
            {"vendor_id": vendor_id},
            {"$set": updates, "$inc": {"version": 1}}
        )
        logger.info(f"Vendor Profile Updated: {vendor_id}")
    except Exception as e:
        logger.error(f"Failed to update vendor profile: {e}", exc_info=True)

async def get_vendor_profile(vendor_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a vendor profile by vendor_id.
    """
    try:
        return await db.vendor_profiles.find_one({"vendor_id": vendor_id}, {"_id": 0})
    except Exception as e:
        logger.error(f"Failed to get vendor profile: {e}", exc_info=True)
        return None

async def find_vendor_profile_by_gstin(gstin: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a vendor profile by exact GSTIN.
    """
    if not gstin:
        return None
    try:
        return await db.vendor_profiles.find_one({"gstin": gstin.strip().upper(), "status": "Active"}, {"_id": 0})
    except Exception as e:
        logger.error(f"Failed to find vendor profile by GSTIN: {e}", exc_info=True)
        return None

async def find_vendor_profiles_by_name(name: str) -> List[Dict[str, Any]]:
    """
    Finds vendor profiles by prefix/exact name search.
    """
    if not name:
        return []
    try:
        # Simple regex or exact query
        return await db.vendor_profiles.find({
            "vendor_name": {"$regex": f"^{name.strip()}", "$options": "i"},
            "status": "Active"
        }, {"_id": 0}).to_list(100)
    except Exception as e:
        logger.error(f"Failed to find vendor profiles by name: {e}", exc_info=True)
        return []

async def log_learning_event(vendor_id: str, event_type: str, details: Dict[str, Any]) -> None:
    """
    Logs an audit learning history record in vendor_learning_history.
    """
    try:
        record = {
            "vendor_id": vendor_id,
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": details
        }
        await db.vendor_learning_history.insert_one(record)
        logger.info(f"Logged vendor learning event: {event_type} for ID {vendor_id}")
    except Exception as e:
        logger.error(f"Failed to log learning event: {e}", exc_info=True)

async def set_rule_override(vendor_id: str, rule_key: str, rule_value: Any, updated_by: str) -> None:
    """
    Saves or updates a vendor rule override.
    """
    try:
        record = {
            "vendor_id": vendor_id,
            "rule_key": rule_key,
            "rule_value": rule_value,
            "updated_by": updated_by,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.vendor_rule_overrides.replace_one(
            {"vendor_id": vendor_id, "rule_key": rule_key},
            record,
            upsert=True
        )
        logger.info(f"Vendor rule override set: {rule_key} = {rule_value} for vendor {vendor_id}")
    except Exception as e:
        logger.error(f"Failed to set rule override: {e}", exc_info=True)

async def get_rule_overrides(vendor_id: str) -> Dict[str, Any]:
    """
    Retrieves all rule overrides for a vendor.
    """
    try:
        overrides = await db.vendor_rule_overrides.find({"vendor_id": vendor_id}).to_list(500)
        return {o["rule_key"]: o["rule_value"] for o in overrides}
    except Exception as e:
        logger.error(f"Failed to get rule overrides: {e}", exc_info=True)
        return {}
