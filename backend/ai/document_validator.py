import logging
import time
from typing import Dict, Any, Optional

# Import sub-modules
from backend.ai.confidence_engine import calculate_field_confidences
from backend.ai.field_validator import validate_extracted_fields
from backend.ai.business_rule_validator import validate_business_rules
from backend.ai.anomaly_detector import detect_anomalies
from backend.ai.confidence_calculator import calculate_overall_confidence
from backend.ai.decision_engine import make_routing_decision
from backend.ai.validation_storage import store_validation_report, store_confidence_history, store_anomaly_records

logger = logging.getLogger("document_validator")

async def run_document_validation_pipeline(
    extracted_data: Dict[str, Any],
    ocr_metadata: Dict[str, Any],
    filename: str,
    document_id: str,
    vendor_profile: Optional[Dict[str, Any]] = None,
    template_matched: bool = False,
    company_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Coordinates and executes the entire Phase 6 validation workflow:
    1. Runs field-level structural validators.
    2. Executes regulatory, mathematical, and vendor-specific business rules.
    3. Calculates individual field-level confidence scores.
    4. Computes a weighted, composite overall confidence score.
    5. Scans for potential anomalies, risks, and spike variances.
    6. Generates a routing decision (AUTO_POST, REQUIRES_REVIEW, REJECT, etc.).
    7. Persists records to MongoDB for future analytical optimization.
    """
    start_time = time.time()
    logger.info(f"AI Validation Pipeline: Initiated for document {document_id}")

    # 1. Vendor Match Score assignment
    vendor_match_score = 0.0
    if vendor_profile:
        # If there's an exact/fuzzy match confidence score attached, use it. Otherwise, default to 0.90 for matched
        vendor_match_score = float(vendor_profile.get("confidence_score" or "match_score", 0.90))

    # 2. Field-level Pattern Validation
    field_validation_res = await validate_extracted_fields(extracted_data, ocr_metadata, company_id)
    
    # 3. Business Rules Validation
    business_rules_res = await validate_business_rules(extracted_data, vendor_profile, company_id)

    # 4. Field Confidence Scores calculation
    field_confidences = calculate_field_confidences(
        extracted_data=extracted_data,
        ocr_metadata=ocr_metadata,
        vendor_match_score=vendor_match_score,
        template_matched=template_matched
    )

    # 5. Composite Confidence calculation
    overall_confidence = calculate_overall_confidence(
        field_confidences=field_confidences,
        ocr_metadata=ocr_metadata,
        vendor_match_score=vendor_match_score,
        template_matched=template_matched,
        business_rules_passed=business_rules_res.get("is_valid", True),
        historical_accuracy=0.95 if template_matched else 0.88
    )

    # 6. Anomaly Detection
    anomalies = await detect_anomalies(
        extracted_data=extracted_data,
        ocr_metadata=ocr_metadata,
        vendor_profile=vendor_profile,
        validation_details=field_validation_res,
        company_id=company_id
    )

    # 7. Workflow Decision Routing
    decision, reason = await make_routing_decision(
        overall_confidence=overall_confidence,
        validation_report={
            "field_validation": field_validation_res,
            "business_rules": business_rules_res
        },
        anomalies=anomalies,
        extracted_data=extracted_data,
        company_id=company_id
    )

    duration = time.time() - start_time

    # Construct unified validation report
    validation_report = {
        "document_id": document_id,
        "filename": filename,
        "decision": decision,
        "decision_reason": reason,
        "overall_confidence": overall_confidence,
        "processing_time": duration,
        "field_confidences": field_confidences,
        "field_validation": field_validation_res,
        "business_rules": business_rules_res,
        "anomalies": anomalies,
        "template_matched": template_matched,
        "vendor_matched": vendor_profile is not None,
        "ocr_engine": ocr_metadata.get("engine_used")
    }

    # 8. Asynchronous persistence
    try:
        await store_validation_report(document_id, filename, validation_report)
        await store_confidence_history(document_id, field_confidences, overall_confidence)
        await store_anomaly_records(document_id, anomalies)
    except Exception as db_err:
        logger.error(f"Failed to persist validation data: {db_err}", exc_info=True)

    logger.info(f"AI Validation Pipeline: Finished. Decision: {decision}, Time: {duration:.2f}s")
    return validation_report
