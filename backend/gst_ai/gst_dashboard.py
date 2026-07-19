from typing import Dict, Any, List
import logging
from datetime import date
from backend.gst_ai.gst_storage import GSTStorage
from backend.gst_ai.compliance_monitor import ComplianceMonitor

logger = logging.getLogger("gst_dashboard")

class GSTDashboardManager:
    @classmethod
    async def get_dashboard_summary(cls, company_id: str) -> Dict[str, Any]:
        """
        Compiles general summary analytics of GST metrics, active alerts, and monthly trends.
        """
        try:
            # 1. Gather all returns summaries from return history
            all_returns = await GSTStorage.list_returns({"company_id": company_id})
            
            total_outward_tax = 0.0
            total_itc_claimed = 0.0
            unreconciled_invoices_count = 0
            
            monthly_trends = []
            
            # Simple aggregation
            for ret in all_returns:
                outward = float(ret.get("outward_tax_summary", {}).get("total_tax", 0.0))
                itc = float(ret.get("itc_summary", {}).get("total_eligible", 0.0))
                
                total_outward_tax += outward
                total_itc_claimed += itc
                
                monthly_trends.append({
                    "month": ret.get("period", "Unknown"),
                    "outward_liability": outward,
                    "itc_claimed": itc,
                    "net_cash_payable": max(0.0, outward - itc)
                })

            # 2. Compute active alerts
            alerts = await ComplianceMonitor.generate_proactive_alerts(company_id)

            # 3. Fetch latest reconciliation sessions
            reconciliations = await GSTStorage.list_reconciliation_history({"company_id": company_id}, limit=5)
            latest_reconciled_rate = 100.0
            if reconciliations:
                latest_reconciled_rate = float(reconciliations[0].get("summary", {}).get("reconciliation_rate", 100.0))
                unreconciled_invoices_count = int(reconciliations[0].get("summary", {}).get("missing_in_books_count", 0) + reconciliations[0].get("summary", {}).get("missing_in_portal_count", 0))

            # 4. Compile quick actions
            quick_actions = []
            if alerts:
                quick_actions.append({
                    "action_type": "FILE_RETURN",
                    "title": "Resolve Pending Filing",
                    "severity": "high",
                    "description": "Filing deadline is critical. Run a reconciliation of GSTR-2B now."
                })
            if unreconciled_invoices_count > 0:
                quick_actions.append({
                    "action_type": "RESOLVE_MISMATCHES",
                    "title": f"Resolve {unreconciled_invoices_count} Unreconciled Items",
                    "severity": "medium",
                    "description": "There are outstanding differences between books and GSTR-2B filings."
                })
            else:
                quick_actions.append({
                    "action_type": "VERIFY_VENDORS",
                    "title": "Verify Vendor Compliance Profile",
                    "severity": "low",
                    "description": "Audit and review top vendor filing ratings."
                })

            return {
                "metrics": {
                    "total_liability": round(total_outward_tax, 2),
                    "total_eligible_itc": round(total_itc_claimed, 2),
                    "net_cash_payable": round(max(0.0, total_outward_tax - total_itc_claimed), 2),
                    "reconciliation_percentage": latest_reconciled_rate,
                    "unreconciled_invoices": unreconciled_invoices_count
                },
                "monthly_trends": monthly_trends[:12],
                "active_alerts": alerts,
                "quick_actions": quick_actions
            }
        except Exception as e:
            logger.error(f"Failed to generate GST dashboard metrics: {e}", exc_info=True)
            return {
                "metrics": {"total_liability": 0.0, "total_eligible_itc": 0.0, "net_cash_payable": 0.0, "reconciliation_percentage": 100.0, "unreconciled_invoices": 0},
                "monthly_trends": [],
                "active_alerts": [],
                "quick_actions": []
            }
