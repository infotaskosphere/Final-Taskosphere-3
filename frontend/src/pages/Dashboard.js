// src/components/Dashboard.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import io from 'socket.io-client';
import {
  CheckSquare,
  FileText,
  Clock,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  Calendar,
  Users,
  Key,
  Briefcase,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Target,
  Activity,
  Monitor,
  User,
  BarChart3,
  Timer,
  PieChart as PieIcon,
  Bell,
  X
} from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from 'recharts';

// ────────────────────────────────────────────────
//  CONFIG & COLORS
// ────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ────────────────────────────────────────────────
  //  CORE STATES (original)
  // ────────────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [upcomingDueDates, setUpcomingDueDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState("all");
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');

  // ────────────────────────────────────────────────
  //  REAL-TIME NOTIFICATIONS
  // ────────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const socketRef = useRef(null);
  const notificationAudio = useRef(new Audio('/notification.mp3'));

  // ────────────────────────────────────────────────
  //  STAFF ACTIVITY STATES (admin only)
  // ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('activity');
  const [activityData, setActivityData] = useState([]);
  const [attendanceReport, setAttendanceReport] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [activityLoading, setActivityLoading] = useState(true);
  const [selectedUserTodos, setSelectedUserTodos] = useState([]);
  const [taskAnalytics, setTaskAnalytics] = useState(null);

  const months = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  });

  // ────────────────────────────────────────────────
  //  SOCKET.IO SETUP + NOTIFICATIONS
  // ────────────────────────────────────────────────
  useEffect(() => {
    // Connect only once
    socketRef.current = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected');
      if (user?.id) {
        socketRef.current.emit('join', user.id);
      }
    });

    socketRef.current.on('new-notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);

      notificationAudio.current.play().catch(() => {});

      toast(
        <div className="flex items-center gap-3">
          <div className="text-2xl">{getNotificationIcon(notification.type)}</div>
          <div>
            <p className="font-medium">{notification.title || 'New Notification'}</p>
            <p className="text-sm text-slate-600">{notification.message}</p>
            <p className="text-xs text-slate-500 mt-1">
              {format(new Date(notification.createdAt), 'hh:mm a')}
            </p>
          </div>
        </div>,
        { duration: 8000 }
      );
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [user?.id]);

  // Load initial notifications (fallback / history)
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await api.get('/notifications');
        setNotifications(res.data || []);
      } catch (err) {
        console.warn('Could not load notification history');
      }
    };
    fetchInitial();
  }, []);

  const getNotificationIcon = (type = 'info') => {
    const icons = {
      task: '📋',
      deadline: '⏰',
      message: '💬',
      attendance: '🕒',
      system: '⚙️',
    };
    return icons[type] || '🔔';
  };

  // ────────────────────────────────────────────────
  //  ORIGINAL DATA FETCHING
  // ────────────────────────────────────────────────
  useEffect(() => {
    fetchDashboardData();
    fetchTodayAttendance();
    fetchMyTodos();
  }, [rankingPeriod]);

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

  // ────────────────────────────────────────────────
  //  HELPER FUNCTIONS (fetch, format, styles...)
  // ────────────────────────────────────────────────
  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsersList(res.data);
    } catch (err) {
      console.error('Failed to fetch users');
    }
  };

  const fetchActivityData = async () => {
    try {
      const res = await api.get('/activity/summary');
      setActivityData(res.data);
    } catch (err) {
      toast.error('Failed to load activity summary');
    } finally {
      setActivityLoading(false);
    }
  };

  const fetchAttendanceReport = async () => {
    try {
      const res = await api.get(`/attendance/staff-report?month=${selectedMonth}`);
      setAttendanceReport(res.data);
    } catch (err) {
      console.error('Failed to fetch attendance report');
    }
  };

  const fetchUserTodos = async () => {
    try {
      const res = await api.get(`/tasks/user/${selectedUser}`); // adjust endpoint if needed
      setSelectedUserTodos(res.data);
    } catch (err) {
      console.error('Failed to fetch user todos');
    }
  };

  const fetchTaskAnalytics = async () => {
    try {
      const params = new URLSearchParams({ month: selectedMonth });
      if (selectedUser !== 'all') params.append('user_id', selectedUser);
      const res = await api.get(`/tasks/analytics?${params}`);
      setTaskAnalytics(res.data);
    } catch (err) {
      console.error('Task analytics failed', err);
      setTaskAnalytics(null);
    }
  };

  const fetchMyTodos = async () => {
    try {
      const res = await api.get('/tasks/my');
      setTodos(res.data.map(t => ({
        ...t,
        created_at: t.created_at || new Date().toISOString(),
        completed: t.status === 'completed'
      })));
    } catch (err) {
      console.error('Failed to fetch my todos');
      setTodos([]);
    }
  };

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    try {
      const res = await api.post('/tasks', {
        title: newTodo.trim(),
        status: 'pending',
        created_at: new Date().toISOString()
      });
      setTodos([...todos, {
        ...res.data,
        completed: res.data.status === 'completed'
      }]);
      setNewTodo('');
      toast.success('Task added');
    } catch (err) {
      toast.error('Failed to add task');
    }
  };

  const handleToggleTodo = async (id) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    const newStatus = todo.completed ? 'pending' : 'completed';
    try {
      const res = await api.patch(`/tasks/${id}`, {
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      setTodos(todos.map(t =>
        t.id === id ? { ...res.data, completed: res.data.status === 'completed' } : t
      ));
      toast.success(newStatus === 'completed' ? 'Task completed!' : 'Task reopened');
    } catch (err) {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTodo = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      setTodos(todos.filter(t => t.id !== id));
      toast.success('Task deleted');
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [statsRes, tasksRes, dueRes, rankRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/tasks'),
        api.get('/duedates/upcoming?days=30'),
        api.get(`/staff/rankings?period=${user.role === "admin" ? rankingPeriod : "all"}`)
      ]);

      setStats(statsRes.data);
      setRecentTasks(tasksRes.data?.slice(0, 5) || []);
      setUpcomingDueDates(dueRes.data?.slice(0, 5) || []);
      setRankings(rankRes.data?.rankings || []);
    } catch (err) {
      console.error('Dashboard data fetch failed', err);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      const res = await api.get('/attendance/today');
      setTodayAttendance(res.data);
    } catch (err) {
      console.error('Today attendance failed');
    }
  };

  const handlePunchAction = async (action) => {
    setLoading(true);
    try {
      await api.post('/attendance', { action });
      toast.success(action === 'punch_in' ? 'Punched in!' : 'Punched out!');
      const res = await api.get('/attendance/today');
      setTodayAttendance(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Attendance action failed');
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────────────
  //  FORMAT & STYLE HELPERS
  // ────────────────────────────────────────────────
  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatMinutes = (minutes) => {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getStatusStyle = (status) => {
    const map = {
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-700' },
      pending: { bg: 'bg-slate-100', text: 'text-slate-700' },
    };
    return map[status] || map.pending;
  };

  const getPriorityStyle = (priority) => {
    const map = {
      high: { bg: 'bg-red-50', border: 'border-red-200' },
      medium: { bg: 'bg-amber-50', border: 'border-amber-200' },
      low: { bg: 'bg-blue-50', border: 'border-blue-200' },
    };
    return map[priority] || map.medium;
  };

  const getDeadlineColor = (days) => {
    if (days <= 0) return { bg: 'bg-red-50 border-red-200', badge: 'bg-red-500' };
    if (days <= 7) return { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-500' };
    if (days <= 15) return { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-500' };
    return { bg: 'bg-green-50 border-green-200', badge: 'bg-green-600' };
  };

  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
    : 0;

  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((a, b) => a.days_remaining < b.days_remaining ? a : b)
    : null;

  // Filter activity data
  const filteredActivity = selectedUser === 'all'
    ? activityData
    : activityData.filter(d => d.user_id === selectedUser);

  const totalDuration = filteredActivity.reduce((sum, d) => sum + (d.total_duration || 0), 0);

  const categoryData = filteredActivity.reduce((acc, d) => {
    Object.entries(d.categories || {}).forEach(([cat, dur]) => {
      const found = acc.find(c => c.name === cat);
      if (found) found.value += dur;
      else acc.push({ name: cat, value: dur, color: CATEGORY_COLORS[cat] || '#94A3B8' });
    });
    return acc;
  }, []);

  const topApps = filteredActivity
    .flatMap(d => d.apps_list || [])
    .reduce((acc, app) => {
      const ex = acc.find(a => a.name === app.name);
      if (ex) {
        ex.duration += app.duration;
        ex.count += app.count;
      } else acc.push({ ...app });
      return acc;
    }, [])
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8);

  const productivityScore = totalDuration > 0
    ? Math.round((categoryData.find(c => c.name === 'productivity')?.value || 0) / totalDuration * 100)
    : 0;

  const totalAttendanceMin = attendanceReport?.staff_report?.reduce((s, r) => s + r.total_minutes, 0) || 0;
  const activeEmployees = attendanceReport?.staff_report?.filter(r => r.days_present > 0).length || 0;

  // ────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────
  if (!user) return <div className="p-8 text-center">Loading user...</div>;

  return (
    <motion.div
      className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ─── Header + Notification Bell ─── */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>
            Dashboard
          </h1>
          <p className="text-slate-600">
            {format(new Date(), 'MMMM d, yyyy')} • {user.full_name}
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-slate-100 rounded-full transition"
          >
            <Bell className="h-6 w-6 text-slate-700" />
            {notifications.length > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1.5 min-w-[18px] h-5 rounded-full flex items-center justify-center">
                {notifications.length > 9 ? '9+' : notifications.length}
              </Badge>
            )}
          </button>

          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 mt-2 w-80 bg-white border rounded-xl shadow-xl z-50 max-h-[70vh] overflow-y-auto"
            >
              <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                <h3 className="font-semibold">Notifications</h3>
                <button onClick={() => setShowNotifications(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No new notifications
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-4 hover:bg-slate-50 transition">
                      <div className="flex gap-3">
                        <div className="text-2xl">{getNotificationIcon(n.type)}</div>
                        <div className="flex-1">
                          <p className="font-medium">{n.title || 'Update'}</p>
                          <p className="text-sm text-slate-600">{n.message}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {format(new Date(n.createdAt), 'MMM d, hh:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ─── Welcome Banner ─── */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10 -mr-16 -mt-16"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
          />
          <CardContent className="p-8 relative">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div>
                <h1 className="text-4xl font-bold" style={{ color: COLORS.deepBlue }}>
                  Welcome back, {user.full_name?.split(' ')[0] || 'User'}
                </h1>
                <p className="text-slate-600 mt-2 text-lg">
                  Here's what's happening today • {format(new Date(), 'MMMM d, yyyy')}
                </p>
              </div>

              {nextDeadline && (
                <div
                  className="flex items-center gap-4 p-6 border-2 rounded-2xl cursor-pointer hover:shadow-md transition-all bg-white"
                  style={{ borderColor: COLORS.mediumBlue }}
                  onClick={() => navigate('/duedates')}
                >
                  <Calendar className="h-8 w-8" style={{ color: COLORS.mediumBlue }} />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Next Deadline</p>
                    <p className="font-bold text-lg" style={{ color: COLORS.deepBlue }}>
                      {format(new Date(nextDeadline.due_date), 'MMM d')}: {nextDeadline.title?.slice(0,20)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Key Metrics ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tasks */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate('/tasks')}>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase">Total Tasks</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {stats?.total_tasks || 0}
                </p>
              </div>
              <Briefcase className="h-8 w-8 opacity-80" style={{ color: COLORS.deepBlue }} />
            </div>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className={`hover:shadow-lg transition-all cursor-pointer group ${stats?.overdue_tasks > 0 ? 'bg-red-50/60' : ''}`} onClick={() => navigate('/tasks')}>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase">Overdue</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.coral }}>
                  {stats?.overdue_tasks || 0}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 opacity-80" style={{ color: COLORS.coral }} />
            </div>
          </CardContent>
        </Card>

        {/* Completion Rate */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate('/tasks')}>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase">Completion</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {completionRate}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 opacity-80" style={{ color: COLORS.emeraldGreen }} />
            </div>
          </CardContent>
        </Card>

        {/* Today Attendance */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate('/attendance')}>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase">Today</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {todayAttendance?.duration_minutes
                    ? `${Math.floor(todayAttendance.duration_minutes / 60)}h ${todayAttendance.duration_minutes % 60}m`
                    : '—'}
                </p>
              </div>
              <Clock className="h-8 w-8 opacity-80" style={{ color: COLORS.amber }} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Recent Tasks + Due Dates + Attendance Punch ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              Recent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No recent tasks</p>
            ) : (
              <div className="space-y-3">
                {recentTasks.map(task => (
                  <div
                    key={task.id}
                    className={`p-4 rounded-lg border cursor-pointer hover:shadow-sm ${getPriorityStyle(task.priority).bg} ${getPriorityStyle(task.priority).border}`}
                    onClick={() => navigate('/tasks')}
                  >
                    <div className="flex justify-between items-start">
                      <p className="font-medium">{task.title}</p>
                      <Badge className={getStatusStyle(task.status).bg + ' ' + getStatusStyle(task.status).text}>
                        {task.status?.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Due: {task.due_date ? format(new Date(task.due_date), 'MMM d') : 'No date'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Due Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" style={{ color: COLORS.amber }} />
              Upcoming Due Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingDueDates.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No upcoming deadlines</p>
            ) : (
              <div className="space-y-3">
                {upcomingDueDates.map(due => {
                  const color = getDeadlineColor(due.days_remaining);
                  return (
                    <div
                      key={due.id}
                      className={`p-4 rounded-lg border cursor-pointer hover:shadow-sm ${color.bg}`}
                      onClick={() => navigate('/duedates')}
                    >
                      <div className="flex justify-between">
                        <p className="font-medium">{due.title}</p>
                        <Badge className={color.badge}>
                          {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {format(new Date(due.due_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Punch */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              Today's Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayAttendance?.punch_in ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2"><LogIn className="h-4 w-4 text-green-600" /> Punch In</span>
                  <span>{format(new Date(todayAttendance.punch_in), 'hh:mm a')}</span>
                </div>

                {todayAttendance.punch_out ? (
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><LogOut className="h-4 w-4 text-red-600" /> Punch Out</span>
                    <span>{format(new Date(todayAttendance.punch_out), 'hh:mm a')}</span>
                  </div>
                ) : (
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700"
                    onClick={() => handlePunchAction('punch_out')}
                    disabled={loading}
                  >
                    Punch Out
                  </Button>
                )}

                <div className="text-center py-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">Total Today</p>
                  <p className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>
                    {todayAttendance.duration_minutes
                      ? `${Math.floor(todayAttendance.duration_minutes / 60)}h ${todayAttendance.duration_minutes % 60}m`
                      : '0h 0m'}
                  </p>
                </div>
              </>
            ) : (
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => handlePunchAction('punch_in')}
                disabled={loading}
              >
                Punch In
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── My To-Do + Rankings ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My To-Do List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              My To-Do List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <input
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                placeholder="Add a new task..."
                className="flex-1 border rounded-md px-3 py-2"
              />
              <Button onClick={addTodo} disabled={!newTodo.trim()}>Add</Button>
            </div>

            {todos.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No tasks yet</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {todos.map(todo => (
                  <div
                    key={todo.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      todo.completed ? 'bg-green-50 border-green-200' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggleTodo(todo.id)}
                        className="h-5 w-5"
                      />
                      <div>
                        <p className={todo.completed ? 'line-through text-slate-500' : ''}>
                          {todo.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(todo.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTodo(todo.id)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rankings (Star Performers) */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" style={{ color: COLORS.amber }} />
                Star Performers
              </CardTitle>
              {user.role === 'admin' && (
                <div className="flex gap-2">
                  {['all', 'weekly', 'monthly'].map(p => (
                    <button
                      key={p}
                      onClick={() => setRankingPeriod(p)}
                      className={`px-3 py-1 text-xs rounded-full ${
                        rankingPeriod === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {rankings.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No ranking data</p>
            ) : (
              <div className="space-y-3">
                {rankings.slice(0, 5).map((r, i) => (
                  <div
                    key={r.user_id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      i === 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 text-lg font-bold">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                      </div>
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{r.score}%</p>
                      <p className="text-xs text-slate-500">{r.hours_worked || 0}h</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── ADMIN ONLY ─── Real-time Staff Activity Section ─── */}
      {user.role === 'admin' && (
        <motion.div variants={itemVariants} className="mt-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: COLORS.deepBlue }}>
            Staff Activity & Time Tracking
          </h2>

          {activityLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-48">
                    <Calendar className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-64">
                    <User className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="All Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {usersList.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm text-slate-500 uppercase">Total Active Time</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                      {formatDuration(totalDuration)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm text-slate-500 uppercase">Avg per Person</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: COLORS.mediumBlue }}>
                      {filteredActivity.length > 0 ? formatDuration(Math.round(totalDuration / filteredActivity.length)) : '—'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm text-slate-500 uppercase">Active Staff</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: COLORS.emeraldGreen }}>
                      {filteredActivity.length}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm text-slate-500 uppercase">Productivity</p>
                    <p className="text-3xl font-bold mt-2" style={{ color: COLORS.lightGreen }}>
                      {productivityScore}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6">
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="attendance">Attendance</TabsTrigger>
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                </TabsList>

                <TabsContent value="activity">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Time Distribution Pie */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Time Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                dataKey="value"
                                label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}
                              >
                                {categoryData.map((entry, idx) => (
                                  <Cell key={`cell-${idx}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip formatter={v => formatDuration(v)} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Top Apps */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Top Applications</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer>
                            <BarChart data={topApps} margin={{ bottom: 60 }}>
                              <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                              <YAxis tickFormatter={v => formatDuration(v)} />
                              <Tooltip formatter={v => formatDuration(v)} />
                              <Bar dataKey="duration" fill={COLORS.deepBlue} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="attendance">
                  {/* Attendance summary cards + table would go here */}
                  <p className="text-center py-12 text-slate-500">
                    Attendance report view (table + stats) – implement similarly to previous version
                  </p>
                </TabsContent>

                <TabsContent value="tasks">
                  <p className="text-center py-12 text-slate-500">
                    Task analytics view (pie + bar + stats) – implement similarly to previous version
                  </p>
                </TabsContent>
              </Tabs>
            </>
          )}
        </motion.div>
      )}

      {/* Quick Links / Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition" onClick={() => navigate('/clients')}>
          <CardContent className="p-6 flex items-center gap-4">
            <Building2 className="h-8 w-8" style={{ color: COLORS.emeraldGreen }} />
            <div>
              <p className="text-2xl font-bold">{stats?.total_clients || 0}</p>
              <p className="text-sm text-slate-500">Clients</p>
            </div>
          </CardContent>
        </Card>

        {/* Add other quick cards similarly... */}
      </motion.div>
    </motion.div>
  );
}
