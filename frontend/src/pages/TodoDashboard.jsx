import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isPast, parseISO, isToday, isTomorrow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Zap, Trash2, CheckCircle2, Sparkles, ShieldCheck,
  RefreshCw, Target, TrendingUp, AlertCircle,
  Calendar as CalendarIcon, History, Users, Search, X,
  User as UserIcon, Activity, Layers, CheckSquare, Circle,
} from 'lucide-react';

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  navy:    '#0B2545',
  blue:    '#1366B0',
  sky:     '#2A9D8F',
  emerald: '#0D9E6A',
  amber:   '#E9A62A',
  coral:   '#E05A4E',
  slate:   '#475569',
  muted:   '#94A3B8',
  bg:      '#F0F4F9',
  card:    '#FFFFFF',
  border:  '#E2E8F0',
  text:    '#0F172A',
};

// ── SPRING CONFIGS ────────────────────────────────────────────────────────────
const spring = {
  snappy: { type: 'spring', stiffness: 420, damping: 28 },
  smooth: { type: 'spring', stiffness: 280, damping: 24 },
};

// ── ANIMATION VARIANTS ────────────────────────────────────────────────────────
const fadeUp = {
  hidden:  { opacity: 0, y: 18, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.22 } },
};

const stagger = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.08 } },
};

const rowVariant = {
  hidden:  { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, x: 10, transition: { duration: 0.18 } },
};

// ── DUE LABEL HELPER ──────────────────────────────────────────────────────────
const getDueLabel = (due_date) => {
  if (!due_date) return null;
  try {
    const d = parseISO(due_date);
    if (isToday(d))    return { label: 'Today',    color: T.amber  };
    if (isTomorrow(d)) return { label: 'Tomorrow', color: T.sky    };
    if (isPast(d))     return { label: 'Overdue',  color: T.coral  };
    return { label: format(d, 'MMM d'), color: T.muted };
  } catch { return null; }
};

// ── STAT CARD ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accent, progress }) {
  return (
    <motion.div
      variants={fadeUp}
      className="relative bg-white rounded-2xl border overflow-hidden"
      style={{ borderColor: T.border }}
      whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(11,37,69,0.08)' }}
      transition={spring.snappy}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}14` }}>
            <Icon size={18} style={{ color: accent }} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.muted }}>{label}</span>
        </div>
        <div className="text-3xl font-black tracking-tight mb-0.5" style={{ color: T.navy, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {sub && <div className="text-[11px] font-medium" style={{ color: T.muted }}>{sub}</div>}
        {progress !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${accent}18` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: accent }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── TODO ITEM ─────────────────────────────────────────────────────────────────
function TodoItem({ todo, onToggle, onPromote, onDelete, showOwner, ownerName }) {
  const isCompleted = todo.is_completed === true || todo.status === 'completed';
  const due         = getDueLabel(todo.due_date);
  const isOverdue   = due?.label === 'Overdue';

  return (
    <motion.div
      layout
      variants={rowVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="group relative flex items-center gap-3 px-5 py-3.5 border-b last:border-b-0 transition-colors"
      style={{
        borderColor: T.border,
        background:  isOverdue && !isCompleted ? '#FFF5F4' : 'transparent',
      }}
      whileHover={{ backgroundColor: isOverdue && !isCompleted ? '#FFF0EF' : '#F8FAFF' }}
    >
      {/* Overdue accent bar */}
      {isOverdue && !isCompleted && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: T.coral }} />
      )}

      {/* Checkbox */}
      <motion.button
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.88 }}
        transition={spring.snappy}
        onClick={() => onToggle(todo.id || todo._id)}
        className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background:  isCompleted ? T.emerald : 'transparent',
          borderColor: isCompleted ? T.emerald : T.border,
        }}
      >
        {isCompleted && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.snappy}>
            <CheckCircle2 size={11} color="#fff" />
          </motion.div>
        )}
      </motion.button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-sm font-semibold truncate max-w-[260px]"
            style={{
              color:          isCompleted ? T.muted : T.text,
              textDecoration: isCompleted ? 'line-through' : 'none',
            }}
          >
            {todo.title || 'Untitled'}
          </span>
          {showOwner && ownerName && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: `${T.blue}12`, color: T.blue }}>
              <UserIcon size={9} />{ownerName}
            </span>
          )}
          {due && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${due.color}14`, color: due.color }}>
              <CalendarIcon size={9} />{due.label}
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${T.emerald}12`, color: T.emerald }}>
              ✓ Done
            </span>
          )}
        </div>
        {todo.description && (
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: T.muted }}>{todo.description}</p>
        )}
      </div>

      {/* Actions — visible on row hover */}
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={(e) => { e.stopPropagation(); onPromote(todo.id || todo._id); }}
          disabled={isCompleted}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all"
          style={isCompleted
            ? { background: T.bg, color: T.muted, borderColor: T.border, cursor: 'not-allowed' }
            : { background: `${T.amber}12`, color: '#92400E', borderColor: `${T.amber}40` }
          }
        >
          <Zap size={11} /> Promote
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={(e) => { e.stopPropagation(); onDelete(todo.id || todo._id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg border transition-all"
          style={{ borderColor: T.border, color: T.muted }}
          onMouseEnter={e => { e.currentTarget.style.background = `${T.coral}12`; e.currentTarget.style.color = T.coral; e.currentTarget.style.borderColor = `${T.coral}40`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border; }}
        >
          <Trash2 size={13} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── LOG EVENT BADGE ────────────────────────────────────────────────────────────
function EventBadge({ entry }) {
  const safeFormat = (dt) => { try { return format(new Date(dt), 'MMM d, h:mm a'); } catch { return '—'; } };
  if (entry.event === 'deleted' || entry.deleted_at) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: `${T.coral}12`, color: T.coral }}>
        <X size={10} /> Deleted · {safeFormat(entry.deleted_at || Date.now())}
      </span>
    );
  }
  if (entry.event === 'uncompleted') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: `${T.amber}12`, color: '#92400E' }}>
        ↩ Reopened
      </span>
    );
  }
  if (entry.completed_at) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: `${T.emerald}12`, color: T.emerald }}>
        <CheckCircle2 size={10} /> Completed · {safeFormat(entry.completed_at)}
      </span>
    );
  }
  return null;
}

// ── SEARCH INPUT ──────────────────────────────────────────────────────────────
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T.muted }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-8 text-sm rounded-xl border outline-none transition-all"
        style={{ background: T.bg, borderColor: T.border, color: T.text }}
        onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blue}18`; }}
        onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded" style={{ color: T.muted }}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ── TAB PILL ──────────────────────────────────────────────────────────────────
function TabPill({ id, label, icon: Icon, count, activeTab, setActiveTab }) {
  const active = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all"
      style={active
        ? { background: T.navy, color: '#fff', boxShadow: `0 2px 12px ${T.navy}30` }
        : { background: 'transparent', color: T.slate }
      }
    >
      <Icon size={13} />
      {label}
      {count > 0 && (
        <span
          className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
          style={active
            ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
            : { background: `${T.navy}12`, color: T.navy }
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── FILTER CHIP ───────────────────────────────────────────────────────────────
function FilterChip({ id, label, count, todoFilter, setTodoFilter }) {
  const active = todoFilter === id;
  return (
    <button
      onClick={() => setTodoFilter(id)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all"
      style={active
        ? { background: T.blue, color: '#fff', borderColor: T.blue }
        : { background: 'transparent', color: T.slate, borderColor: T.border }
      }
    >
      {label}
      {count !== undefined && <span className="text-[9px] font-black opacity-75">{count}</span>}
    </button>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function TodoDashboard() {
  const { user }       = useAuth();
  const queryClient    = useQueryClient();
  const isAdmin        = user?.role === 'admin';
  const isManager      = user?.role === 'manager';

  // ── Form state ───────────────────────────────────────────────────────────
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [dueDate,     setDueDate]     = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState('todos');   // 'todos' | 'log'
  const [selectedUser, setSelectedUser] = useState('self');   // 'self' | 'everyone' | <userId>
  const [todoFilter,   setTodoFilter]   = useState('all');    // 'all' | 'pending' | 'completed' | 'overdue'
  const [search,       setSearch]       = useState('');
  const [logSearch,    setLogSearch]    = useState('');

  // ── In-memory todo activity log ───────────────────────────────────────────
  const [todoLog, setTodoLog] = useState([]);

  // ── Fetch all users (admin / manager only) ────────────────────────────────
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    enabled:  isAdmin || isManager,
    queryFn:  async () => {
      const res = await api.get('/users');
      return res.data || [];
    },
  });

  // ── Determine "Everyone" visibility ───────────────────────────────────────
  // Admin always gets it.
  // Staff: gets it only if their view_other_todos array contains the special
  // token "everyone" (admin sets this in the permissions editor).
  const canSeeEveryone = useMemo(() => {
    if (isAdmin) return true;
    const list = Array.isArray(user?.permissions?.view_other_todos)
      ? user.permissions.view_other_todos
      : [];
    return list.includes('everyone');
  }, [isAdmin, user]);

  // ── Build permitted-user list for dropdown ────────────────────────────────
  const permittedUsers = useMemo(() => {
    if (isAdmin) return allUsers;
    if (isManager) return allUsers.filter(u => (u.id || u._id) !== user?.id);
    const list = Array.isArray(user?.permissions?.view_other_todos)
      ? user.permissions.view_other_todos.filter(id => id !== 'everyone')
      : [];
    return allUsers.filter(u => list.includes(u.id || u._id));
  }, [isAdmin, isManager, allUsers, user]);

  const showDropdown = isAdmin || isManager || permittedUsers.length > 0 || canSeeEveryone;

  // ── Resolve query user_id param ───────────────────────────────────────────
  // 'self'     → own id
  // 'everyone' → 'all' (backend supports ?user_id=all for admin)
  // <id>       → that user's id
  const resolvedUserId = useMemo(() => {
    if (selectedUser === 'self')     return user?.id ?? null;
    if (selectedUser === 'everyone') return 'all';
    return selectedUser;
  }, [selectedUser, user?.id]);

  // ── Fetch todos ───────────────────────────────────────────────────────────
  const { data: todosRaw = [], isLoading } = useQuery({
    queryKey: ['todos', 'page', resolvedUserId],
    enabled:  !!resolvedUserId,
    queryFn:  async () => {
      const res = await api.get('/todos', { params: { user_id: resolvedUserId } });
      return res.data || [];
    },
  });

  const todos = useMemo(() => todosRaw, [todosRaw]);

  // ── User id → display name map ────────────────────────────────────────────
  const userMap = useMemo(() => {
    const map = {};
    allUsers.forEach(u => {
      const id = u.id || u._id;
      if (id) map[id] = u.full_name || u.user_name || 'Unknown';
    });
    if (user?.id) map[user.id] = user.full_name || user.email || 'Me';
    return map;
  }, [allUsers, user]);

  const resolveUserName = useCallback((userId) => {
    if (!userId) return 'Unknown';
    if (userId === user?.id) return user?.full_name || 'Me';
    return userMap[userId] || userId;
  }, [userMap, user]);

  // ── Seed log from already-completed todos ─────────────────────────────────
  useEffect(() => {
    const completed = todos.filter(t => t.is_completed === true || t.status === 'completed');
    if (!completed.length) return;
    setTodoLog(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const fresh = completed
        .filter(t => !existingIds.has(t.id || t._id))
        .map(t => ({
          id:            t.id || t._id,
          title:         t.title || 'Untitled',
          created_by_id: t.user_id || t.created_by || null,
          owner_id:      t.user_id || null,
          created_at:    t.created_at || null,
          completed_at:  t.completed_at
            ? new Date(t.completed_at)
            : t.updated_at ? new Date(t.updated_at) : new Date(),
          deleted_at:    null,
          event:         'completed',
        }));
      if (!fresh.length) return prev;
      return [...fresh, ...prev]
        .sort((a, b) => {
          const at = a.completed_at || a.deleted_at || new Date(a.created_at || 0);
          const bt = b.completed_at || b.deleted_at || new Date(b.created_at || 0);
          return bt - at;
        })
        .slice(0, 200);
    });
  }, [todos]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = todos.length;
    const completed = todos.filter(t => t.is_completed === true || t.status === 'completed').length;
    const pending   = total - completed;
    const overdue   = todos.filter(t => {
      if (!t.due_date) return false;
      if (t.is_completed === true || t.status === 'completed') return false;
      try { return isPast(parseISO(t.due_date)); } catch { return false; }
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const healthScore    = Math.max(0, Math.min(100, 100 - (overdue * 10)));
    return { total, completed, pending, overdue, completionRate, healthScore };
  }, [todos]);

  // ── Filtered todos for list ───────────────────────────────────────────────
  const filteredTodos = useMemo(() => {
    let list = todos;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    switch (todoFilter) {
      case 'pending':
        list = list.filter(t => !(t.is_completed === true || t.status === 'completed'));
        break;
      case 'completed':
        list = list.filter(t => t.is_completed === true || t.status === 'completed');
        break;
      case 'overdue':
        list = list.filter(t => {
          if (!t.due_date || t.is_completed === true || t.status === 'completed') return false;
          try { return isPast(parseISO(t.due_date)); } catch { return false; }
        });
        break;
      default: break;
    }
    return list;
  }, [todos, search, todoFilter]);

  // ── Filtered log ──────────────────────────────────────────────────────────
  // Scoped by selected user:
  // • 'self'     → only current user's entries
  // • 'everyone' → all entries (admin / permitted)
  // • <userId>   → only that user's entries
  const filteredLog = useMemo(() => {
    let list = todoLog;
    if (logSearch) {
      const q = logSearch.toLowerCase();
      list = list.filter(e => (e.title || '').toLowerCase().includes(q));
    }
    if (selectedUser === 'self') {
      list = list.filter(e => e.owner_id === user?.id);
    } else if (selectedUser !== 'everyone') {
      list = list.filter(e => e.owner_id === selectedUser);
    }
    return list;
  }, [todoLog, logSearch, selectedUser, user?.id]);

  // ── Dropdown label ────────────────────────────────────────────────────────
  const selectedUserLabel = useMemo(() => {
    if (selectedUser === 'self')     return `My Todos — ${user?.full_name || 'Me'}`;
    if (selectedUser === 'everyone') return 'Everyone — All Users';
    const u = allUsers.find(u => (u.id || u._id) === selectedUser);
    return u ? `${u.full_name || u.user_name}'s Todos` : 'Selected User';
  }, [selectedUser, allUsers, user]);

  // ── Notification helper ───────────────────────────────────────────────────
  const sendNotification = useCallback(async ({ title: t, message }) => {
    try { await api.post('/notifications/send', { title: t, message, type: 'todo' }); } catch (_) {}
  }, []);

  // ── Invalidate all relevant queries ──────────────────────────────────────
  const invalidateTodos = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todos', 'page', resolvedUserId] });
    queryClient.invalidateQueries({ queryKey: ['todos', 'dashboard-card', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  }, [queryClient, resolvedUserId, user?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (payload) => api.post('/todos', payload),
    onSuccess: (_, vars) => {
      invalidateTodos();
      toast.success('Todo created');
      setTitle(''); setDescription(''); setDueDate('');
      sendNotification({ title: '📝 New Todo', message: `"${vars.title}" created by ${user?.full_name || 'a user'}.` });
    },
    onError: () => toast.error('Failed to create todo'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id }) => {
      const todo = todos.find(t => (t.id || t._id) === id);
      if (!todo) throw new Error('Todo not found');
      const nowCompleted = !(todo.is_completed === true || todo.status === 'completed');
      return api.patch(`/todos/${id}`, { is_completed: nowCompleted });
    },
    onSuccess: (_, { id }) => {
      const todo = todos.find(t => (t.id || t._id) === id);
      if (todo) {
        const wasCompleted = todo.is_completed === true || todo.status === 'completed';
        setTodoLog(prev => [{
          id:            todo.id || todo._id,
          title:         todo.title || 'Untitled',
          created_by_id: todo.user_id || todo.created_by || null,
          owner_id:      todo.user_id || null,
          created_at:    todo.created_at || null,
          completed_at:  wasCompleted ? null : new Date(),
          deleted_at:    null,
          event:         wasCompleted ? 'uncompleted' : 'completed',
        }, ...prev].slice(0, 200));
        if (!wasCompleted) {
          sendNotification({ title: '✅ Todo Completed', message: `"${todo.title}" completed by ${user?.full_name || 'a user'}.` });
        }
      }
      invalidateTodos();
    },
    onError: () => toast.error('Failed to update todo'),
  });

  const promoteMutation = useMutation({
    mutationFn: (id) => api.post(`/todos/${id}/promote-to-task`),
    onSuccess: (_, id) => {
      toast.success('Promoted to Master Task!');
      invalidateTodos();
      const todo = todos.find(t => (t.id || t._id) === id);
      sendNotification({ title: '⚡ Todo Promoted', message: `"${todo?.title || 'A todo'}" promoted by ${user?.full_name || 'a user'}.` });
    },
    onError: () => toast.error('Failed to promote todo'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/todos/${id}`),
    onSuccess: (_, id) => {
      const deleted = todos.find(t => (t.id || t._id) === id);
      if (deleted) {
        setTodoLog(prev => [{
          id:            deleted.id || deleted._id,
          title:         deleted.title || 'Untitled',
          created_by_id: deleted.user_id || deleted.created_by || null,
          owner_id:      deleted.user_id || null,
          created_at:    deleted.created_at || null,
          completed_at:  null,
          deleted_at:    new Date(),
          event:         'deleted',
        }, ...prev].slice(0, 200));
      }
      invalidateTodos();
      toast.success('Todo deleted');
    },
    onError: () => toast.error('Failed to delete todo'),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAdd     = () => {
    if (!title.trim()) return;
    addMutation.mutate({
      title:        title.trim(),
      description:  description.trim(),
      due_date:     dueDate ? new Date(dueDate).toISOString() : null,
      is_completed: false,
    });
  };
  const handleToggle  = (id) => toggleMutation.mutate({ id });
  const handlePromote = (id) => promoteMutation.mutate(id);
  const handleDelete  = (id) => deleteMutation.mutate(id);

  // ── User selector (shared between both tabs) ──────────────────────────────
  const UserSelector = ({ label = 'Filter by user' }) => (
    showDropdown ? (
      <Select value={selectedUser} onValueChange={setSelectedUser}>
        <SelectTrigger className="h-9 rounded-xl border text-sm font-semibold" style={{ borderColor: T.border, minWidth: 200 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="self">My Todos ({user?.full_name || 'Me'})</SelectItem>
          {canSeeEveryone && (
            <SelectItem value="everyone">
              <span className="flex items-center gap-2">
                <Users size={12} style={{ color: T.blue }} />
                Everyone — All Users
              </span>
            </SelectItem>
          )}
          {permittedUsers.map(u => (
            <SelectItem key={u.id || u._id} value={u.id || u._id}>
              {u.full_name || u.user_name} ({u.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="min-h-screen pb-12"
      style={{ background: T.bg, fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif" }}
    >

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="px-6 pt-6 pb-5 border-b"
        style={{ background: T.card, borderColor: T.border }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: `linear-gradient(135deg, ${T.navy}, ${T.blue})` }}
            >
              <CheckSquare size={20} color="#fff" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight" style={{ color: T.navy }}>
                Todo Management
              </h1>
              <p className="text-xs font-medium mt-0.5" style={{ color: T.muted }}>
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
                {selectedUser === 'everyone' && ' · All users view'}
                {selectedUser !== 'self' && selectedUser !== 'everyone' && (() => {
                  const u = allUsers.find(u => (u.id || u._id) === selectedUser);
                  return u ? ` · ${u.full_name || u.user_name}'s list` : '';
                })()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold" style={{ background: `${T.emerald}0F`, borderColor: `${T.emerald}30`, color: T.emerald }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: T.emerald }} />
              {stats.completed} done
            </div>
            {stats.overdue > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold" style={{ background: `${T.coral}0F`, borderColor: `${T.coral}30`, color: T.coral }}>
                <AlertCircle size={11} />{stats.overdue} overdue
              </div>
            )}
            {/* Tab switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl border" style={{ background: T.bg, borderColor: T.border }}>
              <TabPill id="todos" label="Todos"    icon={CheckSquare} count={stats.pending}       activeTab={activeTab} setActiveTab={setActiveTab} />
              <TabPill id="log"   label="Activity" icon={History}     count={filteredLog.length}  activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="px-6 pt-6 space-y-6">
        <AnimatePresence mode="wait">

          {/* ─────────────────── TODOS TAB ─────────────────────────────── */}
          {activeTab === 'todos' && (
            <motion.div key="todos" variants={stagger} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-6">

              {/* KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Layers}      label="Total"      value={stats.total}             sub="todos tracked"                             accent={T.navy}    />
                <StatCard icon={AlertCircle} label="Overdue"    value={stats.overdue}           sub="need attention"                            accent={stats.overdue > 0 ? T.coral : T.muted} />
                <StatCard icon={TrendingUp}  label="Completion" value={`${stats.completionRate}%`} sub={`${stats.completed} of ${stats.total}`} accent={T.emerald} progress={stats.completionRate} />
                <StatCard icon={Sparkles}    label="Health"     value={`${stats.healthScore}%`} sub={stats.healthScore >= 80 ? 'On track' : 'Needs focus'} accent={stats.healthScore >= 80 ? T.sky : T.amber} progress={stats.healthScore} />
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

                {/* LEFT — Create form */}
                <div className="xl:col-span-4 space-y-4">

                  {/* Create card */}
                  <motion.div variants={fadeUp} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: T.border }}>
                    <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${T.navy}, ${T.sky})` }} />
                    <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: T.border }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${T.emerald}12` }}>
                        <Plus size={15} style={{ color: T.emerald }} />
                      </div>
                      <div>
                        <div className="text-sm font-black" style={{ color: T.navy }}>New Todo</div>
                        <div className="text-[11px] font-medium" style={{ color: T.muted }}>Add to your list</div>
                      </div>
                    </div>
                    <div className="p-5 space-y-4">

                      {/* Title */}
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: T.muted }}>Title *</label>
                        <input
                          type="text" value={title} onChange={e => setTitle(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAdd()}
                          placeholder="What needs to get done?"
                          className="w-full h-10 rounded-xl border px-3 text-sm font-semibold placeholder:font-normal outline-none transition-all"
                          style={{ background: T.bg, borderColor: T.border, color: T.text }}
                          onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blue}18`; }}
                          onBlur={e =>  { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: T.muted }}>Notes</label>
                        <textarea
                          value={description} onChange={e => setDescription(e.target.value)}
                          placeholder="Additional context…" rows={3}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none outline-none transition-all placeholder:text-slate-400"
                          style={{ background: T.bg, borderColor: T.border, color: T.text }}
                          onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blue}18`; }}
                          onBlur={e =>  { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                        />
                      </div>

                      {/* Due Date */}
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: T.muted }}>Due Date</label>
                        <input
                          type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                          className="w-full h-10 rounded-xl border px-3 text-sm outline-none transition-all"
                          style={{ background: T.bg, borderColor: T.border, color: T.text }}
                          onFocus={e => { e.target.style.borderColor = T.blue; e.target.style.boxShadow = `0 0 0 3px ${T.blue}18`; }}
                          onBlur={e =>  { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                        />
                      </div>

                      {/* Submit */}
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={spring.snappy}
                        onClick={handleAdd}
                        disabled={!title.trim() || addMutation.isPending}
                        className="w-full h-10 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: `linear-gradient(135deg, ${T.navy}, ${T.blue})`, color: '#fff', boxShadow: `0 4px 16px ${T.navy}28` }}
                      >
                        {addMutation.isPending
                          ? <><RefreshCw size={14} className="animate-spin" /> Creating…</>
                          : <><Plus size={14} /> Create Todo</>
                        }
                      </motion.button>
                    </div>
                  </motion.div>

                  {/* Quick stats strip */}
                  <motion.div variants={fadeUp} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: T.border }}>
                    <div className="grid grid-cols-3 divide-x" style={{ divideColor: T.border }}>
                      {[
                        { label: 'Done',  value: `${stats.completionRate}%`, color: T.emerald },
                        { label: 'Alert', value: stats.overdue,              color: T.amber   },
                        { label: 'Left',  value: stats.pending,              color: T.navy    },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="px-3 py-4 text-center border-r last:border-r-0" style={{ borderColor: T.border }}>
                          <div className="text-xl font-black tabular-nums" style={{ color }}>{value}</div>
                          <div className="text-[9px] font-black uppercase tracking-widest mt-0.5" style={{ color: T.muted }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* AI Audit insight */}
                  <motion.div variants={fadeUp} className="bg-white rounded-2xl border p-4 flex items-center gap-3" style={{ borderColor: T.border }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EDE9FE' }}>
                      <Sparkles size={16} style={{ color: '#7C3AED' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold" style={{ color: T.text }}>AI Audit</div>
                      <div className="text-xs font-medium" style={{ color: T.muted }}>
                        {stats.overdue > 0 ? `${stats.overdue} overdue · ` : ''}{stats.completionRate}% on track
                      </div>
                    </div>
                    <button className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all" style={{ background: '#EDE9FE', color: '#7C3AED' }}>
                      Review →
                    </button>
                  </motion.div>
                </div>

                {/* RIGHT — User filter + Todo list */}
                <div className="xl:col-span-8 space-y-4">

                  {/* User filter card */}
                  {showDropdown && (
                    <motion.div variants={fadeUp} className="bg-white rounded-2xl border p-4" style={{ borderColor: T.border }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Users size={14} style={{ color: T.blue }} />
                          <span className="text-sm font-black" style={{ color: T.navy }}>
                            {isAdmin ? 'Filter by Team Member' : 'View Todo List'}
                          </span>
                        </div>
                        {isAdmin && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest" style={{ background: `${T.navy}0F`, color: T.navy }}>
                            Admin
                          </span>
                        )}
                      </div>
                      <UserSelector />
                    </motion.div>
                  )}

                  {/* Todo list card */}
                  <motion.div variants={fadeUp} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: T.border }}>
                    <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${T.navy}, ${T.sky})` }} />

                    {/* List header */}
                    <div className="px-5 py-3.5 border-b" style={{ borderColor: T.border }}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <CheckCircle2 size={15} style={{ color: T.emerald }} />
                          <span className="text-sm font-black truncate" style={{ color: T.navy }}>{selectedUserLabel}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: T.bg, color: T.slate }}>
                            {filteredTodos.length}
                          </span>
                        </div>
                        <div className="flex-shrink-0 w-full sm:w-52">
                          <SearchInput value={search} onChange={setSearch} placeholder="Search todos…" />
                        </div>
                      </div>

                      {/* Filter chips */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <FilterChip id="all"       label="All"       count={todos.length}      todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        <FilterChip id="pending"   label="Pending"   count={stats.pending}     todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        <FilterChip id="completed" label="Completed" count={stats.completed}   todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        {stats.overdue > 0 && (
                          <FilterChip id="overdue" label="Overdue"   count={stats.overdue}     todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        )}
                      </div>
                    </div>

                    {/* Column headers */}
                    <div className="px-5 py-2 border-b grid grid-cols-[20px_1fr_auto] gap-4 items-center" style={{ background: `${T.bg}88`, borderColor: T.border }}>
                      <div />
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.muted }}>Task</span>
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.muted }}>Actions</span>
                    </div>

                    {/* Body */}
                    <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                      {isLoading ? (
                        <div className="py-16 flex flex-col items-center gap-3">
                          <RefreshCw size={22} className="animate-spin" style={{ color: T.muted }} />
                          <p className="text-xs font-medium" style={{ color: T.muted }}>Loading todos…</p>
                        </div>
                      ) : filteredTodos.length === 0 ? (
                        <div className="py-16 flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: T.bg }}>
                            <CheckSquare size={24} style={{ color: T.border }} />
                          </div>
                          <p className="text-sm font-bold" style={{ color: T.slate }}>
                            {search || todoFilter !== 'all' ? 'No matching todos' : 'No todos yet'}
                          </p>
                          <p className="text-xs font-medium" style={{ color: T.muted }}>
                            {search || todoFilter !== 'all' ? 'Try adjusting your filters' : 'Create one using the form on the left'}
                          </p>
                        </div>
                      ) : (
                        <AnimatePresence>
                          {filteredTodos.map(todo => (
                            <TodoItem
                              key={todo.id || todo._id}
                              todo={todo}
                              onToggle={handleToggle}
                              onPromote={handlePromote}
                              onDelete={handleDelete}
                              showOwner={selectedUser === 'everyone'}
                              ownerName={resolveUserName(todo.user_id)}
                            />
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─────────────────── LOG TAB ────────────────────────────────── */}
          {activeTab === 'log' && (
            <motion.div key="log" variants={stagger} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-5">

              {/* Log controls */}
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1 min-w-0 max-w-sm">
                  <SearchInput value={logSearch} onChange={setLogSearch} placeholder="Search activity log…" />
                </div>
                {showDropdown && (
                  <div className="flex-shrink-0 w-64">
                    <UserSelector />
                  </div>
                )}
                <div className="flex-shrink-0">
                  <span className="text-xs font-bold px-3 py-2 rounded-xl" style={{ background: `${T.navy}0A`, color: T.slate }}>
                    {filteredLog.length} entries
                  </span>
                </div>
              </motion.div>

              {/* Log card */}
              <motion.div variants={fadeUp} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: T.border }}>
                <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${T.blue}, ${T.navy})` }} />

                {/* Header */}
                <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: T.border }}>
                  <div className="flex items-center gap-2.5">
                    <Activity size={14} style={{ color: T.blue }} />
                    <span className="text-sm font-black" style={{ color: T.navy }}>Todo Activity Log</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: T.bg, color: T.slate }}>
                      {filteredLog.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: T.muted }}>
                    {selectedUser === 'everyone'
                      ? 'All users'
                      : selectedUser === 'self'
                        ? 'My activity'
                        : (() => { const u = allUsers.find(u => (u.id||u._id) === selectedUser); return u ? `${u.full_name || u.user_name}'s activity` : 'Selected user'; })()
                    }
                  </span>
                </div>

                {/* Column headers */}
                <div className="px-5 py-2.5 border-b" style={{ background: `${T.bg}88`, borderColor: T.border }}>
                  <div className="grid gap-4 items-center" style={{ gridTemplateColumns: '1fr 150px 150px 190px' }}>
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.muted }}>Todo Title</span>
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.muted }}>Owner</span>
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.muted }}>Created On</span>
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.muted }}>Event</span>
                  </div>
                </div>

                {/* Body */}
                {filteredLog.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: T.bg }}>
                      <History size={24} style={{ color: T.border }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: T.slate }}>No activity yet</p>
                    <p className="text-xs font-medium" style={{ color: T.muted }}>Complete or delete a todo and it will appear here</p>
                  </div>
                ) : (
                  <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                    <AnimatePresence>
                      {filteredLog.map((entry, idx) => {
                        const ownerName   = resolveUserName(entry.owner_id || entry.created_by_id);
                        const createdDate = entry.created_at
                          ? (() => { try { return format(new Date(entry.created_at), 'MMM d, yyyy'); } catch { return '—'; } })()
                          : '—';
                        return (
                          <motion.div
                            key={`${entry.id}-${idx}`}
                            variants={rowVariant}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="px-5 py-3 border-b last:border-b-0 transition-colors"
                            style={{ borderColor: T.border }}
                            whileHover={{ backgroundColor: '#F8FAFF' }}
                          >
                            <div className="grid gap-4 items-center" style={{ gridTemplateColumns: '1fr 150px 150px 190px' }}>
                              <p className="text-sm font-semibold truncate" style={{ color: T.text }} title={entry.title}>
                                {entry.title}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${T.blue}12` }}>
                                  <UserIcon size={10} style={{ color: T.blue }} />
                                </div>
                                <span className="text-xs font-medium truncate" style={{ color: T.slate }}>{ownerName}</span>
                              </div>
                              <span className="text-xs font-medium" style={{ color: T.muted }}>{createdDate}</span>
                              <div className="flex justify-start">
                                <EventBadge entry={entry} />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
