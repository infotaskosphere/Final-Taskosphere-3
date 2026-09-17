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
             Used: for attorney portfolio bulk import.

All FastAPI routes are preserved. Frontend contract bugs fixed:
  - /list  → returns { items, total } + tm_status / class_number / renewal_alert filters
  - /deadlines → returns { upcoming: [...], overdue: [...] }
  - /stats → returns all 6 fields the frontend metric cards need
  - _compute_deadlines() → stores renewal_status + days_until_renewal + renewal_date
"""

import os, re, uuid, time, logging, asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta
from typing import Optional, List, Any, Dict, Tuple
from urllib.parse import quote, urljoin
from zoneinfo import ZoneInfo

import requests as _requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Response, Body
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User
from backend.pdf_renderer import build_combined_report_pdf

# ── QC availability report modules ────────────────────────────────────────────
from backend.scraper import search_trademarks as _qc_availability_search
from backend.report_engine import build_report
from backend.class_finder import find_classes
from backend.qc_pdf_renderer import build_report_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="", tags=["trademark-sphere"])


def _pdf_filename(brand_name: str, class_filters: Optional[List[int]] = None) -> str:
    """
    Build a safe, brand-name-based PDF filename, e.g. 'Trademark_Krimira_CL16_CL21_CL28.pdf'.

    - Always named after the searched brand (never the internal report/UUID),
      so the file the user gets after "Download PDF" / Ctrl+S matches what
      they searched for.
    - Appends the searched class(es) when known, so multi-class runs and
      per-class reports for the same brand don't overwrite each other.
    - Strips characters that are unsafe in filenames / HTTP headers.
    """
    base = (brand_name or "trademark").strip()
    base = re.sub(r"[^\w\-]+", "_", base, flags=re.UNICODE).strip("_") or "trademark"
    suffix = ""
    if class_filters:
        classes = sorted({int(c) for c in class_filters})
        suffix = "_" + "_".join(f"CL{c}" for c in classes)
    return f"Trademark_{base}{suffix}.pdf"


def _content_disposition(filename: str) -> str:
    """
    RFC 5987-safe Content-Disposition header value: ASCII fallback for
    old clients + UTF-8 filename* for everything else (non-Latin brand names).
    """
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii") or "trademark.pdf"
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{quote(filename)}'
IST   = ZoneInfo("Asia/Kolkata")
_pool = ThreadPoolExecutor(max_workers=6)

# ── Site roots ────────────────────────────────────────────────────────────────
QC_BASE    = "https://www.quickcompany.in"
QC_SEARCH  = f"{QC_BASE}/trademarks"           # ?q=...
