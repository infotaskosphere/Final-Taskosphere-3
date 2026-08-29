"""
Centralized Google Drive service for Taskosphere — ROBUST V2.

Authentication strategy
-----------------------

1. Google Service Account
   - GOOGLE_SERVICE_ACCOUNT_JSON
   - GOOGLE_SERVICE_ACCOUNT_B64

2. Legacy Google OAuth
   - GOOGLE_REFRESH_TOKEN
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET

OAuth is preferred for existing portal folders because those folders may
have originally been created/owned by the connected Google account.

The service account is RETAINED and is the fallback for folders/resources
accessible to the service account. Authentication is selected per folder/file
when possible, so one credential cannot accidentally hide another account's Drive data.

The rest of the application should import:

    _get_drive_service
    _drive_configured
    reset_drive_service_cache

from this module.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import threading
import time
from typing import Optional

from fastapi import HTTPException

DRIVE_SERVICE_VERSION = "2.0.0-per-folder-auth"
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


# ============================================================================
# GOOGLE DRIVE SCOPES
# ============================================================================

DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]


# ============================================================================
# GLOBAL SERVICE CACHE
# ============================================================================

_DRIVE_SERVICE_CACHE = None
_DRIVE_AUTH_MODE = None

_DRIVE_SERVICE_LOCK = threading.RLock()


# ============================================================================
# SERVICE ACCOUNT
# ============================================================================

def _service_account_info() -> Optional[dict]:
    """
    Load Google service-account credentials.

    Priority:

        GOOGLE_SERVICE_ACCOUNT_JSON
        GOOGLE_SERVICE_ACCOUNT_B64
    """

    raw = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()

    if raw:
        try:
            value = json.loads(raw)

            if not isinstance(value, dict):
                raise ValueError(
                    "GOOGLE_SERVICE_ACCOUNT_JSON must contain a JSON object"
                )

            return value

        except Exception as exc:
            raise RuntimeError(
                f"Invalid GOOGLE_SERVICE_ACCOUNT_JSON: {exc}"
            ) from exc

    b64 = (os.getenv("GOOGLE_SERVICE_ACCOUNT_B64") or "").strip()

    if b64:
        try:
            decoded = base64.b64decode(b64).decode("utf-8")

            value = json.loads(decoded)

            if not isinstance(value, dict):
                raise ValueError(
                    "Decoded service-account data is not a JSON object"
                )

            return value

        except Exception as exc:
            raise RuntimeError(
                f"Invalid GOOGLE_SERVICE_ACCOUNT_B64: {exc}"
            ) from exc

    return None


def _service_account_configured() -> bool:
    """
    Return True when a service-account credential is available.
    """

    return bool(
        (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
        or
        (os.getenv("GOOGLE_SERVICE_ACCOUNT_B64") or "").strip()
    )


# ============================================================================
# LEGACY OAUTH REFRESH TOKEN
# ============================================================================

def _get_drive_refresh_token() -> Optional[str]:
    """
    Retrieve the existing Google OAuth refresh token.

    Priority:

        1. GOOGLE_REFRESH_TOKEN environment variable
        2. MongoDB app_settings.google_drive document

    The database fallback is intentionally retained because older
    Taskosphere installations may have stored the OAuth connection there.
    """

    env_token = (os.getenv("GOOGLE_REFRESH_TOKEN") or "").strip()

    if env_token:
        return env_token

    try:
        from backend.dependencies import db as _db

        async def _fetch_token():
            try:
                collection = _db["app_settings"]

                doc = await collection.find_one(
                    {"_id": "google_drive"}
                )

                if (
                    doc
                    and doc.get("connected")
                    and doc.get("refresh_token")
                ):
                    return doc["refresh_token"]

            except Exception as exc:
                logger.warning(
                    "Unable to read Google Drive OAuth token from DB: %s",
                    exc,
                )

            return None

        try:
            with __import__("concurrent.futures").futures.ThreadPoolExecutor(
                max_workers=1
            ) as pool:

                token = pool.submit(
                    lambda: asyncio.run(_fetch_token())
                ).result(timeout=10)

        except Exception as exc:
            logger.warning(
                "Google Drive DB token lookup failed: %s",
                exc,
            )

            token = None

        if token:
            os.environ["GOOGLE_REFRESH_TOKEN"] = token
            return token

    except Exception as exc:
        logger.warning(
            "Could not read legacy Drive token from DB: %s",
            exc,
        )

    return None


# ============================================================================
# CONFIGURATION CHECK
# ============================================================================

def _drive_configured() -> bool:
    """
    Return True if Google Drive has at least one usable authentication
    configuration.

    Service account is preferred.

    Legacy OAuth is retained as a fallback.
    """

    if _service_account_configured():
        return True

    refresh_token = _get_drive_refresh_token()

    return bool(
        refresh_token
        and os.getenv("GOOGLE_CLIENT_ID")
        and os.getenv("GOOGLE_CLIENT_SECRET")
    )


# ============================================================================
# BUILD SERVICE ACCOUNT CLIENT
# ============================================================================

def _build_service_account_service():
    """
    Build a Google Drive v3 client using the service account.
    """

    from google.oauth2 import service_account

    info = _service_account_info()

    if not info:
        raise RuntimeError(
            "Google service account credentials are not configured."
        )

    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=DRIVE_SCOPES,
    )

    service = build(
        "drive",
        "v3",
        credentials=credentials,
        cache_discovery=False,
    )

    logger.info(
        "Google Drive initialized using SERVICE ACCOUNT authentication."
    )

    return service


# ============================================================================
# BUILD LEGACY OAUTH CLIENT
# ============================================================================

def _build_legacy_oauth_service():
    """
    Build a Google Drive v3 client using the existing OAuth refresh token.

    The refresh token is permanent until revoked, while short-lived access
    tokens are refreshed automatically.
    """

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    client_id = (
        os.getenv("GOOGLE_CLIENT_ID") or ""
    ).strip()

    client_secret = (
        os.getenv("GOOGLE_CLIENT_SECRET") or ""
    ).strip()

    refresh_token = _get_drive_refresh_token()

    if not client_id or not client_secret or not refresh_token:
        raise RuntimeError(
            "Google Drive OAuth is not configured. "
            "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and "
            "GOOGLE_REFRESH_TOKEN."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=DRIVE_SCOPES,
    )

    last_error = None

    for attempt in range(3):

        try:

            creds.refresh(Request())

            service = build(
                "drive",
                "v3",
                credentials=creds,
                cache_discovery=False,
            )

            logger.info(
                "Google Drive initialized using LEGACY OAUTH authentication."
            )

            return service

        except Exception as exc:

            last_error = exc

            logger.warning(
                "Google Drive OAuth refresh attempt %s failed: %s",
                attempt + 1,
                exc,
            )

            if attempt < 2:
                time.sleep(1.0 + attempt)

    raise last_error


# ============================================================================
# INITIAL SERVICE CREATION
# ============================================================================

def _create_drive_service():
    """
    Create the best available Drive client.

    OAuth is intentionally tried first because existing Taskosphere client
    folders may belong to the Google account that originally connected Drive.
    The service account remains a full fallback and is never removed.
    """
    global _DRIVE_AUTH_MODE

    errors = []

    # 1) Existing OAuth connection — preserves existing client folders.
    if os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET") and _get_drive_refresh_token():
        try:
            service = _build_legacy_oauth_service()
            _DRIVE_AUTH_MODE = "oauth"
            return service
        except Exception as exc:
            errors.append(f"oauth: {exc}")
            logger.warning("Google Drive OAuth initialization failed; trying service account: %s", exc)

    # 2) Service account — retained for new/shared folders and installations
    #    that do not have an OAuth refresh token.
    if _service_account_configured():
        try:
            service = _build_service_account_service()
            _DRIVE_AUTH_MODE = "service_account"
            return service
        except Exception as exc:
            errors.append(f"service_account: {exc}")
            logger.warning("Google Drive service-account initialization failed: %s", exc)

    detail = "; ".join(errors) if errors else "No Google Drive credentials are configured."
    raise RuntimeError(f"Google Drive authentication failed: {detail}")


def _build_drive_service_for_mode(mode: str):
    """Build a fresh Drive client for a specific configured auth mode."""
    global _DRIVE_AUTH_MODE
    if mode == "oauth":
        service = _build_legacy_oauth_service()
    elif mode == "service_account":
        service = _build_service_account_service()
    else:
        raise ValueError(f"Unknown Google Drive auth mode: {mode}")
    _DRIVE_AUTH_MODE = mode
    return service


def _available_auth_modes():
    """Return usable credential modes without exposing any secrets."""
    modes=[]
    if os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET") and _get_drive_refresh_token():
        modes.append("oauth")
    if _service_account_configured():
        modes.append("service_account")
    return modes


def _other_auth_mode(current_mode: Optional[str]) -> Optional[str]:
    for mode in _available_auth_modes():
        if mode != current_mode:
            return mode
    return None


# ============================================================================
# PUBLIC SERVICE ACCESS
# ============================================================================

def _get_drive_service():
    """
    Return a reusable authenticated Google Drive v3 client.

    Thread-safe.

    The service is cached in memory, but the credentials themselves are
    recreated automatically after a backend restart.

    This means a Render restart does NOT require manually reconnecting
    Google Drive.
    """

    global _DRIVE_SERVICE_CACHE

    with _DRIVE_SERVICE_LOCK:

        if _DRIVE_SERVICE_CACHE is not None:
            return _DRIVE_SERVICE_CACHE

        if not _drive_configured():

            raise HTTPException(
                status_code=503,
                detail=(
                    "Google Drive is not configured. "
                    "Configure GOOGLE_SERVICE_ACCOUNT_JSON or "
                    "the existing Google OAuth credentials."
                ),
            )

        try:

            _DRIVE_SERVICE_CACHE = _create_drive_service()

            logger.info(
                "Google Drive service ready. Authentication mode: %s",
                _DRIVE_AUTH_MODE,
            )

            return _DRIVE_SERVICE_CACHE

        except Exception as exc:

            logger.error(
                "Google Drive authentication failed: %s",
                exc,
                exc_info=True,
            )

            raise HTTPException(
                status_code=503,
                detail=(
                    "Google Drive authentication failed. "
                    "The configured credentials could not be initialized."
                ),
            ) from exc


# ============================================================================
# AUTHENTICATION MODE
# ============================================================================

def get_drive_auth_mode() -> Optional[str]:
    """
    Return the currently active authentication mode.

    Possible values:

        service_account
        oauth
        None
    """

    return _DRIVE_AUTH_MODE


# ============================================================================
# RESET / RECONNECT
# ============================================================================

def reset_drive_service_cache() -> None:
    """
    Clear the cached Drive service.

    This does NOT delete credentials.

    It only forces the next Drive request to rebuild the authenticated
    service.

    Useful after:
        - credential rotation
        - Render environment-variable changes
        - OAuth token replacement
        - Google API authentication failures
    """

    global _DRIVE_SERVICE_CACHE
    global _DRIVE_AUTH_MODE

    with _DRIVE_SERVICE_LOCK:

        _DRIVE_SERVICE_CACHE = None
        _DRIVE_AUTH_MODE = None

    logger.info(
        "Google Drive service cache reset."
    )


# ============================================================================
# FOLDER / FILE SPECIFIC AUTHENTICATION
# ============================================================================

def _probe_folder_with_service(service, folder_id: str):
    return service.files().get(
        fileId=folder_id,
        fields="id,name,mimeType,parents,driveId",
        supportsAllDrives=True,
    ).execute()


def get_drive_service_for_folder(folder_id: str):
    """
    Return the credential that can actually access ``folder_id``.

    This is the key fix for the portal issue: service-account credentials and
    the OAuth Google account are independent Drive identities. A globally
    cached service account can be perfectly healthy while still being unable
    to see an existing OAuth-owned folder. We therefore probe the requested
    folder and automatically switch credentials when necessary.
    """
    folder_id = str(folder_id or "").strip()
    if not folder_id:
        raise ValueError("folder_id is required")
    if not _drive_configured():
        raise HTTPException(503, "Google Drive is not configured.")

    with _DRIVE_SERVICE_LOCK:
        preferred = _DRIVE_AUTH_MODE or _available_auth_modes()[0]
        modes=[preferred] + [m for m in _available_auth_modes() if m != preferred]
        errors=[]
        for mode in modes:
            try:
                if mode == _DRIVE_AUTH_MODE and _DRIVE_SERVICE_CACHE is not None:
                    service=_DRIVE_SERVICE_CACHE
                else:
                    service=_build_drive_service_for_mode(mode)
                    if mode == _DRIVE_AUTH_MODE:
                        globals()["_DRIVE_SERVICE_CACHE"] = service
                _probe_folder_with_service(service, folder_id)
                logger.info("Google Drive folder %s is accessible using %s authentication.", folder_id, mode)
                return service
            except Exception as exc:
                errors.append(f"{mode}: {exc}")
                logger.warning("Drive folder %s is not accessible using %s: %s", folder_id, mode, exc)
                # Never leave a failed mode cached.
                if mode == _DRIVE_AUTH_MODE:
                    globals()["_DRIVE_SERVICE_CACHE"] = None
                    globals()["_DRIVE_AUTH_MODE"] = None
        raise HTTPException(503, "Google Drive folder is not accessible with the configured Google accounts. " + " | ".join(errors))


def get_drive_service_for_file(file_id: str):
    """Return the credential that can access a specific Drive file."""
    file_id=str(file_id or "").strip()
    if not file_id:
        raise ValueError("file_id is required")
    if not _drive_configured():
        raise HTTPException(503, "Google Drive is not configured.")

    with _DRIVE_SERVICE_LOCK:
        preferred=_DRIVE_AUTH_MODE or _available_auth_modes()[0]
        modes=[preferred] + [m for m in _available_auth_modes() if m != preferred]
        errors=[]
        for mode in modes:
            try:
                if mode == _DRIVE_AUTH_MODE and _DRIVE_SERVICE_CACHE is not None:
                    service=_DRIVE_SERVICE_CACHE
                else:
                    service=_build_drive_service_for_mode(mode)
                    if mode == _DRIVE_AUTH_MODE:
                        globals()["_DRIVE_SERVICE_CACHE"] = service
                service.files().get(fileId=file_id, fields="id,name,mimeType,parents,driveId", supportsAllDrives=True).execute()
                return service
            except Exception as exc:
                errors.append(f"{mode}: {exc}")
                if mode == _DRIVE_AUTH_MODE:
                    globals()["_DRIVE_SERVICE_CACHE"] = None
                    globals()["_DRIVE_AUTH_MODE"] = None
        raise HTTPException(503, "Google Drive file is not accessible with the configured Google accounts. " + " | ".join(errors))


# ============================================================================
# API FAILURE DETECTION
# ============================================================================

def _is_authentication_error(exc: Exception) -> bool:
    """
    Determine whether a Google API exception looks like an authentication
    or authorization failure.
    """

    if isinstance(exc, HttpError):

        status = getattr(
            exc.resp,
            "status",
            None,
        )

        return status in {
            401,
            403,
        }

    message = str(exc).lower()

    authentication_terms = [
        "unauthorized",
        "invalid credentials",
        "invalid_grant",
        "invalid token",
        "expired",
        "access token",
        "authentication",
        "permission denied",
        "insufficient permission",
    ]

    return any(
        term in message
        for term in authentication_terms
    )


def _is_transient_google_error(exc: Exception) -> bool:
    """
    Identify temporary Google API/network failures that are safe to retry.
    """

    if isinstance(exc, HttpError):

        status = getattr(
            exc.resp,
            "status",
            None,
        )

        return status in {
            408,
            429,
            500,
            502,
            503,
            504,
        }

    message = str(exc).lower()

    transient_terms = [
        "timed out",
        "timeout",
        "temporarily unavailable",
        "connection reset",
        "connection aborted",
        "connection refused",
        "remote end closed",
        "503",
        "502",
        "504",
    ]

    return any(
        term in message
        for term in transient_terms
    )


# ============================================================================
# SERVICE HEALTH CHECK
# ============================================================================

def verify_drive_connection() -> bool:
    """
    Verify that the currently configured Drive service can communicate
    with Google Drive.

    This is intentionally lightweight.

    It does not modify Drive data.
    """

    try:

        service = _get_drive_service()

        service.about().get(
            fields="user(displayName,emailAddress),storageQuota"
        ).execute()

        return True

    except Exception as exc:

        logger.warning(
            "Google Drive health check failed: %s",
            exc,
        )

        return False


# ============================================================================
# SERVICE RECOVERY
# ============================================================================

def _recover_drive_service():
    """
    Rebuild the Drive service after an authentication failure.

    Existing credentials are preserved.

    If service-account authentication fails during rebuild, OAuth is
    automatically attempted by _create_drive_service().
    """

    logger.warning(
        "Attempting automatic Google Drive authentication recovery."
    )

    reset_drive_service_cache()

    return _get_drive_service()


# ============================================================================
# EXECUTE DRIVE REQUEST WITH RETRY
# ============================================================================

def execute_drive_request(
    request_factory,
    *,
    max_attempts: int = 3,
):
    """
    Execute a Google Drive request with automatic retry/recovery.

    Example:

        result = execute_drive_request(
            lambda service: service.files().list(
                q="trashed = false",
                fields="files(id,name)"
            )
        )

    This helper is available to new code.

    Existing code that directly uses:

        _get_drive_service().files().list(...).execute()

    continues to work normally.
    """

    last_error = None

    for attempt in range(max_attempts):

        try:

            service = _get_drive_service()

            request = request_factory(service)

            return request.execute()

        except Exception as exc:

            last_error = exc

            logger.warning(
                "Google Drive request failed "
                "(attempt %s/%s): %s",
                attempt + 1,
                max_attempts,
                exc,
            )

            # ----------------------------------------------------------
            # Authentication / permission issue
            # ----------------------------------------------------------

            if _is_authentication_error(exc):

                if attempt < max_attempts - 1:

                    try:

                        _recover_drive_service()

                    except Exception as recovery_exc:

                        logger.warning(
                            "Google Drive automatic recovery failed: %s",
                            recovery_exc,
                        )

                    time.sleep(0.5)

                    continue

            # ----------------------------------------------------------
            # Temporary Google/network issue
            # ----------------------------------------------------------

            if _is_transient_google_error(exc):

                if attempt < max_attempts - 1:

                    time.sleep(
                        0.75 * (attempt + 1)
                    )

                    continue

            break

    if last_error:
        raise last_error

    raise RuntimeError(
        "Google Drive request failed without an exception."
    )


# ============================================================================
# FOLDER ACCESS VERIFICATION
# ============================================================================

def verify_drive_folder_access(folder_id: str) -> dict:
    """Verify access using the correct credential for this folder."""
    if not folder_id:
        raise ValueError("folder_id is required")
    try:
        service=get_drive_service_for_folder(folder_id)
        result=service.files().get(fileId=folder_id, fields="id,name,mimeType,parents,driveId", supportsAllDrives=True).execute()
        return {"accessible": True, "folder_id": result.get("id"), "name": result.get("name"),
                "mime_type": result.get("mimeType"), "parents": result.get("parents", []),
                "drive_id": result.get("driveId"), "auth_mode": get_drive_auth_mode()}
    except Exception as exc:
        logger.error("Google Drive folder access verification failed for %s: %s", folder_id, exc, exc_info=True)
        return {"accessible": False, "folder_id": folder_id, "error": str(exc), "auth_mode": get_drive_auth_mode()}


# ============================================================================
# SIMPLE DRIVE FILE LIST HELPER
# ============================================================================

def list_drive_folder(
    folder_id: str,
    *,
    page_size: int = 500,
) -> list:
    """
    Safely list files/folders inside a Drive folder.

    This helper uses execute_drive_request() so new code can obtain
    automatic retry/recovery.
    """

    if not folder_id:
        return []

    def _request(service):

        return service.files().list(
            q=(
                f"'{folder_id}' in parents "
                "and trashed = false"
            ),
            fields=(
                "files("
                "id,"
                "name,"
                "mimeType,"
                "size,"
                "modifiedTime,"
                "webViewLink,"
                "iconLink,"
                "parents,"
                "driveId"
                ")"
            ),
            orderBy="folder,name",
            pageSize=page_size,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )

    return execute_drive_request(
        _request,
        max_attempts=3,
    ).get(
        "files",
        []
    )


# ============================================================================
# CREATE FOLDER
# ============================================================================

def create_drive_folder(
    name: str,
    parent_folder_id: Optional[str] = None,
) -> dict:
    """
    Create a Google Drive folder.

    Uses the centralized authentication and retry mechanism.
    """

    if not name:
        raise ValueError(
            "Folder name is required"
        )

    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }

    if parent_folder_id:
        metadata["parents"] = [
            parent_folder_id
        ]

    def _request(service):

        return service.files().create(
            body=metadata,
            fields="id,name,mimeType,parents,webViewLink",
        )

    return execute_drive_request(
        _request,
        max_attempts=3,
    )


# ============================================================================
# UPLOAD FILE
# ============================================================================

def upload_drive_file(
    file_metadata: dict,
    media,
) -> dict:
    """
    Upload a file to Google Drive using the centralized service.

    `media` must be a googleapiclient.http.MediaUpload-compatible object.
    """

    def _request(service):

        return service.files().create(
            body=file_metadata,
            media_body=media,
            fields=(
                "id,"
                "name,"
                "mimeType,"
                "size,"
                "modifiedTime,"
                "webViewLink,"
                "parents"
            ),
        )

    return execute_drive_request(
        _request,
        max_attempts=3,
    )


# ============================================================================
# DELETE FILE
# ============================================================================

def delete_drive_file(
    file_id: str,
) -> bool:
    """
    Delete a Drive file using the centralized service.
    """

    if not file_id:
        raise ValueError(
            "file_id is required"
        )

    def _request(service):

        return service.files().delete(
            fileId=file_id
        )

    execute_drive_request(
        _request,
        max_attempts=3,
    )

    return True


# ============================================================================
# DEBUG INFORMATION
# ============================================================================

def get_drive_debug_info() -> dict:
    """
    Return non-sensitive Drive configuration information.

    NEVER returns:
        - service-account private key
        - refresh token
        - client secret
        - access token
    """

    service_account = _service_account_info()

    service_account_email = None

    if service_account:
        service_account_email = service_account.get(
            "client_email"
        )

    return {
        "configured": _drive_configured(),
        "service_account_configured": _service_account_configured(),
        "service_account_email": service_account_email,
        "oauth_configured": bool(
            os.getenv("GOOGLE_CLIENT_ID")
            and os.getenv("GOOGLE_CLIENT_SECRET")
            and _get_drive_refresh_token()
        ),
        "active_auth_mode": _DRIVE_AUTH_MODE,
        "service_cached": _DRIVE_SERVICE_CACHE is not None,
        "available_auth_modes": _available_auth_modes(),
        "strategy": "oauth-first-with-per-folder-service-account-fallback",
    }


# ============================================================================
# STARTUP LOGGING
# ============================================================================

def log_drive_configuration() -> None:
    """
    Log safe Google Drive configuration information at application startup.

    No secrets are logged.
    """

    try:

        info = get_drive_debug_info()

        logger.info(
            "Google Drive configuration: "
            "configured=%s, "
            "service_account=%s, "
            "oauth=%s, "
            "active_mode=%s, "
            "cached=%s",
            info["configured"],
            info["service_account_configured"],
            info["oauth_configured"],
            info["active_auth_mode"],
            info["service_cached"],
        )

        if info.get("service_account_email"):
            logger.info(
                "Google Drive service-account identity: %s",
                info["service_account_email"],
            )

    except Exception as exc:

        logger.warning(
            "Unable to log Google Drive configuration: %s",
            exc,
        )
