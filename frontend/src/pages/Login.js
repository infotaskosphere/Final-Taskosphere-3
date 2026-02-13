import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { User, Lock, Eye, EyeOff } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Logo colors - TaskoSphere brand colors
const COLORS = {
  primary: '#1F6FB2', // Blue from logo
  secondary: '#1FAF5A', // Green from logo  
  gradientStart: '#0D3B66', // Deep blue
  gradientEnd: '#1FAF5A', // Green
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user } = response.data;
      
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      toast.success('Welcome back!');
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Login error:', error);
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
    // Email integration will be done later
    toast.info('Password reset functionality will be available soon. Please contact administrator.');
    setShowForgotPassword(false);
    setForgotEmail('');
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Abstract Background */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 80%, rgba(31, 175, 90, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(31, 111, 178, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(31, 111, 178, 0.08) 0%, transparent 70%),
            linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 50%, #ecfeff 100%)
          `
        }}
      />
      
      {/* Floating Shapes - Abstract geometric elements */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div 
          className="absolute w-96 h-96 rounded-full opacity-20 animate-pulse"
          style={{ 
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
            top: '-10%',
            left: '-5%',
            filter: 'blur(60px)'
          }}
        />
        <div 
          className="absolute w-64 h-64 rounded-full opacity-15 animate-pulse"
          style={{ 
            background: `linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.primary} 100%)`,
            bottom: '-5%',
            right: '10%',
            filter: 'blur(50px)',
            animationDelay: '1s'
          }}
        />
        <div 
          className="absolute w-80 h-80 rounded-full opacity-10 animate-pulse"
          style={{ 
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
            top: '30%',
            right: '-10%',
            filter: 'blur(70px)',
            animationDelay: '2s'
          }}
        />
      </div>

      {/* Left Side - Dashboard Preview (blurred) */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 items-center justify-center p-8">
        <div 
          className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
          style={{ 
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.5)'
          }}
        >
          {/* Mock Dashboard Preview */}
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)` }}></div>
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/80 p-4 rounded-xl shadow-sm">
                <div className="h-3 w-12 bg-blue-200 rounded mb-2"></div>
                <div className="h-6 w-8 bg-blue-400 rounded"></div>
              </div>
              <div className="bg-white/80 p-4 rounded-xl shadow-sm">
                <div className="h-3 w-12 bg-green-200 rounded mb-2"></div>
                <div className="h-6 w-8 bg-green-400 rounded"></div>
              </div>
              <div className="bg-white/80 p-4 rounded-xl shadow-sm">
                <div className="h-3 w-12 bg-amber-200 rounded mb-2"></div>
                <div className="h-6 w-8 bg-amber-400 rounded"></div>
              </div>
            </div>
            {/* Chart Placeholder */}
            <div className="bg-white/80 p-4 rounded-xl shadow-sm h-32 flex items-end gap-2">
              {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
                <div 
                  key={i} 
                  className="flex-1 rounded-t"
                  style={{ 
                    height: `${h}%`,
                    background: i % 2 === 0 
                      ? `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.primary}80 100%)`
                      : `linear-gradient(180deg, ${COLORS.secondary} 0%, ${COLORS.secondary}80 100%)`
                  }}
                ></div>
              ))}
            </div>
            {/* Task List */}
            <div className="space-y-2">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="bg-white/80 p-3 rounded-lg shadow-sm flex items-center gap-3">
                  <div className="w-4 h-4 rounded border-2 border-slate-300"></div>
                  <div className="h-3 flex-1 bg-slate-200 rounded"></div>
                  <div className="h-5 w-16 bg-slate-100 rounded-full"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 z-10">
        <div 
          className="w-full max-w-md p-8 rounded-3xl shadow-xl"
          style={{ 
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.8)'
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <img src="/logo.png" alt="TaskoSphere" className="h-20 mx-auto mb-2" style={{ background: 'transparent' }} />
          </div>

          {showForgotPassword ? (
            /* Forgot Password Form */
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Reset Password</h2>
                <p className="text-slate-600 text-sm">Enter your email to receive reset instructions</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="pl-12 h-12 rounded-xl border-2 border-slate-200 focus:border-blue-400 transition-colors"
                    style={{ borderColor: 'rgba(31, 111, 178, 0.3)' }}
                    data-testid="forgot-email-input"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="w-full h-12 rounded-xl text-white font-semibold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                  style={{ 
                    background: `linear-gradient(135deg, ${COLORS.gradientStart} 0%, ${COLORS.secondary} 100%)`
                  }}
                  data-testid="reset-password-btn"
                >
                  Send Reset Link
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full text-center text-sm text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </div>
          ) : (
            /* Login Form */
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back</h2>
                <p className="text-slate-600 text-sm">Sign in to continue to TaskoSphere</p>
              </div>

              <div className="space-y-4">
                {/* Email Input */}
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="Username or Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 h-12 rounded-xl border-2 transition-colors"
                    style={{ borderColor: 'rgba(31, 175, 90, 0.3)' }}
                    data-testid="login-email-input"
                  />
                </div>

                {/* Password Input */}
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 pr-12 h-12 rounded-xl border-2 transition-colors"
                    style={{ borderColor: 'rgba(31, 111, 178, 0.3)' }}
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Forgot Password Link */}
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm font-medium hover:underline transition-colors"
                    style={{ color: COLORS.primary }}
                    data-testid="forgot-password-link"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Login Button */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full h-12 rounded-xl text-white font-semibold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    background: `linear-gradient(135deg, ${COLORS.gradientStart} 0%, ${COLORS.secondary} 100%)`
                  }}
                  data-testid="login-submit-btn"
                >
                  {loading ? 'Signing in...' : 'Login'}
                </button>
              </div>

              {/* Sign Up Link */}
              <div className="text-center text-sm">
                <span className="text-slate-600">Don't have an account? </span>
                <Link 
                  to="/register" 
                  className="font-semibold hover:underline transition-colors"
                  style={{ color: COLORS.secondary }}
                  data-testid="register-link"
                >
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
