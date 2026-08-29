"""
Centralized Google Drive service for Taskosphere.

Primary authentication:
    Google Service Account via GOOGLE_SERVICE_ACCOUNT_JSON or
    GOOGLE_SERVICE_ACCOUNT_B64.

Legacy OAuth refresh-token authentication is intentionally kept as a
fallback so an existing deployment can be migrated without downtime.
Once the service-account variables are configured and the service account
has access to the Taskosphere Drive folders, Drive operations no longer
depend on a user's Google OAuth session or refresh-token connection.

The rest of the application should import:
    _get_drive_service
    _drive_configured
from this module.
"""

import base64
import json
import logging
import os
import time
from typing import Optional

from fastapi import HTTPException
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]

_DRIVE_SERVICE_CACHE = None
_DRIVE_SERVICE_LOCK = None


def _service_account_info() -> Optional[dict]:
    """Load service-account JSON from an environment variable."""
    raw = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()

    if raw:
        try:
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON must contain a JSON object")
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
                raise ValueError("Decoded service-account data is not a JSON object")
            return value
        except Exception as exc:
            raise RuntimeError(
                f"Invalid GOOGLE_SERVICE_ACCOUNT_B64: {exc}"
            ) from exc

    return None


def _service_account_configured() -> bool:
    return bool(
        (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
        or (os.getenv("GOOGLE_SERVICE_ACCOUNT_B64") or "").strip()
    )


def _get_drive_refresh_token() -> Optional[str]:
    """
    Legacy fallback only.

    This is deliberately retained for backwards compatibility during
    migration. Service-account authentication is always preferred.
    """
    env_token = os.getenv("GOOGLE_REFRESH_TOKEN")
    if env_token:
        return env_token

    try:
        import asyncio
        from backend.dependencies import db as _db

        async def _fetch():
            doc = await _db["app_settings"].find_one({"_id": "google_drive"})
            if doc and doc.get("connected") and doc.get("refresh_token"):
                return doc["refresh_token"]
            return None

        try:
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                token = pool.submit(lambda: asyncio.run(_fetch())).result(timeout=5)
        except Exception:
            token = None

        if token:
            os.environ["GOOGLE_REFRESH_TOKEN"] = token
            return token
    except Exception as exc:
        logger.warning("Could not read legacy Drive token from DB: %s", exc)

    return None


def _drive_configured() -> bool:
    """Return True if permanent service-account or legacy OAuth config exists."""
    if _service_account_configured():
        return True

    return bool(
        _get_drive_refresh_token()
        and os.getenv("GOOGLE_CLIENT_ID")
        and os.getenv("GOOGLE_CLIENT_SECRET")
    )


def _build_service_account_service():
    from google.oauth2 import service_account

    info = _service_account_info()
    if not info:
        raise RuntimeError("Google service account credentials are not configured")

    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=DRIVE_SCOPES,
    )

    return build(
        "drive",
        "v3",
        credentials=credentials,
        cache_discovery=False,
    )


def _build_legacy_oauth_service():
    """Backward-compatible OAuth path used only when service account is absent."""
    from google.auth.transport.requests import Request
    from google.auth.oauth2 import Credentials
    import google.auth.exceptions

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    refresh_token = _get_drive_refresh_token()

    if not client_id or not client_secret or not refresh_token:
        raise RuntimeError(
            "Google Drive is not configured. Configure "
            "GOOGLE_SERVICE_ACCOUNT_JSON (recommended) or the legacy OAuth variables."
        )

    cache = getattr(_build_legacy_oauth_service, "_cache", None)
    if cache is None:
        cache = {}
        _build_legacy_oauth_service._cache = cache

    cached = cache.get(refresh_token)
    if cached is not None and cached.valid:
        return build("drive", "v3", credentials=cached, cache_discovery=False)

    creds = Credentials(
        None,
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
            cache[refresh_token] = creds
            return build(
                "drive",
                "v3",
                credentials=creds,
                cache_discovery=False,
            )
        except google.auth.exceptions.RefreshError:
            raise
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.75 * (attempt + 1))

    raise last_error


def _get_drive_service():
    """
    Return a reusable authenticated Drive v3 client.

    Service-account authentication is preferred and does not depend on
    an end-user OAuth connection. A transient API failure therefore cannot
    mark the portal as disconnected.
    """
    global _DRIVE_SERVICE_CACHE

    if _DRIVE_SERVICE_CACHE is not None:
        return _DRIVE_SERVICE_CACHE

    if _service_account_configured():
        try:
            _DRIVE_SERVICE_CACHE = _build_service_account_service()
            return _DRIVE_SERVICE_CACHE
        except Exception as exc:
            logger.error("Google Drive service-account initialization failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail="Google Drive service account is configured but could not be initialized.",
            ) from exc

    # Safe migration fallback.
    try:
        _DRIVE_SERVICE_CACHE = _build_legacy_oauth_service()
        return _DRIVE_SERVICE_CACHE
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Google Drive authentication failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Google Drive authentication failed: {exc}",
        ) from exc


def reset_drive_service_cache() -> None:
    """Clear the in-process service cache; useful after credential rotation."""
    global _DRIVE_SERVICE_CACHE
    _DRIVE_SERVICE_CACHE = None
