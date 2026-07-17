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


@router.get("/bank-accounts/picker-list")
async def picker_list_bank_accounts(current_user: User = Depends(get_current_user)):
    # Lightweight list of bank accounts for select dropdowns
    projection = {
        "_id": 0,
        "id": 1,
        "bank_name": 1,
        "account_holder": 1,
        "account_number_masked": 1,
        "company_id": 1,
    }
    accounts = await db.bank_accounts.find({}, projection).sort("created_at", -1).to_list(500)
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



def _load_as_df(contents: bytes, filename: str, header_mode: str = "infer", skiprows: int = None) -> tuple:
    import pandas as pd
    from io import BytesIO

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    modes = []
    if ext == "csv":
        modes = ["csv", "excel", "html"]
    else:
        modes = ["excel", "html", "csv"]

    errors = {}
    for mode in modes:
        try:
            if mode == "excel":
                h = None if header_mode == "none" else 0
                df = pd.read_excel(BytesIO(contents), header=h, skiprows=skiprows, dtype=str)
                return df, "excel"
            elif mode == "html":
                dfs = pd.read_html(BytesIO(contents), keep_default_na=False)
                if not dfs:
                    raise ValueError("No tables found in HTML content")
                best_df = None
                for candidate_df in dfs:
                    if len(candidate_df) > 0 and len(candidate_df.columns) >= 3:
                        best_df = candidate_df.astype(str)
                        break
                if best_df is None:
                    raise ValueError("No valid table candidate in HTML")
                
                if header_mode == "none":
                    col_row = pd.DataFrame([best_df.columns.tolist()], columns=best_df.columns)
                    best_df = pd.concat([col_row, best_df], ignore_index=True)

                if skiprows is not None and skiprows > 0:
                    best_df = best_df.iloc[skiprows:].reset_index(drop=True)

                return best_df, "html"
            elif mode == "csv":
                h = None if header_mode == "none" else 0
                df = pd.read_csv(BytesIO(contents), header=h, skiprows=skiprows, dtype=str, keep_default_na=False)
                return df, "csv"
        except Exception as e:
            errors[mode] = str(e)
            continue

    raise ValueError(f"Could not parse with any engine (excel, html, csv). Errors: {errors}")


def _parse_tabular_statement(contents: bytes, filename: str) -> List[dict]:
    """CSV / XLSX statements — the overwhelming majority of real-world bank
    exports. Auto-detects the date / narration / debit / credit / balance
    columns regardless of exact header wording or bank."""
    import pandas as pd
    from io import BytesIO

    df, mode_used = _load_as_df(contents, filename, header_mode="infer")

    columns = list(df.columns)
    date_col = _pick_col(columns, _DATE_COL_HINTS)
    if not date_col:
        # Some bank exports have a few banner rows before the real header row
        # — scan the first 15 rows for one that looks like a header.
        raw, _ = _load_as_df(contents, filename, header_mode="none")
        header_row_idx = None
        for i in range(min(15, len(raw))):
            row_vals = [str(v).strip().lower() for v in raw.iloc[i].tolist()]
            if any(any(h in v for h in _DATE_COL_HINTS) for v in row_vals):
                header_row_idx = i
                break
        if header_row_idx is not None:
            df, _ = _load_as_df(contents, filename, header_mode="infer", skiprows=header_row_idx)
            columns = list(df.columns)
            date_col = _pick_col(columns, _DATE_COL_HINTS)

    if not date_col:
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
    """Scanned / exported PDF statements — reuse the same vision pipeline as
    the Purchase invoice reader instead of a second implementation."""
    from backend.ai_document_reader import _groq_vision_multipage
    import pdfplumber
    import json as _json

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
    """Try to match one bank line against a Purchase invoice (if it's a
    debit) or a Sale invoice (if it's a credit) by amount within a small
    tolerance and date within a window either side of the invoice date."""
    txn_date = txn["date"]
    try:
        dt = datetime.strptime(txn_date, "%Y-%m-%d")
    except Exception:
        return None
    window_from = (dt - timedelta(days=30)).date().isoformat()
    window_to = (dt + timedelta(days=30)).date().isoformat()

    if txn["debit"] > 0:
        amount = txn["debit"]
        candidates = await db.purchase_invoices.find(
            {"invoice_date": {"$gte": window_from, "$lte": window_to}}, {"_id": 0}
        ).to_list(2000)
        for c in candidates:
            if abs(float(c.get("grand_total") or 0) - amount) <= max(1.0, amount * 0.01):
                return {"type": "purchase", "id": c["id"], "label": c.get("supplier_name") or c.get("invoice_no") or "Purchase invoice"}
    elif txn["credit"] > 0:
        amount = txn["credit"]
        candidates = await db.invoices.find(
            {"invoice_date": {"$gte": window_from, "$lte": window_to}}, {"_id": 0}
        ).to_list(2000)
        for c in candidates:
            total = float(c.get("grand_total") or c.get("total_amount") or c.get("total") or 0)
            if total and abs(total - amount) <= max(1.0, amount * 0.01):
                return {"type": "sale", "id": c.get("id"), "label": c.get("client_name") or c.get("invoice_no") or "Sale invoice"}
    return None


async def _auto_post_for_match(company_id: str, txn: dict, match: dict, created_by: str) -> Optional[str]:
    bank_acct_id = await get_default_account_id(company_id, "1010")  # Bank Accounts
    if not bank_acct_id:
        return None
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
    else:
        sales_acct_id = await get_default_account_id(company_id, "4000")  # Sales / Fee Income
        if not sales_acct_id:
            return None
        entry = await try_auto_post(
            company_id, txn["date"], f"Receipt from {match['label']} (bank statement)",
            [
                {"account_id": bank_acct_id, "account_name": "Bank Accounts", "debit": txn["credit"], "credit": 0},
                {"account_id": sales_acct_id, "account_name": "Sales / Fee Income", "debit": 0, "credit": txn["credit"]},
            ],
            "bank", txn["id"], created_by,
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


@router.post("/bank-transactions/{txn_id}/match")
async def manual_match_transaction(txn_id: str, payload: ManualMatchInput, current_user: User = Depends(get_current_user)):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Bank transaction not found.")
    update = {"matched_type": payload.matched_type, "matched_id": payload.matched_id, "matched_label": payload.matched_label}
    if payload.post_journal and not txn.get("journal_entry_id"):
        entry_id = await _auto_post_for_match(
            txn.get("company_id", ""), txn,
            {"type": payload.matched_type, "id": payload.matched_id, "label": payload.matched_label}, current_user.id,
        )
        if entry_id:
            update["journal_entry_id"] = entry_id
    await db.bank_transactions.update_one({"id": txn_id}, {"$set": update})
    return {"success": True}


@router.post("/bank-transactions/{txn_id}/unmatch")
async def unmatch_transaction(txn_id: str, current_user: User = Depends(get_current_user)):
    if not _perm_view_bank(current_user):
        raise HTTPException(403, "Access denied.")
    txn = await db.bank_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Bank transaction not found.")
    if txn.get("journal_entry_id"):
        await db.journal_lines.delete_many({"entry_id": txn["journal_entry_id"]})
        await db.journal_entries.delete_one({"id": txn["journal_entry_id"]})
    await db.bank_transactions.update_one(
        {"id": txn_id}, {"$set": {"matched_type": None, "matched_id": None, "matched_label": None, "journal_entry_id": None}}
    )
    return {"success": True}


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
