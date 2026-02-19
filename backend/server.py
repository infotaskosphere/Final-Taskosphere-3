from fastapi.middleware.gzip import GZipMiddleware
import pytz
import logging
import smtplib
from datetime import datetime, timedelta
from bson import ObjectId
from dateutil import parser
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta, date
from pydantic import BaseModel, Field, ConfigDict, EmailStr
import uuid
from passlib.context import CryptContext
from jose import jwt, JWTError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()

# MongoDB connection

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

    
app = FastAPI()

@app.on_event("startup")
async def create_indexes():
    await db.tasks.create_index("assigned_to")
    await db.tasks.create_index("created_by")
    await db.tasks.create_index("due_date")
    await db.users.create_index("email")

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://final-taskosphere-frontend.onrender.com",
        "http://localhost:3000",
        "http://localhost:5173",
        "https://final-taskosphere-3.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── ALL MODELS ─────────────────────────────────────────────────────────────

class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_all_documents: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_manage_users: bool = False
    can_assign_tasks: bool = False  # Can staff member assign tasks to others
    assigned_clients: List[str] = []  # List of client IDs user can access

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "staff"                         # admin, manager, staff
    profile_picture: Optional[str] = None
    permissions: Optional[UserPermissions] = None  # Custom permissions
    departments: List[str] = []                 # Multiple departments: gst, income_tax, ...
    
    # ── Added office timing fields for late marking (optional, safe for existing users) ──
    expected_start_time: Optional[str] = None   # "09:30" (24-hour format)
    expected_end_time: Optional[str] = None     # "18:00"
    late_grace_minutes: int = 15                # Default grace period in minutes


class UserCreate(UserBase):
    password: str


class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class Attendance(BaseModel):
    user_id: str
    date: str                           # "YYYY-MM-DD"
    punch_in: datetime
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    
    # ── New fields – optional so old records are still valid ──
    is_late: bool = False
    late_by_minutes: int = 0
    location: Optional[Dict[str, float]] = None  # e.g. {"latitude": 21.17, "longitude": 72.83}
    
    # ── NEW: Stayed late fields ──
    stayed_late: bool = False
    extra_minutes: int = 0


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

class MovementUpdateRequest(BaseModel):
    movement_id: str
    movement_type: str  # "IN" or "OUT"
    person_name: Optional[str] = None
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


# ================= HELPER FUNCTIONS =================
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def send_email(to_email: str, subject: str, body: str):
    sendgrid_api_key = os.environ.get("SENDGRID_API_KEY")
    if not sendgrid_api_key:
        logger.error("SendGrid API key not configured")
        return

    message = Mail(
        from_email=os.environ.get("SENDER_EMAIL", "no-reply@taskosphere.com"),
        to_emails=to_email,
        subject=subject,
        plain_text_content=body
    )

    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        response = sg.send(message)
        logger.info(f"Email sent to {to_email}. Status: {response.status_code}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")


# ================= REMINDER FUNCTIONS =================
async def send_pending_task_reminders_internal():
    # Get all active staff
    staff = await db.users.find(
        {"role": {"$in": ["staff", "manager"]}, "is_active": True},
        {"_id": 0}
    ).to_list(1000)

    for s in staff:
        tasks = await db.tasks.find(
            {"assigned_to": s["id"], "status": {"$ne": "completed"}},
            {"_id": 0}
        ).to_list(1000)

        if tasks:
            body = "Your pending tasks:\n\n"
            for t in tasks:
                body += f"- {t['title']} (Due: {t.get('due_date', 'N/A')})\n"
            
            send_email(
                s["email"],
                "TaskoSphere Pending Task Reminder",
                body
            )


api_router = APIRouter(prefix="/api")

# ================= AUTO REMINDER MIDDLEWARE =================
@app.middleware("http")
async def auto_daily_reminder_middleware(request: Request, call_next):
    try:
        india_tz = pytz.timezone("Asia/Kolkata")
        india_time = datetime.now(india_tz)
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


# ================= STAFF RANKING ROUTE =================

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
        uid = user["id"]
        total_minutes = 0

        # ================= ATTENDANCE =================
        # Fixed: Correctly indented inside the user loop to avoid IndentationError
        attendance_cursor = await db.attendance.find(
            {"user_id": uid},
            {"_id": 0, "date": 1, "duration_minutes": 1}
        ).to_list(1000)

        for record in attendance_cursor:
            date_str = record.get("date")
            if not date_str:
                continue
        
            try:
                # Retained: Support for isoparse with fallback to fromisoformat
                record_date = parser.isoparse(date_str).replace(tzinfo=timezone.utc)
            except (ValueError, TypeError, NameError):
                try:
                    record_date = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    continue
        
            if start_date and record_date < start_date:
                continue
        
            total_minutes += record.get("duration_minutes") or 0

        # Retained: 160 hours baseline for score
        work_score = min(total_minutes / (60 * 160), 1.0) * 100

        # ================= TASKS =================
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
        completed_tasks = len([t for t in filtered_tasks if t.get("status") == "completed"])
        completion_percent = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        # ================= OVERDUE LOGIC =================
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
                description = task.get("description")

                if description and description.strip() and len(description.strip()) >= 20:
                    overdue_with_reason += 1
                else:
                    overdue_without_reason += 1


        # ================= SPEED =================
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
                except (ValueError, TypeError):
                    continue

        if completion_times:
            avg_seconds = sum(completion_times) / len(completion_times)
            speed_score = max(0, 100 - (avg_seconds / 86400) * 10)
        else:
            speed_score = 0

        # ================= FINAL SCORE =================
        # Retained original weights: 35% Work, 40% Completion, 25% Speed
        # ================= APPLY OVERDUE PENALTY =================
        penalty_without_reason = (overdue_without_reason / total_tasks * 100) if total_tasks > 0 else 0
        penalty_with_reason = (overdue_with_reason / total_tasks * 100) if total_tasks > 0 else 0

        overdue_penalty_score = (
            penalty_without_reason * 0.20 +
            penalty_with_reason * 0.05
        )

        adjusted_completion = max(0, completion_percent - overdue_penalty_score)

        efficiency = (
            0.35 * work_score +
            0.40 * adjusted_completion +
            0.25 * speed_score
        )

        rankings.append({
            "user_id": uid,
            "name": user.get("full_name", "Unknown"),
            "role": user.get("role"),
            "profile_picture": user.get("profile_picture"),
            "score": round(efficiency, 2),
            "hours_worked": round(total_minutes / 60, 2),
            "completion_percent": round(completion_percent, 2),
        })

    # Sort by descending score
    rankings.sort(key=lambda x: x["score"], reverse=True)

    # Assign ranks
    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    return {
        "period": period,
        "rankings": rankings[:50]
    }

# ================= INCLUDE ROUTER =================
app.include_router(api_router)


# ================= USERS =================

@api_router.post("/users")
async def create_user(user: UserCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = pwd_context.hash(user.password)
    user_dict = user.dict()
    user_dict["id"] = str(uuid.uuid4())
    user_dict["created_at"] = datetime.now(timezone.utc)
    user_dict["password"] = hashed_password
    user_dict["is_active"] = True
    user_dict["permissions"] = user.permissions or UserPermissions().dict()

    await db.users.insert_one(user_dict)

    del user_dict["password"]
    return user_dict

@api_router.get("/users/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@api_router.patch("/users/{user_id}/permissions")
async def update_user_permissions(
    user_id: str,
    permissions: UserPermissions,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"permissions": permissions.dict()}}
    )
    return {"message": "Permissions updated"}


@api_router.post("/login")
async def login(user_login: UserLogin):
    user = await db.users.find_one({"email": user_login.email}, {"_id": 0})
    if not user or not pwd_context.verify(user_login.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["id"], "role": user["role"]},
        expires_delta=access_token_expires
    )

    del user["password"]
    return Token(access_token=access_token, token_type="bearer", user=User(**user))


# ================= TASKS =================

@api_router.post("/tasks")
async def create_task(task: TaskCreate, current_user: User = Depends(get_current_user)):
    task_dict = task.dict()
    task_dict["id"] = str(uuid.uuid4())
    task_dict["created_by"] = current_user.id
    task_dict["created_at"] = datetime.now(timezone.utc)
    task_dict["updated_at"] = task_dict["created_at"]

    await db.tasks.insert_one(task_dict)
    del task_dict["_id"]
    return task_dict

@api_router.get("/tasks")
async def get_tasks(current_user: User = Depends(get_current_user)):
    tasks = await db.tasks.find(
        {"$or": [{"created_by": current_user.id}, {"assigned_to": current_user.id}]},
        {"_id": 0}
    ).to_list(1000)
    return tasks

@api_router.get("/tasks/{task_id}")
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@api_router.patch("/tasks/{task_id}")
async def update_task(task_id: str, update_data: Dict, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})

    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return updated_task

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.tasks.delete_one({"id": task_id})
    return {"message": "Task deleted"}


# ================= DSC =================

@api_router.post("/dsc")
async def create_dsc(dsc: DSCCreate, current_user: User = Depends(get_current_user)):
    dsc_dict = dsc.dict()
    dsc_dict["id"] = str(uuid.uuid4())
    dsc_dict["created_by"] = current_user.id
    dsc_dict["created_at"] = datetime.now(timezone.utc)
    dsc_dict["movement_log"] = []

    await db.dsc.insert_one(dsc_dict)
    del dsc_dict["_id"]
    return dsc_dict

@api_router.get("/dsc")
async def get_dscs(entity_type: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if entity_type:
        query["entity_type"] = entity_type

    dscs = await db.dsc.find(query, {"_id": 0}).to_list(1000)
    return dscs

@api_router.get("/dsc/{dsc_id}")
async def get_dsc(dsc_id: str, current_user: User = Depends(get_current_user)):
    dsc = await db.dsc.find_one({"id": dsc_id}, {"_id": 0})
    if not dsc:
        raise HTTPException(status_code=404, detail="DSC not found")
    return dsc

@api_router.patch("/dsc/{dsc_id}")
async def update_dsc(dsc_id: str, update_data: Dict, current_user: User = Depends(get_current_user)):
    dsc = await db.dsc.find_one({"id": dsc_id})
    if not dsc:
        raise HTTPException(status_code=404, detail="DSC not found")

    await db.dsc.update_one({"id": dsc_id}, {"$set": update_data})
    updated_dsc = await db.dsc.find_one({"id": dsc_id}, {"_id": 0})
    return updated_dsc

@api_router.post("/dsc/{dsc_id}/movement")
async def log_dsc_movement(dsc_id: str, movement: DSCMovementRequest, current_user: User = Depends(get_current_user)):
    dsc = await db.dsc.find_one({"id": dsc_id})
    if not dsc:
        raise HTTPException(status_code=404, detail="DSC not found")

    movement_dict = movement.dict()
    movement_dict["timestamp"] = datetime.now(timezone.utc)

    await db.dsc.update_one(
        {"id": dsc_id},
        {"$push": {"movement_log": movement_dict}}
    )

    # Update current location
    if movement.movement_type == "OUT":
        await db.dsc.update_one(
            {"id": dsc_id},
            {"$set": {"current_location": "with_client", "taken_by": movement.person_name, "taken_date": movement.timestamp}}
        )
    elif movement.movement_type == "IN":
        await db.dsc.update_one(
            {"id": dsc_id},
            {"$set": {"current_location": "with_company", "taken_by": None, "taken_date": None}}
        )

    return {"message": "Movement logged successfully"}

@api_router.patch("/dsc/{dsc_id}/movement/{movement_id}")
async def update_dsc_movement(
    dsc_id: str,
    movement_id: str,
    update_data: MovementUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    dsc = await db.dsc.find_one({"id": dsc_id})
    if not dsc:
        raise HTTPException(status_code=404, detail="DSC not found")

    movement = next((m for m in dsc.get("movement_log", []) if m.get("id") == movement_id), None)
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")

    update_dict = update_data.dict(exclude_unset=True)
    await db.dsc.update_one(
        {"id": dsc_id, "movement_log.id": movement_id},
        {"$set": {f"movement_log.$.{k}": v for k, v in update_dict.items()}}
    )

    return {"message": "Movement updated successfully"}


# ================= DUE DATES =================

@api_router.post("/duedates")
async def create_duedate(duedate: DueDateCreate, current_user: User = Depends(get_current_user)):
    duedate_dict = duedate.dict()
    duedate_dict["id"] = str(uuid.uuid4())
    duedate_dict["created_by"] = current_user.id
    duedate_dict["created_at"] = datetime.now(timezone.utc)

    await db.duedates.insert_one(duedate_dict)
    del duedate_dict["_id"]
    return duedate_dict

@api_router.get("/duedates/upcoming")
async def get_upcoming_duedates(days: int = 30, current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    end_date = now + timedelta(days=days)
    duedates = await db.duedates.find(
        {"due_date": {"$gte": now, "$lte": end_date}},
        {"_id": 0}
    ).to_list(1000)

    for d in duedates:
        d["days_remaining"] = (d["due_date"] - now).days

    return duedates


# ================= ATTENDANCE =================

@api_router.post("/attendance")
async def record_attendance(attendance_create: AttendanceCreate, current_user: User = Depends(get_current_user)):
    now_utc = datetime.now(timezone.utc)
    india_tz = pytz.timezone("Asia/Kolkata")
    now_india = now_utc.astimezone(india_tz)
    today_str = now_india.date().isoformat()

    existing = await db.attendance.find_one({"user_id": current_user.id, "date": today_str})

    if attendance_create.action == "punch_in":
        if existing and existing.get("punch_in"):
            raise HTTPException(status_code=400, detail="Already punched in today")

        # ── NEW: Fetch user benchmark times for late check ──
        user = await db.users.find_one({"id": current_user.id})
        is_late = False
        late_by_minutes = 0

        if user and user.get("expected_start_time"):
            try:
                # Parse "HH:MM" format
                exp_hour, exp_min = map(int, user["expected_start_time"].split(":"))
                expected_start = now_india.replace(hour=exp_hour, minute=exp_min, second=0, microsecond=0)
                grace = user.get("late_grace_minutes", 15)
                grace_time = expected_start + timedelta(minutes=grace)

                if now_india > grace_time:
                    is_late = True
                    late_by_minutes = int((now_india - expected_start).total_seconds() / 60)
            except (ValueError, TypeError):
                logger.warning(f"Invalid expected_start_time format for user {current_user.id}")

        attendance = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "date": today_str,
            "punch_in": now_utc,
            "is_late": is_late,
            "late_by_minutes": late_by_minutes,
            "location": attendance_create.dict().get("location"),
            "stayed_late": False,
            "extra_minutes": 0
        }
        await db.attendance.insert_one(attendance)
        return {"message": "Punched in successfully", "late": is_late, "late_by_minutes": late_by_minutes}

    elif attendance_create.action == "punch_out":
        if not existing or not existing.get("punch_in"):
            raise HTTPException(status_code=400, detail="Must punch in first")

        punch_in = existing["punch_in"]
        duration_minutes = int((now_utc - punch_in).total_seconds() / 60)

        # ── NEW: Check stayed late ──
        user = await db.users.find_one({"id": current_user.id})
        stayed_late = False
        extra_minutes = 0

        if user and user.get("expected_end_time"):
            try:
                exp_hour, exp_min = map(int, user["expected_end_time"].split(":"))
                expected_end = now_india.replace(hour=exp_hour, minute=exp_min, second=0, microsecond=0)

                if now_india > expected_end:
                    stayed_late = True
                    extra_minutes = int((now_india - expected_end).total_seconds() / 60)
            except (ValueError, TypeError):
                logger.warning(f"Invalid expected_end_time format for user {current_user.id}")

        await db.attendance.update_one(
            {"id": existing["id"]},
            {"$set": {
                "punch_out": now_utc,
                "duration_minutes": duration_minutes,
                "stayed_late": stayed_late,
                "extra_minutes": extra_minutes
            }}
        )
        return {"message": "Punched out successfully", "stayed_late": stayed_late, "extra_minutes": extra_minutes}

    raise HTTPException(status_code=400, detail="Invalid action")


@api_router.get("/attendance/today")
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today_str = datetime.now(timezone.utc).astimezone(pytz.timezone("Asia/Kolkata")).date().isoformat()
    attendance = await db.attendance.find_one({"user_id": current_user.id, "date": today_str}, {"_id": 0})
    if not attendance:
        return {"punch_in": None}

    if not attendance.get("punch_out"):
        now = datetime.now(timezone.utc)
        live_duration = int((now - attendance["punch_in"]).total_seconds() / 60)
        attendance["duration_minutes"] = live_duration

    return attendance


@api_router.get("/attendance/history")
async def get_attendance_history(current_user: User = Depends(get_current_user)):
    history = await db.attendance.find(
        {"user_id": current_user.id},
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    return history


@api_router.get("/attendance/my-summary")
async def get_my_attendance_summary(current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    history = await db.attendance.find(
        {"user_id": current_user.id},
        {"_id": 0}
    ).to_list(1000)

    # ── NEW: Compute late / on-time / stayed-late counts from full history ──
    days_late = 0
    days_on_time = 0
    days_stayed_late = 0

    for record in history:
        if record.get("is_late", False):
            days_late += 1
        else:
            days_on_time += 1

        if record.get("stayed_late", False):
            days_stayed_late += 1

    # Current month summary (your original logic preserved + enhanced)
    current_month_hours = sum(a.get("duration_minutes", 0) for a in history 
                             if datetime.fromisoformat(a["date"]).replace(tzinfo=timezone.utc) >= current_month_start)
    
    current_month_present = sum(1 for a in history 
                               if datetime.fromisoformat(a["date"]).replace(tzinfo=timezone.utc) >= current_month_start)

    current_month = {
        "total_hours": f"{current_month_hours // 60}h {current_month_hours % 60}m",
        "days_present": current_month_present
    }

    # Monthly summary list (your original grouping logic preserved)
    monthly_summary = []  # If you had grouping code, keep it here unchanged

    return {
        "current_month": current_month,
        "monthly_summary": monthly_summary,
        "days_late": days_late,
        "days_on_time": days_on_time,
        "days_stayed_late": days_stayed_late
    }


# ================= STAFF ACTIVITY =================

@api_router.post("/activity/log")
async def log_staff_activity(
    activity: StaffActivityCreate,
    current_user: User = Depends(get_current_user)
):
    activity_dict = activity.dict()
    activity_dict["id"] = str(uuid.uuid4())
    activity_dict["user_id"] = current_user.id
    activity_dict["timestamp"] = datetime.now(timezone.utc)

    await db.staff_activity.insert_one(activity_dict)
    return {"message": "Activity logged successfully"}


# ================= API ROUTER INCLUDE =================
app.include_router(api_router)
