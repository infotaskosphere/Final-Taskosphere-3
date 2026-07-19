import logging
import os
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("ocr_selector")

class BaseOCREngine:
    """Base interface/class for all pluggable OCR engines."""
    def get_name(self) -> str:
        raise NotImplementedError()
        
    def is_available(self) -> bool:
        raise NotImplementedError()
        
    async def extract_text_from_image(self, img_bytes: bytes, mime_type: str) -> Tuple[str, float]:
        """Returns (extracted_text, confidence_score)"""
        raise NotImplementedError()

# Registry of all pluggable OCR engines
_OCR_ENGINE_REGISTRY: Dict[str, BaseOCREngine] = {}

def register_ocr_engine(engine_id: str, engine: BaseOCREngine):
    _OCR_ENGINE_REGISTRY[engine_id] = engine
    logger.info(f"Registered pluggable OCR engine: {engine_id}")

def get_registered_engines() -> Dict[str, BaseOCREngine]:
    return _OCR_ENGINE_REGISTRY

def select_best_ocr_engine(
    filename: str,
    quality_score: float,
    preferred_engine: Optional[str] = None
) -> Tuple[str, List[str]]:
    """
    Intelligently selects the best OCR engine based on document quality metrics and preference.
    Returns (selected_engine_id, list_of_fallback_engines)
    """
    available_engines = [eid for eid, eng in _OCR_ENGINE_REGISTRY.items() if eng.is_available()]
    
    if not available_engines:
        logger.warning("No OCR engines are currently registered/available. Falling back to basic vision.")
        return "gemini_vision", []
        
    # User or router preferred engine
    if preferred_engine in available_engines:
        fallbacks = [e for e in available_engines if e != preferred_engine]
        return preferred_engine, fallbacks

    # Quality-based heuristics
    # If quality is very low (< 0.5), prioritize Gemini Vision as it handles skew and noise best
    if quality_score < 0.50:
        if "gemini_vision" in available_engines:
            primary = "gemini_vision"
        elif "groq_vision" in available_engines:
            primary = "groq_vision"
        else:
            primary = available_engines[0]
    else:
        # Standard clean documents can use tesseract or local engines to save API costs
        if "tesseract" in available_engines:
            primary = "tesseract"
        elif "gemini_vision" in available_engines:
            primary = "gemini_vision"
        else:
            primary = available_engines[0]
            
    fallbacks = [e for e in available_engines if e != primary]
    
    # Ensure gemini_vision or groq_vision is in the fallbacks as a final tier
    for super_engine in ["gemini_vision", "groq_vision"]:
        if super_engine in available_engines and super_engine != primary and super_engine not in fallbacks:
            fallbacks.append(super_engine)
            
    logger.info(f"OCR Selector: Chosen primary engine '{primary}' with fallback list {fallbacks}")
    return primary, fallbacks

def estimate_metrics(engine_name: str, quality_score: float) -> Tuple[float, float]:
    """
    Estimates (processing_time_secs, confidence_score) for a given engine & quality profile.
    """
    # Baseline processing times and confidence based on engine type
    metrics = {
        "gemini_vision": {"time": 4.5, "conf": 0.95},
        "groq_vision": {"time": 3.5, "conf": 0.90},
        "tesseract": {"time": 1.2, "conf": 0.75},
        "paddle_ocr": {"time": 2.0, "conf": 0.85},
        "google_vision": {"time": 2.5, "conf": 0.96},
        "azure_ocr": {"time": 2.2, "conf": 0.95}
    }
    
    engine_data = metrics.get(engine_name, {"time": 3.0, "conf": 0.80})
    est_time = engine_data["time"]
    
    # Confidence is scaled based on document quality score
    est_conf = engine_data["conf"] * (0.60 + 0.40 * quality_score)
    
    return round(est_time, 2), round(max(0.1, min(1.0, est_conf)), 2)
