from __future__ import annotations

from datetime import datetime, date
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ══════════════════════════════════════════════════════════════════════════════
# Auth / Identity
# ══════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str = "staff"
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    birthday: Optional[str] = None
    profile_picture: Optional[str] = None
    punch_in_time: Optional[str] = None
    grace_time: Optional[str] = None
    punch_out_time: Optional[str] = None
    telegram_id: Optional[str] = None


class TokenData(BaseModel):
    user_id: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[Any] = None


# ══════════════════════════════════════════════════════════════════════════════
# Permissions
# ══════════════════════════════════════════════════════════════════════════════

class UserPermissions(BaseModel):
    # Visibility
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_documents: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_view_todo_dashboard: bool = False
    can_view_audit_logs: bool = False
    can_view_all_leads: bool = False
    can_view_user_page: bool = False
    can_view_selected_users_reports: bool = False
    can_view_staff_activity: bool = False
    can_view_attendance: bool = False

    # Operations
    can_manage_users: bool = False
    can_assign_tasks: bool = False
    can_assign_clients: bool = False
    can_send_reminders: bool = False
    can_download_reports: bool = False
    can_manage_settings: bool = False
    can_use_chat: bool = False

    # Edits
    can_edit_tasks: bool = False
    can_edit_clients: bool = False
    can_edit_dsc: bool = False
    can_edit_documents: bool = False
    can_edit_due_dates: bool = False
    can_edit_users: bool = False

    # Cross-user visibility lists (store user IDs)
    view_other_tasks: List[str] = Field(default_factory=list)
    view_other_attendance: List[str] = Field(default_factory=list)
    view_other_reports: List[str] = Field(default_factory=list)
    view_other_todos: List[str] = Field(default_factory=list)
    view_other_activity: List[str] = Field(default_factory=list)

    # Assigned client portfolio
    assigned_clients: List[str] = Field(default_factory=list)


# ══════════════════════════════════════════════════════════════════════════════
# User
# ══════════════════════════════════════════════════════════════════════════════

class User(BaseModel):
    id: str
    full_name: str
    email: str
    role: str = "staff"
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    birthday: Optional[str] = None
    profile_picture: Optional[str] = None

    # Shift schedule
    punch_in_time: Optional[str] = None   # e.g. "10:30"
    grace_time: Optional[str] = None      # e.g. "00:10"
    punch_out_time: Optional[str] = None  # e.g. "19:00"

    # Biometric machine
    machine_employee_id: Optional[str] = None
    machine_synced: bool = False

    # Account state
    is_active: bool = True
    status: str = "active"  # active | pending_approval | rejected

    # Integrations
    telegram_id: Optional[str] = None

    # Permissions (embedded for quick access checks)
    permissions: Optional[UserPermissions] = Field(default_factory=UserPermissions)

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# FIX: AuthResponse defined AFTER User to avoid forward reference error
class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    departments: Optional[List[str]] = None
    phone: Optional[str] = None
    birthday: Optional[str] = None
    profile_picture: Optional[str] = None
    punch_in_time: Optional[str] = None
    grace_time: Optional[str] = None
    punch_out_time: Optional[str] = None
    telegram_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    profile_picture: Optional[str] = None
    punch_in_time: Optional[str] = None
    grace_time: Optional[str] = None
    punch_out_time: Optional[str] = None
    machine_employee_id: Optional[str] = None
    machine_synced: bool = False
    is_active: bool = True
    status: str = "active"
    created_at: Optional[datetime] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ══════════════════════════════════════════════════════════════════════════════
# Task
# ══════════════════════════════════════════════════════════════════════════════

class Task(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str = "pending"
    priority: str = "medium"
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    assigned_by_name: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Extended fields used in main.py
    sub_assignees: List[str] = Field(default_factory=list)
    comments: List[Any] = Field(default_factory=list)
    category: Optional[str] = "other"
    type: Optional[str] = "task"
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = "monthly"
    recurrence_interval: int = 1
    recurrence_end_date: Optional[datetime] = None


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "pending"
    priority: str = "medium"
    assigned_to: Optional[str] = None
    sub_assignees: List[str] = Field(default_factory=list)
    client_id: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[datetime] = None
    category: Optional[str] = "other"
    type: Optional[str] = "task"
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = "monthly"
    recurrence_interval: int = 1
    recurrence_end_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    client_id: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ══════════════════════════════════════════════════════════════════════════════
# Todo
# ══════════════════════════════════════════════════════════════════════════════

class Todo(BaseModel):
    id: str = Field(default="")
    title: str
    status: str = "pending"
    is_completed: bool = False
    user_id: str
    due_date: Optional[datetime] = None
    description: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = Field(default_factory=lambda: datetime.utcnow())


class TodoCreate(BaseModel):
    title: str
    status: str = "pending"
    description: Optional[str] = None
    due_date: Optional[datetime] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    is_completed: Optional[bool] = None
    due_date: Optional[datetime] = None


# ══════════════════════════════════════════════════════════════════════════════
# Attendance
# ══════════════════════════════════════════════════════════════════════════════

MachinePunchSource = Literal["web", "machine"]


class AttendanceRecord(BaseModel):
    id: str
    user_id: str
    date: str
    punch_in: Optional[datetime] = None
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: str = "absent"
    is_late: bool = False
    leave_reason: Optional[str] = None
    source: MachinePunchSource = "web"
    machine_punch_type: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AttendanceAction(BaseModel):
    action: Literal["punch_in", "punch_out"]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location: Optional[str] = None


class MachinePunchPayload(BaseModel):
    user_id: str
    punch_time: datetime
    punch_type: str
    device_uid: str


# ══════════════════════════════════════════════════════════════════════════════
# Client
# ══════════════════════════════════════════════════════════════════════════════

class Client(BaseModel):
    id: str
    company_name: str
    client_type: Optional[str] = "other"
    email: Optional[str] = None
    phone: Optional[str] = None
    birthday: Optional[date] = None
    services: List[str] = Field(default_factory=list)
    contact_persons: List[Any] = Field(default_factory=list)
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "active"
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ClientCreate(BaseModel):
    company_name: str
    client_type: Optional[str] = "other"
    email: Optional[str] = None
    phone: Optional[str] = None
    birthday: Optional[date] = None
    services: List[str] = Field(default_factory=list)
    contact_persons: List[Any] = Field(default_factory=list)
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "active"
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None


class ClientUpdate(BaseModel):
    company_name: Optional[str] = None
    client_type: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    birthday: Optional[date] = None
    services: Optional[List[str]] = None
    contact_persons: Optional[List[Any]] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_active: Optional[bool] = None


# ══════════════════════════════════════════════════════════════════════════════
# DSC (Digital Signature Certificate)
# ══════════════════════════════════════════════════════════════════════════════

class DSC(BaseModel):
    id: str = Field(default="")
    holder_name: str
    expiry_date: Optional[datetime] = None
    issue_date: Optional[datetime] = None
    certificate_number: Optional[str] = None
    dsc_type: Optional[str] = None
    associated_with: Optional[str] = None
    current_status: str = "IN"
    current_location: Optional[str] = None
    movement_log: List[Any] = Field(default_factory=list)
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.utcnow())


class DSCCreate(BaseModel):
    holder_name: str
    dsc_type: Optional[str] = None
    associated_with: Optional[str] = None
    certificate_number: Optional[str] = None
    issue_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    current_status: str = "IN"
    notes: Optional[str] = None


class DSCUpdate(BaseModel):
    holder_name: Optional[str] = None
    expiry_date: Optional[datetime] = None
    issue_date: Optional[datetime] = None
    certificate_number: Optional[str] = None
    dsc_type: Optional[str] = None
    associated_with: Optional[str] = None
    current_status: Optional[str] = None
    notes: Optional[str] = None


class DSCListResponse(BaseModel):
    data: List[Any]
    total: int
    page: int
    limit: int


# ══════════════════════════════════════════════════════════════════════════════
# Due Dates / Compliance Calendar
# ══════════════════════════════════════════════════════════════════════════════

class DueDate(BaseModel):
    id: str = Field(default="")
    title: str
    description: Optional[str] = None
    due_date: datetime
    days_remaining: Optional[int] = None
    category: Optional[str] = None
    department: Optional[str] = None
    status: str = "pending"
    recurrence: Optional[str] = None
    is_global: bool = True
    assigned_to: List[str] = Field(default_factory=list)
    client_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.utcnow())


class DueDateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    category: Optional[str] = None
    department: Optional[str] = None
    status: str = "pending"
    recurrence: Optional[str] = None
    is_global: bool = True
    assigned_to: List[str] = Field(default_factory=list)
    client_id: Optional[str] = None


class DueDateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    category: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None
    recurrence: Optional[str] = None
    is_global: Optional[bool] = None
    assigned_to: Optional[List[str]] = None
    client_id: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Document Register
# ══════════════════════════════════════════════════════════════════════════════

class Document(BaseModel):
    id: str = Field(default="")
    title: str
    description: Optional[str] = None
    document_type: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_active: bool = True
    uploaded_by: Optional[str] = None
    current_status: Optional[str] = "IN"
    movement_log: List[Any] = Field(default_factory=list)
    issue_date: Optional[datetime] = None
    valid_upto: Optional[datetime] = None
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


class DocumentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    document_type: Optional[str] = None
    client_id: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    issue_date: Optional[datetime] = None
    valid_upto: Optional[datetime] = None


# ══════════════════════════════════════════════════════════════════════════════
# Lead Management
# ══════════════════════════════════════════════════════════════════════════════

class Lead(BaseModel):
    id: str
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None
    status: str = "new"
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    notes: Optional[str] = None
    expected_value: Optional[float] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LeadCreate(BaseModel):
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    expected_value: Optional[float] = None


class LeadUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    expected_value: Optional[float] = None


# ══════════════════════════════════════════════════════════════════════════════
# Notifications
# ══════════════════════════════════════════════════════════════════════════════

class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: str = "info"
    is_read: bool = False
    link: Optional[str] = None
    created_at: Optional[datetime] = None


class NotificationCreate(BaseModel):
    user_id: str
    title: str
    message: str
    type: str = "info"
    link: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Reports / Dashboard
# ══════════════════════════════════════════════════════════════════════════════

class DashboardStats(BaseModel):
    total_tasks: int = 0
    completed_tasks: int = 0
    pending_tasks: int = 0
    overdue_tasks: int = 0
    total_dsc: int = 0
    expiring_dsc_count: int = 0
    expiring_dsc_list: List[Any] = Field(default_factory=list)
    total_clients: int = 0
    upcoming_birthdays: int = 0
    upcoming_due_dates: int = 0
    team_workload: List[Any] = Field(default_factory=list)
    compliance_status: Optional[dict] = None
    total_leads: int = 0
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
    badge: Optional[str] = None
    rank: Optional[int] = None


class PerformanceRanking(BaseModel):
    user_id: str
    user_name: str
    profile_picture: Optional[str] = None
    total_hours: float = 0.0
    overall_score: int = 0
    badge: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Machine Config  (eSSL / ZKTeco biometric device)
# ══════════════════════════════════════════════════════════════════════════════

class MachineConfig(BaseModel):
    ip: str = "192.168.1.201"
    port: int = 4370
    password: str = ""
    # FIX: False is safer default — admin must explicitly enable
    enabled: bool = False
    sync_interval: int = 300
    user_sync_interval: int = 3600


class MachineConfigUpdate(BaseModel):
    ip: Optional[str] = None
    port: Optional[int] = None
    password: Optional[str] = None
    enabled: Optional[bool] = None
    sync_interval: Optional[int] = None
    user_sync_interval: Optional[int] = None


class MachineStatusResponse(BaseModel):
    connected: bool
    device_user_count: int = 0
    ip: str
    port: int
    enabled: bool
    last_attendance_sync: Optional[datetime] = None
    last_user_sync: Optional[datetime] = None


class MachineUserResponse(BaseModel):
    uid: str
    name: str
    privilege: int = 0
    card: Optional[str] = None


class MachineAttendanceLog(BaseModel):
    uid: str
    timestamp: datetime
    punch_type: int
    status: int = 0


class MachineSyncResult(BaseModel):
    synced: int = 0
    skipped: int = 0
    errors: int = 0
    new_records: int = 0
    message: str = ""


class MachineEmployeeIDUpdate(BaseModel):
    machine_employee_id: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Generic Responses
# ══════════════════════════════════════════════════════════════════════════════

class MessageResponse(BaseModel):
    message: str
    success: bool = True
    data: Optional[Any] = None


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
