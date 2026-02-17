import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, Button, Input, Label, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Checkbox } from '@/components/ui';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, LayoutGrid, ListIcon as List,
  Clock, Play, CheckCircle, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

// ── Constants ────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  pending:    { bg: 'bg-amber-200', text: 'text-amber-900', label: 'To Do' },
  in_progress: { bg: 'bg-blue-200',  text: 'text-blue-900',  label: 'Progress' },
  completed:  { bg: 'bg-emerald-200',text: 'text-emerald-900',label: 'Done' },
  overdue:    { bg: 'bg-red-200',    text: 'text-red-900',   label: 'Overdue' },
};

const PRIORITY_STYLES = {
  low:      { bg: 'bg-slate-200', label: 'Low' },
  medium:   { bg: 'bg-amber-200', label: 'Medium' },
  high:     { bg: 'bg-orange-200',label: 'High' },
  critical: { bg: 'bg-red-200',   label: 'Critical' },
};

const CATEGORY_STYLES = {
  gst: 'bg-green-200 text-green-900',
  income_tax: 'bg-indigo-200 text-indigo-900',
  accounts: 'bg-purple-200 text-purple-900',
  tds: 'bg-teal-200 text-teal-900',
  roc: 'bg-orange-200 text-orange-900',
  trademark: 'bg-pink-200 text-pink-900',
  msme_smadhan: 'bg-cyan-200 text-cyan-900',
  fema: 'bg-lime-200 text-lime-900',
  dsc: 'bg-amber-200 text-amber-900',
  other: 'bg-gray-200 text-gray-900',
};

const DEPARTMENTS = [
  'gst','income_tax','accounts','tds','roc','trademark',
  'msme_smadhan','fema','dsc','other'
];

// ── Animation variants ──────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', damping: 15 } },
};

// ── Main Component ──────────────────────────────────────────────────────
export default function Tasks() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');

  // Filters
  const [status, setStatus]     = useState('all');
  const [priority, setPriority] = useState('all');
  const [category, setCategory] = useState('all');
  const [assignee, setAssignee] = useState('all');
  const [clientId, setClientId] = useState('all');

  const [dueFrom, setDueFrom]         = useState('');
  const [dueTo, setDueTo]             = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [recurringOnly, setRecurringOnly] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/tasks').then(r => setTasks(r.data)),
      api.get('/users').then(r => setUsers(r.data)),
      api.get('/clients').then(r => setClients(r.data)),
    ]).catch(() => toast.error('Failed to load data'));
  }, []);

  const isOverdue = useCallback(task =>
    task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date(),
  []);

  const matchesFilter = useCallback(task => {
    if (search) {
      const q = search.toLowerCase();
      if (!task.title?.toLowerCase().includes(q) && !task.description?.toLowerCase().includes(q)) return false;
    }

    if (status !== 'all'     && (isOverdue(task) ? 'overdue' : task.status) !== status) return false;
    if (priority !== 'all'   && task.priority !== priority) return false;
    if (category !== 'all'   && task.category !== category) return false;
    if (assignee !== 'all'   && task.assigned_to !== assignee) return false;
    if (clientId !== 'all'   && task.client_id !== clientId) return false;

    if (overdueOnly    && !isOverdue(task)) return false;
    if (myTasksOnly    && task.assigned_to !== user?.id && !task.sub_assignees?.includes(user?.id)) return false;
    if (recurringOnly  && !task.is_recurring) return false;

    if (dueFrom && task.due_date && new Date(task.due_date) < new Date(dueFrom)) return false;
    if (dueTo   && task.due_date && new Date(task.due_date) > new Date(dueTo))   return false;

    return true;
  }, [search, status, priority, category, assignee, clientId, overdueOnly, myTasksOnly, recurringOnly, dueFrom, dueTo, user?.id]);

  const visibleTasks = tasks.filter(matchesFilter);

  const changeStatus = async (task, newStatus) => {
    try {
      await api.put(`/tasks/${task.id}`, { ...task, status: newStatus });
      toast.success('Status updated');
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch {
      toast.error('Failed to update status');
    }
  };

  const reset = () => {
    setSearch('');
    setStatus('all'); setPriority('all'); setCategory('all');
    setAssignee('all'); setClientId('all');
    setDueFrom(''); setDueTo('');
    setOverdueOnly(false); setMyTasksOnly(false); setRecurringOnly(false);
  };

  return (
    <motion.div className="space-y-6 pb-10" variants={containerVariants} initial="hidden" animate="visible">

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 rounded p-1 flex">
            <Button variant="ghost" size="sm" className={viewMode === 'grid' ? 'bg-white shadow' : ''} onClick={() => setViewMode('grid')}>
              <LayoutGrid size={16} className="mr-1.5" /> Grid
            </Button>
            <Button variant="ghost" size="sm" className={viewMode === 'list' ? 'bg-white shadow' : ''} onClick={() => setViewMode('list')}>
              <List size={16} className="mr-1.5" /> List
            </Button>
          </div>
          <Button size="sm"><Plus size={16} className="mr-1.5" /> New</Button>
        </div>
      </div>

      {/* Filters – compact version */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">To Do</SelectItem>
              <SelectItem value="in_progress">Progress</SelectItem>
              <SelectItem value="completed">Done</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Object.keys(PRIORITY_STYLES).map(p => (
                <SelectItem key={p} value={p}>{PRIORITY_STYLES[p].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
        </div>

        {/* Advanced toggles */}
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={myTasksOnly} onCheckedChange={setMyTasksOnly} />
            My tasks
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={overdueOnly} onCheckedChange={setOverdueOnly} />
            Overdue only
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={recurringOnly} onCheckedChange={setRecurringOnly} />
            Recurring only
          </label>
        </div>
      </div>

      {/* Content */}
      <motion.div
        className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' : 'overflow-x-auto'}
        variants={containerVariants}
      >
        {visibleTasks.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">No tasks found</div>
        ) : viewMode === 'grid' ? (
          visibleTasks.map(task => (
            <motion.div key={task.id} variants={itemVariants}>
              {/* Your grid card content here – keep it short */}
              <Card className="h-full">
                <div className="p-4">
                  <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-muted-foreground">{task.client?.name || '—'}</div>
                  {/* quick status buttons, etc. */}
                </div>
              </Card>
            </motion.div>
          ))
        ) : (
          <div className="min-w-[900px]">
            {/* List view header + rows – keep minimal */}
            {/* ... your list implementation ... */}
          </div>
        )}
      </motion.div>

      {/* Dialog / form – add your dialog code here */}
    </motion.div>
  );
}
