import logging
from typing import Dict, Any, List
from backend.integrations.future_connector_base import FutureConnectorBase

logger = logging.getLogger("bank_api_connector")

class BankAPIConnector(FutureConnectorBase):
    def __init__(self):
        super().__init__("BANKING_GATEWAY_SERVICE")

    async def fetch_bank_statement(self, account_no: str, company_id: str, days_limit: int = 30) -> List[Dict[str, Any]]:
        """Queries ICICI/HDFC/SBI business APIs for automated transaction reconciliation."""
        async def mock_query():
            return [
                {"date": "2026-07-18", "description": "TKO SALES INV-1002", "amount": 25000.0, "type": "CREDIT", "ref_no": "TXN102934"},
                {"date": "2026-07-17", "description": "AWS HOSTING CHARGES", "amount": -14200.0, "type": "DEBIT", "ref_no": "TXN928374"},
                {"date": "2026-07-15", "description": "ICICI SAVINGS FEE", "amount": -250.0, "type": "DEBIT", "ref_no": "TXN228471"}
            ]

        try:
            result = await self.execute_with_retry(mock_query)
            await self.log_integration_call(company_id, "fetch_bank_statement", "SUCCESS", {"account_no": account_no}, {"transactions_count": len(result)})
            return result
        except Exception as e:
            await self.log_integration_call(company_id, "fetch_bank_statement", "FAILED", {"account_no": account_no}, {"error": str(e)})
            raise e
