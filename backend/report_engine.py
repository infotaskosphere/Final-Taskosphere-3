"""
Trademark availability report engine — v2.

Pure rule-based analysis (no external LLM). Takes raw scraped results and
produces a structured availability verdict with:
  - overall_status: AVAILABLE / CAUTION / CONFLICT
  - risk_score (0-100)
  - exact_matches, phonetic_matches, contains_matches
  - class_breakdown (all scraped classes, not just the filtered one)
  - recommendations
  - alternative_name_suggestions

Key improvement over v1:
  - build_report now accepts class_filter for display purposes but always
    analyses ALL scraped results. The class_breakdown shows all classes found,
    while the match analysis focuses on the filtered class if specified.
  - all_results in the response always includes ALL classes so the frontend
    can switch class views without re-fetching.
"""
from __future__ import annotations

import re
from typing import List, Dict, Optional
from difflib import SequenceMatcher
from metaphone import doublemetaphone

BLOCKING_STATUSES = {
    "Registered", "Accepted", "Advertised", "Opposed", "Objected",
    "Under Examination", "Formalities Chk Pass", "Vienna Codification",
}
DEAD_STATUSES = {"Abandoned", "Refused", "Withdrawn", "Removed"}

# Comprehensive Nice classification hints
CLASS_HINTS: Dict[int, str] = {
    1:  "Chemicals, adhesives, fertilisers",
    2:  "Paints, varnishes, coatings",
    3:  "Cosmetics, cleaning preparations",
    4:  "Lubricants, fuels, candles",
    5:  "Pharmaceuticals, medical preparations",
    6:  "Metals, metal goods, hardware",
    7:  "Machines, machine tools, motors",
    8:  "Hand tools, cutlery",
    9:  "Electronics, computers, software",
    10: "Medical devices, surgical instruments",
    11: "Lighting, heating, cooling apparatus",
    12: "Vehicles, vehicle parts",
    13: "Firearms, explosives",
    14: "Precious metals, jewellery, watches",
    15: "Musical instruments",
    16: "Paper, stationery, printed matter",
    17: "Rubber, plastics, insulation materials",
    18: "Leather goods, bags, luggage",
    19: "Building materials (non-metallic)",
    20: "Furniture, mirrors, frames",
    21: "Household utensils, glassware, ceramics",
    22: "Ropes, fibres, textiles raw materials",
    23: "Yarns, threads for textile use",
    24: "Textiles, bed & table covers, fabrics",
    25: "Clothing, footwear, headgear",
    26: "Lace, embroidery, ribbons, buttons",
    27: "Carpets, rugs, floor coverings",
    28: "Games, toys, sporting goods",
    29: "Meat, fish, poultry, dairy products",
    30: "Coffee, tea, bakery, confectionery",
    31: "Agriculture, horticulture, live animals",
    32: "Beer, non-alcoholic beverages",
    33: "Alcoholic beverages",
    34: "Tobacco, smokers' articles",
    35: "Advertising, business management, retail",
    36: "Insurance, financial services",
    37: "Construction, repair, installation",
    38: "Telecommunications",
    39: "Transport, travel, distribution",
    40: "Treatment of materials, manufacturing",
    41: "Education, training, entertainment",
    42: "Scientific, technological, IT services",
    43: "Restaurants, hotels, hospitality",
    44: "Medical, veterinary, beauty services",
    45: "Legal, security, personal services",
}

ALT_SUFFIXES = ["ly", "ify", "io", "hub", "labs", "works", "co", "now", "go", "kart", "verse", "plus"]
ALT_PREFIXES = ["get", "try", "my", "the", "join", "use", "with", "pro"]


def _norm(s: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _phonetic_keys(s: str) -> tuple:
    if not s or not s.strip():
        return ("", "")
    return doublemetaphone(s.strip())


def _phonetic_match(a: str, b: str) -> bool:
    pa, sa = _phonetic_keys(a)
    pb, sb = _phonetic_keys(b)
    candidates_a = {c for c in (pa, sa) if c}
    candidates_b = {c for c in (pb, sb) if c}
    return bool(candidates_a & candidates_b)


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _classify_match(query: str, hit_name: str) -> str:
    q = _norm(query)
    h = _norm(hit_name)
    if not q or not h:
        return "weak"
    if q == h:
        return "exact"
    if _phonetic_match(query, hit_name):
        return "phonetic"
    if q in h or h in q:
        return "contains"
    if _similarity(query, hit_name) >= 0.78:
        return "similar"
    return "weak"


def _suggest_alternatives(query: str) -> List[str]:
    base = re.sub(r"[^a-zA-Z0-9]", "", query).strip()
    if not base:
        return []
    base_cap = base.capitalize()
    suggestions = []
    for s in ALT_SUFFIXES[:4]:
        suggestions.append(f"{base_cap}{s}")
    for p in ALT_PREFIXES[:3]:
        suggestions.append(f"{p.capitalize()}{base_cap}")
    if len(base) > 3:
        suggestions.append(f"{base_cap[:-1]}o")
    seen = set()
    out = []
    for s in suggestions:
        if s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out[:8]


def _risk_from_match(match_type: str, status: str) -> int:
    base = {
        "exact":    80,
        "phonetic": 55,
        "contains": 40,
        "similar":  35,
        "weak":     10,
    }.get(match_type, 10)
    if status in BLOCKING_STATUSES:
        base += 18
    elif status in DEAD_STATUSES:
        base -= 25
    return max(0, min(100, base))


def build_report(query: str, scraped: Dict, class_filter: Optional[int] = None) -> Dict:
    """
    Build a trademark availability report from scraped QC data.

    Args:
        query:        The brand name searched
        scraped:      Output of scraper.search_trademarks()
        class_filter: Optional Nice class to focus the analysis on.
                      When provided, the verdict/risk is computed from that class only,
                      but all_results and class_breakdown always include ALL classes.

    Returns:
        Full report dict. class_breakdown covers all classes found in the scrape.
    """
    raw_results: List[Dict] = scraped.get("results", []) or []

    # ── Enrich ALL results (needed for class_breakdown) ────────────────────────
    all_enriched: List[Dict] = []
    for r in raw_results:
        mtype = _classify_match(query, r.get("name", ""))
        sim   = round(_similarity(query, r.get("name", "")) * 100)
        risk  = _risk_from_match(mtype, r.get("status", "Unknown"))
        all_enriched.append({**r, "match_type": mtype, "similarity_pct": sim, "individual_risk_score": risk})

    all_enriched.sort(key=lambda x: x["individual_risk_score"], reverse=True)

    # ── Class breakdown always covers ALL scraped classes ─────────────────────
    class_counts: Dict[int, Dict] = {}
    for r in all_enriched:
        c = r.get("class")
        if c is None:
            continue
        b = class_counts.setdefault(c, {
            "class": c, "total": 0, "blocking": 0, "dead": 0,
            "sector": CLASS_HINTS.get(c, "—"),
        })
        b["total"] += 1
        if r.get("status") in BLOCKING_STATUSES:
            b["blocking"] += 1
        elif r.get("status") in DEAD_STATUSES:
            b["dead"] += 1

    # Sort by blocking count desc, then total desc
    class_breakdown = sorted(
        class_counts.values(),
        key=lambda x: (x["blocking"], x["total"]),
        reverse=True,
    )
    # Add conflict bar percentage
    for cb in class_breakdown:
        cb["hint"] = cb.get("sector", CLASS_HINTS.get(cb["class"], "—"))
        cb["blocking_pct"] = round(cb["blocking"] / cb["total"] * 100) if cb["total"] else 0

    # ── Focus analysis on class_filter if provided ────────────────────────────
    # IMPORTANT: when a class is selected, the report must ONLY reflect that
    # class. This used to silently fall back to ALL classes whenever the
    # selected class had zero matches, which made class filtering look broken
    # (a Class 5 search would show Class 25/35/44/... results in the table
    # and PDF). Zero conflicting marks in a class is a valid, common, and
    # GOOD outcome — it must never be masked by unrelated classes.
    if class_filter is not None:
        focused_results = [r for r in all_enriched if r.get("class") == class_filter]
        if not focused_results:
            logger.info(
                "build_report: class_filter=%d produced 0 results from %d total "
                "results across all classes — class appears clear.",
                class_filter, len(all_enriched)
            )
    else:
        focused_results = all_enriched

    # ── Match categorisation ───────────────────────────────────────────────────
    exact    = [r for r in focused_results if r["match_type"] == "exact"]
    phonetic = [r for r in focused_results if r["match_type"] == "phonetic"]
    contains = [r for r in focused_results if r["match_type"] in ("contains", "similar")]

    blocking_exact    = [r for r in exact    if r.get("status") in BLOCKING_STATUSES]
    blocking_phonetic = [r for r in phonetic if r.get("status") in BLOCKING_STATUSES]

    # ── Overall verdict ────────────────────────────────────────────────────────
    if blocking_exact:
        overall  = "CONFLICT"
        headline = (
            f"Direct conflict — an identical mark '{blocking_exact[0]['name']}' "
            f"is already {blocking_exact[0]['status'].lower()} "
            f"in class {blocking_exact[0].get('class', '?')}."
        )
    elif blocking_phonetic or len(contains) >= 5:
        overall  = "CAUTION"
        headline = (
            "Caution — phonetically or visually similar marks are already on record. "
            "Registration is possible but objections are likely."
        )
    elif focused_results:
        overall  = "CAUTION" if any(r["individual_risk_score"] >= 50 for r in focused_results) else "AVAILABLE"
        headline = (
            "Largely clear — only weak or expired matches found. Filing this trademark looks feasible."
            if overall == "AVAILABLE"
            else "Moderate risk — some related marks exist. Review before filing."
        )
    else:
        overall  = "AVAILABLE"
        headline = (
            f"No conflicting trademarks were found in Class {class_filter} on the QuickCompany index."
            if class_filter is not None
            else "No conflicting trademarks were found in the QuickCompany index."
        )

    # ── Risk score ────────────────────────────────────────────────────────────
    if focused_results:
        top = sorted([r["individual_risk_score"] for r in focused_results], reverse=True)[:5]
        risk_score = round(sum(top) / len(top))
    else:
        risk_score = 5

    # ── Recommendations ────────────────────────────────────────────────────────
    recommendations: List[str] = []
    if overall == "CONFLICT":
        recommendations.append("Do NOT file as-is. The identical mark already exists in a blocking status.")
        recommendations.append("Consider modifying the name or selecting a different trademark class.")
    elif overall == "CAUTION":
        recommendations.append("Conduct a deeper phonetic + device-mark search before filing.")
        if class_filter is not None:
            clear_classes = [cb for cb in class_breakdown if cb["blocking"] == 0 and cb["class"] != class_filter]
            if clear_classes:
                suggestions = ", ".join(f"Class {cb['class']} ({cb['hint']})" for cb in clear_classes[:3])
                recommendations.append(f"Consider filing in: {suggestions} — these classes have no blocking marks.")
        recommendations.append("Engage a trademark attorney to draft a strong specification of goods/services.")
    else:
        recommendations.append("Proceed with filing — risk profile is low.")
        recommendations.append("Lock in the mark quickly: TM registration in India operates on a first-to-file basis.")
        recommendations.append("Consider filing across multiple relevant classes for stronger protection.")
    recommendations.append("Always confirm results on the official IP India database before filing.")

    alt_suggestions = _suggest_alternatives(query) if overall != "AVAILABLE" else []

    return {
        "query":            query,
        "class_filter":     class_filter,
        "overall_status":   overall,
        "risk_score":       risk_score,
        "headline":         headline,
        "summary_counts": {
            "exact":                  len(exact),
            "phonetic":               len(phonetic),
            "contains_or_similar":    len(contains),
            "total_results":          len(focused_results),
            "total_all_classes":      len(all_enriched),
            "blocking_exact_matches": len(blocking_exact),
        },
        "exact_matches":    exact,
        "phonetic_matches": phonetic,
        "contains_matches": contains,
        # ── When a class filter is active, reports show ONLY that class ────────
        # This ensures Exhibit A, class-wise breakdown, and match tables in both
        # the PDF and frontend only show filings relevant to the selected class.
        "all_results":     focused_results,   # filtered to class if class_filter set
        "focused_results": focused_results,
        # Class breakdown: only the filtered class row when class_filter is set,
        # so the PDF table and frontend don't show irrelevant classes.
        "class_breakdown": (
            [cb for cb in class_breakdown if cb["class"] == class_filter]
            if class_filter is not None
            else class_breakdown
        ),
        # Always keep the full cross-class breakdown under a separate key so
        # the frontend "View in all classes" feature or future features can use it.
        "class_breakdown_all": class_breakdown,
        "recommendations":  recommendations,
        "alternative_name_suggestions": alt_suggestions,
        "source":           scraped.get("source"),
        "total_estimated":  scraped.get("total_estimated"),
        "classes_fetched":  scraped.get("classes_fetched", []),
    }


# Bring logger into scope (module-level)
import logging
logger = logging.getLogger(__name__)

# Phase 7 integration reference: Ensure future financial reporting modules (Balance Sheet,
# Trial Balance, P&L, Cash Flow, and MIS) consume posted journal entries and voucher records
# produced by the autonomous Accounting Engine without altering existing trademark report formats.

