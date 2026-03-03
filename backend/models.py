from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date
import uuid


# ==========================================================
# PERMISSIONS
# ==========================================================

class UserPermissions(BaseModel):
    can_view_all_tasks: bool = False
    can_edit_all_tasks: bool = False
    can_delete_tasks: bool = False
    can_view_reports: bool = False
    can_manage_users: bool = False
    can_manage_clients: bool = False
    can_view_all_leads: bool = False


# ==========================================================
# USER
# ==========================================================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    email: str
    full_name: Optional[str] = None
    role: str = "staff"
    permissions: UserPermissions = Field(default_factory=UserPermissions)
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ==========================================================
# TODO
# ==========================================================

class Todo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    completed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ==========================================================
# TASK
# ==========================================================

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    assigned_to: str
    created_by: str
    due_date: Optional[date] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "pending"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


# ==========================================================
# CLIENT
# ==========================================================

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    client_type: Optional[str] = "other"
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    notes: Optional[str] = None


# ==========================================================
# ATTENDANCE
# ==========================================================

class Attendance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    date: date = Field(default_factory=date.today)
