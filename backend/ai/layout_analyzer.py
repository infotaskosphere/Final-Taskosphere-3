import logging
import io
from typing import Any, Dict

logger = logging.getLogger("layout_analyzer")

def analyze_layout(contents: bytes, filename: str) -> Dict[str, Any]:
    """
    Analyzes page layout dimensions, margins, text blocks, table positions,
    and returns a reusable layout signature. Does NOT perform OCR.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    
    # Default layout signature structure
    signature = {
        "page_count": 1,
        "page_size": "Standard/Unknown",
        "dimensions": {"width": 0.0, "height": 0.0},
        "margins": {"top": 0.0, "bottom": 0.0, "left": 0.0, "right": 0.0},
        "text_blocks": [],  # list of {x0, y0, x1, y1, word_count}
        "table_positions": [],  # list of {x0, y0, x1, y1}
        "header_area": {"width": 0.0, "height": 0.0, "has_content": False},
        "footer_area": {"width": 0.0, "height": 0.0, "has_content": False},
        "logo_location": None,  # {x0, y0, x1, y1}
        "column_positions": [],  # detected vertical alignment guidelines
        "reading_order": "top-to-bottom",
        "file_type": ext,
        "layout_signature_hash": ""
    }

    if ext != "pdf":
        # Non-PDF files get a consistent structure based on content metadata
        import hashlib
        signature["layout_signature_hash"] = hashlib.sha256(f"non-pdf-{ext}-{len(contents)}".encode()).hexdigest()
        return signature

    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            signature["page_count"] = len(pdf.pages)
            if not pdf.pages:
                return signature
            
            # We analyze the first page as the layout identifier
            page = pdf.pages[0]
            width = float(page.width)
            height = float(page.height)
            signature["dimensions"] = {"width": width, "height": height}
            
            # Deduce page size
            if 590 < width < 600 and 840 < height < 850:
                signature["page_size"] = "A4"
            elif 610 < width < 620 and 790 < height < 800:
                signature["page_size"] = "Letter"
            else:
                signature["page_size"] = f"Custom ({width:.1f}x{height:.1f})"

            # Extract words to find margins, text blocks, columns
            words = page.extract_words()
            if words:
                x0s = [float(w["x0"]) for w in words]
                top_ys = [float(w["top"]) for w in words]
                x1s = [float(w["x1"]) for w in words]
                bottom_ys = [float(w["bottom"]) for w in words]
                
                min_x = min(x0s)
                max_x = max(x1s)
                min_y = min(top_ys)
                max_y = max(bottom_ys)
                
                signature["margins"] = {
                    "left": min_x,
                    "right": width - max_x,
                    "top": min_y,
                    "bottom": height - max_y
                }

                # Group words into rough text block areas
                blocks = []
                sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))
                current_block = None
                for w in sorted_words:
                    if not current_block:
                        current_block = {
                            "x0": float(w["x0"]),
                            "y0": float(w["top"]),
                            "x1": float(w["x1"]),
                            "y1": float(w["bottom"]),
                            "word_count": 1
                        }
                    else:
                        # If word is close vertically and horizontally, merge
                        if abs(w["top"] - current_block["y1"]) < 15 and abs(w["x0"] - current_block["x1"]) < 50:
                            current_block["x1"] = max(current_block["x1"], float(w["x1"]))
                            current_block["y1"] = max(current_block["y1"], float(w["bottom"]))
                            current_block["word_count"] += 1
                        else:
                            blocks.append(current_block)
                            current_block = {
                                "x0": float(w["x0"]),
                                "y0": float(w["top"]),
                                "x1": float(w["x1"]),
                                "y1": float(w["bottom"]),
                                "word_count": 1
                            }
                if current_block:
                    blocks.append(current_block)
                
                # Filter/keep up to 10 significant text blocks to avoid bloat
                signature["text_blocks"] = sorted(blocks, key=lambda b: b["word_count"], reverse=True)[:10]

                # Identify potential logo position (often in top-left or top-right with no heavy text)
                images = page.images
                if images:
                    img = images[0]
                    signature["logo_location"] = {
                        "x0": float(img.get("x0", 0)),
                        "y0": float(img.get("y0", 0)),
                        "x1": float(img.get("x1", 0)),
                        "y1": float(img.get("y1", 0))
                    }

                # Columns analysis: count typical starting x0 positions
                x_starts = [round(float(w["x0"]), 0) for w in words]
                from collections import Counter
                common_starts = [item for item, count in Counter(x_starts).most_common(5) if count > 3]
                signature["column_positions"] = sorted(list(set(common_starts)))

            # Extract tables using pdfplumber's table finder
            tables = page.find_tables()
            if tables:
                for t in tables:
                    bbox = t.bbox
                    signature["table_positions"].append({
                        "x0": float(bbox[0]),
                        "y0": float(bbox[1]),
                        "x1": float(bbox[2]),
                        "y1": float(bbox[3])
                    })

            # Define header area (top 15%) and footer area (bottom 15%)
            header_h = height * 0.15
            footer_h = height * 0.85
            signature["header_area"] = {
                "width": width,
                "height": header_h,
                "has_content": any(float(w["bottom"]) <= header_h for w in words) if words else False
            }
            signature["footer_area"] = {
                "width": width,
                "height": height - footer_h,
                "has_content": any(float(w["top"]) >= footer_h for w in words) if words else False
            }

            # Generate a layout hash signature from coordinates for exact/near matching
            import hashlib
            layout_str = f"{signature['page_size']}-{len(signature['text_blocks'])}-{len(signature['table_positions'])}"
            for tb in signature["text_blocks"]:
                layout_str += f"-{tb['x0']:.0f},{tb['y0']:.0f}"
            signature["layout_signature_hash"] = hashlib.sha256(layout_str.encode()).hexdigest()

    except Exception as exc:
        logger.error(f"Error in layout_analyzer: {exc}", exc_info=True)
        # Graceful fallback hash
        import hashlib
        signature["layout_signature_hash"] = hashlib.sha256(f"fallback-{len(contents)}".encode()).hexdigest()

    return signature
