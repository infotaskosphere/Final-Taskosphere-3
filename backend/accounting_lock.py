"""
MODULE 4 — System Integrity & Architecture Logic
=================================================
1. CONTROL BOUNDARIES: every system-generated journal entry (source in
   {"ai_zero_touch", "purchase", "sale", "bank"}) is locked — it can never be
   edited or hard-deleted through the normal accounting_core endpoints once
   posted. `accounting_core.delete_journal_entry` already restricts non-manual
   deletes to admins; this module goes further and, for entries with any
   adjustment-note history, blocks deletion entirely so the audit trail can't
   be erased.
2. CORRECTIONS: instead of editing a posted voucher, staff raise an
   `AdjustmentNoteOverride` — a *new*, separately-posted reversing/correcting
   journal entry that references the original entry_id and carries a reason.
   This keeps every number that ever hit the ledger permanently visible.
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

    try:
        correcting_entry = await ac.post_journal_entry(
            company_id=body.company_id or original["company_id"],
            entry_date=body.entry_date,
            narration=f"Adjustment Note Override for entry {body.original_entry_id}: {body.reason.strip()}",
            lines=[l.model_dump() for l in body.correcting_lines],
            source="adjustment_override",
            source_id=body.original_entry_id,
            created_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    note_doc = {
        "id": str(uuid.uuid4()),
        "original_entry_id": body.original_entry_id,
        "correcting_entry_id": correcting_entry["id"],
        "company_id": correcting_entry["company_id"],
        "reason": body.reason.strip(),
        "raised_by": current_user.id,
        "raised_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.adjustment_note_overrides.insert_one(dict(note_doc))
    note_doc.pop("_id", None)

    # Mark the original as having correction history so it can never be
    # hard-deleted (see delete_locked_entry_guard below) — the trail must
    # stay intact even for admins.
    await db.journal_entries.update_one(
        {"id": body.original_entry_id}, {"$set": {"has_adjustment_history": True}}
    )

    return {"adjustment_note": note_doc, "correcting_entry": correcting_entry}


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


async def guard_deletion(entry_id: str) -> None:
    """Call this before any hard-delete of a journal entry (in addition to
    accounting_core's own admin-only check) — raises if deletion would erase
    audit-trail history."""
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
