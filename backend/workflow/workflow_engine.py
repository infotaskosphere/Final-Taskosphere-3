import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.audit_engine import WorkflowAuditEngine
from backend.workflow.company_policies import CompanyPolicyEngine
from backend.workflow.rule_engine import RuleEngine
from backend.workflow.approval_engine import ApprovalEngine
from backend.workflow.notification_engine import NotificationEngine

logger = logging.getLogger("workflow_engine")

class WorkflowEngine:
    @classmethod
    async def start_workflow(
        cls,
        company_id: str,
        definition_id: str,
        entity_id: str,
        entity_type: str,
        user_id: str,
        input_data: Dict[str, Any]
    ) -> Optional[str]:
        """
        Coordinates and starts an automated workflow instance.
        """
        try:
            # 1. Fetch workflow definition
            wf_def = await WorkflowStorage.get_workflow_definition(definition_id)
            if not wf_def:
                logger.error(f"Workflow definition {definition_id} not found.")
                return None

            # 2. Build the workflow instance doc
            inst_doc = {
                "company_id": company_id,
                "definition_id": definition_id,
                "name": wf_def["name"],
                "category": wf_def["category"],
                "entity_id": entity_id,
                "entity_type": entity_type,
                "steps": wf_def["steps"],
                "current_step_idx": 0,
                "status": "RUNNING",
                "input_data": input_data,
                "context": {},
                "created_by": user_id,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            inst_id = await WorkflowStorage.save_workflow_instance(inst_doc)
            inst_doc["id"] = inst_id

            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id=user_id,
                action="START_WORKFLOW",
                entity_id=inst_id,
                entity_type="workflow_instance",
                details=f"Workflow instance '{wf_def['name']}' started for {entity_type} {entity_id}.",
                after_state=inst_doc
            )

            # 3. Execute first step asynchronously / synchronously
            await cls._run_current_step(inst_doc)

            return inst_id
        except Exception as e:
            logger.error(f"Failed to start workflow: {e}", exc_info=True)
            return None

    @classmethod
    async def _run_current_step(cls, inst: Dict[str, Any]):
        """
        Runs the currently active step of the workflow.
        """
        company_id = inst["company_id"]
        inst_id = inst["id"]
        step_idx = inst["current_step_idx"]
        steps = inst["steps"]

        if step_idx >= len(steps):
            # All steps completed successfully
            inst["status"] = "COMPLETED"
            await WorkflowStorage.save_workflow_instance(inst)
            
            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id="SYSTEM",
                action="WORKFLOW_COMPLETED",
                entity_id=inst_id,
                entity_type="workflow_instance",
                details=f"Workflow instance {inst_id} completed successfully.",
                after_state=inst
            )
            return

        step = steps[step_idx]
        action = step["action"]
        logger.info(f"Executing step {step_idx + 1}/{len(steps)}: {step['name']} ({action}) for instance {inst_id}")

        try:
            # Dispatch steps to non-blocking or sequential logic
            if action == "parse_ocr":
                # Simulated parsing or forward context
                inst["context"]["ocr_parsed"] = True
                await cls._move_to_next_step(inst)

            elif action == "policy_check":
                # Policy validation
                input_data = inst["input_data"]
                violations = await CompanyPolicyEngine.validate_transaction(company_id, input_data)
                inst["context"]["policy_violations"] = violations
                if violations:
                    inst["context"]["needs_high_level_approval"] = True
                    logger.warning(f"Workflow {inst_id} step policy_check detected violations: {violations}")
                await cls._move_to_next_step(inst)

            elif action == "maker_checker":
                # Pause and wait for checker approval
                inst["status"] = "PAUSED"
                inst["context"]["paused_reason"] = "Awaiting Multi-Level Approval Checker"
                await WorkflowStorage.save_workflow_instance(inst)

                await WorkflowAuditEngine.log_audit_event(
                    company_id=company_id,
                    user_id="SYSTEM",
                    action="WORKFLOW_PAUSED",
                    entity_id=inst_id,
                    entity_type="workflow_instance",
                    details=f"Workflow paused at step {step['name']} to await human approval.",
                    after_state=inst
                )

                # Initiate approval request
                doc_id = inst["entity_id"]
                amount = inst["input_data"].get("amount", 0.0)
                doc_type = inst["entity_type"]
                
                # Check required approval levels from rules
                approval_levels = await RuleEngine.get_required_approval_levels(
                    company_id=company_id,
                    doc_type=doc_type,
                    total_value=amount,
                    data=inst["input_data"]
                )

                # Start Multi level approval flow
                app_id = await ApprovalEngine.initiate_approval_request(
                    company_id=company_id,
                    doc_id=doc_id,
                    doc_type=doc_type,
                    amount=amount,
                    creator_user_id=inst["created_by"],
                    required_levels=approval_levels
                )
                inst["context"]["approval_id"] = app_id
                await WorkflowStorage.save_workflow_instance(inst)

            elif action == "post_ledger":
                # GL posting simulation or zero touch sync
                inst["context"]["gl_posted"] = True
                await cls._move_to_next_step(inst)

            else:
                # Custom general automation or fallback
                logger.info(f"Executing dynamic workflow action: {action}")
                await cls._move_to_next_step(inst)

        except Exception as step_err:
            logger.error(f"Step {step['name']} execution failed for instance {inst_id}: {step_err}", exc_info=True)
            # Retries handle or mark failed
            inst["status"] = "FAILED"
            inst["context"]["error_message"] = str(step_err)
            await WorkflowStorage.save_workflow_instance(inst)
            
            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id="SYSTEM",
                action="WORKFLOW_FAILED",
                entity_id=inst_id,
                entity_type="workflow_instance",
                details=f"Workflow failed at step {step['name']}: {step_err}",
                after_state=inst
            )

    @classmethod
    async def _move_to_next_step(cls, inst: Dict[str, Any]):
        inst["current_step_idx"] += 1
        inst["updated_at"] = datetime.now(timezone.utc).isoformat()
        await WorkflowStorage.save_workflow_instance(inst)
        await cls._run_current_step(inst)

    @classmethod
    async def resume_workflow_by_approval(cls, entity_id: str, approval_id: str):
        """
        Called when approval flow completes successfully. Resumes paused workflow.
        """
        try:
            from backend.dependencies import db
            # Find the paused workflow instance referencing this document or approval ID
            inst_doc = await db.workflow_instances.find_one({
                "entity_id": entity_id,
                "status": "PAUSED"
            })

            if not inst_doc:
                logger.warning(f"No paused workflow instance found for entity {entity_id} to resume.")
                return

            inst_doc["status"] = "RUNNING"
            inst_doc["context"]["approval_status"] = "GRANTED"
            await WorkflowStorage.save_workflow_instance(inst_doc)

            await WorkflowAuditEngine.log_audit_event(
                company_id=inst_doc["company_id"],
                user_id="SYSTEM",
                action="WORKFLOW_RESUMED",
                entity_id=inst_doc["id"],
                entity_type="workflow_instance",
                details=f"Workflow resumed following approval {approval_id}.",
                after_state=inst_doc
            )

            # Move past the paused step and continue
            await cls._move_to_next_step(inst_doc)
        except Exception as e:
            logger.error(f"Failed to resume workflow: {e}", exc_info=True)
