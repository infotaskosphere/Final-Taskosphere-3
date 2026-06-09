"""
PDF generation for trademark availability reports.
Professional design with full-width logo header, color-coded verdict,
clean Helvetica typography, and a polished exhibit section.
"""
from __future__ import annotations

import base64
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether,
)
from reportlab.platypus import Image as RLImage

# ── Brand palette ─────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#1B2A4A")
BLUE       = colors.HexColor("#1F6FB2")
LIGHT_BLUE = colors.HexColor("#EBF4FB")
BORDER     = colors.HexColor("#D0DCE8")
TEXT       = colors.HexColor("#1A1A2E")
MUTED      = colors.HexColor("#5A6A7A")
SUBTLE     = colors.HexColor("#F5F7FA")
WHITE      = colors.white

VERDICT_PALETTE = {
    "AVAILABLE": {
        "fg":  colors.HexColor("#166534"),
        "bg":  colors.HexColor("#DCFCE7"),
        "bar": colors.HexColor("#22C55E"),
        "border": colors.HexColor("#86EFAC"),
        "label": "AVAILABLE",
    },
    "CAUTION": {
        "fg":  colors.HexColor("#92400E"),
        "bg":  colors.HexColor("#FEF3C7"),
        "bar": colors.HexColor("#F59E0B"),
        "border": colors.HexColor("#FCD34D"),
        "label": "CAUTION",
    },
    "CONFLICT": {
        "fg":  colors.HexColor("#7F1D1D"),
        "bg":  colors.HexColor("#FEE2E2"),
        "bar": colors.HexColor("#EF4444"),
        "border": colors.HexColor("#FCA5A5"),
        "label": "CONFLICT",
    },
}

PAGE_W, PAGE_H = A4
L_MARGIN = R_MARGIN = 16 * mm
CONTENT_W = PAGE_W - L_MARGIN - R_MARGIN


# ── Styles ────────────────────────────────────────────────────────────────────
def _S():
    return {
        "eyebrow": ParagraphStyle(
            "eyebrow",
            fontName="Helvetica-Bold", fontSize=7.5,
            textColor=MUTED, leading=10,
            spaceBefore=14, spaceAfter=4,
            letterSpacing=1.2,
        ),
        "h1": ParagraphStyle(
            "h1",
            fontName="Helvetica-Bold", fontSize=26,
            textColor=TEXT, leading=30,
            spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "h2",
            fontName="Helvetica-Bold", fontSize=13,
            textColor=NAVY, leading=17,
            spaceBefore=14, spaceAfter=5,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            fontName="Helvetica", fontSize=10,
            textColor=MUTED, leading=14,
            spaceAfter=10,
        ),
        "body": ParagraphStyle(
            "body",
            fontName="Helvetica", fontSize=9.5,
            textColor=TEXT, leading=14,
            spaceAfter=3,
        ),
        "body_bold": ParagraphStyle(
            "body_bold",
            fontName="Helvetica-Bold", fontSize=9.5,
            textColor=TEXT, leading=14,
        ),
        "small": ParagraphStyle(
            "small",
            fontName="Helvetica", fontSize=8,
            textColor=MUTED, leading=11,
        ),
        "small_bold": ParagraphStyle(
            "small_bold",
            fontName="Helvetica-Bold", fontSize=8,
            textColor=MUTED, leading=11,
        ),
        "verdict_label": ParagraphStyle(
            "verdict_label",
            fontName="Helvetica-Bold", fontSize=22,
            leading=26,
        ),
        "verdict_sub": ParagraphStyle(
            "verdict_sub",
            fontName="Helvetica", fontSize=9,
            textColor=MUTED, leading=13,
        ),
        "risk_num": ParagraphStyle(
            "risk_num",
            fontName="Helvetica-Bold", fontSize=32,
            textColor=NAVY, leading=36,
            alignment=TA_CENTER,
        ),
        "risk_label": ParagraphStyle(
            "risk_label",
            fontName="Helvetica", fontSize=8,
            textColor=MUTED, leading=11,
            alignment=TA_CENTER,
        ),
        "rec_num": ParagraphStyle(
            "rec_num",
            fontName="Helvetica-Bold", fontSize=10,
            textColor=BLUE, leading=14,
        ),
        "rec_text": ParagraphStyle(
            "rec_text",
            fontName="Helvetica", fontSize=9.5,
            textColor=TEXT, leading=14,
        ),
        "alt_pill": ParagraphStyle(
            "alt_pill",
            fontName="Helvetica", fontSize=9,
            textColor=BLUE, leading=13,
        ),
        "footer": ParagraphStyle(
            "footer",
            fontName="Helvetica", fontSize=7.5,
            textColor=MUTED, leading=11,
            alignment=TA_CENTER,
        ),
        "tbl_hdr": ParagraphStyle(
            "tbl_hdr",
            fontName="Helvetica-Bold", fontSize=7.5,
            textColor=WHITE, leading=10,
        ),
        "tbl_cell": ParagraphStyle(
            "tbl_cell",
            fontName="Helvetica", fontSize=8,
            textColor=TEXT, leading=11,
        ),
        "tbl_cell_mono": ParagraphStyle(
            "tbl_cell_mono",
            fontName="Courier", fontSize=7.5,
            textColor=MUTED, leading=11,
        ),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────
def _decode_logo(data_url: str) -> BytesIO | None:
    try:
        if not data_url.startswith("data:image"):
            return None
        _, b64 = data_url.split(",", 1)
        return BytesIO(base64.b64decode(b64))
    except Exception:
        return None


def _section_rule():
    return HRFlowable(
        width="100%", thickness=0.5,
        color=BORDER, spaceAfter=6, spaceBefore=2,
    )


def _match_color(match_type: str) -> colors.Color:
    return {
        "exact":    colors.HexColor("#DC2626"),
        "phonetic": colors.HexColor("#D97706"),
        "contains": colors.HexColor("#2563EB"),
        "similar":  colors.HexColor("#7C3AED"),
        "weak":     colors.HexColor("#9CA3AF"),
    }.get((match_type or "").lower(), colors.HexColor("#9CA3AF"))


def _status_color(status: str) -> colors.Color:
    s = (status or "").lower()
    if s in ("registered", "accepted", "advertised", "opposed", "objected"):
        return colors.HexColor("#DC2626")
    if s in ("under examination", "pending"):
        return colors.HexColor("#D97706")
    if s in ("abandoned", "refused", "withdrawn", "removed"):
        return colors.HexColor("#9CA3AF")
    return MUTED


# ── Page callbacks ────────────────────────────────────────────────────────────
def _make_page_cb(footer_left: str, footer_right: str, watermark: str = ""):
    """Returns an onPage callback that draws page number + footer + optional diagonal watermark."""
    def _cb(canvas, doc):
        canvas.saveState()

        # ── Diagonal watermark stamp — single centred diagonal (MS Word style) ──
        if watermark:
            canvas.saveState()
            # Choose font size based on text length so it fits within the page
            wm_text = watermark.upper()
            font_size = max(28, min(68, int(180 / max(len(wm_text), 1))))
            canvas.setFont("Helvetica-Bold", font_size)
            canvas.setFillColor(colors.HexColor("#C8D4E0"))
            canvas.setFillAlpha(0.15)
            # Translate to exact page centre, rotate 45° — one stamp only
            canvas.translate(PAGE_W / 2, PAGE_H / 2)
            canvas.rotate(45)
            canvas.drawCentredString(0, 0, wm_text)
            canvas.restoreState()

        # ── Footer rule + text ─────────────────────────────────────────────────
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.4)
        y_rule = 12 * mm
        canvas.line(L_MARGIN, y_rule, PAGE_W - R_MARGIN, y_rule)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(L_MARGIN, 8 * mm, footer_left)
        canvas.drawRightString(PAGE_W - R_MARGIN, 8 * mm, footer_right)
        page_num = f"Page {doc.page}"
        canvas.drawCentredString(PAGE_W / 2, 8 * mm, page_num)
        canvas.restoreState()
    return _cb


# ── Main builder ──────────────────────────────────────────────────────────────
def build_report_pdf(doc_record: dict) -> bytes:
    report      = doc_record.get("report") or doc_record
    query       = report.get("query", "—")
    overall     = report.get("overall_status", "UNKNOWN")
    risk        = report.get("risk_score", 0)
    headline    = report.get("headline", "")
    counts      = report.get("summary_counts", {}) or {}
    class_bd    = report.get("class_breakdown", []) or []
    recs        = report.get("recommendations", []) or []
    alts        = report.get("alternative_name_suggestions", []) or []
    all_results = report.get("all_results", []) or []
    created_raw = doc_record.get("created_at") or datetime.utcnow().isoformat()
    created     = created_raw[:19].replace("T", " ") + " UTC"

    # Branding
    logo_url    = report.get("logo_data_url")
    footer_text = report.get("footer_text", "") or ""
    tagline     = report.get("tagline", "") or "Trademark Availability Report"
    watermark   = report.get("watermark", "") or ""
    if watermark == "CUSTOM":
        watermark = report.get("custom_watermark", "") or ""

    # Client information for report cover
    client_name   = report.get("client_name",   "") or doc_record.get("client_name",   "") or ""
    client_mobile = report.get("client_mobile", "") or doc_record.get("client_mobile", "") or ""
    report_date   = report.get("report_date",   "") or doc_record.get("report_date",   "") or ""

    vp = VERDICT_PALETTE.get(overall, VERDICT_PALETTE["CAUTION"])

    buf = BytesIO()
    st  = _S()

    footer_l = footer_text or "Bureau of Trademark Intelligence — India"
    footer_r = f"Subject mark: {query} · {created}"

    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=L_MARGIN, rightMargin=R_MARGIN,
        topMargin=14 * mm, bottomMargin=20 * mm,
        title=f"Trademark Report — {query}",
    )

    story = []

    # ── HEADER BAND ────────────────────────────────────────────────────────────
    logo_img = None
    logo_img_height = 0
    if logo_url:
        logo_stream = _decode_logo(logo_url)
        if logo_stream:
            try:
                # Load image to get natural dimensions, then scale to full content width
                from PIL import Image as PILImage
                import copy
                logo_stream.seek(0)
                pil = PILImage.open(logo_stream)
                nat_w, nat_h = pil.size
                logo_stream.seek(0)
                # Scale so width = CONTENT_W, keep aspect ratio (no height cap)
                scaled_h = (nat_h / nat_w) * CONTENT_W if nat_w > 0 else 20 * mm
                # Cap height at 36mm for very tall logos; wide logos show naturally
                scaled_h = min(scaled_h, 36 * mm)
                logo_img = RLImage(logo_stream, width=CONTENT_W, height=scaled_h)
                logo_img_height = scaled_h
            except Exception:
                # Fallback: use proportional scaling with generous height budget
                try:
                    logo_stream.seek(0)
                    logo_img = RLImage(logo_stream, width=CONTENT_W, height=30 * mm, kind="proportional")
                    logo_img_height = 30 * mm
                except Exception:
                    logo_img = None

    if logo_img:
        # Full-width logo on white background — no clipping
        logo_tbl = Table([[logo_img]], colWidths=[CONTENT_W])
        logo_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), WHITE),
            ("BOX",          (0, 0), (-1, -1), 0.4, BORDER),
            ("TOPPADDING",   (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(logo_tbl)
        story.append(Spacer(1, 6))
    else:
        # Navy header band with firm name as text
        hdr_tbl = Table(
            [[Paragraph("BUREAU OF TRADEMARK INTELLIGENCE — INDIA", ParagraphStyle(
                "hdr_text", fontName="Helvetica-Bold", fontSize=11,
                textColor=WHITE, leading=15,
            ))]],
            colWidths=[CONTENT_W],
        )
        hdr_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), NAVY),
            ("TOPPADDING",   (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
            ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ]))
        story.append(hdr_tbl)
        story.append(Spacer(1, 6))

    # Tagline / subtitle strip
    if tagline:
        tag_tbl = Table(
            [[Paragraph(tagline, ParagraphStyle(
                "tagline", fontName="Helvetica", fontSize=8.5,
                textColor=BLUE, leading=12,
            ))]],
            colWidths=[CONTENT_W],
        )
        tag_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_BLUE),
            ("TOPPADDING",   (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
            ("LEFTPADDING",  (0, 0), (-1, -1), 12),
            ("BOX",          (0, 0), (-1, -1), 0.4, BORDER),
        ]))
        story.append(tag_tbl)
        story.append(Spacer(1, 8))

    # ── TITLE ROW ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Trademark Availability Dossier", st["h1"]))
    story.append(Paragraph(
        f"Subject mark: <b>{query}</b> &nbsp;·&nbsp; Generated: {created}"
        + ("&nbsp;·&nbsp; <b>Device marks only</b>" if report.get("device_only") else ""),
        st["subtitle"],
    ))
    story.append(_section_rule())

    # ── CLIENT INFORMATION ─────────────────────────────────────────────────────
    if client_name or client_mobile or report_date:
        ci_rows = []
        if client_name:
            ci_rows.append([
                Paragraph("CLIENT", st["small_bold"]),
                Paragraph(client_name, st["body_bold"]),
            ])
        if client_mobile:
            ci_rows.append([
                Paragraph("MOBILE", st["small_bold"]),
                Paragraph(client_mobile, st["body"]),
            ])
        if report_date:
            ci_rows.append([
                Paragraph("REPORT DATE", st["small_bold"]),
                Paragraph(report_date, st["body"]),
            ])
        if ci_rows:
            ci_tbl = Table(ci_rows, colWidths=[28 * mm, CONTENT_W - 28 * mm])
            ci_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), SUBTLE),
                ("BACKGROUND",    (0, 0), (0, -1),  LIGHT_BLUE),
                ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
                ("INNERGRID",     (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING",    (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING",   (0, 0), (-1, -1), 10),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ]))
            story.append(ci_tbl)
            story.append(Spacer(1, 10))

    # ── VERDICT BLOCK ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 4))

    # Left: verdict label + headline
    verdict_label_p = Paragraph(
        f'<font color="{vp["fg"].hexval()}"><b>{vp["label"]}</b></font>',
        st["verdict_label"],
    )
    headline_p = Paragraph(headline, st["body"])

    # Right: risk score box
    risk_num_p   = Paragraph(f'<font color="{vp["bar"].hexval()}">{risk}</font>', st["risk_num"])
    risk_denom_p = Paragraph("/100", ParagraphStyle(
        "denom", fontName="Helvetica", fontSize=11, textColor=MUTED, leading=14, alignment=TA_CENTER,
    ))
    risk_label_p = Paragraph("RISK SCORE", st["risk_label"])

    verdict_tbl = Table(
        [
            [verdict_label_p,                       risk_num_p],
            [headline_p,                            risk_denom_p],
            ["",                                    risk_label_p],
        ],
        colWidths=[CONTENT_W * 0.72, CONTENT_W * 0.28],
        rowHeights=[None, None, None],
    )
    verdict_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), vp["bg"]),
        ("BOX",          (0, 0), (-1, -1), 1.2, vp["border"]),
        ("LINEAFTER",    (0, 0), (0, -1),  0.5, vp["border"]),
        ("SPAN",         (0, 1), (0, 2)),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",        (1, 0), (1, -1),  "CENTER"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING",   (0, 0), (-1, 0),  12),
        ("BOTTOMPADDING",(0, 2), (-1, 2),  12),
        ("TOPPADDING",   (0, 1), (-1, 1),   4),
        ("TOPPADDING",   (1, 0), (1, 0),   10),
    ]))
    story.append(verdict_tbl)
    story.append(Spacer(1, 10))

    # ── MATCH COUNTS ───────────────────────────────────────────────────────────
    story.append(Paragraph("MATCH COUNTS", st["eyebrow"]))
    story.append(_section_rule())

    count_data = [
        [
            Paragraph("EXACT", st["small_bold"]),
            Paragraph("PHONETIC", st["small_bold"]),
            Paragraph("SIMILAR / CONTAINS", st["small_bold"]),
            Paragraph("TOTAL FILINGS", st["small_bold"]),
        ],
        [
            Paragraph(f'<font color="{colors.HexColor("#DC2626").hexval()}"><b>{counts.get("exact", 0)}</b></font>',
                      ParagraphStyle("cn", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
            Paragraph(f'<font color="{colors.HexColor("#D97706").hexval()}"><b>{counts.get("phonetic", 0)}</b></font>',
                      ParagraphStyle("cn", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
            Paragraph(f'<font color="{colors.HexColor("#2563EB").hexval()}"><b>{counts.get("contains_or_similar", 0)}</b></font>',
                      ParagraphStyle("cn", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
            Paragraph(f'<font color="{NAVY.hexval()}"><b>{counts.get("total_results", 0)}</b></font>',
                      ParagraphStyle("cn", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
        ],
    ]
    cw = CONTENT_W / 4
    cnt_tbl = Table(count_data, colWidths=[cw] * 4)
    cnt_tbl.setStyle(TableStyle([
        ("BOX",          (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID",    (0, 0), (-1, -1), 0.4, BORDER),
        ("BACKGROUND",   (0, 0), (-1, 0),  SUBTLE),
        ("BACKGROUND",   (0, 1), (-1, 1),  WHITE),
        ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, 0),   7),
        ("BOTTOMPADDING",(0, 0), (-1, 0),   7),
        ("TOPPADDING",   (0, 1), (-1, 1),  10),
        ("BOTTOMPADDING",(0, 1), (-1, 1),  10),
    ]))
    story.append(cnt_tbl)
    story.append(Spacer(1, 4))

    # ── RECOMMENDATIONS ────────────────────────────────────────────────────────
    story.append(Paragraph("RECOMMENDATIONS", st["eyebrow"]))
    story.append(_section_rule())

    rec_rows = []
    for i, rec in enumerate(recs, 1):
        rec_rows.append(KeepTogether([
            Table(
                [[Paragraph(f"{i:02d}.", st["rec_num"]), Paragraph(rec, st["rec_text"])]],
                colWidths=[10 * mm, CONTENT_W - 10 * mm],
            )
        ]))
    for r in rec_rows:
        story.append(r)
    story.append(Spacer(1, 4))

    # ── ALTERNATIVE NAMES ──────────────────────────────────────────────────────
    if alts:
        story.append(Paragraph("ALTERNATIVE NAMES", st["eyebrow"]))
        story.append(_section_rule())
        pills_txt = "  ·  ".join(alts)
        alt_tbl = Table(
            [[Paragraph(pills_txt, ParagraphStyle(
                "alts", fontName="Helvetica", fontSize=9.5,
                textColor=BLUE, leading=14,
            ))]],
            colWidths=[CONTENT_W],
        )
        alt_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_BLUE),
            ("BOX",          (0, 0), (-1, -1), 0.5, BORDER),
            ("TOPPADDING",   (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
            ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ]))
        story.append(alt_tbl)
        story.append(Spacer(1, 4))

    # ── CLASS BREAKDOWN ────────────────────────────────────────────────────────
    if class_bd:
        story.append(Paragraph("CLASS-WISE BREAKDOWN", st["eyebrow"]))
        story.append(_section_rule())

        hdr = [
            Paragraph("CLASS",    st["tbl_hdr"]),
            Paragraph("SECTOR",   st["tbl_hdr"]),
            Paragraph("TOTAL",    st["tbl_hdr"]),
            Paragraph("BLOCKING", st["tbl_hdr"]),
            Paragraph("DEAD",     st["tbl_hdr"]),
        ]
        rows = [hdr]
        for cb in class_bd[:20]:
            cls_no = cb.get("class", "?")
            cls_str = f"CL{cls_no:02d}" if isinstance(cls_no, int) else str(cls_no)
            blocking_v = cb.get("blocking", 0)
            blocking_cell = Paragraph(
                f'<font color="{colors.HexColor("#DC2626").hexval()}"><b>{blocking_v}</b></font>'
                if blocking_v else "0",
                ParagraphStyle("tc_r", fontName="Helvetica-Bold" if blocking_v else "Helvetica",
                               fontSize=8, leading=11, alignment=TA_CENTER),
            )
            rows.append([
                Paragraph(cls_str, ParagraphStyle(
                    "cls", fontName="Helvetica-Bold", fontSize=8,
                    textColor=BLUE, leading=11, alignment=TA_CENTER,
                )),
                Paragraph(cb.get("hint", "—"), st["tbl_cell"]),
                Paragraph(str(cb.get("total", 0)), ParagraphStyle(
                    "tc_c", fontName="Helvetica-Bold", fontSize=8,
                    textColor=NAVY, leading=11, alignment=TA_CENTER,
                )),
                blocking_cell,
                Paragraph(str(cb.get("dead", 0)), ParagraphStyle(
                    "tc_r2", fontName="Helvetica", fontSize=8, textColor=MUTED,
                    leading=11, alignment=TA_CENTER,
                )),
            ])

        cws = [16*mm, CONTENT_W - 16*mm - 20*mm - 24*mm - 20*mm, 20*mm, 24*mm, 20*mm]
        cls_tbl = Table(rows, colWidths=cws, repeatRows=1)
        cls_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0),  NAVY),
            ("ROWBACKGROUNDS",(0, 1),(-1,-1), [WHITE, SUBTLE]),
            ("BOX",          (0, 0), (-1, -1), 0.5, BORDER),
            ("LINEBELOW",    (0, 0), (-1, 0),  0.8, NAVY),
            ("INNERGRID",    (0, 1), (-1, -1), 0.3, BORDER),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",   (0, 0), (-1, -1),  6),
            ("BOTTOMPADDING",(0, 0), (-1, -1),  6),
            ("LEFTPADDING",  (0, 0), (-1, -1),  6),
            ("RIGHTPADDING", (0, 0), (-1, -1),  6),
        ]))
        story.append(cls_tbl)

    # ── WATERMARK — rendered as diagonal canvas stamp via page callback ─────────
    # (handled in _make_page_cb below — no flowable needed)

    # ── EXHIBIT A — MATCHES ────────────────────────────────────────────────────
    if all_results:
        story.append(PageBreak())

        # Repeat logo on page 2 if present (half-width, properly scaled)
        if logo_img:
            logo_stream2 = _decode_logo(logo_url)
            if logo_stream2:
                try:
                    from PIL import Image as PILImage
                    logo_stream2.seek(0)
                    pil2 = PILImage.open(logo_stream2)
                    nat_w2, nat_h2 = pil2.size
                    logo_stream2.seek(0)
                    half_w = CONTENT_W * 0.55
                    scaled_h2 = (nat_h2 / nat_w2) * half_w if nat_w2 > 0 else 18 * mm
                    scaled_h2 = min(scaled_h2, 28 * mm)
                    logo_sm = RLImage(logo_stream2, width=half_w, height=scaled_h2)
                    logo_sm_tbl = Table([[logo_sm]], colWidths=[CONTENT_W])
                    logo_sm_tbl.setStyle(TableStyle([
                        ("BACKGROUND",   (0,0),(-1,-1), WHITE),
                        ("BOX",          (0,0),(-1,-1), 0.4, BORDER),
                        ("TOPPADDING",   (0,0),(-1,-1), 5),
                        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
                        ("LEFTPADDING",  (0,0),(-1,-1), 0),
                        ("ALIGN",        (0,0),(-1,-1), "LEFT"),
                        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
                    ]))
                    story.append(logo_sm_tbl)
                    story.append(Spacer(1, 8))
                except Exception:
                    pass

        story.append(Paragraph("EXHIBIT A", st["eyebrow"]))
        story.append(Paragraph("Recorded Matches", st["h2"]))
        story.append(Paragraph(
            f"Showing top {min(len(all_results), 30)} of {len(all_results)} indexed filings for <b>{query}</b>.",
            st["subtitle"],
        ))
        story.append(_section_rule())

        # Table header  — column order: APP.ID | MARK NAME | APPLICANT | STATUS | LOGO | CL. | MATCH | RISK
        ex_hdr = [
            Paragraph("APP. ID",    st["tbl_hdr"]),
            Paragraph("MARK NAME",  st["tbl_hdr"]),
            Paragraph("APPLICANT",  st["tbl_hdr"]),
            Paragraph("STATUS",     st["tbl_hdr"]),
            Paragraph("LOGO",       st["tbl_hdr"]),
            Paragraph("CL.",        st["tbl_hdr"]),
            Paragraph("MATCH",      st["tbl_hdr"]),
            Paragraph("RISK",       st["tbl_hdr"]),
        ]
        ex_rows = [ex_hdr]

        for r in all_results[:30]:
            mt    = (r.get("match_type") or "").lower()
            mt_c  = _match_color(mt)
            st_c  = _status_color(r.get("status", ""))
            risk_v = r.get("individual_risk_score", 0)

            if risk_v >= 70:
                r_c = colors.HexColor("#DC2626")
            elif risk_v >= 40:
                r_c = colors.HexColor("#D97706")
            else:
                r_c = MUTED

            # Mark logo image cell
            logo_cell = Paragraph("—", st["tbl_cell"])
            img_data_url = r.get("mark_image_data_url") or r.get("mark_image_url", "")
            if img_data_url and img_data_url.startswith("data:image"):
                try:
                    img_stream = _decode_logo(img_data_url)
                    if img_stream:
                        logo_cell = RLImage(img_stream, width=12*mm, height=12*mm, kind="proportional")
                except Exception:
                    pass

            ex_rows.append([
                Paragraph(str(r.get("application_id") or "—"), st["tbl_cell_mono"]),
                Paragraph((r.get("name") or "—")[:34], ParagraphStyle(
                    "nm", fontName="Helvetica-Bold", fontSize=8, textColor=TEXT, leading=11,
                )),
                Paragraph((r.get("applicant") or "—")[:30], st["tbl_cell"]),
                Paragraph(
                    f'<font color="{st_c.hexval()}">{(r.get("status") or "—")[:16]}</font>',
                    st["tbl_cell"],
                ),
                logo_cell,
                Paragraph(str(r.get("class") or "—"), ParagraphStyle(
                    "cls2", fontName="Helvetica-Bold", fontSize=8,
                    textColor=BLUE, leading=11, alignment=TA_CENTER,
                )),
                Paragraph(
                    f'<font color="{mt_c.hexval()}"><b>{mt.upper()}</b></font>',
                    ParagraphStyle("mtc", fontName="Helvetica-Bold", fontSize=7.5,
                                   leading=11, alignment=TA_CENTER),
                ),
                Paragraph(
                    f'<font color="{r_c.hexval()}"><b>{risk_v}</b></font>',
                    ParagraphStyle("rc", fontName="Helvetica-Bold", fontSize=8,
                                   leading=11, alignment=TA_CENTER),
                ),
            ])

        # APP.ID | MARK NAME | APPLICANT | STATUS | LOGO | CL. | MATCH | RISK
        ex_cws = [20*mm, 46*mm, 38*mm, 26*mm, 14*mm, 10*mm, 20*mm, 12*mm]
        ex_tbl = Table(ex_rows, colWidths=ex_cws, repeatRows=1)
        ex_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, SUBTLE]),
            ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
            ("LINEBELOW",     (0, 0), (-1, 0),  0.8, NAVY),
            ("INNERGRID",     (0, 1), (-1, -1), 0.3, BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1),  5),
            ("BOTTOMPADDING", (0, 0), (-1, -1),  5),
            ("LEFTPADDING",   (0, 0), (-1, -1),  5),
            ("RIGHTPADDING",  (0, 0), (-1, -1),  5),
        ]))
        story.append(ex_tbl)

    # ── FOOTER NOTE ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 14))
    story.append(_section_rule())
    story.append(Paragraph(
        "Data source: quickcompany.in · IP India trademark index. "
        "For informational purposes only — not legal advice.",
        st["footer"],
    ))

    page_cb = _make_page_cb(footer_l, footer_r, watermark)
    pdf.build(story, onFirstPage=page_cb, onLaterPages=page_cb)
    return buf.getvalue()


# ── Combined / Bulk report builder ────────────────────────────────────────────
def build_combined_report_pdf(items: list, branding: dict) -> bytes:
    """Generate a single combined PDF for multiple bulk trademark search results."""

    logo_url    = branding.get("logo_data_url")
    footer_text = branding.get("footer_text", "") or ""
    tagline     = branding.get("tagline", "") or "Bulk Trademark Availability Report"
    watermark   = branding.get("watermark", "") or ""
    if watermark == "CUSTOM":
        watermark = branding.get("custom_watermark", "") or ""

    client_name   = branding.get("client_name",   "") or ""
    client_mobile = branding.get("client_mobile", "") or ""
    report_date   = branding.get("report_date",   "") or ""

    created = datetime.utcnow().strftime("%Y-%m-%d %H:%M") + " UTC"

    total     = len(items)
    available = sum(1 for it in items if it.get("overall_status") == "AVAILABLE")
    caution   = sum(1 for it in items if it.get("overall_status") == "CAUTION")
    conflict  = sum(1 for it in items if it.get("overall_status") == "CONFLICT")

    footer_l = footer_text or "Bureau of Trademark Intelligence — India"
    footer_r = f"Bulk report · {total} marks · {created}"

    buf = BytesIO()
    st  = _S()

    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=L_MARGIN, rightMargin=R_MARGIN,
        topMargin=14 * mm, bottomMargin=20 * mm,
        title="Bulk Trademark Availability Report",
    )

    story = []

    # ── HEADER BAND ────────────────────────────────────────────────────────────
    logo_img = None
    if logo_url:
        logo_stream = _decode_logo(logo_url)
        if logo_stream:
            try:
                from PIL import Image as PILImage
                logo_stream.seek(0)
                pil = PILImage.open(logo_stream)
                nat_w, nat_h = pil.size
                logo_stream.seek(0)
                scaled_h = min((nat_h / nat_w) * CONTENT_W if nat_w > 0 else 20 * mm, 36 * mm)
                logo_img = RLImage(logo_stream, width=CONTENT_W, height=scaled_h)
            except Exception:
                try:
                    logo_stream.seek(0)
                    logo_img = RLImage(logo_stream, width=CONTENT_W, height=30 * mm, kind="proportional")
                except Exception:
                    logo_img = None

    if logo_img:
        logo_tbl = Table([[logo_img]], colWidths=[CONTENT_W])
        logo_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
            ("BOX",           (0, 0), (-1, -1), 0.4, BORDER),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(logo_tbl)
        story.append(Spacer(1, 6))
    else:
        hdr_tbl = Table([[Paragraph("BUREAU OF TRADEMARK INTELLIGENCE — INDIA", ParagraphStyle(
            "hdr_text_b", fontName="Helvetica-Bold", fontSize=11, textColor=WHITE, leading=15,
        ))]], colWidths=[CONTENT_W])
        hdr_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), NAVY),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ]))
        story.append(hdr_tbl)
        story.append(Spacer(1, 6))

    if tagline:
        tag_tbl = Table([[Paragraph(tagline, ParagraphStyle(
            "tagline_b", fontName="Helvetica", fontSize=8.5, textColor=BLUE, leading=12,
        ))]], colWidths=[CONTENT_W])
        tag_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_BLUE),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("BOX",           (0, 0), (-1, -1), 0.4, BORDER),
        ]))
        story.append(tag_tbl)
        story.append(Spacer(1, 8))

    # ── TITLE ──────────────────────────────────────────────────────────────────
    story.append(Paragraph("Bulk Trademark Availability Report", st["h1"]))
    story.append(Paragraph(
        f"Total marks analysed: <b>{total}</b> &nbsp;·&nbsp; Generated: {created}",
        st["subtitle"],
    ))
    story.append(_section_rule())

    # ── CLIENT INFORMATION ─────────────────────────────────────────────────────
    if client_name or client_mobile or report_date:
        ci_rows = []
        if client_name:
            ci_rows.append([Paragraph("CLIENT", st["small_bold"]), Paragraph(client_name, st["body_bold"])])
        if client_mobile:
            ci_rows.append([Paragraph("MOBILE", st["small_bold"]), Paragraph(client_mobile, st["body"])])
        if report_date:
            ci_rows.append([Paragraph("REPORT DATE", st["small_bold"]), Paragraph(report_date, st["body"])])
        if ci_rows:
            ci_tbl = Table(ci_rows, colWidths=[28 * mm, CONTENT_W - 28 * mm])
            ci_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), SUBTLE),
                ("BACKGROUND",    (0, 0), (0, -1),  LIGHT_BLUE),
                ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
                ("INNERGRID",     (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING",    (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING",   (0, 0), (-1, -1), 10),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ]))
            story.append(ci_tbl)
            story.append(Spacer(1, 10))

    # ── SUMMARY STATS ──────────────────────────────────────────────────────────
    story.append(Paragraph("SUMMARY", st["eyebrow"]))
    story.append(_section_rule())

    stat_data = [
        [
            Paragraph("TOTAL MARKS", st["small_bold"]),
            Paragraph("AVAILABLE", st["small_bold"]),
            Paragraph("CAUTION", st["small_bold"]),
            Paragraph("CONFLICT", st["small_bold"]),
        ],
        [
            Paragraph(f'<font color="{NAVY.hexval()}"><b>{total}</b></font>',
                      ParagraphStyle("s1", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
            Paragraph(f'<font color="{colors.HexColor("#166534").hexval()}"><b>{available}</b></font>',
                      ParagraphStyle("s2", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
            Paragraph(f'<font color="{colors.HexColor("#92400E").hexval()}"><b>{caution}</b></font>',
                      ParagraphStyle("s3", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
            Paragraph(f'<font color="{colors.HexColor("#7F1D1D").hexval()}"><b>{conflict}</b></font>',
                      ParagraphStyle("s4", fontName="Helvetica-Bold", fontSize=28, leading=34, alignment=TA_CENTER)),
        ],
    ]
    cw4 = CONTENT_W / 4
    stat_tbl = Table(stat_data, colWidths=[cw4] * 4)
    stat_tbl.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.4, BORDER),
        ("BACKGROUND",    (0, 0), (-1, 0),  SUBTLE),
        ("BACKGROUND",    (0, 1), (-1, 1),  WHITE),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, 0),   7),
        ("BOTTOMPADDING", (0, 0), (-1, 0),   7),
        ("TOPPADDING",    (0, 1), (-1, 1),  10),
        ("BOTTOMPADDING", (0, 1), (-1, 1),  10),
    ]))
    story.append(stat_tbl)
    story.append(Spacer(1, 14))

    # ── MARK-BY-MARK TABLE ─────────────────────────────────────────────────────
    story.append(Paragraph("MARK-BY-MARK ANALYSIS", st["eyebrow"]))
    story.append(_section_rule())

    mark_rows = [[
        Paragraph("MARK NAME", st["tbl_hdr"]),
        Paragraph("VERDICT", st["tbl_hdr"]),
        Paragraph("RISK", st["tbl_hdr"]),
        Paragraph("CLASS", st["tbl_hdr"]),
        Paragraph("ANALYSIS SUMMARY", st["tbl_hdr"]),
    ]]

    for it in items:
        status   = it.get("overall_status", "UNKNOWN")
        vp_it    = VERDICT_PALETTE.get(status, VERDICT_PALETTE["CAUTION"])
        risk_v   = str(it.get("risk_score", "—")) if not it.get("error") else "—"
        klass    = f'CL{str(it.get("class_filter","")).zfill(2)}' if it.get("class_filter") else "All"
        headline = it.get("headline", "") or it.get("error", "—")
        label    = vp_it["label"] if not it.get("error") else "ERROR"

        mark_rows.append([
            Paragraph(f'<b>{it.get("name", "")}</b>',
                      ParagraphStyle("mn", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=NAVY)),
            Paragraph(f'<font color="{vp_it["fg"].hexval()}"><b>{label}</b></font>',
                      ParagraphStyle("vd", fontName="Helvetica-Bold", fontSize=8.5, leading=11)),
            Paragraph(f'<font color="{vp_it["bar"].hexval()}"><b>{risk_v}</b></font>',
                      ParagraphStyle("rs", fontName="Helvetica-Bold", fontSize=10, leading=13, alignment=TA_CENTER)),
            Paragraph(klass,
                      ParagraphStyle("kl", fontName="Helvetica", fontSize=8, leading=11, alignment=TA_CENTER, textColor=MUTED)),
            Paragraph(headline, st["tbl_cell"]),
        ])

    mark_cws = [38 * mm, 24 * mm, 14 * mm, 14 * mm, CONTENT_W - 90 * mm]
    mark_tbl = Table(mark_rows, colWidths=mark_cws, repeatRows=1)
    mark_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, SUBTLE]),
        ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.8, NAVY),
        ("INNERGRID",     (0, 1), (-1, -1), 0.3, BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ALIGN",         (2, 0), (3, -1),  "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1),  6),
        ("BOTTOMPADDING", (0, 0), (-1, -1),  6),
        ("LEFTPADDING",   (0, 0), (-1, -1),  6),
        ("RIGHTPADDING",  (0, 0), (-1, -1),  6),
    ]))
    story.append(mark_tbl)

    # ── FOOTER NOTE ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 14))
    story.append(_section_rule())
    story.append(Paragraph(
        "Data source: quickcompany.in · IP India trademark index. "
        "For informational purposes only — not legal advice.",
        st["footer"],
    ))

    page_cb = _make_page_cb(footer_l, footer_r, watermark)
    pdf.build(story, onFirstPage=page_cb, onLaterPages=page_cb)
    return buf.getvalue()
