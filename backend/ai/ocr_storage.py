import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from backend.dependencies import db

logger = logging.getLogger("ocr_storage")

async def init_ocr_indexes():
    """
    Initializes indexes on the OCR collections.
    """
    try:
        await db.ocr_processing_history.create_index("document_id")
        await db.ocr_processing_history.create_index("engine_used")
        await db.ocr_quality_reports.create_index("document_id")
        await db.ocr_engine_statistics.create_index("engine_name", unique=True)
        logger.info("OCR storage MongoDB indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing OCR indexes: {e}", exc_info=True)

async def store_ocr_history(
    document_id: str,
    filename: str,
    engine_used: str,
    processing_time: float,
    confidence: float,
    detected_language: str,
    quality_score: float,
    pages_processed: int,
    fallback_engine: Optional[str] = None,
    errors: Optional[str] = None,
    warnings: Optional[str] = None
) -> None:
    """
    Stores an entry in the ocr_processing_history collection.
    """
    try:
        record = {
            "document_id": document_id,
            "filename": filename,
            "engine_used": engine_used,
            "processing_time": processing_time,
            "confidence": confidence,
            "detected_language": detected_language,
            "quality_score": quality_score,
            "pages_processed": pages_processed,
            "fallback_engine": fallback_engine,
            "errors": errors,
            "warnings": warnings,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.ocr_processing_history.insert_one(record)
        logger.info(f"OCR history stored for doc {document_id} using engine {engine_used}.")
        
        # Update engine statistics
        await update_engine_statistics(engine_used, processing_time, confidence, errors is None)
    except Exception as e:
        logger.error(f"Failed to store OCR history: {e}", exc_info=True)

async def store_ocr_quality_report(
    document_id: str,
    filename: str,
    blur: float,
    noise: float,
    contrast: float,
    rotation: float,
    resolution: float,
    ocr_confidence: float,
    text_completeness: float,
    quality_score: float
) -> None:
    """
    Stores a detailed OCR quality report.
    """
    try:
        record = {
            "document_id": document_id,
            "filename": filename,
            "blur": blur,
            "noise": noise,
            "contrast": contrast,
            "rotation": rotation,
            "resolution": resolution,
            "ocr_confidence": ocr_confidence,
            "text_completeness": text_completeness,
            "quality_score": quality_score,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.ocr_quality_reports.insert_one(record)
        logger.info(f"OCR quality report stored for doc {document_id} with score {quality_score}.")
    except Exception as e:
        logger.error(f"Failed to store OCR quality report: {e}", exc_info=True)

async def update_engine_statistics(
    engine_name: str,
    processing_time: float,
    confidence: float,
    is_success: bool
) -> None:
    """
    Updates or inserts the aggregate statistics for an OCR engine.
    """
    try:
        inc_fields = {
            "total_calls": 1,
            "successful_calls": 1 if is_success else 0,
            "failed_calls": 0 if is_success else 1,
            "total_processing_time": processing_time,
        }
        
        # We perform atomic upsert updates in MongoDB
        await db.ocr_engine_statistics.update_one(
            {"engine_name": engine_name},
            {
                "$inc": inc_fields,
                "$set": {
                    "last_used": datetime.now(timezone.utc).isoformat(),
                    "average_confidence": confidence # Let's keep a simple latest/moving avg
                }
            },
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to update OCR engine statistics: {e}", exc_info=True)
