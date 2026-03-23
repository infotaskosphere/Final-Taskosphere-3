import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";
import { useDark } from "@/hooks/useDark";
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { User, Lock, Eye, EyeOff } from 'lucide-react';

const COLORS = {
  primary: '#1F6FB2',
  secondary: '#1FAF5A',
  gradientStart: '#0D3B66',
  gradientEnd: '#1FAF5A',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  // 🔥 NEW STATES (BACKEND CONTROLLED)
  const [showConfirm, setShowConfirm] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  const navigate = useNavigate();
  const { login } = useAuth();
  const isDark = useDark();

  // 🔥 SEND TOKEN TO EXTENSION
  const sendTokenToExtension = (token) => {
    if (window.chrome && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: "SET_TOKEN",
          token: token
        });
      } catch {
        console.log("Extension not available");
      }
    }
  };

  // 🔥 HANDLE YES (FINAL LOGIN)
  const handleYes = async () => {
    try {
      await api.post("/auth/confirm-login", {}, {
        headers: { Authorization: `Bearer ${tempToken}` }
      });

      login({ access_token: tempToken }, true);
      sendTokenToExtension(tempToken);

      setShowConfirm(false);
      toast.success("Welcome!");
      navigate('/dashboard');

    } catch {
      toast.error("Something went wrong");
    }
  };

  // 🔥 HANDLE NO (NO CRASH)
  const handleNo = () => {
    setShowConfirm(false);
    setTempToken(null);
    toast.error("Please select Yes to continue");
  };

  // 🔥 LOGIN FUNCTION (UPDATED)
  const handleSubmit = async () => {
  if (!email || !password) {
    toast.error('Please enter email and password');
    return;
  }

  setLoading(true);

  try {
    // 🔥 STEP 1: Wake backend
    await fetch("https://final-taskosphere-backend.onrender.com/health");

    // 🔥 STEP 2: Give backend time to wake
    await new Promise((r) => setTimeout(r, 4000));

    // 🔥 STEP 3: Retry login (important for cold start)
    let response;
    try {
      response = await api.post('/auth/login', { email, password });
    } catch (err) {
      console.warn("Retrying login after cold start...");
      await new Promise((r) => setTimeout(r, 3000));
      response = await api.post('/auth/login', { email, password });
    }

    // 🔥 CHECK CONSENT FROM BACKEND
    if (!response.data.consent_given) {
      setTempToken(response.data.access_token);
      setShowConfirm(true);
      return;
    }

    // ✅ NORMAL LOGIN
    login(response.data, true);
    sendTokenToExtension(response.data.access_token);

    toast.success('Welcome back!');
    navigate('/dashboard');

  } catch (error) {
    console.error("Login error:", error);

    if (error.code === "ECONNABORTED") {
      toast.error("Server is waking up, please try again...");
    } else {
      toast.error(error.response?.data?.detail || 'Invalid email or password');
    }

  } finally {
    setLoading(false);
  }
};

const handleForgotPassword = () => {
  if (!forgotEmail) {
    toast.error('Please enter your email address');
    return;
  }

  toast.info('Password reset functionality will be available soon.');
  setShowForgotPassword(false);
  setForgotEmail('');
};

/* =========================
   THEME
========================= */

const pageBg = isDark
  ? `linear-gradient(135deg,#0f172a,#1e293b,#0f172a)`
  : `linear-gradient(135deg,#f0f9ff,#f0fdf4,#ecfeff)`;

const cardBg = isDark
  ? 'rgba(30,41,59,0.95)'
  : 'rgba(255,255,255,0.95)';

const headingClr = isDark ? '#f1f5f9' : '#1e293b';
const subClr = isDark ? '#94a3b8' : '#64748b';

return (
  <div className="min-h-screen flex items-center justify-center" style={{ background: pageBg }}>

    {/* 🔥 POPUP */}
    {showConfirm && (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-xl text-center shadow-xl">
          <h2 className="text-lg font-semibold mb-4">
            Select Yes To Continue
          </h2>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleYes}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Yes
            </button>

            <button
              onClick={handleNo}
              className="bg-gray-400 text-white px-4 py-2 rounded"
            >
              No
            </button>
          </div>
        </div>
      </div>
    )}
      <div className="w-full max-w-md p-8 rounded-2xl shadow-xl" style={{ background: cardBg }}>

        <div className="text-center mb-6">
          <img src="/logo.png" alt="TaskoSphere" className="h-16 mx-auto mb-2" />
        </div>

        {showForgotPassword ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center">Reset Password</h2>

            <Input
              type="email"
              placeholder="Enter your email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />

            <button onClick={handleForgotPassword} className="w-full bg-blue-600 text-white p-2 rounded">
              Send Reset Link
            </button>

            <button onClick={() => setShowForgotPassword(false)} className="text-sm w-full">
              Back to Login
            </button>
          </div>
        ) : (
          <div className="space-y-4">

            <h2 className="text-xl font-bold text-center" style={{ color: headingClr }}>
              Welcome Back
            </h2>

            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-green-600 text-white p-2 rounded"
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>

            <div className="text-right">
              <button
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-blue-600"
              >
                Forgot Password?
              </button>
            </div>

            <div className="text-center text-sm">
              <span style={{ color: subClr }}>Don't have an account? </span>
              <Link to="/register" className="text-green-600 font-semibold">
                Sign Up
              </Link>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
