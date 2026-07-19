from typing import Dict, Any, List, Optional
import logging
from backend.gst_ai.gst_storage import GSTStorage

logger = logging.getLogger("gst_learning")

class GSTLearningEngine:
    @classmethod
    async def learn_from_approved_correction(
        cls,
        company_id: str,
        gstin: str,
        field_name: str,
        original_value: Any,
        approved_value: Any,
        industry: Optional[str] = None
    ) -> None:
        """
        Learns mapping pattern when an accountant corrects and approves a GST transaction.
        """
        if not gstin:
            return

        try:
            # Query existing learning patterns for this GSTIN
            existing = await GSTStorage.get_learning({"gstin": gstin, "type": "approved_correction", "field_name": field_name})
            
            now_learning = {
                "company_id": company_id,
                "gstin": gstin,
                "type": "approved_correction",
                "field_name": field_name,
                "original_value": original_value,
                "approved_value": approved_value,
                "industry": industry or "GENERAL",
                "frequency": 1
            }

            if existing:
                record = existing[0]
                record["frequency"] = record.get("frequency", 1) + 1
                record["approved_value"] = approved_value  # Overwrite with latest approved choice
                await GSTStorage.save_learning(record)
            else:
                await GSTStorage.save_learning(now_learning)

            logger.info(f"Learned approved correction pattern for GSTIN {gstin}: field '{field_name}' -> '{approved_value}'")
        except Exception as e:
            logger.error(f"Error updating GST learning database: {e}", exc_info=True)

    @classmethod
    async def get_smart_recommendation(cls, gstin: str, field_name: str, current_value: Any) -> Optional[Any]:
        """
        Exposes smart suggestions/recommendations based on historical approved corrections.
        """
        if not gstin:
            return None
        try:
            patterns = await GSTStorage.get_learning({
                "gstin": gstin,
                "type": "approved_correction",
                "field_name": field_name
            })
            if patterns:
                # Return the approved choice with the highest frequency
                sorted_p = sorted(patterns, key=lambda x: x.get("frequency", 1), reverse=True)
                return sorted_p[0].get("approved_value")
        except Exception as e:
            logger.error(f"Error querying recommendation patterns: {e}")
        return None

    @classmethod
    async def learn_vendor_specific_pattern(cls, gstin: str, txn: Dict[str, Any]) -> None:
        """
        Learns default HSN/SAC, tax rate, ITC availability pattern based on vendor's historical filings.
        """
        if not gstin:
            return
        try:
            hsn = txn.get("hsn") or txn.get("hsn_code")
            rate = txn.get("rate") or txn.get("tax_rate")
            itc_avail = txn.get("itc_availability")

            if not hsn and not rate:
                return

            pattern_key = f"vendor_pattern__{gstin}"
            existing = await GSTStorage.get_learning({"id": pattern_key})

            doc = {
                "id": pattern_key,
                "gstin": gstin,
                "type": "vendor_pattern",
                "dominant_hsn": hsn,
                "dominant_tax_rate": rate,
                "dominant_itc_avail": itc_avail,
                "updated_at": "now"
            }

            if existing:
                # Merge or count frequencies if needed; simple replacement for now
                existing_record = existing[0]
                if hsn: existing_record["dominant_hsn"] = hsn
                if rate is not None: existing_record["dominant_tax_rate"] = rate
                if itc_avail: existing_record["dominant_itc_avail"] = itc_avail
                await GSTStorage.save_learning(existing_record)
            else:
                await GSTStorage.save_learning(doc)
            
            logger.info(f"Vendor-specific filing patterns updated for GSTIN {gstin}")
        except Exception as e:
            logger.error(f"Error writing vendor pattern learning: {e}", exc_info=True)
