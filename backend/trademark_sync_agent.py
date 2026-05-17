"""
trademark_sync_agent.py
=======================
Standalone Trademark Sphere Sync Agent
No Base44. No external platforms. Pure Python.

Supports two sources:
  1. QuickCompany  — scrapes attorney/agent portfolio + individual TM detail pages
  2. IP India      — ASP.NET form-based public search (no login needed)

Also supports:
  - Manual portal login via browser (Selenium / opens browser, you log in, it extracts data)
  - Single TM lookup by application number
  - Bulk attorney portfolio sync
  - Saves to MongoDB (your existing database)
  - Auto-generates renewal reminders (90/60/30/7 days)

USAGE:
  python trademark_sync_agent.py --help
  python trademark_sync_agent.py attorney --code TM-AG-XXXX
  python trademark_sync_agent.py single --app 1234567
  python trademark_sync_agent.py portal-login --url https://tmrsearch.ipindia.gov.in/eregister/
  python trademark_sync_agent.py stats

REQUIREMENTS:
  pip install requests beautifulsoup4 lxml pymongo selenium python-dotenv

ENV VARS (or .env file):
  MONGO_URL=mongodb://localhost:27017
  DB_NAME=taskosphere
"""

import os, re, sys, uuid, time, logging, json, argparse
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urljoin, quote
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup
from pymongo import MongoClient, UpdateOne

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

MONGO_URL  = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME    = os.getenv("DB_NAME", "taskosphere")
IST        = ZoneInfo("Asia/Kolkata")
LOG_LEVEL  = os.getenv("LOG_LEVEL", "INFO")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("tm-agent")

# ── QuickCompany URLs ─────────────────────────────────────────────────────────
QC_BASE   = "https://www.quickcompany.in"
QC_SEARCH = f"{QC_BASE}/trademarks"
QC_DETAIL = f"{QC_BASE}/trademarks"
QC_ATTY   = f"{QC_BASE}/trademarks/attorney"

# ── IP India URLs ─────────────────────────────────────────────────────────────
IP_BASE   = "https://tmrsearch.ipindia.gov.in"
IP_MAIN   = f"{IP_BASE}/tmrpublicsearch/frmmain.aspx"
IP_SEARCH = f"{IP_BASE}/tmrpublicsearch/tmsearch.aspx"

COMMON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}

# ══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════════════════════

_client: Optional[MongoClient] = None
_db = None

def get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        _db = _client[DB_NAME]
        log.info(f"Connected to MongoDB: {DB_NAME}")
    return _db

# ══════════════════════════════════════════════════════════════════════════════
# HTTP SESSIONS
# ══════════════════════════════════════════════════════════════════════════════

_qc_session: Optional[requests.Session] = None
_ip_session: Optional[requests.Session] = None

def qc_sess() -> requests.Session:
    global _qc_session
    if _qc_session is None:
        s = requests.Session()
        s.headers.update({**COMMON_HEADERS, "Accept": "text/html,*/*;q=0.8", "Referer": QC_SEARCH})
        try:
            s.get(QC_SEARCH, timeout=15)
            time.sleep(0.5)
        except Exception:
            pass
        _qc_session = s
    return _qc_session

def ip_sess() -> requests.Session:
    global _ip_session
    if _ip_session is None:
        s = requests.Session()
        s.headers.update({**COMMON_HEADERS, "Accept": "text/html,*/*;q=0.8", "Referer": IP_MAIN})
        _ip_session = s
    return _ip_session

# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def clean(v: Any) -> Optional[str]:
    if v is None:
        return None
    return " ".join(str(v).split()).strip() or None

def parse_date(s: Any) -> Optional[str]:
    """Parse various date formats → ISO string YYYY-MM-DD"""
    if not s:
        return None
    s = str(s).strip()
    formats = [
        "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y",
        "%d %b %Y", "%B %d, %Y", "%d-%b-%Y",
        "%d %B %Y", "%b %d, %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None

STATUS_MAP = {
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

def normalize_status(raw: str) -> str:
    if not raw:
        return "Unknown"
    r = raw.strip().lower()
    for k, v in STATUS_MAP.items():
        if k in r:
            return v
    return raw.strip().title()

def compute_deadlines(tm: Dict) -> Dict:
    """Compute renewal_date, days_until_renewal, renewal_status from valid_upto."""
    today = date.today()
    out = {}
    rd_str = tm.get("valid_upto") or tm.get("renewal_date") or tm.get("renewal_due")
    rd_str = parse_date(rd_str) if rd_str else None
    if rd_str:
        rd = date.fromisoformat(rd_str)
        days_left = (rd - today).days
        out["renewal_date"]       = rd_str
        out["days_until_renewal"] = days_left
        if days_left < 0:
            out["renewal_status"] = "overdue"
        elif days_left <= 30:
            out["renewal_status"] = "critical"
        elif days_left <= 90:
            out["renewal_status"] = "warning"
        elif days_left <= 180:
            out["renewal_status"] = "upcoming"
        else:
            out["renewal_status"] = "ok"
    return out

# ══════════════════════════════════════════════════════════════════════════════
# SOURCE 1 — QUICKCOMPANY SCRAPER
# ══════════════════════════════════════════════════════════════════════════════

def qc_parse_detail(html: str, app_number: str) -> Dict:
    """Parse a QuickCompany trademark detail page."""
    soup = BeautifulSoup(html, "lxml")

    # Word mark from H1
    word_mark = ""
    h1 = soup.find("h1")
    if h1:
        word_mark = clean(h1.get_text()) or ""

    # Build KV map from all table rows
    kv: Dict[str, str] = {}
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) >= 2:
            key = clean(cells[0].get_text())
            val = clean(cells[1].get_text())
            if key and val:
                kv[key.lower()] = val

    # Also grab h4/p pattern pairs
    section = soup.find("div", class_=re.compile(r"detail|info|trademark", re.I))
    if section:
        for lbl in section.find_all(["h4", "strong", "dt"]):
            key = clean(lbl.get_text())
            nxt = lbl.find_next_sibling()
            if nxt:
                val = clean(nxt.get_text())
                if key and val:
                    kv[key.lower()] = val

    def g(*keys) -> str:
        for k in keys:
            if kv.get(k):
                return kv[k]
        return ""

    # Trademark image
    img_url = ""
    img = (soup.find("img", src=re.compile(r"quickcompany\.blob|trademark.*image", re.I))
           or soup.find("img", alt=re.compile(r"trademark|logo", re.I)))
    if img:
        img_url = img.get("src", "")

    # Extract documents from tables
    documents = []
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) >= 3:
            doc_name = clean(cells[1].get_text()) if len(cells) > 1 else ""
            doc_date = clean(cells[2].get_text()) if len(cells) > 2 else ""
            link_tag = cells[1].find("a") if len(cells) > 1 else None
            doc_link = ""
            if link_tag:
                doc_link = urljoin(QC_BASE, link_tag.get("href", ""))
            if doc_name and doc_name not in ("", "—", "Document"):
                documents.append({"name": doc_name, "date": doc_date, "url": doc_link})

    # Hearing info
    hearings = []
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        row_text = " ".join(c.get_text() for c in cells).lower()
        if "hearing" in row_text or "notice" in row_text:
            hearings.append({
                "date":   clean(cells[-1].get_text()) if cells else "",
                "detail": " | ".join(clean(c.get_text()) for c in cells if clean(c.get_text())),
            })

    class_no = g("classes", "class", "class number", "nice class")
    if class_no:
        m = re.search(r"\d+", class_no)
        class_no = m.group(0) if m else class_no

    status_raw  = g("status", "tm status", "application status")
    proprietor  = g("proprietor", "applicant", "owner")
    attorney    = g("attorney", "agent", "trademark agent", "trademark attorney")
    filing_date = g("date of application", "filing date", "application date", "applied on")
    reg_date    = g("date of registration", "registration date", "registered on")
    valid_upto  = g("valid / upto", "valid upto", "valid till", "expiry date", "renewal date")
    address     = g("address", "applicant address", "proprietor address")
    gs          = g("description", "goods and services", "goods & services", "specification")

    rec = {
        "application_number":  str(app_number).strip(),
        "word_mark":           word_mark,
        "tm_status":           normalize_status(status_raw),
        "class_number":        class_no,
        "proprietor":          proprietor,
        "applicant_name":      proprietor,
        "attorney":            attorney,
        "filing_date":         parse_date(filing_date),
        "registration_date":   parse_date(reg_date),
        "valid_upto":          parse_date(valid_upto),
        "goods_and_services":  gs,
        "address":             address,
        "trademark_image_url": img_url,
        "documents":           documents,
        "hearings":            hearings,
        "scrape_source":       "quickcompany",
        "last_fetched":        datetime.now(IST).isoformat(),
    }
    rec.update(compute_deadlines(rec))
    return rec


def qc_fetch_single(app_number: str) -> Dict:
    """Fetch full trademark data from QuickCompany for one application number."""
    sess = qc_sess()
    # Try direct URL first (QC redirects to slug URL)
    url = f"{QC_DETAIL}/{app_number.strip()}"
    try:
        r = sess.get(url, timeout=20, allow_redirects=True)
        if r.status_code == 200 and "trademark" in r.url:
            log.debug(f"  QC direct hit: {r.url}")
            return qc_parse_detail(r.text, app_number)
    except requests.RequestException as e:
        log.warning(f"  QC direct fetch failed for {app_number}: {e}")

    # Fallback: search QC
    try:
        r = sess.get(f"{QC_SEARCH}", params={"q": app_number}, timeout=20)
        soup = BeautifulSoup(r.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if f"/trademarks/{app_number}" in href:
                detail_url = urljoin(QC_BASE, href)
                r2 = sess.get(detail_url, timeout=20)
                return qc_parse_detail(r2.text, app_number)
    except Exception as e:
        log.warning(f"  QC search fallback failed for {app_number}: {e}")

    return {"application_number": app_number, "tm_status": "Unknown", "scrape_source": "quickcompany"}


def qc_attorney_app_numbers(agent_code: str) -> List[str]:
    """Scrape all application numbers from a QuickCompany attorney page."""
    sess = qc_sess()
    app_numbers: List[str] = []
    page = 1

    log.info(f"Fetching attorney portfolio: {agent_code}")
    while page <= 30:
        url = f"{QC_ATTY}/{agent_code.strip()}?page={page}"
        try:
            r = sess.get(url, timeout=20)
            if r.status_code != 200:
                log.warning(f"  Page {page}: HTTP {r.status_code} — stopping")
                break
            html = r.text
            # Find all TM links like /trademarks/1234567-brandname
            matches = re.findall(r'/trademarks/(\d{5,8})-[^"\'>\s]+', html)
            found = list(dict.fromkeys(matches))  # deduplicate, preserve order
            if not found:
                log.info(f"  Page {page}: no results — done")
                break
            new = [n for n in found if n not in app_numbers]
            app_numbers.extend(new)
            log.info(f"  Page {page}: found {len(new)} new ({len(app_numbers)} total)")
            page += 1
            time.sleep(0.6)  # polite delay
        except requests.RequestException as e:
            log.warning(f"  Page {page}: request failed — {e}")
            break

    log.info(f"Attorney portfolio: {len(app_numbers)} applications found")
    return app_numbers

# ══════════════════════════════════════════════════════════════════════════════
# SOURCE 2 — IP INDIA PUBLIC SEARCH
# ══════════════════════════════════════════════════════════════════════════════

def ip_get_viewstate() -> Dict[str, str]:
    """Get ASP.NET form state from IP India main page."""
    sess = ip_sess()
    r = sess.get(IP_MAIN, timeout=20)
    html = r.text

    def extract(name):
        m = re.search(rf'name="{re.escape(name)}"\s+value="([^"]*)"', html)
        return m.group(1) if m else ""

    return {
        "__VIEWSTATE":          extract("__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": extract("__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION":    extract("__EVENTVALIDATION"),
    }


def ip_fetch_single(app_number: str) -> Dict:
    """Search IP India public search for a trademark by application number."""
    sess = ip_sess()
    try:
        vs = ip_get_viewstate()
        form = {
            **vs,
            "ctl00$ContentPlaceHolder1$rdbApplication": "rdbtmNO",
            "ctl00$ContentPlaceHolder1$txtapplicationNo": app_number.strip(),
            "ctl00$ContentPlaceHolder1$btnSearch": "Search",
        }
        r = sess.post(
            IP_SEARCH,
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": IP_MAIN},
            timeout=25,
            allow_redirects=True,
        )
        soup = BeautifulSoup(r.text, "lxml")

        kv: Dict[str, str] = {}
        for tr in soup.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) >= 2:
                key = clean(cells[0].get_text())
                val = clean(cells[1].get_text())
                if key and val:
                    kv[key.lower()] = val

        def g(*keys):
            for k in keys:
                if kv.get(k):
                    return kv[k]
            return ""

        valid_upto = parse_date(g("valid upto", "validity", "valid till"))
        rec = {
            "application_number": app_number,
            "word_mark":          g("word mark", "trade mark", "trademark"),
            "tm_status":          normalize_status(g("tm status", "status")),
            "class_number":       g("class"),
            "proprietor":         g("proprietor", "owner"),
            "applicant_name":     g("applicant", "proprietor"),
            "attorney":           g("attorney", "agent"),
            "filing_date":        parse_date(g("date of filing", "filing date")),
            "registration_date":  parse_date(g("date of registration", "registration date")),
            "valid_upto":         valid_upto,
            "goods_and_services": g("goods and services"),
            "address":            g("address"),
            "scrape_source":      "ipindia",
            "last_fetched":       datetime.now(IST).isoformat(),
        }
        rec.update(compute_deadlines(rec))
        return rec

    except Exception as e:
        log.error(f"IP India fetch failed for {app_number}: {e}")
        return {"application_number": app_number, "tm_status": "Unknown", "scrape_source": "ipindia"}

# ══════════════════════════════════════════════════════════════════════════════
# SOURCE 3 — MANUAL PORTAL LOGIN (Selenium Browser)
# ══════════════════════════════════════════════════════════════════════════════

def portal_login_and_extract(portal_url: str, agent_code: str = "") -> List[str]:
    """
    Opens the TM agent portal in a real browser, lets you log in manually,
    then automatically extracts all trademark application numbers.

    Requires: pip install selenium
    Also install ChromeDriver matching your Chrome version.
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        log.error("Selenium not installed. Run: pip install selenium")
        sys.exit(1)

    options = Options()
    options.add_argument("--start-maximized")
    # NOT headless — you need to see the browser to log in manually
    # options.add_argument("--headless")  # ← Do NOT enable this for manual login

    log.info("=" * 60)
    log.info("MANUAL LOGIN MODE")
    log.info(f"Opening portal: {portal_url}")
    log.info("1. Log in manually in the browser that opens")
    log.info("2. Navigate to your trademark list / portfolio page")
    log.info("3. Come back here and press ENTER when ready")
    log.info("=" * 60)

    driver = webdriver.Chrome(options=options)
    driver.get(portal_url)

    input("\n✅ Logged in and on the trademark list page? Press ENTER to extract data...")

    # Extract application numbers from current page HTML
    app_numbers = []
    page = 1

    while True:
        html = driver.page_source
        # Try to find application numbers in common patterns
        # Pattern 1: standard 7-digit TM numbers
        found = list(dict.fromkeys(re.findall(r'\b(\d{7,8})\b', html)))
        new = [n for n in found if n not in app_numbers and len(n) in (7, 8)]
        if new:
            app_numbers.extend(new)
            log.info(f"  Page {page}: extracted {len(new)} app numbers ({len(app_numbers)} total)")

        # Try to click "Next" button
        try:
            next_btn = driver.find_element(By.XPATH,
                "//a[contains(text(),'Next') or contains(text(),'next') or contains(text(),'›') or contains(text(),'>>')]"
            )
            if next_btn and next_btn.is_displayed():
                next_btn.click()
                time.sleep(2)
                page += 1
            else:
                break
        except Exception:
            break

    log.info(f"Browser extraction complete: {len(app_numbers)} application numbers")

    # Ask before closing
    input("\nPress ENTER to close the browser...")
    driver.quit()

    return app_numbers

# ══════════════════════════════════════════════════════════════════════════════
# DATABASE OPERATIONS
# ══════════════════════════════════════════════════════════════════════════════

def save_records(records: List[Dict], sync_id: str = "", agent_code: str = "",
                 refresh_existing: bool = True) -> Dict:
    """Upsert trademark records into MongoDB."""
    db = get_db()
    col = db["trademark_sphere"]

    added = updated = failed = 0
    errors = []
    ops = []

    for rec in records:
        app_num = rec.get("application_number")
        if not app_num:
            continue
        try:
            doc = {
                **rec,
                "sync_batch_id": sync_id or None,
                "agent_code":    agent_code or rec.get("agent_code", ""),
                "last_fetched":  datetime.now(IST).isoformat(),
            }
            # Upsert by application_number
            ops.append(
                UpdateOne(
                    {"application_number": app_num},
                    {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4())}},
                    upsert=True,
                )
            )
        except Exception as e:
            failed += 1
            errors.append(f"{app_num}: {e}")

    if ops:
        result = col.bulk_write(ops, ordered=False)
        added   = result.upserted_count
        updated = result.modified_count
        failed  += len(result.bulk_api_result.get("writeErrors", []))

    log.info(f"Save complete — added: {added}, updated: {updated}, failed: {failed}")

    # Update sync session if provided
    if sync_id:
        db["trademark_sphere_sync_sessions"].update_one(
            {"sync_id": sync_id},
            {"$set": {
                "status":       "done",
                "added":        added,
                "updated":      updated,
                "failed":       failed,
                "errors":       errors,
                "completed_at": datetime.now(IST).isoformat(),
                "phase":        f"Done — {added} added, {updated} updated, {failed} failed",
            }},
        )

    return {"added": added, "updated": updated, "failed": failed, "errors": errors}


def create_sync_session(agent_code: str, login_method: str = "quickcompany") -> str:
    """Create a new sync session record and return its sync_id."""
    db = get_db()
    sync_id = str(uuid.uuid4())
    db["trademark_sphere_sync_sessions"].insert_one({
        "sync_id":      sync_id,
        "agent_code":   agent_code,
        "status":       "running",
        "phase":        "Starting…",
        "total":        0, "done": 0, "added": 0, "updated": 0, "failed": 0,
        "errors":       [],
        "started_at":   datetime.now(IST).isoformat(),
        "login_method": login_method,
    })
    return sync_id


def update_sync_progress(sync_id: str, done: int, total: int, phase: str):
    db = get_db()
    db["trademark_sphere_sync_sessions"].update_one(
        {"sync_id": sync_id},
        {"$set": {"done": done, "total": total, "phase": phase}},
    )


def generate_reminders(tm_id: str, tm: Dict):
    """Auto-generate 90/60/30/7-day renewal reminders."""
    if not tm.get("reminders_enabled", True):
        return
    valid_upto = tm.get("valid_upto")
    if not valid_upto:
        return
    db = get_db()
    col = db["trademark_sphere_reminders"]
    col.delete_many({"trademark_id": tm_id})

    try:
        rd = date.fromisoformat(valid_upto)
    except ValueError:
        return

    today = date.today()
    rows = []
    for days in (90, 60, 30, 7):
        remind_on = rd - timedelta(days=days)
        if remind_on >= today:
            rows.append({
                "id":                 str(uuid.uuid4()),
                "trademark_id":       tm_id,
                "application_number": tm.get("application_number"),
                "word_mark":          tm.get("word_mark"),
                "type":               "renewal",
                "label":              f"Renewal due in {days} days",
                "remind_on":          remind_on.isoformat(),
                "renewal_date":       rd.isoformat(),
                "days_before":        days,
                "sent":               False,
                "auto_generated":     True,
                "created_at":         datetime.now(IST).isoformat(),
            })
    if rows:
        col.insert_many(rows)

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SYNC COMMANDS
# ══════════════════════════════════════════════════════════════════════════════

def cmd_single(app_number: str, source: str = "quickcompany", save: bool = True):
    """Fetch and optionally save a single trademark."""
    log.info(f"Fetching single trademark: {app_number} (source: {source})")
    if source == "ipindia":
        rec = ip_fetch_single(app_number)
    else:
        rec = qc_fetch_single(app_number)

    print("\n" + "═" * 60)
    print(f"  Application #: {rec.get('application_number')}")
    print(f"  Word Mark:     {rec.get('word_mark')}")
    print(f"  Status:        {rec.get('tm_status')}")
    print(f"  Class:         {rec.get('class_number')}")
    print(f"  Proprietor:    {rec.get('proprietor')}")
    print(f"  Filing Date:   {rec.get('filing_date')}")
    print(f"  Valid Upto:    {rec.get('valid_upto')}")
    print(f"  Renewal:       {rec.get('renewal_status')} ({rec.get('days_until_renewal')} days)")
    print("═" * 60)

    if save:
        result = save_records([rec])
        print(f"  Saved: {result}")

    return rec


def cmd_attorney(agent_code: str, source: str = "quickcompany",
                  workers: int = 4, refresh: bool = True):
    """Bulk sync all trademarks for an attorney/agent code."""
    log.info(f"Starting attorney portfolio sync: {agent_code}")
    sync_id = create_sync_session(agent_code, login_method=source)
    log.info(f"Sync session ID: {sync_id}")

    # Step 1: Get all application numbers
    if source == "ipindia":
        log.warning("IP India bulk attorney listing not supported — use quickcompany")
        sys.exit(1)

    app_numbers = qc_attorney_app_numbers(agent_code)
    total = len(app_numbers)
    if total == 0:
        log.warning("No trademarks found for this attorney code")
        return

    log.info(f"Will fetch {total} trademarks using {workers} parallel workers")
    update_sync_progress(sync_id, done=0, total=total, phase=f"Fetching {total} trademarks…")

    # Step 2: Fetch each trademark in parallel
    records = []
    done = 0
    failed_nums = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_num = {pool.submit(qc_fetch_single, num): num for num in app_numbers}
        for future in as_completed(future_to_num):
            num = future_to_num[future]
            done += 1
            try:
                rec = future.result()
                records.append(rec)
                log.info(f"  [{done}/{total}] ✓ {num} — {rec.get('word_mark', '?')} [{rec.get('tm_status')}]")
            except Exception as e:
                log.warning(f"  [{done}/{total}] ✗ {num} — {e}")
                failed_nums.append(num)
            update_sync_progress(sync_id, done=done, total=total,
                                  phase=f"Processing {num} ({done}/{total})…")
            time.sleep(0.3)  # polite rate limit

    # Step 3: Save all records
    log.info(f"Saving {len(records)} records to database…")
    result = save_records(records, sync_id=sync_id, agent_code=agent_code, refresh_existing=refresh)

    # Step 4: Generate reminders
    db = get_db()
    for rec in records:
        existing = db["trademark_sphere"].find_one({"application_number": rec["application_number"]})
        if existing:
            generate_reminders(existing.get("id", ""), existing)

    print("\n" + "═" * 60)
    print(f"  SYNC COMPLETE")
    print(f"  Agent Code:  {agent_code}")
    print(f"  Total Found: {total}")
    print(f"  Added:       {result['added']}")
    print(f"  Updated:     {result['updated']}")
    print(f"  Failed:      {result['failed']}")
    if failed_nums:
        print(f"  Failed App#: {', '.join(failed_nums[:10])}")
    print("═" * 60)


def cmd_portal_login(portal_url: str, agent_code: str = "", source: str = "quickcompany",
                      workers: int = 4):
    """Manual browser login flow — open portal, log in, extract & sync data."""
    log.info("Starting manual portal login sync flow")
    sync_id = create_sync_session(agent_code or "manual_login", login_method="manual_browser")

    # Step 1: Manual browser login + extraction
    app_numbers = portal_login_and_extract(portal_url, agent_code)
    if not app_numbers:
        log.warning("No application numbers extracted from portal")
        return

    log.info(f"Extracted {len(app_numbers)} application numbers from portal")
    total = len(app_numbers)
    update_sync_progress(sync_id, done=0, total=total, phase=f"Fetching {total} trademarks…")

    # Step 2: Fetch each from QuickCompany / IP India for full data
    log.info(f"Fetching full trademark data from {source}…")
    records = []
    done = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        if source == "ipindia":
            future_to_num = {pool.submit(ip_fetch_single, num): num for num in app_numbers}
        else:
            future_to_num = {pool.submit(qc_fetch_single, num): num for num in app_numbers}

        for future in as_completed(future_to_num):
            num = future_to_num[future]
            done += 1
            try:
                rec = future.result()
                records.append(rec)
                log.info(f"  [{done}/{total}] ✓ {num} — {rec.get('word_mark', '?')}")
            except Exception as e:
                log.warning(f"  [{done}/{total}] ✗ {num} — {e}")
            update_sync_progress(sync_id, done=done, total=total,
                                  phase=f"Fetching {num} ({done}/{total})…")
            time.sleep(0.3)

    # Step 3: Save
    result = save_records(records, sync_id=sync_id, agent_code=agent_code)

    print("\n" + "═" * 60)
    print(f"  PORTAL SYNC COMPLETE")
    print(f"  Portal:  {portal_url}")
    print(f"  Total:   {total}")
    print(f"  Added:   {result['added']}")
    print(f"  Updated: {result['updated']}")
    print(f"  Failed:  {result['failed']}")
    print("═" * 60)


def cmd_stats():
    """Print trademark statistics from the database."""
    db = get_db()
    col = db["trademark_sphere"]
    total      = col.count_documents({})
    registered = col.count_documents({"tm_status": "Registered"})
    pending    = col.count_documents({"tm_status": {"$in": [
        "Pending", "Under Examination", "Objected", "Opposed",
        "Accepted & Advertised", "Advertised Before Acceptance"
    ]}})
    overdue    = col.count_documents({"renewal_status": "overdue"})
    critical   = col.count_documents({"renewal_status": "critical"})
    warning    = col.count_documents({"renewal_status": "warning"})

    print("\n" + "═" * 40)
    print("  TRADEMARK SPHERE STATS")
    print("═" * 40)
    print(f"  Total:       {total}")
    print(f"  Registered:  {registered}")
    print(f"  Pending:     {pending}")
    print(f"  ⚠ Overdue:  {overdue}")
    print(f"  🔴 Critical: {critical} (≤30 days)")
    print(f"  🟡 Warning:  {warning} (≤90 days)")
    print("═" * 40)

    # Recent syncs
    sessions = list(db["trademark_sphere_sync_sessions"]
                    .find({}, {"_id": 0})
                    .sort("started_at", -1)
                    .limit(3))
    if sessions:
        print("\n  RECENT SYNCS")
        for s in sessions:
            print(f"  • {s.get('started_at', '')[:19]}  |  {s.get('agent_code')}  |  "
                  f"added={s.get('added', 0)} updated={s.get('updated', 0)}  [{s.get('status')}]")
    print()


# ══════════════════════════════════════════════════════════════════════════════
# CLI ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        prog="trademark_sync_agent",
        description="Trademark Sphere Sync Agent — standalone, no external platforms",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
EXAMPLES:
  # Look up a single trademark by app number
  python trademark_sync_agent.py single --app 1234567

  # Sync entire attorney portfolio from QuickCompany
  python trademark_sync_agent.py attorney --code TM-AG-XXXX

  # Manual portal login (browser opens, you log in, it syncs)
  python trademark_sync_agent.py portal-login --url https://tmrsearch.ipindia.gov.in/eregister/

  # Show database stats
  python trademark_sync_agent.py stats

ENV VARS:
  MONGO_URL  — MongoDB connection string (default: mongodb://localhost:27017)
  DB_NAME    — Database name (default: taskosphere)
        """
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # single
    p_single = sub.add_parser("single", help="Fetch a single trademark by app number")
    p_single.add_argument("--app",    required=True, help="Application number (e.g. 1234567)")
    p_single.add_argument("--source", default="quickcompany", choices=["quickcompany", "ipindia"])
    p_single.add_argument("--no-save", action="store_true", help="Don't save to database")

    # attorney
    p_atty = sub.add_parser("attorney", help="Sync full attorney portfolio from QuickCompany")
    p_atty.add_argument("--code",     required=True, help="Agent/attorney code on QuickCompany")
    p_atty.add_argument("--workers",  type=int, default=4, help="Parallel fetch workers (default: 4)")
    p_atty.add_argument("--no-refresh", action="store_true", help="Skip already-existing records")

    # portal-login
    p_portal = sub.add_parser("portal-login", help="Manual browser portal login + auto extract & sync")
    p_portal.add_argument("--url",     required=True, help="Portal URL to open (e.g. IP India eRegister)")
    p_portal.add_argument("--code",    default="",    help="Your agent code (optional, for record-keeping)")
    p_portal.add_argument("--source",  default="quickcompany", choices=["quickcompany", "ipindia"],
                           help="Where to fetch full TM data after extracting app numbers")
    p_portal.add_argument("--workers", type=int, default=4)

    # stats
    sub.add_parser("stats", help="Show trademark statistics from database")

    args = parser.parse_args()

    if args.command == "single":
        cmd_single(args.app, source=args.source, save=not args.no_save)

    elif args.command == "attorney":
        cmd_attorney(args.code, workers=args.workers, refresh=not args.no_refresh)

    elif args.command == "portal-login":
        cmd_portal_login(args.url, agent_code=args.code,
                          source=args.source, workers=args.workers)

    elif args.command == "stats":
        cmd_stats()


if __name__ == "__main__":
    main()
