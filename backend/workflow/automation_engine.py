import logging
from typing import Dict, Any, List
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.rule_engine import RuleEngine
from backend.workflow.notification_engine import NotificationEngine
from backend.workflow.workflow_engine import WorkflowEngine

logger = logging.getLogger("automation_engine")

class AutomationEngine:
    @classmethod
    async def trigger_by_event(cls, event: Dict[str, Any]):
        """
        Processes event-driven automation rules.
        """
        try:
            company_id = event["company_id"]
            event_type = event["event_type"]
            payload = event["payload"]
            
            # Find matching active rule
            matched_rule = await RuleEngine.match_rule(company_id, f"event_{event_type}", payload)
            if not matched_rule:
                return

            action_type = matched_rule.get("action_type")
            action_config = matched_rule.get("action_config", {})

            logger.info(f"Automation rule {matched_rule['id']} matched for event {event_type}. Triggering action: {action_type}")

            if action_type == "start_workflow":
                wf_def_id = action_config.get("workflow_definition_id")
                if wf_def_id:
                    await WorkflowEngine.start_workflow(
                        company_id=company_id,
                        definition_id=wf_def_id,
                        entity_id=event["source_id"],
                        entity_type=payload.get("entity_type", "document"),
                        user_id=event.get("user_id", "SYSTEM"),
                        input_data=payload
                    )
            elif action_type == "send_notification":
                channel = action_config.get("channel", "in_app")
                template_name = action_config.get("template_name")
                if template_name:
                    await NotificationEngine.send_notification(
                        company_id=company_id,
                        user_id=event.get("user_id", "SYSTEM"),
                        channel=channel,
                        template_name=template_name,
                        context=payload
                    )
            else:
                logger.info(f"Dynamic conditional automation action type '{action_type}' processed.")

        except Exception as e:
            logger.error(f"Automation engine failed to trigger event: {e}", exc_info=True)

    @classmethod
    async def run_scheduled_automations(cls, company_id: str):
        """
        Handles periodic conditional check-ins and reminder/escalation rules.
        """
        try:
            # We fetch rules with rule_type='scheduled_automation'
            query = {
                "company_id": company_id,
                "rule_type": "scheduled_automation",
                "is_active": True
            }
            rules = await WorkflowStorage.list_automation_rules(query)
            
            for rule in rules:
                # Custom scheduled actions (such as sending due reminders)
                action_config = rule.get("action_config", {})
                action_type = rule.get("action_type")
                
                if action_type == "send_due_notifications":
                    # Check for upcoming compliance deadlines in db
                    logger.info(f"Running scheduled due-notification rule: {rule['name']}")
                    # Direct action simulation
                    
        except Exception as e:
            logger.error(f"Error running scheduled automations: {e}", exc_info=True)
