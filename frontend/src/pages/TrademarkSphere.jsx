// TrademarkSphere.jsx — Trademark Management Module for Taskosphere
// Drop into: frontend/src/pages/TrademarkSphere.jsx
// Add route in AppRoutes.jsx + nav item in DashboardLayout.jsx (see README)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import {
  Shield, Plus, Search, RefreshCw, Trash2, Edit2, Eye,
  Calendar, AlertTriangle, CheckCircle2, Clock, X,
  ChevronDown, ChevronRight, ExternalLink, Loader2,
  FileText, StickyNote, Bell, Download, BarChart3,
  TrendingUp, AlertCircle, Info, Sparkles, BookOpen,
  Filter, Tag, Building2, Hash, ShieldCheck, Zap,
  ArrowUpRight, CircleDot, MoreHorizontal, Upload,
} from 'lucide-react';

// ─── Design tokens (match CompliancePage dark theme) ─────────────────────────
const D = {
  bg:     '#0f172a',
  card:   '#1e293b',
  raised: '#263348',
  border: '#334155',
  text:   '#f1f5f9',
  muted:  '#94a3b8',
  dimmer: '#64748b',
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

// ─── Renewal urgency config ───────────────────────────────────────────────────
const RENEWAL_CFG = {
  overdue:  { color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   label: 'Overdue',      icon: '🔴' },
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   label: '≤30 days',     icon: '🔴' },
  warning:  { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: '≤90 days',     icon: '🟡' },
  upcoming: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  label: '≤180 days',    icon: '🔵' },
  ok:       { color: '#1FAF5A', bg: 'rgba(31,175,90,0.08)',   label: 'OK',           icon: '🟢' },
};

const NICE_CLASSES = Array.from({ length: 45 }, (_, i) => String(i + 1));
const TM_STATUSES = [
  'Registered','Pending','Under Examination','Objected','Opposed',
  'Accepted & Advertised','Advertised Before Acceptance',
  'Refused','Abandoned','Withdrawn','Unknown',
];

// ─── Utility helpers ──────────────────────────────────────────────────────────
const getStatusCfg = (s) => STATUS_CFG[s] || STATUS_CFG['Unknown'];
const getRenewalCfg = (s) => RENEWAL_CFG[s] || RENEWAL_CFG['ok'];

function StatusBadge({ status, size = 'sm' }) {
  const cfg = getStatusCfg(status);
  const px = size === 'sm' ? '6px 10px' : '4px 8px';
  const fs = size === 'sm' ? '0.72rem' : '0.65rem';
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 6, padding: px, fontSize: fs, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
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
      borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 600,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {status === 'overdue'
        ? `Overdue ${Math.abs(daysLeft)}d`
        : daysLeft != null ? `${daysLeft}d left` : cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: D.card, border: `1px solid ${D.border}`, borderRadius: 12,
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
        position: 'relative', overflow: 'hidden',
      }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: color, borderRadius: '12px 12px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.78rem', color: D.muted, fontWeight: 500 }}>{label}</span>
        <div style={{ background: `${color}20`, borderRadius: 8, padding: 6 }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: D.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: D.dimmer }}>{sub}</div>}
    </motion.div>
  );
}

function SectionHeader({ title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: D.text }}>{title}</h2>
      <div style={{ display: 'flex', gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background: active ? (color || '#1F6FB2') : D.raised,
      color: active ? '#fff' : D.muted,
      border: `1px solid ${active ? (color || '#1F6FB2') : D.border}`,
      borderRadius: 20, padding: '4px 12px', fontSize: '0.75rem',
      cursor: 'pointer', transition: 'all 0.15s', fontWeight: active ? 600 : 400,
    }}>{label}</button>
  );
}

function Input({ value, onChange, placeholder, icon: Icon, style: s }) {
  return (
    <div style={{ position: 'relative', ...s }}>
      {Icon && (
        <Icon size={14} style={{ position: 'absolute', left: 10, top: '50%',
          transform: 'translateY(-50%)', color: D.muted, pointerEvents: 'none' }} />
      )}
      <input value={value} onChange={onChange} placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: D.raised, border: `1px solid ${D.border}`,
          borderRadius: 8, padding: Icon ? '8px 10px 8px 30px' : '8px 10px',
          color: D.text, fontSize: '0.85rem', outline: 'none',
        }} />
    </div>
  );
}

function Select({ value, onChange, options, placeholder, style: s }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: D.raised, border: `1px solid ${D.border}`,
      borderRadius: 8, padding: '8px 10px', color: value ? D.text : D.muted,
      fontSize: '0.85rem', outline: 'none', cursor: 'pointer', ...s,
    }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function Btn({ children, onClick, variant = 'primary', size = 'md', icon: Icon, loading, disabled, style: s }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 8, border: 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontWeight: 600, transition: 'all 0.15s', opacity: disabled || loading ? 0.6 : 1,
    padding: size === 'sm' ? '5px 12px' : '8px 16px',
    fontSize: size === 'sm' ? '0.78rem' : '0.85rem',
  };
  const variants = {
    primary:  { background: '#1F6FB2', color: '#fff' },
    danger:   { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
    ghost:    { background: D.raised, color: D.muted, border: `1px solid ${D.border}` },
    success:  { background: 'rgba(31,175,90,0.15)', color: '#1FAF5A', border: '1px solid rgba(31,175,90,0.3)' },
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ ...base, ...variants[variant], ...s }}>
      {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
               : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

// ─── Add Trademark Modal ──────────────────────────────────────────────────────
function AddTrademarkModal({ onClose, onAdded }) {
  const [mode, setMode]         = useState('auto'); // 'auto' | 'manual'
  const [appNumber, setAppNumber] = useState('');
  const [classNum, setClassNum] = useState('');
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [attorney, setAttorney] = useState('');
  const [notes, setNotes]       = useState('');
  const [emails, setEmails]     = useState('');

  // Manual form state
  const [manualForm, setManualForm] = useState({
    application_number: '', word_mark: '', class_number: '',
    tm_status: 'Pending', proprietor: '', filing_date: '',
    registration_date: '', valid_upto: '', goods_and_services: '',
  });

  const handleFetch = async () => {
    if (!appNumber.trim()) { toast.error('Enter an application number'); return; }
    setLoading(true); setPreview(null);
    try {
      const res = await api.post('/trademark-sphere/fetch-preview', {
        application_number: appNumber.trim(),
        class_number: classNum || null,
      });
      setPreview(res.data);
      toast.success('Trademark data fetched successfully!');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to fetch. Use manual mode.';
      toast.error(msg);
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
      toast.success(`✅ "${res.data.word_mark || appNumber}" added to Trademark Sphere`);
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
        ...manualForm,
        attorney, notes,
        reminder_emails: emails.split(',').map(e => e.trim()).filter(Boolean),
      });
      toast.success(`✅ "${res.data.word_mark}" added to Trademark Sphere`);
      onAdded(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add trademark');
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()} style={{
          background: D.card, borderRadius: 16, border: `1px solid ${D.border}`,
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(31,111,178,0.2)', borderRadius: 8, padding: 8 }}>
              <Shield size={18} color="#1F6FB2" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: D.text }}>Add Trademark</h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: D.muted }}>Track a trademark from IP India registry</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.muted, cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: D.raised,
          borderRadius: 10, padding: 4 }}>
          {['auto', 'manual'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: mode === m ? '#1F6FB2' : 'transparent',
              color: mode === m ? '#fff' : D.muted, fontSize: '0.82rem', fontWeight: 600,
              transition: 'all 0.15s',
            }}>
              {m === 'auto' ? '🔍 Auto-fetch from IP India' : '✏️ Add Manually'}
            </button>
          ))}
        </div>

        {mode === 'auto' ? (
          <>
            {/* Auto-fetch form */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 5 }}>
                  Application Number *
                </label>
                <input value={appNumber} onChange={e => setAppNumber(e.target.value)}
                  placeholder="e.g. 1234567" onKeyDown={e => e.key === 'Enter' && handleFetch()}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: D.raised,
                    border: `1px solid ${D.border}`, borderRadius: 8, padding: '9px 12px',
                    color: D.text, fontSize: '0.85rem', outline: 'none',
                  }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 5 }}>
                  Class (Optional)
                </label>
                <select value={classNum} onChange={e => setClassNum(e.target.value)} style={{
                  width: '100%', background: D.raised, border: `1px solid ${D.border}`,
                  borderRadius: 8, padding: '9px 12px', color: classNum ? D.text : D.muted,
                  fontSize: '0.85rem', outline: 'none',
                }}>
                  <option value="">Any</option>
                  {NICE_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>
            </div>
            <Btn onClick={handleFetch} loading={loading} icon={loading ? null : Search}
              style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }}>
              {loading ? 'Fetching from IP India…' : 'Fetch Trademark Data'}
            </Btn>

            {/* Preview result */}
            {preview && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: D.raised, borderRadius: 10, padding: 16,
                  border: `1px solid ${D.border}`, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  {preview.trademark_image_url && (
                    <img src={preview.trademark_image_url} alt="TM"
                      style={{ width: 64, height: 64, objectFit: 'contain',
                        borderRadius: 8, background: '#fff', padding: 4 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: D.text }}>
                      {preview.word_mark || '—'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: D.muted, marginTop: 2 }}>
                      App #{preview.application_number} · Class {preview.class_number || '—'}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <StatusBadge status={preview.tm_status || 'Unknown'} />
                      {preview.renewal_status && (
                        <RenewalBadge status={preview.renewal_status}
                          daysLeft={preview.days_until_renewal} />
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.8rem' }}>
                  {[
                    ['Proprietor', preview.proprietor],
                    ['Filing Date', preview.filing_date],
                    ['Registration Date', preview.registration_date],
                    ['Valid Upto', preview.valid_upto],
                    ['Renewal Date', preview.renewal_date],
                  ].map(([k, v]) => v ? (
                    <div key={k}>
                      <span style={{ color: D.muted }}>{k}: </span>
                      <span style={{ color: D.text }}>{v}</span>
                    </div>
                  ) : null)}
                </div>
                {preview.goods_and_services && (
                  <div style={{ marginTop: 10, fontSize: '0.78rem', color: D.muted,
                    borderTop: `1px solid ${D.border}`, paddingTop: 8 }}>
                    <span style={{ color: D.dimmer }}>G&S: </span>{preview.goods_and_services.slice(0, 200)}
                    {preview.goods_and_services.length > 200 ? '…' : ''}
                  </div>
                )}
              </motion.div>
            )}
          </>
        ) : (
          /* Manual form */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { key: 'application_number', label: 'Application Number *', full: false },
              { key: 'word_mark', label: 'Word Mark / TM Name *', full: false },
              { key: 'tm_status', label: 'Status', full: false, type: 'select',
                options: TM_STATUSES.map(s => ({ value: s, label: s })) },
              { key: 'class_number', label: 'Nice Class', full: false, type: 'select',
                options: NICE_CLASSES.map(c => ({ value: c, label: `Class ${c}` })) },
              { key: 'proprietor', label: 'Proprietor Name', full: false },
              { key: 'filing_date', label: 'Filing Date', full: false, type: 'date' },
              { key: 'registration_date', label: 'Registration Date', full: false, type: 'date' },
              { key: 'valid_upto', label: 'Valid Upto (Renewal Date)', full: false, type: 'date' },
              { key: 'goods_and_services', label: 'Goods & Services', full: true, type: 'textarea' },
            ].map(({ key, label, full, type, options }) => (
              <div key={key} style={full ? { gridColumn: '1 / -1' } : {}}>
                <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 5 }}>
                  {label}
                </label>
                {type === 'select' ? (
                  <select value={manualForm[key]}
                    onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))} style={{
                      width: '100%', background: D.raised, border: `1px solid ${D.border}`,
                      borderRadius: 8, padding: '8px 10px', color: D.text,
                      fontSize: '0.85rem', outline: 'none',
                    }}>
                    <option value="">Select…</option>
                    {(options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : type === 'textarea' ? (
                  <textarea value={manualForm[key]}
                    onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))}
                    rows={3} style={{
                      width: '100%', boxSizing: 'border-box', background: D.raised,
                      border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                      color: D.text, fontSize: '0.85rem', outline: 'none', resize: 'vertical',
                    }} />
                ) : (
                  <input type={type || 'text'} value={manualForm[key]}
                    onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))} style={{
                      width: '100%', boxSizing: 'border-box', background: D.raised,
                      border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                      color: D.text, fontSize: '0.85rem', outline: 'none',
                    }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Common fields */}
        {(preview || mode === 'manual') && (
          <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 5 }}>
                  Attorney / Agent
                </label>
                <input value={attorney} onChange={e => setAttorney(e.target.value)}
                  placeholder="Name of attorney" style={{
                    width: '100%', boxSizing: 'border-box', background: D.raised,
                    border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                    color: D.text, fontSize: '0.85rem', outline: 'none',
                  }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 5 }}>
                  Reminder Emails (comma-sep.)
                </label>
                <input value={emails} onChange={e => setEmails(e.target.value)}
                  placeholder="a@b.com, c@d.com" style={{
                    width: '100%', boxSizing: 'border-box', background: D.raised,
                    border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                    color: D.text, fontSize: '0.85rem', outline: 'none',
                  }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 5 }}>
                Notes
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Internal notes about this trademark…" style={{
                  width: '100%', boxSizing: 'border-box', background: D.raised,
                  border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                  color: D.text, fontSize: '0.85rem', outline: 'none', resize: 'vertical',
                }} />
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose} icon={X}>Cancel</Btn>
          {mode === 'auto' && preview && (
            <Btn onClick={handleSaveAuto} loading={saving} icon={saving ? null : CheckCircle2} variant="success">
              {saving ? 'Adding…' : 'Add to Trademark Sphere'}
            </Btn>
          )}
          {mode === 'manual' && (
            <Btn onClick={handleSaveManual} loading={saving} icon={saving ? null : CheckCircle2} variant="success">
              {saving ? 'Adding…' : 'Add to Trademark Sphere'}
            </Btn>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
function DetailDrawer({ tm, onClose, onRefresh, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  useEffect(() => {
    if (tm) setForm({
      attorney: tm.attorney || '',
      notes: tm.notes || '',
      reminder_emails: (tm.reminder_emails || []).join(', '),
      valid_upto: tm.valid_upto || '',
      tm_status: tm.tm_status || '',
      goods_and_services: tm.goods_and_services || '',
    });
  }, [tm]);

  if (!tm) return null;

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

  const Field = ({ label, value, mono }) => value ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.7rem', color: D.muted, marginBottom: 2, textTransform: 'uppercase',
        letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: D.text,
        fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  ) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999,
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        onClick={e => e.stopPropagation()} style={{
          width: 460, height: '100%', background: D.card,
          borderLeft: `1px solid ${D.border}`, padding: 24, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>

        {/* Drawer header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            {tm.trademark_image_url && (
              <img src={tm.trademark_image_url} alt="TM"
                style={{ width: 72, height: 72, objectFit: 'contain',
                  borderRadius: 10, background: '#fff', padding: 6, marginBottom: 10 }} />
            )}
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: D.text }}>
              {tm.word_mark || tm.application_number}
            </h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <StatusBadge status={tm.tm_status || 'Unknown'} />
              {tm.class_number && (
                <span style={{ background: 'rgba(31,111,178,0.12)', color: '#1F6FB2',
                  border: '1px solid rgba(31,111,178,0.3)', borderRadius: 6,
                  padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600 }}>
                  Class {tm.class_number}
                </span>
              )}
              {tm.renewal_status && (
                <RenewalBadge status={tm.renewal_status} daysLeft={tm.days_until_renewal} />
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            color: D.muted, cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn size="sm" variant="ghost" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
            Refresh
          </Btn>
          <Btn size="sm" variant="ghost" icon={Edit2} onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel Edit' : 'Edit'}
          </Btn>
          <Btn size="sm" variant="danger" icon={Trash2} loading={deleting} onClick={handleDelete}>
            Remove
          </Btn>
          <a href={`https://tmrsearch.ipindia.gov.in/eregister/eregister.aspx`}
            target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <Btn size="sm" variant="ghost" icon={ExternalLink}>IP India</Btn>
          </a>
        </div>

        {/* Deadlines alert section */}
        {(tm.renewal_status === 'critical' || tm.renewal_status === 'overdue' ||
          tm.renewal_status === 'warning') && (
          <div style={{
            background: tm.renewal_status === 'overdue'
              ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${tm.renewal_status === 'overdue'
              ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={16} color={tm.renewal_status === 'overdue' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600,
                color: tm.renewal_status === 'overdue' ? '#ef4444' : '#f59e0b' }}>
                {tm.renewal_status === 'overdue'
                  ? `Renewal OVERDUE by ${Math.abs(tm.days_until_renewal)} days!`
                  : `Renewal due in ${tm.days_until_renewal} days`}
              </div>
              <div style={{ fontSize: '0.76rem', color: D.muted, marginTop: 2 }}>
                Renewal date: {tm.renewal_date || tm.valid_upto}
              </div>
            </div>
          </div>
        )}

        {/* Editable fields */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'tm_status', label: 'Status', type: 'select',
                options: TM_STATUSES.map(s => ({ value: s, label: s })) },
              { key: 'valid_upto', label: 'Valid Upto (Renewal Date)', type: 'date' },
              { key: 'attorney', label: 'Attorney / Agent' },
              { key: 'reminder_emails', label: 'Reminder Emails (comma-sep.)' },
              { key: 'goods_and_services', label: 'Goods & Services', type: 'textarea' },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ].map(({ key, label, type, options }) => (
              <div key={key}>
                <label style={{ fontSize: '0.78rem', color: D.muted, display: 'block', marginBottom: 4 }}>
                  {label}
                </label>
                {type === 'select' ? (
                  <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '100%', background: D.raised, border: `1px solid ${D.border}`,
                      borderRadius: 8, padding: '8px 10px', color: D.text, fontSize: '0.85rem', outline: 'none' }}>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : type === 'textarea' ? (
                  <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    rows={3} style={{ width: '100%', boxSizing: 'border-box', background: D.raised,
                      border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                      color: D.text, fontSize: '0.85rem', outline: 'none', resize: 'vertical' }} />
                ) : (
                  <input type={type || 'text'} value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', background: D.raised,
                      border: `1px solid ${D.border}`, borderRadius: 8, padding: '8px 10px',
                      color: D.text, fontSize: '0.85rem', outline: 'none' }} />
                )}
              </div>
            ))}
            <Btn onClick={handleSave} loading={saving} icon={saving ? null : CheckCircle2} variant="success"
              style={{ alignSelf: 'flex-end' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Info grid */}
            <div style={{ background: D.raised, borderRadius: 10, padding: 16,
              border: `1px solid ${D.border}`, marginBottom: 12 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: D.dimmer,
                marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Registry Information
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                <Field label="Application No." value={tm.application_number} mono />
                <Field label="Nice Class" value={tm.class_number ? `Class ${tm.class_number}` : null} />
                <Field label="Filing Date" value={tm.filing_date} />
                <Field label="Registration Date" value={tm.registration_date} />
                <Field label="Valid Upto" value={tm.valid_upto} />
                <Field label="Renewal Date" value={tm.renewal_date} />
              </div>
            </div>

            <div style={{ background: D.raised, borderRadius: 10, padding: 16,
              border: `1px solid ${D.border}`, marginBottom: 12 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: D.dimmer,
                marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Owner Details
              </div>
              <Field label="Proprietor" value={tm.proprietor} />
              <Field label="Applicant Name" value={tm.applicant_name} />
              <Field label="Address" value={tm.address} />
            </div>

            {tm.goods_and_services && (
              <div style={{ background: D.raised, borderRadius: 10, padding: 16,
                border: `1px solid ${D.border}`, marginBottom: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: D.dimmer,
                  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Goods & Services
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: D.muted,
                  lineHeight: 1.6 }}>{tm.goods_and_services}</p>
              </div>
            )}

            <div style={{ background: D.raised, borderRadius: 10, padding: 16,
              border: `1px solid ${D.border}` }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: D.dimmer,
                marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Internal
              </div>
              <Field label="Attorney / Agent" value={tm.attorney} />
              <Field label="Client" value={tm.client_name} />
              <Field label="Reminder Emails"
                value={tm.reminder_emails?.length ? tm.reminder_emails.join(', ') : null} />
              <Field label="Last Refreshed"
                value={tm.last_fetched ? new Date(tm.last_fetched).toLocaleString('en-IN') : 'Manual'} />
              {tm.notes && (
                <div style={{ marginTop: 8, padding: '10px 12px',
                  background: 'rgba(31,175,90,0.06)', borderRadius: 8,
                  border: '1px solid rgba(31,175,90,0.15)', fontSize: '0.82rem',
                  color: D.muted, lineHeight: 1.6 }}>
                  <span style={{ color: '#1FAF5A', fontWeight: 600 }}>📝 Notes: </span>
                  {tm.notes}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function TrademarkSphere() {
  const { user } = useAuth();
  const [trademarks, setTrademarks] = useState([]);
  const [stats, setStats]           = useState(null);
  const [deadlines, setDeadlines]   = useState({ upcoming: [], overdue: [] });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClass, setFilterClass]   = useState('');
  const [filterAlert, setFilterAlert]   = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage]             = useState(0);
  const [showAdd, setShowAdd]       = useState(false);
  const [activeTab, setActiveTab]   = useState('list'); // 'list' | 'deadlines'
  const [selectedTm, setSelectedTm] = useState(null);
  const LIMIT = 50;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: String(page * LIMIT), limit: String(LIMIT),
        ...(search ? { search } : {}),
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
    } catch (err) {
      toast.error('Failed to load trademark data');
    } finally { setLoading(false); }
  }, [page, search, filterStatus, filterClass, filterAlert]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(0); }, [search, filterStatus, filterClass, filterAlert]);

  const handleAdded = (tm) => {
    setShowAdd(false);
    fetchAll();
    toast.success('Trademark Sphere updated!');
  };

  const handleRefreshed = (updated) => {
    setTrademarks(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTm(updated);
  };

  const handleDeleted = (id) => {
    setTrademarks(prev => prev.filter(t => t.id !== id));
    setTotalCount(n => n - 1);
    fetchAll(); // refresh stats
  };

  const exportCSV = () => {
    if (!trademarks.length) return;
    const headers = ['App No','Word Mark','Class','Status','Proprietor','Filing Date',
      'Renewal Date','Days Left','Attorney','Client','Notes'];
    const rows = trademarks.map(t => [
      t.application_number, t.word_mark, t.class_number, t.tm_status,
      t.proprietor, t.filing_date, t.renewal_date || t.valid_upto,
      t.days_until_renewal ?? '', t.attorney, t.client_name, t.notes,
    ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `trademark_sphere_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div style={{ minHeight: '100vh', background: D.bg, padding: '24px 24px 48px',
      color: D.text, fontFamily: "'Inter', sans-serif" }}>

      {/* ── Page header ── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, background: 'rgba(31,111,178,0.15)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(31,111,178,0.3)' }}>
              <Shield size={22} color="#1F6FB2" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: D.text,
                letterSpacing: '-0.01em' }}>
                Trademark Sphere
              </h1>
              <p style={{ margin: 0, fontSize: '0.78rem', color: D.muted }}>
                Track, monitor & manage all trademark registrations
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" icon={Download} size="sm" onClick={exportCSV}>Export CSV</Btn>
            <Btn variant="ghost" icon={RefreshCw} size="sm" onClick={fetchAll}>Refresh</Btn>
            <Btn icon={Plus} onClick={() => setShowAdd(true)}>Add Trademark</Btn>
          </div>
        </div>
      </motion.div>

      {/* ── Stats cards ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12, marginBottom: 24 }}>
          <StatCard icon={Shield} label="Total Tracked" value={stats.total}
            color="#1F6FB2" sub="All trademarks" />
          <StatCard icon={CheckCircle2} label="Registered" value={stats.registered}
            color="#1FAF5A" sub="Active marks" />
          <StatCard icon={Clock} label="Pending / Active" value={stats.pending}
            color="#3B82F6" sub="Under process" />
          <StatCard icon={AlertTriangle} label="Expiring ≤90d" value={stats.expiring_soon}
            color="#F59E0B" sub="Need renewal" />
          <StatCard icon={AlertCircle} label="Overdue" value={stats.overdue}
            color="#EF4444" sub="Renewal past" />
          <StatCard icon={Bell} label="Upcoming Reminders" value={stats.upcoming_reminders}
            color="#8B5CF6" sub="Next 30 days" />
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: D.card,
        border: `1px solid ${D.border}`, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'list',      label: '📋 All Trademarks', count: totalCount },
          { id: 'deadlines', label: '⏰ Deadlines',
            count: deadlines.overdue.length + deadlines.upcoming.length },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? '#1F6FB2' : 'transparent',
            color: activeTab === tab.id ? '#fff' : D.muted,
            fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id
                  ? 'rgba(255,255,255,0.2)' : 'rgba(148,163,184,0.15)',
                borderRadius: 10, padding: '1px 7px', fontSize: '0.7rem',
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── List Tab ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'list' && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Filters row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search mark, app #, proprietor…" icon={Search}
                style={{ flex: '1 1 220px', minWidth: 200 }} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                background: D.raised, border: `1px solid ${D.border}`, borderRadius: 8,
                padding: '8px 10px', color: filterStatus ? D.text : D.muted,
                fontSize: '0.82rem', outline: 'none', minWidth: 150,
              }}>
                <option value="">All Statuses</option>
                {TM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{
                background: D.raised, border: `1px solid ${D.border}`, borderRadius: 8,
                padding: '8px 10px', color: filterClass ? D.text : D.muted,
                fontSize: '0.82rem', outline: 'none',
              }}>
                <option value="">All Classes</option>
                {NICE_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
              <select value={filterAlert} onChange={e => setFilterAlert(e.target.value)} style={{
                background: D.raised, border: `1px solid ${D.border}`, borderRadius: 8,
                padding: '8px 10px', color: filterAlert ? D.text : D.muted,
                fontSize: '0.82rem', outline: 'none',
              }}>
                <option value="">All Renewal States</option>
                {Object.entries(RENEWAL_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
              {(filterStatus || filterClass || filterAlert || search) && (
                <Btn variant="ghost" size="sm" icon={X}
                  onClick={() => { setSearch(''); setFilterStatus(''); setFilterClass(''); setFilterAlert(''); }}>
                  Clear
                </Btn>
              )}
            </div>

            {/* Table */}
            <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.border}`,
              overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: D.muted }}>
                  <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
                  <div style={{ fontSize: '0.85rem' }}>Loading trademarks…</div>
                </div>
              ) : trademarks.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <Shield size={40} color={D.dimmer} style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: D.muted, marginBottom: 6 }}>
                    No trademarks found
                  </div>
                  <div style={{ fontSize: '0.82rem', color: D.dimmer, marginBottom: 16 }}>
                    Add a trademark to start tracking renewals and deadlines
                  </div>
                  <Btn icon={Plus} onClick={() => setShowAdd(true)}>Add First Trademark</Btn>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div style={{ display: 'grid', padding: '10px 16px',
                    borderBottom: `1px solid ${D.border}`, background: D.raised,
                    gridTemplateColumns: '36px 1.8fr 1fr 1.2fr 1.2fr 1fr 1fr 80px',
                    fontSize: '0.72rem', fontWeight: 600, color: D.dimmer, textTransform: 'uppercase',
                    letterSpacing: '0.04em', gap: 8 }}>
                    <span>#</span>
                    <span>Trademark / App No.</span>
                    <span>Class</span>
                    <span>Status</span>
                    <span>Proprietor</span>
                    <span>Filing Date</span>
                    <span>Renewal</span>
                    <span></span>
                  </div>

                  {/* Table rows */}
                  {trademarks.map((tm, i) => (
                    <motion.div key={tm.id} initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedTm(tm)} style={{
                        display: 'grid', padding: '12px 16px',
                        borderBottom: `1px solid ${D.border}`,
                        gridTemplateColumns: '36px 1.8fr 1fr 1.2fr 1.2fr 1fr 1fr 80px',
                        gap: 8, cursor: 'pointer', transition: 'background 0.12s',
                        alignItems: 'center',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = D.raised}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                      <span style={{ fontSize: '0.75rem', color: D.dimmer }}>
                        {page * LIMIT + i + 1}
                      </span>

                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                          {tm.word_mark || '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: D.muted, fontFamily: 'monospace' }}>
                          {tm.application_number}
                        </div>
                      </div>

                      <span style={{ fontSize: '0.8rem', color: D.muted }}>
                        {tm.class_number ? `Class ${tm.class_number}` : '—'}
                      </span>

                      <div><StatusBadge status={tm.tm_status || 'Unknown'} size="xs" /></div>

                      <div style={{ fontSize: '0.8rem', color: D.muted, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tm.proprietor || tm.applicant_name || '—'}
                      </div>

                      <span style={{ fontSize: '0.78rem', color: D.muted }}>
                        {tm.filing_date || '—'}
                      </span>

                      <div>
                        {tm.renewal_date || tm.valid_upto ? (
                          <>
                            <div style={{ fontSize: '0.76rem', color: D.muted }}>
                              {tm.renewal_date || tm.valid_upto}
                            </div>
                            <RenewalBadge status={tm.renewal_status}
                              daysLeft={tm.days_until_renewal} />
                          </>
                        ) : <span style={{ fontSize: '0.76rem', color: D.dimmer }}>—</span>}
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSelectedTm(tm)} style={{
                          background: 'rgba(31,111,178,0.1)', border: '1px solid rgba(31,111,178,0.2)',
                          borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#1F6FB2',
                        }}>
                          <Eye size={13} />
                        </button>
                      </div>
                    </motion.div>
                  ))}

                  {/* Pagination */}
                  {totalCount > LIMIT && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderTop: `1px solid ${D.border}` }}>
                      <span style={{ fontSize: '0.78rem', color: D.muted }}>
                        Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, totalCount)} of {totalCount}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn size="sm" variant="ghost" disabled={page === 0}
                          onClick={() => setPage(p => p - 1)}>← Prev</Btn>
                        <Btn size="sm" variant="ghost"
                          disabled={(page + 1) * LIMIT >= totalCount}
                          onClick={() => setPage(p => p + 1)}>Next →</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Deadlines Tab ── */}
        {activeTab === 'deadlines' && (
          <motion.div key="deadlines" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Overdue section */}
            {deadlines.overdue.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionHeader title={`🔴 Overdue Renewals (${deadlines.overdue.length})`} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {deadlines.overdue.map(tm => (
                    <DeadlineCard key={tm.id} tm={tm} onClick={() => setSelectedTm(tm)} urgent />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming section */}
            <SectionHeader title={`⏰ Upcoming Renewals (${deadlines.upcoming.length})`}>
              <span style={{ fontSize: '0.75rem', color: D.muted }}>Next 180 days</span>
            </SectionHeader>
            {deadlines.upcoming.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: D.muted,
                background: D.card, borderRadius: 12, border: `1px solid ${D.border}` }}>
                <CheckCircle2 size={32} color="#1FAF5A" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: D.text }}>
                  No renewals due in the next 6 months
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                  All tracked trademarks are in good standing
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deadlines.upcoming.map(tm => (
                  <DeadlineCard key={tm.id} tm={tm} onClick={() => setSelectedTm(tm)} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showAdd && (
          <AddTrademarkModal key="add-modal" onClose={() => setShowAdd(false)} onAdded={handleAdded} />
        )}
        {selectedTm && (
          <DetailDrawer key="detail-drawer" tm={selectedTm} onClose={() => setSelectedTm(null)}
            onRefresh={handleRefreshed} onDelete={handleDeleted} />
        )}
      </AnimatePresence>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Deadline Card (used in Deadlines tab) ────────────────────────────────────
function DeadlineCard({ tm, onClick, urgent }) {
  const cfg = getRenewalCfg(tm.renewal_status || 'ok');
  return (
    <motion.div whileHover={{ x: 3 }} onClick={onClick} style={{
      background: D.card, borderRadius: 10,
      border: `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : D.border}`,
      padding: '14px 16px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: urgent ? '0 0 0 1px rgba(239,68,68,0.1)' : 'none',
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Calendar size={20} color={cfg.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: D.text }}>
            {tm.word_mark || tm.application_number}
          </span>
          <StatusBadge status={tm.tm_status || 'Unknown'} size="xs" />
          {tm.class_number && (
            <span style={{ fontSize: '0.72rem', color: D.muted }}>Class {tm.class_number}</span>
          )}
        </div>
        <div style={{ fontSize: '0.78rem', color: D.muted, marginTop: 3 }}>
          App #{tm.application_number}
          {tm.proprietor && <> · {tm.proprietor}</>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.78rem', color: D.muted }}>
          {tm.renewal_date || tm.valid_upto}
        </div>
        <RenewalBadge status={tm.renewal_status} daysLeft={tm.days_until_renewal} />
      </div>
      <ChevronRight size={16} color={D.dimmer} />
    </motion.div>
  );
}
