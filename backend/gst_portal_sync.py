"""
MODULE 3 — Live Revenue Liabilities & Ledger Fetch
===================================================
IMPORTANT / HONESTY NOTE ON SCOPE:
Real-time programmatic access to the GST Network's Electronic Liability
Register (PMT-01) and Electronic Credit Ledger (PMT-02) is only available
through a licensed GST Suvidha Provider (GSP) integration — it requires a
GSP contract, client-id/client-secret issued by GSTN, and taxpayer-consent
OTP flow. Those credentials are account-specific and can't be fabricated
here. What this module gives you is the *complete pipeline* — cron
scheduling, snapshot storage, mismatch detection, and dashboard binding —
built against a clean `GSPClient` adapter interface. Point
`GSPClient.fetch_liability_register` / `fetch_credit_ledger` at your real
GSP's REST endpoints (Cleartax, MasterGST, ClearTax-GSP, IRIS, etc. — or
GSTN's own developer API once you have sandbox/production keys) and the
rest of the pipeline runs unmodified.

Pipeline:
  1. GOVERNMENT DATA STREAM : `GSPClient` — pluggable, swap the stub for a
     real GSP SDK/HTTP client (kept in its own class so credentials/base URL
     are configured once via env vars, not scattered through the app).
  2. CRON ROUTINE            : `sync_all_companies()` — call this from your
     scheduler (APScheduler/Celery beat/cron) e.g. daily at 02:00 IST. It is
     also exposed as `POST /api/gst-portal/sync-now` for on-demand refresh.
  3. SNAPSHOT STORAGE        : results saved into `taskosphere_tax_snapshot`.
  4. MISMATCH / AUDIT RISK   : `check_audit_risk()` compares the portal's
     output-tax liability against the firm's own GST Output Payable ledger
     balance (from accounting_core) and flags a variance.
"""

import os
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.dependencies import db, get_current_user
from backend.models import User
from backend import accounting_core as ac

router = APIRouter(prefix="/api/gst-portal", tags=["GST Live Portal Sync"])


def _perm_view(user: User) -> bool:
    if user.role == "admin":
        return True
    perms = user.permissions if isinstance(user.permissions, dict) else (
        user.permissions.model_dump() if user.permissions else {}
    )
    return bool(perms.get("can_view_accounting_reports"))


# ── GSP adapter (swap the internals for your real, contracted GSP) ──────────
class GSPClient:
    """Thin adapter around a GST Suvidha Provider's REST API.

    Configure via env vars:
      GSP_BASE_URL, GSP_CLIENT_ID, GSP_CLIENT_SECRET, GSP_ENV ("sandbox"|"production")

    Until those are set this client raises a clear configuration error rather
    than returning fabricated numbers — a finance dashboard must never show
    invented figures as if they were live portal data.
    """

    def __init__(self):
        self.base_url = os.environ.get("GSP_BASE_URL", "")
        self.client_id = os.environ.get("GSP_CLIENT_ID", "")
        self.client_secret = os.environ.get("GSP_CLIENT_SECRET", "")
        self.env = os.environ.get("GSP_ENV", "sandbox")

    def _configured(self) -> bool:
        return bool(self.base_url and self.client_id and self.client_secret)

    async def _authed_get(self, path: str, params: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}{path}",
                params=params,
                headers={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )
        if resp.status_code != 200:
            raise HTTPException(502, f"GSP request failed ({resp.status_code}): {resp.text[:300]}")
        return resp.json()

    async def fetch_liability_register(self, gstin: str, period: str) -> dict:
        """Electronic Liability Register — Form GST PMT-01.
        `period` format: MMYYYY (e.g. '072026')."""
        if not self._configured():
            raise HTTPException(
                503,
                "GSP is not configured (GSP_BASE_URL/GSP_CLIENT_ID/GSP_CLIENT_SECRET). "
                "Connect a licensed GST Suvidha Provider to enable live PMT-01 fetch.",
            )
        return await self._authed_get("/returns/liability-register", {"gstin": gstin, "ret_period": period})

    async def fetch_credit_ledger(self, gstin: str, period: str) -> dict:
        """Electronic Credit Ledger — Form GST PMT-02."""
        if not self._configured():
            raise HTTPException(
                503,
                "GSP is not configured (GSP_BASE_URL/GSP_CLIENT_ID/GSP_CLIENT_SECRET). "
                "Connect a licensed GST Suvidha Provider to enable live PMT-02 fetch.",
            )
        return await self._authed_get("/returns/credit-ledger", {"gstin": gstin, "ret_period": period})


_gsp = GSPClient()


def _current_period() -> str:
    today = date.today()
    return f"{today.month:02d}{today.year}"


# ── Sync one company / all companies ─────────────────────────────────────────
async def sync_company_snapshot(company_id: str, gstin: str, period: Optional[str] = None) -> dict:
    period = period or _current_period()

    liability = await _gsp.fetch_liability_register(gstin, period)
    credit = await _gsp.fetch_credit_ledger(gstin, period)

    # GSP response shapes vary by provider; normalise defensively.
    outward_cash_liability = float(
        liability.get("cash_liability") or liability.get("tax_payable_cash") or 0
    )
    outward_total_liability = float(
        liability.get("total_liability") or liability.get("tax_payable") or 0
    )
    available_itc = float(
        credit.get("balance_available") or credit.get("itc_balance") or 0
    )

    now = datetime.now(timezone.utc).isoformat()
    snapshot = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "gstin": gstin,
        "period": period,
        "outward_cash_liability": round(outward_cash_liability, 2),
        "outward_total_liability": round(outward_total_liability, 2),
        "available_itc": round(available_itc, 2),
        "raw_liability_response": liability,
        "raw_credit_response": credit,
        "fetched_at": now,
    }
    await db.taskosphere_tax_snapshot.replace_one(
        {"company_id": company_id, "gstin": gstin, "period": period}, snapshot, upsert=True
    )
    snapshot.pop("_id", None)

    await check_audit_risk(company_id, snapshot)
    return snapshot


async def sync_all_companies() -> List[dict]:
    """Entry point for the cron scheduler."""
    companies = await db.gst_portal_registrations.find({"active": True}, {"_id": 0}).to_list(1000)
    results = []
    for c in companies:
        try:
            snap = await sync_company_snapshot(c["company_id"], c["gstin"])
            results.append({"company_id": c["company_id"], "status": "synced", "snapshot": snap})
        except HTTPException as e:
            results.append({"company_id": c["company_id"], "status": "error", "detail": e.detail})
    return results


# ── Mismatch / audit-risk check against internal books ──────────────────────
async def check_audit_risk(company_id: str, snapshot: dict) -> dict:
    output_tax_id = await ac.get_default_account_id(company_id, "2100")  # GST Output Payable
    # accounting_core.get_ledger is an HTTP route requiring an auth'd user;
    # pull the balance directly from journal_lines instead so this can run
    # unattended from a cron job.
    lines = await db.journal_lines.find(
        {"company_id": company_id, "account_id": output_tax_id}, {"_id": 0, "debit": 1, "credit": 1}
    ).to_list(50000) if output_tax_id else []
    internal_liability = round(sum(l["credit"] - l["debit"] for l in lines), 2)

    portal_liability = snapshot["outward_total_liability"]
    variance = round(portal_liability - internal_liability, 2)
    variance_pct = round((variance / portal_liability * 100), 2) if portal_liability else 0.0
    is_risk = abs(variance) > 1.0  # ₹1 rounding tolerance, same convention as Module 2

    risk_doc = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "period": snapshot["period"],
        "portal_liability": portal_liability,
        "internal_liability": internal_liability,
        "variance": variance,
        "variance_pct": variance_pct,
        "is_risk": is_risk,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gst_audit_risk_checks.replace_one(
        {"company_id": company_id, "period": snapshot["period"]}, risk_doc, upsert=True
    )
    risk_doc.pop("_id", None)
    return risk_doc


# ── Registration (which GSTINs to sync) ──────────────────────────────────────
class GSTRegistration(BaseModel):
    company_id: str
    gstin: str
    active: bool = True


@router.post("/register")
async def register_gstin(body: GSTRegistration, current_user: User = Depends(get_current_user)):
    if not _perm_view(current_user):
        raise HTTPException(403, "Access denied.")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_by"] = current_user.id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.gst_portal_registrations.replace_one(
        {"company_id": body.company_id, "gstin": body.gstin}, doc, upsert=True
    )
    doc.pop("_id", None)
    return doc


@router.post("/sync-now")
async def sync_now(
    company_id: str = Query(...),
    gstin: str = Query(...),
    period: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    if not _perm_view(current_user):
        raise HTTPException(403, "Access denied.")
    return await sync_company_snapshot(company_id, gstin, period)


@router.get("/snapshot")
async def get_snapshot(
    company_id: str = Query(""), period: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    if not _perm_view(current_user):
        raise HTTPException(403, "Access denied.")
    q: dict = {"company_id": company_id}
    if period:
        q["period"] = period
    rows = await db.taskosphere_tax_snapshot.find(q, {"_id": 0}).sort("fetched_at", -1).to_list(200)
    return rows


@router.get("/audit-risk")
async def get_audit_risk(company_id: str = Query(""), current_user: User = Depends(get_current_user)):
    if not _perm_view(current_user):
        raise HTTPException(403, "Access denied.")
    rows = await db.gst_audit_risk_checks.find({"company_id": company_id}, {"_id": 0}).sort("checked_at", -1).to_list(200)
    return rows


# ── Dashboard metric binding (Module 4.2 — compiled summary) ────────────────
@router.get("/dashboard-metrics")
async def dashboard_metrics(company_id: str = Query(""), current_user: User = Depends(get_current_user)):
    if not _perm_view(current_user):
        raise HTTPException(403, "Access denied.")

    snap = await db.taskosphere_tax_snapshot.find_one(
        {"company_id": company_id}, {"_id": 0}, sort=[("fetched_at", -1)]
    )
    risk = await db.gst_audit_risk_checks.find_one(
        {"company_id": company_id}, {"_id": 0}, sort=[("checked_at", -1)]
    )

    cash_id = await ac.get_default_account_id(company_id, "1000")
    bank_id = await ac.get_default_account_id(company_id, "1010")
    cash_lines = await db.journal_lines.find(
        {"company_id": company_id, "account_id": {"$in": [x for x in [cash_id, bank_id] if x]}},
        {"_id": 0, "debit": 1, "credit": 1},
    ).to_list(50000)
    cash_reserves = round(sum(l["debit"] - l["credit"] for l in cash_lines), 2)

    return {
        "total_liability": snap["outward_total_liability"] if snap else None,
        "net_available_credits": snap["available_itc"] if snap else None,
        "cash_reserves": cash_reserves,
        "discrepancy_pct": risk["variance_pct"] if risk else None,
        "is_audit_risk": risk["is_risk"] if risk else None,
        "last_synced_at": snap["fetched_at"] if snap else None,
        "portal_configured": _gsp._configured(),
    }


async def create_gst_portal_sync_indexes():
    await db.taskosphere_tax_snapshot.create_index([("company_id", 1), ("gstin", 1), ("period", 1)], unique=True)
    await db.gst_audit_risk_checks.create_index([("company_id", 1), ("period", 1)], unique=True)
    await db.gst_portal_registrations.create_index([("company_id", 1), ("gstin", 1)], unique=True)
