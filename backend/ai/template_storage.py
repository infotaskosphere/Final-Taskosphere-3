import logging
from datetime import datetime, timezone
from backend.dependencies import db

logger = logging.getLogger("template_storage")

async def save_template(template: dict) -> None:
    """
    Saves a newly learned document template to MongoDB.
    """
    try:
        await db.template_library.insert_one(template)
        logger.info(f"Template Created: {template.get('template_id')} (Type: {template.get('document_type')})")
    except Exception as e:
        logger.error(f"Failed to save template to db: {e}", exc_info=True)

async def update_template(template_id: str, updates: dict) -> None:
    """
    Updates an existing template.
    """
    try:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.template_library.update_one(
            {"template_id": template_id},
            {"$set": updates}
        )
        logger.info(f"Template Updated: {template_id}")
    except Exception as e:
        logger.error(f"Failed to update template: {e}", exc_info=True)

async def get_template(template_id: str) -> dict:
    """
    Retrieves template by ID.
    """
    try:
        return await db.template_library.find_one({"template_id": template_id}, {"_id": 0})
    except Exception as e:
        logger.error(f"Failed to get template: {e}", exc_info=True)
        return None

async def increment_usage(template_id: str, success: bool) -> None:
    """
    Increments times_used and updates last_used.
    Logs usage into template_usage_history.
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        await db.template_library.update_one(
            {"template_id": template_id},
            {
                "$inc": {"times_used": 1},
                "$set": {"last_used": now, "updated_at": now}
            }
        )
        # Log usage history
        history_record = {
            "template_id": template_id,
            "used_at": now,
            "success": success
        }
        await db.template_usage_history.insert_one(history_record)
        logger.info(f"Incremented template usage: {template_id}")
    except Exception as e:
        logger.error(f"Failed to increment template usage: {e}", exc_info=True)

async def archive_template(template_id: str) -> None:
    """
    Deactivates/archives a template.
    """
    try:
        await db.template_library.update_one(
            {"template_id": template_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        logger.info(f"Template Archived: {template_id}")
    except Exception as e:
        logger.error(f"Failed to archive template: {e}", exc_info=True)
