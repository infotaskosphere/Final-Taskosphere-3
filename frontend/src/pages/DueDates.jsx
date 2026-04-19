import React, { useState, useEffect } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User,
  CheckCircle, Filter, Upload, Sparkles, FileText,
  X, CheckSquare, Loader2, SkipForward, ChevronRight,
  Target, AlertCircle, TrendingUp, Clock, CalendarIcon,
  ArrowUpRight, Tag, Layers, Settings2, List, LayoutGrid,
} from 'lucide-react';
import LayoutCustomizer from '../components/layout/LayoutCustomizer';
import { usePageLayout } from '../hooks/usePageLayout';
import { format, differenceInDays } from 'date-fns';
import AIDuplicateDialog from '@/components/ui/AIDuplicateDialog';
import { detectComplianceDuplicates } from '@/lib/aiDuplicateEngine';
import { motion, AnimatePresence } from 'framer-motion';

// ── Brand Colors ──────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  emeraldGreen:'#1FAF5A',
  lightGreen:  '#5CCB5F',
  coral:       '#FF6B6B',
  amber:       '#F59E0B',
};

// ── Spring Physics ────────────────────────────────────────────────────────────
const springPhysics = {
  card:   { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
  button: { type: 'spring', stiffness: 400, damping: 28 },
  tap:    { type: 'spring', stiffness: 500, damping: 30 },
};

// ── Animation Variants ─────────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.3 } },
};
const rowVariant = {
  hidden:  { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, x: 10, transition: { duration: 0.18 } },
};

// ── Slim scroll injection ─────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('dd-slim-scroll')) {
  const s = document.createElement('style');
  s.id = 'dd-slim-scroll';
  s.textContent = `
    .dd-slim::-webkit-scrollbar { width: 3px; }
    .dd-slim::-webkit-scrollbar-track { background: transparent; }
    .dd-slim::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    .dd-slim::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .dark .dd-slim::-webkit-scrollbar-thumb { background: #475569; }
  `;
  document.head.appendChild(s);
}

const slimScroll = {
  overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent',
};

const CATEGORIES  = ['GST','Income Tax','TDS','ROC','Audit','Trademark','RERA','FEMA','Other'];
const DEPARTMENTS = ['GST','IT','ACC','TDS','ROC','TM','MSME','FEMA','DSC','OTHER'];

const STATUS_STYLES = {
  pending:   { bg:'bg-amber-50 dark:bg-amber-900/20',   text:'text-amber-700 dark:text-amber-400',   border:'border-amber-200 dark:border-amber-800',   dot:'bg-amber-400',   label:'Pending'   },
  completed: { bg:'bg-emerald-50 dark:bg-emerald-900/20',text:'text-emerald-700 dark:text-emerald-400',border:'border-emerald-200 dark:border-emerald-800',dot:'bg-emerald-400',label:'Completed' },
  overdue:   { bg:'bg-red-50 dark:bg-red-900/20',        text:'text-red-700 dark:text-red-400',        border:'border-red-200 dark:border-red-800',        dot:'bg-red-400',     label:'Overdue'   },
  upcoming:  { bg:'bg-blue-50 dark:bg-blue-900/20',      text:'text-blue-700 dark:text-blue-400',      border:'border-blue-200 dark:border-blue-800',      dot:'bg-blue-400',    label:'Upcoming'  },
};

// ── STRIPE COLOR HELPER ───────────────────────────────────────────────────────
const getDueDateStripeColor = (ds) => {
  if (ds === 'completed') return 'bg-blue-600';
  if (ds === 'overdue')   return 'bg-red-700';
  if (ds === 'upcoming')  return 'bg-amber-400';
  return 'bg-slate-300';
};

// ── Shared Card Shell ─────────────────────────────────────────────────────────
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Card Header Row ───────────────────────────────────────────────────────────
function CardHeaderRow({ iconBg, icon, title, subtitle, action, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none">{badge}</span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ── DUE DATE ROW (list view — task-strip style) ───────────────────────────────
function DueDateRow({ dd, ds, dLeft, isOwnOrAdmin, onEdit, onDelete, onCalendar, user, getClientName, getUserName, isDark }) {
  const sty    = STATUS_STYLES[ds];
  const stripe = getDueDateStripeColor(ds);

  const rowBg = ds === 'overdue'
    ? 'bg-red-50/60 dark:bg-red-900/10 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700'
    : ds === 'upcoming'
    ? 'bg-amber-50/40 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700'
    : ds === 'completed'
    ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-75'
    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500';

  return (
    <motion.div layout variants={rowVariant} initial="hidden" animate="visible" exit="exit">
      <div className={`relative rounded-xl border transition-all duration-200 overflow-hidden group mx-4 my-1 hover:shadow-sm ${rowBg}`}>
        {/* Left colored stripe */}
        <div className={`absolute left-0 top-0 h-full w-1 ${stripe}`} />

        <div
          className="pl-5 pr-3 py-2.5 grid items-center gap-0"
          style={{ gridTemplateColumns: 'minmax(0,1fr) 88px 120px 110px 110px 70px 88px' }}
        >
          {/* Title + description */}
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'} ${ds === 'completed' ? 'line-through opacity-60' : ''}`}>
                {dd.title}
              </p>
              {dd.assigned_to === user?.id && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${COLORS.mediumBlue}15`, color: COLORS.mediumBlue }}>You</span>
              )}
            </div>
            {dd.description && (
              <p className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{dd.description}</p>
            )}
          </div>

          {/* Status badge */}
          <div className="flex items-center justify-center overflow-hidden">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${sty.bg} ${sty.text} ${sty.border} whitespace-nowrap`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sty.dot}`} />
              {sty.label}
            </span>
          </div>

          {/* Category / Dept */}
          <div className="flex flex-col gap-0.5 items-center overflow-hidden">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${COLORS.mediumBlue}12`, color: COLORS.mediumBlue }}>
              <Layers className="h-2.5 w-2.5" />{dd.category || 'Other'}
            </span>
            {dd.department && (
              <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Tag className="h-2.5 w-2.5" />{dd.department}
              </span>
            )}
          </div>

          {/* Client */}
          <div className="flex items-center justify-center gap-1.5 overflow-hidden">
            {dd.client_id ? (
              <>
                <Building2 className="h-3 w-3 text-slate-300 flex-shrink-0" />
                <span className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{getClientName(dd.client_id)}</span>
              </>
            ) : (
              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>—</span>
            )}
          </div>

          {/* Due date */}
          <div className="flex items-center justify-center gap-1.5 overflow-hidden">
            <Calendar className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className={`text-xs font-semibold whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {format(new Date(dd.due_date), 'dd MMM yyyy')}
            </span>
          </div>

          {/* Days left */}
          <div className="flex items-center justify-center overflow-hidden">
            {dd.status === 'completed' ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Done
              </span>
            ) : (
              <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${
                dLeft < 0 ? 'text-red-500' : dLeft <= 7 ? 'text-amber-500' : isDark ? 'text-slate-300' : 'text-slate-600'
              }`}>
                {dLeft < 0 ? `${Math.abs(dLeft)}d over` : `${dLeft}d left`}
              </span>
            )}
          </div>

          {/* Actions — visible on hover */}
          <div className="flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            {isOwnOrAdmin && (
              <>
                <button onClick={() => onEdit(dd)}
                  className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-500 transition-colors"
                  title="Edit">
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onCalendar(dd)}
                  className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-500 transition-colors"
                  title="Add to Calendar">
                  <Calendar className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onDelete(dd.id)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                  title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── DUE DATE BOARD CARD (board view) ─────────────────────────────────────────
function DueDateBoardCard({ dd, ds, dLeft, isOwnOrAdmin, onEdit, onDelete, onCalendar, user, getClientName, getUserName, isDark }) {
  const sty    = STATUS_STYLES[ds];
  const stripe = getDueDateStripeColor(ds);

  const cardBg = ds === 'overdue'
    ? 'bg-red-50/60 dark:bg-red-900/10 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700'
    : ds === 'upcoming'
    ? 'bg-amber-50/40 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700'
    : ds === 'completed'
    ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-80'
    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500';

  return (
    <motion.div layout variants={itemVariants}>
      <div className={`relative rounded-xl border overflow-hidden transition-all duration-200 group hover:shadow-md ${cardBg}`}>
        {/* Top stripe */}
        <div className={`h-1 w-full ${stripe}`} />

        <div className="p-3 space-y-2.5">
          {/* Title + hover actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm leading-snug ${isDark ? 'text-slate-100' : 'text-slate-800'} ${ds === 'completed' ? 'line-through opacity-60' : ''}`}>
                {dd.title}
              </p>
              {dd.assigned_to === user?.id && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block" style={{ background: `${COLORS.mediumBlue}15`, color: COLORS.mediumBlue }}>You</span>
              )}
            </div>
            {isOwnOrAdmin && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => onEdit(dd)}
                  className="p-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-500 transition-colors"
                  title="Edit">
                  <Edit size={13} />
                </button>
                <button onClick={() => onCalendar(dd)}
                  className="p-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-500 transition-colors"
                  title="Add to Calendar">
                  <Calendar size={13} />
                </button>
                <button onClick={() => onDelete(dd.id)}
                  className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                  title="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          {dd.description && (
            <p className={`text-[11px] leading-relaxed line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{dd.description}</p>
          )}

          {/* Badges row */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${COLORS.mediumBlue}12`, color: COLORS.mediumBlue }}>
              <Layers className="h-2.5 w-2.5" />{dd.category || 'Other'}
            </span>
            {dd.department && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                {dd.department}
              </span>
            )}
          </div>

          {/* Footer: due date + days left */}
          <div className={`flex items-center justify-between pt-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {format(new Date(dd.due_date), 'dd MMM yyyy')}
              </span>
            </div>
            {dd.status === 'completed' ? (
              <span className="text-[10px] font-bold text-emerald-500">Done</span>
            ) : (
              <span className={`text-[10px] font-bold tabular-nums ${
                dLeft < 0 ? 'text-red-500' : dLeft <= 7 ? 'text-amber-500' : isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {dLeft < 0 ? `${Math.abs(dLeft)}d overdue` : `${dLeft}d left`}
              </span>
            )}
          </div>

          {/* Client + assigned to */}
          {(dd.client_id || dd.assigned_to) && (
            <div className="flex items-center gap-3 flex-wrap">
              {dd.client_id && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-300 flex-shrink-0" />
                  <span className={`text-[11px] truncate max-w-[100px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{getClientName(dd.client_id)}</span>
                </div>
              )}
              {dd.assigned_to && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 text-slate-300 flex-shrink-0" />
                  <span className={`text-[11px] truncate max-w-[100px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{getUserName(dd.assigned_to)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// SMART IMPORT MODAL
// ─────────────────────────────────────────────
function SmartImportModal({ open, onClose, clients, users, user, onImportDone }) {
  const isDark = useDark();
  const [file, setFile]                     = useState(null);
  const [extracting, setExtracting]         = useState(false);
  const [extractedDates, setExtractedDates] = useState([]);
  const [step, setStep]                     = useState('upload');
  const [selected, setSelected]             = useState({});
  const [saving, setSaving]                 = useState(false);

  const reset = () => { setFile(null); setExtracting(false); setExtractedDates([]); setStep('upload'); setSelected({}); };
  const close = () => { reset(); onClose(); };

  const onFile = (f) => {
    if (!f) return;
    if (f.type.startsWith('image/')) { toast.error('Image files are not supported. Please upload a PDF or DOCX file.'); return; }
    setFile(f);
  };

  const extract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await api.post('/duedates/extract-from-file', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const list = res.data?.extracted || [];
      if (!list.length) { toast.error('No compliance dates found. Try a clearer PDF or DOCX.'); return; }
      const withIds = list.map((item, i) => ({ ...item, _id:`ex_${i}`, reminder_days:30, assigned_to:'unassigned', client_id:'no_client' }));
      const sel = {};
      withIds.forEach(d => { sel[d._id] = true; });
      setExtractedDates(withIds);
      setSelected(sel);
      setStep('review');
      toast.success(`Found ${withIds.length} compliance date${withIds.length !== 1 ? 's' : ''}!`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Extraction failed. Please try again.');
    } finally { setExtracting(false); }
  };

  const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
  const selectAll = ()  => { const m={}; extractedDates.forEach(d=>{m[d._id]=true;});  setSelected(m); };
  const clearAll  = ()  => { const m={}; extractedDates.forEach(d=>{m[d._id]=false;}); setSelected(m); };
  const selCount  = Object.values(selected).filter(Boolean).length;

  const doImport = async () => {
    const list = extractedDates.filter(d => selected[d._id]);
    if (!list.length) { toast.error('Select at least one item'); return; }
    setSaving(true);
    let ok = 0;
    for (const item of list) {
      try {
        await api.post('/duedates', {
          title: item.title, description: item.description || '',
          due_date: new Date(item.due_date).toISOString(), reminder_days: item.reminder_days || 30,
          category: item.category || 'Other', department: item.department || 'OTHER',
          assigned_to: item.assigned_to === 'unassigned' ? null : item.assigned_to,
          client_id: item.client_id === 'no_client' ? null : item.client_id, status: 'pending',
        });
        ok++;
      } catch {}
    }
    setSaving(false);
    toast.success(`${ok} due date${ok !== 1 ? 's' : ''} imported!`);
    onImportDone();
    close();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Smart Import</DialogTitle>
          <DialogDescription>Upload PDF or Word to extract compliance dates</DialogDescription>
        </DialogHeader>

        <div className="sticky top-0 z-10 px-6 py-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Compliance AI</p>
              <h2 className="text-white font-bold text-lg leading-tight">Smart Import</h2>
              <p className="text-white/60 text-xs mt-0.5">Upload PDF or Word — server extracts compliance dates automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 relative">
            {['upload','review'].map((s,i) => (
              <React.Fragment key={s}>
                {i > 0 && <div className="h-px w-6 bg-white/30" />}
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-all ${step===s ? 'bg-white text-blue-700' : 'bg-white/15 text-white/70'}`}>
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">{i+1}</span>
                  {s==='upload' ? 'Upload' : 'Review & Import'}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 'upload' && (
              <motion.div key="upload" initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:20}} className="space-y-4">
                <div
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();onFile(e.dataTransfer?.files?.[0]);}}
                  onClick={()=>document.getElementById('smart-file').click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    file
                      ? isDark ? 'border-blue-500 bg-blue-900/20' : 'border-blue-400 bg-blue-50'
                      : isDark ? 'border-slate-600 hover:border-blue-500 hover:bg-slate-800' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <input id="smart-file" type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={e=>onFile(e.target.files?.[0])} />
                  {file ? (
                    <div className="space-y-3">
                      <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${isDark ? 'bg-blue-900/40' : 'bg-blue-100'}`}>
                        <FileText className="h-8 w-8 text-blue-500" />
                      </div>
                      <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>{file.name}</p>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{(file.size/1024).toFixed(1)} KB</p>
                      <button onClick={e=>{e.stopPropagation();setFile(null);}} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                        <X className="h-3 w-3" />Remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                        <Upload className={`h-7 w-7 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <p className={`font-semibold text-sm mb-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Drop file or click to browse</p>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>PDF and DOCX supported</p>
                      </div>
                      <div className="flex justify-center gap-3">
                        <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 border border-red-100 dark:border-red-800">
                          <FileText className="h-3.5 w-3.5" />PDF
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-500 border border-blue-100 dark:border-blue-800">
                          <FileText className="h-3.5 w-3.5" />Word
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className={`mt-4 p-4 rounded-xl flex gap-3 ${isDark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-100'}`}>
                  <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                    Our server scans your document and extracts compliance deadlines automatically. No external API is used — all processing happens on your backend.
                  </p>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="outline" onClick={close} className="rounded-xl">Cancel</Button>
                  <Button onClick={extract} disabled={!file || extracting} className="text-white px-6 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                    {extracting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting...</> : <><Sparkles className="h-4 w-4 mr-2" />Extract Dates</>}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div key="review" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} className="space-y-4">
                <div className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{extractedDates.length}</span> found ·{' '}
                    <span className="font-bold" style={{ color: COLORS.mediumBlue }}>{selCount}</span> selected
                  </p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs font-semibold hover:underline" style={{ color: COLORS.mediumBlue }}>Select All</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={clearAll} className="text-xs text-slate-500 font-semibold hover:underline">Clear All</button>
                  </div>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1" style={slimScroll}>
                  {extractedDates.map(item => {
                    const isSel = selected[item._id];
                    return (
                      <motion.div key={item._id} layout onClick={() => toggle(item._id)}
                        className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                          isSel
                            ? isDark ? 'border-blue-400 bg-blue-900/20' : 'border-blue-400 bg-blue-50'
                            : isDark ? 'border-slate-700 bg-slate-800 opacity-60' : 'border-slate-200 bg-white opacity-60'
                        }`}>
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-5 h-5 rounded-md mt-0.5 flex items-center justify-center border-2 transition-all ${isSel ? 'bg-blue-500 border-blue-500' : isDark ? 'border-slate-500 bg-slate-700' : 'border-slate-300 bg-white'}`}>
                            {isSel && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{item.title}</p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${COLORS.mediumBlue}15`, color: COLORS.mediumBlue }}>{item.category}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>{item.department}</span>
                            </div>
                            {item.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{item.description}</p>}
                            <div className="flex items-center gap-1 mt-2">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                {item.due_date ? format(new Date(item.due_date), 'dd MMM yyyy') : 'Date TBD'}
                              </span>
                            </div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();toggle(item._id);}}
                            className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                              isSel
                                ? 'bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100'
                                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-500 hover:bg-blue-100'
                            }`}>
                            {isSel
                              ? <span className="flex items-center gap-1"><SkipForward className="h-3 w-3" />Ignore</span>
                              : <span className="flex items-center gap-1"><Plus className="h-3 w-3" />Add</span>}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="flex justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <Button variant="outline" onClick={()=>setStep('upload')} className="rounded-xl">← Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={close} className="rounded-xl">Cancel</Button>
                    <Button onClick={doImport} disabled={saving || selCount===0} className="text-white px-6 rounded-xl"
                      style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #17a34a)` }}>
                      {saving
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                        : <><CheckCircle className="h-4 w-4 mr-2" />Import {selCount} Date{selCount!==1?'s':''}</>}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function DueDates() {
  const DD_SECTIONS = ['banner', 'metrics', 'filters', 'table'];
  const DD_LABELS = {
    banner:  { name: 'Page Header',   icon: '🏷️', desc: 'Welcome banner and quick actions' },
    metrics: { name: 'Key Metrics',   icon: '📊', desc: 'Summary counts by status' },
    filters: { name: 'Filters',       icon: '🔍', desc: 'Search and filter controls' },
    table:   { name: 'Due Dates List',icon: '📋', desc: 'All compliance deadlines' },
  };
  const { order: ddOrder, moveSection: ddMove, resetOrder: ddReset } = usePageLayout('duedates', DD_SECTIONS);
  const [showLayoutCustomizer, setShowLayoutCustomizer] = React.useState(false);
  const { user } = useAuth();
  const isDark = useDark();
  const [dueDates, setDueDates]         = useState([]);
  const [clients, setClients]           = useState([]);
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [importOpen, setImportOpen]     = useState(false);
  const [editingDueDate, setEditing]    = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCat, setFilterCat]       = useState('all');
  const [filterMonth, setFilterMonth]   = useState('all');
  const [viewMode, setViewMode]         = useState('list'); // 'list' | 'board'
  // AI Duplicate Detection
  const [showDupDialog,  setShowDupDialog]  = useState(false);
  const [dupGroups,      setDupGroups]      = useState([]);
  const [detectingDups,  setDetectingDups]  = useState(false);
  const [formData, setFormData]         = useState({
    title:'', description:'', due_date:'', reminder_days:30,
    category:'', department:'', assigned_to:'unassigned', client_id:'no_client', status:'pending',
  });

  useEffect(() => {
    fetchDueDates(); fetchClients();
    if (user?.role==='admin'||user?.role==='manager') fetchUsers();
  }, [user]);

  const fetchDueDates = async () => { try { const r=await api.get('/duedates'); setDueDates(r.data); } catch { toast.error('Failed to fetch due dates'); } };
  const fetchClients  = async () => { try { const r=await api.get('/clients'); setClients(r.data); } catch {} };
  const fetchUsers    = async () => { try { const r=await api.get('/users');   setUsers(r.data);   } catch {} };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = {
        ...formData,
        assigned_to: formData.assigned_to==='unassigned'?null:formData.assigned_to,
        client_id:   formData.client_id==='no_client'?null:(formData.client_id||null),
        due_date:    new Date(formData.due_date).toISOString(),
      };
      if (editingDueDate) { await api.put(`/duedates/${editingDueDate.id}`, payload); toast.success('Updated!'); }
      else                { await api.post('/duedates', payload); toast.success('Created!'); }
      setDialogOpen(false); resetForm(); fetchDueDates();
      // Auto-sync to Compliance Tracker
      try { await api.post('/compliance/sync-from-calendar'); }
      catch(syncErr) { console.warn('Compliance sync skipped:', syncErr?.message); }
    } catch { toast.error('Failed to save'); } finally { setLoading(false); }
  };

  const handleEdit = dd => {
    setEditing(dd);
    setFormData({ title:dd.title, description:dd.description||'', due_date:format(new Date(dd.due_date),'yyyy-MM-dd'), reminder_days:dd.reminder_days, category:dd.category||'', department:dd.department||'', assigned_to:dd.assigned_to||'unassigned', client_id:dd.client_id||'no_client', status:dd.status });
    setDialogOpen(true);
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this due date?')) return;
    try { await api.delete(`/duedates/${id}`); toast.success('Deleted!'); fetchDueDates(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleDetectDuplicates = () => {
    if (detectingDups) return;
    setDetectingDups(true);
    setTimeout(() => {
      try {
        // dueDates items have title, category, due_date, status, department
        // We adapt them for detectComplianceDuplicates by mapping title->name
        const adapted = dueDates.map(d => ({ ...d, name: d.title, fy_year: d.fy_year || null, frequency: d.frequency || null }));
        const groups = detectComplianceDuplicates(adapted);
        // map item_ids back (ids are same)
        setDupGroups(groups);
        setShowDupDialog(true);
        if (!groups.length) toast.success(`Scanned ${dueDates.length} due dates — no duplicates found ✓`);
        else toast.info(`Found ${groups.length} duplicate group${groups.length !== 1 ? 's' : ''}`);
      } catch (e) {
        toast.error('Duplicate scan failed. Please try again.');
        console.error('Due date duplicate detection error:', e);
      } finally {
        setDetectingDups(false);
      }
    }, 60);
  };

  const resetForm = () => {
    setFormData({ title:'', description:'', due_date:'', reminder_days:30, category:'', department:'', assigned_to:'unassigned', client_id:'no_client', status:'pending' });
    setEditing(null);
  };

  const getUserName   = id => users.find(u=>u.id===id)?.full_name||'Unassigned';
  const getClientName = id => clients.find(c=>c.id===id)?.company_name||'—';

  const getStatus = dd => {
    if (dd.status==='completed') return 'completed';
    const d = differenceInDays(new Date(dd.due_date), new Date());
    return d<0?'overdue':d<=7?'upcoming':'pending';
  };

  const filtered = dueDates.filter(dd => {
    const ms = dd.title.toLowerCase().includes(searchQuery.toLowerCase());
    const mS = filterStatus==='all'||getStatus(dd)===filterStatus;
    const mC = filterCat==='all'||dd.category===filterCat;
    const mM = filterMonth==='all'||new Date(dd.due_date).getMonth()===parseInt(filterMonth);
    return ms&&mS&&mC&&mM;
  });

  const stats = {
    total:     dueDates.length,
    upcoming:  dueDates.filter(dd=>{ const d=differenceInDays(new Date(dd.due_date),new Date()); return dd.status!=='completed'&&d>=0&&d<=7; }).length,
    pending:   dueDates.filter(dd=>{ const d=differenceInDays(new Date(dd.due_date),new Date()); return dd.status!=='completed'&&d>7; }).length,
    overdue:   dueDates.filter(dd=>{ const d=differenceInDays(new Date(dd.due_date),new Date()); return dd.status!=='completed'&&d<0; }).length,
    completed: dueDates.filter(dd=>dd.status==='completed').length,
  };

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    .map((label,i) => ({ value:String(i), label }));

  const addToCalendar = dd => {
    const t    = encodeURIComponent(dd.title);
    const desc = encodeURIComponent(dd.description||'');
    const s    = format(new Date(dd.due_date),'yyyyMMdd');
    const e    = format(new Date(new Date(dd.due_date).getTime()+86400000),'yyyyMMdd');
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${t}&details=${desc}&dates=${s}/${e}`,'_blank');
  };

  const metricCardCls     = 'rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border';
  const metricCardDefault = isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300';

  const StatCard = ({ label, value, color, iconColor, iconBg, icon: Icon, status, ring, isActive, onClick }) => (
    <motion.div
      whileHover={{ y: -3, transition: springPhysics.card }}
      whileTap={{ scale: 0.985, transition: springPhysics.tap }}
      onClick={onClick}
      className={`${metricCardCls} ${isActive ? `ring-2 ${ring}` : metricCardDefault}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: isDark ? iconColor.replace('#','#').replace('0D3B66','60a5fa') : color }}>{value}</p>
          </div>
          <div className="p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ backgroundColor: isDark ? iconBg.dark : iconBg.light }}>
            <Icon className="h-4 w-4" style={{ color: iconColor }} />
          </div>
        </div>
        <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-blue-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <span>{isActive ? 'Active filter' : 'Click to filter'}</span>
          <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </CardContent>
    </motion.div>
  );

  return (
    <>
      <LayoutCustomizer
        isOpen={showLayoutCustomizer}
        onClose={() => setShowLayoutCustomizer(false)}
        order={ddOrder}
        sectionLabels={DD_LABELS}
        onDragEnd={ddMove}
        onReset={ddReset}
        isDark={isDark}
      />

      <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">

        {ddOrder.map((sectionId) => {

          /* ── BANNER ─────────────────────────────────────────────────── */
          if (sectionId === 'banner') return (
            <React.Fragment key="banner">
            <motion.div variants={itemVariants}>
              <div className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: `0 8px 32px rgba(13,59,102,0.28)` }}>
                <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
                  style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
                <div className="absolute right-24 bottom-0 w-32 h-32 rounded-full mb-[-30px] opacity-5" style={{ background: 'white' }} />
                <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div>
                    <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mb-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Compliance Calendar 📋</h1>
                    <p className="text-white/60 text-sm mt-1">Track and manage all statutory filing deadlines</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <motion.button
                      whileHover={{ scale: 1.03, y: -2, transition: springPhysics.card }}
                      whileTap={{ scale: 0.97, transition: springPhysics.tap }}
                      onClick={() => setImportOpen(true)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: 'white', backdropFilter: 'blur(8px)' }}>
                      <Sparkles className="h-4 w-4" />Smart Import
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03, y: -2, transition: springPhysics.card }}
                      whileTap={{ scale: 0.97, transition: springPhysics.tap }}
                      onClick={handleDetectDuplicates}
                      disabled={detectingDups || dueDates.length === 0}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: 'white', backdropFilter: 'blur(8px)' }}>
                      {detectingDups
                        ? <><Loader2 className="h-4 w-4 animate-spin" />Scanning…</>
                        : <><Sparkles className="h-4 w-4" />AI Duplicates</>}
                    </motion.button>
                    <Dialog open={dialogOpen} onOpenChange={o=>{setDialogOpen(o);if(!o)resetForm();}}>
                      <DialogTrigger asChild>
                        <motion.button
                          whileHover={{ scale: 1.03, y: -2, transition: springPhysics.card }}
                          whileTap={{ scale: 0.97, transition: springPhysics.tap }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white/95 shadow-lg transition-all"
                          style={{ color: COLORS.deepBlue }}>
                          <Plus className="h-4 w-4" />New Due Date
                        </motion.button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg rounded-2xl">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold" style={{ color: isDark ? '#93c5fd' : COLORS.deepBlue }}>
                            {editingDueDate ? 'Edit Due Date' : 'Add New Due Date'}
                          </DialogTitle>
                          <DialogDescription className="text-slate-500 text-sm">
                            {editingDueDate ? 'Update compliance due date details.' : 'Create a new compliance due date reminder.'}
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</Label>
                            <Input placeholder="e.g., GST Return Filing" value={formData.title} onChange={e=>setFormData({...formData,title:e.target.value})} required className="rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Department *</Label>
                            <Select value={formData.department} onValueChange={v=>setFormData({...formData,department:v})}>
                              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select department" /></SelectTrigger>
                              <SelectContent>{DEPARTMENTS.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category *</Label>
                              <Select value={formData.category||undefined} onValueChange={v=>setFormData({...formData,category:v})}>
                                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date *</Label>
                              <Input type="date" value={formData.due_date} onChange={e=>setFormData({...formData,due_date:e.target.value})} required className="rounded-xl" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</Label>
                              <Select value={formData.client_id||'no_client'} onValueChange={v=>setFormData({...formData,client_id:v==='no_client'?'':v})}>
                                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select client" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="no_client">No Client</SelectItem>
                                  {clients.map(c=><SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {(user?.role==='admin'||user?.role==='manager') && (
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign To</Label>
                                <Select value={formData.assigned_to} onValueChange={v=>setFormData({...formData,assigned_to:v})}>
                                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select user" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {users.map(u=><SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Remind Before (days)</Label>
                              <Input type="number" min="1" value={formData.reminder_days} onChange={e=>setFormData({...formData,reminder_days:parseInt(e.target.value)||30})} className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</Label>
                              <Select value={formData.status} onValueChange={v=>setFormData({...formData,status:v})}>
                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</Label>
                            <Textarea placeholder="Additional notes..." value={formData.description} onChange={e=>setFormData({...formData,description:e.target.value})} rows={2} className="rounded-xl resize-none" />
                          </div>
                          <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={()=>{setDialogOpen(false);resetForm();}} className="rounded-xl">Cancel</Button>
                            <Button type="submit" disabled={loading} className="text-white rounded-xl px-6" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                              {loading ? 'Saving...' : editingDueDate ? 'Update' : 'Create'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <button
                onClick={() => setShowLayoutCustomizer(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-95"
                style={{
                  background:  isDark ? 'rgba(31,111,178,0.15)' : 'rgba(31,111,178,0.07)',
                  borderColor: isDark ? 'rgba(31,111,178,0.4)'  : 'rgba(31,111,178,0.22)',
                  color:       isDark ? '#60a5fa'                : '#1F6FB2',
                }}
              >
                <Settings2 size={13} />
                Customize Layout
              </button>
            </motion.div>
            </React.Fragment>
          );

          /* ── METRICS ─────────────────────────────────────────────────── */
          if (sectionId === 'metrics') return (
            <motion.div key="metrics" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" variants={itemVariants}>
              <StatCard label="Total" value={stats.total} color={COLORS.deepBlue} iconColor={COLORS.deepBlue}
                iconBg={{ light: `${COLORS.deepBlue}12`, dark: 'rgba(96,165,250,0.12)' }}
                icon={Target} status="all" ring="ring-slate-400"
                isActive={filterStatus==='all'} onClick={()=>setFilterStatus('all')} />
              <StatCard label="Upcoming" value={stats.upcoming} color={COLORS.mediumBlue} iconColor={COLORS.mediumBlue}
                iconBg={{ light: `${COLORS.mediumBlue}12`, dark: 'rgba(31,111,178,0.2)' }}
                icon={Clock} status="upcoming" ring="ring-blue-400"
                isActive={filterStatus==='upcoming'} onClick={()=>setFilterStatus(filterStatus==='upcoming'?'all':'upcoming')} />
              <StatCard label="Pending" value={stats.pending} color={COLORS.amber} iconColor={COLORS.amber}
                iconBg={{ light: `${COLORS.amber}12`, dark: 'rgba(245,158,11,0.2)' }}
                icon={AlertCircle} status="pending" ring="ring-amber-400"
                isActive={filterStatus==='pending'} onClick={()=>setFilterStatus(filterStatus==='pending'?'all':'pending')} />
              <StatCard label="Overdue" value={stats.overdue} color={COLORS.coral} iconColor={COLORS.coral}
                iconBg={{ light: `${COLORS.coral}15`, dark: 'rgba(255,107,107,0.15)' }}
                icon={AlertCircle} status="overdue" ring="ring-red-400"
                isActive={filterStatus==='overdue'} onClick={()=>setFilterStatus(filterStatus==='overdue'?'all':'overdue')} />
              <StatCard label="Completed" value={stats.completed} color={COLORS.emeraldGreen} iconColor={COLORS.emeraldGreen}
                iconBg={{ light: `${COLORS.emeraldGreen}12`, dark: 'rgba(31,175,90,0.2)' }}
                icon={TrendingUp} status="completed" ring="ring-emerald-400"
                isActive={filterStatus==='completed'} onClick={()=>setFilterStatus(filterStatus==='completed'?'all':'completed')} />
            </motion.div>
          );

          /* ── FILTERS ─────────────────────────────────────────────────── */
          if (sectionId === 'filters') return (
            <React.Fragment key="filters">
              <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search due dates..."
                    value={searchQuery}
                    onChange={e=>setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all ${
                      isDark ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:ring-blue-900/40' : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                      className={`pl-8 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
                      <option value="all">All Statuses</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
                    className={`px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
                      className={`pl-8 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
                      <option value="all">All Months</option>
                      {months.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </div>
              </motion.div>
            </React.Fragment>
          );

          /* ── TABLE / LIST / BOARD ────────────────────────────────────── */
          if (sectionId === 'table') return (
            <React.Fragment key="table">
              <motion.div variants={itemVariants}>
                <SectionCard>

                  {/* ── Section header with List/Board toggle ── */}
                  <CardHeaderRow
                    iconBg={isDark ? 'bg-orange-900/40' : 'bg-orange-50'}
                    icon={<Calendar className="h-4 w-4 text-orange-500" />}
                    title="Compliance Deadlines"
                    subtitle={`Showing ${filtered.length} of ${dueDates.length} due dates`}
                    badge={stats.overdue || undefined}
                    action={
                      <div className="flex items-center gap-2">
                        {/* List / Board toggle */}
                        <div className={`flex items-center gap-0.5 p-0.5 rounded-lg border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                          <button
                            onClick={() => setViewMode('list')}
                            title="List view"
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                              ? isDark ? 'bg-slate-600 text-slate-100 shadow-sm' : 'bg-white text-slate-700 shadow-sm'
                              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                          >
                            <List size={13} />
                          </button>
                          <button
                            onClick={() => setViewMode('board')}
                            title="Board view"
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'board'
                              ? isDark ? 'bg-slate-600 text-slate-100 shadow-sm' : 'bg-white text-slate-700 shadow-sm'
                              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                          >
                            <LayoutGrid size={13} />
                          </button>
                        </div>
                        {(filterStatus!=='all'||filterCat!=='all'||filterMonth!=='all'||searchQuery) && (
                          <button onClick={()=>{setFilterStatus('all');setFilterCat('all');setFilterMonth('all');setSearchQuery('');}}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 font-semibold text-xs transition-colors">
                            <X className="h-3 w-3" />Clear
                          </button>
                        )}
                      </div>
                    }
                  />

                  {/* ── LIST VIEW ── */}
                  {viewMode === 'list' && (
                    <>
                      {/* Column headers */}
                      <div
                        className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 grid items-center bg-slate-50/80 dark:bg-slate-700/30"
                        style={{ gridTemplateColumns: 'minmax(0,1fr) 88px 120px 110px 110px 70px 88px', paddingLeft: '1.75rem', paddingRight: '0.75rem' }}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Title</span>
                        <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">Status</span>
                        <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">Category</span>
                        <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">Client</span>
                        <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">Due Date</span>
                        <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">Left</span>
                        <span className="text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Actions</span>
                      </div>

                      {/* Rows */}
                      <div style={{ maxHeight: 560, overflowY: 'auto' }} className="dd-slim py-1">
                        {filtered.length === 0 ? (
                          <div className="py-16 flex flex-col items-center gap-3">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                              <Calendar className="h-6 w-6 text-slate-300 dark:text-slate-500" />
                            </div>
                            <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No due dates found</p>
                            <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Try Smart Import to extract from a compliance document</p>
                          </div>
                        ) : (
                          <AnimatePresence>
                            {filtered.map(dd => {
                              const ds    = getStatus(dd);
                              const dLeft = differenceInDays(new Date(dd.due_date), new Date());
                              const isOwnOrAdmin = user?.role==='admin'||dd.assigned_to===user?.id;
                              return (
                                <DueDateRow
                                  key={dd.id}
                                  dd={dd}
                                  ds={ds}
                                  dLeft={dLeft}
                                  isOwnOrAdmin={isOwnOrAdmin}
                                  onEdit={handleEdit}
                                  onDelete={handleDelete}
                                  onCalendar={addToCalendar}
                                  user={user}
                                  getClientName={getClientName}
                                  getUserName={getUserName}
                                  isDark={isDark}
                                />
                              );
                            })}
                          </AnimatePresence>
                        )}
                      </div>
                    </>
                  )}

                  {/* ── BOARD VIEW ── */}
                  {viewMode === 'board' && (
                    <div className="p-4">
                      {(() => {
                        const columns = [
                          {
                            id:    'overdue',
                            label: 'Overdue',
                            color: '#DC2626',
                            bg:    isDark ? 'bg-red-900/15 border-red-800' : 'bg-red-50/60 border-red-200',
                            items: filtered.filter(dd => getStatus(dd) === 'overdue'),
                          },
                          {
                            id:    'upcoming',
                            label: 'Due Soon',
                            color: '#F59E0B',
                            bg:    isDark ? 'bg-amber-900/15 border-amber-800' : 'bg-amber-50/60 border-amber-200',
                            items: filtered.filter(dd => getStatus(dd) === 'upcoming'),
                          },
                          {
                            id:    'pending',
                            label: 'Pending',
                            color: '#1F6FB2',
                            bg:    isDark ? 'bg-blue-900/10 border-blue-800' : 'bg-blue-50/40 border-blue-200',
                            items: filtered.filter(dd => getStatus(dd) === 'pending'),
                          },
                          {
                            id:    'completed',
                            label: 'Completed',
                            color: '#1FAF5A',
                            bg:    isDark ? 'bg-emerald-900/10 border-emerald-800' : 'bg-emerald-50/40 border-emerald-200',
                            items: filtered.filter(dd => getStatus(dd) === 'completed'),
                          },
                        ];

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            {columns.map(col => (
                              <div key={col.id} className={`rounded-xl border ${col.bg} p-3`}>
                                {/* Column header */}
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: col.color }}>{col.label}</span>
                                  </div>
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${col.color}18`, color: col.color }}>
                                    {col.items.length}
                                  </span>
                                </div>

                                {/* Cards */}
                                <div className="space-y-2 max-h-[560px] overflow-y-auto dd-slim">
                                  {col.items.length === 0 ? (
                                    <div className="py-8 flex flex-col items-center gap-2 opacity-50">
                                      <Calendar size={18} className="text-slate-400" />
                                      <p className="text-[11px] font-medium text-slate-400">Empty</p>
                                    </div>
                                  ) : (
                                    <AnimatePresence>
                                      {col.items.map(dd => {
                                        const ds    = getStatus(dd);
                                        const dLeft = differenceInDays(new Date(dd.due_date), new Date());
                                        const isOwnOrAdmin = user?.role==='admin'||dd.assigned_to===user?.id;
                                        return (
                                          <DueDateBoardCard
                                            key={dd.id}
                                            dd={dd}
                                            ds={ds}
                                            dLeft={dLeft}
                                            isOwnOrAdmin={isOwnOrAdmin}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                            onCalendar={addToCalendar}
                                            user={user}
                                            getClientName={getClientName}
                                            getUserName={getUserName}
                                            isDark={isDark}
                                          />
                                        );
                                      })}
                                    </AnimatePresence>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Footer ── */}
                  {filtered.length > 0 && (
                    <div className={`px-4 py-3 border-t flex items-center justify-between ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'}`}>
                      <div className="flex items-center gap-3">
                        {stats.overdue > 0 && <span className="text-xs font-bold text-red-500">{stats.overdue} Overdue</span>}
                        {stats.upcoming > 0 && <span className="text-xs font-bold text-blue-500">{stats.upcoming} Due Soon</span>}
                        {stats.completed > 0 && <span className="text-xs font-bold text-emerald-500">{stats.completed} Completed</span>}
                      </div>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        Showing <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{filtered.length}</span> of{' '}
                        <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{dueDates.length}</span> due dates
                      </p>
                    </div>
                  )}

                </SectionCard>
              </motion.div>
            </React.Fragment>
          );

          return null;
        })}

      </motion.div>

      <SmartImportModal
        open={importOpen}
        onClose={()=>setImportOpen(false)}
        clients={clients}
        users={users}
        user={user}
        onImportDone={fetchDueDates}
      />

      {/* ── AI Duplicate Detection Dialog ── */}
      <AIDuplicateDialog
        open={showDupDialog}
        onClose={() => setShowDupDialog(false)}
        groups={dupGroups}
        items={dueDates.map(d => ({ ...d, name: d.title }))}
        entityLabel="Due Date"
        accentColor="#1F6FB2"
        isDark={isDark}
        canDelete={user?.role === 'admin'}
        canEdit={user?.role === 'admin' || user?.role === 'manager'}
        getTitle={(d) => d.title || 'Untitled'}
        getSubtitle={(d) => [d.category, d.department].filter(Boolean).join(' · ') || null}
        getMeta={(d) => [
          d.category   ? d.category   : null,
          d.department ? d.department : null,
          d.due_date   ? `Due: ${format(new Date(d.due_date), 'dd MMM yyyy')}` : null,
          d.status     ? d.status.replace('_', ' ') : null,
        ].filter(Boolean)}
        compareFields={(a, b) => [
          { label: 'Title',       a: a.title,                    b: b.title },
          { label: 'Category',    a: a.category,                 b: b.category },
          { label: 'Department',  a: a.department,               b: b.department },
          { label: 'Due Date',    a: a.due_date ? format(new Date(a.due_date), 'dd MMM yyyy') : '—', b: b.due_date ? format(new Date(b.due_date), 'dd MMM yyyy') : '—' },
          { label: 'Status',      a: a.status,                   b: b.status },
          { label: 'Assigned To', a: a.assigned_to,              b: b.assigned_to },
        ]}
        onEdit={(d) => { handleEdit(d); setShowDupDialog(false); }}
        onDelete={user?.role === 'admin' ? async (d) => {
          if (!window.confirm(`Delete "${d.title}"?`)) return;
          try {
            await api.delete(`/duedates/${d.id}`);
            setDueDates(prev => prev.filter(x => x.id !== d.id));
            toast.success('Due date deleted');
          } catch { toast.error('Failed to delete due date'); }
        } : undefined}
        onView={(d) => { handleEdit(d); setShowDupDialog(false); }}
      />
    </>
  );
}
