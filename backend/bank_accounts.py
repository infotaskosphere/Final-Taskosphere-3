"""
Bank Accounts — "Accounts › Bank" page.

Upload a bank statement (any bank, CSV/XLSX/PDF export) for any of the
firm's bank accounts. The app reads the transaction rows, auto-matches each
one against existing Purchase invoices (money out) and Sale invoices (money
in) by amount + date proximity, and — once matched — posts the
corresponding Journal Entry automatically so the transaction shows up in
the ledger and every report without manual re-entry.

Design note (cash-basis auto-posting): a matched transaction posts a single
journal entry — Dr Purchases / Cr Bank for a payment, or Dr Bank / Cr Sales
Income for a receipt — rather than a two-step accrual (invoice booked, then
payment against Accounts Payable/Receivable separately). That keeps
auto-posting simple and matches how most small firms actually work day to
day; the Accounts Payable/Receivable accounts are still in the Chart of
Accounts for anyone who wants to post accrual entries by hand through
Journal Entries. Unmatched transactions are never auto-posted — they sit
as "unmatched" until a person matches them manually, so the ledger never
gets a guessed entry.
"""

import re
import uuid
import base64
from io import BytesIO
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from backend.dependencies import db, get_current_user
from backend.models import User
from backend.accounting_core import get_default_account_id, try_auto_post

router = APIRouter(tags=["Bank Accounts"])

MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB — statements can run to many pages


def _perm_view_bank(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_view_bank"))


def _perm_match_bank(user: User) -> bool:
    """Gate for actions that change reconciliation state (Match / Edit Match /
    Unmatch / Ignore) — distinct from _perm_view_bank, which only gates read
    access to the page. Admin: always allowed. Manager: allowed by default
    (can_match_bank defaults True in DEFAULT_ROLE_PERMISSIONS). Staff: view
    only unless an admin grants can_match_bank via Permission Governance."""
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_match_bank"))


# ── Models ────────────────────────────────────────────────────────────────
class BankAccountCreate(BaseModel):
    company_id: str = ""
    bank_name: str
    account_holder: str = ""
    account_number: str = ""   # stored masked (last 4 shown) — full number never returned by list endpoints
    ifsc: str = ""
    branch: str = ""
    account_type: str = "current"  # current | savings | od | cc
    opening_balance: float = 0.0
    upi_id: str = ""
    notes: str = ""


def _mask_account_number(acc_no: str) -> str:
    acc_no = re.sub(r"\s+", "", acc_no or "")
    if len(acc_no) <= 4:
        return acc_no
    return "•" * (len(acc_no) - 4) + acc_no[-4:]


# ── Cross-place sync helpers ────────────────────────────────────────────────
# Bank details are entered in three places: this Bank Accounts page, Invoice
# Settings and Quotation Settings. The company record holds the single source
# of truth for the firm's primary bank account; these helpers mirror changes
# between the company record and the bank_accounts collection so a bank account
# added/updated in any one place shows up in the other two automatically.

async def sync_bank_account_to_company(account: dict, full_account_number: str = ""):
    """Push a bank account's details onto its linked company record."""
    company_id = account.get("company_id")
    if not company_id:
        return
    update = {
        "bank_name": account.get("bank_name", ""),
        "bank_account_name": account.get("account_holder", ""),
        "bank_account_holder": account.get("account_holder", ""),
        "bank_account_no": full_account_number or account.get("account_number_full", ""),
        "bank_ifsc": account.get("ifsc", ""),
        "bank_branch": account.get("branch", ""),
        "bank_account_type": (account.get("account_type", "current") or "current").capitalize(),
    }
    if account.get("upi_id"):
        update["upi_id"] = account["upi_id"]
    await db.companies.update_one({"id": company_id}, {"$set": update})


async def sync_company_primary_bank_account(company: dict):
    """Upsert the primary bank_accounts doc for a company from its bank fields."""
    if not company:
        return
    company_id = company.get("id")
    if not company_id:
        return
    bank_name = (company.get("bank_name") or "").strip()
    acc_no = (company.get("bank_account_no") or "").strip()
    if not bank_name and not acc_no:
        return  # nothing meaningful to sync yet
    now = datetime.now(timezone.utc).isoformat()
    fields = {
        "company_id": company_id,
        "bank_name": bank_name,
        "account_holder": (company.get("bank_account_name") or company.get("bank_account_holder") or "").strip(),
        "account_number_masked": _mask_account_number(acc_no),
        "account_number_full": acc_no,
        "ifsc": (company.get("bank_ifsc") or "").strip().upper(),
        "branch": (company.get("bank_branch") or "").strip(),
        "account_type": (company.get("bank_account_type") or "current").lower(),
        "upi_id": (company.get("upi_id") or "").strip(),
        "is_primary": True,
        "updated_at": now,
    }
    existing = await db.bank_accounts.find_one({"company_id": company_id, "is_primary": True})
    if existing:
        await db.bank_accounts.update_one({"id": existing["id"]}, {"$set": fields})
    else:
        fields.update({
            "id": str(uuid.uuid4()),
            "opening_balance": 0.0,
            "notes": "Synced from Invoice / Quotation settings",
            "created_by": company.get("created_by", ""),
            "created_at": now,
        })
        await db.bank_accounts.insert_one(fields)


@router.post("/bank-accounts")
async def create_bank_account(payload: BankAccountCreate, current_user: User = Depends(get_current_user)):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")
    now = datetime.now(timezone.utc).isoformat()
    full_acc_no = re.sub(r"\s+", "", payload.account_number or "")
    doc = {
        "id": str(uuid.uuid4()), "company_id": payload.company_id, "bank_name": payload.bank_name.strip(),
        "account_holder": payload.account_holder.strip(), "account_number_masked": _mask_account_number(payload.account_number),
        "account_number_full": full_acc_no,
        "ifsc": payload.ifsc.strip().upper(), "branch": payload.branch.strip(), "account_type": payload.account_type,
        "opening_balance": float(payload.opening_balance or 0), "upi_id": payload.upi_id.strip(),
        "is_primary": True, "notes": payload.notes.strip(),
        "created_by": current_user.id, "created_at": now,
    }
    # A newly added account becomes this company's primary — clear the flag on
    # any previous primary so exactly one stays marked.
    if payload.company_id:
        await db.bank_accounts.update_many(
            {"company_id": payload.company_id, "is_primary": True}, {"$set": {"is_primary": False}}
        )
    await db.bank_accounts.insert_one(doc)
    # Mirror onto the company record so Invoice + Quotation settings pick it up.
    try:
        await sync_bank_account_to_company(doc, full_acc_no)
    except Exception:
        pass
    doc.pop("_id", None)
    doc.pop("account_number_full", None)
    return doc


@router.get("/bank-accounts")
async def list_bank_accounts(company_id: Optional[str] = Query(None), current_user: User = Depends(get_current_user)):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")
    q = {"company_id": company_id} if company_id else {}
    accounts = await db.bank_accounts.find(q, {"_id": 0, "account_number_full": 0}).sort("created_at", -1).to_list(500)
    for a in accounts:
        txns = await db.bank_transactions.find({"bank_account_id": a["id"]}, {"_id": 0, "debit": 1, "credit": 1}).to_list(100000)
        balance = a["opening_balance"] + sum(t.get("credit", 0) for t in txns) - sum(t.get("debit", 0) for t in txns)
        a["current_balance"] = round(balance, 2)
        a["transaction_count"] = len(txns)
    return accounts


@router.delete("/bank-accounts/{bank_account_id}")
async def delete_bank_account(bank_account_id: str, current_user: User = Depends(get_current_user)):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    await db.bank_transactions.delete_many({"bank_account_id": bank_account_id})
    result = await db.bank_accounts.delete_one({"id": bank_account_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Bank account not found.")
    return {"success": True}


# ── Statement parsing ─────────────────────────────────────────────────────
_DATE_COL_HINTS = ("date", "txn date", "value date", "transaction date")
_DESC_COL_HINTS = ("narration", "description", "particulars", "details", "remarks")
_DEBIT_COL_HINTS = ("debit", "withdrawal", "dr")
_CREDIT_COL_HINTS = ("credit", "deposit", "cr")
_BALANCE_COL_HINTS = ("balance", "closing balance", "running balance")
_REF_COL_HINTS = ("ref", "reference", "chq", "cheque", "utr")


def _pick_col(columns: List[str], hints: tuple) -> Optional[str]:
    lower = {c: str(c).strip().lower() for c in columns}
    for c, low in lower.items():
        if any(h == low for h in hints):
            return c
    for c, low in lower.items():
        if any(h in low for h in hints):
            return c
    return None


def _row_looks_like_stmt_header(cells: List[str]) -> bool:
    """True if a raw row of lowercased/stripped cell strings looks like the
    real transaction-table header of a bank statement — i.e. it has both a
    date-ish cell and a debit/credit/balance-ish cell. Used to skip past
    banner rows (account details, address, opening balance, etc.) that some
    bank exports place above the actual header row."""
    if not cells:
        return False
    has_date = any(
        any(h == c or h in c for h in _DATE_COL_HINTS) for c in cells if c
    )
    has_amount = any(
        any(h == c or h in c for h in (*_DEBIT_COL_HINTS, *_CREDIT_COL_HINTS, *_BALANCE_COL_HINTS))
        for c in cells if c
    )
    return has_date and has_amount


def _parse_amount(val) -> float:
    if val is None:
        return 0.0
    s = str(val).strip().replace(",", "").replace("₹", "").replace("Rs.", "").replace("Rs", "")
    if not s or s.lower() in ("nan", "none", "-"):
        return 0.0
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = abs(float(s))
        return -v if neg else v
    except Exception:
        return 0.0


def _parse_stmt_date(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        try:
            return val.date().isoformat() if hasattr(val, "date") else val.isoformat()
        except Exception:
            pass
    s = str(val).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d", "%Y/%m/%d", "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%b-%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except Exception:
            continue
    return s


def _looks_like_real_excel(contents: bytes) -> bool:
    """XLSX/XLSM files are ZIP archives (start with 'PK'); legacy binary XLS
    files are OLE2 Compound Documents (start with the D0CF11E0 magic bytes).
    Several Indian bank portals (SBI among them) label a plain tab-delimited
    text report with a '.xls' extension — that content matches neither
    signature, and must be parsed as text instead of handed to
    `pandas.read_excel`, which would raise 'Excel file format cannot be
    determined' on it."""
    return contents[:4] == b"PK\x03\x04" or contents[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _read_tabular(contents: bytes, ext: str, header_row: Optional[int] = None):
    """Reads CSV, genuine XLS/XLSX, or a text report mislabeled '.xls'/'.xlsx'
    (tab- or comma-delimited, common from Indian bank statement downloads)
    into a DataFrame, all dtype=str so amounts/dates are parsed by our own
    logic rather than pandas' locale-dependent guessing."""
    import pandas as pd
    if ext == "csv":
        return pd.read_csv(BytesIO(contents), dtype=str, keep_default_na=False, skiprows=header_row or 0)
    if _looks_like_real_excel(contents):
        return pd.read_excel(BytesIO(contents), dtype=str, skiprows=header_row or 0)
    # Mislabeled plain-text export — sniff the delimiter from the first line.
    text = contents.decode("utf-8", errors="replace")
    first_line = text.splitlines()[0] if text.splitlines() else ""
    sep = "\t" if "\t" in first_line else ("," if "," in first_line else r"\s{2,}")
    return pd.read_csv(
        BytesIO(contents), dtype=str, keep_default_na=False,
        sep=sep, engine="python", skiprows=header_row or 0,
    )


def _parse_tabular_statement(contents: bytes, filename: str) -> List[dict]:
    """CSV / XLSX / mislabeled-text statements — the overwhelming majority of
    real-world bank exports. Auto-detects the date / narration / debit /
    credit / balance columns regardless of exact header wording or bank."""
    ext = filename.rsplit(".", 1)[-1].lower()
    is_real_excel = ext != "csv" and _looks_like_real_excel(contents)

    df, date_col, columns = None, None, []
    try:
        df = _read_tabular(contents, ext)
        columns = list(df.columns)
        date_col = _pick_col(columns, _DATE_COL_HINTS)
    except Exception:
        df, date_col = None, None

    if not date_col:
        # Some bank exports have several banner rows (account details,
        # address, opening balance, etc. — exactly what SBI's export
        # includes) before the real transaction-table header, and/or aren't
        # a genuine binary spreadsheet at all despite the extension. Scan
        # raw rows for the one that looks like the real header (has both a
        # date-ish and a debit/credit-ish cell), then re-read from there.
        header_row_idx = None
        if is_real_excel:
            import pandas as pd
            try:
                raw = pd.read_excel(BytesIO(contents), header=None, dtype=str)
                for i in range(min(30, len(raw))):
                    cells = [str(v).strip().lower() for v in raw.iloc[i].tolist()]
                    if _row_looks_like_stmt_header(cells):
                        header_row_idx = i
                        break
            except Exception:
                pass
        else:
            # Plain text (real CSV, or a report mislabeled .xls/.xlsx) — scan
            # raw lines directly rather than trusting pandas with a file that
            # has ragged row widths (banner rows have far fewer delimited
            # fields than the transaction table), which is what trips up a
            # naive pandas.read_csv over the whole file in one pass.
            text = contents.decode("utf-8", errors="replace")
            lines = text.splitlines()
            sep = "\t" if any("\t" in l for l in lines[:5]) else ","
            for i, line in enumerate(lines[:30]):
                cells = [c.strip().lower() for c in line.split(sep)]
                if _row_looks_like_stmt_header(cells):
                    header_row_idx = i
                    break

        if header_row_idx is not None:
            try:
                df = _read_tabular(contents, ext, header_row=header_row_idx)
                columns = list(df.columns)
                date_col = _pick_col(columns, _DATE_COL_HINTS)
            except Exception as e:
                raise ValueError(f"Found a header row but could not read the transaction table beneath it: {e}")

    if not date_col or df is None:
        raise ValueError("Could not find a date column in this statement. Check the file has a header row with a 'Date' column.")

    desc_col = _pick_col(columns, _DESC_COL_HINTS) or ""
    debit_col = _pick_col(columns, _DEBIT_COL_HINTS)
    credit_col = _pick_col(columns, _CREDIT_COL_HINTS)
    balance_col = _pick_col(columns, _BALANCE_COL_HINTS)
    ref_col = _pick_col(columns, _REF_COL_HINTS) or ""

    txns = []
    for _, row in df.iterrows():
        d = _parse_stmt_date(row.get(date_col))
        if not d:
            continue
        debit = _parse_amount(row.get(debit_col)) if debit_col else 0.0
        credit = _parse_amount(row.get(credit_col)) if credit_col else 0.0
        if not debit and not credit:
            continue
        txns.append({
            "date": d,
            "description": str(row.get(desc_col, "")).strip() if desc_col else "",
            "reference": str(row.get(ref_col, "")).strip() if ref_col else "",
            "debit": round(abs(debit), 2),
            "credit": round(abs(credit), 2),
            "balance_after": _parse_amount(row.get(balance_col)) if balance_col else None,
        })
    return txns


async def _parse_pdf_statement_via_ai(contents: bytes, filename: str) -> List[dict]:
    """Scanned / exported PDF statements — use Gemini 2.0 Flash text extraction when
    a digital text layer is present; otherwise fall back to the vision pipeline."""
    from backend.ai_document_reader import _groq_vision_multipage, _get_gemini_model
    import pdfplumber
    import json as _json

    # Try extracting digital text layer first for 100% accuracy and speed
    text_content = ""
    try:
        with pdfplumber.open(BytesIO(contents)) as pdf:
            extracted_pages = []
            for i, page in enumerate(pdf.pages[:15]):
                text = page.extract_text()
                if text and text.strip():
                    extracted_pages.append(f"--- Page {i+1} ---\n{text.strip()}")
            text_content = "\n\n".join(extracted_pages)
    except Exception:
        text_content = ""

    if text_content.strip():
        # High-precision digital PDF statement - use text-layer with Gemini 2.0 Flash
        try:
            model = _get_gemini_model()
            prompt = (
                "You are an expert Indian financial data parser. Below is the text content from a bank statement.\n"
                "Please extract EVERY single transaction row and format it as a valid JSON array of objects.\n"
                "Each object MUST have exactly these keys (and no others):\n"
                '- "date": string in YYYY-MM-DD format (convert standard dates like "01 Apr 2026", "14/04/26", etc. to YYYY-MM-DD)\n'
                '- "description": string (the transaction description, narration or particulars)\n'
                '- "reference": string (cheque/UTR/reference number, or empty string if not shown)\n'
                '- "debit": number (the transaction debit / withdrawal / payment amount. 0 if none)\n'
                '- "credit": number (the transaction credit / deposit / receipt amount. 0 if none)\n'
                '- "balance_after": number or null (running balance after transaction)\n\n'
                "Ensure that:\n"
                "- Debit and credit are ALWAYS positive numbers representing the amount transacted.\n"
                "- Do not omit any transaction rows.\n"
                "- Return ONLY the JSON array inside a standard JSON response. Do not include markdown fences, HTML, or explanations.\n\n"
                f"BANK STATEMENT TEXT:\n{text_content}"
            )
            response = await model.generate_content_async(prompt)
            answer = response.text
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer.strip(), flags=re.I | re.S).strip()
            m = re.search(r"\[.*\]", cleaned, re.S)
            if m:
                cleaned = m.group(0)
            rows = _json.loads(cleaned)
            out = []
            for r in rows if isinstance(rows, list) else []:
                d = _parse_stmt_date(r.get("date"))
                if not d:
                    continue
                out.append({
                    "date": d,
                    "description": str(r.get("description", "")).strip(),
                    "reference": str(r.get("reference", "")).strip(),
                    "debit": round(abs(_parse_amount(r.get("debit"))), 2),
                    "credit": round(abs(_parse_amount(r.get("credit"))), 2),
                    "balance_after": r.get("balance_after"),
                })
            if out:
                return out
        except Exception:
            # Fall back to image-based pipeline if digital extraction or parsing fails
            pass

    page_images = []
    with pdfplumber.open(BytesIO(contents)) as pdf:
        for page in pdf.pages[:10]:
            pil_img = page.to_image(resolution=150).original
            if pil_img.mode not in ("RGB", "L"):
                pil_img = pil_img.convert("RGB")
            buf = BytesIO()
            pil_img.save(buf, format="JPEG", quality=85)
            page_images.append((base64.b64encode(buf.getvalue()).decode(), "image/jpeg"))
    if not page_images:
        return []
    prompt = (
        "This is a bank statement. Extract every transaction row as a JSON array, "
        "one object per row, with keys: date (YYYY-MM-DD), description, reference, "
        "debit (number, 0 if none), credit (number, 0 if none), balance_after (number or null). "
        "Return ONLY the JSON array, no markdown fences, no explanation."
    )
    answer = await _groq_vision_multipage(page_images, prompt)
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer.strip(), flags=re.I | re.S).strip()
    m = re.search(r"\[.*\]", cleaned, re.S)
    if m:
        cleaned = m.group(0)
    try:
        rows = _json.loads(cleaned)
    except Exception:
        return []
    out = []
    for r in rows if isinstance(rows, list) else []:
        d = _parse_stmt_date(r.get("date"))
        if not d:
            continue
        out.append({
            "date": d, "description": str(r.get("description", "")).strip(),
            "reference": str(r.get("reference", "")).strip(),
            "debit": round(abs(_parse_amount(r.get("debit"))), 2),
            "credit": round(abs(_parse_amount(r.get("credit"))), 2),
            "balance_after": r.get("balance_after"),
        })
    return out


# ── Matching + auto journal posting ───────────────────────────────────────
async def _match_transaction(company_id: str, txn: dict) -> Optional[dict]:
    """Try to match one bank line against:
      1) a Purchase invoice / Sale invoice (the standalone Purchases/Invoicing
         modules), or
      2) an AI Zero-Touch Entry Engine document (Module 1) that already posted
         an Accounts Payable/Receivable entry and is waiting to be settled —
    by amount within a small tolerance and date within a window either side
    of the invoice date, scoped to the bank account's own company so a
    multi-company setup never matches one company's payment against another
    company's invoice. Already-settled/paid records are excluded so the same
    invoice can't be closed twice by two different statement lines. Zero-Touch
    entries are checked first for a debit line since they carry the
    AI-extracted vendor name, which gives a better match than the generic
    purchase_invoices collection when both exist."""
    txn_date = txn["date"]
    try:
        dt = datetime.strptime(txn_date, "%Y-%m-%d")
    except Exception:
        return None
    window_from = (dt - timedelta(days=30)).date().isoformat()
    window_to = (dt + timedelta(days=30)).date().isoformat()

    if txn["debit"] > 0:
        amount = txn["debit"]

        zte_candidates = await db.zte_processed_documents.find(
            {
                "company_id": company_id, "status": "posted", "settled": {"$ne": True},
                "extracted.document_type": "PURCHASE",
                "extracted.invoice_date": {"$gte": window_from, "$lte": window_to},
            },
            {"_id": 0},
        ).to_list(2000)
        for c in zte_candidates:
            inr_total = c.get("amount_inr") or float((c.get("extracted") or {}).get("total_invoice_value") or 0)
            if inr_total and abs(inr_total - amount) <= max(1.0, amount * 0.01):
                vendor = (c.get("extracted") or {}).get("vendor_or_customer_name") or "Zero-Touch purchase"
                return {"type": "zte_purchase", "id": c["id"], "label": vendor, "ap_amount": inr_total}

        candidates = await db.purchase_invoices.find(
            {
                "company_id": company_id, "payment_status": {"$ne": "paid"},
                "invoice_date": {"$gte": window_from, "$lte": window_to},
            },
            {"_id": 0},
        ).to_list(2000)
        for c in candidates:
            gt = float(c.get("grand_total") or 0)
            if gt and abs(gt - amount) <= max(1.0, amount * 0.01):
                return {"type": "purchase", "id": c["id"], "label": c.get("supplier_name") or c.get("invoice_no") or "Purchase invoice", "grand_total": gt}

    elif txn["credit"] > 0:
        amount = txn["credit"]

        zte_candidates = await db.zte_processed_documents.find(
            {
                "company_id": company_id, "status": "posted", "settled": {"$ne": True},
                "extracted.document_type": "SALE",
                "extracted.invoice_date": {"$gte": window_from, "$lte": window_to},
            },
            {"_id": 0},
        ).to_list(2000)
        for c in zte_candidates:
            inr_total = c.get("amount_inr") or float((c.get("extracted") or {}).get("total_invoice_value") or 0)
            if inr_total and abs(inr_total - amount) <= max(1.0, amount * 0.01):
                customer = (c.get("extracted") or {}).get("vendor_or_customer_name") or "Zero-Touch sale"
                return {"type": "zte_sale", "id": c["id"], "label": customer, "ar_amount": inr_total}

        candidates = await db.invoices.find(
            {
                "company_id": company_id, "status": {"$nin": ["paid", "cancelled"]},
                "invoice_date": {"$gte": window_from, "$lte": window_to},
            },
            {"_id": 0},
        ).to_list(2000)
        for c in candidates:
            total = float(c.get("grand_total") or c.get("total_amount") or c.get("total") or 0)
            due = c.get("amount_due")
            match_amount = float(due) if due is not None else total
            if match_amount and abs(match_amount - amount) <= max(1.0, amount * 0.01):
                return {"type": "sale", "id": c.get("id"), "label": c.get("client_name") or c.get("invoice_no") or "Sale invoice", "grand_total": total}
    return None


async def _snapshot_prev_match_status(match: dict) -> Optional[str]:
    """Reads the matched record's current status *before* a match overwrites
    it, so Unmatch / Edit Match can restore the exact prior value instead of
    guessing a generic 'unpaid' state. Read-only — never mutates anything."""
    if match["type"] == "purchase":
        rec = await db.purchase_invoices.find_one({"id": match["id"]}, {"_id": 0, "payment_status": 1})
        return (rec or {}).get("payment_status")
    if match["type"] in ("sale",):
        rec = await db.invoices.find_one({"id": match["id"]}, {"_id": 0, "status": 1})
        return (rec or {}).get("status")
    if match["type"] in ("zte_purchase", "zte_sale"):
        rec = await db.zte_processed_documents.find_one({"id": match["id"]}, {"_id": 0, "settled": 1})
        return "settled" if (rec or {}).get("settled") else "unsettled"
    return None


async def _revert_match_effects(txn: dict):
    """Reverses only the reconciliation side-effects of a match — the journal
    entry it posted and the paid/settled flag it set on the matched record —
    restoring the record's exact prior status. Never touches the invoice,
    purchase bill, receipt, GST filing, or audit history themselves; the
    record stays fully intact and simply becomes available to match again.
    Shared by Unmatch and Edit Match so both behave identically."""
    if txn.get("journal_entry_id"):
        await db.journal_lines.delete_many({"entry_id": txn["journal_entry_id"]})
        await db.journal_entries.delete_one({"id": txn["journal_entry_id"]})

    mtype, mid = txn.get("matched_type"), txn.get("matched_id")
    prev_status = txn.get("prev_match_status")
    now = datetime.now(timezone.utc).isoformat()

    if mtype == "purchase" and mid:
        await db.purchase_invoices.update_one(
            {"id": mid},
            {
                "$set": {"payment_status": prev_status, "updated_at": now},
                "$unset": {"paid_amount": "", "paid_date": "", "paid_bank_txn_id": "", "journal_entry_id": ""},
            },
        )
    elif mtype == "sale" and mid:
        restored_status = prev_status or "sent"
        history_entry = {"status": restored_status, "changed_at": now, "changed_by": "system (bank unmatch)"}
        rec = await db.invoices.find_one({"id": mid}, {"_id": 0, "grand_total": 1, "total_amount": 1, "total": 1})
        due_total = float((rec or {}).get("grand_total") or (rec or {}).get("total_amount") or (rec or {}).get("total") or 0)
        await db.invoices.update_one(
            {"id": mid},
            {
                "$set": {"status": restored_status, "amount_paid": 0.0, "amount_due": round(due_total, 2), "updated_at": now},
                "$unset": {"paid_bank_txn_id": "", "journal_entry_id": ""},
                "$push": {"status_history": history_entry},
            },
        )
    elif mtype in ("zte_purchase", "zte_sale") and mid:
        await db.zte_processed_documents.update_one(
            {"id": mid},
            {"$set": {"settled": False}, "$unset": {"settled_bank_txn_id": "", "settled_journal_entry_id": ""}},
        )


async def _auto_post_for_match(company_id: str, txn: dict, match: dict, created_by: str) -> Optional[str]:
    txn["prev_match_status"] = await _snapshot_prev_match_status(match)
    bank_acct_id = await get_default_account_id(company_id, "1010")  # Bank Accounts
    if not bank_acct_id:
        return None

    if match["type"] == "zte_purchase":
        # This invoice already posted Dr Expense / Dr ITC / Cr Accounts
        # Payable via the Zero-Touch Entry Engine — settle that payable
        # rather than booking the expense a second time.
        ap_acct_id = await get_default_account_id(company_id, "2000")  # Accounts Payable
        if not ap_acct_id:
            return None
        entry = await try_auto_post(
            company_id, txn["date"], f"Payment to {match['label']} — settles Zero-Touch Entry invoice (bank statement)",
            [
                {"account_id": ap_acct_id, "account_name": "Accounts Payable", "debit": txn["debit"], "credit": 0},
                {"account_id": bank_acct_id, "account_name": "Bank Accounts", "debit": 0, "credit": txn["debit"]},
            ],
            "bank", txn["id"], created_by,
        )
        if entry:
            await db.zte_processed_documents.update_one(
                {"id": match["id"]},
                {"$set": {"settled": True, "settled_bank_txn_id": txn["id"], "settled_journal_entry_id": entry["id"]}},
            )
        return entry["id"] if entry else None

    if match["type"] == "zte_sale":
        ar_acct_id = await get_default_account_id(company_id, "1100")  # Accounts Receivable
        if not ar_acct_id:
            return None
        entry = await try_auto_post(
            company_id, txn["date"], f"Receipt from {match['label']} — settles Zero-Touch Entry invoice (bank statement)",
            [
                {"account_id": bank_acct_id, "account_name": "Bank Accounts", "debit": txn["credit"], "credit": 0},
                {"account_id": ar_acct_id, "account_name": "Accounts Receivable", "debit": 0, "credit": txn["credit"]},
            ],
            "bank", txn["id"], created_by,
        )
        if entry:
            await db.zte_processed_documents.update_one(
                {"id": match["id"]},
                {"$set": {"settled": True, "settled_bank_txn_id": txn["id"], "settled_journal_entry_id": entry["id"]}},
            )
        return entry["id"] if entry else None

    if match["type"] == "purchase":
        purchases_acct_id = await get_default_account_id(company_id, "5000")  # Purchases
        if not purchases_acct_id:
            return None
        entry = await try_auto_post(
            company_id, txn["date"], f"Payment to {match['label']} (bank statement)",
            [
                {"account_id": purchases_acct_id, "account_name": "Purchases", "debit": txn["debit"], "credit": 0},
                {"account_id": bank_acct_id, "account_name": "Bank Accounts", "debit": 0, "credit": txn["debit"]},
            ],
            "bank", txn["id"], created_by,
        )
        if entry:
            # Close the purchase invoice itself — this is what actually makes
            # it disappear from an "outstanding purchases" view, not just the
            # bank_transactions row.
            await db.purchase_invoices.update_one(
                {"id": match["id"]},
                {"$set": {
                    "payment_status": "paid", "paid_amount": txn["debit"], "paid_date": txn["date"],
                    "paid_bank_txn_id": txn["id"], "journal_entry_id": entry["id"],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
    else:
        ar_acct_id = await get_default_account_id(company_id, "1100")  # Accounts Receivable
        if not ar_acct_id:
            return None
        entry = await try_auto_post(
            company_id, txn["date"], f"Receipt from {match['label']} — settles Invoice {match.get('label')} (bank statement)",
            [
                {"account_id": bank_acct_id, "account_name": "Bank Accounts", "debit": txn["credit"], "credit": 0},
                {"account_id": ar_acct_id, "account_name": "Accounts Receivable", "debit": 0, "credit": txn["credit"]},
            ],
            "bank", txn["id"], created_by,
        )
        if entry:
            # Same convention as PATCH /invoices/{id}/status when a user
            # manually marks an invoice paid, so reports/status filters agree
            # regardless of which path closed the invoice.
            grand_total = match.get("grand_total") or txn["credit"]
            history_entry = {
                "status": "paid", "changed_at": datetime.now(timezone.utc).isoformat(),
                "changed_by": "system (bank reconciliation)",
            }
            await db.invoices.update_one(
                {"id": match["id"]},
                {
                    "$set": {
                        "status": "paid", "amount_paid": round(float(grand_total), 2), "amount_due": 0.0,
                        "paid_bank_txn_id": txn["id"], "journal_entry_id": entry["id"],
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                    "$push": {"status_history": history_entry},
                },
            )
    return entry["id"] if entry else None




@router.post("/bank-accounts/{bank_account_id}/upload-statement")
async def upload_statement(
    bank_account_id: str, file: UploadFile = File(...), auto_match: bool = Form(True),
    current_user: User = Depends(get_current_user),
):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")
    bank_acct = await db.bank_accounts.find_one({"id": bank_account_id}, {"_id": 0})
    if not bank_acct:
        raise HTTPException(404, "Bank account not found.")

    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(413, "File too large — please upload a statement under 15 MB.")
    filename = file.filename or "statement"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    try:
        if ext in ("csv", "xlsx", "xls"):
            parsed_rows = _parse_tabular_statement(contents, filename)
        elif ext == "pdf":
            parsed_rows = await _parse_pdf_statement_via_ai(contents, filename)
        else:
            raise HTTPException(415, f"Unsupported file type '.{ext}'. Upload a CSV, XLSX, or PDF bank statement.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Could not read this statement: {e}")

    if not parsed_rows:
        raise HTTPException(422, "No transactions could be read from this file. Try exporting the statement as CSV or XLSX for the most reliable reading.")

    now = datetime.now(timezone.utc).isoformat()
    saved, matched_count, posted_count = [], 0, 0
    for row in parsed_rows:
        doc = {
            "id": str(uuid.uuid4()), "bank_account_id": bank_account_id, "company_id": bank_acct.get("company_id", ""),
            "date": row["date"], "description": row.get("description", ""), "reference": row.get("reference", ""),
            "debit": row.get("debit", 0.0), "credit": row.get("credit", 0.0), "balance_after": row.get("balance_after"),
            "matched_type": None, "matched_id": None, "matched_label": None, "journal_entry_id": None,
            "source_file": filename, "created_by": current_user.id, "created_at": now,
        }
        # Skip exact duplicates from re-uploading the same statement twice.
        dup = await db.bank_transactions.find_one({
            "bank_account_id": bank_account_id, "date": doc["date"], "debit": doc["debit"],
            "credit": doc["credit"], "description": doc["description"],
        })
        if dup:
            continue

        if auto_match:
            match = await _match_transaction(bank_acct.get("company_id", ""), doc)
            if match:
                doc["matched_type"] = match["type"]
                doc["matched_id"] = match["id"]
                doc["matched_label"] = match["label"]
                matched_count += 1
                entry_id = await _auto_post_for_match(bank_acct.get("company_id", ""), doc, match, current_user.id)
                if entry_id:
                    doc["journal_entry_id"] = entry_id
                    posted_count += 1

        await db.bank_transactions.insert_one(doc)
        doc.pop("_id", None)
        saved.append(doc)

    return {
        "bank_account_id": bank_account_id, "transactions_saved": len(saved),
        "auto_matched": matched_count, "auto_posted": posted_count, "transactions": saved,
    }


@router.get("/bank-accounts/{bank_account_id}/transactions")
async def list_transactions(
    bank_account_id: str, matched: Optional[str] = Query(None, description="matched | unmatched | all"),
    current_user: User = Depends(get_current_user),
):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    q: dict = {"bank_account_id": bank_account_id}
    if matched == "matched":
        q["matched_type"] = {"$ne": None}
    elif matched == "unmatched":
        q["matched_type"] = None
    items = await db.bank_transactions.find(q, {"_id": 0}).sort("date", -1).to_list(20000)
    return items


class ManualMatchInput(BaseModel):
    matched_type: str  # purchase | sale
    matched_id: str
    matched_label: str = ""
    post_journal: bool = True
    confidence: Optional[float] = None   # smart-suggestion confidence % shown to the user at match time, for the audit trail
    reason: str = ""                     # optional note — required by nothing, but stored on the audit entry when given


class UnmatchInput(BaseModel):
    reason: str = ""


async def _log_recon_audit(
    txn: dict, action: str, current_user: User,
    previous_match: Optional[dict] = None, new_match: Optional[dict] = None,
    confidence: Optional[float] = None, reason: str = "",
):
    """Writes one audit entry to the same bank_reconciliation_audit collection
    the Bank Accounts 'Audit' dialog already reads from (via
    GET /bank-transactions/{id}/audit-trail → ReconciliationAudit.get_audit_trail).
    action is one of 'matched' | 'edited' | 'unmatched'."""
    from backend.bank_ai.bank_storage import BankStorage
    record = {
        "bank_transaction_id": txn.get("id"),
        "bank_account_id": txn.get("bank_account_id"),
        "action": action,
        "match_type": "manual",
        "transaction_details": {
            "date": txn.get("date"),
            "narration": txn.get("description"),
            "reference": txn.get("reference"),
            "amount": txn.get("debit") or txn.get("credit"),
            "type": "debit" if txn.get("debit") else "credit",
        },
        "previous_match": previous_match,
        "new_match": new_match,
        "confidence": confidence,
        "reasons": [reason] if reason else ([f"{action.capitalize()} by user."]),
        "reason": reason,
        "matched_by_user": current_user.id,
        "performed_by_name": getattr(current_user, "name", None) or getattr(current_user, "email", None),
    }
    if action == "matched":
        record["matched_by"] = current_user.id
        record["matched_on"] = datetime.now(timezone.utc).isoformat()
    elif action == "edited":
        record["edited_by"] = current_user.id
        record["edited_on"] = datetime.now(timezone.utc).isoformat()
    elif action == "unmatched":
        record["unmatched_by"] = current_user.id
        record["unmatched_on"] = datetime.now(timezone.utc).isoformat()
    try:
        await BankStorage.log_audit_trail(record)
    except Exception:
        pass  # audit logging is best-effort — never blocks the reconciliation action itself


@router.post("/bank-transactions/{txn_id}/match")
async def manual_match_transaction(txn_id: str, payload: ManualMatchInput, current_user: User = Depends(get_current_user)):
    if not _perm_match_bank(current_user):
        raise HTTPException(403, "Access denied. Matching bank transactions requires Match permission — request access from your admin.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Bank transaction not found.")
    if txn.get("matched_type") == payload.matched_type and txn.get("matched_id") == payload.matched_id:
        raise HTTPException(400, "This transaction is already matched to that record.")
    if txn.get("matched_type"):
        raise HTTPException(400, "This transaction is already matched — use Edit Match to change it.")

    update = {"matched_type": payload.matched_type, "matched_id": payload.matched_id, "matched_label": payload.matched_label}
    if payload.post_journal:
        entry_id = await _auto_post_for_match(
            txn.get("company_id", ""), txn,
            {"type": payload.matched_type, "id": payload.matched_id, "label": payload.matched_label}, current_user.id,
        )
        update["prev_match_status"] = txn.get("prev_match_status")
        if entry_id:
            update["journal_entry_id"] = entry_id
    await db.bank_transactions.update_one({"id": txn_id}, {"$set": update})

    await _log_recon_audit(
        txn, "matched", current_user,
        new_match={"type": payload.matched_type, "id": payload.matched_id, "label": payload.matched_label},
        confidence=payload.confidence, reason=payload.reason,
    )
    return {"success": True}


@router.post("/bank-transactions/{txn_id}/edit-match")
async def edit_match_transaction(txn_id: str, payload: ManualMatchInput, current_user: User = Depends(get_current_user)):
    """Atomically replaces an existing match: reverses the previous
    reconciliation's ledger/status effects, then applies the new one. Refuses
    to 're-edit' onto the exact same record (duplicate reconciliation)."""
    if not _perm_match_bank(current_user):
        raise HTTPException(403, "Access denied. Editing a match requires Match permission — request access from your admin.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Bank transaction not found.")
    if not txn.get("matched_type"):
        raise HTTPException(400, "This transaction isn't matched yet — use Match instead of Edit Match.")
    if txn.get("matched_type") == payload.matched_type and txn.get("matched_id") == payload.matched_id:
        raise HTTPException(400, "This transaction is already matched to that record.")

    previous_match = {"type": txn.get("matched_type"), "id": txn.get("matched_id"), "label": txn.get("matched_label")}
    await _revert_match_effects(txn)

    update = {"matched_type": payload.matched_type, "matched_id": payload.matched_id, "matched_label": payload.matched_label,
              "journal_entry_id": None, "prev_match_status": None}
    # txn still carries the OLD journal_entry_id/matched_* in memory — clear
    # them before re-posting so _auto_post_for_match snapshots the record's
    # freshly-reverted status, not the stale one.
    txn["journal_entry_id"] = None
    if payload.post_journal:
        entry_id = await _auto_post_for_match(
            txn.get("company_id", ""), txn,
            {"type": payload.matched_type, "id": payload.matched_id, "label": payload.matched_label}, current_user.id,
        )
        update["prev_match_status"] = txn.get("prev_match_status")
        if entry_id:
            update["journal_entry_id"] = entry_id
    await db.bank_transactions.update_one({"id": txn_id}, {"$set": update})

    new_match = {"type": payload.matched_type, "id": payload.matched_id, "label": payload.matched_label}
    await _log_recon_audit(
        txn, "edited", current_user, previous_match=previous_match, new_match=new_match,
        confidence=payload.confidence, reason=payload.reason,
    )
    return {"success": True}


@router.post("/bank-transactions/{txn_id}/unmatch")
async def unmatch_transaction(txn_id: str, payload: UnmatchInput = UnmatchInput(), current_user: User = Depends(get_current_user)):
    if not _perm_match_bank(current_user):
        raise HTTPException(403, "Access denied. Unmatching requires Match permission — request access from your admin.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Bank transaction not found.")
    if not txn.get("matched_type"):
        raise HTTPException(400, "This transaction isn't matched.")

    previous_match = {"type": txn.get("matched_type"), "id": txn.get("matched_id"), "label": txn.get("matched_label")}
    await _revert_match_effects(txn)
    await db.bank_transactions.update_one(
        {"id": txn_id},
        {"$set": {"matched_type": None, "matched_id": None, "matched_label": None, "journal_entry_id": None, "prev_match_status": None}}
    )
    await _log_recon_audit(txn, "unmatched", current_user, previous_match=previous_match, reason=payload.reason)
    return {"success": True}


class IgnoreInput(BaseModel):
    ignored: bool = True


@router.post("/bank-transactions/{txn_id}/ignore")
async def ignore_transaction(txn_id: str, payload: IgnoreInput = IgnoreInput(), current_user: User = Depends(get_current_user)):
    """Marks an unmatched transaction as ignored (e.g. an internal transfer or
    bank charge that will never have an invoice) so it stops showing up in
    the Unmatched queue. Persisted — unlike a client-side-only flag, it
    survives a page reload. Does not touch matched_type/matched_id, so an
    ignored transaction can still be matched later if that changes."""
    if not _perm_match_bank(current_user):
        raise HTTPException(403, "Access denied. Ignoring a transaction requires Match permission — request access from your admin.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Bank transaction not found.")
    await db.bank_transactions.update_one({"id": txn_id}, {"$set": {"ignored": bool(payload.ignored)}})
    return {"success": True, "ignored": bool(payload.ignored)}


@router.delete("/bank-transactions/{txn_id}")
async def delete_transaction(txn_id: str, current_user: User = Depends(get_current_user)):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if txn and txn.get("journal_entry_id"):
        await db.journal_lines.delete_many({"entry_id": txn["journal_entry_id"]})
        await db.journal_entries.delete_one({"id": txn["journal_entry_id"]})
    result = await db.bank_transactions.delete_one({"id": txn_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Bank transaction not found.")
    return {"success": True}


# ═══════════════════════════════════════════════════════════
# PHASE 8 – BANK INTELLIGENCE & AUTO RECONCILIATION ROUTER
# ═══════════════════════════════════════════════════════════

class BankRulePayload(BaseModel):
    name: str
    pattern: str
    category: str
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    priority: int = 10


class ManualReconcilePayload(BaseModel):
    matched_record_id: Optional[str] = None
    matched_record_type: Optional[str] = None
    category: Optional[str] = None
    coa_account_id: Optional[str] = None
    company_id: str = ""


@router.post("/bank-accounts/{bank_account_id}/process-statement")
async def process_statement_intelligence(
    bank_account_id: str,
    company_id: str = Form(""),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Autonomous Statement processing pipeline (Phase 8).
    Extracts, classifies, matches, posts journals and calculates statistics.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(413, "File exceeds maximum size limits.")

    from backend.bank_ai.bank_engine import BankIntelligenceEngine
    try:
        res = await BankIntelligenceEngine.process_bank_statement(
            file_bytes=file_bytes,
            filename=file.filename or "statement",
            bank_account_id=bank_account_id,
            company_id=company_id,
            user_id=current_user.id
        )
        return res
    except Exception as e:
        raise HTTPException(500, f"Autonomous processing pipeline failed: {e}")


@router.get("/bank-accounts/{bank_account_id}/statistics")
async def get_bank_account_statistics(bank_account_id: str, current_user: User = Depends(get_current_user)):
    """
    Retrieves aggregated reconciliation rates and cash inflows/outflows volumes.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.bank_statistics import BankStatistics
    stats = await BankStatistics.compute_and_save(bank_account_id)
    return stats


@router.get("/bank-accounts/{bank_account_id}/cashflow")
async def get_cashflow_projections(bank_account_id: str, company_id: str = "", current_user: User = Depends(get_current_user)):
    """
    Retrieves 30-60-90 days cash flow projections and historical daily trends.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.cashflow_engine import CashflowEngine
    projections = await CashflowEngine.analyse_and_project(bank_account_id, company_id)
    return projections


@router.get("/bank-accounts/rules")
async def list_active_routing_rules(current_user: User = Depends(get_current_user)):
    """
    Exposes configured bank rules.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.bank_rules import BankRulesManager
    rules = await BankRulesManager.get_all_rules()
    return rules


@router.post("/bank-accounts/rules")
async def create_routing_rule(payload: BankRulePayload, current_user: User = Depends(get_current_user)):
    """
    Adds a new ledger routing rule for automated matching.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.bank_rules import BankRulesManager
    rule_id = await BankRulesManager.create_rule(
        name=payload.name,
        pattern=payload.pattern,
        category=payload.category,
        account_id=payload.account_id,
        account_name=payload.account_name,
        priority=payload.priority
    )
    return {"success": True, "rule_id": rule_id}


@router.delete("/bank-accounts/rules/{rule_id}")
async def delete_routing_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    """
    Deactivates a custom matching rule.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.bank_rules import BankRulesManager
    success = await BankRulesManager.delete_rule(rule_id)
    if not success:
        raise HTTPException(404, "Rule not found or could not be deactivated.")
    return {"success": True}


@router.post("/bank-transactions/{txn_id}/manual-reconcile")
async def manual_reconcile_transaction_api(
    txn_id: str,
    payload: ManualReconcilePayload,
    current_user: User = Depends(get_current_user)
):
    """
    Triggers manual reconciliation, posting necessary ledger updates and ML feedback.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.reconciliation_engine import ReconciliationEngine
    res = await ReconciliationEngine.manual_reconcile(
        bank_transaction_id=txn_id,
        matched_record_id=payload.matched_record_id,
        matched_record_type=payload.matched_record_type,
        category=payload.category,
        coa_account_id=payload.coa_account_id,
        company_id=payload.company_id,
        user_id=current_user.id
    )
    if res.get("status") == "error":
        raise HTTPException(400, res["message"])
    return res


@router.get("/bank-transactions/{txn_id}/audit-trail")
async def get_reconciliation_audit_trail_api(txn_id: str, current_user: User = Depends(get_current_user)):
    """
    Exposes auditable matching factors and confidence reasons for reconciliation choices.
    """
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    
    from backend.bank_ai.reconciliation_audit import ReconciliationAudit
    audit = await ReconciliationAudit.get_audit_trail(txn_id)
    return audit
