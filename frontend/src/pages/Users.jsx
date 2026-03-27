"""
Users.jsx — Taskosphere User Directory
Redesigned with fixed permission matrix.
Admin = superuser (bypasses all checks).
Manager / Staff = permission-gated.
"""

import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Shield, User as UserIcon, Settings, Eye,
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase,
  Mail, Phone, Calendar, Camera, Clock, UserCheck, UserX,
  KeyRound, Receipt, Target, Lock, ChevronRight,
  Activity, BarChart2, Star, Layers, Globe, FileText, Bell,
  Hash, SlidersHorizontal, ShieldCheck, ShieldOff, Fingerprint,
  Download, Pencil, Inbox, Trash2, Edit, AlertCircle,
  ArrowUpRight, Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  deepBlue:   '#0D3B66',
  blue:       '#1F6FB2',
  green:      '#1FAF5A',
  lightGreen: '#5CCB5F',
  indigo:     '#4F46E5',
  violet:     '#7C3AED',
  teal:       '#0F766E',
  amber:      '#B45309',
};

const GRAD_BLUE  = `linear-gradient(135deg, ${BRAND.deepBlue} 0%, ${BRAND.blue} 100%)`;
const GRAD_GREEN = `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.lightGreen} 100%)`;

const DEPARTMENTS = [
  { value: 'GST',   color: '#1E3A8A', bg: '#EFF6FF' },
  { value: 'IT',    color: '#374151', bg: '#F9FAFB' },
  { value: 'ACC',   color: '#065F46', bg: '#ECFDF5' },
  { value: 'TDS',   color: '#1F2937', bg: '#F9FAFB' },
  { value: 'ROC',   color: '#7C2D12', bg: '#FFF7ED' },
  { value: 'TM',    color: '#0F766E', bg: '#F0FDFA' },
  { value: 'MSME',  color: '#92400E', bg: '#FFFBEB' },
  { value: 'FEMA',  color: '#334155', bg: '#F8FAFC' },
  { value: 'DSC',   color: '#3F3F46', bg: '#FAFAFA' },
  { value: 'OTHER', color: '#475569', bg: '#F8FAFC' },
];

const ROLE_CFG = {
  admin:   { grad: 'from-violet-600 to-indigo-600', icon: Crown,     label: 'Admin'   },
  manager: { grad: 'from-blue-500 to-cyan-500',     icon: Briefcase, label: 'Manager' },
  staff:   { grad: 'from-slate-400 to-slate-500',   icon: UserIcon,  label: 'Staff'   },
};

// ── Permission templates — MUST stay in sync with models.py ──────────────────
const PERM_DEFAULTS = {
  admin: {
    can_view_all_tasks: true, can_view_all_clients: true, can_view_all_dsc: true,
    can_view_documents: true, can_view_all_duedates: true, can_view_reports: true,
    can_view_attendance: true, can_view_all_leads: true, can_view_todo_dashboard: true,
    can_view_audit_logs: true, can_view_user_page: true, can_view_selected_users_reports: true,
    can_view_staff_rankings: true, can_view_staff_activity: true, can_view_own_data: true,
    can_edit_tasks: true, can_edit_clients: true, can_edit_dsc: true,
    can_edit_documents: true, can_edit_due_dates: true, can_edit_users: true,
    can_manage_users: true, can_manage_settings: true, can_assign_tasks: true,
    can_assign_clients: true, can_send_reminders: true, can_download_reports: true,
    can_delete_data: true, can_delete_tasks: true, can_connect_email: true, can_use_chat: true,
    can_create_quotations: true, can_view_passwords: true, can_edit_passwords: true,
    can_view_all_visits: true, can_edit_visits: true, can_delete_visits: true, can_delete_own_visits: true,
    view_password_departments: [], assigned_clients: [],
    view_other_tasks: [], view_other_attendance: [], view_other_reports: [],
    view_other_todos: [], view_other_activity: [], view_other_visits: [],
  },
  manager: {
    can_view_all_tasks: false, can_view_all_clients: false, can_view_all_dsc: false,
    can_view_documents: true, can_view_all_duedates: false, can_view_reports: true,
    can_view_attendance: true, can_view_all_leads: false, can_view_todo_dashboard: true,
    can_view_audit_logs: false, can_view_user_page: false, can_view_selected_users_reports: true,
    can_view_staff_rankings: true, can_view_staff_activity: true, can_view_own_data: true,
    can_edit_tasks: true, can_edit_clients: false, can_edit_dsc: false,
    can_edit_documents: false, can_edit_due_dates: true, can_edit_users: false,
    can_manage_users: false, can_manage_settings: false, can_assign_tasks: true,
    can_assign_clients: false, can_send_reminders: false, can_download_reports: true,
    can_delete_data: false, can_delete_tasks: false, can_connect_email: true, can_use_chat: true,
    can_create_quotations: false, can_view_passwords: true, can_edit_passwords: false,
    can_view_all_visits: false, can_edit_visits: true, can_delete_visits: false, can_delete_own_visits: true,
    view_password_departments: [], assigned_clients: [],
    view_other_tasks: [], view_other_attendance: [], view_other_reports: [],
    view_other_todos: [], view_other_activity: [], view_other_visits: [],
  },
  staff: {
    can_view_all_tasks: false, can_view_all_clients: false, can_view_all_dsc: false,
    can_view_documents: false, can_view_all_duedates: false, can_view_reports: true,
    can_view_attendance: true, can_view_all_leads: false, can_view_todo_dashboard: true,
    can_view_audit_logs: false, can_view_user_page: false, can_view_selected_users_reports: false,
    can_view_staff_rankings: true, can_view_staff_activity: false, can_view_own_data: true,
    can_edit_tasks: false, can_edit_clients: false, can_edit_dsc: false,
    can_edit_documents: false, can_edit_due_dates: false, can_edit_users: false,
    can_manage_users: false, can_manage_settings: false, can_assign_tasks: false,
    can_assign_clients: false, can_send_reminders: false, can_download_reports: true,
    can_delete_data: false, can_delete_tasks: false, can_connect_email: true, can_use_chat: true,
    can_create_quotations: false, can_view_passwords: false, can_edit_passwords: false,
    can_view_all_visits: false, can_edit_visits: false, can_delete_visits: false, can_delete_own_visits: true,
    view_password_departments: [], assigned_clients: [],
    view_other_tasks: [], view_other_attendance: [], view_other_reports: [],
    view_other_todos: [], view_other_activity: [], view_other_visits: [],
  },
};

const EMPTY_PERMS = Object.fromEntries(
  Object.entries(PERM_DEFAULTS.staff).map(([k, v]) =>
    [k, typeof v === 'boolean' ? false : []]
  )
);

// ── Permission section definitions ────────────────────────────────────────────
const PERM_SECTIONS = {
  view: {
    label: 'View Access', icon: Eye, color: '#3B82F6',
    perms: [
      { key: 'can_view_all_tasks',              label: 'All Tasks',          desc: 'See tasks assigned to any user',           icon: Layers       },
      { key: 'can_view_all_clients',            label: 'All Clients',        desc: 'View complete client master list',         icon: Briefcase    },
      { key: 'can_view_all_dsc',                label: 'DSC Vault',          desc: 'View all Digital Signature Certificates',  icon: Fingerprint  },
      { key: 'can_view_documents',              label: 'Document Register',  desc: 'Access physical document register',        icon: FileText     },
      { key: 'can_view_all_duedates',           label: 'All Due Dates',      desc: 'View all compliance due dates',            icon: Calendar     },
      { key: 'can_view_reports',                label: 'Reports',            desc: 'View performance & analytics reports',     icon: BarChart2    },
      { key: 'can_view_attendance',             label: 'Attendance',         desc: 'View team attendance records',             icon: Clock        },
      { key: 'can_view_all_leads',              label: 'Leads Pipeline',     desc: 'View the global leads dashboard',          icon: Target       },
      { key: 'can_view_todo_dashboard',         label: 'Todo Dashboard',     desc: 'Access global todo overview',              icon: CheckCircle  },
      { key: 'can_view_audit_logs',             label: 'Audit Logs',         desc: 'View system-wide activity trail',          icon: Activity     },
      { key: 'can_view_user_page',              label: 'User Directory',     desc: 'View the team members page',               icon: UsersIcon    },
      { key: 'can_view_selected_users_reports', label: 'Team Reports',       desc: 'View reports for selected users',          icon: Eye          },
      { key: 'can_view_staff_rankings',         label: 'Staff Rankings',     desc: 'View performance leaderboard',             icon: Star         },
      { key: 'can_view_staff_activity',         label: 'Staff Activity',     desc: 'View app usage & screen activity',         icon: Activity     },
      { key: 'can_view_all_visits',             label: 'All Visits',         desc: 'View client visits for all staff',         icon: Globe        },
      { key: 'can_view_own_data',               label: 'Own Data',           desc: 'Access own attendance, tasks, reports',    icon: UserIcon     },
    ],
  },
  edit: {
    label: 'Edit Access', icon: Pencil, color: '#F59E0B',
    perms: [
      { key: 'can_edit_tasks',     label: 'Edit Tasks',     desc: 'Modify and manage task definitions',  icon: Pencil      },
      { key: 'can_edit_clients',   label: 'Edit Clients',   desc: 'Update client master data records',   icon: Edit        },
      { key: 'can_edit_dsc',       label: 'Edit DSC',       desc: 'Update certificate details',          icon: Fingerprint },
      { key: 'can_edit_documents', label: 'Edit Documents', desc: 'Change document register records',    icon: FileText    },
      { key: 'can_edit_due_dates', label: 'Edit Due Dates', desc: 'Edit compliance timelines',           icon: Calendar    },
      { key: 'can_edit_users',     label: 'Edit Users',     desc: 'Update user profiles and settings',   icon: UserIcon    },
      { key: 'can_edit_visits',    label: 'Edit Visits',    desc: 'Create and update visit records',     icon: Globe       },
    ],
  },
  ops: {
    label: 'Operations', icon: Settings, color: '#8B5CF6',
    perms: [
      { key: 'can_manage_users',     label: 'Manage Users',     desc: 'Full user governance & approvals',    icon: UsersIcon    },
      { key: 'can_assign_tasks',     label: 'Assign Tasks',     desc: 'Delegate tasks to other staff',       icon: ArrowUpRight },
      { key: 'can_assign_clients',   label: 'Assign Clients',   desc: 'Assign staff to client portfolios',   icon: Briefcase    },
      { key: 'can_send_reminders',   label: 'Send Reminders',   desc: 'Trigger email & notification alerts', icon: Bell         },
      { key: 'can_download_reports', label: 'Download Reports', desc: 'Export CSV/PDF report files',         icon: Download     },
      { key: 'can_manage_settings',  label: 'System Settings',  desc: 'Modify global system configuration',  icon: Settings     },
      { key: 'can_delete_data',      label: 'Delete Records',   desc: 'Permanently delete data entries',     icon: Trash2       },
      { key: 'can_delete_tasks',     label: 'Delete Tasks',     desc: 'Delete any task regardless of owner', icon: XCircle      },
      { key: 'can_delete_visits',    label: 'Delete Visits',    desc: 'Delete any visit record',             icon: XCircle      },
      { key: 'can_connect_email',    label: 'Connect Email',    desc: 'Link email via IMAP integration',     icon: Inbox        },
      { key: 'can_use_chat',         label: 'Use Chat',         desc: 'Access in-app messaging',             icon: Mail         },
    ],
  },
  modules: {
    label: 'Modules', icon: Zap, color: BRAND.indigo,
    perms: [
      { key: 'can_view_all_leads',    label: 'Leads Module',      desc: 'View & manage leads pipeline',         icon: Target   },
      { key: 'can_create_quotations', label: 'Quotations Module', desc: 'Create, edit & share quotations',      icon: Receipt  },
      { key: 'can_view_passwords',    label: 'View Vault',        desc: 'See & reveal password vault entries',  icon: KeyRound },
      { key: 'can_edit_passwords',    label: 'Edit Vault',        desc: 'Add & manage portal credentials',      icon: Lock     },
    ],
  },
};

// ── Animation variants ───────────────────────────────────────────────────────
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp  = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const DeptPill = ({ dept }) => {
  const d = DEPARTMENTS.find(x => x.value === dept);
  if (!d) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black border"
      style={{ background: d.bg, color: d.color, borderColor: `${d.color}30` }}>
      {d.value}
    </span>
  );
};

const StatusDot = ({ status, isActive }) => {
  const s = status || (isActive !== false ? 'active' : 'inactive');
  const map = {
    active:           { label: 'Active',   cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-400 animate-pulse' },
    pending_approval: { label: 'Pending',  cls: 'bg-amber-50 text-amber-600 border-amber-200',       dot: 'bg-amber-400'   },
    rejected:         { label: 'Rejected', cls: 'bg-red-50 text-red-500 border-red-200',              dot: 'bg-red-400'     },
    inactive:         { label: 'Inactive', cls: 'bg-slate-50 text-slate-400 border-slate-200',        dot: 'bg-slate-300'   },
  };
  const c = map[s] || map.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
};

// ── Permission toggle (custom pill style) ─────────────────────────────────────
const PermToggle = ({ permKey, label, desc, icon: Icon, value, onChange }) => (
  <div onClick={() => onChange(!value)}
    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
      value
        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
    <div className="flex items-center gap-2.5 pr-3 min-w-0">
      {Icon && (
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
          value ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
          <Icon className="h-3 w-3" />
        </div>
      )}
      <div className="min-w-0">
        <p className={`text-xs font-bold truncate ${value ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
          {label}
        </p>
        <p className="text-[10px] text-slate-400 truncate leading-tight">{desc}</p>
      </div>
    </div>
    <div className={`w-8 h-5 rounded-full flex items-center px-0.5 flex-shrink-0 transition-all ${
      value ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-600'}`}>
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-3' : 'translate-x-0'}`} />
    </div>
  </div>
);

// ── Permission toggle row (Switch-based, from File 2) ─────────────────────────
const PermToggleRow = ({ permKey, label, desc, icon: Icon, permissions, setPermissions }) => {
  const isOn = !!permissions[permKey];
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 border ${
      isOn
        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
    }`}>
      <div className="flex items-center gap-3 pr-4 min-w-0">
        {Icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            isOn ? 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="min-w-0">
          <p className={`text-xs font-bold truncate ${isOn ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>{label}</p>
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">{desc}</p>
        </div>
      </div>
      <Switch
        checked={isOn}
        onCheckedChange={val => setPermissions(prev => ({ ...prev, [permKey]: val }))}
        className="flex-shrink-0"
      />
    </div>
  );
};

// ── Module access card (large clickable tile, from File 2) ────────────────────
const ModuleAccessCard = ({ icon: Icon, title, desc, permKey, permissions, setPermissions, accentColor, badge }) => {
  const isEnabled = !!permissions[permKey];
  const accent    = accentColor || BRAND.blue;
  return (
    <div
      onClick={() => setPermissions(p => ({ ...p, [permKey]: !p[permKey] }))}
      className={`relative flex items-center gap-4 p-4 rounded-3xl border-2 cursor-pointer transition-all duration-200 select-none group hover:shadow-md hover:scale-[1.01] ${
        isEnabled
          ? 'shadow-sm'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
      style={isEnabled ? { borderColor: `${accent}50`, background: `${accent}08` } : {}}
    >
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
        isEnabled ? 'text-white shadow-lg' : 'text-slate-400 bg-slate-100 dark:bg-slate-700'}`}
        style={isEnabled ? { background: `linear-gradient(135deg, ${accent}, ${accent}bb)` } : {}}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-bold ${isEnabled ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{title}</p>
          {badge && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold">{badge}</span>}
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{desc}</p>
      </div>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-xs transition-all duration-200 ${
        isEnabled ? 'text-white shadow' : 'bg-slate-100 dark:bg-slate-700 text-slate-300'}`}
        style={isEnabled ? { background: BRAND.green } : {}}>
        {isEnabled ? '✓' : '✗'}
      </div>
    </div>
  );
};

// ── Module access badges on card (from File 2) ────────────────────────────────
const ModuleAccessBadges = ({ userData }) => {
  if (userData.role === 'admin') return null;
  const hasLeads      = !!(userData.permissions?.can_view_all_leads);
  const hasQuotations = !!(userData.permissions?.can_create_quotations);
  const hasPasswords  = !!(userData.permissions?.can_view_passwords);
  const canEditPass   = !!(userData.permissions?.can_edit_passwords);

  const badges = [
    {
      label: 'Leads',
      active: hasLeads,
      activeStyle:   'bg-blue-100 text-blue-700',
      inactiveStyle: 'bg-slate-100 text-slate-400',
    },
    {
      label: 'Quotes',
      active: hasQuotations,
      activeStyle:   'bg-violet-100 text-violet-700',
      inactiveStyle: 'bg-slate-100 text-slate-400',
    },
    {
      label: !hasPasswords ? 'Vault' : canEditPass ? 'Vault R/W' : 'Vault R',
      active: hasPasswords,
      activeStyle:   canEditPass ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700',
      inactiveStyle: 'bg-slate-100 text-slate-400',
    },
  ];

  return (
    <div className="flex flex-wrap gap-1 mb-2.5">
      {badges.map(b => (
        <span key={b.label}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${b.active ? b.activeStyle : b.inactiveStyle}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
};

// ── Section header (from File 2) ──────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, count, color }) => (
  <div className="flex items-center gap-3 mb-3">
    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
      <Icon className="h-4 w-4" style={{ color }} />
    </div>
    <div>
      <p className="text-sm font-black text-slate-800 dark:text-slate-100">{title}</p>
    </div>
    {count !== undefined && (
      <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
        {count} perms
      </span>
    )}
  </div>
);

// ── Permission matrix summary ring ────────────────────────────────────────────
const PermRing = ({ perms }) => {
  const all     = Object.values(PERM_SECTIONS).flatMap(s => s.perms);
  const granted = all.filter(p => perms[p.key]).length;
  const pct     = Math.round((granted / all.length) * 100);
  const C       = 2 * Math.PI * 18;
  return (
    <div className="flex items-center gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="#e2e8f0" strokeWidth="4" />
          <circle cx="20" cy="20" r="18" fill="none" stroke={BRAND.green} strokeWidth="4"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-700 dark:text-slate-200">
          {pct}%
        </span>
      </div>
      <div>
        <p className="text-sm font-black text-slate-800 dark:text-slate-100">Permission Coverage</p>
        <p className="text-xs text-slate-400">{granted} of {all.length} permissions enabled</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {['can_view_all_tasks','can_manage_users','can_edit_clients','can_delete_data','can_view_passwords'].map(k => (
            <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
              perms[k] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              {k.replace('can_','').replace(/_/g,' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Pending user card (from File 2) ───────────────────────────────────────────
const PendingUserCard = ({ u, onApprove, onReject, approving }) => (
  <motion.div variants={fadeUp} layout
    className="relative bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-amber-200 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
    <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500" />
    <div className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm">
            {u.profile_picture
              ? <img src={u.profile_picture} alt={u.full_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-white text-lg font-black"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
                  {u.full_name?.charAt(0)?.toUpperCase()}
                </div>}
          </div>
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center">
            <Clock className="h-2 w-2 text-amber-600" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{u.full_name}</h3>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{u.email}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold capitalize">
              {u.role}
            </span>
            <StatusDot status={u.status} />
          </div>
        </div>
      </div>
      {(u.departments || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {u.departments.map(d => <DeptPill key={d} dept={d} />)}
        </div>
      )}
      <div className="space-y-1 text-[11px] text-slate-500 mb-3">
        <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{u.phone || '—'}</p>
        <p className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          Registered {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy') : 'N/A'}
        </p>
      </div>
      <div className="flex gap-2 pt-2.5 border-t border-amber-100">
        <Button size="sm" disabled={approving === u.id} onClick={() => onApprove(u)}
          className="flex-1 h-7 rounded-lg text-white text-xs gap-1 font-bold"
          style={{ background: BRAND.green }}>
          <UserCheck className="h-3 w-3" />{approving === u.id ? '…' : 'Approve'}
        </Button>
        <Button size="sm" disabled={approving === u.id} onClick={() => onReject(u)}
          variant="outline"
          className="flex-1 h-7 rounded-lg border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1 font-bold">
          <UserX className="h-3 w-3" />Reject
        </Button>
      </div>
    </div>
  </motion.div>
);

// ── User card ─────────────────────────────────────────────────────────────────
const UserCard = ({ u, onEdit, onDelete, onPerms, onApprove, onReject,
  meId, isAdmin, canEdit, canPerms, approving }) => {
  const [hover, setHover] = useState(false);
  const isPending = u.status === 'pending_approval';
  const rc        = ROLE_CFG[u.role?.toLowerCase()] || ROLE_CFG.staff;
  const RIcon     = rc.icon;
  const permCount = u.permissions
    ? Object.entries(u.permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length
    : 0;

  return (
    <motion.div variants={fadeUp} layout
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className={`relative bg-white dark:bg-slate-800/90 rounded-2xl overflow-hidden border transition-all duration-300 ${
        hover ? 'shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 -translate-y-0.5 border-slate-300 dark:border-slate-600'
              : isPending ? 'border-amber-300 shadow-md' : 'border-slate-200 dark:border-slate-700 shadow-sm'
      }`}>
      {/* Role stripe */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${rc.grad}`} />

      {/* Hover actions */}
      <AnimatePresence>
        {hover && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="absolute top-2.5 right-2.5 flex gap-1 z-10">
            {canPerms && u.role !== 'admin' && !isPending && (
              <button onClick={() => onPerms(u)} title="Permissions"
                className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center transition-all hover:scale-110">
                <Shield className="h-3 w-3" />
              </button>
            )}
            {(isAdmin || canEdit) && !isPending && (
              <button onClick={() => onEdit(u)} title="Edit"
                className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 flex items-center justify-center transition-all hover:scale-110">
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {(isAdmin || canEdit) && u.id !== meId && (
              <button onClick={() => onDelete(u.id)} title="Delete"
                className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 flex items-center justify-center transition-all hover:scale-110">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4">
        {/* Avatar + name */}
        <div className="flex items-start gap-3 mb-3">
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-xl overflow-hidden">
              {u.profile_picture
                ? <img src={u.profile_picture} alt={u.full_name} className="w-full h-full object-cover" />
                : <div className={`w-full h-full flex items-center justify-center text-white font-black bg-gradient-to-br ${rc.grad}`}>
                    {u.full_name?.charAt(0)?.toUpperCase()}
                  </div>}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-md bg-gradient-to-br ${rc.grad} flex items-center justify-center shadow`}>
              <RIcon className="h-2 w-2 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{u.full_name}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black text-white bg-gradient-to-r ${rc.grad}`}>
                <RIcon className="h-2 w-2" />{rc.label}
              </span>
              <StatusDot status={u.status} isActive={u.is_active} />
            </div>
          </div>
        </div>

        {/* Depts */}
        {(u.departments || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {u.departments.map(d => <DeptPill key={d} dept={d} />)}
          </div>
        )}

        {/* Module badges */}
        <ModuleAccessBadges userData={u} />

        {/* Contact */}
        <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 flex-shrink-0" />{u.email}</p>
          <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 flex-shrink-0" />{u.phone || '—'}</p>
          {(u.punch_in_time || u.punch_out_time) && (
            <p className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 flex-shrink-0" />
              {u.punch_in_time || '—'} → {u.punch_out_time || '—'}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            Joined {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy') : 'N/A'}
          </p>
        </div>

        {/* Perm count */}
        {u.role !== 'admin' && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Permissions</span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-2.5 w-2.5" />{permCount} active
            </span>
          </div>
        )}

        {/* Pending actions */}
        {isPending && isAdmin && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-amber-100">
            <Button size="sm" disabled={approving === u.id} onClick={() => onApprove(u)}
              className="flex-1 h-7 rounded-lg text-white text-xs gap-1 font-bold"
              style={{ background: BRAND.green }}>
              <UserCheck className="h-3 w-3" />{approving === u.id ? '…' : 'Approve'}
            </Button>
            <Button size="sm" disabled={approving === u.id} onClick={() => onReject(u)}
              variant="outline"
              className="flex-1 h-7 rounded-lg border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1 font-bold">
              <UserX className="h-3 w-3" />Reject
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color }) => (
  <motion.div variants={fadeUp}
    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
      <Icon className="h-5 w-5" style={{ color }} />
    </div>
    <div>
      <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">{value}</p>
      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{label}</p>
    </div>
  </motion.div>
);

// ── Permission tab definitions ─────────────────────────────────────────────────
const PERM_TABS = [
  { id: 'view',    label: 'View',       icon: Eye       },
  { id: 'edit',    label: 'Edit',       icon: Pencil    },
  { id: 'ops',     label: 'Operations', icon: Settings  },
  { id: 'modules', label: 'Modules',    icon: Zap       },
  { id: 'cross',   label: 'Cross-User', icon: UsersIcon },
  { id: 'clients', label: 'Portfolio',  icon: Briefcase },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Users() {
  const { user: me, refreshUser } = useAuth();
  const isDark = useDark();

  // ── Derived auth flags ──────────────────────────────────────────────────
  const isAdmin  = me?.role === 'admin';
  const perms    = me?.permissions || {};
  const canView  = isAdmin || !!perms.can_view_user_page;
  const canEdit  = isAdmin || !!perms.can_manage_users;
  const canPerms = isAdmin; // only admins can manage permissions

  // ── State ───────────────────────────────────────────────────────────────
  const [users,     setUsers]     = useState([]);
  const [clients,   setClients]   = useState([]);
  const [q,         setQ]         = useState('');
  const [tab,       setTab]       = useState('all');
  const [loading,   setLoading]   = useState(false);
  const [approving, setApproving] = useState(null);
  const [clientQ,   setClientQ]   = useState('');

  // Edit dialog
  const [editOpen,    setEditOpen]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [roleChanged, setRoleChanged] = useState(false);
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'staff',
    departments: [], phone: '', birthday: '', profile_picture: '',
    punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
    telegram_id: '', is_active: true, status: 'active',
  });

  // Permissions dialog
  const [permOpen,   setPermOpen]   = useState(false);
  const [permTarget, setPermTarget] = useState(null);
  const [permTab,    setPermTab]    = useState('view');
  const [editPerms,  setEditPerms]  = useState({ ...EMPTY_PERMS });

  // ── Data fetching ────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    try {
      const r = await api.get('/users');
      const d = r.data;
      setUsers(Array.isArray(d) ? d : (d?.data || []));
    } catch { toast.error('Failed to fetch users'); }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const r = await api.get('/clients');
      const d = r.data;
      setClients(Array.isArray(d) ? d : (d?.data || []));
    } catch {}
  }, []);

  useEffect(() => {
    if (canView) { loadUsers(); loadClients(); }
  }, [canView, loadUsers, loadClients]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const setP = (k) => (v) => setEditPerms(p => ({ ...p, [k]: v }));

  const toggleArr = (k, id) => setEditPerms(p => ({
    ...p,
    [k]: (p[k] || []).includes(id) ? (p[k] || []).filter(x => x !== id) : [...(p[k] || []), id],
  }));

  // ── Edit handlers ────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditTarget(u || null);
    setRoleChanged(false);
    if (u) {
      setForm({
        full_name:       u.full_name       || '',
        email:           u.email           || '',
        password:        '',
        role:            u.role            || 'staff',
        departments:     u.departments     || [],
        phone:           u.phone           || '',
        birthday:        u.birthday ? format(new Date(u.birthday), 'yyyy-MM-dd') : '',
        profile_picture: u.profile_picture || '',
        punch_in_time:   u.punch_in_time   || '10:30',
        grace_time:      u.grace_time      || '00:10',
        punch_out_time:  u.punch_out_time  || '19:00',
        telegram_id:     u.telegram_id != null ? String(u.telegram_id) : '',
        is_active:       u.is_active !== false,
        status:          u.status || 'active',
      });
    } else {
      setForm({
        full_name: '', email: '', password: '', role: 'staff',
        departments: [], phone: '', birthday: '', profile_picture: '',
        punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
        telegram_id: '', is_active: true, status: 'active',
      });
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Full name required'); return; }
    if (!editTarget && !form.email.trim()) { toast.error('Email required'); return; }
    setLoading(true);
    try {
      if (editTarget) {
        const payload = {
          full_name:       form.full_name.trim(),
          phone:           form.phone || null,
          birthday:        form.birthday || null,
          profile_picture: form.profile_picture || null,
          punch_in_time:   form.punch_in_time || null,
          grace_time:      form.grace_time || null,
          punch_out_time:  form.punch_out_time || null,
          telegram_id:     form.telegram_id !== '' ? Number(form.telegram_id) : null,
          is_active:       form.is_active,
          ...(isAdmin && {
            email:       form.email.trim(),
            role:        form.role,
            status:      form.status,
            departments: form.departments,
          }),
          ...(isAdmin && form.password.trim() && { password: form.password.trim() }),
        };
        await api.put(`/users/${editTarget.id}`, payload);
        if (editTarget.id === me.id) await refreshUser();
        toast.success('User updated');
      } else {
        await api.post('/auth/register', {
          full_name:      form.full_name.trim(),
          email:          form.email.trim(),
          password:       form.password,
          role:           form.role,
          departments:    form.departments,
          phone:          form.phone || null,
          birthday:       form.birthday || null,
          punch_in_time:  form.punch_in_time,
          grace_time:     form.grace_time,
          punch_out_time: form.punch_out_time,
          telegram_id:    form.telegram_id !== '' ? Number(form.telegram_id) : null,
          is_active:      false,
          status:         'pending_approval',
        });
        toast.success('Member registered — pending approval');
      }
      setEditOpen(false);
      loadUsers();
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Save failed');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (id === me.id) { toast.error('Cannot delete your own account'); return; }
    if (!window.confirm('Permanently delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  // ── Permissions handlers ──────────────────────────────────────────────────
  const openPerms = async (u) => {
    setPermTarget(u);
    setPermTab('view');
    try {
      const r = await api.get(`/users/${u.id}/permissions`);
      setEditPerms({ ...EMPTY_PERMS, ...(r.data || {}) });
    } catch {
      setEditPerms({ ...EMPTY_PERMS });
    }
    setPermOpen(true);
  };

  const savePerms = async () => {
    if (!canPerms) { toast.error('Admins only'); return; }
    setLoading(true);
    try {
      const ensureArr = v => Array.isArray(v) ? v : [];
      const payload = {
        ...editPerms,
        view_password_departments: ensureArr(editPerms.view_password_departments),
        assigned_clients:          ensureArr(editPerms.assigned_clients),
        view_other_tasks:          ensureArr(editPerms.view_other_tasks),
        view_other_attendance:     ensureArr(editPerms.view_other_attendance),
        view_other_reports:        ensureArr(editPerms.view_other_reports),
        view_other_todos:          ensureArr(editPerms.view_other_todos),
        view_other_activity:       ensureArr(editPerms.view_other_activity),
        view_other_visits:         ensureArr(editPerms.view_other_visits),
      };
      await api.put(`/users/${permTarget.id}/permissions`, payload);
      if (permTarget.id === me.id) await refreshUser();
      toast.success('Permissions saved');
      setPermOpen(false);
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setLoading(false); }
  };

  const resetPermsToRole = (role) => {
    setEditPerms({ ...(PERM_DEFAULTS[role] || EMPTY_PERMS) });
    toast.info(`Reset to ${role} defaults`);
  };

  // ── Approval ───────────────────────────────────────────────────────────────
  const handleApprove = async (u) => {
    setApproving(u.id);
    try {
      await api.post(`/users/${u.id}/approve`);
      toast.success(`${u.full_name} approved`);
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Approval failed'); }
    finally { setApproving(null); }
  };

  const handleReject = async (u) => {
    if (!window.confirm(`Reject ${u.full_name}?`)) return;
    setApproving(u.id);
    try {
      await api.post(`/users/${u.id}/reject`);
      toast.success(`${u.full_name} rejected`);
      loadUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Rejection failed'); }
    finally { setApproving(null); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const pending  = users.filter(u => u.status === 'pending_approval');
  const rejected = users.filter(u => u.status === 'rejected');

  const filtered = users.filter(u => {
    const match = (u.full_name || '').toLowerCase().includes(q.toLowerCase()) ||
                  (u.email || '').toLowerCase().includes(q.toLowerCase());
    if (tab === 'pending')  return match && u.status === 'pending_approval';
    if (tab === 'rejected') return match && u.status === 'rejected';
    if (tab === 'all')      return match;
    return match && u.role?.toLowerCase() === tab;
  });

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!canView) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-xs p-8">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <ShieldOff className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-400">You need the <b className="text-slate-600 dark:text-slate-300">View User Directory</b> permission.</p>
      </motion.div>
    </div>
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <motion.div className="space-y-6 p-4 md:p-7 min-h-screen" initial="hidden" animate="visible" variants={stagger}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md" style={{ background: GRAD_BLUE }}>
            <UsersIcon className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white" style={{ color: BRAND.deepBlue }}>
              User Directory
            </h1>
            <p className="text-[11px] text-slate-400">Team administration &amp; access control</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => openEdit(null)}
            className="rounded-xl h-9 px-5 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all"
            style={{ background: GRAD_BLUE }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Member
          </Button>
        )}
      </motion.div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <motion.div variants={stagger} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total"   value={users.length}                                icon={UsersIcon}   color={BRAND.blue}  />
        <StatCard label="Admins"  value={users.filter(u => u.role === 'admin').length} icon={Crown}       color={BRAND.indigo}/>
        <StatCard label="Pending" value={pending.length}                               icon={Clock}       color="#D97706"     />
        <StatCard label="Active"  value={users.filter(u => u.is_active).length}        icon={CheckCircle} color={BRAND.green} />
      </motion.div>

      {/* ── Pending banner ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {isAdmin && pending.length > 0 && tab !== 'pending' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
            <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex-1">
              {pending.length} registration{pending.length > 1 ? 's' : ''} awaiting approval
            </p>
            <Button size="sm" onClick={() => setTab('pending')}
              className="rounded-xl h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs">
              Review <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + Tabs ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search name or email…" value={q} onChange={e => setQ(e.target.value)}
            className="pl-9 h-9 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
        </div>
        <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-xl flex-wrap">
          {['all','admin','manager','staff'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                tab === t ? 'text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              style={tab === t ? { background: GRAD_BLUE } : {}}>
              {t === 'all' ? 'All' : `${t}s`}
            </button>
          ))}
          {isAdmin && (
            <button onClick={() => setTab('pending')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                tab === 'pending' ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              style={tab === 'pending' ? { background: 'linear-gradient(135deg,#f59e0b,#f97316)' } : {}}>
              <Clock className="h-3 w-3" />Pending
              {pending.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                  {pending.length}
                </span>
              )}
            </button>
          )}
          {isAdmin && rejected.length > 0 && (
            <button onClick={() => setTab('rejected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                tab === 'rejected' ? 'bg-red-500 text-white' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <XCircle className="h-3 w-3" />Rejected
            </button>
          )}
        </div>
      </div>

      {/* ── Pending grid (dedicated, from File 2) ───────────────────────── */}
      {tab === 'pending' && isAdmin && (
        filtered.length === 0
          ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-emerald-400" />
              </div>
              <p className="text-slate-400 font-semibold">No pending approvals</p>
              <p className="text-sm text-slate-300 mt-1">All registrations have been processed.</p>
            </motion.div>
          : <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(u => (
                <PendingUserCard key={u.id} u={u} onApprove={handleApprove} onReject={handleReject} approving={approving} />
              ))}
            </motion.div>
      )}

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      {tab !== 'pending' && (
        <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-slate-400 font-semibold">No members found</p>
            </div>
          ) : filtered.map(u => (
            <UserCard key={u.id} u={u}
              onEdit={openEdit} onDelete={handleDelete}
              onPerms={openPerms} onApprove={handleApprove} onReject={handleReject}
              meId={me?.id} isAdmin={isAdmin} canEdit={canEdit} canPerms={canPerms}
              approving={approving} />
          ))}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          EDIT / CREATE DIALOG
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl p-0 border-none shadow-2xl">
          <div className="sticky top-0 z-10">
            <div className="h-1 w-full rounded-t-2xl" style={{ background: GRAD_BLUE }} />
            <div className="p-5 bg-white dark:bg-slate-900 border-b dark:border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-lg font-black" style={{ color: BRAND.deepBlue }}>
                  {editTarget ? `Edit — ${editTarget.full_name}` : 'Register New Member'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {isAdmin ? 'Administrator view — all fields editable.' : 'Update your profile details.'}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="p-5 space-y-5 bg-white dark:bg-slate-900">
            {/* Avatar */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  {form.profile_picture
                    ? <img src={form.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    : <UserIcon className="h-10 w-10 text-slate-300" />}
                </div>
                <label htmlFor="pic-upload"
                  className="absolute -bottom-1.5 -right-1.5 bg-white dark:bg-slate-700 rounded-xl p-1.5 shadow-lg border border-slate-200 cursor-pointer hover:scale-110 transition-transform">
                  <Camera className="h-3.5 w-3.5 text-blue-600" />
                  <input id="pic-upload" type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const f = e.target.files[0]; if (!f) return;
                      const r = new FileReader();
                      r.onloadend = () => setForm(p => ({ ...p, profile_picture: r.result }));
                      r.readAsDataURL(f);
                    }} />
                </label>
              </div>
            </div>

            {/* Name + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Full Name *</Label>
                <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="e.g. Manthan Desai" className="mt-1 h-9 rounded-xl text-sm" />
              </div>
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="name@firm.com" disabled={!isAdmin || editTarget?.id === me?.id}
                  className="mt-1 h-9 rounded-xl text-sm" />
              </div>
            </div>

            {/* Phone + Password */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 00000 00000" className="mt-1 h-9 rounded-xl text-sm" />
              </div>
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                  {editTarget ? 'New Password' : 'Password *'}
                </Label>
                <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder={editTarget ? 'Leave blank to keep' : 'Set password'}
                  className="mt-1 h-9 rounded-xl text-sm" />
              </div>
            </div>

            {/* Shift schedule */}
            <div className="p-4 bg-blue-50/60 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="h-3 w-3" />Shift Schedule
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[['Punch In','punch_in_time'],['Grace (HH:MM)','grace_time'],['Punch Out','punch_out_time']].map(([l,k]) => (
                  <div key={k}>
                    <Label className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">{l}</Label>
                    <Input type="time" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                      className="mt-1 h-9 rounded-xl text-sm bg-white dark:bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>

            {/* Birthday + Telegram */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Birthday</Label>
                <Input type="date" value={form.birthday} onChange={e => setForm(p => ({ ...p, birthday: e.target.value }))}
                  className="mt-1 h-9 rounded-xl text-sm" />
              </div>
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Telegram ID</Label>
                <Input type="number" value={form.telegram_id} onChange={e => setForm(p => ({ ...p, telegram_id: e.target.value }))}
                  placeholder="Numeric ID" className="mt-1 h-9 rounded-xl text-sm" />
              </div>
            </div>

            {/* Admin: role + status */}
            {isAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Role</Label>
                  <Select value={form.role} onValueChange={v => {
                    if (editTarget && v !== form.role) setRoleChanged(true);
                    setForm(p => ({ ...p, role: v }));
                  }}>
                    <SelectTrigger className="mt-1 h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {roleChanged && editTarget && (
                    <div className="mt-2 flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl">
                      <p className="text-[11px] text-amber-700 flex-1">Reset permissions to <b className="capitalize">{form.role}</b> defaults?</p>
                      <button type="button" onClick={async () => {
                        try {
                          await api.put(`/users/${editTarget.id}/permissions`, PERM_DEFAULTS[form.role] || EMPTY_PERMS);
                          toast.success('Permissions reset');
                          setRoleChanged(false);
                        } catch { toast.error('Reset failed'); }
                      }} className="text-[10px] font-black px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg">
                        Reset
                      </button>
                      <button type="button" onClick={() => setRoleChanged(false)} className="text-[10px] text-amber-500 font-bold">Keep</button>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v, is_active: v === 'active' }))}>
                    <SelectTrigger className="mt-1 h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Admin: departments */}
            {isAdmin && (
              <div>
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-2 block">Departments</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.map(d => {
                    const on = form.departments.includes(d.value);
                    return (
                      <button key={d.value} type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          departments: on ? p.departments.filter(x => x !== d.value) : [...p.departments, d.value],
                        }))}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black border-2 transition-all ${
                          on ? 'text-white border-transparent shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-600'
                        }`}
                        style={{ background: on ? d.color : undefined }}>
                        {d.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/90 border-t dark:border-slate-700 flex justify-end gap-2.5 rounded-b-2xl">
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-xl h-9 px-4 text-sm">Discard</Button>
            <Button onClick={handleSave} disabled={loading}
              className="rounded-xl h-9 px-6 font-bold text-white text-sm shadow-md hover:shadow-lg transition-all"
              style={{ background: GRAD_GREEN }}>
              {loading ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          PERMISSIONS DIALOG
          Admin-only. Full permission matrix with tabs.
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-0 border-none shadow-2xl">
          <div className="sticky top-0 z-10">
            <div className="h-1 w-full rounded-t-2xl" style={{ background: GRAD_BLUE }} />
            <div className="p-5 bg-white dark:bg-slate-900 border-b dark:border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-lg font-black" style={{ color: BRAND.deepBlue }}>
                  Permissions — {permTarget?.full_name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Configure module access and operational permissions. Admin users bypass all checks automatically.
                </DialogDescription>
              </DialogHeader>

              {/* User strip + role reset */}
              <div className="flex items-center gap-3 mt-4">
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  {permTarget?.profile_picture
                    ? <img src={permTarget.profile_picture} className="w-full h-full object-cover" />
                    : <div className={`w-full h-full flex items-center justify-center text-white font-black bg-gradient-to-br ${ROLE_CFG[permTarget?.role]?.grad || 'from-slate-400 to-slate-500'}`}>
                        {permTarget?.full_name?.charAt(0)?.toUpperCase()}
                      </div>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">{permTarget?.full_name}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{permTarget?.role} · Access Governance</p>
                </div>
                <div className="flex gap-1.5">
                  {['staff','manager','admin'].map(r => (
                    <button key={r} type="button" onClick={() => resetPermsToRole(r)}
                      className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold border transition-all hover:scale-105 ${
                        permTarget?.role === r
                          ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-800'
                          : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-600 hover:border-slate-400'
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 px-3">
              {PERM_TABS.map(t => {
                const TIcon = t.icon;
                return (
                  <button key={t.id} onClick={() => setPermTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                      permTab === t.id
                        ? 'border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-500'
                        : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}>
                    <TIcon className="h-3 w-3" />{t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 space-y-4">

            {/* ── Summary ring (always visible) ──────────────────────── */}
            <PermRing perms={editPerms} />

            {/* ── View / Edit / Ops tabs (PermToggle pill style) ─────── */}
            {['view','edit','ops'].includes(permTab) && (() => {
              const sec = PERM_SECTIONS[permTab];
              return (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${sec.color}15` }}>
                      <sec.icon className="h-3.5 w-3.5" style={{ color: sec.color }} />
                    </div>
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">{sec.label}</p>
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${sec.color}15`, color: sec.color }}>
                      {sec.perms.filter(p => editPerms[p.key]).length}/{sec.perms.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {sec.perms.map(p => (
                      <PermToggle key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                        value={!!editPerms[p.key]} onChange={v => setP(p.key)(v)} />
                    ))}
                  </div>
                </motion.div>
              );
            })()}

            {/* ── Modules tab (ModuleAccessCard tiles) ───────────────── */}
            {permTab === 'modules' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <SectionHeader icon={Zap} title="Specialised Module Access" color={BRAND.indigo} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ModuleAccessCard icon={Target} title="Lead Management"
                    desc="View and manage the global leads pipeline end-to-end."
                    permKey="can_view_all_leads" permissions={editPerms} setPermissions={setEditPerms}
                    accentColor={BRAND.blue} />
                  <ModuleAccessCard icon={Receipt} title="Quotations"
                    desc="Create, edit, export and share quotations."
                    permKey="can_create_quotations" permissions={editPerms} setPermissions={setEditPerms}
                    accentColor={BRAND.violet} badge="Module" />
                  <ModuleAccessCard icon={KeyRound} title="View Password Vault"
                    desc="See and reveal masked credentials for permitted departments."
                    permKey="can_view_passwords" permissions={editPerms} setPermissions={setEditPerms}
                    accentColor={BRAND.teal} />
                  <ModuleAccessCard icon={Lock} title="Edit Password Vault"
                    desc="Add, update and manage portal credentials. Requires View."
                    permKey="can_edit_passwords" permissions={editPerms} setPermissions={setEditPerms}
                    accentColor={BRAND.amber} />
                </div>

                {/* Vault state feedback */}
                {editPerms.can_edit_passwords && !editPerms.can_view_passwords && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    "Edit Vault" also requires "View Vault" — it will be auto-enabled on save.
                  </div>
                )}
                {editPerms.can_view_passwords && editPerms.can_edit_passwords && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 rounded-xl text-xs text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    Full password vault access — user can reveal and manage credentials.
                  </div>
                )}

                {/* Vault dept access */}
                {editPerms.can_view_passwords && (
                  <div className="p-4 rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-900/10">
                    <p className="text-xs font-black text-teal-700 dark:text-teal-400 mb-1 flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3" />Vault — Department Access
                    </p>
                    <p className="text-[10px] text-slate-400 mb-3">Select extra departments beyond the user's own.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEPARTMENTS.map(d => {
                        const sel = (editPerms.view_password_departments || []).includes(d.value);
                        return (
                          <button key={d.value} type="button"
                            onClick={() => toggleArr('view_password_departments', d.value)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border-2 transition-all ${
                              sel ? 'text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200'
                            }`}
                            style={{ background: sel ? d.color : undefined }}>
                            {sel ? '✓ ' : ''}{d.value}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {(editPerms.view_password_departments || []).length === 0
                        ? 'Own departments only'
                        : `Own + ${(editPerms.view_password_departments || []).join(', ')}`}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Cross-user visibility ──────────────────────────────── */}
            {permTab === 'cross' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <SectionHeader icon={UsersIcon} title="Cross-User Data Visibility" color={BRAND.green} />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select which team members' data this user can see across modules.
                </p>
                {[
                  { key: 'view_other_tasks',      label: 'Tasks',      color: '#3B82F6' },
                  { key: 'view_other_attendance', label: 'Attendance', color: '#8B5CF6' },
                  { key: 'view_other_reports',    label: 'Reports',    color: '#F59E0B' },
                  { key: 'view_other_todos',      label: 'Todos',      color: '#10B981' },
                  { key: 'view_other_activity',   label: 'Activity',   color: '#EF4444' },
                  { key: 'view_other_visits',     label: 'Visits',     color: '#6366F1' },
                ].map(sec => (
                  <div key={sec.key} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{sec.label} Visibility</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${sec.color}15`, color: sec.color }}>
                        {(editPerms[sec.key] || []).length} selected
                      </span>
                    </div>
                    <div className="p-3 flex flex-wrap gap-1.5">
                      {users.filter(u => u.id !== permTarget?.id).map(u => {
                        const sel = (editPerms[sec.key] || []).includes(u.id);
                        return (
                          <button key={u.id} type="button" onClick={() => toggleArr(sec.key, u.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                              sel ? 'text-white border-transparent shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-600'
                            }`}
                            style={sel ? { background: sec.color } : {}}>
                            {sel ? '✓ ' : ''}{u.full_name}
                          </button>
                        );
                      })}
                      {users.length <= 1 && <p className="text-xs text-slate-400 italic">No other users</p>}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* ── Client portfolio ───────────────────────────────────── */}
            {permTab === 'clients' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={Briefcase} title="Assigned Client Portfolio" color={BRAND.teal} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold">
                      {(editPerms.assigned_clients || []).length} assigned
                    </span>
                    {(editPerms.assigned_clients || []).length > 0 && (
                      <button type="button" onClick={() => setEditPerms(p => ({ ...p, assigned_clients: [] }))}
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Search clients…" value={clientQ} onChange={e => setClientQ(e.target.value)}
                    className="pl-9 h-9 rounded-xl text-sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                  {clients
                    .filter(c => c.company_name.toLowerCase().includes(clientQ.toLowerCase()))
                    .map(c => {
                      const sel = (editPerms.assigned_clients || []).includes(c.id);
                      return (
                        <button key={c.id} type="button"
                          onClick={() => toggleArr('assigned_clients', c.id)}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all ${
                            sel
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200'
                          }`}>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                            sel ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                            {sel ? <CheckCircle className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                          </div>
                          <span className={`text-xs font-bold truncate ${sel ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                            {c.company_name}
                          </span>
                        </button>
                      );
                    })}
                  {clients.filter(c => c.company_name.toLowerCase().includes(clientQ.toLowerCase())).length === 0 && (
                    <p className="col-span-2 text-center text-xs text-slate-400 py-6">No clients match.</p>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          <DialogFooter className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700 flex items-center justify-between gap-3 rounded-b-2xl">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <SlidersHorizontal className="h-3 w-3" />
              {Object.entries(editPerms).filter(([k, v]) => k.startsWith('can_') && v === true).length} active permissions
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => resetPermsToRole(permTarget?.role)}
                className="rounded-xl h-9 px-3 text-xs font-bold">
                Reset Defaults
              </Button>
              <Button variant="ghost" onClick={() => setPermOpen(false)} className="rounded-xl h-9 px-4 text-xs">Discard</Button>
              <Button onClick={savePerms} disabled={loading}
                className="rounded-xl h-9 px-6 font-bold text-white text-xs shadow-md hover:shadow-lg transition-all"
                style={{ background: GRAD_GREEN }}>
                {loading ? 'Saving…' : 'Save Permissions'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
