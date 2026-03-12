# 1. Import
from essl_backend import essl_router, sync_engine

# 2. Register router  
api_router.include_router(essl_router)

# 3. Start engine
@app.on_event("startup")
async def start_essl_sync():
    asyncio.create_task(sync_engine.run())

# 4. Add indexes (inside existing create_indexes)
await db.machine_config.create_index("key", unique=True)
await db.users.create_index("machine_employee_id", sparse=True)

# 5. Add machine fields to new_user dict in register()
"machine_employee_id": user_data.machine_employee_id or None,
"machine_synced": False,
