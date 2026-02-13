import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, Clock, TrendingUp, Target, Timer, LogIn, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

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

export default function Attendance() {
  const { user } = useAuth();
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [mySummary, setMySummary] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [historyRes, summaryRes, todayRes] = await Promise.all([
        api.get('/attendance/history'),
        api.get('/attendance/my-summary'),
        api.get('/attendance/today')
      ]);
      setAttendanceHistory(historyRes.data);
      setMySummary(summaryRes.data);
      setTodayAttendance(todayRes.data);
    } catch (error) {
      toast.error('Failed to fetch attendance data');
    }
  };

  const handlePunchAction = async (action) => {
    setLoading(true);
    try {
      await api.post('/attendance', { action });
      toast.success(action === 'punch_in' ? 'Punched in successfully!' : 'Punched out successfully!');
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

  // Get attendance data for calendar highlighting
  const attendanceDates = attendanceHistory.map(a => a.date);
  
  // Get selected month's attendance records
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

  // Find today's attendance details
  const getSelectedDayAttendance = () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return attendanceHistory.find(a => a.date === dateStr);
  };

  const selectedDayAttendance = getSelectedDayAttendance();

  // Custom day render for calendar
  const modifiers = {
    present: attendanceHistory.map(a => parseISO(a.date)),
    today: [new Date()]
  };

  const modifiersStyles = {
    present: {
      backgroundColor: `${COLORS.emeraldGreen}20`,
      borderRadius: '50%'
    },
    today: {
      fontWeight: 'bold',
      color: COLORS.deepBlue
    }
  };

  return (
    <motion.div 
      className="space-y-6" 
      data-testid="attendance-page"
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
                </div>
              </div>
              <div className="flex gap-3">
                {!todayAttendance?.punch_in ? (
                  <Button
                    onClick={() => handlePunchAction('punch_in')}
                    disabled={loading}
                    size="lg"
                    className="rounded-xl px-8 font-medium shadow-lg transition-all hover:shadow-xl hover:scale-105 active:scale-95"
                    style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`, color: 'white' }}
                    data-testid="punch-in-btn"
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
                      data-testid="punch-out-btn"
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

      {/* Stats Cards */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={itemVariants}>
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

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Per Day</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: COLORS.mediumBlue }}>
                  {monthDaysPresent > 0 ? `${Math.round(monthTotalMinutes / monthDaysPresent / 60 * 10) / 10}h` : '0h'}
                </p>
                <p className="text-xs text-slate-500 mt-1">hours/day avg</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
                <TrendingUp className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">All Time</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: COLORS.emeraldGreen }}>
                  {mySummary?.total_hours_all_time || 0}h
                </p>
                <p className="text-xs text-slate-500 mt-1">{mySummary?.total_days_all_time || 0} total days</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                <Target className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Today</p>
                <p className="text-2xl font-bold mt-1 font-outfit" style={{ color: COLORS.lightGreen }}>
                  {todayAttendance?.duration_minutes ? formatDuration(todayAttendance.duration_minutes) : 
                   todayAttendance?.punch_in ? 'Active' : 'Not In'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {todayAttendance?.punch_in ? 'Punched in' : 'Awaiting punch-in'}
                </p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.lightGreen}15` }}>
                <Clock className="h-5 w-5" style={{ color: COLORS.lightGreen }} />
              </div>
            </div>
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
            <CardDescription>Green dates indicate days you were present</CardDescription>
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
            
            {/* Selected Day Details */}
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
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Clock className="h-5 w-5" />
              Attendance History
            </CardTitle>
            <CardDescription>Your recent punch-in and punch-out records</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {attendanceHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Clock className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No attendance records found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {attendanceHistory.slice(0, 15).map((attendance, index) => (
                  <div
                    key={attendance.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    data-testid={`attendance-row-${attendance.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                        style={{ backgroundColor: `${COLORS.deepBlue}10` }}
                      >
                        <span className="text-lg font-bold" style={{ color: COLORS.deepBlue }}>
                          {format(new Date(attendance.date), 'd')}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(attendance.date), 'MMM')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {format(new Date(attendance.date), 'EEEE')}
                        </p>
                        <p className="text-sm text-slate-500">
                          {format(new Date(attendance.punch_in), 'hh:mm a')}
                          {attendance.punch_out && ` - ${format(new Date(attendance.punch_out), 'hh:mm a')}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold" style={{ color: COLORS.deepBlue }}>
                        {formatDuration(attendance.duration_minutes)}
                      </p>
                      <Badge 
                        className={`text-xs ${
                          attendance.punch_out 
                            ? 'bg-emerald-100 text-emerald-700 border-0' 
                            : 'bg-blue-100 text-blue-700 border-0'
                        }`}
                      >
                        {attendance.punch_out ? 'Completed' : 'Active'}
                      </Badge>
                    </div>
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
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                <TrendingUp className="h-5 w-5" />
                Monthly Working Hours Summary
              </CardTitle>
              <CardDescription>Your working hours breakdown by month</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {mySummary.monthly_summary.map((month, index) => (
                  <div key={month.month} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg"
                        style={{ 
                          backgroundColor: index === 0 ? `${COLORS.emeraldGreen}15` : `${COLORS.deepBlue}10`,
                          color: index === 0 ? COLORS.emeraldGreen : COLORS.deepBlue
                        }}
                      >
                        {format(new Date(month.month + '-01'), 'MMM').slice(0, 3)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {format(new Date(month.month + '-01'), 'MMMM yyyy')}
                        </p>
                        <p className="text-sm text-slate-500">
                          {month.days_present} days present • {month.avg_hours_per_day}h avg/day
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>
                        {month.total_hours}
                      </p>
                      <p className="text-xs text-slate-500">total hours</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
