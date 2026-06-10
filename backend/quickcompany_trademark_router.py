"""
backend/quickcompany_trademark_router.py
----------------------------------------
All /api/trademark-qc/* endpoints.

Mounted in server.py as:
    app.include_router(qc_trademark_router, prefix="/api/trademark-qc")

Data source: QuickCompany (https://www.quickcompany.in/trademarks) exclusively.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.class_finder import find_classes
from backend.dependencies import db, get_current_user
from backend.models import User
from backend.report_engine import build_report
from backend.trademark_bulk import (
    build_bulk_docx,
    build_bulk_dossier_pdf,
    build_bulk_xlsx,
    compute_portfolio_analytics,
    run_bulk_searches,
    validate_branding,
)
from backend.trademark_sphere import (
    _qc_search_app_number,
    _qc_sess,
    QC_SEARCH,
    scrape_trademark,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request/Response models ───────────────────────────────────────────────────

class ReportRequest(BaseModel):
    name:            str
    class_filter:    Optional[int] = None
    device_only:     bool          = False
    logo_data_url:   Optional[str] = Field(None, max_length=500_000)
    footer:          Optional[str] = Field(None, max_length=500)
    tagline:         Optional[str] = Field(None, max_length=200)
    watermark:       Optional[str] = Field(None, max_length=100)
    custom_watermark: Optional[str] = Field(None, max_length=100)
    prepared_by:     Optional[str] = Field(None, max_length=200)
    disclaimer:      Optional[str] = Field(None, max_length=2000)
    company_name:    Optional[str] = Field(None, max_length=200)
    client_name:     Optional[str] = Field(None, max_length=200)
    client_mobile:   Optional[str] = Field(None, max_length=40)
    report_date:     Optional[str] = Field(None, max_length=40)


class BulkReportRequest(BaseModel):
    names:            List[str]     = Field(..., min_length=1, max_length=50)
    class_filter:     Optional[int] = Field(None, ge=1, le=45)
    device_only:      bool          = False
    logo_data_url:    Optional[str] = Field(None, max_length=500_000)
    footer:           Optional[str] = Field(None, max_length=500)
    tagline:          Optional[str] = Field(None, max_length=200)
    watermark:        Optional[str] = Field(None, max_length=100)
    custom_watermark: Optional[str] = Field(None, max_length=100)
    prepared_by:      Optional[str] = Field(None, max_length=200)
    disclaimer:       Optional[str] = Field(None, max_length=2000)
    company_name:     Optional[str] = Field(None, max_length=200)
    client_name:      Optional[str] = Field(None, max_length=200)
    client_mobile:    Optional[str] = Field(None, max_length=40)
    report_date:      Optional[str] = Field(None, max_length=40)
    enable_monitoring: bool         = False


class ClassFinderRequest(BaseModel):
    description: str
    top:         int = Field(5, ge=1, le=45)


class BrandingPreferenceBody(BaseModel):
    default_company_id:   Optional[str] = None
    default_company_name: Optional[str] = None
    footer:    Optional[str] = ""
    tagline:   Optional[str] = ""
    watermark: Optional[str] = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _branding_dict(p) -> dict:
    return {
        "logo_data_url":    getattr(p, "logo_data_url", None),
        "footer":           getattr(p, "footer", None)   or "",
        "tagline":          getattr(p, "tagline", None)  or "Trademark Availability Report",
        "watermark":        getattr(p, "watermark", None) or "",
        "custom_watermark": getattr(p, "custom_watermark", None) or "",
        "prepared_by":      getattr(p, "prepared_by", None) or "",
        "disclaimer":       getattr(p, "disclaimer", None) or "",
        "company_name":     getattr(p, "company_name", None) or "",
        "client_name":      getattr(p, "client_name", None) or "",
        "client_mobile":    getattr(p, "client_mobile", None) or "",
        "report_date":      getattr(p, "report_date", None) or "",
    }


async def _do_search(name: str, class_filter: Optional[int] = None) -> dict:
    """
    Search QuickCompany (https://www.quickcompany.in/trademarks) for `name`
    and return a normalised scraped results dict for report_engine.build_report().
    """
    import asyncio, re, time
    from bs4 import BeautifulSoup
    from concurrent.futures import ThreadPoolExecutor

    def _scrape_sync():
        sess   = _qc_sess()
        params = {"q": name.strip()}
        if class_filter:
            params["class"] = str(class_filter)
        try:
            r = sess.get(QC_SEARCH, params=params, timeout=25)
            r.raise_for_status()
        except Exception as e:
            logger.warning(f"QC search failed for '{name}': {e}")
            return {"results": [], "source": "quickcompany", "total_estimated": 0}

        soup    = BeautifulSoup(r.text, "lxml")
        results = []
        seen    = set()

        for a in soup.find_all("a", href=True):
            m = re.search(r"/trademarks/(\d{5,})(?:[-/]|$)", a["href"])
            if not m:
                continue
            app_no = m.group(1)
            if app_no in seen:
                continue
            seen.add(app_no)
            try:
                from backend.trademark_sphere import _qc_fetch_by_app_number
                data = _qc_fetch_by_app_number(app_no)
                results.append(data)
            except Exception:
                pass
            if len(results) >= 30:
                break

        return {
            "results":         results,
            "source":          "quickcompany",
            "total_estimated": len(results),
        }

    loop = asyncio.get_event_loop()
    pool = __import__("concurrent.futures", fromlist=["ThreadPoolExecutor"]).ThreadPoolExecutor(max_workers=4)
    return await loop.run_in_executor(pool, _scrape_sync)


async def _save_report(report: dict, branding: dict = None) -> str:
    """Persist a report to MongoDB and return its id."""
    rid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.trademark_qc_reports.insert_one({
        "_id":       rid,
        "id":        rid,
        "report":    report,
        "branding":  branding or {},
        "created_at": now,
        "updated_at": now,
        "name":      report.get("query", ""),
    })
    return rid


async def _scrape_and_report(
    name: str,
    class_filter: Optional[int] = None,
    device_only: bool = False,
) -> dict:
    """Run QC search for `name` and build a full availability report."""
    scraped = await _do_search(name, class_filter)
    report  = build_report(name, scraped, class_filter=class_filter)
    return report


# ── Core routes ───────────────────────────────────────────────────────────────

@router.post("/report")
async def generate_report(
    payload: ReportRequest,
    user: User = Depends(get_current_user),
):
    """
    Generate a trademark availability report by searching
    https://www.quickcompany.in/trademarks for the given brand name.
    """
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(400, "Brand name is required.")

    report   = await _scrape_and_report(name, payload.class_filter, payload.device_only)
    branding = _branding_dict(payload)
    rid      = await _save_report(report, branding)
    return {"id": rid, "report": report}


@router.get("/searches")
async def list_searches(
    limit: int = Query(25, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """Return recent trademark search reports."""
    cursor = db.trademark_qc_reports.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items, "count": len(items)}


@router.get("/searches/{report_id}")
async def get_search(
    report_id: str,
    user: User = Depends(get_current_user),
):
    """Fetch a single saved trademark report by id."""
    doc = await db.trademark_qc_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"Report {report_id} not found.")
    return doc


@router.delete("/searches/{report_id}")
async def delete_search(
    report_id: str,
    user: User = Depends(get_current_user),
):
    """Delete a saved trademark report."""
    result = await db.trademark_qc_reports.delete_one({"id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(404, f"Report {report_id} not found.")
    return {"deleted": report_id}


class RebrandPdfRequest(BaseModel):
    logo_data_url:    Optional[str] = Field(None, max_length=500_000)
    footer:           Optional[str] = Field(None, max_length=500)
    tagline:          Optional[str] = Field(None, max_length=200)
    watermark:        Optional[str] = Field(None, max_length=100)
    custom_watermark: Optional[str] = Field(None, max_length=100)
    client_name:      Optional[str] = Field(None, max_length=200)
    client_mobile:    Optional[str] = Field(None, max_length=40)
    report_date:      Optional[str] = Field(None, max_length=40)


def _build_single_pdf(doc: dict, branding_overrides: dict) -> bytes:
    """Merge stored branding with any overrides, then render a single-report PDF."""
    from backend.pdf_renderer import build_report_pdf

    stored_branding = dict(doc.get("branding") or {})
    merged = {**stored_branding, **{k: v for k, v in branding_overrides.items() if v is not None}}

    # Inject merged branding fields into the report dict so build_report_pdf can read them
    report = dict(doc.get("report") or {})
    report.setdefault("logo_data_url",    merged.get("logo_data_url"))
    report.setdefault("footer_text",      merged.get("footer") or merged.get("footer_text") or "")
    report.setdefault("tagline",          merged.get("tagline") or "Trademark Availability Report")
    report.setdefault("watermark",        merged.get("watermark") or "")
    report.setdefault("custom_watermark", merged.get("custom_watermark") or "")
    report.setdefault("client_name",      merged.get("client_name") or "")
    report.setdefault("client_mobile",    merged.get("client_mobile") or "")
    report.setdefault("report_date",      merged.get("report_date") or "")

    # Override — always use latest values
    if merged.get("logo_data_url"):    report["logo_data_url"]    = merged["logo_data_url"]
    if merged.get("footer"):           report["footer_text"]       = merged["footer"]
    if merged.get("tagline"):          report["tagline"]           = merged["tagline"]
    if merged.get("watermark"):        report["watermark"]         = merged["watermark"]
    if merged.get("custom_watermark"): report["custom_watermark"]  = merged["custom_watermark"]
    if merged.get("client_name"):      report["client_name"]       = merged["client_name"]
    if merged.get("client_mobile"):    report["client_mobile"]     = merged["client_mobile"]
    if merged.get("report_date"):      report["report_date"]       = merged["report_date"]

    doc_record = {**doc, "report": report}
    return build_report_pdf(doc_record)


@router.get("/searches/{report_id}/pdf")
async def get_report_pdf(
    report_id: str,
    footer:    Optional[str] = Query(None),
    tagline:   Optional[str] = Query(None),
    watermark: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
):
    """Download a single-report PDF (GET — no logo override, branding from stored doc)."""
    doc = await db.trademark_qc_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"Report {report_id} not found.")

    overrides = {
        "footer":    footer,
        "tagline":   tagline,
        "watermark": watermark,
    }
    try:
        pdf_bytes = _build_single_pdf(doc, overrides)
    except Exception as e:
        logger.exception("PDF generation failed for %s", report_id)
        raise HTTPException(500, f"PDF generation failed: {e}")

    name = (doc.get("name") or "trademark").replace(" ", "_")[:40]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}_report.pdf"'},
    )


@router.post("/searches/{report_id}/pdf")
async def post_report_pdf(
    report_id: str,
    body: RebrandPdfRequest,
    user: User = Depends(get_current_user),
):
    """Download a single-report PDF with full branding override (POST — supports logo data URL)."""
    doc = await db.trademark_qc_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"Report {report_id} not found.")

    overrides = {
        "logo_data_url":    body.logo_data_url,
        "footer":           body.footer,
        "tagline":          body.tagline,
        "watermark":        body.watermark,
        "custom_watermark": body.custom_watermark,
        "client_name":      body.client_name,
        "client_mobile":    body.client_mobile,
        "report_date":      body.report_date,
    }
    try:
        pdf_bytes = _build_single_pdf(doc, overrides)
    except Exception as e:
        logger.exception("PDF generation failed for %s", report_id)
        raise HTTPException(500, f"PDF generation failed: {e}")

    name = (doc.get("name") or "trademark").replace(" ", "_")[:40]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}_report.pdf"'},
    )


@router.get("/check")
async def quick_check(
    name:  str             = Query(...),
    cls:   Optional[int]   = Query(None, alias="class"),
    user: User = Depends(get_current_user),
):
    """Quick availability check — returns verdict + risk score only."""
    scraped = await _do_search(name.strip(), cls)
    report  = build_report(name.strip(), scraped, class_filter=cls)
    return {
        "name":           name,
        "overall_status": report.get("overall_status"),
        "risk_score":     report.get("risk_score"),
        "conflict_count": report.get("conflict_count", 0),
    }


@router.post("/class-finder")
async def class_finder(
    body: ClassFinderRequest,
    user: User = Depends(get_current_user),
):
    """Suggest Nice classification classes for a goods/services description."""
    classes = find_classes(body.description, top=body.top)
    return {"classes": classes}


# ── Branding preference (per-user persistence) ────────────────────────────────

@router.get("/branding-preference")
async def get_branding_preference(user: User = Depends(get_current_user)):
    doc = await db.trademark_qc_branding.find_one({"user_id": user.id}, {"_id": 0})
    if not doc:
        return {}
    return doc


@router.post("/branding-preference")
async def save_branding_preference(
    body: BrandingPreferenceBody,
    user: User = Depends(get_current_user),
):
    await db.trademark_qc_branding.update_one(
        {"user_id": user.id},
        {"$set": {
            "user_id":              user.id,
            "default_company_id":   body.default_company_id,
            "default_company_name": body.default_company_name,
            "footer":               body.footer    or "",
            "tagline":              body.tagline   or "",
            "watermark":            body.watermark or "",
            "updated_at":           datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"saved": True}


# ── Bulk routes ───────────────────────────────────────────────────────────────

@router.post("/bulk")
async def bulk_reports(
    payload: BulkReportRequest,
    user: User = Depends(get_current_user),
):
    """
    Generate availability reports for multiple brand names concurrently.
    All searches use https://www.quickcompany.in/trademarks as the data source.
    """
    seen:  set  = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if not s or s.lower() in seen or len(s) > 128:
            continue
        seen.add(s.lower())
        names.append(s)
    if not names:
        raise HTTPException(400, "No valid names provided.")

    branding = _branding_dict(payload)

    async def _scrape(name, class_filter, device_only):
        return await _scrape_and_report(name, class_filter, device_only=device_only)

    items = await run_bulk_searches(
        names,
        class_filter=payload.class_filter,
        device_only=payload.device_only,
        scrape_fn=_scrape,
        max_parallel=5,
        enable_monitoring=payload.enable_monitoring,
    )

    for it in items:
        if it.get("error") or not it.get("report"):
            continue
        rid = await _save_report(it["report"], branding=branding)
        it["id"]           = rid
        it["total_results"] = (
            (it["report"].get("summary_counts") or {}).get("total_results") or 0
        )

    analytics = compute_portfolio_analytics(items)
    return {"items": items, "count": len(items), "analytics": analytics}


@router.post("/bulk/export")
async def bulk_export(
    payload: BulkReportRequest,
    format: str = Query("pdf", pattern="^(pdf|docx|xlsx)$"),
    user: User = Depends(get_current_user),
):
    """
    Run bulk search and return a single combined file (PDF / DOCX / XLSX).
    Data source: https://www.quickcompany.in/trademarks
    """
    branding = _branding_dict(payload)
    issues   = validate_branding(branding)
    if issues:
        raise HTTPException(400, "Branding incomplete: " + "; ".join(issues))

    seen:  set  = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if not s or s.lower() in seen or len(s) > 128:
            continue
        seen.add(s.lower())
        names.append(s)
    if not names:
        raise HTTPException(400, "No valid names provided.")

    async def _scrape(name, class_filter, device_only):
        return await _scrape_and_report(name, class_filter, device_only=device_only)

    items = await run_bulk_searches(
        names,
        class_filter=payload.class_filter,
        device_only=payload.device_only,
        scrape_fn=_scrape,
        max_parallel=5,
        enable_monitoring=payload.enable_monitoring,
    )

    successful = [it for it in items if not it.get("error") and it.get("report")]
    if not successful:
        raise HTTPException(502, "All trademark searches failed — nothing to render.")

    for it in successful:
        try:
            rid = await _save_report(it["report"], branding=branding)
            it["id"] = rid
        except Exception:
            logger.exception("save_report failed for %s", it.get("name"))

    analytics = compute_portfolio_analytics(items)
    today     = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if format == "pdf":
        data  = build_bulk_dossier_pdf(items, branding, analytics)
        media = "application/pdf"
        fname = f"bulk_trademark_report_{today}.pdf"
    elif format == "docx":
        data  = build_bulk_docx(items, branding, analytics)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fname = f"bulk_trademark_report_{today}.docx"
    else:
        data  = build_bulk_xlsx(items, branding, analytics)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fname = f"bulk_trademark_report_{today}.xlsx"

    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
