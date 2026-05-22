"""
attendance_identix.py  — COMPLETE REWRITE (all fixes applied)
─────────────────────────────────────────────────────────────────────────────
Routes provided:
  DEVICES
    GET    /identix/devices
    POST   /identix/devices
    PUT    /identix/devices/{device_id}
    DELETE /identix/devices/{device_id}
    POST   /identix/devices/{device_id}/test
    POST   /identix/devices/{device_id}/sync-users
    POST   /identix/devices/scan
    GET    /identix/devices/scan/{scan_id}

  ATTENDANCE
    GET    /identix/attendance          (paginated, filterable)
    POST   /identix/attendance/sync
    GET    /identix/attendance/summary  ← was missing (404 fixed)

  ENROLLMENT
    GET    /identix/users
    PATCH  /identix/users/{user_id}/thumb-enrolled
    POST   /identix/users/{user_id}/sync-to-device

HOW TO INTEGRATE:
  1. pip install pyzk
  2. Drop this file in backend/
  3. In server.py:
       from attendance_identix import identix_router
       api_router.include_router(identix_router)
  4. After new_user insert in /auth/register:
       asyncio.create_task(sync_user_to_identix_devices(new_user))
─────────────────────────────────────────────────────────────────────────────
"""

import os
import asyncio
import uuid
import socket
import logging
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import Request
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

logger = logging.getLogger("identix")

from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

identix_router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD / LAN MODE DETECTION
# ─────────────────────────────────────────────────────────────────────────────
# In cloud mode (Render / production) the backend CANNOT reach the device on
# its LAN IP, so any pyzk/TCP socket attempt would fail. Instead, the device
# pushes data via ADMS to /iclock/cdata and pulls commands from
# /iclock/getrequest. In LAN mode (local dev) the legacy pyzk path stays
# available for backward compatibility.
def _is_cloud_mode() -> bool:
    val = (
        os.getenv("ADMS_CLOUD_MODE")
        or os.getenv("BIOMETRIC_MODE")
        or ("cloud" if os.getenv("RENDER") else "")
        or os.getenv("ENVIRONMENT", "")
    ).strip().lower()
    if val in ("cloud", "production", "render", "prod", "1", "true", "yes"):
        return True
    if val in ("lan", "local", "development", "dev", "0", "false", "no"):
        return False
    # Default: assume cloud if running on Render-like infra
    return bool(os.getenv("RENDER") or os.getenv("RENDER_EXTERNAL_URL"))


HEARTBEAT_ONLINE_SECONDS = 120  # 2 minutes

# ─────────────────────────────────────────────────────────────────────────────
# IN-MEMORY SCAN STATE  (keyed by scan_id UUID)
# ─────────────────────────────────────────────────────────────────────────────
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
    """Try to connect via pyzk and read device info. Returns dict or None."""
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


def _test_device_connection(device: dict) -> dict:
    zk   = _get_zk(
        device["ip_address"],
        device.get("port", 4370),
        int(device.get("comm_password", 0)),
    )
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
    zk     = _get_zk(
        device["ip_address"],
        device.get("port", 4370),
        int(device.get("comm_password", 0)),
    )
    conn   = zk.connect()
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


def _sync_single_user_to_device(device: dict, identix_uid: int, user_doc: dict):
    zk   = _get_zk(
        device["ip_address"],
        device.get("port", 4370),
        int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    try:
        conn.set_user(
            uid=identix_uid,
            name=user_doc.get("full_name", "")[:24],
            privilege=0,
            password="",
            group_id="",
            user_id=str(user_doc.get("id", identix_uid)),
            card=0,
        )
    finally:
        conn.disconnect()


def _remove_user_from_device(device: dict, identix_uid: int):
    zk   = _get_zk(
        device["ip_address"],
        device.get("port", 4370),
        int(device.get("comm_password", 0)),
    )
    conn = zk.connect()
    try:
        conn.delete_user(uid=identix_uid)
    finally:
        conn.disconnect()


def _fetch_attendance_from_device(device: dict, from_dt=None) -> list:
    zk   = _get_zk(
        device["ip_address"],
        device.get("port", 4370),
        int(device.get("comm_password", 0)),
    )
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


# ─────────────────────────────────────────────────────────────────────────────
# LAN SCAN — background coroutine
# ─────────────────────────────────────────────────────────────────────────────

def _auto_detect_subnet() -> str:
    """Attempt to detect the host's local subnet. Falls back to 192.168.1."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split(".")
        return ".".join(parts[:3])
    except Exception:
        return "192.168.1"


async def _do_lan_scan(
    scan_id: str,
    subnet: str,
    port: int,
    registered_ips: set,
):
    """Concurrently probe all 254 hosts on the /24 subnet."""
    state   = _SCAN_STATE[scan_id]
    hosts   = [f"{subnet}.{i}" for i in range(1, 255)]
    total   = len(hosts)
    done_ct = 0
    sem     = asyncio.Semaphore(64)

    async def probe(ip: str):
        nonlocal done_ct
        async with sem:
            reachable = await _tcp_reachable(ip, port, timeout=1.5)
            if reachable:
                loop        = asyncio.get_event_loop()
                device_info = await loop.run_in_executor(
                    None, _try_get_device_info, ip, port
                )
                entry = {
                    "ip_address":         ip,
                    "port":               port,
                    "device_info":        device_info,
                    "already_registered": ip in registered_ips,
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
    count             = len(state["found"])
    state["message"]  = (
        f"Scan complete — {count} ZKTeco device(s) found on {subnet}.0/24"
        if count else
        f"Scan complete — no devices found on {subnet}.0/24 port {port}"
    )


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
                {"$set": {
                    "identix_uid":      identix_uid,
                    "identix_enrolled": False,
                    "thumb_enrolled":   False,
                }},
            )

        cloud = _is_cloud_mode()

        for device in devices:
            try:
                if cloud:
                    sn = device.get("serial_number")
                    if not sn:
                        logger.info(
                            f"[ADMS COMMAND] skipped {device.get('name')}: no serial_number yet"
                        )
                        continue
                    await _queue_device_command(
                        sn, _build_userinfo_command({**user_doc, "identix_uid": identix_uid})
                    )
                else:
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
        logger.error(
            f"sync_user_to_identix_devices failed: {e}\n{traceback.format_exc()}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────────────────────────────────────

class DeviceCreate(BaseModel):
    name:           str
    ip_address:     str
    port:           int = 4370
    comm_password:  str = "0"
    serial_number:  Optional[str] = None
    location:       Optional[str] = None


class DeviceUpdate(BaseModel):
    name:           Optional[str]  = None
    ip_address:     Optional[str]  = None
    port:           Optional[int]  = None
    comm_password:  Optional[str]  = None
    is_active:      Optional[bool] = None
    location:       Optional[str]  = None
    serial_number:  Optional[str]  = None


class SyncRequest(BaseModel):
    device_id:  Optional[str] = None
    from_date:  Optional[str] = None
    to_date:    Optional[str] = None


class ScanRequest(BaseModel):
    subnet: Optional[str] = None
    port:   int           = 4370


# ─────────────────────────────────────────────────────────────────────────────
# DEVICE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/devices")
async def list_devices(current_user: User = Depends(require_admin())):
    devices = await db.identix_devices.find({}, {"_id": 0}).to_list(100)
    return {"devices": devices}


@identix_router.post("/devices")
async def add_device(
    payload: DeviceCreate,
    current_user: User = Depends(require_admin()),
):
    device_id = str(uuid.uuid4())
    doc = {
        "id":            device_id,
        "name":          payload.name,
        "ip_address":    payload.ip_address,
        "port":          payload.port,
        "comm_password": payload.comm_password,
        "serial_number": payload.serial_number,
        "location":      payload.location,
        "is_active":     True,
        "last_sync_at":  None,
        "created_at":    datetime.now(timezone.utc).isoformat(),
    }
    await db.identix_devices.insert_one(doc)
    doc.pop("_id", None)
    return {"device": doc, "message": "Device registered successfully"}


@identix_router.put("/devices/{device_id}")
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    current_user: User = Depends(require_admin()),
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
async def delete_device(
    device_id: str,
    current_user: User = Depends(require_admin()),
):
    result = await db.identix_devices.delete_one({"id": device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# HEARTBEAT + COMMAND-QUEUE HELPERS (ADMS cloud model)
# ─────────────────────────────────────────────────────────────────────────────

async def _record_heartbeat(serial: Optional[str], ip: Optional[str]) -> None:
    """Upsert heartbeat into device_heartbeats and mirror onto identix_devices."""
    if not serial:
        return
    now = datetime.now(timezone.utc)
    try:
        await db.device_heartbeats.update_one(
            {"serial_number": serial},
            {"$set": {
                "serial_number": serial,
                "last_seen":     now,
                "last_ip":       ip,
            }},
            upsert=True,
        )
        # Mirror onto registered device (match by serial_number or last_ip)
        match: Dict[str, Any] = {"$or": [{"serial_number": serial}]}
        if ip:
            match["$or"].append({"ip_address": ip})
        await db.identix_devices.update_one(
            match,
            {"$set": {
                "last_seen":     now.isoformat(),
                "last_ip":       ip,
                "serial_number": serial,
            }},
        )
    except Exception as e:
        logger.warning(f"[ADMS HEARTBEAT] failed to persist sn={serial}: {e}")


async def _get_heartbeat_status(device: dict) -> dict:
    """Return {online, last_seen, last_ip, serial_number} for a registered device."""
    serial = device.get("serial_number")
    last_seen_raw = device.get("last_seen")
    last_ip = device.get("last_ip")
    hb = None
    if serial:
        hb = await db.device_heartbeats.find_one(
            {"serial_number": serial}, {"_id": 0}
        )
    if hb:
        last_seen_raw = hb.get("last_seen") or last_seen_raw
        last_ip = hb.get("last_ip") or last_ip

    last_seen_dt: Optional[datetime] = None
    if isinstance(last_seen_raw, datetime):
        last_seen_dt = last_seen_raw
    elif isinstance(last_seen_raw, str):
        try:
            last_seen_dt = datetime.fromisoformat(last_seen_raw.replace("Z", "+00:00"))
        except Exception:
            last_seen_dt = None
    if last_seen_dt and last_seen_dt.tzinfo is None:
        last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)

    online = False
    if last_seen_dt:
        age = (datetime.now(timezone.utc) - last_seen_dt).total_seconds()
        online = age <= HEARTBEAT_ONLINE_SECONDS

    return {
        "online":        online,
        "last_seen":     last_seen_dt.isoformat() if last_seen_dt else None,
        "last_ip":       last_ip,
        "serial_number": serial,
    }


async def _queue_device_command(device_sn: str, command: str) -> str:
    cmd_id = str(uuid.uuid4())
    await db.device_commands.insert_one({
        "id":         cmd_id,
        "device_sn":  device_sn,
        "command":    command,
        "status":     "pending",
        "created_at": datetime.now(timezone.utc),
    })
    logger.info(f"[ADMS COMMAND] queued sn={device_sn} cmd={command[:60]}")
    return cmd_id


async def _pop_pending_commands(device_sn: str, limit: int = 20) -> List[dict]:
    cursor = db.device_commands.find(
        {"device_sn": device_sn, "status": "pending"},
        {"_id": 0},
    ).sort("created_at", 1).limit(limit)
    pending = await cursor.to_list(limit)
    if pending:
        ids = [c["id"] for c in pending]
        await db.device_commands.update_many(
            {"id": {"$in": ids}},
            {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc)}},
        )
    return pending


def _build_userinfo_command(user: dict) -> str:
    """Build a DATA UPDATE USERINFO command line for a single user."""
    pin = user.get("identix_uid") or user.get("id")
    name = (user.get("full_name") or "").replace("\t", " ").replace("\n", " ")[:24]
    return f"C:{uuid.uuid4().hex[:8]}:DATA UPDATE USERINFO PIN={pin}\tName={name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000"


# ─────────────────────────────────────────────────────────────────────────────
# DEVICE TEST + SYNC (cloud-safe)
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.post("/devices/{device_id}/test")
async def test_device(
    device_id: str,
    current_user: User = Depends(require_admin()),
):
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    cloud = _is_cloud_mode()

    if cloud:
        status = await _get_heartbeat_status(device)
        if status["online"]:
            return {
                "success": True,
                "mode":    "cloud",
                "message": f"Device online (last seen {status['last_seen']})",
                "deviceInfo": {
                    "serialNumber": status["serial_number"],
                    "lastSeen":     status["last_seen"],
                    "lastIp":       status["last_ip"],
                },
            }
        return {
            "success": False,
            "mode":    "cloud",
            "message": (
                "Device has not pushed to /iclock/cdata in the last 2 minutes. "
                "Verify the machine's ADMS server is set to this backend URL "
                "and that it has internet access."
            ),
            "deviceInfo": None,
        }

    # LAN mode (local development only)
    reachable = await _tcp_reachable(device["ip_address"], device.get("port", 4370))
    if not reachable:
        return {
            "success":    False,
            "mode":       "lan",
            "message":    (
                f"Cannot reach {device['ip_address']}:{device.get('port', 4370)}. "
                "Check IP, port, power, and firewall."
            ),
            "deviceInfo": None,
        }
    try:
        info = await asyncio.get_event_loop().run_in_executor(
            None, _test_device_connection, device
        )
        return {"success": True, "mode": "lan", "message": "Connected successfully", "deviceInfo": info}
    except Exception as e:
        return {"success": False, "mode": "lan", "message": str(e), "deviceInfo": None}


@identix_router.get("/devices/{device_id}/heartbeat")
async def get_device_heartbeat(
    device_id: str,
    current_user: User = Depends(require_admin()),
):
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return await _get_heartbeat_status(device)


@identix_router.post("/devices/{device_id}/sync-users")
async def sync_users_to_device(
    device_id: str,
    current_user: User = Depends(require_admin()),
):
    device = await db.identix_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    users = await db.users.find(
        {"identix_uid": {"$exists": True}, "is_active": True},
        {"_id": 0, "id": 1, "full_name": 1, "identix_uid": 1},
    ).to_list(1000)

    if not users:
        return {
            "success": True,
            "synced":  0,
            "failed":  0,
            "message": "No users with Identix UIDs",
        }

    cloud = _is_cloud_mode()

    if cloud:
        sn = device.get("serial_number")
        if not sn:
            return {
                "success": False,
                "synced":  0,
                "failed":  len(users),
                "message": (
                    "Device has no serial number on file yet. It will be filled "
                    "automatically after the first ADMS heartbeat — then retry."
                ),
            }
        queued = 0
        for u in users:
            try:
                await _queue_device_command(sn, _build_userinfo_command(u))
                await db.users.update_one(
                    {"id": u["id"]},
                    {"$set": {"identix_enrolled": True}},
                )
                queued += 1
            except Exception as e:
                logger.warning(f"[ADMS COMMAND] queue failed for {u.get('id')}: {e}")
        return {
            "success": True,
            "synced":  queued,
            "failed":  len(users) - queued,
            "queued":  True,
            "message": (
                f"Queued {queued} user-update commands. The machine will pull "
                "them on its next ADMS poll."
            ),
        }

    # LAN mode
    try:
        synced, failed = await asyncio.get_event_loop().run_in_executor(
            None, _sync_users_batch_to_device, device, users
        )
        for u in users:
            await db.users.update_one(
                {"id": u["id"]},
                {"$set": {"identix_enrolled": True}},
            )
        return {
            "success": failed == 0,
            "synced":  synced,
            "failed":  failed,
            "message": f"Synced {synced} users ({failed} failed)",
        }
    except Exception as e:
        return {
            "success": False,
            "synced":  0,
            "failed":  len(users),
            "message": str(e),
        }



# ─────────────────────────────────────────────────────────────────────────────
# LAN SCAN ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.post("/devices/scan")
async def start_lan_scan(
    payload: ScanRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_admin()),
):
    """
    Kick off an async LAN scan for ZKTeco/Identix devices.
    Returns a scan_id immediately; poll GET /devices/scan/{scan_id} for results.
    Disabled in cloud mode — devices on a private LAN cannot be probed from Render.
    """
    if _is_cloud_mode():
        raise HTTPException(
            status_code=400,
            detail=(
                "LAN scan is disabled in cloud mode. Configure the machine's ADMS "
                "server URL to point at this backend; devices will register "
                "themselves via /iclock/cdata."
            ),
        )
    scan_id = str(uuid.uuid4())

    subnet = (payload.subnet or "").strip()
    if not subnet:
        subnet = _auto_detect_subnet()

    existing       = await db.identix_devices.find({}, {"_id": 0, "ip_address": 1}).to_list(100)
    registered_ips = {d["ip_address"] for d in existing}

    _SCAN_STATE[scan_id] = {
        "done":     False,
        "progress": 0,
        "found":    [],
        "subnet":   subnet,
        "port":     payload.port,
        "message":  f"Scanning {subnet}.0/24 on port {payload.port}…",
    }

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
    current_user: User = Depends(require_admin()),
):
    """Poll the status and results of an in-progress LAN scan."""
    state = _SCAN_STATE.get(scan_id)
    if not state:
        raise HTTPException(status_code=404, detail="Scan not found or expired")
    return state


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANCE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/attendance/summary")
async def get_attendance_summary(current_user: User = Depends(require_admin())):
    """
    Returns today's attendance summary for the Identix dashboard.
    Fixes the 404 that was caused by this route being missing.
    """
    from zoneinfo import ZoneInfo
    IST      = ZoneInfo("Asia/Kolkata")
    today_str = datetime.now(IST).date().isoformat()

    total_employees = await db.users.count_documents({"is_active": True})
    pending_thumb   = await db.users.count_documents({
        "is_active":    True,
        "thumb_enrolled": {"$ne": True},
    })

    # Count distinct users present today (from main attendance collection)
    present_pipeline = [
        {"$match": {"date": today_str, "status": "present"}},
        {"$group": {"_id": "$user_id"}},
        {"$count": "total"},
    ]
    present_result = await db.attendance.aggregate(present_pipeline).to_list(1)
    total_present  = present_result[0]["total"] if present_result else 0
    total_absent   = max(0, total_employees - total_present)

    # Breakdown by department
    dept_pipeline = [
        {"$match": {"date": today_str, "status": "present"}},
        {"$lookup": {
            "from":         "users",
            "localField":   "user_id",
            "foreignField": "id",
            "as":           "user",
        }},
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id":     {"$arrayElemAt": ["$user.departments", 0]},
            "present": {"$sum": 1},
        }},
        {"$project": {"department": "$_id", "present": 1, "_id": 0}},
        {"$sort": {"present": -1}},
    ]
    by_department = await db.attendance.aggregate(dept_pipeline).to_list(50)

    # Recent machine punches today
    recent = await db.identix_attendance.find(
        {"punch_time": {"$gte": today_str}},
        {"_id": 0},
    ).sort("punch_time", -1).limit(20).to_list(20)

    return {
        "date":                   today_str,
        "totalEmployees":         total_employees,
        "totalPresent":           total_present,
        "totalAbsent":            total_absent,
        "pendingThumbEnrollment": pending_thumb,
        "byDepartment":           by_department,
        "recentActivity":         recent,
    }


@identix_router.get("/attendance")
async def get_identix_attendance(
    page:       int           = 1,
    limit:      int           = 50,
    from_date:  Optional[str] = None,
    to_date:    Optional[str] = None,
    department: Optional[str] = None,
    current_user: User        = Depends(require_admin()),
):
    """Paginated list of raw machine punch records."""
    query: Dict[str, Any] = {}
    if from_date or to_date:
        query["punch_time"] = {}
        if from_date:
            query["punch_time"]["$gte"] = from_date
        if to_date:
            query["punch_time"]["$lte"] = to_date + "T23:59:59"
    if department:
        query["department"] = department

    skip    = (page - 1) * limit
    total   = await db.identix_attendance.count_documents(query)
    records = await db.identix_attendance.find(
        query, {"_id": 0}
    ).sort("punch_time", -1).skip(skip).limit(limit).to_list(limit)

    return {"records": records, "total": total, "page": page}


@identix_router.post("/attendance/sync")
async def sync_attendance(
    payload:      SyncRequest,
    current_user: User = Depends(require_admin()),
):
    """
    Pull punch records from all active Identix/ZKTeco devices and mirror them
    into both identix_attendance (raw log) and the main attendance collection.
    """
    if payload.device_id:
        devices = await db.identix_devices.find(
            {"id": payload.device_id}, {"_id": 0}
        ).to_list(1)
    else:
        devices = await db.identix_devices.find(
            {"is_active": True}, {"_id": 0}
        ).to_list(50)

    if not devices:
        return {
            "success":      False,
            "newRecords":   0,
            "totalFetched": 0,
            "message":      "No active devices found",
            "errors":       [],
        }

    from_dt: Optional[datetime] = None
    if payload.from_date:
        try:
            from_dt = datetime.fromisoformat(payload.from_date)
        except ValueError:
            pass

    # Load all users who have an identix_uid assigned
    all_users = await db.users.find(
        {"identix_uid": {"$exists": True}},
        {
            "_id": 0,
            "id": 1,
            "full_name": 1,
            "identix_uid": 1,
            "departments": 1,
            "punch_in_time": 1,
            "grace_time": 1,
            "punch_out_time": 1,
        },
    ).to_list(1000)

    # Build lookup: device UID string → user document
    uid_to_user: Dict[str, dict] = {
        str(u["identix_uid"]): u
        for u in all_users
        if u.get("identix_uid")
    }

    total_new     = 0
    total_fetched = 0
    errors        = []

    for device in devices:
        try:
            logs: list = await asyncio.get_event_loop().run_in_executor(
                None, _fetch_attendance_from_device, device, from_dt
            )
            total_fetched += len(logs)

            for log in logs:
                device_uid     = str(log["device_user_id"])
                user           = uid_to_user.get(device_uid)
                punch_time_iso = log["punch_time"]   # ISO string
                punch_type     = log["punch_type"]   # "in" | "out"

                # ── Skip duplicates in identix_attendance ──────────────────
                existing_raw = await db.identix_attendance.find_one({
                    "log_id":    log.get("log_id"),
                    "device_id": device["id"],
                })
                if existing_raw:
                    continue

                # ── Insert raw log ─────────────────────────────────────────
                record = {
                    "id":             str(uuid.uuid4()),
                    "device_id":      device["id"],
                    "device_name":    device.get("name"),
                    "device_user_id": device_uid,
                    "punch_time":     punch_time_iso,
                    "punch_type":     punch_type,
                    "verify_mode":    log.get("verify_mode", 0),
                    "log_id":         log.get("log_id"),
                    "source":         "machine",
                    "user_id":        user["id"]        if user else None,
                    "user_name":      user["full_name"] if user else f"Unknown (UID {device_uid})",
                    "department":     (
                        user["departments"][0]
                        if user and user.get("departments")
                        else None
                    ),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.identix_attendance.insert_one(record)
                total_new += 1

                # ── Mirror into main attendance collection ─────────────────
                if not user:
                    continue

                try:
                    from zoneinfo import ZoneInfo
                    IST = ZoneInfo("Asia/Kolkata")

                    # Parse punch_time to aware datetime
                    if isinstance(punch_time_iso, str):
                        punch_dt = datetime.fromisoformat(punch_time_iso)
                    else:
                        punch_dt = punch_time_iso

                    if punch_dt.tzinfo is None:
                        punch_dt = punch_dt.replace(tzinfo=timezone.utc)

                    punch_dt_ist = punch_dt.astimezone(IST)
                    date_str     = punch_dt_ist.date().isoformat()
                    user_id      = user["id"]

                    if punch_type == "in":
                        # Determine if late — uses this user's own punch_in_time + grace_time
                        is_late = False
                        try:
                            pit_str       = user.get("punch_in_time", "10:30")
                            gt_str        = user.get("grace_time",    "00:10")
                            pit           = datetime.strptime(pit_str, "%H:%M")
                            gt            = datetime.strptime(gt_str,  "%H:%M")
                            grace_minutes = gt.hour * 60 + gt.minute
                            deadline      = punch_dt_ist.replace(
                                hour=pit.hour, minute=pit.minute,
                                second=0, microsecond=0,
                            ) + timedelta(minutes=grace_minutes)
                            is_late = punch_dt_ist > deadline
                        except Exception:
                            pass

                        # Only upsert if no punch_in recorded yet
                        existing_att = await db.attendance.find_one(
                            {"user_id": user_id, "date": date_str}, {"_id": 0}
                        )
                        if existing_att and existing_att.get("punch_in"):
                            pass  # Already has punch_in — skip
                        else:
                            await db.attendance.update_one(
                                {"user_id": user_id, "date": date_str},
                                {"$set": {
                                    "status":       "present",
                                    "punch_in":     punch_dt,
                                    "is_late":      is_late,
                                    "leave_reason": None,
                                    "auto_marked":  False,
                                    "source":       "machine",
                                    "device_name":  device.get("name"),
                                }},
                                upsert=True,
                            )

                    elif punch_type == "out":
                        existing_att = await db.attendance.find_one(
                            {"user_id": user_id, "date": date_str}, {"_id": 0}
                        )

                        if existing_att and existing_att.get("punch_in"):
                            punch_in_dt = existing_att["punch_in"]
                            if isinstance(punch_in_dt, str):
                                punch_in_dt = datetime.fromisoformat(punch_in_dt)
                            if punch_in_dt.tzinfo is None:
                                punch_in_dt = punch_in_dt.replace(tzinfo=timezone.utc)

                            duration_minutes = max(0, int(
                                (punch_dt - punch_in_dt.astimezone(timezone.utc))
                                .total_seconds() / 60
                            ))

                            punched_out_early = False
                            try:
                                pot_str  = user.get("punch_out_time", "19:00")
                                pot      = datetime.strptime(pot_str, "%H:%M")
                                expected = punch_dt_ist.replace(
                                    hour=pot.hour, minute=pot.minute,
                                    second=0, microsecond=0,
                                )
                                punched_out_early = punch_dt_ist < expected
                            except Exception:
                                pass

                            await db.attendance.update_one(
                                {"user_id": user_id, "date": date_str},
                                {"$set": {
                                    "punch_out":         punch_dt,
                                    "duration_minutes":  duration_minutes,
                                    "punched_out_early": punched_out_early,
                                }},
                            )
                        else:
                            # No punch_in yet — store punch_out only
                            await db.attendance.update_one(
                                {"user_id": user_id, "date": date_str},
                                {"$set": {
                                    "punch_out":   punch_dt,
                                    "source":      "machine",
                                    "device_name": device.get("name"),
                                }},
                                upsert=True,
                            )

                except Exception as mirror_err:
                    logger.warning(
                        f"Failed to mirror punch to main attendance "
                        f"(user={user.get('id')}, date={date_str}): {mirror_err}"
                    )

            # Update last_sync_at on the device
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
        "message": (
            f"Imported {total_new} new records from {len(devices)} device(s). "
            "Machine punches have been added to the main attendance system."
        ),
        "errors": errors,
    }


# ─────────────────────────────────────────────────────────────────────────────
# USER ENROLLMENT ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@identix_router.get("/users")
async def get_identix_users(current_user: User = Depends(require_admin())):
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
    user_id:      str,
    current_user: User = Depends(require_admin()),
):
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": {"thumb_enrolled": True}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Thumb enrollment marked complete", "user_id": user_id}


@identix_router.post("/users/{user_id}/sync-to-device")
async def sync_single_user_to_devices(
    user_id:      str,
    current_user: User = Depends(require_admin()),
):
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
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"identix_uid": identix_uid}},
        )
        user["identix_uid"] = identix_uid

    asyncio.create_task(sync_user_to_identix_devices(user))
    return {
        "message": f"Syncing {user['full_name']} to all active devices in background"
    }
# ─────────────────────────────────────────────────────────────────────────────
# ADMS CLOUD-PUSH ENDPOINTS (machine → backend)
# These are also exposed at ROOT level (/iclock/...) from server.py because
# devices append /iclock/cdata to their configured server URL automatically.
# Never raise — always return plain-text "OK" so the firmware stays connected.
# ─────────────────────────────────────────────────────────────────────────────

def _extract_sn(params: dict, raw: str) -> Optional[str]:
    sn = params.get("SN") or params.get("sn")
    if sn:
        return sn.strip()
    for token in (raw or "").splitlines():
        token = token.strip()
        if token.upper().startswith("SN="):
            return token.split("=", 1)[1].strip()
    return None


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def _mirror_punch_to_attendance(device_user_id: str, punch_time_raw: str, punch_type: str) -> None:
    try:
        from zoneinfo import ZoneInfo
        IST = ZoneInfo("Asia/Kolkata")

        user = None
        if device_user_id.isdigit():
            user = await db.users.find_one(
                {"identix_uid": int(device_user_id)},
                {"_id": 0, "id": 1, "full_name": 1, "departments": 1,
                 "punch_in_time": 1, "grace_time": 1, "punch_out_time": 1},
            )
        if not user:
            user = await db.users.find_one(
                {"identix_uid": device_user_id},
                {"_id": 0, "id": 1, "full_name": 1, "departments": 1,
                 "punch_in_time": 1, "grace_time": 1, "punch_out_time": 1},
            )
        if not user:
            logger.warning(f"[ADMS ATTENDANCE] no user for identix_uid={device_user_id}")
            return

        punch_dt = datetime.strptime(punch_time_raw, "%Y-%m-%d %H:%M:%S")
        punch_dt = punch_dt.replace(tzinfo=timezone.utc).astimezone(IST)
        date_str = punch_dt.date().isoformat()
        user_id = user["id"]

        if punch_type == "in":
            is_late = False
            try:
                pit = datetime.strptime(user.get("punch_in_time", "10:30"), "%H:%M")
                gt = datetime.strptime(user.get("grace_time", "00:10"), "%H:%M")
                deadline = punch_dt.replace(
                    hour=pit.hour, minute=pit.minute, second=0, microsecond=0,
                ) + timedelta(minutes=gt.hour * 60 + gt.minute)
                is_late = punch_dt > deadline
            except Exception:
                pass
            existing_att = await db.attendance.find_one(
                {"user_id": user_id, "date": date_str}, {"_id": 0}
            )
            if not (existing_att and existing_att.get("punch_in")):
                await db.attendance.update_one(
                    {"user_id": user_id, "date": date_str},
                    {"$set": {
                        "status": "present",
                        "punch_in": punch_dt.isoformat(),
                        "is_late": is_late,
                        "auto_marked": False,
                        "source": "machine_push",
                    }},
                    upsert=True,
                )
        else:
            existing_att = await db.attendance.find_one(
                {"user_id": user_id, "date": date_str}, {"_id": 0}
            )
            if existing_att and existing_att.get("punch_in"):
                punch_in_raw = existing_att["punch_in"]
                punch_in_dt = (
                    datetime.fromisoformat(punch_in_raw)
                    if isinstance(punch_in_raw, str) else punch_in_raw
                )
                if punch_in_dt.tzinfo is None:
                    punch_in_dt = punch_in_dt.replace(tzinfo=timezone.utc)
                duration_minutes = max(0, int(
                    (punch_dt.astimezone(timezone.utc) - punch_in_dt.astimezone(timezone.utc))
                    .total_seconds() / 60
                ))
                early = False
                try:
                    pot = datetime.strptime(user.get("punch_out_time", "19:00"), "%H:%M")
                    expected = punch_dt.replace(
                        hour=pot.hour, minute=pot.minute, second=0, microsecond=0,
                    )
                    early = punch_dt < expected
                except Exception:
                    pass
                await db.attendance.update_one(
                    {"user_id": user_id, "date": date_str},
                    {"$set": {
                        "punch_out": punch_dt.isoformat(),
                        "duration_minutes": duration_minutes,
                        "punched_out_early": early,
                    }},
                )
            else:
                await db.attendance.update_one(
                    {"user_id": user_id, "date": date_str},
                    {"$set": {
                        "punch_out": punch_dt.isoformat(),
                        "source": "machine_push",
                    }},
                    upsert=True,
                )
    except Exception as e:
        logger.warning(f"[ADMS ATTENDANCE] mirror failed uid={device_user_id}: {e}")


@identix_router.api_route("/iclock/getrequest", methods=["GET", "POST"], response_class=PlainTextResponse)
async def iclock_getrequest(request: Request):
    """Machine polls for queued commands. Returns 'OK' if none."""
    try:
        params = dict(request.query_params)
        ip = _client_ip(request)
        body = (await request.body()).decode("utf-8", errors="replace").strip()
        sn = _extract_sn(params, body)
        logger.info(f"[ADMS COMMAND] poll sn={sn} ip={ip} params={params}")
        await _record_heartbeat(sn, ip)
        if not sn:
            return "OK"
        pending = await _pop_pending_commands(sn)
        if not pending:
            return "OK"
        return "\n".join(c["command"] for c in pending)
    except Exception as e:
        logger.error(f"[ADMS COMMAND] getrequest error: {e}\n{traceback.format_exc()}")
        return "OK"


@identix_router.api_route("/iclock/devicecmd", methods=["GET", "POST"], response_class=PlainTextResponse)
async def iclock_devicecmd(request: Request):
    """Machine reports command execution results back here."""
    try:
        params = dict(request.query_params)
        ip = _client_ip(request)
        body = (await request.body()).decode("utf-8", errors="replace").strip()
        sn = _extract_sn(params, body)
        logger.info(f"[ADMS COMMAND] ack sn={sn} ip={ip} body={body[:200]}")
        await _record_heartbeat(sn, ip)
        if sn:
            await db.device_commands.update_many(
                {"device_sn": sn, "status": "sent"},
                {"$set": {"status": "done", "completed_at": datetime.now(timezone.utc)}},
            )
        return "OK"
    except Exception as e:
        logger.error(f"[ADMS COMMAND] devicecmd error: {e}\n{traceback.format_exc()}")
        return "OK"


@identix_router.api_route("/iclock/cdata", methods=["GET", "POST"], response_class=PlainTextResponse)
async def iclock_cdata(request: Request):
    """
    Primary ADMS endpoint. Accepts ATTLOG / OPLOG pushes and registration
    handshakes. MUST always return plain-text 'OK' or the device disconnects.
    """
    try:
        params = dict(request.query_params)
        ip = _client_ip(request)
        body = await request.body()
        raw = body.decode("utf-8", errors="replace").strip()

        sn = _extract_sn(params, raw)
        table = (params.get("table") or params.get("Table") or "").upper().strip()
        stamp = params.get("Stamp") or params.get("stamp")
        options = params.get("options") or params.get("OPTIONS")

        logger.info(
            f"[ADMS CONNECT] sn={sn} ip={ip} table={table or '-'} stamp={stamp} "
            f"options={options} q={params} body_bytes={len(body)}"
        )

        await _record_heartbeat(sn, ip)

        if not raw or raw.upper().startswith("SN="):
            logger.info(f"[ADMS CONNECT] handshake sn={sn}")
            return "OK"

        inserted = 0
        is_oplog = table in ("OPERLOG", "OPLOG")

        for line in raw.splitlines():
            try:
                line = line.strip()
                if not line:
                    continue

                upper = line.upper()
                if upper.startswith("ATTLOG\t"):
                    line = line.split("\t", 1)[1]
                elif upper.startswith("OPLOG\t") or upper.startswith("OPERLOG\t"):
                    is_oplog = True
                    line = line.split("\t", 1)[1]

                if is_oplog:
                    logger.info(f"[ADMS ATTENDANCE] oplog sn={sn} line={line[:120]}")
                    continue

                parts = line.split("\t")
                if len(parts) < 2:
                    continue

                device_user_id = parts[0].strip()
                punch_time_raw = parts[1].strip()
                punch_code = parts[2].strip() if len(parts) > 2 else "0"
                punch_type = "in" if punch_code in ("0", "4") else "out"

                if not device_user_id or not punch_time_raw:
                    continue

                existing = await db.identix_attendance.find_one({
                    "device_user_id": device_user_id,
                    "punch_time":     punch_time_raw,
                })
                if existing:
                    continue

                record = {
                    "id":             str(uuid.uuid4()),
                    "device_user_id": device_user_id,
                    "device_serial":  sn,
                    "punch_time":     punch_time_raw,
                    "punch_type":     punch_type,
                    "punch_state":    punch_code,
                    "source":         "machine_push",
                    "created_at":     datetime.now(timezone.utc).isoformat(),
                }
                await db.identix_attendance.insert_one(record)
                inserted += 1
                logger.info(
                    f"[ADMS ATTENDANCE] sn={sn} uid={device_user_id} "
                    f"time={punch_time_raw} type={punch_type}"
                )

                await _mirror_punch_to_attendance(device_user_id, punch_time_raw, punch_type)
            except Exception as line_err:
                logger.warning(f"[ADMS ATTENDANCE] bad line skipped: {line_err}")
                continue

        logger.info(f"[ADMS ATTENDANCE] sn={sn} inserted={inserted}")
        return "OK"

    except Exception as e:
        logger.error(f"[ADMS CONNECT] cdata error: {e}\n{traceback.format_exc()}")
        return "OK"


@identix_router.get("/")
async def root_test():
    return {"status": "API LIVE", "mode": "cloud" if _is_cloud_mode() else "lan"}
