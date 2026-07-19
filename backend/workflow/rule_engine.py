import logging
from typing import Dict, Any, List, Optional
from backend.workflow.workflow_storage import WorkflowStorage

logger = logging.getLogger("rule_engine")

class RuleEngine:
    @staticmethod
    def evaluate_condition(field_val: Any, op: str, threshold: Any) -> bool:
        """
        Evaluates a single operator-based condition.
        """
        try:
            if op == "==":
                return field_val == threshold
            elif op == "!=":
                return field_val != threshold
            elif op == ">":
                return float(field_val) > float(threshold)
            elif op == "<":
                return float(field_val) < float(threshold)
            elif op == ">=":
                return float(field_val) >= float(threshold)
            elif op == "<=":
                return float(field_val) <= float(threshold)
            elif op == "in":
                return field_val in threshold
            elif op == "contains":
                return threshold in field_val
            return False
        except Exception as e:
            logger.warning(f"Error evaluating condition: {field_val} {op} {threshold}: {e}")
            return False

    @classmethod
    async def match_rule(cls, company_id: str, rule_type: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Finds and evaluates active configurable rules for a given type.
        """
        try:
            query = {
                "company_id": company_id,
                "rule_type": rule_type,
                "is_active": True
            }
            rules = await WorkflowStorage.list_automation_rules(query)
            
            # Sort by priority desc if priority exists, else random order
            rules = sorted(rules, key=lambda r: r.get("priority", 0), reverse=True)
            
            for rule in rules:
                conditions = rule.get("conditions", [])
                if not conditions:
                    # Default/fallback rule with no conditions is always a match
                    logger.info(f"Unconditional rule matched: {rule.get('id')} ({rule.get('name')})")
                    return rule
                
                # Check if all conditions are met
                all_met = True
                for cond in conditions:
                    field = cond.get("field")
                    op = cond.get("operator")
                    threshold = cond.get("threshold")
                    
                    val = data.get(field)
                    if val is None:
                        all_met = False
                        break
                        
                    if not cls.evaluate_condition(val, op, threshold):
                        all_met = False
                        break
                
                if all_met:
                    logger.info(f"Rule matched: {rule.get('id')} ({rule.get('name')})")
                    return rule
            
            return None
        except Exception as e:
            logger.error(f"Rule Engine failed matching rules: {e}", exc_info=True)
            return None

    @classmethod
    async def get_required_approval_levels(cls, company_id: str, doc_type: str, total_value: float, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Dynamic rule logic to determine approval workflow depth and roles required.
        """
        # Determine approval levels dynamically based on matched rules.
        # Defaults if no custom rule is matched in the db.
        context = {**data, "total_value": total_value, "document_type": doc_type}
        matched_rule = await cls.match_rule(company_id, "approval_threshold", context)
        
        if matched_rule:
            return matched_rule.get("approval_levels", [])
            
        # Hardcoded elegant fallback to ensure operations never stall, but driven by defaults
        if total_value >= 100000.0: # high amount
            return [
                {"level": 1, "role": "MANAGER", "department": "FINANCE", "description": "First stage general review"},
                {"level": 2, "role": "CFO", "department": "EXECUTIVE", "description": "Executive final oversight"}
            ]
        elif total_value >= 10000.0:
            return [
                {"level": 1, "role": "MANAGER", "department": "FINANCE", "description": "Standard expense review"}
            ]
        else:
            return [
                {"level": 1, "role": "ASSOCIATE", "department": "ACCOUNTING", "description": "Low-risk automatic passing"}
            ]
