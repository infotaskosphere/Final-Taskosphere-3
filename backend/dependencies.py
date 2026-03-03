import os
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
# ✅ CHANGE 1: Imported AuditLog to prevent NameError
from backend.models import User, AuditLog
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
# SAFE DT
# ==========================================================

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

# ✅ CHANGE 2: Moved get_current_user BEFORE check_permission
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
# PERMISSION CHECK
# ==========================================================

# ✅ CHANGE 3: Updated logic to handle Pydantic Permission Model
def check_permission(required_permission: str):
    async def permission_checker(
        current_user: User = Depends(get_current_user)
    ):
        # Optional: Admin override (prevents lockout)
        if current_user.role.lower() == "admin":
            return current_user

        # Get permissions object (Pydantic model)
        perms = getattr(current_user, "permissions", None)
        has_perm = False

        if perms:
            # If it's the new Pydantic model, check the attribute directly
            if hasattr(perms, "model_dump"):
                has_perm = getattr(perms, required_permission, False)
            # Fallback for dictionary (if data hasn't migrated)
            elif isinstance(perms, dict):
                has_perm = perms.get(required_permission, False)
            # Fallback for old list style
            elif isinstance(perms, list):
                has_perm = required_permission in perms

        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {required_permission} required",
            )

        return current_user

    return permission_checker

# ==========================================================
# AUDIT LOG
# ==========================================================

async def create_audit_log(
    current_user: User,
    action: str,
    module: str,
    record_id: str,
    old_data: dict = None,
    new_data: dict = None
):
    # ✅ CHANGE 4: AuditLog class is now correctly imported
    log = AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action=action,
        module=module,
        record_id=record_id,
        old_data=old_data,
        new_data=new_data
    )

    doc = log.model_dump()

    # Ensure proper datetime format for Mongo
    if isinstance(doc.get("timestamp"), datetime):
        doc["timestamp"] = doc["timestamp"]

    await db.audit_logs.insert_one(doc)
