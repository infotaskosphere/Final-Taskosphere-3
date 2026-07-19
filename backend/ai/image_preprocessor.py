import logging
from PIL import Image, ImageEnhance, ImageOps, ImageFilter

logger = logging.getLogger("image_preprocessor")

def preprocess_image_for_ocr(
    img: Image.Image,
    enhance_contrast: bool = True,
    enhance_sharpness: bool = True,
    auto_rotate_angle: int = 0
) -> Image.Image:
    """
    Performs image preprocessing for optimal OCR results:
    - Auto rotates if angle specified
    - Noise removal via simple Median Filter
    - Autocontrast / histogram equalization
    - Contrast and Sharpness enhancement
    """
    try:
        # 1. Convert to RGB if not already
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
            
        # 2. Auto rotate
        if auto_rotate_angle != 0:
            logger.info(f"Preprocessing: Rotating image by {auto_rotate_angle} degrees")
            img = img.rotate(auto_rotate_angle, expand=True)
            
        # 3. Median filter for denoising/noise removal
        logger.debug("Preprocessing: Applying Median filter for denoising")
        img = img.filter(ImageFilter.MedianFilter(size=3))
        
        # 4. Auto contrast/normalization
        logger.debug("Preprocessing: Running autocontrast normalization")
        img = ImageOps.autocontrast(img, cutoff=2)
        
        # 5. Contrast enhancement
        if enhance_contrast:
            logger.debug("Preprocessing: Enhancing contrast")
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.4) # Boost contrast slightly for clearer text edges
            
        # 6. Sharpness enhancement
        if enhance_sharpness:
            logger.debug("Preprocessing: Enhancing sharpness")
            enhancer = ImageEnhance.Sharpness(img)
            img = enhancer.enhance(1.5) # Sharpen edges for OCR character boundaries
            
        logger.info("Image preprocessing completed successfully.")
        return img
    except Exception as e:
        logger.error(f"Failed to preprocess image: {e}", exc_info=True)
        return img
