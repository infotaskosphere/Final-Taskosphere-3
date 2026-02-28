# backend/dependencies.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError


# ==========================================================
# DATABASE
# ==========================================================

MONGO_URL = os.getenv("MONGO_URL")

if not MONGO_URL:
    raise Exception("MONGO_URL is not set")

client = AsyncIOMotorClient(MONGO_URL)
db = client["taskosphere"]


# ==========================================================
# AUTHENTICATION
# ==========================================================

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"

if not SECRET_KEY:
    raise Exception("SECRET_KEY is not set")

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Extract user from JWT token and return Mongo user document.
    """

    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # 🔥 Convert user_id safely to ObjectId
    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID format",
        )

    # 🔥 Fetch user from database
    user = await db.users.find_one({"_id": object_id})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Optional: convert _id to string for easier usage
    user["_id"] = str(user["_id"])

    return user
