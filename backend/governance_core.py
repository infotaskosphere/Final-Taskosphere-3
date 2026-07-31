"""
Governance Core — the single centralized place for Module → Page → Action →
Visibility permission checks referenced throughout backend/models.py.

This module does NOT replace anything that already works:
  - `_enforce_module_hierarchy` in permission_governance.py still guarantees
    a page flag can never be True while its parent module flag is False.
  - Every existing scattered `if not current_user.permissions.get(...)`
    check in other routers keeps working exactly as before.
  - `get_user_permissions` / `get_team_user_ids` / role checks in
    dependencies.py are reused here, not duplicated.

It adds the two layers that were modeled in `UserPermissions`
(`governance_matrix`, `visibility_matrix`) but had no shared enforcement
code yet: per-ACTION checks (view/create/edit/delete/export/approve/print/
share) and cross-record VISIBILITY checks (own / selected users / selected
departments / selected roles / organization). New and updated endpoints
should call into these helpers — or depend on `require_module` /
`require_page` / `require_action` below — instead of re-implementing
permission logic inline.
"""
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException

from backend.dependencies import get_current_user, get_user_permissions
from backend.models import MODULE_HIERARCHY, User

# Standard action vocabulary for the Action layer. A page only needs to
# declare the subset it actually supports (see `_PAGE_INDEX` below); pages
# that declare nothing keep behaving exactly as they did before this module
# existed — reachable purely off their page flag, ungoverned at the action
# level.
ALL_ACTIONS = ["view", "create", "edit", "delete", "export", "approve", "print", "share"]

VISIBILITY_SCOPES = (
    "own",
    "selected_users",
    "selected_departments",
    "selected_roles",
    "organization",
)

# Flattened page_flag -> {module, module_flag, label, actions} lookup,
# built once from MODULE_HIERARCHY so callers never have to walk the tree
# themselves.
_PAGE_INDEX: Dict[str, Dict[str, Any]] = {}
for _mkey, _mval in MODULE_HIERARCHY.items():
    for _pg in _mval.get("pages", []):
        _PAGE_INDEX[_pg["flag"]] = {
            "module": _mkey,
            "module_flag": _mval["flag"],
            "label": _pg.get("label", _pg["flag"]),
            "actions": _pg.get("actions") or ["view"],
        }


def _role_str(user: User) -> str:
    role = getattr(user, "role", None)
    return role if isinstance(role, str) else getattr(role, "value", str(role))


def is_admin(user: User) -> bool:
    """Admin bypasses every check below — never requires a stored flag."""
    return _role_str(user) == "admin"


def has_module_access(user: User, module_key: str) -> bool:
    """Module-level gate. `module_key` is a MODULE_HIERARCHY key (e.g. 'finix')."""
    if is_admin(user):
        return True
    mod = MODULE_HIERARCHY.get(module_key)
    if not mod:
        return False
    return bool(get_user_permissions(user).get(mod["flag"], False))


def has_page_access(user: User, page_flag: str) -> bool:
    """
    Page-level gate. Also enforces that the parent module's master flag is
    on, mirroring `_enforce_module_hierarchy`'s save-time guarantee at
    read/request time, so the two layers can never drift apart even if a
    stale record somehow has the page flag True with its module flag False.
    """
    if is_admin(user):
        return True
    perms = get_user_permissions(user)
    entry = _PAGE_INDEX.get(page_flag)
    if entry and not perms.get(entry["module_flag"], False):
        return False
    return bool(perms.get(page_flag, False))


def page_actions(page_flag: str) -> List[str]:
    """The action vocabulary declared for this page (defaults to ['view'])."""
    entry = _PAGE_INDEX.get(page_flag)
    return entry["actions"] if entry else ["view"]


def has_action_access(user: User, page_flag: str, action: str) -> bool:
    """
    Action-level gate for one page.

    Fallback order (keeps every pre-existing page working unchanged):
      1. No page access at all                       -> False.
      2. `action` isn't declared for this page        -> True (page flag is
         the only gate that page has ever had — legacy behaviour).
      3. `governance_matrix` has no entry for this page -> True (nothing has
         been explicitly restricted at the action level yet).
      4. `governance_matrix` has an entry              -> action must be
         listed in it.
    """
    if is_admin(user):
        return True
    if not has_page_access(user, page_flag):
        return False
    if action not in page_actions(page_flag):
        return True
    perms = get_user_permissions(user)
    matrix = perms.get("governance_matrix", {}) or {}
    if page_flag not in matrix:
        return True
    return action in (matrix.get(page_flag) or [])


def has_visibility_access(
    user: User,
    resource_type: str,
    record_owner_id: Optional[str] = None,
    record_department: Optional[str] = None,
    record_role: Optional[str] = None,
) -> bool:
    """
    Visibility gate for a single record of `resource_type`. Reads
    `visibility_matrix[resource_type] = {"scope": ..., "selected": [...]}`.
    An absent entry defaults to "own" — the same implicit default every
    legacy `view_other_*` list-field already has (nothing shared until
    explicitly granted).

    This generalizes the existing `view_other_tasks` / `view_other_clients`
    / etc. list-fields for NEW resource types; existing resource types keep
    using their original list-fields and don't need to migrate.
    """
    if is_admin(user):
        return True
    if record_owner_id and record_owner_id == user.id:
        return True
    perms = get_user_permissions(user)
    entry = (perms.get("visibility_matrix", {}) or {}).get(resource_type)
    if not entry:
        return False
    scope = entry.get("scope", "own")
    selected = entry.get("selected", []) or []
    if scope == "organization":
        return True
    if scope == "selected_users":
        return bool(record_owner_id and record_owner_id in selected)
    if scope == "selected_departments":
        return bool(record_department and record_department in selected)
    if scope == "selected_roles":
        return bool(record_role and record_role in selected)
    return False  # scope == "own" and record_owner_id didn't match above


# ── FastAPI dependency factories ────────────────────────────────────────────
# Usage in a router: `current_user: User = Depends(require_page("can_view_bank"))`

def require_module(module_key: str):
    async def _dep(current_user: User = Depends(get_current_user)) -> User:
        if not has_module_access(current_user, module_key):
            raise HTTPException(status_code=403, detail=f"No access to the '{module_key}' module.")
        return current_user
    return _dep


def require_page(page_flag: str):
    async def _dep(current_user: User = Depends(get_current_user)) -> User:
        if not has_page_access(current_user, page_flag):
            raise HTTPException(status_code=403, detail="No access to this page.")
        return current_user
    return _dep


def require_action(page_flag: str, action: str):
    async def _dep(current_user: User = Depends(get_current_user)) -> User:
        if not has_action_access(current_user, page_flag, action):
            raise HTTPException(status_code=403, detail=f"Missing '{action}' permission for this page.")
        return current_user
    return _dep
