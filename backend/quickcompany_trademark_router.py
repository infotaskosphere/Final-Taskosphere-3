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
  GET  /api/trademark-qc/searches/{id}/pdf       -> download report as PDF (supports branding query params)
  POST /api/trademark-qc/branding-preference     -> save user's default branding company
  GET  /api/trademark-qc/branding-preference     -> get user's saved branding preference

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

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

# Import the QC trademark modules (placed in same backend/ folder)
from backend.scraper import search_trademarks
from backend.report_engine import build_report
from backend.pdf_renderer import build_report_pdf
from backend.class_finder import find_classes

# Auth — reuse Taskosphere's existing dependency
try:
    from backend.dependencies import get_current_user
    from backend.models import User
    _auth_available = True
except ImportError:
    _auth_available = False
    get_current_user = None
    User = None

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
    # Branding fields saved with the report for consistent PDF re-generation
    footer: Optional[str] = Field(None, max_length=500)
    tagline: Optional[str] = Field(None, max_length=200)
    watermark: Optional[str] = Field(None, max_length=100)
    custom_watermark: Optional[str] = Field(None, max_length=100)


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


class BrandingPreference(BaseModel):
    """Saved default branding settings for the user."""
    default_company_id:   Optional[str] = None
    default_company_name: Optional[str] = None
    footer:    str = ""
    tagline:   str = ""
    watermark: str = ""


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


async def _save_report(report: dict, branding: dict | None = None) -> str:
    report_id = str(uuid.uuid4())
    # Embed branding into the report dict so it survives re-render without query params
    if branding:
        report = {
            **report,
            "footer_text":     branding.get("footer", ""),
            "tagline":         branding.get("tagline", "Trademark Availability Report"),
            "watermark":       branding.get("watermark", ""),
            "custom_watermark":branding.get("custom_watermark", ""),
        }
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


def _get_current_user_id(request=None) -> Optional[str]:
    """Safely extract user id from request state (set by auth middleware)."""
    try:
        return getattr(request.state, "user_id", None)
    except Exception:
        return None


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
    branding = {
        "footer":          payload.footer or "",
        "tagline":         payload.tagline or "Trademark Availability Report",
        "watermark":       payload.watermark or "",
        "custom_watermark":payload.custom_watermark or "",
    }
    report_id = await _save_report(report, branding=branding)
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


@router.delete("/searches/{report_id}")
async def delete_report(report_id: str):
    """Delete a stored report from history."""
    result = await db.qc_trademark_reports.delete_one({"id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "deleted", "id": report_id}


@router.get("/searches/{report_id}/pdf")
async def download_report_pdf(
    report_id: str,
    footer:    Optional[str] = Query(None, max_length=500,
                                     description="Override footer text for this PDF"),
    tagline:   Optional[str] = Query(None, max_length=200,
                                     description="Override header tagline for this PDF"),
    watermark: Optional[str] = Query(None, max_length=100,
                                     description="Watermark text to stamp on every page"),
    has_logo:  Optional[str] = Query(None,
                                     description="Pass '1' if caller is providing branding context"),
):
    """
    Download a report as PDF.

    Branding query params (all optional):
      - footer:    Override the report footer line
      - tagline:   Override the header tagline (below logo)
      - watermark: Stamp text across each page
      - has_logo:  Informational flag; logo data is already embedded in the stored report

    These params let the frontend pass the current branding settings so that
    ANY previously stored report can be re-generated with updated branding —
    without re-running the scrape.
    """
    doc = await db.qc_trademark_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    # Merge branding overrides into the doc before rendering PDF
    if footer or tagline or watermark:
        # Map to the field names pdf_renderer.py reads from the report dict
        if "report" in doc:
            doc["report"] = {
                **doc["report"],
                "footer_text": footer or doc["report"].get("footer_text", ""),
                "tagline":     tagline or doc["report"].get("tagline", "Trademark Availability Report"),
                "watermark":   watermark or doc["report"].get("watermark", ""),
            }

    pdf_bytes = build_report_pdf(doc)
    safe_query = "".join(c if c.isalnum() else "_" for c in (doc.get("query") or "report"))[:48]
    filename = f"trademark_report_{safe_query}_{report_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


class PdfRenderRequest(BaseModel):
    """Body for the POST PDF endpoint - lets caller supply full branding including logo."""
    logo_data_url:    Optional[str] = Field(None, max_length=500_000)
    footer:           Optional[str] = Field(None, max_length=500)
    tagline:          Optional[str] = Field(None, max_length=200)
    watermark:        Optional[str] = Field(None, max_length=100)
    custom_watermark: Optional[str] = Field(None, max_length=100)


@router.post("/searches/{report_id}/pdf")
async def download_report_pdf_post(
    report_id: str,
    payload:   PdfRenderRequest,
):
    """
    POST variant of the PDF download endpoint.

    Accepts a JSON body with optional branding overrides including logo_data_url
    (a data: URI string, e.g. data:image/png;base64,...).  This is the recommended
    endpoint when the caller wants to inject a company logo into the PDF header,
    because logo data is too large to fit in a query-string parameter.

    The logo supplied here takes priority over any logo stored with the report.
    """
    doc = await db.qc_trademark_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    if "report" not in doc:
        doc["report"] = {}

    # Resolve effective watermark (CUSTOM -> custom_watermark text)
    wm = payload.watermark or ""
    if wm == "CUSTOM":
        wm = payload.custom_watermark or ""

    # Merge caller-supplied branding into the stored report dict
    doc["report"] = {
        **doc["report"],
        # Logo: caller value wins; fall back to whatever was stored at creation time
        "logo_data_url": payload.logo_data_url or doc["report"].get("logo_data_url"),
        "footer_text":   payload.footer   or doc["report"].get("footer_text", ""),
        "tagline":       payload.tagline  or doc["report"].get("tagline", "Trademark Availability Report"),
        "watermark":     wm               or doc["report"].get("watermark", ""),
        "custom_watermark": payload.custom_watermark or doc["report"].get("custom_watermark", ""),
    }

    pdf_bytes = build_report_pdf(doc)
    safe_query = "".join(c if c.isalnum() else "_" for c in (doc.get("query") or "report"))[:48]
    filename = f"trademark_report_{safe_query}_{report_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ---------- Branding Preference (per-user, cross-device sync) ----------

@router.post("/branding-preference")
async def save_branding_preference(payload: BrandingPreference):
    """
    Persist a user's default trademark reporting company + branding settings.
    Uses a dedicated `qc_branding_preferences` collection keyed by user_id.
    If auth is not wired to this router yet, falls back to a single global record.

    Frontend should call this after the user clicks "Set Default" in BrandingPanel.
    """
    # Try to get user id from JWT if auth dependency is available
    # For now we use a global key — caller can extend with Depends(get_current_user)
    doc_key = "global"   # replace with user.id once auth is wired

    await db.qc_branding_preferences.update_one(
        {"user_key": doc_key},
        {"$set": {
            "user_key":            doc_key,
            "default_company_id":  payload.default_company_id,
            "default_company_name":payload.default_company_name,
            "footer":              payload.footer,
            "tagline":             payload.tagline,
            "watermark":           payload.watermark,
            "updated_at":          datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"status": "saved", "default_company_id": payload.default_company_id}


@router.get("/branding-preference")
async def get_branding_preference():
    """
    Retrieve saved branding preference.
    Used on page load to restore the user's default company without localStorage.
    """
    doc_key = "global"
    doc = await db.qc_branding_preferences.find_one({"user_key": doc_key}, {"_id": 0})
    if not doc:
        return BrandingPreference()
    return BrandingPreference(
        default_company_id=doc.get("default_company_id"),
        default_company_name=doc.get("default_company_name"),
        footer=doc.get("footer", ""),
        tagline=doc.get("tagline", ""),
        watermark=doc.get("watermark", ""),
    )
