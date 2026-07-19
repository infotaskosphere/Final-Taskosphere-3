import logging
import re
from typing import Dict, Any, List, Optional
from backend.dependencies import db

logger = logging.getLogger("tool_router")

class ToolRouter:
    @staticmethod
    async def match_tool(query: str, company_id: str) -> Optional[Dict[str, Any]]:
        """Maps user's natural language to backend commands and matches business logic."""
        q = query.lower().strip()
        
        # 1. GST Query
        if "gst" in q or "tax return" in q:
            return {
                "module": "gst",
                "action": "list_filings",
                "args": {"company_id": company_id}
            }
            
        # 2. Financial Reports
        if "balance sheet" in q or "profit and loss" in q or "p&l" in q or "financial" in q or "mis" in q:
            return {
                "module": "reports",
                "action": "generate_summary",
                "args": {"company_id": company_id}
            }
            
        # 3. Duplicate/Fraud Detection
        if "duplicate" in q or "fraud" in q or "anomaly" in q or "validate" in q:
            return {
                "module": "audit",
                "action": "detect_anomalies",
                "args": {"company_id": company_id}
            }
            
        # 4. Bank Reconciliation
        if "reconcile" in q or "bank statement" in q:
            return {
                "module": "banking",
                "action": "bank_reconciliation",
                "args": {"company_id": company_id}
            }

        # 5. Predict Cash Flow
        if "cash flow" in q or "predict" in q or "trend" in q:
            return {
                "module": "analytics",
                "action": "predict_trends",
                "args": {"company_id": company_id}
            }

        # 6. ROC Filing
        if "roc" in q or "compliance" in q:
            return {
                "module": "compliance",
                "action": "list_compliance",
                "args": {"company_id": company_id}
            }
            
        return None

    @staticmethod
    async def execute_matched_tool(tool_info: Dict[str, Any]) -> Dict[str, Any]:
        """Runs the actual module logic using existing modules."""
        module = tool_info["module"]
        action = tool_info["action"]
        args = tool_info["args"]
        company_id = args.get("company_id")
        
        try:
            if module == "gst":
                from backend.gst_ai.gst_engine import GSTEngine
                # Return standard list
                filings = await db.gst_reconciliation_history.find({"company_id": company_id}).to_list(100)
                return {"status": "SUCCESS", "type": "GST_FILINGS", "data": filings}
                
            elif module == "reports":
                from backend.report_engine import BIReportGenerator
                report = await BIReportGenerator.generate_bi_report(company_id)
                return {"status": "SUCCESS", "type": "FINANCIAL_SUMMARY", "data": report}
                
            elif module == "audit":
                # Find documents that require review
                docs = await db.ai_document_memory.find({
                    "company_id": company_id,
                    "decision": "REQUIRES_REVIEW"
                }).to_list(50)
                return {"status": "SUCCESS", "type": "ANOMALIES_DETECTED", "data": docs}
                
            elif module == "banking":
                # Find bank accounts to show summary
                accounts = await db.bank_accounts.find({"company_id": company_id}).to_list(50)
                return {"status": "SUCCESS", "type": "BANK_RECONCILIATION_ACCOUNTS", "data": accounts}

            elif module == "analytics":
                from backend.report_engine import AnalyticalTrendAnalyzer
                trends = await AnalyticalTrendAnalyzer.analyze_trends(company_id)
                return {"status": "SUCCESS", "type": "TRENDS_PREDICTION", "data": trends}

            elif module == "compliance":
                compliances = await db.compliance_records.find({"company_id": company_id}).to_list(100)
                return {"status": "SUCCESS", "type": "COMPLIANCE_CALENDAR", "data": compliances}
                
        except Exception as e:
            logger.error(f"Error executing copilot tool route {module}.{action}: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}
            
        return {"status": "FAILED", "error": "Unknown module action"}
