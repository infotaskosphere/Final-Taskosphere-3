"""
QuickCompany.in trademark search scraper — v3 (class-aware, robust).

Scrapes ALL pages from:
  1. https://www.quickcompany.in/trademarks?q=<name>&page=N  (generic, all classes)
  2. https://www.quickcompany.in/trademarks?q=<name>&class[]=<C>&page=N  (class-specific, if requested)

Strategy:
  - For generic searches: paginate until empty page or MAX_PAGES
  - For class-filtered searches: ALSO fetch class-specific URLs to ensure completeness
  - Deduplicate by application_id across all sources
  - Parallel image fetching with semaphore throttle

Why class-specific fetching matters:
  QC returns ~10 results/page mixed across all classes. A search for "Shoka"
  may show 40 results for CL35, 5 for CL24, and 3 for CL25. The CL24/25 results
  often appear on later pages (5-10) that the generic scrape may not reach if
  earlier pages have many results. Fetching class-specific URLs guarantees we
  catch every filing across every requested class.
"""
from __future__ import annotations

import re
import asyncio
import base64
import logging
from typing import List, Dict, Optional, Set, Tuple
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL   = "https://www.quickcompany.in"
SEARCH_URL = f"{BASE_URL}/trademarks"

# Generic (all-class) pagination limit
MAX_PAGES = 20
# Class-specific pagination limit (fewer results per class, so 10 pages is plenty)
MAX_PAGES_CLASS = 10
# Stop early if a page yields fewer than this many results
MIN_RESULTS_PER_PAGE = 1
# Max images to fetch as base64 (performance cap)
IMAGE_FETCH_CAP = 60
# Delay between page requests to avoid rate-limiting (seconds)
PAGE_DELAY = 0.45
# Delay between class-specific fetches
CLASS_DELAY = 0.6

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent":      UA,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "Referer":         BASE_URL + "/",
    "sec-ch-ua":       '"Chromium";v="124", "Google Chrome";v="124"',
    "sec-ch-ua-mobile":"?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest":  "document",
    "sec-fetch-mode":  "navigate",
    "sec-fetch-site":  "same-origin",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control":   "max-age=0",
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
    "marked for exam":               "Under Examination",
    "examined":                      "Under Examination",
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
            elif re.match(r"^\d{4}-\d{2}-\d{2}$", txt):
                filing_date = txt

        # Fallback: extract application_id from detail URL
        if application_id is None and detail_path:
            m = re.search(r"/trademarks/(\d{4,})", detail_path)
            if m:
                application_id = m.group(1)

        applicant_span = card.find("span", class_=re.compile(r"text-muted"))
        applicant = applicant_span.get_text(strip=True) if applicant_span else None

        # Also try finding applicant from paragraphs/divs
        if not applicant:
            for tag in card.find_all(["p", "small"]):
                t = tag.get_text(strip=True)
                if t and len(t) > 3 and t != name:
                    applicant = t
                    break

        status = "Unknown"
        for cls in ("btn-danger", "btn-success", "btn-warning", "btn-primary",
                    "btn-info", "btn-secondary", "btn-dark"):
            b = card.find("button", class_=re.compile(cls))
            if b:
                status = _normalise_status(b.get_text(strip=True))
                break

        # Fallback status detection from span/badge elements
        if status == "Unknown":
            for badge in card.find_all(["span", "div"], class_=re.compile(r"badge|status|pill")):
                txt = badge.get_text(strip=True)
                if txt:
                    norm = _normalise_status(txt)
                    if norm != "Unknown":
                        status = norm
                        break

        tm_class  = None
        mark_type = None
        for b in card.find_all("button", class_=re.compile(r"btn-outline-dark")):
            txt = b.get_text(strip=True)
            m = re.match(r"Class:\s*(\d+)", txt, re.I)
            if m:
                tm_class = int(m.group(1))
            elif txt and not re.match(r"^\d+$", txt):
                mark_type = txt

        # Fallback class from description text "[Class : 24]"
        if tm_class is None:
            for el in card.find_all(["div", "p", "span"]):
                t = el.get_text(" ", strip=True)
                m = re.search(r"\[Class\s*:\s*(\d+)\]", t, re.I)
                if m:
                    tm_class = int(m.group(1))
                    break

        description = None
        # Primary: find div starting with "[Class :"
        for d in card.find_all("div", class_=re.compile(r"text-break|lh-tight")):
            t = d.get_text(" ", strip=True)
            if t.startswith("[Class"):
                description = t
                break
        if not description:
            desc_div = card.find("div", string=re.compile(r"\[Class\s*:", re.I))
            if desc_div:
                description = desc_div.get_text(" ", strip=True)
        if not description:
            # Try any div with class description content
            for d in card.find_all(["p", "div"]):
                t = d.get_text(" ", strip=True)
                if "[Class" in t and len(t) > 10:
                    description = t
                    break

        if application_id is None and not name:
            return None

        mark_image_url = None
        for img_tag in card.find_all("img"):
            src = img_tag.get("src") or img_tag.get("data-src") or img_tag.get("data-lazy-src") or ""
            if src and not src.startswith("data:") and "placeholder" not in src.lower():
                if src.startswith("/"):
                    src = f"{BASE_URL}{src}"
                mark_image_url = src
                break

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

    # Fallback 1: list-group-item divs
    if not results:
        for item in soup.find_all("div", class_=re.compile(r"list-group-item")):
            parsed = _parse_card(item)
            if parsed:
                results.append(parsed)

    # Fallback 2: any card-like containers with trademark links
    if not results:
        for item in soup.find_all("div", class_=re.compile(r"card|tm-result|trademark-row")):
            parsed = _parse_card(item)
            if parsed:
                results.append(parsed)

    # Fallback 3: broad — any container with a trademark detail link
    if not results:
        for item in soup.find_all("div"):
            a = item.find("a", href=re.compile(r"^/trademarks/\d"))
            if a and item.find("button"):  # cards have buttons for status/class
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
    # Look for "Showing X of Y" pattern
    m = re.search(r"(?:Showing|Displaying)\s+[\d\s\-]+of\s+([\d,]+)", text, re.I)
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
    class_filter: Optional[int] = None,
) -> Tuple[List[Dict], Optional[int]]:
    """
    Fetch a single search-result page.
    
    If class_filter is provided, appends class[]=N to the URL for class-specific scraping.
    Returns (results, total_on_page_1).
    """
    params: dict = {"q": query.strip(), "page": page}
    if class_filter is not None:
        # QC uses class[]=N array param for filtering.
        # httpx doesn't natively support repeated params with [] so we build the
        # URL manually — the query MUST be percent-encoded or names containing
        # spaces/&/# etc. would silently corrupt the class[] filter and make
        # class-specific scraping return 0 results (which used to be masked by
        # a fallback to all-classes results — now removed, see report_engine.py).
        q_enc = quote_plus(query.strip())
        url = f"{SEARCH_URL}?q={q_enc}&class[]={class_filter}&page={page}"
    else:
        url = SEARCH_URL
    
    try:
        if class_filter is not None:
            resp = await client.get(url, headers=HEADERS, timeout=timeout)
        else:
            resp = await client.get(url, params=params, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.warning("QC HTTP error page=%d class=%s query=%r: %s", page, class_filter, query, e)
        return [], None
    except Exception as e:
        logger.warning("QC fetch error page=%d class=%s query=%r: %s", page, class_filter, query, e)
        return [], None

    soup  = BeautifulSoup(resp.text, "lxml")
    cards = _parse_cards_from_soup(soup)
    total = _parse_total(soup) if page == 1 else None
    
    logger.debug(
        "QC fetch: query=%r class=%s page=%d → %d cards",
        query, class_filter, page, len(cards)
    )
    return cards, total


async def _scrape_all_pages(
    client: httpx.AsyncClient,
    query: str,
    timeout: float,
    class_filter: Optional[int] = None,
    max_pages: int = MAX_PAGES,
    seen_ids: Optional[Set[str]] = None,
) -> Tuple[List[Dict], Optional[int]]:
    """
    Paginate through QC search results for a given query (and optional class filter).
    Returns (new_results, total_estimated).
    
    Only returns results NOT already in seen_ids (deduplication across calls).
    """
    if seen_ids is None:
        seen_ids = set()
    
    all_results: List[Dict] = []
    total_estimated: Optional[int] = None
    
    for page_no in range(1, max_pages + 1):
        cards, page_total = await _fetch_page(client, query, page_no, timeout, class_filter)

        if page_no == 1 and page_total is not None:
            total_estimated = page_total

        if not cards:
            logger.debug(
                "QC search %r class=%s: no cards on page %d — stopping",
                query, class_filter, page_no
            )
            break

        new_this_page = 0
        for card in cards:
            # Build a dedup key: prefer application_id, fall back to name+class
            aid = card.get("application_id")
            if not aid:
                aid = f"{card.get('name','')}__{card.get('class','')}"
            
            if aid in seen_ids:
                continue
            seen_ids.add(aid)
            all_results.append(card)
            new_this_page += 1

        logger.debug(
            "QC search %r class=%s: page %d → %d new (total so far: %d)",
            query, class_filter, page_no, new_this_page, len(all_results)
        )

        if new_this_page < MIN_RESULTS_PER_PAGE:
            # Sparse/empty page = end of results
            break

        # Polite crawl delay
        await asyncio.sleep(PAGE_DELAY)

    return all_results, total_estimated


async def search_trademarks(
    query: str,
    limit: int = 1000,
    timeout: float = 45.0,
    class_filters: Optional[List[int]] = None,
) -> Dict:
    """
    Scrape ALL trademark search results from QuickCompany for *query*.

    Strategy:
      1. Always fetch the generic (all-class) paginated results to get the full picture.
      2. If class_filters is provided (e.g. [24, 25, 35] for multi-class search),
         ALSO fetch class-specific URLs for each requested class. This guarantees
         that minority-class results (e.g. only 3-5 results in CL24) which appear
         far into the generic paginated results are captured.
      3. Deduplicate by application_id across all fetch rounds.
      4. Fetch mark images for the first IMAGE_FETCH_CAP results (parallel, throttled).

    Args:
        query:        Brand name to search
        limit:        Max total results to collect (default: effectively unlimited)
        timeout:      Per-request HTTP timeout in seconds
        class_filters: Optional list of Nice class ints to run class-specific fetches for.
                       Pass None for a generic search; pass [24, 25, 35] for multi-class.

    Returns:
        {
            "query": str,
            "total_estimated": int,
            "results": List[Dict],   ← all results, all classes, deduplicated
            "source": "quickcompany.in",
            "classes_fetched": List[int],  ← which class-specific fetches were done
        }
    """
    if not query or not query.strip():
        return {
            "query": query, "total_estimated": 0,
            "results": [], "source": "quickcompany.in",
            "classes_fetched": [],
        }

    all_results:   List[Dict] = []
    seen_ids:      Set[str]   = set()
    total_estimated: Optional[int] = None
    classes_fetched: List[int] = []

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        http2=False,
    ) as client:

        # ── Round 1: Generic all-class pagination ─────────────────────────────
        logger.info("QC scrape [1/2]: generic pages for query=%r", query)
        generic_results, total_est = await _scrape_all_pages(
            client, query, timeout,
            class_filter=None,
            max_pages=MAX_PAGES,
            seen_ids=seen_ids,
        )
        all_results.extend(generic_results)
        if total_est:
            total_estimated = total_est

        logger.info(
            "QC scrape [1/2] done: %d results from generic pages (estimated total: %s)",
            len(all_results), total_estimated
        )

        # ── Round 2: Class-specific fetches (if requested) ────────────────────
        # This captures results that were buried in generic pagination or missed
        # because too many other-class results dominated early pages.
        if class_filters:
            logger.info(
                "QC scrape [2/2]: class-specific pages for classes=%s query=%r",
                class_filters, query
            )
            for cls in class_filters:
                await asyncio.sleep(CLASS_DELAY)
                class_results, _ = await _scrape_all_pages(
                    client, query, timeout,
                    class_filter=cls,
                    max_pages=MAX_PAGES_CLASS,
                    seen_ids=seen_ids,  # shared — deduplicates against generic results
                )
                new_count = len(class_results)
                if new_count > 0:
                    logger.info(
                        "QC class-specific fetch CL%d: %d NEW results (not in generic)",
                        cls, new_count
                    )
                    all_results.extend(class_results)
                    classes_fetched.append(cls)
                else:
                    logger.info("QC class-specific fetch CL%d: all already captured", cls)

        if len(all_results) > limit:
            all_results = all_results[:limit]

        # ── Fetch mark images as base64 data URLs (parallel, capped) ──────────
        sem = asyncio.Semaphore(6)

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
        "QC search %r: %d total results collected (estimated: %s, classes fetched: %s)",
        query, len(all_results), total_estimated, classes_fetched
    )

    return {
        "query":           query.strip(),
        "total_estimated": total_estimated or len(all_results),
        "results":         all_results,
        "source":          "quickcompany.in",
        "classes_fetched": classes_fetched,
    }
