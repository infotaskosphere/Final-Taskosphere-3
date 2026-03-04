
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { formatInTimeZone } from "date-fns-tz";
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, parseISO, isBefore, isAfter, isToday as dateFnsIsToday, startOfDay } from 'date-fns';
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
// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

function DigitalClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

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
      transition={{
        duration: 2,
        repeat: Infinity
      }}
    >
      <motion.span
        className="text-3xl font-mono font-bold tracking-wider"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      >
        {time.toLocaleTimeString('en-IN', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}
      </motion.span>

      <span className="text-[11px] uppercase tracking-widest text-blue-200 mt-1">
        Indian Standard Time
      </span>
    </motion.div>
  );
}

export default function Attendance() {
  const { user, hasPermission } = useAuth();
  const canViewRankings = hasPermission("can_view_staff_rankings");
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [mySummary, setMySummary] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [isLateToday, setIsLateToday] = useState(false);
  const [lateByMinutesToday, setLateByMinutesToday] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showPunchInModal, setShowPunchInModal] = useState(false);
 
  // --- ADDED STATES (NO DELETIONS) ---
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
    if (todayAttendance?.date !== todayStr) {
      setIsLateToday(false);
      setLateByMinutesToday(0);
      setIsEarlyLeaveToday(false);
      setEarlyByMinutesToday(0);
    }
  }, [todayAttendance]);
  useEffect(() => {
    if (todayAttendance?.punch_in && !todayAttendance?.punch_out) {
      const interval = setInterval(() => {
        setLiveDuration(getTodayLiveDuration());
      }, 60000);
      setLiveDuration(getTodayLiveDuration()); // initial
      ) => clearInterval(interval);
    }
  }, [todayAttendance]);
  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const isTodayDate = dateFnsIsToday(selectedDate);
    if (isTodayDate) {
      setSelectedAttendance(todayAttendance);
    } else {
      const found = attendanceHistory.find(a => a.date === dateStr);
      setSelectedAttendance(found || null);
    }
  }, [selectedDate, todayAttendance, attendanceHistory]);
  const fetchData = async () => {
    setLoading(true);
    try {
      const requests = [
        api.get('/attendance/history'),
        api.get('/attendance/my-summary'),
        api.get('/attendance/today'),
        api.get('/tasks'),
        api.get('/holidays')
      ];
      if (canViewRankings) {
        requests.push(api.get('/reports/performance-rankings?period=monthly'));
      } else {
        requests.push(Promise.resolve({ data: { rankings: [] } }));
      }
      const [historyRes, summaryRes, todayRes, tasksRes, holidaysRes, rankingRes] =
        await Promise.all(requests);
      setAttendanceHistory(historyRes.data || []);
      setMySummary(summaryRes.data);
      setTodayAttendance(todayRes.data);
      setHolidays(holidaysRes.data || []);
      const rankingList = rankingRes.data.rankings || [];
      const myEntry = rankingList.find(r => r.user_id === user?.id);
      if (myEntry) {
        setMyRank(`#${myEntry.rank}`);
      }
      const completedCount = tasksRes.data.filter(
        task => task.status === 'completed'
      ).length;
      setTasksCompleted(completedCount);
    } catch (error) {
      toast.error('Failed to fetch attendance data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
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
      const res = await api.post('/attendance', {
        action,
        location: locationData
      });
      let isLate = false;
      let lateByMinutes = 0;
      let isEarlyLeave = false;
      let earlyByMinutes = 0;
      if (action === 'punch_in' && user?.punch_in_time) {
        try {
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
              toast.warning(
                `Late by ${lateByMinutes} minutes (your grace: ${grace} min)`,
                { duration: 6000 }
              );
            }
          }
        } catch (err) {
          console.warn("Cannot calculate late status:", err);
        }
      } else if (action === 'punch_out' && user?.punch_out_time && todayAttendance?.punch_in) {
        try {
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
            toast.warning(
              `Early leave by ${earlyByMinutes} minutes (expected out: ${user.punch_out_time})`,
              { duration: 6000 }
            );
          }
        } catch (err) {
          console.warn("Cannot calculate early leave status:", err);
        }
      }
      toast.success(
        action === 'punch_in'
          ? (isLate ? 'Punched in (late)' : 'Punched in successfully!')
          : (isEarlyLeave ? 'Punched out (early leave)' : 'Punched out successfully!')
      );
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance');
    } finally {
      setLoading(false);
    }
  };
  const handleAddHoliday = async () => {
    const holidayName = prompt('Enter holiday name:');
    if (!holidayName) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    try {
      await api.post('/holidays', { date: dateStr, name: holidayName });
      toast.success('Holiday added successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to add holiday');
    }
  };
  const formatDuration = (minutes) => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };
  const getTodayLiveDuration = () => {
    if (!todayAttendance?.punch_in) return "0h 0m";
    if (todayAttendance.punch_out) {
      return formatDuration(todayAttendance.duration_minutes);
    }
    const start = new Date(todayAttendance.punch_in);
    let diffMs = Date.now() - start.getTime();
    if (diffMs < 0) diffMs = 0;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };
  const getDateStatus = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isTodayDate = dateFnsIsToday(date);
    const att = isTodayDate ? todayAttendance : attendanceHistory.find(a => a.date === dateStr);
    const hol = holidays.find(h => h.date === dateStr);
    if (hol) {
      return `Holiday: ${hol.name}`;
    }
    if (att) {
      let str = att.is_late ? 'Late' : 'Present';
      str += ` - Duration: ${formatDuration(att.duration_minutes || 0)}`;
      if (!att.punch_out && isTodayDate) str += ' (Ongoing)';
      return str;
    }
    if (isBefore(startOfDay(date), startOfDay(new Date()))) {
      return 'Absent';
    }
    if (isAfter(date, new Date())) {
      return 'Future date';
    }
    return 'Today - No record yet';
  };
  const getMonthAttendance = () => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    return attendanceHistory.filter(a => {
      const date = parseISO(a.date);
      return date >= start && date <= end;
    });
  };
  const monthAttendance = getMonthAttendance();
  const monthTotalMinutes = monthAttendance.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
  const monthDaysPresent = monthAttendance.length;
  const totalDaysLateThisMonth = monthAttendance.filter(a => a.is_late === true).length;
  // Calendar highlighting
  const attendanceDates = attendanceHistory.map(a => parseISO(a.date));
  const lateDates = isLateToday && todayAttendance?.date
    ? [parseISO(todayAttendance.date)]
    : attendanceHistory
        .filter(a => a.is_late === true)
        .map(a => parseISO(a.date));
  const holidayDates = holidays.map(h => parseISO(h.date));
  const modifiers = {
    present: attendanceDates,
    late: lateDates,
    holidays: holidayDates,
    today: [new Date()]
  };
  const modifiersStyles = {
    present: {
      backgroundColor: `${COLORS.emeraldGreen}20`,
      borderRadius: '50%'
    },
    late: {
      backgroundColor: '#fee2e2',
      color: '#ef4444',
      fontWeight: 'bold',
      borderRadius: '50%'
    },
    holidays: {
      backgroundColor: '#FFD70020',
      color: '#DAA520',
      fontWeight: 'bold',
      borderRadius: '50%'
    },
    today: {
      fontWeight: 'bold',
      color: COLORS.deepBlue
    }
  };
  const getSelectedDayAttendance = () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return attendanceHistory.find(a => a.date === dateStr);
  };
  const selectedDayAttendance = getSelectedDayAttendance();
  const selectedHoliday = holidays.find(h => h.date === format(selectedDate, 'yyyy-MM-dd'));
  const isSelectedToday = dateFnsIsToday(selectedDate);
  const isSelectedFuture = isAfter(selectedDate, new Date());
  const isSelectedPast = isBefore(startOfDay(selectedDate), startOfDay(new Date()));
  const handleApplyLeaveClick = () => {
    if (!isSelectedToday) {
      setLeaveFrom(selectedDate);
      setLeaveTo(selectedDate);
    }
    setShowLeaveForm(true);
  };
  const CustomDay = ({ date, ...props }) => {
    const status = getDateStatus(date);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button {...props} />
        </TooltipTrigger>
        <TooltipContent>
          <p>{format(date, 'MMMM d, yyyy')}</p>
          <p className="font-medium">{status}</p>
        </TooltipContent>
      </Tooltip>
    );
  };
  return (
    <TooltipProvider> {/* ADD THIS HERE */}
      <motion.div
        className="space-y-6 min-h-screen overflow-y-auto p-4 md:p-6 lg:p-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ... all your existing code ... */}

      </motion.div>
    </TooltipProvider> {/* ADD THIS AT THE VERY BOTTOM (before the final closing parenthesis) */}
  );
}
    <motion.div
      className="space-y-6 min-h-screen overflow-y-auto p-4 md:p-6 lg:p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>My Attendance</h1>
          <p className="text-slate-600 mt-1">Track your working hours and attendance history</p>
        </div>
      </motion.div>
      {/* Selected Date Punch Widget */}
      <motion.div variants={itemVariants}>
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
        >
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                  <Clock className="h-7 w-7 text-white" />
                </div>
                <div className="text-white">
                  <h3 className="text-xl font-semibold font-outfit">{isSelectedToday ? "Today's Status" : `Status for ${format(selectedDate, 'EEEE, MMMM d, yyyy')}`}</h3>
                  {!isSelectedToday && <p className="text-blue-100">
                    {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </p>}
                  {selectedAttendance?.punch_in && (
                    <p className="text-sm text-blue-100/80">
                      In: {formatInTimeZone(new Date(selectedAttendance.punch_in), 'Asia/Kolkata', 'hh:mm a')}
                      {selectedAttendance?.punch_out && (
                        <>
                          {" • Out: "}
                          {formatInTimeZone(new Date(selectedAttendance.punch_out), 'Asia/Kolkata', 'hh:mm a')}
                        </>
                      )}
                    </p>
                  )}
                  <p className="text-sm text-blue-100/80 mt-1">
                    Expected: In {user.punch_in_time || 'N/A'} (Grace {user.grace_time || 'N/A'}) • Out {user.punch_out_time || 'N/A'}
                  </p>
                  {isLateToday && isSelectedToday && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-red-500/30 backdrop-blur px-3 py-1 rounded-full">
                      <AlertTriangle className="h-4 w-4 text-red-300" />
                      <span className="text-red-200 font-medium text-sm">
                        Late by {lateByMinutesToday} min
                      </span>
                    </div>
                  )}
                  {isEarlyLeaveToday && isSelectedToday && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-amber-500/30 backdrop-blur px-3 py-1 rounded-full">
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                      <span className="text-amber-200 font-medium text-sm">
                        Early leave by {earlyByMinutesToday} min
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                {!selectedAttendance?.punch_in ? (
                  <div className="flex gap-3">
                    {isSelectedToday && (
                      <Button
                        onClick={() => {
                          handlePunchAction("punch_in");
                          setShowPunchInModal(false);
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Punch In
                      </Button>
                    )}
                    {(!isSelectedPast || isSelectedToday) && (
                      <Button
                        variant="outline"
                        onClick={handleApplyLeaveClick}
                      >
                        Apply For Leave
                      </Button>
                    )}
                  </div>
                ) : (
                  !selectedAttendance?.punch_out && isSelectedToday && (
                    <Button
                      onClick={() => handlePunchAction('punch_out')}
                      disabled={loading}
                      size="lg"
                      className="bg-white/20 backdrop-blur text-white hover:bg-white/30 rounded-xl px-8 font-medium transition-all hover:scale-105 active:scale-95"
                    >
                      <LogOut className="mr-2 h-5 w-5" />
                      Punch Out
                    </Button>
                  )
                )}
                {selectedAttendance?.punch_out && (
                  <Badge className="bg-white/20 text-white border-0 text-sm px-4 py-2">
                    Completed: {formatDuration(selectedAttendance.duration_minutes)}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      {/* Stats Cards Row */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={itemVariants}>
        {/* This Month */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">This Month</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: COLORS.deepBlue }}>
                  {mySummary?.current_month?.total_hours || '0h 0m'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{monthDaysPresent} days present</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                <Timer className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Tasks Completed */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tasks Completed</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: COLORS.emeraldGreen }}>
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
        {/* Total Days Late */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Days Late</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: '#ef4444' }}>
                  {totalDaysLateThisMonth || '0'}
                </p>
                <p className="text-xs text-slate-500 mt-1">this month</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#fee2e220' }}>
                <CalendarX className="h-5 w-5" style={{ color: '#ef4444' }} />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Your Star Performance Rank */}
        {canViewRankings && (
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Your Star Performance Rank</p>
                  <p className="text-5xl font-extrabold mt-1 font-outfit tracking-tight" style={{ color: COLORS.deepBlue }}>
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
      {/* Live Total Hours Today */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-6">
              {/* LEFT SIDE — TOTAL HOURS */}
              <div className="text-center md:text-left">
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">
                  Total Hours Today
                </p>
                <p className="text-4xl font-bold tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                  {liveDuration}
                </p>
                {todayAttendance?.punch_in && !todayAttendance?.punch_out && (
                  <p className="text-xs text-emerald-600 mt-2 font-medium">LIVE • updates every minute</p>
                )}
              </div>
              {/* RIGHT SIDE — DIGITAL CLOCK */}
              <div className="flex justify-center md:justify-end">
                <DigitalClock />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      {/* Monthly Performance Summary */}
      <motion.div variants={itemVariants}>
        <Card className="border border-blue-200 shadow-sm bg-blue-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <TrendingUp className="h-5 w-5" />
              Monthly Performance Summary
            </CardTitle>
            <CardDescription>
              Your attendance insights for {format(selectedDate, 'MMMM yyyy')}
            </CardDescription>
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
      {/* Calendar and History Section - IMPROVED UX */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={itemVariants}>
        {/* ENHANCED ATTENDANCE CALENDAR */}
        <Card className="border border-slate-200 shadow-sm lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                <CalendarIcon className="h-5 w-5" />
                Attendance Calendar
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
                className="text-xs h-8 px-3"
              >
                Today
              </Button>
            </div>
            <CardDescription>Click any date to see details. Hover for quick info.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className="rounded-xl border"
              showOutsideDays={false}
              components={{
                Day: CustomDay
              }}
            />
            {/* Visual Legend */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.emeraldGreen }}></div>
                <span className="text-slate-600">Present</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-slate-600">Late</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#DAA520' }}></div>
                <span className="text-slate-600">Holiday</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full ring-2 ring-blue-500 ring-offset-2" style={{ backgroundColor: COLORS.deepBlue }}></div>
                <span className="text-slate-600">Today</span>
              </div>
            </div>
            {/* Enhanced Selected Day Info */}
            {selectedDayAttendance ? (
              <div className="mt-6 p-5 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="font-semibold text-slate-700 mb-4 text-lg">
                  {format(selectedDate, 'EEEE, MMMM d')}
                </p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Punch In</span>
                    <span className="font-medium">{formatInTimeZone(new Date(selectedDayAttendance.punch_in), 'Asia/Kolkata', 'hh:mm a')}</span>
                  </div>
                  {selectedDayAttendance.punch_out && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Punch Out</span>
                      <span className="font-medium">{formatInTimeZone(new Date(selectedDayAttendance.punch_out), 'Asia/Kolkata', 'hh:mm a')}</span>
                    </div>
                  )}
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="font-medium">Duration</span>
                    <Badge className="font-semibold text-base px-3 py-1">
                      {formatDuration(selectedDayAttendance.duration_minutes)}
                    </Badge>
                  </div>
                  {selectedDayAttendance.is_late && (
                    <Badge variant="destructive" className="mt-2">Late Arrival</Badge>
                  )}
                </div>
              </div>
            ) : selectedHoliday ? (
              <div className="mt-6 p-5 rounded-2xl bg-yellow-50 border border-yellow-200 text-center">
                <p className="text-yellow-700 font-medium">Holiday — {selectedHoliday.name}</p>
              </div>
            ) : (
              <div className="mt-6 p-5 rounded-2xl bg-red-50 border border-red-100 text-center">
                <p className="text-red-600 font-medium">No record — Absent</p>
              </div>
            )}
            {canViewRankings && isSelectedFuture && !selectedHoliday && (
              <Button onClick={handleAddHoliday} className="mt-4" variant="outline">
                Add Holiday
              </Button>
            )}
          </CardContent>
        </Card>
        {/* Recent Attendance History */}
        <Card className="border border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-outfit" style={{ color: COLORS.deepBlue }}>
              Recent Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceHistory.length === 0 ? (
              <p className="text-center py-10 text-slate-500">No attendance records yet</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {attendanceHistory.slice(0, 10).map((record) => (
                  <div key={record.date} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border">
                    <div>
                      <p className="font-medium">{format(parseISO(record.date), 'MMM d, yyyy')}</p>
                      <p className="text-sm text-slate-600">
                        {record.punch_in ? formatInTimeZone(new Date(record.punch_in), 'Asia/Kolkata', 'hh:mm a') : '—'} —
                        {record.punch_out ? formatInTimeZone(new Date(record.punch_out), 'Asia/Kolkata', 'hh:mm a') : '—'}
                      </p>
                    </div>
                    <Badge variant={record.duration_minutes > 0 ? "default" : "secondary"}>
                      {formatDuration(record.duration_minutes)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      {/* Auto Punch-In Popup */}
      {showPunchInModal && (
        <motion.div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          onClick={() => setShowPunchInModal(false)}
        >
          <motion.div
            className="bg-white rounded-3xl p-10 max-w-sm w-[92%] text-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <LogIn className="h-9 w-9 text-emerald-600" />
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-3" style={{ color: COLORS.deepBlue }}>
              Good Morning!
            </h2>
            <p className="text-slate-600 text-lg mb-8">
              Ready to start your day?<br />
              Let's punch in and track your hours.
            </p>
            <Button
              onClick={() => {
                handlePunchAction('punch_in');
                setShowPunchInModal(false);
              }}
              disabled={loading}
              size="lg"
              className="w-full mb-4 text-lg py-7 rounded-2xl font-semibold"
              style={{
                background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`,
                color: 'white'
              }}
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
      {/* PREMIUM LEAVE MODAL WITH SUPERIOR CALENDAR UX */}
      <AnimatePresence>
        {showLeaveForm && (
          <motion.div
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border p-8"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>
                    Request Leave
                  </h2>
                  <p className="text-slate-500 mt-1">Select your leave period</p>
                </div>
                <button
                  onClick={() => {
                    setShowLeaveForm(false);
                    setLeaveFrom(null);
                    setLeaveTo(null);
                    setLeaveReason("");
                  }}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>
              {/* Quick Presets */}
              <div className="mb-8">
                <p className="text-xs font-medium text-slate-500 mb-3">QUICK SELECT</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "1 Day", days: 1 },
                    { label: "3 Days", days: 3 },
                    { label: "1 Week", days: 7 },
                    { label: "15 Days", days: 15 },
                    { label: "30 Days", days: 30 },
                  ].map((preset) => (
                    <Button
                      key={preset.days}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const from = new Date();
                        const to = new Date();
                        to.setDate(from.getDate() + preset.days - 1);
                        setLeaveFrom(from);
                        setLeaveTo(to);
                      }}
                      className="hover:bg-blue-50"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              {/* Side-by-side Calendars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">From Date</label>
                  <Calendar
                    mode="single"
                    selected={leaveFrom}
                    onSelect={setLeaveFrom}
                    disabled={{ before: new Date() }}
                    className="rounded-2xl border shadow-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">To Date</label>
                  <Calendar
                    mode="single"
                    selected={leaveTo}
                    onSelect={setLeaveTo}
                    disabled={{
                      before: leaveFrom || new Date(),
                    }}
                    className="rounded-2xl border shadow-sm"
                  />
                </div>
              </div>
              {/* Live Duration Display */}
              {leaveFrom && (
                <div className="mt-6 p-4 bg-blue-50 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Total Leave Duration</p>
                    <p className="text-3xl font-bold text-blue-700">
                      {Math.max(
                        1,
                        leaveTo
                          ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1
                          : 1
                      )}
                      <span className="text-xl font-normal text-blue-600"> days</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {format(leaveFrom, 'dd MMM')} — {leaveTo ? format(leaveTo, 'dd MMM yyyy') : format(leaveFrom, 'dd MMM yyyy')}
                  </div>
                </div>
              )}
              {/* Reason */}
              <div className="mt-8">
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Reason for Leave
                </label>
                <textarea
                  placeholder="Please provide a reason for your leave request..."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full min-h-[110px] p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {/* Footer */}
              <div className="flex justify-end gap-4 mt-8">
                <Button
                  variant="ghost"
                  onClick={() => setShowLeaveForm(false)}
                  className="px-8"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!leaveFrom}
                  onClick={async () => {
                    if (!leaveFrom) return;
                    try {
                      await api.post("/attendance/apply-leave", {
                        from_date: format(leaveFrom, 'yyyy-MM-dd'),
                        to_date: leaveTo
                          ? format(leaveTo, 'yyyy-MM-dd')
                          : format(leaveFrom, 'yyyy-MM-dd'),
                        reason: leaveReason || "Personal Leave"
                      });
                      toast.success("Leave request submitted successfully");
                      setShowLeaveForm(false);
                      setLeaveFrom(null);
                      setLeaveTo(null);
                      setLeaveReason("");
                      fetchData();
                    } catch (err) {
                      toast.error("Failed to submit leave request");
                    }
                  }}
                  className="px-10"
                  style={{ backgroundColor: COLORS.deepBlue }}
                >
                  Submit Leave Request
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
