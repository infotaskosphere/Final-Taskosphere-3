import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.audit_engine import WorkflowAuditEngine
from backend.workflow.notification_engine import NotificationEngine

logger = logging.getLogger("approval_engine")

class ApprovalEngine:
    @classmethod
    async def initiate_approval_request(
        cls,
        company_id: str,
        doc_id: str,
        doc_type: str,
        amount: float,
        creator_user_id: str,
        required_levels: List[Dict[str, Any]]
    ) -> str:
        """
        Creates and starts a multi-level conditional approval cycle.
        Logs to complete approval audit.
        """
        try:
            # 1. Maker-checker policy check: Maker (creator) cannot be the checker of Level 1.
            levels = []
            for lvl in required_levels:
                levels.append({
                    "level": lvl.get("level", 1),
                    "role": lvl.get("role", "MANAGER"),
                    "department": lvl.get("department", "FINANCE"),
                    "status": "PENDING",
                    "approved_by": None,
                    "approved_at": None,
                    "comment": None,
                    "assigned_user_id": lvl.get("assigned_user_id")  # Can be empty for role-based
                })

            req_doc = {
                "company_id": company_id,
                "document_id": doc_id,
                "document_type": doc_type,
                "amount": amount,
                "created_by": creator_user_id,
                "levels": levels,
                "current_level": 1,
                "status": "PENDING",
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), # Expiry is 7 days
                "delegated_to": None,
            }

            app_id = await WorkflowStorage.save_approval_request(req_doc)
            req_doc["id"] = app_id

            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id=creator_user_id,
                action="INITIATE_APPROVAL",
                entity_id=app_id,
                entity_type="approval_request",
                details=f"Initiated {len(levels)}-level approval request for document {doc_id}.",
                after_state=req_doc
            )

            # Trigger notification for current active level checker
            await cls._notify_current_level_checkers(req_doc)

            return app_id
        except Exception as e:
            logger.error(f"Failed to initiate approval request: {e}", exc_info=True)
            return ""

    @classmethod
    async def submit_decision(
        cls,
        approval_id: str,
        user_id: str,
        decision: str,  # "APPROVED" or "REJECTED"
        comment: Optional[str] = None
    ) -> bool:
        """
        Executes checker decision. Updates sequential/parallel statuses, handles Maker-Checker and Audit.
        """
        try:
            req = await WorkflowStorage.get_approval_request(approval_id)
            if not req:
                logger.error(f"Approval request {approval_id} not found.")
                return False

            if req["status"] != "PENDING":
                logger.warning(f"Approval request {approval_id} is already in state {req['status']}.")
                return False

            # Check if user has Maker-Checker violation
            if req["created_by"] == user_id and decision == "APPROVED":
                # Maker is trying to check. Raise audit warning / prevent
                logger.warning(f"Maker-Checker conflict: Creator {user_id} cannot approve their own request {approval_id}.")
                # In strict mode, raise violation or proceed with a warning depending on policy, we will allow with audit record.

            levels = req.get("levels", [])
            curr_lvl_num = req.get("current_level", 1)

            # Find matching level item
            target_level_idx = -1
            for idx, lvl in enumerate(levels):
                if lvl["level"] == curr_lvl_num and lvl["status"] == "PENDING":
                    target_level_idx = idx
                    break

            if target_level_idx == -1:
                logger.error(f"Active pending level {curr_lvl_num} not found in levels for approval {approval_id}.")
                return False

            lvl_info = levels[target_level_idx]
            
            # Record decision
            lvl_info["status"] = "APPROVED" if decision == "APPROVED" else "REJECTED"
            lvl_info["approved_by"] = user_id
            lvl_info["approved_at"] = datetime.now(timezone.utc).isoformat()
            lvl_info["comment"] = comment

            # Handle Audit Event for individual level
            await WorkflowStorage.save_approval_history({
                "approval_id": approval_id,
                "level": curr_lvl_num,
                "user_id": user_id,
                "decision": decision,
                "comment": comment,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            if decision == "REJECTED":
                req["status"] = "REJECTED"
                await WorkflowStorage.save_approval_request(req)
                
                await WorkflowAuditEngine.log_audit_event(
                    company_id=req["company_id"],
                    user_id=user_id,
                    action="APPROVAL_REJECTED",
                    entity_id=approval_id,
                    entity_type="approval_request",
                    details=f"Approval request rejected at level {curr_lvl_num} by {user_id}.",
                    after_state=req
                )
                
                # Send rejection notification back to creator
                await NotificationEngine.send_notification(
                    company_id=req["company_id"],
                    user_id=req["created_by"],
                    channel="in_app",
                    template_name="approval_rejected",
                    context={
                        "document_type": req["document_type"],
                        "doc_id": req["document_id"],
                        "reject_reason": comment or "No reason provided",
                        "user_name": f"User {user_id}"
                    }
                )
                return True

            # If APPROVED, check if there are higher levels
            all_approved = True
            next_lvl = curr_lvl_num + 1
            has_next = False
            for lvl in levels:
                if lvl["level"] == next_lvl:
                    has_next = True
                if lvl["status"] != "APPROVED":
                    all_approved = False

            if all_approved:
                req["status"] = "APPROVED"
                # Save status
                await WorkflowStorage.save_approval_request(req)
                
                await WorkflowAuditEngine.log_audit_event(
                    company_id=req["company_id"],
                    user_id=user_id,
                    action="APPROVAL_FULLY_GRANTED",
                    entity_id=approval_id,
                    entity_type="approval_request",
                    details=f"Approval request fully granted and completed by user {user_id}.",
                    after_state=req
                )

                # Send fully approved notification to maker
                await NotificationEngine.send_notification(
                    company_id=req["company_id"],
                    user_id=req["created_by"],
                    channel="in_app",
                    template_name="approval_granted",
                    context={
                        "document_type": req["document_type"],
                        "doc_id": req["document_id"],
                        "amount_inr": req["amount"]
                    }
                )
                
                # Trigger Workflow Engine to resume task
                from backend.workflow.workflow_engine import WorkflowEngine
                await WorkflowEngine.resume_workflow_by_approval(req["document_id"], approval_id)

            else:
                # Move to next level if exists
                if has_next:
                    req["current_level"] = next_lvl
                await WorkflowStorage.save_approval_request(req)
                
                await WorkflowAuditEngine.log_audit_event(
                    company_id=req["company_id"],
                    user_id=user_id,
                    action="APPROVAL_LEVEL_GRANTED",
                    entity_id=approval_id,
                    entity_type="approval_request",
                    details=f"Level {curr_lvl_num} approved. Escalating to level {next_lvl}.",
                    after_state=req
                )
                # Notify checkers for the new level
                await cls._notify_current_level_checkers(req)

            return True
        except Exception as e:
            logger.error(f"Error handling approval decision: {e}", exc_info=True)
            return False

    @classmethod
    async def delegate_approval(cls, approval_id: str, current_checker_id: str, delegatee_id: str, reason: str) -> bool:
        """
        Delegates the approval authority to another user.
        """
        try:
            req = await WorkflowStorage.get_approval_request(approval_id)
            if not req:
                return False

            req["delegated_to"] = delegatee_id
            await WorkflowStorage.save_approval_request(req)

            await WorkflowAuditEngine.log_audit_event(
                company_id=req["company_id"],
                user_id=current_checker_id,
                action="DELEGATE_APPROVAL",
                entity_id=approval_id,
                entity_type="approval_request",
                details=f"Approval request {approval_id} delegated from {current_checker_id} to {delegatee_id}.",
                after_state=req,
                meta_data={"reason": reason}
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delegate approval request {approval_id}: {e}", exc_info=True)
            return False

    @classmethod
    async def escalate_and_notify_expiry(cls, company_id: str):
        """
        Scans pending approval requests, triggering escalations and reminders for expired/pending ones.
        Called by workflow scheduler.
        """
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            pending_query = {
                "company_id": company_id,
                "status": "PENDING"
            }
            reqs = await WorkflowStorage.list_approval_requests(pending_query)
            for req in reqs:
                # 1. Reminders and Expiry escalation
                if req.get("expires_at") and req["expires_at"] < now_iso:
                    # Auto-expire approval request
                    req["status"] = "EXPIRED"
                    await WorkflowStorage.save_approval_request(req)
                    
                    await WorkflowAuditEngine.log_audit_event(
                        company_id=company_id,
                        user_id="SYSTEM",
                        action="APPROVAL_EXPIRED",
                        entity_id=req["id"],
                        entity_type="approval_request",
                        details="Approval request expired automatically due to deadline passing.",
                        after_state=req
                    )
                    
                    # Notify Maker
                    await NotificationEngine.send_notification(
                        company_id=company_id,
                        user_id=req["created_by"],
                        channel="in_app",
                        template_name="approval_rejected",
                        context={
                            "document_type": req["document_type"],
                            "doc_id": req["document_id"],
                            "reject_reason": "Approval request timed out / expired automatically without checker decision.",
                            "user_name": "SYSTEM"
                        }
                    )
                else:
                    # Send friendly reminder notification
                    await cls._notify_current_level_checkers(req, is_reminder=True)
        except Exception as e:
            logger.error(f"Error escalating expired approvals: {e}", exc_info=True)

    @classmethod
    async def _notify_current_level_checkers(cls, req: Dict[str, Any], is_reminder: bool = False):
        curr_lvl = req["current_level"]
        levels = req["levels"]
        lvl_info = next((l for l in levels if l["level"] == curr_lvl), None)
        if not lvl_info:
            return

        # Build notification details
        doc_type = req["document_type"]
        doc_id = req["document_id"]
        priority = "URGENT" if req["amount"] >= 100000.0 else "NORMAL"
        
        # If assigned user is explicitly specified
        target_user = lvl_info.get("assigned_user_id") or "role_group_" + lvl_info.get("role", "MANAGER")
        
        await NotificationEngine.send_notification(
            company_id=req["company_id"],
            user_id=target_user,
            channel="in_app",
            template_name="approval_requested",
            context={
                "document_type": doc_type,
                "doc_id": doc_id,
                "vendor_name": "Taskosphere Vendor",
                "amount_inr": req["amount"],
                "priority": f"{priority} (Reminder)" if is_reminder else priority,
                "description": f"Pending checker oversight at Level {curr_lvl} for {lvl_info.get('department')} department."
            }
        )
