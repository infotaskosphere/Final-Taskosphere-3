"""
Accounting Core — Chart of Accounts, Journal Entries, General Ledger,
Trial Balance, Profit & Loss, and Balance Sheet.

This is deliberately a standard double-entry engine: every Journal Entry is
a set of lines that must debit-equal-credit before it's allowed to save.
Purchase invoices, Sale invoices, and Bank transactions all post into this
same ledger through `post_journal_entry(...)`, so the reports below reflect
the whole business, not just manually-typed entries.

Scope: one ledger per `company_id` (the firm's own "Sales company/book"
entity already used elsewhere in the app — see /companies/list). Pass
company_id="" to use a single default book if the firm only operates one.
"""

import uuid
import asyncio
from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User

router = APIRouter(tags=["Accounting"])


def _perm_view_coa(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_view_chart_of_accounts"))


def _perm_manage_coa(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_manage_chart_of_accounts"))


def _perm_view_journal(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_view_journal_entries"))


def _perm_post_journal(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_post_journal_entries"))


def _perm_reports(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_view_accounting_reports"))


# ── Default Chart of Accounts (standard Indian SME set) ─────────────────────
DEFAULT_ACCOUNTS = [
    # code, name, type (asset/liability/equity/income/expense), sub_type
    ("1000", "Cash in Hand",            "asset",     "current_asset"),
    ("1010", "Bank Accounts",           "asset",     "current_asset"),
    ("1100", "Accounts Receivable",     "asset",     "current_asset"),
    ("1200", "GST Input Credit",        "asset",     "current_asset"),
    ("1300", "Fixed Assets",            "asset",     "fixed_asset"),
    ("2000", "Accounts Payable",        "liability", "current_liability"),
    ("2100", "GST Output Payable",      "liability", "current_liability"),
    ("2200", "TDS Payable",             "liability", "current_liability"),
    ("3000", "Owner's Capital / Equity","equity",    "equity"),
    ("3100", "Retained Earnings",       "equity",    "equity"),
    ("4000", "Sales / Fee Income",      "income",    "operating_income"),
    ("4100", "Other Income",            "income",    "other_income"),
    ("5000", "Purchases",               "expense",   "cost_of_service"),
    ("5100", "Salaries & Wages",         "expense",   "operating_expense"),
    ("5200", "Rent Expense",             "expense",   "operating_expense"),
    ("5250", "Software & Cloud Expenses","expense",   "operating_expense"),
    ("5300", "Office & Admin Expenses", "expense",   "operating_expense"),
    ("5400", "Bank Charges",             "expense",   "operating_expense"),
    ("5500", "Shipping & Freight",       "expense",   "operating_expense"),
    ("5600", "Travel & Conveyance",      "expense",   "operating_expense"),
    ("5700", "Foreign Exchange Loss / Gain", "expense", "operating_expense"),
    ("5900", "Round Off",               "expense",   "operating_expense"),
]


_ensured_coa_companies: set = set()


async def ensure_default_chart_of_accounts(company_id: str, created_by: str):
    """Insert any DEFAULT_ACCOUNTS codes this company doesn't have yet.
    Deliberately per-code (not 'skip entirely if any account exists') so that
    when new system accounts are added to DEFAULT_ACCOUNTS later (e.g. a new
    expense category), companies that were seeded before that change still
    pick it up automatically the next time their Chart of Accounts loads.

    This gets called for every account lookup during invoice/payment sync
    (2-3 times per invoice), so once a company's default accounts have been
    confirmed present in this process, skip re-scanning the whole
    chart_of_accounts collection on every subsequent call — that repeated
    full scan was the main remaining cost behind slow report loads even
    after debouncing the outer reconcile pass. A fresh deploy/restart clears
    this cache, so newly added DEFAULT_ACCOUNTS codes still get seeded."""
    if company_id in _ensured_coa_companies:
        return
    existing_codes = set(
        r["code"] for r in await db.chart_of_accounts.find(
            {"company_id": company_id}, {"_id": 0, "code": 1}
        ).to_list(2000)
    )
    missing = [(code, name, typ, sub) for code, name, typ, sub in DEFAULT_ACCOUNTS if code not in existing_codes]
    if missing:
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            {
                "id": str(uuid.uuid4()), "company_id": company_id, "code": code, "name": name,
                "type": typ, "sub_type": sub, "is_system": True, "is_active": True,
                "created_by": created_by, "created_at": now,
            }
            for code, name, typ, sub in missing
        ]
        await db.chart_of_accounts.insert_many(docs)
    _ensured_coa_companies.add(company_id)


# ── Models ────────────────────────────────────────────────────────────────
class AccountCreate(BaseModel):
    company_id: str = ""
    code: str
    name: str
    type: str  # asset | liability | equity | income | expense
    sub_type: str = ""


class JournalLine(BaseModel):
    account_id: str
    account_name: str = ""
    debit: float = 0.0
    credit: float = 0.0
    memo: str = ""


class JournalEntryCreate(BaseModel):
    company_id: str = ""
    entry_date: str = Field(default_factory=lambda: date.today().isoformat())
    narration: str = ""
    source: str = "manual"          # manual | purchase | sale | bank
    source_id: Optional[str] = None
    lines: List[JournalLine]


# ── Chart of Accounts routes ─────────────────────────────────────────────
@router.get("/chart-of-accounts")
async def list_accounts(company_id: str = Query(""), current_user: User = Depends(get_current_user)):
    if not _perm_view_coa(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")
    await ensure_default_chart_of_accounts(company_id, current_user.id)
    items = await db.chart_of_accounts.find({"company_id": company_id}, {"_id": 0}).sort("code", 1).to_list(2000)
    return items


@router.post("/chart-of-accounts")
async def create_account(payload: AccountCreate, current_user: User = Depends(get_current_user)):
    if not _perm_manage_coa(current_user):
        raise HTTPException(403, "Access denied.")
    if payload.type not in {"asset", "liability", "equity", "income", "expense"}:
        raise HTTPException(400, "type must be one of asset, liability, equity, income, expense.")
    dup = await db.chart_of_accounts.find_one({"company_id": payload.company_id, "code": payload.code})
    if dup:
        raise HTTPException(409, f"Account code {payload.code} already exists.")
    doc = {
        "id": str(uuid.uuid4()), "company_id": payload.company_id, "code": payload.code.strip(),
        "name": payload.name.strip(), "type": payload.type, "sub_type": payload.sub_type.strip(),
        "is_system": False, "is_active": True, "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chart_of_accounts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/chart-of-accounts/{account_id}")
async def delete_account(account_id: str, current_user: User = Depends(get_current_user)):
    if not _perm_manage_coa(current_user):
        raise HTTPException(403, "Access denied.")
    acct = await db.chart_of_accounts.find_one({"id": account_id})
    if not acct:
        raise HTTPException(404, "Account not found.")
    if acct.get("is_system"):
        raise HTTPException(400, "Default system accounts can't be deleted (they're needed by auto-posting). Mark inactive instead.")
    used = await db.journal_lines.count_documents({"account_id": account_id})
    if used:
        raise HTTPException(400, "This account has journal entries posted against it and can't be deleted.")
    await db.chart_of_accounts.delete_one({"id": account_id})
    return {"success": True}


# ── Journal Entry posting (shared by manual entries, Purchase, Sale, Bank) ──
async def post_journal_entry(
    company_id: str, entry_date: str, narration: str, lines: List[dict],
    source: str, source_id: Optional[str], created_by: str,
) -> dict:
    """Core double-entry post. Raises ValueError if debits != credits.
    Used both by the manual Journal Entry endpoint and by auto-posting hooks
    from Purchase/Sale/Bank so every recorded transaction ends up in the
    same ledger and reports."""
    total_debit = round(sum(float(l.get("debit") or 0) for l in lines), 2)
    total_credit = round(sum(float(l.get("credit") or 0) for l in lines), 2)
    if abs(total_debit - total_credit) > 0.01:
        raise ValueError(f"Journal entry does not balance: debit {total_debit} != credit {total_credit}")
    if total_debit <= 0:
        raise ValueError("Journal entry has no amount.")

    now = datetime.now(timezone.utc).isoformat()
    entry_id = str(uuid.uuid4())
    entry_doc = {
        "id": entry_id, "company_id": company_id, "entry_date": entry_date,
        "narration": narration, "source": source, "source_id": source_id,
        "total_debit": total_debit, "total_credit": total_credit,
        "created_by": created_by, "created_at": now,
    }
    await db.journal_entries.insert_one(entry_doc)

    line_docs = []
    for l in lines:
        line_docs.append({
            "id": str(uuid.uuid4()), "entry_id": entry_id, "company_id": company_id,
            "entry_date": entry_date, "account_id": l["account_id"],
            "account_name": l.get("account_name", ""), "debit": float(l.get("debit") or 0),
            "credit": float(l.get("credit") or 0), "memo": l.get("memo", ""), "created_at": now,
        })
    await db.journal_lines.insert_many(line_docs)
    entry_doc.pop("_id", None)
    return entry_doc


async def try_auto_post(company_id: str, entry_date: str, narration: str, lines: List[dict],
                         source: str, source_id: Optional[str], created_by: str) -> Optional[dict]:
    """Best-effort wrapper for call sites (Purchase/Sale/Bank) that must
    never fail the parent request just because auto-posting hit an edge
    case (e.g. a missing default account on a brand-new company)."""
    try:
        return await post_journal_entry(company_id, entry_date, narration, lines, source, source_id, created_by)
    except Exception:
        return None


async def get_default_account_id(company_id: str, code: str) -> Optional[str]:
    await ensure_default_chart_of_accounts(company_id, "system")
    acct = await db.chart_of_accounts.find_one({"company_id": company_id, "code": code}, {"_id": 0, "id": 1})
    return acct["id"] if acct else None


async def _all_book_ids() -> List[str]:
    """Every distinct book: each real company plus the "" default book (used
    by manual Journal Entries, which have no company selector). Used for the
    'All Companies' report view so it actually aggregates everything instead
    of only showing the empty-company_id book."""
    ids = {""}
    async for c in db.companies.find({}, {"_id": 0, "id": 1}):
        if c.get("id"):
            ids.add(c["id"])
    return list(ids)


async def _reconcile_one_book(company_id: str):
    from backend.invoicing import reconcile_and_sync_all_sales_and_payments, reconcile_and_sync_all_purchases_and_payments
    await asyncio.gather(
        reconcile_and_sync_all_sales_and_payments(company_id),
        reconcile_and_sync_all_purchases_and_payments(company_id),
    )


async def _reconcile_all_books(book_ids: List[str]):
    await asyncio.gather(*(_reconcile_one_book(cid) for cid in book_ids))


@router.post("/journal-entries")
async def create_journal_entry(payload: JournalEntryCreate, current_user: User = Depends(get_current_user)):
    if not _perm_post_journal(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")
    try:
        doc = await post_journal_entry(
            payload.company_id, payload.entry_date, payload.narration.strip(),
            [l.model_dump() for l in payload.lines], "manual", None, current_user.id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return doc


@router.get("/journal-entries")
async def list_journal_entries(
    company_id: str = Query(""), date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None), current_user: User = Depends(get_current_user),
):
    if not _perm_view_journal(current_user):
        raise HTTPException(403, "Access denied.")
    q: dict = {"company_id": company_id}
    if date_from or date_to:
        q["entry_date"] = {}
        if date_from:
            q["entry_date"]["$gte"] = date_from
        if date_to:
            q["entry_date"]["$lte"] = date_to
    if source:
        q["source"] = source
    entries = await db.journal_entries.find(q, {"_id": 0}).sort("entry_date", -1).to_list(2000)
    ids = [e["id"] for e in entries]
    lines = await db.journal_lines.find({"entry_id": {"$in": ids}}, {"_id": 0}).to_list(10000)
    by_entry = {}
    for l in lines:
        by_entry.setdefault(l["entry_id"], []).append(l)
    for e in entries:
        e["lines"] = by_entry.get(e["id"], [])
    return entries


@router.post("/journal-entries/bulk-delete")
async def bulk_delete_journal_entries(payload: dict, current_user: User = Depends(get_current_user)):
    if not _perm_post_journal(current_user):
        raise HTTPException(403, "Access denied.")
    entry_ids = payload.get("entry_ids") or []
    if not entry_ids:
        raise HTTPException(400, "No entry_ids provided.")
    from backend.accounting_lock import guard_deletion
    deleted_ids, failed = [], []
    for entry_id in entry_ids:
        try:
            entry = await db.journal_entries.find_one({"id": entry_id})
            if not entry:
                failed.append({"id": entry_id, "reason": "Not found"})
                continue
            if entry.get("source") != "manual" and current_user.role != "admin":
                failed.append({"id": entry_id, "reason": "Only an admin can delete auto-posted entries"})
                continue
            await guard_deletion(entry_id, current_user)
            deleted_ids.append(entry_id)
        except HTTPException as e:
            failed.append({"id": entry_id, "reason": e.detail})
        except Exception as e:
            failed.append({"id": entry_id, "reason": str(e)})

    if deleted_ids:
        await db.journal_lines.delete_many({"entry_id": {"$in": deleted_ids}})
        await db.journal_entries.delete_many({"id": {"$in": deleted_ids}})

    return {"deleted_count": len(deleted_ids), "failed": failed}


@router.delete("/journal-entries/{entry_id}")
async def delete_journal_entry(entry_id: str, current_user: User = Depends(get_current_user)):
    if not _perm_post_journal(current_user):
        raise HTTPException(403, "Access denied.")
    entry = await db.journal_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(404, "Journal entry not found.")
    if entry.get("source") != "manual" and current_user.role != "admin":
        raise HTTPException(400, "Auto-posted entries can only be reversed by an admin.")
    # Module 4 integrity guard: entries with adjustment-note history, or
    # entries posted by an autonomous pipeline (AI zero-touch entry, GST
    # portal sync, etc.), can never be hard-deleted — only corrected via an
    # Adjustment Note Override. Imported lazily to avoid a circular import.
    from backend.accounting_lock import guard_deletion
    await guard_deletion(entry_id, current_user)
    await db.journal_lines.delete_many({"entry_id": entry_id})
    await db.journal_entries.delete_one({"id": entry_id})
    return {"success": True}


# ── General Ledger ────────────────────────────────────────────────────────
@router.get("/ledger/{account_id}")
async def get_ledger(
    account_id: str, date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    if not _perm_view_journal(current_user) and not _perm_reports(current_user):
        raise HTTPException(403, "Access denied.")
    acct = await db.chart_of_accounts.find_one({"id": account_id}, {"_id": 0})
    if not acct:
        raise HTTPException(404, "Account not found.")
    
    # Auto-reconcile and sync sales invoices, purchase bills, and payments to general ledger
    await _reconcile_one_book(acct.get("company_id") or "")

    q: dict = {"account_id": account_id}
    if date_from or date_to:
        q["entry_date"] = {}
        if date_from:
            q["entry_date"]["$gte"] = date_from
        if date_to:
            q["entry_date"]["$lte"] = date_to
    lines = await db.journal_lines.find(q, {"_id": 0}).sort("entry_date", 1).to_list(10000)
    running = 0.0
    is_debit_normal = acct["type"] in ("asset", "expense")
    for l in lines:
        delta = (l["debit"] - l["credit"]) if is_debit_normal else (l["credit"] - l["debit"])
        running = round(running + delta, 2)
        l["running_balance"] = running
    return {"account": acct, "lines": lines, "closing_balance": running}


# ── Trial Balance ─────────────────────────────────────────────────────────
@router.get("/reports/trial-balance")
async def trial_balance(company_id: str = Query(""), as_of: Optional[str] = Query(None), current_user: User = Depends(get_current_user)):
    if not _perm_reports(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")

    all_companies = not company_id
    # Auto-reconcile and sync sales invoices, purchase bills, and payments to
    # general ledger. "All Companies" must reconcile every book, not just the
    # empty-company_id one, or entries tied to a real company never show up.
    if all_companies:
        await _reconcile_all_books(await _all_book_ids())
    else:
        await _reconcile_one_book(company_id)

    acct_q = {} if all_companies else {"company_id": company_id}
    accounts = await db.chart_of_accounts.find(acct_q, {"_id": 0}).sort("code", 1).to_list(20000)
    q: dict = {} if all_companies else {"company_id": company_id}
    if as_of:
        q["entry_date"] = {"$lte": as_of}
    lines = await db.journal_lines.find(q, {"_id": 0}).to_list(200000)
    totals: dict = {}
    for l in lines:
        t = totals.setdefault(l["account_id"], {"debit": 0.0, "credit": 0.0})
        t["debit"] += l["debit"]
        t["credit"] += l["credit"]

    # When aggregating across companies, the same account *code* (e.g. "1000
    # Cash in Hand") exists as a different account_id in each company's book,
    # so roll totals up by code rather than by id.
    by_key: dict = {}
    for a in accounts:
        key = a["code"] if all_companies else a["id"]
        entry = by_key.setdefault(key, {"code": a["code"], "name": a["name"], "type": a["type"], "account_ids": []})
        entry["account_ids"].append(a["id"])

    rows, sum_debit, sum_credit = [], 0.0, 0.0
    for key, entry in sorted(by_key.items(), key=lambda kv: kv[1]["code"]):
        debit = sum(totals.get(aid, {"debit": 0.0}).get("debit", 0.0) for aid in entry["account_ids"])
        credit = sum(totals.get(aid, {"credit": 0.0}).get("credit", 0.0) for aid in entry["account_ids"])
        net = round(debit - credit, 2)
        # debit-credit already lands correctly in the debit/credit column
        # based on its sign for every account type: a positive net (debit
        # exceeds credit) is a debit balance, a negative net is a credit
        # balance. This is true for credit-normal accounts (liability,
        # equity, income) too, since normal activity on them naturally
        # produces a negative net here — no type-based flip is needed, and
        # applying one (as this used to) inverted those accounts into the
        # wrong column and made the sheet look permanently unbalanced.
        debit_bal = net if net > 0 else 0.0
        credit_bal = -net if net < 0 else 0.0
        if debit_bal or credit_bal:
            rows.append({"account_id": key, "code": entry["code"], "name": entry["name"], "type": entry["type"], "debit": debit_bal, "credit": credit_bal})
            sum_debit += debit_bal
            sum_credit += credit_bal
    return {"rows": rows, "total_debit": round(sum_debit, 2), "total_credit": round(sum_credit, 2), "balanced": abs(sum_debit - sum_credit) < 0.02}


# ── Profit & Loss ─────────────────────────────────────────────────────────
@router.get("/reports/profit-loss")
async def profit_and_loss(
    company_id: str = Query(""), date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    if not _perm_reports(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")

    all_companies = not company_id
    # Auto-reconcile and sync sales invoices, purchase bills, and payments to
    # general ledger. "All Companies" must reconcile every book, not just the
    # empty-company_id one, or entries tied to a real company never show up.
    if all_companies:
        await _reconcile_all_books(await _all_book_ids())
    else:
        await _reconcile_one_book(company_id)

    acct_q = {"type": {"$in": ["income", "expense"]}}
    if not all_companies:
        acct_q["company_id"] = company_id
    accounts = await db.chart_of_accounts.find(acct_q, {"_id": 0}).to_list(20000)
    acct_by_id = {a["id"]: a for a in accounts}
    q: dict = {"account_id": {"$in": list(acct_by_id.keys())}}
    if not all_companies:
        q["company_id"] = company_id
    if date_from or date_to:
        q["entry_date"] = {}
        if date_from:
            q["entry_date"]["$gte"] = date_from
        if date_to:
            q["entry_date"]["$lte"] = date_to
    lines = await db.journal_lines.find(q, {"_id": 0}).to_list(200000)
    income_rows, expense_rows = {}, {}
    for l in lines:
        a = acct_by_id[l["account_id"]]
        bucket = income_rows if a["type"] == "income" else expense_rows
        # Roll up by code (not account_id) when aggregating across companies,
        # since the same account code is a different id in each book.
        key = a["code"] if all_companies else a["id"]
        row = bucket.setdefault(key, {"code": a["code"], "name": a["name"], "amount": 0.0})
        if a["type"] == "income":
            row["amount"] += l["credit"] - l["debit"]
        else:
            row["amount"] += l["debit"] - l["credit"]
    income_rows = sorted(income_rows.values(), key=lambda r: r["code"])
    expense_rows = sorted(expense_rows.values(), key=lambda r: r["code"])
    total_income = round(sum(r["amount"] for r in income_rows), 2)
    total_expense = round(sum(r["amount"] for r in expense_rows), 2)
    return {
        "income": income_rows, "expenses": expense_rows,
        "total_income": total_income, "total_expense": total_expense,
        "net_profit": round(total_income - total_expense, 2),
    }


# ── Balance Sheet ─────────────────────────────────────────────────────────
@router.get("/reports/balance-sheet")
async def balance_sheet(company_id: str = Query(""), as_of: Optional[str] = Query(None), current_user: User = Depends(get_current_user)):
    if not _perm_reports(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")

    all_companies = not company_id
    # Auto-reconcile and sync sales invoices, purchase bills, and payments to
    # general ledger. "All Companies" must reconcile every book, not just the
    # empty-company_id one, or entries tied to a real company never show up.
    if all_companies:
        await _reconcile_all_books(await _all_book_ids())
    else:
        await _reconcile_one_book(company_id)

    as_of = as_of or date.today().isoformat()
    acct_q = {"type": {"$in": ["asset", "liability", "equity"]}}
    if not all_companies:
        acct_q["company_id"] = company_id
    accounts = await db.chart_of_accounts.find(acct_q, {"_id": 0}).to_list(20000)
    acct_by_id = {a["id"]: a for a in accounts}
    line_q: dict = {"account_id": {"$in": list(acct_by_id.keys())}, "entry_date": {"$lte": as_of}}
    if not all_companies:
        line_q["company_id"] = company_id
    lines = await db.journal_lines.find(line_q, {"_id": 0}).to_list(200000)
    balances: dict = {}
    for l in lines:
        # Roll up by code (not account_id) when aggregating across companies,
        # since the same account code is a different id in each book.
        a = acct_by_id.get(l["account_id"])
        if not a:
            continue
        key = a["code"] if all_companies else l["account_id"]
        b = balances.setdefault(key, 0.0)
        balances[key] = b + l["debit"] - l["credit"]

    acct_by_key = {(a["code"] if all_companies else a["id"]): a for a in accounts}
    assets, liabilities, equity = [], [], []
    for key, net in balances.items():
        a = acct_by_key.get(key)
        if not a or abs(net) < 0.01:
            continue
        row = {"code": a["code"], "name": a["name"], "amount": round(net, 2) if a["type"] == "asset" else round(-net, 2)}
        (assets if a["type"] == "asset" else liabilities if a["type"] == "liability" else equity).append(row)

    total_assets = round(sum(r["amount"] for r in assets), 2)
    total_liabilities = round(sum(r["amount"] for r in liabilities), 2)
    total_equity = round(sum(r["amount"] for r in equity), 2)
    return {
        "as_of": as_of, "assets": sorted(assets, key=lambda r: r["code"]),
        "liabilities": sorted(liabilities, key=lambda r: r["code"]),
        "equity": sorted(equity, key=lambda r: r["code"]),
        "total_assets": total_assets, "total_liabilities": total_liabilities, "total_equity": total_equity,
        "balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.02,
    }


# ── Party Ledger (Customer / Vendor statement) ──────────────────────────────
@router.get("/reports/parties")
async def list_ledger_parties(company_id: str = Query(""), current_user: User = Depends(get_current_user)):
    """Every distinct client/supplier name that has at least one invoice, bill,
    or payment — used to populate the Party Ledger picker."""
    if not _perm_reports(current_user):
        raise HTTPException(403, "Access denied.")
    inv_q, pur_q = {}, {}
    if company_id:
        inv_q["company_id"] = company_id
        pur_q["company_id"] = company_id
    customers = await db.invoices.distinct("client_name", inv_q)
    vendors = await db.purchase_invoices.distinct("supplier_name", pur_q)
    return {
        "customers": sorted([c for c in customers if c]),
        "vendors": sorted([v for v in vendors if v]),
    }


@router.get("/reports/party-ledger")
async def party_ledger(
    party_name: str = Query(...), party_type: str = Query("customer"), company_id: str = Query(""),
    date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Statement of every transaction for one customer or vendor — invoices/
    bills, receipts/payments, and credit/debit notes — with a running
    balance, drawn from the same journal entries that back the other
    reports (so it always agrees with Trial Balance / Balance Sheet)."""
    if not _perm_reports(current_user):
        raise HTTPException(403, "Access denied.")

    all_companies = not company_id
    if all_companies:
        await _reconcile_all_books(await _all_book_ids())
    else:
        await _reconcile_one_book(company_id)

    base_q: dict = {} if all_companies else {"company_id": company_id}

    if party_type == "vendor":
        doc_q = {**base_q, "supplier_name": party_name}
        bills = await db.purchase_invoices.find(doc_q, {"_id": 0, "id": 1}).to_list(20000)
        bill_ids = [b["id"] for b in bills]
        pay_q = {**base_q, "$or": [{"supplier_name": party_name}, {"purchase_invoice_id": {"$in": bill_ids}}]}
        payments = await db.purchase_payments.find(pay_q, {"_id": 0, "id": 1}).to_list(20000)
        source_ids = bill_ids + [p["id"] for p in payments]
        sources = ["purchase", "purchase_payment"]
        control_code = "2000"  # Accounts Payable
    else:
        doc_q = {**base_q, "client_name": party_name}
        invoices = await db.invoices.find(doc_q, {"_id": 0, "id": 1}).to_list(20000)
        inv_ids = [i["id"] for i in invoices]
        pay_q = {**base_q, "$or": [{"client_name": party_name}, {"invoice_id": {"$in": inv_ids}}]}
        payments = await db.payments.find(pay_q, {"_id": 0, "id": 1}).to_list(20000)
        source_ids = inv_ids + [p["id"] for p in payments]
        sources = ["sale", "payment"]
        control_code = "1100"  # Accounts Receivable

    if not source_ids:
        return {"party_name": party_name, "party_type": party_type, "rows": [], "closing_balance": 0.0}

    entry_q: dict = {**base_q, "source": {"$in": sources}, "source_id": {"$in": source_ids}}
    if date_from or date_to:
        entry_q["entry_date"] = {}
        if date_from:
            entry_q["entry_date"]["$gte"] = date_from
        if date_to:
            entry_q["entry_date"]["$lte"] = date_to
    entries = await db.journal_entries.find(entry_q, {"_id": 0}).sort("entry_date", 1).to_list(20000)
    entry_ids = [e["id"] for e in entries]
    lines = await db.journal_lines.find({"entry_id": {"$in": entry_ids}}, {"_id": 0}).to_list(50000)
    lines_by_entry: dict = {}
    for l in lines:
        lines_by_entry.setdefault(l["entry_id"], []).append(l)

    # Only the control-account line (AR for customers, AP for vendors)
    # drives the running balance — the offsetting line (Sales/Bank/etc.) is
    # informational only, same convention as Tally/Zoho party statements.
    # Resolve every account id that matches the control code once up front
    # (there can be more than one across companies when aggregating "All
    # Companies") rather than querying per entry.
    coa_q = {"code": control_code}
    if not all_companies:
        coa_q["company_id"] = company_id
    control_acct_ids = {a["id"] for a in await db.chart_of_accounts.find(coa_q, {"_id": 0, "id": 1}).to_list(2000)}

    rows, balance = [], 0.0
    for e in entries:
        control_line = next(
            (l for l in lines_by_entry.get(e["id"], []) if l["account_id"] in control_acct_ids), None
        )
        if not control_line:
            continue
        movement = control_line["debit"] - control_line["credit"]
        balance = round(balance + movement, 2)
        rows.append({
            "date": e["entry_date"], "narration": e["narration"], "source": e["source"],
            "debit": round(control_line["debit"], 2), "credit": round(control_line["credit"], 2),
            "balance": balance,
        })

    return {"party_name": party_name, "party_type": party_type, "rows": rows, "closing_balance": balance}
