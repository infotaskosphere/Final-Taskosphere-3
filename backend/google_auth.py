"""
google_auth.py — Google Drive OAuth flow + File listing + Share links
─────────────────────────────────────────────────────────────────────────────
Routes
  GET  /auth/google              → Redirect user to Google consent screen
  GET  /auth/google/callback     → Exchange code → save refresh token to DB
                                   → Redirect to frontend with ?drive=connected
  GET  /auth/google/status       → Return current Drive connection status
  POST /auth/google/disconnect   → Remove stored refresh token from DB
  GET  /auth/google/reconnect    → Force re-consent to get a fresh refresh token
  GET  /auth/google/files        → List recent files in Drive (with search)
  POST /auth/google/share        → Create / retrieve a shareable download link
─────────────────────────────────────────────────────────────────────────────
Storage: `app_settings` collection, document _id = "google_drive"
"""

from fastapi import APIRouter, Request, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel
from typing import Optional
import os, datetime

from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

router = APIRouter()

CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL  = os.getenv("FRONTEND_URL", "https://final-taskosphere-frontend.onrender.com")
BACKEND_URL   = os.getenv("BACKEND_URL",  "https://final-taskosphere-backend.onrender.com")
REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI") or f"{BACKEND_URL}/auth/google/callback"

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]

SETTINGS_COLLECTION = "app_settings"
DRIVE_DOC_ID        = "google_drive"


# ── helpers ───────────────────────────────────────────────────────────────────

def _build_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id":     CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )


async def _get_drive_credentials() -> Optional[Credentials]:
    """Build a Credentials object from DB / env-var refresh token."""
    doc = await db[SETTINGS_COLLECTION].find_one({"_id": DRIVE_DOC_ID})
    refresh_token = (
        (doc.get("refresh_token") if doc else None)
        or os.getenv("GOOGLE_REFRESH_TOKEN")
    )
    if not refresh_token or not CLIENT_ID or not CLIENT_SECRET:
        return None
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=SCOPES,
    )


def _build_drive_service(creds: Credentials):
    return build("drive", "v3", credentials=creds, cache_discovery=False)


# ── 1. Initiate OAuth ─────────────────────────────────────────────────────────

@router.get("/auth/google")
def auth_google():
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(500, "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set")
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return RedirectResponse(auth_url)


# ── 2. OAuth Callback ─────────────────────────────────────────────────────────

@router.get("/auth/google/callback")
async def callback(request: Request):
    code  = request.query_params.get("code")
    error = request.query_params.get("error")

    if error:
        return RedirectResponse(f"{FRONTEND_URL}/settings/general?drive=denied")
    if not code:
        return RedirectResponse(f"{FRONTEND_URL}/settings/general?drive=error&reason=no_code")

    try:
        flow = _build_flow()
        flow.fetch_token(code=code)
        creds = flow.credentials

        if not creds.refresh_token:
            return RedirectResponse(
                f"{FRONTEND_URL}/settings/general?drive=error&reason=no_refresh_token"
            )

        await db[SETTINGS_COLLECTION].update_one(
            {"_id": DRIVE_DOC_ID},
            {
                "$set": {
                    "refresh_token": creds.refresh_token,
                    "access_token":  creds.token,
                    "connected":     True,
                }
            },
            upsert=True,
        )
        os.environ["GOOGLE_REFRESH_TOKEN"] = creds.refresh_token
        return RedirectResponse(f"{FRONTEND_URL}/settings/general?drive=connected")

    except Exception as exc:
        return RedirectResponse(
            f"{FRONTEND_URL}/settings/general?drive=error&reason={str(exc)[:80]}"
        )


# ── 3. Status endpoint ────────────────────────────────────────────────────────

@router.get("/auth/google/status")
async def drive_connection_status(current_user: User = Depends(get_current_user)):
    doc = await db[SETTINGS_COLLECTION].find_one({"_id": DRIVE_DOC_ID})
    connected = bool(doc and doc.get("refresh_token") and doc.get("connected"))
    env_token = os.getenv("GOOGLE_REFRESH_TOKEN")
    if env_token:
        connected = True
    return {
        "connected": connected,
        "source": "database" if (doc and doc.get("refresh_token")) else (
            "env" if env_token else "none"
        ),
    }


# ── 4. Disconnect ─────────────────────────────────────────────────────────────

@router.post("/auth/google/disconnect")
async def disconnect_drive(current_user: User = Depends(require_admin)):
    await db[SETTINGS_COLLECTION].update_one(
        {"_id": DRIVE_DOC_ID},
        {"$set": {"refresh_token": None, "access_token": None, "connected": False}},
        upsert=True,
    )
    os.environ.pop("GOOGLE_REFRESH_TOKEN", None)
    return {"ok": True, "message": "Google Drive disconnected"}


# ── 5. Reconnect ──────────────────────────────────────────────────────────────

@router.get("/auth/google/reconnect")
async def reconnect_drive(current_user: User = Depends(require_admin)):
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(500, "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set")
    await db[SETTINGS_COLLECTION].update_one(
        {"_id": DRIVE_DOC_ID},
        {"$set": {"refresh_token": None, "access_token": None, "connected": False}},
        upsert=True,
    )
    os.environ.pop("GOOGLE_REFRESH_TOKEN", None)
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return RedirectResponse(auth_url)


# ── 6. List files ─────────────────────────────────────────────────────────────

@router.get("/auth/google/files")
async def list_drive_files(
    current_user: User = Depends(require_admin),
    page_size: int = Query(50, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search query string"),
    page_token: Optional[str] = Query(None),
):
    """
    Return a list of files from the connected Google Drive.
    Optionally filter with a search query (q) and paginate via page_token.
    """
    creds = await _get_drive_credentials()
    if not creds:
        raise HTTPException(401, "Google Drive not connected")

    try:
        service = _build_drive_service(creds)

        # Build query: exclude trashed files + optional search
        drive_query = "trashed = false"
        if q:
            drive_query += f" and name contains '{q.replace(chr(39), '')}'"

        kwargs = dict(
            pageSize=page_size,
            fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, iconLink, parents, shared)",
            orderBy="modifiedTime desc",
            q=drive_query,
        )
        if page_token:
            kwargs["pageToken"] = page_token

        result = service.files().list(**kwargs).execute()
        files  = result.get("files", [])
        next_  = result.get("nextPageToken")

        return {"files": files, "nextPageToken": next_, "count": len(files)}

    except Exception as exc:
        raise HTTPException(502, f"Drive API error: {str(exc)[:200]}")


# ── 7. Create / get shareable link ────────────────────────────────────────────

class ShareRequest(BaseModel):
    file_id: str
    expiry: Optional[str] = "never"   # "never" | "24h" | "7d" | "30d"

@router.post("/auth/google/share")
async def create_share_link(
    body: ShareRequest,
    current_user: User = Depends(require_admin),
):
    """
    Create or retrieve a public shareable link for a Drive file.
    Sets the file's sharing permission to 'anyone with the link can view'
    and returns the web view URL.

    Note: Google Drive API does NOT support setting an expiration time on
    'anyone' (public) permissions — only on specific user/group permissions.
    We therefore ignore `expiry` for the permission itself and just return
    the permanent shareable link. The caller can communicate expiry intent
    through other means (e.g. a separate revocation workflow).
    """
    creds = await _get_drive_credentials()
    if not creds:
        raise HTTPException(401, "Google Drive not connected")

    try:
        service = _build_drive_service(creds)

        # Grant "anyone with the link" read access.
        # expiry is intentionally not applied here because Google Drive rejects
        # expirationTime on type="anyone" permissions.
        permission = {
            "type": "anyone",
            "role": "reader",
        }

        service.permissions().create(
            fileId=body.file_id,
            body=permission,
            fields="id",
        ).execute()

        # Retrieve the file metadata (including shareable links)
        file_meta = service.files().get(
            fileId=body.file_id,
            fields="id, name, mimeType, webViewLink, webContentLink, size",
        ).execute()

        share_url = (
            file_meta.get("webViewLink")
            or file_meta.get("webContentLink")
            or f"https://drive.google.com/file/d/{body.file_id}/view?usp=sharing"
        )

        return {
            "ok": True,
            "file_id": body.file_id,
            "file_name": file_meta.get("name"),
            "share_url": share_url,
            "web_view_link": file_meta.get("webViewLink"),
            "web_content_link": file_meta.get("webContentLink"),
            "expiry": "permanent",   # Always permanent for public links via Drive API
        }

    except Exception as exc:
        raise HTTPException(502, f"Drive share error: {str(exc)[:200]}")
