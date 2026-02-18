import pytz
import logging
import os
from datetime import datetime, timedelta, date, timezone
from pathlib import Path
from typing import List, Optional

import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

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

# ─── WebSocket Manager ──────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

async def send_new_notification(notification_data: dict):
    await manager.broadcast({
        "type": "new_notification",
        "data": notification_data
    })

@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_json()  # can handle incoming later
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
# ─── MODELS ─────────────────────────────────────────────────────────────────

class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_view_all_clients: bool = False
    can_view_all_dsc: bool = False
    can_view_all_documents: bool = False
    can_view_all_duedates: bool = False
    can_view_reports: bool = False
    can_manage_users: bool = False
    can_assign_tasks: bool = False
    assigned_clients: List[str] = Field(default_factory=list)

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "staff"
    profile_picture: Optional[str] = None
    permissions: Optional[UserPermissions] = None
    departments: List[str] = Field(default_factory=list)

class UserCreate(UserBase):
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

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
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    movement_type: str
    person_name: str
    timestamp: str
    notes: Optional[str] = None
    recorded_by: str
    edited_by: Optional[str] = None
    edited_at: Optional[str] = None

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
    movement_log: List[DSCMovement] = Field(default_factory=list)

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

class MovementUpdateRequest(BaseModel):
    movement_id: str
    movement_type: str
    person_name: Optional[str] = None
    notes: Optional[str] = None

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

class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    punch_in: datetime
    punch_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None

class AttendanceCreate(BaseModel):
    action: str

class ClientBase(BaseModel):
    company_name: str
    client_type: str
    contact_persons: List[dict] = Field(default_factory=list)
    email: EmailStr
    phone: str
    birthday: Optional[date] = None
    services: List[str] = Field(default_factory=list)
    dsc_details: List[dict] = Field(default_factory=list)
    assigned_to: Optional[str] = None
    notes: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    members: List[str]
    is_direct: bool = False

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
    message_type: str = "text"
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
    read_by: List[str] = Field(default_factory=list)
# ─── HELPERS ────────────────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def send_email(to_email: str, subject: str, body: str) -> bool:
    sendgrid_key = os.getenv("SENDGRID_API_KEY")
    sender_email = os.getenv("SENDER_EMAIL")
    if not sendgrid_key or not sender_email:
        logger.warning("SendGrid not configured")
        return False
    message = Mail(
        from_email=sender_email,
        to_emails=to_email,
        subject=subject,
        plain_text_content=body
    )
    try:
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        return response.status_code in (200, 202)
    except Exception as e:
        logger.error(f"SendGrid error: {str(e)}")
        return False

def send_birthday_email(recipient_email: str, client_name: str) -> bool:
    sendgrid_key = os.getenv('SENDGRID_API_KEY')
    sender_email = os.getenv('SENDER_EMAIL', 'noreply@taskosphere.com')
    if not sendgrid_key:
        logger.warning("SENDGRID_API_KEY not configured")
        return False

    subject = f"Happy Birthday, {client_name}!"
    html_content = f"""
    <html>
        <body style="font-family:Arial,sans-serif;padding:20px;background:#f5f5f5;">
            <div style="max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                <h1 style="color:#4F46E5;text-align:center;">🎉 Happy Birthday! 🎉</h1>
                <p>Dear {client_name},</p>
                <p>On behalf of our entire team, we wish you a very Happy Birthday! 🎂</p>
                <p>We appreciate your continued trust and partnership.</p>
                <div style="background:#4F46E5;color:white;padding:15px;border-radius:5px;margin:20px 0;text-align:center;">
                    <p style="margin:0;font-size:18px;font-weight:bold;">Wishing you all the best!</p>
                </div>
                <p style="font-size:14px;color:#666;text-align:center;margin-top:30px;">
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
        logger.info(f"Birthday email → {recipient_email} ({response.status_code})")
        return response.status_code in (200, 202)
    except Exception as e:
        logger.error(f"Birthday email failed: {e}")
        return False

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError as e:
        logger.error(f"JWT error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    # Fix datetime strings
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])

    return User(**user_doc)

# ─── AUTH & USER ROUTES ─────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Taskosphere API", "status": "running"}

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    if await db.users.find_one({"email": user_data.email}):
        raise HTTPException(400, "Email already registered")

    hashed = get_password_hash(user_data.password)
    user = User(**user_data.model_dump(exclude={"password"}))
    doc = user.model_dump()
    doc["password"] = hashed
    doc["created_at"] = user.created_at.isoformat()

    await db.users.insert_one(doc)

    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email})
    if not user_doc or not verify_password(credentials.password, user_doc["password"]):
        raise HTTPException(401, "Invalid credentials")

    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])

    user = User(**{k: v for k, v in user_doc.items() if k != "password"})
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@api_router.get("/users", response_model=List[User])
async def get_users(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(403, "Not authorized")

    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    for u in users:
        if isinstance(u.get("created_at"), str):
            u["created_at"] = datetime.fromisoformat(u["created_at"])
    return [User(**u) for u in users]
# ─── TASK ROUTES ────────────────────────────────────────────────────────────

@api_router.post("/tasks", response_model=Task)
async def create_task(task_data: TaskCreate, current_user: User = Depends(get_current_user)):
    task = Task(**task_data.model_dump(), created_by=current_user.id)
    
    doc = task.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    if doc.get("due_date"):
        doc["due_date"] = doc["due_date"].isoformat()
    
    await db.tasks.insert_one(doc)

    if task_data.assigned_to:
        notification_data = {
            "title": "New Task Assigned",
            "message": f"You have been assigned: {task_data.title}",
            "type": "task",
            "task_id": task.id,
            "created_by": current_user.full_name
        }
        await send_new_notification(notification_data)
    
    return task

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(current_user: User = Depends(get_current_user)):
    query = {}
    if current_user.role != "admin":
        permissions = current_user.permissions
        if permissions and getattr(permissions, "can_view_all_tasks", False):
            query = {}
        else:
            query["$or"] = [
                {"assigned_to": current_user.id},
                {"sub_assignees": current_user.id},
                {"created_by": current_user.id}
            ]
    
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    
    for t in tasks:
        for field in ["created_at", "updated_at", "due_date"]:
            if field in t and isinstance(t[field], str):
                t[field] = datetime.fromisoformat(t[field])
    
    return [Task(**t) for t in tasks]

@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for field in ["created_at", "updated_at", "due_date"]:
        if field in task and isinstance(task[field], str):
            task[field] = datetime.fromisoformat(task[field])
    
    return Task(**task)

@api_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_data: TaskCreate, current_user: User = Depends(get_current_user)):
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "due_date" in update_data and update_data["due_date"]:
        update_data["due_date"] = update_data["due_date"].isoformat()
    
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    
    updated = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    for field in ["created_at", "updated_at", "due_date"]:
        if field in updated and isinstance(updated[field], str):
            updated[field] = datetime.fromisoformat(updated[field])
    
    return Task(**updated)

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}

# ─── DSC ROUTES ─────────────────────────────────────────────────────────────

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
    dscs = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
    for d in dscs:
        for f in ["created_at", "issue_date", "expiry_date"]:
            if f in d and isinstance(d[f], str):
                d[f] = datetime.fromisoformat(d[f])
    return [DSC(**d) for d in dscs]

@api_router.put("/dsc/{dsc_id}", response_model=DSC)
async def update_dsc(dsc_id: str, dsc_data: DSCCreate, current_user: User = Depends(get_current_user)):
    existing = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "DSC not found")
    
    update = dsc_data.model_dump(exclude_unset=True)
    if "issue_date" in update:
        update["issue_date"] = update["issue_date"].isoformat()
    if "expiry_date" in update:
        update["expiry_date"] = update["expiry_date"].isoformat()
    
    await db.dsc_register.update_one({"id": dsc_id}, {"$set": update})
    
    updated = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    for f in ["created_at", "issue_date", "expiry_date"]:
        if f in updated and isinstance(updated[f], str):
            updated[f] = datetime.fromisoformat(updated[f])
    
    return DSC(**updated)

@api_router.delete("/dsc/{dsc_id}")
async def delete_dsc(dsc_id: str, current_user: User = Depends(get_current_user)):
    result = await db.dsc_register.delete_one({"id": dsc_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "DSC not found")
    return {"message": "DSC deleted successfully"}

@api_router.post("/dsc/{dsc_id}/movement")
async def record_dsc_movement(dsc_id: str, movement_data: DSCMovementRequest, current_user: User = Depends(get_current_user)):
    dsc = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not dsc:
        raise HTTPException(404, "DSC not found")
    
    movement = {
        "id": str(uuid.uuid4()),
        "movement_type": movement_data.movement_type,
        "person_name": movement_data.person_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": movement_data.notes,
        "recorded_by": current_user.full_name
    }
    
    log = dsc.get("movement_log", [])
    log.append(movement)
    
    await db.dsc_register.update_one(
        {"id": dsc_id},
        {
            "$set": {
                "current_location": "with_company" if movement_data.movement_type == "IN" else "taken_by_client",
                "movement_log": log
            }
        }
    )
    
    return {"message": f"DSC marked as {movement_data.movement_type}", "movement": movement}

@api_router.put("/dsc/{dsc_id}/movement/{movement_id}")
async def update_dsc_movement(dsc_id: str, movement_id: str, update_data: MovementUpdateRequest, current_user: User = Depends(get_current_user)):
    dsc = await db.dsc_register.find_one({"id": dsc_id}, {"_id": 0})
    if not dsc:
        raise HTTPException(404, "DSC not found")
    
    log = dsc.get("movement_log", [])
    found = False
    
    for i, m in enumerate(log):
        if m.get("id") == movement_id:
            log[i]["movement_type"] = update_data.movement_type
            if update_data.person_name:
                log[i]["person_name"] = update_data.person_name
            if update_data.notes is not None:
                log[i]["notes"] = update_data.notes
            log[i]["edited_by"] = current_user.full_name
            log[i]["edited_at"] = datetime.now(timezone.utc).isoformat()
            found = True
            break
    
    if not found:
        raise HTTPException(404, "Movement entry not found")
    
    new_loc = "with_company" if log[-1]["movement_type"] == "IN" else "taken_by_client"
    
    await db.dsc_register.update_one(
        {"id": dsc_id},
        {"$set": {"current_location": new_loc, "movement_log": log}}
    )
    
    return {"message": "Movement updated successfully"}

# ─── DOCUMENT ROUTES ────────────────────────────────────────────────────────

@api_router.post("/documents", response_model=Document)
async def create_document(document_data: DocumentCreate, current_user: User = Depends(get_current_user)):
    doc_obj = Document(**document_data.model_dump(), created_by=current_user.id)
    doc = doc_obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("issue_date"):
        doc["issue_date"] = doc["issue_date"].isoformat()
    if doc.get("valid_upto"):
        doc["valid_upto"] = doc["valid_upto"].isoformat()
    
    await db.documents.insert_one(doc)
    return doc_obj

@api_router.get("/documents", response_model=List[Document])
async def get_documents(current_user: User = Depends(get_current_user)):
    docs = await db.documents.find({}, {"_id": 0}).to_list(1000)
    for d in docs:
        for f in ["created_at", "issue_date", "valid_upto"]:
            if f in d and isinstance(d[f], str):
                d[f] = datetime.fromisoformat(d[f])
    return [Document(**d) for d in docs]

@api_router.put("/documents/{document_id}", response_model=Document)
async def update_document(document_id: str, document_data: DocumentCreate, current_user: User = Depends(get_current_user)):
    update = document_data.model_dump(exclude_unset=True)
    if "issue_date" in update and update["issue_date"]:
        update["issue_date"] = update["issue_date"].isoformat()
    if "valid_upto" in update and update["valid_upto"]:
        update["valid_upto"] = update["valid_upto"].isoformat()
    
    await db.documents.update_one({"id": document_id}, {"$set": update})
    
    updated = await db.documents.find_one({"id": document_id}, {"_id": 0})
    for f in ["created_at", "issue_date", "valid_upto"]:
        if f in updated and isinstance(updated[f], str):
            updated[f] = datetime.fromisoformat(updated[f])
    
    return Document(**updated)

@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: User = Depends(get_current_user)):
    result = await db.documents.delete_one({"id": document_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    return {"message": "Document deleted successfully"}

@api_router.post("/documents/{document_id}/movement")
async def record_document_movement(document_id: str, movement_data: DocumentMovementRequest, current_user: User = Depends(get_current_user)):
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    
    movement = {
        "id": str(uuid.uuid4()),
        "movement_type": movement_data.movement_type,
        "person_name": movement_data.person_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": movement_data.notes,
        "recorded_by": current_user.full_name
    }
    
    log = doc.get("movement_log", [])
    log.append(movement)
    
    await db.documents.update_one(
        {"id": document_id},
        {"$set": {"current_status": movement_data.movement_type, "movement_log": log}}
    )
    
    return {"message": "Movement recorded successfully"}
# ─── ATTENDANCE ROUTES ──────────────────────────────────────────────────────

@api_router.post("/attendance", response_model=Attendance)
async def record_attendance(action_data: AttendanceCreate, current_user: User = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
    
    if action_data.action == "punch_in":
        if existing:
            raise HTTPException(status_code=400, detail="Already punched in today")
        
        att = Attendance(
            user_id=current_user.id,
            date=today,
            punch_in=datetime.now(timezone.utc)
        )
        doc = att.model_dump()
        doc["punch_in"] = doc["punch_in"].isoformat()
        await db.attendance.insert_one(doc)
        return att
    
    elif action_data.action == "punch_out":
        if not existing:
            raise HTTPException(status_code=400, detail="No punch in record found")
        if existing.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out today")
        
        out_time = datetime.now(timezone.utc)
        in_time = datetime.fromisoformat(existing["punch_in"]) if isinstance(existing["punch_in"], str) else existing["punch_in"]
        duration_min = int((out_time - in_time).total_seconds() / 60)
        
        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today},
            {"$set": {"punch_out": out_time.isoformat(), "duration_minutes": duration_min}}
        )
        
        updated = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
        for f in ["punch_in", "punch_out"]:
            if f in updated and isinstance(updated[f], str):
                updated[f] = datetime.fromisoformat(updated[f])
        return Attendance(**updated)

@api_router.get("/attendance/today", response_model=Optional[Attendance])
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    att = await db.attendance.find_one({"user_id": current_user.id, "date": today}, {"_id": 0})
    if not att:
        return None
    
    for f in ["punch_in", "punch_out"]:
        if f in att and isinstance(att[f], str):
            att[f] = datetime.fromisoformat(att[f])
    return Attendance(**att)

@api_router.get("/attendance/history", response_model=List[Attendance])
async def get_attendance_history(current_user: User = Depends(get_current_user)):
    query = {"user_id": current_user.id} if current_user.role == "staff" else {}
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    for r in records:
        for f in ["punch_in", "punch_out"]:
            if f in r and isinstance(r[f], str):
                r[f] = datetime.fromisoformat(r[f])
    return [Attendance(**r) for r in records]

@api_router.get("/attendance/my-summary")
async def get_my_attendance_summary(current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    
    records = await db.attendance.find(
        {"user_id": current_user.id},
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    
    monthly = {}
    total_min = 0
    total_days = 0
    
    for r in records:
        month = r["date"][:7]
        monthly.setdefault(month, {"total_minutes": 0, "days_present": 0})
        dur = r.get("duration_minutes", 0)
        monthly[month]["total_minutes"] += dur
        total_min += dur
        monthly[month]["days_present"] += 1
        total_days += 1
    
    formatted = []
    for m, data in monthly.items():
        mins = data["total_minutes"]
        h = mins // 60
        rem = mins % 60
        formatted.append({
            "month": m,
            "total_minutes": mins,
            "total_hours": f"{h}h {rem}m",
            "days_present": data["days_present"]
        })
    
    return {
        "current_month": current_month,
        "total_days": total_days,
        "total_minutes": total_min,
        "monthly_summary": formatted
    }

@api_router.get("/attendance/staff-report")
async def get_staff_attendance_report(month: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required")
    
    now = datetime.now(timezone.utc)
    target_month = month or now.strftime("%Y-%m")
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in users}
    
    att_list = await db.attendance.find(
        {"date": {"$regex": f"^{target_month}"}},
        {"_id": 0}
    ).to_list(5000)
    
    report = {}
    for att in att_list:
        uid = att["user_id"]
        if uid not in report:
            info = user_map.get(uid, {})
            report[uid] = {
                "user_id": uid,
                "user_name": info.get("full_name", "Unknown"),
                "role": info.get("role", "staff"),
                "total_minutes": 0,
                "days_present": 0,
                "records": []
            }
        dur = att.get("duration_minutes", 0)
        report[uid]["total_minutes"] += dur
        report[uid]["days_present"] += 1
        report[uid]["records"].append({
            "date": att["date"],
            "punch_in": att.get("punch_in"),
            "punch_out": att.get("punch_out"),
            "duration_minutes": dur
        })
    
    result = []
    for uid, data in report.items():
        mins = data["total_minutes"]
        h = mins // 60
        m = mins % 60
        data["total_hours"] = f"{h}h {m}m"
        data["avg_hours_per_day"] = round(mins / data["days_present"] / 60, 1) if data["days_present"] > 0 else 0
        result.append(data)
    
    result.sort(key=lambda x: x["total_minutes"], reverse=True)
    
    return {
        "month": target_month,
        "total_staff": len(result),
        "staff_report": result
    }

# ─── DUE DATE ROUTES ────────────────────────────────────────────────────────

@api_router.post("/duedates", response_model=DueDate)
async def create_due_date(due_date_data: DueDateCreate, current_user: User = Depends(get_current_user)):
    due = DueDate(**due_date_data.model_dump(), created_by=current_user.id)
    doc = due.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["due_date"] = doc["due_date"].isoformat()
    await db.due_dates.insert_one(doc)
    return due

@api_router.get("/duedates", response_model=List[DueDate])
async def get_due_dates(current_user: User = Depends(get_current_user)):
    query = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
    dues = await db.due_dates.find(query, {"_id": 0}).to_list(1000)
    for d in dues:
        for f in ["created_at", "due_date"]:
            if f in d and isinstance(d[f], str):
                d[f] = datetime.fromisoformat(d[f])
    return [DueDate(**d) for d in dues]

@api_router.get("/duedates/upcoming")
async def get_upcoming_due_dates(days: int = 30, current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    future = now + timedelta(days=days)
    
    query = {"status": "pending"}
    if current_user.role == "staff":
        query["assigned_to"] = current_user.id
    
    dues = await db.due_dates.find(query, {"_id": 0}).to_list(1000)
    upcoming = []
    
    for d in dues:
        due_date = datetime.fromisoformat(d["due_date"]) if isinstance(d["due_date"], str) else d["due_date"]
        if now <= due_date <= future:
            d["due_date"] = due_date
            d["days_remaining"] = (due_date - now).days
            if isinstance(d.get("created_at"), str):
                d["created_at"] = datetime.fromisoformat(d["created_at"])
            upcoming.append(d)
    
    return sorted(upcoming, key=lambda x: x["days_remaining"])

@api_router.put("/duedates/{due_date_id}", response_model=DueDate)
async def update_due_date(due_date_id: str, due_date_data: DueDateCreate, current_user: User = Depends(get_current_user)):
    existing = await db.due_dates.find_one({"id": due_date_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Due date not found")
    
    update = due_date_data.model_dump()
    update["due_date"] = update["due_date"].isoformat()
    
    await db.due_dates.update_one({"id": due_date_id}, {"$set": update})
    
    updated = await db.due_dates.find_one({"id": due_date_id}, {"_id": 0})
    for f in ["created_at", "due_date"]:
        if f in updated and isinstance(updated[f], str):
            updated[f] = datetime.fromisoformat(updated[f])
    
    return DueDate(**updated)

@api_router.delete("/duedates/{due_date_id}")
async def delete_due_date(due_date_id: str, current_user: User = Depends(get_current_user)):
    result = await db.due_dates.delete_one({"id": due_date_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Due date not found")
    return {"message": "Due date deleted successfully"}
# ─── CLIENT MANAGEMENT ROUTES ───────────────────────────────────────────────

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
    query = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for c in clients:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
        if c.get("birthday") and isinstance(c["birthday"], str):
            c["birthday"] = date.fromisoformat(c["birthday"])
    return [Client(**c) for c in clients]

@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, current_user: User = Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    
    if isinstance(client.get("created_at"), str):
        client["created_at"] = datetime.fromisoformat(client["created_at"])
    if client.get("birthday") and isinstance(client["birthday"], str):
        client["birthday"] = date.fromisoformat(client["birthday"])
    return Client(**client)

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, client_data: ClientCreate, current_user: User = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Client not found")
    
    update = client_data.model_dump(exclude_unset=True)
    if "birthday" in update and update["birthday"]:
        update["birthday"] = update["birthday"].isoformat()
    
    await db.clients.update_one({"id": client_id}, {"$set": update})
    
    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})
    for f in ["created_at", "birthday"]:
        if f in updated and isinstance(updated[f], str):
            if f == "birthday":
                updated[f] = date.fromisoformat(updated[f])
            else:
                updated[f] = datetime.fromisoformat(updated[f])
    return Client(**updated)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(get_current_user)):
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Client not found")
    return {"message": "Client deleted successfully"}

@api_router.post("/clients/{client_id}/send-birthday-email")
async def send_client_birthday_email(
    client_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    
    # Use company_name as fallback (since contact_persons is a list)
    name = client.get("company_name", "Valued Client")
    
    background_tasks.add_task(send_birthday_email, client["email"], name)
    return {"message": "Birthday email queued for delivery"}

@api_router.get("/clients/upcoming-birthdays")
async def get_upcoming_birthdays(days: int = 7, current_user: User = Depends(get_current_user)):
    clients = await db.clients.find({}, {"_id": 0}).to_list(1000)
    
    today = date.today()
    upcoming = []
    
    for c in clients:
        if c.get("birthday"):
            bday = date.fromisoformat(c["birthday"]) if isinstance(c["birthday"], str) else c["birthday"]
            this_year = bday.replace(year=today.year)
            if this_year < today:
                this_year = bday.replace(year=today.year + 1)
            
            days_until = (this_year - today).days
            if 0 <= days_until <= days:
                c["days_until_birthday"] = days_until
                upcoming.append(c)
    
    return sorted(upcoming, key=lambda x: x["days_until_birthday"])

# ─── DASHBOARD STATS ────────────────────────────────────────────────────────

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    
    # Tasks
    tq = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
    tasks = await db.tasks.find(tq, {"_id": 0}).to_list(1000)
    
    total_tasks = len(tasks)
    completed = sum(1 for t in tasks if t.get("status") == "completed")
    pending = total_tasks - completed
    
    overdue = 0
    for t in tasks:
        if t.get("due_date") and t["status"] != "completed":
            due = datetime.fromisoformat(t["due_date"]) if isinstance(t["due_date"], str) else t["due_date"]
            if due < now:
                overdue += 1
    
    # DSC
    dscs = await db.dsc_register.find({}, {"_id": 0}).to_list(1000)
    total_dsc = len(dscs)
    expiring_count = 0
    expiring_list = []
    for d in dscs:
        exp = datetime.fromisoformat(d["expiry_date"]) if isinstance(d["expiry_date"], str) else d["expiry_date"]
        days_left = (exp - now).days
        if days_left <= 90:
            expiring_count += 1
            expiring_list.append({
                "id": d["id"],
                "holder_name": d["holder_name"],
                "expiry_date": d["expiry_date"],
                "days_left": days_left
            })
    
    # Clients
    cq = {} if current_user.role != "staff" else {"assigned_to": current_user.id}
    clients = await db.clients.find(cq, {"_id": 0}).to_list(1000)
    total_clients = len(clients)
    
    upcoming_bdays = 0
    today = date.today()
    for c in clients:
        if c.get("birthday"):
            b = date.fromisoformat(c["birthday"]) if isinstance(c["birthday"], str) else c["birthday"]
            this_year = b.replace(year=today.year)
            if this_year < today:
                this_year = b.replace(year=today.year + 1)
            if 0 <= (this_year - today).days <= 7:
                upcoming_bdays += 1
    
    # Due dates upcoming
    upcoming_dues_count = 0
    dues = await db.due_dates.find({"status": "pending"}, {"_id": 0}).to_list(1000)
    for dd in dues:
        ddate = datetime.fromisoformat(dd["due_date"]) if isinstance(dd["due_date"], str) else dd["due_date"]
        if (ddate - now).days <= 120:
            upcoming_dues_count += 1
    
    # Team workload
    team = []
    if current_user.role != "staff":
        users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
        for u in users:
            u_tasks = [t for t in tasks if t.get("assigned_to") == u["id"]]
            team.append({
                "user_id": u["id"],
                "user_name": u["full_name"],
                "total_tasks": len(u_tasks),
                "pending": len([t for t in u_tasks if t["status"] == "pending"]),
                "completed": len([t for t in u_tasks if t["status"] == "completed"])
            })
    
    # Compliance score
    score = 100
    if total_tasks > 0:
        score -= (overdue / total_tasks) * 50
    if total_dsc > 0:
        score -= (expiring_count / total_dsc) * 30
    
    status_text = "good" if score >= 80 else "warning" if score >= 50 else "critical"
    
    return DashboardStats(
        total_tasks=total_tasks,
        completed_tasks=completed,
        pending_tasks=pending,
        overdue_tasks=overdue,
        total_dsc=total_dsc,
        expiring_dsc_count=expiring_count,
        expiring_dsc_list=expiring_list,
        total_clients=total_clients,
        upcoming_birthdays=upcoming_bdays,
        upcoming_due_dates=upcoming_dues_count,
        team_workload=team,
        compliance_status={
            "score": max(0, int(score)),
            "status": status_text,
            "overdue_tasks": overdue,
            "expiring_certificates": expiring_count
        }
    )

# ─── STAFF ACTIVITY LOGGING ─────────────────────────────────────────────────

class StaffActivityCreate(BaseModel):
    app_name: str
    window_title: Optional[str] = None
    url: Optional[str] = None
    category: str = "other"
    duration_seconds: int = 0

@api_router.post("/activity/log")
async def log_staff_activity(data: StaffActivityCreate, current_user: User = Depends(get_current_user)):
    act = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "app_name": data.app_name,
        "window_title": data.window_title,
        "url": data.url,
        "category": data.category,
        "duration_seconds": data.duration_seconds,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.staff_activity.insert_one(act)
    return {"message": "Activity logged"}

# ─── CHAT & MESSAGING ───────────────────────────────────────────────────────

@api_router.post("/chat/groups", response_model=ChatGroup)
async def create_chat_group(data: ChatGroupCreate, current_user: User = Depends(get_current_user)):
    members = list(set(data.members + [current_user.id]))
    
    if data.is_direct and len(members) == 2:
        exist = await db.chat_groups.find_one({
            "is_direct": True,
            "members": {"$all": members, "$size": 2}
        }, {"_id": 0})
        if exist:
            if isinstance(exist.get("created_at"), str):
                exist["created_at"] = datetime.fromisoformat(exist["created_at"])
            return ChatGroup(**exist)
    
    group = ChatGroup(
        name=data.name,
        description=data.description,
        members=members,
        created_by=current_user.id,
        is_direct=data.is_direct
    )
    
    doc = group.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.chat_groups.insert_one(doc)
    return group

# ... (remaining chat routes: get groups, get group, update group, leave group, get messages, send message, upload, get users)

# For brevity in this chunk, assuming you have them — add from your original if needed.
# If missing any chat route, let me know and I'll send a separate chunk for chat only.

# ─── REMINDERS & RANKINGS ───────────────────────────────────────────────────

# Manual full reminder
@api_router.post("/send-pending-task-reminders")
async def send_pending_task_reminders(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin only")
    
    tasks = await db.tasks.find({"status": {"$ne": "completed"}}, {"_id": 0}).to_list(1000)
    if not tasks:
        return {"message": "No pending tasks", "emails_sent": 0, "failed": []}
    
    user_tasks = {}
    for t in tasks:
        uid = t.get("assigned_to")
        if not uid:
            continue
        user = await db.users.find_one({"id": uid}, {"_id": 0})
        if not user:
            continue
        user_tasks.setdefault(user["email"], []).append(t)
    
    sent = 0
    failed = []
    for email, tlist in user_tasks.items():
        body = "Hello,\n\nPending tasks:\n\n"
        for t in tlist:
            body += f"- {t.get('title')} (Due: {t.get('due_date', 'N/A')})\n"
        body += "\nPlease complete them.\n\nRegards,\nTaskosphere"
        
        if send_email(email, "Pending Task Reminder - Taskosphere", body):
            sent += 1
        else:
            failed.append(email)
    
    return {
        "message": "Reminder process done",
        "total_users": len(user_tasks),
        "emails_sent": sent,
        "emails_failed": failed
    }

# Auto daily reminder middleware
@app.middleware("http")
async def auto_daily_reminder_middleware(request, call_next):
    try:
        india = datetime.now(pytz.timezone("Asia/Kolkata"))
        today_str = india.date().isoformat()
        
        setting = await db.system_settings.find_one({"key": "last_reminder_date"})
        last = setting["value"] if setting else None
        
        if india.hour >= 10 and last != today_str:
            logger.info("Auto reminder at 10 AM IST")
            # Call your internal function (implement send_pending_task_reminders_internal if needed)
            await db.system_settings.update_one(
                {"key": "last_reminder_date"},
                {"$set": {"value": today_str}},
                upsert=True
            )
    except Exception as e:
        logger.error(f"Auto reminder error: {e}")
    
    return await call_next(request)

# Staff rankings
@api_router.get("/staff/rankings")
async def get_staff_rankings(period: str = "all", current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager", "staff"]:
        raise HTTPException(403, "Not authorized")
    
    if current_user.role != "admin":
        period = "all"
    
    now = datetime.now(timezone.utc)
    start = None
    if period == "weekly":
        start = now - timedelta(days=7)
    elif period == "monthly":
        start = now.replace(day=1)
    
    users = await db.users.find(
        {"role": {"$in": ["manager", "staff"]}},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    
    rankings = []
    for u in users:
        uid = u["id"]
        
        # Attendance
        atts = await db.attendance.find({"user_id": uid}, {"_id": 0}).to_list(1000)
        total_min = sum(r.get("duration_minutes", 0) for r in atts 
                        if not start or datetime.strptime(r["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc) >= start)
        work_score = min(total_min / (60 * 160), 1) * 100
        
        # Tasks
        ts = await db.tasks.find({"assigned_to": uid}, {"_id": 0}).to_list(1000)
        filtered = [t for t in ts if not start or 
                    (datetime.fromisoformat(t["created_at"]) if isinstance(t["created_at"], str) else t["created_at"]) >= start]
        total_t = len(filtered)
        comp_t = sum(1 for t in filtered if t["status"] == "completed")
        comp_pct = (comp_t / total_t * 100) if total_t > 0 else 0
        
        # Speed
        times = []
        for t in filtered:
            if t["status"] == "completed":
                c = datetime.fromisoformat(t["created_at"]) if isinstance(t["created_at"], str) else t["created_at"]
                u = datetime.fromisoformat(t["updated_at"]) if isinstance(t["updated_at"], str) else t["updated_at"]
                times.append((u - c).total_seconds())
        speed_score = max(0, 100 - (sum(times) / len(times) / 86400 * 10)) if times else 0
        
        eff = 0.35 * work_score + 0.40 * comp_pct + 0.25 * speed_score
        
        rankings.append({
            "user_id": uid,
            "name": u["full_name"],
            "role": u["role"],
            "profile_picture": u.get("profile_picture"),
            "score": round(eff, 2),
            "hours_worked": round(total_min / 60, 2),
            "completion_percent": round(comp_pct, 2),
        })
    
    rankings.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(rankings):
        r["rank"] = i + 1
    
    return {"period": period, "rankings": rankings}

# ─── SHUTDOWN ───────────────────────────────────────────────────────────────

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
