import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Users, X, Repeat, Calendar, Building2, User, LayoutGrid, List, Filter, CheckCircle, Clock, Play, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

// Brand Colors (darker variants used where needed)
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  darkGreen: '#0f9d58',     // darker green for DONE
  darkBlue: '#0d47a1',      // darker blue for PROGRESS
  darkOrange: '#e65100',    // darker orange for HIGH
  darkRed: '#c62828',       // darker red for CRITICAL/OVERDUE
  darkAmber: '#f57c00',     // darker amber for MEDIUM
};

// Department categories for CA/CS firms
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

// Predefined task categories (alias)
const TASK_CATEGORIES = DEPARTMENTS;

// Recurrence pattern options
const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// Darker & improved status styles
const STATUS_STYLES = {
  pending: { bg: 'bg-amber-200', text: 'text-amber-900', label: 'To Do', btn: 'bg-amber-600 hover:bg-amber-700' },
  in_progress: { bg: 'bg-blue-200', text: 'text-blue-900', label: 'Progress', btn: 'bg-blue-700 hover:bg-blue-800' },
  completed: { bg: 'bg-emerald-200', text: 'text-emerald-900', label: 'Done', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  review: { bg: 'bg-purple-200', text: 'text-purple-900', label: 'Review', btn: 'bg-purple-700 hover:bg-purple-800' },
  overdue: { bg: 'bg-red-200', text: 'text-red-900', label: 'Overdue', btn: 'bg-red-700 hover:bg-red-800' },
};

// Darker priority styles
const PRIORITY_STYLES = {
  low: { bg: 'bg-slate-200', text: 'text-slate-900', label: 'LOW' },
  medium: { bg: 'bg-amber-200', text: 'text-amber-900', label: 'MEDIUM' },
  high: { bg: 'bg-orange-200', text: 'text-orange-900', label: 'HIGH' },
  critical: { bg: 'bg-red-200', text: 'text-red-900', label: 'CRITICAL' },
};

// Category colors (slightly darker)
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

// Card gradient (darker versions)
const getCardGradient = (task, isOverdue) => {
  if (isOverdue) {
    return 'linear-gradient(135deg, rgba(239, 83, 80, 0.25) 0%, rgba(211, 47, 47, 0.15) 100%)';
  }
  if (task.priority === 'high' || task.priority === 'critical') {
    return 'linear-gradient(135deg, rgba(245, 124, 0, 0.25) 0%, rgba(230, 81, 0, 0.15) 100%)';
  }
  return 'none';
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  // Filters
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
    setFormData(prev => {
      const isSelected = prev.sub_assignees.includes(userId);
      if (isSelected) {
        return { ...prev, sub_assignees: prev.sub_assignees.filter(id => id !== userId) };
      } else {
        return { ...prev, sub_assignees: [...prev.sub_assignees, userId] };
      }
    });
  };

  const getUserName = (userId) => {
    const foundUser = users.find(u => u.id === userId);
    return foundUser?.full_name || 'Unassigned';
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.company_name || 'No Client';
  };

  const getCategoryLabel = (value) => {
    const cat = TASK_CATEGORIES.find(c => c.value === value);
    return cat ? cat.label : value || 'Other';
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

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || getDisplayStatus(task) === filterStatus;
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
    const matchesAssignee = filterAssignee === 'all' || task.assigned_to === filterAssignee;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee;
  });

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'pending' && !isOverdue(t)).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  };

  return (
    <motion.div
      className="space-y-6 pb-10"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>Task Management</h1>
          <p className="text-slate-600 mt-1">Manage and track all your compliance tasks</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button
              className="text-white rounded-lg px-6 shadow-lg transition-all hover:scale-105 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
              data-testid="create-task-btn"
            >
              <Plus className="mr-2 h-5 w-5" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="create-task-dialog">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl" style={{ color: COLORS.deepBlue }}>
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </DialogTitle>
              <DialogDescription>
                {editingTask ? 'Update task details below.' : 'Fill in the details to create a new task.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Task Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Task Title <span className="text-red-500">*</span></Label>
                <Input
                  id="title"
                  placeholder="Enter task title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  data-testid="task-title-input"
                />
              </div>
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the task..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  data-testid="task-description-input"
                />
              </div>
              {/* Client and Due Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select
                    value={formData.client_id || 'no_client'}
                    onValueChange={(value) => setFormData({ ...formData, client_id: value === 'no_client' ? '' : value })}
                  >
                    <SelectTrigger className="border-slate-300 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="No Client" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="no_client">No Client</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    data-testid="task-due-date-input"
                  />
                </div>
              </div>

              {/* Assignee and Co-assignee Row */}
              {user?.role !== 'staff' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="assigned_to">Assignee</Label>
                    <Select
                      value={formData.assigned_to}
                      onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                    >
                      <SelectTrigger className="border-slate-300 focus:border-blue-500 focus:ring-blue-500" data-testid="task-assign-select">
                        <SelectValue placeholder="Select assignee..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="co_assignee">Co-assignee</Label>
                    <Select
                      value={formData.sub_assignees?.[0] || 'none'}
                      onValueChange={(value) => {
                        if (value === 'none') {
                          setFormData({ ...formData, sub_assignees: [] });
                        } else {
                          setFormData({ ...formData, sub_assignees: [value] });
                        }
                      }}
                    >
                      <SelectTrigger className="border-slate-300 focus:border-blue-500 focus:ring-blue-500" data-testid="task-co-assign-select">
                        <SelectValue placeholder="Select co-assignee..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="none">No Co-assignee</SelectItem>
                        {users
                          .filter(u => u.id !== formData.assigned_to)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Department Selection with Toggle Buttons */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">Department</Label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map((dept) => {
                    const isSelected = formData.category === dept.value;
                    return (
                      <button
                        key={dept.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: dept.value })}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                          isSelected
                            ? 'bg-blue-700 text-white shadow-md border-blue-800'
                            : 'bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-800 border-slate-300'
                        }`}
                      >
                        {dept.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger className="border-slate-300 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recurring Task */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_recurring" className="flex items-center gap-2">
                    <Repeat className="h-4 w-4" />
                    Recurring Task
                  </Label>
                  <Switch
                    id="is_recurring"
                    checked={formData.is_recurring}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
                    data-testid="task-recurring-switch"
                  />
                </div>

                {formData.is_recurring && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    <div className="space-y-2">
                      <Label htmlFor="recurrence_pattern">Repeat</Label>
                      <Select
                        value={formData.recurrence_pattern}
                        onValueChange={(value) => setFormData({ ...formData, recurrence_pattern: value })}
                      >
                        <SelectTrigger className="border-slate-300 focus:border-blue-500 focus:ring-blue-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECURRENCE_PATTERNS.map((pattern) => (
                            <SelectItem key={pattern.value} value={pattern.value}>
                              {pattern.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recurrence_interval">Every</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={formData.recurrence_interval}
                          onChange={(e) => setFormData({ ...formData, recurrence_interval: parseInt(e.target.value) || 1 })}
                          className="w-20 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-600">
                          {formData.recurrence_pattern === 'daily' && 'day(s)'}
                          {formData.recurrence_pattern === 'weekly' && 'week(s)'}
                          {formData.recurrence_pattern === 'monthly' && 'month(s)'}
                          {formData.recurrence_pattern === 'yearly' && 'year(s)'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setDialogOpen(false); resetForm(); }}
                  className="px-6 border-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="text-white px-6 shadow-md"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
                >
                  {loading ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Stats Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setFilterStatus('all')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-3xl font-bold mt-1" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'pending' ? 'ring-2 ring-amber-500' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">To Do</p>
            <p className="text-3xl font-bold mt-1 text-amber-700">{stats.todo}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'in_progress' ? 'ring-2 ring-blue-500' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress</p>
            <p className="text-3xl font-bold mt-1 text-blue-700">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'completed' ? 'ring-2 ring-emerald-500' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-3xl font-bold mt-1 text-emerald-700">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'overdue' ? 'ring-2 ring-red-500' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
            <p className="text-3xl font-bold mt-1 text-red-700">{stats.overdue}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search and Filters */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
            data-testid="task-search-input"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-36 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {TASK_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(user?.role === 'admin' || user?.role === 'manager') && (
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="w-36 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex border border-slate-300 rounded-lg overflow-hidden bg-white">
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${viewMode === 'grid' ? 'bg-slate-100' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${viewMode === 'list' ? 'bg-slate-100' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Task Cards Grid / List */}
      <motion.div
        className={viewMode === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 auto-rows-fr'
          : 'space-y-4'}
        variants={containerVariants}
      >
        {filteredTasks.length === 0 ? (
          <motion.div variants={itemVariants} className="col-span-full text-center py-16">
            <p className="text-slate-500 text-xl font-medium">No tasks found</p>
            <p className="text-slate-400 text-sm mt-2">Try adjusting your filters or create a new task</p>
          </motion.div>
        ) : (
          filteredTasks.map((task) => {
            const taskIsOverdue = isOverdue(task);
            const displayStatus = getDisplayStatus(task);
            const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
            const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;

            return (
              <motion.div key={task.id} variants={itemVariants} className="h-full">
                <Card
                  className={`rounded-3xl border border-slate-200 p-0 overflow-hidden shadow-md transition-all hover:shadow-xl flex flex-col h-full min-h-[300px]
                    ${taskIsOverdue ? 'bg-red-50/60 border-red-200' : (task.priority === 'high' || task.priority === 'critical') ? 'bg-orange-50/60 border-orange-200' : 'bg-white'}`}
                >
                  {/* TOP BADGE ROW */}
                  <div className="px-5 pt-4 pb-2 flex flex-wrap gap-2">
                    <Badge variant="secondary" className={`${statusStyle.bg} ${statusStyle.text} rounded-full text-xs px-3 py-1 border-none uppercase font-bold tracking-wide`}>
                      {statusStyle.label}
                    </Badge>
                    <Badge variant="secondary" className={`${priorityStyle.bg} ${priorityStyle.text} rounded-full text-xs px-3 py-1 border-none uppercase font-bold tracking-wide`}>
                      {priorityStyle.label}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-200 text-slate-800 rounded-full text-xs px-3 py-1 border-none uppercase font-bold tracking-wide">
                      {task.category?.toUpperCase() || 'OTHER'}
                    </Badge>
                  </div>

                  {/* CONTENT AREA */}
                  <div className="px-5 py-3 space-y-2 flex-1 flex flex-col">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight line-clamp-2">
                        {task.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 uppercase font-semibold truncate">
                        {getClientName(task.client_id)}
                      </p>
                    </div>

                    <div className="space-y-2 mt-2 text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{getUserName(task.assigned_to)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <span>{task.due_date ? format(new Date(task.due_date), 'MMM dd, yyyy') : 'No Date'}</span>
                      </div>
                    </div>
                  </div>

                  {/* ACTION FOOTER */}
                  <div className="bg-slate-50/80 px-4 py-4 border-t border-slate-200 flex flex-col gap-3 mt-auto">
                    {/* Status Buttons Row */}
                    <div className="flex justify-between items-center gap-2 bg-white p-2 rounded-xl shadow-sm">
                      <Button
                        variant={task.status === 'pending' ? 'default' : 'ghost'}
                        className={`flex-1 rounded-lg h-9 text-xs gap-1.5 transition-all font-medium ${
                          task.status === 'pending'
                            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-amber-50'
                        }`}
                        onClick={() => handleQuickStatusChange(task, 'pending')}
                      >
                        <Clock className="h-3.5 w-3.5" /> To Do
                      </Button>
                      <Button
                        variant={task.status === 'in_progress' ? 'default' : 'ghost'}
                        className={`flex-1 rounded-lg h-9 text-xs gap-1.5 transition-all font-medium ${
                          task.status === 'in_progress'
                            ? 'bg-blue-700 hover:bg-blue-800 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-blue-50'
                        }`}
                        onClick={() => handleQuickStatusChange(task, 'in_progress')}
                      >
                        <Play className="h-3.5 w-3.5" /> Progress
                      </Button>
                      <Button
                        variant={task.status === 'completed' ? 'default' : 'ghost'}
                        className={`flex-1 rounded-lg h-9 text-xs gap-1.5 transition-all font-medium ${
                          task.status === 'completed'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-emerald-50'
                        }`}
                        onClick={() => handleQuickStatusChange(task, 'completed')}
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Done
                      </Button>
                    </div>

                    {/* Meta & Actions */}
                    <div className="flex justify-between items-center px-2">
                      <Badge variant="outline" className="text-xs border-slate-300 text-slate-700 font-medium px-3 py-1">
                        {task.category || 'OTHER'}
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-700 hover:bg-blue-50" onClick={() => handleEdit(task)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(task.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </motion.div>
  );
}
