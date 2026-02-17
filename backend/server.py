import pytz
import logging
import smtplib
from datetime import datetime, timedelta
from bson import ObjectId
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import timezone, date
from passlib.context import CryptContext
from jose import jwt, JWTError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, Content, Personalization

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

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
        "http://localhost:3000",
        "http://localhost:5173",
        "https://final-taskosphere-3.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")
app.include_router(api_router)

# Models
class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_all_documents: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_manage_users: bool = False
    can_assign_tasks: bool = False
    assigned_clients: List[str] = []

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "staff"
    profile_picture: Optional[str] = None
    permissions: Optional[UserPermissions] = None
    departments: List[str] = []

class UserCreate(UserBase):
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

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
    assigned_to: Optional[str] = None
    sub_assignees: List[str] = []
    due_date: Optional[datetime] = None
    priority: str = "medium"
    status: str = "pending"
    category: Optional[str] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    recurrence_interval: int = 1
    recurrence_end_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class Task(TaskBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parent_task_id: Optional[str] = None

class DSCMovement(BaseModel):
    movement_type: str
    person_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = None

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
    movement_log: List[dict] = []

class DSCCreate(DSCBase):
    pass

class DSC(DSCBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DSCMovementRequest(BaseModel):
    movement_type: str
    person_name: str
    notes: Optional[str] = None

class DueDateBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    reminder_days: int = 30
    category: Optional[str] = None
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
    action: str

class Attendance(AttendanceBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    duration_minutes: Optional[int] = None

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str

class Notification(NotificationBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_read: bool = False

class ContactPerson(BaseModel):
    name: str
    designation: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    birthday: Optional[date] = None

class ClientBase(BaseModel):
    company_name: str
    client_type: str
    email: EmailStr
    phone: str
    date_of_incorporation: Optional[date] = None
    contact_persons: List[ContactPerson] = []
    services: List[str] = []
    dsc_details: List[DSCBase] = []
    assigned_to: Optional[str] = None
    notes: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# SendGrid setup
SENDGRID_API_KEY = os.environ['SENDGRID_API_KEY']
sg = SendGridAPIClient(SENDGRID_API_KEY)

def send_email(to_email: str, subject: str, body: str):
    message = Mail(
        from_email=os.environ['EMAIL_FROM'],
        to_emails=to_email,
        subject=subject,
        plain_text_content=body
    )
    try:
        response = sg.send(message)
        logger.info(f"Email sent to {to_email}: {response.status_code}")
    except Exception as e:
        logger.error(f"Email sending failed: {str(e)}")

# ================= NEW: HTML Email Helper =================
def send_html_email(to_email: str, subject: str, html_content: str):
    message = Mail(
        from_email=Email(os.environ['EMAIL_FROM'], "TaskoSphere"),
        subject=subject,
    )
    personalization = Personalization()
    personalization.add_to(Email(to_email))
    message.add_personalization(personalization)
    message.add_content(Content("text/html", html_content))
    try:
        response = sg.send(message)
        logger.info(f"HTML email sent to {to_email} | Status: {response.status_code}")
        return True
    except Exception as e:
        logger.error(f"Failed to send HTML email to {to_email}: {str(e)}")
        return False

# ================= IMPROVED PENDING TASK REMINDERS =================
async def send_pending_task_reminders():
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    today_str = now_ist.date().isoformat()

    last_run_key = "last_pending_task_reminder_date"
    last_run = await db.system_settings.find_one({"key": last_run_key})

    if last_run and last_run.get("value") == today_str:
        logger.info("Pending task reminders already sent today")
        return

    if now_ist.hour < 9:
        logger.info("Too early for daily task reminders (before 9 AM IST)")
        return

    logger.info("Starting daily pending task reminders...")

    pending_tasks = await db.tasks.find(
        {"status": {"$ne": "completed"}},
        {"_id": 0}
    ).to_list(2000)

    if not pending_tasks:
        logger.info("No pending tasks found → no reminders sent")
        await db.system_settings.update_one(
            {"key": last_run_key},
            {"$set": {"value": today_str, "updated_at": datetime.now(timezone.utc)}},
            upsert=True
        )
        return

    user_task_map = {}
    for task in pending_tasks:
        assignee_id = task.get("assigned_to")
        if assignee_id:
            user_task_map.setdefault(assignee_id, []).append(task)

    sent_count = 0

    for user_id, tasks_list in user_task_map.items():
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or not user.get("email"):
            continue

        full_name = user.get("full_name", "Team Member")
        email = user["email"]
        task_count = len(tasks_list)

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }}
                th {{ background: #f3f4f6; font-weight: bold; }}
                .highlight {{ color: #4f46e5; font-weight: bold; }}
                .footer {{ margin-top: 30px; font-size: 0.9em; color: #6b7280; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Pending Tasks Reminder</h2>
                </div>
                <div class="content">
                    <p>Hi <strong>{full_name}</strong>,</p>
                    <p>You have <span class="highlight">{task_count}</span> pending task{'s' if task_count != 1 else ''} assigned to you:</p>
                    
                    <table>
                        <tr>
                            <th>Title</th>
                            <th>Priority</th>
                            <th>Due Date</th>
                        </tr>
        """

        for task in tasks_list:
            title = task.get("title", "Untitled Task")
            priority = task.get("priority", "medium").capitalize()
            due = task.get("due_date")
            due_str = "No due date"
            if due:
                if isinstance(due, str):
                    try:
                        due_dt = datetime.fromisoformat(due)
                        due_str = due_dt.strftime("%d %b %Y")
                    except:
                        due_str = due
                elif isinstance(due, datetime):
                    due_str = due.strftime("%d %b %Y")

            html += f"""
                        <tr>
                            <td>{title}</td>
                            <td>{priority}</td>
                            <td>{due_str}</td>
                        </tr>
            """

        html += """
                    </table>

                    <p>Please review and take action on these tasks as soon as possible.</p>
                    <p>If you believe this is in error, contact your manager or admin.</p>

                    <div class="footer">
                        <p>TaskoSphere – Task & Client Management Platform</p>
                        <p>© 2025 TaskoSphere | Surat, Gujarat</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

        success = send_html_email(
            email,
            f"Pending Tasks Reminder ({task_count} tasks) – TaskoSphere",
            html
        )

        if success:
            sent_count += 1

    await db.system_settings.update_one(
        {"key": last_run_key},
        {"$set": {"value": today_str, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )

    logger.info(f"Daily task reminders sent to {sent_count} users ({len(user_task_map)} users had pending tasks)")

# ================= DSC EXPIRY REMINDERS =================
async def send_dsc_expiry_reminders():
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    today = now_ist.date()
    today_str = today.isoformat()

    last_run_key = "last_dsc_expiry_reminder_date"
    last_run = await db.system_settings.find_one({"key": last_run_key})

    if last_run and last_run.get("value") == today_str:
        logger.info("DSC expiry reminders already sent today")
        return

    if now_ist.hour < 9:
        logger.info("Too early for DSC expiry reminders (before 9 AM IST)")
        return

    logger.info("Starting daily DSC expiry reminders...")

    warning_window_days = 30
    soon_expiring = await db.dsc.find(
        {
            "expiry_date": {
                "$gte": today,
                "$lte": today + timedelta(days=warning_window_days)
            }
        },
        {"_id": 0}
    ).to_list(500)

    if not soon_expiring:
        logger.info("No DSC certificates expiring soon → no reminders sent")
        await db.system_settings.update_one(
            {"key": last_run_key},
            {"$set": {"value": today_str, "updated_at": datetime.now(timezone.utc)}},
            upsert=True
        )
        return

    user_dsc_map = {}
    for dsc in soon_expiring:
        creator_id = dsc.get("created_by")
        if creator_id:
            user_dsc_map.setdefault(creator_id, []).append(dsc)

    sent_count = 0

    for user_id, dscs in user_dsc_map.items():
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or not user.get("email"):
            continue

        full_name = user.get("full_name", "Team Member")
        email = user["email"]
        count = len(dscs)

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #fef2f2; padding: 20px; border: 1px solid #fecaca; border-top: none; border-radius: 0 0 8px 8px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #fecaca; }}
                th {{ background: #fee2e2; font-weight: bold; }}
                .urgent {{ color: #dc2626; font-weight: bold; }}
                .footer {{ margin-top: 30px; font-size: 0.9em; color: #6b7280; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>DSC Expiry Alert</h2>
                </div>
                <div class="content">
                    <p>Hi <strong>{full_name}</strong>,</p>
                    <p>You have <span class="urgent">{count}</span> DSC certificate{'s' if count != 1 else ''} expiring soon:</p>
                    
                    <table>
                        <tr>
                            <th>Holder Name</th>
                            <th>Expiry Date</th>
                            <th>Days Left</th>
                            <th>Notes</th>
                        </tr>
        """

        for dsc in dscs:
            holder = dsc.get("holder_name", "Unknown")
            expiry = dsc.get("expiry_date")
            expiry_str = "N/A"
            days_left_str = "N/A"

            if expiry:
                if isinstance(expiry, str):
                    try:
                        expiry_dt = datetime.fromisoformat(expiry).date()
                    except:
                        expiry_dt = None
                elif isinstance(expiry, datetime):
                    expiry_dt = expiry.date()
                else:
                    expiry_dt = None

                if expiry_dt:
                    expiry_str = expiry_dt.strftime("%d %b %Y")
                    days_left = (expiry_dt - today).days
                    days_left_str = f"{days_left} day{'s' if days_left != 1 else ''}"
                    if days_left <= 7:
                        days_left_str = f"<span class='urgent'>{days_left_str} (URGENT!)</span>"

            notes = dsc.get("notes", "-")[:100] + "..." if dsc.get("notes") and len(dsc.get("notes")) > 100 else dsc.get("notes", "-")

            html += f"""
                        <tr>
                            <td>{holder}</td>
                            <td>{expiry_str}</td>
                            <td>{days_left_str}</td>
                            <td>{notes}</td>
                        </tr>
            """

        html += """
                    </table>

                    <p>Please take necessary action (renewal, re-issue, etc.) before expiry.</p>
                    <p>If this DSC is assigned to someone else, please coordinate accordingly.</p>

                    <div class="footer">
                        <p>TaskoSphere – Task & Client Management Platform</p>
                        <p>© 2025 TaskoSphere | Surat, Gujarat</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

        success = send_html_email(
            email,
            f"DSC Expiry Reminder ({count} certificates) – TaskoSphere",
            html
        )

        if success:
            sent_count += 1

    await db.system_settings.update_one(
        {"key": last_run_key},
        {"$set": {"value": today_str, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )

    logger.info(f"DSC expiry reminders sent to {sent_count} users ({len(user_dsc_map)} users had expiring DSCs)")

# ================= NEW: Due Date Reminders =================
async def send_due_date_reminders():
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    today = now_ist.date()
    today_str = today.isoformat()

    last_run_key = "last_due_date_reminder_date"
    last_run = await db.system_settings.find_one({"key": last_run_key})

    if last_run and last_run.get("value") == today_str:
        logger.info("Due date reminders already sent today")
        return

    if now_ist.hour < 9:
        logger.info("Too early for due date reminders (before 9 AM IST)")
        return

    logger.info("Starting daily due date reminders...")

    soon_due = await db.due_dates.find(
        {
            "due_date": {
                "$gte": datetime.combine(today, datetime.min.time()),
                "$lte": datetime.combine(today + timedelta(days=7), datetime.max.time())
            },
            "status": "pending"
        },
        {"_id": 0}
    ).to_list(500)

    if not soon_due:
        logger.info("No upcoming due dates → no reminders sent")
        await db.system_settings.update_one(
            {"key": last_run_key},
            {"$set": {"value": today_str, "updated_at": datetime.now(timezone.utc)}},
            upsert=True
        )
        return

    user_due_map = {}
    for due in soon_due:
        assignee_id = due.get("assigned_to")
        if assignee_id:
            user_due_map.setdefault(assignee_id, []).append(due)

    sent_count = 0

    for user_id, dues in user_due_map.items():
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user or not user.get("email"):
            continue

        full_name = user.get("full_name", "Team Member")
        email = user["email"]
        count = len(dues)

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #d97706; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #fffbeb; padding: 20px; border: 1px solid #fde68a; border-top: none; border-radius: 0 0 8px 8px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #fde68a; }}
                th {{ background: #fef3c7; font-weight: bold; }}
                .urgent {{ color: #c2410c; font-weight: bold; }}
                .footer {{ margin-top: 30px; font-size: 0.9em; color: #6b7280; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Upcoming Due Dates Alert</h2>
                </div>
                <div class="content">
                    <p>Hi <strong>{full_name}</strong>,</p>
                    <p>You have <span class="urgent">{count}</span> pending due date{'s' if count != 1 else ''} approaching:</p>
                    
                    <table>
                        <tr>
                            <th>Title</th>
                            <th>Category</th>
                            <th>Due Date</th>
                            <th>Days Left</th>
                        </tr>
        """

        for due in dues:
            title = due.get("title", "Untitled Due Date")
            category = due.get("category", "-")
            due_date = due.get("due_date")
            due_str = "N/A"
            days_left_str = "N/A"

            if due_date:
                if isinstance(due_date, str):
                    try:
                        due_dt = datetime.fromisoformat(due_date).date()
                    except:
                        due_dt = None
                elif isinstance(due_date, datetime):
                    due_dt = due_date.date()
                else:
                    due_dt = None

                if due_dt:
                    due_str = due_dt.strftime("%d %b %Y")
                    days_left = (due_dt - today).days
                    days_left_str = f"{days_left} day{'s' if days_left != 1 else ''}"
                    if days_left <= 3:
                        days_left_str = f"<span class='urgent'>{days_left_str} (URGENT!)</span>"

            html += f"""
                        <tr>
                            <td>{title}</td>
                            <td>{category}</td>
                            <td>{due_str}</td>
                            <td>{days_left_str}</td>
                        </tr>
            """

        html += """
                    </table>

                    <p>Please ensure these are completed or updated before the due date.</p>
                    <p>Coordinate with the client or team if needed.</p>

                    <div class="footer">
                        <p>TaskoSphere – Task & Client Management Platform</p>
                        <p>© 2025 TaskoSphere | Surat, Gujarat</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

        success = send_html_email(
            email,
            f"Due Date Reminder ({count} items) – TaskoSphere",
            html
        )

        if success:
            sent_count += 1

    await db.system_settings.update_one(
        {"key": last_run_key},
        {"$set": {"value": today_str, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )

    logger.info(f"Due date reminders sent to {sent_count} users ({len(user_due_map)} users had upcoming dues)")

# ================= UPDATED MIDDLEWARE =================
@app.middleware("http")
async def daily_reminders_middleware(request, call_next):
    response = await call_next(request)

    try:
        india_time = datetime.now(pytz.timezone("Asia/Kolkata"))
        today_str = india_time.date().isoformat()

        setting = await db.system_settings.find_one({"key": "last_reminder_date"})
        last_date = setting["value"] if setting else None

        if india_time.hour >= 9 and last_date != today_str:
            logger.info("Auto daily reminder triggered at 9:00 AM IST or later")

            # Your original internal reminder (keep if you still need it)
            # await send_pending_task_reminders_internal()  # uncomment only if this function exists in your code

            # New reminders
            await send_pending_task_reminders()
            await send_dsc_expiry_reminders()
            await send_due_date_reminders()

            await db.system_settings.update_one(
                {"key": "last_reminder_date"},
                {"$set": {"value": today_str}},
                upsert=True
            )

    except Exception as e:
        logger.error(f"Auto reminder middleware error: {str(e)}")

    return response

# ================= NEW MANUAL TRIGGER ENDPOINTS =================
@api_router.post("/reminders/trigger-tasks", status_code=200)
async def manual_trigger_task_reminders(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admin or manager can trigger reminders")
    background_tasks.add_task(send_pending_task_reminders)
    return {"message": "Task reminder job triggered in background"}

@api_router.post("/reminders/trigger-dsc-expiry", status_code=200)
async def manual_trigger_dsc_expiry_reminders(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admin or manager can trigger reminders")
    background_tasks.add_task(send_dsc_expiry_reminders)
    return {"message": "DSC expiry reminder job triggered in background"}

@api_router.post("/reminders/trigger-due-dates", status_code=200)
async def manual_trigger_due_date_reminders(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admin or manager can trigger reminders")
    background_tasks.add_task(send_due_date_reminders)
    return {"message": "Due date reminder job triggered in background"}

# ================= ORIGINAL CODE CONTINUES – UNCHANGED =================

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
        start_date = now.replace(day=1)

    users = await db.users.find(
        {"role": {"$in": ["manager", "staff"]}},
        {"_id": 0, "password": 0}
    ).to_list(1000)

    rankings = []

    for user in users:
        uid = user["id"]

        attendance_records = await db.attendance.find(
            {"user_id": uid},
            {"_id": 0}
        ).to_list(1000)

        total_minutes = 0

        for record in attendance_records:
            record_date = datetime.strptime(record["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if start_date and record_date < start_date:
                continue
            total_minutes += record.get("duration_minutes", 0)

        work_score = min(total_minutes / (60 * 160), 1) * 100

        tasks = await db.tasks.find(
            {"assigned_to": uid},
            {"_id": 0}
        ).to_list(1000)

        filtered_tasks = []

        for task in tasks:
            created = task.get("created_at")
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            if start_date and created < start_date:
                continue
            filtered_tasks.append(task)

        total_tasks = len(filtered_tasks)
        completed_tasks = len([t for t in filtered_tasks if t["status"] == "completed"])

        completion_percent = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

        completion_times = []

        for task in filtered_tasks:
            if task["status"] == "completed":
                created = task.get("created_at")
                updated = task.get("updated_at")
                if isinstance(created, str):
                    created = datetime.fromisoformat(created)
                if isinstance(updated, str):
                    updated = datetime.fromisoformat(updated)
                diff = (updated - created).total_seconds()
                completion_times.append(diff)

        if completion_times:
            avg_seconds = sum(completion_times) / len(completion_times)
            speed_score = max(0, 100 - (avg_seconds / 86400) * 10)
        else:
            speed_score = 0

        efficiency = (
            0.35 * work_score +
            0.40 * completion_percent +
            0.25 * speed_score
        )

        rankings.append({
            "user_id": uid,
            "name": user["full_name"],
            "role": user["role"],
            "profile_picture": user.get("profile_picture"),
            "score": round(efficiency, 2),
            "hours_worked": round(total_minutes / 60, 2),
            "completion_percent": round(completion_percent, 2),
        })

    rankings.sort(key=lambda x: x["score"], reverse=True)

    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    return {
        "period": period,
        "rankings": rankings
    }

# ================= INCLUDE ROUTER =================
app.include_router(api_router)
