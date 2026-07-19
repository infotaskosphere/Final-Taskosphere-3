"""
Reconciliation Validation Engine
─────────────────────────────────
Implements the cross-report consistency checks required by the
"Accounting ↔ Invoicing single source of truth" policy:

    Revenue                = Collections + Outstanding
    Trial Balance Debits   = Trial Balance Credits
    Accounts Receivable    = Invoice-module Outstanding
    Customer Ledger Total  = Accounts Receivable
    Sales Ledger           = Invoice Revenue
    GST Sales + Non-GST Sales + Export + Exempt = Revenue

The Invoice module (backend/invoicing.py) remains the single source of
truth for Sales / Receivable / Outstanding figures. This engine never
recomputes those figures independently — it only compares the derived
accounting reports (Trial Balance, Party/Customer Ledger, GST reports)
against the invoice-module totals, and if they disagree it re-runs the
existing sync/reconcile pipeline (never a second, competing calculation)
and logs what happened so the drift can be traced back to specific
invoices.

This module intentionally does not introduce a new persistence layer for
Sales/Receivable/Outstanding — it reuses:
  • accounting_core._reconcile_one_book / _reconcile_all_books
    (invoice → journal sync, already the single write path into the GL)
  • accounting_core.trial_balance / _compute_party_ledger
  • invoicing.invoice_stats-style totals (Revenue/Collections/Outstanding)
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import logging

from backend.dependencies import db

logger = logging.getLogger("reconciliation_validator")

TOLERANCE = 0.05  # rupees — floating point / rounding slack


def _round2(v: float) -> float:
    return round(float(v or 0), 2)


async def _invoice_totals(company_id: str) -> Dict[str, float]:
    """Revenue / Collections / Outstanding straight from the invoice
    module's own fields (grand_total / amount_paid / amount_due) —
    never re-derived from workflow status. Cancelled invoices are
    excluded, matching invoicing.invoice_stats()."""
    q: dict = {"invoice_type": "tax_invoice", "status": {"$ne": "cancelled"}}
    if company_id:
        q["company_id"] = company_id
    invs = await db.invoices.find(
        q, {"_id": 0, "grand_total": 1, "amount_paid": 1, "amount_due": 1,
            "total_gst": 1, "is_gst_invoice": 1, "invoice_category": 1, "gst_type": 1}
    ).to_list(200000)

    revenue = sum(_round2(i.get("grand_total")) for i in invs)
    collections = sum(_round2(i.get("amount_paid")) for i in invs)
    outstanding = sum(max(0.0, _round2(i.get("amount_due"))) for i in invs)

    def _bucket(i: dict) -> str:
        # An invoice is a GST invoice if it actually carries GST value or is
        # explicitly flagged as one; export/exempt are called out separately
        # where the data marks them, everything else is "domestic non-GST".
        gst_type = (i.get("gst_type") or i.get("invoice_category") or "").lower()
        if "export" in gst_type:
            return "export"
        if "exempt" in gst_type:
            return "exempt"
        if i.get("is_gst_invoice") or _round2(i.get("total_gst")) > 0:
            return "gst"
        return "non_gst"

    gst_sales = sum(_round2(i.get("grand_total")) for i in invs if _bucket(i) == "gst")
    non_gst_sales = sum(_round2(i.get("grand_total")) for i in invs if _bucket(i) == "non_gst")
    export_sales = sum(_round2(i.get("grand_total")) for i in invs if _bucket(i) == "export")
    exempt_sales = sum(_round2(i.get("grand_total")) for i in invs if _bucket(i) == "exempt")

    return {
        "revenue": _round2(revenue),
        "collections": _round2(collections),
        "outstanding": _round2(outstanding),
        "gst_sales": _round2(gst_sales),
        "non_gst_sales": _round2(non_gst_sales),
        "export_sales": _round2(export_sales),
        "exempt_sales": _round2(exempt_sales),
    }


async def _trial_balance_snapshot(company_id: str) -> Dict[str, Any]:
    """Pull the account-level totals the validator needs directly from
    journal_lines / chart_of_accounts — the same data trial_balance()
    in accounting_core.py reports, without going through the HTTP layer."""
    acct_q = {"company_id": company_id} if company_id else {}
    accounts = await db.chart_of_accounts.find(acct_q, {"_id": 0}).to_list(20000)
    line_q = {"company_id": company_id} if company_id else {}
    lines = await db.journal_lines.find(line_q, {"_id": 0}).to_list(200000)

    totals: Dict[str, Dict[str, float]] = {}
    for l in lines:
        t = totals.setdefault(l["account_id"], {"debit": 0.0, "credit": 0.0})
        t["debit"] += l["debit"]
        t["credit"] += l["credit"]

    sum_debit = sum(t["debit"] for t in totals.values())
    sum_credit = sum(t["credit"] for t in totals.values())

    def _net_for_code(code: str) -> float:
        ids = {a["id"] for a in accounts if a["code"] == code}
        debit = sum(totals.get(i, {}).get("debit", 0.0) for i in ids)
        credit = sum(totals.get(i, {}).get("credit", 0.0) for i in ids)
        return debit - credit

    return {
        "total_debit": _round2(sum_debit),
        "total_credit": _round2(sum_credit),
        "accounts_receivable": _round2(_net_for_code("1100")),
        "sales_ledger": _round2(-_net_for_code("4000")),  # income is credit-normal
    }


async def _customer_ledger_total(company_id: str) -> float:
    """Sum of the Accounts Receivable movements that resolve to a named
    customer. invoicing.py posts every sale/payment onto the single
    control account (code 1100, resolved via get_default_account_id) —
    it does not use party_ledgers.py's per-party sub-accounts — so
    'Customer Ledger Total' here means: of everything sitting on 1100,
    how much of it is attributable to an actual invoice/payment with a
    client_name. Any gap versus the full Accounts Receivable balance is
    an orphaned posting that isn't showing up in any customer's
    statement — the real-world case this check exists to catch, matching
    the pattern already used by /control-accounts/verify in
    party_ledgers.py for the same purpose on the party-sub-account path."""
    acct_q = {"code": "1100"}
    if company_id:
        acct_q["company_id"] = company_id
    ar_ids = {a["id"] for a in await db.chart_of_accounts.find(acct_q, {"_id": 0, "id": 1}).to_list(2000)}
    if not ar_ids:
        return 0.0

    lines = await db.journal_lines.find(
        {"account_id": {"$in": list(ar_ids)}}, {"_id": 0, "entry_id": 1, "debit": 1, "credit": 1}
    ).to_list(200000)
    if not lines:
        return 0.0

    entry_ids = list({l["entry_id"] for l in lines})
    entries = await db.journal_entries.find(
        {"id": {"$in": entry_ids}, "source": {"$in": ["sale", "payment"]}},
        {"_id": 0, "id": 1, "source_id": 1},
    ).to_list(200000)
    source_id_by_entry = {e["id"]: e.get("source_id") for e in entries}

    base_q: dict = {"company_id": company_id} if company_id else {}
    inv_ids = {i["id"] for i in await db.invoices.find(
        {**base_q, "client_name": {"$exists": True, "$ne": ""}}, {"_id": 0, "id": 1}
    ).to_list(200000)}
    pay_ids = {p["id"] for p in await db.payments.find(
        {**base_q, "client_name": {"$exists": True, "$ne": ""}}, {"_id": 0, "id": 1}
    ).to_list(200000)}
    valid_source_ids = inv_ids | pay_ids

    total = 0.0
    for l in lines:
        src = source_id_by_entry.get(l["entry_id"])
        if src in valid_source_ids:
            total += (l.get("debit") or 0) - (l.get("credit") or 0)
    return _round2(total)


async def run_validation_engine(company_id: str = "", auto_fix: bool = True) -> Dict[str, Any]:
    """Run every consistency check for one book (company_id="" = the
    default/manual book). Rebuilds the GL from invoices first via the
    existing reconcile pipeline, checks the six equations, and — on any
    mismatch — reruns the reconcile pipeline once more (the only 'fix'
    this engine performs; it never patches figures directly) before
    logging a reconciliation event."""
    from backend.accounting_core import _reconcile_one_book  # local import: avoid circular import at module load

    await _reconcile_one_book(company_id)

    async def _snapshot():
        inv = await _invoice_totals(company_id)
        tb = await _trial_balance_snapshot(company_id)
        cust_total = await _customer_ledger_total(company_id)
        return inv, tb, cust_total

    inv, tb, cust_total = await _snapshot()

    def _check(inv, tb, cust_total) -> List[Dict[str, Any]]:
        mismatches = []

        diff = _round2(inv["revenue"] - (inv["collections"] + inv["outstanding"]))
        if abs(diff) > TOLERANCE:
            mismatches.append({
                "rule": "Revenue = Collections + Outstanding",
                "expected": inv["revenue"], "actual": _round2(inv["collections"] + inv["outstanding"]),
                "diff": diff,
            })

        diff = _round2(tb["total_debit"] - tb["total_credit"])
        if abs(diff) > TOLERANCE:
            mismatches.append({
                "rule": "Trial Balance Debits = Credits",
                "expected": tb["total_debit"], "actual": tb["total_credit"], "diff": diff,
            })

        diff = _round2(tb["accounts_receivable"] - inv["outstanding"])
        if abs(diff) > TOLERANCE:
            mismatches.append({
                "rule": "Accounts Receivable = Outstanding",
                "expected": inv["outstanding"], "actual": tb["accounts_receivable"], "diff": diff,
            })

        diff = _round2(cust_total - tb["accounts_receivable"])
        if abs(diff) > TOLERANCE:
            mismatches.append({
                "rule": "Customer Ledger Total = Accounts Receivable",
                "expected": tb["accounts_receivable"], "actual": cust_total, "diff": diff,
            })

        diff = _round2(tb["sales_ledger"] - inv["revenue"])
        if abs(diff) > TOLERANCE:
            mismatches.append({
                "rule": "Sales Ledger = Invoice Revenue",
                "expected": inv["revenue"], "actual": tb["sales_ledger"], "diff": diff,
            })

        gst_total = inv["gst_sales"] + inv["non_gst_sales"] + inv["export_sales"] + inv["exempt_sales"]
        diff = _round2(gst_total - inv["revenue"])
        if abs(diff) > TOLERANCE:
            mismatches.append({
                "rule": "GST + Non-GST + Export + Exempt Sales = Revenue",
                "expected": inv["revenue"], "actual": gst_total, "diff": diff,
            })

        return mismatches

    mismatches = _check(inv, tb, cust_total)
    healed = False

    if mismatches and auto_fix:
        # Never recompute figures by hand — rerun the single write path
        # (invoice → journal sync) and re-check once. If it still
        # disagrees after that, the drift is real and gets logged for
        # investigation rather than silently patched.
        await _reconcile_one_book(company_id)
        inv, tb, cust_total = await _snapshot()
        remaining = _check(inv, tb, cust_total)
        healed = len(remaining) < len(mismatches)
        mismatches = remaining

    report = {
        "company_id": company_id,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "passed": len(mismatches) == 0,
        "mismatches": mismatches,
        "healed_by_rebuild": healed,
        "figures": {
            "revenue": inv["revenue"], "collections": inv["collections"], "outstanding": inv["outstanding"],
            "trial_balance_debit": tb["total_debit"], "trial_balance_credit": tb["total_credit"],
            "accounts_receivable": tb["accounts_receivable"], "sales_ledger": tb["sales_ledger"],
            "customer_ledger_total": cust_total,
            "gst_sales": inv["gst_sales"], "non_gst_sales": inv["non_gst_sales"],
            "export_sales": inv["export_sales"], "exempt_sales": inv["exempt_sales"],
        },
    }

    if mismatches:
        logger.warning(f"[reconciliation-event] company={company_id or '(default book)'} "
                        f"mismatches={[m['rule'] for m in mismatches]}")
        await db.reconciliation_events.insert_one({**report, "_id": None})
        report.pop("_id", None)

    return report


async def run_validation_engine_all_books() -> List[Dict[str, Any]]:
    """Run the engine across every book — used by the 'All Companies'
    view and by the scheduled/health-check entry point."""
    from backend.accounting_core import _all_book_ids

    reports = []
    for book_id in await _all_book_ids():
        reports.append(await run_validation_engine(book_id))
    return reports
