import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import GifLoader, { MiniLoader } from '@/components/ui/GifLoader.jsx';
import { useNavigate } from 'react-router-dom';
import useDark from '../hooks/useDark';

import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isToday, isTomorrow, startOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { toast } from 'sonner';

import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import LayoutCustomizer from '../components/layout/LayoutCustomizer';
import { usePageLayout } from '../hooks/usePageLayout';


import {
  CheckSquare,
  FileText,
  Clock,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  Calendar as CalendarIcon,
  Users,
  Key,
  Briefcase,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Target,
  Activity,
  MapPin,
  Repeat,
  Plus,
  X,
  CheckCircle2,
  User as UserIcon,
  Tag,
  Layers,
  Star,
  Zap,
  Shield,
  BarChart2,
  Sun,
  Moon,
  Sunset,
  GripVertical,
  Settings2,
  Bell,
  BellRing,
} from 'lucide-react';

const API_BASE = api.defaults.baseURL;
const getAuthHeader = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const IST_TIMEZONE = 'Asia/Kolkata';

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  coral:        '#FF6B6B',
  amber:        '#F59E0B',
};

if (typeof document !== 'undefined' && !document.getElementById('roboto-mono-font')) {
  const link = document.createElement('link');
  link.id   = 'roboto-mono-font';
  link.rel  = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(link);
}

const slimScroll = {
  overflowY:      'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: '#cbd5e1 transparent',
};
if (typeof document !== 'undefined' && !document.getElementById('dash-slim-scroll')) {
  const s = document.createElement('style');
  s.id = 'dash-slim-scroll';
  s.textContent = `
    .slim-scroll::-webkit-scrollbar { width: 3px; height: 3px; }
    .slim-scroll::-webkit-scrollbar-track { background: transparent; }
    .slim-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    .slim-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .dark .slim-scroll::-webkit-scrollbar-thumb { background: #475569; }
    .dark .slim-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
  `;
  document.head.appendChild(s);
}

const springPhysics = {
  card:   { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: "spring", stiffness: 320, damping: 24, mass: 0.9  },
  button: { type: "spring", stiffness: 400, damping: 28 },
  icon:   { type: "spring", stiffness: 450, damping: 25 },
  tap:    { type: "spring", stiffness: 500, damping: 30 },
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.3 } },
};

const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-[3px] border-l-red-500';
  if (p === 'urgent')   return 'border-l-[3px] border-l-orange-400';
  if (p === 'medium')   return 'border-l-[3px] border-l-emerald-500';
  if (p === 'low')      return 'border-l-[3px] border-l-blue-400';
  return 'border-l-[3px] border-l-slate-200';
};

const VISIT_STATUS_COLORS = {
  scheduled:   { bg:'bg-blue-50 dark:bg-blue-900/30',     text:'text-blue-600 dark:text-blue-400',     dot:'bg-blue-500'    },
  completed:   { bg:'bg-emerald-50 dark:bg-emerald-900/30',text:'text-emerald-600 dark:text-emerald-400',dot:'bg-emerald-500'},
  missed:      { bg:'bg-orange-50 dark:bg-orange-900/20',  text:'text-orange-500 dark:text-orange-400', dot:'bg-orange-400'  },
  cancelled:   { bg:'bg-red-50 dark:bg-red-900/20',        text:'text-red-500 dark:text-red-400',       dot:'bg-red-500'     },
  rescheduled: { bg:'bg-purple-50 dark:bg-purple-900/20',  text:'text-purple-500 dark:text-purple-400', dot:'bg-purple-500'  },
};

const isTaskHiddenAsCompleted = (task) => {
  if (task.status !== 'completed') return false;
  if (!task.updated_at) return false;
  const completedAt = new Date(task.updated_at);
  const todayStart  = startOfDay(new Date());
  return completedAt < todayStart;
};

const sortNewestFirst = (arr) =>
  [...arr].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });

const deadlineUrgency = (daysLeft) => {
  if (daysLeft <= 0)  return { bg:'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30',   badge:'bg-red-500 text-white',    text:'text-red-600',    pill:'bg-red-500/20 text-red-300',    hex: COLORS.coral   };
  if (daysLeft <= 7)  return { bg:'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 hover:bg-orange-100',              badge:'bg-orange-500 text-white', text:'text-orange-600', pill:'bg-orange-500/20 text-orange-300', hex: '#EA580C'       };
  if (daysLeft <= 15) return { bg:'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100',              badge:'bg-yellow-500 text-white', text:'text-yellow-600', pill:'bg-amber-500/20 text-amber-300',   hex: COLORS.amber    };
  return { bg:'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100', badge:'bg-green-600 text-white', text:'text-green-700', pill:'bg-emerald-500/20 text-emerald-300', hex: COLORS.emeraldGreen };
};

const cn = (...classes) => classes.filter(Boolean).join(' ');

function LiveClock({ compact = false }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = formatInTimeZone(time, IST_TIMEZONE, 'hh:mm:ss');
  const ampm    = formatInTimeZone(time, IST_TIMEZONE, 'a');
  const dateStr = formatInTimeZone(time, IST_TIMEZONE, 'EEEE, MMM d');

  if (compact) {
    return (
      <div className="flex flex-col items-end select-none">
        <div className="flex items-end gap-1.5">
          <span
            className="font-black leading-none tracking-tight text-white"
            style={{ fontSize: '1.75rem', fontFamily: "'Roboto Mono', monospace" }}
          >
            {timeStr}
          </span>
          <span className="text-blue-200 font-bold text-sm mb-0.5">{ampm}</span>
        </div>
        <p className="text-blue-200/70 text-xs font-medium mt-0.5">{dateStr} · IST</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-white select-none">
      <div className="flex items-end gap-2">
        <span
          className="font-black leading-none tracking-tight"
          style={{ fontSize: '2.8rem', fontFamily: "'Roboto Mono', monospace" }}
        >
          {timeStr}
        </span>
        <span className="text-blue-200 font-bold text-xl mb-1.5">{ampm}</span>
      </div>
      <p className="text-blue-200/80 text-sm font-medium mt-1">{dateStr} · IST</p>
    </div>
  );
}

function DetailModal({ onClose, headerGradient, headerIcon, headerEyebrow, headerTitle, children, footer, isDark }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,15,30,0.72)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.88, y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: isDark ? '#1e293b' : '#ffffff',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 relative overflow-hidden" style={{ background: headerGradient }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                {headerIcon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mb-1">{headerEyebrow}</p>
                <h2 className="text-lg font-bold text-white leading-snug break-words pr-2">{headerTitle}</h2>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0 transition-all active:scale-90">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto slim-scroll" style={slimScroll}>
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 flex items-center gap-2 flex-wrap"
            style={{ borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', background: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa' }}>
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Chip({ label, color }) {
  return (
    <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, color }}>
      {label}
    </span>
  );
}

function MetaRow({ iconBg, iconColor, icon: Icon, label, value, valueColor, isDark }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={13} style={{ color: iconColor }} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm font-medium" style={{ color: valueColor || (isDark ? '#e2e8f0' : '#1e293b') }}>{value || '—'}</p>
      </div>
    </div>
  );
}

function NoteBlock({ label = 'Notes', text, isDark }) {
  if (!text) return null;
  return (
    <div className="rounded-xl p-3.5"
      style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-slate-400">{label}</p>
      <p className="text-sm leading-relaxed" style={{ color: isDark ? '#cbd5e1' : '#475569' }}>{text}</p>
    </div>
  );
}

function FooterBtn({ onClick, color, icon: Icon, label, muted, isDark }) {
  if (muted) return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl active:scale-95 transition-all ml-auto"
      style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', color: isDark ? '#94a3b8' : '#64748b', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0' }}>
      {Icon && <Icon size={12} />}{label}
    </button>
  );
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl active:scale-95 transition-all"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      {Icon && <Icon size={12} />}{label}
    </button>
  );
}

function TaskDetailModal({ task, onClose, onUpdateStatus, navigate, isDark }) {
  if (!task) return null;
  const isCompleted  = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';
  const safeDate = (d) => { try { return format(new Date(d), 'MMM d, yyyy · h:mm a'); } catch { return '—'; } };
  const priorityColors = { high:'#EF4444', critical:'#DC2626', medium:COLORS.amber, urgent:'#F97316', low:'#3B82F6' };
  const pColor = priorityColors[(task.priority || '').toLowerCase()] || '#94A3B8';
  const headerGradient = isCompleted
    ? `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)`
    : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`;

  return (
    <DetailModal isDark={isDark} onClose={onClose}
      headerGradient={headerGradient}
      headerIcon={<Briefcase className="w-5 h-5 text-white" />}
      headerEyebrow={isCompleted ? 'Completed Task' : isInProgress ? 'In Progress' : 'Task Details'}
      headerTitle={task.title || 'Untitled Task'}
      footer={
        <>
          {!isCompleted && (
            <>
              <FooterBtn isDark={isDark} color={COLORS.mediumBlue} icon={Activity} label={isInProgress ? '✓ In Progress' : 'Start'}
                onClick={() => { onUpdateStatus?.(task.id, 'in_progress'); onClose(); }} />
              <FooterBtn isDark={isDark} color={COLORS.emeraldGreen} icon={CheckCircle2} label="Mark Done"
                onClick={() => { onUpdateStatus?.(task.id, 'completed'); onClose(); }} />
            </>
          )}
          <FooterBtn isDark={isDark} muted icon={ArrowUpRight} label="View Full"
            onClick={() => { onClose(); navigate(`/tasks?taskId=${task.id}`); }} />
        </>
      }>
      <div className="flex flex-wrap gap-2">
        <Chip label={task.status?.replace('_', ' ') || 'Pending'}
          color={isCompleted ? COLORS.emeraldGreen : isInProgress ? COLORS.mediumBlue : '#94A3B8'} />
        {task.priority && <Chip label={task.priority} color={pColor} />}
        {task.category && <Chip label={task.category} color={COLORS.amber} />}
      </div>
      <NoteBlock isDark={isDark} label="Description" text={task.description} />
      <div className="space-y-3">
        {task.assigned_to_name && (
          <MetaRow isDark={isDark} icon={UserIcon} iconBg={isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12`} iconColor={COLORS.mediumBlue}
            label="Assigned To" value={task.assigned_to_name || task.assigned_to} />
        )}
        {(task.created_by_name || task.created_by) && (
          <MetaRow isDark={isDark} icon={UserIcon} iconBg={isDark ? 'rgba(100,116,139,0.2)' : '#f1f5f9'} iconColor="#64748b"
            label="Created By" value={task.created_by_name || task.created_by} />
        )}
        {task.client_name && (
          <MetaRow isDark={isDark} icon={Building2} iconBg={isDark ? 'rgba(31,175,90,0.2)' : `${COLORS.emeraldGreen}12`} iconColor={COLORS.emeraldGreen}
            label="Client" value={task.client_name} />
        )}
        {task.due_date && (
          <MetaRow isDark={isDark} icon={CalendarIcon} iconBg={isDark ? 'rgba(245,158,11,0.2)' : `${COLORS.amber}12`} iconColor={COLORS.amber}
            label="Due Date" value={safeDate(task.due_date)} />
        )}
        {task.created_at && (
          <MetaRow isDark={isDark} icon={Clock} iconBg={isDark ? 'rgba(100,116,139,0.2)' : '#f1f5f9'} iconColor="#64748b"
            label="Created" value={safeDate(task.created_at)} />
        )}
      </div>
    </DetailModal>
  );
}

function DeadlineDetailModal({ due, onClose, navigate, isDark }) {
  if (!due) return null;
  const daysLeft = due.days_remaining ?? 0;
  const headerGradient =
    daysLeft <= 0  ? 'linear-gradient(135deg,#DC2626,#B91C1C)'
    : daysLeft <= 7  ? 'linear-gradient(135deg,#EA580C,#C2410C)'
    : daysLeft <= 15 ? `linear-gradient(135deg,${COLORS.amber},#D97706)`
    :                  `linear-gradient(135deg,${COLORS.emeraldGreen},#15803d)`;
  const chipColor = daysLeft <= 0 ? COLORS.coral : daysLeft <= 7 ? '#EA580C' : daysLeft <= 15 ? COLORS.amber : COLORS.emeraldGreen;
  const safeDate = (d) => { try { return format(new Date(d), 'EEEE, MMMM d, yyyy'); } catch { return '—'; } };

  return (
    <DetailModal isDark={isDark} onClose={onClose}
      headerGradient={headerGradient}
      headerIcon={<CalendarIcon className="w-5 h-5 text-white" />}
      headerEyebrow="Compliance Deadline"
      headerTitle={due.title || 'Untitled Deadline'}
      footer={
        <FooterBtn isDark={isDark} muted icon={ArrowUpRight} label="View All Deadlines"
          onClick={() => { onClose(); navigate('/duedates'); }} />
      }>
      <div className="flex flex-wrap gap-2">
        <Chip label={daysLeft <= 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft} days left`} color={chipColor} />
        {due.category   && <Chip label={due.category}   color={COLORS.mediumBlue} />}
        {due.department && <Chip label={due.department} color={COLORS.amber} />}
        {due.status     && <Chip label={due.status}     color="#94A3B8" />}
      </div>
      <NoteBlock isDark={isDark} text={due.description} />
      <div className="space-y-3">
        {due.due_date && (
          <MetaRow isDark={isDark} icon={CalendarIcon}
            iconBg={daysLeft <= 0 ? `${COLORS.coral}18` : isDark ? 'rgba(245,158,11,0.2)' : `${COLORS.amber}12`}
            iconColor={daysLeft <= 0 ? COLORS.coral : COLORS.amber}
            label="Due Date" value={safeDate(due.due_date)}
            valueColor={daysLeft <= 0 ? COLORS.coral : undefined} />
        )}
        {due.department && (
          <MetaRow isDark={isDark} icon={Tag}
            iconBg={isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12`} iconColor={COLORS.mediumBlue}
            label="Department" value={due.department} />
        )}
        {due.category && (
          <MetaRow isDark={isDark} icon={Layers}
            iconBg={isDark ? 'rgba(245,158,11,0.2)' : `${COLORS.amber}12`} iconColor={COLORS.amber}
            label="Category" value={due.category} />
        )}
      </div>
    </DetailModal>
  );
}

function VisitDetailModal({ visit, onClose, navigate, isDark }) {
  if (!visit) return null;
  const sc  = VISIT_STATUS_COLORS[visit.status] || VISIT_STATUS_COLORS.scheduled;
  const isT = visit.visit_date && isToday(parseISO(visit.visit_date));
  const headerGradient = isT
    ? `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)`
    : 'linear-gradient(135deg, #0F766E, #0D9488)';
  const safeDate = (d) => { try { return format(parseISO(d), 'EEEE, MMMM d, yyyy'); } catch { return '—'; } };

  return (
    <DetailModal isDark={isDark} onClose={onClose}
      headerGradient={headerGradient}
      headerIcon={<MapPin className="w-5 h-5 text-white" />}
      headerEyebrow={isT ? "Today's Visit" : "Client Visit"}
      headerTitle={visit.client_name || 'Unknown Client'}
      footer={
        <FooterBtn isDark={isDark} muted icon={ArrowUpRight} label="View All Visits"
          onClick={() => { onClose(); navigate('/visits'); }} />
      }>
      <div className="flex flex-wrap gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full', sc.bg, sc.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', sc.dot)} />{visit.status || 'Scheduled'}
        </span>
        {isT && <Chip label="Today" color={COLORS.emeraldGreen} />}
        {visit.recurrence && visit.recurrence !== 'none' && <Chip label={visit.recurrence} color="#8B5CF6" />}
      </div>
      <NoteBlock isDark={isDark} label="Purpose" text={visit.purpose} />
      {visit.notes && <NoteBlock isDark={isDark} label="Notes" text={visit.notes} />}
      <div className="space-y-3">
        {visit.visit_date && (
          <MetaRow isDark={isDark} icon={CalendarIcon}
            iconBg={isDark ? 'rgba(245,158,11,0.2)' : `${COLORS.amber}12`} iconColor={COLORS.amber}
            label="Visit Date" value={safeDate(visit.visit_date)} />
        )}
        {visit.visit_time && (
          <MetaRow isDark={isDark} icon={Clock}
            iconBg={isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12`} iconColor={COLORS.mediumBlue}
            label="Time" value={visit.visit_time} />
        )}
        {visit.location && (
          <MetaRow isDark={isDark} icon={MapPin}
            iconBg={isDark ? 'rgba(20,184,166,0.2)' : '#f0fdfa'} iconColor="#0D9488"
            label="Location" value={visit.location} />
        )}
        {visit.assigned_to_name && (
          <MetaRow isDark={isDark} icon={UserIcon}
            iconBg={isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12`} iconColor={COLORS.mediumBlue}
            label="Assigned To" value={visit.assigned_to_name} />
        )}
        {visit.recurrence && visit.recurrence !== 'none' && (
          <MetaRow isDark={isDark} icon={Repeat}
            iconBg={isDark ? 'rgba(139,92,246,0.2)' : '#f5f3ff'} iconColor="#8B5CF6"
            label="Recurrence" value={visit.recurrence} />
        )}
      </div>
    </DetailModal>
  );
}

function TodoDetailModal({ todo, onClose, onToggle, onDelete, isDark }) {
  if (!todo) return null;
  const isCompleted = todo.completed || todo.is_completed === true || todo.status === 'completed';
  const isOD        = todo.due_date && new Date(todo.due_date) < new Date() && !isCompleted;
  const safeDate = (d) => { try { return format(new Date(d), 'EEEE, MMMM d, yyyy'); } catch { return '—'; } };
  const headerGradient = isCompleted
    ? `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)`
    : isOD
    ? 'linear-gradient(135deg, #DC2626, #B91C1C)'
    : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`;

  return (
    <DetailModal isDark={isDark} onClose={onClose}
      headerGradient={headerGradient}
      headerIcon={<CheckSquare className="w-5 h-5 text-white" />}
      headerEyebrow={isCompleted ? 'Completed Todo' : isOD ? 'Overdue Todo' : 'Todo Details'}
      headerTitle={todo.title || 'Untitled'}
      footer={
        <>
          <FooterBtn isDark={isDark}
            color={isCompleted ? COLORS.amber : COLORS.emeraldGreen}
            icon={CheckCircle2}
            label={isCompleted ? 'Mark Pending' : 'Mark Done'}
            onClick={() => { onToggle(todo._id || todo.id); onClose(); }} />
          <FooterBtn isDark={isDark} muted icon={X} label="Delete"
            onClick={() => { onDelete(todo._id || todo.id); onClose(); }} />
        </>
      }>
      <div className="flex flex-wrap gap-2">
        <Chip label={isCompleted ? 'Done' : isOD ? 'Overdue' : 'Pending'}
          color={isCompleted ? COLORS.emeraldGreen : isOD ? COLORS.coral : '#94A3B8'} />
        {todo.due_date && <Chip label={isOD ? 'Overdue' : `Due ${safeDate(todo.due_date)}`} color={isOD ? COLORS.coral : COLORS.amber} />}
      </div>
      <div className="space-y-3">
        {todo.due_date && (
          <MetaRow isDark={isDark} icon={CalendarIcon}
            iconBg={isOD ? `${COLORS.coral}18` : isDark ? 'rgba(245,158,11,0.2)' : `${COLORS.amber}12`}
            iconColor={isOD ? COLORS.coral : COLORS.amber}
            label="Due Date" value={safeDate(todo.due_date)} valueColor={isOD ? COLORS.coral : undefined} />
        )}
        {todo.created_at && (
          <MetaRow isDark={isDark} icon={Clock}
            iconBg={isDark ? 'rgba(100,116,139,0.2)' : '#f1f5f9'} iconColor="#64748b"
            label="Created" value={(() => { try { return format(new Date(todo.created_at), 'MMM d, yyyy · h:mm a'); } catch { return '—'; } })()} />
        )}
      </div>
    </DetailModal>
  );
}

function PerformerDetailModal({ member, index, period, onClose, isDark }) {
  if (!member) return null;
  const isGold   = index === 0;
  const isSilver = index === 1;
  const isBronze = index === 2;
  const medal    = isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : `#${index + 1}`;
  const headerGradient = isGold
    ? 'linear-gradient(135deg, #7B5A0A 0%, #C9920A 40%, #FFD700 100%)'
    : isSilver ? 'linear-gradient(135deg, #3A3A3A 0%, #707070 40%, #C0C0C0 100%)'
    : isBronze ? 'linear-gradient(135deg, #5C2E00 0%, #A0521A 40%, #CD7F32 100%)'
    : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`;
  const hours = member.total_hours
    ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
    : '0h 0m';
  const periodLabel = period === 'weekly' ? 'This Week' : period === 'monthly' ? 'This Month' : 'All Time';

  const statRow = (label, value, color) => (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0"
      style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  );

  return (
    <DetailModal isDark={isDark} onClose={onClose}
      headerGradient={headerGradient}
      headerIcon={
        member.profile_picture
          ? <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover rounded-xl" />
          : <span className="text-xl font-black text-white">{member.user_name?.charAt(0)?.toUpperCase() || '?'}</span>
      }
      headerEyebrow={`${medal} ${periodLabel} · Rank #${index + 1}`}
      headerTitle={member.user_name || 'Unknown'}>
      <div className="flex gap-2 flex-wrap">
        <Chip label={member.badge || 'Good Performer'} color={isGold ? '#D97706' : isSilver ? '#6B7280' : isBronze ? '#92400E' : COLORS.mediumBlue} />
        <Chip label={`Score: ${member.overall_score}%`} color={COLORS.emeraldGreen} />
      </div>
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"
          style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc' }}>
          Performance Breakdown
        </div>
        <div className="px-4">
          {statRow('Total Hours', hours, COLORS.deepBlue)}
          {statRow('Attendance', `${member.attendance_percent ?? '—'}%`, COLORS.emeraldGreen)}
          {statRow('Task Completion', `${member.task_completion_percent ?? '—'}%`, COLORS.mediumBlue)}
          {statRow('Timely Punch-In', `${member.timely_punchin_percent ?? '—'}%`, COLORS.amber)}
          {statRow('Todo On-Time', `${member.todo_ontime_percent ?? '—'}%`, '#8B5CF6')}
          {statRow('Overall Score', `${member.overall_score}%`, COLORS.emeraldGreen)}
        </div>
      </div>
    </DetailModal>
  );
}

function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate, onSelect }) {
  const status       = task.status || 'pending';
  const isCompleted  = status === 'completed';
  const isInProgress = status === 'in_progress';
  const isNew = task.created_at && (Date.now() - new Date(task.created_at).getTime()) < 86_400_000;

  return (
    <motion.div
      layout
      whileHover={{ y: -3, transition: springPhysics.lift }}
      whileTap={{ scale: 0.99, transition: springPhysics.tap }}
      className={`relative flex flex-col p-3 rounded-xl border bg-white dark:bg-slate-800 cursor-pointer group transition-all
        ${getPriorityStripeClass(task.priority)}
        ${isCompleted
          ? 'opacity-75 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
        }`}
      onClick={() => onSelect?.(task)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-start gap-1.5">
          {isNew && !isCompleted && (
            <span className="flex-shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500 text-white leading-none">
              NEW
            </span>
          )}
          <p className={`font-medium text-sm truncate leading-tight transition ${
            isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
          }`}>
            {task.title || 'Untitled Task'}
            {task.client_name && (
              <span className="text-slate-400 dark:text-slate-500 font-normal"> · {task.client_name}</span>
            )}
          </p>
        </div>
        {isToMe && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93, transition: springPhysics.button }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateStatus?.(task.id, 'in_progress'); }}
              disabled={isCompleted}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${
                isInProgress
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30'
              } disabled:opacity-40`}>
              {isInProgress ? '✓ In Progress' : 'Start'}
            </motion.button>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93, transition: springPhysics.button }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateStatus?.(task.id, 'completed'); }}
              disabled={isCompleted}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${
                isCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
              }`}>
              {isCompleted ? '✓ Done' : 'Done'}
            </motion.button>
          </div>
        )}
      </div>
      <div className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          {isToMe ? 'From: ' : 'To: '}
          <span className="font-medium text-slate-600 dark:text-slate-300">{assignedName || 'Unknown'}</span>
        </span>
        <span>· {format(new Date(task.created_at || Date.now()), 'MMM d · hh:mm a')}</span>
        {task.due_date && (
          <span>· Due: <span className="text-amber-600 dark:text-amber-400 font-medium">{format(new Date(task.due_date), 'MMM d, yyyy')}</span></span>
        )}
        {isCompleted && <span className="text-emerald-500 font-medium">· ✓ Completed today</span>}
      </div>
    </motion.div>
  );
}

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
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white leading-none">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function VisitsCard({ isDark, navigate, currentUserId, onSelectVisit, visits = [], isLoading = false, isError = false }) {
  const sorted = useMemo(() => {
    const filtered = visits.filter(v => v.assigned_to === currentUserId);
    return [...filtered].sort((a, b) => {
      const aToday = isToday(parseISO(a.visit_date)) ? 0 : 1;
      const bToday = isToday(parseISO(b.visit_date)) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return new Date(a.visit_date) - new Date(b.visit_date);
    });
  }, [visits, currentUserId]);

  const todayCount    = sorted.filter(v => isToday(parseISO(v.visit_date))).length;
  const tomorrowCount = sorted.filter(v => isTomorrow(parseISO(v.visit_date))).length;
  const subtitleText  = todayCount > 0 ? `${todayCount} today` : tomorrowCount > 0 ? `${tomorrowCount} tomorrow` : 'Next 7 days';

  return (
    <SectionCard>
      <CardHeaderRow
        iconBg={isDark ? 'bg-teal-900/40' : 'bg-teal-50'}
        icon={<MapPin className="h-4 w-4 text-teal-500" />}
        title="Client Visits"
        subtitle={subtitleText}
        badge={todayCount}
        action={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 rounded-lg ${isDark ? 'text-teal-400 hover:text-teal-300' : 'text-teal-500'}`}
              onClick={() => navigate('/visits?action=new')}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-teal-400 hover:text-teal-300' : 'text-teal-500'}`}
              onClick={() => navigate('/visits')}>
              View All
            </Button>
          </div>
        }
      />
      <div className="p-3">
        {isLoading ? (
          <MiniLoader height={350} />
        ) : isError ? (
          <div className="text-center py-7 space-y-3">
            <div className="flex justify-center">
              <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <MapPin className="h-6 w-6 text-slate-300 dark:text-slate-500" />
              </div>
            </div>
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Visit module not connected yet</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-7 space-y-3">
            <div className="flex justify-center">
              <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <MapPin className="h-6 w-6 text-slate-300 dark:text-slate-500" />
              </div>
            </div>
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No visits in next 7 days</p>
            <Button size="sm" onClick={() => navigate('/visits?action=new')} className="rounded-xl text-white text-xs"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <Plus className="h-3 w-3 mr-1" /> Schedule Visit
            </Button>
          </div>
        ) : (
          <div className="slim-scroll space-y-2 max-h-[200px]" style={slimScroll}>
            <AnimatePresence>
              {sorted.map((v, i) => {
                const sc  = VISIT_STATUS_COLORS[v.status] || VISIT_STATUS_COLORS.scheduled;
                const isT = isToday(parseISO(v.visit_date));
                return (
                  <motion.div
                    key={v.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05, ...springPhysics.card } }}
                    whileHover={{ y: -2, transition: springPhysics.lift }}
                    onClick={() => onSelectVisit?.(v)}
                    className={`relative flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all group ${
                      isT
                        ? 'border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-900/15 hover:border-teal-300 dark:hover:border-teal-700'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex-shrink-0 w-12 text-center">
                      <div className={`rounded-lg overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                        <div className="py-0.5 text-[8px] font-bold text-white uppercase"
                          style={{ background: isT ? COLORS.emeraldGreen : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                          {isT ? 'TODAY' : format(parseISO(v.visit_date), 'MMM')}
                        </div>
                        <div className={`py-1 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                          <p className={`text-base font-black leading-none ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                            {format(parseISO(v.visit_date), 'd')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{v.client_name || '—'}</p>
                        <span className={cn('flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1', sc.bg, sc.text)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', sc.dot)} />{v.status}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.purpose}</p>
                      <div className={`flex items-center gap-2 mt-1 flex-wrap text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {v.visit_time && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{v.visit_time}</span>}
                        {v.location && <span className="flex items-center gap-0.5 truncate max-w-[100px]"><MapPin className="h-2.5 w-2.5 flex-shrink-0" />{v.location.slice(0, 25)}</span>}
                        {v.recurrence && v.recurrence !== 'none' && <span className="flex items-center gap-0.5 text-purple-400"><Repeat className="h-2.5 w-2.5" />{v.recurrence}</span>}
                        <span className="ml-auto font-medium" style={{ color: COLORS.mediumBlue }}>{v.assigned_to_name?.split(' ')[0]}</span>
                      </div>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-slate-400' : 'text-slate-300'}`} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
      {sorted.length > 0 && (
        <div className={`px-4 py-2 border-t flex items-center justify-between ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'}`}>
          <div className="flex items-center gap-3">
            {sorted.filter(v => v.status === 'scheduled').length > 0 && (
              <span className="text-xs font-semibold text-blue-500">{sorted.filter(v => v.status === 'scheduled').length} Scheduled</span>
            )}
            {sorted.filter(v => v.status === 'completed').length > 0 && (
              <span className="text-xs font-semibold text-emerald-500">{sorted.filter(v => v.status === 'completed').length} Completed</span>
            )}
          </div>
          <button onClick={() => navigate('/visits')} className={`text-xs font-semibold flex items-center gap-0.5 hover:underline ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
            Full Plan <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </SectionCard>
  );
}

export default function Dashboard() {
  const isDark = useDark();

  // ── Auth & Navigation ─────────────────────────────────────────────────────
  const { user: authUser, hasPermission } = useAuth();
  const user = authUser || {
    id: '', full_name: 'User', role: 'staff',
    permissions: { view_other_tasks: [], can_view_all_tasks: false }
  };
  const navigate = useNavigate();

  const apiFetch = React.useCallback(async (endpoint) => {
    try {
      const res = await api.get(endpoint);
      return res.data;
    } catch (err) {
      console.error(`apiFetch ${endpoint} failed:`, err?.response?.status, err?.response?.data?.detail || err.message);
      return null;
    }
  }, []);

  // ── Core State ─────────────────────────────────────────────────────────────
  const [tasks,             setTasks]             = useState([]);   // ✅ ADD THIS
  const [visits,            setVisits]            = useState([]); // ✅ ADD THIS
  const [loading,           setLoading]           = useState(false);
  const [rankings,          setRankings]          = useState([]);
  const [rankingPeriod,     setRankingPeriod]     = useState('monthly');
  const [newTodo,           setNewTodo]           = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedDueDate,   setSelectedDueDate]   = useState(undefined);
  const [mustPunchIn,       setMustPunchIn]       = useState(false);
  const [actionDone,        setActionDone]        = useState(false);

  const [selectedTask,      setSelectedTask]      = useState(null);
  const [selectedDeadline,  setSelectedDeadline]  = useState(null);
  const [selectedVisit,     setSelectedVisit]     = useState(null);
  const [selectedTodo,      setSelectedTodo]      = useState(null);
  const [selectedPerformer, setSelectedPerformer] = useState(null);
  const [showCustomize,     setShowCustomize]     = useState(false);
  const DASHBOARD_SECTIONS = ['metrics','tasks_row','assigned_tasks','performers','quick_access'];
  const DASHBOARD_LABELS = {
    metrics:         { name:'Key Metrics',          icon:'📊', desc:'6 stat cards — tasks, todos, overdue, DSC…' },
    tasks_row:       { name:'Tasks & Deadlines',    icon:'📋', desc:'Recent tasks, compliance deadlines, attendance' },
    assigned_tasks:  { name:'Assigned Tasks',       icon:'✅', desc:'Tasks assigned to you and by you' },
    performers:      { name:'Performers & Todos',   icon:'🌟', desc:'Star performers, to-do list and client visits' },
    quick_access:    { name:'Quick Access',         icon:'⚡', desc:'Leads, clients, DSC, compliance tiles' },
  };
  const { order: dashOrder, moveSection: dashMove, resetOrder: dashReset } = usePageLayout('dashboard', DASHBOARD_SECTIONS);

  // ── Real Data State (replaces all stubs) ──────────────────────────────────
  const [allUsers,         setAllUsers]         = useState([]);
  const [usersLoading,     setUsersLoading]     = useState(true);
  const [stats,            setStats]            = useState({
    total_tasks: 0, completed_tasks: 0, overdue_tasks: 0,
    expiring_dsc_count: 0, expired_dsc_count: 0,
    upcoming_due_dates: 0, total_clients: 0, total_dsc: 0,
    team_workload: [],
  });
  const [upcomingDueDates, setUpcomingDueDates] = useState([]);
  const [todayAttendance,  setTodayAttendance]  = useState(null);
  const [holidaysData,     setHolidaysData]     = useState([]);
  const [todosRaw,         setTodosRaw]         = useState([]);
  const [reminders,        setReminders]        = useState([]);
  const [leadsData,        setLeadsData]        = useState([]);
  const [dataLoading,      setDataLoading]      = useState(true);
  const [deptMembers,      setDeptMembers]      = useState({ count: 0, departments: [], members: [] });

  // ── Fetch All Dashboard Data ───────────────────────────────────────────────
  const fetchDashboardData = React.useCallback(async () => {
    setDataLoading(true);

    // ── Wave 1: critical path ──
    try {
      const [tasksData, statsData, dueDatesData, attendanceData, todosData, visitsData, holidaysRes, deptMembersRes, remindersData] =
        await Promise.all([
          apiFetch('/tasks'),
          apiFetch('/dashboard/stats'),
          apiFetch('/duedates/upcoming?days=30'),
          apiFetch('/attendance/today'),
          apiFetch('/todos'),   // ← FIX: backend scopes by JWT; no user_id param needed
          apiFetch('/visits'),
          apiFetch('/holidays'),
          apiFetch('/dashboard/dept-members'),  // dept-scoped team count for all roles
          apiFetch('/email/reminders'),
        ]);
        
      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(holidaysRes)) setHolidaysData(holidaysRes);
      if (Array.isArray(visitsData)) setVisits(visitsData);
      
      if (statsData && typeof statsData === 'object' && !Array.isArray(statsData)) {
        setStats(statsData);
      }
      if (Array.isArray(dueDatesData)) setUpcomingDueDates(dueDatesData);
      if (attendanceData) setTodayAttendance(attendanceData);
      if (Array.isArray(todosData)) setTodosRaw(todosData);
      if (Array.isArray(remindersData)) setReminders(remindersData);
      if (deptMembersRes && typeof deptMembersRes.count === 'number') {
        setDeptMembers(deptMembersRes);
      }
      
    } catch (e) {
      console.error('Dashboard wave-1 fetch error:', e);
    }
    
    setDataLoading(false); // <--- Line 941 (from your error log)

    // ── Wave 2: secondary ──
    try {
      const [usersData, leadsRes, rankingsData] = await Promise.all([
        apiFetch('/users'),
        apiFetch('/leads'),
        apiFetch(`/reports/performance-rankings?period=${rankingPeriod}`),
      ]);
      
      if (Array.isArray(usersData)) { 
        setAllUsers(usersData);   
        setUsersLoading(false); 
      }
      // CHECK HERE: Ensure the line below isn't "trapped" outside a block
      if (Array.isArray(leadsRes)) setLeadsData(leadsRes);
      if (Array.isArray(rankingsData)) setRankings(rankingsData);
      
    } catch (e) {
      console.error('Dashboard wave-2 fetch error:', e);
      setUsersLoading(false);
    }
  }, [apiFetch, rankingPeriod, user?.id]);

  // Initial load
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Re-fetch rankings when period changes
  useEffect(() => {
    const fetchRankings = async () => {
      const data = await apiFetch(`/reports/performance-rankings?period=${rankingPeriod}`);
      if (Array.isArray(data)) setRankings(data);
    };
    fetchRankings();
  }, [rankingPeriod, apiFetch]);

  const isAdmin = user?.role === 'admin';

  const hasCrossVisibility = useMemo(() => {
    if (isAdmin) return true;
    const perms = user?.permissions || {};
    return (
      (perms.view_other_tasks && perms.view_other_tasks.length > 0) ||
      perms.can_view_all_tasks === true
    );
  }, [user, isAdmin]);

  const crossVisibilityUserIds = useMemo(() => {
    if (isAdmin) {
      return [...new Set(tasks.map(t => t.assigned_to).filter(id => id && id !== user?.id))];
    }
    const perms = user?.permissions || {};
    return (perms.view_other_tasks || []).filter(id => id !== user?.id);
  }, [user, isAdmin, tasks]);

  const openLeadsCount = useMemo(
    () => leadsData.filter(
      l => l.status !== 'closed' && l.status !== 'won' && l.status !== 'lost'
    ).length,
    [leadsData]
  );

  const todayIsHoliday = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return holidaysData.some(h => h.date === today && h.status === 'confirmed');
  }, [holidaysData]);

  const todayHolidayName = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return holidaysData.find(
      h => h.date === today && h.status === 'confirmed'
    )?.name || '';
  }, [holidaysData]);

  const todos = useMemo(() =>
    (Array.isArray(todosRaw) ? todosRaw : []).map(todo => ({
      ...todo,
      completed: todo.status === 'completed' || todo.is_completed === true
    })),
    [todosRaw]
  );
  const pendingTodos = useMemo(() => todos.filter(todo => !todo.completed), [todos]);

  const myTasks = useMemo(() =>
    tasks.filter(
      t => t.assigned_to === user?.id || t.sub_assignees?.includes(user?.id)
    ),
    [tasks, user?.id]
  );

  const myTaskCount = myTasks.length;

  const tasksAssignedToMe = useMemo(() => {
    const filtered = tasks.filter(
      t => t.assigned_to === user?.id && !isTaskHiddenAsCompleted(t)
    );
    return sortNewestFirst(filtered).slice(0, 6);
  }, [tasks, user?.id]);

  const tasksAssignedByMe = useMemo(() => {
    const filtered = tasks.filter(
      t =>
        t.created_by === user?.id &&
        t.assigned_to !== user?.id &&
        !isTaskHiddenAsCompleted(t)
    );
    return sortNewestFirst(filtered).slice(0, 6);
  }, [tasks, user?.id]);

  const recentTasks = useMemo(() => {
    const filtered = tasks.filter(t => !isTaskHiddenAsCompleted(t));
    return sortNewestFirst(filtered).slice(0, 5);
  }, [tasks]);

  const teamTaskBreakdown = useMemo(() => {
    if (!hasCrossVisibility) return [];
    // Build list: current user + all cross visibility users
    const allUids = [...new Set([user?.id, ...crossVisibilityUserIds].filter(Boolean))];
    return allUids
      .map(uid => {
        const memberUser = allUsers.find(u => u.id === uid);
        const pendingCount = tasks.filter(
          t =>
            (t.assigned_to === uid || (t.sub_assignees || []).includes(uid)) &&
            t.status !== 'completed'
        ).length;
        const label = uid === user?.id ? (memberUser?.full_name || 'Me') : (memberUser?.full_name || 'Unknown');
        return { id: uid, name: label, pendingCount };
      })
      .filter(m => m.pendingCount > 0);
  }, [hasCrossVisibility, crossVisibilityUserIds, tasks, allUsers, user?.id]);

  const teamTaskTotal = useMemo(() => {
    if (!hasCrossVisibility) return 0;
    return tasks.filter(t => {
      const isIncomplete = t.status !== 'completed';
      // Include current user own tasks
      const isMyTask = t.assigned_to === user?.id || (t.sub_assignees || []).includes(user?.id);
      // Include cross visibility users tasks
      const isCrossTask =
        crossVisibilityUserIds.includes(t.assigned_to) ||
        (t.sub_assignees || []).some(id => crossVisibilityUserIds.includes(id));
      return isIncomplete && (isMyTask || isCrossTask);
    }).length;
  }, [hasCrossVisibility, crossVisibilityUserIds, tasks, user?.id]);

  const sortedDueDates = useMemo(() => {
    return [...upcomingDueDates].sort((a, b) => {
      const aOD = (a.days_remaining ?? 0) <= 0;
      const bOD = (b.days_remaining ?? 0) <= 0;
      if (aOD && !bOD) return -1;
      if (!aOD && bOD) return 1;
      return (a.days_remaining ?? 0) - (b.days_remaining ?? 0);
    });
  }, [upcomingDueDates]);

  const overdueDeadlineCount = useMemo(
    () => upcomingDueDates.filter(d => (d.days_remaining ?? 0) < 0).length,
    [upcomingDueDates]
  );

  // ── Todo Actions (real API) ────────────────────────────────────────────────
  const addTodo = async () => {
    if (!newTodo.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          title: newTodo.trim(),
          status: 'pending',
          due_date: selectedDueDate
            ? selectedDueDate.toISOString().split('T')[0]
            : null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setTodosRaw(prev => [created, ...prev]);
        toast.success('Todo added!');
        setNewTodo('');
        setSelectedDueDate(undefined);
      } else {
        toast.error('Failed to add todo');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleToggleTodo = async (id) => {
    const todo = todosRaw.find(t => (t._id || t.id) === id);
    if (!todo) return;
    const nowCompleted = !(todo.is_completed || todo.status === 'completed');
    // Optimistic update
    setTodosRaw(prev =>
      prev.map(t =>
        (t._id || t.id) === id
          ? { ...t, is_completed: nowCompleted, status: nowCompleted ? 'completed' : 'pending' }
          : t
      )
    );
    try {
      await fetch(`${API_BASE}/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          is_completed: nowCompleted,
          status: nowCompleted ? 'completed' : 'pending',
        }),
      });
    } catch {
      toast.error('Failed to update todo');
      // Revert on failure
      setTodosRaw(prev =>
        prev.map(t =>
          (t._id || t.id) === id
            ? { ...t, is_completed: !nowCompleted, status: !nowCompleted ? 'completed' : 'pending' }
            : t
        )
      );
    }
  };

  const handleDeleteTodo = async (id) => {
    // Optimistic remove
    setTodosRaw(prev => prev.filter(t => (t._id || t.id) !== id));
    try {
      await fetch(`${API_BASE}/todos/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      toast.success('Todo deleted');
    } catch {
      toast.error('Failed to delete todo');
      // Re-fetch to restore
      const data = await apiFetch('/todos');
      if (Array.isArray(data)) setTodosRaw(data);
    }
  };

  // ── Task Status Update (real API) ─────────────────────────────────────────
  const updateAssignedTaskStatus = async (taskId, newStatus) => {
    // Optimistic update
    setTasks(prev =>
      prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
    );
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        toast.error('Failed to update status');
        // Revert — re-fetch tasks
        const data = await apiFetch('/tasks');
        if (Array.isArray(data)) setTasks(data);
      } else {
        toast.success(`Marked as ${newStatus.replace('_', ' ')}`);
      }
    } catch {
      toast.error('Network error');
    }
  };

  // ── Punch In / Out (real API) ─────────────────────────────────────────────
  const handlePunchAction = async (action) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(
          action === 'punch_in'
            ? 'Punched in successfully!'
            : 'Punched out successfully!'
        );
        if (action === 'punch_in') {
          setActionDone(true);
          setMustPunchIn(false);
        }
        // Refresh attendance record
        const updated = await apiFetch('/attendance/today');
        if (updated) setTodayAttendance(updated);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Action failed');
      }
    } catch {
      toast.error('Network error');
    }
    setLoading(false);
  };

  // ── Duration Helper ────────────────────────────────────────────────────────
  const getTodayDuration = () => {
    if (!todayAttendance?.punch_in) return '0h 0m';
    if (todayAttendance.punch_out) {
      const mins = todayAttendance.duration_minutes || 0;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    const punchInStr  = todayAttendance.punch_in;
    const punchInDate = new Date(
      punchInStr.endsWith('Z') ? punchInStr : punchInStr + 'Z'
    );
    const diffMs = Date.now() - punchInDate.getTime();
    return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
  };

  const myCompletedTasks = useMemo(
    () => myTasks.filter(t => t.status === 'completed').length,
    [myTasks]
  );
  const completionRate =
    myTaskCount > 0 ? Math.round((myCompletedTasks / myTaskCount) * 100) : 0;

  const showTaskSection =
    isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;
  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  // Upcoming reminders for dashboard card
  const upcomingReminders = useMemo(() =>
    (Array.isArray(reminders) ? reminders : [])
      .filter(r => !r.is_dismissed && r.remind_at)
      .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at))
      .slice(0, 8),
    [reminders]
  );

  const getStatusStyle = (status) => {
    const styles = {
      completed:   {
        bg:   'bg-emerald-100 dark:bg-emerald-900/40',
        text: 'text-emerald-700 dark:text-emerald-400',
        dot:  'bg-emerald-500',
      },
      in_progress: {
        bg:   'bg-blue-100 dark:bg-blue-900/40',
        text: 'text-blue-700 dark:text-blue-400',
        dot:  'bg-blue-500',
      },
      pending: {
        bg:   'bg-slate-100 dark:bg-slate-700',
        text: 'text-slate-600 dark:text-slate-300',
        dot:  'bg-slate-400',
      },
    };
    return styles[status] || styles.pending;
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      high: {
        bg:     'bg-red-50 dark:bg-red-900/20',
        text:   'text-red-600',
        border: 'border-red-200 dark:border-red-800',
      },
      medium: {
        bg:     'bg-amber-50 dark:bg-amber-900/20',
        text:   'text-amber-600',
        border: 'border-amber-200 dark:border-amber-800',
      },
      low: {
        bg:     'bg-blue-50 dark:bg-blue-900/20',
        text:   'text-blue-600',
        border: 'border-blue-200 dark:border-blue-800',
      },
    };
    return styles[priority?.toLowerCase()] || styles.medium;
  };

  const formatToLocalTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(
      dateString.endsWith('Z') ? dateString : dateString + 'Z'
    );
    return format(d, 'hh:mm a');
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    if (h < 21) return 'Good Evening';
    return 'Working Late';
  };

  const getGreetingIcon = () => {
    const h = new Date().getHours();
    if (h < 21) return Sun;
    return Moon;
  };

 
  const RankingItem = React.memo(({ member, index, period }) => {
    const isGold   = index === 0;
    const isSilver = index === 1;
    const isBronze = index === 2;
    const isPodium = isGold || isSilver || isBronze;
    const medal    = isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : null;

    const rowStyle = isGold
      ? { background: 'linear-gradient(135deg, #7B5A0A 0%, #C9920A 40%, #FFD700 100%)', border: '1px solid #E2AA00' }
      : isSilver
      ? { background: 'linear-gradient(135deg, #3A3A3A 0%, #707070 40%, #C0C0C0 100%)', border: '1px solid #A8A8A8' }
      : isBronze
      ? { background: 'linear-gradient(135deg, #5C2E00 0%, #A0521A 40%, #CD7F32 100%)', border: '1px solid #B87030' }
      : isDark
      ? { background: '#1e293b', border: '1px solid #334155' }
      : { background: '#f8fafc', border: '1px solid #e2e8f0' };

    return (
      <motion.div
        whileHover={{ y: -2, scale: 1.01, transition: springPhysics.lift }}
        onClick={() => setSelectedPerformer({ member, index })}
        className="flex items-center justify-between p-3 rounded-xl transition-all hover:shadow-lg cursor-pointer"
        style={rowStyle}
      >
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${isPodium ? 'bg-black/20 text-white' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
            {medal || `#${index + 1}`}
          </div>
          <div className={`w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 ring-2 ${isGold ? 'ring-yellow-300/60' : isSilver ? 'ring-slate-300/60' : isBronze ? 'ring-orange-300/60' : isDark ? 'ring-slate-600' : 'ring-slate-200'}`}>
            {member.profile_picture
              ? <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center font-bold text-sm"
                  style={{ background: isPodium ? 'rgba(0,0,0,0.25)' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`, color:'white' }}>
                  {member.user_name?.charAt(0)?.toUpperCase() || '?'}
                </div>}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm leading-tight truncate ${isPodium ? 'text-white' : isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              {member.user_name || 'Unknown'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPodium ? 'bg-black/20 text-white' : isDark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                {member.overall_score}%
              </span>
              <span className={`text-[10px] truncate max-w-[72px] ${isPodium ? 'text-white/65' : isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                {member.badge || 'Good Performer'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className={`text-sm font-bold tracking-tight ${isPodium ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {member.total_hours ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m` : '0h 00m'}
          </p>
          <p className={`text-[10px] ${isPodium ? 'text-white/55' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {period === 'weekly' ? 'this week' : period === 'monthly' ? 'this month' : 'this period'}
          </p>
        </div>
      </motion.div>
    );
  });

  useEffect(() => {
    if (!todayAttendance) { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (actionDone)                             { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayIsHoliday)                         { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayAttendance.status === 'leave')     { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayAttendance.punch_in)               { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayAttendance.status === 'absent')    { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    setMustPunchIn(true);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, [todayAttendance, todayIsHoliday, actionDone]);

  const metricCardCls     = 'rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border';
  const metricCardDefault = isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300';

  const GreetIcon = getGreetingIcon();

  const overdueTaskCount = useMemo(() => myTasks.filter(t => t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()).length, [myTasks]);

  return (
    <>
      {/* Non-blocking top bar loader */}
      {dataLoading && (
        <div className="fixed top-0 left-0 right-0 z-[99999] h-0.5">
          <div
            className="h-full animate-pulse"
            style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue}, ${COLORS.emeraldGreen})` }}
          />
        </div>
      )}
      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal isDark={isDark} task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdateStatus={updateAssignedTaskStatus} navigate={navigate} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedDeadline && (
          <DeadlineDetailModal isDark={isDark} due={selectedDeadline}
            onClose={() => setSelectedDeadline(null)} navigate={navigate} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedVisit && (
          <VisitDetailModal isDark={isDark} visit={selectedVisit}
            onClose={() => setSelectedVisit(null)} navigate={navigate} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedTodo && (
          <TodoDetailModal isDark={isDark} todo={selectedTodo}
            onClose={() => setSelectedTodo(null)}
            onToggle={handleToggleTodo} onDelete={handleDeleteTodo} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedPerformer && (
          <PerformerDetailModal isDark={isDark}
            member={selectedPerformer.member} index={selectedPerformer.index} period={rankingPeriod}
            onClose={() => setSelectedPerformer(null)} />
        )}
      </AnimatePresence>

      <LayoutCustomizer
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        order={dashOrder}
        sectionLabels={DASHBOARD_LABELS}
        onDragEnd={dashMove}
        onReset={dashReset}
        isDark={isDark}
      />

      <motion.div className="space-y-4 sm:space-y-5 w-full min-w-0 overflow-x-hidden" variants={containerVariants} initial="hidden" animate="visible">

        {/* WELCOME BANNER */}
        <motion.div variants={itemVariants}>
          <div
            className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
            style={{
              background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)`,
              boxShadow: `0 8px 32px rgba(13,59,102,0.28)`,
            }}
          >
            <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="absolute right-28 bottom-0 w-40 h-40 rounded-full mb-[-40px] opacity-5"
              style={{ background: 'white' }} />
            <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5"
              style={{ background: 'white' }} />

            <div className="relative">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    <GreetIcon className="h-3 w-3" />
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                  <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
                    {getGreeting()}, {user?.full_name?.split(' ')[0] || 'User'}!
                  </h1>
                  {todayIsHoliday && (
                    <p className="text-white/55 text-sm mt-1 max-w-md leading-relaxed">
                      Today is a holiday{todayHolidayName ? ` — ${todayHolidayName}` : ''}. Office closed.
                    </p>
                  )}
                </div>

                <div className="hidden md:flex items-center gap-4 flex-shrink-0">
                  {isAdmin && (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.04, y: -1, transition: springPhysics.card }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/tasks')}
                        className="flex flex-col items-center justify-center px-4 py-2 rounded-xl cursor-pointer transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.12)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          backdropFilter: 'blur(8px)',
                          minWidth: 90,
                        }}
                      >
                        <span
                          className="font-black leading-none tracking-tight text-white"
                          style={{ fontSize: '2rem', fontFamily: "'Roboto Mono', monospace" }}
                        >
                          {stats?.total_tasks ?? tasks.length}
                        </span>
                        <span className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mt-1">
                          Total Tasks
                        </span>
                        <span
                          className="mt-1.5 flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(31,175,90,0.25)', color: '#5CCB5F' }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5CCB5F', display: 'inline-block' }} />
                          View All
                        </span>
                      </motion.button>
 
                      {/* Vertical divider */}
                      <div
                        className="self-stretch"
                        style={{
                          width: 1,
                          background: 'rgba(255,255,255,0.18)',
                          borderRadius: 99,
                        }}
                      />
                    </>
                  )}
 
                  <LiveClock compact />
                </div>

                {!todayIsHoliday && todayAttendance?.punch_in && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl flex-shrink-0"
                    style={{ background: 'rgba(31,175,90,0.18)', border: '1px solid rgba(31,175,90,0.3)' }}
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Clocked In</p>
                      <p className="text-sm font-bold text-white leading-none mt-0.5">
                        {formatToLocalTime(todayAttendance.punch_in)}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {sortedDueDates.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {sortedDueDates.slice(0, 4).map(due => {
                    const dl = due.days_remaining ?? 0;
                    return (
                      <motion.button
                        key={due.id}
                        whileHover={{ scale: 1.04, y: -1, transition: springPhysics.card }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setSelectedDeadline(due)}
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl transition-all"
                        style={{
                          background: dl <= 0 ? 'rgba(255,107,107,0.18)' : dl <= 7 ? 'rgba(234,88,12,0.18)' : 'rgba(255,255,255,0.1)',
                          border: dl <= 0 ? '1px solid rgba(255,107,107,0.35)' : dl <= 7 ? '1px solid rgba(234,88,12,0.35)' : '1px solid rgba(255,255,255,0.18)',
                          backdropFilter: 'blur(6px)',
                        }}
                      >
                        <div className="p-1.5 rounded-lg"
                          style={{ background: dl <= 0 ? 'rgba(255,107,107,0.25)' : dl <= 7 ? 'rgba(234,88,12,0.2)' : 'rgba(255,255,255,0.12)' }}>
                          <CalendarIcon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="text-[9px] font-semibold uppercase tracking-wider"
                            style={{ color: dl <= 0 ? '#fca5a5' : dl <= 7 ? '#fdba74' : 'rgba(255,255,255,0.5)' }}>
                            {dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'Due today' : `Due in ${dl}d`}
                          </p>
                          <p className="text-sm font-bold text-white leading-none mt-0.5 max-w-[160px] truncate">
                            {due.title?.slice(0, 22) || 'Deadline'}
                          </p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* CUSTOMIZE BUTTON */}
        <motion.div variants={itemVariants} className="flex justify-end">
          <button
            onClick={() => setShowCustomize(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all hover:shadow-md ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <Settings2 size={13} /> Customize Layout
          </button>
        </motion.div>

        {/* ORDERED SECTIONS */}
        {dashOrder.map((sectionId) => {
          if (sectionId === 'metrics') return (
        <React.Fragment key="metrics">
        {/* KEY METRICS — 6 EQUAL CARDS
            Cards: My Task | Todo | Overdue | DSC | Completion | Team Task
            All cards use identical padding, flex layout, and min-h to stay same size. */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 [&>*]:min-w-0"
          variants={itemVariants}
        >

          {/* 1. My Task */}
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate('/tasks')}
            className={`${metricCardCls} ${metricCardDefault}`}
          >
            <CardContent className="p-4 flex flex-col justify-between min-h-[110px]">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">My Task</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                    {myTaskCount}
                  </p>
                </div>
                <div
                  className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                  style={{ backgroundColor: isDark ? 'rgba(96,165,250,0.12)' : `${COLORS.deepBlue}12` }}
                >
                  <Briefcase className="h-4 w-4" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }} />
                </div>
              </div>
              <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-blue-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>View all</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </CardContent>
          </motion.div>

          {/* 2. Pending Todos */}
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate('/todos')}
            className={`${metricCardCls} ${
              pendingTodos.length > 0
                ? isDark
                  ? 'bg-blue-900/20 border-blue-800 hover:border-blue-700'
                  : 'bg-blue-50/60 border-blue-200 hover:border-blue-300'
                : metricCardDefault
            }`}
          >
            <CardContent className="p-4 flex flex-col justify-between min-h-[110px]">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Todo</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: isDark ? '#93c5fd' : COLORS.mediumBlue }}>
                    {pendingTodos.length}
                  </p>
                </div>
                <div
                  className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                  style={{ backgroundColor: isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12` }}
                >
                  <CheckSquare className="h-4 w-4" style={{ color: isDark ? '#93c5fd' : COLORS.mediumBlue }} />
                </div>
              </div>
              <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-blue-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>View all</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </CardContent>
          </motion.div>

          {/* 3. Overdue */}
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate('/tasks?filter=overdue')}
            className={`${metricCardCls} ${
              overdueTaskCount > 0
                ? isDark
                  ? 'bg-red-900/20 border-red-800 hover:border-red-700'
                  : 'bg-red-50/60 border-red-200 hover:border-red-300'
                : metricCardDefault
            }`}
          >
            <CardContent className="p-4 flex flex-col justify-between min-h-[110px]">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Overdue</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.coral }}>
                    {overdueTaskCount}
                  </p>
                </div>
                <div
                  className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                  style={{ backgroundColor: `${COLORS.coral}18` }}
                >
                  <AlertCircle className="h-4 w-4" style={{ color: COLORS.coral }} />
                </div>
              </div>
              <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-red-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>View all</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </CardContent>
          </motion.div>

          {/* 4. DSC Alerts */}
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate('/dsc?tab=expired')}
            className={`${metricCardCls} ${
              stats?.expiring_dsc_count > 0
                ? isDark
                  ? 'bg-red-900/20 border-red-800'
                  : 'bg-red-50/50 border-red-200'
                : metricCardDefault
            }`}
          >
            <CardContent className="p-4 flex flex-col justify-between min-h-[110px]">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">DSC</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight text-red-500">
                    {(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {stats?.expired_dsc_count || 0} expired
                  </p>
                </div>
                <div
                  className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                  style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2' }}
                >
                  <Key className="h-4 w-4 text-red-500" />
                </div>
              </div>
              <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-red-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>View all</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </CardContent>
          </motion.div>

          {/* 5. Completion */}
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate('/tasks')}
            className={`${metricCardCls} ${metricCardDefault}`}
          >
            <CardContent className="p-4 flex flex-col justify-between min-h-[110px]">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Completion</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                    {completionRate}%
                  </p>
                </div>
                <div
                  className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                  style={{ backgroundColor: `${COLORS.emeraldGreen}12` }}
                >
                  <TrendingUp className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
                </div>
              </div>
              <div className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${completionRate}%`,
                    background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`,
                  }}
                />
              </div>
            </CardContent>
          </motion.div>

          {/* 6. Team Task */}
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.985 }}
            onClick={() => hasCrossVisibility && !usersLoading && navigate('/tasks?filter=team')}
            className={`${metricCardCls} ${
              hasCrossVisibility && teamTaskTotal > 0
                ? isDark
                  ? 'bg-violet-900/20 border-violet-800 hover:border-violet-700'
                  : 'bg-violet-50/60 border-violet-200 hover:border-violet-300'
                : metricCardDefault
            }`}
          >
            <CardContent className="p-4 flex flex-col justify-between min-h-[110px]">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Team Task</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight"
                    style={{ color: hasCrossVisibility ? (isDark ? '#a78bfa' : '#7c3aed') : (isDark ? '#475569' : '#94a3b8') }}>
                    {hasCrossVisibility ? teamTaskTotal : 0}
                  </p>
                  {!usersLoading && hasCrossVisibility && teamTaskBreakdown.length > 0 && (
                    <div className="mt-1 space-y-0.5 max-h-[36px] overflow-hidden">
                      {teamTaskBreakdown.slice(0, 2).map(m => (
                        <p key={m.id} className="text-[9px] text-slate-400 truncate">
                          {m.name.split(' ')[0].toLowerCase()}: {m.pendingCount}
                        </p>
                      ))}
                      {teamTaskBreakdown.length > 2 && (
                        <p className="text-[9px] text-slate-400">+{teamTaskBreakdown.length - 2} more</p>
                      )}
                    </div>
                  )}
                  {!hasCrossVisibility && (
                    <p className="text-[9px] text-slate-400 mt-0.5">no access</p>
                  )}
                </div>
                <div
                  className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                  style={{ backgroundColor: hasCrossVisibility ? (isDark ? 'rgba(167,139,250,0.15)' : '#ede9fe') : (isDark ? 'rgba(71,85,105,0.2)' : '#f8fafc') }}
                >
                  <Users className="h-4 w-4" style={{ color: hasCrossVisibility ? '#7c3aed' : (isDark ? '#475569' : '#cbd5e1') }} />
                </div>
              </div>
              <div className={`flex items-center gap-1 mt-3 text-xs font-medium transition-colors ${hasCrossVisibility ? 'group-hover:text-violet-500' : ''} ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {hasCrossVisibility ? (
                  <>
                    <span>View team</span>
                    <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </>
                ) : (
                  <span>cross visibility off</span>
                )}
              </div>
            </CardContent>
          </motion.div>
        </motion.div>
        </React.Fragment>
          );
          if (sectionId === 'tasks_row') return (
        <React.Fragment key="tasks_row">
        {/* RECENT TASKS + DEADLINES + ATTENDANCE */}
        <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-w-0" variants={itemVariants}>

          {/* Recent Tasks */}
          <SectionCard>
            <CardHeaderRow
              iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
              icon={<Target className="h-4 w-4 text-blue-500" />}
              title="Recent Tasks"
              subtitle="Newest first · completed yesterday+ hidden"
              badge={recentTasks.length}
              action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500'}`} onClick={() => navigate('/tasks')}>View All</Button>}
            />
            <div className="p-3">
              {recentTasks.length === 0
                ? <div className={`text-center py-7 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No recent tasks</div>
                : (
                  <div className="slim-scroll space-y-2 max-h-[220px]" style={slimScroll}>
                    <AnimatePresence>
                      {recentTasks.map(task => {
                        const statusStyle   = getStatusStyle(task.status);
                        const priorityStyle = getPriorityStyle(task.priority);
                        const isNew = task.created_at && (Date.now() - new Date(task.created_at).getTime()) < 86_400_000;
                        return (
                          <motion.div key={task.id} variants={itemVariants} layout whileHover={{ y:-1 }}
                            className={`py-2.5 px-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${priorityStyle.bg} ${priorityStyle.border}`}
                            onClick={() => setSelectedTask(task)}>
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                {isNew && (
                                  <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500 text-white leading-none">NEW</span>
                                )}
                                <p className={`font-medium text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{task.title || 'Untitled Task'}</p>
                              </div>
                              <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md ${statusStyle.bg} ${statusStyle.text} whitespace-nowrap`}>
                                {task.status?.replace('_',' ') || 'PENDING'}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              <CalendarIcon className="h-3 w-3" />
                              {task.created_at ? format(new Date(task.created_at), 'MMM d, yyyy · h:mm a') : 'No date'}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
            </div>
          </SectionCard>

          {/* Upcoming Deadlines */}
          <SectionCard>
            <CardHeaderRow
              iconBg={isDark ? 'bg-orange-900/40' : 'bg-orange-50'}
              icon={<CalendarIcon className="h-4 w-4 text-orange-500" />}
              title="Upcoming Deadlines"
              subtitle="Overdue pinned · Next 30 days"
              badge={overdueDeadlineCount || undefined}
              action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-orange-400 hover:text-orange-300' : 'text-orange-500'}`} onClick={() => navigate('/duedates')}>View All</Button>}
            />
            <div className="p-3">
              {sortedDueDates.length === 0
                ? <div className={`text-center py-7 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No upcoming deadlines</div>
                : (
                  <div className="slim-scroll space-y-2 max-h-[220px]" style={slimScroll}>
                    <AnimatePresence>
                      {sortedDueDates.map(due => {
                        const dl    = due.days_remaining ?? 0;
                        const color = deadlineUrgency(dl);
                        return (
                          <motion.div key={due.id} variants={itemVariants} layout whileHover={{ y:-1 }}
                            className={`py-2.5 px-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${color.bg}`}
                            onClick={() => setSelectedDeadline(due)}>
                            <div className="flex items-center justify-between mb-1">
                              <p className={`font-medium text-sm truncate flex-1 mr-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{due.title || 'Untitled Deadline'}</p>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${color.badge} whitespace-nowrap`}>
                                {dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'Due today' : `${dl}d left`}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              <CalendarIcon className="h-3 w-3" />
                              {due.due_date ? format(new Date(due.due_date), 'MMM d, yyyy') : '—'}
                              {due.category && <span className="ml-auto text-[10px] font-semibold" style={{ color: COLORS.mediumBlue }}>{due.category}</span>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
            </div>
          </SectionCard>

          {/* Attendance Card */}
          <SectionCard>
            <CardHeaderRow
              iconBg={isDark ? 'bg-purple-900/40' : 'bg-purple-50'}
              icon={<Activity className="h-4 w-4 text-purple-500" />}
              title="Attendance"
              subtitle="Daily work hours"
              action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-500'}`} onClick={() => navigate('/attendance')}>View Log</Button>}
            />
            <div className="p-3">
              {todayIsHoliday ? (
                <div className="rounded-xl px-4 py-4 text-center"
                  style={{
                    background: isDark ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))' : 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                    border: isDark ? '1px solid rgba(245,158,11,0.25)' : '1px solid #FDE68A',
                  }}>
                  <p className="text-2xl mb-1">—</p>
                  <p className={`font-bold text-sm ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>{todayHolidayName || 'Holiday Today'}</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600'}`}>Office is closed today.</p>
                  {!todayAttendance?.punch_in && (
                    <button onClick={() => handlePunchAction('punch_in')} disabled={loading}
                      className={`mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'text-amber-300 border border-amber-700 hover:bg-amber-900/30' : 'text-amber-700 border border-amber-300 hover:bg-amber-50'}`}>
                      Working today? Punch In
                    </button>
                  )}
                  {todayAttendance?.punch_in && !todayAttendance?.punch_out && (
                    <div className="mt-3 space-y-2">
                      <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Clocked in at {formatToLocalTime(todayAttendance.punch_in)}</p>
                      <Button onClick={() => handlePunchAction('punch_out')} className="w-full bg-red-500 hover:bg-red-600 rounded-xl h-8 text-xs font-semibold" disabled={loading}>Punch Out</Button>
                    </div>
                  )}
                  {todayAttendance?.punch_out && <p className={`mt-2 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Worked {getTodayDuration()} today</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {todayAttendance?.punch_in ? (
                    <>
                      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${isDark ? 'bg-emerald-900/20 border-emerald-800' : 'bg-green-50 border-green-200'}`}>
                        <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          <LogIn className="h-4 w-4 text-green-500" />
                          <span className="font-medium">Punch In</span>
                        </div>
                        <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{formatToLocalTime(todayAttendance.punch_in)}</span>
                      </div>
                      {todayAttendance.punch_out ? (
                        <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                          <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            <LogOut className="h-4 w-4 text-red-500" />
                            <span className="font-medium">Punch Out</span>
                          </div>
                          <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{formatToLocalTime(todayAttendance.punch_out)}</span>
                        </div>
                      ) : (
                        <Button onClick={() => handlePunchAction('punch_out')} className="w-full bg-red-500 hover:bg-red-600 rounded-xl h-9 text-sm font-semibold" disabled={loading}>
                          Punch Out
                        </Button>
                      )}
                      <div className="text-center py-3 rounded-xl"
                        style={{
                          background: isDark ? 'rgba(96,165,250,0.08)' : `linear-gradient(135deg, ${COLORS.deepBlue}08, ${COLORS.mediumBlue}12)`,
                          border: isDark ? '1px solid rgba(96,165,250,0.15)' : `1px solid ${COLORS.deepBlue}15`,
                        }}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Total Today</p>
                        <p className="text-2xl font-bold mt-0.5 tracking-tight" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>{getTodayDuration()}</p>
                      </div>
                    </>
                  ) : (
                    <Button onClick={() => handlePunchAction('punch_in')} className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl h-10 text-sm font-semibold" disabled={loading}>
                      Punch In
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        </motion.div>
        </React.Fragment>
          );
          if (sectionId === 'assigned_tasks') return (
        <React.Fragment key="assigned_tasks">
        {/* ASSIGNED TASKS */}
        {showTaskSection && (
          <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <SectionCard className="hover:shadow-md transition">
              <CardHeaderRow
                iconBg={isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}
                icon={<Briefcase className="h-4 w-4 text-emerald-600" />}
                title="Tasks Assigned to Me"
                subtitle="Newest first · completed yesterday+ hidden"
                badge={tasksAssignedToMe.filter(t => t.status !== 'completed').length || undefined}
                action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} onClick={() => navigate('/tasks?filter=assigned-to-me')}>View All →</Button>}
              />
              <div className="p-3">
                {tasksAssignedToMe.length === 0
                  ? <div className={`h-24 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDark ? 'text-slate-500 border-slate-700' : 'text-slate-400 border-slate-200'}`}>No tasks assigned to you</div>
                  : (
                    <div className="slim-scroll space-y-1.5 max-h-[200px]" style={slimScroll}>
                      <AnimatePresence>
                        {tasksAssignedToMe.map(task => (
                          <TaskStrip key={task.id} task={task} isToMe={true}
                            assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
                            onUpdateStatus={updateAssignedTaskStatus} navigate={navigate}
                            onSelect={setSelectedTask} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
              </div>
            </SectionCard>

            <SectionCard className="hover:shadow-md transition">
              <CardHeaderRow
                iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                icon={<Briefcase className="h-4 w-4 text-blue-600" />}
                title="Tasks Assigned by Me"
                subtitle="Newest first · completed yesterday+ hidden"
                badge={tasksAssignedByMe.filter(t => t.status !== 'completed').length || undefined}
                action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} onClick={() => navigate('/tasks?filter=assigned-by-me')}>View All →</Button>}
              />
              <div className="p-3">
                {tasksAssignedByMe.length === 0
                  ? <div className={`h-24 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDark ? 'text-slate-500 border-slate-700' : 'text-slate-400 border-slate-200'}`}>No tasks assigned yet</div>
                  : (
                    <div className="slim-scroll space-y-1.5 max-h-[200px]" style={slimScroll}>
                      <AnimatePresence>
                        {tasksAssignedByMe.map(task => (
                          <TaskStrip key={task.id} task={task} isToMe={false}
                            assignedName={task.assigned_to_name || 'Unknown'}
                            onUpdateStatus={updateAssignedTaskStatus} navigate={navigate}
                            onSelect={setSelectedTask} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
              </div>
            </SectionCard>

            {/* My To-Do List — moved here as 3rd card */}
            <SectionCard className="hover:shadow-md transition">
              <CardHeaderRow
                iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                icon={<CheckSquare className="h-4 w-4 text-blue-500" />}
                title="My To-Do List"
                subtitle="Click any item for details"
                badge={pendingTodos.length || undefined}
                action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} onClick={() => navigate('/todos')}>View All</Button>}
              />
              <div className="p-3">
                <div className="flex gap-2 mb-3">
                  <input
                    type="text" value={newTodo} onChange={e => setNewTodo(e.target.value)}
                    placeholder="Add new task..."
                    onKeyDown={e => e.key === 'Enter' && addTodo()}
                    className={`flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:ring-blue-900/40' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'}`}
                  />
                  <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={`h-9 w-9 rounded-xl flex-shrink-0 ${
                          selectedDueDate
                            ? 'border-amber-400 text-amber-500'
                            : isDark
                            ? 'border-slate-600 bg-slate-700 text-slate-400'
                            : 'border-slate-200 text-slate-400'
                        }`}
                      >
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDueDate}
                        onSelect={(d) => { setSelectedDueDate(d); setShowDueDatePicker(false); }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Button onClick={addTodo} disabled={!newTodo.trim()} className="px-4 rounded-xl h-9 text-sm font-semibold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                    Add
                  </Button>
                </div>
                {selectedDueDate && (
                  <p className="text-xs text-amber-500 font-medium mb-2 -mt-1 ml-1">
                    Due: {format(selectedDueDate, 'MMM d, yyyy')}
                  </p>
                )}
                {pendingTodos.length === 0
                  ? <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No todos yet</div>
                  : (
                    <div className="slim-scroll space-y-1.5 max-h-[200px]" style={slimScroll}>
                      <AnimatePresence>
                        {pendingTodos.map(todo => (
                          <motion.div key={todo._id || todo.id} variants={itemVariants} layout
                            onClick={() => setSelectedTodo(todo)}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                              todo.completed
                                ? isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'
                                : !todo.completed && isOverdue(todo.due_date)
                                  ? isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50/70 border-red-200'
                                : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <input type="checkbox" checked={todo.completed}
                                onChange={e => { e.stopPropagation(); handleToggleTodo(todo._id || todo.id); }}
                                onClick={e => e.stopPropagation()}
                                className="h-4 w-4 accent-emerald-600 flex-shrink-0 rounded cursor-pointer" />
                              <div className="flex-1 min-w-0">
                                <span className={`block text-sm truncate ${todo.completed ? 'line-through text-slate-400 dark:text-slate-600' : isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                  {todo.title}
                                  {!todo.completed && isOverdue(todo.due_date) && (
                                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 rounded">Overdue</span>
                                  )}
                                </span>
                                {todo.due_date && (
                                  <p className={`text-[10px] mt-0.5 ${isOverdue(todo.due_date) ? 'text-red-500 font-medium' : isDark ? 'text-amber-400' : 'text-amber-500'}`}>
                                    Due: {format(new Date(todo.due_date), 'MMM d, yyyy')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button onClick={e => { e.stopPropagation(); handleDeleteTodo(todo._id || todo.id); }}
                              className={`text-xs font-medium transition-colors px-2 py-1 rounded-lg flex-shrink-0 ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-900/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}>
                              x
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
              </div>
            </SectionCard>
          </motion.div>
        )}
        </React.Fragment>
          );
          if (sectionId === 'performers') return (
        <React.Fragment key="performers">
        {/* STAR PERFORMERS + TO-DO + VISITS */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

          {/* Star Performers */}
          <SectionCard>
            <CardHeaderRow
              iconBg={isDark ? 'bg-yellow-900/40' : 'bg-yellow-50'}
              icon={<TrendingUp className="h-4 w-4 text-yellow-500" />}
              title="Star Performers"
              subtitle="Click any row for full stats"
              action={
                isAdmin ? (
                  <div className={`flex gap-0.5 rounded-lg p-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    {['all','monthly','weekly'].map(p => (
                      <button key={p} onClick={() => setRankingPeriod(p)}
                        className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${rankingPeriod===p ? isDark ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                ) : null
              }
            />
            <div className="p-3">
              {rankings.length === 0
                ? <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No ranking data</div>
                : (
                  <div className="slim-scroll space-y-2 max-h-[240px]" style={slimScroll}>
                    <AnimatePresence>
                      {rankings.map((member, i) => <RankingItem key={member.user_id || i} member={member} index={i} period={rankingPeriod} />)}
                    </AnimatePresence>
                  </div>
                )}
            </div>
          </SectionCard>

          {/* Reminders Card — replaces My Todo */}
          <SectionCard>
            <CardHeaderRow
              iconBg={isDark ? 'bg-purple-900/40' : 'bg-purple-50'}
              icon={<Bell className="h-4 w-4 text-purple-500" />}
              title="Reminders"
              subtitle="Upcoming reminders"
              badge={upcomingReminders.length || undefined}
              action={<Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-purple-400' : 'text-purple-500'}`} onClick={() => navigate('/reminders')}>View All</Button>}
            />
            <div className="p-3">
              {upcomingReminders.length === 0
                ? <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No upcoming reminders</div>
                : (
                  <div className="slim-scroll space-y-1.5 max-h-[240px]" style={slimScroll}>
                    <AnimatePresence>
                      {upcomingReminders.map(rem => {
                        const remId = rem._id || rem.id;
                        const isDue = rem.remind_at && new Date(rem.remind_at) < new Date();
                        return (
                          <motion.div key={remId} variants={itemVariants} layout whileHover={{ y: -1 }}
                            onClick={() => navigate('/reminders')}
                            className={`py-2.5 px-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${
                              isDue
                                ? isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50/70 border-red-200'
                                : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}>
                            <div className="flex items-center gap-2.5">
                              <BellRing className={`h-3.5 w-3.5 flex-shrink-0 ${isDue ? 'text-red-500' : 'text-purple-400'}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                  {rem.title || 'Untitled'}
                                </p>
                                {rem.remind_at && (
                                  <p className={`text-[10px] mt-0.5 ${isDue ? 'text-red-500 font-medium' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {isDue ? 'Overdue · ' : ''}{(() => { try { return format(new Date(rem.remind_at), 'MMM d, yyyy · h:mm a'); } catch { return '—'; } })()}
                                  </p>
                                )}
                              </div>
                              {isDue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white">DUE</span>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
            </div>
          </SectionCard>

          {/* Visits Section */}
          <VisitsCard 
            isDark={isDark} 
            navigate={navigate} 
            currentUserId={user?.id} 
            onSelectVisit={setSelectedVisit} 
            visits={visits} // ✅ FIXED: Changed from [] to visits
            isLoading={dataLoading} 
          />
          </motion.div>
        </React.Fragment>
          );
          if (sectionId === 'quick_access') return (
        <React.Fragment key="quick_access">
        {/* QUICK ACCESS TILES */}
        <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 [&>*]:min-w-0" variants={itemVariants}>
          {[
            {
              path:'/leads',
              icon:<Target className="h-4 w-4" style={{ color:COLORS.mediumBlue }} />,
              iconBg: isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12`,
              label:String(openLeadsCount),
              sub:'Open Leads',
            },
            {
              path:'/clients',
              icon:<Building2 className="h-4 w-4" style={{ color:COLORS.emeraldGreen }} />,
              iconBg: isDark ? 'rgba(31,175,90,0.2)' : `${COLORS.emeraldGreen}12`,
              label:String(stats?.total_clients || 0),
              sub: isAdmin ? 'Total Clients' : 'My Clients',
            },
            {
              path:'/dsc',
              icon:<Key className={`h-4 w-4 ${stats?.expiring_dsc_count > 0 ? 'text-red-500' : isDark ? 'text-slate-400' : 'text-slate-400'}`} />,
              iconBg: stats?.expiring_dsc_count > 0 ? isDark ? 'rgba(239,68,68,0.2)' : '#fef2f2' : isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
              label:String(stats?.total_dsc || 0),
              sub:'DSC Certs',
            },
            {
              path:'/duedates',
              icon:<CalendarIcon className={`h-4 w-4 ${stats?.upcoming_due_dates > 0 ? 'text-amber-500' : isDark ? 'text-slate-400' : 'text-slate-400'}`} />,
              iconBg: stats?.upcoming_due_dates > 0 ? isDark ? 'rgba(245,158,11,0.2)' : '#fffbeb' : isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
              label:String(stats?.upcoming_due_dates || 0),
              sub:'Compliance',
            },
          ].map(tile => (
            <motion.div key={tile.path} whileHover={{ y:-3, transition:springPhysics.card }} whileTap={{ scale:0.97 }}
              onClick={() => navigate(tile.path)} className={`${metricCardCls} ${metricCardDefault}`}>
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0" style={{ backgroundColor:tile.iconBg }}>
                  {tile.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tracking-tight" style={{ color: isDark ? '#e2e8f0' : COLORS.deepBlue }}>{tile.label}</p>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{tile.sub}</p>
                </div>
              </CardContent>
            </motion.div>
          ))}

          {/* Team Members tile — visible to ALL roles; admins see total, others see dept-scoped count */}
          <motion.div whileHover={{ y:-3, transition:springPhysics.card }} whileTap={{ scale:0.97 }}
            onClick={() => isAdmin ? navigate('/users') : undefined}
            className={`${metricCardCls} ${metricCardDefault} ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}>
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12` }}>
                <Users className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight" style={{ color: isDark ? '#e2e8f0' : COLORS.deepBlue }}>
                  {isAdmin ? (stats?.team_workload?.length || deptMembers.count || 0) : deptMembers.count}
                </p>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  {isAdmin ? 'Team Members' : 'Dept Members'}
                </p>
                {!isAdmin && deptMembers.departments?.length > 0 && (
                  <p className="text-[9px] text-slate-400 truncate mt-0.5">
                    {deptMembers.departments.join(', ')}
                  </p>
                )}
              </div>
            </CardContent>
          </motion.div>
        </motion.div>
        </React.Fragment>
          );
          return null;
        })}

        {/* PUNCH-IN GATE OVERLAY */}
        <AnimatePresence>
          {mustPunchIn && !todayIsHoliday && (
            <motion.div
              className="fixed inset-0 z-[9999] flex items-center justify-center"
              style={{ background: 'rgba(7,15,30,0.75)', backdropFilter: 'blur(10px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ scale: 0.88, y: 48 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 48 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
                className={`w-full max-w-sm mx-4 rounded-3xl overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-white'}`}
                style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}
              >
                <div
                  className="px-8 pt-8 pb-6 text-center"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                >
                  <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-7 w-7 text-white" />
                  </div>
                  <div className="mb-3">
                    <LiveClock />
                  </div>
                  <motion.h2
                    className="text-2xl font-bold text-white"
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 14 }}
                  >
                    {getGreeting()}
                  </motion.h2>
                </div>
                <div className="px-7 py-6 space-y-3">
                  <p className={`text-center text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Please punch in to begin your workday.
                  </p>
                  <motion.div
                    initial={{ y: 0 }} animate={{ y: [0,-2,0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    whileHover={{ y: 0 }}
                  >
                    <Button
                      onClick={() => handlePunchAction('punch_in')} disabled={loading}
                      className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg hover:shadow-emerald-200 transition-all"
                    >
                      {loading ? 'Punching In…' : 'Punch In Now'}
                    </Button>
                  </motion.div>
                  <Button
                    variant="ghost"
                    className={`w-full h-10 rounded-xl text-sm ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={async () => {
                      setLoading(true);
                      await new Promise(r => setTimeout(r, 500));
                      toast.success('Marked on leave today');
                      setActionDone(true); setMustPunchIn(false);
                      setLoading(false);
                    }}
                  >
                    On Leave Today
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </>
  );
}
