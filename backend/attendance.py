# ================= IMPORTS =================

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, ConfigDict
import uuid
import math

from backend.server import db
from backend.server import get_current_user
from backend.server import User


# ================= GEO CONFIG =================

OFFICE_LATITUDE = 21.1702   # <-- CHANGE to your real office latitude
OFFICE_LONGITUDE = 72.8311  # <-- CHANGE to your real office longitude
ALLOWED_RADIUS_METERS = 200  # allowed punch radius


# ================= MODELS =================

class AttendanceBase(BaseModel):
    punch_in: datetime
    punch_out: Optional[datetime] = None


class AttendanceCreate(BaseModel):
    action: str  # punch_in / punch_out
    location: Optional[Dict[str, float]] = None


class Attendance(AttendanceBase):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    duration_minutes: Optional[int] = None
    location: Optional[Dict[str, float]] = None


# ================= ROUTER =================

router = APIRouter(prefix="/attendance", tags=["Attendance"])


# ================= HELPERS =================

def calculate_distance_meters(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ================= ROUTES =================

@router.post("/", response_model=Attendance)
async def record_attendance(
    action_data: AttendanceCreate,
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    existing = await db.attendance.find_one(
        {"user_id": current_user.id, "date": today},
        {"_id": 0}
    )

    # ================= PUNCH IN =================
    if action_data.action == "punch_in":

        if existing:
            raise HTTPException(status_code=400, detail="Already punched in today")

        # -------- GEO VALIDATION --------
        if current_user.role not in ["admin", "manager"]:
            location = action_data.location

            if not location:
                raise HTTPException(status_code=400, detail="Location required")

            user_lat = location.get("latitude")
            user_lon = location.get("longitude")

            if user_lat is None or user_lon is None:
                raise HTTPException(status_code=400, detail="Invalid location data")

            distance = calculate_distance_meters(
                user_lat,
                user_lon,
                OFFICE_LATITUDE,
                OFFICE_LONGITUDE
            )

            if distance > ALLOWED_RADIUS_METERS:
                raise HTTPException(
                    status_code=403,
                    detail=f"Punch not allowed. You are {int(distance)} meters away from office."
                )

        attendance = Attendance(
            user_id=current_user.id,
            date=today,
            punch_in=now,
            location=action_data.location
        )

        doc = attendance.model_dump()
        doc["punch_in"] = doc["punch_in"].isoformat()

        await db.attendance.insert_one(doc)

        return attendance

    # ================= PUNCH OUT =================
    elif action_data.action == "punch_out":

        if not existing:
            raise HTTPException(status_code=400, detail="No punch in record found")

        if existing.get("punch_out"):
            raise HTTPException(status_code=400, detail="Already punched out today")

        punch_out_time = now
        punch_in_time = (
            datetime.fromisoformat(existing["punch_in"])
            if isinstance(existing["punch_in"], str)
            else existing["punch_in"]
        )

        duration = int((punch_out_time - punch_in_time).total_seconds() / 60)

        await db.attendance.update_one(
            {"user_id": current_user.id, "date": today},
            {
                "$set": {
                    "punch_out": punch_out_time.isoformat(),
                    "duration_minutes": duration
                }
            }
        )

        updated = await db.attendance.find_one(
            {"user_id": current_user.id, "date": today},
            {"_id": 0}
        )

        if isinstance(updated["punch_in"], str):
            updated["punch_in"] = datetime.fromisoformat(updated["punch_in"])
        if isinstance(updated.get("punch_out"), str):
            updated["punch_out"] = datetime.fromisoformat(updated["punch_out"])

        return Attendance(**updated)


# ================= TODAY =================

@router.get("/today", response_model=Optional[Attendance])
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    attendance = await db.attendance.find_one(
        {"user_id": current_user.id, "date": today},
        {"_id": 0}
    )

    if not attendance:
        return None

    if isinstance(attendance["punch_in"], str):
        attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
    if attendance.get("punch_out") and isinstance(attendance["punch_out"], str):
        attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])

    return Attendance(**attendance)


# ================= HISTORY =================

@router.get("/history", response_model=List[Attendance])
async def get_attendance_history(current_user: User = Depends(get_current_user)):
    query = {"user_id": current_user.id} if current_user.role == "staff" else {}

    attendance_list = await db.attendance.find(
        query,
        {"_id": 0}
    ).sort("date", -1).to_list(1000)

    for attendance in attendance_list:
        if isinstance(attendance["punch_in"], str):
            attendance["punch_in"] = datetime.fromisoformat(attendance["punch_in"])
        if attendance.get("punch_out") and isinstance(attendance["punch_out"], str):
            attendance["punch_out"] = datetime.fromisoformat(attendance["punch_out"])

    return attendance_list


# ================= MY SUMMARY =================

@router.get("/my-summary")
async def get_my_attendance_summary(current_user: User = Depends(get_current_user)):

    attendance_list = await db.attendance.find(
        {"user_id": current_user.id},
        {"_id": 0}
    ).to_list(1000)

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
        "total_days": total_days,
        "total_minutes": total_minutes_all,
        "monthly_summary": formatted_data
    }


# ================= STAFF REPORT =================

@router.get("/staff-report")
async def get_staff_attendance_report(
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):

    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    target_month = month or now.strftime("%Y-%m")

    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in users}

    attendance_list = await db.attendance.find(
        {"date": {"$regex": f"^{target_month}"}},
        {"_id": 0}
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
                "records": []
            }

        duration = attendance.get("duration_minutes")

        if isinstance(duration, (int, float)):
            staff_report[uid]["total_minutes"] += duration

        staff_report[uid]["days_present"] += 1

        staff_report[uid]["records"].append({
            "date": attendance["date"],
            "punch_in": attendance.get("punch_in"),
            "punch_out": attendance.get("punch_out"),
            "duration_minutes": duration
        })

    result = []

    for uid, data in staff_report.items():
        total_minutes = data["total_minutes"]
        hours = total_minutes // 60
        minutes = total_minutes % 60

        data["total_hours"] = f"{hours}h {minutes}m"

        if data["days_present"] > 0:
            data["avg_hours_per_day"] = round(
                (total_minutes / data["days_present"]) / 60,
                1
            )
        else:
            data["avg_hours_per_day"] = 0

        result.append(data)

    result.sort(key=lambda x: x["total_minutes"], reverse=True)

    return {
        "month": target_month,
        "total_staff": len(result),
        "staff_report": result
    }
