from fastapi.middleware.gzip import GZipMiddleware
import pytz
import logging
import smtplib
from datetime import datetime, timedelta, timezone, date
from bson import ObjectId
from fastapi import Request
from dateutil import parser
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from typing import List, Optional, Dict
from pydantic import BaseModel, Field, ConfigDict, EmailStr
import uuid
from passlib.context import CryptContext
from jose import jwt, JWTError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import csv
from io import StringIO, BytesIO
from fastapi.responses import StreamingResponse
from fpdf import FPDF
from math import radians, sin, cos, sqrt, atan2

OFFICE_LAT = 21.188057
OFFICE_LON = 72.813826
ALLOWED_RADIUS_METERS = 100

india_tz = pytz.timezone("Asia/Kolkata")
import requests
ALLOWED_TELEGRAM_IDS = []
allowed_id = os.getenv("ALLOWED_TELEGRAM_ID")
if allowed_id:
    ALLOWED_TELEGRAM_IDS.append(int(allowed_id))
   
def sanitize_user_data(user_data, current_user):
    """
    Remove sensitive fields for non-admin users
    """
    # If admin → return full data
    if current_user.role.lower() == "admin":
        return user_data
    # If list of users
    if isinstance(user_data, list):
        sanitized = []
        for u in user_data:
            u_dict = u.dict() if hasattr(u, "dict") else dict(u)
            sanitized.append(u_dict)
        return sanitized
    # If single user
    u_dict = user_data.dict() if hasattr(user_data, "dict") else dict(user_data)
    return u_dict
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
security = HTTPBearer()
# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
async def get_current_user(token: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if user is None:
        raise credentials_exception
    user["permissions"] = user.get("permissions", UserPermissions().model_dump())
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return User(**user)
def check_permission(permission_name: str):
    def dependency(current_user: User = Depends(get_current_user)):
        # Admin override
        if current_user.role == "admin":
            return current_user
        user_permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if not user_permissions.get(permission_name, False):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission"
            )
        return current_user
    return dependency
app = FastAPI()
@app.on_event("startup")
async def create_indexes():
    await db.tasks.create_index("assigned_to")
    await db.tasks.create_index("created_by")
    await db.tasks.create_index("due_date")
    await db.users.create_index("email")
    await db.staff_activity.create_index("user_id")
    await db.staff_activity.create_index("timestamp")
    await db.staff_activity.create_index([("user_id", 1), ("timestamp", -1)])
    await db.staff_activity.create_index("category")
    await db.due_dates.create_index("department")
    await db.attendance.create_index(
    [("user_id", 1), ("date", 1)],
    unique=True
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://final-taskosphere-frontend.onrender.com",
        "https://final-taskosphere-3.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    expose_headers=["*"],
)
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
    can_use_chat: bool = False
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
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "staff" # admin, manager, staff
    profile_picture: Optional[str] = None
    permissions: Optional[UserPermissions] = None # Custom permissions
    departments: List[str] = [] # Multiple departments: gst, income_tax, ...
    # Added office timing fields for late marking (optional, safe for existing users)
    expected_start_time: Optional[str] = None # "09:30" (24-hour format)
    expected_end_time: Optional[str] = None # "18:00"
    late_grace_minutes: int = 15 # Default grace period in minutes
    telegram_id: Optional[int] = None
class UserCreate(UserBase):
    password: str
class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(india_tz)
    )
    is_active: bool = True
class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    punch_in: datetime
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    is_late: bool = False
    late_by_minutes: int = 0
    location: Optional[Dict[str, float]] = None
    is_early_leave: bool = False
    early_minutes: int = 0
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
# Client Management Models
class ContactPerson(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
class ClientDSC(BaseModel):
    certificate_number: str
    holder_name: str
    issue_date: date
    expiry_date: date
    notes: Optional[str] = None
class ClientBase(BaseModel):
    company_name: str
    client_type: str # proprietor, pvt_ltd, llp, partnership, huf, trust
    contact_persons: List[ContactPerson] = [] # Multiple contacts
    email: EmailStr
    phone: str
    birthday: Optional[date] = None
    services: List[str] = [] # gst, trademark, income_tax, roc, etc
    dsc_details: List[ClientDSC] = [] # DSC certificates for this client
    assigned_to: Optional[str] = None # staff ID
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
# Chat & Messaging Models
class ChatGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    members: List[str] # List of user IDs
    is_direct: bool = False # True for 1-on-1 chats
class ChatGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    members: List[str]
    created_by: str
    is_direct: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_message_at: Optional[datetime] = None
class ChatMessageCreate(BaseModel):
    content: str
    message_type: str = "text" # text, image, file
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    sender_id: str
    sender_name: str
    content: str
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read_by: List[str] = []
class FileUploadResponse(BaseModel):
    file_url: str
    file_name: str
    file_size: int
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
# ROUTER
api_router = APIRouter(prefix="/api")
# HELPERS
# Email Service Functions
def send_birthday_email(recipient_email: str, client_name: str):
    """Send birthday wish email to client"""
    sendgrid_key = os.environ.get('SENDGRID_API_KEY')
    sender_email = os.environ.get('SENDER_EMAIL', 'noreply@taskosphere.com')
    if not sendgrid_key:
        logger.warning("SENDGRID_API_KEY not configured, email not sent")
        return False
    subject = f"Happy Birthday, {client_name}!"
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h1 style="color: #4F46E5; text-align: center;">���� Happy Birthday! ����</h1>
        <p style="font-size: 16px; line-height: 1.6; color: #333;">
            Dear {client_name},
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #333;">
            On behalf of our entire team, we wish you a very Happy Birthday! ����
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #333;">
            We appreciate your continued trust and partnership. May this year bring you prosperity, success, and happiness.
        </p>
        <div style="background-color: #4F46E5; color: white; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 18px; font-weight: bold;">
                Wishing you all the best!
            </p>
        </div>
        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
            Best regards,<br>
            <strong>Taskosphere Team</strong>
        </p>
    </div>
    </body>
    </html>
    """
    message = Mail(
        from_email=sender_email,
        to_emails=recipient_email,
        subject=subject,
        html_content=html_content
    )
    try:
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        logger.info(f"Birthday email sent to {recipient_email}, status: {response.status_code}")
        return response.status_code == 202
    except Exception as e:
        logger.error(f"Failed to send birthday email: {str(e)}")
        return False
# Task Analytics
@api_router.get("/tasks/analytics")
async def get_task_analytics(
    month: str,
    current_user: User = Depends(get_current_user)
):
    """ Get task analytics for a specific month (YYYY-MM) """
    # Fetch tasks (role-based filtering same as your /tasks endpoint)
    query = {}
    if current_user.role != "admin":
        query["$or"] = [
            {"assigned_to": current_user.id},
            {"sub_assignees": current_user.id},
            {"created_by": current_user.id}
        ]
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    total = 0
    completed = 0
    pending = 0
    for task in tasks:
        created = task.get("created_at")
        if isinstance(created, str):
            if created.startswith(month):
                total += 1
                if task.get("status") == "completed":
                    completed += 1
                elif task.get("status") == "pending":
                    pending += 1
        elif isinstance(created, datetime):
            if created.strftime("%Y-%m") == month:
                total += 1
                if task.get("status") == "completed":
                    completed += 1
                elif task.get("status") == "pending":
                    pending += 1
    return {
        "month": month,
        "total_tasks": total,
        "completed_tasks": completed,
        "pending_tasks": pending
    }
# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)
def get_password_hash(password):
    return pwd_context.hash(password)
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
# Email helper function
def send_email(to_email: str, subject: str, body: str):
    sendgrid_key = os.getenv("SENDGRID_API_KEY")
    sender_email = os.getenv("SENDER_EMAIL")
    if not sendgrid_key or not sender_email:
        raise Exception("SendGrid environment variables not configured")
    message = Mail(
        from_email=sender_email,
        to_emails=to_email,
        subject=subject,
        plain_text_content=body
    )
    try:
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        return response.status_code == 202
    except Exception as e:
        raise Exception(f"SendGrid error: {str(e)}")
async def create_audit_log(
    current_user: User,
    action: str,
    module: str,
    record_id: str,
    old_data: dict = None,
    new_data: dict = None
):
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
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.audit_logs.insert_one(doc)
# AUTH ROUTES
# Auth routes
@api_router.post("/auth/register", response_model=Token)
async def register(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        role="staff", # Force default role
        profile_picture=user_data.profile_picture,
        permissions=user_data.permissions,
        departments=user_data.departments,
        # Added office timing fields for late marking (optional, safe for existing users)
        expected_start_time=user_data.expected_start_time, # "09:30" (24-hour format)
        expected_end_time=user_data.expected_end_time, # "18:00"
        late_grace_minutes=user_data.late_grace_minutes # Default grace period in minutes
    )
    default_permissions = {
        "can_view_all_tasks": False,
        "can_view_all_clients": False,
        "can_view_all_dsc": False,
        "can_view_documents": False,
        "can_view_all_duedates": False,
        "can_view_reports": False,
        "can_manage_users": False,
        "can_assign_tasks": False,
        "can_view_staff_activity": False,
        "can_view_attendance": False,
        "can_use_chat": False,
        "can_send_reminders": False,
        "assigned_clients": [],
        "can_view_user_page": False,
        "can_view_audit_logs": False,
        "can_edit_tasks": False,
        "can_edit_dsc": False,
        "can_edit_documents": False,
        "can_edit_due_dates": False,
        "can_edit_users": False,
        "can_download_reports": False,
        "can_view_selected_users_reports": False
    }
    doc = user.model_dump()
    doc["password"] = hashed_password
    doc["created_at"] = doc["created_at"].isoformat()
    doc["permissions"] = default_permissions
    await db.users.insert_one(doc)
    access_token = create_access_token({"sub": user.id})
    return {"access_token": access_token, "token_type": "bearer", "user": user}
@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user["permissions"] = user.get("permissions", UserPermissions().model_dump())
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    user_obj = User(**{k: v for k, v in user.items() if k != "password"})
    access_token = create_access_token({"sub": user_obj.id})
    return {"access_token": access_token, "token_type": "bearer", "user": user_obj}
@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    # Explicitly build the response to guarantee the fields are included
    return sanitize_user_data({
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "profile_picture": current_user.profile_picture,
        "permissions": current_user.permissions.model_dump() if current_user.permissions else None,
        "departments": current_user.departments,
        # ───────────────────────────────────────────────────────────────
        # These are the two fields you need for per-user late calculation
        "expected_start_time": current_user.expected_start_time,
        "late_grace_minutes": current_user.late_grace_minutes,
        # ───────────────────────────────────────────────────────────────
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "is_active": current_user.is_active
    }, current_user)
# ATTENDANCE ROUTE
@api_router.post("/attendance")
async def record_attendance(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    india_tz = pytz.timezone("Asia/Kolkata")
    now = datetime.now(india_tz)
    today_str = now.date().isoformat()

    # =========================
    # 🔹 PUNCH IN
    # =========================
    if data["action"] == "punch_in":

        existing = await db.attendance.find_one(
            {"user_id": current_user.id, "date": today_str},
            {"_id": 0}
        )
        if existing:
            raise HTTPException(status_code=400, detail="Already punched in today")

        # ✅ GEO-FENCING (ONLY PUNCH IN)
        location = data.get("location")
        if not location:
            raise HTTPException(status_code=400, detail="Location required")

        user_lat = location.get("latitude")
        user_lon = location.get("longitude")

        if user_lat is None or user_lon is None:
            raise HTTPException(status_code=400, detail="Invalid location data")

        distance = calculate_distance(
            float(user_lat),
            float(user_lon),
            OFFICE_LAT,
            OFFICE_LON
        )

        if distance > ALLOWED_RADIUS_METERS:
            raise HTTPException(
                status_code=403,
                detail=f"Punch-in allowed only from office. You are {int(distance)} meters away."
            )

        # ⏰ Late Calculation
        is_late = False
        late_by_minutes = 0
        expected_str = current_user.expected_start_time
        grace = current_user.late_grace_minutes or 15

        if expected_str:
            try:
                from datetime import time
                h, m = map(int, expected_str.split(":"))
                expected_time = time(h, m)

                expected_datetime = datetime.combine(
                    now.date(),
                    expected_time,
                    tzinfo=india_tz
                )

                if now > expected_datetime:
                    diff = now - expected_datetime
                    late_by_minutes = int(diff.total_seconds() / 60)
                    if late_by_minutes > grace:
                        is_late = True
            except:
                pass

        doc = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "date": today_str,
            "punch_in": now.isoformat(),
            "punch_out": None,
            "duration_minutes": None,
            "is_late": is_late,
            "late_by_minutes": late_by_minutes if is_late else 0,
            "location": location,
            "distance_from_office_meters": int(distance)
        }

        await db.attendance.insert_one(doc)
        return Attendance(**doc)

    # =========================
    # 🔹 PUNCH OUT
    # =========================
    elif data["action"] == "punch_out":

        existing = await db.attendance.find_one(
            {"user_id": current_user.id, "date": today_str},
            {"_id": 0}
        )

        if not existing:
            raise HTTPException(status_code=400, detail="No punch in record found")

        if existing.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out today")

        punch_in_time = datetime.fromisoformat(existing["punch_in"])
        duration = int((now - punch_in_time).total_seconds() / 60)

        is_early_leave = False
        early_minutes = 0

        if current_user.expected_end_time:
            try:
                from datetime import time
                h, m = map(int, current_user.expected_end_time.split(":"))
                expected_out_time = time(h, m)

                expected_dt = datetime.combine(
                    now.date(),
                    expected_out_time,
                    tzinfo=india_tz
                )

                if now < expected_dt:
                    diff = expected_dt - now
                    early_minutes = int(diff.total_seconds() / 60)
                    is_early_leave = True
            except:
                pass

        # 🔎 Location tracking only (no geo restriction)
        punch_out_location = data.get("location")

        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today_str},
            {
                "$set": {
                    "punch_out": now.isoformat(),
                    "duration_minutes": duration,
                    "is_early_leave": is_early_leave,
                    "early_minutes": early_minutes,
                    "punch_out_location": punch_out_location
                }
            }
        )

        updated = await db.attendance.find_one(
            {"user_id": current_user.id, "date": today_str},
            {"_id": 0}
        )

        return Attendance(**updated)

    else:
        raise HTTPException(status_code=400, detail="Invalid action")
# User routes
@api_router.get("/users", response_model=List[User])
async def get_users(current_user: User = Depends(check_permission("can_view_user_page"))):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    for user in users:
        if isinstance(user["created_at"], str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    return sanitize_user_data(users, current_user)
@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, user_data: dict, current_user: User = Depends(check_permission("can_edit_users"))):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    # Only allow updating these fields
    allowed_fields = ["full_name", "role", "departments"]
    update_data = {k: v for k, v in user_data.items() if k in allowed_fields}
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    await create_audit_log(
        current_user,
        action="UPDATE_USER",
        module="user",
        record_id=user_id,
        old_data=existing,
        new_data=update_data
    )
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return sanitize_user_data(User(**updated), current_user)
@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(check_permission("can_edit_users"))):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await create_audit_log(
        current_user,
        action="DELETE_USER",
        module="user",
        record_id=user_id,
        old_data=existing
    )
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}
@api_router.get("/users/{user_id}/permissions")
async def get_permissions(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    user = await db.users.find_one({"id": user_id})
    return user.get("permissions", {})
# Task routes
@api_router.post("/tasks", response_model=Task)
async def create_task(task_data: TaskCreate, current_user: User = Depends(get_current_user)):
    task = Task(**task_data.model_dump(), created_by=current_user.id)
    doc = task.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    if doc["due_date"]:
        doc["due_date"] = doc["due_date"].isoformat()
    await db.tasks.insert_one(doc)
    return task
@api_router.post("/tasks/bulk")
async def create_tasks_bulk(
    payload: BulkTaskCreate,
    current_user: User = Depends(get_current_user)
):
    created_tasks = []
    for task_data in payload.tasks:
        task_dict = task_data.dict()
        # Add creator info
        task_dict["id"] = str(uuid.uuid4())
        task_dict["created_by"] = current_user.id
        task_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        task_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        if task_dict.get("due_date"):
            task_dict["due_date"] = task_dict["due_date"].isoformat()
        await db.tasks.insert_one(task_dict)
        created_tasks.append(task_dict)
    return {
        "message": "Tasks created successfully",
        "count": len(created_tasks)
    }
@api_router.post("/tasks/import")
async def import_tasks_from_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if file.content_type != 'text/csv':
        raise HTTPException(400, "Invalid file type")
    content = await file.read()
    content_str = content.decode('utf-8')
    csv_reader = csv.DictReader(StringIO(content_str))
    tasks = []
    for row in csv_reader:
        task_data = TaskCreate(
            title=row.get('title', ''),
            description=row.get('description'),
            assigned_to=row.get('assigned_to'),
            sub_assignees=row.get('sub_assignees', '').split(',') if row.get('sub_assignees') else [],
            due_date=parser.parse(row['due_date']) if row.get('due_date') else None,
            priority=row.get('priority', 'medium'),
            status=row.get('status', 'pending'),
            category=row.get('category', 'other'),
            client_id=row.get('client_id'),
            is_recurring=bool(row.get('is_recurring', False)),
            recurrence_pattern=row.get('recurrence_pattern', 'monthly'),
            recurrence_interval=int(row.get('recurrence_interval', 1))
        )
        tasks.append(task_data)
    payload = BulkTaskCreate(tasks=tasks)
    return await create_tasks_bulk(payload, current_user)
@api_router.get("/tasks")
async def get_tasks(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.role == "admin":
        pass
    else:
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        # If user does NOT have view-all permission
        if not permissions.get("can_view_all_tasks", False):
            query["$or"] = [
                {"assigned_to": current_user.id},
                {"sub_assignees": current_user.id},
                {"created_by": current_user.id} # 🔥 THIS IS NEW
            ]
    query["type"] = {"$ne": "todo"}
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    # 🔥 Get all user IDs involved
    user_ids = set()
    for task in tasks:
        if task.get("assigned_to"):
            user_ids.add(task.get("assigned_to"))
        if task.get("created_by"):
            user_ids.add(task.get("created_by"))
    users = await db.users.find(
        {"id": {"$in": list(user_ids)}},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    user_map = {u["id"]: u["full_name"] for u in users}
    for task in tasks:
        # Convert dates properly
        if isinstance(task["created_at"], str):
            task["created_at"] = datetime.fromisoformat(task["created_at"])
        if isinstance(task["updated_at"], str):
            task["updated_at"] = datetime.fromisoformat(task["updated_at"])
        if task.get("due_date") and isinstance(task["due_date"], str):
            task["due_date"] = datetime.fromisoformat(task["due_date"])
        # 🔥 ADD NAME FIELDS
        task["assigned_to_name"] = user_map.get(task.get("assigned_to"), "Unknown")
        task["created_by_name"] = user_map.get(task.get("created_by"), "Unknown")
    return tasks
@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role != "admin":
        if task.get("assigned_to") != current_user.id and current_user.id not in task.get("sub_assignees", []):
            raise HTTPException(status_code=403, detail="Not authorized")
    if isinstance(task["created_at"], str):
        task["created_at"] = datetime.fromisoformat(task["created_at"])
    if isinstance(task["updated_at"], str):
        task["updated_at"] = datetime.fromisoformat(task["updated_at"])
    if task.get("due_date") and isinstance(task["due_date"], str):
        task["due_date"] = datetime.fromisoformat(task["due_date"])
    return Task(**task)
@api_router.patch("/tasks/{task_id}", response_model=Task)
async def patch_task(
    task_id: str,
    updates: dict,
    current_user: User = Depends(check_permission("can_edit_tasks"))
):
    existing_task = await db.tasks.find_one({"id": task_id})
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")
    if updates.get("status") == "completed":
        updates["completed_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": updates}
    )
    await create_audit_log(
        current_user,
        action="UPDATE_TASK",
        module="task",
        record_id=task_id,
        old_data=existing_task,
        new_data=updates
    )
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return Task(**updated_task)
@api_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_data: TaskCreate, current_user: User = Depends(check_permission("can_edit_tasks"))):
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = task_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update_data.get("due_date"):
        update_data["due_date"] = update_data["due_date"].isoformat()
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    await create_audit_log(
        current_user,
        action="UPDATE_TASK",
        module="task",
        record_id=task_id,
        old_data=existing,
        new_data=update_data
    )
    updated = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated["updated_at"], str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    if updated.get("due_date") and isinstance(updated["due_date"], str):
        updated["due_date"] = datetime.fromisoformat(updated["due_date"])
    return Task(**updated)
@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(check_permission("can_edit_tasks"))):
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    await create_audit_log(
        current_user,
        action="DELETE_TASK",
        module="task",
        record_id=task_id,
        old_data=existing
    )
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}
@api_router.get("/tasks/{task_id}/export-log-pdf")
async def export_task_log_pdf(
    task_id: str,
    current_user: User = Depends(check_permission("can_view_audit_logs"))
):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    logs = await db.audit_logs.find(
        {"module": "task", "record_id": task_id},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, txt="Task Lifecycle Report", ln=True, align="C")
    pdf.ln(5)
    pdf.multi_cell(0, 8, f"Title: {task.get('title')}")
    pdf.multi_cell(0, 8, f"Description: {task.get('description')}")
    pdf.multi_cell(0, 8, f"Assigned To: {task.get('assigned_to')}")
    pdf.multi_cell(0, 8, f"Created By: {task.get('created_by')}")
    pdf.multi_cell(0, 8, f"Created At: {task.get('created_at')}")
    pdf.ln(5)
    pdf.cell(200, 10, txt="Timeline:", ln=True)
    pdf.ln(5)
    for log in logs:
        pdf.multi_cell(
            0,
            8,
            f"{log.get('timestamp')} - {log.get('action')} by {log.get('user_name')}"
        )
        if log.get("old_data"):
            pdf.multi_cell(0, 8, f"Details: {log.get('old_data')}")
        pdf.ln(3)
    output = BytesIO()
    output.write(pdf.output(dest="S").encode("latin1"))
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=task_log_{task_id}.pdf"}
    )
# Dsc Routes
@api_router.post("/dsc", response_model=DSC)
async def create_dsc(dsc_data: DSCCreate, current_user: User = Depends(get_current_user)):
    dsc = DSC(**dsc_data.model_dump(), created_by=current_user.id)
    doc = dsc.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["issue_date"] = doc["issue_date"].isoformat()
    doc["expiry_date"] = doc["expiry_date"].isoformat()
    await db.dsc_register.insert_one(doc)
    return dsc
@api_router.get("/dsc", response_model=List[DSC])
async def get_dsc_list(current_user: User = Depends(check_permission("can_view_all_dsc"))):
    dsc_list = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
    for dsc in dsc_list:
        if isinstance(dsc["created_at"], str):
            dsc["created_at"] = datetime.fromisoformat(dsc["created_at"])
        if isinstance(dsc["issue_date"], str):
            dsc["issue_date"] = datetime.fromisoformat(dsc["issue_date"])
        if isinstance(dsc["expiry_date"], str):
            dsc["expiry_date"] = datetime.fromisoformat(dsc["expiry_date"])
        now = datetime.now(timezone.utc)
        if dsc["expiry_date"] < now:
            movement_log = dsc.get("movement_log", [])
            updated = False
            if not any(log.get("movement_type") == "EXPIRED" for log in movement_log):
                new_log = {
                    "id": str(uuid.uuid4()),
                    "movement_type": "EXPIRED",
                    "person_name": "System Auto",
                    "notes": "Auto marked as expired",
                    "timestamp": now.isoformat(),
                    "recorded_by": "System"
                }
                movement_log.append(new_log)
                dsc["movement_log"] = movement_log
                updated = True
            if dsc.get("current_status") != "EXPIRED":
                dsc["current_status"] = "EXPIRED"
                updated = True
            if updated:
                await db.dsc_register.update_one(
                    {"id": dsc["id"]},
                    {"$set": {
                        "current_status": "EXPIRED",
                        "movement_log": movement_log
                    }}
                )
    return dsc_list
@api_router.put("/dsc/{dsc_id}", response_model=DSC)
async def update_dsc(dsc_id: str, dsc_data: DSCCreate, current_user: User = Depends(check_permission("can_edit_dsc"))):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    update_data = dsc_data.model_dump()
    update_data["issue_date"] = update_data["issue_date"].isoformat()
    update_data["expiry_date"] = update_data["expiry_date"].isoformat()
    await db.dsc_register.update_one({"id": dsc_id}, {"$set": update_data})
    await create_audit_log(
        current_user,
        action="UPDATE_DSC",
        module="dsc",
        record_id=dsc_id,
        old_data=existing,
        new_data=update_data
    )
    updated = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated["issue_date"], str):
        updated["issue_date"] = datetime.fromisoformat(updated["issue_date"])
    if isinstance(updated["expiry_date"], str):
        updated["expiry_date"] = datetime.fromisoformat(updated["expiry_date"])
    return DSC(**updated)
@api_router.delete("/dsc/{dsc_id}")
async def delete_dsc(dsc_id: str, current_user: User = Depends(check_permission("can_edit_dsc"))):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    await create_audit_log(
        current_user,
        action="DELETE_DSC",
        module="dsc",
        record_id=dsc_id,
        old_data=existing
    )
    result = await db.dsc_register.delete_one({"id": dsc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="DSC not found")
    return {"message": "DSC deleted successfully"}
@api_router.post("/dsc/{dsc_id}/movement")
async def record_dsc_movement(
    dsc_id: str,
    movement_data: DSCMovementRequest,
    current_user: User = Depends(get_current_user)
):
    """Record DSC IN/OUT movement"""
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    # Create movement record
    movement = {
        "id": str(uuid.uuid4()), # Add unique ID for each movement
        "movement_type": movement_data.movement_type,
        "person_name": movement_data.person_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": movement_data.notes,
        "recorded_by": current_user.full_name
    }
    # Update DSC status and append to log
    movement_log = existing.get("movement_log", [])
    movement_log.append(movement)
    await db.dsc_register.update_one(
        {"id": dsc_id},
        {
            "$set": {
                "current_status": movement_data.movement_type,
                "current_location": "with_company" if movement_data.movement_type == "IN" else "taken_by_client",
                "movement_log": movement_log
            }
        }
    )
    await create_audit_log(
        current_user,
        action="UPDATE_DSC",
        module="dsc",
        record_id=dsc_id,
        old_data=existing,
        new_data={"movement_log": movement_log}
    )
    return {"message": f"DSC marked as {movement_data.movement_type}", "movement": movement}
@api_router.put("/dsc/{dsc_id}/movement/{movement_id}")
async def update_dsc_movement(
    dsc_id: str,
    movement_id: str,
    update_data: MovementUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a specific movement log entry"""
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    movement_log = existing.get("movement_log", [])
    movement_found = False
    for i, movement in enumerate(movement_log):
        if movement.get("id") == movement_id:
            # Update the movement
            movement_log[i]["movement_type"] = update_data.movement_type
            if update_data.person_name:
                movement_log[i]["person_name"] = update_data.person_name
            if update_data.notes is not None:
                movement_log[i]["notes"] = update_data.notes
            movement_log[i]["edited_by"] = current_user.full_name
            movement_log[i]["edited_at"] = datetime.now(timezone.utc).isoformat()
            movement_found = True
            break
    if not movement_found:
        raise HTTPException(status_code=404, detail="Movement entry not found")
    # Determine new current status based on most recent movement
    new_status = movement_log[-1]["movement_type"] if movement_log else "IN"
    await db.dsc_register.update_one(
        {"id": dsc_id},
        {
            "$set": {
                "current_status": new_status,
                "movement_log": movement_log
            }
        }
    )
    await create_audit_log(
        current_user,
        action="UPDATE_DSC",
        module="dsc",
        record_id=dsc_id,
        old_data=existing,
        new_data={"movement_log": movement_log}
    )
    return {"message": "Movement updated successfully", "movement_log": movement_log}
# DOCUMENT ROUTES
# DOCUMENT REGISTER ROUTES
@api_router.post("/documents", response_model=Document)
async def create_document(document_data: DocumentCreate, current_user: User = Depends(get_current_user)):
    document = Document(**document_data.model_dump(), created_by=current_user.id)
    doc = document.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("issue_date"):
        doc["issue_date"] = doc["issue_date"].isoformat()
    if doc.get("valid_upto"):
        doc["valid_upto"] = doc["valid_upto"].isoformat()
    await db.documents.insert_one(doc)
    return document
@api_router.get("/documents", response_model=List[Document])
async def get_documents(current_user: User = Depends(check_permission("can_view_documents"))):
    documents = await db.documents.find({}, {"_id": 0}).to_list(1000)
    for d in documents:
        if isinstance(d["created_at"], str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
        if d.get("issue_date") and isinstance(d["issue_date"], str):
            d["issue_date"] = datetime.fromisoformat(d["issue_date"])
        if d.get("valid_upto") and isinstance(d["valid_upto"], str):
            d["valid_upto"] = datetime.fromisoformat(d["valid_upto"])
    return documents
@api_router.put("/documents/{document_id}", response_model=Document)
async def update_document(document_id: str, document_data: DocumentCreate, current_user: User = Depends(check_permission("can_edit_documents"))):
    existing = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")
    update_data = document_data.model_dump()
    if update_data.get("issue_date"):
        update_data["issue_date"] = update_data["issue_date"].isoformat()
    if update_data.get("valid_upto"):
        update_data["valid_upto"] = update_data["valid_upto"].isoformat()
    await db.documents.update_one({"id": document_id}, {"$set": update_data})
    await create_audit_log(
        current_user,
        action="UPDATE_DOCUMENT",
        module="document",
        record_id=document_id,
        old_data=existing,
        new_data=update_data
    )
    updated = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Document(**updated)
@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: User = Depends(check_permission("can_edit_documents"))):
    existing = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")
    await create_audit_log(
        current_user,
        action="DELETE_DOCUMENT",
        module="document",
        record_id=document_id,
        old_data=existing
    )
    result = await db.documents.delete_one({"id": document_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}
@api_router.post("/documents/{document_id}/movement")
async def record_document_movement(
    document_id: str,
    movement_data: DocumentMovementRequest,
    current_user: User = Depends(get_current_user)
):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    movement = {
        "id": str(uuid.uuid4()),
        "movement_type": movement_data.movement_type,
        "person_name": movement_data.person_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": movement_data.notes,
        "recorded_by": current_user.full_name
    }
    movement_log = document.get("movement_log", [])
    movement_log.append(movement)
    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "current_status": movement_data.movement_type,
                "movement_log": movement_log
            }
        }
    )
    await create_audit_log(
        current_user,
        action="UPDATE_DOCUMENT",
        module="document",
        record_id=document_id,
        old_data=document,
        new_data={"movement_log": movement_log}
    )
    return {"message": "Movement recorded successfully"}
@api_router.put("/documents/{document_id}/movement/{movement_id}")
async def update_document_movement(
    document_id: str,
    movement_id: str,
    update_data: DocumentMovementRequest,
    current_user: User = Depends(get_current_user)
):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    movement_log = document.get("movement_log", [])
    movement_found = False
    for i, movement in enumerate(movement_log):
        if movement.get("id") == movement_id:
            movement_log[i]["movement_type"] = update_data.movement_type
            movement_log[i]["person_name"] = update_data.person_name
            movement_log[i]["notes"] = update_data.notes
            movement_log[i]["edited_by"] = current_user.full_name
            movement_log[i]["edited_at"] = datetime.now(timezone.utc).isoformat()
            movement_found = True
            break
    if not movement_found:
        raise HTTPException(status_code=404, detail="Movement entry not found")
    # Update current status based on latest movement
    new_status = movement_log[-1]["movement_type"] if movement_log else "IN"
    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "current_status": new_status,
                "movement_log": movement_log
            }
        }
    )
    await create_audit_log(
        current_user,
        action="UPDATE_DOCUMENT",
        module="document",
        record_id=document_id,
        old_data=document,
        new_data={"movement_log": movement_log}
    )
    return {"message": "Movement updated successfully"}
# ATTENDANCE ROUTES
# Attendance routes
@api_router.get("/attendance/today", response_model=Optional[Attendance])
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today = datetime.now(india_tz).strftime("%Y-%m-%d")
    attendance = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
    if not attendance:
        return None
    if isinstance(attendance["punch_in"], str):
        attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
    if attendance.get("punch_out") and isinstance(attendance["punch_out"], str):
        attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])
    return Attendance(**attendance)
@api_router.get("/attendance/history", response_model=List[Attendance])
async def get_attendance_history(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    If:
    - Admin → can see all
    - Manager with permission → can see all
    - Staff → can only see own
    """
    query = {}
    # Admin override
    if current_user.role == "admin":
        if user_id:
            query["user_id"] = user_id
    else:
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        # If user has permission to view attendance
        if permissions.get("can_view_attendance"):
            if user_id:
                query["user_id"] = user_id
        else:
            # No permission → force own data only
            query["user_id"] = current_user.id
    attendance_list = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    for attendance in attendance_list:
        if isinstance(attendance["punch_in"], str):
            attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
        if attendance.get("punch_out") and isinstance(attendance["punch_out"], str):
            attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])
    return attendance_list
@api_router.get("/attendance/my-summary")
async def get_my_attendance_summary(
    current_user: User = Depends(get_current_user)
):
    """Get current user's attendance summary with monthly hours"""
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    attendance_list = await db.attendance.find(
        {"user_id": current_user.id},
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    monthly_data = {}
    total_minutes_all = 0
    total_days = 0
    for attendance in attendance_list:
        month = attendance["date"][:7]
        if month not in monthly_data:
            monthly_data[month] = {
                "total_minutes": 0,
                "days_present": 0
            }
        duration = attendance.get("duration_minutes")
        if isinstance(duration, (int, float)):
            monthly_data[month]["total_minutes"] += duration
            total_minutes_all += duration
        monthly_data[month]["days_present"] += 1
        total_days += 1
    formatted_data = []
    for month, data in monthly_data.items():
        minutes = data["total_minutes"]
        hours = minutes // 60
        mins = minutes % 60
        formatted_data.append({
            "month": month,
            "total_minutes": minutes,
            "total_hours": f"{hours}h {mins}m",
            "days_present": data["days_present"]
        })
    return {
        "current_month": current_month,
        "total_days": total_days,
        "total_minutes": total_minutes_all,
        "monthly_summary": formatted_data
    }
@api_router.get("/attendance/staff-report")
async def get_staff_attendance_report(
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if not permissions.get("can_view_attendance"):
            raise HTTPException(status_code=403, detail="Not allowed")
    now = datetime.now(timezone.utc)
    target_month = month or now.strftime("%Y-%m")
    # Get all users
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in users}
    # Get attendance records for selected month
    attendance_list = await db.attendance.find(
        {"date": {"$regex": f"^{target_month}"}},
        {"_id": 0}
    ).to_list(5000)
    # Aggregate by user
    staff_report = {}
    for attendance in attendance_list:
        uid = attendance["user_id"]
        # Initialize user record if not exists
        if uid not in staff_report:
            user_info = user_map.get(uid, {})
            staff_report[uid] = {
                "user_id": uid,
                "user_name": user_info.get("full_name", "Unknown"),
                "role": user_info.get("role", "staff"),
                "total_minutes": 0,
                "days_present": 0,
                "records": []
            }
        duration = attendance.get("duration_minutes")
        # Safely add duration
        if isinstance(duration, (int, float)):
            staff_report[uid]["total_minutes"] += duration
        # Count day regardless of duration
        staff_report[uid]["days_present"] += 1
        # Add record
        staff_report[uid]["records"].append({
            "date": attendance["date"],
            "punch_in": attendance.get("punch_in"),
            "punch_out": attendance.get("punch_out"),
            "duration_minutes": duration
        })
    # Convert to list and calculate formatted values
    result = []
    for uid, data in staff_report.items():
        total_minutes = data["total_minutes"]
        hours = total_minutes // 60
        minutes = total_minutes % 60
        data["total_hours"] = f"{hours}h {minutes}m"
        if data["days_present"] > 0:
            data["avg_hours_per_day"] = round(
                (total_minutes / data["days_present"]) / 60, 1
            )
        else:
            data["avg_hours_per_day"] = 0
        expected_hours = calculate_expected_hours(
            user_map.get(uid, {}).get("expected_start_time"),
            user_map.get(uid, {}).get("expected_end_time")
        )
        data["expected_hours"] = expected_hours
        result.append(data)
    # Sort by highest total minutes
    result.sort(key=lambda x: x["total_minutes"], reverse=True)
    return {
        "month": target_month,
        "total_staff": len(result),
        "staff_report": result
    }
@api_router.get("/attendance/export-pdf")
async def export_attendance_pdf(
    user_id: str,
    current_user: User = Depends(check_permission("can_view_attendance"))
):
    records = await db.attendance.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("date", 1).to_list(1000)
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, txt="Attendance Report", ln=True, align="C")
    pdf.ln(5)
    for rec in records:
        pdf.multi_cell(
            0,
            8,
            f"Date: {rec.get('date')} | In: {rec.get('punch_in')} | "
            f"Out: {rec.get('punch_out')} | Duration: {rec.get('duration_minutes')} mins"
        )
        pdf.ln(2)
    output = BytesIO()
    output.write(pdf.output(dest="S").encode("latin1"))
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=attendance_{user_id}.pdf"}
    )
# DUE DATE ROUTES
@api_router.post("/duedates", response_model=DueDate)
async def create_due_date(
    due_date_data: DueDateCreate,
    current_user: User = Depends(get_current_user)
):
    if not due_date_data.department:
        raise HTTPException(status_code=400, detail="Department required")
    due_date = DueDate(
        **due_date_data.model_dump(),
        created_by=current_user.id
    )
    doc = due_date.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["due_date"] = doc["due_date"].isoformat()
    await db.due_dates.insert_one(doc)
    return due_date
@api_router.get("/duedates", response_model=List[DueDate])
async def get_due_dates(current_user: User = Depends(get_current_user)):
    query = {}
    # Admin → see all
    if current_user.role == "admin":
        pass
    # Manager → see departments assigned
    elif current_user.role == "manager":
        if current_user.departments:
            query["department"] = {"$in": current_user.departments}
    # Staff → see only their departments
    else:
        if current_user.departments:
            query["department"] = {"$in": current_user.departments}
        else:
            # No department assigned → show nothing
            return []
    due_dates = await db.due_dates.find(query, {"_id": 0}).to_list(1000)
    for dd in due_dates:
        if isinstance(dd.get("created_at"), str):
            dd["created_at"] = datetime.fromisoformat(dd["created_at"])
        if isinstance(dd.get("due_date"), str):
            dd["due_date"] = datetime.fromisoformat(dd["due_date"])
    return [DueDate(**dd) for dd in due_dates]
@api_router.get("/duedates/upcoming")
async def get_upcoming_due_dates(
    days: int = 30,
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    future_date = now + timedelta(days=days)
    query = {"status": "pending"}
    if current_user.role != "admin":
        if current_user.departments:
            query["department"] = {"$in": current_user.departments}
        else:
            return []
    due_dates = await db.due_dates.find(query, {"_id": 0}).to_list(1000)
    upcoming = []
    for dd in due_dates:
        dd_date = datetime.fromisoformat(dd["due_date"]) if isinstance(dd["due_date"], str) else dd["due_date"]
        if now <= dd_date <= future_date:
            dd["due_date"] = dd_date
            dd["days_remaining"] = (dd_date - now).days
            upcoming.append(dd)
    return sorted(upcoming, key=lambda x: x["days_remaining"])
@api_router.put("/duedates/{due_date_id}", response_model=DueDate)
async def update_due_date(
    due_date_id: str,
    due_date_data: DueDateCreate,
    current_user: User = Depends(check_permission("can_edit_due_dates"))
):
    existing = await db.due_dates.find_one({"id": due_date_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Due date not found")
    update_data = due_date_data.model_dump()
    update_data["due_date"] = update_data["due_date"].isoformat()
    await db.due_dates.update_one(
        {"id": due_date_id},
        {"$set": update_data}
    )
    await create_audit_log(
        current_user,
        action="UPDATE_DUE_DATE",
        module="duedate",
        record_id=due_date_id,
        old_data=existing,
        new_data=update_data
    )
    updated = await db.due_dates.find_one({"id": due_date_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated.get("due_date"), str):
        updated["due_date"] = datetime.fromisoformat(updated["due_date"])
    return DueDate(**updated)
@api_router.delete("/duedates/{due_date_id}")
async def delete_due_date(
    due_date_id: str,
    current_user: User = Depends(check_permission("can_edit_due_dates"))
):
    existing = await db.due_dates.find_one({"id": due_date_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Due date not found")
    await create_audit_log(
        current_user,
        action="DELETE_DUE_DATE",
        module="duedate",
        record_id=due_date_id,
        old_data=existing
    )
    result = await db.due_dates.delete_one({"id": due_date_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Due date not found")
    return {"message": "Due date deleted successfully"}
# REPORTS ROUTES
# Reports routes
@api_router.get("/reports/efficiency")
async def get_efficiency_report(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        # Admin can view anyone
        query = {"user_id": user_id} if user_id else {}
    else:
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if user_id is None:
            if permissions.get("can_view_reports", False):
                query = {}
            else:
                raise HTTPException(status_code=403, detail="Not authorized to view all reports")
        elif user_id == current_user.id:
            query = {"user_id": current_user.id}
        else:
            if permissions.get("can_view_selected_users_reports", False):
                query = {"user_id": user_id}
            else:
                raise HTTPException(status_code=403, detail="Not authorized to view this report")
    # Get activity logs
    logs = await db.activity_logs.find(query, {"_id": 0}).sort("date", -1).limit(30).to_list(100)
    # Get user data
    user_ids = list(set([log["user_id"] for log in logs]))
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "password": 0}).to_list(100)
    user_map = {user["id"]: user for user in users}
    # Calculate metrics
    report_data = {}
    for log in logs:
        user_id = log["user_id"]
        if user_id not in report_data:
            report_data[user_id] = {
                "user": user_map.get(user_id, {}),
                "total_screen_time": 0,
                "total_tasks_completed": 0,
                "days_logged": 0
            }
        report_data[user_id]["total_screen_time"] += log.get("screen_time_minutes", 0)
        report_data[user_id]["total_tasks_completed"] += log.get("tasks_completed", 0)
        report_data[user_id]["days_logged"] += 1
    return list(report_data.values())
@api_router.get("/reports/export")
async def export_reports(
    format: str = "csv",
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if not permissions.get("can_download_reports", False):
            raise HTTPException(status_code=403, detail="Download not allowed")
    # Fetch all reports
    reports = await get_efficiency_report(None, current_user)
    if format == "csv":
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=["user_id", "user_name", "total_screen_time", "total_tasks_completed", "days_logged"])
        writer.writeheader()
        for report in reports:
            writer.writerow({
                "user_id": report["user"].get("id"),
                "user_name": report["user"].get("full_name"),
                "total_screen_time": report["total_screen_time"],
                "total_tasks_completed": report["total_tasks_completed"],
                "days_logged": report["days_logged"]
            })
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=efficiency_report.csv"}
        )
    elif format == "pdf":
        # Use FPDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        pdf.cell(200, 10, txt="Efficiency Report", ln=1, align="C")
        # Headers
        pdf.cell(40, 10, "User ID", 1)
        pdf.cell(50, 10, "User Name", 1)
        pdf.cell(40, 10, "Screen Time", 1)
        pdf.cell(40, 10, "Tasks Completed", 1)
        pdf.cell(30, 10, "Days Logged", 1)
        pdf.ln()
        for report in reports:
            pdf.cell(40, 10, str(report["user"].get("id")), 1)
            pdf.cell(50, 10, str(report["user"].get("full_name")), 1)
            pdf.cell(40, 10, str(report["total_screen_time"]), 1)
            pdf.cell(40, 10, str(report["total_tasks_completed"]), 1)
            pdf.cell(30, 10, str(report["days_logged"]), 1)
            pdf.ln()
        pdf_output = BytesIO()
        pdf_output.write(pdf.output(dest='S').encode('latin1'))
        pdf_output.seek(0)
        return StreamingResponse(
            pdf_output,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=efficiency_report.pdf"}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid format")
# CLIENT ROUTES
# Client Management routes
@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, current_user: User = Depends(get_current_user)):
    client = Client(**client_data.model_dump(), created_by=current_user.id)
    doc = client.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("birthday"):
        doc["birthday"] = doc["birthday"].isoformat()
    await db.clients.insert_one(doc)
    return client
@api_router.get("/clients", response_model=List[Client])
async def get_clients(current_user: User = Depends(check_permission("can_view_all_clients"))):
    query = {}
    if current_user.role == "staff":
        query["assigned_to"] = current_user.id
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for client in clients:
        if isinstance(client["created_at"], str):
            client["created_at"] = datetime.fromisoformat(client["created_at"])
        if client.get("birthday") and isinstance(client["birthday"], str):
            client["birthday"] = date.fromisoformat(client["birthday"])
    return clients
@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, current_user: User = Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if isinstance(client["created_at"], str):
        client["created_at"] = datetime.fromisoformat(client["created_at"])
    if client.get("birthday") and isinstance(client["birthday"], str):
        client["birthday"] = date.fromisoformat(client["birthday"])
    return Client(**client)
@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, client_data: ClientCreate, current_user: User = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    if current_user.role != "admin" and existing.get("assigned_to") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this client")
    update_data = client_data.model_dump()
    if update_data.get("birthday"):
        update_data["birthday"] = update_data["birthday"].isoformat()
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    await create_audit_log(
        current_user,
        action="UPDATE_CLIENT",
        module="client",
        record_id=client_id,
        old_data=existing,
        new_data=update_data
    )
    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if updated.get("birthday") and isinstance(updated["birthday"], str):
        updated["birthday"] = date.fromisoformat(updated["birthday"])
    return Client(**updated)
@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    if current_user.role != "admin" and existing.get("assigned_to") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this client")
    await create_audit_log(
        current_user,
        action="DELETE_CLIENT",
        module="client",
        record_id=client_id,
        old_data=existing
    )
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted successfully"}
# BIRTHDAY EMAIL ROUTES
# Birthday Email routes
@api_router.post("/clients/{client_id}/send-birthday-email")
async def send_client_birthday_email(
    client_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    background_tasks.add_task(
        send_birthday_email,
        client["email"],
        client["company_name"]
    )
    return {"message": "Birthday email queued for delivery"}
@api_router.get("/clients/upcoming-birthdays")
async def get_upcoming_birthdays(days: int = 7, current_user: User = Depends(get_current_user)):
    """Get clients with birthdays in the next N days"""
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    today = date.today()
    upcoming = []
    for client in clients:
        if client.get("birthday"):
            bday = date.fromisoformat(client["birthday"]) if isinstance(client["birthday"], str) else client["birthday"]
            # Get birthday this year
            this_year_bday = bday.replace(year=today.year)
            if this_year_bday < today:
                # If birthday passed, check next year
                this_year_bday = bday.replace(year=today.year + 1)
            days_until = (this_year_bday - today).days
            if 0 <= days_until <= days:
                client["days_until_birthday"] = days_until
                upcoming.append(client)
    return sorted(upcoming, key=lambda x: x["days_until_birthday"])
# DASHBOARD ROUTES
# Enhanced Dashboard Stats
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    """Get comprehensive dashboard statistics"""
    now = datetime.now(timezone.utc)
    # Task statistics
    task_query = {}
    if current_user.role != "admin":
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if not permissions.get("can_view_all_tasks", False):
            task_query["$or"] = [
                {"assigned_to": current_user.id},
                {"sub_assignees": current_user.id},
                {"created_by": current_user.id}
            ]
    tasks = await db.tasks.find(task_query, {"_id": 0}).to_list(1000)
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t["status"] == "completed"])
    pending_tasks = len([t for t in tasks if t["status"] == "pending"])
    overdue_tasks = 0
    for task in tasks:
        if task.get("due_date") and task["status"] != "completed":
            due_date = datetime.fromisoformat(task["due_date"]) if isinstance(task["due_date"], str) else task["due_date"]
            if due_date < now:
                overdue_tasks += 1
    # DSC statistics
    dsc_list = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
    total_dsc = len(dsc_list)
    expiring_dsc_count = 0
    expiring_dsc_list = []
    for dsc in dsc_list:
        expiry_date = datetime.fromisoformat(dsc["expiry_date"]) if isinstance(dsc["expiry_date"], str) else dsc["expiry_date"]
        days_left = (expiry_date - now).days
        # Include expired (negative days) and expiring within 90 days
        if days_left <= 90:
            expiring_dsc_count += 1
            expiring_dsc_list.append({
                "id": dsc["id"],
                "holder_name": dsc["holder_name"],
                "certificate_number": dsc.get("certificate_number", "N/A"),
                "expiry_date": dsc["expiry_date"],
                "days_left": days_left,
                "status": "expired" if days_left < 0 else "expiring"
            })
    # Client statistics
    client_query = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
    clients = await db.clients.find(client_query, {"_id": 0}).to_list(1000)
    total_clients = len(clients)
    # Upcoming birthdays (next 7 days)
    today = date.today()
    upcoming_birthdays = 0
    for client in clients:
        if client.get("birthday"):
            bday = date.fromisoformat(client["birthday"]) if isinstance(client["birthday"], str) else client["birthday"]
            this_year_bday = bday.replace(year=today.year)
            if this_year_bday < today:
                this_year_bday = bday.replace(year=today.year + 1)
            days_until = (this_year_bday - today).days
            if 0 <= days_until <= 7:
                upcoming_birthdays += 1
    # Upcoming due dates (next 30 days)
    upcoming_due_dates_count = 0
    due_dates = await db.due_dates.find({"status": "pending"}, {"_id": 0}).to_list(1000)
    for dd in due_dates:
        dd_date = datetime.fromisoformat(dd["due_date"]) if isinstance(dd["due_date"], str) else dd["due_date"]
        days_until_due = (dd_date - now).days
        # Include overdue (negative) and due within 120 days
        if days_until_due <= 120:
            upcoming_due_dates_count += 1
    # Team workload (tasks per user)
    team_workload = []
    if current_user.role != "staff":
        users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
        for user in users:
            user_tasks = [t for t in tasks if t.get("assigned_to") == user["id"]]
            team_workload.append({
                "user_id": user["id"],
                "user_name": user["full_name"],
                "total_tasks": len(user_tasks),
                "pending_tasks": len([t for t in user_tasks if t["status"] == "pending"]),
                "completed_tasks": len([t for t in user_tasks if t["status"] == "completed"])
            })
    # Compliance status (based on overdue tasks and expiring DSC)
    compliance_score = 100
    if total_tasks > 0:
        compliance_score -= (overdue_tasks / total_tasks) * 50
    if total_dsc > 0:
        compliance_score -= (expiring_dsc_count / total_dsc) * 30
    compliance_status = {
        "score": max(0, int(compliance_score)),
        "status": "good" if compliance_score >= 80 else "warning" if compliance_score >= 50 else "critical",
        "overdue_tasks": overdue_tasks,
        "expiring_certificates": expiring_dsc_count
    }
    return DashboardStats(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        pending_tasks=pending_tasks,
        overdue_tasks=overdue_tasks,
        total_dsc=total_dsc,
        expiring_dsc_count=expiring_dsc_count,
        expiring_dsc_list=expiring_dsc_list,
        total_clients=total_clients,
        upcoming_birthdays=upcoming_birthdays,
        upcoming_due_dates=upcoming_due_dates_count,
        team_workload=team_workload,
        compliance_status=compliance_status
    )
# STAFF ACTIVITY ROUTES
# Staff Activity Tracking Endpoints
@api_router.post("/activity/log")
async def log_staff_activity(activity_data: StaffActivityCreate, current_user: User = Depends(get_current_user)):
    """Log staff activity (app/website usage)"""
    activity = StaffActivityLog(
        user_id=current_user.id,
        **activity_data.model_dump()
    )
    doc = activity.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.staff_activity.insert_one(doc)
    return {"message": "Activity logged successfully"}
@api_router.get("/activity/summary")
async def get_activity_summary(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(check_permission("can_view_staff_activity"))
):
    """Get staff activity summary (admin only)"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    query = {}
    if user_id:
        query["user_id"] = user_id
    if date_from:
        query["timestamp"] = {"$gte": date_from}
    if date_to:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = date_to
        else:
            query["timestamp"] = {"$lte": date_to}
    activities = await db.staff_activity.find(query, {"_id": 0}).to_list(5000)
    # Aggregate by user and app
    user_summary = {}
    for activity in activities:
        uid = activity["user_id"]
        if uid not in user_summary:
            user_summary[uid] = {
                "user_id": uid,
                "total_duration": 0,
                "apps": {},
                "categories": {}
            }
        user_summary[uid]["total_duration"] += activity.get("duration_seconds", 0)
        app_name = activity["app_name"]
        if app_name not in user_summary[uid]["apps"]:
            user_summary[uid]["apps"][app_name] = {"count": 0, "duration": 0}
        user_summary[uid]["apps"][app_name]["count"] += 1
        user_summary[uid]["apps"][app_name]["duration"] += activity.get("duration_seconds", 0)
        category = activity.get("category", "other")
        if category not in user_summary[uid]["categories"]:
            user_summary[uid]["categories"][category] = 0
        user_summary[uid]["categories"][category] += activity.get("duration_seconds", 0)
    # Add user names
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
    user_map = {u["id"]: u["full_name"] for u in users}
    result = []
    for uid, data in user_summary.items():
        data["user_name"] = user_map.get(uid, "Unknown")
        data["apps_list"] = sorted(
            [{"name": k, **v} for k, v in data["apps"].items()],
            key=lambda x: x["duration"],
            reverse=True
        )
        # Productivity score
        productive_duration = data["categories"].get("productivity", 0)
        entertainment_duration = data["categories"].get("entertainment", 0)
        communication_duration = data["categories"].get("communication", 0)
        total_duration = data["total_duration"]
        if total_duration > 0:
            data["productivity_percent"] = (productive_duration / total_duration) * 100
        else:
            data["productivity_percent"] = 0
        result.append(data)
    return result
@api_router.get("/activity/user/{user_id}")
async def get_user_activity(
    user_id: str,
    limit: int = 100,
    current_user: User = Depends(check_permission("can_view_staff_activity"))
):
    """Get detailed activity for a specific user (admin only)"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    activities = await db.staff_activity.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return activities
# USER PERMISSIONS
# Update user permissions endpoint
@api_router.put("/users/{user_id}/permissions")
async def update_user_permissions(
    user_id: str,
    permissions: UserPermissions,
    current_user: User = Depends(get_current_user)
):
    """Update user permissions (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    existing = await db.users.find_one({"id": user_id})
    old_permissions = existing.get("permissions", {})
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"permissions": permissions.model_dump()}}
    )
    await create_audit_log(
        current_user,
        action="UPDATE_PERMISSIONS",
        module="user",
        record_id=user_id,
        old_data=old_permissions,
        new_data=permissions.model_dump()
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Permissions updated successfully"}
# CHAT ROUTES
from fastapi import APIRouter, HTTPException
from bson import ObjectId


@api_router.delete("/chat/message/{message_id}")
async def delete_message(message_id: str):
    result = await db.chat_messages.delete_one({"_id": ObjectId(message_id)})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")

    return {"success": True}
@api_router.post("/chat/groups", response_model=ChatGroup)
async def create_chat_group(
    group_data: ChatGroupCreate,
    current_user: User = Depends(get_current_user)
):
    members = list(set(group_data.members + [current_user.id]))
    # Prevent duplicate direct chat
    if group_data.is_direct and len(members) == 2:
        existing = await db.chat_groups.find_one(
            {
                "is_direct": True,
                "members": {"$all": members, "$size": 2}
            },
            {"_id": 0}
        )
        if existing:
            if isinstance(existing["created_at"], str):
                existing["created_at"] = datetime.fromisoformat(existing["created_at"])
            return ChatGroup(**existing)
    group = ChatGroup(
        name=group_data.name,
        description=group_data.description,
        members=members,
        created_by=current_user.id,
        is_direct=group_data.is_direct
    )
    doc = group.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.chat_groups.insert_one(doc)
    return group
@api_router.get("/chat/groups", response_model=List[dict])
async def get_chat_groups(current_user: User = Depends(get_current_user)):
    groups = await db.chat_groups.find(
        {"members": current_user.id},
        {"_id": 0}
    ).sort("last_message_at", -1).to_list(100)
    if not groups:
        return []
    # Collect all member IDs
    user_ids = set()
    for group in groups:
        user_ids.update(group["members"])
    users = await db.users.find(
        {"id": {"$in": list(user_ids)}},
        {"_id": 0, "password": 0}
    ).to_list(200)
    user_map = {u["id"]: u for u in users}
    result = []
    for group in groups:
        # Convert datetime fields
        if isinstance(group.get("created_at"), str):
            group["created_at"] = datetime.fromisoformat(group["created_at"])
        if isinstance(group.get("last_message_at"), str):
            group["last_message_at"] = datetime.fromisoformat(group["last_message_at"])
        # Add member details
        group["member_details"] = [
            {
                "id": m,
                "name": user_map.get(m, {}).get("full_name", "Unknown"),
                "role": user_map.get(m, {}).get("role", "staff"),
            }
            for m in group["members"]
        ]
        # Direct chat display name
        if group["is_direct"]:
            other = [m for m in group["members"] if m != current_user.id]
            group["display_name"] = (
                user_map.get(other[0], {}).get("full_name", "Unknown")
                if other else group["name"]
            )
        else:
            group["display_name"] = group["name"]
        # Unread count
        unread = await db.chat_messages.count_documents({
            "group_id": group["id"],
            "sender_id": {"$ne": current_user.id},
            "read_by": {"$ne": current_user.id}
        })
        group["unread_count"] = unread
        # Last message
        last_msg = await db.chat_messages.find_one(
            {"group_id": group["id"]},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        if last_msg and isinstance(last_msg.get("created_at"), str):
            last_msg["created_at"] = datetime.fromisoformat(last_msg["created_at"])
        group["last_message"] = last_msg
        result.append(group)
    return result
# SINGLE GROUP
@api_router.get("/chat/groups/{group_id}")
async def get_chat_group(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if isinstance(group.get("created_at"), str):
        group["created_at"] = datetime.fromisoformat(group["created_at"])
    return group
# MESSAGES
@api_router.get("/chat/groups/{group_id}/messages")
async def get_chat_messages(
    group_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    messages = await db.chat_messages.find(
        {"group_id": group_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    # Mark as read
    await db.chat_messages.update_many(
        {
            "group_id": group_id,
            "sender_id": {"$ne": current_user.id}
        },
        {"$addToSet": {"read_by": current_user.id}}
    )
    for msg in messages:
        if isinstance(msg.get("created_at"), str):
            msg["created_at"] = datetime.fromisoformat(msg["created_at"])
    return list(reversed(messages))
@api_router.post("/chat/groups/{group_id}/messages")
class BulkDeleteChatRequest(BaseModel):
    message_ids: List[str]


@api_router.post("/chat/messages/bulk-delete")
async def bulk_delete_chat_messages(
    payload: BulkDeleteChatRequest,
    current_user: User = Depends(get_current_user)
):
    # Convert string IDs to ObjectId
    object_ids = []
    for msg_id in payload.message_ids:
        try:
            object_ids.append(ObjectId(msg_id))
        except:
            continue

    result = await db.chat_messages.delete_many(
        {"_id": {"$in": object_ids}}
    )

    return {
        "message": "Messages deleted successfully",
        "deleted_count": result.deleted_count
    }
async def send_chat_message(
    group_id: str,
    message_data: ChatMessageCreate,
    current_user: User = Depends(get_current_user)
):
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    message = ChatMessage(
        group_id=group_id,
        sender_id=current_user.id,
        sender_name=current_user.full_name,
        content=message_data.content,
        message_type=message_data.message_type,
        file_url=message_data.file_url,
        file_name=message_data.file_name,
        file_size=message_data.file_size,
        read_by=[current_user.id]
    )
    doc = message.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.chat_messages.insert_one(doc)
    await db.chat_groups.update_one(
        {"id": group_id},
        {"$set": {"last_message_at": doc["created_at"]}}
    )
    return message
# USERS FOR CHAT
@api_router.get("/chat/users")
async def get_chat_users(current_user: User = Depends(get_current_user)):
    users = await db.users.find(
        {"id": {"$ne": current_user.id}},
        {"_id": 0, "password": 0}
    ).to_list(200)
    for user in users:
        if isinstance(user.get("created_at"), str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    return sanitize_user_data(users, current_user)
# REMINDER ROUTES
# MANUAL FULL REMINDER
@api_router.post("/send-pending-task-reminders")
async def send_pending_task_reminders(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    tasks = await db.tasks.find(
        {"status": {"$ne": "completed"}},
        {"_id": 0}
    ).to_list(1000)
    if not tasks:
        return {
            "message": "No pending tasks found",
            "emails_sent": 0,
            "emails_failed": []
        }
    user_task_map = {}
    for task in tasks:
        assigned_to = task.get("assigned_to")
        if not assigned_to:
            continue
        user = await db.users.find_one({"id": assigned_to}, {"_id": 0})
        if not user:
            continue
        user_task_map.setdefault(user["email"], []).append(task)
    success_count = 0
    failed_emails = []
    for email, task_list in user_task_map.items():
        try:
            body = "Hello,\n\nYou have the following pending tasks:\n\n"
            for t in task_list:
                body += f"- {t.get('title')} (Due: {t.get('due_date', 'N/A')})\n"
            body += "\nPlease complete them at the earliest.\n\nRegards,\nTaskoSphere"
            sent = send_email(
                email,
                "Pending Task Reminder - TaskoSphere",
                body
            )
            if sent:
                success_count += 1
            else:
                failed_emails.append(email)
        except Exception as e:
            failed_emails.append(email)
            logger.error(f"Error sending reminder to {email}: {str(e)}")
    return {
        "message": "Reminder process completed",
        "total_users": len(user_task_map),
        "emails_sent": success_count,
        "emails_failed": failed_emails
    }
# INTERNAL FUNCTION FOR AUTO REMINDER
async def send_pending_task_reminders_internal():
    tasks = await db.tasks.find(
        {"status": {"$ne": "completed"}},
        {"_id": 0}
    ).to_list(1000)
    if not tasks:
        return
    user_task_map = {}
    for task in tasks:
        assigned_to = task.get("assigned_to")
        if not assigned_to:
            continue
        user = await db.users.find_one({"id": assigned_to}, {"_id": 0})
        if not user:
            continue
        user_task_map.setdefault(user["email"], []).append(task)
    for email, task_list in user_task_map.items():
        try:
            body = "Hello,\n\nYou have the following pending tasks:\n\n"
            for t in task_list:
                body += f"- {t.get('title')} (Due: {t.get('due_date', 'N/A')})\n"
            body += "\nPlease complete them.\n\nRegards,\nTaskoSphere"
            send_email(
                email,
                "Daily Pending Task Reminder - TaskoSphere",
                body
            )
        except Exception as e:
            logger.error(f"Auto reminder failed for {email}: {str(e)}")
# AUTO DAILY REMINDER (ONLY ONE)
@app.middleware("http")
async def auto_daily_reminder(request, call_next):
    try:
        india_time = datetime.now(pytz.timezone("Asia/Kolkata"))
        today_str = india_time.date().isoformat()
        setting = await db.system_settings.find_one({"key": "last_reminder_date"})
        last_date = setting["value"] if setting else None
        if india_time.hour >= 10 and last_date != today_str:
            logger.info("Auto daily reminder triggered at 10:00 AM IST")
            await send_pending_task_reminders_internal()
            await db.system_settings.update_one(
                {"key": "last_reminder_date"},
                {"$set": {"value": today_str}},
                upsert=True
            )
        # Add automatic cleanup for staff_activity (90 days retention)
        await db.staff_activity.delete_many({
            "timestamp": {"$lt": (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()}
        })
        # Calculate retention dates
        now = datetime.now(timezone.utc)
        thirty_days_ago = (now - timedelta(days=30)).isoformat()
        forty_five_days_ago = (now - timedelta(days=45)).isoformat()
        # 1️⃣ Delete completed tasks after 30 days
        await db.tasks.delete_many({
            "status": "completed",
            "completed_at": {"$lte": thirty_days_ago}
        })
        # 2️⃣ Delete chat messages older than 30 days
        old_messages = await db.chat_messages.find({
            "created_at": {"$lte": thirty_days_ago}
        }).to_list(5000)
        # Delete files if stored locally
        for msg in old_messages:
            if msg.get("file_url"):
                try:
                    if os.path.exists(msg["file_url"]):
                        os.remove(msg["file_url"])
                except:
                    pass
        await db.chat_messages.delete_many({
            "created_at": {"$lte": thirty_days_ago}
        })
        groups = await db.chat_groups.find({}, {"_id": 0}).to_list(1000)
        for group in groups:
            count = await db.chat_messages.count_documents({"group_id": group["id"]})
            if count == 0:
                await db.chat_groups.delete_one({"id": group["id"]})
        await db.attendance.delete_many({
            "date": {"$lte": (now - timedelta(days=45)).date().isoformat()}
        })
    except Exception as e:
        logger.error(f"Auto reminder middleware error: {str(e)}")
    response = await call_next(request)
    return response
# NOTIFICATIONS
@api_router.get("/notifications")
async def get_notifications(current_user: User = Depends(get_current_user)):
    return []
# SHUTDOWN
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
# INDIVIDUAL STAFF REMINDER
@api_router.post("/send-reminder/{user_id}")
async def send_reminder_to_user(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tasks = await db.tasks.find(
        {
            "assigned_to": user_id,
            "status": {"$ne": "completed"}
        },
        {"_id": 0}
    ).to_list(1000)
    if not tasks:
        return {"message": "No pending tasks for this user"}
    body = f"Hello {user.get('full_name')},\n\n"
    body += "You have the following pending tasks:\n\n"
    for t in tasks:
        body += f"- {t.get('title')} (Due: {t.get('due_date', 'N/A')})\n"
    body += "\nPlease complete them at the earliest.\n\nRegards,\nTaskoSphere"
    send_email(
        user["email"],
        "Pending Task Reminder - TaskoSphere",
        body
    )
    return {
        "message": "Reminder sent successfully",
        "task_count": len(tasks)
    }
# STAFF RANKING ROUTE
@api_router.get("/staff/rankings")
async def get_staff_rankings(
    period: str = "all",
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user.role != "admin":
        period = "all"
    now = datetime.now(timezone.utc)
    start_date = None
    if period == "weekly":
        start_date = now - timedelta(days=7)
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    users = await db.users.find(
        {"role": {"$in": ["manager", "staff"]}},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    rankings = []
    for user in users:
        uid = user.get("id")
        if not uid:
            continue
        total_minutes = 0
        # ATTENDANCE
        attendance_cursor = await db.attendance.find(
            {"user_id": uid},
            {"_id": 0, "date": 1, "duration_minutes": 1}
        ).to_list(1000)
        for record in attendance_cursor:
            date_str = record.get("date")
            if not date_str:
                continue
            try:
                record_date = parser.isoparse(date_str).replace(tzinfo=timezone.utc)
            except:
                try:
                    record_date = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                except:
                    continue
            if start_date and record_date < start_date:
                continue
            total_minutes += record.get("duration_minutes") or 0
        # 160 hour baseline
        work_score = min(total_minutes / (60 * 160), 1.0) * 100
        # TASKS
        tasks = await db.tasks.find(
            {"assigned_to": uid},
            {"_id": 0}
        ).to_list(1000)
        filtered_tasks = []
        for task in tasks:
            created = task.get("created_at")
            if not created:
                continue
            if isinstance(created, str):
                try:
                    created = datetime.fromisoformat(created).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
            if start_date and created < start_date:
                continue
            filtered_tasks.append(task)
        total_tasks = len(filtered_tasks)
        completed_tasks = len(
            [t for t in filtered_tasks if t.get("status") == "completed"]
        )
        completion_percent = (
            (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        )
        # OVERDUE LOGIC
        overdue_with_reason = 0
        overdue_without_reason = 0
        for task in filtered_tasks:
            status = task.get("status")
            due_date = task.get("due_date")
            if not due_date:
                continue
            if isinstance(due_date, str):
                try:
                    due_date = datetime.fromisoformat(due_date).replace(tzinfo=timezone.utc)
                except:
                    continue
            if status != "completed" and due_date < now:
                description = task.get("description", "")
                if description and description.strip() and len(description.strip()) >= 20:
                    overdue_with_reason += 1
                else:
                    overdue_without_reason += 1
        # SPEED
        completion_times = []
        for task in filtered_tasks:
            if task.get("status") == "completed":
                created = task.get("created_at")
                updated = task.get("updated_at")
                if not created or not updated:
                    continue
                try:
                    if isinstance(created, str):
                        created = datetime.fromisoformat(created).replace(tzinfo=timezone.utc)
                    if isinstance(updated, str):
                        updated = datetime.fromisoformat(updated).replace(tzinfo=timezone.utc)
                    diff = (updated - created).total_seconds()
                    if diff > 0:
                        completion_times.append(diff)
                except:
                    continue
        speed_score = 0
        if completion_times:
            avg_seconds = sum(completion_times) / len(completion_times)
            speed_score = max(0, 100 - (avg_seconds / 86400) * 10)
        # OVERDUE PENALTY
        penalty_without_reason = (
            (overdue_without_reason / total_tasks * 100) if total_tasks > 0 else 0
        )
        penalty_with_reason = (
            (overdue_with_reason / total_tasks * 100) if total_tasks > 0 else 0
        )
        overdue_penalty_score = (
            penalty_without_reason * 0.20 + penalty_with_reason * 0.05
        )
        adjusted_completion = max(0, completion_percent - overdue_penalty_score)
        # FINAL SCORE
        efficiency = (
            0.35 * work_score + 0.40 * adjusted_completion + 0.25 * speed_score
        )
        # STAFF ACTIVITY
        activities = await db.staff_activity.find(
            {"user_id": uid, "timestamp": {"$gte": start_date.isoformat() if start_date else "1970-01-01"}},
            {"_id": 0}
        ).to_list(None)
        productive_duration = 0
        total_duration = 0
        for act in activities:
            duration = act.get("duration_seconds", 0)
            total_duration += duration
            if act.get("category") == "productivity":
                productive_duration += duration
        productivity_percent = (productive_duration / total_duration * 100) if total_duration > 0 else 0
        rankings.append({
            "user_id": uid,
            "name": user.get("full_name", "Unknown"),
            "role": user.get("role"),
            "profile_picture": user.get("profile_picture"),
            "score": round(efficiency, 2),
            "hours_worked": round(total_minutes / 60, 2),
            "completion_percent": round(completion_percent, 2),
            "productivity_percent": round(productivity_percent, 2)
        })
    rankings.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(rankings):
        r["rank"] = i + 1
    return sanitize_user_data({
        "period": period,
        "rankings": rankings[:50]
    }, current_user)
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in meters

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c
def calculate_expected_hours(punch_in, punch_out):
    if not punch_in or not punch_out:
        return 8.0
    in_time = parser.parse(punch_in).time()
    out_time = parser.parse(punch_out).time()
    diff = datetime.combine(datetime.min, out_time) - datetime.combine(datetime.min, in_time)
    return diff.total_seconds() / 3600
app.include_router(api_router)
@api_router.post("/todos")
async def create_todo(todo_data: TaskCreate, current_user: User = Depends(get_current_user)):
    data = todo_data.model_dump()
    data["type"] = "todo"
    return await create_task(TaskCreate(**data), current_user)
@api_router.get("/todos/{user_id}", response_model=List[Task])
async def get_user_todos(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    todos = await db.tasks.find({"created_by": user_id, "type": "todo"}, {"_id": 0}).to_list(1000)
    for todo in todos:
        if isinstance(todo["created_at"], str):
            todo["created_at"] = datetime.fromisoformat(todo["created_at"])
        if isinstance(todo["updated_at"], str):
            todo["updated_at"] = datetime.fromisoformat(todo["updated_at"])
        if todo.get("due_date") and isinstance(todo["due_date"], str):
            todo["due_date"] = datetime.fromisoformat(todo["due_date"])
    return todos
@api_router.get("/todos/yesterday-unfinished", response_model=List[Task])
async def get_yesterday_unfinished_todos(current_user: User = Depends(get_current_user)):
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    todos = await db.tasks.find({
        "created_by": current_user.id,
        "type": "todo",
        "created_at": {"$regex": f"^{yesterday}"},
        "status": {"$ne": "completed"}
    }, {"_id": 0}).to_list(1000)
    for todo in todos:
        if isinstance(todo["created_at"], str):
            todo["created_at"] = datetime.fromisoformat(todo["created_at"])
        if isinstance(todo["updated_at"], str):
            todo["updated_at"] = datetime.fromisoformat(todo["updated_at"])
        if todo.get("due_date") and isinstance(todo["due_date"], str):
            todo["due_date"] = datetime.fromisoformat(todo["due_date"])
    return todos
@api_router.patch("/todos/{todo_id}")
async def complete_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    todo = await db.tasks.find_one({"id": todo_id, "created_by": current_user.id, "type": "todo"}, {"_id": 0})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    await db.tasks.update_one({"id": todo_id}, {"$set": {"status": "completed"}})
    return {"message": "Todo completed successfully"}
@api_router.get("/audit-logs")
async def get_audit_logs(
    current_user: User = Depends(check_permission("can_view_audit_logs"))
):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(1000).to_list(1000)
    return logs
BOT_TOKEN = os.getenv("BOT_TOKEN")
def send_message(chat_id, text):
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        requests.post(url, json={
        "chat_id": chat_id,
        "text": text
    })
@app.post("/webhook/telegram")
async def telegram_webhook(request: Request):
    data = await request.json()
    if "message" not in data:
        return {"ok": True}
    telegram_user_id = data["message"]["from"]["id"]
    # 🔐 Allow only specific Telegram users
    if telegram_user_id not in ALLOWED_TELEGRAM_IDS:
        return {"ok": True}
    message = data["message"]["text"]
    chat_id = data["message"]["chat"]["id"]
    session = await db.telegram_sessions.find_one(
        {"telegram_id": telegram_user_id}
    )
    # Start new task
    if message == "/task":
        await db.telegram_sessions.update_one(
            {"telegram_id": telegram_user_id},
            {"$set": {"step": "title", "data": {}}},
            upsert=True
        )
        send_message(chat_id, "📝 Enter Task Title:")
        return {"ok": True}
    # If user is in active session
    if session:
        step = session["step"]
        data_store = session["data"]
        next_step = None
        reply = None
        if step == "title":
            data_store["title"] = message
            next_step = "description"
            reply = "📄 Enter Description:"
        elif step == "description":
            data_store["description"] = message
            next_step = "due_date"
            reply = "📅 Enter Due Date (dd-mm-yyyy):"
        elif step == "due_date":
            data_store["due_date"] = message
            next_step = "assign"
            reply = "👤 Enter Assignee Name (comma separated):"
        elif step == "assign":
            data_store["assign"] = message
            next_step = "department"
            reply = "🏢 Enter Department:"
        elif step == "department":
            data_store["department"] = message
            next_step = "priority"
            reply = "⚡ Enter Priority (Low/Medium/High):"
        elif step == "priority":
            data_store["priority"] = message
            # 🔥 CREATE TASK HERE
            await create_task_from_session(
                data_store,
                telegram_user_id,
                chat_id
            )
            await db.telegram_sessions.delete_one(
                {"telegram_id": telegram_user_id}
            )
            return {"ok": True}
        # This runs only for non-"priority" steps (after setting next_step/reply)
        if next_step and reply:
            await db.telegram_sessions.update_one(
                {"telegram_id": telegram_user_id},
                {"$set": {"step": next_step, "data": data_store}}
            )
            send_message(chat_id, reply)
    return {"ok": True}
   
async def create_task_from_session(data, telegram_user_id, chat_id):
    try:
        due_date = datetime.strptime(data["due_date"], "%d-%m-%Y")
    except ValueError:
        send_message(chat_id, "❌ Invalid date format. Use DD-MM-YYYY.")
        return
    names = [n.strip() for n in data["assign"].split(",")]
    primary_name = names[0]
    co_names = names[1:] if len(names) > 1 else []
    # 🔍 Case-insensitive primary user search
    primary_user = await db.users.find_one(
        {"full_name": {"$regex": f"^{primary_name}$", "$options": "i"}}
    )
    if not primary_user:
        send_message(chat_id, f"❌ Assignee '{primary_name}' not found. Task cancelled.")
        return
    # 🔍 Case-insensitive co-user search
    co_users = await db.users.find({
        "full_name": {"$in": co_names}
    }).to_list(None)
    # 🔍 Find creator from telegram_id
    creator = await db.users.find_one({"telegram_id": telegram_user_id})
    task = {
        "id": str(uuid.uuid4()),
        "title": data["title"],
        "description": data["description"],
        "assigned_to": primary_user["id"],
        "sub_assignees": [u["id"] for u in co_users],
        "due_date": due_date.isoformat(),
        "priority": data["priority"].lower(),
        "status": "pending",
        "category": data.get("department", "other"),
        "created_by": creator.get("id") if creator else primary_user["id"],
        "created_at": datetime.now(india_tz).isoformat(),
        "updated_at": datetime.now(india_tz).isoformat(),


    }
    await db.tasks.insert_one(task)
    send_message(chat_id, "✅ Task Created Successfully!")
