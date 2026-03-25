from __future__ import annotations

import os
import uuid
import base64
import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Optional, List, Any

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

# MCA and ROC are the same group — stored as-is but displayed together
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

# ── Extended column alias mapping ─────────────────────────────────────────────
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

    # Deduplicate columns
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
    """Create a normalised key for duplicate detection."""
    parts = [
        (portal_name or "").strip().lower(),
        (username or "").strip().lower(),
        (client_id or "").strip().lower(),
    ]
    return "||".join(parts)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PasswordEntryCreate(BaseModel):
    portal_name: str = Field(..., min_length=1, max_length=120)
    portal_type: str = "OTHER"
    url: Optional[str] = None
    username: Optional[str] = None
    password_plain: Optional[str] = None
    department: str = "OTHER"
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    holder_type: str = "COMPANY"
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
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
    holder_type: Optional[str] = None
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
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
    holder_type: str = "COMPANY"
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
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
    duplicate_skipped: int = 0
    errors: List[dict]
    column_mapping: dict = {}
    unmapped_columns: List[str] = []
    skipped_rows: int = 0


class BulkDeleteRequest(BaseModel):
    ids: List[str] = Field(..., min_length=1)


class ColumnMappingPreview(BaseModel):
    original_columns: List[str]
    mapping: dict
    unmapped_columns: List[str]
    sample_rows: List[dict]
    total_rows: int
    missing_required: List[str]
    suggested_mappings: dict = {}


class GoogleSheetLink(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    sheet_url: str = Field(..., min_length=10)
    sheet_type: str = "OTHER"
    description: Optional[str] = None


class GoogleSheetLinkUpdate(BaseModel):
    label: Optional[str] = None
    sheet_url: Optional[str] = None
    sheet_type: Optional[str] = None
    description: Optional[str] = None


# ── Permission helpers ────────────────────────────────────────────────────────

def _get_user_perms(user: User) -> dict:
    if isinstance(user.permissions, dict):
        return user.permissions
    if user.permissions:
        try:
            return user.permissions.model_dump()
        except Exception:
            return {}
    return {}


def _can_view(user: User, entry: dict) -> bool:
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    if not perms.get("can_view_passwords", False):
        return False
    allowed_depts = list(perms.get("view_password_departments") or [])
    user_depts = list(user.departments or [])
    entry_dept = entry.get("department", "")
    return entry_dept in user_depts or entry_dept in allowed_depts


def _can_reveal(user: User, entry: dict) -> bool:
    return _can_view(user, entry)


def _can_edit(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = _get_user_perms(user)
    return perms.get("can_edit_passwords", False)


def _strip_sensitive(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_encrypted", None)
    doc.pop("dedup_key", None)
    doc["has_password"] = bool(doc.pop("_password_set", False))
    return doc


async def _enrich_entry(doc: dict) -> dict:
    creator_id = doc.get("created_by")
    if creator_id:
        u = await db.users.find_one({"id": creator_id}, {"_id": 0, "full_name": 1})
        if u:
            doc["created_by_name"] = u.get("full_name", "Unknown")
    return doc


def _extract_sheet_id(url: str) -> Optional[str]:
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", url)
    return match.group(1) if match else None


def _extract_gid(url: str) -> Optional[str]:
    match = re.search(r"[#&?]gid=(\d+)", url)
    return match.group(1) if match else None


async def _fetch_sheet_as_csv(sheet_id: str, gid: Optional[str] = None) -> Optional[pd.DataFrame]:
    if gid:
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    else:
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(csv_url, follow_redirects=True)
            resp.raise_for_status()
            df = pd.read_csv(io.StringIO(resp.text))
            return df
    except Exception as e:
        logger.error(f"Failed to fetch sheet {sheet_id} gid={gid}: {e}")
        return None


async def _get_all_sheet_tabs(sheet_id: str) -> List[dict]:
    try:
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, follow_redirects=True)
            html = resp.text
        tabs = []
        matches = re.findall(r'"gid"\s*:\s*"?(\d+)"?\s*,\s*"name"\s*:\s*"([^"]+)"', html)
        if not matches:
            matches = re.findall(r'name="([^"]+)"[^>]*data-sheet-id="(\d+)"', html)
            matches = [(gid, name) for name, gid in matches]
        for gid, name in matches:
            tabs.append({"gid": gid, "name": name})
        return tabs
    except Exception as e:
        logger.error(f"Failed to get sheet tabs for {sheet_id}: {e}")
        return []


def _read_file_to_df(contents: bytes, filename: str) -> pd.DataFrame:
    file_like = io.BytesIO(contents)
    fname = (filename or "").lower()
    if fname.endswith((".xlsx", ".xls")):
        df = pd.read_excel(file_like, engine="openpyxl", dtype=str)
    elif fname.endswith(".csv"):
        df = pd.read_csv(file_like, dtype=str)
    else:
        raise ValueError("Unsupported file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.")
    # Strip whitespace from all string cells
    df = df.map(lambda x: x.strip() if isinstance(x, str) else x)
    return df


def _suggest_canonical_for_unmapped(col: str) -> List[str]:
    col_lower = col.lower().replace("_", " ").replace("-", " ")
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


# ── DB index setup (call once on startup) ─────────────────────────────────────

async def ensure_indexes():
    """Create indexes for fast queries. Call from app startup."""
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


# ── GOOGLE SHEETS LINK ROUTES ─────────────────────────────────────────────────

@router.get("/sheet-links")
async def list_sheet_links(current_user: User = Depends(get_current_user)):
    links = await db.password_sheet_links.find({}, {"_id": 0}).sort("label", 1).to_list(200)
    return links


@router.post("/sheet-links", status_code=201)
async def add_sheet_link(
    data: GoogleSheetLink,
    current_user: User = Depends(require_admin),
):
    sheet_id = _extract_sheet_id(data.sheet_url)
    if not sheet_id:
        raise HTTPException(400, "Invalid Google Sheets URL — could not extract sheet ID")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id":          str(uuid.uuid4()),
        "label":       data.label.strip(),
        "sheet_url":   data.sheet_url.strip(),
        "sheet_id":    sheet_id,
        "sheet_type":  data.sheet_type.upper(),
        "description": data.description or None,
        "created_by":  current_user.id,
        "created_at":  now,
        "updated_at":  now,
    }
    try:
        await db.password_sheet_links.insert_one(doc)
    except Exception as e:
        raise HTTPException(500, f"Database error: {str(e)}")
    doc.pop("_id", None)
    return doc


@router.put("/sheet-links/{link_id}", status_code=200)
async def update_sheet_link(
    link_id: str,
    data: GoogleSheetLinkUpdate,
    current_user: User = Depends(require_admin),
):
    existing = await db.password_sheet_links.find_one({"id": link_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Sheet link not found")
    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.label is not None:
        updates["label"] = data.label.strip()
    if data.sheet_url is not None:
        sheet_id = _extract_sheet_id(data.sheet_url)
        if not sheet_id:
            raise HTTPException(400, "Invalid Google Sheets URL")
        updates["sheet_url"] = data.sheet_url.strip()
        updates["sheet_id"] = sheet_id
    if data.sheet_type is not None:
        updates["sheet_type"] = data.sheet_type.upper()
    if data.description is not None:
        updates["description"] = data.description or None
    await db.password_sheet_links.update_one({"id": link_id}, {"$set": updates})
    updated = await db.password_sheet_links.find_one({"id": link_id}, {"_id": 0})
    return updated


@router.delete("/sheet-links/{link_id}")
async def delete_sheet_link(
    link_id: str,
    current_user: User = Depends(require_admin),
):
    existing = await db.password_sheet_links.find_one({"id": link_id})
    if not existing:
        raise HTTPException(404, "Sheet link not found")
    await db.password_sheet_links.delete_one({"id": link_id})
    return {"message": "Sheet link deleted"}


@router.post("/sheet-links/{link_id}/preview")
async def preview_sheet_data(
    link_id: str,
    current_user: User = Depends(get_current_user),
):
    link = await db.password_sheet_links.find_one({"id": link_id}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Sheet link not found")

    sheet_id = link.get("sheet_id")
    sheet_type = link.get("sheet_type", "OTHER")
    tabs = await _get_all_sheet_tabs(sheet_id)
    gid_from_url = _extract_gid(link.get("sheet_url", ""))

    if sheet_type in ("ROC", "MCA") and tabs:
        all_dfs = []
        for tab in tabs:
            df = await _fetch_sheet_as_csv(sheet_id, tab["gid"])
            if df is not None and not df.empty:
                df["_sheet_tab"] = tab["name"]
                all_dfs.append(df)
        if not all_dfs:
            raise HTTPException(502, "Could not fetch any sheet data. Ensure the sheet is publicly shared.")
        merged = pd.concat(all_dfs, ignore_index=True)
        preview = merged.head(20).fillna("").to_dict(orient="records")
        return {
            "sheet_type": sheet_type,
            "tabs_found": [t["name"] for t in tabs],
            "tabs_fetched": len(all_dfs),
            "total_rows": len(merged),
            "columns": list(merged.columns),
            "preview": preview,
        }
    elif sheet_type == "GST" and tabs:
        last_tab = tabs[-1]
        df = await _fetch_sheet_as_csv(sheet_id, last_tab["gid"])
        if df is None or df.empty:
            raise HTTPException(502, "Could not fetch GST sheet data.")
        preview = df.head(20).fillna("").to_dict(orient="records")
        return {
            "sheet_type": sheet_type,
            "tabs_found": [t["name"] for t in tabs],
            "tab_used": last_tab["name"],
            "total_rows": len(df),
            "columns": list(df.columns),
            "preview": preview,
        }
    else:
        df = await _fetch_sheet_as_csv(sheet_id, gid_from_url)
        if df is None or df.empty:
            raise HTTPException(502, "Could not fetch sheet data. Ensure it is publicly shared (Anyone with link can view).")
        preview = df.head(20).fillna("").to_dict(orient="records")
        return {
            "sheet_type": sheet_type,
            "tabs_found": [t["name"] for t in tabs],
            "tab_used": "default",
            "total_rows": len(df),
            "columns": list(df.columns),
            "preview": preview,
        }


# ── TEMPLATE ──────────────────────────────────────────────────────────────────

@router.get("/template", response_class=Response)
async def download_template(current_user: User = Depends(get_current_user)):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to download templates")

    template_columns = [
        "portal_name", "portal_type", "url", "username", "password_plain",
        "department", "holder_type", "holder_name", "holder_pan", "holder_din",
        "mobile", "trade_name", "client_name", "client_id", "notes", "tags"
    ]
    df = pd.DataFrame(columns=template_columns)
    example_rows = [
        {
            "portal_name": "Example GST Portal", "portal_type": "GST",
            "url": "https://www.gst.gov.in", "username": "example@gst.com",
            "password_plain": "SecurePassword123", "department": "GST",
            "holder_type": "COMPANY", "holder_name": "", "holder_pan": "",
            "holder_din": "", "mobile": "9876543210", "trade_name": "Example Traders",
            "client_name": "Example Client Pvt Ltd", "client_id": "CL001",
            "notes": "GST login for quarterly filings", "tags": "GST,Client,Important"
        },
        {
            "portal_name": "MCA Director Login", "portal_type": "MCA",
            "url": "https://www.mca.gov.in", "username": "director@example.com",
            "password_plain": "DirectorPass@456", "department": "ROC",
            "holder_type": "DIRECTOR", "holder_name": "Rajesh Kumar",
            "holder_pan": "ABCPK1234D", "holder_din": "08123456",
            "mobile": "9123456789", "trade_name": "",
            "client_name": "Example Client Pvt Ltd", "client_id": "CL001",
            "notes": "MCA login for Director Rajesh Kumar", "tags": "MCA,Director,ROC"
        },
    ]
    for i, row in enumerate(example_rows):
        df.loc[i] = row

    output = io.BytesIO()
    df.to_excel(output, index=False, engine="openpyxl")
    output.seek(0)
    headers = {
        "Content-Disposition": "attachment; filename=password_template.xlsx",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
    return Response(content=output.getvalue(), headers=headers)


# ── PARSE PREVIEW ─────────────────────────────────────────────────────────────

@router.post("/parse-preview", response_model=ColumnMappingPreview)
async def parse_file_preview(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to import passwords")
    contents = await file.read()
    try:
        df = _read_file_to_df(contents, file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))

    original_columns = list(df.columns)
    df_mapped, mapping_used, unmapped_cols = _map_columns(df)

    required_fields = ["portal_name", "username", "password_plain"]
    mapped_fields = set(mapping_used.values())
    missing_required = [f for f in required_fields if f not in mapped_fields]

    suggested_mappings = {}
    for col in unmapped_cols:
        suggestions = _suggest_canonical_for_unmapped(col)
        if suggestions:
            suggested_mappings[col] = suggestions

    sample = df_mapped.head(5).fillna("").to_dict(orient="records")
    return {
        "original_columns": original_columns,
        "mapping": mapping_used,
        "unmapped_columns": unmapped_cols,
        "sample_rows": sample,
        "total_rows": len(df),
        "missing_required": missing_required,
        "suggested_mappings": suggested_mappings,
    }


# ── BULK IMPORT ───────────────────────────────────────────────────────────────

@router.post("/bulk-import", response_model=BulkImportResult, status_code=200)
async def bulk_import_passwords(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(403, "You do not have permission to bulk import passwords")

    contents = await file.read()
    try:
        df = _read_file_to_df(contents, file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))

    df, mapping_used, unmapped_cols = _map_columns(df)

    if "portal_name" not in df.columns:
        raise HTTPException(
            400,
            "Could not find a 'portal name' column in your file. "
            "Please ensure your Excel has a column for the portal/website name."
        )

    # Pre-load all existing dedup keys into a set for fast lookup
    existing_docs = await db.passwords.find({}, {"_id": 0, "dedup_key": 1}).to_list(50000)
    existing_dedup_keys: set = {d["dedup_key"] for d in existing_docs if d.get("dedup_key")}

    total_processed = 0
    successful_imports = 0
    failed_imports = 0
    duplicate_skipped = 0
    skipped_rows = 0
    errors = []

    for index, row in df.iterrows():
        row_vals = [v for v in row.values if _clean_val(v) is not None]
        if not row_vals:
            skipped_rows += 1
            continue

        total_processed += 1

        try:
            portal_name = _clean_val(row.get("portal_name", ""))
            if not portal_name:
                failed_imports += 1
                errors.append({"row": index + 2, "error": "Portal name is empty", "data": {}})
                continue

            username = _clean_val(row.get("username", ""))
            client_id = _clean_val(row.get("client_id", ""))

            # Duplicate check
            dedup_key = _make_dedup_key(portal_name, username, client_id)
            if dedup_key in existing_dedup_keys:
                duplicate_skipped += 1
                continue

            portal_type_raw = _clean_val(row.get("portal_type", "")) or "OTHER"
            portal_type = _normalize_portal_type(portal_type_raw)

            dept_raw = _clean_val(row.get("department", ""))
            department = dept_raw.upper() if dept_raw else _derive_department(portal_type)

            holder_type_raw = _clean_val(row.get("holder_type", ""))
            holder_type = holder_type_raw.upper() if holder_type_raw else "COMPANY"
            if holder_type not in HOLDER_TYPES:
                holder_type = "COMPANY"

            url = _clean_val(row.get("url", ""))
            password_plain = _clean_val(row.get("password_plain", ""))
            holder_name = _clean_val(row.get("holder_name", ""))
            holder_pan = _clean_val(row.get("holder_pan", ""))
            if holder_pan:
                holder_pan = holder_pan.upper()
            holder_din = _clean_val(row.get("holder_din", ""))
            mobile = _clean_val(row.get("mobile", ""))
            trade_name = _clean_val(row.get("trade_name", ""))
            client_name = _clean_val(row.get("client_name", ""))

            if client_id and not client_name:
                client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "company_name": 1})
                if client_doc:
                    client_name = client_doc.get("company_name")

            notes = _clean_val(row.get("notes", ""))
            tags_raw = _clean_val(row.get("tags", ""))
            tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

            entry_data = {
                "portal_name": portal_name, "portal_type": portal_type, "url": url,
                "username": username, "password_plain": password_plain,
                "department": department, "holder_type": holder_type,
                "holder_name": holder_name, "holder_pan": holder_pan,
                "holder_din": holder_din, "mobile": mobile, "trade_name": trade_name,
                "client_name": client_name, "client_id": client_id,
                "notes": notes, "tags": tags,
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
                "holder_type":        new_entry.holder_type,
                "holder_name":        new_entry.holder_name,
                "holder_pan":         new_entry.holder_pan,
                "holder_din":         new_entry.holder_din,
                "mobile":             new_entry.mobile,
                "trade_name":         new_entry.trade_name,
                "client_name":        new_entry.client_name,
                "client_id":          new_entry.client_id,
                "notes":              new_entry.notes,
                "tags":               new_entry.tags,
                "dedup_key":          dedup_key,
                "created_by":         current_user.id,
                "created_at":         now,
                "updated_at":         now,
                "last_accessed_at":   now,
            }
            await db.passwords.insert_one(doc)
            existing_dedup_keys.add(dedup_key)  # prevent in-batch duplicates too

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
            errors.append({"row": index + 2, "error": str(e.errors()), "data": {}})
        except Exception as e:
            failed_imports += 1
            errors.append({"row": index + 2, "error": str(e), "data": {}})

    return {
        "total_processed": total_processed,
        "successful_imports": successful_imports,
        "failed_imports": failed_imports,
        "duplicate_skipped": duplicate_skipped,
        "errors": errors,
        "column_mapping": mapping_used,
        "unmapped_columns": unmapped_cols,
        "skipped_rows": skipped_rows,
    }


# ── BULK DELETE ───────────────────────────────────────────────────────────────

@router.post("/bulk-delete", status_code=200)
async def bulk_delete_passwords(
    data: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Only administrators can bulk delete entries")

    if len(data.ids) > 500:
        raise HTTPException(400, "Cannot delete more than 500 entries at once")

    # Verify all IDs exist
    existing = await db.passwords.find(
        {"id": {"$in": data.ids}},
        {"_id": 0, "id": 1, "portal_name": 1}
    ).to_list(500)

    found_ids = [d["id"] for d in existing]

    if not found_ids:
        raise HTTPException(404, "No matching entries found")

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

    # Use aggregation for speed instead of fetching all docs
    pipeline_dept = [{"$group": {"_id": "$department", "count": {"$sum": 1}}}]
    pipeline_type = [{"$group": {"_id": "$portal_type", "count": {"$sum": 1}}}]
    pipeline_holder = [{"$group": {"_id": "$holder_type", "count": {"$sum": 1}}}]

    async for d in db.passwords.aggregate(pipeline_dept):
        by_dept[d["_id"] or "OTHER"] = d["count"]
    async for d in db.passwords.aggregate(pipeline_type):
        by_type[d["_id"] or "OTHER"] = d["count"]
    async for d in db.passwords.aggregate(pipeline_holder):
        by_holder[d["_id"] or "COMPANY"] = d["count"]

    # Merge MCA + ROC counts for display
    mca_count = by_type.pop("MCA", 0) + by_type.pop("ROC", 0)
    if mca_count:
        by_type["MCA"] = mca_count

    return {
        "total": total,
        "by_department": by_dept,
        "by_portal_type": by_type,
        "by_holder_type": by_holder,
    }


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

    # Department filter — if user is not admin, restrict to their depts
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
                # Requested dept not in their allowed — return empty
                return []
            else:
                query["department"] = {"$in": allowed_depts}
        # else no restriction (shouldn't happen but safe)
    else:
        if department:
            dept_upper = department.upper()
            # MCA/ROC group: filter by portal_type instead of department
            if dept_upper in ("MCA", "ROC"):
                query["portal_type"] = {"$in": ["MCA", "ROC"]}
            else:
                query["department"] = dept_upper

    # Portal type filter
    if portal_type:
        pt_upper = portal_type.upper()
        if pt_upper in ("MCA", "ROC"):
            if "portal_type" not in query:  # don't overwrite
                query["portal_type"] = {"$in": ["MCA", "ROC"]}
        else:
            query["portal_type"] = pt_upper

    if client_id:
        query["client_id"] = client_id
    if holder_type:
        query["holder_type"] = holder_type.upper()

    # Search
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

    # Sort
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

    # For non-admin users, double-check permission per entry
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

    # Duplicate check
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

    # Recompute dedup_key if relevant fields changed
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
