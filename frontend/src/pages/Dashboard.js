import React, { useState, useEffect, useMemo } from 'react';
import RoleGuard from "@/RoleGuard";
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom'; // ← added
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
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
  Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
// ── Additions for due date picker ───────────────────────────────────────────
import { CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
// ──────────────────────────────────────────────────────────────────────────────
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import {
  useDashboardStats,
  useUpcomingDueDates,
  useTodayAttendance,
} from "@/hooks/useDashboard";
import { useQueryClient } from '@tanstack/react-query';
import { useQuery, useMutation } from "@tanstack/react-query";
// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};
// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};
const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-8 border-l-red-600';
  if (p === 'urgent') return 'border-l-8 border-l-orange-500';
  if (p === 'medium') return 'border-l-8 border-l-emerald-500';
  if (p === 'low') return 'border-l-8 border-l-blue-500';
  return 'border-l-8 border-l-slate-300';
};
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status = task.status || 'pending';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 250, damping: 18 }}
      className={`relative flex flex-col p-4 rounded-xl border bg-white transition-all cursor-pointer group
        ${getPriorityStripeClass(task.priority)}
        ${isCompleted ? 'opacity-80 bg-green-50/40 border-green-200' : 'hover:shadow-lg hover:border-blue-400'}
      `}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/tasks/${task.id || ''}`);
      }}
    >
      {/* Title + Capsules */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate leading-tight transition ${
            isCompleted ? 'line-through text-slate-500' : 'text-slate-900'
          }`}>
            {task.title || 'Untitled Task'}
            {task.client_name ? ` – ${task.client_name}` : ''}
          </p>
        </div>
        {isToMe && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* IN PROGRESS */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus?.(task.id, 'in_progress');
              }}
              disabled={isInProgress || isCompleted}
              className={`w-28 text-center py-1 text-xs font-medium rounded-full transition ${
                isInProgress
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white border border-blue-400 text-blue-700 hover:bg-blue-50'
              } disabled:opacity-50`}
            >
              {isInProgress ? '✓ In Progress' : 'Start'}
            </motion.button>
            {/* DONE */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus?.(task.id, 'completed');
              }}
              disabled={isCompleted}
              className={`w-28 text-center py-1 text-xs font-medium rounded-full transition ${
                isCompleted
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
              }`}
            >
              {isCompleted ? '✓ Done' : 'Done'}
            </motion.button>
          </div>
        )}
      </div>
      {/* Meta */}
      <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          {isToMe ? 'Assigned by: ' : 'Assigned to: '}
          <span className="font-medium text-slate-700">
            {assignedName || 'Unknown'}
          </span>
        </span>
        <span>
          • {format(new Date(task.created_at || Date.now()), 'MMM d, yyyy • hh:mm a')}
        </span>
        {task.due_date && (
          <span>
            • Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
          </span>
        )}
      </div>
    </motion.div>
  );
}
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState("monthly");
  const notificationAudio = React.useRef(new Audio('/notification.mp3'));
  const [newTodo, setNewTodo] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState(undefined);
  const { data: tasks = [] } = useTasks();
  const { data: stats } = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance } = useTodayAttendance();
  const updateTaskMutation = useUpdateTask();
  const queryClient = useQueryClient();
  // Dedicated Todos Query (separate from tasks)
  const { data: todosRaw = [] } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get("/todos");
      return res.data;
    },
  });
  const tasksAssignedToMe = useMemo(() => {
    return tasks
      .filter(
        (task) =>
          task.assigned_to === user?.id &&
          task.status !== "completed"
      )
      .slice(0, 6);
  }, [tasks, user]);
  const tasksAssignedByMe = useMemo(() => {
    return tasks
      .filter(
        (task) =>
          task.created_by === user?.id &&
          task.assigned_to !== user?.id
      )
      .slice(0, 6);
  }, [tasks, user]);
  const todos = useMemo(() => {
    return todosRaw.map((todo) => ({
      ...todo,
      completed: todo.status === "completed",
    }));
  }, [todosRaw]);
  const recentTasks = useMemo(() => {
    return tasks.slice(0, 5);
  }, [tasks]);
  const getTodayDuration = () => {
    if (!todayAttendance?.punch_in) return "0h 0m";
    if (todayAttendance.punch_out) {
      const mins = todayAttendance.duration_minutes || 0;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    const diffMs = Date.now() - new Date(todayAttendance.punch_in).getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}m`;
  };
  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATED: Fetch Star Performers from NEW backend endpoint (no original lines deleted)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchRankings() {
      try {
        const apiPeriod = rankingPeriod === "all" ? "all_time" : rankingPeriod;
        const rankingRes = await api.get("/api/reports/performance-rankings", {
          params: {
            period: apiPeriod,
          },
        });
        setRankings(rankingRes.data || []);
      } catch (rankErr) {
        console.warn("Rankings endpoint failed:", rankErr);
        setRankings([]);
      }
    }
    fetchRankings();
  }, [rankingPeriod]);
  // Create Todo
  const createTodo = useMutation({
    mutationFn: (data) => api.post("/todos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo added successfully!");
    },
    onError: () => toast.error("Failed to add todo"),
  });
  // Update Todo
  const updateTodo = useMutation({
    mutationFn: ({ id, status }) =>
      api.put(`/todos/${id}`, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });
  // Delete Todo
  const deleteTodo = useMutation({
    mutationFn: (id) => api.delete(`/todos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo deleted successfully!");
    },
    onError: () => toast.error("Failed to delete todo"),
  });
  const addTodo = () => {
    if (!newTodo.trim()) return;
    const todoPayload = {
      title: newTodo.trim(),
      status: "pending",
      due_date: selectedDueDate
        ? selectedDueDate.toISOString()
        : null,
    };
    createTodo.mutate(todoPayload);
    setNewTodo("");
    setSelectedDueDate(undefined);
  };
  const updateAssignedTaskStatus = (taskId, newStatus) => {
    updateTaskMutation.mutate({
      id: taskId,
      data: {
        status: newStatus,
        updated_at: new Date().toISOString()
      },
    }, {
      onSuccess: () => {
        toast.success(`Task marked as ${newStatus === 'completed' ? 'Done' : 'In Progress'}!`);
      },
      onError: (error) => {
        console.error('Failed to update task status:', error);
        toast.error('Failed to update task');
      }
    });
  };
  const handleToggleTodo = (id) => {
    const todo = todosRaw.find((t) => t.id === id);
    if (!todo) return;
    const newStatus =
      todo.status === "completed" ? "pending" : "completed";
    updateTodo.mutate({ id, status: newStatus });
  };
  const handleDeleteTodo = (id) => {
    deleteTodo.mutate(id);
  };
  const handlePunchAction = async (action) => {
    try {
      setLoading(true);
      await api.post('/attendance', { action });
      toast.success(action === 'punch_in' ? 'Punched in successfully!' : 'Punched out successfully!');
      queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance');
    } finally {
      setLoading(false);
    }
    navigate('/attendance');
  };
  const getStatusStyle = (status) => {
    const styles = {
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
      pending: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
    };
    return styles[status] || styles.pending;
  };
  const getPriorityStyle = (priority) => {
    const styles = {
      high: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
      medium: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
      low: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    };
    return styles[priority] || styles.medium;
  };
  const getDeadlineColor = (daysLeft) => {
    if (daysLeft <= 0) {
      return {
        bg: 'bg-red-50 border-red-200 hover:bg-red-100',
        badge: 'bg-red-500 text-white',
        text: 'text-red-600'
      };
    }
    if (daysLeft <= 7) {
      return {
        bg: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
        badge: 'bg-orange-500 text-white',
        text: 'text-orange-600'
      };
    }
    if (daysLeft <= 15) {
      return {
        bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
        badge: 'bg-yellow-500 text-white',
        text: 'text-yellow-600'
      };
    }
    if (daysLeft >= 31) {
      return {
        bg: 'bg-green-100 border-green-300 hover:bg-green-200',
        badge: 'bg-green-600 text-white',
        text: 'text-green-700'
      };
    }
    return {
      bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
      badge: 'bg-yellow-500 text-white',
      text: 'text-yellow-600'
    };
  };
  // ── New helper for overdue check ───────────────────────────────────────────
  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };
  // ────────────────────────────────────────────────────────────────────────────
  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats?.completed_tasks / stats?.total_tasks) * 100)
    : 0;
  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) => prev.days_remaining < curr.days_remaining ? prev : curr)
    : null;
  const isAdmin = user?.role === 'admin';
  const showTaskSection = isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;
  const [defaultGroup, setDefaultGroup] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // REFACTORED STAR PERFORMERS DISPLAY (clean, modern, using exact backend fields)
  // ─────────────────────────────────────────────────────────────────────────────
  const RankingItem = React.memo(({ member, index, period }) => {
    const isTop = index === 0;
    const isSecond = index === 1;
    const isThird = index === 2;
    const rank = index + 1;

    const getMedal = () => {
      if (isTop) return '🥇';
      if (isSecond) return '🥈';
      if (isThird) return '🥉';
      return `#${rank}`;
    };

    const getBgClass = () => {
      if (isTop) return "bg-gradient-to-r from-yellow-100 via-amber-50 to-yellow-50 border-yellow-300 shadow-md";
      if (isSecond) return "bg-gradient-to-r from-slate-200 via-slate-100 to-gray-200 border-slate-300";
      if (isThird) return "bg-gradient-to-r from-amber-200 via-amber-100 to-orange-200 border-amber-300";
      return "bg-slate-50 border-slate-200 hover:bg-slate-100";
    };

    return (
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${getBgClass()}`}
      >
        <div className="flex items-center gap-4">
          <div className="w-9 text-2xl font-bold text-center">
            {getMedal()}
          </div>
          <div className={`w-12 h-12 rounded-2xl overflow-hidden ring-2 flex-shrink-0 ${isTop ? 'ring-yellow-400' : 'ring-slate-200'}`}>
            {member.profile_picture ? (
              <img
                src={member.profile_picture}
                alt={member.user_name || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center text-white font-semibold text-2xl ${isTop ? 'bg-yellow-500' : 'bg-slate-700'}`}>
                {member.user_name ? member.user_name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
          </div>
          <div>
            <p className={`font-semibold text-lg ${isTop ? 'text-yellow-800' : 'text-slate-900'}`}>
              {member.user_name || 'Unknown User'}
            </p>
            <p className="text-xs text-slate-500">Team Member</p>
            {/* ── NEW: Badge & Score from backend ───────────────────────────────── */}
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs font-medium">
                {member.badge || 'Good Performer'}
              </Badge>
              <span className="text-emerald-600 font-bold text-sm">
                {member.overall_score}%
              </span>
            </div>
            {/* ──────────────────────────────────────────────────────────────── */}
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold tracking-tighter ${isTop ? 'text-yellow-700' : 'text-emerald-700'}`}>
            {member.total_hours
              ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
              : '0h 00m'}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            this {period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'period'}
          </p>
        </div>
      </motion.div>
    );
  });

  return (
    <motion.div
      className="space-y-4 sm:space-y-6"
      data-testid="dashboard-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Banner */}
      <motion.div variants={itemVariants}>
        <Card
          className="border-0 shadow-lg overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          }}
        >
          <div
            className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-20 -mr-16 -mt-16"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
          />
          <CardContent className="p-4 sm:p-8 relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-outfit tracking-tight" style={{ color: COLORS.deepBlue }}>
                  Welcome back, {user?.full_name?.split(' ')[0] || 'User'}
                </h1>
                <p className="text-slate-600 mt-2 text-base sm:text-lg">
                  Here's what's happening with your firm's compliance and tasks today, {format(new Date(), 'MMMM d, yyyy')}.
                </p>
              </div>
              {nextDeadline && (
                <div
                  className="flex items-center gap-4 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl border-2 cursor-pointer hover:shadow-md transition-all"
                  style={{ borderColor: COLORS.mediumBlue, backgroundColor: 'white' }}
                  onClick={() => navigate('/duedates')}
                  data-testid="next-deadline-card"
                >
                  <Calendar className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: COLORS.mediumBlue }} />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Next Filing Deadline</p>
                    <p className="font-bold text-base sm:text-lg" style={{ color: COLORS.deepBlue }}>
                      {format(new Date(nextDeadline.due_date), 'MMM d')}: {nextDeadline.title?.slice(0, 15) || 'Deadline'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      {/* Key Metrics Row */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4" variants={itemVariants}>
        <Card
          className="border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all duration-200 cursor-pointer group rounded-2xl h-full"
          onClick={() => navigate('/tasks')}
          data-testid="stat-total-tasks"
        >
          <CardContent className="p-4 sm:p-6 h-full flex flex-col">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wider">Total Tasks</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                  {stats?.total_tasks || 0}
                </p>
              </div>
              <div
                className="p-2 sm:p-3 rounded-xl sm:rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: `${COLORS.deepBlue}15` }}
              >
                <Briefcase className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs sm:text-sm text-slate-500 group-hover:text-slate-700">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`border hover:shadow-lg transition-all duration-200 cursor-pointer group rounded-2xl h-full ${
            stats?.overdue_tasks > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
          }`}
          onClick={() => navigate('/tasks')}
          data-testid="stat-overdue-tasks"
        >
          <CardContent className="p-4 sm:p-6 h-full flex flex-col">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wider">Overdue Tasks</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-2 font-outfit" style={{ color: COLORS.coral }}>
                  {stats?.overdue_tasks || 0}
                </p>
              </div>
              <div
                className="p-2 sm:p-3 rounded-xl sm:rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: `${COLORS.coral}15` }}
              >
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: COLORS.coral }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs sm:text-sm text-slate-500 group-hover:text-slate-700">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all duration-200 cursor-pointer group rounded-2xl h-full"
          onClick={() => navigate('/tasks')}
          data-testid="stat-completion-rate"
        >
          <CardContent className="p-4 sm:p-6 h-full flex flex-col">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wider">Completion Rate</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                  {completionRate}%
                </p>
              </div>
              <div
                className="p-2 sm:p-3 rounded-xl sm:rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}
              >
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs sm:text-sm text-slate-500 group-hover:text-slate-700">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`border hover:shadow-lg transition-all duration-200 cursor-pointer group rounded-2xl h-full ${
            stats?.expiring_dsc_count > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
          }`}
          onClick={() => navigate('/dsc?tab=expired')}
        >
          <CardContent className="p-4 sm:p-6 h-full flex flex-col">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wider">
                  DSC Alerts
                </p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-2 font-outfit text-red-600">
                  {(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {stats?.expired_dsc_count || 0} Expired • {stats?.expiring_dsc_count || 0} Expiring
                </p>
              </div>
              <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-red-100 group-hover:scale-110 transition-transform flex-shrink-0">
                <Key className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs sm:text-sm text-slate-500 group-hover:text-slate-700">
              <span>View alerts</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all duration-200 cursor-pointer group rounded-2xl h-full"
          onClick={() => navigate('/attendance')}
          data-testid="stat-attendance"
        >
          <CardContent className="p-4 sm:p-6 h-full flex flex-col">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wider">Today's Attendance</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-2 font-outfit" style={{ color: COLORS.deepBlue }}>
                  {todayAttendance?.duration_minutes ? `${Math.floor(todayAttendance.duration_minutes / 60)}h ${todayAttendance.duration_minutes % 60}m` : '0h'}
                </p>
              </div>
              <div
                className="p-2 sm:p-3 rounded-xl sm:rounded-2xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: `${COLORS.amber}15` }}
              >
                <Clock className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: COLORS.amber }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs sm:text-sm text-slate-500 group-hover:text-slate-700">
              <span>View details</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
      {/* Recent Tasks + Upcoming Deadlines + Attendance */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6" variants={itemVariants}>
        <Card
          className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden"
          data-testid="recent-tasks-card"
        >
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-500" />
                Recent Tasks
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/tasks')}
                className="text-blue-600 hover:text-blue-700"
              >
                View All
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Your latest assignments and progress
            </p>
          </CardHeader>
          <CardContent className="p-4">
            {recentTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No recent tasks
              </div>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((task) => {
                  const statusStyle = getStatusStyle(task.status);
                  const priorityStyle = getPriorityStyle(task.priority);
                  return (
                    <div
                      key={task.id}
                      className={`py-2 px-3 rounded-lg border cursor-pointer hover:shadow-md hover:border-blue-300 transition ${priorityStyle.bg} ${priorityStyle.border}`}
                      onClick={() => navigate('/tasks')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm text-slate-900 truncate">
                          {task.title || 'Untitled Task'}
                        </p>
                        <Badge
                          variant="secondary"
                          className={`${statusStyle.bg} ${statusStyle.text} text-xs font-medium w-28 justify-center`}
                        >
                          {task.status?.replace('_', ' ')?.toUpperCase() || 'PENDING'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Calendar className="h-3 w-3" />
                        {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'No due date'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden"
          data-testid="upcoming-duedates-card"
        >
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-500" />
                Upcoming Deadlines
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/duedates')}
                className="text-blue-600 hover:text-blue-700"
              >
                View All
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Next 30 days compliance calendar
            </p>
          </CardHeader>
          <CardContent className="p-4">
            {upcomingDueDates.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No Upcoming Deadlines
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingDueDates.map((due) => {
                  const color = getDeadlineColor(due.days_remaining || 0);
                  return (
                    <div
                      key={due.id}
                      className={`py-2 px-3 rounded-lg border cursor-pointer hover:shadow-md hover:border-orange-300 transition ${color.bg}`}
                      onClick={() => navigate('/duedates')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm text-slate-900 truncate">
                          {due.title || 'Untitled Due Date'}
                        </p>
                        <Badge className={`${color.badge} text-xs font-medium w-24 justify-center`}>
                          {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(due.due_date), 'MMM d, yyyy')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden"
          data-testid="attendance-card"
        >
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-500" />
                Attendance
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/attendance')}
                className="text-blue-600 hover:text-blue-700"
              >
                View Log
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Track your daily work hours
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              {todayAttendance?.punch_in ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <LogIn className="h-4 w-4 text-green-500" />
                      Punch In
                    </div>
                    <p className="text-sm font-medium">
                      {format(new Date(todayAttendance.punch_in), 'hh:mm a')}
                    </p>
                  </div>
                  {todayAttendance?.punch_out ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <LogOut className="h-4 w-4 text-red-500" />
                        Punch Out
                      </div>
                      <p className="text-sm font-medium">
                        {format(new Date(todayAttendance.punch_out), 'hh:mm a')}
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handlePunchAction('punch_out')}
                      className="w-full bg-red-600 hover:bg-red-700"
                      disabled={loading}
                    >
                      Punch Out
                    </Button>
                  )}
                  <div className="text-center py-3 bg-slate-50 rounded-xl">
                    <p className="text-sm text-slate-500">Total Hours Today</p>
                    <p className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>{getTodayDuration()}</p>
                  </div>
                </>
              ) : (
                <Button
                  onClick={() => handlePunchAction('punch_in')}
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={loading}
                >
                  Punch In
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      {/* Tasks Assigned – Two Column Layout */}
      {showTaskSection && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Tasks Assigned to Me */}
          <Card
            onClick={() => navigate('/tasks')}
            className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition"
          >
            <CardHeader className="pb-4 border-b border-slate-100 px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl font-semibold flex items-center gap-3">
                <Briefcase className="h-6 w-6 text-emerald-600" />
                Tasks Assigned to Me
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">Tasks others assigned to you</p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 flex-1">
              {tasksAssignedToMe.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No tasks assigned to you yet
                </div>
              ) : (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                  {tasksAssignedToMe.map((task) => (
                    <TaskStrip
                      key={task.id}
                      task={task}
                      isToMe={true}
                      assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
                      onUpdateStatus={updateAssignedTaskStatus}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {/* Tasks Assigned by Me */}
          <Card
            onClick={() => navigate('/tasks')}
            className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition"
          >
            <CardHeader className="pb-4 border-b border-slate-100 px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl font-semibold flex items-center gap-3">
                <Briefcase className="h-6 w-6 text-blue-600" />
                Tasks Assigned by Me
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">Tasks you assigned to others</p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 flex-1">
              {tasksAssignedByMe.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  You haven't assigned any tasks yet
                </div>
              ) : (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                  {tasksAssignedByMe.map((task) => (
                    <TaskStrip
                      key={task.id}
                      task={task}
                      isToMe={false}
                      assignedName={task.assigned_to_name || 'Unknown'}
                      onUpdateStatus={updateAssignedTaskStatus}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
      {/* Star Performers + My To-Do List */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-8">
        <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden" data-testid="staff-ranking-card">
          <CardHeader className="pb-3 sm:pb-4 border-b border-slate-100 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-yellow-500" />
                Star Performers
              </CardTitle>
              {user?.role === 'admin' && (
                <div className="flex gap-1 sm:gap-2">
                  {["all", "monthly", "weekly"].map(p => (
                    <Button
                      key={p}
                      variant={rankingPeriod === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRankingPeriod(p)}
                      className="text-xs sm:text-sm px-3 py-1"
                    >
                      {p.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Recognizing top contributors based on performance metrics
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {rankings.length === 0 ? (
              <div className="text-center py-10 sm:py-12 text-slate-400 text-sm sm:text-base">
                No ranking data available
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2">
                {rankings.slice(0, 5).map((member, index) => (
                  <RankingItem
                    key={member.user_id || index}
                    member={member}
                    index={index}
                    period={rankingPeriod}
                  />
                ))}
              </div>
            )}
            {rankings.length > 5 && (
              <div className="text-right mt-4">
                <button onClick={() => navigate('/reports')} className="text-sm text-blue-600 hover:underline">
                  View All Rankings →
                </button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden" data-testid="todo-list-card">
          <CardHeader className="pb-3 sm:pb-4 border-b border-slate-100 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-blue-500" />
                My To-Do List
              </CardTitle>
              {user?.role === 'admin' && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/todo-list')}>
                  View All
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Manage your personal tasks</p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add new task..."
                className="flex-1 p-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
              />
              {/* ── Due date picker button ──────────────────────────────────────── */}
              <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      "border-slate-300",
                      !selectedDueDate && "text-slate-400"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDueDate}
                    onSelect={(date) => {
                      setSelectedDueDate(date);
                      setShowDueDatePicker(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {/* ────────────────────────────────────────────────────────────────── */}
              <Button onClick={addTodo} disabled={!newTodo.trim()} className="px-6">Add</Button>
              {/* ── Show selected due date ──────────────────────────────────────── */}
              {selectedDueDate && (
                <span className="text-xs text-slate-500 self-center ml-2">
                  Due: {format(selectedDueDate, 'MMM d, yyyy')}
                </span>
              )}
              {/* ────────────────────────────────────────────────────────────────── */}
            </div>
            {todos.length === 0 ? (
              <div className="text-center py-10 sm:py-12 text-slate-400 text-sm sm:text-base">
                No tasks added yet
              </div>
            ) : (
              <div className="space-y-3 max-h-[320px] sm:max-h-[420px] overflow-y-auto pr-2">
                {todos.map((todo) => (
                  <div
                    key={todo._id}
                    className={`flex items-center justify-between gap-3 p-4 rounded-2xl border ${
                      todo.completed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                    } ${!todo.completed && isOverdue(todo.due_date) ? 'border-red-400 bg-red-50/60' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggleTodo(todo._id)}
                        className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 accent-emerald-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`block text-sm sm:text-base ${todo.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {todo.title}
                          {/* ── Overdue badge ──────────────────────────────────────── */}
                          {!todo.completed && isOverdue(todo.due_date) && (
                            <span className="inline-block ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                              Overdue
                            </span>
                          )}
                          {/* ──────────────────────────────────────────────────────── */}
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Added: {todo.created_at ? format(new Date(todo.created_at), 'MMM d, yyyy') : 'Recently added'}
                        </p>
                        {/* ── Due date display with overdue coloring ────────────────── */}
                        {todo.due_date && isOverdue(todo.due_date) && (
                          <p className="text-xs text-red-600 font-medium mt-0.5">
                            Due: {format(new Date(todo.due_date), 'MMM d, yyyy')} (overdue)
                          </p>
                        )}
                        {todo.due_date && !isOverdue(todo.due_date) && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            Due: {format(new Date(todo.due_date), 'MMM d, yyyy')}
                          </p>
                        )}
                        {/* ──────────────────────────────────────────────────────────── */}
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteTodo(todo._id)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      {/* Quick Access Row */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" variants={itemVariants}>
        <Card
          className="border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
          onClick={() => navigate('/clients')}
          data-testid="quick-clients"
        >
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div
              className="p-3 rounded-xl group-hover:scale-110 transition-transform"
              style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}
            >
              <Building2 className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
            </div>
            <div>
              <p className="text-2xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>
                {stats?.total_clients || 0}
              </p>
              <p className="text-sm text-slate-500">Clients</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
          onClick={() => navigate('/dsc')}
          data-testid="quick-dsc"
        >
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div
              className={`p-3 rounded-xl group-hover:scale-110 transition-transform ${
                stats?.expiring_dsc_count > 0 ? 'bg-red-100' : 'bg-slate-100'
              }`}
            >
              <Key className={`h-5 w-5 ${stats?.expiring_dsc_count > 0 ? 'text-red-600' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>
                {stats?.total_dsc || 0}
              </p>
              <p className="text-sm text-slate-500">DSC Certificates</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
          onClick={() => navigate('/duedates')}
          data-testid="quick-duedates"
        >
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div
              className={`p-3 rounded-xl group-hover:scale-110 transition-transform ${
                stats?.upcoming_due_dates > 0 ? 'bg-amber-100' : 'bg-slate-100'
              }`}
            >
              <Calendar className={`h-5 w-5 ${stats?.upcoming_due_dates > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>
                {stats?.upcoming_due_dates || 0}
              </p>
              <p className="text-sm text-slate-500">Compliance Calendar</p>
            </div>
          </CardContent>
        </Card>
        {user?.role === 'admin' && (
          <Card
            className="border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
            onClick={() => navigate('/users')}
            data-testid="quick-users"
          >
            <CardContent className="p-4 sm:p-5 flex items-center gap-4">
              <div
                className="p-3 rounded-xl group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${COLORS.mediumBlue}15` }}
              >
                <Users className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              </div>
              <div>
                <p className="text-2xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>
                  {stats?.team_workload?.length || 0}
                </p>
                <p className="text-sm text-slate-500">Team Members</p>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </motion.div>
  );
}
