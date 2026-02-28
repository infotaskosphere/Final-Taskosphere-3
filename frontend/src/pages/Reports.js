import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import { BarChart3, TrendingUp, Clock, Award, Users, CheckCircle2, AlertTriangle, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Brand color palette
const COLORS = ['#0D3B66', '#1F6FB2', '#1FAF5A', '#5CCB5F', '#0A2D4D'];
const CHART_COLORS = {
  primary: '#0D3B66', // Deep Blue
  secondary: '#1F6FB2', // Medium Blue
  success: '#1FAF5A', // Emerald Green
  warning: '#5CCB5F', // Light Green
  accent: '#0A2D4D', // Darker Blue
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

export default function Reports() {
  const { user, hasPermission } = useAuth();
  const canViewReports = hasPermission("can_view_reports");
  const canViewAllReports = hasPermission("can_view_all_reports");
  const canViewSelectedReports = hasPermission("can_view_selected_reports");
  const canDownloadReports = hasPermission("can_download_reports");

  const isAdmin = user?.role === "admin";
  const [reportData, setReportData] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("all");

  // ── NEW: Star Performers state + fetch (added without deleting anything) ──
  const [starPerformers, setStarPerformers] = useState([]);

  // ── NEW: Period selector state (exactly like Dashboard) ──
  const [rankingPeriod, setRankingPeriod] = useState("monthly");

  useEffect(() => {
    fetchAllData();
  }, []);

  // ── NEW: Re-fetch Star Performers when period changes (no original lines deleted) ──
  useEffect(() => {
    const fetchStarPerformers = async () => {
      try {
        const rankingsRes = await api.get('/api/reports/performance-rankings', {
          params: { period: rankingPeriod === "all" ? "all_time" : rankingPeriod },
        });
        setStarPerformers(rankingsRes.data || []);
      } catch (error) {
        console.warn("Failed to fetch star performers:", error);
        setStarPerformers([]);
      }
    };
    fetchStarPerformers();
  }, [rankingPeriod]);

  const fetchAllData = async () => {
    try {
      const [reportsRes, statsRes, tasksRes] = await Promise.all([
        api.get('/reports/efficiency'),
        api.get('/dashboard/stats'),
        api.get('/tasks'),
      ]);
      setReportData(reportsRes.data);
      setDashboardStats(statsRes.data);
      setTasks(tasksRes.data);
    } catch (error) {
      toast.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getAverageScreenTime = () => {
    if (filteredReportData.length === 0) return 0;
    const total = filteredReportData.reduce((sum, item) => sum + item.total_screen_time, 0);
    return Math.round(total / filteredReportData.length);
  };

  const getTotalTasksCompleted = () => {
    return filteredReportData.reduce((sum, item) => sum + item.total_tasks_completed, 0);
  };

  // Task Status Distribution for Pie Chart
  const getTaskStatusData = () => {
    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    return [
      { name: 'Pending', value: pending, color: CHART_COLORS.warning },
      { name: 'In Progress', value: inProgress, color: CHART_COLORS.primary },
      { name: 'Completed', value: completed, color: CHART_COLORS.success },
    ].filter(item => item.value > 0);
  };

  // Task Category Distribution
  const getTaskCategoryData = () => {
    const categoryCount = {};
    tasks.forEach(task => {
      const category = task.category || 'Other';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    return Object.entries(categoryCount)
      .map(([name, count], index) => ({
        name: name.toUpperCase().replace('_', ' '),
        tasks: count,
        fill: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, 6);
  };

  // ── UPDATED: Employee Performance Data now uses real Star Performers data ──
  // (kept original logic for non-admin fallback + all other charts untouched)
  const getEmployeePerformanceData = () => {
    if (!isAdmin) {
      if (filteredReportData.length > 0) {
        const item = filteredReportData[0];
        return [{
          name: 'You',
          tasks: item.total_tasks_completed,
          hours: Math.round(item.total_screen_time / 60),
          fill: COLORS[0],
        }];
      }
      return [];
    } else {
      // Use fresh Star Performers data (overall_score as main metric)
      return starPerformers.slice(0, 5).map((member, index) => ({
        name: member.user_name?.split(' ')[0] || 'User',
        tasks: Math.round(member.overall_score), // Star performer score
        hours: Math.round(member.total_hours || 0),
        fill: COLORS[index % COLORS.length],
      }));
    }
  };

  // Helper function to get start of day
  const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Weekly Trend Data from tasks
  const getWeeklyTrendData = () => {
    const today = new Date();
    const diff = today.getDay() - 1; // Monday as 0
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (diff >= 0 ? diff : diff + 7));
    const startOfWeek = getStartOfDay(monday);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push({
        name: day.toLocaleDateString('en-us', { weekday: 'short' }),
        completed: 0,
        pending: 0,
      });
    }
    tasks.forEach((task) => {
      if (task.status === 'completed' && task.completed_at) {
        const compDate = getStartOfDay(new Date(task.completed_at));
        const dayIndex = Math.floor((compDate - startOfWeek) / 86400000);
        if (dayIndex >= 0 && dayIndex < 7) {
          days[dayIndex].completed += 1;
        }
      }
      if (task.status !== 'completed' && task.created_at) {
        const createDate = getStartOfDay(new Date(task.created_at));
        const dayIndex = Math.floor((createDate - startOfWeek) / 86400000);
        if (dayIndex >= 0 && dayIndex < 7) {
          days[dayIndex].pending += 1;
        }
      }
    });
    return days;
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-slate-200">
          <p className="font-medium text-slate-900">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const handleDownloadReports = () => {
    const headers = ['User', 'Total Tasks Completed', 'Total Screen Time (minutes)'];
    const csvData = filteredReportData.map(item => [
      item.user?.full_name || 'Unknown',
      item.total_tasks_completed,
      item.total_screen_time
    ]);
    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'efficiency_reports.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Efficiency Reports', 10, 10);
    const tableData = filteredReportData.map(item => [
      item.user?.full_name || 'Unknown',
      item.total_tasks_completed,
      item.total_screen_time
    ]);
    doc.autoTable({
      head: [['User', 'Total Tasks Completed', 'Total Screen Time (minutes)']],
      body: tableData,
      startY: 20,
    });
    doc.save('efficiency_reports.pdf');
  };

  const filteredReportData = (() => {
    if (!canViewAllReports && !canViewSelectedReports && !isAdmin) {
      // Normal user → backend should already return only their data
      return reportData;
    }

    if (selectedUserId === "all") {
      return reportData;
    }

    return reportData.filter(r => r.user?._id === selectedUserId);
  })();

  const uniqueUsers = Array.from(new Map(reportData.map(r => [r.user?._id, r.user])).values());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#0D3B66' }}></div>
      </div>
    );
  }

  if (!canViewReports) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">You do not have permission to view reports.</p>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      data-testid="reports-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold font-outfit tracking-tight" style={{ color: '#0D3B66' }}>Analytics & Reports</h1>
          <p className="text-slate-600 mt-2 text-lg">Track performance, productivity, and business insights</p>
        </div>
        {(isAdmin || canDownloadReports) && (
          <div className="flex gap-2">
            <Button onClick={handleDownloadReports} variant="outline">
              Download CSV
            </Button>
            <Button onClick={handleExportPDF} variant="outline">
              Export PDF
            </Button>
          </div>
        )}
      </motion.div>

      {(isAdmin || canViewAllReports || canViewSelectedReports) && (
        <div className="mb-4">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">All Employees</option>
            {uniqueUsers.map((user) => (
              <option key={user?._id} value={user?._id}>
                {user?.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Summary Stats Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        variants={itemVariants}
      >
        <Card className="border-0 shadow-lg text-white overflow-hidden group hover:scale-[1.02] transition-transform duration-200" style={{ background: 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 100%)' }} data-testid="total-tasks-stat">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Tasks</p>
                <p className="text-4xl font-bold font-outfit mt-2">{dashboardStats?.total_tasks || 0}</p>
                <p className="text-blue-100 text-xs mt-2">All time</p>
              </div>
              <div className="bg-white/20 p-4 rounded-2xl">
                <Target className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg text-white overflow-hidden group hover:scale-[1.02] transition-transform duration-200" style={{ background: 'linear-gradient(135deg, #1FAF5A 0%, #5CCB5F 100%)' }} data-testid="completed-tasks-stat">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Completed</p>
                <p className="text-4xl font-bold font-outfit mt-2">{dashboardStats?.completed_tasks || 0}</p>
                <p className="text-green-100 text-xs mt-2">{dashboardStats?.total_tasks > 0 ? Math.round((dashboardStats?.completed_tasks / dashboardStats?.total_tasks) * 100) : 0}% completion rate</p>
              </div>
              <div className="bg-white/20 p-4 rounded-2xl">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card className="border-0 shadow-lg text-white overflow-hidden group hover:scale-[1.02] transition-transform duration-200" style={{ background: 'linear-gradient(135deg, #1F6FB2 0%, #0D3B66 100%)' }} data-testid="team-size-stat">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Team Members</p>
                  <p className="text-4xl font-bold font-outfit mt-2">{dashboardStats?.team_workload?.length || 0}</p>
                  <p className="text-blue-100 text-xs mt-2">Active users</p>
                </div>
                <div className="bg-white/20 p-4 rounded-2xl">
                  <Users className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-lg text-white overflow-hidden group hover:scale-[1.02] transition-transform duration-200" style={{ background: 'linear-gradient(135deg, #5CCB5F 0%, #1FAF5A 100%)' }} data-testid="pending-tasks-stat">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Pending Tasks</p>
                <p className="text-4xl font-bold font-outfit mt-2">{dashboardStats?.pending_tasks || 0}</p>
                <p className="text-green-100 text-xs mt-2">{dashboardStats?.overdue_tasks || 0} overdue</p>
              </div>
              <div className="bg-white/20 p-4 rounded-2xl">
                <AlertTriangle className="h-8 w-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Row 1 */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={itemVariants}
      >
        {/* Task Status Pie Chart */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow" data-testid="task-status-chart">
          <CardHeader>
            <CardTitle className="text-xl font-outfit">Task Status Distribution</CardTitle>
            <CardDescription>Overview of task statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {getTaskStatusData().length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={getTaskStatusData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {getTaskStatusData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">
                <p>No task data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task Category Bar Chart */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow" data-testid="task-category-chart">
          <CardHeader>
            <CardTitle className="text-xl font-outfit">Tasks by Category</CardTitle>
            <CardDescription>Distribution across service categories</CardDescription>
          </CardHeader>
          <CardContent>
            {getTaskCategoryData().length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={getTaskCategoryData()} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="tasks" radius={[0, 8, 8, 0]}>
                    {getTaskCategoryData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">
                <p>No category data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Row 2 */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={itemVariants}
      >
        {/* Employee Performance Bar Chart → NOW STAR PERFORMERS (title + data updated) */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow" data-testid="employee-performance-chart">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-outfit">
                  {isAdmin ? "Star Performers" : "Your Performance"}
                </CardTitle>
                <CardDescription>
                  {isAdmin ? "Top ranked by overall performance score" : "Your performance metrics"}
                </CardDescription>
              </div>
              {/* ── NEW: Period selector (exactly like Dashboard) ── */}
              {isAdmin && (
                <div className="flex gap-1">
                  {["all", "monthly", "weekly"].map(p => (
                    <Button
                      key={p}
                      variant={rankingPeriod === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRankingPeriod(p)}
                      className="text-xs px-3 py-1"
                    >
                      {p.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {getEmployeePerformanceData().length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={getEmployeePerformanceData()}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="tasks" name="Performance Score" radius={[8, 8, 0, 0]}>
                    {getEmployeePerformanceData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">
                <p>No performance data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Trend Area Chart */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow" data-testid="weekly-trend-chart">
          <CardHeader>
            <CardTitle className="text-xl font-outfit">Weekly Activity Trend</CardTitle>
            <CardDescription>Task completion pattern this week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={getWeeklyTrendData()}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={CHART_COLORS.success}
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                />
                <Area
                  type="monotone"
                  dataKey="pending"
                  name="Pending"
                  stroke={CHART_COLORS.warning}
                  fillOpacity={1}
                  fill="url(#colorPending)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team Workload Table */}
      {isAdmin && dashboardStats?.team_workload && (
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 shadow-sm" data-testid="team-workload-table">
            <CardHeader className="bg-slate-50 border-b border-slate-200">
              <CardTitle className="text-sm font-medium text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Team Workload Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Employee</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Total Tasks</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Pending</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Completed</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboardStats.team_workload.map((member, index) => {
                      const progress = member.total_tasks > 0
                        ? Math.round((member.completed_tasks / member.total_tasks) * 100)
                        : 0;
                      return (
                        <tr key={member.user_id} className="hover:bg-slate-50 transition-colors" data-testid={`workload-row-${index}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-semibold">
                                {member.user_name?.charAt(0) || '?'}
                              </div>
                              <span className="font-medium text-slate-900">{member.user_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-semibold">{member.total_tasks}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                              {member.pending_tasks}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                              {member.completed_tasks}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-24">
                                <div
                                  className="bg-gradient-to-r from-orange-500 to-rose-500 h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-slate-600">{progress}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
