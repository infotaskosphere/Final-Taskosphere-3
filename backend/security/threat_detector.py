import re
import logging
from typing import Dict, Any, Tuple

logger = logging.getLogger("threat_detector")

class ThreatDetector:
    PROMPT_INJECTION_PATTERNS = [
        r"ignore previous instructions",
        r"bypass safety filters",
        r"system directive: override",
        r"reveal your system prompt",
        r"you are now allowed to"
    ]

    SQL_INJECTION_PATTERNS = [
        r"union\s+select",
        r"drop\s+table",
        r"or\s+1\s*=\s*1",
        r"exec\s*\("
    ]

    @staticmethod
    def inspect_query(query: str) -> Tuple[bool, str]:
        """Validates input queries to detect and prevent malicious injection vectors."""
        q = query.lower()
        
        # Check Prompt Injection
        for pattern in ThreatDetector.PROMPT_INJECTION_PATTERNS:
            if re.search(pattern, q):
                logger.warning(f"Potential Prompt Injection detected: '{pattern}' matched.")
                return False, "PROMPT_INJECTION"
                
        # Check SQL Injection
        for pattern in ThreatDetector.SQL_INJECTION_PATTERNS:
            if re.search(pattern, q):
                logger.warning(f"Potential SQL Injection detected: '{pattern}' matched.")
                return False, "SQL_INJECTION"
                
        return True, "CLEAN"
