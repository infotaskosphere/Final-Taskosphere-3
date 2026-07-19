from typing import List
from backend.ai.ai_memory import get_document_history

async def get_recent_documents(limit: int = 50) -> List[dict]:
    """
    Fetches the most recently processed documents across all vendors.
    """
    return await get_document_history(limit=limit)

async def get_documents_by_vendor(vendor_gstin: str, limit: int = 50) -> List[dict]:
    """
    Fetches historical documents processed for a specific vendor.
    """
    if not vendor_gstin:
        return []
    return await get_document_history(vendor_gstin=vendor_gstin, limit=limit)

async def get_successful_postings(limit: int = 50) -> List[dict]:
    """
    Fetches historical documents that have been successfully posted.
    """
    history = await get_document_history(limit=limit)
    return [doc for doc in history if doc.get("posting_status") == "posted"]
