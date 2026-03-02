import React, { useState, useMemo } from 'react';
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

// ── TODO ITEM (exact same visual & motion language as TaskStrip) ─────────────
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
      whileHover={{ y: -6, scale: 1.01, transition: springPhysics.lift }}
      whileTap={{ scale: 0.985, transition: springPhysics.tap }}
      className={`relative flex items-center justify-between p-6 rounded-3xl border bg-white transition-all group
        ${isOverdue ? 'border-l-8 border-l-red-600 bg-red-50/40' : ''}
        ${isCompleted 
          ? 'opacity-80 bg-emerald-50/40 border-emerald-200' 
          : 'hover:shadow-2xl hover:border-emerald-400 hover:ring-1 hover:ring-emerald-200/60'
        }`}
    >
      {/* Left: Checkbox + Content */}
      <div className="flex items-center gap-5 flex-1 min-w-0">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9, transition: springPhysics.button }}
          onClick={() => onToggle(todo.id || todo._id)}
          className={`w-11 h-11 rounded-2xl border-2 flex items-center justify-center transition-all flex-shrink-0
            ${isCompleted 
              ? 'bg-[#1FAF5A] border-[#1FAF5A] text-white shadow' 
              : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50'
            }`}
        >
          {isCompleted && <CheckCircle2 className="h-6 w-6" />}
        </motion.button>

        <div className="flex-1 min-w-0">
          <p className={`font-medium text-lg leading-tight transition truncate ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
            {todo.title || 'Untitled Todo'}
          </p>
          
          {todo.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">
              {todo.description}
            </p>
          )}

          <div className="flex items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500 flex-wrap">
            {todo.due_date && (
              <span className={`flex items-center gap-1 font-medium ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                <CalendarIcon className="h-3.5 w-3.5" />
                Due: {format(parseISO(todo.due_date), 'MMM d, yyyy')}
                {isOverdue && <span className="text-red-500 font-bold">(overdue)</span>}
              </span>
            )}
            <span className="text-emerald-600 font-medium">
              {isCompleted ? '✓ Completed' : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Hover Actions */}
      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <motion.button
          {...buttonMotion}
          onClick={(e) => { e.stopPropagation(); onPromote(todo.id || todo._id); }}
          disabled={isCompleted}
          className={`flex items-center gap-2 px-7 py-2 text-xs font-medium rounded-full transition border
            ${isCompleted 
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
              : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 hover:border-amber-300'
            }`}
        >
          <Zap className="h-4 w-4" /> Promote to Task
        </motion.button>

        <motion.button
          {...buttonMotion}
          onClick={(e) => { e.stopPropagation(); onDelete(todo.id || todo._id); }}
          className="w-11 h-11 flex items-center justify-center rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition"
        >
          <Trash2 className="h-5 w-5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── MAIN TODO DASHBOARD COMPONENT (single file – fully redesigned) ───────────
export default function TodoDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedUser, setSelectedUser] = useState("all");

  // ── DATA FETCHING ─────────────────────────────────────────────────────────
  const { data: todosRaw = [], isLoading } = useQuery({
    queryKey: ["todos", selectedUser],
    queryFn: async () => {
      let endpoint = "/todos";
      if (isAdmin && selectedUser !== "all") endpoint += `?user_id=${selectedUser}`;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
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
    onSuccess: () => {
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
      className="space-y-8 pb-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Banner – exact same as Dashboard */}
      <motion.div variants={itemVariants}>
        <Card 
          className="border-0 shadow-xl overflow-hidden relative rounded-3xl"
          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}
        >
          <div
            className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-10 -mr-20 -mt-20"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
          />
          <CardContent className="p-10 relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div>
                <h1 className="text-4xl font-bold tracking-tighter" style={{ color: COLORS.deepBlue }}>
                  Todo Management
                </h1>
                <p className="text-slate-600 mt-3 text-lg">
                  Personal &amp; team tasks • {format(new Date(), 'MMMM d, yyyy')}
                </p>
              </div>

              <motion.div
                {...cardMotion}
                className="flex items-center gap-4 px-8 py-5 rounded-3xl border-2 cursor-pointer hover:shadow-2xl transition-all bg-white"
                style={{ borderColor: COLORS.emeraldGreen }}
                onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}
              >
                <Target className="h-8 w-8" style={{ color: COLORS.emeraldGreen }} />
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Today</p>
                  <p className="font-bold text-2xl" style={{ color: COLORS.deepBlue }}>
                    {stats.total} active todos
                  </p>
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Key Metrics – exact same grid & hover as Dashboard */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-5" variants={itemVariants}>
        {/* Total */}
        <motion.div {...cardMotion} className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl">
          <CardContent className="p-7 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Todos</p>
                <p className="text-4xl font-bold mt-3" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
              </div>
              <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                <Target className="h-7 w-7" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
            <div className="mt-6 text-xs text-slate-500 group-hover:text-slate-700 flex items-center gap-1">View all <ArrowUpRight className="h-3 w-3" /></div>
          </CardContent>
        </motion.div>

        {/* Overdue */}
        <motion.div {...cardMotion} className={`border shadow-sm hover:shadow-2xl transition-all cursor-pointer group rounded-3xl ${stats.overdue > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-100'}`}>
          <CardContent className="p-7 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
                <p className="text-4xl font-bold mt-3" style={{ color: COLORS.coral }}>{stats.overdue}</p>
              </div>
              <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.coral}15` }}>
                <AlertCircle className="h-7 w-7" style={{ color: COLORS.coral }} />
              </div>
            </div>
            <div className="mt-6 text-xs text-slate-500 group-hover:text-slate-700 flex items-center gap-1">Resolve now <ArrowUpRight className="h-3 w-3" /></div>
          </CardContent>
        </motion.div>

        {/* Completion */}
        <motion.div {...cardMotion} className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl">
          <CardContent className="p-7 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completion</p>
                <p className="text-4xl font-bold mt-3" style={{ color: COLORS.emeraldGreen }}>{stats.completionRate}%</p>
              </div>
              <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                <TrendingUp className="h-7 w-7" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <Progress value={stats.completionRate} className="mt-6 h-2" />
          </CardContent>
        </motion.div>

        {/* Health */}
        <motion.div {...cardMotion} className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl">
          <CardContent className="p-7 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Health Score</p>
                <p className="text-4xl font-bold mt-3" style={{ color: COLORS.deepBlue }}>{stats.healthScore}%</p>
              </div>
              <div className="p-4 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
                <Sparkles className="h-7 w-7" style={{ color: COLORS.mediumBlue }} />
              </div>
            </div>
            <div className="text-emerald-600 text-xs mt-6 font-medium">Excellent • Keep it up</div>
          </CardContent>
        </motion.div>
      </motion.div>

      {/* Main Grid */}
      <motion.div className="grid grid-cols-1 xl:grid-cols-12 gap-8" variants={itemVariants}>
        {/* Add Form */}
        <div className="xl:col-span-5">
          <Card className="border-slate-100 shadow-sm rounded-3xl overflow-hidden h-full">
            <CardHeader className="pb-6 border-b px-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                  <Plus className="h-6 w-6" style={{ color: COLORS.emeraldGreen }} />
                </div>
                <div>
                  <CardTitle className="text-2xl font-semibold">Create New Todo</CardTitle>
                  <p className="text-sm text-slate-500">Add to your personal or team list</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-7">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to get done today?"
                className="w-full h-16 bg-slate-50 border border-transparent focus:border-emerald-300 rounded-3xl px-7 text-lg font-medium placeholder:text-slate-400 focus:outline-none transition"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional notes or description (optional)"
                className="w-full min-h-[110px] bg-slate-50 border border-transparent focus:border-emerald-300 rounded-3xl p-7 text-base resize-y focus:outline-none transition"
              />
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 block mb-2">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full h-14 bg-slate-50 border border-transparent focus:border-emerald-300 rounded-3xl px-7 text-sm focus:outline-none transition"
                  />
                </div>
                <Button 
                  onClick={handleAddTodo}
                  disabled={!title.trim() || addTodoMutation.isPending}
                  className="h-14 px-12 rounded-3xl text-base font-semibold flex-1"
                  style={{ backgroundColor: COLORS.deepBlue }}
                >
                  {addTodoMutation.isPending ? <RefreshCw className="animate-spin h-5 w-5" /> : "Create Todo"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* List Column */}
        <div className="xl:col-span-7 space-y-8">
          {/* Admin Filter */}
          {isAdmin && (
            <Card className="rounded-3xl border-slate-100 shadow-sm">
              <CardHeader className="pb-4 px-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">Filter by Team Member</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">Admin Only</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-8 pb-8">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="h-14 rounded-3xl border-slate-200 text-base">
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
              </CardContent>
            </Card>
          )}

          {/* AI Insight */}
          <Card className="rounded-3xl bg-gradient-to-r from-indigo-50 to-violet-50 border-none shadow-sm">
            <CardContent className="p-7 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="p-3 bg-white rounded-2xl">
                  <Sparkles className="h-7 w-7 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">AI Audit</p>
                  <p className="text-sm text-slate-600">
                    {stats.overdue} todos are overdue • {stats.completionRate}% on track
                  </p>
                </div>
              </div>
              <Button variant="ghost" className="text-violet-700 font-medium">Review Priorities →</Button>
            </CardContent>
          </Card>

          {/* Todo List */}
          <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
            <CardHeader className="px-8 pb-5 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  Your Todos ({todos.length})
                </CardTitle>
                <Badge className="bg-emerald-100 text-emerald-700 font-medium px-4 py-1">
                  {stats.completed} completed
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-8">
              {isLoading ? (
                <div className="py-16 text-center">
                  <RefreshCw className="animate-spin h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-sm text-slate-400 mt-4">Loading your todos...</p>
                </div>
              ) : todos.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-slate-200 rounded-3xl">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-slate-200" />
                  <p className="mt-6 text-slate-400">No todos yet. Create one above!</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[620px] overflow-y-auto pr-4">
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
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Footer Stats Bar */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-3 gap-5 text-center text-xs border border-slate-100 rounded-3xl p-8 bg-white"
      >
        <div>
          <div className="font-mono text-2xl font-bold text-emerald-600">{stats.completionRate}</div>
          <div className="text-slate-500">AVG COMPLETION</div>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-amber-600">{stats.overdue}</div>
          <div className="text-slate-500">NEEDS ATTENTION</div>
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-[#0D3B66]">{todos.filter(t => !(t.is_completed === true || t.status === "completed")).length}</div>
          <div className="text-slate-500">REMAINING</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
