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
  primary: '#0D3B66',
  secondary: '#1F6FB2',
  success: '#1FAF5A',
  warning: '#5CCB5F',
  accent: '#0A2D4D',
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

  // ✅ FIXED: removed duplicate line
  const canViewReports = hasPermission("can_view_reports");
  const canDownloadReports = hasPermission("can_download_reports");

  const isAdmin = user?.role === "admin";

  const [reportData, setReportData] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("all");

  const [starPerformers, setStarPerformers] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState("monthly");
    // ✅ FIXED: wait for user before fetching
  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user]);

  // Star Performers fetch
  useEffect(() => {
    const fetchStarPerformers = async () => {
      try {
        const rankingsRes = await api.get('/reports/performance-rankings', {
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
      const reportRequests = [];

      // Always fetch own report
      reportRequests.push(api.get('/reports/efficiency'));

      // Fetch cross-user reports (if any)
      const allowedUsers = user?.permissions?.view_other_reports || [];

      allowedUsers.forEach((id) => {
        reportRequests.push(
          api.get('/reports/efficiency', {
            params: { user_id: id }
          })
        );
      });

      const reportResponses = await Promise.all(reportRequests);

      const combinedReports = reportResponses
        .map(res => res.data)
        .filter(Boolean);

      setReportData(combinedReports);

      const [statsRes, tasksRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/tasks'),
      ]);

      setDashboardStats(statsRes.data);
      setTasks(tasksRes.data);

    } catch (error) {
      toast.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  // Filtering logic
  const filteredReportData =
    selectedUserId === "all"
      ? reportData
      : reportData.filter(r => r.user?.id === selectedUserId);

  const uniqueUsers = Array.from(
    new Map(reportData.map(r => [r.user?.id, r.user])).values()
  );
    const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getAverageScreenTime = () => {
    if (filteredReportData.length === 0) return 0;
    const total = filteredReportData.reduce(
      (sum, item) => sum + item.total_screen_time,
      0
    );
    return Math.round(total / filteredReportData.length);
  };

  const getTotalTasksCompleted = () => {
    return filteredReportData.reduce(
      (sum, item) => sum + item.total_tasks_completed,
      0
    );
  };

  // Task Status Distribution
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

  // Employee Performance / Star Performers
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
      return starPerformers.slice(0, 5).map((member, index) => ({
        name: member.user_name?.split(' ')[0] || 'User',
        tasks: Math.round(member.overall_score),
        hours: Math.round(member.total_hours || 0),
        fill: COLORS[index % COLORS.length],
      }));
    }
  };

  const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getWeeklyTrendData = () => {
    const today = new Date();
    const diff = today.getDay() - 1;
    const monday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (diff >= 0 ? diff : diff + 7)
    );

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

    const csvContent = [headers, ...csvData]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'efficiency_reports.csv');
    link.click();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Efficiency Reports', 10, 10);

    const tableData = filteredReportData.map(item => [
      item.user?.full_name || 'Unknown',
      item.total_tasks_completed || 0,
      item.total_screen_time || 0
    ]);

    doc.autoTable({
      head: [['User', 'Total Tasks Completed', 'Total Screen Time (minutes)']],
      body: tableData,
      startY: 20,
    });

    doc.save('efficiency_reports.pdf');
  };
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getAverageScreenTime = () => {
    if (filteredReportData.length === 0) return 0;
    const total = filteredReportData.reduce(
      (sum, item) => sum + item.total_screen_time,
      0
    );
    return Math.round(total / filteredReportData.length);
  };

  const getTotalTasksCompleted = () => {
    return filteredReportData.reduce(
      (sum, item) => sum + item.total_tasks_completed,
      0
    );
  };

  // Task Status Distribution
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

  // Employee Performance / Star Performers
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
      return starPerformers.slice(0, 5).map((member, index) => ({
        name: member.user_name?.split(' ')[0] || 'User',
        tasks: Math.round(member.overall_score),
        hours: Math.round(member.total_hours || 0),
        fill: COLORS[index % COLORS.length],
      }));
    }
  };

  const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getWeeklyTrendData = () => {
    const today = new Date();
    const diff = today.getDay() - 1;
    const monday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (diff >= 0 ? diff : diff + 7)
    );

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

    const csvContent = [headers, ...csvData]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'efficiency_reports.csv');
    link.click();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Efficiency Reports', 10, 10);

    const tableData = filteredReportData.map(item => [
      item.user?.full_name || 'Unknown',
      item.total_tasks_completed || 0,
      item.total_screen_time || 0
    ]);

    doc.autoTable({
      head: [['User', 'Total Tasks Completed', 'Total Screen Time (minutes)']],
      body: tableData,
      startY: 20,
    });

    doc.save('efficiency_reports.pdf');
  };
      {/* Charts Row 1 */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={itemVariants}
      >

        {/* Task Status Pie Chart */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-xl font-outfit">
              Task Status Distribution
            </CardTitle>
            <CardDescription>
              Overview of task statuses
            </CardDescription>
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
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
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
                No task data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task Category Bar Chart */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-xl font-outfit">
              Tasks by Category
            </CardTitle>
            <CardDescription>
              Distribution across service categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            {getTaskCategoryData().length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={getTaskCategoryData()} layout="vertical">
                  <XAxis type="number" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
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
                No category data available
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

        {/* Star Performers / Your Performance */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-outfit">
                  {isAdmin ? "Star Performers" : "Your Performance"}
                </CardTitle>
                <CardDescription>
                  {isAdmin
                    ? "Top ranked by overall performance score"
                    : "Your performance metrics"}
                </CardDescription>
              </div>

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
                  <Bar
                    dataKey="tasks"
                    name="Performance Score"
                    radius={[8, 8, 0, 0]}
                  >
                    {getEmployeePerformanceData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">
                No performance data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-xl font-outfit">
              Weekly Activity Trend
            </CardTitle>
            <CardDescription>
              Task completion pattern this week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={getWeeklyTrendData()}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke={CHART_COLORS.success}
                  fillOpacity={0.3}
                  fill={CHART_COLORS.success}
                />
                <Area
                  type="monotone"
                  dataKey="pending"
                  stroke={CHART_COLORS.warning}
                  fillOpacity={0.3}
                  fill={CHART_COLORS.warning}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team Workload Table */}
      {isAdmin && dashboardStats?.team_workload && (
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 shadow-sm">
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Total Tasks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Pending
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Completed
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Progress
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboardStats.team_workload.map((member, index) => {
                      const progress =
                        member.total_tasks > 0
                          ? Math.round(
                              (member.completed_tasks /
                                member.total_tasks) *
                                100
                            )
                          : 0;

                      return (
                        <tr key={member.user_id}>
                          <td className="px-6 py-4">
                            {member.user_name}
                          </td>
                          <td className="px-6 py-4 font-semibold">
                            {member.total_tasks}
                          </td>
                          <td className="px-6 py-4">
                            {member.pending_tasks}
                          </td>
                          <td className="px-6 py-4">
                            {member.completed_tasks}
                          </td>
                          <td className="px-6 py-4">
                            {progress}%
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
