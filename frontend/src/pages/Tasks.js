import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Users,
  X,
  Repeat,
  Calendar,
  Building2,
  User,
  LayoutGrid,
  List,
  Filter,
  CheckCircle,
  Clock,
  Play,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  darkGreen: '#0f9d58',
  darkBlue: '#0d47a1',
  darkOrange: '#e65100',
  darkRed: '#c62828',
  darkAmber: '#f57c00',
};

// Categories & Styles (unchanged)
const DEPARTMENTS = [
  { value: 'gst', label: 'GST' },
  { value: 'income_tax', label: 'INCOME TAX' },
  { value: 'accounts', label: 'ACCOUNTS' },
  { value: 'tds', label: 'TDS' },
  { value: 'roc', label: 'ROC' },
  { value: 'trademark', label: 'TRADEMARK' },
  { value: 'msme_smadhan', label: 'MSME SMADHAN' },
  { value: 'fema', label: 'FEMA' },
  { value: 'dsc', label: 'DSC' },
  { value: 'other', label: 'OTHER' },
];

const TASK_CATEGORIES = DEPARTMENTS;

const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const STATUS_STYLES = {
  pending: { bg: 'bg-amber-200', text: 'text-amber-900', label: 'To Do' },
  in_progress: { bg: 'bg-blue-200', text: 'text-blue-900', label: 'Progress' },
  completed: { bg: 'bg-emerald-200', text: 'text-emerald-900', label: 'Done' },
  review: { bg: 'bg-purple-200', text: 'text-purple-900', label: 'Review' },
  overdue: { bg: 'bg-red-200', text: 'text-red-900', label: 'Overdue' },
};

const PRIORITY_STYLES = {
  low: { bg: 'bg-slate-200', text: 'text-slate-900', label: 'LOW' },
  medium: { bg: 'bg-amber-200', text: 'text-amber-900', label: 'MEDIUM' },
  high: { bg: 'bg-orange-200', text: 'text-orange-900', label: 'HIGH' },
  critical: { bg: 'bg-red-200', text: 'text-red-900', label: 'CRITICAL' },
};

const CATEGORY_STYLES = {
  gst: { bg: 'bg-green-200', text: 'text-green-900' },
  income_tax: { bg: 'bg-indigo-200', text: 'text-indigo-900' },
  accounts: { bg: 'bg-purple-200', text: 'text-purple-900' },
  tds: { bg: 'bg-teal-200', text: 'text-teal-900' },
  roc: { bg: 'bg-orange-200', text: 'text-orange-900' },
  trademark: { bg: 'bg-pink-200', text: 'text-pink-900' },
  msme_smadhan: { bg: 'bg-cyan-200', text: 'text-cyan-900' },
  fema: { bg: 'bg-lime-200', text: 'text-lime-900' },
  dsc: { bg: 'bg-amber-200', text: 'text-amber-900' },
  other: { bg: 'bg-gray-200', text: 'text-gray-900' },
};

// ────────────────────────────────────────────────
// Framer Motion variants – this fixes the crash
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 15, stiffness: 100 },
  },
};
// ────────────────────────────────────────────────

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: 'unassigned',
    sub_assignees: [],
    due_date: '',
    priority: 'medium',
    status: 'pending',
    category: 'other',
    client_id: '',
    is_recurring: false,
    recurrence_pattern: 'monthly',
    recurrence_interval: 1,
  });

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    fetchClients();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks');
      setTasks(response.data);
    } catch (error) {
      toast.error('Failed to fetch tasks');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users');
    }
  };

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const taskData = {
        ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
        sub_assignees: formData.sub_assignees || [],
        client_id: formData.client_id || null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };
      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, taskData);
        toast.success('Task updated successfully!');
      } else {
        await api.post('/tasks', taskData);
        toast.success('Task created successfully!');
      }
      setDialogOpen(false);
      resetForm();
      fetchTasks();
    } catch (error) {
      toast.error('Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to || 'unassigned',
      sub_assignees: task.sub_assignees || [],
      due_date: task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '',
      priority: task.priority,
      status: task.status,
      category: task.category || 'other',
      client_id: task.client_id || '',
      is_recurring: task.is_recurring || false,
      recurrence_pattern: task.recurrence_pattern || 'monthly',
      recurrence_interval: task.recurrence_interval || 1,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success('Task deleted successfully!');
      fetchTasks();
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    try {
      const taskData = {
        title: task.title,
        description: task.description || '',
        assigned_to: task.assigned_to,
        sub_assignees: task.sub_assignees || [],
        due_date: task.due_date,
        priority: task.priority,
        status: newStatus,
        category: task.category || 'other',
        client_id: task.client_id || '',
        is_recurring: task.is_recurring || false,
        recurrence_pattern: task.recurrence_pattern || 'monthly',
        recurrence_interval: task.recurrence_interval || 1,
      };
      await api.put(`/tasks/${task.id}`, taskData);
      toast.success(`Task marked as ${newStatus === 'pending' ? 'To Do' : newStatus === 'in_progress' ? 'Progress' : 'Done'}!`);
      fetchTasks();
    } catch (error) {
      toast.error('Failed to update task status');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      assigned_to: 'unassigned',
      sub_assignees: [],
      due_date: '',
      priority: 'medium',
      status: 'pending',
      category: 'other',
      client_id: '',
      is_recurring: false,
      recurrence_pattern: 'monthly',
      recurrence_interval: 1,
    });
    setEditingTask(null);
  };

  const toggleSubAssignee = (userId) => {
    setFormData((prev) => {
      const isSelected = prev.sub_assignees.includes(userId);
      if (isSelected) {
        return { ...prev, sub_assignees: prev.sub_assignees.filter((id) => id !== userId) };
      } else {
        return { ...prev, sub_assignees: [...prev.sub_assignees, userId] };
      }
    });
  };

  const getUserName = (userId) => {
    const foundUser = users.find((u) => u.id === userId);
    return foundUser?.full_name || 'Unassigned';
  };

  const getClientName = (clientId) => {
    const client = clients.find((c) => c.id === clientId);
    return client?.company_name || 'No Client';
  };

  const isOverdue = (task) => {
    if (task.status === 'completed') return false;
    if (!task.due_date) return false;
    return new Date(task.due_date) < new Date();
  };

  const getDisplayStatus = (task) => {
    if (isOverdue(task)) return 'overdue';
    return task.status;
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || getDisplayStatus(task) === filterStatus;
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
    const matchesAssignee = filterAssignee === 'all' || task.assigned_to === filterAssignee;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee;
  });

  const getCategoryStyle = (cat) => {
    return CATEGORY_STYLES[cat] || CATEGORY_STYLES.other;
  };

  return (
    <motion.div className="space-y-6 pb-10" variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Header + View Toggle ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Tasks</h1>

        <div className="flex items-center gap-4">
          <div className="bg-slate-100 rounded-lg p-1 flex">
            <Button
              variant="ghost"
              size="sm"
              className={`px-3 ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={16} className="mr-1.5" />
              Grid
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`px-3 ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              onClick={() => setViewMode('list')}
            >
              <List size={16} className="mr-1.5" />
              List
            </Button>
          </div>

          {/* You can place your "New Task" button / dialog trigger here */}
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <motion.div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 auto-rows-fr'
            : 'w-full overflow-x-auto rounded-xl border bg-white shadow-sm'
        }
        variants={containerVariants}
      >
        {filteredTasks.length === 0 ? (
          <div className="col-span-full text-center py-16 text-slate-500">No tasks found</div>
        ) : viewMode === 'grid' ? (
          // ── GRID VIEW (your original cards) ───────────────────────────
          filteredTasks.map((task) => {
            const taskIsOverdue = isOverdue(task);
            const displayStatus = getDisplayStatus(task);
            const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;

            return (
              <motion.div key={task.id} variants={itemVariants} className="h-full">
                <Card
                  className={`rounded-[2.5rem] border border-slate-200 p-0 overflow-hidden shadow-md flex flex-col h-full ${
                    taskIsOverdue ? 'bg-red-50/30' : 'bg-white'
                  }`}
                >
                  <div className="px-5 pt-5 pb-2 flex flex-wrap gap-2">
                    <Badge
                      className={`${statusStyle.bg} ${statusStyle.text} rounded-full text-[10px] border-none px-3`}
                    >
                      {statusStyle.label}
                    </Badge>
                  </div>

                  <div className="px-6 py-3 flex-grow">
                    <h3 className="text-lg font-bold text-slate-800 leading-tight mb-1">{task.title}</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {getClientName(task.client_id)}
                    </p>
                    <div className="flex items-center gap-2 mt-3 text-slate-500 text-xs">
                      <Calendar size={14} />
                      <span>{task.due_date ? format(new Date(task.due_date), 'MMM dd, yyyy') : 'No Date'}</span>
                    </div>
                  </div>

                  <div className="p-4 mt-auto">
                    <div className="bg-slate-50 rounded-[1.5rem] p-2 border border-slate-100">
                      <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-200 w-full shadow-sm">
                        <button
                          onClick={() => handleQuickStatusChange(task, 'pending')}
                          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all ${
                            task.status === 'pending' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <Clock size={12} />
                          <span className="text-[10px] font-bold">TO DO</span>
                        </button>

                        <button
                          onClick={() => handleQuickStatusChange(task, 'in_progress')}
                          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all ${
                            task.status === 'in_progress' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <Play size={12} fill={task.status === 'in_progress' ? 'currentColor' : 'none'} />
                          <span className="text-[10px] font-bold">PROGRESS</span>
                        </button>

                        <button
                          onClick={() => handleQuickStatusChange(task, 'completed')}
                          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all ${
                            task.status === 'completed' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <CheckCircle size={12} />
                          <span className="text-[10px] font-bold">DONE</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between mt-3 px-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                          {task.category || 'other'}
                        </span>
                        <div className="flex gap-3">
                          <Edit
                            className="h-4 w-4 text-slate-300 hover:text-blue-500 cursor-pointer"
                            onClick={() => handleEdit(task)}
                          />
                          <Trash2
                            className="h-4 w-4 text-slate-300 hover:text-red-500 cursor-pointer"
                            onClick={() => handleDelete(task.id)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })
        ) : (
          // ── LIST VIEW ──────────────────────────────────────────────────
          <div className="min-w-[1000px]">
            {/* Header row */}
            <div className="grid grid-cols-13 gap-4 px-6 py-3 bg-slate-50 border-b text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <div className="col-span-4">Task</div>
              <div className="col-span-2">Client</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-1 text-center">Priority</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-2">Due Date</div>
              <div className="col-span-1 text-right pr-4">Actions</div>
            </div>

            {/* Rows */}
            {filteredTasks.map((task) => {
              const taskIsOverdue = isOverdue(task);
              const displayStatus = getDisplayStatus(task);
              const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
              const catStyle = getCategoryStyle(task.category);

              return (
                <motion.div
                  key={task.id}
                  variants={itemVariants}
                  onClick={() => handleEdit(task)}
                  className={`grid grid-cols-13 gap-4 px-6 py-3.5 border-b last:border-b-0 hover:bg-slate-50/60 transition-colors cursor-pointer ${
                    taskIsOverdue ? 'bg-red-50/40' : ''
                  }`}
                >
                  <div className="col-span-4">
                    <div className="font-medium text-slate-800">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</div>
                    )}
                  </div>

                  <div className="col-span-2 flex items-center text-sm text-slate-700">
                    {getClientName(task.client_id)}
                  </div>

                  <div className="col-span-2 flex items-center">
                    <Badge className={`${catStyle.bg} ${catStyle.text} text-xs border-none px-2.5 py-0.5`}>
                      {task.category ? task.category.toUpperCase() : 'OTHER'}
                    </Badge>
                  </div>

                  <div className="col-span-1 flex justify-center items-center">
                    <Badge className={`${PRIORITY_STYLES[task.priority]?.bg || 'bg-slate-200'} ${PRIORITY_STYLES[task.priority]?.text || 'text-slate-900'} text-xs border-none px-2.5 py-0.5`}>
                      {PRIORITY_STYLES[task.priority]?.label || 'MEDIUM'}
                    </Badge>
                  </div>

                  <div className="col-span-1 flex justify-center items-center">
                    <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs border-none px-2.5 py-0.5`}>
                      {statusStyle.label}
                    </Badge>
                  </div>

                  <div className="col-span-2 flex items-center text-sm">
                    {task.due_date ? (
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-500" />
                        <span className={taskIsOverdue ? 'text-red-600 font-medium' : ''}>
                          {format(new Date(task.due_date), 'MMM dd, yyyy')}
                        </span>
                        {taskIsOverdue && <AlertCircle size={14} className="text-red-500" />}
                      </div>
                    ) : (
                      <span className="text-slate-400">No due date</span>
                    )}
                  </div>

                  <div
                    className="col-span-1 flex justify-end items-center gap-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleQuickStatusChange(task, 'pending')}
                      className={`p-1.5 rounded hover:bg-slate-100 ${task.status === 'pending' ? 'text-amber-700' : 'text-slate-500'}`}
                      title="To Do"
                    >
                      <Clock size={18} />
                    </button>
                    <button
                      onClick={() => handleQuickStatusChange(task, 'in_progress')}
                      className={`p-1.5 rounded hover:bg-slate-100 ${task.status === 'in_progress' ? 'text-blue-700' : 'text-slate-500'}`}
                      title="In Progress"
                    >
                      <Play size={18} />
                    </button>
                    <button
                      onClick={() => handleQuickStatusChange(task, 'completed')}
                      className={`p-1.5 rounded hover:bg-slate-100 ${task.status === 'completed' ? 'text-emerald-700' : 'text-slate-500'}`}
                      title="Done"
                    >
                      <CheckCircle size={18} />
                    </button>
                    <button onClick={() => handleEdit(task)} className="text-blue-600 hover:text-blue-800" title="Edit">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleDelete(task.id)} className="text-red-600 hover:text-red-800" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ── Your Dialog / Form code goes here (unchanged) ────────────── */}
      {/* <Dialog open={dialogOpen} onOpenChange={setDialogOpen}> ... */ }
    </motion.div>
  );
}
