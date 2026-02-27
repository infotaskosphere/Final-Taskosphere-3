from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends

# Mongo setup
MONGO_URL = "your_mongo_url_here"

client = AsyncIOMotorClient(MONGO_URL)
db = client["taskosphere"]

# move get_current_user function here
from backend.server import get_current_user
