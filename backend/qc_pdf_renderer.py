"""
PDF generation for trademark availability reports (QuickCompany style).
Uses reportlab to produce a printable dossier.
"""
from __future__ import annotations

from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

STATUS_COLOR = {
    "AVAILABLE": colors.HexColor("#16A34A"),
    "CAUTION":   colors.HexColor("#D97706"),
    "CONFLICT":  colors.HexColor("#DC2626"),
}


def _styles():
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "eyebrow", parent=base["Normal"],
            fontName="Courier-Bold", fontSize=8, textColor=colors.HexColor("#525252"),
            leading=11, spaceAfter=4, alignment=TA_LEFT,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"],
            fontName="Times-Bold", fontSize=22, leading=26, textColor=colors.black,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"],
            fontName="Times-Bold", fontSize=14, leading=18, textColor=colors.black,
            spaceBefore=12, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"],
            fontName="Helvetica", fontSize=10, leading=14, textColor=colors.HexColor("#1f1f1f"),
        ),
        "small": ParagraphStyle(
            "small", parent=base["BodyText"],
            fontName="Helvetica", fontSize=8, leading=11, textColor=colors.HexColor("#525252"),
        ),
        "mono": ParagraphStyle(
            "mono", parent=base["BodyText"],
            fontName="Courier", fontSize=9, leading=12, textColor=colors.black,
        ),
    }


def build_report_pdf(doc_record: dict) -> bytes:
    """Render a trademark availability report dict to PDF bytes."""
    report     = doc_record.get("report") or doc_record
    query      = report.get("query", "—")
    overall    = report.get("overall_status", "UNKNOWN")
    risk       = report.get("risk_score", 0)
    headline   = report.get("headline", "")
    counts     = report.get("summary_counts", {}) or {}
    class_breakdown  = report.get("class_breakdown", []) or []
    recommendations  = report.get("recommendations", []) or []
    alternatives     = report.get("alternative_name_suggestions", []) or []
    all_results      = report.get("all_results", []) or []
    created_at = doc_record.get("created_at") or datetime.utcnow().isoformat()

    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16*mm, rightMargin=16*mm,
        topMargin=18*mm, bottomMargin=16*mm,
        title=f"Trademark Report — {query}",
        author="Bureau of Trademark Intelligence",
    )
    st    = _styles()
    story = []

    story.append(Paragraph("BUREAU OF TRADEMARK INTELLIGENCE — INDIA", st["eyebrow"]))
    story.append(Paragraph("Trademark Availability Dossier", st["h1"]))
    story.append(Paragraph(
        f"Subject mark: <b>{query}</b> &nbsp;·&nbsp; "
        f"Generated: {created_at[:19].replace('T', ' ')} UTC"
        + ("&nbsp;·&nbsp; <b>Device marks only</b>" if report.get("device_only") else ""),
        st["small"]))

    logo = report.get("logo_data_url")
    if logo and isinstance(logo, str) and logo.startswith("data:image"):
        try:
            import base64
            from reportlab.platypus import Image
            _, b64 = logo.split(",", 1)
            img_stream = BytesIO(base64.b64decode(b64))
            story.append(Spacer(1, 6))
            story.append(Image(img_stream, width=40*mm, height=40*mm, kind="proportional"))
        except Exception:
            pass

    verdict_color = STATUS_COLOR.get(overall, colors.black)
    verdict_tbl = Table(
        [
            [
                Paragraph(f'<font color="{verdict_color.hexval()}"><b>{overall}</b></font>', st["h1"]),
                Paragraph(f"<b>Risk score</b><br/>{risk}/100", st["body"]),
            ],
            [Paragraph(headline, st["body"]), ""],
        ],
        colWidths=[120*mm, 50*mm],
    )
    verdict_tbl.setStyle(TableStyle([
        ("BOX",          (0, 0), (-1, -1), 1,   colors.black),
        ("LINEBELOW",    (0, 0), (-1,  0), 0.5, colors.HexColor("#cccccc")),
        ("SPAN",         (0, 1), (-1,  1)),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
    ]))
    story.append(Spacer(1, 8))
    story.append(verdict_tbl)

    story.append(Paragraph("MATCH COUNTS", st["eyebrow"]))
    cnt_tbl = Table(
        [
            ["Exact", "Phonetic", "Similar / Contains", "Total"],
            [
                str(counts.get("exact", 0)),
                str(counts.get("phonetic", 0)),
                str(counts.get("contains_or_similar", 0)),
                str(counts.get("total_results", 0)),
            ],
        ],
        colWidths=[42.5*mm]*4,
    )
    cnt_tbl.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 1,   colors.black),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("FONTNAME",      (0, 0), (-1,  0), "Courier-Bold"),
        ("FONTSIZE",      (0, 0), (-1,  0), 8),
        ("FONTNAME",      (0, 1), (-1,  1), "Times-Bold"),
        ("FONTSIZE",      (0, 1), (-1,  1), 16),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1,  0), 6),
        ("TOPPADDING",    (0, 0), (-1,  0), 6),
        ("BOTTOMPADDING", (0, 1), (-1,  1), 8),
        ("TOPPADDING",    (0, 1), (-1,  1), 8),
    ]))
    story.append(cnt_tbl)

    story.append(Paragraph("RECOMMENDATIONS", st["eyebrow"]))
    for i, rec in enumerate(recommendations, 1):
        story.append(Paragraph(f"<b>{i:02d}.</b> &nbsp; {rec}", st["body"]))

    if alternatives:
        story.append(Paragraph("ALTERNATIVE NAMES", st["eyebrow"]))
        story.append(Paragraph(" · ".join(alternatives), st["mono"]))

    if class_breakdown:
        story.append(Paragraph("CLASS-WISE BREAKDOWN", st["eyebrow"]))
        rows = [["Class", "Hint", "Total", "Blocking", "Dead"]]
        for cb in class_breakdown[:20]:
            rows.append([
                f"CL{cb.get('class', '?'):02d}" if isinstance(cb.get("class"), int) else str(cb.get("class", "?")),
                cb.get("hint", "—"),
                str(cb.get("total", 0)),
                str(cb.get("blocking", 0)),
                str(cb.get("dead", 0)),
            ])
        tbl = Table(rows, colWidths=[18*mm, 80*mm, 22*mm, 25*mm, 25*mm])
        tbl.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 0.75, colors.black),
            ("LINEBELOW",     (0, 0), (-1,  0), 0.75, colors.black),
            ("INNERGRID",     (0, 1), (-1, -1), 0.25, colors.HexColor("#dddddd")),
            ("FONTNAME",      (0, 0), (-1,  0), "Courier-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 8),
            ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
            ("ALIGN",         (2, 0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ]))
        story.append(tbl)

    if all_results:
        story.append(PageBreak())
        story.append(Paragraph("EXHIBIT A — RECORDED MATCHES (TOP 30)", st["eyebrow"]))
        rows = [["ID", "Name", "Applicant", "Status", "Cl.", "Match", "Risk"]]
        for r in all_results[:30]:
            rows.append([
                str(r.get("application_id") or "—"),
                (r.get("name") or "—")[:32],
                (r.get("applicant") or "—")[:28],
                (r.get("status") or "—")[:14],
                str(r.get("class") or "—"),
                (r.get("match_type") or "—").upper(),
                str(r.get("individual_risk_score") or 0),
            ])
        tbl = Table(rows, colWidths=[18*mm, 44*mm, 42*mm, 24*mm, 12*mm, 18*mm, 12*mm])
        tbl.setStyle(TableStyle([
            ("BOX",           (0, 0), (-1, -1), 0.75, colors.black),
            ("LINEBELOW",     (0, 0), (-1,  0), 0.75, colors.black),
            ("INNERGRID",     (0, 1), (-1, -1), 0.25, colors.HexColor("#dddddd")),
            ("FONTNAME",      (0, 0), (-1,  0), "Courier-Bold"),
            ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",      (0, 0), (-1, -1), 7),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("ALIGN",         (5, 0), (-1, -1), "CENTER"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Data source: quickcompany.in / IP India trademark index. "
        "For informational purposes only — not legal advice.",
        st["small"]))

    pdf.build(story)
    return buf.getvalue()
