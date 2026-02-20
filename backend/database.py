from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

logger = logging.getLogger(__name__)

try:
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    logger.info("Successfully connected to MongoDB")
except KeyError as e:
    logger.error(f"Missing environment variable: {e}")
    raise RuntimeError(f"Missing env var: {e}")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {str(e)}")
    raise RuntimeError(f"DB connection failed: {str(e)}")
