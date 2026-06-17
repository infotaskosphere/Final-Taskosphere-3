import secrets
from datetime import timedelta

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """
    Always returns 200 (to prevent email enumeration).
    Generates a short-lived token, stores it in DB, and emails it via Brevo SMTP.
    """
    user = await db.users.find_one({"email": data.email.strip().lower()}, {"_id": 0})
    if user:
        import random
        otp = str(random.randint(100000, 999999))
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        await db.password_reset_tokens.delete_many({"email": data.email.strip().lower()})
        await db.password_reset_tokens.insert_one({
            "email": data.email.strip().lower(),
            "token": otp,
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
            await send_email(data.email.strip(), subject, body)
            logger.info(f"Password reset email sent to {data.email}")
        except Exception as e:
            logger.error(f"Failed to send password reset email to {data.email}: {e}")
    return {"message": "If that email is registered, reset instructions have been sent."}


@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    email = data.email.strip().lower()
    record = await db.password_reset_tokens.find_one({"email": email, "token": data.token.strip()})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
    expires_at = parser.isoparse(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        await db.password_reset_tokens.delete_many({"email": email})
        raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    hashed = get_password_hash(data.new_password)
    result = await db.users.update_one({"email": email}, {"$set": {"password": hashed}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    await db.password_reset_tokens.delete_many({"email": email})
    logger.info(f"Password reset successful for {email}")
    return {"message": "Password updated successfully."}


@api_router.post("/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: User = Depends(get_current_user)):
    # PERMISSION MATRIX (updated): Admin or users with can_manage_users can approve
