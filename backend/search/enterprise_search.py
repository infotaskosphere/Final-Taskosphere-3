import asyncio
import logging
from typing import Dict, Any, List, Optional
from backend.dependencies import db
from backend.search.document_search import DocumentSearch
from backend.search.ledger_search import LedgerSearch
from backend.search.semantic_search import SemanticSearch

logger = logging.getLogger("enterprise_search")

class EnterpriseSearch:
    @staticmethod
    async def global_enterprise_search(
        company_id: str,
        query: str,
        category: str = "all"
    ) -> Dict[str, Any]:
        """Runs parallel queries across documents, ledger logs, and semantic engines."""
        results = {
            "query": query,
            "category": category,
            "documents": [],
            "ledger_entries": [],
            "semantic_entries": []
        }
        
        tasks = []
        if category in ["all", "documents"]:
            tasks.append(DocumentSearch.query_processed_documents(company_id, raw_text_regex=query))
        else:
            tasks.append(asyncio.sleep(0, [])) # Dummy task
            
        if category in ["all", "ledger"]:
            tasks.append(LedgerSearch.filter_ledger_entries(company_id, search_query=query))
        else:
            tasks.append(asyncio.sleep(0, [])) # Dummy task
            
        if category in ["all", "semantic"]:
            tasks.append(SemanticSearch.find_by_semantic_intent(query, company_id))
        else:
            tasks.append(asyncio.sleep(0, [])) # Dummy task

        # Await tasks concurrently
        task_results = await asyncio.gather(*tasks)
        
        if category in ["all", "documents"]:
            results["documents"] = task_results[0] if task_results[0] else []
        if category in ["all", "ledger"]:
            results["ledger_entries"] = task_results[1] if task_results[1] else []
        if category in ["all", "semantic"]:
            results["semantic_entries"] = task_results[2] if task_results[2] else []
            
        return results
