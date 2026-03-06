import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isPast, parseISO } from 'date-fns';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Plus,
  Zap,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  Target,
  TrendingUp,
  AlertCircle,
  Calendar as CalendarIcon,
  History,
} from 'lucide-react';

// ── BRAND COLORS (exact match with main Dashboard) ───────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};

// ── SPRING PHYSICS (centralized from Dashboard + patterns) ───────────────────
const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: "spring", stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: "spring", stiffness: 400, damping: 28 },
  icon: { type: "spring", stiffness: 450, damping: 25 },
  tap: { type: "spring", stiffness: 500, damping: 30 },
  micro: { type: "spring", stiffness: 600, damping: 35 },
};

// ── ANIMATION VARIANTS (exact match with main Dashboard) ─────────────────────
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

const listItemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] }
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: { duration: 0.25 }
  }
};

// ── REUSABLE MOTION HELPERS ─────────────────────────────────────────────────
const cardMotion = {
  whileHover: { y: -6, scale: 1.01, transition: springPhysics.lift },
  whileTap: { scale: 0.985, transition: springPhysics.tap }
};

const buttonMotion = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.92, transition: springPhysics.button }
};

// ── TODO ITEM ─────────────────────────────────────────────────────────────────
function TodoItem({ todo, onToggle, onPromote, onDelete }) {
  const isCompleted = todo.is_completed === true || todo.status === "completed";
  const isOverdue = todo.due_date && isPast(parseISO(todo.due_date)) && !isCompleted;

  return (
    <motion.div
      layout
      variants={listItemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`group relative flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-b-0 transition-colors
        ${isOverdue ? 'bg-red-50/60 border-l-4 border-l-red-500' : ''}
        ${isCompleted ? 'bg-slate-50/70' : 'hover:bg-blue-50/30'}
      `}
    >
      {/* Checkbox */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9, transition: springPhysics.button }}
        onClick={() => onToggle(todo.id || todo._id)}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all
          ${isCompleted
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-slate-300 hover:border-emerald-400'
          }`}
      >
        {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
      </motion.button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <p className={`font-medium text-sm leading-snug truncate max-w-xs transition
            ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {todo.title || 'Untitled Todo'}
          </p>
          {isOverdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded uppercase tracking-wide">
              <AlertCircle className="h-3 w-3" /> Overdue
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase tracking-wide">
              Done
            </span>
          )}
        </div>
        {todo.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{todo.description}</p>
        )}
        {todo.due_date && (
          <span className={`inline-flex items-center gap-1 text-[11px] mt-1 font-medium
            ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
            <CalendarIcon className="h-3 w-3" />
            {format(parseISO(todo.due_date), 'MMM d, yyyy')}
          </span>
        )}
      </div>

      {/* Actions — appear on hover */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
        <motion.button
          {...buttonMotion}
          onClick={(e) => { e.stopPropagation(); onPromote(todo.id || todo._id); }}
          disabled={isCompleted}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border transition
            ${isCompleted
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed border-slate-200'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            }`}
        >
          <Zap className="h-3.5 w-3.5" /> Promote
        </motion.button>
        <motion.button
          {...buttonMotion}
          onClick={(e) => { e.stopPropagation(); onDelete(todo.id || todo._id); }}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── MAIN TODO DASHBOARD COMPONENT ────────────────────────────────────────────
export default function TodoDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedUser, setSelectedUser] = useState("all");
  const [activeTab, setActiveTab] = useState("todos"); // "todos" | "log"

  // ── TODO LOG — records every completion/undo action in-session ────────────
  const [todoLog, setTodoLog] = useState([]);
  const logSectionRef = useRef(null);

  // ── DATA FETCHING ─────────────────────────────────────────────────────────
  // For admin: fetch own todos only (not all users' todos)
  // For non-admin: fetch own todos
  const todoQuery = isAdmin ? {} : {};
  
  const { data: todosRaw = [], isLoading } = useQuery({
    queryKey: ["todos", selectedUser],
    queryFn: async () => {
      let endpoint = "/todos";
      // Admin only filters by selectedUser if explicitly chosen
      if (isAdmin && selectedUser !== "all") {
        endpoint += `?user_id=${selectedUser}`;
      }
      const res = await api.get(endpoint);
      return res.data;
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data || [];
    },
  });

  const todos = useMemo(() => todosRaw, [todosRaw]);

  // Seed log from already-completed todos whenever the data loads/changes
  useEffect(() => {
    const completedTodos = todos.filter(t => t.is_completed === true || t.status === "completed");
    if (completedTodos.length === 0) return;
    setTodoLog(prev => {
      // Only add todos not already in the log (avoid duplicates on re-fetch)
      const existingIds = new Set(prev.map(e => e.id));
      const newEntries = completedTodos
        .filter(t => !existingIds.has(t.id || t._id))
        .map(t => ({
          id: t.id || t._id,
          title: t.title || 'Untitled Todo',
          created_by: t.created_by || 'Unknown',
          created_at: t.created_at || new Date().toISOString(),
          completed_at: t.completed_at ? new Date(t.completed_at) : new Date(t.updated_at || t.created_at || Date.now()),
          deleted_at: null,
        }));
      if (newEntries.length === 0) return prev;
      // Merge and sort by timestamp descending
      return [...newEntries, ...prev]
        .sort((a, b) => b.completed_at - a.completed_at)
        .slice(0, 100);
    });
  }, [todos]);

  // ── STATS (same calculation style as main Dashboard) ──────────────────────
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter(t => t.is_completed === true || t.status === "completed").length;
    const overdue = todos.filter(t =>
      t.due_date && isPast(parseISO(t.due_date)) && !(t.is_completed === true || t.status === "completed")
    ).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const healthScore = Math.max(10, 100 - (overdue * 8));

    return { total, completed, overdue, completionRate, healthScore };
  }, [todos]);

  // ── MUTATIONS ─────────────────────────────────────────────────────────────
  const addTodoMutation = useMutation({
    mutationFn: (payload) => api.post("/todos", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo created successfully");
      setTitle(""); setDescription(""); setDueDate("");
    },
    onError: () => toast.error("Failed to create todo"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id }) => {
      const todo = todos.find(t => (t.id || t._id) === id);
      const newCompleted = !(todo.is_completed === true || todo.status === "completed");
      return api.patch(`/todos/${id}`, { is_completed: newCompleted });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      // Append a log entry whenever a todo is toggled
      const todo = todos.find(t => (t.id || t._id) === variables.id);
      if (todo) {
        const wasCompleted = todo.is_completed === true || todo.status === "completed";
        setTodoLog(prev => [{
          id: todo.id || todo._id,
          title: todo.title || 'Untitled Todo',
          created_by: todo.created_by || 'Unknown',
          created_at: todo.created_at || new Date().toISOString(),
          completed_at: wasCompleted ? null : new Date(),
          deleted_at: null,
        }, ...prev].slice(0, 100));
      }
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (id) => api.post(`/todos/${id}/promote-to-task`),
    onSuccess: () => {
      toast.success("Todo promoted to Master Task!");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onError: () => toast.error("Failed to promote todo"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/todos/${id}`),
    onSuccess: (_, variables) => {
      const deletedTodo = todos.find(t => (t.id || t._id) === variables);
      if (deletedTodo) {
        setTodoLog(prev => [{
          id: deletedTodo.id || deletedTodo._id,
          title: deletedTodo.title || 'Untitled Todo',
          created_by: deletedTodo.created_by || 'Unknown',
          created_at: deletedTodo.created_at || new Date().toISOString(),
          completed_at: null,
          deleted_at: new Date(),
        }, ...prev].slice(0, 100));
      }
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo deleted");
    },
    onError: () => toast.error("Failed to delete todo"),
  });

  // ── HANDLERS ──────────────────────────────────────────────────────────────
  const handleAddTodo = () => {
    if (!title.trim()) return;
    addTodoMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      is_completed: false,
    });
  };

  const handleToggle = (id) => toggleMutation.mutate({ id });
  const handlePromote = (id) => promoteMutation.mutate(id);
  const handleDelete = (id) => deleteMutation.mutate(id);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-5 pb-10 p-5 md:p-6 bg-slate-50/60 min-h-screen"
      style={{ fontFamily: "'Inter', 'DM Sans', 'Segoe UI', system-ui, sans-serif" }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>
              Todo Management
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} · {stats.total} items
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* ── Tab buttons ── */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <button
                onClick={() => setActiveTab("todos")}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "todos"
                    ? "text-white"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
                style={activeTab === "todos" ? { backgroundColor: COLORS.deepBlue } : {}}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Todos
              </button>
              <button
                onClick={() => setActiveTab("log")}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold transition-colors border-l border-slate-200 ${
                  activeTab === "log"
                    ? "text-white"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
                style={activeTab === "log" ? { backgroundColor: COLORS.deepBlue } : {}}
              >
                <History className="h-3.5 w-3.5" />
                Todo Log
                {todoLog.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === "log" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {todoLog.length}
                  </span>
                )}
              </button>
            </div>

            {/* Status pills */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-slate-200 text-xs font-medium text-slate-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              {stats.completed} completed
            </div>
            {stats.overdue > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.overdue} overdue
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── KPI Strip + Main Content (Todos tab) ─────────────────────────── */}
      {activeTab === "todos" && <>

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={itemVariants}>
        {/* Total */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Total</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.deepBlue}12` }}>
              <Target className="h-3.5 w-3.5" style={{ color: COLORS.deepBlue }} />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
          <p className="text-[11px] text-slate-400 mt-1">todos tracked</p>
        </div>

        {/* Overdue */}
        <div className={`bg-white rounded-xl border p-4 shadow-sm ${stats.overdue > 0 ? 'border-red-200' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Overdue</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.coral}12` }}>
              <AlertCircle className="h-3.5 w-3.5" style={{ color: COLORS.coral }} />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight" style={{ color: stats.overdue > 0 ? COLORS.coral : '#94a3b8' }}>{stats.overdue}</p>
          <p className="text-[11px] text-slate-400 mt-1">need attention</p>
        </div>

        {/* Completion */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Completion</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.emeraldGreen}12` }}>
              <TrendingUp className="h-3.5 w-3.5" style={{ color: COLORS.emeraldGreen }} />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight" style={{ color: COLORS.emeraldGreen }}>{stats.completionRate}%</p>
          <Progress value={stats.completionRate} className="mt-2 h-1" />
        </div>

        {/* Health */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Health</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.mediumBlue}12` }}>
              <Sparkles className="h-3.5 w-3.5" style={{ color: COLORS.mediumBlue }} />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>{stats.healthScore}%</p>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">Excellent</p>
        </div>
      </motion.div>

      {/* ── Main Two-Column Layout ────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-1 xl:grid-cols-12 gap-5" variants={itemVariants}>

        {/* ── Left: Add Form ──────────────────────────────────────────────── */}
        <div className="xl:col-span-4 space-y-4">

          {/* Create Todo Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Card header strip */}
            <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.emeraldGreen})` }} />
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                <Plus className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800 tracking-tight">New Todo</h2>
                <p className="text-[11px] text-slate-400">Add to your personal or team list</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to get done?"
                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Notes</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context (optional)"
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                />
              </div>
              <Button
                onClick={handleAddTodo}
                disabled={!title.trim() || addTodoMutation.isPending}
                className="w-full h-10 text-sm font-semibold rounded-lg"
                style={{ backgroundColor: COLORS.deepBlue }}
              >
                {addTodoMutation.isPending
                  ? <><RefreshCw className="animate-spin h-4 w-4 mr-2" /> Creating…</>
                  : <><Plus className="h-4 w-4 mr-2" /> Create Todo</>
                }
              </Button>
            </div>
          </div>

          {/* AI Insight Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">AI Audit</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {stats.overdue} todos are overdue · {stats.completionRate}% on track
                </p>
              </div>
              <Button variant="ghost" className="text-violet-700 text-xs font-medium h-auto py-1 px-2 shrink-0">
                Review →
              </Button>
            </div>
          </div>

          {/* Footer Summary Strip */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              <div className="px-3 py-4 text-center">
                <div className="text-xl font-bold font-mono" style={{ color: COLORS.emeraldGreen }}>{stats.completionRate}%</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Avg Done</div>
              </div>
              <div className="px-3 py-4 text-center">
                <div className="text-xl font-bold font-mono text-amber-500">{stats.overdue}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Attention</div>
              </div>
              <div className="px-3 py-4 text-center">
                <div className="text-xl font-bold font-mono" style={{ color: COLORS.deepBlue }}>
                  {todos.filter(t => !(t.is_completed === true || t.status === "completed")).length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Remaining</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Todo List + Admin Filter ─────────────────────────────── */}
        <div className="xl:col-span-8 space-y-4">

          {/* Admin Filter — layout only, all logic identical */}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-slate-700">Filter by Team Member</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-widest border-slate-300 text-slate-500">
                  Admin Only
                </Badge>
              </div>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="h-9 rounded-lg border-slate-200 text-sm">
                  <SelectValue placeholder="All team members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id || u._id} value={u.id || u._id}>
                      {u.full_name || u.user_name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Todo List Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.emeraldGreen})` }} />
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-bold text-slate-800 tracking-tight">
                  {isAdmin && selectedUser !== 'all'
                    ? `${users.find(u => (u.id || u._id) === selectedUser)?.full_name || 'User'}'s Todos`
                    : 'Your Todos'
                  }
                </span>
                <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {todos.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">{stats.completed} completed</span>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                <span className="text-[11px] text-slate-400 font-medium">{stats.overdue} overdue</span>
              </div>
            </div>

            {/* Column labels */}
            <div className="px-5 py-2 bg-slate-50/80 border-b border-slate-100 grid grid-cols-[20px_1fr_auto] gap-4 items-center">
              <div />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Task</span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Actions</span>
            </div>

            {/* List body */}
            {isLoading ? (
              <div className="py-16 text-center">
                <RefreshCw className="animate-spin h-6 w-6 mx-auto text-slate-300" />
                <p className="text-xs text-slate-400 mt-3">Loading todos…</p>
              </div>
            ) : todos.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400 mt-3 font-medium">No todos yet</p>
                <p className="text-xs text-slate-300 mt-1">Create one using the form on the left</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                <AnimatePresence>
                  {todos.map((todo) => (
                    <TodoItem
                      key={todo.id || todo._id}
                      todo={todo}
                      onToggle={handleToggle}
                      onPromote={handlePromote}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      </> /* end activeTab === "todos" */}

      {/* ── Todo Log Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "log" && (
      <motion.div variants={itemVariants}>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.mediumBlue}, ${COLORS.deepBlue})` }} />
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <History className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-bold text-slate-800 tracking-tight">Todo Log</span>
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {todoLog.length}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Completed, deleted &amp; activity history</span>
          </div>

          {todoLog.length === 0 ? (
            <div className="py-16 text-center">
              <History className="h-10 w-10 mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">No activity yet</p>
              <p className="text-xs text-slate-300 mt-1">Complete or delete a todo and it will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              <AnimatePresence>
                {todoLog.map((entry, idx) => {
                  // Format: "Title" by Creator on Created · [Completed on Date] [Deleted on Date]
                  const createdDate = entry.created_at ? format(new Date(entry.created_at), 'MMM d, yyyy · hh:mm a') : 'Unknown date';
                  const completedText = entry.completed_at ? `Completed on ${format(entry.completed_at, 'MMM d, yyyy · hh:mm a')}` : null;
                  const deletedText = entry.deleted_at ? `Deleted on ${format(entry.deleted_at, 'MMM d, yyyy · hh:mm a')}` : null;
                  
                  return (
                    <motion.div
                      key={`${entry.id}-${idx}`}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-800">"{entry.title}"</p>
                          <span className="text-xs text-slate-500">by {entry.created_by}</span>
                          <span className="text-xs text-slate-400">on {createdDate}</span>
                          {completedText && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              ✓ {completedText}
                            </span>
                          )}
                          {deletedText && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-700">
                              ✕ {deletedText}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
      )} {/* end activeTab === "log" */}

    </motion.div>
  );
}
