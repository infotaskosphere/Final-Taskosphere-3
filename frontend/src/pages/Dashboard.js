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
 if (p === 'critical') return 'border-l-8 border-l-red-600';
 if (p === 'urgent') return 'border-l-8 border-l-orange-500';
 if (p === 'medium') return 'border-l-8 border-l-emerald-500';
 if (p === 'low') return 'border-l-8 border-l-blue-500';
 return 'border-l-8 border-l-slate-300';
};

// ── Task Strip Component ────────────────────────────────────────────────────
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
 const status = task.status || 'pending';
 const isCompleted = status === 'completed';
 const isInProgress = status === 'in_progress';

 return (
 <motion.div
 whileHover={{ y: -6, scale: 1.01, transition: springPhysics.lift }}
 whileTap={{ scale: 0.985, transition: springPhysics.tap }}
 className={`relative flex flex-col p-5 rounded-3xl border bg-white transition-all cursor-pointer group
 ${getPriorityStripeClass(task.priority)}
 ${isCompleted ? 'opacity-80 bg-green-50/40 border-green-200' : 'hover:shadow-2xl hover:border-blue-400 hover:ring-1 hover:ring-blue-200/60'}
 `}
 onClick={() => navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)}
 >
 {/* Title + Action Buttons */}
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
 {/* Start / In Progress */}
 <motion.button
 whileHover={{ scale: 1.05 }}
 whileTap={{ scale: 0.92, transition: springPhysics.button }}
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 onUpdateStatus?.(task.id, 'in_progress');
 }}
 disabled={isCompleted}
 className={`w-28 text-center py-1 text-xs font-medium rounded-full transition ${
 isInProgress
 ? 'bg-blue-600 text-white shadow'
 : 'bg-white border border-blue-400 text-blue-700 hover:bg-blue-50'
 } disabled:opacity-50`}
 >
 {isInProgress ? '✓ In Progress' : 'Start'}
 </motion.button>

 {/* Done / Completed */}
 <motion.button
 whileHover={{ scale: 1.05 }}
 whileTap={{ scale: 0.92, transition: springPhysics.button }}
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

 {/* Meta Info */}
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
 const res = await api.get("/reports/performance-rankings", {
 params: { period }
 });
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
 mutationFn: ({ id, status }) => api.patch(`/todos/${id}`, { is_completed: newStatus === "completed" }),
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
 data: {
 status: newStatus,
 updated_at: new Date().toISOString(),
 },
 },
 {
 onSuccess: () => {
 toast.success(newStatus === 'completed' ? 'Task completed!' : 'Task in progress!');
 queryClient.invalidateQueries({ queryKey: ['tasks'] });
 queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
 },
 onError: (err) => {
 // This will help you see if it's still a 405 (Method) or 403 (Permission) error
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

 toast.success(
 action === 'punch_in'
 ? 'Punched in successfully!'
 : 'Punched out successfully!'
 );

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
 return styles[priority?.toLowerCase()] || styles.medium;
 };

 const getDeadlineColor = (daysLeft) => {
 if (daysLeft <= 0) return { bg: 'bg-red-50 border-red-200 hover:bg-red-100', badge: 'bg-red-500 text-white', text: 'text-red-600' };
 if (daysLeft <= 7) return { bg: 'bg-orange-50 border-orange-200 hover:bg-orange-100', badge: 'bg-orange-500 text-white', text: 'text-orange-600' };
 if (daysLeft <= 15) return { bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100', badge: 'bg-yellow-500 text-white', text: 'text-yellow-600' };
 return { bg: 'bg-green-50 border-green-200 hover:bg-green-100', badge: 'bg-green-600 text-white', text: 'text-green-700' };
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

 const getBgClass = () => {
 if (isTop) return "bg-gradient-to-r from-yellow-100 via-amber-50 to-yellow-50 border-yellow-300 shadow-md";
 if (isSecond) return "bg-gradient-to-r from-slate-200 via-slate-100 to-gray-200 border-slate-300";
 if (isThird) return "bg-gradient-to-r from-amber-200 via-amber-100 to-orange-200 border-amber-300";
 return "bg-slate-50 border-slate-200 hover:bg-slate-100";
 };

 return (
 <motion.div
 whileHover={{ y: -4, scale: 1.01, transition: springPhysics.lift }}
 whileTap={{ scale: 0.985, transition: springPhysics.tap }}
 className={`flex items-center justify-between p-5 rounded-3xl border transition-all ${getBgClass()} hover:shadow-2xl hover:ring-1 hover:ring-yellow-200/50`}
 >
 <div className="flex items-center gap-4">
 <div className="w-9 text-2xl font-bold text-center">{getMedal()}</div>
 <div className={`w-12 h-12 rounded-3xl overflow-hidden ring-2 flex-shrink-0 ${isTop ? 'ring-yellow-400' : 'ring-slate-200'}`}>
 {member.profile_picture ? (
 <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
 ) : (
 <div className={`w-full h-full flex items-center justify-center text-white font-semibold text-2xl ${isTop ? 'bg-yellow-500' : 'bg-slate-700'}`}>
 {member.user_name?.charAt(0)?.toUpperCase() || '?'}
 </div>
 )}
 </div>
 <div>
 <p className={`font-semibold text-lg ${isTop ? 'text-yellow-800' : 'text-slate-900'}`}>
 {member.user_name || 'Unknown'}
 </p>
 <p className="text-xs text-slate-500">Team Member</p>
 <div className="flex items-center gap-2 mt-1">
 <Badge variant="outline" className="text-xs font-medium">
 {member.badge || 'Good Performer'}
 </Badge>
 <span className="text-emerald-600 font-bold text-sm">{member.overall_score}%</span>
 </div>
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

  // 2. If user is on leave → no gate
  if (todayAttendance.status === "leave" || todayAttendance.status === "holiday") {
    setMustPunchIn(false);
    document.body.style.overflow = "auto";
    return;
  }

  // 3. Only show gate if we have a valid response and punch_in is missing
  if (todayAttendance.status === "absent" && !todayAttendance.punch_in) {
    setMustPunchIn(true);
    document.body.style.overflow = "hidden";
  } else {
    setMustPunchIn(false);
    document.body.style.overflow = "auto";
  }

  return () => {
    document.body.style.overflow = "auto";
  };
}, [todayAttendance]);
 // ── JSX Render ──────────────────────────────────────────────────────────────
 return (
 <motion.div
 className="space-y-6"
 variants={containerVariants}
 initial="hidden"
 animate="visible"
 >
 {/* Welcome Banner */}
 <motion.div variants={itemVariants}>
 <Card className="border-0 shadow-xl overflow-hidden relative rounded-3xl"
 style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}
 >
 <div
 className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-20 -mr-16 -mt-16"
 style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
 />
 <CardContent className="p-8 relative">
 <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
 <div>
 <h1 className="text-3xl font-bold tracking-tighter" style={{ color: COLORS.deepBlue }}>
 Welcome back, {user?.full_name?.split(' ')[0] || 'User'}
 </h1>
 <p className="text-slate-600 mt-2 text-base">
 Here's what's happening today — {format(new Date(), 'MMMM d, yyyy')}
 </p>
 </div>

 {nextDeadline && (
 <motion.div
 whileHover={{ scale: 1.02, y: -2, transition: springPhysics.card }}
 className="flex items-center gap-5 px-6 py-4 rounded-3xl border-2 cursor-pointer hover:shadow-2xl transition-all"
 style={{ borderColor: COLORS.mediumBlue, backgroundColor: 'white' }}
 onClick={() => navigate('/duedates')}
 >
 <CalendarIcon className="h-7 w-7" style={{ color: COLORS.mediumBlue }} />
 <div>
 <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
 Next Deadline
 </p>
 <p className="font-bold text-lg" style={{ color: COLORS.deepBlue }}>
 {format(new Date(nextDeadline.due_date), 'MMM d')}: {nextDeadline.title?.slice(0, 15) || 'Deadline'}
 </p>
 </div>
 </motion.div>
 )}
 </div>
 </CardContent>
 </Card>
 </motion.div>

 {/* Key Metrics */}
 <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" variants={itemVariants}>
 {/* Total Tasks */}
 <motion.div
 whileHover={{ y: -5, scale: 1.01, transition: springPhysics.card }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/tasks')}
 className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex flex-col h-full">
 <div className="flex items-start justify-between flex-1">
 <div>
 <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Tasks</p>
 <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
 {stats?.total_tasks || 0}
 </p>
 </div>
 <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
 <Briefcase className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
 </div>
 </div>
 <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
 <span>View all</span>
 <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
 </div>
 </CardContent>
 </motion.div>

 {/* Overdue Tasks */}
 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/tasks?filter=overdue')}
 className={`border shadow-sm hover:shadow-2xl transition-all cursor-pointer group rounded-3xl ${stats?.overdue_tasks > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-100'}`}
 >
 <CardContent className="p-6 flex flex-col h-full">
 <div className="flex items-start justify-between flex-1">
 <div>
 <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue Tasks</p>
 <p className="text-3xl font-bold mt-2" style={{ color: COLORS.coral }}>
 {stats?.overdue_tasks || 0}
 </p>
 </div>
 <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.coral}15` }}>
 <AlertCircle className="h-6 w-6" style={{ color: COLORS.coral }} />
 </div>
 </div>
 <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
 <span>View all</span>
 <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
 </div>
 </CardContent>
 </motion.div>

 {/* Completion Rate */}
 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/tasks')}
 className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex flex-col h-full">
 <div className="flex items-start justify-between flex-1">
 <div>
 <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completion Rate</p>
 <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
 {completionRate}%
 </p>
 </div>
 <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
 <TrendingUp className="h-6 w-6" style={{ color: COLORS.emeraldGreen }} />
 </div>
 </div>
 <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
 <span>View all</span>
 <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
 </div>
 </CardContent>
 </motion.div>

 {/* DSC Alerts */}
 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/dsc?tab=expired')}
 className={`border shadow-sm hover:shadow-2xl transition-all cursor-pointer group rounded-3xl ${stats?.expiring_dsc_count > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-100'}`}
 >
 <CardContent className="p-6 flex flex-col h-full">
 <div className="flex items-start justify-between flex-1">
 <div>
 <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">DSC Alerts</p>
 <p className="text-3xl font-bold mt-2 text-red-600">
 {(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
 </p>
 <p className="text-xs text-slate-500 mt-1">
 {stats?.expired_dsc_count || 0} Expired • {stats?.expiring_dsc_count || 0} Expiring
 </p>
 </div>
 <div className="p-3 rounded-2xl bg-red-100 group-hover:scale-125 transition-transform">
 <Key className="h-6 w-6 text-red-600" />
 </div>
 </div>
 <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
 <span>View alerts</span>
 <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
 </div>
 </CardContent>
 </motion.div>

 {/* Today's Attendance */}
 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/attendance')}
 className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex flex-col h-full">
 <div className="flex items-start justify-between flex-1">
 <div>
 <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Today's Attendance</p>
 <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
 {getTodayDuration()}
 </p>
 </div>
 <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.amber}15` }}>
 <Clock className="h-6 w-6" style={{ color: COLORS.amber }} />
 </div>
 </div>
 <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
 <span>View details</span>
 <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
 </div>
 </CardContent>
 </motion.div>
 </motion.div>

 {/* Recent Tasks + Deadlines + Attendance */}
 <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={itemVariants}>
 {/* Recent Tasks */}
 <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-lg font-semibold flex items-center gap-3">
 <Target className="h-5 w-5 text-blue-500" />
 Recent Tasks
 </CardTitle>
 <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
 View All
 </Button>
 </div>
 <p className="text-xs text-slate-500 mt-1">Latest assignments & progress</p>
 </CardHeader>
 <CardContent className="p-6">
 {recentTasks.length === 0 ? (
 <div className="text-center py-8 text-slate-400 text-sm">No recent tasks</div>
 ) : (
 <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
 <AnimatePresence>
 {recentTasks.map(task => {
 const statusStyle = getStatusStyle(task.status);
 const priorityStyle = getPriorityStyle(task.priority);
 return (
 <motion.div
 key={task.id}
 variants={itemVariants}
 whileHover={{ y: -2 }}
 className={`py-3 px-4 rounded-2xl border cursor-pointer hover:shadow-md hover:border-blue-300 transition ${priorityStyle.bg} ${priorityStyle.border}`}
 onClick={() => navigate('/tasks')}
 >
 <div className="flex items-center justify-between mb-1">
 <p className="font-medium text-sm text-slate-900 truncate">
 {task.title || 'Untitled Task'}
 </p>
 <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs w-28 justify-center`}>
 {task.status?.replace('_', ' ')?.toUpperCase() || 'PENDING'}
 </Badge>
 </div>
 <div className="flex items-center gap-2 text-xs text-slate-600">
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
 <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-lg font-semibold flex items-center gap-3">
 <CalendarIcon className="h-5 w-5 text-orange-500" />
 Upcoming Deadlines
 </CardTitle>
 <Button variant="ghost" size="sm" onClick={() => navigate('/duedates')}>
 View All
 </Button>
 </div>
 <p className="text-xs text-slate-500 mt-1">Compliance calendar – next 30 days</p>
 </CardHeader>
 <CardContent className="p-6">
 {upcomingDueDates.length === 0 ? (
 <div className="text-center py-8 text-slate-400 text-sm">No upcoming deadlines</div>
 ) : (
 <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
 <AnimatePresence>
 {upcomingDueDates.map(due => {
 const color = getDeadlineColor(due.days_remaining || 0);
 return (
 <motion.div
 key={due.id}
 variants={itemVariants}
 whileHover={{ y: -2 }}
 className={`py-3 px-4 rounded-2xl border cursor-pointer hover:shadow-md hover:border-orange-300 transition ${color.bg}`}
 onClick={() => navigate('/duedates')}
 >
 <div className="flex items-center justify-between mb-1">
 <p className="font-medium text-sm text-slate-900 truncate">
 {due.title || 'Untitled Deadline'}
 </p>
 <Badge className={`${color.badge} text-xs w-24 justify-center`}>
 {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
 </Badge>
 </div>
 <div className="flex items-center gap-2 text-xs text-slate-600">
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
 <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-lg font-semibold flex items-center gap-3">
 <Activity className="h-5 w-5 text-purple-500" />
 Attendance
 </CardTitle>
 <Button variant="ghost" size="sm" onClick={() => navigate('/attendance')}>
 View Log
 </Button>
 </div>
 <p className="text-xs text-slate-500 mt-1">Track daily work hours</p>
 </CardHeader>
 <CardContent className="p-6">
 <div className="space-y-4">
 {todayAttendance?.punch_in ? (
 <>
 <div className="flex items-center justify-between text-sm">
 <div className="flex items-center gap-2 text-slate-600">
 <LogIn className="h-4 w-4 text-green-500" />
 Punch In
 </div>
 <span className="font-medium">{format(new Date(todayAttendance.punch_in), 'hh:mm a')}</span>
 </div>

 {todayAttendance.punch_out ? (
 <div className="flex items-center justify-between text-sm">
 <div className="flex items-center gap-2 text-slate-600">
 <LogOut className="h-4 w-4 text-red-500" />
 Punch Out
 </div>
 <span className="font-medium">{format(new Date(todayAttendance.punch_out), 'hh:mm a')}</span>
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

 <div className="text-center py-4 bg-slate-50 rounded-2xl">
 <p className="text-sm text-slate-500">Total Hours Today</p>
 <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>
 {getTodayDuration()}
 </p>
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

 {/* Assigned Tasks – Two Columns */}
 {showTaskSection && (
 <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
 {/* Tasks Assigned to Me */}
 <Card
 className="flex flex-col border-slate-100 shadow-sm rounded-3xl overflow-hidden cursor-pointer hover:shadow-xl transition group"
 onClick={() => navigate('/tasks?filter=assigned-to-me')}
 >
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-xl font-semibold flex items-center gap-3">
 <Briefcase className="h-5 w-5 text-emerald-600" />
 Tasks Assigned to Me
 </CardTitle>
 <Button
 variant="ghost"
 size="sm"
 onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-to-me'); }}
 className="text-emerald-600 hover:text-emerald-700"
 >
 View All →
 </Button>
 </div>
 <p className="text-sm text-slate-500 mt-1">Tasks others gave you</p>
 </CardHeader>
 <CardContent className="p-6 flex-1">
 {tasksAssignedToMe.length === 0 ? (
 <div className="h-44 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-3xl">
 No tasks assigned to you
 </div>
 ) : (
 <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
 <AnimatePresence>
 {tasksAssignedToMe.map(task => (
 <TaskStrip
 key={task.id}
 task={task}
 isToMe={true}
 assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
 onUpdateStatus={updateAssignedTaskStatus}
 navigate={navigate}
 />
 ))}
 </AnimatePresence>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Tasks Assigned by Me */}
 <Card
 className="flex flex-col border-slate-100 shadow-sm rounded-3xl overflow-hidden cursor-pointer hover:shadow-xl transition group"
 onClick={() => navigate('/tasks?filter=assigned-by-me')}
 >
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-xl font-semibold flex items-center gap-3">
 <Briefcase className="h-5 w-5 text-blue-600" />
 Tasks Assigned by Me
 </CardTitle>
 <Button
 variant="ghost"
 size="sm"
 onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-by-me'); }}
 className="text-blue-600 hover:text-blue-700"
 >
 View All →
 </Button>
 </div>
 <p className="text-sm text-slate-500 mt-1">Tasks you delegated</p>
 </CardHeader>
 <CardContent className="p-6 flex-1">
 {tasksAssignedByMe.length === 0 ? (
 <div className="h-44 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-3xl">
 No tasks assigned yet
 </div>
 ) : (
 <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
 <AnimatePresence>
 {tasksAssignedByMe.map(task => (
 <TaskStrip
 key={task.id}
 task={task}
 isToMe={false}
 assignedName={task.assigned_to_name || 'Unknown'}
 onUpdateStatus={updateAssignedTaskStatus}
 navigate={navigate}
 />
 ))}
 </AnimatePresence>
 </div>
 )}
 </CardContent>
 </Card>
 </motion.div>
 )}

 {/* Star Performers + To-Do List */}
 <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* Star Performers */}
 <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-xl font-semibold flex items-center gap-3">
 <TrendingUp className="h-5 w-5 text-yellow-500" />
 Star Performers
 </CardTitle>
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
 <p className="text-xs text-slate-500 mt-1">Top contributors by performance</p>
 </CardHeader>
 <CardContent className="p-6">
 {rankings.length === 0 ? (
 <div className="text-center py-10 text-slate-400 text-sm">No ranking data</div>
 ) : (
 <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
 <AnimatePresence>
 {rankings.slice(0, 5).map((member, i) => (
 <RankingItem key={member.user_id || i} member={member} index={i} period={rankingPeriod} />
 ))}
 </AnimatePresence>
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

 {/* My To-Do List */}
 <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
 <CardHeader className="pb-4 border-b px-6">
 <div className="flex items-center justify-between">
 <CardTitle className="text-xl font-semibold flex items-center gap-3">
 <CheckSquare className="h-5 w-5 text-blue-500" />
 My To-Do List
 </CardTitle>
 {isAdmin && (
 <Button variant="ghost" size="sm" onClick={() => navigate('/todo-list')}>
 View All
 </Button>
 )}
 </div>
 <p className="text-xs text-slate-500 mt-1">Your personal tasks</p>
 </CardHeader>
 <CardContent className="p-6">
 <div className="flex flex-wrap gap-3 mb-6">
 <input
 type="text"
 value={newTodo}
 onChange={e => setNewTodo(e.target.value)}
 placeholder="Add new task..."
 className="flex-1 p-4 text-sm border border-slate-300 rounded-3xl focus:outline-none focus:border-blue-500"
 />
 <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
 <PopoverTrigger asChild>
 <Button variant="outline" size="icon" className={cn("border-slate-300", !selectedDueDate && "text-slate-400")}>
 <CalendarIcon className="h-4 w-4" />
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <CalendarComponent
 mode="single"
 selected={selectedDueDate}
 onSelect={date => {
 setSelectedDueDate(date);
 setShowDueDatePicker(false);
 }}
 initialFocus
 />
 </PopoverContent>
 </Popover>
 <Button onClick={addTodo} disabled={!newTodo.trim()} className="px-8 rounded-3xl">
 Add
 </Button>
 {selectedDueDate && (
 <span className="text-xs text-slate-500 self-center ml-3">
 Due: {format(selectedDueDate, 'MMM d, yyyy')}
 </span>
 )}
 </div>

 {todos.length === 0 ? (
 <div className="text-center py-10 text-slate-400 text-sm">No todos yet</div>
 ) : (
 <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
 <AnimatePresence>
 {todos.map(todo => (
 <motion.div
 key={todo._id || todo.id}
 variants={itemVariants}
 className={`flex items-center justify-between gap-4 p-5 rounded-3xl border ${
 todo.completed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
 } ${!todo.completed && isOverdue(todo.due_date) ? 'border-red-400 bg-red-50/60' : ''}`}
 >
 <div className="flex items-center gap-4 flex-1 min-w-0">
 <input
 type="checkbox"
 checked={todo.completed}
 onChange={() => handleToggleTodo(todo._id || todo.id)}
 className="h-5 w-5 accent-emerald-600 flex-shrink-0"
 />
 <div className="flex-1 min-w-0">
 <span className={`block text-sm ${todo.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
 {todo.title}
 {!todo.completed && isOverdue(todo.due_date) && (
 <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
 Overdue
 </span>
 )}
 </span>
 <p className="text-xs text-slate-500 mt-0.5">
 Added: {todo.created_at ? format(new Date(todo.created_at), 'MMM d, yyyy') : 'Recently'}
 </p>
 {todo.due_date && (
 <p className={`text-xs mt-0.5 ${isOverdue(todo.due_date) ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
 Due: {format(new Date(todo.due_date), 'MMM d, yyyy')}
 {isOverdue(todo.due_date) && ' (overdue)'}
 </p>
 )}
 </div>
 </div>
 <Button
 variant="destructive"
 size="sm"
 onClick={() => handleDeleteTodo(todo._id || todo.id)}
 >
 Delete
 </Button>
 </motion.div>
 ))}
 </AnimatePresence>
 </div>
 )}
 </CardContent>
 </Card>
 </motion.div>

 {/* Quick Access Tiles */}
 <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" variants={itemVariants}>

 <motion.div
    whileHover={{ y: -5, scale: 1.01 }}
    whileTap={{ scale: 0.985 }}
    onClick={() => navigate('/leads')}
    className="border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
  >
    <CardContent className="p-6 flex items-center gap-5">
      <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
        <Target className="h-6 w-6" style={{ color: COLORS.mediumBlue }} />
      </div>
      <div>
        <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>Leads</p>
        <p className="text-sm text-slate-500">Pipeline</p>
      </div>
    </CardContent>
  </motion.div>
  
 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/clients')}
 className="border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex items-center gap-5">
 <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
 <Building2 className="h-6 w-6" style={{ color: COLORS.emeraldGreen }} />
 </div>
 <div>
 <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>{stats?.total_clients || 0}</p>
 <p className="text-sm text-slate-500">Clients</p>
 </div>
 </CardContent>
 </motion.div>

 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/dsc')}
 className="border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex items-center gap-5">
 <div className={`p-4 rounded-2xl group-hover:scale-125 transition-transform ${stats?.expiring_dsc_count > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
 <Key className={`h-6 w-6 ${stats?.expiring_dsc_count > 0 ? 'text-red-600' : 'text-slate-500'}`} />
 </div>
 <div>
 <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>{stats?.total_dsc || 0}</p>
 <p className="text-sm text-slate-500">DSC Certificates</p>
 </div>
 </CardContent>
 </motion.div>

 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/duedates')}
 className="border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex items-center gap-5">
 <div className={`p-4 rounded-2xl group-hover:scale-125 transition-transform ${stats?.upcoming_due_dates > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
 <CalendarIcon className={`h-6 w-6 ${stats?.upcoming_due_dates > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
 </div>
 <div>
 <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>{stats?.upcoming_due_dates || 0}</p>
 <p className="text-sm text-slate-500">Compliance Calendar</p>
 </div>
 </CardContent>
 </motion.div>

 {isAdmin && (
 <motion.div
 whileHover={{ y: -5, scale: 1.01 }}
 whileTap={{ scale: 0.985 }}
 onClick={() => navigate('/users')}
 className="border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
 >
 <CardContent className="p-6 flex items-center gap-5">
 <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
 <Users className="h-6 w-6" style={{ color: COLORS.mediumBlue }} />
 </div>
 <div>
 <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>{stats?.team_workload?.length || 0}</p>
 <p className="text-sm text-slate-500">Team Members</p>
 </div>
 </CardContent>
 </motion.div>
 )}
 </motion.div>
<AnimatePresence>
 {mustPunchIn && (
 <motion.div
 className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 >
 <motion.div
 initial={{ scale: 0.9, y: 40 }}
 animate={{ scale: 1, y: 0 }}
 exit={{ scale: 0.9, y: 40 }}
 transition={{ type: "spring", stiffness: 160, damping: 18 }}
 className="bg-white w-full max-w-md mx-4 p-6 md:p-10 rounded-3xl shadow-2xl text-center relative"
 >
 <motion.h2
 className="text-3xl font-bold mb-3"
 initial={{ scale: 0.95 }}
 animate={{ scale: 1 }}
 transition={{ type: "spring", stiffness: 220, damping: 14 }}
 >
 {getGreeting()}
 </motion.h2>

 <p className="text-slate-500 mb-8">
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
    className="w-full h-12 text-lg bg-green-600 hover:bg-green-700 rounded-2xl shadow-lg hover:shadow-xl transition-all"
  >
    {loading ? "Punching In..." : "Punch In"}
  </Button>
</motion.div>

<div className="mt-4">
  <Button
    variant="secondary"
    className="w-full"
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
