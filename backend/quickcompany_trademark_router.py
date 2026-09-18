"""
QuickCompany Trademark router compatibility shim.

The implementation lives in backend.trademark_sphere. This module is
kept because the production server historically imports
quickcompany_trademark_router.router and mounts it at /api/trademark-qc.

Do not duplicate the trademark implementation here. Re-export the single
canonical router so the frontend /api/trademark-qc/* contract reaches the
same handlers.
"""

from backend.trademark_sphere import router

__all__ = ["router"]
