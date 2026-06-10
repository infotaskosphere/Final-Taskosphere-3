import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger(__name__)

from backend.trademark_bulk import (

    build_bulk_docx,
    build_bulk_dossier_pdf,
    build_bulk_xlsx,
    compute_portfolio_analytics,
    run_bulk_searches,
    validate_branding,
)

class BulkReportRequest(BaseModel):
    names: List[str] = Field(..., min_length=1, max_length=50)
    class_filter: Optional[int] = Field(None, ge=1, le=45)
    device_only: bool = False
    # Branding (matches the single-report POST shape).
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
    enable_monitoring: bool = False


def _branding_dict(p: "BulkReportRequest") -> dict:
    return {
        "logo_data_url":    p.logo_data_url,
        "footer":           p.footer or "",
        "tagline":          p.tagline or "Trademark Availability Report",
        "watermark":        p.watermark or "",
        "custom_watermark": p.custom_watermark or "",
        "prepared_by":      p.prepared_by or "",
        "disclaimer":       p.disclaimer or "",
        "company_name":     p.company_name or "",
        "client_name":      p.client_name or "",
        "client_mobile":    p.client_mobile or "",
        "report_date":      p.report_date or "",
    }


@router.post("/bulk")
async def bulk_reports(payload: BulkReportRequest):
    """Generate reports for multiple names concurrently with analytics."""
    seen: set[str] = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if not s or s.lower() in seen or len(s) > 128:
            continue
        seen.add(s.lower())
        names.append(s)
    if not names:
        raise HTTPException(status_code=400, detail="No valid names provided")

    branding = _branding_dict(payload)

    async def _scrape(name, class_filter, device_only):
        # Reuses the existing helper so the report shape stays identical.
        return await _scrape_and_report(name, class_filter, device_only=device_only)

    items = await run_bulk_searches(
        names,
        class_filter=payload.class_filter,
        device_only=payload.device_only,
        scrape_fn=_scrape,
        max_parallel=5,
        enable_monitoring=payload.enable_monitoring,
    )

    # Persist each successful report with branding embedded — keeps
    # /searches/{id}/pdf identical to the bulk dossier render.
    for it in items:
        if it.get("error") or not it.get("report"):
            continue
        rid = await _save_report(it["report"], branding=branding)
        it["id"] = rid
        it["total_results"] = ((it["report"].get("summary_counts") or {}).get("total_results") or 0)

    analytics = compute_portfolio_analytics(items)
    return {"items": items, "count": len(items), "analytics": analytics}


@router.post("/bulk/export")
async def bulk_export(
    payload: BulkReportRequest,
    format: str = Query("pdf", pattern="^(pdf|docx|xlsx)$"),
):
    """
    Run the bulk search and return a SINGLE combined file with the executive
    summary cover + a complete per-mark dossier (identical to individual
    Trademark Reports).

    Branding validation: tagline + footer must be present (logo recommended).
    """
    branding = _branding_dict(payload)
    issues = validate_branding(branding)
    if issues:
        raise HTTPException(
            status_code=400,
            detail="Branding incomplete: " + "; ".join(issues),
        )

    seen: set[str] = set()
    names: List[str] = []
    for n in payload.names:
        s = (n or "").strip()
        if not s or s.lower() in seen or len(s) > 128:
            continue
        seen.add(s.lower())
        names.append(s)
    if not names:
        raise HTTPException(status_code=400, detail="No valid names provided")

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
        raise HTTPException(status_code=502, detail="All trademark searches failed; no report to render.")

    # Persist each successful report (so user can re-open individual ones).
    for it in successful:
        try:
            rid = await _save_report(it["report"], branding=branding)
            it["id"] = rid
        except Exception:
            logger.exception("save_report failed for %s", it.get("name"))

    analytics = compute_portfolio_analytics(items)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if format == "pdf":
        data = build_bulk_dossier_pdf(items, branding, analytics)
        media = "application/pdf"
        fname = f"bulk_trademark_report_{today}.pdf"
    elif format == "docx":
        data = build_bulk_docx(items, branding, analytics)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fname = f"bulk_trademark_report_{today}.docx"
    else:  # xlsx
        data = build_bulk_xlsx(items, branding, analytics)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fname = f"bulk_trademark_report_{today}.xlsx"

    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
