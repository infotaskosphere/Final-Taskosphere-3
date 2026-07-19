import hashlib
import re

def generate_document_fingerprint(
    vendor_name: str,
    vendor_gstin: str,
    invoice_number: str,
    document_type: str,
    raw_ocr_text: str
) -> str:
    """
    Generates a document fingerprint string using SHA-256 with normalized values.
    """
    def _normalize(val: str) -> str:
        if not val:
            return ""
        # Lowercase, strip, remove non-alphanumeric for safe consistency
        return re.sub(r'[^a-z0-9]', '', str(val).lower().strip())

    norm_vendor_name = _normalize(vendor_name)
    norm_vendor_gstin = _normalize(vendor_gstin)
    norm_invoice_number = _normalize(invoice_number)
    norm_document_type = _normalize(document_type)

    # First 1000 OCR characters
    ocr_segment = (raw_ocr_text or "")[:1000]
    norm_ocr = re.sub(r'\s+', ' ', ocr_segment).strip().lower()

    payload = f"{norm_vendor_name}|{norm_vendor_gstin}|{norm_invoice_number}|{norm_document_type}|{norm_ocr}"
    
    sha256 = hashlib.sha256()
    sha256.update(payload.encode('utf-8'))
    return sha256.hexdigest()
