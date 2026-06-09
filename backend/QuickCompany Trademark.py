"""
QuickCompany Trademark Availability API — Taskosphere Integration Router.

This file is a self-contained FastAPI router. Drop it in your `backend/` folder
and wire it into server.py with two lines (see instructions below).

Endpoints (all prefixed with /api/trademark-qc):
  GET  /api/trademark-qc/health                  -> health check
  GET  /api/trademark-qc/check                   -> quick check (?name=...&class=...)
  POST /api/trademark-qc/report                  -> full report (saves to history)
  POST /api/trademark-qc/bulk                    -> bulk reports for multiple names
  POST /api/trademark-qc/class-finder            -> suggest trademark classes
  GET  /api/trademark-qc/searches                -> recent search history
  GET  /api/trademark-qc/searches/{id}           -> fetch a stored report by id
  GET  /api/trademark-qc/searches/{id}/pdf       -> download report as PDF

HOW TO WIRE INTO server.py (add ONLY these two lines):
  1. Near top with other imports:
       from backend.quickcompany_trademark_router import router as qc_trademark_router
  2. After other app.include_router() calls:
       app.include_router(qc_trademark_router)
"""
from __future__ import annotations

import os
import asyncio
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

# Import the QC trademark modules (placed in same backend/ folder)
from backend.scraper import search_trademarks
from backend.report_engine import build_report
from backend.pdf_renderer import build_report_pdf
from backend.class_finder import find_classes

logger = logging.getLogger("qc-trademark-router")

# ---------- DB connection (reuses the same MONGO_URL env var as server.py) ----------
_mongo_url = os.environ.get("MONGO_URL", "")
_db_name = os.environ.get("DB_NAME", "taskosphere")
_mongo_client = AsyncIOMotorClient(_mongo_url)
db = _mongo_client[_db_name]

router = APIRouter(prefix="/api/trademark-qc", tags=["Trademark QC"])


# ---------- Pydantic Models ----------
class ReportRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    class_filter: Optional[int] = Field(None, ge=1, le=45)
    device_only: bool = False
    logo_data_url: Optional[str] = Field(None, max_length=500_000)


class BulkReportRequest(BaseModel):
    names: List[str] = Field(..., min_length=1, max_length=20)
    class_filter: Optional[int] = Field(None, ge=1, le=45)
    device_only: bool = False


class ClassFinderRequest(BaseModel):
    description: str = Field(..., min_length=3, max_length=2000)
    top: int = Field(5, ge=1, le=10)


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    query: str
    overall_status: str
    risk_score: int
    total_results: int
    class_filter: Optional[int] = None
    created_at: str


# ---------- Internal helpers ----------
async def _scrape_and_report(
    name: str,
    class_filter: Optional[int],
    device_only: bool = False,
    logo_data_url: Optional[str] = None,
) -> dict:
    try:
        scraped = await search_trademarks(name)
    except Exception as e:
        logger.exception("scrape failed for %s", name)
        raise HTTPException(status_code=502,
                            detail=f"Failed to fetch trademark data: {e.__class__.__name__}")

    if device_only:
        device_kw = ("device", "logo", "label", "composite")
        scraped = {
            **scraped,
            "results": [
                r for r in (scraped.get("results") or [])
                if any(k in (r.get("mark_type") or "").lower() for k in device_kw)
                or any(k in (r.get("name") or "").lower() for k in ("device", "label"))
            ],
        }

    report = build_report(name, scraped, class_filter=class_filter)
    report["device_only"] = device_only
    if logo_data_url:
        report["logo_data_url"] = logo_data_url
    return report


async def _save_report(report: dict) -> str:
    report_id = str(uuid.uuid4())
    doc = {
        "id": report_id,
        "query": report["query"],
        "overall_status": report["overall_status"],
        "risk_score": report["risk_score"],
        "class_filter": report.get("class_filter"),
        "total_results": report["summary_counts"]["total_results"],
        "headline": report["headline"],
        "report": report,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.qc_trademark_reports.insert_one(doc)
    return report_id


# ---------- Routes ----------
@router.get("/health")
async def health():
    return {"service": "qc-trademark-router", "status": "ok"}


@router.get("/check")
async def quick_check(
    name: str = Query(..., min_length=1, max_length=128),
    class_filter: Optional[int] = Query(None, ge=1, le=45, alias="class"),
    device_only: bool = Query(False),
    save: bool = Query(False),
):
    """CORS-open GET endpoint — embeddable in any web app."""
    report = await _scrape_and_report(name, class_filter, device_only=device_only)
    saved_id = None
    if save:
        saved_id = await _save_report(report)
    return JSONResponse({**report, "saved_id": saved_id})


@router.post("/report")
async def create_report(payload: ReportRequest):
    """Generate full report and store it in history."""
    report = await _scrape_and_report(
        payload.name, payload.class_filter,
        device_only=payload.device_only,
        logo_data_url=payload.logo_data_url,
    )
    report_id = await _save_report(report)
    return {"id": report_id, "report": report}


@router.post("/class-finder")
async def class_finder(payload: ClassFinderRequest):
    """Suggest Nice classification classes from a free-text description."""
    suggestions = find_classes(payload.description, top=payload.top)
    return {"description": payload.description, "suggestions": suggestions}


@router.post("/bulk")
async def bulk_reports(payload: BulkReportRequest):
    """Generate reports for multiple names concurrently."""
    seen = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if not s or s.lower() in seen or len(s) > 128:
            continue
        seen.add(s.lower())
        names.append(s)

    if not names:
        raise HTTPException(status_code=400, detail="No valid names provided")

    async def _process(n: str) -> dict:
        try:
            report = await _scrape_and_report(n, payload.class_filter, device_only=payload.device_only)
            rid = await _save_report(report)
            return {
                "name": n,
                "id": rid,
                "overall_status": report["overall_status"],
                "risk_score": report["risk_score"],
                "total_results": report["summary_counts"]["total_results"],
                "headline": report["headline"],
                "error": None,
            }
        except HTTPException as e:
            return {"name": n, "error": e.detail}
        except Exception as e:
            logger.exception("bulk item failed: %s", n)
            return {"name": n, "error": str(e)}

    sem = asyncio.Semaphore(5)

    async def _bound(n: str):
        async with sem:
            return await _process(n)

    items = await asyncio.gather(*[_bound(n) for n in names])
    return {"items": items, "count": len(items)}


@router.get("/searches", response_model=List[HistoryItem])
async def list_history(limit: int = Query(25, ge=1, le=100)):
    cursor = db.qc_trademark_reports.find(
        {},
        {"_id": 0, "id": 1, "query": 1, "overall_status": 1, "risk_score": 1,
         "total_results": 1, "class_filter": 1, "created_at": 1},
    ).sort("created_at", -1).limit(limit)
    return [HistoryItem(**doc) async for doc in cursor]


@router.get("/searches/{report_id}")
async def get_report(report_id: str):
    doc = await db.qc_trademark_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")
    return doc


@router.get("/searches/{report_id}/pdf")
async def download_report_pdf(report_id: str):
    doc = await db.qc_trademark_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")
    pdf_bytes = build_report_pdf(doc)
    safe_query = "".join(c if c.isalnum() else "_" for c in (doc.get("query") or "report"))[:48]
    filename = f"trademark_report_{safe_query}_{report_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
