import os, uuid, logging, asyncio, re
import requests as _requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta
from typing import Optional, List, Any, Dict
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trademark-sphere", tags=["trademark-sphere"])
IST    = ZoneInfo("Asia/Kolkata")
_pool  = ThreadPoolExecutor(max_workers=4)

EREGISTER_URL    = "https://tmrsearch.ipindia.gov.in/eregister/eregister.aspx"
AGENT_SEARCH_URL = "https://tmrsearch.ipindia.gov.in/eregister/Agent_Search.aspx"
DOC_INDEX_BASE   = "https://tmrsearch.ipindia.gov.in/eregister/Document_Index.aspx"

# ── Simple in-memory cache ────────────────────────────────────────────────────
tm_cache: Dict[str, Any] = {}

# ── Session store (in-memory, lives for duration of server process) ──────────
# Key: session_id (uuid), Value: {"cookies": ..., "created_at": ..., "email": ...}
_sessions: Dict[str, Any] = {}
SESSION_TTL_SECONDS = 4 * 3600  # 4 hours

ESTATUS_BASE    = "https://tmrsearch.ipindia.gov.in/estatus"
ESTATUS_LOGIN   = f"{ESTATUS_BASE}"
ESTATUS_SEARCH  = f"{ESTATUS_BASE}/TradeMarkApplication/ViewRegistered"

_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Connection":      "keep-alive",
}


def _make_session() -> _requests.Session:
    s = _requests.Session()
    s.headers.update(_HEADERS)
    return s


def _get_captcha_answer(soup: BeautifulSoup) -> Optional[str]:
    """Extract and solve the math captcha shown on IP India pages."""
    for el in soup.find_all(["span", "div", "td", "label", "p"]):
        text = el.get_text(" ", strip=True)
        m = re.search(r"(\d+)\s*([+\-*/x×÷])\s*(\d+)\s*=", text, re.IGNORECASE)
        if m:
            return _solve_math_captcha(text)
    return None


def _scraperapi_get_html(url: str) -> str:
    """Fetch any IP India URL via ScraperAPI (Indian IP, JS rendered)."""
    key = os.environ.get("SCRAPERAPI_KEY", "")
    if not key:
        raise HTTPException(500, "SCRAPERAPI_KEY not set in Render environment variables.")
    resp = _requests.get(
        "https://api.scraperapi.com/",
        params={"api_key": key, "url": url, "country_code": "in", "render": "true"},
        timeout=120,
    )
    if resp.status_code == 401:
        raise HTTPException(401, "Invalid ScraperAPI key.")
    if resp.status_code == 403:
        raise HTTPException(403, "ScraperAPI credit limit reached.")
    if resp.status_code != 200:
        raise HTTPException(502, f"ScraperAPI returned {resp.status_code} for {url}")
    return resp.text


def _scraperapi_post_html(url: str, data: dict) -> str:
    """POST to any IP India URL via ScraperAPI (Indian IP)."""
    key = os.environ.get("SCRAPERAPI_KEY", "")
    if not key:
        raise HTTPException(500, "SCRAPERAPI_KEY not set in Render environment variables.")
    resp = _requests.post(
        "https://api.scraperapi.com/",
        params={"api_key": key, "url": url, "country_code": "in", "render": "true"},
        data=data,
        timeout=120,
    )
    if resp.status_code == 401:
        raise HTTPException(401, "Invalid ScraperAPI key.")
    if resp.status_code == 403:
        raise HTTPException(403, "ScraperAPI credit limit reached.")
    # 200, 302 or any 2xx is fine
    return resp.text


def _send_otp_sync(email: str) -> str:
    """
    Step 1: Load IP India estatus login page via ScraperAPI (Indian IP),
    fill the email + captcha form, POST it to trigger OTP.
    Returns a session_id stored in _sessions.
    """
    logger.info(f"Loading estatus login page via ScraperAPI for {email}")

    # GET login page through ScraperAPI
    html = _scraperapi_get_html(ESTATUS_LOGIN)
    soup = BeautifulSoup(html, "lxml")

    # Build POST payload from hidden fields (ViewState etc.)
    payload: Dict[str, str] = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        if inp.get("name"):
            payload[inp["name"]] = inp.get("value", "")

    # Find email field
    email_field = None
    for inp in soup.find_all("input"):
        name = (inp.get("name") or "").lower()
        id_  = (inp.get("id")   or "").lower()
        if "email" in name or "email" in id_ or "mail" in name:
            email_field = inp.get("name") or inp.get("id")
            break
    if not email_field:
        first = soup.find("input", {"type": ["text", "email"]})
        email_field = first.get("name") or first.get("id") if first else "email"

    payload[email_field] = email

    # Solve math captcha
    captcha_answer = _get_captcha_answer(soup)
    if captcha_answer:
        for inp in soup.find_all("input"):
            n = (inp.get("name") or inp.get("id") or "").lower()
            if "captcha" in n or "answer" in n:
                payload[inp.get("name") or inp.get("id")] = captcha_answer
                break

    # Submit button
    btn = soup.find("input", {"type": "submit"}) or soup.find("button", {"type": "submit"})
    if btn and btn.get("name"):
        payload[btn["name"]] = btn.get("value", "Submit")

    logger.info(f"POSTing email form to {ESTATUS_LOGIN} via ScraperAPI")
    r2_html = _scraperapi_post_html(ESTATUS_LOGIN, payload)

    # Verify OTP was triggered
    if "otp" not in r2_html.lower() and "sent" not in r2_html.lower():
        logger.warning(f"Unexpected response after email submit: {r2_html[:300]}")
        raise HTTPException(400, "IP India did not send OTP. Check the email is registered on tmrsearch.ipindia.gov.in/estatus")

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "email":      email,
        "created_at": datetime.now(IST).isoformat(),
        "otp_page_html": r2_html,   # store OTP page HTML for next step
    }
    logger.info(f"OTP triggered for {email}, session_id={session_id}")
    return session_id


def _fetch_with_otp_sync(
    session_id: str,
    otp: str,
    app_number: str,
    class_number: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Step 2: Submit OTP via ScraperAPI, then scrape trademark data.
    Uses the stored OTP-page HTML from _send_otp_sync.
    """
    sess_data = _sessions.get(session_id)
    if not sess_data:
        raise HTTPException(401, "Session expired or invalid. Please start again.")

    created = datetime.fromisoformat(sess_data["created_at"])
    if (datetime.now(IST) - created).total_seconds() > SESSION_TTL_SECONDS:
        del _sessions[session_id]
        raise HTTPException(401, "Session expired (>4 hours). Please login again.")

    # Parse stored OTP page HTML
    otp_page_html = sess_data.get("otp_page_html", "")
    soup = BeautifulSoup(otp_page_html, "lxml")

    # Build OTP submit payload from hidden fields
    payload: Dict[str, str] = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        if inp.get("name"):
            payload[inp["name"]] = inp.get("value", "")

    # Fill OTP field
    otp_filled = False
    for inp in soup.find_all("input"):
        name = (inp.get("name") or "").lower()
        id_  = (inp.get("id")   or "").lower()
        if "otp" in name or "otp" in id_ or "code" in name or "answer" in name:
            payload[inp.get("name") or inp.get("id")] = otp
            otp_filled = True
            break
    if not otp_filled:
        # fallback — fill all non-hidden text inputs with OTP
        for inp in soup.find_all("input", {"type": ["text", "number"]}):
            if inp.get("name"):
                payload[inp["name"]] = otp

    # Captcha on OTP page
    cap_ans = _get_captcha_answer(soup)
    if cap_ans:
        for inp in soup.find_all("input"):
            n = (inp.get("name") or inp.get("id") or "").lower()
            if "captcha" in n or "answer" in n:
                payload[inp.get("name") or inp.get("id")] = cap_ans
                break

    btn = soup.find("input", {"type": "submit"}) or soup.find("button", {"type": "submit"})
    if btn and btn.get("name"):
        payload[btn["name"]] = btn.get("value", "Submit")

    logger.info(f"Submitting OTP for session {session_id} via ScraperAPI")
    login_result_html = _scraperapi_post_html(ESTATUS_LOGIN, payload)

    if "invalid" in login_result_html.lower() or "incorrect" in login_result_html.lower():
        raise HTTPException(401, "Incorrect OTP. Please try again.")

    # ── Now fetch trademark search page and submit ───────────────────────────
    cache_key = f"{app_number.strip()}_{(class_number or '').strip()}"
    if cache_key in tm_cache:
        logger.info(f"Cache hit for {cache_key}")
        return tm_cache[cache_key]

    logger.info(f"Loading trademark search page via ScraperAPI")
    search_html = _scraperapi_get_html(ESTATUS_SEARCH)
    search_soup = BeautifulSoup(search_html, "lxml")

    search_payload: Dict[str, str] = {}
    for inp in search_soup.find_all("input", {"type": "hidden"}):
        if inp.get("name"):
            search_payload[inp["name"]] = inp.get("value", "")

    # Fill application number
    for inp in search_soup.find_all("input", {"type": ["text", "number"]}):
        name = (inp.get("name") or "").lower()
        id_  = (inp.get("id")   or "").lower()
        if "number" in name or "appno" in name or "number" in id_ or "appno" in id_:
            search_payload[inp.get("name") or inp.get("id")] = app_number.strip()
            break

    # Captcha on search page
    cap_ans2 = _get_captcha_answer(search_soup)
    if cap_ans2:
        for inp in search_soup.find_all("input"):
            n = (inp.get("name") or inp.get("id") or "").lower()
            if "captcha" in n or "answer" in n:
                search_payload[inp.get("name") or inp.get("id")] = cap_ans2
                break

    sbtn = search_soup.find("input", {"type": "submit"}) or search_soup.find("button", {"type": "submit"})
    if sbtn and sbtn.get("name"):
        search_payload[sbtn["name"]] = sbtn.get("value", "View")

    logger.info(f"Submitting trademark search for {app_number} via ScraperAPI")
    result_html = _scraperapi_post_html(ESTATUS_SEARCH, search_payload)
    result_soup = BeautifulSoup(result_html, "lxml")
    data = _parse_tables(result_soup)

    # Trademark image
    for img in result_soup.find_all("img"):
        src = img.get("src", "")
        if any(k in src.lower() for k in ["trademark", "tm_", "/tm/", "image"]):
            data["trademark_image_url"] = (
                src if src.startswith("http")
                else f"https://tmrsearch.ipindia.gov.in/{src.lstrip('/')}"
            )
            break

    # Goods & Services
    for el in result_soup.find_all("textarea"):
        t = _clean(el.get_text(" ", strip=True))
        if t and len(t) > 20:
            data["goods_and_services"] = t
            break
    if "goods_and_services" not in data:
        for td in result_soup.find_all("td"):
            text = _clean(td.get_text(" ", strip=True))
            prev = td.find_previous_sibling("td")
            if text and len(text) > 80 and prev:
                lbl = (prev.get_text(" ", strip=True) or "").lower()
                if any(k in lbl for k in ["goods", "service", "description"]):
                    data["goods_and_services"] = text
                    break

    if len(data) < 3:
        raise HTTPException(404, f"No data found for '{app_number}'. Verify the number.")

    data.setdefault("application_number", app_number.strip())
    tm_cache[cache_key] = data
    return data


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
    attorney:           Optional[str]  = None
    client_id:          Optional[str]  = None
    client_name:        Optional[str]  = None
    reminder_emails:    List[str]      = Field(default_factory=list)
    reminders_enabled:  bool           = True
    session_id:         Optional[str]  = None
    otp:                Optional[str]  = None


class TrademarkDocument(BaseModel):
    name:     str
    pdf_link: Optional[str] = None


class TrademarkHearing(BaseModel):
    date:    Optional[str] = None
    officer: Optional[str] = None


# ── Field alias map ───────────────────────────────────────────────────────────

_ALIASES = {
    "application_no":        "application_number",
    "appl_no":               "application_number",
    "tm_applied_for":        "word_mark",
    "trade_mark":            "word_mark",
    "proprietor_s_name":     "proprietor",
    "proprietors_name":      "proprietor",
    "applicant_s_name":      "applicant_name",
    "applicants_name":       "applicant_name",
    "date_of_application":   "filing_date",
    "class_no":              "class_number",
    "nice_class":            "class_number",
    "class":                 "class_number",
    "status":                "tm_status",
    "date_of_registration":  "registration_date",
    "date_of_expiry":        "valid_upto",
    "renewal_date":          "valid_upto",
    "date_of_advertisement": "publication_date",
}

# Document labels to capture from Document_Index.aspx
_DOC_LABELS = {
    "examination report",
    "objection",
    "opposition",
    "counter statement",
    "hearing notice",
    "show cause notice",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(t: Any) -> Optional[str]:
    return " ".join((t or "").split()).strip() or None


def _to_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def _parse_tables(soup: BeautifulSoup) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) >= 2:
                lbl = _clean(cells[0].get_text(" ", strip=True))
                val = _clean(cells[1].get_text(" ", strip=True))
                if lbl and val and len(lbl) < 80:
                    k = _to_key(lbl)
                    if k not in data:
                        data[k] = val
    for old, new in _ALIASES.items():
        if old in data and new not in data:
            data[new] = data.pop(old)
    return data


# ── Math captcha solver ───────────────────────────────────────────────────────

_MATH_CAPTCHA_RE = re.compile(
    r"(\d+)\s*([+\-*/x×÷])\s*(\d+)",
    re.IGNORECASE,
)
_OP_MAP = {"x": "*", "×": "*", "÷": "/"}


def _solve_math_captcha(text: str) -> Optional[str]:
    m = _MATH_CAPTCHA_RE.search(text or "")
    if not m:
        return None
    a, op, b = m.group(1), m.group(2), m.group(3)
    op = _OP_MAP.get(op, op)
    try:
        result = eval(f"{a}{op}{b}", {"__builtins__": {}})   # noqa: S307
        return str(int(result))
    except Exception:
        return None



# ── Core scraper ──────────────────────────────────────────────────────────────

def _build_eregister_url(app_number: str, class_number: Optional[str] = None) -> str:
    params: Dict[str, str] = {"app_no": app_number.strip()}
    if class_number:
        cls = re.sub(r"(?i)class\s*", "", class_number.strip())
        params["class_no"] = cls
    return EREGISTER_URL + "?" + urlencode(params)


def _build_doc_index_url(app_number: str, class_number: Optional[str] = None) -> str:
    params: Dict[str, str] = {"app_no": app_number.strip()}
    if class_number:
        cls = re.sub(r"(?i)class\s*", "", class_number.strip())
        params["class_no"] = cls
    return DOC_INDEX_BASE + "?" + urlencode(params)


def _build_agent_search_url(agent_code: str) -> str:
    return AGENT_SEARCH_URL + "?" + urlencode({"agent_code": agent_code.strip()})


def _scrape_sync(
    app_number: str,
    class_number: Optional[str] = None,
    session_id: Optional[str] = None,
    otp: Optional[str] = None,
) -> Dict[str, Any]:
    """Fetch trademark data using OTP-authenticated IP India session."""
    if not session_id or not otp:
        raise HTTPException(400, "Login required. Please provide email and OTP.")
    return _fetch_with_otp_sync(session_id, otp, app_number, class_number)


def _scrape_documents_sync(
    app_number: str, class_number: Optional[str] = None
) -> tuple[List[Dict], Optional[Dict]]:
    """Fetch Document_Index.aspx via direct request."""
    target_url = _build_doc_index_url(app_number, class_number)
    logger.info(f"Fetching Document_Index: {target_url}")

    try:
        resp = _requests.get(target_url, headers=_HEADERS, timeout=30)
        html = resp.text if resp.status_code == 200 else ""
    except HTTPException as exc:
        logger.warning(f"Document_Index fetch failed for {app_number}: {exc.detail}")
        return [], None

    soup = BeautifulSoup(html, "lxml")
    base = "https://tmrsearch.ipindia.gov.in"
    documents: List[Dict] = []
    hearing: Optional[Dict] = None

    for table in soup.find_all("table"):
        header_texts = [_clean(th.get_text(" ", strip=True)) or "" for th in table.find_all("th")]
        header_lower = " ".join(header_texts).lower()
        if not any(k in header_lower for k in ["document", "description", "type", "index"]):
            continue
        for row in table.find_all("tr")[1:]:
            cells = row.find_all("td")
            if len(cells) < 1:
                continue
            doc_name = _clean(cells[0].get_text(" ", strip=True)) or ""
            if not doc_name and len(cells) > 1:
                doc_name = _clean(cells[1].get_text(" ", strip=True)) or ""
            doc_lower = doc_name.lower()
            if not any(lbl in doc_lower for lbl in _DOC_LABELS):
                continue
            pdf_link = None
            anchor = row.find("a", href=True)
            if anchor:
                href = anchor["href"]
                pdf_link = href if href.startswith("http") else f"{base}/{href.lstrip('/')}"
            documents.append({"name": doc_name, "pdf_link": pdf_link})
            if "hearing notice" in doc_lower or "show cause notice" in doc_lower:
                h_date    = _clean(cells[1].get_text(" ", strip=True)) if len(cells) > 1 else None
                h_officer = _clean(cells[2].get_text(" ", strip=True)) if len(cells) > 2 else None
                hearing   = {"date": h_date, "officer": h_officer}

    logger.info(f"Document_Index for {app_number}: {len(documents)} docs, hearing={'yes' if hearing else 'no'}")
    return documents, hearing


def _scrape_by_attorney_sync(
    agent_code: str,
    session_id: Optional[str] = None,
    otp: Optional[str] = None,
) -> List[str]:
    """Fetch Agent_Search.aspx using authenticated IP India session."""
    target_url = _build_agent_search_url(agent_code)
    logger.info(f"Fetching Agent_Search: {target_url}")

    # Use authenticated session if available
    if session_id and otp:
        sess_data = _sessions.get(session_id)
        if sess_data:
            sess = _make_session()
            sess.cookies.update(sess_data["cookies"])
            resp = sess.get(target_url, timeout=30)
            html = resp.text if resp.status_code == 200 else ""
        else:
            html = ""
    else:
        resp = _requests.get(target_url, headers=_HEADERS, timeout=30)
        html = resp.text
    soup = BeautifulSoup(html, "lxml")
    app_numbers: List[str] = []
    seen: set = set()

    for a in soup.find_all("a", href=True):
        m = re.search(r"[?&]app_no=(\d+)", a["href"], re.IGNORECASE)
        if m:
            num = m.group(1)
            if num not in seen:
                seen.add(num)
                app_numbers.append(num)

    if not app_numbers:
        for table in soup.find_all("table"):
            for row in table.find_all("tr")[1:]:
                for cell in row.find_all("td"):
                    text = _clean(cell.get_text(" ", strip=True)) or ""
                    if re.fullmatch(r"\d{7,}", text) and text not in seen:
                        seen.add(text)
                        app_numbers.append(text)

    logger.info(f"Attorney {agent_code}: found {len(app_numbers)} application numbers.")
    return app_numbers


# ── Async wrappers ────────────────────────────────────────────────────────────

async def scrape_trademark(
    app_number: str,
    class_number: Optional[str] = None,
    session_id: Optional[str] = None,
    otp: Optional[str] = None,
) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _pool, _scrape_sync, app_number, class_number, session_id, otp
    )


async def send_otp(email: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _send_otp_sync, email)


async def scrape_documents(app_number: str, class_number: Optional[str] = None):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _scrape_documents_sync, app_number, class_number)


async def scrape_by_attorney_code(
    agent_code: str,
    session_id: Optional[str] = None,
    otp: Optional[str] = None,
) -> List[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _scrape_by_attorney_sync, agent_code, session_id, otp)

# ── Deadline logic ────────────────────────────────────────────────────────────

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
    now = date.today()
    dl: Dict[str, Any] = {}
    rd  = _parse_date(tm.get("valid_upto") or tm.get("renewal_date"))
    if not rd:
        reg = _parse_date(tm.get("registration_date"))
        if reg:
            rd = reg.replace(year=reg.year + 10)
    if rd:
        days = (rd - now).days
        dl.update(
            renewal_date       = rd.strftime("%Y-%m-%d"),
            days_until_renewal = days,
            renewal_status     = (
                "overdue"  if days < 0   else
                "critical" if days <= 30 else
                "warning"  if days <= 90 else
                "upcoming" if days <= 180 else "ok"
            ),
        )
    pub = _parse_date(tm.get("publication_date"))
    if pub:
        od = pub + timedelta(days=120)
        d2 = (od - now).days
        if d2 >= 0:
            dl.update(
                opposition_deadline   = od.strftime("%Y-%m-%d"),
                days_until_opposition = d2,
            )
    return dl


async def _gen_reminders(tm_id: str, tm: Dict[str, Any]) -> None:
    await db.trademark_sphere_reminders.delete_many({"trademark_id": tm_id, "auto_generated": True})
    now       = datetime.now(IST)
    reminders = []
    rd_str    = tm.get("renewal_date")
    if rd_str:
        rd = _parse_date(rd_str)
        if rd and rd > date.today():
            for days in REMINDER_DAYS:
                ron = rd - timedelta(days=days)
                if ron >= date.today():
                    r = {
                        "id":                 str(uuid.uuid4()),
                        "trademark_id":       tm_id,
                        "application_number": tm.get("application_number"),
                        "word_mark":          tm.get("word_mark"),
                        "type":               "renewal",
                        "label":              f"Renewal due in {days} days",
                        "remind_on":          ron.strftime("%Y-%m-%d"),
                        "renewal_date":       rd_str,
                        "days_before":        days,
                        "sent":               False,
                        "auto_generated":     True,
                        "created_at":         now.isoformat(),
                    }
                    reminders.append(r)
    if reminders:
        await db.trademark_sphere_reminders.insert_many([{**r, "_id": r["id"]} for r in reminders])
    logger.info(f"Generated {len(reminders)} reminders for TM {tm_id}")


# ── Background task: import attorney portfolio ────────────────────────────────

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
    """
    Background task: scrape every application number for the given agent_code
    using Playwright, then add each one to the database (skipping duplicates).
    Also fetches Document_Index.aspx for hearing/examination report data.

    A 2-second sleep is inserted between each request to be polite to the server.
    """
    try:
        app_numbers = await scrape_by_attorney_code(agent_code, session_id, otp)
    except HTTPException as exc:
        logger.error(f"Attorney import failed for {agent_code}: {exc.detail}")
        return

    added = 0
    for app_num in app_numbers:
        existing = await db.trademark_sphere.find_one({"application_number": app_num})
        if existing:
            logger.info(f"Attorney import: {app_num} already tracked, skipping.")
            continue

        # ── Polite delay between requests ──────────────────────────────────
        await asyncio.sleep(2)

        try:
            raw = await scrape_trademark(app_num, session_id=session_id, otp=otp)
        except HTTPException as exc:
            logger.warning(f"Attorney import: could not scrape {app_num} — {exc.detail}")
            continue

        # Polite delay before fetching the document index
        await asyncio.sleep(2)

        try:
            documents, hearing = await scrape_documents(app_num, raw.get("class_number"))
        except Exception:
            documents, hearing = [], None

        dl  = _compute_deadlines(raw)
        now = datetime.now(IST)
        tid = str(uuid.uuid4())
        doc = {
            "id":                  tid,
            "application_number":  app_num,
            "word_mark":           raw.get("word_mark", ""),
            "class_number":        raw.get("class_number", ""),
            "tm_status":           raw.get("tm_status", "Unknown"),
            "proprietor":          raw.get("proprietor") or raw.get("applicant_name", ""),
            "applicant_name":      raw.get("applicant_name", ""),
            "filing_date":         raw.get("filing_date", ""),
            "registration_date":   raw.get("registration_date", ""),
            "valid_upto":          raw.get("valid_upto", ""),
            "goods_and_services":  raw.get("goods_and_services", ""),
            "trademark_image_url": raw.get("trademark_image_url", ""),
            "address":             raw.get("address", ""),
            "attorney":            attorney or "",
            "notes":               f"Imported via attorney portfolio ({agent_code})",
            "client_id":           client_id  or "",
            "client_name":         client_name or "",
            "reminder_emails":     reminder_emails,
            "reminders_enabled":   reminders_enabled,
            "last_fetched":        now.isoformat(),
            "created_at":          now.isoformat(),
            "updated_at":          now.isoformat(),
            "created_by":          created_by,
            "raw_data":            raw,
            "scrape_source":       "attorney_import",
            "documents":           documents,
            "hearings":            hearing,
            **dl,
        }
        await db.trademark_sphere.insert_one({**doc, "_id": tid})
        await _gen_reminders(tid, doc)
        added += 1

    logger.info(f"Attorney import ({agent_code}): {added}/{len(app_numbers)} trademarks added.")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(user: User = Depends(get_current_user)):
    t   = date.today().strftime("%Y-%m-%d")
    d90 = (date.today() + timedelta(days=90)).strftime("%Y-%m-%d")
    d30 = (date.today() + timedelta(days=30)).strftime("%Y-%m-%d")
    return dict(
        total              = await db.trademark_sphere.count_documents({}),
        registered         = await db.trademark_sphere.count_documents({"tm_status": "Registered"}),
        pending            = await db.trademark_sphere.count_documents({"tm_status": {"$in": ["Pending", "Under Examination", "Advertised Before Acceptance", "Accepted & Advertised"]}}),
        expiring_soon      = await db.trademark_sphere.count_documents({"renewal_date": {"$gte": t, "$lte": d90}}),
        overdue            = await db.trademark_sphere.count_documents({"renewal_date": {"$lt": t}}),
        upcoming_reminders = await db.trademark_sphere_reminders.count_documents({"remind_on": {"$gte": t, "$lte": d30}, "sent": False}),
    )


@router.get("/list")
async def list_trademarks(
    search:        str = Query(None),
    tm_status:     str = Query(None),
    class_number:  str = Query(None),
    client_id:     str = Query(None),
    renewal_alert: str = Query(None),
    skip:          int = Query(0,   ge=0),
    limit:         int = Query(50,  ge=1, le=200),
    user: User = Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if search:
        q["$or"] = [
            {"word_mark":          {"$regex": search, "$options": "i"}},
            {"application_number": {"$regex": search, "$options": "i"}},
            {"proprietor":         {"$regex": search, "$options": "i"}},
            {"client_name":        {"$regex": search, "$options": "i"}},
        ]
    if tm_status:     q["tm_status"]      = tm_status
    if class_number:  q["class_number"]   = class_number
    if client_id:     q["client_id"]      = client_id
    if renewal_alert: q["renewal_status"] = renewal_alert
    items = (
        await db.trademark_sphere
        .find(q, {"_id": 0, "raw_data": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )
    return {"items": items, "total": await db.trademark_sphere.count_documents(q), "skip": skip, "limit": limit}


@router.get("/deadlines")
async def get_deadlines(days: int = Query(180, ge=1, le=730), user: User = Depends(get_current_user)):
    t = date.today().strftime("%Y-%m-%d")
    c = (date.today() + timedelta(days=days)).strftime("%Y-%m-%d")
    upcoming = await db.trademark_sphere.find({"renewal_date": {"$gte": t, "$lte": c}}, {"_id": 0, "raw_data": 0}).sort("days_until_renewal", 1).to_list(200)
    overdue  = await db.trademark_sphere.find({"renewal_date": {"$lt":  t}},              {"_id": 0, "raw_data": 0}).sort("renewal_date",        1).to_list(50)
    return {"upcoming": upcoming, "overdue": overdue, "days_window": days}


@router.get("/reminders")
async def get_reminders(
    upcoming_only: bool = Query(True),
    skip:          int  = Query(0,   ge=0),
    limit:         int  = Query(100, ge=1, le=500),
    user: User = Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if upcoming_only:
        q = {"remind_on": {"$gte": date.today().strftime("%Y-%m-%d")}, "sent": False}
    items = (
        await db.trademark_sphere_reminders
        .find(q, {"_id": 0})
        .sort("remind_on", 1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    return {"items": items, "total": len(items)}


@router.get("/constants/all")
async def constants(user: User = Depends(get_current_user)):
    return {"statuses": TM_STATUSES, "nice_classes": NICE_CLASSES, "renewal_alert_days": REMINDER_DAYS}


@router.get("/{tm_id}")
async def get_tm(tm_id: str, user: User = Depends(get_current_user)):
    doc = await db.trademark_sphere.find_one({"id": tm_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Trademark not found.")
    return doc


@router.post("/send-otp")
async def send_otp_route(body: SendOtpRequest, user: User = Depends(get_current_user)):
    """
    Step 1 of fetch flow: trigger OTP email from IP India.
    Returns a session_id the frontend must pass back with the OTP.
    """
    session_id = await send_otp(body.email)
    return {"session_id": session_id, "message": "OTP sent to your email. Enter it to continue."}


@router.post("/fetch-preview")
async def fetch_preview(body: TrademarkAddRequest, user: User = Depends(get_current_user)):
    """
    Step 2 of fetch flow: verify OTP, login, scrape trademark data.
    Requires session_id (from /send-otp) and otp (from user's email).
    """
    data = await scrape_trademark(
        body.application_number,
        body.class_number,
        body.session_id,
        body.otp,
    )
    return {**data, **_compute_deadlines(data)}


@router.post("/add")
async def add_trademark(body: TrademarkAddRequest, bg: BackgroundTasks, user: User = Depends(get_current_user)):
    if await db.trademark_sphere.find_one({"application_number": body.application_number.strip()}):
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")
    raw = body.manual_data or await scrape_trademark(
        body.application_number, body.class_number, body.session_id, body.otp
    )
    dl  = _compute_deadlines(raw)
    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    doc = {
        "id":                  tid,
        "application_number":  body.application_number.strip(),
        "word_mark":           raw.get("word_mark", ""),
        "class_number":        raw.get("class_number") or body.class_number or "",
        "tm_status":           raw.get("tm_status", "Unknown"),
        "proprietor":          raw.get("proprietor") or raw.get("applicant_name", ""),
        "applicant_name":      raw.get("applicant_name", ""),
        "filing_date":         raw.get("filing_date", ""),
        "registration_date":   raw.get("registration_date", ""),
        "valid_upto":          raw.get("valid_upto", ""),
        "goods_and_services":  raw.get("goods_and_services", ""),
        "trademark_image_url": raw.get("trademark_image_url", ""),
        "address":             raw.get("address", ""),
        "attorney":            body.attorney or "",
        "notes":               body.notes    or "",
        "client_id":           body.client_id   or "",
        "client_name":         body.client_name or "",
        "reminder_emails":     body.reminder_emails,
        "reminders_enabled":   body.reminders_enabled,
        "last_fetched":        now.isoformat(),
        "created_at":          now.isoformat(),
        "updated_at":          now.isoformat(),
        "created_by":          user.id,
        "raw_data":            raw,
        "scrape_source":       "auto",
        "documents":           [],
        "hearings":            None,
        **dl,
    }
    await db.trademark_sphere.insert_one({**doc, "_id": tid})
    bg.add_task(_gen_reminders, tid, doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "raw_data")}


@router.post("/add-manual")
async def add_manual(body: TrademarkManualCreate, bg: BackgroundTasks, user: User = Depends(get_current_user)):
    if await db.trademark_sphere.find_one({"application_number": body.application_number.strip()}):
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")
    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    raw = body.dict()
    dl  = _compute_deadlines(raw)
    doc = {
        "id": tid,
        **raw,
        **dl,
        "last_fetched":  None,
        "created_at":    now.isoformat(),
        "updated_at":    now.isoformat(),
        "created_by":    user.id,
        "raw_data":      {},
        "scrape_source": "manual",
        "documents":     [],
        "hearings":      None,
    }
    await db.trademark_sphere.insert_one({**doc, "_id": tid})
    bg.add_task(_gen_reminders, tid, doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "raw_data")}


@router.post("/import-attorney")
async def import_attorney(
    body: AttorneyImportRequest,
    bg:   BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """
    Kick off a background import of all trademarks associated with an attorney/agent code.
    The background task uses Playwright to fetch Agent_Search.aspx, extracts all application
    numbers, then fetches and stores each trademark (skipping duplicates).
    Document_Index.aspx is also queried per trademark for hearing/examination data.
    A 2-second sleep between each request is polite to the IP India server.
    """
    bg.add_task(
        _import_attorney_bg,
        body.agent_code,
        user.id,
        body.attorney,
        body.client_id,
        body.client_name,
        body.reminder_emails,
        body.reminders_enabled,
        body.session_id,
        body.otp,
    )
    return {
        "message": (
            f"Attorney portfolio import started for agent code '{body.agent_code}'. "
            "Trademarks will appear in the list as they are processed (typically 2-5 minutes)."
        ),
        "agent_code": body.agent_code,
    }


@router.put("/{tm_id}")
async def update_tm(tm_id: str, body: TrademarkUpdateRequest, bg: BackgroundTasks, user: User = Depends(get_current_user)):
    doc = await db.trademark_sphere.find_one({"id": tm_id})
    if not doc:
        raise HTTPException(404, "Trademark not found.")
    updates = {k: v for k, v in body.dict(exclude_none=True).items()}
    if updates:
        updates["updated_at"] = datetime.now(IST).isoformat()
        merged = {**doc, **updates}
        updates.update(_compute_deadlines(merged))
        await db.trademark_sphere.update_one({"id": tm_id}, {"$set": updates})
        if any(k in updates for k in ("valid_upto", "registration_date")):
            bg.add_task(_gen_reminders, tm_id, merged)
    return await db.trademark_sphere.find_one({"id": tm_id}, {"_id": 0, "raw_data": 0})


@router.post("/{tm_id}/refresh")
async def refresh_tm(tm_id: str, bg: BackgroundTasks, user: User = Depends(get_current_user)):
    doc = await db.trademark_sphere.find_one({"id": tm_id})
    if not doc:
        raise HTTPException(404, "Trademark not found.")

    # Refresh core trademark data via Playwright
    nd  = await scrape_trademark(doc["application_number"], doc.get("class_number"))
    dl  = _compute_deadlines(nd)
    now = datetime.now(IST)

    # Refresh documents and hearings from Document_Index.aspx via Playwright
    documents, hearing = await scrape_documents(doc["application_number"], doc.get("class_number"))

    updates = {
        **{
            k: nd.get(k) or doc.get(k)
            for k in (
                "word_mark", "tm_status", "proprietor", "filing_date",
                "registration_date", "valid_upto", "goods_and_services",
                "trademark_image_url",
            )
        },
        "raw_data":      nd,
        "last_fetched":  now.isoformat(),
        "updated_at":    now.isoformat(),
        "scrape_source": "auto",
        "documents":     documents if documents else doc.get("documents", []),
        "hearings":      hearing   if hearing   else doc.get("hearings"),
        **dl,
    }
    await db.trademark_sphere.update_one({"id": tm_id}, {"$set": updates})
    merged = {**doc, **updates}
    bg.add_task(_gen_reminders, tm_id, merged)
    return {k: v for k, v in merged.items() if k not in ("_id", "raw_data")}


@router.delete("/{tm_id}")
async def delete_tm(tm_id: str, user: User = Depends(get_current_user)):
    if not await db.trademark_sphere.find_one({"id": tm_id}):
        raise HTTPException(404, "Not found.")
    await db.trademark_sphere.delete_one({"id": tm_id})
    await db.trademark_sphere_reminders.delete_many({"trademark_id": tm_id})
    return {"success": True, "deleted_id": tm_id}
