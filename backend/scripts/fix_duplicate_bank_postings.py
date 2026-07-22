"""
Detect (and, with --apply, clean up) duplicate Accounts-Receivable-settlement
journal entries caused by the bug fixed in invoicing.update_invoice_status():

  Bank reconciliation settles an invoice by posting Dr Bank / Cr AR directly
  and stamping paid_bank_txn_id + journal_entry_id onto the invoice — it
  never creates a `payments` doc. The status-toggle endpoint used to compute
  "has this invoice already been paid?" purely from db.payments, so
  re-touching an already bank-matched invoice's status could post a SECOND
  Dr Bank / Cr AR for the same real-world receipt.

This script is READ-ONLY by default. It reports every invoice where the
total posted to Accounts Receivable (1100) for that invoice exceeds its
grand_total, and separates findings into:

  • SAFE TO AUTO-FIX  — the invoice has a real bank-matched settlement
    (paid_bank_txn_id + a journal entry that's still in the DB) *and* one or
    more `payments` docs flagged auto_generated=True whose own journal
    entries are the duplicate. These auto-generated receipts were never real
    money — they were synthesized by the status-toggle endpoint — so removing
    them (and their journal entries) is safe and reverses exactly the bug.

  • NEEDS MANUAL REVIEW — any other over-credit pattern (e.g. two manually
    recorded payments, or a duplicate that isn't tagged auto_generated).
    The script never deletes these; a human needs to look at which receipt
    is the real one.

Usage:
    python -m backend.scripts.fix_duplicate_bank_postings                # dry run, all companies
    python -m backend.scripts.fix_duplicate_bank_postings --company-id X # dry run, one company
    python -m backend.scripts.fix_duplicate_bank_postings --apply        # actually delete the
                                                                          # SAFE TO AUTO-FIX entries
    python -m backend.scripts.fix_duplicate_bank_postings --apply --invoice-id INV123
                                                                          # apply to just one invoice,
                                                                          # useful to verify on a
                                                                          # single case first

Always run without --apply first and read the report before applying anything.
"""
import argparse
import asyncio
from datetime import datetime, timezone

from backend.dependencies import db

TOLERANCE = 0.05


async def _ar_account_ids(company_id: str) -> set:
    q = {"code": "1100"}
    if company_id:
        q["company_id"] = company_id
    return {a["id"] for a in await db.chart_of_accounts.find(q, {"_id": 0, "id": 1}).to_list(2000)}


async def audit(company_id: str = "", invoice_id: str = None):
    """Returns (safe_to_fix, needs_review) — both lists of dicts describing
    one over-credited invoice each."""
    ar_ids = await _ar_account_ids(company_id)
    if not ar_ids:
        return [], []

    inv_q = {"status": {"$ne": "cancelled"}}
    if company_id:
        inv_q["company_id"] = company_id
    if invoice_id:
        inv_q["id"] = invoice_id
    invoices = await db.invoices.find(inv_q, {"_id": 0}).to_list(200000)

    # All AR-touching lines, grouped by entry_id, in one query.
    ar_lines = await db.journal_lines.find(
        {"account_id": {"$in": list(ar_ids)}}, {"_id": 0}
    ).to_list(500000)
    lines_by_entry: dict = {}
    for l in ar_lines:
        lines_by_entry.setdefault(l["entry_id"], []).append(l)

    entry_ids = list(lines_by_entry.keys())
    entries = await db.journal_entries.find(
        {"id": {"$in": entry_ids}, "source": {"$in": ["sale", "payment", "bank"]}}, {"_id": 0}
    ).to_list(500000)
    entries_by_id = {e["id"]: e for e in entries}

    # payment_id -> payment doc, for resolving source="payment" entries back to an invoice_id.
    payments = await db.payments.find({}, {"_id": 0}).to_list(500000)
    payment_by_id = {p["id"]: p for p in payments}

    safe_to_fix, needs_review = [], []

    for inv in invoices:
        inv_id = inv["id"]
        grand_total = float(inv.get("grand_total") or 0)
        if grand_total <= 0:
            continue

        # Every AR-settlement entry attributable to this invoice, whichever
        # of the two write paths created it.
        matching_entries = []
        for eid, e in entries_by_id.items():
            src, sid = e.get("source"), e.get("source_id")
            belongs = False
            if src == "payment" and sid in payment_by_id and payment_by_id[sid].get("invoice_id") == inv_id:
                belongs = True
            elif src == "bank" and sid == inv.get("paid_bank_txn_id"):
                belongs = True
            if belongs:
                credit = sum(l["credit"] for l in lines_by_entry[eid])
                matching_entries.append({"entry": e, "credit": credit, "payment": payment_by_id.get(sid) if src == "payment" else None})

        total_credited = round(sum(m["credit"] for m in matching_entries), 2)
        excess = round(total_credited - grand_total, 2)
        if excess <= TOLERANCE:
            continue

        finding = {
            "invoice_id": inv_id,
            "invoice_no": inv.get("invoice_no"),
            "client_name": inv.get("client_name"),
            "grand_total": grand_total,
            "total_credited_to_ar": total_credited,
            "excess": excess,
            "entries": [
                {
                    "journal_entry_id": m["entry"]["id"],
                    "source": m["entry"]["source"],
                    "entry_date": m["entry"].get("entry_date"),
                    "credit": m["credit"],
                    "auto_generated_payment": bool(m["payment"] and m["payment"].get("auto_generated")),
                    "payment_id": m["payment"]["id"] if m["payment"] else None,
                }
                for m in matching_entries
            ],
        }

        # SAFE case: exactly one bank-matched entry (the real receipt) plus
        # one or more auto_generated-payment entries whose combined credit
        # equals the excess. Delete only the auto_generated ones.
        bank_entries = [m for m in matching_entries if m["entry"]["source"] == "bank"]
        auto_entries = [m for m in matching_entries if m["payment"] and m["payment"].get("auto_generated")]
        auto_total = round(sum(m["credit"] for m in auto_entries), 2)
        if bank_entries and auto_entries and abs(auto_total - excess) <= TOLERANCE:
            finding["fixable_entries"] = [m["entry"]["id"] for m in auto_entries]
            finding["fixable_payment_ids"] = [m["payment"]["id"] for m in auto_entries]
            safe_to_fix.append(finding)
        else:
            needs_review.append(finding)

    return safe_to_fix, needs_review


async def apply_fix(safe_to_fix: list):
    """Deletes the auto_generated payment docs and their journal entries
    identified by audit(). Never touches bank-matched entries or manually
    recorded payments."""
    fixed = []
    for finding in safe_to_fix:
        je_ids = finding["fixable_entries"]
        pay_ids = finding["fixable_payment_ids"]
        await db.journal_lines.delete_many({"entry_id": {"$in": je_ids}})
        await db.journal_entries.delete_many({"id": {"$in": je_ids}})
        await db.payments.delete_many({"id": {"$in": pay_ids}})
        # Re-sync amount_paid/amount_due on the invoice to match reality now
        # that the phantom receipt is gone.
        await db.invoices.update_one(
            {"id": finding["invoice_id"]},
            {"$set": {
                "amount_paid": round(finding["grand_total"], 2),
                "amount_due": 0.0,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        fixed.append(finding["invoice_id"])
    return fixed


def _print_report(safe_to_fix, needs_review, applied=False):
    print(f"\n{'='*70}\nDUPLICATE AR-SETTLEMENT AUDIT\n{'='*70}")
    print(f"Safe to auto-fix : {len(safe_to_fix)} invoice(s)")
    print(f"Needs manual review: {len(needs_review)} invoice(s)\n")

    if safe_to_fix:
        print("--- SAFE TO AUTO-FIX " + ("(APPLIED)" if applied else "(dry run — pass --apply to fix)") + " ---")
        for f in safe_to_fix:
            print(f"  Invoice {f.get('invoice_no') or f['invoice_id']} ({f.get('client_name')})"
                  f" — grand_total ₹{f['grand_total']:.2f}, credited ₹{f['total_credited_to_ar']:.2f}, "
                  f"excess ₹{f['excess']:.2f}")

    if needs_review:
        print("\n--- NEEDS MANUAL REVIEW ---")
        for f in needs_review:
            print(f"  Invoice {f.get('invoice_no') or f['invoice_id']} ({f.get('client_name')})"
                  f" — grand_total ₹{f['grand_total']:.2f}, credited ₹{f['total_credited_to_ar']:.2f}, "
                  f"excess ₹{f['excess']:.2f}")
            for e in f["entries"]:
                print(f"      · {e['source']} entry {e['journal_entry_id']} on {e['entry_date']}"
                      f" — credit ₹{e['credit']:.2f}"
                      f"{' [auto-generated payment]' if e['auto_generated_payment'] else ''}")

    total_excess = round(sum(f["excess"] for f in safe_to_fix + needs_review), 2)
    print(f"\nTotal overstatement across both groups: ₹{total_excess:.2f}")
    print(f"{'='*70}\n")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--company-id", default="", help="Limit to one company/book. Default: all.")
    ap.add_argument("--invoice-id", default=None, help="Limit to one invoice, for testing.")
    ap.add_argument("--apply", action="store_true", help="Actually delete the safe duplicate entries.")
    args = ap.parse_args()

    safe_to_fix, needs_review = await audit(args.company_id, args.invoice_id)

    if args.apply and safe_to_fix:
        await apply_fix(safe_to_fix)
        _print_report(safe_to_fix, needs_review, applied=True)
    else:
        _print_report(safe_to_fix, needs_review, applied=False)


if __name__ == "__main__":
    asyncio.run(main())
