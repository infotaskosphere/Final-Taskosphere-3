import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { formatInTimeZone } from "date-fns-tz";
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Zap,
  Users,
  Bell,
  BellRing,
  Plus,
  Trash2,
  ExternalLink,
  X,
  CalendarPlus,
  AlarmClock,
  MapPin,
  UserX,
  ShieldAlert,
  Edit2,
  FileUp,
  Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTION STYLES — injected once
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
  .att-ripple-btn {
    position: relative;
    overflow: hidden;
  }
  .att-ripple-btn .att-ripple {
    position: absolute;
    border-radius: 50%;
    transform: scale(0);
    background: rgba(255,255,255,0.35);
    animation: att-ripple 0.55s linear;
    pointer-events: none;
  }
  .punch-in-pulse {
    animation: att-pulse-green 1.8s ease-in-out infinite;
  }
  .absent-pulse {
    animation: att-pulse-red 1.5s ease-in-out infinite;
  }
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
// BRAND COLORS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  amber: '#F59E0B',
  orange: '#F97316',
  red: '#EF4444',
  slate50: '#F8FAFC',
  slate200: '#E2E8F0',
  purple: '#8B5CF6',
};
const IST_TIMEZONE = 'Asia/Kolkata';
const ABSENT_CUTOFF_HOUR_IST = 19;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

if (typeof document !== 'undefined' && !document.getElementById('roboto-mono-font')) {
  const link = document.createElement('link');
  link.id = 'roboto-mono-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(link);
}

// ═══════════════════════════════════════════════════════════════════════════
// DIGITAL CLOCK
// ═══════════════════════════════════════════════════════════════════════════
function DigitalClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  const istString = time.toLocaleString('en-US', {
    timeZone: IST_TIMEZONE, hour12: true,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const [timePart, rawPeriod] = istString.split(' ');
  const [hh, mm, ss] = timePart.split(':');
  const period = rawPeriod || 'AM';
  const dayDate = formatInTimeZone(time, IST_TIMEZONE, 'EEEE, MMMM d, yyyy');
  const MONO = { fontFamily: "'Roboto Mono', 'Courier New', monospace" };
  return (
    <div className="flex flex-col justify-between rounded-2xl overflow-hidden select-none"
      style={{
        background: 'linear-gradient(170deg, #071a2e 0%, #0c2d52 40%, #0D3B66 70%, #1a4f82 100%)',
        boxShadow: '0 12px 40px rgba(7,26,46,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        minHeight: 180,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="flex items-center justify-between px-5 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
        <div className="flex items-center gap-2">
          <motion.div className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
          <span className="text-[9px] font-medium tracking-[0.22em] uppercase text-slate-400" style={MONO}>LIVE · IST</span>
        </div>
        <span className="text-[9px] font-medium text-slate-500 tracking-widest" style={MONO}>UTC +5:30</span>
      </div>
      <div className="flex items-center justify-center px-5 py-5 gap-0">
        <span className="text-white leading-none" style={{ ...MONO, fontSize: 58, fontWeight: 700, letterSpacing: '0.02em' }}>{hh}</span>
        <motion.span className="text-blue-400/80 leading-none mx-1"
          style={{ ...MONO, fontSize: 48, fontWeight: 300, marginBottom: 2 }}
          animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>:</motion.span>
        <span className="text-white leading-none" style={{ ...MONO, fontSize: 58, fontWeight: 700, letterSpacing: '0.02em' }}>{mm}</span>
        <div className="flex flex-col items-start justify-center ml-2 gap-0.5" style={{ marginBottom: 2 }}>
          <span className="text-slate-300/60 leading-none" style={{ ...MONO, fontSize: 20, fontWeight: 400 }}>{ss}</span>
          <span className="leading-none font-semibold tracking-widest" style={{ ...MONO, fontSize: 11, color: '#60a5fa' }}>{period}</span>
        </div>
      </div>
      <div className="px-5 py-2.5 text-center"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.22)' }}>
        <span className="text-[10px] font-medium tracking-[0.16em] uppercase text-slate-400" style={MONO}>{dayDate}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, unit, color = COLORS.deepBlue, trend = null, onClick }) {
  return (
    <motion.div variants={itemVariants} className="h-full" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
      <Card
        onClick={onClick}
        className={`border-0 shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden h-full ${onClick ? 'cursor-pointer' : ''}`}
        style={{ background: `linear-gradient(135deg, white 60%, ${color}08 100%)` }}
      >
        <CardContent className="p-6 h-full flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black tracking-tight" style={{ color }}>{value}</p>
                {unit && <p className="text-sm font-medium text-slate-400">{unit}</p>}
              </div>
            </div>
            <motion.div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ml-3"
              style={{ backgroundColor: `${color}18` }}
              whileHover={{ scale: 1.12, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <Icon className="w-6 h-6" style={{ color }} />
            </motion.div>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium h-4">{trend || ''}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
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
const buildGCalURL = (reminder) => {
  try {
    const start = new Date(reminder.remind_at);
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
    if (data?.display_name) {
      return data.display_name.split(',').slice(0, 3).join(',').trim();
    }
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
// CUSTOM CALENDAR DAY
// ═══════════════════════════════════════════════════════════════════════════
function CustomDay({ date, displayMonth, attendance = {}, holidays = [] }) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayRecord = attendance[dateStr];
  const holiday = holidays.find(h => h.date === dateStr);
  let ringColor = null, bgColor = null, isSpecial = false;
  if (holiday) {
    ringColor = COLORS.amber; bgColor = '#FEF3C720'; isSpecial = true;
  } else if (dayRecord?.status === 'leave') {
    ringColor = COLORS.orange; bgColor = '#FFF7ED20'; isSpecial = true;
  } else if (dayRecord?.status === 'absent') {
    ringColor = COLORS.red; bgColor = '#FEE2E240'; isSpecial = true;
  } else if (dayRecord?.punch_in && dayRecord?.is_late) {
    ringColor = COLORS.red; bgColor = '#FEE2E220'; isSpecial = true;
  } else if (dayRecord?.punch_in) {
    ringColor = COLORS.emeraldGreen; bgColor = '#D1FAE520';
  }
  const isTodayDate = dateFnsIsToday(date);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 hover:bg-slate-100 active:scale-95">
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
          <span className={`relative z-10 text-[13px] leading-none select-none ${isTodayDate ? 'font-black' : 'font-medium'}`}
            style={
              isTodayDate && ringColor ? { color: COLORS.deepBlue }
              : isTodayDate && !ringColor ? { color: COLORS.red }
              : undefined
            }>
            {date.getDate()}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-bold mb-1">{format(date, 'MMM d, yyyy')}</p>
        {holiday ? (
          <p className="text-amber-600 font-medium">🎉 {holiday.name}</p>
        ) : dayRecord?.status === 'leave' ? (
          <p className="font-medium" style={{ color: COLORS.orange }}>
            🟠 On Leave{dayRecord.leave_reason ? ` — ${dayRecord.leave_reason}` : ''}
          </p>
        ) : dayRecord?.status === 'absent' ? (
          <p className="font-medium text-red-600">
            ❌ Absent{dayRecord.auto_marked ? ' (auto-marked at 7:00 PM)' : ''}
          </p>
        ) : dayRecord?.punch_in ? (
          <>
            <p>In: {formatAttendanceTime(dayRecord.punch_in)}</p>
            {dayRecord.punch_out && <p>Out: {formatAttendanceTime(dayRecord.punch_out)}</p>}
            <p className="font-semibold" style={{ color: COLORS.emeraldGreen }}>{formatDuration(dayRecord.duration_minutes)}</p>
            {dayRecord.is_late && <p className="text-red-500 font-semibold">Late arrival</p>}
          </>
        ) : dateFnsIsToday(date) ? (
          <div>
            <p className="text-red-600 font-bold">⚠️ Not punched in yet</p>
            <p className="text-slate-400 text-[10px] mt-1">Auto-absent marks at 7:00 PM IST</p>
          </div>
        ) : (
          <p className="text-slate-400 font-medium">No record</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REMINDER POPUP
// ═══════════════════════════════════════════════════════════════════════════
function ReminderPopup({ reminder, onDismiss }) {
  return (
    <motion.div
      className="fixed top-6 right-6 z-[99999] w-96 max-w-[calc(100vw-2rem)]"
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className="rounded-2xl shadow-2xl overflow-hidden border border-purple-200"
        style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: COLORS.purple }}>
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.4 }}>
              <BellRing className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-white font-bold text-sm uppercase tracking-wider">Reminder</span>
          </div>
          <button onClick={onDismiss} className="text-purple-200 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="font-black text-slate-800 text-lg leading-snug mb-1">{reminder.title}</p>
          {reminder.description && <p className="text-slate-600 text-sm mb-3">{reminder.description}</p>}
          <p className="text-xs text-slate-400 font-medium mb-4">⏰ {formatReminderTime(reminder.remind_at)}</p>
          <div className="flex gap-3">
            <a href={buildGCalURL(reminder)} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: COLORS.deepBlue }}>
              <CalendarPlus className="w-3.5 h-3.5" />
              Add to Google Calendar
            </a>
            <button onClick={onDismiss}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border-2 border-slate-200 hover:bg-slate-50 active:scale-95 transition-all">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Attendance() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canViewRankings = hasPermission('can_view_staff_rankings');
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [mySummary, setMySummary] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [pendingHolidays, setPendingHolidays] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [myRank, setMyRank] = useState('—');
  const [locationCache, setLocationCache] = useState({});
  const [absentLoading, setAbsentLoading] = useState(false);
  const [absentSummary, setAbsentSummary] = useState([]);
  const [dataError, setDataError] = useState(null);
  const absentWarningShownRef = useRef(false);
  const [showPunchInModal, setShowPunchInModal] = useState(false);
  const [modalActionDone, setModalActionDone] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [leaveFrom, setLeaveFrom] = useState(null);
  const [leaveTo, setLeaveTo] = useState(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [holidayRows, setHolidayRows] = useState([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
  const [liveDuration, setLiveDuration] = useState('0h 0m');
  const [reminders, setReminders] = useState([]);
  const [firedReminder, setFiredReminder] = useState(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDesc, setReminderDesc] = useState('');
  const [reminderDatetime, setReminderDatetime] = useState('');
  const firedIdsRef = useRef(new Set());
  const [pdfImporting, setPdfImporting] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const pdfInputRef = useRef(null);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [trademarkData, setTrademarkData] = useState(null);
  const [trademarkLoading, setTrademarkLoading] = useState(false);
  const trademarkPdfRef = useRef(null);

  const isEveryoneView = isAdmin && selectedUserId === 'everyone';
  const isViewingOther = isAdmin && !!selectedUserId && selectedUserId !== 'everyone';
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const todayIsHoliday = useMemo(
    () => holidays.some(h => h.date === todayDateStr && h.status === 'confirmed'),
    [holidays, todayDateStr]
  );
  const displayTodayAttendance = useMemo(() => {
    if (isViewingOther) {
      return attendanceHistory.find(a => a.date === format(new Date(), 'yyyy-MM-dd')) || null;
    }
    return todayAttendance;
  }, [isViewingOther, attendanceHistory, todayAttendance]);
  const displayLiveDuration = useMemo(() => {
    if (isViewingOther) return calculateTodayLiveDuration(displayTodayAttendance);
    return liveDuration;
  }, [isViewingOther, displayTodayAttendance, liveDuration]);

  useEffect(() => { fetchData(); fetchReminders(); }, []);
  useEffect(() => {
    if (!isViewingOther && todayAttendance) {
      const shouldClose =
        todayAttendance.punch_in ||
        todayAttendance.status === 'leave' ||
        todayAttendance.status === 'absent' ||
        todayIsHoliday ||
        modalActionDone;
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
  useEffect(() => {
    const check = () => {
      const now = new Date();
      for (const r of reminders) {
        if (r.is_dismissed || firedIdsRef.current.has(r.id)) continue;
        const due = new Date(r.remind_at);
        if (isNaN(due.getTime())) continue;
        const diff = differenceInMinutes(due, now);
        if (diff <= 0 && diff >= -2) { firedIdsRef.current.add(r.id); setFiredReminder(r); break; }
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [reminders]);
  useEffect(() => {
    const resolveLocations = async () => {
      const toResolve = [];
      for (const record of attendanceHistory.slice(0, 15)) {
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
  }, [attendanceHistory]);
  useEffect(() => {
    if (isViewingOther || isEveryoneView) return;
    const checkAbsentWarning = () => {
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
      const hour = nowIST.getHours();
      const minute = nowIST.getMinutes();
      if (hour === 18 && minute >= 30 && !absentWarningShownRef.current) {
        if (!todayAttendance?.punch_in && todayAttendance?.status !== 'leave' && !todayIsHoliday) {
          toast.warning('⚠️ You have not punched in today! Auto-absent will be marked at 7:00 PM IST.', { duration: 10000, id: 'absent-warning' });
          absentWarningShownRef.current = true;
        }
      }
    };
    checkAbsentWarning();
    const id = setInterval(checkAbsentWarning, 60000);
    return () => clearInterval(id);
  }, [todayAttendance, isViewingOther, isEveryoneView]);

  const fetchData = useCallback(async (overrideUserId = undefined) => {
    setLoading(true);
    setDataError(null);
    const rawTargetId = isAdmin ? (overrideUserId !== undefined ? overrideUserId : selectedUserId) : null;
    const isEveryoneReq = isAdmin && rawTargetId === 'everyone';
    const isOtherReq = isAdmin && !!rawTargetId && rawTargetId !== 'everyone';
    const resolvedUserId = isEveryoneReq ? null : isOtherReq ? rawTargetId : (isAdmin ? user?.id : null);
    try {
      let historyUrl;
      if (isEveryoneReq) historyUrl = '/attendance/history';
      else if (resolvedUserId) historyUrl = `/attendance/history?user_id=${resolvedUserId}`;
      else historyUrl = '/attendance/history';
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
      setHolidays(allHolidays.filter(h => h.status === 'confirmed'));
      if (isAdmin) setPendingHolidays(allHolidays.filter(h => h.status === 'pending'));
      if (isAdmin && allUsers.length === 0) {
        try { const usersRes = await api.get('/users'); setAllUsers(usersRes.data || []); }
        catch (e) { console.error('Failed to fetch users:', e); }
      }
      const history = historyRes.data || [];
      setAttendanceHistory(history);
      if (todayRes.data !== null && todayRes.data !== undefined) {
        setTodayAttendance(todayRes.data); setDataError(null);
      } else {
        setDataError('Backend unreachable — it may be waking up (Render free tier). Please wait 30s and retry.');
      }
      if (isOtherReq) {
        const monthlySummary = {};
        history.forEach(a => {
          const m = a.date?.slice(0, 7);
          if (!m) return;
          if (!monthlySummary[m]) monthlySummary[m] = { total_minutes: 0, days_present: 0 };
          if (a.punch_in && a.status === 'present') {
            monthlySummary[m].total_minutes += a.duration_minutes || 0;
            monthlySummary[m].days_present += 1;
          }
        });
        setMySummary({
          total_minutes: history.reduce((s, a) => s + (a.status === 'present' ? (a.duration_minutes || 0) : 0), 0),
          total_days: history.filter(a => a.punch_in && a.status === 'present').length,
          monthly_summary: Object.entries(monthlySummary).map(([month, d]) => {
            const h = Math.floor(d.total_minutes / 60), m = d.total_minutes % 60;
            return { month, ...d, total_hours: `${h}h ${m}m` };
          }),
        });
      } else if (isEveryoneReq) {
        const total_minutes = history.reduce((s, a) => s + (a.status === 'present' ? (a.duration_minutes || 0) : 0), 0);
        setMySummary({ total_minutes, total_days: history.filter(a => a.punch_in && a.status === 'present').length, monthly_summary: [] });
      } else {
        setMySummary(summaryRes?.data ?? null);
      }
      const allTasksData = tasksRes.data || [];
      const relevantTasks = isOtherReq ? allTasksData.filter(t => t.assigned_to === rawTargetId) : allTasksData;
      setTasksCompleted(relevantTasks.filter(t => t.status === 'completed').length);
      const rankingList = Array.isArray(rankingRes.data) ? rankingRes.data : (rankingRes.data?.rankings || rankingRes.data?.data || []);
      const rankUserId = isOtherReq ? rawTargetId : user?.id;
      const myEntry = rankingList.find(r => r.user_id === rankUserId);
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
      console.error('Attendance fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, isAdmin, canViewRankings, user?.id, allUsers.length]);

  const fetchReminders = useCallback(async (overrideUserId = undefined) => {
    try {
      const uid = overrideUserId !== undefined ? overrideUserId : (isViewingOther ? selectedUserId : null);
      if (uid === 'everyone') return;
      const url = uid ? `/reminders?user_id=${uid}` : '/reminders';
      const res = await api.get(url);
      setReminders(res.data || []);
    } catch {}
  }, [isViewingOther, selectedUserId]);

  const handlePunchAction = useCallback(async (action, e) => {
    if (e) addAttRipple(e);
    setLoading(true);
    try {
      let locationData = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
          );
          locationData = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        } catch { console.warn('Location unavailable'); }
      }
      const response = await api.post('/attendance', { action, location: locationData });
      if (action === 'punch_in') {
        toast.success('✓ Punched in successfully!', { duration: 3000 });
        setModalActionDone(true);
        setShowPunchInModal(false);
      } else {
        const duration = response.data?.duration || 0;
        toast.success(`✓ Punched out! (${formatDuration(duration)})`, { duration: 3000 });
      }
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance', { duration: 4000 });
    } finally { setLoading(false); }
  }, [fetchData]);

  const handleApplyLeave = useCallback(async () => {
    if (!leaveFrom) { toast.error('Select a leave start date'); return; }
    try {
      await api.post('/attendance/apply-leave', {
        from_date: format(leaveFrom, 'yyyy-MM-dd'),
        to_date: leaveTo ? format(leaveTo, 'yyyy-MM-dd') : format(leaveFrom, 'yyyy-MM-dd'),
        reason: leaveReason || 'Personal Leave',
      });
      toast.success('✓ Leave request submitted');
      setShowLeaveForm(false); setLeaveFrom(null); setLeaveTo(null); setLeaveReason('');
      await fetchData();
    } catch { toast.error('Failed to submit leave request'); }
  }, [leaveFrom, leaveTo, leaveReason, fetchData]);

  const handleAddHolidays = useCallback(async () => {
    const validRows = holidayRows.filter(r => r.name.trim() && r.date);
    if (validRows.length === 0) { toast.error('Add at least one holiday'); return; }
    let added = 0;
    const errors = [];
    for (const row of validRows) {
      try {
        await api.post('/holidays', { date: row.date, name: row.name.trim(), type: 'manual' });
        added++;
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
        errors.push(`${row.name}: ${detail}`);
        console.error('Holiday save error:', detail, err?.response?.status);
      }
    }
    if (added > 0) toast.success(`✓ ${added} holiday${added > 1 ? 's' : ''} saved`);
    if (errors.length > 0) errors.forEach(e => toast.error(e, { duration: 6000 }));
    setShowHolidayModal(false);
    setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
    await fetchData();
  }, [holidayRows, fetchData]);

  const handlePdfImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      toast.success('✓ Holiday updated');
      setEditingHoliday(null);
      await fetchData();
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
      const res = await api.post('/attendance/mark-absent-bulk', body);
      const { marked, skipped, reason, date: markedDate } = res.data;
      if (skipped) {
        toast.info(`Skipped: ${reason}`);
      } else {
        toast.success(`✓ Absent marked for ${markedDate}: ${marked} user(s) marked absent`);
        await fetchData();
      }
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to mark absent'); }
    finally { setAbsentLoading(false); }
  }, [fetchData]);

  const handleCreateReminder = useCallback(async () => {
    if (!reminderTitle.trim() || !reminderDatetime) { toast.error('Title and date/time are required'); return; }
    try {
      await api.post('/reminders', {
        title: reminderTitle.trim(),
        description: reminderDesc.trim() || null,
        remind_at: new Date(reminderDatetime).toISOString(),
      });
      toast.success('✓ Reminder set!');
      setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime('');
      setTrademarkData(null);
      await fetchReminders();
    } catch { toast.error('Failed to create reminder'); }
  }, [reminderTitle, reminderDesc, reminderDatetime, fetchReminders]);

  const handleTrademarkPdfUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (trademarkPdfRef.current) trademarkPdfRef.current.value = '';
    setTrademarkLoading(true);
    setTrademarkData(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/documents/extract-trademark-notice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      setTrademarkData(data);
      if (data.application_no) {
        const appName = data.applicant_name ? ` — ${data.applicant_name}` : '';
        const cls = data.class ? ` (Class ${data.class})` : '';
        setReminderTitle(`${data.document_type || 'Trademark Hearing'} — App No. ${data.application_no}${cls}${appName}`);
      }
      if (data.hearing_date) {
        setReminderDatetime(`${data.hearing_date}T10:00`);
      }
      const descLines = [];
      if (data.application_no) descLines.push(`Application No: ${data.application_no}`);
      if (data.class) descLines.push(`Class: ${data.class}`);
      if (data.applicant_name) descLines.push(`Applicant: ${data.applicant_name}`);
      if (data.recipient_name) descLines.push(`Agent/Recipient: ${data.recipient_name}`);
      if (data.application_date) descLines.push(`Application Date: ${data.application_date}`);
      if (data.used_since) descLines.push(`Used Since: ${data.used_since}`);
      if (data.hearing_date) descLines.push(`Hearing Date: ${data.hearing_date}`);
      if (data.letter_date) descLines.push(`Notice Date: ${data.letter_date}`);
      if (data.brand_name) descLines.push(`Brand/Mark: ${data.brand_name}`);
      descLines.push('Hearing via Video Conferencing (Dynamic Utilities → Cause List → Trade Marks Show Cause & Review)');
      setReminderDesc(descLines.join('\n'));
      toast.success(`✓ Details extracted — form auto-filled!`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to read PDF';
      toast.error(`PDF extraction failed: ${msg}`);
    } finally {
      setTrademarkLoading(false);
    }
  }, []);

  const handleDeleteReminder = useCallback(async (id) => {
    try {
      await api.delete(`/reminders/${id}`);
      setReminders(prev => prev.filter(r => r.id !== id));
      toast.success('Reminder deleted');
    } catch { toast.error('Failed to delete reminder'); }
  }, []);

  const handleDismissPopup = useCallback(async () => {
    if (!firedReminder) return;
    try { await api.patch(`/reminders/${firedReminder.id}`, { is_dismissed: true }); } catch {}
    setReminders(prev => prev.map(r => r.id === firedReminder.id ? { ...r, is_dismissed: true } : r));
    setFiredReminder(null);
  }, [firedReminder]);

  const handleExportPDF = useCallback(async () => {
    setExportingPDF(true);
    try {
      let employeeName;
      if (isAdmin && selectedUserId === 'everyone') employeeName = 'All Employees';
      else if (isAdmin && selectedUserId) employeeName = allUsers.find(u => u.id === selectedUserId)?.full_name || 'Employee';
      else employeeName = user?.full_name || 'Staff Member';
      const doc = new jsPDF();
      doc.setFillColor(13, 59, 102);
      doc.rect(0, 0, 210, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15); doc.setFont(undefined, 'bold');
      doc.text('TASKOSPHERE — ATTENDANCE REPORT', 10, 10);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')} IST`, 10, 19);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(`Employee: ${employeeName}`, 10, 34);
      doc.setFont(undefined, 'normal'); doc.setFontSize(11);
      doc.text(`Report Period: ${format(selectedDate, 'MMMM yyyy')}`, 10, 42);
      doc.setDrawColor(200, 200, 200); doc.line(10, 47, 200, 47);
      const monthlyHours = mySummary?.monthly_summary?.find(s => s.month === format(selectedDate, 'yyyy-MM'))?.total_hours || '0h 0m';
      const absentCount = attendanceHistory.filter(a => a.status === 'absent' && a.date?.startsWith(format(selectedDate, 'yyyy-MM'))).length;
      doc.setFontSize(11);
      doc.text(`Total Monthly Hours : ${monthlyHours}`, 10, 56);
      doc.text(`Days Present : ${attendanceHistory.filter(a => a.punch_in && a.status === 'present').length}`, 10, 64);
      doc.text(`Days Absent : ${absentCount}`, 10, 72);
      doc.text(`Late Arrivals : ${attendanceHistory.filter(a => a.is_late).length}`, 10, 80);
      doc.line(10, 88, 200, 88);
      doc.setFont(undefined, 'bold'); doc.setFontSize(11);
      doc.text('Attendance Log (Last 15 Records):', 10, 97);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('DATE', 10, 106); doc.text('STATUS', 48, 106); doc.text('PUNCH IN', 82, 106);
      doc.text('PUNCH OUT', 118, 106); doc.text('DURATION', 158, 106);
      doc.setDrawColor(180, 180, 180); doc.line(10, 108, 200, 108);
      doc.setTextColor(0, 0, 0);
      let y = 116;
      attendanceHistory.slice(0, 15).forEach((record, index) => {
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
  }, [isAdmin, selectedUserId, allUsers, user, selectedDate, attendanceHistory, mySummary]);

  const monthAttendance = useMemo(() => {
    const start = startOfMonth(selectedDate), end = endOfMonth(selectedDate);
    let atts = attendanceHistory.filter(a => {
      try { const d = parseISO(a.date); return d >= start && d <= end; } catch { return false; }
    });
    if (displayTodayAttendance) {
      const todayStr = displayTodayAttendance.date;
      if (!atts.some(a => a.date === todayStr)) {
        try { const todayD = parseISO(todayStr); if (todayD >= start && todayD <= end) atts = [...atts, displayTodayAttendance]; }
        catch {}
      }
    }
    return atts;
  }, [attendanceHistory, displayTodayAttendance, selectedDate]);

  const monthTotalMinutes = useMemo(() => monthAttendance.filter(a => a.status === 'present').reduce((sum, a) => sum + (a.duration_minutes || 0), 0), [monthAttendance]);
  const monthDaysPresent = useMemo(() => monthAttendance.filter(a => a.punch_in && a.status === 'present').length, [monthAttendance]);
  const monthDaysAbsent = useMemo(() => monthAttendance.filter(a => a.status === 'absent').length, [monthAttendance]);
  const totalDaysLateThisMonth = useMemo(() => monthAttendance.filter(a => a.punch_in && a.is_late).length, [monthAttendance]);
  const isTodaySelected = dateFnsIsToday(selectedDate);
  const selectedAttendance = isTodaySelected
    ? displayTodayAttendance
    : attendanceHistory.find(a => a.date === format(selectedDate, 'yyyy-MM-dd')) || null;
  const selectedHoliday = holidays.find(h => h.date === format(selectedDate, 'yyyy-MM-dd'));
  const attendanceMap = useMemo(() => {
    const map = {};
    attendanceHistory.forEach(a => { map[a.date] = a; });
    if (displayTodayAttendance) map[displayTodayAttendance.date] = displayTodayAttendance;
    return map;
  }, [attendanceHistory, displayTodayAttendance]);
  const viewedUserName = useMemo(() => {
    if (isEveryoneView) return 'All Employees';
    if (!isViewingOther) return null;
    return allUsers.find(u => u.id === selectedUserId)?.full_name || 'Selected Employee';
  }, [isEveryoneView, isViewingOther, selectedUserId, allUsers]);
  const progressPct = useMemo(() => {
    const hrs = parseDurationToHours(displayLiveDuration);
    return Math.min(100, Math.round((hrs / 8.5) * 100));
  }, [displayLiveDuration]);
  const upcomingReminders = useMemo(() =>
    reminders.filter(r => !r.is_dismissed).sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at)),
    [reminders]
  );
  const recentAttendance = useMemo(() => {
    if (isEveryoneView) return attendanceHistory.slice(0, 25);
    return attendanceHistory.slice(0, 15);
  }, [attendanceHistory, isEveryoneView]);
  const userMap = useMemo(() => {
    const map = {};
    allUsers.forEach(u => { map[u.id] = u.full_name; });
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
    const cutoff = new Date(nowIST);
    cutoff.setHours(ABSENT_CUTOFF_HOUR_IST, 0, 0, 0);
    const msLeft = cutoff.getTime() - nowIST.getTime();
    if (msLeft <= 0) return 'You have been marked as absent for today.';
    const hLeft = Math.floor(msLeft / 3600000), mLeft = Math.floor((msLeft % 3600000) / 60000);
    return hLeft > 0 ? `${hLeft}h ${mLeft}m until auto-absent at 7:00 PM` : `${mLeft} minute(s) until auto-absent at 7:00 PM`;
  }, [todayAttendance, isViewingOther, isEveryoneView, todayIsHoliday]);
  const todayHolidayName = useMemo(
    () => holidays.find(h => h.date === todayDateStr && h.status === 'confirmed')?.name || '',
    [holidays, todayDateStr]
  );

  return (
    <TooltipProvider>
      <AnimatePresence>
        {firedReminder && <ReminderPopup reminder={firedReminder} onDismiss={handleDismissPopup} />}
      </AnimatePresence>
      <motion.div
        className="min-h-screen overflow-y-auto p-5 md:p-7 lg:p-9"
        style={{
          background: `linear-gradient(135deg, ${COLORS.slate50} 0%, #FFFFFF 100%)`,
          fontFamily: "'DM Sans', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
        variants={containerVariants} initial="hidden" animate="visible"
      >
        {/* ── PAGE HEADER ── */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-black tracking-tight" style={{ color: COLORS.deepBlue, letterSpacing: '-0.02em' }}>
              {isAdmin ? 'Attendance Management' : 'My Attendance'}
            </h1>
            <p className="text-slate-500 mt-2 text-sm font-medium">
              {isAdmin
                ? 'Manage team attendance — auto-absent marks at 7:00 PM IST daily'
                : 'Track your daily hours — auto-absent at 7:00 PM if not punched in'}
            </p>
          </div>
          {/* ── TOP CONTROLS: removed "Add Holiday" button — it now lives inside the Holiday card ── */}
          <div className="flex gap-3 flex-wrap items-center">
            {isAdmin && (
              <motion.select variants={itemVariants}
                className="border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:border-blue-400 transition-colors font-medium cursor-pointer hover:border-blue-300"
                value={selectedUserId || ''}
                onChange={e => {
                  const val = e.target.value || null;
                  setSelectedUserId(val);
                  fetchData(val);
                  fetchReminders(val);
                }}>
                <option value="">{allUsers.length === 0 ? 'Loading users…' : user?.full_name ? `${user.full_name} (Admin)` : 'My Attendance'}</option>
                <option value="everyone">👥 Everyone (All Users)</option>
                {allUsers.filter(u => u.id !== user?.id).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role === 'admin' ? 'Admin' : u.role})</option>
                ))}
              </motion.select>
            )}
            {isAdmin && (
              <motion.div variants={itemVariants} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button onClick={(e) => { addAttRipple(e); handleMarkAbsentBulk(); }} disabled={absentLoading}
                  variant="outline"
                  className="att-ripple-btn border-2 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-400 font-semibold rounded-xl px-4 py-2.5 transition-all">
                  <UserX className="w-4 h-4 mr-2" />
                  {absentLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Marking…</> : 'Mark Absent Now'}
                </Button>
              </motion.div>
            )}
            <motion.div variants={itemVariants} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={handleExportPDF} disabled={exportingPDF}
                variant="outline"
                className="att-ripple-btn border-2 border-slate-200 rounded-xl px-5 py-2.5 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all">
                {exportingPDF ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting…</> : '↓ Export PDF'}
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* ── ALERTS ── */}
        {dataError && (
          <motion.div variants={itemVariants} className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 border-red-200 bg-red-50">
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-bold text-red-800">Connection error: </span>
              <span className="text-sm text-red-700">{dataError}</span>
              <span className="text-xs text-red-500 ml-2">— If backend is on Render free tier, it may be waking up. Try again in 30s.</span>
            </div>
            <button onClick={() => fetchData()} className="text-red-600 text-xs font-bold underline ml-2 hover:text-red-800 active:scale-95 transition-all">Retry</button>
          </motion.div>
        )}
        {absentCountdown && !isViewingOther && !isEveryoneView && (
          <motion.div variants={itemVariants}
            className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 border-red-300 absent-pulse"
            style={{ backgroundColor: '#FFF1F2' }}>
            <motion.div animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 0.9, repeat: Infinity }}>
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </motion.div>
            <span className="text-sm font-bold text-red-800 flex-1">⚠️ You haven't punched in today! {absentCountdown}</span>
            <Button size="sm"
              onClick={(e) => { addAttRipple(e); handlePunchAction('punch_in'); }}
              className="att-ripple-btn bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg px-4 active:scale-95 transition-all">
              <LogIn className="w-4 h-4 mr-1" /> Punch In Now
            </Button>
          </motion.div>
        )}
        {(isViewingOther || isEveryoneView) && (
          <motion.div variants={itemVariants} className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 border-blue-200" style={{ backgroundColor: '#EFF6FF' }}>
            <Users className="w-4 h-4 text-blue-700" />
            <span className="text-sm font-semibold text-blue-900">
              {isEveryoneView
                ? 'Viewing attendance for all employees'
                : <>Viewing attendance for: <span className="underline decoration-dotted">{viewedUserName}</span></>}
            </span>
            <button className="ml-auto text-blue-600 hover:text-blue-800 text-xs font-bold underline active:scale-95 transition-all"
              onClick={() => { setSelectedUserId(null); fetchData(null); fetchReminders(null); }}>
              Clear — show my data
            </button>
          </motion.div>
        )}

        {/* ── TODAY STATUS HERO ── */}
        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-0 shadow-xl overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div className="text-white space-y-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center"
                        animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                        <Clock className="w-8 h-8 text-white" />
                      </motion.div>
                      <div>
                        <h3 className="text-2xl font-bold">
                          {isTodaySelected ? (isViewingOther ? `${viewedUserName}'s Status` : "Today's Status") : format(selectedDate, 'EEEE, MMM d')}
                        </h3>
                        <p className="text-blue-100 text-sm mt-0.5">
                          {isViewingOther ? 'Read-only view — use the dropdown to switch users' : 'Real-time attendance • Auto-absent at 7:00 PM IST'}
                        </p>
                      </div>
                    </div>
                    {todayIsHoliday && (
                      <div className="backdrop-blur rounded-xl p-4" style={{ backgroundColor: 'rgba(245,158,11,0.25)' }}>
                        <p className="text-sm font-bold text-amber-200">
                          🎉 Today is a holiday{todayHolidayName ? ` — ${todayHolidayName}` : ''}
                        </p>
                      </div>
                    )}
                    {displayTodayAttendance?.status === 'absent' && (
                      <motion.div
                        className="backdrop-blur rounded-xl p-4"
                        style={{ backgroundColor: 'rgba(239,68,68,0.25)' }}
                        animate={{ opacity: [1, 0.85, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                        <p className="text-sm font-bold text-red-200">
                          ❌ Marked as Absent today{displayTodayAttendance.auto_marked ? ' (auto-marked at 7:00 PM)' : ''}
                        </p>
                      </motion.div>
                    )}
                    {displayTodayAttendance?.punch_in && (
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-2">
                        <p className="text-blue-100 text-sm">
                          <span className="font-semibold">In:</span> {formatAttendanceTime(displayTodayAttendance.punch_in)}
                          {displayTodayAttendance.punch_out && (
                            <> • <span className="font-semibold">Out:</span> {formatAttendanceTime(displayTodayAttendance.punch_out)}</>
                          )}
                        </p>
                        {!isViewingOther && (
                          <p className="text-blue-100 text-xs">
                            Expected: {user?.punch_in_time || '10:30'} ({user?.grace_time || '15'} min grace) • {user?.punch_out_time || '19:00'}
                          </p>
                        )}
                      </div>
                    )}
                    {displayTodayAttendance?.status === 'leave' && (
                      <div className="backdrop-blur rounded-xl p-4" style={{ backgroundColor: 'rgba(249,115,22,0.2)' }}>
                        <p className="text-sm font-semibold text-orange-200">
                          🟠 On leave today{displayTodayAttendance.leave_reason ? ` — ${displayTodayAttendance.leave_reason}` : ''}
                        </p>
                      </div>
                    )}
                    {!isViewingOther && (
                      <div className="flex gap-3 flex-wrap pt-2">
                        {!todayAttendance?.punch_in && todayAttendance?.status !== 'absent' ? (
                          <>
                            {isTodaySelected && (
                              <motion.button
                                whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                                onClick={(e) => handlePunchAction('punch_in', e)}
                                disabled={loading}
                                className={`att-ripple-btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg ${!loading ? 'punch-in-pulse' : ''}`}>
                                {loading ? <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Punching In…</> : <><LogIn className="w-5 h-5 inline mr-2" />Punch In</>}
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              onClick={() => setShowLeaveForm(true)}
                              className="att-ripple-btn border-2 border-white text-white font-bold px-6 py-2.5 rounded-xl hover:bg-white/10 transition-all">
                              Apply Leave
                            </motion.button>
                          </>
                        ) : !todayAttendance?.punch_out && todayAttendance?.punch_in && isTodaySelected ? (
                          <motion.button
                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                            onClick={(e) => handlePunchAction('punch_out', e)}
                            disabled={loading}
                            className="att-ripple-btn bg-white/20 hover:bg-white/30 backdrop-blur text-white font-bold px-6 py-2.5 rounded-xl transition-all hover:shadow-lg">
                            {loading ? <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Punching Out…</> : <><LogOut className="w-5 h-5 inline mr-2" />Punch Out</>}
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
                    {isViewingOther && (
                      <p className="text-xs text-blue-300 font-medium pt-1">ℹ️ Punch actions are only available for your own attendance.</p>
                    )}
                  </div>
                  <div><DigitalClock /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── PENDING HOLIDAY REVIEW ── */}
        {isAdmin && pendingHolidays.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-2 border-amber-200 bg-amber-50 shadow-md">
              <div className="bg-amber-100 px-6 py-3 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                  <span className="text-sm font-black uppercase text-amber-900">Holiday Review ({pendingHolidays.length})</span>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingHolidays.map(holiday => (
                    <motion.div key={holiday.date} variants={itemVariants}
                      className="bg-white p-5 rounded-xl border-2 border-amber-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                      <h4 className="font-bold text-slate-800 text-lg mb-2">{holiday.name}</h4>
                      <p className="text-sm text-slate-500 mb-4">{format(parseISO(holiday.date), 'EEEE, MMMM do, yyyy')}</p>
                      <div className="flex gap-2">
                        <Button size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg active:scale-95 transition-all"
                          onClick={() => handleHolidayDecision(holiday.date, 'confirmed')}>Confirm</Button>
                        <Button size="sm" variant="outline"
                          className="flex-1 border-red-300 text-red-600 hover:bg-red-50 font-bold rounded-lg active:scale-95 transition-all"
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
        {isAdmin && absentSummary.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-2 border-red-100 shadow-md">
              <div className="px-6 py-4 flex items-center gap-3 border-b border-red-100" style={{ backgroundColor: '#FFF1F2' }}>
                <UserX className="w-5 h-5 text-red-600" />
                <span className="text-sm font-black uppercase text-red-800">Absent This Month — {absentSummary.length} Staff Member(s)</span>
                <span className="ml-auto text-xs text-red-500 font-medium">Auto-marked at 7:00 PM IST</span>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {absentSummary.map(item => (
                    <motion.div key={item.user_id} whileHover={{ scale: 1.03 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100 transition-all cursor-default">
                      <div className="w-9 h-9 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-700 font-bold text-sm">{(item.user_name || '?')[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{item.user_name || 'Unknown'}</p>
                        <p className="text-xs text-red-600 font-semibold">{item.absent_days} day{item.absent_days !== 1 ? 's' : ''} absent</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── STAT CARDS ── */}
        <motion.div className={`grid gap-4 mb-8 items-stretch ${canViewRankings ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
          <StatCard icon={Timer} label={isEveryoneView ? 'Total (All Staff)' : isViewingOther ? `${viewedUserName?.split(' ')[0]}'s Month` : 'This Month'}
            value={formatDuration(monthTotalMinutes).split('h')[0]} unit="hours"
            color={COLORS.deepBlue} trend={`${monthDaysPresent} days present`} />
          <StatCard icon={CheckCircle2} label="Tasks Done" value={tasksCompleted} unit="completed" color={COLORS.emeraldGreen} trend=" " />
          <StatCard icon={CalendarX} label="Days Late" value={totalDaysLateThisMonth} unit="this month" color={COLORS.orange} trend=" " />
          <StatCard icon={UserX} label="Days Absent" value={monthDaysAbsent} unit="this month" color={COLORS.red}
            trend={monthDaysAbsent > 0 ? 'Auto-marked at 7 PM' : 'Perfect attendance!'} />
          {canViewRankings && !isEveryoneView && (
            <StatCard icon={TrendingUp} label={isViewingOther ? 'Their Rank' : 'Your Rank'} value={myRank} unit="overall" color={COLORS.deepBlue} trend=" " />
          )}
        </motion.div>

        {/* ── DAILY PROGRESS ── */}
        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {isViewingOther ? `${viewedUserName?.split(' ')[0]}'s Daily Progress` : 'Daily Progress'}
                    </p>
                    <motion.p
                      key={displayLiveDuration}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="text-5xl font-black tracking-tight mb-1"
                      style={{
                        color: displayTodayAttendance?.status === 'absent' ? COLORS.red : todayIsHoliday ? COLORS.amber : COLORS.emeraldGreen,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                      {displayTodayAttendance?.status === 'absent' ? 'Absent' : todayIsHoliday ? 'Holiday' : displayLiveDuration}
                    </motion.p>
                    <p className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: displayTodayAttendance?.status === 'absent' ? COLORS.red : todayIsHoliday ? COLORS.amber : COLORS.emeraldGreen }}>
                      {displayTodayAttendance?.status === 'absent'
                        ? `❌ Auto-marked absent${displayTodayAttendance.auto_marked ? ' at 7:00 PM' : ''}`
                        : todayIsHoliday ? '🎉 Office closed today'
                        : (!isViewingOther && displayTodayAttendance?.punch_in && !displayTodayAttendance?.punch_out
                            ? '● Live • updating every minute' : 'Total for today')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-slate-50 p-4 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase mb-1">Daily Goal</p>
                      <p className="text-2xl font-bold text-slate-800">8.5h</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-slate-50 p-4 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase mb-1">Progress</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {displayTodayAttendance?.status === 'absent' ? '0%' : todayIsHoliday ? '—' : `${progressPct}%`}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 bg-slate-100 rounded-full h-3 overflow-hidden">
                  <motion.div className="h-full rounded-full"
                    style={{
                      background: displayTodayAttendance?.status === 'absent'
                        ? `linear-gradient(90deg, ${COLORS.red}, #FCA5A5)`
                        : todayIsHoliday
                          ? `linear-gradient(90deg, ${COLORS.amber}, #FCD34D)`
                          : `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: displayTodayAttendance?.status === 'absent' ? '100%' : todayIsHoliday ? '100%' : `${progressPct}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── HOLIDAY + REMINDER CARDS (redesigned) ── */}
        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

            {/* ══ HOLIDAY CARD — styled like Reminder card ══ */}
            {(() => {
              const monthHolidaysGrid = holidays.filter(h => {
                try { return format(parseISO(h.date), 'yyyy-MM') === format(selectedDate, 'yyyy-MM'); }
                catch { return false; }
              });
              return (
                <Card className="border-0 shadow-md overflow-hidden flex flex-col">
                  {/* Header — matches Reminder card header style */}
                  <div className="px-6 py-3 flex items-center justify-between"
                    style={{ background: `linear-gradient(135deg, ${COLORS.amber}18, ${COLORS.amber}08)`, borderBottom: `2px solid ${COLORS.amber}25` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${COLORS.amber}22` }}>
                        <span className="text-xl">🎉</span>
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800" style={{ color: COLORS.deepBlue }}>
                          Holidays — {format(selectedDate, 'MMMM yyyy')}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          {monthHolidaysGrid.length} holiday{monthHolidaysGrid.length !== 1 ? 's' : ''} this month
                          {!isViewingOther && ' • popups on calendar'}
                        </p>
                      </div>
                    </div>
                    {/* Add Holiday button — now INSIDE the card header */}
                    {isAdmin && (
                      <Button onClick={() => { setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); setShowHolidayModal(true); }}
                        className="att-ripple-btn font-bold rounded-xl text-white px-4 py-2 active:scale-95 transition-all hover:opacity-90 flex-shrink-0"
                        style={{ backgroundColor: COLORS.amber }}>
                        <Plus className="w-4 h-4 mr-1.5" /> Add
                      </Button>
                    )}
                  </div>

                  {/* Body */}
                  <CardContent className="p-4 flex-1">
                    {monthHolidaysGrid.length === 0 ? (
                      <div className="text-center py-10">
                        <span className="text-4xl block mb-3">🗓️</span>
                        <p className="text-slate-400 font-medium text-sm">No holidays this month</p>
                        {isAdmin && (
                          <button
                            onClick={() => { setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); setShowHolidayModal(true); }}
                            className="mt-3 text-amber-600 hover:text-amber-800 text-xs font-bold underline active:scale-95 transition-all">
                            + Add a holiday
                          </button>
                        )}
                      </div>
                    ) : (
                      /* ── Compact stripe list — same pattern as redesigned reminder items ── */
                      <div className="space-y-2">
                        {monthHolidaysGrid.map(h => (
                          <motion.div key={h.date} variants={itemVariants}
                            className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all hover:-translate-y-0.5 hover:shadow-md group"
                            style={{ borderColor: `${COLORS.amber}40`, backgroundColor: `${COLORS.amber}08` }}>
                            {/* Date badge */}
                            <div className="w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white font-black shadow-sm"
                              style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
                              <span className="text-[9px] leading-none uppercase tracking-wide">{format(parseISO(h.date), 'MMM')}</span>
                              <span className="text-base leading-none font-black">{format(parseISO(h.date), 'd')}</span>
                            </div>
                            {/* Name + day */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate leading-snug">{h.name}</p>
                              <p className="text-xs text-slate-500 font-medium mt-0.5">{format(parseISO(h.date), 'EEEE')}</p>
                            </div>
                            {/* Badge */}
                            <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full flex-shrink-0"
                              style={{ color: COLORS.amber, backgroundColor: `${COLORS.amber}20`, border: `1px solid ${COLORS.amber}40` }}>
                              Holiday
                            </span>
                            {/* Admin actions */}
                            {isAdmin && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button onClick={() => { setEditingHoliday(h); setEditName(h.name); setEditDate(h.date); }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 active:scale-90 transition-all" title="Edit">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDeleteHoliday(h.date, h.name)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 active:scale-90 transition-all" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* ══ REMINDER CARD — compact stripe items ══ */}
            <Card className="border-0 shadow-md overflow-hidden flex flex-col">
              <div className="px-6 py-3 flex items-center justify-between"
                style={{ background: `linear-gradient(135deg, ${COLORS.purple}18, ${COLORS.purple}08)`, borderBottom: `2px solid ${COLORS.purple}25` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${COLORS.purple}20` }}>
                    <AlarmClock className="w-5 h-5" style={{ color: COLORS.purple }} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800" style={{ color: COLORS.deepBlue }}>
                      {isViewingOther ? `${viewedUserName?.split(' ')[0]}'s Reminders` : 'Reminders & Meetings'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {upcomingReminders.length} upcoming{!isViewingOther && ' • popups fire automatically'}
                    </p>
                  </div>
                </div>
                {!isViewingOther && (
                  <Button onClick={() => setShowReminderForm(true)}
                    className="att-ripple-btn font-bold rounded-xl text-white px-4 py-2 active:scale-95 transition-all hover:opacity-90 flex-shrink-0"
                    style={{ backgroundColor: COLORS.purple }}>
                    <Plus className="w-4 h-4 mr-1.5" /> New
                  </Button>
                )}
              </div>
              <CardContent className="p-4 flex-1">
                {upcomingReminders.length === 0 ? (
                  <div className="text-center py-10">
                    <Bell className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium text-sm">
                      {isViewingOther ? 'No upcoming reminders for this user' : 'No upcoming reminders. Create one to get started!'}
                    </p>
                  </div>
                ) : (
                  /* ── COMPACT STRIPE REMINDER ITEMS ── */
                  <div className="space-y-2">
                    {upcomingReminders.map((r, index) => {
                      const isDue = isPast(new Date(r.remind_at));
                      return (
                        <motion.div key={r.id} variants={itemVariants}
                          className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all hover:-translate-y-0.5 hover:shadow-md"
                          style={{
                            borderColor: isDue ? `${COLORS.red}40` : `${COLORS.purple}30`,
                            backgroundColor: isDue ? `${COLORS.red}06` : `${COLORS.purple}06`,
                          }}>
                          {/* Index badge */}
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: isDue ? `${COLORS.red}15` : `${COLORS.purple}18` }}>
                            <span className="text-xs font-black" style={{ color: isDue ? COLORS.red : COLORS.purple }}>
                              {index + 1}
                            </span>
                          </div>
                          {/* Title + time */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate leading-snug">{r.title}</p>
                            <p className="text-xs font-mono font-semibold truncate mt-0.5"
                              style={{ color: isDue ? COLORS.red : COLORS.purple }}>
                              ⏰ {formatReminderTime(r.remind_at)}
                            </p>
                            {r.description && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">{r.description}</p>
                            )}
                          </div>
                          {/* Past Due badge */}
                          {isDue && (
                            <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-full uppercase flex-shrink-0 hidden sm:block">
                              Due
                            </span>
                          )}
                          {/* Action buttons */}
                          <div className="flex gap-1.5 flex-shrink-0">
                            <a href={buildGCalURL(r)} target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-center w-7 h-7 rounded-lg text-white transition-all hover:opacity-80 active:scale-90"
                              style={{ backgroundColor: COLORS.deepBlue }}
                              title="Add to Google Calendar">
                              <CalendarPlus className="w-3.5 h-3.5" />
                            </a>
                            {!isViewingOther && (
                              <button onClick={() => handleDeleteReminder(r.id)}
                                className="flex items-center justify-center w-7 h-7 rounded-lg text-red-500 bg-red-50 hover:bg-red-100 active:scale-90 transition-all"
                                title="Delete reminder">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── CALENDAR + RECENT ATTENDANCE ── */}
        <motion.div className={`grid gap-8 items-stretch ${isEveryoneView ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-3'}`}>
          {!isEveryoneView && (
            <motion.div variants={itemVariants} className="xl:col-span-1 space-y-6 h-full flex flex-col">
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                      <CalendarIcon className="w-5 h-5" /> Attendance Calendar
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}
                      className="text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all">Today</Button>
                  </div>
                  <CardDescription className="text-xs">Click a date for details</CardDescription>
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
                      head_cell: 'text-slate-400 rounded-lg w-9 font-bold text-[0.75rem] text-center',
                      row: 'flex w-full mt-2 justify-between',
                      cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                      day: 'h-10 w-10 p-0 font-semibold rounded-full transition-all hover:bg-slate-100',
                      day_today: 'font-black',
                    }}
                    components={{
                      Day: props => <CustomDay {...props} attendance={attendanceMap} holidays={holidays} />,
                    }}
                  />
                  <div className="flex flex-wrap gap-x-3 gap-y-2 mt-6 text-xs justify-center border-t pt-4">
                    {[
                      { color: COLORS.emeraldGreen, label: 'Present', style: 'solid' },
                      { color: COLORS.red, label: 'Late', style: 'solid' },
                      { color: COLORS.red, label: 'Absent', style: 'solid', bg: '#FEE2E240' },
                      { color: COLORS.red, label: 'Not in yet', style: 'dashed' },
                      { color: COLORS.amber, label: 'Holiday', style: 'solid' },
                      { color: COLORS.orange, label: 'Leave', style: 'solid' },
                    ].map(({ color, label, style, bg }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                          style={{ borderColor: color, borderStyle: style, backgroundColor: bg || `${color}25` }} />
                        <span className="text-slate-600">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  {selectedAttendance?.status === 'absent' ? (
                    <div className="p-6 bg-gradient-to-br from-red-50 to-slate-50 border-l-4 border-red-500">
                      <p className="font-bold text-lg mb-1 text-red-700">❌ Absent</p>
                      <p className="text-sm text-slate-600">{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                      {selectedAttendance.auto_marked && <p className="text-xs text-red-500 mt-2 font-medium">Auto-marked absent at 7:00 PM IST</p>}
                    </div>
                  ) : selectedAttendance?.punch_in ? (
                    <div className="p-6 bg-gradient-to-br from-emerald-50 to-slate-50 border-l-4" style={{ borderColor: COLORS.emeraldGreen }}>
                      <p className="font-bold text-slate-800 text-lg mb-4">{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Punch In</span>
                          <span className="font-mono font-bold text-slate-900">{formatAttendanceTime(selectedAttendance.punch_in)}</span>
                        </div>
                        {selectedAttendance.punch_out && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Punch Out</span>
                            <span className="font-mono font-bold text-slate-900">{formatAttendanceTime(selectedAttendance.punch_out)}</span>
                          </div>
                        )}
                        {selectedAttendance.is_late && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Status</span>
                            <span className="text-xs font-bold text-red-600 uppercase px-2 py-1 bg-red-100 rounded">Late Arrival</span>
                          </div>
                        )}
                        {getLocationLabel(selectedAttendance, 'in') && (
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-600 font-medium text-xs">In Location</span>
                            <span className="text-xs font-medium text-slate-700 text-right max-w-[60%] leading-snug">{getLocationLabel(selectedAttendance, 'in')}</span>
                          </div>
                        )}
                        {getLocationLabel(selectedAttendance, 'out') && (
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-600 font-medium text-xs">Out Location</span>
                            <span className="text-xs font-medium text-slate-700 text-right max-w-[60%] leading-snug">{getLocationLabel(selectedAttendance, 'out')}</span>
                          </div>
                        )}
                        <div className="pt-3 border-t flex justify-between items-center">
                          <span className="font-bold text-slate-800">Duration</span>
                          <Badge className="px-3 py-1 font-mono font-bold" style={{ backgroundColor: COLORS.emeraldGreen, color: 'white' }}>
                            {formatDuration(selectedAttendance.duration_minutes)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : selectedAttendance?.status === 'leave' ? (
                    <div className="p-6 border-l-4" style={{ borderColor: COLORS.orange, background: 'linear-gradient(to bottom right, #FFF7ED, #F8FAFC)' }}>
                      <p className="font-bold text-lg mb-1" style={{ color: COLORS.orange }}>🟠 On Leave</p>
                      <p className="text-sm text-slate-600">{format(selectedDate, 'EEEE, MMM d, yyyy')}</p>
                      {selectedAttendance.leave_reason && <p className="text-xs text-slate-500 mt-2 font-medium">Reason: {selectedAttendance.leave_reason}</p>}
                    </div>
                  ) : selectedHoliday ? (
                    <div className="p-6 bg-gradient-to-br from-amber-50 to-slate-50 border-l-4 border-amber-400">
                      <p className="text-sm font-bold text-amber-900">🎉 Holiday: {selectedHoliday.name}</p>
                      <p className="text-xs text-amber-700 mt-1">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
                    </div>
                  ) : (
                    <div className="p-6 bg-gradient-to-br from-red-50 to-slate-50 border-l-4 border-red-400">
                      <p className="text-sm font-bold text-red-900">No record for {format(selectedDate, 'MMM d')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── RECENT ATTENDANCE TABLE ── */}
          <motion.div variants={itemVariants} className={isEveryoneView ? '' : 'xl:col-span-2 h-full'}>
            <Card className="border-0 shadow-md h-full">
              <CardHeader className="border-b border-slate-100 py-3">
                <CardTitle style={{ color: COLORS.deepBlue }}>
                  {isEveryoneView ? 'All Employees — Recent Attendance' : isViewingOther ? `${viewedUserName}'s Recent Attendance` : 'Recent Attendance'}
                </CardTitle>
                <CardDescription>{isEveryoneView ? 'Latest 25 records across all staff' : 'Last 15 records'}</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {loading && attendanceHistory.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <motion.div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    <span className="ml-3 text-slate-500 font-medium">Loading attendance data…</span>
                  </div>
                ) : recentAttendance.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 font-medium">No records yet</p>
                ) : (
                  <div className="space-y-2 max-h-[700px] overflow-y-auto">
                    {recentAttendance.map((record, idx) => {
                      const inLocLabel = getLocationLabel(record, 'in');
                      const outLocLabel = getLocationLabel(record, 'out');
                      const recordUserName = isEveryoneView ? (userMap[record.user_id] || record.user_id) : null;
                      const isAbsent = record.status === 'absent';
                      const isLeave = record.status === 'leave';
                      const isPresent = record.punch_in && record.status === 'present';
                      return (
                        <motion.div
                          key={`${record.date}-${record.user_id || idx}`}
                          variants={itemVariants}
                          whileHover={{ x: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
                          className="p-3 rounded-lg transition-all border cursor-default"
                          style={{
                            backgroundColor: isAbsent ? '#FFF1F2' : isLeave ? '#FFF7ED' : isPresent ? '#F0FDF4' : '#F8FAFC',
                            borderColor: isAbsent ? '#FEE2E2' : isLeave ? '#FED7AA' : isPresent ? '#BBF7D0' : '#E2E8F0',
                            borderLeftWidth: 4,
                            borderLeftColor: isAbsent ? COLORS.red : isLeave ? COLORS.orange : isPresent ? COLORS.emeraldGreen : COLORS.slate200,
                          }}>
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {recordUserName && (
                                <p className="text-xs font-bold text-blue-700 mb-1 flex items-center gap-1">
                                  <Users className="w-3 h-3" />{recordUserName}
                                </p>
                              )}
                              <p className="font-bold text-slate-800 text-sm">{format(parseISO(record.date), 'EEE, MMM d, yyyy')}</p>
                              <p className="text-xs text-slate-500 mt-1 font-mono">
                                {isAbsent
                                  ? `❌ Absent${record.auto_marked ? ' (auto-marked at 7:00 PM)' : ''}`
                                  : isLeave
                                    ? `🟠 On Leave${record.leave_reason ? ` — ${record.leave_reason}` : ''}`
                                    : record.punch_in
                                      ? `${formatAttendanceTime(record.punch_in)} → ${record.punch_out ? formatAttendanceTime(record.punch_out) : 'Ongoing'}`
                                      : '—'}
                              </p>
                              {inLocLabel && !isAbsent && (
                                <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: COLORS.emeraldGreen }} />
                                  <span><span className="font-semibold text-emerald-700">In: </span>{inLocLabel}</span>
                                </p>
                              )}
                              {outLocLabel && !isAbsent && (
                                <p className="text-[11px] text-slate-500 mt-0.5 flex items-start gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: COLORS.orange }} />
                                  <span><span className="font-semibold text-orange-600">Out: </span>{outLocLabel}</span>
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {isAbsent ? (
                                <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-red-100 text-red-700 border border-red-200">Absent</span>
                              ) : isLeave ? (
                                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                                  style={{ color: COLORS.orange, backgroundColor: `${COLORS.orange}20` }}>Leave</span>
                              ) : (
                                <Badge className="font-mono text-xs font-bold px-2 py-1"
                                  style={{
                                    backgroundColor: record.duration_minutes > 0 ? `${COLORS.emeraldGreen}20` : COLORS.slate200,
                                    color: record.duration_minutes > 0 ? COLORS.emeraldGreen : COLORS.deepBlue,
                                    border: `1px solid ${record.duration_minutes > 0 ? COLORS.emeraldGreen : COLORS.slate200}`,
                                  }}>
                                  {formatDuration(record.duration_minutes)}
                                </Badge>
                              )}
                              {record.is_late && !isAbsent && (
                                <span className="text-[10px] font-bold text-red-600 uppercase px-2 py-1 bg-red-100 rounded">Late</span>
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

        {/* ══════════════════════ MODALS ══════════════════════ */}

        {/* Punch-In Modal */}
        <AnimatePresence>
          {showPunchInModal && !isViewingOther && !isEveryoneView && (
            <motion.div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPunchInModal(false)}>
              <motion.div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}>
                <div className="mb-6">
                  <motion.div className="mx-auto w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center punch-in-pulse"
                    animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                    <LogIn className="w-10 h-10 text-emerald-600" />
                  </motion.div>
                </div>
                <h2 className="text-3xl font-black mb-3" style={{ color: COLORS.deepBlue }}>Good Morning! 👋</h2>
                <p className="text-slate-600 text-lg mb-2">Let's punch in and start your day</p>
                <p className="text-xs text-red-500 font-semibold mb-8">⚠️ Auto-absent marks at 7:00 PM if you don't punch in</p>
                <Button onClick={(e) => handlePunchAction('punch_in', e)} disabled={loading}
                  className="att-ripple-btn w-full mb-4 py-3 text-lg font-bold rounded-2xl text-white active:scale-95 transition-all"
                  style={{ backgroundColor: COLORS.emeraldGreen }}>
                  {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Punching In…</> : 'Punch In Now'}
                </Button>
                <button onClick={() => setShowPunchInModal(false)}
                  className="text-slate-500 hover:text-slate-700 text-sm underline active:scale-95 transition-all">
                  I'll do it later
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leave Form Modal */}
        <AnimatePresence>
          {showLeaveForm && (
            <motion.div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black" style={{ color: COLORS.deepBlue }}>Request Leave</h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Select your leave period</p>
                  </div>
                  <button onClick={() => setShowLeaveForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-light active:scale-90 transition-all">✕</button>
                </div>
                <div className="mb-8">
                  <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-widest">Quick Select</p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 7, 15, 30].map(days => (
                      <Button key={days} variant="outline" size="sm"
                        onClick={() => { const from = new Date(), to = new Date(); to.setDate(from.getDate() + days - 1); setLeaveFrom(from); setLeaveTo(to); }}
                        className="rounded-lg font-semibold hover:bg-blue-50 hover:border-blue-300 active:scale-95 transition-all">
                        {days === 1 ? '1 Day' : `${days} Days`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-3 block">From Date</label>
                    <Calendar mode="single" selected={leaveFrom} onSelect={setLeaveFrom}
                      disabled={date => isBefore(date, startOfDay(new Date()))}
                      className="rounded-xl border border-slate-200" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-3 block">To Date</label>
                    <Calendar mode="single" selected={leaveTo} onSelect={setLeaveTo}
                      disabled={date => leaveFrom ? isBefore(date, leaveFrom) : true}
                      className="rounded-xl border border-slate-200" />
                  </div>
                </div>
                {leaveFrom && (
                  <motion.div className="p-5 rounded-2xl mb-8"
                    style={{ backgroundColor: `${COLORS.deepBlue}10`, borderLeft: `4px solid ${COLORS.deepBlue}` }}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <p className="text-xs text-slate-600 font-medium mb-1">Total Duration</p>
                    <p className="text-2xl font-black" style={{ color: COLORS.deepBlue }}>
                      {Math.max(1, leaveTo ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1 : 1)} days
                    </p>
                    <p className="text-xs text-slate-500 mt-2 font-medium">
                      {format(leaveFrom, 'dd MMM')} — {leaveTo ? format(leaveTo, 'dd MMM yyyy') : format(leaveFrom, 'dd MMM yyyy')}
                    </p>
                  </motion.div>
                )}
                <div className="mb-8">
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Reason (Optional)</label>
                  <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                    placeholder="Tell us why you need leave…"
                    className="w-full min-h-[100px] p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none transition-colors" />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setShowLeaveForm(false)} className="font-semibold rounded-lg active:scale-95 transition-all">Cancel</Button>
                  <Button disabled={!leaveFrom} onClick={handleApplyLeave}
                    className="att-ripple-btn font-bold rounded-lg text-white active:scale-95 transition-all"
                    style={{ backgroundColor: COLORS.deepBlue }}>
                    Submit Request
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Holiday Modal */}
        <AnimatePresence>
          {showHolidayModal && (
            <motion.div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
                <div className="px-8 py-6 text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.amber} 0%, #D97706 100%)` }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-black">Add Holidays</h2>
                      <p className="text-amber-100 text-sm mt-1">Batch-add manually or import from PDF</p>
                    </div>
                    <button onClick={() => { setShowHolidayModal(false); setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); }}
                      className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center active:scale-90 transition-all">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfImport} className="hidden" />
                  <button onClick={() => pdfInputRef.current?.click()} disabled={pdfImporting}
                    className="att-ripple-btn flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border-2 border-white/30 text-white hover:bg-white/15 disabled:opacity-60 active:scale-95 transition-all">
                    {pdfImporting ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting…</> : <><FileUp className="w-4 h-4" />Import from PDF</>}
                  </button>
                  {pdfImporting && <p className="text-amber-100 text-xs mt-2">AI is reading your PDF and extracting all holidays…</p>}
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-[1fr_160px_40px] gap-3 mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date</p>
                  </div>
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-6">
                    {holidayRows.map((row, idx) => (
                      <motion.div key={idx} className="grid grid-cols-[1fr_160px_40px] gap-3 items-center"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <input type="text" value={row.name}
                          onChange={e => { const updated = [...holidayRows]; updated[idx] = { ...updated[idx], name: e.target.value }; setHolidayRows(updated); }}
                          placeholder="e.g., Diwali"
                          className="px-4 py-2.5 text-sm border-2 border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 transition-colors" />
                        <input type="date" value={row.date}
                          onChange={e => { const updated = [...holidayRows]; updated[idx] = { ...updated[idx], date: e.target.value }; setHolidayRows(updated); }}
                          className="px-4 py-2.5 text-sm border-2 border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 transition-colors" />
                        <button onClick={() => setHolidayRows(holidayRows.filter((_, i) => i !== idx))}
                          disabled={holidayRows.length === 1}
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 font-bold text-lg active:scale-90 transition-all">×</button>
                      </motion.div>
                    ))}
                  </div>
                  <button onClick={() => setHolidayRows([...holidayRows, { name: '', date: format(new Date(), 'yyyy-MM-dd') }])}
                    className="flex items-center gap-2 text-sm font-bold text-amber-600 hover:text-amber-800 mb-6 active:scale-95 transition-all">
                    <span className="w-6 h-6 rounded-full border-2 border-amber-500 flex items-center justify-center">+</span>
                    Add Another
                  </button>
                </div>
                <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                  <p className="text-xs text-slate-500 font-medium">
                    {holidayRows.filter(r => r.name.trim() && r.date).length} of {holidayRows.length} ready
                  </p>
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => { setShowHolidayModal(false); setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); }}
                      className="font-bold rounded-lg active:scale-95 transition-all">Cancel</Button>
                    <Button disabled={holidayRows.filter(r => r.name.trim() && r.date).length === 0} onClick={handleAddHolidays}
                      className="att-ripple-btn font-bold text-white rounded-lg active:scale-95 transition-all"
                      style={{ backgroundColor: COLORS.amber }}>Save</Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Holiday Modal */}
        <AnimatePresence>
          {editingHoliday && (
            <motion.div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
                <div className="px-8 py-6 text-white flex items-center justify-between"
                  style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Edit2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black">Edit Holiday</h2>
                      <p className="text-amber-100 text-xs mt-0.5">Update the name or date</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingHoliday(null)}
                    className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all">
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="p-8 space-y-5">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Original:</span>
                    <span className="text-sm font-semibold text-slate-700">{editingHoliday.name}</span>
                    <span className="text-xs text-slate-400 ml-auto font-mono">{editingHoliday.date}</span>
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Holiday Name *</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 text-sm transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Date *</label>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 text-sm transition-colors" />
                    {editDate && <p className="text-xs text-slate-500 mt-1.5">📅 {format(parseISO(editDate), 'EEEE, MMMM d, yyyy')}</p>}
                  </div>
                </div>
                <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setEditingHoliday(null)} className="font-bold rounded-xl active:scale-95 transition-all">Cancel</Button>
                  <Button disabled={!editName.trim() || !editDate || editLoading} onClick={handleEditHolidaySave}
                    className="att-ripple-btn font-bold text-white rounded-xl px-6 active:scale-95 transition-all"
                    style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}>
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
            <motion.div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
                <div className="px-8 py-6 text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${COLORS.purple} 0%, #6D28D9 100%)` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <AlarmClock className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black">New Reminder</h2>
                        <p className="text-purple-200 text-sm mt-0.5">Manual entry or auto-fill from a notice PDF</p>
                      </div>
                    </div>
                    <button onClick={() => { setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null); }}
                      className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center active:scale-90 transition-all">
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <input ref={trademarkPdfRef} type="file" accept=".pdf" onChange={handleTrademarkPdfUpload} className="hidden" />
                    <button
                      onClick={() => trademarkPdfRef.current?.click()}
                      disabled={trademarkLoading}
                      className="att-ripple-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-white/30 text-white hover:bg-white/15 disabled:opacity-60 active:scale-95 transition-all"
                    >
                      {trademarkLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Reading PDF…</>
                        : <><FileUp className="w-4 h-4" />Upload Notice PDF</>}
                    </button>
                    <p className="text-purple-200 text-xs leading-snug">
                      Trademark hearing notice,<br />IP Office letter, etc.
                    </p>
                  </div>
                  {trademarkLoading && (
                    <p className="text-purple-200 text-xs mt-2 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Extracting application number, hearing date, applicant details…
                    </p>
                  )}
                </div>
                <div className="p-8 space-y-5 overflow-y-auto flex-1">
                  {trademarkData && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl overflow-hidden border-2 border-purple-200"
                    >
                      <div className="px-4 py-2.5 flex items-center gap-2"
                        style={{ background: `linear-gradient(135deg, ${COLORS.purple}15, ${COLORS.purple}05)` }}>
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.purple }} />
                        <span className="text-xs font-black uppercase tracking-widest" style={{ color: COLORS.purple }}>
                          Extracted from PDF
                        </span>
                        <span className="ml-auto text-[10px] text-slate-400 font-medium">{trademarkData.document_type}</span>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {[
                          { label: 'Application No', value: trademarkData.application_no, bold: true },
                          { label: 'Class', value: trademarkData.class },
                          { label: 'Applicant', value: trademarkData.applicant_name, bold: true },
                          { label: 'Agent/Recipient', value: trademarkData.recipient_name },
                          { label: 'Application Date', value: trademarkData.application_date },
                          { label: 'Used Since', value: trademarkData.used_since },
                          { label: 'Notice Date', value: trademarkData.letter_date },
                          { label: 'Brand/Mark', value: trademarkData.brand_name },
                        ].filter(f => f.value).map(({ label, value, bold }) => (
                          <div key={label}>
                            <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">{label}</p>
                            <p className={`text-slate-800 mt-0.5 ${bold ? 'font-bold' : 'font-medium'}`}>{value}</p>
                          </div>
                        ))}
                        {trademarkData.hearing_date && (
                          <div className="col-span-2 mt-1 p-2.5 rounded-xl flex items-center gap-2"
                            style={{ backgroundColor: `${COLORS.purple}12`, border: `1.5px solid ${COLORS.purple}30` }}>
                            <CalendarIcon className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.purple }} />
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Hearing Date</p>
                              <p className="font-black text-sm" style={{ color: COLORS.purple }}>{trademarkData.hearing_date}</p>
                            </div>
                            {(() => {
                              const hearingDT = new Date(`${trademarkData.hearing_date}T10:00:00`);
                              const endDT = new Date(`${trademarkData.hearing_date}T11:00:00`);
                              const fmt = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
                              const title = reminderTitle || `Trademark Hearing — App No. ${trademarkData.application_no}`;
                              const details = reminderDesc || `Application No: ${trademarkData.application_no}\nApplicant: ${trademarkData.applicant_name || '—'}\nClass: ${trademarkData.class || '—'}\nHearing via Video Conferencing (IPO Website → Dynamic Utilities → Cause List)`;
                              const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE`
                                + `&text=${encodeURIComponent(title)}`
                                + `&dates=${fmt(hearingDT)}/${fmt(endDT)}`
                                + `&details=${encodeURIComponent(details)}`
                                + `&location=${encodeURIComponent('Video Conference — IPO Website Dynamic Cause List')}`;
                              return (
                                <a href={gcalUrl} target="_blank" rel="noopener noreferrer"
                                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white active:scale-95 transition-all hover:opacity-90"
                                  style={{ backgroundColor: COLORS.deepBlue }}>
                                  <CalendarPlus className="w-3.5 h-3.5" />
                                  Add to Calendar
                                </a>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">
                      Title *
                      {trademarkData && <span className="ml-2 text-[10px] text-purple-500 font-semibold normal-case">auto-filled</span>}
                    </label>
                    <input type="text" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)}
                      placeholder="e.g., Trademark Show Cause Hearing, Team standup…"
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">
                      Date & Time *
                      {trademarkData?.hearing_date && <span className="ml-2 text-[10px] text-purple-500 font-semibold normal-case">auto-filled from hearing date</span>}
                    </label>
                    <input type="datetime-local" value={reminderDatetime} onChange={e => setReminderDatetime(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">
                      Description
                      {trademarkData && <span className="ml-2 text-[10px] text-purple-500 font-semibold normal-case">auto-filled</span>}
                    </label>
                    <textarea value={reminderDesc} onChange={e => setReminderDesc(e.target.value)}
                      placeholder="Add notes, agenda, application details, meeting link…" rows={4}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 resize-none transition-colors text-sm font-mono" />
                  </div>
                  {reminderTitle && reminderDatetime && !trademarkData && (
                    <motion.div className="p-4 rounded-xl flex items-start gap-3"
                      style={{ backgroundColor: `${COLORS.deepBlue}08`, border: `1.5px solid ${COLORS.deepBlue}20` }}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <CalendarPlus className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.deepBlue }} />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Google Calendar Integration</p>
                        <p className="text-xs text-slate-500 mt-0.5">After saving, click the calendar icon on the reminder to add this event.</p>
                      </div>
                    </motion.div>
                  )}
                </div>
                <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
                  <Button variant="ghost" onClick={() => { setShowReminderForm(false); setReminderTitle(''); setReminderDesc(''); setReminderDatetime(''); setTrademarkData(null); }}
                    className="font-bold rounded-lg active:scale-95 transition-all">Cancel</Button>
                  <Button disabled={!reminderTitle.trim() || !reminderDatetime} onClick={handleCreateReminder}
                    className="att-ripple-btn font-bold text-white rounded-lg px-6 active:scale-95 transition-all"
                    style={{ backgroundColor: COLORS.purple }}>
                    <Bell className="w-4 h-4 mr-2" /> Set Reminder
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </TooltipProvider>
  );
}
