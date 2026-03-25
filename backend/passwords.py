"""
Enhanced Password Repository Router for Taskosphere
Handles secure password management with encryption, access logging, and bulk operations
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select, and_, or_, func, desc, asc
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import io
import base64
import json
import logging
from cryptography.fernet import Fernet
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import httpx

logger = logging.getLogger(__name__)

# ── Database Models ──────────────────────────────────────────────────────────
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum
from sqlalchemy.ext.declarative import declarative_base
import enum

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
    password_hash = Column(String(255))
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
    action = Column(String(50), index=True)  # 'reveal', 'edit', 'delete', 'create'
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

    @validator('portal_type')
    def validate_portal_type(cls, v):
        if v and v not in [e.value for e in PortalTypeEnum]:
            raise ValueError(f"Invalid portal type: {v}")
        return v or "OTHER"

    @validator('department')
    def validate_department(cls, v, values):
        if v and v not in [e.value for e in DepartmentEnum]:
            raise ValueError(f"Invalid department: {v}")
        if not v and 'portal_type' in values:
            portal_type = values['portal_type']
            dept_map = {
                'MCA': 'ROC', 'ROC': 'ROC', 'DGFT': 'OTHER', 'TRADEMARK': 'TM',
                'GST': 'GST', 'INCOME_TAX': 'IT', 'TDS': 'TDS', 'EPFO': 'ACC',
                'ESIC': 'ACC', 'TRACES': 'TDS', 'MSME': 'MSME', 'RERA': 'OTHER'
            }
            return dept_map.get(portal_type, 'OTHER')
        return v or 'OTHER'

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
        key = b'your-secret-key-here-32-chars-long!'  # Use env var in production
        return Fernet(base64.urlsafe_b64encode(key[:32].ljust(32, b'0')))

    @staticmethod
    def encrypt(password: str) -> str:
        try:
            cipher = PasswordEncryption.get_cipher()
            encrypted = cipher.encrypt(password.encode())
            return base64.b64encode(encrypted).decode()
        except Exception as e:
            logger.error(f"Encryption error: {e}")
            return base64.b64encode(password.encode()).decode()

    @staticmethod
    def decrypt(encrypted_password: str) -> str:
        try:
            cipher = PasswordEncryption.get_cipher()
            decrypted = cipher.decrypt(base64.b64decode(encrypted_password))
            return decrypted.decode()
        except Exception as e:
            logger.warning(f"Decryption error, trying base64: {e}")
            try:
                return base64.b64decode(encrypted_password).decode()
            except:
                return ""

# ── Permission Helpers ───────────────────────────────────────────────────────
async def _get_user_perms(user_id: int, db: Session) -> Dict[str, bool]:
    """Get user permissions"""
    return {
        'view': True,
        'edit': True,
        'reveal': True,
        'admin': False,
    }

async def _can_view(user_id: int, db: Session) -> bool:
    perms = await _get_user_perms(user_id, db)
    return perms.get('view', False)

async def _can_edit(user_id: int, db: Session) -> bool:
    perms = await _get_user_perms(user_id, db)
    return perms.get('edit', False)

async def _can_reveal(user_id: int, db: Session) -> bool:
    perms = await _get_user_perms(user_id, db)
    return perms.get('reveal', False)

async def _is_admin(user_id: int, db: Session) -> bool:
    perms = await _get_user_perms(user_id, db)
    return perms.get('admin', False)

# ── Data Enrichment ──────────────────────────────────────────────────────────
async def _enrich_entry(entry: PasswordEntry) -> PasswordEntryResponse:
    """Convert DB entry to response with computed fields"""
    return PasswordEntryResponse(
        id=entry.id,
        user_id=entry.user_id,
        portal_name=entry.portal_name,
        portal_type=entry.portal_type,
        url=entry.url,
        username=entry.username,
        department=entry.department,
        holder_type=entry.holder_type,
        holder_name=entry.holder_name,
        holder_pan=entry.holder_pan,
        holder_din=entry.holder_din,
        mobile=entry.mobile,
        trade_name=entry.trade_name,
        client_name=entry.client_name,
        client_id=entry.client_id,
        notes=entry.notes,
        tags=json.loads(entry.tags) if entry.tags else [],
        has_password=entry.has_password,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        last_accessed_at=entry.last_accessed_at,
        is_archived=entry.is_archived,
    )

async def _strip_sensitive(entry: PasswordEntry) -> Dict[str, Any]:
    """Return entry without password"""
    return {
        'id': entry.id,
        'portal_name': entry.portal_name,
        'portal_type': entry.portal_type,
        'username': entry.username,
        'department': entry.department,
        'holder_name': entry.holder_name,
        'has_password': entry.has_password,
    }

# ── Router ───────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/passwords", tags=["passwords"])

# GET /passwords - List all entries
@router.get("", response_model=List[PasswordEntryResponse])
async def list_passwords(
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    portal_type: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    holder_type: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(lambda: None),  # Replace with actual DB dependency
    current_user = Depends(lambda: None),  # Replace with actual auth dependency
):
    """List password entries with filtering and sorting"""
    try:
        # Build query
        query = select(PasswordEntry).where(
            and_(
                PasswordEntry.user_id == current_user.id,
                PasswordEntry.is_archived == False
            )
        )

        # Apply filters
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    PasswordEntry.portal_name.ilike(search_term),
                    PasswordEntry.username.ilike(search_term),
                    PasswordEntry.client_name.ilike(search_term),
                    PasswordEntry.holder_name.ilike(search_term),
                )
            )
        if department:
            query = query.where(PasswordEntry.department == department)
        if portal_type:
            query = query.where(PasswordEntry.portal_type == portal_type)
        if client_id:
            query = query.where(PasswordEntry.client_id == client_id)
        if holder_type:
            query = query.where(PasswordEntry.holder_type == holder_type)

        # Apply sorting
        if sort_by == "portal_name":
            query = query.order_by(asc(PasswordEntry.portal_name) if sort_order == "asc" else desc(PasswordEntry.portal_name))
        else:
            query = query.order_by(asc(PasswordEntry.created_at) if sort_order == "asc" else desc(PasswordEntry.created_at))

        # Pagination
        query = query.offset(skip).limit(limit)

        # Execute
        entries = db.execute(query).scalars().all()
        return [await _enrich_entry(e) for e in entries]

    except Exception as e:
        logger.error(f"List error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# POST /passwords - Create entry
@router.post("", response_model=PasswordEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_password(
    payload: PasswordEntryCreate,
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Create a new password entry"""
    try:
        # Check for duplicates
        existing = db.execute(
            select(PasswordEntry).where(
                and_(
                    PasswordEntry.user_id == current_user.id,
                    PasswordEntry.portal_name == payload.portal_name,
                    PasswordEntry.username == payload.username,
                    PasswordEntry.is_archived == False
                )
            )
        ).scalar()

        if existing:
            raise HTTPException(status_code=409, detail="Entry with same portal and username already exists")

        # Encrypt password
        encrypted_pw = PasswordEncryption.encrypt(payload.password_plain or "")

        # Create entry
        entry = PasswordEntry(
            user_id=current_user.id,
            portal_name=payload.portal_name,
            portal_type=payload.portal_type or "OTHER",
            url=payload.url,
            username=payload.username,
            password_encrypted=encrypted_pw,
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
        db.commit()
        db.refresh(entry)

        # Log access
        log = AccessLog(user_id=current_user.id, entry_id=entry.id, action="create")
        db.add(log)
        db.commit()

        return await _enrich_entry(entry)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# GET /passwords/{entry_id} - Get single entry
@router.get("/{entry_id}", response_model=PasswordEntryResponse)
async def get_password(
    entry_id: int,
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Get a single password entry"""
    entry = db.execute(
        select(PasswordEntry).where(
            and_(
                PasswordEntry.id == entry_id,
                PasswordEntry.user_id == current_user.id
            )
        )
    ).scalar()

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    return await _enrich_entry(entry)

# GET /passwords/{entry_id}/reveal - Reveal password
@router.get("/{entry_id}/reveal", response_model=PasswordRevealResponse)
async def reveal_password(
    entry_id: int,
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Reveal the password for an entry"""
    entry = db.execute(
        select(PasswordEntry).where(
            and_(
                PasswordEntry.id == entry_id,
                PasswordEntry.user_id == current_user.id
            )
        )
    ).scalar()

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Decrypt password
    password = PasswordEncryption.decrypt(entry.password_encrypted) if entry.has_password else ""

    # Update last accessed
    entry.last_accessed_at = datetime.utcnow()
    db.commit()

    # Log access
    log = AccessLog(user_id=current_user.id, entry_id=entry_id, action="reveal")
    db.add(log)
    db.commit()

    return PasswordRevealResponse(
        id=entry.id,
        portal_name=entry.portal_name,
        username=entry.username,
        password=password,
        revealed_at=datetime.utcnow(),
    )

# PUT /passwords/{entry_id} - Update entry
@router.put("/{entry_id}", response_model=PasswordEntryResponse)
async def update_password(
    entry_id: int,
    payload: PasswordEntryUpdate,
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Update a password entry"""
    entry = db.execute(
        select(PasswordEntry).where(
            and_(
                PasswordEntry.id == entry_id,
                PasswordEntry.user_id == current_user.id
            )
        )
    ).scalar()

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Update fields
    if payload.portal_name:
        entry.portal_name = payload.portal_name
    if payload.portal_type:
        entry.portal_type = payload.portal_type
    if payload.url is not None:
        entry.url = payload.url
    if payload.username:
        entry.username = payload.username
    if payload.password_plain:
        entry.password_encrypted = PasswordEncryption.encrypt(payload.password_plain)
        entry.has_password = True
    if payload.department:
        entry.department = payload.department
    if payload.holder_type:
        entry.holder_type = payload.holder_type
    if payload.holder_name is not None:
        entry.holder_name = payload.holder_name
    if payload.holder_pan is not None:
        entry.holder_pan = payload.holder_pan
    if payload.holder_din is not None:
        entry.holder_din = payload.holder_din
    if payload.mobile is not None:
        entry.mobile = payload.mobile
    if payload.trade_name is not None:
        entry.trade_name = payload.trade_name
    if payload.client_name is not None:
        entry.client_name = payload.client_name
    if payload.client_id is not None:
        entry.client_id = payload.client_id
    if payload.notes is not None:
        entry.notes = payload.notes
    if payload.tags is not None:
        entry.tags = json.dumps(payload.tags)

    entry.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(entry)

    # Log access
    log = AccessLog(user_id=current_user.id, entry_id=entry_id, action="edit")
    db.add(log)
    db.commit()

    return await _enrich_entry(entry)

# DELETE /passwords/{entry_id} - Delete entry
@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_password(
    entry_id: int,
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Delete a password entry (soft delete)"""
    entry = db.execute(
        select(PasswordEntry).where(
            and_(
                PasswordEntry.id == entry_id,
                PasswordEntry.user_id == current_user.id
            )
        )
    ).scalar()

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Soft delete
    entry.is_archived = True
    db.commit()

    # Log access
    log = AccessLog(user_id=current_user.id, entry_id=entry_id, action="delete")
    db.add(log)
    db.commit()

# POST /passwords/bulk-delete - Bulk delete
@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_passwords(
    payload: BulkDeleteRequest,
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Bulk delete password entries"""
    if not await _is_admin(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin only")

    # Soft delete
    db.execute(
        select(PasswordEntry).where(
            and_(
                PasswordEntry.id.in_(payload.entry_ids),
                PasswordEntry.user_id == current_user.id
            )
        )
    )

    for entry_id in payload.entry_ids:
        entry = db.execute(
            select(PasswordEntry).where(PasswordEntry.id == entry_id)
        ).scalar()
        if entry:
            entry.is_archived = True
            log = AccessLog(user_id=current_user.id, entry_id=entry_id, action="delete")
            db.add(log)

    db.commit()

# POST /passwords/parse-preview - Parse file preview
@router.post("/parse-preview", response_model=ParsePreviewResponse)
async def parse_preview(
    file: UploadFile = File(...),
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Parse and preview uploaded file"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        # Column mapping
        column_mapping = {
            'portal_name': ['Portal Name', 'Portal', 'Name'],
            'username': ['Username', 'Email', 'Login'],
            'password_plain': ['Password', 'Pass'],
            'portal_type': ['Portal Type', 'Type'],
            'holder_name': ['Holder', 'Director', 'Name'],
            'client_name': ['Client', 'Company'],
        }

        # Auto-detect columns
        detected = {}
        for col_key, aliases in column_mapping.items():
            for col in df.columns:
                if col.lower() in [a.lower() for a in aliases]:
                    detected[col_key] = col
                    break

        sample_rows = df.head(3).to_dict('records')

        return ParsePreviewResponse(
            rows_count=len(df),
            columns_count=len(df.columns),
            sample_rows=sample_rows,
            column_mapping=detected,
        )

    except Exception as e:
        logger.error(f"Parse error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

# POST /passwords/bulk-import - Bulk import
@router.post("/bulk-import", response_model=BulkImportResponse)
async def bulk_import(
    file: UploadFile = File(...),
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Bulk import password entries from file"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        imported = 0
        skipped = 0
        errors = 0
        error_details = []

        for idx, row in df.iterrows():
            try:
                # Extract data
                portal_name = row.get('Portal Name') or row.get('Portal')
                username = row.get('Username') or row.get('Email')
                password = row.get('Password') or row.get('Pass')

                if not portal_name or not username:
                    skipped += 1
                    continue

                # Check duplicate
                existing = db.execute(
                    select(PasswordEntry).where(
                        and_(
                            PasswordEntry.user_id == current_user.id,
                            PasswordEntry.portal_name == portal_name,
                            PasswordEntry.username == username,
                        )
                    )
                ).scalar()

                if existing:
                    skipped += 1
                    continue

                # Create entry
                entry = PasswordEntry(
                    user_id=current_user.id,
                    portal_name=str(portal_name),
                    portal_type=str(row.get('Portal Type', 'OTHER')),
                    username=str(username),
                    password_encrypted=PasswordEncryption.encrypt(str(password or "")),
                    has_password=bool(password),
                    department=str(row.get('Department', 'OTHER')),
                    holder_type=str(row.get('Holder Type', 'COMPANY')),
                    holder_name=row.get('Holder Name'),
                    client_name=row.get('Client Name'),
                    notes=row.get('Notes'),
                )

                db.add(entry)
                imported += 1

            except Exception as e:
                errors += 1
                error_details.append(f"Row {idx + 1}: {str(e)}")

        db.commit()

        return BulkImportResponse(
            imported=imported,
            skipped=skipped,
            errors=errors,
            error_details=error_details if error_details else None,
        )

    except Exception as e:
        logger.error(f"Import error: {e}")
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

# GET /passwords/download-template - Download template
@router.get("/download-template")
async def download_template():
    """Download Excel template for bulk import"""
    try:
        wb = Workbook()
        ws = wb.active
        ws.title = "Passwords"

        # Headers
        headers = [
            'Portal Name', 'Portal Type', 'URL', 'Username', 'Password',
            'Department', 'Holder Type', 'Holder Name', 'Holder PAN', 'Holder DIN',
            'Mobile', 'Trade Name', 'Client Name', 'Client ID', 'Notes'
        ]

        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col)
            cell.value = header
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="1F6FB2", end_color="1F6FB2", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # Sample row
        sample = [
            'GST Portal', 'GST', 'https://gst.gov.in', 'user@email.com', 'password123',
            'GST', 'COMPANY', 'Company Name', 'ABCDE1234F', '',
            '+91 9876543210', 'Trade Name', 'Client Corp', 'CLI001', 'Sample entry'
        ]

        for col, value in enumerate(sample, 1):
            cell = ws.cell(row=2, column=col)
            cell.value = value
            cell.alignment = Alignment(horizontal="left", vertical="center")

        # Column widths
        ws.column_dimensions['A'].width = 20
        ws.column_dimensions['B'].width = 15
        ws.column_dimensions['C'].width = 25
        ws.column_dimensions['D'].width = 20
        ws.column_dimensions['E'].width = 15

        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        return FileResponse(
            iter([output.getvalue()]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="password-template.xlsx"
        )

    except Exception as e:
        logger.error(f"Template download error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate template")

# GET /passwords/admin/stats - Admin statistics
@router.get("/admin/stats", response_model=StatsResponse)
async def admin_stats(
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Get admin statistics"""
    if not await _is_admin(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        total = db.execute(
            select(func.count(PasswordEntry.id)).where(PasswordEntry.is_archived == False)
        ).scalar() or 0

        by_portal = db.execute(
            select(PasswordEntry.portal_type, func.count(PasswordEntry.id))
            .where(PasswordEntry.is_archived == False)
            .group_by(PasswordEntry.portal_type)
        ).all()

        by_dept = db.execute(
            select(PasswordEntry.department, func.count(PasswordEntry.id))
            .where(PasswordEntry.is_archived == False)
            .group_by(PasswordEntry.department)
        ).all()

        by_holder = db.execute(
            select(PasswordEntry.holder_type, func.count(PasswordEntry.id))
            .where(PasswordEntry.is_archived == False)
            .group_by(PasswordEntry.holder_type)
        ).all()

        total_logs = db.execute(
            select(func.count(AccessLog.id))
        ).scalar() or 0

        return StatsResponse(
            total=total,
            by_portal_type={row[0]: row[1] for row in by_portal},
            by_department={row[0]: row[1] for row in by_dept},
            by_holder_type={row[0]: row[1] for row in by_holder},
            total_access_logs=total_logs,
            last_updated=datetime.utcnow(),
        )

    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# GET /passwords/admin/access-logs - Admin access logs
@router.get("/admin/access-logs", response_model=List[AccessLogResponse])
async def admin_access_logs(
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Get admin access logs"""
    if not await _is_admin(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        logs = db.execute(
            select(AccessLog)
            .order_by(desc(AccessLog.timestamp))
            .offset(skip)
            .limit(limit)
        ).scalars().all()

        return [
            AccessLogResponse(
                id=log.id,
                user_id=log.user_id,
                entry_id=log.entry_id,
                action=log.action,
                timestamp=log.timestamp,
                ip_address=log.ip_address,
            )
            for log in logs
        ]

    except Exception as e:
        logger.error(f"Access logs error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# GET /passwords/portal-types - Portal type constants
@router.get("/portal-types")
async def get_portal_types():
    """Get available portal types"""
    return {
        'types': [e.value for e in PortalTypeEnum],
        'departments': [e.value for e in DepartmentEnum],
        'holder_types': [e.value for e in HolderTypeEnum],
    }

# GET /passwords/clients-list - Clients list
@router.get("/clients-list")
async def get_clients_list(
    db: Session = Depends(lambda: None),
    current_user = Depends(lambda: None),
):
    """Get unique clients"""
    try:
        clients = db.execute(
            select(PasswordEntry.client_id, PasswordEntry.client_name)
            .where(
                and_(
                    PasswordEntry.user_id == current_user.id,
                    PasswordEntry.client_name.isnot(None),
                    PasswordEntry.is_archived == False
                )
            )
            .distinct()
        ).all()

        return [{'id': c[0], 'name': c[1]} for c in clients if c[0]]

    except Exception as e:
        logger.error(f"Clients list error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
