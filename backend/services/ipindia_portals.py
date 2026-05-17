# backend/services/ipindia_portals.py
# ----------------------------------------------------------------------------
# Real scrapers for two IP India portals:
#
#   1) EstatusPortal           https://tmrsearch.ipindia.gov.in/estatus
#      Flow:  email  +  captcha  ->  OTP sent to email  ->  verify OTP
#             -> list of trademark application numbers tied to the
#                logged-in agent / email.
#
#   2) AgentEfilingPortal      https://ipindiaonline.gov.in/trademarkefiling/user/frmLoginNew.aspx
#      Flow:  user_id  +  password  +  captcha  ->  logged in
#             -> scrape "My Applications" page for TM application numbers.
#
# Both portals are classic ASP.NET WebForms — every POST must echo back
# __VIEWSTATE / __VIEWSTATEGENERATOR / __EVENTVALIDATION harvested from the
# previous GET. We keep one requests.Session per logical user-session so the
# ASP.NET_SessionId / .ASPXAUTH cookies survive across calls.
#
# The captcha image is fetched as bytes and base64-encoded so the frontend
# can render it inline (data: URL) and the user types the answer back.
#
# NOTE: IP India occasionally renames input fields. If a flow stops working,
# log `_extract_hidden_fields(...)` output and the response HTML, then adjust
# the constants in the FIELDS dict near each class.
# ----------------------------------------------------------------------------

from __future__ import annotations

import base64
import logging
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("ipindia.portals")

# -- shared --------------------------------------------------------------------

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

SESSION_TTL_SECONDS = 15 * 60   # drop dead sessions after 15 min
_GC_LOCK = threading.Lock()


def _new_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(DEFAULT_HEADERS)
    return s


def _extract_hidden_fields(html: str) -> Dict[str, str]:
    """Pull every <input type=hidden> off an ASP.NET page (VIEWSTATE etc)."""
    soup = BeautifulSoup(html, "html.parser")
    out: Dict[str, str] = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        name = inp.get("name")
        if name:
            out[name] = inp.get("value", "") or ""
    return out


def _img_to_data_url(content: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


# ============================================================================
# 1) Estatus portal — Trademark Register lookup by registered email
# ============================================================================

@dataclass
class _EstatusSession:
    session_id: str
    http: requests.Session
    created_at: float
    hidden: Dict[str, str] = field(default_factory=dict)
    email: str = ""
    otp_sent: bool = False


class EstatusPortal:
    """
    https://tmrsearch.ipindia.gov.in/estatus
    """
    BASE = "https://tmrsearch.ipindia.gov.in/estatus"

    # ⚠ If IP India renames its inputs, adjust these.
    FIELDS = {
        # email step
        "email_input":       "txtEmail",
        "captcha_input":     "txtCaptcha",
        "captcha_img":       "imgCaptcha",       # <img id="imgCaptcha" src="...">
        "send_otp_button":   "btnSendOTP",

        # otp step
        "otp_input":         "txtOTP",
        "verify_button":     "btnVerifyOTP",
    }

    def __init__(self) -> None:
        self._sessions: Dict[str, _EstatusSession] = {}

    # -- session bookkeeping ------------------------------------------------
    def _gc(self) -> None:
        cutoff = time.time() - SESSION_TTL_SECONDS
        with _GC_LOCK:
            dead = [sid for sid, s in self._sessions.items() if s.created_at < cutoff]
            for sid in dead:
                self._sessions.pop(sid, None)

    def _get(self, sid: str) -> _EstatusSession:
        s = self._sessions.get(sid)
        if not s:
            raise ValueError("Session expired. Please reload the captcha and start over.")
        return s

    # -- step A: open page, return captcha ---------------------------------
    def open(self) -> Dict[str, str]:
        self._gc()
        sess = _new_session()
        r = sess.get(self.BASE, timeout=30)
        r.raise_for_status()

        hidden = _extract_hidden_fields(r.text)
        soup = BeautifulSoup(r.text, "html.parser")
        img = soup.find("img", {"id": self.FIELDS["captcha_img"]}) or soup.find("img", src=re.compile(r"[Cc]aptcha"))
        if not img or not img.get("src"):
            raise RuntimeError("Estatus: captcha image not found in page.")

        cap_url = requests.compat.urljoin(self.BASE, img["src"])
        cap = sess.get(cap_url, timeout=30, headers={"Referer": self.BASE})
        cap.raise_for_status()

        sid = str(uuid.uuid4())
        self._sessions[sid] = _EstatusSession(
            session_id=sid, http=sess, created_at=time.time(), hidden=hidden,
        )
        return {
            "session_id":     sid,
            "captcha_image": _img_to_data_url(cap.content, cap.headers.get("Content-Type", "image/jpeg")),
        }

    # -- step B: send OTP --------------------------------------------------
    def send_otp(self, session_id: str, email: str, captcha: str) -> Dict[str, str]:
        s = self._get(session_id)
        s.email = email.strip().lower()

        payload = dict(s.hidden)
        payload[self.FIELDS["email_input"]]   = email.strip()
        payload[self.FIELDS["captcha_input"]] = captcha.strip()
        payload["__EVENTTARGET"] = self.FIELDS["send_otp_button"]
        payload["__EVENTARGUMENT"] = ""

        r = s.http.post(self.BASE, data=payload, timeout=30, headers={"Referer": self.BASE})
        r.raise_for_status()
        # ASP.NET keeps the same page; harvest the new view-state for OTP step
        s.hidden = _extract_hidden_fields(r.text)

        # crude success heuristic — look for OTP textbox now visible OR a success msg
        if (self.FIELDS["otp_input"] not in r.text) and ("OTP" not in r.text.upper()):
            raise RuntimeError("Estatus: OTP request was rejected. Captcha or email may be wrong.")

        s.otp_sent = True
        return {"session_id": session_id, "message": "OTP sent to your email."}

    # -- step C: verify OTP & scrape register ------------------------------
    def verify_otp_and_list(self, session_id: str, otp: str) -> Dict[str, List[str]]:
        s = self._get(session_id)
        if not s.otp_sent:
            raise RuntimeError("Estatus: no OTP requested for this session.")

        payload = dict(s.hidden)
        payload[self.FIELDS["otp_input"]] = otp.strip()
        payload["__EVENTTARGET"] = self.FIELDS["verify_button"]
        payload["__EVENTARGUMENT"] = ""

        r = s.http.post(self.BASE, data=payload, timeout=45, headers={"Referer": self.BASE})
        r.raise_for_status()

        nums = _scrape_application_numbers(r.text)
        if not nums:
            # OTP wrong, or result table empty
            raise RuntimeError("Estatus: no applications found (OTP wrong or register empty).")

        return {"application_numbers": nums, "email": s.email}


# ============================================================================
# 2) Agent eFiling portal — User-ID + Password + Captcha
# ============================================================================

@dataclass
class _AgentSession:
    session_id: str
    http: requests.Session
    created_at: float
    hidden: Dict[str, str] = field(default_factory=dict)
    user_id: str = ""


class AgentEfilingPortal:
    """
    https://ipindiaonline.gov.in/trademarkefiling/user/frmLoginNew.aspx
    """
    LOGIN = "https://ipindiaonline.gov.in/trademarkefiling/user/frmLoginNew.aspx"
    # post-login landing pages we will probe for the TM list
    LIST_CANDIDATES = [
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmMyApplication.aspx",
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmAgentApplications.aspx",
        "https://ipindiaonline.gov.in/trademarkefiling/user/frmDashboard.aspx",
    ]

    FIELDS = {
        "userid":         "txtUserID",
        "password":       "txtPassword",
        "captcha_input":  "txtCaptcha",
        "captcha_img":    "imgCaptcha",
        "login_button":   "btnLogin",
    }

    def __init__(self) -> None:
        self._sessions: Dict[str, _AgentSession] = {}

    def _gc(self) -> None:
        cutoff = time.time() - SESSION_TTL_SECONDS
        with _GC_LOCK:
            dead = [sid for sid, s in self._sessions.items() if s.created_at < cutoff]
            for sid in dead:
                self._sessions.pop(sid, None)

    def _get(self, sid: str) -> _AgentSession:
        s = self._sessions.get(sid)
        if not s:
            raise ValueError("Session expired. Please reload the captcha and start over.")
        return s

    # -- step A: open login page, return captcha ---------------------------
    def open(self) -> Dict[str, str]:
        self._gc()
        sess = _new_session()
        r = sess.get(self.LOGIN, timeout=30)
        r.raise_for_status()

        hidden = _extract_hidden_fields(r.text)
        soup = BeautifulSoup(r.text, "html.parser")
        img = (
            soup.find("img", {"id": self.FIELDS["captcha_img"]})
            or soup.find("img", src=re.compile(r"[Cc]aptcha"))
        )
        if not img or not img.get("src"):
            raise RuntimeError("Agent eFiling: captcha image not found.")
        cap_url = requests.compat.urljoin(self.LOGIN, img["src"])
        cap = sess.get(cap_url, timeout=30, headers={"Referer": self.LOGIN})
        cap.raise_for_status()

        sid = str(uuid.uuid4())
        self._sessions[sid] = _AgentSession(
            session_id=sid, http=sess, created_at=time.time(), hidden=hidden,
        )
        return {
            "session_id":     sid,
            "captcha_image": _img_to_data_url(cap.content, cap.headers.get("Content-Type", "image/jpeg")),
        }

    # -- step B: login + scrape TM numbers ---------------------------------
    def login_and_list(self, session_id: str, user_id: str, password: str, captcha: str) -> Dict[str, List[str]]:
        s = self._get(session_id)
        s.user_id = user_id.strip()

        payload = dict(s.hidden)
        payload[self.FIELDS["userid"]]         = user_id.strip()
        payload[self.FIELDS["password"]]       = password
        payload[self.FIELDS["captcha_input"]]  = captcha.strip()
        payload["__EVENTTARGET"]   = self.FIELDS["login_button"]
        payload["__EVENTARGUMENT"] = ""

        r = s.http.post(self.LOGIN, data=payload, timeout=45, headers={"Referer": self.LOGIN}, allow_redirects=True)
        r.raise_for_status()

        # If still on login page, login failed
        if "frmLoginNew" in r.url and ("Invalid" in r.text or self.FIELDS["password"] in r.text):
            raise RuntimeError("Agent eFiling: login failed (bad user-id, password or captcha).")

        # Probe candidate dashboard pages for TM application numbers
        nums: List[str] = []
        for url in self.LIST_CANDIDATES + [r.url]:
            try:
                page = s.http.get(url, timeout=30, headers={"Referer": self.LOGIN})
                if page.status_code != 200:
                    continue
                found = _scrape_application_numbers(page.text)
                if found:
                    nums = sorted(set(found))
                    break
            except Exception as exc:
                logger.debug("agent list probe %s -> %s", url, exc)

        if not nums:
            raise RuntimeError("Agent eFiling: logged in, but no TM applications visible on the dashboard.")

        return {"application_numbers": nums, "user_id": s.user_id}


# ============================================================================
# helpers
# ============================================================================

# IP India application numbers are 6–10 digit ints, usually 7 digits.
_APP_NUM_RE = re.compile(r"\b(\d{6,10})\b")


def _scrape_application_numbers(html: str) -> List[str]:
    """
    Pull TM application numbers out of any HTML table on the page.
    We look at <td>/<a> text under columns whose header contains
    'application' or 'tm' or 'number'. As a last resort we regex
    every 6–10 digit run from cells inside a results table.
    """
    soup = BeautifulSoup(html, "html.parser")
    nums: List[str] = []

    for tbl in soup.find_all("table"):
        headers = [(th.get_text(" ", strip=True) or "").lower() for th in tbl.find_all("th")]
        target_idx: Optional[int] = None
        for i, h in enumerate(headers):
            if "application" in h or "app no" in h or "tm number" in h or h.strip() == "number":
                target_idx = i
                break

        for row in tbl.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            if target_idx is not None and target_idx < len(cells):
                text = cells[target_idx].get_text(" ", strip=True)
                for m in _APP_NUM_RE.findall(text):
                    nums.append(m)
            else:
                # fallback: scan every cell, but only inside obvious result tables
                if any(_APP_NUM_RE.search(c.get_text(" ", strip=True)) for c in cells):
                    for c in cells:
                        for m in _APP_NUM_RE.findall(c.get_text(" ", strip=True)):
                            nums.append(m)
        if nums:
            break

    # dedupe preserving order
    seen = set()
    out = []
    for n in nums:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


# Singleton instances -------------------------------------------------------
estatus_portal       = EstatusPortal()
agent_efiling_portal = AgentEfilingPortal()
