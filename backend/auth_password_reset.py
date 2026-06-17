"""
auth_password_reset.py
─────────────────────
Handles forgot-password OTP flow:
  POST /auth/forgot-password  →  generate & email 6-digit OTP
  POST /auth/reset-password   →  verify OTP, update password
"""

import os
import random
import logging
import smtplib
import httpx

from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from dateutil import parser as dateutil_parser

from backend.dependencies import db

logger = logging.getLogger(__name__)

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Pydantic models ───────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str


# ── Brevo email helper ────────────────────────────────────────────────────────

async def _send_otp_email(to_email: str, subject: str, body: str) -> None:
    """Send plain-text email via Brevo transactional API."""
    brevo_api_key   = os.getenv("BREVO_API_KEY", "")
    brevo_from_email = os.getenv("BREVO_FROM_EMAIL", "no-reply@taskosphere.com")
    brevo_from_name  = os.getenv("BREVO_FROM_NAME", "TaskoSphere")

    if not brevo_api_key:
        raise Exception("BREVO_API_KEY environment variable not set")

    payload = {
        "sender":  {"name": brevo_from_name, "email": brevo_from_email},
        "to":      [{"email": to_email}],
        "subject": subject,
        "textContent": body,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            json=payload,
            headers={
                "accept":       "application/json",
                "content-type": "application/json",
                "api-key":      brevo_api_key,
            },
        )

    if resp.status_code not in (200, 201):
        raise Exception(f"Brevo API error {resp.status_code}: {resp.text}")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """
    Always returns 200 to prevent email enumeration.
    Generates a 6-digit OTP, stores it in DB, and emails it via Brevo.
    OTP expires in 10 minutes.
    """
    email = data.email.strip().lower()
    user  = await db.users.find_one({"email": email}, {"_id": 0})

    if user:
        otp        = str(random.randint(100000, 999999))
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

        # Delete any existing OTP for this email, then insert fresh one
        await db.password_reset_tokens.delete_many({"email": email})
        await db.password_reset_tokens.insert_one({
            "email":      email,
            "token":      otp,
            "expires_at": expires_at,
        })

        subject = "TaskoSphere – Your Password Reset OTP"
        body = (
            f"Hi {user.get('full_name', '')},\n\n"
            f"You requested a password reset for your TaskoSphere account.\n\n"
            f"Your 6-digit OTP is:\n\n"
            f"  {otp}\n\n"
            f"Enter this OTP on the password reset page and set your new password.\n"
            f"This OTP expires in 10 minutes.\n\n"
            f"If you did not request this, you can safely ignore this email.\n\n"
            f"— TaskoSphere"
        )

        try:
            await _send_otp_email(data.email.strip(), subject, body)
            logger.info(f"Password reset OTP sent to {email}")
        except Exception as e:
            logger.error(f"Failed to send OTP email to {email}: {e}")

    return {"message": "If that email is registered, an OTP has been sent."}


@router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """
    Verifies the OTP and updates the user's password.
    """
    email  = data.email.strip().lower()
    record = await db.password_reset_tokens.find_one({"email": email, "token": data.token.strip()})

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    expires_at = dateutil_parser.isoparse(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_reset_tokens.delete_many({"email": email})
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    hashed = pwd_context.hash(data.new_password)
    result = await db.users.update_one({"email": email}, {"$set": {"password": hashed}})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")

    await db.password_reset_tokens.delete_many({"email": email})
    logger.info(f"Password reset successful for {email}")

    return {"message": "Password updated successfully."}
