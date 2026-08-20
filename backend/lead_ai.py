"""
Taskosphere AI Message Understanding Engine
===========================================

Channel-independent natural-language extraction engine.

Supported intents:
    - lead
    - client
    - invoice
    - quotation
    - task
    - my_tasks
    - unknown

This module:
    - Understands normal natural-language messages.
    - Works with Telegram and WhatsApp callers.
    - Extracts only information explicitly present in the message.
    - Leaves unavailable fields as blank strings / null.
    - Does NOT invent missing information.
    - Does NOT itself create invoices, quotations, clients or tasks.
    - Preserves the existing lead extraction / creation interfaces.

Actual database actions remain in the appropriate Telegram/backend modules.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

logger = logging.getLogger("lead_ai")


# =============================================================================
# CONFIGURATION
# =============================================================================

def _provider() -> str:
    selected = (os.environ.get("AI_PROVIDER") or "").strip().lower()

    if selected in {"gemini", "google", "google-ai"}:
        return "gemini"

    if selected == "groq":
        return "groq"

    if (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GOOGLE_AI_STUDIO_API_KEY")
    ):
        return "gemini"

    return "groq"


def _gemini_key() -> str:
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GOOGLE_AI_STUDIO_API_KEY")
        or ""
    ).strip()


def _gemini_model() -> str:
    """
    Current Gemini text model.

    Environment variable can override this.
    """
    return (
        os.environ.get("GEMINI_TEXT_MODEL")
        or os.environ.get("GEMINI_MODEL")
        or "gemini-3.6-flash"
    ).strip()


def _groq_key() -> str:
    return (os.environ.get("GROQ_API_KEY") or "").strip()


def _groq_model() -> str:
    return (
        os.environ.get("GROQ_TEXT_MODEL")
        or os.environ.get("GROQ_MODEL")
        or "llama-3.3-70b-versatile"
    ).strip()


def _confidence_threshold() -> float:
    try:
        value = float(
            os.environ.get(
                "LEAD_AI_CONFIDENCE_THRESHOLD",
                "0.70",
            )
        )
    except (TypeError, ValueError):
        value = 0.70

    return max(0.0, min(1.0, value))


# =============================================================================
# COMMON HELPERS
# =============================================================================

def _blank(value: Any) -> str:
    """
    Convert missing/empty values to a blank string.

    This is intentionally conservative. We never turn "later", "pending",
    "will share", etc. into an actual value.
    """
    if value is None:
        return ""

    value = str(value).strip()

    if value.lower() in {
        "",
        "null",
        "none",
        "n/a",
        "na",
        "not available",
        "not provided",
        "unknown",
        "nil",
        "-",
    }:
        return ""

    return value


def _nullable(value: Any) -> Optional[str]:
    value = _blank(value)
    return value if value else None


def _services(value: Any) -> List[str]:
    if value is None:
        return []

    if isinstance(value, str):
        items = re.split(
            r"[,;\n]+|(?:\s+and\s+)",
            value,
            flags=re.IGNORECASE,
        )
    elif isinstance(value, list):
        items = value
    else:
        items = [value]

    result: List[str] = []

    for item in items:
        item = _blank(item)

        if item and item not in result:
            result.append(item)

    return result


def _confidence(value: Any) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return 0.0

    if value > 1:
        value /= 100.0

    return max(0.0, min(1.0, value))


def _normalise_intent(value: Any) -> str:
    value = _blank(value).lower()

    aliases = {
        "leads": "lead",
        "new_lead": "lead",
        "add_lead": "lead",
        "prospect": "lead",
        "prospective_client": "lead",

        "clients": "client",
        "customer": "client",
        "customers": "client",
        "add_client": "client",

        "invoices": "invoice",
        "bill": "invoice",
        "billing": "invoice",
        "create_invoice": "invoice",

        "quotations": "quotation",
        "quote": "quotation",
        "quotes": "quotation",
        "estimate": "quotation",
        "create_quotation": "quotation",

        "tasks": "task",
        "add_task": "task",
        "create_task": "task",

        "my_task": "my_tasks",
        "mytask": "my_tasks",
        "mytasks": "my_tasks",
        "pending_tasks": "my_tasks",
        "show_tasks": "my_tasks",
        "list_tasks": "my_tasks",
    }

    return aliases.get(value, value)


# =============================================================================
# UNIVERSAL SYSTEM PROMPT
# =============================================================================

_SYSTEM_PROMPT = """
You are Taskosphere's natural-language business assistant.

Taskosphere is a CA/CS, trademark, compliance, accounting and business-services
ERP.

Read the user's message and determine what the user wants.

Supported intents:

1. lead
   A new prospective customer/business enquiry that should become a lead.

2. client
   Add/create/register an existing or identified customer/client.

3. invoice
   Create or prepare an invoice.

4. quotation
   Create or prepare a quotation.

5. task
   Create/add a task.

6. my_tasks
   User wants to see/list/check their own tasks.

7. unknown
   Anything that does not clearly belong to the above.

IMPORTANT RULES:

- Understand normal conversational English.
- Understand short messages.
- Understand spelling mistakes.
- Understand Indian English and Hinglish.
- Understand phrases such as:
  "add client",
  "make quotation",
  "create bill",
  "add task",
  "show my pending tasks".
- Do not require slash commands.
- Do not require labels.
- Do not require the words NEW LEAD.
- Never invent information.
- Never guess missing phone numbers.
- Never guess missing email addresses.
- Never guess GSTIN.
- Never guess amounts.
- Never guess dates.
- Never guess company names.
- Never guess names.
- Never guess services.
- If a value is not present, return an empty string "".
- Arrays should be [] when information is unavailable.
- Preserve the user's wording where practical.
- Do not convert "later", "will provide", "pending", etc. into actual values.
- If a field is missing, leave it blank.
- Confidence must represent confidence in the intent classification.
- Return JSON only.
- Do not return markdown.
- Do not explain the answer.

INTENT SELECTION:

If someone says:
"Rahul wants trademark registration"
this is a lead.

If someone says:
"Add ABC Pvt Ltd as client"
this is a client.

If someone says:
"Create invoice for ABC Pvt Ltd for 25000"
this is an invoice.

If someone says:
"Make quotation for ABC Pvt Ltd for trademark registration"
this is a quotation.

If someone says:
"Add task to file GST return tomorrow"
this is a task.

If someone says:
"Show my pending tasks"
this is my_tasks.

If the message is only:
"hello",
"thanks",
"okay",
"good morning",
or ordinary conversation,
intent is unknown.

Return exactly this JSON structure:

{
  "intent": "lead|client|invoice|quotation|task|my_tasks|unknown",
  "confidence": 0.0,
  "data": {
    "lead": {
      "company_name": "",
      "contact_name": "",
      "phone": "",
      "email": "",
      "services": [],
      "trademark_name": "",
      "notes": ""
    },

    "client": {
      "client_name": "",
      "company_name": "",
      "contact_name": "",
      "phone": "",
      "email": "",
      "gstin": "",
      "pan": "",
      "address": "",
      "city": "",
      "state": "",
      "pincode": "",
      "services": [],
      "notes": ""
    },

    "invoice": {
      "client_name": "",
      "company_name": "",
      "phone": "",
      "email": "",
      "invoice_number": "",
      "invoice_date": "",
      "due_date": "",
      "items": [],
      "description": "",
      "amount": "",
      "tax": "",
      "total_amount": "",
      "notes": ""
    },

    "quotation": {
      "client_name": "",
      "company_name": "",
      "phone": "",
      "email": "",
      "quotation_number": "",
      "quotation_date": "",
      "valid_until": "",
      "items": [],
      "description": "",
      "amount": "",
      "tax": "",
      "total_amount": "",
      "notes": ""
    },

    "task": {
      "title": "",
      "description": "",
      "assigned_to": "",
      "client_name": "",
      "priority": "",
      "due_date": "",
      "due_time": "",
      "notes": ""
    },

    "my_tasks": {
      "status": "",
      "priority": "",
      "date": "",
      "search": ""
    }
  }
}
""".strip()


def _build_prompt(message: str) -> str:
    return f"{_SYSTEM_PROMPT}\n\nUSER MESSAGE:\n{message.strip()}"


# =============================================================================
# JSON PARSING
# =============================================================================

def _extract_json_text(text: str) -> Dict[str, Any]:
    if not text:
        raise ValueError("AI returned an empty response")

    cleaned = str(text).strip()

    cleaned = re.sub(
        r"^```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(
        r"\s*```$",
        "",
        cleaned,
    )

    try:
        value = json.loads(cleaned)

        if isinstance(value, dict):
            return value

    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start >= 0 and end > start:
        try:
            value = json.loads(
                cleaned[start:end + 1]
            )

            if isinstance(value, dict):
                return value

        except json.JSONDecodeError:
            pass

    raise ValueError(
        "AI response did not contain valid JSON"
    )


# =============================================================================
# NORMALIZATION
# =============================================================================

def _normalise_data(raw: Dict[str, Any]) -> Dict[str, Any]:

    raw_data = raw.get("data")

    if not isinstance(raw_data, dict):
        raw_data = {}

    raw_lead = raw_data.get("lead")

    if not isinstance(raw_lead, dict):
        raw_lead = {}

    raw_client = raw_data.get("client")

    if not isinstance(raw_client, dict):
        raw_client = {}

    raw_invoice = raw_data.get("invoice")

    if not isinstance(raw_invoice, dict):
        raw_invoice = {}

    raw_quotation = raw_data.get("quotation")

    if not isinstance(raw_quotation, dict):
        raw_quotation = {}

    raw_task = raw_data.get("task")

    if not isinstance(raw_task, dict):
        raw_task = {}

    raw_my_tasks = raw_data.get("my_tasks")

    if not isinstance(raw_my_tasks, dict):
        raw_my_tasks = {}

    lead = {
        "company_name": _blank(
            raw_lead.get("company_name")
        ),
        "contact_name": _blank(
            raw_lead.get("contact_name")
        ),
        "phone": _blank(
            raw_lead.get("phone")
        ),
        "email": _blank(
            raw_lead.get("email")
        ),
        "services": _services(
            raw_lead.get("services")
        ),
        "trademark_name": _blank(
            raw_lead.get("trademark_name")
        ),
        "notes": _blank(
            raw_lead.get("notes")
        ),
    }

    client = {
        "client_name": _blank(
            raw_client.get("client_name")
        ),
        "company_name": _blank(
            raw_client.get("company_name")
        ),
        "contact_name": _blank(
            raw_client.get("contact_name")
        ),
        "phone": _blank(
            raw_client.get("phone")
        ),
        "email": _blank(
            raw_client.get("email")
        ),
        "gstin": _blank(
            raw_client.get("gstin")
        ),
        "pan": _blank(
            raw_client.get("pan")
        ),
        "address": _blank(
            raw_client.get("address")
        ),
        "city": _blank(
            raw_client.get("city")
        ),
        "state": _blank(
            raw_client.get("state")
        ),
        "pincode": _blank(
            raw_client.get("pincode")
        ),
        "services": _services(
            raw_client.get("services")
        ),
        "notes": _blank(
            raw_client.get("notes")
        ),
    }

    invoice = {
        "client_name": _blank(
            raw_invoice.get("client_name")
        ),
        "company_name": _blank(
            raw_invoice.get("company_name")
        ),
        "phone": _blank(
            raw_invoice.get("phone")
        ),
        "email": _blank(
            raw_invoice.get("email")
        ),
        "invoice_number": _blank(
            raw_invoice.get("invoice_number")
        ),
        "invoice_date": _blank(
            raw_invoice.get("invoice_date")
        ),
        "due_date": _blank(
            raw_invoice.get("due_date")
        ),
        "items": (
            raw_invoice.get("items")
            if isinstance(raw_invoice.get("items"), list)
            else []
        ),
        "description": _blank(
            raw_invoice.get("description")
        ),
        "amount": _blank(
            raw_invoice.get("amount")
        ),
        "tax": _blank(
            raw_invoice.get("tax")
        ),
        "total_amount": _blank(
            raw_invoice.get("total_amount")
        ),
        "notes": _blank(
            raw_invoice.get("notes")
        ),
    }

    quotation = {
        "client_name": _blank(
            raw_quotation.get("client_name")
        ),
        "company_name": _blank(
            raw_quotation.get("company_name")
        ),
        "phone": _blank(
            raw_quotation.get("phone")
        ),
        "email": _blank(
            raw_quotation.get("email")
        ),
        "quotation_number": _blank(
            raw_quotation.get("quotation_number")
        ),
        "quotation_date": _blank(
            raw_quotation.get("quotation_date")
        ),
        "valid_until": _blank(
            raw_quotation.get("valid_until")
        ),
        "items": (
            raw_quotation.get("items")
            if isinstance(raw_quotation.get("items"), list)
            else []
        ),
        "description": _blank(
            raw_quotation.get("description")
        ),
        "amount": _blank(
            raw_quotation.get("amount")
        ),
        "tax": _blank(
            raw_quotation.get("tax")
        ),
        "total_amount": _blank(
            raw_quotation.get("total_amount")
        ),
        "notes": _blank(
            raw_quotation.get("notes")
        ),
    }

    task = {
        "title": _blank(
            raw_task.get("title")
        ),
        "description": _blank(
            raw_task.get("description")
        ),
        "assigned_to": _blank(
            raw_task.get("assigned_to")
        ),
        "client_name": _blank(
            raw_task.get("client_name")
        ),
        "priority": _blank(
            raw_task.get("priority")
        ),
        "due_date": _blank(
            raw_task.get("due_date")
        ),
        "due_time": _blank(
            raw_task.get("due_time")
        ),
        "notes": _blank(
            raw_task.get("notes")
        ),
    }

    my_tasks = {
        "status": _blank(
            raw_my_tasks.get("status")
        ),
        "priority": _blank(
            raw_my_tasks.get("priority")
        ),
        "date": _blank(
            raw_my_tasks.get("date")
        ),
        "search": _blank(
            raw_my_tasks.get("search")
        ),
    }

    return {
        "lead": lead,
        "client": client,
        "invoice": invoice,
        "quotation": quotation,
        "task": task,
        "my_tasks": my_tasks,
    }


def _normalize_universal_result(
    raw: Dict[str, Any],
) -> Dict[str, Any]:

    intent = _normalise_intent(
        raw.get("intent")
    )

    allowed = {
        "lead",
        "client",
        "invoice",
        "quotation",
        "task",
        "my_tasks",
        "unknown",
    }

    if intent not in allowed:
        intent = "unknown"

    confidence = _confidence(
        raw.get("confidence")
    )

    return {
        "intent": intent,
        "confidence": confidence,
        "data": _normalise_data(raw),
    }


# =============================================================================
# GEMINI
# =============================================================================

async def _call_gemini(prompt: str) -> str:

    key = _gemini_key()

    if not key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key is not configured on the server.",
        )

    model = _gemini_model()

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent"
    )

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": prompt
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(
            timeout=45
        ) as client:

            response = await client.post(
                url,
                params={"key": key},
                headers={
                    "Content-Type": "application/json"
                },
                json=payload,
            )

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini connection error: {exc}",
        )

    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Gemini quota exceeded.",
        )

    if response.status_code != 200:

        raise HTTPException(
            status_code=422,
            detail=(
                f"Gemini API error {response.status_code}: "
                f"{response.text[:500]}"
            ),
        )

    try:
        data = response.json()

        parts = (
            data
            .get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )

        text = "".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict)
        )

        if not text:
            raise ValueError(
                "Gemini returned an empty response"
            )

        return text

    except Exception as exc:

        raise HTTPException(
            status_code=422,
            detail=f"Gemini response parsing error: {exc}",
        )


# =============================================================================
# GROQ
# =============================================================================

async def _call_groq(prompt: str) -> str:

    key = _groq_key()

    if not key:
        raise HTTPException(
            status_code=500,
            detail="Groq API key is not configured on the server.",
        )

    payload = {
        "model": _groq_model(),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a structured business ERP intent "
                    "classification engine. Return JSON only."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0,
        "max_tokens": 2048,
        "response_format": {
            "type": "json_object"
        },
    }

    try:
        async with httpx.AsyncClient(
            timeout=45
        ) as client:

            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=f"Groq connection error: {exc}",
        )

    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Groq quota exceeded.",
        )

    if response.status_code != 200:

        raise HTTPException(
            status_code=422,
            detail=(
                f"Groq API error {response.status_code}: "
                f"{response.text[:500]}"
            ),
        )

    try:
        data = response.json()

        return (
            data
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

    except Exception as exc:

        raise HTTPException(
            status_code=422,
            detail=f"Groq response parsing error: {exc}",
        )


# =============================================================================
# UNIVERSAL MESSAGE DETECTION
# =============================================================================

async def detect_intent(
    message: str,
    source: str = "unknown",
    source_chat_id: Optional[str] = None,
    source_sender_id: Optional[str] = None,
    source_sender_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Universal natural-language message classifier.

    This function only understands/extracts the request.
    It does not create or modify database records.
    """

    if not isinstance(message, str) or not message.strip():

        return {
            "intent": "unknown",
            "confidence": 1.0,
            "data": _normalise_data({}),
            "source": source,
            "source_chat_id": source_chat_id,
            "source_sender_id": source_sender_id,
            "source_sender_name": source_sender_name,
            "original_message": "",
        }

    message = message.strip()

    prompt = _build_prompt(message)

    provider = _provider()

    raw_text: Optional[str] = None
    first_error: Optional[Exception] = None

    try:

        if provider == "gemini":
            raw_text = await _call_gemini(prompt)
        else:
            raw_text = await _call_groq(prompt)

    except Exception as exc:

        first_error = exc

        try:

            if provider == "gemini" and _groq_key():

                logger.warning(
                    "Gemini universal AI failed; "
                    "falling back to Groq: %r",
                    exc,
                )

                raw_text = await _call_groq(prompt)

            elif provider == "groq" and _gemini_key():

                logger.warning(
                    "Groq universal AI failed; "
                    "falling back to Gemini: %r",
                    exc,
                )

                raw_text = await _call_gemini(prompt)

            else:
                raise

        except Exception:

            logger.exception(
                "Universal AI provider call failed"
            )

            if first_error is not None:
                raise first_error

            raise

    try:

        parsed = _extract_json_text(
            raw_text or ""
        )

        result = _normalize_universal_result(
            parsed
        )

        result.update(
            {
                "source": source,
                "source_chat_id": source_chat_id,
                "source_sender_id": source_sender_id,
                "source_sender_name": source_sender_name,
                "original_message": message,
            }
        )

        logger.info(
            "AI intent detected: %s confidence=%.2f source=%s",
            result["intent"],
            result["confidence"],
            source,
        )

        return result

    except Exception as exc:

        logger.exception(
            "Unable to parse universal AI response: %r",
            exc,
        )

        raise HTTPException(
            status_code=422,
            detail=(
                "AI returned an invalid Taskosphere "
                "message extraction response."
            ),
        )


# =============================================================================
# ACTION DATA HELPER
# =============================================================================

async def extract_action_data(
    message: str,
    source: str = "unknown",
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Alias intended for Telegram/WhatsApp action handlers.
    """

    return await detect_intent(
        message=message,
        source=source,
        **kwargs,
    )


# =============================================================================
# LEAD-SPECIFIC EXTRACTION
# =============================================================================

async def detect_and_extract_whatsapp_lead(
    message: str,
) -> Dict[str, Any]:
    """
    Existing WhatsApp-compatible lead extraction interface.

    Internally uses the universal classifier but returns the historical
    lead-oriented structure expected by existing callers.
    """

    result = await detect_intent(
        message=message,
        source="whatsapp",
    )

    if result.get("intent") != "lead":

        return {
            "is_lead": False,
            "confidence": result.get(
                "confidence",
                0.0,
            ),
            "lead": {
                "company_name": None,
                "contact_name": None,
                "email": None,
                "phone": None,
                "services": [],
                "trademark_name": None,
                "notes": None,
            },
        }

    data = result.get("data") or {}
    lead = data.get("lead") or {}

    confidence = _confidence(
        result.get("confidence")
    )

    useful = any(
        [
            lead.get("company_name"),
            lead.get("contact_name"),
            lead.get("email"),
            lead.get("phone"),
            lead.get("services"),
            lead.get("trademark_name"),
        ]
    )

    is_lead = (
        useful
        and confidence >= _confidence_threshold()
    )

    return {
        "is_lead": is_lead,
        "confidence": confidence,
        "lead": {
            "company_name": _nullable(
                lead.get("company_name")
            ),
            "contact_name": _nullable(
                lead.get("contact_name")
            ),
            "email": _nullable(
                lead.get("email")
            ),
            "phone": _nullable(
                lead.get("phone")
            ),
            "services": lead.get(
                "services"
            ) or [],
            "trademark_name": _nullable(
                lead.get("trademark_name")
            ),
            "notes": _nullable(
                lead.get("notes")
            ),
        },
    }


async def extract_whatsapp_lead(
    message: str,
) -> Dict[str, Any]:
    """
    Backward-compatible alias.
    """

    return await detect_and_extract_whatsapp_lead(
        message
    )


# =============================================================================
# LEAD CREATION — EXISTING COMPATIBILITY
# =============================================================================

async def create_lead_from_message(
    *,
    message: str,
    source: str,
    db,
    created_by: str,
    sender_phone: Optional[str] = None,
    sender_name: Optional[str] = None,
    whatsapp_group_jid: Optional[str] = None,
    whatsapp_group_name: Optional[str] = None,
    whatsapp_message_id: Optional[str] = None,
    telegram_chat_id: Optional[str] = None,
    min_confidence: float = 0.75,
) -> Dict[str, Any]:
    """
    Existing lead creation helper.

    This function intentionally remains database-aware for backward
    compatibility with the existing WhatsApp/Telegram lead flow.
    """

    result = await detect_intent(
        message=message,
        source=source,
        source_chat_id=telegram_chat_id,
        source_sender_name=sender_name,
    )

    if result.get("intent") != "lead":

        return {
            "created": False,
            "reason": "not_a_lead",
            "result": result,
        }

    try:

        confidence = float(
            result.get("confidence") or 0.0
        )

    except (
        TypeError,
        ValueError,
    ):

        confidence = 0.0

    if confidence < min_confidence:

        return {
            "created": False,
            "reason": "low_confidence",
            "result": result,
        }

    data = result.get("data") or {}
    lead = data.get("lead") or {}

    phone = (
        _blank(lead.get("phone"))
        or _blank(sender_phone)
        or None
    )

    contact_name = (
        _blank(lead.get("contact_name"))
        or _blank(sender_name)
        or None
    )

    company_name = (
        _blank(lead.get("company_name"))
        or None
    )

    trademark_name = (
        _blank(lead.get("trademark_name"))
        or None
    )

    services = lead.get(
        "services"
    ) or []

    notes = (
        _blank(lead.get("notes"))
        or None
    )

    # Preserve historical compatibility with Lead Management.
    # No arbitrary company name is generated.
    if not company_name:

        company_name = (
            contact_name
            or trademark_name
            or (
                "WhatsApp Lead"
                if source == "whatsapp"
                else "Telegram Lead"
            )
        )

    existing = None

    # -------------------------------------------------------------------------
    # Phone duplicate check
    # -------------------------------------------------------------------------

    if phone:

        digits = "".join(
            ch
            for ch in phone
            if ch.isdigit()
        )

        if len(digits) >= 7:

            existing = await db.leads.find_one(
                {
                    "phone": {
                        "$regex": (
                            digits[-10:]
                            + "$"
                        )
                    }
                }
            )

    # -------------------------------------------------------------------------
    # Name/company/trademark duplicate check
    # -------------------------------------------------------------------------

    if not existing and contact_name:

        query = {
            "contact_name": {
                "$regex": (
                    "^"
                    + re.escape(contact_name)
                    + "$"
                ),
                "$options": "i",
            }
        }

        if trademark_name:

            query[
                "trademark_name"
            ] = {
                "$regex": (
                    "^"
                    + re.escape(trademark_name)
                    + "$"
                ),
                "$options": "i",
            }

        elif company_name:

            query[
                "company_name"
            ] = {
                "$regex": (
                    "^"
                    + re.escape(company_name)
                    + "$"
                ),
                "$options": "i",
            }

        existing = await db.leads.find_one(
            query
        )

    now = datetime.now(
        timezone.utc
    )

    # -------------------------------------------------------------------------
    # Existing lead
    # -------------------------------------------------------------------------

    if existing:

        update = {
            "updated_at": now
        }

        if services:

            merged = list(
                dict.fromkeys(
                    (
                        existing.get(
                            "services"
                        )
                        or []
                    )
                    + services
                )
            )

            update["services"] = merged

        if notes:

            old_notes = (
                existing.get(
                    "notes"
                )
                or ""
            )

            update["notes"] = (
                f"{old_notes}\n{notes}"
            ).strip()

        if source == "whatsapp":

            update.update(
                {
                    "whatsapp_group_jid":
                        whatsapp_group_jid,

                    "whatsapp_group_name":
                        whatsapp_group_name,

                    "whatsapp_message_id":
                        whatsapp_message_id,

                    "whatsapp_sender_phone":
                        sender_phone,

                    "whatsapp_sender_name":
                        sender_name,

                    "whatsapp_original_message":
                        message,
                }
            )

        elif source == "telegram":

            update[
                "telegram_chat_id"
            ] = (
                str(telegram_chat_id)
                if telegram_chat_id is not None
                else None
            )

            update[
                "telegram_original_message"
            ] = message

        await db.leads.update_one(
            {
                "_id":
                    existing["_id"]
            },
            {
                "$set":
                    update
            },
        )

        return {
            "created": False,
            "updated": True,
            "lead_id":
                str(existing["_id"]),
            "result":
                result,
        }

    # -------------------------------------------------------------------------
    # New lead
    # -------------------------------------------------------------------------

    doc = {
        "company_name":
            company_name,

        "contact_name":
            contact_name,

        "email":
            _nullable(
                lead.get("email")
            ),

        "phone":
            phone,

        "services":
            services,

        "status":
            "new",

        "source":
            source,

        "notes":
            notes,

        "assigned_to":
            None,

        "created_by":
            created_by,

        "created_at":
            now,

        "updated_at":
            now,

        "trademark_name":
            trademark_name,
    }

    if source == "whatsapp":

        doc.update(
            {
                "whatsapp_group_jid":
                    whatsapp_group_jid,

                "whatsapp_group_name":
                    whatsapp_group_name,

                "whatsapp_message_id":
                    whatsapp_message_id,

                "whatsapp_sender_phone":
                    sender_phone,

                "whatsapp_sender_name":
                    sender_name,

                "whatsapp_original_message":
                    message,
            }
        )

    elif source == "telegram":

        doc.update(
            {
                "telegram_chat_id":
                    (
                        str(telegram_chat_id)
                        if telegram_chat_id
                        is not None
                        else None
                    ),

                "telegram_original_message":
                    message,
            }
        )

    inserted = await db.leads.insert_one(
        doc
    )

    return {
        "created": True,
        "updated": False,
        "lead_id":
            str(inserted.inserted_id),
        "result":
            result,
    }


# =============================================================================
# GENERIC BACKWARD-COMPATIBLE PROCESSOR
# =============================================================================

async def process_lead_message(
    message: str,
    source: str = "unknown",
    source_chat_id: Optional[str] = None,
    source_sender_id: Optional[str] = None,
    source_sender_name: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Main generic entry point.

    IMPORTANT:
    Existing callers that previously used:

        await process_lead_message(message)

    continue to work.

    New Telegram/WhatsApp callers can provide source metadata.

    For backwards compatibility, this function returns the lead-oriented
    result when the detected intent is lead.

    For other intents, it returns the universal intent result.
    """

    result = await detect_intent(
        message=message,
        source=source,
        source_chat_id=source_chat_id,
        source_sender_id=source_sender_id,
        source_sender_name=source_sender_name,
    )

    # -------------------------------------------------------------------------
    # Preserve old lead API shape
    # -------------------------------------------------------------------------

    if result.get("intent") == "lead":

        data = result.get(
            "data"
        ) or {}

        lead = data.get(
            "lead"
        ) or {}

        confidence = _confidence(
            result.get("confidence")
        )

        useful = any(
            [
                lead.get(
                    "company_name"
                ),
                lead.get(
                    "contact_name"
                ),
                lead.get(
                    "email"
                ),
                lead.get(
                    "phone"
                ),
                lead.get(
                    "services"
                ),
                lead.get(
                    "trademark_name"
                ),
            ]
        )

        return {
            "is_lead": (
                useful
                and confidence
                >= _confidence_threshold()
            ),
            "confidence":
                confidence,
            "lead": {
                "company_name":
                    _nullable(
                        lead.get(
                            "company_name"
                        )
                    ),

                "contact_name":
                    _nullable(
                        lead.get(
                            "contact_name"
                        )
                    ),

                "email":
                    _nullable(
                        lead.get(
                            "email"
                        )
                    ),

                "phone":
                    _nullable(
                        lead.get(
                            "phone"
                        )
                    ),

                "services":
                    lead.get(
                        "services"
                    ) or [],

                "trademark_name":
                    _nullable(
                        lead.get(
                            "trademark_name"
                        )
                    ),

                "notes":
                    _nullable(
                        lead.get(
                            "notes"
                        )
                    ),
            },

            "intent":
                "lead",

            "source":
                source,

            "source_chat_id":
                source_chat_id,

            "source_sender_id":
                source_sender_id,

            "source_sender_name":
                source_sender_name,

            "original_message":
                message.strip(),
        }

    # -------------------------------------------------------------------------
    # New universal action result
    # -------------------------------------------------------------------------

    result.update(
        {
            "source":
                source,

            "source_chat_id":
                source_chat_id,

            "source_sender_id":
                source_sender_id,

            "source_sender_name":
                source_sender_name,

            "original_message":
                message.strip(),
        }
    )

    return result


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

async def detect_lead(
    message: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Explicit lead detection alias.
    """

    return await detect_and_extract_whatsapp_lead(
        message
    )


async def detect_client(
    message: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Extract client information from a message.
    """

    result = await detect_intent(
        message=message,
        source=kwargs.pop(
            "source",
            "unknown",
        ),
        **kwargs,
    )

    return result


async def detect_invoice(
    message: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Extract invoice information from a message.
    """

    result = await detect_intent(
        message=message,
        source=kwargs.pop(
            "source",
            "unknown",
        ),
        **kwargs,
    )

    return result


async def detect_quotation(
    message: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Extract quotation information from a message.
    """

    result = await detect_intent(
        message=message,
        source=kwargs.pop(
            "source",
            "unknown",
        ),
        **kwargs,
    )

    return result


async def detect_task(
    message: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Extract task information from a message.
    """

    result = await detect_intent(
        message=message,
        source=kwargs.pop(
            "source",
            "unknown",
        ),
        **kwargs,
    )

    return result


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    "detect_intent",
    "extract_action_data",

    "detect_and_extract_whatsapp_lead",
    "extract_whatsapp_lead",
    "detect_lead",

    "detect_client",
    "detect_invoice",
    "detect_quotation",
    "detect_task",

    "create_lead_from_message",
    "process_lead_message",
]
