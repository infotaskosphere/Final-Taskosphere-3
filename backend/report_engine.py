"""
Trademark availability report engine.

Pure rule-based analysis (no external LLM). Takes raw scraped results and
produces a structured availability verdict with:
  - overall_status: AVAILABLE / CAUTION / CONFLICT
  - risk_score (0-100)
  - exact_matches, phonetic_matches, contains_matches
  - class_breakdown
  - recommendations
  - alternative_name_suggestions
"""
from __future__ import annotations

import re
from typing import List, Dict, Optional
from difflib import SequenceMatcher
from metaphone import doublemetaphone

BLOCKING_STATUSES = {"Registered", "Accepted", "Advertised", "Opposed", "Objected", "Under Examination"}
DEAD_STATUSES = {"Abandoned", "Refused", "Withdrawn", "Removed"}

CLASS_HINTS = {
    9: "Electronics, computers, software",
    25: "Clothing, footwear, apparel",
    35: "Advertising, business, retail services",
    38: "Telecommunications",
    41: "Education, training, entertainment",
    42: "Scientific, technological, software services",
    43: "Restaurants, hospitality",
    44: "Medical, healthcare",
    45: "Legal services",
}

ALT_SUFFIXES = ["ly", "ify", "io", "hub", "labs", "works", "co", "now", "go", "kart", "verse"]
ALT_PREFIXES = ["get", "try", "my", "the", "join", "use", "with"]


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
        "exact": 80,
        "phonetic": 55,
        "contains": 40,
        "similar": 35,
        "weak": 10,
    }.get(match_type, 10)
    if status in BLOCKING_STATUSES:
        base += 18
    elif status in DEAD_STATUSES:
        base -= 25
    return max(0, min(100, base))


def build_report(query: str, scraped: Dict, class_filter: Optional[int] = None) -> Dict:
    raw_results: List[Dict] = scraped.get("results", []) or []

    if class_filter is not None:
        results = [r for r in raw_results if r.get("class") == class_filter]
    else:
        results = raw_results

    enriched = []
    for r in results:
        mtype = _classify_match(query, r.get("name", ""))
        sim = round(_similarity(query, r.get("name", "")) * 100)
        risk = _risk_from_match(mtype, r.get("status", "Unknown"))
        enriched.append({**r, "match_type": mtype, "similarity_pct": sim, "individual_risk_score": risk})

    enriched.sort(key=lambda x: x["individual_risk_score"], reverse=True)

    exact    = [r for r in enriched if r["match_type"] == "exact"]
    phonetic = [r for r in enriched if r["match_type"] == "phonetic"]
    contains = [r for r in enriched if r["match_type"] in ("contains", "similar")]

    class_counts: Dict[int, Dict] = {}
    for r in enriched:
        c = r.get("class")
        if c is None:
            continue
        b = class_counts.setdefault(c, {"class": c, "total": 0, "blocking": 0, "dead": 0})
        b["total"] += 1
        if r.get("status") in BLOCKING_STATUSES:
            b["blocking"] += 1
        elif r.get("status") in DEAD_STATUSES:
            b["dead"] += 1
    class_breakdown = sorted(class_counts.values(), key=lambda x: x["total"], reverse=True)
    for cb in class_breakdown:
        cb["hint"] = CLASS_HINTS.get(cb["class"], "—")

    blocking_exact    = [r for r in exact    if r.get("status") in BLOCKING_STATUSES]
    blocking_phonetic = [r for r in phonetic if r.get("status") in BLOCKING_STATUSES]

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
    elif enriched:
        overall  = "CAUTION" if any(r["individual_risk_score"] >= 50 for r in enriched) else "AVAILABLE"
        headline = (
            "Largely clear — only weak or expired matches found. Filing this trademark looks feasible."
            if overall == "AVAILABLE"
            else "Moderate risk — some related marks exist. Review before filing."
        )
    else:
        overall  = "AVAILABLE"
        headline = "No conflicting trademarks were found in the QuickCompany index."

    if enriched:
        top = sorted([r["individual_risk_score"] for r in enriched], reverse=True)[:5]
        risk_score = round(sum(top) / len(top))
    else:
        risk_score = 5

    recommendations: List[str] = []
    if overall == "CONFLICT":
        recommendations.append("Do NOT file as-is. The identical mark already exists in a blocking status.")
        recommendations.append("Consider modifying the name or selecting a different trademark class.")
    elif overall == "CAUTION":
        recommendations.append("Conduct a deeper phonetic + device-mark search before filing.")
        recommendations.append("Consider filing in a class with fewer existing conflicts (see class breakdown).")
        recommendations.append("Engage a trademark attorney to draft a strong specification of goods/services.")
    else:
        recommendations.append("Proceed with filing — risk profile is low.")
        recommendations.append("Lock in the mark quickly: TM registration in India operates on a first-to-file basis.")
        recommendations.append("Consider filing across multiple relevant classes for stronger protection.")
    recommendations.append("Always confirm results on the official IP India database before filing.")

    alt_suggestions = _suggest_alternatives(query) if overall != "AVAILABLE" else []

    return {
        "query": query,
        "class_filter": class_filter,
        "overall_status": overall,
        "risk_score": risk_score,
        "headline": headline,
        "summary_counts": {
            "exact": len(exact),
            "phonetic": len(phonetic),
            "contains_or_similar": len(contains),
            "total_results": len(enriched),
            "blocking_exact_matches": len(blocking_exact),
        },
        "exact_matches":    exact,
        "phonetic_matches": phonetic,
        "contains_matches": contains,
        "all_results":      enriched,
        "class_breakdown":  class_breakdown,
        "recommendations":  recommendations,
        "alternative_name_suggestions": alt_suggestions,
        "source":           scraped.get("source"),
        "total_estimated":  scraped.get("total_estimated"),
    }
