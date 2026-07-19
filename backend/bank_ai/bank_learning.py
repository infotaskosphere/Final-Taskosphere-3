"""
Bank Learning Module (Phase 8)
Manages the machine learning feedback loop. Learns from manual classification corrections
to train future automated classification predictions.
"""

import logging
import re
from typing import Dict, Any, List

from backend.bank_ai.bank_storage import BankStorage

logger = logging.getLogger("bank_learning")

class BankLearning:
    @staticmethod
    async def record_user_correction(narration: str, corrected_category: str) -> None:
        """
        Learns from a manual override or confirmation by incrementing the weight
        of the simplified narration token pattern.
        """
        if not narration or not corrected_category:
            return

        # Clean narration to extract generic patterns (e.g. remove variable dates, amounts, etc)
        pattern = re.sub(r'\d+', '', narration).strip()
        pattern = re.sub(r'\s+', ' ', pattern).lower()
        
        # Take the first 30 characters as the core repeating token pattern
        pattern = pattern[:30].strip()

        if len(pattern) > 3:
            logger.info(f"ML Feedback Loop: Recording user correction pattern '{pattern}' -> '{corrected_category}'")
            # Score +2 for a custom user validation correction
            await BankStorage.update_reinforcement_feedback(pattern, corrected_category, +2)

    @staticmethod
    async def get_learned_rules() -> List[Dict[str, Any]]:
        """
        Exposes learned mappings with high confidence for predictive suggestions.
        """
        return await BankStorage.get_learning_patterns()
