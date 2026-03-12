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


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class TokenData(BaseModel):
    user_id: Optional[str] = None


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
    machine_employee_id: Optional[str] = None  # numeric UID on eSSL/ZK device
    machine_synced: bool = False                # True once pushed to device

    # Account state
    is_active: bool = True
    status: str = "active"  # active | pending_approval | rejected

    # Integrations
    telegram_id: Optional[str] = None

    # Permissions (embedded for quick access checks)
    permissions: Optional[UserPermissions] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserUpdate(BaseModel):
    """
    Payload for PUT /users/{user_id}.
    machine_employee_id is deliberately excluded — use PUT /users/{user_id}/machine-id
    which performs the uniqueness check.
    """
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
    """Slim public-facing user shape returned in list endpoints."""
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
    status: str = "pending"          # pending | in_progress | completed
    priority: str = "medium"         # low | medium | high | urgent | critical
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


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "pending"
    priority: str = "medium"
    assigned_to: Optional[str] = None
    client_id: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[datetime] = None


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
    id: str
    title: str
    status: str = "pending"     # pending | completed
    is_completed: bool = False
    user_id: str
    due_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TodoCreate(BaseModel):
    title: str
    status: str = "pending"
    due_date: Optional[datetime] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    is_completed: Optional[bool] = None
    due_date: Optional[datetime] = None


# ══════════════════════════════════════════════════════════════════════════════
# Attendance
# ══════════════════════════════════════════════════════════════════════════════

# Punch source — used for audit and frontend badge display
MachinePunchSource = Literal["web", "machine"]


class AttendanceRecord(BaseModel):
    id: str
    user_id: str
    date: str                         # ISO date string YYYY-MM-DD
    punch_in: Optional[datetime] = None
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: str = "absent"            # present | absent | late | leave | holiday
    is_late: bool = False
    leave_reason: Optional[str] = None

    # Biometric source tracking
    source: MachinePunchSource = "web"
    machine_punch_type: Optional[str] = None  # e.g. "check-in", "check-out"

    # Location (web punch only)
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
    """
    Posted to POST /attendance/machine-sync by the sync engine.
    Endpoint must require admin authentication.
    """
    user_id: str           # internal Taskosphere user._id
    punch_time: datetime   # UTC naive datetime from device
    punch_type: str        # "0" = check-in, "1" = check-out (ZK convention)
    device_uid: str        # raw enrollment number from device record


# ══════════════════════════════════════════════════════════════════════════════
# Client
# ══════════════════════════════════════════════════════════════════════════════

class Client(BaseModel):
    id: str
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    assigned_to: List[str] = Field(default_factory=list)
    departments: List[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ClientCreate(BaseModel):
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    departments: List[str] = Field(default_factory=list)


class ClientUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    departments: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ══════════════════════════════════════════════════════════════════════════════
# DSC (Digital Signature Certificate)
# ══════════════════════════════════════════════════════════════════════════════

class DSCRecord(BaseModel):
    id: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    holder_name: str
    pan: Optional[str] = None
    expiry_date: Optional[datetime] = None
    issued_date: Optional[datetime] = None
    serial_number: Optional[str] = None
    class_type: Optional[str] = None    # Class 2 / Class 3
    purpose: Optional[str] = None
    storage_location: Optional[str] = None
    status: str = "active"              # active | expiring | expired
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DSCCreate(BaseModel):
    client_id: Optional[str] = None
    holder_name: str
    pan: Optional[str] = None
    expiry_date: Optional[datetime] = None
    issued_date: Optional[datetime] = None
    serial_number: Optional[str] = None
    class_type: Optional[str] = None
    purpose: Optional[str] = None
    storage_location: Optional[str] = None
    notes: Optional[str] = None


class DSCUpdate(BaseModel):
    holder_name: Optional[str] = None
    pan: Optional[str] = None
    expiry_date: Optional[datetime] = None
    issued_date: Optional[datetime] = None
    serial_number: Optional[str] = None
    class_type: Optional[str] = None
    purpose: Optional[str] = None
    storage_location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Due Dates / Compliance Calendar
# ══════════════════════════════════════════════════════════════════════════════

class DueDate(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    due_date: datetime
    days_remaining: Optional[int] = None
    category: Optional[str] = None     # GST | IT | TDS | ROC etc.
    recurrence: Optional[str] = None   # monthly | quarterly | annual
    is_global: bool = True
    assigned_to: List[str] = Field(default_factory=list)
    client_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class DueDateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    category: Optional[str] = None
    recurrence: Optional[str] = None
    is_global: bool = True
    assigned_to: List[str] = Field(default_factory=list)
    client_id: Optional[str] = None


class DueDateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    category: Optional[str] = None
    recurrence: Optional[str] = None
    is_global: Optional[bool] = None
    assigned_to: Optional[List[str]] = None
    client_id: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Document Register
# ══════════════════════════════════════════════════════════════════════════════

class Document(BaseModel):
    id: str
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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DocumentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    document_type: Optional[str] = None
    client_id: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


# ══════════════════════════════════════════════════════════════════════════════
# Lead Management
# ══════════════════════════════════════════════════════════════════════════════

class Lead(BaseModel):
    id: str
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None        # referral | website | cold-call etc.
    status: str = "new"                 # new | contacted | qualified | converted | lost
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
    type: str = "info"       # info | warning | success | error
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
    overdue_tasks: int = 0
    total_clients: int = 0
    total_dsc: int = 0
    expiring_dsc_count: int = 0
    expired_dsc_count: int = 0
    upcoming_due_dates: int = 0
    total_leads: int = 0
    team_workload: List[Dict[str, Any]] = Field(default_factory=list)


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
#
# FIX: This section was defined TWICE in the original file. The second block
# silently overrode the first (Python class redefinition). The second block
# also had `enabled: bool = False` while the first had `enabled: bool = True`,
# creating a confusing and unpredictable default. The duplicate block has been
# removed entirely. Only ONE canonical definition exists here.
#
# The chosen defaults are:
#   enabled: bool = False   ← safer; admin must explicitly turn the device on
#   sync_interval: int = 300 ← 5 minutes, matches essl_backend.py run() loop

class MachineConfig(BaseModel):
    """
    Persisted configuration for the eSSL/ZKTeco biometric device.
    Stored in MongoDB as a single document in the `machine_config` collection.
    """
    ip: str = "192.168.1.201"
    port: int = 4370
    password: str = ""
    # FIX: was True in first definition, False in duplicate. Keeping False —
    # device must be explicitly enabled by an admin after setup.
    enabled: bool = False
    sync_interval: int = 300   # seconds between attendance sync cycles
    user_sync_interval: int = 3600  # seconds between user list sync cycles


class MachineConfigUpdate(BaseModel):
    """
    All fields optional so the admin can PATCH individual settings.
    """
    ip: Optional[str] = None
    port: Optional[int] = None
    password: Optional[str] = None
    enabled: Optional[bool] = None
    sync_interval: Optional[int] = None
    user_sync_interval: Optional[int] = None


class MachineStatusResponse(BaseModel):
    """
    Returned by GET /api/machine/status.
    Combined in a single TCP connection (fixes minor bug #13).
    """
    connected: bool
    device_user_count: int = 0
    ip: str
    port: int
    enabled: bool
    last_attendance_sync: Optional[datetime] = None
    last_user_sync: Optional[datetime] = None


class MachineUserResponse(BaseModel):
    """
    Represents a single user record as stored on the biometric device.
    Returned by GET /api/machine/users.
    """
    uid: str              # enrollment number / machine_employee_id
    name: str
    privilege: int = 0    # 0=user, 14=admin on device
    card: Optional[str] = None


class MachineAttendanceLog(BaseModel):
    """
    Raw attendance log record read directly from the device.
    Returned by GET /api/machine/attendance-logs.
    FIX: timestamp is datetime (not str) for consistent JSON serialization.
    """
    uid: str
    timestamp: datetime   # UTC-naive, converted from device local time
    punch_type: int       # 0=check-in, 1=check-out (ZK convention)
    status: int = 0       # verify type from device


class MachineSyncResult(BaseModel):
    """
    Summary returned after a manual or scheduled sync operation.
    """
    synced: int = 0
    skipped: int = 0
    errors: int = 0
    new_records: int = 0
    message: str = ""


class MachineEmployeeIDUpdate(BaseModel):
    """
    Posted to PUT /users/{user_id}/machine-id.
    This is the ONLY correct way to update machine_employee_id — the dedicated
    endpoint checks for uniqueness across all users before saving.
    Pass null/None to unassign the user from the device.
    FIX: Optional[str] allows null to support unassigning.
    """
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
