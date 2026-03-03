from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date
import uuid

# ALL MODELS
class UserPermissions(BaseModel):
 can_view_all_tasks: bool = False
 can_view_all_clients: bool = False
 can_view_all_dsc: bool = False
 can_view_documents: bool = False
 can_view_all_duedates: bool = False
 can_view_reports: bool = False
 can_manage_users: bool = False
 can_assign_tasks: bool = False # Can staff member assign tasks to others
 can_view_staff_activity: bool = False
 can_view_attendance: bool = False
 can_send_reminders: bool = False
 assigned_clients: List[str] = [] # List of client IDs user can access
 can_view_user_page: bool = False
 can_view_audit_logs: bool = False
 can_edit_tasks: bool = False
 can_edit_dsc: bool = False
 can_edit_documents: bool = False
 can_edit_due_dates: bool = False
 can_edit_users: bool = False
 can_download_reports: bool = False
 can_view_selected_users_reports: bool = False
 can_view_todo_dashboard: bool = False
 # Cross User Viewing
 view_other_tasks: List[str] = []
 view_other_attendance: List[str] = []
 view_other_reports: List[str] = []
 view_other_todos: List[str] = []
 view_other_activity: List[str] = []
 # Admin-like Feature Grants
 can_edit_clients: bool = False
 can_use_chat: bool = False
 can_view_all_leads: bool = False
 can_manage_settings: bool = False

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
class User(BaseModel):
 model_config = ConfigDict(extra="ignore")
 id: str
 email: str
 full_name: Optional[str] = None
 role: str = "staff"
 password: Optional[str] = None
 departments: List[str] = []
 phone: Optional[str] = None
 birthday: Optional[date] = None
 profile_picture: Optional[str] = None
 punch_in_time: Optional[str] = None
 grace_time: Optional[str] = "00:15"
 punch_out_time: Optional[str] = None
 telegram_id: Optional[int] = None
 permissions: UserPermissions = Field(default_factory=UserPermissions)
 created_at: datetime = Field(default_factory=datetime.utcnow)
 is_active: bool = True
class Attendance(BaseModel):
 model_config = ConfigDict(extra="ignore")
 id: str = Field(default_factory=lambda: str(uuid.uuid4()))
 user_id: str
 date: str
 status: str = "absent"
 punch_in: Optional[datetime] = None
 punch_out: Optional[datetime] = None
 leave_reason: Optional[str] = None
# Staff Activity Tracking
class StaffActivityLog(BaseModel):
 id: str = Field(default_factory=lambda: str(uuid.uuid4()))
 user_id: str
 app_name: str
 window_title: Optional[str] = None
 url: Optional[str] = None # For browser activity
 category: str = "other" # "browser", "productivity", "communication", "entertainment", "other"
 duration_seconds: int = 0
 timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class StaffActivityCreate(BaseModel):
 app_name: str
 window_title: Optional[str] = None
 url: Optional[str] = None
 category: str = "other"
 duration_seconds: int = 0
class UserLogin(BaseModel):
 email: EmailStr
 password: str
class Token(BaseModel):
 access_token: str
 token_type: str
 user: User
class TaskBase(BaseModel):
 title: str
 description: Optional[str] = None
 assigned_to: Optional[str] = None # Primary assignee
 sub_assignees: List[str] = [] # Additional staff members
 due_date: Optional[datetime] = None
 priority: str = "medium" # low, medium, high
 status: str = "pending" # pending, in_progress, completed
 category: str = "other"
 client_id: Optional[str] = None
 is_recurring: bool = False
 recurrence_pattern: Optional[str] = "monthly" # "daily", "weekly", "monthly", "yearly"
 recurrence_interval: Optional[int] = 1 # Every X days/weeks/months
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
 parent_task_id: Optional[str] = None # If this is a recurring instance
class DSCMovement(BaseModel):
 movement_type: str # "IN" or "OUT"
 person_name: str
 timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
 notes: Optional[str] = None
class DSCBase(BaseModel):
 holder_name: str
 dsc_type: Optional[str] = None # Type of DSC (Class 3, Signature, Encryption, etc.)
 dsc_password: Optional[str] = None # DSC Password
 associated_with: Optional[str] = None # firm or client name (not compulsory)
 entity_type: str = "firm" # "firm" or "client"
 issue_date: datetime
 expiry_date: datetime
 notes: Optional[str] = None
 current_location: str = "with_company" # "with_company", "with_client", "taken_by_client"
 taken_by: Optional[str] = None # Person who took it
 taken_date: Optional[datetime] = None
 movement_log: List[dict] = [] # Log of all movements
class DSCCreate(DSCBase):
 pass
class DSC(DSCBase):
 model_config = ConfigDict(extra="ignore")
 id: str = Field(default_factory=lambda: str(uuid.uuid4()))
 created_by: str
 created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class DSCListResponse(BaseModel):
 data: List[DSC]
 total: int
 page: int
 limit: int
class DSCMovementRequest(BaseModel):
 movement_type: str # "IN" or "OUT"
 person_name: str
 notes: Optional[str] = None
class MovementUpdateRequest(BaseModel):
 movement_id: str
 movement_type: str # "IN" or "OUT"
 person_name: Optional[str] = None
 notes: Optional[str] = None
# Due Date Reminder Models
class DueDateBase(BaseModel):
 title: str
 description: Optional[str] = None
 due_date: datetime
 reminder_days: int = 30
 category: Optional[str] = None
 department: str # ✅ ADD THIS
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
class AttendanceBase(BaseModel):
 punch_in: datetime
 punch_out: Optional[datetime] = None
class AttendanceCreate(BaseModel):
 action: str # "punch_in" or "punch_out"
class NotificationBase(BaseModel):
 title: str
 message: str
 type: str # "task", "dsc", "system"
class Notification(NotificationBase):
 model_config = ConfigDict(extra="ignore")
 id: str = Field(default_factory=lambda: str(uuid.uuid4()))
 user_id: str
 is_read: bool = False
 created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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
# Client Management Models - ENHANCED WITH VALIDATION
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
 client_type: str = Field(
  ...,
  pattern="^(proprietor|pvt_ltd|llp|partnership|huf|trust|other|LLP|PVT_LTD)$"
 )
 contact_persons: List[ContactPerson] = Field(default_factory=list)
 email: EmailStr
 phone: str = Field(..., min_length=10, max_length=20)
 date_of_incorporation: Optional[date] = None
 birthday: Optional[date] = None
 services: List[str] = Field(default_factory=list)
 dsc_details: List[ClientDSC] = Field(default_factory=list)
 assigned_to: Optional[str] = None
 notes: Optional[str] = None
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
class MasterClientForm(BaseModel):
 """Expanded model to capture ALL details from the sheet and form"""
 company_name: str
 client_type: str # pvt_ltd, llp, proprietor, etc.
 email: EmailStr
 phone: str
 date_of_incorporation: Optional[date] = None
 gst_number: Optional[str] = None
 pan_number: Optional[str] = None
 tan_number: Optional[str] = None
 assigned_to: Optional[str] = None # Personnel ID
 services: List[str] = []
 contact_persons: List[ContactPerson] = []
 notes: Optional[str] = None
class ClientCreate(ClientBase):
 pass
class Client(ClientBase):
 model_config = ConfigDict(extra="ignore")
 id: str = Field(default_factory=lambda: str(uuid.uuid4()))
 created_by: str
 created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
# Email Service Models
class BirthdayEmailRequest(BaseModel):
 client_id: str
# Dashboard Stats Models
class DashboardStats(BaseModel):
 total_tasks: int
 completed_tasks: int
 pending_tasks: int
 overdue_tasks: int
 total_dsc: int
 expiring_dsc_count: int
 expiring_dsc_list: List[dict] # List of expiring DSCs
 total_clients: int
 upcoming_birthdays: int
 upcoming_due_dates: int
 team_workload: List[dict]
 compliance_status: dict
 expired_dsc_count: int = 0
# ====================== NEW: PERFORMANCE METRIC MODEL (added here - no original line touched) ======================
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
# DOCUMENT MODELS
class DocumentMovement(BaseModel):
 movement_type: str # "IN" or "OUT"
 person_name: str
 timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
 notes: Optional[str] = None
class DocumentBase(BaseModel):
 document_name: Optional[str] = None
 document_type: Optional[str] = None
 holder_name: Optional[str] = None
 associated_with: Optional[str] = None
 entity_type: str = "firm" # firm or client
 issue_date: Optional[datetime] = None
 valid_upto: Optional[datetime] = None
 notes: Optional[str] = None
 current_status: str = "IN"
 current_location: str = "with_company"
 movement_log: List[dict] = []
class DocumentCreate(DocumentBase):
 pass
class Document(DocumentBase):
 model_config = ConfigDict(extra="ignore")
 id: str = Field(default_factory=lambda: str(uuid.uuid4()))
 created_by: str
 created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class DocumentMovementRequest(BaseModel):
 movement_type: str # IN / OUT
 person_name: str
 notes: Optional[str] = None
class DocumentMovementUpdateRequest(BaseModel):
 movement_id: str
 movement_type: str
 person_name: Optional[str] = None
 notes: Optional[str] = None
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
class UserCreate(BaseModel):
 email: str
 full_name: str
 password: str
 role: str = "staff"
 departments: List[str] = []
 phone: Optional[str] = None
 birthday: Optional[date] = None
 telegram_id: Optional[int] = None
 permissions: Dict[str, Any] = {}
# ==================== HOLIDAY MODELS (STEP 1 - added here) ====================
class HolidayCreate(BaseModel):
    date: date
    name: str
    description: Optional[str] = None
class HolidayResponse(BaseModel):
    date: date
    name: str
    description: Optional[str] = None
