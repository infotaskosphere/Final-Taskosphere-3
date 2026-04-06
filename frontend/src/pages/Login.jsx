import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";
import { useDark } from "@/hooks/useDark";
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Shared spring — same curve as DashboardLayout PAGE_VARIANTS ─────── */
const spring = { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 };

/* ── Page-level variants — exit fires via AnimatePresence in App.jsx ─── */
const pageVariants = {
  initial:  { opacity: 0, y: 20 },
  animate:  { opacity: 1, y: 0,   transition: spring },
  exit:     { opacity: 0, y: -12, transition: { duration: 0.22, ease: 'easeIn' } },
};

/* ── Card variants — staggered slightly after page ───────────────────── */
const cardVariants = {
  initial:  { opacity: 0, y: 28, scale: 0.98 },
  animate:  {
    opacity: 1, y: 0, scale: 1,
    transition: { ...spring, delay: 0.04 },
  },
  exit:     { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } },
};

export default function Login() {
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [showPassword,     setShowPassword]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [serverWaking,     setServerWaking]     = useState(false);
  const [wakingDots,       setWakingDots]       = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail,      setForgotEmail]      = useState('');
  const [readyToNavigate,  setReadyToNavigate]  = useState(false);
  const [navigateTo,       setNavigateTo]       = useState(null);

  const navigate  = useNavigate();
  const { login } = useAuth();
  const isDark    = useDark();

  /* animated dots for server waking message */
  useEffect(() => {
    if (!serverWaking) return;
    const id = setInterval(() => {
      setWakingDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(id);
  }, [serverWaking]);

  /* navigate only after exit animation completes */
  useEffect(() => {
    if (readyToNavigate && navigateTo) {
      navigate(navigateTo, { replace: true });
    }
  }, [readyToNavigate, navigateTo, navigate]);

  const sendTokenToExtension = (token) => {
    try {
      window.postMessage({ type: "SET_TOKEN", token }, window.location.origin);
    } catch {}
  };

  const loginWithRetry = async (retries = 2, retryDelay = 2000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await api.post('/auth/login', { email, password });
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoading(true);
    setServerWaking(false);
    const wakingTimer = setTimeout(() => setServerWaking(true), 3000);

    try {
      fetch("https://final-taskosphere-backend.onrender.com/health").catch(() => {});
      const response = await loginWithRetry();

      clearTimeout(wakingTimer);
      setServerWaking(false);

      login(response.data, true);
      sendTokenToExtension(response.data.access_token);
      toast.success('Welcome back!');

      /* signal exit — AnimatePresence fires exit animation,
         onAnimationComplete sets readyToNavigate → navigate fires  */
      setNavigateTo('/dashboard');

    } catch (error) {
      clearTimeout(wakingTimer);
      setServerWaking(false);
      if (error.code === "ECONNABORTED") {
        toast.error("Server is still waking up, please try again in a moment…");
      } else {
        toast.error(error.response?.data?.detail || 'Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    navigate('/forgot-password');
  };

  const pageBg = isDark
    ? 'linear-gradient(135deg,#0f172a,#1e293b,#0f172a)'
    : 'linear-gradient(135deg,#f0f9ff,#f0fdf4,#ecfeff)';
  const cardBg  = isDark ? 'rgba(30,41,59,0.97)' : 'rgba(255,255,255,0.97)';
  const headClr = isDark ? '#f1f5f9' : '#1e293b';
  const subClr  = isDark ? '#94a3b8' : '#64748b';

  /* When navigateTo is set, App.jsx's AnimatePresence triggers exit.
     onExitComplete fires after the exit animation fully finishes,
     then we actually navigate — perfectly smooth, no setTimeout.   */
  return (
    <motion.div
      className="min-h-screen flex items-center justify-center"
      style={{ background: pageBg }}
      variants={pageVariants}
      initial="initial"
      animate={navigateTo ? "exit" : "animate"}
      onAnimationComplete={(def) => {
        /* only act when the exit animation completes */
        if (def === "exit" && navigateTo) {
          setReadyToNavigate(true);
        }
      }}
    >
      {/* Card */}
      <motion.div
        className="w-full max-w-md p-8 rounded-2xl shadow-xl"
        style={{ background: cardBg }}
        variants={cardVariants}
        initial="initial"
        animate={navigateTo ? "exit" : "animate"}
      >
        {/* Logo */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.08 }}
        >
          <img src="/logo.png" alt="TaskoSphere" className="h-16 mx-auto mb-2" />
        </motion.div>

        {/* Login / Forgot password panels */}
        <AnimatePresence mode="wait">
          {showForgotPassword ? (

            <motion.div
              key="forgot"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={spring}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold text-center" style={{ color: headClr }}>
                Reset Password
              </h2>
              <Input
                type="email"
                placeholder="Enter your email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
              />
              <button
                onClick={handleForgotPassword}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors"
              >
                Send Reset Link
              </button>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="text-sm w-full transition-colors"
                style={{ color: subClr }}
              >
                Back to Login
              </button>
            </motion.div>

          ) : (

            <motion.div
              key="login"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={spring}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold text-center" style={{ color: headClr }}>
                Welcome Back
              </h2>

              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />

              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <motion.button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-70 text-white p-2 rounded-lg transition-colors font-medium"
                whileTap={{ scale: loading ? 1 : 0.98 }}
                transition={{ duration: 0.1 }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : 'Login'}
              </motion.button>

              {/* Server waking banner */}
              <AnimatePresence>
                {serverWaking && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm"
                      style={{
                        background: isDark ? 'rgba(251,191,36,0.1)' : '#fffbeb',
                        border: '1px solid #f59e0b',
                        color: isDark ? '#fcd34d' : '#92400e',
                      }}
                    >
                      <span className="relative flex h-3 w-3 shrink-0">
                        <span
                          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                          style={{ background: '#f59e0b' }}
                        />
                        <span
                          className="relative inline-flex rounded-full h-3 w-3"
                          style={{ background: '#f59e0b' }}
                        />
                      </span>
                      <span>
                        Server is waking up{wakingDots}&nbsp;
                        <span className="opacity-70 font-normal">This may take a few seconds.</span>
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="text-right">
                <button
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-blue-600 hover:underline transition-colors"
                >
                  Forgot Password?
                </button>
              </div>

              <div className="text-center text-sm">
                <span style={{ color: subClr }}>Don't have an account? </span>
                <Link to="/register" className="text-green-600 font-semibold hover:underline">
                  Sign Up
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
