"""
GST Reconciliation Module  [ENHANCED v2]
=========================================
Extends v1 with:
  - Multi-key + fuzzy matching layer
  - AI insights: mismatch detection, ITC eligibility, correction suggestions
  - Vendor risk scoring (non-filer, irregular patterns)
  - GSTR-3B vs 2B reconciliation endpoint
  - ITC reversal tracking
  - Audit logging (every action)
  - Duplicate invoice detection
  - Amendment tracking
  - Dashboard summary endpoint
  - Configurable tolerance & fuzzy threshold per request

Backward compatible: all v1 endpoints/keys preserved.
"""

import io, re, uuid, logging, difflib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File,
    Form, Query, BackgroundTasks,
)
from pydantic import BaseModel, Field, ConfigDict

from backend.dependencies import db, get_current_user, build_client_query
from backend.models import User

logger   = logging.getLogger(__name__)
router   = APIRouter(prefix="/gst-reconciliation", tags=["gst-reconciliation"])
IST      = ZoneInfo("Asia/Kolkata")
TOLERANCE = 1.01   # ₹ default tolerance

# ─── HELPERS (v1 preserved) ──────────────────────────────────────────────────

def _now():
    return datetime.now(IST)

def _to_str(val):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return ""
    return str(val).strip()

def _to_num(val):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return 0.0
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0

def _normalise_invoice(val):
    """Normalise an invoice number to its pure numeric core for matching.

    Handles:
      - Purely numeric: "001234" → "1234"
      - ALPHA-NUM with separator: "SW-60134" → "60134", "INV/1234" → "1234"
      - NUM/NUM (portal serial/invoice): "12/0033902" → "33902"
      - ALPHA directly attached (no separator): "T1326" → "1326", "INV1234" → "1234"
        Portal often uses a series letter prefix that books omit entirely.
    """
    import re as _re
    s = _to_str(val).upper().replace(" ", "")
    # Purely numeric
    if s.isdigit():
        return s.lstrip("0") or "0"
    # ALPHA/NUM or ALPHA-NUM with separator
    for sep in ("-", "/"):
        if sep in s:
            prefix, _, suffix = s.partition(sep)
            if prefix.isalpha() and suffix.isdigit():
                return suffix.lstrip("0") or "0"
            # Short numeric prefix (portal SerialNo/InvoiceNo), e.g. "12/0033902"
            if prefix.isdigit() and len(prefix) <= 4 and suffix.isdigit():
                return suffix.lstrip("0") or "0"
    # ALPHA directly attached to number — no separator (e.g. "T1326" → "1326")
    m = _re.match(r'^([A-Z]+)(\d+)$', s)
    if m:
        return m.group(2).lstrip("0") or "0"
    return s

def _normalise_gstin(val):
    return _to_str(val).upper()

def _find_header_row(df_raw):
    for i in range(min(15, len(df_raw))):
        for c in range(min(5, len(df_raw.columns))):
            cell = _to_str(df_raw.iloc[i, c]).lower()
            if "gstin" in cell and ("supplier" in cell or cell[:5] == "gstin"):
                return i
    return -1

# ─── FUZZY MATCHING (NEW) ─────────────────────────────────────────────────────

def _fuzzy_similarity(a, b):
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()

def _fuzzy_invoice_match(inv_a, inv_b, threshold=0.80):
    if inv_a == inv_b:
        return True
    return _fuzzy_similarity(inv_a, inv_b) >= threshold

# ─── AI INSIGHTS / RULE ENGINE (NEW) ─────────────────────────────────────────

def _detect_mismatch_reason(portal, books, tolerance=TOLERANCE):
    reasons = []
    val_diff = abs(portal.get("invoice_value", 0) - books.get("invoice_value", 0))
    if val_diff > tolerance:
        reasons.append(f"Invoice value difference Rs.{round(val_diff, 2)}")
    tax_p = portal.get("igst", 0) + portal.get("cgst", 0) + portal.get("sgst", 0)
    tax_b = books.get("igst",  0) + books.get("cgst",  0) + books.get("sgst",  0)
    tax_diff = abs(tax_p - tax_b)
    if tax_diff > tolerance:
        reasons.append(f"Tax difference Rs.{round(tax_diff, 2)}")
    pos_p = _to_str(portal.get("place_of_supply", ""))
    pos_b = _to_str(books.get("place_of_supply",  ""))
    if pos_p and pos_b and pos_p != pos_b:
        reasons.append(f"Place of supply mismatch ({pos_p} vs {pos_b})")
    # NOTE: Reverse charge flag difference is intentionally NOT counted as a financial mismatch.
    # Invoices that differ only in the RC flag are treated as matched — the flag is metadata, not a value.
    rc_p = _to_str(portal.get("reverse_charge", "")).upper()
    rc_b = _to_str(books.get("reverse_charge",  "")).upper()
    if rc_p and rc_b and rc_p != rc_b:
        reasons.append("Reverse charge flag differs (note only — not a financial mismatch)")
    return "; ".join(reasons) if reasons else "Other discrepancy"

def _itc_eligibility(record):
    itc_avail = _to_str(record.get("itc_availability", "")).upper()
    rc        = _to_str(record.get("reverse_charge",   "")).upper()
    inv_type  = _to_str(record.get("invoice_type",     "")).upper()
    if itc_avail in ("INELIGIBLE", "N", "NO"):
        return {"eligible": False, "reason": "Marked ineligible in GSTR-2B"}
    if rc in ("Y", "YES"):
        return {"eligible": True, "reason": "RCM - ITC claimable after payment"}
    if inv_type in ("IMPG", "IMPGSEZ"):
        return {"eligible": True, "reason": "Import of goods - ITC eligible"}
    igst = record.get("igst", 0)
    cgst = record.get("cgst", 0)
    sgst = record.get("sgst", 0)
    total = igst + cgst + sgst
    if total == 0:
        return {"eligible": False, "reason": "Zero tax - no ITC to claim"}
    return {"eligible": True, "reason": "Eligible per GSTR-2B",
            "itc_igst": igst, "itc_cgst": cgst, "itc_sgst": sgst,
            "itc_total": round(total, 2)}

def _suggest_correction(portal, books):
    val_diff = portal.get("invoice_value", 0) - books.get("invoice_value", 0)
    tax_diff = ((portal.get("igst",0)+portal.get("cgst",0)+portal.get("sgst",0)) -
                (books.get("igst",0) +books.get("cgst",0) +books.get("sgst",0)))
    if abs(val_diff) < 5 and abs(tax_diff) < 2:
        return "Minor rounding difference - verify original invoice; likely safe to accept."
    if val_diff > 0:
        return "Portal value higher - check if supplier filed amended invoice. Update books if confirmed."
    if val_diff < 0:
        return "Books value higher - supplier may have understated; request credit note/amendment."
    return "Review invoice with vendor and request GSTR-1 amendment if needed."

# ─── VENDOR RISK SCORING (NEW) ───────────────────────────────────────────────

def _compute_vendor_risk(vendor_invoices):
    flags = []
    score = 0
    total      = len(vendor_invoices)
    mismatched = sum(1 for i in vendor_invoices if i.get("status") == "mismatch")
    p_only     = sum(1 for i in vendor_invoices if i.get("status") == "missing_in_books")
    b_only     = sum(1 for i in vendor_invoices if i.get("status") == "missing_in_gst")
    if total == 0:
        return {"risk_score": 0, "risk_level": "low", "flags": []}
    if mismatched / total > 0.5:
        score += 40; flags.append("High mismatch rate (>50%)")
    elif mismatched / total > 0.2:
        score += 20; flags.append("Moderate mismatch rate (>20%)")
    if p_only > 0:
        score += 20; flags.append(f"{p_only} portal-only invoice(s) - possible ghost invoices")
    if b_only > 2:
        score += 25; flags.append(f"{b_only} book-only invoice(s) - vendor may be non-filer")
    if b_only / total > 0.3:
        score += 15; flags.append("Irregular filing pattern detected")
    level = "low" if score < 30 else ("medium" if score < 60 else "high")
    return {"risk_score": min(score,100), "risk_level": level, "flags": flags,
            "total_invoices": total, "mismatched": mismatched,
            "portal_only": p_only, "books_only": b_only}

# ─── PARSE BOOKS (v1 preserved + duplicate flag) ──────────────────────────────

def _parse_books(file_bytes, filename):
    ext    = filename.rsplit(".", 1)[-1].lower()
    engine = "xlrd" if ext == "xls" else "openpyxl"
    try:
        xl = pd.ExcelFile(io.BytesIO(file_bytes), engine=engine)
    except Exception as exc:
        raise HTTPException(400, f"Cannot open Books file: {exc}")

    sheet = next((s for s in xl.sheet_names if s.strip().lower() == "b2b"), None) or xl.sheet_names[0]
    logger.info("Books: using sheet '%s'", sheet)

    raw        = pd.read_excel(xl, sheet_name=sheet, header=None, dtype=str)
    header_idx = _find_header_row(raw)
    if header_idx == -1:
        header_idx = 2

    df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=sheet,
                       engine=engine, header=header_idx, dtype=str)
    df.columns = [_to_str(c).lower().strip() for c in df.columns]

    def _col(*keys):
        for k in keys:
            for col in df.columns:
                if k.lower() in col:
                    return col
        return None

    gstin_col  = _col("gstin of supplier", "gstin")
    inv_no_col = _col("invoice number", "invoice no")
    date_col   = _col("invoice date", "date")
    val_col    = _col("invoice value")
    tax_col    = _col("taxable value")
    igst_col   = _col("integrated tax paid", "integrated tax")
    cgst_col   = _col("central tax paid", "central tax")
    sgst_col   = _col("state/ut tax paid", "state/ut tax", "state tax")
    cess_col   = _col("cess paid", "cess")
    pos_col    = _col("place of supply", "place")
    rc_col     = _col("reverse charge")
    type_col   = _col("invoice type", "type")
    rate_col   = _col("rate")

    if gstin_col is None or inv_no_col is None:
        raise HTTPException(400, "Books file: could not locate 'GSTIN of Supplier' or 'Invoice Number' columns.")

    records   = []
    seen_keys = set()
    for _, row in df.iterrows():
        gstin  = _normalise_gstin(row.get(gstin_col, ""))
        inv_no = _normalise_invoice(row.get(inv_no_col, ""))
        if not gstin or not inv_no or len(gstin) < 10:
            continue
        if gstin in ("GSTIN OF SUPPLIER",):
            continue
        dup_key       = f"{gstin}__{inv_no}"
        is_duplicate  = dup_key in seen_keys
        seen_keys.add(dup_key)
        records.append({
            "gstin":           gstin,
            "invoice_no":      inv_no,
            "invoice_no_raw":  _to_str(row.get(inv_no_col, "")),
            "invoice_date":    _to_str(row.get(date_col,  "")) if date_col else "",
            "invoice_value":   _to_num(row.get(val_col,   0))  if val_col  else 0.0,
            "taxable_value":   _to_num(row.get(tax_col,   0))  if tax_col  else 0.0,
            "igst":            _to_num(row.get(igst_col,  0))  if igst_col else 0.0,
            "cgst":            _to_num(row.get(cgst_col,  0))  if cgst_col else 0.0,
            "sgst":            _to_num(row.get(sgst_col,  0))  if sgst_col else 0.0,
            "cess":            _to_num(row.get(cess_col,  0))  if cess_col else 0.0,
            "place_of_supply": _to_str(row.get(pos_col,  ""))  if pos_col  else "",
            "reverse_charge":  _to_str(row.get(rc_col,   ""))  if rc_col   else "",
            "invoice_type":    _to_str(row.get(type_col, ""))  if type_col else "",
            "rate":            _to_num(row.get(rate_col,  0))  if rate_col else 0.0,
            "trade_name":      "", "itc_availability": "", "filing_date": "",
            "source":          "books",
            "is_duplicate":    is_duplicate,
        })
    logger.info("Books: parsed %d invoices (%d duplicates)", len(records), sum(1 for r in records if r["is_duplicate"]))
    return pd.DataFrame(records)

# ─── PARSE PORTAL (v1 preserved + duplicate + amendment flags) ───────────────

def _parse_portal(file_bytes, filename):
    ext    = filename.rsplit(".", 1)[-1].lower()
    engine = "xlrd" if ext == "xls" else "openpyxl"
    try:
        xl = pd.ExcelFile(io.BytesIO(file_bytes), engine=engine)
    except Exception as exc:
        raise HTTPException(400, f"Cannot open GST Portal file: {exc}")

    sheet = next((s for s in xl.sheet_names if s.strip().upper() == "B2B"), None) or xl.sheet_names[0]
    logger.info("Portal: using sheet '%s'", sheet)
    raw = pd.read_excel(xl, sheet_name=sheet, header=None, dtype=str)

    upper_idx = -1
    for i in range(min(15, len(raw))):
        cell = _to_str(raw.iloc[i, 0]).lower()
        if "gstin" in cell and "supplier" in cell:
            upper_idx = i; break
    if upper_idx == -1:
        upper_idx = 4
    sub_idx  = upper_idx + 1
    data_idx = upper_idx + 2

    upper_row = [_to_str(raw.iloc[upper_idx, c]) if c < len(raw.columns) else "" for c in range(len(raw.columns))]
    sub_row   = [_to_str(raw.iloc[sub_idx,   c]) if c < len(raw.columns) else "" for c in range(len(raw.columns))]
    combined  = [sub if sub else up for sub, up in zip(sub_row, upper_row)]

    COL_GSTIN=0; COL_NAME=1; COL_INVNO=2; COL_TYPE=3; COL_DATE=4
    COL_VALUE=5; COL_POS=6;  COL_RC=7;   COL_TAXABLE=8
    COL_IGST=9;  COL_CGST=10; COL_SGST=11; COL_CESS=12

    def _named_col(*keys):
        for k in keys:
            for idx, h in enumerate(combined):
                if k.lower() in h.lower():
                    return idx
        return None

    inv_no_idx  = _named_col("invoice number","invoice no") or COL_INVNO
    date_idx    = _named_col("invoice date")                or COL_DATE
    val_idx     = _named_col("invoice value")               or COL_VALUE
    pos_idx     = _named_col("place of supply")             or COL_POS
    rc_idx      = _named_col("reverse charge","supply attract") or COL_RC
    taxable_idx = _named_col("taxable value")               or COL_TAXABLE
    igst_idx    = _named_col("integrated tax")              or COL_IGST
    cgst_idx    = _named_col("central tax")                 or COL_CGST
    sgst_idx    = _named_col("state/ut tax","state tax")    or COL_SGST
    cess_idx    = _named_col("cess")                        or COL_CESS
    itc_idx     = _named_col("itc availability","itc avail")
    filing_idx  = _named_col("filing date","gstr-1/1a/iff")
    amend_idx   = _named_col("amendment","amended")   # NEW

    records   = []
    seen_keys = set()
    for i in range(data_idx, len(raw)):
        row = raw.iloc[i]
        def _cell(idx):
            if idx is None or idx >= len(row): return ""
            v = row.iloc[idx]
            if v is None or (isinstance(v, float) and np.isnan(v)): return ""
            return str(v).strip()
        gstin  = _normalise_gstin(_cell(COL_GSTIN))
        inv_no = _normalise_invoice(_cell(inv_no_idx))
        if not gstin or not inv_no or len(gstin) < 10: continue
        if "GSTIN" in gstin.upper() and "SUPPLIER" in gstin.upper(): continue
        dup_key      = f"{gstin}__{inv_no}"
        is_duplicate = dup_key in seen_keys
        seen_keys.add(dup_key)
        records.append({
            "gstin":            gstin,
            "invoice_no":       inv_no,
            "invoice_no_raw":   _cell(inv_no_idx),
            "invoice_date":     _cell(date_idx),
            "invoice_value":    _to_num(_cell(val_idx)),
            "taxable_value":    _to_num(_cell(taxable_idx)),
            "igst":             _to_num(_cell(igst_idx)),
            "cgst":             _to_num(_cell(cgst_idx)),
            "sgst":             _to_num(_cell(sgst_idx)),
            "cess":             _to_num(_cell(cess_idx)),
            "place_of_supply":  _cell(pos_idx),
            "reverse_charge":   _cell(rc_idx),
            "invoice_type":     _cell(COL_TYPE),
            "rate":             0.0,
            "trade_name":       _cell(COL_NAME),
            "itc_availability": _cell(itc_idx)    if itc_idx    else "",
            "filing_date":      _cell(filing_idx) if filing_idx else "",
            "is_amended":       bool(_cell(amend_idx)) if amend_idx else False,  # NEW
            "source":           "portal",
            "is_duplicate":     is_duplicate,  # NEW
        })
    logger.info("Portal: parsed %d invoices (%d duplicates)", len(records), sum(1 for r in records if r["is_duplicate"]))
    return pd.DataFrame(records)

# ─── RECONCILIATION ENGINE (v2 — extends v1) ─────────────────────────────────

def _reconcile(portal_df, books_df, tolerance=TOLERANCE, fuzzy_threshold=0.80, enable_fuzzy=True):
    if portal_df.empty and books_df.empty:
        raise HTTPException(400, "Both files produced no parseable invoice data.")

    portal_records = portal_df.to_dict("records") if not portal_df.empty else []
    books_records  = books_df.to_dict("records")  if not books_df.empty else []

    portal_map = {}
    books_map  = {}
    for r in portal_records:
        portal_map.setdefault(f"{r['gstin']}__{r['invoice_no']}", r)
    for r in books_records:
        books_map.setdefault(f"{r['gstin']}__{r['invoice_no']}", r)

    # Fuzzy lookup: gstin → list of book records
    fuzzy_books: Dict[str, list] = {}
    if enable_fuzzy:
        for r in books_records:
            fuzzy_books.setdefault(r["gstin"], []).append(r)

    matched=[];  partial=[];  portal_only=[];  books_only=[];  fuzzy_matched=[]
    books_matched_keys = set()

    for key in set(portal_map) | set(books_map):
        in_portal = key in portal_map
        in_books  = key in books_map

        if in_portal and in_books:
            p = portal_map[key]; b = books_map[key]
            books_matched_keys.add(key)
            val_diff = abs(p["invoice_value"] - b["invoice_value"])
            tax_diff = abs((p["igst"]+p["cgst"]+p["sgst"])-(b["igst"]+b["cgst"]+b["sgst"]))
            taxable_diff = abs(p.get("taxable_value",0) - b.get("taxable_value",0))
            # Check reverse charge flag difference (metadata, not financial)
            rc_p = _to_str(p.get("reverse_charge","")).upper()
            rc_b = _to_str(b.get("reverse_charge","")).upper()
            rc_mismatch = bool(rc_p and rc_b and rc_p != rc_b)
            if val_diff <= tolerance and tax_diff <= tolerance:
                # Financially matched — even if RC flag differs, route to matched
                matched.append({"portal":p,"books":b,"key":key,"status":"matched",
                                "rc_mismatch": rc_mismatch,
                                "itc_eligibility":_itc_eligibility(p),
                                "is_amended":p.get("is_amended",False)})
            else:
                partial.append({"portal":p,"books":b,"key":key,"status":"mismatch",
                                "value_diff": round(p["invoice_value"]-b["invoice_value"],2),
                                "tax_diff":   round((p["igst"]+p["cgst"]+p["sgst"])-(b["igst"]+b["cgst"]+b["sgst"]),2),
                                "rc_mismatch": rc_mismatch,
                                "mismatch_reason":  _detect_mismatch_reason(p,b,tolerance),
                                "suggested_action": _suggest_correction(p,b),
                                "itc_eligibility":  _itc_eligibility(p)})

        elif in_portal:
            p = portal_map[key]
            fuzzy_hit = None
            if enable_fuzzy:
                for br in fuzzy_books.get(p["gstin"], []):
                    bkey = f"{br['gstin']}__{br['invoice_no']}"
                    if bkey in books_matched_keys: continue
                    if _fuzzy_invoice_match(p["invoice_no"], br["invoice_no"], fuzzy_threshold):
                        fuzzy_hit = br; books_matched_keys.add(bkey); break
            if fuzzy_hit:
                fuzzy_matched.append({"portal":p,"books":fuzzy_hit,"key":key,"status":"fuzzy_match",
                                      "similarity":round(_fuzzy_similarity(p["invoice_no"],fuzzy_hit["invoice_no"]),3),
                                      "note":"Invoice numbers differ slightly - verify manually"})
            else:
                portal_only.append({"portal":p,"key":key,"status":"missing_in_books",
                                    "itc_eligibility":_itc_eligibility(p)})
        else:
            b = books_map[key]
            if key not in books_matched_keys:
                books_only.append({"books":b,"key":key,"status":"missing_in_gst",
                                   "alert":"Vendor may be non-filer or invoice not in GSTR-1"})

    # Vendor risk aggregation
    vendor_map: Dict[str,list] = {}
    for item in matched+partial+portal_only+books_only+fuzzy_matched:
        src   = item.get("portal") or item.get("books") or {}
        gstin = src.get("gstin","UNKNOWN")
        vendor_map.setdefault(gstin,[]).append({"gstin":gstin,
            "trade_name":src.get("trade_name",""),"status":item.get("status","unknown")})
    vendor_risk = {g: {"gstin":g,"trade_name":next((i.get("trade_name") for i in v if i.get("trade_name")),""),
                       **_compute_vendor_risk(v)} for g,v in vendor_map.items()}
    high_risk = [v for v in vendor_risk.values() if v.get("risk_level")=="high"]

    # Duplicates
    dup_portal = [r for r in portal_records if r.get("is_duplicate")]
    dup_books  = [r for r in books_records  if r.get("is_duplicate")]

    # ITC totals
    itc_eligible = sum((i.get("itc_eligibility") or {}).get("itc_total",0) for i in matched
                       if (i.get("itc_eligibility") or {}).get("eligible"))
    itc_at_risk  = sum((i.get("itc_eligibility") or {}).get("itc_total",0) for i in portal_only
                       if (i.get("itc_eligibility") or {}).get("eligible"))

    def _sv(items,src): return round(sum((i.get(src) or {}).get("invoice_value",0) for i in items),2)
    def _st(items,src): return round(sum((i.get(src) or {}).get("igst",0)+(i.get(src) or {}).get("cgst",0)+(i.get(src) or {}).get("sgst",0) for i in items),2)

    summary = {
        "total_portal":len(portal_map),"total_books":len(books_map),
        "matched_count":len(matched),"mismatch_count":len(partial),
        "portal_only_count":len(portal_only),"books_only_count":len(books_only),
        "fuzzy_matched_count":len(fuzzy_matched),
        "duplicate_portal":len(dup_portal),"duplicate_books":len(dup_books),
        "high_risk_vendors":len(high_risk),
        "matched_value":_sv(matched,"portal"),"mismatch_value":_sv(partial,"portal"),
        "portal_only_value":_sv(portal_only,"portal"),"books_only_value":_sv(books_only,"books"),
        "matched_tax":_st(matched,"portal"),"mismatch_tax":_st(partial,"portal"),
        "portal_only_tax":_st(portal_only,"portal"),"books_only_tax":_st(books_only,"books"),
        "itc_eligible_total":round(itc_eligible,2),"itc_at_risk_total":round(itc_at_risk,2),
        "tolerance_used":tolerance,"fuzzy_enabled":enable_fuzzy,"fuzzy_threshold":fuzzy_threshold,
    }
    return {"summary":summary,"matched":matched,"mismatch":partial,
            "portal_only":portal_only,"books_only":books_only,
            "fuzzy_matched":fuzzy_matched,"vendor_risk":vendor_risk,
            "high_risk_vendors":high_risk,
            "duplicate_invoices":{"portal":dup_portal,"books":dup_books}}

# ─── AUDIT LOGGER (NEW) ───────────────────────────────────────────────────────

async def _log_audit(action, user, details):
    try:
        await db.gst_audit_logs.insert_one({
            "_id":str(uuid.uuid4()),"action":action,
            "user_id":user.id,"user_name":getattr(user,"full_name",""),
            "timestamp":_now(),"details":details,
        })
    except Exception as exc:
        logger.warning("Audit log write failed: %s", exc)

# ─── PYDANTIC SCHEMAS ─────────────────────────────────────────────────────────

class ReconciliationSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str; period: Optional[str]=None; portal_filename: str; books_filename: str
    created_at: datetime; created_by: str; created_by_name: Optional[str]=None
    summary: Dict[str,Any]=Field(default_factory=dict)

class SessionSaveBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period: Optional[str]=None; client_id: Optional[str]=None
    client_name: Optional[str]=None; client_gstin: Optional[str]=None
    portal_filename: str=""; books_filename: str=""
    summary: Dict[str,Any]=Field(default_factory=dict)

class GSTR3BBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period: Optional[str]=None; client_id: Optional[str]=None; client_name: Optional[str]=None
    gstr3b_igst: float=0.0; gstr3b_cgst: float=0.0; gstr3b_sgst: float=0.0
    gstr2b_igst: float=0.0; gstr2b_cgst: float=0.0; gstr2b_sgst: float=0.0

class ITCReversalBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period: str; reversal_reason: str; client_id: Optional[str]=None; notes: Optional[str]=None
    igst_reversed: float=0.0; cgst_reversed: float=0.0; sgst_reversed: float=0.0

class VendorCommunicationBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    gstin: str; trade_name: Optional[str]=None
    issues: List[str]=Field(default_factory=list); period: Optional[str]=None

# ─── ENDPOINTS ────────────────────────────────────────────────────────────────

@router.get("/clients")
async def list_clients_for_gst(current_user: User=Depends(get_current_user)):
    """Return clients list for GST client-selector. Respects permission filter."""
    query = build_client_query(current_user)
    docs  = await db.clients.find({**query},
        {"_id":0,"id":1,"company_name":1,"gstin":1,"phone":1,"email":1,
         "address":1,"city":1,"state":1,"pan":1,"gst_treatment":1,"contact_persons":1},
    ).sort("company_name",1).to_list(2000)
    return {"clients": docs}


@router.post("/save-session")
async def save_session_from_frontend(body: SessionSaveBody, current_user: User=Depends(get_current_user)):
    """Persist a reconciliation session run in browser."""
    client_name=body.client_name or ""; client_gstin=body.client_gstin or ""
    if body.client_id and (not client_name or not client_gstin):
        doc = await db.clients.find_one({"id":body.client_id},{"_id":0,"company_name":1,"gstin":1})
        if doc:
            client_name  = client_name  or doc.get("company_name","")
            client_gstin = client_gstin or doc.get("gstin","")
    sid = str(uuid.uuid4())
    doc = {"_id":sid,"id":sid,"period":body.period,"client_id":body.client_id,
           "client_name":client_name,"client_gstin":client_gstin,
           "portal_filename":body.portal_filename,"books_filename":body.books_filename,
           "created_at":_now(),"created_by":current_user.id,
           "created_by_name":getattr(current_user,"full_name",""),"summary":body.summary}
    await db.gst_reconciliation_sessions.insert_one(doc)
    await _log_audit("save_session", current_user, {"session_id":sid,"client":client_name})
    return {"session_id":sid,"created_at":doc["created_at"]}


@router.post("/reconcile")
async def reconcile_files(
    background_tasks: BackgroundTasks,
    portal_file: UploadFile=File(...), books_file: UploadFile=File(...),
    period:          Optional[str]=Form(None),
    save_session:    bool =Form(False),
    tolerance:       float=Form(TOLERANCE),
    enable_fuzzy:    bool =Form(True),
    fuzzy_threshold: float=Form(0.80),
    current_user: User=Depends(get_current_user),
):
    """Reconcile GSTR-2B vs Purchase Register with AI insights, fuzzy matching & ITC analysis."""
    pb = await portal_file.read(); bb = await books_file.read()
    for name,data in [(portal_file.filename,pb),(books_file.filename,bb)]:
        if len(data) > 20*1024*1024:
            raise HTTPException(400, f"File '{name}' exceeds 20 MB limit.")
    portal_df = _parse_portal(pb, portal_file.filename or "portal.xlsx")
    books_df  = _parse_books( bb, books_file.filename  or "books.xls")
    result    = _reconcile(portal_df, books_df,
                           tolerance=tolerance, enable_fuzzy=enable_fuzzy, fuzzy_threshold=fuzzy_threshold)
    if save_session:
        sid = str(uuid.uuid4())
        await db.gst_reconciliation_sessions.insert_one({
            "_id":sid,"id":sid,"period":period,
            "portal_filename":portal_file.filename or "","books_filename":books_file.filename or "",
            "created_at":_now(),"created_by":current_user.id,
            "created_by_name":getattr(current_user,"full_name",""),"summary":result["summary"]})
        result["session_id"] = sid
    background_tasks.add_task(_log_audit,"reconcile",current_user,
        {"period":period,"portal":portal_file.filename,"books":books_file.filename,"summary":result["summary"]})
    return result


# ─── GSTR-3B vs 2B (NEW) ──────────────────────────────────────────────────────

@router.post("/gstr3b-vs-2b")
async def gstr3b_vs_2b(body: GSTR3BBody, current_user: User=Depends(get_current_user)):
    """Compare GSTR-3B ITC vs GSTR-2B auto-populated data. Returns variance + alerts."""
    di = round(body.gstr2b_igst-body.gstr3b_igst,2)
    dc = round(body.gstr2b_cgst-body.gstr3b_cgst,2)
    ds = round(body.gstr2b_sgst-body.gstr3b_sgst,2)
    td = round(di+dc+ds,2)
    alerts=[]
    if abs(td)>100: alerts.append(f"Significant ITC variance of Rs.{abs(td):,.2f} detected")
    if di<0: alerts.append(f"IGST claimed in 3B exceeds 2B by Rs.{abs(di):,.2f} - reversal may be needed")
    if dc<0: alerts.append(f"CGST claimed in 3B exceeds 2B by Rs.{abs(dc):,.2f} - reversal may be needed")
    if ds<0: alerts.append(f"SGST claimed in 3B exceeds 2B by Rs.{abs(ds):,.2f} - reversal may be needed")
    rid = str(uuid.uuid4())
    await db.gst_reconciliation_sessions.insert_one({
        "_id":rid,"id":rid,"type":"gstr3b_vs_2b","period":body.period,
        "client_id":body.client_id,"client_name":body.client_name,
        "gstr3b":{"igst":body.gstr3b_igst,"cgst":body.gstr3b_cgst,"sgst":body.gstr3b_sgst},
        "gstr2b":{"igst":body.gstr2b_igst,"cgst":body.gstr2b_cgst,"sgst":body.gstr2b_sgst},
        "variance":{"igst":di,"cgst":dc,"sgst":ds,"total":td},
        "alerts":alerts,"created_by":current_user.id,"created_at":_now()})
    return {"record_id":rid,"gstr3b":{"igst":body.gstr3b_igst,"cgst":body.gstr3b_cgst,"sgst":body.gstr3b_sgst},
            "gstr2b":{"igst":body.gstr2b_igst,"cgst":body.gstr2b_cgst,"sgst":body.gstr2b_sgst},
            "variance":{"igst":di,"cgst":dc,"sgst":ds,"total":td},
            "alerts":alerts,"requires_reversal":td < -100}


# ─── ITC REVERSAL (NEW) ───────────────────────────────────────────────────────

@router.post("/itc-reversal")
async def record_itc_reversal(body: ITCReversalBody, current_user: User=Depends(get_current_user)):
    """Record an ITC reversal entry."""
    total = round(body.igst_reversed+body.cgst_reversed+body.sgst_reversed,2)
    rid   = str(uuid.uuid4())
    await db.gst_reconciliation_sessions.insert_one({
        "_id":rid,"id":rid,"type":"itc_reversal","period":body.period,"client_id":body.client_id,
        "reversal_reason":body.reversal_reason,"igst_reversed":body.igst_reversed,
        "cgst_reversed":body.cgst_reversed,"sgst_reversed":body.sgst_reversed,
        "total_reversed":total,"notes":body.notes,"created_by":current_user.id,"created_at":_now()})
    await _log_audit("itc_reversal",current_user,{"period":body.period,"total":total})
    return {"record_id":rid,"total_reversed":total}


@router.get("/itc-reversals")
async def list_itc_reversals(client_id: Optional[str]=Query(None),
    skip:int=Query(0,ge=0), limit:int=Query(20,ge=1,le=100),
    current_user: User=Depends(get_current_user)):
    """List ITC reversal entries."""
    query: dict = {"type":"itc_reversal"}
    if client_id: query["client_id"]=client_id
    docs  = await db.gst_reconciliation_sessions.find(query,{"_id":0}).sort("created_at",-1).skip(skip).limit(limit).to_list(limit)
    total = await db.gst_reconciliation_sessions.count_documents(query)
    return {"reversals":docs,"total":total}


# ─── VENDOR RISK (NEW) ────────────────────────────────────────────────────────

@router.get("/vendor-risk")
async def get_vendor_risk_profiles(
    skip:int=Query(0,ge=0), limit:int=Query(50,ge=1,le=200),
    risk_level: Optional[str]=Query(None),
    current_user: User=Depends(get_current_user)):
    """Return saved vendor risk profiles."""
    query: dict = {}
    if risk_level: query["risk_level"]=risk_level
    docs  = await db.gst_vendor_profiles.find(query,{"_id":0}).sort("risk_score",-1).skip(skip).limit(limit).to_list(limit)
    total = await db.gst_vendor_profiles.count_documents(query)
    return {"vendors":docs,"total":total}


# ─── VENDOR COMMUNICATION (NEW) ───────────────────────────────────────────────

@router.post("/vendor-communication")
async def generate_vendor_communication(body: VendorCommunicationBody, current_user: User=Depends(get_current_user)):
    """Generate exportable vendor discrepancy notice template."""
    vendor_name = body.trade_name or body.gstin
    period_str  = body.period or "the current period"
    issues_text = "\n".join(f"  {i+1}. {issue}" for i,issue in enumerate(body.issues)) or "  1. Invoice details do not match between GSTR-2B and books."
    template = f"""GSTIN Reconciliation - Discrepancy Notice
==========================================
Date: {_now().strftime('%d %B %Y')}
To: {vendor_name} ({body.gstin})
Period: {period_str}

Dear Vendor,

During GSTR-2B reconciliation for {period_str}, we identified discrepancies:

{issues_text}

Request for Action:
  * Verify the above invoices and file amendments in GSTR-1 if applicable.
  * Ensure all B2B invoices are correctly reported to avoid ITC mismatch.
  * Respond within 7 working days.

Regards,
{getattr(current_user,'full_name','Accounts Team')}
==========================================
"""
    return {"template":template,"gstin":body.gstin,"vendor":vendor_name}


# ─── HISTORY (v1 preserved) ───────────────────────────────────────────────────

@router.get("/history")
async def get_history(skip:int=Query(0,ge=0), limit:int=Query(20,ge=1,le=100),
    current_user: User=Depends(get_current_user)):
    """Return saved reconciliation sessions (most recent first)."""
    query={"type":{"$exists":False}}
    sessions = await db.gst_reconciliation_sessions.find(query,{"_id":0}).sort("created_at",-1).skip(skip).limit(limit).to_list(limit)
    total    = await db.gst_reconciliation_sessions.count_documents(query)
    return {"sessions":sessions,"total":total}


@router.get("/history/{session_id}")
async def get_session(session_id:str, current_user: User=Depends(get_current_user)):
    doc = await db.gst_reconciliation_sessions.find_one({"id":session_id},{"_id":0})
    if not doc: raise HTTPException(404,"Session not found")
    return doc


@router.delete("/history/{session_id}")
async def delete_session(session_id:str, current_user: User=Depends(get_current_user)):
    doc = await db.gst_reconciliation_sessions.find_one({"id":session_id},{"_id":0,"created_by":1})
    if not doc: raise HTTPException(404,"Session not found")
    if current_user.role!="admin" and doc.get("created_by")!=current_user.id:
        raise HTTPException(403,"Not authorised to delete this session")
    await db.gst_reconciliation_sessions.delete_one({"id":session_id})
    await _log_audit("delete_session",current_user,{"session_id":session_id})
    return {"deleted":True}


# ─── AUDIT LOG (NEW) ──────────────────────────────────────────────────────────

@router.get("/audit-log")
async def get_audit_log(skip:int=Query(0,ge=0), limit:int=Query(50,ge=1,le=200),
    current_user: User=Depends(get_current_user)):
    """Return GST audit log (admin only)."""
    if current_user.role!="admin": raise HTTPException(403,"Admin only")
    logs  = await db.gst_audit_logs.find({},{"_id":0}).sort("timestamp",-1).skip(skip).limit(limit).to_list(limit)
    total = await db.gst_audit_logs.count_documents({})
    return {"logs":logs,"total":total}


# ─── DASHBOARD SUMMARY (NEW) ──────────────────────────────────────────────────

@router.get("/dashboard-summary")
async def dashboard_summary(current_user: User=Depends(get_current_user)):
    """Aggregated stats for the GST dashboard."""
    total_sessions = await db.gst_reconciliation_sessions.count_documents({"type":{"$exists":False}})
    recent = await db.gst_reconciliation_sessions.find(
        {"type":{"$exists":False},"summary":{"$exists":True}},
        {"_id":0,"period":1,"summary":1,"created_at":1}
    ).sort("created_at",-1).limit(5).to_list(5)
    total_high_risk = await db.gst_vendor_profiles.count_documents({"risk_level":"high"})
    total_reversals = await db.gst_reconciliation_sessions.count_documents({"type":"itc_reversal"})
    return {"total_sessions":total_sessions,"total_high_risk_vendors":total_high_risk,
            "total_itc_reversals":total_reversals,"recent_sessions":recent}


# ─── INDEXES (extended) ───────────────────────────────────────────────────────

async def create_gst_reconciliation_indexes():
    try:
        await db.gst_reconciliation_sessions.create_index("id",         unique=True, background=True)
        await db.gst_reconciliation_sessions.create_index("created_by", background=True)
        await db.gst_reconciliation_sessions.create_index("created_at", background=True)
        await db.gst_reconciliation_sessions.create_index("type",       background=True)
        await db.gst_reconciliation_sessions.create_index("client_id",  background=True)
        await db.gst_audit_logs.create_index("timestamp",  background=True)
        await db.gst_audit_logs.create_index("user_id",    background=True)
        await db.gst_vendor_profiles.create_index("gstin",      unique=True, background=True)
        await db.gst_vendor_profiles.create_index("risk_level", background=True)
        await db.gst_vendor_profiles.create_index("risk_score", background=True)
        logger.info("GST Reconciliation indexes ensured (v2)")
    except Exception as exc:
        logger.warning("GST Reconciliation index creation: %s", exc)
