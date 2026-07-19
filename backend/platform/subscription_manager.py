import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from backend.dependencies import db

logger = logging.getLogger("subscription_manager")

class SubscriptionManager:
    @staticmethod
    async def subscribe_tenant(tenant_id: str, plan_name: str, duration_days: int = 30) -> Dict[str, Any]:
        """Subscribes a tenant to a commercial SaaS plan."""
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=duration_days)
        
        subscription_doc = {
            "tenant_id": tenant_id,
            "plan_name": plan_name, # trial, standard, enterprise, white_label
            "status": "active",
            "activated_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.subscriptions.update_one({"tenant_id": tenant_id}, {"$set": subscription_doc}, upsert=True)
        
        # Log billing history
        billing_doc = {
            "tenant_id": tenant_id,
            "plan_name": plan_name,
            "amount": 0.0 if plan_name == "trial" else (99.0 if plan_name == "standard" else 499.0),
            "status": "paid",
            "billing_date": now.isoformat(),
            "expires_at": expires_at.isoformat()
        }
        await db.billing_history.insert_one(billing_doc)
        logger.info(f"Tenant {tenant_id} subscribed to plan {plan_name} until {expires_at.isoformat()}.")
        return subscription_doc

    @staticmethod
    async def get_subscription(tenant_id: str) -> Optional[Dict[str, Any]]:
        return await db.subscriptions.find_one({"tenant_id": tenant_id})

    @staticmethod
    async def is_subscription_valid(tenant_id: str) -> bool:
        sub = await db.subscriptions.find_one({"tenant_id": tenant_id})
        if not sub:
            return False
        if sub.get("status") != "active":
            return False
        try:
            expires_at = datetime.fromisoformat(sub["expires_at"])
            return datetime.now(timezone.utc) < expires_at
        except Exception:
            return False
