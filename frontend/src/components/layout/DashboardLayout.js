// Professional font: Inter (loaded via index.html or global CSS — fallback stack here)
import React, { useState, useEffect } from 'react';
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
  Timer
} from 'lucide-react';
// ────────────────────────────────────────────────
// Brand Colors
// ────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};
// ────────────────────────────────────────────────
// Framer Motion Variants
// ────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};
// ────────────────────────────────────────────────
// Live Digital Clock
// ────────────────────────────────────────────────
function DigitalClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <motion.div
      className="flex flex-col items-center px-6 py-4 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 text-white"
      style={{ fontFamily: "'Inter', 'DM Sans', 'Segoe UI', system-ui, sans-serif" }}
      animate={{
        boxShadow: [
          "0 0 6px rgba(59,130,246,0.4)",
          "0 0 18px rgba(59,130,246,0.9)",
          "0 0 6px rgba(59,130,246,0.4)"
        ]
      }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <motion.span
        className="text-3xl font-mono font-bold tracking-wider"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      >
        {time.toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </motion.span>
      <span className="text-[11px] uppercase tracking-widest text-blue-200 mt-1">
        Indian Standard Time
      </span>
    </motion.div>
  );
}
// ────────────────────────────────────────────────
// Main Attendance Component
// ────────────────────────────────────────────────
export default function Attendance() {
  const { user, hasPermission } = useAuth();
  const canViewRankings = hasPermission("can_view_staff_rankings");
  // Permission: can this user see other staff attendance?
  const isAdmin = user && user.role === 'admin';
  const canViewAllAttendance = isAdmin || hasPermission("can_view_attendance");
  // List of specific user IDs this non-admin is permitted to view (from permission settings)
  const permittedUserIds = (!isAdmin && user && user.permissions && Array.isArray(user.permissions.view_other_attendance))
    ? user.permissions.view_other_attendance
    : [];
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [mySummary, setMySummary] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [isLateToday, setIsLateToday] = useState(false);
  const [lateByMinutesToday, setLateByMinutesToday] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showPunchInModal, setShowPunchInModal] = useState(false);
  // Additional states
  const [myRank, setMyRank] = useState('—');
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [isEarlyLeaveToday, setIsEarlyLeaveToday] = useState(false);
  const [earlyByMinutesToday, setEarlyByMinutesToday] = useState(0);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveFrom, setLeaveFrom] = useState(null);
  const [leaveTo, setLeaveTo] = useState(null);
  const [leaveReason, setLeaveReason] = useState("");
  const [holidays, setHolidays] = useState([]);
  const [liveDuration, setLiveDuration] = useState('0h 0m');
  const [pendingHolidays, setPendingHolidays] = useState([]);
  // Admin: user list + selected user for filtering
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayRows, setHolidayRows] = useState([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
  // ─── Effects ─────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, []);
  useEffect(() => {
    if (todayAttendance && !todayAttendance.punch_in) {
      setShowPunchInModal(true);
    }
  }, [todayAttendance]);
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (todayAttendance && todayAttendance.date !== todayStr) {
      setIsLateToday(false);
      setLateByMinutesToday(0);
      setIsEarlyLeaveToday(false);
      setEarlyByMinutesToday(0);
    }
  }, [todayAttendance]);
  useEffect(() => {
    setLiveDuration(getTodayLiveDuration());
    if (todayAttendance && todayAttendance.punch_in && !todayAttendance.punch_out) {
      const interval = setInterval(() => {
        setLiveDuration(getTodayLiveDuration());
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [todayAttendance]);
  // ─── Data Fetching ───────────────────────────────────────────
  const fetchData = async (overrideUserId) => {
    setLoading(true);
    const targetUserId = overrideUserId !== undefined ? overrideUserId : selectedUserId;
    try {
      const historyUrl = targetUserId ? `/attendance/history?user_id=${targetUserId}` : '/attendance/history';
      const requests = [
        api.get(historyUrl),
        api.get('/attendance/my-summary'),
        api.get('/attendance/today'),
        api.get('/tasks'),
        api.get('/holidays'),
        canViewRankings
          ? api.get('/reports/performance-rankings?period=monthly')
          : Promise.resolve({ data: { rankings: [] } })
      ];
      const [
        historyRes, summaryRes, todayRes, tasksRes, holidaysRes, rankingRes
      ] = await Promise.all(requests);
      const allHolidays = holidaysRes.data || [];
      setHolidays(allHolidays.filter(h => h.status === 'confirmed'));
      if (isAdmin) {
        setPendingHolidays(allHolidays.filter(h => h.status === 'pending'));
        // Admin: fetch full user list for the filter dropdown
        try {
          const usersRes = await api.get('/users');
          setAllUsers(usersRes.data || []);
        } catch (e) { /* ignore */ }
      } else if (permittedUserIds.length > 0) {
        // Permitted staff: build a minimal user list from only their allowed user IDs
        // Backend /attendance/history already enforces the permission check server-side
        // We fetch each permitted user's profile to show their name in the dropdown
        try {
          const usersRes = await api.get('/users');
          const filtered = (usersRes.data || []).filter(u => permittedUserIds.includes(u.id));
          setAllUsers(filtered);
        } catch (e) {
          // If /users is admin-only and fails, leave allUsers empty — dropdown won't show
          setAllUsers([]);
        }
      }
      setAttendanceHistory(historyRes.data || []);
      setMySummary(summaryRes.data);
      setTodayAttendance(todayRes.data);
      const rankingList = rankingRes.data.rankings || [];
      const myEntry = rankingList.find(r => r.user_id === (user && user.id));
      if (myEntry) setMyRank(`#${myEntry.rank}`);
      const completedCount = tasksRes.data.filter(t => t.status === 'completed').length;
      setTasksCompleted(completedCount);
    } catch (error) {
      toast.error('Failed to fetch attendance data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  // ─── Punch In / Out Handler ─────────────────────────────────
  const handlePunchAction = async (action) => {
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
          console.warn("Location not available");
        }
      }
      await api.post('/attendance', { action, location: locationData });
      let isLate = false;
      let lateByMinutes = 0;
      let isEarlyLeave = false;
      let earlyByMinutes = 0;
      if (action === 'punch_in' && user && user.punch_in_time) {
        const [expH, expM] = user.punch_in_time.split(':').map(Number);
        const expected = new Date();
        expected.setHours(expH, expM, 0, 0);
        const actual = new Date();
        if (actual > expected) {
          const diffMs = actual.getTime() - expected.getTime();
          lateByMinutes = Math.floor(diffMs / 60000);
          const [graceH, graceM] = user.grace_time ? user.grace_time.split(':').map(Number) : [0, 15];
          const grace = graceH * 60 + graceM;
          if (lateByMinutes > grace) {
            isLate = true;
            setIsLateToday(true);
            setLateByMinutesToday(lateByMinutes);
            toast.warning(`Late by ${lateByMinutes} minutes (grace: ${grace} min)`, { duration: 6000 });
          }
        }
      } else if (action === 'punch_out' && user && user.punch_out_time && todayAttendance && todayAttendance.punch_in) {
        const [expH, expM] = user.punch_out_time.split(':').map(Number);
        const expectedOut = new Date();
        expectedOut.setHours(expH, expM, 0, 0);
        const actualOut = new Date();
        if (actualOut < expectedOut) {
          const diffMs = expectedOut.getTime() - actualOut.getTime();
          earlyByMinutes = Math.floor(diffMs / 60000);
          isEarlyLeave = true;
          setIsEarlyLeaveToday(true);
          setEarlyByMinutesToday(earlyByMinutes);
          toast.warning(`Early leave by ${earlyByMinutes} min`, { duration: 6000 });
        }
      }
      toast.success(
        action === 'punch_in'
          ? (isLate ? 'Punched in (late)' : 'Punched in successfully!')
          : (isEarlyLeave ? 'Punched out (early)' : 'Punched out successfully!')
      );
      fetchData();
    } catch (error) {
      toast.error((error.response && error.response.data && error.response.data.detail) || 'Failed to record attendance');
    } finally {
      setLoading(false);
    }
  };
  // ─── Holiday & Leave Handlers ───────────────────────────────
  const handleAddHoliday = async () => {
    const validRows = holidayRows.filter(r => r.name.trim() && r.date);
    if (validRows.length === 0) { toast.error('Add at least one holiday with a name and date'); return; }
    let added = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        await api.post('/holidays', { date: row.date, name: row.name.trim() });
        added++;
      } catch (err) {
        failed++;
      }
    }
    if (added > 0) toast.success(`${added} holiday${added > 1 ? 's' : ''} added successfully`);
    if (failed > 0) toast.error(`${failed} holiday${failed > 1 ? 's' : ''} failed (may already exist)`);
    setShowHolidayModal(false);
    setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]);
    fetchData();
  };
  const handleHolidayDecision = async (holidayDate, decision) => {
    try {
      await api.patch(`/holidays/${holidayDate}/status`, { status: decision });
      toast.success(decision === 'confirmed' ? "Holiday confirmed" : "Holiday rejected");
      fetchData();
    } catch (err) {
      toast.error("Failed to update holiday status");
    }
  };
  // ─── Utility Functions ───────────────────────────────────────
  const formatDuration = (minutes) => {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };
  const getTodayLiveDuration = () => {
    if (!(todayAttendance && todayAttendance.punch_in)) return "0h 0m";
    if (todayAttendance.punch_out) return formatDuration(todayAttendance.duration_minutes);
    const start = new Date(todayAttendance.punch_in);
    let diffMs = Date.now() - start.getTime();
    if (diffMs < 0) diffMs = 0;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}m`;
  };
  const getDateStatus = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isTodayDate = dateFnsIsToday(date);
    const att = isTodayDate ? todayAttendance : attendanceHistory.find(a => a.date === dateStr);
    const hol = holidays.find(h => h.date === dateStr);
    if (hol) return `Holiday: ${hol.name}`;
    if (att) {
      let str = att.is_late ? 'Late' : 'Present';
      str += ` - ${formatDuration(att.duration_minutes || 0)}`;
      if (!att.punch_out && isTodayDate) str += ' (Ongoing)';
      return str;
    }
    if (isBefore(startOfDay(date), startOfDay(new Date()))) return 'Absent';
    if (isAfter(date, new Date())) return 'Future';
    return 'Today - No record';
  };
  const getMonthAttendance = () => {
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
  };
  // ─── Computed Values ─────────────────────────────────────────
  const monthAttendance = getMonthAttendance();
  const monthTotalMinutes = monthAttendance.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
  // Only count days with an actual punch_in — leave days / no-punch days are absent
  const monthDaysPresent = monthAttendance.filter(a => a.punch_in).length;
  const totalDaysLateThisMonth = monthAttendance.filter(a => a.punch_in && a.is_late).length;
  const attendanceDates = [
    ...attendanceHistory.map(a => parseISO(a.date)),
    ...((todayAttendance && todayAttendance.punch_in) ? [parseISO(todayAttendance.date)] : [])
  ];
  const lateDates = [
    ...attendanceHistory.filter(a => a.is_late).map(a => parseISO(a.date)),
    ...((isLateToday || (todayAttendance && todayAttendance.is_late)) && todayAttendance && todayAttendance.date ? [parseISO(todayAttendance.date)] : [])
  ];
  const holidayDates = holidays.map(h => parseISO(h.date));
  const modifiers = {
    present: attendanceDates,
    late: lateDates,
    holidays: holidayDates,
    today: [new Date()]
  };
  const modifiersStyles = {
    present: { backgroundColor: `${COLORS.emeraldGreen}20`, borderRadius: '50%' },
    late: { backgroundColor: '#fee2e2', color: '#ef4444', fontWeight: 'bold', borderRadius: '50%' },
    holidays: { backgroundColor: '#FFD70020', color: '#DAA520', fontWeight: 'bold', borderRadius: '50%' },
    today: { fontWeight: 'bold', color: COLORS.deepBlue }
  };
  const isTodaySelected = dateFnsIsToday(selectedDate);
  const isSelectedFuture = isAfter(selectedDate, new Date());
  const isSelectedPast = isBefore(startOfDay(selectedDate), startOfDay(new Date()));
  // Selected day data (computed, no extra state or lag)
  const selectedAttendance = isTodaySelected
    ? todayAttendance
    : attendanceHistory.find(a => a.date === format(selectedDate, 'yyyy-MM-dd')) || null;
  const selectedHoliday = holidays.find(h => h.date === format(selectedDate, 'yyyy-MM-dd'));
  const CustomDay = ({ date, displayMonth, ...props }) => {
    const status = getDateStatus(date);
    const dayNumber = date.getDate();
    const dateStr = format(date, 'yyyy-MM-dd');
    const isPresent = attendanceDates.some(d => format(d, 'yyyy-MM-dd') === dateStr);
    const isLate = lateDates.some(d => format(d, 'yyyy-MM-dd') === dateStr);
    const isHoliday = holidayDates.some(d => format(d, 'yyyy-MM-dd') === dateStr);
    const isTodayDate = dateFnsIsToday(date);
    let dotColor = null;
    if (isHoliday) dotColor = '#DAA520';
    else if (isLate) dotColor = '#ef4444';
    else if (isPresent) dotColor = COLORS.emeraldGreen;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            {...props}
            className={`${props.className} relative w-full h-full flex flex-col items-center justify-center min-h-[40px] transition-all hover:bg-slate-100 rounded-lg ${isTodayDate ? 'ring-2 ring-blue-500 ring-offset-1 font-bold' : ''}`}
          >
            <span>{dayNumber}</span>
            {dotColor && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
             <p className="font-bold border-b border-slate-200 pb-1 mb-1">
               {format(date, 'MMMM d, yyyy')}
             </p>
             <p className="font-medium text-blue-600">{status}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };
  const handleApplyLeaveClick = () => {
    setLeaveFrom(selectedDate);
    setLeaveTo(selectedDate);
    setShowLeaveForm(true);
  };
  // Attendance Analytics Computations
  // ─── Dedup today from history to avoid double-count ───────────
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAlreadyInHistory = attendanceHistory.some(a => a.date === todayStr);

  // ─── Grace period in minutes ──────────────────────────────────
  const graceMinutes = (() => {
    if (!user || !user.grace_time) return 15;
    const [gh, gm] = user.grace_time.split(':').map(Number);
    return gh * 60 + gm;
  })();

  // ─── Helper: is a given date-string a Sunday or confirmed holiday ──
  const holidayDateSet = new Set(holidays.map(h => h.date));
  const isSundayOrHoliday = (dateStr) => {
    const d = parseISO(dateStr);
    return d.getDay() === 0 || holidayDateSet.has(dateStr);
  };

  // ─── Build full deduplicated record list for YTD ──────────────
  const allRecords = [
    ...attendanceHistory,
    ...(!todayAlreadyInHistory && todayAttendance ? [todayAttendance] : [])
  ];

  // ─── YTD total hours (actual punched time only) ───────────────
  const totalMinutesYTD = allRecords.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
  const totalHoursYTDDecimal = parseFloat((totalMinutesYTD / 60).toFixed(2));

  // ─── YTD average: only over days with a punch record, excluding Sundays/holidays ──
  const punchedWorkingDays = allRecords.filter(a =>
    (a.duration_minutes || 0) > 0 && !isSundayOrHoliday(a.date)
  ).length;
  const averageDailyHoursDecimal = punchedWorkingDays > 0
    ? parseFloat((totalMinutesYTD / punchedWorkingDays / 60).toFixed(2))
    : 0;

  // ─── Attendance % for current month ──────────────────────────
  // Formula: effective present days / total days in month × 100
  // Rules:
  //   • Sundays → count as present (1.0), don't count against you
  //   • Confirmed Holidays → count as present (1.0)
  //   • Punched on time (within grace) → 1.0
  //   • Late after grace → 0.5 (half day)
  //   • Absent on a working day → 0.0
  // Denominator = total calendar days in current month (simple)

  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const today = new Date();
  const currentMonthStart = startOfMonth(today);
  const totalDaysInMonth = endOfMonth(today).getDate();

  // Days elapsed so far this month (1 → today's date number)
  const daysElapsed = today.getDate();

  let effectivePresentDays = 0;
  for (let dayNum = 1; dayNum <= daysElapsed; dayNum++) {
    const d = new Date(today.getFullYear(), today.getMonth(), dayNum);
    const dStr = format(d, 'yyyy-MM-dd');

    // Sunday or holiday → full present day
    if (d.getDay() === 0 || holidayDateSet.has(dStr)) {
      effectivePresentDays += 1;
      continue;
    }

    // Find punch record for this day
    const record = allRecords.find(a => a.date === dStr);
    if (!record || !record.punch_in) {
      // Absent working day → 0
      continue;
    }

    // Check if late beyond grace period
    if (record.is_late) {
      effectivePresentDays += 0.5; // half day for late after grace
    } else {
      effectivePresentDays += 1.0;
    }
  }

  const attendancePercentage = daysElapsed > 0
    ? parseFloat(((effectivePresentDays / daysElapsed) * 100).toFixed(2))
    : 0;

  // ─── Current month display hours ─────────────────────────────
  const currentMonthSummary = mySummary && mySummary.monthly_summary
    ? mySummary.monthly_summary.find(s => s.month === currentMonthKey)
    : null;
  const currentMonthHours = currentMonthSummary
    ? currentMonthSummary.total_hours
    : formatDuration(monthTotalMinutes);
  // Export Attendance Summary to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    // Determine the employee name to display
    const employeeName = selectedUserId
      ? (allUsers.find(u => u.id === selectedUserId)?.full_name || 'Employee')
      : (user?.full_name || user?.name || 'Staff Member');

    // Header banner
    doc.setFillColor(13, 59, 102);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('TASKOSPHERE — ATTENDANCE REPORT', 10, 10);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}  |  IST`, 10, 19);

    // Employee info block
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

    // Summary stats
    doc.setFontSize(11);
    doc.text(`Total Monthly Hours : ${currentMonthHours}`, 10, 56);
    doc.text(`Days Present        : ${monthDaysPresent}`, 10, 64);
    doc.text(`Late Arrivals       : ${totalDaysLateThisMonth}`, 10, 72);
    doc.text(`Avg Daily Hours     : ${averageDailyHoursDecimal.toFixed(2)} hrs`, 10, 80);
    doc.text(`Attendance %        : ${attendancePercentage.toFixed(2)}%`, 10, 88);
    doc.line(10, 93, 200, 93);

    // Detailed log header
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Detailed Attendance Log (Last 15 Records):', 10, 102);
    doc.setFont(undefined, 'normal');

    // Column headers
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('DATE', 10, 111);
    doc.text('PUNCH IN', 65, 111);
    doc.text('PUNCH OUT', 105, 111);
    doc.text('DURATION', 155, 111);
    doc.setDrawColor(180, 180, 180);
    doc.line(10, 113, 200, 113);

    doc.setTextColor(0, 0, 0);
    let y = 121;
    attendanceHistory.slice(0, 15).forEach((record, index) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const dateStr = format(parseISO(record.date), 'dd MMM yyyy');
      const inTime = record.punch_in ? formatInTimeZone(new Date(record.punch_in), 'Asia/Kolkata', 'hh:mm a') : '—';
      const outTime = record.punch_out ? formatInTimeZone(new Date(record.punch_out), 'Asia/Kolkata', 'hh:mm a') : 'Ongoing';
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
  };
  // ─── JSX Render ──────────────────────────────────────────────
  return (
    <TooltipProvider>
      <motion.div
        className="space-y-5 min-h-screen overflow-y-auto p-5 md:p-7 lg:p-9 bg-slate-50/60"
        style={{ fontFamily: "'Inter', 'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif" }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: COLORS.deepBlue, fontFamily: "'Inter', 'DM Sans', 'Segoe UI', system-ui, sans-serif", letterSpacing: '-0.02em' }}>
              {user && user.role === 'admin' ? 'Attendance Management' : 'My Attendance'}
            </h1>
            <p className="text-slate-500 mt-1 text-sm font-medium tracking-wide">
              {user && user.role === 'admin' ? 'View and manage attendance for all staff' : 'Track your working hours and attendance history'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* User Filter Dropdown — Admin sees all staff; permitted staff sees only their allowed users */}
            {(isAdmin || canViewAllAttendance || permittedUserIds.length > 0) && allUsers.length > 0 && (
              <select
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={selectedUserId || ''}
                onChange={e => {
                  const val = e.target.value || null;
                  setSelectedUserId(val);
                  fetchData(val);
                }}
              >
                {/* "All Staff" option only available to admin or full can_view_attendance users */}
                {(isAdmin || canViewAllAttendance) && <option value="">All Staff</option>}
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            )}
            {/* Admin: Add Holiday Button */}
            {user && user.role === 'admin' && (
              <Button
                variant="outline"
                onClick={() => {
                  setHolidayRows([{ name: '', date: format(selectedDate, 'yyyy-MM-dd') }]);
                  setShowHolidayModal(true);
                }}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                + Add Holiday
              </Button>
            )}
            <Button onClick={handleExportPDF} variant="outline">
              Export PDF
            </Button>
          </div>
        </motion.div>
        {/* Viewing As Banner — shown for admin and permitted staff when a specific user is selected */}
        {selectedUserId && (
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <span className="font-semibold">Viewing attendance for:</span>
              <span className="font-bold">{allUsers.find(u => u.id === selectedUserId)?.full_name || selectedUserId}</span>
              {(isAdmin || canViewAllAttendance) && (
                <button className="ml-auto text-blue-500 hover:text-blue-700 underline text-xs" onClick={() => { setSelectedUserId(null); fetchData(null); }}>
                  Clear (Show All)
                </button>
              )}
            </div>
          </motion.div>
        )}
        {/* Today's / Selected Date Status Card */}
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                    <Clock className="h-7 w-7 text-white" />
                  </div>
                  <div className="text-white">
                    <h3 className="text-xl font-semibold">
                      {isTodaySelected ? "Today's Status" : `Status for ${format(selectedDate, 'EEEE, MMMM d, yyyy')}`}
                    </h3>
                    {!isTodaySelected && (
                      <p className="text-blue-100 text-sm">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
                    )}
                    {selectedAttendance && selectedAttendance.punch_in && (
                      <p className="text-sm text-blue-100/80">
                        In: {formatInTimeZone(new Date(selectedAttendance.punch_in), 'Asia/Kolkata', 'hh:mm a')}
                        {selectedAttendance.punch_out && (
                          <> • Out: {formatInTimeZone(new Date(selectedAttendance.punch_out), 'Asia/Kolkata', 'hh:mm a')}</>
                        )}
                      </p>
                    )}
                    <p className="text-sm text-blue-100/80 mt-1">
                      Expected: In {user && user.punch_in_time || 'N/A'} (Grace {user && user.grace_time || 'N/A'}) • Out {user && user.punch_out_time || 'N/A'}
                    </p>
                    {isLateToday && isTodaySelected && (
                      <div className="mt-2 inline-flex items-center gap-2 bg-red-500/30 backdrop-blur px-3 py-1 rounded-full">
                        <AlertTriangle className="h-4 w-4 text-red-300" />
                        <span className="text-red-200 font-medium text-sm">Late by {lateByMinutesToday} min</span>
                      </div>
                    )}
                    {isEarlyLeaveToday && isTodaySelected && (
                      <div className="mt-2 inline-flex items-center gap-2 bg-amber-500/30 backdrop-blur px-3 py-1 rounded-full">
                        <AlertTriangle className="h-4 w-4 text-amber-300" />
                        <span className="text-amber-200 font-medium text-sm">Early by {earlyByMinutesToday} min</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  {!(selectedAttendance && selectedAttendance.punch_in) ? (
                    <div className="flex gap-3">
                      {isTodaySelected && (
                        <Button
                          onClick={() => { handlePunchAction("punch_in"); setShowPunchInModal(false); }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Punch In
                        </Button>
                      )}
                      {(!isSelectedPast || isTodaySelected) && (
                        <Button variant="outline" onClick={handleApplyLeaveClick}>
                          Apply For Leave
                        </Button>
                      )}
                    </div>
                  ) : (
                    !(selectedAttendance && selectedAttendance.punch_out) && isTodaySelected && (
                      <Button
                        onClick={() => handlePunchAction('punch_out')}
                        disabled={loading}
                        className="bg-white/20 backdrop-blur text-white hover:bg-white/30 rounded-xl px-8"
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        Punch Out
                      </Button>
                    )
                  )}
                  {(selectedAttendance && selectedAttendance.punch_out) && (
                    <Badge className="bg-white/20 text-white border-0">
                      {formatDuration(selectedAttendance.duration_minutes)}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        {/* Admin Pending Holiday Review */}
        {user && user.role === 'admin' && pendingHolidays.length > 0 && (
          <motion.div variants={itemVariants} className="mb-6">
            <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
              <div className="bg-amber-100/80 px-4 py-2 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold uppercase text-amber-800">
                    Holiday Review ({pendingHolidays.length})
                  </span>
                </div>
                <Badge variant="outline" className="bg-amber-200 text-amber-800 border-amber-300">
                  Admin
                </Badge>
              </div>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingHolidays.map(holiday => (
                    <div key={holiday.date} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col">
                      <div className="mb-4">
                        <h4 className="font-bold text-slate-800">{holiday.name}</h4>
                        <p className="text-sm text-slate-500">{format(parseISO(holiday.date), 'EEEE, MMMM do, yyyy')}</p>
                      </div>
                      <div className="flex gap-2 mt-auto">
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleHolidayDecision(holiday.date, 'confirmed')}
                        >
                          Yes (Closed)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleHolidayDecision(holiday.date, 'rejected')}
                        >
                          No (Working)
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
        {/* Stats Row */}
        <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={itemVariants}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">This Month</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.deepBlue }}>
                    {currentMonthHours}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">{monthDaysPresent} days present</p>
                </div>
                <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                  <Timer className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Tasks Done</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                    {tasksCompleted}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">this month</p>
                </div>
                <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                  <CheckCircle2 className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Days Late</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight text-red-500">
                    {totalDaysLateThisMonth}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">this month</p>
                </div>
                <div className="p-3 rounded-xl" style={{ backgroundColor: '#fee2e220' }}>
                  <CalendarX className="h-5 w-5" style={{ color: '#ef4444' }} />
                </div>
              </div>
            </CardContent>
          </Card>
          {canViewRankings && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase">Your Rank</p>
                    <p className="text-5xl font-extrabold mt-1 tracking-tight" style={{ color: COLORS.deepBlue }}>
                      {myRank}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">overall</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                    <TrendingUp className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
        {/* Live Duration + Clock */}
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-6">
                <div className="text-center md:text-left">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Total Hours Today</p>
                  <p className="text-4xl font-bold tracking-tight" style={{ color: COLORS.emeraldGreen, fontVariantNumeric: 'tabular-nums' }}>
                    {liveDuration}
                  </p>
                  {todayAttendance && todayAttendance.punch_in && !todayAttendance.punch_out && (
                    <p className="text-xs text-emerald-600 mt-2 font-semibold tracking-widest uppercase">● Live · updates every minute</p>
                  )}
                </div>
                <div className="flex justify-center md:justify-end">
                  <DigitalClock />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        {/* Monthly Summary */}
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                    <TrendingUp className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>Monthly Performance</CardTitle>
                    <CardDescription className="text-[11px]">{format(selectedDate, 'MMMM yyyy')}</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Total Hours</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.deepBlue }}>
                    {formatDuration(monthTotalMinutes)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Days Present</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                    {monthDaysPresent}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Days Late</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight text-red-500">
                    {totalDaysLateThisMonth}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        {/* Attendance Analytics Dashboard */}
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                  <TrendingUp className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>Attendance Analytics</CardTitle>
                  <CardDescription className="text-[11px]">Year-to-Date Insights · Late after grace = ½ day · Sundays & holidays counted as present</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Total Hours YTD</p>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>
                    {totalHoursYTDDecimal.toFixed(2)}<span className="text-sm font-medium text-slate-400 ml-1">hrs</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{punchedWorkingDays} working days recorded</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Avg Daily Hours</p>
                  <p className="text-2xl font-bold tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                    {averageDailyHoursDecimal.toFixed(2)}<span className="text-sm font-medium text-slate-400 ml-1">hrs</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">per working day (excl. Sun & holidays)</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Attendance % (This Month)</p>
                  <p className="text-2xl font-bold tracking-tight text-blue-600">
                    {attendancePercentage.toFixed(2)}<span className="text-sm font-medium text-slate-400 ml-0.5">%</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{effectivePresentDays.toFixed(1)} of {daysElapsed} days · late = ½ day</p>
                </div>
              </div>
              <div className="mt-5 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-400 leading-relaxed">
                <strong className="text-slate-500">Calculation rules:</strong> Sundays & confirmed holidays are counted as present (1 day). Days with late punch-in beyond grace period count as half-day (0.5). Attendance % = effective present days ÷ total days elapsed this month × 100.
              </div>
            </CardContent>
          </Card>
        </motion.div>
        {/* Calendar + History Container */}
        <motion.div className="grid grid-cols-1 xl:grid-cols-3 gap-6" variants={itemVariants}>
         
          {/* Calendar & Selection Sidebar */}
          <div className="xl:col-span-1 space-y-6">
            <Card className="border border-slate-200 shadow-sm h-fit">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                    <CalendarIcon className="h-5 w-5" /> Attendance Calendar
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
                    Today
                  </Button>
                </div>
                <CardDescription>Click date for details • Hover for info</CardDescription>
              </CardHeader>
             
              <CardContent className="p-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  modifiers={modifiers}
                  modifiersStyles={modifiersStyles}
                  components={{ Day: CustomDay }}
                  className="rounded-xl border w-full flex justify-center shadow-sm"
                  showOutsideDays={true}
                  fixedWeeks
                  classNames={{
                    months: "w-full",
                    month: "w-full space-y-4",
                    table: "w-full border-collapse",
                    head_row: "flex w-full justify-between mb-2",
                    head_cell: "text-muted-foreground rounded-md w-9 font-medium text-[0.8rem] text-center",
                    row: "flex w-full mt-2 justify-between",
                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                    day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100 rounded-md transition-all flex items-center justify-center",
                    day_today: "bg-slate-100 text-accent-foreground font-bold",
                  }}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6 text-[11px] justify-center border-t pt-4">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.emeraldGreen }} /><span>Present</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span>Late</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#DAA520' }} /><span>Holiday</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full ring-2 ring-blue-500 ring-offset-1" style={{ backgroundColor: COLORS.deepBlue }} /><span>Today</span></div>
                </div>
              </CardContent>
            </Card>
            {/* Selected Day Info Card */}
            <Card className="border border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {selectedAttendance ? (
                    <div className="p-5 bg-slate-50 border-l-4 border-blue-500">
                      <p className="font-bold text-slate-700 text-lg mb-4">{format(selectedDate, 'EEEE, MMM d')}</p>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Punch In</span><span className="font-mono font-bold">{formatInTimeZone(new Date(selectedAttendance.punch_in), 'Asia/Kolkata', 'hh:mm a')}</span></div>
                        {selectedAttendance.punch_out && <div className="flex justify-between"><span className="text-slate-500">Punch Out</span><span className="font-mono font-bold">{formatInTimeZone(new Date(selectedAttendance.punch_out), 'Asia/Kolkata', 'hh:mm a')}</span></div>}
                        <div className="pt-3 border-t flex justify-between items-center"><span className="font-bold">Total Duration</span><Badge className="px-3 py-1 font-mono">{formatDuration(selectedAttendance.duration_minutes)}</Badge></div>
                      </div>
                    </div>
                  ) : selectedHoliday ? (
                    <div className="p-5 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 text-sm font-medium">Holiday: {selectedHoliday.name}</div>
                  ) : (
                    <div className="p-5 bg-red-50 border-l-4 border-red-400 text-red-600 text-sm font-medium">No record / Absent for {format(selectedDate, 'MMM d')}</div>
                  )}
                </CardContent>
            </Card>
          </div>
          {/* Recent History Table */}
          <Card className="border border-slate-200 shadow-sm xl:col-span-2 h-fit">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight" style={{ color: COLORS.deepBlue }}>
                {user && user.role === 'admin' && !selectedUserId ? 'All Staff — Recent Attendance' : 'Recent Attendance'}
              </CardTitle>
              {user && user.role === 'admin' && !selectedUserId && (
                <p className="text-xs text-slate-400 mt-0.5">Showing latest records across all employees. Use the filter above to view a specific person.</p>
              )}
            </CardHeader>
            <CardContent>
              {attendanceHistory.length === 0 ? (
                <p className="text-center py-10 text-slate-500 font-medium">No records yet</p>
              ) : (
                <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
                  {attendanceHistory.slice(0, 15).map((record, idx) => {
                    // For admin all-staff view, try to find the user's name
                    const recordUserName = (user && user.role === 'admin' && !selectedUserId && record.user_id)
                      ? (allUsers.find(u => u.id === record.user_id)?.full_name || record.user_id)
                      : null;
                    return (
                      <div key={`${record.date}-${record.user_id || idx}`} className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 hover:border-blue-200 transition-all shadow-sm">
                        <div>
                          {recordUserName && (
                            <p className="text-xs font-semibold text-blue-700 mb-0.5 uppercase tracking-wide">{recordUserName}</p>
                          )}
                          <p className="font-semibold text-slate-800 text-sm">{format(parseISO(record.date), 'EEE, MMM d, yyyy')}</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">
                            {record.punch_in ? formatInTimeZone(new Date(record.punch_in), 'Asia/Kolkata', 'hh:mm a') : '—'}
                            {' → '}
                            {record.punch_out ? formatInTimeZone(new Date(record.punch_out), 'Asia/Kolkata', 'hh:mm a') : 'Ongoing'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={record.duration_minutes > 0 ? "outline" : "secondary"} className={record.duration_minutes > 0 ? "border-emerald-200 text-emerald-700 bg-emerald-50 px-3 py-0.5 font-mono text-xs" : "text-xs"}>
                            {formatDuration(record.duration_minutes)}
                          </Badge>
                          {record.is_late && (
                            <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Late</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
        {/* Auto Punch-in Modal */}
        {showPunchInModal && (
          <motion.div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowPunchInModal(false)}
          >
            <motion.div
              className="bg-white rounded-3xl p-10 max-w-sm w-[92%] text-center shadow-2xl"
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
            >
              <div className="mb-6">
                <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <LogIn className="h-9 w-9 text-emerald-600" />
                </div>
              </div>
              <h2 className="text-3xl font-bold mb-3" style={{ color: COLORS.deepBlue }}>Good Morning!</h2>
              <p className="text-slate-600 text-lg mb-8">Ready to start your day?<br />Let's punch in.</p>
              <Button
                onClick={() => { handlePunchAction('punch_in'); setShowPunchInModal(false); }}
                disabled={loading}
                className="w-full mb-4 py-7 text-lg rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`, color: 'white' }}
              >
                Punch In Now
              </Button>
              <button onClick={() => setShowPunchInModal(false)} className="text-slate-500 hover:text-slate-700 text-sm underline">
                I'll do it later
              </button>
            </motion.div>
          </motion.div>
        )}
        {/* Add Holidays Modal — Bulk Add */}
        <AnimatePresence>
          {showHolidayModal && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Add Holidays</h2>
                    <p className="text-blue-200 text-xs mt-0.5">Add one or multiple holidays at once</p>
                  </div>
                  <button onClick={() => { setShowHolidayModal(false); setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); }} className="text-white/70 hover:text-white text-xl font-light">✕</button>
                </div>
                {/* Rows */}
                <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-[1fr_160px_36px] gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Holiday Name</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Date</span>
                    <span />
                  </div>
                  {holidayRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_160px_36px] gap-2 items-center">
                      <input
                        type="text"
                        value={row.name}
                        onChange={e => {
                          const updated = [...holidayRows];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setHolidayRows(updated);
                        }}
                        placeholder="e.g. Diwali, Holi..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => {
                          const updated = [...holidayRows];
                          updated[idx] = { ...updated[idx], date: e.target.value };
                          setHolidayRows(updated);
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <button
                        onClick={() => setHolidayRows(holidayRows.filter((_, i) => i !== idx))}
                        disabled={holidayRows.length === 1}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors text-lg font-bold"
                      >×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setHolidayRows([...holidayRows, { name: '', date: format(new Date(), 'yyyy-MM-dd') }])}
                    className="mt-2 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <span className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold text-base leading-none">+</span>
                    Add Another Holiday
                  </button>
                </div>
                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                  <span className="text-xs text-slate-400">{holidayRows.filter(r => r.name.trim() && r.date).length} of {holidayRows.length} row{holidayRows.length !== 1 ? 's' : ''} ready</span>
                  <div className="flex gap-3">
                    <Button variant="ghost" size="sm" onClick={() => { setShowHolidayModal(false); setHolidayRows([{ name: '', date: format(new Date(), 'yyyy-MM-dd') }]); }}>Cancel</Button>
                    <Button
                      size="sm"
                      disabled={holidayRows.filter(r => r.name.trim() && r.date).length === 0}
                      onClick={handleAddHoliday}
                      style={{ backgroundColor: COLORS.deepBlue, color: 'white' }}
                    >
                      Save {holidayRows.filter(r => r.name.trim() && r.date).length > 1 ? `${holidayRows.filter(r => r.name.trim() && r.date).length} Holidays` : 'Holiday'}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Leave Request Modal */}
        <AnimatePresence>
          {showLeaveForm && (
            <motion.div
              className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8"
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>Request Leave</h2>
                    <p className="text-slate-500 mt-1">Select leave period</p>
                  </div>
                  <button onClick={() => setShowLeaveForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
                </div>
                {/* Quick Presets */}
                <div className="mb-8">
                  <p className="text-xs font-medium text-slate-500 mb-3">QUICK SELECT</p>
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
                      >
                        {days === 1 ? "1 Day" : `${days} Days`}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* Calendars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">From</label>
                    <Calendar
                      mode="single"
                      selected={leaveFrom}
                      onSelect={setLeaveFrom}
                      modifiers={modifiers}
                      modifiersStyles={modifiersStyles}
                      components={{ Day: CustomDay }}
                      className="rounded-xl border"
                      showOutsideDays={false}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">To</label>
                    <Calendar
                      mode="single"
                      selected={leaveTo}
                      onSelect={setLeaveTo}
                      disabled={{ before: leaveFrom || new Date() }}
                      className="rounded-2xl border shadow-sm"
                    />
                  </div>
                </div>
                {leaveFrom && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Total Duration</p>
                      <p className="text-3xl font-bold text-blue-700">
                        {Math.max(1, leaveTo ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1 : 1)}
                        <span className="text-xl font-normal"> days</span>
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      {format(leaveFrom, 'dd MMM')} — {leaveTo ? format(leaveTo, 'dd MMM yyyy') : format(leaveFrom, 'dd MMM yyyy')}
                    </div>
                  </div>
                )}
                <div className="mt-8">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Reason</label>
                  <textarea
                    value={leaveReason}
                    onChange={e => setLeaveReason(e.target.value)}
                    placeholder="Reason for leave..."
                    className="w-full min-h-[110px] p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-4 mt-8">
                  <Button variant="ghost" onClick={() => setShowLeaveForm(false)}>Cancel</Button>
                  <Button
                    disabled={!leaveFrom}
                    onClick={async () => {
                      if (!leaveFrom) return;
                      try {
                        await api.post("/attendance/apply-leave", {
                          from_date: format(leaveFrom, 'yyyy-MM-dd'),
                          to_date: leaveTo ? format(leaveTo, 'yyyy-MM-dd') : format(leaveFrom, 'yyyy-MM-dd'),
                          reason: leaveReason || "Personal Leave"
                        });
                        toast.success("Leave request submitted");
                        setShowLeaveForm(false);
                        setLeaveFrom(null);
                        setLeaveTo(null);
                        setLeaveReason("");
                        fetchData();
                      } catch (err) {
                        toast.error("Failed to submit leave request");
                      }
                    }}
                    style={{ backgroundColor: COLORS.deepBlue, color: 'white' }}
                  >
                    Submit Request
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
