import logging
from typing import Dict, Any

logger = logging.getLogger("prompt_manager")

class PromptManager:
    @staticmethod
    def get_system_prompt(role: str = "assistant", context_info: str = "") -> str:
        """Generates clean system prompts for the corporate AI Copilot."""
        base_prompt = (
            "You are Taskosphere Enterprise Copilot, a world-class AI ERP Assistant. "
            "You have direct access to financial transactions, GST filings, ledgers, workflows, and document management. "
            "Maintain extreme precision, security compliance, and objective clarity. Never make up data. "
            "Analyze records using provided contextual details carefully.\n"
        )
        if role == "accountant":
            base_prompt += "Your main task is professional auditing, tax intelligence (GST/VAT), balance sheet analysis, and zero-touch posting."
        elif role == "compliance":
            base_prompt += "Your focus is ROC compliance, GST return verification, and regulatory calendars."
        else:
            base_prompt += "Assist with general business questions, document searching, and enterprise workflows."
            
        if context_info:
            base_prompt += f"\n\nActive Context Details:\n{context_info}"
            
        return base_prompt

    @staticmethod
    def get_reconciliation_prompt(bank_records: str, ledger_records: str) -> str:
        return (
            f"Analyze the following bank ledger entries against general book transactions and identify matching items or discrepancies:\n"
            f"--- BANK RECORDS ---\n{bank_records}\n"
            f"--- GENERAL LEDGER ---\n{ledger_records}\n"
            "Produce a structured JSON detailing matches, potential duplicates, and unaccounted charges."
        )
