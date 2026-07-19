"""
Groq Batch OCR Processor
========================

Handles Groq vision OCR for scanned PDFs by:
  • Splitting page images into batches of at most GROQ_MAX_IMAGES_PER_REQUEST (Groq hard cap = 3).
  • Running GROQ_MAX_PARALLEL_BATCHES batches concurrently.
  • Retrying a failed batch once, then falling back to per-page OCR.
  • Merging results strictly in original page order.
  • Releasing image memory after each batch to keep large PDFs bounded.
  • Logging pages, batches, retries and timings.

Public API (kept stable):
    await groq_vision_single(image_b64, mime_type, prompt) -> str
    await groq_vision_multipage(page_images_b64, prompt)   -> str   # raw <=3 call
    await groq_batched_ocr(page_images_b64, prompt, progress_cb=None) -> str

No business logic, parser, GST, ledger, accounting or API contract is touched.
"""

from __future__ import annotations

import os
import asyncio
import logging
import time
from typing import Callable, List, Optional, Tuple

import httpx
from fastapi import HTTPException

logger = logging.getLogger("groq_batch_processor")

# Groq's hard limit for images per chat/completions request
_GROQ_HARD_CAP = 3


# ─── Environment helpers ──────────────────────────────────────────────────────
def _batch_size() -> int:
    try:
        n = int(os.environ.get("GROQ_MAX_IMAGES_PER_REQUEST", "3"))
    except ValueError:
        n = 3
    return max(1, min(n, _GROQ_HARD_CAP))


def _parallel_batches() -> int:
    try:
        n = int(os.environ.get("GROQ_MAX_PARALLEL_BATCHES", "3"))
    except ValueError:
        n = 3
    return max(1, n)


def _groq_model() -> str:
    return os.environ.get(
        "GROQ_VISION_MODEL",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
    )


def _groq_key() -> str:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured on the server.",
        )
    return key


# ─── Low-level Groq HTTP calls ────────────────────────────────────────────────
async def groq_vision_single(image_b64: str, mime_type: str, prompt: str) -> str:
    """OCR one image via Groq (no retry, no batching)."""
    key = _groq_key()
    payload = {
        "model": _groq_model(),
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                {"type": "text", "text": prompt},
            ],
        }],
        "max_tokens": 2048,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code == 429:
        raise HTTPException(status_code=429,
                            detail="Groq quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422,
                            detail=f"Groq API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


async def groq_vision_multipage(page_images_b64: List[Tuple[str, str]], prompt: str) -> str:
    """OCR a small batch (<= GROQ hard cap) in a single Groq call."""
    if not page_images_b64:
        return ""
    if len(page_images_b64) > _GROQ_HARD_CAP:
        raise ValueError(
            f"groq_vision_multipage received {len(page_images_b64)} images; "
            f"Groq accepts at most {_GROQ_HARD_CAP}. Use groq_batched_ocr()."
        )
    key = _groq_key()
    content: list = []
    for img_b64, mime in page_images_b64:
        content.append({"type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{img_b64}"}})
    content.append({"type": "text", "text": prompt})

    payload = {
        "model": _groq_model(),
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 2048,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code == 429:
        raise HTTPException(status_code=429,
                            detail="Groq quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422,
                            detail=f"Groq API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


# ─── Batch orchestration ──────────────────────────────────────────────────────
async def _ocr_single_with_retry(page: Tuple[str, str], prompt: str,
                                 page_idx: int) -> str:
    """Fallback OCR for one page. Retries once."""
    img_b64, mime = page
    for attempt in (1, 2):
        try:
            t0 = time.time()
            text = await groq_vision_single(img_b64, mime, prompt)
            logger.info(f"[groq-batch] fallback page {page_idx} ok "
                        f"(attempt {attempt}) in {time.time()-t0:.2f}s")
            return text or ""
        except Exception as e:
            if attempt == 2:
                logger.warning(f"[groq-batch] fallback page {page_idx} "
                               f"failed after retry: {e}")
                return ""
            logger.info(f"[groq-batch] fallback page {page_idx} retry: {e}")
            await asyncio.sleep(0.4)
    return ""


async def _ocr_batch_with_retry_and_split(batch: List[Tuple[str, str]],
                                          prompt: str,
                                          batch_idx: int,
                                          total_batches: int,
                                          page_offset: int) -> str:
    """OCR one batch. Retry once, then fall back to per-page OCR."""
    if not batch:
        return ""
    for attempt in (1, 2):
        try:
            t0 = time.time()
            text = await groq_vision_multipage(batch, prompt)
            logger.info(f"[groq-batch] batch {batch_idx+1}/{total_batches} "
                        f"({len(batch)} pages) ok in {time.time()-t0:.2f}s "
                        f"(attempt {attempt})")
            return text or ""
        except Exception as e:
            if attempt == 1:
                logger.warning(f"[groq-batch] batch {batch_idx+1}/{total_batches} "
                               f"attempt 1 failed, retrying: {e}")
                await asyncio.sleep(0.6)
                continue
            logger.warning(f"[groq-batch] batch {batch_idx+1}/{total_batches} "
                           f"retry failed, splitting into single-page OCR: {e}")

    # Per-page fallback (preserves order within the batch)
    per_page: List[str] = []
    for i, page in enumerate(batch):
        per_page.append(await _ocr_single_with_retry(
            page, prompt, page_idx=page_offset + i + 1))
    return "\n".join(t for t in per_page if t)


async def groq_batched_ocr(page_images_b64: List[Tuple[str, str]],
                           prompt: str,
                           progress_cb: Optional[Callable[[int, int], None]] = None
                           ) -> str:
    """
    Main entry point. Splits pages into <= GROQ_MAX_IMAGES_PER_REQUEST batches,
    runs GROQ_MAX_PARALLEL_BATCHES concurrently, retries + splits on failure,
    merges strictly in original page order, releases memory per-batch.
    """
    bsize = _batch_size()
    pcount = _parallel_batches()

    # Build batches with the ORIGINAL page index for each page so we can
    # release memory in the source list after processing.
    batches: List[List[Tuple[str, str]]] = [
        page_images_b64[i:i + bsize]
        for i in range(0, len(page_images_b64), bsize)
    ]
    total = len(batches)
    results: List[Optional[str]] = [None] * total

    logger.info(
        f"[groq-batch] start: pages={len(page_images_b64)} "
        f"batches={total} batch_size={bsize} parallel={pcount}"
    )
    t_start = time.time()

    sem = asyncio.Semaphore(pcount)
    done = {"n": 0}
    lock = asyncio.Lock()

    async def _run(idx: int, batch: List[Tuple[str, str]]):
        async with sem:
            page_offset = idx * bsize
            text = await _ocr_batch_with_retry_and_split(
                batch, prompt, idx, total, page_offset)
            # Release b64 payloads for this batch immediately
            batch.clear()
            results[idx] = text or ""
            async with lock:
                done["n"] += 1
                if progress_cb:
                    try:
                        progress_cb(done["n"], total)
                    except Exception:
                        pass

    await asyncio.gather(*[_run(i, b) for i, b in enumerate(batches)])

    # Also release the caller's list references so PIL/base64 buffers can GC
    page_images_b64.clear()

    logger.info(
        f"[groq-batch] done: batches={total} "
        f"elapsed={time.time()-t_start:.2f}s"
    )
    # Merge in original page order
    return "\n\n".join(r for r in results if r)
