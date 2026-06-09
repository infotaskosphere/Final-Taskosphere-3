"""
QuickCompany.in trademark search scraper.
Scrapes the public results listing page at https://www.quickcompany.in/trademarks?q=<name>
and returns a structured list of trademark records.
"""
from __future__ import annotations

import re
import logging
from typing import List, Dict, Optional
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://www.quickcompany.in"
SEARCH_URL = f"{BASE_URL}/trademarks"

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

STATUS_KEYWORDS = {
    "registered": "Registered",
    "abandoned": "Abandoned",
    "objected": "Objected",
    "opposed": "Opposed",
    "refused": "Refused",
    "withdrawn": "Withdrawn",
    "accepted": "Accepted",
    "advertised": "Advertised",
    "pending": "Pending",
    "removed": "Removed",
    "examination": "Under Examination",
    "send to vienna codification": "Vienna Codification",
}


def _normalise_status(text: str) -> str:
    t = text.lower().strip()
    for k, v in STATUS_KEYWORDS.items():
        if k in t:
            return v
    return text.strip().title() or "Unknown"


def _parse_card(card) -> Optional[Dict]:
    """Parse a single trademark card from the search results listing."""
    try:
        # Anchor with name + detail URL
        a = card.find("a", href=re.compile(r"^/trademarks/"))
        if not a:
            return None
        detail_path = a.get("href", "")
        name = a.get_text(strip=True)

        # Light-button buttons hold date and ID
        light_btns = card.find_all("button", class_=re.compile(r"btn-light"))
        filing_date = None
        application_id = None
        for b in light_btns:
            txt = b.get_text(strip=True)
            m = re.match(r"^ID:\s*(\d+)$", txt)
            if m:
                application_id = m.group(1)
            elif re.match(r"^\d{1,2} [A-Za-z]{3} \d{4}$", txt):
                filing_date = txt

        # Applicant: muted span next to the heading
        applicant_span = card.find("span", class_=re.compile(r"text-muted"))
        applicant = applicant_span.get_text(strip=True) if applicant_span else None

        # Status (btn-danger / btn-success / btn-warning ... badges)
        status = "Unknown"
        for cls in ("btn-danger", "btn-success", "btn-warning", "btn-primary",
                    "btn-info", "btn-secondary", "btn-dark"):
            b = card.find("button", class_=re.compile(cls))
            if b:
                status = _normalise_status(b.get_text(strip=True))
                break

        # Class number from outline buttons
        tm_class = None
        mark_type = None
        for b in card.find_all("button", class_=re.compile(r"btn-outline-dark")):
            txt = b.get_text(strip=True)
            m = re.match(r"Class:\s*(\d+)", txt, re.I)
            if m:
                tm_class = int(m.group(1))
            elif txt:
                mark_type = txt

        # Goods/services description (long lh-tight div)
        description = None
        desc_div = card.find("div", string=re.compile(r"\[Class\s*:", re.I))
        if not desc_div:
            for d in card.find_all("div", class_=re.compile(r"text-break|lh-tight")):
                t = d.get_text(" ", strip=True)
                if t.startswith("[Class"):
                    description = t
                    break
        else:
            description = desc_div.get_text(" ", strip=True)

        if application_id is None and not name:
            return None

        return {
            "application_id": application_id,
            "name": name,
            "applicant": applicant,
            "status": status,
            "class": tm_class,
            "mark_type": mark_type,
            "filing_date": filing_date,
            "description": description,
            "detail_url": f"{BASE_URL}{detail_path}" if detail_path else None,
        }
    except Exception as e:
        logger.warning("Failed to parse card: %s", e)
        return None


def _parse_total(soup: BeautifulSoup) -> Optional[int]:
    """Extract total result count if present on the page."""
    text = soup.get_text(" ", strip=True)
    m = re.search(r"([\d,]{1,12})\s+(?:applications?|trademarks?|results?)\s+found", text, re.I)
    if m:
        return int(m.group(1).replace(",", ""))
    m = re.search(r"Search\s+all\s+([\d,]{1,12})", text, re.I)
    if m:
        return int(m.group(1).replace(",", ""))
    return None


async def search_trademarks(query: str, limit: int = 40, timeout: float = 20.0) -> Dict:
    """
    Scrape the QuickCompany trademark search listing page.

    Returns:
        {
            "query": str,
            "total_estimated": int | None,
            "results": List[Dict],
            "source": "quickcompany.in"
        }
    """
    if not query or not query.strip():
        return {"query": query, "total_estimated": 0, "results": [], "source": "quickcompany.in"}

    params = {"q": query.strip()}
    headers = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"}

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(SEARCH_URL, params=params, headers=headers)
        resp.raise_for_status()
        html = resp.text

    soup = BeautifulSoup(html, "lxml")

    # Each trademark result is rendered as a <turbo-frame id="trademark_<id>"> block
    frames = soup.find_all("turbo-frame", id=re.compile(r"^trademark_"))
    results: List[Dict] = []
    for f in frames:
        parsed = _parse_card(f)
        if parsed:
            results.append(parsed)
        if len(results) >= limit:
            break

    # Fallback: parse list-group-items if turbo-frame structure changes
    if not results:
        for item in soup.find_all("div", class_=re.compile(r"list-group-item")):
            parsed = _parse_card(item)
            if parsed:
                results.append(parsed)
            if len(results) >= limit:
                break

    return {
        "query": query.strip(),
        "total_estimated": _parse_total(soup),
        "results": results,
        "source": "quickcompany.in",
    }
