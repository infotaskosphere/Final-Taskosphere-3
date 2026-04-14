"""
backend/quotations.py
─────────────────────────────────────────────────────────────────────────────
Quotation Module — FastAPI Router

PDF FIX (v6 - fpdf2 output fix):
  - Fixed _safe_pdf_output to use pdf.output() which returns bytes in fpdf2,
    then write into BytesIO. The old dest=BytesIO pattern is not valid in fpdf2.
  - All other logic preserved.
"""

import uuid
import logging
import re
import base64
import tempfile
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from datetime import datetime, timezone, date
from io import BytesIO
from typing import List, Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

try:
    from fpdf import FPDF
    from fpdf.enums import Align, XPos, YPos
except ImportError:
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2"])
    from fpdf import FPDF
    from fpdf.enums import Align, XPos, YPos

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Quotations"])


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT CHECKLISTS per service
# ═══════════════════════════════════════════════════════════════════════════════
SERVICE_CHECKLISTS: Dict[str, List[str]] = {
    "GST Registration": [
        "PAN Card of Applicant / Business",
        "Aadhaar Card of Proprietor / Partners / Directors",
        "Photograph (Passport Size)",
        "Address Proof of Business Premises (Electricity Bill / Rent Agreement)",
        "Bank Account Statement / Cancelled Cheque",
        "Constitution Proof (Partnership Deed / MOA-AOA / Certificate of Incorporation)",
        "Digital Signature Certificate (for Companies/LLP)",
        "Letter of Authorization / Board Resolution",
        "Mobile Number & Email ID",
    ],
    "GST Return Filing": [
        "GSTIN",
        "GST Username & Password",
        "Sales Invoices / Register",
        "Purchase Invoices / Register",
        "Bank Statement",
        "Credit / Debit Notes (if any)",
        "Previous Return Copy (GSTR-3B / GSTR-1)",
        "E-way Bill Records (if applicable)",
    ],
    "GST Annual Return (GSTR-9)": [
        "GSTIN",
        "GSTR-1 Filed Returns (All months)",
        "GSTR-3B Filed Returns (All months)",
        "Audited Financial Statements",
        "Purchase & Sales Ledger",
        "Input Tax Credit (ITC) Reconciliation",
        "HSN/SAC Code Summary",
    ],
    "Income Tax Return (ITR) - Individual": [
        "PAN Card",
        "Aadhaar Card",
        "Form 16 (from Employer)",
        "Bank Statements (All accounts)",
        "Interest Certificates (FD/Savings)",
        "Investment Proofs (80C, 80D, etc.)",
        "Rental Income Details (if any)",
        "Capital Gains Statements",
        "Previous Year ITR Copy",
    ],
    "Income Tax Return (ITR) - Business": [
        "PAN Card of Business / Proprietor",
        "Aadhaar Card",
        "Audited Financial Statements (P&L, Balance Sheet)",
        "Bank Statements (All accounts)",
        "TDS Certificates / Form 26AS",
        "GST Returns (if applicable)",
        "Loan Statements",
        "Investment / Asset Details",
        "Previous Year ITR Copy",
    ],
    "TDS Return Filing": [
        "TAN (Tax Deduction Account Number)",
        "PAN of Deductee(s)",
        "Challan Details (BSR Code, Date, Amount, Challan No.)",
        "Nature of Payment & Rate of TDS",
        "Previous Quarter TDS Return Copy",
        "Form 16 / 16A Data",
    ],
    "Tax Audit (Form 3CA/3CB)": [
        "PAN Card of Business",
        "Audited Financial Statements",
        "Books of Accounts (Ledger, Cash Book, Journal)",
        "Bank Statements",
        "GST Returns",
        "ITR Filed Copies",
        "Stock Valuation Report",
        "Fixed Asset Register",
        "Loan & Advance Details",
    ],
    "Company Registration (Pvt. Ltd.)": [
        "PAN Card of all Proposed Directors",
        "Aadhaar Card of all Proposed Directors",
        "Passport Size Photographs of all Directors",
        "Address Proof of Registered Office (Electricity Bill / NOC)",
        "Rent Agreement (if rented premises)",
        "Email IDs & Mobile Numbers of all Directors",
        "Proposed Company Name(s) (2-3 Options)",
        "Object Clause / Business Description",
        "DSC (Digital Signature Certificate) - will be applied",
        "DIN (Director Identification Number) - will be applied",
    ],
    "LLP Registration": [
        "PAN Card of all Designated Partners",
        "Aadhaar Card of all Designated Partners",
        "Passport Size Photographs",
        "Address Proof of Registered Office",
        "Proposed LLP Name(s)",
        "LLP Agreement Draft",
        "DPIN / DIN of Partners",
        "Email IDs & Mobile Numbers",
    ],
    "ROC Annual Compliance": [
        "Certificate of Incorporation",
        "MOA & AOA",
        "Audited Financial Statements",
        "Board Resolution",
        "Minutes of AGM / Board Meeting",
        "Shareholding Pattern",
        "List of Directors",
        "DIN of all Directors",
        "DSC of Authorized Signatory",
        "Previous Year Filed Forms",
    ],
    "Trademark Registration": [
        "PAN Card of Applicant",
        "Aadhaar Card",
        "Trademark (Logo / Word / Device) in JPEG format",
        "Business Proof (MSME / GST Certificate / MOA / Partnership Deed)",
        "TM Class Description (Goods/Services)",
        "Power of Attorney (TM-48)",
        "Prior Use Evidence (if claiming use before date)",
    ],
    "MSME / Udyam Registration": [
        "Aadhaar Card of Proprietor / Director / Partner",
        "PAN Card",
        "GSTIN (if applicable)",
        "Bank Account Details",
        "Business Address Proof",
        "NIC Code (Business Activity)",
    ],
    "Accounting & Bookkeeping": [
        "Bank Statements (All accounts)",
        "Sales Invoices",
        "Purchase Invoices",
        "Expense Vouchers / Bills",
        "Payroll Details (if employees)",
        "Loan Statements",
        "Credit Card Statements (if any)",
        "Opening Balance Sheet / Previous Year Data",
    ],
    "Payroll Processing": [
        "Employee Details (Name, PAN, Aadhaar, Bank Account)",
        "Salary Structure / CTC Breakup",
        "Attendance Records",
        "Leave Records",
        "ESI & PF Registration Numbers",
        "Professional Tax Registration",
        "Investment Declarations (Form 12BB)",
    ],
    "FEMA / RBI Compliance": [
        "PAN Card",
        "Certificate of Incorporation",
        "MOA & AOA",
        "Foreign Inward Remittance Certificate (FIRC)",
        "Valuation Report",
        "CS Certificate",
        "Board Resolution for Foreign Investment",
        "Form FC-GPR / FC-TRS (as applicable)",
    ],
    "DSC (Digital Signature Certificate)": [
        "PAN Card",
        "Aadhaar Card",
        "Passport Size Photograph",
        "Mobile Number (linked to Aadhaar)",
        "Email ID",
        "Organisation Certificate (for Class-3 Org DSC)",
    ],
    "Other / Custom Service": [
        "PAN Card",
        "Aadhaar Card",
        "Address Proof",
        "Bank Account Details",
        "Photograph",
        "Any specific document advised by our team",
    ],
}

ALL_SERVICES = list(SERVICE_CHECKLISTS.keys())


# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class CompanyProfile(BaseModel):
    id: Optional[str] = None
    name: str
    address: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    gstin: str = ""
    pan: str = ""
    bank_account_name: str = ""
    bank_name: str = ""
    bank_account_no: str = ""
    bank_ifsc: str = ""
    logo_base64: Optional[str] = None
    signature_base64: Optional[str] = None
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = ""
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class QuotationItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit: str = "service"
    unit_price: float = 0.0
    amount: float = 0.0


class QuotationCreate(BaseModel):
    company_id: str
    lead_id: Optional[str] = None
    client_id: Optional[str] = None          # NEW: link to clients collection
    client_name: str
    client_address: str = ""
    client_email: str = ""
    client_phone: str = ""
    service: str
    subject: str = ""
    scope_of_work: List[str] = []
    items: List[QuotationItem] = []
    gst_rate: float = 18.0
    payment_terms: str = ""
    timeline: str = ""
    validity_days: int = 30
    advance_terms: str = ""
    extra_terms: List[str] = []
    notes: str = ""
    extra_checklist_items: List[str] = []
    status: str = "draft"


class QuotationOut(QuotationCreate):
    id: str
    quotation_no: str
    date: str
    created_by: str
    created_at: str
    updated_at: str
    subtotal: float
    gst_amount: float
    total: float


class EmailSendRequest(BaseModel):
    to_email: str
    subject: str = ""
    body: str = ""
    pdf_type: str = "quotation"  # "quotation" or "checklist"


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _safe_str(value: Any, max_len: int = 0) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.encode("latin-1", errors="replace").decode("latin-1")
    if max_len and len(text) > max_len:
        text = text[:max_len]
    return text


def _compute_item_amount(item: QuotationItem) -> float:
    return round(item.quantity * item.unit_price, 2)


def _compute_totals(items: List[QuotationItem], gst_rate: float):
    subtotal   = sum(i.amount for i in items)
    gst_amount = round(subtotal * gst_rate / 100, 2)
    total      = round(subtotal + gst_amount, 2)
    return subtotal, gst_amount, total


def _permission_ok(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {}
    )
    return bool(perms.get("can_create_quotations", False))


async def _next_qtn_number() -> str:
    year  = datetime.now().year
    count = await db.quotations.count_documents(
        {"quotation_no": {"$regex": f"/{year}$"}}
    )
    return f"QTN-{count + 1:03d}/{year}"


async def _update_lead_status_for_quotation(lead_id: str, new_status: str):
    if not lead_id:
        return
    try:
        from bson import ObjectId
        now = datetime.now(timezone.utc)
        update_payload = {"$set": {"status": new_status, "updated_at": now}}
        updated = False

        if ObjectId.is_valid(lead_id):
            result = await db.leads.update_one(
                {"_id": ObjectId(lead_id)}, update_payload
            )
            if result.matched_count > 0:
                updated = True

        if not updated:
            result = await db.leads.update_one(
                {"id": lead_id}, update_payload
            )
            if result.matched_count > 0:
                updated = True

        if not updated:
            logger.warning(f"Lead '{lead_id}' not found")

    except Exception as e:
        logger.warning(f"Could not update lead {lead_id} status: {e}")


def _extract_dominant_color_from_b64(logo_b64: str):
    FALLBACK = (13, 59, 102)
    if not logo_b64:
        return FALLBACK
    try:
        from PIL import Image
        import io as _io
        raw       = re.sub(r"^data:image/[^;]+;base64,", "", logo_b64)
        img_bytes = base64.b64decode(raw)
        img       = Image.open(_io.BytesIO(img_bytes)).convert("RGB")
        img       = img.resize((50, 50))
        pixels    = list(img.getdata())
        filtered  = [
            p for p in pixels
            if not (p[0] > 220 and p[1] > 220 and p[2] > 220)
            and not (p[0] < 30  and p[1] < 30  and p[2] < 30)
        ]
        if not filtered:
            return FALLBACK
        r = int(sum(p[0] for p in filtered) / len(filtered))
        g = int(sum(p[1] for p in filtered) / len(filtered))
        b = int(sum(p[2] for p in filtered) / len(filtered))
        return (r, g, b)
    except Exception as e:
        logger.warning(f"Dominant colour extraction failed: {e}")
        return FALLBACK


def _lighten(color: tuple, factor: float = 0.85) -> tuple:
    return tuple(int(c + (255 - c) * factor) for c in color)


def _darken(color: tuple, factor: float = 0.6) -> tuple:
    return tuple(int(c * factor) for c in color)


def _safe_pdf_output(pdf: FPDF) -> BytesIO:
    """
    Return BytesIO object containing raw PDF bytes for fpdf2.
    fpdf2's output() method returns bytes directly.
    We write those bytes into a BytesIO buffer.
    """
    output_buffer = BytesIO()
    try:
        pdf_bytes = pdf.output()          # fpdf2 returns bytes
        output_buffer.write(pdf_bytes)
        output_buffer.seek(0)
        return output_buffer
    except Exception as e:
        logger.error(f"Error during PDF output: {e}")
        raise RuntimeError(f"PDF output failed: {e}")


def _embed_logo(pdf, logo_b64: str, x: float, y: float, h: float) -> None:
    if not logo_b64:
        return
    tmp_path = None
    try:
        raw = re.sub(r"^data:image/[^;]+;base64,", "", logo_b64)
        img_bytes = base64.b64decode(raw)
        suffix = ".jpg" if ("jpeg" in logo_b64[:30] or "jpg" in logo_b64[:30]) else ".png"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(img_bytes)
        tmp.close()
        tmp_path = tmp.name
        pdf.image(tmp_path, x=x, y=y, h=h)
    except Exception as e:
        logger.warning(f"Logo embed failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


def _cell(pdf, w, h, txt="", border=0, align="L", fill=False, nl=False):
    pdf.cell(w, h, txt, border, 1 if nl else 0, align, fill)


def _mcell(pdf, w, h, txt, border=0, align="L", fill=False):
    pdf.multi_cell(w, h, txt, border, align, fill)


# ═══════════════════════════════════════════════════════════════════════════════
# PDF BUILDER – QUOTATION
# ═══════════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS — hex color, amount in words (needed by PDF builder)
# ═══════════════════════════════════════════════════════════════════════════════

_ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
         'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
         'Seventeen','Eighteen','Nineteen']
_TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']


def _hex_to_rgb(hex_color: str) -> tuple:
    """Convert a CSS hex color string to an (R, G, B) tuple."""
    try:
        h = hex_color.strip().lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return (13, 59, 102)


def _amount_in_words(n: float) -> str:
    try:
        rupees = int(n)
        paise = round((n - rupees) * 100)

        def _grp(num):
            if num == 0: return ""
            if num < 20: return _ONES[num] + " "
            if num < 100: return _TENS[num // 10] + (" " + _ONES[num % 10] if num % 10 else "") + " "
            return _ONES[num // 100] + " Hundred " + _grp(num % 100)

        def _convert(num):
            if num == 0: return "Zero "
            r = ""
            cr = num // 10_000_000; num %= 10_000_000
            lk = num // 100_000; num %= 100_000
            th = num // 1000; num %= 1000
            if cr: r += _grp(cr) + "Crore "
            if lk: r += _grp(lk) + "Lakh "
            if th: r += _grp(th) + "Thousand "
            r += _grp(num)
            return r

        r = _convert(rupees).strip()
        p = f" and {_convert(paise).strip()} Paise" if paise else ""
        return f"Rupees {r}{p} Only"
    except Exception:
        return f"Rupees {n:.2f} Only"


# ═══════════════════════════════════════════════════════════════════════════════
# PDF BUILDER – QUOTATION  (matches Invoice PDF layout exactly)
# ═══════════════════════════════════════════════════════════════════════════════

def _build_quotation_pdf(q: dict, company: dict) -> BytesIO:
    # ── Resolve brand color from quotation/company settings → default
    raw_color = (
        q.get("invoice_custom_color")
        or company.get("invoice_custom_color")
        or company.get("brand_color")
        or "#0D3B66"
    )
    BRAND = _hex_to_rgb(raw_color)
    BL    = _lighten(BRAND, 0.92)
    BD    = _darken(BRAND, 0.65)
    DARK  = (30, 41, 59)
    MUTED = (100, 116, 139)
    WHITE = (255, 255, 255)

    title_label = "Quotation"
    _q     = q
    _MUTED = MUTED

    class PDF(FPDF):
        def header(self): pass
        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*_MUTED)
            _cell(self, 0, 5,
                  _safe_str(f"This is a computer-generated document.  \u00b7  {_q.get('quotation_no','')}  \u00b7  Page {self.page_no()}"),
                  align="C", nl=True)

    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    MARGIN    = 14
    CONTENT_W = pdf.w - MARGIN * 2

    # ══════════════════════════════════════════════════════
    # HEADER BAND — full-width coloured rectangle
    # ══════════════════════════════════════════════════════
    HEADER_H = 44
    pdf.set_fill_color(*BRAND)
    pdf.rect(0, 0, pdf.w, HEADER_H, "F")

    # Logo (top-left)
    if company.get("logo_base64"):
        _embed_logo(pdf, company["logo_base64"], x=MARGIN, y=7, h=16)
        logo_offset = 20
    else:
        logo_offset = 0

    # Company info — left column
    pdf.set_xy(MARGIN + logo_offset, 7)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*WHITE)
    _cell(pdf, CONTENT_W * 0.55, 6, _safe_str(company.get("name", "")), nl=True)

    pdf.set_x(MARGIN + logo_offset)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(210, 225, 245)

    addr_lines = _safe_str(company.get("address", ""))
    if addr_lines:
        _mcell(pdf, CONTENT_W * 0.55, 4, addr_lines)
        pdf.set_x(MARGIN + logo_offset)

    contact_parts = []
    if company.get("phone"): contact_parts.append(f"Ph: {company['phone']}")
    if company.get("email"): contact_parts.append(company["email"])
    if contact_parts:
        _cell(pdf, CONTENT_W * 0.55, 4, _safe_str("  \u00b7  ".join(contact_parts)), nl=True)
        pdf.set_x(MARGIN + logo_offset)

    if company.get("gstin"):
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*WHITE)
        _cell(pdf, CONTENT_W * 0.55, 4, _safe_str(f"GSTIN: {company['gstin']}"), nl=True)
    if company.get("pan"):
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(210, 225, 245)
        pdf.set_x(MARGIN + logo_offset)
        _cell(pdf, CONTENT_W * 0.55, 4, _safe_str(f"PAN: {company['pan']}"), nl=True)

    # Document type — right column
    right_col_x = MARGIN + CONTENT_W * 0.60
    right_col_w = CONTENT_W * 0.40

    pdf.set_xy(right_col_x, 7)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*WHITE)
    _cell(pdf, right_col_w, 10, title_label, align="R", nl=True)

    pdf.set_x(right_col_x)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(210, 225, 245)
    qtn_no = q.get("quotation_no", "")
    _cell(pdf, right_col_w, 5, _safe_str(f"# {qtn_no}"), align="R", nl=True)

    pdf.set_x(right_col_x)
    _cell(pdf, right_col_w, 5, _safe_str(f"Date: {q.get('date', '')}"), align="R", nl=True)

    # ══════════════════════════════════════════════════════
    # PREPARED FOR / VALIDITY — two-column section
    # ══════════════════════════════════════════════════════
    info_y = HEADER_H + 5
    pdf.set_xy(MARGIN, info_y)

    bill_w = CONTENT_W * 0.56
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*MUTED)
    _cell(pdf, bill_w, 5, "PREPARED FOR", nl=True)

    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    _cell(pdf, bill_w, 6, _safe_str(q.get("client_name", ""), 50), nl=True)

    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    if q.get("client_address"):
        _mcell(pdf, bill_w, 4, _safe_str(q["client_address"], 90))
        pdf.set_x(MARGIN)

    contact_c = []
    if q.get("client_phone"): contact_c.append(q["client_phone"])
    if q.get("client_email"): contact_c.append(q["client_email"])
    if contact_c:
        _cell(pdf, bill_w, 4, _safe_str("  \u00b7  ".join(contact_c)), nl=True)

    if q.get("client_gstin"):
        pdf.set_x(MARGIN)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*DARK)
        _cell(pdf, bill_w, 4, _safe_str(f"GSTIN: {q['client_gstin']}"), nl=True)

    # Right: Validity block
    due_x = MARGIN + CONTENT_W * 0.62
    due_w = CONTENT_W * 0.38
    pdf.set_xy(due_x, info_y)

    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*MUTED)
    _cell(pdf, due_w, 5, "VALIDITY", align="R", nl=True)

    pdf.set_x(due_x)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*DARK)
    _cell(pdf, due_w, 7, _safe_str(f"{q.get('validity_days', 30)} Days"), align="R", nl=True)

    pdf.set_x(due_x)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    _cell(pdf, due_w, 5, _safe_str(q.get("payment_terms", "As per terms")), align="R", nl=True)

    if q.get("subject"):
        pdf.set_x(due_x)
        _cell(pdf, due_w, 5, _safe_str(f"Re: {q['subject']}", 50), align="R", nl=True)

    is_inter = q.get("is_interstate", False)
    supply_label = "Interstate (IGST)" if is_inter else "Intrastate (CGST+SGST)"
    pdf.set_x(due_x)
    _cell(pdf, due_w, 5, _safe_str(supply_label), align="R", nl=True)

    # Divider
    div_y = max(pdf.get_y(), info_y + 30) + 2
    pdf.set_draw_color(*_lighten(BRAND, 0.70))
    pdf.set_line_width(0.3)
    pdf.line(MARGIN, div_y, MARGIN + CONTENT_W, div_y)
    pdf.set_line_width(0.2)

    # ══════════════════════════════════════════════════════
    # ITEMS TABLE (same layout as invoice)
    # ══════════════════════════════════════════════════════
    table_y = div_y + 3
    pdf.set_xy(MARGIN, table_y)

    sr_w   = 7
    hsn_w  = 20
    qty_w  = 13
    disc_w = 13
    rate_w = 24
    amt_w  = 26
    tax_w  = 18
    n_tax_cols = 1 if is_inter else 2
    desc_w = CONTENT_W - sr_w - hsn_w - qty_w - disc_w - rate_w - tax_w * n_tax_cols - amt_w

    def _th(txt, w, a="C"):
        pdf.set_fill_color(*BRAND)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 7)
        _cell(pdf, w, 7, txt, align=a, fill=True, nl=False)

    _th("Sr",          sr_w)
    _th("Description", desc_w, "L")
    _th("HSN/SAC",     hsn_w)
    _th("Qty",         qty_w)
    _th("Disc%",       disc_w)
    _th("Rate",        rate_w, "R")
    if is_inter:
        _th("IGST%",   tax_w)
    else:
        _th("CGST%",   tax_w)
        _th("SGST%",   tax_w)
    _th("Amount",      amt_w, "R")
    _cell(pdf, 0, 0, "", nl=True)

    items = q.get("items", []) or []

    # Compute item-level GST
    gst_rate = float(q.get("gst_rate", 18))
    computed_items = []
    for it in items:
        qty   = float(it.get("quantity", 1))
        price = float(it.get("unit_price", 0))
        disc_pct = float(it.get("discount_pct", 0))
        item_gst = float(it.get("gst_rate", gst_rate))
        disc = price * qty * disc_pct / 100
        taxable = round(price * qty - disc, 2)
        if is_inter:
            igst = round(taxable * item_gst / 100, 2)
            computed_items.append({**it, "taxable_value": taxable, "cgst_rate": 0, "sgst_rate": 0,
                "igst_rate": item_gst, "cgst_amount": 0, "sgst_amount": 0, "igst_amount": igst,
                "total_amount": round(taxable + igst, 2), "discount_pct": disc_pct})
        else:
            half = item_gst / 2
            cgst = round(taxable * half / 100, 2)
            sgst = round(taxable * half / 100, 2)
            computed_items.append({**it, "taxable_value": taxable, "cgst_rate": half, "sgst_rate": half,
                "igst_rate": 0, "cgst_amount": cgst, "sgst_amount": sgst, "igst_amount": 0,
                "total_amount": round(taxable + cgst + sgst, 2), "discount_pct": disc_pct})

    for idx, it in enumerate(computed_items, 1):
        row_bg = BL if idx % 2 == 0 else WHITE
        pdf.set_fill_color(*row_bg)
        pdf.set_text_color(*DARK)
        pdf.set_font("Helvetica", "", 7.5)

        _cell(pdf, sr_w,   7, str(idx),                                          align="C", fill=True, nl=False)
        _cell(pdf, desc_w, 7, _safe_str(it.get("description", ""), 42),          align="L", fill=True, nl=False)
        _cell(pdf, hsn_w,  7, _safe_str(str(it.get("hsn_sac", ""))[:12]),        align="C", fill=True, nl=False)
        _cell(pdf, qty_w,  7, f"{float(it.get('quantity', 1)):.2f}",             align="C", fill=True, nl=False)
        _cell(pdf, disc_w, 7, f"{float(it.get('discount_pct', 0)):.1f}%",        align="C", fill=True, nl=False)
        _cell(pdf, rate_w, 7, f"Rs.{float(it.get('unit_price', 0)):,.2f}",       align="R", fill=True, nl=False)
        if is_inter:
            _cell(pdf, tax_w, 7, f"{float(it.get('igst_rate', 0)):.1f}%",        align="C", fill=True, nl=False)
        else:
            _cell(pdf, tax_w, 7, f"{float(it.get('cgst_rate', 0)):.1f}%",        align="C", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{float(it.get('sgst_rate', 0)):.1f}%",        align="C", fill=True, nl=False)
        _cell(pdf, amt_w,  7, f"Rs.{float(it.get('total_amount', 0)):,.2f}",     align="R", fill=True, nl=True)

        # Sub-detail line
        sub_parts = []
        if it.get("item_details"): sub_parts.append(_safe_str(it["item_details"]))
        if it.get("unit"):         sub_parts.append(_safe_str(it["unit"]))
        if sub_parts:
            pdf.set_x(MARGIN + sr_w)
            pdf.set_font("Helvetica", "I", 6.5)
            pdf.set_text_color(*MUTED)
            pdf.set_fill_color(*row_bg)
            sub_w = desc_w + hsn_w + qty_w + disc_w + rate_w + tax_w * n_tax_cols + amt_w
            _cell(pdf, sub_w, 4, _safe_str("  ".join(sub_parts)), align="L", fill=True, nl=True)

    # ══════════════════════════════════════════════════════
    # TOTALS BLOCK
    # ══════════════════════════════════════════════════════
    subtotal      = sum(float(it.get("unit_price", 0)) * float(it.get("quantity", 1)) for it in computed_items)
    total_discount = sum(float(it.get("unit_price", 0)) * float(it.get("quantity", 1)) * float(it.get("discount_pct", 0)) / 100 for it in computed_items)
    total_taxable = sum(float(it.get("taxable_value", 0)) for it in computed_items)
    total_cgst    = sum(float(it.get("cgst_amount", 0)) for it in computed_items)
    total_sgst    = sum(float(it.get("sgst_amount", 0)) for it in computed_items)
    total_igst    = sum(float(it.get("igst_amount", 0)) for it in computed_items)
    total_gst     = round(total_cgst + total_sgst + total_igst, 2)
    grand_total   = round(total_taxable + total_gst, 2)

    def _trow(label, value, bold=False, strike=False):
        bg = BRAND if bold else BL
        tc = WHITE if bold else DARK
        pdf.set_fill_color(*bg)
        pdf.set_text_color(*tc)
        pdf.set_font("Helvetica", "B" if bold else "", 8 if not bold else 9)
        _cell(pdf, CONTENT_W - amt_w, 7, label, align="R", fill=True, nl=False)
        prefix = "-Rs." if strike else "Rs."
        val_str = f"{prefix}{abs(float(value)):,.2f}"
        _cell(pdf, amt_w, 7, val_str, align="R", fill=True, nl=True)

    pdf.set_x(MARGIN)
    _trow("Subtotal", subtotal)
    if total_discount > 0:
        _trow("Discount", total_discount, strike=True)
    _trow("Taxable Value", total_taxable)

    tt = total_taxable or 1
    if is_inter:
        igst_pct = round(total_igst / tt * 100, 1)
        _trow(f"IGST ({igst_pct:.1f}%)", total_igst)
    else:
        cgst_pct = round(total_cgst / tt * 100, 1)
        sgst_pct = round(total_sgst / tt * 100, 1)
        _trow(f"CGST ({cgst_pct:.1f}%)", total_cgst)
        _trow(f"SGST ({sgst_pct:.1f}%)", total_sgst)

    _trow("GRAND TOTAL", grand_total, bold=True)

    # Amount in words
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*MUTED)
    _cell(pdf, CONTENT_W, 5, _safe_str(_amount_in_words(grand_total)), nl=True)

    # ══════════════════════════════════════════════════════
    # GST SUMMARY
    # ══════════════════════════════════════════════════════
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 5, "GST Summary", nl=True)
    pdf.set_draw_color(*_lighten(BRAND, 0.70))
    pdf.line(MARGIN, pdf.get_y(), MARGIN + CONTENT_W, pdf.get_y())
    pdf.ln(1)

    from typing import Dict as _Dict
    gst_sum: _Dict[float, _Dict[str, float]] = {}
    for it in computed_items:
        r = float(it.get("gst_rate", it.get("cgst_rate", 0) * 2 if not is_inter else it.get("igst_rate", 0)))
        if is_inter:
            r = float(it.get("igst_rate", gst_rate))
        else:
            r = float(it.get("cgst_rate", 0)) * 2
        if r not in gst_sum:
            gst_sum[r] = {"taxable": 0.0, "cgst": 0.0, "sgst": 0.0, "igst": 0.0}
        gst_sum[r]["taxable"] += float(it.get("taxable_value", 0))
        gst_sum[r]["cgst"]    += float(it.get("cgst_amount",   0))
        gst_sum[r]["sgst"]    += float(it.get("sgst_amount",   0))
        gst_sum[r]["igst"]    += float(it.get("igst_amount",   0))

    g_w = CONTENT_W / 5
    pdf.set_fill_color(*BRAND)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 7.5)
    for col_hdr in ["GST Rate", "Taxable Amt", "CGST", "SGST / IGST", "Total GST"]:
        _cell(pdf, g_w, 6, col_hdr, align="C", fill=True, nl=False)
    _cell(pdf, 0, 0, "", nl=True)

    pdf.set_font("Helvetica", "", 7.5)
    for i, (rate, row) in enumerate(sorted(gst_sum.items())):
        pdf.set_fill_color(*(BL if i % 2 == 0 else WHITE))
        pdf.set_text_color(*DARK)
        gst_tot = row["cgst"] + row["sgst"] + row["igst"]
        _cell(pdf, g_w, 6, f"{rate:.1f}%",              align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"Rs.{row['taxable']:,.2f}", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"Rs.{row['cgst']:,.2f}",    align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"Rs.{row['sgst'] or row['igst']:,.2f}", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"Rs.{gst_tot:,.2f}",        align="C", fill=True, nl=True)

    # ══════════════════════════════════════════════════════
    # BANK DETAILS
    # ══════════════════════════════════════════════════════
    if company.get("bank_account_no") or company.get("bank_name"):
        pdf.ln(5)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*BRAND)
        _cell(pdf, 0, 5, "Bank Details for Payment", nl=True)
        pdf.set_draw_color(*_lighten(BRAND, 0.70))
        pdf.line(MARGIN, pdf.get_y(), MARGIN + CONTENT_W, pdf.get_y())
        pdf.ln(1)
        half_w = CONTENT_W / 2
        for lbl, val in [
            ("Account Name", company.get("bank_account_name", "")),
            ("Bank Name",    company.get("bank_name",          "")),
            ("Account No",   company.get("bank_account_no",    "")),
            ("IFSC Code",    company.get("bank_ifsc",          "")),
        ]:
            pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*DARK)
            _cell(pdf, half_w * 0.42, 5, _safe_str(f"{lbl}:"), nl=False)
            pdf.set_font("Helvetica", "", 8)
            _cell(pdf, half_w * 0.58, 5, _safe_str(val), nl=True)

    # ══════════════════════════════════════════════════════
    # TERMS & NOTES
    # ══════════════════════════════════════════════════════
    terms_text = "\n".join(q.get("extra_terms", []))
    notes_text = q.get("notes", "")
    if terms_text or notes_text:
        pdf.ln(5)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*BRAND)
        _cell(pdf, 0, 5, "Terms & Notes", nl=True)
        pdf.set_draw_color(*_lighten(BRAND, 0.70))
        pdf.line(MARGIN, pdf.get_y(), MARGIN + CONTENT_W, pdf.get_y())
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*DARK)
        if terms_text:
            _mcell(pdf, CONTENT_W, 4, _safe_str(terms_text))
        if notes_text:
            _mcell(pdf, CONTENT_W, 4, _safe_str(f"Note: {notes_text}"))

    # ══════════════════════════════════════════════════════
    # SIGNATURE — bottom-right
    # ══════════════════════════════════════════════════════
    pdf.ln(8)
    sig_y   = pdf.get_y()
    sig_x   = MARGIN + CONTENT_W - 58
    sig_w   = 55

    sig_b64 = company.get("signature_base64", "")
    if sig_b64:
        _embed_logo(pdf, sig_b64, x=sig_x, y=sig_y, h=14)
        sig_y += 16

    pdf.set_draw_color(*BRAND)
    pdf.set_line_width(0.4)
    pdf.line(sig_x, sig_y, sig_x + sig_w, sig_y)
    pdf.set_line_width(0.2)

    pdf.set_xy(sig_x, sig_y + 1)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*DARK)
    _cell(pdf, sig_w, 5, _safe_str(f"For {company.get('name', '')}"), align="C", nl=True)

    pdf.set_x(sig_x)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*MUTED)
    _cell(pdf, sig_w, 4, "Authorised Signatory", align="C", nl=True)

    # ── Output
    buf = BytesIO()
    buf.write(pdf.output())
    buf.seek(0)
    return buf

def _build_checklist_pdf(q: dict, company: dict) -> BytesIO:
    BRAND      = _extract_dominant_color_from_b64(company.get("logo_base64", ""))
    BRAND_DARK = _darken(BRAND, 0.7)
    BRAND_LITE = _lighten(BRAND, 0.88)
    DARK_TEXT  = (30, 41, 59)
    MUTED      = (100, 116, 139)
    WHITE      = (255, 255, 255)

    _q     = q
    _MUTED = MUTED

    class PDF(FPDF):
        def header(self):
            pass

        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*_MUTED)
            _cell(self, 0, 5, _safe_str(f"Document Checklist - {_q.get('client_name', '')}  |  Page {self.page_no()}"), align="C", nl=True)

    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    W = pdf.w - 28

    # ── Logo ──────────────────────────────────────────────────────────────────
    _embed_logo(pdf, company.get("logo_base64", ""), x=14, y=12, h=16)

    pdf.set_xy(14, 30)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*BRAND_DARK)
    _cell(pdf, 0, 6, _safe_str(company.get("name", "")), nl=True)

    # ── Title band ────────────────────────────────────────────────────────────
    band_y = 50
    pdf.set_fill_color(*BRAND)
    pdf.rect(14, band_y, W, 10, "F")
    pdf.set_xy(14, band_y + 1.5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*WHITE)
    _cell(pdf, W, 7, "DOCUMENT CHECKLIST", align="C", nl=True)

    # ── Client info block ─────────────────────────────────────────────────────
    pdf.set_xy(14, band_y + 14)
    pdf.set_fill_color(*BRAND_LITE)
    pdf.rect(14, band_y + 14, W, 20, "F")
    pdf.set_xy(16, band_y + 16)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*DARK_TEXT)
    _cell(pdf, W / 2, 5, _safe_str(f"Client Name: {q.get('client_name', '')}"), nl=False)
    _cell(pdf, W / 2, 5, _safe_str(f"Date: {q.get('date', '')}"), align="R", nl=True)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 9)
    _cell(pdf, W / 2, 5, _safe_str(f"Service: {q.get('service', '')}"), nl=False)
    _cell(pdf, W / 2, 5, _safe_str(f"Ref: {q.get('quotation_no', '')}"), align="R", nl=True)
    pdf.set_x(16)
    pdf.set_text_color(*MUTED)
    pdf.set_font("Helvetica", "I", 8)
    _cell(
        pdf, 0, 4,
        "All documents must be self-attested. Originals may be required for verification.",
        nl=True
    )

    # ── Document list ─────────────────────────────────────────────────────────
    service   = q.get("service", "Other / Custom Service")
    base_docs = SERVICE_CHECKLISTS.get(service, SERVICE_CHECKLISTS["Other / Custom Service"])
    extras    = q.get("extra_checklist_items", []) or []
    all_docs  = base_docs + extras

    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 6, "Required Documents", nl=True)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
    pdf.ln(2)

    col_sr   = 12
    col_recv = 22
    col_rem  = 28
    col_doc  = W - col_sr - col_recv - col_rem

    # Table header
    pdf.set_fill_color(*BRAND)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 8)
    _cell(pdf, col_sr,   7, "Sr.",           align="C", fill=True, nl=False)
    _cell(pdf, col_doc,  7, "Document Name",             fill=True, nl=False)
    _cell(pdf, col_recv, 7, "Received",      align="C", fill=True, nl=False)
    _cell(pdf, col_rem,  7, "Remarks",                   fill=True, nl=True)

    # Table rows
    for idx, doc_name in enumerate(all_docs, 1):
        fill_color = BRAND_LITE if idx % 2 == 0 else WHITE
        pdf.set_fill_color(*fill_color)
        pdf.set_text_color(*DARK_TEXT)
        pdf.set_font("Helvetica", "", 8)
        _cell(pdf, col_sr,   8, str(idx),                          align="C", fill=True,          nl=False)
        _cell(pdf, col_doc,  8, _safe_str(doc_name, max_len=60),               fill=True,          nl=False)
        _cell(pdf, col_recv, 8, "",                                align="C", fill=True, border=1, nl=False)
        _cell(pdf, col_rem,  8, "",                                            fill=True, border=1, nl=True)

    # ── Sign-off ──────────────────────────────────────────────────────────────
    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*DARK_TEXT)
    half = W / 2
    _cell(pdf, half, 5, "Checked By: _______________________", nl=False)
    _cell(pdf, half, 5, "Signature: _______________________", align="R", nl=True)

    # ── Client confirmation block ─────────────────────────────────────────────
    pdf.ln(10)
    confirm_y = pdf.get_y()
    pdf.set_fill_color(*BRAND_LITE)
    pdf.rect(14, confirm_y, W, 22, "F")
    pdf.set_xy(16, confirm_y + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 5, "Client Confirmation", nl=True)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK_TEXT)
    _cell(pdf, 0, 5, "I confirm that the above documents have been submitted / will be submitted.", nl=True)
    pdf.set_x(16)
    _cell(pdf, 0, 5, "", nl=True)
    pdf.set_x(16)
    _cell(pdf, 0, 5, "Client Signature: _________________________       Date: ______________", nl=True)

    return _safe_pdf_output(pdf)


# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def _send_email_with_pdf(
    smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str,
    from_name: str, to_email: str, subject: str, body: str,
    pdf_bytes: bytes, filename: str
):
    msg = MIMEMultipart()
    msg["From"] = f"{from_name} <{smtp_user}>" if from_name else smtp_user
    msg["To"]   = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    part = MIMEBase("application", "pdf")
    part.set_payload(pdf_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)


# ═══════════════════════════════════════════════════════════════════════════════
# COMPANY ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/companies")
async def create_company(data: dict, current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id":                str(uuid.uuid4()),
        "name":              data.get("name", "").strip(),
        "address":           data.get("address", ""),
        "phone":             data.get("phone", ""),
        "email":             data.get("email", ""),
        "website":           data.get("website", ""),
        "gstin":             data.get("gstin", ""),
        "pan":               data.get("pan", ""),
        "has_gst":           bool(data.get("has_gst", True)),
        "bank_account_name": data.get("bank_account_name", ""),
        "bank_name":         data.get("bank_name", ""),
        "bank_account_no":   data.get("bank_account_no", ""),
        "bank_ifsc":         data.get("bank_ifsc", ""),
        "logo_base64":       data.get("logo_base64"),
        "signature_base64":  data.get("signature_base64"),
        "smtp_host":         data.get("smtp_host", ""),
        "smtp_port":         int(data.get("smtp_port", 587)),
        "smtp_user":         data.get("smtp_user", ""),
        "smtp_password":     data.get("smtp_password", ""),
        "smtp_from_name":    data.get("smtp_from_name", ""),
        "created_by":        current_user.id,
        "created_at":        now,
    }
    if not doc["name"]:
        raise HTTPException(400, "Company name is required")
    await db.companies.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/companies")
async def get_companies(current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    query = {} if current_user.role == "admin" else {"created_by": current_user.id}
    companies = await db.companies.find(query, {"_id": 0}).to_list(500)
    return companies


@router.put("/companies/{company_id}")
async def update_company(
    company_id: str, data: dict,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    existing = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Company not found")
    if current_user.role != "admin" and existing.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    allowed = [
        "name", "address", "phone", "email", "website", "gstin", "pan",
        "has_gst",
        "bank_account_name", "bank_name", "bank_account_no", "bank_ifsc",
        "logo_base64", "signature_base64",
        "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from_name",
    ]
    update = {k: data[k] for k in allowed if k in data and data[k] is not None}
    await db.companies.update_one({"id": company_id}, {"$set": update})
    updated = await db.companies.find_one({"id": company_id}, {"_id": 0})
    return updated


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    existing = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Company not found")
    if current_user.role != "admin" and existing.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    await db.companies.delete_one({"id": company_id})
    return {"message": "Company deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# QUOTATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/quotations/next-number")
async def get_next_quotation_number(current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    return {"number": await _next_qtn_number()}


@router.get("/quotations/services")
async def get_services(_: User = Depends(get_current_user)):
    return {"services": ALL_SERVICES, "checklists": SERVICE_CHECKLISTS}


@router.post("/quotations")
async def create_quotation(
    data: QuotationCreate,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")

    computed_items = []
    for item in data.items:
        item.amount = _compute_item_amount(item)
        computed_items.append(item)

    subtotal, gst_amount, total = _compute_totals(computed_items, data.gst_rate)
    now    = datetime.now(timezone.utc).isoformat()
    qtn_no = await _next_qtn_number()

    doc = {
        "id":           str(uuid.uuid4()),
        "quotation_no": qtn_no,
        "date":         date.today().isoformat(),
        **data.model_dump(),
        "items":        [i.model_dump() for i in computed_items],
        "subtotal":     subtotal,
        "gst_amount":   gst_amount,
        "total":        total,
        "created_by":   current_user.id,
        "created_at":   now,
        "updated_at":   now,
    }
    await db.quotations.insert_one(doc)
    doc.pop("_id", None)

    if data.lead_id:
        await _update_lead_status_for_quotation(data.lead_id, "proposal")

    return doc


@router.get("/quotations")
async def list_quotations(
    status:  Optional[str] = None,
    service: Optional[str] = None,
    lead_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")

    query: Dict[str, Any] = {}
    if current_user.role != "admin":
        query["created_by"] = current_user.id
    if status:
        query["status"] = status
    if service:
        query["service"] = service
    if lead_id:
        query["lead_id"] = lead_id

    quotations = await db.quotations.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return quotations


@router.get("/quotations/{quotation_id}")
async def get_quotation(quotation_id: str, current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    q = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    if current_user.role != "admin" and q.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    return q


@router.put("/quotations/{quotation_id}")
async def update_quotation(
    quotation_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    existing = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Quotation not found")
    if current_user.role != "admin" and existing.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")

    items_raw = data.get("items", existing.get("items", []))
    items = []
    for i in items_raw:
        if isinstance(i, dict):
            item = QuotationItem(**i)
            item.amount = _compute_item_amount(item)
            items.append(item)

    gst_rate = float(data.get("gst_rate", existing.get("gst_rate", 18)))
    subtotal, gst_amount, total = _compute_totals(items, gst_rate)

    data["items"]      = [i.model_dump() for i in items]
    data["subtotal"]   = subtotal
    data["gst_amount"] = gst_amount
    data["total"]      = total
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    for f in ["id", "quotation_no", "created_by", "created_at"]:
        data.pop(f, None)

    await db.quotations.update_one({"id": quotation_id}, {"$set": data})

    new_status = data.get("status")
    lead_id    = data.get("lead_id") or existing.get("lead_id")
    if lead_id and new_status:
        if new_status == "sent":
            await _update_lead_status_for_quotation(lead_id, "proposal")
        elif new_status == "accepted":
            await _update_lead_status_for_quotation(lead_id, "negotiation")

    updated = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    return updated


@router.delete("/quotations/{quotation_id}")
async def delete_quotation(quotation_id: str, current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    existing = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Quotation not found")
    if current_user.role != "admin" and existing.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    await db.quotations.delete_one({"id": quotation_id})
    return {"message": "Quotation deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# PDF EXPORT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/quotations/{quotation_id}/pdf")


# ═══════════════════════════════════════════════════════════════════════════════
# PDF EXPORT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/quotations/{quotation_id}/pdf")
async def export_quotation_pdf(
    quotation_id: str,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")

    q = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    if current_user.role != "admin" and q.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")

    company = await db.companies.find_one({"id": q.get("company_id")}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company profile not found. Please add a company profile first.")

    try:
        pdf_buf = _build_quotation_pdf(q, company)
    except Exception as e:
        logger.error(f"Quotation PDF build failed for {quotation_id}: {e}", exc_info=True)
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    pdf_bytes = pdf_buf.getvalue()

    # Company name prefix in filename
    company_prefix = (company.get("name", "") or "").strip().replace(" ", "_").replace("/", "_").replace("\\", "_")
    safe_qtn_no = (q.get("quotation_no", quotation_id) or quotation_id).replace("/", "-").replace("\\", "-")
    filename = f"{company_prefix}_Quotation_{safe_qtn_no}.pdf" if company_prefix else f"Quotation_{safe_qtn_no}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-cache",
        },
    )


@router.get("/quotations/{quotation_id}/checklist-pdf")
async def export_checklist_pdf(
    quotation_id: str,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")

    q = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    if current_user.role != "admin" and q.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")

    company = await db.companies.find_one({"id": q.get("company_id")}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company profile not found. Please add a company profile first.")

    try:
        pdf_buf = _build_checklist_pdf(q, company)
    except Exception as e:
        logger.error(f"Checklist PDF build failed for {quotation_id}: {e}", exc_info=True)
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    pdf_bytes = pdf_buf.getvalue()

    company_prefix = (company.get("name", "") or "").strip().replace(" ", "_").replace("/", "_").replace("\\", "_")
    safe_qtn_no = (q.get("quotation_no", quotation_id) or quotation_id).replace("/", "-").replace("\\", "-")
    filename = f"{company_prefix}_Checklist_{safe_qtn_no}.pdf" if company_prefix else f"Checklist_{safe_qtn_no}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-cache",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL SEND ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/quotations/{quotation_id}/send-email")
async def send_quotation_email(
    quotation_id: str,
    req: EmailSendRequest,
    current_user: User = Depends(get_current_user)
):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")

    q = await db.quotations.find_one({"id": quotation_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    if current_user.role != "admin" and q.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")

    company = await db.companies.find_one({"id": q.get("company_id")}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company profile not found")

    smtp_host = company.get("smtp_host", "").strip()
    smtp_user = company.get("smtp_user", "").strip()
    smtp_pass = company.get("smtp_password", "").strip()
    if not smtp_host or not smtp_user or not smtp_pass:
        raise HTTPException(
            400,
            "SMTP not configured. Please add SMTP settings to the company profile."
        )

    # Company name prefix in filename
    company_prefix = (company.get("name", "") or "").strip().replace(" ", "_").replace("/", "_").replace("\\", "_")
    safe_qtn_no = (q.get("quotation_no", quotation_id) or quotation_id).replace("/", "-").replace("\\", "-")

    try:
        if req.pdf_type == "checklist":
            pdf_buf  = _build_checklist_pdf(q, company)
            filename = f"{company_prefix}_Checklist_{safe_qtn_no}.pdf" if company_prefix else f"Checklist_{safe_qtn_no}.pdf"
        else:
            pdf_buf  = _build_quotation_pdf(q, company)
            filename = f"{company_prefix}_Quotation_{safe_qtn_no}.pdf" if company_prefix else f"Quotation_{safe_qtn_no}.pdf"
    except Exception as e:
        logger.error(f"PDF build failed for email: {e}", exc_info=True)
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    subject = req.subject or f"Quotation {q.get('quotation_no', '')} from {company.get('name', '')}"
    body    = req.body or (
        f"Dear {q.get('client_name', 'Sir/Madam')},\n\n"
        f"Please find attached our quotation {q.get('quotation_no', '')} "
        f"for {q.get('service', '')}.\n\n"
        f"Total Amount: Rs. {q.get('total', 0):,.2f}\n\n"
        f"Validity: {q.get('validity_days', 30)} days\n\n"
        f"Regards,\n{company.get('name', '')}"
    )

    try:
        _send_email_with_pdf(
            smtp_host=smtp_host,
            smtp_port=int(company.get("smtp_port", 587)),
            smtp_user=smtp_user,
            smtp_password=smtp_pass,
            from_name=company.get("smtp_from_name", company.get("name", "")),
            to_email=req.to_email,
            subject=subject,
            body=body,
            pdf_bytes=pdf_buf.getvalue(),
            filename=filename,
        )
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(400, "SMTP authentication failed. Check username/password in company profile.")
    except Exception as e:
        logger.error(f"Email send failed: {e}", exc_info=True)
        raise HTTPException(500, f"Email send failed: {str(e)}")

    return {"message": f"Email sent successfully to {req.to_email}"}
