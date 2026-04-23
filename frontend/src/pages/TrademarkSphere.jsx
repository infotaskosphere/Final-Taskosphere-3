// TrademarkSphere.jsx — Redesigned to match Dashboard design language
// Drop into: frontend/src/pages/TrademarkSphere.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import useDark from '../hooks/useDark';
import {
  Shield, Plus, Search, RefreshCw, Trash2, Edit2, Eye,
  Calendar, AlertTriangle, CheckCircle2, Clock, X,
  ChevronRight, ExternalLink, Loader2,
  Bell, Download, BarChart3,
  AlertCircle, Filter, Tag, Hash, Zap,
  ArrowUpRight, MoreHorizontal, FileText,
  ShieldCheck, TrendingUp, Activity, Settings2,
  ChevronDown, Info,
} from 'lucide-react';

// ─── Design tokens (mirrors Dashboard) ───────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  coral:        '#FF6B6B',
  amber:        '#F59E0B',
  violet:       '#7C3AED',
};

const slimScroll = {
  overflowY: 'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: '#cbd5e1 transparent',
};

if (typeof document !== 'undefined' && !document.getElementById('tm-slim-scroll')) {
  const s = document.createElement('style');
  s.id = 'tm-slim-scroll';
  s.textContent = `
    .slim-scroll::-webkit-scrollbar { width: 3px; }
    .slim-scroll::-webkit-scrollbar-track { background: transparent; }
    .slim-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    .dark .slim-scroll::-webkit-scrollbar-thumb { background: #475569; }
    @keyframes tm-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes tm-pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
  `;
  document.head.appendChild(s);
}

const springPhysics = {
  card:   { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
  button: { type: 'spring', stiffness: 400, damping: 28 },
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } },
};

// ─── TM Status config ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  'Registered':                    { color: '#1FAF5A', bg: 'rgba(31,175,90,0.12)',    border: 'rgba(31,175,90,0.3)',   dot: '#4ade80' },
  'Pending':                       { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  dot: '#60a5fa' },
  'Under Examination':             { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  dot: '#fbbf24' },
  'Objected':                      { color: '#F97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',  dot: '#fb923c' },
  'Opposed':                       { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   dot: '#f87171' },
  'Accepted & Advertised':         { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.3)',  dot: '#a78bfa' },
  'Advertised Before Acceptance':  { color: '#0D9488', bg: 'rgba(13,148,136,0.12)',  border: 'rgba(13,148,136,0.3)',  dot: '#2dd4bf' },
  'Refused':                       { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   dot: '#f87171' },
  'Abandoned':                     { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', dot: '#94a3b8' },
  'Withdrawn':                     { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', dot: '#94a3b8' },
  'Unknown':                       { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', dot: '#cbd5e1' },
};

const RENEWAL_CFG = {
  overdue:  { color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   label: 'Overdue' },
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   label: '≤30 days' },
  warning:  { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: '≤90 days' },
  upcoming: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  label: '≤180 days' },
  ok:       { color: '#1FAF5A', bg: 'rgba(31,175,90,0.08)',   label: 'OK' },
};

const NICE_CLASSES = Array.from({ length: 45 }, (_, i) => String(i + 1));
const TM_STATUSES = [
  'Registered','Pending','Under Examination','Objected','Opposed',
  'Accepted & Advertised','Advertised Before Acceptance',
  'Refused','Abandoned','Withdrawn','Unknown',
];

const getStatusCfg  = (s) => STATUS_CFG[s]  || STATUS_CFG['Unknown'];
const getRenewalCfg = (s) => RENEWAL_CFG[s] || RENEWAL_CFG['ok'];
const cn = (...c) => c.filter(Boolean).join(' ');

// ─── Reusable primitives (mirroring Dashboard) ───────────────────────────────

function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm min-w-0 w-full ${className}`}>
      {children}
    </div>
  );
}

function CardHeaderRow({ iconBg, icon, title, subtitle, action, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 min-w-0 gap-2">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white leading-none">{badge}</span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action && <div className="flex items-center gap-1">{action}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = getStatusCfg(status);
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function RenewalBadge({ status, daysLeft }) {
  if (!status) return null;
  const cfg = getRenewalCfg(status);
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 6, padding: '2px 7px', fontSize: '0.67rem', fontWeight: 600,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {status === 'overdue'
        ? `Overdue ${Math.abs(daysLeft)}d`
        : daysLeft != null ? `${daysLeft}d left` : cfg.label}
    </span>
  );
}

// ─── Metric Card (matches dashboard style) ───────────────────────────────────
function MetricCard({ icon: Icon, label, value, color, sub, onClick, isDark, urgent }) {
  return (
    <motion.div
      whileHover={{ y: -3, transition: springPhysics.card }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        'rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border',
        urgent
          ? isDark
            ? 'bg-red-900/20 border-red-800 hover:border-red-700'
            : 'bg-red-50/60 border-red-200 hover:border-red-300'
          : isDark
            ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
            : 'bg-white border-slate-200/80 hover:border-slate-300'
      )}
    >
      <div className="p-4 flex flex-col justify-between min-h-[110px]">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color }}>{value ?? 0}</p>
            {sub && <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>}
          </div>
          <div className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
            style={{ backgroundColor: `${color}18` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
        </div>
        <div className={cn('flex items-center gap-1 mt-3 text-xs font-medium transition-colors', isDark ? 'text-slate-500' : 'text-slate-400')}
          style={{ '--hover-color': color }}>
          <span>View all</span>
          <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Add Trademark Modal ──────────────────────────────────────────────────────
function AddTrademarkModal({ onClose, onAdded, isDark }) {
  const [mode, setMode]         = useState('auto');
  const [appNumber, setAppNumber] = useState('');
  const [classNum, setClassNum] = useState('');
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [attorney, setAttorney] = useState('');
  const [notes, setNotes]       = useState('');
  const [emails, setEmails]     = useState('');
  const [manualForm, setManualForm] = useState({
    application_number: '', word_mark: '', class_number: '',
    tm_status: 'Pending', proprietor: '', filing_date: '',
    registration_date: '', valid_upto: '', goods_and_services: '',
  });

  const inputCls = cn(
    'w-full box-border px-3 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2',
    isDark
      ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-900/40'
      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:ring-blue-100'
  );
  const selectCls = cn(
    'w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all cursor-pointer',
    isDark
      ? 'bg-slate-700 border-slate-600 text-slate-100 focus:border-blue-500'
      : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-400'
  );

  const handleFetch = async () => {
    if (!appNumber.trim()) { toast.error('Enter an application number'); return; }
    setLoading(true); setPreview(null);
    try {
      const res = await api.post('/trademark-sphere/fetch-preview', {
        application_number: appNumber.trim(),
        class_number: classNum || null,
      });
      setPreview(res.data);
      toast.success('Trademark data fetched!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to fetch. Try manual mode.');
    } finally { setLoading(false); }
  };

  const handleSaveAuto = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await api.post('/trademark-sphere/add', {
        application_number: appNumber.trim(),
        class_number: classNum || null,
        attorney, notes,
        reminder_emails: emails.split(',').map(e => e.trim()).filter(Boolean),
        manual_data: preview,
      });
      toast.success(`"${res.data.word_mark || appNumber}" added to Trademark Sphere`);
      onAdded(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add trademark');
    } finally { setSaving(false); }
  };

  const handleSaveManual = async () => {
    if (!manualForm.application_number.trim() || !manualForm.word_mark.trim()) {
      toast.error('Application number and word mark are required'); return;
    }
    setSaving(true);
    try {
      const res = await api.post('/trademark-sphere/add-manual', {
        ...manualForm, attorney, notes,
        reminder_emails: emails.split(',').map(e => e.trim()).filter(Boolean),
      });
      toast.success(`"${res.data.word_mark}" added!`);
      onAdded(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add trademark');
    } finally { setSaving(false); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,15,30,0.72)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.88, y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}
        className={cn(
          'w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl',
          isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'
        )}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="px-6 py-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">Trademark Sphere</p>
                <h2 className="text-lg font-bold text-white">Add New Trademark</h2>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all active:scale-90">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Mode toggle */}
          <div className={cn('flex gap-1 p-1 rounded-xl mb-6', isDark ? 'bg-slate-800' : 'bg-slate-100')}>
            {[
              { id: 'auto',   label: '🔍 Auto-fetch from IP India' },
              { id: 'manual', label: '✏️ Add Manually' },
            ].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} className={cn(
                'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                mode === m.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              )}>{m.label}</button>
            ))}
          </div>

          {mode === 'auto' ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="col-span-2">
                  <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>Application Number *</label>
                  <input className={inputCls} value={appNumber}
                    onChange={e => setAppNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFetch()}
                    placeholder="e.g. 1234567" />
                </div>
                <div>
                  <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>Class</label>
                  <select className={selectCls} value={classNum} onChange={e => setClassNum(e.target.value)}>
                    <option value="">Any</option>
                    {NICE_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                onClick={handleFetch} disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 mb-4"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                {loading
                  ? <><Loader2 className="w-4 h-4" style={{ animation: 'tm-spin 1s linear infinite' }} />Fetching from IP India…</>
                  : <><Search className="w-4 h-4" />Fetch Trademark Data</>}
              </motion.button>

              {preview && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={cn('rounded-2xl p-4 mb-4 border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200')}>
                  <div className="flex items-start gap-3 mb-3">
                    {preview.trademark_image_url && (
                      <img src={preview.trademark_image_url} alt="TM"
                        className="w-16 h-16 object-contain rounded-xl bg-white p-1 border border-slate-200 flex-shrink-0" />
                    )}
                    <div>
                      <p className={cn('text-lg font-bold', isDark ? 'text-slate-100' : 'text-slate-800')}>{preview.word_mark || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">App #{preview.application_number} · Class {preview.class_number || '—'}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <StatusBadge status={preview.tm_status || 'Unknown'} />
                        {preview.renewal_status && <RenewalBadge status={preview.renewal_status} daysLeft={preview.days_until_renewal} />}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs">
                    {[['Proprietor', preview.proprietor], ['Filing Date', preview.filing_date],
                      ['Reg. Date', preview.registration_date], ['Valid Upto', preview.valid_upto],
                    ].map(([k, v]) => v ? (
                      <div key={k}><span className="text-slate-400">{k}: </span>
                        <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{v}</span>
                      </div>
                    ) : null)}
                  </div>
                  {preview.goods_and_services && (
                    <p className={cn('text-xs mt-2 pt-2 border-t leading-relaxed', isDark ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200')}>
                      {preview.goods_and_services.slice(0, 200)}{preview.goods_and_services.length > 200 ? '…' : ''}
                    </p>
                  )}
                </motion.div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { key: 'application_number', label: 'Application Number *', span: false },
                { key: 'word_mark', label: 'Word Mark / TM Name *', span: false },
                { key: 'tm_status', label: 'Status', span: false, type: 'select', options: TM_STATUSES },
                { key: 'class_number', label: 'Nice Class', span: false, type: 'select',
                  options: NICE_CLASSES.map(c => ({ value: c, label: `Class ${c}` })) },
                { key: 'proprietor', label: 'Proprietor', span: false },
                { key: 'filing_date', label: 'Filing Date', span: false, type: 'date' },
                { key: 'registration_date', label: 'Registration Date', span: false, type: 'date' },
                { key: 'valid_upto', label: 'Valid Upto', span: false, type: 'date' },
                { key: 'goods_and_services', label: 'Goods & Services', span: true, type: 'textarea' },
              ].map(({ key, label, span, type, options }) => (
                <div key={key} className={span ? 'col-span-2' : ''}>
                  <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>{label}</label>
                  {type === 'select' ? (
                    <select className={selectCls} value={manualForm[key]}
                      onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Select…</option>
                      {(options || []).map(o => (
                        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
                          {typeof o === 'string' ? o : o.label}
                        </option>
                      ))}
                    </select>
                  ) : type === 'textarea' ? (
                    <textarea className={cn(inputCls, 'resize-vertical')} rows={3} value={manualForm[key]}
                      onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))} />
                  ) : (
                    <input type={type || 'text'} className={inputCls} value={manualForm[key]}
                      onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Common fields */}
          {(preview || mode === 'manual') && (
            <div className={cn('pt-4 mt-2 border-t space-y-3', isDark ? 'border-slate-700' : 'border-slate-200')}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>Attorney / Agent</label>
                  <input className={inputCls} value={attorney} onChange={e => setAttorney(e.target.value)} placeholder="Attorney name" />
                </div>
                <div>
                  <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>Reminder Emails</label>
                  <input className={inputCls} value={emails} onChange={e => setEmails(e.target.value)} placeholder="a@b.com, c@d.com" />
                </div>
              </div>
              <div>
                <label className={cn('block text-xs font-semibold uppercase tracking-wider mb-1.5', isDark ? 'text-slate-400' : 'text-slate-500')}>Notes</label>
                <textarea className={cn(inputCls, 'resize-vertical')} rows={2} value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn('px-6 py-4 flex items-center justify-end gap-3 border-t', isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50')}>
          <button onClick={onClose} className={cn(
            'px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
            isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'
          )}>Cancel</button>
          {mode === 'auto' && preview && (
            <motion.button whileTap={{ scale: 0.98 }} onClick={handleSaveAuto} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>
              {saving ? <Loader2 className="w-4 h-4" style={{ animation: 'tm-spin 1s linear infinite' }} /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? 'Adding…' : 'Add to Trademark Sphere'}
            </motion.button>
          )}
          {mode === 'manual' && (
            <motion.button whileTap={{ scale: 0.98 }} onClick={handleSaveManual} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>
              {saving ? <Loader2 className="w-4 h-4" style={{ animation: 'tm-spin 1s linear infinite' }} /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? 'Adding…' : 'Add Trademark'}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
function DetailDrawer({ tm, onClose, onRefresh, onDelete, isDark }) {
  const [editing,    setEditing]    = useState(false);
  const [form,       setForm]       = useState({});
  const [saving,     setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  useEffect(() => {
    if (tm) setForm({
      attorney:           tm.attorney || '',
      notes:              tm.notes || '',
      reminder_emails:    (tm.reminder_emails || []).join(', '),
      valid_upto:         tm.valid_upto || '',
      tm_status:          tm.tm_status || '',
      goods_and_services: tm.goods_and_services || '',
    });
  }, [tm]);

  if (!tm) return null;

  const inputCls = cn(
    'w-full box-border px-3 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2',
    isDark
      ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-900/40'
      : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-400 focus:ring-blue-100'
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/trademark-sphere/${tm.id}`, {
        ...form,
        reminder_emails: form.reminder_emails.split(',').map(e => e.trim()).filter(Boolean),
      });
      toast.success('Trademark updated');
      onRefresh(res.data);
      setEditing(false);
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post(`/trademark-sphere/${tm.id}/refresh`);
      toast.success('Refreshed from IP India');
      onRefresh(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Refresh failed');
    } finally { setRefreshing(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove "${tm.word_mark}" from Trademark Sphere?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/trademark-sphere/${tm.id}`);
      toast.success('Trademark removed');
      onDelete(tm.id);
      onClose();
    } catch { toast.error('Failed to delete'); }
    finally { setDeleting(false); }
  };

  const FieldRow = ({ label, value }) => {
    if (!value) return null;
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
        <p className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-700')}>{value}</p>
      </div>
    );
  };

  const isUrgent = tm.renewal_status === 'critical' || tm.renewal_status === 'overdue';
  const isWarning = tm.renewal_status === 'warning';

  return (
    <motion.div
      className="fixed inset-0 z-[999] flex justify-end"
      style={{ background: 'rgba(7,15,30,0.5)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        className={cn(
          'w-[480px] max-w-full h-full flex flex-col shadow-2xl',
          isDark ? 'bg-slate-900 border-l border-slate-700' : 'bg-white border-l border-slate-200'
        )}
        style={{ overflowY: 'auto' }}
      >
        {/* Drawer top gradient */}
        <div className="px-6 pt-6 pb-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="absolute right-0 top-0 w-40 h-40 rounded-full -mr-12 -mt-12 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              {tm.trademark_image_url && (
                <img src={tm.trademark_image_url} alt="TM"
                  className="w-14 h-14 object-contain rounded-xl bg-white p-1.5 mb-3" />
              )}
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mb-1">Trademark Details</p>
              <h2 className="text-xl font-bold text-white">{tm.word_mark || tm.application_number}</h2>
              <div className="flex gap-2 flex-wrap mt-2">
                <StatusBadge status={tm.tm_status || 'Unknown'} />
                {tm.class_number && (
                  <span style={{
                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                    borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600,
                  }}>Class {tm.class_number}</span>
                )}
                {tm.renewal_status && <RenewalBadge status={tm.renewal_status} daysLeft={tm.days_until_renewal} />}
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all flex-shrink-0">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Actions row */}
        <div className={cn('flex gap-2 px-5 py-3 flex-wrap border-b', isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50')}>
          {[
            { label: 'Refresh', icon: RefreshCw, loading: refreshing, onClick: handleRefresh, color: COLORS.mediumBlue },
            { label: editing ? 'Cancel' : 'Edit', icon: Edit2, onClick: () => setEditing(!editing), color: COLORS.amber },
            { label: 'Remove', icon: Trash2, loading: deleting, onClick: handleDelete, color: COLORS.coral },
          ].map(({ label, icon: Icon, loading: isLoading, onClick, color }) => (
            <button key={label} onClick={onClick} disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95"
              style={{ background: `${color}12`, color, border: `1px solid ${color}28` }}>
              {isLoading
                ? <Loader2 className="w-3 h-3" style={{ animation: 'tm-spin 1s linear infinite' }} />
                : <Icon className="w-3 h-3" />}
              {label}
            </button>
          ))}
          <a href="https://tmrsearch.ipindia.gov.in/eregister/eregister.aspx" target="_blank" rel="noreferrer"
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
              isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100')}>
            <ExternalLink className="w-3 h-3" />IP India
          </a>
        </div>

        <div className="flex-1 p-5 space-y-4">
          {/* Urgency alert */}
          {(isUrgent || isWarning) && (
            <div className={cn('rounded-2xl p-3.5 flex gap-3 items-start',
              isUrgent
                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800')}>
              <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', isUrgent ? 'text-red-500' : 'text-amber-500')} />
              <div>
                <p className={cn('text-sm font-bold', isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                  {tm.renewal_status === 'overdue'
                    ? `Renewal OVERDUE by ${Math.abs(tm.days_until_renewal)} days!`
                    : `Renewal due in ${tm.days_until_renewal} days`}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Renewal date: {tm.renewal_date || tm.valid_upto}</p>
              </div>
            </div>
          )}

          {editing ? (
            <div className="space-y-3">
              {[
                { key: 'tm_status', label: 'Status', type: 'select', options: TM_STATUSES },
                { key: 'valid_upto', label: 'Valid Upto (Renewal Date)', type: 'date' },
                { key: 'attorney', label: 'Attorney / Agent' },
                { key: 'reminder_emails', label: 'Reminder Emails (comma-sep.)' },
                { key: 'goods_and_services', label: 'Goods & Services', type: 'textarea' },
                { key: 'notes', label: 'Notes', type: 'textarea' },
              ].map(({ key, label, type, options }) => (
                <div key={key}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
                  {type === 'select' ? (
                    <select className={cn(inputCls)} value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
                      {(options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type === 'textarea' ? (
                    <textarea className={cn(inputCls, 'resize-vertical')} rows={3} value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
                  ) : (
                    <input type={type || 'text'} className={inputCls} value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
                  )}
                </div>
              ))}
              <motion.button whileTap={{ scale: 0.98 }} onClick={handleSave} disabled={saving}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>
                {saving ? <Loader2 className="w-4 h-4" style={{ animation: 'tm-spin 1s linear infinite' }} /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </motion.button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Registry Info */}
              <div className={cn('rounded-2xl p-4 border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200')}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Registry Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Application No." value={tm.application_number} />
                  <FieldRow label="Nice Class" value={tm.class_number ? `Class ${tm.class_number}` : null} />
                  <FieldRow label="Filing Date" value={tm.filing_date} />
                  <FieldRow label="Registration Date" value={tm.registration_date} />
                  <FieldRow label="Valid Upto" value={tm.valid_upto} />
                  <FieldRow label="Renewal Date" value={tm.renewal_date} />
                </div>
              </div>

              {/* Owner Details */}
              <div className={cn('rounded-2xl p-4 border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200')}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Owner Details</p>
                <div className="space-y-2">
                  <FieldRow label="Proprietor" value={tm.proprietor} />
                  <FieldRow label="Applicant Name" value={tm.applicant_name} />
                  <FieldRow label="Address" value={tm.address} />
                </div>
              </div>

              {/* G&S */}
              {tm.goods_and_services && (
                <div className={cn('rounded-2xl p-4 border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200')}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Goods & Services</p>
                  <p className={cn('text-sm leading-relaxed', isDark ? 'text-slate-300' : 'text-slate-600')}>{tm.goods_and_services}</p>
                </div>
              )}

              {/* Internal */}
              <div className={cn('rounded-2xl p-4 border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200')}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Internal</p>
                <div className="space-y-2">
                  <FieldRow label="Attorney / Agent" value={tm.attorney} />
                  <FieldRow label="Client" value={tm.client_name} />
                  <FieldRow label="Reminder Emails" value={tm.reminder_emails?.length ? tm.reminder_emails.join(', ') : null} />
                  <FieldRow label="Last Refreshed" value={tm.last_fetched ? new Date(tm.last_fetched).toLocaleString('en-IN') : 'Manual'} />
                </div>
                {tm.notes && (
                  <div className={cn('mt-3 p-3 rounded-xl border', isDark ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200')}>
                    <p className="text-xs text-emerald-500 font-bold mb-1">📝 Notes</p>
                    <p className={cn('text-sm leading-relaxed', isDark ? 'text-slate-300' : 'text-slate-600')}>{tm.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Deadline Card ────────────────────────────────────────────────────────────
function DeadlineCard({ tm, onClick, isDark }) {
  const cfg = getRenewalCfg(tm.renewal_status || 'ok');
  const isOverdue = tm.renewal_status === 'overdue';
  return (
    <motion.div
      whileHover={{ y: -2, transition: springPhysics.lift }}
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-4 cursor-pointer transition-all flex items-center gap-4',
        isOverdue
          ? isDark ? 'bg-red-900/20 border-red-800 hover:border-red-700' : 'bg-red-50/70 border-red-200 hover:border-red-300'
          : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600 hover:shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
      )}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg }}>
        <Calendar className="w-5 h-5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('font-bold text-sm', isDark ? 'text-slate-100' : 'text-slate-800')}>{tm.word_mark || tm.application_number}</span>
          <StatusBadge status={tm.tm_status || 'Unknown'} />
          {tm.class_number && <span className="text-xs text-slate-400">Class {tm.class_number}</span>}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">App #{tm.application_number}{tm.proprietor ? ` · ${tm.proprietor}` : ''}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-slate-400">{tm.renewal_date || tm.valid_upto}</p>
        <RenewalBadge status={tm.renewal_status} daysLeft={tm.days_until_renewal} />
      </div>
      <ChevronRight className={cn('w-4 h-4 flex-shrink-0', isDark ? 'text-slate-600' : 'text-slate-300')} />
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrademarkSphere() {
  const isDark = useDark();
  const { user } = useAuth();

  const [trademarks,    setTrademarks]    = useState([]);
  const [stats,         setStats]         = useState(null);
  const [deadlines,     setDeadlines]     = useState({ upcoming: [], overdue: [] });
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterClass,   setFilterClass]   = useState('');
  const [filterAlert,   setFilterAlert]   = useState('');
  const [totalCount,    setTotalCount]    = useState(0);
  const [page,          setPage]          = useState(0);
  const [showAdd,       setShowAdd]       = useState(false);
  const [activeTab,     setActiveTab]     = useState('list');
  const [selectedTm,    setSelectedTm]    = useState(null);
  const [showFilters,   setShowFilters]   = useState(false);
  const LIMIT = 50;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: String(page * LIMIT), limit: String(LIMIT),
        ...(search       ? { search }             : {}),
        ...(filterStatus ? { tm_status: filterStatus } : {}),
        ...(filterClass  ? { class_number: filterClass } : {}),
        ...(filterAlert  ? { renewal_alert: filterAlert } : {}),
      });
      const [listRes, statsRes, dlRes] = await Promise.all([
        api.get(`/trademark-sphere/list?${params}`),
        api.get('/trademark-sphere/stats'),
        api.get('/trademark-sphere/deadlines?days=180'),
      ]);
      setTrademarks(listRes.data.items);
      setTotalCount(listRes.data.total);
      setStats(statsRes.data);
      setDeadlines(dlRes.data);
    } catch {
      toast.error('Failed to load trademark data');
    } finally { setLoading(false); }
  }, [page, search, filterStatus, filterClass, filterAlert]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(0); }, [search, filterStatus, filterClass, filterAlert]);

  const handleAdded = () => { setShowAdd(false); fetchAll(); };
  const handleRefreshed = (updated) => {
    setTrademarks(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTm(updated);
  };
  const handleDeleted = (id) => {
    setTrademarks(prev => prev.filter(t => t.id !== id));
    setTotalCount(n => n - 1);
    fetchAll();
  };

  const exportCSV = () => {
    if (!trademarks.length) return;
    const headers = ['App No','Word Mark','Class','Status','Proprietor','Filing Date','Renewal Date','Days Left','Attorney','Notes'];
    const rows = trademarks.map(t => [
      t.application_number, t.word_mark, t.class_number, t.tm_status,
      t.proprietor, t.filing_date, t.renewal_date || t.valid_upto,
      t.days_until_renewal ?? '', t.attorney, t.notes,
    ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `trademark_sphere_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const hasActiveFilters = search || filterStatus || filterClass || filterAlert;

  const selectCls = cn(
    'px-3 py-2 rounded-xl border text-sm outline-none transition-all cursor-pointer',
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500'
      : 'bg-white border-slate-200 text-slate-700 focus:border-blue-400'
  );

  return (
    <>
      {loading && (
        <div className="fixed top-0 left-0 right-0 z-[99999] h-0.5">
          <div className="h-full animate-pulse"
            style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue}, ${COLORS.emeraldGreen})` }} />
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddTrademarkModal key="add" isDark={isDark} onClose={() => setShowAdd(false)} onAdded={handleAdded} />
        )}
        {selectedTm && (
          <DetailDrawer key="detail" isDark={isDark} tm={selectedTm}
            onClose={() => setSelectedTm(null)} onRefresh={handleRefreshed} onDelete={handleDeleted} />
        )}
      </AnimatePresence>

      <motion.div className="space-y-5 w-full min-w-0 overflow-x-hidden pb-10"
        variants={containerVariants} initial="hidden" animate="visible">

        {/* ── WELCOME BANNER ── */}
        <motion.div variants={itemVariants}>
          <div className="relative overflow-hidden rounded-2xl px-5 sm:px-7 pt-5 pb-5"
            style={{
              background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)`,
              boxShadow: `0 8px 32px rgba(13,59,102,0.28)`,
            }}>
            <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5"
              style={{ background: 'white' }} />

            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Shield className="h-3 w-3" />
                  IP India Registry Monitor
                </p>
                <h1 className="text-2xl font-bold text-white tracking-tight">Trademark Sphere</h1>
                <p className="text-white/60 text-sm mt-1">Track, monitor &amp; manage all trademark registrations</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all active:scale-95">
                  <Download className="w-3.5 h-3.5" />Export CSV
                </button>
                <button onClick={fetchAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all active:scale-95">
                  <RefreshCw className="w-3.5 h-3.5" />Refresh
                </button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white text-blue-700 shadow-lg transition-all">
                  <Plus className="w-4 h-4" />Add Trademark
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── METRIC CARDS ── */}
        {stats && (
          <motion.div variants={itemVariants}
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard isDark={isDark} icon={Shield}         label="Total Tracked"     value={stats.total}             color={COLORS.mediumBlue}   sub="All marks" />
            <MetricCard isDark={isDark} icon={CheckCircle2}   label="Registered"        value={stats.registered}        color={COLORS.emeraldGreen} sub="Active marks" />
            <MetricCard isDark={isDark} icon={Clock}          label="Pending / Active"  value={stats.pending}           color="#3B82F6"              sub="Under process" />
            <MetricCard isDark={isDark} icon={AlertTriangle}  label="Expiring ≤90d"     value={stats.expiring_soon}     color={COLORS.amber}        sub="Need renewal"
              urgent={stats.expiring_soon > 0} />
            <MetricCard isDark={isDark} icon={AlertCircle}    label="Overdue"           value={stats.overdue}           color={COLORS.coral}        sub="Renewal past"
              urgent={stats.overdue > 0} />
            <MetricCard isDark={isDark} icon={Bell}           label="Reminders (30d)"   value={stats.upcoming_reminders} color={COLORS.violet}      sub="Upcoming" />
          </motion.div>
        )}

        {/* ── TABS ── */}
        <motion.div variants={itemVariants} className="flex items-center justify-between gap-3 flex-wrap">
          <div className={cn('flex gap-1 p-1 rounded-xl border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-transparent')}>
            {[
              { id: 'list',      label: '📋 All Trademarks', count: totalCount },
              { id: 'deadlines', label: '⏰ Deadlines',
                count: deadlines.overdue.length + deadlines.upcoming.length },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                )}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-400/20 text-slate-500')}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'list' && (
            <button onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all',
                hasActiveFilters
                  ? 'bg-blue-600 text-white border-blue-600'
                  : isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              )}>
              <Filter className="w-3.5 h-3.5" />
              Filters {hasActiveFilters && '·' }
              {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />}
            </button>
          )}
        </motion.div>

        {/* ── LIST TAB ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'list' && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Filters panel */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                    <div className={cn('rounded-2xl p-4 border space-y-3', isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Search */}
                        <div className="relative sm:col-span-2 md:col-span-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search mark, app #, proprietor…"
                            className={cn(
                              'w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none transition-all focus:ring-2',
                              isDark
                                ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-900/40'
                                : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:ring-blue-100'
                            )} />
                        </div>

                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls}>
                          <option value="">All Statuses</option>
                          {TM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className={selectCls}>
                          <option value="">All Classes</option>
                          {NICE_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                        </select>

                        <select value={filterAlert} onChange={e => setFilterAlert(e.target.value)} className={selectCls}>
                          <option value="">All Renewal States</option>
                          {Object.entries(RENEWAL_CFG).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </div>

                      {hasActiveFilters && (
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          <span className="text-xs text-slate-400">Active filters:</span>
                          {search && <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700')}>"{search}"</span>}
                          {filterStatus && <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')}>{filterStatus}</span>}
                          {filterClass && <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')}>Class {filterClass}</span>}
                          {filterAlert && <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')}>{filterAlert}</span>}
                          <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterClass(''); setFilterAlert(''); }}
                            className="ml-auto text-xs font-semibold text-red-500 hover:text-red-600 flex items-center gap-1">
                            <X className="w-3 h-3" />Clear all
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Table card */}
              <SectionCard>
                <CardHeaderRow
                  iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                  icon={<Shield className="h-4 w-4 text-blue-500" />}
                  title="Trademarks"
                  subtitle={`${totalCount} total · newest first`}
                  badge={totalCount}
                  action={
                    <button onClick={() => setShowAdd(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                      style={{ background: `${COLORS.mediumBlue}15`, color: COLORS.mediumBlue }}>
                      <Plus className="w-3.5 h-3.5" />Add
                    </button>
                  }
                />

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="w-7 h-7 text-blue-500" style={{ animation: 'tm-spin 1s linear infinite' }} />
                    <p className="text-sm text-slate-400">Loading trademarks…</p>
                  </div>
                ) : trademarks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className={cn('p-4 rounded-2xl', isDark ? 'bg-slate-700' : 'bg-slate-100')}>
                      <Shield className="w-10 h-10 text-slate-400" />
                    </div>
                    <div className="text-center">
                      <p className={cn('font-semibold text-base mb-1', isDark ? 'text-slate-200' : 'text-slate-700')}>No trademarks found</p>
                      <p className="text-sm text-slate-400 mb-4">
                        {hasActiveFilters ? 'Try adjusting your filters' : 'Add a trademark to start tracking'}
                      </p>
                      {!hasActiveFilters && (
                        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowAdd(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white mx-auto"
                          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                          <Plus className="w-4 h-4" />Add First Trademark
                        </motion.button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className={cn(
                      'hidden md:grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b',
                      'grid-cols-[32px_1.8fr_0.8fr_1.2fr_1.2fr_1fr_1fr_60px] gap-3',
                      isDark ? 'text-slate-500 border-slate-700 bg-slate-800/50' : 'text-slate-400 border-slate-100 bg-slate-50'
                    )}>
                      <span>#</span>
                      <span>Trademark / App No.</span>
                      <span>Class</span>
                      <span>Status</span>
                      <span>Proprietor</span>
                      <span>Filing Date</span>
                      <span>Renewal</span>
                      <span />
                    </div>

                    {trademarks.map((tm, i) => (
                      <motion.div key={tm.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0, transition: { delay: i * 0.02 } }}
                        onClick={() => setSelectedTm(tm)}
                        className={cn(
                          'flex flex-col md:grid px-4 py-3.5 border-b cursor-pointer transition-all group',
                          'md:grid-cols-[32px_1.8fr_0.8fr_1.2fr_1.2fr_1fr_1fr_60px] gap-3 md:items-center',
                          isDark
                            ? 'border-slate-700/60 hover:bg-slate-700/40'
                            : 'border-slate-100 hover:bg-slate-50'
                        )}
                      >
                        {/* Row number */}
                        <span className="hidden md:block text-xs text-slate-400">{page * LIMIT + i + 1}</span>

                        {/* TM name */}
                        <div className="flex items-start gap-2">
                          <div>
                            <p className={cn('font-semibold text-sm', isDark ? 'text-slate-100' : 'text-slate-800')}>
                              {tm.word_mark || '—'}
                            </p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{tm.application_number}</p>
                          </div>
                        </div>

                        {/* Class */}
                        <span className="text-sm text-slate-400">{tm.class_number ? `Class ${tm.class_number}` : '—'}</span>

                        {/* Status */}
                        <div><StatusBadge status={tm.tm_status || 'Unknown'} /></div>

                        {/* Proprietor */}
                        <p className="text-sm text-slate-400 truncate">{tm.proprietor || tm.applicant_name || '—'}</p>

                        {/* Filing date */}
                        <span className="text-sm text-slate-400">{tm.filing_date || '—'}</span>

                        {/* Renewal */}
                        <div>
                          {tm.renewal_date || tm.valid_upto ? (
                            <>
                              <p className="text-xs text-slate-400">{tm.renewal_date || tm.valid_upto}</p>
                              <RenewalBadge status={tm.renewal_status} daysLeft={tm.days_until_renewal} />
                            </>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </div>

                        {/* Action */}
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setSelectedTm(tm)}
                            className={cn(
                              'p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100',
                              isDark
                                ? 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-600'
                            )}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}

                    {/* Pagination */}
                    {totalCount > LIMIT && (
                      <div className={cn('flex items-center justify-between px-4 py-3 border-t', isDark ? 'border-slate-700' : 'border-slate-100')}>
                        <span className="text-xs text-slate-400">
                          {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, totalCount)} of {totalCount}
                        </span>
                        <div className="flex gap-2">
                          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                            className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-40' : 'border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40')}>
                            ← Prev
                          </button>
                          <button disabled={(page + 1) * LIMIT >= totalCount} onClick={() => setPage(p => p + 1)}
                            className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-40' : 'border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40')}>
                            Next →
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </SectionCard>
            </motion.div>
          )}

          {/* ── DEADLINES TAB ── */}
          {activeTab === 'deadlines' && (
            <motion.div key="deadlines" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-5">

              {/* Overdue */}
              {deadlines.overdue.length > 0 && (
                <SectionCard>
                  <CardHeaderRow
                    iconBg={isDark ? 'bg-red-900/40' : 'bg-red-50'}
                    icon={<AlertCircle className="h-4 w-4 text-red-500" />}
                    title={`Overdue Renewals`}
                    subtitle="These trademarks require immediate attention"
                    badge={deadlines.overdue.length}
                  />
                  <div className="p-4 space-y-3">
                    {deadlines.overdue.map(tm => (
                      <DeadlineCard key={tm.id} tm={tm} isDark={isDark} onClick={() => setSelectedTm(tm)} />
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Upcoming */}
              <SectionCard>
                <CardHeaderRow
                  iconBg={isDark ? 'bg-amber-900/40' : 'bg-amber-50'}
                  icon={<Clock className="h-4 w-4 text-amber-500" />}
                  title="Upcoming Renewals"
                  subtitle="Next 180 days"
                  badge={deadlines.upcoming.length}
                />
                <div className="p-4">
                  {deadlines.upcoming.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                      <div className={cn('p-4 rounded-2xl', isDark ? 'bg-slate-700' : 'bg-slate-100')}>
                        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                      </div>
                      <div className="text-center">
                        <p className={cn('font-semibold text-base mb-1', isDark ? 'text-slate-200' : 'text-slate-700')}>All clear!</p>
                        <p className="text-sm text-slate-400">No renewals due in the next 6 months</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deadlines.upcoming.map(tm => (
                        <DeadlineCard key={tm.id} tm={tm} isDark={isDark} onClick={() => setSelectedTm(tm)} />
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Summary strip */}
              {(deadlines.upcoming.length > 0 || deadlines.overdue.length > 0) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Critical (≤30d)', value: deadlines.upcoming.filter(t => t.renewal_status === 'critical').length, color: COLORS.coral },
                    { label: 'Warning (≤90d)',  value: deadlines.upcoming.filter(t => t.renewal_status === 'warning').length, color: COLORS.amber },
                    { label: 'Upcoming (≤180d)', value: deadlines.upcoming.filter(t => t.renewal_status === 'upcoming').length, color: '#3B82F6' },
                    { label: 'Total Overdue',  value: deadlines.overdue.length, color: '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={cn('rounded-2xl p-4 border', isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
