import React, { useState, useEffect, useRef } from 'react';
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
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
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
  pending: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'To Do' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'In Progress' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Completed' },
  review: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Review' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
};
// Priority colors
const PRIORITY_STYLES = {
  low: { bg: 'bg-green-50', text: 'text-green-600', label: 'LOW' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'MEDIUM' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'HIGH' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', label: 'CRITICAL' },
};
const getStripeClass = (task, isOverdue) => {
  const p = (task.priority || '').toLowerCase();
  const s = (task.status || '').toLowerCase();

  // Overdue always red
  if (isOverdue) return 'border-l-4 border-red-600';

  // Status overrides
  if (s === 'completed') return 'border-l-4 border-blue-700';
  if (s === 'in_progress') return 'border-l-4 border-purple-500';

  // Priority
  if (p === 'critical') return 'border-l-4 border-red-600';
  if (p === 'high') return 'border-l-4 border-orange-500';
  if (p === 'medium') return 'border-l-4 border-yellow-400';
  if (p === 'low') return 'border-l-4 border-green-500';

  return 'border-l-4 border-slate-300';
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
  const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
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
  const fileInputRef = useRef(null);
  useEffect(() => {
  fetchTasks();
  fetchClients();
  // Only admin & manager can assign
  if (canAssignTasks) {
    fetchUsers();
  }
  fetchUsers();
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
    const matchesAssignee = filterAssignee === 'all' || task.assigned_to === filterAssignee;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee;
  });
  // Stats
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'pending' && !isOverdue(t)).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  };
  const handleCsvUploadClick = () => {
    fileInputRef.current.click();
  };
  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        try {
          await api.post('/tasks/bulk', { tasks: results.data });
          toast.success('Tasks uploaded successfully!');
          fetchTasks();
        } catch (error) {
          toast.error('Failed to upload tasks');
        }
      }
    });
  };
  const handleExportCsv = () => {
    const csvData = tasks.map(task => ({
      title: task.title,
      description: task.description,
      assigned_to: getUserName(task.assigned_to),
      due_date: task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '',
      priority: task.priority,
      status: task.status,
      category: task.category,
      client_id: getClientName(task.client_id),
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'tasks.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.autoTable({
      head: [['Title', 'Client', 'Priority', 'Status', 'Due Date']],
      body: tasks.map(task => [
        task.title,
        getClientName(task.client_id),
        task.priority.toUpperCase(),
        task.status.toUpperCase(),
        task.due_date ? format(new Date(task.due_date), 'MMM dd, yyyy') : ''
      ])
    });
    doc.save('tasks.pdf');
  };
  return (
    <motion.div
      className="space-y-4 sm:space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <Card className="border border-slate-200 shadow-sm rounded-2xl">
        <CardContent className="p-4 sm:p-6 flex justify-between items-center">
          <h1 className="text-xl sm:text-2xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>Task Management</h1>
          <div className="flex gap-4">
            <Button variant="outline" className="border-slate-300" onClick={handleCsvUploadClick}>Upload CSV</Button>
            <Button variant="outline" className="border-slate-300" onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" className="border-slate-300" onClick={handleExportPdf}>Export PDF</Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              {canEditTasks && (
              <DialogTrigger asChild>
                <Button
                  className="text-white rounded-lg px-6"
                  style={{ backgroundColor: COLORS.mediumBlue }}
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
                                ? 'text-slate-700 border border-blue-600 bg-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                              }`}
                            data-testid={`dept-${dept.value}`}
                          >
                            {isSelected && (
                              <div className="h-4 w-4 rounded-full bg-blue-600" />
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
                      style={{ backgroundColor: COLORS.mediumBlue }}
                    >
                      {loading ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
      {/* Stats Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card className="border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl" onClick={() => setFilterStatus('all')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-2xl sm:text-3xl font-bold font-outfit mt-1" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
          </CardContent>
        </Card>
        <Card className={`border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl`} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">To Do</p>
            <p className="text-2xl sm:text-3xl font-bold font-outfit mt-1 text-amber-600">{stats.todo}</p>
          </CardContent>
        </Card>
        <Card className={`border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl`} onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress</p>
            <p className="text-2xl sm:text-3xl font-bold font-outfit mt-1 text-blue-600">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card className={`border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl`} onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-2xl sm:text-3xl font-bold font-outfit mt-1 text-emerald-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className={`border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl`} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
          <CardContent className="p-3 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
            <p className="text-2xl sm:text-3xl font-bold font-outfit mt-1 text-red-600">{stats.overdue}</p>
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
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Assigned To" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              className={viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-500'}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-2" /> List View
            </Button>
            <Button
              variant="ghost"
              className={viewMode === 'board' ? 'bg-slate-100 text-slate-700' : 'text-slate-500'}
              onClick={() => setViewMode('board')}
            >
              <LayoutGrid className="h-4 w-4 mr-2" /> Board View
            </Button>
          </div>
        </div>
      </motion.div>
      {/* Task Cards Grid - Responsive with consistent card sizing */}
      <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        {viewMode === 'list' ? (
          <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4 text-left">Task</th>
                    <th className="p-4 text-left">Client</th>
                    <th className="p-4 text-left">Priority</th>
                    <th className="p-4 text-left">Status</th>
                    <th className="p-4 text-left">Task Update</th>
                    <th className="p-4 text-left">Assigned To</th>
                    <th className="p-4 text-left">Assigned By</th>
                    <th className="p-4 text-left">DOA</th>
                    <th className="p-4 text-left">Due Date</th>
                    <th className="p-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => {
                    const taskIsOverdue = isOverdue(task);
                    const displayStatus = getDisplayStatus(task);
                    const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
                    const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                    return (
                      <tr
  key={task.id}
  className={`border-t border-slate-100 hover:bg-slate-50 transition
    ${getStripeClass(task, taskIsOverdue)}
  `}
>
                        <td className="p-4">{task.title}</td>
                        <td className="p-4">{getClientName(task.client_id)}</td>
                        <td className="p-4">
                          <Badge className={`${priorityStyle.bg} ${priorityStyle.text}`}>{priorityStyle.label}</Badge>
                        </td>
                        <td className="p-4">
                          <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>{statusStyle.label}</Badge>
                        </td>
                        <td className="p-4">
                          <Select value={task.status} onValueChange={(value) => handleQuickStatusChange(task, value)}>
                            <SelectTrigger className={`w-32 ${displayStatus === 'overdue' ? 'bg-red-100 text-red-700' : displayStatus === 'pending' ? 'bg-amber-100 text-amber-700' : displayStatus === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">To Do</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-4">{getUserName(task.assigned_to)}</td>
                        <td className="p-4">{getUserName(task.created_by)}</td>
                        <td className="p-4">{task.created_at ? format(new Date(task.created_at), 'MMM dd') : '-'}</td>
                        <td className="p-4">{task.due_date ? format(new Date(task.due_date), 'MMM dd') : '-'}</td>
                        <td className="p-4 flex gap-2">
                          {canEditTasks && task.created_by === user?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
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
                              onClick={() => handleDelete(task.id)}
                              data-testid={`delete-task-${task.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="block sm:hidden space-y-3 p-4">
              {filteredTasks.map((task) => {
                const taskIsOverdue = isOverdue(task);
                const displayStatus = getDisplayStatus(task);
                const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
                const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                return (
                  <Card
  key={task.id}
  className={`rounded-2xl border border-slate-100 shadow-sm
    bg-white
    ${getStripeClass(task, taskIsOverdue)}
  `}
>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-base">{task.title}</h3>
                      <div className="text-xs font-bold">{`Assigned to: ${getUserName(task.assigned_to)} | Assigned by: ${getUserName(task.created_by)} | DOA: ${task.created_at ? format(new Date(task.created_at), 'MMM dd') : '-'}`}</div>
                      <p className="text-sm text-slate-600 line-clamp-2">{task.description || 'No description'}</p>
                      <div className="flex gap-2">
                        <Badge className={`${priorityStyle.bg} ${priorityStyle.text}`}>{priorityStyle.label}</Badge>
                        <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>{statusStyle.label}</Badge>
                      </div>
                      <Select value={task.status} onValueChange={(value) => handleQuickStatusChange(task, value)}>
                        <SelectTrigger className={`w-32 ${displayStatus === 'overdue' ? 'bg-red-100 text-red-700' : displayStatus === 'pending' ? 'bg-amber-100 text-amber-700' : displayStatus === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">To Do</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Done</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-slate-500">Due: {task.due_date ? format(new Date(task.due_date), 'MMM dd') : '-'}</div>
                      <div className="text-xs text-slate-500">Client: {getClientName(task.client_id)}</div>
                      <div className="flex gap-2 pt-2 border-t border-slate-200">
                        {canEditTasks && task.created_by === user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(task)}
                          >
                            <Edit className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        {canDeleteTasks && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(task.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            {filteredTasks.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-500 text-lg">No tasks found</p>
                <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or create a new task</p>
              </div>
            )}
          </Card>
        ) : (
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6"
            variants={containerVariants}
          >
            {[
              { status: 'pending', title: 'To Do', count: stats.todo },
              { status: 'in_progress', title: 'In Progress', count: stats.inProgress },
              { status: 'completed', title: 'Completed', count: stats.completed },
            ].map((col) => (
              <motion.div key={col.status} variants={itemVariants} className="space-y-4">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-800 flex items-center gap-2">
                  {col.title}
                  <Badge className="bg-slate-200 text-slate-600">{col.count}</Badge>
                </h2>
                <div className="space-y-4 min-h-[200px]">
                  {filteredTasks.filter((t) => t.status === col.status || (col.status === 'pending' && isOverdue(t))).map((task) => {
                    const taskIsOverdue = isOverdue(task);
                    const displayStatus = getDisplayStatus(task);
                    const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
                    const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                    return (
                      <motion.div key={task.id} variants={itemVariants} className="h-full">
                        <Card
  className={`bg-white border border-slate-100 shadow-sm
    hover:shadow-md transition-all duration-200
    overflow-hidden group h-full rounded-2xl
    ${getStripeClass(task, taskIsOverdue)}
  `}
                          data-testid={`task-card-${task.id}`}
                        >
                          <CardContent className="p-4 flex flex-col h-full">
                            {/* Status & Priority Tags */}
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <Badge
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}
                              >
                                {statusStyle.label}
                              </Badge>
                              <Badge
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${priorityStyle.bg} ${priorityStyle.text}`}
                              >
                                {priorityStyle.label}
                              </Badge>
                              {task.is_recurring && (
                                <Badge className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                                  <Repeat className="h-3 w-3 inline mr-1" />
                                  Recurring
                                </Badge>
                              )}
                              {task.created_by === user?.id && (
                                <Badge className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                  Assigned By You
                                </Badge>
                              )}
                            </div>
                            {/* Task Title - Fixed height */}
                            <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2 min-h-[40px] text-sm" style={{ color: COLORS.deepBlue }}>
                              {task.title}
                            </h3>
                            <div className="text-xs font-bold">{`Assigned to: ${getUserName(task.assigned_to)} | Assigned by: ${getUserName(task.created_by)} | DOA: ${task.created_at ? format(new Date(task.created_at), 'MMM dd, yyyy') : 'N/A'}`}</div>
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
                                    ${task.status === 'pending' ? (task.priority === 'high' || task.priority === 'critical' ? 'bg-orange-100 text-orange-700 shadow-md' : 'bg-amber-100 text-amber-700 shadow-md') : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'}`}
                                  title="Mark as To Do"
                                  data-testid={`status-todo-${task.id}`}
                                >
                                  <Circle className="h-3.5 w-3.5" />
                                  <span>To Do</span>
                                </button>
                                <button
                                  onClick={() => handleQuickStatusChange(task, 'in_progress')}
                                  className={`flex items-center justify-center gap-1.5 h-8 rounded-full text-xs font-semibold transition-all
                                    ${task.status === 'in_progress' ? 'bg-purple-100 text-purple-700 shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-purple-100 hover:text-purple-700'}`}
                                  title="Mark as In Progress"
                                  data-testid={`status-progress-${task.id}`}
                                >
                                  <ArrowRight className="h-3.5 w-3.5" />
                                  <span>Progress</span>
                                </button>
                                <button
                                  onClick={() => handleQuickStatusChange(task, 'completed')}
                                  className={`flex items-center justify-center gap-1.5 h-8 rounded-full text-xs font-semibold transition-all
                                    ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700 shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700'}`}
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
                  })}
                </div>
              </motion.div>
            ))}
            {filteredTasks.length === 0 && (
              <motion.div variants={itemVariants} className="col-span-full text-center py-12">
                <p className="text-slate-500 text-lg">No tasks found</p>
                <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or create a new task</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleCsvUpload}
      />
    </motion.div>
  );
}
