import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  startOfDay
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
  ChevronRight,
  Zap,
  Users,
  BarChart3
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
  red: '#EF4444',
  slate50: '#F8FAFC',
  slate200: '#E2E8F0',
};

const IST_TIMEZONE = 'Asia/Kolkata';

// ═════════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═════════════════════════════════════════════════════════════════════════════
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" }
  }
};

const pulseVariants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// LIVE DIGITAL CLOCK COMPONENT
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
    second: '2-digit'
  });

  return (
    <motion.div
      className="flex flex-col items-center justify-center px-8 py-5 rounded-2xl text-white font-mono"
      style={{
        background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
        boxShadow: '0 20px 40px rgba(13, 59, 102, 0.3)'
      }}
      animate={{
        boxShadow: [
          `0 20px 40px rgba(13, 59, 102, 0.3)`,
          `0 20px 60px rgba(13, 59, 102, 0.5)`,
          `0 20px 40px rgba(13, 59, 102, 0.3)`
        ]
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
// STAT CARD COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, unit, color = COLORS.deepBlue, trend = null }) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                {label}
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black tracking-tight" style={{ color }}>
                  {value}
                </p>
                {unit && <p className="text-sm font-medium text-slate-400">{unit}</p>}
              </div>
              {trend && (
                <p className="text-xs text-slate-500 mt-2 font-medium">
                  {trend}
                </p>
              )}
            </div>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon className="w-6 h-6" style={{ color }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CUSTOM CALENDAR DAY COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
function CustomDay({ date, displayMonth, attendance = {}, holidays = [] }) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayRecord = attendance[dateStr];
  const holiday = holidays.find(h => h.date === dateStr);

  let dotColor = null;
  let isSpecial = false;

  if (holiday) {
    dotColor = COLORS.amber;
    isSpecial = true;
  } else if (dayRecord?.is_late) {
    dotColor = COLORS.red;
    isSpecial = true;
  } else if (dayRecord?.punch_in) {
    dotColor = COLORS.emeraldGreen;
  }

  const isTodayDate = dateFnsIsToday(date);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`
            relative w-full aspect-square flex flex-col items-center justify-center
            rounded-lg font-medium transition-all duration-200
            ${isTodayDate ? 'ring-2 ring-offset-1 font-bold' : ''}
            hover:bg-slate-100 active:scale-95
          `}
          style={{
            ringColor: COLORS.deepBlue,
          }}
        >
          <span className="text-sm">{date.getDate()}</span>
          {dotColor && (
            <motion.span
              className="absolute bottom-1.5 w-2 h-2 rounded-full"
              style={{ backgroundColor: dotColor }}
              animate={{ scale: isSpecial ? [1, 1.3, 1] : 1 }}
              transition={{ duration: 2, repeat: isSpecial ? Infinity : 0 }}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-bold mb-1">{format(date, 'MMM d, yyyy')}</p>
        {holiday ? (
          <p className="text-amber-600 font-medium">🎉 {holiday.name}</p>
        ) : dayRecord?.punch_in ? (
          <>
            <p>In: {formatInTimeZone(parseISO(dayRecord.punch_in), IST_TIMEZONE, 'hh:mm a')}</p>
            {dayRecord.punch_out && (
              <p>Out: {formatInTimeZone(parseISO(dayRecord.punch_out), IST_TIMEZONE, 'hh:mm a')}</p>
            )}
            <p className="font-semibold text-green-600">{formatDuration(dayRecord.duration_minutes)}</p>
          </>
        ) : (
          <p className="text-red-600">No record</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════
const formatDuration = (minutes) => {
  if (!minutes) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

const calculateTodayLiveDuration = (todayAttendance) => {
  if (!todayAttendance?.punch_in) return "0h 0m";
  if (todayAttendance.punch_out) return formatDuration(todayAttendance.duration_minutes);

  const start = parseISO(todayAttendance.punch_in);
  const diffMs = Date.now() - start.getTime();
  if (diffMs < 0) return "0h 0m";

  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return `${h}h ${m}m`;
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ATTENDANCE COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function Attendance() {
  const { user, hasPermission } = useAuth();

  // ─── PERMISSION CHECKS ───────────────────────────────────────────────────
  const isAdmin = user?.role === 'admin';
  const canViewAllAttendance = isAdmin || hasPermission("can_view_attendance");
  const canViewRankings = hasPermission("can_view_staff_rankings");

  // ─── STATE MANAGEMENT ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState(null);

  // Data states
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [mySummary, setMySummary] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [pendingHolidays, setPendingHolidays] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [myRank, setMyRank] = useState('—');

  // Modal states
  const [showPunchInModal, setShowPunchInModal] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);

  // Leave form state
  const [leaveFrom, setLeaveFrom] = useState(null);
  const [leaveTo, setLeaveTo] = useState(null);
  const [leaveReason, setLeaveReason] = useState("");

  // Holiday form state
  const [holidayRows, setHolidayRows] = useState([
    { name: '', date: format(new Date(), 'yyyy-MM-dd') }
  ]);

  // UI state
  const [liveDuration, setLiveDuration] = useState('0h 0m');

  // ─── EFFECTS ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (todayAttendance && !todayAttendance.punch_in) {
      const timer = setTimeout(() => setShowPunchInModal(true), 800);
      return () => clearTimeout(timer);
    }
  }, [todayAttendance]);

  useEffect(() => {
    setLiveDuration(calculateTodayLiveDuration(todayAttendance));
    if (todayAttendance?.punch_in && !todayAttendance?.punch_out) {
      const interval = setInterval(() => {
        setLiveDuration(calculateTodayLiveDuration(todayAttendance));
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [todayAttendance]);

  // ─── DATA FETCHING ──────────────────────────────────────────────────────
  const fetchData = useCallback(async (overrideUserId = null) => {
    setLoading(true);
    const targetUserId = overrideUserId !== undefined ? overrideUserId : selectedUserId;

    try {
      const historyUrl = targetUserId
        ? `/attendance/history?user_id=${targetUserId}`
        : '/attendance/history';

      const requests = [
        api.get(historyUrl),
        api.get('/attendance/my-summary'),
        api.get('/attendance/today'),
        api.get('/tasks'),
        api.get('/holidays'),
        canViewRankings ? api.get('/reports/performance-rankings?period=monthly') : Promise.resolve({ data: { rankings: [] } })
      ];

      const [historyRes, summaryRes, todayRes, tasksRes, holidaysRes, rankingRes] = await Promise.all(requests);

      // Process holidays
      const allHolidays = holidaysRes.data || [];
      setHolidays(allHolidays.filter(h => h.status === 'confirmed'));

      if (isAdmin) {
        setPendingHolidays(allHolidays.filter(h => h.status === 'pending'));
        try {
          const usersRes = await api.get('/users');
          setAllUsers(usersRes.data || []);
        } catch (e) {
          console.error('Failed to fetch users:', e);
        }
      }

      // Set attendance data
      setAttendanceHistory(historyRes.data || []);
      setMySummary(summaryRes.data);
      setTodayAttendance(todayRes.data);

      // Set rankings
      const rankingList = rankingRes.data?.rankings || [];
      const myEntry = rankingList.find(r => r.user_id === user?.id);
      if (myEntry) setMyRank(`#${myEntry.rank}`);

      // Count tasks
      const completedCount = (tasksRes.data || []).filter(t => t.status === 'completed').length;
      setTasksCompleted(completedCount);
    } catch (error) {
      toast.error('Failed to fetch attendance data');
      console.error('Attendance fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, isAdmin, canViewRankings, user?.id]);

  // ─── HANDLERS ────────────────────────────────────────────────────────────
  const handlePunchAction = useCallback(async (action) => {
    setLoading(true);
    try {
      let locationData = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
          });
          locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
        } catch (locErr) {
          console.warn("Location unavailable");
        }
      }

      const response = await api.post('/attendance', { action, location: locationData });

      if (action === 'punch_in') {
        toast.success('✓ Punched in successfully!', { duration: 3000 });
      } else if (action === 'punch_out') {
        const duration = response.data?.duration || 0;
        toast.success(`✓ Punched out successfully! (${formatDuration(duration)})`, { duration: 3000 });
      }

      await fetchData();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to record attendance';
      toast.error(errorMsg, { duration: 4000 });
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const handleApplyLeave = useCallback(async () => {
    if (!leaveFrom) {
      toast.error('Select a leave start date');
      return;
    }

    try {
      await api.post("/attendance/apply-leave", {
        from_date: format(leaveFrom, 'yyyy-MM-dd'),
        to_date: leaveTo ? format(leaveTo, 'yyyy-MM-dd') : format(leaveFrom, 'yyyy-MM-dd'),
        reason: leaveReason || "Personal Leave"
      });

      toast.success('✓ Leave request submitted successfully');
      setShowLeaveForm(false);
      setLeaveFrom(null);
      setLeaveTo(null);
      setLeaveReason("");
      await fetchData();
    } catch (error) {
      toast.error('Failed to submit leave request');
    }
  }, [leaveFrom, leaveTo, leaveReason, fetchData]);

  const handleAddHolidays = useCallback(async () => {
    const validRows = holidayRows.filter(r => r.name.trim() && r.date);
    if (validRows.length === 0) {
      toast.error('Add at least one holiday');
      return;
    }

    let added = 0, failed = 0;
    for (const row of validRows) {
      try {
        await api.post('/holidays', { date: row.date, name: row.name.trim() });
        added++;
      } catch (err) {
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
      toast.success(decision === 'confirmed' ? "Holiday confirmed" : "Holiday rejected");
      await fetchData();
    } catch (err) {
      toast.error("Failed to update holiday");
    }
  }, [fetchData]);

  const handleExportPDF = useCallback(() => {
    const employeeName = selectedUserId
      ? (allUsers.find(u => u.id === selectedUserId)?.full_name || 'Employee')
      : (user?.full_name || 'Staff Member');

    const doc = new jsPDF();

    // Header
    doc.setFillColor(13, 59, 102);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('TASKOSPHERE — ATTENDANCE REPORT', 10, 10);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')} IST`, 10, 19);

    // Employee info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Employee: ${employeeName}`, 10, 34);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`Report Period: ${format(selectedDate, 'MMMM yyyy')}`, 10, 42);

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 47, 200, 47);

    // Summary
    doc.setFontSize(11);
    const monthlyHours = mySummary?.monthly_summary
      ?.find(s => s.month === format(selectedDate, 'yyyy-MM'))?.total_hours || '0h 0m';
    doc.text(`Total Monthly Hours : ${monthlyHours}`, 10, 56);
    doc.text(`Days Present        : ${attendanceHistory.filter(a => a.punch_in).length}`, 10, 64);
    doc.text(`Late Arrivals       : ${attendanceHistory.filter(a => a.is_late).length}`, 10, 72);

    doc.line(10, 80, 200, 80);

    // Detailed log header
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Attendance Log (Last 15 Records):', 10, 89);
    doc.setFont(undefined, 'normal');

    // Table headers
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('DATE', 10, 98);
    doc.text('PUNCH IN', 65, 98);
    doc.text('PUNCH OUT', 105, 98);
    doc.text('DURATION', 155, 98);
    doc.setDrawColor(180, 180, 180);
    doc.line(10, 100, 200, 100);

    // Table rows
    doc.setTextColor(0, 0, 0);
    let y = 108;
    attendanceHistory.slice(0, 15).forEach((record, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const dateStr = format(parseISO(record.date), 'dd MMM yyyy');
      const inTime = record.punch_in
        ? formatInTimeZone(parseISO(record.punch_in), IST_TIMEZONE, 'hh:mm a')
        : '—';
      const outTime = record.punch_out
        ? formatInTimeZone(parseISO(record.punch_out), IST_TIMEZONE, 'hh:mm a')
        : 'Ongoing';
      const dur = formatDuration(record.duration_minutes);

      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(10, y - 5, 190, 9, 'F');
      }
      doc.setFontSize(9);
      doc.text(dateStr, 10, y);
      doc.text(inTime, 65, y);
      doc.text(outTime, 105, y);
      doc.text(dur, 155, y);
      y += 10;
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Taskosphere HR Management System  |  Confidential', 10, 288);

    doc.save(`Attendance_${employeeName.replace(/\s+/g, '_')}_${format(selectedDate, 'MMM_yyyy')}.pdf`);
  }, [selectedUserId, allUsers, user, selectedDate, attendanceHistory, mySummary]);

  // ─── COMPUTED VALUES ────────────────────────────────────────────────────
  const monthAttendance = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    let atts = attendanceHistory.filter(a => {
      const d = parseISO(a.date);
      return d >= start && d <= end;
    });

    if (todayAttendance) {
      const todayStr = todayAttendance.date;
      if (!atts.some(a => a.date === todayStr)) {
        const todayD = parseISO(todayStr);
        if (todayD >= start && todayD <= end) {
          atts = [...atts, todayAttendance];
        }
      }
    }

    return atts;
  }, [attendanceHistory, todayAttendance, selectedDate]);

  const monthTotalMinutes = useMemo(
    () => monthAttendance.reduce((sum, a) => sum + (a.duration_minutes || 0), 0),
    [monthAttendance]
  );

  const monthDaysPresent = useMemo(
    () => monthAttendance.filter(a => a.punch_in).length,
    [monthAttendance]
  );

  const totalDaysLateThisMonth = useMemo(
    () => monthAttendance.filter(a => a.punch_in && a.is_late).length,
    [monthAttendance]
  );

  const isTodaySelected = dateFnsIsToday(selectedDate);
  const selectedAttendance = isTodaySelected
    ? todayAttendance
    : attendanceHistory.find(a => a.date === format(selectedDate, 'yyyy-MM-dd')) || null;

  const selectedHoliday = holidays.find(h => h.date === format(selectedDate, 'yyyy-MM-dd'));

  const attendanceMap = useMemo(() => {
    const map = {};
    attendanceHistory.forEach(a => {
      map[a.date] = a;
    });
    if (todayAttendance) {
      map[todayAttendance.date] = todayAttendance;
    }
    return map;
  }, [attendanceHistory, todayAttendance]);

  // ═════════════════════════════════════════════════════════════════════════
  // JSX RENDERING
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      <motion.div
        className="min-h-screen overflow-y-auto p-5 md:p-7 lg:p-9"
        style={{
          background: `linear-gradient(135deg, ${COLORS.slate50} 0%, #FFFFFF 100%)`,
          fontFamily: "'DM Sans', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif"
        }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ═════════════════════════════════════════════════════════════════ */
        /* HEADER SECTION                                                    */
        /* ═════════════════════════════════════════════════════════════════ */}
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
              {isAdmin ? 'Manage team attendance across all departments' : 'Track your daily hours and attendance'}
            </p>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            {(isAdmin || canViewAllAttendance) && allUsers.length > 0 && (
              <motion.select
                variants={itemVariants}
                className="border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:border-blue-400 transition-colors font-medium"
                value={selectedUserId || ''}
                onChange={e => {
                  const val = e.target.value || null;
                  setSelectedUserId(val);
                  fetchData(val);
                }}
              >
                <option value="">All Staff</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
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

        {/* VIEWING AS BANNER */}
        {selectedUserId && (
          <motion.div
            variants={itemVariants}
            className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 border-blue-200"
            style={{ backgroundColor: '#EFF6FF' }}
          >
            <Users className="w-4 h-4 text-blue-700" />
            <span className="text-sm font-semibold text-blue-900">
              Viewing: {allUsers.find(u => u.id === selectedUserId)?.full_name || selectedUserId}
            </span>
            <button
              className="ml-auto text-blue-600 hover:text-blue-800 text-xs font-bold underline"
              onClick={() => {
                setSelectedUserId(null);
                fetchData(null);
              }}
            >
              Clear
            </button>
          </motion.div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */
        /* TODAY'S STATUS HERO CARD                                          */
        /* ═════════════════════════════════════════════════════════════════ */}
        <motion.div variants={itemVariants} className="mb-8">
          <Card
            className="border-0 shadow-xl overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`
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
                        {isTodaySelected ? "Today's Status" : format(selectedDate, 'EEEE, MMM d')}
                      </h3>
                      <p className="text-blue-100 text-sm mt-0.5">Real-time attendance tracking</p>
                    </div>
                  </div>

                  {selectedAttendance?.punch_in && (
                    <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-2">
                      <p className="text-blue-100 text-sm">
                        <span className="font-semibold">In:</span>{' '}
                        {formatInTimeZone(parseISO(selectedAttendance.punch_in), IST_TIMEZONE, 'hh:mm a')}
                        {selectedAttendance.punch_out && (
                          <>
                            {' • '}
                            <span className="font-semibold">Out:</span>{' '}
                            {formatInTimeZone(parseISO(selectedAttendance.punch_out), IST_TIMEZONE, 'hh:mm a')}
                          </>
                        )}
                      </p>
                      <p className="text-blue-100 text-xs">
                        Expected: {user?.punch_in_time || '10:30'} ({user?.grace_time || '15'} min grace) • {user?.punch_out_time || '19:00'}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 flex-wrap pt-2">
                    {!selectedAttendance?.punch_in ? (
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
                    ) : !selectedAttendance?.punch_out && isTodaySelected ? (
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
                    ) : selectedAttendance?.punch_out ? (
                      <Badge className="px-4 py-2 bg-white/20 text-white border-0 font-mono">
                        {formatDuration(selectedAttendance.duration_minutes)}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div>
                  <DigitalClock />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═════════════════════════════════════════════════════════════════ */
        /* ADMIN PENDING HOLIDAY REVIEW                                      */
        /* ═════════════════════════════════════════════════════════════════ */}
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

        {/* ═════════════════════════════════════════════════════════════════ */
        /* STATS GRID                                                        */
        /* ═════════════════════════════════════════════════════════════════ */}
        <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Timer}
            label="This Month"
            value={formatDuration(monthTotalMinutes).split('h')[0]}
            unit="hours"
            color={COLORS.deepBlue}
            trend={`${monthDaysPresent} days present`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Tasks Done"
            value={tasksCompleted}
            unit="this month"
            color={COLORS.emeraldGreen}
          />
          <StatCard
            icon={CalendarX}
            label="Days Late"
            value={totalDaysLateThisMonth}
            unit="this month"
            color={COLORS.red}
          />
          {canViewRankings && (
            <StatCard
              icon={TrendingUp}
              label="Your Rank"
              value={myRank}
              unit="overall"
              color={COLORS.deepBlue}
            />
          )}
        </motion.div>

        {/* ═════════════════════════════════════════════════════════════════ */
        /* LIVE DURATION + PERFORMANCE                                       */
        /* ═════════════════════════════════════════════════════════════════ */}
        <motion.div variants={itemVariants} className="mb-8">
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Daily Progress
                  </p>
                  <p
                    className="text-5xl font-black tracking-tight mb-1"
                    style={{ color: COLORS.emeraldGreen, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {liveDuration}
                  </p>
                  <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">
                    {todayAttendance?.punch_in && !todayAttendance?.punch_out
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
                    <p className="text-2xl font-bold text-emerald-600">
                      {((parseInt(liveDuration) / 8.5) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═════════════════════════════════════════════════════════════════ */
        /* CALENDAR + HISTORY SECTION                                        */
        /* ═════════════════════════════════════════════════════════════════ */}
        <motion.div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Calendar Sidebar */}
          <motion.div variants={itemVariants} className="xl:col-span-1 space-y-6">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
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
                <CardDescription className="text-xs">Click date for details</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={date => isAfter(date, new Date())}
                  className="rounded-xl border-0 shadow-sm"
                  classNames={{
                    months: "w-full",
                    month: "w-full space-y-3",
                    table: "w-full border-collapse",
                    head_row: "flex w-full justify-between mb-2",
                    head_cell: "text-slate-400 rounded-lg w-9 font-bold text-[0.75rem] text-center",
                    row: "flex w-full mt-2 justify-between",
                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                    day: "h-10 w-10 p-0 font-semibold rounded-lg transition-all hover:bg-slate-100",
                    day_today: "font-black",
                  }}
                  components={{
                    Day: (props) => (
                      <CustomDay
                        {...props}
                        attendance={attendanceMap}
                        holidays={holidays}
                      />
                    )
                  }}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6 text-xs justify-center border-t pt-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.emeraldGreen }} />
                    <span className="text-slate-600">Present</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-slate-600">Late</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.amber }} />
                    <span className="text-slate-600">Holiday</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selected Day Details */}
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-0">
                {selectedAttendance?.punch_in ? (
                  <div className="p-6 bg-gradient-to-br from-emerald-50 to-slate-50 border-l-4" style={{ borderColor: COLORS.emeraldGreen }}>
                    <p className="font-bold text-slate-800 text-lg mb-4">
                      {format(selectedDate, 'EEEE, MMM d, yyyy')}
                    </p>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Punch In</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatInTimeZone(parseISO(selectedAttendance.punch_in), IST_TIMEZONE, 'hh:mm a')}
                        </span>
                      </div>
                      {selectedAttendance.punch_out && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Punch Out</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatInTimeZone(parseISO(selectedAttendance.punch_out), IST_TIMEZONE, 'hh:mm a')}
                          </span>
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
                ) : selectedHoliday ? (
                  <div className="p-6 bg-gradient-to-br from-amber-50 to-slate-50 border-l-4 border-amber-400">
                    <p className="text-sm font-bold text-amber-900">
                      🎉 Holiday: {selectedHoliday.name}
                    </p>
                  </div>
                ) : (
                  <div className="p-6 bg-gradient-to-br from-red-50 to-slate-50 border-l-4 border-red-400">
                    <p className="text-sm font-bold text-red-900">
                      No record for {format(selectedDate, 'MMM d')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent History Table */}
          <motion.div variants={itemVariants} className="xl:col-span-2">
            <Card className="border-0 shadow-md h-fit">
              <CardHeader className="border-b border-slate-100">
                <CardTitle style={{ color: COLORS.deepBlue }}>Recent Attendance</CardTitle>
                <CardDescription>Last 15 records</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {attendanceHistory.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 font-medium">No records yet</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {attendanceHistory.slice(0, 15).map((record, idx) => (
                      <motion.div
                        key={`${record.date}-${idx}`}
                        variants={itemVariants}
                        className="flex justify-between items-center p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
                      >
                        <div className="flex-1">
                          <p className="font-bold text-slate-800 text-sm">
                            {format(parseISO(record.date), 'EEE, MMM d, yyyy')}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 font-mono">
                            {record.punch_in
                              ? formatInTimeZone(parseISO(record.punch_in), IST_TIMEZONE, 'hh:mm a')
                              : '—'}
                            {' → '}
                            {record.punch_out
                              ? formatInTimeZone(parseISO(record.punch_out), IST_TIMEZONE, 'hh:mm a')
                              : 'Ongoing'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className="font-mono text-xs font-bold px-2 py-1" style={{
                            backgroundColor: record.duration_minutes > 0 ? `${COLORS.emeraldGreen}20` : `${COLORS.slate200}`,
                            color: record.duration_minutes > 0 ? COLORS.emeraldGreen : COLORS.deepBlue,
                            border: `1px solid ${record.duration_minutes > 0 ? COLORS.emeraldGreen : COLORS.slate200}`
                          }}>
                            {formatDuration(record.duration_minutes)}
                          </Badge>
                          {record.is_late && (
                            <span className="text-[10px] font-bold text-red-600 uppercase px-2 py-1 bg-red-100 rounded">
                              Late
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* ═════════════════════════════════════════════════════════════════ */
        /* MODALS                                                            */
        /* ═════════════════════════════════════════════════════════════════ */}

        {/* Auto Punch-in Modal */}
        <AnimatePresence>
          {showPunchInModal && (
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

        {/* Leave Request Modal */}
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

                {/* Quick Presets */}
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
                        {days === 1 ? "1 Day" : `${days} Days`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Calendars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-3 block">
                      From Date
                    </label>
                    <Calendar
                      mode="single"
                      selected={leaveFrom}
                      onSelect={setLeaveFrom}
                      disabled={date => isBefore(date, startOfDay(new Date()))}
                      className="rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-700 mb-3 block">
                      To Date
                    </label>
                    <Calendar
                      mode="single"
                      selected={leaveTo}
                      onSelect={setLeaveTo}
                      disabled={date => leaveFrom ? isBefore(date, leaveFrom) : true}
                      className="rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                {/* Duration Summary */}
                {leaveFrom && (
                  <motion.div
                    className="p-5 rounded-2xl mb-8"
                    style={{ backgroundColor: `${COLORS.deepBlue}10`, borderLeft: `4px solid ${COLORS.deepBlue}` }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <p className="text-xs text-slate-600 font-medium mb-1">Total Duration</p>
                    <p className="text-2xl font-black" style={{ color: COLORS.deepBlue }}>
                      {Math.max(1, leaveTo ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1 : 1)} days
                    </p>
                    <p className="text-xs text-slate-500 mt-2 font-medium">
                      {format(leaveFrom, 'dd MMM')} — {leaveTo ? format(leaveTo, 'dd MMM yyyy') : format(leaveFrom, 'dd MMM yyyy')}
                    </p>
                  </motion.div>
                )}

                {/* Reason */}
                <div className="mb-8">
                  <label className="text-sm font-bold text-slate-700 mb-2 block">
                    Reason (Optional)
                  </label>
                  <textarea
                    value={leaveReason}
                    onChange={e => setLeaveReason(e.target.value)}
                    placeholder="Tell us why you need leave..."
                    className="w-full min-h-[100px] p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>

                {/* Actions */}
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

        {/* Add Holidays Modal */}
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
                {/* Header */}
                <div
                  className="px-8 py-6 text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
                >
                  <h2 className="text-2xl font-black">Add Holidays</h2>
                  <p className="text-blue-200 text-sm mt-1">Batch add holidays to the calendar</p>
                </div>

                {/* Content */}
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
                    onClick={() => setHolidayRows([...holidayRows, { name: '', date: format(new Date(), 'yyyy-MM-dd') }])}
                    className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 mb-6"
                  >
                    <span className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold">
                      +
                    </span>
                    Add Another
                  </button>
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                  <p className="text-xs text-slate-500 font-medium">
                    {holidayRows.filter(r => r.name.trim() && r.date).length} of {holidayRows.length} ready
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
      </motion.div>
    </TooltipProvider>
  );
}
