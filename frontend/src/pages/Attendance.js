import { useDark } from '@/hooks/useDark';
// Attendance.jsx - v8 — FULL LITE DARK THEME
//
// ROOT CAUSE OF 404 ERRORS (fixed in v7, preserved here):
//
//  BUG 1 — handleDeleteReminder passed `null` id for auto-saved reminders.
//  FIX 1 — normalizeReminder() resolves id from r.id || r._id || r["_id"],
//    and handleDeleteReminder resolves reminderId with the same triple-fallback.
//
//  BUG 2 — handleUpdateReminder called PATCH with undefined id.
//  FIX 2 — handleUpdateReminder now resolves id with triple-fallback.
//
//  BUG 3 — Reminder list render used `key={rid || index}` where rid = r.id.
//  FIX 3 — rid always resolved via normalizeReminder's triple-fallback.
//
//  BUG 4 — handleDismissPopup used firedReminder.id || firedReminder._id
//  FIX 4 — resolveId() helper always returns a plain string or null.
//
//  EXTRA — Backend one-time migration:
//    Call POST /email/migrate-fix-ids ONCE after deploying backend v9.
//
// DARK THEME v8:
//  - Every card, modal, header, table row, badge, input, select, textarea
//    now reads isDark and applies appropriate bg/border/text/ring classes.
//  - Palette:
//      dark bg-card    : #0f172a  (slate-900)
//      dark bg-surface : #1e293b  (slate-800)
//      dark bg-raised  : #263348  (slate-750 custom)
//      dark border     : #334155  (slate-700)
//      dark border-dim : #1e293b  (slate-800)
//      dark text-primary : #f1f5f9 (slate-100)
//      dark text-muted   : #94a3b8 (slate-400)
//      dark text-dimmer  : #64748b (slate-500)
//  - All colour accent variables kept identical so charts/badges stay vivid.

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
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTION + DARK THEME STYLES
// ═══════════════════════════════════════════════════════════════════════════
const ATTENDANCE_INTERACTION_STYLES = `
  @keyframes att-ripple {
    0% { transform: scale(0); opacity: 0.5; }
    100% { transform: scale(4); opacity: 0; }
  }
  @keyframes att-pulse-green {
    0%, 100% { box-shadow: 0 0 0 0 rgba(31,175,90,0.5); }
    50% { box-shadow: 0 0 0 8px rgba(31,175,90,0); }
  }
  @keyframes att-pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
    50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
  }
  .att-ripple-btn { position: relative; overflow: hidden; }
  .att-ripple-btn .att-ripple {
    position: absolute; border-radius: 50%; transform: scale(0);
    background: rgba(255,255,255,0.35); animation: att-ripple 0.55s linear; pointer-events: none;
  }
  .punch-in-pulse { animation: att-pulse-green 1.8s ease-in-out infinite; }
  .absent-pulse   { animation: att-pulse-red   1.5s ease-in-out infinite; }
  .slim-scroll::-webkit-scrollbar { width: 4px; }
  .slim-scroll::-webkit-scrollbar-track { background: transparent; border-radius: 10px; }
  .slim-scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.35); border-radius: 10px; }
  .slim-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.55); }
  .slim-scroll { scrollbar-width: thin; scrollbar-color: rgba(100,116,139,0.35) transparent; }
  /* Dark mode scrollbar */
  .dark .slim-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.25); }
  .dark .slim-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.45); }
`;
if (typeof document !== 'undefined' && !document.getElementById('att-interaction-styles')) {
  const s = document.createElement('style');
  s.id = 'att-interaction-styles';
  s.textContent = ATTENDANCE_INTERACTION_STYLES;
  document.head.appendChild(s);
}

function addAttRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement('span');
  const d = Math.max(btn.clientWidth, btn.clientHeight);
  const r = d / 2;
  const rect = btn.getBoundingClientRect();
  circle.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - rect.left - r}px;top:${e.clientY - rect.top - r}px;`;
  circle.classList.add('att-ripple');
  const old = btn.querySelector('.att-ripple');
  if (old) old.remove();
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  amber:        '#F59E0B',
  orange:       '#F97316',
  red:          '#EF4444',
  slate50:      '#F8FAFC',
  slate200:     '#E2E8F0',
  purple:       '#8B5CF6',
};

// Dark palette helpers — used inline for dynamic styles
const D = {
  bg:        '#0f172a',   // slate-900 — page background
  card:      '#1e293b',   // slate-800 — card background
  raised:    '#263348',   // slate-750 — slightly elevated surface
  border:    '#334155',   // slate-700 — standard border
  borderDim: '#1e293b',   // slate-800 — subtle border
  text:      '#f1f5f9',   // slate-100 — primary text
  muted:     '#94a3b8',   // slate-400 — secondary text
  dimmer:    '#64748b',   // slate-500 — placeholder/hint text
};

const IST_TIMEZONE           = 'Asia/Kolkata';
const ABSENT_CUTOFF_HOUR_IST = 19;

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

if (typeof document !== 'undefined' && !document.getElementById('roboto-mono-font')) {
  const link = document.createElement('link');
  link.id   = 'roboto-mono-font';
  link.rel  = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(link);
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX: resolveId — triple-fallback id resolver
// ═══════════════════════════════════════════════════════════════════════════
function resolveId(r) {
  if (!r) return null;
  const id = r.id ?? r._id ?? r['_id'] ?? null;
  return id ? String(id) : null;
}

function normalizeReminder(r) {
  if (!r) return r;
  return { ...r, id: resolveId(r) };
}

// ═══════════════════════════════════════════════════════════════════════════
// sessionStorage helpers
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// LiveClock
// ═══════════════════════════════════════════════════════════════════════════
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = formatInTimeZone(time, IST_TIMEZONE, 'hh:mm:ss');
  const ampm    = formatInTimeZone(time, IST_TIMEZONE, 'a');
  const dateStr = formatInTimeZone(time, IST_TIMEZONE, 'EEEE, MMM d yyyy');
  return (
    <div className="flex flex-col items-center justify-center text-white select-none">
      <div className="flex items-end gap-2">
        <span
          className="font-black leading-none tracking-tight"
          style={{ fontSize: '3.5rem', fontFamily: "'Roboto Mono', monospace" }}
        >
          {timeStr}
        </span>
        <span className="text-blue-200 font-bold text-xl mb-2">{ampm}</span>
      </div>
      <p className="text-blue-200 text-sm font-medium mt-1">{dateStr} · IST</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD — dark theme aware
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, unit, color, trend, isDark }) {
  return (
    <motion.div variants={itemVariants}>
      <Card
        className="border-0 shadow-md h-full"
        style={{
          backgroundColor: isDark ? D.card : '#ffffff',
          border: isDark ? `1px solid ${D.border}` : undefined,
        }}
      >
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: isDark ? `${color}22` : `${color}18` }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <p
              className="text-xs font-bold uppercase tracking-wide leading-tight"
              style={{ color: isDark ? D.muted : '#64748b' }}
            >
              {label}
            </p>
          </div>
          <p className="text-3xl font-black tracking-tight mb-0.5" style={{ color }}>
            {value}
          </p>
          <p className="text-xs font-medium" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
            {unit}
          </p>
          {trend && (
            <p
              className="text-[11px] mt-1 font-medium truncate"
              style={{ color: isDark ? D.dimmer : '#94a3b8' }}
            >
              {trend}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM CALENDAR DAY
// ═══════════════════════════════════════════════════════════════════════════
function CustomDay({ date, displayMonth, attendance = {}, holidays = [] }) {
  const dateStr  = format(date, 'yyyy-MM-dd');
  const dayRecord = attendance[dateStr];
  const holiday  = (Array.isArray(holidays) ? holidays : []).find(h => h.date === dateStr);
  let ringColor = null, bgColor = null, isSpecial = false;
  if (holiday)                                  { ringColor = COLORS.amber;        bgColor = '#FEF3C720'; isSpecial = true; }
  else if (dayRecord?.status === 'leave')       { ringColor = COLORS.orange;       bgColor = '#FFF7ED20'; isSpecial = true; }
  else if (dayRecord?.status === 'absent')      { ringColor = COLORS.red;          bgColor = '#FEE2E240'; isSpecial = true; }
  else if (dayRecord?.punch_in && dayRecord?.is_late) { ringColor = COLORS.red;   bgColor = '#FEE2E220'; isSpecial = true; }
  else if (dayRecord?.punch_in)                 { ringColor = COLORS.emeraldGreen; bgColor = '#D1FAE520'; }
  const isTodayDate = dateFnsIsToday(date);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 hover:bg-slate-700/40 active:scale-95">
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
            className={`relative z-10 text-[13px] leading-none select-none ${isTodayDate ? 'font-black' : 'font-medium'}`}
            style={isTodayDate && ringColor ? { color: COLORS.deepBlue } : isTodayDate && !ringColor ? { color: COLORS.red } : undefined}
          >
            {date.getDate()}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-bold mb-1">{format(date, 'MMM d, yyyy')}</p>
        {holiday
          ? <p className="text-amber-600 font-medium">🎉 {holiday.name}</p>
          : dayRecord?.status === 'leave'
            ? <p className="font-medium" style={{ color: COLORS.orange }}>🟠 On Leave{dayRecord.leave_reason ? ` — ${dayRecord.leave_reason}` : ''}</p>
          : dayRecord?.status === 'absent'
            ? <p className="font-medium text-red-600">❌ Absent{dayRecord.auto_marked ? ' (auto-marked at 7:00 PM)' : ''}</p>
          : dayRecord?.punch_in
            ? (<>
                <p>In: {formatAttendanceTime(dayRecord.punch_in)}</p>
                {dayRecord.punch_out && <p>Out: {formatAttendanceTime(dayRecord.punch_out)}</p>}
                <p className="font-semibold" style={{ color: COLORS.emeraldGreen }}>{formatDuration(dayRecord.duration_minutes)}</p>
                {dayRecord.is_late && <p className="text-red-500 font-semibold">Late arrival</p>}
              </>)
          : dateFnsIsToday(date)
            ? (<div><p className="text-red-600 font-bold">⚠️ Not punched in yet</p><p className="text-slate-400 text-[10px] mt-1">Auto-absent marks at 7:00 PM IST</p></div>)
          : <p className="text-slate-400 font-medium">No record</p>
        }
      </TooltipContent>
    </Tooltip>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER POPUP — dark theme aware
// ═══════════════════════════════════════════════════════════════════════════
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
          background: isDark
            ? `linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)`
            : `linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)`,
          borderColor: isDark ? '#4c1d95' : '#ddd6fe',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: COLORS.purple }}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: [0, -15, 15, -10, 10, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.4 }}>
              <BellRing className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-white font-bold text-sm uppercase tracking-wider">Reminder</span>
          </div>
          <button onClick={onDismiss} className="text-purple-200 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p
            className="font-black text-lg leading-snug mb-1"
            style={{ color: isDark ? D.text : '#1e293b' }}
          >
            {reminder.title}
          </p>
          {reminder.description && (
            <p style={{ color: isDark ? D.muted : '#475569' }} className="text-sm mb-3">
              {stripHtml(reminder.description)}
            </p>
          )}
          <p
            className="text-xs font-medium mb-4"
            style={{ color: isDark ? D.dimmer : '#94a3b8' }}
          >
            ⏰ {formatReminderTime(reminder.remind_at)}
          </p>
          <div className="flex gap-3">
            <a
              href={buildGCalURL(reminder)} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: COLORS.deepBlue }}
            >
              <CalendarPlus className="w-3.5 h-3.5" /> Add to Google Calendar
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

// ═══════════════════════════════════════════════════════════════════════════
// HOLIDAY DETAIL POPUP — dark theme aware
// ═══════════════════════════════════════════════════════════════════════════
function HolidayDetailPopup({ holiday, isAdmin, onClose, onEdit, onDelete, isDark }) {
  if (!holiday) return null;
  let dayOfWeek = '';
  try { dayOfWeek = format(parseISO(holiday.date), 'EEEE, MMMM d, yyyy'); } catch {}
  const daysLeft = (() => {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const hDate = parseISO(holiday.date); hDate.setHours(0, 0, 0, 0);
      const diff = Math.round((hDate - today) / 86400000);
      if (diff === 0) return 'Today!';
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
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : undefined }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-8 py-6 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.amber} 0%, #D97706 100%)` }}>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'white', transform: 'translate(30%, -30%)' }} />
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">🎉</div>
              <div>
                <p className="text-amber-100 text-xs font-bold uppercase tracking-widest mb-1">Public Holiday</p>
                <h2 className="text-2xl font-black leading-tight">{holiday.name}</h2>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all mt-1">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="p-8 space-y-4">
          <div
            className="flex items-center gap-3 p-4 rounded-2xl"
            style={{ backgroundColor: isDark ? `${COLORS.amber}18` : `${COLORS.amber}10`, border: `1.5px solid ${COLORS.amber}25` }}
          >
            <CalendarIcon className="w-5 h-5 flex-shrink-0" style={{ color: COLORS.amber }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Date</p>
              <p className="font-bold" style={{ color: isDark ? D.text : '#1e293b' }}>{dayOfWeek}</p>
            </div>
          </div>
          <div
            className="flex items-center gap-3 p-4 rounded-2xl"
            style={{ backgroundColor: isDark ? `${COLORS.deepBlue}28` : `${COLORS.deepBlue}08`, border: `1.5px solid ${COLORS.deepBlue}${isDark ? '40' : '18'}` }}
          >
            <Clock className="w-5 h-5 flex-shrink-0" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Countdown</p>
              <p className="font-bold" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>{daysLeft}</p>
            </div>
          </div>
          {holiday.type && (
            <div
              className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ backgroundColor: isDark ? D.raised : '#f8fafc', border: `1px solid ${isDark ? D.border : '#e2e8f0'}` }}
            >
              <Info className="w-5 h-5 flex-shrink-0" style={{ color: isDark ? D.muted : '#94a3b8' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Type</p>
                <p className="font-semibold capitalize" style={{ color: isDark ? D.text : '#374151' }}>{holiday.type}</p>
              </div>
            </div>
          )}
        </div>
        {isAdmin ? (
          <div
            className="px-8 py-5 flex justify-between items-center"
            style={{ borderTop: `1px solid ${isDark ? D.border : '#f1f5f9'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
          >
            <button
              onClick={() => { onDelete(holiday.date, holiday.name); onClose(); }}
              className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-400 active:scale-95 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            <div className="flex gap-2">
              <Button
                variant="ghost" onClick={onClose}
                className="font-bold rounded-xl active:scale-95 transition-all"
                style={{ color: isDark ? D.muted : undefined }}
              >
                Close
              </Button>
              <Button
                onClick={() => { onEdit(holiday); onClose(); }}
                className="font-bold text-white rounded-xl px-5 active:scale-95 transition-all"
                style={{ backgroundColor: COLORS.amber }}
              >
                <Edit2 className="w-4 h-4 mr-1.5" /> Edit
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="px-8 py-5 flex justify-end"
            style={{ borderTop: `1px solid ${isDark ? D.border : '#f1f5f9'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
          >
            <Button
              variant="ghost" onClick={onClose}
              className="font-bold rounded-xl active:scale-95 transition-all"
              style={{ color: isDark ? D.muted : undefined }}
            >
              Close
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER DETAIL POPUP — dark theme aware
// ═══════════════════════════════════════════════════════════════════════════
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
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : undefined }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-8 py-6 text-white relative overflow-hidden flex-shrink-0"
          style={{ background: isDue ? `linear-gradient(135deg, ${COLORS.red} 0%, #B91C1C 100%)` : `linear-gradient(135deg, ${COLORS.purple} 0%, #6D28D9 100%)` }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'white', transform: 'translate(30%, -30%)' }} />
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-4">
              <motion.div
                className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"
                animate={isDue ? { scale: [1, 1.1, 1] } : {}} transition={{ duration: 1, repeat: Infinity }}
              >
                <AlarmClock className="w-7 h-7 text-white" />
              </motion.div>
              <div>
                <p className="text-purple-200 text-xs font-bold uppercase tracking-widest mb-1">{isDue ? '⚠️ Overdue Reminder' : 'Upcoming Reminder'}</p>
                <h2 className="text-xl font-black leading-tight pr-2">{reminder.title}</h2>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all mt-1 flex-shrink-0">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="p-8 space-y-4 overflow-y-auto slim-scroll flex-1">
          <div
            className="flex items-center gap-3 p-4 rounded-2xl"
            style={{
              backgroundColor: isDark
                ? isDue ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)'
                : isDue ? `${COLORS.red}10` : `${COLORS.purple}10`,
              border: `1.5px solid ${isDue ? COLORS.red : COLORS.purple}25`,
            }}
          >
            <Clock className="w-5 h-5 flex-shrink-0" style={{ color: isDue ? COLORS.red : COLORS.purple }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Scheduled For</p>
              <p className="font-bold" style={{ color: isDark ? D.text : '#1e293b' }}>{formatReminderTime(reminder.remind_at)}</p>
              {isDue && <p className="text-xs text-red-500 font-semibold mt-0.5">This reminder is overdue</p>}
            </div>
          </div>
          {descLines.length > 0 && (
            <div
              className="p-4 rounded-2xl"
              style={{ backgroundColor: isDark ? D.raised : '#f8fafc', border: `1px solid ${isDark ? D.border : '#e2e8f0'}` }}
            >
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>Details</p>
              <div className="space-y-1.5">
                {descLines.map((line, i) => {
                  const colonIdx = line.indexOf(':');
                  if (colonIdx > 0 && colonIdx < 30) {
                    const label = line.slice(0, colonIdx);
                    const val   = line.slice(colonIdx + 1).trim();
                    if (val) return (
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="font-bold flex-shrink-0 min-w-[110px]" style={{ color: isDark ? D.muted : '#475569' }}>{label}:</span>
                        <span style={{ color: isDark ? D.text : '#374151' }}>{val}</span>
                      </div>
                    );
                  }
                  return <p key={i} className="text-sm italic" style={{ color: isDark ? D.muted : '#475569' }}>{line}</p>;
                })}
              </div>
            </div>
          )}
          <a
            href={gcalUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: COLORS.deepBlue }}
          >
            <CalendarPlus className="w-4 h-4" /> Add to Google Calendar
          </a>
        </div>
        <div
          className="px-8 py-5 flex justify-between items-center flex-shrink-0"
          style={{ borderTop: `1px solid ${isDark ? D.border : '#f1f5f9'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
        >
          {!isViewingOther ? (
            <div className="flex gap-2">
              <button
                onClick={() => { onEdit(reminderId); onClose(); }}
                className="flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-blue-300 active:scale-95 transition-all"
              >
                <Edit2 className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => { onDelete(reminderId); onClose(); }}
                className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-400 active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          ) : <div />}
          <Button
            variant="ghost" onClick={onClose}
            className="font-bold rounded-xl active:scale-95 transition-all"
            style={{ color: isDark ? D.muted : undefined }}
          >
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER EDIT MODAL — dark theme aware
// ═══════════════════════════════════════════════════════════════════════════
function ReminderEditModal({ reminder, isOpen, onClose, onSave, isDark }) {
  const [title,       setTitle]       = useState(reminder?.title || '');
  const [description, setDescription] = useState(reminder?.description ? stripHtml(reminder.description) : '');
  const [remindAt, setRemindAt] = useState(() => {
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

  const inputCls = `w-full px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 border`;
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
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : undefined }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-8 py-6 text-white bg-gradient-to-r from-blue-500 to-blue-600">
          <h2 className="text-xl font-bold">Edit Reminder</h2>
        </div>
        <div className="p-8 space-y-4">
          <div>
            <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Title</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              className={inputCls} style={inputStyle}
              placeholder="Reminder title"
            />
          </div>
          <div>
            <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              className={`${inputCls} resize-none`} style={inputStyle}
              rows={3} placeholder="Add details..."
            />
          </div>
          <div>
            <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Remind At</label>
            <input
              type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)}
              className={inputCls} style={inputStyle}
            />
          </div>
        </div>
        <div
          className="px-8 py-5 flex justify-end gap-2"
          style={{ borderTop: `1px solid ${isDark ? D.border : '#f1f5f9'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
        >
          <Button
            variant="ghost" onClick={onClose}
            className="font-bold rounded-xl"
            style={{ color: isDark ? D.muted : undefined }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave} disabled={isSaving}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER CALENDAR MODAL — dark theme aware
// ═══════════════════════════════════════════════════════════════════════════
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
        if (!d) return;
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
        style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : undefined }}
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.purple} 0%, #6D28D9 100%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><CalendarIcon className="w-5 h-5 text-white" /></div>
            <div>
              <h2 className="text-lg font-black text-white">Reminder Calendar</h2>
              <p className="text-purple-200 text-xs mt-0.5">{totalThisMonth} reminder{totalThisMonth !== 1 ? 's' : ''} this month</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={prevMonth} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg font-bold">‹</button>
            <span className="text-white font-bold text-sm w-32 text-center">{format(viewMonth, 'MMMM yyyy')}</span>
            <button onClick={nextMonth} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg font-bold">›</button>
            <button onClick={onClose}  className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white ml-1"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-7 mb-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div
                key={d}
                className="text-center text-[10px] font-bold uppercase tracking-wider py-1.5"
                style={{ color: isDark ? D.dimmer : '#94a3b8' }}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="min-h-[76px]" />;
              const dateStr    = format(day, 'yyyy-MM-dd');
              const dayRems    = remindersByDate[dateStr] || [];
              const isToday    = format(new Date(), 'yyyy-MM-dd') === dateStr;
              const hasDue     = dayRems.some(r => { try { return r.remind_at ? isPast(new Date(r.remind_at)) : false; } catch { return false; } });
              const hasRems    = dayRems.length > 0;
              return (
                <div
                  key={dateStr}
                  className="min-h-[76px] p-1.5 rounded-xl border transition-all cursor-pointer"
                  style={{
                    backgroundColor: hasRems
                      ? hasDue
                        ? isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2'
                        : isDark ? 'rgba(139,92,246,0.12)' : '#f5f3ff'
                      : isToday
                        ? isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff'
                        : isDark ? D.raised : '#ffffff',
                    borderColor: hasRems
                      ? hasDue
                        ? isDark ? '#7f1d1d' : '#fecaca'
                        : isDark ? '#4c1d95' : '#ddd6fe'
                      : isToday
                        ? isDark ? '#1d4ed8' : '#bfdbfe'
                        : isDark ? D.border : '#e2e8f0',
                  }}
                  onClick={() => dayRems.length > 0 && onClickReminder(dayRems[0])}
                >
                  <div
                    className={`text-xs font-bold mb-1 w-5 h-5 rounded-full flex items-center justify-center`}
                    style={{
                      backgroundColor: isToday ? '#3b82f6' : 'transparent',
                      color: isToday ? '#ffffff' : hasRems ? (hasDue ? COLORS.red : COLORS.purple) : isDark ? D.dimmer : '#94a3b8',
                    }}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayRems.slice(0, 3).map((r, idx) => {
                      const isDueR = (() => { try { return r.remind_at ? isPast(new Date(r.remind_at)) : false; } catch { return false; } })();
                      const rid    = resolveId(r);
                      return (
                        <motion.div
                          key={rid || idx}
                          whileHover={{ scale: 1.02 }}
                          onClick={() => onClickReminder(r)}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md truncate leading-tight cursor-pointer"
                          style={{
                            backgroundColor: isDueR ? isDark ? 'rgba(239,68,68,0.25)' : '#fee2e2' : isDark ? `${COLORS.purple}28` : `${COLORS.purple}18`,
                            color: isDueR ? COLORS.red : COLORS.purple,
                            border: `1px solid ${isDueR ? '#fca5a5' : COLORS.purple + '30'}`,
                          }}
                        >
                          {r.remind_at ? format(new Date(r.remind_at), 'h:mma') : '--'} {r.title}
                        </motion.div>
                      );
                    })}
                    {dayRems.length > 3 && (
                      <div onClick={() => onClickReminder(dayRems[3])} className="text-[9px] font-bold px-1 cursor-pointer hover:underline" style={{ color: COLORS.purple }}>
                        +{dayRems.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          className="px-6 py-4 flex justify-between items-center flex-shrink-0"
          style={{ borderTop: `1px solid ${isDark ? D.border : '#f1f5f9'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
        >
          <p className="text-xs font-medium" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
            {safeReminders.length} total · click any chip to open details
          </p>
          <Button
            variant="ghost" onClick={onClose}
            className="font-bold rounded-xl"
            style={{ color: isDark ? D.muted : undefined }}
          >
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Attendance() {
  const { user, hasPermission } = useAuth();
  const isDark = useDark();
  const isAdmin        = user?.role === 'admin';
  const canViewRankings = hasPermission('can_view_staff_rankings');

  // ── State ──────────────────────────────────────────────────────────────
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

  const [showPunchInModal,  setShowPunchInModal]  = useState(false);
  const [modalActionDone,   setModalActionDone]   = useState(false);
  const [showLeaveForm,     setShowLeaveForm]     = useState(false);
  const [showHolidayModal,  setShowHolidayModal]  = useState(false);
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
  const pdfInputRef = useRef(null);

  const [exportingPDF,       setExportingPDF]       = useState(false);
  const [trademarkData,      setTrademarkData]      = useState(null);
  const [trademarkLoading,   setTrademarkLoading]   = useState(false);
  const trademarkPdfRef = useRef(null);

  const [selectedHolidayDetail,  setSelectedHolidayDetail]  = useState(null);
  const [selectedReminderDetail, setSelectedReminderDetail] = useState(null);
  const [isEditModalOpen,        setIsEditModalOpen]        = useState(false);
  const [editingReminder,        setEditingReminder]        = useState(null);
  const [showEmailImporter,      setShowEmailImporter]      = useState(false);
  const [showReminderCalendar,   setShowReminderCalendar]   = useState(false);

  // ── Derived flags ────────────────────────────────────────────────────────
  const isEveryoneView  = isAdmin && selectedUserId === 'everyone';
  const isViewingOther  = isAdmin && !!selectedUserId && selectedUserId !== 'everyone';
  const todayDateStr    = format(new Date(), 'yyyy-MM-dd');

  const todayIsHoliday = useMemo(() =>
    (Array.isArray(holidays) ? holidays : []).some(h => h.date === todayDateStr && h.status === 'confirmed'),
    [holidays, todayDateStr]
  );

  const displayTodayAttendance = useMemo(() => {
    if (isViewingOther)
      return (Array.isArray(attendanceHistory) ? attendanceHistory : []).find(a => a.date === format(new Date(), 'yyyy-MM-dd')) || null;
    return todayAttendance;
  }, [isViewingOther, attendanceHistory, todayAttendance]);

  const displayLiveDuration = useMemo(() => {
    if (isViewingOther) return calculateTodayLiveDuration(displayTodayAttendance);
    return liveDuration;
  }, [isViewingOther, displayTodayAttendance, liveDuration]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { fetchData(); fetchReminders(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!isViewingOther && todayAttendance) {
      const shouldClose = todayAttendance.punch_in || todayAttendance.status === 'leave'
        || todayAttendance.status === 'absent' || todayIsHoliday || modalActionDone;
      if (shouldClose) { setShowPunchInModal(false); return; }
      const timer = setTimeout(() => setShowPunchInModal(true), 800);
      return () => clearTimeout(timer);
    }
  }, [todayAttendance, isViewingOther, todayIsHoliday, modalActionDone]);

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
        if (!rid) continue;
        if (r.is_dismissed || persistedFiredIds.has(rid)) continue;
        if (!r.remind_at) continue;
        const due = new Date(r.remind_at);
        if (isNaN(due.getTime())) continue;
        const diff = differenceInMinutes(due, now);
        if (diff <= 0 && diff >= -2) {
          addFiredId(rid);
          setFiredReminder(r);
          break;
        }
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
          toast.warning('⚠️ You have not punched in today! Auto-absent will be marked at 7:00 PM IST.', { duration: 10000, id: 'absent-warning' });
          absentWarningShownRef.current = true;
        }
      }
    };
    checkAbsentWarning();
    const id = setInterval(checkAbsentWarning, 60000);
    return () => clearInterval(id);
  }, [todayAttendance, isViewingOther, isEveryoneView]); // eslint-disable-line

  // ── Data Fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (overrideUserId = undefined) => {
    setLoading(true); setDataError(null);
    const rawTargetId   = isAdmin ? (overrideUserId !== undefined ? overrideUserId : selectedUserId) : null;
    const isEveryoneReq = isAdmin && rawTargetId === 'everyone';
    const isOtherReq    = isAdmin && !!rawTargetId && rawTargetId !== 'everyone';
    const resolvedUserId = isEveryoneReq ? null : isOtherReq ? rawTargetId : (isAdmin ? user?.id : null);
    try {
      let historyUrl;
      if (isEveryoneReq)     historyUrl = '/attendance/history';
      else if (resolvedUserId) historyUrl = `/attendance/history?user_id=${resolvedUserId}`;
      else                   historyUrl = '/attendance/history';

      const requests = [
        api.get(historyUrl).catch(() => ({ data: [] })),
        (isOtherReq || isEveryoneReq) ? Promise.resolve(null) : api.get('/attendance/my-summary').catch(() => ({ data: null })),
        api.get('/attendance/today').catch(() => ({ data: null })),
        api.get('/tasks').catch(() => ({ data: [] })),
        api.get('/holidays').catch(() => ({ data: [] })),
        canViewRankings ? api.get('/reports/performance-rankings?period=monthly').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ];
      const [historyRes, summaryRes, todayRes, tasksRes, holidaysRes, rankingRes] = await Promise.all(requests);

      const allHolidays = holidaysRes.data || [];
      setHolidays((Array.isArray(allHolidays) ? allHolidays : []).filter(h => h.status === 'confirmed'));
      if (isAdmin) setPendingHolidays((Array.isArray(allHolidays) ? allHolidays : []).filter(h => h.status === 'pending'));

      if (isAdmin && allUsers.length === 0) {
        try { const usersRes = await api.get('/users'); setAllUsers(usersRes.data || []); } catch {}
      }

      const history = historyRes.data || [];
      setAttendanceHistory(Array.isArray(history) ? history : []);

      if (todayRes.data !== null && todayRes.data !== undefined) {
        setTodayAttendance(todayRes.data); setDataError(null);
      } else {
        setDataError('Backend unreachable — it may be waking up (Render free tier). Please wait 30s and retry.');
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
      const myEntry     = rankingList.find(r => r.user_id === rankUserId);
      setMyRank(myEntry ? `#${myEntry.rank}` : '—');

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

  const fetchReminders = useCallback(async (overrideUserId = undefined) => {
    try {
      const uid = overrideUserId !== undefined ? overrideUserId : (isViewingOther ? selectedUserId : null);
      if (uid === 'everyone') return;
      const url = uid ? `/reminders?user_id=${uid}` : '/reminders';
      const res = await api.get(url);
      const normalized = (Array.isArray(res.data) ? res.data : []).map(normalizeReminder);
      setReminders(Array.isArray(normalized) ? normalized : []);
    } catch (err) {
      console.error('fetchReminders error:', err);
    }
  }, [isViewingOther, selectedUserId]);

  // ── Punch Action ───────────────────────────────────────────────────────────
  const handlePunchAction = useCallback(async (action, e) => {
    if (e) addAttRipple(e);
    setLoading(true);
    try {
      let locationData = null;
      if (navigator?.geolocation) {
        try {
          const position = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
          );
          locationData = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        } catch {}
      }
      const response = await api.post('/attendance', { action, location: locationData });
      if (action === 'punch_in') {
        toast.success('✓ Punched in successfully!', { duration: 3000 });
        setModalActionDone(true); setShowPunchInModal(false);
      } else {
        const duration = response.data?.duration || 0;
        toast.success(`✓ Punched out! (${formatDuration(duration)})`, { duration: 3000 });
      }
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance', { duration: 4000 });
    } finally { setLoading(false); }
  }, [fetchData]);

  // ── Leave ──────────────────────────────────────────────────────────────────
  const handleApplyLeave = useCallback(async () => {
    if (!leaveFrom) { toast.error('Select a leave start date'); return; }
    try {
      await api.post('/attendance/apply-leave', {
        from_date: format(leaveFrom, 'yyyy-MM-dd'),
        to_date:   leaveTo ? format(leaveTo, 'yyyy-MM-dd') : format(leaveFrom, 'yyyy-MM-dd'),
        reason:    leaveReason || 'Personal Leave',
      });
      toast.success('✓ Leave request submitted');
      setShowLeaveForm(false); setLeaveFrom(null); setLeaveTo(null); setLeaveReason('');
      await fetchData();
    } catch { toast.error('Failed to submit leave request'); }
  }, [leaveFrom, leaveTo, leaveReason, fetchData]);

  // ── Holidays ───────────────────────────────────────────────────────────────
  const handleAddHolidays = useCallback(async () => {
    const validRows = holidayRows.filter(r => r.name.trim() && r.date);
    if (validRows.length === 0) { toast.error('Add at least one holiday'); return; }
    let added = 0; const errors = [];
    for (const row of validRows) {
      try { await api.post('/holidays', { date: row.date, name: row.name.trim(), type: 'manual' }); added++; }
      catch (err) { errors.push(`${row.name}: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`); }
    }
    if (added > 0) toast.success(`✓ ${added} holiday${added > 1 ? 's' : ''} saved`);
    if (errors.length > 0) errors.forEach(e => toast.error(e, { duration: 7000 }));
    setShowHolidayModal(false); setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
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
      toast.success(`✓ ${extracted.length} holidays extracted — review and save`);
    } catch (err) { toast.error(`PDF extraction failed: ${err.message}`); }
    finally { setPdfImporting(false); }
  }, []);

  const handleEditHolidaySave = useCallback(async () => {
    if (!editName.trim() || !editDate) { toast.error('Name and date required'); return; }
    setEditLoading(true);
    try {
      await api.delete(`/holidays/${editingHoliday.date}`);
      await api.post('/holidays', { date: editDate, name: editName.trim(), type: editingHoliday.type || 'manual' });
      toast.success('✓ Holiday updated'); setEditingHoliday(null); await fetchData();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to update holiday'); }
    finally { setEditLoading(false); }
  }, [editingHoliday, editName, editDate, fetchData]);

  const handleDeleteHoliday = useCallback(async (date, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/holidays/${date}`); toast.success(`✓ "${name}" deleted`); await fetchData(); }
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
      else { toast.success(`✓ Absent marked for ${markedDate}: ${marked} user(s) marked absent`); await fetchData(); }
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to mark absent'); }
    finally { setAbsentLoading(false); }
  }, [fetchData]);

  // ── Reminder Create ────────────────────────────────────────────────────────
  const handleCreateReminder = useCallback(async () => {
    if (!reminderTitle.trim() || !reminderDatetime) { toast.error('Title and date/time are required'); return; }
    try {
      const res = await api.post('/reminders', {
        title:       reminderTitle.trim(),
        description: reminderDesc.trim() || null,
        remind_at:   reminderDatetime ? new Date(reminderDatetime).toISOString() : undefined,
      });
      toast.success('✓ Reminder set!');
      setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null);
      const newReminder = normalizeReminder(res.data);
      setReminders(prev => {
        const safe = Array.isArray(prev) ? prev : [];
        return [...safe, newReminder].sort((a, b) => {
          const da = a.remind_at ? new Date(a.remind_at) : new Date(0);
          const db = b.remind_at ? new Date(b.remind_at) : new Date(0);
          return da - db;
        });
      });
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
    if (!reminderId) {
      toast.error('Cannot update: reminder ID missing');
      return;
    }
    try {
      await api.patch(`/reminders/${reminderId}`, updates);
      await fetchReminders();
      toast.success('Reminder updated successfully');
      setIsEditModalOpen(false); setEditingReminder(null);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        toast.error('Reminder not found on server — refreshing list');
        await fetchReminders();
      } else {
        toast.error('Failed to update reminder');
      }
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
      if (data.application_no)  descLines.push(`Application No: ${data.application_no}`);
      if (data.class)           descLines.push(`Class: ${data.class}`);
      if (data.applicant_name)  descLines.push(`Applicant: ${data.applicant_name}`);
      if (data.recipient_name)  descLines.push(`Agent/Recipient: ${data.recipient_name}`);
      if (data.application_date) descLines.push(`Application Date: ${data.application_date}`);
      if (data.used_since)      descLines.push(`Used Since: ${data.used_since}`);
      if (data.hearing_date)    descLines.push(`Hearing Date: ${data.hearing_date}`);
      if (data.letter_date)     descLines.push(`Notice Date: ${data.letter_date}`);
      if (data.brand_name)      descLines.push(`Brand/Mark: ${data.brand_name}`);
      descLines.push('Hearing via Video Conferencing (Dynamic Utilities → Cause List → Trade Marks Show Cause & Review)');
      setReminderDesc(descLines.join('\n'));
      toast.success('✓ Details extracted — form auto-filled!');
    } catch (err) { toast.error(`PDF extraction failed: ${err?.response?.data?.detail || err?.message || 'Failed to read PDF'}`); }
    finally { setTrademarkLoading(false); }
  }, []);

  const handleDeleteReminder = useCallback(async (id) => {
    if (!id) {
      toast.error('Cannot delete: reminder ID is missing');
      return;
    }
    const idStr = String(id);
    const reminder   = (Array.isArray(reminders) ? reminders : []).find(r => resolveId(r) === idStr);
    const reminderId = resolveId(reminder) || idStr;
    if (!reminderId) {
      toast.error('Cannot delete: could not resolve reminder ID');
      return;
    }
    setReminders(prev =>
      (Array.isArray(prev) ? prev : []).filter(r => resolveId(r) !== reminderId)
    );
    try {
      await api.delete(`/reminders/${reminderId}`);
      toast.success('Reminder removed');
    } catch (err) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) {
        try {
          await api.patch(`/reminders/${reminderId}`, { is_dismissed: true });
          toast.success('Reminder removed');
        } catch {
          toast.success('Reminder removed');
        }
      } else {
        toast.error('Failed to delete reminder — please try again');
        await fetchReminders();
      }
    }
    if (reminder?.source === 'email_auto') {
      try {
        await api.patch(`/reminders/${reminderId}`, { is_dismissed: true }).catch(() => {});
      } catch {}
    }
  }, [reminders, fetchReminders]);

  const handleDismissPopup = useCallback(async () => {
    if (!firedReminder) return;
    const reminderId = resolveId(firedReminder);
    if (reminderId) {
      try { await api.patch(`/reminders/${reminderId}`, { is_dismissed: true }); } catch {}
      setReminders(prev =>
        (Array.isArray(prev) ? prev : []).map(r =>
          resolveId(r) === reminderId ? { ...r, is_dismissed: true } : r
        )
      );
      addFiredId(reminderId);
    }
    setFiredReminder(null);
  }, [firedReminder]);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    setExportingPDF(true);
    try {
      let employeeName;
      if (isAdmin && selectedUserId === 'everyone') employeeName = 'All Employees';
      else if (isAdmin && selectedUserId) employeeName = (Array.isArray(allUsers) ? allUsers : []).find(u => u.id === selectedUserId)?.full_name || 'Employee';
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
      doc.text(`Days Absent : ${absentCount}`, 10, 72);
      doc.text(`Late Arrivals : ${safeHistory.filter(a => a.is_late).length}`, 10, 80);
      doc.line(10, 88, 200, 88);
      doc.setFont(undefined, 'bold'); doc.setFontSize(11);
      doc.text('Attendance Log (Last 15 Records):', 10, 97);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
      doc.text('DATE', 10, 106); doc.text('STATUS', 48, 106); doc.text('PUNCH IN', 82, 106); doc.text('PUNCH OUT', 118, 106); doc.text('DURATION', 158, 106);
      doc.setDrawColor(180, 180, 180); doc.line(10, 108, 200, 108); doc.setTextColor(0, 0, 0);
      let y = 116;
      safeHistory.slice(0, 15).forEach((record, index) => {
        if (y > 270) { doc.addPage(); y = 20; }
        if (index % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(10, y - 5, 190, 9, 'F'); }
        doc.setFontSize(9);
        doc.text(format(parseISO(record.date), 'dd MMM yyyy'), 10, y);
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
      toast.success('✓ PDF exported!');
    } catch { toast.error('Failed to export PDF'); }
    finally { setExportingPDF(false); }
  }, [isAdmin, selectedUserId, allUsers, user, selectedDate, attendanceHistory]);

  // ── Derived / Memoised values ──────────────────────────────────────────────
  const monthAttendance = useMemo(() => {
    const start = startOfMonth(selectedDate), end = endOfMonth(selectedDate);
    let atts = (Array.isArray(attendanceHistory) ? attendanceHistory : []).filter(a => {
      try { const d = parseISO(a.date); return d >= start && d <= end; } catch { return false; }
    });
    if (displayTodayAttendance) {
      const todayStr = displayTodayAttendance.date;
      if (!atts.some(a => a.date === todayStr)) {
        try { const todayD = parseISO(todayStr); if (todayD >= start && todayD <= end) atts = [...atts, displayTodayAttendance]; } catch {}
      }
    }
    return atts;
  }, [attendanceHistory, displayTodayAttendance, selectedDate]);

  const monthTotalMinutes      = useMemo(() => monthAttendance.filter(a => a.status === 'present').reduce((sum, a) => sum + (a.duration_minutes || 0), 0), [monthAttendance]);
  const monthDaysPresent       = useMemo(() => monthAttendance.filter(a => a.punch_in && a.status === 'present').length, [monthAttendance]);
  const monthDaysAbsent        = useMemo(() => monthAttendance.filter(a => a.status === 'absent').length, [monthAttendance]);
  const totalDaysLateThisMonth = useMemo(() => monthAttendance.filter(a => a.punch_in && a.is_late).length, [monthAttendance]);
  const isTodaySelected = dateFnsIsToday(selectedDate);

  const selectedAttendance = isTodaySelected
    ? displayTodayAttendance
    : (Array.isArray(attendanceHistory) ? attendanceHistory : []).find(a => a.date === format(selectedDate, 'yyyy-MM-dd')) || null;

  const selectedHoliday = (Array.isArray(holidays) ? holidays : []).find(h => h.date === format(selectedDate, 'yyyy-MM-dd'));

  const attendanceMap = useMemo(() => {
    const map = {};
    (Array.isArray(attendanceHistory) ? attendanceHistory : []).forEach(a => { map[a.date] = a; });
    if (displayTodayAttendance) map[displayTodayAttendance.date] = displayTodayAttendance;
    return map;
  }, [attendanceHistory, displayTodayAttendance]);

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
      .filter(r => !r.is_dismissed)
      .sort((a, b) => {
        const da = a.remind_at ? new Date(a.remind_at) : new Date(0);
        const db = b.remind_at ? new Date(b.remind_at) : new Date(0);
        return da - db;
      }),
    [reminders]
  );

  const recentAttendance = useMemo(() => {
    const safe = Array.isArray(attendanceHistory) ? attendanceHistory : [];
    return isEveryoneView ? safe.slice(0, 25) : safe.slice(0, 15);
  }, [attendanceHistory, isEveryoneView]);

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

  const todayHolidayName = useMemo(() =>
    (Array.isArray(holidays) ? holidays : []).find(h => h.date === todayDateStr && h.status === 'confirmed')?.name || '',
    [holidays, todayDateStr]
  );

  // ── Dark-theme-aware shared styles ────────────────────────────────────────
  const cardBg    = isDark ? D.card    : '#ffffff';
  const cardBorder = isDark ? D.border : '#e2e8f0';
  const raisedBg  = isDark ? D.raised  : '#f8fafc';
  const pageBg    = isDark ? D.bg      : undefined;
  const textPrimary  = isDark ? D.text   : '#1e293b';
  const textMuted    = isDark ? D.muted  : '#64748b';
  const textDimmer   = isDark ? D.dimmer : '#94a3b8';
  const inputStyle   = {
    backgroundColor: isDark ? D.raised : '#ffffff',
    borderColor: isDark ? D.border : '#d1d5db',
    color: isDark ? D.text : '#1e293b',
  };
  const inputCls = `w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm`;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      {/* ── Reminder Popup ── */}
      <AnimatePresence>
        {firedReminder && <ReminderPopup reminder={firedReminder} onDismiss={handleDismissPopup} isDark={isDark} />}
      </AnimatePresence>

      {/* ── Holiday Detail ── */}
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

      {/* ── Reminder Detail ── */}
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

      {/* ── Reminder Edit ── */}
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

      {/* ── Reminder Calendar ── */}
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

      <motion.div
        className="min-h-screen overflow-y-auto p-5 md:p-7 lg:p-9"
        style={{
          background: isDark
            ? D.bg
            : `linear-gradient(135deg, ${COLORS.slate50} 0%, #FFFFFF 100%)`,
        }}
        variants={containerVariants} initial="hidden" animate="visible"
      >
        {/* ── PAGE HEADER ── */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1
              className="text-4xl font-black tracking-tight"
              style={{ color: isDark ? D.text : COLORS.deepBlue, letterSpacing: '-0.02em' }}
            >
              {isAdmin ? 'Attendance Management' : 'My Attendance'}
            </h1>
            <p className="mt-2 text-sm font-medium" style={{ color: textMuted }}>
              {isAdmin
                ? 'Manage team attendance — auto-absent marks at 7:00 PM IST daily'
                : 'Track your daily hours — auto-absent at 7:00 PM if not punched in'}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            {isAdmin && (
              <motion.select
                variants={itemVariants}
                className="rounded-xl px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-medium cursor-pointer border-2 transition-colors"
                style={{
                  ...inputStyle,
                  borderColor: isDark ? D.border : '#e2e8f0',
                }}
                value={selectedUserId || ''}
                onChange={e => {
                  const val = e.target.value || null;
                  setSelectedUserId(val);
                  fetchData(val);
                  fetchReminders(val);
                }}
              >
                <option value="">{allUsers.length === 0 ? 'Loading users…' : user?.full_name ? `${user.full_name} (Admin)` : 'My Attendance'}</option>
                <option value="everyone">👥 Everyone (All Users)</option>
                {(Array.isArray(allUsers) ? allUsers : []).filter(u => u.id !== user?.id).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role === 'admin' ? 'Admin' : u.role})</option>
                ))}
              </motion.select>
            )}
            {isAdmin && (
              <Button
                onClick={(e) => { addAttRipple(e); handleMarkAbsentBulk(); }}
                disabled={absentLoading} variant="outline"
                className="att-ripple-btn border-2 font-semibold rounded-xl px-4 py-2.5"
                style={{
                  borderColor: isDark ? '#7f1d1d' : '#fecaca',
                  color: isDark ? '#f87171' : '#b91c1c',
                  backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : undefined,
                }}
              >
                <UserX className="w-4 h-4 mr-2" />
                {absentLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Marking…</> : 'Mark Absent Now'}
              </Button>
            )}
            <Button
              onClick={handleExportPDF} disabled={exportingPDF} variant="outline"
              className="att-ripple-btn border-2 rounded-xl px-5 py-2.5 font-semibold"
              style={{
                borderColor: isDark ? D.border : '#e2e8f0',
                color: isDark ? D.muted : '#374151',
                backgroundColor: isDark ? D.raised : undefined,
              }}
            >
              {exportingPDF ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting…</> : '↓ Export PDF'}
            </Button>
          </div>
        </motion.div>

        {/* ── ALERTS ── */}
        {dataError && (
          <motion.div
            variants={itemVariants}
            className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2"
            style={{
              borderColor: isDark ? '#7f1d1d' : '#fecaca',
              backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2',
            }}
          >
            <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-bold text-red-500">Connection error: </span>
              <span className="text-sm" style={{ color: isDark ? '#fca5a5' : '#dc2626' }}>{dataError}</span>
            </div>
            <button
              onClick={() => fetchData()}
              className="text-red-400 text-xs font-bold underline ml-2 hover:text-red-300"
            >
              Retry
            </button>
          </motion.div>
        )}
        {absentCountdown && !isViewingOther && !isEveryoneView && (
          <motion.div
            variants={itemVariants}
            className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 absent-pulse"
            style={{
              borderColor: isDark ? '#991b1b' : '#fca5a5',
              backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fff1f2',
            }}
          >
            <motion.div animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 0.9, repeat: Infinity }}>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </motion.div>
            <span className="text-sm font-bold flex-1" style={{ color: isDark ? '#f87171' : '#991b1b' }}>
              ⚠️ You haven't punched in today! {absentCountdown}
            </span>
            <Button
              size="sm"
              onClick={(e) => { addAttRipple(e); handlePunchAction('punch_in'); }}
              className="att-ripple-btn bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg px-4"
            >
              <LogIn className="w-4 h-4 mr-1" /> Punch In Now
            </Button>
          </motion.div>
        )}
        {(isViewingOther || isEveryoneView) && (
          <motion.div
            variants={itemVariants}
            className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2"
            style={{
              borderColor: isDark ? '#1d4ed8' : '#bfdbfe',
              backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff',
            }}
          >
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold" style={{ color: isDark ? '#93c5fd' : '#1e40af' }}>
              {isEveryoneView
                ? 'Viewing attendance for all employees'
                : <>Viewing attendance for: <span className="underline decoration-dotted">{viewedUserName}</span></>}
            </span>
            <button
              className="ml-auto text-blue-400 hover:text-blue-300 text-xs font-bold underline"
              onClick={() => { setSelectedUserId(null); fetchData(null); fetchReminders(null); }}
            >
              Clear — show my data
            </button>
          </motion.div>
        )}

        {/* ── TODAY STATUS HERO ── */}
        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-0 shadow-xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div className="text-white space-y-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center"
                        animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Clock className="w-8 h-8 text-white" />
                      </motion.div>
                      <div>
                        <h3 className="text-2xl font-bold">
                          {isTodaySelected
                            ? (isViewingOther ? `${viewedUserName}'s Status` : "Today's Status")
                            : format(selectedDate, 'EEEE, MMM d')}
                        </h3>
                        <p className="text-blue-100 text-sm mt-0.5">
                          {isViewingOther ? 'Read-only view' : 'Real-time attendance • Auto-absent at 7:00 PM IST'}
                        </p>
                      </div>
                    </div>
                    {todayIsHoliday && (
                      <div className="backdrop-blur rounded-xl p-4" style={{ backgroundColor: 'rgba(245,158,11,0.25)' }}>
                        <p className="text-sm font-bold text-amber-200">🎉 Today is a holiday{todayHolidayName ? ` — ${todayHolidayName}` : ''}</p>
                      </div>
                    )}
                    {displayTodayAttendance?.status === 'absent' && (
                      <motion.div className="backdrop-blur rounded-xl p-4" style={{ backgroundColor: 'rgba(239,68,68,0.25)' }}>
                        <p className="text-sm font-bold text-red-200">❌ Marked as Absent today{displayTodayAttendance.auto_marked ? ' (auto-marked at 7:00 PM)' : ''}</p>
                      </motion.div>
                    )}
                    {displayTodayAttendance?.punch_in && (
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-2">
                        <p className="text-blue-100 text-sm">
                          <span className="font-semibold">In:</span> {formatAttendanceTime(displayTodayAttendance.punch_in)}
                          {displayTodayAttendance.punch_out && <> • <span className="font-semibold">Out:</span> {formatAttendanceTime(displayTodayAttendance.punch_out)}</>}
                        </p>
                      </div>
                    )}
                    {displayTodayAttendance?.status === 'leave' && (
                      <div className="backdrop-blur rounded-xl p-4" style={{ backgroundColor: 'rgba(249,115,22,0.2)' }}>
                        <p className="text-sm font-semibold text-orange-200">🟠 On leave today</p>
                      </div>
                    )}
                    {!isViewingOther && (
                      <div className="flex gap-3 flex-wrap pt-2">
                        {!todayAttendance?.punch_in && todayAttendance?.status !== 'absent' ? (
                          <>
                            {isTodaySelected && (
                              <motion.button
                                whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                                onClick={(e) => handlePunchAction('punch_in', e)} disabled={loading}
                                className={`att-ripple-btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg ${!loading ? 'punch-in-pulse' : ''}`}
                              >
                                {loading
                                  ? <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Punching In…</>
                                  : <><LogIn className="w-5 h-5 inline mr-2" />Punch In</>}
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              onClick={() => setShowLeaveForm(true)}
                              className="att-ripple-btn border-2 border-white text-white font-bold px-6 py-2.5 rounded-xl hover:bg-white/10"
                            >
                              Apply Leave
                            </motion.button>
                          </>
                        ) : !todayAttendance?.punch_out && todayAttendance?.punch_in && isTodaySelected ? (
                          <motion.button
                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                            onClick={(e) => handlePunchAction('punch_out', e)} disabled={loading}
                            className="att-ripple-btn bg-white/20 hover:bg-white/30 backdrop-blur text-white font-bold px-6 py-2.5 rounded-xl"
                          >
                            {loading
                              ? <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Punching Out…</>
                              : <><LogOut className="w-5 h-5 inline mr-2" />Punch Out</>}
                          </motion.button>
                        ) : todayAttendance?.punch_out ? (
                          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <Badge className="px-4 py-2 bg-white/20 text-white border-0 font-mono text-sm">
                              ✓ {formatDuration(todayAttendance.duration_minutes)}
                            </Badge>
                          </motion.div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center">
                    <LiveClock />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── PENDING HOLIDAY REVIEW ── */}
        {isAdmin && Array.isArray(pendingHolidays) && pendingHolidays.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card
              className="shadow-md"
              style={{
                backgroundColor: isDark ? D.card : '#fffbeb',
                border: `2px solid ${isDark ? '#78350f' : '#fde68a'}`,
              }}
            >
              <div
                className="px-6 py-3 flex items-center"
                style={{ backgroundColor: isDark ? '#1c1508' : '#fef9c3', borderBottom: `1px solid ${isDark ? '#78350f' : '#fde68a'}` }}
              >
                <AlertTriangle className="w-5 h-5 mr-3" style={{ color: COLORS.amber }} />
                <span className="text-sm font-black uppercase" style={{ color: isDark ? '#fbbf24' : '#92400e' }}>
                  Holiday Review ({pendingHolidays.length})
                </span>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingHolidays.map(holiday => (
                    <motion.div
                      key={holiday.date} variants={itemVariants}
                      className="p-5 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 border-2"
                      style={{
                        backgroundColor: cardBg,
                        borderColor: isDark ? '#78350f' : '#fde68a',
                      }}
                    >
                      <h4 className="font-bold text-lg mb-2" style={{ color: textPrimary }}>{holiday.name}</h4>
                      <p className="text-sm mb-4" style={{ color: textMuted }}>
                        {format(parseISO(holiday.date), 'EEEE, MMMM do, yyyy')}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                          onClick={() => handleHolidayDecision(holiday.date, 'confirmed')}>Confirm</Button>
                        <Button size="sm" variant="outline" className="flex-1 font-bold rounded-lg"
                          style={{ borderColor: isDark ? '#991b1b' : '#fca5a5', color: isDark ? '#f87171' : '#dc2626', backgroundColor: isDark ? 'rgba(239,68,68,0.06)' : undefined }}
                          onClick={() => handleHolidayDecision(holiday.date, 'rejected')}>Reject</Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── ABSENT SUMMARY ── */}
        {isAdmin && Array.isArray(absentSummary) && absentSummary.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card
              className="shadow-md"
              style={{
                backgroundColor: cardBg,
                border: `2px solid ${isDark ? '#7f1d1d' : '#fee2e2'}`,
              }}
            >
              <div
                className="px-6 py-4 flex items-center gap-3"
                style={{
                  backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fff1f2',
                  borderBottom: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}`,
                }}
              >
                <UserX className="w-5 h-5 text-red-500" />
                <span className="text-sm font-black uppercase" style={{ color: isDark ? '#f87171' : '#991b1b' }}>
                  Absent This Month — {absentSummary.length} Staff
                </span>
                <span className="ml-auto text-xs font-medium" style={{ color: isDark ? '#f87171' : '#ef4444' }}>
                  Auto-marked at 7:00 PM IST
                </span>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {absentSummary.map(item => (
                    <motion.div
                      key={item.user_id} whileHover={{ scale: 1.03 }}
                      className="flex items-center gap-3 p-3 rounded-xl border"
                      style={{
                        backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2',
                        borderColor: isDark ? '#7f1d1d' : '#fecaca',
                      }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.25)' : '#fecaca' }}>
                        <span className="font-bold text-sm text-red-500">{(item.user_name || '?')[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{item.user_name || 'Unknown'}</p>
                        <p className="text-xs font-semibold text-red-500">{item.absent_days} day{item.absent_days !== 1 ? 's' : ''} absent</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── STAT CARDS ── */}
        <motion.div
          className={`grid gap-4 mb-8 items-stretch ${canViewRankings ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}
        >
          <StatCard isDark={isDark} icon={Timer}        label={isEveryoneView ? 'Total (All Staff)' : 'This Month'} value={formatDuration(monthTotalMinutes).split('h')[0]} unit="hours"     color={COLORS.deepBlue}     trend={`${monthDaysPresent} days present`} />
          <StatCard isDark={isDark} icon={CheckCircle2} label="Tasks Done"    value={tasksCompleted}        unit="completed"  color={COLORS.emeraldGreen} trend=" " />
          <StatCard isDark={isDark} icon={CalendarX}    label="Days Late"     value={totalDaysLateThisMonth} unit="this month" color={COLORS.orange}       trend=" " />
          <StatCard isDark={isDark} icon={UserX}        label="Days Absent"   value={monthDaysAbsent}         unit="this month" color={COLORS.red}          trend={monthDaysAbsent > 0 ? 'Auto-marked at 7 PM' : 'Perfect attendance!'} />
          {canViewRankings && !isEveryoneView && (
            <StatCard isDark={isDark} icon={TrendingUp} label={isViewingOther ? 'Their Rank' : 'Your Rank'} value={myRank} unit="overall" color={COLORS.deepBlue} trend=" " />
          )}
        </motion.div>

        {/* ── DAILY PROGRESS ── */}
        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card
              className="border-0 shadow-md overflow-hidden"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: textDimmer }}>Daily Progress</p>
                    <motion.p
                      key={displayLiveDuration}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="text-5xl font-black tracking-tight mb-1"
                      style={{ color: displayTodayAttendance?.status === 'absent' ? COLORS.red : todayIsHoliday ? COLORS.amber : COLORS.emeraldGreen }}
                    >
                      {displayTodayAttendance?.status === 'absent' ? 'Absent' : todayIsHoliday ? 'Holiday' : displayLiveDuration}
                    </motion.p>
                    <p
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: displayTodayAttendance?.status === 'absent' ? COLORS.red : todayIsHoliday ? COLORS.amber : COLORS.emeraldGreen }}
                    >
                      {displayTodayAttendance?.status === 'absent' ? '❌ Auto-marked absent'
                        : todayIsHoliday ? '🎉 Office closed today'
                        : (!isViewingOther && displayTodayAttendance?.punch_in && !displayTodayAttendance?.punch_out
                            ? '● Live • updating every minute'
                            : 'Total for today')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div
                      className="p-4 rounded-xl border"
                      style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff', borderColor: isDark ? '#1d4ed8' : '#bfdbfe' }}
                    >
                      <p className="text-xs font-bold uppercase mb-1" style={{ color: textDimmer }}>Daily Goal</p>
                      <p className="text-2xl font-bold" style={{ color: textPrimary }}>8.5h</p>
                    </div>
                    <div
                      className="p-4 rounded-xl border"
                      style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4', borderColor: isDark ? '#14532d' : '#bbf7d0' }}
                    >
                      <p className="text-xs font-bold uppercase mb-1" style={{ color: textDimmer }}>Progress</p>
                      <p className="text-2xl font-bold text-emerald-500">
                        {displayTodayAttendance?.status === 'absent' ? '0%' : todayIsHoliday ? '—' : `${progressPct}%`}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  className="mt-6 rounded-full h-3 overflow-hidden"
                  style={{ backgroundColor: isDark ? D.raised : '#f1f5f9' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: displayTodayAttendance?.status === 'absent'
                      ? `linear-gradient(90deg, ${COLORS.red}, #FCA5A5)`
                      : todayIsHoliday
                        ? `linear-gradient(90deg, ${COLORS.amber}, #FCD34D)`
                        : `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}
                    initial={{ width: 0 }}
                    animate={{ width: displayTodayAttendance?.status === 'absent' ? '100%' : todayIsHoliday ? '100%' : `${progressPct}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── HOLIDAY + REMINDER CARDS ── */}
        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

            {/* HOLIDAY CARD */}
            {(() => {
              const monthHolidaysGrid = (Array.isArray(holidays) ? holidays : []).filter(h => {
                try { return format(parseISO(h.date), 'yyyy-MM') === format(selectedDate, 'yyyy-MM'); } catch { return false; }
              });
              return (
                <Card
                  className="border-0 shadow-md overflow-hidden flex flex-col"
                  style={{ maxHeight: 320, backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
                >
                  <div
                    className="px-5 py-3 flex items-center justify-between flex-shrink-0"
                    style={{
                      background: isDark
                        ? `linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.04))`
                        : `linear-gradient(135deg, ${COLORS.amber}18, ${COLORS.amber}08)`,
                      borderBottom: `2px solid ${isDark ? 'rgba(245,158,11,0.2)' : `${COLORS.amber}25`}`,
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : `${COLORS.amber}22` }}
                      >
                        <span className="text-base">🎉</span>
                      </div>
                      <div>
                        <h3 className="font-black text-sm" style={{ color: isDark ? D.text : COLORS.deepBlue }}>
                          Holidays — {format(selectedDate, 'MMM yyyy')}
                        </h3>
                        <p className="text-[11px] font-medium leading-none mt-0.5" style={{ color: textDimmer }}>
                          {monthHolidaysGrid.length} holiday{monthHolidaysGrid.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        onClick={() => { setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); setShowHolidayModal(true); }}
                        size="sm" className="att-ripple-btn font-bold rounded-lg text-white h-8 px-3 text-xs"
                        style={{ backgroundColor: COLORS.amber }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto slim-scroll p-3 space-y-1.5 min-h-0">
                    {monthHolidaysGrid.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-8">
                        <span className="text-3xl block mb-2">🗓️</span>
                        <p className="font-medium text-xs" style={{ color: textDimmer }}>No holidays this month</p>
                      </div>
                    ) : monthHolidaysGrid.map(h => (
                      <motion.div
                        key={h.date}
                        className="relative flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer group transition-all hover:shadow-sm"
                        style={{ borderColor: isDark ? 'rgba(245,158,11,0.22)' : `${COLORS.amber}35`, backgroundColor: isDark ? 'rgba(245,158,11,0.06)' : `${COLORS.amber}06` }}
                        whileHover={{ backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : `${COLORS.amber}12` }}
                        onClick={() => setSelectedHolidayDetail(h)}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}
                        >
                          <span className="text-[8px] leading-none uppercase">{format(parseISO(h.date), 'MMM')}</span>
                          <span className="text-sm leading-none font-black">{format(parseISO(h.date), 'd')}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{h.name}</p>
                          <p className="text-[11px] font-medium" style={{ color: textMuted }}>
                            {format(parseISO(h.date), 'EEEE')}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? D.dimmer : '#cbd5e1' }} />
                        {isAdmin && (
                          <div className="absolute right-8 flex gap-1 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => { setEditingHoliday(h); setEditName(h.name); setEditDate(h.date); }}
                              className="w-6 h-6 flex items-center justify-center rounded text-blue-400 hover:bg-blue-500/20"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteHoliday(h.date, h.name)}
                              className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </Card>
              );
            })()}

            {/* REMINDER CARD */}
            <Card
              className="border-0 shadow-md overflow-hidden flex flex-col"
              style={{ maxHeight: 320, backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div
                className="px-5 py-3 flex items-center justify-between flex-shrink-0"
                style={{
                  background: isDark
                    ? `linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.04))`
                    : `linear-gradient(135deg, ${COLORS.purple}18, ${COLORS.purple}08)`,
                  borderBottom: `2px solid ${isDark ? 'rgba(139,92,246,0.2)' : `${COLORS.purple}25`}`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : `${COLORS.purple}20` }}>
                    <AlarmClock className="w-4 h-4" style={{ color: COLORS.purple }} />
                  </div>
                  <div>
                    <h3
                      className="font-black text-sm cursor-pointer hover:underline"
                      style={{ color: isDark ? D.text : COLORS.deepBlue }}
                      onClick={() => setShowReminderCalendar(true)} title="Click to view full calendar"
                    >
                      {isViewingOther ? `${viewedUserName?.split(' ')[0]}'s Reminders` : 'Reminders & Meetings'}
                    </h3>
                    <p className="text-[11px] font-medium leading-none mt-0.5" style={{ color: textDimmer }}>
                      {upcomingReminders.length} upcoming ·{' '}
                      <span className="cursor-pointer hover:underline" style={{ color: COLORS.purple }} onClick={() => setShowReminderCalendar(true)}>📅 calendar view</span>
                    </p>
                  </div>
                </div>
                {!isViewingOther && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setShowEmailImporter(true)} size="sm" variant="outline"
                      className="font-bold rounded-lg h-8 px-3 text-xs"
                      style={{
                        borderColor: isDark ? 'rgba(139,92,246,0.4)' : '#ddd6fe',
                        color: isDark ? '#c4b5fd' : '#7c3aed',
                        backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : undefined,
                      }}
                    >
                      <Mail className="w-3.5 h-3.5 mr-1" /> From Email
                    </Button>
                    <Button
                      onClick={() => setShowReminderForm(true)} size="sm"
                      className="att-ripple-btn font-bold rounded-lg text-white h-8 px-3 text-xs"
                      style={{ backgroundColor: COLORS.purple }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> New
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto slim-scroll p-3 space-y-1.5 min-h-0">
                {upcomingReminders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8">
                    <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: isDark ? D.dimmer : '#cbd5e1' }} />
                    <p className="font-medium text-xs text-center" style={{ color: textDimmer }}>
                      {isViewingOther ? 'No upcoming reminders' : 'No reminders yet. Create one!'}
                    </p>
                  </div>
                ) : upcomingReminders.map((r, index) => {
                  const isDue = r.remind_at ? isPast(new Date(r.remind_at)) : false;
                  const rid   = resolveId(r);
                  return (
                    <motion.div
                      key={rid || `idx-${index}`}
                      className="relative flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer group transition-all hover:shadow-sm hover:-translate-y-0.5"
                      style={{
                        borderColor: isDue ? isDark ? '#7f1d1d' : `${COLORS.red}35` : isDark ? 'rgba(139,92,246,0.22)' : `${COLORS.purple}25`,
                        backgroundColor: isDue ? isDark ? 'rgba(239,68,68,0.08)' : `${COLORS.red}06` : isDark ? 'rgba(139,92,246,0.06)' : `${COLORS.purple}05`,
                      }}
                      whileHover={{ backgroundColor: isDue ? isDark ? 'rgba(239,68,68,0.14)' : `${COLORS.red}10` : isDark ? 'rgba(139,92,246,0.12)' : `${COLORS.purple}10` }}
                      onClick={() => setSelectedReminderDetail(r)}
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 font-black text-xs"
                        style={{
                          backgroundColor: isDue ? isDark ? 'rgba(239,68,68,0.2)' : `${COLORS.red}18` : isDark ? 'rgba(139,92,246,0.2)' : `${COLORS.purple}18`,
                          color: isDue ? COLORS.red : COLORS.purple,
                        }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate leading-snug" style={{ color: textPrimary }}>{r.title}</p>
                        <p className="text-[11px] font-mono font-semibold truncate" style={{ color: isDue ? COLORS.red : COLORS.purple }}>
                          ⏰ {formatReminderTime(r.remind_at)}
                        </p>
                      </div>
                      {isDue && (
                        <span
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase flex-shrink-0 hidden sm:block"
                          style={{ color: COLORS.red, backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2' }}
                        >
                          Due
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? D.dimmer : '#cbd5e1' }} />
                      {!isViewingOther && (
                        <div className="absolute right-8 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { if (rid) handleDeleteReminder(rid); else toast.error('Cannot delete: ID missing'); }}
                            className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20 active:scale-90 transition-all"
                            title="Delete reminder"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ── CALENDAR + RECENT ATTENDANCE ── */}
        <motion.div className={`grid gap-8 items-stretch ${isEveryoneView ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-3'}`}>
          {!isEveryoneView && (
            <motion.div variants={itemVariants} className="xl:col-span-1 space-y-6 h-full flex flex-col">
              <Card
                className="border-0 shadow-md flex-shrink-0"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-black" style={{ color: isDark ? D.text : COLORS.deepBlue }}>
                      <CalendarIcon className="w-5 h-5" /> Attendance Calendar
                    </CardTitle>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setSelectedDate(new Date())}
                      className="text-xs font-bold"
                      style={{ color: isDark ? D.muted : undefined }}
                    >
                      Today
                    </Button>
                  </div>
                  <CardDescription className="text-xs" style={{ color: textDimmer }}>Click a date for details</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <Calendar
                    mode="single" selected={selectedDate}
                    onSelect={date => date && setSelectedDate(date)}
                    disabled={date => isAfter(date, new Date())}
                    className="rounded-xl border-0 shadow-sm"
                    classNames={{
                      months: 'w-full', month: 'w-full space-y-3', table: 'w-full border-collapse',
                      head_row: 'flex w-full justify-between mb-2',
                      head_cell: 'rounded-lg w-9 font-bold text-[0.75rem] text-center',
                      row: 'flex w-full mt-2 justify-between',
                      cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                      day: 'h-10 w-10 p-0 font-semibold rounded-full transition-all',
                      day_today: 'font-black',
                    }}
                    style={{ color: isDark ? D.text : undefined }}
                    components={{ Day: props => <CustomDay {...props} attendance={attendanceMap} holidays={holidays} /> }}
                  />
                  <div className="flex flex-wrap gap-x-3 gap-y-2 mt-6 text-xs justify-center border-t pt-4"
                    style={{ borderColor: isDark ? D.border : '#e2e8f0' }}>
                    {[
                      { color: COLORS.emeraldGreen, label: 'Present'     },
                      { color: COLORS.red,          label: 'Late/Absent' },
                      { color: COLORS.amber,        label: 'Holiday'     },
                      { color: COLORS.orange,       label: 'Leave'       },
                    ].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: color, backgroundColor: `${color}25` }} />
                        <span style={{ color: textMuted }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Selected Date Detail */}
              <Card
                className="border-0 shadow-md overflow-hidden flex-1 min-h-0"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <CardContent className="p-0 h-full overflow-y-auto">
                  {selectedAttendance?.status === 'absent' ? (
                    <div
                      className="p-6 border-l-4 h-full"
                      style={{ borderColor: COLORS.red, backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2' }}
                    >
                      <p className="font-bold text-lg mb-1 text-red-500">❌ Absent</p>
                      <p className="text-sm" style={{ color: textMuted }}>{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                    </div>
                  ) : selectedAttendance?.punch_in ? (
                    <div
                      className="p-6 border-l-4 h-full"
                      style={{ borderColor: COLORS.emeraldGreen, backgroundColor: isDark ? 'rgba(31,175,90,0.06)' : '#f0fdf4' }}
                    >
                      <p className="font-bold text-lg mb-4" style={{ color: textPrimary }}>{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium" style={{ color: textMuted }}>Punch In</span>
                          <span className="font-mono font-bold" style={{ color: textPrimary }}>{formatAttendanceTime(selectedAttendance.punch_in)}</span>
                        </div>
                        {selectedAttendance.punch_out && (
                          <div className="flex justify-between">
                            <span className="font-medium" style={{ color: textMuted }}>Punch Out</span>
                            <span className="font-mono font-bold" style={{ color: textPrimary }}>{formatAttendanceTime(selectedAttendance.punch_out)}</span>
                          </div>
                        )}
                        {selectedAttendance.is_late && (
                          <div className="flex justify-between">
                            <span className="font-medium" style={{ color: textMuted }}>Status</span>
                            <span className="text-xs font-bold text-red-500 uppercase px-2 py-1 rounded"
                              style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2' }}>Late</span>
                          </div>
                        )}
                        <div className="pt-3 flex justify-between" style={{ borderTop: `1px solid ${isDark ? D.border : '#e2e8f0'}` }}>
                          <span className="font-bold" style={{ color: textPrimary }}>Duration</span>
                          <Badge className="font-mono font-bold" style={{ backgroundColor: COLORS.emeraldGreen, color: 'white' }}>
                            {formatDuration(selectedAttendance.duration_minutes)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : selectedAttendance?.status === 'leave' ? (
                    <div
                      className="p-6 border-l-4 h-full"
                      style={{ borderColor: COLORS.orange, backgroundColor: isDark ? 'rgba(249,115,22,0.06)' : '#fff7ed' }}
                    >
                      <p className="font-bold text-lg mb-1" style={{ color: COLORS.orange }}>🟠 On Leave</p>
                      <p className="text-sm" style={{ color: textMuted }}>{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                    </div>
                  ) : selectedHoliday ? (
                    <div
                      className="p-6 border-l-4 h-full"
                      style={{ borderColor: COLORS.amber, backgroundColor: isDark ? 'rgba(245,158,11,0.06)' : '#fffbeb' }}
                    >
                      <p className="text-sm font-bold" style={{ color: isDark ? '#fbbf24' : '#92400e' }}>🎉 {selectedHoliday.name}</p>
                    </div>
                  ) : (
                    <div
                      className="p-6 border-l-4 h-full"
                      style={{ borderColor: COLORS.red, backgroundColor: isDark ? 'rgba(239,68,68,0.06)' : '#fef2f2' }}
                    >
                      <p className="text-sm font-bold" style={{ color: isDark ? '#f87171' : '#991b1b' }}>
                        No record for {format(selectedDate, 'MMM d')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* RECENT ATTENDANCE TABLE */}
          <motion.div variants={itemVariants} className={isEveryoneView ? '' : 'xl:col-span-2 h-full'}>
            <Card
              className="border-0 shadow-md h-full"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <CardHeader className="py-3" style={{ borderBottom: `1px solid ${isDark ? D.border : '#f1f5f9'}` }}>
                <CardTitle style={{ color: isDark ? D.text : COLORS.deepBlue }}>
                  {isEveryoneView ? 'All Employees — Recent Attendance' : 'Recent Attendance'}
                </CardTitle>
                <CardDescription style={{ color: textDimmer }}>
                  {isEveryoneView ? 'Latest 25 records' : 'Last 15 records'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {loading && attendanceHistory.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <motion.div
                      className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                    <span className="ml-3 font-medium" style={{ color: textMuted }}>Loading…</span>
                  </div>
                ) : recentAttendance.length === 0 ? (
                  <p className="text-center py-12 font-medium" style={{ color: textMuted }}>No records yet</p>
                ) : (
                  <div className="space-y-2 max-h-[700px] overflow-y-auto slim-scroll">
                    {recentAttendance.map((record, idx) => {
                      const inLocLabel     = getLocationLabel(record, 'in');
                      const outLocLabel    = getLocationLabel(record, 'out');
                      const recordUserName = isEveryoneView ? (userMap[record.user_id] || record.user_id) : null;
                      const isAbsent       = record.status === 'absent';
                      const isLeave        = record.status === 'leave';
                      const isPresent      = record.punch_in && record.status === 'present';
                      return (
                        <motion.div
                          key={`${record.date}-${record.user_id || idx}`}
                          variants={itemVariants} whileHover={{ x: 2 }}
                          className="p-3 rounded-lg transition-all border"
                          style={{
                            backgroundColor: isDark
                              ? isAbsent ? 'rgba(239,68,68,0.08)' : isLeave ? 'rgba(249,115,22,0.06)' : isPresent ? 'rgba(31,175,90,0.06)' : D.raised
                              : isAbsent ? '#fff1f2' : isLeave ? '#fff7ed' : isPresent ? '#f0fdf4' : '#f8fafc',
                            borderColor: isDark
                              ? isAbsent ? '#7f1d1d' : isLeave ? '#7c2d12' : isPresent ? '#14532d' : D.border
                              : isAbsent ? '#fecaca' : isLeave ? '#fed7aa' : isPresent ? '#bbf7d0' : '#e2e8f0',
                            borderLeftWidth: 4,
                            borderLeftColor: isAbsent ? COLORS.red : isLeave ? COLORS.orange : isPresent ? COLORS.emeraldGreen : isDark ? D.border : COLORS.slate200,
                          }}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {recordUserName && (
                                <p className="text-xs font-bold mb-1 flex items-center gap-1 text-blue-400">
                                  <Users className="w-3 h-3" />{recordUserName}
                                </p>
                              )}
                              <p className="font-bold text-sm" style={{ color: textPrimary }}>
                                {format(parseISO(record.date), 'EEE, MMM d, yyyy')}
                              </p>
                              <p className="text-xs mt-1 font-mono" style={{ color: textMuted }}>
                                {isAbsent ? `❌ Absent${record.auto_marked ? ' (auto-marked)' : ''}`
                                  : isLeave ? '🟠 On Leave'
                                  : record.punch_in ? `${formatAttendanceTime(record.punch_in)} → ${record.punch_out ? formatAttendanceTime(record.punch_out) : 'Ongoing'}`
                                  : '—'}
                              </p>
                              {inLocLabel && !isAbsent && (
                                <p className="text-[11px] mt-1 flex items-start gap-1" style={{ color: textDimmer }}>
                                  <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: COLORS.emeraldGreen }} />
                                  <span><span className="font-semibold text-emerald-500">In: </span>{inLocLabel}</span>
                                </p>
                              )}
                              {outLocLabel && !isAbsent && (
                                <p className="text-[11px] mt-0.5 flex items-start gap-1" style={{ color: textDimmer }}>
                                  <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: COLORS.orange }} />
                                  <span><span className="font-semibold text-orange-400">Out: </span>{outLocLabel}</span>
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {isAbsent ? (
                                <span
                                  className="text-[10px] font-black uppercase px-2 py-1 rounded text-red-500"
                                  style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2' }}
                                >
                                  Absent
                                </span>
                              ) : isLeave ? (
                                <span
                                  className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                                  style={{ color: COLORS.orange, backgroundColor: isDark ? 'rgba(249,115,22,0.15)' : `${COLORS.orange}20` }}
                                >
                                  Leave
                                </span>
                              ) : (
                                <Badge
                                  className="font-mono text-xs font-bold px-2 py-1"
                                  style={{
                                    backgroundColor: record.duration_minutes > 0 ? isDark ? 'rgba(31,175,90,0.2)' : `${COLORS.emeraldGreen}20` : isDark ? D.raised : COLORS.slate200,
                                    color: record.duration_minutes > 0 ? COLORS.emeraldGreen : isDark ? D.muted : COLORS.deepBlue,
                                  }}
                                >
                                  {formatDuration(record.duration_minutes)}
                                </Badge>
                              )}
                              {record.is_late && !isAbsent && (
                                <span
                                  className="text-[10px] font-bold uppercase px-2 py-1 rounded text-red-500"
                                  style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2' }}
                                >
                                  Late
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* ══ MODALS ══ */}

        {/* Punch In Modal */}
        <AnimatePresence>
          {showPunchInModal && !isViewingOther && !isEveryoneView && (
            <motion.div
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPunchInModal(false)}
            >
              <motion.div
                className="rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
                style={{ backgroundColor: cardBg, border: isDark ? `1px solid ${D.border}` : undefined }}
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              >
                <div className="mb-6">
                  <motion.div
                    className="mx-auto w-20 h-20 rounded-3xl flex items-center justify-center punch-in-pulse"
                    style={{ backgroundColor: isDark ? 'rgba(31,175,90,0.18)' : '#dcfce7' }}
                  >
                    <LogIn className="w-10 h-10 text-emerald-500" />
                  </motion.div>
                </div>
                <h2 className="text-3xl font-black mb-3" style={{ color: isDark ? D.text : COLORS.deepBlue }}>Good Morning! 👋</h2>
                <p className="text-lg mb-2" style={{ color: textMuted }}>Let's punch in and start your day</p>
                <p className="text-xs text-red-500 font-semibold mb-8">⚠️ Auto-absent marks at 7:00 PM if you don't punch in</p>
                <Button
                  onClick={(e) => handlePunchAction('punch_in', e)} disabled={loading}
                  className="att-ripple-btn w-full mb-4 py-3 text-lg font-bold rounded-2xl text-white"
                  style={{ backgroundColor: COLORS.emeraldGreen }}
                >
                  {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Punching In…</> : 'Punch In Now'}
                </Button>
                <button
                  onClick={() => setShowPunchInModal(false)}
                  className="text-sm underline"
                  style={{ color: textDimmer }}
                >
                  I'll do it later
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leave Form Modal */}
        <AnimatePresence>
          {showLeaveForm && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
                style={{ backgroundColor: cardBg, border: isDark ? `1px solid ${D.border}` : undefined }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              >
                <div className="flex justify-between items-start mb-8">
                  <h2 className="text-2xl font-black" style={{ color: isDark ? D.text : COLORS.deepBlue }}>Request Leave</h2>
                  <button onClick={() => setShowLeaveForm(false)} className="text-2xl font-light" style={{ color: textDimmer }}>✕</button>
                </div>
                <div className="mb-8">
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 7, 15, 30].map(days => (
                      <Button
                        key={days} variant="outline" size="sm"
                        onClick={() => { const from = new Date(), to = new Date(); to.setDate(from.getDate() + days - 1); setLeaveFrom(from); setLeaveTo(to); }}
                        className="rounded-lg font-semibold"
                        style={{ borderColor: isDark ? D.border : undefined, color: isDark ? D.text : undefined, backgroundColor: isDark ? D.raised : undefined }}
                      >
                        {days === 1 ? '1 Day' : `${days} Days`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div>
                    <label className="text-sm font-bold mb-3 block" style={{ color: isDark ? D.muted : '#374151' }}>From Date</label>
                    <Calendar
                      mode="single" selected={leaveFrom} onSelect={setLeaveFrom}
                      disabled={date => isBefore(date, startOfDay(new Date()))}
                      className="rounded-xl border"
                      style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold mb-3 block" style={{ color: isDark ? D.muted : '#374151' }}>To Date</label>
                    <Calendar
                      mode="single" selected={leaveTo} onSelect={setLeaveTo}
                      disabled={date => leaveFrom ? isBefore(date, leaveFrom) : true}
                      className="rounded-xl border"
                      style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }}
                    />
                  </div>
                </div>
                {leaveFrom && (
                  <motion.div
                    className="p-5 rounded-2xl mb-8"
                    style={{ backgroundColor: isDark ? `${COLORS.deepBlue}28` : `${COLORS.deepBlue}10`, borderLeft: `4px solid ${COLORS.deepBlue}` }}
                  >
                    <p className="text-xs font-medium mb-1" style={{ color: textMuted }}>Total Duration</p>
                    <p className="text-2xl font-black" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                      {Math.max(1, leaveTo ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1 : 1)} days
                    </p>
                  </motion.div>
                )}
                <div className="mb-8">
                  <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Reason</label>
                  <textarea
                    value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                    placeholder="Reason for leave…"
                    className="w-full min-h-[100px] p-4 border-2 rounded-xl focus:outline-none focus:border-blue-400 resize-none"
                    style={inputStyle}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setShowLeaveForm(false)} style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
                  <Button
                    disabled={!leaveFrom} onClick={handleApplyLeave}
                    className="font-bold text-white"
                    style={{ backgroundColor: COLORS.deepBlue }}
                  >
                    Submit Request
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Holiday Modal */}
        <AnimatePresence>
          {showHolidayModal && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden"
                style={{ backgroundColor: cardBg, border: isDark ? `1px solid ${D.border}` : undefined }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              >
                <div className="px-8 py-6 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.amber} 0%, #D97706 100%)` }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-black">Add Holidays</h2>
                    <button onClick={() => setShowHolidayModal(false)} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfImport} className="hidden" />
                  <button
                    onClick={() => pdfInputRef.current?.click()} disabled={pdfImporting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border-2 border-white/30 text-white hover:bg-white/15"
                  >
                    {pdfImporting ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting…</> : <><FileUp className="w-4 h-4" />Import from PDF</>}
                  </button>
                </div>
                <div className="p-8">
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto slim-scroll mb-6">
                    {holidayRows.map((row, idx) => (
                      <motion.div key={idx} className="grid grid-cols-[1fr_160px_40px] gap-3 items-center">
                        <input
                          type="text" value={row.name}
                          onChange={e => { const updated = [...holidayRows]; updated[idx] = { ...updated[idx], name: e.target.value }; setHolidayRows(updated); }}
                          placeholder="e.g., Diwali"
                          className={`${inputCls} focus:border-amber-400`}
                          style={inputStyle}
                        />
                        <input
                          type="date" value={row.date}
                          onChange={e => { const updated = [...holidayRows]; updated[idx] = { ...updated[idx], date: e.target.value }; setHolidayRows(updated); }}
                          className={`${inputCls} focus:border-amber-400`}
                          style={inputStyle}
                        />
                        <button
                          onClick={() => setHolidayRows(holidayRows.filter((_, i) => i !== idx))}
                          disabled={holidayRows.length === 1}
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-xl font-bold disabled:opacity-30"
                          style={{ color: isDark ? D.dimmer : '#94a3b8' }}
                        >
                          ×
                        </button>
                      </motion.div>
                    ))}
                  </div>
                  <button
                    onClick={() => setHolidayRows([...holidayRows, { name: '', date: format(new Date(), 'yyyy-MM-dd') }])}
                    className="flex items-center gap-2 text-sm font-bold mb-6"
                    style={{ color: COLORS.amber }}
                  >
                    <span className="w-6 h-6 rounded-full border-2 border-amber-500 flex items-center justify-center">+</span>
                    Add Another
                  </button>
                </div>
                <div
                  className="px-8 py-5 flex justify-end gap-3"
                  style={{ borderTop: `1px solid ${isDark ? D.border : '#e2e8f0'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
                >
                  <Button variant="ghost" onClick={() => setShowHolidayModal(false)} style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
                  <Button
                    disabled={holidayRows.filter(r => r.name.trim() && r.date).length === 0}
                    onClick={handleAddHolidays}
                    className="font-bold text-white"
                    style={{ backgroundColor: COLORS.amber }}
                  >
                    Save
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Holiday Modal */}
        <AnimatePresence>
          {editingHoliday && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                style={{ backgroundColor: cardBg, border: isDark ? `1px solid ${D.border}` : undefined }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              >
                <div className="px-8 py-6 text-white flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
                  <h2 className="text-xl font-black">Edit Holiday</h2>
                  <button onClick={() => setEditingHoliday(null)} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="p-8 space-y-5">
                  <div>
                    <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Holiday Name</label>
                    <input
                      type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className={`${inputCls} py-3 focus:border-amber-400`}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Date</label>
                    <input
                      type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                      className={`${inputCls} py-3 focus:border-amber-400`}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div
                  className="px-8 py-5 flex justify-end gap-3"
                  style={{ borderTop: `1px solid ${isDark ? D.border : '#e2e8f0'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
                >
                  <Button variant="ghost" onClick={() => setEditingHoliday(null)} style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
                  <Button
                    disabled={!editName.trim() || !editDate || editLoading}
                    onClick={handleEditHolidaySave}
                    className="font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}
                  >
                    {editLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Save Changes</>}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* New Reminder Modal */}
        <AnimatePresence>
          {showReminderForm && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
                style={{ backgroundColor: cardBg, border: isDark ? `1px solid ${D.border}` : undefined }}
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              >
                <div className="px-8 py-6 text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.purple} 0%, #6D28D9 100%)` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><AlarmClock className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-2xl font-black">New Reminder</h2>
                        <p className="text-purple-200 text-sm mt-0.5">Manual entry or auto-fill from PDF</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null); }}
                      className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <input ref={trademarkPdfRef} type="file" accept=".pdf" onChange={handleTrademarkPdfUpload} className="hidden" />
                    <button
                      onClick={() => trademarkPdfRef.current?.click()} disabled={trademarkLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-white/30 text-white hover:bg-white/15 disabled:opacity-60"
                    >
                      {trademarkLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Reading PDF…</> : <><FileUp className="w-4 h-4" />Upload Notice PDF</>}
                    </button>
                  </div>
                </div>
                <div className="p-8 space-y-5 overflow-y-auto slim-scroll flex-1">
                  {trademarkData && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl overflow-hidden border-2"
                      style={{ borderColor: isDark ? 'rgba(139,92,246,0.35)' : '#ddd6fe' }}
                    >
                      <div
                        className="px-4 py-2.5 flex items-center gap-2"
                        style={{ background: isDark ? `rgba(139,92,246,0.15)` : `${COLORS.purple}15` }}
                      >
                        <CheckCircle2 className="w-4 h-4" style={{ color: COLORS.purple }} />
                        <span className="text-xs font-black uppercase tracking-widest" style={{ color: COLORS.purple }}>Extracted from PDF</span>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {[
                          { label: 'Application No', value: trademarkData.application_no, bold: true },
                          { label: 'Class',           value: trademarkData.class                     },
                          { label: 'Applicant',       value: trademarkData.applicant_name,  bold: true },
                          { label: 'Hearing Date',    value: trademarkData.hearing_date               },
                        ].filter(f => f.value).map(({ label, value, bold }) => (
                          <div key={label}>
                            <p className="text-[10px] uppercase font-bold" style={{ color: textDimmer }}>{label}</p>
                            <p className={`mt-0.5 ${bold ? 'font-bold' : 'font-medium'}`} style={{ color: textPrimary }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  <div>
                    <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Title *</label>
                    <input
                      type="text" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)}
                      placeholder="e.g., Trademark Hearing, GST filing…"
                      className={`${inputCls} py-3 focus:border-purple-400`}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Date &amp; Time *</label>
                    <input
                      type="datetime-local" value={reminderDatetime} onChange={e => setReminderDatetime(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                      className={`${inputCls} py-3 focus:border-purple-400`}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Description</label>
                    <textarea
                      value={reminderDesc} onChange={e => setReminderDesc(e.target.value)}
                      placeholder="Add notes, agenda, details…" rows={4}
                      className={`${inputCls} py-3 resize-none font-mono focus:border-purple-400`}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div
                  className="px-8 py-5 flex justify-end gap-3 flex-shrink-0"
                  style={{ borderTop: `1px solid ${isDark ? D.border : '#e2e8f0'}`, backgroundColor: isDark ? D.raised : '#f8fafc' }}
                >
                  <Button
                    variant="ghost"
                    onClick={() => { setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null); }}
                    style={{ color: isDark ? D.muted : undefined }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!reminderTitle.trim() || !reminderDatetime} onClick={handleCreateReminder}
                    className="font-bold text-white px-6"
                    style={{ backgroundColor: COLORS.purple }}
                  >
                    <Bell className="w-4 h-4 mr-2" /> Set Reminder
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

      </motion.div>
    </TooltipProvider>
  );
}
