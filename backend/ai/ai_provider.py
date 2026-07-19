"""
AI Provider Router
==================

Single point of truth that routes every OCR / vision call to the right
provider (Gemini or Groq). Callers should NEVER call Gemini/Groq HTTP
helpers directly — go through this module.

Selection:
    AI_PROVIDER=gemini  -> Gemini vision (single + multipage)
    AI_PROVIDER=groq    -> Groq vision via groq_batch_processor
    (unset)             -> auto: prefer Gemini if GEMINI_API_KEY is set,
                          else Groq.

Public API:
    get_provider() -> "gemini" | "groq"
    await vision_single(image_b64, mime_type, prompt)          -> str
    await vision_multipage(page_images_b64, prompt)            -> str
    await ocr_pages(page_images_b64, prompt, progress_cb=None) -> str

`ocr_pages` is the entry point for scanned-PDF / multi-image OCR. When the
selected provider is Groq it automatically uses the batch processor to
respect Groq's 3-images-per-request limit, retry, split and merge in order.

No business logic, parser, GST, ledger, accounting or API contract is
touched by this module.
"""

from __future__ import annotations

import os
import logging
from typing import Callable, List, Optional, Tuple

from fastapi import HTTPException

from backend.ai import groq_batch_processor as _groq

logger = logging.getLogger("ai_provider")


# ─── Provider resolution ──────────────────────────────────────────────────────
def get_provider() -> str:
    p = (os.environ.get("AI_PROVIDER") or "").strip().lower()
    if p in ("gemini", "google", "google-ai"):
        return "gemini"
    if p == "groq":
        return "groq"
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return "gemini"
    return "groq"


def _gemini_key() -> str:
    return (os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or os.environ.get("GOOGLE_AI_STUDIO_API_KEY")
            or "").strip()


def _gemini_model() -> str:
    return (os.environ.get("GEMINI_VISION_MODEL") or "gemini-2.5-flash").strip()


# ─── Gemini vision (lazy import of httpx) ─────────────────────────────────────
async def _gemini_vision_single(image_b64: str, mime_type: str, prompt: str) -> str:
    import httpx
    key = _gemini_key()
    if not key:
        raise HTTPException(status_code=500,
                            detail="GEMINI_API_KEY is not configured on the server.")
    url = (f"https://generativelanguage.googleapis.com/v1beta/"
           f"models/{_gemini_model()}:generateContent")
    body = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": image_b64}},
            ],
        }],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(url, params={"key": key},
                                 headers={"Content-Type": "application/json"},
                                 json=body)
    if resp.status_code == 429:
        raise HTTPException(status_code=429,
                            detail="Gemini quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422,
                            detail=f"Gemini API error {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=422, detail="Gemini returned an empty response.")


async def _gemini_vision_multipage(page_images_b64: List[Tuple[str, str]],
                                   prompt: str) -> str:
    import httpx
    key = _gemini_key()
    if not key:
        raise HTTPException(status_code=500,
                            detail="GEMINI_API_KEY is not configured on the server.")
    url = (f"https://generativelanguage.googleapis.com/v1beta/"
           f"models/{_gemini_model()}:generateContent")
    parts: list = [{"text": prompt}]
    for img_b64, mime in page_images_b64:
        parts.append({"inline_data": {"mime_type": mime, "data": img_b64}})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, params={"key": key},
                                 headers={"Content-Type": "application/json"},
                                 json=body)
    if resp.status_code == 429:
        raise HTTPException(status_code=429,
                            detail="Gemini quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422,
                            detail=f"Gemini API error {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    try:
        rparts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in rparts if isinstance(p, dict))
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=422, detail="Gemini returned an empty response.")


# ─── Public provider-agnostic API ─────────────────────────────────────────────
async def vision_single(image_b64: str, mime_type: str, prompt: str) -> str:
    """OCR a single image with the configured provider, with cross-provider fallback."""
    provider = get_provider()
    if provider == "gemini":
        try:
            return await _gemini_vision_single(image_b64, mime_type, prompt)
        except HTTPException as e:
            if os.environ.get("GROQ_API_KEY") and e.status_code in (422, 429, 500):
                logger.info(f"[ai_provider] Gemini single failed ({e.status_code}), "
                            f"falling back to Groq.")
                return await _groq.groq_vision_single(image_b64, mime_type, prompt)
            raise
    return await _groq.groq_vision_single(image_b64, mime_type, prompt)


async def vision_multipage(page_images_b64: List[Tuple[str, str]], prompt: str) -> str:
    """
    Multi-page vision call. For Gemini this is a single request (no page cap).
    For Groq this is delegated to the batch processor so callers do not need
    to know about the 3-image limit.
    """
    provider = get_provider()
    if provider == "gemini":
        try:
            return await _gemini_vision_multipage(page_images_b64, prompt)
        except HTTPException as e:
            if os.environ.get("GROQ_API_KEY") and e.status_code in (422, 429, 500):
                logger.info(f"[ai_provider] Gemini multipage failed ({e.status_code}), "
                            f"falling back to Groq batch processor.")
                return await _groq.groq_batched_ocr(page_images_b64, prompt)
            raise
    return await _groq.groq_batched_ocr(page_images_b64, prompt)


async def ocr_pages(page_images_b64: List[Tuple[str, str]],
                    prompt: str,
                    progress_cb: Optional[Callable[[int, int], None]] = None
                    ) -> str:
    """
    Preferred entry point for scanned-PDF / multi-page OCR.
    Always merges results in original page order.
    """
    provider = get_provider()
    logger.info(f"[ai_provider] ocr_pages: provider={provider} pages={len(page_images_b64)}")
    if provider == "gemini":
        try:
            return await _gemini_vision_multipage(page_images_b64, prompt)
        except HTTPException as e:
            if os.environ.get("GROQ_API_KEY") and e.status_code in (422, 429, 500):
                logger.info(f"[ai_provider] Gemini ocr_pages failed ({e.status_code}), "
                            f"falling back to Groq batch processor.")
                return await _groq.groq_batched_ocr(page_images_b64, prompt, progress_cb)
            raise
    return await _groq.groq_batched_ocr(page_images_b64, prompt, progress_cb)
