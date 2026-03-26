import asyncio
import logging
from backend.dependencies import client

logger = logging.getLogger(__name__)

async def startup_event():
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=5)
        logger.info("MongoDB connected successfully")
    except Exception as e:
        logger.error(f"Startup failed: {e}")
