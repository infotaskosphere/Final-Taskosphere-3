from __future__ import annotations

import os
import uuid
import base64
import hashlib
import logging
import re
import json
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict

import httpx
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
            Fernet(_fernet_key)  # validate
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


# ── Constants ─────────────────────────────────────────────────────────────────

PORTAL_TYPES = [
    "MCA", "DGFT", "TRADEMARK", "GST", "INCOME_TAX", "TDS",
    "EPFO", "ESIC", "TRACES", "MSME", "RERA", "ROC", "OTHER",
]

MCA_ROC_GROUP = {"MCA", "ROC"}

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

HOLDER_TYPES = ["COMPANY", "DIRECTOR", "INDIVIDUAL", "PARTNER", "TRUSTEE", "OTHER"]

DEPARTMENTS = ["GST", "IT", "ACC", "TDS", "ROC", "TM", "MSME", "FEMA", "DSC", "OTHER"]

COLUMN_ALIASES = {
    "portal_name": "portal_name", "portal": "portal_name", "portal name": "portal_name",
    "name": "portal_name", "site": "portal_name", "website": "portal_name",
    "account": "portal_name", "account name": "portal_name", "service": "portal_name",
    "application": "portal_name", "app": "portal_name", "system": "portal_name",
    "platform": "portal_name",

    "portal_type": "portal_type", "portal type": "portal_type", "type": "portal_type",
    "category": "portal_type", "portal category": "portal_type",
    "govt portal": "portal_type", "government portal": "portal_type",

    "url": "url", "link": "url", "website url": "url", "portal url": "url",
    "web address": "url", "address": "url", "login url": "url", "login link": "url",
    "web url": "url", "site url": "url", "webpage": "url",

    "username": "username", "user name": "username", "user": "username",
    "login": "username", "login id": "username", "email": "username",
    "email id": "username", "email address": "username", "user id": "username",
    "userid": "username", "id": "username", "login email": "username",
    "user email": "username", "login name": "username", "account email": "username",
    "registered email": "username", "gstin": "username", "gst number": "username",
    "pan number login": "username",

    "password_plain": "password_plain", "password": "password_plain",
    "pass": "password_plain", "passwd": "password_plain", "pwd": "password_plain",
    "secret": "password_plain", "passphrase": "password_plain",
    "login password": "password_plain", "portal password": "password_plain",
    "current password": "password_plain", "new password": "password_plain",

    "mobile": "mobile", "mobile no": "mobile", "mobile number": "mobile",
    "phone": "mobile", "phone no": "mobile", "phone number": "mobile",
    "contact": "mobile", "contact no": "mobile", "contact number": "mobile",
    "registered mobile": "mobile", "otp mobile": "mobile", "whatsapp": "mobile",

    "trade name": "trade_name", "tradename": "trade_name", "trade": "trade_name",
    "business name": "trade_name", "brand name": "trade_name", "dba": "trade_name",

    "department": "department", "dept": "department",
    "division": "department", "section": "department",

    "holder_type": "holder_type", "holder type": "holder_type",
    "credential holder": "holder_type", "login type": "holder_type",
    "account type": "holder_type", "registered as": "holder_type",

    "holder_name": "holder_name", "holder name": "holder_name", "holder": "holder_name",
    "director name": "holder_name", "individual name": "holder_name",
    "person name": "holder_name", "person": "holder_name", "full name": "holder_name",
    "director": "holder_name", "authorized person": "holder_name",
    "authorised person": "holder_name", "proprietor": "holder_name",
    "owner": "holder_name", "signatory": "holder_name",
    "authorised signatory": "holder_name", "authorized signatory": "holder_name",
    "first name": "holder_name", "name of director": "holder_name",

    "holder_pan": "holder_pan", "holder pan": "holder_pan", "pan": "holder_pan",
    "pan no": "holder_pan", "pan number": "holder_pan", "pan no.": "holder_pan",
    "permanent account number": "holder_pan", "director pan": "holder_pan",
    "individual pan": "holder_pan", "taxpayer pan": "holder_pan",

    "holder_din": "holder_din", "holder din": "holder_din", "din": "holder_din",
    "din no": "holder_din", "din number": "holder_din", "din no.": "holder_din",
    "director identification number": "holder_din", "director din": "holder_din",

    "client_name": "client_name", "client name": "client_name", "client": "client_name",
    "company": "client_name", "company name": "client_name", "firm": "client_name",
    "firm name": "client_name", "organization": "client_name",
    "organisation": "client_name", "entity": "client_name",
    "entity name": "client_name", "business": "client_name",
    "registered name": "client_name", "legal name": "client_name",

    "client_id": "client_id", "client id": "client_id", "client code": "client_id",
    "company id": "client_id", "company code": "client_id",
    "customer id": "client_id", "customer code": "client_id",

    "notes": "notes", "note": "notes", "remarks": "notes", "comments": "notes",
    "description": "notes", "info": "notes", "additional info": "notes",
    "other info": "notes", "misc": "notes", "miscellaneous": "notes",
    "details": "notes",

    "tags": "tags", "tag": "tags", "labels": "tags", "label": "tags",
    "keywords": "tags", "category tags": "tags",
}

SHEET_TYPES = ["GST", "ROC", "MCA", "OTHER"]


def _normalize_column_name(col: str) -> str:
    return str(col).strip().lower().replace("_", " ").replace("-", " ")


def _map_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, dict, list]:
    mapping_used = {}
    unmapped_cols = []
    rename_map = {}
    col_seen_canonical: dict = {}

    for col in df.columns:
        normalized = _normalize_column_name(col)
        canonical = COLUMN_ALIASES.get(normalized)
        if canonical:
            if canonical not in col_seen_canonical:
                rename_map[col] = canonical
                mapping_used[col] = canonical
                col_seen_canonical[canonical] = col
            else:
                unmapped_cols.append(col)
        else:
            unmapped_cols.append(col)

    df_mapped = df.rename(columns=rename_map)

    seen: set = set()
    dedup_cols = []
    for col in df_mapped.columns:
        if col not in seen:
            seen.add(col)
            dedup_cols.append(col)
    df_mapped = df_mapped[dedup_cols]

    return df_mapped, mapping_used, unmapped_cols


def _clean_val(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() in ("nan", "none", "null", "n/a", "na", ""):
        return None
    return s


def _derive_department(portal_type: str) -> str:
    return DEPARTMENT_MAP.get(portal_type.upper(), "OTHER")


def _normalize_portal_type(raw: str) -> str:
    pt = raw.strip().upper()
    if pt in PORTAL_TYPES:
        return pt
    fuzzy = {
        "INCOME TAX": "INCOME_TAX", "INCOMETAX": "INCOME_TAX", "IT": "INCOME_TAX",
        "PF": "EPFO", "EPF": "EPFO", "ESI": "ESIC", "TM": "TRADEMARK",
        "IP": "TRADEMARK", "FEMA": "DGFT", "EXPORT": "DGFT", "IMPORT": "DGFT",
    }
    return fuzzy.get(pt, "OTHER")


def _make_dedup_key(portal_name: str, username: Optional[str], client_id: Optional[str]) -> str:
    parts = [
        (portal_name or "").strip().lower(),
        (username or "").strip().lower(),
        (client_id or "").strip().lower(),
    ]
    return "||".join(parts)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PasswordEntryCreate(BaseModel):
    portal_name: str
    portal_type: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None
    department: Optional[str] = None
    holder_type: Optional[str] = None
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)


class PasswordEntryUpdate(BaseModel):
    portal_name: Optional[str] = None
    portal_type: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None
    department: Optional[str] = None
    holder_type: Optional[str] = None
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)


class PasswordEntry(BaseModel):
    id: str
    portal_name: str
    portal_type: str
    url: Optional[str] = None
    username: Optional[str] = None
    has_password: bool = False
    department: str
    holder_type: str
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_accessed_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PasswordRevealResponse(BaseModel):
    id: str
    username: Optional[str] = None
    password: str
    portal_name: str

    model_config = ConfigDict(from_attributes=True)


class GoogleSheetLink(BaseModel):
    label: str
    sheet_url: str
    sheet_type: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GoogleSheetLinkUpdate(BaseModel):
    label: Optional[str] = None
    sheet_url: Optional[str] = None
    sheet_type: Optional[str] = None
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BulkDeleteRequest(BaseModel):
    ids: List[str]

    model_config = ConfigDict(from_attributes=True)


class BulkImportResult(BaseModel):
    imported: int
    skipped: int
    errors: int
    message: str

    model_config = ConfigDict(from_attributes=True)


# ── Helper functions ──────────────────────────────────────────────────────────

def _get_user_perms(user: User) -> Dict[str, Any]:
    """Extract user permissions from user object."""
    return {
        "can_view_passwords": user.role == "admin" or getattr(user, "can_view_passwords", False),
        "can_edit_passwords": user.role == "admin" or getattr(user, "can_edit_passwords", False),
        "can_view_all_clients": user.role == "admin",
        "view_password_departments": getattr(user, "departments", []),
    }


def _can_view(user: User, entry: Dict) -> bool:
    """Check if user can view a password entry."""
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    if not perms.get("can_view_passwords"):
        return False
    return True


def _can_edit(user: User) -> bool:
    """Check if user can edit passwords."""
    if user.role == "admin":
        return True
    return getattr(user, "can_edit_passwords", False)


def _can_reveal(user: User, entry: Dict) -> bool:
    """Check if user can reveal a password."""
    if user.role == "admin":
        return True
    return _can_view(user, entry) and getattr(user, "can_reveal_passwords", False)


async def _enrich_entry(entry: Dict) -> Dict:
    """Enrich entry with computed fields."""
    if not entry:
        return entry
    entry["has_password"] = bool(entry.get("password_encrypted"))
    return entry


def _strip_sensitive(entry: Dict) -> Dict:
    """Remove sensitive fields from entry."""
    if not entry:
        return entry
    entry.pop("password_encrypted", None)
    entry.pop("_password_set", None)
    entry.pop("dedup_key", None)
    return entry


def _extract_sheet_id(url: str) -> Optional[str]:
    """Extract Google Sheets ID from URL."""
    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url)
    return match.group(1) if match else None


def _extract_gid(url: str) -> Optional[str]:
    """Extract sheet GID from URL."""
    match = re.search(r'[#&]gid=([0-9]+)', url)
    return match.group(1) if match else None


async def _get_all_sheet_tabs(sheet_id: str) -> List[Dict]:
    """Fetch all sheet tabs from Google Sheets."""
    try:
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=json"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                sheets = data.get("sheets", [])
                return [{"name": s.get("properties", {}).get("title", "Sheet"), "gid": s.get("properties", {}).get("sheetId", 0)} for s in sheets]
    except Exception as e:
        logger.warning(f"Failed to fetch sheet tabs: {e}")
    return []


async def _fetch_sheet_as_csv(sheet_id: str, gid: str) -> Optional[pd.DataFrame]:
    """Fetch sheet data as CSV."""
    try:
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, timeout=30)
            if res.status_code == 200:
                return pd.read_csv(io.StringIO(res.text))
    except Exception as e:
        logger.warning(f"Failed to fetch sheet as CSV: {e}")
    return None


def _suggest_field_mapping(col: str) -> List[str]:
    """Suggest canonical field mappings for a column."""
    col_lower = _normalize_column_name(col)
    suggestions = []
    keyword_map = [
        (["password", "pass", "pwd", "secret"], "password_plain"),
        (["user", "email", "login", "id", "gstin"], "username"),
        (["portal", "site", "platform", "app", "system"], "portal_name"),
        (["url", "link", "web", "http", "address"], "url"),
        (["type", "category"], "portal_type"),
        (["department", "dept", "division"], "department"),
        (["holder", "director", "person", "individual", "proprietor", "owner", "signatory"], "holder_name"),
        (["pan", "permanent account"], "holder_pan"),
        (["din", "director identification"], "holder_din"),
        (["client", "company", "firm", "entity", "organisation", "organization", "legal"], "client_name"),
        (["client id", "client code", "customer id", "customer code"], "client_id"),
        (["mobile", "phone", "contact", "whatsapp", "otp"], "mobile"),
        (["trade", "brand", "dba", "trading"], "trade_name"),
        (["note", "remark", "comment", "info", "detail", "misc"], "notes"),
        (["tag", "label", "keyword"], "tags"),
    ]
    for keywords, canonical in keyword_map:
        for kw in keywords:
            if kw in col_lower:
                if canonical not in suggestions:
                    suggestions.append(canonical)
                break
    return suggestions[:3]


# ── DB index setup ────────────────────────────────────────────────────────────

async def ensure_indexes():
    """Create indexes for fast queries."""
    try:
        await db.passwords.create_index([("department", 1)])
        await db.passwords.create_index([("portal_type", 1)])
        await db.passwords.create_index([("client_id", 1)])
        await db.passwords.create_index([("holder_type", 1)])
        await db.passwords.create_index([("created_at", -1)])
        await db.passwords.create_index([("updated_at", -1)])
        await db.passwords.create_index([("portal_name", 1)])
        await db.passwords.create_index([("dedup_key", 1)])
        await db.passwords.create_index([
            ("portal_name", "text"), ("client_name", "text"),
            ("username", "text"), ("holder_name", "text"),
            ("holder_pan", "text"), ("mobile", "text"), ("trade_name", "text"),
        ])
        logger.info("Password vault indexes ensured.")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


# ── STATIC / UTILITY ROUTES ───────────────────────────────────────────────────

@router.get("/portal-types")
async def get_portal_types(current_user: User = Depends(get_current_user)):
    return {
        "portal_types": PORTAL_TYPES,
        "department_map": DEPARTMENT_MAP,
        "holder_types": HOLDER_TYPES,
        "departments": DEPARTMENTS,
        "sheet_types": SHEET_TYPES,
    }


@router.get("/clients-list")
async def get_clients_for_password(current_user: User = Depends(get_current_user)):
    query: dict = {}
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


@router.get("/download-template")
async def download_template(current_user: User = Depends(get_current_user)):
    """Download Excel template for bulk import."""
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to download template")

    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Passwords"

        headers = [
            "Portal Name", "Portal Type", "URL", "Username", "Password",
            "Department", "Holder Type", "Holder Name", "Holder PAN", "Holder DIN",
            "Mobile", "Trade Name", "Client Name", "Client ID", "Notes", "Tags"
        ]
        ws.append(headers)

        header_fill = PatternFill(start_color="0D3B66", end_color="0D3B66", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF")

        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for col_num, header in enumerate(headers, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_num)].width = 15

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        return Response(
            content=output.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=password-template.xlsx"}
        )
    except Exception as e:
        logger.error(f"Template download error: {e}")
        raise HTTPException(500, f"Failed to generate template: {str(e)}")


@router.post("/parse-preview")
async def parse_preview(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Parse and preview uploaded file."""
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to import")

    try:
        content = await file.read()
        ext = file.filename.split(".")[-1].lower() if file.filename else ""

        if ext in ("xlsx", "xls"):
            df = pd.read_excel(io.BytesIO(content))
        elif ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            raise HTTPException(400, "Unsupported file format. Use Excel or CSV.")

        df_mapped, mapping_used, unmapped_cols = _map_columns(df)

        return {
            "rows_count": len(df),
            "columns_count": len(df.columns),
            "columns": list(df.columns),
            "mapped_columns": mapping_used,
            "unmapped_columns": unmapped_cols,
            "sample_rows": df.head(5).fillna("").to_dict(orient="records"),
        }
    except Exception as e:
        logger.error(f"Parse preview error: {e}")
        raise HTTPException(400, f"Failed to parse file: {str(e)}")


@router.post("/bulk-import", response_model=BulkImportResult)
async def bulk_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Bulk import passwords from file."""
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to import")

    imported = 0
    skipped = 0
    errors = 0

    try:
        content = await file.read()
        ext = file.filename.split(".")[-1].lower() if file.filename else ""

        if ext in ("xlsx", "xls"):
            df = pd.read_excel(io.BytesIO(content))
        elif ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            raise HTTPException(400, "Unsupported file format")

        df_mapped, _, _ = _map_columns(df)

        now = datetime.now(timezone.utc).isoformat()

        for idx, row in df_mapped.iterrows():
            try:
                portal_name = _clean_val(row.get("portal_name"))
                if not portal_name:
                    skipped += 1
                    continue

                username = _clean_val(row.get("username"))
                password_plain = _clean_val(row.get("password_plain"))
                client_id = _clean_val(row.get("client_id"))

                dedup_key = _make_dedup_key(portal_name, username, client_id)
                existing = await db.passwords.find_one({"dedup_key": dedup_key})
                if existing:
                    skipped += 1
                    continue

                portal_type = _normalize_portal_type(_clean_val(row.get("portal_type")) or "OTHER")
                department = _clean_val(row.get("department")) or _derive_department(portal_type)

                entry_id = str(uuid.uuid4())
                doc = {
                    "id": entry_id,
                    "portal_name": portal_name,
                    "portal_type": portal_type,
                    "url": _clean_val(row.get("url")),
                    "username": username,
                    "password_encrypted": _encrypt(password_plain or ""),
                    "_password_set": bool(password_plain),
                    "department": department.upper(),
                    "holder_type": (_clean_val(row.get("holder_type")) or "COMPANY").upper(),
                    "holder_name": _clean_val(row.get("holder_name")),
                    "holder_pan": _clean_val(row.get("holder_pan")),
                    "holder_din": _clean_val(row.get("holder_din")),
                    "mobile": _clean_val(row.get("mobile")),
                    "trade_name": _clean_val(row.get("trade_name")),
                    "client_name": _clean_val(row.get("client_name")),
                    "client_id": client_id,
                    "notes": _clean_val(row.get("notes")),
                    "tags": [t.strip() for t in str(row.get("tags", "")).split(",") if t.strip()],
                    "dedup_key": dedup_key,
                    "created_by": current_user.id,
                    "created_at": now,
                    "updated_at": now,
                    "last_accessed_at": now,
                }
                await db.passwords.insert_one(doc)
                imported += 1
            except Exception as e:
                logger.warning(f"Row {idx} import error: {e}")
                errors += 1

        return {
            "imported": imported,
            "skipped": skipped,
            "errors": errors,
            "message": f"Imported {imported} entries, skipped {skipped}, {errors} errors",
        }
    except Exception as e:
        logger.error(f"Bulk import error: {e}")
        raise HTTPException(400, f"Import failed: {str(e)}")


# ── LIST ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PasswordEntry])
async def list_passwords(
    department: Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    holder_type: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    current_user: User = Depends(get_current_user),
):
    query: dict = {}

    if not (current_user.role == "admin"):
        perms = _get_user_perms(current_user)
        if not perms.get("can_view_passwords", False):
            return []
        allowed_depts = list(set(
            list(current_user.departments or []) +
            list(perms.get("view_password_departments") or [])
        ))
        if allowed_depts:
            if department and department.upper() in allowed_depts:
                query["department"] = department.upper()
            elif department:
                return []
            else:
                query["department"] = {"$in": allowed_depts}
    else:
        if department:
            dept_upper = department.upper()
            if dept_upper in ("MCA", "ROC"):
                query["portal_type"] = {"$in": ["MCA", "ROC"]}
            else:
                query["department"] = dept_upper

    if portal_type:
        pt_upper = portal_type.upper()
        if pt_upper in ("MCA", "ROC"):
            if "portal_type" not in query:
                query["portal_type"] = {"$in": ["MCA", "ROC"]}
        else:
            query["portal_type"] = pt_upper

    if client_id:
        query["client_id"] = client_id
    if holder_type:
        query["holder_type"] = holder_type.upper()

    if search and search.strip():
        safe = search.strip().replace("\\", "\\\\")
        regex = {"$regex": safe, "$options": "i"}
        query["$or"] = [
            {"portal_name": regex},
            {"client_name": regex},
            {"username": regex},
            {"url": regex},
            {"holder_name": regex},
            {"holder_pan": regex},
            {"holder_din": regex},
            {"mobile": regex},
            {"trade_name": regex},
        ]

    sort_field_map = {
        "portal_name": "portal_name",
        "created_at": "created_at",
        "updated_at": "updated_at",
        "name": "portal_name",
    }
    sort_field = sort_field_map.get(sort_by or "created_at", "created_at")
    mongo_sort_dir = 1 if (sort_order or "desc") == "asc" else -1

    raw = await db.passwords.find(
        query, {"_id": 0}
    ).sort(sort_field, mongo_sort_dir).to_list(10000)

    result = []
    for doc in raw:
        if current_user.role != "admin" and not _can_view(current_user, doc):
            continue
        doc = await _enrich_entry(doc)
        result.append(_strip_sensitive(doc))

    return result


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post("", response_model=PasswordEntry, status_code=201)
async def create_password(
    data: PasswordEntryCreate,
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to create passwords")

    dedup_key = _make_dedup_key(data.portal_name, data.username, data.client_id)
    existing_dup = await db.passwords.find_one({"dedup_key": dedup_key}, {"_id": 0, "id": 1})
    if existing_dup:
        raise HTTPException(
            409,
            f"A credential for portal '{data.portal_name}' with the same username and client already exists."
        )

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
        "holder_type":        (data.holder_type or "COMPANY").upper(),
        "holder_name":        (data.holder_name or "").strip() or None,
        "holder_pan":         (data.holder_pan or "").strip().upper() or None,
        "holder_din":         (data.holder_din or "").strip() or None,
        "mobile":             (data.mobile or "").strip() or None,
        "trade_name":         (data.trade_name or "").strip() or None,
        "client_name":        client_name or None,
        "client_id":          data.client_id or None,
        "notes":              data.notes or None,
        "tags":               data.tags or [],
        "dedup_key":          dedup_key,
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


# ── PARAMETERIZED ROUTES ──────────────────────────────────────────────────────

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
    await db.passwords.update_one({"id": entry_id}, {"$set": {"last_accessed_at": now}})
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
    if data.holder_type is not None:
        updates["holder_type"] = data.holder_type.upper()
    if data.holder_name is not None:
        updates["holder_name"] = data.holder_name.strip() or None
    if data.holder_pan is not None:
        updates["holder_pan"] = data.holder_pan.strip().upper() or None
    if data.holder_din is not None:
        updates["holder_din"] = data.holder_din.strip() or None
    if data.mobile is not None:
        updates["mobile"] = data.mobile.strip() or None
    if data.trade_name is not None:
        updates["trade_name"] = data.trade_name.strip() or None
    if data.client_id is not None:
        updates["client_id"] = data.client_id or None
        if data.client_id and not data.client_name:
            client_doc = await db.clients.find_one(
                {"id": data.client_id}, {"_id": 0, "company_name": 1}
            )
            if client_doc:
                updates["client_name"] = client_doc.get("company_name")
    if data.client_name is not None:
        updates["client_name"] = data.client_name or None
    if data.notes is not None:
        updates["notes"] = data.notes or None
    if data.tags is not None:
        updates["tags"] = data.tags

    new_portal = updates.get("portal_name", existing.get("portal_name", ""))
    new_username = updates.get("username", existing.get("username"))
    new_client_id = updates.get("client_id", existing.get("client_id"))
    updates["dedup_key"] = _make_dedup_key(new_portal, new_username, new_client_id)

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


# ── BULK DELETE ───────────────────────────────────────────────────────────────

@router.post("/bulk-delete")
async def bulk_delete_passwords(
    data: BulkDeleteRequest,
    current_user: User = Depends(require_admin),
):
    if not data.ids:
        raise HTTPException(400, "No IDs provided")

    existing = await db.passwords.find({"id": {"$in": data.ids}}, {"_id": 0}).to_list(len(data.ids))
    found_ids = [d["id"] for d in existing]

    result = await db.passwords.delete_many({"id": {"$in": found_ids}})

    now = datetime.now(timezone.utc).isoformat()
    log_docs = [
        {
            "id":          str(uuid.uuid4()),
            "action":      "BULK_DELETE",
            "entry_id":    d["id"],
            "portal_name": d.get("portal_name", ""),
            "user_id":     current_user.id,
            "user_name":   current_user.full_name,
            "timestamp":   now,
        }
        for d in existing
    ]
    if log_docs:
        await db.password_access_logs.insert_many(log_docs)

    return {
        "deleted": result.deleted_count,
        "not_found": len(data.ids) - len(found_ids),
        "message": f"Successfully deleted {result.deleted_count} entries",
    }


# ── ADMIN ROUTES ──────────────────────────────────────────────────────────────

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
    by_dept: dict = {}
    by_type: dict = {}
    by_holder: dict = {}

    pipeline_dept = [{"$group": {"_id": "$department", "count": {"$sum": 1}}}]
    pipeline_type = [{"$group": {"_id": "$portal_type", "count": {"$sum": 1}}}]
    pipeline_holder = [{"$group": {"_id": "$holder_type", "count": {"$sum": 1}}}]

    async for d in db.passwords.aggregate(pipeline_dept):
        by_dept[d["_id"] or "OTHER"] = d["count"]
    async for d in db.passwords.aggregate(pipeline_type):
        by_type[d["_id"] or "OTHER"] = d["count"]
    async for d in db.passwords.aggregate(pipeline_holder):
        by_holder[d["_id"] or "COMPANY"] = d["count"]

    mca_count = by_type.pop("MCA", 0) + by_type.pop("ROC", 0)
    if mca_count:
        by_type["MCA"] = mca_count

    return {
        "total": total,
        "by_department": by_dept,
        "by_portal_type": by_type,
        "by_holder_type": by_holder,
    }
