import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye,
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase,
  Mail, Phone, Calendar, Camera, Clock, UserCheck, UserX,
  AlertCircle, KeyRound, Receipt, Target, Zap, Lock, ChevronRight,
  Activity, BarChart2, Star, Layers, FileText, Bell,
  Hash, ArrowUpRight, SlidersHorizontal, ShieldCheck,
  ShieldOff, Fingerprint, Download, Pencil, Inbox, X,
  Monitor, Wifi, WifiOff, RefreshCw, Radar, Loader2,
  Network, Save, ClipboardList, LayoutDashboard, AlertTriangle, MapPin, UserMinus, ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  indigo:       '#4F46E5',
  violet:       '#7C3AED',
  teal:         '#0F766E',
  amber:        '#B45309',
  coral:        '#FF6B6B',
  slate:        '#475569',
  red:          '#ef4444',
  green:        '#059669',
  border:       '#e2e8f0',
};

const GRADIENT   = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;
const GRAD_GREEN = `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`;

const slimScroll = {
  overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent',
};

if (typeof document !== 'undefined' && !document.getElementById('users-slim-scroll')) {
  const s = document.createElement('style');
  s.id = 'users-slim-scroll';
  s.textContent = `
    .users-slim::-webkit-scrollbar { width: 3px; }
    .users-slim::-webkit-scrollbar-track { background: transparent; }
    .users-slim::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    .dark .users-slim::-webkit-scrollbar-thumb { background: #475569; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(s);
}

const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
};
const slideIn = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

// ── Department Config ─────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { value: 'GST',   label: 'GST',   color: '#1E3A8A', bg: '#EFF6FF' },
  { value: 'IT',    label: 'IT',    color: '#374151', bg: '#F9FAFB' },
  { value: 'ACC',   label: 'ACC',   color: '#065F46', bg: '#ECFDF5' },
  { value: 'TDS',   label: 'TDS',   color: '#1F2937', bg: '#F9FAFB' },
  { value: 'ROC',   label: 'ROC',   color: '#7C2D12', bg: '#FFF7ED' },
  { value: 'TM',    label: 'TM',    color: '#0F766E', bg: '#F0FDFA' },
  { value: 'MSME',  label: 'MSME',  color: '#92400E', bg: '#FFFBEB' },
  { value: 'FEMA',  label: 'FEMA',  color: '#334155', bg: '#F8FAFC' },
  { value: 'DSC',   label: 'DSC',   color: '#3F3F46', bg: '#FAFAFA' },
  { value: 'OTHER', label: 'OTHER', color: '#475569', bg: '#F8FAFC' },
];

const ROLE_CONFIG = {
  admin:   { gradient: 'from-violet-600 to-indigo-600', hex: '#7C3AED', icon: Crown,     label: 'Admin'   },
  manager: { gradient: 'from-blue-500 to-cyan-500',     hex: '#1F6FB2', icon: Briefcase, label: 'Manager' },
  staff:   { gradient: 'from-slate-400 to-slate-500',   hex: '#475569', icon: UserIcon,  label: 'Staff'   },
};

// ── Transfer Options for Offboarding Dialog ───────────────────────────────────
const TRANSFER_OPTIONS = [
  { key: 'transfer_tasks',     label: 'Tasks',     desc: 'Active & pending tasks',       icon: ClipboardList,   color: '#3B82F6', countKey: 'tasks'     },
  { key: 'transfer_clients',   label: 'Clients',   desc: 'Assigned client accounts',     icon: UsersIcon,       color: '#10B981', countKey: 'clients'   },
  { key: 'transfer_dsc',       label: 'DSC',       desc: 'Digital signature certificates', icon: Fingerprint,   color: '#8B5CF6', countKey: 'dsc'       },
  { key: 'transfer_documents', label: 'Documents', desc: 'Files & document records',     icon: FileText,        color: '#F59E0B', countKey: 'documents' },
  { key: 'transfer_todos',     label: 'To-Dos',    desc: 'Personal to-do items',         icon: CheckCircle,     color: '#06B6D4', countKey: 'todos'     },
  { key: 'transfer_visits',    label: 'Visits',    desc: 'Scheduled client visits',      icon: MapPin,          color: '#EC4899', countKey: 'visits'    },
  { key: 'transfer_leads',     label: 'Leads',     desc: 'Sales leads & prospects',      icon: Target,          color: '#F97316', countKey: 'leads'     },
];

const DEFAULT_ROLE_PERMISSIONS = {
    admin: {
      can_view_all_tasks: true, can_view_all_clients: true, can_view_all_dsc: true,
      can_view_documents: true, can_view_all_duedates: true, can_view_reports: true,
      can_manage_users: true, can_assign_tasks: true, can_view_staff_activity: true,
      can_view_attendance: true, can_send_reminders: true, can_view_user_page: true,
      can_view_audit_logs: true, can_edit_tasks: true, can_edit_dsc: true,
      can_edit_documents: true, can_edit_due_dates: true, can_edit_users: true,
      can_download_reports: true, can_view_selected_users_reports: true,
      can_view_todo_dashboard: true, can_edit_clients: true, can_use_chat: true,
      can_view_all_leads: true, can_manage_settings: true, can_assign_clients: true,
      can_view_staff_rankings: true, can_delete_data: true, can_delete_tasks: true,
      can_connect_email: true, can_view_own_data: true, can_create_quotations: true,
      can_manage_invoices: true, can_view_passwords: true, can_edit_passwords: true,
      can_view_compliance: true, can_manage_compliance: true,
      view_password_departments: [], assigned_clients: [], view_other_tasks: [],
      view_other_attendance: [], view_other_reports: [], view_other_todos: [],
      view_other_activity: [], view_other_visits: [],
    },
    // SCOPE: OWN + SAME_DEPARTMENT (Own + Team) | ALL MODULES enabled (permission-based, admin can revoke)
    manager: {
      can_view_all_tasks: false,      // scope handled server-side by department query
      can_view_all_clients: true,     // default module (assigned + permission-based)
      can_view_all_dsc: true,         // default module (permission-based)
      can_view_documents: true,       // default module
      can_view_all_duedates: true,    // default module (compliance)
      can_view_reports: true,         // default module (own + team scope)
      can_view_attendance: true,      // default module (scoped to department server-side)
      can_view_all_leads: true,       // default module (permission-based)
      can_edit_tasks: true,           // default module
      can_edit_clients: true,         // default module (permission-based)
      can_edit_dsc: true,             // default module (permission-based)
      can_edit_documents: true,       // default module
      can_edit_due_dates: true,       // default module
      can_edit_users: true,           // default module (permission-based)
      can_download_reports: true,     // default module
      can_manage_users: true,         // default module (permission-based)
      can_manage_settings: true,      // default module (general_settings)
      can_assign_tasks: true,         // default module
      can_assign_clients: true,       // default module (permission-based)
      can_view_staff_activity: true,  // default module (own + team scope enforced server-side)
      can_send_reminders: false,      // admin-granted only
      can_view_user_page: true,       // default module (permission-based)
      can_view_audit_logs: true,      // default module (permission-based)
      can_view_selected_users_reports: true,  // default module
      can_view_todo_dashboard: true,  // default module
      can_use_chat: true,             // default module
      can_view_staff_rankings: true,  // default module
      can_delete_data: false,         // admin-granted only
      can_delete_tasks: false,        // admin-granted only
      can_connect_email: true,        // default module (email accounts — own + team)
      can_view_own_data: true,        // default module
      can_create_quotations: true,    // default module (permission-based)
      can_manage_invoices: true,      // default module (permission-based)
      can_view_passwords: true,       // default module (permission-based)
      can_edit_passwords: true,       // default module (permission-based)
      can_view_compliance: true,      // DEFAULT ON — Compliance Tracker (own + team scope, dept-scoped server-side)
      can_manage_compliance: true,    // default module — manager can create/edit compliance masters in own dept
      can_view_all_visits: false,     // own + dept team visits (server-side scoped via department query)
      can_edit_visits: true,          // edit own + team visits
      can_delete_visits: false,       // admin-granted only
      can_delete_own_visits: true,    // always allowed for own records
      view_password_departments: [], assigned_clients: [], view_other_tasks: [],
      view_other_attendance: [], view_other_reports: [], view_other_todos: [],
      view_other_activity: [], view_other_visits: [],
    },
    // SCOPE: OWN only | ALL MODULES enabled (permission-based, admin can revoke)
    staff: {
      can_view_all_tasks: false,      // scope: own only
      can_view_all_clients: true,     // default module (assigned + permission-based)
      can_view_all_dsc: true,         // default module (permission-based)
      can_view_documents: true,       // default module
      can_view_all_duedates: true,    // default module (compliance)
      can_view_reports: true,         // default module (own data only server-side)
      can_view_attendance: true,      // default module (own data only server-side)
      can_view_all_leads: true,       // default module (permission-based)
      can_edit_tasks: true,           // default module (own/assigned tasks)
      can_edit_clients: true,         // default module (permission-based)
      can_edit_dsc: true,             // default module (permission-based)
      can_edit_documents: true,       // default module (permission-based)
      can_edit_due_dates: true,       // default module (permission-based)
      can_edit_users: true,           // default module (permission-based)
      can_download_reports: true,     // default module (own data)
      can_manage_users: true,         // default module (permission-based)
      can_manage_settings: true,      // default module (own profile/general settings)
      can_assign_tasks: false,        // admin-granted only
      can_assign_clients: false,      // admin-granted only
      can_view_staff_activity: true,  // default module (own activity only, server-side scoped)
      can_send_reminders: false,      // admin-granted only
      can_view_user_page: true,       // default module (permission-based)
      can_view_audit_logs: true,      // default module (permission-based)
      can_view_selected_users_reports: true,  // default module (own data)
      can_view_todo_dashboard: true,  // default module
      can_use_chat: true,             // default module
      can_view_staff_rankings: false, // admin-granted only
      can_delete_data: false,         // admin-granted only
      can_delete_tasks: false,        // admin-granted only
      can_connect_email: true,        // default module (email accounts)
      can_view_own_data: true,        // default module
      can_create_quotations: true,    // default module (permission-based)
      can_manage_invoices: true,      // default module (permission-based)
      can_view_passwords: true,       // default module (permission-based)
      can_edit_passwords: true,       // default module (permission-based)
      can_view_compliance: false,     // admin-granted only — Compliance Tracker not shown to staff by default
      can_manage_compliance: false,   // admin-granted only — staff cannot create/edit compliance masters
      can_view_all_visits: false,     // own visits only (server-side scoped)
      can_edit_visits: true,          // edit own visits
      can_delete_visits: false,       // admin-granted only
      can_delete_own_visits: true,    // always allowed for own records
      view_password_departments: [], assigned_clients: [], view_other_tasks: [],
      view_other_attendance: [], view_other_reports: [], view_other_todos: [],
      view_other_activity: [], view_other_visits: [],
    },
  }

const EMPTY_PERMISSIONS = {
  can_view_all_tasks: false, can_view_all_clients: false, can_view_all_dsc: false,
  can_view_documents: false, can_view_all_duedates: false, can_view_reports: false,
  can_manage_users: false, can_assign_tasks: false, can_view_staff_activity: false,
  can_view_attendance: false, can_send_reminders: false, can_view_user_page: false,
  can_view_audit_logs: false, can_edit_tasks: false, can_edit_dsc: false,
  can_edit_documents: false, can_edit_due_dates: false, can_edit_users: false,
  can_download_reports: false, can_view_selected_users_reports: false,
  can_view_todo_dashboard: false, can_edit_clients: false, can_use_chat: false,
  can_view_all_leads: false, can_manage_settings: false, can_assign_clients: false,
  can_view_staff_rankings: false, can_delete_data: false, can_delete_tasks: false,
  can_connect_email: false, can_view_own_data: false, can_create_quotations: false,
  can_manage_invoices: false, can_view_passwords: false, can_edit_passwords: false,
  can_view_compliance: false, can_manage_compliance: false,
  can_view_all_visits: false, can_edit_visits: false,
  can_delete_visits: false, can_delete_own_visits: true,
  view_password_departments: [], assigned_clients: [], view_other_tasks: [],
  view_other_attendance: [], view_other_reports: [], view_other_todos: [],
  view_other_activity: [], view_other_visits: [],
};

const GLOBAL_PERMS = [
  { key: 'can_view_all_tasks',               label: 'Universal Task Access',        desc: 'See tasks assigned to any user or department',           icon: Layers      },
  { key: 'can_view_all_clients',             label: 'Master Client List',           desc: 'View all company legal entities',                        icon: Briefcase   },
  { key: 'can_view_all_dsc',                label: 'DSC Vault Access',             desc: 'View all Digital Signature Certificates',                icon: Fingerprint },
  { key: 'can_view_documents',              label: 'Document Library',             desc: 'Access physical document register',                      icon: FileText    },
  { key: 'can_view_all_duedates',           label: 'Compliance Roadmap',           desc: 'View all upcoming statutory due dates',                  icon: Calendar    },
  { key: 'can_view_reports',               label: 'Analytics Dashboard',           desc: 'View performance and system-wide reports',               icon: BarChart2   },
  { key: 'can_view_todo_dashboard',         label: 'Todo Dashboard',               desc: 'Access global team todo overview',                       icon: CheckCircle },
  { key: 'can_view_audit_logs',             label: 'System Audit Trail',           desc: 'View activity logs and record histories',                icon: Activity    },
  { key: 'can_view_all_leads',             label: 'Leads Pipeline',               desc: 'View the global leads dashboard',                        icon: Target      },
  { key: 'can_view_user_page',              label: 'User Directory',               desc: 'View team members directory',                            icon: UsersIcon   },
  { key: 'can_view_selected_users_reports', label: 'Team Reports Access',         desc: 'View reports for selected users',                        icon: Eye         },
  { key: 'can_view_staff_rankings',         label: 'Staff Rankings',               desc: 'View performance leaderboard',                           icon: Star        },
  { key: 'can_view_own_data',               label: 'View Own Data',                desc: 'Access own attendance, tasks and reports',               icon: UserIcon    },
  { key: 'can_create_quotations',           label: 'Quotations Module',            desc: 'Create, edit, export and share quotations',              icon: Receipt     },
];

const OPS_PERMS = [
  { key: 'can_assign_tasks',        label: 'Task Delegation',        desc: 'Assign tasks to other staff members',              icon: ArrowUpRight },
  { key: 'can_assign_clients',      label: 'Client Assignment',      desc: 'Assign and reassign staff to clients',             icon: Briefcase    },
  { key: 'can_manage_users',        label: 'User Governance',        desc: 'Manage team members and roles',                    icon: UsersIcon    },
  { key: 'can_view_attendance',     label: 'Attendance Management',  desc: 'Review punch timings and late reports',            icon: Clock        },
  { key: 'can_view_staff_activity', label: 'Staff Monitoring',       desc: 'View app usage and screen activity',               icon: Activity     },
  { key: 'can_send_reminders',      label: 'Automated Reminders',    desc: 'Trigger email/notification reminders',             icon: Bell         },
  { key: 'can_download_reports',    label: 'Export Data',            desc: 'Download CSV/PDF versions of reports',             icon: Download     },
  { key: 'can_manage_settings',     label: 'System Settings',        desc: 'Modify global system configuration',               icon: Settings     },
  { key: 'can_delete_data',         label: 'Delete Records',         desc: 'Permanently delete data entries',                  icon: Trash2       },
  { key: 'can_delete_tasks',        label: 'Delete Tasks',           desc: 'Delete any task regardless of ownership',          icon: XCircle      },
  { key: 'can_connect_email',       label: 'Connect Email Accounts', desc: 'Link personal email via IMAP integration',         icon: Inbox        },
  { key: 'can_view_all_visits',     label: 'View All Visits',        desc: 'See client visits logged by any staff member',     icon: MapPin       },
  { key: 'can_edit_visits',         label: 'Edit Visits',            desc: 'Edit and update client visit records',             icon: Edit         },
  { key: 'can_delete_visits',       label: 'Delete Any Visit',       desc: 'Delete visit records belonging to any staff',      icon: Trash2       },
  { key: 'can_delete_own_visits',   label: 'Delete Own Visits',      desc: 'Delete only their own logged visit records',       icon: XCircle      },
];

const EDIT_PERMS = [
  { key: 'can_edit_tasks',     label: 'Modify Tasks',     desc: 'Update and delete task definitions',       icon: Pencil      },
  { key: 'can_edit_clients',   label: 'Modify Clients',   desc: 'Update client master data records',        icon: Edit        },
  { key: 'can_edit_dsc',       label: 'Modify DSC',       desc: 'Update certificate details and metadata',  icon: Fingerprint },
  { key: 'can_edit_documents', label: 'Modify Documents', desc: 'Change document records',                  icon: FileText    },
  { key: 'can_edit_due_dates', label: 'Modify Due Dates', desc: 'Edit statutory compliance timelines',      icon: Calendar    },
  { key: 'can_edit_users',     label: 'Modify Users',     desc: 'Update user profiles and settings',        icon: UserIcon    },
];

const permTabs = [
  { id: 'modules', label: 'Modules',    icon: Zap       },
  { id: 'view',    label: 'View',        icon: Eye       },
  { id: 'ops',     label: 'Operations',  icon: Settings  },
  { id: 'edit',    label: 'Edit',        icon: Pencil    },
  { id: 'cross',   label: 'Cross-User',  icon: UsersIcon },
  { id: 'clients', label: 'Clients',     icon: Briefcase },
];

// ── Identix helpers ───────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  try { return format(new Date(iso), 'MMM dd, yyyy  hh:mm a'); }
  catch { return iso || '—'; }
};

const inputStyleIdentix = {
  width: '100%', padding: '9px 12px', border: `1.5px solid ${COLORS.border}`,
  borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: '#fff', transition: 'border-color 0.15s',
};

// ════════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ════════════════════════════════════════════════════════════════════════════════
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeaderRow({ iconBg, icon, title, subtitle, action, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white leading-none">{badge}</span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function DialogGradHeader({ gradient, icon: Icon, eyebrow, title, subtitle, onClose }) {
  return (
    <div className="relative overflow-hidden rounded-t-2xl" style={{ background: gradient }}>
      <div className="absolute right-0 top-0 w-56 h-56 rounded-full -mr-20 -mt-20 opacity-10"
        style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
      <div className="relative px-7 py-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            {eyebrow && <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1">{eyebrow}</p>}
            <h2 className="text-xl font-bold text-white leading-snug tracking-tight">{title}</h2>
            {subtitle && <p className="text-white/55 text-sm mt-1">{subtitle}</p>}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0 transition-all active:scale-90 mt-0.5">
            <X className="h-4 w-4 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

const DeptPill = ({ dept }) => {
  const info = DEPARTMENTS.find(d => d.value === dept);
  if (!info) return null;
  return (
    <span className="inline-flex items-center font-bold rounded-xl px-2.5 py-1 text-[11px] tracking-wide"
      style={{ background: info.bg, color: info.color, border: `1px solid ${info.color}30` }}>
      {info.label}
    </span>
  );
};

const StatusBadge = ({ status, isActive }) => {
  const resolved = status || (isActive !== false ? 'active' : 'inactive');
  const cfg = {
    active:           { label: 'Active',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', dot: 'bg-emerald-500' },
    pending_approval: { label: 'Pending',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',         dot: 'bg-amber-500'   },
    rejected:         { label: 'Rejected', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',                  dot: 'bg-red-500'     },
    inactive:         { label: 'Inactive', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',             dot: 'bg-slate-400'   },
  }[resolved] || { label: 'Inactive', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', dot: 'bg-slate-400' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${resolved === 'active' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
};

const ModuleAccessBadges = ({ userData }) => {
  if (userData.role === 'admin') return null;
  const p = userData.permissions || {};
  const badges = [
    { label: 'Leads',    active: !!p.can_view_all_leads,    color: '#1F6FB2', icon: Target   },
    { label: 'Quotes',   active: !!p.can_create_quotations, color: '#7C3AED', icon: Receipt  },
    { label: 'Invoicing',active: !!p.can_manage_invoices,   color: '#1FAF5A', icon: FileText },
    {
      label: !p.can_view_passwords ? 'Vault' : p.can_edit_passwords ? 'Vault R/W' : 'Vault R',
      active: !!p.can_view_passwords,
      color:  p.can_edit_passwords ? '#B45309' : '#0F766E',
      icon: KeyRound,
    },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {badges.map((b, i) => {
        const Icon = b.icon;
        return (
          <span key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all"
            style={b.active
              ? { background: `${b.color}12`, color: b.color, borderColor: `${b.color}30` }
              : { background: 'transparent', color: '#94a3b8', borderColor: '#e2e8f0' }}>
            <Icon className="h-3 w-3" />
            {b.label}
          </span>
        );
      })}
    </div>
  );
};

const PermissionMatrixSummary = ({ permissions }) => {
  // Include module-level perms (managed from the Modules tab) so coverage % is accurate
  const MODULE_PERM_KEYS = ['can_manage_invoices', 'can_view_passwords', 'can_edit_passwords'];
  const allPerms = [...GLOBAL_PERMS, ...OPS_PERMS, ...EDIT_PERMS];
  const granted  = allPerms.filter(p => permissions[p.key]).length
                 + MODULE_PERM_KEYS.filter(k => permissions[k]).length;
  const total    = allPerms.length + MODULE_PERM_KEYS.length;
  const pct      = Math.round((granted / total) * 100);
  return (
    <div className="flex gap-5 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="relative w-18 h-18 flex-shrink-0" style={{ width: 72, height: 72 }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="5" />
          <circle cx="24" cy="24" r="20" fill="none" stroke={COLORS.emeraldGreen} strokeWidth="5"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-black text-xl text-slate-700 dark:text-slate-100">{pct}%</div>
      </div>
      <div className="flex-1">
        <p className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">Permission Coverage</p>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{granted} of {total} permissions enabled</p>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: GRAD_GREEN }} />
        </div>
      </div>
    </div>
  );
};

const PermToggleRow = ({ permKey, label, desc, icon: Icon, permissions, setPermissions }) => {
  const isOn = !!permissions[permKey];
  return (
    <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
      isOn
        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      <div className="flex items-center gap-3.5 pr-4 flex-1 min-w-0">
        {Icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
            isOn ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className={`font-semibold text-sm ${isOn ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-200'}`}>{label}</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>
        </div>
      </div>
      <Switch checked={isOn} onCheckedChange={val => setPermissions(p => ({ ...p, [permKey]: val }))} />
    </div>
  );
};

const ModuleAccessCard = ({ icon: Icon, title, desc, permKey, permissions, setPermissions, accentColor, badge }) => {
  const isEnabled = !!permissions[permKey];
  const accent    = accentColor || COLORS.mediumBlue;
  const toggle    = () => setPermissions(p => ({ ...p, [permKey]: !p[permKey] }));
  return (
    <motion.div
      whileHover={{ y: -2, transition: springPhysics.lift }}
      whileTap={{ scale: 0.99 }}
      onClick={toggle}
      className={`flex gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
        isEnabled ? 'shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
      style={isEnabled ? { borderColor: `${accent}40`, background: `${accent}06` } : {}}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
        isEnabled ? 'text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
      }`}
        style={isEnabled ? { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` } : {}}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-semibold text-sm ${isEnabled ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{title}</p>
          {badge && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={{ background: `${accent}15`, color: accent }}>{badge}</span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <div className="flex-shrink-0 flex items-center" onClick={e => e.stopPropagation()}>
        <Switch checked={isEnabled} onCheckedChange={toggle} />
      </div>

    </motion.div>
  );
};

const SectionHeader = ({ icon: Icon, title, count, color }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
      <Icon className="h-4 w-4" style={{ color }} />
    </div>
    <p className="font-bold text-base tracking-tight text-slate-900 dark:text-white">{title}</p>
    {count !== undefined && (
      <span className="ml-auto text-xs font-bold px-3 py-1 rounded-full" style={{ background: `${color}15`, color }}>
        {count} enabled
      </span>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════════════════
// IDENTIX — LAN SCANNER
// ════════════════════════════════════════════════════════════════════════════════
function LanScanner({ onAddDevice }) {
  const [scanning,   setScanning]   = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [found,      setFound]      = useState([]);
  const [scanStatus, setScanStatus] = useState('');
  const [subnet,     setSubnet]     = useState('');
  const [port,       setPort]       = useState(4370);
  const pollRef = useRef(null);

  const startScan = async () => {
    setScanning(true); setFound([]); setProgress(0); setScanStatus('Starting scan…');
    try {
      const { data } = await api.post('/identix/devices/scan', { subnet: subnet || null, port });
      const scanId = data.scan_id;
      setScanStatus(data.message || 'Scanning…');
      pollRef.current = setInterval(async () => {
        try {
          const { data: status } = await api.get(`/identix/devices/scan/${scanId}`);
          setProgress(status.progress ?? 0);
          setFound(status.found ?? []);
          setScanStatus(status.message ?? 'Scanning…');
          if (status.done) {
            clearInterval(pollRef.current);
            setScanning(false);
          }
        } catch {
          clearInterval(pollRef.current);
          setScanning(false);
          setScanStatus('Scan polling failed.');
        }
      }, 1500);
    } catch (e) {
      setScanning(false);
      setScanStatus(e?.response?.data?.detail || 'Scan failed.');
      toast.error('LAN scan failed');
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.deepBlue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Radar size={16} color="#fff" />
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Auto-Discover Devices</p>
          <p style={{ margin: 0, fontSize: 12, color: COLORS.slate }}>Scans your LAN for ZKTeco / Identix machines on port {port}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: COLORS.slate, marginBottom: 3 }}>SUBNET (optional)</label>
          <input type="text" placeholder="e.g. 192.168.1" value={subnet} onChange={e => setSubnet(e.target.value)} disabled={scanning}
            style={{ ...inputStyleIdentix, fontSize: 12 }} />
        </div>
        <div style={{ width: 90 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: COLORS.slate, marginBottom: 3 }}>PORT</label>
          <input type="number" value={port} onChange={e => setPort(Number(e.target.value))} disabled={scanning}
            style={{ ...inputStyleIdentix, fontSize: 12 }} />
        </div>
        <button onClick={startScan} disabled={scanning}
          style={{ padding: '9px 16px', background: scanning ? '#e2e8f0' : COLORS.deepBlue, color: scanning ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: scanning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {scanning ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Scanning…</> : <><Radar size={13} />Scan LAN</>}
        </button>
      </div>
      {(scanning || progress > 0) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: COLORS.slate }}>{scanStatus}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.deepBlue }}>{progress}%</span>
          </div>
          <div style={{ height: 5, background: '#dbeafe', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 99, background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`, transition: 'width 0.4s ease' }} />
          </div>
          {found.length > 0 && <p style={{ margin: '5px 0 0', fontSize: 12, color: COLORS.green, fontWeight: 600 }}>✓ {found.length} device(s) discovered…</p>}
        </div>
      )}
      {found.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {found.map((d, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wifi size={14} color={COLORS.green} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{d.ip_address}:{d.port}</p>
                  <p style={{ margin: 0, fontSize: 11, color: COLORS.slate }}>
                    {d.device_info ? `S/N: ${d.device_info.serialNumber} · FW: ${d.device_info.firmware}` : 'ZKTeco device detected'}
                  </p>
                </div>
              </div>
              {d.already_registered
                ? <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.slate, padding: '5px 10px', background: '#f1f5f9', borderRadius: 8 }}>Already Registered</span>
                : <button onClick={() => onAddDevice(d)} style={{ padding: '6px 12px', background: COLORS.green, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Plus size={12} />Add Device
                  </button>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// IDENTIX — DEVICES TAB
// ════════════════════════════════════════════════════════════════════════════════
const emptyDevice = { name: '', ip_address: '', port: 4370, comm_password: '0', serial_number: '', location: '' };

function IdentixDevicesTab() {
  const [devices,     setDevices]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [form,        setForm]        = useState(emptyDevice);
  const [saving,      setSaving]      = useState(false);
  const [testingId,   setTestingId]   = useState(null);
  const [testResults, setTestResults] = useState({});
  const [syncingId,   setSyncingId]   = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/identix/devices'); setDevices(data.devices || []); }
    catch { toast.error('Failed to load devices'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew  = (prefill = {}) => { setEditing(null);  setForm({ ...emptyDevice, ...prefill }); setShowModal(true); };
  const openEdit = (d)            => { setEditing(d);     setForm({ ...d });                        setShowModal(true); };

  const handleDiscoveredDevice = (discovered) => {
    openNew({
      ip_address:    discovered.ip_address,
      port:          discovered.port ?? 4370,
      name:          `Identix (${discovered.ip_address})`,
      serial_number: discovered.device_info?.serialNumber || '',
    });
  };

  const save = async () => {
    if (!form.name?.trim() || !form.ip_address?.trim()) { toast.error('Device Name and IP Address are required'); return; }
    setSaving(true);
    try {
      if (editing) { await api.put(`/identix/devices/${editing.id}`, form); toast.success('Device updated'); }
      else         { await api.post('/identix/devices', form);              toast.success('Device added');   }
      setShowModal(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete device "${d.name}"?`)) return;
    try { await api.delete(`/identix/devices/${d.id}`); toast.success('Device deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const testConn = async (d) => {
    setTestingId(d.id); setTestResults(prev => ({ ...prev, [d.id]: { testing: true } }));
    try {
      const { data } = await api.post(`/identix/devices/${d.id}/test`);
      setTestResults(prev => ({ ...prev, [d.id]: data }));
      if (data.success) toast.success(`✓ Connected to ${d.name}`);
      else toast.error(`${d.name}: ${data.message}`);
    } catch { toast.error('Test failed'); }
    finally { setTestingId(null); }
  };

  const syncUsers = async (d) => {
    setSyncingId(d.id);
    try { const { data } = await api.post(`/identix/devices/${d.id}/sync-users`); toast.success(data.message); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Sync failed'); }
    finally { setSyncingId(null); }
  };

  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Biometric Devices</h3>
        <button onClick={() => openNew()} style={{ padding: '8px 16px', background: COLORS.deepBlue, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} />Add Device Manually
        </button>
      </div>

      <LanScanner onAddDevice={handleDiscoveredDevice} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : !devices.length ? (
        <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <Monitor size={36} color="#cbd5e1" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No devices registered</div>
          <div style={{ fontSize: 13 }}>Use the LAN scanner above or add a device manually.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {devices.map(d => {
            const tr = testResults[d.id];
            return (
              <div key={d.id} style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <Monitor size={18} color={COLORS.mediumBlue} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: d.is_active ? '#d1fae5' : '#fee2e2', color: d.is_active ? '#065f46' : '#991b1b' }}>{d.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.slate, display: 'flex', flexWrap: 'wrap', gap: '3px 16px' }}>
                    <span>IP: <b>{d.ip_address}:{d.port}</b></span>
                    {d.location && <span>📍 {d.location}</span>}
                    {d.serial_number && <span>S/N: {d.serial_number}</span>}
                    {d.last_sync_at && <span>Last sync: {fmtTime(d.last_sync_at)}</span>}
                  </div>
                  {tr && !tr.testing && (
                    <div style={{ marginTop: 8, padding: '7px 12px', borderRadius: 8, fontSize: 12, background: tr.success ? '#d1fae5' : '#fee2e2', color: tr.success ? '#065f46' : '#991b1b' }}>
                      {tr.success ? `✓ Connected — S/N: ${tr.deviceInfo?.serialNumber}, Users: ${tr.deviceInfo?.userCount}` : `✗ ${tr.message}`}
                    </div>
                  )}
                  {tr?.testing && <div style={{ marginTop: 8, fontSize: 12, color: COLORS.slate, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Testing…</div>}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flexShrink: 0 }}>
                  {[
                    { label: 'Test',       icon: Wifi,     color: '#3b82f6', action: () => testConn(d),  loading: testingId === d.id  },
                    { label: 'Sync Users', icon: UsersIcon,color: COLORS.green, action: () => syncUsers(d), loading: syncingId === d.id },
                    { label: 'Edit',       icon: Edit,     color: '#374151', action: () => openEdit(d), loading: false },
                    { label: 'Delete',     icon: Trash2,   color: COLORS.red,  action: () => remove(d),  loading: false },
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.action} disabled={btn.loading}
                      style={{ padding: '6px 11px', background: 'transparent', color: btn.loading ? '#94a3b8' : btn.color, border: `1.5px solid ${btn.loading ? '#e2e8f0' : btn.color}`, borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: btn.loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <btn.icon size={12} />
                      {btn.loading ? '…' : btn.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Device Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 14px', borderBottom: `1px solid ${COLORS.border}` }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{editing ? 'Edit Device' : 'Add Identix Device'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} color={COLORS.slate} /></button>
            </div>
            <div style={{ padding: '18px 22px 22px' }}>
              {[
                { label: 'Device Name *', key: 'name',          type: 'text',   placeholder: 'e.g. Main Entrance' },
                { label: 'IP Address *',  key: 'ip_address',    type: 'text',   placeholder: 'e.g. 192.168.1.201' },
                { label: 'Location',      key: 'location',      type: 'text',   placeholder: 'e.g. Ground Floor' },
                { label: 'Serial Number', key: 'serial_number', type: 'text',   placeholder: 'Optional' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e => setField(f.key, e.target.value)} style={inputStyleIdentix} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Port</label>
                  <input type="number" value={form.port} onChange={e => setField('port', Number(e.target.value))} style={inputStyleIdentix} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Comm Password</label>
                  <input type="text" placeholder="0" value={form.comm_password} onChange={e => setField('comm_password', e.target.value)} style={inputStyleIdentix} />
                </div>
              </div>
              {editing && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Status</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[true, false].map(v => (
                      <button key={String(v)} onClick={() => setField('is_active', v)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: `2px solid ${form.is_active === v ? (v ? COLORS.green : COLORS.red) : COLORS.border}`, background: form.is_active === v ? (v ? '#d1fae5' : '#fee2e2') : '#fff', color: form.is_active === v ? (v ? '#065f46' : '#991b1b') : COLORS.slate }}>
                        {v ? 'Active' : 'Inactive'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'transparent', color: COLORS.slate, border: `1.5px solid ${COLORS.border}`, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ padding: '8px 18px', background: saving ? '#e2e8f0' : COLORS.deepBlue, color: saving ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Saving…</> : <><Save size={13} />{editing ? 'Update' : 'Add Device'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// IDENTIX — ATTENDANCE SYNC TAB
// (Machine punches sync into the main attendance collection via backend)
// ════════════════════════════════════════════════════════════════════════════════
function IdentixAttendanceTab() {
  const [records, setRecords] = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({ from_date: '', to_date: '', department: '' });
  const LIMIT = 50;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: LIMIT };
      if (filters.from_date)  params.from_date  = filters.from_date;
      if (filters.to_date)    params.to_date    = filters.to_date;
      if (filters.department) params.department = filters.department;
      const { data } = await api.get('/identix/attendance', { params });
      setRecords(data.records || []); setTotal(data.total || 0);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(1); }, [filters]);
  useEffect(() => { load(page); }, [page]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/identix/attendance/sync', {});
      toast.success(`Synced! ${data.newRecords} new records imported into attendance`);
      load(1);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Sync failed'); }
    finally { setSyncing(false); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const pill = (bg, color, text) => (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>{text}</span>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Machine Attendance Records</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COLORS.slate }}>Synced punches are automatically added to the main attendance system</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          style={{ padding: '8px 16px', background: syncing ? '#e2e8f0' : COLORS.green, color: syncing ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {syncing ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Syncing…</> : <><RefreshCw size={13} />Sync From Machine</>}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <CheckCircle size={15} color={COLORS.mediumBlue} />
        <span style={{ color: '#1e40af' }}>Machine punches sync directly into the <b>main attendance</b> — staff see them alongside app punch-ins in the Attendance page.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ label: 'FROM DATE', key: 'from_date', type: 'date', width: 150 }, { label: 'TO DATE', key: 'to_date', type: 'date', width: 150 }].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: COLORS.slate, fontWeight: 600, display: 'block', marginBottom: 3 }}>{f.label}</label>
            <input type={f.type} value={filters[f.key]} style={{ ...inputStyleIdentix, width: f.width }} onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 11, color: COLORS.slate, fontWeight: 600, display: 'block', marginBottom: 3 }}>DEPARTMENT</label>
          <input type="text" placeholder="e.g. GST" value={filters.department} style={{ ...inputStyleIdentix, width: 160 }} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))} />
        </div>
        {(filters.from_date || filters.to_date || filters.department) && (
          <div style={{ alignSelf: 'flex-end' }}>
            <button onClick={() => setFilters({ from_date: '', to_date: '', department: '' })} style={{ padding: '8px 12px', background: 'transparent', color: COLORS.red, border: `1.5px solid ${COLORS.red}`, borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <X size={12} />Clear
            </button>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: `2px solid ${COLORS.border}` }}>
              {['Employee', 'Department', 'Punch Time', 'Type', 'Source', 'Device'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 14px', color: COLORS.slate, fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></td></tr>
            ) : !records.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No records. Click "Sync From Machine" to import punches.</td></tr>
            ) : records.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.user_name || '—'}</td>
                <td style={{ padding: '10px 14px', color: COLORS.slate }}>{r.department || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{fmtTime(r.punch_time)}</td>
                <td style={{ padding: '10px 14px' }}>{pill(r.punch_type === 'in' ? '#d1fae5' : '#fee2e2', r.punch_type === 'in' ? '#065f46' : '#991b1b', r.punch_type === 'in' ? 'Punch In' : 'Punch Out')}</td>
                <td style={{ padding: '10px 14px' }}>{pill('#ede9fe', '#5b21b6', 'Machine')}</td>
                <td style={{ padding: '10px 14px', color: COLORS.slate }}>{r.device_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 12px', background: 'transparent', color: COLORS.mediumBlue, border: `1.5px solid ${COLORS.mediumBlue}`, borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>← Prev</button>
          <span style={{ fontSize: 13, color: COLORS.slate }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', background: 'transparent', color: COLORS.mediumBlue, border: `1.5px solid ${COLORS.mediumBlue}`, borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// IDENTIX — ENROLLMENT TAB
// ════════════════════════════════════════════════════════════════════════════════
function IdentixEnrollmentTab() {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [syncingId, setSyncingId] = useState(null);
  const [thumbId,   setThumbId]   = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/identix/users'); setUsers(data.users || []); }
    catch { toast.error('Failed to load enrollment data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markThumb = async (userId) => {
    setThumbId(userId);
    try {
      await api.patch(`/identix/users/${userId}/thumb-enrolled`);
      toast.success('Thumb enrollment marked complete');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, thumb_enrolled: true } : u));
    } catch { toast.error('Failed to update'); }
    finally { setThumbId(null); }
  };

  const syncToDevice = async (userId, name) => {
    setSyncingId(userId);
    try { await api.post(`/identix/users/${userId}/sync-to-device`); toast.success(`${name} pushed to device`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Sync failed'); }
    finally { setSyncingId(null); }
  };

  const filtered = users.filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  const pill = (bg, color, text) => <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>{text}</span>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Biometric Enrollment</h3>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…" style={{ ...inputStyleIdentix, paddingLeft: 30, width: 210 }} />
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: `2px solid ${COLORS.border}` }}>
              {['Name', 'Role / Dept', 'Device UID', 'Device Status', 'Fingerprint', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 14px', color: COLORS.slate, fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                  <div style={{ fontSize: 11, color: COLORS.slate }}>{u.email}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ textTransform: 'capitalize', color: '#374151' }}>{u.role}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.departments?.join(', ') || '—'}</div>
                </td>
                <td style={{ padding: '10px 14px', color: COLORS.slate, fontFamily: 'monospace' }}>
                  {u.identix_uid ?? <span style={{ color: '#94a3b8' }}>Not assigned</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {pill(u.identix_enrolled ? '#d1fae5' : '#fee2e2', u.identix_enrolled ? '#065f46' : '#991b1b', u.identix_enrolled ? 'Synced' : 'Not Synced')}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {pill(u.thumb_enrolled ? '#dbeafe' : '#fef9c3', u.thumb_enrolled ? '#1e40af' : '#92400e', u.thumb_enrolled ? '✓ Enrolled' : '⚠ Pending')}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {!u.thumb_enrolled && (
                      <button onClick={() => markThumb(u.id)} disabled={thumbId === u.id}
                        style={{ padding: '5px 10px', background: COLORS.green, color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 11, cursor: thumbId === u.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Fingerprint size={11} />{thumbId === u.id ? '…' : 'Mark Thumb'}
                      </button>
                    )}
                    <button onClick={() => syncToDevice(u.id, u.full_name)} disabled={syncingId === u.id}
                      style={{ padding: '5px 10px', background: 'transparent', color: COLORS.mediumBlue, border: `1.5px solid ${COLORS.mediumBlue}`, borderRadius: 7, fontWeight: 600, fontSize: 11, cursor: syncingId === u.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <RefreshCw size={11} />{syncingId === u.id ? '…' : 'Push to Device'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// IDENTIX — DASHBOARD TAB
// ════════════════════════════════════════════════════════════════════════════════
function IdentixDashboardTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/identix/attendance/summary'); setSummary(data); }
    catch { toast.error('Failed to load summary'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const StatCard = ({ label, value, color, icon: Icon }) => (
    <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </span>
        <span style={{ fontSize: 12, color: COLORS.slate }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a' }}>{value ?? '—'}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
          Today — {summary?.date || 'Loading…'}
        </h3>
        <button onClick={load} disabled={loading} style={{ padding: '7px 14px', background: 'transparent', color: COLORS.mediumBlue, border: `1.5px solid ${COLORS.mediumBlue}`, borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />Refresh
        </button>
      </div>

      {loading && !summary ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
            <StatCard label="Total Employees"  value={summary?.totalEmployees}         color={COLORS.mediumBlue}  icon={UsersIcon}     />
            <StatCard label="Present (Machine)" value={summary?.totalPresent}           color={COLORS.green}       icon={CheckCircle}   />
            <StatCard label="Absent"            value={summary?.totalAbsent}            color={COLORS.red}         icon={AlertTriangle} />
            <StatCard label="Pending Thumb"     value={summary?.pendingThumbEnrollment} color={COLORS.amber}       icon={Fingerprint}   />
          </div>

          {summary?.byDepartment?.length > 0 && (
            <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>By Department</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {summary.byDepartment.map(d => (
                  <div key={d.department || '—'} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#374151', minWidth: 120 }}>{d.department || 'Unassigned'}</span>
                    <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 10, background: '#3b82f6', width: `${Math.min(100, (d.present / (summary.totalEmployees || 1)) * 100)}%` }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.green, minWidth: 65 }}>{d.present} present</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Recent Machine Punches</h4>
            </div>
            {!summary?.recentActivity?.length ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>No punches recorded yet today</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: `2px solid ${COLORS.border}` }}>
                    {['Employee', 'Department', 'Punch Time', 'Type', 'Device'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: COLORS.slate, fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.recentActivity.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{r.user_name || '—'}</td>
                      <td style={{ padding: '9px 14px', color: COLORS.slate }}>{r.department || '—'}</td>
                      <td style={{ padding: '9px 14px' }}>{fmtTime(r.punch_time)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: r.punch_type === 'in' ? '#d1fae5' : '#fee2e2', color: r.punch_type === 'in' ? '#065f46' : '#991b1b' }}>
                          {r.punch_type === 'in' ? 'Punch In' : 'Punch Out'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', color: COLORS.slate }}>{r.device_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT COMPONENTS (original)
// ════════════════════════════════════════════════════════════════════════════════
const PendingUserCard = ({ userData, onApprove, onReject, approving }) => (
  <motion.div variants={itemVariants} whileHover={{ y: -3, transition: springPhysics.lift }} layout
    className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-amber-200 dark:border-amber-800 shadow-sm hover:shadow-xl transition-all duration-300">
    <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #f59e0b, #f97316)' }} />
    <div className="p-5">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm ring-1 ring-amber-100 dark:ring-amber-900">
            {userData.profile_picture
              ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-white text-xl font-black" style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}>
                  {userData.full_name?.charAt(0)?.toUpperCase()}
                </div>}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300 rounded-full p-1 border-2 border-white dark:border-slate-800">
            <Clock className="h-3 w-3" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-slate-900 dark:text-white tracking-tight truncate">{userData.full_name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{userData.email}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 capitalize">{userData.role}</span>
            <StatusBadge status={userData.status} />
          </div>
        </div>
      </div>
      {(userData.departments || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">{userData.departments.map(d => <DeptPill key={d} dept={d} />)}</div>
      )}
      <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" />{userData.phone || '—'}</div>
        <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-slate-400" />
          Registered {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}
        </div>
      </div>
      <div className="flex gap-2.5 mt-5">
        <Button onClick={() => onApprove(userData)} disabled={approving === userData.id}
          className="flex-1 h-10 rounded-xl font-semibold text-sm shadow-sm hover:shadow-md transition-all"
          style={{ background: COLORS.emeraldGreen, color: 'white' }}>
          <UserCheck className="h-4 w-4 mr-1.5" />{approving === userData.id ? 'Approving…' : 'Approve'}
        </Button>
        <Button onClick={() => onReject(userData)} disabled={approving === userData.id}
          variant="outline" className="flex-1 h-10 rounded-xl border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-sm">
          <UserX className="h-4 w-4 mr-1.5" />Reject
        </Button>
      </div>
    </div>
  </motion.div>
);

const UserCard = ({ userData, onEdit, onDelete, onOffboard, onPermissions, onApprove, onReject, currentUserId, isAdmin, isManager, canEditUsers, canManagePermissions, approving }) => {
  const [hovered, setHovered] = useState(false);
  const isPending = userData.status === 'pending_approval';
  const roleCfg   = ROLE_CONFIG[userData.role?.toLowerCase()] || ROLE_CONFIG.staff;
  const RoleIcon  = roleCfg.icon;
  const permCount = useMemo(() =>
    userData.permissions ? Object.entries(userData.permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length : 0
  , [userData.permissions]);

  return (
    <motion.div variants={itemVariants} layout whileHover={{ y: -4, transition: springPhysics.lift }} whileTap={{ scale: 0.99 }}
      className={`relative bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border shadow-sm transition-all duration-200 ${
        isPending ? 'border-amber-200 dark:border-amber-800 hover:shadow-xl' : hovered ? 'border-blue-200 dark:border-blue-700 hover:shadow-xl' : 'border-slate-200/80 dark:border-slate-700 hover:shadow-lg'
      }`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className={`h-1.5 w-full bg-gradient-to-r ${roleCfg.gradient}`} />
      <AnimatePresence>
        {hovered && !isPending && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="absolute top-4 right-4 flex gap-1.5 z-20">
            {/* Permissions button: Admin can manage anyone (except admin role targets).
                Manager with can_manage_users can manage their team STAFF only. */}
            {canManagePermissions && userData.role !== 'admin' &&
              (isAdmin || userData.role === 'staff') && (
              <button onClick={() => onPermissions(userData)} title="Manage Permissions"
                className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-100 dark:border-emerald-800 shadow-sm transition-all">
                <Shield className="h-3.5 w-3.5" />
              </button>
            )}
            {(isAdmin || (canEditUsers && !isPending)) && (
              <button onClick={() => onEdit(userData)} title="Edit User"
                className="w-8 h-8 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-800 shadow-sm transition-all">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Delete button: Admin only per permission matrix */}
            {isAdmin && userData.id !== currentUserId && (
              <button onClick={() => onDelete(userData.id)} title="Delete User"
                className="w-8 h-8 bg-red-50 dark:bg-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center border border-red-100 dark:border-red-800 shadow-sm transition-all">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {isAdmin && userData.id !== currentUserId && (
              <button onClick={() => onOffboard(userData)} title="Offboard & Replace"
                className="w-8 h-8 bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center border border-amber-100 dark:border-amber-800 shadow-sm transition-all">
                <UserMinus className="h-3.5 w-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-[52px] h-[52px] rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              {userData.profile_picture
                ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
                : <div className={`w-full h-full flex items-center justify-center text-white text-xl font-black bg-gradient-to-br ${roleCfg.gradient}`}>
                    {userData.full_name?.charAt(0)?.toUpperCase()}
                  </div>}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-lg bg-gradient-to-br ${roleCfg.gradient} flex items-center justify-center ring-2 ring-white dark:ring-slate-800 shadow-sm`}>
              <RoleIcon className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white truncate">{userData.full_name}</h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-gradient-to-r ${roleCfg.gradient}`}>
                <RoleIcon className="h-2.5 w-2.5" />{roleCfg.label}
              </span>
              <StatusBadge status={userData.status} isActive={userData.is_active} />
            </div>
          </div>
        </div>
        {(userData.departments || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">{userData.departments.map(d => <DeptPill key={d} dept={d} />)}</div>
        )}
        <ModuleAccessBadges userData={userData} />
        <div className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 truncate"><Mail className="h-3 w-3 text-slate-400 flex-shrink-0" /><span className="truncate">{userData.email}</span></div>
          <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-slate-400 flex-shrink-0" />{userData.phone || '—'}</div>
          {(userData.punch_in_time || userData.punch_out_time) && (
            <div className="flex items-center gap-2"><Clock className="h-3 w-3 text-slate-400 flex-shrink-0" />{userData.punch_in_time || '—'} → {userData.punch_out_time || '—'}</div>
          )}
          <div className="flex items-center gap-2"><Calendar className="h-3 w-3 text-slate-400 flex-shrink-0" />
            Joined {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}
          </div>
        </div>
        {userData.role !== 'admin' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">Permissions</span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold"
              style={{ background: `${COLORS.mediumBlue}10`, color: COLORS.mediumBlue }}>
              <ShieldCheck className="h-3 w-3" />{permCount} active
            </div>
          </div>
        )}
        {isPending && isAdmin && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-amber-100 dark:border-amber-900">
            <Button onClick={() => onApprove(userData)} disabled={approving === userData.id}
              className="flex-1 h-9 rounded-xl font-semibold text-xs" style={{ background: COLORS.emeraldGreen, color: 'white' }}>
              <UserCheck className="h-3.5 w-3.5 mr-1" />Approve
            </Button>
            <Button onClick={() => onReject(userData)} disabled={approving === userData.id}
              variant="outline" className="flex-1 h-9 rounded-xl border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-xs">
              <UserX className="h-3.5 w-3.5 mr-1" />Reject
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
};


// ════════════════════════════════════════════════════════════════════════════════
// OFFBOARDING DIALOG — Employee Replacement Workflow
// ════════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════════
// OFFBOARDING DIALOG — Employee Replacement Workflow (REDESIGNED)
// ════════════════════════════════════════════════════════════════════════════════

function OffboardingDialog({ open, onClose, targetUser, allUsers, onComplete }) {
  const isDark = useDark();
  const [step, setStep]                   = useState(1);
  const [replacementId, setReplacementId] = useState('');
  const [searchTerm, setSearchTerm]       = useState('');
  const [newEmail, setNewEmail]           = useState('');
  const [notes, setNotes]                 = useState('');
  const [preview, setPreview]             = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting]         = useState(false);
  const [result, setResult]               = useState(null);
  const [transfers, setTransfers]         = useState({
    transfer_tasks: true, transfer_clients: true, transfer_dsc: true,
    transfer_documents: true, transfer_todos: true, transfer_visits: true,
    transfer_leads: true,
  });

  useEffect(() => {
    if (open && targetUser) {
      setStep(1); setReplacementId(''); setSearchTerm(''); setNewEmail('');
      setNotes(''); setPreview(null); setResult(null);
      setTransfers({ transfer_tasks:true, transfer_clients:true, transfer_dsc:true,
        transfer_documents:true, transfer_todos:true, transfer_visits:true, transfer_leads:true });
      (async () => {
        setLoadingPreview(true);
        try {
          const { data } = await api.get(`/users/${targetUser.id}/offboard-preview`);
          setPreview(data);
        } catch { toast.error('Failed to load offboarding preview'); }
        finally { setLoadingPreview(false); }
      })();
    }
  }, [open, targetUser?.id]);

  const eligibleUsers = useMemo(() =>
    allUsers
      .filter(u => u.id !== targetUser?.id && u.status !== 'pending_approval' && u.status !== 'rejected' && u.is_active !== false)
      .filter(u => !searchTerm || u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  , [allUsers, targetUser?.id, searchTerm]);

  const selectedReplacement = useMemo(() => allUsers.find(u => u.id === replacementId), [allUsers, replacementId]);

  const handleExecute = async () => {
    if (!replacementId) { toast.error('Please select a replacement'); return; }
    setExecuting(true); setStep(4);
    try {
      const { data } = await api.post(`/users/${targetUser.id}/offboard`, {
        replacement_user_id: replacementId, ...transfers,
        update_email: newEmail || null, delete_old_user: true, notes: notes || null,
      });
      setResult(data);
      toast.success(data.message || 'Offboarding complete');
      if (onComplete) onComplete();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Offboarding failed');
      setStep(3);
    } finally { setExecuting(false); }
  };

  if (!open || !targetUser) return null;
  const roleCfg = ROLE_CONFIG[targetUser.role?.toLowerCase()] || ROLE_CONFIG.staff;
  const totalItems = preview?.total_items || 0;

  // Step labels for the progress indicator
  const STEPS = ['Preview', 'Select Replacement', 'Configure & Confirm'];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !executing) onClose(); }}>
      <DialogContent
        className="p-0 overflow-hidden rounded-2xl border-0 shadow-2xl"
        style={{
          maxWidth: 680,
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Gradient Header ── */}
        <div className="relative overflow-hidden flex-shrink-0" style={{ background: 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 50%, #ef4444 100%)' }}>
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-24 -mt-24 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative px-6 py-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <UserMinus className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1">Employee Offboarding</p>
                <h2 className="text-xl font-bold text-white leading-snug tracking-tight">
                  {step === 4 && result ? 'Offboarding Complete' : `Offboard ${targetUser.full_name}`}
                </h2>
                <p className="text-white/55 text-sm mt-1">
                  {step === 4 && result ? result.message : 'Transfer data → Replace → Archive'}
                </p>
              </div>
            </div>
            {!executing && (
              <button onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0 transition-all active:scale-90 mt-0.5">
                <X className="h-4 w-4 text-white" />
              </button>
            )}
          </div>

          {/* Step progress bar inside header */}
          {step !== 4 && (
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2">
                {STEPS.map((label, i) => {
                  const s = i + 1;
                  const isActive = s === step;
                  const isDone   = s < step;
                  return (
                    <React.Fragment key={s}>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
                          isDone   ? 'bg-white text-red-700' :
                          isActive ? 'bg-white/90 text-red-700 ring-2 ring-white/50' :
                                     'bg-white/20 text-white/60'
                        }`}>
                          {isDone ? '✓' : s}
                        </div>
                        <span className={`text-[11px] font-semibold whitespace-nowrap ${
                          isActive ? 'text-white' : isDone ? 'text-white/70' : 'text-white/40'
                        }`}>{label}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 rounded-full min-w-[16px] transition-all ${s < step ? 'bg-white/70' : 'bg-white/20'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto users-slim" style={slimScroll}>

          {/* STEP 1 — Preview */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              {/* Target user card */}
              <div className={`flex items-center gap-4 p-4 rounded-2xl border ${isDark ? 'bg-red-950/20 border-red-900/40' : 'bg-red-50/80 border-red-200'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br ${roleCfg.gradient} flex-shrink-0`}>
                  {targetUser.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-slate-900 dark:text-white">{targetUser.full_name}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-gradient-to-r ${roleCfg.gradient}`}>
                      <roleCfg.icon className="h-2.5 w-2.5" />{roleCfg.label}
                    </span>
                    <Badge variant="destructive" className="text-[10px] h-5">Leaving</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{targetUser.email}</p>
                  {(targetUser.departments || []).length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {targetUser.departments.map(d => <DeptPill key={d} dept={d} />)}
                    </div>
                  )}
                </div>
              </div>

              {/* Data counts */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 className="h-4 w-4 text-blue-500" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">Data Owned by This Employee</h3>
                </div>
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : preview ? (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                      {Object.entries(preview.data_counts).map(([key, count]) => {
                        const label = key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
                        return (
                          <div key={key} className={`p-3 rounded-xl border text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{count}</p>
                            <p className="text-[10px] text-slate-500 font-medium mt-1 leading-tight">{label}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 ${
                      totalItems > 0
                        ? isDark ? 'bg-amber-950/30 text-amber-400 border border-amber-900/50' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        : isDark ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {totalItems > 0
                        ? `${totalItems} total items will be transferred to the replacement`
                        : 'No data to transfer — account can be safely removed'}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* STEP 2 — Select Replacement */}
          {step === 2 && (
            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2 mb-1">
                  <UsersIcon className="h-4 w-4 text-blue-500" /> Select Replacement Employee
                </h3>
                <p className="text-xs text-slate-500">All data from {targetUser.full_name} will be transferred to this person</p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  placeholder="Search by name or email…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className={`pl-10 h-10 rounded-xl text-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* User list */}
              <div className="space-y-2">
                {eligibleUsers.length === 0 ? (
                  <div className={`flex flex-col items-center py-10 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <UsersIcon className="h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">No eligible users found</p>
                  </div>
                ) : eligibleUsers.map(u => {
                  const uRole     = ROLE_CONFIG[u.role?.toLowerCase()] || ROLE_CONFIG.staff;
                  const URoleIcon = uRole.icon;
                  const isSelected = replacementId === u.id;
                  const depts = u.departments || [];

                  return (
                    <button
                      key={u.id}
                      onClick={() => setReplacementId(u.id)}
                      className={`w-full text-left rounded-2xl border-2 transition-all hover:shadow-sm overflow-hidden ${
                        isSelected
                          ? isDark ? 'border-emerald-500 bg-emerald-950/20' : 'border-emerald-500 bg-emerald-50'
                          : isDark ? 'border-slate-700 bg-slate-800 hover:border-slate-600' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 p-3.5">
                        {/* Avatar */}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 bg-gradient-to-br ${uRole.gradient}`}>
                          {u.profile_picture
                            ? <img src={u.profile_picture} alt="" className="w-full h-full object-cover rounded-xl" />
                            : u.full_name?.charAt(0)?.toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {/* Name + role badge row */}
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`font-semibold text-sm ${isSelected ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-900 dark:text-white'}`}>
                              {u.full_name}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-gradient-to-r ${uRole.gradient}`}>
                              <URoleIcon className="h-2.5 w-2.5" />{uRole.label}
                            </span>
                          </div>
                          {/* Email */}
                          <p className="text-[11px] text-slate-400 truncate mb-2">{u.email}</p>
                          {/* Dept pills — wrap freely, no truncation */}
                          {depts.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {depts.map(d => <DeptPill key={d} dept={d} />)}
                            </div>
                          )}
                        </div>

                        {/* Selected check */}
                        {isSelected && (
                          <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <CheckCircle className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3 — Configure Transfer */}
          {step === 3 && (
            <div className="p-6 space-y-5">
              {/* From → To banner */}
              <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 bg-gradient-to-br ${roleCfg.gradient}`}>
                    {targetUser.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-red-600 dark:text-red-400 truncate">{targetUser.full_name}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Leaving</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <ArrowRight className="h-5 w-5 text-slate-400" />
                  <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Replace</p>
                </div>
                {selectedReplacement && (
                  <div className="flex items-center gap-2.5 min-w-0 justify-end">
                    <div className="min-w-0 text-right">
                      <p className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 truncate">{selectedReplacement.full_name}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Replacement</p>
                    </div>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 bg-gradient-to-br ${(ROLE_CONFIG[selectedReplacement.role?.toLowerCase()] || ROLE_CONFIG.staff).gradient}`}>
                      {selectedReplacement.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>

              {/* Transfer toggles */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <SlidersHorizontal className="h-4 w-4 text-blue-500" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">Transfer Options</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TRANSFER_OPTIONS.map(opt => {
                    const Icon  = opt.icon;
                    const isOn  = !!transfers[opt.key];
                    const count = preview?.data_counts?.[opt.countKey] || 0;
                    return (
                      <div
                        key={opt.key}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                          isOn
                            ? isDark ? 'bg-emerald-950/25 border-emerald-800' : 'bg-emerald-50 border-emerald-200'
                            : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setTransfers(p => ({ ...p, [opt.key]: !p[opt.key] }))}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${opt.color}18` }}>
                            <Icon className="h-4 w-4" style={{ color: opt.color }} />
                          </div>
                          <div>
                            <p className="font-semibold text-[13px] text-slate-800 dark:text-white">{opt.label}</p>
                            <p className="text-[11px] text-slate-400 leading-tight">{opt.desc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {count > 0 && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${opt.color}18`, color: opt.color }}>{count}</span>
                          )}
                          <Switch checked={isOn} onCheckedChange={v => setTransfers(p => ({ ...p, [opt.key]: v }))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optional email update */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-violet-500" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">Update Replacement's Email</h3>
                  <span className="text-[10px] text-slate-400 font-normal">(optional)</span>
                </div>
                <Input
                  placeholder={`e.g. ${targetUser.email}`}
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="h-10 rounded-xl text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">Leave empty to keep {selectedReplacement?.email}</p>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">Offboarding Notes</h3>
                  <span className="text-[10px] text-slate-400 font-normal">(optional)</span>
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for leaving, handover notes, etc."
                  rows={2}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 transition-all ${
                    isDark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>

              {/* Warning */}
              <div className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs ${isDark ? 'bg-red-950/25 border-red-900/50 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="font-bold mb-0.5">This action cannot be undone</p>
                  <p className="leading-relaxed">
                    {targetUser.full_name}'s account will be permanently deleted. All selected data will be transferred to {selectedReplacement?.full_name}. An audit log entry will be created.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — Result */}
          {step === 4 && (
            <div className="p-6">
              {executing ? (
                <div className="flex flex-col items-center py-14">
                  <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
                  <p className="font-bold text-sm text-slate-800 dark:text-white">Processing offboarding…</p>
                  <p className="text-xs text-slate-500 mt-1">Transferring data and removing account</p>
                </div>
              ) : result ? (
                <div className="space-y-5">
                  <div className="flex flex-col items-center py-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
                      <CheckCircle className="h-8 w-8 text-emerald-500" />
                    </div>
                    <p className="font-bold text-xl text-slate-900 dark:text-white">Offboarding Complete</p>
                    <p className="text-sm text-slate-500 mt-1 text-center max-w-xs">{result.message}</p>
                  </div>
                  <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className={`px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider ${isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      Transfer Summary
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-x-8 gap-y-2">
                      {Object.entries(result.transfer_summary || {}).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-xs border-b border-slate-100 dark:border-slate-700/50 pb-2 last:border-0">
                          <span className="text-slate-500">{key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</span>
                          <span className={`font-semibold ${typeof val === 'boolean' ? (val ? 'text-emerald-600' : 'text-red-500') : 'text-slate-800 dark:text-white'}`}>
                            {typeof val === 'boolean' ? (val ? '✓' : '✗') : val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Sticky Footer ── */}
        {(step !== 4 || !result) ? (
          <div className={`px-6 py-4 border-t flex-shrink-0 flex items-center justify-between gap-4 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-white'}`}>
            <div className="text-xs text-slate-400">
              Step {step} of 3
            </div>
            <div className="flex gap-3">
              {step > 1 && !executing && (
                <Button variant="outline" onClick={() => setStep(s => s - 1)} className="h-10 px-5 rounded-xl text-sm">
                  ← Back
                </Button>
              )}
              {step === 1 && (
                <Button
                  onClick={() => setStep(2)}
                  className="h-10 px-6 rounded-xl font-semibold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
                >
                  Select Replacement <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 2 && (
                <Button
                  onClick={() => setStep(3)}
                  disabled={!replacementId}
                  className="h-10 px-6 rounded-xl font-semibold text-sm text-white"
                  style={{ background: replacementId ? 'linear-gradient(135deg, #0D3B66, #1F6FB2)' : '#94a3b8' }}
                >
                  Configure Transfer <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 3 && (
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="h-10 px-7 rounded-xl font-semibold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626)' }}
                >
                  {executing ? 'Processing…' : 'Confirm Offboarding'}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className={`px-6 py-4 border-t flex-shrink-0 flex justify-end ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-white'}`}>
            <Button onClick={onClose} className="h-10 px-8 rounded-xl font-semibold text-sm text-white" style={{ background: GRAD_GREEN }}>
              Done ✓
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
export default function Users() {
  const { user, refreshUser } = useAuth();
  const isDark = useDark();
  const isAdmin              = user?.role === 'admin';
  const isManager            = user?.role === 'manager';
  const perms                = user?.permissions || {};
  const canViewUserPage      = isAdmin || !!perms.can_view_user_page;
  const canEditUsers         = isAdmin || !!perms.can_manage_users;
  // Admin can manage any user's permissions.
  // Manager with can_manage_users can manage permissions for their team STAFF (not admin/manager).
  const canManagePermissions = isAdmin || (isManager && !!perms.can_manage_users);

  // ── Main page tab (Users vs Identix) ─────────────────────────────────────
  const [mainTab, setMainTab] = useState('users'); // 'users' | 'identix' | 'password_resets'
  // ── Identix sub-tab ───────────────────────────────────────────────────────
  const [identixTab, setIdentixTab] = useState('dashboard'); // 'dashboard' | 'devices' | 'enrollment' | 'logs'
  // ── Password reset requests (admin only) ──────────────────────────────────


  const [users,                setUsers]                = useState([]);
  const [clients,              setClients]              = useState([]);
  const [searchQuery,          setSearchQuery]          = useState('');
  const [activeTab,            setActiveTab]            = useState('all');
  const [dialogOpen,           setDialogOpen]           = useState(false);
  const [permDialogOpen,       setPermDialogOpen]       = useState(false);
  const [selectedUser,         setSelectedUser]         = useState(null);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);
  const [approvingId,          setApprovingId]          = useState(null);
  const [loading,              setLoading]              = useState(false);
  const [clientSearch,         setClientSearch]         = useState('');
  const [activePermTab,        setActivePermTab]        = useState('modules');
  const [pwSearch,             setPwSearch]             = useState('');

  const [offboardDialogOpen, setOffboardDialogOpen] = useState(false);
  const [offboardTarget, setOffboardTarget]         = useState(null);

  const [formData, setFormData] = useState({
    full_name: '', email: '', password: '', role: 'staff',
    departments: [], phone: '', birthday: '', profile_picture: '',
    punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
    telegram_id: '', is_active: true, status: 'active',
  });
  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });

  useEffect(() => {
    if (canViewUserPage) { fetchUsers(); fetchClients(); }
  }, [canViewUserPage]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users');
      const raw = res.data;
      setUsers(Array.isArray(raw) ? raw : (raw?.data || []));
    } catch { toast.error('Failed to fetch users'); }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await api.get('/clients');
      setClients(Array.isArray(res.data) ? res.data : (res.data?.data || []));
    } catch {}
  }, []);

  // ── Password Log (admin view of all users' account/password status) ───────

  useEffect(() => {
    if (mainTab === 'password_resets' && isAdmin && !users.length) fetchUsers();
  }, [mainTab, isAdmin]);

  const fetchPermissions = useCallback(async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/permissions`);
      setPermissions({ ...EMPTY_PERMISSIONS, ...(res.data || {}) });
    } catch {
      toast.error('Using default permission template');
      setPermissions({ ...EMPTY_PERMISSIONS });
    }
  }, []);

  const handleInput      = useCallback((e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); }, []);
  const handleRoleChange = useCallback((v) => setFormData(p => ({ ...p, role: v })), []);
  const toggleDept       = useCallback((d) => setFormData(p => ({
    ...p, departments: p.departments.includes(d) ? p.departments.filter(x => x !== d) : [...p.departments, d],
  })), []);
  const handlePhoto = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData(p => ({ ...p, profile_picture: reader.result }));
    reader.readAsDataURL(file);
  }, []);

  const handleEdit = useCallback((userData) => {
    setSelectedUser(userData);
    setFormData({
      full_name: userData.full_name || '', email: userData.email || '', password: '',
      role: userData.role || 'staff', departments: userData.departments || [],
      phone: userData.phone || '',
      birthday: userData.birthday && userData.birthday !== '' ? format(new Date(userData.birthday), 'yyyy-MM-dd') : '',
      profile_picture: userData.profile_picture || '',
      punch_in_time: userData.punch_in_time || '10:30', grace_time: userData.grace_time || '00:10',
      punch_out_time: userData.punch_out_time || '19:00',
      telegram_id: userData.telegram_id != null ? String(userData.telegram_id) : '',
      is_active: userData.is_active !== false, status: userData.status || 'active',
    });
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.full_name.trim())              { toast.error('Full name is required'); return; }
    if (!selectedUser && !formData.email.trim()) { toast.error('Email is required');     return; }
    setLoading(true);
    try {
      if (selectedUser) {
        const payload = {
          full_name: formData.full_name.trim(), phone: formData.phone || null,
          birthday: formData.birthday || null, profile_picture: formData.profile_picture || null,
          punch_in_time: formData.punch_in_time || null, grace_time: formData.grace_time || null,
          punch_out_time: formData.punch_out_time || null,
          telegram_id: formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active: formData.is_active,
          ...(isAdmin && { email: formData.email.trim(), role: formData.role, status: formData.status, departments: formData.departments }),
          ...(isAdmin && formData.password.trim() && { password: formData.password.trim() }),
        };
        await api.put(`/users/${selectedUser.id}`, payload);
        if (selectedUser.id === user?.id) await refreshUser();
        toast.success('✓ User updated successfully');
      } else {
        await api.post('/auth/register', {
          full_name: formData.full_name.trim(), email: formData.email.trim(),
          password: formData.password, role: formData.role, departments: formData.departments,
          phone: formData.phone || null, birthday: formData.birthday || null,
          punch_in_time: formData.punch_in_time, grace_time: formData.grace_time,
          punch_out_time: formData.punch_out_time,
          telegram_id: formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active: false, status: 'pending_approval',
        });
        toast.success('✓ Member registered — awaiting approval');
      }
      setDialogOpen(false); fetchUsers();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save user');
    } finally { setLoading(false); }
  }, [selectedUser, formData, isAdmin, user?.id, refreshUser, fetchUsers]);

  const handleDelete = useCallback(async (id) => {
    // Per permission matrix: DELETE users is Admin-only
    if (!isAdmin) { toast.error('Only administrators can delete users'); return; }
    if (id === user?.id) { toast.error('You cannot delete your own account'); return; }
    if (!window.confirm('Permanently delete this user and all their data?')) return;
    try { await api.delete(`/users/${id}`); toast.success('User removed'); fetchUsers(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete user'); }
  }, [isAdmin, user?.id, fetchUsers]);

  const handleOffboard = useCallback((userData) => {
    setOffboardTarget(userData);
    setOffboardDialogOpen(true);
  }, []);

  const openPermissionsDialog = useCallback(async (userData) => {
    // Manager can only manage permissions for staff
    if (!isAdmin && isManager && userData.role !== 'staff') {
      toast.error('Managers can only manage permissions for staff members');
      return;
    }
    setSelectedUserForPerms(userData);
    setActivePermTab('modules');
    await fetchPermissions(userData.id);
    setPermDialogOpen(true);
  }, [isAdmin, isManager, fetchPermissions]);

  const handleSavePermissions = useCallback(async () => {
    if (!canManagePermissions) { toast.error('Only administrators or managers can update permissions'); return; }
    // Managers cannot update permissions for other managers or admins
    if (!isAdmin && isManager && selectedUserForPerms?.role !== 'staff') {
      toast.error('Managers can only update permissions for staff members');
      return;
    }
    setLoading(true);
    try {
      const ensureArray = v => Array.isArray(v) ? v : [];
      const payload = {
        ...permissions,
        view_password_departments: ensureArray(permissions.view_password_departments),
        assigned_clients: ensureArray(permissions.assigned_clients),
        view_other_tasks: ensureArray(permissions.view_other_tasks),
        view_other_attendance: ensureArray(permissions.view_other_attendance),
        view_other_reports: ensureArray(permissions.view_other_reports),
        view_other_todos: ensureArray(permissions.view_other_todos),
        view_other_activity: ensureArray(permissions.view_other_activity),
        view_other_visits: ensureArray(permissions.view_other_visits),
      };
      await api.put(`/users/${selectedUserForPerms?.id}/permissions`, payload);
      if (selectedUserForPerms?.id === user?.id) await refreshUser();
      toast.success('✓ Permissions saved');
      if (selectedUserForPerms?.id !== user?.id) {
        toast.info(`${selectedUserForPerms?.full_name || 'The user'} will see updated permissions on their next page load.`, { duration: 5000 });
      }
      setPermDialogOpen(false); fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update permissions');
    } finally { setLoading(false); }
  }, [isAdmin, isManager, canManagePermissions, permissions, selectedUserForPerms?.id, selectedUserForPerms?.role, user?.id, refreshUser, fetchUsers]);

  const resetPermissionsToRole = useCallback((role) => {
    setPermissions({ ...(DEFAULT_ROLE_PERMISSIONS[role] || EMPTY_PERMISSIONS) });
    toast.info(`Reset to ${role} defaults — click Save to apply`);
  }, []);

  const handleApprove = useCallback(async (userData) => {
    if (!isAdmin) { toast.error('Only admins can approve users'); return; }
    setApprovingId(userData.id);
    try { await api.post(`/users/${userData.id}/approve`); toast.success(`✓ ${userData.full_name} approved`); fetchUsers(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to approve'); }
    finally { setApprovingId(null); }
  }, [isAdmin, fetchUsers]);

  const handleReject = useCallback(async (userData) => {
    if (!isAdmin) { toast.error('Only admins can reject users'); return; }
    if (!window.confirm(`Reject ${userData.full_name}?`)) return;
    setApprovingId(userData.id);
    try { await api.post(`/users/${userData.id}/reject`); toast.success(`${userData.full_name} rejected`); fetchUsers(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to reject'); }
    finally { setApprovingId(null); }
  }, [isAdmin, fetchUsers]);

  const pendingUsers   = useMemo(() => users.filter(u => u.status === 'pending_approval'), [users]);
  const filteredUsers  = useMemo(() => users.filter(u => {
    const q = searchQuery.toLowerCase();
    const match = (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    if (activeTab === 'pending')  return match && u.status === 'pending_approval';
    if (activeTab === 'rejected') return match && u.status === 'rejected';
    if (activeTab === 'all')      return match;
    return match && u.role?.toLowerCase() === activeTab;
  }), [users, searchQuery, activeTab]);

  const stats = useMemo(() => [
    { label: 'Total Members', value: users.length,                                icon: UsersIcon,  color: COLORS.mediumBlue   },
    { label: 'Admins',        value: users.filter(u => u.role === 'admin').length, icon: Crown,      color: COLORS.indigo       },
    { label: 'Pending',       value: pendingUsers.length,                          icon: Clock,      color: '#D97706'           },
    { label: 'Active',        value: users.filter(u => u.is_active).length,        icon: CheckCircle, color: COLORS.emeraldGreen },
  ], [users, pendingUsers.length]);

  const enabledPermCount = Object.entries(permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length;

  if (!canViewUserPage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#0a0f1c] p-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <ShieldOff className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            You need the <span className="font-semibold text-slate-700 dark:text-slate-200">View User Directory</span> permission to access this page.
          </p>
        </motion.div>
      </div>
    );
  }

  const tabs = [
    { id: 'all',      label: 'All',      count: users.length },
    { id: 'admin',    label: 'Admins',   count: users.filter(u => u.role === 'admin').length },
    { id: 'manager',  label: 'Managers', count: users.filter(u => u.role === 'manager').length },
    { id: 'staff',    label: 'Staff',    count: users.filter(u => u.role === 'staff').length },
    { id: 'rejected', label: 'Rejected', count: users.filter(u => u.status === 'rejected').length },
  ];

  const identixSubTabs = [
    { id: 'dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'devices',    label: 'Devices',       icon: Monitor         },
    { id: 'enrollment', label: 'Enrollment',    icon: Fingerprint     },
    { id: 'logs',       label: 'Attendance Log',icon: ClipboardList   },
  ];

  return (
    <motion.div
      className={`space-y-5 p-5 md:p-8 min-h-screen ${isDark ? 'bg-[#0a0f1c]' : 'bg-slate-50'}`}
      initial="hidden" animate="visible" variants={containerVariants}>

      {/* ── Page Header ── */}
      <motion.div variants={slideIn}>
        <div className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)`, boxShadow: '0 8px 32px rgba(13,59,102,0.28)' }}>
          <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute right-28 bottom-0 w-40 h-40 rounded-full mb-[-40px] opacity-5"
            style={{ background: 'white' }} />
          <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5" style={{ background: 'white' }} />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                {mainTab === 'identix'
                  ? <Fingerprint className="h-5 w-5 text-white" />
                  : <UsersIcon className="h-5 w-5 text-white" />}
              </div>
              <div>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Team Management</p>
                <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
                  {mainTab === 'identix' ? 'Identix Machine Integration' : 'User Directory'}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Main tab switcher */}
              <div className="flex gap-1 p-1 rounded-xl bg-white/10 backdrop-blur-sm">
                {[
                  { id: 'users',           label: 'Users',           icon: UsersIcon   },
                  { id: 'identix',         label: 'Identix',         icon: Fingerprint },
                  ...(isAdmin ? [{ id: 'password_resets', label: 'Password Resets', icon: KeyRound }] : []),
                ].map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setMainTab(t.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={mainTab === t.id
                        ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                        : { color: 'rgba(255,255,255,0.6)' }}>
                      <Icon className="h-4 w-4" />{t.label}
                    </button>
                  );
                })}
              </div>
              {mainTab === 'users' && isAdmin && (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    onClick={() => {
                      setSelectedUser(null);
                      setFormData({ full_name:'',email:'',password:'',role:'staff',departments:[],phone:'',birthday:'',profile_picture:'',punch_in_time:'10:30',grace_time:'00:10',punch_out_time:'19:00',telegram_id:'',is_active:true,status:'active' });
                      setDialogOpen(true);
                    }}
                    className="h-10 px-6 rounded-xl font-semibold text-sm shadow-lg bg-white/20 hover:bg-white/30 text-white border border-white/20 hover:border-white/30 transition-all">
                    <Plus className="h-4 w-4 mr-2" />Add New Member
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ════ USERS TAB ════ */}
      {mainTab === 'users' && (
        <>
          {/* Stats */}
          <motion.div variants={containerVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={i} variants={itemVariants} whileHover={{ y: -2, transition: springPhysics.card }} whileTap={{ scale: 0.985 }}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-sm hover:shadow-md transition-all cursor-default">
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                      <p className="text-2xl font-bold mt-0.5 tracking-tight" style={{ color: s.color }}>{s.value}</p>
                    </div>
                    <div className="p-2 rounded-xl flex-shrink-0" style={{ background: `${s.color}12` }}>
                      <Icon className="h-4 w-4" style={{ color: s.color }} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Pending Approvals */}
          {pendingUsers.length > 0 && isAdmin && (
            <motion.div variants={itemVariants} className="space-y-4">
              <SectionCard>
                <CardHeaderRow iconBg={isDark ? 'bg-amber-900/40' : 'bg-amber-50'}
                  icon={<Clock className="h-4 w-4 text-amber-500" />}
                  title="Pending Approvals" subtitle={`${pendingUsers.length} awaiting review`} badge={pendingUsers.length} />
                <div className="p-4">
                  <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingUsers.map(u => (
                      <PendingUserCard key={u.id} userData={u} onApprove={handleApprove} onReject={handleReject} approving={approvingId} />
                    ))}
                  </motion.div>
                </div>
              </SectionCard>
            </motion.div>
          )}

          {/* Tabs + Search */}
          <motion.div variants={itemVariants} className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                    activeTab === tab.id ? 'text-white shadow-md' : isDark ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 hover:text-slate-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                  style={activeTab === tab.id ? { background: GRADIENT } : {}}>
                  {tab.label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by name or email…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className={`pl-11 h-11 rounded-xl text-sm border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-600' : 'bg-white border-slate-200 placeholder:text-slate-400 focus:border-blue-400'}`} />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>

          {/* Users Grid */}
          <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.length > 0
              ? filteredUsers.map(u => (
                  <UserCard key={u.id} userData={u} onEdit={handleEdit} onDelete={handleDelete}
                    onOffboard={handleOffboard} onPermissions={openPermissionsDialog} onApprove={handleApprove} onReject={handleReject}
                    currentUserId={user?.id || ''} isAdmin={isAdmin} isManager={isManager} canEditUsers={canEditUsers}
                    canManagePermissions={canManagePermissions} approving={approvingId} />
                ))
              : (
                <motion.div variants={itemVariants} className="col-span-full">
                  <div className={`flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className={`p-4 rounded-2xl mb-4 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <UsersIcon className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-semibold">No users found</p>
                    <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Try adjusting your search or filter</p>
                  </div>
                </motion.div>
              )}
          </motion.div>
        </>
      )}

      {/* ════ PASSWORD RESETS TAB (Admin only) ════ */}
      {mainTab === 'password_resets' && isAdmin && (
        <motion.div variants={itemVariants} className="space-y-4">
          {/* Info banner */}
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${
            isDark ? 'bg-blue-950/30 border-blue-900/50 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-700'
          }`}>
            <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
            <span>To reset or change a user&apos;s password, open their profile via the <b>Users</b> tab → Edit (pencil icon) → New Password field.</span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, email or role…"
              value={pwSearch}
              onChange={e => setPwSearch(e.target.value)}
              className={`pl-10 h-10 rounded-xl text-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
            />
            {pwSearch && (
              <button onClick={() => setPwSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Password log table */}
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Table header */}
            <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-100 bg-slate-50/80'}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.mediumBlue}15` }}>
                  <KeyRound className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Account Password Log</p>
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>All users · {users.length} accounts</p>
                </div>
              </div>
              <Button onClick={fetchUsers} variant="outline" className={`h-8 px-3 rounded-lg text-xs gap-1.5 ${isDark ? 'border-slate-600 text-slate-300' : ''}`}>
                <RefreshCw className="h-3 w-3" />Refresh
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-slate-700/80 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'}`}>
                    {['Member', 'Role', 'Departments', 'Account Status', 'Last Updated', 'Action'].map(h => (
                      <th key={h} className={`text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-slate-700/40' : 'divide-slate-50'}`}>
                  {users
                    .filter(u => {
                      const q = pwSearch.toLowerCase();
                      return !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
                    })
                    .map(u => {
                      const roleCfg = ROLE_CONFIG[u.role?.toLowerCase()] || ROLE_CONFIG.staff;
                      const RoleIcon = roleCfg.icon;
                      return (
                        <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50/80'}`}>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-xs font-black bg-gradient-to-br ${roleCfg.gradient}`}>
                                {u.profile_picture
                                  ? <img src={u.profile_picture} alt="" className="w-full h-full object-cover" />
                                  : u.full_name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div>
                                <p className={`font-semibold text-xs leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{u.full_name}</p>
                                <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-gradient-to-r ${roleCfg.gradient}`}>
                              <RoleIcon className="h-3 w-3" />{roleCfg.label}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(u.departments || []).slice(0, 3).map(d => <DeptPill key={d} dept={d} />)}
                              {(u.departments || []).length > 3 && <span className="text-[10px] text-slate-400">+{u.departments.length - 3}</span>}
                              {!(u.departments || []).length && <span className="text-[11px] text-slate-400">—</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4"><StatusBadge status={u.status} isActive={u.is_active} /></td>
                          <td className="py-3 px-4 text-[11px] text-slate-400">
                            {u.updated_at ? format(new Date(u.updated_at), 'dd MMM yyyy') : u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy') : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleEdit(u)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
                              style={{ color: COLORS.mediumBlue, borderColor: `${COLORS.mediumBlue}30`, background: `${COLORS.mediumBlue}08` }}>
                              <Lock className="h-3 w-3" />Set Password
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {users.filter(u => {
                const q = pwSearch.toLowerCase();
                return !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
              }).length === 0 && (
                <div className={`py-14 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-25" />
                  <p className="text-sm font-medium">No users found</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ════ IDENTIX TAB ════ */}
      {mainTab === 'identix' && (
        <motion.div variants={itemVariants}>
          {/* Identix sub-tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {identixSubTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setIdentixTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                    identixTab === tab.id ? 'text-white shadow-md' : isDark ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 hover:text-slate-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                  style={identixTab === tab.id ? { background: GRADIENT } : {}}>
                  <Icon className="h-4 w-4" />{tab.label}
                </button>
              );
            })}
          </div>

          <SectionCard>
            <div className="p-5">
              <AnimatePresence mode="wait">
                <motion.div key={identixTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                  {identixTab === 'dashboard'  && <IdentixDashboardTab />}
                  {identixTab === 'devices'    && <IdentixDevicesTab />}
                  {identixTab === 'enrollment' && <IdentixEnrollmentTab />}
                  {identixTab === 'logs'       && <IdentixAttendanceTab />}
                </motion.div>
              </AnimatePresence>
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* ════ CREATE / EDIT DIALOG ════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto users-slim rounded-2xl p-0 border-0 shadow-2xl gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedUser ? `Edit Member — ${selectedUser.full_name}` : 'Add New Team Member'}</DialogTitle>
            <DialogDescription>{selectedUser ? 'Update user profile and settings.' : 'Register a new team member.'}</DialogDescription>
          </DialogHeader>
          <DialogGradHeader gradient={GRADIENT} icon={selectedUser ? Pencil : Plus}
            eyebrow={selectedUser ? 'Edit Member' : 'New Member'}
            title={selectedUser ? selectedUser.full_name : 'Add Team Member'}
            subtitle={isAdmin ? 'Full administrative control' : 'Update your personal information'} />
          <div className="p-6 space-y-6 bg-white dark:bg-slate-900">
            <div className="flex justify-center">
              <label className="relative group cursor-pointer">
                <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-white dark:border-slate-800 shadow-lg ring-1 ring-slate-200 dark:ring-slate-700">
                  {formData.profile_picture
                    ? <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: GRADIENT }}>
                        <UserIcon className="h-10 w-10 text-white/60" />
                      </div>}
                </div>
                <div className="absolute bottom-1 right-1 w-8 h-8 bg-white dark:bg-slate-700 rounded-xl flex items-center justify-center shadow-md border border-slate-200 dark:border-slate-600 group-hover:scale-110 transition-transform">
                  <Camera className="h-4 w-4 text-blue-600" />
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Full Name</Label>
                <Input name="full_name" value={formData.full_name} onChange={handleInput} placeholder="Full Name" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Email Address</Label>
                <Input type="email" name="email" value={formData.email} onChange={handleInput}
                  disabled={!isAdmin || (selectedUser && selectedUser.id === user?.id)}
                  placeholder="name@company.com" className="h-11 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Phone Number</Label>
                <Input name="phone" value={formData.phone} onChange={handleInput} placeholder="+91 98765 43210" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />{selectedUser ? 'New Password' : 'Initial Password'}
                </Label>
                <Input type="password" name="password" value={formData.password} onChange={handleInput}
                  placeholder={selectedUser ? 'Leave blank to keep current' : 'Secure password'} className="h-11 rounded-xl" />
              </div>
            </div>
            <div className={`rounded-xl p-5 border ${isDark ? 'bg-blue-950/20 border-blue-900/50' : 'bg-blue-50 border-blue-100'}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-900/60' : 'bg-blue-100'}`}>
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <span className="font-semibold text-sm text-blue-700 dark:text-blue-400 uppercase tracking-wider">Work Shift Schedule</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[{ label: 'Punch In', name: 'punch_in_time' }, { label: 'Grace Period', name: 'grace_time' }, { label: 'Punch Out', name: 'punch_out_time' }].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <Label className="text-xs font-medium text-blue-600 dark:text-blue-400">{f.label}</Label>
                    <Input type="time" name={f.name} value={formData[f.name]} onChange={handleInput} className="h-11 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Birthday</Label>
                <Input type="date" name="birthday" value={formData.birthday} onChange={handleInput} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Telegram ID</Label>
                <Input type="number" name="telegram_id" value={formData.telegram_id} onChange={handleInput} placeholder="123456789" className="h-11 rounded-xl" />
              </div>
            </div>
            {isAdmin && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Role</Label>
                    <Select value={formData.role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Account Status</Label>
                    <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v, is_active: v === 'active' }))}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending_approval">Pending Approval</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Assigned Departments</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {DEPARTMENTS.map(dept => {
                      const active = formData.departments.includes(dept.value);
                      return (
                        <button key={dept.value} type="button" onClick={() => toggleDept(dept.value)}
                          className="h-10 rounded-xl text-xs font-bold border-2 transition-all hover:shadow-sm"
                          style={active ? { background: dept.color, color: 'white', borderColor: dept.color } : { background: dept.bg, color: dept.color, borderColor: `${dept.color}30` }}>
                          {dept.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className={`px-6 py-4 border-t flex justify-end gap-3 rounded-b-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-10 px-6 rounded-xl text-sm">Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading} className="h-10 px-8 rounded-xl font-semibold text-sm text-white" style={{ background: GRAD_GREEN }}>
              {loading ? 'Saving…' : selectedUser ? 'Save Changes' : 'Create Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════ PERMISSIONS DIALOG ════ */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto users-slim rounded-2xl p-0 border-0 shadow-2xl gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{`Permissions — ${selectedUserForPerms?.full_name || 'User'}`}</DialogTitle>
            <DialogDescription>Configure access levels and module permissions for this user.</DialogDescription>
          </DialogHeader>
          <DialogGradHeader gradient={GRADIENT} icon={Shield} eyebrow="Access Governance"
            title={`Permissions — ${selectedUserForPerms?.full_name || ''}`}
            subtitle="Configure access levels and module permissions" />
          <div className="p-6 space-y-5 bg-white dark:bg-slate-900">
            <PermissionMatrixSummary permissions={permissions} />
            {/* Manager scope notice */}
            {isManager && !isAdmin && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  <strong>Manager scope:</strong> You can only grant permissions you yourself possess. Admin-only flags (Delete, Send Reminders, Rankings) are locked and cannot be changed.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Reset:</span>
              {(isAdmin ? ['staff', 'manager', 'admin'] : ['staff']).map(role => {
                const cfg = ROLE_CONFIG[role]; const RIcon = cfg.icon;
                return (
                  <button key={role} onClick={() => resetPermissionsToRole(role)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all hover:shadow-sm capitalize"
                    style={{ borderColor: `${cfg.hex}40`, color: cfg.hex, background: `${cfg.hex}08` }}>
                    <RIcon className="h-3 w-3" />{role} Template
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {permTabs.map(tab => {
                const TabIcon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActivePermTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-xs transition-all whitespace-nowrap ${
                      activePermTab === tab.id ? 'text-white shadow-md' : isDark ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 hover:border-slate-600' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                    }`}
                    style={activePermTab === tab.id ? { background: GRADIENT } : {}}>
                    <TabIcon className="h-3.5 w-3.5" />{tab.label}
                  </button>
                );
              })}
            </div>
            {activePermTab === 'modules' && (
              <div className="space-y-4">
                <SectionHeader icon={Zap} title="Module Access" color={COLORS.violet} />
                <div className="grid grid-cols-1 gap-3">
                  <ModuleAccessCard icon={Target} title="Leads Pipeline" desc="Access and manage the global leads dashboard" permKey="can_view_all_leads" permissions={permissions} setPermissions={setPermissions} accentColor="#3B82F6" />
                  <ModuleAccessCard icon={Receipt} title="Quotations" desc="Create, edit, export and send quotations to clients" permKey="can_create_quotations" permissions={permissions} setPermissions={setPermissions} accentColor="#8B5CF6" />
                  <ModuleAccessCard icon={FileText} title="Invoicing & Billing" desc="Create GST invoices, record payments, manage product catalog" permKey="can_manage_invoices" permissions={permissions} setPermissions={setPermissions} accentColor={COLORS.emeraldGreen} badge={permissions.can_manage_invoices ? 'Full Access' : undefined} />
                  <ModuleAccessCard icon={KeyRound} title="Password Vault" desc="Access the secure portal credentials repository" permKey="can_view_passwords" permissions={permissions} setPermissions={setPermissions} accentColor="#F59E0B" badge={permissions.can_edit_passwords ? 'Read / Write' : permissions.can_view_passwords ? 'Read Only' : undefined} />
                  {permissions.can_view_passwords && (
                    <div className="ml-5 space-y-3">
                      <PermToggleRow permKey="can_edit_passwords" label="Vault Write Access" desc="Allow adding, editing and deleting portal credentials" icon={Pencil} permissions={permissions} setPermissions={setPermissions} />
                      <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Vault Department Scope
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                          Leave empty to allow access to all departments. Select specific departments to restrict.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {DEPARTMENTS.map(dept => {
                            const isSelected = (permissions.view_password_departments || []).includes(dept.value);
                            return (
                              <button
                                key={dept.value}
                                onClick={() => setPermissions(prev => ({
                                  ...prev,
                                  view_password_departments: isSelected
                                    ? prev.view_password_departments.filter(d => d !== dept.value)
                                    : [...(prev.view_password_departments || []), dept.value],
                                }))}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all hover:shadow-sm"
                                style={isSelected
                                  ? { background: dept.color, color: 'white', borderColor: dept.color }
                                  : { background: dept.bg, color: dept.color, borderColor: `${dept.color}30` }
                                }
                              >
                                {isSelected ? '✓ ' : ''}{dept.label}
                              </button>
                            );
                          })}
                        </div>
                        {(permissions.view_password_departments || []).length === 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                            ✓ Access to all departments (no restriction)
                          </p>
                        )}
                        {(permissions.view_password_departments || []).length > 0 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                            ⚠ Restricted to {(permissions.view_password_departments || []).join(', ')} only
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Compliance Tracker ─────────────────────────────── */}
                  <ModuleAccessCard
                    icon={ShieldCheck}
                    title="Compliance Tracker"
                    desc="View the Compliance Tracker page. Non-admins see only their department's categories (GST, ROC, TDS, etc.)"
                    permKey="can_view_compliance"
                    permissions={permissions}
                    setPermissions={setPermissions}
                    accentColor="#1F6FB2"
                    badge={
                      permissions.can_manage_compliance
                        ? 'View + Manage'
                        : permissions.can_view_compliance
                        ? 'View Only'
                        : undefined
                    }
                  />
                  {permissions.can_view_compliance && (
                    <div className="ml-5">
                      <PermToggleRow
                        permKey="can_manage_compliance"
                        label="Manage Compliance Items"
                        desc="Allow creating and editing compliance masters in their department. Delete is admin-only."
                        icon={Pencil}
                        permissions={permissions}
                        setPermissions={setPermissions}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            {activePermTab === 'view' && (
              <div>
                <SectionHeader icon={Eye} title="View Permissions" color="#3B82F6" count={GLOBAL_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">{GLOBAL_PERMS.map(p => <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon} permissions={permissions} setPermissions={setPermissions} />)}</div>
              </div>
            )}
            {activePermTab === 'ops' && (
              <div>
                <SectionHeader icon={Settings} title="Operational Controls" color="#8B5CF6" count={OPS_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">{OPS_PERMS.map(p => <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon} permissions={permissions} setPermissions={setPermissions} />)}</div>
              </div>
            )}
            {activePermTab === 'edit' && (
              <div>
                <SectionHeader icon={Pencil} title="Modification Rights" color="#F59E0B" count={EDIT_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">{EDIT_PERMS.map(p => <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon} permissions={permissions} setPermissions={setPermissions} />)}</div>
              </div>
            )}
            {activePermTab === 'cross' && (
              <div className="space-y-5">
                <SectionHeader icon={UsersIcon} title="Cross-User Data Access" color={COLORS.emeraldGreen} />
                <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">Select team members whose data this user can view</p>
                {[
                  { key: 'view_other_tasks',      label: 'Tasks',      icon: Layers,      color: '#3B82F6' },
                  { key: 'view_other_attendance', label: 'Attendance', icon: Clock,       color: '#8B5CF6' },
                  { key: 'view_other_reports',    label: 'Reports',    icon: BarChart2,   color: '#F59E0B' },
                  { key: 'view_other_todos',      label: 'Todos',      icon: CheckCircle, color: '#10B981' },
                  { key: 'view_other_activity',   label: 'Activity',   icon: Activity,    color: '#EF4444' },
                  { key: 'view_other_visits',     label: 'Visits',     icon: MapPin,      color: '#0F766E' },
                ].map(section => {
                  const SIcon = section.icon;
                  const selectedCount = (permissions[section.key] || []).length;
                  return (
                    <SectionCard key={section.key}>
                      <CardHeaderRow iconBg={isDark ? 'bg-slate-700' : 'bg-slate-50'} icon={<SIcon className="h-4 w-4" style={{ color: section.color }} />}
                        title={section.label} subtitle={`${selectedCount} member${selectedCount !== 1 ? 's' : ''} selected`} badge={selectedCount || undefined} />
                      <div className="p-4 flex flex-wrap gap-2">
                        {users.filter(u => u.id !== selectedUserForPerms?.id).map(u => {
                          const isSel = (permissions[section.key] || []).includes(u.id);
                          return (
                            <button key={u.id}
                              onClick={() => setPermissions(prev => ({ ...prev, [section.key]: isSel ? (prev[section.key] || []).filter(id => id !== u.id) : [...(prev[section.key] || []), u.id] }))}
                              className="px-3.5 py-2 rounded-xl text-xs font-semibold border-2 transition-all hover:shadow-sm"
                              style={isSel ? { background: section.color, color: 'white', borderColor: section.color } : isDark ? { background: '#1e293b', color: '#94a3b8', borderColor: '#334155' } : { background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }}>
                              {isSel ? '✓ ' : ''}{u.full_name}
                            </button>
                          );
                        })}
                      </div>
                    </SectionCard>
                  );
                })}
              </div>
            )}
            {activePermTab === 'clients' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={Briefcase} title="Client Portfolio" color={COLORS.teal} />
                  {(permissions.assigned_clients || []).length > 0 && (
                    <button onClick={() => setPermissions(p => ({ ...p, assigned_clients: [] }))} className="text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 transition-colors -mt-5">Clear All</button>
                  )}
                </div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-sm font-semibold" style={{ color: COLORS.teal }}>{(permissions.assigned_clients || []).length}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">clients assigned</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search clients…" value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="pl-11 h-11 rounded-xl" />
                </div>
                <div className="users-slim max-h-[400px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1" style={slimScroll}>
                  {clients.filter(c => (c.company_name || '').toLowerCase().includes(clientSearch.toLowerCase())).map(client => {
                    const isAssigned = (permissions.assigned_clients || []).includes(client.id);
                    return (
                      <button key={client.id}
                        onClick={() => setPermissions(prev => ({ ...prev, assigned_clients: isAssigned ? (prev.assigned_clients || []).filter(id => id !== client.id) : [...(prev.assigned_clients || []), client.id] }))}
                        className="flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all hover:shadow-sm"
                        style={isAssigned ? { borderColor: '#1FAF5A', background: isDark ? 'rgba(31,175,90,0.12)' : '#f0fdf4' } : isDark ? { borderColor: '#334155', background: '#1e293b' } : { borderColor: '#e2e8f0', background: '#f8fafc' }}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isAssigned ? 'bg-emerald-500 text-white' : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                          {isAssigned ? <CheckCircle className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                        </div>
                        <span className={`font-medium text-sm leading-tight ${isAssigned ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>{client.company_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className={`px-6 py-4 border-t flex items-center justify-between gap-4 rounded-b-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{enabledPermCount} permissions enabled</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setPermDialogOpen(false)} className="h-10 px-6 rounded-xl text-sm">Cancel</Button>
              <Button onClick={handleSavePermissions} disabled={loading} className="h-10 px-8 rounded-xl font-semibold text-sm text-white" style={{ background: GRAD_GREEN }}>
                {loading ? 'Saving…' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OFFBOARDING DIALOG */}
      <OffboardingDialog
        open={offboardDialogOpen}
        onClose={() => { setOffboardDialogOpen(false); setOffboardTarget(null); }}
        targetUser={offboardTarget}
        allUsers={users}
        onComplete={() => { fetchUsers(); }}
      />
    </motion.div>
  );
}
