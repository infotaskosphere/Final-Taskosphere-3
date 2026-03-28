"""
invoicing.py
──────────────────────────────────────────────────────────────────────────────
Full Invoicing & Billing Module — FastAPI Router
PDF FIX: Use pdf.output() which returns bytes in fpdf2,
         then buf.write(bytes). The old dest=BytesIO is not valid in fpdf2.
Features:
  - Product / Service catalog with HSN/SAC codes
  - GST-compliant invoices (CGST+SGST or IGST)
  - Proforma / Estimate invoices
  - Payment recording with multiple payment modes
  - Credit notes against invoices
  - Convert Quotation → Invoice
  - Recurring invoice scheduler
  - Revenue dashboard stats
  - PDF export (Indian GST invoice format)
  - Deep integration with Clients, Leads, Quotations
  - Email invoice sending with PDF attachment (SMTP)
"""
import uuid
import sqlite3  # Add this near 'import uuid'
import logging
import re
import base64
import tempfile
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from datetime import datetime, timezone, date, timedelta
from io import BytesIO
from typing import List, Optional, Literal, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from backend.dependencies import db, get_current_user
from backend.models import User
try:
    from fpdf import FPDF
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2"])
    from fpdf import FPDF
logger = logging.getLogger(__name__)
router = APIRouter(tags=["Invoicing"])
# ─── Constants ────────────────────────────────────────────────────────────────
GST_RATES = [0.0, 5.0, 12.0, 18.0, 28.0]
UNITS = ["service","nos","kg","ltr","mtr","sqft","hr","day","month","year","set","lot","pcs","box"]
PAYMENT_MODES = ["cash","cheque","neft","rtgs","imps","upi","card","other"]
INV_STATUS = ["draft","sent","partially_paid","paid","overdue","cancelled","credit_note"]
# ─── Number formatters ─────────────────────────────────────────────────────────
_ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
         "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen",
         "Eighteen","Nineteen"]
_TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
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
            result = ""
            crore = num // 10_000_000; num %= 10_000_000
            lakh = num // 100_000; num %= 100_000
            thou = num // 1000; num %= 1000
            hund = num
            if crore: result += _grp(crore) + "Crore "
            if lakh: result += _grp(lakh) + "Lakh "
            if thou: result += _grp(thou) + "Thousand "
            result += _grp(hund)
            return result
        r = _convert(rupees).strip()
        p = f" and {_convert(paise).strip()} Paise" if paise else ""
        return f"Rupees {r}{p} Only"
    except Exception:
        return f"Rupees {n:.2f} Only"
# ─── Permission helper ─────────────────────────────────────────────────────────
def _perm(user: User) -> bool:
    if user.role == "admin": return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_create_quotations", False) or perms.get("can_manage_invoices", False))
# ─── Next invoice number ────────────────────────────────────────────────────────
async def _next_invoice_no(prefix: str = "INV") -> str:
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    fy_label = f"{fy_start % 100:02d}-{(fy_start + 1) % 100:02d}"
    count = await db.invoices.count_documents(
        {"invoice_no": {"$regex": f"^{prefix}-"}}
    )
    return f"{prefix}-{count + 1:04d}/{fy_label}"
async def _load_firm_from_vyp(file_path: str):
    """
    Parses the SQLite .vyp file to extract firm/company details.
    """
    try:
        conn = sqlite3.connect(file_path)
        conn.row_factory = sqlite3.Row  # This allows accessing columns by name
        cursor = conn.cursor()
        
        # Query the table found in your snippet
        cursor.execute("SELECT * FROM kb_firms LIMIT 1")
        row = cursor.fetchone()
        
        if row:
            # Mapping your database columns to the ERP's company format
            firm_data = {
                "name": row["firm_name"],
                "email": row["firm_email"],
                "phone": row["firm_phone"],
                "address": row["firm_address"],
                "gstin": row["firm_gstin_number"],
                "bank_name": row["firm_bank_name"],
                "bank_account_no": row["firm_bank_account_number"],
                "bank_ifsc": row["firm_bank_ifsc_code"],
                "bank_account_name": row["firm_name"] # Usually same as firm name
            }
            conn.close()
            return firm_data
        conn.close()
    except Exception as e:
        logger.error(f"Failed to parse .vyp file: {e}")
    return None
# ─── Email invoice sender ─────────────────────────────────────────────────────
def _send_email(to_email: str, subject: str, html_body: str, pdf_bytes: bytes, filename: str, company_email: str):
    """
    Sends invoice PDF as email attachment via SMTP (TLS).
    Configuration via environment variables:
      SMTP_SERVER, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD
    """
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = company_email or os.getenv("DEFAULT_FROM_EMAIL", "noreply@yourcompany.com")

    if not smtp_user or not smtp_password:
        logger.error("SMTP credentials not configured in environment variables")
        raise HTTPException(500, "Email service not configured")

    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject

    msg.attach(MIMEText(html_body, "html"))

    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    try:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(from_email, to_email, msg.as_string())
        server.quit()
        logger.info(f"Invoice email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise HTTPException(500, f"Email sending failed: {str(e)}")
# ─── Safe PDF string ────────────────────────────────────────────────────────────
def _s(v, maxl=0):
    if v is None: return ""
    t = str(v).encode("latin-1", errors="replace").decode("latin-1")
    return t[:maxl] if maxl and len(t) > maxl else t
def _cell(pdf, w, h, txt="", border=0, align="L", fill=False, nl=False):
    pdf.cell(w, h, txt, border, 1 if nl else 0, align, fill)
def _mcell(pdf, w, h, txt, border=0, align="L", fill=False):
    pdf.multi_cell(w, h, txt, border, align, fill)
def _embed_logo(pdf, logo_b64, x, y, h):
    if not logo_b64: return
    tmp_path = None
    try:
        raw = re.sub(r"^data:image/[^;]+;base64,", "", logo_b64)
        img_bytes = base64.b64decode(raw)
        suffix = ".png" if "png" in logo_b64[:30] else ".jpg"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(img_bytes); tmp.close(); tmp_path = tmp.name
        pdf.image(tmp_path, x=x, y=y, h=h)
    except Exception as e:
        logger.warning(f"Logo embed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except: pass
def _lighten(c, f=0.88): return tuple(int(x + (255 - x) * f) for x in c)
def _darken(c, f=0.65): return tuple(int(x * f) for x in c)
# ════════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ════════════════════════════════════════════════════════════════════════════════
class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    hsn_sac: Optional[str] = None
    unit: str = "service"
    unit_price: float = 0.0
    gst_rate: float = 18.0
    category: Optional[str] = None
    is_service: bool = True
class Product(ProductCreate):
    id: str
    created_by: str
    created_at: str
class InvoiceItem(BaseModel):
    product_id: Optional[str] = None
    description: str
    hsn_sac: Optional[str] = None
    quantity: float = 1.0
    unit: str = "service"
    unit_price: float = 0.0
    discount_pct: float = 0.0
    taxable_value: float = 0.0
    gst_rate: float = 18.0
    cgst_rate: float = 9.0
    sgst_rate: float = 9.0
    igst_rate: float = 0.0
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    igst_amount: float = 0.0
    total_amount: float = 0.0
class InvoiceCreate(BaseModel):
    invoice_type: Literal["tax_invoice","proforma","estimate","credit_note","debit_note"] = "tax_invoice"
    company_id: str
    client_id: Optional[str] = None
    lead_id: Optional[str] = None
    quotation_id: Optional[str] = None
    client_name: str
    client_address: str = ""
    client_email: str = ""
    client_phone: str = ""
    client_gstin: str = ""
    client_state: str = ""
    invoice_date: str = ""
    due_date: str = ""
    supply_state: str = ""
    is_interstate: bool = False
    items: List[InvoiceItem] = []
    gst_rate: float = 18.0
    discount_amount: float = 0.0
    shipping_charges: float = 0.0
    other_charges: float = 0.0
    payment_terms: str = "Due on receipt"
    notes: str = ""
    terms_conditions: str = ""
    reference_no: str = ""
    is_recurring: bool = False
    recurrence_pattern: Literal["monthly","quarterly","yearly"] = "monthly"
    recurrence_end: Optional[str] = None
    next_invoice_date: Optional[str] = None
    status: str = "draft"
    @field_validator("client_id", "lead_id", "quotation_id", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return None if v in ("", None) else v
class Invoice(InvoiceCreate):
    id: str
    invoice_no: str
    subtotal: float = 0.0
    total_discount: float = 0.0
    total_taxable: float = 0.0
    total_cgst: float = 0.0
    total_sgst: float = 0.0
    total_igst: float = 0.0
    total_gst: float = 0.0
    grand_total: float = 0.0
    amount_paid: float = 0.0
    amount_due: float = 0.0
    created_by: str
    created_at: str
    updated_at: str
class PaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_date: str
    payment_mode: str = "neft"
    reference_no: str = ""
    notes: str = ""
class Payment(PaymentCreate):
    id: str
    created_by: str
    created_at: str
class CreditNoteCreate(BaseModel):
    original_invoice_id: str
    company_id: str
    client_name: str
    reason: str
    items: List[InvoiceItem] = []
    notes: str = ""
# ════════════════════════════════════════════════════════════════════════════════
# CALCULATION ENGINE
# ════════════════════════════════════════════════════════════════════════════════
def _compute_item(item: InvoiceItem, is_interstate: bool) -> InvoiceItem:
    discount = round(item.unit_price * item.quantity * item.discount_pct / 100, 2)
    taxable = round(item.unit_price * item.quantity - discount, 2)
    gst = item.gst_rate
    if is_interstate:
        igst_amt = round(taxable * gst / 100, 2)
        item.cgst_rate = 0.0; item.sgst_rate = 0.0
        item.igst_rate = gst
        item.cgst_amount = 0.0; item.sgst_amount = 0.0; item.igst_amount = igst_amt
        item.total_amount = round(taxable + igst_amt, 2)
    else:
        half = gst / 2
        cgst_amt = round(taxable * half / 100, 2)
        sgst_amt = round(taxable * half / 100, 2)
        item.cgst_rate = half; item.sgst_rate = half; item.igst_rate = 0.0
        item.cgst_amount = cgst_amt; item.sgst_amount = sgst_amt; item.igst_amount = 0.0
        item.total_amount = round(taxable + cgst_amt + sgst_amt, 2)
    item.taxable_value = taxable
    return item
def _compute_invoice_totals(inv_data: dict) -> dict:
    items = inv_data.get("items", [])
    interstate = inv_data.get("is_interstate", False)
    computed = []
    for raw in items:
        if isinstance(raw, dict):
            it = InvoiceItem(**raw)
        else:
            it = raw
        it = _compute_item(it, interstate)
        computed.append(it.model_dump())
    subtotal = sum(i["unit_price"] * i["quantity"] for i in computed)
    total_discount = sum(i["unit_price"] * i["quantity"] * i["discount_pct"] / 100 for i in computed)
    total_taxable = sum(i["taxable_value"] for i in computed)
    total_cgst = sum(i["cgst_amount"] for i in computed)
    total_sgst = sum(i["sgst_amount"] for i in computed)
    total_igst = sum(i["igst_amount"] for i in computed)
    total_gst = round(total_cgst + total_sgst + total_igst, 2)
    shipping = float(inv_data.get("shipping_charges", 0))
    other = float(inv_data.get("other_charges", 0))
    discount_extra = float(inv_data.get("discount_amount", 0))
    grand_total = round(total_taxable + total_gst + shipping + other - discount_extra, 2)
    inv_data["items"] = computed
    inv_data["subtotal"] = round(subtotal, 2)
    inv_data["total_discount"] = round(total_discount + discount_extra, 2)
    inv_data["total_taxable"] = round(total_taxable, 2)
    inv_data["total_cgst"] = round(total_cgst, 2)
    inv_data["total_sgst"] = round(total_sgst, 2)
    inv_data["total_igst"] = round(total_igst, 2)
    inv_data["total_gst"] = total_gst
    inv_data["grand_total"] = grand_total
    return inv_data
# ════════════════════════════════════════════════════════════════════════════════
# PDF BUILDER — GST TAX INVOICE
# ════════════════════════════════════════════════════════════════════════════════
def _build_invoice_pdf(inv: dict, company: dict) -> BytesIO:
    BRAND = (13, 59, 102)
    BL = _lighten(BRAND, 0.90)
    BD = _darken(BRAND, 0.70)
    DARK = (30, 41, 59)
    MUTED = (100, 116, 139)
    WHITE = (255, 255, 255)
    RED = (220, 38, 38)
    GREEN = (22, 163, 74)
    _inv = inv
    _MUTED = MUTED
    inv_type_labels = {
        "tax_invoice": "TAX INVOICE",
        "proforma": "PROFORMA INVOICE",
        "estimate": "ESTIMATE",
        "credit_note": "CREDIT NOTE",
        "debit_note": "DEBIT NOTE",
    }
    title_label = inv_type_labels.get(inv.get("invoice_type", "tax_invoice"), "TAX INVOICE")
    is_cn = inv.get("invoice_type") == "credit_note"
    class PDF(FPDF):
        def header(self): pass
        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*_MUTED)
            _cell(self, 0, 5, _s(f"{title_label} · {_inv.get('invoice_no','')} · Page {self.page_no()}"), align="C", nl=True)
    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    W = pdf.w - 28 # 14mm margins
    # ── Header: logo + company + title band ───────────────────────────────────
    _embed_logo(pdf, company.get("logo_base64", ""), x=14, y=11, h=18)
    pdf.set_xy(14, 31)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*BD)
    _cell(pdf, 0, 6, _s(company.get("name", "")), nl=True)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    if company.get("address"):
        _mcell(pdf, W * 0.55, 4, _s(company["address"]))
    parts = []
    if company.get("phone"): parts.append(f"Ph: {company['phone']}")
    if company.get("email"): parts.append(company["email"])
    if company.get("website"): parts.append(company["website"])
    if parts: _cell(pdf, 0, 4, _s(" · ".join(parts)), nl=True)
    if company.get("gstin"):
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*DARK)
        _cell(pdf, 0, 4, _s(f"GSTIN: {company['gstin']}"), nl=True)
    if company.get("pan"):
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*MUTED)
        _cell(pdf, 0, 4, _s(f"PAN: {company['pan']}"), nl=True)
    # Title band
    band_y = 65
    band_c = RED if is_cn else BRAND
    pdf.set_fill_color(*band_c)
    pdf.rect(14, band_y, W, 10, "F")
    pdf.set_xy(14, band_y + 1.5)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*WHITE)
    _cell(pdf, W, 7, title_label, align="C", nl=True)
    # ── Invoice meta ───────────────────────────────────────────────────────────
    pdf.set_xy(14, band_y + 13)
    half = W / 2
    pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*DARK)
    _cell(pdf, half * 0.40, 5, "Invoice No:", nl=False)
    pdf.set_font("Helvetica", "", 8)
    _cell(pdf, half * 0.60, 5, _s(inv.get("invoice_no", "")), nl=False)
    pdf.set_font("Helvetica", "B", 8)
    _cell(pdf, half * 0.40, 5, "Invoice Date:", nl=False)
    pdf.set_font("Helvetica", "", 8)
    _cell(pdf, half * 0.60, 5, _s(inv.get("invoice_date", "")), nl=True)
    pdf.set_x(14)
    pdf.set_font("Helvetica", "B", 8)
    _cell(pdf, half * 0.40, 5, "Due Date:", nl=False)
    pdf.set_font("Helvetica", "", 8)
    _cell(pdf, half * 0.60, 5, _s(inv.get("due_date", "")), nl=False)
    pdf.set_font("Helvetica", "B", 8)
    _cell(pdf, half * 0.40, 5, "Supply Type:", nl=False)
    pdf.set_font("Helvetica", "", 8)
    _cell(pdf, half * 0.60, 5, "Interstate (IGST)" if inv.get("is_interstate") else "Intrastate (CGST+SGST)", nl=True)
    if inv.get("reference_no"):
        pdf.set_x(14)
        pdf.set_font("Helvetica", "B", 8)
        _cell(pdf, half * 0.40, 5, "Reference No:", nl=False)
        pdf.set_font("Helvetica", "", 8)
        _cell(pdf, half * 0.60, 5, _s(inv.get("reference_no", "")), nl=True)
    # ── Buyer details block ────────────────────────────────────────────────────
    bl_y = pdf.get_y() + 4
    pdf.set_fill_color(*BL)
    pdf.rect(14, bl_y, W, 24, "F")
    pdf.set_xy(16, bl_y + 2)
    pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 5, "Bill To:", nl=True)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "B", 11); pdf.set_text_color(*DARK)
    _cell(pdf, 0, 5, _s(inv.get("client_name", ""), 60), nl=True)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*MUTED)
    if inv.get("client_address"): _cell(pdf, 0, 4, _s(inv["client_address"], 80), nl=True)
    pdf.set_x(16)
    ct = []
    if inv.get("client_phone"): ct.append(inv["client_phone"])
    if inv.get("client_email"): ct.append(inv["client_email"])
    if ct: _cell(pdf, 0, 4, _s(" · ".join(ct)), nl=True)
    if inv.get("client_gstin"):
        pdf.set_x(16); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*DARK)
        _cell(pdf, 0, 4, _s(f"GSTIN: {inv['client_gstin']}"), nl=True)
    # ── Items table ────────────────────────────────────────────────────────────
    pdf.set_xy(14, bl_y + 28)
    pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 6, "Items / Services", nl=True)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
    pdf.ln(1)
    is_inter = inv.get("is_interstate", False)
    sr_w = 8
    hsn_w = 22
    qty_w = 14
    unit_w= 16
    rate_w= 26
    tax_w = 18
    amt_w = 26
    desc_w = W - sr_w - hsn_w - qty_w - unit_w - rate_w - (0 if is_inter else tax_w * 2) - (tax_w if is_inter else 0) - amt_w
    def _th(txt, w, a="C"):
        pdf.set_fill_color(*BRAND); pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 7)
        _cell(pdf, w, 7, txt, align=a, fill=True, nl=False)
    _th("Sr", sr_w)
    _th("Description", desc_w, "L")
    _th("HSN/SAC", hsn_w)
    _th("Qty", qty_w)
    _th("Unit", unit_w)
    _th("Rate", rate_w, "R")
    if is_inter:
        _th("IGST%", tax_w)
        _th("IGST Amt", amt_w, "R")
    else:
        _th("CGST%", tax_w)
        _th("CGST Amt", tax_w, "R")
        _th("SGST%", tax_w)
        _th("SGST Amt", tax_w, "R")
    _th("Amount", amt_w, "R")
    pdf.ln(0)
    _cell(pdf, 0, 0, "", nl=True)
    items = inv.get("items", [])
    for idx, it in enumerate(items, 1):
        fc = BL if idx % 2 == 0 else WHITE
        pdf.set_fill_color(*fc); pdf.set_text_color(*DARK)
        pdf.set_font("Helvetica", "", 7.5)
        desc = _s(it.get("description",""), 38)
        _cell(pdf, sr_w, 7, str(idx), align="C", fill=True, nl=False)
        _cell(pdf, desc_w, 7, desc, align="L", fill=True, nl=False)
        _cell(pdf, hsn_w, 7, _s(it.get("hsn_sac","")[:10]), align="C", fill=True, nl=False)
        _cell(pdf, qty_w, 7, f"{it.get('quantity',1):.2f}", align="C", fill=True, nl=False)
        _cell(pdf, unit_w, 7, _s(it.get("unit","")[:6]), align="C", fill=True, nl=False)
        _cell(pdf, rate_w, 7, f"{it.get('unit_price',0):,.2f}",align="R", fill=True, nl=False)
        if is_inter:
            _cell(pdf, tax_w, 7, f"{it.get('igst_rate',0):.1f}%", align="C", fill=True, nl=False)
            _cell(pdf, amt_w, 7, f"{it.get('igst_amount',0):,.2f}", align="R", fill=True, nl=False)
        else:
            _cell(pdf, tax_w, 7, f"{it.get('cgst_rate',0):.1f}%", align="C", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{it.get('cgst_amount',0):,.2f}", align="R", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{it.get('sgst_rate',0):.1f}%", align="C", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{it.get('sgst_amount',0):,.2f}", align="R", fill=True, nl=False)
        _cell(pdf, amt_w, 7, f"{it.get('total_amount',0):,.2f}", align="R", fill=True, nl=True)
    # ── Totals block ───────────────────────────────────────────────────────────
    lbl_w = W - amt_w
    pdf.set_font("Helvetica", "", 8); pdf.set_fill_color(*BL); pdf.set_text_color(*DARK)
    def _trow(label, value, bold=False, color=None):
        fc = BRAND if bold else BL
        tc = WHITE if bold else (color or DARK)
        pdf.set_fill_color(*fc); pdf.set_text_color(*tc)
        pdf.set_font("Helvetica", "B" if bold else "", 8 if not bold else 9)
        _cell(pdf, lbl_w, 7, label, align="R", fill=True, nl=False)
        _cell(pdf, amt_w, 7, f"Rs. {float(value):,.2f}", align="R", fill=True, nl=True)
    _trow("Subtotal:", inv.get("subtotal", 0))
    if inv.get("total_discount", 0): _trow("Discount:", inv.get("total_discount", 0))
    _trow("Taxable Value:", inv.get("total_taxable", 0))
    if is_inter:
        _trow("IGST:", inv.get("total_igst", 0))
    else:
        _trow("CGST:", inv.get("total_cgst", 0))
        _trow("SGST:", inv.get("total_sgst", 0))
    if inv.get("shipping_charges", 0): _trow("Shipping:", inv.get("shipping_charges", 0))
    if inv.get("other_charges", 0): _trow("Other Charges:", inv.get("other_charges", 0))
    _trow("GRAND TOTAL:", inv.get("grand_total", 0), bold=True)
    # Amount in words
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 8); pdf.set_text_color(*MUTED)
    _cell(pdf, 0, 5, _s(_amount_in_words(float(inv.get("grand_total", 0)))), nl=True)
    # ── GST summary table ───────────────────────────────────────────────────────
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 5, "GST Summary", nl=True)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y()); pdf.ln(1)
    gst_sum: Dict[float, Dict[str, float]] = {}
    for it in items:
        r = float(it.get("gst_rate", 18))
        if r not in gst_sum: gst_sum[r] = {"taxable": 0, "cgst": 0, "sgst": 0, "igst": 0}
        gst_sum[r]["taxable"] += float(it.get("taxable_value", 0))
        gst_sum[r]["cgst"] += float(it.get("cgst_amount", 0))
        gst_sum[r]["sgst"] += float(it.get("sgst_amount", 0))
        gst_sum[r]["igst"] += float(it.get("igst_amount", 0))
    g_w = W / 5
    pdf.set_fill_color(*BRAND); pdf.set_text_color(*WHITE); pdf.set_font("Helvetica", "B", 7.5)
    for h in ["GST Rate", "Taxable Amt", "CGST", "SGST / IGST", "Total GST"]:
        _cell(pdf, g_w, 6, h, align="C", fill=True, nl=False)
    _cell(pdf, 0, 0, "", nl=True)
    pdf.set_font("Helvetica", "", 7.5)
    for i, (rate, row) in enumerate(sorted(gst_sum.items())):
        pdf.set_fill_color(*(BL if i % 2 == 0 else WHITE)); pdf.set_text_color(*DARK)
        gst_tot = row["cgst"] + row["sgst"] + row["igst"]
        _cell(pdf, g_w, 6, f"{rate:.1f}%", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"{row['taxable']:,.2f}", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"{row['cgst']:,.2f}", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"{row['sgst'] or row['igst']:,.2f}", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"{gst_tot:,.2f}", align="C", fill=True, nl=True)
    # ── Bank details ────────────────────────────────────────────────────────────
    if company.get("bank_account_no") or company.get("bank_name"):
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*BRAND)
        _cell(pdf, 0, 5, "Bank Details for Payment", nl=True)
        pdf.set_draw_color(*BRAND)
        pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y()); pdf.ln(1)
        pdf.set_text_color(*DARK)
        h2 = W / 2
        for label, val in [
            ("Account Name", company.get("bank_account_name", "")),
            ("Bank Name", company.get("bank_name", "")),
            ("Account No", company.get("bank_account_no", "")),
            ("IFSC Code", company.get("bank_ifsc", "")),
        ]:
            pdf.set_font("Helvetica", "B", 8)
            _cell(pdf, h2 * 0.42, 5, _s(f"{label}:"), nl=False)
            pdf.set_font("Helvetica", "", 8)
            _cell(pdf, h2 * 0.58, 5, _s(val), nl=True)
    # ── Payment status stamp ────────────────────────────────────────────────────
    paid_status = inv.get("status", "")
    if paid_status == "paid":
        stamp_y = pdf.get_y() + 2
        pdf.set_xy(14 + W - 60, stamp_y)
        pdf.set_draw_color(*GREEN); pdf.set_font("Helvetica", "B", 18)
        pdf.set_text_color(*GREEN)
        pdf.cell(50, 12, "PAID", border=1, align="C")
    # ── Notes / T&C ────────────────────────────────────────────────────────────
    if inv.get("notes") or inv.get("terms_conditions"):
        pdf.ln(5)
        pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*BRAND)
        _cell(pdf, 0, 5, "Terms & Notes", nl=True)
        pdf.set_draw_color(*BRAND)
        pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y()); pdf.ln(1)
        pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*DARK)
        if inv.get("payment_terms"): _mcell(pdf, W, 4, _s(f"Payment: {inv['payment_terms']}"))
        if inv.get("terms_conditions"): _mcell(pdf, W, 4, _s(inv["terms_conditions"]))
        if inv.get("notes"): _mcell(pdf, W, 4, _s(f"Note: {inv['notes']}"))
    # ── Signature ──────────────────────────────────────────────────────────────
    pdf.ln(8)
    sig_b64 = company.get("signature_base64", "")
    if sig_b64:
        _embed_logo(pdf, sig_b64, x=14, y=pdf.get_y(), h=14)
        pdf.ln(16)
    else:
        pdf.ln(12)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 75, pdf.get_y())
    pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*DARK)
    _cell(pdf, 0, 5, _s(f"For {company.get('name', '')}"), nl=True)
    pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*MUTED)
    _cell(pdf, 0, 4, "Authorised Signatory", nl=True)
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 7.5)
    _cell(pdf, 0, 4, "This is a computer generated invoice.", nl=True)
    # ── FIX: use pdf.output() which returns bytes in fpdf2 ──────────────────────
    buf = BytesIO()
    buf.write(pdf.output())
    buf.seek(0)
    return buf
# ════════════════════════════════════════════════════════════════════════════════
# PRODUCT CATALOG ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════
@router.post("/products", response_model=Product)
async def create_product(data: ProductCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), **data.model_dump(),
           "created_by": current_user.id, "created_at": now}
    await db.products.insert_one(doc); doc.pop("_id", None)
    return doc
@router.get("/products")
async def list_products(
    search: Optional[str] = None, category: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {}
    if current_user.role != "admin": q["created_by"] = current_user.id
    if search: q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                            {"description": {"$regex": search, "$options": "i"}}]
    if category: q["category"] = category
    items = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return items
@router.put("/products/{pid}")
async def update_product(pid: str, data: ProductCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    ex = await db.products.find_one({"id": pid})
    if not ex: raise HTTPException(404, "Product not found")
    if current_user.role != "admin" and ex.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    await db.products.update_one({"id": pid}, {"$set": data.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})
@router.delete("/products/{pid}")
async def delete_product(pid: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    await db.products.delete_one({"id": pid})
    return {"message": "Product deleted"}
# ════════════════════════════════════════════════════════════════════════════════
# INVOICE ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════
@router.post("/invoices", response_model=Invoice)
async def create_invoice(data: InvoiceCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    now = datetime.now(timezone.utc).isoformat()
    prefix = {"proforma": "PRO", "estimate": "EST", "credit_note": "CN", "debit_note": "DN"}.get(data.invoice_type, "INV")
    inv_no = await _next_invoice_no(prefix)
    inv_date = data.invoice_date or date.today().isoformat()
    due_date = data.due_date or (date.today() + timedelta(days=30)).isoformat()
    raw = {"id": str(uuid.uuid4()), "invoice_no": inv_no, "invoice_date": inv_date,
           "due_date": due_date, **data.model_dump(),
           "amount_paid": 0.0, "amount_due": 0.0,
           "created_by": current_user.id, "created_at": now, "updated_at": now}
    raw = _compute_invoice_totals(raw)
    raw["amount_due"] = raw["grand_total"]
    await db.invoices.insert_one(raw); raw.pop("_id", None)
    if data.lead_id:
        from bson import ObjectId
        try:
            await db.leads.update_one(
                {"_id": ObjectId(data.lead_id)} if ObjectId.is_valid(data.lead_id) else {"id": data.lead_id},
                {"$set": {"status": "negotiation", "updated_at": datetime.now(timezone.utc)}}
            )
        except Exception: pass
    return raw
@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    inv_type: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {}
    if current_user.role != "admin": q["created_by"] = current_user.id
    if status: q["status"] = status
    if client_id: q["client_id"] = client_id
    if lead_id: q["lead_id"] = lead_id
    if inv_type: q["invoice_type"] = inv_type
    if from_date: q.setdefault("invoice_date", {})["$gte"] = from_date
    if to_date: q.setdefault("invoice_date", {})["$lte"] = to_date
    if search:
        q["$or"] = [{"invoice_no": {"$regex": search, "$options": "i"}},
                    {"client_name": {"$regex": search, "$options": "i"}}]
    docs = await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs
@router.get("/invoices/stats")
async def invoice_stats(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {"invoice_type": "tax_invoice", "status": {"$ne": "cancelled"}}
    if current_user.role != "admin": q["created_by"] = current_user.id
    all_inv = await db.invoices.find(q, {"_id": 0,
        "grand_total": 1, "amount_paid": 1, "amount_due": 1,
        "status": 1, "invoice_date": 1, "client_name": 1,
        "total_gst": 1}).to_list(5000)
    today = date.today()
    cur_year = year or today.year
    cur_mon = month or today.month
    def _in_month(d, y, m):
        try: dt = date.fromisoformat(d[:10]); return dt.year == y and dt.month == m
        except: return False
    def _in_year(d, y):
        try: return date.fromisoformat(d[:10]).year == y
        except: return False
    total_rev = sum(i["grand_total"] for i in all_inv)
    total_out = sum(i["amount_due"] for i in all_inv if i["amount_due"] > 0)
    overdue_c = sum(1 for i in all_inv
                    if i["status"] not in ("paid","cancelled","draft")
                    and i.get("amount_due", 0) > 0)
    mon_inv = [i for i in all_inv if _in_month(i.get("invoice_date",""), cur_year, cur_mon)]
    mon_rev = sum(i["grand_total"] for i in mon_inv)
    mon_col = sum(i["amount_paid"] for i in mon_inv)
    trend = []
    for offset in range(11, -1, -1):
        dt = (date(today.year, today.month, 1) - timedelta(days=offset * 28))
        y_, m_ = dt.year, dt.month
        month_inv = [i for i in all_inv if _in_month(i.get("invoice_date",""), y_, m_)]
        trend.append({"year": y_, "month": m_,
                       "label": date(y_, m_, 1).strftime("%b %y"),
                       "revenue": sum(i["grand_total"] for i in month_inv),
                       "collected": sum(i["amount_paid"] for i in month_inv),
                       "count": len(month_inv)})
    from collections import defaultdict
    client_rev: dict = defaultdict(float)
    for i in all_inv:
        client_rev[i.get("client_name","Unknown")] += i["grand_total"]
    top_clients = sorted(client_rev.items(), key=lambda x: -x[1])[:5]
    return {
        "total_revenue": round(total_rev, 2),
        "total_outstanding": round(total_out, 2),
        "overdue_count": overdue_c,
        "total_invoices": len(all_inv),
        "month_revenue": round(mon_rev, 2),
        "month_collected": round(mon_col, 2),
        "month_invoices": len(mon_inv),
        "monthly_trend": trend,
        "top_clients": [{"name": n, "revenue": round(v, 2)} for n, v in top_clients],
        "paid_count": sum(1 for i in all_inv if i["status"] == "paid"),
        "draft_count": sum(1 for i in all_inv if i["status"] == "draft"),
        "total_gst": round(sum(i.get("total_gst", 0) for i in all_inv), 2),
    }
@router.get("/invoices/{inv_id}")
async def get_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    doc = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Invoice not found")
    if current_user.role != "admin" and doc.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    return doc
@router.put("/invoices/{inv_id}")
async def update_invoice(inv_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    ex = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not ex: raise HTTPException(404, "Invoice not found")
    if current_user.role != "admin" and ex.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    for f in ("id", "invoice_no", "created_by", "created_at", "amount_paid"):
        data.pop(f, None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged = {**ex, **data}
    merged = _compute_invoice_totals(merged)
    merged["amount_due"] = round(merged["grand_total"] - merged.get("amount_paid", 0), 2)
    await db.invoices.update_one({"id": inv_id}, {"$set": merged})
    return await db.invoices.find_one({"id": inv_id}, {"_id": 0})
@router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    ex = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not ex: raise HTTPException(404, "Invoice not found")
    if current_user.role != "admin" and ex.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    await db.invoices.delete_one({"id": inv_id})
    await db.payments.delete_many({"invoice_id": inv_id})
    return {"message": "Invoice deleted"}
# ── Convert quotation to invoice ───────────────────────────────────────────────
@router.post("/invoices/from-quotation/{qtn_id}")
async def convert_quotation(qtn_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q = await db.quotations.find_one({"id": qtn_id}, {"_id": 0})
    if not q: raise HTTPException(404, "Quotation not found")
    company = await db.companies.find_one({"id": q.get("company_id")}, {"_id": 0})
    if not company: raise HTTPException(404, "Company not found")
    inv_items = []
    for it in q.get("items", []):
        inv_items.append(InvoiceItem(
            description = it.get("description", ""),
            quantity = float(it.get("quantity", 1)),
            unit = it.get("unit", "service"),
            unit_price = float(it.get("unit_price", 0)),
            gst_rate = float(q.get("gst_rate", 18)),
        ))
    create_data = InvoiceCreate(
        invoice_type = "tax_invoice",
        company_id = q.get("company_id", ""),
        quotation_id = qtn_id,
        lead_id = q.get("lead_id"),
        client_id = q.get("client_id"),
        client_name = q.get("client_name", ""),
        client_address = q.get("client_address", ""),
        client_email = q.get("client_email", ""),
        client_phone = q.get("client_phone", ""),
        items = inv_items,
        gst_rate = q.get("gst_rate", 18),
        payment_terms = q.get("payment_terms", ""),
        notes = q.get("notes", ""),
        status = "draft",
    )
    return await create_invoice(create_data, current_user)
# ── Import firm data from .vyp SQLite file (auto-fill company profile) ───────
@router.post("/invoices/import-firm-data")
async def import_firm_data(file_path: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    
    firm_info = await _load_firm_from_vyp(file_path)
    if not firm_info:
        raise HTTPException(400, "Could not extract data from file")
        
    # Update the company profile in your MongoDB/Database
    await db.companies.update_one(
        {"created_by": current_user.id}, 
        {"$set": firm_info}, 
        upsert=True
    )
    return {"message": "Firm data updated from .vyp file", "data": firm_info}
# ── Send invoice via email (PDF attachment) ─────────────────────────────────
@router.post("/invoices/{inv_id}/send-email")
async def send_invoice_email(
    inv_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")
    if current_user.role != "admin" and inv.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    if not inv.get("client_email"):
        raise HTTPException(400, "Client email address is missing")

    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0})
    if not company: raise HTTPException(404, "Company profile not found")

    # Generate PDF in background-friendly way
    try:
        buf = _build_invoice_pdf(inv, company)
        pdf_bytes = buf.getvalue()
    except Exception as e:
        logger.error(f"PDF build failed {inv_id}: {e}", exc_info=True)
        raise HTTPException(500, f"PDF generation failed: {e}")

    fname = f"invoice_{inv.get('invoice_no','').replace('/','_')}.pdf"

    # HTML email body
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif;">
        <h2>Dear {inv.get('client_name', 'Valued Customer')},</h2>
        <p>Please find attached your invoice <strong>{inv.get('invoice_no')}</strong> dated {inv.get('invoice_date')}.</p>
        <p><strong>Amount Due:</strong> Rs. {inv.get('grand_total', 0):,.2f}</p>
        <p><strong>Due Date:</strong> {inv.get('due_date')}</p>
        <p>Thank you for your business!</p>
        <p>For any queries, contact us at {company.get('email')} or {company.get('phone')}.</p>
        <br>
        <p style="color:#666;">This is a computer-generated email. Do not reply to this address.</p>
    </body>
    </html>
    """

    # Send email (sync helper, wrapped in background task for non-blocking)
    background_tasks.add_task(
        _send_email,
        to_email=inv["client_email"],
        subject=f"Invoice {inv.get('invoice_no')} from {company.get('name')}",
        html_body=html_body,
        pdf_bytes=pdf_bytes,
        filename=fname,
        company_email=company.get("email")
    )

    # Mark invoice as sent
    if inv.get("status") == "draft":
        await db.invoices.update_one(
            {"id": inv_id},
            {"$set": {"status": "sent", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    return {"message": "Invoice email queued and will be sent shortly", "invoice_no": inv.get("invoice_no")}
# ════════════════════════════════════════════════════════════════════════════════
# PAYMENT ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════
@router.post("/payments", response_model=Payment)
async def record_payment(data: PaymentCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": data.invoice_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")
    if current_user.role != "admin" and inv.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    now = datetime.now(timezone.utc).isoformat()
    pmt = {"id": str(uuid.uuid4()), **data.model_dump(),
           "created_by": current_user.id, "created_at": now}
    await db.payments.insert_one(pmt); pmt.pop("_id", None)
    total_paid = inv.get("amount_paid", 0) + data.amount
    grand = inv["grand_total"]
    new_due = round(grand - total_paid, 2)
    if new_due <= 0:
        new_status = "paid"; new_due = 0.0
    elif total_paid > 0:
        new_status = "partially_paid"
    else:
        new_status = inv["status"]
    await db.invoices.update_one({"id": data.invoice_id}, {"$set": {
        "amount_paid": round(total_paid, 2),
        "amount_due": new_due,
        "status": new_status,
        "updated_at": now,
    }})
    return pmt
@router.get("/payments")
async def list_payments(
    invoice_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {}
    if invoice_id: q["invoice_id"] = invoice_id
    if current_user.role != "admin": q["created_by"] = current_user.id
    docs = await db.payments.find(q, {"_id": 0}).sort("payment_date", -1).to_list(2000)
    return docs
@router.delete("/payments/{pid}")
async def delete_payment(pid: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    pmt = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not pmt: raise HTTPException(404, "Payment not found")
    if current_user.role != "admin" and pmt.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    inv = await db.invoices.find_one({"id": pmt["invoice_id"]}, {"_id": 0})
    if inv:
        new_paid = max(0, inv.get("amount_paid", 0) - pmt["amount"])
        new_due = round(inv["grand_total"] - new_paid, 2)
        status = "paid" if new_due <= 0 else ("partially_paid" if new_paid > 0 else "sent")
        await db.invoices.update_one({"id": pmt["invoice_id"]}, {"$set": {
            "amount_paid": round(new_paid, 2), "amount_due": new_due, "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
    await db.payments.delete_one({"id": pid})
    return {"message": "Payment deleted"}
# ════════════════════════════════════════════════════════════════════════════════
# CREDIT NOTE ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════
@router.post("/credit-notes")
async def create_credit_note(data: CreditNoteCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    orig = await db.invoices.find_one({"id": data.original_invoice_id}, {"_id": 0})
    if not orig: raise HTTPException(404, "Original invoice not found")
    if current_user.role != "admin" and orig.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    now = datetime.now(timezone.utc).isoformat()
    inv_no = await _next_invoice_no("CN")
    raw = {"id": str(uuid.uuid4()), "invoice_no": inv_no, "invoice_type": "credit_note",
           "company_id": data.company_id, "original_invoice_id": data.original_invoice_id,
           "client_name": data.client_name, "reason": data.reason,
           "invoice_date": date.today().isoformat(), "due_date": date.today().isoformat(),
           "is_interstate": orig.get("is_interstate", False),
           "items": [i.model_dump() for i in data.items],
           "notes": data.notes, "status": "sent",
           "amount_paid": 0.0, "amount_due": 0.0,
           "created_by": current_user.id, "created_at": now, "updated_at": now}
    raw = _compute_invoice_totals(raw)
    raw["amount_due"] = raw["grand_total"]
    await db.invoices.insert_one(raw); raw.pop("_id", None)
    await db.invoices.update_one({"id": data.original_invoice_id},
        {"$set": {"status": "credit_note", "updated_at": now}})
    return raw
# ════════════════════════════════════════════════════════════════════════════════
# PDF EXPORT
# ════════════════════════════════════════════════════════════════════════════════
@router.get("/invoices/{inv_id}/pdf")
async def download_invoice_pdf(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")
    if current_user.role != "admin" and inv.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0})
    if not company: raise HTTPException(404, "Company profile not found")
    try:
        buf = _build_invoice_pdf(inv, company)
    except Exception as e:
        logger.error(f"PDF build failed {inv_id}: {e}", exc_info=True)
        raise HTTPException(500, f"PDF generation failed: {e}")
    fname = f"invoice_{inv.get('invoice_no','').replace('/','_')}.pdf"
    data = buf.getvalue()
    return StreamingResponse(iter([data]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"',
                 "Content-Length": str(len(data))})
# ── Mark sent ───────────────────────────────────────────────────────────────────
@router.post("/invoices/{inv_id}/mark-sent")
async def mark_invoice_sent(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")
    if inv.get("status") == "draft":
        await db.invoices.update_one({"id": inv_id}, {"$set": {
            "status": "sent", "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Marked as sent"}
# ── Recurring invoice generator ─────────────────────────────────────────────────
@router.post("/invoices/{inv_id}/generate-recurring")
async def generate_recurring(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    tmpl = await db.invoices.find_one({"id": inv_id, "is_recurring": True}, {"_id": 0})
    if not tmpl: raise HTTPException(404, "Recurring invoice template not found")
    if current_user.role != "admin" and tmpl.get("created_by") != current_user.id:
        raise HTTPException(403, "Not authorized")
    now = datetime.now(timezone.utc).isoformat()
    prefix = {"proforma": "PRO", "estimate": "EST"}.get(tmpl.get("invoice_type","tax_invoice"), "INV")
    inv_no = await _next_invoice_no(prefix)
    new_inv = {**tmpl, "id": str(uuid.uuid4()), "invoice_no": inv_no,
               "invoice_date": date.today().isoformat(),
               "due_date": (date.today() + timedelta(days=30)).isoformat(),
               "status": "draft", "amount_paid": 0.0, "amount_due": 0.0,
               "is_recurring": False, "created_at": now, "updated_at": now}
    new_inv = _compute_invoice_totals(new_inv)
    new_inv["amount_due"] = new_inv["grand_total"]
    await db.invoices.insert_one(new_inv); new_inv.pop("_id", None)
    return new_inv
