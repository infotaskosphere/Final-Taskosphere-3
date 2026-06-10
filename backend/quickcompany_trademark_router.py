# REMOVED broken import (backend.services not found): from backend.services.watchlist_service import watchlist_service
# REMOVED broken import (backend.services not found): from backend.services.search_service import search_service


# REMOVED broken import (backend.services not found): from backend.services.ipindia_scraper import scraper
"""
backend/trademark_sphere.py
---------------------------
Dual-source trademark scraper:

  Source 1 - QuickCompany  (https://www.quickcompany.in/trademarks/{app_no}-{slug})
             Full HTML page scrape via BeautifulSoup. No login, no OTP.
             Used for: single-mark lookup, auto-add, refresh.

  Source 2 - IP India TMR Public Search
             (https://tmrsearch.ipindia.gov.in/tmrpublicsearch/frmmain.aspx)
             ASP.NET __VIEWSTATE session scrape via requests + BS4.
             Used for: attorney portfolio bulk import.

All FastAPI routes are preserved. Frontend contract bugs fixed:
  - /list  → returns { items, total } + tm_status / class_number / renewal_alert filters
  - /deadlines → returns { upcoming: [...], overdue: [...] }
  - /stats → returns all 6 fields the frontend metric cards need
  - _compute_deadlines() → stores renewal_status + days_until_renewal + renewal_date
"""

import os, re, uuid, time, logging, asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Any, Dict, Tuple
from urllib.parse import quote, urljoin
from zoneinfo import ZoneInfo

import requests as _requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Response
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User
from backend.pdf_renderer import build_combined_report_pdf, build_report_pdf
from backend.scraper import search_trademarks as _qc_search_trademarks
from backend.report_engine import build_report as _build_report
from backend.class_finder import find_classes as _find_classes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trademark-sphere", tags=["trademark-sphere"])

# ── QC Report Router (no internal prefix — mounted at /api/trademark-qc by server.py) ──
qc_report_router = APIRouter(tags=["trademark-qc-reports"])
IST   = ZoneInfo("Asia/Kolkata")
_pool = ThreadPoolExecutor(max_workers=6)

# ── Site roots ────────────────────────────────────────────────────────────────
QC_BASE    = "https://www.quickcompany.in"
QC_SEARCH  = f"{QC_BASE}/trademarks"           # ?q=...
QC_DETAIL  = f"{QC_BASE}/trademarks"           # /{app_no}-{slug}
QC_ATTY    = f"{QC_BASE}/trademarks/attorney"  # /{agent_code}?page=N

IP_BASE    = "https://tmrsearch.ipindia.gov.in"
IP_MAIN    = f"{IP_BASE}/tmrpublicsearch/frmmain.aspx"
IP_SEARCH  = f"{IP_BASE}/tmrpublicsearch/tmsearch.aspx"

# ── Shared session (persistent cookies, keep-alive) ──────────────────────────
_qc_session: Optional[_requests.Session] = None
_ip_session: Optional[_requests.Session] = None

_COMMON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}

def _qc_sess() -> _requests.Session:
    global _qc_session
    if _qc_session is None:
        s = _requests.Session()
        s.headers.update({
            **_COMMON_HEADERS,
            "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer":                   QC_BASE + "/",
            "sec-ch-ua":                 '"Chromium";v="124", "Google Chrome";v="124"',
            "sec-ch-ua-mobile":          "?0",
            "sec-ch-ua-platform":        '"Windows"',
            "sec-fetch-dest":            "document",
            "sec-fetch-mode":            "navigate",
            "sec-fetch-site":            "same-origin",
            "Upgrade-Insecure-Requests": "1",
            "Cache-Control":             "max-age=0",
        })
        # Warm-up: fetch homepage to get session cookies (CSRF tokens etc.)
        try:
            s.get(QC_BASE + "/", timeout=15)
            time.sleep(0.8)
        except Exception:
            pass
        _qc_session = s
    return _qc_session


def _ip_sess() -> _requests.Session:
    global _ip_session
    if _ip_session is None:
        s = _requests.Session()
        s.headers.update({
            **_COMMON_HEADERS,
            "Accept":  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": IP_MAIN,
        })
        _ip_session = s
    return _ip_session


# ── In-memory caches ──────────────────────────────────────────────────────────
_tm_cache:      Dict[str, Any] = {}   # key → normalised record
_ip_vs_cache:   Dict[str, str] = {}   # IP India viewstate cache
_sessions:      Dict[str, Any] = {}   # OTP-compat noop
_sync_progress: Dict[str, Any] = {}


# ════════════════════════════════════════════════════════════════════════════
# ── Helpers ──────────────────────────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

def _clean(v: Any) -> Optional[str]:
    """Strip and normalise whitespace; return None for empty strings."""
    return " ".join(str(v).split()).strip() or None


def _parse_date(s: Any) -> Optional[date]:
    """Parse multiple date formats → date object."""
    if not s:
        return None
    for fmt in (
        "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y",
        "%d %b %Y", "%B %d, %Y", "%d-%b-%Y",
        "%d %B %Y", "%b %d, %Y",
    ):
        try:
            return datetime.strptime(str(s).strip(), fmt).date()
        except ValueError:
            pass
    return None


def _status_map(raw: str) -> str:
    """Normalise IP India / QC status strings to canonical values."""
    if not raw:
        return "Unknown"
    r = raw.strip().lower()
    MAP = {
        "registered":                    "Registered",
        "pending":                       "Pending",
        "formalities chk pass":          "Pending",
        "new application":               "Pending",
        "send back to fo for correction":"Pending",
        "marked for exam":               "Under Examination",
        "under examination":             "Under Examination",
        "examined":                      "Under Examination",
        "objected":                      "Objected",
        "opposed":                       "Opposed",
        "accepted and advertised":       "Accepted & Advertised",
        "accepted & advertised":         "Accepted & Advertised",
        "advertised before acceptance":  "Advertised Before Acceptance",
        "advertised before accepted":    "Advertised Before Acceptance",
        "refused":                       "Refused",
        "abandoned":                     "Abandoned",
        "withdrawn":                     "Withdrawn",
        "removed":                       "Abandoned",
        "expired":                       "Abandoned",
    }
    for k, v in MAP.items():
        if k in r:
            return v
    # Title-case the raw value as fallback
    return raw.strip().title()


def _compute_deadlines(tm: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute all renewal/deadline fields expected by the frontend.
    Keys set: renewal_due, renewal_date, days_until_renewal,
              days_to_renewal (alias), renewal_status.
    """
    today = date.today()
    dl: Dict[str, Any] = {}

    rd = _parse_date(tm.get("valid_upto") or tm.get("renewal_date") or tm.get("renewal_due"))
    if rd:
        days_left = (rd - today).days
        dl["renewal_due"]         = rd.isoformat()
        dl["renewal_date"]        = rd.isoformat()        # frontend alias
        dl["days_until_renewal"]  = days_left             # frontend field
        dl["days_to_renewal"]     = days_left             # legacy alias

        if days_left < 0:
            dl["renewal_status"] = "overdue"
        elif days_left <= 30:
            dl["renewal_status"] = "critical"
        elif days_left <= 90:
            dl["renewal_status"] = "warning"
        elif days_left <= 180:
            dl["renewal_status"] = "upcoming"
        else:
            dl["renewal_status"] = "ok"
    return dl


async def _gen_reminders(tm_id: str, tm: Dict[str, Any]) -> None:
    """Generate 90/60/30/7-day renewal reminders."""
    if not tm.get("reminders_enabled", True):
        return
    rd = _parse_date(tm.get("valid_upto"))
    if not rd:
        return
    await db.trademark_sphere_reminders.delete_many({"trademark_id": tm_id})
    now  = datetime.now(IST)
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
# ── SOURCE 1: QuickCompany HTML scraper ──────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

def _qc_detail_url(app_number: str) -> str:
    """
    QC trademark URLs are /trademarks/{app_no}-{word_slug}.
    We do a search first to find the correct slug, then fetch the detail page.
    """
    return f"{QC_DETAIL}/{app_number.strip()}"


def _qc_parse_detail_page(html: str, app_number: str) -> Dict[str, Any]:
    """
    Parse a QuickCompany trademark detail page (e.g. /trademarks/2859256-hotstar).
    Returns a normalised trademark dict.
    """
    soup = BeautifulSoup(html, "lxml")

    # ── Word mark ────────────────────────────────────────────────────────────
    word_mark = ""
    h1 = soup.find("h1")
    if h1:
        word_mark = _clean(h1.get_text()) or ""

    # ── Build a flat label→value map from every table row ────────────────────
    kv: Dict[str, str] = {}
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) >= 2:
            key = _clean(cells[0].get_text())
            val = _clean(cells[1].get_text())
            if key and val:
                kv[key.lower()] = val

    # Also grab definition-list style "label: value" from divs
    # QC uses: <h4>Label</h4><p>Value</p> patterns inside a section div
    section = soup.find("div", string=re.compile(r"Trademark Information", re.I))
    if not section:
        # fallback: find by nearby heading
        for h in soup.find_all(["h3", "h4"]):
            if "trademark information" in h.get_text().lower():
                section = h.find_parent("div")
                break

    if section:
        labels = section.find_all(["h4", "strong", "dt"])
        for lbl in labels:
            key = _clean(lbl.get_text())
            # next sibling that has text
            nxt = lbl.find_next_sibling()
            if nxt:
                val = _clean(nxt.get_text())
                if key and val:
                    kv[key.lower()] = val

    # ── Also try meta description for fallback data ───────────────────────────
    meta_desc = ""
    meta = soup.find("meta", {"name": "description"})
    if meta:
        meta_desc = meta.get("content", "")

    # ── Extract specific fields ───────────────────────────────────────────────
    def g(*keys) -> str:
        for k in keys:
            v = kv.get(k, "")
            if v:
                return v
        return ""

    status_raw  = g("status", "tm status", "application status")
    class_no    = g("classes", "class", "class number", "nice class")
    proprietor  = g("proprietor", "applicant", "owner")
    attorney    = g("attorney", "agent", "trademark agent", "trademark attorney")
    filing_date = g("date of application", "filing date", "application date", "filed on", "applied on")
    reg_date    = g("date of registration", "registration date", "registered on")
    valid_upto  = g("valid / upto", "valid upto", "valid till", "expiry date", "renewal date", "validity")
    address     = g("address", "applicant address", "proprietor address")
    gs          = g("description", "goods and services", "goods & services", "specification")
    state       = g("state")
    ip_office   = g("ip office", "office")
    filing_mode = g("filing mode")
    used_since  = g("used since")
    mark_type   = g("type", "mark type")

    # Proprietor sometimes is in an <h4> tag next to the h1
    if not proprietor:
        h4 = soup.find("h4")
        if h4:
            proprietor = _clean(h4.get_text()) or ""

    # Class: strip non-numeric clutter like "Class 9" or "[9]"
    if class_no:
        m = re.search(r"\d+", class_no)
        class_no = m.group(0) if m else class_no

    # Image
    img_url = ""
    img_tag = soup.find("img", src=re.compile(r"quickcompany\.blob|trademarks.*image", re.I))
    if img_tag:
        img_url = img_tag.get("src", "")

    # Documents table
    documents: List[Dict] = []
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) >= 3:
            doc_name = _clean(cells[1].get_text()) if len(cells) > 1 else ""
            doc_date = _clean(cells[2].get_text()) if len(cells) > 2 else ""
            link_tag = cells[1].find("a") or tr.find("a")
            doc_link = ""
            if link_tag:
                doc_link = urljoin(QC_BASE, link_tag.get("href", ""))
            if doc_name and doc_name not in ("", "—"):
                documents.append({
                    "name": doc_name,
                    "date": doc_date,
                    "pdf_link": doc_link,
                })

    # Hearing / correspondence section
    hearings = None
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        row_text = " ".join(c.get_text() for c in cells).lower()
        if "notice" in row_text or "hearing" in row_text:
            date_cell = _clean(cells[-1].get_text()) if cells else ""
            hearings = {"date": date_cell, "officer": ""}
            break

    # ── PR Details / applicant_name ───────────────────────────────────────────
    pr_details = g("pr details", "applicant details")
    applicant_name = proprietor  # default same

    return {
        "application_number":  str(app_number).strip(),
        "word_mark":           word_mark,
        "tm_status":           _status_map(status_raw),
        "class_number":        class_no,
        "proprietor":          proprietor,
        "applicant_name":      applicant_name,
        "filing_date":         filing_date,
        "registration_date":   reg_date,
        "valid_upto":          valid_upto,
        "goods_and_services":  gs,
        "address":             address,
        "trademark_image_url": img_url,
        "state":               state,
        "ip_office":           ip_office,
        "filing_mode":         filing_mode,
        "used_since":          used_since,
        "mark_type":           mark_type,
        "attorney":            attorney,
        "documents":           documents,
        "hearings":            hearings,
        "scrape_source":       "quickcompany",
    }


def _qc_search_app_number(app_number: str) -> Optional[str]:
    """
    Search QC to find the full slug URL for an application number.
    Returns the full path like /trademarks/2859256-hotstar
    """
    sess = _qc_sess()
    try:
        r = sess.get(
            f"{QC_SEARCH}",
            params={"q": app_number},
            timeout=20,
        )
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, "lxml")
        # Find first trademark link containing the app number
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if f"/trademarks/{app_number}" in href or f"/trademarks/{app_number}-" in href:
                return href
        return None
    except Exception as e:
        logger.warning(f"QC search failed for {app_number}: {e}")
        return None


def _qc_fetch_by_app_number(app_number: str) -> Dict[str, Any]:
    """
    Main entry point: fetch full trademark data from QuickCompany
    by application number.
    Strategy:
      1. Try direct URL /trademarks/{app_number} (redirects to slug URL)
      2. If 404, search QC for the slug URL
      3. Parse the resulting detail page HTML
    """
    app_number = (app_number or "").strip()
    if not app_number:
        raise HTTPException(400, "Application number is required.")

    cache_key = f"qc::{app_number}"
    if cache_key in _tm_cache:
        return _tm_cache[cache_key]

    sess = _qc_sess()

    # Strategy 1: direct URL (QC redirects /trademarks/{id} → /trademarks/{id}-{slug})
    url = f"{QC_DETAIL}/{app_number}"
    detail_html = ""
    final_url = url

    try:
        r = sess.get(url, timeout=25, allow_redirects=True)
        if r.status_code == 200 and len(r.text) > 500:
            detail_html = r.text
            final_url = r.url
        elif r.status_code == 404:
            # Strategy 2: search for slug
            slug_path = _qc_search_app_number(app_number)
            if slug_path:
                time.sleep(0.8)
                r2 = sess.get(urljoin(QC_BASE, slug_path), timeout=25)
                if r2.status_code == 200:
                    detail_html = r2.text
                    final_url = r2.url
    except _requests.RequestException as e:
        logger.error(f"QC fetch error for {app_number}: {e}")

    if not detail_html:
        raise HTTPException(
            404,
            f"Trademark {app_number} not found on QuickCompany. "
            "Try adding it manually."
        )

    data = _qc_parse_detail_page(detail_html, app_number)
    _tm_cache[cache_key] = data
    return data


def _qc_attorney_app_numbers(agent_code: str) -> List[str]:
    """
    Scrape all application numbers listed on a QC attorney page.
    URL pattern: /trademarks/attorney/{agent_code}?page=N
    """
    agent_code = (agent_code or "").strip()
    if not agent_code:
        return []

    sess = _qc_sess()
    seen: set = set()
    nums: List[str] = []

    for page in range(1, 51):  # max 50 pages
        url = f"{QC_ATTY}/{quote(agent_code)}"
        try:
            r = sess.get(url, params={"page": page}, timeout=20)
            if r.status_code != 200:
                break
            soup = BeautifulSoup(r.text, "lxml")
        except _requests.RequestException as e:
            logger.warning(f"QC attorney page {page} error: {e}")
            break

        added = 0
        for a in soup.find_all("a", href=True):
            href = a["href"]
            # Match /trademarks/1234567 or /trademarks/1234567-slug
            m = re.search(r"/trademarks/(\d{5,})(?:[-/]|$)", href)
            if m:
                n = m.group(1)
                if n not in seen:
                    seen.add(n)
                    nums.append(n)
                    added += 1

        if added == 0:
            break  # no more results
        time.sleep(1.0)  # polite crawling

    logger.info(f"QC attorney '{agent_code}': found {len(nums)} application numbers.")
    return nums


# ════════════════════════════════════════════════════════════════════════════
# ── SOURCE 2: IP India TMR Public Search (ASPX) ───────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

def _ip_get_viewstate() -> Dict[str, str]:
    """
    Fetch the IP India TMR Public Search main page and extract
    ASP.NET hidden form fields (__VIEWSTATE, __EVENTVALIDATION, etc.)
    """
    sess = _ip_sess()
    try:
        r = sess.get(IP_MAIN, timeout=20)
        if r.status_code != 200:
            raise HTTPException(502, f"IP India returned {r.status_code}")
        soup = BeautifulSoup(r.text, "lxml")
        vs: Dict[str, str] = {}
        for field in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"):
            inp = soup.find("input", {"name": field}) or soup.find("input", {"id": field})
            if inp:
                vs[field] = inp.get("value", "")
        return vs
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to load IP India search page: {e}")


def _ip_search_by_application_number(app_number: str) -> Dict[str, Any]:
    """
    Search IP India TMR Public Search for a specific application number.
    Uses the ASPX POST form with __VIEWSTATE session state.
    Returns a normalised trademark dict.
    """
    app_number = (app_number or "").strip()
    sess       = _ip_sess()

    # Step 1: get viewstate
    vs = _ip_get_viewstate()

    # Step 2: POST the search form
    # IP India search form field names (from browser DevTools inspection):
    #   ctl00$ContentPlaceHolder1$txtApplicationNo → application number field
    #   ctl00$ContentPlaceHolder1$btnSearch        → submit button
    post_data = {
        "__VIEWSTATE":          vs.get("__VIEWSTATE", ""),
        "__VIEWSTATEGENERATOR": vs.get("__VIEWSTATEGENERATOR", ""),
        "__EVENTVALIDATION":    vs.get("__EVENTVALIDATION", ""),
        "__EVENTTARGET":        "",
        "__EVENTARGUMENT":      "",
        # Search type: "A" = Application No, "W" = Word Mark
        "ctl00$ContentPlaceHolder1$RadioButton1":     "rdApplicationNumber",
        "ctl00$ContentPlaceHolder1$txtApplicationNo": app_number,
        "ctl00$ContentPlaceHolder1$btnSearch":        "Search",
    }

    try:
        r = sess.post(
            IP_SEARCH,
            data=post_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
            allow_redirects=True,
        )
        if r.status_code != 200:
            raise HTTPException(502, f"IP India search returned {r.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"IP India search POST failed: {e}")

    return _ip_parse_search_results(r.text, app_number)


def _ip_parse_search_results(html: str, app_number: str) -> Dict[str, Any]:
    """
    Parse IP India search result page HTML into a normalised trademark dict.
    IP India shows results in a table with fixed column order.
    """
    soup = BeautifulSoup(html, "lxml")

    # Find the results table — IP India uses a GridView with id containing 'GridView'
    table = (
        soup.find("table", id=re.compile(r"GridView", re.I))
        or soup.find("table", class_=re.compile(r"result|grid|search", re.I))
        or soup.find("table")
    )

    if not table:
        raise HTTPException(404, f"No results found on IP India for '{app_number}'.")

    rows = table.find_all("tr")
    if len(rows) < 2:
        raise HTTPException(404, f"No trademark data rows on IP India for '{app_number}'.")

    # First row = header
    headers = [_clean(th.get_text()) for th in rows[0].find_all(["th", "td"])]

    # Find the data row matching our app number
    target_row = None
    for row in rows[1:]:
        cells = row.find_all("td")
        row_text = " ".join(c.get_text() for c in cells)
        if app_number in row_text:
            target_row = cells
            break

    if not target_row:
        # Just take the first data row if only one result
        if len(rows) >= 2:
            target_row = rows[1].find_all("td")
        else:
            raise HTTPException(404, f"Trademark {app_number} not found in IP India results.")

    # Map header → cell value
    kv: Dict[str, str] = {}
    for i, h in enumerate(headers):
        if h and i < len(target_row):
            kv[h.lower()] = _clean(target_row[i].get_text()) or ""

    def g(*keys) -> str:
        for k in keys:
            v = kv.get(k, "")
            if v:
                return v
        return ""

    # Standard IP India column names:
    #   Application No, Word Mark, Class, Status, Proprietor Name,
    #   Applicant Address, Filing Date, Valid Upto, Attorney/Agent
    word_mark   = g("word mark", "trademark", "mark", "trade mark")
    app_no      = g("application no", "application number", "app no") or app_number
    status      = g("status", "tm status", "current status")
    class_no    = g("class", "class no", "nice class")
    proprietor  = g("proprietor name", "proprietor", "applicant name", "applicant")
    address     = g("applicant address", "address", "proprietor address")
    filing_date = g("filing date", "date of application", "application date")
    valid_upto  = g("valid upto", "validity", "renewal date", "expiry")
    attorney    = g("attorney", "agent", "attorney/agent")
    gs          = g("goods and services", "description", "specification")

    if class_no:
        m = re.search(r"\d+", class_no)
        class_no = m.group(0) if m else class_no

    return {
        "application_number":  str(app_no).strip(),
        "word_mark":           word_mark,
        "tm_status":           _status_map(status),
        "class_number":        class_no,
        "proprietor":          proprietor,
        "applicant_name":      proprietor,
        "filing_date":         filing_date,
        "registration_date":   "",
        "valid_upto":          valid_upto,
        "goods_and_services":  gs,
        "address":             address,
        "trademark_image_url": "",
        "attorney":            attorney,
        "documents":           [],
        "hearings":            None,
        "scrape_source":       "ipindia",
    }


def _ip_search_by_wordmark(word_mark: str, class_no: str = "") -> List[Dict[str, Any]]:
    """
    Search IP India by word mark (and optional class).
    Returns list of normalised trademark dicts.
    """
    sess = _ip_sess()
    vs   = _ip_get_viewstate()

    post_data = {
        "__VIEWSTATE":          vs.get("__VIEWSTATE", ""),
        "__VIEWSTATEGENERATOR": vs.get("__VIEWSTATEGENERATOR", ""),
        "__EVENTVALIDATION":    vs.get("__EVENTVALIDATION", ""),
        "__EVENTTARGET":        "",
        "__EVENTARGUMENT":      "",
        "ctl00$ContentPlaceHolder1$RadioButton1":  "rdWordMark",
        "ctl00$ContentPlaceHolder1$txtTMName":     word_mark.strip(),
        "ctl00$ContentPlaceHolder1$ddlClass":      class_no or "0",
        "ctl00$ContentPlaceHolder1$btnSearch":     "Search",
    }

    try:
        r = sess.post(
            IP_SEARCH,
            data=post_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        if r.status_code != 200:
            return []
    except Exception as e:
        logger.warning(f"IP India word-mark search failed: {e}")
        return []

    soup  = BeautifulSoup(r.text, "lxml")
    table = soup.find("table", id=re.compile(r"GridView", re.I)) or soup.find("table")
    if not table:
        return []

    rows    = table.find_all("tr")
    if len(rows) < 2:
        return []
    headers = [_clean(th.get_text()) for th in rows[0].find_all(["th", "td"])]

    results = []
    for row in rows[1:]:
        cells = row.find_all("td")
        if not cells:
            continue
        kv: Dict[str, str] = {}
        for i, h in enumerate(headers):
            if h and i < len(cells):
                kv[h.lower()] = _clean(cells[i].get_text()) or ""

        def g(*keys) -> str:
            for k in keys:
                v = kv.get(k, "")
                if v:
                    return v
            return ""

        app_no  = g("application no", "application number", "app no")
        status  = g("status", "tm status")
        cls     = g("class", "class no")
        if cls:
            m = re.search(r"\d+", cls)
            cls = m.group(0) if m else cls

        results.append({
            "application_number":  app_no,
            "word_mark":           g("word mark", "trademark", "mark"),
            "tm_status":           _status_map(status),
            "class_number":        cls,
            "proprietor":          g("proprietor name", "proprietor", "applicant"),
            "applicant_name":      g("proprietor name", "proprietor", "applicant"),
            "filing_date":         g("filing date", "date of application"),
            "valid_upto":          g("valid upto", "renewal date"),
            "goods_and_services":  g("goods and services", "specification"),
            "address":             g("applicant address", "address"),
            "trademark_image_url": "",
            "attorney":            g("attorney", "agent"),
            "documents":           [],
            "hearings":            None,
            "scrape_source":       "ipindia",
        })
    return results


# ════════════════════════════════════════════════════════════════════════════
# ── Unified scraper: try QC first, fall back to IP India ─────────────────────
# ════════════════════════════════════════════════════════════════════════════

def _scrape_trademark_sync(app_number: str) -> Dict[str, Any]:
    """
    Try QuickCompany (richer data: image, documents, hearings).
    Fall back to IP India on failure.
    """
    app_number = (app_number or "").strip()
    cache_key  = f"unified::{app_number}"
    if cache_key in _tm_cache:
        return _tm_cache[cache_key]

    # ── Try QuickCompany ──────────────────────────────────────────────────────
    try:
        data = _qc_fetch_by_app_number(app_number)
        _tm_cache[cache_key] = data
        return data
    except HTTPException as e:
        if e.status_code == 404:
            logger.info(f"QC 404 for {app_number}, trying IP India…")
        else:
            logger.warning(f"QC error for {app_number}: {e.detail}, trying IP India…")
    except Exception as e:
        logger.warning(f"QC exception for {app_number}: {e}, trying IP India…")

    # ── Fall back to IP India ─────────────────────────────────────────────────
    try:
        data = _ip_search_by_application_number(app_number)
        _tm_cache[cache_key] = data
        return data
    except HTTPException as e:
        raise HTTPException(
            404,
            f"Trademark {app_number} not found on QuickCompany or IP India. "
            f"Please add it manually. ({e.detail})"
        )
    except Exception as e:
        raise HTTPException(502, f"Both scrapers failed for {app_number}: {e}")


async def scrape_trademark(
    app_number: str,
    class_number: Optional[str] = None,
    session_id:   Optional[str] = None,
    otp:          Optional[str] = None,
) -> Dict[str, Any]:
    """Async wrapper for the unified scraper (runs in thread pool)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _scrape_trademark_sync, app_number)


async def scrape_documents(
    app_number: str, class_number: Optional[str] = None
) -> Tuple[List[Dict], Optional[Dict]]:
    """Documents are scraped inline by _qc_fetch_by_app_number. Return empty here."""
    return [], None


async def scrape_by_attorney_code(
    agent_code: str,
    session_id: Optional[str] = None,
    otp:        Optional[str] = None,
) -> List[str]:
    """Scrape attorney portfolio from QuickCompany."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_pool, _qc_attorney_app_numbers, agent_code)


async def send_otp(email: str) -> str:
    """No-op — QC and IP India public search need no OTP."""
    sid = str(uuid.uuid4())
    _sessions[sid] = {"email": email, "noop": True, "created_at": datetime.now(IST).isoformat()}
    return sid


# ════════════════════════════════════════════════════════════════════════════
# ── Pydantic models ───────────────────────────────────────────────────────────
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
    query: str
    limit: int = 25
    search_type: str = "wordmark"  # "wordmark" | "application_no"
    class_number: str = ""

class IpIndiaSearchRequest(BaseModel):
    query:        str
    search_type:  str = "wordmark"   # "wordmark" | "application_no"
    class_number: str = ""


# ════════════════════════════════════════════════════════════════════════════
# ── Background jobs ───────────────────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

async def _import_attorney_bg(
    agent_code: str, created_by: str, attorney: Optional[str],
    client_id: Optional[str], client_name: Optional[str],
    reminder_emails: List[str], reminders_enabled: bool,
    session_id: Optional[str] = None, otp: Optional[str] = None,
) -> None:
    try:
        app_numbers = await scrape_by_attorney_code(agent_code)
    except HTTPException as exc:
        logger.error(f"Attorney import failed for {agent_code}: {exc.detail}")
        return

    for app_num in app_numbers:
        if await db.trademark_sphere.find_one({"application_number": app_num}):
            continue
        await asyncio.sleep(1.2)
        try:
            raw = await scrape_trademark(app_num)
        except HTTPException as exc:
            logger.warning(f"Skip {app_num}: {exc.detail}")
            continue
        now = datetime.now(IST)
        tid = str(uuid.uuid4())
        doc = {
            "_id": tid, "id": tid,
            **{k: raw.get(k, "") for k in (
                "application_number", "word_mark", "class_number", "tm_status",
                "proprietor", "applicant_name", "filing_date", "registration_date",
                "valid_upto", "goods_and_services", "trademark_image_url", "address",
            )},
            "attorney":          attorney or raw.get("attorney", ""),
            "notes":             f"Imported via attorney portfolio ({agent_code})",
            "client_id":         client_id or "",
            "client_name":       client_name or "",
            "reminder_emails":   reminder_emails,
            "reminders_enabled": reminders_enabled,
            "last_fetched":      now.isoformat(),
            "created_at":        now.isoformat(),
            "updated_at":        now.isoformat(),
            "created_by":        created_by,
            "raw_data":          raw,
            "scrape_source":     raw.get("scrape_source", "quickcompany"),
            "documents":         raw.get("documents", []),
            "hearings":          raw.get("hearings"),
            **_compute_deadlines(raw),
        }
        await db.trademark_sphere.insert_one(doc)
        await _gen_reminders(tid, doc)


async def _portal_sync_bg(
    sync_id: str, agent_code: str, session_id: Optional[str],
    otp: Optional[str], created_by: str, attorney: str,
    client_id: Optional[str], reminder_emails: List[str],
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
        await asyncio.sleep(0.8)
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
                "scrape_source": raw.get("scrape_source", "quickcompany"),
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
                **{k: raw.get(k, "") for k in (
                    "application_number", "word_mark", "class_number", "tm_status",
                    "proprietor", "applicant_name", "filing_date", "registration_date",
                    "valid_upto", "goods_and_services", "trademark_image_url", "address",
                )},
                "attorney":          attorney or raw.get("attorney", ""),
                "notes":             f"Portal sync ({agent_code})",
                "client_id":         client_id or "",
                "client_name":       "",
                "reminder_emails":   reminder_emails,
                "reminders_enabled": True,
                "last_fetched":      now.isoformat(),
                "created_at":        now.isoformat(),
                "updated_at":        now.isoformat(),
                "created_by":        created_by,
                "raw_data":          raw,
                "scrape_source":     raw.get("scrape_source", "quickcompany"),
                "documents":         raw.get("documents", []),
                "hearings":          raw.get("hearings"),
                **dl,
            }
            await db.trademark_sphere.insert_one(doc)
            await _gen_reminders(tid, doc)
            _sync_progress[sync_id]["added"] += 1
        _sync_progress[sync_id]["done"] += 1

    _sync_progress[sync_id]["status"] = "completed"
    _sync_progress[sync_id]["phase"]  = "Done."


# ════════════════════════════════════════════════════════════════════════════
# ── FastAPI Routes ────────────────────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════════

@router.get("/stats")
async def get_stats(user: User = Depends(get_current_user)):
    """
    Returns all 6 metric fields the frontend dashboard needs.
    Fixes the original stub that only returned { total }.
    """
    today     = date.today().isoformat()
    soon_90   = (date.today() + timedelta(days=90)).isoformat()
    soon_30   = (date.today() + timedelta(days=30)).isoformat()

    total      = await db.trademark_sphere.count_documents({})
    registered = await db.trademark_sphere.count_documents({"tm_status": "Registered"})
    pending    = await db.trademark_sphere.count_documents(
        {"tm_status": {"$in": ["Pending", "Under Examination", "Accepted & Advertised",
                                "Advertised Before Acceptance"]}}
    )
    expiring   = await db.trademark_sphere.count_documents(
        {"renewal_due": {"$gte": today, "$lte": soon_90}}
    )
    overdue    = await db.trademark_sphere.count_documents(
        {"renewal_due": {"$lt": today}}
    )
    reminders  = await db.trademark_sphere_reminders.count_documents(
        {"sent": False, "remind_on": {"$lte": soon_30}}
    )

    return {
        "total":              total,
        "registered":         registered,
        "pending":            pending,
        "expiring_soon":      expiring,
        "overdue":            overdue,
        "upcoming_reminders": reminders,
    }


@router.get("/list")
async def list_trademarks(
    skip:          int           = Query(0, ge=0),
    limit:         int           = Query(50, ge=1, le=200),
    search:        Optional[str] = Query(None),
    tm_status:     Optional[str] = Query(None),
    class_number:  Optional[str] = Query(None),
    renewal_alert: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
):
    """
    List trademarks with full filter support.
    Fixes: returns 'total' (not 'count') + all frontend filter params.
    """
    flt: Dict[str, Any] = {}

    if search:
        flt["$or"] = [
            {"application_number": {"$regex": search, "$options": "i"}},
            {"word_mark":          {"$regex": search, "$options": "i"}},
            {"proprietor":         {"$regex": search, "$options": "i"}},
        ]
    if tm_status:
        flt["tm_status"] = tm_status
    if class_number:
        flt["class_number"] = class_number
    if renewal_alert:
        # renewal_alert maps to renewal_status field stored on documents
        flt["renewal_status"] = renewal_alert

    total = await db.trademark_sphere.count_documents(flt)
    cur   = db.trademark_sphere.find(flt).sort("created_at", -1).skip(skip).limit(limit)
    rows  = [
        {k: v for k, v in d.items() if k not in ("_id", "raw_data")}
        async for d in cur
    ]
    return {"items": rows, "total": total}


@router.get("/deadlines")
async def get_deadlines(
    days: int = Query(180, ge=1, le=730),
    user: User = Depends(get_current_user),
):
    """
    Returns { upcoming: [...], overdue: [...] } as the frontend expects.
    Fixes the original that returned a flat list.
    """
    today      = date.today()
    today_str  = today.isoformat()
    cutoff_str = (today + timedelta(days=days)).isoformat()

    overdue_cur  = db.trademark_sphere.find(
        {"renewal_due": {"$exists": True, "$lt": today_str}}
    ).sort("renewal_due", 1)
    upcoming_cur = db.trademark_sphere.find(
        {"renewal_due": {"$exists": True, "$gte": today_str, "$lte": cutoff_str}}
    ).sort("renewal_due", 1)

    def _strip(d):
        return {k: v for k, v in d.items() if k not in ("_id", "raw_data")}

    overdue  = [_strip(d) async for d in overdue_cur]
    upcoming = [_strip(d) async for d in upcoming_cur]

    return {"upcoming": upcoming, "overdue": overdue}


@router.get("/reminders")
async def get_reminders(user: User = Depends(get_current_user)):
    cur = db.trademark_sphere_reminders.find({"sent": False}).sort("remind_on", 1)
    return [{k: v for k, v in d.items() if k != "_id"} async for d in cur]


@router.get("/constants/all")
async def constants(user: User = Depends(get_current_user)):
    return {
        "statuses": [
            "Registered", "Pending", "Under Examination", "Objected", "Opposed",
            "Accepted & Advertised", "Advertised Before Acceptance",
            "Refused", "Abandoned", "Withdrawn", "Unknown",
        ]
    }


@router.get("/{tm_id}")
async def get_tm(tm_id: str, user: User = Depends(get_current_user)):
    d = await db.trademark_sphere.find_one({"id": tm_id})
    if not d:
        raise HTTPException(404, "Not found")
    return {k: v for k, v in d.items() if k != "_id"}


# ── Search routes ─────────────────────────────────────────────────────────────

@router.post("/search")
async def search_trademarks(
    body: SearchRequest,
    user: User = Depends(get_current_user),
):
    """Live search: QC word-mark search OR IP India word-mark search."""
    loop = asyncio.get_event_loop()
    if body.search_type == "application_no":
        data = await scrape_trademark(body.query)
        return {"query": body.query, "count": 1, "results": [data]}
    else:
        results = await loop.run_in_executor(
            _pool, _ip_search_by_wordmark, body.query, body.class_number
        )
        return {"query": body.query, "count": len(results), "results": results[:body.limit]}


@router.post("/search-ipindia")
async def search_ipindia(
    body: IpIndiaSearchRequest,
    user: User = Depends(get_current_user),
):
    """Dedicated IP India search endpoint."""
    loop = asyncio.get_event_loop()
    if body.search_type == "application_no":
        data = await loop.run_in_executor(
            _pool, _ip_search_by_application_number, body.query
        )
        return {"results": [data]}
    else:
        results = await loop.run_in_executor(
            _pool, _ip_search_by_wordmark, body.query, body.class_number
        )
        return {"results": results}


# ── OTP (no-op) ───────────────────────────────────────────────────────────────

@router.post("/send-otp")
async def send_otp_route(body: SendOtpRequest, user: User = Depends(get_current_user)):
    """No-op — neither QC nor IP India public search requires OTP."""
    session_id = await send_otp(body.email)
    return {
        "session_id": session_id,
        "message": "Ready. (No OTP needed — public search sources used.)",
    }


@router.post("/fetch-preview")
async def fetch_preview(body: TrademarkAddRequest, user: User = Depends(get_current_user)):
    """Fetch trademark data for preview before saving."""
    data = await scrape_trademark(body.application_number, body.class_number)
    return {**data, **_compute_deadlines(data)}


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("/add")
async def add_trademark(
    body: TrademarkAddRequest, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    existing = await db.trademark_sphere.find_one(
        {"application_number": body.application_number.strip()}
    )
    if existing:
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")

    raw = body.manual_data or await scrape_trademark(body.application_number, body.class_number)
    dl  = _compute_deadlines(raw)
    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    doc = {
        "_id": tid, "id": tid,
        **{k: raw.get(k, "") for k in (
            "application_number", "word_mark", "class_number", "tm_status",
            "proprietor", "applicant_name", "filing_date", "registration_date",
            "valid_upto", "goods_and_services", "trademark_image_url", "address",
        )},
        "class_number":      raw.get("class_number") or body.class_number or "",
        "attorney":          body.attorney or raw.get("attorney", ""),
        "notes":             body.notes or "",
        "client_id":         body.client_id or "",
        "client_name":       body.client_name or "",
        "reminder_emails":   body.reminder_emails,
        "reminders_enabled": body.reminders_enabled,
        "last_fetched":      now.isoformat(),
        "created_at":        now.isoformat(),
        "updated_at":        now.isoformat(),
        "created_by":        user.id,
        "raw_data":          raw,
        "scrape_source":     raw.get("scrape_source", "quickcompany"),
        "documents":         raw.get("documents", []),
        "hearings":          raw.get("hearings"),
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
    existing = await db.trademark_sphere.find_one(
        {"application_number": body.application_number.strip()}
    )
    if existing:
        raise HTTPException(409, f"Trademark {body.application_number} is already tracked.")

    now = datetime.now(IST)
    tid = str(uuid.uuid4())
    raw = body.dict()
    doc = {
        "_id": tid, "id": tid,
        **raw,
        **_compute_deadlines(raw),
        "applicant_name":    raw.get("proprietor", ""),
        "trademark_image_url": "",
        "address":           "",
        "last_fetched":      None,
        "created_at":        now.isoformat(),
        "updated_at":        now.isoformat(),
        "created_by":        user.id,
        "raw_data":          {},
        "scrape_source":     "manual",
        "documents":         [],
        "hearings":          None,
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
    _sync_progress[sync_id] = {
        "status": "queued", "phase": "Starting…", "total": 0, "done": 0,
    }
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
    # Recompute deadlines if valid_upto changed
    if "valid_upto" in upd:
        upd.update(_compute_deadlines(upd))

    res = await db.trademark_sphere.update_one({"id": tm_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    d = await db.trademark_sphere.find_one({"id": tm_id})
    bg.add_task(_gen_reminders, tm_id, d)
    return {k: v for k, v in d.items() if k != "_id"}


@router.post("/{tm_id}/refresh")
async def refresh_tm(
    tm_id: str, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    d = await db.trademark_sphere.find_one({"id": tm_id})
    if not d:
        raise HTTPException(404, "Not found")

    # Clear cache so we get fresh data
    for prefix in ("qc::", "unified::"):
        _tm_cache.pop(f"{prefix}{d['application_number']}", None)

    raw = await scrape_trademark(d["application_number"])
    dl  = _compute_deadlines(raw)
    now = datetime.now(IST)
    upd = {
        **{k: raw.get(k) or d.get(k) for k in (
            "word_mark", "tm_status", "proprietor", "filing_date",
            "registration_date", "valid_upto", "goods_and_services",
            "trademark_image_url",
        )},
        "documents":     raw.get("documents", d.get("documents", [])),
        "hearings":      raw.get("hearings",  d.get("hearings")),
        "raw_data":      raw,
        "last_fetched":  now.isoformat(),
        "updated_at":    now.isoformat(),
        "scrape_source": raw.get("scrape_source", "quickcompany"),
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


@router.post("/sync/{application_number}")
async def sync_trademark(application_number: str):

    return await scraper.search_application(
        application_number
    )

@router.get("/health")
async def trademark_health():

    return {
        "status": "running",
        "module": "Trademark Sphere"
    }



@router.post("/watchlist")
async def create_watchlist(payload: dict):

    # watchlist_service not available — stub response
    return {"status": "ok", "message": "Watchlist feature coming soon"}

@router.get("/watchlist")
async def get_watchlists():

    # watchlist_service not available — stub response
    return []

@router.get("/search")
async def search_trademark(query: str):

    # search_service not available — use direct QuickCompany search
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_pool, _qc_fetch_by_app_number, query)
    return result


# ── Combined / Bulk PDF ────────────────────────────────────────────────────────
class CombinedPdfItem(BaseModel):
    name: str
    overall_status: str = "UNKNOWN"
    risk_score: int = 0
    headline: str = ""
    class_filter: Optional[int] = None
    error: Optional[str] = None
    all_results: Optional[List[dict]] = []
    class_breakdown: Optional[List[dict]] = []
    summary_counts: Optional[dict] = {}
    recommendations: Optional[List[str]] = []
    alternative_name_suggestions: Optional[List[str]] = []

class CombinedPdfRequest(BaseModel):
    items: List[CombinedPdfItem]
    logo_data_url:    Optional[str] = None
    footer:           Optional[str] = ""
    tagline:          Optional[str] = "Bulk Trademark Availability Report"
    watermark:        Optional[str] = ""
    custom_watermark: Optional[str] = ""
    client_name:      Optional[str] = ""
    client_mobile:    Optional[str] = ""
    report_date:      Optional[str] = ""

@router.post("/combined-pdf")
async def generate_combined_pdf(
    body: CombinedPdfRequest,
    user: User = Depends(get_current_user),
):
    items_data = [it.dict() for it in body.items]
    branding = {
        "logo_data_url":    body.logo_data_url,
        "footer_text":      body.footer or "",
        "tagline":          body.tagline or "Bulk Trademark Availability Report",
        "watermark":        body.watermark or "",
        "custom_watermark": body.custom_watermark or "",
        "client_name":      body.client_name or "",
        "client_mobile":    body.client_mobile or "",
        "report_date":      body.report_date or "",
    }
    pdf_bytes = build_combined_report_pdf(items_data, branding)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=bulk_trademark_report.pdf"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ── QC Report Endpoints  (mounted at /api/trademark-qc by server.py) ──────────
# These mirror the standalone QuickCompany backend and are called by TrademarkSphere.jsx
# via trademark-qc-api.js:
#   POST /api/trademark-qc/report          → generate + save report
#   GET  /api/trademark-qc/check           → quick check (no save)
#   POST /api/trademark-qc/bulk            → bulk reports
#   POST /api/trademark-qc/bulk/export     → bulk export (pdf/docx/xlsx)
#   GET  /api/trademark-qc/searches        → list history
#   GET  /api/trademark-qc/searches/{id}   → get stored report
#   GET  /api/trademark-qc/searches/{id}/pdf → download PDF
#   DELETE /api/trademark-qc/searches/{id} → delete report
#   POST /api/trademark-qc/class-finder    → Nice class suggestions
#   GET  /api/trademark-qc/branding-preference  → get saved branding
#   POST /api/trademark-qc/branding-preference  → save branding
# ═══════════════════════════════════════════════════════════════════════════════

# ── Pydantic models ────────────────────────────────────────────────────────────

class QCReportRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    class_filter: Optional[int] = Field(None, ge=1, le=45)
    device_only: bool = False
    logo_data_url: Optional[str] = Field(None, max_length=500_000)
    footer: Optional[str] = ""
    tagline: Optional[str] = ""
    watermark: Optional[str] = ""
    custom_watermark: Optional[str] = ""


class QCBulkReportRequest(BaseModel):
    names: List[str] = Field(..., min_items=1, max_items=20)
    class_filter: Optional[int] = Field(None, ge=1, le=45)
    device_only: bool = False
    logo_data_url: Optional[str] = Field(None, max_length=500_000)
    footer: Optional[str] = ""
    tagline: Optional[str] = ""
    watermark: Optional[str] = ""
    custom_watermark: Optional[str] = ""
    prepared_by: Optional[str] = ""
    disclaimer: Optional[str] = ""
    company_name: Optional[str] = ""
    client_name: Optional[str] = ""
    client_mobile: Optional[str] = ""
    report_date: Optional[str] = ""
    enable_monitoring: bool = False


class QCClassFinderRequest(BaseModel):
    description: str = Field(..., min_length=3, max_length=2000)
    top: int = Field(5, ge=1, le=10)


class QCBrandingPreference(BaseModel):
    default_company_id: Optional[str] = None
    default_company_name: Optional[str] = None
    footer: Optional[str] = ""
    tagline: Optional[str] = ""
    watermark: Optional[str] = ""


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _scrape_and_build_report(
    name: str,
    class_filter: Optional[int],
    device_only: bool = False,
    branding: Optional[Dict[str, Any]] = None,
) -> dict:
    """Scrape QC and build availability report. Raises HTTPException on scraper failure."""
    try:
        scraped = await _qc_search_trademarks(name)
    except Exception as e:
        logger.exception("QC scrape failed for '%s': %s", name, e)
        raise HTTPException(
            status_code=502,
            detail=f"QuickCompany source may be temporarily unreachable. Please retry. ({e.__class__.__name__})"
        )

    if device_only:
        device_kw = ("device", "logo", "label", "composite")
        scraped = {
            **scraped,
            "results": [
                r for r in (scraped.get("results") or [])
                if any(k in (r.get("mark_type") or "").lower() for k in device_kw)
                or any(k in (r.get("name") or "").lower() for k in ("device", "label"))
            ],
        }

    report = _build_report(name, scraped, class_filter=class_filter)
    report["device_only"] = device_only
    if branding:
        report.update({k: v for k, v in branding.items() if v is not None})
    return report


async def _save_qc_report(report: dict, user_id: str) -> str:
    report_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": report_id,
        "query": report["query"],
        "overall_status": report["overall_status"],
        "risk_score": report["risk_score"],
        "class_filter": report.get("class_filter"),
        "total_results": (report.get("summary_counts") or {}).get("total_results", 0),
        "headline": report.get("headline", ""),
        "report": report,
        "created_at": now,
        "created_by": user_id,
    }
    await db.trademark_qc_reports.insert_one(doc)
    return report_id


# ── Endpoints ──────────────────────────────────────────────────────────────────

@qc_report_router.get("/")
async def qc_health():
    return {"service": "trademark-qc-api", "status": "ok"}


@qc_report_router.post("/report")
async def qc_create_report(
    payload: QCReportRequest,
    user: User = Depends(get_current_user),
):
    """Generate a full trademark availability report and save to history."""
    branding = {
        "logo_data_url":    payload.logo_data_url,
        "footer":           payload.footer or "",
        "tagline":          payload.tagline or "",
        "watermark":        payload.watermark or "",
        "custom_watermark": payload.custom_watermark or "",
    }
    report = await _scrape_and_build_report(
        payload.name, payload.class_filter,
        device_only=payload.device_only,
        branding=branding,
    )
    report_id = await _save_qc_report(report, user.id)
    return {"id": report_id, "report": report}


@qc_report_router.get("/check")
async def qc_quick_check(
    name: str = Query(..., min_length=1, max_length=128),
    class_filter: Optional[int] = Query(None, ge=1, le=45, alias="class"),
    device_only: bool = Query(False),
    save: bool = Query(False),
    user: User = Depends(get_current_user),
):
    """Quick check — optionally save report to history."""
    report = await _scrape_and_build_report(name, class_filter, device_only=device_only)
    saved_id = None
    if save:
        saved_id = await _save_qc_report(report, user.id)
    return {**report, "saved_id": saved_id}


@qc_report_router.post("/bulk")
async def qc_bulk_reports(
    payload: QCBulkReportRequest,
    user: User = Depends(get_current_user),
):
    """Generate reports for multiple names. Returns { items, count }."""
    # De-dupe + sanitise
    seen: set = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if s and s.lower() not in seen and len(s) <= 128:
            seen.add(s.lower())
            names.append(s)

    if not names:
        raise HTTPException(400, "No valid names provided.")

    branding = {
        "logo_data_url":    payload.logo_data_url,
        "footer":           payload.footer or "",
        "tagline":          payload.tagline or "",
        "watermark":        payload.watermark or "",
        "custom_watermark": payload.custom_watermark or "",
    }
    sem = asyncio.Semaphore(5)

    async def _one(n: str) -> dict:
        async with sem:
            try:
                report = await _scrape_and_build_report(
                    n, payload.class_filter,
                    device_only=payload.device_only,
                    branding=branding,
                )
                rid = await _save_qc_report(report, user.id)
                return {
                    "name": n,
                    "id": rid,
                    "overall_status": report["overall_status"],
                    "risk_score": report["risk_score"],
                    "total_results": (report.get("summary_counts") or {}).get("total_results", 0),
                    "headline": report.get("headline", ""),
                    "report": report,
                    "error": None,
                }
            except HTTPException as e:
                return {"name": n, "error": e.detail}
            except Exception as e:
                logger.exception("bulk item failed: %s", n)
                return {"name": n, "error": str(e)}

    items = list(await asyncio.gather(*[_one(n) for n in names]))
    return {"items": items, "count": len(items)}


@qc_report_router.post("/bulk/export")
async def qc_bulk_export(
    payload: QCBulkReportRequest,
    format: str = Query("pdf", regex="^(pdf|docx|xlsx)$"),
    user: User = Depends(get_current_user),
):
    """Generate + export bulk report as PDF / DOCX / XLSX."""
    from backend.trademark_bulk import (
        run_bulk_searches, build_bulk_pdf, build_bulk_docx, build_bulk_xlsx,
        compute_analytics,
    )

    seen: set = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if s and s.lower() not in seen and len(s) <= 128:
            seen.add(s.lower())
            names.append(s)

    if not names:
        raise HTTPException(400, "No valid names provided.")

    branding = {
        "logo_data_url":    payload.logo_data_url,
        "footer":           payload.footer or "",
        "tagline":          payload.tagline or "Bulk Trademark Availability Report",
        "watermark":        payload.watermark or "",
        "custom_watermark": payload.custom_watermark or "",
        "prepared_by":      payload.prepared_by or "",
        "company_name":     payload.company_name or "",
        "client_name":      payload.client_name or "",
        "client_mobile":    payload.client_mobile or "",
        "report_date":      payload.report_date or "",
    }

    async def _scrape_fn(name, class_filter, *, device_only=False):
        return await _scrape_and_build_report(name, class_filter, device_only=device_only, branding=branding)

    items = await run_bulk_searches(
        names,
        class_filter=payload.class_filter,
        device_only=payload.device_only,
        scrape_fn=_scrape_fn,
        enable_monitoring=payload.enable_monitoring,
    )
    analytics = compute_analytics(items)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if format == "pdf":
        content = build_bulk_pdf(items, branding, analytics)
        media_type = "application/pdf"
        filename = f"bulk_trademark_report_{today}.pdf"
    elif format == "docx":
        content = build_bulk_docx(items, branding, analytics)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"bulk_trademark_report_{today}.docx"
    else:
        content = build_bulk_xlsx(items, branding, analytics)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"bulk_trademark_report_{today}.xlsx"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@qc_report_router.get("/searches")
async def qc_list_history(
    limit: int = Query(25, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    """Return recent saved reports (newest first)."""
    cursor = db.trademark_qc_reports.find(
        {},
        {
            "_id": 0, "id": 1, "query": 1, "overall_status": 1, "risk_score": 1,
            "total_results": 1, "class_filter": 1, "headline": 1, "created_at": 1,
        },
    ).sort("created_at", -1).limit(limit)
    items = [doc async for doc in cursor]
    return items


@qc_report_router.get("/searches/{report_id}")
async def qc_get_report(
    report_id: str,
    user: User = Depends(get_current_user),
):
    doc = await db.trademark_qc_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Report not found.")
    return doc


@qc_report_router.delete("/searches/{report_id}")
async def qc_delete_report(
    report_id: str,
    user: User = Depends(get_current_user),
):
    res = await db.trademark_qc_reports.delete_one({"id": report_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Report not found.")
    return {"deleted": report_id}


@qc_report_router.get("/searches/{report_id}/pdf")
async def qc_download_pdf(
    report_id: str,
    footer: Optional[str] = Query(None),
    tagline: Optional[str] = Query(None),
    watermark: Optional[str] = Query(None),
    has_logo: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
):
    """Download a stored report as PDF. Supports on-the-fly branding override via query params."""
    doc = await db.trademark_qc_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Report not found.")

    # Allow branding override from query params (used by brandedPdfUrl())
    report_data = dict(doc)
    if footer  is not None: report_data.setdefault("report", {})["footer"]   = footer
    if tagline is not None: report_data.setdefault("report", {})["tagline"]  = tagline
    if watermark is not None: report_data.setdefault("report", {})["watermark"] = watermark

    pdf_bytes = build_report_pdf(report_data)
    safe = "".join(c if c.isalnum() else "_" for c in (doc.get("query") or "report"))[:48]
    filename = f"trademark_report_{safe}_{report_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@qc_report_router.post("/class-finder")
async def qc_class_finder(
    payload: QCClassFinderRequest,
    user: User = Depends(get_current_user),
):
    """Suggest Nice classification classes from a free-text product/service description."""
    suggestions = _find_classes(payload.description, top=payload.top)
    return {"description": payload.description, "suggestions": suggestions}


@qc_report_router.get("/branding-preference")
async def qc_get_branding(user: User = Depends(get_current_user)):
    """Retrieve saved branding preference for the current user."""
    doc = await db.trademark_qc_branding.find_one({"user_id": user.id}, {"_id": 0})
    if not doc:
        return {"default_company_id": None, "default_company_name": None, "footer": "", "tagline": "", "watermark": ""}
    return doc


@qc_report_router.post("/branding-preference")
async def qc_save_branding(
    payload: QCBrandingPreference,
    user: User = Depends(get_current_user),
):
    """Save or update branding preference for the current user."""
    doc = {
        "user_id":              user.id,
        "default_company_id":   payload.default_company_id,
        "default_company_name": payload.default_company_name,
        "footer":               payload.footer or "",
        "tagline":              payload.tagline or "",
        "watermark":            payload.watermark or "",
        "updated_at":           datetime.now(timezone.utc).isoformat(),
    }
    await db.trademark_qc_branding.update_one(
        {"user_id": user.id},
        {"$set": doc},
        upsert=True,
    )
    return {"status": "saved", **doc}
