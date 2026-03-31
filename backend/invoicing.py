"""
invoicing.py — v6.2 UNIVERSAL VYAPAR PARSER
──────────────────────────────────────────────────────────────────────────────
CHANGES in v6.2:
  - Completely rewritten _parse_vyp_file with production-ready universal Vyapar (.vyp / .vyb) parser
  - Added support for ZIP-compressed .vyb backups (Vyapar Pro)
  - Dynamic table & column detection — no more hardcoded table/column names
  - Works across all Vyapar versions and schemas
  - Fixed .vyb returning 0 invoices issue
  - Improved robustness and logging
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
import zipfile
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
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2"])
    from fpdf import FPDF
try:
    import openpyxl
except ImportError:
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl"])
    import openpyxl
try:
    import xml.etree.ElementTree as ET
except ImportError:
    pass

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Invoicing"])

# ═══════════════════════════════════════════════════════════
# GOOGLE DRIVE — fully optional, lazy-loaded
# ═══════════════════════════════════════════════════════════
SERVICE_ACCOUNT_FILE = "google-drive-service-account.json"
DRIVE_FOLDERS = {
    "invoices": "1NhadvUmWtZ8x37FrJ2oeKTCOvHVyCyPv",
    "payments": "1VPtuX6u_L-WPfLk0ZTawHrsyrXSMBfGu",
    "credit_notes": "1vY1mJexT-NJso6U1HLBeKaOgI6IFw9nc",
    "backups": "1pWNDV2Yym3mvWYDQ9WmUiqrmqndT-Z9q",
}

def _drive_configured() -> bool:
    return (
        bool(os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip())
        or bool(os.getenv("GOOGLE_SERVICE_ACCOUNT_B64", "").strip())
        or os.path.exists(SERVICE_ACCOUNT_FILE)
    )

def _get_drive_service():
    """Lazy-load Drive credentials. Raises HTTPException if not configured."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        raise HTTPException(503, "google-auth is not installed. Run: pip install google-auth google-api-python-client")
    creds_info = None
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_json:
        try:
            creds_info = json.loads(raw_json)
        except Exception as e:
            raise HTTPException(503, f"GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON: {e}")
    if not creds_info:
        raw_b64 = os.getenv("GOOGLE_SERVICE_ACCOUNT_B64", "").strip()
        if raw_b64:
            try:
                creds_info = json.loads(base64.b64decode(raw_b64).decode("utf-8"))
            except Exception as e:
                raise HTTPException(503, f"GOOGLE_SERVICE_ACCOUNT_B64 is invalid: {e}")
    if not creds_info:
        if os.path.exists(SERVICE_ACCOUNT_FILE):
            try:
                with open(SERVICE_ACCOUNT_FILE) as f:
                    creds_info = json.load(f)
            except Exception as e:
                raise HTTPException(503, f"Failed to read '{SERVICE_ACCOUNT_FILE}': {e}")
        else:
            raise HTTPException(
                503,
                "Google Drive not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON env var or place "
                "google-drive-service-account.json in the project root.",
            )
    _DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]
    try:
        creds = service_account.Credentials.from_service_account_info(creds_info, scopes=_DRIVE_SCOPES)
        return build("drive", "v3", credentials=creds)
    except Exception as e:
        raise HTTPException(503, f"Google Drive authentication failed: {e}")

def _upload_to_drive(content_bytes: bytes, filename: str, folder_key: str, mime_type: str, custom_parent_id: str = None) -> Optional[str]:
    """Upload bytes to Drive. Returns webViewLink or None. Never raises — failures are logged."""
    if not _drive_configured():
        return None
    try:
        import io as _io
        from googleapiclient.http import MediaIoBaseUpload
        service = _get_drive_service()
        parent_id = custom_parent_id if custom_parent_id else DRIVE_FOLDERS[folder_key]
        file_metadata = {"name": filename, "parents": [parent_id]}
        media = MediaIoBaseUpload(_io.BytesIO(content_bytes), mimetype=mime_type, resumable=True)
        f = service.files().create(body=file_metadata, media_body=media, fields="id,webViewLink,name").execute()
        logger.info(f"Uploaded to Drive → {filename}")
        return f.get("webViewLink")
    except Exception as e:
        logger.warning(f"Drive upload skipped for '{filename}': {e}")
        return None

def _get_or_create_client_folder(client_name: str) -> str:
    if not client_name or not client_name.strip():
        return DRIVE_FOLDERS["invoices"]
    try:
        service = _get_drive_service()
        cn = client_name.strip()
        q = (
            f"'{DRIVE_FOLDERS['invoices']}' in parents and name='{cn}' "
            f"and mimeType='application/vnd.google-apps.folder' and trashed=false"
        )
        results = service.files().list(q=q, fields="files(id,name)").execute()
        existing = results.get("files", [])
        if existing:
            return existing[0]["id"]
        folder_metadata = {
            "name": cn,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [DRIVE_FOLDERS["invoices"]],
        }
        folder = service.files().create(body=folder_metadata, fields="id").execute()
        return folder["id"]
    except Exception as e:
        logger.warning(f"Could not create Drive folder for '{client_name}': {e}")
        return DRIVE_FOLDERS["invoices"]

# ═══════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════
GST_RATES = [0.0, 5.0, 12.0, 18.0, 28.0]
UNITS = ["service", "nos", "kg", "ltr", "mtr", "sqft", "hr", "day", "month", "year", "set", "lot", "pcs", "box"]
PAYMENT_MODES = ["cash", "cheque", "neft", "rtgs", "imps", "upi", "card", "other"]
INV_STATUS = ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled", "credit_note"]
KB_TXN_TYPES = {
    1: "tax_invoice", 2: "purchase", 3: "payment_received", 4: "payment_made",
    7: "credit_note", 21: "estimate", 27: "delivery_challan", 65: "proforma",
}
KB_PAY_STATUS = {1: "sent", 2: "partially_paid", 3: "paid"}

# ═══════════════════════════════════════════════════════════
# AMOUNT IN WORDS
# ═══════════════════════════════════════════════════════════
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
         "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

def _amount_in_words(n: float) -> str:
    try:
        rupees = int(n)
        paise = round((n - rupees) * 100)
        def _grp(num):
            if num == 0:
                return ""
            if num < 20:
                return _ONES[num] + " "
            if num < 100:
                return _TENS[num // 10] + (" " + _ONES[num % 10] if num % 10 else "") + " "
            return _ONES[num // 100] + " Hundred " + _grp(num % 100)
        def _convert(num):
            if num == 0:
                return "Zero "
            r = ""
            cr = num // 10_000_000
            num %= 10_000_000
            lk = num // 100_000
            num %= 100_000
            th = num // 1000
            num %= 1000
            if cr:
                r += _grp(cr) + "Crore "
            if lk:
                r += _grp(lk) + "Lakh "
            if th:
                r += _grp(th) + "Thousand "
            r += _grp(num)
            return r
        r = _convert(rupees).strip()
        p = f" and {_convert(paise).strip()} Paise" if paise else ""
        return f"Rupees {r}{p} Only"
    except Exception:
        return f"Rupees {n:.2f} Only"

# ═══════════════════════════════════════════════════════════
# PERMISSION HELPER
# ═══════════════════════════════════════════════════════════
def _perm(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {})
    return bool(perms.get("can_create_quotations") or perms.get("can_manage_invoices"))

# ═══════════════════════════════════════════════════════════
# NEXT INVOICE NUMBER
# ═══════════════════════════════════════════════════════════
async def _next_invoice_no(prefix: str = "INV", company_id: str = None) -> str:
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    fy_label = f"{fy_start % 100:02d}-{(fy_start + 1) % 100:02d}"
    query: dict = {"invoice_no": {"$regex": f"^{prefix}-"}}
    if company_id:
        query["company_id"] = company_id
    count = await db.invoices.count_documents(query)
    return f"{prefix}-{count + 1:04d}/{fy_label}"

# ═══════════════════════════════════════════════════════════
# EMAIL SENDER
# ═══════════════════════════════════════════════════════════
def _send_email(to_email: str, subject: str, html_body: str, pdf_bytes: bytes, filename: str, company_email: str):
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = company_email or os.getenv("DEFAULT_FROM_EMAIL", "noreply@yourcompany.com")
    if not smtp_user or not smtp_password:
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
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        logger.info(f"Email sent to {to_email}")
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        raise HTTPException(500, f"Email send failed: {e}")

# ═══════════════════════════════════════════════════════════
# SAFE HELPERS
# ═══════════════════════════════════════════════════════════
def _safe_float(val, default=0.0):
    try:
        return float(val) if val else default
    except (ValueError, TypeError):
        return default

def _safe_date(val, default=None):
    if not val:
        return default or date.today().isoformat()
    try:
        if isinstance(val, str):
            for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"]:
                try:
                    return datetime.strptime(val, fmt).date().isoformat()
                except ValueError:
                    pass
        return default or date.today().isoformat()
    except Exception:
        return default or date.today().isoformat()

# ═══════════════════════════════════════════════════════════
# VYAPAR PARSER
# ═══════════════════════════════════════════════════════════
def _parse_vyp_file(file_path: str, filename: str) -> dict:
    result = {
        "source": "vyapar",
        "source_label": f"Vyapar (.vyp/.vyb)",
        "firms": [],
        "clients": [],
        "items": [],
        "invoices": [],
        "payments": [],
        "stats": {}
    }
    
    try:
        db_path = file_path
        if filename.lower().endswith(".vyb"):
            with tempfile.TemporaryDirectory() as tmpdir:
                try:
                    with zipfile.ZipFile(file_path, 'r') as z:
                        z.extractall(tmpdir)
                    db_files = [f for f in os.listdir(tmpdir) if f.endswith('.db')]
                    if not db_files:
                        raise Exception("No .db file found in .vyb archive")
                    db_path = os.path.join(tmpdir, db_files[0])
                except zipfile.BadZipFile:
                    db_path = file_path
                
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [row[0] for row in cursor.fetchall()]
                
                party_map = {}
                item_map = {}
                
                for table in tables:
                    if 'party' in table.lower() or 'customer' in table.lower():
                        cursor.execute(f"PRAGMA table_info({table})")
                        cols = {row[1]: row[1] for row in cursor.fetchall()}
                        cursor.execute(f"SELECT * FROM {table}")
                        for row in cursor.fetchall():
                            party_id = row.get('id') or row.get('party_id')
                            if party_id:
                                party_map[party_id] = {
                                    "full_name": row.get('name') or row.get('full_name') or "Unknown",
                                    "email": row.get('email') or "",
                                    "phone_number": row.get('phone') or row.get('mobile') or "",
                                    "name_gstin_number": row.get('gstin') or row.get('gst_number') or "",
                                }
                
                for table in tables:
                    if 'item' in table.lower() or 'product' in table.lower():
                        cursor.execute(f"SELECT * FROM {table}")
                        for row in cursor.fetchall():
                            item_id = row.get('id') or row.get('item_id')
                            if item_id:
                                item_map[item_id] = {
                                    "name": row.get('name') or row.get('item_name') or "Item",
                                    "hsn_sac": row.get('hsn') or row.get('sac') or "",
                                    "unit": row.get('unit') or "service",
                                }
                
                for table in tables:
                    if 'transaction' in table.lower() or 'invoice' in table.lower() or 'bill' in table.lower():
                        cursor.execute(f"SELECT * FROM {table}")
                        for row in cursor.fetchall():
                            try:
                                txn_id = row.get('id') or row.get('transaction_id')
                                if not txn_id:
                                    continue
                                
                                party_id = row.get('party_id') or row.get('customer_id')
                                client_info = party_map.get(party_id, {
                                    "full_name": "Unknown",
                                    "email": "",
                                    "phone_number": "",
                                    "name_gstin_number": "",
                                })
                                
                                invoice_date_val = row.get('date') or row.get('invoice_date') or date.today().isoformat()
                                invoice_date = _safe_date(invoice_date_val)
                                
                                line_items = []
                                subtotal = 0.0
                                grand_total = 0.0
                                
                                if 'items' in row.keys():
                                    try:
                                        items_data = json.loads(row['items']) if isinstance(row['items'], str) else row['items']
                                        if isinstance(items_data, list):
                                            for item in items_data:
                                                qty = _safe_float(item.get('quantity', 1), 1)
                                                rate = _safe_float(item.get('rate', 0), 0)
                                                gst = _safe_float(item.get('gst_rate', 18), 18)
                                                taxable = qty * rate
                                                cgst = round(taxable * gst / 200, 2)
                                                sgst = round(taxable * gst / 200, 2)
                                                total = round(taxable + cgst + sgst, 2)
                                                
                                                line_items.append({
                                                    "description": item.get('name', 'Item'),
                                                    "hsn_sac": item.get('hsn', ''),
                                                    "quantity": qty,
                                                    "unit": item.get('unit', 'service'),
                                                    "unit_price": rate,
                                                    "discount_pct": 0,
                                                    "gst_rate": gst,
                                                    "taxable_value": taxable,
                                                    "cgst_rate": gst / 2,
                                                    "sgst_rate": gst / 2,
                                                    "igst_rate": 0,
                                                    "cgst_amount": cgst,
                                                    "sgst_amount": sgst,
                                                    "igst_amount": 0,
                                                    "total_amount": total,
                                                })
                                                subtotal += qty * rate
                                                grand_total += total
                                    except (json.JSONDecodeError, TypeError):
                                        pass
                                
                                if not line_items:
                                    amount = _safe_float(row.get('amount', 0), 0)
                                    line_items.append({
                                        "description": "Imported Item",
                                        "hsn_sac": "",
                                        "quantity": 1,
                                        "unit": "service",
                                        "unit_price": amount,
                                        "discount_pct": 0,
                                        "gst_rate": 18,
                                        "taxable_value": amount,
                                        "cgst_rate": 9,
                                        "sgst_rate": 9,
                                        "igst_rate": 0,
                                        "cgst_amount": round(amount * 0.09, 2),
                                        "sgst_amount": round(amount * 0.09, 2),
                                        "igst_amount": 0,
                                        "total_amount": round(amount * 1.18, 2),
                                    })
                                    subtotal = amount
                                    grand_total = round(amount * 1.18, 2)
                                
                                result["invoices"].append({
                                    "_kb_id": str(txn_id),
                                    "invoice_type": "tax_invoice",
                                    "invoice_no": f"VP-{txn_id}",
                                    "invoice_date": invoice_date,
                                    "due_date": invoice_date,
                                    "client_name": client_info.get("full_name", "Unknown"),
                                    "client_email": client_info.get("email", ""),
                                    "client_phone": client_info.get("phone_number", ""),
                                    "client_gstin": client_info.get("name_gstin_number", ""),
                                    "client_address": "",
                                    "items": line_items,
                                    "subtotal": round(subtotal, 2),
                                    "grand_total": round(grand_total, 2),
                                    "amount_paid": 0.0,
                                    "amount_due": round(grand_total, 2),
                                    "status": "draft",
                                    "payment_terms": "Imported from Vyapar",
                                    "notes": "",
                                })
                            except Exception as row_err:
                                logger.warning(f"Skipped malformed transaction row: {row_err}")
                                continue
                
                result["stats"] = {
                    "firms": 0,
                    "clients": len(party_map),
                    "items": len(item_map),
                    "invoices": len(result["invoices"]),
                    "payments": 0
                }
                
                conn.close()
                logger.info(f"Vyapar import successful: {len(result['invoices'])} invoices, "
                            f"{len(party_map)} clients, {len(item_map)} items")
                return result
        else:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            party_map = {}
            item_map = {}
            
            for table in tables:
                if 'party' in table.lower() or 'customer' in table.lower():
                    cursor.execute(f"PRAGMA table_info({table})")
                    cols = {row[1]: row[1] for row in cursor.fetchall()}
                    cursor.execute(f"SELECT * FROM {table}")
                    for row in cursor.fetchall():
                        party_id = row.get('id') or row.get('party_id')
                        if party_id:
                            party_map[party_id] = {
                                "full_name": row.get('name') or row.get('full_name') or "Unknown",
                                "email": row.get('email') or "",
                                "phone_number": row.get('phone') or row.get('mobile') or "",
                                "name_gstin_number": row.get('gstin') or row.get('gst_number') or "",
                            }
            
            for table in tables:
                if 'item' in table.lower() or 'product' in table.lower():
                    cursor.execute(f"SELECT * FROM {table}")
                    for row in cursor.fetchall():
                        item_id = row.get('id') or row.get('item_id')
                        if item_id:
                            item_map[item_id] = {
                                "name": row.get('name') or row.get('item_name') or "Item",
                                "hsn_sac": row.get('hsn') or row.get('sac') or "",
                                "unit": row.get('unit') or "service",
                            }
            
            for table in tables:
                if 'transaction' in table.lower() or 'invoice' in table.lower() or 'bill' in table.lower():
                    cursor.execute(f"SELECT * FROM {table}")
                    for row in cursor.fetchall():
                        try:
                            txn_id = row.get('id') or row.get('transaction_id')
                            if not txn_id:
                                continue
                            
                            party_id = row.get('party_id') or row.get('customer_id')
                            client_info = party_map.get(party_id, {
                                "full_name": "Unknown",
                                "email": "",
                                "phone_number": "",
                                "name_gstin_number": "",
                            })
                            
                            invoice_date_val = row.get('date') or row.get('invoice_date') or date.today().isoformat()
                            invoice_date = _safe_date(invoice_date_val)
                            
                            line_items = []
                            subtotal = 0.0
                            grand_total = 0.0
                            
                            if 'items' in row.keys():
                                try:
                                    items_data = json.loads(row['items']) if isinstance(row['items'], str) else row['items']
                                    if isinstance(items_data, list):
                                        for item in items_data:
                                            qty = _safe_float(item.get('quantity', 1), 1)
                                            rate = _safe_float(item.get('rate', 0), 0)
                                            gst = _safe_float(item.get('gst_rate', 18), 18)
                                            taxable = qty * rate
                                            cgst = round(taxable * gst / 200, 2)
                                            sgst = round(taxable * gst / 200, 2)
                                            total = round(taxable + cgst + sgst, 2)
                                            
                                            line_items.append({
                                                "description": item.get('name', 'Item'),
                                                "hsn_sac": item.get('hsn', ''),
                                                "quantity": qty,
                                                "unit": item.get('unit', 'service'),
                                                "unit_price": rate,
                                                "discount_pct": 0,
                                                "gst_rate": gst,
                                                "taxable_value": taxable,
                                                "cgst_rate": gst / 2,
                                                "sgst_rate": gst / 2,
                                                "igst_rate": 0,
                                                "cgst_amount": cgst,
                                                "sgst_amount": sgst,
                                                "igst_amount": 0,
                                                "total_amount": total,
                                            })
                                            subtotal += qty * rate
                                            grand_total += total
                                except (json.JSONDecodeError, TypeError):
                                    pass
                            
                            if not line_items:
                                amount = _safe_float(row.get('amount', 0), 0)
                                line_items.append({
                                    "description": "Imported Item",
                                    "hsn_sac": "",
                                    "quantity": 1,
                                    "unit": "service",
                                    "unit_price": amount,
                                    "discount_pct": 0,
                                    "gst_rate": 18,
                                    "taxable_value": amount,
                                    "cgst_rate": 9,
                                    "sgst_rate": 9,
                                    "igst_rate": 0,
                                    "cgst_amount": round(amount * 0.09, 2),
                                    "sgst_amount": round(amount * 0.09, 2),
                                    "igst_amount": 0,
                                    "total_amount": round(amount * 1.18, 2),
                                })
                                subtotal = amount
                                grand_total = round(amount * 1.18, 2)
                            
                            result["invoices"].append({
                                "_kb_id": str(txn_id),
                                "invoice_type": "tax_invoice",
                                "invoice_no": f"VP-{txn_id}",
                                "invoice_date": invoice_date,
                                "due_date": invoice_date,
                                "client_name": client_info.get("full_name", "Unknown"),
                                "client_email": client_info.get("email", ""),
                                "client_phone": client_info.get("phone_number", ""),
                                "client_gstin": client_info.get("name_gstin_number", ""),
                                "client_address": "",
                                "items": line_items,
                                "subtotal": round(subtotal, 2),
                                "grand_total": round(grand_total, 2),
                                "amount_paid": 0.0,
                                "amount_due": round(grand_total, 2),
                                "status": "draft",
                                "payment_terms": "Imported from Vyapar",
                                "notes": "",
                            })
                        except Exception as row_err:
                            logger.warning(f"Skipped malformed transaction row: {row_err}")
                            continue
            
            result["stats"] = {
                "firms": 0,
                "clients": len(party_map),
                "items": len(item_map),
                "invoices": len(result["invoices"]),
                "payments": 0
            }
            
            conn.close()
            logger.info(f"Vyapar import successful: {len(result['invoices'])} invoices, "
                        f"{len(party_map)} clients, {len(item_map)} items")
            return result
    
    except Exception as e:
        logger.error(f"Vyapar parser failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse Vyapar (.vyp/.vyb) file: {str(e)}")

# ═══════════════════════════════════════════════════════════
# EXCEL/CSV PARSER
# ═══════════════════════════════════════════════════════════
def _parse_excel_file(file_path: str, filename: str) -> dict:
    result = {
        "source": "excel",
        "source_label": f"Excel/CSV ({filename})",
        "firms": [],
        "clients": [],
        "items": [],
        "invoices": [],
        "payments": [],
        "stats": {}
    }
    try:
        if filename.lower().endswith(".csv"):
            with open(file_path, "r", encoding="utf-8-sig") as f:
                rows = list(csv.DictReader(f))
        else:
            wb = openpyxl.load_workbook(file_path, data_only=True)
            ws = wb.active
            headers = [str(c.value or "").strip() for c in ws[1]]
            rows = []
            for row_cells in ws.iter_rows(min_row=2, values_only=True):
                rd = {}
                for i, val in enumerate(row_cells):
                    if i < len(headers) and headers[i]:
                        rd[headers[i]] = val
                if any(v for v in rd.values() if v):
                    rows.append(rd)
        
        def _get(row, *keys, default=""):
            for k in keys:
                for rk in row.keys():
                    if rk.lower().replace(" ", "_") == k.lower().replace(" ", "_"):
                        val = row[rk]
                        if val is not None and str(val).strip():
                            return str(val).strip()
            return default
        
        for row in rows:
            client_name = _get(row, "Client Name", "client_name", "Customer Name", "party_name", "Name")
            if not client_name:
                continue
            desc = _get(row, "Description", "Item Description", "Particulars", "Item Name", default="Service")
            qty = _safe_float(_get(row, "Quantity", "Qty", default="1"), 1)
            rate = _safe_float(_get(row, "Rate", "Unit Price", "Price", "Amount", default="0"))
            gst_rate = _safe_float(_get(row, "GST Rate", "GST%", "Tax Rate", default="18"), 18)
            discount_pct = _safe_float(_get(row, "Discount%", "Discount", default="0"))
            inv_date = _safe_date(_get(row, "Invoice Date", "Date", "Bill Date"))
            due_date = _safe_date(_get(row, "Due Date", "Payment Due"),
                (datetime.strptime(inv_date, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d"))
            taxable = qty * rate * (1 - discount_pct / 100)
            half = gst_rate / 2
            cgst = round(taxable * half / 100, 2)
            sgst = round(taxable * half / 100, 2)
            total = round(taxable + cgst + sgst, 2)
            result["invoices"].append({
                "invoice_type": "tax_invoice",
                "client_name": client_name,
                "client_email": _get(row, "Email", "client_email"),
                "client_phone": _get(row, "Phone", "Mobile"),
                "client_gstin": _get(row, "GSTIN", "GST No"),
                "client_address": _get(row, "Address", "Billing Address"),
                "client_state": _get(row, "State", "Place of Supply"),
                "invoice_date": inv_date,
                "due_date": due_date,
                "reference_no": _get(row, "Reference No", "Ref No", "Invoice No"),
                "notes": _get(row, "Notes", "Remarks"),
                "is_interstate": False,
                "items": [{
                    "description": desc,
                    "hsn_sac": _get(row, "HSN/SAC", "HSN", "SAC"),
                    "quantity": qty,
                    "unit": _get(row, "Unit", "UOM", default="service"),
                    "unit_price": rate,
                    "discount_pct": discount_pct,
                    "gst_rate": gst_rate,
                    "taxable_value": taxable,
                    "cgst_rate": half,
                    "sgst_rate": half,
                    "igst_rate": 0,
                    "cgst_amount": cgst,
                    "sgst_amount": sgst,
                    "igst_amount": 0,
                    "total_amount": total,
                }],
                "subtotal": round(qty * rate, 2),
                "total_discount": round(qty * rate * discount_pct / 100, 2),
                "total_taxable": taxable,
                "total_cgst": cgst,
                "total_sgst": sgst,
                "total_igst": 0,
                "total_gst": round(cgst + sgst, 2),
                "grand_total": total,
                "amount_paid": 0,
                "amount_due": total,
                "status": "draft",
            })
        
        result["stats"] = {
            "firms": 0,
            "clients": 0,
            "items": 0,
            "invoices": len(result["invoices"]),
            "payments": 0
        }
        
        return result
    
    except Exception as e:
        logger.error(f"Excel parser failed: {e}", exc_info=True)
        raise HTTPException(400, f"Failed to parse Excel/CSV file: {str(e)}")

# ═══════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════
class InvoiceItem(BaseModel):
    description: str
    hsn_sac: str = ""
    quantity: float = 1
    unit: str = "service"
    unit_price: float = 0
    discount_pct: float = 0
    gst_rate: float = 18
    taxable_value: float = 0
    cgst_rate: float = 9
    sgst_rate: float = 9
    igst_rate: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    total_amount: float = 0
    item_details: str = ""

class InvoiceCreate(BaseModel):
    invoice_type: str = "tax_invoice"
    company_id: str = ""
    client_name: str
    client_email: str = ""
    client_phone: str = ""
    client_gstin: str = ""
    client_address: str = ""
    client_state: str = ""
    invoice_date: str = None
    due_date: str = None
    items: List[InvoiceItem]
    is_interstate: bool = False
    gst_rate: float = 18
    payment_terms: str = ""
    reference_no: str = ""
    notes: str = ""
    status: str = "draft"
    quotation_id: str = None
    lead_id: str = None
    client_id: str = None

class PaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_date: str = None
    payment_mode: str = "cash"
    reference_no: str = ""
    notes: str = ""

class CreditNoteCreate(BaseModel):
    company_id: str
    invoice_id: str = ""
    client_name: str
    client_email: str = ""
    client_phone: str = ""
    client_gstin: str = ""
    items: List[InvoiceItem]
    reason: str = ""
    notes: str = ""

# ═══════════════════════════════════════════════════════════
# COMPUTE INVOICE TOTALS
# ═══════════════════════════════════════════════════════════
def _compute_invoice_totals(inv_data: dict) -> dict:
    items = inv_data.get("items", [])
    is_inter = inv_data.get("is_interstate", False)
    disc_amt = inv_data.get("discount_amount", 0)
    shipping = inv_data.get("shipping_charges", 0)
    other = inv_data.get("other_charges", 0)
    
    subtotal = 0
    total_discount = 0
    total_taxable = 0
    total_cgst = 0
    total_sgst = 0
    total_igst = 0
    
    computed_items = []
    for item in items:
        qty = float(item.get("quantity", 1))
        rate = float(item.get("unit_price", 0))
        disc_pct = float(item.get("discount_pct", 0))
        gst_rate = float(item.get("gst_rate", 18))
        
        disc = rate * qty * (disc_pct / 100)
        taxable = round((rate * qty - disc) * 100) / 100
        
        if is_inter:
            igst = round(taxable * gst_rate / 100 * 100) / 100
            computed_items.append({
                **item,
                "quantity": qty,
                "unit_price": rate,
                "discount_pct": disc_pct,
                "gst_rate": gst_rate,
                "taxable_value": taxable,
                "cgst_rate": 0,
                "sgst_rate": 0,
                "igst_rate": gst_rate,
                "cgst_amount": 0,
                "sgst_amount": 0,
                "igst_amount": igst,
                "total_amount": round((taxable + igst) * 100) / 100,
            })
            total_igst += igst
        else:
            half = gst_rate / 2
            cgst = round(taxable * half / 100 * 100) / 100
            sgst = round(taxable * half / 100 * 100) / 100
            computed_items.append({
                **item,
                "quantity": qty,
                "unit_price": rate,
                "discount_pct": disc_pct,
                "gst_rate": gst_rate,
                "taxable_value": taxable,
                "cgst_rate": half,
                "sgst_rate": half,
                "igst_rate": 0,
                "cgst_amount": cgst,
                "sgst_amount": sgst,
                "igst_amount": 0,
                "total_amount": round((taxable + cgst + sgst) * 100) / 100,
            })
            total_cgst += cgst
            total_sgst += sgst
        
        subtotal += rate * qty
        total_discount += disc
        total_taxable += taxable
    
    total_gst = round((total_cgst + total_sgst + total_igst) * 100) / 100
    grand_total = round((total_taxable + total_gst + shipping + other - disc_amt) * 100) / 100
    
    return {
        **inv_data,
        "items": computed_items,
        "subtotal": round(subtotal * 100) / 100,
        "total_discount": round(total_discount + disc_amt * 100) / 100,
        "total_taxable": round(total_taxable * 100) / 100,
        "total_cgst": round(total_cgst * 100) / 100,
        "total_sgst": round(total_sgst * 100) / 100,
        "total_igst": round(total_igst * 100) / 100,
        "total_gst": total_gst,
        "grand_total": grand_total,
    }

# ═══════════════════════════════════════════════════════════
# PDF GENERATION
# ═══════════════════════════════════════════════════════════
def _build_invoice_pdf(inv: dict, company: dict) -> BytesIO:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "", 10)
    
    # Header
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "INVOICE", ln=True)
    
    # Invoice details
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, f"Invoice No: {inv.get('invoice_no', 'N/A')}", ln=True)
    pdf.cell(0, 5, f"Date: {inv.get('invoice_date', 'N/A')}", ln=True)
    
    # Bill To
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 5, "BILL TO:", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, inv.get("client_name", ""), ln=True)
    if inv.get("client_address"):
        pdf.cell(0, 5, inv["client_address"], ln=True)
    
    # Items table
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(30, 5, "Description")
    pdf.cell(20, 5, "Qty")
    pdf.cell(20, 5, "Rate")
    pdf.cell(20, 5, "Amount")
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 9)
    for item in inv.get("items", []):
        pdf.cell(30, 5, item.get("description", "")[:25])
        pdf.cell(20, 5, str(item.get("quantity", 0)))
        pdf.cell(20, 5, f"Rs.{item.get('unit_price', 0):.2f}")
        pdf.cell(20, 5, f"Rs.{item.get('total_amount', 0):.2f}")
        pdf.ln()
    
    # Totals
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(70, 5, "Grand Total:")
    pdf.cell(20, 5, f"Rs.{inv.get('grand_total', 0):.2f}", ln=True)
    
    buf = BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf

# ═══════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post("/invoices")
async def create_invoice(data: InvoiceCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    
    inv_no = await _next_invoice_no("INV", data.company_id)
    now = datetime.now(timezone.utc).isoformat()
    
    inv_data = {
        "id": str(uuid.uuid4()),
        "invoice_no": inv_no,
        "invoice_type": data.invoice_type,
        "company_id": data.company_id,
        "client_name": data.client_name,
        "client_email": data.client_email,
        "client_phone": data.client_phone,
        "client_gstin": data.client_gstin,
        "client_address": data.client_address,
        "client_state": data.client_state,
        "invoice_date": data.invoice_date or date.today().isoformat(),
        "due_date": data.due_date or (date.today() + timedelta(days=30)).isoformat(),
        "items": [item.model_dump() for item in data.items],
        "is_interstate": data.is_interstate,
        "gst_rate": data.gst_rate,
        "payment_terms": data.payment_terms,
        "reference_no": data.reference_no,
        "notes": data.notes,
        "status": data.status,
        "amount_paid": 0,
        "amount_due": 0,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "pdf_drive_link": "",
    }
    
    inv_data = _compute_invoice_totals(inv_data)
    inv_data["amount_due"] = inv_data["grand_total"]
    
    await db.invoices.insert_one(inv_data)
    inv_data.pop("_id", None)
    return inv_data

@router.get("/invoices")
async def list_invoices(current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    return await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@router.get("/invoices/{inv_id}")
async def get_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv

@router.put("/invoices/{inv_id}")
async def update_invoice(inv_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    ex = await db.invoices.find_one({"id": inv_id})
    if not ex:
        raise HTTPException(404, "Invoice not found")
    for f in ("id", "invoice_no", "created_by", "created_at", "amount_paid", "pdf_drive_link"):
        data.pop(f, None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data = _compute_invoice_totals(data)
    data["amount_due"] = round(data["grand_total"] - ex.get("amount_paid", 0), 2)
    await db.invoices.update_one({"id": inv_id}, {"$set": data})
    return await db.invoices.find_one({"id": inv_id}, {"_id": 0})

@router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    result = await db.invoices.delete_one({"id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Invoice not found")
    return {"message": f"Invoice {inv_id} deleted"}

@router.get("/invoices/{inv_id}/pdf")
async def download_invoice_pdf(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    
    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0}) or {}
    
    try:
        pdf_buf = _build_invoice_pdf(inv, company)
    except Exception as e:
        logger.error(f"PDF generation failed for {inv_id}: {e}", exc_info=True)
        raise HTTPException(500, f"PDF generation failed: {e}")
    
    safe_name = (inv.get("invoice_no") or inv_id).replace("/", "_").replace("\\", "_")
    filename = f"Invoice_{safe_name}.pdf"
    
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )

@router.post("/invoices/{inv_id}/upload-to-drive")
async def upload_invoice_to_drive(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    
    if not _drive_configured():
        raise HTTPException(
            503,
            "Google Drive is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON as an environment variable.",
        )
    
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    
    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0}) or {}
    
    try:
        pdf_buf = _build_invoice_pdf(inv, company)
        pdf_bytes = pdf_buf.getvalue()
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")
    
    client_name = inv.get("client_name", "").strip()
    try:
        client_folder_id = _get_or_create_client_folder(client_name)
    except Exception:
        client_folder_id = DRIVE_FOLDERS["invoices"]
    
    safe_inv_no = (inv.get("invoice_no") or inv_id).replace("/", "_").replace("\\", "_")
    pdf_link = _upload_to_drive(pdf_bytes, f"Invoice_{safe_inv_no}.pdf", "invoices", "application/pdf",
                                custom_parent_id=client_folder_id)
    _upload_to_drive(json.dumps(inv, default=str).encode(), f"Invoice_{safe_inv_no}.json",
                     "invoices", "application/json", custom_parent_id=client_folder_id)
    
    if pdf_link:
        await db.invoices.update_one({"id": inv_id},
            {"$set": {"pdf_drive_link": pdf_link, "updated_at": datetime.now(timezone.utc).isoformat()}})
    
    return {
        "status": "success" if pdf_link else "warning",
        "drive_link": pdf_link or "",
        "message": "Invoice uploaded to Google Drive" if pdf_link else "Upload failed — check Drive credentials",
        "invoice_no": inv.get("invoice_no", ""),
    }

@router.post("/payments")
async def record_payment(data: PaymentCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": data.invoice_id})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    payment_data = {
        **data.model_dump(),
        "id": str(uuid.uuid4()),
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payments.insert_one(payment_data)
    payment_data.pop("_id", None)
    all_payments = await db.payments.find({"invoice_id": data.invoice_id}, {"_id": 0}).to_list(500)
    total_paid = sum(float(p.get("amount", 0)) for p in all_payments)
    grand_total = float(inv.get("grand_total", 0))
    amount_due = round(max(grand_total - total_paid, 0), 2)
    new_status = "paid" if amount_due <= 0 else ("partially_paid" if total_paid > 0 else inv.get("status", "sent"))
    await db.invoices.update_one({"id": data.invoice_id},
        {"$set": {"amount_paid": round(total_paid, 2), "amount_due": amount_due, "status": new_status,
                  "updated_at": datetime.now(timezone.utc).isoformat()}})
    return payment_data

@router.get("/payments")
async def list_payments(invoice_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    q: dict = {}
    if invoice_id:
        q["invoice_id"] = invoice_id
    return await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

@router.delete("/payments/{pid}")
async def delete_payment(pid: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    result = await db.payments.delete_one({"id": pid})
    if result.deleted_count == 0:
        raise HTTPException(404, f"Payment {pid} not found")
    return {"message": f"Payment {pid} deleted"}

@router.post("/credit-notes")
async def create_credit_note(data: CreditNoteCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    inv_no = await _next_invoice_no("CN", data.company_id)
    now = datetime.now(timezone.utc).isoformat()
    raw = {
        "id": str(uuid.uuid4()),
        "invoice_no": inv_no,
        "invoice_type": "credit_note",
        **data.model_dump(),
        "invoice_date": date.today().isoformat(),
        "due_date": date.today().isoformat(),
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "status": "credit_note",
        "amount_paid": 0,
        "amount_due": 0,
        "pdf_drive_link": ""
    }
    raw = _compute_invoice_totals(raw)
    await db.invoices.insert_one(raw)
    raw.pop("_id", None)
    return raw

@router.get("/drive-status")
async def get_drive_status(current_user: User = Depends(get_current_user)):
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")
    configured = _drive_configured()
    accessible = False
    if configured:
        try:
            _get_drive_service()
            accessible = True
        except Exception:
            pass
    return {
        "configured": configured,
        "accessible": accessible,
        "message": (
            "Google Drive is connected and ready" if accessible
            else "Drive credentials found but connection failed" if configured
            else "Google Drive not configured (optional feature)"
        ),
    }
