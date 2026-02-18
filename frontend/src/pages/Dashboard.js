
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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

// Define TaskCard here so the JSX below works
const TaskCard = ({ task, assignedBy, isToMe, onStatusChange }) => {
  const getPriorityStripeClass = (priority) => {
    const p = (priority || '').toLowerCase().trim();
    if (p === 'critical') return 'border-l-8 border-l-red-600';
    if (p === 'urgent')   return 'border-l-8 border-l-orange-500';
    if (p === 'medium')   return 'border-l-8 border-l-emerald-500';
    if (p === 'low')      return 'border-l-8 border-l-blue-500';
    return 'border-l-8 border-l-slate-300';
  };
  return (
    <div className={`p-4 bg-white rounded-xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3 ${getPriorityStripeClass(task.priority)}`}>
       <div>
         <p className="font-bold text-slate-900">{task.title}</p>
         <p className="text-xs text-slate-500">{isToMe ? 'From' : 'To'}: {assignedBy}</p>
       </div>
       <div className="flex gap-2">
         <Button size="sm" onClick={() => onStatusChange(task.id, 'in_progress')}>In Progress</Button>
         <Button size="sm" onClick={() => onStatusChange(task.id, 'completed')}>Done</Button>
       </div>
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [upcomingDueDates, setUpcomingDueDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState("all");
  const [chatMessages, setChatMessages] = useState([]);
  const notificationAudio = React.useRef(new Audio('/notification.mp3'));
  const [todos, setTodos] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  
  // ADDED MISSING STATES REQUIRED BY YOUR LOGIC
  const [tasksAssignedToMe, setTasksAssignedToMe] = useState([]);
  const [tasksAssignedByMe, setTasksAssignedByMe] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    fetchTodayAttendance();
    fetchMyTodos();
    fetchMyAssignedTasks();
  }, [rankingPeriod]);

  useEffect(() => {
    const interval = setInterval(() => {
      api.get('/notifications')
        .then(res => {
          if (res.data.length > chatMessages.length) {
            notificationAudio.current.play().catch(() => {});
          }
          setChatMessages(res.data);
        })
        .catch(err => console.warn('Chat notifications failed:', err));
    }, 50000);
    return () => clearInterval(interval);
  }, [chatMessages]);

  const fetchMyTodos = async () => {
    try {
      const res = await api.get('/tasks');
      const myTasks = res.data.filter(task =>
        task.assigned_to === user?.id ||
        (Array.isArray(task.sub_assignees) && task.sub_assignees.includes(user?.id))
      );
      setTodos(myTasks.map(task => ({
        ...task,
        created_at: task.created_at || new Date().toISOString(),
        completed: task.status === 'completed'
      })));
    } catch (error) {
      console.error('Failed to fetch todos:', error);
      setTodos([]);
    }
  };

const addTodo = async () => {
  if (!newTodo?.trim?.()) return;
  try {
    const now = new Date().toISOString();
    const res = await api.post('/tasks', {
      title: newTodo?.trim?.(),
      status: 'pending',
      created_at: now,           // backend should store this
      // optional: created_by: user?.id
    });
    setTodos([...(todos || []), {
      ...res?.data,
      completed: false,
      created_at: now
    }]);
    setNewTodo('');
    toast.success('Todo added');
  } catch (error) {
    toast.error('Failed to add todo');
  }
};

  // FIXED SYNTAX IN YOUR ORIGINAL BLOCK
  const fetchMyAssignedTasks = async () => {
    try {
      const res = await api.get('/tasks');
      const allTasks = res.data || [];

      const toMe = allTasks.filter(task => task.assigned_to === user?.id);

      const byMe = allTasks.filter(task => 
        task.created_by === user?.id && task.assigned_to !== user?.id
      );

      setTasksAssignedToMe(toMe.slice(0, 6));
      setTasksAssignedByMe(byMe.slice(0, 6));
      setAssignedTasks(allTasks.slice(0, 6)); // 'filtered' was undefined, using allTasks
    } catch (error) {
      console.error("Failed to fetch assigned tasks", error);
      setTasksAssignedToMe([]);
      setTasksAssignedByMe([]);
    }
  };

  // Preserved exactly as per your line-to-line requirement
  const getPriorityStripeClass = (priority) => {
    const p = (priority || '').toLowerCase().trim();
    if (p === 'critical') return 'border-l-8 border-l-red-600';
    if (p === 'urgent')   return 'border-l-8 border-l-orange-500';
    if (p === 'medium')   return 'border-l-8 border-l-emerald-500';
    if (p === 'low')      return 'border-l-8 border-l-blue-500';
    return 'border-l-8 border-l-slate-300';
  };

  const updateAssignedTaskStatus = async (taskId, newStatus) => {
    try {
      await api.patch(`/tasks/${taskId}`, {
        status: newStatus,
        updated_at: new Date().toISOString()
      });
      fetchMyAssignedTasks();
      toast.success(`Task marked as ${newStatus === 'completed' ? 'Done' : 'In Progress'}!`);
    } catch (error) {
      console.error('Failed to update task status:', error);
      toast.error('Failed to update task');
    }
  };

<CardContent className="p-4 sm:p-6">
  <div className="flex gap-2 mb-4">
    <input
      type="text"
      value={newTodo ?? ''}
      onChange={(e) => setNewTodo(e.target.value)}
      placeholder="Add new task..."
      className="flex-1 p-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
    />
    <Button onClick={addTodo} disabled={!newTodo?.trim?.()}>Add</Button>
  </div>

  {(!todos || todos.length === 0) ? (
    <div className="text-center py-10 sm:py-12 text-slate-400 text-sm sm:text-base">
      No personal tasks yet
    </div>
  ) : (
    <div className="space-y-3 max-h-[320px] sm:max-h-[420px] overflow-y-auto pr-2">
      {(todos || []).map((todo, index) => (
        <div
          key={todo?.id || index}
          className={`p-4 rounded-2xl border ${
            todo?.completed 
              ? 'bg-emerald-50/70 border-emerald-200' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <input
                type="checkbox"
                checked={todo?.completed || false}
                onChange={() => handleToggleTodo?.(todo?.id)}
                className="h-5 w-5 sm:h-6 sm:w-6 accent-emerald-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm sm:text-base ${
                  todo?.completed ? 'line-through text-slate-600' : 'text-slate-900'
                }`}>
                  {todo?.title || 'Untitled Task'}
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => handleDeleteTodo?.(todo?.id)}
            >
              Delete
            </Button>
          </div>

          {/* Dates & Log line */}
          <div className="mt-2 text-xs text-slate-500 pl-8">
            <div>
              Created: {todo?.created_at 
                ? format(new Date(todo.created_at), 'dd MMM yyyy • hh:mm a') 
                : '—'}
            </div>
            {todo?.completed_at && (
              <div className="text-emerald-700 font-medium">
                Completed: {format(new Date(todo.completed_at), 'dd MMM yyyy • hh:mm a')}
              </div>
            )}
            {todo?.log && (
              <div className="mt-1 italic text-slate-400 text-[11px]">
                Log: {todo?.log}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</CardContent>;

const handleToggleTodo = async (id) => {
  const todo = (todos || []).find(t => t.id === id);
  if (!todo) return;

  try {
    const now = new Date().toISOString();
    const newStatus = todo?.completed ? 'pending' : 'completed';

    const patchData = {
      status: newStatus,
      updated_at: now
    };

    if (newStatus === 'completed') {
      patchData.completed_at = now;
      patchData.log = `Completed by ${user?.full_name || user?.email || 'user'} on ${format(new Date(), 'dd MMM yyyy hh:mm a')}`;
    } else {
      patchData.completed_at = null;
      patchData.log = (todo?.log || '') + `\nRe-opened by ${user?.full_name || 'user'} on ${format(new Date(), 'dd MMM yyyy hh:mm a')}`;
    }

    const res = await api.patch(`/tasks/${id}`, patchData);

    setTodos((todos || []).map(t => 
      t.id === id ? { 
        ...res?.data, 
        completed: res?.data?.status === 'completed' 
      } : t
    ));

    toast.success(newStatus === 'completed' ? 'Marked as done' : 'Re-opened');
  } catch (error) {
    toast.error('Could not update task');
    console.error(error);
  }
};

  const fetchTodayAttendance = async () => {
    try {
      const res = await api.get('/attendance/today');
      setTodayAttendance(res.data);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    }
  };

  const handlePunchAction = async (action) => {
    setLoading(true);
    try {
      await api.post('/attendance', { action });
      toast.success(action === 'punch_in' ? 'Punched in successfully!' : 'Punched out successfully!');
      const res = await api.get('/attendance/today');
      setTodayAttendance(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record attendance');
    } finally {
      setLoading(false);
    }
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

  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats?.completed_tasks / stats?.total_tasks) * 100)
    : 0;

  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) => prev.days_remaining < curr.days_remaining ? prev : curr)
    : null;

  return (
    <motion.div
      className="space-y-6"
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
          <CardContent className="p-8 relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold font-outfit tracking-tight" style={{ color: COLORS.deepBlue }}>
                  Welcome back, {user?.full_name?.split(' ')[0] || 'User'}
                </h1>
                <p className="text-slate-600 mt-2 text-lg">
                  Here's what's happening with your firm's compliance and tasks today, {format(new Date(), 'MMMM d, yyyy')}.
                </p>
              </div>
              {nextDeadline && (
                <div
                  className="flex items-center gap-4 px-6 py-4 rounded-2xl border-2 cursor-pointer hover:shadow-md transition-all"
                  style={{ borderColor: COLORS.mediumBlue, backgroundColor: 'white' }}
                  onClick={() => navigate('/duedates')}
                  data-testid="next-deadline-card"
                >
                  <Calendar className="h-8 w-8" style={{ color: COLORS.mediumBlue }} />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Next Filing Deadline</p>
                    <p className="font-bold text-lg" style={{ color: COLORS.deepBlue }}>
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
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" variants={itemVariants}>
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
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={itemVariants}>
        <Card
          className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden"
          data-testid="recent-tasks-card"
        >
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
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
<CardContent className="p-4 sm:p-6">
  <div className="flex gap-2 mb-4">
    <input
      type="text"
      value={newTodo ?? ''}
      onChange={(e) => setNewTodo(e.target.value)}
      placeholder="Add new task..."
      className="flex-1 p-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
    />
    <Button onClick={addTodo} disabled={!newTodo?.trim?.()}>Add</Button>
  </div>

  {(!todos || todos.length === 0) ? (
    <div className="text-center py-10 sm:py-12 text-slate-400 text-sm sm:text-base">
      No personal tasks yet
    </div>
  ) : (
    <div className="space-y-3 max-h-[320px] sm:max-h-[420px] overflow-y-auto pr-2">
      {(todos || []).map((todo, index) => (
        <div
          key={todo?.id || index}
          className={`p-4 rounded-2xl border ${
            todo?.completed 
              ? 'bg-emerald-50/70 border-emerald-200' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <input
                type="checkbox"
                checked={todo?.completed || false}
                onChange={() => handleToggleTodo?.(todo?.id)}
                className="h-5 w-5 sm:h-6 sm:w-6 accent-emerald-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm sm:text-base ${
                  todo?.completed ? 'line-through text-slate-600' : 'text-slate-900'
                }`}>
                  {todo?.title || 'Untitled Task'}
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => handleDeleteTodo?.(todo?.id)}
            >
              Delete
            </Button>
          </div>

          {/* Dates & Log line */}
          <div className="mt-2 text-xs text-slate-500 pl-8">
            <div>
              Created: {todo?.created_at 
                ? format(new Date(todo.created_at), 'dd MMM yyyy • hh:mm a') 
                : '—'}
            </div>
            {todo?.completed_at && (
              <div className="text-emerald-700 font-medium">
                Completed: {format(new Date(todo.completed_at), 'dd MMM yyyy • hh:mm a')}
              </div>
            )}
            {todo?.log && (
              <div className="mt-1 italic text-slate-400 text-[11px]">
                Log: {todo?.log}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</CardContent>
          <CardContent className="p-4">
            {upcomingDueDates.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No Upcoming Deadlines
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingDueDates.map((due) => {
                  const color = getDeadlineColor(due.days_remaining || 0);
                  return (
                    <div
                      key={due.id}
                      className={`p-3 rounded-xl border cursor-pointer transition ${color.bg}`}
                      onClick={() => navigate('/duedates')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm text-slate-900 truncate">
                          {due.title || 'Untitled Due Date'}
                        </p>
                        <Badge className={`${color.badge} text-xs font-medium`}>
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
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
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
                    <p className="text-xs text-slate-500">Total Hours Today</p>
                    <p className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>
                      {todayAttendance.duration_minutes
                        ? `${Math.floor(todayAttendance.duration_minutes / 60)}h ${todayAttendance.duration_minutes % 60}m`
                        : '0h 0m'
                      }
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

      {/* Star Performers + My To-Do List + Tasks Assigned to Me (Fully Responsive) */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 lg:gap-8">

      {/* Star Performers */}
<Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden" data-testid="staff-ranking-card">
  <CardHeader className="pb-3 sm:pb-4 border-b border-slate-100 px-4 sm:px-6">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <CardTitle className="text-lg font-semibold flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-yellow-500" />
        Star Performers
      </CardTitle>
      
      {user?.role === 'admin' && (
        <div className="flex gap-1.5 sm:gap-2">
          {["all", "monthly", "weekly"].map(period => (
            <Button
              key={period}
              variant={rankingPeriod === period ? "default" : "outline"}
              size="sm"
              onClick={() => setRankingPeriod(period)}
              className="text-xs sm:text-sm px-3 py-1 min-w-[70px]"
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Button>
          ))}
        </div>
      )}
    </div>
    
    <p className="text-xs text-slate-500 mt-1.5">
      Top team members based on performance metrics
    </p>
  </CardHeader>

  <CardContent className="p-4 sm:p-6">
    {(!rankings || rankings.length === 0) ? (
      <div className="text-center py-12 sm:py-16 text-slate-400">
        <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-base font-medium">No rankings yet</p>
        <p className="text-sm mt-1">Performance data will appear here once available</p>
      </div>
    ) : (
      <div className="space-y-3 max-h-[360px] sm:max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {rankings?.slice(0, 5).map((member, index) => {
          const rank = index + 1;
          const isTop3 = rank <= 3;

          return (
            <div
              key={member?.user_id || index}
              className={`
                p-3.5 rounded-xl border transition-all duration-200
                ${isTop3 
                  ? 'bg-gradient-to-r from-yellow-50/80 to-amber-50/60 border-amber-200 shadow-sm' 
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:shadow-sm'}
                flex items-center justify-between gap-4
              `}
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                  ${rank === 1 ? 'bg-yellow-400 text-white' : 
                    rank === 2 ? 'bg-gray-300 text-gray-800' : 
                    rank === 3 ? 'bg-amber-600 text-white' : 
                    'bg-slate-200 text-slate-600'}
                `}>
                  {rank}
                </div>
                
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {member?.name || 'Unknown'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {member?.role || 'Team Member'}
                  </p>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-emerald-600">
                  {Math.round(member?.score ?? 0)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </CardContent>
</Card>

        {/* My To-Do List - Responsive */}
        <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden" data-testid="todo-list-card">
          <CardHeader className="pb-3 sm:pb-4 border-b border-slate-100 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-blue-500" />
                My To-Do List
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add new task..."
                className="flex-1 p-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
              />
              <Button onClick={addTodo} disabled={!newTodo.trim()} className="px-6">Add</Button>
            </div>

            {todos.length === 0 ? (
              <div className="text-center py-10 sm:py-12 text-slate-400 text-sm sm:text-base">
                No tasks added yet
              </div>
            ) : (
              <div className="space-y-3 max-h-[320px] sm:max-h-[420px] overflow-y-auto pr-2">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`flex items-center justify-between gap-3 p-4 rounded-2xl border ${
                      todo.completed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggleTodo(todo.id)}
                        className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 accent-emerald-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`block text-sm sm:text-base ${todo.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {todo.title}
                        </span>
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteTodo(todo.id)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Tasks Section - Split into 2 Equal Parts (Assigned to Me / Assigned by Me) */}
      <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-slate-100 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-semibold flex items-center gap-3 tracking-tight">
              <Briefcase className="h-7 w-7 text-emerald-600" />
              {user?.full_name || user?.name || 'User'} - Tasks
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            
            {/* ==================== LEFT: Tasks Assigned to Me ==================== */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-lg">Tasks Assigned to Me</h3>
              </div>

              {tasksAssignedToMe.length === 0 ? (
                <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                  No tasks assigned to you yet
                </div>
              ) : (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                  {tasksAssignedToMe.map((task) => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      assignedBy={task.assigned_by_name || task.created_by_name || 'Unknown'}
                      isToMe={true}
                      onStatusChange={updateAssignedTaskStatus}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ==================== RIGHT: Tasks Assigned by Me ==================== */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-lg">Tasks Assigned by Me</h3>
              </div>

              {tasksAssignedByMe.length === 0 ? (
                <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                  You haven't assigned any tasks yet
                </div>
              ) : (
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                  {tasksAssignedByMe.map((task) => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      assignedBy={task.assigned_to_name || 'Unknown User'}
                      isToMe={false}
                      onStatusChange={updateAssignedTaskStatus}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Quick Access Row */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" variants={itemVariants}>
        <Card
          className="border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
          onClick={() => navigate('/clients')}
          data-testid="quick-clients"
        >
          <CardContent className="p-5 flex items-center gap-4">
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
          <CardContent className="p-5 flex items-center gap-4">
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
          <CardContent className="p-5 flex items-center gap-4">
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
            <CardContent className="p-5 flex items-center gap-4">
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
