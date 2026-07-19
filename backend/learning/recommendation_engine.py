import logging
from typing import Dict, Any, List, Optional
from backend.learning.learning_storage import LearningStorage
from backend.learning.knowledge_base import KnowledgeBase
from backend.learning.similarity_engine import SimilarityEngine

logger = logging.getLogger("recommendation_engine")

class RecommendationEngine:
    @classmethod
    async def generate_recommendations(
        cls,
        context_data: Dict[str, Any],
        company_id: str
    ) -> List[Dict[str, Any]]:
        """
        Generates contextual recommendations (Ledger, GST, TDS, Narration, Cost Centre, etc.)
        based on the Knowledge Base and historical user actions.
        """
        recommendations = []
        try:
            vendor_name = context_data.get("vendor_name") or context_data.get("vendor") or ""
            doc_type = context_data.get("document_type") or context_data.get("doc_type") or ""
            invoice_value = float(context_data.get("total_invoice_value") or context_data.get("invoice_value") or 0.0)

            # 1. Vendor Ledger mapping recommendation
            if vendor_name:
                vendor_key = vendor_name.strip().lower()
                kb_vendor = await KnowledgeBase.get_knowledge_item("vendor_ledger", vendor_key, company_id)
                if kb_vendor:
                    recommendations.append({
                        "category": "Ledger",
                        "recommended_value": kb_vendor["value"],
                        "confidence": kb_vendor.get("confidence", 0.95),
                        "reason": f"Vendor '{vendor_name}' consistently mapped to Ledger '{kb_vendor['value']}' in previous approved entries.",
                        "supporting_evidence": {
                            "source_category": "vendor_ledger",
                            "key": vendor_key,
                            "meta": kb_vendor.get("meta", {})
                        }
                    })

            # 2. GST tax rate suggestion
            if invoice_value > 0:
                kb_gst = await KnowledgeBase.get_knowledge_item("gst_rate_patterns", doc_type.strip().lower(), company_id)
                if kb_gst:
                    recommendations.append({
                        "category": "GST",
                        "recommended_value": kb_gst["value"],
                        "confidence": kb_gst.get("confidence", 0.90),
                        "reason": f"Documents of type '{doc_type}' historically apply a GST rate of {kb_gst['value']}%.",
                        "supporting_evidence": {
                            "source_category": "gst_rate_patterns",
                            "key": doc_type.strip().lower()
                        }
                    })

            # 3. Narration pattern recommendations
            if vendor_name:
                kb_narration = await KnowledgeBase.get_knowledge_item("narration_patterns", vendor_name.strip().lower(), company_id)
                if kb_narration:
                    recommendations.append({
                        "category": "Narration",
                        "recommended_value": kb_narration["value"],
                        "confidence": kb_narration.get("confidence", 0.85),
                        "reason": f"Standard auto-generated narration pattern for vendor '{vendor_name}'.",
                        "supporting_evidence": {
                            "source_category": "narration_patterns",
                            "key": vendor_name.strip().lower()
                        }
                    })

            # 4. Fallback default confidence threshold recommendations
            kb_thresholds = await KnowledgeBase.get_knowledge_item("system_confidence_thresholds", "default", company_id)
            if kb_thresholds:
                recommendations.append({
                    "category": "Confidence Thresholds",
                    "recommended_value": kb_thresholds["value"],
                    "confidence": 1.0,
                    "reason": "Optimized system thresholds calculated based on administrative rule analysis.",
                    "supporting_evidence": {
                        "source_category": "system_confidence_thresholds",
                        "key": "default"
                    }
                })

            # Save generated recommendations to recommendation_history
            for rec in recommendations:
                await LearningStorage.save_recommendation_history({
                    "company_id": company_id,
                    "category": rec["category"],
                    "recommended_value": rec["recommended_value"],
                    "confidence": rec["confidence"],
                    "reason": rec["reason"],
                    "supporting_evidence": rec["supporting_evidence"],
                    "status": "pending"
                })

            logger.info(f"Generated {len(recommendations)} recommendations for company_id: {company_id}")
            return recommendations
        except Exception as e:
            logger.error(f"Failed to generate recommendations: {e}", exc_info=True)
            return []
