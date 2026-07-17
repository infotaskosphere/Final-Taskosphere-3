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


async def ensure_default_chart_of_accounts(company_id: str, created_by: str):
    """Insert any DEFAULT_ACCOUNTS codes this company doesn't have yet.
    Deliberately per-code (not 'skip entirely if any account exists') so that
    when new system accounts are added to DEFAULT_ACCOUNTS later (e.g. a new
    expense category), companies that were seeded before that change still
    pick it up automatically the next time their Chart of Accounts loads."""
    existing_codes = set(
        r["code"] for r in await db.chart_of_accounts.find(
            {"company_id": company_id}, {"_id": 0, "code": 1}
        ).to_list(2000)
    )
    missing = [(code, name, typ, sub) for code, name, typ, sub in DEFAULT_ACCOUNTS if code not in existing_codes]
    if not missing:
        return
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
    await guard_deletion(entry_id)
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
    accounts = await db.chart_of_accounts.find({"company_id": company_id}, {"_id": 0}).sort("code", 1).to_list(2000)
    q: dict = {"company_id": company_id}
    if as_of:
        q["entry_date"] = {"$lte": as_of}
    lines = await db.journal_lines.find(q, {"_id": 0}).to_list(50000)
    totals: dict = {}
    for l in lines:
        t = totals.setdefault(l["account_id"], {"debit": 0.0, "credit": 0.0})
        t["debit"] += l["debit"]
        t["credit"] += l["credit"]

    rows, sum_debit, sum_credit = [], 0.0, 0.0
    for a in accounts:
        t = totals.get(a["id"], {"debit": 0.0, "credit": 0.0})
        net = round(t["debit"] - t["credit"], 2)
        debit_bal = net if net > 0 else 0.0
        credit_bal = -net if net < 0 else 0.0
        if a["type"] in ("liability", "equity", "income"):
            # These carry a natural credit balance; flip presentation so a
            # normal balance shows on the credit side.
            debit_bal, credit_bal = credit_bal, debit_bal
        if debit_bal or credit_bal:
            rows.append({"account_id": a["id"], "code": a["code"], "name": a["name"], "type": a["type"], "debit": debit_bal, "credit": credit_bal})
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
    accounts = await db.chart_of_accounts.find({"company_id": company_id, "type": {"$in": ["income", "expense"]}}, {"_id": 0}).to_list(2000)
    acct_by_id = {a["id"]: a for a in accounts}
    q: dict = {"company_id": company_id, "account_id": {"$in": list(acct_by_id.keys())}}
    if date_from or date_to:
        q["entry_date"] = {}
        if date_from:
            q["entry_date"]["$gte"] = date_from
        if date_to:
            q["entry_date"]["$lte"] = date_to
    lines = await db.journal_lines.find(q, {"_id": 0}).to_list(50000)
    income_rows, expense_rows = {}, {}
    for l in lines:
        a = acct_by_id[l["account_id"]]
        bucket = income_rows if a["type"] == "income" else expense_rows
        row = bucket.setdefault(a["id"], {"code": a["code"], "name": a["name"], "amount": 0.0})
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
    as_of = as_of or date.today().isoformat()
    accounts = await db.chart_of_accounts.find({"company_id": company_id, "type": {"$in": ["asset", "liability", "equity"]}}, {"_id": 0}).to_list(2000)
    acct_by_id = {a["id"]: a for a in accounts}
    lines = await db.journal_lines.find(
        {"company_id": company_id, "account_id": {"$in": list(acct_by_id.keys())}, "entry_date": {"$lte": as_of}}, {"_id": 0}
    ).to_list(50000)
    balances: dict = {}
    for l in lines:
        b = balances.setdefault(l["account_id"], 0.0)
        balances[l["account_id"]] = b + l["debit"] - l["credit"]

    assets, liabilities, equity = [], [], []
    for acct_id, net in balances.items():
        a = acct_by_id.get(acct_id)
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
