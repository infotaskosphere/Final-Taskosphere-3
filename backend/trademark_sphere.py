"""
trademark_sphere.py — Trademark Sphere Backend Router
======================================================
Drop into: backend/trademark_sphere.py

Scraping uses ONLY:  curl_cffi + beautifulsoup4 + lxml
  pip install curl_cffi beautifulsoup4 lxml
  (No Playwright, no browser install, no paid service — completely free)

⚠️  Run the backend on a local / residential IP.
    IP India blocks data-centre/cloud IPs for ALL HTTP clients.
"""

import uuid, logging, asyncio, re, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta
from typing import Optional, List, Any, Dict
from zoneinfo import ZoneInfo

from curl_cffi import requests as curlex          # replaces `requests`
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trademark-sphere", tags=["trademark-sphere"])
IST    = ZoneInfo("Asia/Kolkata")
_pool  = ThreadPoolExecutor(max_workers=4)

EREGISTER_URL  = "https://tmrsearch.ipindia.gov.in/eregister/eregister.aspx"
AGENT_SEARCH_URL = "https://tmrsearch.ipindia.gov.in/eregister/Agent_Search.aspx"
TM_STATUSES    = [
    "Registered", "Pending", "Objected", "Opposed", "Refused", "Abandoned",
    "Withdrawn", "Under Examination", "Advertised Before Acceptance",
    "Accepted & Advertised", "Send to Vienna Codification", "Unknown",
]
NICE_CLASSES  = [str(i) for i in range(1, 46)]
REMINDER_DAYS = [365, 180, 90, 60, 30, 15, 7]

# ── Pydantic models ───────────────────────────────────────────────────────────

class TrademarkAddRequest(BaseModel):
    application_number: str
    class_number:       Optional[str]           = None
    client_id:          Optional[str]           = None
    client_name:        Optional[str]           = None
    attorney:           Optional[str]           = None
    notes:              Optional[str]           = None
    reminder_emails:    List[str]               = Field(default_factory=list)
    reminders_enabled:  bool                    = True
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


class TrademarkDocument(BaseModel):
    name:     str
    pdf_link: Optional[str] = None


class TrademarkHearing(BaseModel):
    date:    Optional[str] = None
    officer: Optional[str] = None


# ── Headers (enhanced with Sec-Ch-Ua fields) ─────────────────────────────────

_HEADERS = {
    "User-Agent":               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":                   "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":          "en-IN,en;q=0.9",
    "Accept-Encoding":          "gzip, deflate, br",
    "Connection":               "keep-alive",
    "Upgrade-Insecure-Requests":"1",
    "Sec-Ch-Ua":                '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile":         "?0",
    "Sec-Ch-Ua-Platform":       '"Windows"',
    "Origin":                   "https://tmrsearch.ipindia.gov.in",
}

_ALIASES = {
    "application_no":       "application_number",
    "appl_no":              "application_number",
    "tm_applied_for":       "word_mark",
    "trade_mark":           "word_mark",
    "proprietor_s_name":    "proprietor",
    "proprietors_name":     "proprietor",
    "applicant_s_name":     "applicant_name",
    "applicants_name":      "applicant_name",
    "date_of_application":  "filing_date",
    "class_no":             "class_number",
    "nice_class":           "class_number",
    "class":                "class_number",
    "status":               "tm_status",
    "date_of_registration": "registration_date",
    "date_of_expiry":       "valid_upto",
    "renewal_date":         "valid_upto",
    "date_of_advertisement":"publication_date",
}

# Document labels to look for in the Document Index table
_DOC_LABELS = {
    "examination report", "opposition", "counter statement", "hearing notice",
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


def _collect_hidden(soup: BeautifulSoup) -> Dict[str, str]:
    """Extract all hidden form inputs including ViewState and EventValidation."""
    return {
        inp["name"]: inp.get("value", "")
        for inp in soup.find_all("input", type="hidden")
        if inp.get("name")
    }


# ── Math captcha solver ───────────────────────────────────────────────────────

_MATH_CAPTCHA_RE = re.compile(
    r"(\d+)\s*([+\-*/x×÷])\s*(\d+)",
    re.IGNORECASE,
)
_OP_MAP = {"x": "*", "×": "*", "÷": "/"}


def _solve_math_captcha(text: str) -> Optional[str]:
    """
    Identify and solve simple arithmetic captchas embedded in page text.
    e.g. "5 + 2", "8 × 3", "12 - 4".
    Returns the string result or None if no captcha found.
    """
    m = _MATH_CAPTCHA_RE.search(text or "")
    if not m:
        return None
    a, op, b = m.group(1), m.group(2), m.group(3)
    op = _OP_MAP.get(op, op)
    try:
        # safe: only operates on two integers with a basic arithmetic operator
        result = eval(f"{a}{op}{b}", {"__builtins__": {}})   # noqa: S307
        return str(int(result))
    except Exception:
        return None


def _find_and_fill_captcha(soup: BeautifulSoup, payload: Dict[str, str]) -> bool:
    """
    Search the page for a math captcha input; if found, compute and inject the answer.
    Returns True if a captcha was detected (regardless of whether it was solved).
    """
    for el in soup.find_all(["label", "span", "td", "div"]):
        text = _clean(el.get_text(" ", strip=True))
        if text and _MATH_CAPTCHA_RE.search(text):
            answer = _solve_math_captcha(text)
            if answer is None:
                return True  # captcha found but unsolvable (non-math)
            # Find the nearest text/number input to inject the answer
            parent = el.find_parent(["tr", "div", "form"]) or el
            for inp in parent.find_all("input", type=["text", "number", None]):
                name = inp.get("name") or inp.get("id")
                if name and any(k in name.lower() for k in ["captcha", "code", "verify", "answer"]):
                    payload[name] = answer
                    logger.info(f"Math captcha solved: '{text}' → {answer}")
                    return True
            # fallback: inject into first unnamed text input near the label
            for inp in parent.find_all("input"):
                name = inp.get("name") or inp.get("id")
                if name:
                    payload[name] = answer
                    return True
    return False


# ── curl_cffi session factory ─────────────────────────────────────────────────

def _make_session() -> curlex.Session:
    """Return a curl_cffi session impersonating Chrome 124."""
    session = curlex.Session(impersonate="chrome124")
    session.headers.update(_HEADERS)
    return session


# ── Core scraper ──────────────────────────────────────────────────────────────

def _scrape_sync(
    app_number: str,
    class_number: Optional[str] = None,
    max_retries: int = 3,
) -> Dict[str, Any]:
    session = _make_session()

    # ── Step 1: GET page → collect cookies + hidden fields ─────────────────
    r1 = None
    for attempt in range(1, max_retries + 1):
        try:
            r1 = session.get(EREGISTER_URL, timeout=20)
            if r1.status_code == 403:
                logger.warning(f"403 on GET attempt {attempt}/{max_retries}; retrying in 2s…")
                time.sleep(2)
                continue
            break
        except curlex.exceptions.ConnectionError:
            if attempt == max_retries:
                raise HTTPException(503, "Cannot reach IP India portal.")
            time.sleep(2)
        except curlex.exceptions.Timeout:
            if attempt == max_retries:
                raise HTTPException(504, "IP India portal timed out.")
            time.sleep(2)

    if r1 is None or r1.status_code == 403:
        raise HTTPException(
            403,
            "IP India returned 403 after retries. This typically happens on "
            "cloud/VPS IPs. Run the backend locally, or use 'Add Manually'.",
        )
    if r1.status_code != 200:
        raise HTTPException(502, f"IP India returned HTTP {r1.status_code}.")

    soup1 = BeautifulSoup(r1.text, "lxml")
    hidden = _collect_hidden(soup1)   # ViewState, EventValidation, __VIEWSTATEGENERATOR …

    # Locate application-number input field
    app_field = next(
        (
            (inp.get("name") or inp.get("id"))
            for inp in soup1.find_all("input", type="text")
            if any(
                k in (inp.get("name", "") + inp.get("id", "")).lower()
                for k in ["appno", "appnum", "applicationno", "txtapp"]
            )
        ),
        None,
    )
    if not app_field:
        all_txt = soup1.find_all("input", type="text")
        app_field = (all_txt[0].get("name") or all_txt[0].get("id")) if all_txt else "txtApplicationNo"

    # Locate class field (optional)
    class_field = None
    if class_number:
        class_field = next(
            (
                (inp.get("name") or inp.get("id"))
                for inp in soup1.find_all("input", type="text")
                if any(k in (inp.get("name", "") + inp.get("id", "")).lower() for k in ["class", "classno"])
            ),
            None,
        )

    # Locate submit button
    submit_btn   = soup1.find("input", type="submit") or soup1.find("button", type="submit")
    submit_name  = submit_btn.get("name")             if submit_btn else None
    submit_value = submit_btn.get("value", "View")    if submit_btn else "View"

    # Build POST payload
    payload: Dict[str, str] = {**hidden, app_field: app_number.strip()}
    if class_field and class_number:
        payload[class_field] = class_number.strip()
    if submit_name:
        payload[submit_name] = submit_value

    # Solve math captcha on the initial page (if any)
    _find_and_fill_captcha(soup1, payload)

    # ── Step 2: POST form ──────────────────────────────────────────────────
    r2 = None
    for attempt in range(1, max_retries + 1):
        try:
            r2 = session.post(
                EREGISTER_URL,
                data=payload,
                timeout=25,
                headers={
                    **_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer":      EREGISTER_URL,
                },
            )
            if r2.status_code == 403:
                logger.warning(f"403 on POST attempt {attempt}/{max_retries}; retrying in 2s…")
                time.sleep(2)
                continue
            break
        except curlex.exceptions.Timeout:
            if attempt == max_retries:
                raise HTTPException(504, "IP India timed out on form submit.")
            time.sleep(2)
        except curlex.exceptions.RequestException as exc:
            raise HTTPException(502, f"Network error: {exc}")

    if r2 is None or r2.status_code == 403:
        raise HTTPException(
            403,
            "IP India returned 403 after retries. Run backend locally or add manually.",
        )

    soup2 = BeautifulSoup(r2.text, "lxml")

    # Handle math captcha on the response page
    if "captcha" in r2.text.lower():
        captcha_payload = {**_collect_hidden(soup2)}
        solved = _find_and_fill_captcha(soup2, captcha_payload)
        if solved:
            logger.info("Captcha detected on result page; re-submitting with solution…")
            if submit_name:
                captcha_payload[submit_name] = submit_value
            try:
                r2 = session.post(EREGISTER_URL, data=captcha_payload, timeout=25,
                                  headers={**_HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                                           "Referer": EREGISTER_URL})
                soup2 = BeautifulSoup(r2.text, "lxml")
            except Exception as exc:
                logger.warning(f"Captcha re-submit failed: {exc}")
        else:
            raise HTTPException(
                503,
                "IP India is showing an unsolvable CAPTCHA. "
                "Wait a few minutes and retry, or add manually.",
            )

    data = _parse_tables(soup2)

    # Trademark image
    for img in soup2.find_all("img"):
        src = img.get("src", "")
        if any(k in src.lower() for k in ["trademark", "tm_", "/tm/", "image"]):
            data["trademark_image_url"] = (
                src if src.startswith("http")
                else f"https://tmrsearch.ipindia.gov.in/{src.lstrip('/')}"
            )
            break

    # Goods & Services — textarea first, then wide td
    for el in soup2.find_all("textarea"):
        t = _clean(el.get_text(" ", strip=True))
        if t and len(t) > 20:
            data["goods_and_services"] = t
            break
    if "goods_and_services" not in data:
        for td in soup2.find_all("td"):
            text = _clean(td.get_text(" ", strip=True))
            prev = td.find_previous_sibling("td")
            if text and len(text) > 80 and prev:
                lbl = (prev.get_text(" ", strip=True) or "").lower()
                if any(k in lbl for k in ["goods", "service", "description"]):
                    data["goods_and_services"] = text
                    break

    if len(data) < 3:
        raise HTTPException(
            404,
            f"No data found for '{app_number}'. Verify the number or use 'Add Manually'.",
        )

    data.setdefault("application_number", app_number.strip())
    return data


# ── Document Index scraper (used inside refresh_tm) ───────────────────────────

def _scrape_documents_sync(
    app_number: str,
    class_number: Optional[str] = None,
) -> tuple[List[Dict], Optional[Dict]]:
    """
    Piggyback on the same E-Register result page to extract:
      - documents: list of {name, pdf_link} for targeted labels
      - hearing:   {date, officer} if a Hearing Notice is found
    Returns (documents, hearing).
    """
    try:
        raw = _scrape_sync(app_number, class_number)
    except HTTPException:
        return [], None

    # We need the actual soup; re-fetch for document parsing
    session = _make_session()
    try:
        r1 = session.get(EREGISTER_URL, timeout=20)
        soup1 = BeautifulSoup(r1.text, "lxml")
        hidden = _collect_hidden(soup1)
        app_field = next(
            (inp.get("name") or inp.get("id")
             for inp in soup1.find_all("input", type="text")
             if any(k in (inp.get("name", "") + inp.get("id", "")).lower()
                    for k in ["appno", "appnum", "applicationno", "txtapp"])),
            "txtApplicationNo",
        )
        submit_btn   = soup1.find("input", type="submit") or soup1.find("button", type="submit")
        submit_name  = submit_btn.get("name")          if submit_btn else None
        submit_value = submit_btn.get("value", "View") if submit_btn else "View"
        payload = {**hidden, app_field: app_number.strip()}
        if submit_name:
            payload[submit_name] = submit_value
        r2 = session.post(EREGISTER_URL, data=payload, timeout=25,
                          headers={**_HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                                   "Referer": EREGISTER_URL})
        soup2 = BeautifulSoup(r2.text, "lxml")
    except Exception as exc:
        logger.warning(f"Document scrape network error for {app_number}: {exc}")
        return [], None

    documents: List[Dict] = []
    hearing:   Optional[Dict] = None
    base = "https://tmrsearch.ipindia.gov.in"

    for table in soup2.find_all("table"):
        headers = [_clean(th.get_text(" ", strip=True)) for th in table.find_all("th")]
        if not any(h and "document" in h.lower() for h in headers):
            continue
        for row in table.find_all("tr")[1:]:          # skip header row
            cells = row.find_all("td")
            if not cells:
                continue
            doc_name = _clean(cells[0].get_text(" ", strip=True)) or ""
            if not any(lbl in doc_name.lower() for lbl in _DOC_LABELS):
                continue
            pdf_link = None
            anchor = row.find("a", href=True)
            if anchor:
                href = anchor["href"]
                pdf_link = href if href.startswith("http") else f"{base}/{href.lstrip('/')}"
            entry = {"name": doc_name, "pdf_link": pdf_link}
            documents.append(entry)

            # Extract hearing details from Hearing Notice rows
            if "hearing notice" in doc_name.lower():
                h_date    = _clean(cells[1].get_text(" ", strip=True)) if len(cells) > 1 else None
                h_officer = _clean(cells[2].get_text(" ", strip=True)) if len(cells) > 2 else None
                hearing = {"date": h_date, "officer": h_officer}

    return documents, hearing


# ── Attorney portfolio scraper ─────────────────────────────────────────────────

def _scrape_by_attorney_sync(agent_code: str) -> List[str]:
    """
    Submit `agent_code` to the Agent Search page and return all
    application numbers found in `app_no=` query-string links.
    """
    session = _make_session()

    # GET the search page
    try:
        r1 = session.get(AGENT_SEARCH_URL, timeout=20)
    except curlex.exceptions.RequestException as exc:
        raise HTTPException(502, f"Cannot reach Agent Search page: {exc}")

    if r1.status_code == 403:
        raise HTTPException(
            403,
            "IP India returned 403. Run the backend on a local/residential IP.",
        )
    if r1.status_code != 200:
        raise HTTPException(502, f"Agent Search page returned HTTP {r1.status_code}.")

    soup1 = BeautifulSoup(r1.text, "lxml")
    hidden = _collect_hidden(soup1)

    # Locate agent-code input field
    agent_field = next(
        (
            (inp.get("name") or inp.get("id"))
            for inp in soup1.find_all("input", type="text")
            if any(k in (inp.get("name", "") + inp.get("id", "")).lower()
                   for k in ["agentcode", "agentno", "agent", "code"])
        ),
        None,
    )
    if not agent_field:
        all_txt = soup1.find_all("input", type="text")
        agent_field = (all_txt[0].get("name") or all_txt[0].get("id")) if all_txt else "txtAgentCode"

    submit_btn   = soup1.find("input", type="submit") or soup1.find("button", type="submit")
    submit_name  = submit_btn.get("name")          if submit_btn else None
    submit_value = submit_btn.get("value", "Search") if submit_btn else "Search"

    payload = {**hidden, agent_field: agent_code.strip()}
    if submit_name:
        payload[submit_name] = submit_value

    _find_and_fill_captcha(soup1, payload)

    # POST
    try:
        r2 = session.post(
            AGENT_SEARCH_URL,
            data=payload,
            timeout=25,
            headers={
                **_HEADERS,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer":      AGENT_SEARCH_URL,
            },
        )
    except curlex.exceptions.RequestException as exc:
        raise HTTPException(502, f"Network error on agent search submit: {exc}")

    soup2 = BeautifulSoup(r2.text, "lxml")

    # Handle math captcha on result page
    if "captcha" in r2.text.lower():
        cap_payload = {**_collect_hidden(soup2)}
        solved = _find_and_fill_captcha(soup2, cap_payload)
        if solved:
            if submit_name:
                cap_payload[submit_name] = submit_value
            try:
                r2 = session.post(AGENT_SEARCH_URL, data=cap_payload, timeout=25,
                                  headers={**_HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                                           "Referer": AGENT_SEARCH_URL})
                soup2 = BeautifulSoup(r2.text, "lxml")
            except Exception as exc:
                logger.warning(f"Captcha re-submit failed for agent search: {exc}")
        else:
            raise HTTPException(503, "CAPTCHA on agent search page could not be solved automatically.")

    # Parse all application numbers from links like href="...app_no=1234567&..."
    app_numbers: List[str] = []
    seen: set = set()
    for a in soup2.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"[?&]app_no=(\d+)", href, re.IGNORECASE)
        if m:
            num = m.group(1)
            if num not in seen:
                seen.add(num)
                app_numbers.append(num)

    # Fallback: look for bare application numbers in table cells
    if not app_numbers:
        for table in soup2.find_all("table"):
            for row in table.find_all("tr")[1:]:
                cells = row.find_all("td")
                for cell in cells:
                    text = _clean(cell.get_text(" ", strip=True)) or ""
                    if re.fullmatch(r"\d{7,}", text) and text not in seen:
                        seen.add(text)
                        app_numbers.append(text)

    logger.info(f"Attorney {agent_code}: found {len(app_numbers)} application numbers.")
    return app_numbers


async def scrape_trademark(app_number: str, class_number: Optional[str] = None) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _scrape_sync, app_number, class_number)


async def scrape_documents(app_number: str, class_number: Optional[str] = None):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _scrape_documents_sync, app_number, class_number)


async def scrape_by_attorney_code(agent_code: str) -> List[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _scrape_by_attorney_sync, agent_code)


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
    rd = _parse_date(tm.get("valid_upto") or tm.get("renewal_date"))
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
                opposition_deadline    = od.strftime("%Y-%m-%d"),
                days_until_opposition  = d2,
            )
    return dl


async def _gen_reminders(tm_id: str, tm: Dict[str, Any]) -> None:
    await db.trademark_sphere_reminders.delete_many({"trademark_id": tm_id, "auto_generated": True})
    now = datetime.now(IST)
    reminders = []
    rd_str = tm.get("renewal_date")
    if rd_str:
        rd = _parse_date(rd_str)
        if rd and rd > date.today():
            for days in REMINDER_DAYS:
                ron = rd - timedelta(days=days)
                if ron >= date.today():
                    r = {
                        "id":                  str(uuid.uuid4()),
                        "trademark_id":        tm_id,
                        "application_number":  tm.get("application_number"),
                        "word_mark":           tm.get("word_mark"),
                        "type":                "renewal",
                        "label":               f"Renewal due in {days} days",
                        "remind_on":           ron.strftime("%Y-%m-%d"),
                        "renewal_date":        rd_str,
                        "days_before":         days,
                        "sent":                False,
                        "auto_generated":      True,
                        "created_at":          now.isoformat(),
                    }
                    reminders.append(r)
    if reminders:
        await db.trademark_sphere_reminders.insert_many([{**r, "_id": r["id"]} for r in reminders])
    logger.info(f"Generated {len(reminders)} reminders for TM {tm_id}")


# ── Background task: import attorney portfolio ────────────────────────────────

async def _import_attorney_bg(
    agent_code: str,
    created_by: str,
    attorney: Optional[str],
    client_id: Optional[str],
    client_name: Optional[str],
    reminder_emails: List[str],
    reminders_enabled: bool,
) -> None:
    """
    Background task: scrape every application number for the given agent_code,
    then add each one to the database (skipping duplicates).
    """
    try:
        app_numbers = await scrape_by_attorney_code(agent_code)
    except HTTPException as exc:
        logger.error(f"Attorney import failed for {agent_code}: {exc.detail}")
        return

    added = 0
    for app_num in app_numbers:
        existing = await db.trademark_sphere.find_one({"application_number": app_num})
        if existing:
            logger.info(f"Attorney import: {app_num} already tracked, skipping.")
            continue
        try:
            raw = await scrape_trademark(app_num)
        except HTTPException as exc:
            logger.warning(f"Attorney import: could not scrape {app_num} — {exc.detail}")
            continue

        dl  = _compute_deadlines(raw)
        now = datetime.now(IST)
        tid = str(uuid.uuid4())
        doc = {
            "id":                 tid,
            "application_number": app_num,
            "word_mark":          raw.get("word_mark", ""),
            "class_number":       raw.get("class_number", ""),
            "tm_status":          raw.get("tm_status", "Unknown"),
            "proprietor":         raw.get("proprietor") or raw.get("applicant_name", ""),
            "applicant_name":     raw.get("applicant_name", ""),
            "filing_date":        raw.get("filing_date", ""),
            "registration_date":  raw.get("registration_date", ""),
            "valid_upto":         raw.get("valid_upto", ""),
            "goods_and_services": raw.get("goods_and_services", ""),
            "trademark_image_url":raw.get("trademark_image_url", ""),
            "address":            raw.get("address", ""),
            "attorney":           attorney or "",
            "notes":              f"Imported via attorney portfolio ({agent_code})",
            "client_id":          client_id  or "",
            "client_name":        client_name or "",
            "reminder_emails":    reminder_emails,
            "reminders_enabled":  reminders_enabled,
            "last_fetched":       now.isoformat(),
            "created_at":         now.isoformat(),
            "updated_at":         now.isoformat(),
            "created_by":         created_by,
            "raw_data":           raw,
            "scrape_source":      "attorney_import",
            "documents":          [],
            "hearings":           None,
            **dl,
        }
        await db.trademark_sphere.insert_one({**doc, "_id": tid})
        await _gen_reminders(tid, doc)
        added += 1
        # small delay to be polite to the portal
        await asyncio.sleep(1)

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
    search:       str = Query(None),
    tm_status:    str = Query(None),
    class_number: str = Query(None),
    client_id:    str = Query(None),
    renewal_alert:str = Query(None),
    skip:         int = Query(0,  ge=0),
    limit:        int = Query(50, ge=1, le=200),
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


@router.post("/fetch-preview")
async def fetch_preview(body: TrademarkAddRequest, user: User = Depends(get_current_user)):
    data = await scrape_trademark(body.application_number, body.class_number)
    return {**data, **_compute_deadlines(data)}


@router.post("/add")
async def add_trademark(body: TrademarkAddRequest, bg: BackgroundTasks, user: User = Depends(get_current_user)):
    if await db.trademark_sphere.find_one({"application_number": body.application_number.strip()}):
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")
    raw = body.manual_data or await scrape_trademark(body.application_number, body.class_number)
    dl  = _compute_deadlines(raw)
    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    doc = {
        "id":                 tid,
        "application_number": body.application_number.strip(),
        "word_mark":          raw.get("word_mark", ""),
        "class_number":       raw.get("class_number") or body.class_number or "",
        "tm_status":          raw.get("tm_status", "Unknown"),
        "proprietor":         raw.get("proprietor") or raw.get("applicant_name", ""),
        "applicant_name":     raw.get("applicant_name", ""),
        "filing_date":        raw.get("filing_date", ""),
        "registration_date":  raw.get("registration_date", ""),
        "valid_upto":         raw.get("valid_upto", ""),
        "goods_and_services": raw.get("goods_and_services", ""),
        "trademark_image_url":raw.get("trademark_image_url", ""),
        "address":            raw.get("address", ""),
        "attorney":           body.attorney or "",
        "notes":              body.notes    or "",
        "client_id":          body.client_id   or "",
        "client_name":        body.client_name or "",
        "reminder_emails":    body.reminder_emails,
        "reminders_enabled":  body.reminders_enabled,
        "last_fetched":       now.isoformat(),
        "created_at":         now.isoformat(),
        "updated_at":         now.isoformat(),
        "created_by":         user.id,
        "raw_data":           raw,
        "scrape_source":      "auto",
        "documents":          [],
        "hearings":           None,
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
    The background task scrapes the Agent Search page, extracts all application numbers,
    then fetches and stores each one (skipping duplicates).
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
    )
    return {
        "message": (
            f"Attorney portfolio import started for agent code '{body.agent_code}'. "
            "Trademarks will appear in the list as they are processed."
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

    # Refresh core trademark data
    nd  = await scrape_trademark(doc["application_number"], doc.get("class_number"))
    dl  = _compute_deadlines(nd)
    now = datetime.now(IST)

    # Refresh documents and hearings
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
