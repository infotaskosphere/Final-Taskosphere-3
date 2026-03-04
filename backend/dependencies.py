import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from motor.motor_asyncio import AsyncIOMotorClient

# Models – imported inside functions where needed to avoid circular imports
from backend.models import User, AuditLog

# ==========================================================
# ENVIRONMENT & DATABASE
# ==========================================================
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "taskosphere")

if not MONGO_URL:
    raise Exception("MONGO_URL environment variable is not set")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ==========================================================
# JWT / AUTH CONFIG
# ==========================================================
JWT_SECRET = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

if not JWT_SECRET:
    raise Exception("JWT_SECRET environment variable is not set")

security = HTTPBearer()

# ==========================================================
# TOKEN UTILITIES
# ==========================================================
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt

# ==========================================================
# HELPER – SAFE DATETIME CONVERSION
# ==========================================================
def safe_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None

# ==========================================================
# CURRENT USER DEPENDENCY
# ==========================================================
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_dict = await db.users.find_one({"id": user_id})
    if user_dict is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Remove MongoDB _id field
    user_dict.pop("_id", None)

    # Replace empty strings with None (helps Pydantic validation)
    for key, value in list(user_dict.items()):
        if value == "":
            user_dict[key] = None

    try:
        return User(**user_dict)
    except Exception as e:
        # In production → use proper logger
        print(f"User validation failed for {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User profile data is corrupted (check birthday, phone, etc.)"
        )

# ==========================================================
# PERMISSION DEPENDENCY FACTORY
# ==========================================================
def check_permission(required_permission: str):
    async def permission_checker(current_user: User = Depends(get_current_user)) -> User:
        # Admin bypass
        if current_user.role == "admin":
            return current_user

        perms = getattr(current_user, "permissions", None)
        has_permission = False

        if perms:
            if hasattr(perms, "model_dump"):  # Pydantic v2+
                has_permission = getattr(perms, required_permission, False)
            elif isinstance(perms, dict):
                has_permission = perms.get(required_permission, False)
            elif isinstance(perms, list):
                has_permission = required_permission in perms

        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required permission: {required_permission}"
            )

        return current_user

    return permission_checker

# ==========================================================
# ROLE CHECK HELPERS
# ==========================================================
def require_admin():
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        return current_user
    return checker


def require_manager_or_admin():
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in ["admin", "manager"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manager or Admin access required"
            )
        return current_user
    return checker

# ==========================================================
# DATA SCOPE & TEAM HELPERS
# ==========================================================
async def get_team_user_ids(manager_id: str) -> List[str]:
    """
    Returns list of user IDs that this manager should have access to.
    Current naive implementation: all non-admin users except self.

    Recommended improvements:
    • Add manager_id field to User
    • Add department / team field
    • Add explicit team_members array on manager
    """
    users = await db.users.find(
        {"role": {"$ne": "admin"}},
        {"id": 1}
    ).to_list(length=2000)
    return [u["id"] for u in users if u["id"] != manager_id]


async def apply_data_scope(
    current_user: User,
    record_user_field: str = "assigned_to"
) -> Dict[str, Any]:
    """
    Returns MongoDB query filter that implements row-level security based on role.
    Usage example:
        filter_ = await apply_data_scope(current_user, "assigned_to")
        tasks = await db.tasks.find(filter_).to_list(None)
    """
    if current_user.role == "admin":
        return {}

    if current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        return {
            "$or": [
                {record_user_field: current_user.id},
                {record_user_field: {"$in": team_ids}}
            ]
        }

    # Regular user / staff → only own records
    return {record_user_field: current_user.id}

# ==========================================================
# RECORD ACCESS VALIDATION
# ==========================================================
async def verify_record_access(
    current_user: User,
    record_owner_id: str
) -> bool:
    # Admin → always allowed
    if current_user.role == "admin":
        return True

    # Owner access
    if record_owner_id == current_user.id:
        return True

    # Manager → team access
    if current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        if record_owner_id in team_ids:
            return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this resource"
    )

# ==========================================================
# CLIENT ACCESS CONTROL
# ==========================================================
async def verify_client_access(
    current_user: User,
    client_assigned_to: Optional[str]
) -> bool:
    if current_user.role == "admin":
        return True

    # Owner
    if client_assigned_to == current_user.id:
        return True

    # Manager team access
    if current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        if client_assigned_to in team_ids:
            return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access this client"
    )

# ==========================================================
# STAFF ACTIVITY ACCESS
# ==========================================================
async def verify_activity_access(
    current_user: User,
    activity_user_id: str
) -> bool:
    if current_user.role == "admin":
        return True

    if current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        if activity_user_id in team_ids:
            return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to view this activity"
    )

# ==========================================================
# AUDIT LOGGING
# ==========================================================
async def create_audit_log(
    current_user: Any,  # Any → avoids import-time circular issues
    action: str,
    module: str,
    record_id: str,
    old_data: Optional[dict] = None,
    new_data: Optional[dict] = None
) -> None:
    from backend.models import AuditLog  # late import

    log_entry = AuditLog(
        user_id=current_user.id,
        user_name=getattr(current_user, "full_name", "Unknown"),
        action=action,
        module=module,
        record_id=record_id,
        old_data=old_data,
        new_data=new_data,
    )

    await db.audit_logs.insert_one(log_entry.model_dump())
