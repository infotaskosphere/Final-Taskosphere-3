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
  if (p === 'critical') return 'border-l-[3px] border-l-red-500';
  if (p === 'urgent')   return 'border-l-[3px] border-l-orange-400';
  if (p === 'medium')   return 'border-l-[3px] border-l-emerald-500';
  if (p === 'low')      return 'border-l-[3px] border-l-blue-400';
  return 'border-l-[3px] border-l-slate-200';
};

// ── Task Strip Component ────────────────────────────────────────────────────
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status = task.status || 'pending';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';

  return (
    <motion.div
      whileHover={{ y: -3, transition: springPhysics.lift }}
      whileTap={{ scale: 0.99, transition: springPhysics.tap }}
      className={`relative flex flex-col p-4 rounded-xl border bg-white cursor-pointer group transition-all
        ${getPriorityStripeClass(task.priority)}
        ${isCompleted
          ? 'opacity-75 bg-slate-50 border-slate-200'
          : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
        }
      `}
      onClick={() => navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)}
    >
      {/* Title + Action Buttons */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm truncate leading-tight transition ${
            isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
          }`}>
            {task.title || 'Untitled Task'}
            {task.client_name ? (
              <span className="text-slate-400 font-normal"> · {task.client_name}</span>
            ) : ''}
          </p>
        </div>
        {isToMe && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.93, transition: springPhysics.button }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateStatus?.(task.id, 'in_progress'); }}
              disabled={isCompleted}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${
                isInProgress
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-blue-300 text-blue-600 hover:bg-blue-50'
              } disabled:opacity-40`}
            >
              {isInProgress ? '✓ In Progress' : 'Start'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.93, transition: springPhysics.button }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateStatus?.(task.id, 'completed'); }}
              disabled={isCompleted}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${
                isCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {isCompleted ? '✓ Done' : 'Done'}
            </motion.button>
          </div>
        )}
      </div>

      {/* Meta Info */}
      <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          {isToMe ? 'From: ' : 'To: '}
          <span className="font-medium text-slate-600">{assignedName || 'Unknown'}</span>
        </span>
        <span>· {format(new Date(task.created_at || Date.now()), 'MMM d · hh:mm a')}</span>
        {task.due_date && (
          <span>· Due: <span className="text-amber-600 font-medium">{format(new Date(task.due_date), 'MMM d, yyyy')}</span></span>
        )}
      </div>
    </motion.div>
  );
}

// ── Shared Card Shell ───────────────────────────────────────────────────────
function SectionCard({ children, className = '' }) {
  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm ${className}`}
    >
      {children}
    </div>
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

  const { data: tasks = [] } = useTasks();
  const { data: stats } = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance } = useTodayAttendance();
  const updateTaskMutation = useUpdateTask();

  // Todos (personal)
  const { data: todosRaw = [] } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get("/todos");
      return res.data;
    },
  });

  const todos = useMemo(() =>
    todosRaw.map(todo => ({
      ...todo,
      completed: todo.status === "completed",
    })),
    [todosRaw]
  );

  const tasksAssignedToMe = useMemo(() =>
    tasks
      .filter(t => t.assigned_to === user?.id && t.status !== "completed")
      .slice(0, 6),
    [tasks, user?.id]
  );

  const tasksAssignedByMe = useMemo(() =>
    tasks
      .filter(t => t.created_by === user?.id && t.assigned_to !== user?.id)
      .slice(0, 6),
    [tasks, user?.id]
  );

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  // Rankings (star performers)
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

  // ── Mutations
  const createTodo = useMutation({
    mutationFn: data => api.post("/todos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo added");
    },
    onError: () => toast.error("Failed to add todo"),
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/todos/${id}`, { is_completed: status === "completed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const deleteTodo = useMutation({
    mutationFn: id => api.delete(`/todos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo deleted");
    },
    onError: () => toast.error("Failed to delete todo"),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
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

  const handleDeleteTodo = (id) => {
    deleteTodo.mutate(id);
  };

  const updateAssignedTaskStatus = (taskId, newStatus) => {
    updateTaskMutation.mutate(
      {
        id: taskId,
        data: { status: newStatus, updated_at: new Date().toISOString() },
      },
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

  // ── Utility Helpers ─────────────────────────────────────────────────────────
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
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
    : 0;

  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) =>
        prev.days_remaining < curr.days_remaining ? prev : curr
      )
    : null;

  const isAdmin = user?.role === 'admin';
  const showTaskSection = isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;
  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  const getStatusStyle = (status) => {
    const styles = {
      completed:   { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      in_progress: { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
      pending:     { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400' },
    };
    return styles[status] || styles.pending;
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      high:   { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
      medium: { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200' },
      low:    { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200' },
    };
    return styles[priority?.toLowerCase()] || styles.medium;
  };

  const getDeadlineColor = (daysLeft) => {
    if (daysLeft <= 0)  return { bg: 'bg-red-50 border-red-200 hover:bg-red-100',       badge: 'bg-red-500 text-white',    text: 'text-red-600' };
    if (daysLeft <= 7)  return { bg: 'bg-orange-50 border-orange-200 hover:bg-orange-100', badge: 'bg-orange-500 text-white', text: 'text-orange-600' };
    if (daysLeft <= 15) return { bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100', badge: 'bg-yellow-500 text-white', text: 'text-yellow-600' };
    return { bg: 'bg-green-50 border-green-200 hover:bg-green-100', badge: 'bg-green-600 text-white', text: 'text-green-700' };
  };

  const formatToLocalTime = (dateString) => {
    if (!dateString) return "--:--";
    const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    return format(date, 'hh:mm a');
  };

  // ── Ranking Item (Memoized) ─────────────────────────────────────────────────
  const RankingItem = React.memo(({ member, index, period }) => {
    const rank = index + 1;
    const isTop = index === 0;
    const isSecond = index === 1;
    const isThird = index === 2;

    const getMedal = () => {
      if (isTop) return '🥇';
      if (isSecond) return '🥈';
      if (isThird) return '🥉';
      return `#${rank}`;
    };

    const rowStyle = isTop
      ? { background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', border: '1px solid #fde047' }
      : isSecond
      ? { background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }
      : isThird
      ? { background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 40%)', border: '1px solid #fdba74' }
      : { background: '#fafafa', border: '1px solid #e2e8f0' };

    return (
      <motion.div
        whileHover={{ y: -2, transition: springPhysics.lift }}
        className="flex items-center justify-between p-4 rounded-xl transition-shadow hover:shadow-md cursor-default"
        style={rowStyle}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 text-xl font-bold text-center flex-shrink-0">{getMedal()}</div>
          <div
            className={`w-10 h-10 rounded-xl overflow-hidden ring-2 flex-shrink-0 ${isTop ? 'ring-yellow-400' : 'ring-slate-200'}`}
          >
            {member.profile_picture ? (
              <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center text-white font-semibold text-lg`}
                style={{ background: isTop ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
              >
                {member.user_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <p className={`font-semibold text-sm ${isTop ? 'text-yellow-800' : 'text-slate-800'}`}>
              {member.user_name || 'Unknown'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-slate-400">{member.badge || 'Good Performer'}</span>
              <span className="text-emerald-600 font-bold text-xs">· {member.overall_score}%</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold tracking-tight ${isTop ? 'text-yellow-700' : 'text-slate-700'}`}>
            {member.total_hours
              ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
              : '0h 00m'}
          </p>
          <p className="text-xs text-slate-400">
            this {period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'period'}
          </p>
        </div>
      </motion.div>
    );
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning ☀️";
    if (hour < 17) return "Good Afternoon 🌤️";
    if (hour < 21) return "Good Evening 🌆";
    return "Working Late? 🌙";
  };

  useEffect(() => {
    if (!todayAttendance) {
      setMustPunchIn(false);
      document.body.style.overflow = "auto";
      return;
    }
    if (todayAttendance.status === "leave" || todayAttendance.status === "holiday") {
      setMustPunchIn(false);
      document.body.style.overflow = "auto";
      return;
    }
    if (todayAttendance.status === "absent" && !todayAttendance.punch_in) {
      setMustPunchIn(true);
      document.body.style.overflow = "hidden";
    } else {
      setMustPunchIn(false);
      document.body.style.overflow = "auto";
    }
    return () => { document.body.style.overflow = "auto"; };
  }, [todayAttendance]);

  // ── JSX Render ──────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Welcome Banner ──────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div
          className="relative overflow-hidden rounded-2xl px-7 py-6"
          style={{
            background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
            boxShadow: `0 8px 32px rgba(13,59,102,0.28)`,
          }}
        >
          {/* Decorative circles */}
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute right-24 bottom-0 w-32 h-32 rounded-full mb-[-30px] opacity-5"
            style={{ background: 'white' }} />

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            <div>
              <p className="text-white/60 text-sm font-medium uppercase tracking-widest mb-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
                Welcome back, {user?.full_name?.split(' ')[0] || 'User'} 👋
              </h1>
              <p className="text-white/60 text-sm mt-1.5">
                Here's your business overview for today.
              </p>
            </div>

            {nextDeadline && (
              <motion.div
                whileHover={{ scale: 1.03, y: -2, transition: springPhysics.card }}
                className="flex items-center gap-4 px-5 py-3.5 rounded-xl cursor-pointer transition-all"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(8px)',
                }}
                onClick={() => navigate('/duedates')}
              >
                <div className="p-2.5 rounded-lg bg-white/15">
                  <CalendarIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Next Deadline</p>
                  <p className="font-bold text-white text-sm mt-0.5">
                    {format(new Date(nextDeadline.due_date), 'MMM d')} · {nextDeadline.title?.slice(0, 18) || 'Deadline'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40 ml-1" />
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Key Metrics ─────────────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" variants={itemVariants}>

        {/* Total Tasks */}
        <motion.div
          whileHover={{ y: -4, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks')}
          className="bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tasks</p>
                <p className="text-3xl font-bold mt-1.5 tracking-tight" style={{ color: COLORS.deepBlue }}>
                  {stats?.total_tasks || 0}
                </p>
              </div>
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${COLORS.deepBlue}12` }}>
                <Briefcase className="h-5 w-5" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs font-medium text-slate-400 group-hover:text-blue-500 transition-colors">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Overdue Tasks */}
        <motion.div
          whileHover={{ y: -4, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks?filter=overdue')}
          className={`rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border ${
            stats?.overdue_tasks > 0 ? 'border-red-200 bg-red-50/60' : 'border-slate-200/80 bg-white'
          }`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overdue</p>
                <p className="text-3xl font-bold mt-1.5 tracking-tight" style={{ color: COLORS.coral }}>
                  {stats?.overdue_tasks || 0}
                </p>
              </div>
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${COLORS.coral}15` }}>
                <AlertCircle className="h-5 w-5" style={{ color: COLORS.coral }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs font-medium text-slate-400 group-hover:text-red-500 transition-colors">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Completion Rate */}
        <motion.div
          whileHover={{ y: -4, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks')}
          className="bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all cursor-pointer group"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completion</p>
                <p className="text-3xl font-bold mt-1.5 tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                  {completionRate}%
                </p>
              </div>
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${COLORS.emeraldGreen}12` }}>
                <TrendingUp className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${completionRate}%`, background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}
              />
            </div>
          </CardContent>
        </motion.div>

        {/* DSC Alerts */}
        <motion.div
          whileHover={{ y: -4, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/dsc?tab=expired')}
          className={`rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border ${
            stats?.expiring_dsc_count > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-200/80 bg-white'
          }`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">DSC Alerts</p>
                <p className="text-3xl font-bold mt-1.5 tracking-tight text-red-600">
                  {(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stats?.expired_dsc_count || 0} expired · {stats?.expiring_dsc_count || 0} expiring
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-red-100 group-hover:scale-110 transition-transform">
                <Key className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </motion.div>

        {/* Today's Attendance */}
        <motion.div
          whileHover={{ y: -4, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/attendance')}
          className="bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-lg hover:border-amber-200 transition-all cursor-pointer group"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today</p>
                <p className="text-3xl font-bold mt-1.5 tracking-tight" style={{ color: COLORS.deepBlue }}>
                  {getTodayDuration()}
                </p>
              </div>
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${COLORS.amber}18` }}>
                <Clock className="h-5 w-5" style={{ color: COLORS.amber }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs font-medium text-slate-400 group-hover:text-amber-500 transition-colors">
              <span>View details</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

      </motion.div>

      {/* ── Recent Tasks + Deadlines + Attendance ───────────────────────── */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={itemVariants}>

        {/* Recent Tasks */}
        <SectionCard>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50">
                <Target className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Recent Tasks</h3>
                <p className="text-xs text-slate-400">Latest assignments</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-blue-500 h-7 px-3"
              onClick={() => navigate('/tasks')}>
              View All
            </Button>
          </div>
          <div className="p-4">
            {recentTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No recent tasks</div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {recentTasks.map(task => {
                    const statusStyle = getStatusStyle(task.status);
                    const priorityStyle = getPriorityStyle(task.priority);
                    return (
                      <motion.div
                        key={task.id}
                        variants={itemVariants}
                        whileHover={{ y: -1 }}
                        className={`py-3 px-3.5 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${priorityStyle.bg} ${priorityStyle.border}`}
                        onClick={() => navigate('/tasks')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm text-slate-800 truncate flex-1 mr-2">
                            {task.title || 'Untitled Task'}
                          </p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${statusStyle.bg} ${statusStyle.text} whitespace-nowrap`}>
                            {task.status?.replace('_', ' ') || 'PENDING'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <CalendarIcon className="h-3 w-3" />
                          {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'No due date'}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Upcoming Deadlines */}
        <SectionCard>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-orange-50">
                <CalendarIcon className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Upcoming Deadlines</h3>
                <p className="text-xs text-slate-400">Next 30 days</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-orange-500 h-7 px-3"
              onClick={() => navigate('/duedates')}>
              View All
            </Button>
          </div>
          <div className="p-4">
            {upcomingDueDates.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No upcoming deadlines</div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {upcomingDueDates.map(due => {
                    const color = getDeadlineColor(due.days_remaining || 0);
                    return (
                      <motion.div
                        key={due.id}
                        variants={itemVariants}
                        whileHover={{ y: -1 }}
                        className={`py-3 px-3.5 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${color.bg}`}
                        onClick={() => navigate('/duedates')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm text-slate-800 truncate flex-1 mr-2">
                            {due.title || 'Untitled Deadline'}
                          </p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${color.badge} whitespace-nowrap`}>
                            {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <CalendarIcon className="h-3 w-3" />
                          {format(new Date(due.due_date), 'MMM d, yyyy')}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Attendance */}
        <SectionCard>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-purple-50">
                <Activity className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Attendance</h3>
                <p className="text-xs text-slate-400">Daily work hours</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-purple-500 h-7 px-3"
              onClick={() => navigate('/attendance')}>
              View Log
            </Button>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {todayAttendance?.punch_in ? (
                <>
                  <div className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <LogIn className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Punch In</span>
                    </div>
                    <span className="font-bold text-slate-800 text-sm">{formatToLocalTime(todayAttendance.punch_in)}</span>
                  </div>

                  {todayAttendance.punch_out ? (
                    <div className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <LogOut className="h-4 w-4 text-red-500" />
                        <span className="font-medium">Punch Out</span>
                      </div>
                      <span className="font-bold text-slate-800 text-sm">{formatToLocalTime(todayAttendance.punch_out)}</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handlePunchAction('punch_out')}
                      className="w-full bg-red-500 hover:bg-red-600 rounded-xl h-10 text-sm font-semibold"
                      disabled={loading}
                    >
                      Punch Out
                    </Button>
                  )}

                  <div
                    className="text-center py-4 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}08, ${COLORS.mediumBlue}12)`, border: `1px solid ${COLORS.deepBlue}15` }}
                  >
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Today</p>
                    <p className="text-3xl font-bold mt-1 tracking-tight" style={{ color: COLORS.deepBlue }}>
                      {getTodayDuration()}
                    </p>
                  </div>
                </>
              ) : (
                <Button
                  onClick={() => handlePunchAction('punch_in')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl h-11 text-sm font-semibold"
                  disabled={loading}
                >
                  Punch In
                </Button>
              )}
            </div>
          </div>
        </SectionCard>
      </motion.div>

      {/* ── Assigned Tasks – Two Columns ────────────────────────────────── */}
      {showTaskSection && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Tasks Assigned to Me */}
          <SectionCard className="cursor-pointer hover:shadow-md transition group"
            onClick={() => navigate('/tasks?filter=assigned-to-me')}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-50">
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">Tasks Assigned to Me</h3>
                  <p className="text-xs text-slate-400">Tasks others gave you</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-emerald-600 h-7 px-3"
                onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-to-me'); }}>
                View All →
              </Button>
            </div>
            <div className="p-4">
              {tasksAssignedToMe.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                  No tasks assigned to you
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  <AnimatePresence>
                    {tasksAssignedToMe.map(task => (
                      <TaskStrip
                        key={task.id} task={task} isToMe={true}
                        assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus} navigate={navigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Tasks Assigned by Me */}
          <SectionCard className="cursor-pointer hover:shadow-md transition group"
            onClick={() => navigate('/tasks?filter=assigned-by-me')}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-50">
                  <Briefcase className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">Tasks Assigned by Me</h3>
                  <p className="text-xs text-slate-400">Tasks you delegated</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-3"
                onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-by-me'); }}>
                View All →
              </Button>
            </div>
            <div className="p-4">
              {tasksAssignedByMe.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                  No tasks assigned yet
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  <AnimatePresence>
                    {tasksAssignedByMe.map(task => (
                      <TaskStrip
                        key={task.id} task={task} isToMe={false}
                        assignedName={task.assigned_to_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus} navigate={navigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* ── Star Performers + To-Do List ────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Star Performers */}
        <SectionCard>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-yellow-50">
                <TrendingUp className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Star Performers</h3>
                <p className="text-xs text-slate-400">Top contributors</p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                {["all", "monthly", "weekly"].map(p => (
                  <button
                    key={p}
                    onClick={() => setRankingPeriod(p)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      rankingPeriod === p
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-4">
            {rankings.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No ranking data</div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
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
                  className="text-xs font-medium text-blue-500 hover:underline">
                  View All Rankings →
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* My To-Do List */}
        <SectionCard>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50">
                <CheckSquare className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">My To-Do List</h3>
                <p className="text-xs text-slate-400">Personal tasks</p>
              </div>
            </div>
            {isAdmin && (
              <Button variant="ghost" size="sm" className="text-xs text-blue-500 h-7 px-3"
                onClick={() => navigate('/todo-list')}>
                View All
              </Button>
            )}
          </div>
          <div className="p-4">
            {/* Input Row */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                placeholder="Add new task..."
                onKeyDown={e => e.key === 'Enter' && addTodo()}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 placeholder:text-slate-400"
              />
              <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon"
                    className={cn("h-10 w-10 rounded-xl border-slate-200 flex-shrink-0", !selectedDueDate && "text-slate-400")}>
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDueDate}
                    onSelect={date => { setSelectedDueDate(date); setShowDueDatePicker(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button onClick={addTodo} disabled={!newTodo.trim()}
                className="px-5 rounded-xl h-10 text-sm font-semibold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                Add
              </Button>
            </div>
            {selectedDueDate && (
              <p className="text-xs text-amber-600 font-medium mb-3 -mt-1 ml-1">
                📅 Due: {format(selectedDueDate, 'MMM d, yyyy')}
              </p>
            )}

            {todos.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No todos yet</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {todos.map(todo => (
                    <motion.div
                      key={todo._id || todo.id}
                      variants={itemVariants}
                      className={`flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border transition-all ${
                        todo.completed
                          ? 'bg-slate-50 border-slate-200'
                          : !todo.completed && isOverdue(todo.due_date)
                          ? 'bg-red-50/70 border-red-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => handleToggleTodo(todo._id || todo.id)}
                          className="h-4 w-4 accent-emerald-600 flex-shrink-0 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`block text-sm truncate ${
                            todo.completed ? 'line-through text-slate-400' : 'text-slate-800'
                          }`}>
                            {todo.title}
                            {!todo.completed && isOverdue(todo.due_date) && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-600 rounded">
                                Overdue
                              </span>
                            )}
                          </span>
                          {todo.due_date && (
                            <p className={`text-xs mt-0.5 ${isOverdue(todo.due_date) ? 'text-red-500 font-medium' : 'text-amber-500'}`}>
                              Due: {format(new Date(todo.due_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTodo(todo._id || todo.id)}
                        className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 flex-shrink-0"
                      >
                        ✕
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </SectionCard>
      </motion.div>

      {/* ── Quick Access Tiles ───────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" variants={itemVariants}>

        {[
          {
            path: '/leads',
            icon: <Target className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />,
            iconBg: `${COLORS.mediumBlue}12`,
            label: 'Leads',
            sub: 'Pipeline',
            value: null,
          },
          {
            path: '/clients',
            icon: <Building2 className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />,
            iconBg: `${COLORS.emeraldGreen}12`,
            label: String(stats?.total_clients || 0),
            sub: 'Clients',
            value: null,
          },
          {
            path: '/dsc',
            icon: <Key className={`h-5 w-5 ${stats?.expiring_dsc_count > 0 ? 'text-red-500' : 'text-slate-400'}`} />,
            iconBg: stats?.expiring_dsc_count > 0 ? '#fef2f2' : '#f8fafc',
            label: String(stats?.total_dsc || 0),
            sub: 'DSC Certificates',
            value: null,
          },
          {
            path: '/duedates',
            icon: <CalendarIcon className={`h-5 w-5 ${stats?.upcoming_due_dates > 0 ? 'text-amber-500' : 'text-slate-400'}`} />,
            iconBg: stats?.upcoming_due_dates > 0 ? '#fffbeb' : '#f8fafc',
            label: String(stats?.upcoming_due_dates || 0),
            sub: 'Compliance',
            value: null,
          },
        ].map(tile => (
          <motion.div
            key={tile.path}
            whileHover={{ y: -4, transition: springPhysics.card }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(tile.path)}
            className="bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer group"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: tile.iconBg }}>
                {tile.icon}
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>{tile.label}</p>
                <p className="text-xs text-slate-400 font-medium">{tile.sub}</p>
              </div>
            </CardContent>
          </motion.div>
        ))}

        {isAdmin && (
          <motion.div
            whileHover={{ y: -4, transition: springPhysics.card }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/users')}
            className="bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer group"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: `${COLORS.mediumBlue}12` }}>
                <Users className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>
                  {stats?.team_workload?.length || 0}
                </p>
                <p className="text-xs text-slate-400 font-medium">Team Members</p>
              </div>
            </CardContent>
          </motion.div>
        )}
      </motion.div>

      {/* ── Punch-In Gate Overlay ────────────────────────────────────────── */}
      <AnimatePresence>
        {mustPunchIn && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(7,15,30,0.7)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.88, y: 48 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 48 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              className="bg-white w-full max-w-sm mx-4 rounded-3xl overflow-hidden"
              style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.4)' }}
            >
              {/* Header stripe */}
              <div
                className="px-8 pt-8 pb-6 text-center"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
              >
                <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Clock className="h-7 w-7 text-white" />
                </div>
                <motion.h2
                  className="text-2xl font-bold text-white"
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                >
                  {getGreeting()}
                </motion.h2>
                <p className="text-white/70 text-sm mt-1.5">
                  {format(new Date(), 'EEEE, MMMM d')}
                </p>
              </div>

              <div className="px-7 py-6 space-y-3">
                <p className="text-center text-slate-500 text-sm mb-4">
                  Please punch in to begin your workday.
                </p>

                <motion.div
                  initial={{ y: 0 }}
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  whileHover={{ y: 0 }}
                >
                  <Button
                    onClick={async () => {
                      await handlePunchAction('punch_in');
                      setMustPunchIn(false);
                      document.body.style.overflow = "auto";
                    }}
                    disabled={loading}
                    className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg hover:shadow-emerald-200 transition-all"
                  >
                    {loading ? "Punching In..." : "Punch In Now"}
                  </Button>
                </motion.div>

                <Button
                  variant="ghost"
                  className="w-full h-10 text-slate-500 hover:text-slate-700 rounded-xl text-sm"
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
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  On Leave Today
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
