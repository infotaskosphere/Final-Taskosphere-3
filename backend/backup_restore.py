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
import json
import os
import secrets
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId, json_util
from bson.json_util import CANONICAL_JSON_OPTIONS
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from backend.dependencies import DB_NAME, MONGO_URL, client, db, get_current_user, get_user_permissions
from backend.models import User
from backend.permission_governance import GOVERNED_MODULES

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

EXCLUDED_COLLECTIONS = {
    "sessions", "refresh_tokens", "access_tokens", "password_resets",
    "password_reset_tokens", "verification_tokens", "email_verification_tokens",
    "oauth_states", "oauth_tokens", "rate_limits",
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


def _encrypt(zip_path: str, output_path: str, password: str) -> None:
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    encryptor = Cipher(algorithms.AES(_key(password, salt)), modes.GCM(nonce)).encryptor()
    with open(output_path, "wb") as out, open(zip_path, "rb") as source:
        out.write(_header(salt, nonce))
        while chunk := source.read(CHUNK_SIZE):
            out.write(encryptor.update(chunk))
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


async def _collection_docs(raw, name: str):
    if name in EXCLUDED_COLLECTIONS:
        return []
    return await raw[name].find({}).to_list(100000)


async def _resolve_collections(user: User, requested: list[str] | None):
    raw = _raw_db()
    list_names = getattr(raw, "list_collection_names", None)
    available = (
        sorted(set(await list_names()) - EXCLUDED_COLLECTIONS)
        if callable(list_names)
        else sorted(set(getattr(raw, "_collections", {}).keys()) - EXCLUDED_COLLECTIONS)
    )
    if not requested:
        selected = available
    else:
        requested_set = {name for name in requested if name in available}
        if not requested_set:
            raise HTTPException(status_code=400, detail="No valid backup collections were selected.")
        selected = sorted(requested_set)
    return selected


async def _build_archive(user: User, password: str, requested: list[str] | None):
    selected = await _resolve_collections(user, requested)
    raw = _raw_db()
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
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name in selected:
                docs = await _collection_docs(raw, name)
                if not docs:
                    continue
                safe = name.replace("/", "_")
                archive.writestr(f"collections/{safe}.jsonl", "".join(_dump(d) + "\n" for d in docs))
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
                manifest["collections"][name] = {"documents": len(docs), "safe_name": safe}
            archive.writestr("manifest.json", json.dumps(manifest, indent=2, sort_keys=True))
        fd, output = tempfile.mkstemp(prefix="taskosphere-backup-", suffix=".taskosphere")
        os.close(fd)
        _encrypt(zip_path, output, password)
        return output, manifest
    except Exception:
        try:
            os.unlink(locals().get("output", ""))
        except (FileNotFoundError, TypeError):
            pass
        raise
    finally:
        try:
            os.unlink(zip_path)
        except FileNotFoundError:
            pass


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


@router.post("/create")
async def create_backup(password: str = Form(...), collections: str = Form(""), current_user: User = Depends(get_current_user)):
    _require_backup_access(current_user)
    requested = [item.strip() for item in collections.split(",") if item.strip()] or None
    output, _manifest = await _build_archive(current_user, password, requested)
    filename = f"taskosphere-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.taskosphere"
    return FileResponse(output, media_type="application/octet-stream", filename=filename, background=BackgroundTask(lambda: os.path.exists(output) and os.unlink(output)))


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
    if not backup.filename or not backup.filename.endswith(".taskosphere"):
        raise HTTPException(status_code=400, detail="Upload a .taskosphere backup file.")
    fd, source_path = tempfile.mkstemp(prefix="taskosphere-upload-", suffix=".taskosphere")
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
