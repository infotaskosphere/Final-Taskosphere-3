"""
Invoicing router.

NOTE: This file previously contained an accidental full duplicate of
server.py (including a self-import of `router` from this same module),
which caused:

    ImportError: cannot import name 'router' from partially initialized
    module 'backend.invoicing' (most likely due to a circular import)

It has been restored to a minimal, valid router module. Add your
invoicing-specific endpoints below using `router`.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/invoicing", tags=["invoicing"])


@router.get("/health")
async def invoicing_health():
    return {"status": "ok", "module": "invoicing"}
