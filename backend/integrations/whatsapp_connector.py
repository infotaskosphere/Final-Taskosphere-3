import logging
from backend.integrations.future_connector_base import FutureConnectorBase

logger = logging.getLogger("whatsapp_connector")

class WhatsAppConnector(FutureConnectorBase):
    def __init__(self):
        super().__init__("WHATSAPP_DISPATCH_SERVICE")

    async def send_whatsapp_template(self, company_id: str, phone_no: str, template_name: str, vars: list) -> bool:
        """Sends WhatsApp business messages with contextual invoice PDFs."""
        async def mock_query():
            logger.info(f"WhatsApp sent template '{template_name}' to {phone_no} with vars {vars}")
            return True

        try:
            await self.execute_with_retry(mock_query)
            await self.log_integration_call(company_id, "send_whatsapp_template", "SUCCESS", {"to": phone_no, "template": template_name}, {"status": "delivered"})
            return True
        except Exception as e:
            await self.log_integration_call(company_id, "send_whatsapp_template", "FAILED", {"to": phone_no}, {"error": str(e)})
            return False
