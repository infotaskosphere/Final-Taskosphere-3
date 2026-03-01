import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from "react-router-dom";
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
import { Plus, Edit, Trash2, Search, Calendar, Building2, User, LayoutGrid, List, Filter, Circle, ArrowRight, Check, Repeat, MessageSquare, Bell, FileText, Calendar as CalendarIcon } from 'lucide-react';
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

// Predefined task categories
const TASK_CATEGORIES = DEPARTMENTS;

// Recurrence pattern options
const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// ==================== ENHANCED: CA/CS COMPLIANCE WORKFLOW TEMPLATES (14 Rich Templates) ====================
const COMPLIANCE_WORKFLOWS = [
  {
    id: 1,
    name: "Monthly GST Compliance",
    category: "gst",
    title: "Monthly GST Filing - GSTR-1 & GSTR-3B",
    description: "- Reconcile GSTR-2B with purchase register\n- Prepare GSTR-1 (B2B/B2C/CDNR)\n- File GSTR-3B\n- Pay tax & generate challan\n- Reconcile ITC\n- Review for notices\n- Update books of accounts\n- Check HSN/SAC codes",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 5,
    estimatedHours: 18,
    frequency: "Monthly"
  },
  {
    id: 2,
    name: "Quarterly TDS Compliance",
    category: "tds",
    title: "Quarterly TDS Return - 24Q/26Q/27Q",
    description: "- Download Form 16A/27D from TRACES\n- Reconcile TDS with books\n- Prepare & file quarterly return\n- Generate TDS certificates\n- Pay TDS before due date\n- Update challan status\n- Check late fee/interest",
    recurrence_pattern: "monthly",
    recurrence_interval: 3,
    priority: "high",
    estimatedDays: 7,
    estimatedHours: 22,
    frequency: "Quarterly"
  },
  {
    id: 3,
    name: "ROC Annual Filing (Private Ltd)",
    category: "roc",
    title: "Annual ROC Filing - AOC-4 & MGT-7",
    description: "- Prepare financial statements\n- File AOC-4 XBRL\n- File MGT-7\n- File MGT-8 (if applicable)\n- Board & AGM minutes\n- DIR-12 for director changes\n- Check DIN status\n- Update registers",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 15,
    estimatedHours: 45,
    frequency: "Annual"
  },
  {
    id: 4,
    name: "Income Tax Return (Company)",
    category: "income_tax",
    title: "ITR-6 Filing + Tax Audit (if applicable)",
    description: "- Reconcile 26AS & AIS\n- Prepare ITR-6\n- File Tax Audit Report (3CD)\n- Pay advance tax / self assessment tax\n- Check Form 3CA/3CB\n- Upload balance sheet\n- Claim deductions u/s 10AA/80\n- MAT calculation",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 20,
    estimatedHours: 55,
    frequency: "Annual"
  },
  {
    id: 5,
    name: "DSC Renewal & PAN TAN",
    category: "dsc",
    title: "DSC Renewal + PAN/TAN Compliance",
    description: "- Check DSC expiry (30 days prior)\n- Renew Class 3 DSC\n- Update PAN/TAN details\n- Link Aadhaar with PAN\n- Update DSC in MCA & GST portal\n- Verify e-filing credentials",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "medium",
    estimatedDays: 3,
    estimatedHours: 8,
    frequency: "Annual"
  },
  {
    id: 6,
    name: "MSME Samadhan Filing",
    category: "msme_smadhan",
    title: "MSME Delayed Payment Complaint",
    description: "- Identify delayed payments >45 days\n- File Udyam Samadhan application\n- Follow up with buyer\n- Generate reference number\n- Monitor status on portal\n- Prepare supporting documents",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "medium",
    estimatedDays: 4,
    estimatedHours: 12,
    frequency: "Monthly"
  },
  {
    id: 7,
    name: "FEMA Annual Return",
    category: "fema",
    title: "FC-GPR / FLA / Annual FEMA Return",
    description: "- Collect foreign investment details\n- File FLA return on RBI portal\n- File FC-GPR for fresh allotment\n- File FC-TRS for transfer\n- Maintain LOU/LOC records\n- Check ECB compliance",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 10,
    estimatedHours: 30,
    frequency: "Annual"
  },
  {
    id: 8,
    name: "Trademark Renewal",
    category: "trademark",
    title: "Trademark Renewal & Monitoring",
    description: "- Check renewal due date (6 months prior)\n- File TM-R application\n- Pay renewal fee\n- Monitor opposition period\n- File TM-M for modification\n- Update trademark register",
    recurrence_pattern: "yearly",
    recurrence_interval: 10,
    priority: "medium",
    estimatedDays: 5,
    estimatedHours: 15,
    frequency: "Every 10 Years"
  },
  {
    id: 9,
    name: "GSTR-9 Annual Reconciliation",
    category: "gst",
    title: "Annual GST Return - GSTR-9 & GSTR-9C",
    description: "- Reconcile GSTR-1, 3B & 2B\n- Prepare GSTR-9\n- Audit GSTR-9C (if turnover >5Cr)\n- Reconcile ITC & output tax\n- File before 31st Dec",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 12,
    estimatedHours: 35,
    frequency: "Annual"
  },
  {
    id: 10,
    name: "PF & ESIC Monthly",
    category: "accounts",
    title: "Monthly PF & ESIC Contribution & Return",
    description: "- Calculate PF & ESIC on salary\n- Deposit contribution by 15th\n- File ECR return\n- Reconcile challan\n- Generate Form 3A/6A",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 3,
    estimatedHours: 10,
    frequency: "Monthly"
  },
  {
    id: 11,
    name: "Board Meeting Compliance",
    category: "roc",
    title: "Quarterly Board Meeting & Minutes",
    description: "- Schedule board meeting\n- Prepare agenda & notes\n- Record minutes in MBP-1\n- File MGT-14 for resolutions\n- Update registers",
    recurrence_pattern: "monthly",
    recurrence_interval: 3,
    priority: "medium",
    estimatedDays: 4,
    estimatedHours: 14,
    frequency: "Quarterly"
  },
  {
    id: 12,
    name: "Income Tax TDS/TCS Quarterly",
    category: "tds",
    title: "TDS/TCS Quarterly Return & Certificates",
    description: "- File 26Q/27Q/27EQ\n- Issue Form 16/16A\n- Reconcile with 26AS\n- Pay late fee if any",
    recurrence_pattern: "monthly",
    recurrence_interval: 3,
    priority: "high",
    estimatedDays: 6,
    estimatedHours: 20,
    frequency: "Quarterly"
  },
  {
    id: 13,
    name: "Company Secretarial Annual",
    category: "roc",
    title: "Annual Secretarial Compliance Package",
    description: "- AGM Notice & Minutes\n- File AOC-4, MGT-7\n- DIR-3 KYC\n- DPT-3 if applicable\n- MBP-1, MBP-2 update",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 18,
    estimatedHours: 50,
    frequency: "Annual"
  },
  {
    id: 14,
    name: "GST Annual Audit (if applicable)",
    category: "gst",
    title: "GST Audit u/s 35(5) + GSTR-9C",
    description: "- Reconcile books with GST returns\n- Prepare reconciliation statement\n- File GSTR-9C\n- Issue audit report",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 25,
    estimatedHours: 60,
    frequency: "Annual"
  },
];

// CLASSIC CORPORATE STATUS STYLES (To Do = Red, In Progress = Orange, Completed = Blue)
const STATUS_STYLES = {
  pending: { bg: 'bg-red-50', text: 'text-red-700', label: 'To Do' },
  in_progress: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'In Progress' },
  completed: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Completed' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
};
// Priority colors (kept professional)
const PRIORITY_STYLES = {
  low: { bg: 'bg-green-50', text: 'text-green-600', label: 'LOW' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'MEDIUM' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'HIGH' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', label: 'CRITICAL' },
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
// STRIPE COLOR LOGIC - matches new corporate status colours
const getStripeBg = (task, isOverdue) => {
  const s = (task.status || '').toLowerCase().trim();
  if (isOverdue) return 'bg-red-700';
  if (s === 'completed') return 'bg-blue-700';
  if (s === 'in_progress') return 'bg-orange-600';
  if (s === 'pending') return 'bg-red-600';
 
  const p = (task.priority || '').toLowerCase().trim();
  if (p === 'critical') return 'bg-red-700';
  if (p === 'high') return 'bg-orange-600';
  if (p === 'medium') return 'bg-amber-500';
  if (p === 'low') return 'bg-emerald-600';
  return 'bg-slate-400';
};
const DashboardStripCard = ({
  stripeColor,
  children,
  isCompleted = false,
  className = "",
}) => {
  return (
    <div
      className={`relative rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-sm
        transition-all duration-200 overflow-hidden group
        ${isCompleted ? "opacity-80" : "hover:shadow-md hover:-translate-y-[1px]"}
        ${className}`}
    >
      <div
        className={`absolute left-0 top-0 h-full w-[6px] rounded-l-2xl ${stripeColor}`}
      />
      <div className={`pl-6 pr-6 ${isCompleted ? "py-3" : "py-5"}`}>
        {children}
      </div>
    </div>
  );
};
export default function Tasks() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "admin";
  const canModifyTask = (task) => {
    if (isAdmin) return true;
    return (
      hasPermission("can_edit_tasks") &&
      (
        task.assigned_to === user?.id ||
        task.sub_assignees?.includes(user?.id) ||
        task.created_by === user?.id
      )
    );
  };
  const canAssignTasks = hasPermission("can_assign_tasks");
  const canEditTasks = hasPermission("can_edit_tasks");
  const canDeleteTasks = isAdmin || hasPermission("can_delete_data");
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [comments, setComments] = useState({});
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [openCommentTaskId, setOpenCommentTaskId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
 
  const location = useLocation();
  const filter = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("filter");
  }, [location.search]);
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

  // NEW FRONTEND FEATURES FROM PREVIOUS UPDATE
  const [sortBy, setSortBy] = useState('due_date');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);

  // ==================== ENHANCED CA/CS COMPLIANCE WORKFLOW FEATURES ====================
  const [showWorkflowLibrary, setShowWorkflowLibrary] = useState(false);
  const [taskChecklists, setTaskChecklists] = useState({}); // local checklist state per task id
  const [workflowSearch, setWorkflowSearch] = useState('');
  const [workflowDeptFilter, setWorkflowDeptFilter] = useState('all');
  const [workflowFrequencyFilter, setWorkflowFrequencyFilter] = useState('all');

  const filteredWorkflows = COMPLIANCE_WORKFLOWS.filter(wf => {
    const matchesSearch = wf.name.toLowerCase().includes(workflowSearch.toLowerCase()) ||
                         wf.title.toLowerCase().includes(workflowSearch.toLowerCase());
    const matchesDept = workflowDeptFilter === 'all' || wf.category === workflowDeptFilter;
    const matchesFreq = workflowFrequencyFilter === 'all' || wf.frequency.toLowerCase().includes(workflowFrequencyFilter.toLowerCase());
    return matchesSearch && matchesDept && matchesFreq;
  });

  const applyComplianceWorkflow = (workflow) => {
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + workflow.estimatedDays);

    setFormData({
      title: workflow.title,
      description: workflow.description,
      assigned_to: 'unassigned',
      sub_assignees: [],
      due_date: format(dueDate, 'yyyy-MM-dd'),
      priority: workflow.priority,
      status: 'pending',
      category: workflow.category,
      client_id: '',
      is_recurring: true,
      recurrence_pattern: workflow.recurrence_pattern,
      recurrence_interval: workflow.recurrence_interval,
    });
    setShowWorkflowLibrary(false);
    setDialogOpen(true);
    setWorkflowSearch('');
    setWorkflowDeptFilter('all');
    setWorkflowFrequencyFilter('all');
    toast.success(`✅ Loaded ${workflow.name} template (${workflow.estimatedHours} hrs)`);
  };

  // Parse description into checklist items (frontend only)
  const parseChecklist = (description) => {
    if (!description) return [];
    return description
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•'))
      .map(line => line.replace(/^[-•]\s*/, '').trim());
  };

  const toggleChecklistItem = (taskId, index) => {
    setTaskChecklists(prev => {
      const current = prev[taskId] || [];
      const newChecked = [...current];
      if (newChecked.includes(index)) {
        newChecked.splice(newChecked.indexOf(index), 1);
      } else {
        newChecked.push(index);
      }
      return { ...prev, [taskId]: newChecked };
    });
  };

  const getChecklistProgress = (task) => {
    const checklistItems = parseChecklist(task.description);
    if (checklistItems.length === 0) return 0;
    const checked = taskChecklists[task.id] || [];
    return Math.round((checked.length / checklistItems.length) * 100);
  };

  useEffect(() => {
    fetchTasks();
    fetchClients();
    if (canAssignTasks) {
      fetchUsers();
    }
    fetchUsers();
    fetchNotifications();
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
  const fetchComments = async (taskId) => {
    try {
      const response = await api.get(`/tasks/${taskId}/comments`);
      setComments(prev => ({...prev, [taskId]: response.data}));
    } catch (error) {
      toast.error('Failed to fetch comments');
    }
  };
  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Failed to fetch notifications');
    }
  };
  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark notifications as read');
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
      fetchNotifications();
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
      toast.success(`Task marked as ${STATUS_STYLES[newStatus]?.label || newStatus}!`);
      fetchTasks();
      fetchNotifications();
    } catch (error) {
      toast.error('Failed to update task status');
    }
  };
  const handleShowComments = (task) => {
    setSelectedTask(task);
    fetchComments(task.id);
    setShowCommentsDialog(true);
  };
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${selectedTask.id}/comments`, { text: newComment });
      setNewComment('');
      fetchComments(selectedTask.id);
      toast.success('Comment added!');
      fetchNotifications();
    } catch (error) {
      toast.error('Failed to add comment');
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

  // NEW FRONTEND-ONLY FEATURES (from previous update)
  const displayTasks = React.useMemo(() => {
    let result = [...filteredTasks];

    if (showMyTasksOnly && user?.id) {
      result = result.filter(task =>
        task.assigned_to === user.id ||
        (task.sub_assignees && task.sub_assignees.includes(user.id)) ||
        task.created_by === user.id
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'due_date':
          const dateA = a.due_date ? new Date(a.due_date) : new Date(8640000000000000);
          const dateB = b.due_date ? new Date(b.due_date) : new Date(8640000000000000);
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'priority':
          const prioOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          comparison = (prioOrder[b.priority] || 0) - (prioOrder[a.priority] || 0);
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [filteredTasks, showMyTasksOnly, sortBy, sortDirection, user]);

  const getRelativeDueDate = (dueDate) => {
    if (!dueDate) return '';
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

    if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays}d`;
    return format(due, 'MMM dd');
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterCategory('all');
    setFilterAssignee('all');
    setShowMyTasksOnly(false);
    setSortBy('due_date');
    setSortDirection('asc');
    toast.success('All filters cleared');
  };

  const updateActiveFilters = () => {
    const pills = [];
    if (searchQuery) pills.push({ key: 'search', label: `Search: ${searchQuery}` });
    if (filterStatus !== 'all') pills.push({ key: 'status', label: `Status: ${filterStatus}` });
    if (filterPriority !== 'all') pills.push({ key: 'priority', label: `Priority: ${filterPriority}` });
    if (filterCategory !== 'all') pills.push({ key: 'category', label: `Dept: ${getCategoryLabel(filterCategory)}` });
    if (filterAssignee !== 'all') {
      const assigneeName = users.find(u => u.id === filterAssignee)?.full_name || filterAssignee;
      pills.push({ key: 'assignee', label: `Assigned: ${assigneeName}` });
    }
    if (showMyTasksOnly) pills.push({ key: 'mytasks', label: 'My Tasks Only' });
    setActiveFilters(pills);
  };

  useEffect(() => {
    updateActiveFilters();
  }, [searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, showMyTasksOnly]);

  const removeFilter = (key) => {
    if (key === 'search') setSearchQuery('');
    if (key === 'status') setFilterStatus('all');
    if (key === 'priority') setFilterPriority('all');
    if (key === 'category') setFilterCategory('all');
    if (key === 'assignee') setFilterAssignee('all');
    if (key === 'mytasks') setShowMyTasksOnly(false);
  };

  const handleDuplicateTask = async (task) => {
    try {
      const duplicateData = {
        title: `${task.title} (Copy)`,
        description: task.description || '',
        assigned_to: task.assigned_to,
        sub_assignees: task.sub_assignees || [],
        due_date: task.due_date,
        priority: task.priority,
        status: 'pending',
        category: task.category || 'other',
        client_id: task.client_id,
        is_recurring: task.is_recurring || false,
        recurrence_pattern: task.recurrence_pattern || 'monthly',
        recurrence_interval: task.recurrence_interval || 1,
      };
      await api.post('/tasks', duplicateData);
      toast.success('Task duplicated successfully!');
      fetchTasks();
    } catch (error) {
      toast.error('Failed to duplicate task');
    }
  };

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
  const unreadCount = notifications.filter(n => !n.read).length;
  return (
    <motion.div
      className="space-y-6 bg-slate-50 p-6 rounded-3xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <Card className="border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600" />
        <CardContent className="p-6 flex justify-between items-center">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.deepBlue }}>Task Management</h1>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={handleCsvUploadClick}>Upload CSV</Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>Export PDF</Button>

            {/* ENHANCED: Compliance Workflows Button */}
            {canEditTasks && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWorkflowLibrary(true)}
                className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <FileText className="h-4 w-4" />
                CA/CS Templates
              </Button>
            )}
           
            {/* Notifications Bell - ENHANCED STYLING */}
            <Popover open={showNotifications} onOpenChange={setShowNotifications}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative h-9 w-9 p-0 hover:bg-slate-100 transition-all active:scale-95">
                  <Bell className="h-4 w-4 text-slate-700" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] bg-red-500 text-white rounded-full font-medium shadow-sm">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden" align="end">
                {/* Enhanced Header */}
                <div className="flex items-center justify-between bg-slate-50 px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-2xl bg-blue-100 flex items-center justify-center">
                      <Bell className="h-4 w-4 text-blue-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 tracking-tight">Notifications</h3>
                      <p className="text-xs text-slate-500 -mt-0.5">Stay updated</p>
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={markAllAsRead}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-2xl transition-all"
                    >
                      Mark all read
                    </Button>
                  )}
                </div>
                {/* Notifications List */}
                <div className="max-h-[380px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    /* Polished Empty State */
                    <div className="px-8 py-14 text-center">
                      <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-5">
                        <Bell className="h-8 w-8 text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-700">All caught up!</p>
                      <p className="text-sm text-slate-500 mt-1">No new notifications</p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const isUnread = !notif.read;
                      const iconColor = {
                        comment: 'bg-indigo-100 text-indigo-600',
                        assignment: 'bg-emerald-100 text-emerald-600',
                        due_soon: 'bg-amber-100 text-amber-600',
                        status: 'bg-blue-100 text-blue-600',
                      }[notif.type] || 'bg-slate-100 text-slate-600';
                      return (
                        <div
                          key={notif.id}
                          className={`group relative px-6 py-4 border-b border-slate-100 last:border-0 transition-all hover:bg-slate-50 ${isUnread ? 'bg-blue-50/40' : ''}`}
                        >
                          {/* Unread dot indicator */}
                          {isUnread && (
                            <div className="absolute left-4 top-6 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-blue-100" />
                          )}
                          <div className="flex gap-4">
                            {/* Icon in colored circle */}
                            <div className={`w-9 h-9 rounded-2xl flex-shrink-0 flex items-center justify-center ${iconColor} transition-all group-hover:scale-105`}>
                              {notif.type === 'comment' && <MessageSquare className="h-4 w-4" />}
                              {notif.type === 'assignment' && <User className="h-4 w-4" />}
                              {notif.type === 'due_soon' && <Calendar className="h-4 w-4" />}
                              {(!notif.type || notif.type === 'status') && <Check className="h-4 w-4" />}
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-tight ${isUnread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                                {notif.message}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-2 tracking-wide">
                                {format(new Date(notif.created_at), 'MMM dd, hh:mm a')}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {canEditTasks && (
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="h-9 px-4 text-sm font-medium rounded-2xl shadow-sm hover:shadow-md bg-blue-700 hover:bg-blue-800 text-white"
                  >
                    <Plus className="mr-2 h-5 w-5" />
                    New Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                            <SelectTrigger className="border-slate-300">
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
                              <Button variant="outline" className="w-full justify-between border-slate-300 rounded-2xl">
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
                              className={`h-9 px-4 rounded-2xl text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center
                                ${isSelected
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                              {isSelected && (
                                <div className="h-4 w-4 rounded-full bg-white mr-2" />
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
                          <SelectTrigger className="border-slate-300">
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
                          <SelectTrigger className="border-slate-300">
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
                    <div className="border rounded-2xl p-4 bg-slate-50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Repeat className="h-4 w-4 text-slate-600" />
                          <Label htmlFor="is_recurring" className="font-medium">Recurring Task</Label>
                        </div>
                        <Switch
                          id="is_recurring"
                          checked={formData.is_recurring}
                          onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
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
                        className="rounded-2xl"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="rounded-2xl"
                      >
                        {loading ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl" onClick={() => setFilterStatus('all')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-3xl font-bold font-outfit mt-1" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl" onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">To Do</p>
            <p className="text-3xl font-bold font-outfit mt-1 text-red-600">{stats.todo}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl" onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress</p>
            <p className="text-3xl font-bold font-outfit mt-1 text-orange-600">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl" onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-3xl font-bold font-outfit mt-1 text-blue-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer group rounded-2xl" onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
            <p className="text-3xl font-bold font-outfit mt-1 text-red-700">{stats.overdue}</p>
          </CardContent>
        </Card>
      </motion.div>

{/* Search + Filters + View Toggle */}
<motion.div
  variants={itemVariants}
  className="flex items-center justify-between gap-3 flex-wrap w-full"
>

  {/* LEFT SIDE: Search + Filters */}
  <div className="flex items-center gap-3 flex-wrap">

    {/* Search */}
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <Input
        placeholder="Search tasks..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-10 bg-white rounded-2xl"
      />
    </div>

    {/* Status */}
    <Select value={filterStatus} onValueChange={setFilterStatus}>
      <SelectTrigger className="w-36 bg-white rounded-2xl">
        <SelectValue placeholder="All Statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Statuses</SelectItem>
        <SelectItem value="pending">To Do</SelectItem>
        <SelectItem value="in_progress">In Progress</SelectItem>
        <SelectItem value="completed">Completed</SelectItem>
        <SelectItem value="overdue">Overdue</SelectItem>
      </SelectContent>
    </Select>

    {/* Priority */}
    <Select value={filterPriority} onValueChange={setFilterPriority}>
      <SelectTrigger className="w-36 bg-white rounded-2xl">
        <SelectValue placeholder="All Priorities" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Priorities</SelectItem>
        <SelectItem value="low">Low</SelectItem>
        <SelectItem value="medium">Medium</SelectItem>
        <SelectItem value="high">High</SelectItem>
        <SelectItem value="critical">Critical</SelectItem>
      </SelectContent>
    </Select>

    {/* Category */}
    <Select value={filterCategory} onValueChange={setFilterCategory}>
      <SelectTrigger className="w-36 bg-white rounded-2xl">
        <SelectValue placeholder="All Categories" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Categories</SelectItem>
        {TASK_CATEGORIES.map(cat => (
          <SelectItem key={cat.value} value={cat.value}>
            {cat.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>

    {/* Assignee */}
    <Select value={filterAssignee} onValueChange={setFilterAssignee}>
      <SelectTrigger className="w-36 bg-white rounded-2xl">
        <SelectValue placeholder="All Assignees" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Assignees</SelectItem>
        {users.map(u => (
          <SelectItem key={u.id} value={u.id}>
            {u.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>

  </div>

  {/* RIGHT SIDE: View Toggle */}
  <div className="flex bg-slate-100 p-1 rounded-2xl shadow-sm">
    <Button
      variant="ghost"
      size="sm"
      className={`rounded-xl font-medium ${
        viewMode === 'list'
          ? 'bg-white shadow text-slate-800'
          : 'text-slate-500'
      }`}
      onClick={() => setViewMode('list')}
    >
      <List className="h-4 w-4 mr-1" />
      List
    </Button>

    <Button
      variant="ghost"
      size="sm"
      className={`rounded-xl font-medium ${
        viewMode === 'board'
          ? 'bg-white shadow text-slate-800'
          : 'text-slate-500'
      }`}
      onClick={() => setViewMode('board')}
    >
      <LayoutGrid className="h-4 w-4 mr-1" />
      Board
    </Button>
  </div>

</motion.div>
      {/* Active Filter Pills */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((pill) => (
            <Badge
              key={pill.key}
              variant="secondary"
              className="pl-3 pr-2 py-1 text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              onClick={() => removeFilter(pill.key)}
            >
              {pill.label}
              <span className="text-slate-400 hover:text-slate-600 ml-1">×</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Tasks Container */}
      <div className="overflow-y-auto max-h-[calc(100vh-340px)] pb-8">
        {viewMode === 'list' ? (
          <motion.div className="space-y-3" variants={containerVariants}>
            {displayTasks.map((task, index) => {
              const taskIsOverdue = isOverdue(task);
              const displayStatus = getDisplayStatus({
                ...task,
                status: task.status || "pending",
              });
              const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
              const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
              const checklistItems = parseChecklist(task.description);
              const checkedItems = taskChecklists[task.id] || [];
              const progress = getChecklistProgress(task);
              return (
                <motion.div key={task.id} variants={itemVariants}>
                  <DashboardStripCard stripeColor={getStripeBg(task, taskIsOverdue)} isCompleted={task.status === "completed"}>
                    <div className="flex flex-col gap-4">
                      {/* Top Row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-400 w-6">
                            #{index + 1}
                          </span>
                          <span className={`font-semibold truncate ${
                            task.status === "completed"
                              ? "text-base text-slate-500 line-through"
                              : "text-lg text-slate-900"
                          }`} style={{ color: COLORS.deepBlue }}>
                            {task.title}
                          </span>
                          <Badge className={`px-3 py-1 text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
                            {priorityStyle.label}
                          </Badge>
                          <Badge className={`px-3 py-1 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </Badge>
                          {task.is_recurring && (
                            <Badge className="px-3 py-1 text-xs font-medium bg-purple-100 text-purple-700">Recurring</Badge>
                          )}
                          {/* ENHANCED: Checklist Progress Badge */}
                          {checklistItems.length > 0 && (
                            <Badge className={`px-3 py-1 text-xs font-medium ${progress === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {progress}% Done
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-6 text-sm text-slate-500">
                            {task.client_id && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-4 w-4" />
                                {getClientName(task.client_id)}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              {getUserName(task.assigned_to)}
                            </span>
                            {task.due_date && (
                              <span className={`flex items-center gap-1 ${taskIsOverdue ? 'text-red-600 font-medium' : ''}`}>
                                <Calendar className="h-4 w-4" />
                                {getRelativeDueDate(task.due_date)}
                              </span>
                            )}
                          </div>
                          {canModifyTask(task) && (
                            <button
                              onClick={() => handleEdit(task)}
                              className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 transition"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {canModifyTask(task) && (
                            <button
                              onClick={() => handleDuplicateTask(task)}
                              className="p-2 rounded-xl hover:bg-emerald-50 text-emerald-600 transition"
                              title="Duplicate task"
                            >
                              <Repeat className="h-4 w-4" />
                            </button>
                          )}
                          {canModifyTask(task) && (
                            <button
                              onClick={() =>
                                setOpenCommentTaskId(
                                  openCommentTaskId === task.id ? null : task.id
                                )
                              }
                              className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-600 transition"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                          )}
                          {canDeleteTasks && (
                            <button
                              onClick={() => handleDelete(task.id)}
                              className="p-2 rounded-xl hover:bg-red-50 text-red-600 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ENHANCED: Interactive Checklist for Compliance Workflows */}
                      {checklistItems.length > 0 && (
                        <div className="pl-6 border-l-2 border-emerald-200 bg-emerald-50/50 rounded-xl p-3 text-sm">
                          <div className="font-medium text-emerald-700 mb-2 flex items-center gap-2">
                            <Check className="h-4 w-4" /> Compliance Checklist • {progress}% Complete
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2">
                            {checklistItems.map((item, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <Checkbox
                                  checked={checkedItems.includes(idx)}
                                  onCheckedChange={() => toggleChecklistItem(task.id, idx)}
                                />
                                <span className={checkedItems.includes(idx) ? "line-through text-slate-400" : ""}>
                                  {item}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Classic Corporate Status Tabs */}
                      {(
                        isAdmin ||
                        (
                          canEditTasks &&
                          (
                            task.assigned_to === user?.id ||
                            task.sub_assignees?.includes(user?.id) ||
                            task.created_by === user?.id
                          )
                        )
                      ) && (
                        <div className="flex gap-2 pt-3 border-t border-slate-100">
                          <button
                            onClick={() => handleQuickStatusChange(task, 'pending')}
                            className={`flex-1 h-8 text-xs px-5 font-medium rounded-2xl border transition-all ${
                              task.status === 'pending'
                                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-300'
                            }`}
                          >
                            To Do
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange(task, 'in_progress')}
                            className={`flex-1 h-8 text-xs px-5 font-medium rounded-2xl border transition-all ${
                              task.status === 'in_progress'
                                ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-orange-50 hover:border-orange-300'
                            }`}
                          >
                            In Progress
                          </button>
                          <button
                            onClick={() => handleQuickStatusChange(task, 'completed')}
                            className={`flex-1 h-8 text-xs px-5 font-medium rounded-2xl border transition-all ${
                              task.status === 'completed'
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300'
                            }`}
                          >
                            Completed
                          </button>
                        </div>
                      )}
                      {openCommentTaskId === task.id && (
                        <div className="mt-3 border-t pt-3 space-y-2">
                          <div className="max-h-32 overflow-y-auto text-sm text-slate-600">
                            {(comments[task.id] || []).map((comment, i) => (
                              <div key={i} className="mb-2">
                                <p>{comment.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              placeholder="Add comment..."
                              className="h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedTask(task);
                                handleAddComment();
                              }}
                            >
                              Post
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DashboardStripCard>
                </motion.div>
              );
            })}
            {filteredTasks.length === 0 && (
              <div className="text-center py-12 text-slate-500">No tasks found</div>
            )}
          </motion.div>
        ) : (
          /* Board View */
          <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={containerVariants}>
            {[
              { status: 'pending', title: 'To Do', count: stats.todo },
              { status: 'in_progress', title: 'In Progress', count: stats.inProgress },
              { status: 'completed', title: 'Completed', count: stats.completed },
            ].map((col) => (
              <motion.div key={col.status} variants={itemVariants} className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-3">
                  {col.title}
                  <Badge className="bg-slate-100 text-slate-600">{col.count}</Badge>
                </h2>
                <div className="space-y-4 min-h-[300px]">
                  {displayTasks
                    .filter((t) => t.status === col.status || (col.status === 'pending' && isOverdue(t)))
                    .map((task, index) => {
                      const taskIsOverdue = isOverdue(task);
                      const displayStatus = getDisplayStatus({
                        ...task,
                        status: task.status || "pending",
                      });
                      const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
                      const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                      const checklistItems = parseChecklist(task.description);
                      const checkedItems = taskChecklists[task.id] || [];
                      const progress = getChecklistProgress(task);
                      return (
                        <DashboardStripCard key={task.id} stripeColor={getStripeBg(task, taskIsOverdue)} isCompleted={task.status === "completed"}>
                          <div className="flex flex-col h-full">
                            <div className="flex items-center gap-3 mb-4">
                              <Badge className={`px-3 py-1 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                {statusStyle.label}
                              </Badge>
                              <Badge className={`px-3 py-1 text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
                                {priorityStyle.label}
                              </Badge>
                              {task.is_recurring && (
                                <Badge className="px-3 py-1 text-xs font-medium bg-purple-100 text-purple-700">Recurring</Badge>
                              )}
                              {checklistItems.length > 0 && (
                                <Badge className={`px-3 py-1 text-xs font-medium ${progress === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {progress}%
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs font-bold text-slate-400">
                              #{index + 1}
                            </span>
                            <h3 className="font-semibold text-slate-900 text-lg mb-3 line-clamp-2" style={{ color: COLORS.deepBlue }}>
                              {task.title}
                            </h3>

                            {/* ENHANCED Checklist Preview in Board View */}
                            {checklistItems.length > 0 && (
                              <div className="mb-4 text-xs bg-emerald-50 p-3 rounded-xl max-h-32 overflow-hidden">
                                <div className="font-medium text-emerald-700 mb-1">Checklist • {progress}%</div>
                                {checklistItems.slice(0, 4).map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-emerald-700 truncate">
                                    <Check className="h-3 w-3 flex-shrink-0" /> {item}
                                  </div>
                                ))}
                                {checklistItems.length > 4 && <div className="text-emerald-600 mt-1">+{checklistItems.length - 4} more steps</div>}
                              </div>
                            )}

                            <div className="mt-auto space-y-1 text-xs text-slate-500">
                              {task.client_id && (
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4" />
                                  {getClientName(task.client_id)}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                {getUserName(task.assigned_to)}
                              </div>
                              {task.due_date && (
                                <div className={`flex items-center gap-2 ${taskIsOverdue ? 'text-red-600 font-medium' : ''}`}>
                                  <Calendar className="h-4 w-4" />
                                  {getRelativeDueDate(task.due_date)}
                                </div>
                              )}
                            </div>
                            {canModifyTask(task) && (
                              <button
                                onClick={() => handleEdit(task)}
                                className="mt-4 w-full p-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs transition"
                              >
                                Edit Task
                              </button>
                            )}
                            {canModifyTask(task) && (
                              <button
                                onClick={() => handleDuplicateTask(task)}
                                className="mt-3 w-full p-2 rounded-xl border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs transition"
                              >
                                Duplicate Task
                              </button>
                            )}
                            {canModifyTask(task) && (
                              <button
                                onClick={() =>
                                  setOpenCommentTaskId(
                                    openCommentTaskId === task.id ? null : task.id
                                  )
                                }
                                className="mt-4 w-full p-2 rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-xs transition"
                              >
                                Comments
                              </button>
                            )}
                            {canDeleteTasks && (
                              <button
                                onClick={() => handleDelete(task.id)}
                                className="mt-4 w-full p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs transition"
                              >
                                Delete Task
                              </button>
                            )}
                            {/* Corporate Status Tabs in Board View */}
                            {(canEditTasks && (
                              task.assigned_to === user?.id ||
                              task.sub_assignees?.includes(user?.id) ||
                              task.created_by === user?.id
                            )) && (
                              <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-100">
                                <button
                                  onClick={() => handleQuickStatusChange(task, 'pending')}
                                  className={`h-8 text-xs font-medium rounded-2xl border transition-all ${task.status === 'pending'
                                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-300'
                                  }`}
                                >
                                  To Do
                                </button>
                                <button
                                  onClick={() => handleQuickStatusChange(task, 'in_progress')}
                                  className={`h-8 text-xs font-medium rounded-2xl border transition-all ${task.status === 'in_progress'
                                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-orange-50 hover:border-orange-300'
                                  }`}
                                >
                                  Progress
                                </button>
                                <button
                                  onClick={() => handleQuickStatusChange(task, 'completed')}
                                  className={`h-8 text-xs font-medium rounded-2xl border transition-all ${task.status === 'completed'
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300'
                                  }`}
                                >
                                  Completed
                                </button>
                              </div>
                            )}
                            {openCommentTaskId === task.id && (
                              <div className="mt-3 border-t pt-3 space-y-2">
                                <div className="max-h-32 overflow-y-auto text-sm text-slate-600">
                                  {(comments[task.id] || []).map((comment, i) => (
                                    <div key={i} className="mb-2">
                                      <p>{comment.text}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add comment..."
                                    className="h-8 text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setSelectedTask(task);
                                      handleAddComment();
                                    }}
                                  >
                                    Post
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </DashboardStripCard>
                      );
                    })}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ENHANCED: Compliance Workflow Library Dialog */}
      <Dialog open={showWorkflowLibrary} onOpenChange={setShowWorkflowLibrary}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-3xl font-semibold" style={{ color: COLORS.deepBlue }}>CA/CS Compliance Workflow Library</DialogTitle>
            <DialogDescription className="text-base">
              14 professionally curated statutory workflows for CA/CS practice. Click any template to auto-fill task with checklist, recurrence &amp; priority.
            </DialogDescription>
          </DialogHeader>

          {/* Enhanced Filters */}
          <div className="flex gap-4 sticky top-0 bg-white z-10 py-4 border-b">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search templates..."
                value={workflowSearch}
                onChange={(e) => setWorkflowSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={workflowDeptFilter} onValueChange={setWorkflowDeptFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENTS.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={workflowFrequencyFilter} onValueChange={setWorkflowFrequencyFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Frequencies</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="every 10 years">Every 10 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
            {filteredWorkflows.map((wf) => {
              const previewChecklist = parseChecklist(wf.description).slice(0, 4);
              return (
                <Card
                  key={wf.id}
                  className="hover:border-emerald-500 cursor-pointer transition-all group hover:shadow-xl overflow-hidden"
                  onClick={() => applyComplianceWorkflow(wf)}
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <Badge variant="outline" className="mb-2 text-xs">{getCategoryLabel(wf.category)}</Badge>
                        <h3 className="font-semibold text-xl leading-tight group-hover:text-emerald-700 transition-colors">{wf.name}</h3>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-emerald-100 text-emerald-700">{wf.estimatedHours} hrs</Badge>
                        <p className="text-xs text-slate-500 mt-1">{wf.frequency}</p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2 mb-4">{wf.title}</p>

                    {/* Checklist Preview */}
                    <div className="text-xs bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
                      <div className="font-medium text-emerald-700 mb-2 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Key Steps
                      </div>
                      <ul className="space-y-1 text-slate-600">
                        {previewChecklist.map((step, i) => (
                          <li key={i} className="flex gap-2">• {step}</li>
                        ))}
                        {parseChecklist(wf.description).length > 4 && (
                          <li className="text-emerald-600">+{parseChecklist(wf.description).length - 4} more steps</li>
                        )}
                      </ul>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-emerald-600">
                        <CalendarIcon className="h-4 w-4" />
                        Due in {wf.estimatedDays} days
                      </div>
                      <span className="font-medium text-emerald-700 group-hover:underline flex items-center gap-1">
                        Use Template <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredWorkflows.length === 0 && (
            <div className="text-center py-20 text-slate-400">No matching templates found</div>
          )}

          <p className="text-center text-xs text-slate-400 mt-2">All templates are 100% frontend-powered • Zero backend changes required</p>
        </DialogContent>
      </Dialog>

      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleCsvUpload}
      />
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comments for {selectedTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(comments[selectedTask?.id] || []).map((comment, index) => (
              <div key={index} className="border-b pb-2">
                <p>{comment.text}</p>
                <small>By {getUserName(comment.user_id)} on {format(new Date(comment.created_at), 'MMM dd, yyyy hh:mm a')}</small>
              </div>
            ))}
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
            />
            <Button onClick={handleAddComment}>Post Comment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
