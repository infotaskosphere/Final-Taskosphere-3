import logging
import math
from typing import Dict, Any, Tuple
from PIL import Image, ImageStat, ImageOps

logger = logging.getLogger("ocr_quality")

def evaluate_image_quality(img: Image.Image) -> Dict[str, float]:
    """
    Evaluates image quality metrics using PIL only to avoid heavy external dependencies like OpenCV/Numpy.
    Returns metrics: blur, noise, contrast, rotation, resolution, text_completeness, quality_score
    """
    try:
        # Convert to Grayscale for most calculations
        gray = img.convert("L")
        width, height = gray.size
        
        # 1. Resolution score (longer edge relative to standard 2000px)
        resolution = float(max(width, height))
        resolution_score = min(1.0, resolution / 2000.0)
        
        # 2. Contrast score (using standard deviation of histogram)
        stat = ImageStat.Stat(gray)
        std_dev = stat.stddev[0] if stat.stddev else 0
        # Normal contrast range standard deviation of L is usually around 40-80.
        contrast_score = min(1.0, std_dev / 65.0)
        
        # 3. Noise score (estimated using histogram entropy or local pixel difference)
        # Low entropy in high-contrast/clean text, high entropy in grainy/noisy images.
        hist = gray.histogram()
        total_pixels = sum(hist) or 1
        entropy = 0.0
        for count in hist:
            if count > 0:
                p = count / total_pixels
                entropy -= p * math.log2(p)
        # Clean business documents have lower entropy of L histogram because of white background dominance.
        # Entropy > 5.5 usually indicates noise or background gradients.
        noise_score = max(0.1, min(1.0, (7.5 - entropy) / 3.0))
        
        # 4. Blur score (approximated via average edge gradient using PIL FindEdges)
        # Apply a simple high-pass/edge filter and measure average intensity.
        from PIL import ImageFilter
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edge_stat = ImageStat.Stat(edges)
        edge_mean = edge_stat.mean[0] if edge_stat.mean else 0
        # Blurry images have fewer/weaker edges.
        blur_score = min(1.0, edge_mean / 12.0)
        
        # 5. Rotation (estimated 0.0 unless corrected)
        rotation_score = 1.0 # default to aligned
        
        # 6. Text completeness (1.0 default, can be updated post-OCR)
        text_completeness = 1.0
        
        # Calculate composite quality score (weighted average)
        # 0.3 * resolution + 0.3 * contrast + 0.2 * noise + 0.2 * blur
        composite_score = (
            0.3 * resolution_score +
            0.3 * contrast_score +
            0.2 * noise_score +
            0.2 * blur_score
        )
        composite_score = round(max(0.1, min(1.0, composite_score)), 2)
        
        return {
            "blur": round(blur_score, 2),
            "noise": round(noise_score, 2),
            "contrast": round(contrast_score, 2),
            "rotation": 0.0,
            "resolution": resolution,
            "ocr_confidence": 1.0, # default until OCR is run
            "text_completeness": text_completeness,
            "quality_score": composite_score
        }
    except Exception as e:
        logger.error(f"Error evaluating image quality: {e}", exc_info=True)
        return {
            "blur": 0.5,
            "noise": 0.5,
            "contrast": 0.5,
            "rotation": 0.0,
            "resolution": 1000.0,
            "ocr_confidence": 0.5,
            "text_completeness": 0.5,
            "quality_score": 0.5
        }
