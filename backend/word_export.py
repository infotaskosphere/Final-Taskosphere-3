import logging
from typing import List, Dict, Any

logger = logging.getLogger("word_export")

class WordExport:
    @staticmethod
    def render_word_doc(title: str, paragraphs: List[str]) -> str:
        """Assembles rich document summaries inside a clean markdown-formatted string."""
        doc_lines = [
            f"# {title}",
            "---",
            "### EXECUTIVE COMPLIANCE REPORT",
            ""
        ]
        doc_lines.extend(paragraphs)
        doc_lines.append("\n*Report assembled autonomously by Taskosphere Business Intelligence Engine.*")
        return "\n".join(doc_lines)
