import { Button } from "@/components/ui/button"
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import {
 PieChart, Pie, Cell,
 ResponsiveContainer,
 BarChart, Bar,
 LineChart, Line, CartesianGrid,
 XAxis, YAxis, Tooltip, Legend
} from 'recharts';
import {
 Monitor,
 Clock,
 User,
 Activity,
 BarChart3,
 Users,
 Calendar as CalendarIcon,
 TrendingUp,
 Target,
 CheckSquare,
 Briefcase,
 PieChart as PieIcon,
 AlertCircle,
 LogIn,
 LogOut,
 ChevronLeft,
 ChevronRight,
 Timer,
 Mail
} from 'lucide-react';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register the datalabels plugin globally
Chart.register(ChartDataLabels);

// Brand Colors
const COLORS = {
 lightBlue: '#0D3B66',
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
 // ────────────────────────────────────────────────
 // ADDED: Polling intervals (45s refresh when tab active)
 // ────────────────────────────────────────────────
 useEffect(() => {
 if (user?.role !== 'admin') return;
 let intervalId;
 const refreshActiveTab = () => {
 if (activeTab === 'activity') {
 fetchActivityData();
 } else if (activeTab === 'attendance') {
 fetchAttendanceReport();
 } else if (activeTab === 'todos' && selectedUser !== 'all') {
 fetchUserTodos();
 } else if (activeTab === 'tasks') {
 fetchTaskAnalytics();
 }
 };
 refreshActiveTab(); // immediate refresh on tab change
 intervalId = setInterval(refreshActiveTab, 45000);
 return () => {
 if (intervalId) clearInterval(intervalId);
 };
 }, [activeTab, selectedUser, selectedMonth, user]);
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
 // Clean watermark hiding logic (single useEffect)
 useEffect(() => {
 const hideWatermark = () => {
 // Target Recharts text elements that might contain watermark
 document.querySelectorAll('.recharts-text, .recharts-layer text, text').forEach((el) => {
 const text = el.textContent?.toLowerCase() || '';
 if (text.includes('taskosphere') || text.includes('©')) {
 el.style.display = 'none';
 // el.remove(); // uncomment if you want to fully remove instead of hide
 }
 });
 };
 hideWatermark();
 const t1 = setTimeout(hideWatermark, 700);
 const t2 = setTimeout(hideWatermark, 1500);
 const t3 = setTimeout(hideWatermark, 3000);
 return () => {
 clearTimeout(t1);
 clearTimeout(t2);
 clearTimeout(t3);
 };
 }, [activeTab]);
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
 toast.error('Failed to load attendance report');
 }
 };
 const fetchUserTodos = async () => {
 try {
 const res = await api.get(`/todos/${selectedUser}`);
 setSelectedUserTodos(res.data);
 } catch (error) {
 console.error('Failed to fetch user todos:', error);
 if (error.response && error.response.status === 404) {
 setSelectedUserTodos([]);
 } else {
 toast.error('Failed to load to-do list');
 }
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
 toast.error('Task analytics endpoint failed – using fallback');
 // Fallback to computing from tasks if no dedicated endpoint
 try {
 const tasksRes = await api.get('/tasks');
 const tasks = tasksRes.data;
 const filteredTasks = selectedUser === 'all' ? (tasks || []) : (tasks || []).filter(t => t.assigned_to === selectedUser);
 
 const statusCounts = (filteredTasks || []).reduce((acc, task) => {
 acc[task.status] = (acc[task.status] || 0) + 1;
 return acc;
 }, {});
 
 const priorityCounts = (filteredTasks || []).reduce((acc, task) => {
 acc[task.priority] = (acc[task.priority] || 0) + 1;
 return acc;
 }, {});
 
 const overdue = (filteredTasks || []).filter(t => new Date(t.due_date) < new Date() && t.status !== 'completed').length;
 
 setTaskAnalytics({
 total: filteredTasks.length,
 completed: statusCounts.completed || 0,
 overdue,
 statusData: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
 priorityData: Object.entries(priorityCounts).map(([name, value]) => ({ name, value })),
 });
 } catch (fallbackErr) {
 console.error('Fallback computation also failed:', fallbackErr);
 }
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
 ? (activityData || [])
 : (activityData || []).filter(d => d.user_id === selectedUser);
 // Aggregate stats
 const totalDuration = Array.isArray(filteredData)
 ? filteredData.reduce((sum, d) => sum + (Number(d?.total_duration) || 0), 0)
 : 0;
 const totalApps = (filteredData || []).reduce((sum, d) => sum + Object.keys(d.apps || {}).length, 0);
 // Category data for pie chart
 const categoryData = Array.isArray(filteredData)
 ? filteredData.reduce((acc, userData) => {
 if (!userData?.categories) return acc;
 Object.entries(userData.categories).forEach(([cat, duration]) => {
 const existing = acc.find(c => c.name === cat);
 if (existing) {
 existing.value += Number(duration) || 0;
 } else {
 acc.push({ name: cat, value: Number(duration) || 0, color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other });
 }
 });
 return acc;
 }, [])
 : [];
// Modified top apps data processing to exclude any app containing 'taskosphere' (case-insensitive)
const topApps = Array.isArray(filteredData)
 ? filteredData
 .flatMap(d => Array.isArray(d?.apps_list) ? d.apps_list : [])
 .reduce((acc, app) => {
 if (!app?.name || app.name.toLowerCase().includes('taskosphere')) return acc; // Skip if no name or contains 'taskosphere'
 const existing = acc.find(a => a.name === app.name);
 if (existing) {
 existing.duration += Number(app.duration) || 0;
 existing.count += Number(app.count) || 0;
 } else {
 acc.push({ ...app, duration: Number(app.duration) || 0, count: Number(app.count) || 0 });
 }
 return acc;
 }, [])
 .sort((a, b) => b.duration - a.duration)
 .slice(0, 8)
 : [];
// Assuming Chart.js is included in your project, along with chartjs-plugin-datalabels for labels
// <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels"></script>
// Register the datalabels plugin
// Prepare bubble chart data
// Assuming duration is in seconds; convert to hours for y-axis (adjust if units differ)
const bubbleData = topApps.map((app, index) => ({
 x: index + 1, // X-axis as rank (1 to 8)
 y: app.duration / 3600, // Y-axis as hours spent
 r: Math.max(5, Math.sqrt(app.count) * 10), // Radius based on count (min 5 for visibility, scale as needed)
 label: app.name // Custom property for tooltip/label
}));
// Array of colors for bubbles (cycle through shades of blue, green, purple, etc.)
const colors = [
 'rgba(0, 123, 255, 0.7)', // Blue
 'rgba(40, 167, 69, 0.7)', // Green
 'rgba(102, 16, 242, 0.7)', // Purple
 'rgba(23, 162, 184, 0.7)', // Cyan
 'rgba(220, 53, 69, 0.7)', // Red
 'rgba(255, 193, 7, 0.7)', // Yellow
 'rgba(255, 87, 34, 0.7)', // Orange
 'rgba(134, 142, 150, 0.7)' // Gray
];
// Chart configuration
const chartRef = useRef(null);
const chartInstanceRef = useRef(null); // To store the chart instance for cleanup

useEffect(() => {
 if (chartRef.current) {
 const ctx = chartRef.current.getContext('2d');

 // Destroy existing chart instance if it exists (to prevent duplicates on re-render)
 if (chartInstanceRef.current) {
 chartInstanceRef.current.destroy();
 }

 // Create new chart instance
 chartInstanceRef.current = new Chart(ctx, {
 type: 'bubble',
 data: {
 datasets: [{
 label: 'Time Spent',
 data: bubbleData,
 backgroundColor: bubbleData.map((_, index) => colors[index % colors.length]),
 borderColor: bubbleData.map((_, index) => colors[index % colors.length].replace('0.7', '1')),
 borderWidth: 1
 }]
 },
 options: {
 responsive: true,
 maintainAspectRatio: false,
 plugins: {
 legend: {
 display: false // Hide legend if not needed
 },
 datalabels: {
 color: '#333',
 anchor: 'end',
 align: 'end',
 offset: 4,
 formatter: (value, context) => {
 return context.dataset.data[context.dataIndex].label; // Display app name as label
 }
 }
 },
 scales: {
 x: {
 type: 'linear',
 position: 'bottom',
 title: {
 display: true,
 text: 'App Rank'
 },
 min: 0.5,
 max: topApps.length + 0.5,
 ticks: {
 stepSize: 1
 }
 },
 y: {
 type: 'linear',
 title: {
 display: true,
 text: 'Time Spent (Hours)'
 },
 beginAtZero: true
 }
 }
 }
 });
 }

 // Cleanup on unmount or data change
 return () => {
 if (chartInstanceRef.current) {
 chartInstanceRef.current.destroy();
 }
 };
}, [topApps]); // Depend on topApps to recreate chart when data changes
 // Calculate productivity score
 const productivityRaw = categoryData.find(c => c.name === 'productivity')?.value || 0;
 const safeProductivityScore = totalDuration > 0
 ? Math.round((productivityRaw / totalDuration) * 100)
 : 0;
 const productivityScore = safeProductivityScore;
 // Calculate total attendance hours for selected month
 const totalAttendanceMinutes = attendanceReport?.staff_report?.reduce((sum, s) => sum + (s.total_minutes || 0), 0) || 0;
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
 <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: COLORS.lightBlue }}></div>
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
 <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.lightBlue }}>Time Tracking</h1>
 <p className="text-slate-600 mt-1">Monitor employee screen active time and productivity</p>
 </div>
 
 <div className="flex gap-3">
 <Select value={selectedMonth} onValueChange={setSelectedMonth}>
 <SelectTrigger className="w-44 bg-white">
 <CalendarIcon className="h-4 w-4 mr-2" />
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {(months || []).map((m) => (
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
 {(users || []).map((u) => (
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
 <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.lightBlue }}>
 {formatDuration(totalDuration)}
 </p>
 <p className="text-xs text-slate-500 mt-1">Across all employees</p>
 </div>
 <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.lightBlue}15` }}>
 <Clock className="h-5 w-5" style={{ color: COLORS.lightBlue }} />
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
 {filteredData?.length > 0 ? formatDuration(Math.round(totalDuration / filteredData.length)) : '0m'}
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
 {filteredData?.length || 0}
 </p>
 <p className="text-xs text-slate-500 mt-1">Out of {users?.length || 0} total</p>
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
 <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.lightBlue }}>
 <PieIcon className="h-5 w-5" />
 Time Distribution
 </CardTitle>
 <CardDescription>
 By application category
 </CardDescription>
 </CardHeader>
 <CardContent className="p-6">
 {(categoryData?.length === 0 || !categoryData) ? (
 <div className="text-center py-12 text-slate-500">
 No category data available
 </div>
 ) : (
 <div className="w-full h-[300px] min-h-[300px]">
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
 {(categoryData || []).map((entry, index) => (
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
 {/* Top Applications - Modern Line Chart Version */}
 <Card className="border border-slate-200 shadow-sm">
 <CardHeader className="pb-2 border-b border-slate-100">
 <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.lightBlue }}>
 <TrendingUp className="h-5 w-5" />
 Top Applications
 </CardTitle>
 <CardDescription>
 Time spent — ranked by total duration
 </CardDescription>
 </CardHeader>
 <CardContent className="p-6">
 {topApps?.length === 0 ? (
 <div className="text-center py-16 text-slate-500">
 <Monitor className="h-12 w-12 mx-auto mb-4 text-slate-300" />
 <p className="text-lg font-medium">No application usage data yet</p>
 <p className="text-sm mt-1">Data will appear once activity is recorded</p>
 </div>
 ) : (
 <div className="h-[340px] w-full flex flex-col gap-4">
 <div className="flex-1">
 <canvas ref={chartRef} />
 </div>
 <div className="h-[120px]">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart
 data={topApps}
 margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
 >
 {/* Light subtle grid for better readability */}
 <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
 <XAxis
 dataKey="name"
 angle={-30}
 textAnchor="end"
 height={60}
 interval={0} // show every label
 tick={{ fontSize: 10, fill: '#475569' }}
 tickLine={false}
 axisLine={{ stroke: '#e2e8f0' }}
 />
 <YAxis
 tickFormatter={(value) => {
 const hours = Math.floor(value / 3600);
 return `${hours}h`;
 }}
 width={40}
 tick={{ fontSize: 10, fill: '#475569' }}
 axisLine={{ stroke: '#e2e8f0' }}
 tickLine={false}
 />
 <Tooltip
 formatter={(value) => [formatDuration(value), 'Total time']}
 labelFormatter={(label) => `Application: ${label}`}
 contentStyle={{
 backgroundColor: 'white',
 border: '1px solid #cbd5e1',
 borderRadius: '8px',
 padding: '12px 16px',
 boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
 }}
 cursor={{ stroke: COLORS.mediumBlue, strokeWidth: 2, strokeDasharray: '4 4' }}
 />
 <Line
 type="monotone"
 dataKey="duration"
 name="Time Spent"
 stroke={COLORS.mediumBlue}
 strokeWidth={2}
 dot={{ r: 4, strokeWidth: 2, stroke: COLORS.mediumBlue, fill: 'white' }}
 activeDot={{ r: 6, strokeWidth: 2, stroke: COLORS.lightBlue, fill: 'white' }}
 isAnimationActive={true}
 />
 </LineChart>
 </ResponsiveContainer>
 </div>
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
 <p className="text-3xl font-bold mt-2 font-outfit" style={{ color: COLORS.lightBlue }}>
 {formatMinutes(totalAttendanceMinutes)}
 </p>
 <p className="text-xs text-slate-500 mt-1">This month</p>
 </div>
 <div className="p-3 rounded-xl" style={{ backgroundColor: `${COLORS.lightBlue}15` }}>
 <Timer className="h-5 w-5" style={{ color: COLORS.lightBlue }} />
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
 {(attendanceReport?.staff_report?.length > 0)
 ? formatMinutes(Math.round(totalAttendanceMinutes / (onlineEmployees || 1) / 22))
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
 <CalendarIcon className="h-5 w-5" style={{ color: COLORS.lightGreen }} />
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 {/* Staff Attendance Report Table */}
 <Card className="border border-slate-200 shadow-sm">
 <CardHeader className="pb-2 border-b border-slate-100">
 <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.lightBlue }}>
 <Users className="h-5 w-5" />
 Staff Monthly Attendance Report
 </CardTitle>
 <CardDescription>
 Working hours breakdown for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
 </CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 {(!attendanceReport?.staff_report || attendanceReport.staff_report.length === 0) ? (
 <div className="text-center py-12 text-slate-500">
 <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-slate-300" />
 <p>No attendance data for this month</p>
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-slate-50 border-b border-slate-200">
 <tr>
 <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Employee</th>
 <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Days Present</th>
 <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Total Hours</th>
 <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Avg/Day</th>
 <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-4">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {(attendanceReport?.staff_report || []).map((staff, index) => {
 return (
 <tr key={staff.user_id} className="hover:bg-slate-50">
 <td className="px-6 py-4">
 <span className="font-medium text-slate-900">{staff.user_name}</span>
 </td>
 <td className="px-6 py-4">
 <span className="font-semibold" style={{ color: COLORS.lightBlue }}>
 {staff.days_present}
 </span>
 </td>
 <td className="px-6 py-4">
 <span className="font-bold text-lg" style={{ color: COLORS.lightBlue }}>
 {staff.total_hours}h
 </span>
 </td>
 <td className="px-6 py-4 text-slate-600 font-medium">
 {staff.avg_hours_per_day}h
 </td>
 <td className="px-6 py-4">
 <Badge
 className={`border-0 ${
 staff.avg_hours_per_day >= 7
 ? 'bg-emerald-100 text-emerald-700'
 : 'bg-amber-100 text-amber-700'
 }`}
 >
 {staff.avg_hours_per_day >= 7 ? 'Excellent' : 'Good'}
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
 <Card className="border border-slate-200 shadow-sm p-6">
 <Button
 className="w-full bg-blue-600 hover:bg-blue-700 mb-6"
 onClick={async () => {
 try {
 const res = await api.post('/send-pending-task-reminders');
 toast.success(`Sent: ${res.data.emails_sent}`);
 } catch (error) {
 toast.error("Failed");
 }
 }}
 >
 Send Reminder to All Employees
 </Button>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {(users || []).map((user) => (
 <Button
 key={user.id}
 variant="outline"
 onClick={async () => {
 try {
 await api.post(`/send-reminder/${user.id}`);
 toast.success(`Sent to ${user.full_name}`);
 } catch (error) {
 toast.error("Failed");
 }
 }}
 >
 Send to {user.full_name}
 </Button>
 ))}
 </div>
 </Card>
 </TabsContent>
 {/* To-Do Lists Tab */}
 <TabsContent value="todos" className="mt-6">
 <Card className="border border-slate-200 shadow-sm p-4">
 {selectedUser === 'all' ? (
 <div className="text-center py-12 text-slate-500">
 Select an employee
 </div>
 ) : (!selectedUserTodos || selectedUserTodos.length === 0) ? (
 <div className="text-center py-12 text-slate-500">
 No items found
 </div>
 ) : (
 <div className="space-y-3">
 {(selectedUserTodos || []).map((todo) => (
 <div
 key={todo.id}
 className={`flex items-center p-3 rounded-xl border ${todo.completed ? 'bg-green-50' : 'bg-slate-50'}`}
 >
 <CheckSquare className={`h-5 w-5 mr-3 ${todo.completed ? 'text-green-500' : 'text-slate-400'}`} />
 <span className={todo.completed ? 'line-through text-slate-500' : ''}>
 {todo.title}
 </span>
 </div>
 ))}
 </div>
 )}
 </Card>
 </TabsContent>
 {/* Task Analytics Tab */}
 <TabsContent value="tasks" className="mt-6">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <Card className="p-6 border border-slate-200">
 <CardTitle className="text-lg mb-4">Status Distribution</CardTitle>
 <div className="h-[300px]">
 {taskAnalytics?.statusData?.length > 0 ? (
 <ResponsiveContainer>
 <PieChart>
 <Pie
 data={taskAnalytics.statusData}
 cx="50%"
 cy="50%"
 outerRadius={90}
 dataKey="value"
 label={({ name }) => name}
 >
 {(taskAnalytics.statusData || []).map((entry, idx) => (
 <Cell
 key={`cell-${idx}`}
 fill={TASK_STATUS_COLORS[entry.name] || CHART_COLORS[idx % CHART_COLORS.length]}
 />
 ))}
 </Pie>
 <Tooltip />
 </PieChart>
 </ResponsiveContainer>
 ) : (
 <div className="text-center py-12 text-slate-500">No data</div>
 )}
 </div>
 </Card>
 </div>
 </TabsContent>
 </Tabs>
 </motion.div>
 );
}
