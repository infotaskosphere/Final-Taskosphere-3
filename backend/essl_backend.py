"""
essl_backend.py
═══════════════════════════════════════════════════════════════════════════════
Complete eSSL / ZKTeco biometric machine backend for Taskosphere.

This file is self-contained.  It provides:
  ① ESSLDevice        — Low-level TCP/ZK protocol driver
  ② ESSLSyncEngine    — Background sync engine (attendance pull + user push)
  ③ FastAPI router    — All /api/machine/* and /api/attendance/machine-sync routes

HOW TO INTEGRATE INTO main.py
──────────────────────────────
Add these 3 lines inside main.py (anywhere after api_router is defined):

    from essl_backend import essl_router, sync_engine
    api_router.include_router(essl_router)

    @app.on_event("startup")
    async def start_essl_sync():
        asyncio.create_task(sync_engine.run())

That's it — all routes, background sync, and device management are active.
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import asyncio
import logging
import socket
import struct
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from motor.motor_asyncio import AsyncIOMotorDatabase

# ── Local project imports (adjust paths if your structure differs) ──────────
from backend.dependencies import db, get_current_user, require_admin
from backend.models import (
    User,
    Attendance,
    MachineConfig,
    MachineConfigUpdate,
    MachineUserResponse,
    MachineAttendanceLog,
    MachineSyncResult,
    MachineEmployeeIDUpdate,
    MachinePunchPayload,
    MachineStatusResponse,
)

logger = logging.getLogger("essl_backend")
IST    = ZoneInfo("Asia/Kolkata")

# ═══════════════════════════════════════════════════════════════════════════════
# § 1  ZK PROTOCOL CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════

CMD_CONNECT       = 1000
CMD_EXIT          = 1001
CMD_ENABLEDEVICE  = 1002
CMD_DISABLEDEVICE = 1003
CMD_ACK_OK        = 2000
CMD_ACK_ERROR     = 2001
CMD_ACK_DATA      = 2002
CMD_FREE_DATA     = 1502
CMD_GET_TIME      = 201
CMD_SET_TIME      = 202
CMD_GET_ATTLOG    = 1201
CMD_CLEAR_ATTLOG  = 1204
CMD_GET_USER_INFO = 1100
CMD_SET_USER_INFO = 1101
CMD_DELETE_USER   = 1102

USHRT_MAX = 65535
ATT_RECORD_SIZE   = 40
USER_RECORD_SIZE  = 72


# ═══════════════════════════════════════════════════════════════════════════════
# § 2  TIME HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _pack_time(dt: datetime) -> int:
    return (
        ((dt.year % 100) << 26)
        | (dt.month       << 22)
        | (dt.day         << 17)
        | (dt.hour        << 12)
        | (dt.minute      <<  6)
        | dt.second
    )


def _unpack_time(t: int) -> datetime:
    second =  t        & 0x3F;  t >>= 6
    minute =  t        & 0x3F;  t >>= 6
    hour   =  t        & 0x1F;  t >>= 5
    day    =  t        & 0x1F;  t >>= 5
    month  =  t        & 0x0F;  t >>= 4
    year   = (t        & 0x7F) + 2000
    try:
        return datetime(year, month, day, hour, minute, second)
    except ValueError:
        return datetime(2000, 1, 1, 0, 0, 0)


# ═══════════════════════════════════════════════════════════════════════════════
# § 3  ESSLDevice  —  low-level TCP/ZK driver
# ═══════════════════════════════════════════════════════════════════════════════

class ESSLDevice:
    """
    Synchronous (blocking) TCP driver for eSSL / ZKTeco biometric machines
    using the ZK binary protocol.

    Thread-safety: NOT thread-safe.  Create one instance per operation
    or guard with asyncio.Lock (the ESSLSyncEngine does this).

    Typical usage:
        dev = ESSLDevice("192.168.1.201", port=4370)
        if dev.connect():
            logs  = dev.get_attendance_logs()
            users = dev.get_users()
            dev.disconnect()
    """

    def __init__(
        self,
        ip:       str,
        port:     int  = 4370,
        timeout:  int  = 10,
        password: str  = "",
    ):
        self.ip       = ip
        self.port     = port
        self.timeout  = timeout
        self.password = password

        self._sock:       Optional[socket.socket] = None
        self._session_id: int = 0
        self._reply_id:   int = USHRT_MAX - 1

    # ── Internal ─────────────────────────────────────────────────────────────

    def _checksum(self, buf: bytes) -> int:
        s = 0
        for i in range(0, len(buf) - len(buf) % 2, 2):
            s += struct.unpack_from("<H", buf, i)[0]
        if len(buf) % 2:
            s += buf[-1]
        s  = s & 0xFFFF
        s  = USHRT_MAX - s + 1
        return s & 0xFFFF

    def _build_packet(self, cmd: int, data: bytes = b"") -> bytes:
        self._reply_id = (self._reply_id + 1) & USHRT_MAX
        header = struct.pack("<HHHH", cmd, 0, self._session_id, self._reply_id)
        raw    = header + data
        chk    = self._checksum(raw)
        return struct.pack("<HHHH", cmd, chk, self._session_id, self._reply_id) + data

    def _send(self, cmd: int, data: bytes = b"") -> Optional[bytes]:
        if self._sock is None:
            return None
        packet = self._build_packet(cmd, data)
        try:
            self._sock.sendall(packet)
            return self._sock.recv(4096)
        except Exception as exc:
            logger.error(f"[ESSLDevice] send cmd={cmd} error: {exc}")
            return None

    def _recv_large(self, prepare_resp: bytes) -> bytes:
        """Receive a multi-packet DATA response after PREPARE_DATA."""
        if len(prepare_resp) < 12:
            return b""
        size = struct.unpack_from("<I", prepare_resp, 8)[0]
        raw  = b""
        while len(raw) < size:
            try:
                chunk = self._sock.recv(min(4096, size - len(raw) + 8))
            except Exception:
                break
            if not chunk:
                break
            # Strip 8-byte header from each chunk
            raw += chunk[8:] if len(chunk) > 8 else chunk
        return raw

    # ── Public: connect / disconnect ─────────────────────────────────────────

    def connect(self) -> bool:
        """Open TCP socket and authenticate with CMD_CONNECT."""
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.settimeout(self.timeout)
            self._sock.connect((self.ip, self.port))
        except Exception as exc:
            logger.error(f"[ESSLDevice] TCP connect {self.ip}:{self.port} failed: {exc}")
            self._sock = None
            return False

        resp = self._send(CMD_CONNECT)
        if not resp or len(resp) < 8:
            logger.error("[ESSLDevice] No response to CMD_CONNECT")
            self._sock.close()
            self._sock = None
            return False

        cmd = struct.unpack_from("<H", resp, 0)[0]
        if cmd == CMD_ACK_OK:
            self._session_id = struct.unpack_from("<H", resp, 4)[0]
            logger.info(f"[ESSLDevice] Connected to {self.ip}:{self.port}  session={self._session_id}")
            return True

        logger.error(f"[ESSLDevice] CMD_CONNECT rejected (reply cmd={cmd})")
        self._sock.close()
        self._sock = None
        return False

    def disconnect(self) -> None:
        if self._sock:
            try:
                self._send(CMD_EXIT)
            except Exception:
                pass
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        logger.debug("[ESSLDevice] Disconnected.")

    def disable_device(self) -> None:
        self._send(CMD_DISABLEDEVICE)

    def enable_device(self) -> None:
        self._send(CMD_ENABLEDEVICE)

    def ping(self) -> bool:
        """Quick connectivity test — connect then disconnect."""
        ok = self.connect()
        self.disconnect()
        return ok

    # ── Public: attendance logs ───────────────────────────────────────────────

    def get_attendance_logs(self) -> list[dict]:
        """
        Fetch all stored punch records from the device.

        Returns list of:
          { "user_id": str, "timestamp": datetime (naive, IST), "punch_type": int }

        punch_type:
          0 = punch_in    1 = punch_out
          4 = OT_in       5 = OT_out
        """
        resp = self._send(CMD_GET_ATTLOG)
        if not resp or len(resp) < 8:
            logger.warning("[ESSLDevice] No response to GET_ATTLOG")
            return []

        cmd = struct.unpack_from("<H", resp, 0)[0]

        if cmd == CMD_ACK_OK and len(resp) == 8:
            return []   # no records

        if cmd == 1500:   # CMD_PREPARE_DATA
            raw = self._recv_large(resp)
        elif cmd == 1501:  # CMD_DATA
            raw = resp[8:]
        else:
            logger.warning(f"[ESSLDevice] Unexpected GET_ATTLOG reply cmd={cmd}")
            return []

        self._send(CMD_FREE_DATA)

        logs   = []
        offset = 0
        while offset + ATT_RECORD_SIZE <= len(raw):
            record     = raw[offset: offset + ATT_RECORD_SIZE]
            uid        = record[0:9].decode("ascii", errors="ignore").rstrip("\x00").strip()
            t_packed   = struct.unpack_from("<I", record, 26)[0]
            timestamp  = _unpack_time(t_packed)
            punch_type = record[30]
            if uid:
                logs.append({
                    "user_id":    uid,
                    "timestamp":  timestamp,
                    "punch_type": punch_type,
                })
            offset += ATT_RECORD_SIZE

        logger.info(f"[ESSLDevice] Fetched {len(logs)} attendance records.")
        return logs

    def clear_attendance_logs(self) -> bool:
        resp = self._send(CMD_CLEAR_ATTLOG)
        if not resp:
            return False
        return struct.unpack_from("<H", resp, 0)[0] == CMD_ACK_OK

    # ── Public: user management ───────────────────────────────────────────────

    def get_users(self) -> list[dict]:
        """
        Fetch all registered users from the device.

        Returns list of:
          { "uid": str, "name": str, "privilege": int }
        """
        resp = self._send(CMD_GET_USER_INFO)
        if not resp or len(resp) < 8:
            return []

        cmd = struct.unpack_from("<H", resp, 0)[0]

        if cmd == 1500:
            raw = self._recv_large(resp)
        elif cmd == 1501:
            raw = resp[8:]
        else:
            return []

        self._send(CMD_FREE_DATA)

        users  = []
        offset = 0
        while offset + USER_RECORD_SIZE <= len(raw):
            record = raw[offset: offset + USER_RECORD_SIZE]
            uid    = record[0:9].decode("ascii", errors="ignore").rstrip("\x00").strip()
            priv   = record[9]
            name   = record[12:36].decode("utf-8", errors="ignore").rstrip("\x00").strip()
            if uid:
                users.append({"uid": uid, "name": name, "privilege": priv})
            offset += USER_RECORD_SIZE

        logger.info(f"[ESSLDevice] Fetched {len(users)} users.")
        return users

    def set_user(
        self,
        uid:       str,
        name:      str,
        privilege: int = 0,
        password:  str = "",
    ) -> bool:
        """
        Register or update a user on the device.
        uid must be a numeric string ≤ 9 chars, e.g. '1', '42'.
        """
        uid_b  = uid.encode("ascii").ljust(9,  b"\x00")[:9]
        priv_b = bytes([privilege & 0xFF])
        pass_b = password.encode("ascii").ljust(8, b"\x00")[:8]
        name_b = name.encode("utf-8").ljust(24, b"\x00")[:24]
        card_b = b"\x00" * 10
        grp_b  = b"\x01"
        tz_b   = b"\x00\x20" + b"\x00" * 8
        uid2_b = uid.encode("ascii").ljust(9, b"\x00")[:9]

        payload = uid_b + priv_b + pass_b + name_b + card_b + grp_b + tz_b + uid2_b
        resp    = self._send(CMD_SET_USER_INFO, payload)
        if not resp:
            return False
        ok = struct.unpack_from("<H", resp, 0)[0] == CMD_ACK_OK
        logger.info(f"[ESSLDevice] set_user uid={uid!r} name={name!r} → {'OK' if ok else 'FAIL'}")
        return ok

    def delete_user(self, uid: str) -> bool:
        """Remove a user from the device by their UID."""
        uid_b = uid.encode("ascii").ljust(9, b"\x00")[:9]
        resp  = self._send(CMD_DELETE_USER, uid_b)
        if not resp:
            return False
        ok = struct.unpack_from("<H", resp, 0)[0] == CMD_ACK_OK
        logger.info(f"[ESSLDevice] delete_user uid={uid!r} → {'OK' if ok else 'FAIL'}")
        return ok


# ═══════════════════════════════════════════════════════════════════════════════
# § 4  ESSLSyncEngine  —  asyncio background engine
# ═══════════════════════════════════════════════════════════════════════════════

class ESSLSyncEngine:
    """
    Asyncio background task that runs inside the FastAPI process.

    Responsibilities:
      • Every sync_interval seconds  → pull attendance logs from device
                                       → POST them into db.attendance
      • Every user_sync_interval     → push new Taskosphere users to device
      • Every hour                   → remove deactivated users from device

    The engine reads its configuration from db.machine_config at startup
    and after every PUT /api/machine/config call.
    """

    def __init__(self) -> None:
        self._lock   = asyncio.Lock()
        self._synced_keys: set[str] = set()   # dedup: "uid|YYYY-MM-DD HH:MM"
        self._cfg:    Optional[MachineConfig] = None

    # ── Config ────────────────────────────────────────────────────────────────

    async def _load_config(self) -> MachineConfig:
        doc = await db.machine_config.find_one({"key": "default"}, {"_id": 0})
        if doc:
            self._cfg = MachineConfig(**doc)
        else:
            self._cfg = MachineConfig()
            await db.machine_config.insert_one(self._cfg.model_dump())
        return self._cfg

    async def reload_config(self) -> MachineConfig:
        return await self._load_config()

    # ── Device factory (runs in thread pool to avoid blocking event loop) ────

    async def _run_in_thread(self, func, *args):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, func, *args)

    def _device(self) -> ESSLDevice:
        return ESSLDevice(
            ip       = self._cfg.ip,
            port     = self._cfg.port,
            password = self._cfg.password,
        )

    # ── Attendance sync ───────────────────────────────────────────────────────

    async def sync_attendance(self) -> MachineSyncResult:
        if not self._cfg or not self._cfg.enabled:
            return MachineSyncResult(message="Machine sync disabled.")

        async with self._lock:
            logger.info("[SyncEngine] ── Attendance sync started ──")

            def _pull():
                dev = self._device()
                if not dev.connect():
                    return None
                try:
                    return dev.get_attendance_logs()
                finally:
                    dev.disconnect()

            logs = await self._run_in_thread(_pull)
            if logs is None:
                return MachineSyncResult(message="Cannot connect to device.", errors=1)
            if not logs:
                return MachineSyncResult(message="No logs on device.")

            # Build machine_uid → taskosphere user_id map
            users_raw = await db.users.find(
                {"machine_employee_id": {"$exists": True, "$ne": None}},
                {"_id": 0, "id": 1, "machine_employee_id": 1,
                 "punch_in_time": 1, "grace_time": 1, "punch_out_time": 1,
                 "late_grace_minutes": 1},
            ).to_list(2000)
            uid_map: dict[str, dict] = {
                str(u["machine_employee_id"]): u
                for u in users_raw
                if u.get("machine_employee_id")
            }

            pushed = skipped = errors = 0

            for log in logs:
                machine_uid: str      = log["user_id"]
                ts: datetime          = log["timestamp"]   # naive IST from device
                punch_type: int       = log["punch_type"]

                dedup_key = f"{machine_uid}|{ts.strftime('%Y-%m-%d %H:%M')}"
                if dedup_key in self._synced_keys:
                    skipped += 1
                    continue

                user_doc = uid_map.get(machine_uid)
                if not user_doc:
                    skipped += 1
                    continue

                ts_user_id = user_doc["id"]
                action = "punch_in" if punch_type in (0, 4) else "punch_out"

                ts_ist = ts.replace(tzinfo=IST)
                ts_utc = ts_ist.astimezone(timezone.utc)

                payload = MachinePunchPayload(
                    action      = action,
                    source      = "machine",
                    machine_uid = machine_uid,
                    recorded_at = ts_utc.isoformat(),
                )

                try:
                    result = await _record_machine_punch(ts_user_id, payload, user_doc)
                    if result.get("existing"):
                        skipped += 1
                    else:
                        self._synced_keys.add(dedup_key)
                        pushed += 1
                except Exception as exc:
                    logger.error(f"[SyncEngine] punch error user={ts_user_id}: {exc}")
                    errors += 1

            now = datetime.now(timezone.utc)
            await db.machine_config.update_one(
                {"key": "default"},
                {"$set": {"last_attendance_sync": now}},
            )
            logger.info(
                f"[SyncEngine] Attendance sync done: "
                f"{pushed} pushed, {skipped} skipped, {errors} errors."
            )
            return MachineSyncResult(
                pushed    = pushed,
                skipped   = skipped,
                errors    = errors,
                message   = f"{pushed} punches recorded.",
                synced_at = now,
            )

    # ── User push ─────────────────────────────────────────────────────────────

    async def sync_users_to_device(self) -> MachineSyncResult:
        if not self._cfg or not self._cfg.enabled:
            return MachineSyncResult(message="Machine sync disabled.")

        async with self._lock:
            logger.info("[SyncEngine] ── User sync (Taskosphere → Device) ──")

            users_raw = await db.users.find(
                {"machine_employee_id": {"$exists": True, "$ne": None},
                 "is_active": True},
                {"_id": 0, "id": 1, "full_name": 1,
                 "machine_employee_id": 1, "machine_synced": 1},
            ).to_list(2000)

            to_add = [u for u in users_raw if not u.get("machine_synced")]
            if not to_add:
                logger.info("[SyncEngine] No new users to push.")
                return MachineSyncResult(message="All users already synced.")

            def _push(user_list):
                dev = self._device()
                if not dev.connect():
                    return {}, False
                try:
                    dev.disable_device()
                    existing_uids = {u["uid"] for u in dev.get_users()}
                    results = {}
                    for u in user_list:
                        mid  = str(u["machine_employee_id"])
                        name = (u.get("full_name") or "")[:24]
                        if mid in existing_uids:
                            results[u["id"]] = True   # already there
                            continue
                        ok = dev.set_user(uid=mid, name=name)
                        results[u["id"]] = ok
                    return results, True
                finally:
                    dev.enable_device()
                    dev.disconnect()

            results, connected = await self._run_in_thread(_push, to_add)
            if not connected:
                return MachineSyncResult(message="Cannot connect to device.", errors=1)

            added = 0
            for user in to_add:
                if results.get(user["id"]):
                    await db.users.update_one(
                        {"id": user["id"]},
                        {"$set": {"machine_synced": True}},
                    )
                    added += 1

            now = datetime.now(timezone.utc)
            await db.machine_config.update_one(
                {"key": "default"}, {"$set": {"last_user_sync": now}}
            )
            logger.info(f"[SyncEngine] User sync done: {added} added.")
            return MachineSyncResult(
                users_added = added,
                message     = f"{added} users pushed to device.",
                synced_at   = now,
            )

    # ── Remove deleted users ──────────────────────────────────────────────────

    async def remove_deleted_users(self) -> MachineSyncResult:
        if not self._cfg or not self._cfg.enabled:
            return MachineSyncResult(message="Machine sync disabled.")

        async with self._lock:
            users_raw = await db.users.find(
                {"machine_employee_id": {"$exists": True, "$ne": None},
                 "is_active": True},
                {"_id": 0, "machine_employee_id": 1},
            ).to_list(2000)
            active_uids = {str(u["machine_employee_id"]) for u in users_raw}

            def _remove():
                dev = self._device()
                if not dev.connect():
                    return 0, False
                try:
                    dev.disable_device()
                    device_users = dev.get_users()
                    removed = 0
                    for du in device_users:
                        if du["uid"] not in active_uids:
                            if dev.delete_user(du["uid"]):
                                removed += 1
                                logger.info(
                                    f"[SyncEngine] Removed uid={du['uid']} "
                                    f"('{du['name']}') from device."
                                )
                    return removed, True
                finally:
                    dev.enable_device()
                    dev.disconnect()

            removed, connected = await self._run_in_thread(_remove)
            if not connected:
                return MachineSyncResult(message="Cannot connect to device.", errors=1)
            return MachineSyncResult(
                users_removed = removed,
                message       = f"{removed} users removed from device.",
            )

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        """
        Long-running asyncio task.  Start with:
            asyncio.create_task(sync_engine.run())
        """
        logger.info("[SyncEngine] Starting eSSL sync engine …")
        await self._load_config()

        att_counter  = 0
        user_counter = 0
        hour_counter = 0

        while True:
            cfg = self._cfg or MachineConfig()
            if not cfg.enabled:
                await asyncio.sleep(30)
                continue

            await asyncio.sleep(1)
            att_counter  += 1
            user_counter += 1
            hour_counter += 1

            if att_counter >= cfg.sync_interval:
                att_counter = 0
                try:
                    await self.sync_attendance()
                except Exception as exc:
                    logger.error(f"[SyncEngine] attendance sync error: {exc}")

            if user_counter >= cfg.user_sync_interval:
                user_counter = 0
                try:
                    await self.sync_users_to_device()
                except Exception as exc:
                    logger.error(f"[SyncEngine] user sync error: {exc}")

            if hour_counter >= 3600:
                hour_counter = 0
                try:
                    await self.remove_deleted_users()
                except Exception as exc:
                    logger.error(f"[SyncEngine] remove-deleted error: {exc}")


# Singleton — imported by main.py
sync_engine = ESSLSyncEngine()


# ═══════════════════════════════════════════════════════════════════════════════
# § 5  INTERNAL PUNCH HELPER  (shared by route + sync engine)
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_recorded_at(recorded_at: Optional[str]) -> datetime:
    if recorded_at:
        try:
            dt = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _check_is_late(user_doc: dict, punch_in_ist: datetime) -> bool:
    try:
        h, m    = map(int, (user_doc.get("punch_in_time") or "10:30").split(":"))
        if user_doc.get("late_grace_minutes") is not None:
            grace = int(user_doc["late_grace_minutes"])
        else:
            raw   = str(user_doc.get("grace_time") or "00:15")
            gh, gm = map(int, raw.split(":"))
            grace  = gh * 60 + gm
        deadline = punch_in_ist.replace(
            hour=h, minute=m, second=0, microsecond=0
        ) + timedelta(minutes=grace)
        return punch_in_ist > deadline
    except Exception:
        return False


def _check_early_out(user_doc: dict, punch_out_ist: datetime) -> bool:
    try:
        h, m     = map(int, (user_doc.get("punch_out_time") or "19:00").split(":"))
        expected = punch_out_ist.replace(hour=h, minute=m, second=0, microsecond=0)
        return punch_out_ist < expected
    except Exception:
        return False


async def _record_machine_punch(
    user_id: str,
    payload: MachinePunchPayload,
    user_doc: dict,
) -> dict:
    """
    Core punch recording logic shared by both the sync engine
    and the HTTP route POST /attendance/machine-sync.
    """
    punch_utc = _parse_recorded_at(payload.recorded_at)
    punch_ist = punch_utc.astimezone(IST)
    today_str = punch_ist.date().isoformat()
    action    = payload.action

    existing = await db.attendance.find_one(
        {"user_id": user_id, "date": today_str}, {"_id": 0}
    )

    # ── punch_in ─────────────────────────────────────────────────────────────
    if action == "punch_in":
        if existing and existing.get("punch_in"):
            return {"existing": True, "message": "Already punched in (idempotent skip)"}

        is_late = _check_is_late(user_doc, punch_ist)
        await db.attendance.update_one(
            {"user_id": user_id, "date": today_str},
            {"$set": {
                "status":      "present",
                "punch_in":    punch_utc,
                "is_late":     is_late,
                "source":      payload.source,
                "machine_uid": payload.machine_uid,
                "leave_reason": None,
            }},
            upsert=True,
        )
        logger.info(
            f"[MachineSync] punch_in  user={user_id} "
            f"{punch_ist.strftime('%H:%M')} IST  late={is_late}"
        )
        return {"message": "Punch in recorded", "is_late": is_late}

    # ── punch_out ─────────────────────────────────────────────────────────────
    if not existing or not existing.get("punch_in"):
        # Synthesise a punch_in at shift-start so duration makes sense
        pit_str = (user_doc.get("punch_in_time") or "10:30")
        ph, pm  = map(int, pit_str.split(":"))
        synth   = punch_ist.replace(hour=ph, minute=pm, second=0, microsecond=0)
        await db.attendance.update_one(
            {"user_id": user_id, "date": today_str},
            {"$set": {
                "status":      "present",
                "punch_in":    synth.astimezone(timezone.utc),
                "is_late":     False,
                "source":      "machine_synthetic",
                "machine_uid": payload.machine_uid,
            }},
            upsert=True,
        )
        existing = await db.attendance.find_one(
            {"user_id": user_id, "date": today_str}, {"_id": 0}
        )

    if existing.get("punch_out"):
        return {"existing": True, "message": "Already punched out (idempotent skip)"}

    punch_in_dt = existing["punch_in"]
    if punch_in_dt.tzinfo is None:
        punch_in_dt = punch_in_dt.replace(tzinfo=timezone.utc)

    duration_minutes = max(0, int((punch_utc - punch_in_dt).total_seconds() / 60))
    early_out        = _check_early_out(user_doc, punch_ist)

    await db.attendance.update_one(
        {"user_id": user_id, "date": today_str},
        {"$set": {
            "punch_out":         punch_utc,
            "duration_minutes":  duration_minutes,
            "punched_out_early": early_out,
            "source_out":        payload.source,
        }},
    )
    logger.info(
        f"[MachineSync] punch_out user={user_id} "
        f"{punch_ist.strftime('%H:%M')} IST  "
        f"dur={duration_minutes}m  early={early_out}"
    )
    return {
        "message":           "Punch out recorded",
        "duration_minutes":  duration_minutes,
        "punched_out_early": early_out,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# § 6  FASTAPI ROUTER
# ═══════════════════════════════════════════════════════════════════════════════

essl_router = APIRouter(tags=["essl-machine"])


# ── GET /machine/status ───────────────────────────────────────────────────────

@essl_router.get("/machine/status", response_model=MachineStatusResponse)
async def get_machine_status(
    current_user: User = Depends(get_current_user),
):
    """
    Returns live connection status and sync metadata for the eSSL device.
    Available to all authenticated users (admins see full detail).
    """
    cfg = await sync_engine._load_config()

    # Count unsynced users
    total_users = await db.users.count_documents(
        {"machine_employee_id": {"$exists": True, "$ne": None}, "is_active": True}
    )
    unsynced = await db.users.count_documents(
        {"machine_employee_id": {"$exists": True, "$ne": None},
         "is_active": True, "machine_synced": {"$ne": True}}
    )

    # Quick ping (non-blocking)
    def _ping():
        dev = ESSLDevice(cfg.ip, cfg.port, timeout=3, password=cfg.password)
        return dev.ping()

    loop      = asyncio.get_event_loop()
    connected = await loop.run_in_executor(None, _ping)

    # Get device user count
    device_user_count = 0
    if connected:
        def _count():
            dev = ESSLDevice(cfg.ip, cfg.port, password=cfg.password)
            if dev.connect():
                try:
                    return len(dev.get_users())
                finally:
                    dev.disconnect()
            return 0
        device_user_count = await loop.run_in_executor(None, _count)

    return MachineStatusResponse(
        connected            = connected,
        device_ip            = cfg.ip,
        device_port          = cfg.port,
        last_attendance_sync = cfg.last_attendance_sync,
        last_user_sync       = cfg.last_user_sync,
        total_device_users   = device_user_count,
        total_unsynced_users = unsynced,
        enabled              = cfg.enabled,
    )


# ── GET /machine/config ───────────────────────────────────────────────────────

@essl_router.get("/machine/config")
async def get_machine_config(
    current_user: User = Depends(require_admin),
):
    """Return current device configuration (admin only)."""
    cfg = await sync_engine._load_config()
    data = cfg.model_dump()
    data.pop("password", None)   # never expose password in API response
    return data


# ── PUT /machine/config ───────────────────────────────────────────────────────

@essl_router.put("/machine/config")
async def update_machine_config(
    updates: MachineConfigUpdate,
    current_user: User = Depends(require_admin),
):
    """Update device IP, port, sync intervals, enable/disable (admin only)."""
    set_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not set_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    await db.machine_config.update_one(
        {"key": "default"},
        {"$set": set_data},
        upsert=True,
    )
    await sync_engine.reload_config()
    return {"message": "Machine config updated.", "updated": list(set_data.keys())}


# ── POST /machine/sync/attendance  (manual trigger) ──────────────────────────

@essl_router.post("/machine/sync/attendance", response_model=MachineSyncResult)
async def trigger_attendance_sync(
    current_user: User = Depends(require_admin),
):
    """Manually trigger an attendance pull from the device (admin only)."""
    return await sync_engine.sync_attendance()


# ── POST /machine/sync/users  (manual trigger) ───────────────────────────────

@essl_router.post("/machine/sync/users", response_model=MachineSyncResult)
async def trigger_user_sync(
    current_user: User = Depends(require_admin),
):
    """Manually push all unsynced Taskosphere users to the device (admin only)."""
    return await sync_engine.sync_users_to_device()


# ── POST /machine/sync/cleanup ────────────────────────────────────────────────

@essl_router.post("/machine/sync/cleanup", response_model=MachineSyncResult)
async def trigger_cleanup(
    current_user: User = Depends(require_admin),
):
    """Remove deactivated/deleted users from the device (admin only)."""
    return await sync_engine.remove_deleted_users()


# ── GET /machine/users  (live read from device) ───────────────────────────────

@essl_router.get("/machine/users", response_model=list[MachineUserResponse])
async def get_device_users(
    current_user: User = Depends(require_admin),
):
    """Return the list of users currently registered on the device (admin only)."""
    cfg = await sync_engine._load_config()

    def _get():
        dev = ESSLDevice(cfg.ip, cfg.port, password=cfg.password)
        if not dev.connect():
            return None
        try:
            return dev.get_users()
        finally:
            dev.disconnect()

    loop  = asyncio.get_event_loop()
    users = await loop.run_in_executor(None, _get)
    if users is None:
        raise HTTPException(status_code=503, detail="Cannot connect to biometric device.")
    return users


# ── GET /machine/logs  (live read from device) ────────────────────────────────

@essl_router.get("/machine/logs", response_model=list[MachineAttendanceLog])
async def get_device_logs(
    current_user: User = Depends(require_admin),
):
    """Return raw attendance logs currently on the device (admin only)."""
    cfg = await sync_engine._load_config()

    def _get():
        dev = ESSLDevice(cfg.ip, cfg.port, password=cfg.password)
        if not dev.connect():
            return None
        try:
            return dev.get_attendance_logs()
        finally:
            dev.disconnect()

    loop = asyncio.get_event_loop()
    logs = await loop.run_in_executor(None, _get)
    if logs is None:
        raise HTTPException(status_code=503, detail="Cannot connect to biometric device.")
    return [
        MachineAttendanceLog(
            user_id    = l["user_id"],
            timestamp  = l["timestamp"],
            punch_type = l["punch_type"],
        )
        for l in logs
    ]


# ── DELETE /machine/logs  (clear device logs) ─────────────────────────────────

@essl_router.delete("/machine/logs")
async def clear_device_logs(
    current_user: User = Depends(require_admin),
):
    """Clear ALL attendance logs stored on the device. Use with caution (admin only)."""
    cfg = await sync_engine._load_config()

    def _clear():
        dev = ESSLDevice(cfg.ip, cfg.port, password=cfg.password)
        if not dev.connect():
            return False
        try:
            return dev.clear_attendance_logs()
        finally:
            dev.disconnect()

    loop = asyncio.get_event_loop()
    ok   = await loop.run_in_executor(None, _clear)
    if not ok:
        raise HTTPException(status_code=503, detail="Failed to clear logs on device.")
    return {"message": "Device attendance logs cleared."}


# ── PUT /users/{user_id}/machine-id ──────────────────────────────────────────

@essl_router.put("/users/{user_id}/machine-id")
async def set_machine_employee_id(
    user_id: str,
    body:    MachineEmployeeIDUpdate,
    current_user: User = Depends(require_admin),
):
    """
    Assign or update the machine_employee_id for a Taskosphere user (admin only).
    The sync engine will push the user to the device within user_sync_interval seconds.

    Rules:
      • machine_employee_id must be a positive integer string.
      • Must be unique — no two users can share the same machine ID.
    """
    new_id = body.machine_employee_id.strip()

    if not new_id.isdigit() or int(new_id) <= 0:
        raise HTTPException(
            status_code=400,
            detail="machine_employee_id must be a positive integer string (e.g. '1', '42')."
        )

    conflict = await db.users.find_one(
        {"machine_employee_id": new_id, "id": {"$ne": user_id}},
        {"_id": 0, "full_name": 1},
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"machine_employee_id '{new_id}' is already assigned to "
                   f"{conflict.get('full_name', 'another user')}.",
        )

    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"machine_employee_id": new_id, "machine_synced": False}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "message":              f"machine_employee_id set to '{new_id}'.",
        "user_id":              user_id,
        "machine_employee_id":  new_id,
        "note":                 "User will be pushed to device within the next sync cycle.",
    }


# ── DELETE /users/{user_id}/machine-id ────────────────────────────────────────

@essl_router.delete("/users/{user_id}/machine-id")
async def remove_machine_employee_id(
    user_id: str,
    current_user: User = Depends(require_admin),
):
    """
    Unlink a user from the biometric machine (admin only).
    Also removes them from the physical device immediately.
    """
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")

    machine_uid = user_doc.get("machine_employee_id")
    if not machine_uid:
        raise HTTPException(
            status_code=400, detail="This user has no machine_employee_id assigned."
        )

    cfg = await sync_engine._load_config()

    def _delete():
        dev = ESSLDevice(cfg.ip, cfg.port, password=cfg.password)
        if not dev.connect():
            return False
        try:
            dev.disable_device()
            return dev.delete_user(machine_uid)
        finally:
            dev.enable_device()
            dev.disconnect()

    loop = asyncio.get_event_loop()
    ok   = await loop.run_in_executor(None, _delete)

    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"machine_employee_id": "", "machine_synced": ""}},
    )

    return {
        "message":            "User unlinked from biometric machine.",
        "removed_from_device": ok,
        "machine_uid":        machine_uid,
    }


# ── POST /attendance/machine-sync  (called by external sync daemon or internally) ──

@essl_router.post("/attendance/machine-sync")
async def machine_sync_punch(
    payload: MachinePunchPayload,
    user_id: str      = Query(..., description="Taskosphere user UUID"),
    current_user: User = Depends(get_current_user),
):
    """
    Record a single punch that originated from the physical biometric device.

    This endpoint is called by:
      • The internal ESSLSyncEngine (automatically).
      • An external sync daemon running on the LAN (if you prefer that approach).

    Requires authentication — use the admin service-account JWT.
    Idempotent: sending the same punch twice is safe (second call is silently skipped).
    """
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")

    if payload.action not in ("punch_in", "punch_out"):
        raise HTTPException(status_code=400, detail="action must be 'punch_in' or 'punch_out'.")

    return await _record_machine_punch(user_id, payload, user_doc)
