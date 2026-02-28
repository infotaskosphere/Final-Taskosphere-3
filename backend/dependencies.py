import os
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ==========================================================
# DATABASE
# ==========================================================

MONGO_URL = os.getenv("MONGO_URL")

if not MONGO_URL:
    raise Exception("MONGO_URL is not set")

client = AsyncIOMotorClient(MONGO_URL)
# Using the standard db reference from your server file
db = client[os.environ.get('DB_NAME', 'taskosphere')]

# ==========================================================
# AUTHENTICATION
# ==========================================================

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"

if not SECRET_KEY:
    raise Exception("SECRET_KEY is not set")

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Extract user from JWT token and return user model object using UUID string.
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

    # ✅ FIXED: Query by 'id' field (UUID string) instead of '_id' (ObjectId)
    user_dict = await db.users.find_one({"id": user_id})

    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # ✅ CRITICAL: Convert to Pydantic Model via local import
    # This ensures routes can access current_user.role, current_user.id, etc.
    from backend.server import User 
    
    # Clean MongoDB internal field to prevent validation errors
    if "_id" in user_dict:
        user_dict.pop("_id")
        
    return User(**user_dict)
