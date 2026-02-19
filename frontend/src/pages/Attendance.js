import React, { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, parseISO, subDays } from 'date-fns';
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

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }
};

export default function Attendance() {
  const { user } = useAuth();
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [mySummary, setMySummary] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [isLateToday, setIsLateToday] = useState(false);
  const [lateByMinutesToday, setLateByMinutesToday] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showPunchInModal, setShowPunchInModal] = useState(false);
  const [yesterdayUnfinishedTodos, setYesterdayUnfinishedTodos] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const fetchYesterdayTodos = async () => {
      try {
        const res = await api.get('/tasks');
        const yesterday = subDays(new Date(), 1);
        const yesterdayStr = yesterday.toDateString();

        const unfinished = res.data.filter(task =>
          task.type === 'todo' &&
          task.created_by === user?.id &&
          new Date(task.created_at).toDateString() === yesterdayStr &&
          task.status !== 'completed'
        );

        setYesterdayUnfinishedTodos(unfinished);
      } catch (err) {
        console.error('Failed to load yesterday todos', err);
      }
    };
    fetchYesterdayTodos();
  }, [user?.id]);

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
    }
  }, [todayAttendance]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [historyRes, summaryRes, todayRes] = await Promise.all([
        api.get('/attendance/history'),
        api.get('/attendance/my-summary'),
        api.get('/attendance/today')
      ]);
      setAttendanceHistory(historyRes.data || []);
      setMySummary(summaryRes.data);
      setTodayAttendance(todayRes.data);
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

      if (action === 'punch_in' && user?.expected_start_time) {
        try {
          const [expH, expM] = user.expected_start_time.split(':').map(Number);
          const expected = new Date();
          expected.setHours(expH, expM, 0, 0);

          const actual = new Date();

          if (actual > expected) {
            const diffMs = actual.getTime() - expected.getTime();
            lateByMinutes = Math.floor(diffMs / 60000);
            const grace = user.late_grace_minutes ?? 15;

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
      }

      toast.success(
        action === 'punch_in'
          ? (isLate ? 'Punched in (late)' : 'Punched in successfully!')
          : 'Punched out successfully!'
      );

      fetchData();

    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance');
    } finally {
      setLoading(false);
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
    const diffMs = Date.now() - start.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
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

  // Total days late this month
  const totalDaysLateThisMonth = monthAttendance.filter(a => a.is_late === true).length;

  // Placeholder for tasks completed this month (can be replaced with real API later)
  const tasksCompletedThisMonth = 0;

  // Calendar highlighting
  const attendanceDates = attendanceHistory.map(a => parseISO(a.date));

  const lateDates = isLateToday && todayAttendance?.date
    ? [parseISO(todayAttendance.date)]
    : attendanceHistory
        .filter(a => a.is_late === true)
        .map(a => parseISO(a.date));

  const modifiers = {
    present: attendanceDates,
    late: lateDates,
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

  return (
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

      {/* Today's Punch Widget */}
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
                  <h3 className="text-xl font-semibold font-outfit">Today's Status</h3>
                  <p className="text-blue-100">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                  {todayAttendance?.punch_in && (
                    <p className="text-sm text-blue-100/80">
                      In: {format(new Date(todayAttendance.punch_in), 'hh:mm a')}
                      {todayAttendance?.punch_out && ` • Out: ${format(new Date(todayAttendance.punch_out), 'hh:mm a')}`}
                    </p>
                  )}
                  {isLateToday && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-red-500/30 backdrop-blur px-3 py-1 rounded-full">
                      <AlertTriangle className="h-4 w-4 text-red-300" />
                      <span className="text-red-200 font-medium text-sm">
                        Late by {lateByMinutesToday} min
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                {!todayAttendance?.punch_in ? (
                  <Button
                    onClick={() => {
                      handlePunchAction('punch_in');
                      setShowPunchInModal(false);
                    }}
                    disabled={loading}
                    size="lg"
                    className="rounded-xl px-8 font-medium shadow-lg transition-all hover:shadow-xl hover:scale-105 active:scale-95"
                    style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`, color: 'white' }}
                  >
                    <LogIn className="mr-2 h-5 w-5" />
                    Punch In
                  </Button>
                ) : (
                  !todayAttendance?.punch_out && (
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
                {todayAttendance?.punch_out && (
                  <Badge className="bg-white/20 text-white border-0 text-sm px-4 py-2">
                    Completed: {formatDuration(todayAttendance.duration_minutes)}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Cards Row – 4 cards including new "Your Star Performance Rank" */}
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

        {/* Tasks Completed For the Month */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tasks Completed</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: COLORS.emeraldGreen }}>
                  {tasksCompletedThisMonth || '0'}
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
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Your Star Performance Rank</p>
                <p className="text-5xl font-extrabold mt-1 font-outfit tracking-tight" style={{ color: COLORS.deepBlue }}>
                  #3
                </p>
                <p className="text-xs text-slate-500 mt-1">overall</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                <TrendingUp className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Live Total Hours Today Card */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6 text-center">
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">
              Total Hours Today
            </p>
            <p className="text-4xl font-bold tracking-tight" style={{ color: COLORS.emeraldGreen }}>
              {getTodayLiveDuration()}
            </p>
            {todayAttendance?.punch_in && !todayAttendance?.punch_out && (
              <p className="text-xs text-emerald-600 mt-2 font-medium">LIVE • updates every minute</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Unfinished Todos from Yesterday */}
      <motion.div variants={itemVariants}>
        <Card className="border border-red-200 bg-red-50/30 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Clock className="h-5 w-5" />
              Unfinished Todos from Yesterday
            </CardTitle>
            <CardDescription>Complete these to clear your backlog</CardDescription>
          </CardHeader>
          <CardContent>
            {yesterdayUnfinishedTodos.length === 0 ? (
              <p className="text-center py-6 text-slate-500 text-sm">
                All caught up! No unfinished todos from yesterday.
              </p>
            ) : (
              <div className="space-y-3">
                {yesterdayUnfinishedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-4 bg-white rounded-xl border shadow-sm hover:shadow-md transition"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{todo.title}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Added: {format(new Date(todo.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        toast.success('Marked as done (implement patch if needed)');
                      }}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Mark Done
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Calendar and History Section */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={itemVariants}>
        {/* Calendar */}
        <Card className="border border-slate-200 shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <CalendarIcon className="h-5 w-5" />
              Attendance Calendar
            </CardTitle>
            <CardDescription>Green dates = present • Red dates = Late</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className="rounded-md border-0"
            />
            {selectedDayAttendance && (
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-sm font-medium text-slate-700">
                  {format(selectedDate, 'MMMM d, yyyy')}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">In:</span> {format(new Date(selectedDayAttendance.punch_in), 'hh:mm a')}
                  </p>
                  {selectedDayAttendance.punch_out && (
                    <p className="text-sm text-slate-600">
                      <span className="font-medium">Out:</span> {format(new Date(selectedDayAttendance.punch_out), 'hh:mm a')}
                    </p>
                  )}
                  <p className="text-sm font-semibold" style={{ color: COLORS.emeraldGreen }}>
                    Duration: {formatDuration(selectedDayAttendance.duration_minutes)}
                  </p>
                </div>
              </div>
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
                        {record.punch_in ? format(new Date(record.punch_in), 'hh:mm a') : '—'} —
                        {record.punch_out ? format(new Date(record.punch_out), 'hh:mm a') : '—'}
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

      {/* Monthly Summary */}
      {mySummary?.monthly_summary && mySummary.monthly_summary.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-outfit" style={{ color: COLORS.deepBlue }}>
                Monthly Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <p className="text-center py-4 text-slate-500">Monthly details table/chart goes here</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Auto Punch-In Popup */}
      {showPunchInModal && (
        <motion.div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          initial="hidden"
          animate="visible"
          variants={modalVariants}
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
    </motion.div>
  );
}
