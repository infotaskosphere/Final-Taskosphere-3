"""
MODULE 1 — Zero-Touch Entry Engine (Invoice → Journal)
=======================================================
Pipeline:
  1. TRIGGER   : `POST /api/zte/upload` (manual upload) — swap in a storage-bucket
                 event listener (S3/GCS "on_receipt_upload") or an inbox poller
                 ("on_invoice_email_received") to call `process_document(...)`
                 automatically; the extraction + posting logic below is already
                 decoupled from the HTTP trigger so either wiring is a thin shim.
  2. EXTRACT   : Vision LLM (reuses the Groq vision client already configured in
                 ai_document_reader.py) called in JSON-schema / forced-JSON mode —
                 no static template, works off any invoice layout.
  3. ROUTE     : `classify_and_map()` inspects the extracted vendor/line-items and
                 the firm's own learned category rules to pick ledger accounts,
                 then posts a balanced double-entry voucher via
                 `accounting_core.post_journal_entry` (reused, not re-implemented,
                 so trial balance / P&L / balance sheet reports stay consistent).
  4. AUDIT     : Every AI-posted entry is flagged `source="ai_zero_touch"` and is
                 immutable (see accounting_lock.py, Module 4) — corrections must
                 go through an Adjustment Note Override rather than editing the
                 original voucher.

Nothing here talks to a real object-storage bucket or mail server; those
triggers are infra-specific to how Taskosphere is deployed. Wire the bucket/
email webhook to call `process_document(file_bytes, filename, ...)` below.
"""

import base64
import io
import json
import os
import re
import uuid
from datetime import datetime, date, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field

from backend.dependencies import db, get_current_user
from backend.models import User
from backend import accounting_core as ac

router = APIRouter(prefix="/api/zte", tags=["Zero-Touch Entry Engine"])

# ── Permission helpers (mirrors accounting_core's pattern) ──────────────────
def _perm_post(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {}
    )
    return bool(perms.get("can_post_journal_entries"))


# ── Extraction schema (forced-JSON contract given to the LLM) ───────────────
EXTRACTION_SCHEMA_PROMPT = """You are a structured-data extraction engine for accounting documents.
Read the attached invoice/receipt image and return ONLY a single JSON object
(no markdown fences, no commentary) matching exactly this shape:

{
  "document_type": "SALE" | "PURCHASE" | "UNKNOWN",
  "vendor_or_customer_name": string,
  "tax_registration_number": string,      // GSTIN/PAN, "" if not visible
  "invoice_number": string,
  "invoice_date": "YYYY-MM-DD",
  "line_items": [
    {"description": string, "amount": number}
  ],
  "taxable_value": number,
  "tax_breakup": {"cgst": number, "sgst": number, "igst": number},
  "total_tax": number,
  "total_invoice_value": number,
  "currency": string,                     // ISO code, default "INR"
  "confidence": number                    // 0-1, your own confidence in this read
}

Rules:
- document_type = "SALE" if this business is the one issuing/selling; "PURCHASE" if
  this business is the buyer/recipient. Infer from letterhead/"Bill To" vs "From".
- All numeric fields must be plain numbers (no currency symbols, no commas).
- If a field is unreadable, use 0 for numbers or "" for strings — never omit a key.
- Do not invent data that is not visible in the document.
"""


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def _groq_extract_json(image_b64: str, mime_type: str) -> dict:
    import httpx
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(500, "GROQ_API_KEY is not configured on the server.")
    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                {"type": "text", "text": EXTRACTION_SCHEMA_PROMPT},
            ],
        }],
        "response_format": {"type": "json_object"},
        "max_tokens": 2048,
        "temperature": 0,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code == 429:
        raise HTTPException(429, "Groq quota exceeded. Please wait a moment and try again.")
    if resp.status_code != 200:
        raise HTTPException(422, f"Groq API error {resp.status_code}: {resp.text[:300]}")
    raw = resp.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError as e:
        raise HTTPException(422, f"Model did not return valid JSON: {e}. Raw: {raw[:300]}")


def _file_to_image_b64(contents: bytes, filename: str) -> tuple[str, str]:
    """Returns (base64, mime_type). Rasterises page 1 for PDFs."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        import pdfplumber
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            if not pdf.pages:
                raise HTTPException(422, "PDF has no pages.")
            pil_img = pdf.pages[0].to_image(resolution=200).original
            if pil_img.mode not in ("RGB", "L"):
                pil_img = pil_img.convert("RGB")
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=90)
            return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"
    else:
        from PIL import Image as PILImage
        img = PILImage.open(io.BytesIO(contents))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"


# ── Contextual vendor → ledger-account categorisation rules ─────────────────
# Learned/curated per firm; seed with common SaaS/vendor patterns and let
# admins extend it via /api/zte/category-rules (below) instead of redeploying.
DEFAULT_CATEGORY_RULES: List[dict] = [
    {"match": r"amazon\s*web\s*services|aws\b", "account_code": "5300", "label": "Software & Cloud Expenses"},
    {"match": r"google\s*cloud|gcp\b", "account_code": "5300", "label": "Software & Cloud Expenses"},
    {"match": r"microsoft|azure|office\s*365", "account_code": "5300", "label": "Software & Cloud Expenses"},
    {"match": r"zoom|slack|notion|figma|canva", "account_code": "5300", "label": "Software & Cloud Expenses"},
    {"match": r"indian\s*railways|irctc|ola|uber|indigo|spicejet|air\s*india", "account_code": "5500", "label": "Shipping & Freight / Travel"},
    {"match": r"electricity|power\s*corp|discom", "account_code": "5300", "label": "Office & Admin Expenses"},
]


async def _get_category_rules(company_id: str) -> List[dict]:
    rows = await db.zte_category_rules.find({"company_id": company_id}, {"_id": 0}).to_list(500)
    return rows if rows else DEFAULT_CATEGORY_RULES


async def classify_expense_account(company_id: str, vendor_name: str) -> tuple[str, str]:
    """Returns (account_code, category_label) for a PURCHASE line, falling back
    to the generic 'Purchases' account when no rule matches."""
    rules = await _get_category_rules(company_id)
    vn = (vendor_name or "").lower()
    for rule in rules:
        if re.search(rule["match"], vn, flags=re.IGNORECASE):
            return rule["account_code"], rule["label"]
    return "5000", "Purchases (uncategorised)"


class CategoryRule(BaseModel):
    company_id: str = ""
    match: str            # regex fragment matched against vendor name (case-insensitive)
    account_code: str     # chart_of_accounts code to route to
    label: str = ""


@router.get("/category-rules")
async def list_category_rules(company_id: str = Query(""), current_user: User = Depends(get_current_user)):
    return await _get_category_rules(company_id)


@router.post("/category-rules")
async def add_category_rule(rule: CategoryRule, current_user: User = Depends(get_current_user)):
    if not _perm_post(current_user):
        raise HTTPException(403, "Access denied.")
    doc = rule.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_by"] = current_user.id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.zte_category_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ── Core pipeline (importable — call this from a bucket/email webhook too) ──
async def process_document(
    contents: bytes,
    filename: str,
    company_id: str,
    created_by: str,
    auto_post: bool = True,
) -> dict:
    img_b64, mime = _file_to_image_b64(contents, filename)
    extracted = await _groq_extract_json(img_b64, mime)

    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": record_id,
        "company_id": company_id,
        "filename": filename,
        "extracted": extracted,
        "status": "extracted",
        "journal_entry_id": None,
        "posting_error": None,
        "created_by": created_by,
        "created_at": now,
    }

    if auto_post:
        try:
            entry = await route_to_ledger(company_id, extracted, created_by, source_id=record_id)
            record["journal_entry_id"] = entry["id"]
            record["status"] = "posted"
        except ValueError as e:
            # Amount/data didn't balance or was unusable — leave for human review
            # rather than silently posting something wrong.
            record["status"] = "needs_review"
            record["posting_error"] = str(e)

    await db.zte_processed_documents.insert_one(dict(record))
    record.pop("_id", None)
    return record


async def route_to_ledger(company_id: str, extracted: dict, created_by: str, source_id: str) -> dict:
    """Autonomous double-entry routing (Module 1 step 3)."""
    doc_type = (extracted.get("document_type") or "").upper()
    taxable_value = float(extracted.get("taxable_value") or 0)
    tax_breakup = extracted.get("tax_breakup") or {}
    cgst = float(tax_breakup.get("cgst") or 0)
    sgst = float(tax_breakup.get("sgst") or 0)
    igst = float(tax_breakup.get("igst") or 0)
    total_value = float(extracted.get("total_invoice_value") or 0)
    vendor = extracted.get("vendor_or_customer_name") or "Unknown Party"
    inv_no = extracted.get("invoice_number") or ""
    inv_date = extracted.get("invoice_date") or date.today().isoformat()

    if total_value <= 0:
        raise ValueError("Extracted invoice value is 0 — cannot post; needs manual review.")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", inv_date):
        inv_date = date.today().isoformat()

    total_tax = round(cgst + sgst + igst, 2)
    if taxable_value <= 0:
        taxable_value = round(total_value - total_tax, 2)

    ar_id = await ac.get_default_account_id(company_id, "1100")   # Accounts Receivable
    ap_id = await ac.get_default_account_id(company_id, "2000")   # Accounts Payable
    sales_id = await ac.get_default_account_id(company_id, "4000")  # Sales Income
    output_tax_id = await ac.get_default_account_id(company_id, "2100")  # GST Output Payable
    input_tax_id = await ac.get_default_account_id(company_id, "1200")   # GST Input Credit

    lines: list
    if doc_type == "SALE":
        lines = [
            {"account_id": ar_id, "account_name": "Accounts Receivable", "debit": total_value, "credit": 0,
             "memo": f"{vendor} — Inv {inv_no}"},
            {"account_id": sales_id, "account_name": "Sales / Fee Income", "debit": 0, "credit": taxable_value,
             "memo": vendor},
        ]
        if total_tax > 0:
            lines.append({"account_id": output_tax_id, "account_name": "GST Output Payable",
                           "debit": 0, "credit": total_tax, "memo": f"Output tax on Inv {inv_no}"})
        narration = f"AI zero-touch entry — Sale to {vendor}, Invoice {inv_no}"

    elif doc_type == "PURCHASE":
        expense_code, category_label = await classify_expense_account(company_id, vendor)
        expense_id = await ac.get_default_account_id(company_id, expense_code)
        lines = [
            {"account_id": expense_id, "account_name": category_label, "debit": taxable_value, "credit": 0,
             "memo": f"{vendor} — Inv {inv_no}"},
        ]
        if total_tax > 0:
            lines.append({"account_id": input_tax_id, "account_name": "GST Input Credit (ITC)",
                           "debit": total_tax, "credit": 0, "memo": f"ITC on Inv {inv_no}"})
        lines.append({"account_id": ap_id, "account_name": "Accounts Payable",
                       "debit": 0, "credit": total_value, "memo": vendor})
        narration = f"AI zero-touch entry — Purchase from {vendor} ({category_label}), Invoice {inv_no}"

    else:
        raise ValueError(f"Could not classify document as SALE or PURCHASE (got '{doc_type}').")

    if any(l["account_id"] is None for l in lines):
        raise ValueError("One or more default ledger accounts are missing for this company.")

    entry = await ac.post_journal_entry(
        company_id=company_id,
        entry_date=inv_date,
        narration=narration,
        lines=lines,
        source="ai_zero_touch",
        source_id=source_id,
        created_by=created_by,
    )
    return entry


# ── HTTP trigger (manual upload; swap/augment with bucket or email webhook) ─
@router.post("/upload")
async def upload_and_process(
    file: UploadFile = File(...),
    company_id: str = Form(""),
    auto_post: bool = Form(True),
    current_user: User = Depends(get_current_user),
):
    if not _perm_post(current_user):
        raise HTTPException(403, "Access denied. Request access from your admin in Permission Governance.")
    contents = await file.read()
    if not contents:
        raise HTTPException(422, "Empty file.")
    record = await process_document(
        contents=contents,
        filename=file.filename or "upload",
        company_id=company_id,
        created_by=current_user.id,
        auto_post=auto_post,
    )
    return record


@router.get("/documents")
async def list_processed_documents(
    company_id: str = Query(""),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    q: dict = {"company_id": company_id}
    if status:
        q["status"] = status
    docs = await db.zte_processed_documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.post("/documents/{doc_id}/retry-posting")
async def retry_posting(doc_id: str, current_user: User = Depends(get_current_user)):
    if not _perm_post(current_user):
        raise HTTPException(403, "Access denied.")
    doc = await db.zte_processed_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found.")
    if doc["status"] == "posted":
        raise HTTPException(400, "Already posted.")
    try:
        entry = await route_to_ledger(doc["company_id"], doc["extracted"], current_user.id, source_id=doc_id)
        await db.zte_processed_documents.update_one(
            {"id": doc_id},
            {"$set": {"status": "posted", "journal_entry_id": entry["id"], "posting_error": None}},
        )
        return {"success": True, "journal_entry_id": entry["id"]}
    except ValueError as e:
        raise HTTPException(400, str(e))


async def create_zte_indexes():
    await db.zte_processed_documents.create_index("company_id")
    await db.zte_processed_documents.create_index("status")
    await db.zte_category_rules.create_index("company_id")
