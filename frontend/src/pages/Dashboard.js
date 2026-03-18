import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
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
  MapPin,
  Repeat,
  Plus,
} from 'lucide-react';

// ── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  emeraldGreen:'#1FAF5A',
  lightGreen:  '#5CCB5F',
  coral:       '#FF6B6B',
  amber:       '#F59E0B',
};

// ── Spring Physics ────────────────────────────────────────────────────────────
const springPhysics = {
  card:   { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: "spring", stiffness: 320, damping: 24, mass: 0.9  },
  button: { type: "spring", stiffness: 400, damping: 28 },
  icon:   { type: "spring", stiffness: 450, damping: 25 },
  tap:    { type: "spring", stiffness: 500, damping: 30 },
};

// ── Animation Variants ────────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.3 } },
};

// ── Priority Stripe Helper ────────────────────────────────────────────────────
const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-[3px] border-l-red-500';
  if (p === 'urgent')   return 'border-l-[3px] border-l-orange-400';
  if (p === 'medium')   return 'border-l-[3px] border-l-emerald-500';
  if (p === 'low')      return 'border-l-[3px] border-l-blue-400';
  return 'border-l-[3px] border-l-slate-200';
};

// ── Visit Status meta ─────────────────────────────────────────────────────────
const VISIT_STATUS_COLORS = {
  scheduled:   { bg: 'bg-blue-50 dark:bg-blue-900/30',    text: 'text-blue-600 dark:text-blue-400',    dot: 'bg-blue-500'    },
  completed:   { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  missed:      { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-500 dark:text-orange-400', dot: 'bg-orange-400'  },
  cancelled:   { bg: 'bg-red-50 dark:bg-red-900/20',      text: 'text-red-500 dark:text-red-400',      dot: 'bg-red-500'     },
  rescheduled: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-500 dark:text-purple-400', dot: 'bg-purple-500'  },
};

// ── Task Strip Component ──────────────────────────────────────────────────────
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status     = task.status || 'pending';
  const isCompleted  = status === 'completed';
  const isInProgress = status === 'in_progress';

  return (
    <motion.div
      whileHover={{ y: -3, transition: springPhysics.lift }}
      whileTap={{ scale: 0.99, transition: springPhysics.tap }}
      className={`relative flex flex-col p-3 rounded-xl border bg-white dark:bg-slate-800 cursor-pointer group transition-all
        ${getPriorityStripeClass(task.priority)}
        ${isCompleted
          ? 'opacity-75 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
        }
      `}
      onClick={() => navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm truncate leading-tight transition ${
            isCompleted
              ? 'line-through text-slate-400 dark:text-slate-500'
              : 'text-slate-800 dark:text-slate-100'
          }`}>
            {task.title || 'Untitled Task'}
            {task.client_name && (
              <span className="text-slate-400 dark:text-slate-500 font-normal"> · {task.client_name}</span>
            )}
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
                  : 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30'
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
                  : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
              }`}
            >
              {isCompleted ? '✓ Done' : 'Done'}
            </motion.button>
          </div>
        )}
      </div>
      <div className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          {isToMe ? 'From: ' : 'To: '}
          <span className="font-medium text-slate-600 dark:text-slate-300">{assignedName || 'Unknown'}</span>
        </span>
        <span>· {format(new Date(task.created_at || Date.now()), 'MMM d · hh:mm a')}</span>
        {task.due_date && (
          <span>· Due: <span className="text-amber-600 dark:text-amber-400 font-medium">{format(new Date(task.due_date), 'MMM d, yyyy')}</span></span>
        )}
      </div>
    </motion.div>
  );
}

// ── Shared Card Shell ─────────────────────────────────────────────────────────
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Card Header Row ───────────────────────────────────────────────────────────
function CardHeaderRow({ iconBg, icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ── Visits Dashboard Card ─────────────────────────────────────────────────────
function VisitsCard({ isDark, navigate }) {
  const { data: visits = [], isLoading, isError } = useQuery({
    queryKey: ['visits-upcoming-dashboard'],
    queryFn: () => api.get('/visits/upcoming', { params: { days: 7 } }).then(r => r.data),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,                   // don't retry on 404 — backend may not be wired yet
    onError: () => {},              // suppress console error noise
  });

  const todayCount    = visits.filter(v => isToday(parseISO(v.visit_date))).length;
  const tomorrowCount = visits.filter(v => isTomorrow(parseISO(v.visit_date))).length;

  const subtitleText = todayCount > 0
    ? `${todayCount} today`
    : tomorrowCount > 0
    ? `${tomorrowCount} tomorrow`
    : 'Next 7 days';

  return (
    <SectionCard>
      {/* Header */}
      <CardHeaderRow
        iconBg={isDark ? 'bg-teal-900/40' : 'bg-teal-50'}
        icon={<MapPin className="h-4 w-4 text-teal-500" />}
        title="Client Visits"
        subtitle={subtitleText}
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              className={`h-7 w-7 p-0 rounded-lg ${isDark ? 'text-teal-400 hover:text-teal-300' : 'text-teal-500'}`}
              onClick={() => navigate('/visits?action=new')}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className={`text-xs h-7 px-3 ${isDark ? 'text-teal-400 hover:text-teal-300' : 'text-teal-500'}`}
              onClick={() => navigate('/visits')}
            >
              View All
            </Button>
          </div>
        }
      />

      {/* Body */}
      <div className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="text-center py-7 space-y-3">
            <div className="flex justify-center">
              <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <MapPin className="h-6 w-6 text-slate-300 dark:text-slate-500" />
              </div>
            </div>
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Visit module not connected yet
            </p>
            <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
              Add the visits router to your backend
            </p>
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-7 space-y-3">
            <div className="flex justify-center">
              <div className={`p-3 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <MapPin className="h-6 w-6 text-slate-300 dark:text-slate-500" />
              </div>
            </div>
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              No visits in next 7 days
            </p>
            <Button
              size="sm"
              onClick={() => navigate('/visits?action=new')}
              className="rounded-xl text-white text-xs"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
            >
              <Plus className="h-3 w-3 mr-1" /> Schedule Visit
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            <AnimatePresence>
              {visits.map((v, i) => {
                const sc  = VISIT_STATUS_COLORS[v.status] || VISIT_STATUS_COLORS.scheduled;
                const isT = isToday(parseISO(v.visit_date));
                return (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05, ...springPhysics.card } }}
                    whileHover={{ y: -2, transition: springPhysics.lift }}
                    onClick={() => navigate('/visits')}
                    className={`relative flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all group ${
                      isT
                        ? 'border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-900/15 hover:border-teal-300 dark:hover:border-teal-700'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* Date column */}
                    <div className="flex-shrink-0 w-12 text-center">
                      <div className={`rounded-lg overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                        <div
                          className="py-0.5 text-[8px] font-bold text-white uppercase"
                          style={{ background: isT ? COLORS.emeraldGreen : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                        >
                          {isT ? 'TODAY' : format(parseISO(v.visit_date), 'MMM')}
                        </div>
                        <div className={`py-1 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                          <p className={`text-base font-black leading-none ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                            {format(parseISO(v.visit_date), 'd')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                          {v.client_name || '—'}
                        </p>
                        <span className={cn('flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1', sc.bg, sc.text)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', sc.dot)} />
                          {v.status}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {v.purpose}
                      </p>
                      <div className={`flex items-center gap-2 mt-1 flex-wrap text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {v.visit_time && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />{v.visit_time}
                          </span>
                        )}
                        {v.location && (
                          <span className="flex items-center gap-0.5 truncate max-w-[100px]">
                            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />{v.location.slice(0, 25)}
                          </span>
                        )}
                        {v.recurrence && v.recurrence !== 'none' && (
                          <span className="flex items-center gap-0.5 text-purple-400">
                            <Repeat className="h-2.5 w-2.5" />{v.recurrence}
                          </span>
                        )}
                        <span className="ml-auto font-medium" style={{ color: COLORS.mediumBlue }}>
                          {v.assigned_to_name?.split(' ')[0]}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-slate-400' : 'text-slate-300'}`} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer */}
      {visits.length > 0 && (
        <div className={`px-4 py-2 border-t flex items-center justify-between ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'}`}>
          <div className="flex items-center gap-3">
            {visits.filter(v => v.status === 'scheduled').length > 0 && (
              <span className="text-xs font-semibold text-blue-500">
                {visits.filter(v => v.status === 'scheduled').length} Scheduled
              </span>
            )}
            {visits.filter(v => v.status === 'completed').length > 0 && (
              <span className="text-xs font-semibold text-emerald-500">
                {visits.filter(v => v.status === 'completed').length} Completed
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/visits')}
            className={`text-xs font-semibold flex items-center gap-0.5 hover:underline ${isDark ? 'text-teal-400' : 'text-teal-600'}`}
          >
            Full Plan <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ── Main Dashboard Component ──────────────────────────────────────────────────
export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const [loading, setLoading]           = useState(false);
  const [rankings, setRankings]         = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState('monthly');
  const [newTodo, setNewTodo]           = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedDueDate, setSelectedDueDate]     = useState(undefined);
  const [mustPunchIn, setMustPunchIn]   = useState(false);
  const [actionDone, setActionDone]     = useState(false);

  // Dark mode observer
  const [isDark, setIsDark] = useState(() =>
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: tasks = [] }            = useTasks();
  const { data: stats }                 = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance }       = useTodayAttendance();
  const updateTaskMutation              = useUpdateTask();

  // Holidays query
  const { data: holidaysData = [] } = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      const res = await api.get('/holidays');
      return res.data || [];
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // ── Todos ───────────────────────────────────────────────────────────────────
  const { data: todosRaw = [] } = useQuery({
    queryKey: ['todos', 'dashboard-card', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await api.get('/todos', { params: { user_id: user.id } });
      return res.data;
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // ── Derived values ──────────────────────────────────────────────────────────
  const todayIsHoliday = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return holidaysData.some(h => h.date === today && h.status === 'confirmed');
  }, [holidaysData]);

  const todayHolidayName = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return holidaysData.find(h => h.date === today && h.status === 'confirmed')?.name || '';
  }, [holidaysData]);

  const todos = useMemo(() =>
    todosRaw.map(todo => ({
      ...todo,
      completed: todo.status === 'completed' || todo.is_completed === true,
    })),
    [todosRaw]
  );

  const pendingTodos = useMemo(() => todos.filter(todo => !todo.completed), [todos]);

  const tasksAssignedToMe = useMemo(() =>
    tasks.filter(t => t.assigned_to === user?.id && t.status !== 'completed').slice(0, 6),
    [tasks, user?.id]
  );

  const tasksAssignedByMe = useMemo(() =>
    tasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id).slice(0, 6),
    [tasks, user?.id]
  );

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  // Rankings
  useEffect(() => {
    async function fetchRankings() {
      try {
        const period = rankingPeriod === 'all' ? 'all_time' : rankingPeriod;
        const res = await api.get('/reports/performance-rankings', { params: { period } });
        setRankings(res.data || []);
      } catch (err) {
        console.warn('Failed to fetch rankings:', err);
        setRankings([]);
      }
    }
    fetchRankings();
  }, [rankingPeriod]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createTodo = useMutation({
    mutationFn: data => api.post('/todos', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', 'dashboard-card', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Todo added');
    },
    onError: () => toast.error('Failed to add todo'),
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, status }) =>
      api.patch(`/todos/${id}`, { is_completed: status === 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', 'dashboard-card', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Todo updated');
    },
    onError: () => toast.error('Failed to update todo'),
  });

  const deleteTodo = useMutation({
    mutationFn: id => api.delete(`/todos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', 'dashboard-card', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Todo deleted');
    },
    onError: () => toast.error('Failed to delete todo'),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const addTodo = () => {
    if (!newTodo.trim()) return;
    createTodo.mutate({
      title:    newTodo.trim(),
      status:   'pending',
      due_date: selectedDueDate ? selectedDueDate.toISOString() : null,
    });
    setNewTodo('');
    setSelectedDueDate(undefined);
  };

  const handleToggleTodo = (id) => {
    const todo = todosRaw.find(t => t.id === id || t._id === id);
    if (!todo) return;
    const currentCompleted = todo.is_completed === true || todo.status === 'completed';
    updateTodo.mutate({ id: todo.id || todo._id, status: currentCompleted ? 'pending' : 'completed' });
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
      if (action === 'punch_in') {
        setActionDone(true);
        setMustPunchIn(false);
        document.body.style.overflow = 'auto';
      }
      await queryClient.refetchQueries({ queryKey: ['todayAttendance'] });
      await queryClient.refetchQueries({ queryKey: ['holidays'] });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Attendance action failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Utility helpers ─────────────────────────────────────────────────────────
  const getTodayDuration = () => {
    if (!todayAttendance?.punch_in) return '0h 0m';
    if (todayAttendance.punch_out) {
      const mins = todayAttendance.duration_minutes || 0;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    const punchInStr  = todayAttendance.punch_in;
    const punchInDate = new Date(punchInStr.endsWith('Z') ? punchInStr : punchInStr + 'Z');
    const diffMs = Date.now() - punchInDate.getTime();
    return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
  };

  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
    : 0;

  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) =>
        prev.days_remaining < curr.days_remaining ? prev : curr)
    : null;

  const isAdmin        = user?.role === 'admin';
  const showTaskSection = isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;
  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  const getStatusStyle = (status) => {
    const styles = {
      completed:   { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
      in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-700 dark:text-blue-400',       dot: 'bg-blue-500'    },
      pending:     { bg: 'bg-slate-100 dark:bg-slate-700',         text: 'text-slate-600 dark:text-slate-300',     dot: 'bg-slate-400'   },
    };
    return styles[status] || styles.pending;
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      high:   { bg: 'bg-red-50 dark:bg-red-900/20',    text: 'text-red-600',    border: 'border-red-200 dark:border-red-800'    },
      medium: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600', border: 'border-amber-200 dark:border-amber-800' },
      low:    { bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-600',  border: 'border-blue-200 dark:border-blue-800'  },
    };
    return styles[priority?.toLowerCase()] || styles.medium;
  };

  const getDeadlineColor = (daysLeft) => {
    if (daysLeft <= 0)  return { bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30',           badge: 'bg-red-500 text-white',    text: 'text-red-600'    };
    if (daysLeft <= 7)  return { bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 hover:bg-orange-100',                     badge: 'bg-orange-500 text-white', text: 'text-orange-600' };
    if (daysLeft <= 15) return { bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100',                     badge: 'bg-yellow-500 text-white', text: 'text-yellow-600' };
    return              { bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100', badge: 'bg-green-600 text-white', text: 'text-green-700' };
  };

  const formatToLocalTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    return format(d, 'hh:mm a');
  };

  // ── Ranking Item ────────────────────────────────────────────────────────────
  const RankingItem = React.memo(({ member, index, period }) => {
    const rank     = index + 1;
    const isGold   = index === 0;
    const isSilver = index === 1;
    const isBronze = index === 2;
    const isPodium = isGold || isSilver || isBronze;
    const medal    = isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : null;

    const rowStyle = isGold
      ? { background: 'linear-gradient(135deg, #7B5A0A 0%, #C9920A 40%, #FFD700 100%)', border: '1px solid #E2AA00' }
      : isSilver
      ? { background: 'linear-gradient(135deg, #3A3A3A 0%, #707070 40%, #C0C0C0 100%)', border: '1px solid #A8A8A8' }
      : isBronze
      ? { background: 'linear-gradient(135deg, #5C2E00 0%, #A0521A 40%, #CD7F32 100%)', border: '1px solid #B87030' }
      : isDark
      ? { background: '#1e293b', border: '1px solid #334155' }
      : { background: '#f8fafc', border: '1px solid #e2e8f0' };

    return (
      <motion.div
        whileHover={{ y: -2, scale: 1.01, transition: springPhysics.lift }}
        className="flex items-center justify-between p-3 rounded-xl transition-all hover:shadow-lg cursor-default"
        style={rowStyle}
      >
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
            isPodium ? 'bg-black/20 text-white' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
          }`}>
            {medal || `#${rank}`}
          </div>
          <div className={`w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 ring-2 ${
            isGold ? 'ring-yellow-300/60' : isSilver ? 'ring-slate-300/60' : isBronze ? 'ring-orange-300/60' : isDark ? 'ring-slate-600' : 'ring-slate-200'
          }`}>
            {member.profile_picture ? (
              <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-bold text-sm"
                style={{
                  background: isPodium
                    ? 'rgba(0,0,0,0.25)'
                    : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`,
                  color: 'white',
                }}
              >
                {member.user_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm leading-tight truncate ${isPodium ? 'text-white' : isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              {member.user_name || 'Unknown'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isPodium ? 'bg-black/20 text-white' : isDark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {member.overall_score}%
              </span>
              <span className={`text-[10px] truncate max-w-[72px] ${isPodium ? 'text-white/65' : isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                {member.badge || 'Good Performer'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className={`text-sm font-bold tracking-tight ${isPodium ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {member.total_hours
              ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
              : '0h 00m'}
          </p>
          <p className={`text-[10px] ${isPodium ? 'text-white/55' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {period === 'weekly' ? 'this week' : period === 'monthly' ? 'this month' : 'this period'}
          </p>
        </div>
      </motion.div>
    );
  });

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning ☀️';
    if (h < 17) return 'Good Afternoon 🌤️';
    if (h < 21) return 'Good Evening 🌆';
    return 'Working Late? 🌙';
  };

  // ── Punch-In gate logic ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!todayAttendance) {
      setMustPunchIn(false);
      document.body.style.overflow = 'auto';
      return;
    }
    if (actionDone)           { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayIsHoliday)       { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayAttendance.status === 'leave') { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayAttendance.punch_in)           { setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }
    if (todayAttendance.status === 'absent'){ setMustPunchIn(false); document.body.style.overflow = 'auto'; return; }

    setMustPunchIn(true);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, [todayAttendance, todayIsHoliday, actionDone]);

  const metricCardCls     = 'rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border';
  const metricCardDefault = isDark
    ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
    : 'bg-white border-slate-200/80 hover:border-slate-300';

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Welcome Banner ────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{
            background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
            boxShadow: `0 8px 32px rgba(13,59,102,0.28)`,
          }}
        >
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute right-24 bottom-0 w-32 h-32 rounded-full mb-[-30px] opacity-5"
            style={{ background: 'white' }} />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Welcome back, {user?.full_name?.split(' ')[0] || 'User'} 👋
              </h1>
              <p className="text-white/60 text-sm mt-1">
                {todayIsHoliday
                  ? `🎉 Today is a holiday${todayHolidayName ? ` — ${todayHolidayName}` : ''}. Have a great day!`
                  : "Here's your business overview for today."}
              </p>
            </div>
            {nextDeadline && (
              <motion.div
                whileHover={{ scale: 1.03, y: -2, transition: springPhysics.card }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(8px)',
                }}
                onClick={() => navigate('/duedates')}
              >
                <div className="p-2 rounded-lg bg-white/15">
                  <CalendarIcon className="h-4 w-4 text-white" />
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

      {/* ── Key Metrics ──────────────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" variants={itemVariants}>

        {/* Total Tasks */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks')}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Total Tasks</p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                  {stats?.total_tasks || 0}
                </p>
              </div>
              <div className="p-2 rounded-xl group-hover:scale-110 transition-transform"
                style={{ backgroundColor: isDark ? 'rgba(96,165,250,0.12)' : `${COLORS.deepBlue}12` }}>
                <Briefcase className="h-4 w-4" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }} />
              </div>
            </div>
            <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-blue-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Overdue */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks?filter=overdue')}
          className={`${metricCardCls} ${
            stats?.overdue_tasks > 0
              ? isDark ? 'bg-red-900/20 border-red-800 hover:border-red-700' : 'bg-red-50/60 border-red-200 hover:border-red-300'
              : metricCardDefault
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Overdue</p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.coral }}>
                  {stats?.overdue_tasks || 0}
                </p>
              </div>
              <div className="p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ backgroundColor: `${COLORS.coral}18` }}>
                <AlertCircle className="h-4 w-4" style={{ color: COLORS.coral }} />
              </div>
            </div>
            <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-red-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Completion Rate */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks')}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Completion</p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                  {completionRate}%
                </p>
              </div>
              <div className="p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ backgroundColor: `${COLORS.emeraldGreen}12` }}>
                <TrendingUp className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <div className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${completionRate}%`, background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}
              />
            </div>
          </CardContent>
        </motion.div>

        {/* DSC Alerts */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/dsc?tab=expired')}
          className={`${metricCardCls} ${
            stats?.expiring_dsc_count > 0
              ? isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50/50 border-red-200'
              : metricCardDefault
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>DSC Alerts</p>
                <p className="text-2xl font-bold mt-1 tracking-tight text-red-500">
                  {(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
                </p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {stats?.expired_dsc_count || 0} expired · {stats?.expiring_dsc_count || 0} expiring
                </p>
              </div>
              <div className={`p-2 rounded-xl group-hover:scale-110 transition-transform ${isDark ? 'bg-red-900/40' : 'bg-red-100'}`}>
                <Key className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </motion.div>

        {/* Today's Attendance */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/attendance')}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Today</p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: isDark ? '#fbbf24' : COLORS.deepBlue }}>
                  {todayIsHoliday ? '🎉' : getTodayDuration()}
                </p>
              </div>
              <div className="p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ backgroundColor: `${COLORS.amber}18` }}>
                <Clock className="h-4 w-4" style={{ color: COLORS.amber }} />
              </div>
            </div>
            <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:text-amber-500 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>{todayIsHoliday ? todayHolidayName || 'Holiday today' : 'View details'}</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

      </motion.div>

      {/* ── Recent Tasks + Deadlines + Attendance ─────────────────────────── */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-3" variants={itemVariants}>

        {/* Recent Tasks */}
        <SectionCard>
          <CardHeaderRow
            iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
            icon={<Target className="h-4 w-4 text-blue-500" />}
            title="Recent Tasks"
            subtitle="Latest assignments"
            action={
              <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500'}`}
                onClick={() => navigate('/tasks')}>
                View All
              </Button>
            }
          />
          <div className="p-3">
            {recentTasks.length === 0 ? (
              <div className={`text-center py-7 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No recent tasks</div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {recentTasks.map(task => {
                    const statusStyle   = getStatusStyle(task.status);
                    const priorityStyle = getPriorityStyle(task.priority);
                    return (
                      <motion.div
                        key={task.id}
                        variants={itemVariants}
                        whileHover={{ y: -1 }}
                        className={`py-2.5 px-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${priorityStyle.bg} ${priorityStyle.border}`}
                        onClick={() => navigate('/tasks')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className={`font-medium text-sm truncate flex-1 mr-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                            {task.title || 'Untitled Task'}
                          </p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${statusStyle.bg} ${statusStyle.text} whitespace-nowrap`}>
                            {task.status?.replace('_', ' ') || 'PENDING'}
                          </span>
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
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
          <CardHeaderRow
            iconBg={isDark ? 'bg-orange-900/40' : 'bg-orange-50'}
            icon={<CalendarIcon className="h-4 w-4 text-orange-500" />}
            title="Upcoming Deadlines"
            subtitle="Next 30 days"
            action={
              <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-orange-400 hover:text-orange-300' : 'text-orange-500'}`}
                onClick={() => navigate('/duedates')}>
                View All
              </Button>
            }
          />
          <div className="p-3">
            {upcomingDueDates.length === 0 ? (
              <div className={`text-center py-7 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No upcoming deadlines</div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {upcomingDueDates.map(due => {
                    const color = getDeadlineColor(due.days_remaining || 0);
                    return (
                      <motion.div
                        key={due.id}
                        variants={itemVariants}
                        whileHover={{ y: -1 }}
                        className={`py-2.5 px-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${color.bg}`}
                        onClick={() => navigate('/duedates')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className={`font-medium text-sm truncate flex-1 mr-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                            {due.title || 'Untitled Deadline'}
                          </p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${color.badge} whitespace-nowrap`}>
                            {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
                          </span>
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
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

        {/* Attendance Card */}
        <SectionCard>
          <CardHeaderRow
            iconBg={isDark ? 'bg-purple-900/40' : 'bg-purple-50'}
            icon={<Activity className="h-4 w-4 text-purple-500" />}
            title="Attendance"
            subtitle="Daily work hours"
            action={
              <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-500'}`}
                onClick={() => navigate('/attendance')}>
                View Log
              </Button>
            }
          />
          <div className="p-3">
            {todayIsHoliday ? (
              <div
                className="rounded-xl px-4 py-4 text-center"
                style={{
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))'
                    : 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                  border: isDark ? '1px solid rgba(245,158,11,0.25)' : '1px solid #FDE68A',
                }}
              >
                <p className="text-2xl mb-1">🎉</p>
                <p className={`font-bold text-sm ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                  {todayHolidayName || 'Holiday Today'}
                </p>
                <p className={`text-xs mt-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600'}`}>
                  Office is closed. Enjoy your day!
                </p>
                {!todayAttendance?.punch_in && (
                  <button
                    onClick={() => handlePunchAction('punch_in')}
                    disabled={loading}
                    className={`mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      isDark
                        ? 'text-amber-300 border border-amber-700 hover:bg-amber-900/30'
                        : 'text-amber-700 border border-amber-300 hover:bg-amber-50'
                    }`}
                  >
                    Working today? Punch In
                  </button>
                )}
                {todayAttendance?.punch_in && !todayAttendance?.punch_out && (
                  <div className="mt-3 space-y-2">
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Clocked in at {formatToLocalTime(todayAttendance.punch_in)}
                    </p>
                    <Button
                      onClick={() => handlePunchAction('punch_out')}
                      className="w-full bg-red-500 hover:bg-red-600 rounded-xl h-8 text-xs font-semibold"
                      disabled={loading}
                    >
                      Punch Out
                    </Button>
                  </div>
                )}
                {todayAttendance?.punch_out && (
                  <p className={`mt-2 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Worked {getTodayDuration()} today
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {todayAttendance?.punch_in ? (
                  <>
                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${isDark ? 'bg-emerald-900/20 border-emerald-800' : 'bg-green-50 border-green-200'}`}>
                      <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        <LogIn className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Punch In</span>
                      </div>
                      <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{formatToLocalTime(todayAttendance.punch_in)}</span>
                    </div>
                    {todayAttendance.punch_out ? (
                      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                        <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          <LogOut className="h-4 w-4 text-red-500" />
                          <span className="font-medium">Punch Out</span>
                        </div>
                        <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{formatToLocalTime(todayAttendance.punch_out)}</span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handlePunchAction('punch_out')}
                        className="w-full bg-red-500 hover:bg-red-600 rounded-xl h-9 text-sm font-semibold"
                        disabled={loading}
                      >
                        Punch Out
                      </Button>
                    )}
                    <div
                      className="text-center py-3 rounded-xl"
                      style={{
                        background: isDark
                          ? 'rgba(96,165,250,0.08)'
                          : `linear-gradient(135deg, ${COLORS.deepBlue}08, ${COLORS.mediumBlue}12)`,
                        border: isDark ? '1px solid rgba(96,165,250,0.15)' : `1px solid ${COLORS.deepBlue}15`,
                      }}
                    >
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Total Today</p>
                      <p className="text-2xl font-bold mt-0.5 tracking-tight" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                        {getTodayDuration()}
                      </p>
                    </div>
                  </>
                ) : (
                  <Button
                    onClick={() => handlePunchAction('punch_in')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl h-10 text-sm font-semibold"
                    disabled={loading}
                  >
                    Punch In
                  </Button>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      </motion.div>

      {/* ── Assigned Tasks – Two Columns ──────────────────────────────────── */}
      {showTaskSection && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-3">

          {/* Tasks Assigned to Me */}
          <SectionCard className="cursor-pointer hover:shadow-md transition group"
            onClick={() => navigate('/tasks?filter=assigned-to-me')}>
            <CardHeaderRow
              iconBg={isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}
              icon={<Briefcase className="h-4 w-4 text-emerald-600" />}
              title="Tasks Assigned to Me"
              subtitle="Tasks others gave you"
              action={
                <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                  onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-to-me'); }}>
                  View All →
                </Button>
              }
            />
            <div className="p-3">
              {tasksAssignedToMe.length === 0 ? (
                <div className={`h-32 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDark ? 'text-slate-500 border-slate-700' : 'text-slate-400 border-slate-200'}`}>
                  No tasks assigned to you
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
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
            onClick={() => navigate('/tasks?filter=assigned-by-me')}>
            <CardHeaderRow
              iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
              icon={<Briefcase className="h-4 w-4 text-blue-600" />}
              title="Tasks Assigned by Me"
              subtitle="Tasks you delegated"
              action={
                <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                  onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-by-me'); }}>
                  View All →
                </Button>
              }
            />
            <div className="p-3">
              {tasksAssignedByMe.length === 0 ? (
                <div className={`h-32 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDark ? 'text-slate-500 border-slate-700' : 'text-slate-400 border-slate-200'}`}>
                  No tasks assigned yet
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
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

      {/* ── Star Performers + To-Do + Visits ─────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

        {/* Star Performers */}
        <SectionCard>
          <CardHeaderRow
            iconBg={isDark ? 'bg-yellow-900/40' : 'bg-yellow-50'}
            icon={<TrendingUp className="h-4 w-4 text-yellow-500" />}
            title="Star Performers"
            subtitle="Gold · Silver · Bronze"
            action={
              isAdmin ? (
                <div className={`flex gap-0.5 rounded-lg p-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  {['all', 'monthly', 'weekly'].map(p => (
                    <button
                      key={p}
                      onClick={() => setRankingPeriod(p)}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                        rankingPeriod === p
                          ? isDark ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm'
                          : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              ) : null
            }
          />
          <div className="p-3">
            {rankings.length === 0 ? (
              <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No ranking data</div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {rankings.map((member, i) => (
                    <RankingItem key={member.user_id || i} member={member} index={i} period={rankingPeriod} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </SectionCard>

        {/* My To-Do List */}
        <SectionCard>
          <CardHeaderRow
            iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
            icon={<CheckSquare className="h-4 w-4 text-blue-500" />}
            title="My To-Do List"
            subtitle="Your personal tasks"
            action={
              <Button variant="ghost" size="sm" className={`text-xs h-7 px-3 ${isDark ? 'text-blue-400' : 'text-blue-500'}`}
                onClick={() => navigate('/todos')}>
                View All
              </Button>
            }
          />
          <div className="p-3">
            {/* Input Row */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                placeholder="Add new task..."
                onKeyDown={e => e.key === 'Enter' && addTodo()}
                className={`flex-1 px-3 py-2 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all ${
                  isDark
                    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:ring-blue-900/40'
                    : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
                }`}
              />
              <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline" size="icon"
                    className={cn('h-9 w-9 rounded-xl flex-shrink-0',
                      isDark ? 'border-slate-600 bg-slate-700 text-slate-300' : 'border-slate-200',
                      !selectedDueDate && 'text-slate-400'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDueDate}
                    onSelect={d => { setSelectedDueDate(d); setShowDueDatePicker(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                onClick={addTodo}
                disabled={!newTodo.trim()}
                className="px-4 rounded-xl h-9 text-sm font-semibold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
              >
                Add
              </Button>
            </div>
            {selectedDueDate && (
              <p className="text-xs text-amber-500 font-medium mb-2 -mt-1 ml-1">
                📅 Due: {format(selectedDueDate, 'MMM d, yyyy')}
              </p>
            )}

            {pendingTodos.length === 0 ? (
              <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No todos yet</div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {pendingTodos.map(todo => (
                    <motion.div
                      key={todo._id || todo.id}
                      variants={itemVariants}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                        todo.completed
                          ? isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'
                          : !todo.completed && isOverdue(todo.due_date)
                          ? isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50/70 border-red-200'
                          : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => handleToggleTodo(todo._id || todo.id)}
                          className="h-4 w-4 accent-emerald-600 flex-shrink-0 rounded cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`block text-sm truncate ${
                            todo.completed
                              ? 'line-through text-slate-400 dark:text-slate-600'
                              : isDark ? 'text-slate-100' : 'text-slate-800'
                          }`}>
                            {todo.title}
                            {!todo.completed && isOverdue(todo.due_date) && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 rounded">
                                Overdue
                              </span>
                            )}
                          </span>
                          {todo.due_date && (
                            <p className={`text-[10px] mt-0.5 ${isOverdue(todo.due_date) ? 'text-red-500 font-medium' : isDark ? 'text-amber-400' : 'text-amber-500'}`}>
                              Due: {format(new Date(todo.due_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTodo(todo._id || todo.id)}
                        className={`text-xs font-medium transition-colors px-2 py-1 rounded-lg flex-shrink-0 ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-900/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
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

        {/* ── Visits Card ──────────────────────────────────────────────────── */}
        <VisitsCard isDark={isDark} navigate={navigate} />

      </motion.div>

      {/* ── Quick Access Tiles ────────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" variants={itemVariants}>
        {[
          {
            path:   '/leads',
            icon:   <Target className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />,
            iconBg: isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12`,
            label:  String(stats?.total_leads || 0),
            sub:    'Leads',
          },
          {
            path:   '/clients',
            icon:   <Building2 className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />,
            iconBg: isDark ? 'rgba(31,175,90,0.2)' : `${COLORS.emeraldGreen}12`,
            label:  String(stats?.total_clients || 0),
            sub:    'Clients',
          },
          {
            path:   '/dsc',
            icon:   <Key className={`h-4 w-4 ${stats?.expiring_dsc_count > 0 ? 'text-red-500' : isDark ? 'text-slate-400' : 'text-slate-400'}`} />,
            iconBg: stats?.expiring_dsc_count > 0 ? isDark ? 'rgba(239,68,68,0.2)' : '#fef2f2' : isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
            label:  String(stats?.total_dsc || 0),
            sub:    'DSC Certs',
          },
          {
            path:   '/duedates',
            icon:   <CalendarIcon className={`h-4 w-4 ${stats?.upcoming_due_dates > 0 ? 'text-amber-500' : isDark ? 'text-slate-400' : 'text-slate-400'}`} />,
            iconBg: stats?.upcoming_due_dates > 0 ? isDark ? 'rgba(245,158,11,0.2)' : '#fffbeb' : isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
            label:  String(stats?.upcoming_due_dates || 0),
            sub:    'Compliance',
          },
        ].map(tile => (
          <motion.div
            key={tile.path}
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(tile.path)}
            className={`${metricCardCls} ${metricCardDefault}`}
          >
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: tile.iconBg }}>
                {tile.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight" style={{ color: isDark ? '#e2e8f0' : COLORS.deepBlue }}>{tile.label}</p>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{tile.sub}</p>
              </div>
            </CardContent>
          </motion.div>
        ))}

        {isAdmin && (
          <motion.div
            whileHover={{ y: -3, transition: springPhysics.card }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/users')}
            className={`${metricCardCls} ${metricCardDefault}`}
          >
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
                style={{ backgroundColor: isDark ? 'rgba(31,111,178,0.2)' : `${COLORS.mediumBlue}12` }}>
                <Users className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight" style={{ color: isDark ? '#e2e8f0' : COLORS.deepBlue }}>
                  {stats?.team_workload?.length || 0}
                </p>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Team Members</p>
              </div>
            </CardContent>
          </motion.div>
        )}
      </motion.div>

      {/* ── Punch-In Gate Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {mustPunchIn && !todayIsHoliday && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(7,15,30,0.75)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.88, y: 48 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 48 }}
              transition={{ type: 'spring', stiffness: 160, damping: 18 }}
              className={`w-full max-w-sm mx-4 rounded-3xl overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-white'}`}
              style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}
            >
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
                  transition={{ type: 'spring', stiffness: 220, damping: 14 }}
                >
                  {getGreeting()}
                </motion.h2>
                <p className="text-white/70 text-sm mt-1.5">
                  {format(new Date(), 'EEEE, MMMM d')}
                </p>
              </div>
              <div className="px-7 py-6 space-y-3">
                <p className={`text-center text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Please punch in to begin your workday.
                </p>
                <motion.div
                  initial={{ y: 0 }}
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  whileHover={{ y: 0 }}
                >
                  <Button
                    onClick={() => handlePunchAction('punch_in')}
                    disabled={loading}
                    className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg hover:shadow-emerald-200 transition-all"
                  >
                    {loading ? 'Punching In…' : 'Punch In Now'}
                  </Button>
                </motion.div>
                <Button
                  variant="ghost"
                  className={`w-full h-10 rounded-xl text-sm ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await api.post('/attendance/mark-leave-today');
                      toast.success('Marked on leave today');
                      setActionDone(true);
                      setMustPunchIn(false);
                      document.body.style.overflow = 'auto';
                      await queryClient.refetchQueries({ queryKey: ['todayAttendance'] });
                      await queryClient.refetchQueries({ queryKey: ['holidays'] });
                    } catch (err) {
                      toast.error(err.response?.data?.detail || 'Failed to mark leave');
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
