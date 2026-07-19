import logging
from typing import List, Dict, Any

logger = logging.getLogger("xml_export")

class XMLExport:
    @staticmethod
    def export_to_tally_xml(journals: List[Dict[str, Any]]) -> str:
        """Translates general entries into Tally-compliant ERP XML standards."""
        xml_lines = [
            "<ENVELOPE>",
            "  <HEADER>",
            "    <TALLYREQUEST>Import Data</TALLYREQUEST>",
            "  </HEADER>",
            "  <BODY>",
            "    <IMPORTDATA>",
            "      <REQUESTDESC>",
            "        <REPORTNAME>All Vouchers</REPORTNAME>",
            "      </REQUESTDESC>",
            "      <REQUESTDATA>"
        ]
        
        for jrnl in journals:
            j_id = jrnl.get("id", "N/A")
            amount = jrnl.get("amount", 0.0)
            narrative = jrnl.get("narrative", "Auto-posted Entry")
            created_at = jrnl.get("created_at", "2026-07-19")[:10].replace("-", "")
            
            xml_lines.extend([
                "        <VOUCHER>",
                f"          <DATE>{created_at}</DATE>",
                "          <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>",
                f"          <NARRATION>{narrative}</NARRATION>",
                "          <ALLLEDGERENTRIES.LIST>",
                "            <LEDGERNAME>Suspense Account</LEDGERNAME>",
                "            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>",
                f"            <AMOUNT>-{amount}</AMOUNT>",
                "          </ALLLEDGERENTRIES.LIST>",
                "          <ALLLEDGERENTRIES.LIST>",
                "            <LEDGERNAME>Cash</LEDGERNAME>",
                "            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>",
                f"            <AMOUNT>{amount}</AMOUNT>",
                "          </ALLLEDGERENTRIES.LIST>",
                "        </VOUCHER>"
            ])
            
        xml_lines.extend([
            "      </REQUESTDATA>",
            "    </IMPORTDATA>",
            "  </BODY>",
            "</ENVELOPE>"
        ])
        return "\n".join(xml_lines)
