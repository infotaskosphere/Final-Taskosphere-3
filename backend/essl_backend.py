from __future__ import annotations

import asyncio
import logging
import socket
import struct
import hashlib
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
ZK_TIMEOUT          = 5          # seconds
ZK_HEADER_SIZE      = 8
ZK_ATT_RECORD_SIZE  = 40
ZK_SESSION_ID       = 0

CMD_CONNECT         = 1000
CMD_EXIT            = 1001
CMD_ENABLEDEVICE    = 1002
CMD_DISABLEDEVICE   = 1003
CMD_RESTART         = 1004
CMD_POWEROFF        = 1005
CMD_SLEEP           = 1006
CMD_RESUME          = 1007
CMD_TESTVOICE       = 1017
CMD_GETTIME         = 1100
CMD_SETTIME         = 1101
CMD_ACK_OK          = 2000
CMD_ACK_ERROR       = 2001
CMD_ACK_DATA        = 2002
CMD_PREPARE_DATA    = 1500
CMD_DATA            = 1501
CMD_FREE_DATA       = 1502
CMD_DB_RRQ          = 7
CMD_USER_WRQ        = 8
CMD_USERTEMP_RRQ    = 9
CMD_USERTEMP_WRQ    = 10
CMD_OPTIONS_RRQ     = 11
CMD_OPTIONS_WRQ     = 12
CMD_ATT_RRQ         = 13
CMD_CLEAR_DATA      = 14
CMD_CLEAR_ATT       = 15
CMD_DELETE_USER     = 18
CMD_NEW_USER        = 19
CMD_INFO            = 26
CMD_ACK_UNAUTH      = 2005
CMD_REFRESHDATA     = 1013

COMPAT_TEST_SPEED_50 = 0

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
                    # Attempt password auth if set
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
        """Send password to device after initial handshake."""
        pw_bytes = self.password.encode("ascii", errors="ignore")
        # ZK password is MD5-hashed in some firmware; send raw for simplicity
        response = self._send_command(CMD_CONNECT, pw_bytes)
        return bool(response and struct.unpack_from("<H", response, 0)[0] == CMD_ACK_OK)

    # ── Raw protocol ───────────────────────────────────────────────────────

    def _build_packet(self, cmd: int, data: bytes = b"") -> bytes:
        self._reply_id = (self._reply_id + 1) & 0xFFFF
        size = ZK_HEADER_SIZE + len(data)
        header = struct.pack(
            "<HHHH",
            cmd,
            0,               # checksum placeholder
            self._session,
            self._reply_id,
        )
        packet = header + data
        # Compute simple checksum
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
        """Receive a single response packet."""
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
        Receive a large payload that may arrive in multiple chunks.

        BUG-1 FIX: The original code stripped 8 bytes from EVERY chunk:
            raw += chunk[8:] if len(chunk) > 8 else chunk
        Only the FIRST chunk has the ZK header. Subsequent chunks are
        raw data — stripping 8 bytes from them corrupts the payload.
        """
        raw = b""
        first_chunk = True
        while len(raw) < size:
            # On first chunk we need to over-read by ZK_HEADER_SIZE to account
            # for the header bytes we will strip.
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
        """Return list of user records from the device."""
        self.disable()
        try:
            self._send_command(CMD_DB_RRQ, struct.pack("<HH", CMD_USER_WRQ, 0))
            # Prepare-data response tells us total size
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
        stride = 72   # ZK user record size
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
        """Write a user record to the device."""
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
        """
        Return raw attendance records from device.

        BUG-3 FIX: UID offset changed from record[0:9] to record[2:11].
        In the ZK protocol the 2-byte internal index occupies bytes 0-1;
        the enrollment number (the string UID you assigned when adding the
        user) starts at byte 2. Adjust the slice if your firmware differs —
        common alternatives are record[0:9] or record[0:8].
        """
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
        Parse raw ZK attendance records.
        Standard ZK ATT_RECORD_SIZE = 40 bytes.

        Layout (verified for ZK firmware 6.x / eSSL):
          [0:2]  internal user index (uint16 LE)
          [2:11] enrollment number / uid (9-byte ASCII, null-padded)
          [11]   reserved
          [12]   status (verify_type)
          [13]   punch_type  (0=check-in, 1=check-out, 4=break-out …)
          [14:16] reserved
          [16:20] timestamp (uint32 LE, seconds since 2000-01-01 00:00:00)
          …
        Note: some older eSSL firmware uses a different layout. If punches
        are mismatched, try uid = record[0:9].
        """
        records = []
        stride  = ZK_ATT_RECORD_SIZE
        epoch   = datetime(2000, 1, 1)   # ZK time base

        for offset in range(0, len(data) - stride + 1, stride):
            rec = data[offset: offset + stride]
            if len(rec) < stride:
                continue

            # BUG-3 FIX: enrollment number at bytes 2-11, not 0-9
            uid = rec[2:11].decode("ascii", errors="ignore").rstrip("\x00").strip()
            if not uid:
                continue

            punch_type = rec[13]   # byte 13 in this layout
            ts_raw     = struct.unpack_from("<I", rec, 16)[0]
            timestamp  = epoch + timedelta(seconds=ts_raw)  # device-local time (IST)

            records.append({
                "uid":        uid,
                "punch_type": punch_type,
                "timestamp":  timestamp,   # naive, device-local (IST)
                "status":     rec[12],
            })
        return records

    def clear_attendance(self) -> bool:
        r = self._send_command(CMD_CLEAR_ATT)
        return bool(r and struct.unpack_from("<H", r, 0)[0] == CMD_ACK_OK)

    def ping(self) -> bool:
        """Lightweight connectivity check — does not require auth."""
        try:
            return self.connect()
        except Exception:
            return False
        finally:
            self.disconnect()

    def _ping_and_count(self) -> Tuple[bool, int]:
        """
        BUG-8 FIX: Original get_machine_status opened two separate TCP
        connections (one ping + one user count). This helper opens one
        connection, reads user count, and disconnects — used by the
        status endpoint.
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
    BUG from review — check_is_late was defined twice with slightly
    different fallback logic: once here (_check_is_late) and once in
    main.py (check_is_late). They are now unified as this single function
    imported by both modules.

    punch_in:        naive UTC datetime
    expected_in_str: "HH:MM" string for the user's shift start
    grace_str:       "HH:MM" string for the grace period
    Returns True if the punch was later than expected + grace.
    """
    try:
        # Convert punch_in from UTC to IST for comparison
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
    Runs as a long-lived asyncio task, periodically:
      • syncing attendance logs from the device into the webapp DB
      • pushing new users from the webapp DB onto the device
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db  = db
        self._cfg: Optional[MachineConfig] = None
        # BUG-2 FIX: _synced_keys removed entirely.
        # The in-memory set was a memory leak (grew forever) and was
        # also completely ineffective across server restarts (empty after
        # restart → all old records re-inserted). Idempotency is now
        # handled exclusively by _record_machine_punch, which does a DB
        # lookup and returns {"existing": True} for duplicates.

    def reload_config(self, cfg: MachineConfig) -> None:
        self._cfg = cfg

    async def run(self) -> None:
        """
        Main loop. Sleeps 1 second per tick; fires syncs when counters
        exceed their respective intervals.

        BUG-5 FIX: att_counter and user_counter were not reset when the
        device was toggled disabled. This caused all sync operations to
        fire immediately the moment the device was re-enabled (because the
        counters had accumulated past the threshold while disabled).
        Both counters are now reset inside the disabled branch.
        """
        att_counter  = 0
        user_counter = 0

        while True:
            await asyncio.sleep(1)
            cfg = self._cfg or MachineConfig()

            if not cfg.enabled:
                # BUG-5 FIX: reset counters so syncs don't immediately
                # fire when the device is re-enabled.
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
        """
        Read attendance logs from device and write new punches into
        the webapp attendance collection.
        """
        loop = asyncio.get_running_loop()   # BUG-4 FIX

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

        # Update last-sync timestamp
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

        Device log fields:
          uid        — enrollment number (matches users.machine_employee_id)
          punch_type — 0=check-in, 1=check-out
          timestamp  — naive device-local datetime (IST)

        BUG-6 FIX: All datetimes are stored as naive UTC throughout.
        The original code stored punch_in as UTC-aware (timezone.utc),
        which MongoDB silently strips to naive on retrieval, then relied
        on a `tzinfo is None → replace(utc)` guard. This was fragile and
        confusing. We now convert to UTC at write time and store naive.
        """
        uid        = str(log["uid"]).strip()
        punch_type = int(log.get("punch_type", 0))
        # Device timestamp is in IST (device-local). Convert to naive UTC.
        ts_ist = log["timestamp"]   # naive, IST
        ts_utc = (ts_ist - timedelta(hours=5, minutes=30))  # naive UTC

        date_str = ts_ist.date().isoformat()   # YYYY-MM-DD in IST (correct business date)

        # Resolve webapp user from machine_employee_id
        user_doc = await self._db.users.find_one({"machine_employee_id": uid})
        if not user_doc:
            logger.debug("No user found for machine_employee_id=%s", uid)
            return {"skipped": True, "reason": "no_user"}

        ts_user_id = user_doc["id"]

        # BUG-2 FIX: idempotency check in DB, not in memory.
        # _record_machine_punch is the single source of truth.
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
                # Record exists (e.g. marked absent by cron) — fill punch_in
                await self._db.attendance.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "punch_in":          ts_utc,   # naive UTC
                        "status":            "late" if is_late else "present",
                        "is_late":           is_late,
                        "source":            "machine",
                        "machine_punch_type": punch_type_str,
                        "updated_at":        datetime.utcnow(),
                    }},
                )
            else:
                # BUG-6 FIX: synthetic punch_in uses naive UTC directly.
                # No timezone-aware datetime stored. No .astimezone() call needed.
                ph, pm = map(int, (user_doc.get("punch_in_time") or "10:30").split(":"))
                synth_ist = ts_ist.replace(hour=ph, minute=pm, second=0, microsecond=0)
                synth_utc = synth_ist - timedelta(hours=5, minutes=30)  # naive UTC

                await self._db.attendance.insert_one({
                    "id":                _new_id(),
                    "user_id":           ts_user_id,
                    "date":              date_str,
                    "punch_in":          ts_utc,       # naive UTC
                    "punch_out":         None,
                    "status":            "late" if is_late else "present",
                    "is_late":           is_late,
                    "source":            "machine",
                    "machine_punch_type": punch_type_str,
                    "duration_minutes":  None,
                    "created_at":        datetime.utcnow(),
                    "updated_at":        datetime.utcnow(),
                })
                return {"created": True}

        else:
            # ── Punch OUT ────────────────────────────────────────────────
            if existing and existing.get("punch_out"):
                return {"existing": True}

            if not existing or not existing.get("punch_in"):
                # No punch-in yet — create a stub record so punch-out is
                # not lost; punch-in will be backfilled if device sends it later.
                logger.debug("punch_out before punch_in for user %s on %s", ts_user_id, date_str)
                if not existing:
                    await self._db.attendance.insert_one({
                        "id":                _new_id(),
                        "user_id":           ts_user_id,
                        "date":              date_str,
                        "punch_in":          None,
                        "punch_out":         ts_utc,
                        "status":            "present",
                        "is_late":           False,
                        "source":            "machine",
                        "machine_punch_type": punch_type_str,
                        "duration_minutes":  None,
                        "created_at":        datetime.utcnow(),
                        "updated_at":        datetime.utcnow(),
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

            # Normal punch-out: fill punch_out and compute duration
            punch_in_dt = existing["punch_in"]
            # BUG-6 FIX: MongoDB returns naive UTC; no tzinfo guard needed
            # as long as we always store naive UTC (which we do above).
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
        """
        Push webapp users that have a machine_employee_id but are not yet
        synced (machine_synced=False) onto the device.
        """
        loop = asyncio.get_running_loop()   # BUG-4 FIX

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
                        results[u["id"]] = True   # already on device
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
    """Generate a short unique ID for new DB documents."""
    import uuid
    return str(uuid.uuid4())


# ══════════════════════════════════════════════════════════════════════════════
# 3. FastAPI router — /api/machine
# ══════════════════════════════════════════════════════════════════════════════

essl_router = APIRouter(prefix="/api/machine", tags=["Biometric Machine"])

# These are injected from main.py at startup.
# main.py must call:  essl_router.db = db; essl_router.sync_engine = engine
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


# ── Auth helpers (imported from main.py in real app) ─────────────────────────
# These are forward-declared here so the router works standalone.
# main.py overrides them by doing:
#   from essl_backend import essl_router
#   essl_router.dependency_overrides[get_current_user] = real_get_current_user

async def _noop_user():
    raise HTTPException(status_code=401, detail="Auth not configured")

async def _noop_admin():
    raise HTTPException(status_code=401, detail="Admin auth not configured")

# The actual dependencies are injected by main.py at startup.
# Placeholder callables replaced via app.dependency_overrides.
_get_current_user = _noop_user
_require_admin    = _noop_admin


# ── Config endpoints ──────────────────────────────────────────────────────────

@essl_router.get("/config", response_model=MachineConfig)
async def get_machine_config(current_user: User = Depends(_get_current_user)):  # type: ignore[misc]
    return await _load_config()


@essl_router.put("/config", response_model=MachineConfig)
async def update_machine_config(
    payload: MachineConfigUpdate,
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
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
async def get_machine_status(current_user: User = Depends(_require_admin)):  # type: ignore[misc]
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()   # BUG-4 FIX

    # BUG-8 FIX: single TCP connection for both ping and user count.
    dev = ESSLDevice(cfg.ip, cfg.port, timeout=3, password=cfg.password)
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
async def manual_sync_attendance(
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    cfg = await _load_config()
    if not cfg.enabled:
        raise HTTPException(status_code=400, detail="Biometric machine is disabled")
    return await _get_engine().sync_attendance(cfg)


@essl_router.post("/sync-users", response_model=MachineSyncResult)
async def manual_sync_users(
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    cfg = await _load_config()
    if not cfg.enabled:
        raise HTTPException(status_code=400, detail="Biometric machine is disabled")
    await _get_engine().sync_users_to_device(cfg)
    return MachineSyncResult(message="User sync triggered")


# ── Device user management ────────────────────────────────────────────────────

@essl_router.get("/users", response_model=List[MachineUserResponse])
async def get_machine_users(current_user: User = Depends(_require_admin)):  # type: ignore[misc]
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()   # BUG-4 FIX

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
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()   # BUG-4 FIX

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
async def delete_machine_user(
    uid: str,
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()   # BUG-4 FIX

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
async def get_machine_attendance_logs(
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    cfg  = await _load_config()
    loop = asyncio.get_running_loop()   # BUG-4 FIX

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

    # Convert device-local naive IST timestamps to naive UTC for the response
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
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    db = _get_db()

    # Uniqueness check — no two users may share the same machine_employee_id
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
        "machine_synced":      False,    # reset so next user-sync pushes to device
        "updated_at":          datetime.utcnow(),
    }
    result = await db.users.update_one({"id": user_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    action = "assigned" if payload.machine_employee_id else "unassigned"
    return {"message": f"Machine employee ID {action} successfully"}


# ── POST /attendance/machine-sync ─────────────────────────────────────────────
# This endpoint is mounted on the MAIN app router (not /api/machine), because
# it writes to the attendance collection — not the machine config collection.
# It is defined here for co-location with the biometric logic.
#
# BUG-7 FIX: Changed from Depends(get_current_user) to Depends(require_admin).
# A regular staff member must not be able to POST fake punches for any user_id.
#
# In main.py, include this as:
#   app.post("/api/attendance/machine-sync")(machine_sync_attendance)

async def machine_sync_attendance(
    payload: MachinePunchPayload,
    current_user: User = Depends(_require_admin),  # type: ignore[misc]
):
    """
    Manually ingest a single biometric punch.
    Primarily called by the sync engine internally, but also exposed
    as an admin-only HTTP endpoint for testing / manual correction.

    BUG-7 FIX: admin-only.
    """
    db = _get_db()

    # Validate user exists
    user_doc = await db.users.find_one({"id": payload.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail=f"User {payload.user_id} not found")

    log = {
        "uid":        payload.device_uid,
        "punch_type": int(payload.punch_type),
        # punch_time is UTC naive; convert to IST for _record_machine_punch
        # which expects device-local (IST) naive timestamp
        "timestamp":  payload.punch_time + timedelta(hours=5, minutes=30),
    }

    engine = _get_engine()
    result = await engine._record_machine_punch(log)
    return {"message": "Punch recorded", "result": result}
