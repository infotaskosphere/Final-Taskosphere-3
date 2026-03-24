from __future__ import annotations

import os
import uuid
import base64
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response
from pydantic import BaseModel, Field, ConfigDict, ValidationError
import pandas as pd
import io

from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

logger = logging.getLogger(__name__)

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/passwords", tags=["password-repository"])

# ── Encryption bootstrap ──────────────────────────────────────────────────────
try:
    from cryptography.fernet import Fernet, InvalidToken

    _env_key = os.getenv("PASSWORD_REPO_KEY", "").strip()

    if _env_key:
        try:
            _fernet_key = _env_key.encode()
            Fernet(_fernet_key)
        except Exception:
            _fernet_key = base64.urlsafe_b64encode(
                hashlib.sha256(_env_key.encode()).digest()
            )
    else:
        _seed = os.getenv("MONGO_URI", "taskosphere-default-seed-2024")
        _fernet_key = base64.urlsafe_b64encode(
            hashlib.sha256(_seed.encode()).digest()
        )
        logger.warning(
            "PASSWORD_REPO_KEY not set — using derived key. "
            "Set PASSWORD_REPO_KEY in .env for production security."
        )

    _fernet = Fernet(_fernet_key)
    ENCRYPTION_AVAILABLE = True

except ImportError:
    _fernet = None
    ENCRYPTION_AVAILABLE = False
    logger.warning(
        "cryptography package not installed — passwords stored as base64 only. "
        "Run: pip install cryptography"
    )


def _encrypt(plain: str) -> str:
    if not plain:
        return ""
    if ENCRYPTION_AVAILABLE and _fernet:
        return _fernet.encrypt(plain.encode()).decode()
    return base64.b64encode(plain.encode()).decode()


def _decrypt(cipher: str) -> str:
    if not cipher:
        return ""
    if ENCRYPTION_AVAILABLE and _fernet:
        try:
            return _fernet.decrypt(cipher.encode()).decode()
        except Exception:
            try:
                return base64.b64decode(cipher).decode()
            except Exception:
                return "[decryption failed]"
    try:
        return base64.b64decode(cipher).decode()
    except Exception:
        return cipher


# ── Pydantic schemas ──────────────────────────────────────────────────────────

PORTAL_TYPES = [
    "MCA", "DGFT", "TRADEMARK", "GST", "INCOME_TAX", "TDS",
    "EPFO", "ESIC", "TRACES", "MSME", "RERA", "ROC", "OTHER",
]

DEPARTMENT_MAP = {
    "MCA":        "ROC",
    "ROC":        "ROC",
    "DGFT":       "OTHER",
    "TRADEMARK":  "TM",
    "GST":        "GST",
    "INCOME_TAX": "IT",
    "TDS":        "TDS",
    "EPFO":       "ACC",
    "ESIC":       "ACC",
    "TRACES":     "TDS",
    "MSME":       "MSME",
    "RERA":       "OTHER",
    "OTHER":      "OTHER",
}


class PasswordEntryCreate(BaseModel):
    portal_name: str = Field(..., min_length=2, max_length=120)
    portal_type: str = "OTHER"
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None
    department: str = "OTHER"
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class PasswordEntryUpdate(BaseModel):
    portal_name: Optional[str] = None
    portal_type: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None
    department: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class PasswordEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    portal_name: str
    portal_type: str
    url: Optional[str] = None
    username: Optional[str] = None
    department: str
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []
    created_by: str
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_accessed_at: Optional[str] = None
    has_password: bool = False


class PasswordRevealResponse(BaseModel):
    id: str
    username: Optional[str]
    password: str
    portal_name: str


class BulkImportResult(BaseModel):
    total_processed: int
    successful_imports: int
    failed_imports: int
    errors: List[dict]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_perms(user: User) -> dict:
    if isinstance(user.permissions, dict):
        return user.permissions
    if user.permissions:
        return user.permissions.model_dump()
    return {}


def _can_view(user: User, entry: dict) -> bool:
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    if not perms.get("can_view_passwords", False):
        return False
    if user.role == "manager":
        return entry.get("department") in (user.departments or [])
    allowed_depts = perms.get("view_password_departments", [])
    return (
        entry.get("department") in (user.departments or [])
        or entry.get("department") in (allowed_depts or [])
    )


def _can_reveal(user: User, entry: dict) -> bool:
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    if not perms.get("can_view_passwords", False):
        return False
    allowed_depts = perms.get("view_password_departments", [])
    return (
        entry.get("department") in (user.departments or [])
        or entry.get("department") in (allowed_depts or [])
    )


def _can_edit(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    return perms.get("can_edit_passwords", False)


def _strip_sensitive(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_encrypted", None)
    doc["has_password"] = bool(doc.get("_password_set", False))
    doc.pop("_password_set", None)
    return doc


async def _enrich_entry(doc: dict) -> dict:
    creator_id = doc.get("created_by")
    if creator_id:
        u = await db.users.find_one({"id": creator_id}, {"_id": 0, "full_name": 1})
        if u:
            doc["created_by_name"] = u.get("full_name", "Unknown")
    return doc


# ── STATIC / UTILITY ROUTES (must come BEFORE /{entry_id}) ───────────────────

@router.get("/portal-types")
async def get_portal_types(current_user: User = Depends(get_current_user)):
    return {"portal_types": PORTAL_TYPES, "department_map": DEPARTMENT_MAP}


@router.get("/clients-list")
async def get_clients_for_password(current_user: User = Depends(get_current_user)):
    """Return a lightweight list of clients for the password form dropdown."""
    query = {}
    if current_user.role != "admin":
        perms = _get_user_perms(current_user)
        if not perms.get("can_view_all_clients", False):
            query["$or"] = [
                {"assigned_to": current_user.id},
                {"assignments.user_id": current_user.id},
            ]

    clients = await db.clients.find(
        query,
        {"_id": 0, "id": 1, "company_name": 1, "phone": 1, "email": 1,
         "client_type": 1, "director_phone": 1, "contact_phone": 1,
         "director_name": 1, "contact_name": 1, "contact_persons": 1}
    ).sort("company_name", 1).to_list(2000)

    return clients


# ── IMPORTANT: /template and /bulk-import MUST be before /{entry_id} ─────────

@router.get("/template", response_class=Response)
async def download_template(current_user: User = Depends(get_current_user)):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to download templates")

    template_columns = [
        "portal_name", "portal_type", "url", "username", "password_plain",
        "department", "client_name", "client_id", "notes", "tags"
    ]
    df = pd.DataFrame(columns=template_columns)

    example_data = {
        "portal_name":    "Example GST Portal",
        "portal_type":    "GST",
        "url":            "https://www.gst.gov.in",
        "username":       "example@gst.com",
        "password_plain": "SecurePassword123",
        "department":     "GST",
        "client_name":    "Example Client Pvt Ltd",
        "client_id":      "CL001",
        "notes":          "GST login for quarterly filings",
        "tags":           "GST,Client,Important"
    }
    df.loc[0] = example_data

    output = io.BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)

    headers = {
        "Content-Disposition": "attachment; filename=password_template.xlsx",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
    return Response(content=output.getvalue(), headers=headers)


@router.post("/bulk-import", response_model=BulkImportResult, status_code=200)
async def bulk_import_passwords(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to bulk import passwords")

    contents = await file.read()
    file_like_object = io.BytesIO(contents)

    df = None
    if file.filename.endswith(('.xlsx', '.xls')):
        df = pd.read_excel(file_like_object, engine='openpyxl')
    elif file.filename.endswith('.csv'):
        df = pd.read_csv(file_like_object)
    else:
        raise HTTPException(400, "Unsupported file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.")

    required_columns = [
        "portal_name", "portal_type", "url", "username", "password_plain",
        "department", "client_name", "client_id", "notes", "tags"
    ]
    df.columns = df.columns.str.lower()
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise HTTPException(400, f"Missing required columns in the file: {', '.join(missing_columns)}")

    total_processed = 0
    successful_imports = 0
    failed_imports = 0
    errors = []

    for index, row in df.iterrows():
        total_processed += 1
        try:
            client_name_val = str(row.get("client_name", "")).strip() or None
            client_id_val = str(row.get("client_id", "")).strip() or None

            if client_id_val and not client_name_val:
                client_doc = await db.clients.find_one({"id": client_id_val}, {"_id": 0, "company_name": 1})
                if client_doc:
                    client_name_val = client_doc.get("company_name")

            entry_data = {
                "portal_name":    str(row.get("portal_name", "")).strip(),
                "portal_type":    str(row.get("portal_type", "OTHER")).upper(),
                "url":            str(row.get("url", "")).strip() or None,
                "username":       str(row.get("username", "")).strip() or None,
                "password_plain": str(row.get("password_plain", "")).strip() or None,
                "department":     str(row.get("department", "OTHER")).upper(),
                "client_name":    client_name_val,
                "client_id":      client_id_val,
                "notes":          str(row.get("notes", "")).strip() or None,
                "tags":           [t.strip() for t in str(row.get("tags", "")).split(',') if t.strip()] if isinstance(row.get("tags"), str) else [],
            }

            new_entry = PasswordEntryCreate(**entry_data)

            now = datetime.now(timezone.utc).isoformat()
            entry_id = str(uuid.uuid4())
            doc = {
                "id":                 entry_id,
                "portal_name":        new_entry.portal_name,
                "portal_type":        new_entry.portal_type,
                "url":                new_entry.url,
                "username":           new_entry.username,
                "password_encrypted": _encrypt(new_entry.password_plain or ""),
                "_password_set":      bool(new_entry.password_plain),
                "department":         new_entry.department,
                "client_name":        new_entry.client_name,
                "client_id":          new_entry.client_id,
                "notes":              new_entry.notes,
                "tags":               new_entry.tags,
                "created_by":         current_user.id,
                "created_at":         now,
                "updated_at":         now,
                "last_accessed_at":   now,
            }
            await db.passwords.insert_one(doc)

            await db.password_access_logs.insert_one({
                "id":          str(uuid.uuid4()),
                "action":      "BULK_CREATE",
                "entry_id":    entry_id,
                "portal_name": new_entry.portal_name,
                "user_id":     current_user.id,
                "user_name":   current_user.full_name,
                "timestamp":   now,
            })
            successful_imports += 1
        except ValidationError as e:
            failed_imports += 1
            errors.append({"row": index + 2, "error": e.errors(), "data": row.to_dict()})
        except Exception as e:
            failed_imports += 1
            errors.append({"row": index + 2, "error": str(e), "data": row.to_dict()})

    return {
        "total_processed": total_processed,
        "successful_imports": successful_imports,
        "failed_imports": failed_imports,
        "errors": errors
    }


# ── ADMIN ROUTES (also before /{entry_id}) ────────────────────────────────────

@router.get("/admin/access-logs")
async def get_access_logs(
    entry_id: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    current_user: User = Depends(require_admin),
):
    query: dict = {}
    if entry_id:
        query["entry_id"] = entry_id
    logs = (
        await db.password_access_logs.find(query, {"_id": 0})
        .sort("timestamp", -1)
        .to_list(limit)
    )
    return logs


@router.get("/admin/stats")
async def get_password_stats(current_user: User = Depends(require_admin)):
    total = await db.passwords.count_documents({})
    by_dept = {}
    by_type = {}
    docs = await db.passwords.find({}, {"_id": 0, "department": 1, "portal_type": 1}).to_list(5000)
    for d in docs:
        dept = d.get("department", "OTHER")
        ptype = d.get("portal_type", "OTHER")
        by_dept[dept] = by_dept.get(dept, 0) + 1
        by_type[ptype] = by_type.get(ptype, 0) + 1
    return {"total": total, "by_department": by_dept, "by_portal_type": by_type}


# ── LIST + CREATE ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[PasswordEntry])
async def list_passwords(
    department: Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    query: dict = {}
    if department:
        query["department"] = department
    if portal_type:
        query["portal_type"] = portal_type
    if client_id:
        query["client_id"] = client_id
    if search:
        safe = search.replace("\\", "\\\\")
        query["$or"] = [
            {"portal_name":  {"$regex": safe, "$options": "i"}},
            {"client_name":  {"$regex": safe, "$options": "i"}},
            {"username":     {"$regex": safe, "$options": "i"}},
            {"url":          {"$regex": safe, "$options": "i"}},
        ]

    raw = await db.passwords.find(query, {"_id": 0}).sort("portal_name", 1).to_list(2000)

    result = []
    for doc in raw:
        if not _can_view(current_user, doc):
            continue
        doc = await _enrich_entry(doc)
        doc = _strip_sensitive(doc)
        result.append(doc)
    return result


@router.post("", response_model=PasswordEntry, status_code=201)
async def create_password(
    data: PasswordEntryCreate,
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to create passwords")

    client_name = data.client_name
    if data.client_id and not client_name:
        client_doc = await db.clients.find_one({"id": data.client_id}, {"_id": 0, "company_name": 1})
        if client_doc:
            client_name = client_doc.get("company_name")

    now = datetime.now(timezone.utc).isoformat()
    entry_id = str(uuid.uuid4())
    doc = {
        "id":                 entry_id,
        "portal_name":        data.portal_name.strip(),
        "portal_type":        (data.portal_type or "OTHER").upper(),
        "url":                (data.url or "").strip() or None,
        "username":           (data.username or "").strip() or None,
        "password_encrypted": _encrypt(data.password_plain or ""),
        "_password_set":      bool(data.password_plain),
        "department":         (data.department or "OTHER").upper(),
        "client_name":        client_name or None,
        "client_id":          data.client_id or None,
        "notes":              data.notes or None,
        "tags":               data.tags or [],
        "created_by":         current_user.id,
        "created_at":         now,
        "updated_at":         now,
        "last_accessed_at":   now,
    }
    await db.passwords.insert_one(doc)
    doc.pop("_id", None)

    await db.password_access_logs.insert_one({
        "id":          str(uuid.uuid4()),
        "action":      "CREATE",
        "entry_id":    entry_id,
        "portal_name": data.portal_name,
        "user_id":     current_user.id,
        "user_name":   current_user.full_name,
        "timestamp":   now,
    })

    doc = await _enrich_entry(dict(doc))
    return _strip_sensitive(doc)


# ── PARAMETERIZED ROUTES (/{entry_id} — must come LAST) ──────────────────────

@router.get("/{entry_id}", response_model=PasswordEntry)
async def get_password_entry(
    entry_id: str,
    current_user: User = Depends(get_current_user),
):
    doc = await db.passwords.find_one({"id": entry_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Entry not found")
    if not _can_view(current_user, doc):
        raise HTTPException(403, "Access denied")
    doc = await _enrich_entry(doc)
    return _strip_sensitive(doc)


@router.get("/{entry_id}/reveal", response_model=PasswordRevealResponse)
async def reveal_password(
    entry_id: str,
    current_user: User = Depends(get_current_user),
):
    doc = await db.passwords.find_one({"id": entry_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Entry not found")
    if not _can_reveal(current_user, doc):
        raise HTTPException(403, "You are not authorised to reveal this password")

    plain = _decrypt(doc.get("password_encrypted", ""))

    now = datetime.now(timezone.utc).isoformat()
    await db.passwords.update_one(
        {"id": entry_id},
        {"$set": {"last_accessed_at": now}}
    )

    await db.password_access_logs.insert_one({
        "id":          str(uuid.uuid4()),
        "action":      "REVEAL",
        "entry_id":    entry_id,
        "portal_name": doc.get("portal_name", ""),
        "user_id":     current_user.id,
        "user_name":   current_user.full_name,
        "timestamp":   now,
        "ip":          None,
    })

    return {
        "id":          entry_id,
        "username":    doc.get("username"),
        "password":    plain,
        "portal_name": doc.get("portal_name", ""),
    }


@router.put("/{entry_id}", response_model=PasswordEntry)
async def update_password_entry(
    entry_id: str,
    data: PasswordEntryUpdate,
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to edit passwords")

    existing = await db.passwords.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Entry not found")

    now = datetime.now(timezone.utc).isoformat()
    updates: dict = {"updated_at": now}

    if data.portal_name is not None:
        updates["portal_name"] = data.portal_name.strip()
    if data.portal_type is not None:
        updates["portal_type"] = data.portal_type.upper()
    if data.url is not None:
        updates["url"] = data.url.strip() or None
    if data.username is not None:
        updates["username"] = data.username.strip() or None
    if data.password_plain is not None:
        updates["password_encrypted"] = _encrypt(data.password_plain)
        updates["_password_set"] = bool(data.password_plain)
    if data.department is not None:
        updates["department"] = data.department.upper()
    if data.client_id is not None:
        updates["client_id"] = data.client_id or None
        if data.client_id and not data.client_name:
            client_doc = await db.clients.find_one({"id": data.client_id}, {"_id": 0, "company_name": 1})
            if client_doc:
                updates["client_name"] = client_doc.get("company_name")
    if data.client_name is not None:
        updates["client_name"] = data.client_name or None
    if data.notes is not None:
        updates["notes"] = data.notes or None
    if data.tags is not None:
        updates["tags"] = data.tags

    await db.passwords.update_one({"id": entry_id}, {"$set": updates})

    await db.password_access_logs.insert_one({
        "id":          str(uuid.uuid4()),
        "action":      "UPDATE",
        "entry_id":    entry_id,
        "portal_name": existing.get("portal_name", ""),
        "user_id":     current_user.id,
        "user_name":   current_user.full_name,
        "timestamp":   now,
    })

    updated = await db.passwords.find_one({"id": entry_id}, {"_id": 0})
    updated = await _enrich_entry(updated)
    return _strip_sensitive(updated)


@router.delete("/{entry_id}")
async def delete_password_entry(
    entry_id: str,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Only administrators can delete password entries")

    existing = await db.passwords.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Entry not found")

    await db.passwords.delete_one({"id": entry_id})

    now = datetime.now(timezone.utc).isoformat()
    await db.password_access_logs.insert_one({
        "id":          str(uuid.uuid4()),
        "action":      "DELETE",
        "entry_id":    entry_id,
        "portal_name": existing.get("portal_name", ""),
        "user_id":     current_user.id,
        "user_name":   current_user.full_name,
        "timestamp":   now,
    })
    return {"message": f"Entry '{existing.get('portal_name')}' deleted successfully"}
