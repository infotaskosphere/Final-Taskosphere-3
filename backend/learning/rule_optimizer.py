import logging
from typing import Dict, Any, List
from backend.learning.learning_storage import LearningStorage
from backend.learning.audit_engine import LearningAuditEngine

logger = logging.getLogger("rule_optimizer")

class RuleOptimizer:
    @classmethod
    async def analyze_and_optimize_rules(cls, company_id: str, user_id: str) -> List[Dict[str, Any]]:
        """
        Analyzes the correction frequency and recommendation acceptance trends
        to generate suggested rule optimization suggestions for admin review.
        """
        logger.info(f"Initiating rule optimization analysis for company: {company_id}")
        optimization_proposals = []
        try:
            # 1. Fetch manual user corrections to spot recurring friction points
            corrections = await LearningStorage.list_manual_corrections({"company_id": company_id}, limit=1000)
            correction_counts = {}
            for c in corrections:
                field = c.get("field_name")
                val = c.get("corrected_value")
                if field and val:
                    key = (field, str(val))
                    correction_counts[key] = correction_counts.get(key, 0) + 1

            # Propose updates for fields with frequent overrides (threshold >= 3 times)
            for (field, val), count in correction_counts.items():
                if count >= 3:
                    proposal = {
                        "company_id": company_id,
                        "rule_type": f"frequent_correction_adaptation_{field}",
                        "suggestion": f"Automatically suggest '{val}' for field '{field}' based on {count} manual user correction events.",
                        "confidence_improvement_est": 0.15,
                        "status": "pending_admin_approval",
                        "basis_metric": f"{count} corrections identified"
                    }
                    prop_id = await LearningStorage.save_rule_improvement(proposal)
                    proposal["id"] = prop_id
                    optimization_proposals.append(proposal)

                    # Log to audit trail
                    await LearningAuditEngine.log_learning_event(
                        event_type="rule_optimization_proposal",
                        source_id=prop_id,
                        company_id=company_id,
                        user_id="system",
                        description=f"Generated optimization proposal {prop_id} for field '{field}' due to frequent overrides",
                        before_state=None,
                        after_state=proposal,
                        meta_data={"metric_count": count}
                    )

            logger.info(f"Generated {len(optimization_proposals)} optimization proposals.")
            return optimization_proposals
        except Exception as e:
            logger.error(f"Rule optimization run failed: {e}", exc_info=True)
            return []
