import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from backend.dependencies import db

logger = logging.getLogger("validation_storage")

async def init_validation_indexes():
    """
    Initializes indexes on validation, confidence, and anomaly collections.
    """
    try:
        await db.ai_validation_results.create_index("document_id")
        await db.ai_validation_results.create_index("decision")
        await db.ai_confidence_history.create_index("document_id")
        await db.ai_anomaly_history.create_index("document_id")
        await db.ai_anomaly_history.create_index("anomaly_type")
        logger.info("AI Validation and Confidence MongoDB indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing validation indexes: {e}", exc_info=True)

async def store_validation_report(
    document_id: str,
    filename: str,
    report: Dict[str, Any]
) -> None:
    """
    Stores the full quality/validation report generated for a document.
    """
    try:
        record = {
            "document_id": document_id,
            "filename": filename,
            "report": report,
            "decision": report.get("decision"),
            "overall_confidence": report.get("overall_confidence", 0.0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "stored",
            "reviewer": None,
            "approval_status": "pending",
            "audit_trail": [
                {
                    "action": "Generated validation report",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "user": "system",
                    "details": f"Decision: {report.get('decision')}"
                }
            ]
        }
        await db.ai_validation_results.insert_one(record)
        logger.info(f"AI Validation report successfully stored for document {document_id}")
    except Exception as e:
        logger.error(f"Failed to store validation report for document {document_id}: {e}", exc_info=True)

async def store_confidence_history(
    document_id: str,
    field_scores: Dict[str, float],
    overall_confidence: float
) -> None:
    """
    Stores historical field-level and overall confidence scores for analytical auditing.
    """
    try:
        record = {
            "document_id": document_id,
            "field_scores": field_scores,
            "overall_confidence": overall_confidence,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.ai_confidence_history.insert_one(record)
        logger.info(f"AI Confidence history successfully stored for document {document_id}")
    except Exception as e:
        logger.error(f"Failed to store confidence history for document {document_id}: {e}", exc_info=True)

async def store_anomaly_records(
    document_id: str,
    anomalies: list
) -> None:
    """
    Stores list of identified anomalies for audit and reporting.
    """
    try:
        if not anomalies:
            return
        records = []
        now = datetime.now(timezone.utc).isoformat()
        for anomaly in anomalies:
            records.append({
                "document_id": document_id,
                "anomaly_type": anomaly.get("anomaly_type"),
                "severity": anomaly.get("severity"),
                "recommendation": anomaly.get("recommendation"),
                "details": anomaly.get("details"),
                "timestamp": now
            })
        await db.ai_anomaly_history.insert_many(records)
        logger.info(f"Stored {len(anomalies)} anomalies for document {document_id}")
    except Exception as e:
        logger.error(f"Failed to store anomalies for document {document_id}: {e}", exc_info=True)

async def get_validation_report(document_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves stored validation report for a document.
    """
    try:
        return await db.ai_validation_results.find_one({"document_id": document_id}, {"_id": 0})
    except Exception as e:
        logger.error(f"Failed to retrieve validation report for document {document_id}: {e}", exc_info=True)
        return None
