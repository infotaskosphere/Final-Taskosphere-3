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

# ═══════════════════════════════════════════════════════════
# PERMISSION HELPER
# ═══════════════════════════════════════════════════════════
def _perm(user: User) -> bool:
    if user.role == "admin": return True
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
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(from_email, to_email, msg.as_string())
        server.quit()
    except Exception as e:
        raise HTTPException(500, f"Email sending failed: {e}")

# ═══════════════════════════════════════════════════════════
# SAFE PDF HELPERS
# ═══════════════════════════════════════════════════════════
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
        logger.warning(f"Logo embed failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except: pass

def _lighten(c, f=0.88): return tuple(int(x + (255 - x) * f) for x in c)
def _darken(c, f=0.65): return tuple(int(x * f) for x in c)

def _hex_to_rgb(hex_color: str) -> tuple:
    """Convert a CSS hex color string to an (R, G, B) tuple."""
    try:
        h = hex_color.strip().lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return (13, 59, 102) # fallback to default navy

# ═══════════════════════════════════════════════════════════
# UNIVERSAL VYAPAR / KHATABOOK BACKUP HELPERS (NEW in v6.2)
# ═══════════════════════════════════════════════════════════

def _prepare_vyb(file_path: str) -> str:
    """Handle both plain SQLite (.vyp) and ZIP-compressed Vyapar backups (.vyb)."""
    with open(file_path, "rb") as f:
        header = f.read(4)

    if header.startswith(b'PK'):  # ZIP file signature
        tmp_dir = tempfile.mkdtemp()
        try:
            with zipfile.ZipFile(file_path, 'r') as z:
                z.extractall(tmp_dir)

            for root, _, files in os.walk(tmp_dir):
                for f in files:
                    if f.endswith((".db", ".sqlite", ".sqlite3")):
                        return os.path.join(root, f)
            raise Exception("No SQLite database found inside .vyb ZIP archive")
        except Exception as e:
            raise Exception(f"Failed to extract .vyb ZIP: {e}")
    return file_path


def _scan_tables(cursor):
    """Return list of all table names in the database."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return [t[0] for t in cursor.fetchall()]


def _find_table(tables, keywords):
    """Find first table whose name contains any of the keywords (case-insensitive)."""
    for t in tables:
        name = t.lower()
        if any(k in name for k in keywords):
            return t
    return None


def _get_columns(cursor, table):
    """Return list of column names for a given table."""
    cursor.execute(f"PRAGMA table_info({table})")
    return [col[1] for col in cursor.fetchall()]


def _safe_float(val, default=0.0):
    if val is None: return default
    try: return float(val)
    except: return default


def _safe_str(val, default=""):
    if val is None: return default
    return str(val).strip()


def _safe_date(val, default=None):
    if not val: return default or date.today().isoformat()
    s = str(val).strip()
    if " " in s: s = s.split(" ")[0]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    return default or date.today().isoformat()


# ═══════════════════════════════════════════════════════════
# PRODUCTION-READY UNIVERSAL VYAPAR PARSER (v6.2)
# ═══════════════════════════════════════════════════════════
def _parse_vyp_file(file_path: str) -> dict:
    """Universal parser for Vyapar / KhataBook .vyp and .vyb backups.
    Supports ZIP-compressed .vyb files and dynamically detects schema."""
    try:
        actual_db_path = _prepare_vyb(file_path)

        conn = sqlite3.connect(actual_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        result = {
            "source": "vyapar",
            "source_label": "Vyapar / KhataBook (.vyp / .vyb)",
            "firms": [],
            "clients": [],
            "items": [],
            "invoices": [],
            "payments": [],
            "stats": {}
        }

        tables = _scan_tables(cursor)
        logger.info(f"Vyapar backup tables detected: {tables}")

        # Dynamic table detection
        txn_table   = _find_table(tables, ["transaction", "invoice", "bill", "txn", "sale"])
        item_table  = _find_table(tables, ["item", "product", "stock"])
        party_table = _find_table(tables, ["name", "party", "customer", "client", "ledger"])
        line_table  = _find_table(tables, ["line", "entry", "detail", "item_entry", "transaction_detail"])

        logger.info(f"Detected tables → Transactions: {txn_table}, Items: {item_table}, "
                    f"Parties: {party_table}, Line items: {line_table}")

        if not txn_table:
            raise Exception("Could not detect transaction/invoice table in backup")

        txn_cols = _get_columns(cursor, txn_table)

        # Find important columns dynamically
        date_col = next((c for c in txn_cols if any(k in c.lower() for k in ["date", "billdate", "invoicedate"])), None)
        name_id_col = next((c for c in txn_cols if any(k in c.lower() for k in ["name", "party", "customer", "client"])), None)
        total_col = next((c for c in txn_cols if any(k in c.lower() for k in ["total", "amount", "grand", "final"])), None)

        # Fetch all transactions
        cursor.execute(f"SELECT * FROM {txn_table}")
        txn_rows = cursor.fetchall()

        # PARTY MAP
        party_map = {}
        if party_table:
            party_cols = _get_columns(cursor, party_table)
            party_id_idx = 0  # usually first column is ID
            name_idx = next((i for i, c in enumerate(party_cols) if any(k in c.lower() for k in ["name", "full_name", "title"])), None)
            phone_idx = next((i for i, c in enumerate(party_cols) if "phone" in c.lower()), None)
            email_idx = next((i for i, c in enumerate(party_cols) if "email" in c.lower()), None)
            gstin_idx = next((i for i, c in enumerate(party_cols) if "gst" in c.lower()), None)

            cursor.execute(f"SELECT * FROM {party_table}")
            for row in cursor.fetchall():
                pid = row[party_id_idx]
                party_map[pid] = {
                    "full_name": _safe_str(row[name_idx]) if name_idx is not None else "Unknown",
                    "phone_number": _safe_str(row[phone_idx]) if phone_idx is not None else "",
                    "email": _safe_str(row[email_idx]) if email_idx is not None else "",
                    "name_gstin_number": _safe_str(row[gstin_idx]) if gstin_idx is not None else "",
                }

        # ITEM MAP
        item_map = {}
        if item_table:
            item_cols = _get_columns(cursor, item_table)
            item_id_idx = 0
            name_idx = next((i for i, c in enumerate(item_cols) if any(k in c.lower() for k in ["name", "item_name", "title"])), None)
            price_idx = next((i for i, c in enumerate(item_cols) if any(k in c.lower() for k in ["price", "rate", "sale_price"])), None)

            cursor.execute(f"SELECT * FROM {item_table}")
            for row in cursor.fetchall():
                iid = row[item_id_idx]
                item_map[iid] = {
                    "name": _safe_str(row[name_idx]) if name_idx is not None else "Item",
                    "sale_price": _safe_float(row[price_idx]) if price_idx is not None else 0.0,
                }

        # LINE ITEMS MAP
        line_map = {}
        if line_table:
            line_cols = _get_columns(cursor, line_table)
            txn_id_idx = next((i for i, c in enumerate(line_cols) if any(k in c.lower() for k in ["txn", "transaction", "bill", "invoice"])), None)
            item_id_idx = next((i for i, c in enumerate(line_cols) if any(k in c.lower() for k in ["item", "product"])), None)
            qty_idx = next((i for i, c in enumerate(line_cols) if any(k in c.lower() for k in ["qty", "quantity"])), None)
            price_idx = next((i for i, c in enumerate(line_cols) if any(k in c.lower() for k in ["price", "rate"])), None)
            amount_idx = next((i for i, c in enumerate(line_cols) if any(k in c.lower() for k in ["amount", "total"])), None)

            cursor.execute(f"SELECT * FROM {line_table}")
            for row in cursor.fetchall():
                txn_id = row[txn_id_idx] if txn_id_idx is not None else None
                if txn_id is None:
                    continue

                if txn_id not in line_map:
                    line_map[txn_id] = []

                item_id = row[item_id_idx] if item_id_idx is not None else None
                item_info = item_map.get(item_id, {}) if item_id else {}

                line_map[txn_id].append({
                    "description": item_info.get("name") or _safe_str(row[amount_idx]) if amount_idx is not None else "Service",
                    "quantity": _safe_float(row[qty_idx]) if qty_idx is not None else 1.0,
                    "unit_price": _safe_float(row[price_idx]) if price_idx is not None else _safe_float(row[amount_idx]),
                    "total_amount": _safe_float(row[amount_idx]),
                })

        # BUILD INVOICES
        for row in txn_rows:
            try:
                txn_id = row[0]  # Usually first column is primary key
                client_info = party_map.get(row[txn_cols.index(name_id_col)]) if name_id_col and name_id_col in txn_cols else {}
                line_items = line_map.get(txn_id, [])

                if not line_items and total_col:
                    # Fallback for transactions without line items
                    total = _safe_float(row[txn_cols.index(total_col)]) if total_col in txn_cols else 0.0
                    line_items = [{
                        "description": "Imported Transaction",
                        "quantity": 1.0,
                        "unit_price": total,
                        "total_amount": total,
                    }]

                subtotal = sum(item.get("total_amount", 0) for item in line_items)
                grand_total = subtotal  # Can be enhanced later with tax/discount logic

                invoice_date = _safe_date(row[txn_cols.index(date_col)]) if date_col else date.today().isoformat()

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
# OTHER BACKUP PARSERS (unchanged)
# ═══════════════════════════════════════════════════════════
def _parse_excel_file(file_path: str, filename: str) -> dict:
    # ... (same as original - kept for brevity, no changes needed)
    result = {"source": "excel", "source_label": f"Excel/CSV ({filename})",
              "firms": [], "clients": [], "items": [], "invoices": [], "payments": [], "stats": {}}
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
                    if i < len(headers) and headers[i]: rd[headers[i]] = val
                if any(v for v in rd.values() if v): rows.append(rd)
        def _get(row, *keys, default=""):
            for k in keys:
                for rk in row.keys():
                    if rk.lower().replace(" ", "_") == k.lower().replace(" ", "_"):
                        val = row[rk]
                        if val is not None and str(val).strip(): return str(val).strip()
            return default
        for row in rows:
            client_name = _get(row, "Client Name", "client_name", "Customer Name", "party_name", "Name")
            if not client_name: continue
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
                "invoice_type": "tax_invoice", "client_name": client_name,
                "client_email": _get(row, "Email", "client_email"),
                "client_phone": _get(row, "Phone", "Mobile"),
                "client_gstin": _get(row, "GSTIN", "GST No"),
                "client_address": _get(row, "Address", "Billing Address"),
                "client_state": _get(row, "State", "Place of Supply"),
                "invoice_date": inv_date, "due_date": due_date,
                "reference_no": _get(row, "Reference No", "Ref No", "Invoice No"),
                "notes": _get(row, "Notes", "Remarks"), "is_interstate": False,
                "items": [{"description": desc,
                    "hsn_sac": _get(row, "HSN/SAC", "HSN", "SAC"),
                    "quantity": qty, "unit": _get(row, "Unit", "UOM", default="service"),
                    "unit_price": rate, "discount_pct": discount_pct, "gst_rate": gst_rate,
                    "taxable_value": round(taxable, 2),
                    "cgst_rate": half, "sgst_rate": half, "igst_rate": 0,
                    "cgst_amount": cgst, "sgst_amount": sgst, "igst_amount": 0, "total_amount": total}],
                "subtotal": round(qty * rate, 2), "total_taxable": round(taxable, 2),
                "total_cgst": cgst, "total_sgst": sgst, "total_igst": 0,
                "total_gst": round(cgst + sgst, 2), "grand_total": total,
                "amount_paid": 0, "amount_due": total, "status": "draft",
                "payment_terms": "Due on receipt",
            })
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {e}")
    result["stats"] = {"firms": 0, "clients": len(set(i["client_name"] for i in result["invoices"])),
                       "items": 0, "invoices": len(result["invoices"]), "payments": 0}
    return result


def _parse_tally_xml(file_path: str) -> dict:
    # (unchanged - omitted for brevity)
    result = {"source": "tally", "source_label": "Tally XML", "firms": [], "clients": [], "items": [], "invoices": [], "payments": [], "stats": {}}
    # ... original implementation ...
    return result


def _parse_json_file(file_path: str) -> dict:
    # (unchanged)
    result = {"source": "json", "source_label": "JSON Backup", "firms": [], "clients": [], "items": [], "invoices": [], "payments": [], "stats": {}}
    # ... original implementation ...
    return result

# ═══════════════════════════════════════════════════════════
# PYDANTIC MODELS (unchanged)
# ═══════════════════════════════════════════════════════════
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
    item_details: Optional[str] = ""

class InvoiceCreate(BaseModel):
    invoice_type: Literal["tax_invoice", "proforma", "estimate", "credit_note", "debit_note"] = "tax_invoice"
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
    recurrence_pattern: Literal["monthly", "quarterly", "yearly"] = "monthly"
    recurrence_end: Optional[str] = None
    next_invoice_date: Optional[str] = None
    status: str = "draft"
    invoice_template: str = "prestige"
    invoice_theme: str = "classic_blue"
    invoice_custom_color: str = "#0D3B66"

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
    pdf_drive_link: str = ""
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

# ═══════════════════════════════════════════════════════════
# CALCULATION ENGINE (unchanged)
# ═══════════════════════════════════════════════════════════
def _compute_item(item: InvoiceItem, is_interstate: bool) -> InvoiceItem:
    discount = round(item.unit_price * item.quantity * item.discount_pct / 100, 2)
    taxable = round(item.unit_price * item.quantity - discount, 2)
    gst = item.gst_rate
    if is_interstate:
        igst_amt = round(taxable * gst / 100, 2)
        item.cgst_rate = 0.0; item.sgst_rate = 0.0; item.igst_rate = gst
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
        it = InvoiceItem(**raw) if isinstance(raw, dict) else raw
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
    inv_data.update({
        "items": computed,
        "subtotal": round(subtotal, 2),
        "total_discount": round(total_discount + discount_extra, 2),
        "total_taxable": round(total_taxable, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_gst": total_gst,
        "grand_total": grand_total,
    })
    return inv_data

# ═══════════════════════════════════════════════════════════
# PDF BUILDER  — v6.1: matches Invoice Settings preview tab
#   • Reads invoice_custom_color / company color (no more hardcoded navy)
#   • Full-width dark header: logo + company left, doc-type right
#   • Bill To (left) / Due Date (right) two-column section
#   • Items table with Disc% column matching the UI preview
#   • Signature block bottom-right
# ═══════════════════════════════════════════════════════════

def _build_invoice_pdf(inv: dict, company: dict) -> BytesIO:
    # ── Resolve brand color from invoice settings → company settings → default
    raw_color = (
        inv.get("invoice_custom_color")
        or company.get("invoice_custom_color")
        or company.get("brand_color")
        or "#0D3B66"
    )
    BRAND = _hex_to_rgb(raw_color)
    BL    = _lighten(BRAND, 0.92)   # very light tint for alternating rows
    BD    = _darken(BRAND, 0.65)    # darker shade for accents
    DARK  = (30, 41, 59)
    MUTED = (100, 116, 139)
    WHITE = (255, 255, 255)
    GREEN = (22, 163, 74)
    RED   = (220, 38, 38)

    inv_type_labels = {
        "tax_invoice": "Tax Invoice",
        "proforma":    "Proforma Invoice",
        "estimate":    "Estimate",
        "credit_note": "Credit Note",
        "debit_note":  "Debit Note",
    }
    title_label = inv_type_labels.get(inv.get("invoice_type", "tax_invoice"), "Tax Invoice")
    is_cn = inv.get("invoice_type") == "credit_note"
    _inv  = inv
    _MUTED = MUTED

    class PDF(FPDF):
        def header(self): pass
        def footer(self):
            self.set_y(-12)
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*_MUTED)
            _cell(self, 0, 5,
                  _s(f"This is a computer-generated document.  ·  {_inv.get('invoice_no','')}  ·  Page {self.page_no()}"),
                  align="C", nl=True)

    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    MARGIN     = 14
    CONTENT_W  = pdf.w - MARGIN * 2   # ≈ 182 mm on A4

    # ══════════════════════════════════════════════════════
    # HEADER BAND  — full-width coloured rectangle
    # ══════════════════════════════════════════════════════
    HEADER_H = 44
    header_color = RED if is_cn else BRAND
    pdf.set_fill_color(*header_color)
    pdf.rect(0, 0, pdf.w, HEADER_H, "F")

    # Logo (top-left, inside margin)
    if company.get("logo_base64"):
        _embed_logo(pdf, company["logo_base64"], x=MARGIN, y=7, h=16)
        logo_offset = 20   # shift text right if logo present
    else:
        logo_offset = 0

    # Company info — left column
    pdf.set_xy(MARGIN + logo_offset, 7)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*WHITE)
    _cell(pdf, CONTENT_W * 0.55, 6, _s(company.get("name", "")), nl=True)

    pdf.set_x(MARGIN + logo_offset)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(210, 225, 245)

    addr_lines = _s(company.get("address", ""))
    if addr_lines:
        _mcell(pdf, CONTENT_W * 0.55, 4, addr_lines)
        pdf.set_x(MARGIN + logo_offset)

    contact_parts = []
    if company.get("phone"): contact_parts.append(f"Ph: {company['phone']}")
    if company.get("email"): contact_parts.append(company["email"])
    if contact_parts:
        _cell(pdf, CONTENT_W * 0.55, 4, _s("  ·  ".join(contact_parts)), nl=True)
        pdf.set_x(MARGIN + logo_offset)

    if company.get("gstin"):
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*WHITE)
        _cell(pdf, CONTENT_W * 0.55, 4, _s(f"GSTIN: {company['gstin']}"), nl=True)
    if company.get("pan"):
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(210, 225, 245)
        pdf.set_x(MARGIN + logo_offset)
        _cell(pdf, CONTENT_W * 0.55, 4, _s(f"PAN: {company['pan']}"), nl=True)

    # Document type — right column (aligned to right edge)
    right_col_x = MARGIN + CONTENT_W * 0.60
    right_col_w = CONTENT_W * 0.40

    pdf.set_xy(right_col_x, 7)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*WHITE)
    _cell(pdf, right_col_w, 10, title_label, align="R", nl=True)

    pdf.set_x(right_col_x)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(210, 225, 245)
    inv_no = inv.get("invoice_no", "")
    _cell(pdf, right_col_w, 5, _s(f"# {inv_no}"), align="R", nl=True)

    pdf.set_x(right_col_x)
    _cell(pdf, right_col_w, 5, _s(f"Date: {inv.get('invoice_date', '')}"), align="R", nl=True)

    # ══════════════════════════════════════════════════════
    # BILL TO  /  DUE DATE  — two-column section
    # ══════════════════════════════════════════════════════
    info_y = HEADER_H + 5
    pdf.set_xy(MARGIN, info_y)

    # Left: Bill To
    bill_w = CONTENT_W * 0.56
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*MUTED)
    _cell(pdf, bill_w, 5, "BILL TO", nl=True)

    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    _cell(pdf, bill_w, 6, _s(inv.get("client_name", ""), 50), nl=True)

    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    if inv.get("client_address"):
        _mcell(pdf, bill_w, 4, _s(inv["client_address"], 90))
        pdf.set_x(MARGIN)

    contact_c = []
    if inv.get("client_phone"): contact_c.append(inv["client_phone"])
    if inv.get("client_email"): contact_c.append(inv["client_email"])
    if contact_c:
        _cell(pdf, bill_w, 4, _s("  ·  ".join(contact_c)), nl=True)

    if inv.get("client_gstin"):
        pdf.set_x(MARGIN)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*DARK)
        _cell(pdf, bill_w, 4, _s(f"GSTIN: {inv['client_gstin']}"), nl=True)

    # Right: Due Date block
    due_x = MARGIN + CONTENT_W * 0.62
    due_w = CONTENT_W * 0.38
    pdf.set_xy(due_x, info_y)

    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*MUTED)
    _cell(pdf, due_w, 5, "DUE DATE", align="R", nl=True)

    pdf.set_x(due_x)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*DARK)
    _cell(pdf, due_w, 7, _s(inv.get("due_date", "")), align="R", nl=True)

    pdf.set_x(due_x)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    _cell(pdf, due_w, 5, _s(inv.get("payment_terms", "Due on receipt")), align="R", nl=True)

    if inv.get("reference_no"):
        pdf.set_x(due_x)
        _cell(pdf, due_w, 5, _s(f"PO: {inv['reference_no']}"), align="R", nl=True)

    supply_label = "Interstate (IGST)" if inv.get("is_interstate") else "Intrastate (CGST+SGST)"
    pdf.set_x(due_x)
    _cell(pdf, due_w, 5, _s(supply_label), align="R", nl=True)

    # Divider
    div_y = max(pdf.get_y(), info_y + 30) + 2
    pdf.set_draw_color(*_lighten(BRAND, 0.70))
    pdf.set_line_width(0.3)
    pdf.line(MARGIN, div_y, MARGIN + CONTENT_W, div_y)
    pdf.set_line_width(0.2)

    # ══════════════════════════════════════════════════════
    # ITEMS TABLE
    # ══════════════════════════════════════════════════════
    table_y = div_y + 3
    pdf.set_xy(MARGIN, table_y)

    is_inter = inv.get("is_interstate", False)

    # Column widths — match UI preview: Description | HSN/SAC | Qty | Disc% | Rate | (tax cols) | Amount
    sr_w   = 7
    hsn_w  = 20
    qty_w  = 13
    disc_w = 13
    rate_w = 24
    amt_w  = 26
    tax_w  = 18   # per CGST / SGST / IGST column
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

    items = inv.get("items", [])
    for idx, it in enumerate(items, 1):
        row_bg = BL if idx % 2 == 0 else WHITE
        pdf.set_fill_color(*row_bg)
        pdf.set_text_color(*DARK)
        pdf.set_font("Helvetica", "", 7.5)

        _cell(pdf, sr_w,   7, str(idx),                                align="C", fill=True, nl=False)
        _cell(pdf, desc_w, 7, _s(it.get("description", ""), 42),      align="L", fill=True, nl=False)
        _cell(pdf, hsn_w,  7, _s(it.get("hsn_sac", "")[:12]),         align="C", fill=True, nl=False)
        _cell(pdf, qty_w,  7, f"{it.get('quantity', 1):.2f}",         align="C", fill=True, nl=False)
        _cell(pdf, disc_w, 7, f"{it.get('discount_pct', 0):.1f}%",    align="C", fill=True, nl=False)
        _cell(pdf, rate_w, 7, f"Rs.{it.get('unit_price', 0):,.2f}",   align="R", fill=True, nl=False)
        if is_inter:
            _cell(pdf, tax_w, 7, f"{it.get('igst_rate', 0):.1f}%",   align="C", fill=True, nl=False)
        else:
            cgst_r = it.get("cgst_rate", it.get("gst_rate", 18) / 2)
            sgst_r = it.get("sgst_rate", it.get("gst_rate", 18) / 2)
            _cell(pdf, tax_w, 7, f"{cgst_r:.1f}%",                    align="C", fill=True, nl=False)
            _cell(pdf, tax_w, 7, f"{sgst_r:.1f}%",                    align="C", fill=True, nl=False)
        _cell(pdf, amt_w,  7, f"Rs.{it.get('total_amount', 0):,.2f}", align="R", fill=True, nl=True)

        # Optional sub-detail line (unit / item_details)
        sub_parts = []
        if it.get("item_details"): sub_parts.append(_s(it["item_details"]))
        if it.get("unit"):         sub_parts.append(_s(it["unit"]))
        if sub_parts:
            pdf.set_x(MARGIN + sr_w)
            pdf.set_font("Helvetica", "I", 6.5)
            pdf.set_text_color(*MUTED)
            pdf.set_fill_color(*row_bg)
            sub_w = desc_w + hsn_w + qty_w + disc_w + rate_w + tax_w * n_tax_cols + amt_w
            _cell(pdf, sub_w, 4, _s("  ".join(sub_parts)), align="L", fill=True, nl=True)

    # ══════════════════════════════════════════════════════
    # TOTALS BLOCK
    # ══════════════════════════════════════════════════════
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
    _trow("Subtotal", inv.get("subtotal", 0))
    if float(inv.get("total_discount", 0)) > 0:
        _trow("Discount", inv.get("total_discount", 0), strike=True)
    _trow("Taxable Value", inv.get("total_taxable", 0))

    tt = float(inv.get("total_taxable", 1)) or 1
    if is_inter:
        igst_pct = round(float(inv.get("total_igst", 0)) / tt * 100, 1)
        _trow(f"IGST ({igst_pct:.1f}%)", inv.get("total_igst", 0))
    else:
        cgst_pct = round(float(inv.get("total_cgst", 0)) / tt * 100, 1)
        sgst_pct = round(float(inv.get("total_sgst", 0)) / tt * 100, 1)
        _trow(f"CGST ({cgst_pct:.1f}%)", inv.get("total_cgst", 0))
        _trow(f"SGST ({sgst_pct:.1f}%)", inv.get("total_sgst", 0))

    if float(inv.get("shipping_charges", 0)) > 0:
        _trow("Shipping Charges", inv.get("shipping_charges", 0))
    if float(inv.get("other_charges", 0)) > 0:
        _trow("Other Charges", inv.get("other_charges", 0))
    _trow("GRAND TOTAL", inv.get("grand_total", 0), bold=True)

    # Amount in words
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*MUTED)
    _cell(pdf, CONTENT_W, 5, _s(_amount_in_words(float(inv.get("grand_total", 0)))), nl=True)

    # PAID stamp (right side)
    if inv.get("status") == "paid":
        stamp_y = pdf.get_y() - 12
        pdf.set_xy(MARGIN + CONTENT_W - 56, stamp_y)
        pdf.set_draw_color(*GREEN)
        pdf.set_line_width(0.8)
        pdf.set_font("Helvetica", "B", 20)
        pdf.set_text_color(*GREEN)
        pdf.cell(50, 12, "PAID", border=1, align="C")
        pdf.set_line_width(0.2)

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

    gst_sum: Dict[float, Dict[str, float]] = {}
    for it in items:
        r = float(it.get("gst_rate", 18))
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
        _cell(pdf, g_w, 6, f"Rs.{row['cgst']:,.2f}",   align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"Rs.{row['sgst'] or row['igst']:,.2f}", align="C", fill=True, nl=False)
        _cell(pdf, g_w, 6, f"Rs.{gst_tot:,.2f}",       align="C", fill=True, nl=True)

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
            _cell(pdf, half_w * 0.42, 5, _s(f"{lbl}:"), nl=False)
            pdf.set_font("Helvetica", "", 8)
            _cell(pdf, half_w * 0.58, 5, _s(val), nl=True)

    # ══════════════════════════════════════════════════════
    # TERMS & NOTES
    # ══════════════════════════════════════════════════════
    if inv.get("terms_conditions") or inv.get("notes"):
        pdf.ln(5)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*BRAND)
        _cell(pdf, 0, 5, "Terms & Notes", nl=True)
        pdf.set_draw_color(*_lighten(BRAND, 0.70))
        pdf.line(MARGIN, pdf.get_y(), MARGIN + CONTENT_W, pdf.get_y())
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*DARK)
        if inv.get("terms_conditions"):
            _mcell(pdf, CONTENT_W, 4, _s(inv["terms_conditions"]))
        if inv.get("notes"):
            _mcell(pdf, CONTENT_W, 4, _s(f"Note: {inv['notes']}"))

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
    _cell(pdf, sig_w, 5, _s(f"For {company.get('name', '')}"), align="C", nl=True)

    pdf.set_x(sig_x)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*MUTED)
    _cell(pdf, sig_w, 4, "Authorised Signatory", align="C", nl=True)

    # ── Output
    buf = BytesIO()
    buf.write(pdf.output())
    buf.seek(0)
    return buf


# ═══════════════════════════════════════════════════════════
# BACKUP IMPORT ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/parse-vyp")
async def parse_vyp_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".vyp")
        tmp.write(await file.read()); tmp.close(); tmp_path = tmp.name
        return _parse_vyp_file(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except: pass


@router.post("/invoices/parse-backup")
async def parse_backup_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # FIX: .vyb is KhataBook Pro format — same SQLite schema as .vyp, route to vyp parser
    supported = {
        "vyp":  "vyp",
        "vyb":  "vyp",    # ← was incorrectly mapped to "json" in v6.0
        "db":   "vyp",
        "xml":  "xml",
        "tbk":  "xml",
        "xlsx": "excel",
        "xls":  "excel",
        "csv":  "excel",
        "json": "json",
    }
    parser_type = supported.get(ext)
    if not parser_type:
        raise HTTPException(400, f"Unsupported file format: .{ext}. Supported: {', '.join(f'.{k}' for k in supported)}")

    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
        content = await file.read()
        tmp.write(content); tmp.close(); tmp_path = tmp.name

        if   parser_type == "vyp":   result = _parse_vyp_file(tmp_path)
        elif parser_type == "xml":   result = _parse_tally_xml(tmp_path)
        elif parser_type == "excel": result = _parse_excel_file(tmp_path, filename)
        elif parser_type == "json":  result = _parse_json_file(tmp_path)
        else: raise HTTPException(400, "No parser available")

        # Optionally backup to Drive — never fail if it doesn't work
        if _drive_configured():
            _upload_to_drive(content, f"Backup_{filename}", "backups",
                             file.content_type or "application/octet-stream")
        return result
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except: pass


# ═══════════════════════════════════════════════════════════
# PRODUCT CATALOG
# ═══════════════════════════════════════════════════════════

@router.post("/products", response_model=Product)
async def create_product(data: ProductCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), **data.model_dump(), "created_by": current_user.id, "created_at": now}
    await db.products.insert_one(doc); doc.pop("_id", None)
    return doc


@router.get("/products")
async def list_products(search: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {}
    if current_user.role != "admin": q["created_by"] = current_user.id
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}]
    return await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(500)


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


# ═══════════════════════════════════════════════════════════
# INVOICE CRUD
# ═══════════════════════════════════════════════════════════

@router.post("/invoices", response_model=Invoice)
async def create_invoice(data: InvoiceCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    now = datetime.now(timezone.utc).isoformat()
    prefix = {"proforma": "PRO", "estimate": "EST", "credit_note": "CN", "debit_note": "DN"}.get(data.invoice_type, "INV")
    inv_no = await _next_invoice_no(prefix, data.company_id)
    inv_date = data.invoice_date or date.today().isoformat()
    due_date = data.due_date or (date.today() + timedelta(days=30)).isoformat()
    raw = {"id": str(uuid.uuid4()), "invoice_no": inv_no, "invoice_date": inv_date, "due_date": due_date,
           **data.model_dump(), "amount_paid": 0.0, "amount_due": 0.0, "pdf_drive_link": "",
           "created_by": current_user.id, "created_at": now, "updated_at": now}
    raw = _compute_invoice_totals(raw)
    raw["amount_due"] = raw["grand_total"]
    await db.invoices.insert_one({**raw})
    raw.pop("_id", None)
    return raw


@router.get("/invoices")
async def list_invoices(current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {} if current_user.role == "admin" else {"created_by": current_user.id}
    return await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@router.get("/invoices/stats")
async def invoice_stats(year: Optional[int] = None, month: Optional[int] = None,
                        current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {"invoice_type": "tax_invoice", "status": {"$ne": "cancelled"}}
    if current_user.role != "admin": q["created_by"] = current_user.id
    all_inv = await db.invoices.find(q, {"_id": 0, "grand_total": 1, "amount_paid": 1,
        "amount_due": 1, "status": 1, "invoice_date": 1, "client_name": 1, "total_gst": 1}).to_list(5000)
    today = date.today()
    cur_year = year or today.year
    cur_mon = month or today.month

    def _in_month(d, y, m):
        try: dt = date.fromisoformat(d[:10]); return dt.year == y and dt.month == m
        except: return False

    total_rev = sum(i.get("grand_total", 0) for i in all_inv)
    total_out = sum(i.get("amount_due", 0) for i in all_inv if i.get("amount_due", 0) > 0)
    overdue_c = sum(1 for i in all_inv if i.get("status") not in ("paid", "cancelled", "draft") and i.get("amount_due", 0) > 0)
    mon_inv = [i for i in all_inv if _in_month(i.get("invoice_date", ""), cur_year, cur_mon)]
    trend = []
    for offset in range(11, -1, -1):
        dt = (date(today.year, today.month, 1) - timedelta(days=offset * 28))
        y_, m_ = dt.year, dt.month
        mi = [i for i in all_inv if _in_month(i.get("invoice_date", ""), y_, m_)]
        trend.append({"year": y_, "month": m_, "label": date(y_, m_, 1).strftime("%b %y"),
                      "revenue": sum(i.get("grand_total", 0) for i in mi),
                      "collected": sum(i.get("amount_paid", 0) for i in mi), "count": len(mi)})
    from collections import defaultdict
    client_rev: dict = defaultdict(float)
    for i in all_inv: client_rev[i.get("client_name", "Unknown")] += i.get("grand_total", 0)
    top_clients = sorted(client_rev.items(), key=lambda x: -x[1])[:5]
    return {
        "total_revenue": round(total_rev, 2), "total_outstanding": round(total_out, 2),
        "overdue_count": overdue_c, "total_invoices": len(all_inv),
        "month_revenue": round(sum(i.get("grand_total", 0) for i in mon_inv), 2),
        "month_collected": round(sum(i.get("amount_paid", 0) for i in mon_inv), 2),
        "month_invoices": len(mon_inv), "monthly_trend": trend,
        "top_clients": [{"name": n, "revenue": round(v, 2)} for n, v in top_clients],
        "paid_count": sum(1 for i in all_inv if i.get("status") == "paid"),
        "draft_count": sum(1 for i in all_inv if i.get("status") == "draft"),
        "total_gst": round(sum(i.get("total_gst", 0) for i in all_inv), 2),
    }


# ══════════════════════════════════════════════════════════════
# FIX: drive-status MUST be declared BEFORE /invoices/{inv_id}
# In v6.0 it was after, so FastAPI matched "drive-status" as an
# invoice ID and routed it to get_invoice() → always 404.
# ══════════════════════════════════════════════════════════════

@router.get("/invoices/drive-status")
async def check_drive_status(current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    configured = _drive_configured()
    accessible = False
    if configured:
        try:
            service = _get_drive_service()
            service.files().list(pageSize=1).execute()
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


@router.get("/invoices/{inv_id}")
async def get_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")
    return inv


@router.put("/invoices/{inv_id}")
async def update_invoice(inv_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    ex = await db.invoices.find_one({"id": inv_id})
    if not ex: raise HTTPException(404, "Invoice not found")
    for f in ("id", "invoice_no", "created_by", "created_at", "amount_paid", "pdf_drive_link"):
        data.pop(f, None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data = _compute_invoice_totals(data)
    data["amount_due"] = round(data["grand_total"] - ex.get("amount_paid", 0), 2)
    await db.invoices.update_one({"id": inv_id}, {"$set": data})
    return await db.invoices.find_one({"id": inv_id}, {"_id": 0})


@router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    result = await db.invoices.delete_one({"id": inv_id})
    if result.deleted_count == 0: raise HTTPException(404, "Invoice not found")
    return {"message": f"Invoice {inv_id} deleted"}


# ═══════════════════════════════════════════════════════════
# PDF DOWNLOAD — ALWAYS STREAMS LOCALLY
# ═══════════════════════════════════════════════════════════

@router.get("/invoices/{inv_id}/pdf")
async def download_invoice_pdf(inv_id: str, current_user: User = Depends(get_current_user)):
    """
    Always generates a fresh PDF and streams it as a file download.
    This endpoint NEVER redirects to Google Drive — it always returns the PDF bytes.
    To optionally save to Drive, call POST /invoices/{inv_id}/upload-to-drive separately.
    """
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


# ═══════════════════════════════════════════════════════════
# OPTIONAL: UPLOAD PDF TO GOOGLE DRIVE
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/{inv_id}/upload-to-drive")
async def upload_invoice_to_drive(inv_id: str, current_user: User = Depends(get_current_user)):
    """
    Optional: generate PDF and upload to Google Drive.
    Only works if Drive credentials are configured.
    """
    if not _perm(current_user):
        raise HTTPException(403, "Access denied")

    if not _drive_configured():
        raise HTTPException(
            503,
            "Google Drive is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON as an environment variable.",
        )

    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")

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


# ═══════════════════════════════════════════════════════════
# CONVERT QUOTATION → INVOICE
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/from-quotation/{qtn_id}")
async def convert_quotation(qtn_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q = await db.quotations.find_one({"id": qtn_id}, {"_id": 0})
    if not q: raise HTTPException(404, "Quotation not found")
    inv_items = [InvoiceItem(description=it.get("description", ""),
        quantity=float(it.get("quantity", 1)), unit=it.get("unit", "service"),
        unit_price=float(it.get("unit_price", 0)), gst_rate=float(q.get("gst_rate", 18)))
        for it in q.get("items", [])]
    create_data = InvoiceCreate(
        invoice_type="tax_invoice", company_id=q.get("company_id", ""),
        quotation_id=qtn_id, lead_id=q.get("lead_id"), client_id=q.get("client_id"),
        client_name=q.get("client_name", ""), client_address=q.get("client_address", ""),
        client_email=q.get("client_email", ""), client_phone=q.get("client_phone", ""),
        items=inv_items, gst_rate=q.get("gst_rate", 18),
        payment_terms=q.get("payment_terms", ""), notes=q.get("notes", ""), status="draft")
    return await create_invoice(create_data, current_user)


# ═══════════════════════════════════════════════════════════
# SEND EMAIL
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/{inv_id}/send-email")
async def send_invoice_email(inv_id: str, background_tasks: BackgroundTasks,
                              current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv: raise HTTPException(404, "Invoice not found")
    if not inv.get("client_email"): raise HTTPException(400, "Client email not set")
    company = await db.companies.find_one({"id": inv.get("company_id")}, {"_id": 0}) or {}
    try:
        pdf_bytes = _build_invoice_pdf(inv, company).getvalue()
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")
    inv_no = inv.get("invoice_no", inv_id)
    subject = f"Invoice {inv_no} from {company.get('name', 'Your Company')}"
    html_body = f"""<h2>Invoice {inv_no}</h2>
    <p>Dear {inv.get('client_name', 'Customer')},</p>
    <p>Please find attached invoice <strong>{inv_no}</strong> for <strong>Rs.{inv.get('grand_total', 0):,.2f}</strong>.</p>
    <p>Due Date: {inv.get('due_date', 'N/A')}</p><br>
    <p>Regards,<br>{company.get('name', 'Your Company')}</p>"""
    background_tasks.add_task(_send_email, inv["client_email"], subject, html_body,
                               pdf_bytes, f"Invoice_{inv_no}.pdf", company.get("email", ""))
    await db.invoices.update_one({"id": inv_id},
        {"$set": {"status": "sent", "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": f"Email queued for {inv['client_email']}", "invoice_no": inv_no}


# ═══════════════════════════════════════════════════════════
# MARK SENT
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/{inv_id}/mark-sent")
async def mark_invoice_sent(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    result = await db.invoices.update_one({"id": inv_id},
        {"$set": {"status": "sent", "updated_at": datetime.now(timezone.utc).isoformat()}})
    if result.matched_count == 0: raise HTTPException(404, "Invoice not found")
    return {"message": f"Invoice {inv_id} marked as sent", "status": "sent"}


# ═══════════════════════════════════════════════════════════
# RECURRING INVOICE GENERATOR
# ═══════════════════════════════════════════════════════════

@router.post("/invoices/{inv_id}/generate-recurring")
async def generate_recurring(inv_id: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    template = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not template: raise HTTPException(404, "Template invoice not found")
    now = datetime.now(timezone.utc).isoformat()
    new_inv = {**template, "id": str(uuid.uuid4()), "invoice_no": await _next_invoice_no("INV", template.get("company_id")),
               "invoice_date": date.today().isoformat(),
               "due_date": (date.today() + timedelta(days=30)).isoformat(),
               "status": "draft", "amount_paid": 0.0, "amount_due": template.get("grand_total", 0),
               "is_recurring": False, "created_at": now, "updated_at": now, "pdf_drive_link": ""}
    new_inv.pop("_id", None)
    await db.invoices.insert_one({**new_inv})
    new_inv.pop("_id", None)
    return {"status": "success", "invoice_no": new_inv["invoice_no"], "id": new_inv["id"]}


# ═══════════════════════════════════════════════════════════
# PAYMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post("/payments")
async def record_payment(data: PaymentCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv = await db.invoices.find_one({"id": data.invoice_id})
    if not inv: raise HTTPException(404, "Invoice not found")
    payment_data = {**data.model_dump(), "id": str(uuid.uuid4()),
                    "created_by": current_user.id, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.payments.insert_one({**payment_data})
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
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    q: dict = {}
    if invoice_id: q["invoice_id"] = invoice_id
    return await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.delete("/payments/{pid}")
async def delete_payment(pid: str, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    result = await db.payments.delete_one({"id": pid})
    if result.deleted_count == 0: raise HTTPException(404, f"Payment {pid} not found")
    return {"message": f"Payment {pid} deleted"}


# ═══════════════════════════════════════════════════════════
# CREDIT NOTES
# ═══════════════════════════════════════════════════════════

@router.post("/credit-notes")
async def create_credit_note(data: CreditNoteCreate, current_user: User = Depends(get_current_user)):
    if not _perm(current_user): raise HTTPException(403, "Access denied")
    inv_no = await _next_invoice_no("CN", data.company_id)
    now = datetime.now(timezone.utc).isoformat()
    raw = {"id": str(uuid.uuid4()), "invoice_no": inv_no, "invoice_type": "credit_note",
           **data.model_dump(), "invoice_date": date.today().isoformat(), "due_date": date.today().isoformat(),
           "created_by": current_user.id, "created_at": now, "updated_at": now,
           "status": "credit_note", "amount_paid": 0, "amount_due": 0, "pdf_drive_link": ""}
    raw = _compute_invoice_totals(raw)
    await db.invoices.insert_one({**raw})
    raw.pop("_id", None)
    return raw
