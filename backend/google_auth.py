"""
google_auth.py — Google Drive OAuth flow
─────────────────────────────────────────────────────────────────────────────
Routes
  GET  /auth/google              → Redirect user to Google consent screen
  GET  /auth/google/callback     → Exchange code → save refresh token to DB
                                   → Redirect to frontend with ?drive=connected
  GET  /auth/google/status       → Return current Drive connection status
  POST /auth/google/disconnect   → Remove stored refresh token from DB
─────────────────────────────────────────────────────────────────────────────
Storage: `app_settings` collection, document _id = "google_drive"
"""

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from google_auth_oauthlib.flow import Flow
import os

from backend.dependencies import db, get_current_user
from backend.models import User

router = APIRouter()

CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL  = os.getenv("FRONTEND_URL", "https://final-taskosphere-frontend.onrender.com")
BACKEND_URL   = os.getenv("BACKEND_URL",  "https://final-taskosphere-backend.onrender.com")
REDIRECT_URI  = f"{BACKEND_URL}/auth/google/callback"

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]

SETTINGS_COLLECTION = "app_settings"
DRIVE_DOC_ID        = "google_drive"


# ── helper ────────────────────────────────────────────────────────────────
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


# ── 1. Initiate OAuth ──────────────────────────────────────────────────────
@router.get("/auth/google")
def auth_google():
    """Redirect the admin browser to Google's consent page."""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(500, "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set")

    flow = _build_flow()
    auth_url, _ = flow.authorization_url(
        prompt="consent",
        access_type="offline",   # ensures we receive a refresh_token
    )
    return RedirectResponse(auth_url)


# ── 2. OAuth Callback ─────────────────────────────────────────────────────
@router.get("/auth/google/callback")
async def callback(request: Request):
    """
    Exchange the authorization code for tokens, persist the refresh token
    in MongoDB, then redirect back to the frontend settings page.
    """
    code  = request.query_params.get("code")
    error = request.query_params.get("error")

    # User denied access
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/settings?drive=denied")

    if not code:
        return RedirectResponse(f"{FRONTEND_URL}/settings?drive=error&reason=no_code")

    try:
        flow = _build_flow()
        flow.fetch_token(code=code)
        creds = flow.credentials

        if not creds.refresh_token:
            # Google only returns refresh_token on first consent.
            # If it's missing, the token has already been issued — user should
            # disconnect and reconnect to force a new consent screen.
            return RedirectResponse(
                f"{FRONTEND_URL}/settings?drive=error&reason=no_refresh_token"
            )

        # ── Persist in MongoDB ──────────────────────────────────────────
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

        # ── Also write to environment so existing helpers pick it up ────
        # (works for the current process; for persistent env you must set
        #  GOOGLE_REFRESH_TOKEN in Render's environment variables manually
        #  or add a config-reload endpoint)
        os.environ["GOOGLE_REFRESH_TOKEN"] = creds.refresh_token

        return RedirectResponse(f"{FRONTEND_URL}/settings?drive=connected")

    except Exception as exc:
        return RedirectResponse(
            f"{FRONTEND_URL}/settings?drive=error&reason={str(exc)[:80]}"
        )


# ── 3. Status endpoint ────────────────────────────────────────────────────
@router.get("/auth/google/status")
async def drive_connection_status(
    current_user: User = Depends(get_current_user),
):
    """Return whether Google Drive is connected (stored refresh token exists)."""
    doc = await db[SETTINGS_COLLECTION].find_one({"_id": DRIVE_DOC_ID})
    connected = bool(doc and doc.get("refresh_token") and doc.get("connected"))

    # Also honour legacy env-var-only setup
    env_token = os.getenv("GOOGLE_REFRESH_TOKEN")
    if env_token:
        connected = True

    return {
        "connected": connected,
        "source": "database" if (doc and doc.get("refresh_token")) else (
            "env" if env_token else "none"
        ),
    }


# ── 4. Disconnect ─────────────────────────────────────────────────────────
@router.post("/auth/google/disconnect")
async def disconnect_drive(
    current_user: User = Depends(get_current_user),
):
    """Remove the stored refresh token so Drive stops working."""
    await db[SETTINGS_COLLECTION].update_one(
        {"_id": DRIVE_DOC_ID},
        {"$set": {"refresh_token": None, "access_token": None, "connected": False}},
        upsert=True,
    )
    os.environ.pop("GOOGLE_REFRESH_TOKEN", None)
    return {"ok": True, "message": "Google Drive disconnected"}
