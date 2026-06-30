"""
backend.reminders_router  —  compatibility shim
================================================

The original ``reminders_router.py`` became an accidental near-duplicate of
``backend/server.py`` (it even imported itself: ``from backend.reminders_router
import router``) which caused this circular-import crash on Render::

    ImportError: cannot import name 'router' from partially initialized module
    'backend.reminders_router'

All real reminder endpoints already live on the main ``api_router`` defined
inside ``backend/server.py``, so we only need to expose an empty router here
to keep ``from backend.reminders_router import router as reminders_router``
working. Nothing else needs to import from this module.

If you later want to move reminder endpoints out of ``server.py`` and back
into this file, attach them to the ``router`` below — DO NOT re-introduce a
self-import.
"""

from fastapi import APIRouter

router = APIRouter()

__all__ = ["router"]
