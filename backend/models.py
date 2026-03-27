"""
models.py — Taskosphere Core Data Models
Complete access governance system.
Admin = unrestricted superuser on ALL operations.
Manager / Staff = permission-gated via UserPermissions.
"""

import uuid
import re
import math
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any, Union
from pydantic import (
    BaseModel,
    model_validator,
    Field,
    ConfigDict,
    EmailStr,
    field_validator,
)
from enum import Enum


# ─────────────────────────────────────────────────────────────────────────────
# TIMEZONE
# ─────────────────────────────────────────────────────────────────────────────
india_tz = timezone(timedelta(hours=5, minutes=30))


# ─────────────────────────────────────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────────────────────────────────────
class UserRole(str, Enum):
    admin   = "admin"
    manager = "manager"
    staff   = "staff"


class UserStatus(str, Enum):
    active           = "active"
    pending_approval = "pending_approval"
    rejected         = "rejected"
    inactive         = "inactive"


class EntityType(str, Enum):
    firm       = "firm"
    individual = "individual"
    company    = "company"


class TaskPriority(str, Enum):
    low    = "low"
    medium = "medium"
    high   = "high"
    urgent = "urgent"


class TaskStatus(str, Enum):
    pending     = "pending"
    in_progress = "in_progress"
    completed   = "completed"
    cancelled   = "cancelled"
    overdue     = "overdue"


class LeadStatus(str, Enum):
    new         = "new"
    contacted   = "contacted"
    qualified   = "qualified"
    proposal    = "proposal"
    negotiation = "negotiation"
    won         = "won"
    lost        = "lost"


class DSCStatus(str, Enum):
    IN  = "IN"
    OUT = "OUT"


class DSCLocation(str, Enum):
    with_company = "with_company"
    with_client  = "with_client"
    other        = "other"


class MovementType(str, Enum):
    IN  = "IN"
    OUT = "OUT"


class AttendanceStatus(str, Enum):
    present        = "present"
    absent         = "absent"
    half_day       = "half_day"
    on_leave       = "on_leave"
    holiday        = "holiday"
    work_from_home = "work_from_home"


class PortalType(str, Enum):
    MCA        = "MCA"
    DGFT       = "DGFT"
    TRADEMARK  = "TRADEMARK"
    GST        = "GST"
    INCOME_TAX = "INCOME_TAX"
    TDS        = "TDS"
    EPFO       = "EPFO"
    ESIC       = "ESIC"
    TRACES     = "TRACES"
    MSME       = "MSME"
    RERA       = "RERA"
    ROC        = "ROC"
    OTHER      = "OTHER"


PORTAL_TYPES_LIST: List[str] = [e.value for e in PortalType]

DEPARTMENTS: List[str] = [
    "GST", "IT", "ACC", "TDS", "ROC", "TM", "MSME", "FEMA", "DSC", "OTHER"
]


# ─────────────────────────────────────────────────────────────────────────────
# PERMISSION DEFAULTS PER ROLE
# Admin gets every flag = True.  Manager / Staff are restrictive.
# Keep in sync with DEFAULT_ROLE_PERMISSIONS in the React frontend.
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_ROLE_PERMISSIONS: Dict[str, Dict[str, Any]] = {

    # ── ADMIN — full superuser, every boolean True ────────────────────────
    "admin": {
        # View
        "can_view_all_tasks":              True,
        "can_view_all_clients":            True,
        "can_view_all_dsc":                True,
        "can_view_documents":              True,
        "can_view_all_duedates":           True,
        "can_view_reports":                True,
        "can_view_attendance":             True,
        "can_view_all_leads":              True,
        "can_view_todo_dashboard":         True,
        "can_view_audit_logs":             True,
        "can_view_user_page":              True,
        "can_view_selected_users_reports": True,
        "can_view_staff_rankings":         True,
        "can_view_staff_activity":         True,
        "can_view_own_data":               True,
        # Edit
        "can_edit_tasks":                  True,
        "can_edit_clients":                True,
        "can_edit_dsc":                    True,
        "can_edit_documents":              True,
        "can_edit_due_dates":              True,
        "can_edit_users":                  True,
        # Operations
        "can_manage_users":                True,
        "can_manage_settings":             True,
        "can_assign_tasks":                True,
        "can_assign_clients":              True,
        "can_send_reminders":              True,
        "can_download_reports":            True,
        "can_delete_data":                 True,
        "can_delete_tasks":                True,
        "can_connect_email":               True,
        "can_use_chat":                    True,
        # Modules
        "can_create_quotations":           True,
        # Password Vault
        "can_view_passwords":              True,
        "can_edit_passwords":              True,
        "view_password_departments":       [],   # empty = ALL departments
        # Visit
        "can_view_all_visits":             True,
        "can_edit_visits":                 True,
        "can_delete_visits":               True,
        "can_delete_own_visits":           True,
        # Cross-user lists (empty = access is decided by the boolean flags above)
        "view_other_visits":               [],
        "view_other_tasks":                [],
        "view_other_attendance":           [],
        "view_other_reports":              [],
        "view_other_todos":                [],
        "view_other_activity":             [],
        # Client portfolio
        "assigned_clients":                [],
    },

    # ── MANAGER — moderate access ─────────────────────────────────────────
    "manager": {
        "can_view_all_tasks":              False,
        "can_view_all_clients":            False,
        "can_view_all_dsc":                False,
        "can_view_documents":              True,
        "can_view_all_duedates":           False,
        "can_view_reports":                True,
        "can_view_attendance":             True,
        "can_view_all_leads":              False,
        "can_view_todo_dashboard":         True,
        "can_view_audit_logs":             False,
        "can_view_user_page":              False,
        "can_view_selected_users_reports": True,
        "can_view_staff_rankings":         True,
        "can_view_staff_activity":         True,
        "can_view_own_data":               True,
        "can_edit_tasks":                  True,
        "can_edit_clients":                False,
        "can_edit_dsc":                    False,
        "can_edit_documents":              False,
        "can_edit_due_dates":              True,
        "can_edit_users":                  False,
        "can_manage_users":                False,
        "can_manage_settings":             False,
        "can_assign_tasks":                True,
        "can_assign_clients":              False,
        "can_send_reminders":              False,
        "can_download_reports":            True,
        "can_delete_data":                 False,
        "can_delete_tasks":                False,
        "can_connect_email":               True,
        "can_use_chat":                    True,
        "can_create_quotations":           False,
        "can_view_passwords":              True,
        "can_edit_passwords":              False,
        "view_password_departments":       [],
        "can_view_all_visits":             False,
        "can_edit_visits":                 True,
        "can_delete_visits":               False,
        "can_delete_own_visits":           True,
        "view_other_visits":               [],
        "view_other_tasks":                [],
        "view_other_attendance":           [],
        "view_other_reports":              [],
        "view_other_todos":                [],
        "view_other_activity":             [],
        "assigned_clients":                [],
    },

    # ── STAFF — minimal access ────────────────────────────────────────────
    "staff": {
        "can_view_all_tasks":              False,
        "can_view_all_clients":            False,
        "can_view_all_dsc":                False,
        "can_view_documents":              False,
        "can_view_all_duedates":           False,
        "can_view_reports":                True,
        "can_view_attendance":             True,
        "can_view_all_leads":              False,
        "can_view_todo_dashboard":         True,
        "can_view_audit_logs":             False,
        "can_view_user_page":              False,
        "can_view_selected_users_reports": False,
        "can_view_staff_rankings":         True,
        "can_view_staff_activity":         False,
        "can_view_own_data":               True,
        "can_edit_tasks":                  False,
        "can_edit_clients":                False,
        "can_edit_dsc":                    False,
        "can_edit_documents":              False,
        "can_edit_due_dates":              False,
        "can_edit_users":                  False,
        "can_manage_users":                False,
        "can_manage_settings":             False,
        "can_assign_tasks":                False,
        "can_assign_clients":              False,
        "can_send_reminders":              False,
        "can_download_reports":            True,
        "can_delete_data":                 False,
        "can_delete_tasks":                False,
        "can_connect_email":               True,
        "can_use_chat":                    True,
        "can_create_quotations":           False,
        "can_view_passwords":              False,
        "can_edit_passwords":              False,
        "view_password_departments":       [],
        "can_view_all_visits":             False,
        "can_edit_visits":                 False,
        "can_delete_visits":               False,
        "can_delete_own_visits":           True,
        "view_other_visits":               [],
        "view_other_tasks":                [],
        "view_other_attendance":           [],
        "view_other_reports":              [],
        "view_other_todos":                [],
        "view_other_activity":             [],
        "assigned_clients":                [],
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# USER PERMISSIONS MODEL
# ─────────────────────────────────────────────────────────────────────────────
class UserPermissions(BaseModel):
    """
    Single source-of-truth for all granular permission flags.

    Rule: Admin users ALWAYS bypass every permission check server-side
    (enforced by User.has_permission / User.is_admin).
    These flags are only meaningful for manager / staff roles.
    """
    model_config = ConfigDict(extra="ignore")

    # ── View ────────────────────────────────────────────────────────────────
    can_view_all_tasks:              bool = False
    can_view_all_clients:            bool = False
    can_view_all_dsc:                bool = False
    can_view_documents:              bool = False
    can_view_all_duedates:           bool = False
    can_view_reports:                bool = False
    can_view_attendance:             bool = False
    can_view_all_leads:              bool = False
    can_view_todo_dashboard:         bool = False
    can_view_audit_logs:             bool = False
    can_view_user_page:              bool = False
    can_view_selected_users_reports: bool = False
    can_view_staff_rankings:         bool = False
    can_view_staff_activity:         bool = False
    can_view_own_data:               bool = True

    # ── Edit ────────────────────────────────────────────────────────────────
    can_edit_tasks:                  bool = False
    can_edit_clients:                bool = False
    can_edit_dsc:                    bool = False
    can_edit_documents:              bool = False
    can_edit_due_dates:              bool = False
    can_edit_users:                  bool = False

    # ── Operations ──────────────────────────────────────────────────────────
    can_manage_users:                bool = False
    can_manage_settings:             bool = False
    can_assign_tasks:                bool = False
    can_assign_clients:              bool = False
    can_send_reminders:              bool = False
    can_download_reports:            bool = False
    can_delete_data:                 bool = False
    can_delete_tasks:                bool = False
    can_connect_email:               bool = True
    can_use_chat:                    bool = False

    # ── Modules ─────────────────────────────────────────────────────────────
    can_create_quotations:           bool = False

    # ── Password Vault ───────────────────────────────────────────────────────
    can_view_passwords:              bool = False
    can_edit_passwords:              bool = False
    # Empty list = only own departments; populated = explicit dept whitelist
    view_password_departments:       List[str] = Field(default_factory=list)

    # ── Visits ───────────────────────────────────────────────────────────────
    can_view_all_visits:             bool = False
    can_edit_visits:                 bool = False
    can_delete_visits:               bool = False
    can_delete_own_visits:           bool = True

    # ── Cross-user visibility (lists of user IDs) ───────────────────────────
    view_other_visits:               List[str] = Field(default_factory=list)
    view_other_tasks:                List[str] = Field(default_factory=list)
    view_other_attendance:           List[str] = Field(default_factory=list)
    view_other_reports:              List[str] = Field(default_factory=list)
    view_other_todos:                List[str] = Field(default_factory=list)
    view_other_activity:             List[str] = Field(default_factory=list)

    # ── Client portfolio (list of client IDs) ────────────────────────────────
    assigned_clients:                List[str] = Field(default_factory=list)

    # ── Vault consistency: edit implies view ─────────────────────────────────
    @model_validator(mode="after")
    def vault_consistency(self) -> "UserPermissions":
        if self.can_edit_passwords and not self.can_view_passwords:
            self.can_view_passwords = True
        return self

    # ── Helpers ──────────────────────────────────────────────────────────────
    def active_permission_count(self) -> int:
        """Count of can_* flags set True (matches frontend permCount logic)."""
        return sum(
            1 for k, v in self.model_dump().items()
            if k.startswith("can_") and v is True
        )

    @classmethod
    def from_role(cls, role: "UserRole") -> "UserPermissions":
        """Return a permission set seeded from the role's default template."""
        role_key = role.value if isinstance(role, UserRole) else str(role)
        defaults = DEFAULT_ROLE_PERMISSIONS.get(role_key, {})
        return cls(**defaults)

    def to_role_defaults(self, role: "UserRole") -> "UserPermissions":
        return UserPermissions.from_role(role)


# ─────────────────────────────────────────────────────────────────────────────
# USER MODELS
# ─────────────────────────────────────────────────────────────────────────────
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:              str
    email:           str
    full_name:       Optional[str]   = None
    role:            UserRole        = UserRole.staff
    password:        Optional[str]   = None
    consent_given:   bool            = False
    departments:     List[str]       = Field(default_factory=list)
    phone:           Optional[str]   = None
    birthday:        Optional[Any]   = None
    profile_picture: Optional[str]   = None
    punch_in_time:   Optional[str]   = "10:30"
    grace_time:      Optional[str]   = "00:15"
    punch_out_time:  Optional[str]   = "19:00"
    telegram_id:     Optional[int]   = None
    permissions:     UserPermissions = Field(default_factory=UserPermissions)
    created_at:      Optional[Any]   = None
    is_active:       bool            = True
    status:          UserStatus      = UserStatus.pending_approval
    approved_by:     Optional[str]   = None
    approved_at:     Optional[Any]   = None

    # ── Shortcut fields (denormalised for fast backend checks) ───────────────
    can_delete:         bool      = False
    view_other_tasks:   List[str] = Field(default_factory=list)
    view_other_todos:   List[str] = Field(default_factory=list)
    view_other_visits:  List[str] = Field(default_factory=list)
    assigned_clients:   List[str] = Field(default_factory=list)

    # ────────────────────────────────────────────────────────────────────────
    # VALIDATORS
    # ────────────────────────────────────────────────────────────────────────
    @field_validator("birthday", mode="before")
    @classmethod
    def empty_string_to_none(cls, v: Any) -> Optional[Any]:
        return None if v == "" else v

    @field_validator("status", mode="before")
    @classmethod
    def coerce_status(cls, v: Any) -> UserStatus:
        if isinstance(v, UserStatus):
            return v
        try:
            return UserStatus(v)
        except ValueError:
            return UserStatus.pending_approval

    # ────────────────────────────────────────────────────────────────────────
    # COMPUTED HELPERS
    # ────────────────────────────────────────────────────────────────────────
    @property
    def is_admin(self) -> bool:
        """True when this user is an administrator (bypasses all perm checks)."""
        return self.role == UserRole.admin

    def has_permission(self, perm: str) -> bool:
        """
        Check a named boolean permission.
        Admins unconditionally return True regardless of the stored flag value.
        """
        if self.is_admin:
            return True
        return bool(getattr(self.permissions, perm, False))

    def can_view_resource(
        self,
        owner_user_id: str,
        cross_user_list_key: str = "view_other_tasks",
    ) -> bool:
        """
        Return True if this user may read a resource owned by owner_user_id.

        Logic:
          1. Admin → always True
          2. Viewing own resource → requires can_view_own_data
          3. Viewing other's resource → check the relevant cross-user list
        """
        if self.is_admin:
            return True
        if self.id == owner_user_id:
            return self.permissions.can_view_own_data
        cross_list: List[str] = getattr(self.permissions, cross_user_list_key, [])
        return owner_user_id in cross_list

    def can_access_client(self, client_id: str) -> bool:
        """True if this user may access the given client record."""
        if self.is_admin:
            return True
        if self.permissions.can_view_all_clients:
            return True
        return client_id in self.permissions.assigned_clients

    def can_access_vault_dept(self, department: str) -> bool:
        """True if this user may access the password vault for department."""
        if self.is_admin:
            return True
        if not self.permissions.can_view_passwords:
            return False
        dept_whitelist = self.permissions.view_password_departments
        # Empty whitelist → own departments only
        if not dept_whitelist:
            return department in self.departments
        return department in dept_whitelist or department in self.departments

    def can_edit_resource(self, perm_key: str) -> bool:
        """Generic edit check: admin always True, others check perm flag."""
        return self.has_permission(perm_key)

    def can_delete_resource(self) -> bool:
        """Generic delete check."""
        return self.has_permission("can_delete_data")

    def effective_permissions(self) -> Dict[str, Any]:
        """
        Return the full permission dict that should be enforced.
        For admins, every can_* flag is forced True regardless of stored values.
        """
        base = self.permissions.model_dump()
        if self.is_admin:
            for k in base:
                if k.startswith("can_"):
                    base[k] = True
        return base


class UserCreate(BaseModel):
    full_name:       str
    email:           str
    password:        str
    role:            UserRole      = UserRole.staff
    departments:     List[str]     = Field(default_factory=list)
    phone:           Optional[str] = None
    birthday:        Optional[Any] = None
    telegram_id:     Optional[int] = None
    punch_in_time:   Optional[str] = "10:30"
    grace_time:      Optional[str] = "00:15"
    punch_out_time:  Optional[str] = "19:00"
    profile_picture: Optional[str] = None
    is_active:       bool          = True
    # Admins may seed permissions on creation; otherwise role defaults are used.
    permissions:     Optional[Dict[str, Any]] = None
    status:          Optional[UserStatus]     = UserStatus.pending_approval
    # Shortcut fields
    can_delete:        bool      = False
    view_other_tasks:  List[str] = Field(default_factory=list)
    view_other_todos:  List[str] = Field(default_factory=list)
    view_other_visits: List[str] = Field(default_factory=list)
    assigned_clients:  List[str] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()

    def resolve_permissions(self) -> UserPermissions:
        """
        If explicit permissions were provided (e.g. by an admin), use them.
        Otherwise seed from role defaults.
        """
        if self.permissions:
            return UserPermissions(**self.permissions)
        return UserPermissions.from_role(self.role)


class UserUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    full_name:       Optional[str]        = None
    email:           Optional[str]        = None
    password:        Optional[str]        = None
    role:            Optional[UserRole]   = None
    departments:     Optional[List[str]]  = None
    phone:           Optional[str]        = None
    birthday:        Optional[Any]        = None
    punch_in_time:   Optional[str]        = None
    grace_time:      Optional[str]        = None
    punch_out_time:  Optional[str]        = None
    is_active:       Optional[bool]       = None
    profile_picture: Optional[str]        = None
    telegram_id:     Optional[int]        = None
    status:          Optional[UserStatus] = None
    can_delete:        Optional[bool]      = None
    view_other_tasks:  Optional[List[str]] = None
    view_other_todos:  Optional[List[str]] = None
    view_other_visits: Optional[List[str]] = None
    assigned_clients:  Optional[List[str]] = None


class UserPermissionsUpdate(BaseModel):
    """
    Payload for PUT /users/{id}/permissions.
    All fields are Optional — backend merges only supplied keys onto the
    existing permissions document.
    Admin callers always succeed; non-admins are rejected server-side.
    """
    model_config = ConfigDict(extra="ignore")

    can_view_all_tasks:              Optional[bool]      = None
    can_view_all_clients:            Optional[bool]      = None
    can_view_all_dsc:                Optional[bool]      = None
    can_view_documents:              Optional[bool]      = None
    can_view_all_duedates:           Optional[bool]      = None
    can_view_reports:                Optional[bool]      = None
    can_view_attendance:             Optional[bool]      = None
    can_view_all_leads:              Optional[bool]      = None
    can_view_todo_dashboard:         Optional[bool]      = None
    can_view_audit_logs:             Optional[bool]      = None
    can_view_user_page:              Optional[bool]      = None
    can_view_selected_users_reports: Optional[bool]      = None
    can_view_staff_rankings:         Optional[bool]      = None
    can_view_staff_activity:         Optional[bool]      = None
    can_view_own_data:               Optional[bool]      = None
    can_edit_tasks:                  Optional[bool]      = None
    can_edit_clients:                Optional[bool]      = None
    can_edit_dsc:                    Optional[bool]      = None
    can_edit_documents:              Optional[bool]      = None
    can_edit_due_dates:              Optional[bool]      = None
    can_edit_users:                  Optional[bool]      = None
    can_manage_users:                Optional[bool]      = None
    can_manage_settings:             Optional[bool]      = None
    can_assign_tasks:                Optional[bool]      = None
    can_assign_clients:              Optional[bool]      = None
    can_send_reminders:              Optional[bool]      = None
    can_download_reports:            Optional[bool]      = None
    can_delete_data:                 Optional[bool]      = None
    can_delete_tasks:                Optional[bool]      = None
    can_connect_email:               Optional[bool]      = None
    can_use_chat:                    Optional[bool]      = None
    can_create_quotations:           Optional[bool]      = None
    can_view_passwords:              Optional[bool]      = None
    can_edit_passwords:              Optional[bool]      = None
    view_password_departments:       Optional[List[str]] = None
    can_view_all_visits:             Optional[bool]      = None
    can_edit_visits:                 Optional[bool]      = None
    can_delete_visits:               Optional[bool]      = None
    can_delete_own_visits:           Optional[bool]      = None
    view_other_visits:               Optional[List[str]] = None
    view_other_tasks:                Optional[List[str]] = None
    view_other_attendance:           Optional[List[str]] = None
    view_other_reports:              Optional[List[str]] = None
    view_other_todos:                Optional[List[str]] = None
    view_other_activity:             Optional[List[str]] = None
    assigned_clients:                Optional[List[str]] = None

    def merge_into(self, current: UserPermissions) -> UserPermissions:
        """
        Overlay non-None fields from this update onto the existing permission
        document and return a new validated UserPermissions instance.
        """
        current_dict = current.model_dump()
        update_dict  = {k: v for k, v in self.model_dump().items() if v is not None}
        current_dict.update(update_dict)
        return UserPermissions(**current_dict)


class UserLogin(BaseModel):
    email:    EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type:   str
    user:         User


class UserApprovalResponse(BaseModel):
    id:          str
    full_name:   Optional[str]
    status:      UserStatus
    approved_by: Optional[str] = None
    approved_at: Optional[Any] = None


# ─────────────────────────────────────────────────────────────────────────────
# TODOS & TASKS
# ─────────────────────────────────────────────────────────────────────────────
class Todo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:           str  = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:      str
    title:        str
    description:  Optional[str] = None
    is_completed: bool          = False
    due_date:     Optional[Any] = None
    created_at:   Optional[Any] = None
    updated_at:   Optional[Any] = None
    completed_at: Optional[Any] = None


class TodoCreate(BaseModel):
    title:       str
    description: Optional[str] = None
    due_date:    Optional[Any] = None


class TodoUpdate(BaseModel):
    title:        Optional[str]  = None
    description:  Optional[str]  = None
    due_date:     Optional[Any]  = None
    is_completed: Optional[bool] = None


class TaskBase(BaseModel):
    title:               str
    description:         Optional[str]  = None
    assigned_to:         Optional[str]  = None
    sub_assignees:       List[str]      = Field(default_factory=list)
    due_date:            Optional[Any]  = None
    priority:            TaskPriority   = TaskPriority.medium
    status:              TaskStatus     = TaskStatus.pending
    category:            str            = "other"
    client_id:           Optional[str]  = None
    is_recurring:        bool           = False
    recurrence_pattern:  Optional[str]  = "monthly"
    recurrence_interval: Optional[int]  = 1
    recurrence_end_date: Optional[Any]  = None
    type:                Optional[str]  = None


class TaskCreate(TaskBase):
    pass


class BulkTaskCreate(BaseModel):
    tasks: List[TaskCreate]


class Task(TaskBase):
    model_config = ConfigDict(extra="ignore")

    id:             str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by:     str
    created_at:     Optional[Any] = None
    updated_at:     Optional[Any] = None
    parent_task_id: Optional[str] = None


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title:               Optional[str]          = None
    description:         Optional[str]          = None
    assigned_to:         Optional[str]          = None
    sub_assignees:       Optional[List[str]]    = None
    due_date:            Optional[Any]          = None
    priority:            Optional[TaskPriority] = None
    status:              Optional[TaskStatus]   = None
    category:            Optional[str]          = None
    client_id:           Optional[str]          = None
    is_recurring:        Optional[bool]         = None
    recurrence_pattern:  Optional[str]          = None
    recurrence_interval: Optional[int]          = None
    recurrence_end_date: Optional[Any]          = None


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANCE
# ─────────────────────────────────────────────────────────────────────────────
class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:               str              = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:          str
    date:             str
    status:           AttendanceStatus = AttendanceStatus.absent
    punch_in:         Optional[Any]    = None
    punch_out:        Optional[Any]    = None
    duration_minutes: Optional[int]    = 0
    leave_reason:     Optional[str]    = None
    is_late:          bool             = False
    punched_out_early: bool            = False


class AttendanceBase(BaseModel):
    punch_in:  Any
    punch_out: Optional[Any] = None


class AttendanceCreate(BaseModel):
    action: str  # "punch_in" | "punch_out"


# ─────────────────────────────────────────────────────────────────────────────
# STAFF ACTIVITY
# ─────────────────────────────────────────────────────────────────────────────
class StaffActivityCreate(BaseModel):
    app_name:         str                        = "Taskosphere Web"
    window_title:     Optional[str]              = None
    url:              Optional[str]              = None
    website:          Optional[str]              = None
    category:         str                        = "productivity"
    duration_seconds: int                        = 0
    idle:             Optional[bool]             = False
    activity_type:    str                        = "active_time"
    description:      Optional[str]              = None
    metadata:         Optional[Dict[str, Any]]   = None


class StaffActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:               str                      = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:          str
    activity_type:    str                      = "active_time"
    app_name:         str                      = "Taskosphere Web"
    window_title:     Optional[str]            = None
    url:              Optional[str]            = None
    category:         str                      = "other"
    duration_seconds: int                      = 0
    timestamp:        Optional[Any]            = None
    metadata:         Optional[Dict[str, Any]] = None


class ActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:                  str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:             str
    date:                str
    screen_time_minutes: int = 0
    tasks_completed:     int = 0


class ActivityLogUpdate(BaseModel):
    screen_time_minutes: Optional[int] = None
    tasks_completed:     Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# DSC MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────
class DSCMovement(BaseModel):
    """Individual DSC IN/OUT movement log entry."""
    id:            Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    movement_type: str           # "IN" or "OUT" — kept as plain str for DB flexibility
    person_name:   str
    timestamp:     Optional[Any] = None
    notes:         Optional[str] = None
    recorded_by:   Optional[str] = None
    edited_at:     Optional[Any] = None
    edited_by:     Optional[str] = None


class DSCBase(BaseModel):
    holder_name:      str
    dsc_type:         Optional[str]      = None
    dsc_password:     Optional[str]      = None
    associated_with:  Optional[str]      = None
    entity_type:      EntityType         = EntityType.firm
    issue_date:       Any
    expiry_date:      Any
    notes:            Optional[str]      = None
    current_status:   str                = "IN"   # "IN" | "OUT"
    current_location: str                = "with_company"
    taken_by:         Optional[str]      = None
    taken_date:       Optional[Any]      = None
    movement_log:     List[DSCMovement]  = Field(default_factory=list)


class DSCCreate(DSCBase):
    pass


class DSC(DSCBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class DSCUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    holder_name:      Optional[str]        = None
    dsc_type:         Optional[str]        = None
    dsc_password:     Optional[str]        = None
    associated_with:  Optional[str]        = None
    entity_type:      Optional[EntityType] = None
    issue_date:       Optional[Any]        = None
    expiry_date:      Optional[Any]        = None
    notes:            Optional[str]        = None
    current_status:   Optional[str]        = None
    current_location: Optional[str]        = None


class DSCListResponse(BaseModel):
    data:  List[DSC]
    total: int
    page:  int
    limit: int


class DSCMovementRequest(BaseModel):
    """
    Payload for POST /dsc/{id}/movement.
    movement_type accepts "IN" or "OUT" as plain strings so the
    frontend doesn't need to send an enum value.
    """
    movement_type: str   # "IN" | "OUT"
    person_name:   str
    notes:         Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in ("IN", "OUT"):
            raise ValueError("movement_type must be 'IN' or 'OUT'")
        return v


class MovementUpdateRequest(BaseModel):
    movement_id:   str
    movement_type: str
    person_name:   Optional[str] = None
    notes:         Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in ("IN", "OUT"):
            raise ValueError("movement_type must be 'IN' or 'OUT'")
        return v


# ─────────────────────────────────────────────────────────────────────────────
# REMINDER MODELS
# ─────────────────────────────────────────────────────────────────────────────
class ReminderCreate(BaseModel):
    title:       str
    description: Optional[str] = None
    remind_at:   Any


class Reminder(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:           str  = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:      str
    title:        str
    description:  Optional[str] = None
    remind_at:    Any
    is_dismissed: bool          = False
    created_at:   Optional[Any] = None


# ─────────────────────────────────────────────────────────────────────────────
# DOCUMENT MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────
class DocumentMovement(BaseModel):
    """Individual Document IN/OUT movement log entry."""
    id:            Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    movement_type: str           # "IN" or "OUT"
    person_name:   str
    timestamp:     Optional[Any] = None
    notes:         Optional[str] = None
    recorded_by:   Optional[str] = None
    edited_at:     Optional[Any] = None
    edited_by:     Optional[str] = None


class DocumentBase(BaseModel):
    document_name:    Optional[str]              = None
    document_type:    Optional[str]              = None
    holder_name:      Optional[str]              = None
    associated_with:  Optional[str]              = None
    entity_type:      EntityType                 = EntityType.firm
    issue_date:       Optional[Any]              = None
    valid_upto:       Optional[Any]              = None
    notes:            Optional[str]              = None
    current_status:   str                        = "IN"   # "IN" | "OUT"
    current_location: str                        = "with_company"
    movement_log:     List[DocumentMovement]     = Field(default_factory=list)


class DocumentCreate(DocumentBase):
    pass


class Document(DocumentBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    document_name:    Optional[str]          = None
    document_type:    Optional[str]          = None
    holder_name:      Optional[str]          = None
    associated_with:  Optional[str]          = None
    entity_type:      Optional[EntityType]   = None
    issue_date:       Optional[Any]          = None
    valid_upto:       Optional[Any]          = None
    notes:            Optional[str]          = None
    current_status:   Optional[str]          = None
    current_location: Optional[str]          = None


class DocumentMovementRequest(BaseModel):
    """
    Payload for POST /documents/{id}/movement.
    Accepts "IN" or "OUT" as plain strings.
    """
    movement_type: str
    person_name:   str
    notes:         Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in ("IN", "OUT"):
            raise ValueError("movement_type must be 'IN' or 'OUT'")
        return v


class DocumentMovementUpdateRequest(BaseModel):
    movement_id:   str
    movement_type: str
    person_name:   Optional[str] = None
    notes:         Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in ("IN", "OUT"):
            raise ValueError("movement_type must be 'IN' or 'OUT'")
        return v


# ─────────────────────────────────────────────────────────────────────────────
# CLIENT MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────
class ContactPerson(BaseModel):
    name:        Optional[str]      = None
    email:       Optional[EmailStr] = None
    phone:       Optional[str]      = None
    designation: Optional[str]      = None
    birthday:    Optional[Any]      = None
    din:         Optional[str]      = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_contact_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ["email", "phone", "designation", "birthday", "din"]:
                if data.get(field) == "":
                    data[field] = None
        return data


class ClientDSC(BaseModel):
    certificate_number: Optional[str] = None
    holder_name:        Optional[str] = None
    issue_date:         Optional[Any] = None
    expiry_date:        Optional[Any] = None
    notes:              Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_dsc_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ["certificate_number", "holder_name", "issue_date", "expiry_date", "notes"]:
                if data.get(field) == "":
                    data[field] = None
        return data


class ClientAssignment(BaseModel):
    user_id:  str
    services: List[str] = Field(default_factory=list)


class ClientBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company_name:          str           = Field(..., min_length=3, max_length=255)
    client_type:           str           = Field(
        ..., pattern=r"^(proprietor|pvt_ltd|llp|partnership|huf|trust|other|LLP|PVT_LTD)$"
    )
    client_type_label:     Optional[str]             = None
    contact_persons:       List[ContactPerson]        = Field(default_factory=list)
    email:                 Optional[EmailStr]         = None
    phone:                 Optional[str]              = None
    date_of_incorporation: Optional[Any]              = None
    birthday:              Optional[Any]              = None
    address:               Optional[str]              = None
    city:                  Optional[str]              = None
    state:                 Optional[str]              = None
    status:                Optional[str]              = "active"
    services:              List[str]                  = Field(default_factory=list)
    dsc_details:           List[ClientDSC]            = Field(default_factory=list)
    assigned_to:           Optional[str]              = None
    notes:                 Optional[str]              = None
    referred_by:           Optional[str]              = None
    assignments:           List[ClientAssignment]     = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def clean_empty_optional_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in [
                "email", "phone", "referred_by", "notes", "assigned_to",
                "birthday", "date_of_incorporation", "client_type_label",
                "address", "city", "state",
            ]:
                if data.get(field) == "":
                    data[field] = None
        return data

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: Any) -> Optional[str]:
        if v is None or str(v).strip() == "":
            return None
        cleaned = re.sub(r"[\s\-\+]", "", str(v))
        if not cleaned.isdigit():
            raise ValueError("Phone number must contain only digits")
        if not (10 <= len(cleaned) <= 15):
            raise ValueError("Phone number must be 10–15 digits")
        return v

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Company name must be at least 3 characters")
        return v


class ClientCreate(ClientBase):
    pass


class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class ClientUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company_name:          Optional[str]                    = None
    client_type:           Optional[str]                    = None
    client_type_label:     Optional[str]                    = None
    contact_persons:       Optional[List[ContactPerson]]    = None
    email:                 Optional[EmailStr]               = None
    phone:                 Optional[str]                    = None
    date_of_incorporation: Optional[Any]                    = None
    birthday:              Optional[Any]                    = None
    address:               Optional[str]                    = None
    city:                  Optional[str]                    = None
    state:                 Optional[str]                    = None
    status:                Optional[str]                    = None
    services:              Optional[List[str]]              = None
    dsc_details:           Optional[List[ClientDSC]]        = None
    assigned_to:           Optional[str]                    = None
    notes:                 Optional[str]                    = None
    referred_by:           Optional[str]                    = None
    assignments:           Optional[List[ClientAssignment]] = None


class MasterClientForm(BaseModel):
    company_name:          str
    client_type:           str
    email:                 Optional[EmailStr] = None
    phone:                 Optional[str]      = None
    date_of_incorporation: Optional[Any]      = None
    gst_number:            Optional[str]      = None
    pan_number:            Optional[str]      = None
    tan_number:            Optional[str]      = None
    assigned_to:           Optional[str]      = None
    services:              List[str]          = Field(default_factory=list)
    contact_persons:       List[Any]          = Field(default_factory=list)
    notes:                 Optional[str]      = None
    referred_by:           Optional[str]      = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: (None if v == "" else v) for k, v in data.items()}
        return data


# ─────────────────────────────────────────────────────────────────────────────
# LEADS
# ─────────────────────────────────────────────────────────────────────────────
class LeadBase(BaseModel):
    company_name: str
    contact_name: Optional[str]      = None
    email:        Optional[EmailStr] = None
    phone:        Optional[str]      = None
    services:     List[str]          = Field(default_factory=list)
    status:       LeadStatus         = LeadStatus.new
    source:       Optional[str]      = None
    notes:        Optional[str]      = None
    assigned_to:  Optional[str]      = None
    referred_by:  Optional[str]      = None


class LeadCreate(LeadBase):
    pass


class Lead(LeadBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company_name: Optional[str]        = None
    contact_name: Optional[str]        = None
    email:        Optional[EmailStr]   = None
    phone:        Optional[str]        = None
    services:     Optional[List[str]]  = None
    status:       Optional[LeadStatus] = None
    source:       Optional[str]        = None
    notes:        Optional[str]        = None
    assigned_to:  Optional[str]        = None
    referred_by:  Optional[str]        = None


# ─────────────────────────────────────────────────────────────────────────────
# DUE DATES & COMPLIANCE
# ─────────────────────────────────────────────────────────────────────────────
class DueDateBase(BaseModel):
    title:         str
    description:   Optional[str] = None
    due_date:      Any
    reminder_days: int           = 30
    category:      Optional[str] = None
    department:    str
    assigned_to:   Optional[str] = None
    client_id:     Optional[str] = None
    status:        str           = "pending"


class DueDateCreate(DueDateBase):
    pass


class DueDate(DueDateBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class DueDateUpdate(BaseModel):
    title:         Optional[str] = None
    description:   Optional[str] = None
    due_date:      Optional[Any] = None
    reminder_days: Optional[int] = None
    category:      Optional[str] = None
    department:    Optional[str] = None
    assigned_to:   Optional[str] = None
    client_id:     Optional[str] = None
    status:        Optional[str] = None


class BirthdayEmailRequest(BaseModel):
    client_id: str


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATIONS & AUDIT
# ─────────────────────────────────────────────────────────────────────────────
class NotificationBase(BaseModel):
    title:   str
    message: str
    type:    str


class Notification(NotificationBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:    str
    is_read:    bool = False
    created_at: Optional[Any] = None


class AuditLog(BaseModel):
    id:        str            = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:   str
    user_name: str
    action:    str
    module:    str
    record_id: Optional[str]  = None
    old_data:  Optional[dict] = None
    new_data:  Optional[dict] = None
    timestamp: Optional[Any]  = None


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD & METRICS
# ─────────────────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_tasks:         int
    completed_tasks:     int
    pending_tasks:       int
    overdue_tasks:       int
    total_dsc:           int
    expiring_dsc_count:  int
    expiring_dsc_list:   List[dict]
    expired_dsc_count:   int        = 0
    total_clients:       int
    upcoming_birthdays:  int
    upcoming_due_dates:  int
    team_workload:       List[dict]
    compliance_status:   dict


class PerformanceMetric(BaseModel):
    user_id:                 str
    user_name:               str
    profile_picture:         Optional[str] = None
    attendance_percent:      float         = 0.0
    total_hours:             float         = 0.0
    task_completion_percent: float         = 0.0
    todo_ontime_percent:     float         = 0.0
    timely_punchin_percent:  float         = 0.0
    overall_score:           float         = 0.0
    rank:                    int           = 0
    badge:                   str           = "Good Performer"


# ─────────────────────────────────────────────────────────────────────────────
# HOLIDAYS
# ─────────────────────────────────────────────────────────────────────────────
class HolidayCreate(BaseModel):
    date:        Any
    name:        str
    description: Optional[str] = None
    type:        str           = "manual"


class HolidayResponse(BaseModel):
    date:        Any
    name:        str
    description: Optional[str] = None
    status:      str           = "confirmed"
    type:        Optional[str] = "manual"


# ─────────────────────────────────────────────────────────────────────────────
# EMAIL INTEGRATION
# ─────────────────────────────────────────────────────────────────────────────
class EmailConnection(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id:          str
    provider:         str
    method:           str
    email_address:    Optional[str] = None
    access_token:     Optional[str] = None
    refresh_token:    Optional[str] = None
    expires_at:       Optional[str] = None
    app_password_enc: Optional[str] = None
    imap_host:        Optional[str] = None
    imap_port:        Optional[int] = None
    connected_at:     Optional[str] = None


class ExtractedEvent(BaseModel):
    title:          str
    event_type:     str
    date:           Optional[str] = None
    time:           Optional[str] = None
    location:       Optional[str] = None
    organizer:      Optional[str] = None
    description:    Optional[str] = None
    urgency:        str           = "medium"
    source_subject: str
    source_from:    str
    source_date:    str
    raw_snippet:    Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD VAULT
# ─────────────────────────────────────────────────────────────────────────────
class PasswordEntryCreate(BaseModel):
    portal_name:    str           = Field(..., min_length=2, max_length=120)
    portal_type:    PortalType    = PortalType.OTHER
    url:            Optional[str] = None
    username:       Optional[str] = None
    password_plain: Optional[str] = None   # plain text; backend encrypts at rest
    department:     str           = "OTHER"
    client_name:    Optional[str] = None
    client_id:      Optional[str] = None
    notes:          Optional[str] = None
    tags:           List[str]     = Field(default_factory=list)

    @field_validator("department")
    @classmethod
    def validate_department(cls, v: str) -> str:
        if v.upper() not in DEPARTMENTS:
            raise ValueError(f"department must be one of {DEPARTMENTS}")
        return v.upper()


class PasswordEntryUpdate(BaseModel):
    portal_name:    Optional[str]        = None
    portal_type:    Optional[PortalType] = None
    url:            Optional[str]        = None
    username:       Optional[str]        = None
    password_plain: Optional[str]        = None
    department:     Optional[str]        = None
    client_name:    Optional[str]        = None
    client_id:      Optional[str]        = None
    notes:          Optional[str]        = None
    tags:           Optional[List[str]]  = None


class PasswordEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:               str
    portal_name:      str
    portal_type:      str
    url:              Optional[str] = None
    username:         Optional[str] = None
    department:       str
    client_name:      Optional[str] = None
    client_id:        Optional[str] = None
    notes:            Optional[str] = None
    tags:             List[str]     = Field(default_factory=list)
    created_by:       str
    created_by_name:  Optional[str] = None
    created_at:       Optional[str] = None
    updated_at:       Optional[str] = None
    last_accessed_at: Optional[str] = None
    has_password:     bool          = False


class PasswordRevealResponse(BaseModel):
    id:          str
    username:    Optional[str]
    password:    str           # decrypted on request; never stored plain
    portal_name: str


# ─────────────────────────────────────────────────────────────────────────────
# QUOTATIONS
# ─────────────────────────────────────────────────────────────────────────────
class QuotationLineItem(BaseModel):
    description: str
    quantity:    float = 1.0
    unit_price:  float = 0.0
    discount:    float = 0.0   # percentage
    tax_rate:    float = 0.0   # percentage

    @property
    def total(self) -> float:
        subtotal = self.quantity * self.unit_price * (1 - self.discount / 100)
        return round(subtotal * (1 + self.tax_rate / 100), 2)


class QuotationBase(BaseModel):
    client_id:   Optional[str]           = None
    client_name: str
    valid_until: Optional[Any]           = None
    currency:    str                     = "INR"
    line_items:  List[QuotationLineItem] = Field(default_factory=list)
    notes:       Optional[str]           = None
    terms:       Optional[str]           = None
    status:      str                     = "draft"


class QuotationCreate(QuotationBase):
    pass


class Quotation(QuotationBase):
    model_config = ConfigDict(extra="ignore")

    id:           str  = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by:   str
    created_at:   Optional[Any] = None
    updated_at:   Optional[Any] = None
    quotation_no: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# VISITS
# ─────────────────────────────────────────────────────────────────────────────
class VisitBase(BaseModel):
    client_id:      Optional[str] = None
    client_name:    Optional[str] = None
    purpose:        str
    visit_date:     Any
    location:       Optional[str] = None
    notes:          Optional[str] = None
    outcome:        Optional[str] = None
    follow_up_date: Optional[Any] = None


class VisitCreate(VisitBase):
    pass


class Visit(VisitBase):
    model_config = ConfigDict(extra="ignore")

    id:         str  = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id:    str
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None


class VisitUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    client_id:      Optional[str] = None
    client_name:    Optional[str] = None
    purpose:        Optional[str] = None
    visit_date:     Optional[Any] = None
    location:       Optional[str] = None
    notes:          Optional[str] = None
    outcome:        Optional[str] = None
    follow_up_date: Optional[Any] = None


# ─────────────────────────────────────────────────────────────────────────────
# PAGINATION HELPERS
# ─────────────────────────────────────────────────────────────────────────────
class PaginatedResponse(BaseModel):
    total: int
    page:  int
    limit: int
    pages: int = 0

    @model_validator(mode="after")
    def compute_pages(self) -> "PaginatedResponse":
        if self.limit > 0:
            self.pages = math.ceil(self.total / self.limit)
        return self


# ─────────────────────────────────────────────────────────────────────────────
# BACKEND PERMISSION GUARD HELPERS
# Use these in route handlers to enforce access control cleanly.
# ─────────────────────────────────────────────────────────────────────────────

def require_permission(user: User, perm: str, detail: str = "Insufficient permissions") -> None:
    """
    Raise a PermissionError if the user lacks perm.
    Admin users always pass.  Integrate with FastAPI's HTTPException in routes.

    Usage in a FastAPI route:
        try:
            require_permission(current_user, "can_view_documents")
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
    """
    if not user.has_permission(perm):
        raise PermissionError(detail)


def admin_or_permission(user: User, perm: str) -> bool:
    """Convenience: True for admin or if the named permission is granted."""
    return user.is_admin or user.has_permission(perm)


def filter_for_user(
    user: User,
    records: List[Dict[str, Any]],
    owner_key: str = "created_by",
) -> List[Dict[str, Any]]:
    """
    Filter a list of record dicts so that:
      - Admin sees everything.
      - Others see only their own records (or those explicitly shared).
    """
    if user.is_admin:
        return records
    return [r for r in records if r.get(owner_key) == user.id]


def guard_document_access(user: User) -> None:
    """
    Call at the top of every /documents route handler.
    Raises PermissionError for non-admin users who lack can_view_documents.
    Admins always pass through.
    """
    if user.is_admin:
        return
    if not user.permissions.can_view_documents:
        raise PermissionError("You do not have permission to access the Document Register.")


def guard_document_edit(user: User) -> None:
    """
    Call before any write operation on /documents.
    Admins always pass; others need can_edit_documents.
    """
    if user.is_admin:
        return
    if not user.permissions.can_edit_documents:
        raise PermissionError("You do not have permission to create or edit documents.")


def guard_dsc_access(user: User) -> None:
    """Guard for DSC Register read access."""
    if user.is_admin:
        return
    if not user.permissions.can_view_all_dsc:
        raise PermissionError("You do not have permission to access the DSC Register.")


def guard_dsc_edit(user: User) -> None:
    """Guard for DSC Register write access."""
    if user.is_admin:
        return
    if not user.permissions.can_edit_dsc:
        raise PermissionError("You do not have permission to edit DSC records.")
