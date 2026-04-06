import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDark } from '@/hooks/useDark';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import api from '@/lib/api';

const spring = { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 };

export default function ForgotPassword() {
  const isDark = useDark();
  const [step, setStep]           = useState('request'); // 'request' | 'sent' | 'reset'
  const [email, setEmail]         = useState('');
  const [token, setToken]         = useState('');
  const [newPassword, setNewPass] = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);

  const pageBg = isDark
    ? 'linear-gradient(135deg,#0f172a,#1e293b,#0f172a)'
    : 'linear-gradient(135deg,#f0f9ff,#f0fdf4,#ecfeff)';
  const cardBg  = isDark ? 'rgba(30,41,59,0.97)' : 'rgba(255,255,255,0.97)';
  const headClr = isDark ? '#f1f5f9' : '#1e293b';
  const subClr  = isDark ? '#94a3b8' : '#64748b';
  const inputBg = isDark ? '#1e293b' : '#fff';

  /* ── Step 1: Request reset ─────────────────────────────────────────── */
  const handleRequest = async () => {
    if (!email.trim()) { toast.error('Please enter your email address'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setStep('sent');
      toast.success('Reset instructions sent if that email is registered.');
    } catch (err) {
      // Always show "sent" to avoid email enumeration
      setStep('sent');
      toast.success('Reset instructions sent if that email is registered.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 3: Submit new password ───────────────────────────────────── */
  const handleReset = async () => {
    if (!token.trim())              { toast.error('Enter the reset token from your email'); return; }
    if (newPassword.length < 6)    { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirm)   { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(),
        token: token.trim(),
        new_password: newPassword,
      });
      toast.success('Password updated! You can now log in.');
      setStep('done');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid or expired token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center"
      style={{ background: pageBg }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <motion.div
        className="w-full max-w-md p-8 rounded-2xl shadow-xl"
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

          {/* ── Step: request ──────────────────────────────────────────── */}
          {step === 'request' && (
            <motion.div
              key="request"
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
                  Enter your registered email and we'll send reset instructions.
                </p>
              </div>

              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRequest()}
                style={{ background: inputBg }}
              />

              <button
                onClick={handleRequest}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white p-2.5 rounded-lg transition-colors font-medium"
              >
                {loading ? 'Sending…' : 'Send Reset Instructions'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-blue-600 hover:underline flex items-center justify-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                </Link>
              </div>
            </motion.div>
          )}

          {/* ── Step: sent — enter token ────────────────────────────────── */}
          {step === 'sent' && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={spring}
              className="space-y-4"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                  <KeyRound className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: headClr }}>Enter Reset Token</h2>
                <p className="text-sm mt-1" style={{ color: subClr }}>
                  Check your email for the reset token and enter your new password below.
                </p>
              </div>

              <Input
                type="text"
                placeholder="Reset token from email"
                value={token}
                onChange={e => setToken(e.target.value)}
                style={{ background: inputBg }}
              />
              <Input
                type="password"
                placeholder="New password (min 6 chars)"
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
                {loading ? 'Updating…' : 'Reset Password'}
              </button>

              <button
                onClick={() => setStep('request')}
                className="w-full text-sm hover:underline"
                style={{ color: subClr }}
              >
                ← Re-send email
              </button>
            </motion.div>
          )}

          {/* ── Step: done ───────────────────────────────────────────────── */}
          {step === 'done' && (
            <motion.div
              key="done"
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
