import pytz
import smtplib
from datetime import datetime, timedelta
from bson import ObjectId
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date
from passlib.context import CryptContext
from jose import jwt, JWTError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://final-taskosphere-frontend.onrender.com",
        "http://final-taskosphere-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

# Models
class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_manage_users: bool = False
    can_assign_tasks: bool = False  # Can staff member assign tasks to others
    assigned_clients: List[str] = []  # List of client IDs user can access

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "staff"  # admin, manager, staff
    profile_picture: Optional[str] = None
    permissions: Optional[UserPermissions] = None  # Custom permissions
    departments: List[str] = []  # Multiple departments: gst, income_tax, accounts, tds, roc, trademark, msme_smadhan, fema, dsc, other

class UserCreate(UserBase):
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

# Staff Activity Tracking
class StaffActivityLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    app_name: str
    window_title: Optional[str] = None
    url: Optional[str] = None  # For browser activity
    category: str = "other"  # "browser", "productivity", "communication", "entertainment", "other"
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
    assigned_to: Optional[str] = None  # Primary assignee
    sub_assignees: List[str] = []  # Additional staff members
    due_date: Optional[datetime] = None
    priority: str = "medium"  # low, medium, high
    status: str = "pending"  # pending, in_progress, completed
    category: Optional[str] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None  # "daily", "weekly", "monthly", "yearly"
    recurrence_interval: int = 1  # Every X days/weeks/months
    recurrence_end_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class Task(TaskBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parent_task_id: Optional[str] = None  # If this is a recurring instance

class DSCMovement(BaseModel):
    movement_type: str  # "IN" or "OUT"
    person_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = None

class DSCBase(BaseModel):
    holder_name: str
    dsc_type: Optional[str] = None  # Type of DSC (Class 3, Signature, Encryption, etc.)
    dsc_password: Optional[str] = None  # DSC Password
    associated_with: Optional[str] = None  # firm or client name (not compulsory)
    entity_type: str = "firm"  # "firm" or "client"
    issue_date: datetime
    expiry_date: datetime
    notes: Optional[str] = None
    current_location: str = "with_company"  # "with_company", "with_client", "taken_by_client"
    taken_by: Optional[str] = None  # Person who took it
    taken_date: Optional[datetime] = None
    movement_log: List[dict] = []  # Log of all movements

class DSCCreate(DSCBase):
    pass

class DSC(DSCBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DSCMovementRequest(BaseModel):
    movement_type: str  # "IN" or "OUT"
    person_name: str
    notes: Optional[str] = None

# Due Date Reminder Models
class DueDateBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    reminder_days: int = 30  # Days before to remind
    category: Optional[str] = None  # e.g., "GST Filing", "Income Tax", "ROC"
    assigned_to: Optional[str] = None
    client_id: Optional[str] = None
    status: str = "pending"  # pending, completed

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
    action: str  # "punch_in" or "punch_out"

class Attendance(AttendanceBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    duration_minutes: Optional[int] = None

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str  # "task", "dsc", "system"

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
    client_type: str  # proprietor, pvt_ltd, llp, partnership, huf, trust
    contact_persons: List[ContactPerson] = []  # Multiple contacts
    email: EmailStr
    phone: str
    birthday: Optional[date] = None
    services: List[str] = []  # gst, trademark, income_tax, roc, etc
    dsc_details: List[ClientDSC] = []  # DSC certificates for this client
    assigned_to: Optional[str] = None  # staff ID
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
    members: List[str]  # List of user IDs
    is_direct: bool = False  # True for 1-on-1 chats

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
    message_type: str = "text"  # text, image, file
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
    expiring_dsc_list: List[dict]  # List of expiring DSCs
    total_clients: int
    upcoming_birthdays: int
    upcoming_due_dates: int
    team_workload: List[dict]
    compliance_status: dict

# Root route
@api_router.get("/")
async def root():
    return {"message": "Taskosphere API", "status": "running"}

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
                <h1 style="color: #4F46E5; text-align: center;">🎉 Happy Birthday! 🎉</h1>
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Dear {client_name},
                </p>
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    On behalf of our entire team, we wish you a very Happy Birthday! 🎂
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

# Root route
@api_router.get("/")
async def root():
    return {"message": "Taskosphere API", "status": "running"}

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

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user)

# Auth routes
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user_data.password)
    user = User(**user_data.model_dump(exclude={"password"}))
    
    doc = user.model_dump()
    doc["password"] = hashed_password
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.users.insert_one(doc)
    
    access_token = create_access_token({"sub": user.id})
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    user_obj = User(**{k: v for k, v in user.items() if k != "password"})
    access_token = create_access_token({"sub": user_obj.id})
    return {"access_token": access_token, "token_type": "bearer", "user": user_obj}

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# User routes
@api_router.get("/users", response_model=List[User])
async def get_users(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    for user in users:
        if isinstance(user["created_at"], str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    return users

@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, user_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Only allow updating these fields
    allowed_fields = ["full_name", "role", "departments"]
    update_data = {k: v for k, v in user_data.items() if k in allowed_fields}
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return User(**updated)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

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

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(current_user: User = Depends(get_current_user)):
    query = {}
    # Role-based filtering
    if current_user.role == "staff":
        # Staff sees only tasks assigned to them (as primary or sub-assignee)
        permissions = current_user.permissions
        if permissions and permissions.can_view_all_tasks:
            pass  # Can view all tasks
        else:
            query["$or"] = [
                {"assigned_to": current_user.id},
                {"sub_assignees": current_user.id}
            ]
    
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    for task in tasks:
        if isinstance(task["created_at"], str):
            task["created_at"] = datetime.fromisoformat(task["created_at"])
        if isinstance(task["updated_at"], str):
            task["updated_at"] = datetime.fromisoformat(task["updated_at"])
        if task.get("due_date") and isinstance(task["due_date"], str):
            task["due_date"] = datetime.fromisoformat(task["due_date"])
    return tasks

@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if isinstance(task["created_at"], str):
        task["created_at"] = datetime.fromisoformat(task["created_at"])
    if isinstance(task["updated_at"], str):
        task["updated_at"] = datetime.fromisoformat(task["updated_at"])
    if task.get("due_date") and isinstance(task["due_date"], str):
        task["due_date"] = datetime.fromisoformat(task["due_date"])
    return Task(**task)

@api_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_data: TaskCreate, current_user: User = Depends(get_current_user)):
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update_data.get("due_date"):
        update_data["due_date"] = update_data["due_date"].isoformat()
    
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    
    updated = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated["updated_at"], str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    if updated.get("due_date") and isinstance(updated["due_date"], str):
        updated["due_date"] = datetime.fromisoformat(updated["due_date"])
    return Task(**updated)

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}

# DSC routes
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
async def get_dsc_list(current_user: User = Depends(get_current_user)):
    dsc_list = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
    for dsc in dsc_list:
        if isinstance(dsc["created_at"], str):
            dsc["created_at"] = datetime.fromisoformat(dsc["created_at"])
        if isinstance(dsc["issue_date"], str):
            dsc["issue_date"] = datetime.fromisoformat(dsc["issue_date"])
        if isinstance(dsc["expiry_date"], str):
            dsc["expiry_date"] = datetime.fromisoformat(dsc["expiry_date"])
    return dsc_list

@api_router.put("/dsc/{dsc_id}", response_model=DSC)
async def update_dsc(dsc_id: str, dsc_data: DSCCreate, current_user: User = Depends(get_current_user)):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    
    update_data = dsc_data.model_dump()
    update_data["issue_date"] = update_data["issue_date"].isoformat()
    update_data["expiry_date"] = update_data["expiry_date"].isoformat()
    
    await db.dsc_register.update_one({"id": dsc_id}, {"$set": update_data})
    
    updated = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if isinstance(updated["created_at"], str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated["issue_date"], str):
        updated["issue_date"] = datetime.fromisoformat(updated["issue_date"])
    if isinstance(updated["expiry_date"], str):
        updated["expiry_date"] = datetime.fromisoformat(updated["expiry_date"])
    return DSC(**updated)

@api_router.delete("/dsc/{dsc_id}")
async def delete_dsc(dsc_id: str, current_user: User = Depends(get_current_user)):
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
        "id": str(uuid.uuid4()),  # Add unique ID for each movement
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
    
    return {"message": f"DSC marked as {movement_data.movement_type}", "movement": movement}

class MovementUpdateRequest(BaseModel):
    movement_id: str
    movement_type: str  # "IN" or "OUT"
    person_name: Optional[str] = None
    notes: Optional[str] = None

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
    
    return {"message": "Movement updated successfully", "movement_log": movement_log}

# Attendance routes
@api_router.post("/attendance", response_model=Attendance)
async def record_attendance(action_data: AttendanceCreate, current_user: User = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
    
    if action_data.action == "punch_in":
        if existing:
            raise HTTPException(status_code=400, detail="Already punched in today")
        
        attendance = Attendance(
            user_id=current_user.id,
            date=today,
            punch_in=datetime.now(timezone.utc)
        )
        
        doc = attendance.model_dump()
        doc["punch_in"] = doc["punch_in"].isoformat()
        await db.attendance.insert_one(doc)
        return attendance
    
    elif action_data.action == "punch_out":
        if not existing:
            raise HTTPException(status_code=400, detail="No punch in record found")
        if existing.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out today")
        
        punch_out_time = datetime.now(timezone.utc)
        punch_in_time = datetime.fromisoformat(existing["punch_in"]) if isinstance(existing["punch_in"], str) else existing["punch_in"]
        duration = int((punch_out_time - punch_in_time).total_seconds() / 60)
        
        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today},
            {"$set": {"punch_out": punch_out_time.isoformat(), "duration_minutes": duration}}
        )
        
        updated = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
        if isinstance(updated["punch_in"], str):
            updated["punch_in"] = datetime.fromisoformat(updated["punch_in"])
        if isinstance(updated["punch_out"], str):
            updated["punch_out"] = datetime.fromisoformat(updated["punch_out"])
        return Attendance(**updated)

@api_router.get("/attendance/today", response_model=Optional[Attendance])
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    attendance = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
    
    if not attendance:
        return None
    
    if isinstance(attendance["punch_in"], str):
        attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
    if attendance.get("punch_out") and isinstance(attendance["punch_out"], str):
        attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])
    return Attendance(**attendance)

@api_router.get("/attendance/history", response_model=List[Attendance])
async def get_attendance_history(current_user: User = Depends(get_current_user)):
    query = {"user_id": current_user.id} if current_user.role == "staff" else {}
    attendance_list = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    for attendance in attendance_list:
        if isinstance(attendance["punch_in"], str):
            attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
        if attendance.get("punch_out") and isinstance(attendance["punch_out"], str):
            attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])
    return attendance_list

@api_router.get("/attendance/my-summary")
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
    """Get all staff attendance report (admin only)"""

    # Admin check
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

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

        result.append(data)

    # Sort by highest total minutes
    result.sort(key=lambda x: x["total_minutes"], reverse=True)

    return {
        "month": target_month,
        "total_staff": len(result),
        "staff_report": result
    }

    """Get due dates in next N days"""
    now = datetime.now(timezone.utc)
    future_date = now + timedelta(days=days)
    
    query = {"status": "pending"}
    if current_user.role == "staff":
        query["assigned_to"] = current_user.id
    
    due_dates = await db.due_dates.find(query, {"_id": 0}).to_list(1000)
    
    upcoming = []
    for dd in due_dates:
        dd_date = datetime.fromisoformat(dd["due_date"]) if isinstance(dd["due_date"], str) else dd["due_date"]
        if now <= dd_date <= future_date:
            if isinstance(dd["created_at"], str):
                dd["created_at"] = datetime.fromisoformat(dd["created_at"])
            dd["due_date"] = dd_date
            dd["days_remaining"] = (dd_date - now).days
            upcoming.append(dd)
    
    return sorted(upcoming, key=lambda x: x["days_remaining"])

# ================= DUE DATE ROUTES =================

@api_router.post("/duedates", response_model=DueDate)
async def create_due_date(due_date_data: DueDateCreate, current_user: User = Depends(get_current_user)):
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

    if current_user.role == "staff":
        query["assigned_to"] = current_user.id

    due_dates = await db.due_dates.find(query, {"_id": 0}).to_list(1000)

    for dd in due_dates:
        if isinstance(dd["created_at"], str):
            dd["created_at"] = datetime.fromisoformat(dd["created_at"])
        if isinstance(dd["due_date"], str):
            dd["due_date"] = datetime.fromisoformat(dd["due_date"])

    return due_dates

@api_router.delete("/duedates/{due_date_id}")
async def delete_due_date(due_date_id: str, current_user: User = Depends(get_current_user)):
    result = await db.due_dates.delete_one({"id": due_date_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Due date not found")
    return {"message": "Due date deleted successfully"}

# Reports routes
@api_router.get("/reports/efficiency")
async def get_efficiency_report(current_user: User = Depends(get_current_user)):
    if current_user.role == "staff":
        query = {"user_id": current_user.id}
    else:
        query = {}
    
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
async def get_clients(current_user: User = Depends(get_current_user)):
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


# ================= UPDATE CLIENT =================
@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(
    client_id: str,
    client_data: ClientCreate,
    current_user: User = Depends(get_current_user)
):

    # Check if client exists
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")

    update_data = client_data.model_dump()

    if update_data.get("birthday"):
        update_data["birthday"] = update_data["birthday"].isoformat()

    await db.clients.update_one(
        {"id": client_id},
        {"$set": update_data}
    )

    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})

    if not updated:
        raise HTTPException(status_code=404, detail="Client not found")

    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])

    if updated.get("birthday") and isinstance(updated["birthday"], str):
        updated["birthday"] = date.fromisoformat(updated["birthday"])

    return Client(**updated)


# ================= DELETE CLIENT =================

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(get_current_user)):
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted successfully"}


# ================= SEND BIRTHDAY EMAIL =================

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
        client["contact_person"]
    )

    return {"message": "Birthday email queued for delivery"}


# ================= UPCOMING BIRTHDAYS =================

@api_router.get("/clients/upcoming-birthdays")
async def get_upcoming_birthdays(days: int = 7, current_user: User = Depends(get_current_user)):

    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)

    today = date.today()
    upcoming = []

    for client in clients:
        if client.get("birthday"):
            bday = date.fromisoformat(client["birthday"]) if isinstance(client["birthday"], str) else client["birthday"]

            this_year_bday = bday.replace(year=today.year)

            if this_year_bday < today:
                this_year_bday = bday.replace(year=today.year + 1)

            days_until = (this_year_bday - today).days

            if 0 <= days_until <= days:
                client["days_until_birthday"] = days_until
                upcoming.append(client)

    return sorted(upcoming, key=lambda x: x["days_until_birthday"])


# ================= URGENT DEADLINES =================

@api_router.get("/dashboard/urgent")
async def get_urgent_deadlines(current_user: User = Depends(get_current_user)):

    now = datetime.now(timezone.utc)
    next_30_days = now + timedelta(days=30)

    query = {"status": "pending"}

    if current_user.role == "staff":
        query["assigned_to"] = current_user.id

    due_dates = await db.due_dates.find(query, {"_id": 0}).to_list(1000)

    urgent_list = []

    for dd in due_dates:
        dd_date = datetime.fromisoformat(dd["due_date"]) if isinstance(dd["due_date"], str) else dd["due_date"]

        if now <= dd_date <= next_30_days:
            dd["due_date"] = dd_date
            dd["days_remaining"] = (dd_date - now).days
            urgent_list.append(dd)

    urgent_list.sort(key=lambda x: x["days_remaining"])

    return urgent_list


# ================= DASHBOARD STATS =================

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):

    now = datetime.now(timezone.utc)

    task_query = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
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

    dsc_list = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
    total_dsc = len(dsc_list)

    expiring_dsc_count = 0
    expiring_dsc_list = []

    for dsc in dsc_list:
        expiry_date = datetime.fromisoformat(dsc["expiry_date"]) if isinstance(dsc["expiry_date"], str) else dsc["expiry_date"]
        days_left = (expiry_date - now).days

        if days_left <= 90:
            expiring_dsc_count += 1
            expiring_dsc_list.append({
                "id": dsc["id"],
                "holder_name": dsc["holder_name"],
                "certificate_number": dsc["certificate_number"],
                "expiry_date": dsc["expiry_date"],
                "days_left": days_left,
                "status": "expired" if days_left < 0 else "expiring"
            })

    client_query = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
    clients = await db.clients.find(client_query, {"_id": 0}).to_list(1000)
    total_clients = len(clients)

    today = date.today()
    upcoming_birthdays = 0

    for client in clients:
        if client.get("birthday"):
            bday = date.fromisoformat(client["birthday"]) if isinstance(client["birthday"], str) else client["birthday"]
            this_year_bday = bday.replace(year=today.year)

            if this_year_bday < today:
                this_year_bday = bday.replace(year=today.year + 1)

            if 0 <= (this_year_bday - today).days <= 7:
                upcoming_birthdays += 1

    upcoming_due_dates_count = 0
    due_dates = await db.due_dates.find({"status": "pending"}, {"_id": 0}).to_list(1000)

    for dd in due_dates:
        dd_date = datetime.fromisoformat(dd["due_date"]) if isinstance(dd["due_date"], str) else dd["due_date"]
        if (dd_date - now).days <= 120:
            upcoming_due_dates_count += 1

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
        team_workload=[],
        compliance_status=compliance_status
    )
    
    doc = group.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.chat_groups.insert_one(doc)
    return group

# Get all chat groups for current user
@api_router.get("/chat/groups")
async def get_chat_groups(current_user: User = Depends(get_current_user)):
    """Get all chat groups the user is a member of"""
    groups = await db.chat_groups.find(
        {"members": current_user.id},
        {"_id": 0}
    ).sort("last_message_at", -1).to_list(100)
    
    # Get user info for member names
    user_ids = set()
    for group in groups:
        user_ids.update(group["members"])
    
    users = await db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "password": 0}).to_list(100)
    user_map = {u["id"]: u for u in users}
    
    result = []
    for group in groups:
        if isinstance(group["created_at"], str):
            group["created_at"] = datetime.fromisoformat(group["created_at"])
        if group.get("last_message_at") and isinstance(group["last_message_at"], str):
            group["last_message_at"] = datetime.fromisoformat(group["last_message_at"])
        
        # Add member details
        group["member_details"] = [
            {"id": m, "name": user_map.get(m, {}).get("full_name", "Unknown"), "role": user_map.get(m, {}).get("role", "staff")}
            for m in group["members"]
        ]
        
        # For direct chats, get the other person's name
        if group["is_direct"]:
            other_member = [m for m in group["members"] if m != current_user.id]
            if other_member:
                group["display_name"] = user_map.get(other_member[0], {}).get("full_name", "Unknown")
            else:
                group["display_name"] = group["name"]
        else:
            group["display_name"] = group["name"]
        
        # Get unread count
        unread = await db.chat_messages.count_documents({
            "group_id": group["id"],
            "sender_id": {"$ne": current_user.id},
            "read_by": {"$ne": current_user.id}
        })
        group["unread_count"] = unread
        
        # Get last message
        last_msg = await db.chat_messages.find_one(
            {"group_id": group["id"]},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        group["last_message"] = last_msg
        
        result.append(group)
    
    return result

# Get a specific chat group
@api_router.get("/chat/groups/{group_id}")
async def get_chat_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific chat group if user is a member"""
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
    if isinstance(group["created_at"], str):
        group["created_at"] = datetime.fromisoformat(group["created_at"])
    
    return group

# Update chat group (add/remove members, change name)
@api_router.put("/chat/groups/{group_id}")
async def update_chat_group(
    group_id: str,
    update_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Update a chat group (only creator or admin can update)"""
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
    if group["created_by"] != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only group creator or admin can update")
    
    allowed_fields = ["name", "description", "members"]
    update = {k: v for k, v in update_data.items() if k in allowed_fields}
    
    # Ensure creator stays in members
    if "members" in update:
        update["members"] = list(set(update["members"] + [group["created_by"]]))
    
    await db.chat_groups.update_one({"id": group_id}, {"$set": update})
    return {"message": "Group updated successfully"}

# Delete/Leave chat group
@api_router.delete("/chat/groups/{group_id}")
async def leave_chat_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Leave a chat group or delete if creator"""
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
    # If creator, delete the group
    if group["created_by"] == current_user.id:
        await db.chat_groups.delete_one({"id": group_id})
        await db.chat_messages.delete_many({"group_id": group_id})
        return {"message": "Group deleted successfully"}
    
    # Otherwise, just remove from members
    await db.chat_groups.update_one(
        {"id": group_id},
        {"$pull": {"members": current_user.id}}
    )
    return {"message": "Left group successfully"}

# Get messages for a chat group
@api_router.get("/chat/groups/{group_id}/messages")
async def get_chat_messages(
    group_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get messages for a chat group"""
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
    query = {"group_id": group_id}
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.chat_messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    # Mark messages as read
    await db.chat_messages.update_many(
        {"group_id": group_id, "sender_id": {"$ne": current_user.id}},
        {"$addToSet": {"read_by": current_user.id}}
    )
    
    for msg in messages:
        if isinstance(msg["created_at"], str):
            msg["created_at"] = datetime.fromisoformat(msg["created_at"])
    
    return list(reversed(messages))

# Send a message to a chat group
@api_router.post("/chat/groups/{group_id}/messages")
async def send_chat_message(
    group_id: str,
    message_data: ChatMessageCreate,
    current_user: User = Depends(get_current_user)
):
    """Send a message to a chat group"""
    group = await db.chat_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.id not in group["members"]:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
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
    
    # Update group's last message time
    await db.chat_groups.update_one(
        {"id": group_id},
        {"$set": {"last_message_at": doc["created_at"]}}
    )
    
    return message

# Upload file for chat
@api_router.post("/chat/upload")
async def upload_chat_file(current_user: User = Depends(get_current_user)):
    """Upload a file for chat - returns upload URL info"""
    # For now, we'll use base64 encoding for files
    # In production, you'd use cloud storage like S3
    return {"message": "Use base64 encoding in message content for file uploads"}

# Get all users for starting new chats
@api_router.get("/chat/users")
async def get_chat_users(current_user: User = Depends(get_current_user)):
    """Get all users available for chat"""
    users = await db.users.find(
        {"id": {"$ne": current_user.id}},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    for user in users:
        if isinstance(user["created_at"], str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return users
# ================= MANUAL FULL REMINDER =================
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


# ================= INTERNAL FUNCTION FOR AUTO REMINDER =================
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


# ================= AUTO DAILY REMINDER (ONLY ONE) =================
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

    except Exception as e:
        logger.error(f"Auto reminder middleware error: {str(e)}")

    response = await call_next(request)
    return response


# ================= NOTIFICATIONS =================
@api_router.get("/notifications")
async def get_notifications(current_user: User = Depends(get_current_user)):
    return []


# ================= SHUTDOWN =================
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ================= INDIVIDUAL STAFF REMINDER =================
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
# ================= INCLUDE ROUTER =================
# ================= STAFF ACTIVITY =================

@api_router.post("/activity/log")
async def log_staff_activity(
    activity_data: StaffActivityCreate,
    current_user: User = Depends(get_current_user)
):
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
    current_user: User = Depends(get_current_user)
):
    activities = await db.staff_activity.find({}, {"_id": 0}).to_list(1000)
    return activities


@api_router.get("/activity/user/{user_id}")
async def get_user_activity(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    activities = await db.staff_activity.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(1000)

    return activities

app.include_router(api_router)
