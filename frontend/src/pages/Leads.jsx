import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Building2, User, Phone,
  Mail, Calendar, List, LayoutGrid, Check, TrendingUp,
  AlertTriangle, Clock, Zap, CheckCircle2, Loader2,
  Circle, X, ArrowRight, IndianRupee, FileText,
  UserCheck, Users, Tag, MessageSquare, Target,
  ChevronRight, Sparkles, ShieldCheck, Timer, Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─── CSS for ripple + pulse animations (injected once) ───────────────────────
const INTERACTION_STYLES = `
  @keyframes ripple {
    0%   { transform: scale(0); opacity: 0.6; }
    100% { transform: scale(4); opacity: 0; }
  }
  @keyframes stageActivePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5); }
    50%       { box-shadow: 0 0 0 4px rgba(59,130,246,0); }
  }
  @keyframes wonGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
    50%       { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
  }
  @keyframes lostShake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-2px); }
    40%       { transform: translateX(2px); }
    60%       { transform: translateX(-2px); }
    80%       { transform: translateX(2px); }
  }
  @keyframes progressFill {
    from { width: 0%; }
    to   { width: var(--target-width); }
  }
  .stage-btn-active {
    animation: stageActivePulse 1.5s ease-in-out 1;
  }
  .ripple-container {
    position: relative;
    overflow: hidden;
  }
  .ripple-container .ripple-effect {
    position: absolute;
    border-radius: 50%;
    transform: scale(0);
    background: rgba(255,255,255,0.4);
    animation: ripple 0.5s linear;
    pointer-events: none;
  }
  .won-glow { animation: wonGlow 1s ease-out 1; }
  .lost-shake { animation: lostShake 0.4s ease-out 1; }
`;

// Inject styles once
if (typeof document !== 'undefined' && !document.getElementById('leads-interaction-styles')) {
  const style = document.createElement('style');
  style.id = 'leads-interaction-styles';
  style.textContent = INTERACTION_STYLES;
  document.head.appendChild(style);
}

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const PIPELINE_STAGES = [
  { id: 'new',         label: 'New',         stripe: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200',           activeBg: 'bg-sky-500',     activeText: 'text-white', hoverBg: 'hover:bg-sky-50 hover:border-sky-400 hover:text-sky-700'   },
  { id: 'contacted',   label: 'Contacted',   stripe: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',   activeBg: 'bg-indigo-500',  activeText: 'text-white', hoverBg: 'hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700' },
  { id: 'meeting',     label: 'Meeting',     stripe: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 border-violet-200',   activeBg: 'bg-violet-500',  activeText: 'text-white', hoverBg: 'hover:bg-violet-50 hover:border-violet-400 hover:text-violet-700' },
  { id: 'proposal',    label: 'Proposal',    stripe: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       activeBg: 'bg-amber-500',   activeText: 'text-white', hoverBg: 'hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700'   },
  { id: 'negotiation', label: 'Negotiation', stripe: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200',   activeBg: 'bg-orange-500',  activeText: 'text-white', hoverBg: 'hover:bg-orange-50 hover:border-orange-400 hover:text-orange-700' },
  { id: 'on_hold',     label: 'On Hold',     stripe: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',       activeBg: 'bg-slate-400',   activeText: 'text-white', hoverBg: 'hover:bg-slate-100 hover:border-slate-400 hover:text-slate-700'   },
  { id: 'won',         label: 'Won',         stripe: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', activeBg: 'bg-emerald-600', activeText: 'text-white', hoverBg: 'hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700' },
  { id: 'lost',        label: 'Lost',        stripe: 'bg-red-500',     badge: 'bg-red-50 text-red-600 border-red-200',             activeBg: 'bg-red-500',     activeText: 'text-white', hoverBg: 'hover:bg-red-50 hover:border-red-400 hover:text-red-600'           },
];

const ACTIVE_STAGES   = ['new','contacted','meeting','proposal','negotiation','on_hold'];
const KANBAN_COLS     = ACTIVE_STAGES;

const LEAD_SOURCES = [
  { label: 'Direct',       value: 'direct'       },
  { label: 'Website',      value: 'website'      },
  { label: 'Referral',     value: 'referral'     },
  { label: 'Social Media', value: 'social_media' },
  { label: 'Event',        value: 'event'        },
];

const LEAD_SERVICES = [
  { value: 'GST',          label: 'GST',          color: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500'    },
  { value: 'Income Tax',   label: 'Income Tax',   color: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500'  },
  { value: 'Accounts',     label: 'Accounts',     color: 'bg-teal-50 text-teal-700 border-teal-200',          dot: 'bg-teal-500'    },
  { value: 'TDS',          label: 'TDS',          color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500'   },
  { value: 'ROC',          label: 'ROC',          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500'  },
  { value: 'Trademark',    label: 'Trademark',    color: 'bg-pink-50 text-pink-700 border-pink-200',          dot: 'bg-pink-500'    },
  { value: 'MSME',         label: 'MSME',         color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500'  },
  { value: 'FEMA',         label: 'FEMA',         color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500'     },
  { value: 'DSC',          label: 'DSC',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'Audit',        label: 'Audit',        color: 'bg-cyan-50 text-cyan-700 border-cyan-200',          dot: 'bg-cyan-500'    },
  { value: 'Payroll',      label: 'Payroll',      color: 'bg-lime-50 text-lime-700 border-lime-200',          dot: 'bg-lime-500'    },
  { value: 'PF/ESIC',      label: 'PF/ESIC',      color: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500'    },
  { value: 'Other',        label: 'Other',        color: 'bg-slate-50 text-slate-600 border-slate-200',       dot: 'bg-slate-400'   },
];

const serviceStyle = (val) =>
  LEAD_SERVICES.find(s => s.value === val) || LEAD_SERVICES[LEAD_SERVICES.length - 1];

const TASK_CATEGORIES = [
  { value: 'gst',          label: 'GST'          },
  { value: 'income_tax',   label: 'Income Tax'   },
  { value: 'accounts',     label: 'Accounts'     },
  { value: 'tds',          label: 'TDS'          },
  { value: 'roc',          label: 'ROC'          },
  { value: 'trademark',    label: 'Trademark'    },
  { value: 'msme_smadhan', label: 'MSME'         },
  { value: 'fema',         label: 'FEMA'         },
  { value: 'dsc',          label: 'DSC'          },
  { value: 'other',        label: 'Other'        },
];

const CLIENT_TYPES = [
  { value: 'proprietorship', label: 'Proprietorship'  },
  { value: 'partnership',    label: 'Partnership'     },
  { value: 'pvt_ltd',        label: 'Private Limited' },
  { value: 'llp',            label: 'LLP'             },
  { value: 'trust',          label: 'Trust'           },
  { value: 'other',          label: 'Other'           },
];

const stageOf   = (id) => PIPELINE_STAGES.find(s => s.id === id) || PIPELINE_STAGES[0];
const isOverdue = (lead) =>
  lead.next_follow_up &&
  new Date(lead.next_follow_up) < new Date() &&
  !['won','lost'].includes(lead.status);

// ─── Ripple helper ────────────────────────────────────────────────────────────
function addRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement('span');
  const diameter = Math.max(btn.clientWidth, btn.clientHeight);
  const radius = diameter / 2;
  const rect = btn.getBoundingClientRect();
  circle.style.cssText = `
    width:${diameter}px; height:${diameter}px;
    left:${e.clientX - rect.left - radius}px;
    top:${e.clientY - rect.top - radius}px;
  `;
  circle.classList.add('ripple-effect');
  const existing = btn.querySelector('.ripple-effect');
  if (existing) existing.remove();
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
}

// ─── Stage Quick-Button with full interaction feedback ────────────────────────
const StageButton = ({ stageId, isActive, disabled, onClick, children }) => {
  const [clicked, setClicked] = useState(false);
  const stage = stageOf(stageId);

  const handleClick = (e) => {
    if (disabled || isActive) return;
    addRipple(e);
    setClicked(true);
    setTimeout(() => setClicked(false), 600);
    onClick();
  };

  return (
    <button
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'ripple-container h-6 px-2.5 text-[11px] font-semibold rounded-xl border transition-all duration-200 select-none',
        isActive
          ? cn(stage.activeBg, stage.activeText, 'border-transparent shadow-sm scale-[1.04]', 'stage-btn-active')
          : cn('bg-white text-slate-500 border-slate-200', stage.hoverBg, 'hover:scale-[1.03] hover:shadow-sm active:scale-95'),
        clicked && !isActive && 'scale-95',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 mr-1 mb-0.5" />}
      {children}
    </button>
  );
};

// ─── Progress Bar with animated fill ─────────────────────────────────────────
const StageProgressBar = ({ currentStatus, stages, canEdit, onStageClick }) => {
  const currentIdx = stages.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-[3px]">
      {stages.map((sid, i) => {
        const s = stageOf(sid);
        const filled = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <button
            key={sid}
            onClick={() => canEdit && onStageClick(sid)}
            title={s.label}
            className={cn(
              'flex-1 rounded-full transition-all duration-300 ease-out',
              isCurrent ? 'h-2' : 'h-1.5',
              filled
                ? cn(s.stripe, isCurrent && 'ring-2 ring-offset-1 ring-current opacity-90')
                : 'bg-slate-200',
              canEdit ? 'cursor-pointer hover:opacity-80 hover:h-2' : 'cursor-default',
            )}
          />
        );
      })}
    </div>
  );
};

// ─── Strip Card ───────────────────────────────────────────────────────────────
const DashboardStripCard = ({ stripeColor, isCompleted = false, className = '', children }) => (
  <div className={cn(
    'relative rounded-2xl border transition-all duration-300 ease-in-out overflow-hidden group',
    isCompleted
      ? 'bg-slate-50 border-slate-200 opacity-75 scale-[0.985]'
      : 'bg-white/90 backdrop-blur-sm border-slate-200 hover:shadow-md hover:-translate-y-[1px]',
    className,
  )}>
    <div className={cn('absolute left-0 top-0 h-full w-[6px] rounded-l-2xl transition-all duration-200 group-hover:w-[8px]', stripeColor)} />
    <div className={cn('pl-6 pr-6 transition-all duration-300', isCompleted ? 'py-2' : 'py-5')}>
      {children}
    </div>
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, onClick, active }) => (
  <Card
    onClick={onClick}
    className={cn(
      'border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer rounded-2xl',
      'active:scale-95 select-none',
      active && 'ring-2 ring-blue-300 border-blue-300 shadow-md scale-[1.02]',
    )}
  >
    <CardContent className="p-4 text-center">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={cn('text-3xl font-bold mt-1 transition-all duration-200', color)}>{value}</p>
    </CardContent>
  </Card>
);

// ─── Service Badge ─────────────────────────────────────────────────────────────
const ServiceBadge = ({ value, size = 'sm' }) => {
  const s = serviceStyle(value);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-lg border font-semibold',
      s.color,
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
    )}>
      <span className={cn('rounded-full flex-shrink-0', s.dot, size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      {value}
    </span>
  );
};

// ─── Service Selector ─────────────────────────────────────────────────────────
const ServiceSelector = ({ selected = [], onChange, availableFromServer = [] }) => {
  const serverExtras = availableFromServer
    .filter(s => !LEAD_SERVICES.find(ls => ls.value.toLowerCase() === s.toLowerCase()))
    .map(s => ({ value: s, color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' }));
  const allServices = [...LEAD_SERVICES, ...serverExtras];

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 bg-blue-50 rounded-2xl border border-blue-100">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider w-full mb-0.5">Selected Services</span>
          {selected.map(val => (
            <button key={val} type="button" onClick={() => toggle(val)}
              className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-lg border text-[11px] font-semibold bg-white border-blue-200 text-blue-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors group active:scale-95">
              {val}<X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {allServices.map(svc => {
          const isSelected = selected.includes(svc.value);
          return (
            <button key={svc.value} type="button" onClick={() => toggle(svc.value)}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-2xl text-xs font-semibold border transition-all duration-150 active:scale-95',
                isSelected
                  ? cn(svc.color, 'shadow-sm ring-1 ring-offset-1', svc.color.split(' ')[2])
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50',
              )}>
              {isSelected && <Check className="h-3 w-3 flex-shrink-0" />}
              {svc.label || svc.value}
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-[11px] text-slate-400 italic">No services selected — click any service above to add it.</p>
      )}
    </div>
  );
};

// ─── Client Conversion Dialog ─────────────────────────────────────────────────
function ClientConversionDialog({ lead, open, onClose, onConvertNow, onConvertLater, converting }) {
  const [hovered, setHovered] = useState(null);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Convert to Client?
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 leading-relaxed">
            <strong>{lead?.company_name}</strong> has been marked as <strong className="text-emerald-600">Won</strong>.
            Would you like to convert this lead into a client right now, or do it later?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Convert Now */}
          <button
            onClick={onConvertNow}
            disabled={converting}
            onMouseEnter={() => setHovered('now')}
            onMouseLeave={() => setHovered(null)}
            className={cn(
              'w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 group ripple-container',
              hovered === 'now'
                ? 'border-emerald-400 bg-emerald-100 shadow-md scale-[1.01]'
                : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400',
              converting && 'opacity-60 cursor-not-allowed',
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200',
                hovered === 'now' ? 'bg-emerald-300 scale-110' : 'bg-emerald-100 group-hover:bg-emerald-200',
              )}>
                {converting
                  ? <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                  : <Building2 className="h-4 w-4 text-emerald-600" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Convert to Client Now</p>
                <p className="text-xs text-emerald-600 mt-0.5 leading-relaxed">
                  Creates a client profile, marks this lead as Won, and triggers an onboarding task automatically.
                </p>
              </div>
              <ChevronRight className={cn(
                'h-4 w-4 ml-auto flex-shrink-0 mt-0.5 transition-all duration-200',
                hovered === 'now' ? 'text-emerald-600 translate-x-1' : 'text-emerald-400',
              )} />
            </div>
          </button>

          {/* Convert Later — FIXED: uses /convert endpoint via onConvertLater */}
          <button
            onClick={onConvertLater}
            disabled={converting}
            onMouseEnter={() => setHovered('later')}
            onMouseLeave={() => setHovered(null)}
            className={cn(
              'w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 group ripple-container',
              hovered === 'later'
                ? 'border-slate-400 bg-slate-100 shadow-md scale-[1.01]'
                : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300',
              converting && 'opacity-60 cursor-not-allowed',
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200',
                hovered === 'later' ? 'bg-slate-300 scale-110' : 'bg-slate-100 group-hover:bg-slate-200',
              )}>
                <Timer className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Mark as Won — Convert Later</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Marks the lead as Won and creates a client profile. You can manage it from the Clients page anytime.
                </p>
              </div>
              <ChevronRight className={cn(
                'h-4 w-4 ml-auto flex-shrink-0 mt-0.5 transition-all duration-200',
                hovered === 'later' ? 'text-slate-600 translate-x-1' : 'text-slate-300',
              )} />
            </div>
          </button>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={onClose} disabled={converting} className="rounded-2xl h-9 text-slate-500 hover:bg-slate-100">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Convert to Task Dialog ───────────────────────────────────────────────────
function ConvertToTaskDialog({ lead, open, onClose, onSuccess }) {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', priority: 'high',
    category: 'other', due_date: '', assigned_to: '',
  });
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) api.get('/users').then(r => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (lead) {
      setForm(f => ({
        ...f,
        title: `Client Onboarding: ${lead.company_name}`,
        assigned_to: lead.assigned_to || currentUser?.id || '',
        description: [
          `Lead converted to client from pipeline.`,
          `Contact:    ${lead.contact_name  || '—'}`,
          `Phone:      ${lead.phone         || '—'}`,
          `Email:      ${lead.email         || '—'}`,
          `Services:   ${(lead.services||[]).join(', ') || '—'}`,
          `Value:      ₹${(Number(lead.quotation_amount)||0).toLocaleString()}`,
          `Source:     ${lead.source?.replace('_',' ') || '—'}`,
          `Referred By:${lead.referred_by   || '—'}`,
          `Notes:      ${lead.notes         || '—'}`,
        ].join('\n'),
      }));
    }
  }, [lead, currentUser]);

  const handleConvert = async () => {
    setLoading(true);
    try {
      await api.post(`/leads/${lead.id}/convert`);
      await api.post('/tasks', {
        title: form.title, description: form.description,
        priority: form.priority, category: form.category,
        status: 'pending',
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        assigned_to: form.assigned_to && form.assigned_to !== 'unassigned' ? form.assigned_to : null,
        is_recurring: false, sub_assignees: [],
      });
      toast.success(`"${lead.company_name}" converted to client & task created!`);
      onSuccess(); onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Conversion failed');
    } finally { setLoading(false); }
  };

  const assignedUser = users.find(u => u.id === form.assigned_to);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Zap className="h-5 w-5 text-emerald-500" /> Convert Lead → Client + Task
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Marks <strong>{lead?.company_name}</strong> as <strong>Won</strong>, creates a client profile, and a follow-up task.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{lead?.company_name}</p>
              <p className="text-xs text-slate-500">
                ₹{(Number(lead?.quotation_amount)||0).toLocaleString()} · {lead?.contact_name || 'No contact'}
                {lead?.referred_by && <span className="text-emerald-600"> · Ref: {lead.referred_by}</span>}
              </p>
              {(lead?.services||[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {lead.services.map(s => <ServiceBadge key={s} value={s} />)}
                </div>
              )}
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white flex-shrink-0">→ WON</span>
          </div>

          {assignedUser && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2">
              <UserCheck className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                This lead is assigned to <strong>{assignedUser.full_name}</strong>
                {assignedUser.id === currentUser?.id && <span className="text-blue-500"> (you)</span>}
              </p>
            </div>
          )}

          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-0.5">Follow-up Task Details</p>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Task Title</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-9 rounded-2xl text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" />Assign Task To</Label>
            <Select value={form.assigned_to || 'unassigned'} onValueChange={v => setForm(f => ({ ...f, assigned_to: v === 'unassigned' ? '' : v }))}>
              <SelectTrigger className="h-9 rounded-2xl text-sm"><SelectValue placeholder="Select a team member…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">— Unassigned —</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex items-center gap-2">{u.full_name}{u.id === currentUser?.id && <span className="text-[10px] text-slate-400">(you)</span>}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-9 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['low','medium','high','critical'].map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Due Date</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-9 rounded-2xl text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Task Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={5} className="resize-none text-sm rounded-2xl" />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-2xl h-9">Cancel</Button>
          <Button onClick={handleConvert} disabled={loading || !form.title.trim()} className="rounded-2xl h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 min-w-[180px]">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Converting…</> : <><CheckCircle2 className="h-4 w-4" />Convert & Create Task</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section Label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ icon: Icon, children }) => (
  <div className="md:col-span-2 flex items-center gap-2 pt-2">
    <Icon className="h-3.5 w-3.5 text-slate-400" />
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</p>
    <div className="flex-1 h-px bg-slate-100" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function LeadsPage() {
  const { user } = useAuth();

  const isAdmin       = user?.role === 'admin';
  const perms         = user?.permissions || {};
  const canDeleteLead = isAdmin || !!perms.can_manage_users;
  const canViewAll    = isAdmin || !!perms.can_view_all_leads;
  const canEditLead   = (lead) =>
    isAdmin ||
    (lead?.assigned_to && lead.assigned_to === user?.id) ||
    (lead?.created_by  && lead.created_by  === user?.id);

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
  const [convertingLead,    setConvertingLead]    = useState(null);
  const [clientConvLead,    setClientConvLead]    = useState(null);
  const [clientConverting,  setClientConverting]  = useState(false);
  const [errors,            setErrors]            = useState({});
  const [activeFilters,     setActiveFilters]     = useState([]);
  // Track which lead's stage was just changed for visual feedback
  const [recentlyChanged,   setRecentlyChanged]   = useState({});

  const emptyForm = {
    company_name: '', contact_name: null, email: null, phone: null,
    quotation_amount: null, services: [], source: 'direct', referred_by: null,
    notes: null, assigned_to: null, status: 'new', next_follow_up: null,
    date_of_meeting: null, closure_probability: null,
  };
  const [formData, setFormData] = useState(emptyForm);

  const fetchLeads = async () => {
    try {
      const res = await api.get('/leads/');
      setLeads(res.data);
    } catch { toast.error('Failed to fetch leads'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLeads();
    api.get('/leads/meta/services').then(r => {
      const raw = r.data;
      const list = Array.isArray(raw) ? raw : (raw?.services || []);
      setAvailableServices(list);
    }).catch(() => {});
    api.get('/users').then(r => setAllUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const mergedServices = useMemo(() => {
    const extras = availableServices.filter(s => !LEAD_SERVICES.find(ls => ls.value.toLowerCase() === s.toLowerCase()));
    return [...LEAD_SERVICES.map(s => s.value), ...extras];
  }, [availableServices]);

  const stats = useMemo(() => ({
    total:     leads.length,
    active:    leads.filter(l => ACTIVE_STAGES.includes(l.status)).length,
    won:       leads.filter(l => l.status === 'won').length,
    lost:      leads.filter(l => l.status === 'lost').length,
    overdue:   leads.filter(isOverdue).length,
    wonValue:  leads.filter(l => l.status === 'won').reduce((s,l) => s + (Number(l.quotation_amount)||0), 0),
    pipeValue: leads.filter(l => ACTIVE_STAGES.includes(l.status)).reduce((s,l) => s + (Number(l.quotation_amount)||0), 0),
  }), [leads]);

  const serviceTabCounts = useMemo(() => {
    const counts = { all: leads.length };
    mergedServices.forEach(svc => { counts[svc] = leads.filter(l => (l.services||[]).includes(svc)).length; });
    return counts;
  }, [leads, mergedServices]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return leads
      .filter(l => !q || l.company_name?.toLowerCase().includes(q) || l.contact_name?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.referred_by?.toLowerCase().includes(q))
      .filter(l => statusFilter === 'all' || l.status === statusFilter)
      .filter(l => serviceFilter === 'all' || (l.services||[]).includes(serviceFilter));
  }, [leads, searchQuery, statusFilter, serviceFilter]);

  const resetForm = () => { setFormData(emptyForm); setErrors({}); };
  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value === '' ? null : value }));

  const handleEdit = (lead) => {
    setEditingLead(lead);
    setFormData({
      company_name: lead.company_name || '', contact_name: lead.contact_name || null,
      email: lead.email || null, phone: lead.phone || null,
      quotation_amount: lead.quotation_amount || null,
      services: Array.isArray(lead.services) ? lead.services : [],
      source: lead.source || 'direct', referred_by: lead.referred_by || null,
      notes: lead.notes || null, assigned_to: lead.assigned_to || null,
      status: lead.status || 'new', next_follow_up: lead.next_follow_up || null,
      date_of_meeting: lead.date_of_meeting || null,
      closure_probability: lead.closure_probability ?? null,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingLead(null); resetForm(); };

  const handleSubmit = async () => {
    if (!formData.company_name?.trim()) { setErrors({ company_name: 'Company name is required' }); return; }
    setSubmitting(true);
    const payload = {
      company_name: formData.company_name?.trim() || '',
      contact_name: formData.contact_name || null, email: formData.email || null,
      phone: formData.phone || null,
      quotation_amount: formData.quotation_amount ? Number(formData.quotation_amount) : null,
      services: Array.isArray(formData.services) ? formData.services : [],
      source: formData.source || 'direct', referred_by: formData.referred_by || null,
      notes: formData.notes || null,
      assigned_to: formData.assigned_to && formData.assigned_to !== 'unassigned' ? formData.assigned_to : null,
      status: formData.status || 'new', next_follow_up: formData.next_follow_up || null,
      date_of_meeting: formData.date_of_meeting || null,
      closure_probability: formData.closure_probability != null ? Number(formData.closure_probability) : null,
    };
    try {
      if (editingLead) { await api.patch(`/leads/${editingLead.id}`, payload); toast.success('Lead updated!'); }
      else             { await api.post('/leads/', payload);                   toast.success('Lead created!'); }
      closeDialog(); fetchLeads();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save lead'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (lead) => {
    if (!window.confirm(`Delete "${lead.company_name}"? This cannot be undone.`)) return;
    try { await api.delete(`/leads/${lead.id}`); toast.success('Lead deleted'); fetchLeads(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Failed to delete'); }
  };

  const handleQuickStage = async (lead, newStatus) => {
    if (newStatus === 'won') { setClientConvLead(lead); return; }
    if (newStatus === 'lost' && !window.confirm(`Mark "${lead.company_name}" as Lost?`)) return;
    try {
      // Optimistic update for instant visual feedback
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
      setRecentlyChanged(prev => ({ ...prev, [lead.id]: newStatus }));
      setTimeout(() => setRecentlyChanged(prev => { const n = {...prev}; delete n[lead.id]; return n; }), 1500);
      await api.patch(`/leads/${lead.id}`, { status: newStatus });
      fetchLeads();
    } catch (err) {
      toast.error('Failed to update stage');
      fetchLeads(); // revert on error
    }
  };

  // ── FIX: Convert Later now calls /convert endpoint (backend blocks direct PATCH to won) ──
  const handleClientConvertNow = async () => {
    if (!clientConvLead) return;
    setClientConverting(true);
    try {
      await api.post(`/leads/${clientConvLead.id}/convert`);
      toast.success(`"${clientConvLead.company_name}" converted to client!`);
      setClientConvLead(null); fetchLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Conversion failed');
    } finally { setClientConverting(false); }
  };

  // ── FIXED: was trying PATCH status=won which backend blocks ──────────────────
  const handleClientConvertLater = async () => {
    if (!clientConvLead) return;
    setClientConverting(true);
    try {
      // Must use /convert — backend blocks PATCH to status=won without converted_client_id
      await api.post(`/leads/${clientConvLead.id}/convert`);
      toast.success(`"${clientConvLead.company_name}" marked as Won. Client profile created — manage from Clients page.`);
      setClientConvLead(null); fetchLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to mark as won');
    } finally { setClientConverting(false); }
  };

  useEffect(() => {
    const pills = [];
    if (searchQuery)            pills.push({ key: 'search',  label: `Search: ${searchQuery}` });
    if (statusFilter !== 'all') pills.push({ key: 'status',  label: `Stage: ${stageOf(statusFilter).label}` });
    if (serviceFilter !== 'all') pills.push({ key: 'service', label: `Service: ${serviceFilter}` });
    setActiveFilters(pills);
  }, [searchQuery, statusFilter, serviceFilter]);

  const removeFilter = (key) => {
    if (key === 'search')  setSearchQuery('');
    if (key === 'status')  setStatusFilter('all');
    if (key === 'service') setServiceFilter('all');
  };

  // Named alias kept for kanban + list usage (matches original API)
  const handleConvertButtonClick = (lead) => setConvertingLead(lead);

  const userNameById = (id) => { const u = allUsers.find(u => u.id === id); return u ? u.full_name : id || '—'; };

  if (loading) return (
    <div className="space-y-4 p-6">
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
    </div>
  );

  return (
    <motion.div className="space-y-4 bg-slate-50 p-6 rounded-3xl" variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600" />
          <CardContent className="p-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.deepBlue }}>Lead Pipeline</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {stats.active} active ·&nbsp;
                <span className="text-emerald-600 font-medium">{stats.won} won</span>
                {stats.overdue > 0 && <span className="text-red-500 font-medium"> · {stats.overdue} overdue</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-slate-100 p-1 rounded-2xl shadow-sm">
                <Button variant="ghost" size="sm"
                  className={cn('rounded-xl font-medium transition-all duration-200', viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700')}
                  onClick={() => setViewMode('list')}>
                  <List className="h-4 w-4 mr-1" /> List
                </Button>
                <Button variant="ghost" size="sm"
                  className={cn('rounded-xl font-medium transition-all duration-200', viewMode === 'kanban' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700')}
                  onClick={() => setViewMode('kanban')}>
                  <LayoutGrid className="h-4 w-4 mr-1" /> Board
                </Button>
              </div>
              <Button size="sm"
                className="h-9 px-4 text-sm font-medium rounded-2xl shadow-sm hover:shadow-md bg-blue-700 hover:bg-blue-800 text-white active:scale-95 transition-all"
                onClick={() => { resetForm(); setEditingLead(null); setDialogOpen(true); }}>
                <Plus className="mr-2 h-5 w-5" /> New Lead
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total"   value={stats.total}   color="text-slate-800"   onClick={() => setStatusFilter('all')}  active={statusFilter === 'all'} />
        <StatCard label="Active"  value={stats.active}  color="text-blue-600"    onClick={() => setStatusFilter('all')}  active={false} />
        <StatCard label="Won"     value={stats.won}     color="text-emerald-600" onClick={() => setStatusFilter('won')}  active={statusFilter === 'won'} />
        <StatCard label="Lost"    value={stats.lost}    color="text-red-600"     onClick={() => setStatusFilter('lost')} active={statusFilter === 'lost'} />
        <StatCard label="Overdue" value={stats.overdue} color="text-orange-600"  onClick={() => setStatusFilter('all')}  active={false} />
      </motion.div>

      {/* ── Revenue ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border border-emerald-200 bg-emerald-50 hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Won Revenue</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">₹{stats.wonValue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-indigo-200 bg-indigo-50 hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">Pipeline Value</p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">₹{stats.pipeValue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Service Tabs ── */}
      {mergedServices.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 rounded-2xl">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Filter by Service</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setServiceFilter('all')}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-7 px-3 rounded-xl text-xs font-semibold border transition-all duration-200 active:scale-95',
                    serviceFilter === 'all'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-sm scale-[1.02]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow-sm',
                  )}>
                  All
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', serviceFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                    {serviceTabCounts.all}
                  </span>
                </button>
                {mergedServices.filter(svc => serviceTabCounts[svc] > 0).map(svc => {
                  const s = serviceStyle(svc);
                  const isActive = serviceFilter === svc;
                  return (
                    <button key={svc} onClick={() => setServiceFilter(isActive ? 'all' : svc)}
                      className={cn(
                        'inline-flex items-center gap-1.5 h-7 px-3 rounded-xl text-xs font-semibold border transition-all duration-200 active:scale-95',
                        isActive
                          ? cn(s.color, 'shadow-sm scale-[1.02]')
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow-sm',
                      )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', s.dot)} />
                      {svc}
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', isActive ? 'bg-white/60' : 'bg-slate-100 text-slate-500')}>
                        {serviceTabCounts[svc]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Filters ── */}
      <motion.div variants={itemVariants} className="flex items-center justify-between gap-3 flex-wrap w-full">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search leads, referrals…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-white rounded-2xl" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white rounded-2xl text-sm"><SelectValue placeholder="All Stages" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {PIPELINE_STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-slate-400 ml-auto">
          {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
          {serviceFilter !== 'all' && <span className="text-blue-500 font-medium"> · {serviceFilter}</span>}
        </p>
      </motion.div>

      {activeFilters.length > 0 && (
        <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
          {activeFilters.map(pill => (
            <Badge key={pill.key} variant="secondary"
              className="pl-3 pr-2 py-1 text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 cursor-pointer rounded-full active:scale-95 transition-all"
              onClick={() => removeFilter(pill.key)}>
              {pill.label}<X className="h-3 w-3 ml-1 text-slate-400 hover:text-slate-600" />
            </Badge>
          ))}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── List View ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <motion.div className="space-y-3" variants={containerVariants}>
          {filteredLeads.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <Circle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No leads found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          )}

          {filteredLeads.filter(l => !['won','lost'].includes(l.status)).map((lead) => {
            const stage   = stageOf(lead.status);
            const overdue = isOverdue(lead);
            const prob    = lead.closure_probability;
            const justChanged = !!recentlyChanged[lead.id];

            return (
              <motion.div key={lead.id} variants={itemVariants}
                animate={justChanged ? { scale: [1, 1.01, 1] } : {}}
                transition={{ duration: 0.3 }}>
                <DashboardStripCard stripeColor={stage.stripe}>
                  <div className="flex flex-col gap-3">

                    {/* Row 1: Name + badge + actions */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        <span className="text-base font-semibold text-slate-900 leading-tight">{lead.company_name}</span>

                        {/* Stage badge — animated on change */}
                        <motion.span
                          key={lead.status}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold border', stage.badge)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', stage.stripe)} />
                          {stage.label}
                        </motion.span>

                        {prob != null && (
                          <span className={cn(
                            'hidden sm:inline-flex px-2.5 py-0.5 rounded-xl text-[11px] font-bold',
                            prob >= 70 ? 'bg-emerald-50 text-emerald-700' : prob >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600',
                          )}>
                            <Target className="h-3 w-3 mr-1" />{prob}% close
                          </span>
                        )}

                        {overdue && (
                          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">
                            <AlertTriangle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="hidden md:inline text-sm font-bold text-slate-700">₹{(Number(lead.quotation_amount)||0).toLocaleString()}</span>

                        {canEditLead(lead) && (
                          <Button size="sm" variant="outline"
                            className="h-7 px-3 text-xs font-semibold rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500 hover:shadow-sm gap-1 active:scale-95 transition-all"
                            onClick={() => handleConvertButtonClick(lead)}>
                            <Zap className="h-3.5 w-3.5" /> Convert
                          </Button>
                        )}

                        {canEditLead(lead) && (
                          <button onClick={() => handleEdit(lead)}
                            className="p-1.5 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all active:scale-90 hover:shadow-sm" title="Edit">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDeleteLead && (
                          <button onClick={() => handleDelete(lead)}
                            className="p-1.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all active:scale-90 hover:shadow-sm" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Contact details */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      {lead.contact_name  && <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{lead.contact_name}</span>}
                      {lead.phone         && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>}
                      {lead.email         && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{lead.email}</span>}
                      {lead.source        && <span className="flex items-center gap-1.5 capitalize"><ArrowRight className="h-3.5 w-3.5" />{lead.source.replace('_',' ')}</span>}
                      {lead.referred_by   && <span className="flex items-center gap-1.5 font-medium text-emerald-600"><User className="h-3.5 w-3.5" />Ref: {lead.referred_by}</span>}
                      {lead.assigned_to   && <span className="flex items-center gap-1.5 font-medium text-blue-600"><UserCheck className="h-3.5 w-3.5" />{userNameById(lead.assigned_to)}</span>}
                      {lead.next_follow_up && (
                        <span className={cn('flex items-center gap-1.5 font-medium', overdue ? 'text-red-500' : 'text-slate-500')}>
                          <Calendar className="h-3.5 w-3.5" />
                          Follow-up: {format(new Date(lead.next_follow_up), 'dd MMM yyyy')}
                          {overdue && <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">OVERDUE</span>}
                        </span>
                      )}
                      {lead.date_of_meeting && (
                        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Meeting: {format(new Date(lead.date_of_meeting), 'dd MMM yyyy')}</span>
                      )}
                      <span className="md:hidden flex items-center gap-1 font-bold text-slate-700">
                        <IndianRupee className="h-3.5 w-3.5" />{(Number(lead.quotation_amount)||0).toLocaleString()}
                      </span>
                    </div>

                    {/* Row 3: Services */}
                    {(lead.services||[]).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Tag className="h-3 w-3 text-slate-300 flex-shrink-0" />
                        {lead.services.map(s => <ServiceBadge key={s} value={s} />)}
                      </div>
                    )}

                    {/* Row 4: Stage bar + buttons */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      {/* Enhanced progress bar */}
                      <StageProgressBar
                        currentStatus={lead.status}
                        stages={ACTIVE_STAGES}
                        canEdit={canEditLead(lead)}
                        onStageClick={(sid) => canEditLead(lead) && handleQuickStage(lead, sid)}
                      />

                      {canEditLead(lead) && (
                        <div className="flex gap-1 flex-wrap">
                          {ACTIVE_STAGES.map(sid => (
                            <StageButton
                              key={sid}
                              stageId={sid}
                              isActive={lead.status === sid}
                              disabled={false}
                              onClick={() => handleQuickStage(lead, sid)}
                            >
                              {stageOf(sid).label}
                            </StageButton>
                          ))}

                          {/* Won button — special green glow on click */}
                          <button
                            onClick={(e) => { addRipple(e); e.currentTarget.classList.add('won-glow'); handleQuickStage(lead, 'won'); }}
                            className="ripple-container h-6 px-2.5 text-[11px] font-semibold rounded-xl border bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-md active:scale-95 transition-all duration-200">
                            Won ✓
                          </button>

                          {/* Lost button — red warning style */}
                          <button
                            onClick={(e) => { addRipple(e); e.currentTarget.classList.add('lost-shake'); handleQuickStage(lead, 'lost'); }}
                            className="ripple-container h-6 px-2.5 text-[11px] font-semibold rounded-xl border bg-white text-red-400 border-slate-200 hover:bg-red-500 hover:text-white hover:border-red-500 hover:shadow-md active:scale-95 transition-all duration-200">
                            Lost
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                </DashboardStripCard>
              </motion.div>
            );
          })}

          {/* Closed leads */}
          {filteredLeads.some(l => ['won','lost'].includes(l.status)) && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">Closed</p>
              {filteredLeads.filter(l => ['won','lost'].includes(l.status)).map(lead => {
                const stage = stageOf(lead.status);
                return (
                  <motion.div key={lead.id} variants={itemVariants}>
                    <DashboardStripCard stripeColor={stage.stripe} isCompleted>
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
                              <CheckCircle2 className="h-3 w-3" /> Client Created
                            </span>
                          )}
                          {lead.status === 'won' && !lead.converted_client_id && canEditLead(lead) && (
                            <button onClick={() => setClientConvLead(lead)}
                              className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-600 font-semibold border border-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-50 hover:border-amber-400 transition-all active:scale-95">
                              <Building2 className="h-3 w-3" /> Convert to Client
                            </button>
                          )}
                          {(lead.services||[]).slice(0,3).map(s => <ServiceBadge key={s} value={s} />)}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={cn('text-sm font-bold', lead.status === 'won' ? 'text-emerald-600' : 'text-slate-400')}>
                            ₹{(Number(lead.quotation_amount)||0).toLocaleString()}
                          </span>
                          {canDeleteLead && (
                            <button onClick={() => handleDelete(lead)}
                              className="p-1.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all active:scale-90">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </DashboardStripCard>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Kanban View ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'kanban' && (
        <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" variants={containerVariants}>
          {KANBAN_COLS.map(sid => {
            const stage    = stageOf(sid);
            const colLeads = filteredLeads.filter(l => l.status === sid);
            const colValue = colLeads.reduce((s,l) => s + (Number(l.quotation_amount)||0), 0);

            return (
              <motion.div key={sid} variants={itemVariants} className="flex flex-col gap-2">
                <div className={cn('rounded-2xl border px-3 py-2 flex items-center justify-between transition-all', stage.badge)}>
                  <span className="text-xs font-bold">{stage.label}</span>
                  <span className="text-xs font-bold bg-white/80 px-1.5 py-0.5 rounded-full">{colLeads.length}</span>
                </div>
                {colValue > 0 && <p className="text-[10px] text-slate-400 text-right pr-1">₹{colValue.toLocaleString()}</p>}

                <div className="space-y-2 min-h-[80px]">
                  <AnimatePresence>
                    {colLeads.map(lead => {
                      const overdue = isOverdue(lead);
                      const prob    = lead.closure_probability;
                      return (
                        <motion.div key={lead.id} layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="relative bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-all hover:-translate-y-[1px]">
                          <div className={cn('absolute left-0 top-0 h-full w-[5px] transition-all duration-200 group-hover:w-[7px]', stage.stripe)} />
                          <div className="pl-4 pr-3 py-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2 pr-1">{lead.company_name}</p>
                            {lead.contact_name && <p className="text-[11px] text-slate-500 flex items-center gap-1"><User className="h-3 w-3 flex-shrink-0" />{lead.contact_name}</p>}
                            {lead.assigned_to  && <p className="text-[11px] text-blue-600 font-medium flex items-center gap-1"><UserCheck className="h-3 w-3 flex-shrink-0" />{userNameById(lead.assigned_to)}</p>}
                            {lead.referred_by  && <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1"><User className="h-3 w-3 flex-shrink-0" />Ref: {lead.referred_by}</p>}
                            {(lead.services||[]).length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {lead.services.slice(0,2).map(s => <ServiceBadge key={s} value={s} size="xs" />)}
                                {lead.services.length > 2 && <span className="text-[10px] text-slate-400 font-medium">+{lead.services.length - 2}</span>}
                              </div>
                            )}
                            {lead.quotation_amount && <p className="text-xs font-bold text-slate-700">₹{Number(lead.quotation_amount).toLocaleString()}</p>}
                            {prob != null && (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full transition-all duration-500', prob >= 70 ? 'bg-emerald-500' : prob >= 40 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${prob}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">{prob}%</span>
                              </div>
                            )}
                            {overdue && <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-semibold"><AlertTriangle className="h-3 w-3" />Overdue</span>}
                            <div className="flex gap-1 pt-1 border-t border-slate-100">
                              {canEditLead(lead) && (
                                <button onClick={() => handleEdit(lead)}
                                  className="flex-1 h-6 text-[11px] font-medium rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95">
                                  Edit
                                </button>
                              )}
                              {canEditLead(lead) && (
                                <button onClick={() => handleConvertButtonClick(lead)}
                                  className="flex-1 h-6 text-[11px] font-semibold rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1">
                                  <Zap className="h-3 w-3" /> Win
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {colLeads.length === 0 && (
                    <div className="text-center py-8 text-slate-200">
                      <Circle className="h-7 w-7 mx-auto mb-1 opacity-50" />
                      <p className="text-[11px]">Empty</p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── Lead Form Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>
              {editingLead ? 'Edit Lead' : 'Create New Lead'}
            </DialogTitle>
            <DialogDescription>
              {editingLead ? 'Update lead details below.' : 'Fill in the details to add a new lead to your pipeline.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <SectionLabel icon={Building2}>Company Info</SectionLabel>

            <div className="md:col-span-2 space-y-1.5">
              <Label>Company Name <span className="text-red-500">*</span></Label>
              <Input value={formData.company_name || ''} onChange={e => handleChange('company_name', e.target.value)} placeholder="e.g. Sharma & Associates" className={cn('h-10 rounded-2xl', errors.company_name && 'border-red-400')} />
              {errors.company_name && <p className="text-xs text-red-500">{errors.company_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={formData.contact_name || ''} onChange={e => handleChange('contact_name', e.target.value)} placeholder="Full name" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)} placeholder="contact@company.com" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)} placeholder="+91 98765 43210" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Quotation Amount (₹)</Label>
              <Input type="number" value={formData.quotation_amount ?? ''} onChange={e => handleChange('quotation_amount', e.target.value)} placeholder="0" className="h-10 rounded-2xl" />
            </div>

            <SectionLabel icon={Tag}>Services Required</SectionLabel>
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Select all services this lead is interested in</p>
                {formData.services.length > 0 && (
                  <button type="button" onClick={() => setFormData(p => ({ ...p, services: [] }))} className="text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors">Clear all</button>
                )}
              </div>
              <ServiceSelector selected={formData.services} onChange={val => setFormData(p => ({ ...p, services: val }))} availableFromServer={availableServices} />
            </div>

            <SectionLabel icon={ArrowRight}>Source & Assignment</SectionLabel>
            <div className="space-y-1.5">
              <Label>Lead Source</Label>
              <Select value={formData.source || 'direct'} onValueChange={v => handleChange('source', v)}>
                <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Referred By</Label>
              <Input value={formData.referred_by || ''} onChange={e => handleChange('referred_by', e.target.value)} placeholder="Name of referrer" className="h-10 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-slate-400" />Assign To</Label>
              <Select value={formData.assigned_to || 'unassigned'} onValueChange={v => handleChange('assigned_to', v === 'unassigned' ? null : v)}>
                <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue placeholder="Select team member…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">— Unassigned —</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">{u.full_name}{u.id === user?.id && <span className="text-[10px] text-slate-400">(you)</span>}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editingLead && (
              <div className="space-y-1.5">
                <Label>Pipeline Stage</Label>
                <Select value={formData.status} onValueChange={v => handleChange('status', v)}>
                  <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{PIPELINE_STAGES.filter(s => s.id !== 'won').map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400">To mark as Won, use the Convert button.</p>
              </div>
            )}

            <SectionLabel icon={Calendar}>Dates & Follow-up</SectionLabel>
            <div className="space-y-1.5">
              <Label>Next Follow-up</Label>
              <Input type="datetime-local" value={formData.next_follow_up ? formData.next_follow_up.slice(0,16) : ''} onChange={e => handleChange('next_follow_up', e.target.value ? new Date(e.target.value).toISOString() : null)} className="h-10 rounded-2xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Meeting</Label>
              <Input type="datetime-local" value={formData.date_of_meeting ? formData.date_of_meeting.slice(0,16) : ''} onChange={e => handleChange('date_of_meeting', e.target.value ? new Date(e.target.value).toISOString() : null)} className="h-10 rounded-2xl text-sm" />
            </div>

            {editingLead && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-slate-400" />
                  Closure Probability (%)
                  <span className="text-[10px] text-slate-400 font-normal ml-1">— auto-calculated, or override</span>
                </Label>
                <Input type="number" min="0" max="100" value={formData.closure_probability ?? ''} onChange={e => handleChange('closure_probability', e.target.value)} placeholder="0–100" className="h-10 rounded-2xl" />
              </div>
            )}

            <SectionLabel icon={MessageSquare}>Notes</SectionLabel>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)} placeholder="Notes, requirements, context… keywords like 'interested', 'proceed', 'agree' boost closure probability." rows={3} className="resize-none rounded-2xl text-sm" />
              <p className="text-[10px] text-slate-400">Positive keywords raise · Negative keywords lower closure probability.</p>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-200 gap-2">
            <Button variant="outline" onClick={closeDialog} className="rounded-2xl">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="rounded-2xl bg-blue-700 hover:bg-blue-800 text-white min-w-[130px] active:scale-95 transition-all">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : editingLead ? 'Update Lead' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Convert to Task Dialog ── */}
      {convertingLead && (
        <ConvertToTaskDialog
          lead={convertingLead}
          open={!!convertingLead}
          onClose={() => setConvertingLead(null)}
          onSuccess={() => { setConvertingLead(null); fetchLeads(); }}
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
        />
      )}

    </motion.div>
  );
}
