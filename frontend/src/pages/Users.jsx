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
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye,
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase,
  Mail, Phone, Calendar, Camera, Clock, UserCheck, UserX,
  AlertCircle, KeyRound, Receipt, Target, Zap, Lock, ChevronRight,
  Activity, BarChart2, Star, Layers, FileText, Bell,
  Hash, ArrowUpRight, SlidersHorizontal, ShieldCheck,
  ShieldOff, Fingerprint, Download, Pencil, Inbox,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ── Brand palette ────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  indigo: '#4F46E5',
  violet: '#7C3AED',
  teal: '#0F766E',
  amber: '#B45309',
  slate: '#475569',
};

const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;
const GRAD_GREEN = `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`;

// ── Departments ───────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { value: 'GST', label: 'GST', color: '#1E3A8A', bg: '#EFF6FF' },
  { value: 'IT', label: 'IT', color: '#374151', bg: '#F9FAFB' },
  { value: 'ACC', label: 'ACC', color: '#065F46', bg: '#ECFDF5' },
  { value: 'TDS', label: 'TDS', color: '#1F2937', bg: '#F9FAFB' },
  { value: 'ROC', label: 'ROC', color: '#7C2D12', bg: '#FFF7ED' },
  { value: 'TM', label: 'TM', color: '#0F766E', bg: '#F0FDFA' },
  { value: 'MSME', label: 'MSME', color: '#92400E', bg: '#FFFBEB' },
  { value: 'FEMA', label: 'FEMA', color: '#334155', bg: '#F8FAFC' },
  { value: 'DSC', label: 'DSC', color: '#3F3F46', bg: '#FAFAFA' },
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
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
};

const slideIn = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin: { gradient: 'from-violet-600 to-indigo-600', textColor: 'text-white', icon: Crown, label: 'Admin' },
  manager: { gradient: 'from-blue-500 to-cyan-500', textColor: 'text-white', icon: Briefcase, label: 'Manager' },
  staff: { gradient: 'from-slate-400 to-slate-500', textColor: 'text-white', icon: UserIcon, label: 'Staff' },
};

// ── Dept pill ─────────────────────────────────────────────────────────────────
const DeptPill = ({ dept, size = 'sm' }) => {
  const info = DEPARTMENTS.find(d => d.value === dept);
  if (!info) return null;
  return (
    <span
      className={`inline-flex items-center font-bold rounded-xl px-3 py-1 text-xs tracking-wide shadow-sm`}
      style={{ background: info.bg, color: info.color, border: `1px solid ${info.color}30` }}
    >
      {info.label}
    </span>
  );
};

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status, isActive }) => {
  const resolved = status || (isActive !== false ? 'active' : 'inactive');
  const map = {
    active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    pending_approval: { label: 'Pending', cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
    inactive: { label: 'Inactive', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  };
  const cfg = map[resolved] || map.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${cfg.cls}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${resolved === 'active' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
};

// ── Module access badges on card ─────────────────────────────────────────────
const ModuleAccessBadges = ({ userData }) => {
  if (userData.role === 'admin') return null;
  const hasLeads = !!(userData.permissions?.can_view_all_leads);
  const hasQuotations = !!(userData.permissions?.can_create_quotations);
  const hasPasswords = !!(userData.permissions?.can_view_passwords);
  const canEditPass = !!(userData.permissions?.can_edit_passwords);

  const badges = [
    { show: true, label: 'Leads', active: hasLeads, color: 'blue', icon: Target },
    { show: true, label: 'Quotes', active: hasQuotations, color: 'violet', icon: Receipt },
    {
      show: true,
      label: !hasPasswords ? 'Vault' : canEditPass ? 'Vault R/W' : 'Vault R',
      active: hasPasswords,
      color: canEditPass ? 'amber' : 'teal',
      icon: KeyRound,
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {badges.map((b, idx) => {
        const Icon = b.icon;
        const style = b.active
          ? `bg-${b.color}-50 text-${b.color}-700 border-${b.color}-200 dark:bg-${b.color}-900/30 dark:text-${b.color}-300`
          : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500';
        return (
          <span
            key={idx}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium border ${style}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {b.label}
          </span>
        );
      })}
    </div>
  );
};

// ── Pending user card ─────────────────────────────────────────────────────────
const PendingUserCard = ({ userData, onApprove, onReject, approving }) => (
  <motion.div
    variants={itemVariants}
    layout
    className="group relative bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-amber-200 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
  >
    <div className="h-2 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
    <div className="p-6">
      <div className="flex items-start gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md ring-1 ring-amber-200">
            {userData.profile_picture ? (
              <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-2xl font-black"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
              >
                {userData.full_name?.charAt(0)?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-100 text-amber-600 rounded-full p-1 border-2 border-white">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg text-slate-900 dark:text-white tracking-tight truncate">
            {userData.full_name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">{userData.email}</p>

          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="secondary" className="capitalize text-xs font-medium">
              {userData.role}
            </Badge>
            <StatusBadge status={userData.status} />
          </div>
        </div>
      </div>

      {(userData.departments || []).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-5">
          {userData.departments.map((d) => <DeptPill key={d} dept={d} />)}
        </div>
      )}

      <div className="mt-6 space-y-2 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <Phone className="h-4 w-4 text-slate-400" />
          {userData.phone || '—'}
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-slate-400" />
          Registered {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <Button
          onClick={() => onApprove(userData)}
          disabled={approving === userData.id}
          className="flex-1 h-11 rounded-2xl font-semibold text-sm shadow-md hover:shadow-lg transition-all"
          style={{ background: COLORS.emeraldGreen, color: 'white' }}
        >
          <UserCheck className="h-4 w-4 mr-2" />
          {approving === userData.id ? 'Approving...' : 'Approve'}
        </Button>
        <Button
          onClick={() => onReject(userData)}
          disabled={approving === userData.id}
          variant="outline"
          className="flex-1 h-11 rounded-2xl border-red-200 text-red-600 hover:bg-red-50 font-semibold text-sm"
        >
          <UserX className="h-4 w-4 mr-2" />
          Reject
        </Button>
      </div>
    </div>
  </motion.div>
);

// ── Main user card ────────────────────────────────────────────────────────────
const UserCard = ({ userData, onEdit, onDelete, onPermissions, onApprove, onReject, currentUserId, isAdmin, canEditUsers, canManagePermissions, approving }) => {
  const [hovered, setHovered] = useState(false);
  const isPending = userData.status === 'pending_approval';
  const roleCfg = ROLE_CONFIG[userData.role?.toLowerCase()] || ROLE_CONFIG.staff;
  const RoleIcon = roleCfg.icon;

  const permCount = userData.permissions
    ? Object.entries(userData.permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length
    : 0;

  return (
    <motion.div
      variants={itemVariants}
      layout
      className={`group relative bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border shadow-md hover:shadow-2xl transition-all duration-300 ${isPending
          ? 'border-amber-300'
          : hovered
            ? 'border-blue-200 -translate-y-1 scale-[1.015]'
            : 'border-slate-200 dark:border-slate-700'
        }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`h-2 w-full bg-gradient-to-r ${roleCfg.gradient}`} />

      <AnimatePresence>
        {hovered && !isPending && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 right-4 flex gap-2 z-20"
          >
            {canManagePermissions && userData.role !== 'admin' && (
              <button
                onClick={() => onPermissions(userData)}
                className="w-9 h-9 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm border border-emerald-100 hover:border-emerald-200 transition-all dark:bg-emerald-900 dark:text-emerald-300"
                title="Manage Permissions"
              >
                <Shield className="h-4 w-4" />
              </button>
            )}
            {(isAdmin || (canEditUsers && !isPending)) && (
              <button
                onClick={() => onEdit(userData)}
                className="w-9 h-9 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm border border-blue-100 hover:border-blue-200 transition-all dark:bg-blue-900 dark:text-blue-300"
                title="Edit User"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {(isAdmin || canEditUsers) && userData.id !== currentUserId && (
              <button
                onClick={() => onDelete(userData.id)}
                className="w-9 h-9 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shadow-sm border border-red-100 hover:border-red-200 transition-all dark:bg-red-900 dark:text-red-300"
                title="Delete User"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6">
        <div className="flex items-start gap-5">
          <div className="relative flex-shrink-0">
            <div className="w-[68px] h-[68px] rounded-2xl overflow-hidden shadow-md ring-1 ring-slate-100 dark:ring-slate-700">
              {userData.profile_picture ? (
                <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex items-center justify-center text-white text-3xl font-black bg-gradient-to-br ${roleCfg.gradient}`}>
                  {userData.full_name?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </div>
            <div className={`absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-2xl bg-gradient-to-br ${roleCfg.gradient} flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow`}>
              <RoleIcon className="h-3.5 w-3.5 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h3 className="font-semibold text-lg tracking-tight text-slate-900 dark:text-white truncate">{userData.full_name}</h3>
            <div className="flex items-center gap-3 mt-3">
              <div className={`inline-flex items-center gap-1.5 px-4 py-1 rounded-2xl text-xs font-bold text-white bg-gradient-to-r ${roleCfg.gradient}`}>
                <RoleIcon className="h-3.5 w-3.5" />
                {roleCfg.label}
              </div>
              <StatusBadge status={userData.status} isActive={userData.is_active} />
            </div>
          </div>
        </div>

        {(userData.departments || []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6">
            {userData.departments.map((d) => <DeptPill key={d} dept={d} />)}
          </div>
        )}

        <ModuleAccessBadges userData={userData} />

        <div className="mt-6 space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3 truncate">
            <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="truncate">{userData.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-slate-400 flex-shrink-0" />
            {userData.phone || '—'}
          </div>
          {(userData.punch_in_time || userData.punch_out_time) && (
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
              {userData.punch_in_time || '—'} → {userData.punch_out_time || '—'}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
            Joined {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}
          </div>
        </div>

        {userData.role !== 'admin' && (
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Permissions</span>
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              {permCount}
            </div>
          </div>
        )}

        {isPending && isAdmin && (
          <div className="flex gap-3 mt-8">
            <Button
              onClick={() => onApprove(userData)}
              disabled={approving === userData.id}
              className="flex-1 h-11 rounded-2xl font-semibold text-sm shadow-md"
              style={{ background: COLORS.emeraldGreen, color: 'white' }}
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button
              onClick={() => onReject(userData)}
              disabled={approving === userData.id}
              variant="outline"
              className="flex-1 h-11 rounded-2xl border-red-200 text-red-600 hover:bg-red-50 font-semibold text-sm"
            >
              <UserX className="h-4 w-4 mr-2" />
              Reject
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
    <div className={`flex items-center justify-between px-5 py-4 rounded-3xl border transition-all ${isOn
        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}>
      <div className="flex items-center gap-4 pr-6 flex-1 min-w-0">
        {Icon && (
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${isOn ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className={`font-semibold text-sm ${isOn ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-200'}`}>{label}</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>
        </div>
      </div>
      <Switch
        checked={isOn}
        onCheckedChange={(val) => setPermissions((prev) => ({ ...prev, [permKey]: val }))}
      />
    </div>
  );
};

// ── Module access card ────────────────────────────────────────────────────────
const ModuleAccessCard = ({ icon: Icon, title, desc, permKey, permissions, setPermissions, accentColor, badge }) => {
  const isEnabled = !!permissions[permKey];
  const accent = accentColor || COLORS.mediumBlue;

  return (
    <div
      onClick={() => setPermissions((p) => ({ ...p, [permKey]: !p[permKey] }))}
      className={`group relative flex gap-5 p-5 rounded-3xl border-2 cursor-pointer transition-all hover:shadow-xl ${isEnabled
          ? 'shadow-md'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      style={isEnabled ? { borderColor: `${accent}40`, background: `${accent}08` } : {}}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${isEnabled ? 'text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
        style={isEnabled ? { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` } : {}}
      >
        <Icon className="h-6 w-6" />
      </div>

      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2">
          <p className={`font-semibold text-base ${isEnabled ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{title}</p>
          {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{desc}</p>
      </div>

      <div className={`w-8 h-8 rounded-2xl flex items-center justify-center text-lg font-black transition-all flex-shrink-0 ${isEnabled ? 'bg-emerald-500 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-300'}`}>
        {isEnabled ? '✓' : '✕'}
      </div>
    </div>
  );
};

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, count, color }) => (
  <div className="flex items-center gap-4 mb-6">
    <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${color}15` }}>
      <Icon className="h-5 w-5" style={{ color }} />
    </div>
    <div>
      <p className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">{title}</p>
    </div>
    {count !== undefined && (
      <div className="ml-auto text-xs font-bold px-4 py-1.5 rounded-full" style={{ background: `${color}15`, color }}>
        {count} enabled
      </div>
    )}
  </div>
);

// ── Permission definitions ───────────────────────────────────────────────────
const GLOBAL_PERMS = [
  { key: 'can_view_all_tasks', label: 'Universal Task Access', desc: 'See tasks assigned to any user or department', icon: Layers },
  { key: 'can_view_all_clients', label: 'Master Client List', desc: 'View all company legal entities', icon: Briefcase },
  { key: 'can_view_all_dsc', label: 'DSC Vault Access', desc: 'View all Digital Signature Certificates', icon: Fingerprint },
  { key: 'can_view_documents', label: 'Document Library', desc: 'Access physical document register', icon: FileText },
  { key: 'can_view_all_duedates', label: 'Compliance Roadmap', desc: 'View all upcoming statutory due dates', icon: Calendar },
  { key: 'can_view_reports', label: 'Analytics Dashboard', desc: 'View performance and system-wide reports', icon: BarChart2 },
  { key: 'can_view_todo_dashboard', label: 'Todo Dashboard', desc: 'Access global team todo overview', icon: CheckCircle },
  { key: 'can_view_audit_logs', label: 'System Audit Trail', desc: 'View activity logs and record histories', icon: Activity },
  { key: 'can_view_all_leads', label: 'Leads Pipeline', desc: 'View the global leads dashboard', icon: Target },
  { key: 'can_view_user_page', label: 'User Directory', desc: 'View team members directory', icon: UsersIcon },
  { key: 'can_view_selected_users_reports', label: 'Team Reports Access', desc: 'View reports for selected users', icon: Eye },
  { key: 'can_view_staff_rankings', label: 'Staff Rankings', desc: 'View performance leaderboard', icon: Star },
  { key: 'can_view_own_data', label: 'View Own Data', desc: 'Access own attendance, tasks and reports', icon: UserIcon },
  { key: 'can_create_quotations', label: 'Quotations Module', desc: 'Create, edit, export and share quotations', icon: Receipt },
];

const OPS_PERMS = [
  { key: 'can_assign_tasks', label: 'Task Delegation', desc: 'Assign tasks to other staff members', icon: ArrowUpRight },
  { key: 'can_assign_clients', label: 'Client Assignment', desc: 'Assign and reassign staff to clients', icon: Briefcase },
  { key: 'can_manage_users', label: 'User Governance', desc: 'Manage team members and roles', icon: UsersIcon },
  { key: 'can_view_attendance', label: 'Attendance Management', desc: 'Review punch timings and late reports', icon: Clock },
  { key: 'can_view_staff_activity', label: 'Staff Monitoring', desc: 'View app usage and screen activity', icon: Activity },
  { key: 'can_send_reminders', label: 'Automated Reminders', desc: 'Trigger email/notification reminders', icon: Bell },
  { key: 'can_download_reports', label: 'Export Data', desc: 'Download CSV/PDF versions of reports', icon: Download },
  { key: 'can_manage_settings', label: 'System Settings', desc: 'Modify global system configuration', icon: Settings },
  { key: 'can_delete_data', label: 'Delete Records', desc: 'Permanently delete data entries', icon: Trash2 },
  { key: 'can_delete_tasks', label: 'Delete Tasks', desc: 'Delete any task regardless of ownership', icon: XCircle },
  { key: 'can_connect_email', label: 'Connect Email Accounts', desc: 'Link personal email via IMAP integration', icon: Inbox },
];

const EDIT_PERMS = [
  { key: 'can_edit_tasks', label: 'Modify Tasks', desc: 'Update and delete task definitions', icon: Pencil },
  { key: 'can_edit_clients', label: 'Modify Clients', desc: 'Update client master data records', icon: Edit },
  { key: 'can_edit_dsc', label: 'Modify DSC', desc: 'Update certificate details and metadata', icon: Fingerprint },
  { key: 'can_edit_documents', label: 'Modify Documents', desc: 'Change document records', icon: FileText },
  { key: 'can_edit_due_dates', label: 'Modify Due Dates', desc: 'Edit statutory compliance timelines', icon: Calendar },
  { key: 'can_edit_users', label: 'Modify Users', desc: 'Update user profiles and settings', icon: UserIcon },
];

// ── Permission Matrix Summary ─────────────────────────────────────────────────
const PermissionMatrixSummary = ({ permissions }) => {
  const allPerms = [...GLOBAL_PERMS, ...OPS_PERMS, ...EDIT_PERMS];
  const granted = allPerms.filter(p => permissions[p.key]).length;
  const total = allPerms.length;
  const pct = Math.round((granted / total) * 100);

  return (
    <div className="flex gap-6 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="24" cy="24" r="20"
            fill="none"
            stroke={COLORS.emeraldGreen}
            strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-black text-2xl text-slate-700 dark:text-slate-100">
          {pct}%
        </div>
      </div>
      <div className="flex-1">
        <p className="font-bold text-2xl tracking-tight">Permission Coverage</p>
        <p className="text-slate-500 mt-1">{granted} of {total} permissions enabled</p>
      </div>
    </div>
  );
};

// ── Permission tabs ───────────────────────────────────────────────────────────
const permTabs = [
  { id: 'modules', label: 'Modules', icon: Zap },
  { id: 'view', label: 'View', icon: Eye },
  { id: 'ops', label: 'Operations', icon: Settings },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'cross', label: 'Cross-User', icon: UsersIcon },
  { id: 'clients', label: 'Clients', icon: Briefcase },
];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — FULL REWRITE WITH REFINED DIALOG + FULL DARK MODE
// ══════════════════════════════════════════════════════════════════════════════
export default function Users() {
  const { user, refreshUser } = useAuth();
  const isDark = useDark();
  const isAdmin = user?.role === 'admin';
  const perms = user?.permissions || {};

  const canViewUserPage = isAdmin || !!perms.can_view_user_page;
  const canEditUsers = isAdmin || !!perms.can_manage_users;
  const canManagePermissions = isAdmin;

  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [roleChanged, setRoleChanged] = useState(false);
  const [activePermTab, setActivePermTab] = useState('modules');

  const [formData, setFormData] = useState({
    full_name: '', email: '', password: '', role: 'staff',
    departments: [], phone: '', birthday: '', profile_picture: '',
    punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
    telegram_id: '', is_active: true, status: 'active',
  });

  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });

  useEffect(() => {
    if (canViewUserPage) {
      fetchUsers();
      fetchClients();
    }
  }, [canViewUserPage]);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      const raw = res.data;
      setUsers(Array.isArray(raw) ? raw : (raw?.data || []));
    } catch {
      toast.error('Failed to fetch users');
    }
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
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handleRoleChange = (newRole) => {
    if (selectedUser && newRole !== formData.role) setRoleChanged(true);
    setFormData((p) => ({ ...p, role: newRole }));
  };

  const toggleDept = (dept) => {
    setFormData((p) => ({
      ...p,
      departments: p.departments.includes(dept)
        ? p.departments.filter((d) => d !== dept)
        : [...p.departments, dept],
    }));
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData((p) => ({ ...p, profile_picture: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleEdit = (userData) => {
    setSelectedUser(userData);
    setRoleChanged(false);
    setFormData({
      full_name: userData.full_name || '',
      email: userData.email || '',
      password: '',
      role: userData.role || 'staff',
      departments: userData.departments || [],
      phone: userData.phone || '',
      birthday: userData.birthday && userData.birthday !== ''
        ? format(new Date(userData.birthday), 'yyyy-MM-dd') : '',
      profile_picture: userData.profile_picture || '',
      punch_in_time: userData.punch_in_time || '10:30',
      grace_time: userData.grace_time || '00:10',
      punch_out_time: userData.punch_out_time || '19:00',
      telegram_id: userData.telegram_id != null ? String(userData.telegram_id) : '',
      is_active: userData.is_active !== false,
      status: userData.status || 'active',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.full_name.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!selectedUser && !formData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    setLoading(true);
    try {
      if (selectedUser) {
        const payload = {
          full_name: formData.full_name.trim(),
          phone: formData.phone || null,
          birthday: formData.birthday || null,
          profile_picture: formData.profile_picture || null,
          punch_in_time: formData.punch_in_time || null,
          grace_time: formData.grace_time || null,
          punch_out_time: formData.punch_out_time || null,
          telegram_id: formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active: formData.is_active,
          ...(isAdmin && {
            email: formData.email.trim(),
            role: formData.role,
            status: formData.status,
            departments: formData.departments,
          }),
          ...(isAdmin && formData.password.trim() && { password: formData.password.trim() }),
        };

        await api.put(`/users/${selectedUser.id}`, payload);
        if (selectedUser.id === user.id) await refreshUser();
        toast.success('✓ User updated successfully');
      } else {
        await api.post('/auth/register', {
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role: formData.role,
          departments: formData.departments,
          phone: formData.phone || null,
          birthday: formData.birthday || null,
          punch_in_time: formData.punch_in_time,
          grace_time: formData.grace_time,
          punch_out_time: formData.punch_out_time,
          telegram_id: formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active: false,
          status: 'pending_approval',
        });
        toast.success('✓ Member registered — awaiting approval');
      }

      setDialogOpen(false);
      fetchUsers();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin && !canEditUsers) {
      toast.error('No permission to delete users');
      return;
    }
    if (id === user.id) {
      toast.error('You cannot delete your own account');
      return;
    }
    if (!window.confirm('Permanently delete this user and all their data?')) return;

    try {
      await api.delete(`/users/${id}`);
      toast.success('User removed');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  const openPermissionsDialog = async (userData) => {
    setSelectedUserForPerms(userData);
    setActivePermTab('modules');
    await fetchPermissions(userData.id);
    setPermDialogOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!canManagePermissions) {
      toast.error('Only administrators can update permissions');
      return;
    }

    setLoading(true);
    try {
      const ensureArray = (v) => (Array.isArray(v) ? v : []);
      const payload = {
        ...permissions,
        view_password_departments: ensureArray(permissions.view_password_departments),
        assigned_clients: ensureArray(permissions.assigned_clients),
        view_other_tasks: ensureArray(permissions.view_other_tasks),
        view_other_attendance: ensureArray(permissions.view_other_attendance),
        view_other_reports: ensureArray(permissions.view_other_reports),
        view_other_todos: ensureArray(permissions.view_other_todos),
        view_other_activity: ensureArray(permissions.view_other_activity),
      };

      await api.put(`/users/${selectedUserForPerms.id}/permissions`, payload);
      if (selectedUserForPerms.id === user.id) await refreshUser();
      toast.success('✓ Permissions saved');
      setPermDialogOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  const resetPermissionsToRole = (role) => {
    setPermissions({ ...(DEFAULT_ROLE_PERMISSIONS[role] || EMPTY_PERMISSIONS) });
    toast.info(`Reset to ${role} defaults — click Save to apply`);
  };

  const handleApprove = async (userData) => {
    if (!isAdmin) {
      toast.error('Only admins can approve users');
      return;
    }
    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/approve`);
      toast.success(`✓ ${userData.full_name} approved`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (userData) => {
    if (!isAdmin) {
      toast.error('Only admins can reject users');
      return;
    }
    if (!window.confirm(`Reject ${userData.full_name}?`)) return;

    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/reject`);
      toast.success(`${userData.full_name} rejected`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reject');
    } finally {
      setApprovingId(null);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const pendingUsers = users.filter((u) => u.status === 'pending_approval');
  const rejectedUsers = users.filter((u) => u.status === 'rejected');

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const match = (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);

    if (activeTab === 'pending') return match && u.status === 'pending_approval';
    if (activeTab === 'rejected') return match && u.status === 'rejected';
    if (activeTab === 'all') return match;
    return match && u.role?.toLowerCase() === activeTab;
  });

  const stats = [
    { label: 'Total Members', value: users.length, icon: UsersIcon, color: COLORS.mediumBlue },
    { label: 'Admins', value: users.filter((u) => u.role === 'admin').length, icon: Crown, color: COLORS.indigo },
    { label: 'Pending', value: pendingUsers.length, icon: Clock, color: '#D97706' },
    { label: 'Active', value: users.filter((u) => u.is_active).length, icon: CheckCircle, color: COLORS.emeraldGreen },
  ];

  if (!canViewUserPage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-24 h-24 rounded-3xl bg-red-100 dark:bg-red-950 flex items-center justify-center mx-auto mb-8">
            <ShieldOff className="h-12 w-12 text-red-500" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Access Restricted</h2>
          <p className="text-slate-600 dark:text-slate-400">
            You need the <span className="font-semibold">View User Directory</span> permission to access this page.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className={`space-y-10 p-6 md:p-10 min-h-screen ${isDark ? 'bg-[#0a0f1c]' : 'bg-slate-50'}`}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Page Header */}
      <motion.div variants={slideIn} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-3xl flex items-center justify-center shadow-xl" style={{ background: GRADIENT }}>
            <UsersIcon className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tighter text-slate-900 dark:text-white">User Directory</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Manage team members and permissions</p>
          </div>
        </div>

        {isAdmin && (
          <Button
            onClick={() => {
              setSelectedUser(null);
              setRoleChanged(false);
              setFormData({
                full_name: '', email: '', password: '', role: 'staff',
                departments: [], phone: '', birthday: '', profile_picture: '',
                punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
                telegram_id: '', is_active: true, status: 'active',
              });
              setDialogOpen(true);
            }}
            className="h-12 px-8 rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all text-base"
            style={{ background: GRADIENT, color: 'white' }}
          >
            <Plus className="h-5 w-5 mr-3" />
            Add New Member
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div variants={containerVariants} className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={i}
              variants={itemVariants}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <Icon className="h-6 w-6" style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">{s.value}</p>
                  <p className="text-sm text-slate-500 font-medium mt-1">{s.label}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl p-0 border-0 shadow-2xl">
          <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 rounded-t-3xl">
            <div className="h-2 w-full" style={{ background: GRADIENT }} />
            <div className="px-8 py-6 border-b dark:border-slate-700">
              <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                {selectedUser ? `Edit — ${selectedUser.full_name}` : 'Add New Team Member'}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1">
                {isAdmin ? 'Full administrative control' : 'Update your personal information'}
              </DialogDescription>
            </div>
          </div>

          <div className="p-8 space-y-10">
            {/* Profile Picture */}
            <div className="flex justify-center">
              <label className="relative group cursor-pointer">
                <div className="w-28 h-28 rounded-3xl overflow-hidden border-4 border-white dark:border-slate-800 shadow-xl">
                  {formData.profile_picture ? (
                    <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <UserIcon className="h-14 w-14 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 bg-white dark:bg-slate-700 rounded-full p-3 shadow-lg border border-slate-200 dark:border-slate-600">
                  <Camera className="h-5 w-5 text-blue-600" />
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">FULL NAME</Label>
                <Input
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInput}
                  placeholder="Full Name"
                  className="h-12 rounded-2xl"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">EMAIL ADDRESS</Label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInput}
                  disabled={!isAdmin || (selectedUser && selectedUser.id === user.id)}
                  placeholder="name@company.com"
                  className="h-12 rounded-2xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">PHONE NUMBER</Label>
                <Input name="phone" value={formData.phone} onChange={handleInput} placeholder="+91 98765 43210" className="h-12 rounded-2xl" />
              </div>
              <div>
                <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> {selectedUser ? 'NEW PASSWORD' : 'INITIAL PASSWORD'}
                </Label>
                <Input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInput}
                  placeholder={selectedUser ? "Leave blank to keep current" : "Secure password"}
                  className="h-12 rounded-2xl"
                />
              </div>
            </div>

            {/* Shift Schedule */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-blue-700 dark:text-blue-400">WORK SHIFT SCHEDULE</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Punch In', name: 'punch_in_time' },
                  { label: 'Grace Period', name: 'grace_time' },
                  { label: 'Punch Out', name: 'punch_out_time' },
                ].map((f) => (
                  <div key={f.name}>
                    <Label className="text-xs font-medium text-blue-600 mb-2 block">{f.label}</Label>
                    <Input type="time" name={f.name} value={formData[f.name]} onChange={handleInput} className="h-12 rounded-2xl" />
                  </div>
                ))}
              </div>
            </div>

            {/* Birthday + Telegram */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">BIRTHDAY</Label>
                <Input type="date" name="birthday" value={formData.birthday} onChange={handleInput} className="h-12 rounded-2xl" />
              </div>
              <div>
                <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">TELEGRAM ID</Label>
                <Input type="number" name="telegram_id" value={formData.telegram_id} onChange={handleInput} placeholder="123456789" className="h-12 rounded-2xl" />
              </div>
            </div>

            {/* Admin Only Fields */}
            {isAdmin && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">ROLE</Label>
                    <Select value={formData.role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-2 block">ACCOUNT STATUS</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData((p) => ({ ...p, status: v, is_active: v === 'active' }))}
                    >
                      <SelectTrigger className="h-12 rounded-2xl">
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

                {/* Departments */}
                <div>
                  <Label className="text-xs font-semibold tracking-widest text-slate-500 mb-4 block">ASSIGNED DEPARTMENTS</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {DEPARTMENTS.map((dept) => {
                      const active = formData.departments.includes(dept.value);
                      return (
                        <button
                          key={dept.value}
                          type="button"
                          onClick={() => toggleDept(dept.value)}
                          className={`h-12 rounded-2xl text-sm font-semibold border-2 transition-all ${active
                              ? 'text-white border-transparent shadow'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                            }`}
                          style={{ background: active ? dept.color : undefined }}
                        >
                          {dept.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="px-8 py-6 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-3xl flex justify-end gap-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-12 px-8 rounded-2xl">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="h-12 px-10 rounded-2xl font-semibold text-base" style={{ background: GRAD_GREEN }}>
              {loading ? 'Saving...' : selectedUser ? 'Save Changes' : 'Create Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Banner */}
      <AnimatePresence>
        {isAdmin && pendingUsers.length > 0 && activeTab !== 'pending' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-6 p-6 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-3xl"
          >
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-2xl flex items-center justify-center">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                {pendingUsers.length} registration{pendingUsers.length > 1 ? 's' : ''} pending approval
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">These users cannot sign in until approved.</p>
            </div>
            <Button onClick={() => setActiveTab('pending')} className="rounded-2xl h-11 px-8 bg-amber-600 hover:bg-amber-700 text-white">
              Review Pending
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Tabs */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search members by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-14 h-14 rounded-3xl text-base border-slate-200 dark:border-slate-700"
          />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 rounded-3xl flex flex-wrap gap-1">
          {['all', 'admin', 'manager', 'staff'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-7 py-3 rounded-2xl text-sm font-semibold transition-all ${activeTab === t
                  ? 'text-white shadow'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              style={activeTab === t ? { background: GRADIENT } : {}}
            >
              {t === 'all' ? 'All Members' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
            </button>
          ))}

          {isAdmin && (
            <button
              onClick={() => setActiveTab('pending')}
              className={`relative px-7 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'pending' ? 'text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              style={activeTab === 'pending' ? { background: 'linear-gradient(135deg,#f59e0b,#f97316)' } : {}}
            >
              <Clock className="h-4 w-4" /> Pending
              {pendingUsers.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          )}

          {isAdmin && rejectedUsers.length > 0 && (
            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-7 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'rejected' ? 'bg-red-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <XCircle className="h-4 w-4" /> Rejected
            </button>
          )}
        </div>
      </div>

      {/* Pending Users Grid */}
      {activeTab === 'pending' && isAdmin && (
        filteredUsers.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-6" />
            <h3 className="text-2xl font-semibold text-slate-400">No pending approvals</h3>
          </div>
        ) : (
          <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {filteredUsers.map((u) => (
              <PendingUserCard
                key={u.id}
                userData={u}
                onApprove={handleApprove}
                onReject={handleReject}
                approving={approvingId}
              />
            ))}
          </motion.div>
        )
      )}

      {/* Main Users Grid */}
      {activeTab !== 'pending' && (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full py-24 text-center">
              <UsersIcon className="h-20 w-20 text-slate-300 mx-auto mb-6" />
              <h3 className="text-2xl font-semibold text-slate-400">No members found</h3>
              <p className="text-slate-500 mt-2">Try changing your search or filter</p>
            </div>
          ) : (
            filteredUsers.map((u) => (
              <UserCard
                key={u.id}
                userData={u}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onPermissions={openPermissionsDialog}
                onApprove={handleApprove}
                onReject={handleReject}
                currentUserId={user?.id}
                isAdmin={isAdmin}
                canEditUsers={canEditUsers}
                canManagePermissions={canManagePermissions}
                approving={approvingId}
              />
            ))
          )}
        </motion.div>
      )}

      {/* ────────────────────────────────────────────────────────────────
           REFINED PERMISSIONS DIALOG (Full Dark Mode + Modern Layout)
      ──────────────────────────────────────────────────────────────── */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden rounded-3xl p-0 border-0 shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 rounded-t-3xl border-b dark:border-slate-700">
            <div className="h-2 w-full" style={{ background: GRADIENT }} />
            
            <div className="px-8 py-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                  <Shield className="h-6 w-6 text-indigo-600" />
                  Permissions • {selectedUserForPerms?.full_name}
                </DialogTitle>
                <DialogDescription className="text-base text-slate-500">
                  Fine-tune what this team member can access and manage
                </DialogDescription>
              </DialogHeader>

              {/* Quick Role Reset */}
              <div className="flex items-center gap-3 mt-6">
                <span className="text-xs font-medium text-slate-500">RESET TO:</span>
                {['staff', 'manager', 'admin'].map((r) => (
                  <button
                    key={r}
                    onClick={() => resetPermissionsToRole(r)}
                    className={`text-xs px-4 py-1.5 rounded-full font-medium border transition-all hover:shadow-sm capitalize ${
                      selectedUserForPerms?.role === r
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                        : 'border-slate-300 hover:border-slate-400 dark:border-slate-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto bg-slate-50 dark:bg-slate-800 px-8 border-t dark:border-slate-700">
              {permTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activePermTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActivePermTab(tab.id)}
                    className={`flex items-center gap-2.5 px-8 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
                      isActive
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8 space-y-10 bg-white dark:bg-slate-900">
            
            {/* Modules Tab */}
            {activePermTab === 'modules' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
                <PermissionMatrixSummary permissions={permissions} />

                <div>
                  <SectionHeader icon={Zap} title="Module Access" color={COLORS.indigo} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ModuleAccessCard
                      icon={Target}
                      title="Leads Pipeline"
                      desc="Access and manage all leads across the organization"
                      permKey="can_view_all_leads"
                      permissions={permissions}
                      setPermissions={setPermissions}
                      accentColor={COLORS.mediumBlue}
                    />
                    <ModuleAccessCard
                      icon={Receipt}
                      title="Quotations"
                      desc="Create, edit, and share professional quotations"
                      permKey="can_create_quotations"
                      permissions={permissions}
                      setPermissions={setPermissions}
                      accentColor={COLORS.violet}
                      badge="Business"
                    />
                    <ModuleAccessCard
                      icon={KeyRound}
                      title="Password Vault"
                      desc="View stored login credentials"
                      permKey="can_view_passwords"
                      permissions={permissions}
                      setPermissions={setPermissions}
                      accentColor={COLORS.teal}
                    />
                    <ModuleAccessCard
                      icon={Lock}
                      title="Manage Password Vault"
                      desc="Add and update credentials (requires View permission)"
                      permKey="can_edit_passwords"
                      permissions={permissions}
                      setPermissions={setPermissions}
                      accentColor={COLORS.amber}
                    />
                  </div>

                  {/* Vault Department Access */}
                  {permissions.can_view_passwords && (
                    <div className="mt-8 p-8 rounded-3xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30">
                      <SectionHeader icon={KeyRound} title="Vault Access by Department" color={COLORS.teal} />
                      <p className="text-sm text-slate-500 mb-5">Select departments whose passwords this user can view</p>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {DEPARTMENTS.map((dept) => {
                          const isSelected = (permissions.view_password_departments || []).includes(dept.value);
                          return (
                            <button
                              key={dept.value}
                              onClick={() => setPermissions((prev) => ({
                                ...prev,
                                view_password_departments: isSelected
                                  ? (prev.view_password_departments || []).filter((d) => d !== dept.value)
                                  : [...(prev.view_password_departments || []), dept.value],
                              }))}
                              className={`h-12 rounded-2xl text-sm font-medium border-2 transition-all flex items-center justify-center gap-2 ${
                                isSelected
                                  ? 'border-transparent text-white shadow-md'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-teal-300'
                              }`}
                              style={{ background: isSelected ? dept.color : undefined }}
                            >
                              {isSelected && <CheckCircle className="h-4 w-4" />}
                              {dept.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* View Tab */}
            {activePermTab === 'view' && (
              <div>
                <SectionHeader 
                  icon={Eye} 
                  title="Visibility Permissions" 
                  color="#3B82F6" 
                  count={GLOBAL_PERMS.filter(p => permissions[p.key]).length} 
                />
                <div className="space-y-3">
                  {GLOBAL_PERMS.map((p) => (
                    <PermToggleRow
                      key={p.key}
                      permKey={p.key}
                      label={p.label}
                      desc={p.desc}
                      icon={p.icon}
                      permissions={permissions}
                      setPermissions={setPermissions}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Operations Tab */}
            {activePermTab === 'ops' && (
              <div>
                <SectionHeader 
                  icon={Settings} 
                  title="Operational Controls" 
                  color="#8B5CF6" 
                  count={OPS_PERMS.filter(p => permissions[p.key]).length} 
                />
                <div className="space-y-3">
                  {OPS_PERMS.map((p) => (
                    <PermToggleRow
                      key={p.key}
                      permKey={p.key}
                      label={p.label}
                      desc={p.desc}
                      icon={p.icon}
                      permissions={permissions}
                      setPermissions={setPermissions}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Edit Tab */}
            {activePermTab === 'edit' && (
              <div>
                <SectionHeader 
                  icon={Pencil} 
                  title="Modification Rights" 
                  color="#F59E0B" 
                  count={EDIT_PERMS.filter(p => permissions[p.key]).length} 
                />
                <div className="space-y-3">
                  {EDIT_PERMS.map((p) => (
                    <PermToggleRow
                      key={p.key}
                      permKey={p.key}
                      label={p.label}
                      desc={p.desc}
                      icon={p.icon}
                      permissions={permissions}
                      setPermissions={setPermissions}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cross-User Tab */}
            {activePermTab === 'cross' && (
              <div className="space-y-8">
                <SectionHeader icon={UsersIcon} title="Cross-User Data Access" color={COLORS.emeraldGreen} />
                <p className="text-slate-500 text-sm -mt-3">Select team members whose data this user can view</p>

                {[
                  { key: 'view_other_tasks', label: 'Tasks', icon: Layers, color: '#3B82F6' },
                  { key: 'view_other_attendance', label: 'Attendance', icon: Clock, color: '#8B5CF6' },
                  { key: 'view_other_reports', label: 'Reports', icon: BarChart2, color: '#F59E0B' },
                  { key: 'view_other_todos', label: 'Todos', icon: CheckCircle, color: '#10B981' },
                  { key: 'view_other_activity', label: 'Activity', icon: Activity, color: '#EF4444' },
                ].map((section) => {
                  const SIcon = section.icon;
                  const selectedCount = (permissions[section.key] || []).length;
                  return (
                    <div key={section.key} className="border rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
                      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: `${section.color}15` }}>
                            <SIcon className="h-5 w-5" style={{ color: section.color }} />
                          </div>
                          <span className="font-semibold text-base">{section.label}</span>
                        </div>
                        <div className="text-sm font-medium px-4 py-1 rounded-full" style={{ background: `${section.color}15`, color: section.color }}>
                          {selectedCount} selected
                        </div>
                      </div>
                      <div className="p-6 flex flex-wrap gap-2">
                        {users
                          .filter((u) => u.id !== selectedUserForPerms?.id)
                          .map((u) => {
                            const isSelected = (permissions[section.key] || []).includes(u.id);
                            return (
                              <button
                                key={u.id}
                                onClick={() => setPermissions((prev) => ({
                                  ...prev,
                                  [section.key]: isSelected
                                    ? (prev[section.key] || []).filter((id) => id !== u.id)
                                    : [...(prev[section.key] || []), u.id],
                                }))}
                                className={`px-5 py-2.5 rounded-2xl text-sm font-medium border-2 transition-all ${
                                  isSelected
                                    ? 'text-white border-transparent shadow-md'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                                style={isSelected ? { background: section.color } : {}}
                              >
                                {isSelected ? '✓ ' : ''}{u.full_name}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Clients Tab */}
            {activePermTab === 'clients' && (
              <div className="space-y-6">
                <SectionHeader icon={Briefcase} title="Client Portfolio" color={COLORS.teal} />
                
                <div className="flex justify-between items-center">
                  <p className="text-lg font-semibold">
                    {(permissions.assigned_clients || []).length} clients assigned
                  </p>
                  {(permissions.assigned_clients || []).length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setPermissions((p) => ({ ...p, assigned_clients: [] }))}
                      className="text-red-600 hover:text-red-700"
                    >
                      Clear All
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    placeholder="Search clients by name..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="pl-14 h-14 rounded-3xl text-base"
                  />
                </div>

                <div className="max-h-[460px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pr-2">
                  {clients
                    .filter((c) => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .map((client) => {
                      const isAssigned = (permissions.assigned_clients || []).includes(client.id);
                      return (
                        <button
                          key={client.id}
                          onClick={() => setPermissions((prev) => ({
                            ...prev,
                            assigned_clients: isAssigned
                              ? (prev.assigned_clients || []).filter((id) => id !== client.id)
                              : [...(prev.assigned_clients || []), client.id],
                          }))}
                          className={`flex items-center gap-4 p-5 rounded-3xl border-2 text-left transition-all hover:shadow-md ${
                            isAssigned
                              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${isAssigned ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                            {isAssigned ? <CheckCircle className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
                          </div>
                          <span className={`font-medium leading-tight ${isAssigned ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                            {client.company_name}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="px-8 py-6 bg-slate-50 dark:bg-slate-900 border-t dark:border-slate-700 rounded-b-3xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <SlidersHorizontal className="h-4 w-4" />
              <span>
                {Object.entries(permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length} permissions enabled
              </span>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setPermDialogOpen(false)} className="h-12 px-8 rounded-2xl">
                Cancel
              </Button>
              <Button
                onClick={handleSavePermissions}
                disabled={loading}
                className="h-12 px-10 rounded-2xl font-semibold"
                style={{ background: GRAD_GREEN, color: 'white' }}
              >
                {loading ? 'Saving Changes...' : 'Save Permissions'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
