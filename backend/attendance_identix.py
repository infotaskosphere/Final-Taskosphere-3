"""
attendance_identix.py  — UPDATED
─────────────────────────────────────────────────────────────────────────────
Changes from previous version:
  1. NEW:  POST /identix/devices/scan    — kick off async LAN scan
  2. NEW:  GET  /identix/devices/scan/{scan_id} — poll scan progress/results
  3. The scan probes every IP in a /24 subnet on the given port (default 4370)
     concurrently (asyncio.gather with semaphore), so 254 hosts take ~3-5 s.
  4. If pyzk is installed it also connects and reads device info for
     confirmed ZKTeco machines; otherwise it just reports "reachable on port".

HOW TO INTEGRATE (unchanged from previous version):
  1. pip install pyzk
  2. Drop this file in backend/
  3. In server.py:
       from attendance_identix import identix_router
       api_router.include_router(identix_router)
  4. After new_user insert in /auth/register:
       asyncio.create_task(sync_user_to_identix_devices(new_user))
─────────────────────────────────────────────────────────────────────────────
"""

import asyncio
import uuid
import socket
import logging
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel

logger = logging.getLogger("identix")

from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

identix_router = APIRouter(prefix="/identix", tags=["Identix"])

# ─────────────────────────────────────────────────────────────────────────────
# IN-MEMORY SCAN STATE  (keyed by scan_id UUID)
# ─────────────────────────────────────────────────────────────────────────────
# { scan_id: { "done": bool, "progress": 0-100, "found": [...], "message": str } }
_SCAN_STATE: Dict[str, Dict[str, Any]] = {}

# ─────────────────────────────────────────────────────────────────────────────
# PYZK HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_zk(ip: str, port: int = 4370, password: int = 0, timeout: int = 5):
    try:
        from zk import ZK
        return ZK(ip, port=port, timeout=timeout, password=password,
                  force_udp=False, ommit_ping=False)
    except ImportError:
        raise RuntimeError(
            "pyzk not installed. Run: pip install pyzk\n"
            "Then restart the backend server."
        )


async def _tcp_reachable(ip: str, port: int, timeout: float = 1.5) -> bool:
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
    s.settimeout(1.5)
    try:
        s.connect((ip, port))
    finally:
        s.close()


def _try_get_device_info(ip: str, port: int, password: int = 0) -> Optional[dict]:
    """
    Try to connect via pyzk and read device info.
    Returns dict or None if pyzk unavailable / connection fails.
    """
    try:
        zk   = _get_zk(ip, port, password, timeout=4)
        conn = zk.connect()
        try:
            firmware = conn.get_firmware_version()
            serial   = conn.get_serialnumber()
            users    = conn.get_users()
            return {
                "serialNumber": serial,
                "firmware":     firmware,
                "userCount":    len(users) if users else 0,
            }
        finally:
            conn.disconnect()
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# LAN SCAN — background coroutine
# ─────────────────────────────────────────────────────────────────────────────

async def _do_lan_scan(
    scan_id: str,
    subnet: str,       # e.g. "192.168.1"
    port: int,
    registered_ips: set,
):
    """
    Concurrently probe all 254 hosts on the /24 subnet.
    Updates _SCAN_STATE[scan_id] progressively.
    """
    state    = _SCAN_STATE[scan_id]
    hosts    = [f"{subnet}.{i}" for i in range(1, 255)]
    total    = len(hosts)
    done_ct  = 0
    sem      = asyncio.Semaphore(64)   # max 64 concurrent TCP probes

    async def probe(ip: str):
        nonlocal done_ct
        async with sem:
            reachable = await _tcp_reachable(ip, port, timeout=1.5)
            if reachable:
                # Try to get ZKTeco device info (non-blocking via executor)
                loop        = asyncio.get_event_loop()
                device_info = await loop.run_in_executor(
                    None, _try_get_device_info, ip, port
                )
                entry = {
                    "ip_address":          ip,
                    "port":                port,
                    "device_info":         device_info,
                    "already_registered":  ip in registered_ips,
                }
                state["found"].append(entry)
                state["message"] = (
                    f"Found {len(state['found'])} device(s) so far… "
                    f"({done_ct}/{total} hosts checked)"
                )
        done_ct += 1
        state["progress"] = int((done_ct / total) * 100)

    await asyncio.gather(*[probe(ip) for ip in hosts])

    state["done"]     = True
    state["progress"] = 100
    count = len(state["found"])
    state["message"] = (
        f"Scan complete — {count} ZKTeco device(s) found on {subnet}.0/24"
        if count else
        f"Scan complete — no devices found on {subnet}.0/24 port {port}"
    )


def _auto_detect_subnet() -> str:
    """
    Attempt to detect the host's local subnet automatically.
    Falls back to 192.168.1.
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split(".")
        return ".".join(parts[:3])          # e.g. "192.168.1"
    except Exception:
        return "192.168.1"


# ─────────────────────────────────────────────────────────────────────────────
# BACKGROUND TASK — sync new user to all active devices
# ─────────────────────────────────────────────────────────────────────────────

async def sync_user_to_identix_devices(user_doc: dict):
    try:
        devices = await db.identix_devices.find({"is_active": True}).to_list(50)
        if not devices:
            logger.info("No active Identix devices to sync user to")
            return

        identix_uid = user_doc.get("identix_uid")
        if not identix_uid:
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
                    None, _sync_single_user_to_device, device, identix_uid, user_doc,
                )
                await db.users.update_one(
                    {"id": user_doc["id"]},
                    {"$set": {"identix_enrolled": True}},
                )
                logger.info(f"User {user_doc.get('full_name')} synced to {device.get('name')}")
            except Exception as e:
                logger.error(f"Failed to sync user to device {device.get('name')}: {e}")

    except Exception as e:
        logger.error(f"sync_user_to_identix_devices failed: {e}\n{traceback.format_exc()}")


def _sync_single_user_to_device(device: dict, identix_uid: int, user_doc: dict):
    zk   = _get_zk(device["ip_address"], device.get("port", 4370), int(device.get("comm_password", 0)))
    conn = zk.connect()
    try:
        conn.set_user(
            uid=identix_uid,
            name=user_doc.get("full_name", "")[:24],
            privilege=0, password="", group_id="",
            user_id=str(user_doc.get("id", identix_uid)), card=0,
        )
    finally:
        conn.disconnect()


def _remove_user_from_device(device: dict, identix_uid: int):
    zk   = _get_zk(device["ip_address"], device.get("port", 4370), int(device.get("comm_password", 0)))
    conn = zk.connect()
    try:
        conn.delete_user(uid=identix_uid)
    finally:
        conn.disconnect()


def _fetch_attendance_from_device(device: dict, from_dt=None):
    zk   = _get_zk(device["ip_address"], device.get("port", 4370), int(device.get("comm_password", 0)))
    conn = zk.connect()
    try:
        result = []
        for att in conn.get_attendance():
            punch_time = att.timestamp
            if isinstance(punch_time, str):
                punch_time = datetime.fromisoformat(punch_time)
            if from_dt and punch_time < from_dt:
                continue
            result.append({
                "device_user_id": att.user_id,
                "punch_time":     punch_time.isoformat(),
                "punch_type":     "out" if getattr(att, "punch", 0) == 1 else "in",
                "verify_mode":    getattr(att, "status", 0),
                "log_id":         getattr(att, "uid", None),
            })
        return result
    finally:
        conn.disconnect()


def _test_device_connection(device: dict):
    zk   = _get_zk(device["ip_address"], device.get("port", 4370), int(device.get("comm_password", 0)))
    conn = zk.connect()
    try:
        return {
            "serialNumber": conn.get_serialnumber(),
            "firmware":     conn.get_firmware_version(),
            "userCount":    len(conn.get_users() or []),
        }
    finally:
        conn.disconnect()


def _sync_users_batch_to_device(device: dict, users: list):
    zk     = _get_zk(device["ip_address"], device.get("port", 4370), int(device.get("comm_password", 0)))
    conn   = zk.connect()
    synced = 0
    failed = 0
    try:
        for u in users:
            try:
                conn.set_user(
                    uid=u["identix_uid"],
                    name=u.get("full_name", "")[:24],
                    privilege=0, password="", group_id="",
                    user_id=str(u.get("id", u["identix_uid"])), card=0,
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
    name:            str
    ip_address:      str
    port:            int  = 4370
    comm_password:   str  = "0"
    serial_number:   Optional[str] = None
    location:        Optional[str] = None


class DeviceUpdate(BaseModel):
    name:            Optional[str]  = None
    ip_address:      Optional[str]  = None
    port:            Optional[int]  = None
    comm_password:   Optional[str]  = None
    is_active:       Optional[bool] = None
    location:        Optional[str]  = None


class SyncRequest(BaseModel):
    device_id:  Optional[str] = None
    from_date:  Optional[str] = None
    to_date:    Optional[str] = None


class ScanRequest(BaseModel):
    subnet:  Optional[str] = None   # e.g. "192.168.1"  (auto-detect if None)
    port:    int           = 4370


# ─────────────────────────────────────────────────────────────────────────────
# DEVICE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/devices")
async def list_devices(current_user: User = Depends(require_admin)):
    devices = await db.identix_devices.find({}, {"_id": 0}).to_list(100)
    return {"devices": devices}


@identix_router.post("/devices")
async def add_device(payload: DeviceCreate, current_user: User = Depends(require_admin)):
    device_id = str(uuid.uuid4())
    doc = {
        "id":             device_id,
        "name":           payload.name,
        "ip_address":     payload.ip_address,
        "port":           payload.port,
        "comm_password":  payload.comm_password,
        "serial_number":  payload.serial_number,
        "location":       payload.location,
        "is_active":      True,
        "last_sync_at":   None,
        "created_at":     datetime.now(timezone.utc).isoformat(),
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
        {"id": device_id}, {"$set": updates}, return_document=True
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
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    reachable = await _tcp_reachable(device["ip_address"], device.get("port", 4370))
    if not reachable:
        return {
            "success": False,
            "message": (
                f"Cannot reach {device['ip_address']}:{device.get('port', 4370)}. "
                "Check IP, port, power, and firewall."
            ),
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
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    users = await db.users.find(
        {"identix_uid": {"$exists": True}, "is_active": True},
        {"_id": 0, "id": 1, "full_name": 1, "identix_uid": 1},
    ).to_list(1000)

    if not users:
        return {"success": True, "synced": 0, "failed": 0, "message": "No users with Identix UIDs"}

    try:
        synced, failed = await asyncio.get_event_loop().run_in_executor(
            None, _sync_users_batch_to_device, device, users
        )
        for u in users:
            await db.users.update_one({"id": u["id"]}, {"$set": {"identix_enrolled": True}})
        return {
            "success": failed == 0,
            "synced":  synced,
            "failed":  failed,
            "message": f"Synced {synced} users ({failed} failed)",
        }
    except Exception as e:
        return {"success": False, "synced": 0, "failed": len(users), "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# ★ NEW: LAN SCAN ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.post("/devices/scan")
async def start_lan_scan(
    payload: ScanRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_admin),
):
    """
    Kick off an async LAN scan for ZKTeco/Identix devices.
    Returns a scan_id immediately; poll GET /devices/scan/{scan_id} for results.
    """
    scan_id = str(uuid.uuid4())

    # Resolve subnet
    subnet = (payload.subnet or "").strip()
    if not subnet:
        subnet = _auto_detect_subnet()

    # Get already-registered IPs for "already_registered" flag
    existing = await db.identix_devices.find({}, {"_id": 0, "ip_address": 1}).to_list(100)
    registered_ips = {d["ip_address"] for d in existing}

    # Initialise state
    _SCAN_STATE[scan_id] = {
        "done":     False,
        "progress": 0,
        "found":    [],
        "subnet":   subnet,
        "port":     payload.port,
        "message":  f"Scanning {subnet}.0/24 on port {payload.port}…",
    }

    # Launch background scan
    background_tasks.add_task(
        _do_lan_scan, scan_id, subnet, payload.port, registered_ips
    )

    return {
        "scan_id": scan_id,
        "subnet":  subnet,
        "port":    payload.port,
        "message": f"Scanning {subnet}.0/24 on port {payload.port}…",
    }


@identix_router.get("/devices/scan/{scan_id}")
async def poll_lan_scan(
    scan_id: str,
    current_user: User = Depends(require_admin),
):
    """Poll the status and results of an in-progress LAN scan."""
    state = _SCAN_STATE.get(scan_id)
    if not state:
        raise HTTPException(status_code=404, detail="Scan not found or expired")
    return state


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANCE SYNC ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.post("/attendance/sync")
async def sync_attendance(
    payload: SyncRequest,
    current_user: User = Depends(require_admin),
):
    if payload.device_id:
        devices = await db.identix_devices.find({"id": payload.device_id}, {"_id": 0}).to_list(1)
    else:
        devices = await db.identix_devices.find({"is_active": True}, {"_id": 0}).to_list(50)

    if not devices:
        return {"success": False, "newRecords": 0, "totalFetched": 0, "message": "No active devices", "errors": []}

    from_dt = None
    if payload.from_date:
        try:
            from_dt = datetime.fromisoformat(payload.from_date)
        except ValueError:
            pass

    all_users   = await db.users.find(
        {"identix_uid": {"$exists": True}},
        {"_id": 0, "id": 1, "full_name": 1, "identix_uid": 1, "departments": 1},
    ).to_list(1000)
    uid_to_user = {str(u["identix_uid"]): u for u in all_users}

    total_fetched = 0
    total_new     = 0
    errors        = []

    for device in devices:
        try:
            logs = await asyncio.get_event_loop().run_in_executor(
                None, _fetch_attendance_from_device, device, from_dt
            )
            total_fetched += len(logs)

            for log in logs:
                device_uid = str(log["device_user_id"])
                user       = uid_to_user.get(device_uid)

                existing = await db.identix_attendance.find_one({
                    "log_id":    log.get("log_id"),
                    "device_id": device["id"],
                })
                if existing:
                    continue

                record = {
                    "id":             str(uuid.uuid4()),
                    "device_id":      device["id"],
                    "device_name":    device.get("name"),
                    "device_user_id": device_uid,
                    "punch_time":     log["punch_time"],
                    "punch_type":     log["punch_type"],
                    "verify_mode":    log.get("verify_mode", 0),
                    "log_id":         log.get("log_id"),
                    "source":         "machine",
                    "user_id":        user["id"]        if user else None,
                    "user_name":      user["full_name"] if user else f"Unknown (UID {device_uid})",
                    "department":     user["departments"][0] if user and user.get("departments") else None,
                    "created_at":     datetime.now(timezone.utc).isoformat(),
                }
                await db.identix_attendance.insert_one(record)
                total_new += 1

            await db.identix_devices.update_one(
                {"id": device["id"]},
                {"$set": {"last_sync_at": datetime.now(timezone.utc).isoformat()}},
            )
        except Exception as e:
            errors.append(f"{device.get('name', device['id'])}: {str(e)}")
            logger.error(f"Failed to sync from {device.get('name')}: {e}")

    return {
        "success":      len(errors) == 0,
        "newRecords":   total_new,
        "totalFetched": total_fetched,
        "message":      f"Imported {total_new} new records from {len(devices)} device(s)",
        "errors":       errors,
    }


@identix_router.get("/attendance")
async def get_identix_attendance(
    page:        int           = 1,
    limit:       int           = 50,
    user_id:     Optional[str] = None,
    department:  Optional[str] = None,
    date:        Optional[str] = None,
    from_date:   Optional[str] = None,
    to_date:     Optional[str] = None,
    current_user: User = Depends(require_admin),
):
    query = {}
    if user_id:     query["user_id"]    = user_id
    if department:  query["department"] = department
    if date:
        try:
            d = datetime.fromisoformat(date)
            query["punch_time"] = {
                "$gte": d.replace(hour=0,  minute=0,  second=0).isoformat(),
                "$lte": d.replace(hour=23, minute=59, second=59).isoformat(),
            }
        except ValueError:
            pass
    elif from_date or to_date:
        tf = {}
        if from_date: tf["$gte"] = from_date
        if to_date:
            try:
                td = datetime.fromisoformat(to_date)
                tf["$lte"] = td.replace(hour=23, minute=59, second=59).isoformat()
            except ValueError:
                tf["$lte"] = to_date
        if tf:
            query["punch_time"] = tf

    skip    = (page - 1) * limit
    total   = await db.identix_attendance.count_documents(query)
    records = await db.identix_attendance.find(query, {"_id": 0}).sort(
        "punch_time", -1
    ).skip(skip).limit(limit).to_list(limit)
    return {"records": records, "total": total, "page": page, "limit": limit}


@identix_router.get("/attendance/summary")
async def get_attendance_summary(
    date: Optional[str] = None,
    current_user: User  = Depends(require_admin),
):
    try:
        target = datetime.fromisoformat(date) if date else datetime.now(timezone.utc)
    except ValueError:
        target = datetime.now(timezone.utc)

    day_start = target.replace(hour=0,  minute=0,  second=0,  microsecond=0).isoformat()
    day_end   = target.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()

    punched_today    = await db.identix_attendance.distinct(
        "user_id", {"punch_time": {"$gte": day_start, "$lte": day_end}, "user_id": {"$ne": None}}
    )
    total_employees  = await db.users.count_documents({"is_active": True, "role": {"$ne": "admin"}})
    pending_thumb    = await db.users.count_documents(
        {"is_active": True, "thumb_enrolled": {"$ne": True}, "identix_uid": {"$exists": True}}
    )
    recent           = await db.identix_attendance.find({}, {"_id": 0}).sort("punch_time", -1).limit(10).to_list(10)

    pipeline = [
        {"$match":   {"punch_time": {"$gte": day_start, "$lte": day_end}}},
        {"$group":   {"_id": "$department", "count": {"$addToSet": "$user_id"}}},
        {"$project": {"department": "$_id", "present": {"$size": "$count"}, "_id": 0}},
    ]
    dept_stats = await db.identix_attendance.aggregate(pipeline).to_list(50)

    return {
        "date":                     target.date().isoformat(),
        "totalEmployees":           total_employees,
        "totalPresent":             len(punched_today),
        "totalAbsent":              max(0, total_employees - len(punched_today)),
        "pendingThumbEnrollment":   pending_thumb,
        "byDepartment":             dept_stats,
        "recentActivity":           recent,
    }


# ─────────────────────────────────────────────────────────────────────────────
# USER ENROLLMENT ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/users")
async def get_identix_users(current_user: User = Depends(require_admin)):
    users = await db.users.find(
        {},
        {
            "_id": 0, "id": 1, "full_name": 1, "email": 1, "role": 1,
            "departments": 1, "is_active": 1,
            "identix_uid": 1, "identix_enrolled": 1, "thumb_enrolled": 1, "created_at": 1,
        },
    ).to_list(500)
    return {"users": users}


@identix_router.patch("/users/{user_id}/thumb-enrolled")
async def mark_thumb_enrolled(user_id: str, current_user: User = Depends(require_admin)):
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": {"thumb_enrolled": True}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Thumb enrollment marked complete", "user_id": user_id}


@identix_router.post("/users/{user_id}/sync-to-device")
async def sync_single_user_to_devices(user_id: str, current_user: User = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("identix_uid"):
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
