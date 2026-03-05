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
# PERMISSION HIERARCHY - EVALUATION ORDER
# ==========================================================
"""
Permission Decision Flow:
1. Admin override → Allow all
2. Universal permission → Allow all records in module
3. Specific access permission → Allow specific users/clients
4. Ownership → Allow if user owns the record
5. Deny
"""

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
        print(f"User validation failed for {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User profile data is corrupted (check birthday, phone, etc.)"
        )

# ==========================================================
# PERMISSION HELPER - CHECK IF USER HAS PERMISSION
# ==========================================================
def has_permission(user: User, permission_key: str) -> bool:
    """
    Check if user has a specific permission.
    Returns True if:
    1. User is admin
    2. User has the permission in their permissions object
    """
    if user.role == "admin":
        return True
    
    if not user.permissions:
        return False
    
    try:
        if hasattr(user.permissions, "model_dump"):
            # Pydantic v2+
            perms_dict = user.permissions.model_dump()
            return perms_dict.get(permission_key, False)
        elif hasattr(user.permissions, "dict"):
            # Pydantic v1
            perms_dict = user.permissions.dict()
            return perms_dict.get(permission_key, False)
        elif isinstance(user.permissions, dict):
            return user.permissions.get(permission_key, False)
        else:
            return False
    except Exception:
        return False

# ==========================================================
# PERMISSION DEPENDENCY FACTORY
# ==========================================================
def check_permission(required_permission: str):
    async def permission_checker(current_user: User = Depends(get_current_user)) -> User:
        # Admin bypass
        if current_user.role == "admin":
            return current_user

        if not has_permission(current_user, required_permission):
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
    Retrieves all non-admin users except the manager themselves.
    
    Future improvements:
    • Add manager_id field to User model
    • Add department / team field
    • Add explicit team_members array on manager
    • Filter by department assignment
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
    
    Admin: No filter (sees all records)
    Manager: Own records + team member records
    Staff: Only own records
    
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
# PERMISSION HIERARCHY - RECORD ACCESS VALIDATION
# ==========================================================
"""
Tasks/Leads/Records Access Logic:

View Permission:
1. Admin → all
2. Universal permission (can_view_all_tasks) → all
3. Specific permission (view_other_tasks) → if in list
4. Ownership (assigned_to or created_by) → if owner
5. Deny

Edit Permission:
1. Admin → all
2. Universal permission (can_edit_tasks) → all
3. Ownership (created_by or assigned_to) → if owner
4. Deny

Delete Permission:
1. Admin only
2. Creator (created_by) only
"""

async def verify_record_access(
    current_user: User,
    record_owner_id: str = None,
    record_created_by: str = None,
    module: str = "tasks"
) -> bool:
    """
    STEP 1: Admin Check
    Admin users can access any record
    """
    if current_user.role == "admin":
        return True

    # Use created_by as fallback if owner_id not provided
    owner_id = record_owner_id or record_created_by

    """
    STEP 4: Ownership Check
    Users always have access to their own records
    """
    if owner_id and owner_id == current_user.id:
        return True

    """
    STEP 3: Manager Team Access
    Managers can view team member records
    """
    if current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        if owner_id and owner_id in team_ids:
            return True

    """
    STEP 5: Deny
    If no condition matches, deny access
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this resource"
    )


async def verify_record_edit_access(
    current_user: User,
    record_owner_id: str = None,
    record_created_by: str = None,
    record_sub_assignees: List[str] = None,
    module: str = "tasks"
) -> bool:
    """
    EDIT ACCESS HIERARCHY:
    1. Admin → edit all
    2. Universal permission (can_edit_tasks) → edit all
    3. Ownership (created_by or assigned_to or sub_assignees) → can edit
    4. Deny
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Step 2: Universal edit permission
    edit_permission_key = f"can_edit_{module}"
    if has_permission(current_user, edit_permission_key):
        return True

    # Step 3: Ownership check (creator, assignee, or sub-assignee)
    record_sub_assignees = record_sub_assignees or []
    if (
        (record_created_by and record_created_by == current_user.id) or
        (record_owner_id and record_owner_id == current_user.id) or
        (current_user.id in record_sub_assignees)
    ):
        return True

    # Step 4: Deny
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"You do not have permission to edit this {module}"
    )


async def verify_record_delete_access(
    current_user: User,
    record_created_by: str = None,
    module: str = "tasks"
) -> bool:
    """
    DELETE ACCESS HIERARCHY:
    1. Admin only
    2. Creator only (for some modules like tasks)
    3. Permission-based (can_manage_users for certain modules)
    4. Deny
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Step 2: Creator check (applies to tasks, leads, etc.)
    if record_created_by and record_created_by == current_user.id:
        return True

    # Step 3: Special permission check
    delete_permission_key = f"can_manage_{module}"
    if has_permission(current_user, delete_permission_key):
        return True

    # Step 4: Deny
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"You do not have permission to delete this {module}"
    )

# ==========================================================
# CLIENT ACCESS CONTROL
# ==========================================================
async def verify_client_access(
    current_user: User,
    client_assigned_to: Optional[str] = None,
    action: str = "view"
) -> bool:
    """
    CLIENT ACCESS HIERARCHY:
    
    View Permission:
    1. Admin → all
    2. Universal (can_view_all_clients) → all
    3. Specific (assigned_clients list) → if in list
    4. Ownership (assigned_to) → if owner
    5. Deny
    
    Edit Permission:
    1. Admin → all
    2. Universal (can_edit_clients) → all
    3. Specific (assigned_clients list) → if in list
    4. Ownership (assigned_to) → if owner
    5. Deny
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Determine permission key based on action
    if action == "view":
        universal_perm = "can_view_all_clients"
    elif action == "edit":
        universal_perm = "can_edit_clients"
    else:
        universal_perm = f"can_{action}_clients"

    # Step 2: Universal permission check
    if has_permission(current_user, universal_perm):
        return True

    # Step 3: Specific access permission check
    if current_user.permissions:
        try:
            if hasattr(current_user.permissions, "assigned_clients"):
                assigned_clients = current_user.permissions.assigned_clients
            elif hasattr(current_user.permissions, "model_dump"):
                perms_dict = current_user.permissions.model_dump()
                assigned_clients = perms_dict.get("assigned_clients", [])
            elif isinstance(current_user.permissions, dict):
                assigned_clients = current_user.permissions.get("assigned_clients", [])
            else:
                assigned_clients = []

            if client_assigned_to and client_assigned_to in assigned_clients:
                return True
        except Exception:
            pass

    # Step 4: Ownership check
    if client_assigned_to and client_assigned_to == current_user.id:
        return True

    # Step 5: Deny
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
    """
    ACTIVITY ACCESS HIERARCHY:
    1. Admin → all
    2. Manager → team member activity
    3. User → own activity only
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Step 2: Manager team access
    if current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        if activity_user_id in team_ids:
            return True

    # Step 3: Own activity
    if activity_user_id == current_user.id:
        return True

    # Deny
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to view this activity"
    )

# ==========================================================
# ATTENDANCE ACCESS
# ==========================================================
async def verify_attendance_access(
    current_user: User,
    attendance_user_id: str
) -> bool:
    """
    ATTENDANCE ACCESS HIERARCHY:
    1. Admin → all
    2. Universal permission (can_view_attendance) → all
    3. Specific (view_other_attendance) → if in list
    4. Own attendance
    5. Deny
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Step 2: Universal permission
    if has_permission(current_user, "can_view_attendance"):
        return True

    # Step 3: Specific access
    if current_user.permissions:
        try:
            if hasattr(current_user.permissions, "view_other_attendance"):
                view_list = current_user.permissions.view_other_attendance
            elif hasattr(current_user.permissions, "model_dump"):
                perms_dict = current_user.permissions.model_dump()
                view_list = perms_dict.get("view_other_attendance", [])
            elif isinstance(current_user.permissions, dict):
                view_list = current_user.permissions.get("view_other_attendance", [])
            else:
                view_list = []

            if attendance_user_id in view_list:
                return True
        except Exception:
            pass

    # Step 4: Own attendance
    if attendance_user_id == current_user.id:
        return True

    # Step 5: Deny
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to view this attendance"
    )

# ==========================================================
# REPORT ACCESS
# ==========================================================
async def verify_report_access(
    current_user: User,
    report_user_id: str,
    action: str = "view"
) -> bool:
    """
    REPORT ACCESS HIERARCHY:
    1. Admin → all
    2. Universal permission (can_view_reports) → all
    3. Specific (view_other_reports) → if in list
    4. Own reports
    5. Deny
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Step 2: Universal permission
    if action == "download":
        perm_key = "can_download_reports"
    else:
        perm_key = "can_view_reports"

    if has_permission(current_user, perm_key):
        return True

    # Step 3: Specific access
    if current_user.permissions:
        try:
            if hasattr(current_user.permissions, "view_other_reports"):
                view_list = current_user.permissions.view_other_reports
            elif hasattr(current_user.permissions, "model_dump"):
                perms_dict = current_user.permissions.model_dump()
                view_list = perms_dict.get("view_other_reports", [])
            elif isinstance(current_user.permissions, dict):
                view_list = current_user.permissions.get("view_other_reports", [])
            else:
                view_list = []

            if report_user_id in view_list:
                return True
        except Exception:
            pass

    # Step 4: Own report
    if report_user_id == current_user.id:
        return True

    # Step 5: Deny
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access this report"
    )

# ==========================================================
# TODO ACCESS
# ==========================================================
async def verify_todo_access(
    current_user: User,
    todo_user_id: str
) -> bool:
    """
    TODO ACCESS HIERARCHY:
    1. Admin → all
    2. Specific (view_other_todos) → if in list
    3. Own todos
    4. Deny
    """
    # Step 1: Admin check
    if current_user.role == "admin":
        return True

    # Step 2: Specific access
    if current_user.permissions:
        try:
            if hasattr(current_user.permissions, "view_other_todos"):
                view_list = current_user.permissions.view_other_todos
            elif hasattr(current_user.permissions, "model_dump"):
                perms_dict = current_user.permissions.model_dump()
                view_list = perms_dict.get("view_other_todos", [])
            elif isinstance(current_user.permissions, dict):
                view_list = current_user.permissions.get("view_other_todos", [])
            else:
                view_list = []

            if todo_user_id in view_list:
                return True
        except Exception:
            pass

    # Step 3: Own todos
    if todo_user_id == current_user.id:
        return True

    # Step 4: Deny
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access this todo"
    )

# ==========================================================
# AUDIT LOGGING
# ==========================================================
async def create_audit_log(
    current_user: Any,
    action: str,
    module: str,
    record_id: str = None,
    old_data: Optional[dict] = None,
    new_data: Optional[dict] = None
) -> None:
    """
    Creates an audit log entry for tracking changes.
    """
    from backend.models import AuditLog

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
