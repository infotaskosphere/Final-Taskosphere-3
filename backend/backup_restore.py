"""Portable Taskosphere application backup / restore.

The portable .taskosphere file is a single encrypted container. It stores a
manifest, MongoDB documents in Canonical Extended JSON (BSON type preserving),
and index definitions. Full backups cover the complete application MongoDB
collection set. Custom backups can select modules or individual collections.

Authentication sessions/tokens are never exported. The current administrator's
live authentication credentials are preserved during restore so the restore
cannot lock the active administrator out of the application.
"""

from __future__ import annotations

import base64
import asyncio
import inspect
import json
import logging
import os
import secrets
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId, json_util
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from bson.json_util import CANONICAL_JSON_OPTIONS
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from backend.dependencies import DB_NAME, MONGO_URL, client, db, get_current_user, get_user_permissions
from backend.models import User
from backend.permission_governance import GOVERNED_MODULES

logger = logging.getLogger(__name__)

# Backup is a Permission Governance capability. Administrators retain their
# bypass; other users must be explicitly approved for this flag before they
# can create or inspect backups. Restore remains administrator-only.
GOVERNED_MODULES.setdefault(
    "backup_restore",
    {"flag": "can_view_backup_restore", "label": "Backup & Restore"},
)

router = APIRouter(prefix="/app-backup", tags=["Application Backup"])

FORMAT_MAGIC = b"TASKOSPHERE-BACKUP-V1\n"
FORMAT_VERSION = 1
PBKDF2_ITERATIONS = 390_000
CHUNK_SIZE = 1024 * 1024
MAX_BACKUP_UPLOAD_BYTES = 100 * 1024 * 1024
NEW_BACKUP_EXTENSION = ".onenexa"
LEGACY_BACKUP_EXTENSIONS = {".taskosphere"}
SUPPORTED_BACKUP_EXTENSIONS = {NEW_BACKUP_EXTENSION, *LEGACY_BACKUP_EXTENSIONS}
BACKUP_HISTORY_COLLECTION = "backup_history"
BACKUP_GRIDFS_BUCKET = "taskosphere_backups"

EXCLUDED_COLLECTIONS = {
    "sessions", "refresh_tokens", "access_tokens", "password_resets",
    "password_reset_tokens", "verification_tokens", "email_verification_tokens",
    "oauth_states", "oauth_tokens", "rate_limits",
    BACKUP_HISTORY_COLLECTION,
    f"{BACKUP_GRIDFS_BUCKET}.files",
    f"{BACKUP_GRIDFS_BUCKET}.chunks",
}

AUTH_FIELDS_TO_PRESERVE = {
    "password", "password_hash", "hashed_password", "hash", "auth_provider",
    "google_id", "google_sub", "mfa_secret", "two_factor_secret",
    "reset_token", "reset_token_expires", "verification_token",
    "token_version", "session_version", "security_stamp",
}

USER_LINKED_FIELDS = {
    "user_id", "created_by", "updated_by", "owner_id", "assigned_to",
    "assigned_to_user_id", "employee_id", "requested_by", "approved_by",
    "decided_by", "actor_user_id", "admin_id", "manager_id", "staff_id",
}

MODULE_COLLECTION_MAP = {
    "taskosphere": {"tasks", "todos", "reminders", "notification_history", "notifications"},
    "records": {"clients", "knowledge_base", "learning_events", "documents", "passwords"},
    "proposals": {"leads", "quotations", "proposals", "client_discussions", "client_activities"},
    "finix": {
        "invoices", "payments", "purchase_invoices", "purchase_payments", "purchases",
        "bank_accounts", "bank_transactions", "chart_of_accounts", "journal_entries", "journal_lines",
    },
    "people_matrix": {"attendance", "leave_requests", "payroll_records", "hr_records", "performance_records", "recruitment"},
    "compliance": {"compliance", "gst_reconciliation", "roc_records", "salary_slips", "due_dates"},
    "automation": {"workflow_definitions", "workflow_instances", "workflow_history", "approval_requests", "approval_history", "automation_rules", "business_events", "workflow_audit"},
    "analytics": {"analytics_data", "kpi_history", "recommendation_history", "learning_audit"},
    "settings": {"settings", "app_settings", "general_settings", "email_settings", "whatsapp_settings", "automation_settings", "feature_settings", "user_settings", "notification_settings", "integration_settings", "role_definitions"},
}


def _is_admin(user: User) -> bool:
    return str(getattr(user, "role", "")).lower() == "admin"


def _require_backup_access(user: User) -> None:
    if _is_admin(user):
        return
    permissions = get_user_permissions(user)
    if permissions.get("can_view_backup_restore", False):
        return
    raise HTTPException(status_code=403, detail="Backup access has not been approved for your account.")


def _require_admin(user: User) -> None:
    if _is_admin(user):
        return
    raise HTTPException(status_code=403, detail="Only an administrator can restore an application backup.")


def _raw_db():
    # Final-Taskosphere-3 exposes the active Motor/Mongo mock database
    # directly through backend.dependencies.db.
    return db


def _backup_gridfs(raw):
    return AsyncIOMotorGridFSBucket(raw, bucket_name=BACKUP_GRIDFS_BUCKET, chunk_size_bytes=CHUNK_SIZE)


async def _ensure_backup_history_indexes(raw):
    await raw[BACKUP_HISTORY_COLLECTION].create_index([("created_at", -1)])
    await raw[BACKUP_HISTORY_COLLECTION].create_index([("artifact_file_id", 1)], sparse=True)


def _history_document(doc: dict) -> dict:
    size = int(doc.get("file_size_bytes") or 0)
    return {
        "id": str(doc.get("_id")),
        "filename": doc.get("filename"),
        "created_at": doc.get("created_at"),
        "created_by": doc.get("created_by_name") or "Administrator",
        "mode": doc.get("mode") or "full",
        "source_application": doc.get("source_application") or "Final-Taskosphere-3",
        "collection_count": int(doc.get("collection_count") or 0),
        "document_count": int(doc.get("document_count") or 0),
        "file_size_bytes": size,
        "collections": doc.get("collections") or [],
        "deletable": bool(doc.get("artifact_file_id")),
    }


async def _persist_backup_history(output: str, filename: str, manifest: dict, current_user: User):
    raw = _raw_db()
    await _ensure_backup_history_indexes(raw)
    bucket = _backup_gridfs(raw)
    history_id = ObjectId()
    artifact_id = None
    stream = None
    file_size = os.path.getsize(output)
    try:
        stream = bucket.open_upload_stream(
            filename,
            chunk_size_bytes=CHUNK_SIZE,
            metadata={
                "format": "onenexa",
                "backupHistoryId": str(history_id),
                "sourceApplication": manifest.get("source_application") or "Final-Taskosphere-3",
                "version": manifest.get("version", FORMAT_VERSION),
            },
        )
        artifact_id = stream._id
        with open(output, "rb") as source:
            while True:
                chunk = source.read(CHUNK_SIZE)
                if not chunk:
                    break
                await stream.write(chunk)
        await stream.close()
        stream = None

        collections = sorted((manifest.get("collections") or {}).keys())
        document_count = sum(
            int(meta.get("documents") or 0)
            for meta in (manifest.get("collections") or {}).values()
        )
        await raw[BACKUP_HISTORY_COLLECTION].insert_one({
            "_id": history_id,
            "created_at": datetime.now(timezone.utc),
            "created_by": _s(getattr(current_user, "id", None)),
            "created_by_name": getattr(current_user, "full_name", None) or getattr(current_user, "name", None) or getattr(current_user, "email", None) or "Administrator",
            "filename": filename,
            "mode": "full" if manifest.get("selection") == "full" else "custom",
            "source_application": manifest.get("source_application") or "Final-Taskosphere-3",
            "collections": collections,
            "collection_count": len(collections),
            "document_count": document_count,
            "file_size_bytes": file_size,
            "artifact_file_id": artifact_id,
            "format_version": manifest.get("version", FORMAT_VERSION),
        })
        return history_id
    except Exception:
        if stream is not None:
            try:
                await stream.abort()
            except Exception:
                pass
        if artifact_id is not None:
            try:
                await bucket.delete(artifact_id)
            except Exception:
                pass
        raise


def _key(password: str, salt: bytes) -> bytes:
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="Backup password must be at least 8 characters.")
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=PBKDF2_ITERATIONS).derive(password.encode("utf-8"))


def _header(salt: bytes, nonce: bytes) -> bytes:
    metadata = {"format": "taskosphere-backup", "version": FORMAT_VERSION, "cipher": "AES-256-GCM", "kdf": "PBKDF2-HMAC-SHA256", "iterations": PBKDF2_ITERATIONS, "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode()}
    return FORMAT_MAGIC + json.dumps(metadata, separators=(",", ":")).encode() + b"\n"


def _read_header(handle):
    if handle.readline() != FORMAT_MAGIC:
        raise HTTPException(status_code=400, detail="Invalid Taskosphere backup file.")
    try:
        metadata = json.loads(handle.readline().decode())
        if metadata.get("format") != "taskosphere-backup" or metadata.get("version") != FORMAT_VERSION:
            raise ValueError("unsupported backup version")
        salt = base64.b64decode(metadata["salt"])
        nonce = base64.b64decode(metadata["nonce"])
        if len(salt) != 16 or len(nonce) != 12:
            raise ValueError("invalid encryption parameters")
        return salt, nonce
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid backup header: {exc}") from exc


def _encrypt(
    zip_path: str,
    output_path: str,
    password: str,
    progress_id: str | None = None,
    progress_start: float = 90.0,
    progress_end: float = 100.0,
    started_at: float | None = None,
) -> None:
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    encryptor = Cipher(algorithms.AES(_key(password, salt)), modes.GCM(nonce)).encryptor()
    total_bytes = max(1, os.path.getsize(zip_path))
    encrypted_bytes = 0
    with open(output_path, "wb") as out, open(zip_path, "rb") as source:
        out.write(_header(salt, nonce))
        while chunk := source.read(CHUNK_SIZE):
            encrypted_bytes += len(chunk)
            out.write(encryptor.update(chunk))
            if progress_id:
                elapsed = max(0.001, time.monotonic() - (started_at or time.monotonic()))
                stage_percent = min(100.0, (encrypted_bytes / total_bytes) * 100.0)
                percent = progress_start + ((progress_end - progress_start) * stage_percent / 100.0)
                remaining = total_bytes - encrypted_bytes
                speed = encrypted_bytes / elapsed if encrypted_bytes else 0.0
                eta = (remaining / speed) if speed > 0 else None
                _set_backup_progress(
                    progress_id,
                    phase="encrypting",
                    percent=round(percent, 2),
                    processed_bytes=encrypted_bytes,
                    total_bytes=total_bytes,
                    eta_seconds=round(eta, 1) if eta is not None else None,
                    elapsed_seconds=round(elapsed, 1),
                    current_collection=None,
                )
        out.write(encryptor.finalize())
        out.write(encryptor.tag)


def _decrypt(source_path: str, password: str) -> str:
    with open(source_path, "rb") as source:
        salt, nonce = _read_header(source)
        payload = source.read()
    if len(payload) <= 16:
        raise HTTPException(status_code=400, detail="Backup payload is incomplete.")
    ciphertext, tag = payload[:-16], payload[-16:]
    try:
        decryptor = Cipher(algorithms.AES(_key(password, salt)), modes.GCM(nonce, tag)).decryptor()
        plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Backup password is incorrect or the backup is corrupted.") from exc
    fd, path = tempfile.mkstemp(prefix="taskosphere-restore-", suffix=".zip")
    os.close(fd)
    with open(path, "wb") as out:
        out.write(plaintext)
    return path


def _dump(value: Any) -> str:
    return json_util.dumps(value, json_options=CANONICAL_JSON_OPTIONS)


def _load(value: str) -> Any:
    return json_util.loads(value, json_options=CANONICAL_JSON_OPTIONS)


def _s(value: Any) -> str:
    return str(value).strip() if value is not None else ""


async def _application_context(user: User):
    """Return application-wide backup context.

    Final-Taskosphere-3 is a single application/database and does not use the
    multi-customer/license model. Backup scope is therefore the
    complete application data set (excluding security/session collections).
    """
    raw = _raw_db()
    users = await raw.users.find({}).to_list(100000)
    user_ids = {_s(u.get("id")) for u in users if u.get("id")}
    user_ids.update(_s(u.get("_id")) for u in users if u.get("_id") is not None)
    user_ids.add(_s(user.id))
    return user_ids


# ---------------------------------------------------------------------------
# Resumable, proxy-safe artifact streaming
# ---------------------------------------------------------------------------
# Motor's ``open_download_stream`` is a coroutine and MUST be awaited. It was
# previously used un-awaited, so the response generator raised AttributeError
# *after* the 200 headers had been sent. The proxy then returned 502 (no CORS
# header), which the browser reported as "Network Error". Downloads are also
# served with Range support so an interrupted transfer can resume instead of
# restarting, and are marked ``Content-Encoding: identity`` so GZipMiddleware
# does not try to compress an already-encrypted (incompressible) payload.
def _parse_range_header(header: str | None, size: int):
    if not header or size <= 0 or not header.lower().startswith("bytes="):
        return None
    spec = header[6:].split(",")[0].strip()
    start_text, _, end_text = spec.partition("-")
    try:
        if start_text == "":
            suffix = int(end_text)
            if suffix <= 0:
                return None
            start, end = max(0, size - suffix), size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
    except ValueError:
        return None
    if start >= size or start > end:
        raise HTTPException(
            status_code=416,
            detail="Requested range is not satisfiable.",
            headers={"Content-Range": f"bytes */{size}"},
        )
    return start, min(end, size - 1)


async def _stream_backup_artifact(request: Request, raw, doc: dict, backup_id: str):
    artifact_id = doc.get("artifact_file_id")
    if not isinstance(artifact_id, ObjectId):
        artifact_id = ObjectId(artifact_id) if ObjectId.is_valid(str(artifact_id)) else None
    if artifact_id is None:
        raise HTTPException(status_code=410, detail="The backup artifact is no longer available.")

    bucket = _backup_gridfs(raw)
    try:
        grid_out = bucket.open_download_stream(artifact_id)
        if inspect.isawaitable(grid_out):
            grid_out = await grid_out
    except Exception as exc:
        logger.error("Backup artifact missing: %s", exc, exc_info=True)
        raise HTTPException(status_code=410, detail="The backup artifact is no longer available.") from exc

    size = int(getattr(grid_out, "length", None) or doc.get("file_size_bytes") or 0)
    byte_range = _parse_range_header(request.headers.get("range"), size)
    start, end = byte_range if byte_range else (0, max(0, size - 1))
    length = (end - start + 1) if size else None

    async def stream_backup():
        skip = start
        remaining = length
        try:
            while remaining is None or remaining > 0:
                chunk = await grid_out.read(CHUNK_SIZE)
                if not chunk:
                    break
                if skip:
                    if len(chunk) <= skip:
                        skip -= len(chunk)
                        continue
                    chunk = chunk[skip:]
                    skip = 0
                if remaining is not None:
                    chunk = chunk[:remaining]
                    remaining -= len(chunk)
                yield chunk
        except Exception:
            logger.error("Backup artifact stream failed for %s", backup_id, exc_info=True)
            raise
        finally:
            try:
                await grid_out.close()
            except Exception:
                pass

    filename = (doc.get("filename") or f"onenexa-backup-{backup_id}{NEW_BACKUP_EXTENSION}").replace('"', "")
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Accept-Ranges": "bytes",
        "Content-Encoding": "identity",
        "Cache-Control": "no-store",
        "X-Backup-Size": str(size),
    }
    status = 200
    if length is not None:
        headers["Content-Length"] = str(length)
    if byte_range:
        status = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(
        stream_backup(),
        status_code=status,
        media_type="application/octet-stream",
        headers=headers,
    )


@router.get("/info")
async def backup_info(current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)
    raw = _raw_db()
    users = await raw.users.find({}).to_list(100000)
    list_names = getattr(raw, "list_collection_names", None)
    available = (
        sorted(set(await list_names()) - EXCLUDED_COLLECTIONS)
        if callable(list_names)
        else sorted(set(getattr(raw, "_collections", {}).keys()) - EXCLUDED_COLLECTIONS)
    )
    modules = {module: sorted(set(collections) & set(available)) for module, collections in MODULE_COLLECTION_MAP.items()}
    return {
        "format": "Taskosphere Portable Backup v1",
        "scope": "single_application",
        "user_count": len(users),
        "collections": available,
        "modules": modules,
        "encrypted": True,
        "requires_password": True,
        "mongo_database": DB_NAME,
        "mongo_connection_configured": bool(MONGO_URL),
        "excluded_security_collections": sorted(EXCLUDED_COLLECTIONS),
        "notes": [
            "Full backup includes the complete application MongoDB data set and index definitions.",
            "Live sessions, reset tokens and OAuth state are never exported.",
            "Restore is designed for this standalone Taskosphere application/database and does not depend on commercial tenancy records.",
        ],
    }




# ---------------------------------------------------------------------------
# Backup progress tracking
# ---------------------------------------------------------------------------
# Progress is intentionally kept in-process because it is only used to give
# the browser a live status during the current backup request. The actual
# backup file remains on the server until the response background task removes
# it.
_BACKUP_PROGRESS = {}
_BACKUP_OUTPUTS = {}
_BACKUP_TASKS = {}
_BACKUP_PROGRESS_TTL_SECONDS = 3600
_BACKUP_OUTPUT_TTL_SECONDS = 3600

def _cleanup_backup_output(progress_id: str):
    item = _BACKUP_OUTPUTS.pop(progress_id, None)
    if item:
        try:
            os.unlink(item.get("path", ""))
        except (FileNotFoundError, TypeError):
            pass


async def _expire_backup_output(progress_id: str):
    await asyncio.sleep(_BACKUP_OUTPUT_TTL_SECONDS)
    item = _BACKUP_OUTPUTS.get(progress_id)
    if item and time.time() - float(item.get("created_at", time.time())) >= _BACKUP_OUTPUT_TTL_SECONDS:
        _cleanup_backup_output(progress_id)


def _set_backup_progress(progress_id: str | None, **values):
    if not progress_id:
        return
    now = time.time()
    state = _BACKUP_PROGRESS.get(progress_id, {})
    state.update(values)
    state["updated_at"] = now
    _BACKUP_PROGRESS[progress_id] = state

    # Opportunistic cleanup; no separate scheduler is necessary.
    cutoff = now - _BACKUP_PROGRESS_TTL_SECONDS
    stale = [
        key for key, item in _BACKUP_PROGRESS.items()
        if item.get("updated_at", now) < cutoff
    ]
    for key in stale:
        _BACKUP_PROGRESS.pop(key, None)


def _get_backup_progress(progress_id: str):
    state = _BACKUP_PROGRESS.get(progress_id)
    if not state:
        raise HTTPException(status_code=404, detail="Backup progress session not found.")
    state = dict(state)
    state.pop("updated_at", None)
    return state


async def _count_collection_documents(raw, name: str) -> int:
    collection = raw[name]
    counter = getattr(collection, "count_documents", None)
    if callable(counter):
        try:
            return int(await counter({}))
        except Exception:
            pass

    count = 0
    cursor = collection.find({})
    async for _doc in cursor:
        count += 1
    return count


@router.get("/create/progress/{progress_id}")
async def backup_create_progress(progress_id: str, current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)
    if not progress_id or len(progress_id) > 120:
        raise HTTPException(status_code=400, detail="Invalid backup progress id.")
    return _get_backup_progress(progress_id)


@router.post("/create")
async def create_backup(request: Request, current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)

    # Accept both multipart/form-data and JSON. Large full-application
    # backups can contain hundreds of thousands of documents, so the export
    # runs as an in-process background job instead of holding an HTTP request
    # open until the archive is complete.
    content_type = (request.headers.get("content-type") or "").lower()
    password = ""
    collections = ""

    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            password = str(form.get("password") or "")
            collections = str(form.get("collections") or "")
        elif "application/json" in content_type:
            payload = await request.json()
            if isinstance(payload, dict):
                password = str(payload.get("password") or "")
                collections = str(payload.get("collections") or "")
        else:
            try:
                payload = await request.json()
                if isinstance(payload, dict):
                    password = str(payload.get("password") or "")
                    collections = str(payload.get("collections") or "")
            except Exception:
                pass
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid backup request: {exc}") from exc

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Backup password must be at least 8 characters.")

    requested = [item.strip() for item in collections.split(",") if item.strip()] or None
    progress_id = (request.headers.get("x-backup-progress-id") or "").strip()[:120]
    if not progress_id:
        progress_id = secrets.token_urlsafe(24)

    _set_backup_progress(
        progress_id,
        owner_user_id=_s(current_user.id),
        phase="queued",
        percent=0.0,
        processed_documents=0,
        total_documents=0,
        eta_seconds=None,
        elapsed_seconds=0.0,
        current_collection=None,
        download_ready=False,
    )

    task = asyncio.create_task(
        _run_backup_job(progress_id, current_user, password, requested)
    )
    _BACKUP_TASKS[progress_id] = task

    return {
        "success": True,
        "progress_id": progress_id,
        "status": "queued",
        "message": "Backup job started.",
    }


async def _run_backup_job(
    progress_id: str,
    current_user: User,
    password: str,
    requested: list[str] | None,
):
    try:
        output, _manifest = await _build_archive(
            current_user,
            password,
            requested,
            progress_id,
        )
        filename = f"onenexa-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}{NEW_BACKUP_EXTENSION}"
        history_id = await _persist_backup_history(output, filename, _manifest, current_user)
        _BACKUP_OUTPUTS[progress_id] = {
            "path": output,
            "filename": filename,
            "owner_user_id": _s(current_user.id),
            "created_at": time.time(),
        }
        _set_backup_progress(
            progress_id,
            owner_user_id=_s(current_user.id),
            phase="ready",
            percent=100.0,
            eta_seconds=0.0,
            current_collection=None,
            file_size=os.path.getsize(output),
            download_ready=True,
            filename=filename,
            history_id=str(history_id),
        )
        asyncio.create_task(_expire_backup_output(progress_id))
    except Exception as exc:
        previous = _BACKUP_PROGRESS.get(progress_id, {})
        _set_backup_progress(
            progress_id,
            owner_user_id=_s(current_user.id),
            phase="error",
            percent=float(previous.get("percent") or 0.0),
            processed_documents=previous.get("processed_documents", 0),
            total_documents=previous.get("total_documents", 0),
            eta_seconds=None,
            current_collection=previous.get("current_collection"),
            error=str(exc) if isinstance(exc, HTTPException) else f"Backup creation failed on the server: {exc}",
            download_ready=False,
        )
        logger.error("Background backup creation failed for %s: %s", progress_id, exc, exc_info=True)
    finally:
        _BACKUP_TASKS.pop(progress_id, None)


@router.get("/create/download/{progress_id}")
async def download_created_backup(progress_id: str, request: Request, current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)
    if not progress_id or len(progress_id) > 120:
        raise HTTPException(status_code=400, detail="Invalid backup progress id.")
    state = _get_backup_progress(progress_id)
    if _s(state.get("owner_user_id")) != _s(current_user.id):
        raise HTTPException(status_code=404, detail="Backup progress session not found.")
    if state.get("phase") != "ready":
        raise HTTPException(status_code=409, detail="Backup is still being created.")
    history_id = _s(state.get("history_id"))
    if not ObjectId.is_valid(history_id):
        raise HTTPException(status_code=409, detail="Backup is not ready for download or has expired.")
    raw = _raw_db()
    # Serve the persisted GridFS artifact (not a process-local temp file) so the
    # download survives worker restarts and can be retried / resumed.
    doc = await raw[BACKUP_HISTORY_COLLECTION].find_one({"_id": ObjectId(history_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Backup history record not found.")
    return await _stream_backup_artifact(request, raw, doc, history_id)


@router.get("/history")
async def list_backup_history(current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)
    raw = _raw_db()
    await _ensure_backup_history_indexes(raw)
    cursor = raw[BACKUP_HISTORY_COLLECTION].find({}).sort("created_at", -1)
    records = []
    async for doc in cursor:
        records.append(_history_document(doc))
    return {"history": records, "count": len(records)}


@router.get("/history/{backup_id}/download")
async def download_backup_history(backup_id: str, request: Request, current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)
    if not ObjectId.is_valid(backup_id):
        raise HTTPException(status_code=400, detail="Invalid backup history id.")
    raw = _raw_db()
    doc = await raw[BACKUP_HISTORY_COLLECTION].find_one({"_id": ObjectId(backup_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Backup history record not found.")
    return await _stream_backup_artifact(request, raw, doc, backup_id)


@router.delete("/history/{backup_id}")
async def delete_backup_history(backup_id: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    if not ObjectId.is_valid(backup_id):
        raise HTTPException(status_code=400, detail="Invalid backup history id.")
    raw = _raw_db()
    collection = raw[BACKUP_HISTORY_COLLECTION]
    doc = await collection.find_one({"_id": ObjectId(backup_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Backup history record not found.")

    deleted = await collection.delete_one({"_id": ObjectId(backup_id)})
    if deleted.deleted_count != 1:
        raise HTTPException(status_code=409, detail="Backup history record changed before deletion. Refresh and retry.")

    artifact_id = doc.get("artifact_file_id")
    if not isinstance(artifact_id, ObjectId):
        artifact_id = ObjectId(artifact_id) if ObjectId.is_valid(str(artifact_id)) else None
    if artifact_id is not None:
        try:
            await _backup_gridfs(raw).delete(artifact_id)
        except Exception as exc:
            try:
                await collection.insert_one(doc)
            except Exception:
                logger.critical("Backup history rollback failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Backup data could not be deleted completely. The history record was restored; please retry.") from exc

    return {"success": True, "deleted_backup_id": backup_id}




async def _read_archive(zip_path: str):
    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            names = set(archive.namelist())
            if "manifest.json" not in names:
                raise ValueError("manifest.json is missing")
            manifest = json.loads(archive.read("manifest.json").decode())
            if manifest.get("format") != "taskosphere-backup" or manifest.get("version") != FORMAT_VERSION:
                raise ValueError("unsupported backup format")
            collections = []
            for name, meta in (manifest.get("collections") or {}).items():
                entry = f"collections/{meta['safe_name']}.jsonl"
                if entry not in names:
                    raise ValueError(f"Collection payload missing: {name}")
                docs = [_load(line) for line in archive.read(entry).decode().splitlines() if line.strip()]
                collections.append((name, docs))
            return manifest, collections
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Backup archive is invalid: {exc}") from exc


def _replace(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, str):
        return replacements.get(value, value)
    if isinstance(value, list):
        return [_replace(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: _replace(item, replacements) for key, item in value.items()}
    return value


async def _restore(manifest: dict, collections: list[tuple[str, list[dict]]], current_user: User):
    raw = _raw_db()
    restored = removed = 0
    selected_names = {name for name, _ in collections}

    for name in selected_names:
        if name in EXCLUDED_COLLECTIONS:
            continue
        if name == "users":
            result = await raw.users.delete_many({"id": {"$ne": current_user.id}})
            removed += getattr(result, "deleted_count", 0)
            continue

        existing = await raw[name].find({}).to_list(100000)
        for doc in existing:
            if doc.get("_id") is not None:
                await raw[name].delete_one({"_id": doc["_id"]})
            elif doc.get("id") is not None:
                await raw[name].delete_one({"id": doc["id"]})
            else:
                continue
            removed += 1

    for name, docs in collections:
        if name in EXCLUDED_COLLECTIONS:
            continue

        if name == "users":
            live_admin = await raw.users.find_one({"id": current_user.id})
            for doc in docs:
                doc = dict(doc)
                if _s(doc.get("id")) == _s(current_user.id) and live_admin:
                    for field in AUTH_FIELDS_TO_PRESERVE:
                        if field in live_admin:
                            doc[field] = live_admin[field]
                    doc["id"] = current_user.id
                query = {"id": doc.get("id")} if doc.get("id") is not None else {"_id": doc.get("_id")}
                if hasattr(raw.users, "replace_one"):
                    await raw.users.replace_one(query, doc, upsert=True)
                else:
                    await raw.users.update_one(query, {"$set": doc}, upsert=True)
                restored += 1
            continue

        for doc in docs:
            query = {"_id": doc["_id"]} if doc.get("_id") is not None else {"id": doc.get("id")}
            if hasattr(raw[name], "replace_one"):
                await raw[name].replace_one(query, doc, upsert=True)
            else:
                await raw[name].update_one(query, {"$set": doc}, upsert=True)
            restored += 1

    return {"restored_documents": restored, "removed_documents": removed}


@router.post("/restore")
async def restore_backup(backup: UploadFile = File(...), password: str = Form(...), confirmation: str = Form(...), current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    if confirmation.strip() != "RESTORE":
        raise HTTPException(status_code=400, detail="Type RESTORE exactly to confirm the operation.")
    backup_extension = os.path.splitext(backup.filename or "")[1].lower()
    if backup_extension not in SUPPORTED_BACKUP_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Upload a .onenexa backup file. Legacy .taskosphere backups are also supported.")
    fd, source_path = tempfile.mkstemp(prefix="onenexa-upload-", suffix=backup_extension)
    os.close(fd)
    zip_path = None
    try:
        total = 0
        with open(source_path, "wb") as out:
            while chunk := await backup.read(CHUNK_SIZE):
                total += len(chunk)
                if total > MAX_BACKUP_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Backup file exceeds the 100 MB upload limit.")
                out.write(chunk)
        zip_path = _decrypt(source_path, password)
        manifest, collections = await _read_archive(zip_path)
        if manifest.get("scope") != "single_application":
            raise HTTPException(status_code=400, detail="Unsupported backup scope.")
        result = await _restore(manifest, collections, current_user)
        return {"success": True, "message": "Application backup restored successfully.", **result}
    finally:
        try: os.unlink(source_path)
        except FileNotFoundError: pass
        if zip_path:
            try: os.unlink(zip_path)
            except FileNotFoundError: pass


# ---------------------------------------------------------------------------
# Progressive backup builder
# ---------------------------------------------------------------------------
async def _build_archive(
    user: User,
    password: str,
    requested: list[str] | None,
    progress_id: str | None = None,
):
    selected = await _resolve_collections(user, requested)
    raw = _raw_db()
    started_at = time.monotonic()

    _set_backup_progress(
        progress_id,
        phase="preparing",
        percent=0.0,
        processed_documents=0,
        total_documents=0,
        eta_seconds=None,
        elapsed_seconds=0.0,
        current_collection=None,
    )

    # Count first so the UI can display a real percentage rather than a
    # collection-index approximation.
    total_documents = 0
    for name in selected:
        total_documents += await _count_collection_documents(raw, name)

    _set_backup_progress(
        progress_id,
        phase="creating",
        percent=0.0 if total_documents else 90.0,
        processed_documents=0,
        total_documents=total_documents,
        eta_seconds=None,
        elapsed_seconds=round(time.monotonic() - started_at, 1),
        current_collection=None,
    )

    manifest = {
        "format": "taskosphere-backup",
        "version": FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "database": DB_NAME,
        "scope": "single_application",
        "owner_user_id": _s(user.id),
        "bson_encoding": "MongoDB Extended JSON v2 canonical",
        "encryption": "AES-256-GCM + PBKDF2-HMAC-SHA256",
        "selection": "full" if not requested else "custom",
        "collections": {},
        "excluded_collections": sorted(EXCLUDED_COLLECTIONS),
    }

    fd, zip_path = tempfile.mkstemp(prefix="taskosphere-backup-", suffix=".zip")
    os.close(fd)
    output = None
    processed_documents = 0

    try:
        with zipfile.ZipFile(
            zip_path,
            "w",
            compression=zipfile.ZIP_STORED,
            allowZip64=True,
        ) as archive:
            for name in selected:
                safe = name.replace("/", "_")
                document_count = 0

                with archive.open(
                    f"collections/{safe}.jsonl",
                    mode="w",
                    force_zip64=True,
                ) as entry:
                    cursor = raw[name].find({})
                    pending_lines = []
                    async for doc in cursor:
                        pending_lines.append(_dump(doc))
                        document_count += 1
                        processed_documents += 1
                        if len(pending_lines) >= 500:
                            entry.write(("\n".join(pending_lines) + "\n").encode("utf-8"))
                            pending_lines.clear()

                        if processed_documents % 500 == 0 or processed_documents == total_documents:
                            elapsed = max(0.001, time.monotonic() - started_at)
                            ratio = (
                                processed_documents / total_documents
                                if total_documents
                                else 1.0
                            )
                            percent = min(90.0, ratio * 90.0)
                            speed = processed_documents / elapsed if processed_documents else 0.0
                            remaining = max(0, total_documents - processed_documents)
                            eta = (remaining / speed) if speed > 0 else None

                            _set_backup_progress(
                                progress_id,
                                phase="creating",
                                percent=round(percent, 2),
                                processed_documents=processed_documents,
                                total_documents=total_documents,
                                eta_seconds=round(eta, 1) if eta is not None else None,
                                elapsed_seconds=round(elapsed, 1),
                                current_collection=name,
                            )

                        if processed_documents % 50 == 0:
                            await asyncio.sleep(0)

                    if pending_lines:
                        entry.write(("\n".join(pending_lines) + "\n").encode("utf-8"))
                        pending_lines.clear()

                try:
                    list_indexes = getattr(raw[name], "list_indexes", None)
                    indexes = (
                        await list_indexes().to_list(1000)
                        if callable(list_indexes)
                        else []
                    )
                    indexes = [idx for idx in indexes if idx.get("name") != "_id_"]
                    if indexes:
                        archive.writestr(f"indexes/{safe}.json", _dump(indexes))
                except Exception:
                    pass

                if document_count:
                    manifest["collections"][name] = {
                        "documents": document_count,
                        "safe_name": safe,
                    }

            archive.writestr(
                "manifest.json",
                json.dumps(manifest, indent=2, sort_keys=True),
            )

        fd, output = tempfile.mkstemp(
            prefix="onenexa-backup-",
            suffix=NEW_BACKUP_EXTENSION,
        )
        os.close(fd)

        _set_backup_progress(
            progress_id,
            phase="encrypting",
            percent=90.0,
            processed_documents=processed_documents,
            total_documents=total_documents,
            eta_seconds=None,
            elapsed_seconds=round(time.monotonic() - started_at, 1),
            current_collection=None,
        )

        await asyncio.to_thread(
            _encrypt,
            zip_path,
            output,
            password,
            progress_id,
            90.0,
            100.0,
            started_at,
        )

        file_size = os.path.getsize(output)
        elapsed = max(0.001, time.monotonic() - started_at)
        _set_backup_progress(
            progress_id,
            phase="ready",
            percent=100.0,
            processed_documents=processed_documents,
            total_documents=total_documents,
            eta_seconds=0.0,
            elapsed_seconds=round(elapsed, 1),
            current_collection=None,
            file_size=file_size,
        )

        return output, manifest

    except Exception as exc:
        _set_backup_progress(
            progress_id,
            phase="error",
            percent=0.0,
            eta_seconds=None,
            elapsed_seconds=round(time.monotonic() - started_at, 1),
            error="Backup creation failed on the server.",
        )
        logger.error("Progressive backup creation failed: %s", exc, exc_info=True)
        if output:
            try:
                os.unlink(output)
            except FileNotFoundError:
                pass
        raise
    finally:
        try:
            os.unlink(zip_path)
        except FileNotFoundError:
            pass

