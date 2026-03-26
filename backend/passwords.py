"""
Enhanced Password Repository Router for Taskosphere
Handles secure password management with encryption, access logging, and bulk operations.
FIXED:
  1. Route ordering — static routes (/admin/stats, /portal-types, /clients-list,
     /download-template, /parse-preview, /bulk-import, /bulk-delete) are registered
     BEFORE the dynamic /{entry_id} routes so FastAPI never tries to cast "admin",
     "portal-types" etc. as integers.
  2. Robust current_user guard using a proper dependency so NoneType errors are
     impossible at the handler level.
  3. Fixed FileResponse — openpyxl saves to BytesIO but FileResponse needs a real
     path; switched to StreamingResponse.
  4. Admin stats now returns real aggregated counts instead of empty dicts.
"""

import io
import base64
import json
import logging
import enum
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, or_, func, desc, asc, Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import Session
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel, Field, validator
from cryptography.fernet import Fernet
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

# ── DATABASE & AUTH DEPENDENCIES (AUTO-DETECT) ──────────────────────────────
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
                raise NotImplementedError("get_db not found")
            def get_current_user():
                raise NotImplementedError("get_current_user not found")

logger = logging.getLogger(__name__)

# ── Database Models ──────────────────────────────────────────────────────────
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

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    portal_name = Column(String(255), index=True)
    portal_type = Column(String(50), default="OTHER", index=True)
    url = Column(String(500), nullable=True)
    username = Column(String(255), index=True)
    password_encrypted = Column(Text)
    has_password = Column(Boolean, default=True)
    department = Column(String(50), default="OTHER", index=True)
    holder_type = Column(String(50), default="COMPANY")
    holder_name = Column(String(255), nullable=True, index=True)
    holder_pan = Column(String(20), nullable=True, index=True)
    holder_din = Column(String(20), nullable=True, index=True)
    mobile = Column(String(20), nullable=True)
    trade_name = Column(String(255), nullable=True, index=True)
    client_name = Column(String(255), nullable=True, index=True)
    client_id = Column(String(50), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)  # JSON array
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed_at = Column(DateTime, nullable=True)
    is_archived = Column(Boolean, default=False)


class AccessLog(Base):
    __tablename__ = "password_access_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    entry_id = Column(Integer, index=True)
    action = Column(String(50), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)


# ── Pydantic Models ──────────────────────────────────────────────────────────
class PasswordEntryBase(BaseModel):
    portal_name: str = Field(..., min_length=1, max_length=255)
    portal_type: Optional[str] = "OTHER"
    url: Optional[str] = None
    username: str = Field(..., min_length=1, max_length=255)
    password_plain: Optional[str] = None
    department: Optional[str] = None
    holder_type: Optional[str] = "COMPANY"
    holder_name: Optional[str] = None
    holder_pan: Optional[str] = None
    holder_din: Optional[str] = None
    mobile: Optional[str] = None
    trade_name: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

    @validator("portal_type")
    def validate_portal_type(cls, v):
        if v and v not in [e.value for e in PortalTypeEnum]:
            raise ValueError(f"Invalid portal type: {v}")
        return v or "OTHER"

    @validator("department")
    def validate_department(cls, v, values):
        if v and v not in [e.value for e in DepartmentEnum]:
            raise ValueError(f"Invalid department: {v}")
        if not v and "portal_type" in values:
            dept_map = {
                "MCA": "ROC", "ROC": "ROC", "DGFT": "OTHER", "TRADEMARK": "TM",
                "GST": "GST", "INCOME_TAX": "IT", "TDS": "TDS", "EPFO": "ACC",
                "ESIC": "ACC", "TRACES": "TDS", "MSME": "MSME", "RERA": "OTHER",
            }
            return dept_map.get(values["portal_type"], "OTHER")
        return v or "OTHER"


class PasswordEntryCreate(PasswordEntryBase):
    pass


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


class PasswordEntryResponse(PasswordEntryBase):
    id: int
    user_id: int
    has_password: bool
    created_at: datetime
    updated_at: datetime
    last_accessed_at: Optional[datetime]
    is_archived: bool

    class Config:
        from_attributes = True


class PasswordRevealResponse(BaseModel):
    id: int
    portal_name: str
    username: str
    password: str
    revealed_at: datetime


class BulkDeleteRequest(BaseModel):
    entry_ids: List[int]


class ParsePreviewResponse(BaseModel):
    rows_count: int
    columns_count: int
    sample_rows: List[Dict[str, Any]]
    column_mapping: Dict[str, str]


class BulkImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: int
    error_details: Optional[List[str]] = None


class StatsResponse(BaseModel):
    total: int
    by_portal_type: Dict[str, int]
    by_department: Dict[str, int]
    by_holder_type: Dict[str, int]
    total_access_logs: int
    last_updated: datetime


class AccessLogResponse(BaseModel):
    id: int
    user_id: int
    entry_id: int
    action: str
    timestamp: datetime
    ip_address: Optional[str]


# ── Encryption Helpers ───────────────────────────────────────────────────────
class PasswordEncryption:
    @staticmethod
    def get_cipher():
        import os
        raw = os.getenv("PASSWORD_ENCRYPTION_KEY", "your-secret-key-here-32-chars-long!")
        key = raw[:32].encode().ljust(32, b"0")
        return Fernet(base64.urlsafe_b64encode(key))

    @staticmethod
    def encrypt(password: str) -> str:
        if not password:
            return ""
        try:
            cipher = PasswordEncryption.get_cipher()
            return base64.b64encode(cipher.encrypt(password.encode())).decode()
        except Exception as e:
            logger.error(f"Encryption error: {e}")
            return base64.b64encode(password.encode()).decode()

    @staticmethod
    def decrypt(encrypted_password: str) -> str:
        if not encrypted_password:
            return ""
        try:
            cipher = PasswordEncryption.get_cipher()
            return cipher.decrypt(base64.b64decode(encrypted_password)).decode()
        except Exception as e:
            logger.warning(f"Decryption error, trying plain base64: {e}")
            try:
                return base64.b64decode(encrypted_password).decode()
            except Exception:
                return ""


# ── Auth guard dependency ────────────────────────────────────────────────────
def require_user(current_user=Depends(get_current_user)):
    """Raises 401 immediately if current_user is None — prevents NoneType crashes."""
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return current_user


# ── Permission Helpers ───────────────────────────────────────────────────────
def _is_admin(user) -> bool:
    return getattr(user, "role", None) == "admin"


# ── Data Enrichment ──────────────────────────────────────────────────────────
async def _enrich_entry(entry: PasswordEntry) -> PasswordEntryResponse:
    tags_list: List[str] = []
    if entry.tags:
        try:
            tags_list = json.loads(entry.tags)
        except (json.JSONDecodeError, TypeError):
            tags_list = []

    return PasswordEntryResponse(
        id=entry.id,
        user_id=entry.user_id,
        portal_name=entry.portal_name,
        portal_type=entry.portal_type or "OTHER",
        url=entry.url,
        username=entry.username,
        department=entry.department or "OTHER",
        holder_type=entry.holder_type or "COMPANY",
        holder_name=entry.holder_name,
        holder_pan=entry.holder_pan,
        holder_din=entry.holder_din,
        mobile=entry.mobile,
        trade_name=entry.trade_name,
        client_name=entry.client_name,
        client_id=entry.client_id,
        notes=entry.notes,
        tags=tags_list,
        has_password=entry.has_password,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        last_accessed_at=entry.last_accessed_at,
        is_archived=entry.is_archived,
    )


# ── Router ───────────────────────────────────────────────────────────────────
# IMPORTANT: All static-path routes MUST come before /{entry_id} routes.
router = APIRouter(prefix="/passwords", tags=["passwords"])


# ── 1. Static collection routes ──────────────────────────────────────────────

@router.get("/portal-types")
async def get_portal_types():
    return {
        "types": [e.value for e in PortalTypeEnum],
        "departments": [e.value for e in DepartmentEnum],
        "holder_types": [e.value for e in HolderTypeEnum],
    }


@router.get("/clients-list")
async def get_clients_list(
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    clients = db.execute(
        select(PasswordEntry.client_id, PasswordEntry.client_name)
        .where(and_(
            PasswordEntry.user_id == current_user.id,
            PasswordEntry.client_name.isnot(None),
            PasswordEntry.is_archived == False,
        ))
        .distinct()
    ).all()
    return [{"id": c[0], "name": c[1]} for c in clients if c[0]]


@router.get("/download-template")
async def download_template():
    try:
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

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=password-template.xlsx"},
        )
    except Exception as e:
        logger.error(f"Template error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate template")


@router.post("/parse-preview", response_model=ParsePreviewResponse)
async def parse_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    try:
        content = await file.read()
        fname = (file.filename or "").lower()
        df = pd.read_csv(io.BytesIO(content)) if fname.endswith(".csv") else pd.read_excel(io.BytesIO(content))
        column_mapping_hints = {
            "portal_name": ["Portal Name", "Portal"],
            "username": ["Username", "Email"],
            "password_plain": ["Password"],
        }
        detected = {
            k: next((c for c in df.columns if c.lower() in [a.lower() for a in v]), None)
            for k, v in column_mapping_hints.items()
        }
        return ParsePreviewResponse(
            rows_count=len(df),
            columns_count=len(df.columns),
            sample_rows=df.head(3).fillna("").to_dict("records"),
            column_mapping={k: v for k, v in detected.items() if v},
        )
    except Exception as e:
        logger.error(f"Parse error: {e}")
        raise HTTPException(status_code=400, detail="Failed to parse file")


@router.post("/bulk-import", response_model=BulkImportResponse)
async def bulk_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    try:
        content = await file.read()
        fname = (file.filename or "").lower()
        df = pd.read_csv(io.BytesIO(content)) if fname.endswith(".csv") else pd.read_excel(io.BytesIO(content))
        imported = 0
        skipped = 0
        errors = 0
        error_details: List[str] = []

        for idx, row in df.iterrows():
            try:
                portal_name = str(row.get("Portal Name") or row.get("Portal") or "").strip()
                username = str(row.get("Username") or row.get("Email") or "").strip()
                if not portal_name or not username:
                    skipped += 1
                    continue

                existing = db.execute(
                    select(PasswordEntry).where(and_(
                        PasswordEntry.user_id == current_user.id,
                        PasswordEntry.portal_name == portal_name,
                        PasswordEntry.username == username,
                        PasswordEntry.is_archived == False,
                    ))
                ).scalar()

                if existing:
                    skipped += 1
                    continue

                password_raw = str(row.get("Password") or "").strip()
                db.add(PasswordEntry(
                    user_id=current_user.id,
                    portal_name=portal_name,
                    portal_type=str(row.get("Portal Type") or "OTHER").strip(),
                    url=str(row.get("URL") or "").strip() or None,
                    username=username,
                    password_encrypted=PasswordEncryption.encrypt(password_raw),
                    has_password=bool(password_raw),
                    department=str(row.get("Department") or "OTHER").strip(),
                    holder_type=str(row.get("Holder Type") or "COMPANY").strip(),
                    holder_name=str(row.get("Holder Name") or "").strip() or None,
                    holder_pan=str(row.get("Holder PAN") or "").strip() or None,
                    holder_din=str(row.get("Holder DIN") or "").strip() or None,
                    mobile=str(row.get("Mobile") or "").strip() or None,
                    trade_name=str(row.get("Trade Name") or "").strip() or None,
                    client_name=str(row.get("Client Name") or "").strip() or None,
                    client_id=str(row.get("Client ID") or "").strip() or None,
                    notes=str(row.get("Notes") or "").strip() or None,
                    tags=json.dumps([]),
                ))
                imported += 1
            except Exception as row_err:
                logger.warning(f"Row {idx} import error: {row_err}")
                errors += 1
                error_details.append(f"Row {idx + 2}: {str(row_err)}")

        db.commit()
        return BulkImportResponse(imported=imported, skipped=skipped, errors=errors, error_details=error_details or None)
    except Exception as e:
        logger.error(f"Bulk import error: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Import failed")


@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_passwords(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin only")
    for entry_id in payload.entry_ids:
        entry = db.execute(
            select(PasswordEntry).where(and_(
                PasswordEntry.id == entry_id,
                PasswordEntry.user_id == current_user.id,
            ))
        ).scalar()
        if entry:
            entry.is_archived = True
            db.add(AccessLog(user_id=current_user.id, entry_id=entry_id, action="delete"))
    db.commit()


@router.get("/admin/stats", response_model=StatsResponse)
async def admin_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        base_filter = PasswordEntry.is_archived == False

        total = db.execute(
            select(func.count(PasswordEntry.id)).where(base_filter)
        ).scalar() or 0

        # by portal type
        portal_rows = db.execute(
            select(PasswordEntry.portal_type, func.count(PasswordEntry.id))
            .where(base_filter)
            .group_by(PasswordEntry.portal_type)
        ).all()
        by_portal_type = {r[0]: r[1] for r in portal_rows if r[0]}

        # by department
        dept_rows = db.execute(
            select(PasswordEntry.department, func.count(PasswordEntry.id))
            .where(base_filter)
            .group_by(PasswordEntry.department)
        ).all()
        by_department = {r[0]: r[1] for r in dept_rows if r[0]}

        # by holder type
        holder_rows = db.execute(
            select(PasswordEntry.holder_type, func.count(PasswordEntry.id))
            .where(base_filter)
            .group_by(PasswordEntry.holder_type)
        ).all()
        by_holder_type = {r[0]: r[1] for r in holder_rows if r[0]}

        total_logs = db.execute(select(func.count(AccessLog.id))).scalar() or 0

        return StatsResponse(
            total=total,
            by_portal_type=by_portal_type,
            by_department=by_department,
            by_holder_type=by_holder_type,
            total_access_logs=total_logs,
            last_updated=datetime.utcnow(),
        )
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


# ── 2. Collection-level CRUD ─────────────────────────────────────────────────

@router.get("", response_model=List[PasswordEntryResponse])
async def list_passwords(
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    holder_type: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    try:
        query = select(PasswordEntry).where(
            and_(
                PasswordEntry.user_id == current_user.id,
                PasswordEntry.is_archived == False,
            )
        )

        if search:
            term = f"%{search}%"
            query = query.where(or_(
                PasswordEntry.portal_name.ilike(term),
                PasswordEntry.username.ilike(term),
                PasswordEntry.client_name.ilike(term),
                PasswordEntry.holder_name.ilike(term),
                PasswordEntry.trade_name.ilike(term),
            ))
        if department and department != "ALL":
            query = query.where(PasswordEntry.department == department)
        if portal_type and portal_type != "ALL":
            query = query.where(PasswordEntry.portal_type == portal_type)
        if client_id and client_id != "ALL":
            query = query.where(PasswordEntry.client_id == client_id)
        if holder_type and holder_type != "ALL":
            query = query.where(PasswordEntry.holder_type == holder_type)

        order_col = PasswordEntry.portal_name if sort_by == "portal_name" else PasswordEntry.created_at
        order_fn = asc if sort_order == "asc" else desc
        query = query.order_by(order_fn(order_col))

        entries = db.execute(query.offset(skip).limit(limit)).scalars().all()
        return [await _enrich_entry(e) for e in entries]
    except Exception as e:
        logger.error(f"List passwords error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load password vault")


@router.post("", response_model=PasswordEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_password(
    payload: PasswordEntryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    try:
        existing = db.execute(
            select(PasswordEntry).where(and_(
                PasswordEntry.user_id == current_user.id,
                PasswordEntry.portal_name == payload.portal_name,
                PasswordEntry.username == payload.username,
                PasswordEntry.is_archived == False,
            ))
        ).scalar()
        if existing:
            raise HTTPException(status_code=409, detail="Duplicate entry: portal + username already exists")

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
        db.add(AccessLog(user_id=current_user.id, entry_id=entry.id, action="create"))
        db.commit()
        db.refresh(entry)
        return await _enrich_entry(entry)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create password error: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create entry")


# ── 3. Item-level routes (/{entry_id} MUST be last) ─────────────────────────

@router.get("/{entry_id}", response_model=PasswordEntryResponse)
async def get_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    entry = db.execute(
        select(PasswordEntry).where(and_(
            PasswordEntry.id == entry_id,
            PasswordEntry.user_id == current_user.id,
            PasswordEntry.is_archived == False,
        ))
    ).scalar()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return await _enrich_entry(entry)


@router.get("/{entry_id}/reveal", response_model=PasswordRevealResponse)
async def reveal_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    entry = db.execute(
        select(PasswordEntry).where(and_(
            PasswordEntry.id == entry_id,
            PasswordEntry.user_id == current_user.id,
            PasswordEntry.is_archived == False,
        ))
    ).scalar()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    password = PasswordEncryption.decrypt(entry.password_encrypted) if entry.has_password else ""
    entry.last_accessed_at = datetime.utcnow()
    db.add(AccessLog(user_id=current_user.id, entry_id=entry_id, action="reveal"))
    db.commit()

    return PasswordRevealResponse(
        id=entry.id,
        portal_name=entry.portal_name,
        username=entry.username,
        password=password,
        revealed_at=datetime.utcnow(),
    )


@router.put("/{entry_id}", response_model=PasswordEntryResponse)
async def update_password(
    entry_id: int,
    payload: PasswordEntryUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    entry = db.execute(
        select(PasswordEntry).where(and_(
            PasswordEntry.id == entry_id,
            PasswordEntry.user_id == current_user.id,
            PasswordEntry.is_archived == False,
        ))
    ).scalar()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_data = payload.dict(exclude_unset=True)

    if "password_plain" in update_data:
        pw = update_data.pop("password_plain")
        if pw:
            entry.password_encrypted = PasswordEncryption.encrypt(pw)
            entry.has_password = True

    if "tags" in update_data:
        entry.tags = json.dumps(update_data.pop("tags") or [])

    for key, value in update_data.items():
        setattr(entry, key, value)

    entry.updated_at = datetime.utcnow()
    db.add(AccessLog(user_id=current_user.id, entry_id=entry_id, action="edit"))
    db.commit()
    db.refresh(entry)
    return await _enrich_entry(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_password(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_user),
):
    entry = db.execute(
        select(PasswordEntry).where(and_(
            PasswordEntry.id == entry_id,
            PasswordEntry.user_id == current_user.id,
            PasswordEntry.is_archived == False,
        ))
    ).scalar()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.is_archived = True
    db.add(AccessLog(user_id=current_user.id, entry_id=entry_id, action="delete"))
    db.commit()
