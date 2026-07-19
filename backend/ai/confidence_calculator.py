import logging
from typing import Dict, Any

logger = logging.getLogger("confidence_calculator")

# Default configurable weights for overall confidence
DEFAULT_WEIGHTS = {
    "ocr_quality": 0.15,
    "template_match": 0.25,
    "vendor_match": 0.20,
    "field_confidence": 0.30,
    "historical_accuracy": 0.10
}

def calculate_overall_confidence(
    field_confidences: Dict[str, float],
    ocr_metadata: Dict[str, Any],
    vendor_match_score: float = 0.0,
    template_matched: bool = False,
    business_rules_passed: bool = True,
    historical_accuracy: float = 0.90, # default expected high accuracy
    weights: Dict[str, float] = None
) -> float:
    """
    Computes a composite, weighted confidence score between 0.0 and 1.0.
    
    Overall score is calculated using:
      - OCR Quality (0.15)
      - Template Match (0.25)
      - Vendor Match (0.20)
      - Field Confidence Average (0.30)
      - Historical Accuracy (0.10)
      
    If business rules fail, a significant penalty discount is applied to enforce quality control.
    """
    if weights is None:
        weights = DEFAULT_WEIGHTS
        
    try:
        # Normalize weights to sum up to 1.0 just in case
        total_w = sum(weights.values()) or 1.0
        normalized_weights = {k: v / total_w for k, v in weights.items()}
        
        # 1. OCR Quality score
        ocr_quality = float(ocr_metadata.get("quality_score", 0.80))
        
        # 2. Template Match score
        template_score = 1.0 if template_matched else 0.0
        
        # 3. Field Confidence Average (for non-missing core fields)
        core_fields = [
            "vendor_or_customer_name",
            "invoice_number",
            "invoice_date",
            "total_invoice_value",
            "taxable_value"
        ]
        core_confidences = [field_confidences.get(f, 0.0) for f in core_fields]
        avg_field_conf = sum(core_confidences) / len(core_confidences) if core_confidences else 0.0
        
        # Compute weighted average
        weighted_score = (
            normalized_weights.get("ocr_quality", 0.15) * ocr_quality +
            normalized_weights.get("template_match", 0.25) * template_score +
            normalized_weights.get("vendor_match", 0.20) * vendor_match_score +
            normalized_weights.get("field_confidence", 0.30) * avg_field_conf +
            normalized_weights.get("historical_accuracy", 0.10) * historical_accuracy
        )
        
        # Apply structural penalties/discounts
        # If business validation checks fail, apply a 20% penalty
        if not business_rules_passed:
            logger.info("Confidence Calculator: Business rules failed. Applying 20% penalty discount.")
            weighted_score *= 0.80
            
        # If template matched but fields look weird, make sure we stay below 0.95
        if template_matched and avg_field_conf < 0.60:
            weighted_score = min(weighted_score, 0.70)
            
        final_score = round(max(0.0, min(1.0, weighted_score)), 2)
        logger.info(f"Confidence Calculator: Computed composite score: {final_score}")
        return final_score
        
    except Exception as e:
        logger.error(f"Error calculating overall confidence: {e}", exc_info=True)
        return 0.50
