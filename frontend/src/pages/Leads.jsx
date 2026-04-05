import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Building2, User, Phone, Mail, Calendar,
  List, LayoutGrid, Check, TrendingUp, AlertTriangle, Clock, Zap,
  CheckCircle2, Loader2, Circle, X, ArrowRight, IndianRupee, FileText,
  UserCheck, Tag, MessageSquare, Target, ChevronRight, ShieldCheck,
  Timer, Layers, RefreshCw, Receipt, ClipboardCheck, FolderCheck,
  Users, CalendarDays, Flag, ClipboardList, MapPin, Briefcase, ListTodo, GripVertical,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ─── styles ──────────────────────────────────────────────────────────────── */
const INTERACTION_STYLES = `
  @keyframes ripple { 0%{transform:scale(0);opacity:.6} 100%{transform:scale(4);opacity:0} }
  @keyframes stageActivePulse { 0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.5)} 50%{box-shadow:0 0 0 4px rgba(59,130,246,0)} }
  @keyframes wonGlow { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.5)} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0)} }
  @keyframes lostShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-2px)} 40%{transform:translateX(2px)} 60%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
  .stage-btn-active{animation:stageActivePulse 1.5s ease-in-out 1}
  .ripple-container{position:relative;overflow:hidden}
  .ripple-container .ripple-effect{position:absolute;border-radius:50%;transform:scale(0);background:rgba(255,255,255,.4);animation:ripple .5s linear;pointer-events:none}
  .won-glow{animation:wonGlow 1s ease-out 1}
  .lost-shake{animation:lostShake .4s ease-out 1}
`;
useEffect(() => {
  if (!document.getElementById('leads-styles')) {
    const s = document.createElement('style');
    s.id = 'leads-styles';
    s.textContent = INTERACTION_STYLES;
    document.head.appendChild(s);
  }
}, []);

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', lightGreen: '#5CCB5F' };
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: .05 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: .3 } } };

const PIPELINE_STAGES = [
  { id: 'new',         label: 'New',         stripe: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200',           activeBg: 'bg-sky-500',     hoverBg: 'hover:bg-sky-50 hover:border-sky-400 hover:text-sky-700'         },
  { id: 'contacted',   label: 'Contacted',   stripe: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',   activeBg: 'bg-indigo-500',  hoverBg: 'hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700' },
  { id: 'meeting',     label: 'Meeting',     stripe: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 border-violet-200',   activeBg: 'bg-violet-500',  hoverBg: 'hover:bg-violet-50 hover:border-violet-400 hover:text-violet-700' },
  { id: 'proposal',    label: 'Proposal',    stripe: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       activeBg: 'bg-amber-500',   hoverBg: 'hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700'   },
  { id: 'negotiation', label: 'Negotiation', stripe: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200',   activeBg: 'bg-orange-500',  hoverBg: 'hover:bg-orange-50 hover:border-orange-400 hover:text-orange-700' },
  { id: 'on_hold',     label: 'On Hold',     stripe: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',       activeBg: 'bg-slate-400',   hoverBg: 'hover:bg-slate-100 hover:border-slate-400 hover:text-slate-700'   },
  { id: 'won',         label: 'Won',         stripe: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', activeBg: 'bg-emerald-600', hoverBg: 'hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700' },
  { id: 'lost',        label: 'Lost',        stripe: 'bg-red-500',     badge: 'bg-red-50 text-red-600 border-red-200',             activeBg: 'bg-red-500',     hoverBg: 'hover:bg-red-50 hover:border-red-400 hover:text-red-600'           },
];
const ACTIVE_STAGES = ['new', 'contacted', 'meeting', 'proposal', 'negotiation', 'on_hold'];
const KANBAN_COLS = ACTIVE_STAGES;

const LEAD_SOURCES = [
  { label: 'Direct', value: 'direct' }, { label: 'Website', value: 'website' },
  { label: 'Referral', value: 'referral' }, { label: 'Social Media', value: 'social_media' },
  { label: 'Event', value: 'event' },
];

const LEAD_SERVICES = [
  { value: 'GST',        color: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500'    },
  { value: 'Income Tax', color: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500'  },
  { value: 'Accounts',   color: 'bg-teal-50 text-teal-700 border-teal-200',          dot: 'bg-teal-500'    },
  { value: 'TDS',        color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500'   },
  { value: 'ROC',        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500'  },
  { value: 'Trademark',  color: 'bg-pink-50 text-pink-700 border-pink-200',          dot: 'bg-pink-500'    },
  { value: 'MSME',       color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500'  },
  { value: 'FEMA',       color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500'     },
  { value: 'DSC',        color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'Audit',      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',          dot: 'bg-cyan-500'    },
  { value: 'Payroll',    color: 'bg-lime-50 text-lime-700 border-lime-200',          dot: 'bg-lime-500'    },
  { value: 'PF/ESIC',    color: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500'    },
  { value: 'Other',      color: 'bg-slate-50 text-slate-600 border-slate-200',       dot: 'bg-slate-400'   },
];

const QUOTATION_STATUS_STYLE = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
};

const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Low',      color: 'text-green-600'  },
  { value: 'medium',   label: 'Medium',   color: 'text-amber-600'  },
  { value: 'high',     label: 'High',     color: 'text-orange-600' },
  { value: 'critical', label: 'Critical', color: 'text-red-600'    },
];

const CLIENT_TYPES = [
  { value: 'proprietor',  label: 'Proprietor'      },
  { value: 'pvt_ltd',     label: 'Private Limited' },
  { value: 'llp',         label: 'LLP'             },
  { value: 'partnership', label: 'Partnership'     },
  { value: 'huf',         label: 'HUF'             },
  { value: 'trust',       label: 'Trust'           },
  { value: 'other',       label: 'Other'           },
];

const TASK_CATEGORIES = [
  { value: 'gst',          label: 'GST'           },
  { value: 'income_tax',   label: 'Income Tax'    },
  { value: 'accounts',     label: 'Accounts'      },
  { value: 'tds',          label: 'TDS'           },
  { value: 'roc',          label: 'ROC'           },
  { value: 'trademark',    label: 'Trademark'     },
  { value: 'msme_smadhan', label: 'MSME Smadhan'  },
  { value: 'fema',         label: 'FEMA'          },
  { value: 'dsc',          label: 'DSC'           },
  { value: 'other',        label: 'Other'         },
];

// Stage-based quick task suggestions
const STAGE_TASK_SUGGESTIONS = {
  new:         ['Initial follow-up call', 'Send introduction email', 'Research prospect', 'Schedule first meeting'],
  contacted:   ['Follow up on response', 'Send company profile', 'Collect basic documents', 'Schedule discovery call'],
  meeting:     ['Prepare meeting agenda', 'Send meeting confirmation', 'Follow up post-meeting', 'Share meeting notes'],
  proposal:    ['Prepare proposal document', 'Send quotation', 'Follow up on proposal', 'Collect required documents for proposal'],
  negotiation: ['Discuss terms & conditions', 'Send revised proposal', 'Follow up on decision', 'Collect pending documents'],
  on_hold:     ['Check in with prospect', 'Re-engage follow-up', 'Send updated offering', 'Resolve blocking issue'],
  won:         ['Collect KYC documents', 'Send onboarding checklist', 'Send welcome email', 'Schedule onboarding call', 'Set up client portal'],
  lost:        ['Send feedback survey', 'Document loss reason', 'Re-engagement follow-up (future)', 'Update CRM notes'],
};

/* ─── tiny helpers ──────────────────────────────────────────────────────── */
const svcStyle  = (val) => LEAD_SERVICES.find(s => s.value === val) || LEAD_SERVICES[LEAD_SERVICES.length - 1];
const stageOf   = (id)  => PIPELINE_STAGES.find(s => s.id === id) || PIPELINE_STAGES[0];
const isOverdue = (l)   => l.next_follow_up && new Date(l.next_follow_up) < new Date() && !['won', 'lost'].includes(l.status);

const toLocalDT   = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocalDT = (s)   => { if (!s) return null; return new Date(s).toISOString(); };

function addRipple(e) {
  const btn = e.currentTarget, circle = document.createElement('span'),
    d = Math.max(btn.clientWidth, btn.clientHeight), r = d / 2,
    rect = btn.getBoundingClientRect();
  circle.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - rect.left - r}px;top:${e.clientY - rect.top - r}px;`;
  circle.classList.add('ripple-effect');
  const ex = btn.querySelector('.ripple-effect'); if (ex) ex.remove();
  btn.appendChild(circle); setTimeout(() => circle.remove(), 600);
}

/* ─── shared sub-components ─────────────────────────────────────────────── */
const ServiceBadge = ({ value, size = 'sm' }) => {
  const s = svcStyle(value);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-lg border font-semibold', s.color, size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>
      <span className={cn('rounded-full flex-shrink-0', s.dot, size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />{value}
    </span>
  );
};

const SectionLabel = ({ icon: Icon, children }) => (
  <div className="md:col-span-2 flex items-center gap-2 pt-2">
    <Icon className="h-3.5 w-3.5 text-slate-400" />
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</p>
    <div className="flex-1 h-px bg-slate-100" />
  </div>
);

const StatCard = ({ label, value, color, onClick, active }) => (
  <Card onClick={onClick} className={cn('border hover:shadow-md transition-all cursor-pointer rounded-2xl active:scale-95 select-none dark:bg-slate-800 dark:border-slate-700', active && 'ring-2 ring-blue-300 border-blue-300 shadow-md scale-[1.02]')}>
    <CardContent className="p-4 text-center">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={cn('text-3xl font-bold mt-1', color)}>{value}</p>
    </CardContent>
  </Card>
);

const DashboardStripCard = ({ stripeColor, isCompleted = false, className = '', children }) => (
  <div className={cn('relative rounded-2xl border overflow-hidden group transition-all duration-300',
    isCompleted ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-80' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:shadow-md hover:-translate-y-[1px]', className)}>
    <div className={cn('absolute left-0 top-0 h-full w-[6px] rounded-l-2xl transition-all duration-200 group-hover:w-[8px]', stripeColor)} />
    <div className={cn('pl-6 pr-6 transition-all', isCompleted ? 'py-3' : 'py-5')}>{children}</div>
  </div>
);

const StageButton = ({ stageId, isActive, onClick }) => {
  const stage = stageOf(stageId);
  const [clicked, setClicked] = useState(false);
  const handleClick = (e) => {
    if (isActive) return;
    addRipple(e); setClicked(true); setTimeout(() => setClicked(false), 600); onClick();
  };
  return (
    <button onClick={handleClick} className={cn('ripple-container h-6 px-2.5 text-[11px] font-semibold rounded-xl border transition-all duration-200 select-none',
      isActive ? cn(stage.activeBg, 'text-white border-transparent shadow-sm scale-[1.04] stage-btn-active') : cn('bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-600', stage.hoverBg, 'hover:scale-[1.03] hover:shadow-sm active:scale-95'),
      clicked && !isActive && 'scale-95')}>
      {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 mr-1 mb-0.5" />}{stage.label}
    </button>
  );
};

const StageProgressBar = ({ currentStatus, canEdit, onStageClick }) => {
  const currentIdx = ACTIVE_STAGES.indexOf(currentStatus);
  return (
    <div className="flex items-center gap-[3px]">
      {ACTIVE_STAGES.map((sid, i) => {
        const s = stageOf(sid), filled = i <= currentIdx, isCurrent = i === currentIdx;
        return (
          <button key={sid} onClick={() => canEdit && onStageClick(sid)} title={s.label}
            className={cn('flex-1 rounded-full transition-all duration-300', isCurrent ? 'h-2' : 'h-1.5',
              filled ? cn(s.stripe, isCurrent && 'ring-2 ring-offset-1 ring-current opacity-90') : 'bg-slate-200 dark:bg-slate-600',
              canEdit ? 'cursor-pointer hover:opacity-80 hover:h-2' : 'cursor-default')} />
        );
      })}
    </div>
  );
};

/* ─── Quotations panel ───────────────────────────────────────────────────── */
function LeadQuotationsPanel({ leadId, canCreateQuotation, onCreateQuotation }) {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get(`/leads/${leadId}/quotations`)
      .then(r => { if (!cancelled) setQuotations(r.data || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId]);

  if (loading) return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="h-6 w-32 bg-slate-100 rounded-lg animate-pulse" />
    </div>
  );

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
          <Receipt className="h-3 w-3" /> Quotations ({quotations.length})
        </p>
        {canCreateQuotation && (
          <button onClick={onCreateQuotation}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all active:scale-95">
            <Plus className="h-3 w-3" /> Create Quotation
          </button>
        )}
      </div>
      {quotations.length === 0
        ? <p className="text-[11px] text-slate-400 italic">No quotations linked yet.</p>
        : (
          <div className="space-y-1.5">
            {quotations.map(q => (
              <div key={q.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono font-bold text-slate-600">{q.quotation_no}</span>
                  <span className="text-[10px] text-slate-400 truncate">{q.service}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-bold text-slate-700">₹{(q.total || 0).toLocaleString()}</span>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full capitalize', QUOTATION_STATUS_STYLE[q.status] || 'bg-slate-50 text-slate-500')}>{q.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/* ─── Service selector ───────────────────────────────────────────────────── */
const ServiceSelector = ({ selected = [], onChange, extra = [] }) => {
  const extras = extra.filter(s => !LEAD_SERVICES.find(ls => ls.value.toLowerCase() === s.toLowerCase()))
    .map(s => ({ value: s, color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' }));
  const all = [...LEAD_SERVICES, ...extras];
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 bg-blue-50 rounded-2xl border border-blue-100">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider w-full mb-0.5">Selected</span>
          {selected.map(val => (
            <button key={val} type="button" onClick={() => toggle(val)}
              className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-lg border text-[11px] font-semibold bg-white dark:bg-slate-700 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 hover:text-red-600 transition-colors group active:scale-95">
              {val}<X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {all.map(svc => {
          const isSel = selected.includes(svc.value);
          return (
            <button key={svc.value} type="button" onClick={() => toggle(svc.value)}
              className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-2xl text-xs font-semibold border transition-all active:scale-95',
                isSel ? cn(svc.color, 'shadow-sm ring-1 ring-offset-1') : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50')}>
              {isSel && <Check className="h-3 w-3 flex-shrink-0" />}{svc.value}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   LEAD TO TASK DIALOG
   Creates a task from any lead at any stage. Task is linked to the lead
   and appears in the Tasks section automatically.
═══════════════════════════════════════════════════════════════════════════ */
function LeadTaskDialog({ lead, open, onClose, allUsers, currentUser }) {
  const [submitting, setSubmitting] = useState(false);
  const suggestions = STAGE_TASK_SUGGESTIONS[lead?.status] || STAGE_TASK_SUGGESTIONS['new'];

  const emptyTask = {
    title: '',
    description: '',
    assigned_to: lead?.assigned_to || '',
    priority: 'medium',
    due_date: '',
    category: 'other',
    notes: '',
  };
  const [taskForm, setTaskForm] = useState(emptyTask);

  useEffect(() => {
    if (open && lead) {
      setTaskForm({
        title: '',
        description: '',
        assigned_to: lead.assigned_to || '',
        priority: 'medium',
        due_date: '',
        category: 'other',
        notes: '',
      });
    }
  }, [open, lead]);

  const setField = (k, v) => setTaskForm(p => ({ ...p, [k]: v }));

  const handleSuggestionClick = (suggestion) => {
    setField('title', suggestion);
  };

  const handleSubmit = async () => {
    if (!taskForm.title?.trim()) {
      toast.error('Task title is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: [
          taskForm.description?.trim(),
          taskForm.notes?.trim() ? `Notes: ${taskForm.notes.trim()}` : '',
          `Lead: ${lead.company_name}`,
          lead.contact_name ? `Contact: ${lead.contact_name}` : '',
          lead.phone ? `Phone: ${lead.phone}` : '',
          lead.email ? `Email: ${lead.email}` : '',
          `Lead Stage: ${stageOf(lead.status)?.label || lead.status}`,
        ].filter(Boolean).join('\n'),
        assigned_to: taskForm.assigned_to && taskForm.assigned_to !== 'unassigned'
          ? taskForm.assigned_to : null,
        priority: taskForm.priority,
        due_date: taskForm.due_date ? new Date(taskForm.due_date).toISOString() : null,
        category: taskForm.category,
        status: 'pending',
        sub_assignees: [],
        is_recurring: false,
        lead_id: lead.id,
      };

      await api.post('/tasks', payload);
      toast.success(`Task created for ${lead.company_name}!`);
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const stage = stageOf(lead?.status);
  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block';
  const inputCls = 'h-9 rounded-xl text-sm border-slate-200 focus:border-blue-400';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <ListTodo className="h-5 w-5 text-blue-500" />
            Create Task
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 leading-relaxed">
            Create a task linked to <strong>{lead?.company_name}</strong>
            {' '}— will appear in the Tasks section automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Lead context pill */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border', stage?.badge)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', stage?.stripe)} />
            {stage?.label}
          </span>
          <span className="text-sm font-semibold text-slate-700">{lead?.company_name}</span>
          {lead?.contact_name && (
            <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
              <User className="h-3 w-3" />{lead.contact_name}
            </span>
          )}
        </div>

        {/* Quick suggestions */}
        <div className="space-y-2">
          <label className={labelCls}>Quick Suggestions for "{stage?.label}" stage</label>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                className={cn(
                  'text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                  taskForm.title === s
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className={labelCls}>Task Title <span className="text-red-500">*</span></label>
            <Input
              value={taskForm.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="e.g. Follow up on proposal, Collect KYC documents…"
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <Textarea
              value={taskForm.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Describe what needs to be done…"
              rows={3}
              className="resize-none rounded-xl text-sm border-slate-200"
            />
          </div>

          {/* Additional Notes */}
          <div>
            <label className={labelCls}>Additional Notes</label>
            <Textarea
              value={taskForm.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Any extra context, document names, contacts to reach, etc…"
              rows={2}
              className="resize-none rounded-xl text-sm border-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Assigned to */}
            <div>
              <label className={labelCls}>Assign To</label>
              <Select
                value={taskForm.assigned_to || 'unassigned'}
                onValueChange={v => setField('assigned_to', v === 'unassigned' ? '' : v)}
              >
                <SelectTrigger className={inputCls}><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">— Unassigned —</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}{u.id === currentUser?.id ? ' (you)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <label className={labelCls}>Priority</label>
              <Select value={taskForm.priority} onValueChange={v => setField('priority', v)}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={p.color}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div>
              <label className={labelCls}>Due Date</label>
              <Input
                type="date"
                value={taskForm.due_date}
                onChange={e => setField('due_date', e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Category */}
            <div>
              <label className={labelCls}>Category / Department</label>
              <Select value={taskForm.category} onValueChange={v => setField('category', v)}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> What will happen:</p>
            <p>• Task will be created and linked to lead <strong>{lead?.company_name}</strong></p>
            <p>• Task will appear in the <strong>Tasks section</strong> immediately</p>
            <p>• Lead stage remains <strong>{stage?.label}</strong> — unchanged</p>
            {taskForm.assigned_to && taskForm.assigned_to !== 'unassigned' && (
              <p>• Assigned user will receive a notification</p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="rounded-2xl h-9 text-slate-500">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}
            className="rounded-2xl h-9 bg-blue-700 hover:bg-blue-800 text-white min-w-[140px]">
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating Task…</>
              : <><ListTodo className="h-4 w-4 mr-2" />Create Task</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Client Conversion Dialog ───────────────────────────────────────────── */
function ClientConversionDialog({
  lead, open, onClose, onConvertNow, onConvertLater, converting,
  allUsers, currentUser, availableServices,
}) {
  const [step, setStep]     = useState(1);
  const [hovered, setHovered] = useState(null);

  const emptyContact = { name: '', email: '', phone: '', designation: '', birthday: '', din: '' };

  const buildInitialForm = (l) => ({
    company_name:      l?.company_name || '',
    client_type:       'proprietor',
    client_type_other: '',
    email:             l?.email || '',
    phone:             l?.phone || '',
    birthday:          '',
    address:           '',
    city:              '',
    state:             '',
    services:          l?.services || [],
    notes:             l?.notes || '',
    referred_by:       '',
    contact_persons: l?.contact_name
      ? [{ name: l.contact_name, email: l.email || '', phone: l.phone || '', designation: '', birthday: '', din: '' }]
      : [{ ...emptyContact }],
    assignments: l?.assigned_to ? [{ user_id: l.assigned_to, services: [] }] : [{ user_id: '', services: [] }],
  });

  const [clientForm, setClientForm] = useState(buildInitialForm(lead));

  useEffect(() => {
    if (open) {
      setStep(1);
      setClientForm(buildInitialForm(lead));
    }
  }, [open, lead]);

  const setField = (key, val) => setClientForm(p => ({ ...p, [key]: val }));

  const updateContact = (idx, field, val) =>
    setClientForm(p => ({ ...p, contact_persons: p.contact_persons.map((c, i) => i === idx ? { ...c, [field]: val } : c) }));
  const addContact    = () => setClientForm(p => ({ ...p, contact_persons: [...p.contact_persons, { ...emptyContact }] }));
  const removeContact = (idx) => setClientForm(p => ({ ...p, contact_persons: p.contact_persons.filter((_, i) => i !== idx) }));

  const updateAssignment = (idx, userId) =>
    setClientForm(p => ({ ...p, assignments: p.assignments.map((a, i) => i === idx ? { ...a, user_id: userId } : a) }));
  const addAssignment    = () => setClientForm(p => ({ ...p, assignments: [...p.assignments, { user_id: '', services: [] }] }));
  const removeAssignment = (idx) => setClientForm(p => ({ ...p, assignments: p.assignments.filter((_, i) => i !== idx) }));

  const handleProceed = () => { if (step === 1) { setStep(2); } };

  const handleSubmit = () => {
    if (!clientForm.company_name?.trim()) { toast.error('Company name is required'); return; }
    onConvertNow(clientForm);
  };

  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block';
  const inputCls = 'h-9 rounded-xl text-sm border-slate-200 focus:border-emerald-400';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !converting) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            {step === 1 ? 'Convert to Client?' : 'New Client Profile'}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 leading-relaxed">
            {step === 1
              ? <><strong>{lead?.company_name}</strong> will be converted to a full client profile. Choose how to proceed.</>
              : <>Fill in the client details for <strong>{lead?.company_name}</strong>. All fields are pre-filled from the lead — review and complete before saving.</>
            }
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3 py-2">
            {[
              {
                key: 'now', icon: Building2,
                title: 'Convert to Client Now',
                desc: 'Creates a full client profile (pre-filled from lead data). Review and complete before saving.',
                cls: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400',
                activeCls: 'border-emerald-400 bg-emerald-100 shadow-md',
                iconBg: 'bg-emerald-100', iconActive: 'bg-emerald-300',
                iconColor: 'text-emerald-600', labelCls: 'text-emerald-800', descCls: 'text-emerald-600',
                onClick: handleProceed,
              },
              {
                key: 'later', icon: Timer,
                title: 'Mark Won — Convert Later',
                desc: 'Marks the lead as Won only. You can create a client profile anytime from the closed section.',
                cls: 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300',
                activeCls: 'border-slate-400 bg-slate-100 shadow-md',
                iconBg: 'bg-slate-100', iconActive: 'bg-slate-300',
                iconColor: 'text-slate-500', labelCls: 'text-slate-700', descCls: 'text-slate-500',
                onClick: () => onConvertLater(),
              },
            ].map(opt => (
              <button key={opt.key} onClick={opt.onClick} disabled={converting}
                onMouseEnter={() => setHovered(opt.key)} onMouseLeave={() => setHovered(null)}
                className={cn('w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 ripple-container',
                  hovered === opt.key ? opt.activeCls : opt.cls,
                  converting && 'opacity-60 cursor-not-allowed')}>
                <div className="flex items-start gap-3">
                  <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                    hovered === opt.key ? cn(opt.iconActive, 'scale-110') : opt.iconBg)}>
                    {converting ? <Loader2 className={cn('h-4 w-4 animate-spin', opt.iconColor)} /> : <opt.icon className={cn('h-4 w-4', opt.iconColor)} />}
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', opt.labelCls)}>{opt.title}</p>
                    <p className={cn('text-xs mt-0.5 leading-relaxed', opt.descCls)}>{opt.desc}</p>
                  </div>
                  <ChevronRight className={cn('h-4 w-4 ml-auto flex-shrink-0 mt-0.5 transition-all',
                    hovered === opt.key ? cn(opt.iconColor, 'translate-x-1') : 'text-slate-300')} />
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 py-2">
            {/* Company Info */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-slate-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Company Information</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Company Name <span className="text-red-500">*</span></label>
                  <Input value={clientForm.company_name} onChange={e => setField('company_name', e.target.value)}
                    placeholder="e.g. Sharma & Associates" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Client Type</label>
                  <Select value={clientForm.client_type} onValueChange={v => setField('client_type', v)}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {clientForm.client_type === 'other' && (
                    <Input className="mt-2 h-9 rounded-xl text-sm border-slate-200" placeholder="Specify type…"
                      value={clientForm.client_type_other} onChange={e => setField('client_type_other', e.target.value)} />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Date of Incorporation</label>
                  <Input type="date" value={clientForm.birthday} onChange={e => setField('birthday', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <Input type="email" value={clientForm.email} onChange={e => setField('email', e.target.value)}
                    placeholder="contact@company.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <Input value={clientForm.phone} onChange={e => setField('phone', e.target.value)}
                    placeholder="10-digit number" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Referred By</label>
                  <Input value={clientForm.referred_by} onChange={e => setField('referred_by', e.target.value)}
                    placeholder="Referral source" className={inputCls} />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 text-slate-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Address</p>
              </div>
              <Input value={clientForm.address} onChange={e => setField('address', e.target.value)}
                placeholder="Street address" className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>City</label>
                  <Input value={clientForm.city} onChange={e => setField('city', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <Input value={clientForm.state} onChange={e => setField('state', e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>

            {/* Contact Persons */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contact Persons</p>
                </div>
                <button type="button" onClick={addContact}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all active:scale-95">
                  <Plus className="h-3 w-3" /> Add Person
                </button>
              </div>
              <div className="space-y-3">
                {clientForm.contact_persons.map((cp, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-white relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                        <span className="text-xs font-semibold text-slate-600">{cp.name || `Contact ${idx + 1}`}</span>
                      </div>
                      {clientForm.contact_persons.length > 1 && (
                        <button type="button" onClick={() => removeContact(idx)}
                          className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className={labelCls}>Full Name</label>
                        <Input value={cp.name} onChange={e => updateContact(idx, 'name', e.target.value)}
                          placeholder="Contact name" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Designation</label>
                        <Input value={cp.designation} onChange={e => updateContact(idx, 'designation', e.target.value)}
                          placeholder="Director, Partner…" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <Input type="email" value={cp.email} onChange={e => updateContact(idx, 'email', e.target.value)}
                          placeholder="email@example.com" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <Input value={cp.phone} onChange={e => updateContact(idx, 'phone', e.target.value)}
                          placeholder="10-digit number" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Date of Birth</label>
                        <Input type="date" value={cp.birthday || ''} onChange={e => updateContact(idx, 'birthday', e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>DIN (Director ID)</label>
                        <Input value={cp.din || ''} onChange={e => updateContact(idx, 'din', e.target.value)}
                          placeholder="DIN number" className={inputCls} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Services */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-4 w-4 text-slate-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Services</p>
              </div>
              <ServiceSelector selected={clientForm.services} onChange={v => setField('services', v)} extra={availableServices || []} />
            </div>

            {/* Staff Assignment */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-slate-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Staff Assignment</p>
                </div>
                <button type="button" onClick={addAssignment}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all active:scale-95">
                  <Plus className="h-3 w-3" /> Add Staff
                </button>
              </div>
              <div className="space-y-2">
                {clientForm.assignments.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 border border-slate-200 rounded-xl p-3 bg-white">
                    <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                    <Select value={a.user_id || 'unassigned'} onValueChange={v => updateAssignment(idx, v === 'unassigned' ? '' : v)}>
                      <SelectTrigger className="flex-1 h-8 rounded-xl text-xs border-slate-200"><SelectValue placeholder="Select staff…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">— Unassigned —</SelectItem>
                        {allUsers.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name}{u.id === currentUser?.id ? ' (you)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {clientForm.assignments.length > 1 && (
                      <button type="button" onClick={() => removeAssignment(idx)}
                        className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Internal Notes</label>
              <Textarea value={clientForm.notes} onChange={e => setField('notes', e.target.value)}
                placeholder="Internal remarks, requirements…" rows={3} className="resize-none rounded-2xl text-sm border-slate-200" />
            </div>

            {/* Summary */}
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> What will happen:</p>
              <p>• New client profile created for <strong>{clientForm.company_name || lead?.company_name}</strong></p>
              <p>• Lead marked as <strong>Won</strong> with client link</p>
              {clientForm.services.length > 0 && <p>• Services: <strong>{clientForm.services.join(', ')}</strong></p>}
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 gap-2">
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)} disabled={converting} className="rounded-2xl h-9 text-slate-500">
              ← Back
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={converting} className="rounded-2xl h-9 text-slate-500">
            Cancel
          </Button>
          {step === 2 && (
            <Button onClick={handleSubmit} disabled={converting}
              className="rounded-2xl h-9 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]">
              {converting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating Client…</>
                : <><Building2 className="h-4 w-4 mr-2" />Create Client Profile</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function LeadsPage() {
  const isDark = useDark();
  const { user } = useAuth();
  const isAdmin         = user?.role === 'admin';
  const perms           = user?.permissions || {};
  const canDeleteLead   = isAdmin || !!perms.can_manage_users;
  const canUseQuotations = isAdmin || !!perms.can_create_quotations;
  const canEditLead     = (l) => isAdmin || l?.assigned_to === user?.id || l?.created_by === user?.id;

  const [leads,             setLeads]             = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [allUsers,          setAllUsers]          = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [submitting,        setSubmitting]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [statusFilter,      setStatusFilter]      = useState('all');
  const [serviceFilter,     setServiceFilter]     = useState('all');
  const [viewMode,          setViewMode]          = useState('list');
  const [dialogOpen,        setDialogOpen]        = useState(false);
  const [editingLead,       setEditingLead]       = useState(null);
  const [clientConvLead,    setClientConvLead]    = useState(null);
  const [clientConverting,  setClientConverting]  = useState(false);
  const [errors,            setErrors]            = useState({});
  const [expandedQtn,       setExpandedQtn]       = useState({});

  // ── NEW: Lead Task Dialog state ──────────────────────────────────────────
  const [taskLead,          setTaskLead]          = useState(null); // lead for which task is being created

  const emptyForm = {
    company_name: '', contact_name: '', email: '', phone: '',
    quotation_amount: '', services: [], source: 'direct',
    referred_by: '', notes: '', assigned_to: '', status: 'new',
    next_follow_up: '', date_of_meeting: '',
    closure_probability: '', checklist_sent: false, documents_received: false,
  };
  const [form, setForm] = useState(emptyForm);

  const fetchLeads = async () => {
    try {
      const r = await api.get('/leads/');
      setLeads(r.data);
    } catch {
      toast.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    api.get('/leads/meta/services').then(r => {
      const raw = r.data; setAvailableServices(Array.isArray(raw) ? raw : (raw?.services || []));
    }).catch(() => {});
    api.get('/users').then(r => setAllUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const stats = useMemo(() => ({
    total:       leads.length,
    active:      leads.filter(l => ACTIVE_STAGES.includes(l.status)).length,
    won:         leads.filter(l => l.status === 'won').length,
    lost:        leads.filter(l => l.status === 'lost').length,
    negotiation: leads.filter(l => l.status === 'negotiation').length,
    overdue:     leads.filter(isOverdue).length,
    wonValue:    leads.filter(l => l.status === 'won').reduce((s, l) => s + (Number(l.quotation_amount) || 0), 0),
    pipeValue:   leads.filter(l => ACTIVE_STAGES.includes(l.status)).reduce((s, l) => s + (Number(l.quotation_amount) || 0), 0),
  }), [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return leads
      .filter(l => !q || l.company_name?.toLowerCase().includes(q) || l.contact_name?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q))
      .filter(l => statusFilter === 'all' || (statusFilter === 'active' ? ACTIVE_STAGES.includes(l.status) : l.status === statusFilter))
      .filter(l => serviceFilter === 'all' || (l.services || []).includes(serviceFilter));
  }, [leads, searchQuery, statusFilter, serviceFilter]);

  const userNameById = id => { const u = allUsers.find(u => u.id === id); return u ? u.full_name : id || '—'; };

  const resetForm = () => { setForm(emptyForm); setErrors({}); };
  const handleChange = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openEdit = (lead) => {
    setEditingLead(lead);
    setForm({
      company_name:       lead.company_name || '',
      contact_name:       lead.contact_name || '',
      email:              lead.email || '',
      phone:              lead.phone || '',
      quotation_amount:   lead.quotation_amount ?? '',
      services:           lead.services || [],
      source:             lead.source || 'direct',
      referred_by:        lead.referred_by || '',
      notes:              lead.notes || '',
      assigned_to:        lead.assigned_to || '',
      status:             lead.status || 'new',
      next_follow_up:     toLocalDT(lead.next_follow_up),
      date_of_meeting:    toLocalDT(lead.date_of_meeting),
      closure_probability: lead.closure_probability ?? '',
      checklist_sent:     lead.checklist_sent || false,
      documents_received: lead.documents_received || false,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingLead(null); resetForm(); };

  const handleSubmit = async () => {
    if (!form.company_name?.trim()) { setErrors({ company_name: 'Company name is required' }); return; }
    setSubmitting(true);
    const payload = {
      company_name:        form.company_name.trim(),
      contact_name:        form.contact_name || null,
      email:               form.email || null,
      phone:               form.phone || null,
      quotation_amount:    form.quotation_amount !== '' ? Number(form.quotation_amount) : null,
      services:            form.services,
      source:              form.source || 'direct',
      referred_by:         form.referred_by || null,
      notes:               form.notes || null,
      assigned_to:         form.assigned_to && form.assigned_to !== 'unassigned' ? form.assigned_to : null,
      status:              form.status || 'new',
      next_follow_up:      fromLocalDT(form.next_follow_up),
      date_of_meeting:     fromLocalDT(form.date_of_meeting),
      closure_probability: form.closure_probability !== '' ? Number(form.closure_probability) : null,
      checklist_sent:      form.checklist_sent || false,
      documents_received:  form.documents_received || false,
    };
    try {
      if (editingLead) {
        await api.patch(`/leads/${editingLead.id}`, payload);
        toast.success('Lead updated!');
      } else {
        await api.post('/leads/', payload);
        toast.success('Lead created!');
      }
      closeDialog(); fetchLeads();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (lead) => {
    if (!window.confirm(`Delete "${lead.company_name}"? This cannot be undone.`)) return;
    try {
      setLeads(p => p.filter(l => l.id !== lead.id));
      await api.delete(`/leads/${lead.id}`);
      toast.success('Lead deleted');
    } catch {
      toast.error('Failed to delete'); fetchLeads();
    }
  };

  const handleQuickStage = async (lead, newStatus) => {
    if (newStatus === 'won') { setClientConvLead(lead); return; }
    if (newStatus === 'lost' && !window.confirm(`Mark "${lead.company_name}" as Lost?`)) return;
    try {
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
      await api.patch(`/leads/${lead.id}`, { status: newStatus });
      fetchLeads();
    } catch {
      toast.error('Failed to update stage'); fetchLeads();
    }
  };

  const handleToggle = async (lead, field) => {
    const newVal = !lead[field];
    try {
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, [field]: newVal } : l));
      await api.patch(`/leads/${lead.id}`, { [field]: newVal });
      toast.success(field === 'checklist_sent'
        ? (newVal ? 'Checklist marked as sent' : 'Checklist mark removed')
        : (newVal ? 'Documents marked as received' : 'Docs mark removed'));
    } catch {
      toast.error('Failed to update'); fetchLeads();
    }
  };

  /* ── Convert lead → full client profile ── */
  const handleClientConvertNow = async (clientFormData) => {
    if (!clientConvLead) return;
    setClientConverting(true);
    try {
      const cleanedContacts = (clientFormData.contact_persons || [])
        .filter(cp => cp.name?.trim())
        .map(cp => ({
          name:        cp.name.trim(),
          designation: cp.designation?.trim() || null,
          email:       cp.email?.trim() || null,
          phone:       cp.phone?.replace(/\D/g, '') || null,
          birthday:    cp.birthday || null,
          din:         cp.din?.trim() || null,
        }));

      const cleanedAssignments = (clientFormData.assignments || [])
        .filter(a => a.user_id && a.user_id !== 'unassigned')
        .map(a => ({ user_id: a.user_id, services: a.services || [] }));

      const clientPayload = {
        company_name:  clientFormData.company_name?.trim() || clientConvLead.company_name,
        client_type:   clientFormData.client_type || 'proprietor',
        ...(clientFormData.client_type === 'other'
          ? { client_type_label: clientFormData.client_type_other?.trim() || 'Other' }
          : {}),
        email:       clientFormData.email?.trim() || null,
        phone:       clientFormData.phone?.replace(/\D/g, '') || null,
        birthday:    clientFormData.birthday || null,
        address:     clientFormData.address?.trim() || null,
        city:        clientFormData.city?.trim() || null,
        state:       clientFormData.state?.trim() || null,
        services:    clientFormData.services || [],
        notes:       clientFormData.notes?.trim() || null,
        referred_by: clientFormData.referred_by?.trim() || null,
        contact_persons: cleanedContacts,
        assignments:     cleanedAssignments,
        assigned_to:     cleanedAssignments[0]?.user_id || null,
        dsc_details:     [],
        status:          'active',
        created_by:      user?.id,
      };

      const clientRes = await api.post('/clients', clientPayload);
      const clientId = clientRes.data?.id;
      if (!clientId) throw new Error('Client creation failed — no ID returned');

      await api.patch(`/leads/${clientConvLead.id}`, {
        status:              'won',
        converted_client_id: clientId,
      });

      toast.success(`"${clientConvLead.company_name}" converted to client successfully!`);
      setClientConvLead(null);
      fetchLeads();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : (err?.message || 'Conversion failed'));
    } finally {
      setClientConverting(false);
    }
  };

  const handleClientConvertLater = async () => {
    if (!clientConvLead) return;
    setClientConverting(true);
    try {
      await api.patch(`/leads/${clientConvLead.id}`, { status: 'won', converted_client_id: null });
      toast.success(`"${clientConvLead.company_name}" marked as Won.`);
      setClientConvLead(null);
      fetchLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to mark as won');
    } finally {
      setClientConverting(false);
    }
  };

  const handleCreateQuotation = (lead) => {
    sessionStorage.setItem('createQuotationForLead', JSON.stringify({
      lead_id: lead.id, client_name: lead.company_name,
      client_phone: lead.phone || '', client_email: lead.email || '',
      service: (lead.services || [])[0] || '',
    }));
    window.location.href = '/quotations';
  };

  if (loading) return (
    <div className="space-y-4 p-6">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
    </div>
  );

  const activeLeads = filteredLeads.filter(l => !['won', 'lost'].includes(l.status));
  const closedLeads = filteredLeads.filter(l => ['won', 'lost'].includes(l.status));

  // ── Drag-and-drop state ─────────────────────────────────────────────────
  const [leadListIds, setLeadListIds] = React.useState([]);
  const [kanbanLeadIds, setKanbanLeadIds] = React.useState({});

  React.useEffect(() => {
    setLeadListIds(activeLeads.map(l => l.id));
  }, [activeLeads.map(l => l.id).join(',')]);

  React.useEffect(() => {
    const grouped = {};
    KANBAN_COLS.forEach(sid => {
      grouped[sid] = filteredLeads.filter(l => l.status === sid).map(l => l.id);
    });
    setKanbanLeadIds(grouped);
  }, [filteredLeads.map(l => l.id + l.status).join(',')]);

  const orderedActiveLeads = React.useMemo(() => {
    const leadMap = Object.fromEntries(activeLeads.map(l => [l.id, l]));
    const result = leadListIds.map(id => leadMap[id]).filter(Boolean);
    const extra = activeLeads.filter(l => !leadListIds.includes(l.id));
    return [...result, ...extra];
  }, [leadListIds, activeLeads]);

  const onLeadListDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    const newIds = [...leadListIds];
    const [moved] = newIds.splice(source.index, 1);
    newIds.splice(destination.index, 0, moved);
    setLeadListIds(newIds);
  };

  const onKanbanDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const srcStatus = source.droppableId;
    const dstStatus = destination.droppableId;
    if (srcStatus === dstStatus && source.index === destination.index) return;

    const newBoard = { ...kanbanLeadIds };
    const srcIds = [...(newBoard[srcStatus] || [])];
    const [movedId] = srcIds.splice(source.index, 1);

    if (srcStatus === dstStatus) {
      srcIds.splice(destination.index, 0, movedId);
      newBoard[srcStatus] = srcIds;
    } else {
      const dstIds = [...(newBoard[dstStatus] || [])];
      dstIds.splice(destination.index, 0, movedId);
      newBoard[srcStatus] = srcIds;
      newBoard[dstStatus] = dstIds;
      const lead = filteredLeads.find(l => String(l.id) === String(movedId));
      if (lead) handleQuickStage(lead, dstStatus);
    }
    setKanbanLeadIds(newBoard);
  };

  const getKanbanColOrderedLeads = (sid) => {
    const leadMap = Object.fromEntries(filteredLeads.map(l => [l.id, l]));
    const ids = kanbanLeadIds[sid] || [];
    const result = ids.map(id => leadMap[id]).filter(l => l && l.status === sid);
    const extra = filteredLeads.filter(l => l.status === sid && !ids.includes(l.id));
    return [...result, ...extra];
  };

  /* ── Shared action button row for any lead ── */
  const renderLeadActionButtons = (lead, isClosedSection = false) => {
    const editable = canEditLead(lead);
    return (
      <div className="flex flex-wrap gap-1.5">
        {/* Edit */}
        {editable && (
          <button onClick={() => openEdit(lead)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all active:scale-95">
            <Edit className="h-3 w-3" />Edit Lead
          </button>
        )}

        {/* ── CREATE TASK — available at ALL stages ── */}
        {editable && (
          <button
            onClick={() => setTaskLead(lead)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all active:scale-95"
          >
            <ListTodo className="h-3 w-3" />Create Task
          </button>
        )}

        {/* ── CONVERT TO CLIENT — available at ALL stages ── */}
        {editable && !lead.converted_client_id && (
          <button onClick={() => setClientConvLead(lead)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all active:scale-95">
            <Building2 className="h-3 w-3" />Convert to Client
          </button>
        )}

        {/* Won-specific actions */}
        {lead.status === 'won' && editable && (
          <>
            <button onClick={() => handleQuickStage(lead, 'negotiation')}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all active:scale-95">
              <RefreshCw className="h-3 w-3" />Reopen
            </button>
            <button onClick={() => handleToggle(lead, 'checklist_sent')}
              className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                lead.checklist_sent ? 'bg-teal-500 text-white border-teal-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50')}>
              <ClipboardCheck className="h-3 w-3" />{lead.checklist_sent ? 'Checklist Sent ✓' : 'Checklist Sent?'}
            </button>
            <button onClick={() => handleToggle(lead, 'documents_received')}
              className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                lead.documents_received ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50')}>
              <FolderCheck className="h-3 w-3" />{lead.documents_received ? 'Docs Received ✓' : 'Docs Received?'}
            </button>
          </>
        )}

        {/* Lost-specific */}
        {lead.status === 'lost' && editable && (
          <button onClick={() => handleQuickStage(lead, 'negotiation')}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all active:scale-95">
            <RefreshCw className="h-3 w-3" />Reopen
          </button>
        )}

        {/* Delete */}
        {canDeleteLead && (
          <button onClick={() => handleDelete(lead)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-500 bg-white hover:bg-red-50 transition-all active:scale-95">
            <Trash2 className="h-3 w-3" />Delete
          </button>
        )}
      </div>
    );
  };

  return (
    <motion.div
      className={`space-y-4 p-2 md:p-4 min-h-screen rounded-2xl ${isDark ? 'bg-[#0f172a]' : ''}`}
      variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600" />
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight dark:text-blue-300" style={{ color: COLORS.deepBlue }}>
                Lead Pipeline
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {stats.active} active ·&nbsp;<span className="text-emerald-600 font-medium">{stats.won} won</span>
                {stats.overdue > 0 && <span className="text-red-500 font-medium"> · {stats.overdue} overdue</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl shadow-sm">
                {[{ id: 'list', icon: List }, { id: 'kanban', icon: LayoutGrid }].map(v => (
                  <Button key={v.id} variant="ghost" size="sm"
                    className={cn('rounded-xl font-medium transition-all', viewMode === v.id ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700')}
                    onClick={() => setViewMode(v.id)}>
                    <v.icon className="h-4 w-4 mr-1" />{v.id.charAt(0).toUpperCase() + v.id.slice(1)}
                  </Button>
                ))}
              </div>
              <Button size="sm"
                className="h-9 px-4 text-sm font-medium rounded-2xl shadow-sm hover:shadow-md bg-blue-700 hover:bg-blue-800 text-white active:scale-95 transition-all"
                onClick={() => { resetForm(); setEditingLead(null); setDialogOpen(true); }}>
                <Plus className="mr-2 h-5 w-5" />New Lead
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total"       value={stats.total}       color="text-slate-800"   onClick={() => setStatusFilter('all')}         active={statusFilter === 'all'} />
        <StatCard label="Active"      value={stats.active}      color="text-blue-600"    onClick={() => setStatusFilter('active')}      active={statusFilter === 'active'} />
        <StatCard label="Won"         value={stats.won}         color="text-emerald-600" onClick={() => setStatusFilter('won')}         active={statusFilter === 'won'} />
        <StatCard label="Lost"        value={stats.lost}        color="text-red-600"     onClick={() => setStatusFilter('lost')}        active={statusFilter === 'lost'} />
        <StatCard label="Negotiation" value={stats.negotiation} color="text-orange-600"  onClick={() => setStatusFilter('negotiation')} active={statusFilter === 'negotiation'} />
      </motion.div>

      {/* ── Revenue ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Won Revenue</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">₹{stats.wonValue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Pipeline Value</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 mt-1">₹{stats.pipeValue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Filters ── */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search leads…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 rounded-2xl" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 rounded-2xl text-sm">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="active">Active Leads</SelectItem>
            {PIPELINE_STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-40 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 rounded-2xl text-sm">
            <SelectValue placeholder="All Services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {LEAD_SERVICES.map(s => <SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
        </p>
      </motion.div>

      {/* ══════════ LIST VIEW ══════════ */}
      {viewMode === 'list' && (
        <DragDropContext onDragEnd={onLeadListDragEnd}>
        <motion.div className="space-y-3" variants={containerVariants}>
          {filteredLeads.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <Circle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No leads found</p>
              <p className="text-xs mt-1">Try adjusting your filters or add a new lead</p>
            </div>
          )}

          {/* Active leads */}
          <Droppable droppableId="leads-list">
            {(listProvided) => (
              <div ref={listProvided.innerRef} {...listProvided.droppableProps} className="space-y-3">
          {orderedActiveLeads.map((lead, leadIndex) => {
            const stage = stageOf(lead.status);
            const overdue = isOverdue(lead);
            const qtnOpen = !!expandedQtn[lead.id];
            return (
              <Draggable key={String(lead.id)} draggableId={String(lead.id)} index={leadIndex}>
                {(leadDragProvided, leadDragSnapshot) => (
                <div ref={leadDragProvided.innerRef} {...leadDragProvided.draggableProps}>
              <motion.div variants={itemVariants}>
                <DashboardStripCard stripeColor={stage.stripe} className={leadDragSnapshot.isDragging ? 'shadow-2xl ring-2 ring-blue-400/30' : ''}>
                  <div className="flex flex-col gap-3">
                    {/* Row 1 — title + badges + quick actions */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        <span {...leadDragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 transition-colors flex-shrink-0" title="Drag to reorder">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{lead.company_name}</span>
                        <motion.span key={lead.status} initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                          className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold border', stage.badge)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', stage.stripe)} />{stage.label}
                        </motion.span>
                        {lead.closure_probability != null && (
                          <span className={cn('hidden sm:inline-flex px-2.5 py-0.5 rounded-xl text-[11px] font-bold',
                            lead.closure_probability >= 70 ? 'bg-emerald-50 text-emerald-700' : lead.closure_probability >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}>
                            <Target className="h-3 w-3 mr-1" />{lead.closure_probability}% close
                          </span>
                        )}
                        {overdue && (
                          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">
                            <AlertTriangle className="h-3 w-3" />Overdue
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="hidden md:inline text-sm font-bold text-slate-700">
                          ₹{(Number(lead.quotation_amount) || 0).toLocaleString()}
                        </span>
                        {canUseQuotations && (
                          <button onClick={() => setExpandedQtn(p => ({ ...p, [lead.id]: !p[lead.id] }))} title="Linked Quotations"
                            className={cn('p-1.5 rounded-xl transition-all active:scale-90 hover:shadow-sm',
                              qtnOpen ? 'bg-purple-100 text-purple-700' : 'hover:bg-purple-50 text-slate-400 hover:text-purple-600')}>
                            <Receipt className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEditLead(lead) && (
                          <button onClick={() => openEdit(lead)}
                            className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-all active:scale-90">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDeleteLead && (
                          <button onClick={() => handleDelete(lead)}
                            className="p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-all active:scale-90">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Contact info */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      {lead.contact_name  && <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{lead.contact_name}</span>}
                      {lead.phone         && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>}
                      {lead.email         && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{lead.email}</span>}
                      {lead.assigned_to   && <span className="flex items-center gap-1.5 font-medium text-blue-600"><UserCheck className="h-3.5 w-3.5" />{userNameById(lead.assigned_to)}</span>}
                      {lead.referred_by   && <span className="flex items-center gap-1.5 font-medium text-emerald-600"><User className="h-3.5 w-3.5" />Ref: {lead.referred_by}</span>}
                      {lead.next_follow_up && (
                        <span className={cn('flex items-center gap-1.5 font-medium', overdue ? 'text-red-500' : 'text-slate-500')}>
                          <Calendar className="h-3.5 w-3.5" />
                          Follow-up: {format(new Date(lead.next_follow_up), 'dd MMM yyyy, hh:mm a')}
                          {overdue && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">OVERDUE</span>}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Services */}
                    {(lead.services || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Tag className="h-3 w-3 text-slate-300 flex-shrink-0" />
                        {lead.services.map(s => <ServiceBadge key={s} value={s} />)}
                      </div>
                    )}

                    {/* Row 4: Stage progress bar */}
                    {canEditLead(lead) && (
                      <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                        <StageProgressBar currentStatus={lead.status} canEdit={true} onStageClick={sid => handleQuickStage(lead, sid)} />
                        <div className="flex gap-1 flex-wrap">
                          {ACTIVE_STAGES.map(sid => (
                            <StageButton key={sid} stageId={sid} isActive={lead.status === sid} onClick={() => handleQuickStage(lead, sid)} />
                          ))}
                          <button
                            onClick={e => { addRipple(e); e.currentTarget.classList.add('won-glow'); handleQuickStage(lead, 'won'); }}
                            className="ripple-container h-6 px-2.5 text-[11px] font-semibold rounded-xl border bg-white dark:bg-slate-700 text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:shadow-md active:scale-95 transition-all">
                            Won ✓
                          </button>
                          <button
                            onClick={e => { addRipple(e); e.currentTarget.classList.add('lost-shake'); handleQuickStage(lead, 'lost'); }}
                            className="ripple-container h-6 px-2.5 text-[11px] font-semibold rounded-xl border bg-white dark:bg-slate-700 text-red-400 border-slate-200 hover:bg-red-500 hover:text-white hover:shadow-md active:scale-95 transition-all">
                            Lost
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Row 5: Action buttons — Create Task + Convert to Client at ALL stages */}
                    {canEditLead(lead) && (
                      <div className="pt-1 border-t border-slate-100 dark:border-slate-700">
                        {renderLeadActionButtons(lead, false)}
                      </div>
                    )}

                    {/* Row 6: Quotations panel */}
                    {canUseQuotations && qtnOpen && (
                      <AnimatePresence>
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .2 }}>
                          <LeadQuotationsPanel
                            leadId={lead.id}
                            canCreateQuotation={canUseQuotations && canEditLead(lead)}
                            onCreateQuotation={() => handleCreateQuotation(lead)}
                          />
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </div>
                </DashboardStripCard>
              </motion.div>
              </div>
              )}
              </Draggable>
            );
          })}
              {listProvided.placeholder}
            </div>
          )}
          </Droppable>

          {/* Closed leads */}
          {closedLeads.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">Closed</p>
              {closedLeads.map(lead => {
                const stage = stageOf(lead.status);
                return (
                  <motion.div key={lead.id} variants={itemVariants}>
                    <DashboardStripCard stripeColor={stage.stripe} isCompleted>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                            <span className="text-sm font-semibold text-slate-600">{lead.company_name}</span>
                            <span className={cn('px-2.5 py-0.5 rounded-xl text-[11px] font-bold border', stage.badge)}>{stage.label}</span>
                            {lead.assigned_to && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-blue-600">
                                <UserCheck className="h-3 w-3" />{userNameById(lead.assigned_to)}
                              </span>
                            )}
                            {lead.converted_client_id && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                                <CheckCircle2 className="h-3 w-3" />Client Created
                              </span>
                            )}
                            {(lead.services || []).slice(0, 3).map(s => <ServiceBadge key={s} value={s} />)}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={cn('text-sm font-bold', lead.status === 'won' ? 'text-emerald-600' : 'text-slate-400')}>
                              ₹{(Number(lead.quotation_amount) || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons for closed leads — Create Task + Convert to Client still available */}
                        {canEditLead(lead) && (
                          <div className="pt-1.5 border-t border-slate-100">
                            {renderLeadActionButtons(lead, true)}
                          </div>
                        )}
                      </div>
                    </DashboardStripCard>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
        </DragDropContext>
      )}

      {/* ══════════ KANBAN VIEW ══════════ */}
      {viewMode === 'kanban' && (
        <DragDropContext onDragEnd={onKanbanDragEnd}>
        <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" variants={containerVariants}>
          {KANBAN_COLS.map(sid => {
            const stage = stageOf(sid);
            const colLeads = getKanbanColOrderedLeads(sid);
            return (
              <motion.div key={sid} variants={itemVariants} className="flex flex-col gap-2">
                <div className={cn('rounded-2xl border px-3 py-2 flex items-center justify-between', stage.badge)}>
                  <span className="text-xs font-bold">{stage.label}</span>
                  <span className="text-xs font-bold bg-white/80 px-1.5 py-0.5 rounded-full">{colLeads.length}</span>
                </div>
                <Droppable droppableId={sid}>
                  {(colProvided, colSnapshot) => (
                    <div ref={colProvided.innerRef} {...colProvided.droppableProps}
                      className={`space-y-2 min-h-[80px] rounded-2xl p-1 transition-colors ${colSnapshot.isDraggingOver ? 'bg-blue-50/60 ring-2 ring-blue-200' : ''}`}>
                      {colLeads.map((lead, kIdx) => (
                        <Draggable key={String(lead.id)} draggableId={String(lead.id)} index={kIdx}>
                          {(kDragProvided, kDragSnapshot) => (
                            <div ref={kDragProvided.innerRef} {...kDragProvided.draggableProps}
                              className={`relative bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-all ${kDragSnapshot.isDragging ? 'shadow-2xl ring-2 ring-blue-400/30 rotate-1' : ''}`}>
                              <div className={cn('absolute left-0 top-0 h-full w-[5px]', stage.stripe)} />
                              <div className="pl-4 pr-3 py-3 space-y-2">
                                <div className="flex items-center gap-1 -mt-1 mb-0.5">
                                  <span {...kDragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 transition-colors" title="Drag to move stage">
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">{lead.company_name}</p>
                                {lead.contact_name && <p className="text-[11px] text-slate-500 flex items-center gap-1"><User className="h-3 w-3" />{lead.contact_name}</p>}
                                {lead.assigned_to  && <p className="text-[11px] text-blue-600 font-medium flex items-center gap-1"><UserCheck className="h-3 w-3" />{userNameById(lead.assigned_to)}</p>}
                                {(lead.services || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {lead.services.slice(0, 2).map(s => <ServiceBadge key={s} value={s} size="xs" />)}
                                    {lead.services.length > 2 && <span className="text-[10px] text-slate-400">+{lead.services.length - 2}</span>}
                                  </div>
                                )}
                                {lead.quotation_amount && <p className="text-xs font-bold text-slate-700">₹{Number(lead.quotation_amount).toLocaleString()}</p>}
                                {canEditLead(lead) && (
                                  <div className="flex gap-1 pt-1 border-t border-slate-100 flex-wrap">
                                    <button onClick={() => openEdit(lead)}
                                      className="flex-1 h-6 text-[11px] font-medium rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all active:scale-95">
                                      Edit
                                    </button>
                                    <button onClick={() => setTaskLead(lead)}
                                      className="flex-1 h-6 text-[11px] font-semibold rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-100 hover:shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1">
                                      <ListTodo className="h-3 w-3" />Task
                                    </button>
                                    {!lead.converted_client_id && (
                                      <button onClick={() => setClientConvLead(lead)}
                                        className="flex-1 h-6 text-[11px] font-semibold rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1">
                                        <Zap className="h-3 w-3" />Client
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {colProvided.placeholder}
                      {colLeads.length === 0 && !colSnapshot.isDraggingOver && (
                        <div className="text-center py-8 text-slate-200">
                          <Circle className="h-7 w-7 mx-auto mb-1 opacity-50" />
                          <p className="text-[11px]">Empty</p>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </motion.div>
            );
          })}
        </motion.div>
        </DragDropContext>
      )}

      {/* ── Lead Form Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>
              {editingLead ? 'Edit Lead' : 'New Lead'}
            </DialogTitle>
            <DialogDescription>
              {editingLead ? 'Update lead details.' : 'Fill in the details to add a new lead.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <SectionLabel icon={Building2}>Company Info</SectionLabel>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Company Name <span className="text-red-500">*</span></Label>
              <Input value={form.company_name} onChange={e => handleChange('company_name', e.target.value)}
                placeholder="e.g. Sharma & Associates"
                className={cn('h-10 rounded-2xl', errors.company_name && 'border-red-400')} />
              {errors.company_name && <p className="text-xs text-red-500">{errors.company_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={form.contact_name} onChange={e => handleChange('contact_name', e.target.value)} placeholder="Full name" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="contact@company.com" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="+91 98765 43210" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Quotation Amount (₹)</Label>
              <Input type="number" value={form.quotation_amount} onChange={e => handleChange('quotation_amount', e.target.value)} placeholder="0" className="h-10 rounded-2xl" />
            </div>

            <SectionLabel icon={Tag}>Services</SectionLabel>
            <div className="md:col-span-2">
              <ServiceSelector selected={form.services} onChange={v => handleChange('services', v)} extra={availableServices} />
            </div>

            <SectionLabel icon={ArrowRight}>Source & Assignment</SectionLabel>
            <div className="space-y-1.5">
              <Label>Lead Source</Label>
              <Select value={form.source || 'direct'} onValueChange={v => handleChange('source', v)}>
                <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Referred By</Label>
              <Input value={form.referred_by} onChange={e => handleChange('referred_by', e.target.value)} placeholder="Name of referrer" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-slate-400" />Assign To</Label>
              <Select value={form.assigned_to || 'unassigned'} onValueChange={v => handleChange('assigned_to', v === 'unassigned' ? '' : v)}>
                <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">— Unassigned —</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}{u.id === user?.id ? ' (you)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingLead && (
              <div className="space-y-1.5">
                <Label>Pipeline Stage</Label>
                <Select value={form.status} onValueChange={v => handleChange('status', v)}>
                  <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.filter(s => s.id !== 'won').map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400">Use Convert button to mark as Won.</p>
              </div>
            )}

            <SectionLabel icon={Calendar}>Dates</SectionLabel>
            <div className="space-y-1.5">
              <Label>Next Follow-up</Label>
              <Input type="datetime-local" value={form.next_follow_up}
                onChange={e => handleChange('next_follow_up', e.target.value)} className="h-10 rounded-2xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Meeting</Label>
              <Input type="datetime-local" value={form.date_of_meeting}
                onChange={e => handleChange('date_of_meeting', e.target.value)} className="h-10 rounded-2xl text-sm" />
            </div>

            <SectionLabel icon={MessageSquare}>Notes</SectionLabel>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)}
                placeholder="Notes, requirements, context…" rows={3} className="resize-none rounded-2xl text-sm" />
              <p className="text-[10px] text-slate-400">
                Keywords like "interested", "proceed" raise · "no", "decline" lower closure probability.
              </p>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t border-slate-200 gap-2">
            <Button variant="outline" onClick={closeDialog} className="rounded-2xl">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}
              className="rounded-2xl bg-blue-700 hover:bg-blue-800 text-white min-w-[130px] active:scale-95">
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                : editingLead ? 'Update Lead' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lead Task Dialog — Create task from any lead at any stage ── */}
      {taskLead && (
        <LeadTaskDialog
          lead={taskLead}
          open={!!taskLead}
          onClose={() => setTaskLead(null)}
          allUsers={allUsers}
          currentUser={user}
        />
      )}

      {/* ── Client Conversion Dialog ── */}
      {clientConvLead && (
        <ClientConversionDialog
          lead={clientConvLead}
          open={!!clientConvLead}
          onClose={() => { if (!clientConverting) setClientConvLead(null); }}
          onConvertNow={handleClientConvertNow}
          onConvertLater={handleClientConvertLater}
          converting={clientConverting}
          allUsers={allUsers}
          currentUser={user}
          availableServices={availableServices}
        />
      )}
    </motion.div>
  );
}
