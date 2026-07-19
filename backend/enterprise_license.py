import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

logger = logging.getLogger("customer_license")

class CustomerLicense:
    @staticmethod
    def generate_trial_license(tenant_id: str) -> Dict[str, Any]:
        """Assembles a standard localized trial license template."""
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=14)
        return {
            "tenant_id": tenant_id,
            "license_type": "standard_trial",
            "max_users": 5,
            "status": "active",
            "expires_at": expires.isoformat()
        }
