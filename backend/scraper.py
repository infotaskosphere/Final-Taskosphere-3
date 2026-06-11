"""
QuickCompany.in trademark search scraper — v2 (full pagination).

Scrapes ALL pages from https://www.quickcompany.in/trademarks?q=<name>&page=N
until no more results are returned, giving parity with what the website shows.

Key changes vs v1:
  - Paginated fetching: iterates page=1, 2, 3 ... until an empty page is returned
    or MAX_PAGES is reached.  QC shows ~10 results per page so we now collect
    the full public listing (same as browsing the site manually).
  - Deduplication on application_id so merged pages never double-count.
  - Image fetching cap raised proportionally; still parallelised with semaphore.
  - Consistent return schema (backwards-compatible with report_engine.build_report).
"""
from __future__ import annotations

import re
import asyncio
import base64
import logging
from typing import List, Dict, Optional, Set

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL   = "https://www.quickcompany.in"
SEARCH_URL = f"{BASE_URL}/trademarks"

# How many pages to fetch at most.  QC free tier shows ≤ ~10 results/page;
# 15 pages ≈ 150 results which matches the full public listing.
MAX_PAGES = 15
# Stop early if a page yields fewer than this many results (last/thin page)
MIN_RESULTS_PER_PAGE = 1

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent":      UA,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer":         BASE_URL + "/",
}

STATUS_KEYWORDS = {
    "registered":                    "Registered",
    "abandoned":                     "Abandoned",
    "objected":                      "Objected",
    "opposed":                       "Opposed",
    "refused":                       "Refused",
    "withdrawn":                     "Withdrawn",
    "accepted":                      "Accepted",
    "advertised":                    "Advertised",
    "pending":                       "Pending",
    "removed":                       "Removed",
    "examination":                   "Under Examination",
    "formalities chk pass":          "Formalities Chk Pass",
    "send to vienna codification":   "Vienna Codification",
    "new application":               "Pending",
    "send back to fo for correction":"Pending",
}


def _normalise_status(text: str) -> str:
    t = text.lower().strip()
    for k, v in STATUS_KEYWORDS.items():
        if k in t:
            return v
    return text.strip().title() or "Unknown"


def _parse_card(card) -> Optional[Dict]:
    """Parse a single trademark card / turbo-frame from the search results listing."""
    try:
        a = card.find("a", href=re.compile(r"^/trademarks/"))
        if not a:
            return None
        detail_path = a.get("href", "")
        name = a.get_text(strip=True)

        light_btns = card.find_all("button", class_=re.compile(r"btn-light"))
        filing_date    = None
        application_id = None
        for b in light_btns:
            txt = b.get_text(strip=True)
            m = re.match(r"^ID:\s*(\d+)$", txt)
            if m:
                application_id = m.group(1)
            elif re.match(r"^\d{1,2} [A-Za-z]{3} \d{4}$", txt):
                filing_date = txt

        applicant_span = card.find("span", class_=re.compile(r"text-muted"))
        applicant = applicant_span.get_text(strip=True) if applicant_span else None

        status = "Unknown"
        for cls in ("btn-danger", "btn-success", "btn-warning", "btn-primary",
                    "btn-info", "btn-secondary", "btn-dark"):
            b = card.find("button", class_=re.compile(cls))
            if b:
                status = _normalise_status(b.get_text(strip=True))
                break

        tm_class  = None
        mark_type = None
        for b in card.find_all("button", class_=re.compile(r"btn-outline-dark")):
            txt = b.get_text(strip=True)
            m = re.match(r"Class:\s*(\d+)", txt, re.I)
            if m:
                tm_class = int(m.group(1))
            elif txt:
                mark_type = txt

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

        mark_image_url = None
        img_tag = card.find("img")
        if img_tag:
            src = img_tag.get("src") or img_tag.get("data-src") or ""
            if src and not src.startswith("data:"):
                if src.startswith("/"):
                    src = f"{BASE_URL}{src}"
                mark_image_url = src

        return {
            "application_id":  application_id,
            "name":            name,
            "applicant":       applicant,
            "status":          status,
            "class":           tm_class,
            "mark_type":       mark_type,
            "filing_date":     filing_date,
            "description":     description,
            "detail_url":      f"{BASE_URL}{detail_path}" if detail_path else None,
            "mark_image_url":  mark_image_url,
        }
    except Exception as e:
        logger.warning("Failed to parse card: %s", e)
        return None


def _parse_cards_from_soup(soup: BeautifulSoup) -> List[Dict]:
    """Extract all trademark cards from a parsed page."""
    results: List[Dict] = []

    # Primary: turbo-frame elements
    frames = soup.find_all("turbo-frame", id=re.compile(r"^trademark_"))
    for f in frames:
        parsed = _parse_card(f)
        if parsed:
            results.append(parsed)

    # Fallback: list-group-item divs
    if not results:
        for item in soup.find_all("div", class_=re.compile(r"list-group-item")):
            parsed = _parse_card(item)
            if parsed:
                results.append(parsed)

    return results


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


async def _fetch_image_as_data_url(url: str, client: httpx.AsyncClient) -> Optional[str]:
    """Fetch a remote image and return it as a base64 data URL."""
    if not url:
        return None
    try:
        resp = await client.get(url, timeout=8.0, follow_redirects=True)
        if resp.status_code == 200:
            ct = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            if not ct.startswith("image/"):
                ct = "image/jpeg"
            b64 = base64.b64encode(resp.content).decode()
            return f"data:{ct};base64,{b64}"
    except Exception as e:
        logger.debug("Failed to fetch mark image %s: %s", url, e)
    return None


async def _fetch_page(
    client: httpx.AsyncClient,
    query: str,
    page: int,
    timeout: float,
) -> tuple[List[Dict], Optional[int]]:
    """Fetch a single search-result page. Returns (results, total_on_page_1)."""
    params = {"q": query.strip(), "page": page}
    try:
        resp = await client.get(SEARCH_URL, params=params, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("QC fetch error page=%d query=%r: %s", page, query, e)
        return [], None

    soup  = BeautifulSoup(resp.text, "lxml")
    cards = _parse_cards_from_soup(soup)
    total = _parse_total(soup) if page == 1 else None
    return cards, total


async def search_trademarks(
    query: str,
    limit: int = 500,        # effectively unlimited — collect all public results
    timeout: float = 30.0,
) -> Dict:
    """
    Scrape ALL pages of QuickCompany trademark search results for *query*.

    Strategy:
      • Fetch page 1, 2, … MAX_PAGES in sequence (QC blocks aggressive concurrency).
      • Stop when a page returns zero results (end of listing reached).
      • Deduplicate by application_id.
      • Fetch mark images for the first IMAGE_FETCH_CAP results (parallel, throttled).

    Returns the same schema as v1 so report_engine.build_report() is unaffected.
    """
    IMAGE_FETCH_CAP = 50   # fetch images for up to this many results

    if not query or not query.strip():
        return {"query": query, "total_estimated": 0, "results": [], "source": "quickcompany.in"}

    all_results:  List[Dict] = []
    seen_ids:     Set[str]   = set()
    total_estimated: Optional[int] = None

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:

        for page_no in range(1, MAX_PAGES + 1):
            cards, page_total = await _fetch_page(client, query, page_no, timeout)

            if page_no == 1 and page_total is not None:
                total_estimated = page_total

            if not cards:
                # Empty page → we've gone past the last page
                logger.debug("QC search %r: no cards on page %d — stopping", query, page_no)
                break

            new_this_page = 0
            for card in cards:
                aid = card.get("application_id") or card.get("name", "")
                if aid in seen_ids:
                    continue
                seen_ids.add(aid)
                all_results.append(card)
                new_this_page += 1

            logger.debug(
                "QC search %r: page %d → %d new results (total so far: %d)",
                query, page_no, new_this_page, len(all_results),
            )

            if len(all_results) >= limit:
                logger.debug("QC search %r: reached limit %d — stopping", query, limit)
                break

            # If this page gave fewer than MIN_RESULTS_PER_PAGE new cards it's
            # probably the last page; stop to avoid pointless empty-page fetches.
            if new_this_page < MIN_RESULTS_PER_PAGE:
                break

            # Polite crawl delay between pages to avoid rate-limiting
            await asyncio.sleep(0.4)

        # ── Fetch mark images as base64 data URLs (parallel, capped) ──────────
        sem = asyncio.Semaphore(5)

        async def _fetch_bounded(r: Dict) -> Dict:
            url = r.get("mark_image_url")
            if not url:
                return r
            async with sem:
                data_url = await _fetch_image_as_data_url(url, client)
            return {**r, "mark_image_data_url": data_url} if data_url else r

        capped = all_results[:IMAGE_FETCH_CAP]
        rest   = all_results[IMAGE_FETCH_CAP:]

        enriched_capped = await asyncio.gather(*[_fetch_bounded(r) for r in capped])
        all_results = list(enriched_capped) + rest

    logger.info(
        "QC search %r: %d total results collected across pages (estimated total: %s)",
        query, len(all_results), total_estimated,
    )

    return {
        "query":           query.strip(),
        "total_estimated": total_estimated or len(all_results),
        "results":         all_results,
        "source":          "quickcompany.in",
    }
