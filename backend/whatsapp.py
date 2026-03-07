import requests
import logging
import os

logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURATION
# =====================================================

WHATSAPP_SERVICE_URL = os.getenv(
    "WHATSAPP_SERVICE_URL",
    "http://localhost:3001/send-message"
)

WHATSAPP_GROUP_ID = os.getenv(
    "WHATSAPP_GROUP_ID",
    "YOUR_GROUP_ID@g.us"
)

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://final-taskosphere-frontend.onrender.com"
)

# =====================================================
# CORE WHATSAPP SENDER
# =====================================================

def send_whatsapp_message(message: str, group_id: str = None):
    """
    Sends message to WhatsApp automation service
    """

    try:

        payload = {
            "groupId": group_id or WHATSAPP_GROUP_ID,
            "message": message
        }

        response = requests.post(
            WHATSAPP_SERVICE_URL,
            json=payload,
            timeout=5
        )

        if response.status_code != 200:
            logger.error(f"WhatsApp API error: {response.text}")

    except Exception as e:
        logger.error(f"WhatsApp send failed: {str(e)}")


# =====================================================
# TASK CREATED NOTIFICATION
# =====================================================

def send_task_created(task: dict, assigned_name: str, created_by: str):

    try:

        task_id = task.get("id")
        task_link = f"{FRONTEND_URL}/tasks/{task_id}"
        complete_link = f"{FRONTEND_URL}/tasks/complete/{task_id}"

        description = task.get("description") or "No description provided"

        message = f"""
📌 *NEW TASK CREATED*

*Task:* {task.get('title')}

*Description:*
{description}

*Assigned To:* {assigned_name}
*Priority:* {task.get('priority','medium')}
*Due Date:* {task.get('due_date')}

👤 Created By: {created_by}

🔗 Open Task
{task_link}

✅ Complete Task
{complete_link}

— Taskosphere
"""

        send_whatsapp_message(message)

    except Exception as e:
        logger.error(f"Task creation WhatsApp notification failed: {str(e)}")


# =====================================================
# TASK COMPLETED NOTIFICATION
# =====================================================

def send_task_completed(task: dict, completed_by: str):

    try:

        task_link = f"{FRONTEND_URL}/tasks/{task.get('id')}"

        message = f"""
✅ *TASK COMPLETED*

*Task:* {task.get('title')}

Completed By: {completed_by}

🔗 View Task
{task_link}

— Taskosphere
"""

        send_whatsapp_message(message)

    except Exception as e:
        logger.error(f"Task completion WhatsApp notification failed: {str(e)}")


# =====================================================
# OVERDUE TASK ALERT
# =====================================================

def send_overdue_task(task: dict, assigned_name: str):

    try:

        task_link = f"{FRONTEND_URL}/tasks/{task.get('id')}"

        message = f"""
⚠️ *OVERDUE TASK ALERT*

*Task:* {task.get('title')}

Assigned To: {assigned_name}
Due Date: {task.get('due_date')}

🚨 Please complete immediately

👉 Open Task
{task_link}

— Taskosphere
"""

        send_whatsapp_message(message)

    except Exception as e:
        logger.error(f"Overdue WhatsApp alert failed: {str(e)}")


# =====================================================
# SIMPLE TEST MESSAGE
# =====================================================

def send_test_message():

    message = """
🚀 *Taskosphere WhatsApp Integration*

WhatsApp notifications are working correctly.

— Taskosphere
"""

    send_whatsapp_message(message)


# =====================================================
# LOCAL TEST
# =====================================================

if __name__ == "__main__":
    send_test_message()
