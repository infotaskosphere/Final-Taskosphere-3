import logging
from typing import Dict, Any, List, Optional
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.workflow_templates import WorkflowTemplates
from backend.workflow.audit_engine import WorkflowAuditEngine

logger = logging.getLogger("workflow_builder")

class WorkflowBuilder:
    @classmethod
    async def create_workflow_from_template(
        cls,
        company_id: str,
        template_id: str,
        custom_name: str,
        user_id: str,
        custom_rules: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Builds a custom, configuration-driven company workflow definition based on a system template.
        """
        try:
            tpl = await WorkflowTemplates.get_template(template_id)
            if not tpl:
                logger.error(f"Cannot build workflow: template {template_id} not found.")
                return None

            wf_def = {
                "company_id": company_id,
                "template_id": template_id,
                "name": custom_name or tpl["name"],
                "description": tpl["description"],
                "category": tpl["category"],
                "steps": tpl["steps"],
                "custom_rules": custom_rules or {},
                "is_active": True,
                "version": 1,
                "created_by": user_id
            }

            wf_id = await WorkflowStorage.save_workflow_definition(wf_def)
            wf_def["id"] = wf_id

            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id=user_id,
                action="BUILD_WORKFLOW_DEF",
                entity_id=wf_id,
                entity_type="workflow_definition",
                details=f"Workflow definition built from template {template_id}.",
                after_state=wf_def
            )

            return wf_def
        except Exception as e:
            logger.error(f"Error building workflow definition: {e}", exc_info=True)
            return None

    @classmethod
    async def save_custom_workflow_definition(
        cls,
        company_id: str,
        name: str,
        category: str,
        steps: List[Dict[str, Any]],
        user_id: str,
        custom_rules: Optional[Dict[str, Any]] = None,
        wf_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Builds a fully custom, custom-defined business workflow layout.
        """
        try:
            version = 1
            if wf_id:
                # Load current to version control increment
                existing = await WorkflowStorage.get_workflow_definition(wf_id)
                if existing:
                    version = existing.get("version", 1) + 1

            wf_def = {
                "id": wf_id,
                "company_id": company_id,
                "name": name,
                "category": category,
                "steps": steps,
                "custom_rules": custom_rules or {},
                "is_active": True,
                "version": version,
                "created_by": user_id
            }

            saved_id = await WorkflowStorage.save_workflow_definition(wf_def)
            wf_def["id"] = saved_id

            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id=user_id,
                action="SAVE_CUSTOM_WORKFLOW",
                entity_id=saved_id,
                entity_type="workflow_definition",
                details=f"Saved custom workflow '{name}' at version {version}.",
                after_state=wf_def,
                meta_data={"version": version}
            )

            return wf_def
        except Exception as e:
            logger.error(f"Error saving custom workflow definition: {e}", exc_info=True)
            return None
