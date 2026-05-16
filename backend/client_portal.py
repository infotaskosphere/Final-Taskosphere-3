"""
client_portal.py  –  Taskosphere Client Portal
================================================
Handles:
  • Client Portal user creation / credential management (by admin/staff)
  • Client login (separate JWT, role = "client")
  • Client-facing endpoints (tasks, documents, invoices, compliance view)
  • Google Drive folder listing & subfolder navigation for a client
  • Share-link generation with pre-auth token
"""

import uuid
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
import io
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.dependencies import db, JWT_SECRET as SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/client-portal", tags=["client-portal"])

# ── password hashing ──────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── JWT helper (shared secret with main app) ──────────────────────────────
def create_client_token(data: dict, expires_minutes: int = 60 * 24 * 7) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    return jwt.encode({**data, "exp": expire, "sub_type": "client"}, SECRET_KEY, algorithm=ALGORITHM)

bearer_scheme = HTTPBearer(auto_error=False)

async def get_current_portal_client(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """Dependency – validates client portal JWT and returns the portal_user document."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub_type") != "client":
            raise HTTPException(status_code=401, detail="Invalid token type")
        portal_id = payload.get("portal_id")
        if not portal_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    doc = await db.client_portal_users.find_one({"id": portal_id}, {"_id": 0})
    if not doc or not doc.get("is_active", True):
        raise HTTPException(status_code=401, detail="Portal account not found or disabled")
    return doc


# ═══════════════════════════════════════════════════════════════════════════
# Pydantic schemas
# ═══════════════════════════════════════════════════════════════════════════

class PortalUserCreate(BaseModel):
    client_id: str
    portal_username: str = Field(..., min_length=3, max_length=60)
    portal_password: str = Field(..., min_length=6)
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    # What data sections the client can see
    can_view_tasks: bool = True
    can_view_documents: bool = True
    can_view_invoices: bool = True
    can_view_compliance: bool = False
    # Google Drive folder id shared with this client (root folder for this client)
    google_drive_folder_id: Optional[str] = None
    google_drive_folder_name: Optional[str] = None  # human label shown in portal


class PortalUserUpdate(BaseModel):
    portal_password: Optional[str] = Field(None, min_length=6)
    display_name: Optional[str] = None
    is_active: Optional[bool] = None
    can_view_tasks: Optional[bool] = None
    can_view_documents: Optional[bool] = None
    can_view_invoices: Optional[bool] = None
    can_view_compliance: Optional[bool] = None
    google_drive_folder_id: Optional[str] = None
    google_drive_folder_name: Optional[str] = None


class PortalLoginRequest(BaseModel):
    username: str
    password: str


# ═══════════════════════════════════════════════════════════════════════════
# Admin / staff endpoints  (require main-app JWT)
# ═══════════════════════════════════════════════════════════════════════════

from backend.dependencies import get_current_user
from backend.models import User


@router.post("/users", status_code=201)
async def create_portal_user(
    body: PortalUserCreate,
    current_user: User = Depends(get_current_user),
):
    """Create portal credentials for a client. Only admin/manager."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    # Verify client exists
    client_doc = await db.clients.find_one({"id": body.client_id}, {"_id": 0})
    if not client_doc:
        raise HTTPException(404, "Client not found")

    # Username must be unique
    existing = await db.client_portal_users.find_one(
        {"portal_username": body.portal_username.lower()}, {"_id": 0}
    )
    if existing:
        raise HTTPException(409, "Username already taken")

    # Auto-fill Drive folder if one was already created for this client
    # and the admin didn't explicitly provide one in the form
    drive_folder_id = _extract_folder_id(body.google_drive_folder_id)
    drive_folder_name = body.google_drive_folder_name
    if not drive_folder_id:
        saved = client_doc.get("drive_folder_id")
        if saved:
            drive_folder_id = saved
            drive_folder_name = (
                client_doc.get("drive_folder_name")
                or client_doc.get("company_name")
                or "My Documents"
            )

    portal_doc = {
        "id": str(uuid.uuid4()),
        "client_id": body.client_id,
        "portal_username": body.portal_username.lower(),
        "hashed_password": pwd_context.hash(body.portal_password),
        "email": body.email,
        "display_name": body.display_name or client_doc.get("company_name", ""),
        "is_active": True,
        "can_view_tasks": body.can_view_tasks,
        "can_view_documents": body.can_view_documents,
        "can_view_invoices": body.can_view_invoices,
        "can_view_compliance": body.can_view_compliance,
        "google_drive_folder_id": drive_folder_id,
        "google_drive_folder_name": drive_folder_name or client_doc.get("company_name") or "My Documents",
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.client_portal_users.insert_one(portal_doc)
    portal_doc.pop("hashed_password", None)
    portal_doc.pop("_id", None)
    return portal_doc


@router.get("/users")
async def list_portal_users(
    client_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List all portal users (optionally filtered by client_id)."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")
    query = {}
    if client_id:
        query["client_id"] = client_id
    docs = await db.client_portal_users.find(query, {"_id": 0, "hashed_password": 0}).to_list(500)
    return docs


@router.put("/users/{portal_user_id}")
async def update_portal_user(
    portal_user_id: str,
    body: PortalUserUpdate,
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    update: dict = {}
    if body.portal_password:
        update["hashed_password"] = pwd_context.hash(body.portal_password)
    if body.display_name is not None:
        update["display_name"] = body.display_name
    if body.is_active is not None:
        update["is_active"] = body.is_active
    if body.can_view_tasks is not None:
        update["can_view_tasks"] = body.can_view_tasks
    if body.can_view_documents is not None:
        update["can_view_documents"] = body.can_view_documents
    if body.can_view_invoices is not None:
        update["can_view_invoices"] = body.can_view_invoices
    if body.can_view_compliance is not None:
        update["can_view_compliance"] = body.can_view_compliance
    if body.google_drive_folder_id is not None:
        update["google_drive_folder_id"] = body.google_drive_folder_id
    if body.google_drive_folder_name is not None:
        update["google_drive_folder_name"] = body.google_drive_folder_name

    if not update:
        raise HTTPException(400, "Nothing to update")

    res = await db.client_portal_users.update_one({"id": portal_user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Portal user not found")
    return {"success": True}


@router.delete("/users/{portal_user_id}")
async def delete_portal_user(
    portal_user_id: str,
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")
    res = await db.client_portal_users.delete_one({"id": portal_user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Portal user not found")
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════════════
# Share-link endpoint  (admin generates a magic link or just returns the URL)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/users/{portal_user_id}/share-link")
async def get_share_link(
    portal_user_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Returns the portal login URL for this portal user.
    Also returns a pre-filled username hint so admins can share it easily.
    """
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    portal_user = await db.client_portal_users.find_one(
        {"id": portal_user_id}, {"_id": 0, "hashed_password": 0}
    )
    if not portal_user:
        raise HTTPException(404, "Portal user not found")

    return {
        "portal_url": "/client-portal",
        "username": portal_user["portal_username"],
        "display_name": portal_user.get("display_name", ""),
        "portal_user_id": portal_user_id,
        "is_active": portal_user.get("is_active", True),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Public endpoint  –  Client login (no main-app auth required)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/login")
async def client_portal_login(body: PortalLoginRequest):
    doc = await db.client_portal_users.find_one(
        {"portal_username": body.username.lower()}, {"_id": 0}
    )
    if not doc or not pwd_context.verify(body.password, doc["hashed_password"]):
        raise HTTPException(401, "Invalid username or password")
    if not doc.get("is_active", True):
        raise HTTPException(403, "Account is disabled. Contact your account manager.")

    token = create_client_token({"portal_id": doc["id"], "client_id": doc["client_id"]})

    # Log login event
    await db.client_portal_activity.insert_one({
        "portal_user_id": doc["id"],
        "client_id": doc["client_id"],
        "event": "login",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    safe = {k: v for k, v in doc.items() if k != "hashed_password"}
    return {"access_token": token, "token_type": "bearer", "user": safe}


# ═══════════════════════════════════════════════════════════════════════════
# Client-facing data endpoints  (require client portal JWT)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/me")
async def portal_me(portal_user=Depends(get_current_portal_client)):
    return portal_user


class PortalSelfUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(None, min_length=6)


@router.put("/me")
async def update_portal_self(
    body: PortalSelfUpdate,
    portal_user=Depends(get_current_portal_client),
):
    """Allow a logged-in client to update their own display name, email, or password."""
    update: dict = {}

    if body.display_name is not None:
        update["display_name"] = body.display_name.strip() or portal_user.get("display_name", "")

    if body.email is not None:
        update["email"] = body.email

    if body.new_password:
        if not body.current_password:
            raise HTTPException(400, "Current password is required to set a new password.")
        doc = await db.client_portal_users.find_one({"id": portal_user["id"]}, {"_id": 0})
        if not doc or not pwd_context.verify(body.current_password, doc["hashed_password"]):
            raise HTTPException(400, "Current password is incorrect.")
        update["hashed_password"] = pwd_context.hash(body.new_password)

    if not update:
        raise HTTPException(400, "Nothing to update.")

    await db.client_portal_users.update_one({"id": portal_user["id"]}, {"$set": update})

    updated = await db.client_portal_users.find_one(
        {"id": portal_user["id"]}, {"_id": 0, "hashed_password": 0}
    )
    return updated


@router.get("/tasks")
async def portal_tasks(portal_user=Depends(get_current_portal_client)):
    if not portal_user.get("can_view_tasks"):
        raise HTTPException(403, "You don't have access to tasks")
    tasks = await db.tasks.find(
        {"client_id": portal_user["client_id"]},
        {"_id": 0, "title": 1, "status": 1, "due_date": 1, "priority": 1,
         "description": 1, "assigned_to": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(200)
    return tasks


@router.get("/documents")
async def portal_documents(portal_user=Depends(get_current_portal_client)):
    if not portal_user.get("can_view_documents"):
        raise HTTPException(403, "You don't have access to documents")
    docs = await db.documents.find(
        {"client_id": portal_user["client_id"]},
        {"_id": 0, "name": 1, "doc_type": 1, "status": 1, "expiry_date": 1,
         "created_at": 1, "notes": 1}
    ).sort("created_at", -1).to_list(200)
    return docs


@router.get("/invoices")
async def portal_invoices(portal_user=Depends(get_current_portal_client)):
    if not portal_user.get("can_view_invoices"):
        raise HTTPException(403, "You don't have access to invoices")
    invoices = await db.invoices.find(
        {"client_id": portal_user["client_id"]},
        {"_id": 0, "invoice_number": 1, "invoice_date": 1, "due_date": 1,
         "total_amount": 1, "status": 1, "notes": 1}
    ).sort("invoice_date", -1).to_list(200)
    return invoices


@router.get("/compliance")
async def portal_compliance(portal_user=Depends(get_current_portal_client)):
    if not portal_user.get("can_view_compliance"):
        raise HTTPException(403, "You don't have access to compliance data")
    records = await db.compliances.find(
        {"client_id": portal_user["client_id"]},
        {"_id": 0, "compliance_name": 1, "due_date": 1, "status": 1,
         "filing_date": 1, "remarks": 1}
    ).sort("due_date", -1).to_list(200)
    return records


# ═══════════════════════════════════════════════════════════════════════════
# Google Drive helpers
# ═══════════════════════════════════════════════════════════════════════════


def _extract_folder_id(value):
    """
    Accept a bare Drive folder ID or any Google Drive share URL and
    return just the folder ID string. Returns None if value is empty.

    Examples:
      "1nYpYErhuHLGjYWaUUMt7ZDT2sFhAa7FB"                            -> same
      "https://drive.google.com/drive/folders/1nYp…?usp=drive_link"   -> "1nYp…"
      "https://drive.google.com/open?id=1nYp…"                        -> "1nYp…"
    """
    if not value:
        return None
    value = str(value).strip()
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', value)
    if m:
        return m.group(1)
    m = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', value)
    if m:
        return m.group(1)
    return value


def _fetch_drive_files_raw(folder_id: str, include_subfolders: bool = True) -> list:
    """
    Lists files and folders inside a given Drive folder.
    Returns both regular files and subfolders so the client can navigate.
    """
    from backend.invoicing import _get_drive_service, _drive_configured

    if not _drive_configured():
        raise HTTPException(
            503,
            "Google Drive not configured. Set GOOGLE_REFRESH_TOKEN, "
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment."
        )

    service = _get_drive_service()
    result = service.files().list(
        q=f"'{folder_id}' in parents and trashed = false",
        fields="files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)",
        orderBy="folder,name",
        pageSize=500
    ).execute()
    return result.get("files", [])


def _get_folder_name(folder_id: str) -> str:
    """Get the display name of a Drive folder by its ID."""
    try:
        from backend.invoicing import _get_drive_service, _drive_configured
        if not _drive_configured():
            return folder_id
        service = _get_drive_service()
        result = service.files().get(fileId=folder_id, fields="id,name").execute()
        return result.get("name", folder_id)
    except Exception:
        return folder_id


# ═══════════════════════════════════════════════════════════════════════════
# Google Drive  –  Visibility management (admin)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/drive/admin/files/{portal_user_id}")
async def admin_list_drive_files(
    portal_user_id: str,
    folder_id: Optional[str] = Query(None, description="Subfolder ID to browse (defaults to client's root folder)"),
    current_user: User = Depends(get_current_user),
):
    """
    Admin endpoint – list ALL files in the portal user's linked Drive folder
    (or a subfolder), annotated with their current visibility setting.
    """
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    portal_user = await db.client_portal_users.find_one({"id": portal_user_id}, {"_id": 0})
    if not portal_user:
        raise HTTPException(404, "Portal user not found")

    root_folder_id = portal_user.get("google_drive_folder_id")
    if not root_folder_id:
        return {"files": [], "message": "No Google Drive folder linked to this portal user."}

    # Browse the requested subfolder or fall back to root
    browse_id = folder_id if folder_id else root_folder_id

    files = _fetch_drive_files_raw(browse_id)

    # Load existing visibility config
    vis_doc = await db.client_drive_visibility.find_one(
        {"portal_user_id": portal_user_id}, {"_id": 0}
    )
    hidden_ids: set = set(vis_doc.get("hidden_ids", [])) if vis_doc else set()

    for f in files:
        f["is_visible"] = f["id"] not in hidden_ids
        f["is_folder"] = f.get("mimeType") == "application/vnd.google-apps.folder"

    return {
        "files": files,
        "root_folder_id": root_folder_id,
        "current_folder_id": browse_id,
        "hidden_ids": list(hidden_ids),
        "portal_user_id": portal_user_id,
    }


class DriveVisibilityUpdate(BaseModel):
    hidden_ids: List[str] = Field(default_factory=list)


@router.put("/drive/admin/visibility/{portal_user_id}")
async def admin_update_drive_visibility(
    portal_user_id: str,
    body: DriveVisibilityUpdate,
    current_user: User = Depends(get_current_user),
):
    """Admin endpoint – save/update which Drive files are hidden for a portal user."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    portal_user = await db.client_portal_users.find_one({"id": portal_user_id}, {"_id": 0})
    if not portal_user:
        raise HTTPException(404, "Portal user not found")

    await db.client_drive_visibility.update_one(
        {"portal_user_id": portal_user_id},
        {"$set": {
            "portal_user_id": portal_user_id,
            "client_id": portal_user["client_id"],
            "hidden_ids": list(set(body.hidden_ids)),
            "updated_by": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"success": True, "hidden_count": len(body.hidden_ids)}


@router.patch("/drive/admin/visibility/{portal_user_id}/toggle")
async def admin_toggle_single_file(
    portal_user_id: str,
    file_id: str = Query(..., description="Drive file ID to toggle"),
    visible: bool = Query(..., description="True = show, False = hide"),
    current_user: User = Depends(get_current_user),
):
    """Quick toggle for a single file – adds or removes from hidden_ids."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    portal_user = await db.client_portal_users.find_one({"id": portal_user_id}, {"_id": 0})
    if not portal_user:
        raise HTTPException(404, "Portal user not found")

    if visible:
        await db.client_drive_visibility.update_one(
            {"portal_user_id": portal_user_id},
            {"$pull": {"hidden_ids": file_id},
             "$set": {"updated_by": current_user.id,
                      "updated_at": datetime.now(timezone.utc).isoformat(),
                      "client_id": portal_user["client_id"]}},
            upsert=True,
        )
    else:
        await db.client_drive_visibility.update_one(
            {"portal_user_id": portal_user_id},
            {"$addToSet": {"hidden_ids": file_id},
             "$set": {"updated_by": current_user.id,
                      "updated_at": datetime.now(timezone.utc).isoformat(),
                      "client_id": portal_user["client_id"]}},
            upsert=True,
        )
    return {"success": True, "file_id": file_id, "is_visible": visible}


@router.get("/drive/admin/visibility/{portal_user_id}/summary")
async def admin_visibility_summary(
    portal_user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Returns the raw visibility config for a portal user."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")
    doc = await db.client_drive_visibility.find_one({"portal_user_id": portal_user_id}, {"_id": 0})
    return doc or {"portal_user_id": portal_user_id, "hidden_ids": []}


# ═══════════════════════════════════════════════════════════════════════════
# Google Drive  –  Client view with subfolder navigation
# ═══════════════════════════════════════════════════════════════════════════



# ═══════════════════════════════════════════════════════════════════════════
# Google Drive  –  Create predefined client folder structure (admin)
# ═══════════════════════════════════════════════════════════════════════════

DEFAULT_SUBFOLDERS = [
    "Documents", "Invoices", "Compliance",
    "Correspondence", "Reports", "Bank Statements",
]


# ═══════════════════════════════════════════════════════════════════════════
# All Clients  –  returns every client with their portal connection status
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/all-clients")
async def list_all_clients(
    current_user: User = Depends(get_current_user),
):
    """Returns all clients enriched with their portal connection status."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    clients = await db.clients.find({}, {"_id": 0}).to_list(2000)
    portal_users = await db.client_portal_users.find(
        {}, {"_id": 0, "hashed_password": 0}
    ).to_list(2000)

    portal_by_client: dict = {}
    for pu in portal_users:
        cid = pu.get("client_id")
        if cid:
            portal_by_client.setdefault(cid, []).append(pu)

    result = []
    for c in clients:
        cid = c.get("id", "")
        c["portal_users"] = portal_by_client.get(cid, [])
        c["has_portal"] = bool(c["portal_users"])
        c["has_drive"] = any(pu.get("google_drive_folder_id") for pu in c["portal_users"])
        result.append(c)

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Folder Template  –  save / load a reusable subfolder architecture
# ═══════════════════════════════════════════════════════════════════════════

class FolderTemplate(BaseModel):
    subfolders: List[str] = Field(default_factory=list)
    parent_folder_id: Optional[str] = None


@router.get("/folder-template")
async def get_folder_template(
    current_user: User = Depends(get_current_user),
):
    """Returns the saved folder architecture template."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")
    doc = await db.portal_folder_template.find_one({}, {"_id": 0})
    if not doc:
        return {"subfolders": DEFAULT_SUBFOLDERS, "parent_folder_id": ""}
    return doc


@router.put("/folder-template")
async def save_folder_template(
    body: FolderTemplate,
    current_user: User = Depends(get_current_user),
):
    """Saves (upserts) the folder architecture template."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")
    await db.portal_folder_template.update_one(
        {},
        {"$set": {
            "subfolders": body.subfolders,
            "parent_folder_id": _extract_folder_id(body.parent_folder_id) or "",
            "updated_by": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════════════
# Drive Folder Creation  –  single + bulk
# ═══════════════════════════════════════════════════════════════════════════

async def _resolve_subfolders() -> List[str]:
    """Return the saved template subfolders or fall back to defaults."""
    doc = await db.portal_folder_template.find_one({}, {"_id": 0})
    if doc and doc.get("subfolders"):
        return doc["subfolders"]
    return DEFAULT_SUBFOLDERS


def _create_drive_folder_sync(service, client_name: str, parent_folder_id: Optional[str], subfolders: List[str]):
    """
    Synchronous helper that creates (or reuses) a root folder + subfolders in Drive.
    Returns a result dict.
    """
    # Accept full Drive URLs or bare IDs — always normalise to a bare ID
    parent_folder_id = _extract_folder_id(parent_folder_id)
    safe_name = client_name.strip()

    query_parts = [
        f"name='{safe_name}'",
        "mimeType='application/vnd.google-apps.folder'",
        "trashed=false",
    ]
    if parent_folder_id:
        query_parts.insert(0, f"'{parent_folder_id}' in parents")

    existing = service.files().list(
        q=" and ".join(query_parts),
        fields="files(id,name,webViewLink)",
        spaces="drive",
    ).execute().get("files", [])

    if existing:
        root_folder, created_root = existing[0], False
    else:
        root_meta = {"name": safe_name, "mimeType": "application/vnd.google-apps.folder"}
        if parent_folder_id:
            root_meta["parents"] = [parent_folder_id]
        root_folder = service.files().create(body=root_meta, fields="id,name,webViewLink").execute()
        created_root = True

    root_id = root_folder["id"]
    sub_created, sub_existing = [], []
    for sub_name in subfolders:
        sub_exists = service.files().list(
            q=f"'{root_id}' in parents and name='{sub_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields="files(id,name)",
        ).execute().get("files", [])
        if sub_exists:
            sub_existing.append(sub_name)
        else:
            service.files().create(
                body={"name": sub_name, "mimeType": "application/vnd.google-apps.folder", "parents": [root_id]},
                fields="id",
            ).execute()
            sub_created.append(sub_name)

    return {
        "success": True,
        "folder_id": root_id,
        "folder_name": safe_name,
        "folder_link": root_folder.get("webViewLink", ""),
        "created_root": created_root,
        "sub_folders_created": sub_created,
        "sub_folders_existing": sub_existing,
    }


class CreateFolderRequest(BaseModel):
    client_name: str
    client_id: str
    parent_folder_id: Optional[str] = None
    subfolders: Optional[List[str]] = None


@router.post("/drive/create-folders")
async def create_client_drive_folders(
    body: CreateFolderRequest,
    current_user: User = Depends(get_current_user),
):
    """Creates root + sub-folders in Drive using custom or template subfolders, auto-links to portal user."""
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    from backend.invoicing import _get_drive_service, _drive_configured
    if not _drive_configured():
        raise HTTPException(503, "Google Drive not configured.")

    service = _get_drive_service()
    subfolders = body.subfolders if body.subfolders is not None else await _resolve_subfolders()

    # Always use company name from DB as the folder name
    client_doc = await db.clients.find_one({"id": body.client_id}, {"_id": 0, "company_name": 1, "name": 1})
    folder_name = (
        (client_doc.get("company_name") or client_doc.get("name") if client_doc else None)
        or body.client_name
    ).strip()

    result = _create_drive_folder_sync(service, folder_name, body.parent_folder_id, subfolders)
    root_id = result["folder_id"]
    folder_link = result.get("folder_link", "")

    # Always save folder info to the clients collection so it persists
    # even if the portal user doesn't exist yet
    await db.clients.update_one(
        {"id": body.client_id},
        {"$set": {
            "drive_folder_id":   root_id,
            "drive_folder_name": folder_name,
            "drive_folder_link": folder_link,
        }},
    )

    # Also update portal user record if one already exists
    portal_user_doc = await db.client_portal_users.find_one({"client_id": body.client_id}, {"_id": 0})
    if portal_user_doc:
        await db.client_portal_users.update_one(
            {"client_id": body.client_id},
            {"$set": {
                "google_drive_folder_id":   root_id,
                "google_drive_folder_name": folder_name,
            }},
        )
    result["auto_linked_portal"] = bool(portal_user_doc)
    result["folder_name"] = folder_name
    return result


class BulkCreateFolderRequest(BaseModel):
    client_ids: Optional[List[str]] = None
    parent_folder_id: Optional[str] = None
    subfolders: Optional[List[str]] = None


@router.post("/drive/bulk-create-folders")
async def bulk_create_client_drive_folders(
    body: BulkCreateFolderRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Bulk-creates Drive folders for multiple clients (or all clients if client_ids is empty).
    Uses the saved folder template unless subfolders are explicitly provided.
    """
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Insufficient permissions")

    from backend.invoicing import _get_drive_service, _drive_configured
    if not _drive_configured():
        raise HTTPException(503, "Google Drive not configured.")

    service = _get_drive_service()
    subfolders = body.subfolders if body.subfolders is not None else await _resolve_subfolders()

    # Resolve parent_folder_id: prefer explicit, else fall back to template
    parent_id = body.parent_folder_id
    if not parent_id:
        tmpl = await db.portal_folder_template.find_one({}, {"_id": 0})
        if tmpl:
            parent_id = tmpl.get("parent_folder_id") or None

    # Fetch clients
    query = {}
    if body.client_ids:
        query = {"id": {"$in": body.client_ids}}
    clients = await db.clients.find(query, {"_id": 0, "id": 1, "company_name": 1, "name": 1}).to_list(2000)

    results = []
    for client in clients:
        client_id = client.get("id", "")
        client_name = client.get("company_name") or client.get("name") or "Unknown"
        try:
            res = _create_drive_folder_sync(service, client_name, parent_id, subfolders)
            root_id = res["folder_id"]
            folder_link = res.get("folder_link", "")

            # Always persist folder info to the clients collection
            await db.clients.update_one(
                {"id": client_id},
                {"$set": {
                    "drive_folder_id":   root_id,
                    "drive_folder_name": client_name,
                    "drive_folder_link": folder_link,
                }},
            )

            # Also update existing portal user if one exists
            portal_user_doc = await db.client_portal_users.find_one({"client_id": client_id}, {"_id": 0})
            if portal_user_doc:
                await db.client_portal_users.update_one(
                    {"client_id": client_id},
                    {"$set": {
                        "google_drive_folder_id":   root_id,
                        "google_drive_folder_name": client_name,
                    }},
                )
            results.append({
                "client_id": client_id,
                "client_name": client_name,
                "success": True,
                "folder_id": root_id,
                "folder_link": folder_link,
                "auto_linked_portal": bool(portal_user_doc),
                "sub_folders_created": res.get("sub_folders_created", []),
            })
        except Exception as exc:
            results.append({"client_id": client_id, "client_name": client_name, "success": False, "error": str(exc)})

    return {
        "total": len(results),
        "succeeded": sum(1 for r in results if r["success"]),
        "failed": sum(1 for r in results if not r["success"]),
        "results": results,
    }


@router.get("/drive/files")
async def portal_drive_files(
    folder_id: Optional[str] = Query(None, description="Subfolder to browse"),
    parent_folder_id: Optional[str] = Query(None, description="The parent folder that listed folder_id (for security validation)"),
    breadcrumb_json: Optional[str] = Query(None, description="JSON-encoded breadcrumb from client for continuity"),
    portal_user=Depends(get_current_portal_client),
):
    """
    Returns visible files/folders in the Google Drive folder linked to this client.
    Supports unlimited subfolder depth.

    Security model: instead of walking the Drive parent-chain (which can fail due to
    Drive API scope/permission quirks), we use a one-hop validation approach:
      - Root access: always allowed (no folder_id).
      - Subfolder access: the client must supply the parent_folder_id from which they
        navigated. We re-fetch that parent's listing and confirm folder_id is present
        and visible there. This means each hop is validated against its direct parent.
    """
    root_folder_id = portal_user.get("google_drive_folder_id")
    if not root_folder_id:
        return {
            "files": [],
            "folders": [],
            "breadcrumb": [],
            "message": "No Google Drive folder has been linked to your account. Please contact your account manager.",
        }

    root_name = portal_user.get("google_drive_folder_name") or "My Documents"
    browse_id = root_folder_id
    breadcrumb = [{"id": root_folder_id, "name": root_name}]

    # Load visibility config once
    vis_doc = await db.client_drive_visibility.find_one(
        {"portal_user_id": portal_user["id"]}, {"_id": 0}
    )
    hidden_ids: set = set(vis_doc.get("hidden_ids", [])) if vis_doc else set()

    if folder_id and folder_id != root_folder_id:
        # Determine which parent to validate against
        validate_parent = parent_folder_id if parent_folder_id else root_folder_id

        try:
            parent_files = _fetch_drive_files_raw(validate_parent)
        except Exception:
            return {"files": [], "folders": [], "breadcrumb": breadcrumb,
                    "error": "Could not reach Google Drive."}

        # Check folder_id is a visible folder in the parent listing
        visible_folder_ids = {
            f["id"] for f in parent_files
            if f.get("mimeType") == "application/vnd.google-apps.folder"
            and f["id"] not in hidden_ids
        }

        if folder_id in visible_folder_ids:
            browse_id = folder_id
            # Get folder name from parent listing
            folder_name = next((f["name"] for f in parent_files if f["id"] == folder_id), folder_id)
            # Rebuild breadcrumb: parse existing client breadcrumb + append new entry
            try:
                import json as _json
                existing_crumbs = _json.loads(breadcrumb_json) if breadcrumb_json else []
                # Ensure root is always first
                if not existing_crumbs or existing_crumbs[0].get("id") != root_folder_id:
                    existing_crumbs = [{"id": root_folder_id, "name": root_name}]
                breadcrumb = existing_crumbs + [{"id": folder_id, "name": folder_name}]
            except Exception:
                breadcrumb = [{"id": root_folder_id, "name": root_name},
                              {"id": folder_id, "name": folder_name}]
        else:
            # Not found as a visible folder — fall back to root
            browse_id = root_folder_id

    try:
        all_files = _fetch_drive_files_raw(browse_id)
    except HTTPException as e:
        if e.status_code == 503:
            return {"files": [], "folders": [], "breadcrumb": breadcrumb,
                    "message": "Google Drive integration not configured. Contact support."}
        return {"files": [], "folders": [], "breadcrumb": breadcrumb,
                "error": f"Could not load files ({e.status_code})."}
    except Exception as e:
        logger.warning(f"Drive fetch error for client: {e}")
        return {"files": [], "folders": [], "breadcrumb": breadcrumb,
                "error": "Could not reach Google Drive."}

    visible_all = [f for f in all_files if f["id"] not in hidden_ids]
    folders = [f for f in visible_all if f.get("mimeType") == "application/vnd.google-apps.folder"]
    files   = [f for f in visible_all if f.get("mimeType") != "application/vnd.google-apps.folder"]

    return {
        "files": files,
        "folders": folders,
        "breadcrumb": breadcrumb,
        "root_folder_id": root_folder_id,
        "current_folder_id": browse_id,
    }


# ── Google Drive proxy download ───────────────────────────────────────────────
# Files stored in Drive are private; direct /uc?export=download URLs return 403
# for any viewer who isn't logged into the owning Google account.
# This endpoint fetches the file bytes via the server's authenticated Drive
# service and streams them straight to the client.

EXPORT_MIME_MAP = {
    "application/vnd.google-apps.document":     ("application/pdf", ".pdf"),
    "application/vnd.google-apps.spreadsheet":  (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.form":         ("application/pdf", ".pdf"),
}

@router.get("/drive/download")
async def portal_drive_download(
    file_id: str = Query(..., description="Drive file ID to download"),
    portal_user=Depends(get_current_portal_client),
):
    """
    Proxy-downloads a Drive file through the backend using the server's OAuth
    credentials, so the client never needs their own Google account access.
    Security: confirms the file is visible (not in hidden_ids) for this portal user.
    """
    from backend.invoicing import _get_drive_service, _drive_configured

    if not _drive_configured():
        raise HTTPException(503, "Google Drive not configured.")

    # Verify this file is not hidden for the client
    vis_doc = await db.client_drive_visibility.find_one(
        {"portal_user_id": portal_user["id"]}, {"_id": 0}
    )
    hidden_ids: set = set(vis_doc.get("hidden_ids", [])) if vis_doc else set()
    if file_id in hidden_ids:
        raise HTTPException(403, "You do not have access to this file.")

    try:
        service = _get_drive_service()

        # Get file metadata to determine name and mimeType
        meta = service.files().get(
            fileId=file_id,
            fields="id,name,mimeType,size"
        ).execute()

        mime_type = meta.get("mimeType", "application/octet-stream")
        file_name = meta.get("name", file_id)

        # Google Workspace files (Docs/Sheets/Slides) can only be exported, not downloaded
        if mime_type in EXPORT_MIME_MAP:
            export_mime, ext = EXPORT_MIME_MAP[mime_type]
            request = service.files().export_media(fileId=file_id, mimeType=export_mime)
            if not file_name.endswith(ext):
                file_name += ext
            content_type = export_mime
        else:
            request = service.files().get_media(fileId=file_id)
            content_type = mime_type

        # Download into memory buffer (streaming from Drive API)
        import googleapiclient.http as gapi_http
        buf = io.BytesIO()
        downloader = gapi_http.MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)

        # Sanitise filename for Content-Disposition header
        safe_name = file_name.replace('"', "'")

        return StreamingResponse(
            buf,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}"',
                "Cache-Control": "no-store",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Drive download error for file {file_id}: {e}", exc_info=True)
        raise HTTPException(500, "Failed to download file from Google Drive.")

# ═══════════════════════════════════════════════════════════════════════════
# Portal Messages  –  Admin sends, Client reads
# ═══════════════════════════════════════════════════════════════════════════

class PortalMessageCreate(BaseModel):
    to_portal_user_id: str
    subject: Optional[str] = None
    body: str
    message_type: Optional[str] = "general"   # general | dsc_expiry | compliance_due | invoice_reminder | custom

@router.get("/messages")
async def list_messages_admin(current_user: User = Depends(get_current_user)):
    """Admin: list all portal messages (scoped to this deployment)."""
    docs = await db.portal_messages.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return docs

@router.post("/messages", status_code=201)
async def send_portal_message(
    payload: PortalMessageCreate,
    current_user: User = Depends(get_current_user),
):
    """Admin: send a message to a portal client."""
    try:
        portal_user = await db.client_portal_users.find_one({"id": payload.to_portal_user_id}, {"_id": 0})
        if not portal_user:
            raise HTTPException(404, "Portal user not found")

        # Try to fetch client name from clients collection as fallback
        client_name = portal_user.get("client_name") or portal_user.get("display_name") or ""
        client_id = portal_user.get("client_id")
        if client_id and not client_name:
            client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "company_name": 1, "name": 1})
            if client_doc:
                client_name = client_doc.get("company_name") or client_doc.get("name") or ""

        from_name = ""
        try:
            from_name = current_user.full_name or current_user.email or ""
        except Exception:
            from_name = "Team"

        msg = {
            "id": str(uuid.uuid4()),
            "org_id": str(getattr(current_user, "company_id", "") or ""),
            "from_user_id": str(current_user.id),
            "from_user_name": from_name,
            "to_portal_user_id": payload.to_portal_user_id,
            "to_display_name": portal_user.get("display_name") or portal_user.get("portal_username") or "",
            "client_id": client_id or "",
            "client_name": client_name,
            "subject": payload.subject or "",
            "body": payload.body,
            "message_type": payload.message_type or "general",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.portal_messages.insert_one(msg)
        return {"ok": True, "id": msg["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"send_portal_message error: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to send message: {str(e)}")

@router.get("/my-messages")
async def get_my_messages(current_client=Depends(get_current_portal_client)):
    """Client: get messages sent to me."""
    docs = await db.portal_messages.find(
        {"to_portal_user_id": current_client["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    # Ensure replies field always exists
    for doc in docs:
        if "replies" not in doc:
            doc["replies"] = []
    return docs

@router.put("/my-messages/{msg_id}/read")
async def mark_message_read(msg_id: str, current_client=Depends(get_current_portal_client)):
    """Client: mark a message as read."""
    await db.portal_messages.update_one(
        {"id": msg_id, "to_portal_user_id": current_client["id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}

class ClientReplyPayload(BaseModel):
    body: str

@router.post("/my-messages/{msg_id}/reply")
async def reply_to_message(
    msg_id: str,
    payload: ClientReplyPayload,
    current_client=Depends(get_current_portal_client),
):
    """Client: send a reply to a message from the firm."""
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(400, "Reply body is required")

    reply = {
        "body": body,
        "from_client": True,
        "from_display_name": current_client.get("display_name") or current_client.get("portal_username"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Append reply to the message document
    result = await db.portal_messages.update_one(
        {"id": msg_id, "to_portal_user_id": current_client["id"]},
        {
            "$push": {"replies": reply},
            "$set": {"has_reply": True, "last_reply_at": reply["created_at"]},
        },
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Message not found")
    return {"ok": True, "reply": reply}


@router.delete("/messages/{msg_id}")
async def delete_portal_message(msg_id: str, current_user: User = Depends(get_current_user)):
    """Admin: delete a message."""
    await db.portal_messages.delete_one({"id": msg_id})
    return {"ok": True}

# ── Individual Folder endpoint ─────────────────────────────────────────────

class IndividualFolderRequest(BaseModel):
    client_id: str
    client_name: str
    custom_folder_name: Optional[str] = None   # override folder name; defaults to client_name
    parent_folder_id: Optional[str] = None
    subfolders: Optional[List[str]] = None

@router.post("/drive/create-individual-folder")
async def create_individual_folder(
    payload: IndividualFolderRequest,
    current_user: User = Depends(get_current_user),
):
    """Admin: create a Drive folder for a specific client with optional custom name and subfolders."""
    import asyncio
    folder_name = payload.custom_folder_name or payload.client_name

    # Resolve subfolders from template if not provided
    subfolders = payload.subfolders
    if subfolders is None:
        subfolders = await _resolve_subfolders()

    from backend.invoicing import _get_drive_service, _drive_configured
    if not _drive_configured():
        raise HTTPException(503, "Google Drive not configured.")

    loop = asyncio.get_event_loop()
    try:
        service = _get_drive_service()
        result = await loop.run_in_executor(
            None,
            _create_drive_folder_sync,
            service, folder_name, payload.parent_folder_id, subfolders,
        )
    except Exception as e:
        logger.error(f"Drive folder creation failed: {e}", exc_info=True)
        raise HTTPException(500, f"Drive error: {e}")

    # Persist folder_id to portal user and client
    folder_id = result.get("folder_id")
    if folder_id:
        await db.client_portal_users.update_many(
            {"client_id": payload.client_id},
            {"$set": {"google_drive_folder_id": folder_id, "google_drive_folder_name": folder_name}},
        )
        await db.clients.update_one(
            {"id": payload.client_id},
            {"$set": {"google_drive_folder_id": folder_id, "has_drive": True}},
        )

    return {
        **result,
        "folder_name": folder_name,
        "subfolders_created": subfolders,
    }
