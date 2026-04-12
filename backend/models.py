import uuid
import re
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, model_validator, Field, ConfigDict, EmailStr, field_validator
from enum import Enum

# Timezone Configuration
india_tz = timezone(timedelta(hours=5, minutes=30))

# ────────────────────────────────────────────────
# ROLE ENUM
# ────────────────────────────────────────────────
class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    staff = "staff"

# ────────────────────────────────────────────────
# DEFAULT ROLE PERMISSION TEMPLATES
# ────────────────────────────────────────────────
DEFAULT_ROLE_PERMISSIONS: Dict[str, Dict[str, Any]] = {
      "admin": {
          # Admin has GLOBAL scope with ALL permissions (VIEW CREATE EDIT DELETE UPDATE)
          "can_view_all_tasks": True,
          "can_view_all_clients": True,
          "can_view_all_dsc": True,
          "can_view_documents": True,
          "can_view_all_duedates": True,
          "can_view_reports": True,
          "can_view_attendance": True,
          "can_view_all_leads": True,
          "can_edit_tasks": True,
          "can_edit_clients": True,
          "can_edit_dsc": True,
          "can_edit_documents": True,
          "can_edit_due_dates": True,
          "can_edit_users": True,
          "can_download_reports": True,
          "can_manage_users": True,
          "can_manage_settings": True,
          "can_assign_tasks": True,
          "can_assign_clients": True,
          "can_view_staff_activity": True,
          "can_send_reminders": True,
          "can_view_user_page": True,
          "can_view_audit_logs": True,
          "can_view_selected_users_reports": True,
          "can_view_todo_dashboard": True,
          "can_use_chat": True,
          "can_view_staff_rankings": True,
          "can_delete_data": True,
          "can_delete_tasks": True,
          "can_connect_email": True,
          "can_view_own_data": True,
          "can_create_quotations": True,
          "can_manage_invoices": True,
          "can_view_passwords": True,
          "can_edit_passwords": True,
          "view_password_departments": [],   # empty = all (admin sees everything)
          "can_view_all_visits": True,
          "can_edit_visits": True,
          "can_delete_visits": True,
          "can_delete_own_visits": True,
          "view_other_visits": [],
          "view_other_tasks": [],
          "view_other_attendance": [],
          "view_other_reports": [],
          "view_other_todos": [],
          "view_other_activity": [],
          "assigned_clients": [],
      },
      "manager": {
          # Manager: SCOPE = OWN + SAME_DEPARTMENT (Own + Team)
          # CROSS_VISIBILITY = SAME_DEPARTMENT_USERS
          # ALL MODULES: VIEW, CREATE, EDIT, UPDATE (Permission-based — admin can revoke)
          # NO DELETE by default
          # DATA_ACCESS_RULE: resource.department == user.department
          #   AND (resource.user_id == user.id OR resource.user_id IN SAME_DEPARTMENT_USERS)
          "can_view_all_tasks": False,      # SCOPE handled server-side by department query
          "can_view_all_clients": True,     # DEFAULT_MODULE (Assigned + Permission-based)
          "can_view_all_dsc": True,         # DEFAULT_MODULE (Permission-based)
          "can_view_documents": True,       # DEFAULT_MODULE (compliance/docs)
          "can_view_all_duedates": True,    # DEFAULT_MODULE (compliance)
          "can_view_reports": True,         # DEFAULT_MODULE (Own + Team scope)
          "can_view_attendance": True,      # DEFAULT_MODULE (calendar/attendance)
          "can_view_all_leads": True,       # DEFAULT_MODULE (Permission-based)
          "can_edit_tasks": True,           # DEFAULT_MODULE (task)
          "can_edit_clients": True,         # DEFAULT_MODULE (Permission-based)
          "can_edit_dsc": True,             # DEFAULT_MODULE (Permission-based)
          "can_edit_documents": True,       # DEFAULT_MODULE
          "can_edit_due_dates": True,       # DEFAULT_MODULE (compliance)
          "can_edit_users": True,           # DEFAULT_MODULE (Permission-based)
          "can_download_reports": True,     # DEFAULT_MODULE
          "can_manage_users": True,         # DEFAULT_MODULE (Permission-based)
          "can_manage_settings": True,      # DEFAULT_MODULE (general_settings)
          "can_assign_tasks": True,         # DEFAULT_MODULE (task)
          "can_assign_clients": True,       # DEFAULT_MODULE (Permission-based)
          "can_view_staff_activity": True,  # DEFAULT_MODULE (Own + Team scope enforced server-side)
          "can_send_reminders": False,      # ADMIN_GRANTED_ONLY
          "can_view_user_page": True,       # DEFAULT_MODULE (Permission-based)
          "can_view_audit_logs": True,      # DEFAULT_MODULE (Permission-based)
          "can_view_selected_users_reports": True,  # DEFAULT_MODULE
          "can_view_todo_dashboard": True,  # DEFAULT_MODULE (todo)
          "can_use_chat": True,             # DEFAULT_MODULE
          "can_view_staff_rankings": True,  # DEFAULT_MODULE
          "can_delete_data": False,         # ADMIN_GRANTED_ONLY
          "can_delete_tasks": False,        # ADMIN_GRANTED_ONLY
          "can_connect_email": True,        # DEFAULT_MODULE (Email Accounts — Own + Team)
          "can_view_own_data": True,        # DEFAULT_MODULE
          "can_create_quotations": True,    # DEFAULT_MODULE (Permission-based)
          "can_manage_invoices": True,      # DEFAULT_MODULE (Permission-based)
          "can_view_passwords": True,       # DEFAULT_MODULE (Permission-based)
          "can_edit_passwords": True,       # DEFAULT_MODULE (Permission-based)
          "view_password_departments": [],  # defaults to own departments
          "can_view_all_visits": False,     # SCOPE handled server-side by department query
          "can_edit_visits": True,          # DEFAULT_MODULE (client_visit)
          "can_delete_visits": False,       # ADMIN_GRANTED_ONLY
          "can_delete_own_visits": True,    # Always allowed
          "view_other_visits": [],
          "view_other_tasks": [],
          "view_other_attendance": [],
          "view_other_reports": [],
          "view_other_todos": [],
          "view_other_activity": [],
          "assigned_clients": [],
      },
      "staff": {
          # Staff: SCOPE = OWN only
          # ALL MODULES: VIEW, CREATE, EDIT, UPDATE (Permission-based — admin can revoke)
          # NO DELETE by default
          # DATA_ACCESS_RULE: resource.department == user.department AND resource.user_id == user.id
          "can_view_all_tasks": False,      # SCOPE: own only
          "can_view_all_clients": True,     # DEFAULT_MODULE (Assigned + Permission-based)
          "can_view_all_dsc": True,         # DEFAULT_MODULE (Permission-based)
          "can_view_documents": True,       # DEFAULT_MODULE
          "can_view_all_duedates": True,    # DEFAULT_MODULE (compliance)
          "can_view_reports": True,         # DEFAULT_MODULE (own reports only, server-side scoped)
          "can_view_attendance": True,      # DEFAULT_MODULE (own attendance only, server-side scoped)
          "can_view_all_leads": True,       # DEFAULT_MODULE (Permission-based)
          "can_edit_tasks": True,           # DEFAULT_MODULE (own/assigned tasks only)
          "can_edit_clients": True,         # DEFAULT_MODULE (Permission-based)
          "can_edit_dsc": True,             # DEFAULT_MODULE (Permission-based)
          "can_edit_documents": True,       # DEFAULT_MODULE (Permission-based)
          "can_edit_due_dates": True,       # DEFAULT_MODULE (Permission-based)
          "can_edit_users": True,           # DEFAULT_MODULE (Permission-based)
          "can_download_reports": True,     # DEFAULT_MODULE (own data only)
          "can_manage_users": True,         # DEFAULT_MODULE (Permission-based)
          "can_manage_settings": True,      # DEFAULT_MODULE (general_settings, own profile)
          "can_assign_tasks": False,        # ADMIN_GRANTED_ONLY
          "can_assign_clients": False,      # ADMIN_GRANTED_ONLY
          "can_view_staff_activity": True,  # DEFAULT_MODULE (own activity only, server-side scoped)
          "can_send_reminders": False,      # ADMIN_GRANTED_ONLY
          "can_view_user_page": True,       # DEFAULT_MODULE (Permission-based)
          "can_view_audit_logs": True,      # DEFAULT_MODULE (Permission-based)
          "can_view_selected_users_reports": True,  # DEFAULT_MODULE (own data)
          "can_view_todo_dashboard": True,  # DEFAULT_MODULE
          "can_use_chat": True,             # DEFAULT_MODULE
          "can_view_staff_rankings": False, # ADMIN_GRANTED_ONLY
          "can_delete_data": False,         # ADMIN_GRANTED_ONLY
          "can_delete_tasks": False,        # ADMIN_GRANTED_ONLY
          "can_connect_email": True,        # DEFAULT_MODULE (Email Accounts)
          "can_view_own_data": True,        # DEFAULT_MODULE
          "can_create_quotations": True,    # DEFAULT_MODULE (Permission-based)
          "can_manage_invoices": True,      # DEFAULT_MODULE (Permission-based)
          "can_view_passwords": True,       # DEFAULT_MODULE (Permission-based)
          "can_edit_passwords": True,       # DEFAULT_MODULE (Permission-based)
          "view_password_departments": [],
          "can_view_all_visits": False,     # SCOPE: own visits only
          "can_edit_visits": True,          # DEFAULT_MODULE (own visits)
          "can_delete_visits": False,       # ADMIN_GRANTED_ONLY
          "can_delete_own_visits": True,    # Always allowed
          "view_other_visits": [],
          "view_other_tasks": [],
          "view_other_attendance": [],
          "view_other_reports": [],
          "view_other_todos": [],
          "view_other_activity": [],
          "assigned_clients": [],
      },
  }

# ======================
# CORE USER & PERMISSIONS
# ======================
class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_documents: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_view_attendance: bool = False
    can_view_all_leads: bool = False
    can_edit_tasks: bool = False
    can_edit_clients: bool = False
    can_edit_dsc: bool = False
    can_edit_documents: bool = False
    can_edit_due_dates: bool = False
    can_edit_users: bool = False
    can_download_reports: bool = False
    can_manage_users: bool = False
    can_manage_settings: bool = False
    can_assign_tasks: bool = False
    can_assign_clients: bool = False
    can_view_staff_activity: bool = False
    can_send_reminders: bool = False
    can_view_user_page: bool = False
    can_view_audit_logs: bool = False
    can_view_selected_users_reports: bool = False
    can_view_todo_dashboard: bool = False
    can_use_chat: bool = False
    can_view_staff_rankings: bool = False
    can_delete_data: bool = False
    can_delete_tasks: bool = False
    can_connect_email: bool = True
    can_view_own_data: bool = True
    can_create_quotations: bool = False
    # ── Invoicing & Billing ──────────────────────────────────────────────────
    # Grants access to: create/edit/delete invoices, record payments,
    # download PDFs, manage product catalog.
    # Admin always has this regardless of the flag.
    can_manage_invoices: bool = False
    # ── Password Repository ──────────────────────────────────────────────────
    can_view_passwords: bool = False
    can_edit_passwords: bool = False
    view_password_departments: List[str] = Field(default_factory=list)
    # ── Visit-specific permissions ───────────────────────────────────────────
    can_view_all_visits: bool = False
    can_edit_visits: bool = False
    can_delete_visits: bool = False
    can_delete_own_visits: bool = True
    view_other_visits: List[str] = Field(default_factory=list)
    # ── List permissions ─────────────────────────────────────────────────────
    view_other_tasks: List[str] = Field(default_factory=list)
    view_other_attendance: List[str] = Field(default_factory=list)
    view_other_reports: List[str] = Field(default_factory=list)
    view_other_todos: List[str] = Field(default_factory=list)
    view_other_activity: List[str] = Field(default_factory=list)
    assigned_clients: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.staff
    password: Optional[str] = None
    consent_given: bool = False
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    birthday: Optional[Any] = None
    profile_picture: Optional[str] = None
    punch_in_time: Optional[str] = "10:30"
    grace_time: Optional[str] = "00:15"
    punch_out_time: Optional[str] = "19:00"
    telegram_id: Optional[int] = None
    permissions: UserPermissions = Field(default_factory=UserPermissions)
    created_at: Optional[Any] = None
    is_active: bool = True
    status: str = "pending_approval"
    approved_by: Optional[str] = None
    approved_at: Optional[Any] = None

    @field_validator("birthday", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: UserRole = UserRole.staff
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    birthday: Optional[Any] = None
    telegram_id: Optional[int] = None
    punch_in_time: Optional[str] = "10:30"
    grace_time: Optional[str] = "00:15"
    punch_out_time: Optional[str] = "19:00"
    profile_picture: Optional[str] = None
    is_active: bool = True
    permissions: Optional[Dict[str, Any]] = None
    status: Optional[str] = "pending_approval"


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    departments: Optional[List[str]] = None
    phone: Optional[str] = None
    birthday: Optional[Any] = None
    punch_in_time: Optional[str] = None
    grace_time: Optional[str] = None
    punch_out_time: Optional[str] = None
    is_active: Optional[bool] = None
    profile_picture: Optional[str] = None
    telegram_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True, extra="ignore")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User
    consent_given: Optional[bool] = None  # Fixed: was 'Noner'


# ======================
# TODOS & TASKS
# ======================
class Todo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    description: Optional[str] = None
    is_completed: bool = False
    status: str = "pending"
    due_date: Optional[Any] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[Any] = None


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[Any] = None
    is_completed: bool = False
    status: str = "pending"
    completed_at: Optional[Any] = None


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    sub_assignees: List[str] = Field(default_factory=list)
    due_date: Optional[Any] = None
    priority: str = "medium"
    status: str = "pending"
    category: str = "other"
    client_id: Optional[str] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = "monthly"
    recurrence_interval: Optional[int] = 1
    recurrence_end_date: Optional[Any] = None
    type: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class BulkTaskCreate(BaseModel):
    tasks: List[TaskCreate]


class Task(TaskBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None
    parent_task_id: Optional[str] = None


# ======================
# ATTENDANCE
# ======================
class AttendanceProof(BaseModel):
    """
    Embedded proof document stored inside an attendance record.
    All fields are optional — any combination of note / photos / documents is valid.
    """
    model_config = ConfigDict(extra="ignore")
    note: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    documents: List[str] = Field(default_factory=list)
    uploaded_at: Optional[str] = None
    updated_at: Optional[str] = None


class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    status: str = "absent"
    punch_in: Optional[Any] = None
    punch_out: Optional[Any] = None
    duration_minutes: Optional[int] = 0
    leave_reason: Optional[str] = None
    is_late: bool = False
    punched_out_early: bool = False
    auto_marked: Optional[bool] = False
    auto_punch_out: Optional[bool] = False
    auto_punch_reason: Optional[str] = None
    proof: Optional[AttendanceProof] = None
    overtime_minutes: Optional[int] = 0

    @field_validator("status", mode="before")
    @classmethod
    def normalise_status(cls, v: Any) -> str:
        if v is None or v == "":
            return "absent"
        return str(v)

    @field_validator("duration_minutes", "overtime_minutes", mode="before")
    @classmethod
    def coerce_duration(cls, v: Any) -> int:
        if v is None:
            return 0
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0

    @field_validator("is_late", "punched_out_early", "auto_marked", "auto_punch_out", mode="before")
    @classmethod
    def coerce_bool(cls, v: Any) -> bool:
        if v is None:
            return False
        if isinstance(v, bool):
            return v
        return bool(v)


class AttendanceBase(BaseModel):
    punch_in: Any
    punch_out: Optional[Any] = None


class AttendanceCreate(BaseModel):
    action: str


# ======================
# STAFF ACTIVITY
# ======================
class StaffActivityCreate(BaseModel):
    app_name: str = "Taskosphere Web"
    window_title: Optional[str] = None
    url: Optional[str] = None
    website: Optional[str] = None
    category: str = "productivity"
    duration_seconds: int = 0
    idle: Optional[bool] = False
    activity_type: str = "active_time"
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class StaffActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    activity_type: str = "active_time"
    app_name: str = "Taskosphere Web"
    window_title: Optional[str] = None
    url: Optional[str] = None
    category: str = "other"
    duration_seconds: int = 0
    timestamp: Optional[Any] = None
    metadata: Optional[Dict[str, Any]] = None


class ActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    screen_time_minutes: int = 0
    tasks_completed: int = 0


class ActivityLogUpdate(BaseModel):
    screen_time_minutes: Optional[int] = None
    tasks_completed: Optional[int] = None


# ======================
# DSC MANAGEMENT
# ======================
class DSCBase(BaseModel):
    holder_name: str
    dsc_type: Optional[str] = None
    dsc_password: Optional[str] = None
    associated_with: Optional[str] = None
    entity_type: str = "firm"
    issue_date: Any
    expiry_date: Any
    notes: Optional[str] = None
    current_status: str = "IN"
    current_location: str = "with_company"
    taken_by: Optional[str] = None
    taken_date: Optional[Any] = None
    movement_log: List[Any] = Field(default_factory=list)


class DSCCreate(DSCBase):
    pass


class DSC(DSCBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class DSCMovement(BaseModel):
    movement_type: str
    person_name: str
    timestamp: Optional[Any] = None
    notes: Optional[str] = None


class DSCListResponse(BaseModel):
    data: List[DSC]
    total: int
    page: int
    limit: int


class DSCMovementRequest(BaseModel):
    movement_type: str
    person_name: str
    notes: Optional[str] = None


class MovementUpdateRequest(BaseModel):
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None


# ======================
# REMINDER MODELS
# ======================
class ReminderCreate(BaseModel):
    title: str
    description: Optional[str] = None
    remind_at: Any
    event_id: Optional[str] = None
    source: Optional[str] = "manual"
    priority: Optional[str] = "medium"
    reminder_type: Optional[str] = "reminder"
    related_task_id: Optional[str] = None


class Reminder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    description: Optional[str] = None
    remind_at: Any
    event_id: Optional[str] = None
    source: Optional[str] = "manual"
    priority: Optional[str] = "medium"
    reminder_type: Optional[str] = "reminder"
    related_task_id: Optional[str] = None
    is_dismissed: bool = False
    is_fired: bool = False
    status: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None


# ======================
# DOCUMENT MANAGEMENT
# ======================
class DocumentBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    holder_name: Optional[str] = None
    associated_with: Optional[str] = None
    entity_type: str = "firm"
    issue_date: Optional[Any] = None
    valid_upto: Optional[Any] = None
    notes: Optional[str] = None
    current_status: str = "IN"
    current_location: str = "with_company"
    movement_log: List[Any] = Field(default_factory=list)

    @field_validator("issue_date", "valid_upto", mode="before")
    @classmethod
    def coerce_date_fields(cls, v: Any) -> Any:
        if v is None or v == "" or v == "null":
            return None
        if isinstance(v, (datetime, date)):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except ValueError:
                return None
        return v


class DocumentCreate(DocumentBase):
    pass


class Document(DocumentBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def coerce_created_at(cls, v: Any) -> Any:
        if v is None or v == "":
            return None
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except ValueError:
                return None
        return v


class DocumentMovement(BaseModel):
    movement_type: str
    person_name: str
    timestamp: Optional[Any] = None
    notes: Optional[str] = None


class DocumentMovementRequest(BaseModel):
    movement_type: str
    person_name: str
    notes: Optional[str] = None


class DocumentMovementUpdateRequest(BaseModel):
    movement_id: str
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None


# ======================
# CLIENT MANAGEMENT
# ======================
class ContactPerson(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    birthday: Optional[Any] = None
    din: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_contact_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            nullable = ["email", "phone", "designation", "birthday", "din"]
            for field in nullable:
                if field in data and data[field] == "":
                    data[field] = None
        return data


class ClientDSC(BaseModel):
    certificate_number: Optional[str] = None
    holder_name: Optional[str] = None
    issue_date: Optional[Any] = None
    expiry_date: Optional[Any] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_dsc_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ["certificate_number", "holder_name", "issue_date", "expiry_date", "notes"]:
                if field in data and data[field] == "":
                    data[field] = None
        return data


class ClientBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    company_name: str = Field(..., min_length=3, max_length=255)
    client_type: str = Field(..., pattern="^(proprietor|pvt_ltd|llp|partnership|huf|trust|other|LLP|PVT_LTD)$")
    client_type_label: Optional[str] = None
    contact_persons: List[ContactPerson] = Field(default_factory=list)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    date_of_incorporation: Optional[Any] = None
    birthday: Optional[Any] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = "active"
    services: List[str] = Field(default_factory=list)
    dsc_details: List[ClientDSC] = Field(default_factory=list)
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    referred_by: Optional[str] = None
    assignments: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="List of {user_id, services} assignments"
    )

    @model_validator(mode="before")
    @classmethod
    def clean_empty_optional_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            nullable_fields = [
                "email", "phone", "referred_by", "notes", "assigned_to",
                "birthday", "date_of_incorporation", "client_type_label",
                "address", "city", "state",
            ]
            for field in nullable_fields:
                if field in data and data[field] == "":
                    data[field] = None
        return data

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v) -> Optional[str]:
        if v is None or str(v).strip() == "":
            return None
        cleaned = re.sub(r"\s|-|\+", "", str(v))
        if not cleaned.isdigit():
            raise ValueError("Phone number must contain only digits")
        if not (10 <= len(cleaned) <= 15):
            raise ValueError("Phone number must be 10-15 digits")
        return v

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, v: str) -> str:
        v = str(v).strip()
        if len(v) < 3:
            raise ValueError("Company name must be at least 3 characters long")
        return v


class ClientCreate(ClientBase):
    pass


class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


class MasterClientForm(BaseModel):
    company_name: str
    client_type: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    date_of_incorporation: Optional[Any] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    tan_number: Optional[str] = None
    assigned_to: Optional[str] = None
    services: List[str] = Field(default_factory=list)
    contact_persons: List[Any] = Field(default_factory=list)
    notes: Optional[str] = None
    referred_by: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean_empty_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for k, v in data.items():
                if v == "":
                    data[k] = None
        return data


# ======================
# LEADS MODEL
# ======================
class LeadBase(BaseModel):
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    services: List[str] = Field(default_factory=list)
    status: str = "new"
    source: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    referred_by: Optional[str] = None


class LeadCreate(LeadBase):
    pass


class Lead(LeadBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None


# ======================
# DUE DATES & REMINDERS
# ======================
class DueDateBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Any
    reminder_days: int = 30
    category: Optional[str] = None
    department: str
    assigned_to: Optional[str] = None
    client_id: Optional[str] = None
    status: str = "pending"

    @field_validator("due_date", mode="before")
    @classmethod
    def coerce_due_date(cls, v: Any) -> Any:
        if v is None or v == "":
            raise ValueError("due_date is required")
        if isinstance(v, (date, datetime)):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except ValueError:
                pass
            try:
                return date.fromisoformat(v)
            except ValueError:
                raise ValueError(f"Invalid due_date format: {v}")
        return v

    @field_validator("reminder_days", mode="before")
    @classmethod
    def coerce_reminder_days(cls, v: Any) -> int:
        if v is None:
            return 30
        try:
            return int(v)
        except (TypeError, ValueError):
            return 30

    @field_validator("department", mode="before")
    @classmethod
    def coerce_department(cls, v: Any) -> str:
        if v is None or str(v).strip() == "":
            raise ValueError("department is required")
        return str(v).strip()


class DueDateCreate(DueDateBase):
    pass


class DueDate(DueDateBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: Optional[Any] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def coerce_created_at(cls, v: Any) -> Any:
        if v is None or v == "":
            return None
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except ValueError:
                return None
        return v


class BirthdayEmailRequest(BaseModel):
    client_id: str


# ======================
# NOTIFICATIONS & AUDIT
# ======================
class NotificationBase(BaseModel):
    title: str
    message: str
    type: str


class Notification(NotificationBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    is_read: bool = False
    created_at: Optional[Any] = None


class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    action: str
    module: str
    record_id: Optional[str] = None
    old_data: Optional[dict] = None
    new_data: Optional[dict] = None
    timestamp: Optional[Any] = None


# ======================
# DASHBOARD & METRICS
# ======================
class DashboardStats(BaseModel):
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    overdue_tasks: int
    total_dsc: int
    expiring_dsc_count: int
    expiring_dsc_list: List[dict]
    total_clients: int
    upcoming_birthdays: int
    upcoming_due_dates: int
    team_workload: List[dict]
    compliance_status: dict
    expired_dsc_count: int = 0


class PerformanceMetric(BaseModel):
    user_id: str
    user_name: str
    profile_picture: Optional[str] = None
    attendance_percent: float = 0.0
    total_hours: float = 0.0
    task_completion_percent: float = 0.0
    todo_ontime_percent: float = 0.0
    timely_punchin_percent: float = 0.0
    overall_score: float = 0.0
    rank: int = 0
    badge: str = "Good Performer"


# ======================
# HOLIDAY MODELS
# ======================
class HolidayCreate(BaseModel):
    date: Any
    name: str
    description: Optional[str] = None
    type: str = "manual"
    status: Optional[str] = "confirmed"


class HolidayResponse(BaseModel):
    date: Any
    name: str
    description: Optional[str] = None
    status: str = "confirmed"
    type: Optional[str] = "manual"


# ======================
# EMAIL INTEGRATION MODELS
# ======================
class EmailConnection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    provider: str
    method: str
    email_address: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[str] = None
    app_password_enc: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    connected_at: Optional[str] = None


class ExtractedEvent(BaseModel):
    title: str
    event_type: str
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    organizer: Optional[str] = None
    description: Optional[str] = None
    urgency: str = "medium"
    source_subject: str
    source_from: str
    source_date: str
    raw_snippet: Optional[str] = None


# ======================
# PASSWORD REPOSITORY MODELS
# ======================

PORTAL_TYPES_LIST = [
    "MCA", "DGFT", "TRADEMARK", "GST", "INCOME_TAX", "TDS",
    "EPFO", "ESIC", "TRACES", "MSME", "RERA", "ROC", "OTHER",
]


class PasswordEntryCreate(BaseModel):
    """Payload to create a new portal credential entry."""
    portal_name: str = Field(..., min_length=2, max_length=120)
    portal_type: str = "OTHER"
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None   # plain text — backend encrypts
    department: str = "OTHER"
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class PasswordEntryUpdate(BaseModel):
    portal_name: Optional[str] = None
    portal_type: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None
    department: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class PasswordEntry(BaseModel):
    """Public-facing model — never includes the encrypted password field."""
    model_config = ConfigDict(extra="ignore")
    id: str
    portal_name: str
    portal_type: str
    url: Optional[str] = None
    username: Optional[str] = None
    department: str
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []
    created_by: str
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_accessed_at: Optional[str] = None
    has_password: bool = False


class PasswordRevealResponse(BaseModel):
    id: str
    username: Optional[str]
    password: str
    portal_name: str


# ────────────────────────────────────────────────
# OFFBOARDING REQUEST
# ────────────────────────────────────────────────
class OffboardRequest(BaseModel):
    replacement_user_id: str
    transfer_tasks: bool = True
    transfer_clients: bool = True
    transfer_dsc: bool = True
    transfer_documents: bool = True
    transfer_todos: bool = True
    transfer_visits: bool = True
    transfer_leads: bool = True
    update_email: Optional[str] = None
    delete_old_user: bool = True
    notes: Optional[str] = None
