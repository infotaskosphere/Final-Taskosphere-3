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
  const fetchData = async () => {
    setLoading(true);
    try {
      const requests = [
        api.get('/attendance/history'),
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
      if (user && user.role === 'admin') {
        setPendingHolidays(allHolidays.filter(h => h.status === 'pending'));
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
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to record attendance';
      toast.error(errorMsg);
      console.error('Punch action error:', error);
    } finally {
      setLoading(false);
    }
  };
  // ─── Holiday & Leave Handlers ───────────────────────────────
  const handleAddHoliday = async () => {
    const holidayName = prompt('Enter holiday name:');
    if (!holidayName) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    try {
      await api.post('/holidays', { date: dateStr, name: holidayName });
      toast.success('Holiday added');
      fetchData();
    } catch (err) {
      toast.error('Failed to add holiday');
    }
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
  const monthDaysPresent = monthAttendance.length;
  const totalDaysLateThisMonth = monthAttendance.filter(a => a.is_late).length;
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
    // Extract the actual day number (1, 2, 3...) from the date object
    const dayNumber = date.getDate();
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* MUST include {dayNumber} inside the button tags */}
          <button
            {...props}
            className={`${props.className} relative w-full h-full flex items-center justify-center min-h-[40px] transition-all hover:bg-slate-100 rounded-lg`}
          >
            {dayNumber}
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
  const totalMinutesYTD = attendanceHistory.reduce((sum, a) => sum + (a.duration_minutes || 0), 0) + (todayAttendance?.duration_minutes || 0);
  const averageDailyMinutes = attendanceHistory.length > 0 ? totalMinutesYTD / (attendanceHistory.length + (todayAttendance ? 1 : 0)) : 0;
  const attendancePercentage = ((attendanceHistory.length + (todayAttendance?.punch_in ? 1 : 0)) / (new Date().getDate())) * 100; // Simplified for current month
  // Export Attendance Summary to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const brandColor = "#0D3B66";
   
    // Header
    doc.setFillColor(13, 59, 102); // COLORS.deepBlue
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('TASKOSPHERE ATTENDANCE REPORT', 10, 13);
   
    // Body Text
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`Employee: ${user?.full_name || 'Staff Member'}`, 10, 30);
    doc.text(`Report Period: ${format(selectedDate, 'MMMM yyyy')}`, 10, 40);
   
    // Stats Box
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 45, 200, 45);
    doc.text(`Total Monthly Hours: ${mySummary?.current_month?.total_hours || '0h 0m'}`, 10, 55);
    doc.text(`Days Present: ${monthDaysPresent}`, 10, 65);
    doc.text(`Late Arrivals: ${totalDaysLateThisMonth}`, 10, 75);
    doc.line(10, 80, 200, 80);
   
    doc.setFont(undefined, 'bold');
    doc.text('Detailed Logs (Last 15 Records):', 10, 95);
    doc.setFont(undefined, 'normal');
   
    let y = 105;
    attendanceHistory.slice(0, 15).forEach((record, index) => {
      const dateStr = format(parseISO(record.date), 'MMM d, yyyy');
      const timeStr = `${record.punch_in ? formatInTimeZone(new Date(record.punch_in), 'Asia/Kolkata', 'hh:mm a') : '--'} to ${record.punch_out ? formatInTimeZone(new Date(record.punch_out), 'Asia/Kolkata', 'hh:mm a') : 'Ongoing'}`;
      doc.text(`${index + 1}. ${dateStr}`, 10, y);
      doc.text(timeStr, 60, y);
      doc.text(formatDuration(record.duration_minutes), 160, y);
      y += 10;
    });
   
    doc.save(`Attendance_${format(selectedDate, 'MMM_yyyy')}.pdf`);
  };
  // ─── JSX Render ──────────────────────────────────────────────
  return (
    <TooltipProvider>
      <motion.div
        className="space-y-6 min-h-screen overflow-y-auto p-4 md:p-6 lg:p-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>My Attendance</h1>
            <p className="text-slate-600 mt-1">Track your working hours and attendance history</p>
          </div>
          <Button onClick={handleExportPDF} variant="outline">
            Export PDF
          </Button>
        </motion.div>
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
                          disabled={loading}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Punch In
                        </Button>
                      )}
                      {(!isSelectedPast || isTodaySelected) && (
                        <Button variant="outline" onClick={handleApplyLeaveClick} disabled={loading}>
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
                        {loading ? "Punching Out..." : "Punch Out"}
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
                          disabled={loading}
                        >
                          Yes (Closed)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleHolidayDecision(holiday.date, 'rejected')}
                          disabled={loading}
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
                  <p className="text-xs font-medium text-slate-500 uppercase">This Month</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: COLORS.deepBlue }}>
                    {(mySummary && mySummary.current_month && mySummary.current_month.total_hours) || '0h 0m'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{monthDaysPresent} days present</p>
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
                  <p className="text-xs font-medium text-slate-500 uppercase">Tasks Done</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: COLORS.emeraldGreen }}>
                    {tasksCompleted}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">this month</p>
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
                  <p className="text-xs font-medium text-slate-500 uppercase">Days Late</p>
                  <p className="text-2xl font-bold mt-1 text-red-500">
                    {totalDaysLateThisMonth}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">this month</p>
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
                  <p className="text-sm font-medium text-slate-500 uppercase mb-2">Total Hours Today</p>
                  <p className="text-4xl font-bold tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                    {liveDuration}
                  </p>
                  {todayAttendance && todayAttendance.punch_in && !todayAttendance.punch_out && (
                    <p className="text-xs text-emerald-600 mt-2 font-medium">LIVE • updates every minute</p>
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
          <Card className="border border-blue-200 shadow-sm bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                <TrendingUp className="h-5 w-5" /> Monthly Performance
              </CardTitle>
              <CardDescription>{format(selectedDate, 'MMMM yyyy')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-xs text-slate-500 uppercase">Total Hours</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: COLORS.deepBlue }}>
                    {formatDuration(monthTotalMinutes)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-xs text-slate-500 uppercase">Days Present</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: COLORS.emeraldGreen }}>
                    {monthDaysPresent}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-xs text-slate-500 uppercase">Days Late</p>
                  <p className="text-2xl font-bold mt-1 text-red-500">
                    {totalDaysLateThisMonth}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        {/* Attendance Analytics Dashboard */}
        <motion.div variants={itemVariants}>
          <Card className="border border-blue-200 shadow-sm bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                <TrendingUp className="h-5 w-5" /> Attendance Analytics Dashboard
              </CardTitle>
              <CardDescription>Year-to-Date Insights and Trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-xs text-slate-500 uppercase">Total Hours YTD</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: COLORS.deepBlue }}>
                    {formatDuration(totalMinutesYTD)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-xs text-slate-500 uppercase">Average Daily Hours</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: COLORS.emeraldGreen }}>
                    {formatDuration(averageDailyMinutes)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border shadow-sm">
                  <p className="text-xs text-slate-500 uppercase">Attendance % (This Month)</p>
                  <p className="text-2xl font-bold mt-1 text-blue-500">
                    {attendancePercentage.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="mt-6 p-4 bg-slate-50 rounded-xl border text-center text-slate-500 text-sm italic">
                Analytics are calculated based on your historical punch records.
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
            <CardHeader><CardTitle className="text-lg" style={{ color: COLORS.deepBlue }}>Recent Attendance</CardTitle></CardHeader>
            <CardContent>
              {attendanceHistory.length === 0 ? (
                <p className="text-center py-10 text-slate-500">No records yet</p>
              ) : (
                <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
                  {attendanceHistory.slice(0, 15).map(record => (
                    <div key={record.date} className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 hover:border-blue-200 transition-all shadow-sm">
                      <div>
                        <p className="font-bold text-slate-800">{format(parseISO(record.date), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {record.punch_in ? formatInTimeZone(new Date(record.punch_in), 'Asia/Kolkata', 'hh:mm a') : '—'} → {record.punch_out ? formatInTimeZone(new Date(record.punch_out), 'Asia/Kolkata', 'hh:mm a') : 'Ongoing'}
                        </p>
                      </div>
                      <Badge variant={record.duration_minutes > 0 ? "outline" : "secondary"} className={record.duration_minutes > 0 ? "border-emerald-200 text-emerald-700 bg-emerald-50 px-4 py-1" : ""}>
                        {formatDuration(record.duration_minutes)}
                      </Badge>
                    </div>
                  ))}
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
                {loading ? "Punching In..." : "Punch In Now"}
              </Button>
              <button onClick={() => setShowPunchInModal(false)} className="text-slate-500 hover:text-slate-700 text-sm underline">
                I'll do it later
              </button>
            </motion.div>
          </motion.div>
        )}
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
                        disabled={loading}
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
                    disabled={loading}
                  />
                </div>
                <div className="flex justify-end gap-4 mt-8">
                  <Button variant="ghost" onClick={() => setShowLeaveForm(false)} disabled={loading}>Cancel</Button>
                  <Button
                    disabled={!leaveFrom || loading}
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
