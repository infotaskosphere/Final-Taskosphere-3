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
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User,
  LayoutGrid, List, Filter, Circle, ArrowRight, Check, Repeat,
  MessageSquare, Bell, FileText, Calendar as CalendarIcon,
  ChevronDown, X, SortAsc, SortDesc, Copy, Clock, AlertTriangle,
  CheckCircle2, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── Brand Colors ────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

// ─── Departments ─────────────────────────────────────────────────────────────
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

// ─── Compliance Workflow Templates ───────────────────────────────────────────
const COMPLIANCE_WORKFLOWS = [
  { id: 1, name: "Monthly GST Compliance", category: "gst", title: "Monthly GST Filing - GSTR-1 & GSTR-3B", description: "- Reconcile GSTR-2B with purchase register\n- Prepare GSTR-1 (B2B/B2C/CDNR)\n- File GSTR-3B\n- Pay tax & generate challan\n- Reconcile ITC\n- Review for notices\n- Update books of accounts\n- Check HSN/SAC codes", recurrence_pattern: "monthly", recurrence_interval: 1, priority: "high", estimatedDays: 5, estimatedHours: 18, frequency: "Monthly" },
  { id: 2, name: "Quarterly TDS Compliance", category: "tds", title: "Quarterly TDS Return - 24Q/26Q/27Q", description: "- Download Form 16A/27D from TRACES\n- Reconcile TDS with books\n- Prepare & file quarterly return\n- Generate TDS certificates\n- Pay TDS before due date\n- Update challan status\n- Check late fee/interest", recurrence_pattern: "monthly", recurrence_interval: 3, priority: "high", estimatedDays: 7, estimatedHours: 22, frequency: "Quarterly" },
  { id: 3, name: "ROC Annual Filing (Private Ltd)", category: "roc", title: "Annual ROC Filing - AOC-4 & MGT-7", description: "- Prepare financial statements\n- File AOC-4 XBRL\n- File MGT-7\n- File MGT-8 (if applicable)\n- Board & AGM minutes\n- DIR-12 for director changes\n- Check DIN status\n- Update registers", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 15, estimatedHours: 45, frequency: "Annual" },
  { id: 4, name: "Income Tax Return (Company)", category: "income_tax", title: "ITR-6 Filing + Tax Audit (if applicable)", description: "- Reconcile 26AS & AIS\n- Prepare ITR-6\n- File Tax Audit Report (3CD)\n- Pay advance tax / self assessment tax\n- Check Form 3CA/3CB\n- Upload balance sheet\n- Claim deductions u/s 10AA/80\n- MAT calculation", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 20, estimatedHours: 55, frequency: "Annual" },
  { id: 5, name: "DSC Renewal & PAN TAN", category: "dsc", title: "DSC Renewal + PAN/TAN Compliance", description: "- Check DSC expiry (30 days prior)\n- Renew Class 3 DSC\n- Update PAN/TAN details\n- Link Aadhaar with PAN\n- Update DSC in MCA & GST portal\n- Verify e-filing credentials", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "medium", estimatedDays: 3, estimatedHours: 8, frequency: "Annual" },
  { id: 6, name: "MSME Samadhan Filing", category: "msme_smadhan", title: "MSME Delayed Payment Complaint", description: "- Identify delayed payments >45 days\n- File Udyam Samadhan application\n- Follow up with buyer\n- Generate reference number\n- Monitor status on portal\n- Prepare supporting documents", recurrence_pattern: "monthly", recurrence_interval: 1, priority: "medium", estimatedDays: 4, estimatedHours: 12, frequency: "Monthly" },
  { id: 7, name: "FEMA Annual Return", category: "fema", title: "FC-GPR / FLA / Annual FEMA Return", description: "- Collect foreign investment details\n- File FLA return on RBI portal\n- File FC-GPR for fresh allotment\n- File FC-TRS for transfer\n- Maintain LOU/LOC records\n- Check ECB compliance", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "high", estimatedDays: 10, estimatedHours: 30, frequency: "Annual" },
  { id: 8, name: "Trademark Renewal", category: "trademark", title: "Trademark Renewal & Monitoring", description: "- Check renewal due date (6 months prior)\n- File TM-R application\n- Pay renewal fee\n- Monitor opposition period\n- File TM-M for modification\n- Update trademark register", recurrence_pattern: "yearly", recurrence_interval: 10, priority: "medium", estimatedDays: 5, estimatedHours: 15, frequency: "Every 10 Years" },
  { id: 9, name: "GSTR-9 Annual Reconciliation", category: "gst", title: "Annual GST Return - GSTR-9 & GSTR-9C", description: "- Reconcile GSTR-1, 3B & 2B\n- Prepare GSTR-9\n- Audit GSTR-9C (if turnover >5Cr)\n- Reconcile ITC & output tax\n- File before 31st Dec", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 12, estimatedHours: 35, frequency: "Annual" },
  { id: 10, name: "PF & ESIC Monthly", category: "accounts", title: "Monthly PF & ESIC Contribution & Return", description: "- Calculate PF & ESIC on salary\n- Deposit contribution by 15th\n- File ECR return\n- Reconcile challan\n- Generate Form 3A/6A", recurrence_pattern: "monthly", recurrence_interval: 1, priority: "high", estimatedDays: 3, estimatedHours: 10, frequency: "Monthly" },
  { id: 11, name: "Board Meeting Compliance", category: "roc", title: "Quarterly Board Meeting & Minutes", description: "- Schedule board meeting\n- Prepare agenda & notes\n- Record minutes in MBP-1\n- File MGT-14 for resolutions\n- Update registers", recurrence_pattern: "monthly", recurrence_interval: 3, priority: "medium", estimatedDays: 4, estimatedHours: 14, frequency: "Quarterly" },
  { id: 12, name: "Income Tax TDS/TCS Quarterly", category: "tds", title: "TDS/TCS Quarterly Return & Certificates", description: "- File 26Q/27Q/27EQ\n- Issue Form 16/16A\n- Reconcile with 26AS\n- Pay late fee if any", recurrence_pattern: "monthly", recurrence_interval: 3, priority: "high", estimatedDays: 6, estimatedHours: 20, frequency: "Quarterly" },
  { id: 13, name: "Company Secretarial Annual", category: "roc", title: "Annual Secretarial Compliance Package", description: "- AGM Notice & Minutes\n- File AOC-4, MGT-7\n- DIR-3 KYC\n- DPT-3 if applicable\n- MBP-1, MBP-2 update", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 18, estimatedHours: 50, frequency: "Annual" },
  { id: 14, name: "GST Annual Audit (if applicable)", category: "gst", title: "GST Audit u/s 35(5) + GSTR-9C", description: "- Reconcile books with GST returns\n- Prepare reconciliation statement\n- File GSTR-9C\n- Issue audit report", recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 25, estimatedHours: 60, frequency: "Annual" },
];

// ─── Status & Priority Config ─────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:     { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500',    label: 'To Do',       icon: Circle },
  in_progress: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500',  label: 'In Progress', icon: Loader2 },
  completed:   { bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200',    dot: 'bg-sky-500',    label: 'Completed',   icon: CheckCircle2 },
  overdue:     { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   dot: 'bg-rose-600',   label: 'Overdue',     icon: AlertTriangle },
};

const PRIORITY_CONFIG = {
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', label: 'LOW' },
  medium:   { bg: 'bg-yellow-50',  text: 'text-yellow-700',  bar: 'bg-yellow-400',  label: 'MED' },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  bar: 'bg-orange-500',  label: 'HIGH' },
  critical: { bg: 'bg-red-50',     text: 'text-red-700',     bar: 'bg-red-600',     label: 'CRIT' },
};

const getStripeColor = (task, overdue) => {
  if (overdue) return 'bg-rose-600';
  const s = (task.status || '').toLowerCase();
  if (s === 'completed')   return 'bg-sky-500';
  if (s === 'in_progress') return 'bg-amber-500';
  if (s === 'pending')     return 'bg-red-500';
  const p = (task.priority || '').toLowerCase();
  if (p === 'critical') return 'bg-red-600';
  if (p === 'high')     return 'bg-orange-500';
  if (p === 'medium')   return 'bg-yellow-400';
  if (p === 'low')      return 'bg-emerald-500';
  return 'bg-slate-300';
};

// ─── Animation Variants ───────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28 } } };
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.045 } } };

// ─── Task Strip Card Component ────────────────────────────────────────────────
const TaskCard = ({ stripeColor, isCompleted = false, className = '', children }) => (
  <div className={`relative rounded-xl border overflow-hidden transition-all duration-200
    ${isCompleted
      ? 'bg-slate-50/70 border-slate-200 opacity-70'
      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:-translate-y-px'
    } ${className}`}
  >
    <div className={`absolute left-0 top-0 h-full w-1.5 ${stripeColor}`} />
    <div className={`pl-5 pr-4 ${isCompleted ? 'py-3' : 'py-4'}`}>
      {children}
    </div>
  </div>
);

// ─── Stat Card Component ──────────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon: Icon, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 min-w-[100px] rounded-xl border px-4 py-3 text-left transition-all duration-200
      ${active ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
  >
    <div className="flex items-center justify-between mb-1">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      {Icon && <Icon className={`h-3.5 w-3.5 ${color}`} />}
    </div>
    <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
  </button>
);

// ═════════════════════════════════════════════════════════════════════════════
export default function Tasks() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canModifyTask = (task) => {
    if (isAdmin) return true;
    return task.assigned_to === user?.id || task.sub_assignees?.includes(user?.id) || task.created_by === user?.id;
  };
  const canAssignTasks  = hasPermission('can_assign_tasks');
  const canEditTasks    = hasPermission('can_edit_tasks');
  const canDeleteTasks  = isAdmin || hasPermission('can_edit_tasks');
  const navigate        = useNavigate();
  const location        = useLocation();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [tasks,               setTasks]               = useState([]);
  const [users,               setUsers]               = useState([]);
  const [clients,             setClients]             = useState([]);
  const [loading,             setLoading]             = useState(false);
  const [dialogOpen,          setDialogOpen]          = useState(false);
  const [editingTask,         setEditingTask]         = useState(null);
  const [viewMode,            setViewMode]            = useState('list');
  const [comments,            setComments]            = useState({});
  const [showCommentsDialog,  setShowCommentsDialog]  = useState(false);
  const [selectedTask,        setSelectedTask]        = useState(null);
  const [newComment,          setNewComment]          = useState('');
  const [openCommentTaskId,   setOpenCommentTaskId]   = useState(null);
  const [notifications,       setNotifications]       = useState([]);
  const [showNotifications,   setShowNotifications]   = useState(false);
  const [searchQuery,         setSearchQuery]         = useState('');
  const [filterStatus,        setFilterStatus]        = useState('all');
  const [filterPriority,      setFilterPriority]      = useState('all');
  const [filterCategory,      setFilterCategory]      = useState('all');
  const [filterAssignee,      setFilterAssignee]      = useState('all');
  const [sortBy,              setSortBy]              = useState('due_date');
  const [sortDirection,       setSortDirection]       = useState('asc');
  const [showMyTasksOnly,     setShowMyTasksOnly]     = useState(false);
  const [activeFilters,       setActiveFilters]       = useState([]);
  const [showWorkflowLibrary, setShowWorkflowLibrary] = useState(false);
  const [taskChecklists,      setTaskChecklists]      = useState({});
  const [workflowSearch,      setWorkflowSearch]      = useState('');
  const [workflowDeptFilter,  setWorkflowDeptFilter]  = useState('all');
  const [workflowFreqFilter,  setWorkflowFreqFilter]  = useState('all');
  const [formData,            setFormData]            = useState({
    title: '', description: '', assigned_to: 'unassigned', sub_assignees: [],
    due_date: '', priority: 'medium', status: 'pending', category: 'other',
    client_id: '', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1,
  });
  const fileInputRef = useRef(null);

  const filter = React.useMemo(() => new URLSearchParams(location.search).get('filter'), [location.search]);

  // ─── Data Fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTasks(); fetchClients(); fetchUsers(); fetchNotifications();
  }, [user]);

  const fetchTasks         = async () => { try { const r = await api.get('/tasks'); setTasks(r.data); } catch { toast.error('Failed to fetch tasks'); } };
  const fetchUsers         = async () => { try { const r = await api.get('/users'); setUsers(r.data); } catch { console.error('Failed to fetch users'); } };
  const fetchClients       = async () => { try { const r = await api.get('/clients'); setClients(r.data); } catch { console.error('Failed to fetch clients'); } };
  const fetchNotifications = async () => { try { const r = await api.get('/notifications'); setNotifications(r.data || []); } catch { console.error('Failed to fetch notifications'); } };
  const fetchComments      = async (taskId) => { try { const r = await api.get(`/tasks/${taskId}/comments`); setComments(prev => ({ ...prev, [taskId]: r.data })); } catch { toast.error('Failed to fetch comments'); } };

  const markAllAsRead = async () => {
    try { await api.post('/notifications/mark-all-read'); setNotifications(prev => prev.map(n => ({ ...n, read: true }))); toast.success('All notifications marked as read'); }
    catch { console.error('Failed to mark notifications as read'); }
  };

  // ─── Form Actions ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({ title: '', description: '', assigned_to: 'unassigned', sub_assignees: [], due_date: '', priority: 'medium', status: 'pending', category: 'other', client_id: '', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1 });
    setEditingTask(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const taskData = { ...formData, assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to, sub_assignees: formData.sub_assignees || [], client_id: formData.client_id || null, due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null };
      if (editingTask) { await api.patch(`/tasks/${editingTask.id}`, taskData); toast.success('Task updated!'); }
      else             { await api.post('/tasks', taskData); toast.success('Task created!'); }
      setDialogOpen(false); resetForm(); fetchTasks(); fetchNotifications();
    } catch { toast.error('Failed to save task'); }
    finally  { setLoading(false); }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({ title: task.title, description: task.description || '', assigned_to: task.assigned_to || 'unassigned', sub_assignees: task.sub_assignees || [], due_date: task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '', priority: task.priority, status: task.status, category: task.category || 'other', client_id: task.client_id || '', is_recurring: task.is_recurring || false, recurrence_pattern: task.recurrence_pattern || 'monthly', recurrence_interval: task.recurrence_interval || 1 });
    setDialogOpen(true);
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try { await api.delete(`/tasks/${taskId}`); toast.success('Task deleted!'); fetchTasks(); }
    catch { toast.error('Failed to delete task'); }
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    try { await api.patch(`/tasks/${task.id}`, { status: newStatus }); toast.success(`Marked as ${STATUS_CONFIG[newStatus]?.label || newStatus}`); fetchTasks(); fetchNotifications(); }
    catch { toast.error('Failed to update status'); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try { await api.post(`/tasks/${selectedTask.id}/comments`, { text: newComment }); setNewComment(''); fetchComments(selectedTask.id); toast.success('Comment added!'); fetchNotifications(); }
    catch { toast.error('Failed to add comment'); }
  };

  const handleDuplicateTask = async (task) => {
    try {
      await api.post('/tasks', { title: `${task.title} (Copy)`, description: task.description || '', assigned_to: task.assigned_to, sub_assignees: task.sub_assignees || [], due_date: task.due_date, priority: task.priority, status: 'pending', category: task.category || 'other', client_id: task.client_id, is_recurring: task.is_recurring || false, recurrence_pattern: task.recurrence_pattern || 'monthly', recurrence_interval: task.recurrence_interval || 1 });
      toast.success('Task duplicated!'); fetchTasks();
    } catch { toast.error('Failed to duplicate task'); }
  };

  const toggleSubAssignee = (userId) => {
    setFormData(prev => ({ ...prev, sub_assignees: prev.sub_assignees.includes(userId) ? prev.sub_assignees.filter(id => id !== userId) : [...prev.sub_assignees, userId] }));
  };

  // ─── Workflow Library ────────────────────────────────────────────────────────
  const filteredWorkflows = COMPLIANCE_WORKFLOWS.filter(wf => {
    const s = wf.name.toLowerCase().includes(workflowSearch.toLowerCase()) || wf.title.toLowerCase().includes(workflowSearch.toLowerCase());
    const d = workflowDeptFilter === 'all' || wf.category === workflowDeptFilter;
    const f = workflowFreqFilter === 'all' || wf.frequency.toLowerCase().includes(workflowFreqFilter.toLowerCase());
    return s && d && f;
  });

  const applyComplianceWorkflow = (workflow) => {
    const due = new Date(); due.setDate(due.getDate() + workflow.estimatedDays);
    setFormData({ title: workflow.title, description: workflow.description, assigned_to: 'unassigned', sub_assignees: [], due_date: format(due, 'yyyy-MM-dd'), priority: workflow.priority, status: 'pending', category: workflow.category, client_id: '', is_recurring: true, recurrence_pattern: workflow.recurrence_pattern, recurrence_interval: workflow.recurrence_interval });
    setShowWorkflowLibrary(false); setDialogOpen(true); setWorkflowSearch(''); setWorkflowDeptFilter('all'); setWorkflowFreqFilter('all');
    toast.success(`✅ Loaded "${workflow.name}" template`);
  };

  // ─── Checklist ────────────────────────────────────────────────────────────────
  const parseChecklist = (desc) => {
    if (!desc) return [];
    return desc.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('•')).map(l => l.replace(/^[-•]\s*/, '').trim());
  };
  const toggleChecklistItem = (taskId, idx) => {
    setTaskChecklists(prev => {
      const cur = prev[taskId] || [], next = [...cur];
      next.includes(idx) ? next.splice(next.indexOf(idx), 1) : next.push(idx);
      return { ...prev, [taskId]: next };
    });
  };
  const getChecklistProgress = (task) => {
    const items = parseChecklist(task.description);
    if (!items.length) return 0;
    return Math.round(((taskChecklists[task.id] || []).length / items.length) * 100);
  };

  // ─── CSV / PDF Export ─────────────────────────────────────────────────────────
  const handleCsvUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    Papa.parse(file, { header: true, complete: async (results) => { try { await api.post('/tasks/bulk', { tasks: results.data }); toast.success('Tasks uploaded!'); fetchTasks(); } catch { toast.error('Failed to upload tasks'); } } });
  };
  const handleExportCsv = () => {
    const csv = Papa.unparse(tasks.map(t => ({ title: t.title, description: t.description, assigned_to: getUserName(t.assigned_to), due_date: t.due_date ? format(new Date(t.due_date), 'yyyy-MM-dd') : '', priority: t.priority, status: t.status, category: t.category, client_id: getClientName(t.client_id) })));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'tasks.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.autoTable({ head: [['Title', 'Client', 'Priority', 'Status', 'Due Date']], body: tasks.map(t => [t.title, getClientName(t.client_id), t.priority.toUpperCase(), t.status.toUpperCase(), t.due_date ? format(new Date(t.due_date), 'MMM dd, yyyy') : '']) });
    doc.save('tasks.pdf');
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const getUserName    = (id) => users.find(u => u.id === id)?.full_name || 'Unassigned';
  const getClientName  = (id) => clients.find(c => c.id === id)?.company_name || '—';
  const getCategoryLabel = (v) => TASK_CATEGORIES.find(c => c.value === v)?.label || v || 'Other';
  const isOverdue = (task) => task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();
  const getDisplayStatus = (task) => isOverdue(task) ? 'overdue' : task.status;

  const getRelativeDue = (dueDate) => {
    if (!dueDate) return '';
    const d = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
    if (d < 0)  return `${Math.abs(d)}d overdue`;
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    if (d <= 7)  return `${d}d left`;
    return format(new Date(dueDate), 'MMM dd');
  };

  // ─── Filtering & Sorting ──────────────────────────────────────────────────────
  const filteredTasks = tasks.filter(t => {
    const ms = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const mst = filterStatus === 'all' || getDisplayStatus(t) === filterStatus;
    const mp  = filterPriority === 'all' || t.priority === filterPriority;
    const mc  = filterCategory === 'all' || t.category === filterCategory;
    const ma  = filterAssignee === 'all' || t.assigned_to === filterAssignee;
    return ms && mst && mp && mc && ma;
  });

  const displayTasks = React.useMemo(() => {
    let r = [...filteredTasks];
    if (showMyTasksOnly && user?.id) r = r.filter(t => t.assigned_to === user.id || t.sub_assignees?.includes(user.id) || t.created_by === user.id);
    r.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'due_date') { const da = a.due_date ? new Date(a.due_date) : new Date(8640000000000000), db = b.due_date ? new Date(b.due_date) : new Date(8640000000000000); cmp = da - db; }
      else if (sortBy === 'priority') { const po = { critical:4, high:3, medium:2, low:1 }; cmp = (po[b.priority]||0) - (po[a.priority]||0); }
      else if (sortBy === 'title')  cmp = a.title.localeCompare(b.title);
      else if (sortBy === 'status') cmp = (a.status||'').localeCompare(b.status||'');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [filteredTasks, showMyTasksOnly, sortBy, sortDirection, user]);

  useEffect(() => {
    const pills = [];
    if (searchQuery) pills.push({ key: 'search', label: `"${searchQuery}"` });
    if (filterStatus !== 'all') pills.push({ key: 'status', label: STATUS_CONFIG[filterStatus]?.label || filterStatus });
    if (filterPriority !== 'all') pills.push({ key: 'priority', label: filterPriority });
    if (filterCategory !== 'all') pills.push({ key: 'category', label: getCategoryLabel(filterCategory) });
    if (filterAssignee !== 'all') pills.push({ key: 'assignee', label: getUserName(filterAssignee) });
    if (showMyTasksOnly) pills.push({ key: 'mytasks', label: 'My Tasks' });
    setActiveFilters(pills);
  }, [searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, showMyTasksOnly]);

  const removeFilter = (key) => {
    if (key === 'search')   setSearchQuery('');
    if (key === 'status')   setFilterStatus('all');
    if (key === 'priority') setFilterPriority('all');
    if (key === 'category') setFilterCategory('all');
    if (key === 'assignee') setFilterAssignee('all');
    if (key === 'mytasks')  setShowMyTasksOnly(false);
  };
  const clearAllFilters = () => { setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all'); setFilterCategory('all'); setFilterAssignee('all'); setShowMyTasksOnly(false); setSortBy('due_date'); setSortDirection('asc'); };

  const stats = {
    total:      tasks.length,
    todo:       tasks.filter(t => t.status === 'pending' && !isOverdue(t)).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed:  tasks.filter(t => t.status === 'completed').length,
    overdue:    tasks.filter(t => isOverdue(t)).length,
  };
  const unreadCount = notifications.filter(n => !n.read).length;

  // ─── Task Form Dialog ─────────────────────────────────────────────────────────
  const TaskFormDialog = () => (
    <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold" style={{ color: COLORS.deepBlue }}>
            {editingTask ? 'Edit Task' : 'New Task'}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {editingTask ? 'Update task details below.' : 'Fill in the details to create a new task.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Task Title <span className="text-red-500">*</span></Label>
            <Input placeholder="Enter task title…" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required className="h-9" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea placeholder="Describe the task, checklist items (start lines with - or •)…" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} className="resize-none text-sm" />
          </div>

          {/* Client + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Client</Label>
              <Select value={formData.client_id || 'no_client'} onValueChange={v => { if (v === '__add_new_client__') navigate('/clients?openAddClient=true&returnTo=tasks'); else setFormData({ ...formData, client_id: v === 'no_client' ? '' : v }); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No Client" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="no_client">No Client</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                  <SelectItem value="__add_new_client__" className="text-blue-600 font-medium">+ Add New Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Due Date</Label>
              <Input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} className="h-9 text-sm" />
            </div>
          </div>

          {/* Assignees */}
          {canAssignTasks && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Assignee</Label>
                <Select value={formData.assigned_to} onValueChange={v => setFormData({ ...formData, assigned_to: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select assignee…" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Co-assignees</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-9 justify-between text-sm font-normal">
                      {formData.sub_assignees.length > 0 ? `${formData.sub_assignees.length} selected` : 'Select co-assignees…'}
                      <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 max-h-56 overflow-y-auto p-2">
                    <div className="space-y-1">
                      {users.filter(u => u.id !== formData.assigned_to).map(u => (
                        <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50">
                          <Checkbox id={`sub-${u.id}`} checked={formData.sub_assignees.includes(u.id)} onCheckedChange={() => toggleSubAssignee(u.id)} />
                          <label htmlFor={`sub-${u.id}`} className="text-sm text-slate-700 cursor-pointer">{u.full_name}</label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Department */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Department</Label>
            <div className="flex flex-wrap gap-1.5">
              {DEPARTMENTS.map(dept => (
                <button key={dept.value} type="button" onClick={() => setFormData({ ...formData, category: dept.value })}
                  className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all ${formData.category === dept.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {dept.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Priority</Label>
              <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-slate-500" />
                <Label className="text-sm font-medium cursor-pointer" htmlFor="is_recurring">Recurring Task</Label>
              </div>
              <Switch id="is_recurring" checked={formData.is_recurring} onCheckedChange={v => setFormData({ ...formData, is_recurring: v })} />
            </div>
            {formData.is_recurring && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Repeat</Label>
                  <Select value={formData.recurrence_pattern} onValueChange={v => setFormData({ ...formData, recurrence_pattern: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_PATTERNS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Every</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="1" max="365" value={formData.recurrence_interval} onChange={e => setFormData({ ...formData, recurrence_interval: parseInt(e.target.value) || 1 })} className="h-9 w-20 text-sm" />
                    <span className="text-sm text-slate-500">
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

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="rounded-lg">Cancel</Button>
            <Button type="submit" disabled={loading} className="rounded-lg min-w-[120px] bg-blue-700 hover:bg-blue-800">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : editingTask ? 'Update Task' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div className="space-y-4 p-5 bg-slate-50 min-h-screen" variants={stagger} initial="hidden" animate="visible">

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-700 via-indigo-500 to-emerald-500" />
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Title */}
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Task Management</h1>
                <p className="text-sm text-slate-500 mt-0.5">{stats.total} total · {stats.overdue > 0 && <span className="text-red-600 font-medium">{stats.overdue} overdue</span>}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Upload / Export */}
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current.click()} className="h-8 text-xs gap-1.5 rounded-lg">
                    <FileText className="h-3.5 w-3.5" /> Upload CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportCsv} className="h-8 text-xs gap-1.5 rounded-lg">Export CSV</Button>
                  <Button variant="outline" size="sm" onClick={handleExportPdf} className="h-8 text-xs gap-1.5 rounded-lg">Export PDF</Button>
                </div>

                {/* CA/CS Templates */}
                {canEditTasks && (
                  <Button variant="outline" size="sm" onClick={() => setShowWorkflowLibrary(true)} className="h-8 text-xs gap-1.5 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                    <FileText className="h-3.5 w-3.5" /> CA/CS Templates
                  </Button>
                )}

                {/* Notification Bell */}
                <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="relative h-8 w-8 p-0 rounded-lg">
                      <Bell className="h-3.5 w-3.5 text-slate-600" />
                      {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 rounded-xl shadow-xl border border-slate-200 overflow-hidden" align="end">
                    <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><Bell className="h-3.5 w-3.5 text-blue-600" /></div>
                        <div><p className="text-sm font-semibold text-slate-800">Notifications</p><p className="text-xs text-slate-400 leading-none mt-0.5">Stay updated</p></div>
                      </div>
                      {unreadCount > 0 && <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs text-blue-600 hover:bg-blue-50 h-7 rounded-lg">Mark all read</Button>}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="py-12 text-center"><div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3"><Bell className="h-5 w-5 text-slate-400" /></div><p className="text-sm font-medium text-slate-600">All caught up!</p><p className="text-xs text-slate-400">No new notifications</p></div>
                      ) : notifications.map(notif => {
                        const isUnread = !notif.read;
                        const color = { comment: 'bg-indigo-100 text-indigo-600', assignment: 'bg-emerald-100 text-emerald-600', due_soon: 'bg-amber-100 text-amber-600', status: 'bg-blue-100 text-blue-600' }[notif.type] || 'bg-slate-100 text-slate-500';
                        return (
                          <div key={notif.id} className={`px-4 py-3 flex gap-3 transition-colors hover:bg-slate-50 ${isUnread ? 'bg-blue-50/50' : ''}`}>
                            {isUnread && <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                            <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${color}`}>
                              {notif.type === 'comment'    && <MessageSquare className="h-3.5 w-3.5" />}
                              {notif.type === 'assignment' && <User className="h-3.5 w-3.5" />}
                              {notif.type === 'due_soon'   && <Calendar className="h-3.5 w-3.5" />}
                              {(!notif.type || notif.type === 'status') && <Check className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug ${isUnread ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{notif.message}</p>
                              <p className="text-[11px] text-slate-400 mt-1">{format(new Date(notif.created_at), 'MMM dd, hh:mm a')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* New Task */}
                {canEditTasks && (
                  <Button size="sm" onClick={() => setDialogOpen(true)} className="h-8 px-4 text-sm font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white gap-1.5 shadow-sm">
                    <Plus className="h-4 w-4" /> New Task
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex gap-2 flex-wrap">
        <StatCard label="Total"       value={stats.total}      color="text-slate-700"  onClick={() => setFilterStatus('all')} active={filterStatus === 'all'} />
        <StatCard label="To Do"       value={stats.todo}       color="text-red-600"    icon={Circle}       onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}     active={filterStatus === 'pending'} />
        <StatCard label="In Progress" value={stats.inProgress} color="text-amber-600"  icon={Loader2}      onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')} active={filterStatus === 'in_progress'} />
        <StatCard label="Completed"   value={stats.completed}  color="text-sky-600"    icon={CheckCircle2} onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}  active={filterStatus === 'completed'} />
        <StatCard label="Overdue"     value={stats.overdue}    color="text-rose-600"   icon={AlertTriangle} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}     active={filterStatus === 'overdue'} />
      </motion.div>

      {/* ── Filters & View Toggle ──────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2 justify-between">
        {/* Left: Search + Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search tasks…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-8 w-56 text-sm bg-white rounded-lg" />
          </div>

          {[
            { label: 'Status', value: filterStatus, setter: setFilterStatus, options: [['all','All Statuses'],['pending','To Do'],['in_progress','In Progress'],['completed','Completed'],['overdue','Overdue']] },
            { label: 'Priority', value: filterPriority, setter: setFilterPriority, options: [['all','All Priorities'],['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']] },
            { label: 'Dept', value: filterCategory, setter: setFilterCategory, options: [['all','All Depts'], ...TASK_CATEGORIES.map(c => [c.value, c.label])] },
            { label: 'Assignee', value: filterAssignee, setter: setFilterAssignee, options: [['all','All Assignees'], ...users.map(u => [u.id, u.full_name])] },
          ].map(({ label, value, setter, options }) => (
            <Select key={label} value={value} onValueChange={setter}>
              <SelectTrigger className={`h-8 text-xs w-auto min-w-[110px] rounded-lg bg-white ${value !== 'all' ? 'border-blue-400 text-blue-700 font-medium' : ''}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {options.map(([v, l]) => <SelectItem key={v} value={v} className="text-sm">{l}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}

          {/* Sort */}
          <div className="flex items-center gap-1">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs w-[110px] rounded-lg bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="due_date" className="text-sm">Due Date</SelectItem>
                <SelectItem value="priority" className="text-sm">Priority</SelectItem>
                <SelectItem value="title"    className="text-sm">Title</SelectItem>
                <SelectItem value="status"   className="text-sm">Status</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')} className="h-8 w-8 rounded-lg border bg-white flex items-center justify-center hover:bg-slate-50 transition-colors">
              {sortDirection === 'asc' ? <SortAsc className="h-3.5 w-3.5 text-slate-500" /> : <SortDesc className="h-3.5 w-3.5 text-slate-500" />}
            </button>
          </div>

          {/* My Tasks Toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <Switch checked={showMyTasksOnly} onCheckedChange={setShowMyTasksOnly} className="scale-75" />
            <span className="text-xs text-slate-600 font-medium">My Tasks</span>
          </label>

          {activeFilters.length > 0 && (
            <button onClick={clearAllFilters} className="h-7 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1">
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Right: View toggle */}
        <div className="flex bg-slate-200 p-0.5 rounded-lg gap-0.5">
          {[['list', List, 'List'], ['board', LayoutGrid, 'Board']].map(([mode, Icon, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-all ${viewMode === mode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Active Filter Pills ────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeFilters.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-1.5">
            {activeFilters.map(pill => (
              <span key={pill.key} className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                {pill.label}
                <button onClick={() => removeFilter(pill.key)} className="hover:text-blue-900 ml-0.5"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Task List ─────────────────────────────────────────────────────── */}
      <div className="overflow-y-auto max-h-[calc(100vh-320px)] pb-8">
        {viewMode === 'list' ? (
          <motion.div className="space-y-2" variants={stagger}>
            {displayTasks.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Circle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No tasks found</p>
              </div>
            )}
            {displayTasks.map((task, index) => {
              const taskIsOverdue  = isOverdue(task);
              const displayStatus  = getDisplayStatus(task);
              const statusCfg      = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.pending;
              const priorityCfg    = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
              const checklistItems = parseChecklist(task.description);
              const checkedItems   = taskChecklists[task.id] || [];
              const progress       = getChecklistProgress(task);
              const StatusIcon     = statusCfg.icon;
              const isDone         = task.status === 'completed';

              return (
                <motion.div key={task.id} variants={fadeUp}>
                  <TaskCard stripeColor={getStripeColor(task, taskIsOverdue)} isCompleted={isDone}>
                    <div className={`flex flex-col ${isDone ? 'gap-1' : 'gap-3'}`}>

                      {/* ── Row 1: Title + Badges + Actions ── */}
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        {/* Left */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-[11px] font-bold text-slate-300 tabular-nums w-5 flex-shrink-0">#{index + 1}</span>
                          <span className={`font-semibold leading-snug truncate transition-all ${isDone ? 'text-sm text-slate-400 line-through' : 'text-base text-slate-900'}`}>
                            {task.title}
                          </span>

                          {/* Status badge */}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold flex-shrink-0 ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}>
                            <StatusIcon className="h-3 w-3" /> {statusCfg.label}
                          </span>

                          {/* Priority badge */}
                          <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold flex-shrink-0 ${priorityCfg.bg} ${priorityCfg.text}`}>
                            {priorityCfg.label}
                          </span>

                          {task.is_recurring && (
                            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-600 border border-purple-200 flex-shrink-0">
                              <Repeat className="h-3 w-3" /> Recur
                            </span>
                          )}

                          {checklistItems.length > 0 && !isDone && (
                            <span className={`hidden md:inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold flex-shrink-0 ${progress === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {progress}%
                            </span>
                          )}
                        </div>

                        {/* Right: Meta + Action buttons */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Meta info */}
                          {!isDone && (
                            <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500">
                              {task.client_id && (
                                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{getClientName(task.client_id)}</span>
                              )}
                              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{getUserName(task.assigned_to)}</span>
                              {task.due_date && (
                                <span className={`flex items-center gap-1 font-medium ${taskIsOverdue ? 'text-red-600' : ''}`}>
                                  <Clock className="h-3.5 w-3.5" />{getRelativeDue(task.due_date)}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-0.5">
                            {canModifyTask(task) && (
                              <button onClick={() => handleEdit(task)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canModifyTask(task) && (
                              <button onClick={() => handleDuplicateTask(task)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Duplicate">
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canModifyTask(task) && (
                              <button onClick={() => setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id)} className={`p-1.5 rounded-lg transition-colors ${openCommentTaskId === task.id ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-indigo-50 text-slate-400 hover:text-indigo-600'}`} title="Comments">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canDeleteTasks && (
                              <button onClick={() => handleDelete(task.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Row 2 (mobile): Meta info ── */}
                      {!isDone && (
                        <div className="flex lg:hidden items-center gap-4 text-xs text-slate-500 flex-wrap">
                          {task.client_id && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{getClientName(task.client_id)}</span>}
                          <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{getUserName(task.assigned_to)}</span>
                          {task.created_by && task.created_by !== task.assigned_to && <span className="flex items-center gap-1 text-slate-400">by {getUserName(task.created_by)}</span>}
                          {task.due_date && <span className={`flex items-center gap-1 font-medium ${taskIsOverdue ? 'text-red-600' : ''}`}><Clock className="h-3.5 w-3.5" />{getRelativeDue(task.due_date)}</span>}
                        </div>
                      )}

                      {/* ── Row 3: Checklist ── */}
                      {!isDone && checklistItems.length > 0 && (
                        <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Checklist</span>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 bg-emerald-100 rounded-full overflow-hidden"><div className={`h-full bg-emerald-500 rounded-full transition-all`} style={{ width: `${progress}%` }} /></div>
                              <span className="text-[11px] font-semibold text-emerald-700">{progress}%</span>
                            </div>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {checklistItems.map((item, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <Checkbox checked={checkedItems.includes(idx)} onCheckedChange={() => toggleChecklistItem(task.id, idx)} className="mt-0.5 h-3.5 w-3.5" />
                                <span className={`text-xs leading-snug ${checkedItems.includes(idx) ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Row 4: Quick Status Tabs ── */}
                      {!isDone && canModifyTask(task) && (
                        <div className="flex gap-1.5 pt-1 border-t border-slate-100">
                          {[['pending','To Do','bg-red-600','text-red-600','hover:bg-red-50 hover:border-red-300'],
                            ['in_progress','In Progress','bg-amber-500','text-amber-600','hover:bg-amber-50 hover:border-amber-300'],
                            ['completed','Completed','bg-sky-600','text-sky-600','hover:bg-sky-50 hover:border-sky-300']
                          ].map(([val, lbl, activeBg, inactiveTxt, hov]) => (
                            <button key={val} onClick={() => handleQuickStatusChange(task, val)}
                              className={`flex-1 h-7 text-xs font-semibold rounded-lg border transition-all ${task.status === val ? `${activeBg} text-white border-transparent shadow-sm` : `bg-white ${inactiveTxt} border-slate-200 ${hov}`}`}>
                              {lbl}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* ── Row 5: Inline Comment Box ── */}
                      <AnimatePresence>
                        {openCommentTaskId === task.id && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="border-t border-slate-100 pt-2 space-y-2">
                            <div className="max-h-28 overflow-y-auto space-y-1.5">
                              {(comments[task.id] || []).map((comment, i) => (
                                <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                                  <p className="text-xs text-slate-700">{comment.text}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">by {getUserName(comment.user_id)} · {comment.created_at ? format(new Date(comment.created_at), 'MMM dd, hh:mm a') : ''}</p>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment…" className="h-7 text-xs flex-1 rounded-lg" onKeyDown={e => { if (e.key === 'Enter') { setSelectedTask(task); handleAddComment(); } }} />
                              <Button size="sm" className="h-7 px-3 text-xs rounded-lg" onClick={() => { setSelectedTask(task); handleAddComment(); }}>Post</Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>
                  </TaskCard>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          /* ── Board View ──────────────────────────────────────────────── */
          <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={stagger}>
            {[
              { status: 'pending',     title: 'To Do',       color: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-200',   count: stats.todo },
              { status: 'in_progress', title: 'In Progress', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', count: stats.inProgress },
              { status: 'completed',   title: 'Completed',   color: 'text-sky-600',   bg: 'bg-sky-50',   border: 'border-sky-200',   count: stats.completed },
            ].map(col => (
              <motion.div key={col.status} variants={fadeUp}>
                {/* Column Header */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-3 border ${col.bg} ${col.border}`}>
                  <h2 className={`text-sm font-bold ${col.color}`}>{col.title}</h2>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white ${col.color}`}>{col.count}</span>
                </div>

                {/* Column Cards */}
                <div className="space-y-2.5 min-h-[200px]">
                  {displayTasks
                    .filter(t => t.status === col.status || (col.status === 'pending' && isOverdue(t)))
                    .map((task, index) => {
                      const taskIsOverdue  = isOverdue(task);
                      const displayStatus  = getDisplayStatus(task);
                      const statusCfg      = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.pending;
                      const priorityCfg    = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                      const checklistItems = parseChecklist(task.description);
                      const checkedItems   = taskChecklists[task.id] || [];
                      const progress       = getChecklistProgress(task);
                      const isDone         = task.status === 'completed';
                      return (
                        <TaskCard key={task.id} stripeColor={getStripeColor(task, taskIsOverdue)} isCompleted={isDone}>
                          <div className={`flex flex-col ${isDone ? 'gap-1.5' : 'gap-2.5'}`}>
                            {/* Badges */}
                            <div className="flex flex-wrap gap-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>{statusCfg.label}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${priorityCfg.bg} ${priorityCfg.text}`}>{priorityCfg.label}</span>
                              {task.is_recurring && <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-600">Recur</span>}
                              {checklistItems.length > 0 && <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${progress === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{progress}%</span>}
                            </div>

                            {/* Title */}
                            <h3 className={`font-semibold leading-snug ${isDone ? 'text-sm text-slate-400 line-through' : 'text-sm text-slate-900'}`}>{task.title}</h3>

                            {/* Checklist preview */}
                            {checklistItems.length > 0 && !isDone && (
                              <div className="bg-emerald-50 rounded-lg px-2.5 py-2 text-xs">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-semibold text-emerald-700">Checklist</span>
                                  <span className="text-emerald-600 font-bold">{progress}%</span>
                                </div>
                                {checklistItems.slice(0, 4).map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-1 text-emerald-700 truncate leading-snug mb-0.5">
                                    <Check className="h-3 w-3 flex-shrink-0" /> {item}
                                  </div>
                                ))}
                                {checklistItems.length > 4 && <p className="text-emerald-500 mt-1">+{checklistItems.length - 4} more</p>}
                              </div>
                            )}

                            {/* Meta */}
                            <div className="space-y-1 text-xs text-slate-500">
                              {task.client_id && <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{getClientName(task.client_id)}</div>}
                              <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{getUserName(task.assigned_to)}</div>
                              {task.created_by && <div className="text-slate-400">by {getUserName(task.created_by)}</div>}
                              {task.due_date && <div className={`flex items-center gap-1.5 font-medium ${taskIsOverdue ? 'text-red-600' : ''}`}><Clock className="h-3.5 w-3.5" />{getRelativeDue(task.due_date)}</div>}
                            </div>

                            {/* Board Actions */}
                            <div className="flex gap-1 flex-wrap mt-1">
                              {canModifyTask(task) && (
                                <button onClick={() => handleEdit(task)} className="flex-1 h-7 rounded-lg border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors">Edit</button>
                              )}
                              {canModifyTask(task) && (
                                <button onClick={() => handleDuplicateTask(task)} className="h-7 w-7 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center" title="Duplicate">
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                              {canModifyTask(task) && (
                                <button onClick={() => setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id)} className={`h-7 w-7 rounded-lg border transition-colors flex items-center justify-center ${openCommentTaskId === task.id ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'}`} title="Comment">
                                  <MessageSquare className="h-3 w-3" />
                                </button>
                              )}
                              {canDeleteTasks && (
                                <button onClick={() => handleDelete(task.id)} className="h-7 w-7 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center" title="Delete">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>

                            {/* Status Tabs */}
                            {canModifyTask(task) && (
                              <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100">
                                {[['pending','To Do','bg-red-600','hover:bg-red-50 hover:border-red-300 text-red-600'],
                                  ['in_progress','Prog.','bg-amber-500','hover:bg-amber-50 hover:border-amber-300 text-amber-600'],
                                  ['completed','Done','bg-sky-600','hover:bg-sky-50 hover:border-sky-300 text-sky-600']
                                ].map(([val, lbl, activeBg, inactive]) => (
                                  <button key={val} onClick={() => handleQuickStatusChange(task, val)}
                                    className={`h-6 text-[11px] font-semibold rounded-md border transition-all ${task.status === val ? `${activeBg} text-white border-transparent` : `bg-white border-slate-200 ${inactive}`}`}>
                                    {lbl}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Inline Comment (Board) */}
                            <AnimatePresence>
                              {openCommentTaskId === task.id && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t pt-2 space-y-1.5">
                                  <div className="max-h-24 overflow-y-auto space-y-1">
                                    {(comments[task.id] || []).map((c, i) => (
                                      <div key={i} className="bg-slate-50 rounded-lg px-2 py-1.5">
                                        <p className="text-[11px] text-slate-700">{c.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Comment…" className="h-7 text-xs flex-1 rounded-lg" />
                                    <Button size="sm" className="h-7 px-2.5 text-xs rounded-lg" onClick={() => { setSelectedTask(task); handleAddComment(); }}>Post</Button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </TaskCard>
                      );
                    })}
                  {displayTasks.filter(t => t.status === col.status || (col.status === 'pending' && isOverdue(t))).length === 0 && (
                    <div className="text-center py-10 text-slate-300">
                      <Circle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">No tasks</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Compliance Workflow Library Dialog ───────────────────────────── */}
      <Dialog open={showWorkflowLibrary} onOpenChange={setShowWorkflowLibrary}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>CA/CS Compliance Workflow Library</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              14 professionally curated statutory workflows. Click any template to auto-fill a new task.
            </DialogDescription>
          </DialogHeader>
          {/* Library Filters */}
          <div className="flex gap-2 sticky top-0 bg-white z-10 py-3 border-b">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search templates…" value={workflowSearch} onChange={e => setWorkflowSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <Select value={workflowDeptFilter} onValueChange={setWorkflowDeptFilter}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="All Depts" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Departments</SelectItem>{DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={workflowFreqFilter} onValueChange={setWorkflowFreqFilter}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="every 10 years">Every 10 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {filteredWorkflows.map(wf => {
              const steps = parseChecklist(wf.description);
              return (
                <button key={wf.id} type="button" onClick={() => applyComplianceWorkflow(wf)}
                  className="text-left rounded-xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all p-5 group bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{getCategoryLabel(wf.category)}</span>
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors mt-0.5 leading-snug">{wf.name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className="inline-block px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">{wf.estimatedHours}h</span>
                      <p className="text-[11px] text-slate-400 mt-1">{wf.frequency}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 mb-3">{wf.title}</p>
                  <div className="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-100">
                    <p className="text-[11px] font-semibold text-emerald-700 mb-1.5 flex items-center gap-1"><Check className="h-3 w-3" /> Key Steps</p>
                    <ul className="space-y-0.5 text-[11px] text-slate-600">
                      {steps.slice(0, 4).map((s, i) => <li key={i}>• {s}</li>)}
                      {steps.length > 4 && <li className="text-emerald-600 font-medium">+{steps.length - 4} more</li>}
                    </ul>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> {wf.estimatedDays}d estimated</span>
                    <span className="font-semibold text-emerald-600 group-hover:underline flex items-center gap-1">Use Template <ArrowRight className="h-3 w-3" /></span>
                  </div>
                </button>
              );
            })}
          </div>
          {filteredWorkflows.length === 0 && <div className="text-center py-16 text-slate-400 text-sm">No matching templates</div>}
          <p className="text-center text-[11px] text-slate-400 pb-2">All templates are frontend-powered • Zero backend changes required</p>
        </DialogContent>
      </Dialog>

      {/* ── Comments Full Dialog ───────────────────────────────────────── */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Comments — {selectedTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {(comments[selectedTask?.id] || []).map((comment, i) => (
              <div key={i} className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-sm text-slate-700">{comment.text}</p>
                <p className="text-xs text-slate-400 mt-1">by {getUserName(comment.user_id)} · {comment.created_at ? format(new Date(comment.created_at), 'MMM dd, yyyy hh:mm a') : ''}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment…" className="h-9 text-sm rounded-xl" />
            <Button onClick={handleAddComment} className="rounded-xl h-9">Post</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for CSV upload */}
      <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCsvUpload} />

      {/* Task Form Dialog */}
      <TaskFormDialog />

    </motion.div>
  );
}
