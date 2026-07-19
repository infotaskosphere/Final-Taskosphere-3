from typing import List, Dict, Any, Optional
import logging
from datetime import datetime, date, timedelta

logger = logging.getLogger("compliance_monitor")

class ComplianceMonitor:
    @staticmethod
    def get_upcoming_due_dates(tax_period_year_month: str) -> List[Dict[str, Any]]:
        """
        Calculates statutory filing due dates for a given tax period (format: 'YYYY-MM').
        GSTR-1 is due on the 11th of the next month.
        GSTR-3B is due on the 20th of the next month.
        """
        try:
            year = int(tax_period_year_month[:4])
            month = int(tax_period_year_month[5:7])
        except Exception:
            # fallback to current month
            today = date.today()
            year, month = today.year, today.month

        # next month calculations
        if month == 12:
            next_month = 1
            next_year = year + 1
        else:
            next_month = month + 1
            next_year = year

        gstr1_due = date(next_year, next_month, 11)
        gstr3b_due = date(next_year, next_month, 20)

        return [
            {
                "return_type": "GSTR-1",
                "period": tax_period_year_month,
                "due_date": gstr1_due.isoformat(),
                "days_remaining": (gstr1_due - date.today()).days,
                "late_fee_per_day": 50.0,
                "description": "Outward supplies statement"
            },
            {
                "return_type": "GSTR-3B",
                "period": tax_period_year_month,
                "due_date": gstr3b_due.isoformat(),
                "days_remaining": (gstr3b_due - date.today()).days,
                "late_fee_per_day": 50.0,
                "description": "Monthly self-assessment summary return"
            }
        ]

    @staticmethod
    def calculate_late_fee_and_interest(
        due_date_str: str,
        filed_date_str: str,
        tax_payable: float,
        is_nil_return: bool = False
    ) -> Dict[str, Any]:
        """
        Calculates late fees and interest under the CGST Act.
        Late fee:
          - Nil return: Rs 20/day (Rs 10 CGST + Rs 10 SGST)
          - Taxable return: Rs 50/day (Rs 25 CGST + Rs 25 SGST)
          - Max limit: usually Rs 10,000 per return.
        Interest:
          - 18% p.a. on net tax liability paid late.
        """
        try:
            due = datetime.fromisoformat(due_date_str).date()
            filed = datetime.fromisoformat(filed_date_str).date()
        except Exception:
            return {"late_days": 0, "late_fee": 0.0, "interest": 0.0}

        if filed <= due:
            return {"late_days": 0, "late_fee": 0.0, "interest": 0.0}

        late_days = (filed - due).days
        rate_per_day = 20.0 if is_nil_return else 50.0
        
        raw_late_fee = late_days * rate_per_day
        # Capped at standard cap Rs 10,000 for regular filers
        late_fee = min(raw_late_fee, 10000.0)

        interest = 0.0
        if tax_payable > 0:
            # Interest = Tax Payable * (18 / 100) * (Days / 365)
            interest = round(tax_payable * 0.18 * (late_days / 365.0), 2)

        return {
            "late_days": late_days,
            "late_fee": late_fee,
            "interest": interest,
            "total_statutory_penalty": round(late_fee + interest, 2)
        }

    @staticmethod
    def evaluate_vendor_compliance_profile(vendor_invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Computes a compliance score for a vendor based on GSTR-2B filing patterns.
        """
        total = len(vendor_invoices)
        if total == 0:
            return {"compliance_score": 100.0, "rating": "A", "status": "COMPLIANT", "remarks": "No filings tracked"}

        missing_filings = sum(1 for inv in vendor_invoices if str(inv.get("filing_status", "")).upper() == "NOT_FILED")
        on_time = sum(1 for inv in vendor_invoices if str(inv.get("filing_status", "")).upper() == "ON_TIME")

        score = 100.0 - (missing_filings / total * 60.0)
        
        # Penalize for late filing
        late_filings = total - missing_filings - on_time
        if late_filings > 0:
            score -= (late_filings / total * 20.0)

        score = max(0.0, min(100.0, score))

        rating = "A"
        status = "COMPLIANT"
        if score < 50.0:
            rating = "D"
            status = "HIGH_RISK"
        elif score < 75.0:
            rating = "C"
            status = "MEDIUM_RISK"
        elif score < 90.0:
            rating = "B"
            status = "MILDLY_COMPLIANT"

        return {
            "compliance_score": round(score, 2),
            "rating": rating,
            "status": status,
            "missing_count": missing_filings,
            "late_count": late_filings,
            "total_tracked": total
        }

    @classmethod
    async def generate_proactive_alerts(cls, company_id: str) -> List[Dict[str, Any]]:
        """
        Compiles current active alerts for GSTR filing deadlines and critical late filing penalties.
        """
        today = date.today().isoformat()[:7]
        due_dates = cls.get_upcoming_due_dates(today)
        alerts = []

        for item in due_dates:
            days = item["days_remaining"]
            if days >= 0 and days <= 5:
                alerts.append({
                    "type": "DEADLINE_WARNING",
                    "severity": "high",
                    "title": f"Filing Deadline Approaching: {item['return_type']}",
                    "message": f"Filing for {item['period']} is due in {days} days on {item['due_date']}.",
                    "action_required": "Prepare GSTR reconciliation run immediately."
                })
            elif days < 0:
                alerts.append({
                    "type": "DEADLINE_MISSED",
                    "severity": "critical",
                    "title": f"Filing Deadline Overdue: {item['return_type']}",
                    "message": f"Filing for {item['period']} was due on {item['due_date']}. Accumulating late fees.",
                    "action_required": "File delayed return now to stop penalty growth."
                })

        return alerts
