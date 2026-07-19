import csv
import io
import logging
from typing import List, Dict, Any

logger = logging.getLogger("excel_export")

class ExcelExport:
    @staticmethod
    def render_excel_csv(headers: List[str], rows: List[Dict[str, Any]]) -> str:
        """Assembles beautiful datasets inside standard CSV spreadsheet feeds."""
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write headers
        writer.writerow(headers)
        
        # Write records
        for r in rows:
            writer.writerow([r.get(col, "") for col in headers])
            
        return output.getvalue()
