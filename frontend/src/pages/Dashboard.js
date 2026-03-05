import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import RoleGuard from "@/RoleGuard";
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { cn } from "@/lib/utils";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useDashboardStats,
  useUpcomingDueDates,
  useTodayAttendance,
} from "@/hooks/useDashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckSquare,
  FileText,
  Clock,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  Calendar as CalendarIcon,
  Users,
  Key,
  Briefcase,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Target,
  Activity,
  Sun,
  Moon,
} from 'lucide-react';

// ── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};

// ── Spring Physics (for Framer Motion) ──────────────────────────────────────
const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: "spring", stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: "spring", stiffness: 400, damping: 28 },
  icon: { type: "spring", stiffness: 450, damping: 25 },
  tap: { type: "spring", stiffness: 500, damping: 30 }
};

// ── Animation Variants ──────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] }
  },
  exit: { opacity: 0, y: 12, transition: { duration: 0.3 } }
};

// ── Priority Stripe Helper ──────────────────────────────────────────────────
const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-4 border-l-red-500';
  if (p === 'urgent') return 'border-l-4 border-l-orange-500';
  if (p === 'medium') return 'border-l-4 border-l-emerald-500';
  if (p === 'low') return 'border-l-4 border-l-blue-400';
  return 'border-l-4 border-l-slate-300 dark:border-l-slate-600';
};

// ── Task Strip Component ────────────────────────────────────────────────────
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status = task.status || 'pending';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.005, transition: springPhysics.lift }}
      whileTap={{ scale: 0.985, transition: springPhysics.tap }}
      className={`relative flex flex-col p-4 rounded-xl border bg-white dark:bg-gray-800 transition-all cursor-pointer group
        ${getPriorityStripeClass(task.priority)}
        ${isCompleted
          ? 'opacity-75 bg-green-50/40 dark:bg-green-900/10 border-green-200 dark:border-green-800'
          : 'hover:shadow-lg border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'}
      `}
      onClick={() => navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm truncate leading-tight transition ${
            isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
          }`}>
            {task.title || 'Untitled Task'}
            {task.client_name ? ` — ${task.client_name}` : ''}
          </p>
        </div>
        {isToMe && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92, transition: springPhysics.button }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateStatus?.(task.id, 'in_progress'); }}
              disabled={isCompleted}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                isInProgress
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
              } disabled:opacity-40`}
            >
              {isInProgress ? '✓ In Progress' : 'Start'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92, transition: springPhysics.button }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateStatus?.(task.id, 'completed'); }}
              disabled={isCompleted}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                isCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-gray-700 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
              }`}
            >
              {isCompleted ? '✓ Done' : 'Done'}
            </motion.button>
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          {isToMe ? 'From: ' : 'To: '}
          <span className="font-medium text-slate-600 dark:text-slate-300">{assignedName || 'Unknown'}</span>
        </span>
        <span>· {format(new Date(task.created_at || Date.now()), 'MMM d')}</span>
        {task.due_date && (
          <span className={new Date(task.due_date) < new Date() ? 'text-red-500 font-medium' : ''}>
            · Due: {format(new Date(task.due_date), 'MMM d')}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── Theme Toggle Component ──────────────────────────────────────────────────
function ThemeToggle({ dark, onToggle }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onToggle}
      className="relative w-12 h-6 rounded-full flex items-center transition-colors duration-300 focus:outline-none"
      style={{ background: dark ? '#3B82F6' : '#CBD5E1' }}
      aria-label="Toggle theme"
    >
      <motion.div
        className="absolute w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center"
        animate={{ x: dark ? 24 : 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        {dark
          ? <Moon className="w-3 h-3 text-blue-500" />
          : <Sun className="w-3 h-3 text-amber-500" />
        }
      </motion.div>
    </motion.button>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, alert, onClick }) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: springPhysics.card }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`rounded-2xl border cursor-pointer group transition-all duration-200
        ${alert
          ? 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10'
          : 'border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 hover:border-blue-200 dark:hover:border-blue-700'}
        hover:shadow-lg`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-xl transition-transform group-hover:scale-110`}
            style={{ background: `${color}18` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
        </div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white" style={{ color: alert ? COLORS.coral : undefined }}>{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </CardContent>
    </motion.div>
  );
}

// ── Section Header ──────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, iconColor, title, subtitle, action, onAction }) {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700/60 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg" style={{ background: `${iconColor}18` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <button onClick={onAction}
          className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}

// ── Ranking Item (Memoized) ─────────────────────────────────────────────────
const RankingItem = React.memo(({ member, index, period }) => {
  const rank = index + 1;
  const medals = ['🥇', '🥈', '🥉'];
  const getMedal = () => rank <= 3 ? medals[rank - 1] : `#${rank}`;

  const bgClass = index === 0
    ? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 border-amber-200 dark:border-amber-700/40"
    : index === 1
    ? "bg-gradient-to-r from-slate-50 to-gray-50 dark:from-gray-700/40 dark:to-gray-700/20 border-slate-200 dark:border-gray-600/40"
    : index === 2
    ? "bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/10 border-orange-200 dark:border-orange-700/40"
    : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/40";

  return (
    <motion.div
      whileHover={{ y: -2, transition: springPhysics.lift }}
      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${bgClass}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl w-7 text-center">{getMedal()}</span>
        <div className={`w-10 h-10 rounded-xl overflow-hidden ring-2 flex-shrink-0 ${
          index === 0 ? 'ring-amber-300 dark:ring-amber-600' : 'ring-gray-200 dark:ring-gray-600'
        }`}>
          {member.profile_picture ? (
            <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-white font-bold text-base ${
              index === 0 ? 'bg-amber-500' : 'bg-slate-600 dark:bg-slate-500'
            }`}>
              {member.user_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white">{member.user_name || 'Unknown'}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{member.overall_score}%</span>
            <Badge variant="outline" className="text-xs py-0 px-1.5 h-4 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400">
              {member.badge || 'Performer'}
            </Badge>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-base font-bold ${index === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {member.total_hours
            ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
            : '0h 00m'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">this {period === 'weekly' ? 'week' : 'month'}</p>
      </div>
    </motion.div>
  );
});

// ── Quick Access Tile ───────────────────────────────────────────────────────
function QuickTile({ icon: Icon, label, value, color, alert, onClick }) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: springPhysics.card }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`rounded-2xl border cursor-pointer group transition-all duration-200 hover:shadow-lg
        ${alert ? 'border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10'
          : 'border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 hover:border-blue-200 dark:hover:border-blue-700'}`}
    >
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl group-hover:scale-110 transition-transform`}
          style={{ background: `${color}18` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{label}</p>
        </div>
      </CardContent>
    </motion.div>
  );
}

// ── Main Dashboard Component ────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState("monthly");
  const [newTodo, setNewTodo] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState(undefined);
  const [mustPunchIn, setMustPunchIn] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dashboard-theme') === 'dark');

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('dashboard-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('dashboard-theme', 'light');
    }
  }, [darkMode]);

  const { data: tasks = [] } = useTasks();
  const { data: stats } = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance } = useTodayAttendance();
  const updateTaskMutation = useUpdateTask();

  const { data: todosRaw = [] } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get("/todos");
      return res.data;
    },
  });

  const todos = useMemo(() =>
    todosRaw.map(todo => ({ ...todo, completed: todo.status === "completed" })),
    [todosRaw]
  );

  const tasksAssignedToMe = useMemo(() =>
    tasks.filter(t => t.assigned_to === user?.id && t.status !== "completed").slice(0, 6),
    [tasks, user?.id]
  );

  const tasksAssignedByMe = useMemo(() =>
    tasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id).slice(0, 6),
    [tasks, user?.id]
  );

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  useEffect(() => {
    async function fetchRankings() {
      try {
        const period = rankingPeriod === "all" ? "all_time" : rankingPeriod;
        const res = await api.get("/reports/performance-rankings", { params: { period } });
        setRankings(res.data || []);
      } catch (err) {
        console.warn("Failed to fetch rankings:", err);
        setRankings([]);
      }
    }
    fetchRankings();
  }, [rankingPeriod]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const createTodo = useMutation({
    mutationFn: data => api.post("/todos", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["todos"] }); toast.success("Todo added"); },
    onError: () => toast.error("Failed to add todo"),
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/todos/${id}`, { is_completed: status === "completed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const deleteTodo = useMutation({
    mutationFn: id => api.delete(`/todos/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["todos"] }); toast.success("Todo deleted"); },
    onError: () => toast.error("Failed to delete todo"),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const addTodo = () => {
    if (!newTodo.trim()) return;
    createTodo.mutate({
      title: newTodo.trim(),
      status: "pending",
      due_date: selectedDueDate ? selectedDueDate.toISOString() : null,
    });
    setNewTodo("");
    setSelectedDueDate(undefined);
  };

  const handleToggleTodo = (id) => {
    const todo = todosRaw.find(t => t.id === id || t._id === id);
    if (!todo) return;
    const newStatus = todo.status === "completed" ? "pending" : "completed";
    updateTodo.mutate({ id: todo.id || todo._id, status: newStatus });
  };

  const handleDeleteTodo = (id) => { deleteTodo.mutate(id); };

  const updateAssignedTaskStatus = (taskId, newStatus) => {
    updateTaskMutation.mutate(
      { id: taskId, data: { status: newStatus, updated_at: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast.success(newStatus === 'completed' ? 'Task completed!' : 'Task in progress!');
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        },
        onError: (err) => {
          console.error("Update Error:", err);
          toast.error(err.response?.data?.detail || 'Failed to update task');
        },
      }
    );
  };

  const handlePunchAction = async (action) => {
    setLoading(true);
    try {
      await api.post('/attendance', { action });
      toast.success(action === 'punch_in' ? 'Punched in successfully!' : 'Punched out successfully!');
      queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Attendance action failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Utility ───────────────────────────────────────────────────────────────
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

  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100) : 0;

  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) => prev.days_remaining < curr.days_remaining ? prev : curr)
    : null;

  const isAdmin = user?.role === 'admin';
  const showTaskSection = isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;
  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  const getStatusStyle = (status) => {
    const styles = {
      completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
      in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
      pending: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300' },
    };
    return styles[status] || styles.pending;
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      high: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600', border: 'border-red-200 dark:border-red-800' },
      medium: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600', border: 'border-amber-200 dark:border-amber-800' },
      low: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600', border: 'border-blue-200 dark:border-blue-800' },
    };
    return styles[priority?.toLowerCase()] || styles.medium;
  };

  const getDeadlineColor = (daysLeft) => {
    if (daysLeft <= 0) return { bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', badge: 'bg-red-500 text-white' };
    if (daysLeft <= 7) return { bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', badge: 'bg-orange-500 text-white' };
    if (daysLeft <= 15) return { bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800', badge: 'bg-yellow-500 text-white' };
    return { bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', badge: 'bg-green-600 text-white' };
  };

  const formatToLocalTime = (dateString) => {
    if (!dateString) return "--:--";
    const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    return format(date, 'hh:mm a');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning ☀️";
    if (hour < 17) return "Good Afternoon 🌤️";
    if (hour < 21) return "Good Evening 🌆";
    return "Working Late? 🌙";
  };

  useEffect(() => {
    if (!todayAttendance) { setMustPunchIn(false); document.body.style.overflow = "auto"; return; }
    if (todayAttendance.status === "leave" || todayAttendance.status === "holiday") {
      setMustPunchIn(false); document.body.style.overflow = "auto"; return;
    }
    if (todayAttendance.status === "absent" && !todayAttendance.punch_in) {
      setMustPunchIn(true); document.body.style.overflow = "hidden";
    } else {
      setMustPunchIn(false); document.body.style.overflow = "auto";
    }
    return () => { document.body.style.overflow = "auto"; };
  }, [todayAttendance]);

  // ── JSX Render ────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-5 bg-gray-50/50 dark:bg-gray-900 min-h-screen p-1"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header Bar ─── */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Welcome Banner */}
          <div className="rounded-2xl overflow-hidden relative"
            style={{ background: darkMode
              ? 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0D3B66 100%)'
              : 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 50%, #1a5fa5 100%)' }}>
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 -mr-20 -mt-20 bg-white" />
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-5 -ml-10 -mb-10 bg-blue-300" />
            <CardContent className="p-6 relative">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div>
                  <p className="text-blue-200/80 text-xs font-semibold uppercase tracking-widest mb-1">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    {getGreeting()}, {user?.full_name?.split(' ')[0] || 'User'}
                  </h1>
                  <p className="text-blue-200/70 mt-1 text-sm">
                    {stats?.pending_tasks || 0} pending · {stats?.overdue_tasks || 0} overdue · {completionRate}% completion rate
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {nextDeadline && (
                    <motion.div
                      whileHover={{ scale: 1.02, y: -1 }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm cursor-pointer hover:bg-white/20 transition-all"
                      onClick={() => navigate('/duedates')}
                    >
                      <CalendarIcon className="h-5 w-5 text-blue-200" />
                      <div>
                        <p className="text-xs text-blue-200/70 font-medium">Next Deadline</p>
                        <p className="font-semibold text-white text-sm">
                          {format(new Date(nextDeadline.due_date), 'MMM d')} · {nextDeadline.title?.slice(0, 18) || 'Deadline'}
                        </p>
                      </div>
                    </motion.div>
                  )}
                  {/* Theme Toggle */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20">
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <ThemeToggle dark={darkMode} onToggle={() => setDarkMode(d => !d)} />
                    <Moon className="w-3.5 h-3.5 text-blue-300" />
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </div>
      </motion.div>

      {/* ── Key Metrics ─── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" variants={itemVariants}>
        <StatCard label="Total Tasks" value={stats?.total_tasks || 0} icon={Briefcase}
          color={COLORS.deepBlue} onClick={() => navigate('/tasks')} />
        <StatCard label="Overdue" value={stats?.overdue_tasks || 0} icon={AlertCircle}
          color={COLORS.coral} alert={(stats?.overdue_tasks || 0) > 0} onClick={() => navigate('/tasks?filter=overdue')} />
        <StatCard label="Completion" value={`${completionRate}%`} icon={TrendingUp}
          color={COLORS.emeraldGreen} onClick={() => navigate('/tasks')} />
        <StatCard label="DSC Alerts"
          value={(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
          sub={`${stats?.expired_dsc_count || 0} expired · ${stats?.expiring_dsc_count || 0} expiring`}
          icon={Key} color="#EF4444"
          alert={((stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)) > 0}
          onClick={() => navigate('/dsc?tab=expired')} />
        <StatCard label="Today's Hours" value={getTodayDuration()} icon={Clock}
          color={COLORS.amber} onClick={() => navigate('/attendance')} />
      </motion.div>

      {/* ── Recent Tasks + Deadlines + Attendance ─── */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={itemVariants}>

        {/* Recent Tasks */}
        <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
          <CardContent className="p-5">
            <SectionHeader icon={Target} iconColor={COLORS.mediumBlue} title="Recent Tasks"
              subtitle="Latest assignments" action="View All" onAction={() => navigate('/tasks')} />
            {recentTasks.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No recent tasks</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                <AnimatePresence>
                  {recentTasks.map(task => {
                    const statusStyle = getStatusStyle(task.status);
                    const priorityStyle = getPriorityStyle(task.priority);
                    return (
                      <motion.div key={task.id} variants={itemVariants} whileHover={{ y: -1 }}
                        className={`py-3 px-3.5 rounded-xl border cursor-pointer transition hover:shadow-sm ${priorityStyle.bg} ${priorityStyle.border}`}
                        onClick={() => navigate('/tasks')}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-xs text-gray-900 dark:text-white truncate flex-1 mr-2">{task.title || 'Untitled'}</p>
                          <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs shrink-0`}>
                            {task.status?.replace('_', ' ') || 'PENDING'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                          <CalendarIcon className="h-3 w-3" />
                          {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'No due date'}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
          <CardContent className="p-5">
            <SectionHeader icon={CalendarIcon} iconColor="#F97316" title="Upcoming Deadlines"
              subtitle="Compliance calendar" action="View All" onAction={() => navigate('/duedates')} />
            {upcomingDueDates.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No upcoming deadlines</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                <AnimatePresence>
                  {upcomingDueDates.map(due => {
                    const color = getDeadlineColor(due.days_remaining || 0);
                    return (
                      <motion.div key={due.id} variants={itemVariants} whileHover={{ y: -1 }}
                        className={`py-3 px-3.5 rounded-xl border cursor-pointer transition hover:shadow-sm ${color.bg}`}
                        onClick={() => navigate('/duedates')}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-xs text-gray-900 dark:text-white truncate flex-1 mr-2">{due.title || 'Untitled'}</p>
                          <Badge className={`${color.badge} text-xs shrink-0`}>
                            {due.days_remaining > 0 ? `${due.days_remaining}d` : 'Overdue'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                          <CalendarIcon className="h-3 w-3" />
                          {format(new Date(due.due_date), 'MMM d, yyyy')}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
          <CardContent className="p-5">
            <SectionHeader icon={Activity} iconColor="#8B5CF6" title="Attendance"
              subtitle="Daily work hours" action="View Log" onAction={() => navigate('/attendance')} />
            <div className="space-y-3">
              {todayAttendance?.punch_in ? (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <LogIn className="h-4 w-4" />
                      <span className="text-sm font-medium">Punch In</span>
                    </div>
                    <span className="font-bold text-sm text-emerald-800 dark:text-emerald-300">
                      {formatToLocalTime(todayAttendance.punch_in)}
                    </span>
                  </div>
                  {todayAttendance.punch_out ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40">
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <LogOut className="h-4 w-4" />
                        <span className="text-sm font-medium">Punch Out</span>
                      </div>
                      <span className="font-bold text-sm text-red-700 dark:text-red-300">
                        {formatToLocalTime(todayAttendance.punch_out)}
                      </span>
                    </div>
                  ) : (
                    <Button onClick={() => handlePunchAction('punch_out')}
                      className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 font-medium"
                      disabled={loading}>
                      <LogOut className="h-4 w-4 mr-2" />
                      {loading ? 'Processing...' : 'Punch Out'}
                    </Button>
                  )}
                  <div className="text-center py-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-700/60">
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider mb-1">Total Today</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{getTodayDuration()}</p>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                      <Clock className="h-7 w-7 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-400 dark:text-gray-500">Not punched in yet</p>
                  </div>
                  <Button onClick={() => handlePunchAction('punch_in')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-medium"
                    disabled={loading}>
                    <LogIn className="h-4 w-4 mr-2" />
                    {loading ? 'Processing...' : 'Punch In'}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Assigned Tasks ─── */}
      {showTaskSection && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Tasks Assigned to Me */}
          <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
            <CardContent className="p-5">
              <SectionHeader icon={Briefcase} iconColor={COLORS.emeraldGreen} title="Assigned to Me"
                subtitle="Tasks you need to complete"
                action="View All →" onAction={() => navigate('/tasks?filter=assigned-to-me')} />
              {tasksAssignedToMe.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm">
                  No pending tasks assigned to you
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  <AnimatePresence>
                    {tasksAssignedToMe.map(task => (
                      <TaskStrip key={task.id} task={task} isToMe={true}
                        assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus} navigate={navigate} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks Assigned by Me */}
          <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
            <CardContent className="p-5">
              <SectionHeader icon={Briefcase} iconColor={COLORS.mediumBlue} title="Assigned by Me"
                subtitle="Tasks you delegated"
                action="View All →" onAction={() => navigate('/tasks?filter=assigned-by-me')} />
              {tasksAssignedByMe.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm">
                  No delegated tasks
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  <AnimatePresence>
                    {tasksAssignedByMe.map(task => (
                      <TaskStrip key={task.id} task={task} isToMe={false}
                        assignedName={task.assigned_to_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus} navigate={navigate} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Star Performers + To-Do ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Star Performers */}
        <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Star Performers</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Top contributors</p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  {["all", "monthly", "weekly"].map(p => (
                    <button key={p}
                      onClick={() => setRankingPeriod(p)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                        rankingPeriod === p
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}>
                      {p === 'all' ? 'All' : p === 'monthly' ? 'Month' : 'Week'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {rankings.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No ranking data</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                <AnimatePresence>
                  {rankings.slice(0, 5).map((member, i) => (
                    <RankingItem key={member.user_id || i} member={member} index={i} period={rankingPeriod} />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {rankings.length > 5 && (
              <div className="text-right mt-3">
                <button onClick={() => navigate('/reports')}
                  className="text-xs text-blue-500 dark:text-blue-400 hover:underline font-medium">
                  View All Rankings →
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My To-Do List */}
        <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-sm">
          <CardContent className="p-5">
            <SectionHeader icon={CheckSquare} iconColor={COLORS.mediumBlue} title="My To-Do List"
              subtitle="Personal tasks"
              action={isAdmin ? "View All" : undefined}
              onAction={() => navigate('/todo-list')} />
            {/* Add Todo */}
            <div className="flex gap-2 mb-4">
              <input type="text" value={newTodo} onChange={e => setNewTodo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTodo()}
                placeholder="Add a task..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 transition" />
              <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon"
                    className={cn("rounded-xl border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-700", !selectedDueDate && "text-gray-400")}>
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent mode="single" selected={selectedDueDate}
                    onSelect={date => { setSelectedDueDate(date); setShowDueDatePicker(false); }} initialFocus />
                </PopoverContent>
              </Popover>
              <Button onClick={addTodo} disabled={!newTodo.trim()}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-sm font-medium">
                Add
              </Button>
            </div>
            {selectedDueDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 -mt-2">
                Due: {format(selectedDueDate, 'MMM d, yyyy')}
              </p>
            )}
            {todos.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">No todos yet</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                <AnimatePresence>
                  {todos.map(todo => (
                    <motion.div key={todo._id || todo.id} variants={itemVariants}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        todo.completed
                          ? 'bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-700/60'
                          : isOverdue(todo.due_date)
                          ? 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800/40'
                          : 'bg-white dark:bg-gray-700/30 border-gray-100 dark:border-gray-700/60'
                      }`}>
                      <input type="checkbox" checked={todo.completed}
                        onChange={() => handleToggleTodo(todo._id || todo.id)}
                        className="h-4 w-4 accent-blue-600 flex-shrink-0 rounded" />
                      <div className="flex-1 min-w-0">
                        <span className={`block text-sm leading-tight ${
                          todo.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
                        }`}>
                          {todo.title}
                          {!todo.completed && isOverdue(todo.due_date) && (
                            <span className="ml-1.5 text-xs font-medium text-red-500">overdue</span>
                          )}
                        </span>
                        {todo.due_date && (
                          <p className={`text-xs mt-0.5 ${isOverdue(todo.due_date) ? 'text-red-500' : 'text-amber-500 dark:text-amber-400'}`}>
                            Due {format(new Date(todo.due_date), 'MMM d')}
                          </p>
                        )}
                      </div>
                      <button onClick={() => handleDeleteTodo(todo._id || todo.id)}
                        className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Quick Access Tiles ─── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" variants={itemVariants}>
        <QuickTile icon={Target} label="Pipeline" value="Leads"
          color={COLORS.mediumBlue} onClick={() => navigate('/leads')} />
        <QuickTile icon={Building2} label="Clients" value={stats?.total_clients || 0}
          color={COLORS.emeraldGreen} onClick={() => navigate('/clients')} />
        <QuickTile icon={Key} label="DSC Certificates" value={stats?.total_dsc || 0}
          color="#EF4444" alert={(stats?.expiring_dsc_count || 0) > 0} onClick={() => navigate('/dsc')} />
        <QuickTile icon={CalendarIcon} label="Compliance Calendar" value={stats?.upcoming_due_dates || 0}
          color={COLORS.amber} alert={(stats?.upcoming_due_dates || 0) > 0} onClick={() => navigate('/duedates')} />
        {isAdmin && (
          <QuickTile icon={Users} label="Team Members" value={stats?.team_workload?.length || 0}
            color={COLORS.mediumBlue} onClick={() => navigate('/users')} />
        )}
      </motion.div>

      {/* ── Punch In Gate ─── */}
      <AnimatePresence>
        {mustPunchIn && (
          <motion.div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 40 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              className="bg-white dark:bg-gray-800 w-full max-w-sm mx-4 p-8 rounded-2xl shadow-2xl text-center border border-gray-100 dark:border-gray-700"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <LogIn className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">{getGreeting()}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                Please punch in to begin your workday.
              </p>
              <motion.div initial={{ y: 0 }} animate={{ y: [0, -2, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} whileHover={{ y: 0 }}>
                <Button
                  onClick={async () => {
                    await handlePunchAction('punch_in');
                    setMustPunchIn(false);
                    document.body.style.overflow = "auto";
                  }}
                  disabled={loading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium shadow-lg">
                  {loading ? "Punching In..." : "Punch In Now"}
                </Button>
              </motion.div>
              <div className="mt-3">
                <Button variant="ghost" className="w-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await api.post("/attendance/mark-leave-today");
                      toast.success("Marked on leave today");
                      queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });
                      setMustPunchIn(false);
                      document.body.style.overflow = "auto";
                    } catch (err) {
                      toast.error("Failed to mark leave");
                    } finally { setLoading(false); }
                  }}>
                  Mark as Leave Today
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
