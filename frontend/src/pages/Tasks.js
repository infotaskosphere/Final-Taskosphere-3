import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
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
import { Plus, Edit, Trash2, Search, Users, X, Repeat, Calendar, Building2, User, LayoutGrid, List, Filter, Circle, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
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
// Predefined task categories for CA/CS firms (alias for backward compatibility)
const TASK_CATEGORIES = DEPARTMENTS;
// Recurrence pattern options
const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
// Status colors with gradients for cards
const STATUS_STYLES = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'To Do' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  review: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Review' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
};
const STATUS_GRADIENTS = {
  overdue: 'linear-gradient(135deg, #fecaca 0%, #f87171 100%)',
  pending: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 100%)',
  in_progress: 'linear-gradient(135deg, #dbeafe 0%, #3b82f6 100%)',
  completed: 'linear-gradient(135deg, #d1fae5 0%, #10b981 100%)',
  review: 'linear-gradient(135deg, #e9d5ff 0%, #a855f7 100%)',
};
// Priority colors
const PRIORITY_STYLES = {
  low: { bg: 'bg-green-100', text: 'text-green-600', label: 'LOW' },
  medium: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'MEDIUM' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'HIGH' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'CRITICAL' },
};
// Card gradient styles based on status/priority
const getCardGradient = (task, isOverdue) => {
  if (isOverdue) {
    return 'linear-gradient(135deg, rgba(254, 202, 202, 0.6) 0%, rgba(252, 165, 165, 0.4) 50%, rgba(248, 113, 113, 0.2) 100%)';
  }
  if (task.status === 'completed') {
    return 'linear-gradient(135deg, rgba(167, 243, 208, 0.6) 0%, rgba(134, 239, 172, 0.4) 50%, rgba(110, 231, 148, 0.2) 100%)';
  }
  if (task.status === 'in_progress') {
    return 'linear-gradient(135deg, rgba(191, 219, 254, 0.6) 0%, rgba(147, 197, 253, 0.4) 50%, rgba(96, 165, 250, 0.2) 100%)';
  }
  if (task.status === 'pending') {
    if (task.priority === 'high' || task.priority === 'critical') {
      return 'linear-gradient(135deg, rgba(254, 215, 170, 0.6) 0%, rgba(253, 186, 116, 0.4) 50%, rgba(251, 146, 60, 0.2) 100%)';
    } else {
      return 'linear-gradient(135deg, rgba(254, 243, 199, 0.6) 0%, rgba(253, 230, 138, 0.4) 50%, rgba(252, 211, 77, 0.2) 100%)';
    }
  }
  return 'none';
};
const getPriorityLightBg = (displayStatus) => {
  if (displayStatus === 'overdue') return 'bg-red-100 text-red-700';
  if (displayStatus === 'pending') return 'bg-amber-100 text-amber-700';
  if (displayStatus === 'in_progress') return 'bg-blue-100 text-blue-700';
  if (displayStatus === 'completed') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
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
  const { user, hasPermission } = useAuth();
  const canAssignTasks = hasPermission("can_assign_tasks");
  const canEditTasks = hasPermission("can_edit_tasks");
  const canDeleteTasks = hasPermission("can_delete_data");
  const navigate = useNavigate();
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
  fetchClients();
  // Only admin & manager can assign
  if (canAssignTasks) {
    fetchUsers();
  }
}, [user]);
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
  // Quick status update from task card
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
      toast.success(`Task marked as ${newStatus === 'pending' ? 'To Do' : newStatus === 'in_progress' ? 'In Progress' : 'Completed'}!`);
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
  // Check if task is overdue
  const isOverdue = (task) => {
    if (task.status === 'completed') return false;
    if (!task.due_date) return false;
    return new Date(task.due_date) < new Date();
  };
  // Get task status for display
  const getDisplayStatus = (task) => {
    if (isOverdue(task)) return 'overdue';
    return task.status;
  };
  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || getDisplayStatus(task) === filterStatus;
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  });
  // Stats
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'pending' && !isOverdue(t)).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  };
  return (
    <motion.div
      className="space-y-6"
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
          {canEditTasks && (
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
          )}
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
                  className="border-slate-300"
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
                  className="border-slate-300"
                  data-testid="task-description-input"
                />
              </div>
              {/* Client and Due Date Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select
                    value={formData.client_id || 'no_client'}
                    onValueChange={(value) => {
                      if (value === '__add_new_client__') {
                        navigate('/clients?openAddClient=true&returnTo=tasks');
                      } else {
                        setFormData({
                          ...formData,
                          client_id: value === 'no_client' ? '' : value
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="border-slate-300">
                      <SelectValue placeholder="No Client" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="no_client">No Client</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value="__add_new_client__"
                        className="text-blue-600 font-semibold"
                      >
                        + Add New Client
                      </SelectItem>
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
                    className="border-slate-300"
                    data-testid="task-due-date-input"
                  />
                </div>
              </div>
              {/* Assignee and Co-assignee Row */}
              {canAssignTasks && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="assigned_to">Assignee</Label>
                    <Select
                      value={formData.assigned_to}
                      onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                    >
                      <SelectTrigger className="border-slate-300" data-testid="task-assign-select">
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
                    <Label htmlFor="co_assignee">Co-assignees</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between border-slate-300" data-testid="task-co-assign-select">
                          {formData.sub_assignees.length > 0 ? `${formData.sub_assignees.length} selected` : "Select co-assignees..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 max-h-60 overflow-y-auto">
                        <div className="space-y-2">
                          {users
                            .filter(u => u.id !== formData.assigned_to)
                            .map((u) => (
                              <div key={u.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`sub-${u.id}`}
                                  checked={formData.sub_assignees.includes(u.id)}
                                  onCheckedChange={() => toggleSubAssignee(u.id)}
                                />
                                <label htmlFor={`sub-${u.id}`} className="text-sm text-slate-700">{u.full_name}</label>
                              </div>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
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
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2
                          ${isSelected
                            ? 'text-white shadow-md'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                          }`}
                        style={isSelected ? { background: COLORS.mediumBlue } : {}}
                        data-testid={`dept-${dept.value}`}
                      >
                        {isSelected && (
                          <Switch
                            checked={true}
                            className="h-4 w-7 pointer-events-none"
                            style={{ background: 'rgba(255,255,255,0.3)' }}
                          />
                        )}
                        {dept.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Priority and Status Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger className="border-slate-300" data-testid="task-priority-select">
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
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="border-slate-300" data-testid="task-status-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Recurring Task Section */}
              <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-slate-600" />
                    <Label htmlFor="is_recurring" className="font-medium">Recurring Task</Label>
                  </div>
                  <Switch
                    id="is_recurring"
                    checked={formData.is_recurring}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
                    data-testid="task-recurring-switch"
                  />
                </div>
             
                {formData.is_recurring && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    <div className="space-y-2">
                      <Label htmlFor="recurrence_pattern">Repeat</Label>
                      <Select
                        value={formData.recurrence_pattern}
                        onValueChange={(value) => setFormData({ ...formData, recurrence_pattern: value })}
                      >
                        <SelectTrigger>
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
                          className="w-20"
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
                  className="px-6"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="text-white px-6"
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
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold mt-1" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'pending' ? 'ring-2 ring-amber-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">To Do</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{stats.todo}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'in_progress' ? 'ring-2 ring-blue-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'completed' ? 'ring-2 ring-emerald-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'overdue' ? 'ring-2 ring-red-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{stats.overdue}</p>
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
            className="pl-10 bg-white"
            data-testid="task-search-input"
          />
        </div>
     
        <div className="flex items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-white">
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
            <SelectTrigger className="w-36 bg-white">
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
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {TASK_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className={viewMode === 'grid' ? 'bg-slate-100' : ''}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={viewMode === 'list' ? 'bg-slate-100' : ''}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
      {/* Task Cards Grid - Responsive with consistent card sizing */}
      <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        <motion.div
          className={viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 auto-rows-fr'
            : 'space-y-3'}
          variants={containerVariants}
        >
          {filteredTasks.length === 0 ? (
            <motion.div variants={itemVariants} className="col-span-full text-center py-12">
              <p className="text-slate-500 text-lg">No tasks found</p>
              <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or create a new task</p>
            </motion.div>
          ) : (
            filteredTasks.map((task) => {
              const taskIsOverdue = isOverdue(task);
              const displayStatus = getDisplayStatus(task);
              const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
              const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
              const cardGradient = getCardGradient(task, taskIsOverdue);
              const lightClass = getPriorityLightBg(displayStatus);
              const isHighPriority = task.priority === 'high' || task.priority === 'critical';
              let priorityGradient = isHighPriority ? 'linear-gradient(135deg, #fed7aa 0%, #fb923c 100%)' : null;
              if (task.priority === 'critical') priorityGradient = 'linear-gradient(135deg, #fecaca 0%, #f87171 100%)';
              const priorityClass = `px-2.5 py-1 rounded-full text-xs font-semibold ${isHighPriority ? 'text-white' : lightClass}`;
              const priorityBgStyle = isHighPriority ? { background: priorityGradient } : {};
           
              return (
                <motion.div key={task.id} variants={itemVariants} className="h-full">
                  <Card
                    className={`border hover:shadow-lg transition-all duration-200 hover:-translate-y-1 overflow-hidden group h-full rounded-2xl
                      ${taskIsOverdue ? 'border-red-300' : task.priority === 'high' || task.priority === 'critical' ? 'border-orange-300' : 'border-slate-200'}`}
                    style={{ background: cardGradient !== 'none' ? cardGradient : 'white', minHeight: '280px' }}
                    data-testid={`task-card-${task.id}`}
                  >
                    <CardContent className="p-3 sm:p-4 flex flex-col h-full">
                      {/* Status & Priority Tags */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white`}
                          style={{ background: STATUS_GRADIENTS[displayStatus] }}
                        >
                          {statusStyle.label}
                        </span>
                        <span
                          className={priorityClass}
                          style={priorityBgStyle}
                        >
                          {priorityStyle.label}
                        </span>
                        {task.is_recurring && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                            <Repeat className="h-3 w-3 inline mr-1" />
                            Recurring
                          </span>
                        )}
{task.created_by === user?.id && (
  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
    Assigned By You
  </span>
)}
                      </div>
                      {/* Task Title - Fixed height */}
                      <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2 min-h-[40px] text-sm" style={{ color: COLORS.deepBlue }}>
                        {task.title}
                      </h3>
                      {/* Description - Fixed height for equal cards */}
                      <div className="h-[40px] mb-3">
                        {task.description ? (
                          <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No description</p>
                        )}
                      </div>
                      {/* Meta Info - flex-1 to push footer down */}
                      <div className="space-y-1.5 text-xs text-slate-500 flex-1 min-h-[50px]">
                        {task.client_id && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{getClientName(task.client_id)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{getUserName(task.assigned_to)}</span>
                        </div>
                        {task.due_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{format(new Date(task.due_date), 'MMM dd, yyyy')}</span>
                          </div>
                        )}
                      </div>
                      {/* Quick Status Change Buttons - Consistent pill shape */}
{(canEditTasks && (
  task.assigned_to === user?.id ||
  task.sub_assignees?.includes(user?.id) ||
  task.created_by === user?.id
)) && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-auto pt-3 border-t border-slate-200/50">
                        <button
                          onClick={() => handleQuickStatusChange(task, 'pending')}
                          className={`flex items-center justify-center gap-1.5 h-8 rounded-full text-xs font-semibold transition-all
                            ${task.status === 'pending' ? (task.priority === 'high' || task.priority === 'critical' ? 'bg-orange-500 text-white shadow-md' : 'bg-amber-500 text-white shadow-md') : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'}`}
                          title="Mark as To Do"
                          data-testid={`status-todo-${task.id}`}
                        >
                          <Circle className="h-3.5 w-3.5" />
                          <span>To Do</span>
                        </button>
                        <button
                          onClick={() => handleQuickStatusChange(task, 'in_progress')}
                          className={`flex items-center justify-center gap-1.5 h-8 rounded-full text-xs font-semibold transition-all
                            ${task.status === 'in_progress' ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'}`}
                          title="Mark as In Progress"
                          data-testid={`status-progress-${task.id}`}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          <span>Progress</span>
                        </button>
                        <button
                          onClick={() => handleQuickStatusChange(task, 'completed')}
                          className={`flex items-center justify-center gap-1.5 h-8 rounded-full text-xs font-semibold transition-all
                            ${task.status === 'completed' ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700'}`}
                          title="Mark as Completed"
                          data-testid={`status-done-${task.id}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Done</span>
                        </button>
                      </div>
)}
                      {/* Category & Actions */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/50">
                        <Badge
                          variant="outline"
                          className="text-xs rounded-lg px-2.5 py-1"
                          style={{ borderColor: COLORS.mediumBlue, color: COLORS.mediumBlue }}
                        >
                          {getCategoryLabel(task.category)}
                        </Badge>
<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEditTasks && task.created_by === user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg hover:bg-blue-50"
                            onClick={() => handleEdit(task)}
                            data-testid={`edit-task-${task.id}`}
                          >
                            <Edit className="h-4 w-4 text-blue-600" />
                          </Button>
                          )}
                          {canDeleteTasks && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg hover:bg-red-50"
                            onClick={() => handleDelete(task.id)}
                            data-testid={`delete-task-${task.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
