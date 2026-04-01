"""
attendance_identix.py
─────────────────────────────────────────────────────────────────────────────
Identix / ZKTeco Biometric Punch Machine Integration
For Taskosphere — FastAPI + MongoDB backend

HOW TO INTEGRATE:
1. pip install pyzk
2. Drop this file in your backend/ folder
3. In server.py add these 2 lines:
       from attendance_identix import identix_router
       api_router.include_router(identix_router)
4. After the new_user insert in /auth/register, add:
       asyncio.create_task(sync_user_to_identix_devices(new_user))

WHAT THIS DOES:
- When a user is registered → automatically added to ALL active Identix devices
  (only thumb fingerprint enrollment remains pending — done physically at the device)
- Admins can sync attendance logs from device to DB at any time
- No manual punch-in in the web app needed — machine data auto-imports
─────────────────────────────────────────────────────────────────────────────
"""

import asyncio
import uuid
import socket
import logging
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("identix")

# ─── Import directly from dependencies/models to avoid circular import ───────
from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

identix_router = APIRouter(prefix="/identix", tags=["Identix"])

# ─────────────────────────────────────────────────────────────────────────────
# PYZK HELPER — wraps ZKTeco SDK
# Install: pip install pyzk
# ─────────────────────────────────────────────────────────────────────────────

def _get_zk(ip: str, port: int = 4370, password: int = 0, timeout: int = 5):
    """Create a ZK connection object (does not connect yet)."""
    try:
        from zk import ZK
        return ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=False)
    except ImportError:
        raise RuntimeError(
            "pyzk not installed. Run: pip install pyzk\n"
            "Then restart the backend server."
        )

async def _tcp_reachable(ip: str, port: int, timeout: float = 3.0) -> bool:
    """Quick TCP ping to check if device is reachable."""
    loop = asyncio.get_event_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _blocking_tcp_ping(ip, port)),
            timeout=timeout,
        )
        return True
    except Exception:
        return False

def _blocking_tcp_ping(ip: str, port: int):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    try:
        s.connect((ip, port))
    finally:
        s.close()


# ─────────────────────────────────────────────────────────────────────────────
# BACKGROUND TASK — syncs a new user to all active Identix devices
# ─────────────────────────────────────────────────────────────────────────────

async def sync_user_to_identix_devices(user_doc: dict):
    """
    Called automatically after user registration.
    Pushes the user to all active Identix devices.
    Thumb fingerprint enrollment must be done at the device itself.
    """
    try:
        devices = await db.identix_devices.find({"is_active": True}).to_list(50)
        if not devices:
            logger.info("No active Identix devices to sync user to")
            return

        # Generate a numeric ID for the device (ZKTeco needs integer user IDs)
        identix_uid = user_doc.get("identix_uid")
        if not identix_uid:
            # Use a counter stored in DB
            counter = await db.counters.find_one_and_update(
                {"_id": "identix_uid"},
                {"$inc": {"seq": 1}},
                upsert=True,
                return_document=True,
            )
            identix_uid = counter.get("seq", 1)
            await db.users.update_one(
                {"id": user_doc["id"]},
                {"$set": {"identix_uid": identix_uid, "identix_enrolled": False, "thumb_enrolled": False}},
            )

        for device in devices:
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    _sync_single_user_to_device,
                    device,
                    identix_uid,
                    user_doc,
                )
                await db.users.update_one(
                    {"id": user_doc["id"]},
                    {"$set": {"identix_enrolled": True}},
                )
                logger.info(f"User {user_doc.get('full_name')} synced to device {device.get('name')}")
            except Exception as e:
                logger.error(f"Failed to sync user to device {device.get('name')}: {e}")

    except Exception as e:
        logger.error(f"sync_user_to_identix_devices failed: {e}")
        logger.error(traceback.format_exc())


def _sync_single_user_to_device(device: dict, identix_uid: int, user_doc: dict):
    """Blocking call — run in executor."""
    zk = _get_zk(
        ip=device["ip_address"],
        port=device.get("port", 4370),
        password=int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    try:
        conn.set_user(
            uid=identix_uid,
            name=user_doc.get("full_name", "")[:24],  # ZK max name length
            privilege=0,       # 0 = normal user, 14 = admin
            password="",
            group_id="",
            user_id=str(user_doc.get("id", identix_uid)),
            card=0,
        )
    finally:
        conn.disconnect()


def _remove_user_from_device(device: dict, identix_uid: int):
    """Blocking — remove user from device. Run in executor."""
    zk = _get_zk(
        ip=device["ip_address"],
        port=device.get("port", 4370),
        password=int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    try:
        conn.delete_user(uid=identix_uid)
    finally:
        conn.disconnect()


def _fetch_attendance_from_device(device: dict, from_dt: Optional[datetime] = None):
    """Blocking — fetch attendance logs. Run in executor."""
    zk = _get_zk(
        ip=device["ip_address"],
        port=device.get("port", 4370),
        password=int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    try:
        attendances = conn.get_attendance()
        result = []
        for att in attendances:
            punch_time = att.timestamp
            if isinstance(punch_time, str):
                punch_time = datetime.fromisoformat(punch_time)
            if from_dt and punch_time < from_dt:
                continue
            result.append({
                "device_user_id": att.user_id,
                "punch_time": punch_time.isoformat(),
                "punch_type": "out" if getattr(att, "punch", 0) == 1 else "in",
                "verify_mode": getattr(att, "status", 0),
                "log_id": getattr(att, "uid", None),
            })
        return result
    finally:
        conn.disconnect()


def _test_device_connection(device: dict):
    """Blocking — test device and return info. Run in executor."""
    zk = _get_zk(
        ip=device["ip_address"],
        port=device.get("port", 4370),
        password=int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    try:
        firmware = conn.get_firmware_version()
        serial = conn.get_serialnumber()
        users = conn.get_users()
        return {
            "serialNumber": serial,
            "firmware": firmware,
            "userCount": len(users) if users else 0,
        }
    finally:
        conn.disconnect()


def _sync_users_batch_to_device(device: dict, users: list):
    """Blocking — push multiple users to device. Run in executor."""
    zk = _get_zk(
        ip=device["ip_address"],
        port=device.get("port", 4370),
        password=int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    synced = 0
    failed = 0
    try:
        for u in users:
            try:
                conn.set_user(
                    uid=u["identix_uid"],
                    name=u.get("full_name", "")[:24],
                    privilege=0,
                    password="",
                    group_id="",
                    user_id=str(u.get("id", u["identix_uid"])),
                    card=0,
                )
                synced += 1
            except Exception:
                failed += 1
    finally:
        conn.disconnect()
    return synced, failed


# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────────────────────

class DeviceCreate(BaseModel):
    name: str
    ip_address: str
    port: int = 4370
    comm_password: str = "0"
    serial_number: Optional[str] = None
    location: Optional[str] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    comm_password: Optional[str] = None
    is_active: Optional[bool] = None
    location: Optional[str] = None


class SyncRequest(BaseModel):
    device_id: Optional[str] = None   # if None → sync all active devices
    from_date: Optional[str] = None   # ISO date string, e.g. "2024-01-01"
    to_date: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# DEVICE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/devices")
async def list_devices(current_user: User = Depends(require_admin)):
    """List all registered Identix devices."""
    devices = await db.identix_devices.find({}, {"_id": 0}).to_list(100)
    return {"devices": devices}


@identix_router.post("/devices")
async def add_device(payload: DeviceCreate, current_user: User = Depends(require_admin)):
    """Register a new Identix biometric device."""
    device_id = str(uuid.uuid4())
    doc = {
        "id": device_id,
        "name": payload.name,
        "ip_address": payload.ip_address,
        "port": payload.port,
        "comm_password": payload.comm_password,
        "serial_number": payload.serial_number,
        "location": payload.location,
        "is_active": True,
        "last_sync_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.identix_devices.insert_one(doc)
    doc.pop("_id", None)
    return {"device": doc, "message": "Device registered successfully"}


@identix_router.put("/devices/{device_id}")
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    current_user: User = Depends(require_admin),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.identix_devices.find_one_and_update(
        {"id": device_id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Device not found")
    result.pop("_id", None)
    return {"device": result}


@identix_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: User = Depends(require_admin)):
    result = await db.identix_devices.delete_one({"id": device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted"}


@identix_router.post("/devices/{device_id}/test")
async def test_device(device_id: str, current_user: User = Depends(require_admin)):
    """Test connection to a specific Identix device."""
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    reachable = await _tcp_reachable(device["ip_address"], device.get("port", 4370))
    if not reachable:
        return {
            "success": False,
            "message": f"Cannot reach device at {device['ip_address']}:{device.get('port', 4370)}. "
                       "Check IP, port, and that the device is powered on.",
            "deviceInfo": None,
        }

    try:
        info = await asyncio.get_event_loop().run_in_executor(
            None, _test_device_connection, device
        )
        return {"success": True, "message": "Connected successfully", "deviceInfo": info}
    except Exception as e:
        return {"success": False, "message": str(e), "deviceInfo": None}


@identix_router.post("/devices/{device_id}/sync-users")
async def sync_users_to_device(device_id: str, current_user: User = Depends(require_admin)):
    """Push all system users to a specific Identix device."""
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    users = await db.users.find(
        {"identix_uid": {"$exists": True}, "is_active": True},
        {"_id": 0, "id": 1, "full_name": 1, "identix_uid": 1},
    ).to_list(1000)

    if not users:
        return {"success": True, "synced": 0, "failed": 0, "message": "No users with Identix UIDs found"}

    try:
        synced, failed = await asyncio.get_event_loop().run_in_executor(
            None, _sync_users_batch_to_device, device, users
        )

        # Mark users as enrolled
        for u in users:
            await db.users.update_one({"id": u["id"]}, {"$set": {"identix_enrolled": True}})

        return {
            "success": failed == 0,
            "synced": synced,
            "failed": failed,
            "message": f"Synced {synced} users to device ({failed} failed)",
        }
    except Exception as e:
        return {"success": False, "synced": 0, "failed": len(users), "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANCE SYNC ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.post("/attendance/sync")
async def sync_attendance(
    payload: SyncRequest,
    current_user: User = Depends(require_admin),
):
    """
    Pull attendance records from Identix device(s) and store in MongoDB.
    Existing records (by log_id + device) are skipped to prevent duplicates.
    """
    if payload.device_id:
        devices = await db.identix_devices.find(
            {"id": payload.device_id}, {"_id": 0}
        ).to_list(1)
    else:
        devices = await db.identix_devices.find({"is_active": True}, {"_id": 0}).to_list(50)

    if not devices:
        return {"success": False, "newRecords": 0, "totalFetched": 0, "message": "No active devices found", "errors": []}

    from_dt = None
    if payload.from_date:
        try:
            from_dt = datetime.fromisoformat(payload.from_date)
        except ValueError:
            pass

    # Build user lookup: device_user_id (string or int) → user doc
    all_users = await db.users.find(
        {"identix_uid": {"$exists": True}},
        {"_id": 0, "id": 1, "full_name": 1, "identix_uid": 1, "departments": 1},
    ).to_list(1000)
    uid_to_user = {str(u["identix_uid"]): u for u in all_users}

    total_fetched = 0
    total_new = 0
    errors = []

    for device in devices:
        try:
            logs = await asyncio.get_event_loop().run_in_executor(
                None, _fetch_attendance_from_device, device, from_dt
            )
            total_fetched += len(logs)

            for log in logs:
                device_uid = str(log["device_user_id"])
                user = uid_to_user.get(device_uid)

                # Skip if we already have this exact log
                existing = await db.identix_attendance.find_one({
                    "log_id": log.get("log_id"),
                    "device_id": device["id"],
                })
                if existing:
                    continue

                record = {
                    "id": str(uuid.uuid4()),
                    "device_id": device["id"],
                    "device_name": device.get("name"),
                    "device_user_id": device_uid,
                    "punch_time": log["punch_time"],
                    "punch_type": log["punch_type"],
                    "verify_mode": log.get("verify_mode", 0),
                    "log_id": log.get("log_id"),
                    "source": "machine",
                    # User info (may be None if user was deleted)
                    "user_id": user["id"] if user else None,
                    "user_name": user["full_name"] if user else f"Unknown (Device UID {device_uid})",
                    "department": user["departments"][0] if user and user.get("departments") else None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.identix_attendance.insert_one(record)
                total_new += 1

            # Update device last sync time
            await db.identix_devices.update_one(
                {"id": device["id"]},
                {"$set": {"last_sync_at": datetime.now(timezone.utc).isoformat()}},
            )

        except Exception as e:
            errors.append(f"{device.get('name', device['id'])}: {str(e)}")
            logger.error(f"Failed to sync from device {device.get('name')}: {e}")

    return {
        "success": len(errors) == 0,
        "newRecords": total_new,
        "totalFetched": total_fetched,
        "message": f"Imported {total_new} new punch records from {len(devices)} device(s)",
        "errors": errors,
    }


@identix_router.get("/attendance")
async def get_identix_attendance(
    page: int = 1,
    limit: int = 50,
    user_id: Optional[str] = None,
    department: Optional[str] = None,
    date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: User = Depends(require_admin),
):
    """Fetch attendance records that came from the Identix machine."""
    query = {}

    if user_id:
        query["user_id"] = user_id
    if department:
        query["department"] = department
    if date:
        try:
            d = datetime.fromisoformat(date)
            query["punch_time"] = {
                "$gte": d.replace(hour=0, minute=0, second=0).isoformat(),
                "$lte": d.replace(hour=23, minute=59, second=59).isoformat(),
            }
        except ValueError:
            pass
    elif from_date or to_date:
        time_filter = {}
        if from_date:
            time_filter["$gte"] = from_date
        if to_date:
            try:
                td = datetime.fromisoformat(to_date)
                time_filter["$lte"] = td.replace(hour=23, minute=59, second=59).isoformat()
            except ValueError:
                time_filter["$lte"] = to_date
        if time_filter:
            query["punch_time"] = time_filter

    skip = (page - 1) * limit
    total = await db.identix_attendance.count_documents(query)
    records = await db.identix_attendance.find(query, {"_id": 0}).sort(
        "punch_time", -1
    ).skip(skip).limit(limit).to_list(limit)

    return {"records": records, "total": total, "page": page, "limit": limit}


@identix_router.get("/attendance/summary")
async def get_attendance_summary(
    date: Optional[str] = None,
    current_user: User = Depends(require_admin),
):
    """Today's or a specific day's attendance summary from the Identix machine."""
    if date:
        try:
            target = datetime.fromisoformat(date)
        except ValueError:
            target = datetime.now(timezone.utc)
    else:
        target = datetime.now(timezone.utc)

    day_start = target.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    day_end = target.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()

    # Distinct users who punched today
    punched_today = await db.identix_attendance.distinct(
        "user_id", {"punch_time": {"$gte": day_start, "$lte": day_end}, "user_id": {"$ne": None}}
    )

    # All active non-admin users
    total_employees = await db.users.count_documents({"is_active": True, "role": {"$ne": "admin"}})

    # Pending thumb enrollment
    pending_thumb = await db.users.count_documents(
        {"is_active": True, "thumb_enrolled": {"$ne": True}, "identix_uid": {"$exists": True}}
    )

    # Recent 10 punches
    recent = await db.identix_attendance.find({}, {"_id": 0}).sort(
        "punch_time", -1
    ).limit(10).to_list(10)

    # Department breakdown
    pipeline = [
        {"$match": {"punch_time": {"$gte": day_start, "$lte": day_end}}},
        {"$group": {"_id": "$department", "count": {"$addToSet": "$user_id"}}},
        {"$project": {"department": "$_id", "present": {"$size": "$count"}, "_id": 0}},
    ]
    dept_stats = await db.identix_attendance.aggregate(pipeline).to_list(50)

    return {
        "date": target.date().isoformat(),
        "totalEmployees": total_employees,
        "totalPresent": len(punched_today),
        "totalAbsent": max(0, total_employees - len(punched_today)),
        "pendingThumbEnrollment": pending_thumb,
        "byDepartment": dept_stats,
        "recentActivity": recent,
    }


# ─────────────────────────────────────────────────────────────────────────────
# USER ENROLLMENT STATUS
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/users")
async def get_identix_users(current_user: User = Depends(require_admin)):
    """All users with their Identix enrollment status."""
    users = await db.users.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "full_name": 1,
            "email": 1,
            "role": 1,
            "departments": 1,
            "is_active": 1,
            "identix_uid": 1,
            "identix_enrolled": 1,
            "thumb_enrolled": 1,
            "created_at": 1,
        },
    ).to_list(500)
    return {"users": users}


@identix_router.patch("/users/{user_id}/thumb-enrolled")
async def mark_thumb_enrolled(
    user_id: str,
    current_user: User = Depends(require_admin),
):
    """Admin marks a user's thumb fingerprint as enrolled at the device."""
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": {"thumb_enrolled": True}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Thumb enrollment marked as complete", "user_id": user_id}


@identix_router.post("/users/{user_id}/sync-to-device")
async def sync_single_user_to_devices(
    user_id: str,
    current_user: User = Depends(require_admin),
):
    """Manually push a specific user to all active Identix devices."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("identix_uid"):
        # Assign an ID
        counter = await db.counters.find_one_and_update(
            {"_id": "identix_uid"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True,
        )
        identix_uid = counter.get("seq", 1)
        await db.users.update_one({"id": user_id}, {"$set": {"identix_uid": identix_uid}})
        user["identix_uid"] = identix_uid

    asyncio.create_task(sync_user_to_identix_devices(user))
    return {"message": f"Syncing {user['full_name']} to all active devices in background"}
