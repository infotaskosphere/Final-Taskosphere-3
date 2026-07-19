import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger("json_export")

class JSONExport:
    @staticmethod
    def export_to_json(data: List[Dict[str, Any]]) -> str:
        """Converts database models to serialized JSON text strings."""
        return json.dumps({
            "export_format": "JSON_SaaS",
            "count": len(data),
            "records": data
        }, indent=2)
