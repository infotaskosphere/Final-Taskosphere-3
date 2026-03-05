import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isTomorrow } from 'date-fns';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CheckSquare, FileText, Clock, TrendingUp, AlertCircle, LogIn, LogOut,
  Calendar as CalendarIcon, Users, Key, Briefcase, ArrowUpRight, Building2,
  ChevronRight, Target, Activity, Bell, Gift, Shield, Award, Star,
  BarChart3, Zap, Timer, ListTodo, CheckCircle2, Circle, Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  coral:        '#FF6B6B',
  amber:        '#F59E0B',
};

// ─────────────────────────────────────────────────────────────────────────────
// SPRING PHYSICS — preserved from original
// ─────────────────────────────────────────────────────────────────────────────
const springPhysics = {
  card:   { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: 'spring', stiffness: 400, damping: 28 },
  icon:   { type: 'spring', stiffness: 450, damping: 25 },
  tap:    { type: 'spring', stiffness: 500, damping: 30 },
};

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION VARIANTS — preserved from original
// ─────────────────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.3 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const isOverdue = (d) => d && new Date(d) < new Date();

const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-[5px] border-l-red-600';
  if (p === 'urgent')   return 'border-l-[5px] border-l-orange-500';
  if (p === 'high')     return 'border-l-[5px] border-l-orange-400';
  if (p === 'medium')   return 'border-l-[5px] border-l-emerald-500';
  if (p === 'low')      return 'border-l-[5px] border-l-blue-400';
  return 'border-l-[5px] border-l-slate-200';
};

const formatToLocalTime = (dateString) => {
  if (!dateString) return '--:--';
  const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
  return format(date, 'hh:mm a');
};

const getStatusStyle = (status) => ({
  completed:   { bg: 'bg-emerald-100 text-emerald-700' },
  in_progress: { bg: 'bg-blue-100 text-blue-700' },
  pending:     { bg: 'bg-slate-100 text-slate-600' },
}[status] ?? { bg: 'bg-slate-100 text-slate-600' });

const getDeadlineColor = (daysLeft) => {
  if (daysLeft <= 0)  return { bg: 'bg-red-50 border-red-200',    badge: 'bg-red-500 text-white' };
  if (daysLeft <= 7)  return { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-500 text-white' };
  if (daysLeft <= 15) return { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-500 text-white' };
  return               { bg: 'bg-emerald-50 border-emerald-200',  badge: 'bg-emerald-600 text-white' };
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning ☀️';
  if (h < 17) return 'Good Afternoon 🌤️';
  if (h < 21) return 'Good Evening 🌆';
  return 'Working Late? 🌙';
};

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD — compact metric tile with top accent line
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon, onClick, urgent }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.01, transition: springPhysics.card }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        'relative rounded-3xl border cursor-pointer group overflow-hidden transition-shadow hover:shadow-xl',
        urgent ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-white hover:border-slate-200'
      )}
    >
      <div className="absolute top-0 inset-x-0 h-[3px] rounded-t-3xl" style={{ background: color }} />
      <CardContent className="p-6 flex flex-col h-full">
        <div className="flex items-start justify-between flex-1">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-bold mt-2 tracking-tighter" style={{ color }}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform"
            style={{ backgroundColor: `${color}15` }}>
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
        </div>
        <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
          <span>View details</span>
          <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
        </div>
      </CardContent>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK STRIP — fully preserved + overdue visual polish
// ─────────────────────────────────────────────────────────────────────────────
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status      = task.status || 'pending';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';
  const taskOverdue = !isCompleted && isOverdue(task.due_date);

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.01, transition: springPhysics.lift }}
      whileTap={{ scale: 0.985, transition: springPhysics.tap }}
      onClick={() => navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)}
      className={cn(
        'relative flex flex-col p-5 rounded-3xl border bg-white transition-all cursor-pointer group',
        getPriorityStripeClass(task.priority),
        isCompleted  ? 'opacity-80 bg-green-50/40 border-green-200' :
        taskOverdue  ? 'border-red-200 bg-red-50/20 hover:shadow-xl hover:border-red-300' :
                       'hover:shadow-2xl hover:border-blue-400 hover:ring-1 hover:ring-blue-200/60'
      )}
    >
      {/* Title + Action Buttons */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-medium truncate leading-tight transition',
            isCompleted ? 'line-through text-slate-500' : 'text-slate-900'
          )}>
            {task.title || 'Untitled Task'}
            {task.client_name ? ` – ${task.client_name}` : ''}
          </p>
        </div>
        {isToMe && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92, transition: springPhysics.button }}
              type="button"
              onClick={e => { e.stopPropagation(); onUpdateStatus?.(task.id, 'in_progress'); }}
              disabled={isCompleted}
              className={cn(
                'w-28 text-center py-1 text-xs font-medium rounded-full transition',
                isInProgress
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white border border-blue-400 text-blue-700 hover:bg-blue-50',
                'disabled:opacity-50'
              )}
            >
              {isInProgress ? '✓ In Progress' : 'Start'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92, transition: springPhysics.button }}
              type="button"
              onClick={e => { e.stopPropagation(); onUpdateStatus?.(task.id, 'completed'); }}
              disabled={isCompleted}
              className={cn(
                'w-28 text-center py-1 text-xs font-medium rounded-full transition',
                isCompleted
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
              )}
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
          <span className="font-medium text-slate-700">{assignedName || 'Unknown'}</span>
        </span>
        <span>• {format(new Date(task.created_at || Date.now()), 'MMM d, yyyy • hh:mm a')}</span>
        {task.due_date && (
          <span className={taskOverdue ? 'text-red-500 font-medium' : ''}>
            • Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
            {taskOverdue && ' ⚠'}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RANKING ITEM — fully preserved from original
// ─────────────────────────────────────────────────────────────────────────────
const RankingItem = React.memo(({ member, index, period }) => {
  const isTop    = index === 0;
  const isSecond = index === 1;
  const isThird  = index === 2;
  const getMedal = () => isTop ? '🥇' : isSecond ? '🥈' : isThird ? '🥉' : `#${index + 1}`;
  const getBgClass = () => {
    if (isTop)    return 'bg-gradient-to-r from-yellow-100 via-amber-50 to-yellow-50 border-yellow-300 shadow-md';
    if (isSecond) return 'bg-gradient-to-r from-slate-200 via-slate-100 to-gray-200 border-slate-300';
    if (isThird)  return 'bg-gradient-to-r from-amber-200 via-amber-100 to-orange-200 border-amber-300';
    return 'bg-slate-50 border-slate-200 hover:bg-slate-100';
  };
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01, transition: springPhysics.lift }}
      whileTap={{ scale: 0.985, transition: springPhysics.tap }}
      className={cn(
        'flex items-center justify-between p-5 rounded-3xl border transition-all hover:shadow-2xl hover:ring-1 hover:ring-yellow-200/50',
        getBgClass()
      )}
    >
      <div className="flex items-center gap-4">
        <div className="w-9 text-2xl font-bold text-center">{getMedal()}</div>
        <div className={cn('w-12 h-12 rounded-3xl overflow-hidden ring-2 flex-shrink-0', isTop ? 'ring-yellow-400' : 'ring-slate-200')}>
          {member.profile_picture
            ? <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
            : <div className={cn('w-full h-full flex items-center justify-center text-white font-semibold text-2xl', isTop ? 'bg-yellow-500' : 'bg-slate-700')}>
                {member.user_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
          }
        </div>
        <div>
          <p className={cn('font-semibold text-lg', isTop ? 'text-yellow-800' : 'text-slate-900')}>
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
        <p className={cn('text-2xl font-bold tracking-tighter', isTop ? 'text-yellow-700' : 'text-emerald-700')}>
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  // ── Core state — all original ─────────────────────────────────────────────
  const [loading, setLoading]                     = useState(false);
  const [rankings, setRankings]                   = useState([]);
  const [rankingPeriod, setRankingPeriod]         = useState('monthly');
  const [newTodo, setNewTodo]                     = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedDueDate, setSelectedDueDate]     = useState(undefined);
  const [mustPunchIn, setMustPunchIn]             = useState(false);

  // ── New state — extra features from existing backend routes ───────────────
  const [liveTime, setLiveTime]                   = useState(new Date());
  const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);  // /clients/upcoming-birthdays
  const [attendanceSummary, setAttendanceSummary] = useState(null); // /attendance/my-summary
  const [taskAnalytics, setTaskAnalytics]         = useState(null); // /tasks/analytics
  const [unreadCount, setUnreadCount]             = useState(0);    // /notifications/unread-count
  const [notifications, setNotifications]         = useState([]);   // /notifications/
  const [showNotifs, setShowNotifs]               = useState(false);
  const [holidays, setHolidays]                   = useState([]);   // /holidays
  const notifRef = useRef(null);

  // ── React Query hooks — all original ─────────────────────────────────────
  const { data: tasks = [] }            = useTasks();
  const { data: stats }                 = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance }       = useTodayAttendance();
  const updateTaskMutation              = useUpdateTask();

  // Todos — original
  const { data: todosRaw = [] } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => (await api.get('/todos')).data,
  });
  const todos = useMemo(() =>
    todosRaw.map(t => ({ ...t, completed: t.status === 'completed' })),
    [todosRaw]
  );

  // ── Derived values — all original ─────────────────────────────────────────
  const tasksAssignedToMe = useMemo(() =>
    tasks.filter(t => t.assigned_to === user?.id && t.status !== 'completed').slice(0, 6),
    [tasks, user?.id]
  );
  const tasksAssignedByMe = useMemo(() =>
    tasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id).slice(0, 6),
    [tasks, user?.id]
  );
  const recentTasks     = useMemo(() => tasks.slice(0, 5), [tasks]);
  const isAdmin         = user?.role === 'admin';
  const showTaskSection = isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;
  const completionRate  = stats?.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100) : 0;
  const nextDeadline    = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((p, c) => p.days_remaining < c.days_remaining ? p : c)
    : null;

  // compliance from stats.compliance_status (was unused in original)
  const complianceScore  = stats?.compliance_status?.score ?? 100;
  const complianceStatus = stats?.compliance_status?.status ?? 'good';
  const complianceColor  = complianceStatus === 'good' ? COLORS.emeraldGreen
    : complianceStatus === 'warning' ? COLORS.amber : COLORS.coral;

  // todo counts
  const todosOverdue  = todos.filter(t => !t.completed && isOverdue(t.due_date)).length;
  const todosPending  = todos.filter(t => !t.completed).length;

  // ── Live clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Close notif panel on outside click ────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Rankings — original ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const period = rankingPeriod === 'all' ? 'all_time' : rankingPeriod;
        const res = await api.get('/reports/performance-rankings', { params: { period } });
        setRankings(res.data || []);
      } catch { setRankings([]); }
    })();
  }, [rankingPeriod]);

  // ── Client birthdays — NEW: GET /clients/upcoming-birthdays ──────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/clients/upcoming-birthdays', { params: { days: 7 } });
        setUpcomingBirthdays(res.data || []);
      } catch { setUpcomingBirthdays([]); }
    })();
  }, []);

  // ── Attendance monthly summary — NEW: GET /attendance/my-summary ─────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/attendance/my-summary');
        setAttendanceSummary(res.data);
      } catch { setAttendanceSummary(null); }
    })();
  }, []);

  // ── Task analytics for current month — NEW: GET /tasks/analytics ─────────
  useEffect(() => {
    (async () => {
      try {
        const month = format(new Date(), 'yyyy-MM');
        const res = await api.get('/tasks/analytics', { params: { month } });
        setTaskAnalytics(res.data);
      } catch { setTaskAnalytics(null); }
    })();
  }, []);

  // ── Notifications — NEW: GET /notifications/ + /notifications/unread-count
  useEffect(() => {
    (async () => {
      try {
        const [cRes, lRes] = await Promise.all([
          api.get('/notifications/unread-count'),
          api.get('/notifications/'),
        ]);
        setUnreadCount(cRes.data?.unread_count ?? 0);
        setNotifications(lRes.data || []);
      } catch { setUnreadCount(0); setNotifications([]); }
    })();
  }, []);

  // ── Holidays — NEW: GET /holidays ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/holidays');
        setHolidays(res.data || []);
      } catch { setHolidays([]); }
    })();
  }, []);

  // ── Punch-in gate — original logic exactly ────────────────────────────────
  useEffect(() => {
    if (!todayAttendance) {
      setMustPunchIn(false); document.body.style.overflow = 'auto'; return;
    }
    if (todayAttendance.status === 'leave' || todayAttendance.status === 'holiday') {
      setMustPunchIn(false); document.body.style.overflow = 'auto'; return;
    }
    if (todayAttendance.status === 'absent' && !todayAttendance.punch_in) {
      setMustPunchIn(true); document.body.style.overflow = 'hidden';
    } else {
      setMustPunchIn(false); document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [todayAttendance]);

  // ── Mutations — original, with bug fix on updateTodo ─────────────────────
  const createTodo = useMutation({
    mutationFn: data => api.post('/todos', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['todos'] }); toast.success('Todo added'); },
    onError: () => toast.error('Failed to add todo'),
  });

  // BUG FIX: original had `newStatus` undefined in mutationFn closure
  const updateTodo = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/todos/${id}`, { is_completed: status === 'completed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  });

  const deleteTodo = useMutation({
    mutationFn: id => api.delete(`/todos/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['todos'] }); toast.success('Todo deleted'); },
    onError: () => toast.error('Failed to delete todo'),
  });

  // ── Handlers — all original ───────────────────────────────────────────────
  const addTodo = () => {
    if (!newTodo.trim()) return;
    createTodo.mutate({
      title: newTodo.trim(),
      status: 'pending',
      due_date: selectedDueDate ? selectedDueDate.toISOString() : null,
    });
    setNewTodo(''); setSelectedDueDate(undefined);
  };

  const handleToggleTodo = (id) => {
    const todo = todosRaw.find(t => t.id === id || t._id === id);
    if (!todo) return;
    const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
    updateTodo.mutate({ id: todo.id || todo._id, status: newStatus });
  };

  const handleDeleteTodo = (id) => deleteTodo.mutate(id);

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
          console.error('Update Error:', err);
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
    } finally { setLoading(false); }
  };

  const markAllNotifsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* silent fail */ }
  };

  // ── Utilities — all original ──────────────────────────────────────────────
  const getTodayDuration = () => {
    if (!todayAttendance?.punch_in) return '0h 0m';
    if (todayAttendance.punch_out) {
      const mins = todayAttendance.duration_minutes || 0;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    const diffMs = Date.now() - new Date(todayAttendance.punch_in).getTime();
    return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
  };

  const getPriorityStyle = (priority) => ({
    high:   { bg: 'bg-red-50',    border: 'border-red-200' },
    medium: { bg: 'bg-amber-50',  border: 'border-amber-200' },
    low:    { bg: 'bg-blue-50',   border: 'border-blue-200' },
  }[priority?.toLowerCase()] ?? { bg: 'bg-slate-50', border: 'border-slate-200' });

  // current month summary from /attendance/my-summary
  const currentMonthSummary = useMemo(() => {
    if (!attendanceSummary?.monthly_summary) return null;
    const month = format(new Date(), 'yyyy-MM');
    return attendanceSummary.monthly_summary.find(m => m.month === month) ?? null;
  }, [attendanceSummary]);

  // mini sparkline data for attendance bar chart (last 6 months)
  const attendanceBars = useMemo(() => {
    if (!attendanceSummary?.monthly_summary?.length) return [];
    return attendanceSummary.monthly_summary.slice(-6).map(m => ({
      label: m.month.slice(5),
      hours: parseFloat((m.total_minutes / 60).toFixed(1)),
    }));
  }, [attendanceSummary]);
  const maxBarHours = Math.max(...attendanceBars.map(d => d.hours), 1);

  // upcoming confirmed holidays
  const upcomingHolidays = useMemo(() =>
    holidays
      .filter(h => h.status === 'confirmed' && new Date(h.date) >= new Date())
      .slice(0, 3),
    [holidays]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <motion.div
      className="min-h-screen bg-slate-50/50 p-4 md:p-6 space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >

      {/* ═══ WELCOME BANNER ════════════════════════════════════════════════ */}
      <motion.div variants={itemVariants}>
        <div
          className="relative rounded-3xl overflow-hidden shadow-lg border-0"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #0e4b80 100%)` }}
        >
          {/* decorative rings */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full border-[44px] border-white/[0.04]" />
            <div className="absolute right-10 -bottom-12 w-48 h-48 rounded-full border-[28px] border-white/[0.04]" />
          </div>

          <div className="relative p-7 md:p-9">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">

              {/* Greeting */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  <span className="text-[10px] font-bold text-blue-200/80 uppercase tracking-[0.15em]">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                  {getGreeting()}, {user?.full_name?.split(' ')[0] || 'User'}!
                </h1>
                <p className="text-blue-200/70 text-sm mt-1.5">
                  {tasksAssignedToMe.length > 0
                    ? `You have ${tasksAssignedToMe.length} pending task${tasksAssignedToMe.length !== 1 ? 's' : ''} waiting for you`
                    : upcomingBirthdays.length > 0
                      ? `🎂 ${upcomingBirthdays[0].company_name} birthday ${upcomingBirthdays[0].days_until_birthday === 0 ? 'is today!' : `in ${upcomingBirthdays[0].days_until_birthday}d`}`
                      : "All caught up — you're doing great!"}
                </p>
              </div>

              {/* Right side — notification bell + clock + deadline */}
              <div className="flex items-center gap-3 flex-wrap">

                {/* Notification Bell — NEW: uses /notifications/ + /notifications/unread-count */}
                <div className="relative" ref={notifRef}>
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => setShowNotifs(v => !v)}
                    className="relative p-3 rounded-2xl bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-colors"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center px-1 shadow-md">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </motion.button>

                  <AnimatePresence>
                    {showNotifs && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-14 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                          <p className="font-bold text-sm text-slate-800">Notifications</p>
                          {unreadCount > 0 && (
                            <button onClick={markAllNotifsRead}
                              className="text-[10px] font-bold text-blue-600 hover:underline">
                              Mark all read
                            </button>
                          )}
                        </div>
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                          {notifications.length === 0 ? (
                            <div className="py-8 text-center text-slate-300">
                              <Bell className="h-7 w-7 mx-auto mb-2" />
                              <p className="text-xs">No notifications</p>
                            </div>
                          ) : notifications.slice(0, 8).map((n, i) => (
                            <div key={n.id || i}
                              className={cn('px-4 py-3 transition-colors hover:bg-slate-50', !n.is_read && 'bg-blue-50/40')}>
                              <div className="flex items-start gap-2.5">
                                <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', n.is_read ? 'bg-slate-300' : 'bg-blue-500')} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 leading-snug">{n.title}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Live clock */}
                <div className="hidden sm:flex flex-col items-end">
                  <p className="text-3xl font-black text-white tabular-nums tracking-tight leading-none">
                    {format(liveTime, 'hh:mm')}
                    <span className="text-blue-300 text-xl font-semibold ml-1.5">{format(liveTime, 'a')}</span>
                  </p>
                  <p className="text-[10px] text-blue-300/60 mt-0.5">{format(liveTime, 'ss')}s</p>
                </div>

                {/* Next deadline */}
                {nextDeadline && (
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2, transition: springPhysics.card }}
                    onClick={() => navigate('/duedates')}
                    className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 transition-colors backdrop-blur-sm text-left"
                  >
                    <CalendarIcon className="h-5 w-5 text-amber-300 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold text-blue-200/70 uppercase tracking-wider">Next Deadline</p>
                      <p className="font-bold text-white text-sm">
                        {format(new Date(nextDeadline.due_date), 'MMM d')}: {nextDeadline.title?.slice(0, 16) || 'Deadline'}
                        {nextDeadline.days_remaining <= 3 && (
                          <span className="ml-1.5 text-[10px] text-amber-300">({nextDeadline.days_remaining}d)</span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-blue-300" />
                  </motion.button>
                )}
              </div>
            </div>

            {/* ── Stats strip ─────────────────────────────────────────── */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Task Completion',  value: completionRate,                                       suffix: '%',  color: COLORS.lightGreen, bar: true },
                { label: 'Compliance Score', value: complianceScore,                                      suffix: '%',  color: complianceColor,   bar: true },
                { label: 'This Month Tasks', value: taskAnalytics?.total_tasks ?? stats?.total_tasks ?? 0, suffix: '',   color: '#93C5FD',         bar: false },
                { label: "Today's Hours",    value: getTodayDuration(),                                   suffix: '',   color: COLORS.amber,      bar: false, raw: true },
              ].map(({ label, value, suffix, color, bar, raw }) => (
                <div key={label} className="rounded-2xl bg-white/8 border border-white/10 p-3.5">
                  <p className="text-[9px] font-bold text-blue-200/60 uppercase tracking-widest mb-2">{label}</p>
                  <p className="text-xl font-black leading-none" style={{ color }}>
                    {raw ? value : `${value}${suffix}`}
                  </p>
                  {bar && !raw && (
                    <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(value, 100)}%` }}
                        transition={{ duration: 1.3, ease: 'easeOut', delay: 0.4 }}
                        className="h-full rounded-full"
                        style={{ background: color }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══ KEY METRICS ══════════════════════════════════════════════════ */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" variants={itemVariants}>
        <StatCard
          label="Total Tasks" icon={Briefcase} color={COLORS.deepBlue}
          value={stats?.total_tasks ?? 0}
          sub={`${stats?.completed_tasks ?? 0} done · ${stats?.pending_tasks ?? 0} pending`}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          label="Overdue Tasks" icon={AlertCircle} color={COLORS.coral}
          value={stats?.overdue_tasks ?? 0}
          sub={stats?.overdue_tasks > 0 ? 'Needs immediate attention' : 'All on schedule ✓'}
          onClick={() => navigate('/tasks?filter=overdue')}
          urgent={stats?.overdue_tasks > 0}
        />
        <StatCard
          label="Completion Rate" icon={TrendingUp} color={COLORS.emeraldGreen}
          value={`${completionRate}%`}
          sub={completionRate >= 70 ? 'Great progress 🎯' : 'Keep going!'}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          label="DSC Alerts" icon={Key}
          color={((stats?.expiring_dsc_count ?? 0) + (stats?.expired_dsc_count ?? 0)) > 0 ? COLORS.coral : COLORS.deepBlue}
          value={(stats?.expiring_dsc_count ?? 0) + (stats?.expired_dsc_count ?? 0)}
          sub={`${stats?.expired_dsc_count ?? 0} expired · ${stats?.expiring_dsc_count ?? 0} expiring`}
          onClick={() => navigate('/dsc?tab=expired')}
          urgent={((stats?.expiring_dsc_count ?? 0) + (stats?.expired_dsc_count ?? 0)) > 0}
        />
        <StatCard
          label="Today's Attendance" icon={Clock} color={COLORS.amber}
          value={getTodayDuration()}
          sub={todayAttendance?.punch_in
            ? `In at ${formatToLocalTime(todayAttendance.punch_in)}${currentMonthSummary ? ` · ${currentMonthSummary.days_present}d this month` : ''}`
            : 'Not clocked in'}
          onClick={() => navigate('/attendance')}
        />
      </motion.div>

      {/* ═══ RECENT TASKS · DEADLINES · ATTENDANCE ════════════════════════ */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={itemVariants}>

        {/* Recent Tasks */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                <Target className="h-4.5 w-4.5 text-blue-500" /> Recent Tasks
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 rounded-xl text-slate-400"
                onClick={() => navigate('/tasks')}>All →</Button>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Latest assignments & progress</p>
          </CardHeader>
          <CardContent className="p-5">
            {recentTasks.length === 0 ? (
              <div className="py-8 text-center text-slate-300">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No recent tasks</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {recentTasks.map(task => {
                  const ss  = getStatusStyle(task.status);
                  const ps  = getPriorityStyle(task.priority);
                  return (
                    <motion.div key={task.id} whileHover={{ y: -2 }}
                      onClick={() => navigate('/tasks')}
                      className={cn('py-3 px-4 rounded-2xl border cursor-pointer hover:shadow-md hover:border-blue-300 transition', ps.bg, ps.border)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm text-slate-900 truncate flex-1">
                          {task.title || 'Untitled Task'}
                        </p>
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap', ss.bg)}>
                          {task.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <CalendarIcon className="h-3 w-3" />
                        {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'No due date'}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                <CalendarIcon className="h-4.5 w-4.5 text-orange-500" /> Upcoming Deadlines
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 rounded-xl text-slate-400"
                onClick={() => navigate('/duedates')}>All →</Button>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Compliance calendar – next 30 days</p>
          </CardHeader>
          <CardContent className="p-5">
            {upcomingDueDates.length === 0 ? (
              <div className="py-8 text-center text-slate-300">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No upcoming deadlines</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {upcomingDueDates.map(due => {
                  const c = getDeadlineColor(due.days_remaining ?? 0);
                  return (
                    <motion.div key={due.id} whileHover={{ y: -2 }}
                      onClick={() => navigate('/duedates')}
                      className={cn('py-3 px-4 rounded-2xl border cursor-pointer hover:shadow-md hover:border-orange-300 transition', c.bg)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm text-slate-900 truncate flex-1">
                          {due.title || 'Untitled Deadline'}
                        </p>
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap', c.badge)}>
                          {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(due.due_date), 'MMM d, yyyy')}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                <Activity className="h-4.5 w-4.5 text-purple-500" /> Attendance
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 rounded-xl text-slate-400"
                onClick={() => navigate('/attendance')}>Log →</Button>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Track daily work hours</p>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {todayAttendance?.punch_in ? (
              <>
                <div className="flex items-center justify-between text-sm p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-2 text-slate-600">
                    <LogIn className="h-4 w-4 text-emerald-600" /> Punch In
                  </div>
                  <span className="font-bold text-emerald-700">{formatToLocalTime(todayAttendance.punch_in)}</span>
                </div>
                {todayAttendance.punch_out ? (
                  <div className="flex items-center justify-between text-sm p-3 bg-red-50 rounded-2xl border border-red-100">
                    <div className="flex items-center gap-2 text-slate-600">
                      <LogOut className="h-4 w-4 text-red-500" /> Punch Out
                    </div>
                    <span className="font-bold text-red-600">{formatToLocalTime(todayAttendance.punch_out)}</span>
                  </div>
                ) : (
                  <Button onClick={() => handlePunchAction('punch_out')} disabled={loading}
                    className="w-full bg-red-600 hover:bg-red-700 rounded-2xl">
                    <LogOut className="h-4 w-4 mr-1.5" /> Punch Out
                  </Button>
                )}
                <div className="text-center py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs text-slate-500">Total Hours Today</p>
                  <p className="text-3xl font-black mt-1" style={{ color: COLORS.deepBlue }}>
                    {getTodayDuration()}
                  </p>
                  {currentMonthSummary && (
                    <p className="text-xs text-slate-400 mt-1">
                      {currentMonthSummary.days_present}d · {currentMonthSummary.total_hours} this month
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="py-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Clock className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">Not punched in today</p>
                  {currentMonthSummary && (
                    <p className="text-xs text-slate-400 mt-1">
                      {currentMonthSummary.days_present}d · {currentMonthSummary.total_hours} this month
                    </p>
                  )}
                </div>
                <Button onClick={() => handlePunchAction('punch_in')} disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 rounded-2xl">
                  <LogIn className="h-4 w-4 mr-1.5" /> Punch In
                </Button>
              </>
            )}

            {/* Mini bar chart — NEW from /attendance/my-summary */}
            {attendanceBars.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Monthly Hours</p>
                <div className="flex items-end gap-1.5 h-9">
                  {attendanceBars.map((b, i) => (
                    <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(b.hours / maxBarHours) * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.07 }}
                        className="w-full rounded-t-sm min-h-[3px]"
                        style={{ background: i === attendanceBars.length - 1 ? COLORS.mediumBlue : '#CBD5E1' }}
                        title={`${b.label}: ${b.hours}h`}
                      />
                      <span className="text-[8px] text-slate-400">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ ASSIGNED TASKS – TWO COLUMNS ═════════════════════════════════ */}
      {showTaskSection && (
        <motion.div className="grid grid-cols-1 xl:grid-cols-2 gap-4" variants={itemVariants}>

          <Card className="flex flex-col border-slate-100 shadow-sm rounded-3xl overflow-hidden bg-white cursor-pointer hover:shadow-xl transition group"
            onClick={() => navigate('/tasks?filter=assigned-to-me')}>
            <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                    <Zap className="h-4.5 w-4.5 text-emerald-600" />
                    Tasks Assigned to Me
                    {tasksAssignedToMe.length > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black">
                        {tasksAssignedToMe.length}
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">Tasks others gave you</p>
                </div>
                <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 text-xs"
                  onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-to-me'); }}>
                  View All →
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex-1">
              {tasksAssignedToMe.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-slate-300 border border-dashed border-slate-200 rounded-3xl">
                  <CheckCircle2 className="h-8 w-8 mb-2" />
                  <p className="text-sm">No tasks assigned to you</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                  <AnimatePresence>
                    {tasksAssignedToMe.map(task => (
                      <TaskStrip key={task.id} task={task} isToMe={true}
                        assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus} navigate={navigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col border-slate-100 shadow-sm rounded-3xl overflow-hidden bg-white cursor-pointer hover:shadow-xl transition group"
            onClick={() => navigate('/tasks?filter=assigned-by-me')}>
            <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                    <Briefcase className="h-4.5 w-4.5 text-blue-600" />
                    Tasks Assigned by Me
                    {tasksAssignedByMe.length > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-black">
                        {tasksAssignedByMe.length}
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">Tasks you delegated</p>
                </div>
                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 text-xs"
                  onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-by-me'); }}>
                  View All →
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex-1">
              {tasksAssignedByMe.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-slate-300 border border-dashed border-slate-200 rounded-3xl">
                  <Circle className="h-8 w-8 mb-2" />
                  <p className="text-sm">No tasks assigned yet</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                  <AnimatePresence>
                    {tasksAssignedByMe.map(task => (
                      <TaskStrip key={task.id} task={task} isToMe={false}
                        assignedName={task.assigned_to_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus} navigate={navigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ═══ STAR PERFORMERS + TO-DO LIST ══════════════════════════════════ */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4" variants={itemVariants}>

        {/* Star Performers */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                  <Award className="h-4.5 w-4.5 text-yellow-500" /> Star Performers
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Top contributors by performance</p>
              </div>
              {isAdmin && (
                <div className="flex bg-slate-100 p-0.5 rounded-xl gap-px">
                  {['all', 'monthly', 'weekly'].map(p => (
                    <button key={p} onClick={() => setRankingPeriod(p)}
                      className={cn(
                        'h-7 px-3 rounded-[10px] text-[10px] font-bold transition-all',
                        rankingPeriod === p ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                      )}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {rankings.length === 0 ? (
              <div className="py-10 text-center text-slate-300">
                <Star className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No ranking data</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                <AnimatePresence>
                  {rankings.slice(0, 5).map((m, i) => (
                    <RankingItem key={m.user_id || i} member={m} index={i} period={rankingPeriod} />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {rankings.length > 5 && (
              <div className="text-right mt-4">
                <button onClick={() => navigate('/reports')} className="text-sm text-blue-600 hover:underline font-medium">
                  View All Rankings →
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My To-Do List */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                  <ListTodo className="h-4.5 w-4.5 text-blue-500" />
                  My To-Do List
                  {todosPending > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-black">
                      {todosPending}
                    </span>
                  )}
                  {todosOverdue > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-red-100 text-red-600 text-[9px] font-black px-1">
                      {todosOverdue}⚠
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {todos.filter(t => t.completed).length}/{todos.length} done
                  {todosOverdue > 0 && ` · ${todosOverdue} overdue`}
                </p>
              </div>
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 rounded-xl text-slate-400"
                  onClick={() => navigate('/todo-list')}>All →</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {/* Add input */}
            <div className="flex flex-wrap gap-3 mb-5">
              <input
                type="text"
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTodo()}
                placeholder="Add new task..."
                className="flex-1 p-3.5 text-sm border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-400 bg-slate-50 focus:bg-white transition-colors"
              />
              <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon"
                    className={cn('border-slate-200 rounded-2xl h-11 w-11', !selectedDueDate && 'text-slate-400')}>
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
                  <CalendarComponent mode="single" selected={selectedDueDate}
                    onSelect={d => { setSelectedDueDate(d); setShowDueDatePicker(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button onClick={addTodo} disabled={!newTodo.trim()}
                className="px-6 rounded-2xl h-11 font-bold" style={{ background: COLORS.deepBlue }}>
                Add
              </Button>
              {selectedDueDate && (
                <span className="text-xs text-amber-600 self-center font-medium">
                  📅 {format(selectedDueDate, 'MMM d, yyyy')}
                </span>
              )}
            </div>

            {todos.length === 0 ? (
              <div className="py-8 text-center text-slate-300">
                <CheckSquare className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No todos yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                <AnimatePresence>
                  {todos.map(todo => (
                    <motion.div
                      key={todo._id || todo.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className={cn(
                        'flex items-center justify-between gap-4 p-4 rounded-2xl border',
                        todo.completed ? 'bg-emerald-50/60 border-emerald-100'
                          : isOverdue(todo.due_date) ? 'bg-red-50/40 border-red-200'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200 transition-colors'
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => handleToggleTodo(todo._id || todo.id)}
                          className="h-4.5 w-4.5 accent-emerald-600 flex-shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={cn('block text-sm font-medium',
                            todo.completed ? 'line-through text-slate-400' : 'text-slate-900')}>
                            {todo.title}
                            {!todo.completed && isOverdue(todo.due_date) && (
                              <span className="ml-2 text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                                OVERDUE
                              </span>
                            )}
                          </span>
                          <div className="flex gap-2 mt-0.5">
                            {todo.created_at && (
                              <p className="text-[10px] text-slate-400">
                                Added {format(new Date(todo.created_at), 'MMM d, yyyy')}
                              </p>
                            )}
                            {todo.due_date && (
                              <p className={cn('text-[10px] font-medium',
                                isOverdue(todo.due_date) && !todo.completed ? 'text-red-500' : 'text-amber-600')}>
                                · Due {format(new Date(todo.due_date), 'MMM d, yyyy')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button variant="destructive" size="sm" className="rounded-xl text-xs h-8 px-3 shrink-0"
                        onClick={() => handleDeleteTodo(todo._id || todo.id)}>
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

      {/* ═══ INTEL ROW — Compliance · Birthdays · DSC Watch · Holidays ═══ */}
      <motion.div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" variants={itemVariants}>

        {/* Compliance Health — uses stats.compliance_status (was completely unused) */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: complianceColor }} />
              Compliance Health
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex flex-col items-center py-2">
              <div className="relative w-24 h-24 mb-3">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                  <motion.circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={complianceColor} strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - complianceScore / 100) }}
                    transition={{ duration: 1.4, ease: 'easeOut', delay: 0.5 }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black" style={{ color: complianceColor }}>{complianceScore}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">score</span>
                </div>
              </div>
              <p className="text-xs font-bold" style={{ color: complianceColor }}>
                {complianceStatus === 'good' ? '✓ Good Standing'
                  : complianceStatus === 'warning' ? '⚠ Needs Attention'
                  : '✕ Critical'}
              </p>
              <div className="mt-3 w-full space-y-1.5">
                {[
                  ['Overdue Tasks',      stats?.compliance_status?.overdue_tasks         ?? 0, true],
                  ['Expiring Certs',     stats?.compliance_status?.expiring_certificates  ?? 0, true],
                  ['Upcoming Deadlines', stats?.upcoming_due_dates  ?? 0, false],
                  ['Client Birthdays',   stats?.upcoming_birthdays  ?? 0, false],
                ].map(([label, val, bad]) => (
                  <div key={label} className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">{label}</span>
                    <span className={cn('font-bold', bad && val > 0 ? 'text-red-600' : 'text-slate-700')}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Birthdays — NEW: uses /clients/upcoming-birthdays */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Gift className="h-4 w-4 text-pink-500" />
              Client Birthdays
              {upcomingBirthdays.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-pink-100 text-pink-700 text-[9px] font-black px-1">
                  {upcomingBirthdays.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {upcomingBirthdays.length === 0 ? (
              <div className="py-8 text-center text-slate-300">
                <Gift className="h-7 w-7 mx-auto mb-2" />
                <p className="text-xs">No birthdays in next 7 days</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingBirthdays.slice(0, 4).map((c, i) => (
                  <motion.div key={c.id || i} whileHover={{ x: 2 }}
                    onClick={() => navigate('/clients')}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-pink-50/60 border border-pink-100 cursor-pointer hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 rounded-2xl bg-pink-200 flex items-center justify-center text-pink-700 font-bold shrink-0">
                      {c.company_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{c.company_name}</p>
                      {c.contact_name && <p className="text-[10px] text-slate-400 truncate">{c.contact_name}</p>}
                    </div>
                    <p className="text-xs font-bold text-pink-600 shrink-0">
                      {c.days_until_birthday === 0 ? '🎂 Today!' : `${c.days_until_birthday}d`}
                    </p>
                  </motion.div>
                ))}
                {upcomingBirthdays.length > 4 && (
                  <p className="text-[10px] text-center text-slate-400">+{upcomingBirthdays.length - 4} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* DSC Expiry Watch — uses stats.expiring_dsc_list (was unused in original) */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Key className="h-4 w-4 text-red-500" /> DSC Watch
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 rounded-xl text-slate-400"
                onClick={() => navigate('/dsc')}>All →</Button>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {(!stats?.expiring_dsc_list?.length) ? (
              <div className="py-8 text-center text-slate-300">
                <Key className="h-7 w-7 mx-auto mb-2" />
                <p className="text-xs">All DSCs valid ✓</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {stats.expiring_dsc_list.slice(0, 4).map((dsc, i) => (
                  <motion.div key={dsc.id || i} whileHover={{ x: 2 }}
                    onClick={() => navigate('/dsc')}
                    className={cn('flex items-center gap-3 p-3 rounded-2xl border cursor-pointer hover:shadow-sm transition-all',
                      dsc.days_left < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-100')}
                  >
                    <div className={cn('w-9 h-9 rounded-2xl flex items-center justify-center shrink-0',
                      dsc.days_left < 0 ? 'bg-red-200' : 'bg-amber-200')}>
                      <Key className={cn('h-4 w-4', dsc.days_left < 0 ? 'text-red-700' : 'text-amber-700')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{dsc.holder_name}</p>
                      <p className="text-[10px] text-slate-400">{dsc.certificate_number || 'N/A'}</p>
                    </div>
                    <p className={cn('text-[10px] font-bold shrink-0',
                      dsc.days_left < 0 ? 'text-red-600' : 'text-amber-600')}>
                      {dsc.days_left < 0 ? `${Math.abs(dsc.days_left)}d ago` : `${dsc.days_left}d`}
                    </p>
                  </motion.div>
                ))}
                {stats.expiring_dsc_list.length > 4 && (
                  <p className="text-[10px] text-center text-slate-400">+{stats.expiring_dsc_list.length - 4} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Holidays — NEW: uses /holidays */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden bg-white">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Star className="h-4 w-4 text-indigo-500" />
              Upcoming Holidays
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {upcomingHolidays.length === 0 ? (
              <div className="py-8 text-center text-slate-300">
                <Star className="h-7 w-7 mx-auto mb-2" />
                <p className="text-xs">No upcoming holidays</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingHolidays.map((h, i) => {
                  const hDate    = new Date(h.date);
                  const isToday_ = isToday(hDate);
                  const isTmrw   = isTomorrow(hDate);
                  return (
                    <div key={h.date || i}
                      className={cn('flex items-center gap-3 p-3 rounded-2xl border',
                        isToday_ ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100')}
                    >
                      <div className={cn('w-10 h-10 rounded-2xl flex flex-col items-center justify-center shrink-0',
                        isToday_ ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600')}>
                        <span className="text-[8px] font-bold leading-none">{format(hDate, 'MMM').toUpperCase()}</span>
                        <span className="text-base font-black leading-tight">{format(hDate, 'd')}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{h.name || 'Holiday'}</p>
                        <p className="text-[10px] text-slate-400">
                          {isToday_ ? '🎉 Today!' : isTmrw ? 'Tomorrow' : format(hDate, 'EEEE')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══ QUICK ACCESS TILES — original exactly preserved ═══════════════ */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4" variants={itemVariants}>
        {[
          { label: 'Leads',             sub: 'Pipeline',                   icon: Target,    color: COLORS.mediumBlue,   path: '/leads',     count: null },
          { label: 'Clients',           sub: 'Active accounts',            icon: Building2, color: COLORS.emeraldGreen, path: '/clients',   count: stats?.total_clients },
          { label: 'DSC Certificates',  sub: 'Digital signatures',         icon: Key,       color: COLORS.coral,        path: '/dsc',       count: stats?.total_dsc,      urgent: stats?.expiring_dsc_count > 0 },
          { label: 'Compliance Cal',    sub: 'Due dates',                  icon: CalendarIcon, color: COLORS.amber,    path: '/duedates',  count: stats?.upcoming_due_dates, urgent: stats?.upcoming_due_dates > 0 },
          isAdmin && { label: 'Team Members', sub: 'Your team',            icon: Users,     color: COLORS.mediumBlue,   path: '/users',     count: stats?.team_workload?.length },
        ].filter(Boolean).map(tile => (
          <motion.div key={tile.label}
            whileHover={{ y: -5, scale: 1.01, transition: springPhysics.lift }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate(tile.path)}
            className={cn(
              'relative rounded-3xl border cursor-pointer group overflow-hidden transition-all hover:shadow-xl',
              tile.urgent ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100 bg-white hover:border-slate-200'
            )}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3.5 rounded-2xl group-hover:scale-125 transition-transform shrink-0"
                style={{ backgroundColor: `${tile.color}15` }}>
                <tile.icon className="h-5 w-5" style={{ color: tile.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-black tracking-tight truncate" style={{ color: COLORS.deepBlue }}>
                  {tile.count != null ? tile.count : tile.label}
                </p>
                <p className="text-xs text-slate-500">{tile.count != null ? tile.label : tile.sub}</p>
              </div>
            </CardContent>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══ PUNCH-IN GATE MODAL — original preserved exactly ═══════════════ */}
      <AnimatePresence>
        {mustPunchIn && (
          <motion.div
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 40 }}
              transition={{ type: 'spring', stiffness: 160, damping: 18 }}
              className="bg-white w-full max-w-md mx-4 p-6 md:p-10 rounded-3xl shadow-2xl text-center relative"
            >
              <motion.h2
                className="text-3xl font-bold mb-3"
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              >
                {getGreeting()}
              </motion.h2>
              <p className="text-slate-500 mb-8">Please punch in to begin your workday.</p>
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Button
                  onClick={async () => {
                    await handlePunchAction('punch_in');
                    setMustPunchIn(false);
                    document.body.style.overflow = 'auto';
                  }}
                  disabled={loading}
                  className="w-full h-12 text-lg bg-green-600 hover:bg-green-700 rounded-2xl shadow-lg hover:shadow-xl transition-all"
                >
                  {loading ? 'Punching In...' : 'Punch In'}
                </Button>
              </motion.div>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await api.post('/attendance/mark-leave-today');
                      toast.success('Marked on leave today');
                      queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });
                      setMustPunchIn(false);
                      document.body.style.overflow = 'auto';
                    } catch { toast.error('Failed to mark leave'); }
                    finally { setLoading(false); }
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
