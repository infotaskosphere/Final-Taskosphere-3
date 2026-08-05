# Universal Search fix — files to drop into your project

Copy these 4 files over the same paths in `Final-Taskosphere-3-main`:

| File | Change |
|---|---|
| `backend/search/entity_search.py` | **NEW** — searches `clients` (company name, trade name, GSTIN/PAN/CIN, email, phone), `contact_persons`/directors (name, DIN, designation), `tasks`, and `compliance_assignments`; also builds the Client-360 profile. |
| `backend/search/enterprise_search.py` | Now an orchestrator: fans out to entity + document + ledger + semantic search in parallel and returns grouped results. `company_id` is optional (entities aren't tenant-partitioned in this build). |
| `backend/api_v2/router_v2.py` | `/v2/search` no longer forces `company_id="default_comp"`; added `/v2/search/client/{client_id}` for the 360 view. |
| `frontend/src/components/layout/DashboardLayout.jsx` | New search modal: grouped results (Companies / Directors & Individuals / Tasks / Compliance / Documents / Ledger), each row clickable, and clicking a company expands an inline 360 panel (assigned-to, directors, compliances, tasks, stats) with deep links to `/clients`, `/tasks`, `/compliance`, `/invoicing`.
