import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react";
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Monitor, Clock, User, Activity, BarChart3, Users, Calendar, Timer, TrendingUp, Target, CheckSquare, Briefcase, PieChart as PieIcon, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

const CHART_COLORS = ['#0D3B66', '#1F6FB2', '#1FAF5A', '#5CCB5F', '#0A2D4D'];

const CATEGORY_COLORS = {
  browser: '#1F6FB2',
  productivity: '#1FAF5A',
  communication: '#5CCB5F',
  entertainment: '#EF4444',
  other: '#94A3B8',
};

const TASK_STATUS_COLORS = {
  completed: '#1FAF5A',
  in_progress: '#1F6FB2',
  pending: '#F59E0B',
  overdue: '#EF4444'
};

const TASK_PRIORITY_COLORS = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#1FAF5A'
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function StaffActivity() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('activity');
  const [activityData, setActivityData] = useState([]);
  const [attendanceReport, setAttendanceReport] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [selectedUserTodos, setSelectedUserTodos] = useState([]);
  const [taskAnalytics, setTaskAnalytics] = useState(null);

  // Generate last 12 months for dropdown
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy')
    };
  });

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
      fetchActivityData();
      fetchAttendanceReport();
      fetchTaskAnalytics();
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAttendanceReport();
      fetchTaskAnalytics();
    }
  }, [selectedMonth, selectedUser]);

  useEffect(() => {
    if (user?.role === 'admin' && selectedUser !== 'all') {
      fetchUserTodos();
    } else {
      setSelectedUserTodos([]);
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users');
    }
  };

  const fetchActivityData = async () => {
    try {
      const response = await api.get('/activity/summary');
      setActivityData(response.data);
    } catch (error) {
      toast.error('Failed to fetch activity data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceReport = async () => {
    try {
      const response = await api.get(`/attendance/staff-report?month=${selectedMonth}`);
      setAttendanceReport(response.data);
    } catch (error) {
      console.error('Failed to fetch attendance report');
    }
  };

  const fetchUserTodos = async () => {
    try {
      const res = await api.get(`/todos/${selectedUser}`);
      setSelectedUserTodos(res.data);
    } catch (error) {
      console.error('Failed to fetch user todos:', error);
    }
  };

  const fetchTaskAnalytics = async () => {
    try {
      const params = new URLSearchParams();
      params.append('month', selectedMonth);
      if (selectedUser !== 'all') {
        params.append('user_id', selectedUser);
      }
      const res = await api.get(`/tasks/analytics?${params.toString()}`);
      setTaskAnalytics(res.data);
    } catch (error) {
      console.error('Failed to fetch task analytics:', error);
      // Fallback to computing from tasks if no dedicated endpoint
      const tasksRes = await api.get('/tasks');
      const tasks = tasksRes.data;
      const filteredTasks = selectedUser === 'all' ? tasks : tasks.filter(t => t.assigned_to === selectedUser);
     
      const statusCounts = filteredTasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});
     
      const priorityCounts = filteredTasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {});
     
      const overdue = filteredTasks.filter(t => new Date(t.due_date) < new Date() && t.status !== 'completed').length;
     
      setTaskAnalytics({
        total: filteredTasks.length,
        completed: statusCounts.completed || 0,
        overdue,
        statusData: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
        priorityData: Object.entries(priorityCounts).map(([name, value]) => ({ name, value })),
      });
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatMinutes = (minutes) => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Filter by selected user
  const filteredData = selectedUser === 'all' 
    ? activityData 
    : activityData.filter(d => d.user_id === selectedUser);

  // Aggregate stats
  const totalDuration = filteredData.reduce((sum, d) => sum + d.total_duration, 0);
  const totalApps = filteredData.reduce((sum, d) => sum + Object.keys(d.apps).length, 0);

  // Category data for pie chart
  const categoryData = filteredData.reduce((acc, userData) => {
    Object.entries(userData.categories || {}).forEach(([cat, duration]) => {
      const existing = acc.find(c => c.name === cat);
      if (existing) {
        existing.value += duration;
      } else {
        acc.push({ name: cat, value: duration, color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other });
      }
    });
    return acc;
  }, []);

  // Top apps data for bar chart
  const topApps = filteredData.flatMap(d => d.apps_list || [])
    .reduce((acc, app) => {
      const existing = acc.find(a => a.name === app.name);
      if (existing) {
        existing.duration += app.duration;
        existing.count += app.count;
      } else {
        acc.push({ ...app });
      }
      return acc;
    }, [])
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8);

  // Calculate productivity score
  const productivityScore = categoryData.length > 0 
    ? Math.round((categoryData.find(c => c.name === 'productivity')?.value || 0) / totalDuration * 100) || 0
    : 0;

  // Calculate total attendance hours for selected month
  const totalAttendanceMinutes = attendanceReport?.staff_report?.reduce((sum, s) => sum + s.total_minutes, 0) || 0;
  const onlineEmployees = attendanceReport?.staff_report?.filter(s => s.days_present > 0).length || 0;

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="p-8 text-center max-w-md">
          <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500 mt-2">Only administrators can view staff activity and attendance reports.</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: COLORS.deepBlue }}></div>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>Time Tracking</h1>
          <p className="text-slate-600 mt-1">Monitor employee screen active time and productivity</p>
        </div>
        
        <div className="flex gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-44 bg-white">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-44 bg-white">
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Stats Cards - FirmSync Pro Style */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Active Time</p>
                <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                  {formatDuration(totalDuration)}
                </p>
                <p className="text-xs text-slate-500 mt-1">Across all employees</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                <Clock className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Average Active Time</p>
                <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.mediumBlue }}>
                  {filteredData.length > 0 ? formatDuration(Math.round(totalDuration / filteredData.length)) : '0m'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Per employee</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
                <BarChart3 className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Employees</p>
                <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.emeraldGreen }}>
                  {filteredData.length}
                </p>
                <p className="text-xs text-slate-500 mt-1">Out of {users.length} total</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                <Users className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Productivity Score</p>
                <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.lightGreen }}>
                  {productivityScore}%
                </p>
                <p className="text-xs text-slate-500 mt-1">Team average</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.lightGreen}15` }}>
                <Target className="h-5 w-5" style={{ color: COLORS.lightGreen }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <motion.div variants={itemVariants}>
          <TabsList className="bg-white p-1 rounded-xl border border-slate-200 inline-flex">
            <TabsTrigger value="activity" className="rounded-lg">Activity</TabsTrigger>
            <TabsTrigger value="attendance" className="rounded-lg">Attendance</TabsTrigger>
            <TabsTrigger value="reminder" className="rounded-lg">Reminders</TabsTrigger>
            <TabsTrigger value="todos" className="rounded-lg">To-Do Lists</TabsTrigger>
            <TabsTrigger value="tasks" className="rounded-lg">Task Analytics</TabsTrigger>
          </TabsList>
        </motion.div>

        <TabsContent value="activity" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Pie Chart */}
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                  <PieChart className="h-5 w-5" />
                  Time Distribution
                </CardTitle>
                <CardDescription>
                  By application category
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {categoryData.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    No category data available
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => formatDuration(value)}
                          contentStyle={{ background: 'white', border: '1px solid #e2e8f0' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Apps Bar Chart */}
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                  <BarChart3 className="h-5 w-5" />
                  Top Applications
                </CardTitle>
                <CardDescription>
                  By time spent
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {topApps.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    No application data available
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topApps}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                        <YAxis tickFormatter={(value) => formatDuration(value / 3600)} />
                        <Tooltip formatter={(value) => formatDuration(value)} />
                        <Bar dataKey="duration" fill={COLORS.deepBlue} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          {/* Attendance Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Hours</p>
                    <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                      {formatMinutes(totalAttendanceMinutes)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">This month</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                    <Timer className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Hours/Day</p>
                    <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.mediumBlue }}>
                      {attendanceReport?.staff_report?.length > 0 
                        ? formatMinutes(Math.round(totalAttendanceMinutes / attendanceReport.staff_report.length / 22))
                        : '0h'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Per employee</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
                    <TrendingUp className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Staff Tracked</p>
                    <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.emeraldGreen }}>
                      {onlineEmployees}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">With attendance this month</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                    <Users className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Report Month</p>
                    <p className="text-2xl font-bold mt-2 font-outfit" style={{ color: COLORS.lightGreen }}>
                      {format(new Date(selectedMonth + '-01'), 'MMM yyyy')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Selected period</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.lightGreen}15` }}>
                    <Calendar className="h-5 w-5" style={{ color: COLORS.lightGreen }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staff Attendance Report Table */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                <Users className="h-5 w-5" />
                Staff Monthly Attendance Report
              </CardTitle>
              <CardDescription>
                Working hours breakdown for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!attendanceReport?.staff_report || attendanceReport.staff_report.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Calendar className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No attendance data for this month</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Employee</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Role</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Days Present</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Total Hours</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Avg/Day</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendanceReport.staff_report.map((staff, index) => {
                        const progressPercent = Math.min(100, (staff.total_minutes / (22 * 8 * 60)) * 100); // 22 working days * 8 hours
                        return (
                          <tr key={staff.user_id} className="hover:bg-slate-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                                  style={{ background: `linear-gradient(135deg, ${CHART_COLORS[index % CHART_COLORS.length]} 0%, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]} 100%)` }}
                                >
                                  {staff.user_name?.charAt(0) || '?'}
                                </div>
                                <span className="font-medium text-slate-900">{staff.user_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <Badge className="bg-slate-100 text-slate-700 border-0 capitalize">
                                {staff.role}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold" style={{ color: COLORS.deepBlue }}>
                                {staff.days_present}
                              </span>
                              <span className="text-slate-400 text-sm"> days</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-lg" style={{ color: COLORS.deepBlue }}>
                                  {staff.total_hours}
                                </span>
                                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                  <div 
                                    className="h-full rounded-full"
                                    style={{ 
                                      width: `${progressPercent}%`,
                                      background: `linear-gradient(90deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-600 font-medium">
                              {staff.avg_hours_per_day}h
                            </td>
                            <td className="px-6 py-4">
                              <Badge 
                                className={`border-0 ${
                                  staff.avg_hours_per_day >= 7 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : staff.avg_hours_per_day >= 5
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {staff.avg_hours_per_day >= 7 ? 'Excellent' : staff.avg_hours_per_day >= 5 ? 'Good' : 'Low'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reminder Tab */}
        <TabsContent value="reminder" className="mt-6">
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle 
                className="text-lg font-outfit" 
                style={{ color: COLORS.deepBlue }}
              >
                Send Task Reminders
              </CardTitle>
              <CardDescription>
                Send pending task reminders to employees
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">

              {/* Send to All */}
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={async () => {
                  try {
                    const res = await api.post('/send-pending-task-reminders');
                    toast.success(
                      `Reminder sent successfully. Emails Sent: ${res.data.emails_sent}`
                    );
                  } catch (error) {
                    toast.error("Failed to send reminders");
                  }
                }}
              >
                Send Reminder to All Employees
              </Button>

              {/* Individual */}
              <div className="border-t pt-4">
                <p className="text-sm text-slate-500 mb-3">
                  Or send individually:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {users.map((user) => (
                    <Button
                      key={user.id}
                      variant="outline"
                      onClick={async () => {
                        try {
                          await api.post(`/send-reminder/${user.id}`);
                          toast.success(`Reminder sent to ${user.full_name}`);
                        } catch (error) {
                          toast.error("Failed to send reminder");
                        }
                      }}
                    >
                      Send to {user.full_name}
                    </Button>
                  ))}
                </div>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        {/* To-Do Lists Tab */}
        <TabsContent value="todos" className="mt-6">
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle 
                className="text-lg font-outfit flex items-center gap-2" 
                style={{ color: COLORS.deepBlue }}
              >
                <CheckSquare className="h-5 w-5" />
                Employee To-Do List
              </CardTitle>
              <CardDescription>
                View selected employee's personal to-do tasks (read-only)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {selectedUser === 'all' ? (
                <div className="text-center py-12 text-slate-500">
                  Please select a specific employee to view their to-do list
                </div>
              ) : selectedUserTodos.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No to-do items for this employee
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedUserTodos.map((todo) => (
                    <div
                      key={todo.id}
                      className={`flex items-center p-3 rounded-xl border ${todo.completed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <CheckSquare className={`h-5 w-5 mr-3 ${todo.completed ? 'text-green-500' : 'text-slate-400'}`} />
                      <span className={`text-sm ${todo.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                        {todo.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Task Analytics Tab */}
        <TabsContent value="tasks" className="mt-6">
          <div className="space-y-6">
            {/* Task Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Tasks</p>
                      <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                        {taskAnalytics?.total || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">This period</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                      <Briefcase className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
                      <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.emeraldGreen }}>
                        {taskAnalytics?.completed || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Tasks done</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                      <CheckSquare className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
                      <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.coral }}>
                        {taskAnalytics?.overdue || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Past due</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.coral}15` }}>
                      <AlertCircle className="h-5 w-5" style={{ color: COLORS.coral }} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completion Rate</p>
                      <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.lightGreen }}>
                        {taskAnalytics?.total > 0 ? Math.round((taskAnalytics.completed / taskAnalytics.total) * 100) : 0}%
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Overall</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.lightGreen}15` }}>
                      <Target className="h-5 w-5" style={{ color: COLORS.lightGreen }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Pie Chart */}
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-2 border-b border-slate-100">
                  <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                    <PieIcon className="h-5 w-5" />
                    Task Status Distribution
                  </CardTitle>
                  <CardDescription>
                    Breakdown by status
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {taskAnalytics?.statusData?.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      No status data available
                    </div>
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={taskAnalytics.statusData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {taskAnalytics.statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={TASK_STATUS_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Priority Bar Chart */}
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-2 border-b border-slate-100">
                  <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
                    <BarChart3 className="h-5 w-5" />
                    Task Priority Distribution
                  </CardTitle>
                  <CardDescription>
                    Breakdown by priority
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {taskAnalytics?.priorityData?.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      No priority data available
                    </div>
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={taskAnalytics.priorityData}>
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="value" fill={COLORS.mediumBlue} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Info Note */}
      <motion.div variants={itemVariants}>
        <Card className="border border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Monitor className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-800">Activity Tracking Active</p>
                <p className="text-sm text-emerald-700 mt-1">
                  Activity is tracked automatically based on keyboard and mouse activity while users work in Taskosphere. 
                  Attendance data is based on daily punch-in/punch-out records.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
