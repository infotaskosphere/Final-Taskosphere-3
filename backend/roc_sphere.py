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
    category: str = "private"          # private | public | opc | section_8 | llp
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
    designated_partners: List[Director] = Field(default_factory=list)
    partners: List[Director] = Field(default_factory=list)
    shareholders: List[Shareholder] = Field(default_factory=list)
    master_data: Dict[str, Any] = Field(default_factory=dict)
    mgt_shareholder_data: Dict[str, Any] = Field(default_factory=dict)
    financial_data: Dict[str, Any] = Field(default_factory=dict)  # key figures pulled from AOC-4 (see FINANCIAL_DATA_FIELDS)
    roc_form_uploads: List[Dict[str, Any]] = Field(default_factory=list)
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


CLIENT_CATEGORY_MAP = {
    "pvt_ltd": "private", "PVT_LTD": "private",
    "public_ltd": "public",
    "section_8": "section_8",
    "llp": "llp", "LLP": "llp",
    "opc": "opc",
}


async def _sync_companies_from_clients() -> int:
    """Auto-provision a ROC Sphere company master for every Client record
    that is a registered entity (Pvt/Public Ltd, LLP, OPC, Section 8) and
    doesn't have one yet, prefilled from that client's CIN/PAN/address/
    incorporation date. Existing ROC Sphere records (and anything a user
    has since edited on them) are never touched -- this only fills the gap
    for clients that have no linked record at all. Returns count created.
    """
    cursor = CLIENTS.find({"client_type": {"$in": list(COMPANY_CLIENT_TYPES)}})
    clients = [c async for c in cursor]
    if not clients:
        return 0
    existing_client_ids = {
        c["client_id"]
        async for c in COMPANIES.find({"client_id": {"$ne": None}}, {"client_id": 1})
        if c.get("client_id")
    }
    now = _now()
    new_docs = []
    for c in clients:
        cid = c.get("id")
        if not cid or cid in existing_client_ids:
            continue
        contact_people = c.get("contact_persons") or []
        is_llp = c.get("client_type") in ("llp", "LLP")
        new_docs.append({
            "id": _uid(),
            "client_id": cid,
            "company_name": c.get("company_name") or "Unnamed Company",
            "cin": c.get("cin"),
            "category": CLIENT_CATEGORY_MAP.get(c.get("client_type"), "private"),
            "is_small_company": None,
            "listed": False,
            "roc_office": None,
            "pan": c.get("pan"),
            "date_of_incorporation": (str(c.get("date_of_incorporation"))[:10] if c.get("date_of_incorporation") else None),
            "registered_office_address": c.get("address"),
            "authorized_capital": 0,
            "paid_up_capital": 0,
            "last_year_turnover": 0,
            "financial_year_end": "31-03",
            "last_agm_date": None,
            "last_board_meeting_date": None,
            "directors": [] if is_llp else contact_people,
            "designated_partners": contact_people if is_llp else [],
            "partners": contact_people if is_llp else [],
            "shareholders": [],
            "master_data": {},
            "mgt_shareholder_data": {},
            "roc_form_uploads": [],
            "auditor": None,
            "notes": None,
            "created_at": now,
            "updated_at": now,
            "created_by": "Auto-synced from Clients",
        })
    if new_docs:
        await COMPANIES.insert_many(new_docs)
    return len(new_docs)


@router.get("/companies")
async def list_companies(
    q: Optional[str] = Query(None),
    current_user: User = Depends(VIEW),
):
    await _sync_companies_from_clients()
    query: Dict[str, Any] = {}
    if q:
        query["company_name"] = {"$regex": re.escape(q), "$options": "i"}
    cursor = COMPANIES.find(query).sort("company_name", 1)
    items = [c async for c in cursor]
    for c in items:
        c.pop("_id", None)
    return items


@router.post("/companies/sync-from-clients")
async def sync_from_clients_endpoint(current_user: User = Depends(CREATE)):
    """Manual re-sync trigger (e.g. a 'Sync from Clients' button) -- same
    logic as the automatic sync on GET /companies, exposed separately so
    the UI can show how many were newly added after a bulk client import."""
    created = await _sync_companies_from_clients()
    return {"created": created}


@router.get("/companies/{company_id}")
async def get_company(company_id: str, current_user: User = Depends(VIEW)):
    c = await COMPANIES.find_one({"id": company_id})
    if not c:
        raise HTTPException(404, "Company not found")
    # Client contact persons are the source for the initial ROC people list.
    # Preserve any richer ROC edits, but backfill empty registers from Client.
    if c.get("client_id"):
        client = await CLIENTS.find_one({"id": c["client_id"]}, {"_id": 0, "contact_persons": 1})
        contacts = (client or {}).get("contact_persons") or []
        if contacts:
            if c.get("category") == "llp":
                c.setdefault("designated_partners", contacts)
                c.setdefault("partners", contacts)
                if not c.get("designated_partners"):
                    c["designated_partners"] = contacts
                if not c.get("partners"):
                    c["partners"] = contacts
            elif not c.get("directors"):
                c["directors"] = contacts
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
    await _sync_company_to_client(doc)
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
    await _sync_company_to_client({**existing, **doc})
    merged = {**existing, **doc}
    merged.pop("_id", None)
    return merged


async def _sync_company_to_client(company: Dict[str, Any]) -> None:
    """Keep the linked Client as the searchable source of truth as well.

    ROC has richer role-specific records than Clients, so the compact client
    contact_persons list is populated from directors or LLP partners while
    the complete source data is retained in dedicated fields.
    """
    client_id = company.get("client_id")
    if not client_id:
        return
    is_llp = company.get("category") == "llp"
    people = (company.get("designated_partners") or []) + (company.get("partners") or []) if is_llp else (company.get("directors") or [])
    contacts = []
    for person in people:
        if not person or not person.get("name"):
            continue
        contacts.append({
            "name": person.get("name"),
            "designation": person.get("designation") or ("Designated Partner" if is_llp else "Director"),
            "din": person.get("din"),
            "pan": person.get("pan"),
            "email": person.get("email"),
            "phone": person.get("phone"),
        })
    update = {
        "company_name": company.get("company_name"),
        "pan": company.get("pan"),
        "date_of_incorporation": company.get("date_of_incorporation"),
        "address": company.get("registered_office_address"),
        "contact_persons": contacts,
        "roc_directors": company.get("directors") or [],
        "roc_designated_partners": company.get("designated_partners") or [],
        "roc_partners": company.get("partners") or [],
        "roc_shareholders": company.get("shareholders") or [],
        "roc_master_data": company.get("master_data") or {},
        "roc_mgt_shareholder_data": company.get("mgt_shareholder_data") or {},
        "roc_form_uploads": company.get("roc_form_uploads") or [],
    }
    if is_llp:
        update["llpin"] = company.get("cin")
    else:
        update["cin"] = company.get("cin")
    await CLIENTS.update_one({"id": client_id}, {"$set": update})


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, current_user: User = Depends(DELETE)):
    res = await COMPANIES.delete_one({"id": company_id})
    if not res.deleted_count:
        raise HTTPException(404, "Company not found")
    await DOCS_LOG.delete_many({"company_id": company_id})
    return {"deleted": True}


# ─────────────────────────────────────────────────────────────────────────
# AOC-4 / MGT-7 / MGT-7A / AOC-2 / Board & Auditor report UPLOAD → EXTRACTION
# ─────────────────────────────────────────────────────────────────────────
# Every MCA acknowledgement PDF is a different form with a different
# purpose, and each field extracted here is only ever pulled from the form
# that actually carries that data on the MCA record:
#
#   Company Master fields  (CIN, name, address, authorised capital,
#                            AGM date, board meeting date)
#                             — read from whichever recognised ROC form
#                               states them (present on most of AOC-4,
#                               AOC-2, MGT-7/7A, Board's/Auditor's Report)
#   Directors / KMP register — ONLY from MGT-7 / MGT-7A (the Annual Return
#                               is the filing that carries the statutory
#                               Director/Signatory register; AOC-4, AOC-2,
#                               and the Board's/Auditor's Report extracts
#                               do not, and must never populate it)
#   Shareholders register    — ONLY from MGT-7 / MGT-7A, same reasoning
#   Financial data            — ONLY from AOC-4 (Balance Sheet / P&L /
#                               Net Worth figures; AOC-2 and the Board's/
#                               Auditor's Report extracts carry no
#                               standardised financial figures worth
#                               trusting for this)
#   Statutory Auditor details — ONLY from AOC-4 (Auditor Details block)
#
# This routing is enforced by _identify_roc_form_type() below and the
# per-form-type dispatch in upload_master_data(): a field is never applied
# from a form that isn't its statutory source, so one wrong/unusual PDF in
# a batch can no longer pollute Directors & Shareholders (this replaced an
# earlier version that scanned the full text of every uploaded form for
# anything DIN/PAN-shaped, which produced garbage director rows out of
# AOC-4/AOC-2/Board & Auditor report boilerplate — see CHANGELOG below).
#
# This is a heuristic text-scrape (same approach as backend/compliance.py's
# parse_compliance_dates), not an XBRL parser — every applied field is
# still shown to the user in the "Extracted fields" preview and can be
# corrected on the Company Master / Directors & Shareholders tabs.

ROC_FORM_ALLOWED_EXT = (".pdf",)
ROC_FORM_RECOGNIZED = (
    # order matters: more specific labels (mgt-7a) must be checked before
    # their substrings (mgt-7)
    ("mgt-7a", r"mgt[- ]?7a"),
    ("mgt-7", r"mgt[- ]?7\b"),
    ("aoc-4", r"\baoc[- ]?4\b"),
    ("aoc-2", r"\baoc[- ]?2\b"),
    ("board-report", r"extract of board.?s report|board.?s report"),
    ("auditor-report", r"extract of auditor.?s report|auditor.?s report"),
    ("dir-12", r"dir[- ]?12"),
    ("adt-1", r"adt[- ]?1"),
    ("inc-22", r"inc[- ]?22"),
    ("pas-3", r"pas[- ]?3"),
    ("mgt-14", r"mgt[- ]?14"),
    ("dpt-3", r"dpt[- ]?3"),
)

# Forms whose MCA-prescribed content includes the statutory Director/
# Signatory register and the shareholder/member register.
DIRECTOR_SHAREHOLDER_SOURCE_TYPES = {"mgt-7", "mgt-7a"}
# Form whose MCA-prescribed content includes the audited Balance Sheet,
# Statement of Profit & Loss and Auditor Details block.
FINANCIAL_SOURCE_TYPE = "aoc-4"

# Keys populated on company.financial_data by an AOC-4 upload — kept as a
# named set so the frontend/UI and this parser stay in sync.
FINANCIAL_DATA_FIELDS = (
    "period_from", "period_to", "total_income", "total_expenses",
    "profit_before_tax", "profit_after_tax", "net_worth", "share_capital",
    "reserves_and_surplus", "balance_sheet_total",
)


def _identify_roc_form_type(filename: str, text: str) -> str:
    """Best-effort filing-type label — checked against both the filename
    and the extracted text, since MCA acknowledgement PDFs are sometimes
    downloaded/renamed generically. This label is load-bearing: it decides
    which fields (if any) a given upload is allowed to touch, not just an
    audit-trail cosmetic."""
    hay = f"{filename}\n{text[:2000]}".lower()
    for label, pattern in ROC_FORM_RECOGNIZED:
        if re.search(pattern, hay):
            return label
    return "roc-form"


def _extract_text_from_upload(filename: str, raw: bytes) -> str:
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            import pdfplumber
            text_parts = []
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                for page in pdf.pages[:20]:
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
        return raw.decode("utf-8", errors="ignore")
    except Exception as e:  # pragma: no cover
        logger.warning("roc_sphere: text extraction failed for %s: %s", filename, e)
        return ""


# ── director / shareholder register (MGT-7 / MGT-7A only) ─────────────────

def _parse_people(text: str) -> Dict[str, List[Dict[str, Any]]]:
    """Read the tabular director/signatory block in MCA MGT-7/MGT-7A text.

    A director "id" line must be a real DIN (8 digits) or a PAN
    (5 letters + 4 digits + 1 letter) — the previous version accepted any
    6-20 character alphanumeric line, which matched pincodes, page
    footers, dropdown option text and other boilerplate found on AOC-4/
    AOC-2/Board & Auditor report pages and produced garbage director rows.
    Callers must only invoke this for form_type in
    DIRECTOR_SHAREHOLDER_SOURCE_TYPES.
    """
    people: List[Dict[str, Any]] = []
    block_match = re.search(
        r"(?:Directors?/Signatory Details|Director/SignatoryDetails)(.*?)(?:Charges|No Records found|$)",
        text, re.I | re.S,
    )
    block = block_match.group(1) if block_match else text
    lines = [re.sub(r"\s+", " ", x).strip(" -:\t") for x in block.splitlines()]
    din_or_pan_re = re.compile(r"^\d{8}$|^[A-Z]{5}\d{4}[A-Z]$", re.I)
    for i, line in enumerate(lines):
        if not din_or_pan_re.fullmatch(line.replace(" ", "")):
            continue
        candidates = [x for x in lines[i + 1:i + 5] if x]
        name = next((x for x in candidates if re.search(r"[A-Za-z]", x) and len(x) >= 5
                     and not re.fullmatch(r"(Director|Promoter|Signatory|Active|Yes|No)", x, re.I)), None)
        if not name or any(p.get("din") == line for p in people):
            continue
        designation = next((x for x in candidates if re.search(
            r"director|partner|manager|secretary", x, re.I)), "Director")
        people.append({
            "name": name,
            "din": line,
            "designation": designation.title(),
            "date_of_appointment": next((x for x in candidates if re.fullmatch(
                r"\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}", x)), None),
        })
    return {"people": people}


def _parse_mgt_shareholders(text: str) -> List[Dict[str, Any]]:
    """Parse shareholder rows when the attached MGT-7/MGT-7A includes them.

    The filed MGT-7A often references a separate XLSM attachment and
    therefore contains only the shareholder count. In that case returning
    [] is correct and preserves the existing shareholder register instead
    of fabricating names. Callers must only invoke this for form_type in
    DIRECTOR_SHAREHOLDER_SOURCE_TYPES.
    """
    rows = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        m = re.match(r"^\d+\s+([A-Za-z][A-Za-z .,&'-]{3,})\s+([A-Z]{5}\d{4}[A-Z])?\s*(\d[\d,]*)\s*$", line)
        if m:
            rows.append({"name": m.group(1).strip(), "pan": m.group(2), "shares_held": _num(m.group(3).replace(",", "")), "class_of_shares": "Equity"})
    return rows


def _parse_directors_for_form(form_type: str, filename: str, raw: bytes, text: str) -> List[Dict[str, Any]]:
    """Directors register — gated to MGT-7/MGT-7A. Prefers the bordered
    table-grid reader (far more reliable than a text-line scan) and only
    falls back to the text-regex scan above when no bordered table is
    found, e.g. an MGT-7A that was flattened/scanned oddly."""
    if form_type not in DIRECTOR_SHAREHOLDER_SOURCE_TYPES:
        return []
    people = _parse_master_director_tables(raw) if (filename or "").lower().endswith(".pdf") else []
    if not people:
        people = _parse_people(text)["people"]
    return people


def _parse_shareholders_for_form(form_type: str, text: str) -> List[Dict[str, Any]]:
    """Shareholder register — gated to MGT-7/MGT-7A."""
    if form_type not in DIRECTOR_SHAREHOLDER_SOURCE_TYPES:
        return []
    return _parse_mgt_shareholders(text)


# ── general Company Master fields (any recognised ROC form) ───────────────
# MCA e-form PDFs render each field as a label followed by its value —
# sometimes on the same line ("*Name of the Company PRODIGIST … LIMITED"
# on AOC-2/Board's/Auditor's Report), sometimes with the value in the box
# below the label ("*Corporate identity number (CIN)" / value on the next
# line, as on AOC-4). _extract_labeled_value() below tries the same-line
# remainder first and only falls back to scanning forward when that
# remainder doesn't validate — this is what keeps e.g. a bare label like
# "Address of the registered office of the company" (nothing left over
# after stripping the label text) from being read as its own value.

STOP_MARKER_RE = re.compile(r"^\(?[a-hj-vx-z]\)\s|^\(?[ivx]{1,4}\)\s", re.I)
_TRUNC_ENDING_WORDS = ("private", "pvt", "the", "of", "and", "&", "-")

_DATE_VALUE_RE = re.compile(r"^[0-3]?\d[/\-][01]?\d[/\-]\d{2,4}$")
_NUM_VALUE_RE = re.compile(r"^[\d,]+(\.\d+)?$")
_CIN_VALUE_RE = re.compile(r"^[A-Z0-9]{21}$")
_NAME_VALUE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 &.,'\-]{1,90}$")
_ANY_TEXT_VALUE_RE = re.compile(r"^.{4,150}$")
_ALNUM_ID_VALUE_RE = re.compile(r"^[A-Za-z0-9]{4,20}$")


def _find_label_line(lines: List[str], phrases: List[str], start: int = 0):
    """First line at/after `start` containing any phrase (longer phrases
    should be listed first so a more specific label wins over a shorter
    one that happens to be a substring of it)."""
    low = [p.lower() for p in phrases]
    for i in range(start, len(lines)):
        ll = lines[i].lower()
        for p in low:
            if p in ll:
                return i, p
    return -1, None


def _extract_labeled_value(lines: List[str], label_idx: int, phrase: str, validator, join_multiline: bool = False, max_lookahead: int = 6) -> Optional[str]:
    line = lines[label_idx]
    ll = line.lower()
    p_idx = ll.find(phrase)
    remainder = line[p_idx + len(phrase):].strip(" :()-\t*") if p_idx != -1 else ""
    if remainder and validator(remainder):
        collected = [remainder]
        # a same-line value that trails off mid-word ("… PRIVATE") is
        # completed from the immediate next line ("LIMITED"); a complete
        # value is left alone so the next label's text is never pulled in.
        if join_multiline and remainder.strip().lower().split(" ")[-1] in _TRUNC_ENDING_WORDS:
            for j in range(label_idx + 1, min(label_idx + 3, len(lines))):
                cand = lines[j].strip()
                if not cand or STOP_MARKER_RE.match(cand):
                    break
                if validator(cand):
                    collected.append(cand)
                break
        return " ".join(collected)
    collected: List[str] = []
    for j in range(label_idx + 1, min(label_idx + 1 + max_lookahead, len(lines))):
        cand = lines[j].strip()
        if not cand:
            continue
        is_stop = bool(STOP_MARKER_RE.match(cand))
        ok = bool(validator(cand))
        if is_stop and (collected or not ok):
            break
        if ok:
            collected.append(cand)
            if not join_multiline:
                break
        elif collected:
            break
    return " ".join(collected) if collected else None


# (field, label phrases — longest/most specific first, validator, join multi-line?, lookahead)
ROC_GENERAL_FIELD_SPECS = [
    ("cin", ["corporate identity number", "llpin"], lambda s: bool(_CIN_VALUE_RE.match(s)), False, 3),
    ("company_name", ["name of the company", "name of company", "llp name"], lambda s: bool(_NAME_VALUE_RE.match(s)), True, 3),
    ("registered_office_address",
     ["address of the registered office of the company", "address of the registered office", "registered office address"],
     lambda s: bool(_ANY_TEXT_VALUE_RE.match(s)), True, 6),
    ("authorized_capital", ["authorised capital of the company", "authorized capital of the company"], lambda s: bool(_NUM_VALUE_RE.match(s)), False, 3),
    ("last_agm_date", ["date of agm"], lambda s: bool(_DATE_VALUE_RE.match(s)), False, 3),
    ("last_board_meeting_date", ["date of board of directors", "date of board meeting"], lambda s: bool(_DATE_VALUE_RE.match(s)), False, 3),
]


def parse_roc_general_fields(text: str) -> Dict[str, Any]:
    """Company Master fields common to (most) ROC forms — safe to apply
    regardless of which recognised form type the upload turned out to be,
    since none of these are director/shareholder/financial data."""
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    extracted: Dict[str, Any] = {}
    for field, phrases, validator, join_multi, lookahead in ROC_GENERAL_FIELD_SPECS:
        idx, phrase = _find_label_line(lines, phrases)
        if idx == -1:
            continue
        val = _extract_labeled_value(lines, idx, phrase, validator, join_multi, lookahead)
        if val:
            extracted[field] = _num(val) if field == "authorized_capital" else val
    return extracted


# ── financial data + auditor (AOC-4 only) ──────────────────────────────────
# AOC-4's Balance Sheet / P&L segments print each line item and its
# current/previous-period figures on one line ("(IX) Profit before tax
# (VII-VIII) -94343.00 -132689.00"), so these are simple same-line regexes
# rather than the label/value scan used for the general fields above.

AOC4_FINANCIAL_PATTERNS = {
    "total_income": r"\(III\)\s*Total Income.*?(-?[\d,]+\.\d{2})",
    "total_expenses": r"Total expenses\s+(-?[\d,]+\.\d{2})",
    "profit_before_tax": r"\(IX\)\s*Profit before tax.*?(-?[\d,]+\.\d{2})",
    "profit_after_tax": r"\(XV\)\s*Profit\s*/\(Loss\).*?(-?[\d,]+\.\d{2})",
    "net_worth": r"Net Worth of the company\s+(-?[\d,]+(?:\.\d+)?)",
    "share_capital": r"\(a\)\s*Share capital\s+(-?[\d,]+)",
    "reserves_and_surplus": r"\(b\)\s*Reserves and surplus\s+(-?[\d,]+)",
}


def parse_aoc4_financials(text: str) -> Dict[str, Any]:
    """Balance Sheet / P&L key figures — only meaningful for form_type ==
    'aoc-4'; callers must gate on that before calling this."""
    out: Dict[str, Any] = {}
    for field, pattern in AOC4_FINANCIAL_PATTERNS.items():
        m = re.search(pattern, text)
        if m:
            out[field] = _num(m.group(1))
    # the Balance Sheet's grand total is printed twice (Equity & Liabilities
    # total, then Assets total) with identical figures — take the first.
    m = re.search(r"^Total\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$", text, re.M)
    if m:
        out["balance_sheet_total"] = _num(m.group(1))
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    idx, _ = _find_label_line(lines, ["financial year to which financial statements relates"])
    if idx != -1:
        idx_from, p1 = _find_label_line(lines, ["from (dd/mm/yyyy)"], idx)
        if idx_from != -1:
            v = _extract_labeled_value(lines, idx_from, p1, lambda s: bool(_DATE_VALUE_RE.match(s)), False, 2)
            if v:
                out["period_from"] = v
            idx_to, p2 = _find_label_line(lines, ["to (dd/mm/yyyy)"], idx_from + 1)
            if idx_to != -1:
                v = _extract_labeled_value(lines, idx_to, p2, lambda s: bool(_DATE_VALUE_RE.match(s)), False, 2)
                if v:
                    out["period_to"] = v
    return out


def parse_aoc4_auditor(text: str) -> Dict[str, Any]:
    """Statutory Auditor name + firm registration/membership number —
    only meaningful for form_type == 'aoc-4'; callers must gate on that."""
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    out: Dict[str, Any] = {}
    idx, p = _find_label_line(lines, ["name of the auditor or auditor's firm", "name of the auditor"])
    if idx != -1:
        v = _extract_labeled_value(lines, idx, p, lambda s: bool(_NAME_VALUE_RE.match(s)) and "address" not in s.lower(), True, 2)
        if v:
            out["name"] = v
    idx, p = _find_label_line(lines, ["auditor's firm's registration number", "membership number of auditor"])
    if idx != -1:
        v = _extract_labeled_value(lines, idx, p, lambda s: bool(_ALNUM_ID_VALUE_RE.match(s)), False, 2)
        if v:
            out["firm_reg_no"] = v
    return out


@router.post("/companies/{company_id}/upload-master-data")
async def upload_master_data(
    company_id: str,
    files: List[UploadFile] = File(...),
    apply: bool = Form(False),
    source_type: str = Form("roc"),
    current_user: User = Depends(CREATE),
):
    """Upload ROC Forms — AOC-4, AOC-2, MGT-7, MGT-7A, Board's/Auditor's
    Report extracts, DIR-12, ADT-1, INC-22, PAS-3, MGT-14, DPT-3
    acknowledgement PDFs — and best-effort extract filing data to prefill
    the company master. Each field is only ever taken from its statutory
    source form (see the block comment above this section): Company
    Master fields from any recognised form, the Director/Signatory
    register and Shareholder register only from MGT-7/MGT-7A, and
    financial data + Auditor details only from AOC-4.

    This is the *filing extraction* path and is intentionally separate
    from the Master Data importer below (`/companies/{id}/master-data/
    fetch`), which reads the MCA "Company/LLP Master Data" export
    instead. Robust to partial batch failures: one unreadable file no
    longer aborts the whole upload.
    """
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    if not files:
        raise HTTPException(400, "Choose at least one ROC form (PDF)")

    results = []
    errors: List[str] = []
    roc_extracted: Dict[str, Any] = {}
    total_size = 0

    for uploaded in files:
        filename = uploaded.filename or "uploaded-file"
        if not filename.lower().endswith(ROC_FORM_ALLOWED_EXT):
            errors.append(f"{filename}: skipped — ROC Forms must be PDF (use the Master Data tab for XLSX/CSV)")
            continue
        raw = await uploaded.read()
        total_size += len(raw)
        if total_size > 50 * 1024 * 1024:
            errors.append(f"{filename}: skipped — combined upload exceeds the 50MB limit")
            continue
        if not raw:
            errors.append(f"{filename}: skipped — empty file")
            continue
        try:
            text = _extract_text_from_upload(filename, raw)
        except Exception as e:  # a single corrupt/scanned PDF must not kill the batch
            logger.warning("roc_sphere upload-roc-form: failed to parse %s: %s", filename, e)
            errors.append(f"{filename}: could not be read — it may be scanned/image-only or password-protected")
            continue
        if not text.strip():
            errors.append(f"{filename}: could not be read — it may be scanned/image-only or password-protected")
            continue

        form_type = _identify_roc_form_type(filename, text)
        extracted: Dict[str, Any] = parse_roc_general_fields(text)

        directors = _parse_directors_for_form(form_type, filename, raw, text)
        if directors:
            extracted["_directors"] = directors
        shareholders = _parse_shareholders_for_form(form_type, text)
        if shareholders:
            extracted["_shareholders"] = shareholders

        if form_type == FINANCIAL_SOURCE_TYPE:
            financials = parse_aoc4_financials(text)
            if financials:
                extracted["_financials"] = financials
            auditor = parse_aoc4_auditor(text)
            if auditor:
                extracted["_auditor"] = auditor

        extracted["_source_type"] = form_type
        fields_found = {k: v for k, v in extracted.items() if not k.startswith("_")}
        results.append({"filename": filename, "source_type": form_type, "extracted": fields_found,
                         "fields_found": len(fields_found)})
        for key, value in extracted.items():
            if not key.startswith("_") and value:
                roc_extracted[key] = value
        if extracted.get("_directors"):
            roc_extracted["_directors"] = (roc_extracted.get("_directors") or []) + extracted["_directors"]
        if extracted.get("_shareholders"):
            roc_extracted["_shareholders"] = (roc_extracted.get("_shareholders") or []) + extracted["_shareholders"]
        if extracted.get("_financials"):
            roc_extracted["_financials"] = {**(roc_extracted.get("_financials") or {}), **extracted["_financials"]}
        if extracted.get("_auditor"):
            roc_extracted["_auditor"] = {**(roc_extracted.get("_auditor") or {}), **extracted["_auditor"]}

    if not any(k for k in roc_extracted if not k.startswith("_")):
        return {
            "extracted": {},
            "results": results,
            "applied": False,
            "errors": errors,
            "message": errors[0] if errors and len(errors) == len(files) else
                       "Could not confidently extract fields from these forms — please enter details manually.",
        }

    if apply:
        clean = {k: v for k, v in roc_extracted.items() if not k.startswith("_") and v}
        if roc_extracted.get("_directors"):
            if company.get("category") == "llp":
                clean["designated_partners"] = roc_extracted["_directors"]
                clean["partners"] = roc_extracted["_directors"]
            else:
                clean["directors"] = roc_extracted["_directors"]
        if roc_extracted.get("_shareholders"):
            clean["shareholders"] = roc_extracted["_shareholders"]
        if roc_extracted.get("_financials"):
            clean["financial_data"] = {**(company.get("financial_data") or {}), **roc_extracted["_financials"]}
        if roc_extracted.get("_auditor"):
            existing_auditor = dict(company.get("auditor") or {})
            existing_auditor.update({k: v for k, v in roc_extracted["_auditor"].items() if v})
            clean["auditor"] = existing_auditor
        clean["mgt_shareholder_data"] = {k: v for k, v in roc_extracted.items() if not k.startswith("_") and k not in ("directors", "shareholders", "financial_data", "auditor")}
        clean["roc_form_uploads"] = (company.get("roc_form_uploads") or []) + [
            {"filename": r["filename"], "form_type": r["source_type"], "uploaded_at": _now().isoformat()}
            for r in results
        ]
        clean["updated_at"] = _now()
        await COMPANIES.update_one({"id": company_id}, {"$set": clean})
        await _sync_company_to_client({**company, **clean})

    visible = {k: v for k, v in roc_extracted.items() if not k.startswith("_")}
    if roc_extracted.get("_directors"):
        visible["directors"] = roc_extracted["_directors"]
    if roc_extracted.get("_shareholders"):
        visible["shareholders"] = roc_extracted["_shareholders"]
    if roc_extracted.get("_financials"):
        visible["financial_data"] = roc_extracted["_financials"]
    if roc_extracted.get("_auditor"):
        visible["auditor"] = roc_extracted["_auditor"]
    return {"extracted": visible, "results": results, "applied": bool(apply), "errors": errors}


# ─────────────────────────────────────────────────────────────────────────
# MASTER DATA IMPORTER — separate extraction path from Upload ROC Forms
# ─────────────────────────────────────────────────────────────────────────
# Reads the MCA "View Company/LLP Master Data" export (the printable PDF
# from the MCA portal's Master Data service, or an MCA master-data
# XLSX/CSV). Own text-reading strategy (PDF text-flow order, since the
# Master Data PDF is a two-column label/value layout that default PDF text
# extraction jumbles), own label dictionary, own field mapper. Deliberately
# does not share the ROC-form parsers/upload_master_data() above — a change
# to ROC filing parsing must never silently change Master Data parsing.
#
# Behaviour mirrors "Smart Import" on the Clients page: upload → fields are
# fetched and applied to the Company Master automatically, no manual
# per-field Apply step.

MASTER_DATA_ALLOWED_EXT = (".pdf", ".xlsx", ".xls", ".csv")

# (internal field name, label phrases as they appear on the MCA export)
MASTER_DATA_LABELS: List[tuple] = [
    ("cin", ("cin", "llpin")),
    ("company_name", ("company name", "name of the company", "llp name")),
    ("roc_name", ("roc name",)),
    ("registration_number", ("registration number",)),
    ("date_of_incorporation", ("date of incorporation",)),
    ("email", ("email id", "email")),
    ("registered_office_address", ("registered address", "registered office address")),
    ("listed", ("listed in stock exchange",)),
    ("company_category_raw", ("category of company",)),
    ("company_subcategory_raw", ("subcategory of the company",)),
    ("class_of_company_raw", ("class of company",)),
    ("active_compliance_raw", ("active compliance",)),
    ("authorized_capital", ("authorised capital", "authorized capital")),
    ("paid_up_capital", ("paid up capital", "paid-up capital")),
    ("last_agm_date", ("date of last agm",)),
    ("date_of_balance_sheet", ("date of balance sheet",)),
    ("company_status", ("company status",)),
    ("roc_office", ("roc (name and office)", "roc name and office")),
    ("rd_region", ("rd (name and region)", "rd name and region")),
    ("pan", ("pan", "permanent account number")),
    # stop-only markers — never stored, just tell the collector where a
    # multi-line value (e.g. the wrapped registered address) ends
    ("_stop_books_address", ("address at which the books of account",)),
    ("_stop_index_of_charges", ("index of charges",)),
    ("_stop_jurisdiction", ("jurisdiction",)),
    ("_stop_director_block", ("director/signatory details", "director / signatory details")),
]


def _match_master_label(line_lower: str):
    for field, phrases in MASTER_DATA_LABELS:
        for p in phrases:
            if line_lower == p or line_lower.startswith(p + " ") or line_lower.startswith(p + ":"):
                return field, p
    return None, None


def _read_master_data_text(filename: str, raw: bytes) -> str:
    """Own file→text reader for Master Data uploads. PDFs use text-flow
    ordering (reading order by position rather than raw stream order) so
    the label/value pairs on the MCA export don't get scrambled — the
    default extraction used for ROC forms gets this layout wrong."""
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            import pdfplumber
            parts = []
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                for page in pdf.pages[:8]:
                    t = None
                    try:
                        t = page.extract_text(use_text_flow=True)
                    except Exception:
                        t = None
                    parts.append(t or page.extract_text() or "")
            return "\n".join(parts)
        if name.endswith((".xlsx", ".xls")):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
            lines = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
                    if cells:
                        lines.append(" ".join(cells))
            return "\n".join(lines)
        if name.endswith(".csv"):
            return raw.decode("utf-8-sig", errors="ignore")
        return raw.decode("utf-8", errors="ignore")
    except Exception as e:  # pragma: no cover
        logger.warning("roc_sphere master-data: text extraction failed for %s: %s", filename, e)
        return ""


def _parse_master_director_tables(raw: bytes) -> List[Dict[str, Any]]:
    """Read the Director/Signatory table straight from the PDF's table
    grid (bordered on the MCA Master Data export) rather than scanning
    text lines — far more reliable than regex here since the table's
    column count varies (older exports omit the 'Category' column) but
    the last three columns are always Date of Appointment / Cessation
    Date / Signatory, letting position alone locate every field."""
    directors: List[Dict[str, Any]] = []
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            for page in pdf.pages:
                for table in (page.extract_tables() or []):
                    if not table or len(table) < 2:
                        continue
                    header_line = " ".join(str(c or "") for c in table[0]).lower()
                    if "din" not in header_line:
                        continue
                    for row in table[1:]:
                        if not row or len(row) < 4 or not any(row):
                            continue
                        name = str(row[2] or "").replace("\n", " ").strip()
                        din = str(row[1] or "").replace("\n", " ").strip()
                        if not name or not din or not re.search(r"[A-Za-z]", name) or not re.search(r"\d", din):
                            continue
                        appt_i, cess_i = len(row) - 3, len(row) - 2
                        directors.append({
                            "name": re.sub(r"\s+", " ", name),
                            "din": din,
                            "designation": (str(row[3] or "").replace("\n", " ").strip() or "Director"),
                            "date_of_appointment": str(row[appt_i] or "").strip() or None if appt_i > 0 else None,
                            "date_of_cessation": (str(row[cess_i] or "").strip() or None) if 0 <= cess_i < len(row) and str(row[cess_i] or "").strip() not in ("", "-") else None,
                        })
    except Exception as e:  # pragma: no cover
        logger.warning("roc_sphere master-data: director table extraction failed: %s", e)
    return directors


def _map_master_category(class_of_company_raw: Optional[str], category_raw: Optional[str], is_llp_hint: bool) -> Optional[str]:
    if is_llp_hint:
        return "llp"
    c = (class_of_company_raw or "").strip().lower()
    cat = (category_raw or "").strip().lower()
    if "one person" in cat:
        return "opc"
    if "section 8" in cat or "section-8" in cat or "u/s 8" in cat:
        return "section_8"
    if "public" in c:
        return "public"
    if "private" in c:
        return "private"
    return None


def extract_mca_master_data(filename: str, raw: bytes) -> Dict[str, Any]:
    """Parse an MCA Master Data export (PDF/XLSX/CSV) into Company Master
    fields. Separate parser/algorithm from the ROC-form parsers above —
    walks the document as an ordered label→value sequence (handling both
    same-line values like 'CIN U80900GJ...' and MCA's multi-line wrapped
    values like the registered address) rather than regex-scanning the
    whole blob."""
    text = _read_master_data_text(filename, raw)
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    lines = [x for x in lines if x]

    extracted: Dict[str, Any] = {}
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        low = line.lower().rstrip(":")
        field, phrase = _match_master_label(low)
        if not field:
            i += 1
            continue
        if field.startswith("_stop_"):
            i += 1
            continue
        remainder = line[len(phrase):].strip(" :\t-")
        if remainder:
            value_parts, j = [remainder], i + 1
        else:
            value_parts, j = [], i + 1
            while j < n:
                nxt_field, _ = _match_master_label(lines[j].lower().rstrip(":"))
                if nxt_field:
                    break
                value_parts.append(lines[j])
                j += 1
        value = " ".join(p for p in value_parts if p).strip(" ,")
        if value and value not in ("-", "—", "NA", "N/A") and field not in extracted:
            extracted[field] = value
        i = j if j > i else i + 1

    for f in ("authorized_capital", "paid_up_capital"):
        if f in extracted:
            digits = re.sub(r"[^\d.]", "", str(extracted[f]))
            extracted[f] = _num(digits) if digits else 0.0

    if "listed" in extracted:
        extracted["listed"] = str(extracted["listed"]).strip().lower().startswith("y")

    is_llp_hint = bool(re.search(r"\bLLPIN\b", text, re.I))
    mapped_category = _map_master_category(
        extracted.pop("class_of_company_raw", None), extracted.get("company_category_raw"), is_llp_hint)
    if mapped_category:
        extracted["category"] = mapped_category

    # Table-grid extraction (PDF only) is far more reliable than the
    # regex line-scan, so prefer it and only fall back for XLSX/CSV or a
    # PDF whose director table has no visible borders.
    people = _parse_master_director_tables(raw) if (filename or "").lower().endswith(".pdf") else []
    if not people:
        people = _parse_people(text)["people"]
    if people:
        extracted["_directors"] = people

    extracted["_source_type"] = "master-data"
    extracted["_source_file"] = filename
    extracted["_chars_scanned"] = len(text)
    return extracted


@router.post("/companies/{company_id}/master-data/fetch")
async def fetch_master_data(
    company_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(CREATE),
):
    """Master Data tab — upload the MCA 'View Company/LLP Master Data' PDF
    (or an MCA master-data XLSX/CSV) and the Company Master + Director/
    Signatory register are fetched and applied automatically, the same way
    Smart Import on the Clients page auto-fills a client from an uploaded
    document. Always applies (no manual per-field Apply step); returns
    exactly which fields changed so the UI can summarise it."""
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    if not files:
        raise HTTPException(400, "Choose at least one Master Data file")

    merged: Dict[str, Any] = {}
    directors: List[Dict[str, Any]] = []
    results, errors = [], []
    total_size = 0

    for uploaded in files:
        filename = uploaded.filename or "master-data-file"
        if not filename.lower().endswith(MASTER_DATA_ALLOWED_EXT):
            errors.append(f"{filename}: unsupported file type — use PDF, XLSX or CSV")
            continue
        raw = await uploaded.read()
        total_size += len(raw)
        if total_size > 25 * 1024 * 1024:
            errors.append(f"{filename}: skipped — combined upload exceeds the 25MB limit")
            continue
        if not raw:
            errors.append(f"{filename}: skipped — empty file")
            continue
        try:
            extracted = extract_mca_master_data(filename, raw)
        except Exception as e:
            logger.warning("roc_sphere master-data: failed to parse %s: %s", filename, e)
            errors.append(f"{filename}: could not be read — file may be corrupted or password-protected")
            continue

        fields = {k: v for k, v in extracted.items() if not k.startswith("_")}
        results.append({"filename": filename, "fields_found": len(fields)})
        for k, v in fields.items():
            if v not in (None, "", 0):
                merged[k] = v
        for d in extracted.get("_directors") or []:
            if not any((existing.get("din") or "").upper() == (d.get("din") or "").upper() and d.get("din") for existing in directors):
                directors.append(d)

    if not merged and not directors:
        return {
            "applied": False,
            "fields_applied": [],
            "results": results,
            "errors": errors or ["Could not confidently extract Master Data fields from this file — please check it's the MCA Master Data export, or enter details manually."],
        }

    clean: Dict[str, Any] = {}
    for f in ("cin", "company_name", "registered_office_address", "date_of_incorporation",
              "authorized_capital", "paid_up_capital", "last_agm_date", "pan", "category", "listed"):
        if merged.get(f) not in (None, ""):
            clean[f] = merged[f]

    effective_category = clean.get("category") or company.get("category")
    if directors:
        if effective_category == "llp":
            clean["designated_partners"] = directors
            clean["partners"] = directors
        else:
            clean["directors"] = directors

    existing_master = dict(company.get("master_data") or {})
    existing_master.update({k: v for k, v in {
        "roc_name": merged.get("roc_name"),
        "registration_number": merged.get("registration_number"),
        "email": merged.get("email"),
        "company_status": merged.get("company_status"),
        "roc_office": merged.get("roc_office"),
        "rd_region": merged.get("rd_region"),
        "date_of_balance_sheet": merged.get("date_of_balance_sheet"),
        "active_compliance": merged.get("active_compliance_raw"),
        "company_subcategory": merged.get("company_subcategory_raw"),
    }.items() if v not in (None, "")})
    existing_master["last_fetched_at"] = _now().isoformat()
    existing_master["last_fetched_by"] = _who(current_user)
    existing_master["source_files"] = [r["filename"] for r in results]
    clean["master_data"] = existing_master

    clean["roc_form_uploads"] = (company.get("roc_form_uploads") or []) + [
        {"filename": r["filename"], "form_type": "master-data", "uploaded_at": _now().isoformat()}
        for r in results
    ]
    clean["updated_at"] = _now()

    await COMPANIES.update_one({"id": company_id}, {"$set": clean})
    await _sync_company_to_client({**company, **clean})
    updated = await COMPANIES.find_one({"id": company_id})
    updated.pop("_id", None)

    return {
        "applied": True,
        "fields_applied": sorted(k for k in clean.keys() if k not in ("master_data", "roc_form_uploads", "updated_at")),
        "company": updated,
        "results": results,
        "errors": errors,
    }


# ─────────────────────────────────────────────────────────────────────────
# COMPLIANCE CHECKLIST ENGINE
# ─────────────────────────────────────────────────────────────────────────
# Heuristic, config-driven so it's easy to keep current. Review
# thresholds against the latest MCA notifications periodically —
# "small company" limits were last revised (paid-up ≤ Rs 10 cr, turnover
# ≤ Rs 100 cr) with effect from 1 Dec 2025.

SMALL_CO_PAID_UP_LIMIT = 10_00_00_000     # Rs 10 crore
SMALL_CO_TURNOVER_LIMIT = 100_00_00_000   # Rs 100 crore


def _is_llp(company: Dict[str, Any]) -> bool:
    return company.get("category") == "llp"


def _is_small_company(company: Dict[str, Any]) -> bool:
    # "Small company" is a Companies Act, 2013 concept only — never applies to an LLP.
    if _is_llp(company):
        return False
    if company.get("is_small_company") is not None:
        return bool(company["is_small_company"])
    if company.get("category") in ("public", "section_8"):
        return False
    paid_up = _num(company.get("paid_up_capital"))
    turnover = _num(company.get("last_year_turnover"))
    return paid_up <= SMALL_CO_PAID_UP_LIMIT and turnover <= SMALL_CO_TURNOVER_LIMIT


# LLP Act, 2008 / LLP Rules audit-applicability thresholds
LLP_AUDIT_TURNOVER_LIMIT = 40_00_000       # Rs. 40 lakh turnover
LLP_AUDIT_CONTRIBUTION_LIMIT = 25_00_000   # Rs. 25 lakh partners' contribution


def build_llp_compliance_checklist(company: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Compliance checklist under the LLP Act, 2008 / LLP Rules — entirely
    separate from the Companies Act, 2013 checklist below, since an LLP has
    no share capital, no Board/AGM in the company-law sense, no AOC-4/MGT-7/
    ADT-1/CSR/MGT-14/PAS-6, etc. Keyed off Designated Partners, not Directors."""
    items: List[Dict[str, Any]] = []
    num_dp = len(company.get("directors") or [])  # "directors" list doubles as Designated Partners for LLP records
    turnover = _num(company.get("last_year_turnover"))
    contribution = _num(company.get("paid_up_capital"))  # "paid_up_capital" field doubles as total partners' contribution
    audit_applicable = turnover > LLP_AUDIT_TURNOVER_LIMIT or contribution > LLP_AUDIT_CONTRIBUTION_LIMIT

    def add(form, particulars, due, frequency, applicable=True, notes=None):
        items.append({
            "form": form, "particulars": particulars, "due_date_rule": due,
            "frequency": frequency, "applicable": applicable, "notes": notes,
        })

    add("Form 11", "Annual Return of the LLP", "Within 60 days of FY close (by 30th May)", "Annual")
    add("Form 8", "Statement of Account & Solvency (incl. Statement of Solvency by Designated Partners)",
        "Within 30 days from end of 6 months of FY close (by 30th October)", "Annual")
    add("Statutory Audit", "Audit of accounts by a Chartered Accountant",
        "Before filing Form 8", "Annual",
        applicable=audit_applicable,
        notes=f"Mandatory only if turnover > ₹{LLP_AUDIT_TURNOVER_LIMIT:,} or partners' contribution > ₹{LLP_AUDIT_CONTRIBUTION_LIMIT:,}; otherwise a self-declaration of solvency suffices.")
    add("DIR-3 KYC", "KYC of every Designated Partner holding a DIN/DPIN", "By 30th September every year", "Annual", applicable=num_dp > 0)
    add("Form 3", "Filing of LLP Agreement / any changes to the LLP Agreement", "Within 30 days of execution/change", "Event-based")
    add("Form 4", "Notice of appointment/cessation/change of a partner or Designated Partner, or change of name/address of a partner",
        "Within 30 days of the event", "Event-based")
    add("Form 15", "Notice of change of registered office of the LLP", "Within 30 days of the change", "Event-based")
    add("Income Tax Return", "Filing of the LLP's income tax return",
        "31st July (no audit) / 31st October (audit applicable)", "Annual",
        notes="Due date shifts to 31st Oct if the LLP is subject to tax audit / transfer-pricing audit.")
    add("GST Returns", "GSTR-1 / GSTR-3B (and annual return GSTR-9) if GST-registered", "Monthly/Quarterly + Annual", "Periodic",
        applicable=bool(company.get("gst_registered", True)),
        notes="Applicable only if the LLP holds a GST registration — verify against the client's actual GSTIN status.")
    add("Meeting of Designated Partners", "Periodic meeting of Designated Partners as required by the LLP Agreement",
        "As per the LLP Agreement (no statutory AGM/Board Meeting requirement under the LLP Act)", "As per LLP Agreement")
    add("Register of Partners / Designated Partners", "Internal registers to be maintained & kept updated", "Ongoing", "Ongoing")

    return items


def build_compliance_checklist(company: Dict[str, Any]) -> List[Dict[str, Any]]:
    category = company.get("category", "private")
    if category == "llp":
        return build_llp_compliance_checklist(company)
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
    is_llp = _is_llp(company)
    return {
        "company_name": company.get("company_name"),
        "category": company.get("category"),
        "is_small_company": None if is_llp else _is_small_company(company),
        "checklist": checklist,
        "generated_at": _now().isoformat(),
        "disclaimer": (
            "Generated from the LLP's category/turnover/contribution using current "
            "LLP Act, 2008 / LLP Rules thresholds as configured in the app. Verify "
            "against the latest MCA notifications before relying on it for filing."
            if is_llp else
            "Generated from company category/capital/turnover using current "
            "Companies Act 2013 thresholds as configured in the app. Verify "
            "against the latest MCA notifications before relying on it for filing."
        ),
    }


FREQUENCY_GROUP_ORDER = [
    "Annual", "Half-Yearly", "Quarterly", "Periodic", "Event-based",
    "As applicable", "Ongoing", "As per LLP Agreement",
]


@router.get("/companies/{company_id}/applicable-compliances")
async def get_applicable_compliances(company_id: str, current_user: User = Depends(VIEW)):
    """Full list of ROC compliances currently applicable to this company —
    a dashboard view driven by the *same* checklist engine as the
    Compliance Checklist tab, but only the items that apply, grouped by
    frequency. Because Upload ROC Forms and the Master Data importer both
    write straight into the Company Master fields this reads (capital,
    turnover, director/partner count, category), applicability here always
    reflects the latest uploaded data with no separate wiring needed."""
    company = await COMPANIES.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    checklist = build_compliance_checklist(company)
    applicable = [item for item in checklist if item.get("applicable")]

    groups: Dict[str, List[Dict[str, Any]]] = {}
    for item in applicable:
        groups.setdefault(item.get("frequency") or "Other", []).append(item)
    ordered_groups = [{"frequency": g, "items": groups[g]} for g in FREQUENCY_GROUP_ORDER if g in groups]
    ordered_groups += [{"frequency": g, "items": items} for g, items in groups.items() if g not in FREQUENCY_GROUP_ORDER]

    is_llp = _is_llp(company)
    master_data = company.get("master_data") or {}
    return {
        "company_name": company.get("company_name"),
        "category": company.get("category"),
        "cin": company.get("cin"),
        "is_small_company": None if is_llp else _is_small_company(company),
        "total_forms_tracked": len(checklist),
        "total_applicable": len(applicable),
        "not_applicable": len(checklist) - len(applicable),
        "groups": ordered_groups,
        "master_data_last_fetched": master_data.get("last_fetched_at"),
        "roc_forms_uploaded": len(company.get("roc_form_uploads") or []),
        "generated_at": _now().isoformat(),
        "disclaimer": (
            "Reflects the LLP Act, 2008 / LLP Rules obligations currently applicable to this LLP, "
            "computed live from its category/turnover/contribution. Verify against the latest MCA "
            "notifications before relying on it for filing."
            if is_llp else
            "Reflects the Companies Act, 2013 obligations currently applicable to this company, "
            "computed live from its category/capital/turnover/director count — including any values "
            "fetched from uploaded Master Data or ROC Forms. Verify against the latest MCA "
            "notifications before relying on it for filing."
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
    is_llp = _is_llp(company)
    body_label = "Designated Partners of the LLP" if is_llp else "Board of Directors of the Company"
    present_label = "Designated Partners Present" if is_llp else "Directors Present"
    sign_label = "Designated Partner" if is_llp else "Director / Company Secretary"
    din_label = "DIN/DPIN" if is_llp else "DIN/Membership No."
    _heading(d, name, size=16)
    _para(d, f"CIN: {cin}" if not is_llp else f"LLPIN: {cin}", center=True)
    _para(d, f"Registered Office: {company.get('registered_office_address') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, "EXTRACT OF MINUTES / CERTIFIED TRUE COPY OF RESOLUTION(S)", size=13)
    _para(
        d,
        f"Passed at the meeting of the {body_label} held on "
        f"{_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}."
    )
    if req.directors_present:
        _para(d, f"{present_label}: " + ", ".join(req.directors_present))
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
    _para(d, sign_label)
    _para(d, f"{din_label}: __________________")
    _para(d, f"Date: {_fmt_date(datetime.now())}", )
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_notice_doc(company: Dict[str, Any], req: MeetingNoticeRequest, prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    is_llp = _is_llp(company)
    if is_llp:
        label = {
            "board": "NOTICE OF MEETING OF DESIGNATED PARTNERS",
            "agm": "NOTICE OF MEETING OF PARTNERS",
            "egm": "NOTICE OF MEETING OF PARTNERS (EXTRA-ORDINARY)",
        }.get(req.meeting_type, "NOTICE OF MEETING")
    else:
        label = {
            "board": "NOTICE OF BOARD MEETING",
            "agm": "NOTICE OF ANNUAL GENERAL MEETING",
            "egm": "NOTICE OF EXTRA-ORDINARY GENERAL MEETING",
        }.get(req.meeting_type, "NOTICE OF MEETING")
    sign_label = "Designated Partner" if is_llp else "Director / Company Secretary"
    order_label = "By Order of the Designated Partners" if is_llp else "By Order of the Board"
    _heading(d, name, size=16)
    _para(d, f"LLPIN: {company.get('cin') or '—'}" if is_llp else f"CIN: {company.get('cin') or '—'}", center=True)
    _para(d, f"Registered Office: {company.get('registered_office_address') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, label, size=13, underline=True)
    _para(d, f"Notice dated: {_fmt_date(req.notice_date or datetime.now())}")
    d.add_paragraph()
    if req.meeting_type == "board":
        body = "Designated Partners of the LLP" if is_llp else "Board of Directors of the Company"
        _para(d, f"NOTICE is hereby given that a meeting of the {body} will be held on "
                 f"{_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}, to transact the following business:")
    else:
        body = "Partners of the LLP" if is_llp else "members of the Company"
        _para(d, f"NOTICE is hereby given that the {label.split('OF ')[-1].title()} of the {body} will be held on "
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
        if is_llp:
            _para(d, "1. Attendance, quorum and voting shall be governed by the provisions of the LLP Agreement.")
            _para(d, "2. A Partner may be represented by an authorised representative only if expressly permitted by the LLP Agreement.")
        else:
            _para(d, "1. A member entitled to attend and vote is entitled to appoint a proxy to attend and vote instead of "
                     "himself/herself, and such proxy need not be a member of the Company.")
            _para(d, "2. Proxies, in order to be effective, must be received at the Registered Office not less than 48 hours "
                     "before the commencement of the meeting.")
    d.add_paragraph()
    _para(d, order_label)
    _para(d, "For " + name, bold=True)
    d.add_paragraph()
    _para(d, sign_label)
    _para(d, f"Prepared by: {prepared_by} (Taskosphere ROC Sphere)", italic=True)

    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def build_minutes_doc(company: Dict[str, Any], req: MinutesRequest, prepared_by: str) -> bytes:
    d = _base_doc()
    name = company.get("company_name", "").upper()
    is_llp = _is_llp(company)
    if is_llp:
        label = {
            "board": "MINUTES OF THE MEETING OF THE DESIGNATED PARTNERS",
            "agm": "MINUTES OF THE MEETING OF THE PARTNERS",
            "egm": "MINUTES OF THE MEETING OF THE PARTNERS (EXTRA-ORDINARY)",
        }.get(req.meeting_type, "MINUTES OF MEETING")
    else:
        label = {
            "board": "MINUTES OF THE MEETING OF THE BOARD OF DIRECTORS",
            "agm": "MINUTES OF THE ANNUAL GENERAL MEETING",
            "egm": "MINUTES OF THE EXTRA-ORDINARY GENERAL MEETING",
        }.get(req.meeting_type, "MINUTES OF MEETING")
    present_label = "Designated Partners Present" if is_llp else "Directors Present"
    absent_label = "Designated Partners Absent (Leave of Absence granted)" if is_llp else "Directors Absent (Leave of Absence granted)"
    other_label = "Other Partners / Attendees Present" if is_llp else "Members / Attendees Present"
    _heading(d, name, size=16)
    _para(d, f"LLPIN: {company.get('cin') or '—'}" if is_llp else f"CIN: {company.get('cin') or '—'}", center=True)
    d.add_paragraph()
    _heading(d, label, size=13, underline=True)
    _para(d, f"Held on {_fmt_date(req.meeting_date)} at {req.meeting_time} at {req.venue}.")
    d.add_paragraph()
    if req.meeting_type == "board":
        _para(d, f"{present_label}: " + (", ".join(req.directors_present) or "—"))
        if req.directors_absent:
            _para(d, f"{absent_label}: " + ", ".join(req.directors_absent))
    else:
        _para(d, f"{present_label}: " + (", ".join(req.directors_present) or "—"))
        if req.attendees_other:
            _para(d, f"{other_label}: " + ", ".join(req.attendees_other))
    if req.chairman:
        _para(d, f"{req.chairman} chaired the meeting.")
    _para(
        d,
        "Quorum was confirmed to be present."
        if req.quorum_present else
        ("NOTE: Quorum was NOT present — meeting stands adjourned as per the LLP Agreement." if is_llp
         else "NOTE: Quorum was NOT present — meeting stands adjourned as per Companies Act / AoA provisions.")
    )
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
    _para(d, "Designated Partner" if is_llp else "Chairman", bold=True)
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
