"""
GST Reconciliation Module
=========================
Reconciles purchase data from Books of Account (GSTR-2 offline tool .xls/.xlsx)
against GSTR-2B downloads from the GST Portal (.xlsx).

Matching key  : GSTIN  +  normalised Invoice Number
Tolerance     : ₹1.00 rounding difference on invoice value / tax totals

Collections used:
  gst_reconciliation_sessions  — saved reconciliation session metadata
  gst_reconciliation_results   — per-session line-item results (optional save)
"""

import io
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field, ConfigDict

from backend.dependencies import db, get_current_user
from backend.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/gst-reconciliation", tags=["gst-reconciliation"])

IST        = ZoneInfo("Asia/Kolkata")
TOLERANCE  = 1.01   # ₹ tolerance for invoice value / tax comparison


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(IST)


def _to_str(val: Any) -> str:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return ""
    return str(val).strip()


def _to_num(val: Any) -> float:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return 0.0
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _normalise_invoice(val: Any) -> str:
    """
    Normalise an invoice number for matching:
      - Purely numeric → strip leading zeros  (e.g. "0060134" → "60134")
      - ALPHA_PREFIX + separator + NUMBER      (e.g. "SW-60134", "INV/60134")
        → strip the alphabetic prefix and treat as numeric  → "60134"
      - Anything else → uppercase + trim (exact match required)

    This handles the common case where the GST portal stores the vendor's
    full invoice number (e.g. "SW-60134") while the purchase register
    stores only the numeric part ("60134").
    """
    s = _to_str(val).upper().replace(" ", "")
    if s.isdigit():
        return s.lstrip("0") or "0"
    # Handle "ALPHA-NUMBER" or "ALPHA/NUMBER" patterns (e.g. SW-60134, INV/1234)
    for sep in ("-", "/"):
        if sep in s:
            prefix, _, suffix = s.partition(sep)
            if prefix.isalpha() and suffix.isdigit():
                return suffix.lstrip("0") or "0"
    return s


def _normalise_gstin(val: Any) -> str:
    return _to_str(val).upper()


def _find_header_row(df_raw: pd.DataFrame) -> int:
    """
    Scan up to 15 rows to find the row whose first non-null cell contains 'GSTIN'.
    Returns the integer row index, or -1 if not found.
    """
    for i in range(min(15, len(df_raw))):
        for c in range(min(5, len(df_raw.columns))):
            cell = _to_str(df_raw.iloc[i, c]).lower()
            if "gstin" in cell and ("supplier" in cell or "gstin" == cell[:5]):
                return i
    return -1


# ─────────────────────────────────────────────────────────────────────────────
# PARSE BOOKS / PURCHASE REGISTER  (GSTR-2 offline tool format)
# Sheet: b2b
#   Row 0  : summary header
#   Row 1  : summary values
#   Row 2  : column headers
#   Row 3+ : data
# ─────────────────────────────────────────────────────────────────────────────

def _parse_books(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower()
    engine = "xlrd" if ext == "xls" else "openpyxl"

    try:
        xl = pd.ExcelFile(io.BytesIO(file_bytes), engine=engine)
    except Exception as exc:
        raise HTTPException(400, f"Cannot open Books file: {exc}")

    # Find the 'b2b' sheet (case-insensitive)
    sheet = next((s for s in xl.sheet_names if s.strip().lower() == "b2b"), None)
    if sheet is None:
        sheet = xl.sheet_names[0]
    logger.info("Books: using sheet '%s'", sheet)

    raw = pd.read_excel(xl, sheet_name=sheet, header=None, dtype=str)

    header_idx = _find_header_row(raw)
    if header_idx == -1:
        header_idx = 2  # fallback

    df = pd.read_excel(
        io.BytesIO(file_bytes),
        sheet_name=sheet,
        engine=engine,
        header=header_idx,
        dtype=str,
    )

    # Normalise column names → lowercase strip
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

    records = []
    for _, row in df.iterrows():
        gstin  = _normalise_gstin(row.get(gstin_col, ""))
        inv_no = _normalise_invoice(row.get(inv_no_col, ""))

        if not gstin or not inv_no or len(gstin) < 10:
            continue
        if gstin in ("GSTIN OF SUPPLIER",):
            continue

        records.append({
            "gstin":          gstin,
            "invoice_no":     inv_no,
            "invoice_no_raw": _to_str(row.get(inv_no_col, "")),
            "invoice_date":   _to_str(row.get(date_col, "")) if date_col else "",
            "invoice_value":  _to_num(row.get(val_col, 0))  if val_col else 0.0,
            "taxable_value":  _to_num(row.get(tax_col, 0))  if tax_col else 0.0,
            "igst":           _to_num(row.get(igst_col, 0)) if igst_col else 0.0,
            "cgst":           _to_num(row.get(cgst_col, 0)) if cgst_col else 0.0,
            "sgst":           _to_num(row.get(sgst_col, 0)) if sgst_col else 0.0,
            "cess":           _to_num(row.get(cess_col, 0)) if cess_col else 0.0,
            "place_of_supply": _to_str(row.get(pos_col, ""))  if pos_col else "",
            "reverse_charge":  _to_str(row.get(rc_col, ""))   if rc_col else "",
            "invoice_type":    _to_str(row.get(type_col, "")) if type_col else "",
            "rate":            _to_num(row.get(rate_col, 0))  if rate_col else 0.0,
            "trade_name":      "",
            "itc_availability": "",
            "filing_date":     "",
            "source":          "books",
        })

    logger.info("Books: parsed %d invoices", len(records))
    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# PARSE GST PORTAL FILE  (GSTR-2B Excel download)
# Sheet: B2B
#   Row 4 : upper headers  (GSTIN, Trade Name, Invoice Details merged, ...)
#   Row 5 : sub-headers    (Invoice number, type, date, value, IGST, CGST, ...)
#   Row 6+: data
# ─────────────────────────────────────────────────────────────────────────────

def _parse_portal(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower()
    engine = "xlrd" if ext == "xls" else "openpyxl"

    try:
        xl = pd.ExcelFile(io.BytesIO(file_bytes), engine=engine)
    except Exception as exc:
        raise HTTPException(400, f"Cannot open GST Portal file: {exc}")

    sheet = next((s for s in xl.sheet_names if s.strip().upper() == "B2B"), None)
    if sheet is None:
        sheet = xl.sheet_names[0]
    logger.info("Portal: using sheet '%s'", sheet)

    raw = pd.read_excel(xl, sheet_name=sheet, header=None, dtype=str)

    # Find the row where col 0 says "GSTIN of supplier"
    upper_idx = -1
    for i in range(min(15, len(raw))):
        cell = _to_str(raw.iloc[i, 0]).lower()
        if "gstin" in cell and "supplier" in cell:
            upper_idx = i
            break
    if upper_idx == -1:
        upper_idx = 4  # fallback

    sub_idx  = upper_idx + 1
    data_idx = upper_idx + 2

    # Build combined column-name list from both header rows
    upper_row = [_to_str(raw.iloc[upper_idx, c]) if c < len(raw.columns) else "" for c in range(len(raw.columns))]
    sub_row   = [_to_str(raw.iloc[sub_idx, c])   if c < len(raw.columns) else "" for c in range(len(raw.columns))]
    combined  = [sub if sub else upper for sub, upper in zip(sub_row, upper_row)]

    # Fixed column positions for GSTR-2B format (fallback-safe)
    COL_GSTIN   = 0
    COL_NAME    = 1
    COL_INVNO   = 2
    COL_TYPE    = 3
    COL_DATE    = 4
    COL_VALUE   = 5
    COL_POS     = 6
    COL_RC      = 7
    COL_TAXABLE = 8
    COL_IGST    = 9
    COL_CGST    = 10
    COL_SGST    = 11
    COL_CESS    = 12

    def _named_col(*keys):
        """Try to find column by header name; fallback to the positional default."""
        for k in keys:
            for idx, h in enumerate(combined):
                if k.lower() in h.lower():
                    return idx
        return None

    inv_no_idx   = _named_col("invoice number", "invoice no") or COL_INVNO
    date_idx     = _named_col("invoice date")                  or COL_DATE
    val_idx      = _named_col("invoice value")                 or COL_VALUE
    pos_idx      = _named_col("place of supply")               or COL_POS
    rc_idx       = _named_col("reverse charge", "supply attract") or COL_RC
    taxable_idx  = _named_col("taxable value")                 or COL_TAXABLE
    igst_idx     = _named_col("integrated tax")                or COL_IGST
    cgst_idx     = _named_col("central tax")                   or COL_CGST
    sgst_idx     = _named_col("state/ut tax", "state tax")     or COL_SGST
    cess_idx     = _named_col("cess")                          or COL_CESS
    itc_idx      = _named_col("itc availability", "itc avail")
    filing_idx   = _named_col("filing date", "gstr-1/1a/iff")

    records = []
    for i in range(data_idx, len(raw)):
        row = raw.iloc[i]

        def _cell(idx):
            if idx is None or idx >= len(row):
                return ""
            v = row.iloc[idx]
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return ""
            return str(v).strip()

        gstin  = _normalise_gstin(_cell(COL_GSTIN))
        inv_no = _normalise_invoice(_cell(inv_no_idx))

        if not gstin or not inv_no or len(gstin) < 10:
            continue
        if "GSTIN" in gstin.upper() and "SUPPLIER" in gstin.upper():
            continue

        records.append({
            "gstin":           gstin,
            "invoice_no":      inv_no,
            "invoice_no_raw":  _cell(inv_no_idx),
            "invoice_date":    _cell(date_idx),
            "invoice_value":   _to_num(_cell(val_idx)),
            "taxable_value":   _to_num(_cell(taxable_idx)),
            "igst":            _to_num(_cell(igst_idx)),
            "cgst":            _to_num(_cell(cgst_idx)),
            "sgst":            _to_num(_cell(sgst_idx)),
            "cess":            _to_num(_cell(cess_idx)),
            "place_of_supply": _cell(pos_idx),
            "reverse_charge":  _cell(rc_idx),
            "invoice_type":    _cell(COL_TYPE),
            "rate":            0.0,
            "trade_name":      _cell(COL_NAME),
            "itc_availability": _cell(itc_idx) if itc_idx else "",
            "filing_date":     _cell(filing_idx) if filing_idx else "",
            "source":          "portal",
        })

    logger.info("Portal: parsed %d invoices", len(records))
    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# RECONCILIATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def _reconcile(portal_df: pd.DataFrame, books_df: pd.DataFrame) -> Dict[str, Any]:
    if portal_df.empty and books_df.empty:
        raise HTTPException(400, "Both files produced no parseable invoice data.")

    portal_map: dict = {}
    books_map: dict  = {}

    for _, r in portal_df.iterrows():
        key = f"{r['gstin']}__{r['invoice_no']}"
        portal_map.setdefault(key, r.to_dict())

    for _, r in books_df.iterrows():
        key = f"{r['gstin']}__{r['invoice_no']}"
        books_map.setdefault(key, r.to_dict())

    matched:    list = []
    mismatch:   list = []
    portal_only: list = []
    books_only:  list = []

    all_keys = set(portal_map) | set(books_map)

    for key in all_keys:
        in_portal = key in portal_map
        in_books  = key in books_map

        if in_portal and in_books:
            p = portal_map[key]
            b = books_map[key]
            val_diff = abs(p["invoice_value"] - b["invoice_value"])
            tax_diff = abs(
                (p["igst"] + p["cgst"] + p["sgst"]) -
                (b["igst"] + b["cgst"] + b["sgst"])
            )
            if val_diff <= TOLERANCE and tax_diff <= TOLERANCE:
                matched.append({"portal": p, "books": b, "key": key})
            else:
                mismatch.append({
                    "portal": p, "books": b, "key": key,
                    "value_diff": round(p["invoice_value"] - b["invoice_value"], 2),
                    "tax_diff":   round(
                        (p["igst"] + p["cgst"] + p["sgst"]) -
                        (b["igst"] + b["cgst"] + b["sgst"]), 2
                    ),
                })
        elif in_portal:
            portal_only.append({"portal": portal_map[key], "key": key})
        else:
            books_only.append({"books": books_map[key], "key": key})

    def _sum_val(items, src):
        total = 0.0
        for it in items:
            inv = it.get(src, {})
            total += inv.get("invoice_value", 0.0)
        return round(total, 2)

    def _sum_tax(items, src):
        total = 0.0
        for it in items:
            inv = it.get(src, {})
            total += inv.get("igst", 0) + inv.get("cgst", 0) + inv.get("sgst", 0)
        return round(total, 2)

    summary = {
        "total_portal": len(portal_map),
        "total_books":  len(books_map),
        "matched_count":     len(matched),
        "mismatch_count":    len(mismatch),
        "portal_only_count": len(portal_only),
        "books_only_count":  len(books_only),
        "matched_value":     _sum_val(matched, "portal"),
        "mismatch_value":    _sum_val(mismatch, "portal"),
        "portal_only_value": _sum_val(portal_only, "portal"),
        "books_only_value":  _sum_val(books_only, "books"),
        "matched_tax":     _sum_tax(matched, "portal"),
        "mismatch_tax":    _sum_tax(mismatch, "portal"),
        "portal_only_tax": _sum_tax(portal_only, "portal"),
        "books_only_tax":  _sum_tax(books_only, "books"),
    }

    return {
        "summary":     summary,
        "matched":     matched,
        "mismatch":    mismatch,
        "portal_only": portal_only,
        "books_only":  books_only,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class ReconciliationSession(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id:              str
    period:          Optional[str] = None
    portal_filename: str
    books_filename:  str
    created_at:      datetime
    created_by:      str
    created_by_name: Optional[str] = None
    summary:         Dict[str, Any] = Field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/reconcile")
async def reconcile_files(
    portal_file: UploadFile = File(..., description="GSTR-2B Excel downloaded from GST Portal"),
    books_file:  UploadFile = File(..., description="Purchase Register (GSTR-2 offline tool b2b sheet)"),
    period:      Optional[str] = Form(None, description="Tax period label e.g. 'March 2026'"),
    save_session: bool = Form(False, description="Save this reconciliation to history"),
    current_user: User = Depends(get_current_user),
):
    """
    Upload GSTR-2B (portal) and Purchase Register (books), perform reconciliation
    and return a JSON diff of matched / mismatched / portal-only / books-only invoices.
    Optionally persist the session summary to MongoDB for history.
    """
    portal_bytes = await portal_file.read()
    books_bytes  = await books_file.read()

    # Validate file size (max 20 MB each)
    for name, data in [(portal_file.filename, portal_bytes), (books_file.filename, books_bytes)]:
        if len(data) > 20 * 1024 * 1024:
            raise HTTPException(400, f"File '{name}' exceeds 20 MB limit.")

    portal_df = _parse_portal(portal_bytes, portal_file.filename or "portal.xlsx")
    books_df  = _parse_books(books_bytes,   books_file.filename  or "books.xls")

    result = _reconcile(portal_df, books_df)

    if save_session:
        session_id = str(uuid.uuid4())
        session_doc = {
            "_id":             session_id,
            "id":              session_id,
            "period":          period,
            "portal_filename": portal_file.filename or "",
            "books_filename":  books_file.filename  or "",
            "created_at":      _now(),
            "created_by":      current_user.id,
            "created_by_name": getattr(current_user, "full_name", ""),
            "summary":         result["summary"],
        }
        await db.gst_reconciliation_sessions.insert_one(session_doc)
        result["session_id"] = session_id
        logger.info("Saved GST reconciliation session %s", session_id)

    return result


@router.get("/history")
async def get_history(
    skip:  int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Return saved reconciliation sessions for the current organisation (most recent first)."""
    cursor = (
        db.gst_reconciliation_sessions
        .find({}, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    sessions = await cursor.to_list(limit)
    total = await db.gst_reconciliation_sessions.count_documents({})
    return {"sessions": sessions, "total": total}


@router.get("/history/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Fetch summary of a previously saved reconciliation session."""
    doc = await db.gst_reconciliation_sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Session not found")
    return doc


@router.delete("/history/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a saved reconciliation session (admin or creator only)."""
    doc = await db.gst_reconciliation_sessions.find_one({"id": session_id}, {"_id": 0, "created_by": 1})
    if not doc:
        raise HTTPException(404, "Session not found")
    if current_user.role != "admin" and doc.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorised to delete this session")
    await db.gst_reconciliation_sessions.delete_one({"id": session_id})
    return {"deleted": True}


# ─────────────────────────────────────────────────────────────────────────────
# INDEXES  (call once at startup)
# ─────────────────────────────────────────────────────────────────────────────

async def create_gst_reconciliation_indexes():
    try:
        await db.gst_reconciliation_sessions.create_index("id",         unique=True, background=True)
        await db.gst_reconciliation_sessions.create_index("created_by", background=True)
        await db.gst_reconciliation_sessions.create_index("created_at", background=True)
        logger.info("GST Reconciliation indexes ensured")
    except Exception as exc:
        logger.warning("GST Reconciliation index creation: %s", exc)
