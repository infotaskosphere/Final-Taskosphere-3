from fastapi import APIRouter, Depends
from datetime import datetime, timezone
import uuid
from backend.dependencies import db, get_current_user
from backend.models import User

router = APIRouter(prefix="/api/activity", tags=["Website Tracking"])

# ================================
# TRACK WEBSITE ACTIVITY
# ================================
@router.post("/track")
async def track_website(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    activity = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "type": "website",
        "url": data.get("url"),
        "domain": data.get("domain"),
        "title": data.get("title"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration": data.get("duration", 0)
    }

    await db.staff_activity.insert_one(activity)

    return {"status": "tracked"}


# ================================
# GET WEBSITE USAGE
# ================================
@router.get("/websites")
async def get_websites(current_user: User = Depends(get_current_user)):
    data = await db.staff_activity.find(
        {"user_id": current_user.id, "type": "website"},
        {"_id": 0}
    ).to_list(1000)

    return data
