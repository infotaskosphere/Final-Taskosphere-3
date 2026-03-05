import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User, LayoutGrid, List,
  Circle, ArrowRight, Check, Repeat, MessageSquare, Bell, FileText,
  Calendar as CalendarIcon, ChevronDown, ChevronUp, Filter, X,
  Clock, TrendingUp, AlertCircle, CheckCircle2, BarChart2, Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── Brand Colors ──────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

// ─── Departments ───────────────────────────────────────────────────────────────
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
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
];

// ─── Compliance Templates (14 workflows) ──────────────────────────────────────
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

// ─── Status / Priority config ──────────────────────────────────────────────────
const STATUS_STYLES = {
  pending:     { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'To Do' },
  in_progress: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  label: 'In Progress' },
  completed:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'Completed' },
  overdue:     { bg: 'bg-red-100',   border: 'border-red-300',    text: 'text-red-800',    dot: 'bg-red-700',    label: 'Overdue' },
};
const PRIORITY_STYLES = {
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400', label: 'LOW' },
  medium:   { bg: 'bg-yellow-50',  text: 'text-yellow-700',  bar: 'bg-yellow-400',  label: 'MED' },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  bar: 'bg-orange-400',  label: 'HIGH' },
  critical: { bg: 'bg-red-50',     text: 'text-red-700',     bar: 'bg-red-500',     label: 'CRIT' },
};

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28 } } };

// ─── Stripe card ───────────────────────────────────────────────────────────────
const StripeCard = ({ stripeColor, children, isCompleted = false, className = '' }) => (
  <div className={`relative rounded-xl border overflow-hidden transition-all duration-200
    ${isCompleted ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200 hover:shadow-md hover:-translate-y-px'}
    ${className}`}
  >
    <div className={`absolute left-0 top-0 h-full w-1.5 ${stripeColor}`} />
    <div className={`pl-5 pr-5 ${isCompleted ? 'py-2.5' : 'py-4'}`}>{children}</div>
  </div>
);

const getStripeColor = (task, overdue) => {
  if (overdue) return 'bg-red-700';
  const s = task.status?.toLowerCase();
  if (s === 'completed')  return 'bg-blue-600';
  if (s === 'in_progress') return 'bg-amber-500';
  if (s === 'pending')    return 'bg-red-500';
  const p = task.priority?.toLowerCase();
  if (p === 'critical')   return 'bg-red-700';
  if (p === 'high')       return 'bg-orange-500';
  if (p === 'medium')     return 'bg-amber-400';
  return 'bg-emerald-500';
};

// ─── Stat tile ─────────────────────────────────────────────────────────────────
const StatTile = ({ label, value, color, icon: Icon, onClick, active }) => (
  <motion.div variants={itemVariants}>
    <Card
      className={`cursor-pointer transition-all duration-200 rounded-xl border overflow-hidden
        ${active ? 'ring-2 ring-offset-1 shadow-md' : 'hover:shadow-sm'}`}
      style={{ '--tw-ring-color': color }}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        </div>
        <p className="text-3xl font-bold font-outfit" style={{ color }}>{value}</p>
      </CardContent>
    </Card>
  </motion.div>
);

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Tasks() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();

  // Permission helpers
  const canModifyTask = (task) => {
    if (isAdmin) return true;
    return (
      task.assigned_to === user?.id ||
      task.sub_assignees?.includes(user?.id) ||
      task.created_by === user?.id
    );
  };
  const canAssignTasks = hasPermission('can_assign_tasks');
  const canEditTasks   = hasPermission('can_edit_tasks');
  const canDeleteTasks = isAdmin || hasPermission('can_edit_tasks');

  // Core state
  const [tasks,   setTasks]   = useState([]);
  const [users,   setUsers]   = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewMode, setViewMode] = useState('list');

  // Comment state
  const [comments, setComments] = useState({});
  const [openCommentTaskId, setOpenCommentTaskId] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // URL filter
  const filter = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('filter');
  }, [location.search]);

  // Filters + sort
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [sortBy,         setSortBy]         = useState('due_date');
  const [sortDirection,  setSortDirection]  = useState('asc');
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);
  const [activeFilters,  setActiveFilters]  = useState([]);

  // Workflow library
  const [showWorkflowLibrary,    setShowWorkflowLibrary]    = useState(false);
  const [taskChecklists,         setTaskChecklists]         = useState({});
  const [workflowSearch,         setWorkflowSearch]         = useState('');
  const [workflowDeptFilter,     setWorkflowDeptFilter]     = useState('all');
  const [workflowFrequencyFilter,setWorkflowFrequencyFilter]= useState('all');

  const fileInputRef = useRef(null);

  // Form state
  const emptyForm = {
    title: '', description: '', assigned_to: 'unassigned', sub_assignees: [],
    due_date: '', priority: 'medium', status: 'pending', category: 'other',
    client_id: '', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1,
  };
  const [formData, setFormData] = useState(emptyForm);

  // ── Filtered workflows ─────────────────────────────────────────────────────
  const filteredWorkflows = COMPLIANCE_WORKFLOWS.filter(wf => {
    const ms = wf.name.toLowerCase().includes(workflowSearch.toLowerCase()) || wf.title.toLowerCase().includes(workflowSearch.toLowerCase());
    const md = workflowDeptFilter === 'all' || wf.category === workflowDeptFilter;
    const mf = workflowFrequencyFilter === 'all' || wf.frequency.toLowerCase().includes(workflowFrequencyFilter.toLowerCase());
    return ms && md && mf;
  });

  const applyComplianceWorkflow = (wf) => {
    const due = new Date();
    due.setDate(due.getDate() + wf.estimatedDays);
    setFormData({ title: wf.title, description: wf.description, assigned_to: 'unassigned', sub_assignees: [],
      due_date: format(due, 'yyyy-MM-dd'), priority: wf.priority, status: 'pending', category: wf.category,
      client_id: '', is_recurring: true, recurrence_pattern: wf.recurrence_pattern, recurrence_interval: wf.recurrence_interval });
    setShowWorkflowLibrary(false);
    setDialogOpen(true);
    setWorkflowSearch(''); setWorkflowDeptFilter('all'); setWorkflowFrequencyFilter('all');
    toast.success(`✅ Loaded ${wf.name} template (${wf.estimatedHours} hrs)`);
  };

  // ── Checklist helpers ──────────────────────────────────────────────────────
  const parseChecklist = (desc) => {
    if (!desc) return [];
    return desc.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('•')).map(l => l.replace(/^[-•]\s*/, ''));
  };
  const toggleChecklistItem = (taskId, idx) => {
    setTaskChecklists(prev => {
      const cur = prev[taskId] || [];
      const next = cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx];
      return { ...prev, [taskId]: next };
    });
  };
  const getChecklistProgress = (task) => {
    const items = parseChecklist(task.description);
    if (!items.length) return 0;
    return Math.round(((taskChecklists[task.id] || []).length / items.length) * 100);
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTasks(); fetchClients(); fetchUsers(); fetchNotifications();
  }, [user]);

  const fetchTasks = async () => {
    try { const r = await api.get('/tasks'); setTasks(r.data); }
    catch { toast.error('Failed to fetch tasks'); }
  };
  const fetchUsers = async () => {
    try { const r = await api.get('/users'); setUsers(r.data); }
    catch { console.error('Failed to fetch users'); }
  };
  const fetchClients = async () => {
    try { const r = await api.get('/clients'); setClients(r.data); }
    catch { console.error('Failed to fetch clients'); }
  };
  const fetchComments = async (taskId) => {
    try { const r = await api.get(`/tasks/${taskId}/comments`); setComments(p => ({ ...p, [taskId]: r.data })); }
    catch { toast.error('Failed to fetch comments'); }
  };
  const fetchNotifications = async () => {
    try { const r = await api.get('/notifications'); setNotifications(r.data || []); }
    catch { console.error('Failed to fetch notifications'); }
  };
  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(p => p.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch { console.error('Failed'); }
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const taskData = { ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
        sub_assignees: formData.sub_assignees || [],
        client_id: formData.client_id || null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };
      if (editingTask) {
        await api.patch(`/tasks/${editingTask.id}`, taskData);
        toast.success('Task updated!');
      } else {
        await api.post('/tasks', taskData);
        toast.success('Task created!');
      }
      setDialogOpen(false); resetForm(); fetchTasks(); fetchNotifications();
    } catch { toast.error('Failed to save task'); }
    finally { setLoading(false); }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({ title: task.title, description: task.description || '',
      assigned_to: task.assigned_to || 'unassigned', sub_assignees: task.sub_assignees || [],
      due_date: task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '',
      priority: task.priority, status: task.status, category: task.category || 'other',
      client_id: task.client_id || '', is_recurring: task.is_recurring || false,
      recurrence_pattern: task.recurrence_pattern || 'monthly', recurrence_interval: task.recurrence_interval || 1 });
    setDialogOpen(true);
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task permanently?')) return;
    try { await api.delete(`/tasks/${taskId}`); toast.success('Task deleted'); fetchTasks(); }
    catch { toast.error('Failed to delete task'); }
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status: newStatus });
      toast.success(`Marked as ${STATUS_STYLES[newStatus]?.label || newStatus}`);
      fetchTasks(); fetchNotifications();
    } catch { toast.error('Failed to update status'); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${selectedTask.id}/comments`, { text: newComment });
      setNewComment(''); fetchComments(selectedTask.id);
      toast.success('Comment added'); fetchNotifications();
    } catch { toast.error('Failed to add comment'); }
  };

  const handleDuplicateTask = async (task) => {
    try {
      await api.post('/tasks', { title: `${task.title} (Copy)`, description: task.description || '',
        assigned_to: task.assigned_to, sub_assignees: task.sub_assignees || [], due_date: task.due_date,
        priority: task.priority, status: 'pending', category: task.category || 'other',
        client_id: task.client_id, is_recurring: task.is_recurring || false,
        recurrence_pattern: task.recurrence_pattern || 'monthly', recurrence_interval: task.recurrence_interval || 1 });
      toast.success('Task duplicated'); fetchTasks();
    } catch { toast.error('Failed to duplicate task'); }
  };

  const resetForm = () => { setFormData(emptyForm); setEditingTask(null); };

  const toggleSubAssignee = (uid) => {
    setFormData(prev => ({
      ...prev,
      sub_assignees: prev.sub_assignees.includes(uid) ? prev.sub_assignees.filter(id => id !== uid) : [...prev.sub_assignees, uid]
    }));
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getUserName   = (id) => users.find(u => u.id === id)?.full_name || 'Unassigned';
  const getClientName = (id) => clients.find(c => c.id === id)?.company_name || 'No Client';
  const getCategoryLabel = (v) => TASK_CATEGORIES.find(c => c.value === v)?.label || v || 'Other';
  const isOverdue = (task) => task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();
  const getDisplayStatus = (task) => isOverdue(task) ? 'overdue' : task.status;

  const getRelativeDueDate = (dueDate) => {
    if (!dueDate) return '';
    const d = new Date(dueDate), now = new Date();
    const diff = Math.ceil((d - now) / 86400000);
    if (diff < 0)  return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff <= 7)  return `${diff}d left`;
    return format(d, 'MMM dd');
  };

  // ── Filtering / sorting ────────────────────────────────────────────────────
  const filteredTasks = tasks.filter(t => {
    const ms = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const mst = filterStatus   === 'all' || getDisplayStatus(t) === filterStatus;
    const mp  = filterPriority === 'all' || t.priority === filterPriority;
    const mc  = filterCategory === 'all' || t.category === filterCategory;
    const ma  = filterAssignee === 'all' || t.assigned_to === filterAssignee;
    return ms && mst && mp && mc && ma;
  });

  const displayTasks = React.useMemo(() => {
    let result = [...filteredTasks];
    if (showMyTasksOnly && user?.id) {
      result = result.filter(t => t.assigned_to === user.id || t.sub_assignees?.includes(user.id) || t.created_by === user.id);
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'due_date') {
        const da = a.due_date ? new Date(a.due_date) : new Date(8640000000000000);
        const db = b.due_date ? new Date(b.due_date) : new Date(8640000000000000);
        cmp = da - db;
      } else if (sortBy === 'priority') {
        const po = { critical: 4, high: 3, medium: 2, low: 1 };
        cmp = (po[b.priority] || 0) - (po[a.priority] || 0);
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [filteredTasks, showMyTasksOnly, sortBy, sortDirection, user]);

  useEffect(() => {
    const pills = [];
    if (searchQuery)          pills.push({ key: 'search',   label: `"${searchQuery}"` });
    if (filterStatus   !== 'all') pills.push({ key: 'status',   label: STATUS_STYLES[filterStatus]?.label || filterStatus });
    if (filterPriority !== 'all') pills.push({ key: 'priority', label: filterPriority.toUpperCase() });
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

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all');
    setFilterCategory('all'); setFilterAssignee('all');
    setShowMyTasksOnly(false); setSortBy('due_date'); setSortDirection('asc');
    toast.success('Filters cleared');
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total:      tasks.length,
    todo:       tasks.filter(t => t.status === 'pending'    && !isOverdue(t)).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed:  tasks.filter(t => t.status === 'completed').length,
    overdue:    tasks.filter(t => isOverdue(t)).length,
  };

  // ── CSV / PDF ──────────────────────────────────────────────────────────────
  const handleCsvUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    Papa.parse(file, { header: true, complete: async (r) => {
      try { await api.post('/tasks/bulk', { tasks: r.data }); toast.success('Tasks uploaded!'); fetchTasks(); }
      catch { toast.error('Upload failed'); }
    }});
  };
  const handleExportCsv = () => {
    const csv = Papa.unparse(tasks.map(t => ({ title: t.title, description: t.description, assigned_to: getUserName(t.assigned_to), due_date: t.due_date ? format(new Date(t.due_date), 'yyyy-MM-dd') : '', priority: t.priority, status: t.status, category: t.category, client: getClientName(t.client_id) })));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'tasks.csv'; a.click();
  };
  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.autoTable({ head: [['Title','Client','Priority','Status','Due Date']], body: tasks.map(t => [t.title, getClientName(t.client_id), t.priority.toUpperCase(), t.status.toUpperCase(), t.due_date ? format(new Date(t.due_date), 'MMM dd, yyyy') : '']) });
    doc.save('tasks.pdf');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Render form dialog ─────────────────────────────────────────────────────
  const TaskFormDialog = () => (
    <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
      {canEditTasks && (
        <DialogTrigger asChild>
          <Button size="sm" onClick={() => { setEditingTask(null); setFormData(emptyForm); }}
            className="h-9 px-4 font-semibold rounded-xl shadow-sm"
            style={{ background: COLORS.deepBlue }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New Task
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>
            {editingTask ? 'Edit Task' : 'New Task'}
          </DialogTitle>
          <DialogDescription>{editingTask ? 'Update task details below.' : 'Fill in the details to create a task.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input placeholder="Task title" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="Describe the task..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={formData.client_id || 'no_client'} onValueChange={v => { if (v === '__add__') { navigate('/clients?openAddClient=true&returnTo=tasks'); } else { setFormData({ ...formData, client_id: v === 'no_client' ? '' : v }); } }}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="No Client" /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="no_client">No Client</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                  <SelectItem value="__add__" className="text-blue-600 font-semibold">+ Add New Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} className="rounded-xl" />
            </div>
          </div>
          {canAssignTasks && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={formData.assigned_to} onValueChange={v => setFormData({ ...formData, assigned_to: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Co-assignees</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between rounded-xl">
                      {formData.sub_assignees.length > 0 ? `${formData.sub_assignees.length} selected` : 'Select...'}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 max-h-60 overflow-y-auto rounded-xl">
                    <div className="space-y-2 p-1">
                      {users.filter(u => u.id !== formData.assigned_to).map(u => (
                        <div key={u.id} className="flex items-center gap-2 px-1">
                          <Checkbox id={`sub-${u.id}`} checked={formData.sub_assignees.includes(u.id)} onCheckedChange={() => toggleSubAssignee(u.id)} />
                          <label htmlFor={`sub-${u.id}`} className="text-sm cursor-pointer">{u.full_name}</label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Department</Label>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map(dept => (
                <button key={dept.value} type="button" onClick={() => setFormData({ ...formData, category: dept.value })}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${formData.category === dept.value ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  style={formData.category === dept.value ? { background: COLORS.deepBlue } : {}}
                >
                  {dept.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={v => setFormData({ ...formData, priority: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-slate-500" />
                <Label className="font-medium">Recurring Task</Label>
              </div>
              <Switch checked={formData.is_recurring} onCheckedChange={v => setFormData({ ...formData, is_recurring: v })} />
            </div>
            {formData.is_recurring && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div className="space-y-1.5">
                  <Label>Repeat</Label>
                  <Select value={formData.recurrence_pattern} onValueChange={v => setFormData({ ...formData, recurrence_pattern: v })}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{RECURRENCE_PATTERNS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Every</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="1" max="365" value={formData.recurrence_interval} onChange={e => setFormData({ ...formData, recurrence_interval: parseInt(e.target.value) || 1 })} className="w-20 rounded-xl" />
                    <span className="text-sm text-slate-500">
                      {formData.recurrence_pattern === 'daily' ? 'day(s)' : formData.recurrence_pattern === 'weekly' ? 'week(s)' : formData.recurrence_pattern === 'monthly' ? 'month(s)' : 'year(s)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="pt-3 border-t">
            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="rounded-xl">Cancel</Button>
            <Button type="submit" disabled={loading} className="rounded-xl" style={{ background: COLORS.deepBlue }}>
              {loading ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div className="space-y-5 p-4 md:p-6" variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue}, ${COLORS.emeraldGreen})` }} />
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>Task Management</h1>
                <p className="text-sm text-slate-500 mt-0.5">Track, assign and complete work</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-xl text-xs h-8" onClick={() => fileInputRef.current.click()}>Upload CSV</Button>
                <Button variant="outline" size="sm" className="rounded-xl text-xs h-8" onClick={handleExportCsv}>Export CSV</Button>
                <Button variant="outline" size="sm" className="rounded-xl text-xs h-8" onClick={handleExportPdf}>Export PDF</Button>
                {canEditTasks && (
                  <Button variant="outline" size="sm" className="rounded-xl text-xs h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setShowWorkflowLibrary(true)}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" /> Templates
                  </Button>
                )}

                {/* Notifications */}
                <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="relative h-8 w-8 p-0 rounded-xl">
                      <Bell className="h-4 w-4 text-slate-600" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unreadCount}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 rounded-2xl shadow-xl border overflow-hidden" align="end">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-slate-800 text-sm">Notifications</span>
                      </div>
                      {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs text-blue-600 h-7 px-2 rounded-lg">Mark all read</Button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-10 text-center">
                          <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">All caught up!</p>
                        </div>
                      ) : notifications.map(n => (
                        <div key={n.id} className={`px-4 py-3 border-b last:border-0 transition-colors ${!n.read ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                          {!n.read && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full inline-block mr-2 mb-0.5" />}
                          <p className={`text-sm ${!n.read ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{format(new Date(n.created_at), 'MMM dd, h:mm a')}</p>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <TaskFormDialog />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Total"       value={stats.total}      color={COLORS.deepBlue}   icon={BarChart2}     onClick={() => setFilterStatus('all')}       active={filterStatus === 'all'} />
        <StatTile label="To Do"       value={stats.todo}       color="#dc2626"           icon={Circle}        onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}       active={filterStatus === 'pending'} />
        <StatTile label="In Progress" value={stats.inProgress} color="#d97706"           icon={Zap}           onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')} active={filterStatus === 'in_progress'} />
        <StatTile label="Completed"   value={stats.completed}  color={COLORS.mediumBlue} icon={CheckCircle2}  onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}   active={filterStatus === 'completed'} />
        <StatTile label="Overdue"     value={stats.overdue}    color="#991b1b"           icon={AlertCircle}   onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}       active={filterStatus === 'overdue'} />
      </div>

      {/* ── Filters + View toggle ── */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search tasks…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-52 rounded-xl text-sm bg-white" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 rounded-xl text-sm bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-32 rounded-xl text-sm bg-white"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 w-36 rounded-xl text-sm bg-white"><SelectValue placeholder="Dept" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {TASK_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="h-8 w-36 rounded-xl text-sm bg-white"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={() => setShowMyTasksOnly(p => !p)}
            className={`h-8 px-3 rounded-xl text-xs font-semibold border transition-all ${showMyTasksOnly ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
          >My Tasks</button>
          {activeFilters.length > 0 && (
            <button onClick={clearAllFilters} className="h-8 px-3 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center gap-1">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <div className="flex bg-slate-100 p-0.5 rounded-xl">
          <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button onClick={() => setViewMode('board')} className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold transition-all ${viewMode === 'board' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
            <LayoutGrid className="h-3.5 w-3.5" /> Board
          </button>
        </div>
      </motion.div>

      {/* Active filter pills */}
      <AnimatePresence>
        {activeFilters.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-wrap gap-2">
            {activeFilters.map(p => (
              <span key={p.key} onClick={() => removeFilter(p.key)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
              >
                {p.label} <X className="h-3 w-3" />
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Task list ── */}
      <div className="overflow-y-auto max-h-[calc(100vh-360px)] pb-6">
        {viewMode === 'list' ? (
          <motion.div className="space-y-2.5" variants={containerVariants}>
            {displayTasks.map((task, index) => {
              const over = isOverdue(task);
              const ds   = getDisplayStatus(task);
              const ss   = STATUS_STYLES[ds]   || STATUS_STYLES.pending;
              const ps   = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
              const checklistItems = parseChecklist(task.description);
              const checkedItems   = taskChecklists[task.id] || [];
              const progress       = getChecklistProgress(task);
              const isDone = task.status === 'completed';
              return (
                <motion.div key={task.id} variants={itemVariants}>
                  <StripeCard stripeColor={getStripeColor(task, over)} isCompleted={isDone}>
                    <div className={`flex flex-col ${isDone ? 'gap-1' : 'gap-3'}`}>
                      {/* Row 1 — title + meta + actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-300 w-5 shrink-0">#{index + 1}</span>
                          <span className={`font-semibold truncate transition-all ${isDone ? 'text-sm text-slate-400 line-through' : 'text-base text-slate-900'}`}>{task.title}</span>
                          {/* Priority bar badge */}
                          <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${ps.bg} ${ps.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ps.bar}`} /> {ps.label}
                          </span>
                          <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} /> {ss.label}
                          </span>
                          {task.is_recurring && <span className="hidden md:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700">Recurring</span>}
                          {checklistItems.length > 0 && (
                            <span className={`hidden md:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${progress === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {progress}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
                            {task.client_id && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{getClientName(task.client_id)}</span>}
                            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{getUserName(task.assigned_to)}</span>
                            {task.created_by && task.created_by !== task.assigned_to && (
                              <span className="text-slate-300">by {getUserName(task.created_by)}</span>
                            )}
                            {task.due_date && (
                              <span className={`flex items-center gap-1 font-medium ${over ? 'text-red-600' : 'text-slate-500'}`}>
                                <Clock className="h-3.5 w-3.5" />{getRelativeDueDate(task.due_date)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {canModifyTask(task) && (
                              <button onClick={() => handleEdit(task)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canModifyTask(task) && (
                              <button onClick={() => handleDuplicateTask(task)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Duplicate">
                                <Repeat className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canModifyTask(task) && (
                              <button onClick={() => { setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id); fetchComments(task.id); }} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors" title="Comments">
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

                      {/* Checklist */}
                      {!isDone && checklistItems.length > 0 && (
                        <div className="ml-7 border-l-2 border-emerald-200 bg-emerald-50/60 rounded-lg p-3">
                          <div className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5" /> Checklist — {progress}% complete
                          </div>
                          <div className="space-y-1 max-h-44 overflow-y-auto">
                            {checklistItems.map((item, idx) => (
                              <label key={idx} className="flex items-start gap-2 cursor-pointer group">
                                <Checkbox checked={checkedItems.includes(idx)} onCheckedChange={() => toggleChecklistItem(task.id, idx)} className="mt-0.5" />
                                <span className={`text-xs ${checkedItems.includes(idx) ? 'line-through text-slate-400' : 'text-slate-600'} group-hover:text-slate-800 transition-colors`}>{item}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status tabs */}
                      {!isDone && canModifyTask(task) && (
                        <div className="flex gap-1.5 pt-2 border-t border-slate-100">
                          {[
                            { s: 'pending',     label: 'To Do',       active: 'bg-red-600 text-white border-red-600',    hover: 'hover:bg-red-50 hover:border-red-300 hover:text-red-700' },
                            { s: 'in_progress', label: 'In Progress',  active: 'bg-amber-500 text-white border-amber-500', hover: 'hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700' },
                            { s: 'completed',   label: 'Completed',    active: 'bg-blue-600 text-white border-blue-600',   hover: 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700' },
                          ].map(({ s, label, active, hover }) => (
                            <button key={s} onClick={() => handleQuickStatusChange(task, s)}
                              className={`flex-1 h-7 text-xs font-semibold rounded-lg border transition-all ${task.status === s ? active : `bg-white border-slate-200 text-slate-500 ${hover}`}`}
                            >{label}</button>
                          ))}
                        </div>
                      )}

                      {/* Inline comments */}
                      <AnimatePresence>
                        {openCommentTaskId === task.id && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t pt-3 space-y-2">
                            <div className="max-h-28 overflow-y-auto space-y-1">
                              {(comments[task.id] || []).map((c, i) => (
                                <div key={i} className="text-xs px-3 py-2 bg-slate-50 rounded-lg">
                                  <span className="font-medium text-slate-700">{c.text}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add comment…" className="h-8 text-xs rounded-xl" onKeyDown={e => { if (e.key === 'Enter') { setSelectedTask(task); handleAddComment(); }}} />
                              <Button size="sm" className="h-8 px-3 rounded-xl text-xs" onClick={() => { setSelectedTask(task); handleAddComment(); }}>Post</Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </StripeCard>
                </motion.div>
              );
            })}
            {displayTasks.length === 0 && (
              <div className="py-20 text-center">
                <Circle className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No tasks found</p>
                <p className="text-slate-300 text-sm mt-1">Try adjusting your filters</p>
              </div>
            )}
          </motion.div>
        ) : (
          /* ── Board View ── */
          <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-5" variants={containerVariants}>
            {[
              { status: 'pending',     title: 'To Do',       count: stats.todo,       dot: 'bg-red-500' },
              { status: 'in_progress', title: 'In Progress', count: stats.inProgress, dot: 'bg-amber-500' },
              { status: 'completed',   title: 'Completed',   count: stats.completed,  dot: 'bg-blue-500' },
            ].map(col => (
              <motion.div key={col.status} variants={itemVariants} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h2 className="font-bold text-slate-700">{col.title}</h2>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">{col.count}</span>
                </div>
                <div className="space-y-3 min-h-[200px]">
                  {displayTasks.filter(t => t.status === col.status || (col.status === 'pending' && isOverdue(t))).map((task, index) => {
                    const over = isOverdue(task);
                    const ds   = getDisplayStatus(task);
                    const ss   = STATUS_STYLES[ds] || STATUS_STYLES.pending;
                    const ps   = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                    const isDone = task.status === 'completed';
                    const checklistItems = parseChecklist(task.description);
                    const progress = getChecklistProgress(task);
                    return (
                      <StripeCard key={task.id} stripeColor={getStripeColor(task, over)} isCompleted={isDone}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className={`font-semibold leading-snug ${isDone ? 'text-sm text-slate-400 line-through' : 'text-sm text-slate-900'}`}>{task.title}</h3>
                            <div className="flex gap-1 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ps.bg} ${ps.text}`}>{ps.label}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ss.bg} ${ss.text}`}>{ss.label}</span>
                            </div>
                          </div>
                          {checklistItems.length > 0 && (
                            <div className="text-xs bg-emerald-50 px-3 py-2 rounded-lg">
                              <div className="font-medium text-emerald-700 mb-1">Checklist · {progress}%</div>
                              {checklistItems.slice(0, 3).map((item, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-emerald-600 truncate"><Check className="h-3 w-3 shrink-0" />{item}</div>
                              ))}
                              {checklistItems.length > 3 && <div className="text-emerald-500 mt-0.5">+{checklistItems.length - 3} more</div>}
                            </div>
                          )}
                          <div className="space-y-0.5 text-xs text-slate-400">
                            {task.client_id && <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{getClientName(task.client_id)}</div>}
                            <div className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{getUserName(task.assigned_to)}</div>
                            {task.due_date && <div className={`flex items-center gap-1 ${over ? 'text-red-600 font-medium' : ''}`}><Clock className="h-3.5 w-3.5" />{getRelativeDueDate(task.due_date)}</div>}
                          </div>
                          {canModifyTask(task) && (
                            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100">
                              {[
                                { s: 'pending', label: 'Todo', cls: 'hover:bg-red-50 hover:text-red-700', active: 'bg-red-600 text-white' },
                                { s: 'in_progress', label: 'WIP', cls: 'hover:bg-amber-50 hover:text-amber-700', active: 'bg-amber-500 text-white' },
                                { s: 'completed', label: 'Done', cls: 'hover:bg-blue-50 hover:text-blue-700', active: 'bg-blue-600 text-white' },
                              ].map(({ s, label, cls, active: ac }) => (
                                <button key={s} onClick={() => handleQuickStatusChange(task, s)}
                                  className={`h-6 text-[10px] font-bold rounded-lg border transition-all ${task.status === s ? ac + ' border-transparent' : 'bg-white border-slate-200 text-slate-500 ' + cls}`}
                                >{label}</button>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1">
                            {canModifyTask(task) && (
                              <button onClick={() => handleEdit(task)} className="flex-1 h-7 text-[10px] font-semibold rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">Edit</button>
                            )}
                            {canModifyTask(task) && (
                              <button onClick={() => handleDuplicateTask(task)} className="flex-1 h-7 text-[10px] font-semibold rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors">Dup</button>
                            )}
                            {canDeleteTasks && (
                              <button onClick={() => handleDelete(task.id)} className="h-7 w-7 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {/* Inline comments in board */}
                          <AnimatePresence>
                            {openCommentTaskId === task.id && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t pt-2 space-y-2">
                                <div className="max-h-24 overflow-y-auto space-y-1">
                                  {(comments[task.id] || []).map((c, i) => (
                                    <div key={i} className="text-xs px-2 py-1.5 bg-slate-50 rounded">{c.text}</div>
                                  ))}
                                </div>
                                <div className="flex gap-1.5">
                                  <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Comment…" className="h-7 text-xs rounded-lg flex-1" />
                                  <Button size="sm" className="h-7 px-2 text-xs rounded-lg" onClick={() => { setSelectedTask(task); handleAddComment(); }}>Post</Button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {canModifyTask(task) && (
                            <button onClick={() => { setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id); fetchComments(task.id); }}
                              className="h-7 text-[10px] font-semibold rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 w-full transition-colors flex items-center justify-center gap-1"
                            >
                              <MessageSquare className="h-3 w-3" /> Comments
                            </button>
                          )}
                        </div>
                      </StripeCard>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Compliance Workflow Library ── */}
      <Dialog open={showWorkflowLibrary} onOpenChange={setShowWorkflowLibrary}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>CA/CS Compliance Templates</DialogTitle>
            <DialogDescription>14 professionally curated statutory workflows. Click any to auto-fill the task form.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 sticky top-0 bg-white z-10 py-3 border-b">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search templates…" value={workflowSearch} onChange={e => setWorkflowSearch(e.target.value)} className="pl-9 rounded-xl" />
            </div>
            <Select value={workflowDeptFilter} onValueChange={setWorkflowDeptFilter}>
              <SelectTrigger className="w-48 rounded-xl"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={workflowFrequencyFilter} onValueChange={setWorkflowFrequencyFilter}>
              <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Frequencies</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {filteredWorkflows.map(wf => {
              const steps = parseChecklist(wf.description).slice(0, 4);
              const ps = PRIORITY_STYLES[wf.priority] || PRIORITY_STYLES.medium;
              return (
                <Card key={wf.id} onClick={() => applyComplianceWorkflow(wf)}
                  className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-emerald-400 group overflow-hidden rounded-xl"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{getCategoryLabel(wf.category)}</span>
                        <h3 className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors leading-snug mt-0.5">{wf.name}</h3>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ps.bg} ${ps.text}`}>{ps.label}</span>
                        <p className="text-xs text-slate-400 mt-1">{wf.frequency}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 mb-3 border border-slate-100">
                      <div className="text-[10px] font-bold text-emerald-700 mb-1.5 flex items-center gap-1"><Check className="h-3 w-3" /> Key Steps</div>
                      <ul className="space-y-0.5">
                        {steps.map((s, i) => <li key={i} className="text-xs text-slate-600 flex gap-1.5">· {s}</li>)}
                        {parseChecklist(wf.description).length > 4 && <li className="text-xs text-emerald-600">+{parseChecklist(wf.description).length - 4} more</li>}
                      </ul>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{wf.estimatedHours}h · {wf.estimatedDays}d</span>
                      <span className="text-emerald-600 font-semibold group-hover:underline flex items-center gap-1">Use Template <ArrowRight className="h-3 w-3" /></span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {filteredWorkflows.length === 0 && <div className="py-16 text-center text-slate-400">No matching templates found</div>}
        </DialogContent>
      </Dialog>

      {/* ── Comments full dialog ── */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Comments — {selectedTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {(comments[selectedTask?.id] || []).map((c, i) => (
              <div key={i} className="border-b pb-2">
                <p className="text-sm">{c.text}</p>
                <small className="text-slate-400">By {getUserName(c.user_id)} · {format(new Date(c.created_at), 'MMM dd, yyyy h:mm a')}</small>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment…" className="rounded-xl" />
            <Button onClick={handleAddComment} className="rounded-xl">Post</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Hidden CSV input ── */}
      <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleCsvUpload} />
    </motion.div>
  );
}
