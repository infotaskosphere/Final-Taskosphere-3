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

from backend.dependencies import (
    db,
    get_current_user,
    get_user_permissions,
    get_team_user_ids,
    create_audit_log,
)
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


# =============================================================================
# FULL PERMISSION MATRIX — GET & PUT /users/{user_id}/permissions
# Moved here from server.py so that all permission management lives in one
# place.  The router is already mounted on api_router in server.py, so the
# URLs stay identical: /api/users/{user_id}/permissions.
# =============================================================================

# Boolean permission flags that a manager (with can_manage_users) is allowed
# to view and edit for their direct-report staff.  They can only grant a flag
# they themselves possess; ADMIN_ONLY_GRANTS are blocked regardless.
BOOLEAN_PERM_KEYS = [
    "can_view_all_tasks",
    "can_view_all_clients",
    "can_view_all_dsc",
    "can_view_documents",
    "can_view_all_duedates",
    "can_view_reports",
    "can_view_attendance",
    "can_view_all_leads",
    "can_edit_tasks",
    "can_edit_clients",
    "can_edit_dsc",
    "can_edit_documents",
    "can_edit_due_dates",
    "can_edit_users",
    "can_download_reports",
    "can_manage_users",
    "can_manage_settings",
    "can_assign_tasks",
    "can_assign_clients",
    "can_view_staff_activity",
    "can_view_user_page",
    "can_view_audit_logs",
    "can_view_selected_users_reports",
    "can_view_todo_dashboard",
    "can_use_chat",
    "can_view_staff_rankings",
    "can_connect_email",
    "can_view_own_data",
    "can_create_quotations",
    "can_manage_invoices",
    "can_view_passwords",
    "can_edit_passwords",
    "can_view_compliance",
    "can_manage_compliance",
    "can_view_all_visits",
    "can_edit_visits",
]

# Flags that only an admin can grant — a manager cannot escalate these even if
# the manager somehow possessed them (defensive; they never should).
ADMIN_ONLY_GRANTS = {
    "can_delete_data",
    "can_delete_tasks",
    "can_delete_visits",
    "can_send_reminders",
}


@router.get("/users/{user_id}/permissions")
async def get_permissions(
    user_id: str, current_user: User = Depends(get_current_user)
):
    """
    Retrieve the permission dict for a user.
    - Admin    : can fetch any user's permissions.
    - Manager (with can_manage_users): can fetch their team staff permissions.
    - Staff    : can only fetch their own permissions (read-only display).
    """
    # Admin always allowed
    if current_user.role == "admin":
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user.get("permissions", {})

    # Any user can always fetch their OWN permissions
    if user_id == current_user.id:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user.get("permissions", {})

    # Manager with can_manage_users can fetch their direct-report staff permissions
    perms = get_user_permissions(current_user)
    if current_user.role == "manager" and perms.get("can_manage_users", False):
        team_ids = await get_team_user_ids(current_user.id)
        if user_id not in team_ids:
            raise HTTPException(status_code=403, detail="User is not in your team")
        target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        if target_user.get("role") in ("admin", "manager"):
            raise HTTPException(
                status_code=403,
                detail="Managers can only view permissions of staff members",
            )
        return target_user.get("permissions", {})

    raise HTTPException(status_code=403, detail="Not allowed")


@router.put("/users/{user_id}/permissions")
async def update_user_permissions(
    user_id: str,
    permissions: dict,
    current_user: User = Depends(get_current_user),
):
    """
    Update the permission dict for a user.
    - Admin    : can update any user's permissions without restriction.
    - Manager (with can_manage_users): can update their team staff permissions;
      cannot escalate beyond their own level; ADMIN_ONLY_GRANTS are blocked.
    - Staff    : not allowed.
    """
    # ── Admin path ────────────────────────────────────────────────────────────
    if current_user.role == "admin":
        existing = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        old_permissions = existing.get("permissions", {})
        await db.users.update_one(
            {"id": user_id}, {"$set": {"permissions": permissions}}
        )
        await create_audit_log(
            current_user,
            "UPDATE_PERMISSIONS",
            "user",
            record_id=user_id,
            old_data=old_permissions,
            new_data=permissions,
        )
        return {"message": "Permissions updated successfully"}

    # ── Manager path ──────────────────────────────────────────────────────────
    perms = get_user_permissions(current_user)
    if current_user.role == "manager" and perms.get("can_manage_users", False):
        team_ids = await get_team_user_ids(current_user.id)
        if user_id not in team_ids:
            raise HTTPException(status_code=403, detail="User is not in your team")
        existing = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        if existing.get("role") in ("admin", "manager"):
            raise HTTPException(
                status_code=403,
                detail="Managers can only update permissions of staff members",
            )

        # Managers CANNOT grant permissions they do not themselves possess,
        # and can never grant ADMIN_ONLY_GRANTS regardless.
        manager_perms = get_user_permissions(current_user)
        safe_permissions = {}
        for key, val in permissions.items():
            if key in ADMIN_ONLY_GRANTS:
                # Preserve whatever value is already stored — manager cannot change it
                safe_permissions[key] = existing.get("permissions", {}).get(key, False)
            elif key in BOOLEAN_PERM_KEYS and isinstance(val, bool):
                # Manager can only grant a flag they themselves hold
                if val and not manager_perms.get(key, False):
                    safe_permissions[key] = False
                else:
                    safe_permissions[key] = val
            else:
                # List-type keys (view_other_tasks, assigned_clients, etc.) pass through
                safe_permissions[key] = val

        old_permissions = existing.get("permissions", {})
        await db.users.update_one(
            {"id": user_id}, {"$set": {"permissions": safe_permissions}}
        )
        await create_audit_log(
            current_user,
            "UPDATE_PERMISSIONS",
            "user",
            record_id=user_id,
            old_data=old_permissions,
            new_data=safe_permissions,
        )
        return {"message": "Permissions updated successfully"}

    raise HTTPException(status_code=403, detail="Admin access required")
