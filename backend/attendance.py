# ================= IMPORTS =================
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
import uuid
import calendar

from backend.auth import get_current_user
from backend.server import db


# ================= MODELS =================

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
    status: str = "present"  # present / late / absent


# ================= ROUTER =================

router = APIRouter(prefix="/attendance", tags=["Attendance"])


# ================= HELPERS =================

def is_sunday(date_str: str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.weekday() == 6


def calculate_late(now, expected_start_time, grace_minutes):
    if not expected_start_time:
        return False, 0

    try:
        h, m = map(int, expected_start_time.split(":"))
        expected_dt = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc)
        expected_dt = expected_dt.replace(hour=h, minute=m)

        diff = (now - expected_dt).total_seconds() / 60

        if diff > grace_minutes:
            return True, int(diff)
        return False, int(diff) if diff > 0 else 0
    except:
        return False, 0


def calculate_overtime(duration_minutes, expected_end_time):
    if not expected_end_time:
        return 0

    try:
        h, m = map(int, expected_end_time.split(":"))
        expected_minutes = h * 60 + m
        actual_minutes = duration_minutes
        overtime = actual_minutes - expected_minutes
        return overtime if overtime > 0 else 0
    except:
        return 0


# ================= ROUTES =================

@router.post("/", response_model=Attendance)
async def record_attendance(
    action_data: AttendanceCreate,
    current_user=Depends(get_current_user)
):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc)

    existing = await db.attendance.find_one(
        {"user_id": current_user.id, "date": today},
        {"_id": 0}
    )

    # ================= PUNCH IN =================
    if action_data.action == "punch_in":

        if is_sunday(today):
            raise HTTPException(status_code=400, detail="Sunday is holiday")

        if existing:
            raise HTTPException(status_code=400, detail="Already punched in")

        expected_start = current_user.expected_start_time
        expected_end = getattr(current_user, "expected_end_time", None)
        grace = current_user.late_grace_minutes or 15

        is_late, late_minutes = calculate_late(now, expected_start, grace)

        status = "late" if is_late else "present"

        attendance = Attendance(
            user_id=current_user.id,
            date=today,
            punch_in=now,
            expected_start_time=expected_start,
            expected_end_time=expected_end,
            grace_minutes=grace,
            is_late=is_late,
            late_by_minutes=late_minutes,
            status=status
        )

        doc = attendance.model_dump()
        doc["punch_in"] = doc["punch_in"].isoformat()

        await db.attendance.insert_one(doc)
        return attendance

    # ================= PUNCH OUT =================
    if action_data.action == "punch_out":

        if not existing:
            raise HTTPException(status_code=400, detail="No punch in record found")

        if existing.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out")

        punch_in_time = datetime.fromisoformat(existing["punch_in"])
        duration = int((now - punch_in_time).total_seconds() / 60)

        overtime = calculate_overtime(
            duration,
            existing.get("expected_end_time")
        )

        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today},
            {"$set": {
                "punch_out": now.isoformat(),
                "duration_minutes": duration,
                "overtime_minutes": overtime
            }}
        )

        updated = await db.attendance.find_one(
            {"user_id": current_user.id, "date": today},
            {"_id": 0}
        )

        updated["punch_in"] = datetime.fromisoformat(updated["punch_in"])
        updated["punch_out"] = datetime.fromisoformat(updated["punch_out"])

        return Attendance(**updated)


# ================= TODAY =================

@router.get("/today", response_model=Optional[Attendance])
async def get_today_attendance(current_user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    attendance = await db.attendance.find_one(
        {"user_id": current_user.id, "date": today},
        {"_id": 0}
    )

    if not attendance:
        return None

    attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
    if attendance.get("punch_out"):
        attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])

    return Attendance(**attendance)


# ================= HISTORY =================

@router.get("/history", response_model=List[Attendance])
async def get_history(current_user=Depends(get_current_user)):
    records = await db.attendance.find(
        {"user_id": current_user.id},
        {"_id": 0}
    ).sort("date", -1).to_list(365)

    for r in records:
        r["punch_in"] = datetime.fromisoformat(r["punch_in"])
        if r.get("punch_out"):
            r["punch_out"] = datetime.fromisoformat(r["punch_out"])

    return records


# ================= STAFF REPORT =================

@router.get("/staff-report")
async def staff_report(
    month: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    now = datetime.now(timezone.utc)
    target_month = month or now.strftime("%Y-%m")

    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in users}

    records = await db.attendance.find(
        {"date": {"$regex": f"^{target_month}"}},
        {"_id": 0}
    ).to_list(5000)

    report = {}

    for r in records:
        uid = r["user_id"]
        if uid not in report:
            report[uid] = {
                "user_name": user_map.get(uid, {}).get("full_name"),
                "total_minutes": 0,
                "days_present": 0,
                "late_days": 0
            }

        report[uid]["total_minutes"] += r.get("duration_minutes") or 0
        report[uid]["days_present"] += 1
        if r.get("is_late"):
            report[uid]["late_days"] += 1

    return {
        "month": target_month,
        "staff_report": report
    }
