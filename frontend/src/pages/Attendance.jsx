// Attendance.jsx — redesigned to match Dashboard design language
// • LiveClock removed (lives in Dashboard)
// • Layout, fonts, card shells, header rows match Dashboard exactly
// • Holiday safe-parsing: all parseISO wrapped in try/catch
// • All v8 bug-fixes preserved (triple-fallback id, normalizeReminder, etc.)
// • v9: Apply for Leave moved to dedicated card below calendar detail
// • v9: Feature enhancements — streak counter, avg hours, weekly summary, overtime alert

import { useDark } from '@/hooks/useDark';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import EmailEventImporter from '@/components/EmailEventImporter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import api from '@/lib/api';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import {
  format,
  startOfMonth,
  endOfMonth,
  parseISO,
  isBefore,
  isAfter,
  isToday as dateFnsIsToday,
  startOfDay,
  addMinutes,
  isPast,
  differenceInMinutes,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  subDays,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  LogIn,
  LogOut,
  CheckCircle2,
  CalendarX,
  TrendingUp,
  Timer,
  Users,
  Bell,
  BellRing,
  Plus,
  Trash2,
  X,
  CalendarPlus,
  AlarmClock,
  MapPin,
  UserX,
  ShieldAlert,
  Edit2,
  FileUp,
  Loader2,
  ChevronRight,
  Info,
  Mail,
  Activity,
  Flame,
  BarChart3,
  Zap,
  Send,
  ExternalLink,
  Settings2,
  GripVertical,
  Image,
  FileText,
  StickyNote,
  Target,
  Upload,
  Camera,
  Paperclip,
  Eye,
  Download,
  MoonStar,
  Coffee,
} from 'lucide-react';
import LayoutCustomizer from '../components/layout/LayoutCustomizer';
import { usePageLayout } from '../hooks/usePageLayout';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const IST_TIMEZONE           = 'Asia/Kolkata';
const ABSENT_CUTOFF_HOUR_IST = 19;

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  amber:        '#F59E0B',
  orange:       '#F97316',
  red:          '#EF4444',
  purple:       '#8B5CF6',
  slate200:     '#E2E8F0',
};

const LEAVE_TYPES = [
  { value: 'full_day',           label: 'Full Day',           icon: '🗓️', desc: 'Absent the entire day' },
  { value: 'half_day',           label: 'Half Day',           icon: '🌗', desc: 'Off for half the day' },
  { value: 'early_leave',        label: 'Early Leave',        icon: '🚪', desc: 'Present but leaving before office hours end' },
];


// Dark palette (mirrors Dashboard)
const D = {
  bg:        '#0f172a',
  card:      '#1e293b',
  raised:    '#263348',
  border:    '#334155',
  borderDim: '#1e293b',
  text:      '#f1f5f9',
  muted:     '#94a3b8',
  dimmer:    '#64748b',
};

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATIONS (identical to Dashboard)
// ─────────────────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
};
const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
  tap:  { type: 'spring', stiffness: 500, damping: 30 },
};

// ─────────────────────────────────────────────────────────────────────────────
// SLIM SCROLL (same id-guard as Dashboard)
// ─────────────────────────────────────────────────────────────────────────────
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

// Pulse animations for punch-in / absent
if (typeof document !== 'undefined' && !document.getElementById('att-pulse-styles')) {
  const s = document.createElement('style');
  s.id = 'att-pulse-styles';
  s.textContent = `
    @keyframes att-pulse-green {
      0%,100% { box-shadow:0 0 0 0 rgba(31,175,90,0.45); }
      50%      { box-shadow:0 0 0 8px rgba(31,175,90,0); }
    }
    @keyframes att-pulse-red {
      0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0.45); }
      50%      { box-shadow:0 0 0 8px rgba(239,68,68,0); }
    }
    .punch-in-pulse { animation: att-pulse-green 1.8s ease-in-out infinite; }
    .absent-pulse   { animation: att-pulse-red   1.5s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LAYOUT PRIMITIVES (matches Dashboard)
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ children, className = '', style = {} }) {
  return (
    <div
      className={`relative bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06)] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function CardHeaderRow({ iconBg, icon, title, subtitle, action, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
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
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-1.5 flex-shrink-0">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ID HELPERS (bug-fix preserved from v8)
// ─────────────────────────────────────────────────────────────────────────────
function resolveId(r) {
  if (!r) return null;
  const id = r.id ?? r._id ?? r['_id'] ?? null;
  return id ? String(id) : null;
}
function normalizeReminder(r) {
  if (!r) return r;
  return { ...r, id: resolveId(r) };
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION STORAGE (fired reminder ids)
// ─────────────────────────────────────────────────────────────────────────────
function getFiredIds() {
  try {
    const stored = sessionStorage.getItem('att_fired_reminder_ids');
    return new Set(stored ? JSON.parse(stored) : []);
  } catch { return new Set(); }
}
function addFiredId(id) {
  try {
    const set = getFiredIds();
    set.add(String(id));
    sessionStorage.setItem('att_fired_reminder_ids', JSON.stringify([...set]));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '0h 0m';
  const mins = parseInt(minutes, 10);
  if (isNaN(mins)) return '0h 0m';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const parseDurationToHours = (str) => {
  if (!str) return 0;
  const match = String(str).match(/^(\d+)h\s*(\d+)m$/);
  if (!match) return 0;
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
};

const formatAttendanceTime = (isoStringOrDate) => {
  if (!isoStringOrDate) return '—';
  try {
    let date;
    if (isoStringOrDate instanceof Date) {
      date = isoStringOrDate;
    } else {
      const str = String(isoStringOrDate).trim();
      const hasTZ = /Z$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(str);
      date = new Date(hasTZ ? str : str + 'Z');
    }
    if (isNaN(date.getTime())) return '—';
    return formatInTimeZone(date, IST_TIMEZONE, 'hh:mm a');
  } catch { return '—'; }
};

const calculateTodayLiveDuration = (todayAtt) => {
  if (!todayAtt?.punch_in) return '0h 0m';
  if (todayAtt.punch_out) return formatDuration(todayAtt.duration_minutes);
  let start;
  if (todayAtt.punch_in instanceof Date) {
    start = todayAtt.punch_in;
  } else {
    const str = String(todayAtt.punch_in).trim();
    const hasTZ = /Z$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(str);
    start = new Date(hasTZ ? str : str + 'Z');
  }
  if (isNaN(start.getTime())) return '0h 0m';
  const diffMs = Date.now() - start.getTime();
  if (diffMs < 0) return '0h 0m';
  return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
};

const formatReminderTime = (isoStr) => {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return format(d, 'MMM d, yyyy • hh:mm a');
  } catch { return '—'; }
};

const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
};

const buildGCalURL = (reminder) => {
  try {
    const start = reminder.remind_at ? new Date(reminder.remind_at) : null;
    if (!start || isNaN(start.getTime())) return 'https://calendar.google.com';
    const end = addMinutes(start, 30);
    const fmt = (d) => format(d, "yyyyMMdd'T'HHmmss");
    return (
      'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      `&text=${encodeURIComponent(reminder.title)}` +
      `&details=${encodeURIComponent(reminder.description || '')}` +
      `&dates=${fmt(start)}/${fmt(end)}`
    );
  } catch { return 'https://calendar.google.com'; }
};

// Safe parseISO — returns null instead of throwing
const safeParseISO = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = parseISO(String(dateStr));
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};

// Safe format with parseISO — returns fallback string instead of throwing
const safeFormatDate = (dateStr, fmt, fallback = '—') => {
  const d = safeParseISO(dateStr);
  if (!d) return fallback;
  try { return format(d, fmt); } catch { return fallback; }
};

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.display_name) return data.display_name.split(',').slice(0, 3).join(',').trim();
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const extractHolidaysFromPDF = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/holidays/extract-from-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const holidays = res.data?.holidays;
  if (!Array.isArray(holidays)) throw new Error('Unexpected response from server');
  if (holidays.length === 0) throw new Error('No holidays found in the PDF');
  return holidays;
};

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD (Dashboard metric-card style)
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, unit, color, trend, isDark }) {
  return (
    <motion.div variants={itemVariants} whileHover={{ y: -3, transition: springPhysics.lift }} whileTap={{ scale: 0.985 }}>
      <div className={`rounded-2xl shadow-sm border h-full bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:shadow-md transition-all`}>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</p>
              <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-0.5">{unit}</p>
            </div>
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          </div>
          {trend && (
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate border-t border-slate-100 dark:border-slate-700 pt-2 mt-1">
              {trend}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM CALENDAR DAY
// ─────────────────────────────────────────────────────────────────────────────
function CustomDay({ date, displayMonth, attendance = {}, holidays = [] }) {
  const dateStr  = format(date, 'yyyy-MM-dd');
  const dayRecord = attendance[dateStr];
  const holiday  = (Array.isArray(holidays) ? holidays : []).find(h => h.date === dateStr);

  let ringColor = null, bgColor = null, isSpecial = false;
  if (holiday)                                        { ringColor = COLORS.amber;        bgColor = '#FEF3C720'; isSpecial = true; }
  else if (dayRecord?.status === 'leave')             { ringColor = COLORS.orange;       bgColor = '#FFF7ED20'; isSpecial = true; }
  else if (dayRecord?.status === 'absent')            { ringColor = COLORS.red;          bgColor = '#FEE2E240'; isSpecial = true; }
  else if (dayRecord?.punch_in && dayRecord?.is_late) { ringColor = COLORS.red;          bgColor = '#FEE2E220'; isSpecial = true; }
  else if (dayRecord?.punch_in)                       { ringColor = COLORS.emeraldGreen; bgColor = '#D1FAE520'; }

  const isTodayDate = dateFnsIsToday(date);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 hover:bg-slate-100 dark:hover:bg-slate-700/40 active:scale-95">
          {ringColor ? (
            <motion.span
              className="absolute flex items-center justify-center rounded-full border-2"
              style={{ width: 30, height: 30, borderColor: ringColor, backgroundColor: bgColor }}
              animate={isSpecial ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: 2.2, repeat: isSpecial ? Infinity : 0, ease: 'easeInOut' }}
            />
          ) : isTodayDate ? (
            <motion.span
              className="absolute rounded-full border-2"
              style={{ width: 30, height: 30, borderColor: COLORS.red, borderStyle: 'dashed', backgroundColor: `${COLORS.red}12` }}
              animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : null}
          <span
            className={`relative z-10 text-[13px] leading-none select-none text-slate-700 dark:text-slate-300 ${isTodayDate ? 'font-black' : 'font-medium'}`}
            style={isTodayDate && ringColor ? { color: COLORS.deepBlue } : isTodayDate && !ringColor ? { color: COLORS.red } : undefined}
          >
            {date.getDate()}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[180px]">
        <p className="font-bold mb-1">{format(date, 'MMM d, yyyy')}</p>
        {holiday
          ? <p className="font-medium" style={{ color: COLORS.amber }}>{holiday.name}</p>
          : dayRecord?.status === 'leave'
            ? <p className="font-medium" style={{ color: COLORS.orange }}>On Leave{dayRecord.leave_reason ? ` — ${dayRecord.leave_reason}` : ''}</p>
          : dayRecord?.status === 'absent'
            ? <p className="font-medium text-red-500">Absent{dayRecord.auto_marked ? ' (auto-marked)' : ''}</p>
          : dayRecord?.punch_in
            ? (<>
                <p>In: {formatAttendanceTime(dayRecord.punch_in)}</p>
                {dayRecord.punch_out && <p>Out: {formatAttendanceTime(dayRecord.punch_out)}</p>}
                <p className="font-semibold" style={{ color: COLORS.emeraldGreen }}>{formatDuration(dayRecord.duration_minutes)}</p>
                {dayRecord.is_late && <p className="text-red-500 font-semibold">Late arrival</p>}
              </>)
          : dateFnsIsToday(date)
            ? <p className="text-red-500 font-semibold">Not punched in yet</p>
          : <p className="text-slate-400">No record</p>
        }
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER POPUP (floating toast-style)
// ─────────────────────────────────────────────────────────────────────────────
function ReminderPopup({ reminder, onDismiss, isDark }) {
  return (
    <motion.div
      className="fixed top-6 right-6 z-[99999] w-96 max-w-[calc(100vw-2rem)]"
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0,  scale: 1   }}
      exit={{    opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden border"
        style={{
          background: isDark ? 'linear-gradient(135deg, #1e1b4b, #312e81)' : 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
          borderColor: isDark ? '#4c1d95' : '#ddd6fe',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: COLORS.purple }}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: [0, -15, 15, -10, 10, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.4 }}>
              <BellRing className="w-4 h-4 text-white" />
            </motion.div>
            <span className="text-white font-bold text-xs uppercase tracking-wider">Reminder</span>
          </div>
          <button onClick={onDismiss} className="text-purple-200 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="font-bold text-base leading-snug mb-1" style={{ color: isDark ? D.text : '#1e293b' }}>
            {reminder.title}
          </p>
          {reminder.description && (
            <p className="text-sm mb-2" style={{ color: isDark ? D.muted : '#475569' }}>
              {stripHtml(reminder.description)}
            </p>
          )}
          <p className="text-xs font-medium mb-4" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
            {formatReminderTime(reminder.remind_at)}
          </p>
          <div className="flex gap-2">
            <a
              href={buildGCalURL(reminder)} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: COLORS.deepBlue }}
            >
              <CalendarPlus className="w-3 h-3" /> Add to Calendar
            </a>
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-xl text-xs font-bold border-2 active:scale-95 transition-all"
              style={{
                color: isDark ? D.text : '#475569',
                backgroundColor: isDark ? D.raised : '#ffffff',
                borderColor: isDark ? D.border : '#e2e8f0',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOLIDAY DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function HolidayDetailPopup({ holiday, isAdmin, onClose, onEdit, onDelete, isDark }) {
  if (!holiday) return null;

  // Safe date formatting
  const dayOfWeek = safeFormatDate(holiday.date, 'EEEE, MMMM d, yyyy', holiday.date || '—');

  const daysLeft = (() => {
    try {
      const hDate = safeParseISO(holiday.date);
      if (!hDate) return '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      hDate.setHours(0, 0, 0, 0);
      const diff = Math.round((hDate - today) / 86400000);
      if (diff === 0) return 'Today';
      if (diff > 0)  return `In ${diff} day${diff !== 1 ? 's' : ''}`;
      return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`;
    } catch { return ''; }
  })();

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: isDark ? D.card : '#ffffff',
          border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0',
        }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'white', transform: 'translate(30%,-30%)' }} />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest mb-0.5">Public Holiday</p>
                <h2 className="text-xl font-black leading-tight">{holiday.name}</h2>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-3 p-3.5 rounded-xl border"
            style={{ backgroundColor: isDark ? `${COLORS.amber}12` : `${COLORS.amber}08`, borderColor: `${COLORS.amber}30` }}>
            <CalendarIcon className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.amber }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Date</p>
              <p className="font-semibold text-sm" style={{ color: isDark ? D.text : '#1e293b' }}>{dayOfWeek}</p>
            </div>
          </div>
          {daysLeft && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border"
              style={{ backgroundColor: isDark ? `${COLORS.deepBlue}18` : `${COLORS.deepBlue}06`, borderColor: `${COLORS.deepBlue}25` }}>
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Countdown</p>
                <p className="font-semibold text-sm" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>{daysLeft}</p>
              </div>
            </div>
          )}
          {holiday.type && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border"
              style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0' }}>
              <Info className="w-4 h-4 flex-shrink-0 text-slate-400" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Type</p>
                <p className="font-semibold text-sm capitalize" style={{ color: isDark ? D.text : '#374151' }}>{holiday.type}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-between items-center border-t"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          {isAdmin ? (
            <>
              <button
                onClick={() => { onDelete(holiday.date, holiday.name); onClose(); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-400 active:scale-95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl text-sm h-8" style={{ color: isDark ? D.muted : undefined }}>Close</Button>
                <Button onClick={() => { onEdit(holiday); onClose(); }}
                  className="font-semibold text-white rounded-xl px-4 h-8 text-sm active:scale-95"
                  style={{ backgroundColor: COLORS.amber }}>
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl text-sm h-8" style={{ color: isDark ? D.muted : undefined }}>Close</Button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ReminderDetailPopup({ reminder, isViewingOther, onClose, onDelete, onEdit, isDark }) {
  if (!reminder) return null;
  const isDue      = reminder.remind_at ? isPast(new Date(reminder.remind_at)) : false;
  const gcalUrl    = buildGCalURL(reminder);
  const descLines  = reminder.description ? stripHtml(reminder.description).split('\n').filter(Boolean) : [];
  const reminderId = resolveId(reminder);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-5 text-white relative overflow-hidden flex-shrink-0"
          style={{ background: isDue ? `linear-gradient(135deg, ${COLORS.red}, #B91C1C)` : `linear-gradient(135deg, ${COLORS.purple}, #6D28D9)` }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'white', transform: 'translate(30%,-30%)' }} />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <motion.div
                className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0"
                animate={isDue ? { scale: [1, 1.1, 1] } : {}} transition={{ duration: 1, repeat: Infinity }}
              >
                <AlarmClock className="w-6 h-6 text-white" />
              </motion.div>
              <div className="min-w-0">
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-0.5">
                  {isDue ? 'Overdue Reminder' : 'Upcoming Reminder'}
                </p>
                <h2 className="text-lg font-black leading-tight pr-2 break-words">{reminder.title}</h2>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all flex-shrink-0 mt-0.5">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3 overflow-y-auto slim-scroll flex-1" style={slimScroll}>
          <div className="flex items-center gap-3 p-3.5 rounded-xl border"
            style={{
              backgroundColor: isDark
                ? isDue ? 'rgba(239,68,68,0.12)' : 'rgba(139,92,246,0.12)'
                : isDue ? `${COLORS.red}08` : `${COLORS.purple}08`,
              borderColor: `${isDue ? COLORS.red : COLORS.purple}28`,
            }}>
            <Clock className="w-4 h-4 flex-shrink-0" style={{ color: isDue ? COLORS.red : COLORS.purple }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Scheduled For</p>
              <p className="font-semibold text-sm" style={{ color: isDark ? D.text : '#1e293b' }}>{formatReminderTime(reminder.remind_at)}</p>
              {isDue && <p className="text-xs text-red-500 font-semibold mt-0.5">This reminder is overdue</p>}
            </div>
          </div>

          {descLines.length > 0 && (
            <div className="p-3.5 rounded-xl border"
              style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Details</p>
              <div className="space-y-1.5">
                {descLines.map((line, i) => {
                  const colonIdx = line.indexOf(':');
                  if (colonIdx > 0 && colonIdx < 30) {
                    const label = line.slice(0, colonIdx);
                    const val   = line.slice(colonIdx + 1).trim();
                    if (val) return (
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="font-semibold flex-shrink-0 min-w-[100px]" style={{ color: isDark ? D.muted : '#475569' }}>{label}:</span>
                        <span style={{ color: isDark ? D.text : '#374151' }}>{val}</span>
                      </div>
                    );
                  }
                  return <p key={i} className="text-sm" style={{ color: isDark ? D.muted : '#475569' }}>{line}</p>;
                })}
              </div>
            </div>
          )}

          <a href={gcalUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 active:scale-95 transition-all"
            style={{ backgroundColor: COLORS.deepBlue }}>
            <CalendarPlus className="w-4 h-4" /> Add to Google Calendar
          </a>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-between items-center flex-shrink-0 border-t"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          {!isViewingOther ? (
            <div className="flex gap-3">
              <button onClick={() => { onEdit(reminderId); onClose(); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-500 hover:text-blue-400 active:scale-95 transition-all">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => { onDelete(reminderId); onClose(); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-400 active:scale-95 transition-all">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          ) : <div />}
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl text-sm h-8" style={{ color: isDark ? D.muted : undefined }}>Close</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER EDIT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ReminderEditModal({ reminder, isOpen, onClose, onSave, isDark }) {
  const [title,       setTitle]       = useState(reminder?.title || '');
  const [description, setDescription] = useState(reminder?.description ? stripHtml(reminder.description) : '');
  const [remindAt,    setRemindAt]    = useState(() => {
    if (!reminder?.remind_at) return '';
    try { return new Date(reminder.remind_at).toISOString().slice(0, 16); } catch { return ''; }
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setIsSaving(true);
    try {
      await onSave({
        title:       title.trim(),
        description: description.trim() || undefined,
        remind_at:   remindAt ? new Date(remindAt).toISOString() : undefined,
      });
      onClose();
    } catch { toast.error('Failed to update reminder'); }
    finally { setIsSaving(false); }
  };

  if (!isOpen) return null;

  const inputStyle = {
    backgroundColor: isDark ? D.raised : '#ffffff',
    borderColor: isDark ? D.border : '#d1d5db',
    color: isDark ? D.text : '#1e293b',
  };

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.mediumBlue}, #1d4ed8)` }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Edit Reminder</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {[
            { label: 'Title', type: 'text',           val: title,       set: setTitle,       placeholder: 'Reminder title' },
            { label: 'Remind At', type: 'datetime-local', val: remindAt,    set: setRemindAt,    placeholder: '' },
          ].map(({ label, type, val, set, placeholder }) => (
            <div key={label}>
              <label className="text-sm font-semibold mb-1.5 block text-slate-600 dark:text-slate-400">{label}</label>
              <input
                type={type} value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                className="w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-slate-600 dark:text-slate-400">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Add details..." className="w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none transition-all"
              style={inputStyle}
            />
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 border-t"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl text-sm h-9" style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm h-9 px-5">
            {isSaving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER CALENDAR MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ReminderCalendarModal({ reminders, onClose, onClickReminder, currentMonth, isDark }) {
  const [viewMonth, setViewMonth] = useState(currentMonth || new Date());
  const monthStart = startOfMonth(viewMonth);
  const monthEnd   = endOfMonth(viewMonth);

  const remindersByDate = useMemo(() => {
    const map = {};
    (Array.isArray(reminders) ? reminders : []).forEach(r => {
      if (!r.remind_at) return;
      try {
        const d = format(new Date(r.remind_at), 'yyyy-MM-dd');
        if (!map[d]) map[d] = [];
        map[d].push(r);
      } catch {}
    });
    return map;
  }, [reminders]);

  const days = [];
  const startDay = monthStart.getDay();
  for (let i = 0; i < startDay; i++) days.push(null);
  let cur = new Date(monthStart);
  while (cur <= monthEnd) { days.push(new Date(cur)); cur = new Date(cur.getTime() + 86400000); }

  const prevMonth = () => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const safeReminders = Array.isArray(reminders) ? reminders : [];
  const totalThisMonth = safeReminders.filter(r => {
    try {
      const d = r.remind_at ? new Date(r.remind_at) : null;
      return d && d.getMonth() === viewMonth.getMonth() && d.getFullYear() === viewMonth.getFullYear();
    } catch { return false; }
  }).length;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${COLORS.purple}, #6D28D9)` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><CalendarIcon className="w-4 h-4 text-white" /></div>
            <div>
              <h2 className="text-base font-bold text-white">Reminder Calendar</h2>
              <p className="text-purple-200 text-xs">{totalThisMonth} reminder{totalThisMonth !== 1 ? 's' : ''} this month</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-base font-bold">‹</button>
            <span className="text-white font-semibold text-sm w-28 text-center">{format(viewMonth, 'MMMM yyyy')}</span>
            <button onClick={nextMonth} className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-base font-bold">›</button>
            <button onClick={onClose}  className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white ml-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-y-auto p-4" style={slimScroll}>
          <div className="grid grid-cols-7 mb-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider py-1.5 text-slate-400 dark:text-slate-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="min-h-[72px]" />;
              const dateStr  = format(day, 'yyyy-MM-dd');
              const dayRems  = remindersByDate[dateStr] || [];
              const isToday  = format(new Date(), 'yyyy-MM-dd') === dateStr;
              const hasDue   = dayRems.some(r => { try { return r.remind_at ? isPast(new Date(r.remind_at)) : false; } catch { return false; } });
              const hasRems  = dayRems.length > 0;
              return (
                <div key={dateStr}
                  className="min-h-[72px] p-1.5 rounded-xl border transition-all cursor-pointer hover:shadow-sm"
                  style={{
                    backgroundColor: hasRems
                      ? hasDue ? isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2' : isDark ? 'rgba(139,92,246,0.10)' : '#f5f3ff'
                      : isToday ? isDark ? 'rgba(59,130,246,0.10)' : '#eff6ff' : isDark ? D.raised : '#ffffff',
                    borderColor: hasRems
                      ? hasDue ? isDark ? '#7f1d1d' : '#fecaca' : isDark ? '#4c1d95' : '#ddd6fe'
                      : isToday ? isDark ? '#1d4ed8' : '#bfdbfe' : isDark ? D.border : '#e2e8f0',
                  }}
                  onClick={() => dayRems.length > 0 && onClickReminder(dayRems[0])}
                >
                  <div className="text-xs font-bold mb-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: isToday ? '#3b82f6' : 'transparent',
                      color: isToday ? '#fff' : hasRems ? (hasDue ? COLORS.red : COLORS.purple) : isDark ? D.dimmer : '#94a3b8',
                    }}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayRems.slice(0, 3).map((r, idx) => {
                      const isDueR = (() => { try { return r.remind_at ? isPast(new Date(r.remind_at)) : false; } catch { return false; } })();
                      const rid    = resolveId(r);
                      return (
                        <div key={rid || idx}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded truncate leading-tight"
                          style={{
                            backgroundColor: isDueR ? isDark ? 'rgba(239,68,68,0.22)' : '#fee2e2' : isDark ? `${COLORS.purple}22` : `${COLORS.purple}15`,
                            color: isDueR ? COLORS.red : COLORS.purple,
                          }}>
                          {r.remind_at ? format(new Date(r.remind_at), 'h:mma') : '--'} {r.title}
                        </div>
                      );
                    })}
                    {dayRems.length > 3 && (
                      <div className="text-[9px] font-bold px-1 cursor-pointer hover:underline" style={{ color: COLORS.purple }}>
                        +{dayRems.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-between items-center flex-shrink-0 border-t"
          style={{ borderColor: isDark ? D.border : '#f1f5f9', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          <p className="text-xs font-medium text-slate-400">{safeReminders.length} total · click a chip to open details</p>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl text-sm h-8" style={{ color: isDark ? D.muted : undefined }}>Close</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LATE WORKING POPUP
// ─────────────────────────────────────────────────────────────────────────────
function LateWorkingPopup({ onContinue, onPunchOut, onRemindLater, isDark }) {
  return (
    <motion.div
      className="fixed inset-0 z-[99998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.88, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        {/* Header */}
        <div className="px-6 py-5 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1e40af, #7c3aed)' }}>
          <div className="absolute top-0 right-0 w-28 h-28 rounded-full opacity-10"
            style={{ background: 'white', transform: 'translate(35%,-35%)' }} />
          <div className="relative flex items-center gap-3">
            <motion.div
              className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0"
              animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <MoonStar className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-0.5">After Hours</p>
              <h2 className="text-xl font-black text-white">Working Late?</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm mb-5 leading-relaxed" style={{ color: isDark ? D.muted : '#475569' }}>
            You are working beyond office hours (7:15 PM IST). Would you like to continue as overtime or punch out now?
          </p>
          <div className="space-y-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={onContinue}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: COLORS.mediumBlue }}
            >
              <Zap className="w-4 h-4" /> Continue as Overtime
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={onPunchOut}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: COLORS.red }}
            >
              <LogOut className="w-4 h-4" /> Punch Out Now
            </motion.button>
            <button
              onClick={onRemindLater}
              className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold border transition-all"
              style={{
                borderColor: isDark ? D.border : '#e2e8f0',
                color: isDark ? D.muted : '#64748b',
                backgroundColor: 'transparent',
              }}
            >
              <Bell className="w-3.5 h-3.5" /> Remind Me in 15 min
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE PROOF MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceProofModal({ onClose, onSave, isDark, existingProof = null }) {
  const [note,      setNote]      = useState(existingProof?.note || '');
  const [photos,    setPhotos]    = useState([]);
  const [docs,      setDocs]      = useState([]);
  const [isSaving,  setIsSaving]  = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const photoRef = useRef(null);
  const docRef   = useRef(null);

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files || []);
    const previews = files.map(f => ({ file: f, url: URL.createObjectURL(f), name: f.name, size: f.size }));
    setPhotos(prev => [...prev, ...previews].slice(0, 5));
    if (photoRef.current) photoRef.current.value = '';
  };

  const handleDocChange = (e) => {
    const files = Array.from(e.target.files || []);
    const items = files.map(f => ({ file: f, name: f.name, size: f.size, type: f.type }));
    setDocs(prev => [...prev, ...items].slice(0, 5));
    if (docRef.current) docRef.current.value = '';
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const formData = new FormData();
      if (note.trim()) formData.append('note', note.trim());
      photos.forEach(p => formData.append('photos', p.file));
      docs.forEach(d => formData.append('documents', d.file));
      await onSave(formData, note.trim());
      onClose();
    } catch { toast.error('Failed to save proof'); }
    finally { setIsSaving(false); }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));
  const removeDoc   = (idx) => setDocs(prev => prev.filter((_, i) => i !== idx));
  const fmtSize = (bytes) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 text-white flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Paperclip className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black">Attendance Proof</h2>
                <p className="text-blue-200 text-xs">Attach photos, documents & notes</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto slim-scroll flex-1" style={slimScroll}>

          {/* Note */}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" /> Note / Description
            </label>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Visited client office, worked on project X, site inspection…"
              rows={3}
              className="w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none transition-all"
              style={{ backgroundColor: isDark ? D.raised : '#fff', borderColor: isDark ? D.border : '#d1d5db', color: isDark ? D.text : '#1e293b' }}
            />
          </div>

          {/* Photos */}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Photos <span className="font-normal text-slate-400">(max 5)</span>
            </label>
            <input ref={photoRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
            <button
              onClick={() => photoRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed transition-all hover:border-blue-400 w-full justify-center"
              style={{ borderColor: isDark ? D.border : '#cbd5e1', color: isDark ? D.muted : '#64748b', backgroundColor: isDark ? D.raised : '#f8fafc' }}
            >
              <Upload className="w-4 h-4" /> Upload Photos
            </button>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden aspect-square border group cursor-pointer"
                    style={{ borderColor: isDark ? D.border : '#e2e8f0' }}
                    onClick={() => setPreviewUrl(p.url)}
                  >
                    <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removePhoto(i); }}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Documents <span className="font-normal text-slate-400">(PDF, DOC, etc.)</span>
            </label>
            <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" multiple onChange={handleDocChange} className="hidden" />
            <button
              onClick={() => docRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed transition-all hover:border-emerald-400 w-full justify-center"
              style={{ borderColor: isDark ? D.border : '#cbd5e1', color: isDark ? D.muted : '#64748b', backgroundColor: isDark ? D.raised : '#f8fafc' }}
            >
              <Upload className="w-4 h-4" /> Upload Documents
            </button>
            {docs.length > 0 && (
              <div className="mt-3 space-y-2">
                {docs.map((d, i) => (
                  <div key={i}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border"
                    style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0' }}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: isDark ? D.text : '#1e293b' }}>{d.name}</p>
                      <p className="text-xs" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{fmtSize(d.size)}</p>
                    </div>
                    <button onClick={() => removeDoc(i)} className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <X className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Existing proof preview */}
          {existingProof && (existingProof.note || existingProof.photos?.length > 0 || existingProof.documents?.length > 0) && (
            <div className="rounded-xl overflow-hidden border"
              style={{ borderColor: isDark ? 'rgba(31,175,90,0.3)' : '#bbf7d0' }}>
              <div className="px-4 py-2 flex items-center gap-2"
                style={{ background: isDark ? 'rgba(31,175,90,0.1)' : '#f0fdf4' }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Previously Saved</span>
              </div>
              <div className="p-3 text-sm" style={{ color: isDark ? D.muted : '#475569' }}>
                {existingProof.note && <p className="mb-1">📝 {existingProof.note}</p>}
                {existingProof.photos?.length > 0 && <p>📷 {existingProof.photos.length} photo(s)</p>}
                {existingProof.documents?.length > 0 && <p>📄 {existingProof.documents.length} document(s)</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0 border-t"
          style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl text-sm h-9" style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
          <Button
            onClick={handleSave} disabled={isSaving || (photos.length === 0 && docs.length === 0 && !note.trim())}
            className="font-semibold text-white rounded-xl px-5 h-9"
            style={{ backgroundColor: COLORS.deepBlue }}
          >
            {isSaving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : <><Paperclip className="w-3.5 h-3.5 mr-1.5" />Save Proof</>}
          </Button>
        </div>

        {/* Photo preview overlay */}
        <AnimatePresence>
          {previewUrl && (
            <motion.div
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 rounded-3xl"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPreviewUrl(null)}
            >
              <img src={previewUrl} alt="preview" className="max-w-full max-h-full rounded-2xl object-contain" style={{ maxHeight: '80%' }} />
              <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
function GoalStatusBadge({ status, isDark }) {
  const cfg = {
    achieved: { emoji: '✅', label: 'Goal Achieved', color: COLORS.emeraldGreen, bg: isDark ? 'rgba(31,175,90,0.15)' : '#f0fdf4', border: isDark ? '#14532d' : '#bbf7d0' },
    partial:  { emoji: '⚠️', label: 'Partial',       color: COLORS.amber,        bg: isDark ? 'rgba(245,158,11,0.12)' : '#fffbeb', border: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a' },
    not_met:  { emoji: '❌', label: 'Not Met',        color: COLORS.red,          bg: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', border: isDark ? '#7f1d1d' : '#fecaca' },
    none:     { emoji: '—',  label: 'No Data',        color: '#94a3b8',           bg: isDark ? D.raised : '#f8fafc',               border: isDark ? D.border : '#e2e8f0' },
  };
  const c = cfg[status] || cfg.none;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
      style={{ backgroundColor: c.bg, borderColor: c.border, color: c.color }}
    >
      {c.emoji} {c.label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function Attendance() {
  const { user, hasPermission, logout } = useAuth();
  const isDark = useDark();
  const isAdmin         = user?.role === 'admin';
  const canViewRankings = hasPermission('can_view_staff_rankings');

  // ── Cross-visibility ───────────────────────────────────────────────────────
  // view_other_attendance is an array of user IDs that this user can view
  const crossVisAttendance  = user?.permissions?.view_other_attendance || [];
  const hasCrossVisAttendance = crossVisAttendance.length > 0;
  // canSwitchUser: admin can switch to any user; others only if they have cross-vis
  const canSwitchUser = isAdmin || hasCrossVisAttendance;

  // ── Layout customizer ─────────────────────────────────────────────────────
  const ATT_SECTIONS = ['today_status', 'stat_cards', 'holidays_reminders', 'calendar_area'];
  const ATT_LABELS = {
    today_status:       { name: "Today's Status",      icon: '🕐', desc: 'Punch-in / punch-out card' },
    stat_cards:         { name: 'Statistics',           icon: '📊', desc: 'Monthly hours, streak, rank' },
    holidays_reminders: { name: 'Upcoming Holidays', icon: '🗓️', desc: 'Upcoming holidays' },
    calendar_area:      { name: 'Calendar & History',   icon: '📅', desc: 'Attendance calendar and recent records' },
  };
  const { order: attOrder, moveSection: attMove, resetOrder: attReset } = usePageLayout('attendance', ATT_SECTIONS);
  const [showLayoutCustomizer, setShowLayoutCustomizer] = React.useState(false);

  // ── State ─────────────────────────────────────────────────────────────────
  const [loading,            setLoading]            = useState(false);
  const [selectedDate,       setSelectedDate]       = useState(new Date());
  const [selectedUserId,     setSelectedUserId]     = useState(null);
  const [attendanceHistory,  setAttendanceHistory]  = useState([]);
  const [todayAttendance,    setTodayAttendance]    = useState(null);
  const [mySummary,          setMySummary]          = useState(null);
  const [holidays,           setHolidays]           = useState([]);
  const [pendingHolidays,    setPendingHolidays]    = useState([]);
  const [allUsers,           setAllUsers]           = useState([]);
  const [tasksCompleted,     setTasksCompleted]     = useState(0);
  const [myRank,             setMyRank]             = useState('—');
  const [locationCache,      setLocationCache]      = useState({});
  const [absentLoading,      setAbsentLoading]      = useState(false);
  const [absentSummary,      setAbsentSummary]      = useState([]);
  const [dataError,          setDataError]          = useState(null);
  const absentWarningShownRef = useRef(false);
  const [leaveType,          setLeaveType]          = useState('full_day');
  const [earlyLeaveTime,     setEarlyLeaveTime]     = useState('');
  const [showPunchInModal,  setShowPunchInModal]  = useState(false);
  const [modalActionDone,   setModalActionDone]   = useState(false);
  const [geoError,          setGeoError]          = useState(null);
  const [geoChecking,       setGeoChecking]       = useState(false);
  const [userLocation,      setUserLocation]      = useState(null);
  const [isWithinGeofence,  setIsWithinGeofence]  = useState(null);

  // GEO-FENCE CONFIG — Office: 21.18796, 72.81375 (Surat)
  const OFFICE_LAT        = 21.18796;
  const OFFICE_LNG        = 72.81375;
  const GEOFENCE_RADIUS_M = 200;
  const [showLeaveForm,     setShowLeaveForm]     = useState(false);
  const [showHolidayModal,  setShowHolidayModal]  = useState(false);
  const [calendarOpenIdx,   setCalendarOpenIdx]   = useState(null);
  const [leaveFrom,         setLeaveFrom]         = useState(null);
  const [leaveTo,           setLeaveTo]           = useState(null);
  const [leaveReason,       setLeaveReason]       = useState('');
  const [holidayRows,       setHolidayRows]       = useState([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
  const [liveDuration,      setLiveDuration]      = useState('0h 0m');

  const [reminders,          setReminders]          = useState([]);
  const [firedReminder,      setFiredReminder]      = useState(null);
  const [showReminderForm,   setShowReminderForm]   = useState(false);
  const [reminderTitle,      setReminderTitle]      = useState('');
  const [reminderDesc,       setReminderDesc]       = useState('');
  const [reminderDatetime,   setReminderDatetime]   = useState('');

  const [pdfImporting,       setPdfImporting]       = useState(false);
  const [editingHoliday,     setEditingHoliday]     = useState(null);
  const [editName,           setEditName]           = useState('');
  const [editDate,           setEditDate]           = useState('');
  const [editLoading,        setEditLoading]        = useState(false);
  const pdfInputRef    = useRef(null);
  const trademarkPdfRef = useRef(null);

  const [exportingPDF,       setExportingPDF]       = useState(false);
  const [trademarkData,      setTrademarkData]      = useState(null);
  const [trademarkLoading,   setTrademarkLoading]   = useState(false);

  const [selectedHolidayDetail,  setSelectedHolidayDetail]  = useState(null);
  const [selectedReminderDetail, setSelectedReminderDetail] = useState(null);
  const [isEditModalOpen,        setIsEditModalOpen]        = useState(false);
  const [editingReminder,        setEditingReminder]        = useState(null);
  const [showEmailImporter,      setShowEmailImporter]      = useState(false);
  const [showReminderCalendar,   setShowReminderCalendar]   = useState(false);

  // ── NEW: Activity Tracking ─────────────────────────────────────────────────
  const [lastActivity,         setLastActivity]         = useState(Date.now());

  // ── NEW: Late Working Popup ───────────────────────────────────────────────
  const [showLatePopup,        setShowLatePopup]        = useState(false);
  const [latePopupShown,       setLatePopupShown]       = useState(false);
  const [isOvertime,           setIsOvertime]           = useState(false);
  const latePopupDateRef = useRef(format(new Date(), 'yyyy-MM-dd'));

  // ── NEW: Proof Upload ─────────────────────────────────────────────────────
  const [showProofModal,       setShowProofModal]       = useState(false);
  const [attendanceProof,      setAttendanceProof]      = useState(null);   // { note, photos[], documents[] }

  // ── NEW: Goal-Based Attendance ─────────────────────────────────────────────
  // daily_goal: 6 hours OR 5 tasks
  const GOAL_HOURS = 6;
  const GOAL_TASKS = 5;

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isEveryoneView = isAdmin && selectedUserId === 'everyone';
  // isViewingOther: admin viewing specific user OR non-admin with cross-vis permission
  const isViewingOther = canSwitchUser && !!selectedUserId && selectedUserId !== 'everyone';
  const todayDateStr   = format(new Date(), 'yyyy-MM-dd');

  const todayIsHoliday = useMemo(() =>
    (Array.isArray(holidays) ? holidays : []).some(h => h.date === todayDateStr && h.status === 'confirmed'),
    [holidays, todayDateStr]
  );

  const todayHolidayName = useMemo(() =>
    (Array.isArray(holidays) ? holidays : []).find(h => h.date === todayDateStr && h.status === 'confirmed')?.name || '',
    [holidays, todayDateStr]
  );

  const displayTodayAttendance = useMemo(() => {
    if (isViewingOther)
      return (Array.isArray(attendanceHistory) ? attendanceHistory : []).find(a => a.date === todayDateStr) || null;
    return todayAttendance;
  }, [isViewingOther, attendanceHistory, todayAttendance, todayDateStr]);

  const displayLiveDuration = useMemo(() => {
    if (isViewingOther) return calculateTodayLiveDuration(displayTodayAttendance);
    return liveDuration;
  }, [isViewingOther, displayTodayAttendance, liveDuration]);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetchData();
    fetchReminders(undefined, controller.signal);
    return () => controller.abort();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!isViewingOther && todayAttendance) {
      const shouldClose = todayAttendance.punch_in || todayAttendance.status === 'leave'
        || todayAttendance.status === 'absent' || todayIsHoliday || modalActionDone;
      if (shouldClose) {
        setShowPunchInModal(false);
        setGeoError(null); setUserLocation(null); setIsWithinGeofence(null);
        return;
      }
      const timer = setTimeout(() => {
        setShowPunchInModal(true);
        // Auto-check location when modal opens
        setGeoError(null); setUserLocation(null); setIsWithinGeofence(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [todayAttendance, isViewingOther, todayIsHoliday, modalActionDone]);

  // Block app body scroll when punch-in modal is open
  useEffect(() => {
    if (showPunchInModal) {
      document.body.style.overflow = 'hidden';
      document.body.style.pointerEvents = 'none';
      // The modal itself re-enables pointer events via inline style
    } else {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, [showPunchInModal]);

  useEffect(() => {
    setLiveDuration(calculateTodayLiveDuration(todayAttendance));
    if (todayAttendance?.punch_in && !todayAttendance?.punch_out) {
      const interval = setInterval(() => setLiveDuration(calculateTodayLiveDuration(todayAttendance)), 60000);
      return () => clearInterval(interval);
    }
  }, [todayAttendance]);

  // Reminder popup checker
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const persistedFiredIds = getFiredIds();
      for (const r of (Array.isArray(reminders) ? reminders : [])) {
        const rid = resolveId(r);
        if (!rid || r.is_dismissed || persistedFiredIds.has(rid) || !r.remind_at) continue;
        const due = new Date(r.remind_at);
        if (isNaN(due.getTime())) continue;
        const diff = differenceInMinutes(due, now);
        if (diff <= 0 && diff >= -2) { addFiredId(rid); setFiredReminder(r); break; }
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [reminders]);

  useEffect(() => {
    const resolveLocations = async () => {
      const toResolve = [];
      for (const record of (Array.isArray(attendanceHistory) ? attendanceHistory : []).slice(0, 50)) {
        if (record.location?.latitude && record.location?.longitude) {
          const key = `${record.location.latitude},${record.location.longitude}`;
          if (!locationCache[key]) toResolve.push({ key, lat: record.location.latitude, lng: record.location.longitude });
        }
        if (record.punch_out_location?.latitude && record.punch_out_location?.longitude) {
          const key = `${record.punch_out_location.latitude},${record.punch_out_location.longitude}`;
          if (!locationCache[key]) toResolve.push({ key, lat: record.punch_out_location.latitude, lng: record.punch_out_location.longitude });
        }
      }
      if (toResolve.length === 0) return;
      const results = {};
      for (const item of toResolve) results[item.key] = await reverseGeocode(item.lat, item.lng);
      setLocationCache(prev => ({ ...prev, ...results }));
    };
    resolveLocations();
  }, [attendanceHistory]); // eslint-disable-line

  useEffect(() => {
    if (isViewingOther || isEveryoneView) return;
    const checkAbsentWarning = () => {
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
      if (nowIST.getHours() === 18 && nowIST.getMinutes() >= 30 && !absentWarningShownRef.current) {
        if (!todayAttendance?.punch_in && todayAttendance?.status !== 'leave' && !todayIsHoliday) {
          toast.warning('You have not punched in today. Auto-absent marks at 7:00 PM IST.', { duration: 10000, id: 'absent-warning' });
          absentWarningShownRef.current = true;
        }
      }
    };
    checkAbsentWarning();
    const id = setInterval(checkAbsentWarning, 60000);
    return () => clearInterval(id);
  }, [todayAttendance, isViewingOther, isEveryoneView]); // eslint-disable-line

  // ── NEW: Global Activity Tracking ─────────────────────────────────────────
  useEffect(() => {
    const update = () => setLastActivity(Date.now());
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, update, { passive: true }));
    return () => events.forEach(ev => window.removeEventListener(ev, update));
  }, []);

  // ── NEW: Reset latePopupShown on next day ────────────────────────────────
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (latePopupDateRef.current !== todayStr) {
      latePopupDateRef.current = todayStr;
      setLatePopupShown(false);
      setIsOvertime(false);
    }
  });

  // ── NEW: Late Working Popup checker (every 60s) ─────────────────────────
  useEffect(() => {
    if (isViewingOther || isEveryoneView) return;
    const check = () => {
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
      const isPastThreshold = nowIST.getHours() > 19 || (nowIST.getHours() === 19 && nowIST.getMinutes() >= 15);
      if (
        isPastThreshold &&
        todayAttendance?.punch_in &&
        !todayAttendance?.punch_out &&
        !latePopupShown &&
        !todayIsHoliday &&
        todayAttendance?.status !== 'leave'
      ) {
        setShowLatePopup(true);
        setLatePopupShown(true);
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [todayAttendance, latePopupShown, isViewingOther, isEveryoneView, todayIsHoliday]); // eslint-disable-line

  // ── NEW: Smart Auto Punch-Out (every 60s) ────────────────────────────────
  useEffect(() => {
    if (isViewingOther || isEveryoneView) return;
    const check = () => {
      if (!todayAttendance?.punch_in || todayAttendance?.punch_out) return;
      if (isOvertime) return;
      const now = Date.now();
      const inactiveMinutes = (now - lastActivity) / 60000;
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
      const shiftEndIST = new Date(nowIST);
      shiftEndIST.setHours(19, 0, 0, 0);
      const afterShift = nowIST.getTime() > shiftEndIST.getTime() + 120 * 60000; // 7 PM + 2h grace
      if (inactiveMinutes > 60 && afterShift) {
        handleAutoPunchOut();
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [todayAttendance, lastActivity, isOvertime, isViewingOther, isEveryoneView]); // eslint-disable-line

  // ── Data Fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (overrideUserId = undefined) => {
    setLoading(true); setDataError(null);
    // For admin: can target anyone or 'everyone'. For cross-vis users: target specific permitted user.
    const rawTargetId    = canSwitchUser ? (overrideUserId !== undefined ? overrideUserId : selectedUserId) : null;
    const isEveryoneReq  = isAdmin && rawTargetId === 'everyone';
    const isOtherReq     = !!rawTargetId && rawTargetId !== 'everyone'; // works for both admin and cross-vis
    const resolvedUserId = isEveryoneReq ? null : isOtherReq ? rawTargetId : null;

    try {
      let historyUrl;
      if (isEveryoneReq)       historyUrl = '/attendance/history';
      else if (resolvedUserId) historyUrl = `/attendance/history?user_id=${resolvedUserId}`;
      else                     historyUrl = `/attendance/history?user_id=${user?.id}`;

      const requests = [
        api.get(historyUrl).catch(() => ({ data: [] })),
        (isOtherReq || isEveryoneReq) ? Promise.resolve(null) : api.get('/attendance/my-summary').catch(() => ({ data: null })),
        api.get('/attendance/today').catch(() => ({ data: null })),
        api.get('/tasks').catch(() => ({ data: [] })),
        api.get('/holidays').catch(() => ({ data: [] })),
        api.get('/reports/performance-rankings?period=monthly').catch(() => ({ data: [] })),
      ];
      const [historyRes, summaryRes, todayRes, tasksRes, holidaysRes, rankingRes] = await Promise.all(requests);

      const allHolidays = holidaysRes.data || [];
      // Show holidays that are confirmed OR have no status (manually added holidays
      // often come without an explicit 'confirmed' status from the backend)
      const allConfirmed = (Array.isArray(allHolidays) ? allHolidays : []).filter(h => h.status !== 'rejected');
      setHolidays(allConfirmed);

      // If no holidays exist at all, trigger a background auto-sync so the
      // Indian public holiday calendar self-populates without any admin action.
      if (allConfirmed.length === 0) {
        api.post('/holidays/auto-sync').then(async () => {
          // Re-fetch after sync so the calendar shows holidays immediately
          const refreshed = await api.get('/holidays').catch(() => ({ data: [] }));
          setHolidays((refreshed.data || []).filter(h => h.status !== 'rejected'));
        }).catch(() => {/* non-fatal — holidays will appear on next page load */});
      }
      if (isAdmin) setPendingHolidays((Array.isArray(allHolidays) ? allHolidays : []).filter(h => h.status === 'pending'));

      if (isAdmin) {
        try { const usersRes = await api.get('/users'); setAllUsers(usersRes.data || []); } catch {}
      } else if (hasCrossVisAttendance) {
        // Non-admin with cross-visibility: always keep permitted user list fresh
        try {
          const usersRes = await api.get('/users');
          const permitted = (usersRes.data || []).filter(u =>
            crossVisAttendance.includes(u.id || u._id)
          );
          setAllUsers(permitted);
        } catch {}
      }

      const history = historyRes.data || [];
      setAttendanceHistory(Array.isArray(history) ? history : []);

      if (todayRes.data !== null && todayRes.data !== undefined) {
        setTodayAttendance(todayRes.data); setDataError(null);
      } else {
        setDataError('Backend unreachable — it may be waking up. Please wait and retry.');
      }

      const safeHistory = Array.isArray(history) ? history : [];

      if (isOtherReq) {
        const monthlySummary = {};
        safeHistory.forEach(a => {
          const m = a.date?.slice(0, 7); if (!m) return;
          if (!monthlySummary[m]) monthlySummary[m] = { total_minutes: 0, days_present: 0 };
          if (a.punch_in && a.status === 'present') { monthlySummary[m].total_minutes += a.duration_minutes || 0; monthlySummary[m].days_present += 1; }
        });
        setMySummary({
          total_minutes:   safeHistory.reduce((s, a) => s + (a.status === 'present' ? (a.duration_minutes || 0) : 0), 0),
          total_days:      safeHistory.filter(a => a.punch_in && a.status === 'present').length,
          monthly_summary: Object.entries(monthlySummary).map(([month, d]) => {
            const h = Math.floor(d.total_minutes / 60), m = d.total_minutes % 60;
            return { month, ...d, total_hours: `${h}h ${m}m` };
          }),
        });
      } else if (isEveryoneReq) {
        const total_minutes = safeHistory.reduce((s, a) => s + (a.status === 'present' ? (a.duration_minutes || 0) : 0), 0);
        setMySummary({ total_minutes, total_days: safeHistory.filter(a => a.punch_in && a.status === 'present').length, monthly_summary: [] });
      } else {
        setMySummary(summaryRes?.data ?? null);
      }

      const allTasksData = tasksRes.data || [];
      const safeTasksData = Array.isArray(allTasksData) ? allTasksData : [];
      const relevantTasks = isOtherReq ? safeTasksData.filter(t => t.assigned_to === rawTargetId) : safeTasksData;
      setTasksCompleted(relevantTasks.filter(t => t.status === 'completed').length);

      const rankingList = Array.isArray(rankingRes.data) ? rankingRes.data : (rankingRes.data?.rankings || rankingRes.data?.data || []);
      const rankUserId  = isOtherReq ? rawTargetId : user?.id;
      const myEntry     = (!isEveryoneReq && rankUserId) ? rankingList.find(r => r.user_id === rankUserId) : null;
      setMyRank(myEntry ? `#${myEntry.rank}` : isEveryoneReq ? 'N/A' : '—');

      if (isAdmin) {
        try {
          const absentRes = await api.get(`/attendance/absent-summary?month=${format(new Date(), 'yyyy-MM')}`);
          setAbsentSummary(absentRes.data?.data || []);
        } catch { setAbsentSummary([]); }
      }
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || 'Network error';
      setDataError(msg);
    } finally { setLoading(false); }
  }, [selectedUserId, isAdmin, canViewRankings, user?.id, allUsers.length]); // eslint-disable-line

  const fetchReminders = useCallback(async (overrideUserId = undefined, signal = undefined) => {
    try {
      const uid = overrideUserId !== undefined ? overrideUserId : (isViewingOther ? selectedUserId : null);
      if (uid === 'everyone') return;
      const url = uid ? `/email/reminders?user_id=${uid}` : '/email/reminders';
      const res = await api.get(url, signal ? { signal } : {});
      const raw = Array.isArray(res.data) ? res.data : [];
      setReminders(raw.map(normalizeReminder));
    } catch (err) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      console.error('fetchReminders error:', err);
    }
  }, [isViewingOther, selectedUserId]);

  // ── Punch Action ───────────────────────────────────────────────────────────
  // ── HAVERSINE DISTANCE (metres) ──────────────────────────────────────────
  const haversineMetres = useCallback((lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // ── CHECK GEO-FENCE ───────────────────────────────────────────────────────
  const checkGeofence = useCallback(async () => {
    setGeoChecking(true); setGeoError(null);
    return new Promise((resolve) => {
      if (!navigator?.geolocation) {
        setGeoError('GPS not available on this device.');
        setIsWithinGeofence(false); setGeoChecking(false);
        resolve({ ok: false, location: null });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const dist = haversineMetres(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
          const within = dist <= GEOFENCE_RADIUS_M;
          setUserLocation({ latitude, longitude, accuracy, distance: Math.round(dist) });
          setIsWithinGeofence(within);
          setGeoChecking(false);
          if (!within) {
            setGeoError(`You are ${Math.round(dist)}m from the office. Geo-fence radius is ${GEOFENCE_RADIUS_M}m.`);
          }
          resolve({ ok: within, location: { latitude, longitude, accuracy } });
        },
        (err) => {
          const msg = err.code === 1 ? 'Location permission denied. Please allow GPS access.'
            : err.code === 2 ? 'GPS unavailable. Check your device settings.'
            : 'Location request timed out. Try again.';
          setGeoError(msg); setIsWithinGeofence(false); setGeoChecking(false);
          resolve({ ok: false, location: null });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }, [haversineMetres]);

  const handlePunchAction = useCallback(async (action) => {
    setLoading(true); setGeoError(null);
    try {
      // Always attempt GPS location for both punch-in and punch-out
      const { ok, location } = await checkGeofence();

      // For punch-in: enforce geo-fence ONLY when we successfully obtained
      // the user's location AND it is outside the allowed radius.
      // If geolocation is unavailable (permission denied, HTTP context, GPS
      // hardware missing), we still allow the punch so the web app is not
      // completely blocked — the server records the attempt without coordinates.
      if (action === 'punch_in' && !ok && location !== null) {
        // We have a valid location reading but it's outside the fence
        setLoading(false);
        return; // geoError is already set — modal will show it
      }

      const response = await api.post('/attendance', { action, location });
      if (action === 'punch_in') {
        toast.success('Punched in successfully ✓');
        setModalActionDone(true); setShowPunchInModal(false);
      } else {
        const duration = response.data?.duration || 0;
        toast.success(`Punched out — ${formatDuration(duration)}`);
        // If "Keep me signed in" was active, end the session on punch-out
        if (localStorage.getItem('taskosphere_keep_signed_in') === 'true') {
          setTimeout(() => logout(), 1500); // small delay so toast is visible
        }
      }
      await fetchData();
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance');
    } finally { setLoading(false); }
  }, [fetchData, checkGeofence]);

  // ── Leave ──────────────────────────────────────────────────────────────────
  const handleApplyLeave = useCallback(async () => {
    if (!leaveFrom) { toast.error('Select a leave start date'); return; }
    if (leaveType === 'early_leave' && !earlyLeaveTime) {
      toast.error('Please specify your early departure time'); return;
    }
    const isPartialDay = leaveType !== 'full_day'; // half_day + early_leave are partial
    const effectiveTo = isPartialDay ? leaveFrom : (leaveTo || leaveFrom);
    try {
      await api.post('/attendance/apply-leave', {
        from_date:        format(leaveFrom, 'yyyy-MM-dd'),
        to_date:          format(effectiveTo, 'yyyy-MM-dd'),
        reason:           leaveReason || 'Leave Applied',
        leave_type:       leaveType,
        early_leave_time: leaveType === 'early_leave' ? earlyLeaveTime : undefined,
      });
      toast.success('Leave request submitted');
      setShowLeaveForm(false);
      setLeaveFrom(null); setLeaveTo(null); setLeaveReason('');
      setLeaveType('full_day'); setEarlyLeaveTime('');
      await fetchData();
    } catch { toast.error('Failed to submit leave request'); }
  }, [leaveFrom, leaveTo, leaveReason, leaveType, earlyLeaveTime, fetchData]);

  // ── Holidays ───────────────────────────────────────────────────────────────
  const handleAddHolidays = useCallback(async () => {
    const validRows = holidayRows.filter(r => r.name.trim() && r.date);
    if (validRows.length === 0) { toast.error('Add at least one holiday'); return; }
    let added = 0; const errors = [];
    for (const row of validRows) {
      try { await api.post('/holidays', { date: row.date, name: row.name.trim(), type: 'manual' }); added++; }
      catch (err) { errors.push(`${row.name}: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`); }
    }
    if (added > 0) toast.success(`${added} holiday${added > 1 ? 's' : ''} saved`);
    if (errors.length > 0) errors.forEach(e => toast.error(e, { duration: 7000 }));
    setShowHolidayModal(false);
    setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
    await fetchData();
  }, [holidayRows, fetchData]);

  const handlePdfImport = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    setPdfImporting(true);
    try {
      const extracted = await extractHolidaysFromPDF(file);
      if (extracted.length === 0) { toast.error('No holidays found in the PDF'); return; }
      setHolidayRows(extracted.map(h => ({ name: h.name, date: h.date })));
      toast.success(`${extracted.length} holidays extracted — review and save`);
    } catch (err) { toast.error(`PDF extraction failed: ${err.message}`); }
    finally { setPdfImporting(false); }
  }, []);

  const handleEditHolidaySave = useCallback(async () => {
    if (!editName.trim() || !editDate) { toast.error('Name and date required'); return; }
    setEditLoading(true);
    try {
      await api.delete(`/holidays/${editingHoliday.date}`);
      await api.post('/holidays', { date: editDate, name: editName.trim(), type: editingHoliday.type || 'manual' });
      toast.success('Holiday updated'); setEditingHoliday(null); await fetchData();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to update holiday'); }
    finally { setEditLoading(false); }
  }, [editingHoliday, editName, editDate, fetchData]);

  const handleDeleteHoliday = useCallback(async (date, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/holidays/${date}`); toast.success(`"${name}" deleted`); await fetchData(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Failed to delete holiday'); }
  }, [fetchData]);

  const handleHolidayDecision = useCallback(async (holidayDate, decision) => {
    try {
      await api.patch(`/holidays/${holidayDate}/status`, { status: decision });
      toast.success(decision === 'confirmed' ? 'Holiday confirmed' : 'Holiday rejected');
      await fetchData();
    } catch { toast.error('Failed to update holiday'); }
  }, [fetchData]);

  const handleMarkAbsentBulk = useCallback(async (targetDate = null) => {
    setAbsentLoading(true);
    try {
      const body = targetDate ? { date: targetDate } : {};
      const res  = await api.post('/attendance/mark-absent-bulk', body);
      const { marked, skipped, reason, date: markedDate } = res.data;
      if (skipped) { toast.info(`Skipped: ${reason}`); }
      else { toast.success(`Absent marked for ${markedDate}: ${marked} user(s)`); await fetchData(); }
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to mark absent'); }
    finally { setAbsentLoading(false); }
  }, [fetchData]);

  // ── NEW: Auto Punch-Out ───────────────────────────────────────────────────
  const handleAutoPunchOut = useCallback(async () => {
    try {
      await api.post('/attendance/punch-out', { auto: true, reason: 'inactive_after_shift' });
      toast.warning('Auto punch-out applied due to inactivity after shift hours', { duration: 8000, id: 'auto-punch-out' });
      await fetchData();
    } catch (err) {
      // Fallback: try standard punch action
      try {
        await api.post('/attendance', { action: 'punch_out', auto: true });
        toast.warning('Auto punch-out applied due to inactivity', { duration: 8000, id: 'auto-punch-out' });
        await fetchData();
      } catch { /* silent — already punched out or network issue */ }
    }
  }, [fetchData]);

  // ── NEW: Save Attendance Proof ────────────────────────────────────────────
  const handleSaveProof = useCallback(async (formData, note) => {
    try {
      // Try multipart upload; graceful fallback to note-only if backend not ready
      try {
        await api.post('/attendance/proof', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } catch {
        // Backend may not have this endpoint yet — store locally in state
        const photoCount  = formData.getAll?.('photos')?.length  || 0;
        const docCount    = formData.getAll?.('documents')?.length || 0;
        setAttendanceProof({ note, photos: Array(photoCount).fill(null), documents: Array(docCount).fill(null), saved_at: new Date().toISOString() });
        toast.success('Proof saved locally');
        return;
      }
      await fetchData();
      toast.success('Attendance proof uploaded successfully');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to upload proof');
      throw err;
    }
  }, [fetchData]);

  // ── Reminders ──────────────────────────────────────────────────────────────
  const handleCreateReminder = useCallback(async () => {
    if (!reminderTitle.trim() || !reminderDatetime) { toast.error('Title and date/time are required'); return; }
    try {
      const res = await api.post('/email/save-as-reminder', {
        event_id:    `manual-${Date.now()}`,         // required by backend model
        title:       reminderTitle.trim(),
        description: reminderDesc.trim() || '',
        remind_at:   reminderDatetime ? new Date(reminderDatetime).toISOString() : undefined,
      });
      toast.success(res.data?.status === 'already_exists' ? 'Reminder already exists' : 'Reminder set');
      setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null);
      // Re-fetch reminders since the response is {status, id} not a full reminder doc
      await fetchReminders();
    } catch { toast.error('Failed to create reminder'); }
  }, [reminderTitle, reminderDesc, reminderDatetime]);

  const handleEmailEventForReminder = useCallback((event) => {
    setReminderTitle(event.title || '');
    if (event.date) { const timeStr = event.time || '10:00'; setReminderDatetime(`${event.date}T${timeStr}`); }
    const descLines = [];
    if (event.event_type)  descLines.push(`Event type: ${event.event_type}`);
    if (event.organizer)   descLines.push(`Organiser: ${event.organizer}`);
    if (event.location)    descLines.push(`Location: ${event.location}`);
    if (event.description) descLines.push(`Notes: ${event.description.slice(0, 200)}`);
    if (event.source_from) descLines.push(`From: ${event.source_from}`);
    setReminderDesc(descLines.join('\n'));
    setShowReminderForm(true);
  }, []);

  const handleEditReminder = useCallback((reminderId) => {
    const reminder = (Array.isArray(reminders) ? reminders : []).find(r => resolveId(r) === reminderId);
    if (reminder) { setEditingReminder(reminder); setIsEditModalOpen(true); }
  }, [reminders]);

  const handleUpdateReminder = useCallback(async (updates) => {
    const reminderId = resolveId(editingReminder);
    if (!reminderId) { toast.error('Cannot update: reminder ID missing'); return; }
    try {
      await api.patch(`/email/reminders/${reminderId}`, updates);
      await fetchReminders();
      toast.success('Reminder updated');
      setIsEditModalOpen(false); setEditingReminder(null);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) { toast.error('Reminder not found — refreshing'); await fetchReminders(); }
      else { toast.error('Failed to update reminder'); }
    }
  }, [editingReminder, fetchReminders]);

  const handleTrademarkPdfUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (trademarkPdfRef.current) trademarkPdfRef.current.value = '';
    setTrademarkLoading(true); setTrademarkData(null);
    try {
      const formData = new FormData(); formData.append('file', file);
      const res  = await api.post('/documents/extract-trademark-notice', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = res.data; setTrademarkData(data);
      if (data.application_no) {
        const appName = data.applicant_name ? ` — ${data.applicant_name}` : '';
        const cls     = data.class ? ` (Class ${data.class})` : '';
        setReminderTitle(`${data.document_type || 'Trademark Hearing'} — App No. ${data.application_no}${cls}${appName}`);
      }
      if (data.hearing_date) setReminderDatetime(`${data.hearing_date}T10:00`);
      const descLines = [];
      if (data.application_no)   descLines.push(`Application No: ${data.application_no}`);
      if (data.class)            descLines.push(`Class: ${data.class}`);
      if (data.applicant_name)   descLines.push(`Applicant: ${data.applicant_name}`);
      if (data.recipient_name)   descLines.push(`Agent/Recipient: ${data.recipient_name}`);
      if (data.application_date) descLines.push(`Application Date: ${data.application_date}`);
      if (data.used_since)       descLines.push(`Used Since: ${data.used_since}`);
      if (data.hearing_date)     descLines.push(`Hearing Date: ${data.hearing_date}`);
      if (data.letter_date)      descLines.push(`Notice Date: ${data.letter_date}`);
      if (data.brand_name)       descLines.push(`Brand/Mark: ${data.brand_name}`);
      descLines.push('Hearing via Video Conferencing (Dynamic Utilities → Cause List → Trade Marks Show Cause & Review)');
      setReminderDesc(descLines.join('\n'));
      toast.success('Details extracted — form auto-filled');
    } catch (err) { toast.error(`PDF extraction failed: ${err?.response?.data?.detail || err?.message || 'Failed to read PDF'}`); }
    finally { setTrademarkLoading(false); }
  }, []);

  const handleDeleteReminder = useCallback(async (id) => {
    if (!id) { toast.error('Cannot delete: reminder ID is missing'); return; }
    const idStr      = String(id);
    const reminder   = (Array.isArray(reminders) ? reminders : []).find(r => resolveId(r) === idStr);
    const reminderId = resolveId(reminder) || idStr;
    if (!reminderId) { toast.error('Cannot delete: could not resolve reminder ID'); return; }
    setReminders(prev => (Array.isArray(prev) ? prev : []).filter(r => resolveId(r) !== reminderId));
    try {
      await api.delete(`/email/reminders/${reminderId}`);
      toast.success('Reminder removed');
    } catch (err) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) {
        try { await api.patch(`/email/reminders/${reminderId}`, { is_dismissed: true }); toast.success('Reminder removed'); }
        catch { toast.success('Reminder removed'); }
      } else {
        toast.error('Failed to delete reminder — please try again');
        await fetchReminders();
      }
    }
    if (reminder?.source === 'email_auto') {
      try { await api.patch(`/email/reminders/${reminderId}`, { is_dismissed: true }).catch(() => {}); } catch {}
    }
  }, [reminders, fetchReminders]);

  const handleDismissPopup = useCallback(async () => {
    if (!firedReminder) return;
    const reminderId = resolveId(firedReminder);
    if (reminderId) {
      try { await api.patch(`/email/reminders/${reminderId}`, { is_dismissed: true }); } catch {}
      setReminders(prev =>
        (Array.isArray(prev) ? prev : []).map(r =>
          resolveId(r) === reminderId ? { ...r, is_dismissed: true } : r
        )
      );
      addFiredId(reminderId);
    }
    setFiredReminder(null);
  }, [firedReminder]);

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    setExportingPDF(true);
    try {
      let employeeName;
      if (isAdmin && selectedUserId === 'everyone') employeeName = 'All Employees';
      else if (canSwitchUser && selectedUserId) employeeName = (Array.isArray(allUsers) ? allUsers : []).find(u => u.id === selectedUserId)?.full_name || 'Employee';
      else employeeName = user?.full_name || 'Staff Member';

      const doc = new jsPDF();
      doc.setFillColor(13, 59, 102); doc.rect(0, 0, 210, 24, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.setFont(undefined, 'bold');
      doc.text('TASKOSPHERE — ATTENDANCE REPORT', 10, 10);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')} IST`, 10, 19);
      doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(`Employee: ${employeeName}`, 10, 34);
      doc.setFont(undefined, 'normal'); doc.setFontSize(11);
      doc.text(`Report Period: ${format(selectedDate, 'MMMM yyyy')}`, 10, 42);
      doc.setDrawColor(200, 200, 200); doc.line(10, 47, 200, 47);

      const safeHistory  = Array.isArray(attendanceHistory) ? attendanceHistory : [];
      const absentCount  = safeHistory.filter(a => a.status === 'absent' && a.date?.startsWith(format(selectedDate, 'yyyy-MM'))).length;
      doc.setFontSize(11);
      doc.text(`Days Present : ${safeHistory.filter(a => a.punch_in && a.status === 'present').length}`, 10, 64);
      doc.text(`Days Absent  : ${absentCount}`, 10, 72);
      doc.text(`Late Arrivals: ${safeHistory.filter(a => a.is_late).length}`, 10, 80);
      doc.line(10, 88, 200, 88);
      doc.setFont(undefined, 'bold'); doc.setFontSize(11);
      doc.text('Attendance Log (Last 15 Records):', 10, 97);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
      doc.text('DATE', 10, 106); doc.text('STATUS', 48, 106); doc.text('PUNCH IN', 82, 106); doc.text('PUNCH OUT', 118, 106); doc.text('DURATION', 158, 106);
      doc.setDrawColor(180, 180, 180); doc.line(10, 108, 200, 108); doc.setTextColor(0, 0, 0);
      let y = 116;
      safeHistory.slice(0, 15).forEach((record, index) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const dateObj = safeParseISO(record.date);
        if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(10, y - 5, 190, 9, 'F'); }
        doc.setFontSize(9);
        doc.text(dateObj ? format(dateObj, 'dd MMM yyyy') : (record.date || '—'), 10, y);
        const statusLabel = record.status === 'absent' ? 'ABSENT' : record.status === 'leave' ? 'LEAVE' : record.punch_in ? 'PRESENT' : '—';
        doc.text(statusLabel, 48, y);
        doc.text(record.status === 'absent' ? '—' : formatAttendanceTime(record.punch_in), 82, y);
        doc.text(record.status === 'absent' ? '—' : record.punch_out ? formatAttendanceTime(record.punch_out) : 'Ongoing', 118, y);
        doc.text(record.status === 'absent' ? '—' : formatDuration(record.duration_minutes), 158, y);
        y += 10;
      });
      doc.setFontSize(8); doc.setTextColor(150, 150, 150);
      doc.text('Taskosphere HR Management System | Confidential', 10, 288);
      doc.save(`Attendance_${employeeName.replace(/\s+/g, '_')}_${format(selectedDate, 'MMM_yyyy')}.pdf`);
      toast.success('PDF exported');
    } catch { toast.error('Failed to export PDF'); }
    finally { setExportingPDF(false); }
  }, [isAdmin, selectedUserId, allUsers, user, selectedDate, attendanceHistory]);

  // ── Memoised derived values ────────────────────────────────────────────────
  const monthAttendance = useMemo(() => {
    const start = startOfMonth(selectedDate), end = endOfMonth(selectedDate);
    let atts = (Array.isArray(attendanceHistory) ? attendanceHistory : []).filter(a => {
      if (!isViewingOther && !isEveryoneView && a.user_id && a.user_id !== user?.id) return false;
      const d = safeParseISO(a.date);
      return d && d >= start && d <= end;
    });
    if (displayTodayAttendance) {
      const todayStr = displayTodayAttendance.date;
      if (!atts.some(a => a.date === todayStr)) {
        const todayD = safeParseISO(todayStr);
        if (todayD && todayD >= start && todayD <= end) atts = [...atts, displayTodayAttendance];
      }
    }
    return atts;
  }, [attendanceHistory, displayTodayAttendance, selectedDate]);

  const monthTotalMinutes      = useMemo(() => monthAttendance.filter(a => a.status === 'present').reduce((s, a) => s + (a.duration_minutes || 0), 0), [monthAttendance]);
  const monthDaysPresent       = useMemo(() => monthAttendance.filter(a => a.punch_in && a.status === 'present').length, [monthAttendance]);
  const monthDaysAbsent        = useMemo(() => monthAttendance.filter(a => a.status === 'absent').length, [monthAttendance]);
  const totalDaysLateThisMonth = useMemo(() => monthAttendance.filter(a => a.punch_in && a.is_late).length, [monthAttendance]);
  const isTodaySelected        = dateFnsIsToday(selectedDate);

  const selectedAttendance = isTodaySelected
    ? displayTodayAttendance
    : (Array.isArray(attendanceHistory) ? attendanceHistory : []).find(a => a.date === format(selectedDate, 'yyyy-MM-dd')) || null;

  const selectedHoliday = (Array.isArray(holidays) ? holidays : []).find(h => h.date === format(selectedDate, 'yyyy-MM-dd')) || null;

  const attendanceMap = useMemo(() => {
    const map = {};
    const records = Array.isArray(attendanceHistory) ? attendanceHistory : [];
    // For calendar, only map own records when not in everyone/other view
    const filtered = isEveryoneView
      ? records
      : isViewingOther
        ? records
        : records.filter(a => !a.user_id || a.user_id === user?.id);
    filtered.forEach(a => { map[a.date] = a; });
    if (displayTodayAttendance) map[displayTodayAttendance.date] = displayTodayAttendance;
    return map;
  }, [attendanceHistory, displayTodayAttendance, isEveryoneView, isViewingOther, user?.id]);

  const viewedUserName = useMemo(() => {
    if (isEveryoneView) return 'All Employees';
    if (!isViewingOther) return null;
    return (Array.isArray(allUsers) ? allUsers : []).find(u => u.id === selectedUserId)?.full_name || 'Selected Employee';
  }, [isEveryoneView, isViewingOther, selectedUserId, allUsers]);

  const progressPct = useMemo(() => {
    const hrs = parseDurationToHours(displayLiveDuration);
    return Math.min(100, Math.round((hrs / 8.5) * 100));
  }, [displayLiveDuration]);

  const upcomingReminders = useMemo(() =>
    (Array.isArray(reminders) ? reminders : [])
      .filter(r => r.is_dismissed !== true)   // null / undefined → show; only true → hide
      .sort((a, b) => {
        const da = a.remind_at ? new Date(a.remind_at) : new Date(0);
        const db = b.remind_at ? new Date(b.remind_at) : new Date(0);
        return da - db;
      }),
    [reminders]
  );

  const recentAttendance = useMemo(() => {
    const safe = Array.isArray(attendanceHistory) ? attendanceHistory : [];
    if (isEveryoneView) return safe.slice(0, 25);
    // When viewing self (admin or not), ensure only own records show
    if (!isViewingOther) {
      return safe.filter(a => !a.user_id || a.user_id === user?.id).slice(0, 15);
    }
    return safe.slice(0, 15);
  }, [attendanceHistory, isEveryoneView, isViewingOther, user?.id]);

  const userMap = useMemo(() => {
    const map = {};
    (Array.isArray(allUsers) ? allUsers : []).forEach(u => { map[u.id] = u.full_name; });
    return map;
  }, [allUsers]);

  const getLocationLabel = useCallback((record, type = 'in') => {
    const loc = type === 'in' ? record.location : record.punch_out_location;
    if (!loc?.latitude || !loc?.longitude) return null;
    const key = `${loc.latitude},${loc.longitude}`;
    return locationCache[key] || `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}`;
  }, [locationCache]);

  const absentCountdown = useMemo(() => {
    if (isViewingOther || isEveryoneView || todayAttendance === null) return null;
    if (todayIsHoliday) return null;
    if (todayAttendance?.punch_in || todayAttendance?.status === 'leave' || todayAttendance?.status === 'absent') return null;
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
    if (nowIST.getHours() < 17) return null;
    const cutoff = new Date(nowIST); cutoff.setHours(ABSENT_CUTOFF_HOUR_IST, 0, 0, 0);
    const msLeft = cutoff.getTime() - nowIST.getTime();
    if (msLeft <= 0) return 'You have been marked as absent for today.';
    const hLeft = Math.floor(msLeft / 3600000), mLeft = Math.floor((msLeft % 3600000) / 60000);
    return hLeft > 0 ? `${hLeft}h ${mLeft}m until auto-absent at 7:00 PM` : `${mLeft} minute(s) until auto-absent at 7:00 PM`;
  }, [todayAttendance, isViewingOther, isEveryoneView, todayIsHoliday]);

  // ── FEATURE ENHANCEMENT: Attendance Streak ──────────────────────────────────
  const attendanceStreak = useMemo(() => {
    const safeHistory = Array.isArray(attendanceHistory) ? attendanceHistory : [];
    const presentDates = safeHistory
      .filter(a => a.punch_in && a.status === 'present')
      .map(a => a.date)
      .sort()
      .reverse();
    if (presentDates.length === 0) return 0;
    let streak = 0;
    let checkDate = new Date();
    // If today has attendance or is ongoing, count it
    const todayStr = format(checkDate, 'yyyy-MM-dd');
    const hasTodayRecord = displayTodayAttendance?.punch_in && displayTodayAttendance?.status === 'present';
    if (hasTodayRecord) {
      streak = 1;
      checkDate = subDays(checkDate, 1);
    }
    // Walk backward
    for (let i = 0; i < 365; i++) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      const dayOfWeek = checkDate.getDay();
      // Skip Sundays (or holidays)
      const isHolidayDate = (Array.isArray(holidays) ? holidays : []).some(h => h.date === dateStr);
      if (dayOfWeek === 0 || isHolidayDate) {
        checkDate = subDays(checkDate, 1);
        continue;
      }
      if (presentDates.includes(dateStr)) {
        streak++;
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }
    }
    return streak;
  }, [attendanceHistory, displayTodayAttendance, holidays]);

  // ── FEATURE ENHANCEMENT: Average Daily Hours ───────────────────────────────
  const avgDailyHours = useMemo(() => {
    const presentDays = monthAttendance.filter(a => a.punch_in && a.status === 'present' && a.duration_minutes > 0);
    if (presentDays.length === 0) return '0.0';
    const totalMins = presentDays.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    return (totalMins / presentDays.length / 60).toFixed(1);
  }, [monthAttendance]);

  // ── FEATURE ENHANCEMENT: This Week's Summary ──────────────────────────────
  const weekSummary = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const safeHistory = Array.isArray(attendanceHistory) ? attendanceHistory : [];

    return weekDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const record = safeHistory.find(a => a.date === dateStr)
        || (displayTodayAttendance?.date === dateStr ? displayTodayAttendance : null);
      const isHol = (Array.isArray(holidays) ? holidays : []).some(h => h.date === dateStr);
      const isFuture = isAfter(day, today);
      const isToday = dateFnsIsToday(day);

      let status = 'none';
      if (isHol) status = 'holiday';
      else if (record?.status === 'absent') status = 'absent';
      else if (record?.status === 'leave') status = 'leave';
      else if (record?.punch_in) status = 'present';
      else if (isFuture) status = 'future';

      return {
        day: format(day, 'EEE'),
        dateStr,
        status,
        isToday,
        hours: record?.duration_minutes ? (record.duration_minutes / 60).toFixed(1) : null,
      };
    });
  }, [attendanceHistory, displayTodayAttendance, holidays]);

  // ── FEATURE ENHANCEMENT: Overtime detection ─────────────────────────────────
  const overtimeToday = useMemo(() => {
    if (!displayTodayAttendance?.punch_in) return null;
    const hrs = parseDurationToHours(displayLiveDuration);
    if (hrs > 10) return { hours: hrs, level: 'high' };
    if (hrs > 8.5) return { hours: hrs, level: 'mild' };
    return null;
  }, [displayTodayAttendance, displayLiveDuration]);

  // ── NEW: Overtime minutes (for StatCard) ─────────────────────────────────
  const overtimeMinutes = useMemo(() => {
    if (!displayTodayAttendance?.punch_in) return 0;
    const shiftEndMinutes = 19 * 60; // 7:00 PM in minutes from midnight
    let punchInDate;
    try {
      const str = String(displayTodayAttendance.punch_in).trim();
      const hasTZ = /Z$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(str);
      punchInDate = new Date(hasTZ ? str : str + 'Z');
    } catch { return 0; }
    if (isNaN(punchInDate.getTime())) return 0;

    let punchOutDate;
    if (displayTodayAttendance.punch_out) {
      try {
        const str = String(displayTodayAttendance.punch_out).trim();
        const hasTZ = /Z$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(str);
        punchOutDate = new Date(hasTZ ? str : str + 'Z');
      } catch { punchOutDate = new Date(); }
    } else {
      punchOutDate = new Date();
    }

    // Convert shift end to UTC equivalent for today
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
    const shiftEndUTC = new Date(punchOutDate);
    shiftEndUTC.setHours(0, 0, 0, 0);
    // shift end = today 7 PM IST = today 13:30 UTC
    const shiftEndToday = new Date(nowIST);
    shiftEndToday.setHours(19, 0, 0, 0);
    const shiftEndUTCms = shiftEndToday.getTime() - (5.5 * 3600000); // IST offset

    const otMs = Math.max(0, punchOutDate.getTime() - shiftEndUTCms);
    return Math.floor(otMs / 60000);
  }, [displayTodayAttendance, displayLiveDuration]);

  // ── NEW: Goal-Based Attendance Status ────────────────────────────────────
  const goalStatus = useMemo(() => {
    if (!displayTodayAttendance?.punch_in) return 'none';
    const hoursWorked = parseDurationToHours(displayLiveDuration);
    const hoursGoalMet = hoursWorked >= GOAL_HOURS;
    const tasksGoalMet = tasksCompleted >= GOAL_TASKS;
    if (hoursGoalMet && tasksGoalMet) return 'achieved';
    if (hoursGoalMet || tasksGoalMet)  return 'partial';
    // Partial threshold: at least 50% of either goal
    if (hoursWorked >= GOAL_HOURS * 0.5 || tasksCompleted >= GOAL_TASKS * 0.5) return 'partial';
    return 'not_met';
  }, [displayTodayAttendance, displayLiveDuration, tasksCompleted, GOAL_HOURS, GOAL_TASKS]);
  const inputStyle = {
    backgroundColor: isDark ? D.raised : '#ffffff',
    borderColor: isDark ? D.border : '#d1d5db',
    color: isDark ? D.text : '#1e293b',
  };
  const inputCls = `w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all`;

  const monthHolidaysGrid = useMemo(() =>
    (Array.isArray(holidays) ? holidays : []).filter(h => {
      try { return safeFormatDate(h.date, 'yyyy-MM') === format(selectedDate, 'yyyy-MM'); }
      catch { return false; }
    }),
    [holidays, selectedDate]
  );

  // Count upcoming leaves from attendance history
  const upcomingLeaves = useMemo(() => {
    const safe = Array.isArray(attendanceHistory) ? attendanceHistory : [];
    return safe.filter(a => {
      if (a.status !== 'leave') return false;
      const d = safeParseISO(a.date);
      return d && (dateFnsIsToday(d) || isAfter(d, new Date()));
    }).sort((a, b) => {
      const da = safeParseISO(a.date) || new Date(0);
      const db = safeParseISO(b.date) || new Date(0);
      return da - db;
    });
  }, [attendanceHistory]);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      {/* ── Floating reminder popup ── */}
      <AnimatePresence>
        {firedReminder && <ReminderPopup reminder={firedReminder} onDismiss={handleDismissPopup} isDark={isDark} />}
      </AnimatePresence>

      {/* ── Holiday detail ── */}
      <AnimatePresence>
        {selectedHolidayDetail && (
          <HolidayDetailPopup
            holiday={selectedHolidayDetail} isAdmin={isAdmin} isDark={isDark}
            onClose={() => setSelectedHolidayDetail(null)}
            onEdit={(h) => { setEditingHoliday(h); setEditName(h.name); setEditDate(h.date); }}
            onDelete={handleDeleteHoliday}
          />
        )}
      </AnimatePresence>

      {/* ── NEW: Late Working Popup ── */}
      <AnimatePresence>
        {showLatePopup && (
          <LateWorkingPopup
            isDark={isDark}
            onContinue={() => { setIsOvertime(true); setShowLatePopup(false); toast.success('Overtime mode activated — auto punch-out disabled', { id: 'overtime-on' }); }}
            onPunchOut={() => { setShowLatePopup(false); handlePunchAction('punch_out'); }}
            onRemindLater={() => {
              setShowLatePopup(false);
              setTimeout(() => {
                setShowLatePopup(true);
                setLatePopupShown(false); // allow re-trigger after timeout
                setLatePopupShown(true);
              }, 15 * 60 * 1000);
              toast.info('Will remind you again in 15 minutes');
            }}
          />
        )}
      </AnimatePresence>

      {/* ── NEW: Attendance Proof Modal ── */}
      <AnimatePresence>
        {showProofModal && (
          <AttendanceProofModal
            isDark={isDark}
            existingProof={attendanceProof}
            onClose={() => setShowProofModal(false)}
            onSave={handleSaveProof}
          />
        )}
      </AnimatePresence>

      {/* ── Reminder detail ── */}
      <AnimatePresence>
        {selectedReminderDetail && (
          <ReminderDetailPopup
            reminder={selectedReminderDetail} isViewingOther={isViewingOther} isDark={isDark}
            onClose={() => setSelectedReminderDetail(null)}
            onDelete={handleDeleteReminder}
            onEdit={handleEditReminder}
          />
        )}
      </AnimatePresence>

      {/* ── Reminder edit ── */}
      <AnimatePresence>
        {isEditModalOpen && editingReminder && (
          <ReminderEditModal
            isOpen={isEditModalOpen} isDark={isDark}
            onClose={() => { setIsEditModalOpen(false); setEditingReminder(null); }}
            reminder={editingReminder}
            onSave={handleUpdateReminder}
          />
        )}
      </AnimatePresence>

      {/* ── Reminder calendar ── */}
      <AnimatePresence>
        {showReminderCalendar && (
          <ReminderCalendarModal
            reminders={upcomingReminders} isDark={isDark}
            currentMonth={selectedDate}
            onClose={() => setShowReminderCalendar(false)}
            onClickReminder={(r) => { setSelectedReminderDetail(r); setShowReminderCalendar(false); }}
          />
        )}
      </AnimatePresence>

      {/* ── Layout Customizer Panel ─────────────────────────────────────────── */}
      <LayoutCustomizer
        isOpen={showLayoutCustomizer}
        onClose={() => setShowLayoutCustomizer(false)}
        order={attOrder}
        sectionLabels={ATT_LABELS}
        onDragEnd={attMove}
        onReset={attReset}
        isDark={isDark}
      />

      <motion.div
        className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden"
        style={{ background: isDark ? D.bg : '#f8fafc' }}
        variants={containerVariants} initial="hidden" animate="visible"
      >
        <div className="max-w-[1600px] mx-auto w-full space-y-6">
        {/* ══ PAGE HEADER ══════════════════════════════════════════════════════ */}
        <motion.div variants={itemVariants}>
          <div
            className="relative overflow-hidden rounded-2xl px-6 py-5 w-full"
            style={{
              background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
              boxShadow: '0 8px 32px rgba(13,59,102,0.25)',
            }}
          >
            <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
              style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">
                  {format(new Date(), 'EEEE, MMMM d, yyyy')}
                </p>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {isAdmin ? 'Attendance Management' : isViewingOther ? 'Team Attendance View' : 'My Attendance'}
                </h1>
                <p className="text-white/60 text-sm mt-1">
                  {isAdmin
                    ? 'Manage team attendance — auto-absent marks at 7:00 PM IST daily'
                    : isViewingOther
                      ? `Viewing attendance for ${allUsers.find(u=>u.id===selectedUserId)?.full_name || 'team member'}`
                      : 'Track your daily hours — auto-absent at 7:00 PM if not punched in'}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {canSwitchUser && (
                  <select
                    className="rounded-xl px-3.5 py-2 text-sm font-medium cursor-pointer border focus:outline-none focus:ring-2 focus:ring-white/40 transition-all"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      borderColor: 'rgba(255,255,255,0.25)',
                      color: '#ffffff',
                      backdropFilter: 'blur(8px)',
                    }}
                    value={selectedUserId || ''}
                    onChange={e => {
                      const val = e.target.value || null;
                      setSelectedUserId(val);
                      fetchData(val);
                      fetchReminders(val);
                    }}
                  >
                    <option value="" style={{ color: '#1e293b', background: '#ffffff' }}>
                      {user?.full_name ? `${user.full_name} (Me)` : 'My Attendance'}
                    </option>
                    {(Array.isArray(allUsers) ? allUsers : []).filter(u => u.id !== user?.id).map(u => (
                      <option key={u.id} value={u.id} style={{ color: '#1e293b', background: '#ffffff' }}>
                        {u.full_name}
                      </option>
                    ))}
                    {/* Everyone option at the bottom */}
                    {isAdmin && (
                      <option value="everyone" style={{ color: '#1e293b', background: '#ffffff' }}>Everyone (All Users)</option>
                    )}
                  </select>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleMarkAbsentBulk()} disabled={absentLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                    style={{ backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    {absentLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Marking…</> : 'Mark Absent'}
                  </button>
                )}
                <button
                  onClick={handleExportPDF} disabled={exportingPDF}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)', color: '#ffffff' }}
                >
                  {exportingPDF ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Exporting…</> : 'Export PDF'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══ ALERT BANNERS ════════════════════════════════════════════════════ */}
        {dataError && (
          <motion.div variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
            style={{
              borderColor: isDark ? '#7f1d1d' : '#fecaca',
              backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
            }}>
            <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="font-semibold text-red-500">Connection error: </span>
            <span style={{ color: isDark ? '#fca5a5' : '#dc2626' }} className="flex-1">{dataError}</span>
            <button onClick={() => fetchData()} className="text-red-400 text-xs font-bold underline hover:text-red-300">Retry</button>
          </motion.div>
        )}

        {absentCountdown && !isViewingOther && !isEveryoneView && (
          <motion.div variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 absent-pulse"
            style={{ borderColor: isDark ? '#991b1b' : '#fca5a5', backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : '#fff1f2' }}>
            <motion.div animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 0.9, repeat: Infinity }}>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </motion.div>
            <span className="text-sm font-semibold flex-1" style={{ color: isDark ? '#f87171' : '#991b1b' }}>
              Not punched in today — {absentCountdown}
            </span>
            <Button size="sm" onClick={() => handlePunchAction('punch_in')}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg px-3 h-8 text-xs">
              <LogIn className="w-3.5 h-3.5 mr-1" /> Punch In Now
            </Button>
          </motion.div>
        )}

        {(isViewingOther || isEveryoneView) && (
          <motion.div variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
            style={{ borderColor: isDark ? '#1d4ed8' : '#bfdbfe', backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff' }}>
            <Users className="w-4 h-4 text-blue-500" />
            <span className="font-semibold" style={{ color: isDark ? '#93c5fd' : '#1e40af' }}>
              {isEveryoneView ? 'Viewing all employees' : <>Viewing: <span className="underline decoration-dotted">{viewedUserName}</span></>}
            </span>
            <button className="ml-auto text-blue-400 hover:text-blue-300 text-xs font-semibold underline"
              onClick={() => { setSelectedUserId(null); fetchData(null); fetchReminders(null); }}>
              Back to my data
            </button>
          </motion.div>
        )}

        {/* ══ OVERTIME ALERT (Feature Enhancement) ═════════════════════════════ */}
        {overtimeToday && !isViewingOther && !isEveryoneView && (
          <motion.div variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
            style={{
              borderColor: overtimeToday.level === 'high'
                ? isDark ? '#7f1d1d' : '#fecaca'
                : isDark ? 'rgba(245,158,11,0.35)' : '#fde68a',
              backgroundColor: overtimeToday.level === 'high'
                ? isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2'
                : isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb',
            }}>
            <Zap className="w-4 h-4 flex-shrink-0" style={{ color: overtimeToday.level === 'high' ? COLORS.red : COLORS.amber }} />
            <span className="font-semibold flex-1" style={{
              color: overtimeToday.level === 'high'
                ? isDark ? '#f87171' : '#991b1b'
                : isDark ? '#fbbf24' : '#92400e',
            }}>
              {overtimeToday.level === 'high'
                ? `You've been working for ${overtimeToday.hours.toFixed(1)}h — consider wrapping up!`
                : `${overtimeToday.hours.toFixed(1)}h logged — you've exceeded the 8.5h daily goal`}
            </span>
          </motion.div>
        )}

        {/* ══ NEW: GOAL STATUS BANNER ═══════════════════════════════════════════ */}
        {!isViewingOther && !isEveryoneView && displayTodayAttendance?.punch_in && goalStatus !== 'none' && (
          <motion.div variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
            style={{
              borderColor: goalStatus === 'achieved'
                ? isDark ? '#14532d' : '#bbf7d0'
                : goalStatus === 'partial'
                  ? isDark ? 'rgba(245,158,11,0.3)' : '#fde68a'
                  : isDark ? '#7f1d1d' : '#fecaca',
              backgroundColor: goalStatus === 'achieved'
                ? isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4'
                : goalStatus === 'partial'
                  ? isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb'
                  : isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
            }}>
            <Target className="w-4 h-4 flex-shrink-0" style={{
              color: goalStatus === 'achieved' ? COLORS.emeraldGreen
                : goalStatus === 'partial' ? COLORS.amber
                : COLORS.red
            }} />
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold" style={{
                color: goalStatus === 'achieved'
                  ? isDark ? '#4ade80' : '#15803d'
                  : goalStatus === 'partial'
                    ? isDark ? '#fbbf24' : '#92400e'
                    : isDark ? '#f87171' : '#991b1b',
              }}>
                Daily Goal:
              </span>
              <GoalStatusBadge status={goalStatus} isDark={isDark} />
              <span className="text-xs" style={{ color: isDark ? D.muted : '#64748b' }}>
                {displayLiveDuration} worked · {tasksCompleted} task{tasksCompleted !== 1 ? 's' : ''} done
                {' '}· Target: {GOAL_HOURS}h or {GOAL_TASKS} tasks
              </span>
            </div>
          </motion.div>
        )}

        {/* ══ NEW: OVERTIME MODE INDICATOR ══════════════════════════════════════ */}
        {isOvertime && !isViewingOther && !isEveryoneView && displayTodayAttendance?.punch_in && !displayTodayAttendance?.punch_out && (
          <motion.div variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
            style={{ borderColor: isDark ? '#1d4ed8' : '#bfdbfe', backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff' }}>
            <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <Coffee className="w-4 h-4 text-blue-500" />
            </motion.div>
            <span className="font-semibold flex-1" style={{ color: isDark ? '#93c5fd' : '#1e40af' }}>
              Overtime mode active — {overtimeMinutes > 0 ? `${formatDuration(overtimeMinutes)} OT logged` : 'tracking started'} · Auto punch-out disabled
            </span>
            <button
              onClick={() => { setIsOvertime(false); toast.info('Overtime mode deactivated'); }}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline"
            >
              Deactivate
            </button>
          </motion.div>
        )}

        {/* ── Customize Layout button ─────────────────────────────────── */}
        <div className="flex justify-end">
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
        </div>

        {/* ── Ordered sections ─────────────────────────────────────────────── */}
        {attOrder.map((sectionId) => {

          /* ══ TODAY STATUS ═════════════════════════════════════════════════ */
          if (sectionId === 'today_status') return (
            <React.Fragment key="today_status">
              {!isEveryoneView && (
          <motion.div variants={itemVariants}>
            <SectionCard>
              <CardHeaderRow
                iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                icon={<Activity className="h-4 w-4 text-blue-500" />}
                title={isTodaySelected ? (isViewingOther ? `${viewedUserName}'s Status` : "Today's Attendance") : format(selectedDate, 'EEEE, MMM d')}
                subtitle={isViewingOther ? 'Read-only view' : 'Real-time • Auto-absent at 7:00 PM IST'}
              />
              <div className="p-5">
                {/* Holiday notice */}
                {todayIsHoliday && (
                  <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border"
                    style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.10)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.25)' : '#fde68a' }}>
                    <CalendarIcon className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.amber }} />
                    <p className="text-sm font-semibold" style={{ color: isDark ? '#fbbf24' : '#92400e' }}>
                      Today is a public holiday{todayHolidayName ? ` — ${todayHolidayName}` : ''}
                    </p>
                  </div>
                )}

                {/* Absent notice */}
                {displayTodayAttendance?.status === 'absent' && (
                  <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border"
                    style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : '#fef2f2', borderColor: isDark ? '#7f1d1d' : '#fecaca' }}>
                    <X className="w-4 h-4 flex-shrink-0 text-red-500" />
                    <p className="text-sm font-semibold text-red-500">
                      Marked absent today{displayTodayAttendance.auto_marked ? ' (auto-marked at 7:00 PM)' : ''}
                    </p>
                  </div>
                )}

                {/* Leave notice */}
                {displayTodayAttendance?.status === 'leave' && (
                  <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border"
                    style={{ backgroundColor: isDark ? 'rgba(249,115,22,0.08)' : '#fff7ed', borderColor: isDark ? '#7c2d12' : '#fed7aa' }}>
                    <CalendarX className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.orange }} />
                    <p className="text-sm font-semibold" style={{ color: isDark ? '#fb923c' : '#c2410c' }}>On leave today</p>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Duration / progress */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Daily Progress</p>
                    <motion.p
                      key={displayLiveDuration}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className="text-3xl font-black tracking-tight mb-1"
                      style={{
                        color: displayTodayAttendance?.status === 'absent' ? COLORS.red
                          : todayIsHoliday ? COLORS.amber
                          : COLORS.emeraldGreen,
                      }}
                    >
                      {displayTodayAttendance?.status === 'absent' ? 'Absent'
                        : todayIsHoliday ? 'Holiday'
                        : displayLiveDuration}
                    </motion.p>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-4"
                      style={{
                        color: displayTodayAttendance?.status === 'absent' ? COLORS.red
                          : todayIsHoliday ? COLORS.amber
                          : COLORS.emeraldGreen,
                      }}>
                      {displayTodayAttendance?.status === 'absent' ? 'Auto-marked absent'
                        : todayIsHoliday ? 'Office closed'
                        : (!isViewingOther && displayTodayAttendance?.punch_in && !displayTodayAttendance?.punch_out
                            ? 'Live — updating every minute'
                            : 'Total for today')}
                    </p>

                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full overflow-hidden mb-3"
                      style={{ backgroundColor: isDark ? D.raised : '#f1f5f9' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: displayTodayAttendance?.status === 'absent'
                            ? `linear-gradient(90deg, ${COLORS.red}, #fca5a5)`
                            : todayIsHoliday
                              ? `linear-gradient(90deg, ${COLORS.amber}, #fcd34d)`
                              : `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${displayTodayAttendance?.status === 'absent' ? 100 : todayIsHoliday ? 100 : progressPct}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Goal / progress chips */}
                    <div className="flex gap-2">
                      <div className="flex-1 px-3 py-2 rounded-xl border text-center"
                        style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff', borderColor: isDark ? '#1d4ed8' : '#bfdbfe' }}>
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">Daily Goal</p>
                        <p className="text-lg font-black" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>8.5h</p>
                      </div>
                      <div className="flex-1 px-3 py-2 rounded-xl border text-center"
                        style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4', borderColor: isDark ? '#14532d' : '#bbf7d0' }}>
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">Progress</p>
                        <p className="text-lg font-black text-emerald-500">
                          {displayTodayAttendance?.status === 'absent' ? '0%' : todayIsHoliday ? '—' : `${progressPct}%`}
                        </p>
                      </div>
                    </div>

                    {/* NEW: Goal-based status chip */}
                    {!isViewingOther && displayTodayAttendance?.punch_in && goalStatus !== 'none' && (
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Goal Status</span>
                        </div>
                        <GoalStatusBadge status={goalStatus} isDark={isDark} />
                      </div>
                    )}
                  </div>

                  {/* Punch controls — "Apply for Leave" REMOVED from here */}
                  <div className="space-y-3">
                    {displayTodayAttendance?.punch_in && (
                      <>
                        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border"
                          style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4', borderColor: isDark ? '#14532d' : '#bbf7d0' }}>
                          <div className="flex items-center gap-2 text-sm">
                            <LogIn className="h-4 w-4 text-emerald-500" />
                            <span className="font-medium" style={{ color: isDark ? D.muted : '#475569' }}>Punch In</span>
                          </div>
                          <span className="font-bold text-sm" style={{ color: isDark ? D.text : '#1e293b' }}>
                            {formatAttendanceTime(displayTodayAttendance.punch_in)}
                          </span>
                        </div>
                        {displayTodayAttendance.punch_out && (
                          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border"
                            style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2', borderColor: isDark ? '#7f1d1d' : '#fecaca' }}>
                            <div className="flex items-center gap-2 text-sm">
                              <LogOut className="h-4 w-4 text-red-500" />
                              <span className="font-medium" style={{ color: isDark ? D.muted : '#475569' }}>Punch Out</span>
                            </div>
                            <span className="font-bold text-sm" style={{ color: isDark ? D.text : '#1e293b' }}>
                              {formatAttendanceTime(displayTodayAttendance.punch_out)}
                            </span>
                          </div>
                        )}
                        {displayTodayAttendance.is_late && (
                          <div className="px-3.5 py-2 rounded-xl text-xs font-semibold text-red-500"
                            style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fee2e2' }}>
                            Late arrival recorded
                          </div>
                        )}
                      </>
                    )}

                    {!isViewingOther && (
                      <div className="flex flex-col gap-2 pt-1">
                        {!displayTodayAttendance?.punch_in && displayTodayAttendance?.status !== 'absent' ? (
                          isTodaySelected && (
                            <motion.button
                              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                              onClick={() => handlePunchAction('punch_in')} disabled={loading}
                              className={`flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-bold text-white transition-all ${!loading ? 'punch-in-pulse' : ''}`}
                              style={{ backgroundColor: COLORS.emeraldGreen }}
                            >
                              {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" />Punching In…</>
                                : <><LogIn className="w-4 h-4" />Punch In</>}
                            </motion.button>
                          )
                        ) : !displayTodayAttendance?.punch_out && displayTodayAttendance?.punch_in && isTodaySelected ? (
                          <motion.button
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                            onClick={() => handlePunchAction('punch_out')} disabled={loading}
                            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-bold text-white transition-all"
                            style={{ backgroundColor: COLORS.red }}
                          >
                            {loading
                              ? <><Loader2 className="w-4 h-4 animate-spin" />Punching Out…</>
                              : <><LogOut className="w-4 h-4" />Punch Out</>}
                          </motion.button>
                        ) : displayTodayAttendance?.punch_out ? (
                          <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border"
                            style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.10)' : '#f0fdf4', borderColor: isDark ? '#14532d' : '#bbf7d0', color: COLORS.emeraldGreen }}>
                            <CheckCircle2 className="w-4 h-4" /> {formatDuration(displayTodayAttendance.duration_minutes)} — Day complete
                          </div>
                        ) : null}

                        {/* NEW: Attendance Proof Upload Button */}
                        {displayTodayAttendance?.punch_in && isTodaySelected && (
                          <motion.button
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                            onClick={() => setShowProofModal(true)}
                            className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold border transition-all"
                            style={{
                              backgroundColor: isDark ? 'rgba(31,111,178,0.12)' : '#eff6ff',
                              borderColor: isDark ? 'rgba(31,111,178,0.3)' : '#bfdbfe',
                              color: isDark ? '#60a5fa' : COLORS.mediumBlue,
                            }}
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            {attendanceProof ? 'View / Update Proof' : 'Attach Proof'}
                            {attendanceProof && (
                              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white leading-none">✓</span>
                            )}
                          </motion.button>
                        )}
                      </div>
                    )}

                    {/* FEATURE ENHANCEMENT: Weekly mini-bar chart */}
                    <div className="pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">This Week</p>
                      <div className="flex items-end gap-1.5 h-12">
                        {weekSummary.map((d) => {
                          const barHeight = d.hours ? Math.min(100, (parseFloat(d.hours) / 10) * 100) : 0;
                          const barColor = d.status === 'present' ? COLORS.emeraldGreen
                            : d.status === 'absent' ? COLORS.red
                            : d.status === 'leave' ? COLORS.orange
                            : d.status === 'holiday' ? COLORS.amber
                            : isDark ? D.border : '#e2e8f0';

                          return (
                            <Tooltip key={d.dateStr}>
                              <TooltipTrigger asChild>
                                <div className="flex-1 flex flex-col items-center gap-0.5">
                                  <motion.div
                                    className="w-full rounded-t-md"
                                    style={{
                                      backgroundColor: barColor,
                                      opacity: d.status === 'future' ? 0.25 : d.status === 'none' ? 0.3 : 0.85,
                                      minHeight: 3,
                                    }}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(6, barHeight)}%` }}
                                    transition={{ duration: 0.6, delay: 0.1 }}
                                  />
                                  <span className={`text-[9px] font-bold ${d.isToday ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {d.day}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-bold">{d.day}</p>
                                <p>{d.status === 'present' ? `${d.hours}h` : d.status === 'future' ? 'Upcoming' : d.status.charAt(0).toUpperCase() + d.status.slice(1)}</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ══ PENDING HOLIDAY REVIEW ═══════════════════════════════════════════ */}
        {isAdmin && Array.isArray(pendingHolidays) && pendingHolidays.length > 0 && (
          <motion.div variants={itemVariants}>
            <SectionCard>
              <CardHeaderRow
                iconBg={isDark ? 'bg-amber-900/40' : 'bg-amber-50'}
                icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
                title={`Holiday Review (${pendingHolidays.length})`}
                subtitle="Confirm or reject suggested holidays"
                badge={pendingHolidays.length}
              />
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingHolidays.map(holiday => (
                  <div key={holiday.date}
                    className="p-4 rounded-xl border"
                    style={{ backgroundColor: isDark ? D.raised : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a' }}>
                    <p className="font-semibold text-sm mb-1" style={{ color: isDark ? D.text : '#1e293b' }}>{holiday.name}</p>
                    <p className="text-xs mb-3" style={{ color: isDark ? D.muted : '#78716c' }}>
                      {safeFormatDate(holiday.date, 'EEEE, MMMM d, yyyy', holiday.date || '—')}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg h-8 text-xs"
                        onClick={() => handleHolidayDecision(holiday.date, 'confirmed')}>Confirm</Button>
                      <Button size="sm" variant="outline" className="flex-1 font-semibold rounded-lg h-8 text-xs"
                        style={{ borderColor: isDark ? '#7f1d1d' : '#fca5a5', color: isDark ? '#f87171' : '#dc2626', backgroundColor: isDark ? 'rgba(239,68,68,0.06)' : undefined }}
                        onClick={() => handleHolidayDecision(holiday.date, 'rejected')}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ══ ABSENT SUMMARY ═══════════════════════════════════════════════════ */}
        {isAdmin && Array.isArray(absentSummary) && absentSummary.length > 0 && (
          <motion.div variants={itemVariants}>
            <SectionCard>
              <CardHeaderRow
                iconBg={isDark ? 'bg-red-900/40' : 'bg-red-50'}
                icon={<UserX className="h-4 w-4 text-red-500" />}
                title={`Absent This Month — ${absentSummary.length} Staff`}
                subtitle="Auto-marked at 7:00 PM IST"
                badge={absentSummary.length}
              />
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {absentSummary.map(item => (
                  <motion.div key={item.user_id} whileHover={{ scale: 1.02 }}
                    className="flex items-center gap-2.5 p-3 rounded-xl border"
                    style={{
                      backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                      borderColor: isDark ? '#7f1d1d' : '#fecaca',
                    }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.20)' : '#fecaca' }}>
                      <span className="font-bold text-sm text-red-500">{(item.user_name || '?')[0]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: isDark ? D.text : '#1e293b' }}>{item.user_name || 'Unknown'}</p>
                      <p className="text-xs font-semibold text-red-500">{item.absent_days} day{item.absent_days !== 1 ? 's' : ''} absent</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </SectionCard>
          </motion.div>
        )}

            </React.Fragment>
          );

          /* ══ STAT CARDS ══════════════════════════════════════════════════ */
          if (sectionId === 'stat_cards') return (
            <React.Fragment key="stat_cards">
              <motion.div
          className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8"
          variants={itemVariants}
        >
          <StatCard isDark={isDark} icon={Timer}
            label={isEveryoneView ? 'Total (All Staff)' : 'This Month'}
            value={Math.floor(monthTotalMinutes / 60)} unit="hours worked" color={COLORS.deepBlue}
            trend={`${monthDaysPresent} days present`} />
          <StatCard isDark={isDark} icon={CheckCircle2}
            label="Tasks Done" value={tasksCompleted} unit="completed" color={COLORS.emeraldGreen}
            trend={tasksCompleted > 0 ? 'Great progress' : 'None yet'} />
          <StatCard isDark={isDark} icon={CalendarX}
            label="Days Late" value={totalDaysLateThisMonth} unit="this month" color={COLORS.orange}
            trend={totalDaysLateThisMonth === 0 ? 'On time always' : 'Work on punctuality'} />
          <StatCard isDark={isDark} icon={UserX}
            label="Days Absent" value={monthDaysAbsent} unit="this month" color={COLORS.red}
            trend={monthDaysAbsent > 0 ? 'Auto-marked at 7 PM' : 'Perfect attendance'} />
          <StatCard isDark={isDark} icon={Flame}
            label="Streak" value={attendanceStreak} unit="consecutive days" color="#f59e0b"
            trend={attendanceStreak >= 5 ? 'Keep it up!' : 'Build momentum'} />
          <StatCard isDark={isDark} icon={TrendingUp}
            label={isEveryoneView ? 'Avg Hours' : isViewingOther ? 'Their Rank' : 'Your Rank'}
            value={isEveryoneView ? `${avgDailyHours}h` : myRank} unit={isEveryoneView ? 'per day' : 'overall'} color={COLORS.mediumBlue}
            trend={`Avg ${avgDailyHours}h/day`} />
          {/* NEW: Overtime StatCard */}
          {!isEveryoneView && !isViewingOther && (
            <StatCard isDark={isDark} icon={Zap}
              label="Overtime Today"
              value={overtimeMinutes > 0 ? formatDuration(overtimeMinutes) : '—'}
              unit={isOvertime ? 'OT mode on' : overtimeMinutes > 0 ? 'beyond 7 PM' : 'no overtime'}
              color={COLORS.mediumBlue}
              trend={overtimeMinutes > 0 ? `+${formatDuration(overtimeMinutes)} after shift` : 'Within shift hours'} />
          )}
          {/* NEW: Goal Status StatCard */}
          {!isEveryoneView && !isViewingOther && (
            <StatCard isDark={isDark} icon={Target}
              label="Daily Goal"
              value={goalStatus === 'achieved' ? '✅' : goalStatus === 'partial' ? '⚠️' : goalStatus === 'not_met' ? '❌' : '—'}
              unit={goalStatus === 'achieved' ? 'Achieved' : goalStatus === 'partial' ? 'Partial' : goalStatus === 'not_met' ? 'Not Met' : 'No data'}
              color={goalStatus === 'achieved' ? COLORS.emeraldGreen : goalStatus === 'partial' ? COLORS.amber : goalStatus === 'not_met' ? COLORS.red : '#94a3b8'}
              trend={`${GOAL_HOURS}h or ${GOAL_TASKS} tasks`} />
          )}
        </motion.div>

            </React.Fragment>
          );

          /* ══ HOLIDAYS + MONTHLY INSIGHTS (side by side) ═══════════════ */
          if (sectionId === 'holidays_reminders') return (
            <React.Fragment key="holidays_reminders">
              {!isEveryoneView && (
          <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* HOLIDAYS CARD */}
            <SectionCard className="flex flex-col" style={{ minHeight: 420 }}>
              <CardHeaderRow
                iconBg={isDark ? 'bg-amber-900/40' : 'bg-amber-50'}
                icon={<CalendarIcon className="h-4 w-4 text-amber-500" />}
                title={`Holidays — ${format(selectedDate, 'MMM yyyy')}`}
                subtitle={`${monthHolidaysGrid.length} holiday${monthHolidaysGrid.length !== 1 ? 's' : ''} this month`}
                badge={monthHolidaysGrid.length}
                action={isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => {
                      setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
                      setCalendarOpenIdx(null);
                      setShowHolidayModal(true);
                    }}
                      className="h-8 px-3 text-xs font-semibold text-white rounded-lg"
                      style={{ backgroundColor: COLORS.deepBlue }}>
                      <Plus className="w-3 h-3 mr-1" /> Add Holiday
                    </Button>
                    <Button size="sm" onClick={async () => {
                      try {
                        const r = await api.post('/holidays/auto-sync');
                        const { added = 0, upgraded = 0 } = r.data || {};
                        const msg = added + upgraded > 0
                          ? `${added} new · ${upgraded} confirmed`
                          : 'Already up to date';
                        toast.success(`Holidays synced — ${msg}`);
                        await fetchData();
                      } catch { toast.error('Sync failed'); }
                    }}
                      className="h-8 px-3 text-xs font-semibold text-white rounded-lg"
                      style={{ backgroundColor: COLORS.amber }}>
                      <Zap className="w-3 h-3 mr-1" /> Auto Sync
                    </Button>
                  </div>
                )}
              />
              <div className="flex-1 overflow-y-auto slim-scroll p-2.5 space-y-1" style={{ ...slimScroll, maxHeight: 360 }}>
                {monthHolidaysGrid.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <CalendarIcon className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium text-slate-400 dark:text-slate-500">No holidays this month</p>
                  </div>
                ) : monthHolidaysGrid.map(h => (
                  <motion.div key={h.date}
                    className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl border cursor-pointer group transition-all hover:shadow-sm"
                    style={{
                      borderColor: isDark ? 'rgba(245,158,11,0.22)' : `${COLORS.amber}35`,
                      backgroundColor: isDark ? 'rgba(245,158,11,0.06)' : `${COLORS.amber}05`,
                    }}
                    whileHover={{ backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : `${COLORS.amber}10`, y: -1 }}
                    onClick={() => setSelectedHolidayDetail(h)}
                  >
                    <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 text-white shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
                      <span className="text-[7px] leading-none uppercase">{safeFormatDate(h.date, 'MMM', '')}</span>
                      <span className="text-xs leading-none font-black">{safeFormatDate(h.date, 'd', '?')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: isDark ? D.text : '#1e293b' }}>{h.name}</p>
                      <p className="text-[11px]" style={{ color: isDark ? D.muted : '#64748b' }}>
                        {safeFormatDate(h.date, 'EEEE', '—')}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                    {isAdmin && (
                      <div className="absolute right-8 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditingHoliday(h); setEditName(h.name); setEditDate(h.date); }}
                          className="w-6 h-6 flex items-center justify-center rounded text-blue-400 hover:bg-blue-500/20">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeleteHoliday(h.date, h.name)}
                          className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </SectionCard>

            {/* MONTHLY INSIGHTS CARD (side by side with holidays) */}
            {(() => {
              const onTimeCount = monthDaysPresent - totalDaysLateThisMonth;
              const onTimePct   = monthDaysPresent > 0 ? Math.round((onTimeCount / monthDaysPresent) * 100) : 0;
              return (
              <SectionCard className="flex flex-col" style={{ minHeight: 420 }}>
                <CardHeaderRow
                  iconBg={isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}
                  icon={<BarChart3 className="h-4 w-4 text-emerald-500" />}
                  title="Monthly Insights"
                  subtitle={format(selectedDate, 'MMMM yyyy')}
                  action={
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: totalDaysLateThisMonth === 0
                          ? (isDark ? 'rgba(31,175,90,0.18)' : '#dcfce7')
                          : (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2'),
                        color: totalDaysLateThisMonth === 0 ? COLORS.emeraldGreen : COLORS.red,
                      }}>
                      {totalDaysLateThisMonth === 0 ? '✓ Perfect Punctuality' : `${totalDaysLateThisMonth} Late Arrival${totalDaysLateThisMonth !== 1 ? 's' : ''}`}
                    </span>
                  }
                />
                <div className="flex-1 p-4 overflow-y-auto slim-scroll" style={slimScroll}>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center"
                      style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4', borderColor: isDark ? '#14532d' : '#bbf7d0' }}>
                      <CheckCircle2 className="w-4 h-4 mb-1 text-emerald-500" />
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.emeraldGreen }}>{monthDaysPresent}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Present</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center"
                      style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2', borderColor: isDark ? '#7f1d1d' : '#fecaca' }}>
                      <UserX className="w-4 h-4 mb-1 text-red-500" />
                      <p className="text-xl font-black tabular-nums text-red-500">{monthDaysAbsent}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Absent</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center"
                      style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb', borderColor: isDark ? '#92400e' : '#fde68a' }}>
                      <AlarmClock className="w-4 h-4 mb-1 text-amber-500" />
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.amber }}>{totalDaysLateThisMonth}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Late</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center"
                      style={{ backgroundColor: isDark ? `${COLORS.deepBlue}18` : `${COLORS.deepBlue}08`, borderColor: isDark ? '#1d4ed8' : '#bfdbfe' }}>
                      <Clock className="w-4 h-4 mb-1" style={{ color: COLORS.deepBlue }} />
                      <p className="text-xl font-black tabular-nums font-mono" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                        {Math.floor(monthTotalMinutes / 60)}h
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{monthTotalMinutes % 60}m total</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center"
                      style={{ backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : '#f5f3ff', borderColor: isDark ? '#4c1d95' : '#ddd6fe' }}>
                      <BarChart3 className="w-4 h-4 mb-1 text-purple-500" />
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.purple }}>{avgDailyHours}h</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Avg/Day</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-center"
                      style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb', borderColor: isDark ? '#92400e' : '#fde68a' }}>
                      <Flame className="w-4 h-4 mb-1 text-amber-400" />
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.amber }}>{attendanceStreak}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                        {attendanceStreak >= 10 ? '🔥 Streak' : '⚡ Streak'}
                      </p>
                    </div>
                  </div>
                  {/* Punctuality bar */}
                  <div className="flex flex-col justify-center gap-2 px-3 py-3 rounded-2xl border mt-3"
                    style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Punctuality</span>
                      <span className="text-lg font-black tabular-nums"
                        style={{ color: onTimePct >= 80 ? COLORS.emeraldGreen : onTimePct >= 60 ? COLORS.amber : COLORS.red }}>
                        {onTimePct}%
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden"
                      style={{ backgroundColor: isDark ? D.border : '#e2e8f0' }}>
                      <motion.div className="h-full rounded-full"
                        style={{
                          background: onTimePct >= 80
                            ? `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`
                            : onTimePct >= 60
                              ? `linear-gradient(90deg, ${COLORS.amber}, #fbbf24)`
                              : `linear-gradient(90deg, ${COLORS.red}, #f87171)`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${onTimePct}%` }}
                        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
                      />
                    </div>
                    <p className="text-[11px] font-medium text-center" style={{ color: isDark ? D.muted : '#64748b' }}>
                      {onTimeCount} on-time · {totalDaysLateThisMonth} late
                    </p>
                  </div>
                </div>
              </SectionCard>
              );
            })()}
          </motion.div>
        )}

            </React.Fragment>
          );

          /* ══ CALENDAR + APPLY LEAVE + RECENT ATTENDANCE ══════════════════ */
          if (sectionId === 'calendar_area') return (
            <React.Fragment key="calendar_area">

              {/* ══════════════════════════════════════════════════════════════
                  TWO-COLUMN GRID — same height both sides
                  LEFT : Calendar  +  Date Detail  +  Apply for Leave
                  RIGHT: Recent Attendance  (scrolls to match left height)
                  ══════════════════════════════════════════════════════════════ */}
              <motion.div
                className={`grid gap-6 items-stretch ${isEveryoneView ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}
                variants={itemVariants}
              >

                {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
                {!isEveryoneView && (
                  <div className="flex flex-col gap-4">

                    {/* Calendar card */}
                    <SectionCard className="flex flex-col">
                      <CardHeaderRow
                        iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                        icon={<CalendarIcon className="h-4 w-4 text-blue-500" />}
                        title="Attendance Calendar"
                        subtitle="Click a date for details"
                        action={
                          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}
                            className="text-xs h-7 px-3 font-semibold text-blue-500">
                            Today
                          </Button>
                        }
                      />
                      <div className="p-3">
                        <Calendar
                          mode="single" selected={selectedDate}
                          onSelect={date => date && setSelectedDate(date)}
                          disabled={date => isAfter(date, new Date())}
                          className="rounded-xl border-0 w-full"
                          classNames={{
                            months: 'w-full', month: 'w-full space-y-3', table: 'w-full border-collapse',
                            head_row: 'flex w-full justify-between mb-2',
                            head_cell: 'rounded-lg w-9 font-bold text-[0.7rem] text-center text-slate-400',
                            row: 'flex w-full mt-2 justify-between',
                            cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                            day: 'h-10 w-10 p-0 font-semibold rounded-full transition-all',
                            day_today: 'font-black',
                          }}
                          components={{ Day: props => <CustomDay {...props} attendance={attendanceMap} holidays={holidays} /> }}
                        />
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs justify-center">
                          {[
                            { color: COLORS.emeraldGreen, label: 'Present'     },
                            { color: COLORS.red,          label: 'Late/Absent' },
                            { color: COLORS.amber,        label: 'Holiday'     },
                            { color: COLORS.orange,       label: 'Leave'       },
                          ].map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-1.5">
                              <span className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                                style={{ borderColor: color, backgroundColor: `${color}20` }} />
                              <span className="text-slate-400 dark:text-slate-500">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </SectionCard>

                    {/* Selected-date detail */}
                    <SectionCard>
                      <div className="p-0">
                        {selectedAttendance?.status === 'absent' ? (
                          <div className="relative p-4 pl-5 rounded-xl overflow-hidden"
                            style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.06)' : '#fef2f2' }}>
                            <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: COLORS.red }} />
                            <p className="font-bold text-sm mb-0.5 text-red-500">Absent</p>
                            <p className="text-xs text-slate-400">{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                          </div>
                        ) : selectedAttendance?.punch_in ? (
                          <div className="relative p-4 pl-5 rounded-xl overflow-hidden"
                            style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.06)' : '#f0fdf4' }}>
                            <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: COLORS.emeraldGreen }} />
                            <p className="font-bold text-sm mb-2.5" style={{ color: isDark ? D.text : '#1e293b' }}>
                              {format(selectedDate, 'EEEE, MMM d, yyyy')}
                            </p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-400">Punch In</span>
                                <span className="font-bold font-mono" style={{ color: isDark ? D.text : '#1e293b' }}>
                                  {formatAttendanceTime(selectedAttendance.punch_in)}
                                </span>
                              </div>
                              {selectedAttendance.punch_out && (
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-slate-400">Punch Out</span>
                                  <span className="font-bold font-mono" style={{ color: isDark ? D.text : '#1e293b' }}>
                                    {formatAttendanceTime(selectedAttendance.punch_out)}
                                  </span>
                                </div>
                              )}
                              {selectedAttendance.is_late && (
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-slate-400">Status</span>
                                  <span className="text-[10px] font-bold text-red-500 px-2 py-0.5 rounded"
                                    style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#fee2e2' }}>Late</span>
                                </div>
                              )}
                              <div className="pt-1.5 flex justify-between items-center border-t border-slate-100 dark:border-slate-700">
                                <span className="font-semibold text-xs" style={{ color: isDark ? D.text : '#1e293b' }}>Duration</span>
                                <span className="font-bold font-mono text-sm" style={{ color: COLORS.emeraldGreen }}>
                                  {formatDuration(selectedAttendance.duration_minutes)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : selectedAttendance?.status === 'leave' ? (
                          <div className="relative p-4 pl-5 rounded-xl overflow-hidden"
                            style={{ backgroundColor: isDark ? 'rgba(249,115,22,0.06)' : '#fff7ed' }}>
                            <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: COLORS.orange }} />
                            <p className="font-bold text-sm mb-0.5" style={{ color: COLORS.orange }}>On Leave</p>
                            <p className="text-xs text-slate-400">{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                          </div>
                        ) : selectedHoliday ? (
                          <div className="relative p-4 pl-5 rounded-xl overflow-hidden"
                            style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.06)' : '#fffbeb' }}>
                            <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: COLORS.amber }} />
                            <p className="font-bold text-sm mb-0.5" style={{ color: isDark ? '#fbbf24' : '#92400e' }}>Public Holiday</p>
                            <p className="text-xs font-medium" style={{ color: isDark ? D.muted : '#78716c' }}>{selectedHoliday.name}</p>
                          </div>
                        ) : (
                          <div className="relative p-4 pl-5 rounded-xl overflow-hidden"
                            style={{ backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                            <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: isDark ? D.border : '#e2e8f0' }} />
                            <p className="text-xs font-medium" style={{ color: isDark ? D.muted : '#64748b' }}>
                              No record for {format(selectedDate, 'MMM d, yyyy')}
                            </p>
                          </div>
                        )}
                      </div>
                    </SectionCard>

                    {/* Apply for Leave */}
                    <SectionCard className="flex flex-col">
                      <CardHeaderRow
                        iconBg={isDark ? 'bg-orange-900/40' : 'bg-orange-50'}
                        icon={<CalendarX className="h-4 w-4" style={{ color: COLORS.orange }} />}
                        title="Apply for Leave"
                        subtitle={upcomingLeaves.length > 0
                          ? `${upcomingLeaves.length} upcoming leave${upcomingLeaves.length !== 1 ? 's' : ''}`
                          : 'Request time off'}
                      />
                      <div className="p-4 flex flex-col gap-3">
                        {upcomingLeaves.length > 0 && (
                          <div className="space-y-1.5">
                            {upcomingLeaves.slice(0, 3).map(leave => {
                              const leaveDate = safeParseISO(leave.date);
                              return (
                                <div key={leave.date}
                                  className="flex items-center justify-between px-3 py-2 rounded-lg border text-xs"
                                  style={{
                                    backgroundColor: isDark ? 'rgba(249,115,22,0.06)' : '#fff7ed',
                                    borderColor: isDark ? '#7c2d12' : '#fed7aa',
                                  }}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.orange }} />
                                    <span className="font-semibold" style={{ color: isDark ? D.text : '#1e293b' }}>
                                      {leaveDate ? format(leaveDate, 'EEE, MMM d') : leave.date}
                                    </span>
                                  </div>
                                  {leave.leave_reason && (
                                    <span className="text-[10px] truncate max-w-[100px]" style={{ color: isDark ? D.muted : '#78716c' }}>
                                      {leave.leave_reason}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {upcomingLeaves.length > 3 && (
                              <p className="text-[11px] font-medium text-center" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                                +{upcomingLeaves.length - 3} more upcoming
                              </p>
                            )}
                          </div>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                          onClick={() => setShowLeaveForm(true)}
                          className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl text-sm font-bold transition-all border-2"
                          style={{
                            borderColor: isDark ? 'rgba(249,115,22,0.4)' : `${COLORS.orange}40`,
                            color: isDark ? '#fb923c' : COLORS.orange,
                            backgroundColor: isDark ? 'rgba(249,115,22,0.08)' : `${COLORS.orange}06`,
                          }}
                        >
                          <Send className="w-4 h-4" /> Apply Leave
                        </motion.button>
                        <div className="grid grid-cols-2 gap-2">
                          <motion.button
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                            onClick={() => { setLeaveType('half_day'); setShowLeaveForm(true); }}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all border"
                            style={{
                              borderColor: isDark ? 'rgba(139,92,246,0.3)' : '#ddd6fe',
                              color: isDark ? '#c4b5fd' : '#7c3aed',
                              backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : '#f5f3ff',
                            }}
                          >
                            <span>🌗</span> Half Day
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                            onClick={() => { setLeaveType('early_leave'); setShowLeaveForm(true); }}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all border"
                            style={{
                              borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a',
                              color: isDark ? '#fbbf24' : '#d97706',
                              backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb',
                            }}
                          >
                            <span>🚪</span> Early Leave
                          </motion.button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Tomorrow', days: 1 },
                            { label: '3 Days',   days: 3 },
                            { label: '1 Week',   days: 7 },
                          ].map(({ label, days }) => (
                            <button key={label}
                              onClick={() => {
                                const from = new Date();
                                from.setDate(from.getDate() + (label === 'Tomorrow' ? 1 : 0));
                                const to = new Date(from);
                                to.setDate(from.getDate() + days - 1);
                                setLeaveFrom(from); setLeaveTo(to); setShowLeaveForm(true);
                              }}
                              className="text-xs font-semibold px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm active:scale-95 text-center"
                              style={{
                                borderColor: isDark ? D.border : '#e2e8f0',
                                color: isDark ? D.muted : '#64748b',
                                backgroundColor: isDark ? D.raised : '#f8fafc',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </SectionCard>

                  </div>
                )}
                {/* ── END LEFT COLUMN ─────────────────────────────────────── */}

                {/* ── RIGHT COLUMN: Recent Attendance — stretches to match left ── */}
                <SectionCard className="flex flex-col" style={{ minHeight: 0 }}>
                  <CardHeaderRow
                    iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                    icon={<Clock className="h-4 w-4 text-blue-500" />}
                    title={isEveryoneView ? 'All Employees — Attendance' : 'Recent Attendance'}
                    subtitle={isEveryoneView ? 'Latest 25 records' : 'Last 15 records · scrolls to match'}
                  />
                  {/* flex-1 + overflow-y-auto makes the list fill the card height and scroll */}
                  <div
                    className="flex-1 overflow-y-auto slim-scroll p-3 space-y-1.5"
                    style={{ ...slimScroll, minHeight: 0 }}
                  >
                    {loading && attendanceHistory.length === 0 ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : recentAttendance.length === 0 ? (
                      <div className="flex items-center justify-center py-12">
                        <p className="text-sm font-medium text-slate-400">No records yet</p>
                      </div>
                    ) : recentAttendance.map((record, idx) => {
                      const inLocLabel     = getLocationLabel(record, 'in');
                      const outLocLabel    = getLocationLabel(record, 'out');
                      const recordUserName = userMap[record.user_id]
                        || (record.user_id === user?.id ? (user?.full_name || 'Me') : null)
                        || (isEveryoneView ? (record.user_id || 'Unknown') : (user?.full_name || null));
                      const isAbsent  = record.status === 'absent';
                      const isLeave   = record.status === 'leave';
                      const isPresent = record.punch_in && record.status === 'present';
                      const isOngoing = isPresent && !record.punch_out;
                      const recordDate = safeParseISO(record.date);
                      return (
                        <motion.div
                          key={`${record.date}-${record.user_id || idx}`}
                          variants={itemVariants}
                          whileHover={{ x: 2, transition: springPhysics.lift }}
                          className="relative p-2.5 rounded-xl border transition-all overflow-hidden flex-shrink-0"
                          style={{
                            backgroundColor: isOngoing
                              ? isDark ? 'rgba(245,158,11,0.10)' : '#fffbeb'
                              : isDark
                                ? isAbsent ? 'rgba(239,68,68,0.07)' : isLeave ? 'rgba(249,115,22,0.06)' : isPresent ? 'rgba(31,175,90,0.06)' : D.raised
                                : isAbsent ? '#fff1f2' : isLeave ? '#fff7ed' : isPresent ? '#f0fdf4' : '#f8fafc',
                            borderColor: isOngoing
                              ? isDark ? '#92400e' : '#fde68a'
                              : isDark
                                ? isAbsent ? '#7f1d1d' : isLeave ? '#7c2d12' : isPresent ? '#14532d' : D.border
                                : isAbsent ? '#fecaca' : isLeave ? '#fed7aa' : isPresent ? '#bbf7d0' : '#e2e8f0',
                          }}
                        >
                          <div className="absolute left-0 top-0 h-full w-1"
                            style={{ backgroundColor: isOngoing ? COLORS.amber : isAbsent ? COLORS.red : isLeave ? COLORS.orange : isPresent ? COLORS.emeraldGreen : isDark ? D.border : COLORS.slate200 }} />
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex-1 min-w-0">
                              {recordUserName && (
                                <p className="text-[10px] font-semibold text-blue-400 flex items-center gap-1 mb-0.5">
                                  <Users className="w-2.5 h-2.5" />{recordUserName}
                                </p>
                              )}
                              <p className="font-semibold text-xs leading-tight" style={{ color: isDark ? D.text : '#1e293b' }}>
                                {recordDate ? format(recordDate, 'EEE, MMM d, yyyy') : (record.date || '—')}
                              </p>
                              <p className="text-[11px] font-mono mt-0.5" style={{ color: isDark ? D.muted : '#64748b' }}>
                                {isAbsent ? `Absent${record.auto_marked ? ' (auto)' : ''}`
                                  : isLeave ? 'On Leave'
                                  : record.punch_in
                                    ? `${formatAttendanceTime(record.punch_in)} → ${record.punch_out ? formatAttendanceTime(record.punch_out) : '⏳ Ongoing'}`
                                  : '—'}
                              </p>
                              {(inLocLabel || outLocLabel) && !isAbsent && (
                                <p className="text-[10px] mt-0.5 truncate" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                                  {inLocLabel && <span><span className="text-emerald-500 font-semibold">▲ </span>{inLocLabel}</span>}
                                  {inLocLabel && outLocLabel && <span className="mx-1 text-slate-300">·</span>}
                                  {outLocLabel && <span><span className="text-orange-400 font-semibold">▼ </span>{outLocLabel}</span>}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {isOngoing ? (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
                                  style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.25)' : '#fef3c7', color: COLORS.amber }}>ONGOING</span>
                              ) : isAbsent ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-red-500"
                                  style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#fee2e2' }}>Absent</span>
                              ) : isLeave ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                                  style={{ color: COLORS.orange, backgroundColor: isDark ? 'rgba(249,115,22,0.15)' : `${COLORS.orange}18` }}>Leave</span>
                              ) : (
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded font-mono"
                                  style={{
                                    backgroundColor: record.duration_minutes > 0 ? isDark ? 'rgba(31,175,90,0.18)' : `${COLORS.emeraldGreen}15` : isDark ? D.raised : '#f1f5f9',
                                    color: record.duration_minutes > 0 ? COLORS.emeraldGreen : isDark ? D.muted : COLORS.deepBlue,
                                  }}>
                                  {formatDuration(record.duration_minutes)}
                                </span>
                              )}
                              {record.is_late && !isAbsent && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-red-500"
                                  style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#fee2e2' }}>Late</span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </SectionCard>
                {/* ── END RIGHT COLUMN ────────────────────────────────────── */}

              </motion.div>
              {/* ── END TWO-COLUMN GRID ─────────────────────────────────── */}

              {/* ══════════════════════════════════════════════════════════════
                  FULL-WIDTH HORIZONTAL — Location History
                  One row per record: date badge | IN | OUT | duration/status
                  ══════════════════════════════════════════════════════════════ */}
              {(() => {
                const locRecords = (Array.isArray(attendanceHistory) ? attendanceHistory : [])
                  .filter(r => r.punch_in && r.status === 'present'
                    && (!isViewingOther ? (!r.user_id || r.user_id === user?.id) : true))
                  .slice(0, 7);
                return (
                  <motion.div variants={itemVariants}>
                    <SectionCard>
                      <CardHeaderRow
                        iconBg={isDark ? 'bg-teal-900/40' : 'bg-teal-50'}
                        icon={<MapPin className="h-4 w-4 text-teal-500" />}
                        title="Location History"
                        subtitle="GPS punch in/out locations — last 7 days"
                        action={
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-md uppercase tracking-widest"
                            style={{ backgroundColor: isDark ? 'rgba(13,148,136,0.18)' : '#ccfbf1', color: isDark ? '#2dd4bf' : '#0f766e' }}>
                            GPS
                          </span>
                        }
                      />

                      {locRecords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-medium text-slate-400">No location data yet</p>
                          <p className="text-xs text-slate-400">Enable GPS when clocking in/out to see history here</p>
                        </div>
                      ) : (
                        <div className="p-4">
                          {/* Column headers */}
                          <div className="hidden sm:grid sm:grid-cols-[160px_1fr_1fr_120px] gap-3 px-3 pb-2 border-b"
                            style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
                            {['Date', 'Punch In  ·  Location', 'Punch Out  ·  Location', 'Duration'].map(h => (
                              <p key={h} className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{h}</p>
                            ))}
                          </div>

                          <div className="space-y-2 mt-2">
                            {locRecords.map((record, idx) => {
                              const recordDate   = safeParseISO(record.date);
                              const inLoc        = record.location;
                              const outLoc       = record.punch_out_location;
                              const inLabel      = getLocationLabel(record, 'in');
                              const outLabel     = getLocationLabel(record, 'out');
                              const hasInCoords  = inLoc?.latitude && inLoc?.longitude;
                              const hasOutCoords = outLoc?.latitude && outLoc?.longitude;
                              const isOngoing    = !record.punch_out;
                              const inMapsUrl    = hasInCoords
                                ? `https://www.google.com/maps?q=${inLoc.latitude},${inLoc.longitude}` : null;
                              const outMapsUrl   = hasOutCoords
                                ? `https://www.google.com/maps?q=${outLoc.latitude},${outLoc.longitude}` : null;

                              return (
                                <motion.div
                                  key={record.date}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: idx * 0.04, duration: 0.22 }}
                                  className="relative rounded-xl border overflow-hidden"
                                  style={{
                                    borderColor: isOngoing
                                      ? isDark ? '#92400e' : '#fde68a'
                                      : isDark ? D.border : '#e2e8f0',
                                    backgroundColor: isOngoing
                                      ? isDark ? 'rgba(245,158,11,0.07)' : '#fffbeb'
                                      : isDark ? D.raised : '#fafafa',
                                  }}
                                >
                                  {/* left accent stripe */}
                                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
                                    style={{ backgroundColor: isOngoing ? COLORS.amber : '#0d9488' }} />

                                  {/* ── HORIZONTAL ROW ── */}
                                  <div className="pl-4 pr-3 py-3 flex flex-col sm:grid sm:grid-cols-[160px_1fr_1fr_120px] gap-3 items-start sm:items-center">

                                    {/* Col 1: Date + index */}
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                                        style={{
                                          background: isOngoing
                                            ? `linear-gradient(135deg,${COLORS.amber},#d97706)`
                                            : `linear-gradient(135deg,${COLORS.deepBlue},${COLORS.mediumBlue})`,
                                        }}>
                                        {idx + 1}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold leading-tight" style={{ color: isDark ? D.text : '#1e293b' }}>
                                          {recordDate ? format(recordDate, 'EEE, MMM d') : record.date}
                                        </p>
                                        <p className="text-[10px]" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                                          {recordDate ? format(recordDate, 'yyyy') : ''}
                                        </p>
                                      </div>
                                      {isOngoing && (
                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse sm:hidden"
                                          style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.25)' : '#fef3c7', color: COLORS.amber }}>
                                          LIVE
                                        </span>
                                      )}
                                    </div>

                                    {/* Col 2: Punch IN */}
                                    <div className="flex items-start gap-2 min-w-0 w-full sm:w-auto">
                                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                                        style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.20)' : '#dcfce7' }}>
                                        <LogIn className="w-3 h-3 text-emerald-500" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[9px] font-black uppercase text-emerald-500">IN</span>
                                          <span className="text-[11px] font-mono font-semibold" style={{ color: isDark ? D.muted : '#374151' }}>
                                            {formatAttendanceTime(record.punch_in)}
                                          </span>
                                          {hasInCoords && (
                                            <a href={inMapsUrl} target="_blank" rel="noopener noreferrer"
                                              className="text-[9px] font-semibold flex items-center gap-0.5 hover:underline"
                                              style={{ color: COLORS.mediumBlue }}>
                                              <ExternalLink className="w-2 h-2" />Maps
                                            </a>
                                          )}
                                        </div>
                                        <p className="text-[10px] leading-snug mt-0.5"
                                          style={{
                                            color: isDark ? D.dimmer : '#64748b',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                          }}>
                                          {hasInCoords
                                            ? inLabel
                                            : <span className="italic text-slate-400">No location</span>}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Col 3: Punch OUT */}
                                    <div className="flex items-start gap-2 min-w-0 w-full sm:w-auto">
                                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                                        style={{
                                          backgroundColor: isOngoing
                                            ? isDark ? 'rgba(245,158,11,0.20)' : '#fef3c7'
                                            : isDark ? 'rgba(249,115,22,0.15)' : '#ffedd5',
                                        }}>
                                        <LogOut className={`w-3 h-3 ${isOngoing ? 'text-amber-500' : 'text-orange-400'}`} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`text-[9px] font-black uppercase ${isOngoing ? 'text-amber-500' : 'text-orange-400'}`}>OUT</span>
                                          <span className="text-[11px] font-mono font-semibold" style={{ color: isDark ? D.muted : '#374151' }}>
                                            {record.punch_out ? formatAttendanceTime(record.punch_out) : '—'}
                                          </span>
                                          {hasOutCoords && (
                                            <a href={outMapsUrl} target="_blank" rel="noopener noreferrer"
                                              className="text-[9px] font-semibold flex items-center gap-0.5 hover:underline"
                                              style={{ color: COLORS.mediumBlue }}>
                                              <ExternalLink className="w-2 h-2" />Maps
                                            </a>
                                          )}
                                        </div>
                                        <p className="text-[10px] leading-snug mt-0.5"
                                          style={{
                                            color: isDark ? D.dimmer : '#64748b',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                          }}>
                                          {isOngoing
                                            ? <span className="italic" style={{ color: COLORS.amber }}>Still working…</span>
                                            : hasOutCoords
                                              ? outLabel
                                              : <span className="italic text-slate-400">No location</span>}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Col 4: Duration + badges */}
                                    <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 flex-wrap">
                                      {isOngoing ? (
                                        <span className="text-[9px] font-black px-2 py-1 rounded-full animate-pulse"
                                          style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.25)' : '#fef3c7', color: COLORS.amber }}>
                                          ONGOING
                                        </span>
                                      ) : (
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg font-mono"
                                          style={{
                                            backgroundColor: isDark ? 'rgba(31,175,90,0.18)' : `${COLORS.emeraldGreen}15`,
                                            color: COLORS.emeraldGreen,
                                          }}>
                                          {formatDuration(record.duration_minutes)}
                                        </span>
                                      )}
                                      {record.is_late && (
                                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-red-500"
                                          style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#fee2e2' }}>
                                          LATE
                                        </span>
                                      )}
                                    </div>

                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </SectionCard>
                  </motion.div>
                );
              })()}

        {/* ══ MODALS ════════════════════════════════════════════════════════════ */}

        {/* Punch-In Modal */}
        <AnimatePresence>
          {showPunchInModal && !isViewingOther && !isEveryoneView && (
            <motion.div
              className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
              style={{ background: isDark ? 'rgba(0,0,0,0.92)' : 'rgba(15,23,42,0.88)', backdropFilter: 'blur(12px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              {/* NO onClick dismiss — user MUST punch in to use the app */}
              <motion.div
                className="w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl"
                style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
                initial={{ scale: 0.88, y: 32 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 32 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                onClick={e => e.stopPropagation()}
              >
                {/* Gradient header */}
                <div className="relative overflow-hidden px-8 pt-8 pb-6 text-center"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
                  <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
                  {/* Pulsing icon */}
                  <motion.div
                    className="relative mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(255,255,255,0.2)', boxShadow: '0 0 0 0 rgba(255,255,255,0.4)' }}
                    animate={{ boxShadow: ['0 0 0 0 rgba(255,255,255,0.4)', '0 0 0 16px rgba(255,255,255,0)', '0 0 0 0 rgba(255,255,255,0)'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}>
                    <LogIn className="w-10 h-10 text-white" />
                  </motion.div>
                  <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
                    {new Date().toLocaleString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })}
                  </p>
                  <h2 className="text-2xl font-black text-white">Good Morning!</h2>
                  <p className="text-white/70 text-sm mt-1">Please punch in to start your workday</p>
                </div>

                <div className="px-7 py-6 space-y-4">
                  {/* Time display */}
                  <div className="flex items-center justify-center gap-3 py-3 rounded-2xl border"
                    style={{ backgroundColor: isDark ? D.raised : '#f8fafc', borderColor: isDark ? D.border : '#e2e8f0' }}>
                    <Clock className="w-5 h-5" style={{ color: COLORS.deepBlue }} />
                    <span className="text-xl font-black font-mono tracking-wider" style={{ color: isDark ? D.text : COLORS.deepBlue }}>
                      {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                    </span>
                    <span className="text-xs font-bold text-slate-400">IST</span>
                  </div>

                  {/* Geo-fence status */}
                  {geoChecking && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                      style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff', borderColor: isDark ? '#1d4ed8' : '#bfdbfe' }}>
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                      <p className="text-xs font-semibold text-blue-500">Verifying your location…</p>
                    </div>
                  )}
                  {geoError && !geoChecking && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="px-4 py-3 rounded-xl border"
                      style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2', borderColor: isDark ? '#7f1d1d' : '#fecaca' }}>
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-red-500 mb-0.5">Location check failed</p>
                          <p className="text-[11px] leading-relaxed" style={{ color: isDark ? '#fca5a5' : '#dc2626' }}>{geoError}</p>
                          {userLocation && (
                            <p className="text-[10px] mt-1 font-mono" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                              Your position: {userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}
                              {userLocation.distance !== undefined && <> · {userLocation.distance}m from office</>}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {isWithinGeofence === true && userLocation && !geoChecking && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl border"
                      style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4', borderColor: isDark ? '#14532d' : '#bbf7d0' }}>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-emerald-500">Location verified ✓</p>
                        <p className="text-[10px] font-mono" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                          {userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}
                          {userLocation.distance !== undefined && <> · {userLocation.distance}m from office</>}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Punch In button */}
                  <motion.button
                    whileHover={!loading && !geoChecking ? { scale: 1.02 } : {}}
                    whileTap={!loading && !geoChecking ? { scale: 0.97 } : {}}
                    onClick={() => handlePunchAction('punch_in')}
                    disabled={loading || geoChecking}
                    className="w-full py-3.5 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-60"
                    style={{
                      background: (loading || geoChecking) ? '#9CA3AF' : `linear-gradient(135deg, ${COLORS.emeraldGreen}, #16a34a)`,
                      boxShadow: (loading || geoChecking) ? 'none' : '0 4px 16px rgba(31,175,90,0.35)',
                    }}>
                    {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Punching In…</span>
                      : geoChecking ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Checking Location…</span>
                      : <span className="flex items-center justify-center gap-2"><LogIn className="w-4 h-4" />Punch In Now</span>}
                  </motion.button>

                  {/* Retry location + warning */}
                  {geoError && !geoChecking && (
                    <button onClick={checkGeofence}
                      className="w-full py-2.5 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95"
                      style={{ borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.muted : '#64748b', backgroundColor: 'transparent' }}>
                      <span className="flex items-center justify-center gap-2"><MapPin className="w-3.5 h-3.5" />Retry Location Check</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb' }}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.amber }} />
                    <p className="text-[11px] font-medium" style={{ color: isDark ? '#fbbf24' : '#92400e' }}>
                      Access restricted — punch in required · Auto-absent at 7:00 PM IST
                    </p>
                  </div>

                  {/* Apply leave link */}
                  <div className="text-center">
                    <button onClick={() => { setShowPunchInModal(false); setTimeout(() => setShowLeaveForm(true), 200); }}
                      className="text-xs font-semibold underline decoration-dotted transition-all"
                      style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                      On leave today? Apply here
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leave Form Modal */}
        <AnimatePresence>
          {showLeaveForm && (
             <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowLeaveForm(false); }}>
              <motion.div
                className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              >
                {/* Header */}
                <div className="px-7 py-5 flex items-center justify-between"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                  <div>
                    <h2 className="text-xl font-black text-white">Apply Leave</h2>
                    <p className="text-blue-200 text-sm mt-0.5">Select type and dates below</p>
                  </div>
                  <button onClick={() => setShowLeaveForm(false)}
                    className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
          
                <div className="p-6 space-y-5">
          
                  {/* ── Leave Type Picker ── */}
                  <div>
                    <p className="text-sm font-semibold mb-2.5" style={{ color: isDark ? D.muted : '#374151' }}>Leave Type</p>
                    <div className="grid grid-cols-2 gap-2">
                      {LEAVE_TYPES.map(lt => (
                        <motion.button
                          key={lt.value}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setLeaveType(lt.value)}
                        >
                          <span style={{ fontSize: 18, lineHeight: 1 }}>{lt.icon}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug truncate"
                              style={{ color: leaveType === lt.value ? (isDark ? '#60a5fa' : COLORS.deepBlue) : isDark ? D.text : '#1e293b' }}>
                              {lt.label}
                            </p>
                            <p className="text-[11px] leading-snug mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                              {lt.desc}
                            </p>
                          </div>
                          {leaveType === lt.value && (
                            <div className="ml-auto flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: COLORS.deepBlue }}>
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
          
                  {/* ── Early leave time picker ── */}
                  {leaveType === 'early_leave' && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="text-sm font-semibold mb-2.5 block" style={{ color: isDark ? D.muted : '#374151' }}>
                        Departure Time
                      </label>
                      <div className="flex items-center gap-3">
                        {/* Hour selector */}
                        <div className="flex-1">
                          <p className="text-[11px] font-medium mb-1" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Hour</p>
                          <div className="grid grid-cols-6 gap-1">
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
                              const hStr = String(h).padStart(2, '0');
                              const currentH = earlyLeaveTime ? earlyLeaveTime.split(':')[0] : '';
                              const is12 = currentH === '00' && h === 12;
                              const isSelected = currentH === hStr || is12;
                              return (
                                <button key={h} type="button"
                                  onClick={() => {
                                    const mins = earlyLeaveTime ? earlyLeaveTime.split(':')[1] || '00' : '00';
                                    const isPM = earlyLeaveTime ? parseInt(earlyLeaveTime.split(':')[0]) >= 12 : true;
                                    let h24 = h;
                                    if (isPM && h !== 12) h24 = h + 12;
                                    if (!isPM && h === 12) h24 = 0;
                                    setEarlyLeaveTime(`${String(h24).padStart(2, '0')}:${mins}`);
                                  }}
                                  className="py-1.5 rounded-lg text-xs font-semibold transition-all"
                                  style={{
                                    backgroundColor: isSelected ? COLORS.deepBlue : isDark ? D.raised : '#f1f5f9',
                                    color: isSelected ? '#ffffff' : isDark ? D.text : '#374151',
                                    border: `1px solid ${isSelected ? COLORS.deepBlue : isDark ? D.border : '#e2e8f0'}`,
                                  }}>
                                  {h}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* Minute selector */}
                        <div className="w-24">
                          <p className="text-[11px] font-medium mb-1" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Minute</p>
                          <div className="grid grid-cols-2 gap-1">
                            {[0, 15, 30, 45].map(m => {
                              const mStr = String(m).padStart(2, '0');
                              const currentM = earlyLeaveTime ? earlyLeaveTime.split(':')[1] : '';
                              const isSelected = currentM === mStr;
                              return (
                                <button key={m} type="button"
                                  onClick={() => {
                                    const hrs = earlyLeaveTime ? earlyLeaveTime.split(':')[0] : '13';
                                    setEarlyLeaveTime(`${hrs}:${mStr}`);
                                  }}
                                  className="py-1.5 rounded-lg text-xs font-semibold transition-all"
                                  style={{
                                    backgroundColor: isSelected ? COLORS.mediumBlue : isDark ? D.raised : '#f1f5f9',
                                    color: isSelected ? '#ffffff' : isDark ? D.text : '#374151',
                                    border: `1px solid ${isSelected ? COLORS.mediumBlue : isDark ? D.border : '#e2e8f0'}`,
                                  }}>
                                  :{mStr}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* AM/PM toggle */}
                        <div className="w-14">
                          <p className="text-[11px] font-medium mb-1" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Period</p>
                          <div className="flex flex-col gap-1">
                            {['AM', 'PM'].map(period => {
                              const currentH = earlyLeaveTime ? parseInt(earlyLeaveTime.split(':')[0]) : 13;
                              const isPM = currentH >= 12;
                              const isSelected = (period === 'PM' && isPM) || (period === 'AM' && !isPM);
                              return (
                                <button key={period} type="button"
                                  onClick={() => {
                                    if (!earlyLeaveTime) {
                                      setEarlyLeaveTime(period === 'AM' ? '09:00' : '13:00');
                                      return;
                                    }
                                    let h = parseInt(earlyLeaveTime.split(':')[0]);
                                    const mins = earlyLeaveTime.split(':')[1];
                                    if (period === 'PM' && h < 12) h += 12;
                                    if (period === 'AM' && h >= 12) h -= 12;
                                    setEarlyLeaveTime(`${String(h).padStart(2, '0')}:${mins}`);
                                  }}
                                  className="py-1.5 rounded-lg text-xs font-bold transition-all"
                                  style={{
                                    backgroundColor: isSelected ? COLORS.deepBlue : isDark ? D.raised : '#f1f5f9',
                                    color: isSelected ? '#ffffff' : isDark ? D.text : '#374151',
                                    border: `1px solid ${isSelected ? COLORS.deepBlue : isDark ? D.border : '#e2e8f0'}`,
                                  }}>
                                  {period}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {earlyLeaveTime && (
                        <div className="flex items-center gap-2 mt-2.5 px-3 py-2 rounded-xl"
                          style={{ backgroundColor: isDark ? `${COLORS.deepBlue}15` : `${COLORS.deepBlue}08` }}>
                          <Clock className="w-4 h-4" style={{ color: COLORS.mediumBlue }} />
                          <p className="text-sm font-semibold" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                            Leaving at {(() => {
                              const [h, m] = earlyLeaveTime.split(':').map(Number);
                              const ampm = h >= 12 ? 'PM' : 'AM';
                              const h12 = h % 12 || 12;
                              return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                            })()}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
          
                  {/* ── Date pickers — full day only shows range; partial shows 2-month calendar ── */}
                  {leaveType === 'full_day' ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {[1, 3, 7, 15, 30].map(days => (
                          <Button key={days} variant="outline" size="sm"
                            onClick={() => {
                              const from = new Date(), to = new Date();
                              to.setDate(from.getDate() + days - 1);
                              setLeaveFrom(from); setLeaveTo(to);
                            }}
                            className="rounded-lg font-semibold text-xs"
                            style={{ borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.text : '#374151', backgroundColor: isDark ? D.raised : undefined }}>
                            {days === 1 ? '1 Day' : `${days} Days`}
                          </Button>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>From Date</label>
                          <Calendar mode="single" selected={leaveFrom} onSelect={setLeaveFrom}
                            disabled={date => isBefore(date, startOfDay(new Date()))}
                            className="rounded-xl border w-full pointer-events-auto [&_.rdp-months]:w-full [&_.rdp-month]:w-full [&_.rdp-table]:w-full [&_.rdp-head_row]:flex [&_.rdp-head_row]:justify-between [&_.rdp-row]:flex [&_.rdp-row]:justify-between"
                            style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }} />
                        </div>
                        <div>
                          <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>To Date</label>
                          <Calendar mode="single" selected={leaveTo} onSelect={setLeaveTo}
                            disabled={date => leaveFrom ? isBefore(date, leaveFrom) : true}
                            className="rounded-xl border w-full pointer-events-auto [&_.rdp-months]:w-full [&_.rdp-month]:w-full [&_.rdp-table]:w-full [&_.rdp-head_row]:flex [&_.rdp-head_row]:justify-between [&_.rdp-row]:flex [&_.rdp-row]:justify-between"
                            style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }} />
                        </div>
                      </div>
                      {leaveFrom && (
                        <div className="relative px-4 py-3 pl-5 rounded-xl overflow-hidden"
                          style={{ backgroundColor: isDark ? `${COLORS.deepBlue}18` : `${COLORS.deepBlue}08` }}>
                          <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: COLORS.deepBlue }} />
                          <p className="text-xs text-slate-400 mb-0.5">Total Duration</p>
                          <p className="text-2xl font-black" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                            {Math.max(1, leaveTo
                              ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1
                              : 1)} days
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    /* 2-month calendar for half-day / early leave */
                    <div>
                      <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Select Date</label>
                      <Calendar mode="single" selected={leaveFrom} onSelect={setLeaveFrom}
                        numberOfMonths={2}
                        disabled={date => isBefore(date, startOfDay(new Date()))}
                        className="rounded-xl border w-full pointer-events-auto [&_.rdp-months]:w-full [&_.rdp-months]:flex [&_.rdp-months]:gap-4 [&_.rdp-month]:flex-1 [&_.rdp-table]:w-full [&_.rdp-head_row]:flex [&_.rdp-head_row]:justify-between [&_.rdp-row]:flex [&_.rdp-row]:justify-between"
                        style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }} />
                      {leaveFrom && (
                        <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-xl border text-sm font-semibold"
                          style={{
                            backgroundColor: isDark ? `${COLORS.deepBlue}12` : `${COLORS.deepBlue}06`,
                            borderColor: isDark ? 'rgba(31,111,178,0.3)' : `${COLORS.deepBlue}25`,
                            color: isDark ? '#60a5fa' : COLORS.deepBlue,
                          }}>
                          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                          {format(leaveFrom, 'EEEE, MMMM d, yyyy')}
                        </div>
                      )}
                    </div>
                  )}
          
                  {/* Reason */}
                  <div>
                    <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Reason</label>
                    <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                      placeholder="Reason for leave…" className={`${inputCls} min-h-[80px] resize-none`} style={inputStyle} />
                  </div>
                </div>
          
                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2 border-t"
                  style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                  <Button variant="ghost" onClick={() => {
                    setShowLeaveForm(false);
                    setLeaveType('full_day'); setEarlyLeaveTime('');
                  }} className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!leaveFrom || (leaveType === 'early_leave' && !earlyLeaveTime)}
                    onClick={handleApplyLeave}
                    className="font-semibold text-white rounded-xl"
                    style={{ backgroundColor: COLORS.deepBlue }}>
                    Submit Request
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Holiday Modal */}
        <AnimatePresence>
          {editingHoliday && (
            <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              style={{ background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              >
                <div className="px-6 py-5 text-white flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
                  <h2 className="text-lg font-black">Edit Holiday</h2>
                  <button onClick={() => setEditingHoliday(null)} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400">Holiday Name</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400">Date</label>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputCls} style={inputStyle} />
                  </div>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2 border-t"
                  style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                  <Button variant="ghost" onClick={() => setEditingHoliday(null)} className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
                  <Button disabled={!editName.trim() || !editDate || editLoading} onClick={handleEditHolidaySave}
                    className="font-semibold text-white rounded-xl" style={{ backgroundColor: COLORS.amber }}>
                    {editLoading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : <><CheckCircle2 className="w-4 h-4 mr-1.5" />Save Changes</>}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* New Reminder Modal */}
        <AnimatePresence>
          {showReminderForm && (
            <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              style={{ background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
                style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              >
                <div className="px-7 py-5 text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.purple}, #6D28D9)` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><AlarmClock className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-xl font-black">New Reminder</h2>
                        <p className="text-purple-200 text-sm">Manual entry or auto-fill from PDF</p>
                      </div>
                    </div>
                    <button onClick={() => { setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null); }}
                      className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  <div>
                    <input ref={trademarkPdfRef} type="file" accept=".pdf" onChange={handleTrademarkPdfUpload} className="hidden" />
                    <button onClick={() => trademarkPdfRef.current?.click()} disabled={trademarkLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border-2 border-white/30 text-white hover:bg-white/15 disabled:opacity-60">
                      {trademarkLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Reading PDF…</> : <><FileUp className="w-3.5 h-3.5" />Upload Notice PDF</>}
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto slim-scroll flex-1" style={slimScroll}>
                  {trademarkData && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl overflow-hidden border"
                      style={{ borderColor: isDark ? 'rgba(139,92,246,0.35)' : '#ddd6fe' }}>
                      <div className="px-4 py-2 flex items-center gap-2"
                        style={{ background: isDark ? 'rgba(139,92,246,0.12)' : `${COLORS.purple}10` }}>
                        <CheckCircle2 className="w-3.5 h-3.5" style={{ color: COLORS.purple }} />
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: COLORS.purple }}>Extracted from PDF</span>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                        {[
                          { label: 'Application No', value: trademarkData.application_no, bold: true },
                          { label: 'Class',           value: trademarkData.class                     },
                          { label: 'Applicant',       value: trademarkData.applicant_name,  bold: true },
                          { label: 'Hearing Date',    value: trademarkData.hearing_date               },
                        ].filter(f => f.value).map(({ label, value, bold }) => (
                          <div key={label}>
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">{label}</p>
                            <p className={`${bold ? 'font-bold' : 'font-medium'}`} style={{ color: isDark ? D.text : '#1e293b' }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400">Title *</label>
                    <input type="text" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)}
                      placeholder="e.g., Trademark Hearing, GST filing…" className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400">Date &amp; Time *</label>
                    <input type="datetime-local" value={reminderDatetime} onChange={e => setReminderDatetime(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd'T'HH:mm")} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-slate-500 dark:text-slate-400">Description</label>
                    <textarea value={reminderDesc} onChange={e => setReminderDesc(e.target.value)}
                      placeholder="Notes, agenda, details…" rows={4}
                      className={`${inputCls} resize-none font-mono`} style={inputStyle} />
                  </div>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0 border-t"
                  style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
                  <Button variant="ghost" onClick={() => { setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null); }}
                    className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>
                    Cancel
                  </Button>
                  <Button disabled={!reminderTitle.trim() || !reminderDatetime} onClick={handleCreateReminder}
                    className="font-semibold text-white rounded-xl px-5" style={{ backgroundColor: COLORS.purple }}>
                    <Bell className="w-3.5 h-3.5 mr-1.5" /> Set Reminder
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Email Importer */}
        <AnimatePresence>
          {showEmailImporter && (
            <EmailEventImporter
              mode="reminder"
              onSelectEvent={handleEmailEventForReminder}
              onClose={() => setShowEmailImporter(false)}
            />
          )}
        </AnimatePresence>
            </React.Fragment>
          );

          return null;
        })}

        </div>{/* end max-w wrapper */}
      </motion.div>
    </TooltipProvider>
  );
}
