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
import Papa from "papaparse";
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User,
  LayoutGrid, List, Circle, ArrowRight, Check, Repeat,
  MessageSquare, Bell, FileText, Calendar as CalendarIcon,
  X, ChevronDown, Filter, Clock, AlertCircle, CheckCircle2,
  TrendingUp, MoreHorizontal, Copy, SlidersHorizontal
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── Brand Colors (unchanged) ───────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

// ─── Department categories ───────────────────────────────────────────────────
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

// ─── CA/CS Compliance Workflow Templates ────────────────────────────────────
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

// ─── Status & Priority Styles (unchanged) ───────────────────────────────────
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

// ─── Stripe color for left accent bar ───────────────────────────────────────
const getStripeColor = (task, overdue) => {
  if (overdue)                          return 'bg-red-700';
  const s = (task.status || '').toLowerCase();
  if (s === 'completed')                return 'bg-blue-600';
  if (s === 'in_progress')              return 'bg-amber-500';
  if (s === 'pending') {
    const p = (task.priority || '').toLowerCase();
    if (p === 'critical')               return 'bg-red-600';
    if (p === 'high')                   return 'bg-orange-500';
    return 'bg-red-400';
  }
  return 'bg-slate-300';
};

// ─── Animation variants ──────────────────────────────────────────────────────
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.04 } } };
const itemVariants = { hidden: { opacity: 0, y: 18, scale: 0.98 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } } };

// ─── Empty form state ────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: '', description: '', assigned_to: 'unassigned', sub_assignees: [],
  due_date: '', priority: 'medium', status: 'pending', category: 'other',
  client_id: '', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TaskRow — compact, information-dense list row
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
  const [expanded, setExpanded] = useState(false);
  const checklistItems = parseChecklist(task.description);
  const checkedItems   = taskChecklists[task.id] || [];
  const progress       = getChecklistProgress(task);
  const isCompleted    = task.status === 'completed';

  return (
    <motion.div variants={itemVariants} layout>
      <div className={`relative rounded-xl border transition-all duration-200 overflow-hidden group
        ${isCompleted ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
        {/* Left accent stripe */}
        <div className={`absolute left-0 top-0 h-full w-1 ${stripeColor}`} />

        {/* ── Main row — CSS grid, columns cannot overlap ── */}
        <div
          className="pl-5 pr-3 py-2.5 grid items-center gap-0"
          style={{ gridTemplateColumns: '24px 24px minmax(0,1fr) 160px 88px 64px 72px 110px 110px 88px 100px' }}
        >
          {/* 1 · stripe placeholder (the stripe is absolute) */}
          <span className="text-[11px] font-medium text-slate-400 select-none">
            {String(index + 1).padStart(2, '0')}
          </span>

          {/* 2 · cycle-dot */}
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
              {task.status === 'completed' && <Check className="h-2.5 w-2.5 text-blue-600" />}
              {task.status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </span>
          </button>

          {/* 3 · Title */}
          <button
            className={`min-w-0 text-left font-medium truncate transition-colors pl-1 pr-2
              ${isCompleted ? 'text-slate-400 line-through text-sm' : 'text-slate-800 hover:text-blue-700 text-sm'}`}
            onClick={() => openTaskDetail(task)}
          >
            {task.title}
          </button>

          {/* 4 · STATUS PILLS — 160px */}
          <div className="flex items-center justify-center gap-1 overflow-hidden">
            {canModifyTask(task) ? (
              <>
                {[
                  { s: 'pending',     label: 'To Do', active: 'bg-red-500 text-white border-red-500',     idle: 'bg-white text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500' },
                  { s: 'in_progress', label: 'WIP',   active: 'bg-amber-500 text-white border-amber-500', idle: 'bg-white text-slate-400 border-slate-200 hover:border-amber-300 hover:text-amber-500' },
                  { s: 'completed',   label: 'Done',  active: 'bg-blue-600 text-white border-blue-600',   idle: 'bg-white text-slate-400 border-slate-200 hover:border-blue-300 hover:text-blue-500' },
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

          {/* 5 · DEPT — 88px */}
          <div className="flex items-center justify-center overflow-hidden">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-full">
              {task.category?.toUpperCase() || 'OTHER'}
            </span>
          </div>

          {/* 6 · PRIORITY — 64px */}
          <div className="flex items-center justify-center overflow-hidden">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${priorityStyle.bg} ${priorityStyle.text}`}>
              {priorityStyle.label}
            </span>
          </div>

          {/* 7 · OVERDUE — 72px */}
          <div className="flex items-center justify-center overflow-hidden">
            {isOverdue ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 whitespace-nowrap">
                OVERDUE
              </span>
            ) : (
              <span className="text-slate-200 text-[10px]">—</span>
            )}
          </div>

          {/* 8 · ASSIGNEE — 110px */}
          <div className="flex items-center justify-start gap-1 overflow-hidden px-1">
            <User className="h-3 w-3 flex-shrink-0 text-slate-400" />
            <span className="text-[10px] text-slate-600 truncate">{getUserName(task.assigned_to)}</span>
          </div>

          {/* 9 · ASSIGNOR — 110px */}
          <div className="flex items-center justify-start gap-1 overflow-hidden px-1">
            <User className="h-3 w-3 flex-shrink-0 text-slate-300" />
            <span className="text-[10px] text-slate-400 truncate">
              {task.created_by ? getUserName(task.created_by) : '—'}
            </span>
          </div>

          {/* 10 · DUE — 88px */}
          <div className={`flex items-center justify-center gap-1 overflow-hidden px-1
            ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
            {task.due_date ? (
              <>
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span className="text-[10px] font-medium truncate">{getRelativeDueDate(task.due_date)}</span>
              </>
            ) : <span className="text-slate-300 text-[10px]">—</span>}
          </div>

          {/* 11 · ACTIONS — 100px: icons, reveal on hover */}
          <div className="flex items-center justify-end gap-0 opacity-0 group-hover:opacity-100 transition-opacity overflow-hidden">
            {canModifyTask(task) && (
              <button onClick={() => setExpanded(v => !v)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Expand">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            {canModifyTask(task) && (
              <button onClick={() => handleEdit(task)}
                className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Edit">
                <Edit className="h-3.5 w-3.5" />
              </button>
            )}
            {canModifyTask(task) && (
              <button onClick={() => handleDuplicateTask(task)}
                className="p-1 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                title="Duplicate">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {canModifyTask(task) && (
              <button onClick={() => { setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id); fetchComments(task.id); }}
                className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Comments">
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            )}
            {canDeleteTasks && (
              <button onClick={() => handleDelete(task.id)}
                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Expanded panel — checklist + status switcher + comments */}
        <AnimatePresence>
          {(expanded || openCommentTaskId === task.id) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mx-5 mb-4 space-y-3 border-t border-slate-100 pt-3">
                {/* Checklist */}
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
                    {/* Progress bar */}
                    <div className="h-1 bg-emerald-200 rounded-full mb-3 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {checklistItems.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2 cursor-pointer group/check">
                          <Checkbox
                            checked={checkedItems.includes(idx)}
                            onCheckedChange={() => toggleChecklistItem(task.id, idx)}
                            className="mt-0.5 flex-shrink-0"
                          />
                          <span className={`text-xs leading-relaxed ${checkedItems.includes(idx) ? 'line-through text-slate-400' : 'text-slate-700 group-hover/check:text-slate-900'}`}>
                            {item}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                {openCommentTaskId === task.id && (
                  <div className="space-y-2">
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {(comments[task.id] || []).map((comment, i) => (
                        <div key={i} className="text-xs bg-slate-50 rounded-lg px-3 py-2 text-slate-600 border border-slate-100">
                          {comment.text}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment…"
                        className="h-8 text-xs"
                        onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedTask(task); handleAddComment(); } }}
                      />
                      <Button size="sm" className="h-8 px-3 text-xs" onClick={() => { setSelectedTask(task); handleAddComment(); }}>
                        Post
                      </Button>
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
// BoardCard — kanban-style card
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
  const checklistItems = parseChecklist(task.description);
  const checkedItems   = taskChecklists[task.id] || [];
  const progress       = getChecklistProgress(task);
  const isCompleted    = task.status === 'completed';

  return (
    <motion.div variants={itemVariants} layout>
      <div className={`relative rounded-xl border overflow-hidden transition-all duration-200 group
        ${isCompleted ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}`}>
        {/* Top accent stripe */}
        <div className={`h-1 w-full ${stripeColor}`} />

        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => openTaskDetail(task)}
              className={`font-semibold text-sm leading-snug text-left flex-1 transition-colors
                ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800 hover:text-blue-700'}`}>
              {task.title}
            </button>
            {/* Dot menu */}
            {canModifyTask(task) && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => handleEdit(task)}
                  className="p-1 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDuplicateTask(task)}
                  className="p-1 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {canDeleteTasks && (
                  <button onClick={() => handleDelete(task.id)}
                    className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${priorityStyle.bg} ${priorityStyle.text}`}>
              {priorityStyle.label}
            </span>
            {isOverdue && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-red-100 text-red-700">Overdue</span>
            )}
            {task.is_recurring && (
              <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">↺ Recurring</span>
            )}
            {task.category && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {task.category}
              </span>
            )}
          </div>

          {/* Checklist mini preview */}
          {checklistItems.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-emerald-700">CHECKLIST</span>
                <span className="text-[10px] font-bold text-emerald-600">{checkedItems.length}/{checklistItems.length}</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="space-y-0.5 max-h-20 overflow-hidden">
                {checklistItems.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                    <div className={`w-2.5 h-2.5 rounded-sm border flex-shrink-0 flex items-center justify-center
                      ${checkedItems.includes(idx) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                      {checkedItems.includes(idx) && <Check className="h-1.5 w-1.5 text-white" />}
                    </div>
                    <span className={checkedItems.includes(idx) ? 'line-through text-slate-400' : ''}>{item}</span>
                  </div>
                ))}
                {checklistItems.length > 3 && (
                  <div className="text-[10px] text-slate-400 pl-4">+{checklistItems.length - 3} more</div>
                )}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{getUserName(task.assigned_to)}</span>
              </div>
              {task.due_date && (
                <span className={`text-xs font-medium flex items-center gap-1
                  ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {getRelativeDueDate(task.due_date)}
                </span>
              )}
            </div>
            {task.client_id && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{getClientName(task.client_id)}</span>
              </div>
            )}
          </div>

          {/* Status switcher */}
          {canModifyTask(task) && (
            <div className="grid grid-cols-3 gap-1 pt-1">
              {[
                { s: 'pending',     label: 'To Do',  active: 'bg-red-500 text-white border-red-500' },
                { s: 'in_progress', label: 'WIP',    active: 'bg-amber-500 text-white border-amber-500' },
                { s: 'completed',   label: 'Done',   active: 'bg-blue-600 text-white border-blue-600' },
              ].map(({ s, label, active }) => (
                <button key={s} onClick={() => handleQuickStatusChange(task, s)}
                  className={`h-6 text-[10px] font-semibold rounded-lg border transition-all
                    ${task.status === s ? active : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Comment inline */}
          {canModifyTask(task) && (
            <button
              onClick={() => { setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id); fetchComments(task.id); }}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-indigo-600 py-1 rounded-lg hover:bg-indigo-50 transition-colors border border-dashed border-slate-200 hover:border-indigo-200">
              <MessageSquare className="h-3 w-3" />
              {openCommentTaskId === task.id ? 'Close Comments' : 'Add Comment'}
            </button>
          )}

          {openCommentTaskId === task.id && (
            <div className="space-y-2">
              <div className="max-h-24 overflow-y-auto space-y-1">
                {(comments[task.id] || []).map((c, i) => (
                  <div key={i} className="text-[10px] bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600 border border-slate-100">
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
// Stat Card — no bottom line, per-stat active color, smooth spring animations
// ═══════════════════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, color, icon: Icon, active, onClick, activeClasses }) => {
  const activeBg     = activeClasses?.bg     || 'bg-blue-50';
  const activeBorder = activeClasses?.border || 'border-blue-300';
  const activeRing   = activeClasses?.ring   || 'ring-blue-200';
  const activeIcon   = activeClasses?.icon   || 'bg-blue-100';
  const activeIconFg = activeClasses?.iconFg || 'text-blue-600';
  const activeBar    = activeClasses?.bar    || 'bg-blue-500';

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, boxShadow: '0 6px 20px 0 rgba(0,0,0,0.07)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className={`relative rounded-xl border p-4 text-left w-full overflow-hidden transition-colors duration-200
        ${active
          ? `${activeBg} ${activeBorder} ring-1 ${activeRing} shadow-sm`
          : 'border-slate-200 bg-white'}`}
    >
      {/* Top accent bar — slides in when active, no bottom line */}
      <motion.div
        initial={false}
        animate={{ scaleX: active ? 1 : 0, opacity: active ? 1 : 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className={`absolute top-0 left-0 right-0 h-[3px] origin-left rounded-t-xl ${activeBar}`}
      />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</p>
          <motion.p
            key={value}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`text-3xl font-bold leading-none ${color}`}
          >
            {value}
          </motion.p>
        </div>
        <div className={`p-2 rounded-lg transition-colors duration-200 ${active ? activeIcon : 'bg-slate-100'}`}>
          <Icon className={`h-4 w-4 transition-colors duration-200 ${active ? activeIconFg : 'text-slate-400'}`} />
        </div>
      </div>
    </motion.button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Tasks Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function Tasks() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();

  // ── Permissions ─────────────────────────────────────────────────────────────
  const canModifyTask = (task) => {
    if (isAdmin) return true;
    return task.assigned_to === user?.id ||
      task.sub_assignees?.includes(user?.id) ||
      task.created_by === user?.id;
  };
  const canAssignTasks = hasPermission('can_assign_tasks');
  const canEditTasks   = hasPermission('can_edit_tasks');
  const canDeleteTasks = isAdmin || hasPermission('can_edit_tasks');

  // ── State ────────────────────────────────────────────────────────────────────
  const [tasks,    setTasks]    = useState([]);
  const [users,    setUsers]    = useState([]);
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(false);

  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [editingTask,   setEditingTask]   = useState(null);
  const [formData,      setFormData]      = useState({ ...EMPTY_FORM });

  const [viewMode,      setViewMode]      = useState('list');

  const [taskDetailOpen,      setTaskDetailOpen]      = useState(false);
  const [selectedDetailTask,  setSelectedDetailTask]  = useState(null);

  const [comments,            setComments]            = useState({});
  const [showCommentsDialog,  setShowCommentsDialog]  = useState(false);
  const [selectedTask,        setSelectedTask]        = useState(null);
  const [newComment,          setNewComment]          = useState('');
  const [openCommentTaskId,   setOpenCommentTaskId]   = useState(null);

  const [notifications,       setNotifications]       = useState([]);
  const [showNotifications,   setShowNotifications]   = useState(false);

  const location = useLocation();

  // ── Filters & sorting ───────────────────────────────────────────────────────
  const [searchQuery,      setSearchQuery]      = useState('');
  const [filterStatus,     setFilterStatus]     = useState('all');
  const [filterPriority,   setFilterPriority]   = useState('all');
  const [filterCategory,   setFilterCategory]   = useState('all');
  const [filterAssignee,   setFilterAssignee]   = useState('all');
  const [sortBy,           setSortBy]           = useState('due_date');
  const [sortDirection,    setSortDirection]    = useState('asc');
  const [showMyTasksOnly,  setShowMyTasksOnly]  = useState(false);
  const [activeFilters,    setActiveFilters]    = useState([]);

  // ── Checklist state ─────────────────────────────────────────────────────────
  const [taskChecklists, setTaskChecklists] = useState({});

  // ── Workflow library ────────────────────────────────────────────────────────
  const [showWorkflowLibrary,     setShowWorkflowLibrary]     = useState(false);
  const [workflowSearch,          setWorkflowSearch]          = useState('');
  const [workflowDeptFilter,      setWorkflowDeptFilter]      = useState('all');
  const [workflowFrequencyFilter, setWorkflowFrequencyFilter] = useState('all');

  const fileInputRef = useRef(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const parseChecklist = (description) => {
    if (!description) return [];
    return description.split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-') || l.startsWith('•'))
      .map(l => l.replace(/^[-•]\s*/, '').trim());
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
    const checked = taskChecklists[task.id] || [];
    return Math.round((checked.length / items.length) * 100);
  };

  const getUserName    = (id) => users.find(u => u.id === id)?.full_name || 'Unassigned';
  const getClientName  = (id) => clients.find(c => c.id === id)?.company_name || 'No Client';
  const getCategoryLabel = (v) => TASK_CATEGORIES.find(c => c.value === v)?.label || v || 'Other';

  const isOverdue = (task) => {
    if (task.status === 'completed') return false;
    if (!task.due_date) return false;
    return new Date(task.due_date) < new Date();
  };

  // ── BUG FIX: getDisplayStatus respects actual status; overdue is an overlay ─
  // The original bug: getDisplayStatus returned 'overdue' which broke stat-card
  // click filtering for 'in_progress' tasks that were also overdue.
  // Fix: keep status as-is, use isOverdue only for visual decoration.
  const getDisplayStatus = (task) => {
    if (isOverdue(task)) return 'overdue';
    return task.status || 'pending';
  };

  const getRelativeDueDate = (dueDate) => {
    if (!dueDate) return '';
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due - now) / 86400000);
    if (diffDays < 0)  return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7)  return `In ${diffDays}d`;
    return format(due, 'MMM dd');
  };

  // ── Data fetching ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTasks(); fetchClients(); fetchUsers(); fetchNotifications();
  }, [user]);

  const fetchTasks         = async () => { try { const r = await api.get('/tasks');         setTasks(r.data);         } catch { toast.error('Failed to fetch tasks'); } };
  const fetchUsers         = async () => { try { const r = await api.get('/users');         setUsers(r.data);         } catch { console.error('Failed to fetch users'); } };
  const fetchClients       = async () => { try { const r = await api.get('/clients');       setClients(r.data);       } catch { console.error('Failed to fetch clients'); } };
  const fetchNotifications = async () => { try { const r = await api.get('/notifications'); setNotifications(r.data || []); } catch {} };

  const fetchComments = async (taskId) => {
    try { const r = await api.get(`/tasks/${taskId}/comments`); setComments(prev => ({ ...prev, [taskId]: r.data })); }
    catch { toast.error('Failed to fetch comments'); }
  };

  const markAllAsRead = async () => {
    try { await api.post('/notifications/mark-all-read'); setNotifications(p => p.map(n => ({ ...n, read: true }))); toast.success('Marked all as read'); } catch {}
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────
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
        await api.patch(`/tasks/${editingTask.id}`, taskData);
        toast.success('Task updated!');
        const newAssignee = taskData.assigned_to, oldAssignee = editingTask.assigned_to;
        if (newAssignee && newAssignee !== oldAssignee) {
          api.post('/notifications/send', { title: '📋 Task Reassigned', message: `You've been assigned "${taskData.title}" by ${user?.full_name || user?.email}.`, type: 'task', user_id: newAssignee }).catch(() => {});
        }
        if (taskData.status === 'completed' && editingTask.status !== 'completed') {
          api.post('/notifications/send', { title: '✅ Task Completed', message: `"${taskData.title}" was completed.`, type: 'task' }).catch(() => {});
        }
      } else {
        await api.post('/tasks', taskData);
        toast.success('Task created!');
        if (taskData.assigned_to) {
          api.post('/notifications/send', { title: '📋 New Task Assigned', message: `New task: "${taskData.title}" assigned by ${user?.full_name || user?.email}.`, type: 'task', user_id: taskData.assigned_to }).catch(() => {});
        }
      }
      setDialogOpen(false); resetForm(); fetchTasks(); fetchNotifications();
    } catch { toast.error('Failed to save task'); }
    finally { setLoading(false); }
  };

  const handleEdit  = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title, description: task.description || '',
      assigned_to: task.assigned_to || 'unassigned', sub_assignees: task.sub_assignees || [],
      due_date: task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '',
      priority: task.priority, status: task.status, category: task.category || 'other',
      client_id: task.client_id || '', is_recurring: task.is_recurring || false,
      recurrence_pattern: task.recurrence_pattern || 'monthly',
      recurrence_interval: task.recurrence_interval || 1,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try { await api.delete(`/tasks/${taskId}`); toast.success('Task deleted!'); fetchTasks(); }
    catch { toast.error('Failed to delete task'); }
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status: newStatus });
      toast.success(`Marked as ${STATUS_STYLES[newStatus]?.label || newStatus}`);
      api.post('/notifications/send', {
        title: newStatus === 'completed' ? '✅ Task Completed' : '🔄 Status Updated',
        message: `"${task.title}" → ${STATUS_STYLES[newStatus]?.label || newStatus}`,
        type: 'task',
      }).catch(() => {});
      fetchTasks(); fetchNotifications();
    } catch { toast.error('Failed to update status'); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${selectedTask.id}/comments`, { text: newComment });
      setNewComment(''); fetchComments(selectedTask.id); toast.success('Comment added!');
      if (selectedTask.assigned_to && selectedTask.assigned_to !== user?.id) {
        api.post('/notifications/send', { title: '💬 New Comment', message: `${user?.full_name} commented on "${selectedTask.title}".`, type: 'task', user_id: selectedTask.assigned_to }).catch(() => {});
      }
      fetchNotifications();
    } catch { toast.error('Failed to add comment'); }
  };

  const handleDuplicateTask = async (task) => {
    try {
      await api.post('/tasks', { ...task, title: `${task.title} (Copy)`, status: 'pending' });
      toast.success('Task duplicated!'); fetchTasks();
    } catch { toast.error('Failed to duplicate'); }
  };

  const resetForm = () => { setFormData({ ...EMPTY_FORM }); setEditingTask(null); };

  const toggleSubAssignee = (userId) => {
    setFormData(prev => ({
      ...prev,
      sub_assignees: prev.sub_assignees.includes(userId)
        ? prev.sub_assignees.filter(id => id !== userId)
        : [...prev.sub_assignees, userId],
    }));
  };

  const openTaskDetail = (task) => { setSelectedDetailTask(task); setTaskDetailOpen(true); };

  // ── Filtering & sorting ──────────────────────────────────────────────────────
  // ── BUG FIX: filterStatus for 'in_progress' now correctly matches tasks ──────
  // Previously, overdue in_progress tasks were excluded because getDisplayStatus
  // returned 'overdue'. Now we filter on actual task.status, and only use the
  // 'overdue' filterStatus as an additional isOverdue() check.
  const filteredTasks = tasks.filter(task => {
    const matchesSearch    = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority  = filterPriority === 'all'  || task.priority  === filterPriority;
    const matchesCategory  = filterCategory === 'all'  || task.category  === filterCategory;
    const matchesAssignee  = filterAssignee === 'all'  || task.assigned_to === filterAssignee;

    // ── KEY FIX: filter on actual status, not getDisplayStatus ──────────────
    let matchesStatus = true;
    if (filterStatus !== 'all') {
      if (filterStatus === 'overdue') {
        matchesStatus = isOverdue(task);
      } else {
        // Match actual status, regardless of overdue state
        matchesStatus = task.status === filterStatus;
      }
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee;
  });

  const displayTasks = React.useMemo(() => {
    let result = [...filteredTasks];
    if (showMyTasksOnly && user?.id) {
      result = result.filter(t =>
        t.assigned_to === user.id ||
        t.sub_assignees?.includes(user.id) ||
        t.created_by === user.id
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'due_date') {
        const dA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const dB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = dA - dB;
      } else if (sortBy === 'priority') {
        const prioOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        cmp = (prioOrder[b.priority] || 0) - (prioOrder[a.priority] || 0);
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [filteredTasks, showMyTasksOnly, sortBy, sortDirection, user]);

  // ── Stats — BUG FIX: count actual status, not getDisplayStatus ──────────────
  // Stats always use the raw full tasks list — never the filtered displayTasks.
  // This ensures card counts (Total 17, To Do 3, etc.) stay constant even
  // when the user clicks a filter card or applies search/status filters.
  const stats = {
    total:      tasks.length,
    todo:       tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed:  tasks.filter(t => t.status === 'completed').length,
    overdue:    tasks.filter(t => isOverdue(t)).length,
  };

  // ── Active filter pills ──────────────────────────────────────────────────────
  useEffect(() => {
    const pills = [];
    if (searchQuery)          pills.push({ key: 'search',    label: `"${searchQuery}"` });
    if (filterStatus !== 'all')   pills.push({ key: 'status',    label: STATUS_STYLES[filterStatus]?.label || filterStatus });
    if (filterPriority !== 'all') pills.push({ key: 'priority',  label: filterPriority.toUpperCase() });
    if (filterCategory !== 'all') pills.push({ key: 'category',  label: getCategoryLabel(filterCategory) });
    if (filterAssignee !== 'all') pills.push({ key: 'assignee',  label: users.find(u => u.id === filterAssignee)?.full_name || filterAssignee });
    if (showMyTasksOnly)          pills.push({ key: 'mytasks',   label: 'My Tasks' });
    setActiveFilters(pills);
  }, [searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, showMyTasksOnly, users]);

  const removeFilter = (key) => {
    if (key === 'search')    setSearchQuery('');
    if (key === 'status')    setFilterStatus('all');
    if (key === 'priority')  setFilterPriority('all');
    if (key === 'category')  setFilterCategory('all');
    if (key === 'assignee')  setFilterAssignee('all');
    if (key === 'mytasks')   setShowMyTasksOnly(false);
  };

  const clearAllFilters = () => {
    setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all');
    setFilterCategory('all'); setFilterAssignee('all');
    setShowMyTasksOnly(false); setSortBy('due_date'); setSortDirection('asc');
    toast.success('Filters cleared');
  };

  // ── Workflow library ─────────────────────────────────────────────────────────
  const filteredWorkflows = COMPLIANCE_WORKFLOWS.filter(wf => {
    const matchSearch = wf.name.toLowerCase().includes(workflowSearch.toLowerCase()) ||
                        wf.title.toLowerCase().includes(workflowSearch.toLowerCase());
    const matchDept   = workflowDeptFilter      === 'all' || wf.category  === workflowDeptFilter;
    const matchFreq   = workflowFrequencyFilter === 'all' || wf.frequency.toLowerCase().includes(workflowFrequencyFilter.toLowerCase());
    return matchSearch && matchDept && matchFreq;
  });

  const applyComplianceWorkflow = (wf) => {
    const due = new Date(); due.setDate(due.getDate() + wf.estimatedDays);
    setFormData({
      title: wf.title, description: wf.description,
      assigned_to: 'unassigned', sub_assignees: [],
      due_date: format(due, 'yyyy-MM-dd'), priority: wf.priority, status: 'pending',
      category: wf.category, client_id: '',
      is_recurring: true, recurrence_pattern: wf.recurrence_pattern,
      recurrence_interval: wf.recurrence_interval,
    });
    setShowWorkflowLibrary(false); setDialogOpen(true);
    setWorkflowSearch(''); setWorkflowDeptFilter('all'); setWorkflowFrequencyFilter('all');
    toast.success(`Template loaded: ${wf.name}`);
  };

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleCsvUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    Papa.parse(file, { header: true, complete: async (res) => {
      try { await api.post('/tasks/bulk', { tasks: res.data }); toast.success('Tasks uploaded!'); fetchTasks(); }
      catch { toast.error('Upload failed'); }
    }});
  };

  const handleExportCsv = () => {
    const csv = Papa.unparse(tasks.map(t => ({
      title: t.title, description: t.description,
      assigned_to: getUserName(t.assigned_to), due_date: t.due_date ? format(new Date(t.due_date), 'yyyy-MM-dd') : '',
      priority: t.priority, status: t.status, category: t.category, client: getClientName(t.client_id),
    })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'tasks.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.autoTable({
      head: [['Title', 'Client', 'Priority', 'Status', 'Due Date']],
      body: tasks.map(t => [t.title, getClientName(t.client_id), t.priority.toUpperCase(),
        t.status.toUpperCase(), t.due_date ? format(new Date(t.due_date), 'MMM dd, yyyy') : ''])
    });
    doc.save('tasks.pdf');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Board column filter — BUG FIX ────────────────────────────────────────────
  // Overdue tasks of any status go to correct column based on their actual status.
  // Previously, overdue tasks always landed in "To Do" even if in_progress.
  const getBoardColumnTasks = (colStatus) =>
    displayTasks.filter(t => t.status === colStatus);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <motion.div className="space-y-5 min-h-screen bg-slate-50 p-5 rounded-2xl"
      variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500" />
          <CardContent className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>
                Task Management
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {stats.total} tasks · {stats.overdue} overdue · {stats.inProgress} in progress
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Export / Import */}
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current.click()}
                className="h-8 text-xs rounded-lg">Upload CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportCsv}
                className="h-8 text-xs rounded-lg">Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf}
                className="h-8 text-xs rounded-lg">Export PDF</Button>

              {/* Templates */}
              {canEditTasks && (
                <Button variant="outline" size="sm" onClick={() => setShowWorkflowLibrary(true)}
                  className="h-8 text-xs rounded-lg gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  <FileText className="h-3.5 w-3.5" /> CA/CS Templates
                </Button>
              )}

              {/* Notifications */}
              <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="relative h-8 w-8 p-0 rounded-lg">
                    <Bell className="h-3.5 w-3.5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 rounded-2xl shadow-xl border border-slate-200 overflow-hidden" align="end">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-slate-600" />
                      <h3 className="font-semibold text-slate-800 text-sm">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{unreadCount} new</span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="py-12 text-center">
                        <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No notifications</p>
                      </div>
                    ) : notifications.map((n) => (
                      <div key={n.id} className={`px-5 py-3.5 transition-colors hover:bg-slate-50 ${!n.read ? 'bg-blue-50/40' : ''}`}>
                        <div className="flex gap-3">
                          {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />}
                          <div className={`flex-1 ${n.read ? 'pl-4' : ''}`}>
                            <p className={`text-xs leading-relaxed ${!n.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                              {n.message}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {format(new Date(n.created_at), 'MMM dd, hh:mm a')}
                            </p>
                          </div>
                        </div>
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
                      className="h-8 px-3 text-xs rounded-lg bg-blue-700 hover:bg-blue-800 text-white gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> New Task
                    </Button>
                  </DialogTrigger>

                  {/* ── Task Form Dialog ─────────────────────────────────── */}
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>
                        {editingTask ? 'Edit Task' : 'Create New Task'}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-500">
                        {editingTask ? 'Update task details below.' : 'Fill in the details to create a new task.'}
                      </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                      {/* Title */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Task Title <span className="text-red-500">*</span>
                        </Label>
                        <Input placeholder="Enter task title" value={formData.title}
                          onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                          required className="h-9 text-sm border-slate-300" />
                      </div>

                      {/* Description */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</Label>
                        <Textarea placeholder="Describe the task (use - for checklist items)…" value={formData.description}
                          onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                          rows={3} className="text-sm border-slate-300 resize-none" />
                      </div>

                      {/* Client + Due Date */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</Label>
                          <Select value={formData.client_id || 'no_client'}
                            onValueChange={(v) => {
                              if (v === '__add_new_client__') navigate('/clients?openAddClient=true&returnTo=tasks');
                              else setFormData(p => ({ ...p, client_id: v === 'no_client' ? '' : v }));
                            }}>
                            <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue placeholder="No Client" /></SelectTrigger>
                            <SelectContent className="max-h-52 overflow-y-auto">
                              <SelectItem value="no_client">No Client</SelectItem>
                              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                              <SelectItem value="__add_new_client__" className="text-blue-600 font-semibold">+ Add New Client</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</Label>
                          <Input type="date" value={formData.due_date}
                            onChange={(e) => setFormData(p => ({ ...p, due_date: e.target.value }))}
                            className="h-9 text-sm border-slate-300" />
                        </div>
                      </div>

                      {/* Assignees */}
                      {canAssignTasks && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</Label>
                            <Select value={formData.assigned_to}
                              onValueChange={(v) => setFormData(p => ({ ...p, assigned_to: v }))}>
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
                                      <Checkbox checked={formData.sub_assignees.includes(u.id)}
                                        onCheckedChange={() => toggleSubAssignee(u.id)} />
                                      <span className="text-sm text-slate-700">{u.full_name}</span>
                                    </label>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )}

                      {/* Department */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {DEPARTMENTS.map(dept => (
                            <button key={dept.value} type="button"
                              onClick={() => setFormData(p => ({ ...p, category: dept.value }))}
                              className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all
                                ${formData.category === dept.value
                                  ? 'bg-blue-700 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                              {dept.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Priority + Status */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</Label>
                          <Select value={formData.priority} onValueChange={(v) => setFormData(p => ({ ...p, priority: v }))}>
                            <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</Label>
                          <Select value={formData.status} onValueChange={(v) => setFormData(p => ({ ...p, status: v }))}>
                            <SelectTrigger className="h-9 text-sm border-slate-300"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">To Do</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Recurring */}
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Repeat className="h-4 w-4 text-slate-500" />
                            <Label className="font-semibold text-sm">Recurring Task</Label>
                          </div>
                          <Switch checked={formData.is_recurring}
                            onCheckedChange={(c) => setFormData(p => ({ ...p, is_recurring: c }))} />
                        </div>
                        {formData.is_recurring && (
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat</Label>
                              <Select value={formData.recurrence_pattern}
                                onValueChange={(v) => setFormData(p => ({ ...p, recurrence_pattern: v }))}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {RECURRENCE_PATTERNS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Every (interval)
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input type="number" min="1" max="365" value={formData.recurrence_interval}
                                  onChange={(e) => setFormData(p => ({ ...p, recurrence_interval: parseInt(e.target.value) || 1 }))}
                                  className="w-20 h-9 text-sm" />
                                <span className="text-xs text-slate-500">
                                  {formData.recurrence_pattern === 'daily'   && 'day(s)'}
                                  {formData.recurrence_pattern === 'weekly'  && 'week(s)'}
                                  {formData.recurrence_pattern === 'monthly' && 'month(s)'}
                                  {formData.recurrence_pattern === 'yearly'  && 'year(s)'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <DialogFooter className="pt-3 border-t border-slate-200">
                        <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}
                          className="h-9 text-sm rounded-lg">Cancel</Button>
                        <Button type="submit" disabled={loading} className="h-9 text-sm rounded-lg bg-blue-700 hover:bg-blue-800">
                          {loading ? 'Saving…' : editingTask ? 'Update Task' : 'Create Task'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Stat Cards ───────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total"       value={stats.total}      color="text-slate-800"  icon={SlidersHorizontal}
          active={filterStatus === 'all'}
          activeClasses={{ bg: 'bg-slate-50', border: 'border-slate-400', ring: 'ring-slate-200', icon: 'bg-slate-200', iconFg: 'text-slate-700', bar: 'bg-slate-600' }}
          onClick={() => setFilterStatus('all')} />
        <StatCard label="To Do"       value={stats.todo}       color="text-red-600"    icon={Circle}
          active={filterStatus === 'pending'}
          activeClasses={{ bg: 'bg-red-50', border: 'border-red-300', ring: 'ring-red-100', icon: 'bg-red-100', iconFg: 'text-red-600', bar: 'bg-red-500' }}
          onClick={() => setFilterStatus(filterStatus === 'pending'     ? 'all' : 'pending')} />
        <StatCard label="In Progress" value={stats.inProgress} color="text-amber-600"  icon={TrendingUp}
          active={filterStatus === 'in_progress'}
          activeClasses={{ bg: 'bg-amber-50', border: 'border-amber-300', ring: 'ring-amber-100', icon: 'bg-amber-100', iconFg: 'text-amber-600', bar: 'bg-amber-500' }}
          onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')} />
        <StatCard label="Completed"   value={stats.completed}  color="text-blue-600"   icon={CheckCircle2}
          active={filterStatus === 'completed'}
          activeClasses={{ bg: 'bg-blue-50', border: 'border-blue-300', ring: 'ring-blue-100', icon: 'bg-blue-100', iconFg: 'text-blue-600', bar: 'bg-blue-600' }}
          onClick={() => setFilterStatus(filterStatus === 'completed'   ? 'all' : 'completed')} />
        <StatCard label="Overdue"     value={stats.overdue}    color="text-red-700"    icon={AlertCircle}
          active={filterStatus === 'overdue'}
          activeClasses={{ bg: 'bg-red-50', border: 'border-red-400', ring: 'ring-red-200', icon: 'bg-red-100', iconFg: 'text-red-700', bar: 'bg-red-700' }}
          onClick={() => setFilterStatus(filterStatus === 'overdue'     ? 'all' : 'overdue')} />
      </motion.div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}
        className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3">
        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search tasks…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm bg-slate-50 rounded-lg border-slate-200" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-xs rounded-lg bg-slate-50 border-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
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
            <SelectTrigger className="h-8 w-36 text-xs rounded-lg bg-slate-50 border-slate-200"><SelectValue placeholder="Priority" /></SelectTrigger>
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
            <SelectTrigger className="h-8 w-36 text-xs rounded-lg bg-slate-50 border-slate-200"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {TASK_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Assignee */}
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="h-8 w-36 text-xs rounded-lg bg-slate-50 border-slate-200"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={`${sortBy}-${sortDirection}`}
            onValueChange={(v) => { const [sb, sd] = v.split('-'); setSortBy(sb); setSortDirection(sd); }}>
            <SelectTrigger className="h-8 w-36 text-xs rounded-lg bg-slate-50 border-slate-200"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="due_date-asc">Due Date ↑</SelectItem>
              <SelectItem value="due_date-desc">Due Date ↓</SelectItem>
              <SelectItem value="priority-desc">Priority ↓</SelectItem>
              <SelectItem value="title-asc">Title A-Z</SelectItem>
            </SelectContent>
          </Select>

          {/* My Tasks toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={showMyTasksOnly} onCheckedChange={setShowMyTasksOnly} className="scale-75" />
            <span className="text-xs text-slate-500 whitespace-nowrap">My Tasks</span>
          </label>

          {/* View toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            <button onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all
                ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              <List className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode('board')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all
                ${viewMode === 'board' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Active Filter Pills ───────────────────────────────────────────────── */}
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
            <button onClick={clearAllFilters}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors">
              Clear all
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List / Board view ─────────────────────────────────────────────────── */}
      <div className="overflow-y-auto max-h-[calc(100vh-360px)]">
        {viewMode === 'list' ? (
          <motion.div className="space-y-1.5" variants={containerVariants}>
            {/* ── Column headers — CSS grid, exact mirror of TaskRow grid ── */}
            <div
              className="hidden sm:grid items-center pl-5 pr-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none border-b border-slate-100 mb-1.5"
              style={{ gridTemplateColumns: '24px 24px minmax(0,1fr) 160px 88px 64px 72px 110px 110px 88px 100px' }}
            >
              <span />{/* stripe */}
              <span />{/* dot */}
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
                  isOverdue={taskIsOverdue} statusStyle={statusStyle}
                  priorityStyle={priorityStyle} stripeColor={stripeColor}
                  getUserName={getUserName} getClientName={getClientName}
                  getRelativeDueDate={getRelativeDueDate}
                  getChecklistProgress={getChecklistProgress}
                  parseChecklist={parseChecklist}
                  taskChecklists={taskChecklists}
                  toggleChecklistItem={toggleChecklistItem}
                  canModifyTask={canModifyTask} canDeleteTasks={canDeleteTasks}
                  handleEdit={handleEdit} handleDelete={handleDelete}
                  handleDuplicateTask={handleDuplicateTask}
                  handleQuickStatusChange={handleQuickStatusChange}
                  openTaskDetail={openTaskDetail}
                  openCommentTaskId={openCommentTaskId}
                  setOpenCommentTaskId={setOpenCommentTaskId}
                  fetchComments={fetchComments}
                  comments={comments} newComment={newComment}
                  setNewComment={setNewComment}
                  selectedTask={selectedTask} setSelectedTask={setSelectedTask}
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
          /* Board View */
          <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-5" variants={containerVariants}>
            {[
              { status: 'pending',     title: 'To Do',       color: 'text-red-600',   bg: 'bg-red-500',   count: stats.todo },
              { status: 'in_progress', title: 'In Progress', color: 'text-amber-600', bg: 'bg-amber-500', count: stats.inProgress },
              { status: 'completed',   title: 'Completed',   color: 'text-blue-600',  bg: 'bg-blue-600',  count: stats.completed },
            ].map((col) => {
              const colTasks = getBoardColumnTasks(col.status);
              return (
                <motion.div key={col.status} variants={itemVariants} className="space-y-3">
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.bg}`} />
                    <h2 className={`text-sm font-bold ${col.color}`}>{col.title}</h2>
                    <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full ml-auto">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-3 min-h-[200px]">
                    {colTasks.map((task, index) => {
                      const taskIsOverdue = isOverdue(task);
                      const displayStatus = getDisplayStatus(task);
                      const statusStyle   = STATUS_STYLES[displayStatus] || STATUS_STYLES.pending;
                      const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                      const stripeColor   = getStripeColor(task, taskIsOverdue);
                      return (
                        <BoardCard key={task.id} task={task} index={index}
                          isOverdue={taskIsOverdue} statusStyle={statusStyle}
                          priorityStyle={priorityStyle} stripeColor={stripeColor}
                          getUserName={getUserName} getClientName={getClientName}
                          getRelativeDueDate={getRelativeDueDate}
                          getChecklistProgress={getChecklistProgress}
                          parseChecklist={parseChecklist}
                          taskChecklists={taskChecklists}
                          toggleChecklistItem={toggleChecklistItem}
                          canModifyTask={canModifyTask} canDeleteTasks={canDeleteTasks}
                          handleEdit={handleEdit} handleDelete={handleDelete}
                          handleDuplicateTask={handleDuplicateTask}
                          handleQuickStatusChange={handleQuickStatusChange}
                          openTaskDetail={openTaskDetail}
                          openCommentTaskId={openCommentTaskId}
                          setOpenCommentTaskId={setOpenCommentTaskId}
                          fetchComments={fetchComments}
                          comments={comments} newComment={newComment}
                          setNewComment={setNewComment}
                          selectedTask={selectedTask} setSelectedTask={setSelectedTask}
                          handleAddComment={handleAddComment}
                        />
                      );
                    })}
                    {colTasks.length === 0 && (
                      <div className="flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-slate-200">
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

      {/* ── Task Detail Dialog ────────────────────────────────────────────────── */}
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
                {/* Title + badges */}
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2 leading-snug">{selectedDetailTask.title}</h2>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${statusStyle.bg} ${statusStyle.text}`}>
                      {taskIsOverdue ? 'Overdue' : statusStyle.label}
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${priorityStyle.bg} ${priorityStyle.text}`}>
                      {priorityStyle.label} Priority
                    </span>
                    {selectedDetailTask.is_recurring && (
                      <span className="text-xs font-semibold bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg">↺ Recurring</span>
                    )}
                    {selectedDetailTask.category && (
                      <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg uppercase">
                        {getCategoryLabel(selectedDetailTask.category)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                {selectedDetailTask.description && (
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Notes</p>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {selectedDetailTask.description}
                    </div>
                  </div>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Assigned To',  value: getUserName(selectedDetailTask.assigned_to) },
                    { label: 'Created By',   value: selectedDetailTask.created_by ? getUserName(selectedDetailTask.created_by) : '—' },
                    { label: 'Department',   value: getCategoryLabel(selectedDetailTask.category) },
                    { label: 'Client',       value: selectedDetailTask.client_id ? getClientName(selectedDetailTask.client_id) : '—' },
                    { label: 'Due Date',     value: selectedDetailTask.due_date
                        ? `${format(new Date(selectedDetailTask.due_date), 'MMM dd, yyyy')} · ${getRelativeDueDate(selectedDetailTask.due_date)}`
                        : 'No due date' },
                    { label: 'Recurrence',   value: selectedDetailTask.is_recurring
                        ? `Every ${selectedDetailTask.recurrence_interval} ${selectedDetailTask.recurrence_pattern}(s)`
                        : 'One-time' },
                  ].map(({ label, value }) => (
                    <div key={label} className="border border-slate-200 rounded-xl p-3.5 bg-white">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                      <p className="text-sm font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Co-assignees */}
                {selectedDetailTask.sub_assignees?.length > 0 && (
                  <div className="border border-slate-200 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Co-assignees</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDetailTask.sub_assignees.map(uid => (
                        <span key={uid} className="text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">
                          {getUserName(uid)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Checklist */}
                {checklistItems.length > 0 && (
                  <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" /> Compliance Checklist
                      </p>
                      <span className="text-xs font-bold text-emerald-700">{checkedItems.length}/{checklistItems.length} · {progress}%</span>
                    </div>
                    <div className="h-1.5 bg-emerald-200 rounded-full mb-3 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {checklistItems.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2.5 cursor-pointer group">
                          <Checkbox checked={checkedItems.includes(idx)}
                            onCheckedChange={() => toggleChecklistItem(selectedDetailTask.id, idx)}
                            className="mt-0.5 flex-shrink-0" />
                          <span className={`text-sm leading-relaxed ${checkedItems.includes(idx) ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {item}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 border-t border-slate-100 pt-4">
                  {canModifyTask(selectedDetailTask) && (
                    <Button onClick={() => { handleEdit(selectedDetailTask); setTaskDetailOpen(false); }}
                      className="h-9 text-sm rounded-lg bg-blue-700 hover:bg-blue-800 text-white gap-1.5">
                      <Edit className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {canModifyTask(selectedDetailTask) && (
                    <Button variant="outline" onClick={() => { handleDuplicateTask(selectedDetailTask); setTaskDetailOpen(false); }}
                      className="h-9 text-sm rounded-lg gap-1.5">
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </Button>
                  )}
                  {canDeleteTasks && (
                    <Button variant="outline" onClick={() => { handleDelete(selectedDetailTask.id); setTaskDetailOpen(false); }}
                      className="h-9 text-sm rounded-lg text-red-600 hover:bg-red-50 border-red-200 gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Workflow Library Dialog ───────────────────────────────────────────── */}
      <Dialog open={showWorkflowLibrary} onOpenChange={setShowWorkflowLibrary}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>
              CA/CS Compliance Workflow Library
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              14 professionally curated compliance workflows. Click any template to pre-fill a task.
            </DialogDescription>
          </DialogHeader>

          {/* Workflow filters */}
          <div className="flex gap-3 sticky top-0 bg-white z-10 py-3 border-b border-slate-100">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search templates…" value={workflowSearch}
                onChange={(e) => setWorkflowSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <Select value={workflowDeptFilter} onValueChange={setWorkflowDeptFilter}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={workflowFrequencyFilter} onValueChange={setWorkflowFrequencyFilter}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Frequencies</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="every 10 years">Every 10 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {filteredWorkflows.map((wf) => {
              const steps = parseChecklist(wf.description);
              const priorityStyle = PRIORITY_STYLES[wf.priority] || PRIORITY_STYLES.medium;
              return (
                <button key={wf.id} onClick={() => applyComplianceWorkflow(wf)}
                  className="text-left border border-slate-200 rounded-xl p-5 hover:border-emerald-400 hover:shadow-md transition-all group bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          {getCategoryLabel(wf.category)}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${priorityStyle.bg} ${priorityStyle.text}`}>
                          {priorityStyle.label}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors leading-snug">{wf.name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-lg font-bold text-emerald-600">{wf.estimatedHours}h</div>
                      <div className="text-[10px] text-slate-400">{wf.frequency}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 line-clamp-1">{wf.title}</p>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Key Steps</p>
                    <div className="space-y-1">
                      {steps.slice(0, 4).map((s, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600 truncate">
                          <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" /> {s}
                        </div>
                      ))}
                      {steps.length > 4 && <div className="text-[11px] text-emerald-600 pl-4">+{steps.length - 4} more steps</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[11px] text-slate-400">Due in ~{wf.estimatedDays} days</span>
                    <span className="text-[11px] font-semibold text-emerald-600 group-hover:underline flex items-center gap-1">
                      Use Template <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredWorkflows.length === 0 && (
              <div className="col-span-2 text-center py-16 text-slate-400">No templates match your filters</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Comments full dialog ──────────────────────────────────────────────── */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Comments — {selectedTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="max-h-60 overflow-y-auto space-y-2">
              {(comments[selectedTask?.id] || []).map((c, i) => (
                <div key={i} className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                  <p className="text-sm text-slate-700">{c.text}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {getUserName(c.user_id)} · {format(new Date(c.created_at), 'MMM dd, hh:mm a')}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment…" className="h-9 text-sm" />
              <Button className="h-9 text-sm" onClick={handleAddComment}>Post</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden CSV input */}
      <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCsvUpload} />
    </motion.div>
  );
}
