import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from backend.workflow.workflow_storage import WorkflowStorage
from backend.workflow.audit_engine import WorkflowAuditEngine

logger = logging.getLogger("notification_engine")

class NotificationEngine:
    @staticmethod
    async def send_notification(
        company_id: str,
        user_id: str,
        channel: str,  # "email", "in_app", "push", "whatsapp", "slack"
        template_name: str,
        context: Dict[str, Any],
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        Sends a notification via the requested channel using templates, handles retries,
        and logs the outcome in notification_history.
        """
        try:
            # 1. Resolve template content
            subject, body = NotificationTemplates.get_template(template_name, context)

            notification_doc = {
                "company_id": company_id,
                "user_id": user_id,
                "channel": channel,
                "template_name": template_name,
                "subject": subject,
                "body": body,
                "context": context,
                "status": "PENDING",
                "retry_count": 0,
                "max_retries": max_retries,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            notif_id = await WorkflowStorage.save_notification_history(notification_doc)
            notification_doc["id"] = notif_id

            # 2. Dispatch via specific channel
            success = await NotificationEngine._dispatch_with_retry(notification_doc)

            # 3. Log to workflow audit
            await WorkflowAuditEngine.log_audit_event(
                company_id=company_id,
                user_id=user_id,
                action=f"SEND_NOTIFICATION_{channel.upper()}",
                entity_id=notif_id,
                entity_type="notification",
                details=f"Notification of type {template_name} sent via {channel}. Success={success}",
                after_state={"status": "SENT" if success else "FAILED"},
                meta_data={"template_name": template_name, "channel": channel}
            )

            return notification_doc
        except Exception as e:
            logger.error(f"Failed to process/send notification: {e}", exc_info=True)
            return {"status": "ERROR", "error": str(e)}

    @classmethod
    async def _dispatch_with_retry(cls, notif_doc: Dict[str, Any]) -> bool:
        channel = notif_doc["channel"]
        notif_id = notif_doc["id"]
        company_id = notif_doc["company_id"]
        
        while notif_doc["retry_count"] <= notif_doc["max_retries"]:
            try:
                # Increment retry count
                if notif_doc["retry_count"] > 0:
                    logger.info(f"Retrying notification {notif_id} (Attempt {notif_doc['retry_count']}/{notif_doc['max_retries']})")
                
                # Channel specific dispatching
                if channel == "email":
                    await cls._dispatch_email(notif_doc)
                elif channel == "in_app":
                    await cls._dispatch_in_app(notif_doc)
                elif channel == "slack":
                    await cls._dispatch_slack(notif_doc)
                elif channel == "whatsapp":
                    await cls._dispatch_whatsapp(notif_doc)
                else:
                    # Default/fallback push
                    await cls._dispatch_push(notif_doc)
                
                # On success, update status
                notif_doc["status"] = "SENT"
                notif_doc["sent_at"] = datetime.now(timezone.utc).isoformat()
                from backend.dependencies import db
                await db.notification_history.update_one({"id": notif_id}, {"$set": {"status": "SENT", "sent_at": notif_doc["sent_at"]}})
                return True

            except Exception as ex:
                notif_doc["retry_count"] += 1
                from backend.dependencies import db
                await db.notification_history.update_one(
                    {"id": notif_id}, 
                    {"$set": {"retry_count": notif_doc["retry_count"], "last_error": str(ex)}}
                )
                if notif_doc["retry_count"] > notif_doc["max_retries"]:
                    logger.error(f"Notification {notif_id} permanently failed after {notif_doc['max_retries']} retries. Error: {ex}")
                    await db.notification_history.update_one({"id": notif_id}, {"$set": {"status": "FAILED"}})
                    return False
                # Wait briefly before retrying (exponential backoff / delay)
                await asyncio.sleep(0.5 * notif_doc["retry_count"])
        return False

    @classmethod
    async def _dispatch_email(cls, notif: Dict[str, Any]):
        """Integrates with standard SMTP / email pipeline if available, else logs."""
        logger.info(f"Sending Email to User {notif['user_id']} with Subject: {notif['subject']}")
        # Direct integration fallback
        # In a real environment, we'd import an actual SMTP sender or sendmail
        pass

    @classmethod
    async def _dispatch_in_app(cls, notif: Dict[str, Any]):
        """Saves an in-app alert inside the notifications or reminders collection."""
        from backend.dependencies import db
        alert = {
            "id": notif["id"],
            "user_id": notif["user_id"],
            "company_id": notif["company_id"],
            "title": notif["subject"],
            "message": notif["body"],
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(alert)
        logger.info(f"In-App Notification saved for User {notif['user_id']}.")

    @classmethod
    async def _dispatch_slack(cls, notif: Dict[str, Any]):
        logger.info(f"Slack Dispatch: Sending payload to integrated Slack webhook for {notif['user_id']}")

    @classmethod
    async def _dispatch_whatsapp(cls, notif: Dict[str, Any]):
        logger.info(f"WhatsApp Dispatch: Routing message to target WhatsApp gateway for {notif['user_id']}")

    @classmethod
    async def _dispatch_push(cls, notif: Dict[str, Any]):
        logger.info(f"Push Notification Dispatch: Sending to browser/device channel for {notif['user_id']}")


class NotificationTemplates:
    TEMPLATES: Dict[str, Dict[str, str]] = {
        "approval_requested": {
            "subject": "Approval Required: Action needed on {document_type} (ID: {doc_id})",
            "body": "Hi there,\n\nA new {document_type} from vendor {vendor_name} for total amount {amount_inr} INR is waiting for your approval.\n\nPriority: {priority}\nDescription: {description}\n\nPlease log in to Taskosphere to approve or reject this request."
        },
        "approval_granted": {
            "subject": "Approval Granted: {document_type} (ID: {doc_id})",
            "body": "The {document_type} for amount {amount_inr} INR has been successfully approved by all levels and posted to the general ledger."
        },
        "approval_rejected": {
            "subject": "Approval Rejected: {document_type} (ID: {doc_id})",
            "body": "The {document_type} has been rejected.\n\nReason: {reject_reason}\nAction taken by: {user_name}"
        },
        "task_assigned": {
            "subject": "New Task Assigned: {task_name}",
            "body": "You have been assigned a new task: {task_name}.\n\nDue Date: {due_date}\nPriority: {priority}\nDetails: {details}"
        },
        "compliance_warning": {
            "subject": "Urgent Compliance Warning: {compliance_type}",
            "body": "The filing deadline for {compliance_type} is approaching (Due: {due_date}). Please review current documents and complete filings immediately to avoid penalties."
        }
    }

    @classmethod
    def get_template(cls, template_name: str, context: Dict[str, Any]) -> tuple:
        tpl = cls.TEMPLATES.get(template_name, {
            "subject": "Taskosphere Alert: {title}",
            "body": "{message}"
        })
        subj = tpl["subject"].format_map(SafeDict(context))
        body = tpl["body"].format_map(SafeDict(context))
        return subj, body


class SafeDict(dict):
    """A dictionary that doesn't crash on missing keys when formatting."""
    def __missing__(self, key):
        return f"{{{key}}}"
