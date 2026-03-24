"""
backend/passwords.py
────────────────────────────────────────────────────────────────────────────────
Password Repository — Portal Credential Manager
Stores encrypted credentials for MCA, DGFT, Trademark, GST, Income Tax, TDS,
EPFO, ESIC, TRACES, MSME, RERA, and custom portals.

Encryption:  Fernet symmetric (AES-128-CBC) via `cryptography` package.
Key source:  .env  →  PASSWORD_REPO_KEY=<base64url-44-char Fernet key>
             If not set a deterministic key is derived from MONGO_URI so
             passwords survive restarts, but you should set your own key.

Audit trail: Every "reveal" action (GET /{id}/reveal) is logged to db.password_access_logs.

ACCESS RULES
┌────────────┬────────────┬────────────────────────────────────────────────┐
│ Role       │ Condition  │ Access                                         │
├────────────┼────────────┼────────────────────────────────────────────────┤
│ admin      │ always     │ full CRUD + reveal on every entry              │
│ manager    │ department │ view (masked) own dept; reveal if permitted    │
│ staff      │ permission │ view only if can_view_passwords=True           │
│            │ + dept     │ reveal only for departments in                  │
│            │            │ view_password_departments list                 │
└────────────┴────────────┴────────────────────────────────────────────────┘
"""

from __future__ import annotations

import os
import uuid
import base64
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict

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
        # Validate supplied key
        try:
            _fernet_key = _env_key.encode()
            Fernet(_fernet_key)          # will raise if bad format
        except Exception:
            # Key might be a passphrase — derive proper 32-byte key from it
            _fernet_key = base64.urlsafe_b64encode(
                hashlib.sha256(_env_key.encode()).digest()
            )
    else:
        # Derive deterministic key from MONGO_URI so data survives restarts
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
    password_plain: Optional[str] = None   # plain-text, encrypted on write
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
    # password is NEVER returned in list — use /reveal endpoint
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_perms(user: User) -> dict:
    if isinstance(user.permissions, dict):
        return user.permissions
    if user.permissions:
        return user.permissions.model_dump()
    return {}


def _can_view(user: User, entry: dict) -> bool:
    """Return True if user is allowed to see this entry (masked)."""
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    if not perms.get("can_view_passwords", False):
        return False
    # Manager: own departments
    if user.role == "manager":
        return entry.get("department") in (user.departments or [])
    # Staff: department must be in their view list OR own department
    allowed_depts = perms.get("view_password_departments", [])
    return (
        entry.get("department") in (user.departments or [])
        or entry.get("department") in (allowed_depts or [])
    )


def _can_reveal(user: User, entry: dict) -> bool:
    """Return True if user is allowed to see the decrypted password."""
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
    """Remove encrypted password field before sending to client."""
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_encrypted", None)
    doc["has_password"] = bool(doc.get("_password_set", False))
    doc.pop("_password_set", None)
    return doc


async def _enrich_entry(doc: dict) -> dict:
    """Add created_by_name."""
    creator_id = doc.get("created_by")
    if creator_id:
        u = await db.users.find_one({"id": creator_id}, {"_id": 0, "full_name": 1})
        if u:
            doc["created_by_name"] = u.get("full_name", "Unknown")
    return doc


# ── CRUD ROUTES ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[PasswordEntry])
async def list_passwords(
    department: Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    List all password entries the current user is authorised to see.
    Passwords are NEVER included in this response — use /reveal.
    """
    # Build mongo query
    query: dict = {}
    if department:
        query["department"] = department
    if portal_type:
        query["portal_type"] = portal_type
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


@router.get("/portal-types")
async def get_portal_types(current_user: User = Depends(get_current_user)):
    return {"portal_types": PORTAL_TYPES, "department_map": DEPARTMENT_MAP}


@router.post("", response_model=PasswordEntry, status_code=201)
async def create_password(
    data: PasswordEntryCreate,
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to add passwords")

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
        "client_name":        data.client_name or None,
        "client_id":          data.client_id or None,
        "notes":              data.notes or None,
        "tags":               data.tags or [],
        "created_by":         current_user.id,
        "created_at":         now,
        "updated_at":         now,
        "last_accessed_at":   None,
    }
    await db.passwords.insert_one(doc)
    doc.pop("_id", None)

    # Audit log
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
    """
    Return the decrypted password for a single entry.
    Access is logged to db.password_access_logs.
    """
    doc = await db.passwords.find_one({"id": entry_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Entry not found")
    if not _can_reveal(current_user, doc):
        raise HTTPException(403, "You are not authorised to reveal this password")

    plain = _decrypt(doc.get("password_encrypted", ""))

    # Update last_accessed_at
    now = datetime.now(timezone.utc).isoformat()
    await db.passwords.update_one(
        {"id": entry_id},
        {"$set": {"last_accessed_at": now}}
    )

    # Audit log
    await db.password_access_logs.insert_one({
        "id":          str(uuid.uuid4()),
        "action":      "REVEAL",
        "entry_id":    entry_id,
        "portal_name": doc.get("portal_name", ""),
        "user_id":     current_user.id,
        "user_name":   current_user.full_name,
        "timestamp":   now,
        "ip":          None,   # could be enriched via Request if needed
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
    if data.client_name is not None:
        updates["client_name"] = data.client_name or None
    if data.client_id is not None:
        updates["client_id"] = data.client_id or None
    if data.notes is not None:
        updates["notes"] = data.notes or None
    if data.tags is not None:
        updates["tags"] = data.tags

    await db.passwords.update_one({"id": entry_id}, {"$set": updates})

    # Audit log
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


# ── ACCESS LOG (admin only) ───────────────────────────────────────────────────

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


# ── STATS (admin only) ────────────────────────────────────────────────────────

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
