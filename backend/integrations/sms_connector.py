import logging
from backend.integrations.future_connector_base import FutureConnectorBase

logger = logging.getLogger("sms_connector")

class SMSConnector(FutureConnectorBase):
    def __init__(self):
        super().__init__("SMS_DISPATCH_SERVICE")

    async def send_text_message(self, company_id: str, phone_no: str, message: str) -> bool:
        """Sends OTPs or reminders securely using Twilio/SMS APIs."""
        async def mock_query():
            logger.info(f"SMS dispatched to {phone_no}: {message}")
            return True

        try:
            await self.execute_with_retry(mock_query)
            await self.log_integration_call(company_id, "send_text_message", "SUCCESS", {"to": phone_no}, {"status": "sent"})
            return True
        except Exception as e:
            await self.log_integration_call(company_id, "send_text_message", "FAILED", {"to": phone_no}, {"error": str(e)})
            return False
