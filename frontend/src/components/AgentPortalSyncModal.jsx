// AgentPortalSyncModal.jsx
// Drop into: frontend/src/components/AgentPortalSyncModal.jsx
//
// HOW TO USE IN TrademarkSphere.jsx:
// 1. Import at the top:
//    import AgentPortalSyncModal from '@/components/AgentPortalSyncModal';
//
// 2. Add state in the parent component:
//    const [showPortalSync, setShowPortalSync] = useState(false);
//
// 3. Add a trigger button (e.g. in the header action bar):
//    <button onClick={() => setShowPortalSync(true)} className="...">
//      <RefreshCw className="w-4 h-4" /> Sync from IP India
//    </button>
//
// 4. Render the modal:
//    <AnimatePresence>
//      {showPortalSync && (
//        <AgentPortalSyncModal
//          onClose={() => setShowPortalSync(false)}
//          onSyncComplete={() => { setShowPortalSync(false); fetchTrademarks(); }}
//          isDark={isDark}
//        />
//      )}
//    </AnimatePresence>

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mail, Key, User, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, Shield, ArrowRight,
  ChevronRight, Zap, BarChart3, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

const cn = (...c) => c.filter(Boolean).join(' ');

// ── Design tokens (matches TrademarkSphere palette) ──────────────────────────
const C = {
  deepBlue:   '#0D3B66',
  midBlue:    '#1F6FB2',
  violet:     '#7C3AED',
  green:      '#1FAF5A',
  coral:      '#EF4444',
  amber:      '#F59E0B',
};

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = ['credentials', 'otp', 'syncing', 'done'];

function StepDot({ index, current, label }) {
  const stepIndex = STEPS.indexOf(current);
  const done   = index < stepIndex;
  const active = index === stepIndex;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
        done   ? 'bg-green-500 border-green-500 text-white'
               : active ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/30'
                        : 'bg-transparent border-slate-600 text-slate-500'
      )}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
      </div>
      <span className={cn(
        'text-[10px] font-semibold uppercase tracking-wider',
        active ? 'text-violet-400' : done ? 'text-green-500' : 'text-slate-500'
      )}>{label}</span>
    </div>
  );
}

function ProgressBar({ value, color = C.violet }) {
  return (
    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value)}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── OTP Timer countdown ───────────────────────────────────────────────────────
function OtpTimer({ seconds, onExpired }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) { onExpired?.(); return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  return (
    <span className={cn(
      'text-xs font-mono font-bold tabular-nums',
      left < 60 ? 'text-red-400' : 'text-slate-400'
    )}>
      {mins}:{String(secs).padStart(2, '0')}
    </span>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function AgentPortalSyncModal({ onClose, onSyncComplete, isDark }) {
  const [step, setStep]             = useState('credentials');
  const [loading, setLoading]       = useState(false);
  const [sessionId, setSessionId]   = useState(null);
  const [syncId, setSyncId]         = useState(null);
  const [otpExpired, setOtpExpired] = useState(false);
  const [progress, setProgress]     = useState(null);
  const pollRef                     = useRef(null);

  const [form, setForm] = useState({
    email:       '',
    agentCode:   '',
    attorney:    '',
    otp:         '',
    refreshExisting: true,
  });

  // ── Stop polling on unmount ───────────────────────────────────────
  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── Polling sync status ───────────────────────────────────────────
  const startPolling = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/trademark-sphere/portal-sync/${id}/status`);
        setProgress(res.data);
        if (res.data.status === 'done' || res.data.status === 'error') {
          clearInterval(pollRef.current);
          if (res.data.status === 'done') setStep('done');
          else {
            toast.error(res.data.phase || 'Sync failed');
            setStep('credentials');
          }
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 2000);
  }, []);

  // ── Step 1: Send OTP ─────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!form.email.trim())     { toast.error('Enter your IP India registered email'); return; }
    if (!form.agentCode.trim()) { toast.error('Enter your agent/attorney code');        return; }
    setLoading(true);
    try {
      const res = await api.post('/trademark-sphere/send-otp', { email: form.email.trim() });
      setSessionId(res.data.session_id);
      setOtpExpired(false);
      setStep('otp');
      toast.success('OTP sent! Check your email.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  // ── Step 2: Verify OTP + Start Sync ─────────────────────────────
  const handleStartSync = async () => {
    if (!form.otp.trim()) { toast.error('Enter the OTP from your email'); return; }
    setLoading(true);
    try {
      const res = await api.post('/trademark-sphere/portal-sync', {
        agent_code:       form.agentCode.trim(),
        session_id:       sessionId,
        otp:              form.otp.trim(),
        attorney:         form.attorney.trim(),
        refresh_existing: form.refreshExisting,
      });
      setSyncId(res.data.sync_id);
      setStep('syncing');
      setProgress({ status: 'queued', phase: 'Starting sync…', total: 0, done: 0, added: 0, updated: 0, failed: 0 });
      startPolling(res.data.sync_id);
      toast.success('Sync started!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start sync');
    } finally { setLoading(false); }
  };

  const pct = progress?.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : (progress?.status === 'running' ? 5 : 0);

  const inputCls = cn(
    'w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all focus:ring-2',
    isDark
      ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:ring-violet-900/40'
      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:ring-violet-100'
  );

  return (
    <motion.div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 10, 25, 0.80)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={step !== 'syncing' ? onClose : undefined}
    >
      <motion.div
        initial={{ scale: 0.9, y: 32, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 32, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        onClick={e => e.stopPropagation()}
        className={cn(
          'w-full max-w-md rounded-3xl overflow-hidden shadow-2xl',
          isDark ? 'bg-slate-900 border border-slate-700/80' : 'bg-white border border-slate-200'
        )}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="px-6 py-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, #3B0764 0%, ${C.violet} 60%, #2563EB 100%)` }}
        >
          {/* Decorative blobs */}
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
          <div className="absolute -left-8 -bottom-8 w-28 h-28 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)' }} />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-inner">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/55 text-[10px] font-bold uppercase tracking-widest">IP India Portal</p>
                <h2 className="text-[17px] font-bold text-white leading-tight">Daily Sync</h2>
              </div>
            </div>
            {step !== 'syncing' && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all active:scale-90"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Step indicators */}
          <div className="relative flex items-center justify-between mt-5 px-2">
            {[['credentials', 'Login'], ['otp', 'OTP'], ['syncing', 'Syncing'], ['done', 'Done']].map(([s, label], i) => (
              <React.Fragment key={s}>
                <StepDot index={i} current={step} label={label} />
                {i < 3 && (
                  <div className={cn(
                    'flex-1 h-px mx-1 transition-all duration-300',
                    STEPS.indexOf(step) > i ? 'bg-green-500' : 'bg-slate-600'
                  )} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="p-6">
          <AnimatePresence mode="wait">

            {/* STEP 1: Credentials */}
            {step === 'credentials' && (
              <motion.div key="creds"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className={cn(
                  'rounded-2xl p-3.5 flex gap-3 items-start text-sm border',
                  isDark ? 'bg-violet-900/20 border-violet-800/40 text-violet-200' : 'bg-violet-50 border-violet-200 text-violet-800'
                )}>
                  <Shield className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
                  <p className="text-xs leading-relaxed opacity-90">
                    Login to <strong>tmrsearch.ipindia.gov.in/estatus</strong> with your registered email.
                    An OTP will be sent to your inbox — works exactly like the IP India portal.
                  </p>
                </div>

                <div>
                  <label className={cn('block text-xs font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                    IP India Registered Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className={cn(inputCls, 'pl-10')}
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className={cn('block text-xs font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                    Agent / Attorney Code *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className={cn(inputCls, 'pl-10 uppercase')}
                      placeholder="e.g. IN/PA-1234"
                      value={form.agentCode}
                      onChange={e => setForm(p => ({ ...p, agentCode: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>

                <div>
                  <label className={cn('block text-xs font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
                    Attorney Name (optional)
                  </label>
                  <input
                    className={inputCls}
                    placeholder="e.g. Manthan Desai"
                    value={form.attorney}
                    onChange={e => setForm(p => ({ ...p, attorney: e.target.value }))}
                  />
                </div>

                {/* Refresh existing toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(p => ({ ...p, refreshExisting: !p.refreshExisting }))}
                    className={cn(
                      'w-10 h-6 rounded-full relative transition-colors duration-200 flex-shrink-0',
                      form.refreshExisting ? 'bg-violet-600' : isDark ? 'bg-slate-700' : 'bg-slate-300'
                    )}
                  >
                    <div className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                      form.refreshExisting ? 'left-5' : 'left-1'
                    )} />
                  </div>
                  <span className={cn('text-sm', isDark ? 'text-slate-300' : 'text-slate-600')}>
                    Also refresh already-tracked trademarks
                  </span>
                </label>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleSendOtp}
                  disabled={loading || !form.email.trim() || !form.agentCode.trim()}
                  className={cn(
                    'w-full py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all',
                    loading || !form.email.trim() || !form.agentCode.trim()
                      ? 'opacity-50 cursor-not-allowed bg-slate-600'
                      : 'bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-500/25'
                  )}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {loading ? 'Sending OTP…' : 'Send OTP to Email'}
                </motion.button>
              </motion.div>
            )}

            {/* STEP 2: OTP Entry */}
            {step === 'otp' && (
              <motion.div key="otp"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <div className={cn(
                  'rounded-2xl p-4 border text-center',
                  isDark ? 'bg-green-900/20 border-green-800/40' : 'bg-green-50 border-green-200'
                )}>
                  <p className={cn('text-sm font-medium', isDark ? 'text-green-300' : 'text-green-700')}>
                    ✅ OTP sent to
                  </p>
                  <p className={cn('text-base font-bold mt-0.5', isDark ? 'text-white' : 'text-slate-800')}>
                    {form.email}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={cn('text-xs font-bold uppercase tracking-wider', isDark ? 'text-slate-400' : 'text-slate-500')}>
                      Enter OTP *
                    </label>
                    <OtpTimer seconds={300} onExpired={() => setOtpExpired(true)} />
                  </div>
                  <div className="relative">
                    <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className={cn(inputCls, 'pl-10 text-center text-xl font-mono tracking-[0.4em]')}
                      placeholder="• • • • • •"
                      maxLength={8}
                      value={form.otp}
                      onChange={e => setForm(p => ({ ...p, otp: e.target.value.replace(/\D/g, '') }))}
                      onKeyDown={e => e.key === 'Enter' && handleStartSync()}
                      autoFocus
                    />
                  </div>
                  {otpExpired && (
                    <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> OTP may have expired. Go back and resend.
                    </p>
                  )}
                </div>

                <div className={cn(
                  'rounded-xl p-3 border text-xs',
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                )}>
                  <p className="font-semibold mb-1">What happens next?</p>
                  <ul className="space-y-1 list-none">
                    {[
                      'Log into IP India estatus with your OTP',
                      `Fetch all trademarks for agent ${form.agentCode}`,
                      form.refreshExisting ? 'Update existing + import new marks' : 'Import only new marks',
                    ].map((t, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 flex-shrink-0 text-violet-400" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setStep('credentials'); setForm(p => ({ ...p, otp: '' })); }}
                    className={cn(
                      'flex-shrink-0 px-4 py-3 rounded-2xl text-sm font-semibold transition-all border',
                      isDark
                        ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    ← Back
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={handleStartSync}
                    disabled={loading || !form.otp.trim()}
                    className={cn(
                      'flex-1 py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all',
                      loading || !form.otp.trim()
                        ? 'opacity-50 cursor-not-allowed bg-slate-600'
                        : 'bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-500/25'
                    )}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {loading ? 'Verifying & Starting…' : 'Verify & Start Sync'}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Syncing */}
            {step === 'syncing' && (
              <motion.div key="syncing"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <div className="text-center py-2">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #4C1D95, #2563EB)' }}>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <RefreshCw className="w-7 h-7 text-white" />
                    </motion.div>
                  </div>
                  <h3 className={cn('text-base font-bold', isDark ? 'text-white' : 'text-slate-800')}>
                    Syncing your portfolio…
                  </h3>
                  <p className={cn('text-sm mt-1', isDark ? 'text-slate-400' : 'text-slate-500')}>
                    {progress?.phase || 'Please wait, this runs in the background.'}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Progress</span>
                    <span className="font-bold text-violet-400">{pct}%</span>
                  </div>
                  <ProgressBar value={pct} color={C.violet} />
                  {progress?.total > 0 && (
                    <p className={cn('text-xs text-center', isDark ? 'text-slate-500' : 'text-slate-400')}>
                      {progress.done} / {progress.total} trademarks processed
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Added',   value: progress?.added   || 0, color: C.green },
                    { label: 'Updated', value: progress?.updated || 0, color: C.midBlue },
                    { label: 'Failed',  value: progress?.failed  || 0, color: C.coral },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={cn(
                      'rounded-xl p-3 text-center border',
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                    )}>
                      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
                      <div className={cn('text-[10px] font-semibold uppercase tracking-wider mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={cn(
                  'rounded-xl p-3 border text-xs flex items-center gap-2',
                  isDark ? 'bg-amber-900/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'
                )}>
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  You can safely close this modal — sync continues in the background.
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className={cn(
                    'w-full py-2.5 rounded-2xl font-semibold text-sm transition-all border',
                    isDark
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  )}
                >
                  Close (sync continues)
                </motion.button>
              </motion.div>
            )}

            {/* STEP 4: Done */}
            {step === 'done' && (
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-5 text-center"
              >
                <div className="py-4">
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${C.green}, #4ade80)` }}
                  >
                    <CheckCircle2 className="w-9 h-9 text-white" />
                  </motion.div>
                  <h3 className={cn('text-xl font-bold', isDark ? 'text-white' : 'text-slate-800')}>
                    Sync Complete!
                  </h3>
                  <p className={cn('text-sm mt-2', isDark ? 'text-slate-400' : 'text-slate-500')}>
                    Your trademark portfolio has been updated.
                  </p>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'New Added', value: progress?.added   || 0, color: C.green,   icon: BarChart3 },
                    { label: 'Refreshed', value: progress?.updated || 0, color: C.midBlue, icon: RefreshCw },
                    { label: 'Failed',    value: progress?.failed  || 0, color: C.coral,   icon: AlertCircle },
                  ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} className={cn(
                      'rounded-xl p-3 border',
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                    )}>
                      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
                      <div className={cn('text-[10px] font-semibold uppercase tracking-wider mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                {progress?.errors?.length > 0 && (
                  <div className={cn(
                    'rounded-xl p-3 border text-xs text-left',
                    isDark ? 'bg-red-900/20 border-red-800/40 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
                  )}>
                    <p className="font-semibold mb-1">Failed to sync:</p>
                    <p className="font-mono">{progress.errors.join(', ')}</p>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={onSyncComplete}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2
                    bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500
                    shadow-lg shadow-violet-500/25 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  View Updated Trademarks
                </motion.button>

                <button
                  onClick={() => {
                    setStep('credentials');
                    setForm(p => ({ ...p, otp: '' }));
                    setProgress(null);
                    setSyncId(null);
                  }}
                  className={cn(
                    'text-xs font-medium transition-colors',
                    isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  Run another sync
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

