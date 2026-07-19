"""
Cashflow Engine Module (Phase 8)
Calculates historical cash inflows/outflows, detects recurring transactions,
and forecasts 30, 60, and 90-day cash balance projections.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import pandas as pd

from backend.bank_ai.bank_storage import BankStorage

logger = logging.getLogger("cashflow_engine")

class CashflowEngine:
    @classmethod
    async def analyse_and_project(cls, bank_account_id: str, company_id: str) -> Dict[str, Any]:
        """
        Analyzes historical transactions to project future 30, 60, 90 day cash flows.
        Steps:
        1. Query transactions from the past 120 days.
        2. Calculate average monthly inflows and outflows.
        3. Identify recurring transactions (fixed intervals & amounts).
        4. Project cash balance day-by-day for the next 90 days.
        """
        # Fetch last 120 days of transactions
        end_dt = datetime.now()
        start_dt = end_dt - timedelta(days=120)
        
        txns = await BankStorage.get_bank_transactions(
            bank_account_id=bank_account_id,
            start_date=start_dt.strftime("%Y-%m-%d"),
            end_date=end_dt.strftime("%Y-%m-%d"),
            limit=2000
        )

        if not txns:
            # Fallback values if no transactions exist
            return cls._get_empty_projection(bank_account_id)

        # Convert to DataFrame
        df = pd.DataFrame(txns)
        df["date"] = pd.to_datetime(df["date"])
        df["amount"] = df["amount"].astype(float)

        # Separate credit vs debit
        df_credit = df[df["type"] == "credit"]
        df_debit = df[df["type"] == "debit"]

        total_inflow = df_credit["amount"].sum()
        total_outflow = df_debit["amount"].sum()

        # Monthly averages
        months = max(1.0, (df["date"].max() - df["date"].min()).days / 30.0)
        avg_monthly_inflow = float(total_inflow / months)
        avg_monthly_outflow = float(total_outflow / months)
        net_burn_rate = avg_monthly_inflow - avg_monthly_outflow

        # Get latest balance
        latest_txn = df.sort_values("date", ascending=False).iloc[0]
        current_balance = float(latest_txn.get("balance") or 0.0)
        if current_balance == 0.0:
            # Fallback guess: estimate by net sum of history
            current_balance = float(total_inflow - total_outflow)

        # Identify potential recurring transactions
        recurring_payments = cls._detect_recurring_txns(df_debit)

        # Generate 90-day forecast day-by-day
        projection_series = []
        projected_balance = current_balance
        forecast_date = datetime.now()

        # Group recurring payments by expected day of month
        recurring_by_day = {}
        for rp in recurring_payments:
            day = rp["expected_day"]
            recurring_by_day.setdefault(day, []).append(rp["amount"])

        # Run day-by-day simulation
        daily_baseline_change = net_burn_rate / 30.0  # Distributed net gain/loss

        for day_offset in range(1, 91):
            current_day = forecast_date + timedelta(days=day_offset)
            dom = current_day.day
            
            # Start with baseline average change
            day_change = daily_baseline_change
            
            # Apply scheduled recurring payments occurring on this day
            if dom in recurring_by_day:
                for rec_amt in recurring_by_day[dom]:
                    day_change -= rec_amt  # recurring debits

            projected_balance += day_change
            projection_series.append({
                "date": current_day.strftime("%Y-%m-%d"),
                "projected_balance": round(projected_balance, 2),
                "inflow_estimate": round(avg_monthly_inflow / 30.0, 2),
                "outflow_estimate": round((avg_monthly_outflow / 30.0) + sum(recurring_by_day.get(dom, [0.0])), 2)
            })

        summary = {
            "bank_account_id": bank_account_id,
            "current_balance": round(current_balance, 2),
            "avg_monthly_inflow": round(avg_monthly_inflow, 2),
            "avg_monthly_outflow": round(avg_monthly_outflow, 2),
            "burn_rate": round(net_burn_rate, 2),
            "runway_days": int(current_balance / (avg_monthly_outflow / 30.0)) if avg_monthly_outflow > 0 else 365,
            "recurring_count": len(recurring_payments),
            "projections": projection_series
        }

        # Save to DB cashflow history
        await BankStorage.save_cashflow_projection(summary)

        return summary

    @staticmethod
    def _detect_recurring_txns(df_debit: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Heuristic algorithm to group debit transactions by narration & amount,
        spotting recurring patterns (intervals approx 30 days).
        """
        recurring = []
        if df_debit.empty:
            return recurring

        # Group by first word/token of narration
        df_debit["narr_token"] = df_debit["narration"].apply(lambda x: str(x).split()[0].lower() if str(x).split() else "other")
        
        for name, group in df_debit.groupby("narr_token"):
            if len(group) >= 2:
                # Sort by date
                group = group.sort_values("date")
                # Calculate diffs
                intervals = group["date"].diff().dt.days.dropna().tolist()
                
                # Check if average interval is around 30 days (+/- 5 days)
                if intervals:
                    avg_int = sum(intervals) / len(intervals)
                    if 25 <= avg_int <= 35:
                        # Find median amount
                        median_amt = float(group["amount"].median())
                        expected_day = int(group["date"].dt.day.median())
                        recurring.append({
                            "token": name,
                            "amount": median_amt,
                            "interval_days": round(avg_int, 1),
                            "expected_day": expected_day,
                            "sample_narration": str(group["narration"].iloc[0])
                        })

        return recurring

    @staticmethod
    def _get_empty_projection(bank_account_id: str) -> Dict[str, Any]:
        """
        Returns blank projection structure if data is missing.
        """
        return {
            "bank_account_id": bank_account_id,
            "current_balance": 0.0,
            "avg_monthly_inflow": 0.0,
            "avg_monthly_outflow": 0.0,
            "burn_rate": 0.0,
            "runway_days": 365,
            "recurring_count": 0,
            "projections": []
        }
