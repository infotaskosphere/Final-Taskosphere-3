"""
backend/trademark_sphere.py
---------------------------
Drop-in replacement that scrapes QuickCompany (https://www.quickcompany.in)
instead of the broken IP India estatus OTP flow.

- No OTP, no captcha, no ScraperAPI required.
- All existing FastAPI routes preserved; frontend works unchanged.
- /send-otp is kept as a no-op so the existing UI doesn't break.
- Mongo document shape preserved exactly.
"""

import os, re, uuid, logging, asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta
from typing import Optional, List, Any, Dict, Tuple
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests as _requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trademark-sphere", tags=["trademark-sphere"])
IST    = ZoneInfo("Asia/Kolkata")
_pool  = ThreadPoolExecutor(max_workers=8)

QC_BASE       = "https://www.quickcompany.in"
QC_API_SEARCH = f"{QC_BASE}/api/v1/trademark/"          # ?q=...&page=N
QC_API_DETAIL = f"{QC_BASE}/api/v1/trademark/"          # + {app_no}
QC_ATTORNEY   = f"{QC_BASE}/trademarks/attorney"        # /{agent_code}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept":          "application/json, text/html;q=0.9, */*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer":         f"{QC_BASE}/trademarks",
}

# ── In-memory caches ────────────────────────────────────────────────────────
tm_cache:       Dict[str, Any] = {}
_sessions:      Dict[str, Any] = {}            # kept for API compatibility
_sync_progress: Dict[str, Any] = {}


# ════════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════════

def _clean(t: Any) -> Optional[str]:
    return " ".join((str(t) or "").split()).strip() or None


def _http_json(url: str, timeout: int = 30) -> Any:
    r = _requests.get(url, headers=_HEADERS, timeout=timeout)
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        raise HTTPException(502, f"QuickCompany returned {r.status_code} for {url}")
    try:
        return r.json()
    except ValueError:
        raise HTTPException(502, f"QuickCompany returned non-JSON for {url}")


def _http_html(url: str, timeout: int = 30) -> str:
    r = _requests.get(url, headers=_HEADERS, timeout=timeout)
    if r.status_code == 404:
        return ""
    if r.status_code != 200:
        raise HTTPException(502, f"QuickCompany returned {r.status_code} for {url}")
    return r.text


def _normalize_qc_record(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Map QuickCompany JSON fields → our canonical trademark dict."""
    if not rec:
        return {}

    def g(*keys):
        for k in keys:
            v = rec.get(k)
            if v not in (None, "", []):
                return v
        return None

    word_mark = g("name", "title", "mark", "trademark", "wordMark")
    app_no    = g("application", "applicationNumber", "appNumber", "app_no", "number")
    status    = g("status", "tmStatus", "trademarkStatus")
    cls       = g("class", "classNumber", "niceClass")
    proprietor= g("proprietor", "owner", "applicant", "applicantName")
    filing    = g("dateOfApplication", "filingDate", "applicationDate", "filed")
    reg_date  = g("dateOfRegistration", "registrationDate", "registered")
    expiry    = g("validUpto", "validTill", "renewalDate", "expiryDate", "dateOfExpiry")
    gs        = g("goodsAndServices", "goodsServices", "specification", "description")
    address   = g("address", "applicantAddress", "proprietorAddress")
    img       = g("image", "logo", "imageUrl", "trademarkImage")
    publication = g("dateOfPublication", "publicationDate", "advertisementDate")

    # QuickCompany sometimes nests proprietor under "applicants": [{...}]
    if not proprietor and isinstance(rec.get("applicants"), list) and rec["applicants"]:
        a0 = rec["applicants"][0]
        if isinstance(a0, dict):
            proprietor = a0.get("name") or a0.get("applicantName")
            address    = address or a0.get("address")

    return {
        "application_number":  str(app_no).strip() if app_no else "",
        "word_mark":           str(word_mark).strip() if word_mark else "",
        "tm_status":           str(status).strip() if status else "Unknown",
        "class_number":        str(cls).strip() if cls else "",
        "proprietor":          str(proprietor).strip() if proprietor else "",
        "applicant_name":      str(proprietor).strip() if proprietor else "",
        "filing_date":         str(filing).strip() if filing else "",
        "registration_date":   str(reg_date).strip() if reg_date else "",
        "valid_upto":          str(expiry).strip() if expiry else "",
        "goods_and_services":  str(gs).strip() if gs else "",
        "address":             str(address).strip() if address else "",
        "trademark_image_url": str(img).strip() if img else "",
        "publication_date":    str(publication).strip() if publication else "",
    }


# ════════════════════════════════════════════════════════════════════════════
# Core scrapers (sync, run in thread pool)
# ════════════════════════════════════════════════════════════════════════════

def _qc_fetch_by_app_number(app_number: str) -> Dict[str, Any]:
    """Fetch a single trademark detail by application number from QuickCompany."""
    app_number = (app_number or "").strip()
    if not app_number:
        raise HTTPException(400, "Application number is required.")

    cache_key = f"detail::{app_number}"
    if cache_key in tm_cache:
        return tm_cache[cache_key]

    # 1) Try the JSON detail endpoint
    detail = _http_json(f"{QC_API_DETAIL}{quote(app_number)}")
    if detail and isinstance(detail, dict):
        data = _normalize_qc_record(detail.get("data") or detail)
        if data.get("word_mark") or data.get("application_number"):
            data["application_number"] = data["application_number"] or app_number
            tm_cache[cache_key] = data
            return data

    # 2) Fall back to the search endpoint filtered by exact number
    results = _qc_search(app_number, limit=5)
    for r in results:
        if r.get("application_number") == app_number:
            tm_cache[cache_key] = r
            return r

    raise HTTPException(404, f"No trademark found on QuickCompany for '{app_number}'.")


def _qc_search(query: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Free-text search (name / proprietor / number) on QuickCompany."""
    query = (query or "").strip()
    if not query:
        return []

    out: List[Dict[str, Any]] = []
    page = 1
    while len(out) < limit and page <= 10:
        url  = f"{QC_API_SEARCH}?q={quote(query)}&page={page}"
        body = _http_json(url)
        if not body:
            break
        items = (
            body.get("results")
            or body.get("data")
            or body.get("items")
            or (body if isinstance(body, list) else [])
        )
        if not items:
            break
        for it in items:
            n = _normalize_qc_record(it)
            if n.get("application_number") or n.get("word_mark"):
                out.append(n)
                if len(out) >= limit:
                    break
        if len(items) < 10:
            break
        page += 1
    return out


def _qc_attorney_app_numbers(agent_code: str) -> List[str]:
    """Scrape every application number listed under an attorney/agent page."""
    agent_code = (agent_code or "").strip()
    if not agent_code:
        return []

    seen: set = set()
    nums: List[str] = []
    page = 1
    while page <= 30:
        url  = f"{QC_ATTORNEY}/{quote(agent_code)}?page={page}"
        html = _http_html(url)
        if not html:
            break
        soup  = BeautifulSoup(html, "lxml")
        added = 0
        for a in soup.find_all("a", href=True):
            m = re.search(r"/trademarks/(\d{5,})(?:[/?#]|$)", a["href"])
            if m:
                n = m.group(1)
                if n not in seen:
                    seen.add(n)
                    nums.append(n)
                    added += 1
        if added == 0:
            break
        page += 1

    logger.info(f"QuickCompany attorney {agent_code}: {len(nums)} application numbers.")
    return nums


# ── Async wrappers (signatures preserved for the rest of the codebase) ──────

async def scrape_trademark(
    app_number: str,
    class_number: Optional[str] = None,
    session_id:   Optional[str] = None,
    otp:          Optional[str] = None,
) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _qc_fetch_by_app_number, app_number)


async def scrape_documents(
    app_number: str, class_number: Optional[str] = None
) -> Tuple[List[Dict], Optional[Dict]]:
    # QuickCompany does not expose Document_Index PDFs. Return empty
    # so the rest of the pipeline keeps working.
    return [], None


async def scrape_by_attorney_code(
    agent_code: str,
    session_id: Optional[str] = None,
    otp:        Optional[str] = None,
) -> List[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _qc_attorney_app_numbers, agent_code)


async def send_otp(email: str) -> str:
    # No OTP needed with QuickCompany. Keep the function so existing
    # frontend code that calls /send-otp keeps working.
    sid = str(uuid.uuid4())
    _sessions[sid] = {
        "email":      email,
        "created_at": datetime.now(IST).isoformat(),
        "noop":       True,
    }
    return sid


# ════════════════════════════════════════════════════════════════════════════
# Pydantic models  (kept identical to the original file)
# ════════════════════════════════════════════════════════════════════════════

class SendOtpRequest(BaseModel):
    email: str


class TrademarkAddRequest(BaseModel):
    application_number: str
    class_number:       Optional[str]            = None
    session_id:         Optional[str]            = None
    otp:                Optional[str]            = None
    client_id:          Optional[str]            = None
    client_name:        Optional[str]            = None
    attorney:           Optional[str]            = None
    notes:              Optional[str]            = None
    reminder_emails:    List[str]                = Field(default_factory=list)
    reminders_enabled:  bool                     = True
    manual_data:        Optional[Dict[str, Any]] = None


class TrademarkUpdateRequest(BaseModel):
    attorney:           Optional[str]       = None
    notes:              Optional[str]       = None
    client_id:          Optional[str]       = None
    client_name:        Optional[str]       = None
    reminder_emails:    Optional[List[str]] = None
    reminders_enabled:  Optional[bool]      = None
    valid_upto:         Optional[str]       = None
    word_mark:          Optional[str]       = None
    proprietor:         Optional[str]       = None
    tm_status:          Optional[str]       = None
    filing_date:        Optional[str]       = None
    class_number:       Optional[str]       = None
    goods_and_services: Optional[str]       = None


class TrademarkManualCreate(BaseModel):
    application_number: str
    word_mark:          str
    class_number:       Optional[str] = None
    tm_status:          str           = "Pending"
    proprietor:         Optional[str] = None
    filing_date:        Optional[str] = None
    registration_date:  Optional[str] = None
    valid_upto:         Optional[str] = None
    goods_and_services: Optional[str] = None
    client_id:          Optional[str] = None
    client_name:        Optional[str] = None
    attorney:           Optional[str] = None
    notes:              Optional[str] = None
    reminder_emails:    List[str]     = Field(default_factory=list)
    reminders_enabled:  bool          = True


class AttorneyImportRequest(BaseModel):
    agent_code:         str
    attorney:           Optional[str] = None
    client_id:          Optional[str] = None
    client_name:        Optional[str] = None
    reminder_emails:    List[str]     = Field(default_factory=list)
    reminders_enabled:  bool          = True
    session_id:         Optional[str] = None
    otp:                Optional[str] = None


class PortalSyncRequest(BaseModel):
    agent_code:       str
    session_id:       Optional[str] = None
    otp:              Optional[str] = None
    attorney:         str            = ""
    client_id:        Optional[str]  = None
    reminder_emails:  List[str]      = []
    refresh_existing: bool           = True


class SearchRequest(BaseModel):
    """New: free-text search by name / proprietor / number."""
    query: str
    limit: int = 25


# ════════════════════════════════════════════════════════════════════════════
# Deadline computation (unchanged from your original)
# ════════════════════════════════════════════════════════════════════════════

def _parse_date(s: Any) -> Optional[date]:
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%B %d, %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(str(s).strip(), fmt).date()
        except ValueError:
            pass
    return None


def _compute_deadlines(tm: Dict[str, Any]) -> Dict[str, Any]:
    today = date.today()
    dl: Dict[str, Any] = {}
    rd = _parse_date(tm.get("valid_upto") or tm.get("renewal_date"))
    if rd:
        dl["renewal_due"]      = rd.isoformat()
        dl["days_to_renewal"]  = (rd - today).days
    fd = _parse_date(tm.get("filing_date"))
    if fd:
        dl["opposition_window_end"] = (fd + timedelta(days=120)).isoformat()
    return dl


async def _gen_reminders(tm_id: str, tm: Dict[str, Any]) -> None:
    """Generate renewal reminders (90/60/30/7-day) — minimal version."""
    if not tm.get("reminders_enabled"):
        return
    rd = _parse_date(tm.get("valid_upto"))
    if not rd:
        return
    await db.trademark_sphere_reminders.delete_many({"trademark_id": tm_id})
    now = datetime.now(IST)
    rows = []
    for days in (90, 60, 30, 7):
        ron = rd - timedelta(days=days)
        if ron >= now.date():
            rid = str(uuid.uuid4())
            rows.append({
                "_id": rid, "id": rid,
                "trademark_id":       tm_id,
                "application_number": tm.get("application_number"),
                "word_mark":          tm.get("word_mark"),
                "type":               "renewal",
                "label":              f"Renewal due in {days} days",
                "remind_on":          ron.isoformat(),
                "renewal_date":       rd.isoformat(),
                "days_before":        days,
                "sent":               False,
                "auto_generated":     True,
                "created_at":         now.isoformat(),
            })
    if rows:
        await db.trademark_sphere_reminders.insert_many(rows)


# ════════════════════════════════════════════════════════════════════════════
# Background jobs
# ════════════════════════════════════════════════════════════════════════════

async def _import_attorney_bg(
    agent_code:        str,
    created_by:        str,
    attorney:          Optional[str],
    client_id:         Optional[str],
    client_name:       Optional[str],
    reminder_emails:   List[str],
    reminders_enabled: bool,
    session_id:        Optional[str] = None,
    otp:               Optional[str] = None,
) -> None:
    try:
        app_numbers = await scrape_by_attorney_code(agent_code)
    except HTTPException as exc:
        logger.error(f"Attorney import failed for {agent_code}: {exc.detail}")
        return

    for app_num in app_numbers:
        if await db.trademark_sphere.find_one({"application_number": app_num}):
            continue
        await asyncio.sleep(1)
        try:
            raw = await scrape_trademark(app_num)
        except HTTPException as exc:
            logger.warning(f"Skip {app_num}: {exc.detail}")
            continue
        now = datetime.now(IST)
        tid = str(uuid.uuid4())
        doc = {
            "_id": tid, "id": tid,
            "application_number":  app_num,
            "word_mark":           raw.get("word_mark", ""),
            "class_number":        raw.get("class_number", ""),
            "tm_status":           raw.get("tm_status", "Unknown"),
            "proprietor":          raw.get("proprietor", ""),
            "applicant_name":      raw.get("applicant_name", ""),
            "filing_date":         raw.get("filing_date", ""),
            "registration_date":   raw.get("registration_date", ""),
            "valid_upto":          raw.get("valid_upto", ""),
            "goods_and_services":  raw.get("goods_and_services", ""),
            "trademark_image_url": raw.get("trademark_image_url", ""),
            "address":             raw.get("address", ""),
            "attorney":            attorney or "",
            "notes":               f"Imported via attorney portfolio ({agent_code})",
            "client_id":           client_id or "",
            "client_name":         client_name or "",
            "reminder_emails":     reminder_emails,
            "reminders_enabled":   reminders_enabled,
            "last_fetched":        now.isoformat(),
            "created_at":          now.isoformat(),
            "updated_at":          now.isoformat(),
            "created_by":          created_by,
            "raw_data":            raw,
            "scrape_source":       "attorney_import",
            "documents":           [],
            "hearings":            None,
            **_compute_deadlines(raw),
        }
        await db.trademark_sphere.insert_one(doc)
        await _gen_reminders(tid, doc)


async def _portal_sync_bg(
    sync_id:          str,
    agent_code:       str,
    session_id:       Optional[str],
    otp:              Optional[str],
    created_by:       str,
    attorney:         str,
    client_id:        Optional[str],
    reminder_emails:  List[str],
    refresh_existing: bool,
) -> None:
    _sync_progress[sync_id] = {
        "status": "running", "phase": "Fetching application list…",
        "total": 0, "done": 0, "added": 0, "updated": 0, "failed": 0, "errors": [],
    }
    try:
        app_numbers = await scrape_by_attorney_code(agent_code)
    except Exception as exc:
        _sync_progress[sync_id].update({"status": "error", "phase": str(exc)})
        return

    total = len(app_numbers)
    _sync_progress[sync_id]["total"] = total
    _sync_progress[sync_id]["phase"] = f"Processing {total} trademarks…"

    for i, app_num in enumerate(app_numbers, 1):
        _sync_progress[sync_id]["phase"] = f"Processing {app_num} ({i}/{total})…"
        existing = await db.trademark_sphere.find_one({"application_number": app_num})
        await asyncio.sleep(0.5)
        if existing and not refresh_existing:
            _sync_progress[sync_id]["done"] += 1
            continue
        try:
            raw = await scrape_trademark(app_num)
        except Exception:
            _sync_progress[sync_id]["failed"] += 1
            _sync_progress[sync_id]["done"]   += 1
            _sync_progress[sync_id]["errors"].append(app_num)
            continue

        now = datetime.now(IST)
        dl  = _compute_deadlines(raw)
        if existing:
            upd = {
                **{k: raw.get(k) or existing.get(k) for k in (
                    "word_mark", "tm_status", "proprietor", "filing_date",
                    "registration_date", "valid_upto", "goods_and_services",
                    "trademark_image_url",
                )},
                "raw_data":      raw,
                "last_fetched":  now.isoformat(),
                "updated_at":    now.isoformat(),
                "scrape_source": "portal_sync",
                **dl,
            }
            await db.trademark_sphere.update_one(
                {"application_number": app_num}, {"$set": upd}
            )
            await _gen_reminders(existing["id"], {**existing, **upd})
            _sync_progress[sync_id]["updated"] += 1
        else:
            tid = str(uuid.uuid4())
            doc = {
                "_id": tid, "id": tid,
                "application_number":  app_num,
                "word_mark":           raw.get("word_mark", ""),
                "class_number":        raw.get("class_number", ""),
                "tm_status":           raw.get("tm_status", "Unknown"),
                "proprietor":          raw.get("proprietor", ""),
                "applicant_name":      raw.get("applicant_name", ""),
                "filing_date":         raw.get("filing_date", ""),
                "registration_date":   raw.get("registration_date", ""),
                "valid_upto":          raw.get("valid_upto", ""),
                "goods_and_services":  raw.get("goods_and_services", ""),
                "trademark_image_url": raw.get("trademark_image_url", ""),
                "address":             raw.get("address", ""),
                "attorney":            attorney or "",
                "notes":               f"Portal sync ({agent_code})",
                "client_id":           client_id or "",
                "client_name":         "",
                "reminder_emails":     reminder_emails,
                "reminders_enabled":   True,
                "last_fetched":        now.isoformat(),
                "created_at":          now.isoformat(),
                "updated_at":          now.isoformat(),
                "created_by":          created_by,
                "raw_data":            raw,
                "scrape_source":       "portal_sync",
                "documents":           [],
                "hearings":            None,
                **dl,
            }
            await db.trademark_sphere.insert_one(doc)
            await _gen_reminders(tid, doc)
            _sync_progress[sync_id]["added"] += 1
        _sync_progress[sync_id]["done"] += 1

    _sync_progress[sync_id]["status"] = "completed"
    _sync_progress[sync_id]["phase"]  = "Done."


# ════════════════════════════════════════════════════════════════════════════
# Routes
# ════════════════════════════════════════════════════════════════════════════

@router.get("/stats")
async def get_stats(user: User = Depends(get_current_user)):
    total = await db.trademark_sphere.count_documents({})
    return {"total": total}


@router.get("/list")
async def list_trademarks(
    skip:  int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q:     Optional[str] = None,
    user:  User = Depends(get_current_user),
):
    flt: Dict[str, Any] = {}
    if q:
        flt["$or"] = [
            {"application_number": {"$regex": q, "$options": "i"}},
            {"word_mark":          {"$regex": q, "$options": "i"}},
            {"proprietor":         {"$regex": q, "$options": "i"}},
        ]
    cur  = db.trademark_sphere.find(flt).skip(skip).limit(limit)
    rows = [{k: v for k, v in d.items() if k not in ("_id", "raw_data")}
            async for d in cur]
    return {"items": rows, "count": len(rows)}


@router.get("/deadlines")
async def get_deadlines(
    days: int = Query(180, ge=1, le=730),
    user: User = Depends(get_current_user),
):
    cutoff = (date.today() + timedelta(days=days)).isoformat()
    cur = db.trademark_sphere.find({"renewal_due": {"$lte": cutoff, "$gte": date.today().isoformat()}})
    return [{k: v for k, v in d.items() if k not in ("_id", "raw_data")} async for d in cur]


@router.get("/reminders")
async def get_reminders(user: User = Depends(get_current_user)):
    cur = db.trademark_sphere_reminders.find({"sent": False}).sort("remind_on", 1)
    return [{k: v for k, v in d.items() if k != "_id"} async for d in cur]


@router.get("/constants/all")
async def constants(user: User = Depends(get_current_user)):
    return {"statuses": ["Pending", "Registered", "Objected", "Opposed", "Abandoned", "Expired"]}


@router.get("/{tm_id}")
async def get_tm(tm_id: str, user: User = Depends(get_current_user)):
    d = await db.trademark_sphere.find_one({"id": tm_id})
    if not d:
        raise HTTPException(404, "Not found")
    return {k: v for k, v in d.items() if k != "_id"}


# ── NEW: free-text search (name / proprietor / number) ─────────────────────
@router.post("/search")
async def search_trademarks(body: SearchRequest, user: User = Depends(get_current_user)):
    """Live search QuickCompany without saving anything to the DB."""
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(_pool, _qc_search, body.query, body.limit)
    return {"query": body.query, "count": len(results), "results": results}


@router.post("/send-otp")
async def send_otp_route(body: SendOtpRequest, user: User = Depends(get_current_user)):
    """No-op kept for frontend compatibility — QuickCompany needs no OTP."""
    session_id = await send_otp(body.email)
    return {
        "session_id": session_id,
        "message":    "Ready. (OTP step skipped — QuickCompany source is open.)",
    }


@router.post("/fetch-preview")
async def fetch_preview(body: TrademarkAddRequest, user: User = Depends(get_current_user)):
    data = await scrape_trademark(body.application_number)
    return {**data, **_compute_deadlines(data)}


@router.post("/add")
async def add_trademark(
    body: TrademarkAddRequest, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    if await db.trademark_sphere.find_one({"application_number": body.application_number.strip()}):
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")
    raw = body.manual_data or await scrape_trademark(body.application_number)
    dl  = _compute_deadlines(raw)
    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    doc = {
        "_id": tid, "id": tid,
        "application_number":  body.application_number.strip(),
        "word_mark":           raw.get("word_mark", ""),
        "class_number":        raw.get("class_number") or body.class_number or "",
        "tm_status":           raw.get("tm_status", "Unknown"),
        "proprietor":          raw.get("proprietor", ""),
        "applicant_name":      raw.get("applicant_name", ""),
        "filing_date":         raw.get("filing_date", ""),
        "registration_date":   raw.get("registration_date", ""),
        "valid_upto":          raw.get("valid_upto", ""),
        "goods_and_services":  raw.get("goods_and_services", ""),
        "trademark_image_url": raw.get("trademark_image_url", ""),
        "address":             raw.get("address", ""),
        "attorney":            body.attorney or "",
        "notes":               body.notes or "",
        "client_id":           body.client_id or "",
        "client_name":         body.client_name or "",
        "reminder_emails":     body.reminder_emails,
        "reminders_enabled":   body.reminders_enabled,
        "last_fetched":        now.isoformat(),
        "created_at":          now.isoformat(),
        "updated_at":          now.isoformat(),
        "created_by":          user.id,
        "raw_data":            raw,
        "scrape_source":       "quickcompany",
        "documents":           [],
        "hearings":            None,
        **dl,
    }
    await db.trademark_sphere.insert_one(doc)
    bg.add_task(_gen_reminders, tid, doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "raw_data")}


@router.post("/add-manual")
async def add_manual(
    body: TrademarkManualCreate, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    if await db.trademark_sphere.find_one({"application_number": body.application_number.strip()}):
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")
    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    raw = body.dict()
    doc = {
        "_id": tid, "id": tid, **raw,
        **_compute_deadlines(raw),
        "last_fetched":  None,
        "created_at":    now.isoformat(),
        "updated_at":    now.isoformat(),
        "created_by":    user.id,
        "raw_data":      {},
        "scrape_source": "manual",
        "documents":     [],
        "hearings":      None,
    }
    await db.trademark_sphere.insert_one(doc)
    bg.add_task(_gen_reminders, tid, doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "raw_data")}


@router.post("/import-attorney")
async def import_attorney(
    body: AttorneyImportRequest, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    bg.add_task(
        _import_attorney_bg,
        body.agent_code, user.id, body.attorney, body.client_id,
        body.client_name, body.reminder_emails, body.reminders_enabled,
        body.session_id, body.otp,
    )
    return {
        "message":    f"Attorney portfolio import started for '{body.agent_code}'.",
        "agent_code": body.agent_code,
    }


@router.post("/portal-sync")
async def portal_sync_route(
    body: PortalSyncRequest, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    sync_id = str(uuid.uuid4())
    _sync_progress[sync_id] = {"status": "queued", "phase": "Starting…",
                               "total": 0, "done": 0}
    bg.add_task(
        _portal_sync_bg, sync_id, body.agent_code.strip(),
        body.session_id, body.otp, user.id, body.attorney,
        body.client_id, body.reminder_emails, body.refresh_existing,
    )
    return {"sync_id": sync_id, "message": "Portal sync started."}


@router.get("/portal-sync/{sync_id}/status")
async def portal_sync_status(sync_id: str, user: User = Depends(get_current_user)):
    progress = _sync_progress.get(sync_id)
    if not progress:
        raise HTTPException(404, "Sync job not found.")
    return progress


@router.put("/{tm_id}")
async def update_tm(
    tm_id: str, body: TrademarkUpdateRequest, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    upd = {k: v for k, v in body.dict().items() if v is not None}
    upd["updated_at"] = datetime.now(IST).isoformat()
    res = await db.trademark_sphere.update_one({"id": tm_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    d = await db.trademark_sphere.find_one({"id": tm_id})
    bg.add_task(_gen_reminders, tm_id, d)
    return {k: v for k, v in d.items() if k != "_id"}


@router.post("/{tm_id}/refresh")
async def refresh_tm(tm_id: str, bg: BackgroundTasks, user: User = Depends(get_current_user)):
    d = await db.trademark_sphere.find_one({"id": tm_id})
    if not d:
        raise HTTPException(404, "Not found")
    raw = await scrape_trademark(d["application_number"])
    dl  = _compute_deadlines(raw)
    now = datetime.now(IST)
    upd = {
        **{k: raw.get(k) or d.get(k) for k in (
            "word_mark", "tm_status", "proprietor", "filing_date",
            "registration_date", "valid_upto", "goods_and_services",
            "trademark_image_url",
        )},
        "raw_data":      raw,
        "last_fetched":  now.isoformat(),
        "updated_at":    now.isoformat(),
        "scrape_source": "quickcompany_refresh",
        **dl,
    }
    await db.trademark_sphere.update_one({"id": tm_id}, {"$set": upd})
    bg.add_task(_gen_reminders, tm_id, {**d, **upd})
    return {k: v for k, v in {**d, **upd}.items() if k != "_id"}


@router.delete("/{tm_id}")
async def delete_tm(tm_id: str, user: User = Depends(get_current_user)):
    res = await db.trademark_sphere.delete_one({"id": tm_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await db.trademark_sphere_reminders.delete_many({"trademark_id": tm_id})
    return {"deleted": tm_id}
