import React, { useState, useEffect, useRef } from 'react';
import useDark from '../hooks/useDark';

// ✅ UI COMPONENTS (fixed)
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

// ✅ OTHER LIBS
import { toast } from 'sonner';
import api from '../lib/api';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ✅ ICONS
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User, Users,
  LayoutGrid, List, Circle, ArrowRight, Check, Repeat, Sparkles,
  MessageSquare, Bell, FileText, Calendar as CalendarIcon,
  X, ChevronDown, Filter, Clock, AlertCircle, CheckCircle2,
  TrendingUp, MoreHorizontal, Copy, SlidersHorizontal,
  Briefcase, Target, Activity, ChevronRight, Sun,
  Loader2, Mail, Send,
} from 'lucide-react';

// ─── Brand Colors ────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  coral:        '#FF6B6B',
  amber:        '#F59E0B',
};

// ─── Spring Physics (matches Dashboard) ─────────────────────────────────────
const springPhysics = {
  card:   { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
  button: { type: 'spring', stiffness: 400, damping: 28 },
  tap:    { type: 'spring', stiffness: 500, damping: 30 },
};

// ─── Department categories ───────────────────────────────────────────────────
const DEPARTMENTS = [
  { value: 'gst',          label: 'GST' },
  { value: 'income_tax',   label: 'INCOME TAX' },
  { value: 'accounts',     label: 'ACCOUNTS' },
  { value: 'tds',          label: 'TDS' },
  { value: 'roc',          label: 'ROC' },
  { value: 'trademark',    label: 'TRADEMARK' },
  { value: 'msme_smadhan', label: 'MSME SMADHAN' },
  { value: 'fema',         label: 'FEMA' },
  { value: 'dsc',          label: 'DSC' },
  { value: 'other',        label: 'OTHER' },
];

const TASK_CATEGORIES = DEPARTMENTS;

const RECURRENCE_PATTERNS = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
];

// ─── CA/CS Compliance Workflow Templates ─────────────────────────────────────
const COMPLIANCE_WORKFLOWS = [
  {
    id: 1, name: "Monthly GST Compliance", category: "gst",
    title: "Monthly GST Filing - GSTR-1 & GSTR-3B",
    description: "- Reconcile GSTR-2B with purchase register\n- Prepare GSTR-1 (B2B/B2C/CDNR)\n- File GSTR-3B\n- Pay tax & generate challan\n- Reconcile ITC\n- Review for notices\n- Update books of accounts\n- Check HSN/SAC codes",
    recurrence_pattern: "monthly", recurrence_interval: 1, priority: "high", estimatedDays: 5, estimatedHours: 18, frequency: "Monthly"
  },
  {
    id: 2, name: "Quarterly TDS Compliance", category: "tds",
    title: "Quarterly TDS Return - 24Q/26Q/27Q",
    description: "- Download Form 16A/27D from TRACES\n- Reconcile TDS with books\n- Prepare & file quarterly return\n- Generate TDS certificates\n- Pay TDS before due date\n- Update challan status\n- Check late fee/interest",
    recurrence_pattern: "monthly", recurrence_interval: 3, priority: "high", estimatedDays: 7, estimatedHours: 22, frequency: "Quarterly"
  },
  {
    id: 3, name: "ROC Annual Filing (Private Ltd)", category: "roc",
    title: "Annual ROC Filing - AOC-4 & MGT-7",
    description: "- Prepare financial statements\n- File AOC-4 XBRL\n- File MGT-7\n- File MGT-8 (if applicable)\n- Board & AGM minutes\n- DIR-12 for director changes\n- Check DIN status\n- Update registers",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 15, estimatedHours: 45, frequency: "Annual"
  },
  {
    id: 4, name: "Income Tax Return (Company)", category: "income_tax",
    title: "ITR-6 Filing + Tax Audit (if applicable)",
    description: "- Reconcile 26AS & AIS\n- Prepare ITR-6\n- File Tax Audit Report (3CD)\n- Pay advance tax / self assessment tax\n- Check Form 3CA/3CB\n- Upload balance sheet\n- Claim deductions u/s 10AA/80\n- MAT calculation",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 20, estimatedHours: 55, frequency: "Annual"
  },
  {
    id: 5, name: "DSC Renewal & PAN TAN", category: "dsc",
    title: "DSC Renewal + PAN/TAN Compliance",
    description: "- Check DSC expiry (30 days prior)\n- Renew Class 3 DSC\n- Update PAN/TAN details\n- Link Aadhaar with PAN\n- Update DSC in MCA & GST portal\n- Verify e-filing credentials",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "medium", estimatedDays: 3, estimatedHours: 8, frequency: "Annual"
  },
  {
    id: 6, name: "MSME Samadhan Filing", category: "msme_smadhan",
    title: "MSME Delayed Payment Complaint",
    description: "- Identify delayed payments >45 days\n- File Udyam Samadhan application\n- Follow up with buyer\n- Generate reference number\n- Monitor status on portal\n- Prepare supporting documents",
    recurrence_pattern: "monthly", recurrence_interval: 1, priority: "medium", estimatedDays: 4, estimatedHours: 12, frequency: "Monthly"
  },
  {
    id: 7, name: "FEMA Annual Return", category: "fema",
    title: "FC-GPR / FLA / Annual FEMA Return",
    description: "- Collect foreign investment details\n- File FLA return on RBI portal\n- File FC-GPR for fresh allotment\n- File FC-TRS for transfer\n- Maintain LOU/LOC records\n- Check ECB compliance",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "high", estimatedDays: 10, estimatedHours: 30, frequency: "Annual"
  },
  {
    id: 8, name: "Trademark Renewal", category: "trademark",
    title: "Trademark Renewal & Monitoring",
    description: "- Check renewal due date (6 months prior)\n- File TM-R application\n- Pay renewal fee\n- Monitor opposition period\n- File TM-M for modification\n- Update trademark register",
    recurrence_pattern: "yearly", recurrence_interval: 10, priority: "medium", estimatedDays: 5, estimatedHours: 15, frequency: "Every 10 Years"
  },
  {
    id: 9, name: "GSTR-9 Annual Reconciliation", category: "gst",
    title: "Annual GST Return - GSTR-9 & GSTR-9C",
    description: "- Reconcile GSTR-1, 3B & 2B\n- Prepare GSTR-9\n- Audit GSTR-9C (if turnover >5Cr)\n- Reconcile ITC & output tax\n- File before 31st Dec",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 12, estimatedHours: 35, frequency: "Annual"
  },
  {
    id: 10, name: "PF & ESIC Monthly", category: "accounts",
    title: "Monthly PF & ESIC Contribution & Return",
    description: "- Calculate PF & ESIC on salary\n- Deposit contribution by 15th\n- File ECR return\n- Reconcile challan\n- Generate Form 3A/6A",
    recurrence_pattern: "monthly", recurrence_interval: 1, priority: "high", estimatedDays: 3, estimatedHours: 10, frequency: "Monthly"
  },
  {
    id: 11, name: "Board Meeting Compliance", category: "roc",
    title: "Quarterly Board Meeting & Minutes",
    description: "- Schedule board meeting\n- Prepare agenda & notes\n- Record minutes in MBP-1\n- File MGT-14 for resolutions\n- Update registers",
    recurrence_pattern: "monthly", recurrence_interval: 3, priority: "medium", estimatedDays: 4, estimatedHours: 14, frequency: "Quarterly"
  },
  {
    id: 12, name: "Income Tax TDS/TCS Quarterly", category: "tds",
    title: "TDS/TCS Quarterly Return & Certificates",
    description: "- File 26Q/27Q/27EQ\n- Issue Form 16/16A\n- Reconcile with 26AS\n- Pay late fee if any",
    recurrence_pattern: "monthly", recurrence_interval: 3, priority: "high", estimatedDays: 6, estimatedHours: 20, frequency: "Quarterly"
  },
  {
    id: 13, name: "Company Secretarial Annual", category: "roc",
    title: "Annual Secretarial Compliance Package",
    description: "- AGM Notice & Minutes\n- File AOC-4, MGT-7\n- DIR-3 KYC\n- DPT-3 if applicable\n- MBP-1, MBP-2 update",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 18, estimatedHours: 50, frequency: "Annual"
  },
  {
    id: 14, name: "GST Annual Audit (if applicable)", category: "gst",
    title: "GST Audit u/s 35(5) + GSTR-9C",
    description: "- Reconcile books with GST returns\n- Prepare reconciliation statement\n- File GSTR-9C\n- Issue audit report",
    recurrence_pattern: "yearly", recurrence_interval: 1, priority: "critical", estimatedDays: 25, estimatedHours: 60, frequency: "Annual"
  },
];

// ─── Status & Priority Styles ─────────────────────────────────────────────────
const STATUS_STYLES = {
  pending:     { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500',    label: 'To Do' },
  in_progress: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500',  label: 'In Progress' },
  completed:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500',   label: 'Completed' },
  overdue:     { bg: 'bg-red-100',   text: 'text-red-800',    border: 'border-red-300',    dot: 'bg-red-700',    label: 'Overdue' },
};

const PRIORITY_STYLES = {
  low:      { bg: 'bg-green-50',  text: 'text-green-700',  bar: 'bg-green-500',  label: 'LOW' },
  medium:   { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-500', label: 'MED' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500', label: 'HIGH' },
  critical: { bg: 'bg-red-50',    text: 'text-red-700',    bar: 'bg-red-600',    label: 'CRIT' },
};

const getStripeColor = (task, overdue) => {
  if (overdue) return 'bg-red-700';
  const s = (task.status || '').toLowerCase();
  if (s === 'completed')   return 'bg-blue-600';
  if (s === 'in_progress') return 'bg-amber-500';
  if (s === 'pending') {
    const p = (task.priority || '').toLowerCase();
    if (p === 'critical') return 'bg-red-600';
    if (p === 'high')     return 'bg-orange-500';
    return 'bg-red-400';
  }
  return 'bg-slate-300';
};

// ─── Animation variants ───────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } },
};

const EMPTY_FORM = {
  title: '', description: '', assigned_to: 'unassigned', sub_assignees: [],
  due_date: '', priority: 'medium', status: 'pending', category: 'other',
  client_id: '', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MetricCard — matches Dashboard card design exactly
// ═══════════════════════════════════════════════════════════════════════════════
const MetricCard = ({ label, value, sub, accent, icon: Icon, active, onClick, progress, isDark }) => (
  <motion.div
    whileHover={{ y: -3, transition: springPhysics.card }}
    whileTap={{ scale: 0.985 }}
    onClick={onClick}
    className={`rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border
      ${active
        ? 'ring-2'
        : ''
      }
      ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'}
    `}
    style={active ? { ringColor: accent, borderColor: accent } : {}}
  >
    <div className="p-4 flex flex-col justify-between min-h-[110px]">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 mr-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: accent }}>
            {value}
          </p>
          {sub && <p className="text-[10px] mt-0.5 text-slate-400">{sub}</p>}
        </div>
        <div
          className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      {progress !== undefined ? (
        <div className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${accent}, ${accent}bb)` }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
          />
        </div>
      ) : (
        <div className={`flex items-center gap-1 mt-3 text-xs font-medium group-hover:opacity-80 transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <span>{active ? '✓ filtered' : 'click to filter'}</span>
          <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      )}
    </div>
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// TeamTaskCard — matches other MetricCards exactly, proper alignment
// ═══════════════════════════════════════════════════════════════════════════════
const TeamTaskCard = ({ stats, hasCrossVisibility, usersLoading, filterTeamOnly, setFilterTeamOnly, setFilterAssignee, setShowMyTasksOnly, teamTaskBreakdown, isDark }) => (
  <motion.div
    whileHover={{ y: -3, transition: springPhysics.card }}
    whileTap={{ scale: 0.985 }}
    onClick={() => {
      if (!hasCrossVisibility || usersLoading) return;
      setFilterTeamOnly(prev => !prev);
      setFilterAssignee('all');
      setShowMyTasksOnly(false);
    }}
    className={`rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border
      ${filterTeamOnly
        ? isDark
          ? 'bg-violet-900/20 border-violet-700'
          : 'bg-violet-50/60 border-violet-300'
        : hasCrossVisibility && stats.teamTask > 0
          ? isDark
            ? 'bg-violet-900/10 border-violet-800 hover:border-violet-700'
            : 'bg-violet-50/40 border-violet-200 hover:border-violet-300'
          : isDark
            ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
            : 'bg-white border-slate-200/80 hover:border-slate-300'
      }
    `}
  >
    <div className="p-4 flex flex-col justify-between min-h-[110px]">
      {/* TOP ROW — identical layout to other cards */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 mr-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Team Task</p>
          
          <motion.p
            key={stats.teamTask}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-2xl font-bold mt-1 tracking-tight"
            style={{ color: hasCrossVisibility ? (isDark ? '#a78bfa' : '#7c3aed') : (isDark ? '#475569' : '#94a3b8') }}
          >
            {hasCrossVisibility ? stats.teamTask : 0}
          </motion.p>

          {/* Per-member breakdown — compact, matches dashboard */}
          {!usersLoading && hasCrossVisibility && teamTaskBreakdown.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {teamTaskBreakdown.slice(0, 2).map(m => (
                <p key={m.id} className="text-[9px] text-slate-400 truncate">
                  {m.name.split(' ')[0].toLowerCase()}: {m.pendingCount}
                </p>
              ))}
              {teamTaskBreakdown.length > 2 && (
                <p className="text-[9px] text-slate-400">+{teamTaskBreakdown.length - 2} more</p>
              )}
            </div>
          )}
          {!hasCrossVisibility && (
            <p className="text-[9px] text-slate-400 mt-0.5">no access</p>
          )}
        </div>

        {/* Icon — same size/style as other cards */}
        <div
          className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
          style={{ backgroundColor: hasCrossVisibility ? (isDark ? 'rgba(167,139,250,0.15)' : '#ede9fe') : (isDark ? 'rgba(71,85,105,0.2)' : '#f8fafc') }}
        >
          <Users className="h-4 w-4" style={{ color: hasCrossVisibility ? '#7c3aed' : (isDark ? '#475569' : '#cbd5e1') }} />
        </div>
      </div>

      {/* BOTTOM ROW — identical to other cards */}
      <div className={`flex items-center gap-1 mt-3 text-xs font-medium transition-colors ${hasCrossVisibility ? 'group-hover:text-violet-500' : ''} ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        {hasCrossVisibility ? (
          <>
            <span>{filterTeamOnly ? '✓ filtering team' : 'click to filter'}</span>
            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
           
          </>
        ) : (
          <span>cross visibility off</span>
        )}
      </div>
    </div>
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// TaskRow — unchanged logic, same compact list row
// ═══════════════════════════════════════════════════════════════════════════════
const TaskRow = ({
  task, index, isOverdue, statusStyle, priorityStyle, stripeColor,
  getUserName, getClientName, getRelativeDueDate, getChecklistProgress,
  parseChecklist, taskChecklists, toggleChecklistItem,
  canModifyTask, canDeleteTasks,
  handleEdit, handleDelete, handleDuplicateTask, handleQuickStatusChange,
  openTaskDetail, openCommentTaskId, setOpenCommentTaskId,
  fetchComments, comments, newComment, setNewComment,
  selectedTask, setSelectedTask, handleAddComment,
  user,
}) => {
  const isDark = useDark();
  const [expanded, setExpanded] = useState(false);
  const checklistItems = parseChecklist(task.description);
  const checkedItems   = taskChecklists[task.id] || [];
  const progress       = getChecklistProgress(task);
  const isCompleted    = task.status === 'completed';

  return (
    <motion.div variants={itemVariants} layout>
      <div className={`relative rounded-xl border transition-all duration-200 overflow-hidden group
        ${isCompleted
          ? (isDark ? 'bg-slate-800/60 border-slate-700 opacity-70' : 'bg-slate-50 border-slate-200 opacity-70')
          : (isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm')}`}>

        <div className={`absolute left-0 top-0 h-full w-1 ${stripeColor}`} />

        <div
          className="pl-5 pr-3 py-2.5 grid items-center gap-0"
          style={{ gridTemplateColumns: '24px 24px minmax(0,1fr) 160px 88px 64px 72px 110px 110px 88px 100px' }}
        >
          <span className="text-[11px] font-medium text-slate-400 select-none">
            {String(index + 1).padStart(2, '0')}
          </span>

          <button
            onClick={() => {
              const next = task.status === 'pending' ? 'in_progress'
                : task.status === 'in_progress' ? 'completed' : 'pending';
              handleQuickStatusChange(task, next);
            }}
            className="flex items-center justify-center"
            title="Cycle status"
          >
            <span className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center hover:border-blue-400 transition-colors">
              {task.status === 'completed'   && <Check className="h-2.5 w-2.5 text-blue-600" />}
              {task.status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </span>
          </button>

          <button
            className={`min-w-0 text-left font-medium truncate transition-colors pl-1 pr-2 text-sm
              ${isCompleted
                ? 'text-slate-400 line-through'
                : (isDark ? 'text-slate-100 hover:text-blue-400' : 'text-slate-800 hover:text-blue-700')}`}
            onClick={() => openTaskDetail(task)}
          >
            {task.title}
          </button>

          <div className="flex items-center justify-center gap-1 overflow-hidden">
            {canModifyTask(task) ? (
              <>
                {[
                  { s: 'pending',     label: 'To Do', active: 'bg-red-500 text-white border-red-500',     idle: isDark ? 'bg-slate-700 text-slate-400 border-slate-600 hover:border-red-400 hover:text-red-400'    : 'bg-white text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500' },
                  { s: 'in_progress', label: 'WIP',   active: 'bg-amber-500 text-white border-amber-500', idle: isDark ? 'bg-slate-700 text-slate-400 border-slate-600 hover:border-amber-400 hover:text-amber-400' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-300 hover:text-amber-500' },
                  { s: 'completed',   label: 'Done',  active: 'bg-blue-600 text-white border-blue-600',   idle: isDark ? 'bg-slate-700 text-slate-400 border-slate-600 hover:border-blue-400 hover:text-blue-400'   : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300 hover:text-blue-500' },
                ].map(({ s, label, active, idle }) => (
                  <button key={s} onClick={() => handleQuickStatusChange(task, s)}
                    className={`h-[20px] px-2 text-[9px] font-semibold tracking-wide rounded border transition-all whitespace-nowrap
                      ${task.status === s ? active : idle}`}>
                    {label}
                  </button>
                ))}
              </>
            ) : (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center overflow-hidden">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-full">
              {task.category?.toUpperCase() || 'OTHER'}
            </span>
          </div>

          <div className="flex items-center justify-center overflow-hidden">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${priorityStyle.bg} ${priorityStyle.text}`}>
              {priorityStyle.label}
            </span>
          </div>

          <div className="flex items-center justify-center overflow-hidden">
            {isOverdue ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 whitespace-nowrap">OVERDUE</span>
            ) : (
              <span className="text-slate-200 text-[10px]">—</span>
            )}
          </div>

          <div className="flex items-center justify-start gap-1 overflow-hidden px-1">
            <User className="h-3 w-3 flex-shrink-0 text-slate-400" />
            <span className="text-[10px] text-slate-600 truncate">{getUserName(task.assigned_to)}</span>
          </div>

          <div className="flex items-center justify-start gap-1 overflow-hidden px-1">
            <User className="h-3 w-3 flex-shrink-0 text-slate-300" />
            <span className="text-[10px] text-slate-400 truncate">
              {task.created_by ? getUserName(task.created_by) : '—'}
            </span>
          </div>

          <div className={`flex items-center justify-center gap-1 overflow-hidden px-1 ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
            {task.due_date ? (
              <>
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span className="text-[10px] font-medium truncate">{getRelativeDueDate(task.due_date)}</span>
              </>
            ) : <span className="text-slate-300 text-[10px]">—</span>}
          </div>

          <div className="flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity overflow-hidden">
            {canModifyTask(task) && (
              <button onClick={() => setExpanded(v => !v)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Expand">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            {canModifyTask(task) && (
              <button onClick={() => handleEdit(task)}
                className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                <Edit className="h-3.5 w-3.5" />
              </button>
            )}
            {canModifyTask(task) && (
              <button onClick={() => handleDuplicateTask(task)}
                className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Duplicate">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {canModifyTask(task) && (
              <button onClick={() => { setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id); fetchComments(task.id); }}
                className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors" title="Comments">
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            )}
            {canDeleteTasks && (
              <button onClick={() => handleDelete(task.id)}
                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {(expanded || openCommentTaskId === task.id) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className={`mx-5 mb-4 space-y-3 border-t pt-3 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                {checklistItems.length > 0 && (
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" /> Compliance Checklist
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {checkedItems.length}/{checklistItems.length}
                      </span>
                    </div>
                    <div className="h-1 bg-emerald-200 rounded-full mb-3 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {checklistItems.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2 cursor-pointer group/check">
                          <Checkbox checked={checkedItems.includes(idx)} onCheckedChange={() => toggleChecklistItem(task.id, idx)} className="mt-0.5 flex-shrink-0" />
                          <span className={`text-xs leading-relaxed ${checkedItems.includes(idx) ? 'line-through text-slate-400' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>
                            {item}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {openCommentTaskId === task.id && (
                  <div className="space-y-2">
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {(comments[task.id] || []).map((comment, i) => (
                        <div key={i} className={`text-xs rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                          {comment.text}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment…" className="h-8 text-xs"
                        onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedTask(task); handleAddComment(); } }} />
                      <Button size="sm" className="h-8 px-3 text-xs" onClick={() => { setSelectedTask(task); handleAddComment(); }}>Post</Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// BoardCard — unchanged
// ═══════════════════════════════════════════════════════════════════════════════
const BoardCard = ({
  task, index, isOverdue, stripeColor, statusStyle, priorityStyle,
  getUserName, getClientName, getRelativeDueDate, getChecklistProgress,
  parseChecklist, taskChecklists, toggleChecklistItem,
  canModifyTask, canDeleteTasks,
  handleEdit, handleDelete, handleDuplicateTask, handleQuickStatusChange,
  openTaskDetail, openCommentTaskId, setOpenCommentTaskId,
  fetchComments, comments, newComment, setNewComment,
  selectedTask, setSelectedTask, handleAddComment,
}) => {
  const isDark = useDark();
  const checklistItems = parseChecklist(task.description);
  const checkedItems   = taskChecklists[task.id] || [];
  const progress       = getChecklistProgress(task);
  const isCompleted    = task.status === 'completed';

  return (
    <motion.div variants={itemVariants} layout>
      <div className={`relative rounded-xl border overflow-hidden transition-all duration-200 group
        ${isCompleted
          ? (isDark ? 'bg-slate-800/60 border-slate-700 opacity-75' : 'bg-slate-50 border-slate-200 opacity-75')
          : (isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md')}`}>

        <div className={`h-1 w-full ${stripeColor}`} />

        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => openTaskDetail(task)}
              className={`font-semibold text-sm leading-snug text-left flex-1 transition-colors
                ${isCompleted ? 'text-slate-400 line-through' : (isDark ? 'text-slate-100 hover:text-blue-400' : 'text-slate-800 hover:text-blue-700')}`}>
              {task.title}
            </button>
            {canModifyTask(task) && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => handleEdit(task)} className="p-1 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDuplicateTask(task)} className="p-1 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {canDeleteTasks && (
                  <button onClick={() => handleDelete(task.id)} className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${priorityStyle.bg} ${priorityStyle.text}`}>
              {priorityStyle.label}
            </span>
            {isOverdue && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-red-100 text-red-700">Overdue</span>}
            {task.is_recurring && <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">↺ Recurring</span>}
            {task.category && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{task.category}</span>}
          </div>

          {checklistItems.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-emerald-700">CHECKLIST</span>
                <span className="text-[10px] font-bold text-emerald-600">{checkedItems.length}/{checklistItems.length}</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className={`pt-2 border-t space-y-1.5 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{getUserName(task.assigned_to)}</span>
              </div>
              {task.due_date && (
                <span className={`text-xs font-medium flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {getRelativeDueDate(task.due_date)}
                </span>
              )}
            </div>
          </div>

          {canModifyTask(task) && (
            <div className="grid grid-cols-3 gap-1 pt-1">
              {[
                { s: 'pending',     label: 'To Do', active: 'bg-red-500 text-white border-red-500' },
                { s: 'in_progress', label: 'WIP',   active: 'bg-amber-500 text-white border-amber-500' },
                { s: 'completed',   label: 'Done',  active: 'bg-blue-600 text-white border-blue-600' },
              ].map(({ s, label, active }) => (
                <button key={s} onClick={() => handleQuickStatusChange(task, s)}
                  className={`h-6 text-[10px] font-semibold rounded-lg border transition-all
                    ${task.status === s ? active : (isDark ? 'bg-slate-700 border-slate-600 text-slate-400' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {canModifyTask(task) && (
            <button
              onClick={() => { setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id); fetchComments(task.id); }}
              className={`w-full flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-indigo-600 py-1 rounded-lg transition-colors border border-dashed
                ${isDark ? 'border-slate-600 hover:bg-indigo-900/30' : 'border-slate-200 hover:bg-indigo-50'}`}>
              <MessageSquare className="h-3 w-3" />
              {openCommentTaskId === task.id ? 'Close Comments' : 'Add Comment'}
            </button>
          )}

          {openCommentTaskId === task.id && (
            <div className="space-y-2">
              <div className="max-h-24 overflow-y-auto space-y-1">
                {(comments[task.id] || []).map((c, i) => (
                  <div key={i} className={`text-[10px] rounded-lg px-2 py-1.5 border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                    {c.text}
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Comment…" className="h-7 text-xs"
                  onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedTask(task); handleAddComment(); } }} />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { setSelectedTask(task); handleAddComment(); }}>Post</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Tasks Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function Tasks() {

  const storedUser = React.useMemo(() => {
    try { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; } catch { return null; }
  }, []);

  const user = storedUser || { id: '', full_name: 'User', role: 'staff', permissions: { view_other_tasks: [], can_view_all_tasks: false } };
  const hasPermission = () => true;
  const navigate = (path) => { window.location.href = path; };

  const RAW_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'https://final-taskosphere-backend.onrender.com';
  const API_BASE = RAW_URL.replace(/\/api\/?$/, '') + '/api';

  const getAuthHeader = React.useCallback(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const apiFetch = React.useCallback(async (endpoint) => {
    try {
      const res = await api.get(endpoint);
      return res.data;
    } catch (err) {
      console.error(`apiFetch ${endpoint} failed:`, err?.response?.status, err?.response?.data?.detail || err.message);
      return null;
    }
  }, []);

  const isAdmin = user?.role === 'admin';
  const isDark  = useDark();

  const canModifyTask = (task) => {
    if (isAdmin) return true;
    return task.assigned_to === user?.id || task.sub_assignees?.includes(user?.id) || task.created_by === user?.id;
  };
  const canAssignTasks = hasPermission('can_assign_tasks');
  const canEditTasks   = hasPermission('can_edit_tasks');
  const canDeleteTasks = isAdmin || hasPermission('can_edit_tasks');

  // ── Core state ────────────────────────────────────────────────────────────
  const [tasks,          setTasks]          = useState([]);
  const [users,          setUsers]          = useState([]);
  const [clients,        setClients]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult,   setReminderResult]   = useState(null); // { emails_sent, emails_failed, total_users }
  const [dataLoading,    setDataLoading]    = useState(true);
  const [usersLoading,   setUsersLoading]   = useState(true);
  const [filterTeamOnly,      setFilterTeamOnly]      = useState(false);
  const [filterAssignedByMe,  setFilterAssignedByMe]  = useState(false);
  const [filterCreatedBy,     setFilterCreatedBy]     = useState('all');
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateGroups,     setDuplicateGroups]     = useState([]);
  const [detectingDuplicates, setDetectingDuplicates] = useState(false);
  const [compareTaskIds,      setCompareTaskIds]       = useState([]);
  const [compareMode,         setCompareMode]          = useState(false);

  const [dialogOpen,         setDialogOpen]         = useState(false);
  const [editingTask,        setEditingTask]         = useState(null);
  const [formData,           setFormData]           = useState({ ...EMPTY_FORM });
  const [viewMode,           setViewMode]           = useState('list');
  const [taskDetailOpen,     setTaskDetailOpen]     = useState(false);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);
  const [comments,           setComments]           = useState({});
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [selectedTask,       setSelectedTask]       = useState(null);
  const [newComment,         setNewComment]         = useState('');
  const [openCommentTaskId,  setOpenCommentTaskId]  = useState(null);
  const [notifications,      setNotifications]      = useState([]);
  const [showNotifications,  setShowNotifications]  = useState(false);

  const [searchQuery,             setSearchQuery]             = useState('');
  const [filterStatus,            setFilterStatus]            = useState('all');
  const [filterPriority,          setFilterPriority]          = useState('all');
  const [filterCategory,          setFilterCategory]          = useState('all');
  const [filterAssignee,          setFilterAssignee]          = useState('all');
  const [sortBy,                  setSortBy]                  = useState('due_date');
  const [sortDirection,           setSortDirection]           = useState('asc');
  const [showMyTasksOnly,         setShowMyTasksOnly]         = useState(false);
  const [activeFilters,           setActiveFilters]           = useState([]);
  const [taskChecklists,          setTaskChecklists]          = useState({});
  const [showWorkflowLibrary,     setShowWorkflowLibrary]     = useState(false);
  const [workflowSearch,          setWorkflowSearch]          = useState('');
  const [workflowDeptFilter,      setWorkflowDeptFilter]      = useState('all');
  const [workflowFrequencyFilter, setWorkflowFrequencyFilter] = useState('all');

  const fileInputRef = useRef(null);

  const hasCrossVisibility = React.useMemo(() => {
    if (isAdmin) return true;
    const perms = user?.permissions || {};
    return (perms.view_other_tasks && perms.view_other_tasks.length > 0) || perms.can_view_all_tasks === true;
  }, [isAdmin, user]);

  const crossVisibilityUserIds = React.useMemo(() => {
    if (isAdmin) {
      return [...new Set(tasks.map(t => t.assigned_to).filter(id => id && id !== user?.id))];
    }
    const perms = user?.permissions || {};
    return (perms.view_other_tasks || []).filter(id => id !== user?.id);
  }, [isAdmin, user, users, tasks]);

  const visibleUsers = React.useMemo(() => {
    if (isAdmin) return users;
    if (hasCrossVisibility) {
      const ids = new Set([user?.id, ...crossVisibilityUserIds]);
      return users.filter(u => ids.has(u.id));
    }
    return users.filter(u => u.id === user?.id);
  }, [isAdmin, hasCrossVisibility, crossVisibilityUserIds, users, user]);

  // Users who have created tasks that the current user can see — respects permission scope
  const visibleCreators = React.useMemo(() => {
    if (isAdmin) return users; // admin sees everyone
    // For non-admin: only show creators whose tasks are in scopedTasks
    const creatorIds = new Set(
      tasks
        .filter(t => {
          // same scope check as scopedTasks
          const visibleIds = new Set([user?.id, ...crossVisibilityUserIds]);
          return visibleIds.has(t.assigned_to) || t.sub_assignees?.some(id => visibleIds.has(id)) || t.created_by === user?.id;
        })
        .map(t => t.created_by)
        .filter(Boolean)
    );
    return users.filter(u => creatorIds.has(u.id));
  }, [isAdmin, users, tasks, user, crossVisibilityUserIds]);

  useEffect(() => {
    const loadAll = async () => {
      setDataLoading(true);
      try {
        const tasksData = await apiFetch('/tasks');
        if (Array.isArray(tasksData)) setTasks(tasksData);
      } catch (e) { console.error('Tasks wave-1 fetch error:', e); }
      setDataLoading(false);
      try {
        const [usersData, clientsData] = await Promise.all([apiFetch('/users'), apiFetch('/clients')]);
        if (Array.isArray(usersData))   { setUsers(usersData);   setUsersLoading(false); }
        if (Array.isArray(clientsData))   setClients(clientsData);
      } catch (e) { console.error('Tasks wave-2 fetch error:', e); setUsersLoading(false); }
    };
    loadAll();
  }, [apiFetch]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const parseChecklist = (description) => {
    if (!description) return [];
    return description.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('•')).map(l => l.replace(/^[-•]\s*/, '').trim());
  };
  const toggleChecklistItem = (taskId, index) => {
    setTaskChecklists(prev => {
      const current = prev[taskId] || [];
      const next = current.includes(index) ? current.filter(i => i !== index) : [...current, index];
      return { ...prev, [taskId]: next };
    });
  };
  const getChecklistProgress = (task) => {
    const items = parseChecklist(task.description);
    if (!items.length) return 0;
    return Math.round(((taskChecklists[task.id] || []).length / items.length) * 100);
  };
  const getUserName      = (id) => users.find(u => u.id === id)?.full_name || 'Unassigned';
  const getClientName    = (id) => clients.find(c => c.id === id)?.company_name || 'No Client';
  const getCategoryLabel = (v)  => TASK_CATEGORIES.find(c => c.value === v)?.label || v || 'Other';
  const isOverdue = (task) => { if (task.status === 'completed' || !task.due_date) return false; return new Date(task.due_date) < new Date(); };
  const getDisplayStatus = (task) => isOverdue(task) ? 'overdue' : task.status || 'pending';
  const getRelativeDueDate = (dueDate) => {
    if (!dueDate) return '';
    const due = new Date(dueDate); const now = new Date(); const diffDays = Math.ceil((due - now) / 86400000);
    if (diffDays < 0)   return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7)  return `In ${diffDays}d`;
    return format(due, 'MMM dd');
  };
  const openTaskDetail = (task) => { setSelectedDetailTask(task); setTaskDetailOpen(true); };
  const resetForm = () => { setFormData({ ...EMPTY_FORM }); setEditingTask(null); };
  const toggleSubAssignee = (userId) => {
    setFormData(prev => ({ ...prev, sub_assignees: prev.sub_assignees.includes(userId) ? prev.sub_assignees.filter(id => id !== userId) : [...prev.sub_assignees, userId] }));
  };
  const markAllAsRead = () => { setNotifications(p => p.map(n => ({ ...n, is_read: true }))); toast.success('Marked all as read'); };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    const taskData = { ...formData, assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to, sub_assignees: formData.sub_assignees || [], client_id: formData.client_id || null, due_date: formData.due_date || null };
    try {
      if (editingTask) {
        const res = await fetch(`${API_BASE}/tasks/${editingTask.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(taskData) });
        if (res.ok) { const updated = await res.json(); setTasks(prev => prev.map(t => t.id === editingTask.id ? updated : t)); toast.success('Task updated!'); }
        else toast.error('Failed to update task');
      } else {
        const res = await fetch(`${API_BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(taskData) });
        if (res.ok) { const created = await res.json(); setTasks(prev => [created, ...prev]); toast.success('Task created!'); }
        else toast.error('Failed to create task');
      }
    } catch { toast.error('Network error'); }
    setDialogOpen(false); resetForm(); setLoading(false);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({ title: task.title, description: task.description || '', assigned_to: task.assigned_to || 'unassigned', sub_assignees: task.sub_assignees || [], due_date: task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '', priority: task.priority, status: task.status, category: task.category || 'other', client_id: task.client_id || '', is_recurring: task.is_recurring || false, recurrence_pattern: task.recurrence_pattern || 'monthly', recurrence_interval: task.recurrence_interval || 1 });
    setDialogOpen(true);
  };

  const handleAddToReminder = async (task) => {
    try {
      await api.post('/email/save-as-reminder', {
        title: `Task: ${task.title}`,
        description: task.description || '',
        remind_at: task.due_date ? new Date(task.due_date).toISOString() : new Date(Date.now() + 86400000).toISOString(),
      });
      toast.success('Added to Reminders!');
    } catch { toast.error('Failed to add reminder'); }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE', headers: { ...getAuthHeader() } });
      if (res.ok) { setTasks(prev => prev.filter(t => t.id !== taskId)); toast.success('Task deleted!'); }
      else toast.error('Failed to delete task');
    } catch { toast.error('Network error'); }
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await fetch(`${API_BASE}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ status: newStatus }) });
      toast.success(`Marked as ${STATUS_STYLES[newStatus]?.label || newStatus}`);
    } catch { toast.error('Network error'); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const taskId = selectedTask?.id; if (!taskId) return;
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ text: newComment }) });
      if (res.ok) { const comment = await res.json(); setComments(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), comment] })); setNewComment(''); toast.success('Comment added!'); }
    } catch { toast.error('Network error'); }
  };

  const fetchComments = async (taskId) => {
    const data = await apiFetch(`/tasks/${taskId}/comments`);
    setComments(prev => ({ ...prev, [taskId]: Array.isArray(data) ? data : (prev[taskId] || []) }));
  };

  const handleDuplicateTask = async (task) => {
    const { id, created_at, updated_at, ...rest } = task;
    try {
      const res = await fetch(`${API_BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ ...rest, title: `${task.title} (Copy)`, status: 'pending' }) });
      if (res.ok) { const created = await res.json(); setTasks(prev => [created, ...prev]); toast.success('Task duplicated!'); }
    } catch { toast.error('Network error'); }
  };

  // ── Enhanced local duplicate detection — deep field-level comparison ──
  const detectDuplicatesLocally = (taskList) => {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Jaccard similarity on word tokens (length > 2)
    const similarity = (a, b) => {
      const wa = new Set(norm(a).split(' ').filter(w => w.length > 2));
      const wb = new Set(norm(b).split(' ').filter(w => w.length > 2));
      if (!wa.size || !wb.size) return 0;
      let inter = 0;
      wa.forEach(w => { if (wb.has(w)) inter++; });
      return inter / (wa.size + wb.size - inter);
    };

    // Trigram similarity for short strings like client names
    const trigramSim = (a, b) => {
      const trig = (s) => { const r = new Set(); for (let i = 0; i < s.length - 2; i++) r.add(s.slice(i, i + 3)); return r; };
      const sa = trig(norm(a)), sb = trig(norm(b));
      if (!sa.size || !sb.size) return 0;
      let inter = 0;
      sa.forEach(t => { if (sb.has(t)) inter++; });
      return inter / (sa.size + sb.size - inter);
    };

    // Strip common CA/legal suffixes for smarter title matching
    const normTitle = (s) => norm(s)
      .replace(/\b(pvt|ltd|llp|private|limited|inc|corp|gst|registration|filing|return|application|document|compliance|annual)\b/g, '')
      .replace(/\s+/g, ' ').trim();

    const groups = [];
    const used   = new Set();

    taskList.forEach((t1, i) => {
      if (used.has(t1.id)) return;
      const group   = [t1.id];
      const reasons = [];

      taskList.forEach((t2, j) => {
        if (i === j || used.has(t2.id)) return;

        const titleSim     = similarity(t1.title, t2.title);
        const titleNormSim = similarity(normTitle(t1.title), normTitle(t2.title));
        const descSim      = similarity(t1.description, t2.description);
        const exactTitle   = norm(t1.title) === norm(t2.title);
        const sameCategory = t1.category && t2.category && t1.category === t2.category;
        const sameClient   = t1.client_id && t2.client_id && t1.client_id === t2.client_id;
        const sameAssignee = t1.assigned_to && t2.assigned_to && t1.assigned_to === t2.assigned_to;
        const samePriority = t1.priority === t2.priority;
        const sameDueDate  = t1.due_date && t2.due_date &&
          new Date(t1.due_date).toDateString() === new Date(t2.due_date).toDateString();

        // Score composite: weighted combination of signals
        let score = 0;
        score += titleSim * 50;           // raw title similarity 0-50
        score += titleNormSim * 20;       // normalised title (strips legal words) 0-20
        score += descSim * 15;            // description similarity 0-15
        if (sameCategory) score += 8;
        if (sameClient)   score += 10;
        if (sameAssignee) score += 4;
        if (samePriority) score += 3;
        if (sameDueDate)  score += 5;

        // Build human-readable reason
        const reasonParts = [];
        if (exactTitle) reasonParts.push('Exact title match');
        else if (titleSim > 0.7) reasonParts.push(`Title ${Math.round(titleSim * 100)}% similar`);
        else if (titleNormSim > 0.7) reasonParts.push(`Core title ${Math.round(titleNormSim * 100)}% similar`);
        if (sameClient)   reasonParts.push(`same client`);
        if (sameCategory) reasonParts.push(`same dept (${(t1.category || '').toUpperCase()})`);
        if (sameDueDate)  reasonParts.push(`same due date`);
        if (descSim > 0.5) reasonParts.push(`description ${Math.round(descSim * 100)}% similar`);

        // Thresholds — exact title = always flag; score >= 55 = high; >= 40 = medium
        const isDuplicate = exactTitle || score >= 40;
        if (!isDuplicate) return;

        group.push(t2.id);
        const conf = exactTitle || score >= 65 ? 'high' : 'medium';
        reasons.push({ id: t2.id, conf, score: Math.round(score), reasonParts });
      });

      if (group.length > 1) {
        const maxConf    = reasons.some(r => r.conf === 'high') ? 'high' : 'medium';
        const topReason  = reasons[0]?.reasonParts?.join(' · ') || 'Similar tasks detected';
        groups.push({
          reason: topReason,
          confidence: maxConf,
          task_ids: group.map(String),
          source: 'local',
        });
        group.forEach(id => used.add(id));
      }
    });

    return groups;
  };

  const handleDetectDuplicates = async () => {
    if (detectingDuplicates) return;
    setDetectingDuplicates(true);
    setDuplicateGroups([]);

    // ── 1. Try AI (Gemini via backend) first ──────────────────────────────
    try {
      const res = await fetch(`${API_BASE}/tasks/detect-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
      const data   = await res.json();
      const groups = Array.isArray(data.groups) ? data.groups : [];
      setDuplicateGroups(groups.map(g => ({ ...g, source: 'ai' })));
      setShowDuplicateDialog(true);
      if (!groups.length) {
        toast.success(`AI scanned ${data.total_tasks_scanned} tasks — no duplicates found ✓`);
      } else {
        toast.info(`AI found ${groups.length} duplicate group${groups.length !== 1 ? 's' : ''}`);
      }
      setDetectingDuplicates(false);
      return; // AI succeeded — done
    } catch (aiErr) {
      console.warn('AI duplicate detection unavailable, using local algorithm:', aiErr.message);
    }

    // ── 2. Local fallback — runs in browser, works offline ────────────────
    try {
      const localGroups = detectDuplicatesLocally(scopedTasks);
      setDuplicateGroups(localGroups);
      setShowDuplicateDialog(true);
      if (!localGroups.length) {
        toast.success(`Local scan of ${scopedTasks.length} tasks — no duplicates found ✓`);
      } else {
        toast.info(
          `Found ${localGroups.length} duplicate group${localGroups.length !== 1 ? 's' : ''} (local scan — AI unavailable)`,
          { duration: 5000 }
        );
      }
    } catch (localErr) {
      toast.error('Duplicate detection failed. Please try again.', { duration: 5000 });
      console.error('Local duplicate detection error:', localErr);
    } finally {
      setDetectingDuplicates(false);
    }
  };

  const handleCsvUpload = () => { toast.success('CSV upload (stub)'); };
  const handleExportCsv = () => { toast.success('Exporting CSV (stub)'); };
  const handleExportPdf = () => { toast.success('Exporting PDF (stub)'); };

  const handleSendReminders = async () => {
    if (!window.confirm('Send pending task reminder emails to all assigned staff now?')) return;
    setSendingReminders(true);
    setReminderResult(null);
    try {
      const res = await api.post('/send-pending-task-reminders');
      const { emails_sent = 0, emails_failed = [], total_users = 0 } = res.data || {};
      setReminderResult({ emails_sent, emails_failed, total_users });
      if (emails_sent > 0) {
        toast.success(`✓ Reminder emails sent to ${emails_sent} of ${total_users} staff member${total_users !== 1 ? 's' : ''}`);
      } else if (total_users === 0) {
        toast.info('No pending tasks found — nothing to remind.');
      } else {
        toast.error(`All ${emails_failed.length} reminder email(s) failed. Check SENDGRID_API_KEY.`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to send reminders');
    } finally {
      setSendingReminders(false);
    }
  };

  // ── Scoping & stats ───────────────────────────────────────────────────────
  const scopedTasks = React.useMemo(() => {
    if (isAdmin) return tasks;
    if (hasCrossVisibility) {
      const visibleIds = new Set([user?.id, ...crossVisibilityUserIds]);
      return tasks.filter(t => visibleIds.has(t.assigned_to) || t.sub_assignees?.some(id => visibleIds.has(id)));
    }
    return tasks.filter(t => t.assigned_to === user?.id || t.sub_assignees?.includes(user?.id) || t.created_by === user?.id);
  }, [tasks, isAdmin, hasCrossVisibility, user, crossVisibilityUserIds]);

  const myTasks = React.useMemo(() => tasks.filter(t => t.assigned_to === user?.id || t.sub_assignees?.includes(user?.id)), [tasks, user]);

  const stats = {
    myTask:     myTasks.length,
    total:      scopedTasks.length,
    todo:       scopedTasks.filter(t => t.status === 'pending').length,
    inProgress: scopedTasks.filter(t => t.status === 'in_progress').length,
    completed:  scopedTasks.filter(t => t.status === 'completed').length,
    overdue:    scopedTasks.filter(t => isOverdue(t)).length,
    teamTask:   hasCrossVisibility ? tasks.filter(t => { const isIncomplete = t.status !== 'completed'; const isMyTask = t.assigned_to === user?.id || (t.sub_assignees || []).includes(user?.id); const isCrossTask = crossVisibilityUserIds.includes(t.assigned_to) || (t.sub_assignees || []).some(id => crossVisibilityUserIds.includes(id)); return isIncomplete && (isMyTask || isCrossTask); }).length : 0,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const hasActiveFilters = activeFilters.length > 0;

  const teamTaskBreakdown = React.useMemo(() => {
    if (!hasCrossVisibility) return [];
    const allUids = [...new Set([user?.id, ...crossVisibilityUserIds].filter(Boolean))];
    return allUids.map(uid => {
      const member = users.find(u => u.id === uid);
      const nameFromTask = tasks.find(t => t.assigned_to === uid)?.assigned_to_name;
      const pendingCount = tasks.filter(t => (t.assigned_to === uid || (t.sub_assignees || []).includes(uid)) && t.status !== 'completed').length;
      const label = uid === user?.id ? (member?.full_name || 'Me') : (member?.full_name || nameFromTask || 'Unknown');
      return { id: uid, name: label, pendingCount };
    }).filter(m => m.pendingCount > 0);
  }, [hasCrossVisibility, crossVisibilityUserIds, tasks, users, user?.id]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredTasks = scopedTasks.filter(task => {
    const matchesSearch   = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = filterPriority === 'all' || task.priority   === filterPriority;
    const matchesCategory = filterCategory === 'all' || task.category   === filterCategory;
    const matchesAssignee = filterAssignee === 'all' || task.assigned_to === filterAssignee;
    const matchesTeam     = !filterTeamOnly || task.assigned_to === user?.id || (task.sub_assignees || []).includes(user?.id) || crossVisibilityUserIds.includes(task.assigned_to) || (task.sub_assignees || []).some(id => crossVisibilityUserIds.includes(id));
    let matchesStatus = true;
    if (filterStatus !== 'all') matchesStatus = filterStatus === 'overdue' ? isOverdue(task) : task.status === filterStatus;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee && matchesTeam;
  });

  // ── displayTasks must be defined BEFORE filteredStats ────────────────────
  const displayTasks = React.useMemo(() => {
    let result = [...filteredTasks];
    if (showMyTasksOnly && user?.id) result = result.filter(t => t.assigned_to === user.id || t.sub_assignees?.includes(user.id));
    if (filterAssignedByMe && user?.id) result = result.filter(t => t.created_by === user.id);
    if (filterCreatedBy !== 'all') result = result.filter(t => t.created_by === filterCreatedBy);
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'due_date') { const dA = a.due_date ? new Date(a.due_date).getTime() : Infinity; const dB = b.due_date ? new Date(b.due_date).getTime() : Infinity; cmp = dA - dB; }
      else if (sortBy === 'priority') { const prioOrder = { critical: 4, high: 3, medium: 2, low: 1 }; cmp = (prioOrder[b.priority] || 0) - (prioOrder[a.priority] || 0); }
      else if (sortBy === 'title')  cmp = a.title.localeCompare(b.title);
      else if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '');
      else if (sortBy === 'created_date') { const dA = a.created_at ? new Date(a.created_at).getTime() : 0; const dB = b.created_at ? new Date(b.created_at).getTime() : 0; cmp = dA - dB; }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [filteredTasks, showMyTasksOnly, sortBy, sortDirection, user, filterAssignedByMe, filterCreatedBy]);

  // ── Live filtered stats — recomputed from displayTasks whenever filters change ──
  const filteredStats = React.useMemo(() => {
    const list = displayTasks; // already fully filtered + sorted
    const todoFiltered  = list.filter(t => t.status === 'pending');
    const wipFiltered   = list.filter(t => t.status === 'in_progress');
    const doneFiltered  = list.filter(t => t.status === 'completed');
    const overdueList   = list.filter(t => isOverdue(t));
    const teamFiltered  = hasCrossVisibility
      ? list.filter(t => {
          const isIncomplete = t.status !== 'completed';
          const isMyTask = t.assigned_to === user?.id || (t.sub_assignees || []).includes(user?.id);
          const isCrossTask = crossVisibilityUserIds.includes(t.assigned_to) || (t.sub_assignees || []).some(id => crossVisibilityUserIds.includes(id));
          return isIncomplete && (isMyTask || isCrossTask);
        })
      : [];
    const filteredCompletionRate = list.length > 0 ? Math.round((doneFiltered.length / list.length) * 100) : 0;

    // When a creator filter is active (filterCreatedBy or filterAssignedByMe),
    // "assigned" card shows tasks assigned BY that creator TO others (not self)
    const creatorId = filterAssignedByMe ? user?.id : (filterCreatedBy !== 'all' ? filterCreatedBy : null);
    const assignedByCreator = creatorId
      ? list.filter(t => t.created_by === creatorId && t.assigned_to !== creatorId)
      : list.filter(t => t.assigned_to === user?.id || t.sub_assignees?.includes(user?.id));

    return {
      total:          list.length,
      myTask:         assignedByCreator.length,
      todo:           todoFiltered.length,
      inProgress:     wipFiltered.length,
      completed:      doneFiltered.length,
      overdue:        overdueList.length,
      teamTask:       teamFiltered.length,
      completionRate: filteredCompletionRate,
    };
  }, [displayTasks, user, isOverdue, hasCrossVisibility, crossVisibilityUserIds, filterAssignedByMe, filterCreatedBy]);

  // Human-readable filter context for the live card subheadings
  const filterContextLabel = React.useMemo(() => {
    const parts = [];
    if (searchQuery)              parts.push(`"${searchQuery}"`);
    if (filterStatus !== 'all')   parts.push(STATUS_STYLES[filterStatus]?.label || filterStatus);
    if (filterPriority !== 'all') parts.push(filterPriority.toUpperCase());
    if (filterCategory !== 'all') parts.push(getCategoryLabel(filterCategory));
    if (filterAssignee !== 'all') parts.push(users.find(u => u.id === filterAssignee)?.full_name || '');
    if (showMyTasksOnly)          parts.push('Mine');
    if (filterTeamOnly)           parts.push('Team');
    if (filterAssignedByMe)       parts.push('By Me');
    if (filterCreatedBy !== 'all') parts.push(`By ${users.find(u => u.id === filterCreatedBy)?.full_name || ''}`);
    return parts.filter(Boolean).join(' · ');
  }, [searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, showMyTasksOnly, filterTeamOnly, filterAssignedByMe, filterCreatedBy, users]);

  useEffect(() => {
    const pills = [];
    if (searchQuery)              pills.push({ key: 'search',   label: `"${searchQuery}"` });
    if (filterStatus !== 'all')   pills.push({ key: 'status',   label: STATUS_STYLES[filterStatus]?.label || filterStatus });
    if (filterPriority !== 'all') pills.push({ key: 'priority', label: filterPriority.toUpperCase() });
    if (filterCategory !== 'all') pills.push({ key: 'category', label: getCategoryLabel(filterCategory) });
    if (filterAssignee !== 'all') pills.push({ key: 'assignee', label: users.find(u => u.id === filterAssignee)?.full_name || filterAssignee });
    if (showMyTasksOnly)          pills.push({ key: 'mytasks',     label: 'Assigned To Me' });
    if (filterTeamOnly)           pills.push({ key: 'teamonly',    label: 'Team Tasks' });
    if (filterAssignedByMe)       pills.push({ key: 'assignedby',  label: 'Assigned by Me' });
    if (filterCreatedBy !== 'all') pills.push({ key: 'createdby', label: `By: ${users.find(u => u.id === filterCreatedBy)?.full_name || filterCreatedBy}` });
    setActiveFilters(pills);
  }, [searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, showMyTasksOnly, filterTeamOnly, filterAssignedByMe, filterCreatedBy, users]);

  const removeFilter = (key) => {
    if (key === 'search')   setSearchQuery('');
    if (key === 'status')   setFilterStatus('all');
    if (key === 'priority') setFilterPriority('all');
    if (key === 'category') setFilterCategory('all');
    if (key === 'assignee') setFilterAssignee('all');
    if (key === 'mytasks')     setShowMyTasksOnly(false);
    if (key === 'teamonly')    setFilterTeamOnly(false);
    if (key === 'assignedby') setFilterAssignedByMe(false);
    if (key === 'createdby')  setFilterCreatedBy('all');
  };

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all'); setFilterCategory('all'); setFilterAssignee('all');
    setShowMyTasksOnly(false); setFilterTeamOnly(false); setFilterAssignedByMe(false); setFilterCreatedBy('all'); setSortBy('due_date'); setSortDirection('asc');
    toast.success('Filters cleared');
  };

  const filteredWorkflows = COMPLIANCE_WORKFLOWS.filter(wf => {
    const matchSearch = wf.name.toLowerCase().includes(workflowSearch.toLowerCase()) || wf.title.toLowerCase().includes(workflowSearch.toLowerCase());
    const matchDept   = workflowDeptFilter      === 'all' || wf.category  === workflowDeptFilter;
    const matchFreq   = workflowFrequencyFilter === 'all' || wf.frequency.toLowerCase().includes(workflowFrequencyFilter.toLowerCase());
    return matchSearch && matchDept && matchFreq;
  });

  const applyComplianceWorkflow = (wf) => {
    const due = new Date(); due.setDate(due.getDate() + wf.estimatedDays);
    setFormData({ title: wf.title, description: wf.description, assigned_to: 'unassigned', sub_assignees: [], due_date: format(due, 'yyyy-MM-dd'), priority: wf.priority, status: 'pending', category: wf.category, client_id: '', is_recurring: true, recurrence_pattern: wf.recurrence_pattern, recurrence_interval: wf.recurrence_interval });
    setShowWorkflowLibrary(false); setDialogOpen(true); setWorkflowSearch(''); setWorkflowDeptFilter('all'); setWorkflowFrequencyFilter('all');
    toast.success(`Template loaded: ${wf.name}`);
  };

  const unreadCount         = notifications.filter(n => !n.is_read).length;
  const getBoardColumnTasks = (colStatus) => displayTasks.filter(t => t.status === colStatus);
  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <motion.div
      className="space-y-4 w-full min-w-0"
      variants={containerVariants} initial="hidden" animate="visible"
    >
      {/* Non-blocking loader */}
      {dataLoading && (
        <div className="fixed top-0 left-0 right-0 z-[99999] h-0.5 overflow-hidden">
          <div className="h-full w-full animate-pulse"
            style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue}, ${COLORS.emeraldGreen})` }} />
        </div>
      )}

      {/* ── WELCOME BANNER (matches Dashboard exactly) ───────────────────── */}
      <motion.div variants={itemVariants}>
        <div
          className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)`, boxShadow: `0 8px 32px rgba(13,59,102,0.28)` }}
        >
          {/* Decorative blobs */}
          <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute right-28 bottom-0 w-40 h-40 rounded-full mb-[-40px] opacity-5" style={{ background: 'white' }} />
          <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5" style={{ background: 'white' }} />

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 min-w-0">
            {/* Left — title */}
            <div className="flex-1 min-w-0">
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5 min-w-0 truncate">
                <Briefcase className="h-3 w-3" />
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
              <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight leading-tight truncate">Task Management</h1>
              <p className="text-white/60 text-sm mt-1">Task Updates</p>
            </div>

            {/* Right — action buttons */}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* Total Tasks — admin only */}
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm"
                  onClick={() => { setFilterStatus('all'); setFilterAssignee('all'); setShowMyTasksOnly(false); setFilterTeamOnly(false); }}
                  className="h-8 text-xs rounded-xl gap-1.5 border font-semibold"
                  style={{ backgroundColor: 'rgba(31,175,90,0.22)', borderColor: 'rgba(31,175,90,0.55)', color: '#d1fae5' }}>
                  <Target className="h-3.5 w-3.5" /> Total: {stats.total}
                </Button>
                <div className="h-8 w-px bg-white/20 hidden md:block" />
              </>
            )}

              {/* Action buttons */}
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}
                className="h-8 text-xs rounded-xl text-white/80 hover:text-white hover:bg-white/15 border border-white/20">
                Upload CSV
              </Button>
              {/* Send Reminders — admin or can_send_reminders permission */}
              {(isAdmin || hasPermission('can_send_reminders')) && (
                <Button
                  variant="ghost" size="sm"
                  onClick={handleSendReminders}
                  disabled={sendingReminders}
                  className="h-8 text-xs rounded-xl gap-1.5 border border-white/20 font-semibold"
                  style={{
                    backgroundColor: sendingReminders ? 'rgba(255,255,255,0.08)' : 'rgba(251,191,36,0.22)',
                    borderColor: 'rgba(251,191,36,0.5)',
                    color: sendingReminders ? 'rgba(255,255,255,0.5)' : '#fef3c7',
                  }}>
                  {sendingReminders
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
                    : <><Mail className="h-3.5 w-3.5" />Send Reminders</>}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleExportCsv}
                className="h-8 text-xs rounded-xl text-white/80 hover:text-white hover:bg-white/15 border border-white/20">
                Export CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={handleExportPdf}
                className="h-8 text-xs rounded-xl text-white/80 hover:text-white hover:bg-white/15 border border-white/20">
                Export PDF
              </Button>
              {canEditTasks && (
                <Button variant="ghost" size="sm" onClick={() => setShowWorkflowLibrary(true)}
                  className="h-8 text-xs rounded-xl gap-1.5 text-white/80 hover:text-white hover:bg-white/15 border border-white/20">
                  <FileText className="h-3.5 w-3.5" /> CA/CS Templates
                </Button>
              )}
              {/* Notifications */}
              <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 border border-white/20">
                    <Bell className="h-3.5 w-3.5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className={`w-80 p-0 rounded-2xl shadow-xl border overflow-hidden ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200'}`} align="end">
                  <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? 'border-slate-700 bg-slate-700/60' : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-slate-600" />
                      <h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Notifications</h3>
                      {unreadCount > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{unreadCount} new</span>}
                    </div>
                    {unreadCount > 0 && <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Mark all read</button>}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-12 text-center"><Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" /><p className="text-sm text-slate-400">No notifications</p></div>
                    ) : notifications.map((n) => (
                      <div key={n.id} className={`px-5 py-3.5 border-b border-slate-100 transition-colors ${!n.is_read ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/40') : ''}`}>
                        <p className={`text-xs ${!n.is_read ? 'font-semibold' : ''} ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{n.title}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{format(new Date(n.created_at), 'MMM dd, hh:mm a')}</p>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* New Task */}
              {canEditTasks && (
                <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => { setEditingTask(null); setFormData({ ...EMPTY_FORM }); }}
                      className="h-8 px-4 text-xs rounded-xl font-semibold gap-1.5"
                      style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', color: 'white' }}>
                      <Plus className="h-3.5 w-3.5" /> New Task
                    </Button>
                  </DialogTrigger>

                  {/* Dialog form — unchanged */}
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>
                        {editingTask ? 'Edit Task' : 'Create New Task'}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-500 flex items-center gap-3 flex-wrap">
                        <span>{editingTask ? 'Update task details below.' : 'Fill in the details to create a new task.'}</span>
                        {editingTask?.created_at && (
                          <span className="flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">
                            <Clock className="h-3 w-3" />
                            Created: {format(new Date(editingTask.created_at), 'MMM dd, yyyy · hh:mm a')}
                          </span>
                        )}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task Title <span className="text-red-500">*</span></Label>
                        <Input placeholder="Enter task title" value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))} required className="h-9 text-sm border-slate-300" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</Label>
                        <Textarea placeholder="Describe the task (use - for checklist items)…" value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} rows={3} className="text-sm border-slate-300 resize-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</Label>
                          <Select value={formData.client_id || 'no_client'} onValueChange={(v) => setFormData(p => ({ ...p, client_id: v === 'no_client' ? '' : v }))}>
                            <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue placeholder="No Client" /></SelectTrigger>
                            <SelectContent className="max-h-52 overflow-y-auto">
                              <SelectItem value="no_client">No Client</SelectItem>
                              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</Label>
                          <Input type="date" value={formData.due_date} onChange={(e) => setFormData(p => ({ ...p, due_date: e.target.value }))} className="h-9 text-sm border-slate-300" />
                        </div>
                      </div>
                      {canAssignTasks && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</Label>
                            <Select value={formData.assigned_to} onValueChange={(v) => setFormData(p => ({ ...p, assigned_to: v }))}>
                              <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-52 overflow-y-auto">
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Co-assignees</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full h-9 text-sm justify-between border-slate-300">
                                  {formData.sub_assignees.length > 0 ? `${formData.sub_assignees.length} selected` : 'Select…'}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 max-h-52 overflow-y-auto">
                                <div className="space-y-2">
                                  {users.filter(u => u.id !== formData.assigned_to).map(u => (
                                    <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                                      <Checkbox checked={formData.sub_assignees.includes(u.id)} onCheckedChange={() => toggleSubAssignee(u.id)} />
                                      <span className="text-sm text-slate-700">{u.full_name}</span>
                                    </label>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {DEPARTMENTS.map(dept => (
                            <button key={dept.value} type="button" onClick={() => setFormData(p => ({ ...p, category: dept.value }))}
                              className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all ${formData.category === dept.value ? 'bg-blue-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                              {dept.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</Label>
                          <Select value={formData.priority} onValueChange={(v) => setFormData(p => ({ ...p, priority: v }))}>
                            <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</Label>
                          <Select value={formData.status} onValueChange={(v) => setFormData(p => ({ ...p, status: v }))}>
                            <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">To Do</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className={`border rounded-xl p-4 space-y-3 ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-slate-500" /><Label className="font-semibold text-sm">Recurring Task</Label></div>
                          <Switch checked={formData.is_recurring} onCheckedChange={(c) => setFormData(p => ({ ...p, is_recurring: c }))} />
                        </div>
                        {formData.is_recurring && (
                          <div className={`grid grid-cols-2 gap-3 pt-3 border-t ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat</Label>
                              <Select value={formData.recurrence_pattern} onValueChange={(v) => setFormData(p => ({ ...p, recurrence_pattern: v }))}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>{RECURRENCE_PATTERNS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Every (interval)</Label>
                              <div className="flex items-center gap-2">
                                <Input type="number" min="1" max="365" value={formData.recurrence_interval} onChange={(e) => setFormData(p => ({ ...p, recurrence_interval: parseInt(e.target.value) || 1 }))} className="w-20 h-9 text-sm" />
                                <span className="text-xs text-slate-500">{formData.recurrence_pattern === 'daily' && 'day(s)'}{formData.recurrence_pattern === 'weekly' && 'week(s)'}{formData.recurrence_pattern === 'monthly' && 'month(s)'}{formData.recurrence_pattern === 'yearly' && 'year(s)'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter className={`pt-3 border-t ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                        <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="h-9 text-sm rounded-lg">Cancel</Button>
                        <Button type="submit" disabled={loading} className="h-9 text-sm rounded-lg bg-blue-700 hover:bg-blue-800">
                          {loading ? 'Saving…' : editingTask ? 'Update Task' : 'Create Task'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── METRIC CARDS — 6 equal, all same height/layout ──────────────── */}
      {/* ── Reminder Result Banner ── */}
      {reminderResult && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
          style={{
            borderColor: reminderResult.emails_sent > 0 ? '#bbf7d0' : '#fecaca',
            backgroundColor: reminderResult.emails_sent > 0
              ? (isDark ? 'rgba(31,175,90,0.08)' : '#f0fdf4')
              : (isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2'),
          }}>
          <Mail className="w-4 h-4 flex-shrink-0"
            style={{ color: reminderResult.emails_sent > 0 ? '#16a34a' : '#dc2626' }} />
          <span className="flex-1 font-medium"
            style={{ color: reminderResult.emails_sent > 0
              ? (isDark ? '#86efac' : '#15803d')
              : (isDark ? '#fca5a5' : '#dc2626') }}>
            {reminderResult.emails_sent > 0
              ? `✓ Reminder emails sent to ${reminderResult.emails_sent} / ${reminderResult.total_users} staff`
              : `Reminder emails failed — check SENDGRID_API_KEY on the server`}
            {reminderResult.emails_failed?.length > 0 && (
              <span className="ml-2 text-xs opacity-70">
                (Failed: {reminderResult.emails_failed.join(', ')})
              </span>
            )}
          </span>
          <button onClick={() => setReminderResult(null)}
            className="w-6 h-6 flex items-center justify-center rounded-lg opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: reminderResult.emails_sent > 0 ? '#16a34a' : '#dc2626' }}>
            ✕
          </button>
        </motion.div>
      )}

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 [&>*]:min-w-0"
      >
        {/* 1. My Task */}
        <MetricCard
          label="ASSIGNED TO ME" value={stats.myTask} icon={SlidersHorizontal}
          accent={isDark ? '#60a5fa' : COLORS.deepBlue}
          active={showMyTasksOnly} isDark={isDark}
          onClick={() => setShowMyTasksOnly(p => !p)}
        />

        {/* 2. To Do */}
        <MetricCard
          label="To Do" value={stats.todo} icon={Circle}
          accent="#EF4444"
          active={filterStatus === 'pending'} isDark={isDark}
          onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}
        />

        {/* 3. In Progress */}
        <MetricCard
          label="In Progress" value={stats.inProgress} icon={TrendingUp}
          accent={COLORS.amber}
          active={filterStatus === 'in_progress'} isDark={isDark}
          onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}
        />

        {/* 4. Completed */}
        <MetricCard
          label="Completed" value={stats.completed} icon={CheckCircle2}
          accent={COLORS.mediumBlue}
          active={filterStatus === 'completed'} isDark={isDark}
          progress={completionRate}
          onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}
        />

        {/* 5. Overdue */}
        <MetricCard
          label="Overdue" value={stats.overdue} icon={AlertCircle}
          accent={COLORS.coral}
          active={filterStatus === 'overdue'} isDark={isDark}
          onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}
        />

        {/* 6. Team Task — now uses TeamTaskCard for perfect alignment */}
        <TeamTaskCard
          stats={stats}
          hasCrossVisibility={hasCrossVisibility}
          usersLoading={usersLoading}
          filterTeamOnly={filterTeamOnly}
          setFilterTeamOnly={setFilterTeamOnly}
          setFilterAssignee={setFilterAssignee}
          setShowMyTasksOnly={setShowMyTasksOnly}
          teamTaskBreakdown={teamTaskBreakdown}
          isDark={isDark}
        />
      </motion.div>

      {/* ── LIVE FILTER SUMMARY CARDS — always visible, updates in real time ── */}
      {(() => {
        // Build a human-friendly label for each active filter dimension
        const filterParts = [];
        if (searchQuery)               filterParts.push({ key: 'search',    icon: '🔍', text: `"${searchQuery}"` });
        if (filterStatus !== 'all')    filterParts.push({ key: 'status',    icon: '📌', text: STATUS_STYLES[filterStatus]?.label || filterStatus });
        if (filterPriority !== 'all')  filterParts.push({ key: 'priority',  icon: '⚡', text: filterPriority.toUpperCase() + ' Priority' });
        if (filterCategory !== 'all')  filterParts.push({ key: 'dept',      icon: '🏢', text: getCategoryLabel(filterCategory) });
        if (filterAssignee !== 'all')  filterParts.push({ key: 'assignee',  icon: '👤', text: users.find(u => u.id === filterAssignee)?.full_name || 'Assignee' });
        if (showMyTasksOnly)           filterParts.push({ key: 'mine',      icon: '🎯', text: 'Assigned To Me' });
        if (filterTeamOnly)            filterParts.push({ key: 'team',      icon: '👥', text: 'Team Tasks' });
        if (filterAssignedByMe)        filterParts.push({ key: 'byme',      icon: '✍️', text: 'Assigned by Me' });
        if (filterCreatedBy !== 'all') filterParts.push({ key: 'creator',   icon: '✍️', text: `By ${users.find(u => u.id === filterCreatedBy)?.full_name || 'Creator'}` });

        const isFiltered = filterParts.length > 0;

        // Dynamic label builder for each mini-card heading
        const buildLabel = (base, filterKey, activeIcon = '✓') => {
          const match = filterParts.find(f => f.key === filterKey);
          if (match) return `${activeIcon} ${base}`;
          // Contextualise with the primary active filter if no direct match
          if (isFiltered) {
            const ctx = filterParts[0];
            if (ctx.key === 'assignee') return `${base} · ${users.find(u => u.id === filterAssignee)?.full_name?.split(' ')[0] || ''}`;
            if (ctx.key === 'mine')     return `${base} · Me`;
            if (ctx.key === 'team')     return `${base} · Team`;
            if (ctx.key === 'creator')  return `${base} · ${users.find(u => u.id === filterCreatedBy)?.full_name?.split(' ')[0] || 'Creator'}`;
            if (ctx.key === 'dept')     return `${base} · ${getCategoryLabel(filterCategory)}`;
          }
          return base;
        };

        const miniCards = [
          {
            id: 'mine',
            label: buildLabel('Assigned By', 'mine'),
            value: filteredStats.myTask,
            total: stats.myTask,
            accent: isDark ? '#60a5fa' : COLORS.deepBlue,
            icon: SlidersHorizontal,
            active: showMyTasksOnly,
          },
          {
            id: 'todo',
            label: buildLabel('To Do', 'status', filterStatus === 'pending' ? '✓' : undefined),
            value: filteredStats.todo,
            total: stats.todo,
            accent: '#EF4444',
            icon: Circle,
            active: filterStatus === 'pending',
          },
          {
            id: 'wip',
            label: buildLabel('In Progress', 'status', filterStatus === 'in_progress' ? '✓' : undefined),
            value: filteredStats.inProgress,
            total: stats.inProgress,
            accent: COLORS.amber,
            icon: TrendingUp,
            active: filterStatus === 'in_progress',
          },
          {
            id: 'done',
            label: buildLabel('Completed', 'status', filterStatus === 'completed' ? '✓' : undefined),
            value: filteredStats.completed,
            total: stats.completed,
            accent: COLORS.mediumBlue,
            icon: CheckCircle2,
            active: filterStatus === 'completed',
            showRate: true,
            rate: filteredStats.completionRate,
          },
          {
            id: 'overdue',
            label: buildLabel('Overdue', 'status', filterStatus === 'overdue' ? '✓' : undefined),
            value: filteredStats.overdue,
            total: stats.overdue,
            accent: COLORS.coral,
            icon: AlertCircle,
            active: filterStatus === 'overdue',
          },
          {
            id: 'team',
            label: buildLabel('Team Tasks', 'team'),
            value: filteredStats.teamTask,
            total: stats.teamTask,
            accent: isDark ? '#a78bfa' : '#7c3aed',
            icon: Users,
            active: filterTeamOnly,
            hidden: !hasCrossVisibility,
          },
        ];

        return (
          <motion.div variants={itemVariants} className="space-y-1.5">
            {/* Filter context strip — shown only when filtering */}
            <AnimatePresence>
              {isFiltered && (
                <motion.div
                  key="filter-strip"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className={`flex items-center gap-2 flex-wrap px-3 py-1.5 rounded-xl border text-[10px] font-semibold ${isDark ? 'bg-blue-950/40 border-blue-900 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'}`}
                >
                  <Activity className="h-3 w-3 flex-shrink-0" />
                  <span className="font-bold uppercase tracking-wide">Live View</span>
                  <span className={`${isDark ? 'text-blue-500' : 'text-blue-400'}`}>·</span>
                  {filterParts.map((f, i) => (
                    <span key={f.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${isDark ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800'}`}>
                      {f.icon} {f.text}
                    </span>
                  ))}
                  <span className={`ml-auto font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    {filteredStats.total} / {stats.total} tasks
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mini stat cards — always visible */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {miniCards.map(({ id, label, value, total, accent, icon: Icon, active, showRate, rate, hidden }) => {
                if (hidden) return null;
                const pct     = total > 0 ? Math.round((value / total) * 100) : 0;
                const delta   = value - total; // negative = fewer in filter than global
                const changed = isFiltered && value !== total;
                return (
                  <motion.div
                    key={id}
                    layout
                    animate={{ scale: active ? 1.02 : 1 }}
                    transition={{ duration: 0.18 }}
                    className={`rounded-xl px-2.5 py-2 border flex flex-col gap-1 transition-all ${
                      active
                        ? (isDark ? 'border-slate-500 bg-slate-700' : 'border-slate-300 bg-white shadow-sm')
                        : (isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white/80 border-slate-200/80')
                    }`}
                    style={active ? { borderColor: accent, boxShadow: `0 0 0 1.5px ${accent}40` } : {}}
                  >
                    {/* Label row */}
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-[8.5px] font-bold uppercase tracking-wide leading-tight truncate ${active ? '' : 'text-slate-400'}`}
                        style={active ? { color: accent } : {}}>
                        {label}
                      </p>
                      <div className="p-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: `${accent}18` }}>
                        <Icon className="h-2.5 w-2.5" style={{ color: accent }} />
                      </div>
                    </div>

                    {/* Value row */}
                    <div className="flex items-end gap-1">
                      <motion.span
                        key={value}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-lg font-bold leading-none tracking-tight"
                        style={{ color: accent }}
                      >
                        {value}
                      </motion.span>
                      <span className={`text-[9px] font-medium pb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        / {total}
                      </span>
                      {/* Delta badge — shows change when filter is active */}
                      {changed && (
                        <span className={`text-[8px] font-bold ml-auto px-1 py-0.5 rounded-md leading-none ${
                          delta < 0
                            ? (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500')
                            : (isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                        }`}>
                          {delta < 0 ? delta : `+${delta}`}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className={`h-0.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: active ? accent : `${accent}88` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Completion rate or pct label */}
                    {showRate ? (
                      <p className="text-[8px] font-semibold" style={{ color: accent }}>{rate}% done</p>
                    ) : (
                      <p className={`text-[8px] font-medium ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                        {pct}% of total
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })()}

      {/* ── TOOLBAR — removed My Tasks toggle, kept all filters ─────────── */}
      <motion.div variants={itemVariants}
        className={`flex flex-wrap items-center gap-2 border rounded-2xl px-4 py-3 shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search tasks…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-9 h-8 text-sm rounded-xl ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400' : 'bg-slate-50 border-slate-200'}`} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className={`h-8 w-32 text-xs rounded-xl ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className={`h-8 w-32 text-xs rounded-xl ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className={`h-8 w-32 text-xs rounded-xl ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {TASK_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className={`h-8 w-32 text-xs rounded-xl ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {visibleUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={`${sortBy}-${sortDirection}`} onValueChange={(v) => { const [sb, sd] = v.split('-'); setSortBy(sb); setSortDirection(sd); }}>
            <SelectTrigger className={`h-8 w-40 text-xs rounded-xl ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200'}`}><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="due_date-asc">Due Date ↑</SelectItem>
              <SelectItem value="due_date-desc">Due Date ↓</SelectItem>
              <SelectItem value="created_date-asc">Created ↑ (FIFO)</SelectItem>
              <SelectItem value="created_date-desc">Created ↓ (LIFO)</SelectItem>
              <SelectItem value="priority-desc">Priority ↓</SelectItem>
              <SelectItem value="title-asc">Title A-Z</SelectItem>
            </SelectContent>
          </Select>

          {/* Assigned By dropdown — permission-aware creator filter */}
          <Select
            value={filterCreatedBy !== 'all' ? filterCreatedBy : (filterAssignedByMe ? '__me__' : 'all')}
            onValueChange={(v) => {
              if (v === '__me__') {
                setFilterAssignedByMe(true);
                setFilterCreatedBy('all');
                setShowMyTasksOnly(false);
                setFilterTeamOnly(false);
                setFilterAssignee('all');
              } else {
                setFilterAssignedByMe(false);
                setFilterCreatedBy(v);
                if (v !== 'all') { setShowMyTasksOnly(false); setFilterTeamOnly(false); }
              }
            }}
          >
            <SelectTrigger
              className={`h-8 text-xs rounded-xl flex-1 min-w-[130px] max-w-[200px] transition-all ${
                (filterCreatedBy !== 'all' || filterAssignedByMe)
                  ? (isDark ? 'bg-purple-900/40 border-purple-500 text-purple-300' : 'bg-purple-50 border-purple-400 text-purple-700')
                  : (isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-200')
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <User className="h-3 w-3 flex-shrink-0" />
                <SelectValue placeholder="Assigned by" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Creators</SelectItem>
              <SelectItem value="__me__">Assigned by Me</SelectItem>
              {visibleCreators
                .filter(u => u.id !== user?.id) // "me" already covered above
                .map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))
              }
            </SelectContent>
          </Select>

          {/* AI Duplicate Detector */}
          <button
            onClick={handleDetectDuplicates}
            disabled={detectingDuplicates}
            className={`h-8 px-3 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 whitespace-nowrap
              ${isDark
                ? 'bg-violet-900/30 border-violet-700 text-violet-300 hover:bg-violet-900/50 disabled:opacity-40'
                : 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100 disabled:opacity-40'
              }`}
          >
            {detectingDuplicates
              ? <><Loader2 className="h-3 w-3 animate-spin" />Scanning…</>
              : <><Sparkles className="h-3 w-3" />AI Duplicates</>}
          </button>

          {/* View toggle */}
          <div className={`flex p-0.5 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <button onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${viewMode === 'list' ? (isDark ? 'bg-slate-600 shadow-sm text-slate-100' : 'bg-white shadow-sm text-slate-800') : 'text-slate-500 hover:text-slate-700'}`}>
              <List className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode('board')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${viewMode === 'board' ? (isDark ? 'bg-slate-600 shadow-sm text-slate-100' : 'bg-white shadow-sm text-slate-800') : 'text-slate-500 hover:text-slate-700'}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Active Filter Pills ──────────────────────────────────────────── */}
      <AnimatePresence>
        {activeFilters.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="flex flex-wrap gap-1.5 items-center">
            {activeFilters.map(pill => (
              <button key={pill.key} onClick={() => removeFilter(pill.key)}
                className="flex items-center gap-1 text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors">
                {pill.label} <X className="h-3 w-3 ml-0.5" />
              </button>
            ))}
            <button onClick={clearAllFilters} className="text-[11px] font-medium text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors">Clear all</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List / Board ─────────────────────────────────────────────────── */}
      <div className="overflow-y-auto max-h-[calc(100vh-360px)]">
        {viewMode === 'list' ? (
          <motion.div className="space-y-1.5" variants={containerVariants}>
            <div
              className={`hidden sm:grid items-center pl-5 pr-3 py-2 text-[10px] font-bold uppercase tracking-widest select-none border-b mb-1.5
                ${isDark ? 'text-slate-500 border-slate-700' : 'text-slate-400 border-slate-100'}`}
              style={{ gridTemplateColumns: '24px 24px minmax(0,1fr) 160px 88px 64px 72px 110px 110px 88px 100px' }}
            >
              <span /><span />
              <span className="pl-1">Task</span>
              <span className="text-center">Status</span>
              <span className="text-center">Dept</span>
              <span className="text-center">Priority</span>
              <span className="text-center">Overdue</span>
              <span className="text-center">Assignee</span>
              <span className="text-center">Assignor</span>
              <span className="text-center">Due</span>
              <span className="text-center">Actions</span>
            </div>

            {displayTasks.map((task, index) => {
              const taskIsOverdue = isOverdue(task);
              const displayStatus = getDisplayStatus(task);
              const statusStyle   = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
              const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
              const stripeColor   = getStripeColor(task, taskIsOverdue);
              return (
                <TaskRow key={task.id} task={task} index={index}
                  isOverdue={taskIsOverdue} statusStyle={statusStyle} priorityStyle={priorityStyle} stripeColor={stripeColor}
                  getUserName={getUserName} getClientName={getClientName} getRelativeDueDate={getRelativeDueDate}
                  getChecklistProgress={getChecklistProgress} parseChecklist={parseChecklist}
                  taskChecklists={taskChecklists} toggleChecklistItem={toggleChecklistItem}
                  canModifyTask={canModifyTask} canDeleteTasks={canDeleteTasks}
                  handleEdit={handleEdit} handleDelete={handleDelete} handleDuplicateTask={handleDuplicateTask}
                  handleQuickStatusChange={handleQuickStatusChange} openTaskDetail={openTaskDetail}
                  openCommentTaskId={openCommentTaskId} setOpenCommentTaskId={setOpenCommentTaskId}
                  fetchComments={fetchComments} comments={comments} newComment={newComment}
                  setNewComment={setNewComment} selectedTask={selectedTask} setSelectedTask={setSelectedTask}
                  handleAddComment={handleAddComment} user={user}
                />
              );
            })}

            {displayTasks.length === 0 && (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Search className="h-5 w-5 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">No tasks found</p>
                <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-5" variants={containerVariants}>
            {[
              { status: 'pending',     title: 'To Do',       color: 'text-red-600',   bg: 'bg-red-500',   count: stats.todo },
              { status: 'in_progress', title: 'In Progress', color: 'text-amber-600', bg: 'bg-amber-500', count: stats.inProgress },
              { status: 'completed',   title: 'Completed',   color: 'text-blue-600',  bg: 'bg-blue-600',  count: stats.completed },
            ].map((col) => {
              const colTasks = getBoardColumnTasks(col.status);
              return (
                <motion.div key={col.status} variants={itemVariants} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.bg}`} />
                    <h2 className={`text-sm font-bold ${col.color}`}>{col.title}</h2>
                    <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ml-auto">{colTasks.length}</span>
                  </div>
                  <div className="space-y-3 min-h-[200px]">
                    {colTasks.map((task, index) => {
                      const taskIsOverdue = isOverdue(task);
                      const displayStatus = getDisplayStatus(task);
                      const statusStyle   = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
                      const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                      const stripeColor   = getStripeColor(task, taskIsOverdue);
                      return (
                        <BoardCard key={task.id} task={task} index={index}
                          isOverdue={taskIsOverdue} statusStyle={statusStyle} priorityStyle={priorityStyle} stripeColor={stripeColor}
                          getUserName={getUserName} getClientName={getClientName} getRelativeDueDate={getRelativeDueDate}
                          getChecklistProgress={getChecklistProgress} parseChecklist={parseChecklist}
                          taskChecklists={taskChecklists} toggleChecklistItem={toggleChecklistItem}
                          canModifyTask={canModifyTask} canDeleteTasks={canDeleteTasks}
                          handleEdit={handleEdit} handleDelete={handleDelete} handleDuplicateTask={handleDuplicateTask}
                          handleQuickStatusChange={handleQuickStatusChange} openTaskDetail={openTaskDetail}
                          openCommentTaskId={openCommentTaskId} setOpenCommentTaskId={setOpenCommentTaskId}
                          fetchComments={fetchComments} comments={comments} newComment={newComment}
                          setNewComment={setNewComment} selectedTask={selectedTask} setSelectedTask={setSelectedTask}
                          handleAddComment={handleAddComment}
                        />
                      );
                    })}
                    {colTasks.length === 0 && (
                      <div className={`flex items-center justify-center h-24 rounded-xl border-2 border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                        <p className="text-xs text-slate-400">No tasks</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* ── Task Detail Dialog ───────────────────────────────────────────── */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>Task Details</DialogTitle>
            <DialogDescription className="sr-only">Full task details</DialogDescription>
          </DialogHeader>
          {selectedDetailTask && (() => {
            const taskIsOverdue  = isOverdue(selectedDetailTask);
            const displayStatus  = getDisplayStatus(selectedDetailTask);
            const statusStyle    = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
            const priorityStyle  = PRIORITY_STYLES[selectedDetailTask.priority] || PRIORITY_STYLES.medium;
            const checklistItems = parseChecklist(selectedDetailTask.description);
            const checkedItems   = taskChecklists[selectedDetailTask.id] || [];
            const progress       = getChecklistProgress(selectedDetailTask);
            return (
              <div className="space-y-5 mt-2">
                <div>
                  <h2 className={`text-xl font-bold mb-2 leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedDetailTask.title}</h2>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${statusStyle.bg} ${statusStyle.text}`}>{taskIsOverdue ? 'Overdue' : statusStyle.label}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${priorityStyle.bg} ${priorityStyle.text}`}>{priorityStyle.label} Priority</span>
                    {selectedDetailTask.is_recurring && <span className="text-xs font-semibold bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg">↺ Recurring</span>}
                    {selectedDetailTask.category && <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg uppercase">{getCategoryLabel(selectedDetailTask.category)}</span>}
                  </div>
                </div>
                {selectedDetailTask.description && (
                  <div className={`border rounded-xl p-4 ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Notes</p>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedDetailTask.description}</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Assigned To', value: getUserName(selectedDetailTask.assigned_to) },
                    { label: 'Created By',  value: selectedDetailTask.created_by ? getUserName(selectedDetailTask.created_by) : '—' },
                    { label: 'Department',  value: getCategoryLabel(selectedDetailTask.category) },
                    { label: 'Client',      value: selectedDetailTask.client_id ? getClientName(selectedDetailTask.client_id) : '—' },
                    { label: 'Created On',  value: selectedDetailTask.created_at ? format(new Date(selectedDetailTask.created_at), 'MMM dd, yyyy · hh:mm a') : '—' },
                    { label: 'Due Date',    value: selectedDetailTask.due_date ? `${format(new Date(selectedDetailTask.due_date), 'MMM dd, yyyy')} · ${getRelativeDueDate(selectedDetailTask.due_date)}` : 'No due date' },
                    { label: 'Recurrence', value: selectedDetailTask.is_recurring ? `Every ${selectedDetailTask.recurrence_interval} ${selectedDetailTask.recurrence_pattern}(s)` : 'One-time' },
                  ].map(({ label, value }) => (
                    <div key={label} className={`border rounded-xl p-3.5 ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200 bg-white'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {checklistItems.length > 0 && (
                  <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Compliance Checklist</p>
                      <span className="text-xs font-bold text-emerald-700">{checkedItems.length}/{checklistItems.length} · {progress}%</span>
                    </div>
                    <div className="h-1.5 bg-emerald-200 rounded-full mb-3 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {checklistItems.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2.5 cursor-pointer">
                          <Checkbox checked={checkedItems.includes(idx)} onCheckedChange={() => toggleChecklistItem(selectedDetailTask.id, idx)} className="mt-0.5 flex-shrink-0" />
                          <span className={`text-sm leading-relaxed ${checkedItems.includes(idx) ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className={`flex gap-2 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  {canModifyTask(selectedDetailTask) && <Button onClick={() => { handleEdit(selectedDetailTask); setTaskDetailOpen(false); }} className="h-9 text-sm rounded-lg bg-blue-700 hover:bg-blue-800 text-white gap-1.5"><Edit className="h-3.5 w-3.5" /> Edit</Button>}
                  {canModifyTask(selectedDetailTask) && <Button variant="outline" onClick={() => { handleDuplicateTask(selectedDetailTask); setTaskDetailOpen(false); }} className="h-9 text-sm rounded-lg gap-1.5"><Copy className="h-3.5 w-3.5" /> Duplicate</Button>}
                  <Button variant="outline" onClick={() => handleAddToReminder(selectedDetailTask)} className="h-9 text-sm rounded-lg text-purple-600 hover:bg-purple-50 border-purple-200 gap-1.5"><Bell className="h-3.5 w-3.5" /> Add to Reminders</Button>
                  {canDeleteTasks && <Button variant="outline" onClick={() => { handleDelete(selectedDetailTask.id); setTaskDetailOpen(false); }} className="h-9 text-sm rounded-lg text-red-600 hover:bg-red-50 border-red-200 gap-1.5"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Workflow Library ─────────────────────────────────────────────── */}
      <Dialog open={showWorkflowLibrary} onOpenChange={setShowWorkflowLibrary}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>CA/CS Compliance Workflow Library</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">14 professionally curated compliance workflows. Click any template to pre-fill a task.</DialogDescription>
          </DialogHeader>
          <div className={`flex gap-3 sticky top-0 z-10 py-3 border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search templates…" value={workflowSearch} onChange={(e) => setWorkflowSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <Select value={workflowDeptFilter} onValueChange={setWorkflowDeptFilter}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Departments</SelectItem>{DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={workflowFrequencyFilter} onValueChange={setWorkflowFrequencyFilter}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Frequencies</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {filteredWorkflows.map((wf) => {
              const steps = parseChecklist(wf.description);
              const priorityStyle = PRIORITY_STYLES[wf.priority] || PRIORITY_STYLES.medium;
              return (
                <button key={wf.id} onClick={() => applyComplianceWorkflow(wf)}
                  className={`text-left border rounded-xl p-5 hover:border-emerald-400 hover:shadow-md transition-all group ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{getCategoryLabel(wf.category)}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${priorityStyle.bg} ${priorityStyle.text}`}>{priorityStyle.label}</span>
                      </div>
                      <h3 className={`font-bold group-hover:text-emerald-600 transition-colors leading-snug ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{wf.name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-lg font-bold text-emerald-600">{wf.estimatedHours}h</div>
                      <div className="text-[10px] text-slate-400">{wf.frequency}</div>
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Key Steps</p>
                    <div className="space-y-1">
                      {steps.slice(0, 4).map((s, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600 truncate"><Check className="h-3 w-3 text-emerald-500 flex-shrink-0" /> {s}</div>
                      ))}
                      {steps.length > 4 && <div className="text-[11px] text-emerald-600 pl-4">+{steps.length - 4} more steps</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[11px] text-slate-400">Due in ~{wf.estimatedDays} days</span>
                    <span className="text-[11px] font-semibold text-emerald-600 group-hover:underline flex items-center gap-1">Use Template <ArrowRight className="h-3 w-3" /></span>
                  </div>
                </button>
              );
            })}
            {filteredWorkflows.length === 0 && <div className="col-span-2 text-center py-16 text-slate-400">No templates match your filters</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Duplicate Detection Dialog ──────────────────────────────── */}
      <Dialog open={showDuplicateDialog} onOpenChange={(o) => { setShowDuplicateDialog(o); if (!o) { setCompareMode(false); setCompareTaskIds([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Duplicate Task Detection
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
              <span>
                {duplicateGroups.length
                  ? `Found ${duplicateGroups.length} group${duplicateGroups.length !== 1 ? 's' : ''} of potential duplicate tasks.`
                  : 'No duplicate tasks detected.'}
              </span>
              {duplicateGroups.length > 0 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  duplicateGroups[0]?.source === 'ai'
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {duplicateGroups[0]?.source === 'ai' ? '✦ Gemini AI' : '⚡ Local Scan'}
                </span>
              )}
              {duplicateGroups.length > 0 && (
                <button
                  onClick={() => { setCompareMode(p => !p); setCompareTaskIds([]); }}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                    compareMode
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  {compareMode ? '✓ Compare Mode ON — select 2 tasks' : '⇄ Compare Mode'}
                </button>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* ── Compare Panel ── */}
          {compareMode && compareTaskIds.length === 2 && (() => {
            const tA = tasks.find(t => String(t.id) === String(compareTaskIds[0]));
            const tB = tasks.find(t => String(t.id) === String(compareTaskIds[1]));
            if (!tA || !tB) return null;
            const fields = [
              { label: 'Title',      a: tA.title,                                                      b: tB.title },
              { label: 'Status',     a: STATUS_STYLES[tA.status]?.label || tA.status,                  b: STATUS_STYLES[tB.status]?.label || tB.status },
              { label: 'Priority',   a: (tA.priority || '').toUpperCase(),                             b: (tB.priority || '').toUpperCase() },
              { label: 'Department', a: getCategoryLabel(tA.category),                                 b: getCategoryLabel(tB.category) },
              { label: 'Client',     a: tA.client_id ? getClientName(tA.client_id) : '—',             b: tB.client_id ? getClientName(tB.client_id) : '—' },
              { label: 'Assignee',   a: getUserName(tA.assigned_to),                                   b: getUserName(tB.assigned_to) },
              { label: 'Due Date',   a: tA.due_date ? format(new Date(tA.due_date), 'MMM dd, yyyy') : '—', b: tB.due_date ? format(new Date(tB.due_date), 'MMM dd, yyyy') : '—' },
              { label: 'Created',    a: tA.created_at ? format(new Date(tA.created_at), 'MMM dd, yyyy') : '—', b: tB.created_at ? format(new Date(tB.created_at), 'MMM dd, yyyy') : '—' },
              { label: 'Recurring',  a: tA.is_recurring ? 'Yes' : 'No',                               b: tB.is_recurring ? 'Yes' : 'No' },
              { label: 'Description',a: (tA.description || '—').slice(0, 80),                         b: (tB.description || '—').slice(0, 80) },
            ];
            return (
              <div className={`my-3 border rounded-xl overflow-hidden ${isDark ? 'border-emerald-800 bg-slate-800' : 'border-emerald-200 bg-emerald-50/30'}`}>
                <div className="flex items-center justify-between px-4 py-2 bg-emerald-500 text-white">
                  <span className="text-xs font-bold uppercase tracking-wide">Side-by-Side Comparison</span>
                  <button onClick={() => { setCompareTaskIds([]); setCompareMode(false); }} className="text-white/80 hover:text-white text-xs">✕ Close</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-700' : 'border-emerald-200 bg-emerald-100/60'}`}>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 w-24">Field</th>
                        <th className="px-3 py-2 text-left font-semibold text-blue-700 max-w-[220px]">
                          <button onClick={() => openTaskDetail(tA)} className="hover:underline truncate block">{tA.title.slice(0, 30)}{tA.title.length > 30 ? '…' : ''}</button>
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-purple-700 max-w-[220px]">
                          <button onClick={() => openTaskDetail(tB)} className="hover:underline truncate block">{tB.title.slice(0, 30)}{tB.title.length > 30 ? '…' : ''}</button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map(({ label, a, b }) => {
                        const diff = String(a).toLowerCase() !== String(b).toLowerCase();
                        return (
                          <tr key={label} className={`border-b ${isDark ? 'border-slate-700' : 'border-emerald-100'} ${diff ? (isDark ? 'bg-amber-900/20' : 'bg-amber-50/60') : ''}`}>
                            <td className="px-3 py-1.5 font-bold text-slate-400 whitespace-nowrap">{label}</td>
                            <td className={`px-3 py-1.5 ${diff ? 'text-blue-700 font-semibold' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>{a}</td>
                            <td className={`px-3 py-1.5 ${diff ? 'text-purple-700 font-semibold' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>{b}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2 px-4 py-2 border-t border-emerald-200">
                  {canDeleteTasks && <button onClick={() => { handleDelete(tA.id); setCompareTaskIds([]); setCompareMode(false); }} className="h-6 px-3 text-[10px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100">Delete Task A</button>}
                  {canDeleteTasks && <button onClick={() => { handleDelete(tB.id); setCompareTaskIds([]); setCompareMode(false); }} className="h-6 px-3 text-[10px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100">Delete Task B</button>}
                  <button onClick={() => { setCompareTaskIds([]); }} className="h-6 px-3 text-[10px] font-semibold rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 ml-auto">Clear Selection</button>
                </div>
              </div>
            );
          })()}
          {compareMode && compareTaskIds.length < 2 && (
            <div className={`my-2 px-4 py-2 rounded-lg text-xs font-medium text-center ${isDark ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {compareTaskIds.length === 0 ? 'Click any task title below to select it for comparison (select 2)' : `1 task selected — click one more task to compare`}
            </div>
          )}

          <div className="mt-2 space-y-4">
            {duplicateGroups.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="font-semibold text-slate-700">All Clear!</p>
                <p className="text-sm text-slate-400 mt-1">No duplicate tasks found in your current view.</p>
              </div>
            ) : duplicateGroups.map((group, gi) => {
              const groupTasks = (group.task_ids || []).map(id => tasks.find(t => String(t.id) === String(id))).filter(Boolean);
              const confColor = group.confidence === 'high' ? 'text-red-600 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200';
              return (
                <div key={gi} className={`border rounded-xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className={`px-4 py-3 flex items-center justify-between gap-2 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-xs font-bold text-slate-400">GROUP {gi + 1}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${confColor}`}>
                        {(group.confidence || 'medium').toUpperCase()} MATCH
                      </span>
                      <span className={`text-[10px] text-right truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{group.reason}</span>
                    </div>
                    <button
                      onClick={() => {
                        // Select all tasks in group for quick compare of first 2
                        const ids = groupTasks.slice(0, 2).map(t => String(t.id));
                        setCompareTaskIds(ids);
                        setCompareMode(true);
                      }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 transition-all ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-400' : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-600'}`}
                    >
                      ⇄ Compare
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {groupTasks.map((task, ti) => {
                      const ps = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                      const ss = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
                      const isSelectedForCompare = compareTaskIds.includes(String(task.id));
                      return (
                        <div key={ti} className={`px-4 py-3 flex items-center justify-between gap-3 transition-all ${
                          isSelectedForCompare
                            ? (isDark ? 'bg-emerald-900/30 border-l-2 border-emerald-500' : 'bg-emerald-50 border-l-2 border-emerald-500')
                            : (isDark ? 'bg-slate-800/60' : 'bg-white')
                        }`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStripeColor(task, isOverdue(task))}`} />
                            {/* Clickable title — opens Task Detail OR selects for compare */}
                            <button
                              onClick={() => {
                                if (compareMode) {
                                  const sid = String(task.id);
                                  setCompareTaskIds(prev => {
                                    if (prev.includes(sid)) return prev.filter(i => i !== sid);
                                    if (prev.length >= 2) return [prev[1], sid];
                                    return [...prev, sid];
                                  });
                                } else {
                                  openTaskDetail(task);
                                  setShowDuplicateDialog(false);
                                }
                              }}
                              className={`text-sm font-medium truncate text-left transition-colors ${
                                compareMode
                                  ? (isSelectedForCompare
                                    ? 'text-emerald-600 font-bold'
                                    : (isDark ? 'text-slate-300 hover:text-emerald-400' : 'text-slate-700 hover:text-emerald-600'))
                                  : (isDark ? 'text-slate-100 hover:text-blue-400 underline-offset-2 hover:underline' : 'text-slate-800 hover:text-blue-700 underline-offset-2 hover:underline')
                              }`}
                              title={compareMode ? 'Click to select for comparison' : 'Click to view task details'}
                            >
                              {isSelectedForCompare && '✓ '}{task.title}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ss.bg} ${ss.text}`}>{ss.label}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ps.bg} ${ps.text}`}>{ps.label}</span>
                            {task.category && <span className="text-[10px] text-slate-400 uppercase">{task.category}</span>}
                            <span className="text-[10px] text-slate-400">{getUserName(task.assigned_to)}</span>
                            {task.created_at && (
                              <span className="text-[10px] text-slate-400 hidden sm:inline">{format(new Date(task.created_at), 'MMM dd, yy')}</span>
                            )}
                            {/* View button */}
                            <button
                              onClick={() => { openTaskDetail(task); setShowDuplicateDialog(false); }}
                              className="h-6 px-2 text-[10px] font-semibold rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200 flex-shrink-0"
                              title="View task details"
                            >
                              View
                            </button>
                            {canModifyTask(task) && (
                              <button
                                onClick={() => { handleEdit(task); setShowDuplicateDialog(false); }}
                                className="h-6 px-2 text-[10px] font-semibold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200 flex-shrink-0"
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteTasks && (
                              <button
                                onClick={() => {
                                  handleDelete(task.id);
                                  setDuplicateGroups(prev =>
                                    prev.map(g => ({ ...g, task_ids: g.task_ids.filter(id => String(id) !== String(task.id)) }))
                                      .filter(g => g.task_ids.length > 1)
                                  );
                                  setCompareTaskIds(prev => prev.filter(id => id !== String(task.id)));
                                }}
                                className="h-6 px-2 text-[10px] font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200 flex-shrink-0"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {groupTasks.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-400">Task IDs not found in current view — may be filtered out.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={`flex items-center justify-between pt-4 border-t mt-2 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <p className="text-[10px] text-slate-400">
              {compareMode ? 'Click task titles to select for comparison · Click "View" to open details' : 'Click task titles to open details · Enable Compare Mode to compare side-by-side'}
            </p>
            <Button variant="outline" onClick={() => { setShowDuplicateDialog(false); setCompareMode(false); setCompareTaskIds([]); }} className="h-9 text-sm rounded-xl">Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Comments dialog ──────────────────────────────────────────────── */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-base font-bold">Comments — {selectedTask?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="max-h-60 overflow-y-auto space-y-2">
              {(comments[selectedTask?.id] || []).map((c, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-sm text-slate-700">{c.text}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{getUserName(c.user_id)} · {format(new Date(c.created_at), 'MMM dd, hh:mm a')}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" className="h-9 text-sm" />
              <Button className="h-9 text-sm" onClick={handleAddComment}>Post</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCsvUpload} />
    </motion.div>
  );
}
