from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime
import uuid

class AttendanceCreate(BaseModel):
    action: str  # punch_in / punch_out


class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str

    punch_in: datetime
    punch_out: Optional[datetime] = None

    duration_minutes: Optional[int] = None
    overtime_minutes: int = 0

    expected_start_time: Optional[str] = None
    expected_end_time: Optional[str] = None
    grace_minutes: int = 15

    is_late: bool = False
    late_by_minutes: int = 0
    status: str = "present"
