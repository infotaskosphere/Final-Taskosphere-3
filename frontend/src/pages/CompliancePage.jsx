// CompliancePage.jsx — Universal Compliance Tracker
// Track ROC / GST / ITR / TDS / Audit filings across all clients in bulk.
// Add compliance manually or import from Excel/CSV.

import { useDark } from '@/hooks/useDark';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO, isPast, isToday } from 'date-fns';
import {
  CheckCircle2, Clock, AlertTriangle, X, Plus, Upload,
  Search, Filter, ChevronDown, FileText, Users, BarChart3,
  Trash2, Edit2, Loader2, CheckSquare, Square, Download,
  RefreshCw, ChevronRight, FileUp, Eye, Zap, Target,
  Building2, Calendar, Tag, ArrowUpDown, MoreHorizontal,
  TrendingUp, ShieldCheck, AlertCircle, BookOpen, FolderOpen,
  SlidersHorizontal, XCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const D = {
  bg: '#0f172a', card: '#1e293b', raised: '#263348',
  border: '#334155', text: '#f1f5f9', muted: '#94a3b8', dimmer: '#64748b',
};

const CATEGORY_CFG = {
  ROC:     { label: 'ROC / MCA',   color: '#1F6FB2', bg: 'rgba(31,111,178,0.12)',  border: 'rgba(31,111,178,0.3)'  },
  GST:     { label: 'GST',         color: '#F97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)'  },
  ITR:     { label: 'Income Tax',  color: '#1FAF5A', bg: 'rgba(31,175,90,0.12)',   border: 'rgba(31,175,90,0.3)'   },
  TDS:     { label: 'TDS / TCS',   color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)'  },
  AUDIT:   { label: 'Audit',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'  },
  PF_ESIC: { label: 'PF / ESIC',  color: '#0D9488', bg: 'rgba(13,148,136,0.12)', border: 'rgba(13,148,136,0.3)'  },
  PT:      { label: 'Prof. Tax',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'   },
  OTHER:   { label: 'Other',       color: '#64748b', bg: 'rgba(100,116,139,0.12)',border: 'rgba(100,116,139,0.3)' },
};

const STATUS_CFG = {
  not_started: { label: 'Not Started', color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.25)', dot: '#94a3b8'  },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)',  dot: '#60a5fa'  },
  completed:   { label: 'Completed',   color: '#1FAF5A', bg: 'rgba(31,175,90,0.12)',   border: 'rgba(31,175,90,0.25)',   dot: '#4ade80'  },
  filed:       { label: 'Filed',       color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', dot: '#a78bfa'  },
  na:          { label: 'N/A',         color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.2)',  dot: '#cbd5e1'  },
};
const STATUSES = ['not_started', 'in_progress', 'completed', 'filed', 'na'];
const CATEGORIES = ['ROC', 'GST', 'ITR', 'TDS', 'AUDIT', 'PF_ESIC', 'PT', 'OTHER'];
const FREQUENCIES = [
  { value: 'monthly',      label: 'Monthly'     },
  { value: 'quarterly',    label: 'Quarterly'   },
  { value: 'half_yearly',  label: 'Half-Yearly' },
  { value: 'annual',       label: 'Annual'      },
  { value: 'one_time',     label: 'One-Time'    },
];

const FY_OPTIONS = ['2025-26','2024-25','2023-24','2022-23'];

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.23,1,0.32,1] } },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const safeDate = (s) => { try { const d = parseISO(s); return isNaN(d) ? null : d; } catch { return null; } };
const fmtDate  = (s, fmt = 'dd MMM yyyy') => { const d = safeDate(s); return d ? format(d, fmt) : '—'; };

function StatusPill({ status, onClick, size = 'sm' }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.not_started;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border transition-all hover:opacity-80 active:scale-95 ${size === 'xs' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
      {onClick && <ChevronDown className="w-2.5 h-2.5 opacity-60" />}
    </button>
  );
}

function StatusDropdown({ current, onSelect, isDark }) {
  return (
    <div className="rounded-xl overflow-hidden shadow-xl border z-50"
      style={{ backgroundColor: isDark ? D.card : '#fff', borderColor: isDark ? D.border : '#e2e8f0', minWidth: 160 }}>
      {STATUSES.map(s => {
        const cfg = STATUS_CFG[s];
        return (
          <button key={s} onClick={() => onSelect(s)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium hover:opacity-80 transition-opacity text-left"
            style={{ backgroundColor: s === current ? (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9') : 'transparent', color: cfg.color }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
            {cfg.label}
            {s === current && <CheckCircle2 className="w-3 h-3 ml-auto opacity-60" />}
          </button>
        );
      })}
    </div>
  );
}

function ProgressBar({ pct, color = '#1FAF5A', isDark }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }}>
      <motion.div className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}bb)` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct || 0)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD / EDIT COMPLIANCE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ComplianceFormModal({ existing, onClose, onSave, isDark }) {
  const [name,        setName]        = useState(existing?.name || '');
  const [category,    setCategory]    = useState(existing?.category || 'ROC');
  const [frequency,   setFrequency]   = useState(existing?.frequency || 'annual');
  const [fyYear,      setFyYear]      = useState(existing?.fy_year || '2025-26');
  const [period,      setPeriod]      = useState(existing?.period_label || '');
  const [dueDate,     setDueDate]     = useState(existing?.due_date || '');
  const [desc,        setDesc]        = useState(existing?.description || '');
  const [saving,      setSaving]      = useState(false);
  const [templates,   setTemplates]   = useState([]);

  useEffect(() => {
    api.get('/compliance/common-templates').then(r => setTemplates(r.data || [])).catch(() => {});
  }, []);

  const inputStyle = {
    backgroundColor: isDark ? D.raised : '#fff',
    borderColor:     isDark ? D.border : '#d1d5db',
    color:           isDark ? D.text   : '#1e293b',
  };
  const inputCls = 'w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), category, frequency, fy_year: fyYear || undefined,
        period_label: period || undefined, due_date: dueDate || undefined, description: desc || undefined };
      if (existing?.id) {
        await api.patch(`/compliance/${existing.id}`, payload);
        toast.success('Compliance updated');
      } else {
        await api.post('/compliance/', payload);
        toast.success('Compliance created');
      }
      onSave();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ backgroundColor: isDark ? D.card : '#fff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black">{existing ? 'Edit Compliance' : 'Add Compliance'}</h2>
              <p className="text-blue-200 text-xs">{existing ? 'Update details' : 'Define a new compliance type'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4" style={{ overflowY: 'auto', scrollbarWidth: 'thin' }}>

          {/* Quick templates (only for new) */}
          {!existing && templates.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: isDark ? D.muted : '#64748b' }}>Quick Templates</p>
              <div className="flex flex-wrap gap-2">
                {templates.slice(0, 12).map(t => (
                  <button key={t.name} onClick={() => { setName(t.name); setCategory(t.category); setFrequency(t.frequency); }}
                    className="text-xs px-2.5 py-1 rounded-lg border font-medium transition-all hover:opacity-80"
                    style={{ backgroundColor: CATEGORY_CFG[t.category]?.bg || 'transparent',
                      borderColor: CATEGORY_CFG[t.category]?.border || '#e2e8f0',
                      color: CATEGORY_CFG[t.category]?.color || '#64748b' }}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>
              Compliance Name *
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. AOC-4 Filing FY 2025-26"
              className={inputCls} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_CFG[c]?.label || c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>Frequency</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} className={inputCls} style={inputStyle}>
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>FY Year</label>
              <select value={fyYear} onChange={e => setFyYear(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— Select —</option>
                {FY_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>Period Label</label>
              <input value={period} onChange={e => setPeriod(e.target.value)}
                placeholder="e.g. Q1 FY25-26, April 2025"
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} style={inputStyle} />
          </div>

          <div>
            <label className="text-sm font-semibold mb-1.5 block" style={{ color: isDark ? D.muted : '#374151' }}>Description (optional)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Notes about this compliance type…"
              className={`${inputCls} resize-none`} style={inputStyle} />
          </div>
        </div>

        <div className="px-6 py-4 flex justify-end gap-2 border-t flex-shrink-0"
          style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}
            className="font-semibold text-white rounded-xl px-5"
            style={{ backgroundColor: '#1F6FB2' }}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : <><CheckCircle2 className="w-4 h-4 mr-1.5" />{existing ? 'Save Changes' : 'Create'}</>}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT EXCEL MODAL (multi-step wizard)
// ─────────────────────────────────────────────────────────────────────────────
function ImportExcelModal({ complianceId, complianceName, onClose, onImported, isDark }) {
  const [step,         setStep]         = useState(1); // 1=upload, 2=map, 3=importing, 4=done
  const [file,         setFile]         = useState(null);
  const [preview,      setPreview]      = useState(null); // { columns, rows, total_rows }
  const [previewing,   setPreviewing]   = useState(false);
  const [clientCol,    setClientCol]    = useState('Client Name');
  const [statusCol,    setStatusCol]    = useState('');
  const [notesCol,     setNotesCol]     = useState('');
  const [result,       setResult]       = useState(null);
  const fileRef = useRef(null);

  const inputStyle = { backgroundColor: isDark ? D.raised : '#fff', borderColor: isDark ? D.border : '#d1d5db', color: isDark ? D.text : '#1e293b' };
  const inputCls   = 'w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setPreviewing(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await api.post(`/compliance/${complianceId}/preview-excel`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data);
      // Auto-detect columns
      const cols = res.data.columns || [];
      const autoClient = cols.find(c => c.toLowerCase().includes('client') || c.toLowerCase().includes('company')) || cols[0] || '';
      const autoStatus = cols.find(c => c.toLowerCase().includes('status')) || '';
      const autoNotes  = cols.find(c => c.toLowerCase().includes('note') || c.toLowerCase().includes('remark')) || '';
      setClientCol(autoClient); setStatusCol(autoStatus); setNotesCol(autoNotes);
      setStep(2);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Could not read file'); }
    finally { setPreviewing(false); }
  };

  const handleImport = async () => {
    setStep(3);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('client_col', clientCol);
      fd.append('status_col', statusCol);
      fd.append('notes_col',  notesCol);
      const res = await api.post(`/compliance/${complianceId}/import-excel`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data); setStep(4);
      onImported();
      toast.success(`Import complete — ${res.data.added} added, ${res.data.updated} updated`);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Import failed'); setStep(2); }
  };

  const stepLabels = ['Upload', 'Map Columns', 'Importing', 'Done'];

  return (
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ backgroundColor: isDark ? D.card : '#fff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 text-white flex-shrink-0 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #1FAF5A)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <FileUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black">Import from Excel / CSV</h2>
              <p className="text-green-200 text-xs truncate max-w-[280px]">{complianceName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 py-3 gap-2 border-b" style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
          {stepLabels.map((label, i) => {
            const num = i + 1;
            const done = step > num;
            const active = step === num;
            return (
              <React.Fragment key={label}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black`}
                    style={{
                      backgroundColor: done ? '#1FAF5A' : active ? '#1F6FB2' : isDark ? D.raised : '#e2e8f0',
                      color: done || active ? '#fff' : isDark ? D.muted : '#64748b',
                    }}>
                    {done ? '✓' : num}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block"
                    style={{ color: active ? (isDark ? D.text : '#0f172a') : isDark ? D.dimmer : '#94a3b8' }}>{label}</span>
                </div>
                {i < 3 && <div className="flex-1 h-px" style={{ backgroundColor: isDark ? D.border : '#e2e8f0' }} />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6" style={{ overflowY: 'auto', scrollbarWidth: 'thin' }}>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={previewing}
                className="flex flex-col items-center justify-center w-full py-14 rounded-2xl border-2 border-dashed transition-all hover:border-blue-400 gap-3"
                style={{ borderColor: isDark ? D.border : '#cbd5e1', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc' }}>
                {previewing
                  ? <><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /><p className="text-sm font-semibold text-blue-500">Reading file…</p></>
                  : <><Upload className="w-8 h-8" style={{ color: isDark ? D.muted : '#64748b' }} />
                    <p className="text-sm font-semibold" style={{ color: isDark ? D.text : '#1e293b' }}>Click to upload Excel or CSV</p>
                    <p className="text-xs" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Supported: .xlsx, .xls, .csv — must have a client name column</p></>}
              </button>
              <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: isDark ? D.muted : '#64748b' }}>
                  Expected Excel columns
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: isDark ? D.muted : '#475569' }}>
                  {[['Client Name *', 'Required'], ['Status', 'Optional'], ['Notes', 'Optional']].map(([col, req]) => (
                    <div key={col} className="flex items-center gap-1.5">
                      <span className="font-mono font-bold" style={{ color: isDark ? '#60a5fa' : '#1F6FB2' }}>{col}</span>
                      <span className="text-[10px]">({req})</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-2" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                  Status values: not_started | in_progress | completed | filed | na
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Map columns */}
          {step === 2 && preview && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl border" style={{ borderColor: isDark ? 'rgba(31,175,90,0.3)' : '#bbf7d0', backgroundColor: isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4' }}>
                <p className="text-sm font-semibold" style={{ color: isDark ? '#4ade80' : '#15803d' }}>
                  ✓ File loaded — {preview.total_rows} rows, {preview.columns.length} columns
                </p>
              </div>

              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Client Name column *', val: clientCol, set: setClientCol, required: true  },
                  { label: 'Status column',         val: statusCol, set: setStatusCol, required: false },
                  { label: 'Notes column',          val: notesCol,  set: setNotesCol,  required: false },
                ].map(({ label, val, set, required }) => (
                  <div key={label}>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: isDark ? D.muted : '#374151' }}>{label}</label>
                    <select value={val} onChange={e => set(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ backgroundColor: isDark ? D.raised : '#fff', borderColor: isDark ? D.border : '#d1d5db', color: isDark ? D.text : '#1e293b' }}>
                      {!required && <option value="">— Skip —</option>}
                      {preview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: isDark ? D.muted : '#64748b' }}>
                  Preview (first 5 rows)
                </p>
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: isDark ? D.border : '#e2e8f0' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                        {preview.columns.slice(0, 6).map(c => (
                          <th key={c} className="px-3 py-2 text-left font-bold uppercase tracking-wider"
                            style={{ color: isDark ? D.dimmer : '#64748b' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} style={{ borderTop: isDark ? `1px solid ${D.border}` : '1px solid #f1f5f9' }}>
                          {preview.columns.slice(0, 6).map(c => (
                            <td key={c} className="px-3 py-2 truncate max-w-[150px]"
                              style={{ color: isDark ? D.muted : '#374151' }}>
                              {row[c] != null ? String(row[c]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-sm font-semibold" style={{ color: isDark ? D.text : '#1e293b' }}>Importing assignments…</p>
              <p className="text-xs" style={{ color: isDark ? D.muted : '#64748b' }}>Matching client names and creating records</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && result && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(31,175,90,0.15)' }}>
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-black" style={{ color: isDark ? D.text : '#0f172a' }}>Import Complete!</h3>
              <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
                {[
                  { label: 'Added',   value: result.added,   color: '#1FAF5A' },
                  { label: 'Updated', value: result.updated, color: '#3B82F6' },
                  { label: 'Total',   value: result.total_rows_in_file, color: isDark ? D.muted : '#64748b' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-3 rounded-xl border"
                    style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                    <p className="text-2xl font-black" style={{ color }}>{value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{label}</p>
                  </div>
                ))}
              </div>
              {result.clients_not_in_db?.length > 0 && (
                <div className="w-full p-3 rounded-xl border" style={{ borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a', backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: isDark ? '#fbbf24' : '#92400e' }}>
                    {result.clients_not_in_db.length} client names not found in database (added anyway):
                  </p>
                  <p className="text-[11px]" style={{ color: isDark ? D.muted : '#64748b' }}>
                    {result.clients_not_in_db.slice(0, 5).join(', ')}{result.clients_not_in_db.length > 5 ? ` +${result.clients_not_in_db.length - 5} more` : ''}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex justify-end gap-2 border-t flex-shrink-0"
          style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          {step === 4
            ? <Button onClick={onClose} className="font-semibold text-white rounded-xl px-5" style={{ backgroundColor: '#1FAF5A' }}>Done</Button>
            : step === 2
              ? <>
                  <Button variant="ghost" onClick={() => { setStep(1); setFile(null); setPreview(null); }} className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>Back</Button>
                  <Button onClick={handleImport} disabled={!clientCol} className="font-semibold text-white rounded-xl px-5" style={{ backgroundColor: '#1F6FB2' }}>
                    <Upload className="w-4 h-4 mr-1.5" /> Import {preview?.total_rows} Rows
                  </Button>
                </>
              : <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
          }
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGN CLIENTS MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AssignClientsModal({ compliance, onClose, onAssigned, isDark }) {
  const [clients,    setClients]    = useState([]);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(new Set());
  const [loading,    setLoading]    = useState(true);
  const [assigning,  setAssigning]  = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    api.get('/clients').then(r => {
      setClients(Array.isArray(r.data) ? r.data : (r.data?.clients || []));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = clients;
    if (typeFilter !== 'all') list = list.filter(c => c.client_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.company_name || '').toLowerCase().includes(q));
    }
    return list;
  }, [clients, search, typeFilter]);

  const clientTypes = useMemo(() => [...new Set(clients.map(c => c.client_type).filter(Boolean))], [clients]);

  const handleAssign = async () => {
    if (selected.size === 0) { toast.error('Select at least one client'); return; }
    setAssigning(true);
    try {
      await api.post(`/compliance/${compliance.id}/assignments/bulk-assign`, { client_ids: [...selected] });
      toast.success(`${selected.size} client${selected.size > 1 ? 's' : ''} assigned`);
      onAssigned();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Assignment failed'); }
    finally { setAssigning(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: isDark ? D.card : '#fff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0', maxHeight: '88vh' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }} onClick={e => e.stopPropagation()}>

        <div className="px-6 py-5 text-white flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #8B5CF6)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-white" /></div>
            <div>
              <h2 className="text-lg font-black">Assign Clients</h2>
              <p className="text-purple-200 text-xs truncate max-w-[250px]">{compliance.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 border-b flex-shrink-0 flex items-center gap-2" style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
              className="w-full pl-8 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ backgroundColor: isDark ? D.raised : '#fff', borderColor: isDark ? D.border : '#d1d5db', color: isDark ? D.text : '#1e293b' }} />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm focus:outline-none"
            style={{ backgroundColor: isDark ? D.raised : '#fff', borderColor: isDark ? D.border : '#d1d5db', color: isDark ? D.text : '#1e293b' }}>
            <option value="all">All Types</option>
            {clientTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="px-4 py-2 flex items-center justify-between border-b flex-shrink-0" style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
          <span className="text-xs font-semibold" style={{ color: isDark ? D.muted : '#64748b' }}>
            {selected.size} selected · {filtered.length} shown
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set(filtered.map(c => c.id)))} className="text-xs font-semibold text-blue-500 hover:text-blue-400">All</button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-semibold" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>None</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ overflowY: 'auto', scrollbarWidth: 'thin' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-blue-500 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: isDark ? D.muted : '#64748b' }}>No clients found</div>
          ) : filtered.map(client => {
            const isSelected = selected.has(client.id);
            return (
              <button key={client.id}
                onClick={() => setSelected(prev => { const s = new Set(prev); isSelected ? s.delete(client.id) : s.add(client.id); return s; })}
                className="w-full flex items-center gap-3 px-4 py-2.5 border-b text-left transition-colors hover:bg-opacity-50"
                style={{ borderColor: isDark ? D.border : '#f1f5f9', backgroundColor: isSelected ? (isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff') : 'transparent' }}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0`}
                  style={{ borderColor: isSelected ? '#3B82F6' : isDark ? D.border : '#d1d5db', backgroundColor: isSelected ? '#3B82F6' : 'transparent' }}>
                  {isSelected && <span className="text-white text-[10px]">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: isDark ? D.text : '#0f172a' }}>{client.company_name}</p>
                  <p className="text-[11px]" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{client.client_type}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 flex justify-end gap-2 border-t flex-shrink-0"
          style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
          <Button onClick={handleAssign} disabled={assigning || selected.size === 0}
            className="font-semibold text-white rounded-xl px-5" style={{ backgroundColor: '#8B5CF6' }}>
            {assigning ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Assigning…</> : <><Users className="w-4 h-4 mr-1.5" />Assign {selected.size} Clients</>}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT DETAIL PANEL (slide-over from right)
// ─────────────────────────────────────────────────────────────────────────────
function AssignmentPanel({ compliance, onClose, isDark, allUsers }) {
  const [items,          setItems]          = useState([]);
  const [total,          setTotal]          = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [search,         setSearch]         = useState('');
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [statusDropdown, setStatusDropdown] = useState(null); // assignment id
  const [bulkStatus,     setBulkStatus]     = useState(null); // 'open' or null
  const [showImport,     setShowImport]     = useState(false);
  const [showAssign,     setShowAssign]     = useState(false);
  const [refreshKey,     setRefreshKey]     = useState(0);

  const userMap = useMemo(() => {
    const m = {};
    (allUsers || []).forEach(u => { m[u.id] = u.full_name; });
    return m;
  }, [allUsers]);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 500 });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const r = await api.get(`/compliance/${compliance.id}/assignments?${params}`);
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load assignments'); }
    finally { setLoading(false); }
  }, [compliance.id, statusFilter, search, refreshKey]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const updateStatus = async (assignmentId, newStatus) => {
    setItems(prev => prev.map(a => a.id === assignmentId ? { ...a, status: newStatus } : a));
    setStatusDropdown(null);
    try {
      await api.patch(`/compliance/${compliance.id}/assignments/${assignmentId}`, { status: newStatus });
    } catch {
      toast.error('Update failed'); fetchAssignments();
    }
  };

  const bulkUpdateStatus = async (newStatus) => {
    if (selectedIds.size === 0) { toast.error('Select rows first'); return; }
    setBulkStatus(null);
    try {
      await api.patch(`/compliance/${compliance.id}/assignments/bulk-update`, {
        assignment_ids: [...selectedIds], status: newStatus,
      });
      toast.success(`${selectedIds.size} records updated to ${STATUS_CFG[newStatus]?.label}`);
      setSelectedIds(new Set()); setRefreshKey(k => k + 1);
    } catch { toast.error('Bulk update failed'); }
  };

  const deleteAssignment = async (id) => {
    if (!confirm('Remove this client from compliance?')) return;
    setItems(prev => prev.filter(a => a.id !== id));
    try { await api.delete(`/compliance/${compliance.id}/assignments/${id}`); }
    catch { fetchAssignments(); }
  };

  const catCfg = CATEGORY_CFG[compliance.category] || CATEGORY_CFG.OTHER;
  const stats  = compliance._stats || {};

  const statusTabs = [
    { key: 'all',         label: `All (${stats.total || 0})` },
    { key: 'not_started', label: `Not Started (${stats.not_started || 0})` },
    { key: 'in_progress', label: `In Progress (${stats.in_progress || 0})` },
    { key: 'completed',   label: `Completed (${stats.completed || 0})` },
    { key: 'filed',       label: `Filed (${stats.filed || 0})` },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div className="fixed inset-0 z-[9990] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />

      {/* Panel */}
      <motion.aside
        className="fixed right-0 top-0 h-full z-[9991] flex flex-col shadow-2xl"
        style={{
          width: 'min(780px, 96vw)',
          backgroundColor: isDark ? D.card : '#fff',
          borderLeft: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0',
        }}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}>

        {/* Panel header */}
        <div className="px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', borderLeft: `4px solid ${catCfg.color}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider"
                  style={{ backgroundColor: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>
                  {catCfg.label}
                </span>
                {compliance.fy_year && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: isDark ? D.raised : '#f1f5f9', color: isDark ? D.muted : '#64748b' }}>
                    FY {compliance.fy_year}
                  </span>
                )}
                {compliance.due_date && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: isPast(safeDate(compliance.due_date)) ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.1)',
                      color: isPast(safeDate(compliance.due_date)) ? '#ef4444' : '#d97706',
                    }}>
                    Due {fmtDate(compliance.due_date)}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black truncate" style={{ color: isDark ? D.text : '#0f172a' }}>
                {compliance.name}
              </h2>
              {compliance.period_label && (
                <p className="text-xs mt-0.5" style={{ color: isDark ? D.muted : '#64748b' }}>{compliance.period_label}</p>
              )}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors hover:bg-red-100"
              style={{ backgroundColor: isDark ? D.raised : '#f1f5f9' }}>
              <X className="w-4 h-4" style={{ color: isDark ? D.muted : '#64748b' }} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <ProgressBar pct={stats.pct || 0} color={catCfg.color} isDark={isDark} />
            </div>
            <span className="text-sm font-bold flex-shrink-0" style={{ color: catCfg.color }}>
              {stats.done || 0}/{stats.total || 0} done ({stats.pct || 0}%)
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b flex-shrink-0 flex items-center gap-2 flex-wrap"
          style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client…"
              className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.text : '#1e293b' }} />
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="relative">
              <button onClick={() => setBulkStatus(s => s ? null : 'open')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: catCfg.color }}>
                <Zap className="w-3.5 h-3.5" /> Update {selectedIds.size} <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {bulkStatus === 'open' && (
                  <motion.div className="absolute right-0 top-full mt-1 z-50"
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <StatusDropdown current={null} onSelect={bulkUpdateStatus} isDark={isDark} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <button onClick={() => setShowAssign(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all hover:opacity-80"
            style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.muted : '#374151' }}>
            <Plus className="w-3.5 h-3.5" /> Add Clients
          </button>

          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all hover:opacity-80"
            style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.muted : '#374151' }}>
            <Upload className="w-3.5 h-3.5" /> Import Excel
          </button>

          <button onClick={() => setRefreshKey(k => k + 1)} className="p-1.5 rounded-lg" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex overflow-x-auto border-b flex-shrink-0"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', scrollbarWidth: 'none' }}>
          {statusTabs.map(({ key, label }) => (
            <button key={key} onClick={() => { setStatusFilter(key); setSelectedIds(new Set()); }}
              className="flex-shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap"
              style={{
                borderColor: statusFilter === key ? catCfg.color : 'transparent',
                color: statusFilter === key ? catCfg.color : isDark ? D.dimmer : '#64748b',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Assignments table */}
        <div className="flex-1 overflow-y-auto" style={{ overflowY: 'auto', scrollbarWidth: 'thin' }}>
          {/* Table header */}
          <div className="hidden md:grid sticky top-0 z-10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '28px 1fr 140px 140px 36px',
              backgroundColor: isDark ? D.raised : '#f8fafc',
              color: isDark ? D.dimmer : '#94a3b8',
              borderBottom: isDark ? `1px solid ${D.border}` : '1px solid #f1f5f9',
            }}>
            <div />
            <div>Client</div>
            <div>Status</div>
            <div>Assigned To</div>
            <div />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FolderOpen className="w-10 h-10" style={{ color: isDark ? D.border : '#d1d5db' }} />
              <p className="text-sm font-semibold" style={{ color: isDark ? D.muted : '#64748b' }}>
                {search || statusFilter !== 'all' ? 'No matches' : 'No clients assigned yet'}
              </p>
              {!search && statusFilter === 'all' && (
                <button onClick={() => setShowAssign(true)} className="text-sm font-semibold text-blue-500 hover:text-blue-400">
                  + Assign clients now
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
              {items.map(a => {
                const isSelected = selectedIds.has(a.id);
                return (
                  <motion.div key={a.id}
                    className="group flex md:grid px-4 py-3 gap-3 items-center transition-colors"
                    style={{
                      gridTemplateColumns: '28px 1fr 140px 140px 36px',
                      backgroundColor: isSelected ? (isDark ? 'rgba(59,130,246,0.06)' : '#eff6ff') : 'transparent',
                    }}
                    whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa' }}>
                    {/* Checkbox */}
                    <button onClick={() => setSelectedIds(prev => { const s = new Set(prev); isSelected ? s.delete(a.id) : s.add(a.id); return s; })}
                      className="flex-shrink-0">
                      <div className="w-4 h-4 rounded border-2 flex items-center justify-center"
                        style={{ borderColor: isSelected ? '#3B82F6' : isDark ? D.border : '#d1d5db', backgroundColor: isSelected ? '#3B82F6' : 'transparent' }}>
                        {isSelected && <span className="text-white text-[9px]">✓</span>}
                      </div>
                    </button>

                    {/* Client name */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: isDark ? D.text : '#0f172a' }}>{a.client_name}</p>
                      {a.notes && <p className="text-[11px] truncate mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{a.notes}</p>}
                    </div>

                    {/* Status — click to change */}
                    <div className="relative flex-shrink-0">
                      <StatusPill status={a.status} size="xs" onClick={() => setStatusDropdown(d => d === a.id ? null : a.id)} />
                      <AnimatePresence>
                        {statusDropdown === a.id && (
                          <motion.div className="absolute left-0 top-full mt-1 z-50"
                            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                            <StatusDropdown current={a.status} onSelect={s => updateStatus(a.id, s)} isDark={isDark} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Assigned to */}
                    <div className="flex-shrink-0 hidden md:block">
                      <p className="text-xs truncate" style={{ color: isDark ? D.muted : '#64748b' }}>
                        {a.assigned_to_name || userMap[a.assigned_to] || '—'}
                      </p>
                    </div>

                    {/* Delete */}
                    <button onClick={() => deleteAssignment(a.id)}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-100"
                      style={{ color: '#ef4444' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between flex-shrink-0"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          <p className="text-xs" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
            {items.length} of {total} records shown
          </p>
          <div className="flex items-center gap-3 text-xs font-semibold">
            {Object.entries(stats).filter(([k]) => ['not_started','in_progress','completed','filed'].includes(k)).map(([k, v]) => (
              <span key={k} style={{ color: STATUS_CFG[k]?.color }}>
                {v} {STATUS_CFG[k]?.label?.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      </motion.aside>

      {/* Sub-modals */}
      <AnimatePresence>
        {showImport && (
          <ImportExcelModal complianceId={compliance.id} complianceName={compliance.name} isDark={isDark}
            onClose={() => setShowImport(false)} onImported={() => { setRefreshKey(k => k + 1); setShowImport(false); }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAssign && (
          <AssignClientsModal compliance={compliance} isDark={isDark}
            onClose={() => setShowAssign(false)} onAssigned={() => { setRefreshKey(k => k + 1); setShowAssign(false); }} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE CARD
// ─────────────────────────────────────────────────────────────────────────────
function ComplianceCard({ item, onClick, onEdit, onDelete, isDark }) {
  const cfg   = CATEGORY_CFG[item.category] || CATEGORY_CFG.OTHER;
  const stats = item._stats || {};
  const freqLabel = FREQUENCIES.find(f => f.value === item.frequency)?.label || item.frequency;
  const overdue = item.due_date && isPast(safeDate(item.due_date)) && stats.done < stats.total;

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: { duration: 0.18 } }} whileTap={{ scale: 0.985 }}>
      <div className="rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-md"
        style={{
          backgroundColor: isDark ? D.card : '#fff',
          borderColor: isDark ? D.border : '#e2e8f0',
          borderLeft: `4px solid ${cfg.color}`,
        }}
        onClick={onClick}>
        <div className="p-4">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                  {cfg.label}
                </span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: isDark ? D.raised : '#f1f5f9', color: isDark ? D.dimmer : '#64748b' }}>
                  {freqLabel}
                </span>
                {overdue && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded text-red-500"
                    style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>OVERDUE</span>
                )}
              </div>
              <h3 className="text-sm font-bold leading-snug" style={{ color: isDark ? D.text : '#0f172a' }}>{item.name}</h3>
              {(item.fy_year || item.period_label) && (
                <p className="text-[11px] mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                  {[item.fy_year && `FY ${item.fy_year}`, item.period_label].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {/* Action menu */}
            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                <Edit2 className="w-3 h-3" style={{ color: isDark ? D.muted : '#64748b' }} />
              </button>
              <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-2">
            <ProgressBar pct={stats.pct || 0} color={cfg.color} isDark={isDark} />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black" style={{ color: cfg.color }}>{stats.pct || 0}%</span>
              <span className="text-[11px]" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                {stats.done || 0} of {stats.total || 0} done
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {stats.not_started > 0 && <span className="text-[10px] font-semibold" style={{ color: STATUS_CFG.not_started.color }}>{stats.not_started} pending</span>}
              {stats.in_progress > 0 && <span className="text-[10px] font-semibold" style={{ color: STATUS_CFG.in_progress.color }}>{stats.in_progress} WIP</span>}
            </div>
          </div>

          {/* Mini status bar */}
          {stats.total > 0 && (
            <div className="flex h-1 rounded-full overflow-hidden mt-2 gap-px">
              {[
                { key: 'filed',       pct: (stats.filed || 0) / stats.total * 100       },
                { key: 'completed',   pct: (stats.completed || 0) / stats.total * 100   },
                { key: 'in_progress', pct: (stats.in_progress || 0) / stats.total * 100 },
                { key: 'not_started', pct: (stats.not_started || 0) / stats.total * 100 },
              ].filter(s => s.pct > 0).map(s => (
                <div key={s.key} style={{ width: `${s.pct}%`, backgroundColor: STATUS_CFG[s.key]?.dot, opacity: 0.8 }} />
              ))}
            </div>
          )}

          {/* Due date */}
          {item.due_date && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <Calendar className="w-3 h-3 flex-shrink-0" style={{ color: overdue ? '#ef4444' : isDark ? D.dimmer : '#94a3b8' }} />
              <span className="text-[11px] font-medium" style={{ color: overdue ? '#ef4444' : isDark ? D.dimmer : '#94a3b8' }}>
                Due {fmtDate(item.due_date)}
              </span>
            </div>
          )}
        </div>

        {/* Click to open indicator */}
        <div className="px-4 py-2 border-t flex items-center justify-between"
          style={{ borderColor: isDark ? D.border : '#f9fafb', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa' }}>
          <span className="text-[10px] font-semibold" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
            {stats.total || 0} clients · click to manage
          </span>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }} />
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function CompliancePage() {
  const isDark = useDark();
  const { user } = useAuth();

  const [compliance,     setCompliance]     = useState([]);
  const [dashboard,      setDashboard]      = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [allUsers,       setAllUsers]       = useState([]);

  // Filters
  const [catFilter,      setCatFilter]      = useState('all');
  const [fyFilter,       setFyFilter]       = useState('all');
  const [searchQ,        setSearchQ]        = useState('');

  // Modals
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [editingItem,    setEditingItem]    = useState(null);
  const [selectedPanel,  setSelectedPanel]  = useState(null); // opens assignment panel
  const [refreshKey,     setRefreshKey]     = useState(0);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (catFilter !== 'all') params.set('category', catFilter);
      if (fyFilter  !== 'all') params.set('fy_year',  fyFilter);
      const [listRes, dashRes, usersRes] = await Promise.all([
        api.get(`/compliance/?${params}`),
        api.get('/compliance/dashboard/summary'),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      setCompliance(Array.isArray(listRes.data) ? listRes.data : []);
      setDashboard(dashRes.data || null);
      setAllUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch { toast.error('Failed to load compliance data'); }
    finally { setLoading(false); }
  }, [catFilter, fyFilter, refreshKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}" and all its client assignments?`)) return;
    try {
      await api.delete(`/compliance/${id}`);
      toast.success('Deleted');
      setRefreshKey(k => k + 1);
    } catch { toast.error('Delete failed'); }
  };

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!searchQ.trim()) return compliance;
    const q = searchQ.toLowerCase();
    return compliance.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (CATEGORY_CFG[c.category]?.label || '').toLowerCase().includes(q)
    );
  }, [compliance, searchQ]);

  // ── FY years in data ─────────────────────────────────────────────────────
  const fyYears = useMemo(() => [...new Set(compliance.map(c => c.fy_year).filter(Boolean))], [compliance]);

  // ── Styles ───────────────────────────────────────────────────────────────
  const pageBg = isDark ? D.bg : '#f8fafc';

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8" style={{ background: pageBg }}>
      <motion.div className="max-w-[1600px] mx-auto space-y-6" variants={containerVariants} initial="hidden" animate="visible">

        {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <div className="relative overflow-hidden rounded-2xl px-6 py-5"
            style={{ background: 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 100%)', boxShadow: '0 8px 32px rgba(13,59,102,0.25)' }}>
            <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Compliance Management</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">Universal Compliance Tracker</h1>
                <p className="text-white/60 text-sm mt-1">
                  Track ROC, GST, ITR, TDS filings across all clients in real time
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white border border-white/30 hover:bg-white/15 transition-all">
                  <Plus className="w-4 h-4" /> Add Compliance
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── STATS ROW ───────────────────────────────────────────────────── */}
        {dashboard && (
          <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: BookOpen,     label: 'Compliance Types',   value: dashboard.total_compliance_types,  unit: 'defined',      color: '#1F6FB2' },
              { icon: Users,        label: 'Client Assignments', value: dashboard.total_assignments,       unit: 'total records', color: '#8B5CF6' },
              { icon: CheckCircle2, label: 'Completed / Filed',  value: dashboard.completed_or_filed,      unit: `${dashboard.overall_pct}% done`, color: '#1FAF5A' },
              { icon: AlertTriangle,label: 'Pending',            value: dashboard.pending,                 unit: `${dashboard.overdue} overdue`,   color: dashboard.overdue > 0 ? '#EF4444' : '#F59E0B' },
            ].map(({ icon: Icon, label, value, unit, color }) => (
              <div key={label} className="rounded-2xl border p-4 hover:shadow-md transition-all"
                style={{ backgroundColor: isDark ? D.card : '#fff', borderColor: isDark ? D.border : '#e2e8f0' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{label}</p>
                    <p className="text-2xl font-black" style={{ color }}>{value ?? '—'}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{unit}</p>
                  </div>
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── FILTER BAR ──────────────────────────────────────────────────── */}
        <motion.div variants={itemVariants} className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: isDark ? D.dimmer : '#94a3b8' }} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search compliance…"
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ backgroundColor: isDark ? D.card : '#fff', borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.text : '#1e293b' }} />
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all', ...CATEGORIES].map(cat => {
              const cfg = cat === 'all' ? null : CATEGORY_CFG[cat];
              const active = catFilter === cat;
              return (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={{
                    backgroundColor: active ? (cfg?.bg || (isDark ? D.raised : '#f1f5f9')) : (isDark ? D.card : '#fff'),
                    borderColor: active ? (cfg?.color || (isDark ? D.border : '#1F6FB2')) : (isDark ? D.border : '#e2e8f0'),
                    color: active ? (cfg?.color || '#1F6FB2') : (isDark ? D.muted : '#64748b'),
                  }}>
                  {cat === 'all' ? 'All Categories' : (cfg?.label || cat)}
                </button>
              );
            })}
          </div>

          {/* FY filter */}
          {fyYears.length > 0 && (
            <select value={fyFilter} onChange={e => setFyFilter(e.target.value)}
              className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ backgroundColor: isDark ? D.card : '#fff', borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.text : '#1e293b' }}>
              <option value="all">All FY Years</option>
              {fyYears.map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>
          )}

          <button onClick={() => setRefreshKey(k => k + 1)} className="p-2 rounded-xl border transition-all hover:opacity-80"
            style={{ backgroundColor: isDark ? D.card : '#fff', borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.muted : '#64748b' }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </motion.div>

        {/* ── COMPLIANCE CARDS GRID ───────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div variants={itemVariants}
            className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border"
            style={{ backgroundColor: isDark ? D.card : '#fff', borderColor: isDark ? D.border : '#e2e8f0' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: isDark ? D.raised : '#f1f5f9' }}>
              <ShieldCheck className="w-8 h-8" style={{ color: isDark ? D.dimmer : '#cbd5e1' }} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: isDark ? D.text : '#0f172a' }}>
                {searchQ || catFilter !== 'all' ? 'No matching compliance found' : 'No compliance defined yet'}
              </p>
              <p className="text-sm mt-1" style={{ color: isDark ? D.muted : '#64748b' }}>
                {searchQ || catFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Add a compliance type to start tracking across all clients'}
              </p>
            </div>
            {!searchQ && catFilter === 'all' && (
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: '#1F6FB2' }}>
                <Plus className="w-4 h-4" /> Add First Compliance
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            variants={containerVariants}>
            {filtered.map(item => (
              <ComplianceCard key={item.id} item={item} isDark={isDark}
                onClick={() => setSelectedPanel(item)}
                onEdit={() => setEditingItem(item)}
                onDelete={() => handleDelete(item.id, item.name)} />
            ))}
          </motion.div>
        )}

      </motion.div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(showAddModal || editingItem) && (
          <ComplianceFormModal
            isDark={isDark}
            existing={editingItem || undefined}
            onClose={() => { setShowAddModal(false); setEditingItem(null); }}
            onSave={() => { setShowAddModal(false); setEditingItem(null); setRefreshKey(k => k + 1); }}
          />
        )}
      </AnimatePresence>

      {/* ── ASSIGNMENT PANEL ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPanel && (
          <AssignmentPanel
            compliance={selectedPanel}
            isDark={isDark}
            allUsers={allUsers}
            onClose={() => { setSelectedPanel(null); setRefreshKey(k => k + 1); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
