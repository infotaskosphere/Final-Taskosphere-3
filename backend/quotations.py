"""
backend/quotations.py
─────────────────────────────────────────────────────────────────────────────
Quotation Module — FastAPI Router

Bug fixes in this version:
  1. PDF 500 error: pdf.output() in fpdf2 v2+ returns bytearray directly.
     Old code used pdf.output(dest="S").encode("latin1") which is deprecated
     and causes a 500 on some fpdf2 builds. Fixed to bytes(pdf.output()).
  2. Lead status not updating: _update_lead_status_for_quotation now tries
     BOTH {"_id": ObjectId(lead_id)} AND {"id": lead_id} so it works
     regardless of whether the caller stored the ObjectId string or the uuid.
"""

import uuid
import logging
import re
import base64
import tempfile
import os
from datetime import datetime, timezone, date
from io import BytesIO
from typing import List, Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user, require_admin
from backend.models import User

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
    "Income Tax Return (ITR) – Individual": [
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
    "Income Tax Return (ITR) – Business": [
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
        "DSC (Digital Signature Certificate) – will be applied",
        "DIN (Director Identification Number) – will be applied",
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
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class QuotationItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit: str = "service"
    unit_price: float = 0.0
    amount: float = 0.0        # computed = quantity × unit_price


class QuotationCreate(BaseModel):
    company_id: str
    lead_id: Optional[str] = None      # link to lead pipeline
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


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _compute_item_amount(item: QuotationItem) -> float:
    """Compute amount = quantity × unit_price."""
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
    """
    Auto-update the linked lead's pipeline status.

    Mapping:
      quotation created / sent → lead "proposal"
      quotation accepted       → lead "negotiation"

    BUG FIX: tries BOTH ObjectId (_id) AND uuid string (id) lookups so it
    works regardless of which field was stored as lead_id.
    """
    if not lead_id:
        return
    try:
        from bson import ObjectId
        now = datetime.now(timezone.utc)
        update_payload = {"$set": {"status": new_status, "updated_at": now}}

        updated = False

        # Try 1: lead_id is the string form of MongoDB _id (ObjectId)
        if ObjectId.is_valid(lead_id):
            result = await db.leads.update_one(
                {"_id": ObjectId(lead_id)}, update_payload
            )
            if result.matched_count > 0:
                updated = True
                logger.info(f"Lead {lead_id} status → {new_status} (via _id)")

        # Try 2: lead_id is the uuid "id" field
        if not updated:
            result = await db.leads.update_one(
                {"id": lead_id}, update_payload
            )
            if result.matched_count > 0:
                updated = True
                logger.info(f"Lead {lead_id} status → {new_status} (via id)")

        if not updated:
            logger.warning(
                f"_update_lead_status_for_quotation: "
                f"lead '{lead_id}' not found in either _id or id field"
            )

    except Exception as e:
        logger.warning(
            f"Could not update lead {lead_id} status to {new_status}: {e}"
        )


def _extract_dominant_color_from_b64(logo_b64: str):
    """
    Extract the dominant non-white colour from a base64 logo using Pillow.
    Returns an (R, G, B) tuple. Falls back to deep blue if anything fails.
    """
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

        pixels   = list(img.getdata())
        filtered = [
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


def _safe_pdf_output(pdf) -> bytes:
    """
    ─── BUG FIX ───────────────────────────────────────────────────────────────
    fpdf2 v2.x changed pdf.output() to return bytearray directly.
    The old pattern pdf.output(dest="S").encode("latin1") is deprecated and
    raises errors on some builds. This helper works with all fpdf2 versions.
    """
    result = pdf.output()
    if isinstance(result, (bytes, bytearray)):
        return bytes(result)
    # Legacy fpdf (very old): result is a string
    return result.encode("latin1")


# ═══════════════════════════════════════════════════════════════════════════════
# PDF BUILDER – QUOTATION
# ═══════════════════════════════════════════════════════════════════════════════

def _build_quotation_pdf(q: dict, company: dict) -> BytesIO:
    """
    Build a professional quotation PDF using fpdf2.
    Brand colour auto-detected from company logo via Pillow.
    Items table includes Qty, Unit, Unit Price, Amount columns.
    """
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    BRAND      = _extract_dominant_color_from_b64(company.get("logo_base64", ""))
    BRAND_DARK = _darken(BRAND, 0.7)
    BRAND_LITE = _lighten(BRAND, 0.88)
    DARK_TEXT  = (30, 41, 59)
    MUTED      = (100, 116, 139)
    WHITE      = (255, 255, 255)

    NL   = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}
    CONT = {"new_x": XPos.RIGHT,   "new_y": YPos.TOP}

    class PDF(FPDF):
        def header(self): pass
        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*MUTED)
            self.cell(
                0, 5,
                f"Quotation No: {q.get('quotation_no', '')}  |  Page {self.page_no()}",
                align="C",
            )

    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    W = pdf.w - 28   # usable width (14 mm margins each side)

    # ── Logo ─────────────────────────────────────────────────────────────────
    logo_b64 = company.get("logo_base64", "")
    if logo_b64:
        try:
            raw = re.sub(r"^data:image/[^;]+;base64,", "", logo_b64)
            img_bytes = base64.b64decode(raw)
            suffix = ".png" if "png" in logo_b64[:30] else ".jpg"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(img_bytes)
            tmp.close()
            pdf.image(tmp.name, x=14, y=12, h=18)
            os.unlink(tmp.name)
        except Exception as e:
            logger.warning(f"Logo embed failed: {e}")

    # ── Company block ────────────────────────────────────────────────────────
    pdf.set_xy(14, 32)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*BRAND_DARK)
    pdf.cell(0, 6, company.get("name", ""), **NL)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    if company.get("address"):
        pdf.multi_cell(W // 2, 4, company.get("address", ""))
    contact_parts = []
    if company.get("phone"):   contact_parts.append(f"Ph: {company['phone']}")
    if company.get("email"):   contact_parts.append(f"E: {company['email']}")
    if company.get("website"): contact_parts.append(company["website"])
    if contact_parts:
        pdf.cell(0, 4, "  |  ".join(contact_parts), **NL)
    if company.get("gstin"):
        pdf.cell(0, 4, f"GSTIN: {company['gstin']}", **NL)

    # ── QUOTATION Title band ─────────────────────────────────────────────────
    band_y = 62
    pdf.set_fill_color(*BRAND)
    pdf.rect(14, band_y, W, 10, "F")
    pdf.set_xy(14, band_y + 1.5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*WHITE)
    pdf.cell(W, 7, "QUOTATION", align="C", **NL)

    # ── Meta row ─────────────────────────────────────────────────────────────
    pdf.set_xy(14, band_y + 13)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*DARK_TEXT)
    pdf.cell(W / 2, 5, f"Quotation No: {q.get('quotation_no', '')}", **CONT)
    pdf.cell(W / 2, 5, f"Date: {q.get('date', '')}", align="R", **NL)
    pdf.set_xy(14, pdf.get_y())
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4, f"Valid for {q.get('validity_days', 30)} days from date of issue", **NL)

    # ── Client block ─────────────────────────────────────────────────────────
    cl_y = pdf.get_y() + 4
    pdf.set_fill_color(*BRAND_LITE)
    pdf.rect(14, cl_y, W, 26, "F")
    pdf.set_xy(16, cl_y + 2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*BRAND)
    pdf.cell(0, 5, "Prepared For:", **NL)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK_TEXT)
    pdf.cell(0, 5, q.get("client_name", ""), **NL)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    if q.get("client_address"):
        pdf.cell(0, 4, str(q.get("client_address", ""))[:80], **NL)
    if q.get("client_email") or q.get("client_phone"):
        pdf.set_x(16)
        parts = []
        if q.get("client_phone"): parts.append(q["client_phone"])
        if q.get("client_email"): parts.append(q["client_email"])
        pdf.cell(0, 4, "  |  ".join(parts), **NL)

    # ── Subject ──────────────────────────────────────────────────────────────
    pdf.set_xy(14, cl_y + 30)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*DARK_TEXT)
    subject = q.get("subject") or f"Quotation for {q.get('service', '')}"
    pdf.cell(0, 5, f"Subject: {subject}", **NL)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        W, 5,
        "Dear Sir / Madam,\n"
        "Thank you for your inquiry. We are pleased to submit our quotation as under:"
    )

    # ── Scope of Work ────────────────────────────────────────────────────────
    scope = q.get("scope_of_work", [])
    if scope:
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*BRAND)
        pdf.cell(0, 6, "Scope of Work / Services", **NL)
        pdf.set_draw_color(*BRAND)
        pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*DARK_TEXT)
        for item in scope:
            pdf.cell(6, 5, "-", **CONT)
            pdf.cell(0, 5, str(item), **NL)

    # ── Items Table (Qty / Unit / Unit Price / Amount) ───────────────────────
    items = q.get("items", [])
    if items:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*BRAND)
        pdf.cell(0, 6, "Quotation Details", **NL)
        pdf.set_draw_color(*BRAND)
        pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
        pdf.ln(1)

        sr_w     = 10
        desc_w   = W - 10 - 18 - 22 - 30 - 30
        qty_w    = 18
        unit_w   = 22
        uprice_w = 30
        amt_w    = 30

        # Header
        pdf.set_fill_color(*BRAND)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(sr_w,     7, "Sr.",          align="C", fill=True, **CONT)
        pdf.cell(desc_w,   7, "Description",             fill=True, **CONT)
        pdf.cell(qty_w,    7, "Qty",          align="C", fill=True, **CONT)
        pdf.cell(unit_w,   7, "Unit",         align="C", fill=True, **CONT)
        pdf.cell(uprice_w, 7, "Unit Price",   align="R", fill=True, **CONT)
        pdf.cell(amt_w,    7, "Amount (Rs)",  align="R", fill=True, **NL)

        # Rows
        for idx, item in enumerate(items, 1):
            fill_color = BRAND_LITE if idx % 2 == 0 else WHITE
            pdf.set_fill_color(*fill_color)
            pdf.set_text_color(*DARK_TEXT)
            pdf.set_font("Helvetica", "", 8)
            desc   = str(item.get("description", ""))[:55]
            qty    = item.get("quantity", 1)
            unit   = str(item.get("unit", "service"))[:10]
            uprice = item.get("unit_price", 0)
            amt    = item.get("amount", 0)
            pdf.cell(sr_w,     7, str(idx),              align="C", fill=True, **CONT)
            pdf.cell(desc_w,   7, desc,                              fill=True, **CONT)
            pdf.cell(qty_w,    7, str(qty),              align="C", fill=True, **CONT)
            pdf.cell(unit_w,   7, unit,                  align="C", fill=True, **CONT)
            pdf.cell(uprice_w, 7, f"Rs. {uprice:,.2f}",  align="R", fill=True, **CONT)
            pdf.cell(amt_w,    7, f"Rs. {amt:,.2f}",     align="R", fill=True, **NL)

        non_amt_w = sr_w + desc_w + qty_w + unit_w + uprice_w

        # Sub Total
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(*BRAND_LITE)
        pdf.set_text_color(*DARK_TEXT)
        pdf.cell(non_amt_w, 7, "Sub Total", align="R", fill=True, **CONT)
        pdf.cell(amt_w, 7, f"Rs. {q.get('subtotal', 0):,.2f}", align="R", fill=True, **NL)

        # GST
        gst_rate = q.get("gst_rate", 18)
        if gst_rate and float(gst_rate) > 0:
            pdf.cell(non_amt_w, 7, f"GST @ {gst_rate}%", align="R", fill=True, **CONT)
            pdf.cell(amt_w, 7, f"Rs. {q.get('gst_amount', 0):,.2f}", align="R", fill=True, **NL)

        # Total
        pdf.set_fill_color(*BRAND)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(non_amt_w, 8, "TOTAL PAYABLE", align="R", fill=True, **CONT)
        pdf.cell(amt_w, 8, f"Rs. {q.get('total', 0):,.2f}", align="R", fill=True, **NL)

    # ── Terms & Conditions ───────────────────────────────────────────────────
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BRAND)
    pdf.cell(0, 6, "Terms & Conditions", **NL)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK_TEXT)

    terms = []
    if q.get("payment_terms"):
        terms.append(f"1. Payment Terms: {q['payment_terms']}")
    if q.get("timeline"):
        terms.append(f"2. Timeline: {q['timeline']}")
    terms.append(f"3. Validity of Quotation: {q.get('validity_days', 30)} days")
    terms.append("4. Additional work will be charged separately.")
    if q.get("advance_terms"):
        terms.append(f"5. Advance: {q['advance_terms']}")
    for i, t in enumerate(q.get("extra_terms", []), len(terms) + 1):
        terms.append(f"{i}. {t}")
    for term in terms:
        pdf.multi_cell(W, 5, str(term))

    # ── Bank Details ─────────────────────────────────────────────────────────
    if company.get("bank_account_no") or company.get("bank_name"):
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*BRAND)
        pdf.cell(0, 6, "Bank Details", **NL)
        pdf.set_draw_color(*BRAND)
        pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
        pdf.ln(1)
        pdf.set_text_color(*DARK_TEXT)
        half = W / 2
        for label, val in [
            ("Account Name", company.get("bank_account_name", "")),
            ("Bank Name",    company.get("bank_name", "")),
            ("Account No",   company.get("bank_account_no", "")),
            ("IFSC Code",    company.get("bank_ifsc", "")),
        ]:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(half * 0.45, 5, f"{label}:", **CONT)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(half * 0.55, 5, str(val), **NL)

    # ── Signature ────────────────────────────────────────────────────────────
    pdf.ln(8)
    sig_b64 = company.get("signature_base64", "")
    if sig_b64:
        try:
            raw = re.sub(r"^data:image/[^;]+;base64,", "", sig_b64)
            img_bytes = base64.b64decode(raw)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.write(img_bytes)
            tmp.close()
            pdf.image(tmp.name, x=14, y=pdf.get_y(), h=14)
            pdf.ln(16)
            os.unlink(tmp.name)
        except Exception:
            pdf.ln(14)
    else:
        pdf.ln(14)

    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 80, pdf.get_y())
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*DARK_TEXT)
    pdf.cell(0, 5, f"For {company.get('name', 'Company')}", **NL)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4, "Authorized Signatory", **NL)
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 4, "We look forward to working with you.", **NL)

    if q.get("notes"):
        pdf.ln(4)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(W, 4, f"Note: {q['notes']}")

    # ── BUG FIX: use _safe_pdf_output instead of .output(dest="S").encode() ──
    out = BytesIO()
    out.write(_safe_pdf_output(pdf))
    out.seek(0)
    return out


# ═══════════════════════════════════════════════════════════════════════════════
# PDF BUILDER – CHECKLIST
# ═══════════════════════════════════════════════════════════════════════════════

def _build_checklist_pdf(q: dict, company: dict) -> BytesIO:
    """Build a document checklist PDF. Brand colour from logo via Pillow."""
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    BRAND      = _extract_dominant_color_from_b64(company.get("logo_base64", ""))
    BRAND_DARK = _darken(BRAND, 0.7)
    BRAND_LITE = _lighten(BRAND, 0.88)
    DARK_TEXT  = (30, 41, 59)
    MUTED      = (100, 116, 139)
    WHITE      = (255, 255, 255)

    NL   = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}
    CONT = {"new_x": XPos.RIGHT,   "new_y": YPos.TOP}

    class PDF(FPDF):
        def header(self): pass
        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*MUTED)
            self.cell(
                0, 5,
                f"Document Checklist – {q.get('client_name', '')}  |  Page {self.page_no()}",
                align="C",
            )

    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    W = pdf.w - 28

    logo_b64 = company.get("logo_base64", "")
    if logo_b64:
        try:
            raw = re.sub(r"^data:image/[^;]+;base64,", "", logo_b64)
            img_bytes = base64.b64decode(raw)
            suffix = ".png" if "png" in logo_b64[:30] else ".jpg"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(img_bytes)
            tmp.close()
            pdf.image(tmp.name, x=14, y=12, h=16)
            os.unlink(tmp.name)
        except Exception as e:
            logger.warning(f"Checklist logo embed failed: {e}")

    pdf.set_xy(14, 30)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*BRAND_DARK)
    pdf.cell(0, 6, company.get("name", ""), **NL)

    band_y = 50
    pdf.set_fill_color(*BRAND)
    pdf.rect(14, band_y, W, 10, "F")
    pdf.set_xy(14, band_y + 1.5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*WHITE)
    pdf.cell(W, 7, "DOCUMENT CHECKLIST", align="C", **NL)

    pdf.set_xy(14, band_y + 14)
    pdf.set_fill_color(*BRAND_LITE)
    pdf.rect(14, band_y + 14, W, 20, "F")
    pdf.set_xy(16, band_y + 16)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*DARK_TEXT)
    pdf.cell(W / 2, 5, f"Client Name: {q.get('client_name', '')}", **CONT)
    pdf.cell(W / 2, 5, f"Date: {q.get('date', '')}", align="R", **NL)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(W / 2, 5, f"Service: {q.get('service', '')}", **CONT)
    pdf.cell(W / 2, 5, f"Ref: {q.get('quotation_no', '')}", align="R", **NL)
    pdf.set_x(16)
    pdf.set_text_color(*MUTED)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 4, "All documents must be self-attested. Originals may be required for verification.", **NL)

    service   = q.get("service", "Other / Custom Service")
    base_docs = SERVICE_CHECKLISTS.get(service, SERVICE_CHECKLISTS["Other / Custom Service"])
    extras    = q.get("extra_checklist_items", [])
    all_docs  = base_docs + extras

    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BRAND)
    pdf.cell(0, 6, "Required Documents", **NL)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
    pdf.ln(2)

    col_sr   = 12
    col_doc  = W - 62
    col_recv = 22
    col_rem  = W - col_sr - col_doc - col_recv

    pdf.set_fill_color(*BRAND)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(col_sr,   7, "Sr.",           align="C", fill=True, **CONT)
    pdf.cell(col_doc,  7, "Document Name",            fill=True, **CONT)
    pdf.cell(col_recv, 7, "Received",      align="C", fill=True, **CONT)
    pdf.cell(col_rem,  7, "Remarks",                  fill=True, **NL)

    for idx, doc_name in enumerate(all_docs, 1):
        fill_color = BRAND_LITE if idx % 2 == 0 else WHITE
        pdf.set_fill_color(*fill_color)
        pdf.set_text_color(*DARK_TEXT)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(col_sr,   8, str(idx),           align="C", fill=True,         **CONT)
        pdf.cell(col_doc,  8, str(doc_name)[:60],            fill=True,         **CONT)
        pdf.cell(col_recv, 8, "",                 align="C", fill=True, border=1, **CONT)
        pdf.cell(col_rem,  8, "",                            fill=True, border=1, **NL)

    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*DARK_TEXT)
    half = W / 2
    pdf.cell(half, 5, "Checked By: _______________________", **CONT)
    pdf.cell(half, 5, "Signature: _______________________", align="R", **NL)

    pdf.ln(10)
    confirm_y = pdf.get_y()
    pdf.set_fill_color(*BRAND_LITE)
    pdf.rect(14, confirm_y, W, 22, "F")
    pdf.set_xy(16, confirm_y + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*BRAND)
    pdf.cell(0, 5, "Client Confirmation", **NL)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK_TEXT)
    pdf.cell(0, 5, "I confirm that the above documents have been submitted / will be submitted.", **NL)
    pdf.set_x(16)
    pdf.cell(0, 5, "", **NL)
    pdf.set_x(16)
    pdf.cell(0, 5, "Client Signature: _________________________       Date: ______________", **NL)

    # ── BUG FIX: use _safe_pdf_output ────────────────────────────────────────
    out = BytesIO()
    out.write(_safe_pdf_output(pdf))
    out.seek(0)
    return out


# ═══════════════════════════════════════════════════════════════════════════════
# COMPANY ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/companies")
async def create_company(data: dict, current_user: User = Depends(get_current_user)):
    if not _permission_ok(current_user):
        raise HTTPException(403, "Quotation module access denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id":                  str(uuid.uuid4()),
        "name":                data.get("name", "").strip(),
        "address":             data.get("address", ""),
        "phone":               data.get("phone", ""),
        "email":               data.get("email", ""),
        "website":             data.get("website", ""),
        "gstin":               data.get("gstin", ""),
        "pan":                 data.get("pan", ""),
        "bank_account_name":   data.get("bank_account_name", ""),
        "bank_name":           data.get("bank_name", ""),
        "bank_account_no":     data.get("bank_account_no", ""),
        "bank_ifsc":           data.get("bank_ifsc", ""),
        "logo_base64":         data.get("logo_base64"),
        "signature_base64":    data.get("signature_base64"),
        "created_by":          current_user.id,
        "created_at":          now,
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
        "bank_account_name", "bank_name", "bank_account_no", "bank_ifsc",
        "logo_base64", "signature_base64",
    ]
    update = {k: data[k] for k in allowed if k in data}
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

    # Recompute each item's amount = quantity × unit_price
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

    # Auto-update linked lead to "proposal"
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

    # Recompute items if provided
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

    # ── Auto-update linked lead based on new quotation status ────────────────
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
        logger.error(
            f"Quotation PDF build failed for {quotation_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    filename = f"quotation_{q.get('quotation_no', quotation_id).replace('/', '-')}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type":        "application/pdf",
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
        logger.error(
            f"Checklist PDF build failed for {quotation_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    filename = f"checklist_{q.get('quotation_no', quotation_id).replace('/', '-')}.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type":        "application/pdf",
        },
    )
