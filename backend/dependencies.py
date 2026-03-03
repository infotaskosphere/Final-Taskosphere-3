import os
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from backend.models import User
import uuid

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
# PERMISSION CHECK
# ==========================================================

def check_permission(permission: str):
    async def permission_checker(
        current_user = Depends(get_current_user)
    ):
        # If your User model has permissions attribute
        user_permissions = getattr(current_user, "permissions", [])

        if permission not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )

        return current_user

    return permission_checker

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

#===========================================================
# SAFE DT
#===========================================================

def safe_dt(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value

    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None

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

   
    user_dict.pop("_id", None)

    return User(**user_dict)
    
# ==========================================================
# AUDIT LOG
# ==========================================================

async def create_audit_log(
    current_user,
    action: str,
    module: str,
    record_id: str = None,
    old_data: dict = None,
    new_data: dict = None,
):
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "user_name": getattr(current_user, "full_name", None),
            "action": action,
            "module": module,
            "record_id": record_id,
            "old_data": old_data,
            "new_data": new_data,
            "timestamp": datetime.now(timezone.utc),
        })
    except Exception as e:
        print("Audit log error:", e)
