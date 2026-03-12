# ─────────────────────────────────────────────
# Standard Library
# ─────────────────────────────────────────────
import os
import re
import csv
import uuid
import logging
import asyncio
import calendar
from datetime import datetime, date, timezone, timedelta
from pathlib import Path
from io import StringIO, BytesIO
from typing import List, Optional, Dict, Any

# ─────────────────────────────────────────────
# Third Party
# ─────────────────────────────────────────────
import pytz
import requests
import pandas as pd
from zoneinfo import ZoneInfo
from dateutil import parser
from dotenv import load_dotenv
from bson import ObjectId

# FastAPI
from fastapi import (
    FastAPI, APIRouter, Depends, HTTPException,
    status, BackgroundTasks, UploadFile, File,
    Query, Request
)
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.gzip import GZipMiddleware

# Auth
from passlib.context import CryptContext

# Validation
from pydantic import (
    BaseModel, EmailStr, Field,
    ConfigDict, field_validator, ValidationError
)

# ─────────────────────────────────────────────
# Environment
# ─────────────────────────────────────────────
load_dotenv()

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Backend Modules
# ─────────────────────────────────────────────
import backend.models as models

from backend.models import (
    Token,
    AuthResponse,
    User,
    UserPermissions,
    Todo,
    TodoCreate,
    Task,
    TaskCreate,
    Client,
    ClientCreate,
    DueDate,
    DueDateCreate,
    DSCCreate,
    DSC,
    DSCListResponse,
    Document,
    DocumentCreate,
    DashboardStats,
    PerformanceMetric,
    MachinePunchPayload,
    MachineConfig,
    MachineConfigUpdate,
    MachineStatusResponse,
    MachineUserResponse,
    MachineAttendanceLog,
    MachineSyncResult,
    MachineEmployeeIDUpdate,
)

# ─────────────────────────────────────────────
# eSSL biometric backend
# ─────────────────────────────────────────────
from .essl_backend import essl_router, _sync_engine as sync_engine

from backend.dependencies import (
    db,
    client,
    get_current_user,
    create_access_token,
    check_permission,
    require_admin,
    require_manager_or_admin,
    verify_record_access,
    verify_client_access
)
from backend.leads import router as leads_router
from backend.telegram import router as telegram_router
from backend.notifications import router as notification_router, create_notification

# External Services
from fpdf import FPDF
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from apscheduler.schedulers.background import BackgroundScheduler

# ====================== CONFIG ======================
IST = pytz.timezone('Asia/Kolkata')
india_tz = ZoneInfo("Asia/Kolkata")
ROOT_DIR = Path(__file__).parent

# ====================== SECURITY CONFIG ===========================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ====================== APP + CORS ===========
app = FastAPI(title="Taskosphere Backend")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://final-taskosphere-frontend.onrender.com",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://final-taskosphere-backend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

@app.on_event("startup")
async def startup_event():
    logger.info("Taskosphere backend starting...")

    if not scheduler.running:
        scheduler.start()

    try:
        if sync_engine and hasattr(sync_engine, "run"):
            asyncio.create_task(sync_engine.run())
            print("✅ ESSL sync engine started")
        else:
            print("⚠️ Sync engine unavailable. Skipping.")
    except Exception as e:
        print(f"❌ Failed to start ESSL sync engine: {e}")

# ====================== HEALTH ======================
@app.get("/health")
async def health():
    return {"status": "ok", "cors": "configured correctly"}

# ====================== CACHES ======================
rankings_cache: dict = {}
rankings_cache_time: dict = {}
_last_reminder_date_cache: Optional[str] = None

# ─────────────────────────────────────────────────────
# Inline Pydantic models used only in main.py
# ─────────────────────────────────────────────────────

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "staff"
    departments: List[str] = []
    phone: Optional[str] = None
    birthday: Optional[str] = None
    profile_picture: Optional[str] = None
    punch_in_time: Optional[str] = "10:30"
    grace_time: Optional[str] = "00:15"
    punch_out_time: Optional[str] = "19:00"
    telegram_id: Optional[str] = None
    permissions: Optional[dict] = None
    machine_employee_id: Optional[str] = None


class BulkTaskCreate(BaseModel):
    tasks: List[TaskCreate]


class StaffActivityCreate(BaseModel):
    app_name: Optional[str] = None
    website: Optional[str] = None
    category: Optional[str] = "other"
    duration_seconds: Optional[int] = 0
    idle: Optional[bool] = False


class StaffActivityLog(BaseModel):
    user_id: str
    app_name: Optional[str] = None
    website: Optional[str] = None
    category: Optional[str] = "other"
    duration_seconds: Optional[int] = 0
    idle: Optional[bool] = False
    timestamp: Optional[datetime] = None


class Attendance(BaseModel):
    id: Optional[str] = None
    user_id: str
    date: str
    punch_in: Optional[datetime] = None
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: str = "absent"
    is_late: bool = False
    leave_reason: Optional[str] = None
    employee_name: Optional[str] = None
    punched_out_early: Optional[bool] = False


class AuditLog(BaseModel):
    user_id: str
    user_name: str
    action: str
    module: str
    record_id: str
    old_data: Optional[dict] = None
    new_data: Optional[dict] = None
    timestamp: Optional[datetime] = None


class HolidayResponse(BaseModel):
    date: str
    name: str
    status: str = "confirmed"
    type: Optional[str] = None
    created_at: Optional[str] = None


class HolidayCreate(BaseModel):
    date: date
    name: str
    type: Optional[str] = "public"


class Reminder(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    remind_at: str
    is_dismissed: bool = False
    created_at: Optional[str] = None


class ReminderCreate(BaseModel):
    title: str
    description: Optional[str] = None
    remind_at: datetime


class DSCMovementRequest(BaseModel):
    movement_type: str
    person_name: str
    notes: Optional[str] = None


class MovementUpdateRequest(BaseModel):
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None


class DocumentMovementRequest(BaseModel):
    movement_type: str
    person_name: str
    notes: Optional[str] = None


class MasterClientForm(BaseModel):
    company_name: str


DEFAULT_ROLE_PERMISSIONS: dict = {
    "admin": {},
    "manager": {},
    "staff": {},
}

# ====================== HELPER FUNCTIONS =====================

def safe_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=pytz.UTC).astimezone(IST)
        return value.astimezone(IST)
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=pytz.UTC).astimezone(IST)
        return dt
    except Exception:
        return None


def sanitize_user_data(users, current_user=None):
    is_single = False
    if not isinstance(users, list):
        users = [users]
        is_single = True
    sanitized = []
    for user in users:
        if isinstance(user, dict):
            safe_user = {k: v for k, v in user.items() if k not in ["password", "_id"]}
            sanitized.append(safe_user)
        else:
            user_dict = user.model_dump() if hasattr(user, "model_dump") else vars(user)
            safe_user = {k: v for k, v in user_dict.items() if k not in ["password", "_id"]}
            sanitized.append(safe_user)
    return sanitized[0] if is_single else sanitized


def convert_objectids(data):
    if isinstance(data, list):
        return [convert_objectids(item) for item in data]
    if isinstance(data, dict):
        new_dict = {}
        for key, value in data.items():
            if isinstance(value, ObjectId):
                new_dict[key] = str(value)
            elif isinstance(value, (dict, list)):
                new_dict[key] = convert_objectids(value)
            else:
                new_dict[key] = value
        return new_dict
    return data


def get_user_permissions(current_user: User) -> dict:
    if isinstance(current_user.permissions, dict):
        return current_user.permissions
    if current_user.permissions:
        return current_user.permissions.model_dump()
    return {}


def is_own_record(current_user: User, record: dict) -> bool:
    uid = current_user.id
    return (
        record.get("user_id") == uid
        or record.get("assigned_to") == uid
        or record.get("created_by") == uid
        or uid in record.get("sub_assignees", [])
    )


async def create_audit_log(
    current_user: User,
    action: str,
    module: str,
    record_id: str,
    old_data: dict = None,
    new_data: dict = None
):
    log_entry = AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action=action,
        module=module,
        record_id=record_id,
        old_data=convert_objectids(old_data) if old_data else None,
        new_data=convert_objectids(new_data) if new_data else None,
        timestamp=datetime.now(timezone.utc)
    )
    await db.audit_logs.insert_one(log_entry.model_dump())


async def calculate_expected_hours(
    start_date_str: str,
    end_date_str: str,
    shift_start: str = "10:30",
    shift_end: str = "19:00"
):
    try:
        start = date.fromisoformat(start_date_str)
        end = date.fromisoformat(end_date_str)
    except Exception:
        return 0
    if start > end:
        return 0
    try:
        t1 = datetime.strptime(shift_start, "%H:%M")
        t2 = datetime.strptime(shift_end, "%H:%M")
        hrs_per_day = (t2 - t1).total_seconds() / 3600
    except Exception:
        hrs_per_day = 8.5
    holidays_cursor = db.holidays.find({})
    holidays = [h["date"] for h in await holidays_cursor.to_list(length=None)]
    total_hours = 0
    current_date = start
    while current_date <= end:
        if current_date.weekday() < 5 and current_date.isoformat() not in holidays:
            total_hours += hrs_per_day
        current_date += timedelta(days=1)
    return round(total_hours, 2)


# --- HOLIDAY AUTOFETCH LOGIC ---
async def fetch_indian_holidays_task():
    try:
        now = datetime.now(IST)
        year = now.year
        month = now.month
        url = f"https://date.nager.at/api/v3/PublicHolidays/{year}/IN"
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            external_holidays = response.json()
            count = 0
            for h in external_holidays:
                h_date_obj = datetime.strptime(h['date'], '%Y-%m-%d').date()
                if h_date_obj.month == month:
                    date_str = h_date_obj.isoformat()
                    existing = await db.holidays.find_one({"date": date_str})
                    if not existing:
                        new_holiday = {
                            "date": date_str,
                            "name": h['localName'],
                            "status": "pending",
                            "type": "public",
                            "created_at": datetime.now(IST).isoformat()
                        }
                        await db.holidays.insert_one(new_holiday)
                        count += 1
            logger.info(f"Auto-fetched {count} holidays for {now.strftime('%B %Y')}")
    except Exception as e:
        logger.error(f"Holiday Autofetch Failed: {str(e)}")


# Initialize Scheduler
scheduler = BackgroundScheduler(timezone=pytz.timezone("Asia/Kolkata"))
scheduler.add_job(lambda: asyncio.run(fetch_indian_holidays_task()), 'cron', day=1, hour=0, minute=5)



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
    # Attendance
    await db.attendance.create_index(
        [("user_id", 1), ("date", 1)],
        name="attendance_user_date_unique",
        unique=True
    )

    await db.attendance.create_index("date", name="attendance_date_index")

# Clients
    await db.clients.create_index(
        [("created_by", 1), ("company_name", 1)],
        name="client_creator_company_unique",
        unique=True
    )

# Holidays
    await db.holidays.create_index(
        "date",
        name="holiday_date_unique",
        unique=True
    )

# Machine config
    await db.machine_config.create_index(
        "key",
        name="machine_config_key_unique",
        unique=True
    )

# Users
    await db.users.create_index(
        "machine_employee_id",
        name="machine_employee_id_index",
        sparse=True
    )

# Tasks
    await db.tasks.create_index(
        [("status", 1), ("assigned_to", 1)],
        name="task_status_assigned_index"
    )

    await db.tasks.create_index(
        "completed_at",
        name="task_completed_at_index"
    )

# Todos
    await db.todos.create_index(
        "is_completed",
        name="todo_completed_index"
    )

# ROUTER
api_router = APIRouter(prefix="/api")
api_router.include_router(essl_router)


# ─────────────────── Email helpers ───────────────────

def send_birthday_email(recipient_email: str, client_name: str):
    sendgrid_key = os.environ.get('SENDGRID_API_KEY')
    sender_email = os.environ.get('SENDER_EMAIL', 'noreply@taskosphere.com')
    if not sendgrid_key:
        logger.warning("SENDGRID_API_KEY not configured, email not sent")
        return False
    subject = f"Happy Birthday, {client_name}!"
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px;
                border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <h1 style="color: #4F46E5; text-align: center;"> Happy Birthday! </h1>
    <p style="font-size: 16px; line-height: 1.6; color: #333;">Dear {client_name},</p>
    <p style="font-size: 16px; line-height: 1.6; color: #333;">
        On behalf of our entire team, we wish you a very Happy Birthday!
    </p>
    <p style="font-size: 16px; line-height: 1.6; color: #333;">
        We appreciate your continued trust and partnership. May this year bring you
        prosperity, success, and happiness.
    </p>
    <div style="background-color: #4F46E5; color: white; padding: 15px; border-radius: 5px;
                margin: 20px 0; text-align: center;">
        <p style="margin: 0; font-size: 18px; font-weight: bold;">Wishing you all the best!</p>
    </div>
    <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
        Best regards,<br><strong>Taskosphere Team</strong>
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


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


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


# ==============================================================
# AUTH ROUTES
# ==============================================================

@api_router.get("/system/time")
async def get_system_time():
    now = datetime.now(IST)
    return {
        "server_time": now.isoformat(),
        "display_time": now.strftime("%I:%M:%S %p"),
        "date": now.strftime("%Y-%m-%d")
    }


# Task Analytics
@api_router.get("/tasks/analytics")
async def get_task_analytics(
    month: str,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if current_user.role != "admin":
        query["$or"] = [
            {"assigned_to": current_user.id},
            {"sub_assignees": current_user.id},
            {"created_by": current_user.id}
        ]
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    total = completed = pending = 0
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


# ==========================================================
# TODO ROUTES
# ==========================================================

@api_router.post("/todos", response_model=Todo)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user)
):
    todo_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": todo_id,
        "user_id": current_user.id,
        "title": todo_data.title,
        "status": todo_data.status,
        "description": getattr(todo_data, "description", None),
        "is_completed": False,
        "due_date": todo_data.due_date.isoformat() if todo_data.due_date else None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    result = await db.todos.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return doc


async def get_team_user_ids(manager_id: str):
    manager = await db.users.find_one({"id": manager_id})
    if not manager or not manager.get("departments"):
        return []
    team = await db.users.find({
        "departments": {"$in": manager["departments"]},
        "id": {"$ne": manager_id},
        "role": "staff"
    }).to_list(100)
    return [u["id"] for u in team]


@api_router.get("/todos")
async def get_todos(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        if user_id == "all":
            query = {}
        elif user_id and user_id != "self":
            query = {"user_id": user_id}
        else:
            query = {"user_id": current_user.id}
    elif current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        if user_id == "all":
            visible_ids = list(set(team_ids + [current_user.id]))
            query = {"user_id": {"$in": visible_ids}}
        elif user_id and user_id not in ("self", current_user.id):
            if user_id not in team_ids:
                raise HTTPException(status_code=403, detail="Not allowed to view this user's todos")
            query = {"user_id": user_id}
        else:
            query = {"user_id": current_user.id}
    else:
        permissions = (
            current_user.permissions.model_dump()
            if hasattr(current_user.permissions, "model_dump")
            else (current_user.permissions or {})
        )
        allowed_others: list = permissions.get("view_other_todos", []) if isinstance(permissions, dict) else []
        if user_id == "all":
            if "everyone" in allowed_others:
                real_allowed = [uid for uid in allowed_others if uid != "everyone"]
                if real_allowed:
                    query = {"user_id": {"$in": real_allowed + [current_user.id]}}
                else:
                    query = {"user_id": current_user.id}
            else:
                query = {"user_id": current_user.id}
        elif user_id and user_id not in ("self", current_user.id):
            if user_id not in allowed_others:
                raise HTTPException(status_code=403, detail="Not allowed to view this user's todos")
            query = {"user_id": user_id}
        else:
            query = {"user_id": current_user.id}

    todos = await db.todos.find(query).to_list(2000)
    for t in todos:
        t["id"] = str(t["_id"])
        del t["_id"]
    return todos


@api_router.get("/dashboard/todo-overview")
async def get_todo_dashboard(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        todos = await db.todos.find().to_list(2000)
        grouped_todos = {}
        all_todos_flat = []
        for todo in todos:
            user = await db.users.find_one({"id": todo["user_id"]}, {"_id": 0})
            user_name = user["full_name"] if user else "Unknown User"
            if user_name not in grouped_todos:
                grouped_todos[user_name] = []
            todo["_id"] = str(todo["_id"])
            grouped_todos[user_name].append(todo)
            all_todos_flat.append(todo)
        return {"role": "admin", "todos": all_todos_flat, "grouped_todos": grouped_todos}
    elif current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        visible_ids = list(set(team_ids + [current_user.id]))
        todos = await db.todos.find({"user_id": {"$in": visible_ids}}).to_list(2000)
        for todo in todos:
            todo["_id"] = str(todo["_id"])
        return {"role": "manager", "todos": todos}
    else:
        permissions = get_user_permissions(current_user)
        allowed_users = permissions.get("view_other_todos", [])
        if not isinstance(allowed_users, list):
            allowed_users = []
        query_ids = list(set(allowed_users + [current_user.id]))
        todos = await db.todos.find({"user_id": {"$in": query_ids}}).to_list(2000)
        for todo in todos:
            todo["_id"] = str(todo["_id"])
        return {"role": "staff", "todos": todos}


@api_router.post("/todos/{todo_id}/promote-to-task")
async def promote_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    try:
        todo = await db.todos.find_one({"_id": ObjectId(todo_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Todo ID")
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if current_user.role != "admin" and todo["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to promote this todo")
    now = datetime.now(IST)
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
    async with await client.start_session() as session:
        async def cb(session):
            await db.tasks.insert_one(new_task, session=session)
            await db.todos.delete_one({"_id": ObjectId(todo_id)}, session=session)
        await session.with_transaction(cb)
    return {"message": "Todo promoted to task successfully"}


@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    try:
        obj_id = ObjectId(todo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Todo ID")
    todo = await db.todos.find_one({"_id": obj_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if current_user.role != "admin" and todo["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.todos.delete_one({"_id": obj_id})
    return {"message": "Todo deleted successfully"}


@api_router.patch("/todos/{todo_id}")
async def update_todo(
    todo_id: str,
    updates: dict,
    current_user: User = Depends(get_current_user)
):
    try:
        todo = await db.todos.find_one({"_id": ObjectId(todo_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Todo ID")
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if current_user.role != "admin" and todo["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    now = datetime.now(IST)
    if updates.get("is_completed") is True:
        updates["completed_at"] = now
    updates["updated_at"] = now
    await db.todos.update_one({"_id": ObjectId(todo_id)}, {"$set": updates})
    return {"message": "Todo updated successfully"}


# ==============================================================
# AUTH ROUTES
# ==============================================================

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user_data.password)
    requested_role = user_data.role.value if hasattr(user_data.role, "value") else user_data.role
    if requested_role in ["admin", "manager", "superadmin"]:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=400,
                detail="Only staff role can be assigned during registration"
            )
    role_val = requested_role
    default_permissions = DEFAULT_ROLE_PERMISSIONS.get(role_val, {})
    user_id = str(uuid.uuid4())
    new_user = {
        "id": user_id,
        "email": user_data.email,
        "full_name": user_data.full_name,
        "role": role_val,
        "password": hashed_password,
        "departments": user_data.departments or [],
        "phone": user_data.phone,
        "birthday": user_data.birthday,
        "telegram_id": user_data.telegram_id,
        "punch_in_time": user_data.punch_in_time or "10:30",
        "grace_time": user_data.grace_time or "00:15",
        "punch_out_time": user_data.punch_out_time or "19:00",
        "profile_picture": user_data.profile_picture,
        "is_active": False,
        "status": "pending_approval",
        "approved_by": None,
        "approved_at": None,
        "permissions": user_data.permissions if user_data.permissions else default_permissions,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "machine_employee_id": user_data.machine_employee_id,
        "machine_synced": False,
    }
    await db.users.insert_one(new_user)
    access_token = create_access_token({"sub": str(user_id)})
    new_user["password"] = None
    return {"access_token": access_token, "token_type": "bearer", "user": new_user}


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})

    if not user or not user.get("password") or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("status") != "active":
        raise HTTPException(
            status_code=403,
            detail=f"Your account is {user.get('status')}. Awaiting admin approval."
        )

    # ensure permissions
    user["permissions"] = user.get("permissions") or UserPermissions().model_dump()

    # convert created_at safely
    if isinstance(user.get("created_at"), str):
        try:
            user["created_at"] = datetime.fromisoformat(user["created_at"])
        except Exception:
            user["created_at"] = datetime.now(timezone.utc)

    # prepare user data
    user_data = {k: v for k, v in user.items() if k not in ("password", "_id")}

    # fix telegram id type
    if user_data.get("telegram_id") is not None:
        user_data["telegram_id"] = str(user_data["telegram_id"])

    user_obj = User(**user_data)

    access_token = create_access_token({"sub": str(user_obj.id)})

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_obj
    )


@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@api_router.post("/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: User = Depends(require_admin)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if existing.get("status") != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"User status is {existing.get('status')}, not pending approval"
        )
    update_data = {
        "status": "active",
        "is_active": True,
        "approved_by": current_user.id,
        "approved_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    await create_audit_log(current_user, "APPROVE_USER", "user", user_id, existing, update_data)
    return {"message": "User approved successfully"}


@api_router.post("/users/{user_id}/reject")
async def reject_user(user_id: str, current_user: User = Depends(require_admin)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = {"status": "rejected", "is_active": False}
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    await create_audit_log(current_user, "REJECT_USER", "user", user_id, existing, update_data)
    return {"message": "User rejected"}


# ==============================================================
# REMINDER ROUTES
# ==============================================================

@api_router.post("/reminders")
async def create_reminder(
    data: ReminderCreate,
    current_user: User = Depends(get_current_user)
):
    reminder = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "title": data.title,
        "description": data.description,
        "remind_at": data.remind_at.isoformat() if isinstance(data.remind_at, datetime) else str(data.remind_at),
        "is_dismissed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reminders.insert_one(reminder)
    reminder.pop("_id", None)
    return reminder


@api_router.get("/reminders")
async def get_reminders(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if user_id and user_id != current_user.id:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Not authorized")
        query = {"user_id": user_id}
    else:
        query = {"user_id": current_user.id}
    reminders = await db.reminders.find(query, {"_id": 0}).sort("remind_at", 1).to_list(500)
    return reminders


@api_router.patch("/reminders/{reminder_id}")
async def update_reminder(
    reminder_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    existing = await db.reminders.find_one({"id": reminder_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if existing["user_id"] != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    allowed = {"title", "description", "remind_at", "is_dismissed"}
    update = {k: v for k, v in data.items() if k in allowed}
    if update:
        await db.reminders.update_one({"id": reminder_id}, {"$set": update})
    return {"message": "Reminder updated"}


@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user)
):
    existing = await db.reminders.find_one({"id": reminder_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if existing["user_id"] != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.reminders.delete_one({"id": reminder_id})
    return {"message": "Reminder deleted"}


# ==============================================================
# USER MANAGEMENT
# ==============================================================

@api_router.get("/users")
async def get_users(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        query = {}
        users_raw = await db.users.find(query, {"_id": 0, "password": 0}).to_list(1000)
    elif current_user.role == "manager":
        if user_id:
            target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
            if not target_user:
                raise HTTPException(status_code=404, detail="User not found")
            target_depts = target_user.get("departments", [])
            manager_depts = current_user.departments
            if not any(d in manager_depts for d in target_depts):
                raise HTTPException(status_code=403, detail="User not in your departments")
            users_raw = [target_user]
        else:
            team_ids = await get_team_user_ids(current_user.id)
            query = {"id": {"$in": team_ids + [current_user.id]}}
            users_raw = await db.users.find(query, {"_id": 0, "password": 0}).to_list(1000)
    else:
        permissions = get_user_permissions(current_user)
        if not user_id and not permissions.get("can_view_user_page", False):
            raise HTTPException(status_code=403, detail="User directory access not permitted")
        if user_id and user_id != current_user.id:
            allowed = permissions.get("view_other_activity", [])
            if user_id not in allowed:
                raise HTTPException(status_code=403, detail="Not allowed")
        users_raw = await db.users.find(
            {"id": user_id or current_user.id},
            {"_id": 0, "password": 0}
        ).to_list(1000)

    for u in users_raw:
        if u.get("created_at") and isinstance(u["created_at"], str):
            try:
                u["created_at"] = datetime.fromisoformat(u["created_at"])
            except Exception:
                u["created_at"] = datetime.now(timezone.utc)
        else:
            u["created_at"] = datetime.now(timezone.utc)
    return users_raw


@api_router.put("/users/{user_id}", response_model=User)
async def update_user(
    user_id: str,
    user_data: dict,
    current_user: User = Depends(get_current_user)
):
    is_own = user_id == current_user.id
    is_admin = current_user.role.lower() == "admin"
    perms = get_user_permissions(current_user)
    has_edit_users = perms.get("can_edit_users", False)
    if not is_admin and not is_own and not has_edit_users:
        raise HTTPException(status_code=403, detail="You can only update your own profile.")
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found.")
    if is_admin:
        allowed_fields = [
            "full_name", "email", "role", "departments", "phone",
            "birthday", "punch_in_time", "grace_time",
            "punch_out_time", "is_active", "profile_picture", "telegram_id",
            "status", "permissions", "machine_employee_id",
        ]
    else:
        allowed_fields = [
            "full_name", "phone", "birthday",
            "punch_in_time", "punch_out_time", "profile_picture", "telegram_id"
        ]
    update_payload = {}
    for key in allowed_fields:
        if key in user_data:
            val = user_data[key]
            update_payload[key] = val if val != "" else None
    if "machine_employee_id" in update_payload and update_payload["machine_employee_id"]:
        conflict = await db.users.find_one({
            "machine_employee_id": update_payload["machine_employee_id"],
            "id": {"$ne": user_id}
        })
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f"machine_employee_id already assigned to {conflict.get('full_name')}"
            )
        update_payload["machine_synced"] = False
    new_password = user_data.get("password")
    if new_password and len(new_password.strip()) > 0:
        update_payload["password"] = get_password_hash(new_password)
    if update_payload:
        await db.users.update_one({"id": user_id}, {"$set": update_payload})
    await create_audit_log(current_user, "UPDATE_USER", "user", user_id, existing, update_payload)
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return updated_user


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    perms = get_user_permissions(current_user)
    if current_user.role != "admin" and not perms.get("can_manage_users", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await create_audit_log(current_user, "DELETE_USER", "user", record_id=user_id, old_data=existing)
    await db.users.delete_one({"id": user_id})
    return {"message": "User deleted successfully"}


@api_router.get("/users/{user_id}/permissions")
async def get_permissions(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user.get("permissions", {})


@api_router.put("/users/{user_id}/permissions")
async def update_user_permissions(
    user_id: str,
    permissions: dict,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    old_permissions = existing.get("permissions", {})
    await db.users.update_one({"id": user_id}, {"$set": {"permissions": permissions}})
    await create_audit_log(
        current_user, "UPDATE_PERMISSIONS", "user",
        record_id=user_id, old_data=old_permissions, new_data=permissions
    )
    return {"message": "Permissions updated successfully"}


# ==============================================================
# ATTENDANCE ROUTES
# ==============================================================

def get_real_client_ip(request: Request):
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def check_is_late(user: dict, punch_in_ist: datetime) -> bool:
    try:
        pit = datetime.strptime(user.get("punch_in_time", "10:30"), "%H:%M")
        if user.get("late_grace_minutes") is not None:
            grace_minutes = int(user["late_grace_minutes"])
        else:
            raw = str(user.get("grace_time", "00:15"))
            gt = datetime.strptime(raw, "%H:%M")
            grace_minutes = gt.hour * 60 + gt.minute
        deadline = punch_in_ist.replace(
            hour=pit.hour, minute=pit.minute, second=0, microsecond=0
        ) + timedelta(minutes=grace_minutes)
        return punch_in_ist > deadline
    except Exception:
        return False


def check_punched_out_early(user: dict, punch_out_ist: datetime) -> bool:
    try:
        pot = datetime.strptime(user.get("punch_out_time", "19:00"), "%H:%M")
        expected_out = punch_out_ist.replace(
            hour=pot.hour, minute=pot.minute, second=0, microsecond=0
        )
        return punch_out_ist < expected_out
    except Exception:
        return False


@api_router.post("/attendance")
async def handle_attendance(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    today_str = today.isoformat()
    holiday = await db.holidays.find_one({"date": today_str, "status": "confirmed"})
    if holiday:
        raise HTTPException(
            status_code=400,
            detail=f"Today is a holiday ({holiday.get('name')}). Office is closed."
        )
    action = data.get("action")
    if action not in ["punch_in", "punch_out"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    attendance = await db.attendance.find_one(
        {"user_id": current_user.id, "date": today_str}
    )

    if action == "punch_in":
        if attendance and attendance.get("punch_in"):
            raise HTTPException(status_code=400, detail="Already punched in")
        user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0})
        punch_in_utc = datetime.now(timezone.utc)
        punch_in_ist = punch_in_utc.astimezone(ZoneInfo("Asia/Kolkata"))
        is_late = check_is_late(user_doc or {}, punch_in_ist)
        set_data = {
            "status": "present",
            "punch_in": punch_in_utc,
            "is_late": is_late,
            "leave_reason": None
        }
        lat = data.get("latitude")
        lng = data.get("longitude")
        if lat is not None and lng is not None:
            set_data["location"] = {"latitude": lat, "longitude": lng}
        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today_str},
            {"$set": set_data},
            upsert=True
        )
        return {"message": "Punched in successfully", "is_late": is_late}

    if action == "punch_out":
        if not attendance or not attendance.get("punch_in"):
            raise HTTPException(status_code=400, detail="Not punched in yet")
        if attendance.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out")
        punch_in_dt = attendance.get("punch_in")
        punch_out_utc = datetime.now(timezone.utc)
        punch_out_ist = punch_out_utc.astimezone(ZoneInfo("Asia/Kolkata"))
        user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0})
        punched_out_early = check_punched_out_early(user_doc or {}, punch_out_ist)
        punch_in_aware = punch_in_dt if punch_in_dt.tzinfo else punch_in_dt.replace(tzinfo=timezone.utc)
        delta = punch_out_utc - punch_in_aware
        duration_minutes = int(delta.total_seconds() / 60)
        punch_out_set = {
            "punch_out": punch_out_utc,
            "punched_out_early": punched_out_early,
            "duration_minutes": max(0, duration_minutes)
        }
        lat_out = data.get("latitude")
        lng_out = data.get("longitude")
        if lat_out is not None and lng_out is not None:
            punch_out_set["punch_out_location"] = {"latitude": lat_out, "longitude": lng_out}
        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today_str},
            {"$set": punch_out_set}
        )
        return {
            "message": "Punched out successfully",
            "duration": duration_minutes,
            "punched_out_early": punched_out_early
        }


@api_router.post("/attendance/mark-leave-today")
async def mark_leave_today(current_user: User = Depends(get_current_user)):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    today_str = today.isoformat()
    holiday = await db.holidays.find_one({"date": today_str})
    if holiday:
        raise HTTPException(
            status_code=400,
            detail=f"Today is a holiday ({holiday.get('name')}). Leave marking is not allowed."
        )
    await db.attendance.update_one(
        {"user_id": current_user.id, "date": today_str},
        {
            "$set": {
                "status": "leave",
                "punch_in": None,
                "punch_out": None,
                "leave_reason": "Marked on leave today"
            }
        },
        upsert=True
    )
    return {"message": "Marked on leave today"}


@api_router.get("/attendance/today")
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    today_str = today.isoformat()
    holiday = await db.holidays.find_one({"date": today_str})
    if holiday:
        return {
            "status": "holiday",
            "holiday": holiday,
            "punch_in": None,
            "punch_out": None,
            "leave_reason": None
        }
    attendance = await db.attendance.find_one(
        {"user_id": current_user.id, "date": today_str},
        {"_id": 0}
    )
    if not attendance:
        return {"status": "absent", "punch_in": None, "punch_out": None, "leave_reason": None}
    if "status" not in attendance:
        attendance["status"] = "present" if attendance.get("punch_in") else "absent"
    return attendance


@api_router.post("/attendance/apply-leave")
async def apply_leave(data: dict, current_user: User = Depends(get_current_user)):
    try:
        from_date = datetime.fromisoformat(data["from_date"]).date()
        to_date = datetime.fromisoformat(data.get("to_date", data["from_date"])).date()
        reason = data.get("reason", "Leave Applied")
        if to_date < from_date:
            raise HTTPException(status_code=400, detail="Invalid date range")
        current = from_date
        while current <= to_date:
            await db.attendance.update_one(
                {"user_id": current_user.id, "date": current.isoformat()},
                {"$set": {"status": "leave", "leave_reason": reason, "punch_in": None, "punch_out": None}},
                upsert=True
            )
            current += timedelta(days=1)
        return {"message": "Leave applied successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/attendance/history", response_model=List[Attendance])
async def get_attendance_history(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if current_user.role == "admin":
        if user_id and user_id != "everyone":
            query["user_id"] = user_id
    elif current_user.role == "manager":
        permissions_mgr = get_user_permissions(current_user)
        allowed_users = permissions_mgr.get("view_other_attendance", [])
        if user_id:
            if user_id == current_user.id:
                query["user_id"] = user_id
            else:
                if not permissions_mgr.get("can_view_attendance", False):
                    raise HTTPException(status_code=403, detail="You do not have permission to view other users' attendance")
                if user_id not in allowed_users:
                    raise HTTPException(status_code=403, detail="This user is outside your cross-visibility scope")
                query["user_id"] = user_id
        else:
            if permissions_mgr.get("can_view_attendance", False) and allowed_users:
                query["user_id"] = {"$in": allowed_users + [current_user.id]}
            else:
                query["user_id"] = current_user.id
    else:
        if user_id and user_id != current_user.id:
            permissions = get_user_permissions(current_user)
            allowed_users = permissions.get("view_other_attendance", [])
            if user_id not in allowed_users:
                raise HTTPException(status_code=403, detail="Not authorized to view other users' attendance")
        query["user_id"] = user_id if user_id else current_user.id

    attendance_list = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    all_user_ids = list({a.get("user_id") for a in attendance_list if a.get("user_id")})
    users_cursor = await db.users.find(
        {"id": {"$in": all_user_ids}},
        {"_id": 0, "id": 1, "full_name": 1}
    ).to_list(500)
    user_name_map = {u["id"]: u["full_name"] for u in users_cursor}
    for attendance in attendance_list:
        attendance["punch_in"] = safe_dt(attendance.get("punch_in"))
        attendance["punch_out"] = safe_dt(attendance.get("punch_out"))
        if "status" not in attendance:
            attendance["status"] = "present" if attendance.get("punch_in") else "absent"
        attendance["employee_name"] = user_name_map.get(attendance.get("user_id"), "Unknown")
    return attendance_list


@api_router.get("/attendance/my-summary")
async def get_my_attendance_summary(current_user: User = Depends(get_current_user)):
    now = datetime.now(IST)
    current_month = now.strftime("%Y-%m")
    attendance_list = await db.attendance.find(
        {"user_id": current_user.id}, {"_id": 0}
    ).sort("date", -1).to_list(1000)
    monthly_data = {}
    total_minutes_all = 0
    total_days = 0
    for attendance in attendance_list:
        month = attendance["date"][:7]
        if month not in monthly_data:
            monthly_data[month] = {"total_minutes": 0, "days_present": 0}
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
        permissions = get_user_permissions(current_user)
        if not permissions.get("can_view_attendance"):
            raise HTTPException(status_code=403, detail="Not allowed")
    now = datetime.now(IST)
    target_month = month or now.strftime("%Y-%m")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in users}
    attendance_list = await db.attendance.find(
        {"date": {"$regex": f"^{target_month}"}}, {"_id": 0}
    ).to_list(5000)
    staff_report = {}
    for attendance in attendance_list:
        uid = attendance["user_id"]
        if uid not in staff_report:
            user_info = user_map.get(uid, {})
            staff_report[uid] = {
                "user_id": uid,
                "user_name": user_info.get("full_name", "Unknown"),
                "role": user_info.get("role", "staff"),
                "total_minutes": 0,
                "days_present": 0,
                "late_days": 0,
                "early_out_days": 0,
                "records": []
            }
        duration = attendance.get("duration_minutes")
        if isinstance(duration, (int, float)):
            staff_report[uid]["total_minutes"] += duration
        staff_report[uid]["days_present"] += 1
        if attendance.get("is_late"):
            staff_report[uid]["late_days"] += 1
        if attendance.get("punched_out_early"):
            staff_report[uid]["early_out_days"] += 1
        staff_report[uid]["records"].append({
            "date": attendance["date"],
            "punch_in": attendance.get("punch_in"),
            "punch_out": attendance.get("punch_out"),
            "duration_minutes": duration,
            "is_late": attendance.get("is_late", False),
            "punched_out_early": attendance.get("punched_out_early", False)
        })
    result = []
    for uid, data in staff_report.items():
        total_minutes = data["total_minutes"]
        hours = total_minutes // 60
        minutes = total_minutes % 60
        data["total_hours"] = f"{hours}h {minutes}m"
        if data["days_present"] > 0:
            data["avg_hours_per_day"] = round((total_minutes / data["days_present"]) / 60, 1)
        else:
            data["avg_hours_per_day"] = 0
        user_data = user_map.get(uid, {})
        year, month_val = map(int, target_month.split("-"))
        _, last_day = calendar.monthrange(year, month_val)
        expected_hours = await calculate_expected_hours(
            f"{target_month}-01",
            f"{target_month}-{last_day:02d}",
            user_data.get("punch_in_time", "10:30"),
            user_data.get("punch_out_time", "19:00")
        )
        data["expected_hours"] = expected_hours
        result.append(data)
    result.sort(key=lambda x: x["total_minutes"], reverse=True)
    return result


@api_router.get("/attendance/export-pdf")
async def export_attendance_pdf(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    if user_id != current_user.id:
        permissions = get_user_permissions(current_user)
        if current_user.role != "admin" and not permissions.get("can_view_attendance"):
            raise HTTPException(status_code=403, detail="Not authorized to export other users' attendance")
    records = await db.attendance.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("date", 1).to_list(1000)
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, txt="Attendance Report", ln=True, align="C")
    pdf.ln(5)
    pdf.set_font("Arial", size=10)
    for rec in records:
        late_flag = " [LATE]" if rec.get("is_late") else ""
        early_flag = " [EARLY OUT]" if rec.get("punched_out_early") else ""
        pdf.multi_cell(
            0, 8,
            f"Date: {rec.get('date')} | In: {rec.get('punch_in')} | "
            f"Out: {rec.get('punch_out')} | Duration: {rec.get('duration_minutes')} mins"
            f"{late_flag}{early_flag}"
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


# ====================== TOP PERFORMERS HELPER ======================

async def get_top_performers_data(period: str = "monthly", limit: int = 5, db=None):
    now = datetime.now(IST)
    if period == "weekly":
        start_date = now - timedelta(days=7)
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
    pipeline = [
        {
            "$match": {
                "status": "completed",
                "assigned_to": {"$ne": None},
                "$or": [
                    {"completed_at": {"$gte": start_date.isoformat()}},
                    {"updated_at": {"$gte": start_date.isoformat()}}
                ]
            }
        },
        {"$group": {"_id": "$assigned_to", "completed_tasks": {"$sum": 1}}},
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
    for idx, p in enumerate(performers):
        p["rank"] = idx + 1
    return performers


# ==============================================================
# TASK ROUTES
# ==============================================================

@api_router.post("/tasks", response_model=Task)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user)
):
    if (task_data.assigned_to
            and task_data.assigned_to != current_user.id
            and current_user.role != "admin"):
        perms = get_user_permissions(current_user)
        if not perms.get("can_assign_tasks", False):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to assign tasks to other users"
            )
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    task = Task(
        **task_data.model_dump(),
        id=task_id,
        created_by=current_user.id,
        created_at=now,
        updated_at=now
    )
    doc = task.model_dump()
    date_fields = ["created_at", "updated_at", "due_date", "recurrence_end_date"]
    for field in date_fields:
        if doc.get(field) and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    await db.tasks.insert_one(doc)
    if task.assigned_to and task.assigned_to != current_user.id:
        await create_notification(
            user_id=task.assigned_to,
            title="New Task Assigned",
            message=f"You have been assigned task '{task.title}'",
            type="assignment"
        )
    await create_audit_log(
        current_user=current_user,
        action="CREATE_TASK",
        module="tasks",
        record_id=task_id,
        new_data={"title": task.title}
    )
    return task


@api_router.get("/tasks/{task_id}/comments")
async def get_task_comments(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    is_admin = getattr(current_user, "role", "").lower() == "admin"
    is_involved = is_own_record(current_user, task)
    if not is_admin and not is_involved:
        raise HTTPException(status_code=403, detail="Unauthorized to view these comments")
    return task.get("comments", [])


@api_router.post("/tasks/bulk")
async def create_tasks_bulk(
    payload: BulkTaskCreate,
    current_user: User = Depends(get_current_user)
):
    created_tasks = []
    for task_data in payload.tasks:
        task_dict = task_data.dict()
        task_dict["id"] = str(uuid.uuid4())
        task_dict["created_by"] = current_user.id
        task_dict["created_at"] = datetime.now(IST).isoformat()
        task_dict["updated_at"] = datetime.now(IST).isoformat()
        if task_dict.get("due_date"):
            task_dict["due_date"] = task_dict["due_date"].isoformat()
        await db.tasks.insert_one(task_dict)
        if task_dict.get("assigned_to") and task_dict["assigned_to"] != current_user.id:
            await create_notification(
                user_id=task_dict["assigned_to"],
                title="New Task Assigned",
                message=f"You have been assigned task '{task_dict['title']}'"
            )
        created_tasks.append(task_dict)
    return {"message": "Tasks created successfully", "count": len(created_tasks)}


@api_router.post("/tasks/import")
async def import_tasks_from_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if file.content_type != "text/csv":
        raise HTTPException(400, "Invalid file type")
    content = await file.read()
    content_str = content.decode("utf-8")
    csv_reader = csv.DictReader(StringIO(content_str))
    tasks = []
    for row in csv_reader:
        task_data = TaskCreate(
            title=row.get("title", ""),
            description=row.get("description"),
            assigned_to=row.get("assigned_to"),
            sub_assignees=row.get("sub_assignees", "").split(",") if row.get("sub_assignees") else [],
            due_date=parser.parse(row["due_date"]) if row.get("due_date") else None,
            priority=row.get("priority", "medium"),
            status=row.get("status", "pending"),
            category=row.get("category", "other"),
            client_id=row.get("client_id"),
            is_recurring=bool(row.get("is_recurring", False)),
            recurrence_pattern=row.get("recurrence_pattern", "monthly"),
            recurrence_interval=int(row.get("recurrence_interval", 1))
        )
        tasks.append(task_data)
    payload = BulkTaskCreate(tasks=tasks)
    return await create_tasks_bulk(payload, current_user)


@api_router.get("/tasks")
async def get_tasks(current_user: User = Depends(get_current_user)):
    query = {"type": {"$ne": "todo"}}
    if current_user.role == "admin":
        pass
    elif current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        query["$or"] = [
            {"assigned_to": current_user.id},
            {"assigned_to": {"$in": team_ids}},
            {"sub_assignees": current_user.id},
            {"created_by": current_user.id}
        ]
    else:
        permissions = get_user_permissions(current_user)
        allowed_users = permissions.get("view_other_tasks", [])
        query["$or"] = [
            {"assigned_to": current_user.id},
            {"sub_assignees": current_user.id},
            {"created_by": current_user.id},
            {"assigned_to": {"$in": allowed_users}}
        ]
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    user_ids = {
        task.get("assigned_to") for task in tasks if task.get("assigned_to")
    } | {
        task.get("created_by") for task in tasks if task.get("created_by")
    }
    users = await db.users.find(
        {"id": {"$in": list(user_ids)}}, {"_id": 0, "password": 0}
    ).to_list(1000)
    user_map = {u["id"]: u["full_name"] for u in users}
    for task in tasks:
        task["created_at"] = safe_dt(task.get("created_at"))
        task["updated_at"] = safe_dt(task.get("updated_at"))
        task["due_date"] = safe_dt(task.get("due_date"))
        task["assigned_to_name"] = user_map.get(task.get("assigned_to"), "Unknown")
        task["created_by_name"] = user_map.get(task.get("created_by"), "Unknown")
        if not isinstance(task.get("sub_assignees"), list):
            task["sub_assignees"] = []
        if not isinstance(task.get("comments"), list):
            task["comments"] = []
    return tasks


@api_router.get("/tasks/{task_id}/detail")
async def get_task_detail(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role != "admin":
        if not is_own_record(current_user, task):
            permissions = get_user_permissions(current_user)
            allowed_users = permissions.get("view_other_tasks", [])
            if task.get("assigned_to") not in allowed_users:
                raise HTTPException(status_code=403, detail="Not authorized")
    assigned_user = created_user = None
    sub_assignee_names = []
    if task.get("assigned_to"):
        assigned_user = await db.users.find_one(
            {"id": task["assigned_to"]},
            {"_id": 0, "full_name": 1, "profile_picture": 1, "email": 1}
        )
    if task.get("created_by"):
        created_user = await db.users.find_one(
            {"id": task["created_by"]}, {"_id": 0, "full_name": 1}
        )
    if task.get("sub_assignees"):
        sub_users = await db.users.find(
            {"id": {"$in": task["sub_assignees"]}},
            {"_id": 0, "full_name": 1, "id": 1}
        ).to_list(50)
        sub_assignee_names = [u["full_name"] for u in sub_users]
    client_name = None
    if task.get("client_id"):
        client_doc = await db.clients.find_one(
            {"id": task["client_id"]}, {"_id": 0, "company_name": 1}
        )
        if client_doc:
            client_name = client_doc.get("company_name")
    task["assigned_to_name"] = assigned_user.get("full_name", "Unknown") if assigned_user else "Unknown"
    task["assigned_to_email"] = assigned_user.get("email") if assigned_user else None
    task["assigned_to_picture"] = assigned_user.get("profile_picture") if assigned_user else None
    task["created_by_name"] = created_user.get("full_name", "Unknown") if created_user else "Unknown"
    task["sub_assignee_names"] = sub_assignee_names
    task["client_name"] = client_name
    task["created_at"] = safe_dt(task.get("created_at"))
    task["updated_at"] = safe_dt(task.get("updated_at"))
    task["due_date"] = safe_dt(task.get("due_date"))
    if task.get("completed_at"):
        task["completed_at"] = safe_dt(task.get("completed_at"))
    return task


@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == "admin":
        pass
    elif is_own_record(current_user, task):
        pass
    else:
        permissions = get_user_permissions(current_user)
        allowed_users = permissions.get("view_other_tasks", [])
        if task.get("assigned_to") not in allowed_users:
            raise HTTPException(status_code=403, detail="Not authorized")
    return Task(**task)


@api_router.api_route("/tasks/{task_id}", methods=["PATCH", "PUT"], response_model=Task)
async def patch_task(
    task_id: str,
    updates: dict,
    current_user: User = Depends(get_current_user)
):
    existing_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")
    is_authorized = (
        current_user.role.lower() == "admin" or
        is_own_record(current_user, existing_task)
    )
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this task")
    old_data = existing_task.copy()
    updates["updated_at"] = datetime.now(IST).isoformat()
    if updates.get("status") == "completed":
        updates["completed_at"] = datetime.now(IST).isoformat()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    action_type = (
        "TASK_STATUS_CHANGED"
        if "status" in updates and old_data.get("status") != updates.get("status")
        else "UPDATE_TASK"
    )
    await create_audit_log(
        current_user=current_user,
        action=action_type,
        module="task",
        record_id=task_id,
        old_data=old_data,
        new_data=updates
    )
    return Task(**updated_task)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    is_admin = current_user.role.lower() == "admin"
    permissions = get_user_permissions(current_user)
    is_creator = existing.get("created_by") == current_user.id
    has_delete_perm = permissions.get("can_edit_tasks", False)
    if not (is_admin or is_creator or has_delete_perm):
        raise HTTPException(
            status_code=403,
            detail="Only Admin, task creator, or users with explicit permission can delete tasks."
        )
    await db.tasks.delete_one({"id": task_id})
    await create_audit_log(
        current_user=current_user,
        action="DELETE_TASK",
        module="task",
        record_id=task_id,
        old_data=existing
    )
    return {"message": "Task deleted successfully"}


@api_router.post("/tasks/{task_id}/comments")
async def add_task_comment(
    task_id: str,
    comment_data: dict,
    current_user: User = Depends(get_current_user)
):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    is_involved = current_user.role.lower() == "admin" or is_own_record(current_user, task)
    if not is_involved:
        raise HTTPException(status_code=403, detail="Access denied: You must be involved in this task to comment.")
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "text": comment_data.get("text"),
        "created_at": datetime.now(IST).isoformat()
    }
    await db.tasks.update_one({"id": task_id}, {"$push": {"comments": comment}})
    return comment


@api_router.get("/tasks/{task_id}/export-log-pdf")
async def export_task_log_pdf(
    task_id: str,
    current_user: User = Depends(check_permission("can_view_audit_logs"))
):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    logs = await db.audit_logs.find(
        {"module": "task", "record_id": task_id}, {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    if not logs:
        raise HTTPException(status_code=404, detail="No audit logs found")
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, "Task Lifecycle Report", ln=True, align="C")
    pdf.ln(5)
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 8, "Task Information", ln=True)
    pdf.ln(3)
    pdf.set_font("Arial", size=11)
    pdf.multi_cell(0, 7, f"Title: {task.get('title', '-')}")
    pdf.multi_cell(0, 7, f"Description: {task.get('description', '-')}")
    pdf.multi_cell(0, 7, f"Current Status: {task.get('status', '-')}")
    pdf.ln(8)
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 8, "Activity Timeline", ln=True)
    pdf.ln(4)
    pdf.set_font("Arial", size=10)
    for log in logs:
        timestamp = log.get("timestamp")
        if isinstance(timestamp, datetime):
            timestamp = timestamp.strftime("%b %d, %Y %I:%M %p")
        action = log.get("action", "UNKNOWN")
        user = log.get("user_name", "Unknown User")
        pdf.set_font("Arial", "B", 10)
        pdf.multi_cell(0, 6, f"{timestamp} — {action.replace('_', ' ').title()} by {user}")
        pdf.set_font("Arial", size=10)
        if log.get("old_data") and log.get("new_data"):
            for key in log["new_data"]:
                old_val = log["old_data"].get(key)
                new_val = log["new_data"].get(key)
                if old_val != new_val:
                    pdf.multi_cell(0, 6, f" {key.replace('_', ' ').title()}: {old_val} → {new_val}")
        pdf.ln(3)
    pdf.ln(5)
    pdf.set_font("Arial", "I", 8)
    pdf.multi_cell(0, 5, f"Generated on {datetime.utcnow().strftime('%b %d, %Y %I:%M %p')} UTC")
    output = BytesIO()
    output.write(pdf.output(dest="S").encode("latin1"))
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=task_lifecycle_{task_id}.pdf"}
    )


# ==============================================================
# DSC ROUTES
# ==============================================================

@api_router.post("/dsc", response_model=DSC)
async def create_dsc(dsc_data: DSCCreate, current_user: User = Depends(get_current_user)):
    dsc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": dsc_id,
        "holder_name": dsc_data.holder_name,
        "dsc_type": dsc_data.dsc_type,
        "associated_with": dsc_data.associated_with,
        "certificate_number": dsc_data.certificate_number,
        "issue_date": dsc_data.issue_date.isoformat() if dsc_data.issue_date else None,
        "expiry_date": dsc_data.expiry_date.isoformat() if dsc_data.expiry_date else None,
        "current_status": dsc_data.current_status,
        "notes": dsc_data.notes,
        "current_location": None,
        "movement_log": [],
        "created_by": current_user.id,
        "created_at": now.isoformat(),
    }
    await db.dsc_register.insert_one(doc)
    return DSC(**{**doc, "created_at": now, "issue_date": dsc_data.issue_date, "expiry_date": dsc_data.expiry_date})


@api_router.get("/dsc")
async def get_dsc_list(
    sort_by: str = Query("holder_name"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(500, ge=1, le=500),
    current_user: User = Depends(check_permission("can_view_all_dsc"))
):
    query = {}
    if search:
        safe_search = re.escape(search)
        search_regex = {"$regex": safe_search, "$options": "i"}
        query["$or"] = [
            {"holder_name": search_regex},
            {"dsc_type": search_regex},
            {"associated_with": search_regex},
            {"current_status": search_regex}
        ]
    sort_dir = 1 if order.lower() == "asc" else -1
    skip = (page - 1) * limit
    total = await db.dsc_register.count_documents(query)
    cursor = db.dsc_register.find(query, {"_id": 0}).sort(sort_by, sort_dir).skip(skip).limit(limit)
    dsc_list = await cursor.to_list(length=limit)
    now = datetime.now(IST)
    for dsc in dsc_list:
        for field in ("created_at", "issue_date", "expiry_date"):
            if isinstance(dsc.get(field), str):
                try:
                    dsc[field] = datetime.fromisoformat(dsc[field])
                except Exception:
                    dsc[field] = None
        expiry_date = dsc.get("expiry_date")
        if expiry_date:
            expiry_aware = expiry_date if expiry_date.tzinfo else expiry_date.replace(tzinfo=timezone.utc)
            now_utc = now.astimezone(timezone.utc)
            if expiry_aware < now_utc:
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
                        {"$set": {"current_status": "EXPIRED", "movement_log": movement_log}}
                    )
                    dsc["current_status"] = "EXPIRED"
                    dsc["movement_log"] = movement_log
    return DSCListResponse(data=dsc_list, total=total, page=page, limit=limit)


@api_router.put("/dsc/{dsc_id}", response_model=DSC)
async def update_dsc(
    dsc_id: str,
    dsc_data: DSCCreate,
    current_user: User = Depends(check_permission("can_edit_dsc"))
):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    update_data = dsc_data.model_dump()
    update_data["issue_date"] = update_data["issue_date"].isoformat() if update_data.get("issue_date") else None
    update_data["expiry_date"] = update_data["expiry_date"].isoformat() if update_data.get("expiry_date") else None
    await db.dsc_register.update_one({"id": dsc_id}, {"$set": update_data})
    await create_audit_log(current_user, "UPDATE_DSC", "dsc", dsc_id, existing, update_data)
    updated = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    for field in ("created_at", "issue_date", "expiry_date"):
        if isinstance(updated.get(field), str):
            try:
                updated[field] = datetime.fromisoformat(updated[field])
            except Exception:
                updated[field] = None
    return DSC(**updated)


@api_router.delete("/dsc/{dsc_id}")
async def delete_dsc(dsc_id: str, current_user: User = Depends(check_permission("can_edit_dsc"))):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    await create_audit_log(current_user, "DELETE_DSC", "dsc", dsc_id, existing)
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
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    movement = {
        "id": str(uuid.uuid4()),
        "movement_type": movement_data.movement_type,
        "person_name": movement_data.person_name,
        "timestamp": datetime.now(IST).isoformat(),
        "notes": movement_data.notes,
        "recorded_by": current_user.full_name
    }
    movement_log = existing.get("movement_log", [])
    movement_log.append(movement)
    await db.dsc_register.update_one(
        {"id": dsc_id},
        {"$set": {
            "current_status": movement_data.movement_type,
            "current_location": "with_company" if movement_data.movement_type == "IN" else "taken_by_client",
            "movement_log": movement_log
        }}
    )
    await create_audit_log(current_user, "UPDATE_DSC", "dsc", dsc_id, existing, {"movement_log": movement_log})
    return {"message": f"DSC marked as {movement_data.movement_type}", "movement": movement}


@api_router.put("/dsc/{dsc_id}/movement/{movement_id}")
async def update_dsc_movement(
    dsc_id: str,
    movement_id: str,
    update_data: MovementUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="DSC not found")
    movement_log = existing.get("movement_log", [])
    movement_found = False
    for i, movement in enumerate(movement_log):
        if movement.get("id") == movement_id:
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
    new_status = movement_log[-1]["movement_type"] if movement_log else "IN"
    await db.dsc_register.update_one(
        {"id": dsc_id},
        {"$set": {"current_status": new_status, "movement_log": movement_log}}
    )
    await create_audit_log(current_user, "UPDATE_DSC", "dsc", dsc_id, existing, {"movement_log": movement_log})
    return {"message": "Movement updated successfully", "movement_log": movement_log}


# ==============================================================
# DOCUMENT REGISTER ROUTES
# ==============================================================

@api_router.post("/documents", response_model=Document)
async def create_document(
    document_data: DocumentCreate,
    current_user: User = Depends(get_current_user)
):
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": doc_id,
        **document_data.model_dump(),
        "uploaded_by": current_user.id,
        "current_status": "IN",
        "movement_log": [],
        "is_active": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    if doc.get("issue_date") and isinstance(doc["issue_date"], datetime):
        doc["issue_date"] = doc["issue_date"].isoformat()
    if doc.get("valid_upto") and isinstance(doc["valid_upto"], datetime):
        doc["valid_upto"] = doc["valid_upto"].isoformat()
    await db.documents.insert_one(doc)
    return Document(**{**doc, "created_at": now, "updated_at": now})


@api_router.get("/documents", response_model=List[Document])
async def get_documents(current_user: User = Depends(check_permission("can_view_documents"))):
    documents = await db.documents.find({}, {"_id": 0}).to_list(1000)
    for d in documents:
        for field in ("created_at", "updated_at", "issue_date", "valid_upto"):
            if d.get(field) and isinstance(d[field], str):
                try:
                    d[field] = datetime.fromisoformat(d[field])
                except Exception:
                    pass
    return documents


@api_router.put("/documents/{document_id}", response_model=Document)
async def update_document(
    document_id: str,
    document_data: DocumentCreate,
    current_user: User = Depends(check_permission("can_edit_documents"))
):
    existing = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")
    update_data = document_data.model_dump()
    if update_data.get("issue_date") and isinstance(update_data["issue_date"], datetime):
        update_data["issue_date"] = update_data["issue_date"].isoformat()
    if update_data.get("valid_upto") and isinstance(update_data["valid_upto"], datetime):
        update_data["valid_upto"] = update_data["valid_upto"].isoformat()
    await db.documents.update_one({"id": document_id}, {"$set": update_data})
    await create_audit_log(current_user, "UPDATE_DOCUMENT", "document", document_id, existing, update_data)
    updated = await db.documents.find_one({"id": document_id}, {"_id": 0})
    for field in ("created_at", "updated_at", "issue_date", "valid_upto"):
        if updated.get(field) and isinstance(updated[field], str):
            try:
                updated[field] = datetime.fromisoformat(updated[field])
            except Exception:
                pass
    return Document(**updated)


@api_router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(check_permission("can_edit_documents"))
):
    existing = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")
    await create_audit_log(current_user, "DELETE_DOCUMENT", "document", document_id, existing)
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
        "timestamp": datetime.now(IST).isoformat(),
        "notes": movement_data.notes,
        "recorded_by": current_user.full_name
    }
    movement_log = document.get("movement_log", [])
    movement_log.append(movement)
    await db.documents.update_one(
        {"id": document_id},
        {"$set": {"current_status": movement_data.movement_type, "movement_log": movement_log}}
    )
    await create_audit_log(current_user, "UPDATE_DOCUMENT", "document", document_id, document, {"movement_log": movement_log})
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
    new_status = movement_log[-1]["movement_type"] if movement_log else "IN"
    await db.documents.update_one(
        {"id": document_id},
        {"$set": {"current_status": new_status, "movement_log": movement_log}}
    )
    await create_audit_log(current_user, "UPDATE_DOCUMENT", "document", document_id, document, {"movement_log": movement_log})
    return {"message": "Movement updated successfully"}


# ==============================================================
# DUE DATE ROUTES
# ==============================================================

COMPLIANCE_RULES = [
    {"keywords": ["gstr-1", "gstr1", "outward supply"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-3b", "gstr3b", "summary return"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-9", "annual return gst"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-4", "composition"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-7", "tds return gst"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-8", "tcs statement"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-5", "non-resident"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-6", "isd return"], "category": "GST", "department": "GST"},
    {"keywords": ["gstr-10", "final return"], "category": "GST", "department": "GST"},
    {"keywords": ["gst", "goods and service"], "category": "GST", "department": "GST"},
    {"keywords": ["itr", "income tax return"], "category": "Income Tax", "department": "IT"},
    {"keywords": ["advance tax", "advance income tax"], "category": "Income Tax", "department": "IT"},
    {"keywords": ["tax audit", "form 3ca", "form 3cb"], "category": "Audit", "department": "IT"},
    {"keywords": ["form 16", "form 26as"], "category": "Income Tax", "department": "IT"},
    {"keywords": ["income tax", "direct tax"], "category": "Income Tax", "department": "IT"},
    {"keywords": ["tds", "tax deducted at source", "form 24q", "form 26q", "form 27q"], "category": "TDS", "department": "TDS"},
    {"keywords": ["tcs", "tax collected at source"], "category": "TDS", "department": "TDS"},
    {"keywords": ["challan 281"], "category": "TDS", "department": "TDS"},
    {"keywords": ["mgt-7", "annual return roc"], "category": "ROC", "department": "ROC"},
    {"keywords": ["aoc-4", "financial statement"], "category": "ROC", "department": "ROC"},
    {"keywords": ["dir-3", "director kyc", "din kyc"], "category": "ROC", "department": "ROC"},
    {"keywords": ["dir-8", "disqualification"], "category": "ROC", "department": "ROC"},
    {"keywords": ["dir-12", "appointment", "resignation of director"], "category": "ROC", "department": "ROC"},
    {"keywords": ["mbp-1", "disclosure of interest"], "category": "ROC", "department": "ROC"},
    {"keywords": ["agm", "annual general meeting"], "category": "ROC", "department": "ROC"},
    {"keywords": ["dpt-3", "return of deposits"], "category": "ROC", "department": "ROC"},
    {"keywords": ["msme-1", "msme samadhaan"], "category": "ROC", "department": "MSME"},
    {"keywords": ["pas-6", "reconciliation of share"], "category": "ROC", "department": "ROC"},
    {"keywords": ["roc", "mca", "companies act", "registrar of companies"], "category": "ROC", "department": "ROC"},
    {"keywords": ["msme"], "category": "Other", "department": "MSME"},
    {"keywords": ["statutory audit", "internal audit", "audit report"], "category": "Audit", "department": "ACC"},
    {"keywords": ["adt-1", "appointment of auditor"], "category": "Audit", "department": "ROC"},
    {"keywords": ["trademark", "tm renewal"], "category": "Trademark", "department": "TM"},
    {"keywords": ["fema", "foreign exchange", "fdi"], "category": "FEMA", "department": "FEMA"},
    {"keywords": ["rera", "real estate"], "category": "RERA", "department": "OTHER"},
    {"keywords": ["pf", "provident fund", "epfo"], "category": "Other", "department": "ACC"},
    {"keywords": ["esi", "esic"], "category": "Other", "department": "ACC"},
    {"keywords": ["board meeting", "minute book"], "category": "ROC", "department": "ROC"},
]

MONTH_MAP = {
    "january": 1, "jan": 1, "february": 2, "feb": 2,
    "march": 3, "mar": 3, "april": 4, "apr": 4,
    "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}


def parse_date_from_text(text: str):
    text = text.strip()
    now = datetime.now()
    year = now.year
    m = re.search(
        r'\b(\d{1,2})(?:st|nd|rd|th)?\s+'
        r'(january|february|march|april|may|june|july|august|september|october|november|december)'
        r'\s+(\d{4})\b', text, re.IGNORECASE)
    if m:
        try:
            return date(int(m.group(3)), MONTH_MAP[m.group(2).lower()], int(m.group(1))).isoformat()
        except Exception:
            pass
    m = re.search(
        r'\b(january|february|march|april|may|june|july|august|september|october|november|december)'
        r'\s+(\d{1,2}),?\s+(\d{4})\b', text, re.IGNORECASE)
    if m:
        try:
            return date(int(m.group(3)), MONTH_MAP[m.group(1).lower()], int(m.group(2))).isoformat()
        except Exception:
            pass
    m = re.search(r'\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b', text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        except Exception:
            pass
    m = re.search(r'\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b', text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except Exception:
            pass
    m = re.search(
        r'\b(\d{1,2})(?:st|nd|rd|th)?\s+'
        r'(january|february|march|april|may|june|july|august|september|october|november|december)\b',
        text, re.IGNORECASE)
    if m:
        try:
            mo = MONTH_MAP[m.group(2).lower()]
            d_val = int(m.group(1))
            target = date(year, mo, d_val)
            if target < date.today():
                target = date(year + 1, mo, d_val)
            return target.isoformat()
        except Exception:
            pass
    m = re.search(r'within\s+(\d+)\s+days?', text, re.IGNORECASE)
    if m:
        try:
            return (date.today() + timedelta(days=int(m.group(1)))).isoformat()
        except Exception:
            pass
    return None


def classify_compliance(line: str):
    lower = line.lower()
    for rule in COMPLIANCE_RULES:
        if any(kw in lower for kw in rule["keywords"]):
            return {"category": rule["category"], "department": rule["department"]}
    return {"category": "Other", "department": "OTHER"}


def extract_title(line: str) -> str:
    title = re.sub(r'\s+', ' ', line).strip()
    title = re.sub(r'^[\-\*\•\|]+\s*', '', title)
    if len(title) > 80:
        title = title[:77].rsplit(' ', 1)[0] + '...'
    return title or "Compliance Task"


def parse_compliance_dates(raw_text: str):
    results = []
    seen = set()
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    for i, line in enumerate(lines):
        if "|" not in line:
            continue
        cols = [c.strip() for c in line.split("|") if c.strip()]
        if len(cols) < 2:
            continue
        date_val = None
        date_col_idx = None
        for idx, col in enumerate(cols):
            d = parse_date_from_text(col)
            if d:
                date_col_idx = idx
                date_val = d
                break
        if not date_val and i + 1 < len(lines):
            date_val = parse_date_from_text(lines[i + 1])
        if not date_val:
            continue
        title_col = next((c for idx, c in enumerate(cols) if idx != date_col_idx and len(c) > 3), None)
        if not title_col:
            continue
        title = extract_title(title_col)
        if title.lower() in seen:
            continue
        seen.add(title.lower())
        clf = classify_compliance(line)
        results.append({
            "title": title,
            "due_date": date_val,
            "category": clf["category"],
            "department": clf["department"],
            "description": title_col[:300],
            "status": "pending",
        })
    results.sort(key=lambda x: x.get("due_date", "9999-12-31"))
    return results


@api_router.post("/duedates/extract-from-file")
async def extract_due_dates_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    filename = (file.filename or "").lower()
    content_type = file.content_type or ""
    file_bytes = await file.read()
    raw_text = ""
    try:
        if content_type.startswith("image/") or filename.endswith((".jpg", ".jpeg", ".png", ".webp", ".bmp")):
            raise HTTPException(
                status_code=400,
                detail="Image upload is not supported on this server. Please upload a PDF or DOCX file instead."
            )
        elif content_type == "application/pdf" or filename.endswith(".pdf"):
            import pdfplumber
            parts = []
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        parts.append(t)
                    for table in page.extract_tables():
                        for row in table:
                            if row:
                                parts.append(" | ".join(str(c or "") for c in row))
            raw_text = "\n".join(parts)
        elif filename.endswith((".docx", ".doc")):
            from docx import Document as DocxDocument
            doc = DocxDocument(BytesIO(file_bytes))
            parts = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
            raw_text = "\n".join(parts)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or DOCX.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File extraction error: {e}")
        raise HTTPException(status_code=422, detail=f"Could not read file: {str(e)}")
    if not raw_text or len(raw_text.strip()) < 20:
        raise HTTPException(status_code=422, detail="No readable text found.")
    extracted = parse_compliance_dates(raw_text)
    if not extracted:
        raise HTTPException(status_code=404, detail="No compliance dates detected in this document.")
    return {"extracted": extracted, "count": len(extracted)}


@api_router.post("/duedates", response_model=DueDate)
async def create_due_date(
    due_date_data: DueDateCreate,
    current_user: User = Depends(get_current_user)
):
    if not due_date_data.department:
        raise HTTPException(status_code=400, detail="Department required")
    dd_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": dd_id,
        **due_date_data.model_dump(),
        "created_by": current_user.id,
        "created_at": now.isoformat(),
        "due_date": due_date_data.due_date.isoformat(),
    }
    await db.due_dates.insert_one(doc)
    return DueDate(**{**doc, "created_at": now, "due_date": due_date_data.due_date})


@api_router.get("/duedates", response_model=List[DueDate])
async def get_due_dates(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.role == "admin":
        pass
    elif current_user.role == "manager":
        if current_user.departments:
            query["department"] = {"$in": current_user.departments}
    else:
        permissions = get_user_permissions(current_user)
        if not permissions.get("can_view_all_duedates", False):
            if current_user.departments:
                query["department"] = {"$in": current_user.departments}
            else:
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
    days: int = Query(30),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(IST)
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
        dd_date = (
            datetime.fromisoformat(dd["due_date"])
            if isinstance(dd["due_date"], str)
            else dd["due_date"]
        )
        if dd_date.tzinfo is None:
            dd_date = dd_date.replace(tzinfo=timezone.utc)
        now_utc = now.astimezone(timezone.utc)
        future_utc = future_date.astimezone(timezone.utc)
        if now_utc <= dd_date <= future_utc:
            dd["due_date"] = dd_date
            dd["days_remaining"] = (dd_date - now_utc).days
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
    await db.due_dates.update_one({"id": due_date_id}, {"$set": update_data})
    await create_audit_log(current_user, "UPDATE_DUE_DATE", "duedate", due_date_id, existing, update_data)
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
    await create_audit_log(current_user, "DELETE_DUE_DATE", "duedate", due_date_id, existing)
    result = await db.due_dates.delete_one({"id": due_date_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Due date not found")
    return {"message": "Due date deleted successfully"}


@api_router.get("/leads/meta/services")
async def get_leads_services_meta(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        perms = get_user_permissions(current_user)
        if not perms.get("can_view_all_leads", False):
            raise HTTPException(status_code=403, detail="Leads access not permitted")
    services = await db.clients.distinct("services")
    services = [s for s in services if s and isinstance(s, str)]
    return {"services": list(set(services))}


# ==============================================================
# REPORTS ROUTES
# ==============================================================

@api_router.get("/reports/efficiency")
async def get_efficiency_report(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    target_user_id = user_id or current_user.id
    if target_user_id != current_user.id:
        perms = get_user_permissions(current_user)
        if current_user.role != "admin" and not perms.get("can_view_reports", False):
            raise HTTPException(status_code=403, detail="You do not have permission to view reports")
        if current_user.role != "admin":
            allowed_users = perms.get("view_other_reports", [])
            if target_user_id not in allowed_users:
                raise HTTPException(status_code=403, detail="Not authorized to view other users' reports")
    logs = await db.activity_logs.find(
        {"user_id": target_user_id}, {"_id": 0}
    ).sort("date", -1).limit(30).to_list(100)
    total_screen_time = sum(l.get("screen_time_minutes", 0) for l in logs)
    total_tasks_completed = sum(l.get("tasks_completed", 0) for l in logs)
    target_user_doc = await db.users.find_one({"id": target_user_id}, {"_id": 0, "password": 0})
    user_info = {
        "id": target_user_id,
        "full_name": target_user_doc.get("full_name", "Unknown") if target_user_doc else "Unknown"
    }
    return {
        "user_id": target_user_id,
        "user": user_info,
        "total_screen_time": total_screen_time,
        "total_tasks_completed": total_tasks_completed,
        "days_logged": len(logs)
    }


@api_router.get("/reports/export")
async def export_reports(
    format: str = "csv",
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    perms = get_user_permissions(current_user)
    if current_user.role != "admin" and not perms.get("can_download_reports", False):
        raise HTTPException(status_code=403, detail="You do not have permission to download reports")
    target_user_id = user_id or current_user.id
    if target_user_id != current_user.id and current_user.role != "admin":
        allowed_users = perms.get("view_other_reports", [])
        if target_user_id not in allowed_users:
            raise HTTPException(status_code=403, detail="Not authorized to access other users' reports")
    logs = await db.activity_logs.find({"user_id": target_user_id}, {"_id": 0}).to_list(100)
    total_screen_time = sum(l.get("screen_time_minutes", 0) for l in logs)
    total_tasks_completed = sum(l.get("tasks_completed", 0) for l in logs)
    report = {
        "user_id": target_user_id,
        "total_screen_time": total_screen_time,
        "total_tasks_completed": total_tasks_completed,
        "days_logged": len(logs)
    }
    if format == "csv":
        output = StringIO()
        def sanitize_csv_value(val):
            val_str = str(val)
            if val_str and val_str[0] in ['=', '+', '-', '@']:
                return f"'{val_str}"
            return val_str
        writer = csv.writer(output)
        writer.writerow(["User ID", "Screen Time", "Tasks Completed", "Days Logged"])
        writer.writerow([
            sanitize_csv_value(report["user_id"]),
            sanitize_csv_value(report["total_screen_time"]),
            sanitize_csv_value(report["total_tasks_completed"]),
            sanitize_csv_value(report["days_logged"])
        ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=efficiency_report_{target_user_id}.csv"}
        )
    elif format == "pdf":
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        pdf.cell(200, 10, txt="Efficiency Report", ln=1, align="C")
        pdf.ln(10)
        pdf.multi_cell(0, 8, f"User ID: {report['user_id']}")
        pdf.multi_cell(0, 8, f"Screen Time: {report['total_screen_time']} minutes")
        pdf.multi_cell(0, 8, f"Tasks Completed: {report['total_tasks_completed']}")
        pdf.multi_cell(0, 8, f"Days Logged: {report['days_logged']}")
        pdf_output = BytesIO()
        pdf_output.write(pdf.output(dest='S').encode('latin1'))
        pdf_output.seek(0)
        return StreamingResponse(
            pdf_output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=efficiency_report_{target_user_id}.pdf"}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid format")


@api_router.get("/reports/performance-rankings", response_model=List[PerformanceMetric])
async def get_performance_rankings(
    period: str = Query("monthly", enum=["weekly", "monthly", "all_time"]),
    current_user: User = Depends(get_current_user)
):
    global rankings_cache, rankings_cache_time
    cache_key = f"rankings_{period}"
    if (
        cache_key in rankings_cache and
        cache_key in rankings_cache_time and
        (datetime.now(timezone.utc) - rankings_cache_time[cache_key]).total_seconds() < 300
    ):
        return rankings_cache[cache_key]
    now = datetime.now(IST)
    if period == "weekly":
        start_date = now - timedelta(days=7)
        expected_working_days = 5
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        expected_working_days = 22
    else:
        start_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        months = max((now - start_date).days // 30, 1)
        expected_working_days = max(22, months * 22)
    end_date_str = now.strftime("%Y-%m-%d")
    start_date_str = start_date.strftime("%Y-%m-%d")
    users = await db.users.find(
        {"role": {"$ne": "admin"}},
        {"id": 1, "full_name": 1, "profile_picture": 1}
    ).to_list(100)
    rankings = []
    for user in users:
        uid = user["id"]
        att_records = await db.attendance.find(
            {"user_id": uid, "date": {"$gte": start_date_str, "$lte": end_date_str}},
            {"_id": 0, "duration_minutes": 1, "is_late": 1}
        ).to_list(1000)
        days_present = len(att_records)
        total_minutes = sum(r.get("duration_minutes", 0) or 0 for r in att_records)
        total_hours = round(total_minutes / 60, 1)
        attendance_percent = round((days_present / expected_working_days) * 100, 1) if expected_working_days else 0
        timely_days = len([r for r in att_records if not r.get("is_late", False)])
        timely_punchin_percent = round((timely_days / days_present) * 100, 1) if days_present else 0
        tasks_assigned = await db.tasks.count_documents({"assigned_to": uid, "created_at": {"$gte": start_date}})
        completed_tasks = await db.tasks.count_documents({
            "assigned_to": uid,
            "status": "completed",
            "$or": [
                {"completed_at": {"$gte": start_date}},
                {"updated_at": {"$gte": start_date}}
            ]
        })
        completed_todos = await db.todos.count_documents({
            "user_id": uid, "is_completed": True, "completed_at": {"$gte": start_date}
        })
        total_completed = completed_tasks + completed_todos
        task_completion_percent = round((total_completed / tasks_assigned) * 100, 1) if tasks_assigned else 0
        todos = await db.todos.find({"user_id": uid, "created_at": {"$gte": start_date}}).to_list(500)
        completed_ontime = 0
        for t in todos:
            if t.get("is_completed"):
                due = safe_dt(t.get("due_date"))
                completed_at = safe_dt(t.get("completed_at"))
                if due and completed_at and completed_at <= due:
                    completed_ontime += 1
        todo_ontime_percent = round((completed_ontime / len(todos)) * 100, 1) if todos else 0
        safe_hours_ratio = min((total_hours / 180), 1) if total_hours else 0
        score = (
            float(attendance_percent or 0) * 0.25 +
            safe_hours_ratio * 100 * 0.20 +
            float(task_completion_percent or 0) * 0.25 +
            float(todo_ontime_percent or 0) * 0.15 +
            float(timely_punchin_percent or 0) * 0.15
        )
        overall_score = round(min(score, 100), 1)
        badge = "⭐ Star Performer" if overall_score >= 95 else "🏆 Top Performer" if overall_score >= 85 else "Good Performer"
        rankings.append(
            PerformanceMetric(
                user_id=str(uid),
                user_name=str(user.get("full_name", "Unknown")),
                profile_picture=user.get("profile_picture"),
                attendance_percent=float(attendance_percent or 0),
                total_hours=float(total_hours or 0),
                task_completion_percent=float(task_completion_percent or 0),
                todo_ontime_percent=float(todo_ontime_percent or 0),
                timely_punchin_percent=float(timely_punchin_percent or 0),
                overall_score=float(overall_score or 0),
                badge=str(badge)
            )
        )
    rankings.sort(key=lambda x: x.overall_score, reverse=True)
    for i, r in enumerate(rankings):
        r.rank = i + 1
    rankings_cache[cache_key] = rankings
    rankings_cache_time[cache_key] = datetime.now(timezone.utc)
    return rankings


# ==============================================================
# CLIENT ROUTES
# ==============================================================

@api_router.post("/master/import-master-preview")
async def import_master_data_preview(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Administrative clearance required for Master Data access.")
    filename = file.filename.lower()
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel formats (.xlsx, .xls) supported.")
    try:
        content = await file.read()
        excel = pd.ExcelFile(BytesIO(content))
        parsed_blueprint = {}
        total_vectors = 0
        for sheet_name in excel.sheet_names:
            df = pd.read_excel(excel, sheet_name=sheet_name)
            df = df.fillna("")
            records = df.to_dict(orient="records")
            parsed_blueprint[sheet_name] = records
            total_vectors += len(records)
        return {
            "status": "Ready for Audit",
            "message": f"Detected {len(excel.sheet_names)} operational layers with {total_vectors} vectors.",
            "sheets_found": excel.sheet_names,
            "data": parsed_blueprint
        }
    except Exception as e:
        logger.error(f"Blueprint Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Excel parse failure: {str(e)}")


@api_router.post("/master/sync-sheets")
async def sync_master_sheets(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Master Data clearance level 5 required.")
    try:
        content = await file.read()
        excel = pd.ExcelFile(BytesIO(content))
        sync_results = {"clients": 0, "compliance": 0, "staff": 0}
        now_iso = datetime.now(timezone.utc).isoformat()
        for sheet in excel.sheet_names:
            df = pd.read_excel(excel, sheet_name=sheet).fillna("")
            records = df.to_dict(orient="records")
            sheet_type = sheet.lower()
            if "client" in sheet_type:
                for rec in records:
                    await db.clients.update_one(
                        {"company_name": str(rec.get("company_name", "")).strip()},
                        {"$set": {**rec, "id": str(uuid.uuid4()) if "id" not in rec else rec["id"],
                                  "created_by": current_user.id, "updated_at": now_iso}},
                        upsert=True
                    )
                    sync_results["clients"] += 1
            elif "due" in sheet_type or "compliance" in sheet_type:
                for rec in records:
                    await db.due_dates.insert_one({
                        **rec, "id": str(uuid.uuid4()),
                        "created_by": current_user.id,
                        "created_at": now_iso, "status": "pending"
                    })
                    sync_results["compliance"] += 1
            elif "staff" in sheet_type or "user" in sheet_type:
                for rec in records:
                    await db.users.update_one(
                        {"email": rec.get("email")},
                        {"$set": {**rec, "id": str(uuid.uuid4()), "is_active": True}},
                        upsert=True
                    )
                    sync_results["staff"] += 1
        await create_audit_log(
            current_user=current_user,
            action="GLOBAL_MASTER_SYNC",
            module="master_data",
            record_id="multi_sheet_payload",
            new_data=sync_results
        )
        return {"message": "Global Master Sync Successfully Executed", "telemetry": sync_results}
    except Exception as e:
        logger.error(f"Sync Failure: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Database synchronization failed: {str(e)}")


@api_router.post("/clients/parse-mds-excel")
async def parse_mds_excel_for_client_form(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    filename = file.filename.lower()
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx / .xls) are supported.")
    try:
        content = await file.read()
        excel = pd.ExcelFile(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not open Excel file: {str(e)}")

    def clean_email(raw: str) -> str:
        if not raw:
            return ""
        cleaned = raw.replace("[at]", "@").replace("[dot]", ".").strip()
        return cleaned if "@" in cleaned else ""

    def clean_phone(raw: str) -> str:
        digits = re.sub(r"\D", "", str(raw or ""))
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        return digits[:10] if len(digits) >= 10 else digits

    def detect_type(name: str) -> str:
        n = name.lower()
        if any(x in n for x in ["private limited", "pvt ltd", "pvt. ltd", "pvt limited"]):
            return "pvt_ltd"
        if any(x in n for x in ["limited liability partnership", "llp"]):
            return "llp"
        if any(x in n for x in [" ltd", " limited"]):
            return "pvt_ltd"
        if "partnership" in n:
            return "partnership"
        if "huf" in n:
            return "huf"
        if "trust" in n:
            return "trust"
        return "proprietor"

    def parse_date_local(raw: str) -> str:
        if not raw or str(raw).strip() in ("", "-", "N/A"):
            return ""
        try:
            return parser.parse(str(raw).strip()).strftime("%Y-%m-%d")
        except Exception:
            return ""

    company_info: dict = {}
    directors: list = []
    extra_notes_parts: list = []

    for sheet_name in excel.sheet_names:
        df = pd.read_excel(excel, sheet_name=sheet_name, header=None).fillna("")
        sheet_lower = sheet_name.lower().strip()
        if "master" in sheet_lower or "company" in sheet_lower or sheet_lower == "masterdata":
            for _, row in df.iterrows():
                key = str(row.iloc[0]).strip()
                value = str(row.iloc[1]).strip() if len(row) > 1 else ""
                if key and key not in ("", "nan") and value not in ("", "nan"):
                    company_info[key] = value
        elif "director" in sheet_lower or "signatory" in sheet_lower:
            rows_list = df.values.tolist()
            if len(rows_list) < 2:
                continue
            headers = [str(h).strip() for h in rows_list[1]]
            for row in rows_list[2:]:
                row_dict = {headers[i]: str(row[i]).strip() for i in range(len(headers))}
                name = row_dict.get("Name", "").strip()
                if not name or name in ("nan", ""):
                    continue
                din = row_dict.get("DIN/PAN", "") or row_dict.get("DIN", "")
                designation = row_dict.get("Designation", "")
                directors.append({
                    "name": name,
                    "designation": designation or "Director",
                    "email": None, "phone": None, "birthday": None,
                    "din": din if din not in ("nan", "-", "") else None,
                })
        else:
            rows_list = df.values.tolist()
            if len(rows_list) >= 2:
                cols = [str(c).strip() for c in rows_list[0]]
                data_rows = []
                for row in rows_list[1:]:
                    vals = [str(v).strip() for v in row]
                    if any(v not in ("", "nan", "-") for v in vals):
                        data_rows.append(dict(zip(cols, vals)))
                if data_rows:
                    extra_notes_parts.append(f"[{sheet_name}]")
                    for r in data_rows[:10]:
                        extra_notes_parts.append(
                            " | ".join(f"{k}: {v}" for k, v in r.items() if v not in ("", "nan", "-"))
                        )

    company_name = (company_info.get("Company Name") or company_info.get("company_name") or "").strip()
    raw_email = (company_info.get("Email Id") or company_info.get("Email") or company_info.get("email") or "")
    email = clean_email(raw_email)
    raw_phone = (company_info.get("Phone") or company_info.get("Mobile") or company_info.get("Contact") or "")
    phone = clean_phone(raw_phone)
    raw_doi = (company_info.get("Date of Incorporation") or company_info.get("Incorporation Date") or "")
    birthday = parse_date_local(raw_doi)
    client_type = detect_type(company_name)

    notes_lines = []
    for key, label in [
        ("CIN", "CIN"), ("Registration Number", "Reg No"),
        ("Registered Address", "Address"),
        ("Authorised Capital (Rs)", "Authorised Capital"),
        ("Paid up Capital (Rs)", "Paid-up Capital")
    ]:
        val = company_info.get(key, "")
        if val and val not in ("-", "nan"):
            notes_lines.append(f"{label}: {val}")
            
    if extra_notes_parts:
        notes_lines.append("\n".join(extra_notes_parts))
        
    notes = "\n".join(notes_lines)

    address = company_info.get("Registered Address", "")
    if address in ("-", "nan"):
        address = ""
    city = state = ""
    if address:
        parts = [p.strip() for p in address.split(",") if p.strip()]
        state = parts[-2] if len(parts) >= 2 else ""
        city = parts[-3] if len(parts) >= 3 else ""

    status_raw = company_info.get("Company Status", "Active").lower()
    status = "active" if "active" in status_raw else "inactive"

    return {
        "status": "ok",
        "company_name": company_name,
        "client_type": client_type,
        "email": email,
        "phone": phone,
        "birthday": birthday,
        "address": address,
        "city": city,
        "state": state,
        "services": [],
        "notes": notes,
        "status_value": status,
        "contact_persons": directors,
        "dsc_details": [],
        "assigned_to": "unassigned",
        "raw_company_info": company_info,
        "sheets_parsed": excel.sheet_names,
    }


@api_router.post("/clients", response_model=Client)
async def create_client(payload: dict, current_user: User = Depends(get_current_user)):
    try:
        client_data = ClientCreate(**{k: v for k, v in payload.items() if k in ClientCreate.model_fields})
        client_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        doc = {
            "id": client_id,
            **client_data.model_dump(),
            "created_by": current_user.id,
            "created_at": now.isoformat(),
        }
        
        extra_fields = {
            "address": payload.get("address", ""),
            "city": payload.get("city", ""),
            "state": payload.get("state", "")
        }
        for key, value in extra_fields.items():
            if value:
                doc[key] = value
                
        if doc.get("birthday") and isinstance(doc["birthday"], date):
            doc["birthday"] = doc["birthday"].isoformat()
        await db.clients.insert_one(doc)
        return Client(**{**doc, "created_at": now})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/clients", response_model=List[Client])
async def get_clients(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.role == "admin":
        query = {}
    elif current_user.role == "manager":
        team_ids = await get_team_user_ids(current_user.id)
        query = {"assigned_to": {"$in": team_ids + [current_user.id]}}
    else:
        permissions = get_user_permissions(current_user)
        if permissions.get("can_view_all_clients", False):
            query = {}
        else:
            extra_clients = permissions.get("assigned_clients", [])
            if extra_clients:
                query = {"$or": [{"assigned_to": current_user.id}, {"id": {"$in": extra_clients}}]}
            else:
                query = {"assigned_to": current_user.id}
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for c in clients:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
        if c.get("birthday") and isinstance(c["birthday"], str):
            c["birthday"] = date.fromisoformat(c["birthday"])
    return clients


@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, current_user: User = Depends(get_current_user)):
    client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Client not found")
    if current_user.role != "admin":
        is_assigned = client_doc.get("assigned_to") == current_user.id
        permissions = get_user_permissions(current_user)
        extra_clients = permissions.get("assigned_clients", [])
        if not is_assigned and client_id not in extra_clients:
            raise HTTPException(status_code=403, detail="Not authorized to view this client")
    if isinstance(client_doc.get("created_at"), str):
        client_doc["created_at"] = datetime.fromisoformat(client_doc["created_at"])
    if client_doc.get("birthday") and isinstance(client_doc["birthday"], str):
        client_doc["birthday"] = date.fromisoformat(client_doc["birthday"])
    return Client(**client_doc)


@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(
    client_id: str,
    client_data: ClientCreate,
    current_user: User = Depends(get_current_user)
):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    perms = get_user_permissions(current_user)
    if (current_user.role != "admin"
            and existing.get("assigned_to") != current_user.id
            and not perms.get("can_edit_clients", False)):
        raise HTTPException(status_code=403, detail="Not authorized to edit this client")
    update_data = client_data.model_dump()
    if update_data.get("birthday") and isinstance(update_data["birthday"], date):
        update_data["birthday"] = update_data["birthday"].isoformat()
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    await create_audit_log(current_user, "UPDATE_CLIENT", "client", client_id, existing, update_data)
    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if updated.get("birthday") and isinstance(updated["birthday"], str):
        updated["birthday"] = date.fromisoformat(updated["birthday"])
    return Client(**updated)


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    perms = get_user_permissions(current_user)
    if (current_user.role != "admin"
            and existing.get("assigned_to") != current_user.id
            and not perms.get("can_edit_clients", False)):
        raise HTTPException(status_code=403, detail="Not authorized to delete this client")
    await create_audit_log(current_user, "DELETE_CLIENT", "client", client_id, existing)
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted successfully"}


@api_router.post("/clients/{client_id}/send-birthday-email")
async def send_client_birthday_email(
    client_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Client not found")
    background_tasks.add_task(send_birthday_email, client_doc["email"], client_doc["company_name"])
    return {"message": "Birthday email queued for delivery"}


@api_router.get("/clients/upcoming-birthdays")
async def get_upcoming_birthdays(days: int = 7, current_user: User = Depends(get_current_user)):
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    today = date.today()
    upcoming = []
    for c in clients:
        if c.get("birthday"):
            bday = date.fromisoformat(c["birthday"]) if isinstance(c["birthday"], str) else c["birthday"]
            this_year_bday = bday.replace(year=today.year)
            if this_year_bday < today:
                this_year_bday = bday.replace(year=today.year + 1)
            days_until = (this_year_bday - today).days
            if 0 <= days_until <= days:
                c["days_until_birthday"] = days_until
                upcoming.append(c)
    return sorted(upcoming, key=lambda x: x["days_until_birthday"])


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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File reading failed: {str(e)}")
    df = df.dropna(how="all").reset_index(drop=True)
    created_clients = duplicate_clients = added_contacts = skipped_rows = invalid_rows = 0
    validation_errors = []
    current_client_id = None
    for idx, row in df.iterrows():
        try:
            row = {k: ("" if pd.isna(v) else str(v).strip()) for k, v in row.items()}
            company_name = row.get("company_name", "").strip()
            if company_name:
                safe_company = re.escape(company_name)
                user_id = current_user.id
                existing = await db.clients.find_one({
                    "created_by": user_id,
                    "company_name": {"$regex": f"^{safe_company}$", "$options": "i"}
                })
                if existing:
                    current_client_id = existing["id"]
                    duplicate_clients += 1
                    continue
                birthday = None
                if row.get("birthday"):
                    try:
                        birthday = parser.parse(row["birthday"]).date()
                    except Exception:
                        birthday = None
                services = [s.strip() for s in row.get("services", "").split(",") if s.strip()]
                contact_persons = []
                if row.get("contact_name_1"):
                    contact_persons.append({
                        "name": row.get("contact_name_1"),
                        "designation": row.get("contact_designation_1"),
                        "email": row.get("contact_email_1") or None,
                        "phone": row.get("contact_phone_1") or None,
                    })
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
                if client_doc.get("birthday") and isinstance(client_doc["birthday"], date):
                    client_doc["birthday"] = client_doc["birthday"].isoformat()
                await db.clients.insert_one(client_doc)
                current_client_id = client_doc["id"]
                created_clients += 1
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
        "validation_errors": validation_errors[:20]
    }


# ==============================================================
# DASHBOARD ROUTES
# ==============================================================

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    try:
        now = datetime.now(timezone.utc)
        now_ist = datetime.now(IST)

        task_query = {}
        if current_user.role != "admin":
            permissions = get_user_permissions(current_user)
            if not permissions.get("can_view_all_tasks", False):
                allowed_users = permissions.get("view_other_tasks", [])
                task_query["$or"] = [
                    {"assigned_to": current_user.id},
                    {"sub_assignees": current_user.id},
                    {"created_by": current_user.id},
                    {"assigned_to": {"$in": allowed_users}},
                ]
        tasks = await db.tasks.find(task_query, {"_id": 0}).to_list(1000)
        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t.get("status") == "completed"])
        pending_tasks = len([t for t in tasks if t.get("status") == "pending"])
        overdue_tasks = 0
        for task in tasks:
            if task.get("due_date") and task.get("status") != "completed":
                try:
                    raw_due = task["due_date"]
                    if isinstance(raw_due, str):
                        due_date = datetime.fromisoformat(raw_due)
                    elif isinstance(raw_due, datetime):
                        due_date = raw_due
                    else:
                        continue
                    if due_date.tzinfo is None:
                        due_date = due_date.replace(tzinfo=timezone.utc)
                    else:
                        due_date = due_date.astimezone(timezone.utc)
                    if due_date < now:
                        overdue_tasks += 1
                except Exception:
                    continue

        dsc_list = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
        total_dsc = len(dsc_list)
        expiring_dsc_count = 0
        expiring_dsc_list = []
        for dsc in dsc_list:
            try:
                raw_expiry = dsc.get("expiry_date")
                if isinstance(raw_expiry, str):
                    expiry_date = datetime.fromisoformat(raw_expiry)
                elif isinstance(raw_expiry, datetime):
                    expiry_date = raw_expiry
                else:
                    continue
                if expiry_date.tzinfo is None:
                    expiry_date = expiry_date.replace(tzinfo=timezone.utc)
                else:
                    expiry_date = expiry_date.astimezone(timezone.utc)
                days_left = (expiry_date - now).days
                if days_left <= 90:
                    expiring_dsc_count += 1
                    expiring_dsc_list.append({
                        "id": dsc.get("id"),
                        "holder_name": dsc.get("holder_name"),
                        "certificate_number": dsc.get("certificate_number", "N/A"),
                        "expiry_date": dsc.get("expiry_date"),
                        "days_left": days_left,
                        "status": "expired" if days_left < 0 else "expiring"
                    })
            except Exception:
                continue

        if current_user.role == "admin":
            client_query = {}
        elif current_user.role == "manager":
            team_ids = await get_team_user_ids(current_user.id)
            client_query = {"assigned_to": {"$in": team_ids + [current_user.id]}}
        else:
            client_query = {"assigned_to": current_user.id}
        clients = await db.clients.find(client_query, {"_id": 0}).to_list(1000)
        total_clients = len(clients)
        today = date.today()
        upcoming_birthdays = 0
        for c in clients:
            if c.get("birthday"):
                try:
                    bday = date.fromisoformat(c["birthday"]) if isinstance(c["birthday"], str) else c["birthday"]
                    this_year_bday = bday.replace(year=today.year)
                    if this_year_bday < today:
                        this_year_bday = bday.replace(year=today.year + 1)
                    if 0 <= (this_year_bday - today).days <= 7:
                        upcoming_birthdays += 1
                except Exception:
                    continue

        upcoming_due_dates_count = 0
        due_date_query = {"status": "pending"}
        if current_user.role != "admin" and current_user.departments:
            due_date_query["department"] = {"$in": current_user.departments}
        due_dates = await db.due_dates.find(due_date_query, {"_id": 0}).to_list(1000)
        for dd in due_dates:
            try:
                raw_dd = dd.get("due_date")
                if isinstance(raw_dd, str):
                    dd_date = datetime.fromisoformat(raw_dd)
                elif isinstance(raw_dd, datetime):
                    dd_date = raw_dd
                else:
                    continue
                if dd_date.tzinfo is None:
                    dd_date = dd_date.replace(tzinfo=timezone.utc)
                else:
                    dd_date = dd_date.astimezone(timezone.utc)
                if (dd_date - now).days <= 120:
                    upcoming_due_dates_count += 1
            except Exception:
                continue

        team_workload = []
        if current_user.role != "staff":
            users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
            for user in users:
                user_tasks = [t for t in tasks if t.get("assigned_to") == user["id"]]
                team_workload.append({
                    "user_id": user["id"],
                    "user_name": user["full_name"],
                    "total_tasks": len(user_tasks),
                    "pending_tasks": len([t for t in user_tasks if t.get("status") == "pending"]),
                    "completed_tasks": len([t for t in user_tasks if t.get("status") == "completed"])
                })

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
    except Exception as e:
        logger.error(f"Dashboard stats error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")


# ==========================================================
# STAFF ACTIVITY ROUTES
# ==========================================================

@api_router.post("/activity/log")
async def log_staff_activity(
    activity_data: StaffActivityCreate,
    current_user: User = Depends(get_current_user)
):
    activity = StaffActivityLog(user_id=current_user.id, **activity_data.model_dump())
    doc = activity.model_dump()
    doc["timestamp"] = datetime.now(IST)
    await db.staff_activity.insert_one(doc)
    return {"message": "Activity logged successfully"}


@api_router.get("/activity/summary")
async def get_activity_summary(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(check_permission("can_view_staff_activity"))
):
    if current_user.role == "staff":
        raise HTTPException(status_code=403, detail="Not allowed")
    query = {}
    if user_id:
        query["user_id"] = user_id
    if date_from or date_to:
        query["timestamp"] = {}
    if date_from:
        try:
            query["timestamp"]["$gte"] = datetime.fromisoformat(date_from)
        except Exception:
            pass
    if date_to:
        try:
            query["timestamp"]["$lte"] = datetime.fromisoformat(date_to)
        except Exception:
            pass
    activities = await db.staff_activity.find(query, {"_id": 0}).to_list(10000)
    user_summary = {}
    for activity in activities:
        uid = activity.get("user_id")
        if not uid:
            continue
        duration = activity.get("duration_seconds") or 0
        app_name = activity.get("app_name", "Unknown App")
        category = activity.get("category", "other")
        website = activity.get("website")
        idle = activity.get("idle", False)
        if uid not in user_summary:
            user_summary[uid] = {
                "user_id": uid,
                "total_duration": 0, "active_duration": 0, "idle_duration": 0,
                "apps": {}, "websites": {}, "categories": {}
            }
        user_summary[uid]["total_duration"] += duration
        if idle:
            user_summary[uid]["idle_duration"] += duration
        else:
            user_summary[uid]["active_duration"] += duration
        if app_name not in user_summary[uid]["apps"]:
            user_summary[uid]["apps"][app_name] = {"count": 0, "duration": 0}
        user_summary[uid]["apps"][app_name]["count"] += 1
        user_summary[uid]["apps"][app_name]["duration"] += duration
        if website:
            user_summary[uid]["websites"][website] = user_summary[uid]["websites"].get(website, 0) + duration
        user_summary[uid]["categories"][category] = user_summary[uid]["categories"].get(category, 0) + duration
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(200)
    user_map = {u.get("id"): u.get("full_name", "Unknown") for u in users if u.get("id")}
    result = []
    for uid, data in user_summary.items():
        data["user_name"] = user_map.get(uid, "Unknown")
        data["apps_list"] = sorted(
            [{"name": k, **v} for k, v in data["apps"].items()],
            key=lambda x: x["duration"], reverse=True
        )
        total_duration = data["total_duration"]
        productive_duration = data["categories"].get("productivity", 0)
        data["productivity_percent"] = (productive_duration / total_duration) * 100 if total_duration > 0 else 0
        result.append(data)

    intensity_map = {}
    radar_metrics = {}
    tool_chain_data = []
    for item in result:
        uid = item["user_id"]
        intensity_map[uid] = {"duration": item["total_duration"], "productivity_percent": item["productivity_percent"]}
        radar_metrics[uid] = {"productivity": item["productivity_percent"], "attendance": 75, "task_completion": 80}
        tool_chain_data.append({"user_id": uid, "top_apps": item.get("apps_list", [])[:3]})
    for item in result:
        uid = item["user_id"]
        item["intensityMap"] = intensity_map.get(uid, {})
        item["radarMetrics"] = radar_metrics.get(uid, {})
        item["toolChainData"] = next((t for t in tool_chain_data if t["user_id"] == uid), {})
        
    return result


@api_router.get("/activity/user/{user_id}")
async def get_user_activity(
    user_id: str,
    limit: int = 100,
    current_user: User = Depends(check_permission("can_view_staff_activity"))
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    activities = await db.staff_activity.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return activities


# ==============================================================
# REMINDER EMAIL + AUDIT LOG
# ==============================================================

@api_router.post("/send-pending-task-reminders")
async def send_pending_task_reminders(current_user: User = Depends(get_current_user)):
    perms = get_user_permissions(current_user)
    if current_user.role != "admin" and not perms.get("can_send_reminders", False):
        raise HTTPException(status_code=403, detail="Reminder permission required")
    tasks = await db.tasks.find({"status": {"$ne": "completed"}}, {"_id": 0}).to_list(1000)
    if not tasks:
        return {"message": "No pending tasks found", "emails_sent": 0, "emails_failed": []}
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
            sent = send_email(email, "Pending Task Reminder - TaskoSphere", body)
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


@api_router.get("/audit-logs")
async def get_audit_logs(
    module: Optional[str] = None,
    record_id: Optional[str] = None,
    action: Optional[str] = None,
    current_user: User = Depends(check_permission("can_view_audit_logs"))
):
    query = {}
    if module:
        query["module"] = module
    if record_id:
        query["record_id"] = record_id
    if action and action != "ALL":
        query["action"] = action
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(2000)
    logs = convert_objectids(logs)
    for log in logs:
        if isinstance(log.get("timestamp"), str):
            try:
                log["timestamp"] = datetime.fromisoformat(log["timestamp"])
            except Exception:
                pass
    return logs


# Internal daily reminder
async def send_pending_task_reminders_internal():
    tasks = await db.tasks.find({"status": {"$ne": "completed"}}, {"_id": 0}).to_list(1000)
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
            send_email(email, "Daily Pending Task Reminder - TaskoSphere", body)
        except Exception as e:
            logger.error(f"Auto reminder failed for {email}: {str(e)}")


async def _run_daily_reminder_job(today_str: str):
    global _last_reminder_date_cache
    try:
        setting = await db.system_settings.find_one({"key": "last_reminder_date"})
        db_last_date = setting["value"] if setting else None
        if db_last_date != today_str:
            logger.info("Auto daily reminder triggered at 10:00 AM IST")
            await send_pending_task_reminders_internal()
            await db.system_settings.update_one(
                {"key": "last_reminder_date"},
                {"$set": {"value": today_str}},
                upsert=True
            )
            cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
            await db.staff_activity.delete_many({"timestamp": {"$lt": cutoff}})
        _last_reminder_date_cache = today_str
    except Exception as e:
        logger.error(f"Auto daily reminder job failed: {e}")


@app.middleware("http")
async def auto_daily_reminder(request: Request, call_next):
    global _last_reminder_date_cache
    try:
        india_time = datetime.now(pytz.timezone("Asia/Kolkata"))
        today_str = india_time.date().isoformat()
        if india_time.hour >= 10 and _last_reminder_date_cache != today_str:
            _last_reminder_date_cache = today_str
            asyncio.ensure_future(_run_daily_reminder_job(today_str))
    except Exception as e:
        logger.error(f"Auto reminder middleware error: {e}")
    response = await call_next(request)
    return response


# ==============================================================
# HOLIDAY ROUTES
# ==============================================================

@api_router.get("/holidays", response_model=list[HolidayResponse])
async def get_holidays(current_user: User = Depends(get_current_user)):
    query = {} if current_user.role == "admin" else {"status": "confirmed"}
    holidays = await db.holidays.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return holidays


@api_router.post("/holidays", response_model=HolidayResponse)
async def create_holiday(
    holiday: HolidayCreate,
    current_user: User = Depends(check_permission("can_manage_settings"))
):
    holiday_dict = holiday.model_dump()
    holiday_dict["date"] = holiday.date.isoformat()
    holiday_dict["status"] = "confirmed"
    existing = await db.holidays.find_one({"date": holiday_dict["date"]})
    if existing:
        raise HTTPException(status_code=400, detail="Holiday already exists for this date")
    await db.holidays.insert_one(holiday_dict)
    return holiday_dict


@api_router.patch("/holidays/{holiday_date}/status")
async def update_holiday_status(
    holiday_date: str,
    data: dict,
    current_user: User = Depends(check_permission("can_manage_settings"))
):
    new_status = data.get("status")
    if new_status not in ["confirmed", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.holidays.update_one(
        {"date": holiday_date},
        {"$set": {"status": new_status, "updated_by": current_user.id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"message": f"Holiday marked as {new_status}"}


@api_router.delete("/holidays/{holiday_date}")
async def delete_holiday(
    holiday_date: str,
    current_user: User = Depends(check_permission("can_manage_settings"))
):
    result = await db.holidays.delete_one({"date": holiday_date})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"message": "Holiday removed"}


# ==============================================================
# EXCEPTION HANDLER
# ==============================================================

@app.exception_handler(Exception)
async def universal_exception_handler(request: Request, exc: Exception):
    logger.error(f"Error on {request.url.path}: {str(exc)}", exc_info=True)

    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "Unexpected server error",
            "path": request.url.path
        }
    )


# ==============================================================
# INCLUDE ROUTERS
# ==============================================================

api_router.include_router(telegram_router)
api_router.include_router(leads_router)
api_router.include_router(notification_router)
app.include_router(api_router)
