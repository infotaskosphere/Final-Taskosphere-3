"""
Permission Governance — "Admin › Permission Governance" page.

Purpose
-------
The Accounts module (Purchase, Sale, Bank, Chart of Accounts, Journal
Entries, Accounting Reports) is sensitive: it can see money movement across
every client. Admin has full access to all of it by default. Everyone else
starts with NO access and must submit an access request from the gated
page they tried to open; an admin then approves or rejects it here. An
approval flips exactly the one permission flag involved for that user —
nothing else changes about their account.

This module intentionally does not touch the legacy `can_manage_invoices` /
`can_create_quotations` flags that Purchase/Sale already recognised before
this feature existed — those keep working as-is so nobody who already had
access loses it. Going forward, prefer granting the specific
`can_view_purchase` / `can_view_sale` / `can_view_bank` / ... flags below
through this portal instead.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.dependencies import db, get_current_user, create_audit_log
from backend.models import User

router = APIRouter(tags=["Permission Governance"])

# The only flags requestable/grantable through this portal — keeps the
# governance surface limited to the Accounts module, as requested, rather
# than becoming a general-purpose permission editor.
GOVERNED_MODULES = {
    "purchase":            {"flag": "can_view_purchase",           "label": "Purchase"},
    "sale":                {"flag": "can_view_sale",                "label": "Sale"},
    "bank":                {"flag": "can_view_bank",                "label": "Bank Accounts"},
    "chart_of_accounts":   {"flag": "can_view_chart_of_accounts",   "label": "Chart of Accounts"},
    "manage_chart_of_accounts": {"flag": "can_manage_chart_of_accounts", "label": "Chart of Accounts (edit)"},
    "journal_entries":     {"flag": "can_view_journal_entries",     "label": "Journal Entries"},
    "post_journal_entries": {"flag": "can_post_journal_entries",    "label": "Journal Entries (post)"},
    "accounting_reports":  {"flag": "can_view_accounting_reports",  "label": "Accounting Reports"},
}


class AccessRequestCreate(BaseModel):
    module: str
    reason: str = ""


class DecisionInput(BaseModel):
    note: str = ""


def _require_admin(user: User):
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can do this.")


@router.get("/permission-governance/modules")
async def list_governed_modules(current_user: User = Depends(get_current_user)):
    """The list of requestable modules, for the request-access UI to render."""
    return [{"module": k, **v} for k, v in GOVERNED_MODULES.items()]


@router.post("/permission-governance/requests")
async def create_access_request(
    payload: AccessRequestCreate, current_user: User = Depends(get_current_user)
):
    """A non-admin user asks for access to one Accounts sub-module."""
    if current_user.role == "admin":
        return {"message": "Admins already have full access — nothing to request."}
    if payload.module not in GOVERNED_MODULES:
        raise HTTPException(status_code=400, detail="Unknown module.")

    existing = await db.access_requests.find_one(
        {"user_id": current_user.id, "module": payload.module, "status": "pending"}, {"_id": 0}
    )
    if existing:
        return {"access_request": existing, "duplicate": True}

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "user_name": current_user.full_name or current_user.email,
        "user_email": current_user.email,
        "module": payload.module,
        "module_label": GOVERNED_MODULES[payload.module]["label"],
        "reason": (payload.reason or "").strip()[:500],
        "status": "pending",
        "decided_by": None,
        "decided_by_name": None,
        "decided_at": None,
        "decision_note": "",
        "created_at": now,
        "updated_at": now,
    }
    await db.access_requests.insert_one(doc)
    doc.pop("_id", None)
    return {"access_request": doc, "duplicate": False}


@router.get("/permission-governance/requests/mine")
async def my_access_requests(current_user: User = Depends(get_current_user)):
    """A user checking the status of their own requests (for the gated page
    to show 'pending approval' instead of the request button again)."""
    items = await db.access_requests.find({"user_id": current_user.id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@router.get("/permission-governance/requests")
async def list_access_requests(
    status: Optional[str] = Query(None, description="pending | approved | rejected"),
    current_user: User = Depends(get_current_user),
):
    """Admin: the governance portal's inbox."""
    _require_admin(current_user)
    q = {}
    if status:
        q["status"] = status
    items = await db.access_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


async def _apply_flag(user_id: str, flag: str, value: bool):
    await db.users.update_one({"id": user_id}, {"$set": {f"permissions.{flag}": value}})


@router.post("/permission-governance/requests/{request_id}/approve")
async def approve_access_request(
    request_id: str, payload: DecisionInput, current_user: User = Depends(get_current_user)
):
    _require_admin(current_user)
    reqdoc = await db.access_requests.find_one({"id": request_id}, {"_id": 0})
    if not reqdoc:
        raise HTTPException(status_code=404, detail="Access request not found.")
    if reqdoc["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {reqdoc['status']}.")

    module = GOVERNED_MODULES.get(reqdoc["module"])
    if not module:
        raise HTTPException(status_code=400, detail="Unknown module on this request.")

    await _apply_flag(reqdoc["user_id"], module["flag"], True)
    now = datetime.now(timezone.utc).isoformat()
    await db.access_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "approved", "decided_by": current_user.id,
            "decided_by_name": current_user.full_name or current_user.email,
            "decided_at": now, "decision_note": (payload.note or "").strip()[:500], "updated_at": now,
        }},
    )
    try:
        await create_audit_log(current_user, "approve", "permission_governance", request_id,
                                new_data={"user_id": reqdoc["user_id"], "flag": module["flag"]})
    except Exception:
        pass
    return {"success": True}


@router.post("/permission-governance/requests/{request_id}/reject")
async def reject_access_request(
    request_id: str, payload: DecisionInput, current_user: User = Depends(get_current_user)
):
    _require_admin(current_user)
    reqdoc = await db.access_requests.find_one({"id": request_id}, {"_id": 0})
    if not reqdoc:
        raise HTTPException(status_code=404, detail="Access request not found.")
    if reqdoc["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {reqdoc['status']}.")

    now = datetime.now(timezone.utc).isoformat()
    await db.access_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "rejected", "decided_by": current_user.id,
            "decided_by_name": current_user.full_name or current_user.email,
            "decided_at": now, "decision_note": (payload.note or "").strip()[:500], "updated_at": now,
        }},
    )
    return {"success": True}


@router.post("/permission-governance/users/{user_id}/revoke")
async def revoke_module_access(user_id: str, module: str, current_user: User = Depends(get_current_user)):
    """Admin revokes a previously-granted module flag directly (no request needed to remove access)."""
    _require_admin(current_user)
    mod = GOVERNED_MODULES.get(module)
    if not mod:
        raise HTTPException(status_code=400, detail="Unknown module.")
    await _apply_flag(user_id, mod["flag"], False)
    return {"success": True}


@router.get("/permission-governance/grants")
async def list_current_grants(current_user: User = Depends(get_current_user)):
    """Admin: quick table of who currently has which Accounts-module flag on,
    so revoking doesn't require hunting through the full Users page."""
    _require_admin(current_user)
    flags = [m["flag"] for m in GOVERNED_MODULES.values()]
    projection = {"_id": 0, "id": 1, "full_name": 1, "email": 1, "role": 1}
    for f in flags:
        projection[f"permissions.{f}"] = 1
    users = await db.users.find({}, projection).to_list(2000)
    return users
