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
  const navigate = useNavigate();
  const { login } = useAuth();
  const isDark = useDark();

const handleSubmit = async () => {
  if (!email || !password) {
    toast.error('Please enter email and password');
    return;
  }

  setLoading(true);

  try {
    const response = await api.post('/auth/login', { email, password });

    // Existing login logic
    login(response.data, true);

    // 🔥 Send token to Chrome Extension
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
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
    if (!forgotEmail) { toast.error('Please enter your email address'); return; }
    toast.info('Password reset functionality will be available soon. Please contact administrator.');
    setShowForgotPassword(false);
    setForgotEmail('');
  };

  /* ── theme ── */
  const pageBg = isDark
    ? `radial-gradient(ellipse at 20% 80%,rgba(31,175,90,0.08) 0%,transparent 50%),
       radial-gradient(ellipse at 80% 20%,rgba(31,111,178,0.08) 0%,transparent 50%),
       linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)`
    : `radial-gradient(ellipse at 20% 80%,rgba(31,175,90,0.15) 0%,transparent 50%),
       radial-gradient(ellipse at 80% 20%,rgba(31,111,178,0.15) 0%,transparent 50%),
       linear-gradient(135deg,#f0f9ff 0%,#f0fdf4 50%,#ecfeff 100%)`;

  const cardBg = isDark
    ? 'rgba(30,41,59,0.95)'
    : 'rgba(255,255,255,0.95)';
  const cardBorder = isDark ? 'rgba(51,65,85,0.8)' : 'rgba(255,255,255,0.8)';
  const headingClr = isDark ? '#f1f5f9' : '#1e293b';
  const subClr     = isDark ? '#94a3b8' : '#64748b';
  const inputStyle = {
    background: isDark ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.9)',
    color:      isDark ? '#e2e8f0' : '#1e293b',
    borderColor: isDark ? 'rgba(51,65,85,0.8)' : undefined,
  };
  const iconClr = isDark ? '#475569' : '#94a3b8';

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: pageBg }}>

      {/* Floating shapes */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute w-64 sm:w-80 lg:w-96 h-64 sm:h-80 lg:h-96 rounded-full opacity-20 animate-pulse"
          style={{ background: `linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`, top: '-10%', left: '-5%', filter: 'blur(60px)' }} />
        <div className="absolute w-48 sm:w-56 lg:w-64 h-48 sm:h-56 lg:h-64 rounded-full opacity-15 animate-pulse"
          style={{ background: `linear-gradient(135deg,${COLORS.secondary},${COLORS.primary})`, bottom: '-5%', right: '10%', filter: 'blur(50px)', animationDelay: '1s' }} />
        <div className="absolute w-60 sm:w-72 lg:w-80 h-60 sm:h-72 lg:h-80 rounded-full opacity-10 animate-pulse hidden sm:block"
          style={{ background: `linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})`, top: '30%', right: '-10%', filter: 'blur(70px)', animationDelay: '2s' }} />
      </div>

      {/* Left side — Dashboard Preview (lg+) */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 items-center justify-center p-4 xl:p-8">
        <div className="w-full max-w-md xl:max-w-lg rounded-3xl shadow-2xl overflow-hidden"
          style={{ background: isDark ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: `1px solid ${isDark ? 'rgba(51,65,85,0.5)' : 'rgba(255,255,255,0.5)'}` }}>
          <div className="p-4 xl:p-6 space-y-3 xl:space-y-4">
            <div className="flex items-center gap-3 mb-4 xl:mb-6">
              <div className="w-8 xl:w-10 h-8 xl:h-10 rounded-lg" style={{ background: `linear-gradient(135deg,${COLORS.primary},${COLORS.secondary})` }} />
              <div className={`h-3 xl:h-4 w-24 xl:w-32 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            </div>
            <div className="grid grid-cols-3 gap-2 xl:gap-3">
              {[['blue-200','blue-400'], ['green-200','green-400'], ['amber-200','amber-400']].map(([light, dark], i) => (
                <div key={i} className={`${isDark ? 'bg-slate-800/80' : 'bg-white/80'} p-3 xl:p-4 rounded-xl shadow-sm`}>
                  <div className={`h-2 xl:h-3 w-10 xl:w-12 bg-${light} rounded mb-2`} />
                  <div className={`h-5 xl:h-6 w-6 xl:w-8 bg-${dark} rounded`} />
                </div>
              ))}
            </div>
            <div className={`${isDark ? 'bg-slate-800/80' : 'bg-white/80'} p-3 xl:p-4 rounded-xl shadow-sm h-24 xl:h-32 flex items-end gap-1 xl:gap-2`}>
              {[40,65,45,80,55,70,50].map((h,i) => (
                <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`,
                  background: i%2===0
                    ? `linear-gradient(180deg,${COLORS.primary},${COLORS.primary}80)`
                    : `linear-gradient(180deg,${COLORS.secondary},${COLORS.secondary}80)` }} />
              ))}
            </div>
            <div className="space-y-2">
              {[1,2,3].map((_,i) => (
                <div key={i} className={`${isDark ? 'bg-slate-800/80' : 'bg-white/80'} p-2 xl:p-3 rounded-lg shadow-sm flex items-center gap-2 xl:gap-3`}>
                  <div className={`w-3 xl:w-4 h-3 xl:h-4 rounded border-2 ${isDark ? 'border-slate-600' : 'border-slate-300'}`} />
                  <div className={`h-2 xl:h-3 flex-1 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                  <div className={`h-4 xl:h-5 w-12 xl:w-16 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right side — Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 z-10">
        <div className="w-full max-w-sm sm:max-w-md p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-xl"
          style={{ background: cardBg, backdropFilter: 'blur(20px)', border: `1px solid ${cardBorder}` }}>

          <div className="text-center mb-6 sm:mb-8">
            <img src="/logo.png" alt="TaskoSphere" className="h-14 sm:h-16 lg:h-20 mx-auto mb-2" style={{ background: 'transparent' }} />
          </div>

          {showForgotPassword ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 style={{ color: headingClr }} className="text-2xl font-bold mb-2">Reset Password</h2>
                <p style={{ color: subClr }} className="text-sm">Enter your email to receive reset instructions</p>
              </div>
              <div className="space-y-4">
                <div className="relative">
                  <User style={{ color: iconClr }} className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" />
                  <Input type="email" placeholder="Enter your email" value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="pl-12 h-12 rounded-xl border-2 transition-colors"
                    style={{ ...inputStyle, borderColor: 'rgba(31,111,178,0.3)' }}
                    data-testid="forgot-email-input" />
                </div>
                <button type="button" onClick={handleForgotPassword}
                  className="w-full h-12 rounded-xl text-white font-semibold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg,${COLORS.gradientStart},${COLORS.secondary})` }}>
                  Send Reset Link
                </button>
                <button type="button" onClick={() => setShowForgotPassword(false)}
                  style={{ color: subClr }}
                  className="w-full text-center text-sm hover:opacity-80 transition-opacity">
                  Back to Login
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <h2 style={{ color: headingClr }} className="text-2xl font-bold mb-2">Welcome Back</h2>
                <p style={{ color: subClr }} className="text-sm">Sign in to continue to TaskoSphere</p>
              </div>
              <div className="space-y-4">
                <div className="relative">
                  <User style={{ color: iconClr }} className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" />
                  <Input type="email" placeholder="Username or Email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 h-12 rounded-xl border-2 transition-colors"
                    style={{ ...inputStyle, borderColor: 'rgba(31,175,90,0.3)' }}
                    data-testid="login-email-input" />
                </div>
                <div className="relative">
                  <Lock style={{ color: iconClr }} className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" />
                  <Input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 pr-12 h-12 rounded-xl border-2 transition-colors"
                    style={{ ...inputStyle, borderColor: 'rgba(31,111,178,0.3)' }}
                    data-testid="login-password-input" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ color: iconClr }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 hover:opacity-80 transition-opacity">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => setShowForgotPassword(true)}
                    className="text-sm font-medium hover:underline transition-colors"
                    style={{ color: COLORS.primary }}>
                    Forgot Password?
                  </button>
                </div>
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="w-full h-12 rounded-xl text-white font-semibold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: `linear-gradient(135deg,${COLORS.gradientStart},${COLORS.secondary})` }}>
                  {loading ? 'Signing in...' : 'Login'}
                </button>
              </div>
              <div className="text-center text-sm">
                <span style={{ color: subClr }}>Don't have an account? </span>
                <Link to="/register" className="font-semibold hover:underline transition-colors"
                  style={{ color: COLORS.secondary }}>
                  Sign Up
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
