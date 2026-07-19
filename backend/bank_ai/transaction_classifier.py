"""
Transaction Classifier Module (Phase 8)
Auto-categorises bank transactions into accounting chart-of-accounts and ledger categories.
Leverages regex keywords, feedback-based learned rules, and advanced generative AI (Gemini) classification.
"""

import logging
import re
from typing import Dict, Any, List, Optional

from backend.bank_ai.bank_storage import BankStorage
from backend.services.gemini_client import get_gemini_client

logger = logging.getLogger("transaction_classifier")

class TransactionClassifier:
    # Common rule-based mappings
    RULE_CATEGORIES = {
        "Salary": [r"salary", r"sal\b", r"payroll", r"wages"],
        "Interest Income": [r"int\s*rec", r"interest\s*received", r"credited\s*interest"],
        "Bank Charges": [r"chgs", r"charges", r"fine", r"annual\s*fee", r"maintenance\s*fee", r"chg\b"],
        "Office Expenses": [r"stationery", r"pantry", r"tea", r"coffee", r"cleaning", r"courier"],
        "Utilities": [r"electricity", r"power", r"water", r"internet", r"broadband", r"phone", r"telecom"],
        "Rent": [r"rent", r"lease", r"rental"],
        "Travel Expenses": [r"uber", r"ola", r"cab", r"taxi", r"flight", r"airline", r"fuel", r"petrol"],
        "Professional Fees": [r"legal", r"consulting", r"audit\s*fee", r"advisor", r"ca\s*fees"],
        "Vendor Payment": [r"payout", r"transfer\s*to", r"paid\s*to", r"rtgs\s*to", r"neft\s*to", r"imps\s*to"],
        "Customer Receipt": [r"refund", r"received\s*from", r"rtgs\s*from", r"neft\s*from", r"upi\s*from"]
    }

    @classmethod
    async def classify(
        self,
        transaction: Dict[str, Any],
        chart_of_accounts: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Classifies a transaction narration.
        Order of evaluation:
        1. Rule-based keyword matching (fast, 100% deterministic).
        2. Database learned history mapping (reinforcement learning feedback).
        3. Gemini AI fallback model classification.
        """
        narration = transaction.get("narration", "").strip()
        txn_type = transaction.get("type", "debit").lower()
        amount = transaction.get("amount", 0.0)

        if not narration:
            return {"category": "Uncategorized", "confidence": 0.1, "method": "fallback"}

        # 1. Check keyword rules
        for category, patterns in self.RULE_CATEGORIES.items():
            for pattern in patterns:
                if re.search(pattern, narration.lower()):
                    # Adjust category based on type (debit vs credit)
                    resolved_cat = category
                    if category == "Vendor Payment" and txn_type == "credit":
                        resolved_cat = "Customer Receipt"
                    elif category == "Customer Receipt" and txn_type == "debit":
                        resolved_cat = "Vendor Payment"
                    
                    return {
                        "category": resolved_cat,
                        "confidence": 0.90,
                        "method": "rules"
                    }

        # 2. Check Database reinforcement learned feedback
        try:
            learned_patterns = await BankStorage.get_learning_patterns()
            for lp in learned_patterns:
                pat = lp.get("narration_pattern", "")
                if pat and pat.lower() in narration.lower():
                    return {
                        "category": lp.get("category", "Uncategorized"),
                        "confidence": min(0.95, 0.8 + (lp.get("score", 1) * 0.02)),
                        "method": "feedback"
                    }
        except Exception as e:
            logger.warning(f"Error checking learned patterns: {e}")

        # 3. Gemini AI model fallback
        try:
            logger.info(f"Using Gemini to classify transaction: {narration}")
            client = get_gemini_client()
            
            coa_context = ""
            if chart_of_accounts:
                coa_context = f"Available Chart of Accounts: {', '.join(chart_of_accounts)}"

            prompt = f"""
            You are a Chartered Accountant classifying bank transactions for general ledger postings.
            Transaction details:
            Narration: "{narration}"
            Type: {txn_type.upper()}
            Amount: {amount}
            {coa_context}

            Based on this information, choose the single most appropriate accounting ledger category (e.g. Salary, Rent, Bank Charges, Vendor Payment, Customer Receipt, Travel, Utilities, Office Expense, or custom COA category).
            Return a JSON object containing keys:
            - category: (str) Name of the category
            - explanation: (str) Quick audit justification
            - confidence: (float) Score between 0.0 and 1.0

            Example: {{"category": "Bank Charges", "explanation": "Narration contains standard monthly charge keywords", "confidence": 0.95}}
            """

            import asyncio
            from google.genai import types as genai_types

            def _call_ai():
                cfg = genai_types.GenerateContentConfig(
                    temperature=0.0,
                    response_mime_type="application/json"
                )
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt],
                    config=cfg
                )

            res = await asyncio.to_thread(_call_ai)
            raw_text = getattr(res, "text", "")
            if raw_text:
                import json
                cleaned = raw_text.strip()
                # strip json markdown fences if present
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
                parsed = json.loads(cleaned)
                
                return {
                    "category": parsed.get("category", "Uncategorized"),
                    "explanation": parsed.get("explanation", "AI Classified"),
                    "confidence": float(parsed.get("confidence", 0.75)),
                    "method": "ai"
                }
        except Exception as e:
            logger.error(f"Gemini transaction classification failed: {e}")

        return {
            "category": "Uncategorized",
            "confidence": 0.3,
            "method": "default",
            "explanation": "No matching classification strategies found."
        }
