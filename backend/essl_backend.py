from __future__ import annotations

import asyncio
import logging
import socket
import struct
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from .models import (
    MachineConfig,
    MachineConfigUpdate,
    MachineStatusResponse,
    MachineUserResponse,
    MachineAttendanceLog,
    MachineSyncResult,
    MachineEmployeeIDUpdate,
    MachinePunchPayload,
    User,
)

logger = logging.getLogger(__name__)

# ── IST timezone offset ───────────────────────────────────────────────────────
IST = timezone(timedelta(hours=5, minutes=30))

# ── ZK protocol constants ─────────────────────────────────────────────────────
ZK_DEFAULT_PORT     = 4370
ZK_TIMEOUT          = 5
ZK_HEADER_SIZE      = 8
ZK_ATT_RECORD_SIZE  = 40

CMD_CONNECT         = 1000
CMD_EXIT            = 1001
CMD_ENABLEDEVICE    = 1002
CMD_DISABLEDEVICE   = 1003
CMD_ACK_OK          = 2000
CMD_PREPARE_DATA    = 1500
CMD_DATA            = 1501
CMD_DB_RRQ          = 7
CMD_USER_WRQ        = 8
CMD_ATT_RRQ         = 13
CMD_CLEAR_ATT       = 15
CMD_DELETE_USER     = 18


# ══════════════════════════════════════════════════════════════════════════════
# 1. ESSLDevice — ZK binary protocol TCP driver
# ══════════════════════════════════════════════════════════════════════════════

class ESSLDevice:
    """
    Communicates with eSSL/ZKTeco devices using the ZK binary protocol.
    All network I/O is synchronous (blocking) and is intended to be run
    inside asyncio.get_running_loop().run_in_executor(None, ...) calls.
    """

    def __init__(
        self,
        ip: str,
        port: int = ZK_DEFAULT_PORT,
        timeout: int = ZK_TIMEOUT,
        password: str = "",
    ) -> None:
        self.ip       = ip
        self.port     = port
        self.timeout  = timeout
        self.password = password

        self._sock:     Optional[socket.socket] = None
        self._session:  int  = 0
        self._reply_id: int  = 0

    # ── Connection ─────────────────────────────────────────────────────────

    def connect(self) -> bool:
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.settimeout(self.timeout)
            self._sock.connect((self.ip, self.port))
            self._session  = 0
            self._reply_id = 0
            response = self._send_command(CMD_CONNECT)
            if response and len(response) >= 8:
                cmd = struct.unpack_from("<H", response, 0)[0]
                if cmd == CMD_ACK_OK:
                    self._session = struct.unpack_from("<H", response, 4)[0]
                    if self.password:
                        self._authenticate()
                    return True
            return False
        except (socket.error, OSError) as exc:
            logger.warning("ESSLDevice.connect failed [%s:%d]: %s", self.ip, self.port, exc)
            self._sock = None
            return False

    def disconnect(self) -> None:
        if self._sock:
            try:
                self._send_command(CMD_EXIT)
            except Exception:
                pass
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None

    def _authenticate(self) -> bool:
        pw_bytes = self.password.encode("ascii", errors="ignore")
        response = self._send_command(CMD_CONNECT, pw_bytes)
        return bool(response and struct.unpack_from("<H", response, 0)[0] == CMD_ACK_OK)

    # ── Raw protocol ───────────────────────────────────────────────────────

    def _build_packet(self, cmd: int, data: bytes = b"") -> bytes:
        self._reply_id = (self._reply_id + 1) & 0xFFFF
        header = struct.pack(
            "<HHHH",
            cmd,
            0,
            self._session,
            self._reply_id,
        )
        packet = header + data
        chk = 0
        for i in range(0, len(packet), 2):
            word = struct.unpack_from("<H", packet, i)[0] if i + 1 < len(packet) else packet[i]
            chk += word
        chk &= 0xFFFF
        return struct.pack("<HHHH", cmd, chk, self._session, self._reply_id) + data

    def _send_command(self, cmd: int, data: bytes = b"") -> Optional[bytes]:
        if not self._sock:
            return None
        packet = self._build_packet(cmd, data)
        try:
            self._sock.sendall(packet)
            return self._recv()
        except (socket.error, OSError) as exc:
            logger.debug("ESSLDevice send failed (cmd=%d): %s", cmd, exc)
            return None

    def _recv(self) -> Optional[bytes]:
        try:
            header = self._recv_exact(ZK_HEADER_SIZE)
            if not header or len(header) < ZK_HEADER_SIZE:
                return None
            return header
        except (socket.error, OSError):
            return None

    def _recv_exact(self, n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = self._sock.recv(n - len(buf))
            if not chunk:
                break
            buf += chunk
        return buf

    def _recv_large(self, size: int) -> bytes:
        """
        FIX: Only strip ZK_HEADER_SIZE from the FIRST chunk.
        Subsequent chunks are raw data — do NOT strip 8 bytes from them.
        """
        raw = b""
        first_chunk = True
        while len(raw) < size:
            want = min(4096, size - len(raw) + (ZK_HEADER_SIZE if first_chunk else 0))
            try:
                chunk = self._sock.recv(want)
            except (socket.error, OSError):
                break
            if not chunk:
                break
            if first_chunk:
                raw += chunk[ZK_HEADER_SIZE:] if len(chunk) > ZK_HEADER_SIZE else chunk
                first_chunk = False
            else:
                raw += chunk
        return raw

    # ── High-level device commands ─────────────────────────────────────────

    def enable(self) -> bool:
        r = self._send_command(CMD_ENABLEDEVICE)
        return bool(r and struct.unpack_from("<H", r, 0)[0] == CMD_ACK_OK)

    def disable(self) -> bool:
        r = self._send_command(CMD_DISABLEDEVICE)
        return bool(r and struct.unpack_from("<H", r, 0)[0] == CMD_ACK_OK)

    def get_users(self) -> List[Dict[str, Any]]:
        self.disable()
        try:
            self._send_command(CMD_DB_RRQ, struct.pack("<HH", CMD_USER_WRQ, 0))
            prep = self._recv()
            if not prep:
                return []
            cmd = struct.unpack_from("<H", prep, 0)[0]
            if cmd == CMD_PREPARE_DATA:
                total = struct.unpack_from("<I", prep, ZK_HEADER_SIZE)[0] if len(prep) > ZK_HEADER_SIZE else 0
                data  = self._recv_large(total)
            elif cmd == CMD_DATA:
                data = prep[ZK_HEADER_SIZE:]
            else:
                return []
            return self._parse_users(data)
        finally:
            self.enable()

    def _parse_users(self, data: bytes) -> List[Dict[str, Any]]:
        users  = []
        stride = 72
        for offset in range(0, len(data) - stride + 1, stride):
            rec = data[offset: offset + stride]
            if len(rec) < stride:
                continue
            uid_bytes = rec[2:12]
            uid       = uid_bytes.decode("ascii", errors="ignore").rstrip("\x00").strip()
            name      = rec[12:36].decode("utf-8", errors="ignore").rstrip("\x00").strip()
            privilege = rec[0]
            card      = rec[36:48].decode("ascii", errors="ignore").rstrip("\x00").strip()
            if uid:
                users.append({"uid": uid, "name": name, "privilege": privilege, "card": card or None})
        return users

    def add_user(self, uid: str, name: str, privilege: int = 0) -> bool:
        rec = bytearray(72)
        rec[0] = privilege & 0xFF
        uid_b  = uid.encode("ascii", errors="ignore")[:9]
        rec[2: 2 + len(uid_b)] = uid_b
        name_b = name.encode("utf-8", errors="ignore")[:23]
        rec[12: 12 + len(name_b)] = name_b
        r = self._send_command(CMD_USER_WRQ, bytes(rec))
        return bool(r and struct.unpack_from("<H", r, 0)[0] == CMD_ACK_OK)

    def delete_user(self, uid: str) -> bool:
        uid_b = uid.encode("ascii", errors="ignore")[:9].ljust(9, b"\x00")
        r = self._send_command(CMD_DELETE_USER, uid_b)
        return bool(r and struct.unpack_from("<H", r, 0)[0] == CMD_ACK_OK)

    def get_attendance_logs(self) -> List[Dict[str, Any]]:
        self.disable()
        try:
            self._send_command(CMD_DB_RRQ, struct.pack("<HH", CMD_ATT_RRQ, 0))
            prep = self._recv()
            if not prep:
                return []
            cmd = struct.unpack_from("<H", prep, 0)[0]
            if cmd == CMD_PREPARE_DATA:
                total = struct.unpack_from("<I", prep, ZK_HEADER_SIZE)[0] if len(prep) > ZK_HEADER_SIZE else 0
                data  = self._recv_large(total)
            elif cmd == CMD_DATA:
                data = prep[ZK_HEADER_SIZE:]
            else:
                return []
            return self._parse_attendance(data)
        finally:
            self.enable()

    def _parse_attendance(self, data: bytes) -> List[Dict[str, Any]]:
        """
        FIX: UID bytes at [2:11] (not [0:9]).
        Bytes 0-1 are the internal user index; enrollment number starts at byte 2.
        """
        records = []
        stride  = ZK_ATT_RECORD_SIZE
        epoch   = datetime(2000, 1, 1)

        for offset in range(0, len(data) - stride + 1, stride):
            rec = data[offset: offset + stride]
            if len(rec) < stride:
                continue

            uid = rec[2:11].decode("ascii", errors="ignore").rstrip("\x00").strip()
            if not uid:
                continue

            punch_type = rec[13]
            ts_raw     = struct.unpack_from("<I", rec, 16)[0]
            timestamp  = epoch + timedelta(seconds=ts_raw)

            records.append({
                "uid":        uid,
                "punch_type": punch_type,
                "timestamp":  timestamp,
                "status":     rec[12],
            })
        return records

    def clear_attendance(self) -> bool:
        r = self._send_command(CMD_CLEAR_ATT)
        return bool(r and struct.unpack_from("<H", r, 0)[0] == CMD_ACK_OK)

    def ping(self) -> bool:
        try:
            return self.connect()
        except Exception:
            return False
        finally:
            self.disconnect()

    def _ping_and_count(self) -> Tuple[bool, int]:
        """
        FIX: Single TCP connection for both ping and user count.
        Original opened two separate connections.
        """
        if not self.connect():
            return False, 0
        try:
            users = self.get_users()
            return True, len(users)
        except Exception:
            return False, 0
        finally:
            self.disconnect()


# ══════════════════════════════════════════════════════════════════════════════
# Shared utility — late check
# ══════════════════════════════════════════════════════════════════════════════

def check_is_late(
    punch_in: datetime,
    expected_in_str: Optional[str],
    grace_str: Optional[str],
) -> bool:
    """
    Unified late check. punch_in should be naive UTC.
    Converts to IST for comparison against shift schedule.
    """
    try:
        punch_ist = punch_in.replace(tzinfo=timezone.utc).astimezone(IST).replace(tzinfo=None)

        exp_h, exp_m = map(int, (expected_in_str or "10:30").split(":"))
        grace_h, grace_m = map(int, (grace_str or "00:10").split(":"))

        deadline = punch_ist.replace(hour=exp_h, minute=exp_m, second=0, microsecond=0)
        deadline += timedelta(hours=grace_h, minutes=grace_m)
        return punch_ist > deadline
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════════
# 2. ESSLSyncEngine — background async scheduler
# ══════════════════════════════════════════════════════════════════════════════

class ESSLSyncEngine:
    """
    Runs as a long-lived asyncio task, periodically syncing attendance
    and pushing users to the biometric device.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db  = db
        self._cfg: Optional[MachineConfig] = None

    def reload_config(self, cfg: MachineConfig) -> None:
        self._cfg = cfg

    async def run(self) -> None:
        """
        FIX: att_counter and user_counter are reset when device is disabled
        to prevent immediate burst syncs on re-enable.
        """
        att_counter  = 0
        user_counter = 0

        while True:
            await asyncio.sleep(1)
            cfg = self._cfg or MachineConfig()

            if not cfg.enabled:
                # FIX: Reset counters so syncs don't fire immediately on re-enable
                att_counter  = 0
                user_counter = 0
                await asyncio.sleep(30)
                continue

            att_counter  += 1
            user_counter += 1

            if att_counter >= cfg.sync_interval:
                att_counter = 0
                try:
                    result = await self.sync_attendance(cfg)
                    if result.synced or result.new_records:
                        logger.info(
                            "Attendance sync: synced=%d new=%d skipped=%d errors=%d",
                            result.synced, result.new_records, result.skipped, result.errors,
                        )
                except Exception as exc:
                    logger.error("Attendance sync failed: %s", exc, exc_info=True)

            if user_counter >= cfg.user_sync_interval:
                user_counter = 0
                try:
                    await self.sync_users_to_device(cfg)
                except Exception as exc:
                    logger.error("User sync failed: %s", exc, exc_info=True)

    async def sync_attendance(self, cfg: MachineConfig) -> MachineSyncResult:
        # FIX: Use asyncio.get_running_loop() instead of deprecated asyncio.get_event_loop()
        loop = asyncio.get_running_loop()

        def _fetch() -> List[Dict[str, Any]]:
            dev = ESSLDevice(cfg.ip, cfg.port, timeout=ZK_TIMEOUT, password=cfg.password)
            if not dev.connect():
                raise ConnectionError(f"Cannot connect to device {cfg.ip}:{cfg.port}")
            try:
                return dev.get_attendance_logs()
            finally:
                dev.disconnect()

        try:
            logs = await loop.run_in_executor(None, _fetch)
        except ConnectionError as exc:
            logger.warning("sync_attendance: %s", exc)
            return MachineSyncResult(errors=1, message=str(exc))

        synced = skipped = errors = new_records = 0

        for log in logs:
            try:
                result = await self._record_machine_punch(log)
                if result.get("existing"):
                    skipped += 1
                elif result.get("created"):
                    new_records += 1
                    synced += 1
                else:
                    synced += 1
            except Exception as exc:
                logger.warning("Failed to record punch %s: %s", log, exc)
                errors += 1

        await self._db.machine_config.update_one(
            {},
            {"$set": {"last_attendance_sync": datetime.utcnow()}},
            upsert=True,
        )

        return MachineSyncResult(
            synced=synced,
            skipped=skipped,
            errors=errors,
            new_records=new_records,
            message=f"Processed {len(logs)} device records",
        )

    async def _record_machine_punch(self, log: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map a raw device log entry to a webapp attendance record.

        FIX: All datetimes stored as naive UTC.
        FIX: Idempotency via DB lookup, not in-memory set (which leaked memory
        and was wiped on restart).
        """
        uid        = str(log["uid"]).strip()
        punch_type = int(log.get("punch_type", 0))
        ts_ist     = log["timestamp"]   # naive, device-local IST
        ts_utc     = ts_ist - timedelta(hours=5, minutes=30)   # naive UTC

        date_str = ts_ist.date().isoformat()   # business date in IST

        user_doc = await self._db.users.find_one({"machine_employee_id": uid})
        if not user_doc:
            logger.debug("No user found for machine_employee_id=%s", uid)
            return {"skipped": True, "reason": "no_user"}

        ts_user_id = user_doc["id"]

        # FIX: Idempotency check in DB
        existing = await self._db.attendance.find_one({
            "user_id": ts_user_id,
            "date":    date_str,
        })

        punch_type_str = "check-in" if punch_type == 0 else "check-out"

        if punch_type == 0:
            # ── Punch IN ─────────────────────────────────────────────────
            if existing and existing.get("punch_in"):
                return {"existing": True}

            is_late = check_is_late(
                ts_utc,
                user_doc.get("punch_in_time"),
                user_doc.get("grace_time"),
            )

            if existing:
                await self._db.attendance.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "punch_in":           ts_utc,
                        "status":             "late" if is_late else "present",
                        "is_late":            is_late,
                        "source":             "machine",
                        "machine_punch_type": punch_type_str,
                        "updated_at":         datetime.utcnow(),
                    }},
                )
            else:
                await self._db.attendance.insert_one({
                    "id":                 _new_id(),
                    "user_id":            ts_user_id,
                    "date":               date_str,
                    "punch_in":           ts_utc,
                    "punch_out":          None,
                    "status":             "late" if is_late else "present",
                    "is_late":            is_late,
                    "source":             "machine",
                    "machine_punch_type": punch_type_str,
                    "duration_minutes":   None,
                    "created_at":         datetime.utcnow(),
                    "updated_at":         datetime.utcnow(),
                })
                return {"created": True}

        else:
            # ── Punch OUT ────────────────────────────────────────────────
            if existing and existing.get("punch_out"):
                return {"existing": True}

            if not existing or not existing.get("punch_in"):
                logger.debug("punch_out before punch_in for user %s on %s", ts_user_id, date_str)
                if not existing:
                    await self._db.attendance.insert_one({
                        "id":                 _new_id(),
                        "user_id":            ts_user_id,
                        "date":               date_str,
                        "punch_in":           None,
                        "punch_out":          ts_utc,
                        "status":             "present",
                        "is_late":            False,
                        "source":             "machine",
                        "machine_punch_type": punch_type_str,
                        "duration_minutes":   None,
                        "created_at":         datetime.utcnow(),
                        "updated_at":         datetime.utcnow(),
                    })
                    return {"created": True}
                else:
                    await self._db.attendance.update_one(
                        {"_id": existing["_id"]},
                        {"$set": {
                            "punch_out":          ts_utc,
                            "machine_punch_type": punch_type_str,
                            "source":             "machine",
                            "updated_at":         datetime.utcnow(),
                        }},
                    )
                    return {}

            # Normal punch-out
            punch_in_dt   = existing["punch_in"]
            duration_mins = int((ts_utc - punch_in_dt).total_seconds() / 60)

            await self._db.attendance.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "punch_out":          ts_utc,
                    "duration_minutes":   duration_mins,
                    "source":             "machine",
                    "machine_punch_type": punch_type_str,
                    "updated_at":         datetime.utcnow(),
                }},
            )

        return {}

    async def sync_users_to_device(self, cfg: MachineConfig) -> None:
        loop = asyncio.get_running_loop()   # FIX: use get_running_loop

        to_add = await self._db.users.find({
            "machine_employee_id": {"$exists": True, "$ne": None, "$ne": ""},
            "machine_synced": False,
        }).to_list(length=200)

        if not to_add:
            return

        def _push(users: List[Dict]) -> Dict[str, bool]:
            dev = ESSLDevice(cfg.ip, cfg.port, timeout=ZK_TIMEOUT, password=cfg.password)
            if not dev.connect():
                return {}
            try:
                existing_uids = {u["uid"] for u in dev.get_users()}
                results: Dict[str, bool] = {}
                for u in users:
                    mid = str(u.get("machine_employee_id", "")).strip()
                    if not mid:
                        continue
                    if mid in existing_uids:
                        results[u["id"]] = True
                        continue
                    results[u["id"]] = dev.add_user(mid, u.get("full_name", ""), privilege=0)
                return results
            finally:
                dev.disconnect()

        results = await loop.run_in_executor(None, _push, to_add)

        for u in to_add:
            if results.get(u["id"]):
                await self._db.users.update_one(
                    {"id": u["id"]},
                    {"$set": {"machine_synced": True, "updated_at": datetime.utcnow()}},
                )


def _new_id() -> str:
    return str(uuid.uuid4())


# ══════════════════════════════════════════════════════════════════════════════
# 3. FastAPI router — /api/machine
# ══════════════════════════════════════════════════════════════════════════════

essl_router = APIRouter(prefix="/api/machine", tags=["Biometric Machine"])

# These are injected from main.py at startup via app.dependency_overrides.
_db: Optional[AsyncIOMotorDatabase] = None
_sync_engine: Optional[ESSLSyncEngine] = None


def _get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("essl_router._db not initialised")
    return _db


def _get_engine() -> ESSLSyncEngine:
    if _sync_engine is None:
        raise RuntimeError("essl_router._sync_engine not initialised")
    return _sync_engine


async def _load_config() -> MachineConfig:
    doc = await _get_db().machine_config.find_one({})
    if doc:
        doc.pop("_id", None)
        return MachineConfig(**{k: v for k, v in doc.items() if k in MachineConfig.model_fields})
    return MachineConfig()


# ── Auth dependency placeholders ─────────────────────────────────────────────
# FIX: These must be async *functions* (not coroutine objects) to work as
# FastAPI Depends() callables. main.py overrides them via app.dependency_overrides.

async def _placeholder_user():
    raise HTTPException(status_code=401, detail="Auth not configured")

async def _placeholder_admin():
    raise HTTPException(status_code=401, detail="Admin auth not configured")

_get_current_user = _placeholder_user
_require_admin    = _placeholder_admin


# ── Config endpoints ──────────────────────────────────────────────────────────

@essl_router.get("/config", response_model=MachineConfig)
async def get_machine_config(current_user: User = Depends(_get_current_user)):
    return await _load_config()


@essl_router.put("/config", response_model=MachineConfig)
async def update_machine_config(
    payload: MachineConfigUpdate,
    current_user: User = Depends(_require_admin),
):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=422, detail="No fields provided")

    await _get_db().machine_config.update_one({}, {"$set": update}, upsert=True)
    cfg = await _load_config()
    _get_engine().reload_config(cfg)
    return cfg


# ── Status endpoint ───────────────────────────────────────────────────────────

@essl_router.get("/status", response_model=MachineStatusResponse)
async def get_machine_status(current_user: User = Depends(_require_admin)):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()

    dev = ESSLDevice(cfg.ip, cfg.port, timeout=3, password=cfg.password)
    # FIX: Single TCP connection for ping + user count
    connected, device_user_count = await loop.run_in_executor(None, dev._ping_and_count)

    doc = await _get_db().machine_config.find_one({}) or {}
    return MachineStatusResponse(
        connected=connected,
        device_user_count=device_user_count,
        ip=cfg.ip,
        port=cfg.port,
        enabled=cfg.enabled,
        last_attendance_sync=doc.get("last_attendance_sync"),
        last_user_sync=doc.get("last_user_sync"),
    )


# ── Manual sync endpoints ─────────────────────────────────────────────────────

@essl_router.post("/sync-attendance", response_model=MachineSyncResult)
async def manual_sync_attendance(current_user: User = Depends(_require_admin)):
    cfg = await _load_config()
    if not cfg.enabled:
        raise HTTPException(status_code=400, detail="Biometric machine is disabled")
    return await _get_engine().sync_attendance(cfg)


@essl_router.post("/sync-users", response_model=MachineSyncResult)
async def manual_sync_users(current_user: User = Depends(_require_admin)):
    cfg = await _load_config()
    if not cfg.enabled:
        raise HTTPException(status_code=400, detail="Biometric machine is disabled")
    await _get_engine().sync_users_to_device(cfg)
    return MachineSyncResult(message="User sync triggered")


# ── Device user management ────────────────────────────────────────────────────

@essl_router.get("/users", response_model=List[MachineUserResponse])
async def get_machine_users(current_user: User = Depends(_require_admin)):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()

    def _fetch():
        dev = ESSLDevice(cfg.ip, cfg.port, timeout=ZK_TIMEOUT, password=cfg.password)
        if not dev.connect():
            raise ConnectionError("Cannot connect to device")
        try:
            return dev.get_users()
        finally:
            dev.disconnect()

    try:
        users = await loop.run_in_executor(None, _fetch)
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return [MachineUserResponse(**u) for u in users]


@essl_router.post("/users", response_model=MachineUserResponse)
async def add_machine_user(
    uid: str,
    name: str,
    privilege: int = 0,
    current_user: User = Depends(_require_admin),
):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()

    def _add():
        dev = ESSLDevice(cfg.ip, cfg.port, timeout=ZK_TIMEOUT, password=cfg.password)
        if not dev.connect():
            raise ConnectionError("Cannot connect to device")
        try:
            success = dev.add_user(uid, name, privilege)
            if not success:
                raise ValueError("Device rejected user creation")
            return {"uid": uid, "name": name, "privilege": privilege, "card": None}
        finally:
            dev.disconnect()

    try:
        result = await loop.run_in_executor(None, _add)
    except (ConnectionError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return MachineUserResponse(**result)


@essl_router.delete("/users/{uid}")
async def delete_machine_user(uid: str, current_user: User = Depends(_require_admin)):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()

    def _delete():
        dev = ESSLDevice(cfg.ip, cfg.port, timeout=ZK_TIMEOUT, password=cfg.password)
        if not dev.connect():
            raise ConnectionError("Cannot connect to device")
        try:
            return dev.delete_user(uid)
        finally:
            dev.disconnect()

    try:
        ok = await loop.run_in_executor(None, _delete)
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if not ok:
        raise HTTPException(status_code=404, detail=f"User {uid} not found on device")
    return {"message": f"User {uid} deleted from device"}


# ── Raw attendance logs from device ──────────────────────────────────────────

@essl_router.get("/attendance-logs", response_model=List[MachineAttendanceLog])
async def get_machine_attendance_logs(current_user: User = Depends(_require_admin)):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()

    def _fetch():
        dev = ESSLDevice(cfg.ip, cfg.port, timeout=ZK_TIMEOUT, password=cfg.password)
        if not dev.connect():
            raise ConnectionError("Cannot connect to device")
        try:
            return dev.get_attendance_logs()
        finally:
            dev.disconnect()

    try:
        logs = await loop.run_in_executor(None, _fetch)
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    result = []
    for log in logs:
        ts_utc = log["timestamp"] - timedelta(hours=5, minutes=30)
        result.append(MachineAttendanceLog(
            uid=log["uid"],
            timestamp=ts_utc,
            punch_type=log["punch_type"],
            status=log.get("status", 0),
        ))
    return result


# ── machine-id update endpoint ────────────────────────────────────────────────

@essl_router.put(
    "/users/{user_id}/machine-id",
    summary="Assign / unassign biometric machine UID",
)
async def update_machine_employee_id(
    user_id: str,
    payload: MachineEmployeeIDUpdate,
    current_user: User = Depends(_require_admin),
):
    db = _get_db()

    if payload.machine_employee_id:
        conflict = await db.users.find_one({
            "machine_employee_id": payload.machine_employee_id,
            "id": {"$ne": user_id},
        })
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"machine_employee_id '{payload.machine_employee_id}' is already "
                    f"assigned to {conflict.get('full_name', 'another user')}"
                ),
            )

    update_fields: Dict[str, Any] = {
        "machine_employee_id": payload.machine_employee_id,
        "machine_synced":      False,
        "updated_at":          datetime.utcnow(),
    }
    result = await db.users.update_one({"id": user_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    action = "assigned" if payload.machine_employee_id else "unassigned"
    return {"message": f"Machine employee ID {action} successfully"}


# ── POST /api/attendance/machine-sync ────────────────────────────────────────
# FIX: Changed to admin-only. A regular user must not post fake punches.

async def machine_sync_attendance(
    payload: MachinePunchPayload,
    current_user: User = Depends(_require_admin),
):
    db = _get_db()

    user_doc = await db.users.find_one({"id": payload.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail=f"User {payload.user_id} not found")

    log = {
        "uid":        payload.device_uid,
        "punch_type": int(payload.punch_type),
        # Convert UTC naive → IST naive for _record_machine_punch
        "timestamp":  payload.punch_time + timedelta(hours=5, minutes=30),
    }

    engine = _get_engine()
    result = await engine._record_machine_punch(log)
    return {"message": "Punch recorded", "result": result}
