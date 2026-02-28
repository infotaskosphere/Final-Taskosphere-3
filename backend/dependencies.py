import os
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

# ==========================================================
# DATABASE
# ==========================================================

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "taskosphere")

if not MONGO_URL:
    raise Exception("MONGO_URL is not set")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ==========================================================
# AUTH CONFIG
# ==========================================================

JWT_SECRET = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

if not JWT_SECRET:
    raise Exception("JWT_SECRET is not set")

security = HTTPBearer()

# ==========================================================
# TOKEN CREATION
# ==========================================================

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

# ==========================================================
# AUTH DEPENDENCY
# ==========================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
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

    user_dict = await db.users.find_one({"id": user_id})

    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Import inside function to avoid circular import
    from backend.server import User

    user_dict.pop("_id", None)

    return User(**user_dict)
