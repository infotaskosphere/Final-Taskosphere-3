import io
import logging
from typing import Tuple

logger = logging.getLogger("pdf_text_extractor")

def is_searchable_pdf(contents: bytes) -> Tuple[bool, str]:
    """
    Checks if the PDF is searchable (contains a clean text layer).
    Returns (is_searchable, extracted_text).
    """
    try:
        import pdfplumber
        extracted_text_list = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            # Inspect first 5 pages for any embedded text
            for i, page in enumerate(pdf.pages[:5]):
                text = page.extract_text()
                if text and text.strip():
                    extracted_text_list.append(text.strip())
                    
        full_text = "\n\n".join(extracted_text_list)
        # If we have substantial non-whitespace text, it's a searchable/digital PDF
        if len(full_text.strip()) > 50:
            logger.info("PDF Text Extractor: Searchable PDF detected with clean text layer.")
            return True, full_text
            
    except Exception as e:
        logger.error(f"Error checking if PDF is searchable: {e}", exc_info=True)
        
    return False, ""

def extract_searchable_pdf_text(contents: bytes, max_pages: int = 30) -> str:
    """
    Extracts all embedded text from a searchable PDF up to max_pages.
    """
    try:
        import pdfplumber
        extracted_pages = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for i, page in enumerate(pdf.pages[:max_pages]):
                text = page.extract_text()
                if text and text.strip():
                    extracted_pages.append(f"--- Page {i+1} ---\n{text.strip()}")
                    
        return "\n\n".join(extracted_pages)
    except Exception as e:
        logger.error(f"Failed to extract searchable PDF text: {e}", exc_info=True)
        return ""
