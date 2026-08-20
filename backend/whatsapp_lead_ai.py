"""
WhatsApp Natural-Language Lead AI
=================================

Additive module for Taskosphere's WhatsApp automation.

Purpose:
    Read a normal WhatsApp message and determine whether it describes a
    business lead. If it does, extract lead information into a stable JSON
    structure that can be consumed by the existing Lead Management code.

Important preservation rules:
    - This module does not modify Telegram functionality.
    - This module does not modify the existing WhatsApp connection/webhook.
    - It does not create database records by itself.
    - It never invents missing lead information.
    - Existing AI provider settings are respected where possible.

Example input:
    "Lead from Kavi Vakaria for trademark registration and company formation,
     mobile to be added later, trademark name After World."

Example result:
    {
        "is_lead": true,
        "confidence": 0.96,
        "lead": {
            "company_name": null,
            "contact_name": "Kavi Vakaria",
            "email": null,
            "phone": null,
            "services": ["Trademark Registration", "Company Formation"],
            "trademark_name": "After World",
            "notes": "Mobile number to be added later."
        }
    }

This file intentionally contains only AI detection/extraction. Database
creation, duplicate detection, permissions and API routing belong elsewhere.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

logger = logging.getLogger("whatsapp_lead_ai")


# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

def _provider() -> str:
    """Use the same provider selection convention as backend.ai.ai_provider."""
    selected = (os.environ.get("AI_PROVIDER") or "").strip().lower()
    if selected in {"gemini", "google", "google-ai"}:
        return "gemini"
    if selected == "groq":
        return "groq"
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
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
    # Text is cheaper/faster than vision for WhatsApp text messages. Allow an
    # explicit text-model setting without disturbing the existing vision model.
    return (
        os.environ.get("GEMINI_TEXT_MODEL")
        or os.environ.get("GEMINI_MODEL")
        or "gemini-2.5-flash"
    ).strip()


def _groq_key() -> str:
    return (os.environ.get("GROQ_API_KEY") or "").strip()


def _groq_model() -> str:
    # Prefer a text model setting. Fall back to the existing general Groq model
    # if one is already configured, without changing any existing environment.
    return (
        os.environ.get("GROQ_TEXT_MODEL")
        or os.environ.get("GROQ_MODEL")
        or "llama-3.3-70b-versatile"
    ).strip()


# -----------------------------------------------------------------------------
# Prompt
# -----------------------------------------------------------------------------

_SYSTEM_PROMPT = """
You are Taskosphere's WhatsApp lead detection and extraction engine.

Your job is to read a normal human-written WhatsApp message and determine
whether it describes a potential business lead for a CA/CS/trademark/company-
compliance practice.

The user does NOT have to follow a fixed format. Understand natural language,
short messages, spelling variations, mixed English/Hinglish, incomplete
information, abbreviations, and conversational sentences.

A message can be a lead even when some fields are missing. Do not reject a lead
just because phone, email, company name, or another field is unavailable.

CRITICAL RULES:
1. Never invent, guess, or hallucinate a value.
2. If information is not present, return null for that field.
3. Do not convert words such as "later", "will share", "pending", "not yet"
   into a phone number or other fake value. Keep the meaning in notes when
   useful and return null for the actual missing field.
4. Detect services/requirements from natural language.
5. If several services are mentioned, return each service separately.
6. Preserve names and trademark/brand names accurately.
7. A normal conversation, greeting, acknowledgement, unrelated task, or
   administrative message is not a lead.
8. A message mentioning a person/company and a genuine business requirement
   should normally be treated as a lead.
9. "Lead from X" normally means X is the contact/referral person unless the
   surrounding message clearly establishes another meaning.
10. Return JSON only. No markdown. No explanation outside the JSON.

Return exactly this structure:
{
  "is_lead": true,
  "confidence": 0.0,
  "lead": {
    "company_name": null,
    "contact_name": null,
    "email": null,
    "phone": null,
    "services": [],
    "trademark_name": null,
    "notes": null
  }
}

confidence must be a number from 0 to 1 representing confidence that the
message is actually a lead and the extracted information is reliable.
""".strip()


def _build_prompt(message: str) -> str:
    return f"{_SYSTEM_PROMPT}\n\nWHATSAPP MESSAGE:\n{message.strip()}"


# -----------------------------------------------------------------------------
# JSON extraction / normalization
# -----------------------------------------------------------------------------

def _extract_json_text(text: str) -> Dict[str, Any]:
    """Parse strict JSON while tolerating accidental markdown/code fences."""
    if not text:
        raise ValueError("AI returned an empty response")

    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        value = json.loads(cleaned)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    # Last-resort extraction if a provider adds prose around the JSON.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        value = json.loads(cleaned[start:end + 1])
        if isinstance(value, dict):
            return value

    raise ValueError("AI response did not contain valid JSON")


def _clean_optional(value: Any) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    if not value or value.lower() in {"null", "none", "n/a", "na", "not available"}:
        return None
    return value


def _clean_services(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        items = re.split(r"[,;\n]+", value)
    elif isinstance(value, list):
        items = value
    else:
        items = [value]

    result: List[str] = []
    for item in items:
        item = str(item).strip()
        if item and item.lower() not in {"null", "none", "n/a", "na"}:
            if item not in result:
                result.append(item)
    return result


def _normalize_result(raw: Dict[str, Any]) -> Dict[str, Any]:
    lead_raw = raw.get("lead")
    if not isinstance(lead_raw, dict):
        lead_raw = {}

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    is_lead = bool(raw.get("is_lead", False))

    lead = {
        "company_name": _clean_optional(lead_raw.get("company_name")),
        "contact_name": _clean_optional(lead_raw.get("contact_name")),
        "email": _clean_optional(lead_raw.get("email")),
        "phone": _clean_optional(lead_raw.get("phone")),
        "services": _clean_services(lead_raw.get("services")),
        "trademark_name": _clean_optional(lead_raw.get("trademark_name")),
        "notes": _clean_optional(lead_raw.get("notes")),
    }

    # A lead without any useful extracted information is not safe to create.
    useful = any([
        lead["company_name"],
        lead["contact_name"],
        lead["email"],
        lead["phone"],
        lead["services"],
        lead["trademark_name"],
    ])
    if not useful:
        is_lead = False

    return {
        "is_lead": is_lead,
        "confidence": confidence,
        "lead": lead,
    }


# -----------------------------------------------------------------------------
# Provider calls
# -----------------------------------------------------------------------------

async def _call_gemini(prompt: str) -> str:
    key = _gemini_key()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key is not configured on the server.",
        )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{_gemini_model()}:generateContent"
    )
    payload = {
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}],
        }],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
        },
    }

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            url,
            params={"key": key},
            headers={"Content-Type": "application/json"},
            json=payload,
        )

    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Gemini quota exceeded.")
    if response.status_code != 200:
        raise HTTPException(
            status_code=422,
            detail=f"Gemini API error {response.status_code}: {response.text[:300]}",
        )

    data = response.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=422, detail="Gemini returned an empty response.")


async def _call_groq(prompt: str) -> str:
    key = _groq_key()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Groq API key is not configured on the server.",
        )

    payload = {
        "model": _groq_model(),
        "messages": [{
            "role": "user",
            "content": prompt,
        }],
        "temperature": 0,
        "max_tokens": 1024,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Groq quota exceeded.")
    if response.status_code != 200:
        raise HTTPException(
            status_code=422,
            detail=f"Groq API error {response.status_code}: {response.text[:300]}",
        )

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=422, detail="Groq returned an empty response.")


# -----------------------------------------------------------------------------
# Public API
# -----------------------------------------------------------------------------

async def detect_and_extract_whatsapp_lead(message: str) -> Dict[str, Any]:
    """
    Analyze one WhatsApp message.

    Returns a normalized dictionary. This function does NOT write to MongoDB.
    """
    if not isinstance(message, str) or not message.strip():
        return {
            "is_lead": False,
            "confidence": 0.0,
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

    prompt = _build_prompt(message)
    provider = _provider()

    try:
        if provider == "gemini":
            raw_text = await _call_gemini(prompt)
        else:
            raw_text = await _call_groq(prompt)
    except Exception as first_error:
        # Keep the existing provider fallback philosophy: if both credentials
        # exist, a provider-side failure can fall back to the other provider.
        try:
            if provider == "gemini" and _groq_key():
                logger.warning("WhatsApp lead AI Gemini failed; falling back to Groq: %r", first_error)
                raw_text = await _call_groq(prompt)
            elif provider == "groq" and _gemini_key():
                logger.warning("WhatsApp lead AI Groq failed; falling back to Gemini: %r", first_error)
                raw_text = await _call_gemini(prompt)
            else:
                raise
        except Exception:
            logger.exception("WhatsApp lead AI provider call failed")
            raise first_error

    try:
        return _normalize_result(_extract_json_text(raw_text))
    except Exception as exc:
        logger.exception("Unable to parse WhatsApp lead AI response: %r", exc)
        raise HTTPException(
            status_code=422,
            detail="AI returned an invalid WhatsApp lead extraction response.",
        )


# Backward-friendly alias for callers that prefer a shorter function name.
async def extract_whatsapp_lead(message: str) -> Dict[str, Any]:
    return await detect_and_extract_whatsapp_lead(message)
