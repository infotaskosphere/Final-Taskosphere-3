"""
ROC Sphere — Companies Act (India) compliance & document automation module.

Self-contained backend router. Nothing here is imported by any other
existing module, so dropping this file into backend/ does not touch any
existing behaviour. It is wired into the app with exactly two lines in
server.py (see INTEGRATION.md):

    from backend.roc_sphere import router as roc_sphere_router
    api_router.include_router(roc_sphere_router)

Covers:
  - Company master (linked to an existing Client, or standalone)
  - Directors / shareholders register
  - Upload & best-effort parse of AOC-4 / MGT-7 (PDF) and MGT-7A / master
    data (Excel/CSV) to prefill the company master
  - Companies Act 2013 compliance checklist engine (heuristic, based on
    company category/size — see COMPLIANCE_RULES below)
  - Word (.docx) generation for: Board Resolution, Notice of Meeting
    (Board/EGM/AGM), Minutes of Meeting (Board/General), Register of
    Members / List of Shareholders, and a printable Compliance Checklist

IMPORTANT — legal disclaimer baked into the product, not just this
comment: MCA thresholds and formats change (e.g. the "small company"
paid-up capital/turnover limits were revised effective 1 Dec 2025). The
checklist engine is a drafting aid, not a substitute for a professional's
judgement, and COMPLIANCE_RULES should be reviewed periodically against
the current Companies Act / MCA rules.
"""

import io
import logging
import re
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, ConfigDict

from backend.dependencies import db, get_current_user, check_module_permission
from backend.models import User

# Permission flags used here (see backend/models.py DEFAULT_ROLE_PERMISSIONS
# and backend/dependencies.py MODULE_ACTION_MAP):
#   can_view_roc_sphere   — open the page, view company masters/checklist,
#                            generate & download documents
#   can_manage_roc_sphere — create/edit/delete company masters, upload
#                            AOC-4/MGT-7 to prefill them
# Admin-granted-only by default (same pattern as GST Reconciliation,
# Trademark Sphere and the Salary Slip Generator) — toggled per-user from
# Settings → Permission Governance → Compliance → "ROC Sphere".
VIEW = check_module_permission("roc_sphere", "view")
CREATE = check_module_permission("roc_sphere", "create")
EDIT = check_module_permission("roc_sphere", "edit")
DELETE = check_module_permission("roc_sphere", "delete")

logger = logging.getLogger("roc_sphere")
router = APIRouter(prefix="/roc-sphere", tags=["roc-sphere"])

COMPANIES = db.roc_companies
DOCS_LOG = db.roc_documents
CLIENTS = db.clients

COMPANY_CLIENT_TYPES = {"pvt_ltd", "PVT_LTD", "public_ltd", "section_8", "llp", "LLP", "opc"}


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _who(user: User) -> str:
    return getattr(user, "full_name", None) or getattr(user, "username", None) or "—"


def _fmt_date(v: Any) -> str:
    if not v:
        return "—"
    if isinstance(v, (datetime, date)):
        return v.strftime("%d-%m-%Y")
    s = str(v)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).strftime("%d-%m-%Y")
        except ValueError:
            continue
    return s


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ─────────────────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────────────────

class Director(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    din: Optional[str] = None
    designation: Optional[str] = "Director"  # Director / Managing Director / Whole-time Director / Additional Director
    date_of_appointment: Optional[str] = None
    date_of_cessation: Optional[str] = None
    pan: Optional[str] = None
    address: Optional[str] = None


class Shareholder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    folio_no: Optional[str] = None
    pan: Optional[str] = None
    class_of_shares: Optional[str] = "Equity"
    shares_held: float = 0
    face_value: Optional[float] = 10
    percentage: Optional[float] = None
    address: Optional[str] = None


class Auditor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    firm_reg_no: Optional[str] = None
    membership_no: Optional[str] = None
    appointed_from: Optional[str] = None
    appointed_till: Optional[str] = None


class RocCompanyIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_id: Optional[str] = None
    company_name: str
    cin: Optional[str] = None
    category: str = "private"          # private | public | opc | section_8
    is_small_company: Optional[bool] = None   # None = auto-compute from capital/turnover
    listed: bool = False
    roc_office: Optional[str] = None
    pan: Optional[str] = None
    date_of_incorporation: Optional[str] = None
    registered_office_address: Optional[str] = None
    authorized_capital: Optional[float] = 0
    paid_up_capital: Optional[float] = 0
    last_year_turnover: Optional[float] = 0
    financial_year_end: Optional[str] = "31-03"
    last_agm_date: Optional[str] = None
    last_board_meeting_date: Optional[str] = None
    directors: List[Director] = Field(default_factory=list)
    shareholders: List[Shareholder] = Field(default_factory=list)
    auditor: Optional[Auditor] = None
    notes: Optional[str] = None


class RocCompanyOut(RocCompanyIn):
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None


class ResolutionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    particulars: str                 # short heading, e.g. "Opening of Bank Account"
    resolution_text: str             # the "RESOLVED THAT ..." body
    proposed_by: Optional[str] = None
    seconded_by: Optional[str] = None


class BoardResolutionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    meeting_date: str
    meeting_time: Optional[str] = "11:00 AM"
    venue: Optional[str] = "Registered Office of the Company"
    directors_present: List[str] = Field(default_factory=list)
    chairman: Optional[str] = None
    resolutions: List[ResolutionItem]


class MeetingNoticeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    meeting_type: str = "board"      # board | agm | egm
    meeting_date: str
    meeting_time: Optional[str] = "11:00 AM"
    venue: Optional[str] = "Registered Office of the Company"
    notice_date: Optional[str] = None
    agenda_items: List[str] = Field(default_factory=list)
    special_business: List[ResolutionItem] = Field(default_factory=list)


class MinutesRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    meeting_type: str = "board"      # board | agm | egm
    meeting_date: str
    meeting_time: Optional[str] = "11:00 AM"
    venue: Optional[str] = "Registered Office of the Company"
    chairman: Optional[str] = None
    directors_present: List[str] = Field(default_factory=list)
    directors_absent: List[str] = Field(default_factory=list)
    attendees_other: List[str] = Field(default_factory=list)
    quorum_present: bool = True
    resolutions: List[ResolutionItem] = Field(default_factory=list)
    discussion_notes: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────
# COMPANY MASTER — CRUD
# ─────────────────────────────────────────────────────────────────────────

@router.get("/clients-eligible")
async def list_eligible_clients(current_user: User = Depends(VIEW)):
    """Clients that are registered entities (not proprietors) and don't yet
    have a ROC Sphere company master — used to populate the 'create from
    client' picker."""
    cursor = CLIENTS.find({"client_type": {"$in": list(COMPANY_CLIENT_TYPES)}})
    clients = [c async for c in cursor]
    existing = {c["client_id"] async for c in COMPANIES.find({"client_id": {"$ne": None}}, {"client_id": 1}) if c.get("client_id")}
    out = []
    for c in clients:
        if c.get("id") in existing:
            continue
        out.append({
            "client_id": c.get("id"),
            "company_name": c.get("company_name"),
            "client_type": c.get("client_type"),
            "pan": c.get("pan"),
            "date_of_incorporation": c.get("date_of_incorporation"),
            "address": c.get("address"),
        })
    return out


@router.get("/companies")
async def list_companies(
    q: Optional[str] = Query(None),
    current_user: User = Depends(VIEW),
):
    query: Dict[str, Any] = {}
    if q:
        query["company_name"] = {"$regex": re.escape(q), "$options": "i"}
    cursor = COMPANIES.find(query).sort("company_name", 1)
    items = [c async for c in cursor]
    for c in items:
        c.pop("_id", None)
    return items


@router.get("/companies/{company_id}")
async def get_company(company_id: str, current_user: User = Depends(VIEW)):
    c = await COMPANIES.find_one({"id": company_id})
    if not c:
        raise HTTPException(404, "Company not found")
    c.pop("_id", None)
    return c


@router.post("/companies")
async def create_company(payload: RocCompanyIn, current_user: User = Depends(CREATE)):
    now = _now()
    doc = payload.model_dump()
    doc["id"] = _uid()
    doc["created_at"] = now
    doc["updated_at"] = now
    doc["created_by"] = _who(current_user)
    await COMPANIES.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/companies/{company_id}")
async def update_company(company_id: str, payload: RocCompanyIn, current_user: User = Depends(EDIT)):
    existing = await COMPANIES.find_one({"id": company_id})
    if not existing:
        raise HTTPException(404, "Company not found")
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    await COMPANIES.update_one({"id": company_id}, {"$set": doc})
    merged = {**existing, **doc}
    merged.pop("_id", None)
    return merged


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, current_user: User = Depends(DELETE)):
    res = await COMPANIES.delete_one({"id": company_id})
    if not res.deleted_count:
        raise HTTPException(404, "Company not found")
    await DOCS_LOG.delete_many({"company_id": company_id})
    return {"deleted": True}


# ─────────────────────────────────────────────────────────────────────────
# AOC-4 / MGT-7 UPLOAD → BEST-EFFORT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────
# MCA AOC-4/MGT-7 acknowledgement PDFs and the pre-fill XLSX ("master
# data") export all have fairly consistent label:value layouts. This is a
# heuristic text-scrape (same approach as backend/compliance.py's
# parse_compliance_dates), not an XBRL parser — it prefills the form,
# the user always reviews before saving.

FIELD_PATTERNS = {
    "cin": r"CIN[:\s]*([A-Z0-9]{21})",
    "company_name": r"(?:Name of (?:the )?[Cc]ompany|Company Name)[:\s]*([A-Za-z0-9 &.,'\-]{3,120})",
    "date_of_incorporation": r"Date of [Ii]ncorporation[:\s]*([0-3]?\d[-/][01]?\d[-/]\d{2,4})",
    "registered_office_address": r"Registered [Oo]ffice [Aa]ddress[:\s]*([A-Za-z0-9,./\- ]{10,200})",
    "authorized_capital": r"Authoris?ed [Cc]apital[:\s(Rs\.)]*([\d,]+)",
    "paid_up_capital": r"Paid[- ]up [Cc]apital[:\s(Rs\.)]*([\d,]+)",
    "last_year_turnover": r"Turnover[:\s(Rs\.)]*([\d,]+)",
    "last_agm_date": r"Date of [Aa][Gg][Mm][:\s]*([0-3]?\d[-/][01]?\d[-/]\d{2,4})",
    "last_board_meeting_date": r"Date of [Bb]oard [Mm]eeting[:\s]*([0-3]?\d[-/][01]?\d[-/]\d{2,4})",
    "pan": r"PAN[:\s]*([A-Z]{5}\d{4}[A-Z])",
}


def _extract_text_from_upload(filename: str, raw: bytes) -> str:
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            import pdfplumber
            text_parts = []
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                for page in pdf.pages[:10]:
                    text_parts.append(page.extract_text() or "")
            return "\n".join(text_parts)
        if name.endswith((".xlsx", ".xls")):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
            lines = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    lines.append(" ".join(str(c) for c in row if c is not None))
            return "\n".join(lines)
        if name.endswith(".csv"):
            return raw.decode("utf-8", errors="ignore")
        # last resort — try utf-8 text
        return raw.decode("utf-8", errors="ignore")
    except Exception as e:  # pragma: no cover
        logger.warning("roc_sphere: text extraction failed for %s: %s", filename, e)
        return ""


def parse_master_data(filename: str, raw: bytes) -> Dict[str, Any]:
    text = _extract_text_from_upload(filename, raw)
    extracted: Dict[str, Any] = {}
    for field, pattern in FIELD_PATTERNS.items():
        m = re.search(pattern, text)
        if not m:
            continue
        val = m.group(1).strip().rstrip(",")
        if field in ("authorized_capital", "paid_up_capital", "last_year_turnover"):
            val = _num(val.replace(",", ""))
        extracted[field] = val
    extracted["_source_file"] = filename
    extracted["_chars_scanned"] = len(text)
    return extracted


@router.post("/companies/{company_id}/upload-master-data")
async def upload_master_data(
    company_id: str,
    file: UploadFile = File(...),
    apply: bool = Form(False),
    current_user: User = Depends(CREATE),
):
    """Upload an AOC-4 / MGT-7 / MGT-7A acknowledgement PDF or an MCA
    master-data Excel export. Returns the fields it could confidently
    extract. Pass apply=true to merge them straight into the company
    master (only non-empty extracted fields are written)."""
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(400, "File too large (15MB limit)")
    extracted = parse_master_data(file.filename, raw)
    if not any(k for k in extracted if not k.startswith("_")):
        return {
            "extracted": {},
            "applied": False,
            "message": "Could not confidently extract fields from this file — please enter details manually.",
        }
    if apply:
        clean = {k: v for k, v in extracted.items() if not k.startswith("_") and v}
        clean["updated_at"] = _now()
        await COMPANIES.update_one({"id": company_id}, {"$set": clean})
    return {"extracted": extracted, "applied": bool(apply)}


# ─────────────────────────────────────────────────────────────────────────
# COMPLIANCE CHECKLIST ENGINE
# ─────────────────────────────────────────────────────────────────────────
# Heuristic, config-driven so it's easy to keep current. Review
# thresholds against the latest MCA notifications periodically —
# "small company" limits were last revised (paid-up ≤ Rs 10 cr, turnover
# ≤ Rs 100 cr) with effect from 1 Dec 2025.

SMALL_CO_PAID_UP_LIMIT = 10_00_00_000     # Rs 10 crore
SMALL_CO_TURNOVER_LIMIT = 100_00_00_000   # Rs 100 crore


def _is_small_company(company: Dict[str, Any]) -> bool:
    if company.get("is_small_company") is not None:
        return bool(company["is_small_company"])
    if company.get("category") in ("public", "section_8"):
        return False
    paid_up = _num(company.get("paid_up_capital"))
    turnover = _num(company.get("last_year_turnover"))
    return paid_up <= SMALL_CO_PAID_UP_LIMIT and turnover <= SMALL_CO_TURNOVER_LIMIT


def build_compliance_checklist(company: Dict[str, Any]) -> List[Dict[str, Any]]:
    category = company.get("category", "private")
    is_opc = category == "opc"
    is_small = _is_small_company(company)
    is_section8 = category == "section_8"
    num_directors = len(company.get("directors") or [])

    items: List[Dict[str, Any]] = []

    def add(form, particulars, due, frequency, applicable=True, notes=None):
        items.append({
            "form": form,
            "particulars": particulars,
            "due_date_rule": due,
            "frequency": frequency,
            "applicable": applicable,
            "notes": notes,
        })

    # Annual filings
    add("AOC-4" + (" (XBRL)" if company.get("listed") else ""), "Filing of Financial Statements", "Within 30 days of AGM", "Annual")
    add("MGT-7A" if is_small or is_opc else "MGT-7", "Annual Return", "Within 60 days of AGM", "Annual")
    add("ADT-1", "Appointment/Ratification of Statutory Auditor", "Within 15 days of AGM (on appointment)", "As applicable")
    add("DIR-3 KYC", "KYC of every Director holding a DIN", "By 30th September every year", "Annual", applicable=num_directors > 0)
    add("DPT-3", "Return of Deposits / particulars of transactions not treated as deposits", "By 30th June every year", "Annual")
    add("MSME-1", "Half-yearly return of outstanding dues to Micro & Small Enterprises", "29th April & 31st October", "Half-Yearly")

    # Meetings
    if not is_opc:
        add("AGM", "Annual General Meeting", "Within 6 months of FY end (9 months for first AGM); gap between two AGMs ≤ 15 months", "Annual", applicable=not is_opc)
    board_meetings_required = 2 if (is_small or is_opc) else 4
    add("Board Meeting", f"Minimum {board_meetings_required} Board Meetings in a calendar year, gap ≤ 120 days between two meetings",
        "Ongoing", "Quarterly" if board_meetings_required == 4 else "Half-Yearly")

    # Registers / compliance
    add("MBP-1", "Director's disclosure of interest in other entities", "First Board Meeting of the FY / on change", "Annual + event-based")
    add("DIR-8", "Director's declaration of non-disqualification", "First Board Meeting of the FY", "Annual")
    add("Register of Members / Charges / Directors", "Statutory registers to be maintained & kept updated", "Ongoing", "Ongoing")
    add("CSR-2", "Report on CSR", "As notified (with AOC-4 or separately)", "Annual",
        applicable=_num(company.get("paid_up_capital")) >= 5_00_00_000 or _num(company.get("last_year_turnover")) >= 100_00_00_000,
        notes="Applicable only if CSR provisions (Sec 135) trigger — verify against latest profit criterion too.")

    if is_section8:
        add("CSR-1", "Registration for undertaking CSR activities (if applicable)", "Before undertaking CSR work", "One-time", notes="Section 8 company specific")

    if company.get("category") == "public" or company.get("listed"):
        add("MGT-14", "Filing of certain Board/Special resolutions with ROC", "Within 30 days of passing", "Event-based")

    add("PAS-6", "Reconciliation of Share Capital Audit Report (unlisted companies with dematerialised shares)", "Within 60 days of half-year end", "Half-Yearly", applicable=not is_opc and not is_section8)

    return items


@router.get("/companies/{company_id}/compliance-checklist")
async def get_compliance_checklist(company_id: str, current_user: User = Depends(VIEW)):
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    checklist = build_compliance_checklist(company)
    return {
        "company_name": company.get("company_name"),
        "category": company.get("category"),
        "is_small_company": _is_small_company(company),
        "checklist": checklist,
        "generated_at": _now().isoformat(),
        "disclaimer": (
            "Generated from company category/capital/turnover using current "
            "Companies Act 2013 thresholds as configured in the app. Verify "
            "against the latest MCA notifications before relying on it for filing."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────
# DOCX GENERATION
# ─────────────────────────────────────────────────────────────────────────

def _base_doc():
    from docx import Document
    from docx.shared import Pt
    document = Document()
    style = document.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)
    sections = document.sections
    for s in sections:
        s.top_margin = s.bottom_margin = s.left_margin = s.right_margin = document.sections[0].left_margin
    return document


def _heading(document, text, size=14, center=True, bold=True, underline=False):
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    p = document.add_paragraph()
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.bold = bold
    run.underline = underline
    run.font.size = Pt(size)
    return p


def _para(document, text, center=False, bold=False, italic=False):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    p = document.add_paragraph()
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    return p


def build_board_resolution_doc(company: Dict[str, Any], req: BoardResolutionRequest, prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    cin = company.get("cin") or "—"
    _heading(d, name, size=16)
    _para(d, f"CIN: {cin}", center=True)
    _para(d, f"Registered Office: {company.get('registered_office_address') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, "EXTRACT OF MINUTES / CERTIFIED TRUE COPY OF RESOLUTION(S)", size=13)
    _para(
        d,
        f"Passed at the meeting of the Board of Directors of the Company held on "
        f"{_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}."
    )
    if req.directors_present:
        _para(d, "Directors Present: " + ", ".join(req.directors_present))
    if req.chairman:
        _para(d, f"Chairman of the Meeting: {req.chairman}")
    d.add_paragraph()

    for i, r in enumerate(req.resolutions, 1):
        _para(d, f"{i}. {r.particulars}", bold=True)
        _para(d, f'"RESOLVED THAT {r.resolution_text.strip().rstrip(".")}."')
        if r.proposed_by or r.seconded_by:
            bits = []
            if r.proposed_by:
                bits.append(f"Proposed by: {r.proposed_by}")
            if r.seconded_by:
                bits.append(f"Seconded by: {r.seconded_by}")
            _para(d, "   " + " | ".join(bits), italic=True)
        d.add_paragraph()

    _para(d, "\nCertified True Copy")
    d.add_paragraph()
    _para(d, "For " + name, bold=True)
    d.add_paragraph()
    d.add_paragraph()
    _para(d, "Director / Company Secretary")
    _para(d, f"DIN/Membership No.: __________________")
    _para(d, f"Date: {_fmt_date(datetime.now())}", )
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_notice_doc(company: Dict[str, Any], req: MeetingNoticeRequest, prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    label = {"board": "NOTICE OF BOARD MEETING", "agm": "NOTICE OF ANNUAL GENERAL MEETING", "egm": "NOTICE OF EXTRA-ORDINARY GENERAL MEETING"}.get(req.meeting_type, "NOTICE OF MEETING")
    _heading(d, name, size=16)
    _para(d, f"CIN: {company.get('cin') or '—'}", center=True)
    _para(d, f"Registered Office: {company.get('registered_office_address') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, label, size=13, underline=True)
    _para(d, f"Notice dated: {_fmt_date(req.notice_date or datetime.now())}")
    d.add_paragraph()
    if req.meeting_type == "board":
        _para(d, f"NOTICE is hereby given that a meeting of the Board of Directors of the Company will be held on "
                 f"{_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}, to transact the following business:")
    else:
        _para(d, f"NOTICE is hereby given that the {label.split('OF ')[-1].title()} of the members of the Company will be held on "
                 f"{_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}, to transact the following business:")
    d.add_paragraph()
    if req.agenda_items:
        _para(d, "ORDINARY BUSINESS / AGENDA:", bold=True)
        for i, item in enumerate(req.agenda_items, 1):
            _para(d, f"{i}. {item}")
        d.add_paragraph()
    if req.special_business:
        _para(d, "SPECIAL BUSINESS:", bold=True)
        for i, r in enumerate(req.special_business, 1):
            _para(d, f"{i}. {r.particulars}", bold=True)
            _para(d, f'"RESOLVED THAT {r.resolution_text.strip().rstrip(".")}."')
        d.add_paragraph()

    if req.meeting_type != "board":
        _para(d, "NOTES:", bold=True)
        _para(d, "1. A member entitled to attend and vote is entitled to appoint a proxy to attend and vote instead of "
                 "himself/herself, and such proxy need not be a member of the Company.")
        _para(d, "2. Proxies, in order to be effective, must be received at the Registered Office not less than 48 hours "
                 "before the commencement of the meeting.")
    d.add_paragraph()
    _para(d, "By Order of the Board")
    _para(d, "For " + name, bold=True)
    d.add_paragraph()
    _para(d, "Director / Company Secretary")
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_minutes_doc(company: Dict[str, Any], req: MinutesRequest, prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    label = {"board": "MINUTES OF THE MEETING OF THE BOARD OF DIRECTORS", "agm": "MINUTES OF THE ANNUAL GENERAL MEETING", "egm": "MINUTES OF THE EXTRA-ORDINARY GENERAL MEETING"}.get(req.meeting_type, "MINUTES OF MEETING")
    _heading(d, name, size=16)
    _para(d, f"CIN: {company.get('cin') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, label, size=13, underline=True)
    _para(d, f"Held on {_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}.")
    d.add_paragraph()
    if req.meeting_type == "board":
        _para(d, "Directors Present: " + (", ".join(req.directors_present) or "—"))
        if req.directors_absent:
            _para(d, "Directors Absent (Leave of Absence granted): " + ", ".join(req.directors_absent))
    else:
        _para(d, "Directors Present: " + (", ".join(req.directors_present) or "—"))
        if req.attendees_other:
            _para(d, "Members / Attendees Present: " + ", ".join(req.attendees_other))
    if req.chairman:
        _para(d, f"{req.chairman} chaired the meeting.")
    _para(d, "Quorum was confirmed to be present." if req.quorum_present else "NOTE: Quorum was NOT present — meeting stands adjourned as per Companies Act / AoA provisions.")
    d.add_paragraph()

    if req.discussion_notes:
        _para(d, "DISCUSSION:", bold=True)
        _para(d, req.discussion_notes)
        d.add_paragraph()

    if req.resolutions:
        _para(d, "RESOLUTIONS PASSED:", bold=True)
        for i, r in enumerate(req.resolutions, 1):
            _para(d, f"{i}. {r.particulars}", bold=True)
            _para(d, f'"RESOLVED THAT {r.resolution_text.strip().rstrip(".")}."')
            d.add_paragraph()

    _para(d, "There being no other business, the meeting concluded with a vote of thanks to the Chair.")
    d.add_paragraph()
    d.add_paragraph()
    _para(d, "Chairman", bold=True)
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_shareholders_doc(company: Dict[str, Any], prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    _heading(d, name, size=16)
    _para(d, f"CIN: {company.get('cin') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, "REGISTER OF MEMBERS / LIST OF SHAREHOLDERS", size=13, underline=True)
    _para(d, f"As on: {_fmt_date(datetime.now())}")
    d.add_paragraph()

    shareholders = company.get("shareholders") or []
    total_shares = sum(_num(s.get("shares_held")) for s in shareholders) or 1

    table = d.add_table(rows=1, cols=6)
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(["Sl. No.", "Name of Member", "Folio No. / PAN", "Class of Shares", "No. of Shares Held", "% Holding"]):
        hdr[i].text = ""
        hdr[i].paragraphs[0].add_run(h).bold = True

    for idx, s in enumerate(shareholders, 1):
        row = table.add_row().cells
        pct = s.get("percentage")
        if pct is None:
            pct = round(_num(s.get("shares_held")) / total_shares * 100, 2)
        row[0].text = str(idx)
        row[1].text = s.get("name", "")
        row[2].text = " / ".join(filter(None, [s.get("folio_no"), s.get("pan")])) or "—"
        row[3].text = s.get("class_of_shares") or "Equity"
        row[4].text = f"{_num(s.get('shares_held')):,.0f}"
        row[5].text = f"{pct}%"

    d.add_paragraph()
    _para(d, f"Total Paid-up Share Capital: Rs. {_num(company.get('paid_up_capital')):,.0f}", bold=True)
    _para(d, f"Authorized Share Capital: Rs. {_num(company.get('authorized_capital')):,.0f}", bold=True)
    d.add_paragraph()
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_checklist_doc(company: Dict[str, Any], checklist: List[Dict[str, Any]], prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    _heading(d, name, size=16)
    _para(d, f"CIN: {company.get('cin') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, "ROC / COMPANIES ACT, 2013 — COMPLIANCE CHECKLIST", size=13, underline=True)
    _para(d, f"Generated on: {_fmt_date(datetime.now())}")
    d.add_paragraph()

    table = d.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(["Form / Item", "Particulars", "Due Date Rule", "Frequency", "Applicable"]):
        hdr[i].text = ""
        hdr[i].paragraphs[0].add_run(h).bold = True
    for item in checklist:
        row = table.add_row().cells
        row[0].text = item["form"]
        row[1].text = item["particulars"] + (f" ({item['notes']})" if item.get("notes") else "")
        row[2].text = item["due_date_rule"]
        row[3].text = item["frequency"]
        row[4].text = "Yes" if item["applicable"] else "No"

    d.add_paragraph()
    _para(d, "This checklist is a drafting aid generated from the company's category, capital and turnover as "
             "recorded in Taskosphere. Please verify against the latest MCA notifications before filing.", italic=True)
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _docx_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


def _safe(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", text or "").strip("_") or "Document"


async def _log_doc(company_id: str, doc_type: str, filename: str, user: User):
    await DOCS_LOG.insert_one({
        "id": _uid(),
        "company_id": company_id,
        "doc_type": doc_type,
        "filename": filename,
        "generated_at": _now(),
        "generated_by": _who(user),
    })


@router.post("/companies/{company_id}/generate/board-resolution")
async def generate_board_resolution(company_id: str, req: BoardResolutionRequest, current_user: User = Depends(VIEW)):
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    try:
        content = build_board_resolution_doc(company, req, _who(current_user))
    except ImportError as e:
        raise HTTPException(500, f"Document generator not installed on the server: {e}")
    fname = f"Board_Resolution_{_safe(company.get('company_name'))}_{_safe(req.meeting_date)}.docx"
    await _log_doc(company_id, "board_resolution", fname, current_user)
    return _docx_response(content, fname)


@router.post("/companies/{company_id}/generate/notice")
async def generate_notice(company_id: str, req: MeetingNoticeRequest, current_user: User = Depends(VIEW)):
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    try:
        content = build_notice_doc(company, req, _who(current_user))
    except ImportError as e:
        raise HTTPException(500, f"Document generator not installed on the server: {e}")
    fname = f"Notice_{req.meeting_type.upper()}_{_safe(company.get('company_name'))}_{_safe(req.meeting_date)}.docx"
    await _log_doc(company_id, f"notice_{req.meeting_type}", fname, current_user)
    return _docx_response(content, fname)


@router.post("/companies/{company_id}/generate/minutes")
async def generate_minutes(company_id: str, req: MinutesRequest, current_user: User = Depends(VIEW)):
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    try:
        content = build_minutes_doc(company, req, _who(current_user))
    except ImportError as e:
        raise HTTPException(500, f"Document generator not installed on the server: {e}")
    fname = f"Minutes_{req.meeting_type.upper()}_{_safe(company.get('company_name'))}_{_safe(req.meeting_date)}.docx"
    await _log_doc(company_id, f"minutes_{req.meeting_type}", fname, current_user)
    return _docx_response(content, fname)


@router.get("/companies/{company_id}/generate/shareholders")
async def generate_shareholders(company_id: str, current_user: User = Depends(VIEW)):
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    try:
        content = build_shareholders_doc(company, _who(current_user))
    except ImportError as e:
        raise HTTPException(500, f"Document generator not installed on the server: {e}")
    fname = f"Shareholders_{_safe(company.get('company_name'))}.docx"
    await _log_doc(company_id, "shareholders", fname, current_user)
    return _docx_response(content, fname)


@router.get("/companies/{company_id}/generate/checklist")
async def generate_checklist_doc(company_id: str, current_user: User = Depends(VIEW)):
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    checklist = build_compliance_checklist(company)
    try:
        content = build_checklist_doc(company, checklist, _who(current_user))
    except ImportError as e:
        raise HTTPException(500, f"Document generator not installed on the server: {e}")
    fname = f"Compliance_Checklist_{_safe(company.get('company_name'))}.docx"
    await _log_doc(company_id, "checklist", fname, current_user)
    return _docx_response(content, fname)


@router.get("/companies/{company_id}/documents")
async def list_generated_documents(company_id: str, current_user: User = Depends(VIEW)):
    cursor = DOCS_LOG.find({"company_id": company_id}).sort("generated_at", -1)
    items = [x async for x in cursor]
    for x in items:
        x.pop("_id", None)
    return items
