import os
import re
import uuid
import logging
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
import pandas as pd
import pytz
from bson import ObjectId
from dateutil import parser
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fpdf import FPDF
from io import BytesIO, StringIO
from jose import jwt, JWTError
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, ValidationError
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import csv
from backend.dependencies import get_current_user, create_access_token
from backend.notifications import router as notification_router, create_notification
import uvicorn
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port)
# ───────────────────────────────────────────────────────────────
# CONFIG & GLOBALS
# ───────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
india_tz = pytz.timezone("Asia/Kolkata")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
security = HTTPBearer()
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
OFFICE_LAT = 21.1652
OFFICE_LON = 72.7799
ALLOWED_RADIUS_METERS = 2000
APPROVED_OFFICE_IPS = ["49.36.81.196"]
rankings_cache = {}
rankings_cache_time = {}
# ───────────────────────────────────────────────────────────────
# HELPERS
# ───────────────────────────────────────────────────────────────
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371000
    phi1, phi2 = radians(lat1), radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lon2 - lon1)
    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c
def calculate_expected_hours(start: Optional[str], end: Optional[str]) -> float:
    if not start or not end:
        return 8.0
    try:
        h1, m1 = map(int, start.split(":"))
        h2, m2 = map(int, end.split(":"))
        s = h1 + m1 / 60.0
        e = h2 + m2 / 60.0
        if e < s:
            e += 24
        return e - s
    except:
        return 8.0
def get_real_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
def send_email(to_email: str, subject: str, body: str) -> bool:
    key = os.getenv("SENDGRID_API_KEY")
    sender = os.getenv("SENDER_EMAIL")
    if not key or not sender:
        logger.warning("SendGrid not configured")
        return False
    message = Mail(from_email=sender, to_emails=to_email, subject=subject, html_content=body)
    try:
        sg = SendGridAPIClient(key)
        resp = sg.send(message)
        return resp.status_code == 202
    except Exception as e:
        logger.error(f"SendGrid error: {e}")
        return False
def send_birthday_email(recipient_email: str, client_name: str) -> bool:
    sendgrid_key = os.environ.get('SENDGRID_API_KEY')
    sender_email = os.environ.get('SENDER_EMAIL', 'noreply@taskosphere.com')
    if not sendgrid_key:
        logger.warning("SENDGRID_API_KEY not configured")
        return False
    subject = f"Happy Birthday, {client_name}!"
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <h1 style="color: #4F46E5; text-align: center;">���� Happy Birthday! ����</h1>
    <p style="font-size: 16px; line-height: 1.6; color: #333;">Dear {client_name},</p>
    <p style="font-size: 16px; line-height: 1.6; color: #333;">On behalf of our entire team, we wish you a very Happy Birthday! ����</p>
    <p style="font-size: 16px; line-height: 1.6; color: #333;">We appreciate your continued trust and partnership. May this year bring you prosperity, success, and happiness.</p>
    <div style="background-color: #4F46E5; color: white; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
    <p style="margin: 0; font-size: 18px; font-weight: bold;">Wishing you all the best!</p>
    </div>
    <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">Best regards,<br><strong>Taskosphere Team</strong></p>
    </div>
    </body>
    </html>
    """
    message = Mail(from_email=sender_email, to_emails=recipient_email, subject=subject, html_content=html_content)
    try:
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        logger.info(f"Birthday email sent to {recipient_email}, status: {response.status_code}")
        return response.status_code == 202
    except Exception as e:
        logger.error(f"Failed to send birthday email: {str(e)}")
        return False
async def create_audit_log(
    current_user,
    action: str,
    module: str,
    record_id: str,
    old_data: Optional[Dict] = None,
    new_data: Optional[Dict] = None
):
    log = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "action": action,
        "module": module,
        "record_id": record_id,
        "old_data": old_data,
        "new_data": new_data,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one(log)
# ───────────────────────────────────────────────────────────────
# CLIENT IMPORT BACKGROUND PROCESSOR - ALL 7 FIXES APPLIED + MDS VERTICAL FORMAT SUPPORT
# ───────────────────────────────────────────────────────────────
async def process_import_job(job_id: str, content: bytes, user_id: str, filename: str):
    try:
        sheets = {}
        is_excel = filename.lower().endswith(('.xlsx', '.xls'))
        if is_excel:
            df_dict = pd.read_excel(BytesIO(content), sheet_name=None, dtype=str)
            sheets = {}

            for sheet_name, df in df_dict.items():
                # 🔎 Detect MDS vertical format (2 columns, key-value style)
                if len(df.columns) == 2:
                    df = df.fillna("")
                    key_col = df.columns[0]
                    val_col = df.columns[1]

                    data_map = {
                        str(row[key_col]).strip(): str(row[val_col]).strip()
                        for _, row in df.iterrows()
                        if str(row[key_col]).strip()
                    }

                    # Convert vertical format → normal client format
                    transformed = pd.DataFrame([{
                        "company_name": data_map.get("Company Name", "").upper(),
                        "client_type": "pvt_ltd",
                        "email": "",
                        "phone": "",
                        "date_of_incorporation": data_map.get("Date of Incorporation"),
                        "birthday": "",
                        "services": "",
                        "notes": f"CIN: {data_map.get('CIN', '')}, ROC: {data_map.get('ROC Name', '')}",
                        "assigned_to": "",
                    }])

                    sheets[sheet_name] = transformed

                else:
                    # Normal tabular sheet
                    sheets[sheet_name] = df

        else:
            df = pd.read_csv(BytesIO(content), dtype=str)
            sheets["Sheet1"] = df
        # FIX 3: Clean empty rows BEFORE counting total_rows
        cleaned_sheets = {}
        for sheet_name, df in sheets.items():
            df = df.fillna("")
            df = df[~df.apply(lambda r: r.astype(str).str.strip().eq("").all(), axis=1)]
            cleaned_sheets[sheet_name] = df
        total_rows = sum(len(df) for df in cleaned_sheets.values())
        await db.import_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"total_rows": total_rows}}
        )
        processed_rows = 0
        inserted_rows = 0
        failed_rows = 0
        duplicate_rows = 0
        errors = []
        batch = [] # FIX 4: Mini-batching
        for sheet_name, df in cleaned_sheets.items():
            for idx, row in df.iterrows():
                processed_rows += 1
                row = row.astype(str).str.strip()
                try:
                    company_name = row.get("company_name", "").strip().upper() # FIX 1: UPPERCASE
                    if not company_name:
                        continue
                    data = {
                        "company_name": company_name,
                        "client_type": row.get("client_type", "").strip().lower() or "other",
                        "email": row.get("email", "").strip(),
                        "phone": row.get("phone", "").strip(),
                        "date_of_incorporation": None,
                        "birthday": None,
                        "services": [s.strip() for s in row.get("services", "").split(",") if s.strip()],
                        "notes": row.get("notes", "").strip(),
                        "assigned_to": row.get("assigned_to", "").strip() or None,
                        "contact_persons": []
                    }
                    for field in ["date_of_incorporation", "birthday"]:
                        val = row.get(field, "").strip()
                        if val:
                            try:
                                data[field] = parser.parse(val).date()
                            except Exception:
                                raise ValueError(f"Invalid {field} '{val}'")
                    client_create = ClientCreate(**data)
                    client_dict = client_create.model_dump()
                    # FIX 1: Exact match duplicate check (no regex)
                    exists = await db.clients.find_one({
                        "created_by": user_id,
                        "company_name": company_name
                    })
                    if exists:
                        duplicate_rows += 1
                        errors.append(f"Row {idx+1} ({sheet_name}): Duplicate company '{company_name}'")
                        continue
                    client_dict["id"] = str(uuid.uuid4())
                    client_dict["created_by"] = user_id
                    client_dict["created_at"] = datetime.now(timezone.utc).isoformat()
                    batch.append(client_dict)
                    inserted_rows += 1
                    if len(batch) == 100: # FIX 4: Batch insert
                        await db.clients.insert_many(batch)
                        batch = []
                except Exception as e:
                    failed_rows += 1
                    errors.append(f"Row {idx+1} ({sheet_name}): {str(e)}")
                if processed_rows % 20 == 0 or processed_rows == total_rows:
                    await db.import_jobs.update_one(
                        {"job_id": job_id},
                        {
                            "$set": {
                                "processed_rows": processed_rows,
                                "inserted_rows": inserted_rows,
                                "failed_rows": failed_rows,
                                "duplicate_rows": duplicate_rows,
                                "errors": errors[:200] # FIX 7
                            }
                        }
                    )
        if batch:
            await db.clients.insert_many(batch)
        await db.import_jobs.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "completed",
                    "processed_rows": processed_rows,
                    "inserted_rows": inserted_rows,
                    "failed_rows": failed_rows,
                    "duplicate_rows": duplicate_rows,
                    "errors": errors[:200],
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    except Exception as e:
        logger.error(f"Import job {job_id} failed: {str(e)}", exc_info=True)
        await db.import_jobs.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "failed",
                    "errors": [str(e)],
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
# ───────────────────────────────────────────────────────────────
# MODELS (complete from original)
# ───────────────────────────────────────────────────────────────
class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_documents: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_manage_users: bool = False
    can_assign_tasks: bool = False
    can_view_staff_activity: bool = False
    can_view_attendance: bool = False
    can_send_reminders: bool = False
    assigned_clients: List[str] = Field(default_factory=list)
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
    view_other_tasks: List[str] = Field(default_factory=list)
    view_other_attendance: List[str] = Field(default_factory=list)
    view_other_reports: List[str] = Field(default_factory=list)
    view_other_todos: List[str] = Field(default_factory=list)
    view_other_activity: List[str] = Field(default_factory=list)
    can_edit_clients: bool = False
    can_use_chat: bool = False
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
class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "staff"
    profile_picture: Optional[str] = None
    permissions: Optional[UserPermissions] = None
    departments: List[str] = Field(default_factory=list)
    expected_start_time: Optional[str] = None
    expected_end_time: Optional[str] = None
    late_grace_minutes: int = 15
    telegram_id: Optional[int] = None
class UserCreate(UserBase):
    password: str
class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(india_tz))
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
class DSCCreate(BaseModel):
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
class DSC(DSCCreate):
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
    movement_type: str
    person_name: str
    notes: Optional[str] = None
class MovementUpdateRequest(BaseModel):
    movement_id: str
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None
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
    client_type: str = Field(..., pattern=r"^(proprietor|pvt_ltd|llp|partnership|huf|trust|other|LLP|PVT_LTD)$")
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
class ClientCreate(ClientBase):
    pass
class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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
class DocumentMovementRequest(BaseModel):
    movement_type: str
    person_name: str
    notes: Optional[str] = None
class DocumentMovementUpdateRequest(BaseModel):
    movement_id: str
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None
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
# ───────────────────────────────────────────────────────────────
# FASTAPI APP & ROUTER
# ───────────────────────────────────────────────────────────────
app = FastAPI()
api_router = APIRouter(prefix="/api")
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
# ───────────────────────────────────────────────────────────────
# STARTUP INDEXES (FIX 5)
# ───────────────────────────────────────────────────────────────
@app.on_event("startup")
async def create_indexes():
    await db.tasks.create_index("assigned_to")
    await db.tasks.create_index("created_by")
    await db.tasks.create_index("due_date")
    await db.users.create_index("email")
    await db.staff_activity.create_index("user_id")
    await db.staff_activity.create_index("timestamp")
    await db.staff_activity.create_index([("user_id", 1), ("timestamp", -1)])
    await db.due_dates.create_index("department")
    await db.tasks.create_index([("assigned_to", 1), ("status", 1)])
    await db.tasks.create_index("created_at")
    await db.clients.create_index("assigned_to")
    await db.dsc_register.create_index("expiry_date")
    await db.todos.create_index([("user_id", 1), ("created_at", -1)])
    await db.attendance.create_index([("user_id", 1), ("date", -1)])
    await db.notifications.create_index("user_id")
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.notifications.create_index("created_at")
    await db.attendance.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.clients.create_index([("created_by", 1), ("company_name", 1)], unique=True)
    await db.import_jobs.create_index("job_id", unique=True)
    await db.import_jobs.create_index("user_id")
@app.get("/health")
async def health():
    return {"status": "ok"}
# ───────────────────────────────────────────────────────────────
# CLIENT IMPORT MASTER WITH PROGRESS TRACKING
# ───────────────────────────────────────────────────────────────
@api_router.post("/clients/import-master")
async def import_clients_master(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(403, "Only admin can import clients")
    allowed_extensions = {'.csv', '.xlsx', '.xls'}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(400, detail=f"Only CSV and Excel files are allowed. Got: {ext}")
    job_id = str(uuid.uuid4())
    content = await file.read()
    job_doc = {
        "job_id": job_id,
        "user_id": current_user.id,
        "filename": file.filename,
        "status": "processing",
        "total_rows": 0,
        "processed_rows": 0,
        "inserted_rows": 0,
        "failed_rows": 0,
        "duplicate_rows": 0,
        "errors": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None
    }
    await db.import_jobs.insert_one(job_doc)
    background_tasks.add_task(process_import_job, job_id, content, current_user.id, file.filename)
    return {"job_id": job_id, "status": "processing"}
@api_router.get("/clients/import-progress/{job_id}")
async def get_import_progress(job_id: str, current_user=Depends(get_current_user)):
    job = await db.import_jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(404, "Import job not found")
    if job["user_id"] != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Access denied")
    total = job.get("total_rows", 0)
    processed = job.get("processed_rows", 0)
    percentage = round((processed / total * 100) if total > 0 else 0, 1)
    return {
        "status": job["status"],
        "progress_percentage": percentage,
        "total_rows": total,
        "processed_rows": processed,
        "inserted_rows": job.get("inserted_rows", 0),
        "failed_rows": job.get("failed_rows", 0),
        "duplicate_rows": job.get("duplicate_rows", 0),
        "is_completed": job["status"] in ("completed", "failed")
    }
# ───────────────────────────────────────────────────────────────
# CLIENT ROUTES WITH FIX 1
# ───────────────────────────────────────────────────────────────
@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, current_user=Depends(get_current_user)):
    normalized = client_data.company_name.strip().upper()
    client_data.company_name = normalized
    exists = await db.clients.find_one({
        "created_by": current_user.id,
        "company_name": normalized
    })
    if exists:
        raise HTTPException(400, detail="Client with this name already exists under your account")
    client = Client(**client_data.model_dump(), created_by=current_user.id)
    doc = client.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("birthday"):
        doc["birthday"] = doc["birthday"].isoformat()
    await db.clients.insert_one(doc)
    return client
@api_router.get("/clients")
async def get_clients(current_user=Depends(get_current_user)):
    query = {}
    if current_user.role != "admin":
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if not permissions.get("can_view_all_clients", False):
            query["assigned_to"] = current_user.id
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for c in clients:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
        if c.get("birthday") and isinstance(c["birthday"], str):
            c["birthday"] = date.fromisoformat(c["birthday"])
    return clients
# ───────────────────────────────────────────────────────────────
# TASKS IMPORT WITH FIX 2
# ───────────────────────────────────────────────────────────────
@api_router.post("/tasks/import")
async def import_tasks_from_csv(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only CSV files are allowed")
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
# ───────────────────────────────────────────────────────────────
# ALL REMAINING ORIGINAL ROUTES (2900+ lines total - preserved 1:1)
# ───────────────────────────────────────────────────────────────
# Todo dashboard, promote, delete, auth register/login/me, attendance punch, users, tasks create/bulk/get/update/delete, dsc create/get/update/delete/movement, documents create/get/update/delete/movement, due dates, reports performance, dashboard stats, staff activity, audit logs, etc.
@api_router.get("/todos")
async def get_my_todos(current_user: User = Depends(get_current_user)):
    todos = await db.todos.find({"user_id": current_user.id}).to_list(1000)
    for todo in todos:
        todo["_id"] = str(todo["_id"])
    return todos
@api_router.get("/dashboard/todo-overview")
async def get_todo_dashboard(current_user: User = Depends(get_current_user)):
    is_admin = current_user.role == "admin"
    if is_admin:
        todos = await db.todos.find().to_list(2000)
        grouped_todos = {}
        for todo in todos:
            user = await db.users.find_one({"id": todo["user_id"]}, {"_id": 0})
            user_name = user["full_name"] if user else "Unknown User"
            if user_name not in grouped_todos:
                grouped_todos[user_name] = []
            todo["_id"] = str(todo["_id"])
            grouped_todos[user_name].append(todo)
        return {"role": "admin", "grouped_todos": grouped_todos}
    else:
        permissions = getattr(current_user, "permissions", {}) or {}
        allowed_users = permissions.get("view_other_todos", []) if isinstance(permissions, dict) else []
        if not isinstance(allowed_users, list):
            allowed_users = []
        todos = await db.todos.find({
            "$or": [
                {"user_id": current_user.id},
                {"user_id": {"$in": allowed_users}}
            ]
        }).to_list(2000)
        for todo in todos:
            todo["_id"] = str(todo["_id"])
        return {"role": "staff", "todos": todos}
@api_router.post("/todos/{todo_id}/promote-to-task")
async def promote_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    try:
        todo = await db.todos.find_one({"_id": ObjectId(todo_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid Todo ID")
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if current_user.role != "admin" and todo["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to promote this todo")
    now = datetime.now(timezone.utc)
    new_task = {
        "id": str(uuid.uuid4()),
        "title": todo["title"],
        "description": todo.get("description"),
        "assigned_to": todo["user_id"],
        "sub_assignees": [],
        "priority": "medium",
        "status": "pending",
        "category": "other",
        "client_id": None,
        "is_recurring": False,
        "type": "task",
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now
    }
    await db.tasks.insert_one(new_task)
    await db.todos.delete_one({"_id": ObjectId(todo_id)})
    return {"message": "Todo promoted to task successfully"}
@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    try:
        todo = await db.todos.find_one({"_id": ObjectId(todo_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid Todo ID")
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if current_user.role != "admin" and todo["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.todos.delete_one({"_id": ObjectId(todo_id)})
    return {"message": "Todo deleted successfully"}
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        role="staff",
        profile_picture=user_data.profile_picture,
        permissions=user_data.permissions,
        departments=user_data.departments,
        expected_start_time=user_data.expected_start_time,
        expected_end_time=user_data.expected_end_time,
        late_grace_minutes=user_data.late_grace_minutes
    )
    default_permissions = UserPermissions().model_dump()
    doc = user.model_dump()
    doc["password"] = hashed_password
    doc["created_at"] = doc["created_at"].isoformat()
    doc["permissions"] = default_permissions
    await db.users.insert_one(doc)
    access_token = create_access_token({"sub": user.id})
    return {"access_token": access_token, "token_type": "bearer", "user": user}
@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user["permissions"] = user.get("permissions", UserPermissions().model_dump())
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    user_obj = User(**{k: v for k, v in user.items() if k != "password"})
    access_token = create_access_token({"sub": user_obj.id})
    return {"access_token": access_token, "token_type": "bearer", "user": user_obj}
@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
@api_router.post("/attendance")
async def record_attendance(data: dict, request: Request, current_user: User = Depends(get_current_user)):
    india_tz = pytz.timezone("Asia/Kolkata")
    now = datetime.now(india_tz)
    today_str = now.date().isoformat()
    if data["action"] == "punch_in":
        existing = await db.attendance.find_one({"user_id": current_user.id, "date": today_str}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Already punched in today")
        client_ip = get_real_client_ip(request)
        ip_allowed = client_ip in APPROVED_OFFICE_IPS
        location = data.get("location")
        if not location:
            raise HTTPException(status_code=400, detail="Location required")
        user_lat = location.get("latitude")
        user_lon = location.get("longitude")
        if user_lat is None or user_lon is None:
            raise HTTPException(status_code=400, detail="Invalid location data")
        distance = calculate_distance(float(user_lat), float(user_lon), OFFICE_LAT, OFFICE_LON)
        if not ip_allowed and distance > ALLOWED_RADIUS_METERS:
            raise HTTPException(status_code=403, detail=f"Punch-in allowed only from office. You are {int(distance)} meters away.")
        is_late = False
        late_by_minutes = 0
        expected_str = current_user.expected_start_time
        grace = current_user.late_grace_minutes or 15
        if expected_str:
            try:
                from datetime import time
                h, m = map(int, expected_str.split(":"))
                expected_time = time(h, m)
                expected_datetime = datetime.combine(now.date(), expected_time, tzinfo=india_tz)
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
            "distance_from_office_meters": int(distance),
            "ip_address": client_ip
        }
        await db.attendance.insert_one(doc)
        return Attendance(**doc)
    elif data["action"] == "punch_out":
        existing = await db.attendance.find_one({"user_id": current_user.id, "date": today_str}, {"_id": 0})
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
                expected_dt = datetime.combine(now.date(), expected_out_time, tzinfo=india_tz)
                if now < expected_dt:
                    diff = expected_dt - now
                    early_minutes = int(diff.total_seconds() / 60)
                    is_early_leave = True
            except:
                pass
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
        updated = await db.attendance.find_one({"user_id": current_user.id, "date": today_str}, {"_id": 0})
        return Attendance(**updated)
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
# ====================== SHARED TOP / STAR PERFORMERS HELPER ======================
async def get_top_performers_data(
    period: str = "monthly",
    limit: int = 5,
    db = None
):
    """Single source of truth for both Dashboard Star Performers and Reports Top Performers"""
    now = datetime.now(timezone.utc)
    # Date filter
    if period == "weekly":
        start_date = now - timedelta(days=7)
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else: # all_time
        start_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
    pipeline = [
        {
            "$match": {
                "status": "completed",
                "assigned_to": {"$ne": None},
                # Support both completed_at (new) and updated_at (old tasks)
                "$or": [
                    {"completed_at": {"$gte": start_date.isoformat()}},
                    {"updated_at": {"$gte": start_date.isoformat()}}
                ]
            }
        },
        {
            "$group": {
                "_id": "$assigned_to",
                "completed_tasks": {"$sum": 1}
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "id",
                "as": "user_info"
            }
        },
        {"$unwind": "$user_info"},
        {
            "$project": {
                "user_id": "$_id",
                "user_name": "$user_info.full_name",
                "profile_picture": "$user_info.profile_picture",
                "completed_tasks": 1
            }
        },
        {"$sort": {"completed_tasks": -1}},
        {"$limit": limit}
    ]
    performers = await db.tasks.aggregate(pipeline).to_list(limit)
    # Add rank
    for idx, p in enumerate(performers):
        p["rank"] = idx + 1
    return performers
  
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
    if task.assigned_to and task.assigned_to != current_user.id:
        await create_notification(
            user_id=task.assigned_to,
            title="New Task Assigned",
            message=f"You have been assigned task '{task.title}'"
        )
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
        # ✅ BULK TASK NOTIFICATION (STEP 5 - added here, no line deleted)
        if task_dict.get("assigned_to") and task_dict["assigned_to"] != current_user.id:
            await create_notification(
                user_id=task_dict["assigned_to"],
                title="New Task Assigned",
                message=f"You have been assigned task '{task_dict['title']}'"
            )
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
    if current_user.role != "admin":
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if not permissions.get("can_view_all_tasks", False):
            # STRICT: user only sees tasks assigned to them
            query = {"assigned_to": current_user.id}
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
        {"*id": 0}
    ).sort("timestamp", 1).to_list(1000)
    if not logs:
        raise HTTPException(status_code=404, detail="No audit logs found for this task")
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
        timestamp = log.get('timestamp')
        if isinstance(timestamp, datetime):
            timestamp = timestamp.isoformat()
        pdf.multi_cell(
            0,
            8,
            f"{timestamp} - {log.get('action')} by {log.get('user_name')}"
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
@api_router.get("/dsc")
async def get_dsc_list(
    sort_by: str = Query("holder_name"),
    order: str = Query("asc", pattern="^(asc|desc)$", ignore_case=True),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(500, ge=1, le=500),
    current_user: User = Depends(check_permission("can_view_all_dsc"))
):
    query = {}
    # 🔎 Universal search (works across all tabs)
    if search:
        safe_search = re.escape(search)
        search_regex = {"$regex": safe_search, "$options": "i"}
        query["$or"] = [
            {"holder_name": search_regex},
            {"dsc_type": search_regex},
            {"associated_with": search_regex},
            {"current_status": search_regex} # ✅ NEW: Search by IN / OUT / EXPIRED
        ]
    sort_dir = 1 if order.lower() == "asc" else -1
    skip = (page - 1) * limit
    total = await db.dsc_register.count_documents(query)
    cursor = db.dsc_register.find(
        query,
        {"_id": 0}
    ).sort(sort_by, sort_dir).skip(skip).limit(limit)
    dsc_list = await cursor.to_list(length=limit)
    now = datetime.now(timezone.utc)
    for dsc in dsc_list:
        if isinstance(dsc.get("created_at"), str):
            dsc["created_at"] = datetime.fromisoformat(dsc["created_at"])
        if isinstance(dsc.get("issue_date"), str):
            dsc["issue_date"] = datetime.fromisoformat(dsc["issue_date"])
        if isinstance(dsc.get("expiry_date"), str):
            dsc["expiry_date"] = datetime.fromisoformat(dsc["expiry_date"])
        expiry_date = dsc.get("expiry_date")
        if expiry_date and expiry_date < now:
            movement_log = dsc.get("movement_log", [])
            updated = False
            if not any(log.get("movement_type") == "EXPIRED" for log in movement_log):
                movement_log.append({
                    "id": str(uuid.uuid4()),
                    "movement_type": "EXPIRED",
                    "person_name": "System Auto",
                    "notes": "Auto marked as expired",
                    "timestamp": now.isoformat(),
                    "recorded_by": "System"
                })
                updated = True
            if dsc.get("current_status") != "EXPIRED":
                updated = True
            if updated:
                await db.dsc_register.update_one(
                    {"id": dsc["id"]},
                    {
                        "$set": {
                            "current_status": "EXPIRED",
                            "movement_log": movement_log
                        }
                    }
                )
                dsc["current_status"] = "EXPIRED"
                dsc["movement_log"] = movement_log
    return DSCListResponse(data=dsc_list, total=total, page=page, limit=limit)
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
    if current_user.role == "admin":
        if user_id:
            query["user_id"] = user_id
    else:
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        allowed = permissions.get("view_other_attendance", [])
        if user_id is None:
            query["user_id"] = current_user.id
        elif user_id == current_user.id:
            query["user_id"] = current_user.id
        elif user_id in allowed:
            query["user_id"] = user_id
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
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
        {"*id": 0}
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
        allowed = permissions.get("view_other_reports", [])
        if user_id is None:
            query = {"user_id": current_user.id}
        elif user_id == current_user.id:
            query = {"user_id": current_user.id}
        elif user_id in allowed:
            query = {"user_id": user_id}
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
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
# ====================== PERFORMANCE RANKINGS + PDF EXPORT (NEW - added here, no original line touched) ======================
@api_router.get("/reports/performance-rankings", response_model=List[PerformanceMetric])
async def get_performance_rankings(
    period: str = Query("monthly", enum=["weekly", "monthly", "all_time"]),
    current_user: User = Depends(check_permission("can_view_reports"))
):
    """⭐ Star & 🏆 Top Performer Rankings (cached 5 min)"""
    cache_key = f"rankings_{period}"
    if cache_key in rankings_cache and (datetime.now() - rankings_cache_time.get(cache_key, datetime.min)).total_seconds() < 300:
        return rankings_cache[cache_key]
    now = datetime.now(timezone.utc)
    # Date range
    if period == "weekly":
        start_date = now - timedelta(days=7)
        expected_working_days = 5
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        expected_working_days = 22
    else: # all_time
        start_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        expected_working_days = max(22, (now - start_date).days // 30 * 22)
    end_date_str = now.strftime("%Y-%m-%d")
    start_date_str = start_date.strftime("%Y-%m-%d")
    users = await db.users.find(
        {"role": {"$ne": "admin"}},
        {"id": 1, "full_name": 1, "profile_picture": 1, "expected_start_time": 1}
    ).to_list(100)
    rankings = []
    for user in users:
        uid = user["id"]
        # Attendance %
        att_records = await db.attendance.find(
            {"user_id": uid, "date": {"$gte": start_date_str, "$lte": end_date_str}},
            {"_id": 0, "duration_minutes": 1, "is_late": 1}
        ).to_list(1000)
        days_present = len(att_records)
        total_minutes = sum(r.get("duration_minutes", 0) for r in att_records)
        total_hours = round(total_minutes / 60, 1)
        attendance_percent = round((days_present / expected_working_days) * 100, 1) if expected_working_days else 0
        timely_days = len([r for r in att_records if not r.get("is_late", False)])
        timely_punchin_percent = round((timely_days / days_present) * 100, 1) if days_present else 0
        # Tasks %
        tasks_assigned = await db.tasks.count_documents({
            "assigned_to": uid,
            "created_at": {"$gte": start_date.isoformat()}
        })
        tasks_completed = await db.tasks.count_documents({
            "assigned_to": uid,
            "status": "completed",
            "$or": [
                {"completed_at": {"$gte": start_date.isoformat()}},
                {"updated_at": {"$gte": start_date.isoformat()}}
            ]
        })
        task_completion_percent = round((tasks_completed / tasks_assigned) * 100, 1) if tasks_assigned else 0
        # To-Do on-time %
        todos = await db.todos.find({
            "user_id": uid,
            "created_at": {"$gte": start_date.isoformat()}
        }).to_list(500)
        completed_ontime = 0
        for t in todos:
            if t.get("is_completed"):
                due = t.get("due_date")
                completed_at = t.get("updated_at") or t.get("created_at")
                if due and completed_at and completed_at <= due:
                    completed_ontime += 1
        todo_ontime_percent = round((completed_ontime / len(todos)) * 100, 1) if todos else 0
        # Overall Score
        score = (
            attendance_percent * 0.25 +
            min(total_hours / 180, 1) * 100 * 0.20 +
            task_completion_percent * 0.25 +
            todo_ontime_percent * 0.15 +
            timely_punchin_percent * 0.15
        )
        overall_score = round(min(score, 100), 1)
        # Badge
        if overall_score >= 95:
            badge = "⭐ Star Performer"
        elif overall_score >= 85:
            badge = "🏆 Top Performer"
        else:
            badge = "Good Performer"
        rankings.append(PerformanceMetric(
            user_id=uid,
            user_name=user["full_name"],
            profile_picture=user.get("profile_picture"),
            attendance_percent=attendance_percent,
            total_hours=total_hours,
            task_completion_percent=task_completion_percent,
            todo_ontime_percent=todo_ontime_percent,
            timely_punchin_percent=timely_punchin_percent,
            overall_score=overall_score,
            badge=badge
        ))
    rankings.sort(key=lambda x: x.overall_score, reverse=True)
    for i, r in enumerate(rankings):
        r.rank = i + 1
    rankings_cache[cache_key] = rankings
    rankings_cache_time[cache_key] = datetime.now()
    return rankings
@api_router.get("/reports/performance-rankings/pdf")
async def export_performance_rankings_pdf(
    period: str = Query("monthly", enum=["weekly", "monthly", "all_time"]),
    current_user: User = Depends(check_permission("can_view_reports"))
):
    """Download Performance Rankings as Professional PDF"""
    rankings = await get_performance_rankings(period=period, current_user=current_user)
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, txt=f"PERFORMANCE RANKINGS - {period.upper()}", ln=True, align="C")
    pdf.set_font("Arial", "", 11)
    pdf.cell(0, 8, txt=f"Generated on: {datetime.now(india_tz).strftime('%d %b %Y, %I:%M %p IST')}", ln=True, align="C")
    pdf.cell(0, 8, txt=f"Report Period: {period.capitalize()}", ln=True, align="C")
    pdf.ln(5)
    pdf.set_font("Arial", "B", 10)
    pdf.set_fill_color(79, 70, 229)
    pdf.set_text_color(255, 255, 255)
    col_widths = [15, 55, 45, 22, 28, 28, 28, 28, 35]
    headers = ["Rank", "Employee", "Badge", "Score", "Attendance", "Hours", "Tasks", "To-Do", "Punch-in"]
    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 10, header, border=1, align="C", fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Arial", "", 9)
    for r in rankings[:20]:
        if r.badge.startswith("⭐"):
            pdf.set_fill_color(255, 215, 0)
        elif r.badge.startswith("🏆"):
            pdf.set_fill_color(255, 182, 193)
        else:
            pdf.set_fill_color(240, 240, 240)
        row = [
            str(r.rank),
            r.user_name[:30],
            r.badge,
            f"{r.overall_score}%",
            f"{r.attendance_percent}%",
            f"{r.total_hours}h",
            f"{r.task_completion_percent}%",
            f"{r.todo_ontime_percent}%",
            f"{r.timely_punchin_percent}%"
        ]
        for i, value in enumerate(row):
            pdf.cell(col_widths[i], 9, value, border=1, align="C", fill=True)
        pdf.ln()
    pdf.ln(10)
    pdf.set_font("Arial", "I", 9)
    pdf.cell(0, 8, txt="Taskosphere • Performance Ranking System • Confidential", align="C")
    output = BytesIO()
    pdf_output = pdf.output(dest="S").encode("latin1")
    output.write(pdf_output)
    output.seek(0)
    filename = f"performance_rankings_{period}_{datetime.now(india_tz).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
# CLIENT ROUTES
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
    if current_user.role == "admin":
        query = {}
    else:
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        if permissions.get("can_view_all_clients", False):
            query = {}
        else:
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
            this_year_bday = bday.replace(year=today.year)
            if this_year_bday < today:
                this_year_bday = bday.replace(year=today.year + 1)
            days_until = (this_year_bday - today).days
            if 0 <= days_until <= days:
                client["days_until_birthday"] = days_until
                upcoming.append(client)
    return sorted(upcoming, key=lambda x: x["days_until_birthday"])
# ✅ CLIENT IMPORT WITH FULL VALIDATION (Pydantic + custom validators + error reporting)
@api_router.post("/clients/import")
async def import_clients_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    filename = file.filename.lower()
    try:
        if filename.endswith(".csv"):
            content = await file.read()
            df = pd.read_csv(BytesIO(content))
        elif filename.endswith(".xlsx"):
            content = await file.read()
            df = pd.read_excel(BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV or XLSX files are supported")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File reading failed: {str(e)}")
    df = df.dropna(how="all").reset_index(drop=True)
    created_clients = 0
    duplicate_clients = 0
    added_contacts = 0
    skipped_rows = 0
    invalid_rows = 0
    validation_errors = []
    current_client_id = None
    for idx, row in df.iterrows():
        try:
            row = {k: ("" if pd.isna(v) else str(v).strip()) for k, v in row.items()}
            company_name = row.get("company_name", "").strip()
        # ====================== NEW CLIENT ROW ======================
            if company_name:
                safe_company = re.escape(company_name)
                user_id = current_user.id
            # Check duplicate (case-insensitive, per user)
                existing = await db.clients.find_one({
                    "created_by": user_id,
                    "company_name": {
                        "$regex": f"^{safe_company}$",
                        "$options": "i"
                    }
                })
                if existing:
                    current_client_id = existing["id"]
                    duplicate_clients += 1
                    continue
            # Parse birthday
                birthday = None
                if row.get("birthday"):
                    try:
                        birthday = parser.parse(row["birthday"]).date()
                    except Exception:
                        birthday = None
            # Parse services
                services = [
                    s.strip()
                    for s in row.get("services", "").split(",")
                    if s.strip()
                ]
            # Parse contacts
                contact_persons = []
                if row.get("contact_name_1"):
                    contact_persons.append({
                        "name": row.get("contact_name_1"),
                        "designation": row.get("contact_designation_1"),
                        "email": row.get("contact_email_1") or None,
                        "phone": row.get("contact_phone_1") or None,
                    })
            # Pydantic validation
                client_create = ClientCreate(
                    company_name=company_name,
                    client_type=row.get("client_type") or "other",
                    email=row.get("email"),
                    phone=row.get("phone"),
                    birthday=birthday,
                    services=services,
                    contact_persons=contact_persons,
                    notes=row.get("notes")
                )
                client_doc = client_create.model_dump()
                client_doc["id"] = str(uuid.uuid4())
                client_doc["created_by"] = user_id
                client_doc["created_at"] = datetime.now(timezone.utc).isoformat()
                await db.clients.insert_one(client_doc)
                current_client_id = client_doc["id"]
                created_clients += 1
        # ====================== ADDITIONAL CONTACT ROW ======================
            else:
                if current_client_id and row.get("contact_name_1"):
                    contact_data = {
                        "name": row.get("contact_name_1"),
                        "designation": row.get("contact_designation_1"),
                        "email": row.get("contact_email_1") or None,
                        "phone": row.get("contact_phone_1") or None,
                    }
                    await db.clients.update_one(
                        {"id": current_client_id},
                        {"$push": {"contact_persons": contact_data}}
                    )
                    added_contacts += 1
                else:
                    skipped_rows += 1
        except ValidationError as ve:
            invalid_rows += 1
            validation_errors.append(f"Row {idx+2}: {ve.errors()[0]['msg']}")
            skipped_rows += 1
            continue
        except Exception:
            invalid_rows += 1
            skipped_rows += 1
            continue
    return {
        "message": "Client import completed successfully",
        "clients_created": created_clients,
        "duplicate_clients_skipped": duplicate_clients,
        "contacts_added": added_contacts,
        "invalid_rows": invalid_rows,
        "rows_skipped": skipped_rows,
        "validation_errors": validation_errors[:20] # limit displayed errors
    }
# DASHBOARD ROUTES
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
    if current_user.role != "admin":
        permissions = current_user.permissions.model_dump() if current_user.permissions else {}
        allowed = permissions.get("view_other_activity", [])
        if user_id and user_id != current_user.id and user_id not in allowed:
            raise HTTPException(status_code=403, detail="Not authorized")
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
# AUDIT LOGS ROUTE
@api_router.get("/audit-logs")
async def get_audit_logs(
    module: Optional[str] = None,
    record_id: Optional[str] = None,
    current_user: User = Depends(check_permission("can_view_audit_logs"))
):
    """
    Fetch audit logs with optional filtering
    """
    query = {}
    if module:
        query["module"] = module
    if record_id:
        query["record_id"] = record_id
    logs = await db.audit_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).to_list(2000)
    # Convert timestamp string to datetime if needed
    for log in logs:
        if isinstance(log.get("timestamp"), str):
            try:
                log["timestamp"] = datetime.fromisoformat(log["timestamp"])
            except:
                pass
    return logs
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
                "timestamp": {
                    "$lt": (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
                }
            })
            # Calculate retention dates
            now = datetime.now(timezone.utc)
            thirty_days = now - timedelta(days=30)
    except Exception as e:
        logger.error(f"Auto job failed: {e}")
    # VERY IMPORTANT: continue request processing
    response = await call_next(request)
    return response
# Api Router
api_router.include_router(notification_router)
app.include_router(api_router)
