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
} from 'lucide-react';

// ═════════════════════════════════════════════════════════════════════════════
// BRAND COLORS & CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  amber: '#F59E0B',
  orange: '#F97316',
  red: '#EF4444',
  maroon: '#800000',
  slate50: '#F8FAFC',
  slate200: '#E2E8F0',
  purple: '#8B5CF6',
};
const IST_TIMEZONE = 'Asia/Kolkata';

// ═════════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═════════════════════════════════════════════════════════════════════════════
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};
const pulseVariants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// LIVE DIGITAL CLOCK
// ═════════════════════════════════════════════════════════════════════════════
function DigitalClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  const timeString = time.toLocaleTimeString('en-IN', {
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <motion.div
      className="flex flex-col items-center justify-center px-8 py-5 rounded-2xl text-white font-mono"
      style={{
        background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
        boxShadow: '0 20px 40px rgba(13, 59, 102, 0.3)',
      }}
      animate={{
        boxShadow: [
          '0 20px 40px rgba(13, 59, 102, 0.3)',
          '0 20px 60px rgba(13, 59, 102, 0.5)',
          '0 20px 40px rgba(13, 59, 102, 0.3)',
        ],
      }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <motion.span
        className="text-5xl font-black tracking-widest"
        variants={pulseVariants}
        initial="initial"
        animate="animate"
      >
        {timeString}
      </motion.span>
      <span className="text-xs uppercase tracking-widest text-blue-200 mt-2 font-bold">
        {format(time, 'EEEE, MMMM d, yyyy')} • IST
      </span>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═════════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, unit, color = COLORS.deepBlue, trend = null }) {
  return (
    <motion.div variants={itemVariants} className="h-full">
      <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden h-full">
        <CardContent className="p-6 h-full flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                {label}
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black tracking-tight" style={{ color }}>
                  {value}
                </p>
                {unit && <p className="text-sm font-medium text-slate-400">{unit}</p>}
              </div>
            </div>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ml-3"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon className="w-6 h-6" style={{ color }} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium h-4">
            {trend || ''}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════
const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '0h 0m';
  const mins = parseInt(minutes, 10);
  if (isNaN(mins)) return '0h 0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
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
      const normalized = hasTZ ? str : str + 'Z';
      date = new Date(normalized);
    }
    if (isNaN(date.getTime())) return '—';
    return formatInTimeZone(date, IST_TIMEZONE, 'hh:mm a');
  } catch {
    return '—';
  }
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
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return `${h}h ${m}m`;
};
const formatReminderTime = (isoStr) => {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return format(d, 'MMM d, yyyy • hh:mm a');
  } catch {
    return '—';
  }
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
  } catch {
    return 'https://calendar.google.com';
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// REVERSE GEOCODE
// ═════════════════════════════════════════════════════════════════════════════
const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.display_name) {
      const parts = data.display_name.split(',');
      return parts.slice(0, 3).join(',').trim();
    }
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

// ═════════════════════════════════════════════════════════════════════════════
// CUSTOM CALENDAR DAY — REFINED ANIMATIONS + FUTURE DATE FIX
// ═════════════════════════════════════════════════════════════════════════════
function CustomDay({ date, displayMonth, attendance = {}, holidays = [] }) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayRecord = attendance[dateStr];
  const holiday = holidays.find(h => h.date === dateStr);
  const isFutureDate = isAfter(date, new Date());

  let ringColor = null;
  let bgColor = null;
  let isSpecial = false;

  if (holiday) {
    ringColor = COLORS.amber;
    bgColor = '#FEF3C720';
    isSpecial = true;
  }
  else if (dayRecord?.status === 'leave') {
    ringColor = COLORS.orange;
    bgColor = '#FFF7ED20';
    isSpecial = true;
  }
  else if (dayRecord?.status === 'half_day') {
    ringColor = COLORS.orange;
    bgColor = '#FFF7ED30';
    isSpecial = true;
  }
  else if (!dayRecord?.punch_in && dayRecord?.status === 'absent') {
    ringColor = COLORS.maroon;
    bgColor = '#80000020';
    isSpecial = true;
  }
  else if (dayRecord?.punch_in && dayRecord?.is_late) {
    ringColor = COLORS.red;
    bgColor = '#FEE2E220';
    isSpecial = true;
  }
  else if (dayRecord?.punch_in) {
    ringColor = COLORS.emeraldGreen;
    bgColor = '#D1FAE520';
  }

  const isTodayDate = dateFnsIsToday(date);

  let ringAnimate = { scale: 1 };
  let ringDuration = 2.8;
  let ringRepeat = 0;
  if (ringColor) {
    if (dayRecord?.status === 'absent') {
      ringAnimate = { scale: [1, 1.12, 1], opacity: [1, 0.85, 1] };
      ringDuration = 3.2;
      ringRepeat = Infinity;
    } else if (isSpecial) {
      ringAnimate = { scale: [1, 1.08, 1] };
      ringDuration = 2.4;
      ringRepeat = Infinity;
    } else {
      ringAnimate = { scale: [1, 1.03, 1] };
      ringDuration = 3.5;
      ringRepeat = Infinity;
    }
  } else if (isTodayDate) {
    ringAnimate = { scale: [1, 1.1, 1], opacity: [1, 0.75, 1] };
    ringDuration = 1.8;
    ringRepeat = Infinity;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 hover:bg-slate-100 active:scale-95"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {(ringColor || isTodayDate) && (
            <motion.span
              className="absolute flex items-center justify-center rounded-full border-2"
              style={{
                width: 30,
                height: 30,
                borderColor: ringColor || COLORS.red,
                backgroundColor: bgColor || `${COLORS.red}12`,
                borderStyle: isTodayDate && !ringColor ? 'dashed' : 'solid',
              }}
              animate={ringAnimate}
              transition={{
                duration: ringDuration,
                repeat: ringRepeat,
                ease: "easeInOut",
              }}
            />
          )}
          <span
            className={`relative z-10 text-[13px] leading-none select-none
              ${isTodayDate ? 'font-black' : 'font-medium'}
            `}
            style={
              isTodayDate && ringColor
                ? { color: COLORS.deepBlue }
                : isTodayDate && !ringColor
                  ? { color: COLORS.red }
                  : undefined
            }
          >
            {date.getDate()}
          </span>
          {dayRecord?.status === "absent" && (
            <motion.span
              className="absolute bottom-1 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: COLORS.maroon }}
              animate={{ scale: [1, 1.45, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-bold mb-1">{format(date, 'MMM d, yyyy')}</p>
        {holiday ? (
          <p className="text-amber-600 font-medium">🎉 {holiday.name}</p>
        ) : dayRecord?.status === 'leave' ? (
          <p className="font-medium" style={{ color: COLORS.orange }}>
            🟠 On Leave{dayRecord.leave_reason ? ` — ${dayRecord.leave_reason}` : ''}
          </p>
        ) : dayRecord?.punch_in ? (
          <>
            <p>In: {formatAttendanceTime(dayRecord.punch_in)}</p>
            {dayRecord.punch_out && (
              <p>Out: {formatAttendanceTime(dayRecord.punch_out)}</p>
            )}
            <p className="font-semibold" style={{ color: COLORS.emeraldGreen }}>
              {formatDuration(dayRecord.duration_minutes)}
            </p>
            {dayRecord?.status === 'half_day' && (
              <p className="text-orange-600 font-semibold">Half Day</p>
            )}
            {dayRecord?.is_late && dayRecord?.status !== 'half_day' && (
              <p className="text-red-500 font-semibold">Late arrival</p>
            )}
          </>
        ) : isFutureDate ? (
          <div>
            <p className="text-blue-600 font-medium">📅 Upcoming date</p>
            <p className="text-slate-400 text-[10px] mt-1">No attendance data yet</p>
          </div>
        ) : (
          <p style={{color: COLORS.maroon}} className="font-semibold">
            ❌ Absent
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REMINDER POPUP
// ═════════════════════════════════════════════════════════════════════════════
function ReminderPopup({ reminder, onDismiss }) {
  return (
    <motion.div
      className="fixed top-6 right-6 z-[99999] w-96 max-w-[calc(100vw-2rem)]"
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden border border-purple-200"
        style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: COLORS.purple }}
        >
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.4 }}
            >
              <BellRing className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-white font-bold text-sm uppercase tracking-wider">
              Reminder
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-purple-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="font-black text-slate-800 text-lg leading-snug mb-1">
            {reminder.title}
          </p>
          {reminder.description && (
            <p className="text-slate-600 text-sm mb-3">{reminder.description}</p>
          )}
          <p className="text-xs text-slate-400 font-medium mb-4">
            ⏰ {formatReminderTime(reminder.remind_at)}
          </p>
          <div className="flex gap-3">
            <a
              href={buildGCalURL(reminder)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white transition-colors"
              style={{ backgroundColor: COLORS.deepBlue }}
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Add to Google Calendar
            </a>
            <button
              onClick={onDismiss}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
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
  const [showPunchInModal, setShowPunchInModal] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [leaveFrom, setLeaveFrom] = useState(null);
  const [leaveTo, setLeaveTo] = useState(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [holidayRows, setHolidayRows] = useState([
    { name: '', date: format(new Date(), 'yyyy-MM-dd') }
  ]);
  const [liveDuration, setLiveDuration] = useState('0h 0m');
  const [reminders, setReminders] = useState([]);
  const [firedReminder, setFiredReminder] = useState(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDesc, setReminderDesc] = useState('');
  const [reminderDatetime, setReminderDatetime] = useState('');
  const firedIdsRef = useRef(new Set());
  const isEveryoneView = isAdmin && selectedUserId === 'everyone';
  const isViewingOther = isAdmin && !!selectedUserId && selectedUserId !== 'everyone';

  const displayTodayAttendance = useMemo(() => {
    if (isViewingOther) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      return attendanceHistory.find(a => a.date === todayStr) || null;
    }
    return todayAttendance;
  }, [isViewingOther, attendanceHistory, todayAttendance]);

  const displayLiveDuration = useMemo(() => {
    if (isViewingOther) return calculateTodayLiveDuration(displayTodayAttendance);
    return liveDuration;
  }, [isViewingOther, displayTodayAttendance, liveDuration]);

  useEffect(() => {
    fetchData();
    fetchReminders();
  }, []);

  useEffect(() => {
    if (!isViewingOther && todayAttendance && !todayAttendance.punch_in) {
      const timer = setTimeout(() => setShowPunchInModal(true), 800);
      return () => clearTimeout(timer);
    }
  }, [todayAttendance, isViewingOther]);

  useEffect(() => {
    setLiveDuration(calculateTodayLiveDuration(todayAttendance));
    if (todayAttendance?.punch_in && !todayAttendance?.punch_out) {
      const interval = setInterval(
        () => setLiveDuration(calculateTodayLiveDuration(todayAttendance)),
        60000
      );
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
        if (diff <= 0 && diff >= -2) {
          firedIdsRef.current.add(r.id);
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
      for (const record of attendanceHistory.slice(0, 15)) {
        if (record.location?.latitude && record.location?.longitude) {
          const key = `${record.location.latitude},${record.location.longitude}`;
          if (!locationCache[key]) {
            toResolve.push({ key, lat: record.location.latitude, lng: record.location.longitude });
          }
        }
        if (record.punch_out_location?.latitude && record.punch_out_location?.longitude) {
          const key = `${record.punch_out_location.latitude},${record.punch_out_location.longitude}`;
          if (!locationCache[key]) {
            toResolve.push({ key, lat: record.punch_out_location.latitude, lng: record.punch_out_location.longitude });
          }
        }
      }
      if (toResolve.length === 0) return;
      const results = {};
      for (const item of toResolve) {
        results[item.key] = await reverseGeocode(item.lat, item.lng);
      }
      setLocationCache(prev => ({ ...prev, ...results }));
    };
    resolveLocations();
  }, [attendanceHistory]);

  const fetchData = useCallback(async (overrideUserId = undefined) => {
    setLoading(true);
    const rawTargetId = isAdmin
      ? (overrideUserId !== undefined ? overrideUserId : selectedUserId)
      : null;
    const isEveryoneReq = isAdmin && rawTargetId === 'everyone';
    const isOtherReq = isAdmin && !!rawTargetId && rawTargetId !== 'everyone';
    const resolvedUserId = isEveryoneReq
      ? null
      : isOtherReq
        ? rawTargetId
        : (isAdmin ? user?.id : null);
    try {
      let historyUrl;
      if (isEveryoneReq) {
        historyUrl = '/attendance/history';
      } else if (resolvedUserId) {
        historyUrl = `/attendance/history?user_id=${resolvedUserId}`;
      } else {
        historyUrl = '/attendance/history';
      }
      const requests = [
        api.get(historyUrl),
        (isOtherReq || isEveryoneReq) ? Promise.resolve(null) : api.get('/attendance/my-summary'),
        api.get('/attendance/today'),
        api.get('/tasks'),
        api.get('/holidays'),
        canViewRankings
          ? api.get('/reports/performance-rankings?period=monthly')
          : Promise.resolve({ data: [] }),
      ];
      const [historyRes, summaryRes, todayRes, tasksRes, holidaysRes, rankingRes] =
        await Promise.all(requests);
      const allHolidays = holidaysRes.data || [];
      setHolidays(allHolidays.filter(h => h.status === 'confirmed'));
      if (isAdmin) setPendingHolidays(allHolidays.filter(h => h.status === 'pending'));
      if (isAdmin && allUsers.length === 0) {
        try {
          const usersRes = await api.get('/users');
          setAllUsers(usersRes.data || []);
        } catch (e) {
          console.error('Failed to fetch users:', e);
        }
      }
      const history = historyRes.data || [];
      setAttendanceHistory(history);
      setTodayAttendance(todayRes.data);
      if (isOtherReq) {
        const monthlySummary = {};
        history.forEach(a => {
          const m = a.date?.slice(0, 7);
          if (!m) return;
          if (!monthlySummary[m])
            monthlySummary[m] = { total_minutes: 0, days_present: 0 };
          if (a.punch_in) {
            monthlySummary[m].total_minutes += a.duration_minutes || 0;
            monthlySummary[m].days_present += 1;
          }
        });
        setMySummary({
          total_minutes: history.reduce((s, a) => s + (a.duration_minutes || 0), 0),
          total_days: history.filter(a => a.punch_in).length,
          monthly_summary: Object.entries(monthlySummary).map(([month, d]) => {
            const h = Math.floor(d.total_minutes / 60);
            const m = d.total_minutes % 60;
            return { month, ...d, total_hours: `${h}h ${m}m` };
          }),
        });
      } else if (isEveryoneReq) {
        const total_minutes = history.reduce((s, a) => s + (a.duration_minutes || 0), 0);
        const total_days = history.filter(a => a.punch_in).length;
        setMySummary({ total_minutes, total_days, monthly_summary: [] });
      } else {
        setMySummary(summaryRes?.data ?? null);
      }
      const allTasksData = tasksRes.data || [];
      const relevantTasks = isOtherReq
        ? allTasksData.filter(t => t.assigned_to === rawTargetId)
        : allTasksData;
      setTasksCompleted(relevantTasks.filter(t => t.status === 'completed').length);
      const rankingList = Array.isArray(rankingRes.data)
        ? rankingRes.data
        : (rankingRes.data?.rankings || rankingRes.data?.data || []);
      const rankUserId = isOtherReq ? rawTargetId : user?.id;
      const myEntry = rankingList.find(r => r.user_id === rankUserId);
      setMyRank(myEntry ? `#${myEntry.rank}` : '—');
    } catch (error) {
      toast.error('Failed to fetch attendance data');
      console.error('Attendance fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, isAdmin, canViewRankings, user?.id, allUsers.length]);

  const fetchReminders = useCallback(async (overrideUserId = undefined) => {
    try {
      const uid = overrideUserId !== undefined
        ? overrideUserId
        : (isViewingOther ? selectedUserId : null);
      if (uid === 'everyone') return;
      const url = uid ? `/reminders?user_id=${uid}` : '/reminders';
      const res = await api.get(url);
      setReminders(res.data || []);
    } catch {}
  }, [isViewingOther, selectedUserId]);

  const handlePunchAction = useCallback(async (action) => {
    setLoading(true);
    try {
      let locationData = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
          );
          locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch {}
      }
      const response = await api.post('/attendance', { action, location: locationData });
      if (action === 'punch_in') {
        toast.success('✓ Punched in successfully!', { duration: 3000 });
      } else {
        const duration = response.data?.duration || 0;
        toast.success(`✓ Punched out! (${formatDuration(duration)})`, { duration: 3000 });
      }
      await fetchData();
    } catch (error) {
      toast.error(
        error.response?.data?.detail || 'Failed to record attendance',
        { duration: 4000 }
      );
    } finally {
      setLoading(false);
    }
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
      setShowLeaveForm(false);
      setLeaveFrom(null);
      setLeaveTo(null);
      setLeaveReason('');
      await fetchData();
    } catch {
      toast.error('Failed to submit leave request');
    }
  }, [leaveFrom, leaveTo, leaveReason, fetchData]);

  const handleAddHolidays = useCallback(async () => {
    const validRows = holidayRows.filter(r => r.name.trim() && r.date);
    if (validRows.length === 0) { toast.error('Add at least one holiday'); return; }
    let added = 0, failed = 0;
    for (const row of validRows) {
      try {
        await api.post('/holidays', { date: row.date, name: row.name.trim() });
        added++;
      } catch {
        failed++;
      }
    }
    if (added > 0) toast.success(`✓ ${added} holiday${added > 1 ? 's' : ''} added`);
    if (failed > 0) toast.error(`${failed} failed (may already exist)`);
    setShowHolidayModal(false);
    setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
    await fetchData();
  }, [holidayRows, fetchData]);

  const handleHolidayDecision = useCallback(async (holidayDate, decision) => {
    try {
      await api.patch(`/holidays/${holidayDate}/status`, { status: decision });
      toast.success(decision === 'confirmed' ? 'Holiday confirmed' : 'Holiday rejected');
      await fetchData();
    } catch {
      toast.error('Failed to update holiday');
    }
  }, [fetchData]);

  const handleCreateReminder = useCallback(async () => {
    if (!reminderTitle.trim() || !reminderDatetime) {
      toast.error('Title and date/time are required');
      return;
    }
    try {
      await api.post('/reminders', {
        title: reminderTitle.trim(),
        description: reminderDesc.trim() || null,
        remind_at: new Date(reminderDatetime).toISOString(),
      });
      toast.success('✓ Reminder set!');
      setShowReminderForm(false);
      setReminderTitle('');
      setReminderDesc('');
      setReminderDatetime('');
      await fetchReminders();
    } catch {
      toast.error('Failed to create reminder');
    }
  }, [reminderTitle, reminderDesc, reminderDatetime, fetchReminders]);

  const handleDeleteReminder = useCallback(async (id) => {
    try {
      await api.delete(`/reminders/${id}`);
      setReminders(prev => prev.filter(r => r.id !== id));
      toast.success('Reminder deleted');
    } catch {
      toast.error('Failed to delete reminder');
    }
  }, []);

  const handleDismissPopup = useCallback(async () => {
    if (!firedReminder) return;
    try {
      await api.patch(`/reminders/${firedReminder.id}`, { is_dismissed: true });
    } catch {}
    setReminders(prev =>
      prev.map(r => r.id === firedReminder.id ? { ...r, is_dismissed: true } : r)
    );
    setFiredReminder(null);
  }, [firedReminder]);

  const handleExportPDF = useCallback(() => {
    let employeeName;
    if (isAdmin && selectedUserId === 'everyone') {
      employeeName = 'All Employees';
    } else if (isAdmin && selectedUserId) {
      employeeName = allUsers.find(u => u.id === selectedUserId)?.full_name || 'Employee';
    } else {
      employeeName = user?.full_name || 'Staff Member';
    }
    const doc = new jsPDF();
    doc.setFillColor(13, 59, 102);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('TASKOSPHERE — ATTENDANCE REPORT', 10, 10);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')} IST`, 10, 19);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Employee: ${employeeName}`, 10, 34);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`Report Period: ${format(selectedDate, 'MMMM yyyy')}`, 10, 42);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 47, 200, 47);
    const monthlyHours = mySummary?.monthly_summary
      ?.find(s => s.month === format(selectedDate, 'yyyy-MM'))?.total_hours || '0h 0m';
    doc.setFontSize(11);
    doc.text(`Total Monthly Hours : ${monthlyHours}`, 10, 56);
    doc.text(`Days Present : ${attendanceHistory.filter(a => a.punch_in).length}`, 10, 64);
    doc.text(`Late Arrivals : ${attendanceHistory.filter(a => a.is_late).length}`, 10, 72);
    doc.line(10, 80, 200, 80);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Attendance Log (Last 15 Records):', 10, 89);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('DATE', 10, 98);
    doc.text('PUNCH IN', 55, 98);
    doc.text('PUNCH OUT', 95, 98);
    doc.text('DURATION', 140, 98);
    doc.text('LOCATION', 168, 98);
    doc.setDrawColor(180, 180, 180);
    doc.line(10, 100, 200, 100);
    doc.setTextColor(0, 0, 0);
    let y = 108;
    attendanceHistory.slice(0, 15).forEach((record, index) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(10, y - 5, 190, 9, 'F');
      }
      doc.setFontSize(9);
      doc.text(format(parseISO(record.date), 'dd MMM yyyy'), 10, y);
      doc.text(formatAttendanceTime(record.punch_in), 55, y);
      doc.text(
        record.punch_out ? formatAttendanceTime(record.punch_out) : 'Ongoing',
        95, y
      );
      doc.text(formatDuration(record.duration_minutes), 140, y);
      const locKey = record.location?.latitude
        ? `${record.location.latitude},${record.location.longitude}`
        : null;
      const locLabel = locKey
        ? (locationCache[locKey] || `${record.location.latitude?.toFixed(2)}, ${record.location.longitude?.toFixed(2)}`)
        : '—';
      doc.text(locLabel.substring(0, 25), 168, y);
      y += 10;
    });
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Taskosphere HR Management System | Confidential', 10, 288);
    doc.save(
      `Attendance_${employeeName.replace(/\s+/g, '_')}_${format(selectedDate, 'MMM_yyyy')}.pdf`
    );
  }, [isAdmin, selectedUserId, allUsers, user, selectedDate, attendanceHistory, mySummary, locationCache]);

  const monthAttendance = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    let atts = attendanceHistory.filter(a => {
      const d = parseISO(a.date);
      return d >= start && d <= end;
    });
    if (displayTodayAttendance) {
      const todayStr = displayTodayAttendance.date;
      if (!atts.some(a => a.date === todayStr)) {
        const todayD = parseISO(todayStr);
        if (todayD >= start && todayD <= end) {
          atts = [...atts, displayTodayAttendance];
        }
      }
    }
    return atts;
  }, [attendanceHistory, displayTodayAttendance, selectedDate]);

  const monthTotalMinutes = useMemo(() => monthAttendance.reduce((sum, a) => sum + (a.duration_minutes || 0), 0), [monthAttendance]);
  const monthDaysPresent = useMemo(() => monthAttendance.filter(a => a.punch_in).length, [monthAttendance]);
  const totalDaysLateThisMonth = useMemo(() => monthAttendance.filter(a => a.punch_in && a.is_late).length, [monthAttendance]);
  const isTodaySelected = dateFnsIsToday(selectedDate);
  const isFutureSelected = isAfter(selectedDate, new Date());

  const selectedAttendance = isTodaySelected
    ? displayTodayAttendance
    : attendanceHistory.find(a => a.date === format(selectedDate, 'yyyy-MM-dd')) || null;

  const selectedHoliday = holidays.find(h => h.date === format(selectedDate, 'yyyy-MM-dd'));
  const attendanceMap = useMemo(() => {
    const map = {};
    attendanceHistory.forEach(a => { map[a.date] = a; });
    if (displayTodayAttendance) {
      map[displayTodayAttendance.date] = displayTodayAttendance;
    }
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
    reminders
      .filter(r => !r.is_dismissed)
      .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at)),
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

  return (
    <TooltipProvider>
      <AnimatePresence>
        {firedReminder && (
          <ReminderPopup
            reminder={firedReminder}
            onDismiss={handleDismissPopup}
          />
        )}
      </AnimatePresence>
      <motion.div
        className="min-h-screen overflow-y-auto p-5 md:p-7 lg:p-9"
        style={{
          background: `linear-gradient(135deg, ${COLORS.slate50} 0%, #FFFFFF 100%)`,
          fontFamily: "'DM Sans', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1
              className="text-4xl font-black tracking-tight"
              style={{ color: COLORS.deepBlue, letterSpacing: '-0.02em' }}
            >
              {isAdmin ? 'Attendance Management' : 'My Attendance'}
            </h1>
            <p className="text-slate-500 mt-2 text-sm font-medium">
              {isAdmin
                ? 'Manage team attendance across all departments'
                : 'Track your daily hours and attendance'}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            {isAdmin && (
              <motion.select
                variants={itemVariants}
                className="border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:border-blue-400 transition-colors font-medium"
                value={selectedUserId || ''}
                onChange={e => {
                  const val = e.target.value || null;
                  setSelectedUserId(val);
                  fetchData(val);
                  fetchReminders(val);
                }}
                disabled={allUsers.length === 0}
              >
                <option value="">
                  {allUsers.length === 0
                    ? 'Loading users…'
                    : user?.full_name
                      ? `${user.full_name} (Admin)`
                      : 'My Attendance'}
                </option>
                <option value="everyone">👥 Everyone (All Users)</option>
                {allUsers
                  .filter(u => u.id !== user?.id)
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role === 'admin' ? 'Admin' : u.role})
                    </option>
                  ))}
              </motion.select>
            )}
            {isAdmin && (
              <motion.div variants={itemVariants}>
                <Button
                  onClick={() => {
                    setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
                    setShowHolidayModal(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl px-5 py-2.5"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Add Holiday
                </Button>
              </motion.div>
            )}
            <motion.div variants={itemVariants}>
              <Button
                onClick={handleExportPDF}
                variant="outline"
                className="border-2 border-slate-200 rounded-xl px-5 py-2.5 font-semibold hover:bg-slate-50"
              >
                ↓ Export PDF
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {(isViewingOther || isEveryoneView) && (
          <motion.div
            variants={itemVariants}
            className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 border-blue-200"
            style={{ backgroundColor: '#EFF6FF' }}
          >
            <Users className="w-4 h-4 text-blue-700" />
            <span className="text-sm font-semibold text-blue-900">
              {isEveryoneView
                ? 'Viewing attendance for all employees'
                : <>Viewing attendance for: <span className="underline decoration-dotted">{viewedUserName}</span></>
              }
            </span>
            <button
              className="ml-auto text-blue-600 hover:text-blue-800 text-xs font-bold underline"
              onClick={() => {
                setSelectedUserId(null);
                fetchData(null);
                fetchReminders(null);
              }}
            >
              Clear — show my data
            </button>
          </motion.div>
        )}

        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card
              className="border-0 shadow-xl overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
              }}
            >
              <CardContent className="p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div className="text-white space-y-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center"
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Clock className="w-8 h-8 text-white" />
                      </motion.div>
                      <div>
                        <h3 className="text-2xl font-bold">
                          {isTodaySelected
                            ? isViewingOther
                              ? `${viewedUserName}'s Status`
                              : "Today's Status"
                            : format(selectedDate, 'EEEE, MMM d')}
                        </h3>
                        <p className="text-blue-100 text-sm mt-0.5">
                          {isViewingOther
                            ? 'Read-only view — use the dropdown to switch users'
                            : 'Real-time attendance tracking'}
                        </p>
                      </div>
                    </div>
                    {displayTodayAttendance?.punch_in && (
                      <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-2">
                        <p className="text-blue-100 text-sm">
                          <span className="font-semibold">In:</span>{' '}
                          {formatAttendanceTime(displayTodayAttendance.punch_in)}
                          {displayTodayAttendance.punch_out && (
                            <>
                              {' • '}
                              <span className="font-semibold">Out:</span>{' '}
                              {formatAttendanceTime(displayTodayAttendance.punch_out)}
                            </>
                          )}
                        </p>
                        {!isViewingOther && (
                          <p className="text-blue-100 text-xs">
                            Expected: {user?.punch_in_time || '10:30'}{' '}
                            ({user?.grace_time || '15'} min grace) •{' '}
                            {user?.punch_out_time || '19:00'}
                          </p>
                        )}
                      </div>
                    )}
                    {displayTodayAttendance?.status === 'leave' && (
                      <div
                        className="backdrop-blur rounded-xl p-4"
                        style={{ backgroundColor: 'rgba(249,115,22,0.2)' }}
                      >
                        <p className="text-sm font-semibold text-orange-200">
                          🟠 On leave today
                          {displayTodayAttendance.leave_reason
                            ? ` — ${displayTodayAttendance.leave_reason}`
                            : ''}
                        </p>
                      </div>
                    )}
                    {!isViewingOther && (
                      <div className="flex gap-3 flex-wrap pt-2">
                        {!todayAttendance?.punch_in ? (
                          <>
                            {isTodaySelected && (
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  handlePunchAction('punch_in');
                                  setShowPunchInModal(false);
                                }}
                                disabled={loading}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
                              >
                                <LogIn className="w-5 h-5 inline mr-2" />
                                Punch In
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setShowLeaveForm(true)}
                              className="border-2 border-white text-white font-bold px-6 py-2.5 rounded-xl hover:bg-white/10 transition-colors"
                            >
                              Apply Leave
                            </motion.button>
                          </>
                        ) : !todayAttendance?.punch_out && isTodaySelected ? (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handlePunchAction('punch_out')}
                            disabled={loading}
                            className="bg-white/20 hover:bg-white/30 backdrop-blur text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
                          >
                            <LogOut className="w-5 h-5 inline mr-2" />
                            Punch Out
                          </motion.button>
                        ) : todayAttendance?.punch_out ? (
                          <Badge className="px-4 py-2 bg-white/20 text-white border-0 font-mono">
                            {formatDuration(todayAttendance.duration_minutes)}
                          </Badge>
                        ) : null}
                      </div>
                    )}
                    {isViewingOther && (
                      <p className="text-xs text-blue-300 font-medium pt-1">
                        ℹ️ Punch actions are only available for your own attendance.
                      </p>
                    )}
                  </div>
                  <div>
                    <DigitalClock />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {isAdmin && pendingHolidays.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-2 border-amber-200 bg-amber-50 shadow-md">
              <div className="bg-amber-100 px-6 py-3 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                  <span className="text-sm font-black uppercase text-amber-900">
                    Holiday Review ({pendingHolidays.length})
                  </span>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingHolidays.map(holiday => (
                    <motion.div
                      key={holiday.date}
                      variants={itemVariants}
                      className="bg-white p-5 rounded-xl border-2 border-amber-200 shadow-sm"
                    >
                      <h4 className="font-bold text-slate-800 text-lg mb-2">{holiday.name}</h4>
                      <p className="text-sm text-slate-500 mb-4">
                        {format(parseISO(holiday.date), 'EEEE, MMMM do, yyyy')}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                          onClick={() => handleHolidayDecision(holiday.date, 'confirmed')}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-red-300 text-red-600 hover:bg-red-50 font-bold rounded-lg"
                          onClick={() => handleHolidayDecision(holiday.date, 'rejected')}
                        >
                          Reject
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div
          className={`grid gap-4 mb-8 items-stretch ${
            canViewRankings
              ? 'grid-cols-2 lg:grid-cols-4'
              : 'grid-cols-2 lg:grid-cols-3'
          }`}
        >
          <StatCard
            icon={Timer}
            label={
              isEveryoneView
                ? 'Total (All Staff)'
                : isViewingOther
                  ? `${viewedUserName?.split(' ')[0]}'s Month`
                  : 'This Month'
            }
            value={formatDuration(monthTotalMinutes).split('h')[0]}
            unit="hours"
            color={COLORS.deepBlue}
            trend={`${monthDaysPresent} days present`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Tasks Done"
            value={tasksCompleted}
            unit="completed"
            color={COLORS.emeraldGreen}
            trend=" "
          />
          <StatCard
            icon={CalendarX}
            label="Days Late"
            value={totalDaysLateThisMonth}
            unit="this month"
            color={COLORS.red}
            trend=" "
          />
          {canViewRankings && !isEveryoneView && (
            <StatCard
              icon={TrendingUp}
              label={isViewingOther ? 'Their Rank' : 'Your Rank'}
              value={myRank}
              unit="overall"
              color={COLORS.deepBlue}
              trend=" "
            />
          )}
        </motion.div>

        {!isEveryoneView && (
          <motion.div variants={itemVariants} className="mb-8">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {isViewingOther
                        ? `${viewedUserName?.split(' ')[0]}'s Daily Progress`
                        : 'Daily Progress'}
                    </p>
                    <p
                      className="text-5xl font-black tracking-tight mb-1"
                      style={{ color: COLORS.emeraldGreen, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {displayLiveDuration}
                    </p>
                    <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">
                      {!isViewingOther &&
                       displayTodayAttendance?.punch_in &&
                       !displayTodayAttendance?.punch_out
                        ? '● Live • updating every minute'
                        : 'Total for today'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-slate-50 p-4 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase mb-1">Daily Goal</p>
                      <p className="text-2xl font-bold text-slate-800">8.5h</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-slate-50 p-4 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-bold uppercase mb-1">Progress</p>
                      <p className="text-2xl font-bold text-emerald-600">{progressPct}%</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 bg-slate-100 rounded-full h-3 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!isEveryoneView && (
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8"
          >
            {(() => {
              const monthHolidaysGrid = holidays.filter(h => {
                try {
                  return format(parseISO(h.date), 'yyyy-MM') === format(selectedDate, 'yyyy-MM');
                } catch { return false; }
              });
              return (
                <Card className="border-0 shadow-md overflow-hidden flex flex-col">
                  <div
                    className="px-6 py-4 flex items-center gap-3"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.amber}18, ${COLORS.amber}08)`,
                      borderBottom: `2px solid ${COLORS.amber}30`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${COLORS.amber}25` }}
                    >
                      <span className="text-xl">🎉</span>
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800" style={{ color: COLORS.deepBlue }}>
                        Holidays — {format(selectedDate, 'MMMM yyyy')}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        {monthHolidaysGrid.length} holiday{monthHolidaysGrid.length !== 1 ? 's' : ''} this month
                      </p>
                    </div>
                  </div>
                  <CardContent className="p-6 flex-1">
                    {monthHolidaysGrid.length === 0 ? (
                      <div className="text-center py-10">
                        <span className="text-4xl block mb-3">🗓️</span>
                        <p className="text-slate-400 font-medium text-sm">No holidays this month</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {monthHolidaysGrid.map(h => (
                          <motion.div
                            key={h.date}
                            variants={itemVariants}
                            className="flex items-center gap-4 p-3.5 rounded-xl"
                            style={{
                              backgroundColor: `${COLORS.amber}12`,
                              border: `1.5px solid ${COLORS.amber}35`,
                            }}
                          >
                            <div
                              className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white font-black shadow-sm"
                              style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #D97706)` }}
                            >
                              <span className="text-[10px] leading-none uppercase tracking-wide">
                                {format(parseISO(h.date), 'MMM')}
                              </span>
                              <span className="text-lg leading-none font-black">
                                {format(parseISO(h.date), 'd')}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-800 truncate leading-snug">{h.name}</p>
                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                {format(parseISO(h.date), 'EEEE')}
                              </p>
                            </div>
                            <span
                              className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex-shrink-0"
                              style={{
                                color: COLORS.amber,
                                backgroundColor: `${COLORS.amber}20`,
                                border: `1px solid ${COLORS.amber}40`,
                              }}
                            >
                              Holiday
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            <Card className="border-0 shadow-md overflow-hidden flex flex-col">
              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.purple}18, ${COLORS.purple}08)`,
                  borderBottom: `2px solid ${COLORS.purple}25`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${COLORS.purple}20` }}
                  >
                    <AlarmClock className="w-5 h-5" style={{ color: COLORS.purple }} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800" style={{ color: COLORS.deepBlue }}>
                      {isViewingOther
                        ? `${viewedUserName?.split(' ')[0]}'s Reminders`
                        : 'Reminders & Meetings'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {upcomingReminders.length} upcoming
                      {!isViewingOther && ' • popups fire automatically'}
                    </p>
                  </div>
                </div>
                {!isViewingOther && (
                  <Button
                    onClick={() => setShowReminderForm(true)}
                    className="font-bold rounded-xl text-white px-4 py-2"
                    style={{ backgroundColor: COLORS.purple }}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    New
                  </Button>
                )}
              </div>
              <CardContent className="p-6 flex-1">
                {upcomingReminders.length === 0 ? (
                  <div className="text-center py-10">
                    <Bell className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium text-sm">
                      {isViewingOther
                        ? 'No upcoming reminders for this user'
                        : 'No upcoming reminders. Create one to get started!'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingReminders.map(r => {
                      const isDue = isPast(new Date(r.remind_at));
                      return (
                        <motion.div
                          key={r.id}
                          variants={itemVariants}
                          className="relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all"
                          style={{
                            borderColor: isDue ? `${COLORS.red}40` : `${COLORS.purple}30`,
                            backgroundColor: isDue ? `${COLORS.red}06` : `${COLORS.purple}06`,
                          }}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: isDue ? `${COLORS.red}15` : `${COLORS.purple}18` }}
                          >
                            <Bell className="w-5 h-5" style={{ color: isDue ? COLORS.red : COLORS.purple }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-bold text-slate-800 text-sm leading-snug">{r.title}</p>
                              {isDue && (
                                <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-full uppercase flex-shrink-0">
                                  Past Due
                                </span>
                              )}
                            </div>
                            {r.description && (
                              <p className="text-xs text-slate-500 mb-2 line-clamp-1">{r.description}</p>
                            )}
                            <p
                              className="text-xs font-mono font-bold mb-3"
                              style={{ color: isDue ? COLORS.red : COLORS.purple }}
                            >
                              ⏰ {formatReminderTime(r.remind_at)}
                            </p>
                            <div className="flex gap-2">
                              <a
                                href={buildGCalURL(r)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors"
                                style={{ backgroundColor: COLORS.deepBlue }}
                              >
                                <ExternalLink className="w-3 h-3" />
                                Google Cal
                              </a>
                              {!isViewingOther && (
                                <button
                                  onClick={() => handleDeleteReminder(r.id)}
                                  className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
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
        )}

        <motion.div className={`grid gap-8 ${isEveryoneView ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-3'}`}>
          {!isEveryoneView && (
            <motion.div variants={itemVariants} className="xl:col-span-1 space-y-6">
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle
                      className="flex items-center gap-2"
                      style={{ color: COLORS.deepBlue }}
                    >
                      <CalendarIcon className="w-5 h-5" />
                      Attendance Calendar
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(new Date())}
                      className="text-xs font-bold"
                    >
                      Today
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Click any date (including upcoming) for details
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={date => date && setSelectedDate(date)}
                    className="rounded-xl border-0 shadow-sm"
                    classNames={{
                      months: 'w-full',
                      month: 'w-full space-y-3',
                      table: 'w-full border-collapse',
                      head_row: 'flex w-full justify-between mb-2',
                      head_cell: 'text-slate-400 rounded-lg w-9 font-bold text-[0.75rem] text-center',
                      row: 'flex w-full mt-2 justify-between',
                      cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                      day: 'h-10 w-10 p-0 font-semibold rounded-full transition-all hover:bg-slate-100',
                      day_today: 'font-black',
                    }}
                    components={{
                      Day: props => (
                        <CustomDay
                          {...props}
                          attendance={attendanceMap}
                          holidays={holidays}
                        />
                      ),
                    }}
                  />
                  <div className="flex flex-wrap gap-x-3 gap-y-2 mt-6 text-xs justify-center border-t pt-4">
                    {[
                      { color: COLORS.emeraldGreen, label: 'Present', style: 'solid' },
                      { color: COLORS.orange, label: 'Half Day', style: 'solid' },
                      { color: COLORS.red, label: 'Late', style: 'solid' },
                      { color: COLORS.maroon, label: 'Absent', style: 'solid' },
                      { color: COLORS.amber, label: 'Holiday', style: 'solid' },
                      { color: COLORS.orange, label: 'Leave', style: 'solid' },
                    ].map(({ color, label, style }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                          style={{
                            borderColor: color,
                            borderStyle: style,
                            backgroundColor: `${color}25`,
                          }}
                        />
                        <span className="text-slate-600">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  {selectedAttendance?.punch_in ? (
                    <div
                      className="p-6 bg-gradient-to-br from-emerald-50 to-slate-50 border-l-4"
                      style={{ borderColor: COLORS.emeraldGreen }}
                    >
                      <p className="font-bold text-slate-800 text-lg mb-4">
                        {format(selectedDate, 'EEEE, MMM d, yyyy')}
                      </p>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Punch In</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatAttendanceTime(selectedAttendance.punch_in)}
                          </span>
                        </div>
                        {selectedAttendance.punch_out && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Punch Out</span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatAttendanceTime(selectedAttendance.punch_out)}
                            </span>
                          </div>
                        )}
                        {selectedAttendance.status === 'half_day' && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Status</span>
                            <span className="text-xs font-bold text-orange-600 uppercase px-2 py-1 bg-orange-100 rounded">
                              Half Day
                            </span>
                          </div>
                        )}
                        {selectedAttendance.is_late && selectedAttendance.status !== 'half_day' && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Status</span>
                            <span className="text-xs font-bold text-red-600 uppercase px-2 py-1 bg-red-100 rounded">
                              Late Arrival
                            </span>
                          </div>
                        )}
                        {getLocationLabel(selectedAttendance, 'in') && (
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-600 font-medium text-xs">In Location</span>
                            <span className="text-xs font-medium text-slate-700 text-right max-w-[60%] leading-snug">
                              {getLocationLabel(selectedAttendance, 'in')}
                            </span>
                          </div>
                        )}
                        {getLocationLabel(selectedAttendance, 'out') && (
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-600 font-medium text-xs">Out Location</span>
                            <span className="text-xs font-medium text-slate-700 text-right max-w-[60%] leading-snug">
                              {getLocationLabel(selectedAttendance, 'out')}
                            </span>
                          </div>
                        )}
                        <div className="pt-3 border-t flex justify-between items-center">
                          <span className="font-bold text-slate-800">Duration</span>
                          <Badge
                            className="px-3 py-1 font-mono font-bold"
                            style={{ backgroundColor: COLORS.emeraldGreen, color: 'white' }}
                          >
                            {formatDuration(selectedAttendance.duration_minutes)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : selectedAttendance?.status === 'leave' ? (
                    <div
                      className="p-6 border-l-4"
                      style={{
                        borderColor: COLORS.orange,
                        background: 'linear-gradient(to bottom right, #FFF7ED, #F8FAFC)',
                      }}
                    >
                      <p className="font-bold text-lg mb-1" style={{ color: COLORS.orange }}>
                        🟠 On Leave
                      </p>
                      <p className="text-sm text-slate-600">
                        {format(selectedDate, 'EEEE, MMM d, yyyy')}
                      </p>
                      {selectedAttendance.leave_reason && (
                        <p className="text-xs text-slate-500 mt-2 font-medium">
                          Reason: {selectedAttendance.leave_reason}
                        </p>
                      )}
                    </div>
                  ) : selectedAttendance?.status === 'absent' ? (
                    <div
                      className="p-6 bg-gradient-to-br from-red-50 to-slate-50 border-l-4"
                      style={{ borderColor: COLORS.maroon }}
                    >
                      <p className="font-bold text-lg mb-1" style={{ color: COLORS.maroon }}>
                        ❌ Absent
                      </p>
                      <p className="text-sm text-slate-600">
                        {format(selectedDate, 'EEEE, MMM d, yyyy')}
                      </p>
                      <p className="text-xs text-red-600 mt-4 font-medium">
                        No punch-in recorded for this day
                      </p>
                    </div>
                  ) : selectedHoliday ? (
                    <div className="p-6 bg-gradient-to-br from-amber-50 to-slate-50 border-l-4 border-amber-400">
                      <p className="text-sm font-bold text-amber-900">
                        🎉 Holiday: {selectedHoliday.name}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                  ) : isFutureSelected ? (
                    <div
                      className="p-6 bg-gradient-to-br from-blue-50 to-slate-50 border-l-4"
                      style={{ borderColor: COLORS.mediumBlue }}
                    >
                      <p className="text-sm font-bold text-blue-900">📅 Upcoming Date</p>
                      <p className="text-xs text-blue-700 mt-1">
                        {format(selectedDate, 'EEEE, MMM d, yyyy')}
                      </p>
                      <p className="text-xs text-slate-500 mt-4">
                        Attendance will be recorded once the day arrives.
                      </p>
                      <p className="text-[10px] text-slate-400 mt-6">No data available yet</p>
                    </div>
                  ) : (
                    <div className="p-6 bg-gradient-to-br from-red-50 to-slate-50 border-l-4 border-red-400">
                      <p className="text-sm font-bold text-red-900">
                        No record for {format(selectedDate, 'MMM d')}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        This past date has no attendance entry
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div variants={itemVariants} className={isEveryoneView ? '' : 'xl:col-span-2'}>
            <Card className="border-0 shadow-md h-fit">
              <CardHeader className="border-b border-slate-100">
                <CardTitle style={{ color: COLORS.deepBlue }}>
                  {isEveryoneView
                    ? 'All Employees — Recent Attendance'
                    : isViewingOther
                      ? `${viewedUserName}'s Recent Attendance`
                      : 'Recent Attendance'}
                </CardTitle>
                <CardDescription>
                  {isEveryoneView ? 'Latest 25 records across all staff' : 'Last 15 records'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {recentAttendance.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 font-medium">
                    No records yet
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[700px] overflow-y-auto">
                    {recentAttendance.map((record, idx) => {
                      const inLocLabel = getLocationLabel(record, 'in');
                      const outLocLabel = getLocationLabel(record, 'out');
                      const recordUserName = isEveryoneView ? (userMap[record.user_id] || record.user_id) : null;
                      return (
                        <motion.div
                          key={`${record.date}-${record.user_id || idx}`}
                          variants={itemVariants}
                          className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {recordUserName && (
                                <p className="text-xs font-bold text-blue-700 mb-1 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {recordUserName}
                                </p>
                              )}
                              <p className="font-bold text-slate-800 text-sm">
                                {format(parseISO(record.date), 'EEE, MMM d, yyyy')}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 font-mono">
                                {record.status === 'leave'
                                  ? `🟠 On Leave${record.leave_reason ? ` — ${record.leave_reason}` : ''}`
                                  : record.punch_in
                                    ? `${formatAttendanceTime(record.punch_in)} → ${
                                        record.punch_out
                                          ? formatAttendanceTime(record.punch_out)
                                          : 'Ongoing'
                                      }`
                                    : '—'}
                              </p>
                              {inLocLabel && (
                                <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                                  <MapPin
                                    className="w-3 h-3 flex-shrink-0 mt-0.5"
                                    style={{ color: COLORS.emeraldGreen }}
                                  />
                                  <span>
                                    <span className="font-semibold text-emerald-700">In: </span>
                                    {inLocLabel}
                                  </span>
                                </p>
                              )}
                              {outLocLabel && (
                                <p className="text-[11px] text-slate-500 mt-0.5 flex items-start gap-1">
                                  <MapPin
                                    className="w-3 h-3 flex-shrink-0 mt-0.5"
                                    style={{ color: COLORS.orange }}
                                  />
                                  <span>
                                    <span className="font-semibold text-orange-600">Out: </span>
                                    {outLocLabel}
                                  </span>
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {record.status === 'leave' ? (
                                <span
                                  className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                                  style={{
                                    color: COLORS.orange,
                                    backgroundColor: `${COLORS.orange}20`,
                                  }}
                                >
                                  Leave
                                </span>
                              ) : (
                                <Badge
                                  className="font-mono text-xs font-bold px-2 py-1"
                                  style={{
                                    backgroundColor: record.duration_minutes > 0
                                      ? `${COLORS.emeraldGreen}20`
                                      : COLORS.slate200,
                                    color: record.duration_minutes > 0
                                      ? COLORS.emeraldGreen
                                      : COLORS.deepBlue,
                                    border: `1px solid ${
                                      record.duration_minutes > 0
                                        ? COLORS.emeraldGreen
                                        : COLORS.slate200
                                    }`,
                                  }}
                                >
                                  {formatDuration(record.duration_minutes)}
                                </Badge>
                              )}
                              {record.status === 'half_day' && (
                                <span className="text-[10px] font-bold text-orange-600 uppercase px-2 py-1 bg-orange-100 rounded">
                                  Half Day
                                </span>
                              )}
                              {record.is_late && record.status !== 'half_day' && (
                                <span className="text-[10px] font-bold text-red-600 uppercase px-2 py-1 bg-red-100 rounded">
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

        <AnimatePresence>
          {showPunchInModal && !isViewingOther && !isEveryoneView && (
            <motion.div
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPunchInModal(false)}
            >
              <motion.div
                className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
              >
                <div className="mb-6">
                  <motion.div
                    className="mx-auto w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <LogIn className="w-10 h-10 text-emerald-600" />
                  </motion.div>
                </div>
                <h2 className="text-3xl font-black mb-3" style={{ color: COLORS.deepBlue }}>
                  Good Morning! 👋
                </h2>
                <p className="text-slate-600 text-lg mb-8">
                  Let's punch in and start your day
                </p>
                <Button
                  onClick={() => {
                    handlePunchAction('punch_in');
                    setShowPunchInModal(false);
                  }}
                  disabled={loading}
                  className="w-full mb-4 py-3 text-lg font-bold rounded-2xl text-white"
                  style={{ backgroundColor: COLORS.emeraldGreen }}
                >
                  Punch In Now
                </Button>
                <button
                  onClick={() => setShowPunchInModal(false)}
                  className="text-slate-500 hover:text-slate-700 text-sm underline"
                >
                  I'll do it later
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLeaveForm && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black" style={{ color: COLORS.deepBlue }}>
                      Request Leave
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">
                      Select your leave period
                    </p>
                  </div>
                  <button
                    onClick={() => setShowLeaveForm(false)}
                    className="text-slate-400 hover:text-slate-600 text-2xl font-light"
                  >
                    ✕
                  </button>
                </div>
                <div className="mb-8">
                  <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-widest">
                    Quick Select
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 7, 15, 30].map(days => (
                      <Button
                        key={days}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const from = new Date();
                          const to = new Date();
                          to.setDate(from.getDate() + days - 1);
                          setLeaveFrom(from);
                          setLeaveTo(to);
                        }}
                        className="rounded-lg font-semibold"
                      >
                        {days === 1 ? '1 Day' : `${days} Days`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-3 block">From Date</label>
                    <Calendar
                      mode="single"
                      selected={leaveFrom}
                      onSelect={setLeaveFrom}
                      disabled={date => isBefore(date, startOfDay(new Date()))}
                      className="rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-3 block">To Date</label>
                    <Calendar
                      mode="single"
                      selected={leaveTo}
                      onSelect={setLeaveTo}
                      disabled={date => leaveFrom ? isBefore(date, leaveFrom) : true}
                      className="rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
                {leaveFrom && (
                  <motion.div
                    className="p-5 rounded-2xl mb-8"
                    style={{
                      backgroundColor: `${COLORS.deepBlue}10`,
                      borderLeft: `4px solid ${COLORS.deepBlue}`,
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <p className="text-xs text-slate-600 font-medium mb-1">Total Duration</p>
                    <p className="text-2xl font-black" style={{ color: COLORS.deepBlue }}>
                      {Math.max(
                        1,
                        leaveTo
                          ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1
                          : 1
                      )}{' '}
                      days
                    </p>
                    <p className="text-xs text-slate-500 mt-2 font-medium">
                      {format(leaveFrom, 'dd MMM')} —{' '}
                      {leaveTo ? format(leaveTo, 'dd MMM yyyy') : format(leaveFrom, 'dd MMM yyyy')}
                    </p>
                  </motion.div>
                )}
                <div className="mb-8">
                  <label className="text-sm font-bold text-slate-700 mb-2 block">
                    Reason (Optional)
                  </label>
                  <textarea
                    value={leaveReason}
                    onChange={e => setLeaveReason(e.target.value)}
                    placeholder="Tell us why you need leave…"
                    className="w-full min-h-[100px] p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setShowLeaveForm(false)}
                    className="font-semibold rounded-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!leaveFrom}
                    onClick={handleApplyLeave}
                    className="font-bold rounded-lg text-white"
                    style={{ backgroundColor: COLORS.deepBlue }}
                  >
                    Submit Request
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showHolidayModal && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
              >
                <div
                  className="px-8 py-6 text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
                >
                  <h2 className="text-2xl font-black">Add Holidays</h2>
                  <p className="text-blue-200 text-sm mt-1">Batch-add holidays to the calendar</p>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-[1fr_160px_40px] gap-3 mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date</p>
                  </div>
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-6">
                    {holidayRows.map((row, idx) => (
                      <motion.div
                        key={idx}
                        className="grid grid-cols-[1fr_160px_40px] gap-3 items-center"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <input
                          type="text"
                          value={row.name}
                          onChange={e => {
                            const updated = [...holidayRows];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setHolidayRows(updated);
                          }}
                          placeholder="e.g., Diwali"
                          className="px-4 py-2.5 text-sm border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                        />
                        <input
                          type="date"
                          value={row.date}
                          onChange={e => {
                            const updated = [...holidayRows];
                            updated[idx] = { ...updated[idx], date: e.target.value };
                            setHolidayRows(updated);
                          }}
                          className="px-4 py-2.5 text-sm border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => setHolidayRows(holidayRows.filter((_, i) => i !== idx))}
                          disabled={holidayRows.length === 1}
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 font-bold text-lg transition-colors"
                        >
                          ×
                        </button>
                      </motion.div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setHolidayRows([...holidayRows, { name: '', date: format(new Date(), 'yyyy-MM-dd') }])
                    }
                    className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 mb-6"
                  >
                    <span className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold">
                      +
                    </span>
                    Add Another
                  </button>
                </div>
                <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                  <p className="text-xs text-slate-500 font-medium">
                    {holidayRows.filter(r => r.name.trim() && r.date).length} of{' '}
                    {holidayRows.length} ready
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowHolidayModal(false);
                        setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
                      }}
                      className="font-bold rounded-lg"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={holidayRows.filter(r => r.name.trim() && r.date).length === 0}
                      onClick={handleAddHolidays}
                      className="font-bold text-white rounded-lg"
                      style={{ backgroundColor: COLORS.deepBlue }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showReminderForm && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
              >
                <div
                  className="px-8 py-6 text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.purple} 0%, #6D28D9 100%)` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <AlarmClock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black">New Reminder</h2>
                      <p className="text-purple-200 text-sm mt-0.5">
                        Set a meeting or task reminder with Google Calendar sync
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-8 space-y-5">
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Title *</label>
                    <input
                      type="text"
                      value={reminderTitle}
                      onChange={e => setReminderTitle(e.target.value)}
                      placeholder="e.g., Team standup, Client call…"
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Date & Time *</label>
                    <input
                      type="datetime-local"
                      value={reminderDatetime}
                      onChange={e => setReminderDatetime(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Description (Optional)</label>
                    <textarea
                      value={reminderDesc}
                      onChange={e => setReminderDesc(e.target.value)}
                      placeholder="Add notes, agenda, meeting link…"
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 resize-none transition-colors"
                    />
                  </div>
                  {reminderTitle && reminderDatetime && (
                    <motion.div
                      className="p-4 rounded-xl flex items-start gap-3"
                      style={{
                        backgroundColor: `${COLORS.deepBlue}08`,
                        border: `1.5px solid ${COLORS.deepBlue}20`,
                      }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <CalendarPlus className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.deepBlue }} />
                      <div>
                        <p className="text-xs font-bold text-slate-700">Google Calendar Integration</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          After saving, click "Google Cal" on the reminder card to open the event pre-filled.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
                <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowReminderForm(false);
                      setReminderTitle('');
                      setReminderDesc('');
                      setReminderDatetime('');
                    }}
                    className="font-bold rounded-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!reminderTitle.trim() || !reminderDatetime}
                    onClick={handleCreateReminder}
                    className="font-bold text-white rounded-lg px-6"
                    style={{ backgroundColor: COLORS.purple }}
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Set Reminder
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
