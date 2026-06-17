import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDark } from '@/hooks/useDark';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2, ShieldCheck, KeyRound } from 'lucide-react';
import api from '@/lib/api';

const spring = { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 };

export default function ForgotPassword() {
  const isDark = useDark();
  // steps: 'email' → 'otp' → 'password' → 'done'
  const [step, setStep]           = useState('email');
  const [email, setEmail]         = useState('');
  const [otp, setOtp]             = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPass] = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const otpRefs                   = useRef([]);

  const pageBg  = isDark ? 'linear-gradient(135deg,#0f172a,#1e293b,#0f172a)' : 'linear-gradient(135deg,#f0f9ff,#f0fdf4,#ecfeff)';
  const cardBg  = isDark ? 'rgba(30,41,59,0.97)' : 'rgba(255,255,255,0.97)';
  const headClr = isDark ? '#f1f5f9' : '#1e293b';
  const subClr  = isDark ? '#94a3b8' : '#64748b';
  const inputBg = isDark ? '#1e293b' : '#fff';
  const borderC = isDark ? '#334155' : '#e2e8f0';

  /* ── Step 1: Send OTP ─────────────────────────────────────────────── */
  const handleSendOtp = async () => {
    if (!email.trim()) { toast.error('Please enter your email address'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setStep('otp');
      toast.success('A 6-digit OTP has been sent to your email.');
    } catch {
      // Always advance to avoid email enumeration
      setStep('otp');
      toast.success('If that email is registered, an OTP has been sent.');
    } finally {
      setLoading(false);
    }
  };

  /* ── OTP box handlers ─────────────────────────────────────────────── */
  const handleOtpChange = (idx, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  /* ── Step 2: Verify OTP ───────────────────────────────────────────── */
  const handleVerifyOtp = () => {
    const code = otp.join('');
    if (code.length < 6) { toast.error('Please enter the full 6-digit OTP'); return; }
    setStep('password');
  };

  /* ── Step 3: Reset Password ───────────────────────────────────────── */
  const handleReset = async () => {
    const code = otp.join('');
    if (newPassword.length < 6)  { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirm)  { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email:        email.trim(),
        token:        code,
        new_password: newPassword,
      });
      toast.success('Password updated! You can now log in.');
      setStep('done');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid or expired OTP.');
      // Send user back to re-enter OTP
      setStep('otp');
      setOtp(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  /* ── Resend OTP ───────────────────────────────────────────────────── */
  const handleResend = async () => {
    setOtp(['', '', '', '', '', '']);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      toast.success('A new OTP has been sent to your email.');
    } catch {
      toast.success('If that email is registered, a new OTP has been sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: pageBg }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
    >
      <motion.div
        className="w-full max-w-md p-6 sm:p-8 rounded-2xl shadow-xl"
        style={{ background: cardBg }}
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring, delay: 0.04 }}
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <img src="/logo.png" alt="TaskoSphere" className="h-16 mx-auto mb-2" />
        </div>

        <AnimatePresence mode="wait">

          {/* ── STEP: email ───────────────────────────────────────────── */}
          {step === 'email' && (
            <motion.div key="email"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={spring}
              className="space-y-4"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-3">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: headClr }}>Forgot Password?</h2>
                <p className="text-sm mt-1" style={{ color: subClr }}>
                  Enter your registered email. We'll send you a 6-digit OTP.
                </p>
              </div>

              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                style={{ background: inputBg }}
              />

              <button
                onClick={handleSendOtp}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white p-2.5 rounded-lg transition-colors font-medium"
              >
                {loading ? 'Sending OTP…' : 'Send OTP'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-blue-600 hover:underline flex items-center justify-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                </Link>
              </div>
            </motion.div>
          )}

          {/* ── STEP: otp ─────────────────────────────────────────────── */}
          {step === 'otp' && (
            <motion.div key="otp"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={spring}
              className="space-y-5"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 mb-3">
                  <ShieldCheck className="h-6 w-6 text-purple-600" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: headClr }}>Enter OTP</h2>
                <p className="text-sm mt-1" style={{ color: subClr }}>
                  We sent a 6-digit code to <span className="font-medium">{email}</span>.<br />
                  It expires in <span className="font-medium">10 minutes</span>.
                </p>
              </div>

              {/* 6 OTP boxes */}
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => otpRefs.current[idx] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(idx, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(idx, e)}
                    className="w-11 h-12 text-center text-xl font-bold rounded-lg border-2 outline-none transition-colors"
                    style={{
                      background: inputBg,
                      borderColor: digit ? '#16a34a' : borderC,
                      color: headClr,
                    }}
                  />
                ))}
              </div>

              <button
                onClick={handleVerifyOtp}
                className="w-full bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-lg transition-colors font-medium"
              >
                Verify OTP
              </button>

              <div className="flex items-center justify-between text-sm" style={{ color: subClr }}>
                <button onClick={() => setStep('email')} className="hover:underline flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Change email
                </button>
                <button onClick={handleResend} disabled={loading} className="text-blue-600 hover:underline disabled:opacity-50">
                  {loading ? 'Sending…' : 'Resend OTP'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP: password ────────────────────────────────────────── */}
          {step === 'password' && (
            <motion.div key="password"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={spring}
              className="space-y-4"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                  <KeyRound className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: headClr }}>Set New Password</h2>
                <p className="text-sm mt-1" style={{ color: subClr }}>
                  OTP verified! Enter your new password below.
                </p>
              </div>

              <Input
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={e => setNewPass(e.target.value)}
                style={{ background: inputBg }}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                style={{ background: inputBg }}
              />

              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white p-2.5 rounded-lg transition-colors font-medium"
              >
                {loading ? 'Updating Password…' : 'Reset Password'}
              </button>

              <button
                onClick={() => { setStep('otp'); setOtp(['', '', '', '', '', '']); }}
                className="w-full text-sm hover:underline flex items-center justify-center gap-1"
                style={{ color: subClr }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Re-enter OTP
              </button>
            </motion.div>
          )}

          {/* ── STEP: done ────────────────────────────────────────────── */}
          {step === 'done' && (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={spring}
              className="text-center space-y-4"
            >
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold" style={{ color: headClr }}>Password Reset!</h2>
              <p className="text-sm" style={{ color: subClr }}>
                Your password has been updated. You can now log in with your new password.
              </p>
              <Link
                to="/login"
                className="block w-full text-center bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-lg font-medium transition-colors"
              >
                Go to Login
              </Link>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
