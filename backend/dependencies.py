from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from motor.motor_asyncio import AsyncIOMotorClient


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
# PERMISSION HELPER
# Safely extract a permission value from a User's permissions
# field regardless of whether it's a Pydantic model or dict.
# ==========================================================
def _get_perm(user: Any, key: str, default: Any = False) -> Any:
    """
    Returns the value of a permission key from current_user.permissions.
    Works for both Pydantic model and dict representations.
    """
    perms = getattr(user, "permissions", None)
    if perms is None:
        return default
    if hasattr(perms, "model_dump"):
        return getattr(perms, key, default)
    if isinstance(perms, dict):
        return perms.get(key, default)
    return default

# ==========================================================
# CURRENT USER DEPENDENCY
# ==========================================================
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    from backend.models import User
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
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

    user_dict.pop("_id", None)

    # Replace empty strings with None (helps Pydantic validation)
    for key, value in list(user_dict.items()):
        if value == "":
            user_dict[key] = None

    try:
        return User(**user_dict)
    except Exception as e:
        print(f"User validation failed for {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User profile data is corrupted (check birthday, phone, etc.)"
        )

# ==========================================================
# PERMISSION DEPENDENCY FACTORY
# Layer 2: Universal permission check.
# Admin always bypasses. For others the named bool flag must
# be True on their permissions object.
# ==========================================================
def check_permission(required_permission: str):
    """
    Dependency factory that enforces a universal permission flag.
    Evaluation order per matrix:
      1. Admin → always allow
      2. Universal permission flag is True → allow
      3. Otherwise → 403
    """
    async def permission_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:
        # Step 1: Admin bypass
        if current_user.role == "admin":
            return current_user

        # Step 2: Check universal permission flag
        if _get_perm(current_user, required_permission, False):
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Required permission: {required_permission}"
        )

    return permission_checker

# ==========================================================
# ROLE CHECK HELPERS
# ==========================================================
def require_admin():
    """Strict admin-only gate."""
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        return current_user
    return checker


def require_manager_or_admin():
    """Gate for manager or admin roles."""
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in ["admin", "manager"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manager or Admin access required"
            )
        return current_user
    return checker

# ==========================================================
# TASK PERMISSION HELPERS
# ==========================================================

def can_view_task(user: User, task: dict) -> bool:
    """
    TASKS – View permission matrix:
      1. Admin → allow all
      2. Universal: can_view_all_tasks → allow
      3. Specific: assigned_to in view_other_tasks → allow
      4. Ownership: assigned_to == user OR created_by == user → allow
      5. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_view_all_tasks"):
        return True
    view_other = _get_perm(user, "view_other_tasks", [])
    if task.get("assigned_to") in (view_other or []):
        return True
    if (
        task.get("assigned_to") == user.id
        or task.get("created_by") == user.id
        or user.id in task.get("sub_assignees", [])
    ):
        return True
    return False


def can_edit_task(user: User, task: dict) -> bool:
    """
    TASKS – Edit permission matrix:
      1. Admin → allow
      2. Universal: can_edit_tasks → allow
      3. Ownership: created_by OR assigned_to OR sub_assignee → allow
      4. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_edit_tasks"):
        return True
    if (
        task.get("created_by") == user.id
        or task.get("assigned_to") == user.id
        or user.id in task.get("sub_assignees", [])
    ):
        return True
    return False


def can_delete_task(user: User, task: dict) -> bool:
    """
    TASKS – Delete permission matrix:
      Admin only OR task creator
    """
    if user.role == "admin":
        return True
    if task.get("created_by") == user.id:
        return True
    return False

# ==========================================================
# TODO PERMISSION HELPERS
# ==========================================================

def can_view_todo(user: User, todo: dict) -> bool:
    """
    TODOS – View:
      1. Admin → allow
      2. Specific: user_id in view_other_todos → allow
      3. Ownership: user_id == user → allow
      4. Deny
    """
    if user.role == "admin":
        return True
    view_other = _get_perm(user, "view_other_todos", [])
    if todo.get("user_id") in (view_other or []):
        return True
    if todo.get("user_id") == user.id:
        return True
    return False


def can_edit_todo(user: User, todo: dict) -> bool:
    """
    TODOS – Edit:
      Admin OR owner
    """
    if user.role == "admin":
        return True
    if todo.get("user_id") == user.id:
        return True
    return False

# ==========================================================
# CLIENT PERMISSION HELPERS
# ==========================================================

def can_view_client(user: User, client: dict) -> bool:
    """
    CLIENTS – View:
      1. Admin → allow
      2. Universal: can_view_all_clients → allow
      3. Specific: client id in assigned_clients → allow
      4. Ownership: assigned_to == user → allow
      5. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_view_all_clients"):
        return True
    assigned_clients = _get_perm(user, "assigned_clients", [])
    if client.get("id") in (assigned_clients or []):
        return True
    if client.get("assigned_to") == user.id:
        return True
    return False


def can_edit_client(user: User, client: dict) -> bool:
    """
    CLIENTS – Edit:
      1. Admin → allow
      2. Universal: can_edit_clients → allow
      3. Specific: client id in assigned_clients → allow
      4. Ownership: assigned_to == user → allow
      5. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_edit_clients"):
        return True
    assigned_clients = _get_perm(user, "assigned_clients", [])
    if client.get("id") in (assigned_clients or []):
        return True
    if client.get("assigned_to") == user.id:
        return True
    return False


def can_delete_client(user: User) -> bool:
    """
    CLIENTS – Delete:
      Admin OR can_edit_clients
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_edit_clients"):
        return True
    return False

# ==========================================================
# REPORT PERMISSION HELPERS
# ==========================================================

def can_view_report(user: User, target_user_id: str) -> bool:
    """
    REPORTS – View:
      1. Admin → allow
      2. Universal: can_view_reports → allow
      3. Specific: target_user_id in view_other_reports → allow
      4. Ownership: target_user_id == user → allow
      5. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_view_reports"):
        return True
    view_other = _get_perm(user, "view_other_reports", [])
    if target_user_id in (view_other or []):
        return True
    if target_user_id == user.id:
        return True
    return False


def can_download_report(user: User) -> bool:
    """
    REPORTS – Download:
      Admin OR can_download_reports
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_download_reports"):
        return True
    return False

# ==========================================================
# ATTENDANCE PERMISSION HELPERS
# ==========================================================

def can_view_attendance(user: User, target_user_id: str) -> bool:
    """
    ATTENDANCE – View:
      1. Admin → allow
      2. Universal: can_view_attendance → allow
      3. Specific: target_user_id in view_other_attendance → allow
      4. Ownership: target_user_id == user → allow
      5. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_view_attendance"):
        return True
    view_other = _get_perm(user, "view_other_attendance", [])
    if target_user_id in (view_other or []):
        return True
    if target_user_id == user.id:
        return True
    return False

# ==========================================================
# ACTIVITY PERMISSION HELPERS
# ==========================================================

def can_view_activity(user: User, target_user_id: str) -> bool:
    """
    STAFF ACTIVITY – View:
      1. Admin → allow
      2. Specific: target_user_id in view_other_activity → allow
      3. Deny (staff cannot view their own in the summary endpoint)
    """
    if user.role == "admin":
        return True
    view_other = _get_perm(user, "view_other_activity", [])
    if target_user_id in (view_other or []):
        return True
    return False

# ==========================================================
# LEAD PERMISSION HELPERS
# ==========================================================

def can_view_lead(user: User, lead: dict) -> bool:
    """
    LEADS – View:
      1. Admin → allow
      2. Universal: can_view_all_leads → allow
      3. Ownership: assigned_to OR created_by → allow
      4. Deny
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_view_all_leads"):
        return True
    if (
        lead.get("assigned_to") == user.id
        or lead.get("created_by") == user.id
    ):
        return True
    return False


def can_edit_lead(user: User, lead: dict) -> bool:
    """
    LEADS – Edit:
      Admin OR assigned_to OR created_by
    """
    if user.role == "admin":
        return True
    if (
        lead.get("assigned_to") == user.id
        or lead.get("created_by") == user.id
    ):
        return True
    return False


def can_delete_lead(user: User) -> bool:
    """
    LEADS – Delete:
      Admin OR can_manage_users
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_manage_users"):
        return True
    return False

# ==========================================================
# USER MANAGEMENT PERMISSION HELPERS
# ==========================================================

def can_manage_user(user: User) -> bool:
    """
    USER MANAGEMENT – Create/Edit:
      Admin OR can_manage_users
    """
    if user.role == "admin":
        return True
    if _get_perm(user, "can_manage_users"):
        return True
    return False

# ==========================================================
# MONGO QUERY FILTER BUILDERS
# These build MongoDB $match filters implementing the matrix
# so routes can use them directly without manually building
# $or/$and chains every time.
# ==========================================================

def build_task_query(user: User) -> dict:
    """
    Returns a MongoDB query filter for tasks based on the permission matrix.
    Admin → {}  (no filter = all tasks)
    Others → filtered by universal / specific / ownership rules
    """
    if user.role == "admin":
        return {}

    if _get_perm(user, "can_view_all_tasks"):
        return {}

    view_other = _get_perm(user, "view_other_tasks", []) or []

    or_clauses = [
        {"assigned_to": user.id},
        {"created_by": user.id},
        {"sub_assignees": user.id},
    ]
    if view_other:
        or_clauses.append({"assigned_to": {"$in": view_other}})

    return {"$or": or_clauses}


def build_todo_query(user: User, target_user_id: Optional[str] = None) -> dict:
    """
    Returns a MongoDB query filter for todos based on the permission matrix.
    """
    if user.role == "admin":
        return {"user_id": target_user_id} if target_user_id else {}

    if target_user_id:
        # Validate that the requester can see this specific user's todos
        if target_user_id == user.id:
            return {"user_id": target_user_id}
        view_other = _get_perm(user, "view_other_todos", []) or []
        if target_user_id in view_other:
            return {"user_id": target_user_id}
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this user's todos"
        )

    view_other = _get_perm(user, "view_other_todos", []) or []
    or_clauses: List[dict] = [{"user_id": user.id}]
    if view_other:
        or_clauses.append({"user_id": {"$in": view_other}})
    return {"$or": or_clauses}


def build_client_query(user: User) -> dict:
    """
    Returns a MongoDB query filter for clients based on the permission matrix.
    """
    if user.role == "admin":
        return {}

    if _get_perm(user, "can_view_all_clients"):
        return {}

    assigned_clients = _get_perm(user, "assigned_clients", []) or []

    or_clauses: List[dict] = [{"assigned_to": user.id}]
    if assigned_clients:
        or_clauses.append({"id": {"$in": assigned_clients}})

    return {"$or": or_clauses}


def build_attendance_query(user: User, target_user_id: Optional[str] = None) -> dict:
    """
    Returns a MongoDB query filter for attendance based on the permission matrix.
    """
    if user.role == "admin":
        return {"user_id": target_user_id} if target_user_id else {}

    if target_user_id:
        if not can_view_attendance(user, target_user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this user's attendance"
            )
        return {"user_id": target_user_id}

    # No specific user requested — return what the user is allowed to see
    if _get_perm(user, "can_view_attendance"):
        return {}  # Universal access — all attendance records

    view_other = _get_perm(user, "view_other_attendance", []) or []
    or_clauses: List[dict] = [{"user_id": user.id}]
    if view_other:
        or_clauses.append({"user_id": {"$in": view_other}})
    return {"$or": or_clauses}


def build_report_query(user: User, target_user_id: Optional[str] = None) -> Optional[str]:
    """
    Validates report access and returns the resolved target_user_id.
    Raises 403 if not permitted.
    """
    resolved = target_user_id or user.id

    if not can_view_report(user, resolved):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this report"
        )
    return resolved

# ==========================================================
# DATA SCOPE & TEAM HELPERS
# ==========================================================
async def get_team_user_ids(manager_id: str) -> List[str]:
    """
    Returns list of user IDs that belong to the same departments as the manager.
    Only staff-role users are returned.
    """
    manager = await db.users.find_one({"id": manager_id})
    if not manager or not manager.get("departments"):
        return []
    team = await db.users.find(
        {
            "departments": {"$in": manager["departments"]},
            "id": {"$ne": manager_id},
            "role": "staff"
        }
    ).to_list(100)
    return [u["id"] for u in team]

# ==========================================================
# LEGACY COMPAT HELPERS (kept so existing route code that
# calls these doesn't break; they now delegate to the new
# matrix-aware helpers above)
# ==========================================================
async def verify_record_access(
    current_user: User,
    record_owner_id: str
) -> bool:
    """
    Generic ownership check.
    Used for modules without a dedicated helper (e.g., DSC, Documents).
    Matrix layer: Admin → Owner → Deny
    """
    if current_user.role == "admin":
        return True
    if record_owner_id == current_user.id:
        return True
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this resource"
    )


async def verify_client_access(
    current_user: User,
    client: dict
) -> bool:
    """
    Delegates to can_view_client() — uses full 5-layer matrix.
    """
    if can_view_client(current_user, client):
        return True
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access this client"
    )


async def verify_activity_access(
    current_user: User,
    activity_user_id: str
) -> bool:
    """
    Delegates to can_view_activity() — uses full matrix.
    """
    if can_view_activity(current_user, activity_user_id):
        return True
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to view this activity"
    )

# ==========================================================
# AUDIT LOGGING
# ==========================================================
async def create_audit_log(
    current_user: Any,
    action: str,
    module: str,
    record_id: str,
    old_data: Optional[dict] = None,
    new_data: Optional[dict] = None
) -> None:
    from backend.models import AuditLog  # late import to avoid circulars

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
