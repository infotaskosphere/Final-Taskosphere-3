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
        "view_other_tasks": [],
        "view_other_attendance": [],
        "view_other_reports": [],
        "view_other_todos": [],
        "view_other_activity": [],
        "assigned_clients": [],
    },
    "manager": {
        "can_view_all_tasks": False,
        "can_view_all_clients": False,
        "can_view_all_dsc": False,
        "can_view_documents": True,
        "can_view_all_duedates": False,
        "can_view_reports": True,
        "can_view_attendance": True,
        "can_view_all_leads": False,
        "can_edit_tasks": True,
        "can_edit_clients": False,
        "can_edit_dsc": False,
        "can_edit_documents": False,
        "can_edit_due_dates": True,
        "can_edit_users": False,
        "can_download_reports": True,
        "can_manage_users": False,
        "can_manage_settings": False,
        "can_assign_tasks": True,
        "can_assign_clients": False,
        "can_view_staff_activity": True,
        "can_send_reminders": False,
        "can_view_user_page": False,
        "can_view_audit_logs": False,
        "can_view_selected_users_reports": True,
        "can_view_todo_dashboard": True,
        "can_use_chat": True,
        "can_view_staff_rankings": True,
        "can_delete_data": False,
        "can_delete_tasks": False,
        "view_other_tasks": [],
        "view_other_attendance": [],
        "view_other_reports": [],
        "view_other_todos": [],
        "view_other_activity": [],
        "assigned_clients": [],
    },
    "staff": {
        "can_view_all_tasks": False,
        "can_view_all_clients": False,
        "can_view_all_dsc": False,
        "can_view_documents": False,
        "can_view_all_duedates": False,
        "can_view_reports": True,
        "can_view_attendance": True,
        "can_view_all_leads": False,
        "can_edit_tasks": False,
        "can_edit_clients": False,
        "can_edit_dsc": False,
        "can_edit_documents": False,
        "can_edit_due_dates": False,
        "can_edit_users": False,
        "can_download_reports": True,
        "can_manage_users": False,
        "can_manage_settings": False,
        "can_assign_tasks": False,
        "can_assign_clients": False,
        "can_view_staff_activity": False,
        "can_send_reminders": False,
        "can_view_user_page": False,
        "can_view_audit_logs": False,
        "can_view_selected_users_reports": False,
        "can_view_todo_dashboard": True,
        "can_use_chat": True,
        "can_view_staff_rankings": False,
        "can_delete_data": False,
        "can_delete_tasks": False,
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
    # Specific access lists (Layer 3)
    view_other_tasks: List[str] = Field(default_factory=list)
    view_other_attendance: List[str] = Field(default_factory=list)
    view_other_reports: List[str] = Field(default_factory=list)
    view_other_todos: List[str] = Field(default_factory=list)
    view_other_activity: List[str] = Field(default_factory=list)
    assigned_clients: List[str] = Field(default_factory=list)


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.staff
    password: Optional[str] = None
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    birthday: Optional[date] = None
    profile_picture: Optional[str] = None
    punch_in_time: Optional[str] = "10:30"
    grace_time: Optional[str] = "00:15"
    punch_out_time: Optional[str] = "19:00"
    telegram_id: Optional[int] = None
    permissions: UserPermissions = Field(default_factory=UserPermissions)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    status: str = "pending_approval"
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None

    @field_validator('birthday', mode='before')
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
    birthday: Optional[date] = None
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
    birthday: Optional[date] = None
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
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(india_tz))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(india_tz))
    completed_at: Optional[datetime] = None


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    sub_assignees: List[str] = Field(default_factory=list)
    due_date: Optional[datetime] = None
    priority: str = "medium"
    status: str = "pending"
    category: str = "other"
    client_id: Optional[str] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = "monthly"
    recurrence_interval: Optional[int] = 1
    recurrence_end_date: Optional[datetime] = None
    type: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class BulkTaskCreate(BaseModel):
    tasks: List[TaskCreate]


class Task(TaskBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parent_task_id: Optional[str] = None


# ======================
# ATTENDANCE & ACTIVITY
# ======================
class Attendance(BaseModel):
    """
    Attendance record for a single user on a single date.

    is_late:
        Set to True at punch-in time when the user punches in AFTER their
        configured punch_in_time + grace_time window (both stored on the
        User document as HH:MM strings).  Stored permanently so historical
        reports stay accurate even if the shift schedule is later changed.

    punched_out_early:
        Set to True at punch-out time when the user punches out BEFORE their
        configured punch_out_time.  Stored permanently for the same reason.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    status: str = "absent"
    punch_in: Optional[datetime] = None
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = 0
    leave_reason: Optional[str] = None
    is_late: bool = False
    punched_out_early: bool = False


class AttendanceBase(BaseModel):
    punch_in: datetime
    punch_out: Optional[datetime] = None


class AttendanceCreate(BaseModel):
    action: str


class StaffActivityLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    app_name: str
    window_title: Optional[str] = None
    url: Optional[str] = None
    category: str = "other"
    duration_seconds: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StaffActivityCreate(BaseModel):
    app_name: Optional[str] = None
    window_title: Optional[str] = None
    website: Optional[str] = None
    category: Optional[str] = "other"
    duration_seconds: Optional[int] = 0
    idle: Optional[bool] = False


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
    issue_date: datetime
    expiry_date: datetime
    notes: Optional[str] = None
    current_location: str = "with_company"
    taken_by: Optional[str] = None
    taken_date: Optional[datetime] = None
    movement_log: List[dict] = Field(default_factory=list)


class DSCCreate(DSCBase):
    pass


class DSC(DSCBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DSCMovement(BaseModel):
    movement_type: str
    person_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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
    movement_id: str
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None


# ======================
# DOCUMENT MANAGEMENT
# ======================
class DocumentBase(BaseModel):
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    holder_name: Optional[str] = None
    associated_with: Optional[str] = None
    entity_type: str = "firm"
    issue_date: Optional[datetime] = None
    valid_upto: Optional[datetime] = None
    notes: Optional[str] = None
    current_status: str = "IN"
    current_location: str = "with_company"
    movement_log: List[dict] = Field(default_factory=list)


class DocumentCreate(DocumentBase):
    pass


class Document(DocumentBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentMovement(BaseModel):
    movement_type: str
    person_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    birthday: Optional[date] = None
    din: Optional[str] = None


class ClientDSC(BaseModel):
    certificate_number: str
    holder_name: str
    issue_date: date
    expiry_date: date
    notes: Optional[str] = None


class ClientBase(BaseModel):
    company_name: str = Field(..., min_length=3, max_length=255)
    client_type: str = Field(..., pattern="^(proprietor|pvt_ltd|llp|partnership|huf|trust|other|LLP|PVT_LTD)$")
    contact_persons: List[ContactPerson] = Field(default_factory=list)
    email: Optional[EmailStr] = None
    phone: str = Field(..., min_length=10, max_length=20)
    date_of_incorporation: Optional[date] = None
    birthday: Optional[date] = None
    services: List[str] = Field(default_factory=list)
    dsc_details: List[ClientDSC] = Field(default_factory=list)
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    referred_by: Optional[str] = None
    assignments: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="List of {user_id, services} assignments"
    )

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not v or not str(v).strip():
            raise ValueError('Phone number is required')
        cleaned = re.sub(r"\s|-|\+", "", str(v))
        if not cleaned.isdigit():
            raise ValueError('Phone number must contain only digits')
        if not (10 <= len(cleaned) <= 15):
            raise ValueError('Phone number must be 10-15 digits')
        return v

    @field_validator('company_name')
    @classmethod
    def validate_company_name(cls, v: str) -> str:
        v = str(v).strip()
        if len(v) < 3:
            raise ValueError('Company name must be at least 3 characters long')
        return v


class ClientCreate(ClientBase):
    pass


class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MasterClientForm(BaseModel):
    company_name: str
    client_type: str
    email: Optional[EmailStr] = None
    phone: str
    date_of_incorporation: Optional[date] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    tan_number: Optional[str] = None
    assigned_to: Optional[str] = None
    services: List[str] = Field(default_factory=list)
    contact_persons: List[Any] = Field(default_factory=list)
    notes: Optional[str] = None
    referred_by: Optional[str] = None

    @model_validator(mode='before')
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ======================
# DUE DATES & REMINDERS
# ======================
class DueDateBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    reminder_days: int = 30
    category: Optional[str] = None
    department: str
    assigned_to: Optional[str] = None
    client_id: Optional[str] = None
    status: str = "pending"


class DueDateCreate(DueDateBase):
    pass


class DueDate(DueDateBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    action: str
    module: str
    record_id: Optional[str] = None
    old_data: Optional[dict] = None
    new_data: Optional[dict] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    date: date
    name: str
    description: Optional[str] = None


class HolidayResponse(BaseModel):
    date: date
    name: str
    description: Optional[str] = None
