"""
Employee Interviews module.

Lets HR/admin staff log every candidate interviewed, the pay scale offered,
conditions, training period, department & experience — then, once a
candidate is hired, convert them straight into a system User without
re-typing anything (all fields pre-filled from the interview record but
fully editable before the account is created).
"""
import io
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from bson import ObjectId

from backend.dependencies import db, get_current_user, create_audit_log, _get_perm

router = APIRouter(prefix="/interviews", tags=["Employee Interviews"])
logger = logging.getLogger(__name__)


# ====================== PERMISSIONS ======================

def _can_manage(current_user) -> bool:
    """Admin, or anyone with the can_manage_users flag, can manage interviews."""
    if getattr(current_user, "role", None) == "admin":
        return True
    return bool(_get_perm(current_user, "can_manage_users"))


def assert_can_manage(current_user):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to manage employee interviews")


# ====================== MODELS ======================

class CandidateBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    full_name: str = Field(..., description="Candidate's full name")
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    position: Optional[str] = Field(None, description="Role applied for / interviewed for")
    department: Optional[str] = None
    experience_years: Optional[float] = None
    current_company: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    education: Optional[str] = None

    interview_date: Optional[str] = None  # ISO date (YYYY-MM-DD)
    interview_time: Optional[str] = None  # HH:MM (24h)
    interviewer: Optional[str] = None

    attendance: Literal["pending", "attended", "not_attended"] = "pending"
    interview_feedback: Optional[str] = None

    pay_scale_offered: Optional[str] = None
    conditions: Optional[str] = None
    training_period: Optional[str] = None

    status: Literal[
        "scheduled", "in_review", "selected", "on_hold", "rejected", "hired"
    ] = "scheduled"

    notes: Optional[str] = None
    resume_filename: Optional[str] = None
    resume_text: Optional[str] = None

    @field_validator("email", "phone", "position", "department", "current_company",
                      "education", "interview_date", "interview_time", "interviewer",
                      "interview_feedback", "pay_scale_offered",
                      "conditions", "training_period", "notes", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return None if v == "" else v

    @field_validator("experience_years", mode="before")
    @classmethod
    def exp_to_float(cls, v):
        if v in ("", None):
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    @field_validator("skills", mode="before")
    @classmethod
    def skills_to_list(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v or []


class CandidateCreate(CandidateBase):
    pass


class CandidateUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    experience_years: Optional[float] = None
    current_company: Optional[str] = None
    skills: Optional[List[str]] = None
    education: Optional[str] = None
    interview_date: Optional[str] = None
    interview_time: Optional[str] = None
    interviewer: Optional[str] = None
    attendance: Optional[Literal["pending", "attended", "not_attended"]] = None
    interview_feedback: Optional[str] = None
    pay_scale_offered: Optional[str] = None
    conditions: Optional[str] = None
    training_period: Optional[str] = None
    status: Optional[Literal[
        "scheduled", "in_review", "selected", "on_hold", "rejected", "hired"
    ]] = None
    notes: Optional[str] = None


class ConvertToUserRequest(BaseModel):
    """Sent by the frontend conversion dialog — every field is editable there
    before submission, even though it's pre-filled from the candidate record."""
    full_name: str
    email: EmailStr
    password: str
    role: str = "staff"
    departments: List[str] = Field(default_factory=list)
    phone: Optional[str] = None
    punch_in_time: Optional[str] = "10:30"
    grace_time: Optional[str] = "00:10"
    punch_out_time: Optional[str] = "19:00"


# ====================== HELPERS ======================

def normalize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


def validate_obj_id(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid candidate ID")
    return ObjectId(id_str)


# Lightweight resume field extraction (regex) used as a fallback / supplement
# to whatever the AI model returns, so basic contact details are never missed.
_EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s-]?)?\d{10}")


def _regex_fields(text: str) -> dict:
    out = {}
    m = _EMAIL_RE.search(text)
    if m:
        out["email"] = m.group(0)
    m = _PHONE_RE.search(text)
    if m:
        out["phone"] = m.group(0)
    return out


def _heuristic_fields(text: str) -> dict:
    """Section-aware heuristic extraction that works with NO external AI call.
    Used to fill any gaps the AI model leaves (or as the sole source if the
    AI call fails / no API key is configured), so parsing stays useful for
    any resume layout — not just ones the model happens to handle well."""
    import calendar
    from datetime import date as ddate

    out = {}
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return out

    # ── Name: first short, mostly-alphabetic line near the top ──────────────
    for l in lines[:6]:
        if "@" in l or any(ch.isdigit() for ch in l):
            continue
        words = l.split()
        if 1 <= len(words) <= 5 and all(re.match(r"^[A-Za-z.\-']+$", w) for w in words):
            out["full_name"] = l.title() if l.isupper() else l
            break

    # ── Split into sections by common resume headings ────────────────────────
    section_pat = re.compile(
        r"^(SUMMARY|OBJECTIVE|PROFILE|WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT( HISTORY)?|"
        r"EDUCATION|KEY SKILLS|SKILLS|TECHNICAL SKILLS|PROJECTS|CERTIFICATIONS)\s*$",
        re.I,
    )
    sections, current, buf = {}, "header", []
    for l in lines:
        if section_pat.match(l):
            sections[current] = buf
            current = l.lower().strip()
            buf = []
        else:
            buf.append(l)
    sections[current] = buf

    def _get_section(*names):
        for n in names:
            if n in sections:
                return sections[n]
        return []

    exp_lines = _get_section("work experience", "experience", "employment", "employment history")
    if exp_lines:
        first = exp_lines[0]
        m = re.search(r"(.+?)\bat\b\s*(.+)", first, re.I)
        if m:
            out["position"] = m.group(1).strip(" ,")
            out["current_company"] = re.split(r"\s{2,}", m.group(2))[0].strip(" .")
        else:
            out["position"] = first.split(",")[0].strip()

        # Estimate total experience by summing every "Mon YYYY - Mon YYYY" style range
        date_re = re.compile(
            r"([A-Za-z]{3,9})\s+(\d{4})\s*[-–to]+\s*([A-Za-z]{3,9}|present)\s*(\d{4})?", re.I
        )

        def month_num(name):
            name = name[:3].title()
            try:
                return list(calendar.month_abbr).index(name)
            except ValueError:
                return None

        months_total = 0
        for l in exp_lines:
            m2 = date_re.search(l)
            if not m2:
                continue
            m1n, y1 = month_num(m2.group(1)), int(m2.group(2))
            if m1n is None:
                continue
            if m2.group(3).lower() == "present":
                end = ddate.today()
            else:
                m2n = month_num(m2.group(3))
                if m2n is None:
                    continue
                end = ddate(int(m2.group(4) or y1), m2n, 1)
            start = ddate(y1, m1n, 1)
            months = (end.year - start.year) * 12 + (end.month - start.month)
            if months > 0:
                months_total += months
        if months_total:
            out["experience_years"] = round(months_total / 12, 1)

    edu_lines = _get_section("education")
    if edu_lines:
        out["education"] = "; ".join(edu_lines[:4])

    skill_lines = _get_section("key skills", "skills", "technical skills")
    if skill_lines:
        skills = []
        for l in skill_lines:
            skills.extend([p.strip() for p in re.split(r",|•|;", l) if p.strip()])
        if skills:
            out["skills"] = skills[:15]

    dep_map = [
        ("trademark", "TM"), ("legal", "Legal"), ("law", "Legal"),
        ("account", "ACC"), ("finance", "ACC"), ("tax", "TDS"), ("gst", "GST"),
        ("roc", "ROC"), ("compliance", "ROC"), ("software", "IT"), ("developer", "IT"),
        ("information technology", "IT"), ("human resource", "HR"), (" hr ", "HR"),
        ("marketing", "Marketing"), ("sales", "Sales"), ("operations", "Operations"),
    ]
    haystack = f" {out.get('position', '')} {' '.join(out.get('skills', []))} ".lower()
    for kw, dep in dep_map:
        if kw in haystack:
            out["department"] = dep
            break

    return out


async def _extract_resume_text(contents: bytes, filename: str) -> str:
    """Extract text from PDF/DOCX/TXT resume with table support."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages[:10]:
                # Extract plain text
                t = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                # Extract tables and append as structured text
                for table in page.extract_tables():
                    rows = []
                    for row in table:
                        cells = [str(c).strip() if c else "" for c in row]
                        if any(cells):
                            rows.append(" | ".join(cells))
                    if rows:
                        t += "\n" + "\n".join(rows)
                if t.strip():
                    text_parts.append(t)
        text = "\n\n".join(text_parts).strip()
        if text:
            return text
        # Scanned PDF — send first page as image to Claude vision
        try:
            import base64
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                pil_img = pdf.pages[0].to_image(resolution=150).original
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode()
            import httpx
            resp = await httpx.AsyncClient(timeout=30).post(
                "https://api.anthropic.com/v1/messages",
                headers={"content-type": "application/json"},
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 2000,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                            {"type": "text", "text": "Transcribe ALL text from this resume image exactly as it appears, preserving structure."}
                        ]
                    }]
                }
            )
            data = resp.json()
            return data["content"][0]["text"]
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read scanned resume: {e}")

    if ext == "docx":
        try:
            import docx
            d = docx.Document(io.BytesIO(contents))
            parts = [p.text for p in d.paragraphs if p.text.strip()]
            for table in d.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
            return "\n".join(parts)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read .docx resume: {e}")

    if ext == "txt":
        return contents.decode("utf-8", errors="replace")

    raise HTTPException(status_code=422, detail=f"Unsupported format: .{ext}. Upload PDF, DOCX, or TXT.")


async def _ai_structure_resume(resume_text: str) -> dict:
    """Use Claude API to extract structured fields from resume text."""
    import json
    import httpx

    prompt = (
        "Extract candidate details from this resume and respond with ONLY valid JSON "
        "(no markdown, no explanation) with these exact keys:\n"
        '{"full_name":"","email":"","phone":"","position":"","department":"",'
        '"experience_years":0,"current_company":"","skills":[],"education":""}\n\n'
        "Rules:\n"
        "- full_name: the person's full name (usually the largest text at the top)\n"
        "- position: most recent or primary job title\n"
        "- department: one of Sales, IT, HR, Accounts, Legal, Marketing, Operations, GST, TDS, ROC, TM, Other\n"
        "- experience_years: total years as a number (sum from work history dates if needed)\n"
        "- skills: array of concise skill keywords (max 15)\n"
        "- education: most relevant degree/qualification as a short string\n"
        "- Leave blank/0/[] if genuinely not found. Never invent data.\n\n"
        f"RESUME:\n{resume_text[:12000]}"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"content-type": "application/json"},
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}]
            }
        )
    data = resp.json()
    raw = (data.get("content") or [{}])[0].get("text", "").strip()
    raw = re.sub(r"^```(json)?|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except Exception:
        logger.warning(f"Claude JSON parse failed, raw: {raw[:200]}")
        return {}


# ====================== ROUTES ======================

@router.get("")
async def list_candidates(
    status_filter: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    assert_can_manage(current_user)
    query = {}
    if status_filter:
        query["status"] = status_filter
    if department:
        query["department"] = department
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"email": rx}, {"phone": rx}, {"position": rx}]

    docs = await db.interview_candidates.find(query).sort("created_at", -1).to_list(1000)
    return [normalize_doc(d) for d in docs]


@router.get("/{candidate_id}")
async def get_candidate(candidate_id: str, current_user=Depends(get_current_user)):
    assert_can_manage(current_user)
    doc = await db.interview_candidates.find_one({"_id": validate_obj_id(candidate_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return normalize_doc(doc)


@router.post("")
async def create_candidate(payload: CandidateCreate, current_user=Depends(get_current_user)):
    assert_can_manage(current_user)
    doc = payload.model_dump()
    doc.update({
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "converted_user_id": None,
    })
    result = await db.interview_candidates.insert_one(doc)
    new_doc = await db.interview_candidates.find_one({"_id": result.inserted_id})
    await create_audit_log(current_user, "create", "interview_candidate", str(result.inserted_id), new_data=doc)
    return normalize_doc(new_doc)


@router.put("/{candidate_id}")
async def update_candidate(candidate_id: str, payload: CandidateUpdate, current_user=Depends(get_current_user)):
    assert_can_manage(current_user)
    oid = validate_obj_id(candidate_id)
    existing = await db.interview_candidates.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Candidate not found")

    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.interview_candidates.update_one({"_id": oid}, {"$set": update_data})

    updated = await db.interview_candidates.find_one({"_id": oid})
    await create_audit_log(current_user, "update", "interview_candidate", candidate_id, old_data=existing, new_data=update_data)
    return normalize_doc(updated)


@router.delete("/{candidate_id}")
async def delete_candidate(candidate_id: str, current_user=Depends(get_current_user)):
    assert_can_manage(current_user)
    oid = validate_obj_id(candidate_id)
    existing = await db.interview_candidates.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Candidate not found")
    await db.interview_candidates.delete_one({"_id": oid})
    await create_audit_log(current_user, "delete", "interview_candidate", candidate_id, old_data=existing)
    return {"message": "Candidate deleted"}


@router.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    """Extracts text from an uploaded resume and returns structured candidate
    fields the frontend can drop straight into the Add Candidate form."""
    assert_can_manage(current_user)
    contents = await file.read()
    filename = file.filename or "resume"

    resume_text = await _extract_resume_text(contents, filename)
    if not resume_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from this resume")

    try:
        ai_fields = await _ai_structure_resume(resume_text)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"AI resume structuring failed, falling back to heuristics: {e}")
        ai_fields = {}

    regex_f = _regex_fields(resume_text)
    heuristic_f = _heuristic_fields(resume_text)

    def first(*vals):
        for v in vals:
            if v and str(v).strip():
                return v
        return ""

    fields = {
        "full_name": first(ai_fields.get("full_name"), heuristic_f.get("full_name")),
        "email": first(ai_fields.get("email"), regex_f.get("email"), heuristic_f.get("email")),
        "phone": first(ai_fields.get("phone"), regex_f.get("phone"), heuristic_f.get("phone")),
        "position": first(ai_fields.get("position"), heuristic_f.get("position")),
        "department": first(ai_fields.get("department"), heuristic_f.get("department")),
        "experience_years": ai_fields.get("experience_years") or heuristic_f.get("experience_years") or None,
        "current_company": first(ai_fields.get("current_company"), heuristic_f.get("current_company")),
        "skills": ai_fields.get("skills") or heuristic_f.get("skills") or [],
        "education": first(ai_fields.get("education"), heuristic_f.get("education")),
    }

    return {
        "filename": filename,
        "resume_text": resume_text[:20000],
        "fields": fields,
    }


@router.post("/{candidate_id}/convert-to-user")
async def convert_to_user(candidate_id: str, payload: ConvertToUserRequest, current_user=Depends(get_current_user)):
    """Creates a real system User account from a hired candidate.
    All fields arrive from the (editable) conversion form on the frontend —
    nothing here is silently reused from the interview record."""
    assert_can_manage(current_user)
    oid = validate_obj_id(candidate_id)
    candidate = await db.interview_candidates.find_one({"_id": oid})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.get("converted_user_id"):
        raise HTTPException(status_code=400, detail="This candidate has already been converted to a user")

    existing_user = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    # Late imports avoid a circular import with backend.server at module load time
    from backend.server import get_password_hash, DEFAULT_ROLE_PERMISSIONS

    if payload.role in ("admin", "manager", "superadmin") and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can assign that role")

    user_id = str(uuid.uuid4())
    default_permissions = DEFAULT_ROLE_PERMISSIONS.get(payload.role, {})

    new_user = {
        "id": user_id,
        "email": payload.email,
        "full_name": payload.full_name,
        "role": payload.role,
        "password": get_password_hash(payload.password),
        "departments": payload.departments or [],
        "phone": payload.phone,
        "punch_in_time": payload.punch_in_time or "10:30",
        "grace_time": payload.grace_time or "00:10",
        "punch_out_time": payload.punch_out_time or "19:00",
        "is_active": False,
        "status": "pending_approval",
        "approved_by": None,
        "approved_at": None,
        "permissions": default_permissions,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_candidate_id": str(oid),
    }
    await db.users.insert_one(new_user)

    await db.interview_candidates.update_one(
        {"_id": oid},
        {"$set": {
            "status": "hired",
            "converted_user_id": user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    await create_audit_log(current_user, "convert_to_user", "interview_candidate", candidate_id, new_data={"user_id": user_id})

    new_user.pop("password", None)
    new_user.pop("_id", None)
    return {"message": "Candidate converted to user — pending admin approval", "user": new_user}
