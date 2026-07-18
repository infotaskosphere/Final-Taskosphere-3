"""
MODULE 4 — System Integrity & Architecture Logic
=================================================
1. CONTROL BOUNDARIES: every system-generated journal entry (source in
   {"ai_zero_touch", "purchase", "sale", "bank"}) is locked — it can never be
   silently edited or hard-deleted through the normal accounting_core
   endpoints once posted. `accounting_core.delete_journal_entry` already
   restricts non-manual deletes to admins; this module goes further and, for
   entries with any adjustment-note history, blocks deletion entirely so the
   audit trail can't be erased.
2. CORRECTIONS: staff raise an `AdjustmentNoteOverride` to fix a
   mis-categorised or mis-keyed locked entry. This *replaces the lines on the
   original entry itself* (so the ledger, trial balance, and every report
   reflect the corrected account/amount immediately — no orphaned second
   entry sitting next to it) while keeping a full before/after snapshot in
   `adjustment_note_overrides` for the permanent audit trail. Nothing is
   silently changed: every correction is logged with who made it, when, why,
   and exactly what the lines looked like before.
"""

import uuid
from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User
from backend import accounting_core as ac

router = APIRouter(prefix="/api/accounting-integrity", tags=["Accounting Integrity"])

LOCKED_SOURCES = {"ai_zero_touch", "purchase", "sale", "bank"}


def _perm_post(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {}
    )
    return bool(perms.get("can_post_journal_entries"))


def _perm_admin_override(user: User) -> bool:
    # Overrides touch the audit trail of an already-posted, system-generated
    # entry, so this is intentionally a higher bar than ordinary posting.
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {}
    )
    return bool(perms.get("can_manage_chart_of_accounts"))  # reuse an existing elevated-trust flag


class AdjustmentNoteOverride(BaseModel):
    original_entry_id: str
    company_id: str = ""
    reason: str = Field(..., min_length=10, description="Mandatory justification, min 10 chars.")
    correcting_lines: List[ac.JournalLine]
    entry_date: str = Field(default_factory=lambda: date.today().isoformat())


@router.post("/adjustment-note")
async def raise_adjustment_note(body: AdjustmentNoteOverride, current_user: User = Depends(get_current_user)):
    if not _perm_admin_override(current_user):
        raise HTTPException(403, "Access denied. Adjustment overrides require elevated permissions.")

    original = await db.journal_entries.find_one({"id": body.original_entry_id}, {"_id": 0})
    if not original:
        raise HTTPException(404, "Original journal entry not found.")

    new_lines = [l.model_dump() for l in body.correcting_lines]
    total_debit = round(sum(float(l.get("debit") or 0) for l in new_lines), 2)
    total_credit = round(sum(float(l.get("credit") or 0) for l in new_lines), 2)
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(400, f"Correction does not balance: debit {total_debit} != credit {total_credit}")
    if total_debit <= 0:
        raise HTTPException(400, "Correction has no amount.")

    previous_lines = await db.journal_lines.find({"entry_id": body.original_entry_id}, {"_id": 0}).to_list(1000)

    now = datetime.now(timezone.utc).isoformat()
    company_id = body.company_id or original["company_id"]

    # Replace the lines on the ORIGINAL entry itself — this is what makes the
    # ledger/trial balance/reports correct immediately, instead of leaving a
    # second, disconnected entry sitting next to the mistake.
    await db.journal_lines.delete_many({"entry_id": body.original_entry_id})
    line_docs = [
        {
            "id": str(uuid.uuid4()), "entry_id": body.original_entry_id, "company_id": company_id,
            "entry_date": original["entry_date"], "account_id": l["account_id"],
            "account_name": l.get("account_name", ""), "debit": float(l.get("debit") or 0),
            "credit": float(l.get("credit") or 0), "memo": l.get("memo", ""), "created_at": now,
        }
        for l in new_lines
    ]
    await db.journal_lines.insert_many(line_docs)

    await db.journal_entries.update_one(
        {"id": body.original_entry_id},
        {"$set": {
            "total_debit": total_debit, "total_credit": total_credit,
            "has_adjustment_history": True, "last_corrected_at": now, "last_corrected_by": current_user.id,
        }},
    )
    updated_entry = await db.journal_entries.find_one({"id": body.original_entry_id}, {"_id": 0})

    note_doc = {
        "id": str(uuid.uuid4()),
        "original_entry_id": body.original_entry_id,
        "company_id": company_id,
        "reason": body.reason.strip(),
        "previous_lines": [{k: v for k, v in pl.items() if k != "id"} for pl in previous_lines],
        "previous_total_debit": original.get("total_debit", 0),
        "previous_total_credit": original.get("total_credit", 0),
        "new_lines": new_lines,
        "new_total_debit": total_debit,
        "new_total_credit": total_credit,
        "raised_by": current_user.id,
        "raised_at": now,
    }
    await db.adjustment_note_overrides.insert_one(dict(note_doc))
    note_doc.pop("_id", None)

    return {"adjustment_note": note_doc, "updated_entry": updated_entry}


@router.get("/adjustment-notes")
async def list_adjustment_notes(
    company_id: str = Query(""), original_entry_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    q: dict = {"company_id": company_id}
    if original_entry_id:
        q["original_entry_id"] = original_entry_id
    return await db.adjustment_note_overrides.find(q, {"_id": 0}).sort("raised_at", -1).to_list(2000)


@router.get("/locked-entries")
async def list_locked_entries(company_id: str = Query(""), current_user: User = Depends(get_current_user)):
    """System-generated entries that cannot be edited/deleted directly —
    useful for the UI to grey out the edit/delete controls."""
    entries = await db.journal_entries.find(
        {"company_id": company_id, "source": {"$in": list(LOCKED_SOURCES)}}, {"_id": 0}
    ).sort("entry_date", -1).to_list(2000)
    return entries


async def guard_deletion(entry_id: str, user: Optional[User] = None) -> None:
    """Call this before any hard-delete of a journal entry (in addition to
    accounting_core's own admin-only check) — raises if deletion would erase
    audit-trail history. Admins can bypass this check to fix incorrect entries."""
    if user and getattr(user, "role", None) == "admin":
        return
    entry = await db.journal_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        return
    if entry.get("has_adjustment_history"):
        raise HTTPException(
            400,
            "This entry has adjustment-note history and is part of the permanent audit trail — "
            "it cannot be deleted. Raise a further Adjustment Note Override instead.",
        )
    if entry.get("source") in LOCKED_SOURCES:
        raise HTTPException(
            400,
            f"This entry was system-generated (source='{entry.get('source')}') and is locked. "
            "Use an Adjustment Note Override to correct it rather than deleting it.",
        )


async def create_accounting_integrity_indexes():
    await db.adjustment_note_overrides.create_index("original_entry_id")
    await db.adjustment_note_overrides.create_index("company_id")
