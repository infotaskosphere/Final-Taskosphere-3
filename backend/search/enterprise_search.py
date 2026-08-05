"""Parallel universal search across every record type in Taskosphere.

Previously this only fanned out to documents / ledger / semantic passes, all
of them scoped to a `company_id` that most collections don't even carry — so
a search for a company name, a director, a task or a compliance filing always
came back empty. It now searches entities first (clients, individuals, tasks,
compliance) and keeps documents + ledger entries as additional groups.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from backend.search.document_search import DocumentSearch
from backend.search.entity_search import EntitySearch
from backend.search.ledger_search import LedgerSearch
from backend.search.semantic_search import SemanticSearch

logger = logging.getLogger("enterprise_search")

# category -> the groups it should populate
CATEGORY_GROUPS = {
    "all":         ["clients", "individuals", "tasks", "compliance", "documents", "ledger_entries", "semantic_entries"],
    "clients":     ["clients", "individuals"],
    "people":      ["individuals"],
    "tasks":       ["tasks"],
    "compliance":  ["compliance"],
    "documents":   ["documents"],
    "ledger":      ["ledger_entries"],
    "semantic":    ["semantic_entries"],
}


async def _safe(coro, label: str) -> List[Dict[str, Any]]:
    """One failing collection must never blank out the whole search."""
    try:
        return await coro or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("universal search group '%s' failed: %s", label, exc)
        return []


class EnterpriseSearch:
    @staticmethod
    async def global_enterprise_search(
        company_id: Optional[str],
        query: str,
        category: str = "all",
    ) -> Dict[str, Any]:
        query = (query or "").strip()
        wanted = CATEGORY_GROUPS.get(category or "all", CATEGORY_GROUPS["all"])

        results: Dict[str, Any] = {
            "query": query,
            "category": category,
            "clients": [],
            "individuals": [],
            "tasks": [],
            "compliance": [],
            "documents": [],
            "ledger_entries": [],
            "semantic_entries": [],
            "total": 0,
        }
        if not query:
            return results

        jobs: List[tuple] = []
        if "clients" in wanted:
            jobs.append(("clients", EntitySearch.search_clients(query)))
        if "individuals" in wanted:
            jobs.append(("individuals", EntitySearch.search_individuals(query)))
        if "tasks" in wanted:
            jobs.append(("tasks", EntitySearch.search_tasks(query)))
        if "compliance" in wanted:
            jobs.append(("compliance", EntitySearch.search_compliance(query)))
        if "documents" in wanted:
            jobs.append(("documents", DocumentSearch.query_processed_documents(
                company_id or "", raw_text_regex=query)))
        if "ledger_entries" in wanted:
            jobs.append(("ledger_entries", LedgerSearch.filter_ledger_entries(
                company_id or "", search_query=query)))
        if "semantic_entries" in wanted:
            jobs.append(("semantic_entries", SemanticSearch.find_by_semantic_intent(
                query, company_id or "")))

        gathered = await asyncio.gather(*[_safe(c, label) for label, c in jobs])
        for (label, _), rows in zip(jobs, gathered):
            results[label] = rows

        # Normalise the three legacy groups so the UI can render one list.
        results["documents"] = [{
            **d,
            "source": "documents",
            "entity": "document",
            "title": d.get("filename") or d.get("title") or d.get("vendor_name") or "Document",
            "subtitle": d.get("document_type") or "",
            "link": "/documents",
        } for d in results["documents"]]

        results["ledger_entries"] = [{
            **l,
            "source": "ledger",
            "entity": "ledger",
            "title": l.get("narration") or l.get("narrative") or "Ledger entry",
            "subtitle": l.get("account_name") or "",
            "amount": l.get("debit") or l.get("credit") or l.get("amount"),
            "link": "/journal-entries",
        } for l in results["ledger_entries"]]

        results["semantic_entries"] = [{
            **s,
            "source": "semantic",
            "entity": "semantic",
            "title": s.get("narration") or s.get("title") or "Semantic match",
            "link": "/journal-entries",
        } for s in results["semantic_entries"]]

        results["total"] = sum(
            len(results[k]) for k in
            ("clients", "individuals", "tasks", "compliance",
             "documents", "ledger_entries", "semantic_entries")
        )
        # Flat list too, so any older client code keeps working.
        results["results"] = (
            results["clients"] + results["individuals"] + results["tasks"]
            + results["compliance"] + results["documents"]
            + results["ledger_entries"] + results["semantic_entries"]
        )
        return results

    @staticmethod
    async def client_360(client_id: str) -> Optional[Dict[str, Any]]:
        return await EntitySearch.client_profile(client_id)
