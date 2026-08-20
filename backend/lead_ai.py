"""
Common AI Lead Extraction Engine for Taskosphere.

This module only classifies/extracts lead information. It does not write to
MongoDB and does not replace existing Telegram Q&A or WhatsApp functionality.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional

try:
    import httpx
except Exception:
    httpx = None

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_MODEL = os.getenv("LEAD_AI_GEMINI_MODEL", "gemini-2.0-flash")
GROQ_MODEL = os.getenv("LEAD_AI_GROQ_MODEL", "llama-3.3-70b-versatile")
DEFAULT_CONFIDENCE_THRESHOLD = float(
    os.getenv("LEAD_AI_CONFIDENCE_THRESHOLD", "0.80")
)


def _clean(value: Any) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    if not value or value.lower() in {
        "na", "n/a", "none", "null", "not available",
        "not provided", "unknown", "later", "-"
    }:
        return None
    return value


def _normalise_services(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"[,;\n+]|(?:\s+and\s+)", value, flags=re.I)
    elif isinstance(value, list):
        parts = value
    else:
        parts = [value]

    result = []
    for item in parts:
        item = _clean(item)
        if item and item not in result:
            result.append(item)
    return result


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    except Exception:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return {}
        try:
            value = json.loads(match.group(0))
            return value if isinstance(value, dict) else {}
        except Exception:
            return {}


def _build_prompt(message: str) -> str:
    return f"""
You are the lead-intake classifier for a CA/CS, trademark and business-services ERP.

Read the message as natural language. Do not require a fixed template, labels,
the words "NEW LEAD", or a special command.

Determine whether it describes a genuine prospective client/business lead.
Normal greetings, casual chat, internal messages, status messages, and general
questions are NOT leads unless they clearly identify a prospective client or
business requirement.

Extract ONLY facts explicitly stated. NEVER invent missing information.
If company name is absent, company_name must be null.
If mobile is absent or says it will be added later, phone must be null.
If trademark name is absent, trademark_name must be null.
Multiple services must be separate items.

Return ONLY valid JSON:

{{
  "is_lead": true,
  "confidence": 0.95,
  "lead": {{
    "contact_name": null,
    "company_name": null,
    "phone": null,
    "email": null,
    "services": [],
    "trademark_name": null,
    "company_name_requested": null,
    "next_follow_up": null,
    "quotation_amount": null,
    "notes": null
  }}
}}

For a non-lead:
{{
  "is_lead": false,
  "confidence": 0.95,
  "lead": null
}}

Message:
{message}
""".strip()


async def _call_gemini(prompt: str) -> Optional[str]:
    if not GEMINI_API_KEY or httpx is None:
        return None
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
        )
    except Exception as exc:
        print(f"[Lead AI] Gemini error: {exc}")
        return None


async def _call_groq(prompt: str) -> Optional[str]:
    if not GROQ_API_KEY or httpx is None:
        return None
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": GROQ_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Extract structured business leads. Return JSON only. "
                    "Never invent missing information."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
        )
    except Exception as exc:
        print(f"[Lead AI] Groq error: {exc}")
        return None


def _normalise_result(raw: Dict[str, Any]) -> Dict[str, Any]:
    is_lead = bool(raw.get("is_lead"))
    try:
        confidence = float(raw.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    if confidence > 1:
        confidence /= 100.0
    confidence = max(0.0, min(1.0, confidence))

    lead = raw.get("lead")
    if not isinstance(lead, dict):
        lead = {}

    result = {
        "is_lead": is_lead and confidence >= DEFAULT_CONFIDENCE_THRESHOLD,
        "confidence": confidence,
        "lead": {
            "contact_name": _clean(
                lead.get("contact_name") or lead.get("lead_from")
            ),
            "company_name": _clean(lead.get("company_name")),
            "phone": _clean(lead.get("phone") or lead.get("mobile")),
            "email": _clean(lead.get("email")),
            "services": _normalise_services(
                lead.get("services") or lead.get("requirements")
            ),
            "trademark_name": _clean(lead.get("trademark_name")),
            "company_name_requested": _clean(
                lead.get("company_name_requested")
            ),
            "next_follow_up": _clean(lead.get("next_follow_up")),
            "quotation_amount": lead.get("quotation_amount"),
            "notes": _clean(lead.get("notes")),
        },
    }
    if not result["is_lead"]:
        result["lead"] = None
    return result


async def process_lead_message(
    message: str,
    source: str = "unknown",
    source_chat_id: Optional[str] = None,
    source_sender_id: Optional[str] = None,
    source_sender_name: Optional[str] = None,
) -> Dict[str, Any]:
    if not isinstance(message, str) or not message.strip():
        return {"is_lead": False, "confidence": 1.0, "lead": None}

    prompt = _build_prompt(message.strip())
    raw_text = await _call_gemini(prompt)
    if not raw_text:
        raw_text = await _call_groq(prompt)

    if not raw_text:
        return {
            "is_lead": False,
            "confidence": 0.0,
            "lead": None,
            "error": "No configured AI provider was available.",
        }

    result = _normalise_result(_extract_json(raw_text))
    result.update({
        "source": source,
        "source_chat_id": source_chat_id,
        "source_sender_id": source_sender_id,
        "source_sender_name": source_sender_name,
        "original_message": message.strip(),
    })
    return result


async def detect_and_extract_lead(
    message: str,
    source: str = "unknown",
    **kwargs: Any,
) -> Dict[str, Any]:
    return await process_lead_message(message=message, source=source, **kwargs)


__all__ = ["process_lead_message", "detect_and_extract_lead"]
