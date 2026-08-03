"""
GST return parsing for the MIS Report module.
=============================================
Handles the two things a CA firm actually has on hand:

  1. GST portal PDFs  — GSTR-1 and GSTR-3B downloaded from gst.gov.in.
     Every table line item is captured (section code, description, taxable
     value, IGST, CGST, SGST/UTGST, Cess, no. of records).

  2. GST Excel/CSV exports — invoice-level B2B/B2C data. These fall through
     to the normal register parser in mis_report.py; only the summary
     helpers here are used for the report/export layer.

Nothing is guessed: rows without any numeric value are skipped, and the
return type / tax period are read from the document text.
"""

from __future__ import annotations

import re
import logging
from typing import List, Dict, Any, Optional

import pandas as pd

logger = logging.getLogger(__name__)

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

TAX_COLS = {
    "taxable_value": ["total taxable value", "taxable value", "value (", "total value", "value"],
    "igst": ["integrated tax", "igst"],
    "cgst": ["central tax", "cgst"],
    "sgst": ["state/ut tax", "state/ ut tax", "state tax", "sgst", "utgst"],
    "cess": ["cess"],
    "records": ["no. of records", "no of records", "number of records"],
    "doc_type": ["document type"],
}

_NUM_RE = re.compile(r"^-?[\d,]+(?:\.\d+)?$")
_SECTION_RE = re.compile(r"^\s*(?:[A-Z]\s)?(\d{1,2}(?:\.\d)*[A-Z]?)\s*[-–—.]\s*(.+)$")
_WATERMARK = re.compile(r"^\s*(?:[A-Z]\s)+")


def _num(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().replace("₹", "").replace(",", "")
    s = re.sub(r"^[A-Z]\s+", "", s)              # strip watermark letter ("E 0.00")
    if s in ("", "-", "–", "nan", "None", "NA"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def _clean_label(val) -> str:
    s = re.sub(r"\s+", " ", str(val or "")).strip()
    # portal PDFs carry a diagonal "FILED" watermark that leaks single letters
    s = re.sub(r"^(?:[A-Z]\s)+(?=[\(\dA-Za-z])", "", s)
    return s.strip()


def detect_return_type(text: str, filename: str = "") -> str:
    blob = f"{filename} {text[:3000]}".upper().replace("-", "").replace(" ", "")
    if "GSTR3B" in blob:
        return "GSTR-3B"
    if "GSTR2B" in blob:
        return "GSTR-2B"
    if "GSTR2A" in blob:
        return "GSTR-2A"
    if "GSTR9" in blob:
        return "GSTR-9"
    if "GSTR1" in blob:
        return "GSTR-1"
    return "GST Report"


def detect_tax_period(text: str, filename: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {"month": None, "year": None, "label": None, "date": None}
    m = re.search(r"(?:tax\s*period|period)\s*[:\-]?\s*([A-Za-z]+)", text, re.I)
    if not m:
        m = re.search(r"\b(" + "|".join(MONTHS.keys()) + r")\b", filename, re.I)
    y = re.search(r"(?:financial\s*year|year)\s*[:\-]?\s*(\d{4})-(\d{2,4})", text, re.I) \
        or re.search(r"(\d{4})-(\d{2,4})", filename)
    if m:
        name = m.group(1).lower()
        if name in MONTHS:
            out["month"] = MONTHS[name]
            out["label"] = m.group(1).title()
    if y:
        start = int(y.group(1))
        out["year"] = start
        if out["month"]:
            cal_year = start if out["month"] >= 4 else start + 1
            out["date"] = f"{cal_year}-{out['month']:02d}-01"
        out["label"] = f"{out['label'] or ''} {y.group(1)}-{y.group(2)}".strip()
    elif out["month"]:
        out["date"] = None
    return out


def _match_cols(columns) -> Dict[str, Optional[str]]:
    lowered = {str(c).strip().lower(): c for c in columns}
    found: Dict[str, Optional[str]] = {}
    used = set()
    for key, cands in TAX_COLS.items():
        hit = None
        for cand in cands:
            for low, orig in lowered.items():
                if orig in used:
                    continue
                if low == cand or cand in low:
                    hit = orig
                    break
            if hit:
                break
        if hit:
            used.add(hit)
        found[key] = hit
    return found


def _classify(section: str, label: str) -> str:
    """
    A GST return repeats the same money in several tables (section detail,
    HSN summary, document summary, tax payment). Tagging each line lets the
    report add up outward supplies once instead of four times.
    """
    s = f"{section} {label}".lower()
    if "total liability" in s or "grand total" in s:
        return "grand_total"
    if "hsn" in s or "document summary" in s or "documents issued" in s:
        return "summary"
    if "itc" in s or "input tax credit" in s:
        return "itc"
    if any(k in s for k in ("payable", "paid in cash", "tax payment", "interest", "late fee")):
        return "tax_payment"
    if section.strip().lower() in ("period", "col_0", "") and label.lower() in (
        "integrated tax", "central tax", "state/ut tax", "cess"
    ):
        return "tax_payment"
    if re.match(r"^\s*(3\.1|3\.2|4[a-d]|5|6[a-c]|7|8|9[ab]|10|11|12|13|14|15)\b", section.strip(), re.I) \
       or "outward" in s or "nature of supplies" in s:
        return "outward"
    if "inward" in s or "reverse charge" in s:
        return "inward"
    return "other"


def parse_gst_tables(tables: List[pd.DataFrame], text: str, filename: str) -> List[Dict[str, Any]]:
    """Flatten every GST return table into MIS transaction rows."""
    return_type = detect_return_type(text, filename)
    period_info = detect_tax_period(text, filename)
    rows: List[Dict[str, Any]] = []
    seen = set()
    prev_cols: Optional[Dict[str, Optional[str]]] = None
    prev_width = 0
    prev_section = ""

    for table in tables:
        if table is None or table.empty or table.shape[1] < 2:
            continue
        cols = _match_cols(table.columns)
        numeric_keys = [k for k in ("taxable_value", "igst", "cgst", "sgst", "cess") if cols.get(k)]
        headerless = all(re.fullmatch(r"(col_)?\d+", str(c).strip()) for c in table.columns)
        if not numeric_keys and headerless and prev_cols and table.shape[1] == prev_width:
            # a table split across pages keeps the header only on the first part
            positional = {k: (table.columns[v] if isinstance(v, int) and v < table.shape[1] else None)
                          for k, v in prev_cols.items()}
            cols = positional
            numeric_keys = [k for k in ("taxable_value", "igst", "cgst", "sgst", "cess") if cols.get(k)]
        if not numeric_keys:
            continue
        label_col = table.columns[0]
        section_title = _clean_label(label_col)
        if headerless:
            section_title = prev_section or section_title
        current_section = section_title
        prev_cols = {k: (list(table.columns).index(v) if v is not None else None)
                     for k, v in cols.items()}
        prev_width = table.shape[1]
        prev_section = section_title


        for _, r in table.iterrows():
            label = _clean_label(r[label_col])
            if not label or len(label) <= 2:
                continue
            sec = _SECTION_RE.match(label)
            values = {k: _num(r[cols[k]]) for k in numeric_keys}
            if sec and all(v is None for v in values.values()):
                current_section = label            # pure section header row
                continue
            if all(v is None for v in values.values()):
                continue
            taxable = values.get("taxable_value") or 0.0
            igst = values.get("igst") or 0.0
            cgst = values.get("cgst") or 0.0
            sgst = values.get("sgst") or 0.0
            cess = values.get("cess") or 0.0
            tax_amount = round(igst + cgst + sgst + cess, 2)
            if not taxable and not tax_amount:
                continue                            # nil line, nothing to report
            key = (return_type, period_info.get("label"), current_section, label,
                   taxable, igst, cgst, sgst, cess)
            if key in seen:
                continue
            seen.add(key)
            records = _num(r[cols["records"]]) if cols.get("records") else None
            code = sec.group(1) if sec else None
            if not code:
                m = re.match(r"^\(?([0-9A-Za-z]{1,3})\)?[.\s)]", label)
                code = m.group(1) if m else None
            measure = _classify(current_section, label)
            rows.append({
                "date": period_info.get("date"),
                "invoice_no": code or "",
                "party_name": label[:300],
                "taxable_value": round(taxable, 2),
                "tax_amount": tax_amount,
                "total_amount": round(taxable + tax_amount, 2),
                "status": "paid",
                "due_date": period_info.get("date"),
                "paid_date": period_info.get("date"),
                "category": return_type,
                "service": current_section[:300],
                "branch": None,
                "partner": None,
                "employee": None,
                "gst_return_type": return_type,
                "gst_period": period_info.get("label"),
                "gst_section": current_section[:300],
                "gst_measure": measure,
                "igst": round(igst, 2),
                "cgst": round(cgst, 2),
                "sgst": round(sgst, 2),
                "cess": round(cess, 2),
                "record_count": int(records) if records is not None else None,
            })
    return rows


_MONEY_FIELDS = ("taxable_value", "igst", "cgst", "sgst", "cess", "tax_amount")


def _blank_bucket() -> Dict[str, float]:
    b = {f: 0.0 for f in _MONEY_FIELDS}
    b["line_items"] = 0
    return b


def _add(bucket: Dict[str, float], t: Dict[str, Any]) -> None:
    for f in _MONEY_FIELDS:
        bucket[f] = round(bucket[f] + float(t.get(f) or 0), 2)
    bucket["line_items"] += 1


def gst_summary(gst_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Roll GST rows up for the report + Excel export. Only `outward` lines feed
    the liability totals; ITC and tax-payment lines are reported separately so
    the same rupee is never counted twice.
    """
    by_return: Dict[str, Dict[str, float]] = {}
    by_period: Dict[str, Dict[str, float]] = {}
    by_measure: Dict[str, Dict[str, float]] = {}
    outward = _blank_bucket()

    for t in gst_rows:
        measure = t.get("gst_measure") or "other"
        _add(by_measure.setdefault(measure, _blank_bucket()), t)
        if measure not in ("outward", "inward"):
            continue
        _add(by_return.setdefault(t.get("gst_return_type") or "GST Report", _blank_bucket()), t)
        _add(by_period.setdefault(t.get("gst_period") or "Unspecified", _blank_bucket()), t)
        if measure == "outward":
            _add(outward, t)

    itc = by_measure.get("itc", _blank_bucket())
    return {
        "by_return": by_return,
        "by_period": by_period,
        "by_measure": by_measure,
        "outward": outward,
        "itc": itc,
        "total": {f: outward[f] for f in _MONEY_FIELDS},
        "net_tax": round(outward["tax_amount"] - itc["tax_amount"], 2),
        "line_items": len(gst_rows),
    }

