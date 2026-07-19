import logging
from typing import Dict, Any, List, Optional
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.audit_engine import WorkflowAuditEngine

logger = logging.getLogger("company_policies")

class CompanyPolicyEngine:
    @staticmethod
    async def get_active_policy(company_id: str, policy_type: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves the active version of a policy for a company.
        """
        try:
            # We look for a policy in the automation_rules / config storage
            query = {
                "company_id": company_id,
                "rule_type": f"policy_{policy_type}",
                "is_active": True
            }
            policies = await WorkflowStorage.list_automation_rules(query, limit=1)
            if policies:
                return policies[0]
            return None
        except Exception as e:
            logger.error(f"Error loading active policy: {e}", exc_info=True)
            return None

    @classmethod
    async def save_policy(
        cls,
        company_id: str,
        policy_type: str,
        name: str,
        rules: Dict[str, Any],
        user_id: str,
        version: int = 1
    ) -> str:
        """
        Saves a new company policy, enforcing version control and audit logs.
        """
        # Deactivate older policies of the same type
        from backend.dependencies import db
        await db.automation_rules.update_many(
            {"company_id": company_id, "rule_type": f"policy_{policy_type}"},
            {"$set": {"is_active": False}}
        )

        policy_doc = {
            "company_id": company_id,
            "rule_type": f"policy_{policy_type}",
            "name": name,
            "policy_rules": rules,
            "is_active": True,
            "version": version,
            "updated_by": user_id
        }
        policy_id = await WorkflowStorage.save_automation_rule(policy_doc)

        await WorkflowAuditEngine.log_audit_event(
            company_id=company_id,
            user_id=user_id,
            action="SAVE_POLICY",
            entity_id=policy_id,
            entity_type="company_policy",
            details=f"Policy of type {policy_type} was saved at version {version}.",
            after_state=policy_doc,
            meta_data={"policy_type": policy_type, "version": version}
        )
        return policy_id

    @classmethod
    async def validate_transaction(cls, company_id: str, transaction_data: Dict[str, Any]) -> List[str]:
        """
        Validates whether a transaction is compliant with company policies.
        Returns a list of policy violation warning strings.
        """
        violations = []
        try:
            # 1. Check approval limits policy
            limit_policy = await cls.get_active_policy(company_id, "approval_limits")
            if limit_policy:
                rules = limit_policy.get("policy_rules", {})
                max_allowed = rules.get("max_single_transaction_limit", 10000000.0)
                amount = float(transaction_data.get("amount", 0.0))
                if amount > max_allowed:
                    violations.append(f"Transaction amount {amount} exceeds configured ceiling policy ({max_allowed}).")

            # 2. Check GST policy compliance
            gst_policy = await cls.get_active_policy(company_id, "gst_policies")
            if gst_policy:
                rules = gst_policy.get("policy_rules", {})
                require_gstin = rules.get("require_gstin_for_vendors", False)
                if require_gstin and not transaction_data.get("vendor_gstin"):
                    violations.append("GST Policy Violation: Vendor GSTIN is missing.")

            # 3. Check document retention guidelines
            retention_policy = await cls.get_active_policy(company_id, "document_retention")
            if retention_policy:
                rules = retention_policy.get("policy_rules", {})
                require_original_ocr = rules.get("require_original_ocr", True)
                if require_original_ocr and not transaction_data.get("has_ocr_content", False):
                    violations.append("Retention Policy Violation: Transaction must contain parsed original OCR content.")
                    
        except Exception as e:
            logger.error(f"Error checking policy compliance: {e}", exc_info=True)
            violations.append(f"Validation failure during company policy processing: {e}")
            
        return violations
