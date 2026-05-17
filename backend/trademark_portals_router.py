# backend/trademark_portals_router.py
# ----------------------------------------------------------------------------
# Mount this router from backend/server.py:
#
#     from backend.trademark_portals_router import router as tm_portals_router
#     app.include_router(tm_portals_router)
#
# Endpoints (all under /api/trademark-sphere/portals):
#
#   ── Estatus (Trademark Register: email + captcha + OTP) ──
#   POST  /estatus/captcha            -> { session_id, captcha_image }
#   POST  /estatus/send-otp           { session_id, email, captcha }
#   POST  /estatus/verify-otp         { session_id, otp }
#                                       -> { application_numbers: [...] }
#
#   ── Agent eFiling (user-id + password + captcha) ──
#   POST  /agent/captcha              -> { session_id, captcha_image }
#   POST  /agent/login                { session_id, user_id, password, captcha }
#                                       -> { application_numbers: [...] }
#
#   ── Optional: bulk-import the numbers we just scraped ──
#   POST  /import                     { application_numbers: [...], attorney?, client_id? }
# ----------------------------------------------------------------------------

from __future__ import annotations

import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from backend.dependencies import get_current_user
from backend.models import User
from backend.services.ipindia_portals import (
    agent_efiling_portal,
    estatus_portal,
)

logger = logging.getLogger("trademark.portals")
router = APIRouter(prefix="/api/trademark-sphere/portals", tags=["Trademark Portals"])

_pool = ThreadPoolExecutor(max_workers=4)


def _run(fn, *args, **kwargs):
    """Run a blocking scraper call in the shared thread pool."""
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(_pool, lambda: fn(*args, **kwargs))


# ── request models ──────────────────────────────────────────────────────────

class CaptchaResponse(BaseModel):
    session_id:    str
    captcha_image: str    # data:image/jpeg;base64,...


class EstatusSendOtpBody(BaseModel):
    session_id: str
    email:      EmailStr
    captcha:    str = Field(..., min_length=3, max_length=12)


class EstatusVerifyBody(BaseModel):
    session_id: str
    otp:        str = Field(..., min_length=4, max_length=10)


class AgentLoginBody(BaseModel):
    session_id: str
    user_id:    str = Field(..., min_length=1, max_length=64)
    password:   str = Field(..., min_length=1, max_length=128)
    captcha:    str = Field(..., min_length=3, max_length=12)


class ImportNumbersBody(BaseModel):
    application_numbers: List[str]
    attorney:            Optional[str] = None
    client_id:           Optional[str] = None
    client_name:         Optional[str] = None


# ── Estatus flow ────────────────────────────────────────────────────────────

@router.post("/estatus/captcha", response_model=CaptchaResponse)
async def estatus_captcha(user: User = Depends(get_current_user)):
    try:
        data = await _run(estatus_portal.open)
    except Exception as exc:
        logger.exception("estatus open failed")
        raise HTTPException(502, f"estatus: {exc}")
    return data


@router.post("/estatus/send-otp")
async def estatus_send_otp(body: EstatusSendOtpBody, user: User = Depends(get_current_user)):
    try:
        return await _run(estatus_portal.send_otp, body.session_id, body.email, body.captcha)
    except ValueError as exc:
        raise HTTPException(410, str(exc))
    except Exception as exc:
        logger.exception("estatus send-otp failed")
        raise HTTPException(502, f"estatus: {exc}")


@router.post("/estatus/verify-otp")
async def estatus_verify_otp(body: EstatusVerifyBody, user: User = Depends(get_current_user)):
    try:
        return await _run(estatus_portal.verify_otp_and_list, body.session_id, body.otp)
    except ValueError as exc:
        raise HTTPException(410, str(exc))
    except Exception as exc:
        logger.exception("estatus verify failed")
        raise HTTPException(502, f"estatus: {exc}")


# ── Agent eFiling flow ──────────────────────────────────────────────────────

@router.post("/agent/captcha", response_model=CaptchaResponse)
async def agent_captcha(user: User = Depends(get_current_user)):
    try:
        return await _run(agent_efiling_portal.open)
    except Exception as exc:
        logger.exception("agent portal open failed")
        raise HTTPException(502, f"agent: {exc}")


@router.post("/agent/login")
async def agent_login(body: AgentLoginBody, user: User = Depends(get_current_user)):
    try:
        return await _run(
            agent_efiling_portal.login_and_list,
            body.session_id, body.user_id, body.password, body.captcha,
        )
    except ValueError as exc:
        raise HTTPException(410, str(exc))
    except Exception as exc:
        logger.exception("agent login failed")
        raise HTTPException(502, f"agent: {exc}")


# ── Optional: hand the scraped numbers to the existing import pipeline ─────
# This reuses the per-application scraper you already have in trademark_sphere.py.

@router.post("/import")
async def import_scraped_numbers(
    body: ImportNumbersBody, bg: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    # Avoid a circular import by importing lazily.
    from backend.trademark_sphere import scrape_trademark, _compute_deadlines, _gen_reminders, db, IST
    from datetime import datetime

    added, skipped = 0, 0
    for num in body.application_numbers:
        num = (num or "").strip()
        if not num:
            continue
        exists = await db.trademark_sphere.find_one({"application_number": num})
        if exists:
            skipped += 1
            continue
        try:
            raw = await scrape_trademark(num, "")
        except Exception as exc:
            logger.warning("scrape %s failed: %s", num, exc)
            continue
        dl = _compute_deadlines(raw)
        now = datetime.now(IST)
        tid = str(uuid.uuid4())
        doc = {
            "_id": tid, "id": tid,
            **{k: raw.get(k, "") for k in (
                "application_number", "word_mark", "class_number", "tm_status",
                "proprietor", "applicant_name", "filing_date", "registration_date",
                "valid_upto", "goods_and_services", "trademark_image_url", "address",
            )},
            "attorney":      body.attorney or raw.get("attorney", ""),
            "client_id":     body.client_id or "",
            "client_name":   body.client_name or "",
            "reminder_emails": [],
            "reminders_enabled": True,
            "notes":         "Imported from IP India portal",
            "last_fetched":  now.isoformat(),
            "created_at":    now.isoformat(),
            "updated_at":    now.isoformat(),
            "created_by":    user.id,
            "raw_data":      raw,
            "scrape_source": raw.get("scrape_source", "ipindia"),
            "documents":     raw.get("documents", []),
            "hearings":      raw.get("hearings"),
            **dl,
        }
        await db.trademark_sphere.insert_one(doc)
        bg.add_task(_gen_reminders, tid, doc)
        added += 1

    return {"added": added, "skipped": skipped, "requested": len(body.application_numbers)}
