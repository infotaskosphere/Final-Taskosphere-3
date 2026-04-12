// =============================================================================
// Register.js — Brand-aligned with full dark mode support
// Bug fixed: was using orange (placeholder color), now uses brand blue/green
// =============================================================================
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useDark } from "@/hooks/useDark";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus, User, Mail, Lock, Briefcase } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emerald: '#1FAF5A' };

export default function Register() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role,     setRole]     = useState('staff');
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();
  const isDark = useDark();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`, { email, password, full_name: fullName, role });
      const { access_token, user } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      toast.success('Account created successfully!');
      window.location.href = '/dashboard';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  /* ── theme ── */
  const pageBg = isDark
    ? `radial-gradient(ellipse at 30% 70%,rgba(31,175,90,0.07) 0%,transparent 50%),
       radial-gradient(ellipse at 70% 20%,rgba(31,111,178,0.07) 0%,transparent 50%),
       linear-gradient(135deg,#0f172a 0%,#1e293b 100%)`
    : `radial-gradient(ellipse at 30% 70%,rgba(31,175,90,0.12) 0%,transparent 50%),
       radial-gradient(ellipse at 70% 20%,rgba(31,111,178,0.12) 0%,transparent 50%),
       linear-gradient(135deg,#f0f9ff 0%,#f0fdf4 100%)`;

  const cardBg   = isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.97)';
  const cardBdr  = isDark ? 'rgba(51,65,85,0.8)'  : 'rgba(255,255,255,0.8)';
  const headClr  = isDark ? '#f1f5f9' : '#1e293b';
  const subClr   = isDark ? '#94a3b8' : '#64748b';
  const labelClr = isDark ? '#94a3b8' : '#374151';
  const iconClr  = isDark ? '#475569' : '#9ca3af';
  const inputSty = {
    background:  isDark ? 'rgba(15,23,42,0.8)' : '#ffffff',
    color:       isDark ? '#e2e8f0'             : '#1e293b',
    borderColor: isDark ? 'rgba(51,65,85,0.8)' : '#d1d5db',
  };

  const Field = ({ id, label, icon: Icon, type, placeholder, value, onChange, testId }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} style={{ color: labelClr }} className="text-sm font-semibold">{label}</Label>
      <div className="relative">
        <Icon style={{ color: iconClr }} className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" />
        <Input id={id} type={type} placeholder={placeholder} value={value} onChange={onChange}
          required className="pl-10 h-11 rounded-xl border" style={inputSty}
          data-testid={testId} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: pageBg }}>

      {/* Floating blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-80 h-80 rounded-full opacity-20 animate-pulse"
          style={{ background: `linear-gradient(135deg,${COLORS.mediumBlue},${COLORS.emerald})`, top: '-8%', right: '-4%', filter: 'blur(60px)', animationDelay: '0.5s' }} />
        <div className="absolute w-64 h-64 rounded-full opacity-15 animate-pulse"
          style={{ background: `linear-gradient(135deg,${COLORS.emerald},${COLORS.deepBlue})`, bottom: '-6%', left: '5%', filter: 'blur(50px)', animationDelay: '1.5s' }} />
      </div>

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 items-center justify-center p-8 xl:p-12">
        <div className="text-center max-w-sm">
          <img src="/logo.png" alt="Taskosphere" className="h-28 mx-auto mb-6 drop-shadow-xl" />
          <h2 className="text-3xl font-black mb-3" style={{ color: isDark ? '#f1f5f9' : COLORS.deepBlue }}>
            Taskosphere
          </h2>
          <p style={{ color: isDark ? '#94a3b8' : '#475569' }} className="text-lg leading-relaxed">
            Streamline your CA/CS firm's workflow — tasks, compliance, clients and team in one place.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-left">
            {['Task Management','Client CRM','Compliance Calendar','Team Activity'].map(feat => (
              <div key={feat}
                style={{ background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)', border: `1px solid ${isDark ? 'rgba(51,65,85,0.6)' : 'rgba(255,255,255,0.8)'}` }}
                className="p-3 rounded-xl backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full mb-1.5" style={{ background: COLORS.emerald }} />
                <p style={{ color: isDark ? '#cbd5e1' : '#374151' }} className="text-xs font-semibold">{feat}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-8 z-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 lg:hidden">
            <img src="/logo.png" alt="Taskosphere" className="h-16 mx-auto mb-2" />
          </div>

          <div className="p-6 sm:p-8 rounded-3xl shadow-2xl"
            style={{ background: cardBg, backdropFilter: 'blur(20px)', border: `1px solid ${cardBdr}` }}>

            <div className="mb-7">
              <h1 style={{ color: headClr }} className="text-2xl font-bold">Create Account</h1>
              <p style={{ color: subClr }} className="text-sm mt-1">Fill in your details to get started</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field id="fullName" label="Full Name"    icon={User}     type="text"     placeholder="John Doe"             value={fullName} onChange={e => setFullName(e.target.value)} testId="register-name-input" />
              <Field id="email"    label="Email"        icon={Mail}     type="email"    placeholder="name@example.com"     value={email}    onChange={e => setEmail(e.target.value)}    testId="register-email-input" />
              <Field id="password" label="Password"     icon={Lock}     type="password" placeholder="Create a strong password" value={password} onChange={e => setPassword(e.target.value)} testId="register-password-input" />

              {/* Role */}
              <div className="space-y-1.5">
                <Label style={{ color: labelClr }} className="text-sm font-semibold flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" /> Role
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-11 rounded-xl border" style={inputSty} data-testid="register-role-select">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-xl text-white font-bold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                style={{ background: `linear-gradient(135deg,${COLORS.deepBlue},${COLORS.mediumBlue})` }}
                data-testid="register-submit-btn">
                {loading ? 'Creating account…' : <><UserPlus className="h-5 w-5" /> Create Account</>}
              </button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span style={{ color: subClr }}>Already have an account? </span>
              <Link to="/login" className="font-bold hover:underline" style={{ color: COLORS.emerald }}
                data-testid="login-link">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
