from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends

# your db setup
client = AsyncIOMotorClient("YOUR_MONGO_URL")
db = client["your_database"]

# import your get_current_user from wherever it originally exists
from backend.auth import get_current_user
