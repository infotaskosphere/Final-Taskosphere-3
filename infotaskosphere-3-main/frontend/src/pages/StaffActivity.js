import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Monitor, Clock, User, Activity, BarChart3, Users, Calendar, Timer, TrendingUp, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

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
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAttendanceReport();
    }
  }, [selectedMonth]);

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

      {/* Tabs for Activity vs Attendance */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-100 p-1 rounded-xl">
            <TabsTrigger 
              value="activity" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6"
            >
              <Activity className="h-4 w-4 mr-2" />
              Activity Overview
            </TabsTrigger>
            <TabsTrigger 
              value="attendance" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-6"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Attendance Report
            </TabsTrigger>
          </TabsList>

          {/* Activity Tab */}
          <TabsContent value="activity" className="mt-6 space-y-6">
            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category Distribution */}
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-outfit" style={{ color: COLORS.deepBlue }}>Activity by Category</CardTitle>
                  <CardDescription>Time spent across different activity types</CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatDuration(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-slate-500">
                      <p>No activity data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Apps */}
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-outfit" style={{ color: COLORS.deepBlue }}>Top Applications</CardTitle>
                  <CardDescription>Most used applications by duration</CardDescription>
                </CardHeader>
                <CardContent>
                  {topApps.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={topApps} layout="vertical">
                        <XAxis type="number" tickFormatter={(value) => formatDuration(value)} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value) => formatDuration(value)} />
                        <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
                          {topApps.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-slate-500">
                      <p>No application data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Employee Activity Overview */}
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="text-lg font-outfit" style={{ color: COLORS.deepBlue }}>
                  Employee Activity Overview
                </CardTitle>
                <CardDescription>Real-time screen activity and time tracking for all team members</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredData.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Activity className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p>No activity data recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredData.map((userData, index) => {
                      const progressPercent = Math.min(100, (userData.total_duration / 28800) * 100); // 8 hours = 100%
                      return (
                        <div key={userData.user_id} className="p-5 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-4">
                              <div 
                                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg relative"
                                style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
                              >
                                {userData.user_name?.charAt(0) || '?'}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{userData.user_name}</p>
                                <p className="text-sm text-slate-500">Active Time Progress</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge className="bg-emerald-100 text-emerald-700 border-0">
                                Online
                              </Badge>
                              <span className="text-lg font-bold" style={{ color: COLORS.deepBlue }}>
                                {formatDuration(userData.total_duration)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="relative">
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all duration-500"
                                style={{ 
                                  width: `${progressPercent}%`,
                                  background: `linear-gradient(90deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`
                                }}
                              />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-xs text-slate-400">Last Active: Today</span>
                              <span className="text-xs text-slate-500">
                                Workload: {Math.round(progressPercent)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="mt-6 space-y-6">
            {/* Attendance Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Office Hours</p>
                      <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                        {formatMinutes(totalAttendanceMinutes)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">All staff combined</p>
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
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Hours/Staff</p>
                      <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.mediumBlue }}>
                        {attendanceReport?.staff_report?.length > 0 
                          ? formatMinutes(Math.round(totalAttendanceMinutes / attendanceReport.staff_report.length))
                          : '0h'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Monthly average</p>
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
        </Tabs>
      </motion.div>

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
