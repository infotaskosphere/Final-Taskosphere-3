import io
import logging
from typing import List, Tuple, Union
from PIL import Image

logger = logging.getLogger("page_splitter")

def split_pdf_pages(contents: bytes, max_pages: int = 10) -> List[Tuple[Image.Image, int]]:
    """
    Splits PDF bytes into PIL Images for each page.
    Returns a list of tuples: (PIL Image, page_number)
    """
    pages_list = []
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            page_count = len(pdf.pages)
            logger.info(f"Page splitter: PDF has {page_count} pages.")
            
            # Limit pages processed to avoid excessive consumption
            for i in range(min(page_count, max_pages)):
                page = pdf.pages[i]
                # Render to high quality PIL Image (DPI ~150-200)
                pil_img = page.to_image(resolution=150).original
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")
                pages_list.append((pil_img, i + 1))
                
        logger.info(f"Successfully split PDF into {len(pages_list)} page images.")
    except Exception as e:
        logger.error(f"Failed to split PDF into pages: {e}", exc_info=True)
        
    return pages_list

def split_image_or_other(contents: bytes, filename: str) -> List[Tuple[Image.Image, int]]:
    """
    Handles other image files (JPG, PNG, TIFF) or single pages.
    """
    try:
        img = Image.open(io.BytesIO(contents))
        # If multi-frame image (like TIFF)
        frames = []
        try:
            for i in range(10): # limit to first 10 frames
                img.seek(i)
                frame = img.copy()
                if frame.mode not in ("RGB", "L"):
                    frame = frame.convert("RGB")
                frames.append((frame, i + 1))
        except EOFError:
            # Done reading multi-frame TIFF or single frame image
            pass
            
        if not frames:
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            frames.append((img, 1))
            
        logger.info(f"Loaded document/image as {len(frames)} pages/frames.")
        return frames
    except Exception as e:
        logger.error(f"Failed to split or load image: {e}", exc_info=True)
        return []
