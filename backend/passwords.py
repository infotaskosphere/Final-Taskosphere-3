"""
Password Repository Router for Taskosphere — backend/passwords.py
"""

import io
import os
import base64
import json
import logging
import enum
import tempfile
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import (
    select, and_, or_, func, desc, asc,
    Column, Integer, String, Text, DateTime, Boolean,
)
from sqlalchemy.orm import Session
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel, Field, validator
from cryptography.fernet import Fernet
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

# ── dependency imports ────────────────────────────────────────────────────────
try:
    from backend.dependencies import get_db, get_current_user
except ImportError:
    try:
        from app.dependencies import get_db, get_current_user
    except ImportError:
        try:
            from dependencies import get_db, get_current_user
        except ImportError:
            def get_db():
                raise NotImplementedError("Fix get_db import")
            def get_current_user():
                raise NotImplementedError("Fix get_current_user import")

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE MODELS
# ═══════════════════════════════════════════════════════════════════════════════
Base = declarative_base()


class PortalTypeEnum(str, enum.Enum):
    MCA = "MCA"
    ROC = "ROC"
    DGFT = "DGFT"
    TRADEMARK = "TRADEMARK"
    GST = "GST"
    INCOME_TAX = "INCOME_TAX"
    TDS = "TDS"
    TRACES = "TRACES"
    EPFO = "EPFO"
    ESIC = "ESIC"
    MSME = "MSME"
    RERA = "RERA"
    OTHER = "OTHER"


class DepartmentEnum(str, enum.Enum):
    GST = "GST"
    IT = "IT"
    ACC = "ACC"
    TDS = "TDS"
    ROC = "ROC"
    TM = "TM"
    MSME = "MSME"
    FEMA = "FEMA"
    DSC = "DSC"
    OTHER = "OTHER"


class HolderTypeEnum(str, enum.Enum):
    COMPANY = "COMPANY"
    DIRECTOR = "DIRECTOR"
    INDIVIDUAL = "INDIVIDUAL"
    PARTNER = "PARTNER"
    TRUSTEE = "TRUSTEE"
    OTHER = "OTHER"


class PasswordEntry(Base):
    __tablename__ = "password_entries"
    id                 = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, index=True)
    portal_name        = Column(String(255), index=True)
    portal_type        = Column(String(50),  default="OTHER", index=True)
    url                = Column(String(500),  nullable=True)
    username           = Column(String(255),  index=True)
    password_encrypted = Column(Text)
    has_password       = Column(Boolean, default=True)
    department         = Column(String(50),  default="OTHER", index=True)
    holder_type        = Column(String(50),  default="COMPANY")
    holder_name        = Column(String(255),  nullable=True, index=True)
    holder_pan         = Column(String(20),   nullable=True, index=True)
    holder_din         = Column(String(20),   nullable=True)
    mobile             = Column(String(20),   nullable=True)
    trade_name         = Column(String(255),  nullable=True, index=True)
    client_name        = Column(String(255),  nullable=True, index=True)
    client_id          = Column(String(50),   nullable=True, index=True)
    notes              = Column(Text, nullable=True)
    tags               = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed_at   = Column(DateTime, nullable=True)
    is_archived        = Column(Boolean, default=False)


class AccessLog(Base):
    __tablename__ = "password_access_logs"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, index=True)
    entry_id   = Column(Integer, index=True)
    action     = Column(String(50), index=True)
    timestamp  = Column(DateTime, default=datetime.utcnow, index=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════
class PasswordEntryBase(BaseModel):
    portal_name:    str             = Field(..., min_length=1, max_length=255)
    portal_type:    Optional[str]   = "OTHER"
    url:            Optional[str]   = None
    username:       str             = Field(..., min_length=1, max_length=255)
    password_plain: Optional[str]   = None
    department:     Optional[str]   = None
    holder_type:    Optional[str]   = "COMPANY"
    holder_name:    Optional[str]   = None
    holder_pan:     Optional[str]   = None
    holder_din:     Optional[str]   = None
    mobile:         Optional[str]   = None
    trade_name:     Optional[str]   = None
    client_name:    Optional[str]   = None
    client_id:      Optional[str]   = None
    notes:          Optional[str]   = None
    tags:           Optional[List[str]] = None

    @validator("portal_type")
    def _vpt(cls, v):
        valid = {e.value for e in PortalTypeEnum}
        return v if v in valid else "OTHER"

    @validator("department", always=True)
    def _vdept(cls, v, values):
        valid = {e.value for e in DepartmentEnum}
        if v and v in valid:
            return v
        dept_map = {
            "MCA": "ROC", "ROC": "ROC", "DGFT": "OTHER", "TRADEMARK": "TM",
            "GST": "GST", "INCOME_TAX": "IT", "TDS": "TDS", "EPFO": "ACC",
            "ESIC": "ACC", "TRACES": "TDS", "MSME": "MSME", "RERA": "OTHER",
        }
        return dept_map.get(values.get("portal_type", ""), "OTHER")


class PasswordEntryCreate(PasswordEntryBase):
    pass


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


class PasswordEntryResponse(PasswordEntryBase):
    id:               int
    user_id:          int
    has_password:     bool
    created_at:       datetime
    updated_at:       datetime
    last_accessed_at: Optional[datetime] = None
    is_archived:      bool

    class Config:
        from_attributes = True


class PasswordRevealResponse(BaseModel):
    id:          int
    portal_name: str
    username:    str
    password:    str
    revealed_at: datetime


class BulkDeleteRequest(BaseModel):
    entry_ids: List[int]


class ParsePreviewResponse(BaseModel):
    rows_count:     int
    columns_count:  int
    sample_rows:    List[Dict[str, Any]]
    column_mapping: Dict[str, str]


class BulkImportResponse(BaseModel):
    imported:      int
    skipped:       int
    errors:        int
    error_details: Optional[List[str]] = None


class StatsResponse(BaseModel):
    total:             int
    by_portal_type:    Dict[str, int]
    by_department:     Dict[str, int]
    by_holder_type:    Dict[str, int]
    total_access_logs: int
    last_updated:      datetime


# ═══════════════════════════════════════════════════════════════════════════════
# ENCRYPTION
# ═══════════════════════════════════════════════════════════════════════════════
class PasswordEncryption:
    @staticmethod
    def _key() -> bytes:
        raw = os.environ.get("PASSWORDS_SECRET_KEY", "taskosphere-fixed-32-byte-default")
        return base64.urlsafe_b64encode(raw.encode().ljust(32, b"0")[:32])

    @staticmethod
    def encrypt(password: str) -> str:
        if not password: return ""
        try:
            return base64.b64encode(Fernet(PasswordEncryption._key()).encrypt(password.encode())).decode()
        except Exception: return base64.b64encode(password.encode()).decode()

    @staticmethod
    def decrypt(enc: str) -> str:
        if not enc: return ""
        try:
            return Fernet(PasswordEncryption._key()).decrypt(base64.b64decode(enc)).decode()
        except Exception:
            try: return base64.b64decode(enc).decode()
            except Exception: return "[Decryption Error]"
# ═══════════════════════════════════════════════════════════════════════════════
# SHARED HELPERS
# ═══════════════════════════════════════════════════════════════════════════════
def _tags(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _enrich(e: PasswordEntry) -> PasswordEntryResponse:
    return PasswordEntryResponse(
        id=e.id,
        user_id=e.user_id,
        portal_name=e.portal_name,
        portal_type=e.portal_type or "OTHER",
        url=e.url,
        username=e.username,
        department=e.department or "OTHER",
        holder_type=e.holder_type or "COMPANY",
        holder_name=e.holder_name,
        holder_pan=e.holder_pan,
        holder_din=e.holder_din,
        mobile=e.mobile,
        trade_name=e.trade_name,
        client_name=e.client_name,
        client_id=e.client_id,
        notes=e.notes,
        tags=_tags(e.tags),
        has_password=bool(e.has_password),
        created_at=e.created_at or datetime.utcnow(),
        updated_at=e.updated_at or datetime.utcnow(),
        last_accessed_at=e.last_accessed_at,
        is_archived=bool(e.is_archived),
    )


def _require(current_user: Any) -> None:
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")


def _log(db: Session, user_id: int, entry_id: int, action: str) -> None:
    try:
        db.add(AccessLog(user_id=user_id, entry_id=entry_id, action=action))
    except Exception as ex:
        logger.warning("access log write failed: %s", ex)


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTER
# NOTE: Static routes MUST come before /{entry_id} routes
# ═══════════════════════════════════════════════════════════════════════════════
router = APIRouter(prefix="/passwords", tags=["passwords"], redirect_slashes=True)


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("", response_model=List[PasswordEntryResponse])
def list_passwords(
    search:      Optional[str] = Query(None),
    department:  Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    client_id:   Optional[str] = Query(None),
    holder_type: Optional[str] = Query(None),
    sort_by:     Optional[str] = Query("created_at"),
    sort_order:  Optional[str] = Query("desc"),
    skip:        int           = Query(0,   ge=0),
    limit:       int           = Query(200, ge=1, le=500),
    db: Session  = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        q = select(PasswordEntry).where(
            and_(
                PasswordEntry.user_id == current_user.id,
                PasswordEntry.is_archived == False,
            )
        )
        if search:
            lk = f"%{search}%"
            q = q.where(or_(
                PasswordEntry.portal_name.ilike(lk),
                PasswordEntry.username.ilike(lk),
                PasswordEntry.client_name.ilike(lk),
                PasswordEntry.holder_name.ilike(lk),
                PasswordEntry.trade_name.ilike(lk),
            ))
        if department  and department  != "ALL":
            q = q.where(PasswordEntry.department  == department)
        if portal_type and portal_type != "ALL":
            q = q.where(PasswordEntry.portal_type == portal_type)
        if client_id   and client_id   != "ALL":
            q = q.where(PasswordEntry.client_id   == client_id)
        if holder_type and holder_type != "ALL":
            q = q.where(PasswordEntry.holder_type == holder_type)

        col = PasswordEntry.portal_name if sort_by == "portal_name" else PasswordEntry.created_at
        q   = q.order_by(asc(col) if sort_order == "asc" else desc(col))
        q   = q.offset(skip).limit(limit)

        results = db.execute(q).scalars().all(); results = db.execute(q).scalars().all(); return [_enrich(r) for r in results] if results else []
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("list_passwords: %s", exc, exc_info=True)
        raise HTTPException(500, detail=f"Failed to list passwords: {exc}")


# ── CREATE ────────────────────────────────────────────────────────────────────
@router.post("", response_model=PasswordEntryResponse, status_code=201)
def create_password(
    payload: PasswordEntryCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        dup = db.execute(select(PasswordEntry).where(and_(
            PasswordEntry.user_id     == current_user.id,
            PasswordEntry.portal_name == payload.portal_name,
            PasswordEntry.username    == payload.username,
            PasswordEntry.is_archived == False,
        ))).scalar()
        if dup:
            raise HTTPException(409, "Duplicate: portal + username already exists")

        entry = PasswordEntry(
            user_id=current_user.id,
            portal_name=payload.portal_name,
            portal_type=payload.portal_type or "OTHER",
            url=payload.url,
            username=payload.username,
            password_encrypted=PasswordEncryption.encrypt(payload.password_plain or ""),
            has_password=bool(payload.password_plain),
            department=payload.department or "OTHER",
            holder_type=payload.holder_type or "COMPANY",
            holder_name=payload.holder_name,
            holder_pan=payload.holder_pan,
            holder_din=payload.holder_din,
            mobile=payload.mobile,
            trade_name=payload.trade_name,
            client_name=payload.client_name,
            client_id=payload.client_id,
            notes=payload.notes,
            tags=json.dumps(payload.tags or []),
        )
        db.add(entry)
        db.flush()
        _log(db, current_user.id, entry.id, "create")
        db.commit()
        db.refresh(entry)
        return _enrich(entry)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("create_password: %s", exc, exc_info=True)
        raise HTTPException(500, detail=f"Failed to create: {exc}")


# ══════════════════════════════════════════════════════════════════════════════
# STATIC SUB-ROUTES — all declared ABOVE /{entry_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/portal-types")
def get_portal_types():
    return {
        "types":        [e.value for e in PortalTypeEnum],
        "departments":  [e.value for e in DepartmentEnum],
        "holder_types": [e.value for e in HolderTypeEnum],
    }


@router.get("/clients-list")
def get_clients_list(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        rows = db.execute(
            select(PasswordEntry.client_id, PasswordEntry.client_name)
            .where(and_(
                PasswordEntry.user_id     == current_user.id,
                PasswordEntry.client_name.isnot(None),
                PasswordEntry.client_id.isnot(None),
                PasswordEntry.is_archived == False,
            )).distinct()
        ).all()
        return [{"id": r[0], "name": r[1]} for r in rows]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("get_clients_list: %s", exc, exc_info=True)
        raise HTTPException(500, detail=str(exc))


@router.get("/download-template")
def download_template():
    try:
        wb = Workbook()
        ws = wb.active
        ws.title = "Passwords"
        headers = [
            "Portal Name", "Portal Type", "URL", "Username", "Password",
            "Department", "Holder Type", "Holder Name", "Holder PAN",
            "Holder DIN", "Mobile", "Trade Name", "Client Name", "Client ID", "Notes",
        ]
        hdr_font = Font(bold=True, color="FFFFFF")
        hdr_fill = PatternFill(start_color="1F6FB2", end_color="1F6FB2", fill_type="solid")
        for ci, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=ci, value=h)
            cell.font = hdr_font
            cell.fill = hdr_fill
            ws.column_dimensions[cell.column_letter].width = 20

        ws.append([
            "GST Portal", "GST", "https://www.gst.gov.in",
            "user@example.com", "SecurePass@123", "GST", "COMPANY",
            "Acme Pvt Ltd", "ABCDE1234F", "", "+91 9876543210",
            "Acme Traders", "Acme Corp", "CLI001", "Main GST login",
        ])

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", prefix="pw_tmpl_")
        wb.save(tmp.name)
        tmp.close()

        return FileResponse(
            path=tmp.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="password-template.xlsx",
        )
    except Exception as exc:
        logger.error("download_template: %s", exc, exc_info=True)
        raise HTTPException(500, "Failed to generate template")


@router.post("/parse-preview", response_model=ParsePreviewResponse)
async def parse_preview(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        content = await file.read()
        fname   = (file.filename or "").lower()
        df = (
            pd.read_csv(io.BytesIO(content))
            if fname.endswith(".csv")
            else pd.read_excel(io.BytesIO(content))
        )

        aliases: Dict[str, List[str]] = {
            "portal_name":    ["portal name", "portal", "site"],
            "username":       ["username", "email", "user", "login"],
            "password_plain": ["password", "pass", "pwd"],
            "department":     ["department", "dept"],
            "client_name":    ["client name", "client", "company"],
        }
        lower_cols = {c.lower(): c for c in df.columns}
        detected: Dict[str, str] = {}
        for field, alts in aliases.items():
            for a in alts:
                if a in lower_cols:
                    detected[field] = lower_cols[a]
                    break

        return ParsePreviewResponse(
            rows_count=len(df),
            columns_count=len(df.columns),
            sample_rows=df.head(3).fillna("").to_dict("records"),
            column_mapping=detected,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("parse_preview: %s", exc, exc_info=True)
        raise HTTPException(400, f"Failed to parse file: {exc}")


@router.post("/bulk-import", response_model=BulkImportResponse)
async def bulk_import(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        content = await file.read()
        fname   = (file.filename or "").lower()
        df = (
            pd.read_csv(io.BytesIO(content))
            if fname.endswith(".csv")
            else pd.read_excel(io.BytesIO(content))
        )
        df.columns = [str(c).strip().lower() for c in df.columns]

        def _col(*cands: str) -> Optional[str]:
            for c in cands:
                if c in df.columns:
                    return c
            return None

        name_col   = _col("portal name", "portal", "site")
        user_col   = _col("username", "email", "user", "login")
        pass_col   = _col("password", "pass", "pwd")
        dept_col   = _col("department", "dept")
        type_col   = _col("portal type", "type")
        client_col = _col("client name", "client", "company")

        if not name_col or not user_col:
            raise HTTPException(
                400,
                "File must contain 'Portal Name' and 'Username'/'Email' columns",
            )

        imported = 0
        skipped  = 0
        errors   = 0
        errs: List[str] = []

        for idx, row in df.iterrows():
            try:
                pname = str(row.get(name_col, "") or "").strip()
                uname = str(row.get(user_col, "") or "").strip()
                if not pname or not uname:
                    skipped += 1
                    continue

                dup = db.execute(select(PasswordEntry).where(and_(
                    PasswordEntry.user_id     == current_user.id,
                    PasswordEntry.portal_name == pname,
                    PasswordEntry.username    == uname,
                    PasswordEntry.is_archived == False,
                ))).scalar()
                if dup:
                    skipped += 1
                    continue

                raw_pw = str(row.get(pass_col, "") or "") if pass_col else ""
                db.add(PasswordEntry(
                    user_id=current_user.id,
                    portal_name=pname,
                    portal_type=str(row.get(type_col, "OTHER") or "OTHER") if type_col else "OTHER",
                    username=uname,
                    password_encrypted=PasswordEncryption.encrypt(raw_pw),
                    has_password=bool(raw_pw),
                    department=str(row.get(dept_col, "OTHER") or "OTHER") if dept_col else "OTHER",
                    client_name=str(row.get(client_col, "") or "") or None if client_col else None,
                    tags=json.dumps([]),
                ))
                imported += 1
                if imported % 50 == 0:
                    db.commit()
            except Exception as re:
                errors += 1
                errs.append(f"Row {idx + 2}: {re}")

        db.commit()
        return BulkImportResponse(
            imported=imported,
            skipped=skipped,
            errors=errors,
            error_details=errs[:20] or None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("bulk_import: %s", exc, exc_info=True)
        raise HTTPException(400, f"Import failed: {exc}")


@router.post("/bulk-delete", status_code=204)
def bulk_delete_passwords(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        for eid in payload.entry_ids:
            e = db.execute(select(PasswordEntry).where(and_(
                PasswordEntry.id      == eid,
                PasswordEntry.user_id == current_user.id,
            ))).scalar()
            if e:
                e.is_archived = True
                _log(db, current_user.id, eid, "bulk_delete")
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("bulk_delete: %s", exc, exc_info=True)
        raise HTTPException(500, str(exc))


@router.get("/admin/stats", response_model=StatsResponse)
def admin_stats(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    try:
        base_filter = PasswordEntry.is_archived == False
        total = db.execute(
            select(func.count(PasswordEntry.id)).where(base_filter)
        ).scalar() or 0

        def _group(col: Any) -> Dict[str, int]:
            return {
                r[0]: r[1]
                for r in db.execute(
                    select(col, func.count(PasswordEntry.id))
                    .where(base_filter)
                    .group_by(col)
                ).all()
                if r[0]
            }

        return StatsResponse(
            total=total,
            by_portal_type=_group(PasswordEntry.portal_type),
            by_department=_group(PasswordEntry.department),
            by_holder_type=_group(PasswordEntry.holder_type),
            total_access_logs=db.execute(
                select(func.count(AccessLog.id))
            ).scalar() or 0,
            last_updated=datetime.utcnow(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("admin_stats: %s", exc, exc_info=True)
        raise HTTPException(500, str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# /{entry_id} ROUTES — declared LAST
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{entry_id}", response_model=PasswordEntryResponse)
def get_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    e = db.execute(select(PasswordEntry).where(and_(
        PasswordEntry.id      == entry_id,
        PasswordEntry.user_id == current_user.id,
    ))).scalar()
    if not e:
        raise HTTPException(404, "Entry not found")
    return _enrich(e)


@router.get("/{entry_id}/reveal", response_model=PasswordRevealResponse)
def reveal_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    e = db.execute(select(PasswordEntry).where(and_(
        PasswordEntry.id      == entry_id,
        PasswordEntry.user_id == current_user.id,
    ))).scalar()
    if not e:
        raise HTTPException(404, "Entry not found")

    pw = PasswordEncryption.decrypt(e.password_encrypted) if e.has_password else ""
    e.last_accessed_at = datetime.utcnow()
    _log(db, current_user.id, entry_id, "reveal")
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("reveal commit: %s", exc)

    return PasswordRevealResponse(
        id=e.id,
        portal_name=e.portal_name,
        username=e.username,
        password=pw,
        revealed_at=datetime.utcnow(),
    )


@router.put("/{entry_id}", response_model=PasswordEntryResponse)
def update_password(
    entry_id: int,
    payload:  PasswordEntryUpdate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    e = db.execute(select(PasswordEntry).where(and_(
        PasswordEntry.id      == entry_id,
        PasswordEntry.user_id == current_user.id,
    ))).scalar()
    if not e:
        raise HTTPException(404, "Entry not found")

    try:
        data = payload.dict(exclude_unset=True)
        if "password_plain" in data:
            pw = data.pop("password_plain")
            if pw:
                e.password_encrypted = PasswordEncryption.encrypt(pw)
                e.has_password = True
        if "tags" in data:
            e.tags = json.dumps(data.pop("tags") or [])
        for k, v in data.items():
            if hasattr(e, k):
                setattr(e, k, v)
        e.updated_at = datetime.utcnow()
        _log(db, current_user.id, entry_id, "edit")
        db.commit()
        db.refresh(e)
        return _enrich(e)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("update_password: %s", exc, exc_info=True)
        raise HTTPException(500, str(exc))


@router.delete("/{entry_id}", status_code=204)
def delete_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    _require(current_user)
    e = db.execute(select(PasswordEntry).where(and_(
        PasswordEntry.id      == entry_id,
        PasswordEntry.user_id == current_user.id,
    ))).scalar()
    if not e:
        raise HTTPException(404, "Entry not found")

    e.is_archived = True
    _log(db, current_user.id, entry_id, "delete")
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("delete_password: %s", exc, exc_info=True)
        raise HTTPException(500, str(exc))
