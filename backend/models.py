from pydantic import BaseModel
from typing import Optional, Dict, Any

class User(BaseModel):
    id: str
    email: Optional[str] = None
    role: str
    permissions: Optional[Dict[str, Any]] = {}
