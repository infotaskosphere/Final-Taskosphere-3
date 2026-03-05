import os
import re
import csv
import uuid
import logging
import pytz
import asyncio
import calendar
import requests
import pandas as pd
from datetime import datetime, date, timezone, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from io import StringIO, BytesIO
from typing import List, Optional, Dict, Any
from dateutil import parser
logger = logging.getLogger(__name__)
# FastAPI
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Query, Request
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.gzip import GZipMiddleware
from passlib.context import CryptContext
# Validation
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, ValidationError
from bson import ObjectId
from dotenv import load_dotenv
# Backend Modules
import backend.models as models
from backend.models import (
    Token, User, UserCreate, UserLogin, UserPermissions,
    Todo, TodoCreate, Task, TaskCreate, BulkTaskCreate,
    Client, ClientCreate, MasterClientForm,
    Attendance, StaffActivityLog, StaffActivityCreate, PerformanceMetric,
    DueDate, DueDateCreate,
    DSC, DSCCreate, DSCListResponse, DSCMovementRequest, MovementUpdateRequest,
    Document, DocumentCreate, DocumentMovementRequest,
    DashboardStats, AuditLog,
    HolidayResponse, HolidayCreate,
    DEFAULT_ROLE_PERMISSIONS
)
from backend.dependencies import (
    db,
    client,
    get_current_user,
    create_access_token,
    check_permission,
    require_admin,
    require_manager_or_admin,
    verify_record_access,
    verify_client_access,
    # Matrix-aware permission helpers
    _get_perm,
    can_view_task,
    can_edit_task,
    can_delete_task,
    can_view_todo,
    can_edit_todo,
    can_view_client,
    can_edit_client,
    can_delete_client,
    can_view_report,
    can_download_report,
    can_view_attendance,
    can_view_activity,
    can_view_lead,
    can_edit_lead,
    can_delete_lead,
    can_manage_user,
    # Query builder helpers
    build_task_query,
    build_todo_query,
    build_client_query,
    build_attendance_query,
    build_report_query,
    get_team_user_ids,
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
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
# ====================== SECURITY CONFIG ===========================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# ====================== APP + FIXED CORS (MUST BE FIRST) ===========
app = FastAPI(title="Taskosphere Backend")
# === CRITICAL FIX: CORS MUST BE THE VERY FIRST MIDDLEWARE ===
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    expose_headers=["*"],
    max_age=3600,
)
# ====================== HEALTH + STARTUP (your original code) ======================
@app.get("/health")
async def health():
    return {"status": "ok", "cors": "configured correctly"}
# ====================== SECURITY & DB (your original) ======================
rankings_cache = {}
rankings_cache_time = {}
# ===================== HELPER FUNCTIONS =====================
def safe_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(IST) # Force IST
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=pytz.UTC).astimezone(IST)
        return dt
    except Exception:
        return None
    
def sanitize_user_data(users, current_user=None):
    # Detect if a single item was passed instead of a list
    is_single = False
    if not isinstance(users, list):
        users = [users]
        is_single = True
        
    sanitized = []
    for user in users:
        # Handle dictionary cases (results direct from MongoDB)
        if isinstance(user, dict):
            safe_user = {k: v for k, v in user.items() if k not in ["password", "_id"]}
            sanitized.append(safe_user)
        # Handle Object cases (Pydantic models)
        else:
            user_dict = user.model_dump() if hasattr(user, "model_dump") else vars(user)
            safe_user = {k: v for k, v in user_dict.items() if k not in ["password", "_id"]}
            sanitized.append(safe_user)
            
    # Return a single dictionary if they passed a single dictionary, else return the list
    return sanitized[0] if is_single else sanitized
def convert_objectids(data):
    """
    Recursively convert MongoDB ObjectId fields to string.
    """
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
async def create_audit_log(current_user: User, action: str, module: str, record_id: str, old_data: dict = None, new_data: dict = None):
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
   
async def calculate_expected_hours(start_date_str: str, end_date_str: str, shift_start: str = "10:30", shift_end: str = "19:00"):
    """
    Calculate target hours based on user's shift strings (HH:MM) and date range (YYYY-MM-DD).
    """
    try:
        start = date.fromisoformat(start_date_str)
        end = date.fromisoformat(end_date_str)
    except Exception:
        return 0
 
    if start > end:
        return 0
    # Calculate work hours per day from shift strings
    try:
        t1 = datetime.strptime(shift_start, "%H:%M")
        t2 = datetime.strptime(shift_end, "%H:%M")
        hrs_per_day = (t2 - t1).total_seconds() / 3600
    except Exception:
        hrs_per_day = 8.5 # Fallback to standard 10:30 - 19:00
    holidays_cursor = db.holidays.find({})
    holidays = [h["date"] for h in await holidays_cursor.to_list(length=None)]
 
    total_hours = 0
    current_date = start
    while current_date <= end:
        if current_date.weekday() < 5 and current_date.isoformat() not in holidays:
            total_hours += hrs_per_day
        current_date += timedelta(days=1)
 
    return round(total_hours, 2)
# --- NEW: HOLIDAY AUTOFETCH LOGIC ---
async def fetch_indian_holidays_task():
    """
    Background job to fetch holidays for the current month.
    Stores them with status='pending' for Admin approval.
    """
    try:
        now = datetime.now(IST)
        year = now.year
        month = now.month
     
        # Indian Public Holidays API (Nager.Date is free/reliable)
        url = f"https://date.nager.at/api/v3/PublicHolidays/{year}/IN"
        response = requests.get(url, timeout=10)
     
        if response.status_code == 200:
            external_holidays = response.json()
            count = 0
         
            for h in external_holidays:
                h_date_obj = datetime.strptime(h['date'], '%Y-%m-%d').date()
             
                # Only process holidays for the current month
                if h_date_obj.month == month:
                    date_str = h_date_obj.isoformat()
                 
                    # Check if already exists in your Mongo 'holidays' collection
                    existing = await db.holidays.find_one({"date": date_str})
                 
                    if not existing:
                        new_holiday = {
                            "date": date_str,
                            "name": h['localName'],
                            "status": "pending", # <--- CRITICAL: Set to pending for Admin review
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
# Runs at 12:05 AM on the 1st of every month
scheduler.add_job(lambda: asyncio.run(fetch_indian_holidays_task()), 'cron', day=1, hour=0, minute=5)
scheduler.start()
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
 await db.attendance.create_index(
  [("user_id", 1), ("date", 1)],
  unique=True
 )
# ✅ STEP 1 — ADD UNIQUE INDEX (VERY IMPORTANT)
 await db.clients.create_index(
  [("created_by", 1), ("company_name", 1)],
  unique=True
 )
# NEW: Holiday index for fast lookup
 await db.holidays.create_index("date", unique=True)
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
 <h1 style="color: #4F46E5; text-align: center;"> Happy Birthday! </h1>
 <p style="font-size: 16px; line-height: 1.6; color: #333;">
  Dear {client_name},
 </p>
 <p style="font-size: 16px; line-height: 1.6; color: #333;">
  On behalf of our entire team, we wish you a very Happy Birthday!
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
 # Use permission matrix query builder
 query = build_task_query(current_user)
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
#===========================================================
# AUTH ROUTES
#============================================================
@api_router.get("/system/time")
async def get_system_time():
    now = datetime.now(IST)
    return {
        "server_time": now.isoformat(),
        "display_time": now.strftime("%I:%M:%S %p"),
        "date": now.strftime("%Y-%m-%d")
    }
# ==========================================================
# TODO DASHBOARD (ROLE + PERMISSION BASED VISIBILITY)
# ==========================================================
@api_router.post("/todos", response_model=Todo)
async def create_todo(
 todo_data: TodoCreate,
 current_user: User = Depends(get_current_user)
):
 todo = Todo(
  user_id=current_user.id,
  **todo_data.model_dump()
 )
 doc = todo.model_dump()
 # Convert datetime fields to ISO string
 doc["created_at"] = doc["created_at"].isoformat()
 doc["updated_at"] = doc["updated_at"].isoformat()
 if doc.get("due_date"):
  doc["due_date"] = doc["due_date"].isoformat()
 result = await db.todos.insert_one(doc)
 # Return proper id from Mongo
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
 # Matrix: Admin → specific (view_other_todos) → ownership
 query = build_todo_query(current_user, target_user_id=user_id)
 todos = await db.todos.find(query).to_list(1000)
 # Convert ObjectId safely
 for t in todos:
  t["id"] = str(t["_id"])
  del t["_id"]
 return todos
@api_router.get("/dashboard/todo-overview")
async def get_todo_dashboard(current_user: User = Depends(get_current_user)):
 is_admin = current_user.role == "admin"
 # =========================
 # ADMIN VIEW (SEE ALL)
 # =========================
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
  return {
   "role": "admin",
   "grouped_todos": grouped_todos
  }
 # =========================
 # NON-ADMIN VIEW
 # Matrix: specific (view_other_todos) → ownership
 # =========================
 allowed_users = _get_perm(current_user, "view_other_todos", []) or []
 or_clauses = [{"user_id": current_user.id}]
 if allowed_users:
  or_clauses.append({"user_id": {"$in": allowed_users}})
 todos = await db.todos.find({"$or": or_clauses}).to_list(2000)
 for todo in todos:
  todo["_id"] = str(todo["_id"])
 return {
  "role": current_user.role,
  "todos": todos
 }
# ==========================================================
# PROMOTE TODO TO TASK (ADMIN + OWNER ONLY)
# ==========================================================
@api_router.post("/todos/{todo_id}/promote-to-task")
async def promote_todo(todo_id: str, current_user: User = Depends(get_current_user)):
 try:
  todo = await db.todos.find_one({"_id": ObjectId(todo_id)})
 except:
  raise HTTPException(status_code=400, detail="Invalid Todo ID")
 if not todo:
  raise HTTPException(status_code=404, detail="Todo not found")
 # Only creator or admin can promote
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
# Delete Todo Route
@api_router.delete("/todos/{todo_id}")
async def delete_todo(
 todo_id: str,
 current_user: User = Depends(get_current_user)
):
 try:
  obj_id = ObjectId(todo_id)
 except:
  raise HTTPException(status_code=400, detail="Invalid Todo ID")
 todo = await db.todos.find_one({"_id": obj_id})
 if not todo:
  raise HTTPException(status_code=404, detail="Todo not found")
 # Matrix: Admin OR owner
 if not can_edit_todo(current_user, todo):
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
 except:
  raise HTTPException(status_code=400, detail="Invalid Todo ID")
 if not todo:
  raise HTTPException(status_code=404, detail="Todo not found")
 # Matrix: Admin OR owner
 if not can_edit_todo(current_user, todo):
  raise HTTPException(status_code=403, detail="Not authorized")
 now = datetime.now(IST)
 if updates.get("is_completed") is True:
  updates["completed_at"] = now
 updates["updated_at"] = now
 await db.todos.update_one(
  {"_id": ObjectId(todo_id)},
  {"$set": updates}
 )
 return {"message": "Todo updated successfully"}
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    # Matrix: Admin OR can_manage_users
    if not can_manage_user(current_user):
        raise HTTPException(status_code=403, detail="Admin or user manager access required")
    
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user_data.password)
    
    role_val = user_data.role.value if hasattr(user_data.role, "value") else user_data.role
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
        "birthday": user_data.birthday.isoformat() if user_data.birthday else None,
        "telegram_id": user_data.telegram_id,
        "punch_in_time": user_data.punch_in_time or "10:30",
        "grace_time": user_data.grace_time or "00:15",
        "punch_out_time": user_data.punch_out_time or "19:00",
        "profile_picture": user_data.profile_picture,
        "is_active": user_data.is_active if user_data.is_active is not None else True,
        "permissions": user_data.permissions if user_data.permissions else default_permissions,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(new_user)
    access_token = create_access_token({"sub": user_id})
    new_user["password"] = None 
    
    return {"access_token": access_token, "token_type": "bearer", "user": new_user}
@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
 user = await db.users.find_one({"email": credentials.email})
 if not user or not verify_password(credentials.password, user["password"]):
  raise HTTPException(status_code=401, detail="Invalid email or password")
 user["permissions"] = user.get("permissions", UserPermissions().model_dump())
 if "created_at" in user and isinstance(user["created_at"], str):
  user["created_at"] = datetime.fromisoformat(user["created_at"])
 user_obj = User(**{k: v for k, v in user.items() if k != "password"})
 access_token = create_access_token({"sub": user_obj.id})
 return {"access_token": access_token, "token_type": "bearer", "user": user_obj}
        
@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
    
#============================================================
# USER MANAGEMENT (Consolidated GET, PUT, DELETE & PERMISSIONS)
#=============================================================

@api_router.get("/users")
async def get_users(current_user: User = Depends(require_admin)):
    """Fetch all users. Returns raw data so React Edit Form pre-fills correctly."""
    users_raw = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
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
    """Updates user profile data dynamically."""
    # Matrix: Admin OR can_manage_users
    if not can_manage_user(current_user):
        raise HTTPException(status_code=403, detail="Admin or user manager access required")

    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found.")

    # Comprehensive Whitelist matching UI Form
    allowed_fields = [
        "full_name", "email", "role", "departments", "phone",
        "birthday", "punch_in_time", "grace_time",
        "punch_out_time", "is_active", "profile_picture", "telegram_id"
    ]

    update_payload = {}
    for key in allowed_fields:
        if key in user_data:
            val = user_data[key]
            # Convert empty UI strings to None for DB consistency
            update_payload[key] = val if val != "" else None

    # Handle Password safely
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
    if current_user.role != "admin":
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
    # Matrix: Admin OR can_manage_users
    if not can_manage_user(current_user):
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
    """Updates user permissions using a raw dictionary to support arrays properly."""
    # Matrix: Admin only (permissions are sensitive — only admin should change them)
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
        
    old_permissions = existing.get("permissions", {})
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"permissions": permissions}}
    )
    
    await create_audit_log(
        current_user, "UPDATE_PERMISSIONS", "user", 
        record_id=user_id, old_data=old_permissions, new_data=permissions
    )
    return {"message": "Permissions updated successfully"}
#====================================================================================
# ATTENDANCE ROUTE - FIXED: punch_in and punch_out now correctly inside one function
#=====================================================================================
def get_real_client_ip(request: Request):
 # 1️⃣ Try Render / proxy header first
 x_forwarded_for = request.headers.get("x-forwarded-for")
 if x_forwarded_for:
  # First IP is the real client IP
  return x_forwarded_for.split(",")[0].strip()
 # 2️⃣ Fallback
 if request.client:
  return request.client.host
 return None
# ── UPDATE EXISTING /attendance ENDPOINT ───────────────────────────────
@api_router.post("/attendance")
async def handle_attendance(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    today_str = today.isoformat() # Standardize to string "YYYY-MM-DD"
    # FIX: Query using the string today_str to match database format
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
        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today_str},
            {
                "$set": {
                    "status": "present",
                    "punch_in": datetime.now(timezone.utc),
                    "leave_reason": None
                }
            },
            upsert=True
        )
        return {"message": "Punched in successfully"}
#=================PUNCH OUT==================================
    if action == "punch_out":
        if not attendance or not attendance.get("punch_in"):
            raise HTTPException(status_code=400, detail="Not punched in yet")
        if attendance.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out")
    
        punch_in_dt = attendance.get("punch_in")
        punch_out_dt = datetime.now(timezone.utc)
    
        # Calculate duration in minutes
        delta = punch_out_dt - punch_in_dt
        duration_minutes = int(delta.total_seconds() / 60)
        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today_str},
            {
                "$set": {
                    "punch_out": punch_out_dt,
                    "duration_minutes": duration_minutes
                }
            }
        )
        return {"message": "Punched out successfully", "duration": duration_minutes}
# ── MARK LEAVE TODAY ───────────────────────────────────────────────────
@api_router.post("/attendance/mark-leave-today")
async def mark_leave_today(current_user: User = Depends(get_current_user)):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    today_str = today.isoformat()
    # FIX: Query using today_str string
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
# ── GET TODAY ATTENDANCE ───────────────────────────────────────────────
@api_router.get("/attendance/today")
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    today_str = today.isoformat()
    # FIX: Query using today_str string
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
        return {
            "status": "absent",
            "punch_in": None,
            "punch_out": None,
            "leave_reason": None
        }
    if "status" not in attendance:
        attendance["status"] = (
            "present" if attendance.get("punch_in") else "absent"
        )
    return attendance
# ── APPLY LEAVE (DATE RANGE SUPPORT) ───────────────────────────────
@api_router.post("/attendance/apply-leave")
async def apply_leave(
 data: dict,
 current_user: User = Depends(get_current_user)
):
 try:
  from_date = datetime.fromisoformat(data["from_date"]).date()
  to_date = datetime.fromisoformat(data.get("to_date", data["from_date"])).date()
  reason = data.get("reason", "Leave Applied")
  if to_date < from_date:
   raise HTTPException(status_code=400, detail="Invalid date range")
  current = from_date
  while current <= to_date:
   await db.attendance.update_one(
    {
     "user_id": current_user.id,
     "date": current.isoformat()
    },
    {
     "$set": {
      "status": "leave",
      "leave_reason": reason,
      "punch_in": None,
      "punch_out": None
     }
    },
    upsert=True
   )
   current += timedelta(days=1)
  return {"message": "Leave applied successfully"}
 except Exception as e:
  raise HTTPException(status_code=400, detail=str(e))
# ====================== SHARED TOP / STAR PERFORMERS HELPER ======================
async def get_top_performers_data(
 period: str = "monthly",
 limit: int = 5,
 db = None
):
 """Single source of truth for both Dashboard Star Performers and Reports Top Performers"""
 now = datetime.now(IST)
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
# Task routes
@api_router.post("/tasks", response_model=Task)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user)
):
    # Initialize task with generated ID and ownership
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    # Create Task object
    task = Task(
        **task_data.model_dump(),
        id=task_id,
        created_by=current_user.id,
        created_at=now,
        updated_at=now
    )
    # Prepare document for MongoDB with ISO string conversion
    doc = task.model_dump()
    date_fields = ["created_at", "updated_at", "due_date", "recurrence_end_date"]
    for field in date_fields:
        if doc.get(field) and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    # Insert into database
    await db.tasks.insert_one(doc)
    # Notification logic for assigned users
    if task.assigned_to and task.assigned_to != current_user.id:
        await create_notification(
            user_id=task.assigned_to,
            title="New Task Assigned",
            message=f"You have been assigned task '{task.title}'",
            type="assignment"
        )
    
    # Audit logging
    await create_audit_log(
        current_user=current_user,
        action="CREATE_TASK",
        module="tasks",
        record_id=task_id,
        new_data={"title": task.title}
    )
    return task
@api_router.get("/tasks/{task_id}/comments")
async def get_task_comments(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    # Fetch task and exclude MongoDB internal _id
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Basic permission check: Admin or involved parties
    is_admin = getattr(current_user, "role", "").lower() == "admin"
    is_involved = (
        task.get("assigned_to") == current_user.id or
        task.get("created_by") == current_user.id
    )
    if not is_admin and not is_involved:
        raise HTTPException(
            status_code=403,
            detail="Unauthorized to view these comments"
        )
    return task.get("comments", [])
# =========================================================
# BULK CREATE TASKS
# =========================================================
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
 return {
  "message": "Tasks created successfully",
  "count": len(created_tasks)
 }
# =========================================================
# IMPORT TASKS FROM CSV
# =========================================================
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
# =========================================================
# GET TASKS (WITH CROSS-USER SUPPORT)
# =========================================================
@api_router.get("/tasks")
async def get_tasks(current_user: User = Depends(get_current_user)):
 # Build query using the 5-layer permission matrix
 base_query = build_task_query(current_user)
 # Exclude todo-type tasks regardless of permission
 if base_query:
  query = {"$and": [{"type": {"$ne": "todo"}}, base_query]}
 else:
  query = {"type": {"$ne": "todo"}}
 tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
 # Map user names
 user_ids = {
  task.get("assigned_to")
  for task in tasks if task.get("assigned_to")
 } | {
  task.get("created_by")
  for task in tasks if task.get("created_by")
 }
 users = await db.users.find(
  {"id": {"$in": list(user_ids)}},
  {"_id": 0, "password": 0}
 ).to_list(1000)
 user_map = {u["id"]: u["full_name"] for u in users}
 for task in tasks:
  task["created_at"] = safe_dt(task.get("created_at"))
  task["updated_at"] = safe_dt(task.get("updated_at"))
  task["due_date"] = safe_dt(task.get("due_date"))
  task["assigned_to_name"] = user_map.get(task.get("assigned_to"), "Unknown")
  task["created_by_name"] = user_map.get(task.get("created_by"), "Unknown")
 return tasks
# =========================================================
# GET SINGLE TASK (SECURE)
# =========================================================
@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
 task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
 if not task:
  raise HTTPException(status_code=404, detail="Task not found")
 # Matrix: Admin → can_view_all_tasks → view_other_tasks → ownership → deny
 if not can_view_task(current_user, task):
  raise HTTPException(status_code=403, detail="Not authorized to view this task")
 return Task(**task)
# =========================================================
# PATCH TASK (SECURE EDITING) - Fixes Dashboard & Task Page Errors
# =========================================================
@api_router.api_route("/tasks/{task_id}", methods=["PATCH", "PUT"], response_model=Task)
async def patch_task(
 task_id: str,
 updates: dict,
 current_user: User = Depends(get_current_user)
):
 existing_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
 if not existing_task:
  raise HTTPException(status_code=404, detail="Task not found")
 # Matrix: Admin → can_edit_tasks → ownership (created_by/assigned_to/sub_assignee) → deny
 if not can_edit_task(current_user, existing_task):
  raise HTTPException(status_code=403, detail="Unauthorized to modify this task")
 old_data = existing_task.copy()
 updates["updated_at"] = datetime.now(IST).isoformat()
 if updates.get("status") == "completed":
  updates["completed_at"] = datetime.now(IST).isoformat()
 await db.tasks.update_one({"id": task_id}, {"$set": updates})
 updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
 # 🔥 AUDIT LOGGING
 action_type = "TASK_STATUS_CHANGED" if "status" in updates and old_data.get("status") != updates.get("status") else "UPDATE_TASK"
 await create_audit_log(
  current_user=current_user,
  action=action_type,
  module="task",
  record_id=task_id,
  old_data=old_data,
  new_data=updates
 )
 return Task(**updated_task)
# =========================================================
# DELETE TASK (SECURE)
# =========================================================
@api_router.delete("/tasks/{task_id}")
async def delete_task(
 task_id: str,
 current_user: User = Depends(get_current_user)
):
 existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
 if not existing:
  raise HTTPException(status_code=404, detail="Task not found")
 # Matrix: Admin only OR task creator
 if not can_delete_task(current_user, existing):
  raise HTTPException(status_code=403, detail="Only Admin or the task creator can delete tasks.")
 await db.tasks.delete_one({"id": task_id})
 # 🔥 AUDIT LOG FOR DELETE
 await create_audit_log(
  current_user=current_user,
  action="DELETE_TASK",
  module="task",
  record_id=task_id,
  old_data=existing
 )
 return {"message": "Task deleted successfully"}
# =========================================================
# COMMENT ON TASK (SECURE)
# =========================================================
@api_router.post("/tasks/{task_id}/comments")
async def add_task_comment(
 task_id: str,
 comment_data: dict,
 current_user: User = Depends(get_current_user)
):
 task = await db.tasks.find_one({"id": task_id})
 if not task:
  raise HTTPException(status_code=404, detail="Task not found")
 # 🔒 COMMENT LOGIC: Only involved parties can comment
 is_involved = (
  current_user.role.lower() == "admin" or
  task.get("created_by") == current_user.id or
  task.get("assigned_to") == current_user.id or
  current_user.id in task.get("sub_assignees", [])
 )
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
# =========================================================
# EXPORT TASK AUDIT LOG PDF
# =========================================================
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
 if not logs:
  raise HTTPException(status_code=404, detail="No audit logs found")
 pdf = FPDF()
 pdf.set_auto_page_break(auto=True, margin=10)
 pdf.add_page()
 # ───────────────── HEADER ─────────────────
 pdf.set_font("Arial", "B", 16)
 pdf.cell(0, 10, "Task Lifecycle Report", ln=True, align="C")
 pdf.ln(5)
 # ───────────────── TASK SUMMARY ─────────────────
 pdf.set_font("Arial", "B", 12)
 pdf.cell(0, 8, "Task Information", ln=True)
 pdf.ln(3)
 pdf.set_font("Arial", size=11)
 pdf.multi_cell(0, 7, f"Title: {task.get('title', '-')}")
 pdf.multi_cell(0, 7, f"Description: {task.get('description', '-')}")
 pdf.multi_cell(0, 7, f"Assigned To: {task.get('assigned_to_name', task.get('assigned_to', '-'))}")
 pdf.multi_cell(0, 7, f"Created By: {task.get('created_by_name', task.get('created_by', '-'))}")
 pdf.multi_cell(0, 7, f"Created At: {task.get('created_at', '-')}")
 pdf.multi_cell(0, 7, f"Current Status: {task.get('status', '-')}")
 pdf.ln(8)
 # ───────────────── TIMELINE ─────────────────
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
  # ───── Handle different actions cleanly ─────
  if action == "TASK_STATUS_CHANGED":
   old_status = log.get("old_data", {}).get("status", "-")
   new_status = log.get("new_data", {}).get("status", "-")
   pdf.multi_cell(0, 6, f" Status changed: {old_status} → {new_status}")
  elif action == "TASK_COMPLETED":
   pdf.multi_cell(0, 6, " Task marked as completed.")
  elif action == "DELETE_TASK":
   pdf.multi_cell(0, 6, " Task was deleted.")
  elif action == "CREATE_TASK":
   pdf.multi_cell(0, 6, " Task was created.")
  elif action == "UPDATE_TASK":
   pdf.multi_cell(0, 6, " Task details updated.")
  # Optional: Show detailed diff if available
  if log.get("old_data") and log.get("new_data"):
   old_data = log.get("old_data")
   new_data = log.get("new_data")
   for key in new_data:
    old_val = old_data.get(key)
    new_val = new_data.get(key)
    if old_val != new_val:
     pdf.multi_cell(
      0,
      6,
      f" {key.replace('_',' ').title()}: {old_val} → {new_val}"
     )
  pdf.ln(3)
 # ───────────────── FOOTER INFO ─────────────────
 pdf.ln(5)
 pdf.set_font("Arial", "I", 8)
 pdf.multi_cell(
  0,
  5,
  f"Generated on {datetime.utcnow().strftime('%b %d, %Y %I:%M %p')} UTC"
 )
 output = BytesIO()
 output.write(pdf.output(dest="S").encode("latin1"))
 output.seek(0)
 return StreamingResponse(
  output,
  media_type="application/pdf",
  headers={
   "Content-Disposition": f"attachment; filename=task_lifecycle_{task_id}.pdf"
  }
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
 now = datetime.now(IST)
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
  "timestamp": datetime.now(IST).isoformat(),
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
  "timestamp": datetime.now(IST).isoformat(),
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
@api_router.get("/attendance/history", response_model=List[Attendance])
async def get_attendance_history(
 user_id: Optional[str] = None,
 current_user: User = Depends(get_current_user)
):
 """
 Matrix:
 - Admin → all records (or filter by user_id)
 - Universal: can_view_attendance → all records
 - Specific: user_id in view_other_attendance → that user's records
 - Ownership: own records only
 """
 query = build_attendance_query(current_user, target_user_id=user_id)
 attendance_list = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
 for attendance in attendance_list:
  attendance["punch_in"] = safe_dt(attendance.get("punch_in"))
  attendance["punch_out"] = safe_dt(attendance.get("punch_out"))
  if "status" not in attendance:
   attendance["status"] = (
    "present" if attendance.get("punch_in") else "absent"
   )
 return attendance_list
@api_router.get("/attendance/my-summary")
async def get_my_attendance_summary(
 current_user: User = Depends(get_current_user)
):
 """Get current user's attendance summary with monthly hours"""
 now = datetime.now(IST)
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
 # Matrix: Admin → can_view_attendance → deny
 if current_user.role != "admin" and not _get_perm(current_user, "can_view_attendance"):
  raise HTTPException(status_code=403, detail="Not allowed")
 now = datetime.now(IST)
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
  user_data = user_map.get(uid, {})
  year, month_val = map(int, target_month.split("-"))
  _, last_day = calendar.monthrange(year, month_val)
  expected_hours = await calculate_expected_hours(
      f"{target_month}-01",
      f"{target_month}-{last_day}",
      user_data.get("punch_in_time", "10:30"),
      user_data.get("punch_out_time", "19:00")
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
#=========================================================
# REPORTS ROUTES
#=========================================================
@api_router.get("/reports/efficiency")
async def get_efficiency_report(
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Determine target safely
    target_id = user_id if (user_id and user_id != "all") else current_user.id
    
    # Permission Matrix Check
    is_admin = current_user.role == "admin"
    is_owner = target_id == current_user.id
    # Safely check list existence
    has_specific = hasattr(current_user.permissions, 'view_other_reports') and \
                   target_id in current_user.permissions.view_other_reports
    
    if not (is_admin or is_owner or has_specific):
        raise HTTPException(status_code=403, detail="Permission Denied")

    try:
        # Querying activity_logs
        logs = await db.activity_logs.find({"user_id": target_id}).to_list(100)
        
        # Return structured data even if logs are empty to avoid frontend 500 errors
        return {
            "user": {"id": target_id, "full_name": current_user.full_name if is_owner else "Staff Member"},
            "total_screen_time": sum(l.get("screen_time_minutes", 0) for l in logs) if logs else 0,
            "total_tasks_completed": sum(l.get("tasks_completed", 0) for l in logs) if logs else 0,
            "logs": logs or []
        }
    except Exception as e:
        # This prevents the '500 Internal Server Error' by providing a readable error
        print(f"Database Error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed"))
    #===========================================================================
    # DB QUERY
    #===========================================================================
    # Note: If Admin/Universal wants 'all', you'd query without user_id filter
    query = {"user_id": target_id}
    
    logs = await db.activity_logs.find(query, {"_id": 0}).sort("date", -1).limit(30).to_list(100)
    
    total_screen_time = sum(l.get("screen_time_minutes", 0) for l in logs)
    total_tasks_completed = sum(l.get("tasks_completed", 0) for l in logs)
    
    return {
        "user": {
            "id": target_id,
            "full_name": current_user.full_name if is_owner else "Team Member" # Simplified for this snippet
        },
        "total_screen_time": total_screen_time,
        "total_tasks_completed": total_tasks_completed,
        "logs": logs
    }
 
@api_router.get("/reports/export")
async def export_reports(
 format: str = "csv",
 user_id: Optional[str] = None,
 current_user: User = Depends(get_current_user)
):
 """
 Matrix:
 - Admin OR can_download_reports → export anyone
 - Otherwise: can only export own report
 """
 # Resolve target and validate view permission
 target_user_id = build_report_query(current_user, target_user_id=user_id)
 # Additional check: downloading requires can_download_reports (unless own report)
 if target_user_id != current_user.id and not can_download_report(current_user):
  raise HTTPException(
   status_code=403,
   detail="You do not have permission to download other users' reports"
  )
 # Fetch logs
 logs = await db.activity_logs.find(
  {"user_id": target_user_id},
  {"_id": 0}
 ).to_list(100)
 total_screen_time = sum(l.get("screen_time_minutes", 0) for l in logs)
 total_tasks_completed = sum(l.get("tasks_completed", 0) for l in logs)
 report = {
  "user_id": target_user_id,
  "total_screen_time": total_screen_time,
  "total_tasks_completed": total_tasks_completed,
  "days_logged": len(logs)
 }
 # ================= CSV =================
 if format == "csv":
  output = StringIO()
  writer = csv.writer(output)
  writer.writerow(["User ID", "Screen Time", "Tasks Completed", "Days Logged"])
  writer.writerow([
   report["user_id"],
   report["total_screen_time"],
   report["total_tasks_completed"],
   report["days_logged"]
  ])
  output.seek(0)
  return StreamingResponse(
   iter([output.getvalue()]),
   media_type="text/csv",
   headers={
    "Content-Disposition": f"attachment; filename=efficiency_report_{target_user_id}.csv"
   }
  )
 # ================= PDF =================
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
   headers={
    "Content-Disposition": f"attachment; filename=efficiency_report_{target_user_id}.pdf"
   }
  )
 else:
  raise HTTPException(status_code=400, detail="Invalid format")
# ====================== PERFORMANCE RANKINGS + PDF EXPORT (NEW - added here, no original line touched) ======================
@api_router.get("/reports/performance-rankings", response_model=List[PerformanceMetric])
async def get_performance_rankings(
 period: str = Query("monthly", enum=["weekly", "monthly", "all_time"]),
 current_user: User = Depends(get_current_user)
):
 global rankings_cache, rankings_cache_time
 """⭐ Star & 🏆 Top Performer Rankings (cached 5 min)"""
 cache_key = f"rankings_{period}"
 # ✅ Safe timezone-aware cache check
 if (
  cache_key in rankings_cache and
  cache_key in rankings_cache_time and
  (datetime.now(timezone.utc) - rankings_cache_time[cache_key]).total_seconds() < 300
 ):
  return rankings_cache[cache_key]
 now = datetime.now(IST)
 # ----------------------------
 # Date range setup
 # ----------------------------
 if period == "weekly":
  start_date = now - timedelta(days=7)
  expected_working_days = 5
 elif period == "monthly":
  start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
  expected_working_days = 22
 else: # all_time
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
 # ============================================================
 # LOOP THROUGH USERS
 # ============================================================
 for user in users:
  uid = user["id"]
  # ----------------------------
  # Attendance %
  # ----------------------------
  att_records = await db.attendance.find(
   {
    "user_id": uid,
    "date": {"$gte": start_date_str, "$lte": end_date_str}
   },
   {"_id": 0, "duration_minutes": 1, "is_late": 1}
  ).to_list(1000)
  days_present = len(att_records)
  total_minutes = sum(r.get("duration_minutes", 0) or 0 for r in att_records)
  total_hours = round(total_minutes / 60, 1)
  attendance_percent = round(
   (days_present / expected_working_days) * 100,
   1
  ) if expected_working_days else 0
  timely_days = len([r for r in att_records if not r.get("is_late", False)])
  timely_punchin_percent = round(
   (timely_days / days_present) * 100,
   1
  ) if days_present else 0
  # ----------------------------
  # Tasks % ✅ FIXED: datetime comparison (no isoformat)
  # ----------------------------
  tasks_assigned = await db.tasks.count_documents({
   "assigned_to": uid,
   "created_at": {"$gte": start_date}
  })
  completed_tasks = await db.tasks.count_documents({
   "assigned_to": uid,
   "status": "completed",
   "$or": [
    {"completed_at": {"$gte": start_date}},
    {"updated_at": {"$gte": start_date}}
   ]
  })
  completed_todos = await db.todos.count_documents({
   "user_id": uid,
   "is_completed": True,
   "completed_at": {"$gte": start_date}
  })
  total_completed = completed_tasks + completed_todos
  task_completion_percent = round(
   (total_completed / tasks_assigned) * 100,
   1
  ) if tasks_assigned else 0
  # ----------------------------
  # To-Do On-Time %
  # ----------------------------
  todos = await db.todos.find({
   "user_id": uid,
   "created_at": {"$gte": start_date}
  }).to_list(500)
  completed_ontime = 0
  for t in todos:
   if t.get("is_completed"):
    due = safe_dt(t.get("due_date"))
    completed_at = safe_dt(t.get("completed_at"))
    if due and completed_at and completed_at <= due:
     completed_ontime += 1
  todo_ontime_percent = round(
   (completed_ontime / len(todos)) * 100,
   1
  ) if todos else 0
  # ----------------------------
  # Overall Score (SAFE)
  # ----------------------------
  safe_hours_ratio = min((total_hours / 180), 1) if total_hours else 0
  score = (
   float(attendance_percent or 0) * 0.25 +
   safe_hours_ratio * 100 * 0.20 +
   float(task_completion_percent or 0) * 0.25 +
   float(todo_ontime_percent or 0) * 0.15 +
   float(timely_punchin_percent or 0) * 0.15
  )
  overall_score = round(min(score, 100), 1)
  # ----------------------------
  # Badge
  # ----------------------------
  if overall_score >= 95:
   badge = "⭐ Star Performer"
  elif overall_score >= 85:
   badge = "🏆 Top Performer"
  else:
   badge = "Good Performer"
  # ----------------------------
  # SAFE structured return
  # ----------------------------
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
 # ----------------------------
 # Sort + Rank
 # ----------------------------
 rankings.sort(key=lambda x: x.overall_score, reverse=True)
 for i, r in enumerate(rankings):
  r.rank = i + 1
 # ----------------------------
 # Cache result safely
 # ----------------------------
 rankings_cache[cache_key] = rankings
 rankings_cache_time[cache_key] = datetime.now(timezone.utc)
 return rankings
# ==============================================================
# INTEGRATED MASTER DATA SYSTEM & CLIENT ROUTES (PREVIEW & SYNC)
# ==============================================================
@api_router.post("/master/import-master-preview")
async def import_master_data_preview(
 file: UploadFile = File(...),
 current_user: User = Depends(get_current_user)
):
 """
 STEP 1: The 'Scan' Logic.
 Parses the multi-sheet reference Excel and returns a JSON blueprint for UI review.
 Does NOT modify the database.
 """
 if current_user.role.lower() != "admin":
  raise HTTPException(status_code=403, detail="Administrative clearance required for Master Data access.")
 filename = file.filename.lower()
 if not filename.endswith((".xlsx", ".xls")):
  raise HTTPException(status_code=400, detail="Deployment failed: Only Excel formats (.xlsx, .xls) supported.")
 try:
  content = await file.read()
  excel = pd.ExcelFile(BytesIO(content))
  # Deep telemetry of all sheets in the reference file
  parsed_blueprint = {}
  total_vectors = 0
  for sheet_name in excel.sheet_names:
   df = pd.read_excel(excel, sheet_name=sheet_name)
   # Standardize: replace NaN with empty strings for JSON compatibility
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
 """
 STEP 2: The 'Commit' Logic.
 Iterates through ALL sheets and synchronizes them with permanent database collections.
 """
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
   # Layer A: Client Registry Vectors
   if "client" in sheet_type:
    for rec in records:
     # Upsert logic based on Company Name to prevent duplicates
     await db.clients.update_one(
      {"company_name": str(rec.get("company_name", "")).strip()},
      {
       "$set": {
        **rec,
        "id": str(uuid.uuid4()) if "id" not in rec else rec["id"],
        "created_by": current_user.id,
        "updated_at": now_iso
       }
      },
      upsert=True
     )
     sync_results["clients"] += 1
   # Layer B: Compliance (Due Dates/Reminders) Vectors
   elif "due" in sheet_type or "compliance" in sheet_type:
    for rec in records:
     await db.due_dates.insert_one({
      **rec,
      "id": str(uuid.uuid4()),
      "created_by": current_user.id,
      "created_at": now_iso,
      "status": "pending"
     })
     sync_results["compliance"] += 1
   # Layer C: Personnel (Staff/Users) Vectors
   elif "staff" in sheet_type or "user" in sheet_type:
    for rec in records:
     # Logic: Create shell users for the organization
     await db.users.update_one(
      {"email": rec.get("email")},
      {"$set": {**rec, "id": str(uuid.uuid4()), "is_active": True}},
      upsert=True
     )
     sync_results["staff"] += 1
   # LOG THE DATA MUTATION
   await create_audit_log(
    current_user=current_user,
    action="GLOBAL_MASTER_SYNC",
    module="master_data",
    record_id="multi_sheet_payload",
    new_data=sync_results
   )
  return {
   "message": "Global Master Sync Successfully Executed",
   "telemetry": sync_results
  }
 except Exception as e:
  logger.error(f"Sync Failure: {str(e)}")
  raise HTTPException(status_code=400, detail=f"Database synchronization failed: {str(e)}")
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
 # Matrix: Admin → can_view_all_clients → assigned_clients → assigned_to == user
 query = build_client_query(current_user)
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
 # Matrix: Admin → can_view_all_clients → assigned_clients → assigned_to == user → deny
 if not can_view_client(current_user, client):
  raise HTTPException(status_code=403, detail="Not authorized to view this client")
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
 # Matrix: Admin → can_edit_clients → assigned_clients → assigned_to == user → deny
 if not can_edit_client(current_user, existing):
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
 # Matrix: Admin OR can_edit_clients
 if not can_delete_client(current_user):
  raise HTTPException(status_code=403, detail="Not authorized to delete clients")
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
 now = datetime.now(IST)
 # Task statistics — use permission matrix query builder
 task_query = build_task_query(current_user)
 if task_query:
  task_query = {"$and": [{"type": {"$ne": "todo"}}, task_query]}
 else:
  task_query = {"type": {"$ne": "todo"}}
 tasks = await db.tasks.find(task_query, {"_id": 0}).to_list(1000)
 total_tasks = len(tasks)
 completed_tasks = len([t for t in tasks if t["status"] == "completed"])
 pending_tasks = len([t for t in tasks if t["status"] == "pending"])
 overdue_tasks = 0
 for task in tasks:
  if task.get("due_date") and task["status"] != "completed":
   due_date = (
    datetime.fromisoformat(task["due_date"])
    if isinstance(task["due_date"], str)
    else task["due_date"]
   )
   # ✅ Make due_date timezone aware (UTC)
   if due_date.tzinfo is None:
    due_date = due_date.replace(tzinfo=timezone.utc)
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
 # Client statistics — use permission matrix query builder
 client_query = build_client_query(current_user)
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
# ==========================================================
# STAFF ACTIVITY ROUTES
# ==========================================================
from fastapi import HTTPException, Depends
from typing import Optional
from datetime import datetime
import pytz
IST = pytz.timezone("Asia/Kolkata")
# ----------------------------------------------------------
# LOG STAFF ACTIVITY
# ----------------------------------------------------------
@api_router.post("/activity/log")
async def log_staff_activity(
    activity_data: StaffActivityCreate,
    current_user: User = Depends(get_current_user)
):
    """Log staff desktop activity"""
    activity = StaffActivityLog(
        user_id=current_user.id,
        **activity_data.model_dump()
    )
    doc = activity.model_dump()
    # store timestamp in IST
    doc["timestamp"] = datetime.now(IST)
    await db.staff_activity.insert_one(doc)
    return {"message": "Activity logged successfully"}
# ----------------------------------------------------------
# ACTIVITY SUMMARY
# ----------------------------------------------------------
@api_router.get("/activity/summary")
async def get_activity_summary(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(check_permission("can_view_staff_activity"))
):
    """Get staff activity summary"""
    # Matrix: Admin → allow all; others need can_view_staff_activity AND
    # the specific user must be in view_other_activity (or user_id is omitted)
    if current_user.role != "admin":
        if user_id and not can_view_activity(current_user, user_id):
            raise HTTPException(
                status_code=403,
                detail="You do not have access to this user's activity"
            )
    # ------------------------------------------------------
    # Build Mongo Query
    # ------------------------------------------------------
    query = {}
    if user_id:
        query["user_id"] = user_id
    if date_from or date_to:
        query["timestamp"] = {}
    if date_from:
        try:
            query["timestamp"]["$gte"] = datetime.fromisoformat(date_from)
        except:
            pass
    if date_to:
        try:
            query["timestamp"]["$lte"] = datetime.fromisoformat(date_to)
        except:
            pass
    # ------------------------------------------------------
    # Fetch Activities
    # ------------------------------------------------------
    activities = await db.staff_activity.find(
        query,
        {"_id": 0}
    ).to_list(10000)
    # ------------------------------------------------------
    # Aggregate Data
    # ------------------------------------------------------
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
                "total_duration": 0,
                "active_duration": 0,
                "idle_duration": 0,
                "apps": {},
                "websites": {},
                "categories": {}
            }
        user_summary[uid]["total_duration"] += duration
        if idle:
            user_summary[uid]["idle_duration"] += duration
        else:
            user_summary[uid]["active_duration"] += duration
        # App Aggregation
        if app_name not in user_summary[uid]["apps"]:
            user_summary[uid]["apps"][app_name] = {"count": 0, "duration": 0}
        user_summary[uid]["apps"][app_name]["count"] += 1
        user_summary[uid]["apps"][app_name]["duration"] += duration
        # Website Aggregation
        if website:
            if website not in user_summary[uid]["websites"]:
                user_summary[uid]["websites"][website] = 0
            user_summary[uid]["websites"][website] += duration
        # Category Aggregation
        if category not in user_summary[uid]["categories"]:
            user_summary[uid]["categories"][category] = 0
        user_summary[uid]["categories"][category] += duration
    # ------------------------------------------------------
    # Get User Names
    # ------------------------------------------------------
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(200)
    user_map = {u.get("id"): u.get("full_name", "Unknown") for u in users if u.get("id")}
    # ------------------------------------------------------
    # Build Response
    # ------------------------------------------------------
    result = []
    for uid, data in user_summary.items():
        data["user_name"] = user_map.get(uid, "Unknown")
        data["apps_list"] = sorted(
            [{"name": k, **v} for k, v in data["apps"].items()],
            key=lambda x: x["duration"],
            reverse=True
        )
        productive_duration = data["categories"].get("productivity", 0)
        total_duration = data["total_duration"]
        if total_duration > 0:
            data["productivity_percent"] = (productive_duration / total_duration) * 100
        else:
            data["productivity_percent"] = 0
        result.append(data)
    return result
# ----------------------------------------------------------
# USER ACTIVITY DETAIL
# ----------------------------------------------------------
@api_router.get("/activity/user/{user_id}")
async def get_user_activity(
    user_id: str,
    limit: int = 100,
    current_user: User = Depends(check_permission("can_view_staff_activity"))
):
    """Get detailed activity for one user"""
    # Matrix: Admin → allow; others need user_id in view_other_activity
    if not can_view_activity(current_user, user_id):
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this user's activity"
        )
    activities = await db.staff_activity.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return activities
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
 action: Optional[str] = None, # ✅ ADD THIS
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
 # ✅ HANDLE FILTER
 if action and action != "ALL":
  query["action"] = action
 logs = await db.audit_logs.find(
  query,
  {"_id": 0}
 ).sort("timestamp", -1).to_list(2000)
 logs = convert_objectids(logs)
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
 except Exception as e:
  logger.error(f"Auto job failed: {e}")
 # VERY IMPORTANT: continue request processing
 response = await call_next(request)
 return response
  
 
# ==================== HOLIDAY ROUTES (STEP 3 & 4 - added here) ====================
@api_router.get("/holidays", response_model=list[HolidayResponse])
async def get_holidays(current_user: User = Depends(get_current_user)):
    """
    Logic:
    - Admins see ALL (including pending/rejected).
    - Staff ONLY see 'confirmed' holidays.
    """
    if current_user.role == "admin":
        query = {}
    else:
        query = {"status": "confirmed"}
     
    holidays = await db.holidays.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return holidays
@api_router.post("/holidays", response_model=HolidayResponse)
async def create_holiday(
    holiday: HolidayCreate,
    current_user: User = Depends(check_permission("can_manage_settings"))
):
    """Admin-only POST - create new holiday with duplicate protection"""
    # Convert date to string for consistent Mongo storage (ISO format)
    holiday_dict = holiday.model_dump()
    holiday_dict["date"] = holiday.date.isoformat() # store as YYYY-MM-DD string
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
    """
    The 'Yes/No' Tab Logic:
    - If status='confirmed', it shows up as a holiday for everyone.
    - If status='rejected', it is effectively ignored by the attendance logic.
    """
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
import traceback
@api_router.delete("/holidays/{holiday_date}")
async def delete_holiday(holiday_date: str, current_user: User = Depends(check_permission("can_manage_settings"))):
    result = await db.holidays.delete_one({"date": holiday_date})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"message": "Holiday removed"}
@app.exception_handler(Exception)
async def universal_exception_handler(request: Request, exc: Exception):
    # This logs the EXACT line number and file that caused the 500
    logger.error(f"Critical Error on {request.url.path}: {str(exc)}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "A database or logic error occurred.",
            "path": request.url.path
        }
    )
# Api Router
api_router.include_router(telegram_router)
api_router.include_router(leads_router)
api_router.include_router(notification_router)
app.include_router(api_router)
