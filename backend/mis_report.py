"""
MIS Report Module
==================
Client-wise Management Information System reports built from the source
documents a CA/CS firm already collects every year:

    - Sales Register        (doc_type = "sales")
    - Purchase Register     (doc_type = "purchase")
    - Bank Statement        (doc_type = "bank_statement")
    - Provisional Balance Sheet (doc_type = "balance_sheet")
    - GST Reports / GSTR-2B-3B (doc_type = "gst_report")

Excel/CSV files are parsed with pandas using flexible (fuzzy) column-name
matching so real-world exports from Tally / Zoho / Busy / GST portal all
work without a rigid template. PDF files (mainly the provisional balance
sheet) are text-scanned with pdfplumber for common line items — these are
returned as *suggestions* that populate the manual-entry form, never
silently overwritten, since balance-sheet layouts vary too much to trust
blindly.

Everything the accountant can't get automatically (depreciation, interest,
tax, opening cash, budgets, bad debts written off, security deposits,
advances to vendors, delayed-payment interest rate) is entered once per
client/period on the Manual Entry tab and merged into every computed
report below.

Six report groups are exposed, matching the MIS spec:
    1. Financial Dashboard      -> GET /api/mis/dashboard
    2. Receivables MIS          -> GET /api/mis/receivables
    3. Payables MIS             -> GET /api/mis/payables
    4. Revenue MIS              -> GET /api/mis/revenue
    5. Expense MIS              -> GET /api/mis/expense
    6. Profitability MIS        -> GET /api/mis/profitability
"""

import io
import re
import uuid
import logging
from datetime import datetime, timezone, date
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user, check_permission, build_client_query
from backend.models import User, ClientCreate
from backend.mis_doc_readers import read_document, ParsedDocument
from backend.mis_gst_parser import parse_gst_tables, gst_summary
from backend.mis_exports import build_pdf_report, build_word_report, build_excel_workbook


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mis", tags=["mis-report"])
IST = ZoneInfo("Asia/Kolkata")

VIEW = check_permission("can_view_mis_report")
MANAGE = check_permission("can_manage_mis_report")

DOC_TYPES = ("sales", "purchase", "bank_statement", "balance_sheet", "gst_report")


def _now():
    return datetime.now(IST)


def _today():
    return datetime.now(IST).date()


# ══════════════════════════════════════════════════════════════════════════
# HELPERS — number / date coercion
# ══════════════════════════════════════════════════════════════════════════

def _num(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return 0.0 if (isinstance(val, float) and np.isnan(val)) else float(val)
    s = str(val).strip().replace(",", "").replace("₹", "").replace("Rs.", "").replace("INR", "")
    if s in ("", "-", "–", "nan", "None", "NA", "N/A"):
        return 0.0
    neg = (s.startswith("(") and s.endswith(")")) or s.endswith("-")
    s = s.strip("()").rstrip("-").strip()
    # bank statements suffix the running balance with Dr / Cr
    m = re.match(r"^(-?\d*\.?\d+)\s*(dr|cr)$", s, re.I)
    if m:
        s = m.group(1)
        if m.group(2).lower() == "dr":
            neg = True
    try:
        v = float(s)
        return -v if neg else v
    except (ValueError, TypeError):
        return 0.0



def _str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and np.isnan(val):
        return ""
    return str(val).strip()


def _parse_date(val) -> Optional[str]:
    """Returns ISO date string (YYYY-MM-DD) or None."""
    if val is None or val == "":
        return None
    try:
        ts = pd.to_datetime(val, dayfirst=True, errors="coerce")
        if pd.isna(ts):
            return None
        return ts.strftime("%Y-%m-%d")
    except Exception:
        return None


def _month_key(iso_date: Optional[str]) -> Optional[str]:
    if not iso_date:
        return None
    return iso_date[:7]  # YYYY-MM


# ══════════════════════════════════════════════════════════════════════════
# HELPERS — column-name fuzzy matching for register uploads
# ══════════════════════════════════════════════════════════════════════════

def _find_col(columns, candidates: List[str]) -> Optional[str]:
    lowered = {str(c).strip().lower(): c for c in columns}
    # exact match first
    for cand in candidates:
        if cand in lowered:
            return lowered[cand]
    # substring match
    for col_lower, original in lowered.items():
        for cand in candidates:
            if cand in col_lower:
                return original
    return None


SALES_PURCHASE_COLS = {
    "date":          ["invoice date", "bill date", "date"],
    "invoice_no":    ["invoice no", "invoice number", "bill no", "voucher no", "invoice#", "inv no"],
    "party_name":    ["party name", "customer name", "vendor name", "supplier name", "party", "customer", "vendor", "ledger name"],
    "taxable_value": ["taxable value", "taxable amount", "basic amount", "net amount", "amount before tax"],
    "tax_amount":    ["tax amount", "gst amount", "total tax", "igst", "cgst+sgst"],
    "total_amount":  ["total amount", "invoice value", "gross amount", "grand total", "bill amount", "total"],
    "status":        ["status", "payment status", "paid status"],
    "due_date":      ["due date", "payment due date"],
    "paid_date":     ["paid on", "payment date", "receipt date", "cleared date"],
    "category":      ["category", "expense category", "head", "nature of expense"],
    "service":       ["service", "item", "particulars", "description", "product"],
    "branch":        ["branch", "location"],
    "partner":       ["partner", "relationship partner", "handled by"],
    "employee":      ["employee", "billed by", "prepared by", "staff"],
}

BANK_COLS = {
    "date":     ["date", "value date", "txn date", "transaction date"],
    "narration": ["narration", "description", "particulars", "details", "remarks"],
    "debit":    ["debit", "withdrawal", "dr"],
    "credit":   ["credit", "deposit", "cr"],
    "balance":  ["balance", "closing balance", "running balance"],
}


def _map_row(row: pd.Series, colmap: Dict[str, Optional[str]]) -> Dict[str, Any]:
    out = {}
    for key, col in colmap.items():
        out[key] = row[col] if col is not None and col in row.index else None
    return out


# ══════════════════════════════════════════════════════════════════════════
# HELPERS — reading the uploaded file into a DataFrame
# ══════════════════════════════════════════════════════════════════════════

def _read_tabular(file_bytes: bytes, filename: str) -> pd.DataFrame:
    name = (filename or "").lower()
    try:
        if name.endswith(".csv") or name.endswith(".tsv"):
            sep = "\t" if name.endswith(".tsv") else None
            return pd.read_csv(io.BytesIO(file_bytes), sep=sep, engine="python", dtype=str)
        # default: excel (.xlsx / .xls)
        xl = pd.ExcelFile(io.BytesIO(file_bytes))
        # pick the sheet with the most columns (usually the data sheet, not a cover sheet)
        best_sheet, best_df = None, None
        for sheet in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet, dtype=str)
            if best_df is None or df.shape[1] > best_df.shape[1]:
                best_sheet, best_df = sheet, df
        return best_df if best_df is not None else pd.DataFrame()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file '{filename}': {e}")


# ══════════════════════════════════════════════════════════════════════════
# HELPERS — universal document reading (Excel / CSV / PDF / Word)
# ══════════════════════════════════════════════════════════════════════════

def _read_any(file_bytes: bytes, filename: str) -> ParsedDocument:
    """Read any supported document into tables + plain text."""
    try:
        return read_document(file_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file '{filename}': {e}")


def _score_table(df: pd.DataFrame, spec: Dict[str, List[str]], weighted: List[str]) -> int:
    """How well a table's headers match a column spec — used to pick the data table."""
    if df is None or df.empty:
        return 0
    score = 0
    for key, cands in spec.items():
        if _find_col(df.columns, cands):
            score += 3 if key in weighted else 1
    return score


def _pick_table(doc: ParsedDocument, spec: Dict[str, List[str]], weighted: List[str],
                min_score: int = 3) -> Optional[pd.DataFrame]:
    """
    A PDF/Excel export usually holds several tables (cover page, summary,
    then the real register). Concatenate every table that matches the
    expected headers so nothing is dropped, instead of reading only one.
    """
    scored = [(_score_table(t, spec, weighted), t) for t in doc.tables]
    scored = [(s, t) for s, t in scored if s >= min_score]
    if not scored:
        return None
    best = max(s for s, _ in scored)
    chosen = [t for s, t in scored if s == best]
    frames = []
    for t in chosen:
        t = t.copy()
        t.columns = [str(c).strip() for c in t.columns]
        frames.append(t)
    if len(frames) == 1:
        return frames[0]
    try:
        return pd.concat(frames, ignore_index=True, sort=False)
    except Exception:
        return frames[0]





# ══════════════════════════════════════════════════════════════════════════
# BEST-EFFORT TEXT FALLBACK — extracts rough transaction rows from plain text
# when no structured table matched the expected schema (e.g. audit PDFs).
# ══════════════════════════════════════════════════════════════════════════

_AMOUNT_RE = re.compile(r"[-+]?(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:cr|dr)?", re.I)
_DATE_VARIANTS = [
    r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}",        # 01/04/2024
    r"\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}",    # 01-Apr-2024
    r"\d{4}[-/]\d{2}[-/]\d{2}",               # 2024-04-01
]
_DATE_RE = re.compile("|".join(_DATE_VARIANTS))


def _text_rows_fallback(text: str, doc_type: str) -> List[Dict[str, Any]]:
    """
    Walk through the plain text of a document line-by-line.
    Any line that contains both a date-like token and at least one rupee
    amount is treated as a transaction row — this handles audit reports,
    non-standard bank PDFs, and multi-column financial statements that
    the table parsers missed.
    """
    rows: List[Dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 10:
            continue
        date_m = _DATE_RE.search(line)
        amounts = _AMOUNT_RE.findall(line)
        amounts_f = []
        for a in amounts:
            try:
                amounts_f.append(float(a.replace(",", "")))
            except ValueError:
                pass
        amounts_f = [a for a in amounts_f if a > 0]
        if not date_m or not amounts_f:
            continue
        date_str = _parse_date(date_m.group())
        # Remove date and amounts from line to get the narration/party text
        narration = _DATE_RE.sub("", line)
        narration = _AMOUNT_RE.sub("", narration).strip(" -|:")

        total = max(amounts_f)
        if doc_type == "bank_statement":
            # Heuristic: first amount = debit if line contains debit keywords
            low = line.lower()
            is_debit = any(k in low for k in ("dr", "debit", "withdrawal", "paid", "payment"))
            rows.append({
                "date": date_str,
                "narration": narration or "—",
                "debit": round(total, 2) if is_debit else 0.0,
                "credit": 0.0 if is_debit else round(total, 2),
                "balance": 0.0,
                "category": _categorize_expense(narration) if is_debit else None,
            })
        else:
            rows.append({
                "date": date_str,
                "invoice_no": "",
                "party_name": narration[:100] if narration else "Extracted",
                "taxable_value": round(total, 2),
                "tax_amount": 0.0,
                "total_amount": round(total, 2),
                "status": "unpaid",
                "due_date": date_str,
                "paid_date": None,
                "category": None,
                "service": None,
                "branch": None,
                "partner": None,
                "employee": None,
            })
    return rows


EXPENSE_KEYWORDS = [
    ("rent", ["rent"]),
    ("employee_expenses", ["salary", "salaries", "payroll", "wages", "bonus", "incentive"]),
    ("travel_expenses", ["travel", "flight", "uber", "ola", "taxi", "cab", "irctc", "railway", "hotel", "airfare"]),
    ("software_subscription_cost", ["subscription", "saas", "software", "aws", "azure", "google cloud", "microsoft", "zoom", "github", "adobe", "license"]),
    ("utility_expenses", ["electricity", "water bill", "utility", "internet", "broadband", "telephone", "mobile bill", "gas bill"]),
    ("marketing_expenses", ["marketing", "advertisement", "advt", "ads", "facebook ads", "google ads", "promotion", "campaign"]),
    ("office_expenses", ["office", "stationery", "courier", "printing"]),
]


def _categorize_expense(narration: str, given_category: str = "") -> str:
    text = f"{given_category} {narration}".lower()
    for key, words in EXPENSE_KEYWORDS:
        for w in words:
            if w in text:
                return key
    return "administrative_expenses"


# ══════════════════════════════════════════════════════════════════════════
# PARSERS — one per doc_type, all return List[dict] transaction rows
# ══════════════════════════════════════════════════════════════════════════

def _best_effort_colmap(df: pd.DataFrame, spec: Dict[str, List[str]]) -> Dict[str, Optional[str]]:
    """
    First pass: strict fuzzy matching via _find_col.
    Second pass: if the required amount/name columns are still missing, scan
    every column for numeric content (amount) or non-numeric text (party name)
    so that real-world PDFs with non-standard headers are not rejected outright.
    """
    colmap = {k: _find_col(df.columns, v) for k, v in spec.items()}
    amount_keys = {"total_amount", "taxable_value"}
    if not any(colmap.get(k) for k in amount_keys):
        # find numeric-heavy columns
        num_cols = []
        for c in df.columns:
            try:
                cleaned = df[c].astype(str).str.replace(r"[,₹\s]", "", regex=True)
                numeric = pd.to_numeric(cleaned, errors="coerce").notna()
                if numeric.sum() > max(2, len(df) * 0.25):
                    num_cols.append(c)
            except Exception:
                pass
        if num_cols:
            if not colmap.get("total_amount"):
                colmap["total_amount"] = num_cols[-1]
            if not colmap.get("taxable_value") and len(num_cols) > 1:
                colmap["taxable_value"] = num_cols[-2]
    if not colmap.get("party_name"):
        # find the most text-like column that isn't already mapped
        mapped = set(v for v in colmap.values() if v)
        for c in df.columns:
            if c in mapped:
                continue
            vals = df[c].astype(str).str.strip()
            non_numeric = vals.apply(lambda x: not re.fullmatch(r"[-+()₹,.\d\s%]+", x) and len(x) > 1)
            if non_numeric.sum() > max(2, len(df) * 0.25):
                colmap["party_name"] = c
                break
    return colmap


def _parse_register(df: pd.DataFrame, doc_type: str) -> List[Dict[str, Any]]:
    if df is None or df.empty:
        return []
    colmap = _best_effort_colmap(df, SALES_PURCHASE_COLS)
    if not colmap["party_name"] and not colmap["total_amount"] and not colmap["taxable_value"]:
        # Nothing usable found — return empty instead of hard-erroring
        logger.warning("MIS: no usable columns found in %s table for %s", doc_type, list(df.columns)[:10])
        return []
    rows = []
    for _, r in df.iterrows():
        mapped = _map_row(r, colmap)
        total_amount = _num(mapped["total_amount"])
        taxable_value = _num(mapped["taxable_value"])
        tax_amount = _num(mapped["tax_amount"])
        if not taxable_value and total_amount:
            taxable_value = round(total_amount - tax_amount, 2) if tax_amount else total_amount
        if not total_amount:
            total_amount = round(taxable_value + tax_amount, 2)
        if not total_amount and not taxable_value:
            continue  # skip fully blank rows
        inv_date = _parse_date(mapped["date"])
        due_date = _parse_date(mapped["due_date"])
        paid_date = _parse_date(mapped["paid_date"])
        status_raw = _str(mapped["status"]).lower()
        if "paid" in status_raw and "unpaid" not in status_raw and "partial" not in status_raw:
            status = "paid"
        elif "partial" in status_raw:
            status = "partial"
        elif "unpaid" in status_raw or "pending" in status_raw or "outstanding" in status_raw or "overdue" in status_raw:
            status = "unpaid"
        else:
            # no explicit status column → assume paid if a paid_date exists, else unpaid
            status = "paid" if paid_date else "unpaid"
        rows.append({
            "date": inv_date,
            "invoice_no": _str(mapped["invoice_no"]),
            "party_name": _str(mapped["party_name"]) or "Unspecified",
            "taxable_value": round(taxable_value, 2),
            "tax_amount": round(tax_amount, 2),
            "total_amount": round(total_amount, 2),
            "status": status,
            "due_date": due_date or inv_date,
            "paid_date": paid_date,
            "category": _str(mapped["category"]) or None,
            "service": _str(mapped["service"]) or None,
            "branch": _str(mapped["branch"]) or None,
            "partner": _str(mapped["partner"]) or None,
            "employee": _str(mapped["employee"]) or None,
        })
    return rows


def _parse_bank(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df is None or df.empty:
        return []
    colmap = {k: _find_col(df.columns, v) for k, v in BANK_COLS.items()}
    if not colmap["debit"] and not colmap["credit"]:
        # Best-effort: look for numeric columns that could be debit/credit
        mapped = set(v for v in colmap.values() if v)
        num_cols = []
        for c in df.columns:
            if c in mapped:
                continue
            try:
                cleaned = df[c].astype(str).str.replace(r"[,₹\s]", "", regex=True)
                numeric = pd.to_numeric(cleaned, errors="coerce").notna()
                if numeric.sum() > max(2, len(df) * 0.2):
                    num_cols.append(c)
            except Exception:
                pass
        if num_cols:
            colmap["debit"] = num_cols[0]
            if len(num_cols) > 1:
                colmap["credit"] = num_cols[1]
        else:
            logger.warning("MIS: no debit/credit columns found in bank statement, columns: %s", list(df.columns)[:10])
            return []
    # PDF statements often split the narration across a cheque-no / reference
    # column; fold every unmapped text column back into the narration so
    # expense categorisation sees the whole line.
    mapped_cols = {c for c in colmap.values() if c is not None}
    extra_cols = [c for c in df.columns if c not in mapped_cols]
    rows = []
    for _, r in df.iterrows():
        mapped = _map_row(r, colmap)
        debit = _num(mapped["debit"])
        credit = _num(mapped["credit"])
        if not debit and not credit:
            continue
        parts = [_str(mapped["narration"])]
        for c in extra_cols:
            v = _str(r[c])
            if v and _num(v) == 0 and not re.fullmatch(r"[\d.,\-]+", v):
                parts.append(v)
        narration = " ".join(p for p in parts if p).strip()
        rows.append({
            "date": _parse_date(mapped["date"]),
            "narration": narration,
            "debit": round(debit, 2),
            "credit": round(credit, 2),
            "balance": _num(mapped["balance"]),
            "category": _categorize_expense(narration) if debit else None,
        })
    return rows



BS_PATTERNS = {
    "cash_bank_balance": [r"cash\s*(?:&|and)?\s*bank\s*balance", r"cash\s*&\s*bank", r"cash\s*in\s*hand"],
    "accounts_receivable": [r"sundry\s*debtors", r"trade\s*receivables", r"accounts?\s*receivable"],
    "accounts_payable": [r"sundry\s*creditors", r"trade\s*payables", r"accounts?\s*payable"],
    "total_revenue": [r"total\s*revenue", r"revenue\s*from\s*operations", r"total\s*income", r"net\s*sales"],
    "total_expenses": [r"total\s*expenses", r"total\s*expenditure"],
    "depreciation_amortization": [r"depreciation", r"amortisation", r"amortization"],
    "interest_expense": [r"interest\s*(?:expense|paid|on\s*loan)"],
    "tax_expense": [r"provision\s*for\s*tax", r"income\s*tax", r"tax\s*expense"],
}


def _parse_balance_sheet_pdf(file_bytes: bytes) -> Dict[str, float]:
    try:
        import pdfplumber
    except ImportError:
        return {}
    text_lines: List[str] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ""
                text_lines.extend(t.splitlines())
    except Exception as e:
        logger.warning(f"MIS: could not read balance sheet PDF: {e}")
        return {}

    amount_re = re.compile(r"([\d,]+(?:\.\d+)?)")
    suggestions: Dict[str, float] = {}
    for line in text_lines:
        low = line.lower()
        for field, patterns in BS_PATTERNS.items():
            if field in suggestions:
                continue
            for p in patterns:
                if re.search(p, low):
                    nums = amount_re.findall(line.replace(",", ","))
                    nums = [n.replace(",", "") for n in amount_re.findall(line)]
                    nums = [n for n in nums if n]
                    if nums:
                        try:
                            suggestions[field] = float(nums[-1])
                        except ValueError:
                            pass
                    break
    return suggestions


def _parse_balance_sheet_doc(doc: ParsedDocument) -> Dict[str, float]:
    """
    Read a provisional balance sheet from any format. Ruled tables (Excel,
    Word, PDF) are matched head-by-head; whatever the tables miss is filled
    from a plain-text scan of the same document.
    """
    suggestions: Dict[str, float] = {}

    for table in doc.tables:
        if table is None or table.empty or table.shape[1] < 2:
            continue
        for _, r in table.iterrows():
            cells = [_str(v) for v in r.tolist()]
            label = " ".join(c for c in cells[:1] if c).lower() or " ".join(cells).lower()
            amounts = [_num(c) for c in cells[1:] if _num(c)]
            if not amounts:
                continue
            for field, patterns in BS_PATTERNS.items():
                if field in suggestions:
                    continue
                if any(re.search(p, label) for p in patterns):
                    suggestions[field] = amounts[-1]
                    break

    if len(suggestions) < len(BS_PATTERNS):
        amount_re = re.compile(r"([\d,]+(?:\.\d+)?)")
        for line in (doc.text or "").splitlines():
            low = line.lower()
            for field, patterns in BS_PATTERNS.items():
                if field in suggestions:
                    continue
                if any(re.search(p, low) for p in patterns):
                    nums = [n.replace(",", "") for n in amount_re.findall(line)]
                    if nums:
                        try:
                            suggestions[field] = float(nums[-1])
                        except ValueError:
                            pass
                    break
    return suggestions





# ══════════════════════════════════════════════════════════════════════════
# CLIENT SELECTION (reuses the main `clients` collection)
# ══════════════════════════════════════════════════════════════════════════

class QuickClientCreate(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=255)
    client_type: str = "other"
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None


@router.get("/clients", dependencies=[Depends(VIEW)])
async def list_mis_clients(current_user: User = Depends(get_current_user)):
    """Clients available to build an MIS report for (same scoping as Records)."""
    query = build_client_query(current_user)
    cursor = db.clients.find(query, {"_id": 0, "id": 1, "company_name": 1, "client_type": 1, "gstin": 1})
    clients = await cursor.to_list(length=5000)
    clients.sort(key=lambda c: (c.get("company_name") or "").lower())
    return clients


@router.post("/clients", dependencies=[Depends(MANAGE)])
async def quick_create_mis_client(payload: QuickClientCreate, current_user: User = Depends(get_current_user)):
    """Add a new client directly from the MIS Report screen."""
    data = ClientCreate(
        company_name=payload.company_name,
        client_type=payload.client_type or "other",
        email=payload.email or None,
        phone=payload.phone or None,
        gstin=payload.gstin or None,
    )
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_by"] = current_user.id
    doc["created_at"] = _now().isoformat()
    doc["approval_status"] = "approved" if current_user.role == "admin" else "pending"
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/periods", dependencies=[Depends(VIEW)])
async def list_periods(client_id: str = Query(...), current_user: User = Depends(get_current_user)):
    periods = await db.mis_uploads.distinct("period", {"client_id": client_id})
    periods = sorted([p for p in periods if p], reverse=True)
    return {"periods": periods}


# ══════════════════════════════════════════════════════════════════════════
# UPLOADS
# ══════════════════════════════════════════════════════════════════════════

@router.post("/upload", dependencies=[Depends(MANAGE)])
async def upload_mis_document(
    client_id: str = Form(...),
    period: str = Form(...),
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of {DOC_TYPES}")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    file_bytes = await file.read()
    filename = file.filename or "upload"
    upload_id = str(uuid.uuid4())
    parsed_rows: List[Dict[str, Any]] = []
    bs_suggestions: Dict[str, float] = {}
    status_msg = "parsed"
    error = None

    gst_meta: Dict[str, Any] = {}
    try:
        # Every document type now accepts Excel, CSV, PDF and Word — the
        # reader normalises all four into tables + text before parsing.
        doc = _read_any(file_bytes, filename)

        if doc_type in ("sales", "purchase"):
            # Try the highest-scoring table first; if that yields nothing useful,
            # fall back to trying EVERY table in the document so that multi-page
            # PDFs and audit-style reports are never silently dropped.
            df = _pick_table(doc, SALES_PURCHASE_COLS,
                             weighted=["party_name", "total_amount", "taxable_value"])
            if df is not None and not df.empty:
                parsed_rows = _parse_register(df, doc_type)
            if not parsed_rows:
                for tbl in doc.tables:
                    rows = _parse_register(tbl, doc_type)
                    if rows:
                        parsed_rows.extend(rows)
            if not parsed_rows and doc.text:
                # Plain-text fallback: extract any line that looks like a
                # transaction (has a date and at least one number).
                parsed_rows = _text_rows_fallback(doc.text, doc_type)
            if not parsed_rows:
                status_msg = "partial"
                error = (
                    f"File '{filename}' was read successfully but no {doc_type} rows could be "
                    "extracted — the column headers may use non-standard names. "
                    "The raw content has been stored; check the extracted text below."
                )

        elif doc_type == "bank_statement":
            df = _pick_table(doc, BANK_COLS, weighted=["debit", "credit"], min_score=2)
            if df is not None and not df.empty:
                parsed_rows = _parse_bank(df)
            if not parsed_rows:
                for tbl in doc.tables:
                    rows = _parse_bank(tbl)
                    if rows:
                        parsed_rows.extend(rows)
            if not parsed_rows and doc.text:
                parsed_rows = _text_rows_fallback(doc.text, "bank_statement")
            if not parsed_rows:
                status_msg = "partial"
                error = (
                    f"File '{filename}' was read but no bank transactions were extracted — "
                    "expected columns like 'Date', 'Narration', 'Debit', 'Credit', 'Balance'."
                )

        elif doc_type == "gst_report":
            df = _pick_table(doc, SALES_PURCHASE_COLS,
                             weighted=["party_name", "total_amount", "taxable_value"], min_score=6)
            if df is not None and not df.empty:
                parsed_rows = _parse_register(df, doc_type)
            if not parsed_rows:
                parsed_rows = parse_gst_tables(doc.tables, doc.text, filename)
                if parsed_rows:
                    gst_meta = {
                        "gst_return_type": parsed_rows[0].get("gst_return_type"),
                        "gst_period": parsed_rows[0].get("gst_period"),
                    }
            if not parsed_rows:
                status_msg = "partial"
                error = (
                    f"File '{filename}' was read but no GST rows were extracted. "
                    "Upload a GSTR-1 / GSTR-3B / GSTR-2B portal export (PDF or Excel), "
                    "or an invoice-level GST register."
                )

        elif doc_type == "balance_sheet":
            bs_suggestions = _parse_balance_sheet_doc(doc)
            # Balance sheets are always accepted — even when nothing is
            # auto-detected the user can fill in the Manual Entry form.
            if not bs_suggestions:
                status_msg = "partial"
                error = (
                    f"File '{filename}' was stored but no balance-sheet line items were "
                    "auto-detected. You can fill in the figures manually under Manual Entry."
                )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported doc_type '{doc_type}'.")

    except HTTPException as he:
        status_msg = "error"
        error = he.detail
    except Exception as e:
        status_msg = "error"
        error = str(e)

    # persist transactions
    if parsed_rows:
        for row in parsed_rows:
            row.update({
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "period": period,
                "doc_type": doc_type,
                "upload_id": upload_id,
            })
        await db.mis_transactions.insert_many(parsed_rows)

    # merge balance-sheet suggestions into manual entry (only fills blanks)
    if bs_suggestions:
        existing = await db.mis_manual.find_one({"client_id": client_id, "period": period}) or {}
        update = {}
        field_map = {
            "cash_bank_balance": "closing_cash_bank_balance",
            "depreciation_amortization": "depreciation_amortization",
            "interest_expense": "interest_expense",
            "tax_expense": "tax_expense",
        }
        for src, dest in field_map.items():
            if src in bs_suggestions and not existing.get(dest):
                update[dest] = bs_suggestions[src]
        update["balance_sheet_suggestions"] = bs_suggestions
        if update:
            await db.mis_manual.update_one(
                {"client_id": client_id, "period": period},
                {"$set": update, "$setOnInsert": {"client_id": client_id, "period": period}},
                upsert=True,
            )

    upload_doc = {
        "id": upload_id,
        "client_id": client_id,
        "period": period,
        "doc_type": doc_type,
        "filename": filename,
        "uploaded_by": current_user.id,
        "uploaded_at": _now().isoformat(),
        "status": status_msg,
        "row_count": len(parsed_rows),
        "balance_sheet_fields_found": list(bs_suggestions.keys()) if bs_suggestions else [],
        "gst_return_type": gst_meta.get("gst_return_type"),
        "gst_period": gst_meta.get("gst_period"),
        "error": error,

    }
    await db.mis_uploads.insert_one(upload_doc)
    upload_doc.pop("_id", None)

    if status_msg == "error":
        raise HTTPException(status_code=422, detail=error or "Could not parse file.")
    return upload_doc


@router.get("/uploads", dependencies=[Depends(VIEW)])
async def list_uploads(client_id: str = Query(...), period: str = Query(...)):
    cursor = db.mis_uploads.find({"client_id": client_id, "period": period}, {"_id": 0}).sort("uploaded_at", -1)
    return await cursor.to_list(length=500)


@router.delete("/uploads/{upload_id}", dependencies=[Depends(MANAGE)])
async def delete_upload(upload_id: str):
    upload = await db.mis_uploads.find_one({"id": upload_id})
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    await db.mis_transactions.delete_many({"upload_id": upload_id})
    await db.mis_uploads.delete_one({"id": upload_id})
    return {"success": True}


# ══════════════════════════════════════════════════════════════════════════
# MANUAL ENTRY (figures that can't be derived from raw registers)
# ══════════════════════════════════════════════════════════════════════════

class ManualEntry(BaseModel):
    client_id: str
    period: str
    opening_cash_bank_balance: float = 0
    closing_cash_bank_balance: float = 0
    depreciation_amortization: float = 0
    interest_expense: float = 0
    tax_expense: float = 0
    interest_on_delayed_payment_rate: float = 0     # annual %, applied to overdue receivables
    bad_debts: List[Dict[str, Any]] = Field(default_factory=list)          # [{party_name, amount, note}]
    advances_to_vendors: List[Dict[str, Any]] = Field(default_factory=list)  # [{vendor_name, amount, note}]
    security_deposits: List[Dict[str, Any]] = Field(default_factory=list)    # [{party_name, amount, note}]
    budget: Dict[str, float] = Field(default_factory=dict)   # {category: budgeted_amount}


@router.get("/manual-entry", dependencies=[Depends(VIEW)])
async def get_manual_entry(client_id: str = Query(...), period: str = Query(...)):
    doc = await db.mis_manual.find_one({"client_id": client_id, "period": period}, {"_id": 0})
    return doc or {"client_id": client_id, "period": period}


@router.put("/manual-entry", dependencies=[Depends(MANAGE)])
async def upsert_manual_entry(payload: ManualEntry, current_user: User = Depends(get_current_user)):
    data = payload.model_dump()
    data["updated_by"] = current_user.id
    data["updated_at"] = _now().isoformat()
    await db.mis_manual.update_one(
        {"client_id": payload.client_id, "period": payload.period},
        {"$set": data},
        upsert=True,
    )
    return data


# ══════════════════════════════════════════════════════════════════════════
# SHARED DATA LOADER
# ══════════════════════════════════════════════════════════════════════════

async def _load(client_id: str, period: str):
    txns = await db.mis_transactions.find({"client_id": client_id, "period": period}, {"_id": 0}).to_list(length=200000)
    sales = [t for t in txns if t["doc_type"] == "sales"]
    purchase = [t for t in txns if t["doc_type"] == "purchase"]
    bank = [t for t in txns if t["doc_type"] == "bank_statement"]
    gst = [t for t in txns if t["doc_type"] == "gst_report"]
    manual = await db.mis_manual.find_one({"client_id": client_id, "period": period}, {"_id": 0}) or {}
    return sales, purchase, bank, gst, manual


def _ageing_bucket(days: int) -> str:
    if days <= 30:
        return "0-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    if days <= 180:
        return "91-180"
    return "above_180"


def _ageing_analysis(open_items: List[Dict[str, Any]]) -> Dict[str, float]:
    buckets = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "91-180": 0.0, "above_180": 0.0}
    today = _today()
    for t in open_items:
        ref = t.get("due_date") or t.get("date")
        if not ref:
            days = 0
        else:
            try:
                days = (today - datetime.strptime(ref, "%Y-%m-%d").date()).days
            except ValueError:
                days = 0
        days = max(days, 0)
        outstanding = t.get("_outstanding", t.get("total_amount", 0))
        buckets[_ageing_bucket(days)] += outstanding
    return {k: round(v, 2) for k, v in buckets.items()}


def _group_sum(items: List[Dict[str, Any]], key: str, amount_key: str, default_label="Unspecified") -> Dict[str, float]:
    out: Dict[str, float] = {}
    for t in items:
        label = t.get(key) or default_label
        out[label] = round(out.get(label, 0) + _num(t.get(amount_key, 0)), 2)
    return out


def _open_items(register: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Unpaid + partial invoices, with `_outstanding` amount attached.
    Partial invoices are treated as 50% outstanding when no explicit paid
    amount is tracked (register uploads don't carry partial-payment values)."""
    out = []
    for t in register:
        if t["status"] == "paid":
            continue
        outstanding = t["total_amount"] if t["status"] == "unpaid" else round(t["total_amount"] * 0.5, 2)
        row = {**t, "_outstanding": outstanding}
        out.append(row)
    return out


def _prev_period(period: str) -> Optional[str]:
    m = re.search(r"(\d{4})", period)
    if not m:
        return None
    year = int(m.group(1))
    return period.replace(str(year), str(year - 1), 1)


# ══════════════════════════════════════════════════════════════════════════
# 1. FINANCIAL DASHBOARD
# ══════════════════════════════════════════════════════════════════════════

@router.get("/dashboard", dependencies=[Depends(VIEW)])
async def financial_dashboard(client_id: str = Query(...), period: str = Query(...)):
    sales, purchase, bank, gst, manual = await _load(client_id, period)

    total_revenue = round(sum(_num(t["taxable_value"]) for t in sales), 2)
    direct_cost = round(sum(_num(t["taxable_value"]) for t in purchase), 2)

    bank_expense_total = round(sum(_num(t["debit"]) for t in bank), 2)
    total_expenses = round(direct_cost + bank_expense_total, 2)

    gross_profit = round(total_revenue - direct_cost, 2)
    net_profit = round(total_revenue - total_expenses, 2)

    dep = _num(manual.get("depreciation_amortization"))
    interest = _num(manual.get("interest_expense"))
    tax = _num(manual.get("tax_expense"))
    ebitda = round(net_profit + dep + interest + tax, 2)

    cash_bank_balance = _num(manual.get("closing_cash_bank_balance"))
    if not cash_bank_balance and bank:
        dated = [t for t in bank if t.get("date")]
        if dated:
            cash_bank_balance = _num(sorted(dated, key=lambda t: t["date"])[-1].get("balance"))

    ar_open = _open_items(sales)
    ap_open = _open_items(purchase)
    accounts_receivable = round(sum(t["_outstanding"] for t in ar_open), 2)
    accounts_payable = round(sum(t["_outstanding"] for t in ap_open), 2)

    working_capital = round((accounts_receivable + cash_bank_balance) - accounts_payable, 2)

    cash_in = round(sum(_num(t["credit"]) for t in bank), 2)
    cash_out = round(sum(_num(t["debit"]) for t in bank), 2)
    cash_flow_position = round(cash_in - cash_out, 2)

    budget = manual.get("budget") or {}
    actual_by_category = _group_sum(
        [{**t, "_cat": _categorize_expense(t.get("narration", ""), "")} for t in bank if t["debit"]],
        "_cat", "debit",
    )
    budget_vs_actual = [
        {"category": cat, "budget": round(_num(amt), 2), "actual": actual_by_category.get(cat, 0),
         "variance": round(actual_by_category.get(cat, 0) - _num(amt), 2)}
        for cat, amt in budget.items()
    ]

    revenue_growth_pct = None
    prev = _prev_period(period)
    if prev:
        prev_sales = await db.mis_transactions.find(
            {"client_id": client_id, "period": prev, "doc_type": "sales"}, {"_id": 0, "taxable_value": 1}
        ).to_list(length=200000)
        prev_revenue = round(sum(_num(t["taxable_value"]) for t in prev_sales), 2)
        if prev_revenue:
            revenue_growth_pct = round((total_revenue - prev_revenue) / prev_revenue * 100, 2)

    return {
        "client_id": client_id,
        "period": period,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "gross_profit": gross_profit,
        "net_profit": net_profit,
        "ebitda": ebitda,
        "cash_and_bank_balance": round(cash_bank_balance, 2),
        "accounts_receivable": accounts_receivable,
        "accounts_payable": accounts_payable,
        "working_capital": working_capital,
        "cash_flow_position": cash_flow_position,
        "cash_in": cash_in,
        "cash_out": cash_out,
        "budget_vs_actual": budget_vs_actual,
        "revenue_growth_pct": revenue_growth_pct,
        "data_available": {
            "sales_rows": len(sales), "purchase_rows": len(purchase),
            "bank_rows": len(bank), "gst_rows": len(gst),
        },
    }


# ══════════════════════════════════════════════════════════════════════════
# 2. RECEIVABLES MIS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/receivables", dependencies=[Depends(VIEW)])
async def receivables_mis(client_id: str = Query(...), period: str = Query(...)):
    sales, purchase, bank, gst, manual = await _load(client_id, period)
    open_items = _open_items(sales)

    outstanding_by_client = _group_sum(open_items, "party_name", "_outstanding")
    outstanding_by_branch = _group_sum(open_items, "branch", "_outstanding", default_label="All / Not tagged")
    outstanding_by_partner = _group_sum(open_items, "partner", "_outstanding", default_label="Unassigned")
    invoice_wise = sorted(
        [{"invoice_no": t["invoice_no"], "party_name": t["party_name"], "date": t["date"],
          "due_date": t["due_date"], "outstanding": t["_outstanding"], "status": t["status"]}
         for t in open_items],
        key=lambda x: x["due_date"] or "",
    )

    ageing = _ageing_analysis(open_items)

    total_invoiced = round(sum(_num(t["total_amount"]) for t in sales), 2)
    total_outstanding = round(sum(t["_outstanding"] for t in open_items), 2)
    collected = round(total_invoiced - total_outstanding, 2)
    collection_efficiency = round((collected / total_invoiced) * 100, 2) if total_invoiced else 0

    paid_items = [t for t in sales if t["status"] == "paid"]
    monthly_collections = _group_sum(
        [{**t, "_m": _month_key(t.get("paid_date") or t.get("date"))} for t in paid_items],
        "_m", "total_amount",
    )

    today_iso = _today().isoformat()
    expected_collections = round(sum(
        t["_outstanding"] for t in open_items if t["due_date"] and t["due_date"] >= today_iso
    ), 2)
    overdue_invoices = [
        {"invoice_no": t["invoice_no"], "party_name": t["party_name"], "due_date": t["due_date"],
         "outstanding": t["_outstanding"]}
        for t in open_items if t["due_date"] and t["due_date"] < today_iso
    ]
    overdue_total = round(sum(t["outstanding"] for t in overdue_invoices), 2)

    rate = _num(manual.get("interest_on_delayed_payment_rate"))
    interest_on_delayed = 0.0
    if rate:
        for t in overdue_invoices:
            try:
                days_late = (_today() - datetime.strptime(t["due_date"], "%Y-%m-%d").date()).days
            except ValueError:
                days_late = 0
            interest_on_delayed += t["outstanding"] * (rate / 100) * (max(days_late, 0) / 365)
    bad_debts = manual.get("bad_debts") or []
    bad_debts_total = round(sum(_num(b.get("amount")) for b in bad_debts), 2)

    return {
        "client_id": client_id, "period": period,
        "outstanding_summary": {
            "client_wise": outstanding_by_client,
            "invoice_wise": invoice_wise,
            "branch_wise": outstanding_by_branch,
            "partner_wise": outstanding_by_partner,
        },
        "ageing_analysis": ageing,
        "collection_reports": {
            "collection_efficiency_pct": collection_efficiency,
            "monthly_collections": monthly_collections,
            "expected_collections": expected_collections,
            "overdue_invoices": overdue_invoices,
            "overdue_total": overdue_total,
            "bad_debts": bad_debts,
            "bad_debts_total": bad_debts_total,
            "interest_on_delayed_payments": round(interest_on_delayed, 2),
        },
        "total_outstanding": total_outstanding,
        "total_invoiced": total_invoiced,
    }


# ══════════════════════════════════════════════════════════════════════════
# 3. PAYABLES MIS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/payables", dependencies=[Depends(VIEW)])
async def payables_mis(client_id: str = Query(...), period: str = Query(...)):
    sales, purchase, bank, gst, manual = await _load(client_id, period)
    open_items = _open_items(purchase)

    vendor_outstanding = _group_sum(open_items, "party_name", "_outstanding")
    ageing = _ageing_analysis(open_items)
    expense_category_wise = _group_sum(open_items, "category", "_outstanding", default_label="Uncategorized")

    today_iso = _today().isoformat()
    due_payments = [
        {"invoice_no": t["invoice_no"], "party_name": t["party_name"], "due_date": t["due_date"],
         "outstanding": t["_outstanding"]}
        for t in open_items if t["due_date"] and t["due_date"] >= today_iso
    ]

    paid_items = [t for t in purchase if t["status"] == "paid"]
    monthly_payment_summary = _group_sum(
        [{**t, "_m": _month_key(t.get("paid_date") or t.get("date"))} for t in paid_items],
        "_m", "total_amount",
    )

    return {
        "client_id": client_id, "period": period,
        "vendor_outstanding": vendor_outstanding,
        "due_payments": due_payments,
        "ageing_analysis": ageing,
        "vendor_wise_payables": vendor_outstanding,
        "expense_category_wise_payables": expense_category_wise,
        "monthly_payment_summary": monthly_payment_summary,
        "advances_to_vendors": manual.get("advances_to_vendors") or [],
        "security_deposits": manual.get("security_deposits") or [],
        "total_payable": round(sum(t["_outstanding"] for t in open_items), 2),
    }


# ══════════════════════════════════════════════════════════════════════════
# 4. REVENUE MIS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/revenue", dependencies=[Depends(VIEW)])
async def revenue_mis(client_id: str = Query(...), period: str = Query(...)):
    sales, purchase, bank, gst, manual = await _load(client_id, period)

    monthly_trend = _group_sum([{**t, "_m": _month_key(t["date"])} for t in sales], "_m", "taxable_value")
    daily_revenue = _group_sum([{**t, "_d": t["date"]} for t in sales], "_d", "taxable_value")
    service_wise = _group_sum(sales, "service", "taxable_value", default_label="General")
    client_wise = _group_sum(sales, "party_name", "taxable_value")
    branch_wise = _group_sum(sales, "branch", "taxable_value", default_label="All / Not tagged")
    partner_wise = _group_sum(sales, "partner", "taxable_value", default_label="Unassigned")
    employee_wise = _group_sum(sales, "employee", "taxable_value", default_label="Unassigned")

    # repeat vs new client revenue: "new" = party's earliest transaction
    # (across ALL periods on file for this client) falls inside this period.
    parties = list({t["party_name"] for t in sales})
    new_revenue, repeat_revenue = 0.0, 0.0
    if parties:
        first_seen_cursor = db.mis_transactions.aggregate([
            {"$match": {"client_id": client_id, "doc_type": "sales", "party_name": {"$in": parties}}},
            {"$group": {"_id": "$party_name", "first_date": {"$min": "$date"}}},
        ])
        first_seen = {d["_id"]: d["first_date"] async for d in first_seen_cursor}
        period_dates = [t["date"] for t in sales if t["date"]]
        period_start = min(period_dates) if period_dates else None
        for t in sales:
            is_new = period_start is not None and first_seen.get(t["party_name"]) and first_seen[t["party_name"]] >= period_start
            if is_new:
                new_revenue += _num(t["taxable_value"])
            else:
                repeat_revenue += _num(t["taxable_value"])

    return {
        "client_id": client_id, "period": period,
        "monthly_revenue_trend": monthly_trend,
        "daily_revenue": daily_revenue,
        "service_wise_revenue": service_wise,
        "client_wise_revenue": client_wise,
        "branch_wise_revenue": branch_wise,
        "partner_wise_revenue": partner_wise,
        "employee_wise_billing": employee_wise,
        "repeat_client_revenue": round(repeat_revenue, 2),
        "new_client_revenue": round(new_revenue, 2),
        "total_revenue": round(sum(_num(t["taxable_value"]) for t in sales), 2),
    }


# ══════════════════════════════════════════════════════════════════════════
# 5. EXPENSE MIS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/expense", dependencies=[Depends(VIEW)])
async def expense_mis(client_id: str = Query(...), period: str = Query(...)):
    sales, purchase, bank, gst, manual = await _load(client_id, period)
    debits = [t for t in bank if t["debit"]]
    for t in debits:
        t["_cat"] = t.get("category") or _categorize_expense(t.get("narration", ""))

    monthly_expenses = _group_sum([{**t, "_m": _month_key(t["date"])} for t in debits], "_m", "debit")
    by_category = _group_sum(debits, "_cat", "debit")
    department_wise = by_category  # categories double as departments in the absence of an ERP dept field

    return {
        "client_id": client_id, "period": period,
        "monthly_expenses": monthly_expenses,
        "department_wise_expenses": department_wise,
        "employee_expenses": by_category.get("employee_expenses", 0),
        "travel_expenses": by_category.get("travel_expenses", 0),
        "office_expenses": by_category.get("office_expenses", 0),
        "rent": by_category.get("rent", 0),
        "software_subscription_cost": by_category.get("software_subscription_cost", 0),
        "utility_expenses": by_category.get("utility_expenses", 0),
        "marketing_expenses": by_category.get("marketing_expenses", 0),
        "administrative_expenses": by_category.get("administrative_expenses", 0),
        "purchase_cogs": round(sum(_num(t["taxable_value"]) for t in purchase), 2),
        "total_expenses": round(sum(_num(t["debit"]) for t in debits) + sum(_num(t["taxable_value"]) for t in purchase), 2),
    }


# ══════════════════════════════════════════════════════════════════════════
# 6. PROFITABILITY MIS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/profitability", dependencies=[Depends(VIEW)])
async def profitability_mis(client_id: str = Query(...), period: str = Query(...)):
    sales, purchase, bank, gst, manual = await _load(client_id, period)

    revenue = round(sum(_num(t["taxable_value"]) for t in sales), 2)
    direct_cost = round(sum(_num(t["taxable_value"]) for t in purchase), 2)
    indirect_cost = round(sum(_num(t["debit"]) for t in bank), 2)
    profit = round(revenue - direct_cost - indirect_cost, 2)
    profit_pct = round((profit / revenue) * 100, 2) if revenue else 0

    return {
        "client_id": client_id, "period": period,
        "client_profitability": {
            "revenue": revenue,
            "direct_cost": direct_cost,
            "indirect_cost": indirect_cost,
            "profit": profit,
            "profit_pct": profit_pct,
        },
    }


# ══════════════════════════════════════════════════════════════════════════
# 7. EXPORTS — generate PDF / Word reports and Excel data workbooks
# ══════════════════════════════════════════════════════════════════════════

def _humanize(key: str) -> str:
    return key.replace("_pct", " %").replace("_", " ").strip().title()


def _sections_from_report(title: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Turn any of the six MIS report payloads into a printable section."""
    skip = {"client_id", "period"}
    kpis, tables = [], []
    for key, val in data.items():
        if key in skip:
            continue
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            kpis.append({"label": _humanize(key), "value": val,
                         "money": not key.endswith("_pct"), "pct": key.endswith("_pct")})
        elif isinstance(val, dict) and val and all(isinstance(v, (int, float)) for v in val.values()):
            tables.append({"columns": [_humanize(key), "Amount"],
                           "rows": [[k, round(float(v), 2)] for k, v in sorted(
                               val.items(), key=lambda kv: -abs(float(kv[1])))]})
        elif isinstance(val, list) and val and isinstance(val[0], dict):
            cols = list(val[0].keys())
            tables.append({"columns": [_humanize(c) for c in cols],
                           "rows": [[r.get(c) for c in cols] for r in val]})
    merged_rows, merged_cols = [], None
    section = {"title": title, "kpis": kpis}
    if tables:
        section["table"] = tables[0]
    extra = [{"title": f"{title} — detail {i + 2}", "kpis": [], "table": t}
             for i, t in enumerate(tables[1:])]
    return {"main": section, "extra": extra}


async def _build_all_sections(client_id: str, period: str) -> List[Dict[str, Any]]:
    reports = [
        ("Financial Dashboard", await financial_dashboard(client_id, period)),
        ("Receivables MIS", await receivables_mis(client_id, period)),
        ("Payables MIS", await payables_mis(client_id, period)),
        ("Revenue MIS", await revenue_mis(client_id, period)),
        ("Expense MIS", await expense_mis(client_id, period)),
        ("Profitability MIS", await profitability_mis(client_id, period)),
    ]
    sections: List[Dict[str, Any]] = []
    for title, data in reports:
        built = _sections_from_report(title, data)
        sections.append(built["main"])
        sections.extend(built["extra"])

    _, _, _, gst, _ = await _load(client_id, period)
    if gst:
        summary = gst_summary(gst)
        sections.append({
            "title": "GST Summary",
            "kpis": [
                {"label": "Taxable Value (Outward)", "value": summary["outward"]["taxable_value"], "money": True},
                {"label": "Output Tax", "value": summary["outward"]["tax_amount"], "money": True},
                {"label": "Input Tax Credit", "value": summary["itc"]["tax_amount"], "money": True},
                {"label": "Net Tax", "value": summary["net_tax"], "money": True},
                {"label": "IGST", "value": summary["outward"]["igst"], "money": True},
                {"label": "CGST / SGST", "value": summary["outward"]["cgst"] + summary["outward"]["sgst"], "money": True},
            ],
            "table": {
                "columns": ["Return / Period", "Taxable Value", "IGST", "CGST", "SGST", "Cess", "Total Tax"],
                "rows": [[k, v["taxable_value"], v["igst"], v["cgst"], v["sgst"], v["cess"], v["tax_amount"]]
                         for k, v in summary["by_period"].items()],
            },
            "note": "Outward supplies are counted once — HSN, document-summary and tax-payment tables are reported separately.",
        })
    return sections


async def _export_meta(client_id: str, period: str, user: User) -> Dict[str, Any]:
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "company_name": 1}) or {}
    return {
        "client_name": client.get("company_name") or "Client",
        "period": period,
        "generated_at": _now().strftime("%d-%b-%Y %H:%M IST"),
        "prepared_by": getattr(user, "full_name", None) or getattr(user, "username", None) or "—",
    }


def _safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", text or "").strip("_") or "MIS"


def _file_response(content: bytes, filename: str, media_type: str):
    from fastapi.responses import Response
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "Access-Control-Expose-Headers": "Content-Disposition"},
    )


@router.get("/export/report", dependencies=[Depends(VIEW)])
async def export_mis_report(
    client_id: str = Query(...),
    period: str = Query(...),
    format: str = Query("pdf", pattern="^(pdf|word|docx)$"),
    current_user: User = Depends(get_current_user),
):
    """Generate the full MIS report as a PDF or Word document."""
    meta = await _export_meta(client_id, period, current_user)
    sections = await _build_all_sections(client_id, period)
    base = f"MIS_Report_{_safe_name(meta['client_name'])}_{_safe_name(period)}"
    try:
        if format == "pdf":
            return _file_response(build_pdf_report(meta, sections), f"{base}.pdf", "application/pdf")
        return _file_response(
            build_word_report(meta, sections), f"{base}.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Report generator not installed on the server: {e}")


@router.get("/export/excel", dependencies=[Depends(VIEW)])
async def export_mis_excel(
    client_id: str = Query(...),
    period: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    """Every parsed row for the period — sales, purchase, bank, GST — as one workbook."""
    meta = await _export_meta(client_id, period, current_user)
    sales, purchase, bank, gst, _ = await _load(client_id, period)

    reg_cols = ["date", "invoice_no", "party_name", "taxable_value", "tax_amount",
                "total_amount", "status", "due_date", "paid_date", "category",
                "service", "branch", "partner", "employee"]
    bank_cols = ["date", "narration", "debit", "credit", "balance", "category"]
    gst_cols = ["gst_return_type", "gst_period", "gst_section", "invoice_no", "party_name",
                "taxable_value", "igst", "cgst", "sgst", "cess", "tax_amount", "gst_measure"]

    def rows_of(items, cols):
        return [[t.get(c) for c in cols] for t in items]

    sheets = []
    summary_rows = [
        ["Sales rows", len(sales)], ["Purchase rows", len(purchase)],
        ["Bank rows", len(bank)], ["GST rows", len(gst)],
        ["Total revenue (taxable)", round(sum(_num(t["taxable_value"]) for t in sales), 2)],
        ["Total purchases (taxable)", round(sum(_num(t["taxable_value"]) for t in purchase), 2)],
        ["Bank credits", round(sum(_num(t["credit"]) for t in bank), 2)],
        ["Bank debits", round(sum(_num(t["debit"]) for t in bank), 2)],
    ]
    sheets.append({"name": "Summary", "columns": ["Metric", "Value"], "rows": summary_rows, "money_columns": [1]})
    if sales:
        sheets.append({"name": "Sales Register", "columns": [_humanize(c) for c in reg_cols],
                       "rows": rows_of(sales, reg_cols), "money_columns": [3, 4, 5]})
    if purchase:
        sheets.append({"name": "Purchase Register", "columns": [_humanize(c) for c in reg_cols],
                       "rows": rows_of(purchase, reg_cols), "money_columns": [3, 4, 5]})
    if bank:
        sheets.append({"name": "Bank Statement", "columns": [_humanize(c) for c in bank_cols],
                       "rows": rows_of(bank, bank_cols), "money_columns": [2, 3, 4]})
    if gst:
        sheets.append({"name": "GST Data", "columns": [_humanize(c) for c in gst_cols],
                       "rows": rows_of(gst, gst_cols), "money_columns": [5, 6, 7, 8, 9, 10]})

    content = build_excel_workbook(meta, sheets)
    name = f"MIS_Data_{_safe_name(meta['client_name'])}_{_safe_name(period)}.xlsx"
    return _file_response(content, name,
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.get("/export/gst-excel", dependencies=[Depends(VIEW)])
async def export_gst_excel(
    client_id: str = Query(...),
    period: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    """GST report workbook: return-wise, month-wise and full line-item detail."""
    meta = await _export_meta(client_id, period, current_user)
    _, _, _, gst, _ = await _load(client_id, period)
    if not gst:
        raise HTTPException(status_code=404, detail="No GST data uploaded for this client and period.")
    summary = gst_summary(gst)

    money = [1, 2, 3, 4, 5, 6]
    def bucket_rows(mapping):
        return [[k, v["taxable_value"], v["igst"], v["cgst"], v["sgst"], v["cess"], v["tax_amount"]]
                for k, v in mapping.items()]
    bucket_cols = ["Group", "Taxable Value", "IGST", "CGST", "SGST/UTGST", "Cess", "Total Tax"]

    detail_cols = ["gst_return_type", "gst_period", "gst_section", "invoice_no", "party_name",
                   "taxable_value", "igst", "cgst", "sgst", "cess", "tax_amount",
                   "record_count", "gst_measure"]
    sheets = [
        {"name": "GST Summary", "columns": ["Metric", "Amount"], "money_columns": [1], "rows": [
            ["Outward taxable value", summary["outward"]["taxable_value"]],
            ["Output tax", summary["outward"]["tax_amount"]],
            ["Input tax credit", summary["itc"]["tax_amount"]],
            ["Net tax payable", summary["net_tax"]],
            ["Line items read", summary["line_items"]],
        ]},
        {"name": "By Return", "columns": bucket_cols, "rows": bucket_rows(summary["by_return"]), "money_columns": money},
        {"name": "By Period", "columns": bucket_cols, "rows": bucket_rows(summary["by_period"]), "money_columns": money},
        {"name": "By Table Type", "columns": bucket_cols, "rows": bucket_rows(summary["by_measure"]), "money_columns": money},
        {"name": "Line Items", "columns": [_humanize(c) for c in detail_cols],
         "rows": [[t.get(c) for c in detail_cols] for t in gst], "money_columns": [5, 6, 7, 8, 9, 10]},
    ]
    content = build_excel_workbook(meta, sheets)
    name = f"GST_Report_{_safe_name(meta['client_name'])}_{_safe_name(period)}.xlsx"
    return _file_response(content, name,
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
