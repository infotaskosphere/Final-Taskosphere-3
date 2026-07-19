import io
import logging
from PIL import Image

logger = logging.getLogger("image_optimizer")

def optimize_image_for_ocr(
    img: Image.Image,
    max_dimension: int = 1800,
    quality: int = 85,
    output_format: str = "JPEG"
) -> bytes:
    """
    Optimizes a PIL image for OCR processing.
    Scales down to max_dimension preserving aspect ratio.
    Saves as compressed JPEG/PNG bytes to reduce network overhead and processing latency.
    """
    try:
        width, height = img.size
        # Calculate scaling factor if dimensions exceed maximum threshold
        if width > max_dimension or height > max_dimension:
            if width > height:
                new_width = max_dimension
                new_height = int(height * (max_dimension / width))
            else:
                new_height = max_dimension
                new_width = int(width * (max_dimension / height))
                
            logger.info(f"Image Optimizer: Scaling down image from {width}x{height} to {new_width}x{new_height}")
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
        # Ensure image is in RGB or Grayscale mode before saving
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
            
        buf = io.BytesIO()
        img.save(buf, format=output_format, quality=quality)
        optimized_bytes = buf.getvalue()
        logger.info(f"Image Optimizer: Optimized image size is {len(optimized_bytes)} bytes.")
        return optimized_bytes
    except Exception as e:
        logger.error(f"Error optimizing image: {e}", exc_info=True)
        # Fallback to saving original mode
        buf = io.BytesIO()
        try:
            img.save(buf, format="JPEG")
            return buf.getvalue()
        except Exception:
            return b""
