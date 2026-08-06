"""
Governance Core — the single centralized permission architecture used by
every module (Taskosphere, Finix, Compliance, Records, Client Proposals,
People Matrix, Admin).

This file does NOT replace backend/permission_governance.py or the legacy
per-flag checks scattered through the routers — it sits ON TOP of them so
nothing that already works stops working. Every helper here degrades
gracefully to the legacy flags when a route/page predates this system.

Hierarchy enforced everywhere in this file:

    MODULE  →  PAGE  →  ACTION  →  VISIBILITY

Nothing bypasses this except role == "admin", which is checked FIRST in
every helper and short-circuits with no DB query / no permission-dict
lookup at all, per the "Admin should never require any permission" rule.

Usage
-----
Route-level guards (preferred — fails the request before the handler runs):

    from backend.governance_core import require_module, require_page, require_action

    @router.get("/leave", dependencies=[Depends(require_module("people_matrix"))])
    ...

    @router.post("/leave", dependencies=[Depends(require_page("people_matrix", "can_view_leave"))])
    ...

    @router.delete("/leave/{id}", dependencies=[
        Depends(require_action("people_matrix", "can_manage_leave", "delete"))
    ])
    ...

In-handler checks (when you need the boolean, not a 403):

    from backend.governance_core import has_module_access, has_page_access

    if not has_module_access(current_user, "finix"):
        ...
"""

from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException

from backend.dependencies import get_current_user, get_user_permissions
from backend.models import MODULE_HIERARCHY, User

# =============================================================================
# 1. MODULE ACCESS
# =============================================================================

def has_module_access(user: User, module_key: str) -> bool:
    """Is this module (Taskosphere / Finix / .../ Admin) visible to the user at all?"""
    if getattr(user, "role", None) == "admin":
        return True

    if module_key == "admin":
        # Admin module is role-gated only — there is intentionally no stored
        # flag a non-admin can be granted here (see MODULE_HIERARCHY note).
        return False

    # Taskosphere used to be hard-coded True here regardless of the stored
    # flag. It's now a real, editable master switch like every other module
    # — defaults True for every role (see DEFAULT_ROLE_PERMISSIONS), but an
    # admin can turn it off per user, which cascades to every page beneath
    # it via _enforce_module_hierarchy on save.
    module_def = MODULE_HIERARCHY.get(module_key)
    if not module_def:
        return False

    perms = get_user_permissions(user)
    return bool(perms.get(module_def["flag"], False))


# =============================================================================
# 2. PAGE ACCESS
# =============================================================================

def has_page_access(user: User, module_key: str, page_flag: str) -> bool:
    """Is this specific page reachable? Requires the parent module flag too —
    mirrors `_enforce_module_hierarchy` in permission_governance.py so a page
    can never be reachable while its module is switched off, even if the
    page flag itself is stale/True in the DB."""
    if getattr(user, "role", None) == "admin":
        return True

    if not has_module_access(user, module_key):
        return False

    perms = get_user_permissions(user)
    return bool(perms.get(page_flag, False))


# =============================================================================
# 3. ACTION ACCESS
# =============================================================================

# Pages that predate the action-level governance_matrix only ever had a
# single boolean (either a bare "can_view_X" with no separate manage flag,
# or a "can_view_X" + "can_manage_X" pair). Where a page has a "manage" flag,
# that flag is treated as covering create/edit/delete/approve for backward
# compatibility; view/export follow the view flag. This mapping is what lets
# every pre-existing page keep working with zero code changes.
_VIEW_ONLY_ACTIONS = {"view", "export"}
_MANAGE_ACTIONS = {"create", "edit", "delete", "approve", "print", "share"}

# The full action-layer vocabulary, in the canonical display order used by
# the Permission Matrix UI (see permission_governance.py's action-catalog
# endpoint, which serves this list to the frontend).
ALL_ACTIONS = ["view", "create", "edit", "delete", "export", "approve", "print", "share"]


def has_action_access(user: User, module_key: str, page_flag: str, action: str) -> bool:
    """Can the user perform `action` (view/create/edit/delete/export/approve/
    print/share) on this page? Always requires page access first."""
    if getattr(user, "role", None) == "admin":
        return True

    if not has_page_access(user, module_key, page_flag):
        return False

    perms = get_user_permissions(user)
    matrix_key = f"{module_key}.{page_flag}"
    matrix: Dict[str, List[str]] = perms.get("governance_matrix", {}) or {}

    # 1) Explicit fine-grained grant takes precedence when present.
    if matrix_key in matrix:
        return action in matrix[matrix_key]

    # 2) Legacy fallback: derive from can_view_X / can_manage_X pair.
    manage_flag = page_flag.replace("can_view_", "can_manage_", 1) if page_flag.startswith("can_view_") else None
    if action in _VIEW_ONLY_ACTIONS:
        return bool(perms.get(page_flag, False))
    if action in _MANAGE_ACTIONS:
        if manage_flag and manage_flag in perms:
            return bool(perms.get(manage_flag, False))
        # No distinct manage flag exists for this page (e.g. Tasks) — having
        # the page flag at all has historically implied full CRUD on it.
        return bool(perms.get(page_flag, False))

    return False


# =============================================================================
# 4. VISIBILITY ACCESS
# =============================================================================

VISIBILITY_SCOPES = ("own", "selected_users", "selected_departments", "selected_roles", "organization")

# Resource types that already had a bespoke list-field before this system
# existed — has_visibility_access() reads/writes through those fields so
# existing data and existing query-filtering code keeps working untouched.
_LEGACY_VISIBILITY_FIELDS = {
    "tasks": "view_other_tasks",
    "attendance": "view_other_attendance",
    "reports": "view_other_reports",
    "todos": "view_other_todos",
    "activity": "view_other_activity",
    "visits": "view_other_visits",
    "clients": "assigned_clients",
    "passwords": "view_password_departments",
}


def get_visibility_scope(user: User, resource_type: str) -> Dict[str, Any]:
    """Returns {"scope": ..., "selected": [...]} for a resource type.
    Admin and "organization" scope both mean "no filter, see everything"."""
    if getattr(user, "role", None) == "admin":
        return {"scope": "organization", "selected": []}

    perms = get_user_permissions(user)

    legacy_field = _LEGACY_VISIBILITY_FIELDS.get(resource_type)
    if legacy_field is not None:
        selected = perms.get(legacy_field, []) or []
        scope = "selected_users" if selected else "own"
        return {"scope": scope, "selected": selected}

    vis = (perms.get("visibility_matrix", {}) or {}).get(resource_type)
    if not vis:
        return {"scope": "own", "selected": []}
    return {"scope": vis.get("scope", "own"), "selected": vis.get("selected", [])}


def has_visibility_access(user: User, resource_type: str, owner_id: Optional[str] = None,
                           department: Optional[str] = None, role: Optional[str] = None) -> bool:
    """Given a specific record's owner/department/role, can this user see it?
    For scope == "organization" all records match. For "own", only records
    the user owns. Backend list endpoints should prefer filtering the DB
    query using get_visibility_scope() directly (cheaper); this function is
    for one-off record-level checks (e.g. before allowing an edit)."""
    if getattr(user, "role", None) == "admin":
        return True

    scope_info = get_visibility_scope(user, resource_type)
    scope = scope_info["scope"]

    if scope == "organization":
        return True
    if scope == "own":
        return owner_id == user.id
    if scope == "selected_users":
        return owner_id in scope_info["selected"] or owner_id == user.id
    if scope == "selected_departments":
        return department in scope_info["selected"]
    if scope == "selected_roles":
        return role in scope_info["selected"]
    return owner_id == user.id


# =============================================================================
# FASTAPI DEPENDENCY GUARDS
# =============================================================================

def require_module(module_key: str):
    async def _guard(current_user: User = Depends(get_current_user)):
        if not has_module_access(current_user, module_key):
            raise HTTPException(status_code=403, detail=f"No access to module '{module_key}'.")
        return current_user
    return _guard


def require_page(module_key: str, page_flag: str):
    async def _guard(current_user: User = Depends(get_current_user)):
        if not has_page_access(current_user, module_key, page_flag):
            raise HTTPException(status_code=403, detail="No access to this page.")
        return current_user
    return _guard


def require_action(module_key: str, page_flag: str, action: str):
    async def _guard(current_user: User = Depends(get_current_user)):
        if not has_action_access(current_user, module_key, page_flag, action):
            raise HTTPException(status_code=403, detail=f"Missing '{action}' permission for this page.")
        return current_user
    return _guard
