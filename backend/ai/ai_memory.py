from backend.dependencies import db

async def save_ai_memory(record: dict) -> str:
    """
    Saves a record into the ai_document_memory collection.
    """
    await db.ai_document_memory.insert_one(record)
    return record.get("document_id")

async def find_memory_by_fingerprint(fingerprint: str) -> dict:
    """
    Finds a record by its unique fingerprint.
    """
    return await db.ai_document_memory.find_one({"fingerprint": fingerprint}, {"_id": 0})

async def update_ai_memory(fingerprint: str, update_data: dict) -> bool:
    """
    Updates a memory record by fingerprint.
    """
    result = await db.ai_document_memory.update_one(
        {"fingerprint": fingerprint},
        {"$set": update_data}
    )
    return result.modified_count > 0

async def delete_ai_memory(fingerprint: str) -> bool:
    """
    Deletes a memory record by fingerprint.
    """
    result = await db.ai_document_memory.delete_one({"fingerprint": fingerprint})
    return result.deleted_count > 0

async def get_document_history(vendor_gstin: str = None, limit: int = 50) -> list:
    """
    Retrieves document history from ai_document_memory.
    """
    query = {}
    if vendor_gstin:
        query["vendor_gstin"] = vendor_gstin
    return await db.ai_document_memory.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
