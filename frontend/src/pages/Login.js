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

  // ✅ NEW STATES (LOGIN CONFIRMATION)
  const [showConfirm, setShowConfirm] = useState(
    localStorage.getItem("loginConfirm") !== "true"
  );
  const [allowedToLogin, setAllowedToLogin] = useState(
    localStorage.getItem("loginConfirm") === "true"
  );

  const navigate = useNavigate();
  const { login } = useAuth();
  const isDark = useDark();

  // ✅ HANDLE YES / NO
  const handleYes = () => {
    localStorage.setItem("loginConfirm", "true");
    setAllowedToLogin(true);
    setShowConfirm(false);
  };

  const handleNo = () => {
    setAllowedToLogin(false);
    setShowConfirm(false);
    toast.error("Login not allowed without confirmation");
  };

  // ✅ LOGIN FUNCTION
  const handleSubmit = async () => {
    if (!allowedToLogin) {
      toast.error("Please confirm before login");
      return;
    }

    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });

      login(response.data, true);

      // 🔥 Send token to Chrome Extension
      if (window.chrome && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: "SET_TOKEN",
            token: response.data.access_token
          });
        } catch (e) {
          console.log("Extension not available");
        }
      }

      toast.success('Welcome back!');
      navigate('/dashboard');

    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid email or password');
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

  /* THEME */
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

      {/* ✅ LOGIN CONFIRM POPUP */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl text-center shadow-xl">
            <h2 className="text-lg font-semibold mb-4">
                Select YES To Continue
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
