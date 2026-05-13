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
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
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
        "google_drive_folder_id": body.google_drive_folder_id,
        "google_drive_folder_name": body.google_drive_folder_name or "My Documents",
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

@router.get("/drive/files")
async def portal_drive_files(
    folder_id: Optional[str] = Query(None, description="Subfolder to browse (must be inside client's root)"),
    portal_user=Depends(get_current_portal_client),
):
    """
    Returns visible files/folders in the Google Drive folder linked to this client.
    Supports subfolder navigation: pass ?folder_id=XYZ to browse into a subfolder.
    All folder_id values must descend from the client's assigned root folder.
    Respects admin-configured visibility rules (hidden_ids are filtered out).
    """
    root_folder_id = portal_user.get("google_drive_folder_id")
    if not root_folder_id:
        return {
            "files": [],
            "folders": [],
            "breadcrumb": [],
            "message": "No Google Drive folder has been linked to your account. Please contact your account manager.",
        }

    # Security: clients can only browse within their assigned root folder.
    # We trust folder_id only if it was a folder we already exposed (is_visible).
    # The simplest safe approach: only allow navigation into folders that
    # appeared in the parent listing as visible folders.
    browse_id = root_folder_id  # default: client's root
    breadcrumb = [{"id": root_folder_id, "name": portal_user.get("google_drive_folder_name") or "My Documents"}]

    if folder_id and folder_id != root_folder_id:
        # Validate: confirm this folder_id appeared as a visible subfolder
        # by fetching the root and checking it exists and is visible
        try:
            root_files = _fetch_drive_files_raw(root_folder_id)
        except HTTPException:
            return {"files": [], "folders": [], "breadcrumb": breadcrumb, "error": "Could not reach Google Drive."}

        vis_doc = await db.client_drive_visibility.find_one(
            {"portal_user_id": portal_user["id"]}, {"_id": 0}
        )
        hidden_ids: set = set(vis_doc.get("hidden_ids", [])) if vis_doc else set()

        valid_subfolder_ids = {
            f["id"] for f in root_files
            if f.get("mimeType") == "application/vnd.google-apps.folder"
            and f["id"] not in hidden_ids
        }

        if folder_id in valid_subfolder_ids:
            browse_id = folder_id
            # Build breadcrumb name
            folder_name = next((f["name"] for f in root_files if f["id"] == folder_id), folder_id)
            breadcrumb.append({"id": folder_id, "name": folder_name})
        else:
            # Invalid / hidden folder – silently fall back to root
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

    # Apply visibility filter
    vis_doc = await db.client_drive_visibility.find_one(
        {"portal_user_id": portal_user["id"]}, {"_id": 0}
    )
    hidden_ids: set = set(vis_doc.get("hidden_ids", [])) if vis_doc else set()
    visible_all = [f for f in all_files if f["id"] not in hidden_ids]

    # Separate folders from files
    folders = [f for f in visible_all if f.get("mimeType") == "application/vnd.google-apps.folder"]
    files = [f for f in visible_all if f.get("mimeType") != "application/vnd.google-apps.folder"]

    return {
        "files": files,
        "folders": folders,
        "breadcrumb": breadcrumb,
        "root_folder_id": root_folder_id,
        "current_folder_id": browse_id,
    }
