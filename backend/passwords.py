"""
Password Repository Router for Taskosphere
MongoDB / Motor async — matches the actual project stack.

Key fixes vs the previous SQLAlchemy version:
  1. Uses Motor async (db from backend.auth) — no SQLAlchemy Session at all.
  2. Entry IDs are UUID strings, not integers — no int-cast crash on static paths.
  3. Static routes (/admin/stats, /portal-types, /clients-list, /download-template,
     /parse-preview, /bulk-import, /bulk-delete) are registered BEFORE /{entry_id}.
  4. get_current_user always raises 401 itself (via HTTPBearer) — no None checks needed.
  5. FileResponse replaced with StreamingResponse for in-memory BytesIO.
"""

import io
import base64
import logging
import enum
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator
from cryptography.fernet import Fernet
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

# ── Project imports (Motor db instance lives in backend.auth) ─────────────────
from backend.auth import get_current_user, db
from backend.models import User

logger = logging.getLogger(__name__)

# ── Enums ─────────────────────────────────────────────────────────────────────
class PortalTypeEnum(str, enum.Enum):
    MCA = "MCA"; ROC = "ROC"; DGFT = "DGFT"; TRADEMARK = "TRADEMARK"
    GST = "GST"; INCOME_TAX = "INCOME_TAX"; TDS = "TDS"; TRACES = "TRACES"
    EPFO = "EPFO"; ESIC = "ESIC"; MSME = "MSME"; RERA = "RERA"; OTHER = "OTHER"

class DepartmentEnum(str, enum.Enum):
    GST = "GST"; IT = "IT"; ACC = "ACC"; TDS = "TDS"; ROC = "ROC"
    TM = "TM"; MSME = "MSME"; FEMA = "FEMA"; DSC = "DSC"; OTHER = "OTHER"

class HolderTypeEnum(str, enum.Enum):
    COMPANY = "COMPANY"; DIRECTOR = "DIRECTOR"; INDIVIDUAL = "INDIVIDUAL"
    PARTNER = "PARTNER"; TRUSTEE = "TRUSTEE"; OTHER = "OTHER"

_DEPT_MAP = {
    "MCA": "ROC", "ROC": "ROC", "DGFT": "OTHER", "TRADEMARK": "TM",
    "GST": "GST", "INCOME_TAX": "IT", "TDS": "TDS", "EPFO": "ACC",
    "ESIC": "ACC", "TRACES": "TDS", "MSME": "MSME", "RERA": "OTHER", "OTHER": "OTHER",
}
_VALID_PORTAL  = {e.value for e in PortalTypeEnum}
_VALID_DEPT    = {e.value for e in DepartmentEnum}
_VALID_HOLDER  = {e.value for e in HolderTypeEnum}

# ── Pydantic schemas ──────────────────────────────────────────────────────────
class PasswordEntryCreate(BaseModel):
    portal_name:    str            = Field(..., min_length=1, max_length=255)
    portal_type:    Optional[str]  = "OTHER"
    url:            Optional[str]  = None
    username:       str            = Field(..., min_length=1, max_length=255)
    password_plain: Optional[str]  = None
    department:     Optional[str]  = None
    holder_type:    Optional[str]  = "COMPANY"
    holder_name:    Optional[str]  = None
    holder_pan:     Optional[str]  = None
    holder_din:     Optional[str]  = None
    mobile:         Optional[str]  = None
    trade_name:     Optional[str]  = None
    client_name:    Optional[str]  = None
    client_id:      Optional[str]  = None
    notes:          Optional[str]  = None
    tags:           Optional[List[str]] = None

    @validator("portal_type", pre=True, always=True)
    def val_portal(cls, v):
        return v if v in _VALID_PORTAL else "OTHER"

    @validator("department", pre=True, always=True)
    def val_dept(cls, v, values):
        if v in _VALID_DEPT:
            return v
        return _DEPT_MAP.get(values.get("portal_type", "OTHER"), "OTHER")

    @validator("holder_type", pre=True, always=True)
    def val_holder(cls, v):
        return v if v in _VALID_HOLDER else "COMPANY"


class PasswordEntryUpdate(BaseModel):
    portal_name:    Optional[str]       = None
    portal_type:    Optional[str]       = None
    url:            Optional[str]       = None
    username:       Optional[str]       = None
    password_plain: Optional[str]       = None
    department:     Optional[str]       = None
    holder_type:    Optional[str]       = None
    holder_name:    Optional[str]       = None
    holder_pan:     Optional[str]       = None
    holder_din:     Optional[str]       = None
    mobile:         Optional[str]       = None
    trade_name:     Optional[str]       = None
    client_name:    Optional[str]       = None
    client_id:      Optional[str]       = None
    notes:          Optional[str]       = None
    tags:           Optional[List[str]] = None


class BulkDeleteRequest(BaseModel):
    entry_ids: List[str]


class BulkImportResponse(BaseModel):
    imported:      int
    skipped:       int
    errors:        int
    error_details: Optional[List[str]] = None


class StatsResponse(BaseModel):
    total:            int
    by_portal_type:   Dict[str, int]
    by_department:    Dict[str, int]
    by_holder_type:   Dict[str, int]
    total_access_logs: int
    last_updated:     datetime


# ── Encryption ────────────────────────────────────────────────────────────────
class PasswordEncryption:
    @staticmethod
    def _cipher() -> Fernet:
        import os
        raw = os.getenv("PASSWORD_ENCRYPTION_KEY", "taskosphere-secret-key-32chars!!")
        key = raw.encode()[:32].ljust(32, b"0")
        return Fernet(base64.urlsafe_b64encode(key))

    @staticmethod
    def encrypt(password: str) -> str:
        if not password:
            return ""
        try:
            return PasswordEncryption._cipher().encrypt(password.encode()).decode()
        except Exception as e:
            logger.error(f"Encrypt error: {e}")
            return base64.b64encode(password.encode()).decode()

    @staticmethod
    def decrypt(enc: str) -> str:
        if not enc:
            return ""
        try:
            return PasswordEncryption._cipher().decrypt(enc.encode()).decode()
        except Exception:
            try:
                return base64.b64decode(enc).decode()
            except Exception:
                return ""


# ── Internal helpers ──────────────────────────────────────────────────────────
def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _build_entry(payload: PasswordEntryCreate, user_id: str) -> dict:
    now = datetime.utcnow()
    return {
        "id":                 str(uuid4()),
        "user_id":            user_id,
        "portal_name":        payload.portal_name,
        "portal_type":        payload.portal_type  or "OTHER",
        "url":                payload.url,
        "username":           payload.username,
        "password_encrypted": PasswordEncryption.encrypt(payload.password_plain or ""),
        "has_password":       bool(payload.password_plain),
        "department":         payload.department   or "OTHER",
        "holder_type":        payload.holder_type  or "COMPANY",
        "holder_name":        payload.holder_name,
        "holder_pan":         payload.holder_pan,
        "holder_din":         payload.holder_din,
        "mobile":             payload.mobile,
        "trade_name":         payload.trade_name,
        "client_name":        payload.client_name,
        "client_id":          payload.client_id,
        "notes":              payload.notes,
        "tags":               payload.tags or [],
        "is_archived":        False,
        "created_at":         now,
        "updated_at":         now,
        "last_accessed_at":   None,
    }


def _require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


async def _log(user_id: str, entry_id: str, action: str):
    try:
        await db.password_access_logs.insert_one({
            "user_id":   user_id,
            "entry_id":  entry_id,
            "action":    action,
            "timestamp": datetime.utcnow(),
        })
    except Exception as e:
        logger.warning(f"Access log write failed: {e}")


# ── Router — static paths MUST come before /{entry_id} ───────────────────────
router = APIRouter(prefix="/passwords", tags=["passwords"])


# ────────────────────────────────────────────────────────────────────────────
# STATIC ROUTES (no path parameters)
# ────────────────────────────────────────────────────────────────────────────

@router.get("/portal-types")
async def get_portal_types():
    return {
        "types":        [e.value for e in PortalTypeEnum],
        "departments":  [e.value for e in DepartmentEnum],
        "holder_types": [e.value for e in HolderTypeEnum],
    }


@router.get("/clients-list")
async def get_clients_list(current_user: User = Depends(get_current_user)):
    seen: Dict[str, str] = {}
    cursor = db.password_entries.find(
        {"user_id": current_user.id, "is_archived": False, "client_id": {"$ne": None}},
        {"client_id": 1, "client_name": 1, "_id": 0},
    )
    async for doc in cursor:
        cid = doc.get("client_id")
        if cid and cid not in seen:
            seen[cid] = doc.get("client_name") or ""
    return [{"id": k, "name": v} for k, v in seen.items()]


@router.get("/download-template")
async def download_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "Passwords"
    headers = [
        "Portal Name", "Portal Type", "URL", "Username", "Password",
        "Department", "Holder Type", "Holder Name", "Holder PAN",
        "Holder DIN", "Mobile", "Trade Name", "Client Name", "Client ID", "Notes",
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1F6FB2", end_color="1F6FB2", fill_type="solid")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=password-template.xlsx"},
    )


@router.post("/parse-preview")
async def parse_preview(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        content = await file.read()
        fname = (file.filename or "").lower()
        df = (
            pd.read_csv(io.BytesIO(content))
            if fname.endswith(".csv")
            else pd.read_excel(io.BytesIO(content))
        )
        hints = {
            "portal_name":    ["Portal Name", "Portal"],
            "username":       ["Username", "Email"],
            "password_plain": ["Password"],
        }
        detected = {
            k: next((c for c in df.columns if c.lower() in [a.lower() for a in v]), None)
            for k, v in hints.items()
        }
        return {
            "rows_count":     len(df),
            "columns_count":  len(df.columns),
            "sample_rows":    df.head(3).fillna("").to_dict("records"),
            "column_mapping": {k: v for k, v in detected.items() if v},
        }
    except Exception as e:
        logger.error(f"Parse error: {e}")
        raise HTTPException(status_code=400, detail="Failed to parse file")


@router.post("/bulk-import", response_model=BulkImportResponse)
async def bulk_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        content = await file.read()
        fname = (file.filename or "").lower()
        df = (
            pd.read_csv(io.BytesIO(content))
            if fname.endswith(".csv")
            else pd.read_excel(io.BytesIO(content))
        )
        imported = skipped = errors = 0
        error_details: List[str] = []

        for idx, row in df.iterrows():
            try:
                portal_name = str(row.get("Portal Name") or row.get("Portal") or "").strip()
                username    = str(row.get("Username")    or row.get("Email")   or "").strip()
                if not portal_name or not username:
                    skipped += 1
                    continue

                existing = await db.password_entries.find_one({
                    "user_id":     current_user.id,
                    "portal_name": portal_name,
                    "username":    username,
                    "is_archived": False,
                })
                if existing:
                    skipped += 1
                    continue

                pw  = str(row.get("Password") or "").strip()
                now = datetime.utcnow()
                await db.password_entries.insert_one({
                    "id":                 str(uuid4()),
                    "user_id":            current_user.id,
                    "portal_name":        portal_name,
                    "portal_type":        str(row.get("Portal Type")  or "OTHER").strip(),
                    "url":                str(row.get("URL")           or "").strip() or None,
                    "username":           username,
                    "password_encrypted": PasswordEncryption.encrypt(pw),
                    "has_password":       bool(pw),
                    "department":         str(row.get("Department")   or "OTHER").strip(),
                    "holder_type":        str(row.get("Holder Type")  or "COMPANY").strip(),
                    "holder_name":        str(row.get("Holder Name")  or "").strip() or None,
                    "holder_pan":         str(row.get("Holder PAN")   or "").strip() or None,
                    "holder_din":         str(row.get("Holder DIN")   or "").strip() or None,
                    "mobile":             str(row.get("Mobile")       or "").strip() or None,
                    "trade_name":         str(row.get("Trade Name")   or "").strip() or None,
                    "client_name":        str(row.get("Client Name")  or "").strip() or None,
                    "client_id":          str(row.get("Client ID")    or "").strip() or None,
                    "notes":              str(row.get("Notes")        or "").strip() or None,
                    "tags":               [],
                    "is_archived":        False,
                    "created_at":         now,
                    "updated_at":         now,
                    "last_accessed_at":   None,
                })
                imported += 1
            except Exception as row_err:
                errors += 1
                error_details.append(f"Row {idx + 2}: {row_err}")

        return BulkImportResponse(
            imported=imported, skipped=skipped,
            errors=errors, error_details=error_details or None,
        )
    except Exception as e:
        logger.error(f"Bulk import error: {e}")
        raise HTTPException(status_code=400, detail="Import failed")


@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete(
    payload: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    await db.password_entries.update_many(
        {"id": {"$in": payload.entry_ids}, "user_id": current_user.id},
        {"$set": {"is_archived": True}},
    )
    now = datetime.utcnow()
    if payload.entry_ids:
        await db.password_access_logs.insert_many([
            {"user_id": current_user.id, "entry_id": eid, "action": "delete", "timestamp": now}
            for eid in payload.entry_ids
        ])


@router.get("/admin/stats", response_model=StatsResponse)
async def admin_stats(current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    try:
        base = {"is_archived": False}
        total = await db.password_entries.count_documents(base)

        async def _agg(field: str) -> Dict[str, int]:
            result: Dict[str, int] = {}
            async for doc in db.password_entries.aggregate([
                {"$match": base},
                {"$group": {"_id": f"${field}", "n": {"$sum": 1}}},
            ]):
                if doc["_id"]:
                    result[doc["_id"]] = doc["n"]
            return result

        return StatsResponse(
            total=total,
            by_portal_type=await _agg("portal_type"),
            by_department=await _agg("department"),
            by_holder_type=await _agg("holder_type"),
            total_access_logs=await db.password_access_logs.count_documents({}),
            last_updated=datetime.utcnow(),
        )
    except Exception as e:
        logger.error(f"Stats error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


# ── Collection-level CRUD ─────────────────────────────────────────────────────

@router.get("")
async def list_passwords(
    search:      Optional[str] = Query(None),
    department:  Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    client_id:   Optional[str] = Query(None),
    holder_type: Optional[str] = Query(None),
    sort_by:     Optional[str] = Query("created_at"),
    sort_order:  Optional[str] = Query("desc"),
    skip:        int           = Query(0,   ge=0),
    limit:       int           = Query(500, ge=1, le=1000),
    current_user: User         = Depends(get_current_user),
):
    try:
        query: Dict[str, Any] = {"user_id": current_user.id, "is_archived": False}

        if search:
            term = {"$regex": search, "$options": "i"}
            query["$or"] = [
                {"portal_name": term}, {"username": term},
                {"client_name": term}, {"holder_name": term}, {"trade_name": term},
            ]

        # Only apply filter when it's a real value (not "ALL" or empty)
        if department  and department  not in ("ALL", ""):
            query["department"]  = department
        if portal_type and portal_type not in ("ALL", ""):
            query["portal_type"] = portal_type
        if client_id   and client_id   not in ("ALL", ""):
            query["client_id"]   = client_id
        if holder_type and holder_type not in ("ALL", ""):
            query["holder_type"] = holder_type

        sort_col = sort_by if sort_by in ("portal_name", "created_at", "updated_at") else "created_at"
        sort_dir = 1 if sort_order == "asc" else -1

        entries: List[dict] = []
        async for doc in db.password_entries.find(query).sort(sort_col, sort_dir).skip(skip).limit(limit):
            doc.pop("_id", None)
            entries.append(doc)
        return entries

    except Exception as e:
        logger.error(f"List error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load password vault")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_password(
    payload: PasswordEntryCreate,
    current_user: User = Depends(get_current_user),
):
    try:
        existing = await db.password_entries.find_one({
            "user_id":     current_user.id,
            "portal_name": payload.portal_name,
            "username":    payload.username,
            "is_archived": False,
        })
        if existing:
            raise HTTPException(status_code=409, detail="Duplicate: portal + username already exists")

        entry = _build_entry(payload, current_user.id)
        await db.password_entries.insert_one(entry)
        await _log(current_user.id, entry["id"], "create")
        entry.pop("_id", None)
        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create entry")


# ── Item-level routes — MUST stay at the bottom ───────────────────────────────

@router.get("/{entry_id}")
async def get_password(entry_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.password_entries.find_one(
        {"id": entry_id, "user_id": current_user.id, "is_archived": False}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _clean(doc)


@router.get("/{entry_id}/reveal")
async def reveal_password(entry_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.password_entries.find_one(
        {"id": entry_id, "user_id": current_user.id, "is_archived": False}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")

    password = (
        PasswordEncryption.decrypt(doc.get("password_encrypted", ""))
        if doc.get("has_password") else ""
    )
    now = datetime.utcnow()
    await db.password_entries.update_one({"id": entry_id}, {"$set": {"last_accessed_at": now}})
    await _log(current_user.id, entry_id, "reveal")
    return {
        "id":           doc["id"],
        "portal_name":  doc["portal_name"],
        "username":     doc["username"],
        "password":     password,
        "revealed_at":  now,
    }


@router.put("/{entry_id}")
async def update_password(
    entry_id: str,
    payload: PasswordEntryUpdate,
    current_user: User = Depends(get_current_user),
):
    doc = await db.password_entries.find_one(
        {"id": entry_id, "user_id": current_user.id, "is_archived": False}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")

    data = payload.dict(exclude_unset=True)
    updates: Dict[str, Any] = {"updated_at": datetime.utcnow()}

    if "password_plain" in data:
        pw = data.pop("password_plain")
        if pw:
            updates["password_encrypted"] = PasswordEncryption.encrypt(pw)
            updates["has_password"]        = True

    updates.update(data)
    await db.password_entries.update_one({"id": entry_id}, {"$set": updates})
    await _log(current_user.id, entry_id, "edit")

    updated = await db.password_entries.find_one({"id": entry_id})
    return _clean(updated)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_password(entry_id: str, current_user: User = Depends(get_current_user)):
    doc = await db.password_entries.find_one(
        {"id": entry_id, "user_id": current_user.id, "is_archived": False}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.password_entries.update_one({"id": entry_id}, {"$set": {"is_archived": True}})
    await _log(current_user.id, entry_id, "delete")
