import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User,
  LayoutGrid, List, Circle, ArrowRight, Check, Repeat,
  MessageSquare, Bell, FileText, Calendar as CalendarIcon,
  X, ChevronDown, AlertTriangle, Clock,
  CheckCircle2, Loader2, Copy, Eye, Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const C = {
  navy:    '#0B2A4A',
  blue:    '#1558A8',
  sky:     '#2596D4',
  teal:    '#0D9488',
  emerald: '#059669',
  amber:   '#D97706',
  orange:  '#EA580C',
  coral:   '#DC2626',
  violet:  '#7C3AED',
  slate:   '#475569',
  muted:   '#94A3B8',
  border:  '#E2E8F0',
  bg:      '#F0F4F8',
  card:    '#FFFFFF',
  text:    '#0F172A',
  sub:     '#64748B',
};

// ─── Departments ──────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { value: 'gst',          label: 'GST'          },
  { value: 'income_tax',   label: 'INCOME TAX'   },
  { value: 'accounts',     label: 'ACCOUNTS'     },
  { value: 'tds',          label: 'TDS'          },
  { value: 'roc',          label: 'ROC'          },
  { value: 'trademark',    label: 'TRADEMARK'    },
  { value: 'msme_smadhan', label: 'MSME SAMADHAN'},
  { value: 'fema',         label: 'FEMA'         },
  { value: 'dsc',          label: 'DSC'          },
  { value: 'other',        label: 'OTHER'        },
];

const TASK_CATEGORIES = DEPARTMENTS;

const RECURRENCE_PATTERNS = [
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly'  },
];

// ─── Compliance Workflow Templates ────────────────────────────────────────────
const COMPLIANCE_WORKFLOWS = [
  { id: 1,  name: 'Monthly GST Compliance',         category: 'gst',         title: 'Monthly GST Filing - GSTR-1 & GSTR-3B',           description: '- Reconcile GSTR-2B with purchase register\n- Prepare GSTR-1 (B2B/B2C/CDNR)\n- File GSTR-3B\n- Pay tax & generate challan\n- Reconcile ITC\n- Review for notices\n- Update books of accounts\n- Check HSN/SAC codes',               recurrence_pattern: 'monthly', recurrence_interval: 1,  priority: 'high',     estimatedDays: 5,  estimatedHours: 18, frequency: 'Monthly'        },
  { id: 2,  name: 'Quarterly TDS Compliance',       category: 'tds',         title: 'Quarterly TDS Return - 24Q/26Q/27Q',               description: '- Download Form 16A/27D from TRACES\n- Reconcile TDS with books\n- Prepare & file quarterly return\n- Generate TDS certificates\n- Pay TDS before due date\n- Update challan status\n- Check late fee/interest',                    recurrence_pattern: 'monthly', recurrence_interval: 3,  priority: 'high',     estimatedDays: 7,  estimatedHours: 22, frequency: 'Quarterly'      },
  { id: 3,  name: 'ROC Annual Filing (Private Ltd)',category: 'roc',         title: 'Annual ROC Filing - AOC-4 & MGT-7',                description: '- Prepare financial statements\n- File AOC-4 XBRL\n- File MGT-7\n- File MGT-8 (if applicable)\n- Board & AGM minutes\n- DIR-12 for director changes\n- Check DIN status\n- Update registers',                          recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'critical', estimatedDays: 15, estimatedHours: 45, frequency: 'Annual'         },
  { id: 4,  name: 'Income Tax Return (Company)',    category: 'income_tax',  title: 'ITR-6 Filing + Tax Audit (if applicable)',         description: '- Reconcile 26AS & AIS\n- Prepare ITR-6\n- File Tax Audit Report (3CD)\n- Pay advance tax / self assessment tax\n- Check Form 3CA/3CB\n- Upload balance sheet\n- Claim deductions u/s 10AA/80\n- MAT calculation',   recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'critical', estimatedDays: 20, estimatedHours: 55, frequency: 'Annual'         },
  { id: 5,  name: 'DSC Renewal & PAN TAN',          category: 'dsc',         title: 'DSC Renewal + PAN/TAN Compliance',                 description: '- Check DSC expiry (30 days prior)\n- Renew Class 3 DSC\n- Update PAN/TAN details\n- Link Aadhaar with PAN\n- Update DSC in MCA & GST portal\n- Verify e-filing credentials',                                    recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'medium',   estimatedDays: 3,  estimatedHours: 8,  frequency: 'Annual'         },
  { id: 6,  name: 'MSME Samadhan Filing',           category: 'msme_smadhan',title: 'MSME Delayed Payment Complaint',                   description: '- Identify delayed payments >45 days\n- File Udyam Samadhan application\n- Follow up with buyer\n- Generate reference number\n- Monitor status on portal\n- Prepare supporting documents',                           recurrence_pattern: 'monthly', recurrence_interval: 1,  priority: 'medium',   estimatedDays: 4,  estimatedHours: 12, frequency: 'Monthly'        },
  { id: 7,  name: 'FEMA Annual Return',             category: 'fema',        title: 'FC-GPR / FLA / Annual FEMA Return',                description: '- Collect foreign investment details\n- File FLA return on RBI portal\n- File FC-GPR for fresh allotment\n- File FC-TRS for transfer\n- Maintain LOU/LOC records\n- Check ECB compliance',                               recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'high',     estimatedDays: 10, estimatedHours: 30, frequency: 'Annual'         },
  { id: 8,  name: 'Trademark Renewal',              category: 'trademark',   title: 'Trademark Renewal & Monitoring',                   description: '- Check renewal due date (6 months prior)\n- File TM-R application\n- Pay renewal fee\n- Monitor opposition period\n- File TM-M for modification\n- Update trademark register',                                    recurrence_pattern: 'yearly',  recurrence_interval: 10, priority: 'medium',   estimatedDays: 5,  estimatedHours: 15, frequency: 'Every 10 Years' },
  { id: 9,  name: 'GSTR-9 Annual Reconciliation',  category: 'gst',         title: 'Annual GST Return - GSTR-9 & GSTR-9C',            description: '- Reconcile GSTR-1, 3B & 2B\n- Prepare GSTR-9\n- Audit GSTR-9C (if turnover >5Cr)\n- Reconcile ITC & output tax\n- File before 31st Dec',                                                                         recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'critical', estimatedDays: 12, estimatedHours: 35, frequency: 'Annual'         },
  { id: 10, name: 'PF & ESIC Monthly',              category: 'accounts',    title: 'Monthly PF & ESIC Contribution & Return',          description: '- Calculate PF & ESIC on salary\n- Deposit contribution by 15th\n- File ECR return\n- Reconcile challan\n- Generate Form 3A/6A',                                                                                   recurrence_pattern: 'monthly', recurrence_interval: 1,  priority: 'high',     estimatedDays: 3,  estimatedHours: 10, frequency: 'Monthly'        },
  { id: 11, name: 'Board Meeting Compliance',       category: 'roc',         title: 'Quarterly Board Meeting & Minutes',                description: '- Schedule board meeting\n- Prepare agenda & notes\n- Record minutes in MBP-1\n- File MGT-14 for resolutions\n- Update registers',                                                                                   recurrence_pattern: 'monthly', recurrence_interval: 3,  priority: 'medium',   estimatedDays: 4,  estimatedHours: 14, frequency: 'Quarterly'      },
  { id: 12, name: 'Income Tax TDS/TCS Quarterly',   category: 'tds',         title: 'TDS/TCS Quarterly Return & Certificates',          description: '- File 26Q/27Q/27EQ\n- Issue Form 16/16A\n- Reconcile with 26AS\n- Pay late fee if any',                                                                                                                           recurrence_pattern: 'monthly', recurrence_interval: 3,  priority: 'high',     estimatedDays: 6,  estimatedHours: 20, frequency: 'Quarterly'      },
  { id: 13, name: 'Company Secretarial Annual',     category: 'roc',         title: 'Annual Secretarial Compliance Package',            description: '- AGM Notice & Minutes\n- File AOC-4, MGT-7\n- DIR-3 KYC\n- DPT-3 if applicable\n- MBP-1, MBP-2 update',                                                                                                          recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'critical', estimatedDays: 18, estimatedHours: 50, frequency: 'Annual'         },
  { id: 14, name: 'GST Annual Audit',               category: 'gst',         title: 'GST Audit u/s 35(5) + GSTR-9C',                   description: '- Reconcile books with GST returns\n- Prepare reconciliation statement\n- File GSTR-9C\n- Issue audit report',                                                                                                    recurrence_pattern: 'yearly',  recurrence_interval: 1,  priority: 'critical', estimatedDays: 25, estimatedHours: 60, frequency: 'Annual'         },
];

// ─── Status / Priority Config ─────────────────────────────────────────────────
const STATUS_CFG = {
  pending:     { label: 'To Do',       color: C.coral,   bg: '#FEF2F2', icon: Circle        },
  in_progress: { label: 'In Progress', color: C.orange,  bg: '#FFF7ED', icon: Loader2       },
  completed:   { label: 'Completed',   color: C.blue,    bg: '#EFF6FF', icon: CheckCircle2  },
  overdue:     { label: 'Overdue',     color: '#991B1B', bg: '#FEF2F2', icon: AlertTriangle },
};

const PRIORITY_CFG = {
  low:      { label: 'LOW',      color: C.emerald, bg: '#ECFDF5' },
  medium:   { label: 'MEDIUM',   color: C.amber,   bg: '#FFFBEB' },
  high:     { label: 'HIGH',     color: C.orange,  bg: '#FFF7ED' },
  critical: { label: 'CRITICAL', color: C.coral,   bg: '#FEF2F2' },
};

// ─── Stripe color per task ────────────────────────────────────────────────────
const stripeFor = (task, overdue) => {
  if (overdue)                        return '#991B1B';
  if (task.status === 'completed')    return C.blue;
  if (task.status === 'in_progress')  return C.orange;
  if (task.status === 'pending')      return C.coral;
  const p = task.priority || '';
  if (p === 'critical') return C.coral;
  if (p === 'high')     return C.orange;
  if (p === 'medium')   return C.amber;
  return C.emerald;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseChecklist = (desc) => {
  if (!desc) return [];
  return desc.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('•')).map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
};

const relDue = (due_date) => {
  if (!due_date) return '';
  try {
    const d = new Date(due_date);
    const diff = Math.ceil((d - new Date()) / 86400000);
    if (diff < 0)  return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff <= 7)  return `In ${diff}d`;
    return format(d, 'MMM d');
  } catch { return ''; }
};

// ─── Motion Presets ───────────────────────────────────────────────────────────
const stagger = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Empty form ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: '', description: '', assigned_to: 'unassigned', sub_assignees: [],
  due_date: '', priority: 'medium', status: 'pending', category: 'other',
  client_id: '', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1,
};

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, Icon, active, onClick }) {
  return (
    <motion.button
      whileHover={{ y: -2, boxShadow: `0 8px 24px ${color}22` }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border transition-all duration-200"
      style={{
        background:  active ? color : C.card,
        borderColor: active ? color : C.border,
        boxShadow:   active ? `0 4px 18px ${color}33` : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: active ? 'rgba(255,255,255,0.75)' : C.muted }}>
          {label}
        </span>
        {Icon && <Icon size={13} style={{ color: active ? 'rgba(255,255,255,0.6)' : color }} />}
      </div>
      <span className="text-3xl font-black tabular-nums leading-none" style={{ color: active ? '#fff' : color }}>
        {value}
      </span>
    </motion.button>
  );
}

// ─── InlineBadge ─────────────────────────────────────────────────────────────
function Pill({ label, color, bg, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black" style={{ background: bg, color }}>
      {Icon && <Icon size={9} />}{label}
    </span>
  );
}

// ─── TaskRow (List view) ───────────────────────────────────────────────────────
function TaskRow({
  task, index, users, clients, canModifyTask, canDeleteTasks,
  taskChecklists, toggleChecklistItem,
  openCommentTaskId, setOpenCommentTaskId,
  comments, newComment, setNewComment,
  onEdit, onDelete, onDuplicate, onStatusChange, onAddComment, onOpenDetail, setSelectedTask,
}) {
  const overdue    = task.status !== 'completed' && !!task.due_date && new Date(task.due_date) < new Date();
  const dispStatus = overdue ? 'overdue' : (task.status || 'pending');
  const sCfg       = STATUS_CFG[dispStatus]    || STATUS_CFG.pending;
  const pCfg       = PRIORITY_CFG[task.priority] || PRIORITY_CFG.medium;
  const checklist  = parseChecklist(task.description);
  const checked    = taskChecklists[task.id] || [];
  const progress   = checklist.length ? Math.round((checked.length / checklist.length) * 100) : 0;
  const isDone     = task.status === 'completed';
  const stripe     = stripeFor(task, overdue);

  const userName   = (id) => users.find(u => u.id === id)?.full_name  || 'Unassigned';
  const clientName = (id) => clients.find(c => c.id === id)?.company_name || '';

  return (
    <motion.div
      layout
      variants={fadeUp}
      className="relative rounded-2xl border overflow-hidden transition-all duration-200"
      style={{
        background:  isDone ? '#F8FAFC' : C.card,
        borderColor: C.border,
        opacity:     isDone ? 0.78 : 1,
        boxShadow:   isDone ? 'none' : '0 1px 4px rgba(11,42,74,0.06)',
      }}
      whileHover={!isDone ? { y: -1, boxShadow: '0 6px 20px rgba(11,42,74,0.09)' } : {}}
    >
      {/* Left stripe */}
      <div className="absolute left-0 inset-y-0 w-[5px] rounded-l-2xl" style={{ background: stripe }} />

      <div className="pl-5 pr-5 py-4">
        {/* ── Row 1 ── */}
        <div className="flex items-start justify-between gap-3">
          {/* Left: index + title + badges */}
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <span className="text-[10px] font-black mt-1 w-5 flex-shrink-0" style={{ color: C.border }}>#{index + 1}</span>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onOpenDetail(task)}
                className="text-left font-bold text-[15px] leading-snug hover:underline decoration-slate-300 transition-colors w-full"
                style={{ color: isDone ? C.muted : C.text, textDecoration: isDone ? 'line-through' : undefined }}
              >
                {task.title}
              </button>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <Pill label={sCfg.label} color={sCfg.color} bg={sCfg.bg} icon={sCfg.icon} />
                <Pill label={pCfg.label} color={pCfg.color} bg={pCfg.bg} />
                {task.is_recurring && <Pill label="Recurring" color={C.violet} bg="#F5F3FF" icon={Repeat} />}
                {checklist.length > 0 && (
                  <Pill
                    label={`${progress}% done`}
                    color={progress === 100 ? C.emerald : C.amber}
                    bg={progress === 100 ? '#ECFDF5' : '#FFFBEB'}
                    icon={Check}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right: meta + actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Meta (hidden on mobile) */}
            <div className="hidden md:flex items-center gap-4 mr-2 text-xs font-medium" style={{ color: C.muted }}>
              {task.client_id && clientName(task.client_id) && (
                <span className="flex items-center gap-1"><Building2 size={11} />{clientName(task.client_id)}</span>
              )}
              <span className="flex items-center gap-1"><User size={11} />{userName(task.assigned_to)}</span>
              {task.created_by && task.created_by !== task.assigned_to && (
                <span className="flex items-center gap-1 text-[10px]" style={{ color: '#CBD5E1' }}>via {userName(task.created_by)}</span>
              )}
              {task.due_date && (
                <span className="flex items-center gap-1 font-semibold" style={{ color: overdue ? C.coral : C.muted }}>
                  <CalendarIcon size={11} />{relDue(task.due_date)}
                </span>
              )}
            </div>
            {/* Action buttons */}
            <button onClick={() => onOpenDetail(task)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:bg-blue-50" title="View"><Eye size={14} style={{ color: C.blue }} /></button>
            {canModifyTask(task) && <button onClick={() => onEdit(task)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:bg-blue-50" title="Edit"><Edit size={14} style={{ color: C.blue }} /></button>}
            {canModifyTask(task) && <button onClick={() => onDuplicate(task)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:bg-emerald-50" title="Duplicate"><Copy size={14} style={{ color: C.emerald }} /></button>}
            {canModifyTask(task) && (
              <button
                onClick={() => setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id)}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:bg-violet-50"
                title="Comments"
              >
                <MessageSquare size={14} style={{ color: C.violet }} />
              </button>
            )}
            {canDeleteTasks && <button onClick={() => onDelete(task.id)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:bg-red-50" title="Delete"><Trash2 size={14} style={{ color: C.coral }} /></button>}
          </div>
        </div>

        {/* Mobile meta */}
        <div className="flex md:hidden items-center gap-3 mt-2 ml-7 text-xs font-medium flex-wrap" style={{ color: C.muted }}>
          {task.client_id && clientName(task.client_id) && <span className="flex items-center gap-1"><Building2 size={11} />{clientName(task.client_id)}</span>}
          <span className="flex items-center gap-1"><User size={11} />{userName(task.assigned_to)}</span>
          {task.due_date && <span className="flex items-center gap-1 font-semibold" style={{ color: overdue ? C.coral : C.muted }}><CalendarIcon size={11} />{relDue(task.due_date)}</span>}
        </div>

        {/* Checklist */}
        {!isDone && checklist.length > 0 && (
          <div className="ml-7 mt-3 rounded-xl p-3 border" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Check size={11} style={{ color: C.emerald }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.emerald }}>Checklist · {progress}%</span>
            </div>
            <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ background: '#D1FAE5' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: C.emerald }} />
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {checklist.map((item, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={checked.includes(i)} onCheckedChange={() => toggleChecklistItem(task.id, i)} className="mt-0.5 flex-shrink-0" />
                  <span className="text-xs leading-relaxed" style={{ color: checked.includes(i) ? C.muted : '#374151', textDecoration: checked.includes(i) ? 'line-through' : 'none' }}>{item}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Status tabs */}
        {!isDone && canModifyTask(task) && (
          <div className="ml-7 mt-3 flex gap-1.5">
            {[
              { s: 'pending',     label: 'To Do',       activeStyle: { background: C.coral,  color: '#fff', borderColor: 'transparent' } },
              { s: 'in_progress', label: 'In Progress',  activeStyle: { background: C.orange, color: '#fff', borderColor: 'transparent' } },
              { s: 'completed',   label: 'Completed',    activeStyle: { background: C.blue,   color: '#fff', borderColor: 'transparent' } },
            ].map(({ s, label, activeStyle }) => (
              <button
                key={s}
                onClick={() => onStatusChange(task, s)}
                className="flex-1 h-7 text-[11px] font-bold rounded-lg border transition-all hover:opacity-80"
                style={task.status === s ? activeStyle : { background: C.bg, borderColor: C.border, color: C.slate }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Inline comments */}
        <AnimatePresence>
          {openCommentTaskId === task.id && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="ml-7 mt-3 border-t pt-3 overflow-hidden space-y-2" style={{ borderColor: C.border }}>
              <div className="max-h-28 overflow-y-auto space-y-1.5">
                {(comments[task.id] || []).length === 0
                  ? <p className="text-xs italic" style={{ color: C.muted }}>No comments yet</p>
                  : (comments[task.id] || []).map((c, i) => (
                    <div key={i} className="text-xs p-2 rounded-lg" style={{ background: C.bg }}>
                      <span className="font-semibold" style={{ color: C.navy }}>{c.user_name}: </span>
                      <span style={{ color: C.slate }}>{c.text}</span>
                    </div>
                  ))
                }
              </div>
              <div className="flex gap-2">
                <input
                  value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Write a comment…"
                  className="flex-1 h-8 px-3 text-xs rounded-lg border outline-none transition-all"
                  style={{ background: C.bg, borderColor: C.border, color: C.text }}
                  onFocus={e => { e.target.style.borderColor = C.blue; }}
                  onBlur={e => { e.target.style.borderColor = C.border; }}
                  onKeyDown={e => { if (e.key === 'Enter') { setSelectedTask(task); onAddComment(); } }}
                />
                <button onClick={() => { setSelectedTask(task); onAddComment(); }} className="h-8 px-3 text-xs font-bold rounded-lg transition-all" style={{ background: C.blue, color: '#fff' }}>
                  Post
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── BoardCard ────────────────────────────────────────────────────────────────
function BoardCard({
  task, index, users, clients, canModifyTask, canDeleteTasks,
  taskChecklists, toggleChecklistItem,
  openCommentTaskId, setOpenCommentTaskId,
  comments, newComment, setNewComment,
  onEdit, onDelete, onDuplicate, onStatusChange, onAddComment, onOpenDetail, setSelectedTask,
}) {
  const overdue    = task.status !== 'completed' && !!task.due_date && new Date(task.due_date) < new Date();
  const dispStatus = overdue ? 'overdue' : (task.status || 'pending');
  const sCfg       = STATUS_CFG[dispStatus]    || STATUS_CFG.pending;
  const pCfg       = PRIORITY_CFG[task.priority] || PRIORITY_CFG.medium;
  const checklist  = parseChecklist(task.description);
  const checked    = taskChecklists[task.id] || [];
  const progress   = checklist.length ? Math.round((checked.length / checklist.length) * 100) : 0;
  const stripe     = stripeFor(task, overdue);
  const isDone     = task.status === 'completed';

  const userName   = (id) => users.find(u => u.id === id)?.full_name  || 'Unassigned';
  const clientName = (id) => clients.find(c => c.id === id)?.company_name || '';

  return (
    <motion.div
      layout variants={fadeUp}
      className="rounded-2xl border overflow-hidden transition-all duration-200"
      style={{ background: C.card, borderColor: C.border, boxShadow: '0 1px 4px rgba(11,42,74,0.06)' }}
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(11,42,74,0.1)' }}
    >
      <div className="h-1" style={{ background: stripe }} />
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Pill label={sCfg.label} color={sCfg.color} bg={sCfg.bg} icon={sCfg.icon} />
          <Pill label={pCfg.label} color={pCfg.color} bg={pCfg.bg} />
          {task.is_recurring && <Pill label="Recurring" color={C.violet} bg="#F5F3FF" icon={Repeat} />}
        </div>
        <button onClick={() => onOpenDetail(task)} className="text-left text-sm font-bold leading-snug w-full hover:underline decoration-slate-300" style={{ color: isDone ? C.muted : C.text, textDecoration: isDone ? 'line-through' : undefined }}>
          {task.title}
        </button>
        {checklist.length > 0 && (
          <div className="rounded-xl p-2.5 text-xs" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <div className="font-bold mb-1.5" style={{ color: C.emerald }}>Checklist · {progress}%</div>
            <div className="h-1 rounded-full mb-2" style={{ background: '#D1FAE5' }}>
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: C.emerald }} />
            </div>
            {checklist.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-center gap-1 truncate" style={{ color: C.emerald }}><Check size={9} className="flex-shrink-0" />{item}</div>
            ))}
            {checklist.length > 3 && <div style={{ color: C.emerald }}>+{checklist.length - 3} more</div>}
          </div>
        )}
        <div className="space-y-1 text-xs font-medium" style={{ color: C.muted }}>
          {task.client_id && clientName(task.client_id) && <div className="flex items-center gap-1.5"><Building2 size={11} />{clientName(task.client_id)}</div>}
          <div className="flex items-center gap-1.5"><User size={11} />{userName(task.assigned_to)}</div>
          {task.created_by && task.created_by !== task.assigned_to && <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#CBD5E1' }}>via {userName(task.created_by)}</div>}
          {task.due_date && <div className="flex items-center gap-1.5 font-semibold" style={{ color: overdue ? C.coral : C.muted }}><CalendarIcon size={11} />{relDue(task.due_date)}</div>}
        </div>
        {/* Status tabs */}
        {canModifyTask(task) && (
          <div className="grid grid-cols-3 gap-1 pt-2 border-t" style={{ borderColor: C.border }}>
            {[
              { s: 'pending',     label: 'To Do',    activeStyle: { background: C.coral,  color: '#fff', borderColor: 'transparent' } },
              { s: 'in_progress', label: 'Progress', activeStyle: { background: C.orange, color: '#fff', borderColor: 'transparent' } },
              { s: 'completed',   label: 'Done',     activeStyle: { background: C.blue,   color: '#fff', borderColor: 'transparent' } },
            ].map(({ s, label, activeStyle }) => (
              <button
                key={s}
                onClick={() => onStatusChange(task, s)}
                className="h-7 text-[10px] font-bold rounded-lg border transition-all hover:opacity-80"
                style={task.status === s ? activeStyle : { background: C.bg, borderColor: C.border, color: C.slate }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 border-t" style={{ borderColor: C.border }}>
          <button onClick={() => onOpenDetail(task)} className="flex-1 h-7 text-[10px] font-bold rounded-lg hover:bg-blue-50 transition-all" style={{ color: C.blue }}>View</button>
          {canModifyTask(task) && <button onClick={() => onEdit(task)} className="flex-1 h-7 text-[10px] font-bold rounded-lg hover:bg-blue-50 transition-all" style={{ color: C.blue }}>Edit</button>}
          {canModifyTask(task) && <button onClick={() => onDuplicate(task)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-50 transition-all" style={{ color: C.emerald }}><Copy size={12} /></button>}
          {canModifyTask(task) && <button onClick={() => setOpenCommentTaskId(openCommentTaskId === task.id ? null : task.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-violet-50 transition-all" style={{ color: C.violet }}><MessageSquare size={12} /></button>}
          {canDeleteTasks && <button onClick={() => onDelete(task.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-all" style={{ color: C.coral }}><Trash2 size={12} /></button>}
        </div>
        {/* Inline comments board */}
        <AnimatePresence>
          {openCommentTaskId === task.id && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t pt-2 space-y-2" style={{ borderColor: C.border }}>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {(comments[task.id] || []).map((c, i) => (
                  <div key={i} className="text-xs p-1.5 rounded-lg" style={{ background: C.bg }}>
                    <span className="font-semibold" style={{ color: C.navy }}>{c.user_name}: </span>
                    <span style={{ color: C.slate }}>{c.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Comment…"
                  className="flex-1 h-7 px-2 text-xs rounded-lg border outline-none"
                  style={{ background: C.bg, borderColor: C.border }}
                  onKeyDown={e => { if (e.key === 'Enter') { setSelectedTask(task); onAddComment(); } }}
                />
                <button onClick={() => { setSelectedTask(task); onAddComment(); }} className="h-7 px-2.5 text-xs font-bold rounded-lg" style={{ background: C.blue, color: '#fff' }}>Post</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Tasks() {
  const { user, hasPermission } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const isAdmin        = user?.role === 'admin';
  const canAssignTasks = hasPermission('can_assign_tasks');
  const canEditTasks   = hasPermission('can_edit_tasks');
  const canDeleteTasks = isAdmin || hasPermission('can_edit_tasks');

  const canModifyTask = useCallback((task) => {
    if (isAdmin) return true;
    return task.assigned_to === user?.id || task.sub_assignees?.includes(user?.id) || task.created_by === user?.id;
  }, [isAdmin, user?.id]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [tasks,    setTasks]   = useState([]);
  const [users,    setUsers]   = useState([]);
  const [clients,  setClients] = useState([]);
  const [loading,  setLoading] = useState(false);

  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData,    setFormData]    = useState({ ...EMPTY_FORM });
  const [viewMode,    setViewMode]    = useState('list');

  const [taskDetailOpen,    setTaskDetailOpen]    = useState(false);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  const [comments,          setComments]          = useState({});
  const [selectedTask,      setSelectedTask]       = useState(null);
  const [newComment,        setNewComment]         = useState('');
  const [openCommentTaskId, setOpenCommentTaskId]  = useState(null);
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);

  const [notifications,    setNotifications]    = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);
  const [sortBy,         setSortBy]         = useState('due_date');
  const [sortDirection,  setSortDirection]  = useState('asc');

  const [showWorkflowLibrary,     setShowWorkflowLibrary]     = useState(false);
  const [taskChecklists,          setTaskChecklists]          = useState({});
  const [workflowSearch,          setWorkflowSearch]          = useState('');
  const [workflowDeptFilter,      setWorkflowDeptFilter]      = useState('all');
  const [workflowFrequencyFilter, setWorkflowFrequencyFilter] = useState('all');

  const fileInputRef = useRef(null);

  // ── URL filter sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const f = p.get('filter');
    if (f) setFilterStatus(f);
  }, [location.search]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try { const r = await api.get('/tasks'); setTasks(r.data || []); } catch { toast.error('Failed to fetch tasks'); }
  }, []);
  const fetchUsers   = useCallback(async () => { try { const r = await api.get('/users');   setUsers(r.data   || []); } catch {} }, []);
  const fetchClients = useCallback(async () => { try { const r = await api.get('/clients'); setClients(r.data || []); } catch {} }, []);
  const fetchComments = useCallback(async (taskId) => {
    try { const r = await api.get(`/tasks/${taskId}/comments`); setComments(prev => ({ ...prev, [taskId]: r.data || [] })); } catch { toast.error('Failed to fetch comments'); }
  }, []);
  const fetchNotifications = useCallback(async () => {
    try { const r = await api.get('/notifications'); setNotifications(r.data || []); } catch {}
  }, []);

  useEffect(() => {
    fetchTasks(); fetchUsers(); fetchClients(); fetchNotifications();
  }, []);

  // ── Lookup helpers ─────────────────────────────────────────────────────────
  const getUserName    = useCallback((id) => users.find(u  => u.id  === id)?.full_name     || 'Unassigned', [users]);
  const getClientName  = useCallback((id) => clients.find(c => c.id === id)?.company_name  || 'No Client', [clients]);
  const getCategoryLabel = (v) => TASK_CATEGORIES.find(c => c.value === v)?.label || v || 'Other';
  const isOverdue = (task) => task.status !== 'completed' && !!task.due_date && new Date(task.due_date) < new Date();
  const getDisplayStatus = (task) => isOverdue(task) ? 'overdue' : task.status;

  // ── STATS — computed from RAW tasks array (NOT from displayTasks) ──────────
  // BUG FIX: The original code computed stats from `displayTasks` which is
  // already filtered by filterStatus. When the user clicks "In Progress" the
  // filter changes to 'in_progress', displayTasks only contains those tasks,
  // so stats.inProgress recomputed from that subset appears correct but the
  // click-toggle logic `filterStatus === 'in_progress' ? 'all' : 'in_progress'`
  // can land in an inconsistent state. More importantly, stats should ALWAYS
  // reflect the full (or my-tasks) dataset so the numbers don't jump when a
  // filter is active. We use the raw `tasks` array here.
  const stats = useMemo(() => {
    const base = showMyTasksOnly && user?.id
      ? tasks.filter(t => t.assigned_to === user.id || t.sub_assignees?.includes(user.id) || t.created_by === user.id)
      : tasks;
    return {
      total:      base.length,
      todo:       base.filter(t => t.status === 'pending'     && !isOverdue(t)).length,
      inProgress: base.filter(t => t.status === 'in_progress' && !isOverdue(t)).length,
      completed:  base.filter(t => t.status === 'completed').length,
      overdue:    base.filter(t => isOverdue(t)).length,
    };
  }, [tasks, showMyTasksOnly, user?.id]);

  // ── Displayed task list (filtered + sorted) ────────────────────────────────
  const displayTasks = useMemo(() => {
    let list = [...tasks];
    if (showMyTasksOnly && user?.id) {
      list = list.filter(t => t.assigned_to === user.id || t.sub_assignees?.includes(user.id) || t.created_by === user.id);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
    }
    if (filterStatus   !== 'all') list = list.filter(t => getDisplayStatus(t) === filterStatus);
    if (filterPriority !== 'all') list = list.filter(t => t.priority  === filterPriority);
    if (filterCategory !== 'all') list = list.filter(t => t.category  === filterCategory);
    if (filterAssignee !== 'all') list = list.filter(t => t.assigned_to === filterAssignee);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : 8640000000000000;
        const db = b.due_date ? new Date(b.due_date).getTime() : 8640000000000000;
        cmp = da - db;
      } else if (sortBy === 'priority') {
        const o = { critical: 4, high: 3, medium: 2, low: 1 };
        cmp = (o[b.priority] || 0) - (o[a.priority] || 0);
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [tasks, showMyTasksOnly, searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, sortBy, sortDirection, user?.id]);

  // ── Active filter pills ────────────────────────────────────────────────────
  const activeFilters = useMemo(() => {
    const pills = [];
    if (searchQuery)              pills.push({ key: 'search',   label: `"${searchQuery}"` });
    if (filterStatus   !== 'all') pills.push({ key: 'status',   label: STATUS_CFG[filterStatus]?.label     || filterStatus   });
    if (filterPriority !== 'all') pills.push({ key: 'priority', label: PRIORITY_CFG[filterPriority]?.label || filterPriority });
    if (filterCategory !== 'all') pills.push({ key: 'category', label: getCategoryLabel(filterCategory) });
    if (filterAssignee !== 'all') pills.push({ key: 'assignee', label: getUserName(filterAssignee) });
    if (showMyTasksOnly)          pills.push({ key: 'mytasks',  label: 'My Tasks' });
    return pills;
  }, [searchQuery, filterStatus, filterPriority, filterCategory, filterAssignee, showMyTasksOnly, users]);

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
    setFilterCategory('all'); setFilterAssignee('all'); setShowMyTasksOnly(false);
    setSortBy('due_date'); setSortDirection('asc');
    toast.success('All filters cleared');
  };

  const toggleChecklistItem = (taskId, idx) => {
    setTaskChecklists(prev => {
      const cur = prev[taskId] || [];
      return { ...prev, [taskId]: cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx] };
    });
  };

  // ── Notifications ──────────────────────────────────────────────────────────
  const unreadCount = notifications.filter(n => !n.read && !n.is_read).length;
  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true, is_read: true })));
      toast.success('All notifications marked as read');
    } catch {}
  };

  const notify = (payload) => api.post('/notifications/send', payload).catch(() => {});

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        assigned_to:   formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
        sub_assignees: formData.sub_assignees || [],
        client_id:     formData.client_id || null,
        due_date:      formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };
      if (editingTask) {
        await api.patch(`/tasks/${editingTask.id}`, payload);
        toast.success('Task updated!');
        const newAssignee = payload.assigned_to;
        const oldAssignee = editingTask.assigned_to;
        if (newAssignee && newAssignee !== oldAssignee) {
          notify({ title: '📋 Task Reassigned', message: `You've been assigned "${payload.title}" by ${user?.full_name || 'a team member'}.`, type: 'task', user_id: newAssignee });
        }
        if (payload.status === 'completed' && editingTask.status !== 'completed') {
          notify({ title: '✅ Task Completed', message: `"${payload.title}" was completed by ${user?.full_name || 'a team member'}.`, type: 'task' });
        } else if (payload.status !== editingTask.status) {
          notify({ title: '🔄 Task Updated', message: `"${payload.title}" → ${STATUS_CFG[payload.status]?.label || payload.status}.`, type: 'task' });
        }
      } else {
        await api.post('/tasks', payload);
        toast.success('Task created!');
        if (payload.assigned_to) {
          notify({ title: '📋 New Task Assigned', message: `You've been assigned "${payload.title}" by ${user?.full_name || 'a team member'}.`, type: 'task', user_id: payload.assigned_to });
        }
      }
      setDialogOpen(false);
      resetForm();
      fetchTasks();
      fetchNotifications();
    } catch { toast.error('Failed to save task'); }
    finally { setLoading(false); }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({
      title:               task.title,
      description:         task.description || '',
      assigned_to:         task.assigned_to || 'unassigned',
      sub_assignees:       task.sub_assignees || [],
      due_date:            task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '',
      priority:            task.priority,
      status:              task.status,
      category:            task.category || 'other',
      client_id:           task.client_id || '',
      is_recurring:        task.is_recurring || false,
      recurrence_pattern:  task.recurrence_pattern || 'monthly',
      recurrence_interval: task.recurrence_interval || 1,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try { await api.delete(`/tasks/${taskId}`); toast.success('Task deleted'); fetchTasks(); }
    catch { toast.error('Failed to delete task'); }
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status: newStatus });
      toast.success(`Marked as ${STATUS_CFG[newStatus]?.label || newStatus}`);
      if (newStatus === 'completed') {
        notify({ title: '✅ Task Completed', message: `"${task.title}" was completed by ${user?.full_name || 'a team member'}.`, type: 'task' });
      } else {
        notify({ title: '🔄 Task Updated', message: `"${task.title}" → ${STATUS_CFG[newStatus]?.label || newStatus}.`, type: 'task' });
      }
      fetchTasks(); fetchNotifications();
    } catch { toast.error('Failed to update status'); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask) return;
    try {
      await api.post(`/tasks/${selectedTask.id}/comments`, { text: newComment });
      setNewComment('');
      fetchComments(selectedTask.id);
      toast.success('Comment added');
      if (selectedTask.assigned_to && selectedTask.assigned_to !== user?.id) {
        notify({ title: '💬 New Comment', message: `${user?.full_name || 'A team member'} commented on "${selectedTask.title}".`, type: 'task', user_id: selectedTask.assigned_to });
      }
      fetchNotifications();
    } catch { toast.error('Failed to add comment'); }
  };

  const handleDuplicateTask = async (task) => {
    try {
      await api.post('/tasks', {
        title: `${task.title} (Copy)`, description: task.description || '',
        assigned_to: task.assigned_to, sub_assignees: task.sub_assignees || [],
        due_date: task.due_date, priority: task.priority, status: 'pending',
        category: task.category || 'other', client_id: task.client_id,
        is_recurring: task.is_recurring || false,
        recurrence_pattern: task.recurrence_pattern || 'monthly',
        recurrence_interval: task.recurrence_interval || 1,
      });
      toast.success('Task duplicated');
      fetchTasks();
    } catch { toast.error('Failed to duplicate task'); }
  };

  const resetForm = () => { setFormData({ ...EMPTY_FORM }); setEditingTask(null); };

  const toggleSubAssignee = (uid) => {
    setFormData(prev => ({
      ...prev,
      sub_assignees: prev.sub_assignees.includes(uid)
        ? prev.sub_assignees.filter(id => id !== uid)
        : [...prev.sub_assignees, uid],
    }));
  };

  // ── Workflow library ───────────────────────────────────────────────────────
  const filteredWorkflows = useMemo(() => COMPLIANCE_WORKFLOWS.filter(wf => {
    const q = workflowSearch.toLowerCase();
    return (
      (wf.name.toLowerCase().includes(q) || wf.title.toLowerCase().includes(q)) &&
      (workflowDeptFilter === 'all' || wf.category === workflowDeptFilter) &&
      (workflowFrequencyFilter === 'all' || wf.frequency.toLowerCase().includes(workflowFrequencyFilter.toLowerCase()))
    );
  }), [workflowSearch, workflowDeptFilter, workflowFrequencyFilter]);

  const applyComplianceWorkflow = (wf) => {
    const due = new Date(); due.setDate(due.getDate() + wf.estimatedDays);
    setFormData({
      title: wf.title, description: wf.description,
      assigned_to: 'unassigned', sub_assignees: [],
      due_date: format(due, 'yyyy-MM-dd'),
      priority: wf.priority, status: 'pending', category: wf.category, client_id: '',
      is_recurring: true, recurrence_pattern: wf.recurrence_pattern, recurrence_interval: wf.recurrence_interval,
    });
    setShowWorkflowLibrary(false);
    setDialogOpen(true);
    toast.success(`Loaded: ${wf.name} (${wf.estimatedHours}h)`);
  };

  // ── CSV / PDF ──────────────────────────────────────────────────────────────
  const handleCsvUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    Papa.parse(file, {
      header: true,
      complete: async (res) => {
        try { await api.post('/tasks/bulk', { tasks: res.data }); toast.success('Tasks uploaded!'); fetchTasks(); }
        catch { toast.error('Upload failed'); }
      },
    });
  };
  const handleExportCsv = () => {
    const csv = Papa.unparse(tasks.map(t => ({
      title: t.title, description: t.description,
      assigned_to: getUserName(t.assigned_to),
      due_date: t.due_date ? format(new Date(t.due_date), 'yyyy-MM-dd') : '',
      priority: t.priority, status: t.status, category: t.category,
      client: getClientName(t.client_id),
    })));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'tasks.csv' });
    a.click();
  };
  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.autoTable({ head: [['Title', 'Client', 'Priority', 'Status', 'Due Date']], body: tasks.map(t => [t.title, getClientName(t.client_id), t.priority.toUpperCase(), t.status.toUpperCase(), t.due_date ? format(new Date(t.due_date), 'MMM dd, yyyy') : '']) });
    doc.save('tasks.pdf');
  };

  // ── Shared card props ──────────────────────────────────────────────────────
  const cardProps = {
    users, clients, canModifyTask, canDeleteTasks,
    taskChecklists, toggleChecklistItem,
    openCommentTaskId, setOpenCommentTaskId,
    comments, newComment, setNewComment,
    onEdit: handleEdit, onDelete: handleDelete, onDuplicate: handleDuplicateTask,
    onStatusChange: handleQuickStatusChange, onAddComment: handleAddComment,
    onOpenDetail: (task) => { setSelectedDetailTask(task); setTaskDetailOpen(true); fetchComments(task.id); },
    setSelectedTask,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-12" style={{ background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b bg-white px-6 py-4" style={{ borderColor: C.border, boxShadow: '0 1px 8px rgba(11,42,74,0.06)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight" style={{ color: C.navy }}>Task Management</h1>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: C.muted }}>
              {displayTasks.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {format(new Date(), 'EEEE, d MMM yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Secondary actions */}
            <button onClick={() => fileInputRef.current.click()} className="h-8 px-3 text-xs font-bold rounded-xl border transition-all hover:bg-slate-50" style={{ borderColor: C.border, color: C.slate }}>Upload CSV</button>
            <button onClick={handleExportCsv} className="h-8 px-3 text-xs font-bold rounded-xl border transition-all hover:bg-slate-50" style={{ borderColor: C.border, color: C.slate }}>Export CSV</button>
            <button onClick={handleExportPdf} className="h-8 px-3 text-xs font-bold rounded-xl border transition-all hover:bg-slate-50" style={{ borderColor: C.border, color: C.slate }}>Export PDF</button>

            {canEditTasks && (
              <button
                onClick={() => setShowWorkflowLibrary(true)}
                className="h-8 px-3 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all hover:bg-emerald-50"
                style={{ borderColor: C.emerald, color: C.emerald }}
              >
                <FileText size={12} />CA/CS Templates
              </button>
            )}

            {/* Notifications */}
            <Popover open={showNotifications} onOpenChange={setShowNotifications}>
              <PopoverTrigger asChild>
                <button className="relative h-8 w-8 flex items-center justify-center rounded-xl border transition-all hover:bg-slate-50" style={{ borderColor: C.border }}>
                  <Bell size={14} style={{ color: C.slate }} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-black rounded-full text-white" style={{ background: C.coral }}>
                      {unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 rounded-2xl shadow-2xl border overflow-hidden" style={{ borderColor: C.border }} align="end">
                <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: C.border, background: C.bg }}>
                  <div className="flex items-center gap-2"><Bell size={13} style={{ color: C.navy }} /><span className="text-sm font-black" style={{ color: C.navy }}>Notifications</span></div>
                  {unreadCount > 0 && <button onClick={markAllAsRead} className="text-xs font-bold" style={{ color: C.blue }}>Mark all read</button>}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y" style={{ divideColor: C.border }}>
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center"><Bell size={24} className="mx-auto mb-2" style={{ color: C.border }} /><p className="text-sm font-medium" style={{ color: C.muted }}>All caught up!</p></div>
                  ) : notifications.slice(0, 30).map(n => (
                    <div key={n.id} className="px-5 py-3 hover:bg-slate-50 transition-colors" style={{ background: (!n.read && !n.is_read) ? '#EFF6FF' : 'transparent' }}>
                      {(!n.read && !n.is_read) && <div className="w-1.5 h-1.5 rounded-full mb-1" style={{ background: C.blue }} />}
                      <p className="text-xs font-semibold leading-snug" style={{ color: C.text }}>{n.message || n.title}</p>
                      <p className="text-[10px] mt-1" style={{ color: C.muted }}>{n.created_at ? format(new Date(n.created_at), 'MMM d, h:mm a') : ''}</p>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* New Task */}
            {canEditTasks && (
              <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => { setEditingTask(null); setFormData({ ...EMPTY_FORM }); }}
                    className="h-8 px-4 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all"
                    style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.blue} 100%)`, color: '#fff', boxShadow: `0 4px 14px ${C.navy}28` }}
                  >
                    <Plus size={13} />New Task
                  </button>
                </DialogTrigger>

                {/* ── Task Form ── */}
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black" style={{ color: C.navy }}>
                      {editingTask ? 'Edit Task' : 'Create New Task'}
                    </DialogTitle>
                    <DialogDescription style={{ color: C.muted }}>
                      {editingTask ? 'Update the task details below.' : 'Fill in the details to create a new task.'}
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="space-y-5 mt-2">
                    {/* Title */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Title *</Label>
                      <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="What needs to be done?" required className="rounded-xl border h-10" style={{ borderColor: C.border }} />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Description</Label>
                      <Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Describe the task (start lines with - to create checklist items)…" rows={4} className="rounded-xl border" style={{ borderColor: C.border }} />
                    </div>

                    {/* Client + Due */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Client</Label>
                        <Select value={formData.client_id || 'no_client'} onValueChange={v => { if (v === '__add__') { navigate('/clients?openAddClient=true&returnTo=tasks'); } else { setFormData(p => ({ ...p, client_id: v === 'no_client' ? '' : v })); } }}>
                          <SelectTrigger className="rounded-xl h-10" style={{ borderColor: C.border }}><SelectValue placeholder="No Client" /></SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            <SelectItem value="no_client">No Client</SelectItem>
                            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                            <SelectItem value="__add__" className="text-blue-600 font-semibold">+ Add New Client</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Due Date</Label>
                        <Input type="date" value={formData.due_date} onChange={e => setFormData(p => ({ ...p, due_date: e.target.value }))} className="rounded-xl h-10" style={{ borderColor: C.border }} />
                      </div>
                    </div>

                    {/* Assignee + Co-assignees */}
                    {canAssignTasks && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Assignee</Label>
                          <Select value={formData.assigned_to} onValueChange={v => setFormData(p => ({ ...p, assigned_to: v }))}>
                            <SelectTrigger className="rounded-xl h-10" style={{ borderColor: C.border }}><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Co-assignees</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className="w-full h-10 px-3 text-sm rounded-xl border flex items-center justify-between" style={{ borderColor: C.border, color: formData.sub_assignees.length ? C.text : C.muted }}>
                                {formData.sub_assignees.length > 0 ? `${formData.sub_assignees.length} selected` : 'Select…'}<ChevronDown size={14} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 max-h-52 overflow-y-auto p-2">
                              {users.filter(u => u.id !== formData.assigned_to).map(u => (
                                <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-slate-50">
                                  <Checkbox checked={formData.sub_assignees.includes(u.id)} onCheckedChange={() => toggleSubAssignee(u.id)} />
                                  <span className="text-sm">{u.full_name}</span>
                                </label>
                              ))}
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}

                    {/* Department */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Department</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {DEPARTMENTS.map(d => (
                          <button
                            key={d.value} type="button"
                            onClick={() => setFormData(p => ({ ...p, category: d.value }))}
                            className="h-8 px-3 text-xs font-bold rounded-lg border transition-all"
                            style={formData.category === d.value ? { background: C.navy, color: '#fff', borderColor: C.navy } : { background: C.bg, color: C.slate, borderColor: C.border }}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority + Status */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Priority</Label>
                        <Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v }))}>
                          <SelectTrigger className="rounded-xl h-10" style={{ borderColor: C.border }}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Status</Label>
                        <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                          <SelectTrigger className="rounded-xl h-10" style={{ borderColor: C.border }}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">To Do</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Recurring */}
                    <div className="rounded-xl border p-4 space-y-3" style={{ background: C.bg, borderColor: C.border }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><Repeat size={13} style={{ color: C.violet }} /><Label className="text-sm font-bold cursor-pointer" style={{ color: C.text }}>Recurring Task</Label></div>
                        <Switch checked={formData.is_recurring} onCheckedChange={c => setFormData(p => ({ ...p, is_recurring: c }))} />
                      </div>
                      {formData.is_recurring && (
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t" style={{ borderColor: C.border }}>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold" style={{ color: C.muted }}>Pattern</Label>
                            <Select value={formData.recurrence_pattern} onValueChange={v => setFormData(p => ({ ...p, recurrence_pattern: v }))}>
                              <SelectTrigger className="rounded-xl h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>{RECURRENCE_PATTERNS.map(rp => <SelectItem key={rp.value} value={rp.value}>{rp.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold" style={{ color: C.muted }}>Every</Label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="1" max="365" value={formData.recurrence_interval} onChange={e => setFormData(p => ({ ...p, recurrence_interval: parseInt(e.target.value) || 1 }))} className="w-20 rounded-xl h-9" />
                              <span className="text-xs" style={{ color: C.muted }}>
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

                    <DialogFooter className="pt-4 border-t gap-2" style={{ borderColor: C.border }}>
                      <button type="button" onClick={() => { setDialogOpen(false); resetForm(); }} className="h-9 px-5 text-sm font-bold rounded-xl border transition-all hover:bg-slate-50" style={{ borderColor: C.border, color: C.slate }}>Cancel</button>
                      <button type="submit" disabled={loading} className="h-9 px-5 text-sm font-black rounded-xl transition-all disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.blue})`, color: '#fff' }}>
                        {loading ? 'Saving…' : editingTask ? 'Update Task' : 'Create Task'}
                      </button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pt-5 space-y-5">

        {/* ── STAT CARDS ─────────────────────────────────────────────────────── */}
        {/* NOTE: stats are sourced from raw `tasks`, completely independent of
            filterStatus, so clicking "In Progress" never zeroes out the count */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: 'all',         label: 'Total',       value: stats.total,      color: C.navy,    Icon: Filter        },
            { key: 'pending',     label: 'To Do',       value: stats.todo,       color: C.coral,   Icon: Circle        },
            { key: 'in_progress', label: 'In Progress', value: stats.inProgress, color: C.orange,  Icon: Loader2       },
            { key: 'completed',   label: 'Completed',   value: stats.completed,  color: C.blue,    Icon: CheckCircle2  },
            { key: 'overdue',     label: 'Overdue',     value: stats.overdue,    color: '#991B1B', Icon: AlertTriangle },
          ].map(s => (
            <motion.div key={s.key} variants={fadeUp}>
              <StatCard
                {...s}
                active={filterStatus === s.key}
                onClick={() => setFilterStatus(prev => prev === s.key ? 'all' : s.key)}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* ── SEARCH + FILTERS ────────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tasks…"
                className="h-9 pl-8 pr-4 text-sm rounded-xl border outline-none w-56 transition-all"
                style={{ background: C.card, borderColor: C.border, color: C.text }}
                onFocus={e => { e.target.style.borderColor = C.blue; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
              />
            </div>

            {/* Priority filter */}
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="h-9 px-3 text-xs font-bold rounded-xl border outline-none cursor-pointer" style={{ background: C.card, borderColor: C.border, color: filterPriority !== 'all' ? C.navy : C.slate }}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            {/* Category filter */}
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="h-9 px-3 text-xs font-bold rounded-xl border outline-none cursor-pointer" style={{ background: C.card, borderColor: C.border, color: filterCategory !== 'all' ? C.navy : C.slate }}>
              <option value="all">All Depts</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>

            {/* Assignee filter */}
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="h-9 px-3 text-xs font-bold rounded-xl border outline-none cursor-pointer" style={{ background: C.card, borderColor: C.border, color: filterAssignee !== 'all' ? C.navy : C.slate }}>
              <option value="all">All Assignees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>

            {/* My Tasks */}
            <button
              onClick={() => setShowMyTasksOnly(p => !p)}
              className="h-9 px-3 text-xs font-bold rounded-xl border transition-all"
              style={showMyTasksOnly ? { background: C.navy, color: '#fff', borderColor: C.navy } : { background: C.card, borderColor: C.border, color: C.slate }}
            >
              My Tasks
            </button>

            {/* Sort */}
            <select
              value={`${sortBy}:${sortDirection}`}
              onChange={e => { const [by, dir] = e.target.value.split(':'); setSortBy(by); setSortDirection(dir); }}
              className="h-9 px-3 text-xs font-bold rounded-xl border outline-none cursor-pointer"
              style={{ background: C.card, borderColor: C.border, color: C.slate }}
            >
              <option value="due_date:asc">Due Date ↑</option>
              <option value="due_date:desc">Due Date ↓</option>
              <option value="priority:desc">Priority ↓</option>
              <option value="priority:asc">Priority ↑</option>
              <option value="title:asc">Title A→Z</option>
              <option value="status:asc">Status</option>
            </select>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl border" style={{ background: C.bg, borderColor: C.border }}>
            {[{ m: 'list', icon: List, label: 'List' }, { m: 'board', icon: LayoutGrid, label: 'Board' }].map(({ m, icon: Icon, label }) => (
              <button
                key={m} onClick={() => setViewMode(m)}
                className="flex items-center gap-1.5 h-7 px-3 text-xs font-bold rounded-lg transition-all"
                style={viewMode === m ? { background: C.card, color: C.navy, boxShadow: '0 1px 4px rgba(11,42,74,0.1)' } : { color: C.muted }}
              >
                <Icon size={12} />{label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Active filter pills */}
        <AnimatePresence>
          {activeFilters.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-2">
              {activeFilters.map(f => (
                <button key={f.key} onClick={() => removeFilter(f.key)} className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-bold rounded-lg border transition-all hover:bg-slate-100" style={{ background: C.card, borderColor: C.border, color: C.slate }}>
                  {f.label}<X size={10} />
                </button>
              ))}
              <button onClick={clearAllFilters} className="text-xs font-bold underline" style={{ color: C.coral }}>Clear all</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TASK LIST / BOARD ────────────────────────────────────────────────── */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 360px)' }}>
          {viewMode === 'list' ? (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-2.5">
              {displayTasks.length === 0 ? (
                <motion.div variants={fadeUp} className="py-20 text-center rounded-2xl border" style={{ background: C.card, borderColor: C.border }}>
                  <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: C.border }} />
                  <p className="text-sm font-bold" style={{ color: C.slate }}>No tasks found</p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>Try adjusting your filters or create a new task</p>
                </motion.div>
              ) : (
                displayTasks.map((task, i) => <TaskRow key={task.id} task={task} index={i} {...cardProps} />)
              )}
            </motion.div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {[
                { status: 'pending',     title: 'To Do',       count: stats.todo,       accent: C.coral  },
                { status: 'in_progress', title: 'In Progress',  count: stats.inProgress, accent: C.orange },
                { status: 'completed',   title: 'Completed',    count: stats.completed,  accent: C.blue   },
              ].map(col => (
                <motion.div key={col.status} variants={fadeUp} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.accent }} />
                      <span className="text-sm font-black" style={{ color: C.navy }}>{col.title}</span>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: `${col.accent}18`, color: col.accent }}>{col.count}</span>
                  </div>
                  <div className="space-y-3 min-h-[200px]">
                    {displayTasks
                      .filter(t => col.status === 'pending' ? (t.status === 'pending' || isOverdue(t)) : t.status === col.status)
                      .map((task, i) => <BoardCard key={task.id} task={task} index={i} {...cardProps} />)
                    }
                    {displayTasks.filter(t => col.status === 'pending' ? (t.status === 'pending' || isOverdue(t)) : t.status === col.status).length === 0 && (
                      <div className="rounded-2xl border border-dashed py-10 text-center" style={{ borderColor: C.border }}>
                        <p className="text-xs font-medium" style={{ color: C.muted }}>No tasks</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── TASK DETAIL DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black" style={{ color: C.navy }}>Task Details</DialogTitle>
            <DialogDescription className="sr-only">Full details for the selected task.</DialogDescription>
          </DialogHeader>

          {selectedDetailTask && (() => {
            const task = selectedDetailTask;
            const overdue = task.status !== 'completed' && task.due_date && new Date(task.due_date) < new Date();
            const dispS  = overdue ? 'overdue' : (task.status || 'pending');
            const sCfg   = STATUS_CFG[dispS]          || STATUS_CFG.pending;
            const pCfg   = PRIORITY_CFG[task.priority] || PRIORITY_CFG.medium;
            const checklist = parseChecklist(task.description);
            const checked   = taskChecklists[task.id] || [];
            const progress  = checklist.length ? Math.round((checked.length / checklist.length) * 100) : 0;
            return (
              <div className="space-y-5 mt-4">
                <div>
                  <h2 className="text-2xl font-black mb-2.5" style={{ color: C.text }}>{task.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Pill label={sCfg.label} color={sCfg.color} bg={sCfg.bg} icon={sCfg.icon} />
                    <Pill label={pCfg.label} color={pCfg.color} bg={pCfg.bg} />
                    {task.is_recurring && <Pill label="Recurring" color={C.violet} bg="#F5F3FF" icon={Repeat} />}
                  </div>
                </div>

                {task.description && (
                  <div className="rounded-2xl border p-5" style={{ background: C.bg, borderColor: C.border }}>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.muted }}>Notes & Description</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: C.slate }}>{task.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: 'Assigned To', value: getUserName(task.assigned_to) },
                    { label: 'Created By',  value: getUserName(task.created_by)  },
                    { label: 'Department',  value: getCategoryLabel(task.category) },
                    { label: 'Client',      value: task.client_id ? getClientName(task.client_id) : '—' },
                    { label: 'Due Date',    value: task.due_date ? format(new Date(task.due_date), 'MMM dd, yyyy') : '—' },
                    { label: 'Relative',    value: task.due_date ? relDue(task.due_date) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border p-4" style={{ borderColor: C.border }}>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: C.muted }}>{label}</p>
                      <p className="text-sm font-bold" style={{ color: C.text }}>{value}</p>
                    </div>
                  ))}
                </div>

                {task.sub_assignees?.length > 0 && (
                  <div className="rounded-xl border p-4" style={{ borderColor: C.border }}>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.muted }}>Co-assignees</p>
                    <div className="flex flex-wrap gap-2">
                      {task.sub_assignees.map(uid => (
                        <span key={uid} className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: `${C.blue}12`, color: C.blue }}>{getUserName(uid)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {checklist.length > 0 && (
                  <div className="rounded-2xl border p-5" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.emerald }}>Compliance Checklist · {progress}%</p>
                    <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: '#D1FAE5' }}>
                      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: C.emerald }} />
                    </div>
                    <div className="space-y-2">
                      {checklist.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2 cursor-pointer">
                          <Checkbox checked={checked.includes(idx)} onCheckedChange={() => toggleChecklistItem(task.id, idx)} className="mt-0.5" />
                          <span className="text-sm" style={{ color: checked.includes(idx) ? C.muted : C.text, textDecoration: checked.includes(idx) ? 'line-through' : 'none' }}>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments in detail */}
                <div className="rounded-2xl border p-5" style={{ borderColor: C.border }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.muted }}>Comments</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                    {(comments[task.id] || []).length === 0
                      ? <p className="text-xs italic" style={{ color: C.muted }}>No comments yet</p>
                      : (comments[task.id] || []).map((c, i) => (
                        <div key={i} className="p-2.5 rounded-xl text-xs" style={{ background: C.bg }}>
                          <span className="font-bold" style={{ color: C.navy }}>{c.user_name}: </span>
                          <span style={{ color: C.slate }}>{c.text}</span>
                          {c.created_at && <div className="mt-0.5" style={{ color: C.muted }}>{format(new Date(c.created_at), 'MMM d, h:mm a')}</div>}
                        </div>
                      ))
                    }
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newComment} onChange={e => setNewComment(e.target.value)}
                      placeholder="Write a comment…"
                      className="flex-1 h-9 px-3 text-sm rounded-xl border outline-none"
                      style={{ background: C.bg, borderColor: C.border }}
                      onKeyDown={e => { if (e.key === 'Enter') { setSelectedTask(task); handleAddComment(); } }}
                    />
                    <button onClick={() => { setSelectedTask(task); handleAddComment(); }} className="h-9 px-4 text-sm font-bold rounded-xl" style={{ background: C.blue, color: '#fff' }}>Post</button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t" style={{ borderColor: C.border }}>
                  {canModifyTask(task) && (
                    <button onClick={() => { handleEdit(task); setTaskDetailOpen(false); }} className="flex items-center gap-2 h-9 px-4 text-sm font-bold rounded-xl" style={{ background: C.blue, color: '#fff' }}>
                      <Edit size={14} />Edit
                    </button>
                  )}
                  {canModifyTask(task) && (
                    <button onClick={() => { handleDuplicateTask(task); setTaskDetailOpen(false); }} className="flex items-center gap-2 h-9 px-4 text-sm font-bold rounded-xl border hover:bg-slate-50 transition-all" style={{ borderColor: C.border, color: C.slate }}>
                      <Copy size={14} />Duplicate
                    </button>
                  )}
                  {canDeleteTasks && (
                    <button onClick={() => { handleDelete(task.id); setTaskDetailOpen(false); }} className="flex items-center gap-2 h-9 px-4 text-sm font-bold rounded-xl border hover:bg-red-50 transition-all" style={{ borderColor: `${C.coral}40`, color: C.coral }}>
                      <Trash2 size={14} />Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── WORKFLOW LIBRARY ────────────────────────────────────────────────── */}
      <Dialog open={showWorkflowLibrary} onOpenChange={setShowWorkflowLibrary}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black" style={{ color: C.navy }}>CA/CS Compliance Workflow Library</DialogTitle>
            <DialogDescription style={{ color: C.muted }}>14 professionally curated statutory workflows. Click any template to auto-fill the task form.</DialogDescription>
          </DialogHeader>

          {/* Workflow search + filters */}
          <div className="flex gap-3 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.border }}>
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input value={workflowSearch} onChange={e => setWorkflowSearch(e.target.value)} placeholder="Search templates…" className="w-full h-9 pl-8 pr-3 text-sm rounded-xl border outline-none" style={{ background: C.bg, borderColor: C.border }} />
            </div>
            <select value={workflowDeptFilter} onChange={e => setWorkflowDeptFilter(e.target.value)} className="h-9 px-3 text-xs font-bold rounded-xl border outline-none w-44" style={{ background: C.bg, borderColor: C.border }}>
              <option value="all">All Departments</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <select value={workflowFrequencyFilter} onChange={e => setWorkflowFrequencyFilter(e.target.value)} className="h-9 px-3 text-xs font-bold rounded-xl border outline-none w-40" style={{ background: C.bg, borderColor: C.border }}>
              <option value="all">All Frequencies</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="every 10 years">Every 10 Years</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-5">
            {filteredWorkflows.map(wf => {
              const steps = parseChecklist(wf.description);
              return (
                <motion.button
                  key={wf.id}
                  whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(11,42,74,0.10)' }}
                  onClick={() => applyComplianceWorkflow(wf)}
                  className="text-left rounded-2xl border p-5 transition-all w-full"
                  style={{ background: C.card, borderColor: C.border }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 mr-3">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mb-2 inline-block" style={{ background: `${C.blue}12`, color: C.blue }}>{getCategoryLabel(wf.category)}</span>
                      <h3 className="font-black text-base leading-snug" style={{ color: C.navy }}>{wf.name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-black" style={{ color: C.emerald }}>{wf.estimatedHours}h</div>
                      <div className="text-[10px] font-bold" style={{ color: C.muted }}>{wf.frequency}</div>
                    </div>
                  </div>
                  <p className="text-xs line-clamp-2 mb-3" style={{ color: C.muted }}>{wf.title}</p>
                  <div className="rounded-xl p-3 space-y-1" style={{ background: C.bg }}>
                    {steps.slice(0, 3).map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: C.slate }}><Check size={10} style={{ color: C.emerald }} />{s}</div>
                    ))}
                    {steps.length > 3 && <div className="text-xs font-bold" style={{ color: C.emerald }}>+{steps.length - 3} more steps</div>}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs font-medium" style={{ color: C.muted }}>Due in {wf.estimatedDays} days</span>
                    <span className="text-xs font-black flex items-center gap-1" style={{ color: C.blue }}>Use Template <ArrowRight size={11} /></span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {filteredWorkflows.length === 0 && (
            <div className="py-16 text-center" style={{ color: C.muted }}>
              <FileText size={32} className="mx-auto mb-3" style={{ color: C.border }} />
              <p className="font-medium">No matching templates</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── COMMENTS FULL DIALOG ────────────────────────────────────────────── */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black" style={{ color: C.navy }}>Comments — {selectedTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="max-h-56 overflow-y-auto space-y-2">
              {(comments[selectedTask?.id] || []).map((c, i) => (
                <div key={i} className="border-b pb-2" style={{ borderColor: C.border }}>
                  <p className="text-sm" style={{ color: C.text }}>{c.text}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                    By {getUserName(c.user_id)}{c.created_at ? ` · ${format(new Date(c.created_at), 'MMM dd, yyyy hh:mm a')}` : ''}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 h-9 px-3 text-sm rounded-xl border outline-none"
                style={{ background: C.bg, borderColor: C.border }}
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
              />
              <button onClick={handleAddComment} className="h-9 px-4 text-sm font-bold rounded-xl" style={{ background: C.blue, color: '#fff' }}>Post</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden CSV input */}
      <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleCsvUpload} />
    </div>
  );
}
