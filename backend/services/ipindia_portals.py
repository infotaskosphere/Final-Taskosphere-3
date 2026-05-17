# backend/services/ipindia_portals.py
# ----------------------------------------------------------------------------
# Real scrapers for two IP India portals:
#
#   1) EstatusPortal           https://tmrsearch.ipindia.gov.in/estatus
#      Flow:  email  +  captcha  ->  OTP sent to email  ->  verify OTP
#             -> list of trademark application numbers tied to the email.
#
#   2) AgentEfilingPortal      https://ipindiaonline.gov.in/trademarkefiling/
#      Uses Playwright (headless Chromium) to handle JS, dynamic captchas,
#      and Cloudflare bot-protection that blocks plain requests.
#      Flow:  open login page -> screenshot captcha -> user types captcha
#             -> submit -> auto-browse ALL pages of My Applications
#             -> for each TM number, fetch full details from IP India portal
#
# NOTE: If field names/selectors change, check logs for HTML output and update
# the selector constants near each class.
# ----------------------------------------------------------------------------

from __future__ import annotations

import base64
import logging
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("ipindia.portals")

# ── Shared constants ─────────────────────────────────────────────────────────

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
DEFAULT_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}
SESSION_TTL = 20 * 60   # 20 minutes
_GC_LOCK = threading.Lock()


def _new_requests_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(DEFAULT_HEADERS)
    return s


def _extract_hidden_fields(html: str) -> Dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    out: Dict[str, str] = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        name = inp.get("name")
        if name:
            out[name] = inp.get("value", "") or ""
    return out


def _img_to_data_url(content: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


_APP_NUM_RE = re.compile(r"\b(\d{6,10})\b")


def _scrape_application_numbers(html: str) -> List[str]:
    """
    Compatibility shim — delegates to _parse_gridview_page which understands
    ASP.NET GridView structure.  Returns only the application numbers list.
    """
    nums, _, _ = _parse_gridview_page(html)
    return nums


def _clean(v: Any) -> str:
    return " ".join(str(v or "").split()).strip()


def _normalise_status(raw: str) -> str:
    if not raw:
        return ""
    r = raw.strip().lower()
    for k, v in {
        "registered": "Registered", "pending": "Pending",
        "formalities chk pass": "Pending", "new application": "Pending",
        "marked for exam": "Under Examination", "under examination": "Under Examination",
        "objected": "Objected", "opposed": "Opposed",
        "accepted and advertised": "Accepted & Advertised",
        "accepted & advertised": "Accepted & Advertised",
        "advertised before acceptance": "Advertised Before Acceptance",
        "refused": "Refused", "abandoned": "Abandoned",
        "withdrawn": "Withdrawn", "removed": "Abandoned", "expired": "Abandoned",
    }.items():
        if k in r:
            return v
    return raw.strip().title()


# ════════════════════════════════════════════════════════════════════════════
# 1)  Estatus portal — email + captcha + OTP
# ════════════════════════════════════════════════════════════════════════════

@dataclass
class _EstatusSession:
    session_id: str
    http: requests.Session
    created_at: float
    hidden: Dict[str, str] = field(default_factory=dict)
    email: str = ""
    otp_sent: bool = False


class EstatusPortal:
    BASE = "https://tmrsearch.ipindia.gov.in/estatus"
    FIELDS = {
        "email_input":     "txtEmail",
        "captcha_input":   "txtCaptcha",
        "captcha_img":     "imgCaptcha",
        "send_otp_button": "btnSendOTP",
        "otp_input":       "txtOTP",
        "verify_button":   "btnVerifyOTP",
    }

    def __init__(self) -> None:
        self._sessions: Dict[str, _EstatusSession] = {}

    def _gc(self) -> None:
        cutoff = time.time() - SESSION_TTL
        with _GC_LOCK:
            for sid in [k for k, v in self._sessions.items() if v.created_at < cutoff]:
                self._sessions.pop(sid, None)

    def _get(self, sid: str) -> _EstatusSession:
        s = self._sessions.get(sid)
        if not s:
            raise ValueError("Session expired. Please reload the captcha and start over.")
        return s

    def open(self) -> Dict[str, str]:
        self._gc()
        sess = _new_requests_session()
        r = sess.get(self.BASE, timeout=30)
        r.raise_for_status()
        hidden = _extract_hidden_fields(r.text)
        soup = BeautifulSoup(r.text, "html.parser")
        img = soup.find("img", {"id": self.FIELDS["captcha_img"]}) or \
              soup.find("img", src=re.compile(r"[Cc]aptcha"))
        if not img or not img.get("src"):
            raise RuntimeError("Estatus: captcha image not found in page.")
        cap_url = requests.compat.urljoin(self.BASE, img["src"])
        cap = sess.get(cap_url, timeout=30, headers={"Referer": self.BASE})
        cap.raise_for_status()
        sid = str(uuid.uuid4())
        self._sessions[sid] = _EstatusSession(
            session_id=sid, http=sess, created_at=time.time(), hidden=hidden,
        )
        return {"session_id": sid,
                "captcha_image": _img_to_data_url(cap.content,
                                                  cap.headers.get("Content-Type", "image/jpeg"))}

    def send_otp(self, session_id: str, email: str, captcha: str) -> Dict[str, str]:
        s = self._get(session_id)
        s.email = email.strip().lower()
        payload = dict(s.hidden)
        payload[self.FIELDS["email_input"]]   = email.strip()
        payload[self.FIELDS["captcha_input"]] = captcha.strip()
        payload["__EVENTTARGET"]   = self.FIELDS["send_otp_button"]
        payload["__EVENTARGUMENT"] = ""
        r = s.http.post(self.BASE, data=payload, timeout=30, headers={"Referer": self.BASE})
        r.raise_for_status()
        s.hidden = _extract_hidden_fields(r.text)
        if self.FIELDS["otp_input"] not in r.text and "OTP" not in r.text.upper():
            raise RuntimeError("Estatus: OTP request rejected — captcha or email wrong.")
        s.otp_sent = True
        return {"session_id": session_id, "message": "OTP sent to your email."}

    def verify_otp_and_list(self, session_id: str, otp: str) -> Dict[str, List[str]]:
        s = self._get(session_id)
        if not s.otp_sent:
            raise RuntimeError("Estatus: no OTP requested for this session.")
        payload = dict(s.hidden)
        payload[self.FIELDS["otp_input"]] = otp.strip()
        payload["__EVENTTARGET"]   = self.FIELDS["verify_button"]
        payload["__EVENTARGUMENT"] = ""
        r = s.http.post(self.BASE, data=payload, timeout=45, headers={"Referer": self.BASE})
        r.raise_for_status()
        nums = _scrape_application_numbers(r.text)
        if not nums:
            raise RuntimeError("Estatus: no applications found (OTP wrong or register empty).")
        return {"application_numbers": nums, "email": s.email}


# ════════════════════════════════════════════════════════════════════════════
# 2)  Agent eFiling portal — Playwright headless Chromium
# ════════════════════════════════════════════════════════════════════════════

@dataclass
class _AgentPWSession:
    session_id: str
    created_at: float
    user_id: str = ""


class AgentEfilingPortal:
    """
    Playwright-based scraper for:
      https://ipindiaonline.gov.in/trademarkefiling/user/frmLoginNew.aspx

    Why Playwright:
    - The login page uses JavaScript to render the captcha dynamically.
    - Simple requests.get() returns a page without the captcha <img> tag.
    - Playwright runs real headless Chromium, rendering JS fully.
    - Also handles Cloudflare-style anti-bot protection transparently.
    """

    LOGIN_URL = "https://ipindiaonline.gov.in/trademarkefiling/user/frmLoginNew.aspx"
    DASHBOARD_URLS = [
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmMyApplication.aspx",
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmAgentApplications.aspx",
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmDashboard.aspx",
    ]
    DETAIL_URLS = [
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmViewApplicationDetails.aspx?id={num}",
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmTMDetails.aspx?appno={num}",
    ]

    def __init__(self) -> None:
        self._sessions:  Dict[str, _AgentPWSession] = {}
        self._pages:     Dict[str, Any] = {}   # Playwright Page objects
        self._browsers:  Dict[str, Any] = {}
        self._pws:       Dict[str, Any] = {}   # sync_playwright() instances

    def _gc(self) -> None:
        cutoff = time.time() - SESSION_TTL
        with _GC_LOCK:
            for sid in [k for k, v in self._sessions.items() if v.created_at < cutoff]:
                self._close_pw(sid)
                self._sessions.pop(sid, None)

    def _close_pw(self, sid: str) -> None:
        for store, action in [(self._pages, "close"), (self._browsers, "close"), (self._pws, "stop")]:
            obj = store.pop(sid, None)
            if obj:
                try:
                    getattr(obj, action)()
                except Exception:
                    pass

    def _get_page(self, sid: str):
        page = self._pages.get(sid)
        if not page:
            raise ValueError("Browser session not found. Please reload the captcha and try again.")
        return page

    # ── A: Open login page, return captcha screenshot ────────────────────────

    def open(self) -> Dict[str, str]:
        """
        Launch headless Chromium, open IP India eFiling login page,
        screenshot the CAPTCHA area, return as PNG data-URL.
        """
        self._gc()
        sid = str(uuid.uuid4())

        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise RuntimeError(
                "Playwright not installed. "
                "Run: pip install playwright && playwright install chromium"
            )

        try:
            pw = sync_playwright().start()
            browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox", "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage", "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                    "--window-size=1280,800",
                ],
            )
            ctx = browser.new_context(
                user_agent=UA,
                locale="en-IN",
                viewport={"width": 1280, "height": 800},
                extra_http_headers={"Accept-Language": "en-IN,en;q=0.9"},
            )
            # Hide webdriver flag
            ctx.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
            )
            page = ctx.new_page()

            logger.info("Opening IP India eFiling login page …")
            page.goto(self.LOGIN_URL, wait_until="networkidle", timeout=60000)
            time.sleep(2)  # let JS finish rendering captcha

            captcha_bytes = self._screenshot_captcha(page)
            if captcha_bytes is None:
                # Fallback: whole-page screenshot
                captcha_bytes = page.screenshot()

            self._pws[sid]      = pw
            self._browsers[sid] = browser
            self._pages[sid]    = page
            self._sessions[sid] = _AgentPWSession(
                session_id=sid, created_at=time.time()
            )

            return {
                "session_id":    sid,
                "captcha_image": f"data:image/png;base64,"
                                 f"{base64.b64encode(captcha_bytes).decode()}",
            }

        except Exception as exc:
            logger.exception("AgentEfilingPortal.open() failed")
            self._close_pw(sid)
            raise RuntimeError(f"Agent eFiling: could not open login page — {exc}")

    def _screenshot_captcha(self, page) -> Optional[bytes]:
        """Try multiple selectors to screenshot just the captcha image."""
        selectors = [
            "img#imgCaptcha",
            "img[src*='captcha' i]",
            "img[id*='aptcha' i]",
            "#captchaImageDiv img",
            ".captcha img",
            "img[alt*='captcha' i]",
        ]
        for sel in selectors:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible():
                    logger.info("Found captcha via selector: %s", sel)
                    return el.screenshot()
            except Exception:
                continue

        # Try fetching captcha via its src URL within the browser context
        for sel in selectors:
            try:
                el = page.query_selector(sel)
                if el:
                    src = el.get_attribute("src") or ""
                    if src:
                        if not src.startswith("http"):
                            src = f"https://ipindiaonline.gov.in/{src.lstrip('/')}"
                        resp = page.request.get(src)
                        if resp.ok:
                            return resp.body()
            except Exception:
                continue

        logger.warning("Captcha element not found — using full page screenshot as fallback")
        return None

    # ── B: Submit login, scrape all pages, fetch full details ────────────────

    def login_and_list(
        self,
        session_id: str,
        user_id: str,
        password: str,
        captcha: str,
    ) -> Dict[str, Any]:
        """
        1. Fill credentials + captcha in Playwright page
        2. Click Login
        3. Auto-navigate ALL paginated pages of My Applications
        4. For each TM number, fetch full detail from IP India portal
        5. Return complete results
        """
        s    = self._sessions.get(session_id)
        page = self._pages.get(session_id)
        if not s or not page:
            raise ValueError("Session not found or expired. Please reload the captcha.")

        s.user_id = user_id.strip()

        try:
            # ── Fill and submit login form ──────────────────────────────────
            logger.info("Filling login form for user: %s", user_id)
            self._fill_field(page, [
                "#txtUserID", "input[name='txtUserID']",
                "input[id*='UserID' i]", "input[type='text']:first-of-type",
            ], user_id.strip())

            self._fill_field(page, [
                "#txtPassword", "input[name='txtPassword']",
                "input[type='password']", "input[id*='Password' i]",
            ], password)

            self._fill_field(page, [
                "#txtCaptcha", "input[name='txtCaptcha']",
                "input[id*='aptcha' i]", "input[placeholder*='captcha' i]",
            ], captcha.strip())

            # Click login button
            clicked = False
            for sel in ["#btnLogin", "input[name='btnLogin']", "input[type='submit']",
                         "button[type='submit']", "input[value*='Login' i]",
                         "button:has-text('Login')"]:
                try:
                    el = page.query_selector(sel)
                    if el and el.is_visible():
                        el.click()
                        clicked = True
                        break
                except Exception:
                    continue
            if not clicked:
                page.keyboard.press("Enter")

            # Wait for navigation
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except Exception:
                pass
            time.sleep(2.5)

            current_url = page.url
            logger.info("Post-login URL: %s", current_url)

            # Check login failure
            if "frmLoginNew" in current_url or "login" in current_url.lower():
                pg_text = page.inner_text("body").lower()
                if any(kw in pg_text for kw in ["invalid", "wrong", "incorrect", "captcha error", "authentication failed"]):
                    raise RuntimeError(
                        "Login failed — invalid user ID, password, or captcha. "
                        "Please try again with correct credentials."
                    )

            # ── Scrape all application numbers ──────────────────────────────
            all_nums = self._scrape_all_pages(page)

            # Probe known dashboard URLs if still empty
            if not all_nums:
                for url in self.DASHBOARD_URLS:
                    try:
                        page.goto(url, wait_until="networkidle", timeout=25000)
                        time.sleep(1.5)
                        found = _scrape_application_numbers(page.content())
                        if found:
                            all_nums = found
                            # Continue scraping pages from here
                            extra = self._scrape_all_pages(page, skip_first=True)
                            all_nums = list(dict.fromkeys(all_nums + extra))
                            break
                    except Exception as e:
                        logger.debug("Dashboard probe %s -> %s", url, e)

            if not all_nums:
                raise RuntimeError(
                    "Logged in successfully, but no TM applications found on your dashboard. "
                    "Your portfolio may be empty or the page structure has changed."
                )

            logger.info("Found %d application numbers for agent %s", len(all_nums), user_id)

            # ── Fetch full details for each number ──────────────────────────
            full_details = self._fetch_all_details(page, all_nums)

            return {
                "application_numbers": all_nums,
                "full_details":        full_details,
                "user_id":             s.user_id,
                "total_found":         len(all_nums),
            }

        except RuntimeError:
            raise
        except Exception as exc:
            logger.exception("login_and_list failed")
            raise RuntimeError(f"Agent eFiling error: {exc}")
        finally:
            self._close_pw(session_id)
            self._sessions.pop(session_id, None)

    def _fill_field(self, page, selectors: List[str], value: str) -> bool:
        for sel in selectors:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible():
                    el.triple_click()
                    el.fill(value)
                    return True
            except Exception:
                continue
        return False


    # ── ASP.NET GridView pagination ─────────────────────────────────────────

    def _scrape_all_pages(self, page, skip_first: bool = False) -> List[str]:
        """
        Paginate through an ASP.NET WebForms GridView and collect all
        TM application numbers.

        ASP.NET GridView pagination works via __doPostBack, not normal
        href navigation.  Each "page" link looks like:
          <a href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$GridView1','Page$3')">3</a>
        Clicking it submits a hidden form with __EVENTTARGET set to the
        GridView's control ID and __EVENTARGUMENT set to "Page$N".

        Strategy:
          1. Parse the current page HTML with BeautifulSoup to find the
             GridView's pager row and extract all page-link arguments.
          2. For each page, POST the __doPostBack payload directly via
             Playwright's evaluate() so we don't depend on link text.
          3. After each POST wait for networkidle, then parse again.
          4. Stop when we've visited every page number in the pager.
        """
        all_nums: List[str] = []
        seen:     set       = set()
        visited_args:  set  = set()   # "Page$N" args we've already submitted

        # We iterate up to 200 pages as a hard safety cap
        for iteration in range(200):
            html = page.content()

            # ── Parse rows from the GridView on the current page ────────────
            new_nums, grid_id, page_args = _parse_gridview_page(html)
            for n in new_nums:
                if n not in seen:
                    seen.add(n)
                    all_nums.append(n)

            logger.info(
                "GridView page %d: +%d rows (total %d), pager args=%s",
                iteration + 1, len(new_nums), len(all_nums), page_args,
            )

            # ── Find an unvisited page to go to next ─────────────────────
            next_arg = None
            for arg in page_args:
                if arg not in visited_args:
                    next_arg = arg
                    break

            if not next_arg:
                logger.info("No more GridView pages — done after %d iterations.", iteration + 1)
                break

            visited_args.add(next_arg)

            # ── Trigger ASP.NET postback for the next page ────────────────
            if grid_id:
                ok = self._aspnet_postback(page, grid_id, next_arg)
            else:
                # Fallback: click the rendered link text in the pager row
                ok = self._click_pager_link(page, next_arg)

            if not ok:
                logger.warning("Could not navigate to GridView page arg=%s — stopping.", next_arg)
                break

            try:
                page.wait_for_load_state("networkidle", timeout=20000)
            except Exception:
                pass
            time.sleep(0.8)

        return all_nums

    def _aspnet_postback(self, page, event_target: str, event_argument: str) -> bool:
        """
        Trigger an ASP.NET __doPostBack by injecting a JS call.
        This is more reliable than clicking rendered link text because:
        - The pager may render as "..." ellipsis for distant pages.
        - Link text varies by GridView AllowCustomPaging config.
        - __doPostBack is always present on WebForms pages.
        """
        try:
            page.evaluate(
                f"__doPostBack({event_target!r}, {event_argument!r})"
            )
            return True
        except Exception as e:
            logger.debug("__doPostBack inject failed: %s", e)
            return False

    def _click_pager_link(self, page, event_argument: str) -> bool:
        """
        Fallback: find and click the pager <a> whose href contains
        the target event_argument string.
        """
        # event_argument is like "Page$3"; the link text is usually "3"
        page_num = event_argument.split("$")[-1]
        for sel in [
            f"a:has-text('{page_num}')",
            f"a[href*='Page${page_num}']",
            f"a[href*='{event_argument}']",
            "a:has-text('Next')",
            "a:has-text('>')",
            "a:has-text('\u00bb')",
        ]:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible() and el.is_enabled():
                    el.click()
                    return True
            except Exception:
                continue
        return False

    def _fetch_all_details(self, page, app_numbers: List[str]) -> List[Dict[str, Any]]:
        """Fetch full trademark details for each application number."""
        results = []
        total = len(app_numbers)
        for idx, num in enumerate(app_numbers, 1):
            logger.info("Fetching details %d/%d: %s", idx, total, num)
            try:
                detail = self._fetch_one_detail(page, num)
                results.append(detail)
            except Exception as e:
                logger.warning("Detail fetch failed for %s: %s", num, e)
                results.append({"application_number": num, "error": str(e)})
            time.sleep(0.4)
        return results

    def _fetch_one_detail(self, page, app_number: str) -> Dict[str, Any]:
        """Fetch detail for a single trademark from IP India portal."""
        # Try the authenticated detail pages first
        for pattern in self.DETAIL_URLS:
            url = pattern.format(num=app_number)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                time.sleep(0.8)
                html = page.content()
                if len(html) < 300:
                    continue
                parsed = _parse_detail_page(html, app_number)
                if parsed.get("word_mark") or parsed.get("tm_status"):
                    parsed["source"]     = "agent_efiling_portal"
                    parsed["detail_url"] = url
                    return parsed
            except Exception as e:
                logger.debug("Detail URL %s: %s", url, e)

        # Fallback: public TMR search
        try:
            detail = _public_tmr_search(app_number)
            if detail:
                detail["source"] = "tmr_public_search"
                return detail
        except Exception as e:
            logger.debug("TMR public search fallback for %s: %s", app_number, e)

        return {"application_number": app_number, "source": "agent_efiling"}




# ════════════════════════════════════════════════════════════════════════════
# ASP.NET GridView page parser
# ════════════════════════════════════════════════════════════════════════════

# Matches: __doPostBack('ctl00$...$GridView1','Page$3')
_DOPOSTBACK_RE  = re.compile(
    r"""__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)"""
)
# Matches IP India 6-10 digit application numbers
_APP_NUM_RE     = re.compile(r"\b(\d{6,10})\b")


def _parse_gridview_page(html: str):
    """
    Parse one page of an ASP.NET GridView and return:
      (app_numbers, grid_control_id, pager_page_args)

    app_numbers     – list of TM application numbers found in data rows
    grid_control_id – the full ASP.NET control ID, e.g.
                      "ctl00$ContentPlaceHolder1$GridView1"
                      (used as __EVENTTARGET in postbacks)
    pager_page_args – ordered list of "Page$N" strings from the pager row,
                      preserving document order so we always step forward

    How ASP.NET GridView renders:
      <table id="ctl00_ContentPlaceHolder1_GridView1">
        <tr>  ← header row (th cells)
        <tr>  ← data row 1 (td cells)
        ...
        <tr>  ← data row N
        <tr>  ← pager row: contains <td colspan=N><table><tr><td>1</td><td><a ...>2</a></td>...
      </table>

    The pager row <a> tags have href="javascript:__doPostBack('...','Page$N')".
    The currently active page is a plain <span> or <td> with no link.
    """
    soup = BeautifulSoup(html, "html.parser")
    app_numbers:    List[str] = []
    grid_control_id: str      = ""
    pager_page_args: List[str] = []

    # ── Find the GridView table ───────────────────────────────────────────
    # IP India uses id="ctl00_ContentPlaceHolder1_GridView1" (underscores in HTML)
    grid_table = None
    for tbl in soup.find_all("table"):
        tbl_id = (tbl.get("id") or "").lower()
        if "gridview" in tbl_id or "gvapplication" in tbl_id or "gvtm" in tbl_id:
            grid_table = tbl
            # Convert HTML id underscores back to $ for postback
            grid_control_id = (tbl.get("id") or "").replace("_", "$", 3)
            break

    # Fallback: find any table that has application-number-like column headers
    if not grid_table:
        for tbl in soup.find_all("table"):
            headers = [th.get_text(" ", strip=True).lower() for th in tbl.find_all("th")]
            if any("application" in h or "app no" in h or "tm no" in h for h in headers):
                grid_table = tbl
                break

    if not grid_table:
        # Last resort: scan all tables for 6-10 digit patterns in rows
        return _fallback_number_scan(html), grid_control_id, []

    rows = grid_table.find_all("tr")
    if not rows:
        return [], grid_control_id, []

    # ── Identify header and pager rows ───────────────────────────────────
    # Header row: first row with <th> elements
    # Pager row:  last row that contains __doPostBack links
    header_row = None
    pager_row  = None
    data_rows  = []

    for row in rows:
        row_html = str(row)
        if "__doPostBack" in row_html and ("Page$" in row_html or "page$" in row_html):
            pager_row = row
        elif row.find("th"):
            header_row = row
        else:
            cells = row.find_all("td")
            if cells:
                data_rows.append(row)

    # ── Parse pager row to get page args ─────────────────────────────────
    if pager_row:
        for a in pager_row.find_all("a", href=True):
            href = a["href"]
            m = _DOPOSTBACK_RE.search(href)
            if m:
                arg = m.group(2)           # e.g. "Page$3"
                if arg.startswith("Page$") and arg not in pager_page_args:
                    pager_page_args.append(arg)
                    if not grid_control_id:
                        grid_control_id = m.group(1)  # e.g. "ctl00$...$GridView1"

    # ── Determine which column holds the application number ───────────────
    app_col_idx: Optional[int] = None
    if header_row:
        headers = [_clean(th.get_text()) for th in header_row.find_all(["th", "td"])]
        for i, h in enumerate(headers):
            hl = h.lower()
            if any(kw in hl for kw in ["application no", "app no", "tm no",
                                         "application number", "tm number"]):
                app_col_idx = i
                break

    # ── Extract application numbers from data rows ────────────────────────
    seen_in_page: set = set()
    for row in data_rows:
        # Skip sub-header rows (all cells are th or bold)
        if row.find("th") and not row.find("td"):
            continue

        cells = row.find_all("td")
        if not cells:
            continue

        candidates: List[str] = []

        if app_col_idx is not None and app_col_idx < len(cells):
            # Prefer the known application-number column
            cell_text = _clean(cells[app_col_idx].get_text())
            candidates = _APP_NUM_RE.findall(cell_text)
        else:
            # Scan every cell for 6-10 digit numbers
            for cell in cells:
                text = _clean(cell.get_text())
                candidates.extend(_APP_NUM_RE.findall(text))

        for num in candidates:
            if num not in seen_in_page:
                seen_in_page.add(num)
                app_numbers.append(num)

    logger.debug(
        "_parse_gridview_page: %d app numbers, grid_id=%r, pager_args=%s",
        len(app_numbers), grid_control_id, pager_page_args,
    )
    return app_numbers, grid_control_id, pager_page_args


def _fallback_number_scan(html: str) -> List[str]:
    """
    Last-resort scan: look for 6-10 digit numbers anywhere in the page
    that appear inside table cells.  Deduplicates and returns in order.
    """
    soup = BeautifulSoup(html, "html.parser")
    seen, out = set(), []
    for td in soup.find_all(["td", "a"]):
        for m in _APP_NUM_RE.findall(_clean(td.get_text())):
            if m not in seen:
                seen.add(m)
                out.append(m)
    return out


# ════════════════════════════════════════════════════════════════════════════
# IP India detail page parser (works for both agent portal and public search)
# ════════════════════════════════════════════════════════════════════════════

def _parse_detail_page(html: str, app_number: str) -> Dict[str, Any]:
    """
    Parse an IP India trademark detail page and extract all available fields.
    Handles both table-row layouts and label/value element pairs.
    """
    soup = BeautifulSoup(html, "html.parser")
    result: Dict[str, Any] = {"application_number": app_number}

    # Build a flat key→value map from all table rows
    kv: Dict[str, str] = {}
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) >= 2:
            k = _clean(cells[0].get_text()).lower().strip(": ")
            v = _clean(cells[1].get_text())
            if k and v:
                kv[k] = v

    # Also scan label/span pairs
    for lbl in soup.find_all(["label", "strong", "b", "th"]):
        txt = _clean(lbl.get_text())
        if txt and len(txt) < 80:
            sib = lbl.find_next_sibling()
            if sib:
                v = _clean(sib.get_text())
                if v and len(v) < 500:
                    kv[txt.lower().strip(": ")] = v

    def g(*keys: str) -> str:
        for k in keys:
            if k in kv:
                return kv[k]
            for kk, vv in kv.items():
                if k in kk:
                    return vv
        return ""

    result["application_number"]  = g("application number", "app no", "application no") or app_number
    result["word_mark"]           = g("trade mark", "trademark", "mark", "word mark", "brand name")
    result["tm_status"]           = _normalise_status(g("status", "tm status", "current status", "application status"))
    result["class_number"]        = g("class", "class no", "class number", "nice class")
    result["filing_date"]         = g("filing date", "date of application", "application date")
    result["registration_date"]   = g("registration date", "date of registration")
    result["valid_upto"]          = g("valid upto", "valid up to", "expiry date", "renewal date", "date of expiry")
    result["proprietor"]          = g("proprietor", "applicant name", "applicant", "owner")
    result["goods_and_services"]  = g("goods and services", "goods/services", "description", "specification")
    result["address"]             = g("address", "applicant address", "correspondence address")
    result["attorney"]            = g("agent", "attorney", "authorised agent", "trade mark agent")
    result["attorney_code"]       = g("agent code", "attorney code", "agent no")

    # Trademark image
    for img in soup.find_all("img"):
        src = img.get("src", "")
        alt = (img.get("alt", "") or "").lower()
        if "trademark" in alt or "mark" in alt or "logo" in alt or "TM" in src:
            if src and not src.endswith((".ico", ".gif")):
                if not src.startswith("http"):
                    src = f"https://ipindiaonline.gov.in/{src.lstrip('/')}"
                result["trademark_image_url"] = src
                break

    # Document links
    docs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if any(ext in href.lower() for ext in [".pdf", ".doc", "download", "document"]):
            if not href.startswith("http"):
                href = f"https://ipindiaonline.gov.in/{href.lstrip('/')}"
            docs.append({"name": _clean(a.get_text()) or "Document", "url": href})
    if docs:
        result["documents"] = docs

    return result


def _public_tmr_search(app_number: str) -> Optional[Dict[str, Any]]:
    """Fallback: use IP India public TMR search to get trademark details."""
    TMR_MAIN   = "https://tmrsearch.ipindia.gov.in/tmrpublicsearch/frmmain.aspx"
    TMR_SEARCH = "https://tmrsearch.ipindia.gov.in/tmrpublicsearch/tmsearch.aspx"
    sess = _new_requests_session()
    try:
        r = sess.get(TMR_MAIN, timeout=20)
        r.raise_for_status()
        hidden = _extract_hidden_fields(r.text)
        payload = {
            **hidden,
            "__EVENTTARGET": "", "__EVENTARGUMENT": "",
            "ctl00$ContentPlaceHolder1$RadioButton1":     "rdApplicationNumber",
            "ctl00$ContentPlaceHolder1$txtApplicationNo": app_number,
            "ctl00$ContentPlaceHolder1$btnSearch":        "Search",
        }
        r2 = sess.post(TMR_SEARCH, data=payload, timeout=30, headers={"Referer": TMR_MAIN})
        r2.raise_for_status()
        result = _parse_detail_page(r2.text, app_number)
        return result if (result.get("word_mark") or result.get("tm_status")) else None
    except Exception as e:
        logger.debug("Public TMR search for %s: %s", app_number, e)
        return None


# ── Singleton instances ──────────────────────────────────────────────────────
estatus_portal       = EstatusPortal()
agent_efiling_portal = AgentEfilingPortal()
