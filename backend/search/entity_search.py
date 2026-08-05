"""Entity-level universal search.

The original /v2/search only looked at three places: OCR'd document text
(`ai_document_memory`), the legacy `journals` collection, and a keyword
"semantic" pass over that same legacy collection. None of those hold the
records a user actually types into the search bar — a company name, a
director's name, a task, or a compliance filing — which is why searching
"Desai Tech Weave" returned "No records found".

This module adds the missing half: real entity search over clients
(companies), their contact persons (directors / partners / individuals),
tasks and compliance assignments, plus a 360-degree profile lookup so a
clicked result can immediately show who the client is assigned to, its
compliances and its tasks.

None of these collections are company/tenant scoped in this codebase, so
they are deliberately NOT filtered by company_id (doing so was the second
half of the original bug).
"""

import logging
import re
from typing import Any, Dict, List, Optional

from backend.dependencies import db

logger = logging.getLogger("entity_search")

# Fields on a client record that a human might search by.
CLIENT_TEXT_FIELDS = [
    "company_name",
    "client_type_label",
    "email",
    "phone",
    "city",
    "state",
    "address",
    "gstin",
    "gst_number",
    "pan",
    "pan_number",
    "tan_number",
    "cin",
    "llpin",
    "msme_number",
    "tally_ledger_name",
    "notes",
    "referred_by",
    "contact_persons.name",
    "contact_persons.email",
    "contact_persons.phone",
    "contact_persons.din",
    "contact_persons.designation",
    "dsc_details.holder_name",
]

TASK_TEXT_FIELDS = ["title", "description", "type", "category"]

COMPLIANCE_TEXT_FIELDS = ["client_name", "notes", "status", "assigned_to_name"]


def _rx(query: str) -> Dict[str, Any]:
    """Case-insensitive, whitespace-tolerant, escaped regex matcher.

    "desai tech  weave" also matches "Desai Techweave" / "Desai Tech-Weave",
    which is what people actually type.
    """
    tokens = [re.escape(t) for t in query.strip().split() if t]
    if not tokens:
        return {"$regex": ".^"}
    pattern = r"[\s\-_.,]*".join(tokens)
    return {"$regex": pattern, "$options": "i"}


def _or(fields: List[str], query: str) -> Dict[str, Any]:
    rx = _rx(query)
    return {"$or": [{f: rx} for f in fields]}


async def _user_name_map(user_ids: List[Optional[str]]) -> Dict[str, str]:
    ids = sorted({u for u in user_ids if u})
    if not ids:
        return {}
    users = await db.users.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1}
    ).to_list(len(ids))
    return {u["id"]: (u.get("full_name") or u.get("email") or "—") for u in users}


class EntitySearch:
    # ── Clients / companies ────────────────────────────────────────────────
    @staticmethod
    async def search_clients(query: str, limit: int = 25) -> List[Dict[str, Any]]:
        docs = await db.clients.find(
            _or(CLIENT_TEXT_FIELDS, query), {"_id": 0}
        ).limit(limit).to_list(limit)
        if not docs:
            return []

        names = await _user_name_map([d.get("assigned_to") for d in docs])
        client_ids = [d.get("id") for d in docs if d.get("id")]

        # Counts so the result card can show "4 tasks · 3 compliances"
        task_counts: Dict[str, int] = {}
        open_task_counts: Dict[str, int] = {}
        comp_counts: Dict[str, int] = {}
        pending_comp_counts: Dict[str, int] = {}
        if client_ids:
            for t in await db.tasks.find(
                {"client_id": {"$in": client_ids}},
                {"_id": 0, "client_id": 1, "status": 1},
            ).to_list(5000):
                cid = t.get("client_id")
                task_counts[cid] = task_counts.get(cid, 0) + 1
                if (t.get("status") or "") not in ("completed", "closed", "cancelled"):
                    open_task_counts[cid] = open_task_counts.get(cid, 0) + 1
            for a in await db.compliance_assignments.find(
                {"client_id": {"$in": client_ids}},
                {"_id": 0, "client_id": 1, "status": 1},
            ).to_list(5000):
                cid = a.get("client_id")
                comp_counts[cid] = comp_counts.get(cid, 0) + 1
                if (a.get("status") or "") in ("not_started", "in_progress"):
                    pending_comp_counts[cid] = pending_comp_counts.get(cid, 0) + 1

        results = []
        for d in docs:
            cid = d.get("id")
            contacts = d.get("contact_persons") or []
            results.append({
                "source": "client",
                "entity": "client",
                "id": cid,
                "title": d.get("company_name") or "Unnamed client",
                "subtitle": (d.get("client_type_label") or d.get("client_type") or "").replace("_", " ").title(),
                "assigned_to": d.get("assigned_to"),
                "assigned_to_name": names.get(d.get("assigned_to") or "", "Unassigned"),
                "status": d.get("status") or "active",
                "approval_status": d.get("approval_status"),
                "email": d.get("email"),
                "phone": d.get("phone"),
                "city": d.get("city"),
                "state": d.get("state"),
                "gstin": d.get("gstin") or d.get("gst_number"),
                "pan": d.get("pan") or d.get("pan_number"),
                "cin": d.get("cin") or d.get("llpin"),
                "services": d.get("services") or [],
                "directors": [
                    {
                        "name": c.get("name"),
                        "designation": c.get("designation"),
                        "din": c.get("din"),
                        "phone": c.get("phone"),
                        "email": c.get("email"),
                    }
                    for c in contacts if c.get("name")
                ],
                "task_count": task_counts.get(cid, 0),
                "open_task_count": open_task_counts.get(cid, 0),
                "compliance_count": comp_counts.get(cid, 0),
                "pending_compliance_count": pending_comp_counts.get(cid, 0),
                "link": "/clients",
            })
        return results

    # ── Directors / individuals ────────────────────────────────────────────
    @staticmethod
    async def search_individuals(query: str, limit: int = 25) -> List[Dict[str, Any]]:
        """Matches a person's name/DIN inside any client's contact_persons,
        and returns one row per matching person (not per company)."""
        rx = _rx(query)
        docs = await db.clients.find(
            {"$or": [
                {"contact_persons.name": rx},
                {"contact_persons.din": rx},
                {"contact_persons.email": rx},
                {"contact_persons.phone": rx},
                {"dsc_details.holder_name": rx},
            ]},
            {"_id": 0, "id": 1, "company_name": 1, "assigned_to": 1,
             "contact_persons": 1, "dsc_details": 1},
        ).limit(limit).to_list(limit)
        if not docs:
            return []

        names = await _user_name_map([d.get("assigned_to") for d in docs])
        pattern = _rx(query)["$regex"]
        compiled = re.compile(pattern, re.I)

        rows: List[Dict[str, Any]] = []
        for d in docs:
            for c in d.get("contact_persons") or []:
                blob = " ".join(str(c.get(k) or "") for k in ("name", "din", "email", "phone", "designation"))
                if not compiled.search(blob):
                    continue
                rows.append({
                    "source": "individual",
                    "entity": "individual",
                    "id": f"{d.get('id')}::{c.get('name')}",
                    "client_id": d.get("id"),
                    "title": c.get("name") or "Unnamed person",
                    "subtitle": c.get("designation") or "Contact person",
                    "din": c.get("din"),
                    "email": c.get("email"),
                    "phone": c.get("phone"),
                    "company_name": d.get("company_name"),
                    "assigned_to": d.get("assigned_to"),
                    "assigned_to_name": names.get(d.get("assigned_to") or "", "Unassigned"),
                    "link": "/clients",
                })
            for dsc in d.get("dsc_details") or []:
                if dsc.get("holder_name") and compiled.search(str(dsc["holder_name"])):
                    rows.append({
                        "source": "individual",
                        "entity": "individual",
                        "id": f"{d.get('id')}::dsc::{dsc.get('certificate_number')}",
                        "client_id": d.get("id"),
                        "title": dsc.get("holder_name"),
                        "subtitle": "DSC holder",
                        "company_name": d.get("company_name"),
                        "expiry_date": dsc.get("expiry_date"),
                        "assigned_to": d.get("assigned_to"),
                        "assigned_to_name": names.get(d.get("assigned_to") or "", "Unassigned"),
                        "link": "/dsc",
                    })
        return rows[:limit]

    # ── Tasks ──────────────────────────────────────────────────────────────
    @staticmethod
    async def search_tasks(query: str, limit: int = 25) -> List[Dict[str, Any]]:
        # Tasks match either on their own text, or by belonging to a client
        # whose name matches ("show me everything for Desai Tech Weave").
        matched_clients = await db.clients.find(
            {"company_name": _rx(query)}, {"_id": 0, "id": 1, "company_name": 1}
        ).limit(50).to_list(50)
        client_names = {c["id"]: c.get("company_name") for c in matched_clients}

        or_clauses: List[Dict[str, Any]] = [{f: _rx(query)} for f in TASK_TEXT_FIELDS]
        if client_names:
            or_clauses.append({"client_id": {"$in": list(client_names.keys())}})

        docs = await db.tasks.find({"$or": or_clauses}, {"_id": 0}).limit(limit).to_list(limit)
        if not docs:
            return []

        names = await _user_name_map([d.get("assigned_to") for d in docs])
        missing = [d.get("client_id") for d in docs
                   if d.get("client_id") and d.get("client_id") not in client_names]
        if missing:
            for c in await db.clients.find(
                {"id": {"$in": sorted(set(missing))}}, {"_id": 0, "id": 1, "company_name": 1}
            ).to_list(len(missing)):
                client_names[c["id"]] = c.get("company_name")

        return [{
            "source": "task",
            "entity": "task",
            "id": d.get("id"),
            "title": d.get("title") or "Untitled task",
            "subtitle": client_names.get(d.get("client_id") or "", "") or "",
            "client_id": d.get("client_id"),
            "client_name": client_names.get(d.get("client_id") or ""),
            "status": d.get("status"),
            "priority": d.get("priority"),
            "due_date": d.get("due_date"),
            "assigned_to": d.get("assigned_to"),
            "assigned_to_name": names.get(d.get("assigned_to") or "", "Unassigned"),
            "link": "/tasks",
        } for d in docs]

    # ── Compliance ─────────────────────────────────────────────────────────
    @staticmethod
    async def search_compliance(query: str, limit: int = 25) -> List[Dict[str, Any]]:
        masters = await db.compliance_masters.find(
            {"$or": [{"name": _rx(query)}, {"description": _rx(query)}, {"category": _rx(query)}]},
            {"_id": 0, "id": 1, "name": 1, "due_date": 1, "category": 1},
        ).limit(50).to_list(50)
        master_by_id = {m["id"]: m for m in masters}

        or_clauses: List[Dict[str, Any]] = [{f: _rx(query)} for f in COMPLIANCE_TEXT_FIELDS]
        if master_by_id:
            or_clauses.append({"compliance_id": {"$in": list(master_by_id.keys())}})

        docs = await db.compliance_assignments.find(
            {"$or": or_clauses}, {"_id": 0}
        ).limit(limit).to_list(limit)
        if not docs:
            return []

        missing = [d.get("compliance_id") for d in docs
                   if d.get("compliance_id") and d.get("compliance_id") not in master_by_id]
        if missing:
            for m in await db.compliance_masters.find(
                {"id": {"$in": sorted(set(missing))}},
                {"_id": 0, "id": 1, "name": 1, "due_date": 1, "category": 1},
            ).to_list(len(missing)):
                master_by_id[m["id"]] = m

        names = await _user_name_map([d.get("assigned_to") for d in docs])
        return [{
            "source": "compliance",
            "entity": "compliance",
            "id": d.get("id"),
            "title": (master_by_id.get(d.get("compliance_id") or "", {}) or {}).get("name")
                     or "Compliance filing",
            "subtitle": d.get("client_name") or "",
            "client_id": d.get("client_id"),
            "client_name": d.get("client_name"),
            "compliance_id": d.get("compliance_id"),
            "category": (master_by_id.get(d.get("compliance_id") or "", {}) or {}).get("category"),
            "due_date": (master_by_id.get(d.get("compliance_id") or "", {}) or {}).get("due_date"),
            "status": d.get("status"),
            "assigned_to": d.get("assigned_to"),
            "assigned_to_name": names.get(d.get("assigned_to") or "", "Unassigned"),
            "notes": d.get("notes"),
            "link": "/compliance",
        } for d in docs]

    # ── 360° profile for a clicked client ─────────────────────────────────
    @staticmethod
    async def client_profile(client_id: str) -> Optional[Dict[str, Any]]:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            return None

        tasks = await db.tasks.find({"client_id": client_id}, {"_id": 0}).to_list(500)
        assignments = await db.compliance_assignments.find(
            {"client_id": client_id}, {"_id": 0}
        ).to_list(500)

        master_ids = sorted({a.get("compliance_id") for a in assignments if a.get("compliance_id")})
        masters = {}
        if master_ids:
            for m in await db.compliance_masters.find(
                {"id": {"$in": master_ids}},
                {"_id": 0, "id": 1, "name": 1, "due_date": 1, "category": 1, "frequency": 1},
            ).to_list(len(master_ids)):
                masters[m["id"]] = m

        names = await _user_name_map(
            [client.get("assigned_to")]
            + [t.get("assigned_to") for t in tasks]
            + [a.get("assigned_to") for a in assignments]
        )

        try:
            invoice_count = await db.invoices.count_documents({"client_id": client_id})
        except Exception:
            invoice_count = 0
        try:
            document_count = await db.documents.count_documents({"client_id": client_id})
        except Exception:
            document_count = 0

        return {
            "client": {
                "id": client.get("id"),
                "company_name": client.get("company_name"),
                "client_type": (client.get("client_type_label")
                                or (client.get("client_type") or "").replace("_", " ").title()),
                "status": client.get("status") or "active",
                "email": client.get("email"),
                "phone": client.get("phone"),
                "address": client.get("address"),
                "city": client.get("city"),
                "state": client.get("state"),
                "gstin": client.get("gstin") or client.get("gst_number"),
                "pan": client.get("pan") or client.get("pan_number"),
                "cin": client.get("cin") or client.get("llpin"),
                "date_of_incorporation": client.get("date_of_incorporation"),
                "services": client.get("services") or [],
                "assigned_to": client.get("assigned_to"),
                "assigned_to_name": names.get(client.get("assigned_to") or "", "Unassigned"),
                "notes": client.get("notes"),
            },
            "directors": [{
                "name": c.get("name"),
                "designation": c.get("designation"),
                "din": c.get("din"),
                "email": c.get("email"),
                "phone": c.get("phone"),
            } for c in (client.get("contact_persons") or []) if c.get("name")],
            "tasks": sorted([{
                "id": t.get("id"),
                "title": t.get("title"),
                "status": t.get("status"),
                "priority": t.get("priority"),
                "due_date": t.get("due_date"),
                "assigned_to_name": names.get(t.get("assigned_to") or "", "Unassigned"),
            } for t in tasks], key=lambda r: str(r.get("due_date") or "9999")),
            "compliances": sorted([{
                "id": a.get("id"),
                "name": (masters.get(a.get("compliance_id") or "", {}) or {}).get("name")
                        or "Compliance filing",
                "category": (masters.get(a.get("compliance_id") or "", {}) or {}).get("category"),
                "frequency": (masters.get(a.get("compliance_id") or "", {}) or {}).get("frequency"),
                "due_date": (masters.get(a.get("compliance_id") or "", {}) or {}).get("due_date"),
                "status": a.get("status"),
                "assigned_to_name": names.get(a.get("assigned_to") or "", "Unassigned"),
                "notes": a.get("notes"),
            } for a in assignments], key=lambda r: str(r.get("due_date") or "9999")),
            "stats": {
                "tasks_total": len(tasks),
                "tasks_open": sum(1 for t in tasks
                                  if (t.get("status") or "") not in ("completed", "closed", "cancelled")),
                "compliance_total": len(assignments),
                "compliance_pending": sum(1 for a in assignments
                                          if (a.get("status") or "") in ("not_started", "in_progress")),
                "invoices_total": invoice_count,
                "documents_total": document_count,
            },
        }
