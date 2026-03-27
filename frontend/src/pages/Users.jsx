
import React, { useState, useEffect } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye,
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase,
  Mail, Phone, Calendar, Camera, Clock, UserCheck, UserX,
  AlertCircle, KeyRound, Receipt, Target, Zap, Lock, ChevronRight,
  Activity, BarChart2, Star, Layers, Globe, FileText, Bell,
  ToggleLeft, Hash, ArrowUpRight, SlidersHorizontal, ShieldCheck,
  ShieldOff, Fingerprint, Database, Download, Pencil, Inbox,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ── Brand palette ────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  indigo:       '#4F46E5',
  violet:       '#7C3AED',
  teal:         '#0F766E',
  amber:        '#B45309',
  slate:        '#475569',
};

const GRADIENT  = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;
const GRAD_GREEN = `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`;

// ── Departments ───────────────────────────────────────────────────────────────
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

// ── Default permissions ───────────────────────────────────────────────────────
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
    can_connect_email: true, can_view_own_data: true,
    can_create_quotations: true,
    can_view_passwords: true, can_edit_passwords: true,
    view_password_departments: [],
    assigned_clients: [], view_other_tasks: [], view_other_attendance: [],
    view_other_reports: [], view_other_todos: [], view_other_activity: [],
  },
  manager: {
    can_view_all_tasks: false, can_view_all_clients: false, can_view_all_dsc: false,
    can_view_documents: true, can_view_all_duedates: false, can_view_reports: false,
    can_manage_users: false, can_assign_tasks: true, can_view_staff_activity: true,
    can_view_attendance: true, can_send_reminders: false, can_view_user_page: false,
    can_view_audit_logs: false, can_edit_tasks: true, can_edit_dsc: false,
    can_edit_documents: false, can_edit_due_dates: true, can_edit_users: false,
    can_download_reports: true, can_view_selected_users_reports: true,
    can_view_todo_dashboard: true, can_edit_clients: false, can_use_chat: true,
    can_view_all_leads: false, can_manage_settings: false, can_assign_clients: false,
    can_view_staff_rankings: true, can_delete_data: false, can_delete_tasks: false,
    can_connect_email: true, can_view_own_data: true,
    can_create_quotations: false,
    can_view_passwords: true, can_edit_passwords: false,
    view_password_departments: [],
    assigned_clients: [], view_other_tasks: [], view_other_attendance: [],
    view_other_reports: [], view_other_todos: [], view_other_activity: [],
  },
  staff: {
    can_view_all_tasks: false, can_view_all_clients: false, can_view_all_dsc: false,
    can_view_documents: false, can_view_all_duedates: false, can_view_reports: false,
    can_manage_users: false, can_assign_tasks: false, can_view_staff_activity: false,
    can_view_attendance: false, can_send_reminders: false, can_view_user_page: false,
    can_view_audit_logs: false, can_edit_tasks: false, can_edit_dsc: false,
    can_edit_documents: false, can_edit_due_dates: false, can_edit_users: false,
    can_download_reports: false, can_view_selected_users_reports: false,
    can_view_todo_dashboard: true, can_edit_clients: false, can_use_chat: true,
    can_view_all_leads: false, can_manage_settings: false, can_assign_clients: false,
    can_view_staff_rankings: true, can_delete_data: false, can_delete_tasks: false,
    can_connect_email: true, can_view_own_data: true,
    can_create_quotations: false,
    can_view_passwords: false, can_edit_passwords: false,
    view_password_departments: [],
    assigned_clients: [], view_other_tasks: [], view_other_attendance: [],
    view_other_reports: [], view_other_todos: [], view_other_activity: [],
  },
};

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
  can_connect_email: false, can_view_own_data: false,
  can_create_quotations: false,
  can_view_passwords: false, can_edit_passwords: false,
  view_password_departments: [],
  assigned_clients: [], view_other_tasks: [], view_other_attendance: [],
  view_other_reports: [], view_other_todos: [], view_other_activity: [],
};

// ── Animation variants ───────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
};
const slideIn = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin:   { gradient: 'from-violet-600 to-indigo-600',  textColor: 'text-white', icon: Crown,     label: 'Admin'   },
  manager: { gradient: 'from-blue-500 to-cyan-500',      textColor: 'text-white', icon: Briefcase, label: 'Manager' },
  staff:   { gradient: 'from-slate-400 to-slate-500',    textColor: 'text-white', icon: UserIcon,  label: 'Staff'   },
};

// ── Dept pill ─────────────────────────────────────────────────────────────────
const DeptPill = ({ dept, size = 'sm' }) => {
  const info = DEPARTMENTS.find(d => d.value === dept);
  if (!info) return null;
  return (
    <span
      className={`inline-flex items-center font-bold rounded-lg ${size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-xs'}`}
      style={{ background: info.bg, color: info.color, border: `1.5px solid ${info.color}25` }}>
      {info.label}
    </span>
  );
};

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status, isActive }) => {
  const resolved = status || (isActive !== false ? 'active' : 'inactive');
  const map = {
    active:           { label: 'Active',   cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500' },
    pending_approval: { label: 'Pending',  cls: 'bg-amber-50 text-amber-600 border-amber-200',       dot: 'bg-amber-500'   },
    rejected:         { label: 'Rejected', cls: 'bg-red-50 text-red-600 border-red-200',              dot: 'bg-red-500'     },
    inactive:         { label: 'Inactive', cls: 'bg-slate-50 text-slate-500 border-slate-200',        dot: 'bg-slate-400'   },
  };
  const cfg = map[resolved] || map.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${resolved === 'active' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
};

// ── Module access badges on card ─────────────────────────────────────────────
const ModuleAccessBadges = ({ userData }) => {
  if (userData.role === 'admin') return null;
  const hasLeads      = !!(userData.permissions?.can_view_all_leads);
  const hasQuotations = !!(userData.permissions?.can_create_quotations);
  const hasPasswords  = !!(userData.permissions?.can_view_passwords);
  const canEditPass   = !!(userData.permissions?.can_edit_passwords);

  const badges = [
    {
      show: true, label: 'Leads',
      active: hasLeads,
      activeStyle:   'bg-blue-50 text-blue-700 border-blue-200',
      inactiveStyle: 'bg-slate-50 text-slate-400 border-slate-200',
      icon: Target,
    },
    {
      show: true, label: 'Quotes',
      active: hasQuotations,
      activeStyle:   'bg-violet-50 text-violet-700 border-violet-200',
      inactiveStyle: 'bg-slate-50 text-slate-400 border-slate-200',
      icon: Receipt,
    },
    {
      show: true,
      label: !hasPasswords ? 'Vault' : canEditPass ? 'Vault R/W' : 'Vault R',
      active: hasPasswords,
      activeStyle:   canEditPass ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-teal-50 text-teal-700 border-teal-200',
      inactiveStyle: 'bg-slate-50 text-slate-400 border-slate-200',
      icon: KeyRound,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {badges.map(b => {
        const Icon = b.icon;
        return (
          <span key={b.label}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${b.active ? b.activeStyle : b.inactiveStyle}`}>
            <Icon className="h-2.5 w-2.5" />{b.label}
          </span>
        );
      })}
    </div>
  );
};

// ── Pending user card ─────────────────────────────────────────────────────────
const PendingUserCard = ({ userData, onApprove, onReject, approving }) => (
  <motion.div variants={itemVariants} layout
    className="relative bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-amber-200 shadow-md hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300">
    {/* Top stripe */}
    <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500" />
    <div className="p-5">
      <div className="flex items-start gap-4 mb-4">
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-sm">
            {userData.profile_picture
              ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-white text-xl font-black"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
                  {userData.full_name?.charAt(0)?.toUpperCase()}
                </div>}
          </div>
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center">
            <Clock className="h-2.5 w-2.5 text-amber-600" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">{userData.full_name}</h3>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{userData.email}</p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold capitalize">
              {userData.role}
            </span>
            <StatusBadge status={userData.status} />
          </div>
        </div>
      </div>
      {(userData.departments || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {userData.departments.map(d => <DeptPill key={d} dept={d} />)}
        </div>
      )}
      <div className="space-y-1.5 text-[11px] text-slate-500 mb-4">
        <p className="flex items-center gap-2"><Phone className="h-3 w-3" />{userData.phone || '—'}</p>
        <p className="flex items-center gap-2"><Calendar className="h-3 w-3" />
          Registered {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}
        </p>
      </div>
      <div className="flex gap-2 pt-3 border-t border-amber-100">
        <Button size="sm" disabled={approving === userData.id} onClick={() => onApprove(userData)}
          className="flex-1 h-8 rounded-2xl text-white font-bold text-xs gap-1.5 shadow-sm hover:shadow-md transition-all"
          style={{ background: COLORS.emeraldGreen }}>
          <UserCheck className="h-3.5 w-3.5" />
          {approving === userData.id ? 'Processing…' : 'Approve'}
        </Button>
        <Button size="sm" disabled={approving === userData.id} onClick={() => onReject(userData)}
          variant="outline"
          className="flex-1 h-8 rounded-2xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs gap-1.5 shadow-sm hover:shadow-md transition-all">
          <UserX className="h-3.5 w-3.5" />Reject
        </Button>
      </div>
    </div>
  </motion.div>
);

// ── Main user card ────────────────────────────────────────────────────────────
const UserCard = ({ userData, onEdit, onDelete, onPermissions, onApprove, onReject,
  currentUserId, isAdmin, canEditUsers, canManagePermissions, approving }) => {
  const [hovered, setHovered] = useState(false);
  const isPending = userData.status === 'pending_approval';
  const roleCfg   = ROLE_CONFIG[userData.role?.toLowerCase()] || ROLE_CONFIG.staff;
  const RoleIcon  = roleCfg.icon;

  // count granted permissions
  const permCount = userData.permissions
    ? Object.entries(userData.permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length
    : 0;

  return (
    <motion.div variants={itemVariants} layout
      className={`group relative bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border transition-all duration-300 ${
        isPending
          ? 'border-amber-300 shadow-amber-100/50 shadow-md'
          : hovered
          ? 'border-blue-200 shadow-xl shadow-blue-100/30 -translate-y-1 scale-[1.01]'
          : 'border-slate-200 dark:border-slate-700 shadow-md hover:shadow-xl'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Role accent bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${roleCfg.gradient}`} />

      {/* Action buttons overlay */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-3 right-3 flex gap-1.5 z-10">
            {canManagePermissions && userData.role !== 'admin' && !isPending && (
              <button onClick={() => onPermissions(userData)}
                className="w-8 h-8 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-200 transition-all hover:shadow-md hover:scale-110"
                title="Manage Permissions">
                <Shield className="h-3.5 w-3.5" />
              </button>
            )}
            {(isAdmin || (canEditUsers && !isPending)) && (
              <button onClick={() => onEdit(userData)}
                className="w-8 h-8 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm border border-blue-200 transition-all hover:shadow-md hover:scale-110"
                title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {(isAdmin || canEditUsers) && userData.id !== currentUserId && (
              <button onClick={() => onDelete(userData.id)}
                className="w-8 h-8 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center shadow-sm border border-red-200 transition-all hover:shadow-md hover:scale-110"
                title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-5">
        {/* Avatar + name */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className="relative flex-shrink-0">
            <div className="w-[52px] h-[52px] rounded-2xl overflow-hidden shadow-sm">
              {userData.profile_picture
                ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
                : <div className={`w-full h-full flex items-center justify-center text-white text-xl font-black bg-gradient-to-br ${roleCfg.gradient}`}>
                    {userData.full_name?.charAt(0)?.toUpperCase()}
                  </div>}
            </div>
            {/* Role icon badge */}
            <div className={`absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-lg bg-gradient-to-br ${roleCfg.gradient} flex items-center justify-center shadow-md`}>
              <RoleIcon className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">{userData.full_name}</h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-gradient-to-r ${roleCfg.gradient}`}>
                <RoleIcon className="h-2.5 w-2.5" />{roleCfg.label}
              </span>
              <StatusBadge status={userData.status} isActive={userData.is_active} />
            </div>
          </div>
        </div>

        {/* Departments */}
        {(userData.departments || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {userData.departments.map(d => <DeptPill key={d} dept={d} />)}
          </div>
        )}

        {/* Module access (non-admin) */}
        <ModuleAccessBadges userData={userData} />

        {/* Contact info */}
        <div className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <p className="flex items-center gap-2 truncate">
            <Mail className="h-3 w-3 flex-shrink-0 text-slate-400" />
            <span className="truncate">{userData.email}</span>
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-3 w-3 flex-shrink-0 text-slate-400" />{userData.phone || '—'}
          </p>
          {(userData.punch_in_time || userData.punch_out_time) && (
            <p className="flex items-center gap-2">
              <Clock className="h-3 w-3 flex-shrink-0 text-slate-400" />
              <span>{userData.punch_in_time || '—'} → {userData.punch_out_time || '—'}</span>
            </p>
          )}
          <p className="flex items-center gap-2">
            <Calendar className="h-3 w-3 flex-shrink-0 text-slate-400" />
            Joined {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}
          </p>
        </div>

        {/* Permission count pill (non-admin) */}
        {userData.role !== 'admin' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">Permissions granted</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
              <ShieldCheck className="h-2.5 w-2.5" />{permCount}
            </span>
          </div>
        )}

        {/* Pending approve/reject */}
        {isPending && isAdmin && (
          <div className="flex gap-2 mt-4 pt-3 border-t border-amber-100">
            <Button size="sm" disabled={approving === userData.id} onClick={() => onApprove(userData)}
              className="flex-1 h-8 rounded-2xl text-white font-bold text-xs gap-1 shadow hover:shadow-md transition-all"
              style={{ background: COLORS.emeraldGreen }}>
              <UserCheck className="h-3.5 w-3.5" />
              {approving === userData.id ? 'Processing…' : 'Approve'}
            </Button>
            <Button size="sm" disabled={approving === userData.id} onClick={() => onReject(userData)}
              variant="outline"
              className="flex-1 h-8 rounded-2xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs gap-1 shadow-sm hover:shadow-md transition-all">
              <UserX className="h-3.5 w-3.5" />Reject
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Permission toggle row ─────────────────────────────────────────────────────
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

// ── Module access card (large clickable tile) ─────────────────────────────────
const ModuleAccessCard = ({ icon: Icon, title, desc, permKey, permissions, setPermissions, accentColor, badge }) => {
  const isEnabled = !!permissions[permKey];
  const accent    = accentColor || COLORS.mediumBlue;
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
        style={isEnabled ? { background: COLORS.emeraldGreen } : {}}>
        {isEnabled ? '✓' : '✗'}
      </div>
    </div>
  );
};

// ── Permission section header ─────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// PERMISSION SECTION DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════
const GLOBAL_PERMS = [
  { key: 'can_view_all_tasks',              label: 'Universal Task Access',    desc: 'See tasks assigned to any user or department',    icon: Layers       },
  { key: 'can_view_all_clients',            label: 'Master Client List',       desc: 'View all company legal entities',                 icon: Briefcase    },
  { key: 'can_view_all_dsc',                label: 'DSC Vault Access',         desc: 'View all Digital Signature Certificates',         icon: Fingerprint  },
  { key: 'can_view_documents',              label: 'Document Library',         desc: 'Access physical document register',               icon: FileText     },
  { key: 'can_view_all_duedates',           label: 'Compliance Roadmap',       desc: 'View all upcoming statutory due dates',           icon: Calendar     },
  { key: 'can_view_reports',                label: 'Analytics Dashboard',      desc: 'View performance and system-wide reports',        icon: BarChart2    },
  { key: 'can_view_todo_dashboard',         label: 'Todo Dashboard',           desc: 'Access global team todo overview',                icon: CheckCircle  },
  { key: 'can_view_audit_logs',             label: 'System Audit Trail',       desc: 'View activity logs and record histories',         icon: Activity     },
  { key: 'can_view_all_leads',              label: 'Leads Pipeline',           desc: 'View the global leads dashboard',                 icon: Target       },
  { key: 'can_view_user_page',              label: 'User Directory',           desc: 'View team members directory',                     icon: UsersIcon    },
  { key: 'can_view_selected_users_reports', label: 'Team Reports Access',      desc: 'View reports for selected users',                 icon: Eye          },
  { key: 'can_view_staff_rankings',         label: 'Staff Rankings',           desc: 'View performance leaderboard',                   icon: Star         },
  { key: 'can_view_own_data',               label: 'View Own Data',            desc: 'Access own attendance, tasks and reports',        icon: UserIcon     },
  { key: 'can_create_quotations',           label: 'Quotations Module',        desc: 'Create, edit, export and share quotations',       icon: Receipt      },
];

const OPS_PERMS = [
  { key: 'can_assign_tasks',        label: 'Task Delegation',        desc: 'Assign tasks to other staff members',         icon: ArrowUpRight },
  { key: 'can_assign_clients',      label: 'Client Assignment',      desc: 'Assign and reassign staff to clients',         icon: Briefcase    },
  { key: 'can_manage_users',        label: 'User Governance',        desc: 'Manage team members and roles',               icon: UsersIcon    },
  { key: 'can_view_attendance',     label: 'Attendance Management',  desc: 'Review punch timings and late reports',        icon: Clock        },
  { key: 'can_view_staff_activity', label: 'Staff Monitoring',       desc: 'View app usage and screen activity',          icon: Activity     },
  { key: 'can_send_reminders',      label: 'Automated Reminders',    desc: 'Trigger email/notification reminders',        icon: Bell         },
  { key: 'can_download_reports',    label: 'Export Data',            desc: 'Download CSV/PDF versions of reports',        icon: Download     },
  { key: 'can_manage_settings',     label: 'System Settings',        desc: 'Modify global system configuration',          icon: Settings     },
  { key: 'can_delete_data',         label: 'Delete Records',         desc: 'Permanently delete data entries',             icon: Trash2       },
  { key: 'can_delete_tasks',        label: 'Delete Tasks',           desc: 'Delete any task regardless of ownership',     icon: XCircle      },
  { key: 'can_connect_email',       label: 'Connect Email Accounts', desc: 'Link personal email via IMAP integration',   icon: Inbox        },
];

const EDIT_PERMS = [
  { key: 'can_edit_tasks',     label: 'Modify Tasks',     desc: 'Update and delete task definitions',         icon: Pencil      },
  { key: 'can_edit_clients',   label: 'Modify Clients',   desc: 'Update client master data records',          icon: Edit        },
  { key: 'can_edit_dsc',       label: 'Modify DSC',       desc: 'Update certificate details and metadata',    icon: Fingerprint },
  { key: 'can_edit_documents', label: 'Modify Documents', desc: 'Change document records',                    icon: FileText    },
  { key: 'can_edit_due_dates', label: 'Modify Due Dates', desc: 'Edit statutory compliance timelines',         icon: Calendar    },
  { key: 'can_edit_users',     label: 'Modify Users',     desc: 'Update user profiles and settings',          icon: UserIcon    },
];

// ── Compact permission matrix row for the permission dialog summary ───────────
const PermissionMatrixSummary = ({ permissions }) => {
  const allPerms = [...GLOBAL_PERMS, ...OPS_PERMS, ...EDIT_PERMS];
  const granted  = allPerms.filter(p => permissions[p.key]).length;
  const total    = allPerms.length;
  const pct      = Math.round((granted / total) * 100);

  return (
    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-3xl border border-slate-200 dark:border-slate-600 shadow-sm">
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="5" />
          <circle cx="24" cy="24" r="20" fill="none" stroke={COLORS.emeraldGreen} strokeWidth="5"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
            strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-700 dark:text-slate-200">{pct}%</span>
      </div>
      <div>
        <p className="text-sm font-black text-slate-800 dark:text-slate-100">Permission Coverage</p>
        <p className="text-xs text-slate-500 mt-0.5">{granted} of {total} permissions enabled</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {['can_view_all_tasks','can_manage_users','can_edit_clients','can_delete_data','can_view_passwords'].map(k => (
            <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
              permissions[k] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              {k.replace('can_','').replace(/_/g,' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Permission tab definitions ─────────────────────────────────────────────────
const permTabs = [
  { id: 'modules', label: 'Modules',    icon: Zap       },
  { id: 'view',    label: 'View',       icon: Eye       },
  { id: 'ops',     label: 'Operations', icon: Settings  },
  { id: 'edit',    label: 'Edit',       icon: Pencil    },
  { id: 'cross',   label: 'Cross-User', icon: UsersIcon },
  { id: 'clients', label: 'Portfolio',  icon: Briefcase },
];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Users() {
  const { user, refreshUser } = useAuth();
  const isDark               = useDark();
  const isAdmin              = user?.role === 'admin';
  const perms                = user?.permissions || {};
  const canViewUserPage      = isAdmin || !!perms.can_view_user_page;
  const canEditUsers         = isAdmin || !!perms.can_manage_users;
  const canManagePermissions = isAdmin;

  const [users,   setUsers]   = useState([]);
  const [clients, setClients] = useState([]);
  const [searchQuery,          setSearchQuery]          = useState('');
  const [activeTab,            setActiveTab]            = useState('all');
  const [dialogOpen,           setDialogOpen]           = useState(false);
  const [permDialogOpen,       setPermDialogOpen]       = useState(false);
  const [selectedUser,         setSelectedUser]         = useState(null);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);
  const [approvingId,          setApprovingId]          = useState(null);
  const [loading,              setLoading]              = useState(false);
  const [clientSearch,         setClientSearch]         = useState('');
  const [roleChanged,          setRoleChanged]          = useState(false);
  const [activePermTab,        setActivePermTab]        = useState('modules');

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

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      const raw = res.data;
      setUsers(Array.isArray(raw) ? raw : (raw?.data || []));
    } catch { toast.error('Failed to fetch users'); }
  };

  const fetchClients = async () => {
    try {
      const res = await api.get('/clients');
      const raw = res.data;
      setClients(Array.isArray(raw) ? raw : (raw?.data || []));
    } catch {}
  };

  const fetchPermissions = async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/permissions`);
      setPermissions({ ...EMPTY_PERMISSIONS, ...(res.data || {}) });
    } catch {
      toast.error('Using default permission template');
      setPermissions({ ...EMPTY_PERMISSIONS });
    }
  };

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, [name]: value }));
  };

  const handleRoleChange = (newRole) => {
    if (selectedUser && newRole !== formData.role) setRoleChanged(true);
    setFormData(p => ({ ...p, role: newRole }));
  };

  const toggleDept = (dept) => {
    setFormData(p => ({
      ...p,
      departments: p.departments.includes(dept)
        ? p.departments.filter(d => d !== dept)
        : [...p.departments, dept],
    }));
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData(p => ({ ...p, profile_picture: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleEdit = (userData) => {
    setSelectedUser(userData);
    setRoleChanged(false);
    setFormData({
      full_name:       userData.full_name       || '',
      email:           userData.email           || '',
      password:        '',
      role:            userData.role            || 'staff',
      departments:     userData.departments     || [],
      phone:           userData.phone           || '',
      birthday:        userData.birthday && userData.birthday !== ''
        ? format(new Date(userData.birthday), 'yyyy-MM-dd') : '',
      profile_picture: userData.profile_picture || '',
      punch_in_time:   userData.punch_in_time   || '10:30',
      grace_time:      userData.grace_time      || '00:10',
      punch_out_time:  userData.punch_out_time  || '19:00',
      telegram_id:     userData.telegram_id != null ? String(userData.telegram_id) : '',
      is_active:       userData.is_active !== false,
      status:          userData.status || 'active',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!selectedUser && !formData.email.trim()) { toast.error('Email is required'); return; }
    setLoading(true);
    try {
      if (selectedUser) {
        const payload = {
          full_name:       formData.full_name.trim(),
          phone:           formData.phone           || null,
          birthday:        formData.birthday        || null,
          profile_picture: formData.profile_picture || null,
          punch_in_time:   formData.punch_in_time   || null,
          grace_time:      formData.grace_time      || null,
          punch_out_time:  formData.punch_out_time  || null,
          telegram_id:     formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active:       formData.is_active,
          ...(isAdmin && {
            email:       formData.email.trim(),
            role:        formData.role,
            status:      formData.status,
            departments: formData.departments,
          }),
          ...(isAdmin && formData.password.trim() && { password: formData.password.trim() }),
        };
        await api.put(`/users/${selectedUser.id}`, payload);
        if (selectedUser.id === user.id) await refreshUser();
        toast.success('✓ User updated successfully');
      } else {
        await api.post('/auth/register', {
          full_name:      formData.full_name.trim(),
          email:          formData.email.trim(),
          password:       formData.password,
          role:           formData.role,
          departments:    formData.departments,
          phone:          formData.phone || null,
          birthday:       formData.birthday || null,
          punch_in_time:  formData.punch_in_time,
          grace_time:     formData.grace_time,
          punch_out_time: formData.punch_out_time,
          telegram_id:    formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active:      false,
          status:         'pending_approval',
        });
        toast.success('✓ Member registered — awaiting approval');
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save user');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!isAdmin && !canEditUsers) { toast.error('No permission to delete users'); return; }
    if (id === user.id) { toast.error('You cannot delete your own account'); return; }
    if (!window.confirm('Permanently delete this user and all their data?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User removed');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete user'); }
  };

  const openPermissionsDialog = async (userData) => {
    setSelectedUserForPerms(userData);
    setActivePermTab('modules');
    await fetchPermissions(userData.id);
    setPermDialogOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!canManagePermissions) { toast.error('Only administrators can update permissions'); return; }
    setLoading(true);
    try {
      const ensureArray = (v) => (Array.isArray(v) ? v : []);
      const payload = {
        ...permissions,
        view_password_departments: ensureArray(permissions.view_password_departments),
        assigned_clients:          ensureArray(permissions.assigned_clients),
        view_other_tasks:          ensureArray(permissions.view_other_tasks),
        view_other_attendance:     ensureArray(permissions.view_other_attendance),
        view_other_reports:        ensureArray(permissions.view_other_reports),
        view_other_todos:          ensureArray(permissions.view_other_todos),
        view_other_activity:       ensureArray(permissions.view_other_activity),
      };
      await api.put(`/users/${selectedUserForPerms.id}/permissions`, payload);
      if (selectedUserForPerms.id === user.id) await refreshUser();
      toast.success('✓ Permissions saved');
      setPermDialogOpen(false);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update permissions'); }
    finally { setLoading(false); }
  };

  const resetPermissionsToRole = (role) => {
    setPermissions({ ...(DEFAULT_ROLE_PERMISSIONS[role] || EMPTY_PERMISSIONS) });
    toast.info(`Reset to ${role} defaults — click Save to apply`);
  };

  const handleApprove = async (userData) => {
    if (!isAdmin) { toast.error('Only admins can approve users'); return; }
    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/approve`);
      toast.success(`✓ ${userData.full_name} approved`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to approve'); }
    finally { setApprovingId(null); }
  };

  const handleReject = async (userData) => {
    if (!isAdmin) { toast.error('Only admins can reject users'); return; }
    if (!window.confirm(`Reject ${userData.full_name}?`)) return;
    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/reject`);
      toast.success(`${userData.full_name} rejected`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to reject'); }
    finally { setApprovingId(null); }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const pendingUsers  = users.filter(u => u.status === 'pending_approval');
  const rejectedUsers = users.filter(u => u.status === 'rejected');

  const filteredUsers = users.filter(u => {
    const q     = searchQuery.toLowerCase();
    const match = (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    if (activeTab === 'pending')  return match && u.status === 'pending_approval';
    if (activeTab === 'rejected') return match && u.status === 'rejected';
    if (activeTab === 'all')      return match;
    return match && u.role?.toLowerCase() === activeTab;
  });

  // Stats
  const stats = [
    { label: 'Total Members', value: users.length,                              icon: UsersIcon,   color: COLORS.mediumBlue  },
    { label: 'Admins',        value: users.filter(u => u.role === 'admin').length, icon: Crown,    color: COLORS.indigo      },
    { label: 'Pending',       value: pendingUsers.length,                        icon: Clock,      color: '#D97706'          },
    { label: 'Active',        value: users.filter(u => u.is_active).length,      icon: CheckCircle,color: COLORS.emeraldGreen},
  ];

  if (!canViewUserPage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-red-100">
            <ShieldOff className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            You need the <span className="font-bold text-slate-700 dark:text-slate-300">View User Directory</span> permission to access this page.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className={`space-y-8 p-4 md:p-8 min-h-screen ${isDark ? 'bg-[#0b1120]' : 'bg-slate-50/50'}`}
      initial="hidden" animate="visible" variants={containerVariants}>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <motion.div variants={slideIn} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: GRADIENT }}>
              <UsersIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight dark:text-white" style={{ color: COLORS.deepBlue }}>
                User Directory
              </h1>
              <p className="text-xs text-slate-400 font-medium">Team administration &amp; access control</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button
            className="rounded-2xl font-bold h-11 px-6 shadow-lg hover:shadow-xl transition-all hover:scale-105 text-white"
            style={{ background: GRADIENT }}
            onClick={() => {
              setSelectedUser(null); setRoleChanged(false);
              setFormData({
                full_name: '', email: '', password: '', role: 'staff',
                departments: [], phone: '', birthday: '', profile_picture: '',
                punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
                telegram_id: '', is_active: true, status: 'active',
              });
              setDialogOpen(true);
            }}>
            <Plus className="h-4 w-4 mr-2" />Create Member
          </Button>
        )}
      </motion.div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <motion.div variants={containerVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} variants={itemVariants}
              className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3 shadow-md hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${s.color}15` }}>
                <Icon className="h-5 w-5" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">{s.value}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{s.label}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Edit / Create Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">

          {/* Dialog header with gradient */}
          <div className="sticky top-0 z-10 rounded-t-3xl overflow-hidden">
            <div className="h-1.5 w-full" style={{ background: GRADIENT }} />
            <div className="p-6 bg-white dark:bg-slate-900 border-b dark:border-slate-700">
              <DialogTitle className="text-xl font-black" style={{ color: COLORS.deepBlue }}>
                {selectedUser ? `Edit Profile — ${selectedUser.full_name}` : 'Register New Member'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-1">
                {isAdmin ? 'Administrator view — all fields editable.' : 'Update your profile details below.'}
              </DialogDescription>
            </div>
          </div>

          <div className="p-6 space-y-8 bg-white dark:bg-slate-900">
            {/* Profile picture */}
            <div className="flex justify-center">
              <div className="relative group">
                <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shadow-sm">
                  {formData.profile_picture
                    ? <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    : <UserIcon className="h-12 w-12 text-slate-300" />}
                </div>
                <label htmlFor="profile-upload"
                  className="absolute -bottom-2 -right-2 bg-white dark:bg-slate-700 rounded-2xl p-2 shadow-xl border border-slate-200 dark:border-slate-600 cursor-pointer hover:scale-110 transition-transform">
                  <Camera className="h-4 w-4 text-blue-600" />
                  <input id="profile-upload" type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>
              </div>
            </div>

            {/* Name + Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Full Name *</Label>
                <Input name="full_name" value={formData.full_name} onChange={handleInput}
                  placeholder="e.g. Manthan Desai" className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Email {!isAdmin && <span className="text-slate-400 font-normal normal-case">(read only)</span>}
                </Label>
                <Input type="email" name="email" value={formData.email} onChange={handleInput}
                  placeholder="name@firm.com" className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  disabled={!isAdmin || (selectedUser && selectedUser.id === user.id)} />
              </div>
            </div>

            {/* Phone + Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Phone</Label>
                <Input name="phone" value={formData.phone} onChange={handleInput}
                  placeholder="+91 00000 00000" className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                  {selectedUser ? 'New Password' : 'Initial Password *'}
                </Label>
                <Input type="password" name="password" value={formData.password} onChange={handleInput}
                  placeholder={selectedUser ? 'Leave blank to keep unchanged' : 'Set initial password'}
                  className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
            </div>

            {/* Shift schedule */}
            <div className="rounded-3xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-blue-500" />
                <h3 className="text-xs font-black text-blue-700 dark:text-blue-400 uppercase tracking-wider">Shift Schedule</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Punch-In Time',       name: 'punch_in_time'  },
                  { label: 'Grace Period (HH:MM)', name: 'grace_time'    },
                  { label: 'Punch-Out Time',       name: 'punch_out_time' },
                ].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{f.label}</Label>
                    <Input type="time" name={f.name} value={formData[f.name]} onChange={handleInput}
                      className="rounded-2xl h-10 bg-white dark:bg-slate-800 border-blue-200 dark:border-slate-600" />
                  </div>
                ))}
              </div>
            </div>

            {/* Birthday + Telegram */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Birthday</Label>
                <Input type="date" name="birthday" value={formData.birthday} onChange={handleInput}
                  className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Telegram ID</Label>
                <Input type="number" name="telegram_id" value={formData.telegram_id} onChange={handleInput}
                  placeholder="Numeric Telegram ID" className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
            </div>

            {/* Admin: role + status */}
            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Role</Label>
                  <Select value={formData.role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {roleChanged && selectedUser && (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl mt-2">
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold flex-1">
                        Role → <b className="capitalize">{formData.role}</b>. Reset permissions?
                      </span>
                      <button type="button"
                        onClick={async () => {
                          const defaults = DEFAULT_ROLE_PERMISSIONS[formData.role] || EMPTY_PERMISSIONS;
                          try {
                            await api.put(`/users/${selectedUser.id}/permissions`, defaults);
                            toast.success(`Permissions reset to ${formData.role} defaults`);
                            setRoleChanged(false);
                          } catch { toast.error('Failed to reset permissions'); }
                        }}
                        className="text-[11px] font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl whitespace-nowrap shadow-sm hover:shadow-md transition-all">
                        Reset
                      </button>
                      <button type="button" onClick={() => setRoleChanged(false)}
                        className="text-[11px] text-amber-500 hover:text-amber-700 font-semibold">Keep</button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Account Status</Label>
                  <Select value={formData.status}
                    onValueChange={v => setFormData(p => ({ ...p, status: v, is_active: v === 'active' }))}>
                    <SelectTrigger className="rounded-2xl h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
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
              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Assigned Departments</Label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {DEPARTMENTS.map(dept => {
                    const active = formData.departments.includes(dept.value);
                    return (
                      <button key={dept.value} type="button" onClick={() => toggleDept(dept.value)}
                        className={`py-2 px-1 rounded-2xl text-xs font-black transition-all border-2 shadow-sm hover:shadow-md ${
                          active
                            ? 'text-white border-transparent shadow-md scale-105'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700 hover:border-slate-300'
                        }`}
                        style={{ background: active ? dept.color : undefined }}>
                        {dept.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t dark:border-slate-700 flex justify-end gap-3 rounded-b-3xl">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-2xl h-11 px-6 shadow-sm hover:shadow-md transition-all">Discard</Button>
            <Button onClick={handleSubmit} disabled={loading}
              className="rounded-2xl h-11 px-8 font-bold shadow-lg hover:shadow-xl text-white hover:opacity-90 transition-all"
              style={{ background: GRAD_GREEN }}>
              {loading ? 'Saving…' : selectedUser ? 'Save Changes' : 'Create Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Pending approval banner ──────────────────────────────────────── */}
      <AnimatePresence>
        {isAdmin && pendingUsers.length > 0 && activeTab !== 'pending' && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-3xl shadow-md">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-800/50 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                {pendingUsers.length} registration{pendingUsers.length > 1 ? 's' : ''} awaiting approval
              </p>
              <p className="text-xs text-amber-500 mt-0.5">These users cannot log in until approved.</p>
            </div>
            <Button size="sm" onClick={() => setActiveTab('pending')}
              className="rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs h-8 shadow-sm hover:shadow-md transition-all">
              Review Now <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + Tabs ────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name or email…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="pl-11 h-11 rounded-2xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm" />
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-2xl shadow-sm flex flex-wrap gap-0.5 self-start">
          {['all', 'admin', 'manager', 'staff'].map(t => (
            <button key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold capitalize transition-all shadow-sm hover:shadow-md ${
                activeTab === t
                  ? 'text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
              style={activeTab === t ? { background: GRADIENT } : {}}>
              {t === 'all' ? 'All' : `${t}s`}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('pending')}
              className={`relative px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                activeTab === 'pending' ? 'text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
              style={activeTab === 'pending' ? { background: 'linear-gradient(135deg,#f59e0b,#f97316)' } : {}}>
              <Clock className="h-3 w-3" />Pending
              {pendingUsers.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-black px-1">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          )}
          {isAdmin && rejectedUsers.length > 0 && (
            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                activeTab === 'rejected' ? 'bg-red-500 text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}>
              <XCircle className="h-3 w-3" />Rejected
            </button>
          )}
        </div>
      </div>

      {/* ── Pending grid ─────────────────────────────────────────────────── */}
      {activeTab === 'pending' && isAdmin && (
        filteredUsers.length === 0
          ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-24 text-center">
              <div className="w-20 h-20 rounded-3xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-400">No pending approvals</h3>
              <p className="text-sm text-slate-300 mt-1">All registrations have been processed.</p>
            </motion.div>
          : <motion.div variants={containerVariants} initial="hidden" animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredUsers.map(u => (
                <PendingUserCard key={u.id} userData={u} onApprove={handleApprove} onReject={handleReject} approving={approvingId} />
              ))}
            </motion.div>
      )}

      {/* ── Main user grid ───────────────────────────────────────────────── */}
      {activeTab !== 'pending' && (
        <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredUsers.length === 0
            ? <div className="col-span-full py-24 text-center">
                <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <UsersIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-400 dark:text-slate-500">No members found</h3>
                <p className="text-sm text-slate-300 dark:text-slate-600 mt-1">Try adjusting your search or filter.</p>
              </div>
            : filteredUsers.map(u => (
                <UserCard key={u.id} userData={u}
                  onEdit={handleEdit} onDelete={handleDelete}
                  onPermissions={openPermissionsDialog}
                  onApprove={handleApprove} onReject={handleReject}
                  currentUserId={user?.id} isAdmin={isAdmin}
                  canEditUsers={canEditUsers} canManagePermissions={canManagePermissions}
                  approving={approvingId} />
              ))}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PERMISSIONS DIALOG — Fixed + Premium UI
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">

          {/* ✅ Fixed: DialogTitle + DialogDescription inside DialogHeader to prevent aria error */}
          <div className="sticky top-0 z-10 rounded-t-3xl overflow-hidden">
            <div className="h-1.5 w-full" style={{ background: GRADIENT }} />
            <div className="p-6 bg-white dark:bg-slate-900 border-b dark:border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-xl font-black" style={{ color: COLORS.deepBlue }}>
                  {selectedUserForPerms?.full_name} — Permissions
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-1">
                  Configure module access and operational permissions for this user.
                </DialogDescription>
              </DialogHeader>

              {/* User identity strip */}
              <div className="flex items-center gap-4 mt-4">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-md">
                    {selectedUserForPerms?.profile_picture
                      ? <img src={selectedUserForPerms.profile_picture} alt="" className="w-full h-full object-cover" />
                      : <div className={`w-full h-full flex items-center justify-center text-white text-xl font-black bg-gradient-to-br ${
                          ROLE_CONFIG[selectedUserForPerms?.role]?.gradient || 'from-slate-400 to-slate-500'}`}>
                          {selectedUserForPerms?.full_name?.charAt(0)?.toUpperCase()}
                        </div>}
                  </div>
                  <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg">
                    <Shield className="h-3 w-3 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                    {selectedUserForPerms?.full_name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">{selectedUserForPerms?.role} · Access Governance</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {/* quick role reset buttons */}
                    {['staff', 'manager', 'admin'].map(r => (
                      <button key={r} type="button"
                        onClick={() => resetPermissionsToRole(r)}
                        className={`text-[9px] px-2 py-1 rounded-lg font-bold border transition-all hover:scale-105 shadow-sm hover:shadow-md ${
                          selectedUserForPerms?.role === r
                            ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-800'
                            : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-600 hover:border-slate-400'
                        }`}>
                        {r} defaults
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="flex gap-0 overflow-x-auto bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 px-4">
              {permTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id}
                    onClick={() => setActivePermTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                      activePermTab === tab.id
                        ? 'border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-400'
                        : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}>
                    <Icon className="h-3.5 w-3.5" />{tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="p-6 bg-white dark:bg-slate-900 space-y-8">

            {/* ── MODULES TAB ────────────────────────────────────────────── */}
            {activePermTab === 'modules' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <PermissionMatrixSummary permissions={permissions} />

                <div>
                  <SectionHeader icon={Zap} title="Specialised Module Access" color={COLORS.indigo}
                    desc="Grant access to standalone product modules" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ModuleAccessCard icon={Target} title="Lead Management"
                      desc="View and manage the global leads pipeline end-to-end."
                      permKey="can_view_all_leads" permissions={permissions} setPermissions={setPermissions}
                      accentColor={COLORS.mediumBlue} />
                    <ModuleAccessCard icon={Receipt} title="Quotations"
                      desc="Create, edit, export and WhatsApp-share quotations."
                      permKey="can_create_quotations" permissions={permissions} setPermissions={setPermissions}
                      accentColor={COLORS.violet} badge="Module" />
                    <ModuleAccessCard icon={KeyRound} title="View Password Vault"
                      desc="See and reveal masked credentials for permitted departments."
                      permKey="can_view_passwords" permissions={permissions} setPermissions={setPermissions}
                      accentColor={COLORS.teal} />
                    <ModuleAccessCard icon={Lock} title="Edit Password Vault"
                      desc="Add, update and manage portal credentials. Requires View."
                      permKey="can_edit_passwords" permissions={permissions} setPermissions={setPermissions}
                      accentColor={COLORS.amber} />
                  </div>

                  {/* Vault state feedback */}
                  {permissions.can_edit_passwords && !permissions.can_view_passwords && (
                    <div className="flex items-center gap-2 mt-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 font-medium shadow-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Edit vault requires View vault to also be enabled.
                    </div>
                  )}
                  {permissions.can_view_passwords && permissions.can_edit_passwords && (
                    <div className="flex items-center gap-2 mt-3 px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 font-medium shadow-sm">
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      Full password vault access — user can reveal and manage credentials.
                    </div>
                  )}
                </div>

                {/* Password dept access — shown inline in modules tab if vault enabled */}
                {permissions.can_view_passwords && (
                  <div className="rounded-3xl border-2 border-teal-200 dark:border-teal-800 p-5 bg-teal-50/40 dark:bg-teal-900/10 shadow-sm">
                    <SectionHeader icon={KeyRound} title="Password Vault — Department Access" color={COLORS.teal} />
                    <p className="text-[11px] text-slate-500 mb-3">
                      Select departments whose credentials this user can access. They always see their own dept(s) without this list.
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {DEPARTMENTS.map(dept => {
                        const isSelected = (permissions.view_password_departments || []).includes(dept.value);
                        return (
                          <button key={dept.value} type="button"
                            onClick={() => setPermissions(prev => ({
                              ...prev,
                              view_password_departments: isSelected
                                ? (prev.view_password_departments || []).filter(d => d !== dept.value)
                                : [...(prev.view_password_departments || []), dept.value],
                            }))}
                            className={`py-2.5 px-2 rounded-2xl text-xs font-bold transition-all border-2 shadow-sm hover:shadow-md ${
                              isSelected ? 'text-white border-transparent shadow-md' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-300'
                            }`}
                            style={{ background: isSelected ? dept.color : undefined }}>
                            {isSelected ? '✓ ' : ''}{dept.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-3 font-medium">
                      Current: {(permissions.view_password_departments || []).length === 0
                        ? 'Own departments only'
                        : `Own depts + ${(permissions.view_password_departments || []).join(', ')}`}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── VIEW PERMISSIONS TAB ────────────────────────────────────── */}
            {activePermTab === 'view' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <SectionHeader icon={Eye} title="Global Visibility Permissions" color="#3B82F6"
                  count={GLOBAL_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">
                  {GLOBAL_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── OPERATIONS TAB ──────────────────────────────────────────── */}
            {activePermTab === 'ops' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <SectionHeader icon={Settings} title="Operational Permissions" color="#8B5CF6"
                  count={OPS_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">
                  {OPS_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── EDIT PERMISSIONS TAB ────────────────────────────────────── */}
            {activePermTab === 'edit' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <SectionHeader icon={Pencil} title="Edit & Modification Permissions" color="#F59E0B"
                  count={EDIT_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">
                  {EDIT_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── CROSS-USER VISIBILITY TAB ───────────────────────────────── */}
            {activePermTab === 'cross' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <SectionHeader icon={UsersIcon} title="Cross-User Data Visibility" color={COLORS.emeraldGreen} />
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed -mt-4">
                  Choose which team members' data this user can see. Click a name to toggle access.
                </p>
                {[
                  { key: 'view_other_tasks',      label: 'Tasks',          icon: Layers,      color: '#3B82F6' },
                  { key: 'view_other_attendance', label: 'Attendance',     icon: Clock,       color: '#8B5CF6' },
                  { key: 'view_other_reports',    label: 'Reports',        icon: BarChart2,   color: '#F59E0B' },
                  { key: 'view_other_todos',      label: 'Personal Todos', icon: CheckCircle, color: '#10B981' },
                  { key: 'view_other_activity',   label: 'App Activity',   icon: Activity,    color: '#EF4444' },
                ].map(section => {
                  const SIcon        = section.icon;
                  const selectedCount = (permissions[section.key] || []).length;
                  return (
                    <div key={section.key} className="rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${section.color}20` }}>
                          <SIcon className="h-3.5 w-3.5" style={{ color: section.color }} />
                        </div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{section.label} Visibility</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${section.color}15`, color: section.color }}>
                          {selectedCount} selected
                        </span>
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        {users.filter(u => u.id !== selectedUserForPerms?.id).map(u => {
                          const sel = (permissions[section.key] || []).includes(u.id);
                          return (
                            <button key={u.id} type="button"
                              onClick={() => setPermissions(prev => ({
                                ...prev,
                                [section.key]: sel
                                  ? (prev[section.key] || []).filter(id => id !== u.id)
                                  : [...(prev[section.key] || []), u.id],
                              }))}
                              className={`px-3 py-1.5 rounded-2xl text-xs font-bold border-2 transition-all shadow-sm hover:shadow-md ${
                                sel
                                  ? 'text-white border-transparent shadow-md scale-105'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300'
                              }`}
                              style={sel ? { background: section.color } : {}}>
                              {sel ? '✓ ' : ''}{u.full_name}
                            </button>
                          );
                        })}
                        {users.length <= 1 && (
                          <p className="text-xs text-slate-400 italic p-2">No other users available</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* ── PORTFOLIO (CLIENTS) TAB ─────────────────────────────────── */}
            {activePermTab === 'clients' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <SectionHeader icon={Briefcase} title="Assigned Client Portfolio" color={COLORS.teal} />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {(permissions.assigned_clients || []).length}
                    </span> clients assigned
                  </p>
                  {(permissions.assigned_clients || []).length > 0 && (
                    <button type="button"
                      onClick={() => setPermissions(p => ({ ...p, assigned_clients: [] }))}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                      Clear all
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search companies…" value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="pl-10 h-10 rounded-2xl dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {clients
                    .filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .map(client => {
                      const assigned = (permissions.assigned_clients || []).includes(client.id);
                      return (
                        <button key={client.id} type="button"
                          onClick={() => setPermissions(prev => ({
                            ...prev,
                            assigned_clients: assigned
                              ? (prev.assigned_clients || []).filter(id => id !== client.id)
                              : [...(prev.assigned_clients || []), client.id],
                          }))}
                          className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all shadow-sm hover:shadow-md ${
                            assigned
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
                          }`}>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                            assigned ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                            {assigned ? <CheckCircle className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                          </div>
                          <span className={`text-xs font-bold truncate ${assigned ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                            {client.company_name}
                          </span>
                        </button>
                      );
                    })}
                  {clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                    <div className="col-span-2 py-8 text-center text-xs text-slate-400">No clients match your search.</div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* ✅ Fixed: DialogFooter with proper layout */}
          <DialogFooter className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700 flex items-center justify-between gap-3 rounded-b-3xl">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {Object.entries(permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length} permissions active
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => resetPermissionsToRole(selectedUserForPerms?.role)}
                className="rounded-2xl font-bold text-xs h-10 px-4 shadow-sm hover:shadow-md transition-all">
                Reset to Role Defaults
              </Button>
              <Button variant="ghost" className="rounded-2xl h-10 px-5 text-sm" onClick={() => setPermDialogOpen(false)}>
                Discard
              </Button>
              <Button onClick={handleSavePermissions} disabled={loading}
                className="rounded-2xl h-10 px-7 font-bold shadow-lg hover:shadow-xl text-white text-sm transition-all"
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
