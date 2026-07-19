import logging
from typing import Dict, Any, List, Optional
from backend.dependencies import db

logger = logging.getLogger("task_router")

class TaskRouter:
    @classmethod
    async def find_optimal_assignee(
        cls,
        company_id: str,
        department: str,
        role: str,
        priority: str = "NORMAL",
        skills: Optional[List[str]] = None,
        branch: Optional[str] = None
    ) -> Optional[str]:
        """
        Intelligently routing tasks to active humans based on department, role, workload, branch and skills.
        Ensures horizontal scaling capability across multiple departments or business units.
        """
        try:
            # 1. Fetch qualified team members in the company
            query = {
                "company_id": company_id,
                "role": role
            }
            if department:
                query["department"] = department
            if branch:
                query["branch"] = branch

            users_cursor = db.users.find(query)
            qualified_users = await users_cursor.to_list(100)

            if not qualified_users:
                # Fallback to general admin if no specific role/department match is found
                admin_user = await db.users.find_one({"company_id": company_id, "role": "ADMIN"})
                if admin_user:
                    return str(admin_user.get("id") or admin_user.get("_id"))
                return "system_admin"

            # 2. Filter users by matching skills if specified
            if skills:
                qualified_users = [
                    u for u in qualified_users 
                    if any(skill in u.get("skills", []) for skill in skills)
                ] or qualified_users

            # 3. Workload balancing: select user with fewest active/pending assigned approval requests or workflows
            user_workloads = {}
            for u in qualified_users:
                u_id = str(u.get("id") or u.get("_id"))
                # Count current active items assigned to this user
                active_count = await db.approval_requests.count_documents({
                    "company_id": company_id,
                    "status": "PENDING",
                    "levels": {
                        "$elemMatch": {
                            "status": "PENDING",
                            "assigned_user_id": u_id
                        }
                    }
                })
                user_workloads[u_id] = active_count

            # Find user with minimal workload
            optimal_user_id = min(user_workloads, key=user_workloads.get)
            logger.info(f"Routed task to user {optimal_user_id} with workload={user_workloads[optimal_user_id]}")
            return optimal_user_id
        except Exception as e:
            logger.error(f"Task router failed to find optimal assignee: {e}", exc_info=True)
            return "system_admin"
