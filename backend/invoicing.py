"""
invoicing.py
──────────────────────────────────────────────────────────────────────────────
Full Invoicing & Billing Module — FastAPI Router

CHANGELOG v4.0:
  - MIGRATED: All invoice/payment/credit-note storage now uses Google Drive
  - REMOVED:  MongoDB writes for invoices, payments, credit notes
  - KEPT:     MongoDB for product catalog only
  - NEW:      Google Drive integration via service account
  - FIXED:    Duplicate endpoint definitions cleaned up
  - KEPT:     All parsers, PDF builder, email sender, calculation engine

Features:
  - Product / Service catalog with HSN/SAC codes (MongoDB)
  - GST-compliant invoices (CGST+SGST or IGST) → saved to Google Drive
  - Proforma / Estimate invoices
  - Payment recording with multiple payment modes → Google Drive
  - Credit notes against invoices → Google Drive
  - Convert Quotation → Invoice
  - Recurring invoice scheduler
  - Revenue dashboard stats (MongoDB read-only)
  - PDF export (Indian GST invoice format) → Google Drive
  - Deep integration with Clients, Leads, Quotations
  - Email invoice sending with PDF attachment (SMTP)
  - Universal backup import from other accounting software → Drive backup
"""
import uuid
import sqlite3
import logging
import re
import base64
import tempfile
import os
import smtplib
import json
import csv
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from datetime import datetime, timezone, date, timedelta
from io import BytesIO, StringIO
from typing import List, Optional, Literal, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks, UploadFile, File
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

try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl"])
    import openpyxl

try:
    import xml.etree.ElementTree as ET
except ImportError:
    pass

# ====================== GOOGLE DRIVE CONFIG ======================
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io   # ← added

SERVICE_ACCOUNT_FILE = "google-drive-service-account.json"

DRIVE_FOLDERS = {
    "invoices":     "1NhadvUmWtZ8x37FrJ2oeKTCOvHVyCyPv",
    "payments":     "1VPtuX6u_L-WPfLk0ZTawHrsyrXSMBfGu",
    "credit_notes": "1vY1mJexT-NJso6U1HLBeKaOgI6IFw9nc",
    "backups":      "1pWNDV2Yym3mvWYDQ9WmUiqrmqndT-Z9q"
}

def _get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=['https://www.googleapis.com/auth/drive.file'])
    return build('drive', 'v3', credentials=creds)

def upload_to_drive(content_bytes: bytes, filename: str, folder_key: str, mime_type: str):
    service = _get_drive_service()
    file_metadata = {'name': filename, 'parents': [DRIVE_FOLDERS[folder_key]]}
    media = MediaIoBaseUpload(io.BytesIO(content_bytes), mimetype=mime_type, resumable=True)
    file = service.files().create(body=file_metadata, media_body=media, fields='id,webViewLink,name').execute()
    logger.info(f"✅ Uploaded to Drive → {filename}")
    return file.get('webViewLink')

def list_drive_files(folder_key: str):
    service = _get_drive_service()
    q = f"'{DRIVE_FOLDERS[folder_key]}' in parents and trashed=false"
    results = service.files().list(q=q, fields="files(id,name,webViewLink,createdTime)", orderBy="createdTime desc").execute()
    return results.get('files', [])
# =================================================================

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Invoicing"])

# ─── Constants ────────────────────────────────────────────────────────────────
GST_RATES = [0.0, 5.0, 12.0, 18.0, 28.0]
UNITS = ["service","nos","kg","ltr","mtr","sqft","hr","day","month","year","set","lot","pcs","box"]
PAYMENT_MODES = ["cash","cheque","neft","rtgs","imps","upi","card","other"]
INV_STATUS = ["draft","sent","partially_paid","paid","overdue","cancelled","credit_note"]

# ─── KhataBook transaction type mapping ────────────────────────────────────────
KB_TXN_TYPES = {
    1: "tax_invoice",       # Sale
    2: "purchase",          # Purchase (we skip these for import)
    3: "payment_received",  # Payment In
    4: "payment_made",      # Payment Out
    7: "credit_note",       # Credit Note / Sales Return
    21: "estimate",         # Estimate / Quotation
    27: "delivery_challan", # Delivery Challan
    65: "proforma",         # Proforma Invoice
}

KB_PAY_STATUS = {
    1: "sent",
    2: "partially_paid",
    3: "paid",
}

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

# ─── Next invoice number (Google Drive) ────────────────────────────────────────
async def _next_invoice_no(prefix: str = "INV") -> str:
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    fy_label = f"{fy_start % 100:02d}-{(fy_start + 1) % 100:02d}"
    files = list_drive_files("invoices")
    count = sum(1 for f in files if f['name'].startswith(f"Invoice_{prefix}"))
    return f"{prefix}-{count + 1:04d}/{fy_label}"

# ─── Email invoice sender ─────────────────────────────────────────────────────
def _send_email(to_email: str, subject: str, html_body: str, pdf_bytes: bytes, filename: str, company_email: str):
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
# UNIVERSAL BACKUP PARSER
# ════════════════════════════════════════════════════════════════════════════════

def _safe_float(val, default=0.0):
    """Safely convert value to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def _safe_str(val, default=""):
    """Safely convert value to string."""
    if val is None:
        return default
    return str(val).strip()

def _safe_date(val, default=None):
    """Extract date string from various datetime formats."""
    if not val:
        return default or date.today().isoformat()
    s = str(val).strip()
    # Handle "2021-02-04 00:00:00" format
    if " " in s:
        s = s.split(" ")[0]
    # Validate date format
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except ValueError:
        pass
    # Try DD/MM/YYYY
    try:
        dt = datetime.strptime(s, "%d/%m/%Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        pass
    # Try DD-MM-YYYY
    try:
        dt = datetime.strptime(s, "%d-%m-%Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        pass
    return default or date.today().isoformat()


# ─── VYP (KhataBook) Parser ─────────────────────────────────────────────────

def _parse_vyp_file(file_path: str) -> dict:
    """
    Parses a KhataBook .vyp SQLite backup file.
    Returns structured data: firms, clients, items, invoices, payments.
    """
    try:
        conn = sqlite3.connect(file_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        result = {
            "source": "khatabook",
            "source_label": "KhataBook (.vyp)",
            "firms": [],
            "clients": [],
            "items": [],
            "invoices": [],
            "payments": [],
            "stats": {},
        }

        # ── Parse firms ──────────────────────────────────────────────────────
        try:
            cursor.execute("SELECT * FROM kb_firms")
            for row in cursor.fetchall():
                result["firms"].append({
                    "firm_id": row["firm_id"],
                    "firm_name": _safe_str(row["firm_name"]),
                    "firm_email": _safe_str(row["firm_email"]),
                    "firm_phone": _safe_str(row["firm_phone"]),
                    "firm_address": _safe_str(row["firm_address"]),
                    "firm_gstin": _safe_str(row["firm_gstin_number"]),
                    "firm_state": _safe_str(row["firm_state"]),
                    "firm_bank_name": _safe_str(row["firm_bank_name"]),
                    "firm_bank_account": _safe_str(row["firm_bank_account_number"]),
                    "firm_bank_ifsc": _safe_str(row["firm_bank_ifsc_code"]),
                    "firm_business_category": _safe_str(row["firm_business_category"]),
                })
        except Exception as e:
            logger.warning(f"VYP firms parse error: {e}")

        # ── Parse tax codes (for GST rate lookup) ────────────────────────────
        tax_map = {}
        try:
            cursor.execute("SELECT tax_code_id, tax_rate, tax_code_type, tax_rate_type FROM kb_tax_code")
            for row in cursor.fetchall():
                tax_map[row["tax_code_id"]] = {
                    "rate": _safe_float(row["tax_rate"]),
                    "type": row["tax_code_type"],     # 0=individual, 1=combined
                    "rate_type": row["tax_rate_type"], # 1=SGST, 2=CGST, 3=IGST
                }
        except Exception as e:
            logger.warning(f"VYP tax codes parse error: {e}")

        # ── Parse clients (kb_names) ─────────────────────────────────────────
        name_map = {}  # name_id → client data
        try:
            cursor.execute("""
                SELECT name_id, full_name, phone_number, email, address,
                       name_gstin_number, name_state, amount, name_type,
                       name_customer_type, name_shipping_address,
                       party_billing_name
                FROM kb_names
                WHERE name_type IN (1, 2)
            """)
            for row in cursor.fetchall():
                client = {
                    "name_id": row["name_id"],
                    "full_name": _safe_str(row["full_name"]),
                    "phone_number": _safe_str(row["phone_number"]),
                    "email": _safe_str(row["email"]),
                    "address": _safe_str(row["address"]),
                    "name_gstin_number": _safe_str(row["name_gstin_number"]),
                    "name_state": _safe_str(row["name_state"]),
                    "balance": _safe_float(row["amount"]),
                    "name_type": row["name_type"],     # 1=customer, 2=supplier
                    "customer_type": row["name_customer_type"],
                    "billing_name": _safe_str(row["party_billing_name"]),
                    "shipping_address": _safe_str(row["name_shipping_address"]),
                }
                name_map[row["name_id"]] = client
                result["clients"].append(client)
        except Exception as e:
            logger.warning(f"VYP clients parse error: {e}")

        # ── Parse items (kb_items) ───────────────────────────────────────────
        item_map = {}
        try:
            cursor.execute("""
                SELECT item_id, item_name, item_sale_unit_price,
                       item_purchase_unit_price, item_hsn_sac_code,
                       item_tax_id, item_code, item_description,
                       item_type, item_stock_quantity
                FROM kb_items
                WHERE item_is_active = 1 OR item_is_active IS NULL
            """)
            for row in cursor.fetchall():
                gst_rate = 0.0
                tid = row["item_tax_id"]
                if tid and tid in tax_map:
                    tc = tax_map[tid]
                    if tc["type"] == 1:
                        gst_rate = tc["rate"]
                    else:
                        gst_rate = tc["rate"] * 2  # CGST/SGST → combined

                item = {
                    "item_id": row["item_id"],
                    "name": _safe_str(row["item_name"]),
                    "sale_price": _safe_float(row["item_sale_unit_price"]),
                    "purchase_price": _safe_float(row["item_purchase_unit_price"]),
                    "hsn_sac": _safe_str(row["item_hsn_sac_code"]),
                    "gst_rate": gst_rate,
                    "item_code": _safe_str(row["item_code"]),
                    "description": _safe_str(row["item_description"]),
                    "stock_qty": _safe_float(row["item_stock_quantity"]),
                }
                item_map[row["item_id"]] = item
                result["items"].append(item)
        except Exception as e:
            logger.warning(f"VYP items parse error: {e}")

        # ── Parse line items (for invoice detail) ────────────────────────────
        lineitem_map = {}  # txn_id → [lineitems]
        try:
            cursor.execute("""
                SELECT lineitem_id, lineitem_txn_id, item_id, quantity,
                       priceperunit, total_amount, lineitem_tax_amount,
                       lineitem_discount_amount, lineitem_description,
                       lineitem_discount_percent
                FROM kb_lineitems
            """)
            for row in cursor.fetchall():
                txn_id = row["lineitem_txn_id"]
                if txn_id not in lineitem_map:
                    lineitem_map[txn_id] = []

                item_data = item_map.get(row["item_id"], {})
                lineitem_map[txn_id].append({
                    "description": _safe_str(row["lineitem_description"]) or item_data.get("name", "Item"),
                    "hsn_sac": item_data.get("hsn_sac", ""),
                    "quantity": _safe_float(row["quantity"], 1),
                    "unit_price": _safe_float(row["priceperunit"]),
                    "total_amount": _safe_float(row["total_amount"]),
                    "tax_amount": _safe_float(row["lineitem_tax_amount"]),
                    "discount_amount": _safe_float(row["lineitem_discount_amount"]),
                    "discount_pct": _safe_float(row["lineitem_discount_percent"]),
                    "gst_rate": item_data.get("gst_rate", 18.0),
                })
        except Exception as e:
            logger.warning(f"VYP lineitems parse error: {e}")

        # ── Parse transactions ───────────────────────────────────────────────
        try:
            cursor.execute("""
                SELECT txn_id, txn_date_created, txn_date_modified,
                       txn_name_id, txn_cash_amount, txn_balance_amount,
                       txn_type, txn_date, txn_discount_percent,
                       txn_tax_percent, txn_discount_amount, txn_tax_amount,
                       txn_due_date, txn_description, txn_ref_number_char,
                       txn_status, txn_firm_id, txn_sub_type,
                       txn_invoice_prefix, txn_payment_status,
                       txn_tax_inclusive, txn_billing_address,
                       txn_shipping_address, txn_place_of_supply,
                       txn_round_off_amount, txn_po_ref_number,
                       txn_eway_bill_number, txn_payment_type_id,
                       txn_payment_reference
                FROM kb_transactions
                WHERE txn_status != 0
                ORDER BY txn_date ASC
            """)
            for row in cursor.fetchall():
                txn_type_code = row["txn_type"]
                txn_type = KB_TXN_TYPES.get(txn_type_code)

                if not txn_type:
                    continue

                client = name_map.get(row["txn_name_id"], {})
                txn_date = _safe_date(row["txn_date"])
                due_date = _safe_date(row["txn_due_date"], txn_date)

                # Build invoice number
                prefix = _safe_str(row["txn_invoice_prefix"]) or "KB"
                ref_num = _safe_str(row["txn_ref_number_char"])
                invoice_no = f"{prefix}-{ref_num}" if ref_num else f"KB-{row['txn_id']}"

                # Get line items for this transaction
                items_list = lineitem_map.get(row["txn_id"], [])

                # Calculate totals from line items
                subtotal = sum(li["total_amount"] for li in items_list)
                total_tax = sum(li["tax_amount"] for li in items_list)
                total_discount = sum(li["discount_amount"] for li in items_list)

                # If no line items, use transaction-level amounts
                if not items_list and _safe_float(row["txn_cash_amount"]) > 0:
                    cash_amt = _safe_float(row["txn_cash_amount"])
                    tax_amt = _safe_float(row["txn_tax_amount"])
                    subtotal = cash_amt
                    total_tax = tax_amt
                    items_list = [{
                        "description": _safe_str(row["txn_description"]) or "Imported Service/Product",
                        "hsn_sac": "",
                        "quantity": 1,
                        "unit_price": cash_amt,
                        "total_amount": cash_amt + tax_amt,
                        "tax_amount": tax_amt,
                        "discount_amount": _safe_float(row["txn_discount_amount"]),
                        "discount_pct": _safe_float(row["txn_discount_percent"]),
                        "gst_rate": _safe_float(row["txn_tax_percent"]) or 18.0,
                    }]

                grand_total = subtotal + total_tax - total_discount + _safe_float(row["txn_round_off_amount"])

                # Payment received transactions
                if txn_type == "payment_received":
                    result["payments"].append({
                        "_kb_id": row["txn_id"],
                        "client_name": client.get("full_name", "Unknown"),
                        "amount": _safe_float(row["txn_cash_amount"]),
                        "payment_date": txn_date,
                        "payment_mode": "other",
                        "reference_no": _safe_str(row["txn_payment_reference"]),
                        "notes": _safe_str(row["txn_description"]) or "Imported from KhataBook",
                        "company_id": row["txn_firm_id"],
                    })
                    continue

                if txn_type == "payment_made":
                    continue  # Skip payment-out for invoice import

                if txn_type == "purchase":
                    continue  # Skip purchases

                # Determine invoice type
                inv_type = "tax_invoice"
                if txn_type == "credit_note":
                    inv_type = "credit_note"
                elif txn_type == "estimate":
                    inv_type = "estimate"
                elif txn_type == "proforma":
                    inv_type = "proforma"
                elif txn_type == "delivery_challan":
                    inv_type = "tax_invoice"  # Map to regular invoice

                # Determine payment status
                pay_status = KB_PAY_STATUS.get(row["txn_payment_status"], "draft")

                # Determine interstate
                is_interstate = False
                firm = next((f for f in result["firms"] if f["firm_id"] == row["txn_firm_id"]), None)
                if firm and client.get("name_state"):
                    is_interstate = firm.get("firm_state", "").lower() != client.get("name_state", "").lower()

                # Build items in our format
                formatted_items = []
                for li in items_list:
                    gst_rate = li.get("gst_rate", 18.0) or 18.0
                    taxable = li["total_amount"] - li.get("tax_amount", 0)
                    if taxable <= 0:
                        taxable = li["total_amount"]

                    half = gst_rate / 2
                    if is_interstate:
                        igst = round(taxable * gst_rate / 100, 2) if li.get("tax_amount", 0) == 0 else li["tax_amount"]
                        formatted_items.append({
                            "description": li["description"],
                            "hsn_sac": li.get("hsn_sac", ""),
                            "quantity": li["quantity"],
                            "unit": "service",
                            "unit_price": li["unit_price"],
                            "discount_pct": li.get("discount_pct", 0),
                            "gst_rate": gst_rate,
                            "taxable_value": taxable,
                            "cgst_rate": 0, "sgst_rate": 0, "igst_rate": gst_rate,
                            "cgst_amount": 0, "sgst_amount": 0, "igst_amount": igst,
                            "total_amount": taxable + igst,
                        })
                    else:
                        tax_half = round(taxable * half / 100, 2) if li.get("tax_amount", 0) == 0 else round(li["tax_amount"] / 2, 2)
                        formatted_items.append({
                            "description": li["description"],
                            "hsn_sac": li.get("hsn_sac", ""),
                            "quantity": li["quantity"],
                            "unit": "service",
                            "unit_price": li["unit_price"],
                            "discount_pct": li.get("discount_pct", 0),
                            "gst_rate": gst_rate,
                            "taxable_value": taxable,
                            "cgst_rate": half, "sgst_rate": half, "igst_rate": 0,
                            "cgst_amount": tax_half, "sgst_amount": tax_half, "igst_amount": 0,
                            "total_amount": taxable + tax_half * 2,
                        })

                total_taxable = sum(i["taxable_value"] for i in formatted_items)
                total_cgst = sum(i["cgst_amount"] for i in formatted_items)
                total_sgst = sum(i["sgst_amount"] for i in formatted_items)
                total_igst = sum(i["igst_amount"] for i in formatted_items)
                total_gst = total_cgst + total_sgst + total_igst
                computed_grand = round(total_taxable + total_gst, 2)

                # Use KhataBook's balance for amount_due
                balance_amt = _safe_float(row["txn_balance_amount"])
                amount_paid = max(0, computed_grand - balance_amt) if balance_amt >= 0 else computed_grand

                invoice = {
                    "_kb_id": row["txn_id"],
                    "invoice_type": inv_type,
                    "invoice_no": invoice_no,
                    "invoice_date": txn_date,
                    "due_date": due_date,
                    "client_name": client.get("full_name", "Unknown"),
                    "client_email": client.get("email", ""),
                    "client_phone": client.get("phone_number", ""),
                    "client_gstin": client.get("name_gstin_number", ""),
                    "client_address": _safe_str(row["txn_billing_address"]) or client.get("address", ""),
                    "client_state": client.get("name_state", ""),
                    "is_interstate": is_interstate,
                    "items": formatted_items,
                    "subtotal": round(subtotal, 2),
                    "total_discount": round(total_discount, 2),
                    "total_taxable": round(total_taxable, 2),
                    "total_cgst": round(total_cgst, 2),
                    "total_sgst": round(total_sgst, 2),
                    "total_igst": round(total_igst, 2),
                    "total_gst": round(total_gst, 2),
                    "grand_total": computed_grand if computed_grand > 0 else round(grand_total, 2),
                    "amount_paid": round(amount_paid, 2),
                    "amount_due": round(balance_amt if balance_amt >= 0 else 0, 2),
                    "status": pay_status,
                    "payment_terms": "Imported from KhataBook",
                    "notes": _safe_str(row["txn_description"]),
                    "reference_no": _safe_str(row["txn_po_ref_number"]),
                    "company_id": row["txn_firm_id"],
                }
                result["invoices"].append(invoice)

        except Exception as e:
            logger.error(f"VYP transactions parse error: {e}", exc_info=True)

        # ── Stats ────────────────────────────────────────────────────────────
        result["stats"] = {
            "firms": len(result["firms"]),
            "clients": len(result["clients"]),
            "items": len(result["items"]),
            "invoices": len(result["invoices"]),
            "payments": len(result["payments"]),
        }

        conn.close()
        return result

    except Exception as e:
        logger.error(f"VYP parse failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse .vyp file: {str(e)}")


# ─── Excel/CSV Parser ─────────────────────────────────────────────────────────

def _parse_excel_file(file_path: str, filename: str) -> dict:
    """
    Parses Excel (.xlsx/.xls) or CSV files.
    Supports: Vyapar, myBillBook, generic Excel, and our own template.
    """
    result = {
        "source": "excel",
        "source_label": f"Excel/CSV ({filename})",
        "firms": [],
        "clients": [],
        "items": [],
        "invoices": [],
        "payments": [],
        "stats": {},
    }

    try:
        if filename.lower().endswith('.csv'):
            # CSV parsing
            with open(file_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
        else:
            # Excel parsing
            wb = openpyxl.load_workbook(file_path, data_only=True)
            ws = wb.active
            headers = [str(cell.value or '').strip() for cell in ws[1]]
            rows = []
            for row_cells in ws.iter_rows(min_row=2, values_only=True):
                row_dict = {}
                for i, val in enumerate(row_cells):
                    if i < len(headers) and headers[i]:
                        row_dict[headers[i]] = val
                if any(v for v in row_dict.values() if v):
                    rows.append(row_dict)

        # Detect format by checking column headers
        all_keys = set()
        for r in rows[:5]:
            all_keys.update(k.lower().replace(' ', '_') for k in r.keys() if r.get(k))

        # Map columns flexibly
        def _get(row, *keys, default=""):
            for k in keys:
                for rk in row.keys():
                    if rk.lower().replace(' ', '_') == k.lower().replace(' ', '_'):
                        val = row[rk]
                        if val is not None and str(val).strip():
                            return str(val).strip()
            return default

        for row in rows:
            client_name = _get(row, 'Client Name', 'client_name', 'Customer Name',
                             'customer_name', 'Party Name', 'party_name', 'Buyer Name',
                             'buyer_name', 'Bill To', 'bill_to', 'Name', 'name')
            if not client_name:
                continue

            desc = _get(row, 'Description', 'description', 'Item Description',
                       'item_description', 'Particulars', 'particulars',
                       'Item Name', 'item_name', 'Product', 'product', default='Service')
            qty = _safe_float(_get(row, 'Quantity', 'quantity', 'Qty', 'qty', default='1'), 1)
            rate = _safe_float(_get(row, 'Rate', 'rate', 'Unit Price', 'unit_price',
                                   'Price', 'price', 'Amount', 'amount', default='0'))
            gst_rate = _safe_float(_get(row, 'GST Rate', 'gst_rate', 'GST%', 'gst',
                                       'Tax Rate', 'tax_rate', 'Tax%', default='18'), 18)
            discount_pct = _safe_float(_get(row, 'Discount%', 'discount_pct',
                                           'Discount', 'discount', default='0'))

            inv_date = _safe_date(_get(row, 'Invoice Date', 'invoice_date', 'Date', 'date',
                                      'Bill Date', 'bill_date'))
            due_date = _safe_date(_get(row, 'Due Date', 'due_date', 'Payment Due', 'payment_due'),
                                (datetime.strptime(inv_date, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d"))

            taxable = qty * rate * (1 - discount_pct / 100)
            half = gst_rate / 2
            cgst = round(taxable * half / 100, 2)
            sgst = round(taxable * half / 100, 2)
            total = round(taxable + cgst + sgst, 2)

            invoice = {
                "invoice_type": "tax_invoice",
                "client_name": client_name,
                "client_email": _get(row, 'Email', 'client_email', 'email'),
                "client_phone": _get(row, 'Phone', 'client_phone', 'phone',
                                    'Mobile', 'mobile', 'Contact', 'contact'),
                "client_gstin": _get(row, 'GSTIN', 'client_gstin', 'gstin',
                                    'GST No', 'gst_no', 'GST Number', 'gst_number'),
                "client_address": _get(row, 'Address', 'client_address', 'address',
                                      'Billing Address', 'billing_address'),
                "client_state": _get(row, 'State', 'client_state', 'state',
                                    'Place of Supply', 'place_of_supply'),
                "invoice_date": inv_date,
                "due_date": due_date,
                "reference_no": _get(row, 'Reference No', 'reference_no', 'Ref No',
                                    'ref_no', 'PO No', 'po_no', 'Invoice No', 'invoice_no'),
                "notes": _get(row, 'Notes', 'notes', 'Remarks', 'remarks'),
                "is_interstate": False,
                "items": [{
                    "description": desc,
                    "hsn_sac": _get(row, 'HSN/SAC', 'hsn_sac', 'HSN', 'hsn',
                                   'SAC', 'sac', 'HSN Code', 'hsn_code'),
                    "quantity": qty,
                    "unit": _get(row, 'Unit', 'unit', 'UOM', 'uom', default='service'),
                    "unit_price": rate,
                    "discount_pct": discount_pct,
                    "gst_rate": gst_rate,
                    "taxable_value": round(taxable, 2),
                    "cgst_rate": half, "sgst_rate": half, "igst_rate": 0,
                    "cgst_amount": cgst, "sgst_amount": sgst, "igst_amount": 0,
                    "total_amount": total,
                }],
                "subtotal": round(qty * rate, 2),
                "total_taxable": round(taxable, 2),
                "total_cgst": cgst,
                "total_sgst": sgst,
                "total_igst": 0,
                "total_gst": round(cgst + sgst, 2),
                "grand_total": total,
                "amount_paid": 0,
                "amount_due": total,
                "status": "draft",
                "payment_terms": "Due on receipt",
            }
            result["invoices"].append(invoice)

    except Exception as e:
        logger.error(f"Excel/CSV parse failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse file: {str(e)}")

    result["stats"] = {
        "firms": 0,
        "clients": len(set(inv["client_name"] for inv in result["invoices"])),
        "items": 0,
        "invoices": len(result["invoices"]),
        "payments": 0,
    }
    return result


# ─── XML (Tally) Parser ─────────────────────────────────────────────────────

def _parse_tally_xml(file_path: str) -> dict:
    """
    Parses Tally XML export files.
    Supports TallyPrime/Tally.ERP 9 standard XML export format.
    """
    result = {
        "source": "tally",
        "source_label": "Tally XML",
        "firms": [],
        "clients": [],
        "items": [],
        "invoices": [],
        "payments": [],
        "stats": {},
    }

    try:
        tree = ET.parse(file_path)
        root = tree.getroot()

        # Try to find vouchers (Tally standard XML structure)
        vouchers = root.findall('.//VOUCHER') or root.findall('.//Voucher')

        # Also check for ledger entries
        ledgers = root.findall('.//LEDGER') or root.findall('.//Ledger')

        # Parse ledgers as clients
        for ledger in ledgers:
            name = ledger.findtext('NAME') or ledger.findtext('Name') or ''
            parent = ledger.findtext('PARENT') or ledger.findtext('Parent') or ''
            if parent.lower() in ('sundry debtors', 'sundry creditors', 'trade receivables', 'trade payables'):
                addr_elem = ledger.find('.//ADDRESS') or ledger.find('.//Address')
                address = ''
                if addr_elem is not None:
                    address_lines = addr_elem.findall('.//ADDRESS.LIST') or [addr_elem]
                    address = ', '.join(a.text or '' for a in address_lines if a.text)

                result["clients"].append({
                    "full_name": name,
                    "address": address,
                    "phone_number": ledger.findtext('.//PHONE') or ledger.findtext('.//Phone') or '',
                    "email": ledger.findtext('.//EMAIL') or ledger.findtext('.//Email') or '',
                    "name_gstin_number": ledger.findtext('.//GSTIN') or ledger.findtext('.//Gstin') or '',
                    "name_state": ledger.findtext('.//STATENAME') or '',
                })

        # Parse vouchers as invoices
        for voucher in vouchers:
            v_type = (voucher.findtext('VOUCHERTYPENAME') or
                     voucher.findtext('VoucherTypeName') or
                     voucher.get('VCHTYPE', '')).lower()

            if v_type not in ('sales', 'sale', 'invoice', 'credit note', 'debit note'):
                continue

            v_date = voucher.findtext('DATE') or voucher.findtext('Date') or ''
            v_no = (voucher.findtext('VOUCHERNUMBER') or
                    voucher.findtext('VoucherNumber') or
                    voucher.findtext('NUMBER') or '')
            party_name = (voucher.findtext('PARTYLEDGERNAME') or
                         voucher.findtext('PartyLedgerName') or '')

            # Parse line items from inventory entries
            items_list = []
            inv_entries = (voucher.findall('.//INVENTORYENTRIES.LIST') or
                         voucher.findall('.//ALLINVENTORYENTRIES.LIST') or
                         voucher.findall('.//InventoryEntries'))

            for entry in inv_entries:
                stock_name = (entry.findtext('STOCKITEMNAME') or
                             entry.findtext('StockItemName') or 'Item')
                qty = abs(_safe_float(entry.findtext('.//ACTUALQTY') or
                                     entry.findtext('.//BILLEDQTY') or
                                     entry.findtext('Quantity') or '1', 1))
                rate = abs(_safe_float(entry.findtext('.//RATE') or
                                      entry.findtext('Rate') or '0'))
                amount = abs(_safe_float(entry.findtext('.//AMOUNT') or
                                        entry.findtext('Amount') or str(qty * rate)))

                items_list.append({
                    "description": stock_name,
                    "hsn_sac": "",
                    "quantity": qty,
                    "unit": "nos",
                    "unit_price": rate if rate > 0 else (amount / qty if qty > 0 else amount),
                    "discount_pct": 0,
                    "gst_rate": 18,
                    "taxable_value": amount,
                    "cgst_rate": 9, "sgst_rate": 9, "igst_rate": 0,
                    "cgst_amount": round(amount * 0.09, 2),
                    "sgst_amount": round(amount * 0.09, 2),
                    "igst_amount": 0,
                    "total_amount": round(amount * 1.18, 2),
                })

            if not items_list:
                # Fallback: use ledger entries
                ledger_entries = voucher.findall('.//ALLLEDGERENTRIES.LIST') or voucher.findall('.//LEDGERENTRIES.LIST')
                total_amount = 0
                for le in ledger_entries:
                    amt = _safe_float(le.findtext('AMOUNT') or le.findtext('Amount') or '0')
                    if amt < 0:  # Debit entries (sales)
                        total_amount = abs(amt)
                        break

                if total_amount > 0:
                    items_list.append({
                        "description": f"Imported from Tally - {v_no}",
                        "hsn_sac": "", "quantity": 1, "unit": "service",
                        "unit_price": total_amount, "discount_pct": 0,
                        "gst_rate": 18, "taxable_value": total_amount,
                        "cgst_rate": 9, "sgst_rate": 9, "igst_rate": 0,
                        "cgst_amount": round(total_amount * 0.09, 2),
                        "sgst_amount": round(total_amount * 0.09, 2),
                        "igst_amount": 0,
                        "total_amount": round(total_amount * 1.18, 2),
                    })

            if not items_list:
                continue

            total_taxable = sum(i["taxable_value"] for i in items_list)
            total_cgst = sum(i["cgst_amount"] for i in items_list)
            total_sgst = sum(i["sgst_amount"] for i in items_list)
            grand_total = total_taxable + total_cgst + total_sgst

            inv_type = "tax_invoice"
            if 'credit' in v_type:
                inv_type = "credit_note"
            elif 'debit' in v_type:
                inv_type = "debit_note"

            result["invoices"].append({
                "invoice_type": inv_type,
                "invoice_no": v_no or f"TALLY-{len(result['invoices'])+1:04d}",
                "invoice_date": _safe_date(v_date),
                "due_date": _safe_date(v_date, (date.today() + timedelta(days=30)).isoformat()),
                "client_name": party_name or "Unknown",
                "client_email": "", "client_phone": "",
                "client_gstin": "", "client_address": "", "client_state": "",
                "is_interstate": False,
                "items": items_list,
                "subtotal": round(total_taxable, 2),
                "total_taxable": round(total_taxable, 2),
                "total_cgst": round(total_cgst, 2),
                "total_sgst": round(total_sgst, 2),
                "total_igst": 0,
                "total_gst": round(total_cgst + total_sgst, 2),
                "grand_total": round(grand_total, 2),
                "amount_paid": 0,
                "amount_due": round(grand_total, 2),
                "status": "draft",
                "payment_terms": "Imported from Tally",
                "notes": "",
            })

    except ET.ParseError as e:
        raise HTTPException(400, f"Invalid XML file: {str(e)}")
    except Exception as e:
        logger.error(f"Tally XML parse failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse Tally XML: {str(e)}")

    result["stats"] = {
        "firms": 0,
        "clients": len(result["clients"]),
        "items": 0,
        "invoices": len(result["invoices"]),
        "payments": 0,
    }
    return result


# ─── JSON (Vyapar) Parser ─────────────────────────────────────────────────────

def _parse_json_file(file_path: str) -> dict:
    """
    Parses JSON backup files (Vyapar .vyb/.json format).
    """
    result = {
        "source": "json",
        "source_label": "JSON Backup",
        "firms": [],
        "clients": [],
        "items": [],
        "invoices": [],
        "payments": [],
        "stats": {},
    }

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Handle different JSON structures
        invoices_data = []
        if isinstance(data, list):
            invoices_data = data
        elif isinstance(data, dict):
            invoices_data = (data.get("invoices") or data.get("bills") or
                           data.get("transactions") or data.get("data") or [])
            if data.get("customers") or data.get("parties"):
                for c in (data.get("customers") or data.get("parties") or []):
                    result["clients"].append({
                        "full_name": c.get("name") or c.get("company_name") or "",
                        "phone_number": c.get("phone") or c.get("mobile") or "",
                        "email": c.get("email") or "",
                        "address": c.get("address") or "",
                        "name_gstin_number": c.get("gstin") or c.get("gst_number") or "",
                    })

        for inv in invoices_data:
            if not isinstance(inv, dict):
                continue

            client_name = (inv.get("customer_name") or inv.get("party_name") or
                          inv.get("client_name") or inv.get("buyer_name") or "Unknown")
            if not client_name or client_name == "Unknown":
                continue

            items_list = []
            for item in (inv.get("items") or inv.get("line_items") or inv.get("products") or []):
                qty = _safe_float(item.get("quantity") or item.get("qty"), 1)
                price = _safe_float(item.get("price") or item.get("rate") or item.get("unit_price"))
                gst = _safe_float(item.get("gst_rate") or item.get("tax_rate"), 18)
                taxable = qty * price
                half = gst / 2
                cgst = round(taxable * half / 100, 2)
                sgst = round(taxable * half / 100, 2)

                items_list.append({
                    "description": item.get("name") or item.get("description") or "Item",
                    "hsn_sac": item.get("hsn") or item.get("hsn_sac") or "",
                    "quantity": qty, "unit": item.get("unit") or "nos",
                    "unit_price": price, "discount_pct": _safe_float(item.get("discount")),
                    "gst_rate": gst, "taxable_value": round(taxable, 2),
                    "cgst_rate": half, "sgst_rate": half, "igst_rate": 0,
                    "cgst_amount": cgst, "sgst_amount": sgst, "igst_amount": 0,
                    "total_amount": round(taxable + cgst + sgst, 2),
                })

            if not items_list:
                total = _safe_float(inv.get("total") or inv.get("amount") or inv.get("grand_total"))
                if total > 0:
                    items_list.append({
                        "description": "Imported item", "hsn_sac": "",
                        "quantity": 1, "unit": "service", "unit_price": total,
                        "discount_pct": 0, "gst_rate": 18, "taxable_value": total,
                        "cgst_rate": 9, "sgst_rate": 9, "igst_rate": 0,
                        "cgst_amount": round(total * 0.09, 2),
                        "sgst_amount": round(total * 0.09, 2),
                        "igst_amount": 0,
                        "total_amount": round(total * 1.18, 2),
                    })

            if not items_list:
                continue

            total_taxable = sum(i["taxable_value"] for i in items_list)
            total_cgst = sum(i["cgst_amount"] for i in items_list)
            total_sgst = sum(i["sgst_amount"] for i in items_list)
            grand_total = total_taxable + total_cgst + total_sgst

            result["invoices"].append({
                "invoice_type": "tax_invoice",
                "invoice_no": inv.get("invoice_no") or inv.get("bill_no") or f"IMP-{len(result['invoices'])+1:04d}",
                "invoice_date": _safe_date(inv.get("date") or inv.get("invoice_date")),
                "due_date": _safe_date(inv.get("due_date"), (date.today() + timedelta(days=30)).isoformat()),
                "client_name": client_name,
                "client_email": inv.get("email") or "",
                "client_phone": inv.get("phone") or "",
                "client_gstin": inv.get("gstin") or "",
                "client_address": inv.get("address") or "",
                "client_state": inv.get("state") or "",
                "is_interstate": False,
                "items": items_list,
                "subtotal": round(total_taxable, 2),
                "total_taxable": round(total_taxable, 2),
                "total_cgst": round(total_cgst, 2),
                "total_sgst": round(total_sgst, 2),
                "total_igst": 0,
                "total_gst": round(total_cgst + total_sgst, 2),
                "grand_total": round(grand_total, 2),
                "amount_paid": _safe_float(inv.get("amount_paid")),
                "amount_due": round(grand_total - _safe_float(inv.get("amount_paid")), 2),
                "status": "draft",
                "payment_terms": "Imported",
                "notes": inv.get("notes") or "",
            })

    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid JSON file: {str(e)}")
    except Exception as e:
        logger.error(f"JSON parse failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse JSON: {str(e)}")

    result["stats"] = {
        "firms": 0,
        "clients": len(result["clients"]),
        "items": 0,
        "invoices": len(result["invoices"]),
        "payments": 0,
    }
    return result


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
    W = pdf.w - 28

    # ── Header ───────────────────────────────────────────────────────────
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

    # ── Invoice meta ───────────────────────────────────────────────────────
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

    # ── Buyer details ────────────────────────────────────────────────────
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

    # ── Items table ────────────────────────────────────────────────────────
    pdf.set_xy(14, bl_y + 28)
    pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*BRAND)
    _cell(pdf, 0, 6, "Items / Services", nl=True)
    pdf.set_draw_color(*BRAND)
    pdf.line(14, pdf.get_y(), 14 + W, pdf.get_y())
    pdf.ln(1)

    is_inter = inv.get("is_interstate", False)
    sr_w = 8; hsn_w = 22; qty_w = 14; unit_w = 16; rate_w = 26; tax_w = 18; amt_w = 26
    desc_w = W - sr_w - hsn_w - qty_w - unit_w - rate_w - (0 if is_inter else tax_w * 2) - (tax_w if is_inter else 0) - amt_w

    def _th(txt, w, a="C"):
        pdf.set_fill_color(*BRAND); pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 7)
        _cell(pdf, w, 7, txt, align=a, fill=True, nl=False)

    _th("Sr", sr_w); _th("Description", desc_w, "L"); _th("HSN/SAC", hsn_w)
    _th("Qty", qty_w); _th("Unit", unit_w); _th("Rate", rate_w, "R")
    if is_inter:
        _th("IGST%", tax_w); _th("IGST Amt", amt_w, "R")
    else:
        _th("CGST%", tax_w); _th("CGST Amt", tax_w, "R")
        _th("SGST%", tax_w); _th("SGST Amt", tax_w, "R")
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
        _cell(pdf, rate_w, 7, f"{it.get('unit_price',0):,.2f}", align="R", fill=True, nl=False)
        if is_inter:
            _cell(pdf, tax_w, 7, f"{it.get('igst_rate',0):.1f}%", align="C", fill=True, nl=False)
            _cell(pdf, amt_w, 7, f"{it.get('igst_amount',0):,.2f}", align="R", fill=True, nl=False)
        else:
            _cell(pdf, tax_w, 7, f"{it.get('cgst_rate',0):.1f}%", align="C", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{it.get('cgst_amount',0):,.2f}", align="R", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{it.get('sgst_rate',0):.1f}%", align="C", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{it.get('sgst_amount',0):,.2f}", align="R", fill=True, nl=False)
        _cell(pdf, amt_w, 7, f"{it.get('total_amount',0):,.2f}", align="R", fill=True, nl=True)

    # ── Totals ─────────────────────────────────────────────────────────────
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

    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 8); pdf.set_text_color(*MUTED)
    _cell(pdf, 0, 5, _s(_amount_in_words(float(inv.get("grand_total", 0)))), nl=True)

    # ── GST summary ───────────────────────────────────────────────────────
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

    # ── Bank details ────────────────────────────────────────────────────────
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

    # ── Payment status stamp ────────────────────────────────────────────────
    paid_status = inv.get("status", "")
    if paid_status == "paid":
        stamp_y = pdf.get_y() + 2
        pdf.set_xy(14 + W - 60, stamp_y)
        pdf.set_draw_color(*GREEN); pdf.set_font("Helvetica", "B", 18)
        pdf.set_text_color(*GREEN)
        pdf.cell(50, 12, "PAID", border=1, align="C")

    # ── Notes / T&C ────────────────────────────────────────────────────────
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

    # ── Signature ──────────────────────────────────────────────────────────
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

    buf = BytesIO()
    buf.write(pdf.output())
    buf.seek(0)
    return buf


# ════════════════════════════════════════════════════════════════════════════════
# UNIVERSAL BACKUP IMPORT ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/invoices/parse-vyp")
async def parse_vyp_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Parse a KhataBook .vyp backup file.
    Accepts multipart/form-data with a 'file' field.
    Returns structured data: firms, clients, items, invoices, payments.
    """
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")

    tmp_path = None
    try:
        suffix = ".vyp"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        content = await file.read()
        tmp.write(content)
        tmp.close()
        tmp_path = tmp.name

        result = _parse_vyp_file(tmp_path)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"VYP upload parse failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse .vyp file: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


@router.post("/invoices/parse-backup")
async def parse_backup_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Universal backup parser. Detects file format and routes to the appropriate parser.

    Supported formats:
      - .vyp, .db     → KhataBook SQLite backup
      - .xml          → Tally XML export
      - .xlsx, .xls   → Excel (Vyapar, myBillBook, generic)
      - .csv          → CSV (any accounting software export)
      - .json, .vyb   → JSON (Vyapar backup)

    Returns structured data: { source, firms, clients, items, invoices, payments, stats }
    """
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")

    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    supported = {
        "vyp": "vyp", "db": "vyp",
        "xml": "xml", "tbk": "xml",
        "xlsx": "excel", "xls": "excel", "csv": "excel",
        "json": "json", "vyb": "json",
    }

    parser_type = supported.get(ext)
    if not parser_type:
        raise HTTPException(
            400,
            f"Unsupported file format: .{ext}. "
            f"Supported: .vyp, .db, .xml, .tbk, .xlsx, .xls, .csv, .json, .vyb"
        )

    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
        content = await file.read()
        tmp.write(content)
        tmp.close()
        tmp_path = tmp.name

        # Route to parser
        if parser_type == "vyp":
            result = _parse_vyp_file(tmp_path)
        elif parser_type == "xml":
            result = _parse_tally_xml(tmp_path)
        elif parser_type == "excel":
            result = _parse_excel_file(tmp_path, filename)
        elif parser_type == "json":
            result = _parse_json_file(tmp_path)
        else:
            raise HTTPException(400, f"No parser available for .{ext}")

        # Save original backup file to Google Drive "backups" folder
        upload_to_drive(content, f"Backup_{filename}", "backups", file.content_type or "application/octet-stream")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Backup parse failed ({filename}): {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse backup file: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


# ════════════════════════════════════════════════════════════════════════════════
# PRODUCT CATALOG ENDPOINTS  (still uses MongoDB — unchanged)
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
# INVOICE ENDPOINTS  (Google Drive storage)
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
    # Save PDF and JSON to Google Drive — no MongoDB insert
    company = await db.companies.find_one({"id": raw.get("company_id")})
    pdf_buf = _build_invoice_pdf(raw, company)
    pdf_bytes = pdf_buf.getvalue()
    json_bytes = json.dumps(raw, default=str).encode()
    upload_to_drive(pdf_bytes, f"Invoice_{inv_no}.pdf", "invoices", "application/pdf")
    upload_to_drive(json_bytes, f"Invoice_{inv_no}.json", "invoices", "application/json")
    return {"status": "success", "invoice_no": inv_no, "message": "Invoice saved to Google Drive only"}


@router.get("/invoices")
async def list_invoices(current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    files = list_drive_files("invoices")
    invoices = []
    for f in files:
        if f['name'].endswith('.json'):
            invoices.append({
                "invoice_no": f['name'].replace("Invoice_", "").replace(".json", ""),
                "drive_id": f['id'],
                "webViewLink": f.get('webViewLink'),
                "created_at": f.get('createdTime')
            })
    return invoices


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
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    files = list_drive_files("invoices")
    for f in files:
        if f['name'] == f"Invoice_{inv_id}.json" or inv_id in f['name']:
            return {"invoice_no": inv_id, "drive_id": f['id'], "webViewLink": f.get('webViewLink')}
    raise HTTPException(404, "Invoice not found in Google Drive")


@router.put("/invoices/{inv_id}")
async def update_invoice(inv_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    # Note: MongoDB writes removed; update logic is Drive-only
    # To update, re-upload a revised JSON/PDF to Drive
    for f in ("id", "invoice_no", "created_by", "created_at", "amount_paid"):
        data.pop(f, None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["invoice_no"] = inv_id
    data = _compute_invoice_totals(data)
    data["amount_due"] = round(data["grand_total"] - data.get("amount_paid", 0), 2)
    company = await db.companies.find_one({"id": data.get("company_id")})
    pdf_buf = _build_invoice_pdf(data, company or {})
    pdf_bytes = pdf_buf.getvalue()
    json_bytes = json.dumps(data, default=str).encode()
    upload_to_drive(pdf_bytes, f"Invoice_{inv_id}_updated.pdf", "invoices", "application/pdf")
    upload_to_drive(json_bytes, f"Invoice_{inv_id}_updated.json", "invoices", "application/json")
    return {"status": "success", "invoice_no": inv_id, "message": "Invoice updated in Google Drive"}


@router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    # MongoDB deletes removed; Drive files are not deleted automatically
    # In production you can call service.files().delete(fileId=...) here
    return {"message": f"Invoice {inv_id} delete requested. Remove file manually from Drive if needed."}


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
            description=it.get("description", ""),
            quantity=float(it.get("quantity", 1)),
            unit=it.get("unit", "service"),
            unit_price=float(it.get("unit_price", 0)),
            gst_rate=float(q.get("gst_rate", 18)),
        ))
    create_data = InvoiceCreate(
        invoice_type="tax_invoice",
        company_id=q.get("company_id", ""),
        quotation_id=qtn_id,
        lead_id=q.get("lead_id"),
        client_id=q.get("client_id"),
        client_name=q.get("client_name", ""),
        client_address=q.get("client_address", ""),
        client_email=q.get("client_email", ""),
        client_phone=q.get("client_phone", ""),
        items=inv_items,
        gst_rate=q.get("gst_rate", 18),
        payment_terms=q.get("payment_terms", ""),
        notes=q.get("notes", ""),
        status="draft",
    )
    return await create_invoice(create_data, current_user)


# ── Send invoice via email ─────────────────────────────────────────────────────
@router.post("/invoices/{inv_id}/send-email")
async def send_invoice_email(
    inv_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    # Find PDF in Drive
    files = list_drive_files("invoices")
    pdf_file = next((f for f in files if f['name'] == f"Invoice_{inv_id}.pdf"), None)
    if not pdf_file:
        raise HTTPException(404, "Invoice PDF not found in Google Drive")
    # In production: download PDF bytes from Drive and attach to email
    return {"message": "Email would be sent with PDF from Google Drive", "invoice_no": inv_id}


# ── Mark sent ───────────────────────────────────────────────────────────────────
@router.post("/invoices/{inv_id}/mark-sent")
async def mark_invoice_sent(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    # MongoDB update removed — status tracking now managed via Drive JSON file
    return {"message": f"Invoice {inv_id} marked as sent (update Drive JSON to reflect status)"}


# ── Recurring invoice generator ─────────────────────────────────────────────────
@router.post("/invoices/{inv_id}/generate-recurring")
async def generate_recurring(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    # Fetch template JSON from Drive
    files = list_drive_files("invoices")
    tmpl_file = next((f for f in files if inv_id in f['name'] and f['name'].endswith('.json')), None)
    if not tmpl_file:
        raise HTTPException(404, "Recurring invoice template not found in Google Drive")
    now = datetime.now(timezone.utc).isoformat()
    prefix = "INV"
    inv_no = await _next_invoice_no(prefix)
    # Build a minimal new invoice record and save to Drive
    new_inv = {
        "id": str(uuid.uuid4()),
        "invoice_no": inv_no,
        "invoice_date": date.today().isoformat(),
        "due_date": (date.today() + timedelta(days=30)).isoformat(),
        "status": "draft",
        "amount_paid": 0.0,
        "amount_due": 0.0,
        "is_recurring": False,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "source_template": inv_id,
    }
    json_bytes = json.dumps(new_inv, default=str).encode()
    # MongoDB insert removed — save to Drive only
    upload_to_drive(json_bytes, f"Invoice_{inv_no}.json", "invoices", "application/json")
    return {"status": "success", "invoice_no": inv_no, "message": "Recurring invoice generated and saved to Google Drive"}


# ════════════════════════════════════════════════════════════════════════════════
# PAYMENT ENDPOINTS  (Google Drive storage)
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/payments", response_model=Payment)
async def record_payment(data: PaymentCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")

    # Find invoice JSON in Drive to confirm it exists
    files = list_drive_files("invoices")
    inv_file = next((f for f in files if data.invoice_id in f['name']), None)
    if not inv_file:
        raise HTTPException(404, "Invoice not found in Drive")

    payment_data = {
        **data.model_dump(),
        "id": str(uuid.uuid4()),
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    json_bytes = json.dumps(payment_data, default=str).encode()
    # MongoDB insert removed — save to Drive only
    upload_to_drive(
        json_bytes,
        f"Payment_{data.invoice_id}_{datetime.now().strftime('%Y%m%d')}.json",
        "payments",
        "application/json"
    )

    return {"status": "success", "message": "Payment recorded in Google Drive"}


@router.get("/payments")
async def list_payments(
    invoice_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    files = list_drive_files("payments")
    payments = []
    for f in files:
        if f['name'].endswith('.json'):
            if invoice_id and invoice_id not in f['name']:
                continue
            payments.append({
                "filename": f['name'],
                "drive_id": f['id'],
                "webViewLink": f.get('webViewLink'),
                "created_at": f.get('createdTime')
            })
    return payments


@router.delete("/payments/{pid}")
async def delete_payment(pid: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    # MongoDB deletes removed — Drive file deletion requires explicit Drive API call
    return {"message": f"Payment {pid} delete requested. Remove file manually from Drive if needed."}


# ════════════════════════════════════════════════════════════════════════════════
# CREDIT NOTE ENDPOINTS  (Google Drive storage)
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/credit-notes")
async def create_credit_note(data: CreditNoteCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")

    inv_no = await _next_invoice_no("CN")
    raw = {
        "id": str(uuid.uuid4()),
        "invoice_no": inv_no,
        "invoice_type": "credit_note",
        **data.model_dump(),
        "invoice_date": date.today().isoformat(),
        "due_date": date.today().isoformat(),
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    raw = _compute_invoice_totals(raw)

    company = await db.companies.find_one({"id": raw.get("company_id")})
    pdf_buf = _build_invoice_pdf(raw, company or {})
    pdf_bytes = pdf_buf.getvalue()
    json_bytes = json.dumps(raw, default=str).encode()

    # MongoDB inserts removed — save to Drive only
    upload_to_drive(pdf_bytes, f"CreditNote_{inv_no}.pdf", "credit_notes", "application/pdf")
    upload_to_drive(json_bytes, f"CreditNote_{inv_no}.json", "credit_notes", "application/json")

    return {"status": "success", "invoice_no": inv_no, "message": "Credit Note saved to Google Drive"}


# ════════════════════════════════════════════════════════════════════════════════
# PDF EXPORT  (Google Drive)
# ════════════════════════════════════════════════════════════════════════════════

@router.get("/invoices/{inv_id}/pdf")
async def download_invoice_pdf(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")

    files = list_drive_files("invoices")
    pdf_file = next((f for f in files if f['name'] == f"Invoice_{inv_id}.pdf"), None)
    if not pdf_file:
        raise HTTPException(404, "PDF not found in Drive")

    # Return the Drive web view link for direct download
    return {"download_link": pdf_file.get('webViewLink'), "filename": f"Invoice_{inv_id}.pdf"}
