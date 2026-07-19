from typing import Dict, Any, List, Optional
import uuid
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("ewaybill_engine")

class EWayBillEngine:
    @staticmethod
    def calculate_validity_days(distance_km: float, is_overdimensional: bool = False) -> int:
        """
        Calculates E-Way Bill validity based on Distance.
        Rule:
          - Standard Cargo: 1 day per 200 km (or part thereof).
          - Over-dimensional Cargo (ODC): 1 day per 20 km (or part thereof).
        """
        if distance_km <= 0:
            return 1
        
        divisor = 20.0 if is_overdimensional else 200.0
        days = int(distance_km // divisor)
        if distance_km % divisor > 0:
            days += 1
        return days

    @classmethod
    async def generate_ewaybill(cls, details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simulates generation of E-Way Bill and stores in the database.
        """
        try:
            from backend.gst_ai.gst_storage import GSTStorage
            
            ewb_id = str(uuid.uuid4())
            # Standard 12 digit numeric e-way bill number
            ewb_no = "".join([str(uuid.uuid4().int)[i] for i in range(12)])
            
            distance = float(details.get("distance") or 150.0)
            is_odc = bool(details.get("is_overdimensional") or False)
            validity_days = cls.calculate_validity_days(distance, is_odc)
            
            created_at = datetime.now(timezone.utc)
            expires_at = created_at + timedelta(days=validity_days)
            
            record = {
                "id": ewb_id,
                "ewaybill_number": ewb_no,
                "invoice_no": details.get("invoice_no"),
                "distance": distance,
                "is_overdimensional": is_odc,
                "vehicle_no": details.get("vehicle_no") or "DL1CA1234",
                "transporter_id": details.get("transporter_id") or "TRANS_DEFAULT",
                "transporter_name": details.get("transporter_name") or "Express Cargo Ltd",
                "created_at": created_at.isoformat(),
                "expires_at": expires_at.isoformat(),
                "status": "ACTIVE",
                "extensions": [],
                "cancellation_status": "ACTIVE"
            }
            
            await GSTStorage.save_ewaybill(record)
            logger.info(f"E-Way Bill {ewb_no} created successfully.")
            return {
                "status": "SUCCESS",
                "ewaybill_number": ewb_no,
                "expires_at": expires_at.isoformat(),
                "validity_days": validity_days
            }
        except Exception as e:
            logger.error(f"Failed to generate E-Way Bill: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    @classmethod
    async def cancel_ewaybill(cls, ewb_number: str, reason: str = "Duplicate") -> Dict[str, Any]:
        try:
            from backend.gst_ai.gst_storage import GSTStorage
            records = await GSTStorage.list_ewaybill_history({"ewaybill_number": ewb_number})
            if not records:
                return {"status": "FAILED", "error": "E-Way Bill not found."}
            
            record = records[0]
            record["status"] = "CANCELLED"
            record["cancellation_status"] = "CANCELLED"
            record["cancel_reason"] = reason
            await GSTStorage.save_ewaybill(record)
            logger.info(f"E-Way Bill {ewb_number} cancelled.")
            return {"status": "SUCCESS", "ewaybill_number": ewb_number}
        except Exception as e:
            logger.error(f"Failed to cancel E-Way Bill: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    @classmethod
    async def extend_ewaybill(cls, ewb_number: str, reason: str, distance_extension: float) -> Dict[str, Any]:
        try:
            from backend.gst_ai.gst_storage import GSTStorage
            records = await GSTStorage.list_ewaybill_history({"ewaybill_number": ewb_number})
            if not records:
                return {"status": "FAILED", "error": "E-Way Bill not found."}
            
            record = records[0]
            expiry_dt = datetime.fromisoformat(record["expires_at"])
            
            # Extend validity by standard calculation
            is_odc = record.get("is_overdimensional", False)
            extra_days = cls.calculate_validity_days(distance_extension, is_odc)
            new_expiry = expiry_dt + timedelta(days=extra_days)
            
            record["expires_at"] = new_expiry.isoformat()
            record["extensions"].append({
                "reason": reason,
                "extended_at": datetime.now(timezone.utc).isoformat(),
                "extra_days": extra_days
            })
            
            await GSTStorage.save_ewaybill(record)
            logger.info(f"E-Way Bill {ewb_number} extended to {new_expiry.isoformat()}.")
            return {"status": "SUCCESS", "new_expires_at": new_expiry.isoformat()}
        except Exception as e:
            logger.error(f"Failed to extend E-Way Bill: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}
