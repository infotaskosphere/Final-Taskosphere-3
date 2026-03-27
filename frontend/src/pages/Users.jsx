import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
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

// ── Brand Colors ──────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
  indigo: '#4F46E5',
  violet: '#7C3AED',
  teal: '#0F766E',
  slate: '#475569',
};

// ── Spring Physics ────────────────────────────────────────────────────────────
const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: 'spring', stiffness: 400, damping: 28 },
  tap: { type: 'spring', stiffness: 500, damping: 30 },
};

// ── Animation Variants ────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
};
const slideIn = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

// ── Department Configuration ──────────────────────────────────────────────────
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

// ── Role Configuration ────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin: { gradient: `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.indigo})`, icon: Crown, label: 'Admin' },
  manager: { gradient: `linear-gradient(135deg, ${COLORS.mediumBlue}, #0ea5e9)`, icon: Briefcase, label: 'Manager' },
  staff: { gradient: `linear-gradient(135deg, ${COLORS.slate}, #64748b)`, icon: UserIcon, label: 'Staff' },
};

// ── Default Permissions ───────────────────────────────────────────────────────
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
    can_connect_email: true, can_view_own_data: true, can_create_quotations: false,
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
    can_connect_email: true, can_view_own_data: true, can_create_quotations: false,
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
  can_connect_email: false, can_view_own_data: false, can_create_quotations: false,
  can_view_passwords: false, can_edit_passwords: false,
  view_password_departments: [],
  assigned_clients: [], view_other_tasks: [], view_other_attendance: [],
  view_other_reports: [], view_other_todos: [], view_other_activity: [],
};

// ── Permission Definitions ────────────────────────────────────────────────────
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
  { key: 'can_view_selected_users_reports',label: 'Team Reports Access', desc: 'View reports for selected users', icon: Eye },
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
  { key: 'can_edit_dsc', label: 'Modify DSC', desc: 'Update certificate details and metadata',icon: Fingerprint },
  { key: 'can_edit_documents', label: 'Modify Documents', desc: 'Change document records', icon: FileText },
  { key: 'can_edit_due_dates', label: 'Modify Due Dates', desc: 'Edit statutory compliance timelines', icon: Calendar },
  { key: 'can_edit_users', label: 'Modify Users', desc: 'Update user profiles and settings', icon: UserIcon },
];

// ── Slim scrollbar ────────────────────────────────────────────────────────────
const slimScroll = {
  overflowY: 'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: '#cbd5e1 transparent',
};

// ── Shared Card Shell (Dashboard pattern) ─────────────────────────────────────
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Card Header Row (Dashboard pattern) ──────────────────────────────────────
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
      {action}
    </div>
  );
}

// ── Department Pill ───────────────────────────────────────────────────────────
const DeptPill = ({ dept }) => {
  const info = DEPARTMENTS.find(d => d.value === dept);
  if (!info) return null;
  return (
    <span className="inline-flex items-center font-bold rounded-lg px-2 py-0.5 text-[10px] tracking-wide"
      style={{ background: info.bg, color: info.color, border: `1px solid ${info.color}30` }}>
      {info.label}
    </span>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status, isActive }) => {
  const resolved = status || (isActive !== false ? 'active' : 'inactive');
  const statusConfig = {
    active: { label: 'Active', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
    pending_approval: { label: 'Pending', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500 animate-pulse' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400', dot: 'bg-red-500' },
    inactive: { label: 'Inactive', cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
  };
  const cfg = statusConfig[resolved] || statusConfig.inactive;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
    </span>
  );
};

// ── Module Access Badges ──────────────────────────────────────────────────────
const ModuleAccessBadges = ({ userData }) => {
  if (userData.role === 'admin') return null;
  const hasLeads = !!userData.permissions?.can_view_all_leads;
  const hasQuotations = !!userData.permissions?.can_create_quotations;
  const hasPasswords = !!userData.permissions?.can_view_passwords;
  const canEditPass = !!userData.permissions?.can_edit_passwords;
  const badges = [
    { label: 'Leads', active: hasLeads, color: COLORS.mediumBlue, icon: Target },
    { label: 'Quotes', active: hasQuotations, color: COLORS.violet, icon: Receipt },
    { label: !hasPasswords ? 'Vault' : canEditPass ? 'Vault R/W' : 'Vault R',
      active: hasPasswords, color: canEditPass ? COLORS.amber : COLORS.teal, icon: KeyRound },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {badges.map((b, idx) => {
        const Icon = b.icon;
        return (
          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border"
            style={b.active
              ? { background: `${b.color}12`, color: b.color, borderColor: `${b.color}30` }
              : { background: 'transparent', color: '#94a3b8', borderColor: '#e2e8f0' }}>
            <Icon className="h-2.5 w-2.5" />{b.label}
          </span>
        );
      })}
    </div>
  );
};

// ── Pending User Card (Dashboard style) ──────────────────────────────────────
const PendingUserCard = ({ userData, onApprove, onReject, approving }) => (
  <motion.div variants={itemVariants} layout={false}
    whileHover={{ y: -3, transition: springPhysics.lift }}
    className="group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-amber-200 dark:border-amber-800 shadow-sm hover:shadow-md transition-all">
    <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.amber}, #f97316)` }} />
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-xl overflow-hidden ring-1 ring-amber-200 dark:ring-amber-800">
            {userData.profile_picture
              ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" loading="lazy" />
              : <div className="w-full h-full flex items-center justify-center text-white text-lg font-black"
                  style={{ background: `linear-gradient(135deg, ${COLORS.amber}, #f97316)` }}>
                  {userData.full_name?.charAt(0)?.toUpperCase()}
                </div>}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 bg-amber-100 dark:bg-amber-900 rounded-full p-0.5 border border-white dark:border-slate-800">
            <Clock className="h-2.5 w-2.5 text-amber-600" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{userData.full_name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{userData.email}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 capitalize">{userData.role}</span>
            <StatusBadge status={userData.status} />
          </div>
        </div>
      </div>
      {(userData.departments || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">{userData.departments.map(d => <DeptPill key={d} dept={d} />)}</div>
      )}
      <div className="mt-3 space-y-1 text-xs text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{userData.phone || '—'}</div>
        <div className="flex items-center gap-2"><Calendar className="h-3 w-3" />Registered {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}</div>
      </div>
      <div className="flex gap-2 mt-4">
        <motion.button whileTap={{ scale: 0.95, transition: springPhysics.button }}
          onClick={() => onApprove(userData)} disabled={approving === userData.id}
          className="flex-1 h-8 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}>
          <UserCheck className="h-3 w-3" />{approving === userData.id ? 'Approving…' : 'Approve'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.95, transition: springPhysics.button }}
          onClick={() => onReject(userData)} disabled={approving === userData.id}
          className="flex-1 h-8 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-1.5 transition-all">
          <UserX className="h-3 w-3" />Reject
        </motion.button>
      </div>
    </div>
  </motion.div>
);

// ── User Card (Dashboard style) ───────────────────────────────────────────────
const UserCard = React.memo(({ userData, onEdit, onDelete, onPermissions, onApprove, onReject, currentUserId, isAdmin, canEditUsers, canManagePermissions, approving }) => {
  const [hovered, setHovered] = useState(false);
  const isPending = userData.status === 'pending_approval';
  const roleCfg = ROLE_CONFIG[userData.role?.toLowerCase()] || ROLE_CONFIG.staff;
  const RoleIcon = roleCfg.icon;
  const permCount = useMemo(() =>
    userData.permissions ? Object.entries(userData.permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length : 0,
    [userData.permissions]);
  return (
    <motion.div variants={itemVariants} layout={false}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      whileHover={{ y: -3, transition: springPhysics.lift }}
      className={`group relative bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border shadow-sm hover:shadow-md transition-all ${
        isPending ? 'border-amber-200 dark:border-amber-800' : 'border-slate-200/80 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
      }`}>
      <div className="h-1 w-full" style={{ background: roleCfg.gradient }} />
      <AnimatePresence>
        {hovered && !isPending && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute top-3 right-3 flex gap-1.5 z-20">
            {canManagePermissions && userData.role !== 'admin' && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => onPermissions(userData)}
                className="w-7 h-7 bg-emerald-50 dark:bg-emerald-900/40 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center border border-emerald-100 dark:border-emerald-800 transition-all" title="Manage Permissions">
                <Shield className="h-3.5 w-3.5" />
              </motion.button>
            )}
            {(isAdmin || (canEditUsers && !isPending)) && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => onEdit(userData)}
                className="w-7 h-7 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center border border-blue-100 dark:border-blue-800 transition-all" title="Edit User">
                <Pencil className="h-3.5 w-3.5" />
              </motion.button>
            )}
            {(isAdmin || canEditUsers) && userData.id !== currentUserId && (
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => onDelete(userData.id)}
                className="w-7 h-7 bg-red-50 dark:bg-red-900/40 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-lg flex items-center justify-center border border-red-100 dark:border-red-800 transition-all" title="Delete User">
                <Trash2 className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-xl overflow-hidden ring-1 ring-slate-100 dark:ring-slate-700">
              {userData.profile_picture
                ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-white text-xl font-black"
                    style={{ background: roleCfg.gradient }}>
                    {userData.full_name?.charAt(0)?.toUpperCase()}
                  </div>}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-lg flex items-center justify-center ring-2 ring-white dark:ring-slate-800"
              style={{ background: roleCfg.gradient }}>
              <RoleIcon className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white truncate">{userData.full_name}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                style={{ background: roleCfg.gradient }}>
                <RoleIcon className="h-2.5 w-2.5" />{roleCfg.label}
              </span>
              <StatusBadge status={userData.status} isActive={userData.is_active} />
            </div>
          </div>
        </div>
        {(userData.departments || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">{userData.departments.map(d => <DeptPill key={d} dept={d} />)}</div>
        )}
        <ModuleAccessBadges userData={userData} />
        <div className="mt-3 space-y-1.5 text-xs text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-2 truncate"><Mail className="h-3 w-3 flex-shrink-0" /><span className="truncate">{userData.email}</span></div>
          <div className="flex items-center gap-2"><Phone className="h-3 w-3 flex-shrink-0" />{userData.phone || '—'}</div>
          {(userData.punch_in_time || userData.punch_out_time) && (
            <div className="flex items-center gap-2"><Clock className="h-3 w-3 flex-shrink-0" />{userData.punch_in_time || '—'} → {userData.punch_out_time || '—'}</div>
          )}
          <div className="flex items-center gap-2"><Calendar className="h-3 w-3 flex-shrink-0" />Joined {userData.created_at ? format(new Date(userData.created_at), 'dd MMM yyyy') : 'N/A'}</div>
        </div>
        {userData.role !== 'admin' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Permissions</span>
            <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: `${COLORS.emeraldGreen}12`, color: COLORS.emeraldGreen }}>
              <ShieldCheck className="h-3 w-3" />{permCount} active
            </div>
          </div>
        )}
        {isPending && isAdmin && (
          <div className="flex gap-2 mt-3">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => onApprove(userData)} disabled={approving === userData.id}
              className="flex-1 h-8 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}>
              <UserCheck className="h-3 w-3" />Approve
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => onReject(userData)} disabled={approving === userData.id}
              className="flex-1 h-8 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-1.5 transition-all">
              <UserX className="h-3 w-3" />Reject
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
});

// ── Permission Toggle Row ─────────────────────────────────────────────────────
const PermToggleRow = ({ permKey, label, desc, icon: Icon, permissions, setPermissions }) => {
  const isOn = !!permissions[permKey];
  return (
    <div className={`flex items-center justify-between px-3 py-3 rounded-xl border transition-all ${
      isOn ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
           : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      <div className="flex items-center gap-3 pr-4 flex-1 min-w-0">
        {Icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            isOn ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}><Icon className="h-3.5 w-3.5" /></div>
        )}
        <div className="min-w-0">
          <p className={`font-semibold text-sm ${isOn ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-200'}`}>{label}</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>
        </div>
      </div>
      <Switch checked={isOn} onCheckedChange={val => setPermissions(prev => ({ ...prev, [permKey]: val }))} />
    </div>
  );
};

// ── Module Access Card ────────────────────────────────────────────────────────
const ModuleAccessCard = ({ icon: Icon, title, desc, permKey, permissions, setPermissions, accentColor, badge }) => {
  const isEnabled = !!permissions[permKey];
  const accent = accentColor || COLORS.mediumBlue;
  return (
    <motion.div whileHover={{ y: -2, transition: springPhysics.lift }} whileTap={{ scale: 0.99 }}
      onClick={() => setPermissions(p => ({ ...p, [permKey]: !p[permKey] }))}
      className="flex gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md"
      style={isEnabled ? { borderColor: `${accent}40`, background: `${accent}08` } : { borderColor: '#e2e8f0' }}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isEnabled ? 'text-white shadow' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}
        style={isEnabled ? { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` } : {}}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <p className={`font-semibold text-sm ${isEnabled ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{title}</p>
          {badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500">{badge}</span>}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black transition-all flex-shrink-0 mt-0.5 ${isEnabled ? 'bg-emerald-500 text-white shadow' : 'bg-slate-100 dark:bg-slate-700 text-slate-300'}`}>
        {isEnabled ? '✓' : '✕'}
      </div>
    </motion.div>
  );
};

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, count, color }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
      <Icon className="h-4 w-4" style={{ color }} />
    </div>
    <p className="font-bold text-base tracking-tight text-slate-900 dark:text-white">{title}</p>
    {count !== undefined && (
      <div className="ml-auto text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: `${color}15`, color }}>
        {count} enabled
      </div>
    )}
  </div>
);

// ── Permission Matrix Summary ─────────────────────────────────────────────────
const PermissionMatrixSummary = ({ permissions }) => {
  const allPerms = [...GLOBAL_PERMS, ...OPS_PERMS, ...EDIT_PERMS];
  const granted = allPerms.filter(p => permissions[p.key]).length;
  const total = allPerms.length;
  const pct = Math.round((granted / total) * 100);
  return (
    <div className="flex gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700"
      style={{ background: 'linear-gradient(135deg, rgba(13,59,102,0.04), rgba(31,111,178,0.04))' }}>
      <div className="relative w-16 h-16 flex-shrink-0">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle cx="24" cy="24" r="20" fill="none" stroke={COLORS.emeraldGreen} strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-black text-lg text-slate-700 dark:text-slate-100">{pct}%</div>
      </div>
      <div className="flex-1">
        <p className="font-bold text-base tracking-tight text-slate-800 dark:text-white">Permission Coverage</p>
        <p className="text-xs text-slate-400 mt-1">{granted} of {total} permissions enabled</p>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }} />
        </div>
      </div>
    </div>
  );
};

// ── Permission Tabs ───────────────────────────────────────────────────────────
const permTabs = [
  { id: 'modules', label: 'Modules', icon: Zap },
  { id: 'view', label: 'View', icon: Eye },
  { id: 'ops', label: 'Operations', icon: Settings },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'cross', label: 'Cross-User', icon: UsersIcon },
  { id: 'clients', label: 'Clients', icon: Briefcase },
];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN USERS COMPONENT
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
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [activePermTab, setActivePermTab] = useState('modules');
  const [formData, setFormData] = useState({
    full_name: '', email: '', password: '', role: 'staff',
    departments: [], phone: '', birthday: '', profile_picture: '',
    punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
    telegram_id: '', is_active: true, status: 'active',
  });
  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });

  // ── Debounce search input ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (canViewUserPage) { fetchUsers(); fetchClients(); }
  }, [canViewUserPage]);

  const fetchUsers = useCallback(async () => {
    try {
      const cached = sessionStorage.getItem('users');

      if (cached) {
        setUsers(JSON.parse(cached));
      }

      const res = await api.get('/users?page=1&limit=50');
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (raw?.data || []);

      setUsers(data);
      sessionStorage.setItem('users', JSON.stringify(data));

    } catch {
      toast.error('Failed to fetch users');
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await api.get('/clients');
      const raw = res.data;
      setClients(Array.isArray(raw) ? raw : (raw?.data || []));
    } catch {}
  }, []);

  const fetchPermissions = useCallback(async (userId) => {
    try {
      const res = await api.get(`/users/${userId}/permissions`);
      setPermissions({ ...EMPTY_PERMISSIONS, ...(res.data || {}) });
    } catch {
      toast.error('Using default permission template');
      setPermissions({ ...EMPTY_PERMISSIONS });
    }
  }, []);

  const handleInput = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, [name]: value }));
  }, []);

  const handleRoleChange = useCallback((newRole) => {
    setFormData(p => ({ ...p, role: newRole }));
  }, []);

  const toggleDept = useCallback((dept) => {
    setFormData(p => ({
      ...p,
      departments: p.departments.includes(dept)
        ? p.departments.filter(d => d !== dept)
        : [...p.departments, dept],
    }));
  }, []);

  const handlePhoto = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData(p => ({ ...p, profile_picture: reader.result }));
    reader.readAsDataURL(file);
  }, []);

  const handleEdit = useCallback((userData) => {
    setSelectedUser(userData);
    setFormData({
      full_name: userData.full_name || '',
      email: userData.email || '',
      password: '',
      role: userData.role || 'staff',
      departments: userData.departments || [],
      phone: userData.phone || '',
      birthday: userData.birthday && userData.birthday !== '' ? format(new Date(userData.birthday), 'yyyy-MM-dd') : '',
      profile_picture: userData.profile_picture || '',
      punch_in_time: userData.punch_in_time || '10:30',
      grace_time: userData.grace_time || '00:10',
      punch_out_time: userData.punch_out_time || '19:00',
      telegram_id: userData.telegram_id != null ? String(userData.telegram_id) : '',
      is_active: userData.is_active !== false,
      status: userData.status || 'active',
    });
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!selectedUser && !formData.email.trim()) { toast.error('Email is required'); return; }
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
          ...(isAdmin && { email: formData.email.trim(), role: formData.role, status: formData.status, departments: formData.departments }),
          ...(isAdmin && formData.password.trim() && { password: formData.password.trim() }),
        };
        await api.put(`/users/${selectedUser.id}`, payload);
        if (selectedUser.id === user?.id) await refreshUser();
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
          punch_out_time:formData.punch_out_time,
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
    } finally { setLoading(false); }
  }, [selectedUser, formData, isAdmin, user?.id, refreshUser, fetchUsers]);

  const handleDelete = useCallback(async (id) => {
    if (!isAdmin && !canEditUsers) { toast.error('No permission to delete users'); return; }
    if (id === user?.id) { toast.error('You cannot delete your own account'); return; }
    if (!window.confirm('Permanently delete this user and all their data?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User removed');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete user'); }
  }, [isAdmin, canEditUsers, user?.id, fetchUsers]);

  const openPermissionsDialog = useCallback(async (userData) => {
    setSelectedUserForPerms(userData);
    setActivePermTab('modules');
    await fetchPermissions(userData.id);
    setPermDialogOpen(true);
  }, [fetchPermissions]);

  const handleSavePermissions = useCallback(async () => {
    if (!canManagePermissions) { toast.error('Only administrators can update permissions'); return; }
    setLoading(true);
    try {
      const ensureArray = v => (Array.isArray(v) ? v : []);
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
      await api.put(`/users/${selectedUserForPerms?.id}/permissions`, payload);
      if (selectedUserForPerms?.id === user?.id) await refreshUser();
      toast.success('✓ Permissions saved');
      setPermDialogOpen(false);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update permissions'); }
    finally { setLoading(false); }
  }, [canManagePermissions, permissions, selectedUserForPerms?.id, user?.id, refreshUser, fetchUsers]);

  const resetPermissionsToRole = useCallback((role) => {
    setPermissions({ ...(DEFAULT_ROLE_PERMISSIONS[role] || EMPTY_PERMISSIONS) });
    toast.info(`Reset to ${role} defaults — click Save to apply`);
  }, []);

  const handleApprove = useCallback(async (userData) => {
    if (!isAdmin) { toast.error('Only admins can approve users'); return; }
    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/approve`);
      toast.success(`✓ ${userData.full_name} approved`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to approve'); }
    finally { setApprovingId(null); }
  }, [isAdmin, fetchUsers]);

  const handleReject = useCallback(async (userData) => {
    if (!isAdmin) { toast.error('Only admins can reject users'); return; }
    if (!window.confirm(`Reject ${userData.full_name}?`)) return;
    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/reject`);
      toast.success(`${userData.full_name} rejected`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to reject'); }
    finally { setApprovingId(null); }
  }, [isAdmin, fetchUsers]);

  const pendingUsers = useMemo(() => users.filter(u => u.status === 'pending_approval'), [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = searchQuery.toLowerCase();
      const match = (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      if (activeTab === 'pending') return match && u.status === 'pending_approval';
      if (activeTab === 'rejected') return match && u.status === 'rejected';
      if (activeTab === 'all') return match;
      return match && u.role?.toLowerCase() === activeTab;
    });
  }, [users, searchQuery, activeTab]);

  const stats = useMemo(() => [
    { label: 'Total Members', value: users.length, icon: UsersIcon, color: COLORS.mediumBlue },
    { label: 'Admins', value: users.filter(u => u.role === 'admin').length, icon: Crown, color: COLORS.indigo },
    { label: 'Pending', value: pendingUsers.length, icon: Clock, color: COLORS.amber },
    { label: 'Active', value: users.filter(u => u.is_active).length, icon: CheckCircle, color: COLORS.emeraldGreen },
    { label: 'Managers', value: users.filter(u => u.role === 'manager').length, icon: Briefcase, color: COLORS.teal },
  ], [users, pendingUsers.length]);

  if (!canViewUserPage) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: `${COLORS.coral}15` }}>
            <ShieldOff className="h-10 w-10" style={{ color: COLORS.coral }} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You need the <span className="font-semibold">View User Directory</span> permission to access this page.
          </p>
        </motion.div>
      </div>
    );
  }

  // Virtualized Row renderer (keeps all original animations + hover states)
  const Row = ({ index, style }) => {
    const userData = filteredUsers[index];
    if (!userData) return null;
    return (
      <div style={style}>
        <motion.div variants={itemVariants}>
          <UserCard
            userData={userData}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPermissions={openPermissionsDialog}
            onApprove={handleApprove}
            onReject={handleReject}
            currentUserId={user?.id || ''}
            isAdmin={isAdmin}
            canEditUsers={canEditUsers}
            canManagePermissions={canManagePermissions}
            approving={approvingId}
          />
        </motion.div>
      </div>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      {/* ── Welcome Banner (Dashboard pattern) ─────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: `0 8px 32px rgba(13,59,102,0.28)` }}>
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute right-24 bottom-0 w-32 h-32 rounded-full mb-[-30px] opacity-5" style={{ background: 'white' }} />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <UsersIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-0.5">Team Management</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">User Directory</h1>
                <p className="text-white/60 text-sm mt-0.5">Manage team members, roles and permissions</p>
              </div>
            </div>
            {isAdmin && (
              <motion.button whileHover={{ scale: 1.03, y: -2, transition: springPhysics.card }}
                whileTap={{ scale: 0.97, transition: springPhysics.tap }}
                onClick={() => {
                  setSelectedUser(null);
                  setFormData({ full_name: '', email: '', password: '', role: 'staff', departments: [], phone: '', birthday: '', profile_picture: '', punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00', telegram_id: '', is_active: true, status: 'active' });
                  setDialogOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', color: 'white' }}>
                <Plus className="h-4 w-4" />Add Member
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Key Metrics (Dashboard metric card pattern) ─────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" variants={itemVariants}>
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i} whileHover={{ y: -3, transition: springPhysics.card }} whileTap={{ scale: 0.985 }}
              className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-default group">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                    <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: s.color }}>{s.value}</p>
                  </div>
                  <div className="p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ backgroundColor: `${s.color}12` }}>
                    <Icon className="h-4 w-4" style={{ color: s.color }} />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Pending Approvals ──────────────────────────────────────────────── */}
      {pendingUsers.length > 0 && isAdmin && (
        <motion.div variants={itemVariants}>
          <SectionCard>
            <CardHeaderRow
              iconBg="bg-amber-50 dark:bg-amber-900/30"
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              title="Pending Approvals"
              subtitle={`${pendingUsers.length} awaiting review`}
              badge={pendingUsers.length}
            />
            <div className="p-3">
              <motion.div variants={containerVariants} initial={false} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pendingUsers.map(userData => (
                  <PendingUserCard key={userData.id} userData={userData}
                    onApprove={handleApprove} onReject={handleReject} approving={approvingId} />
                ))}
              </motion.div>
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* ── Tabs + Search + Grid ───────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <SectionCard>
          <CardHeaderRow
            iconBg="bg-blue-50 dark:bg-blue-900/30"
            icon={<UsersIcon className="h-4 w-4 text-blue-500" />}
            title="Team Members"
            subtitle="All roles and departments"
            badge={filteredUsers.length}
            action={
              isAdmin && (
                <Button size="sm" className="h-7 px-3 rounded-xl text-xs font-semibold text-white gap-1.5"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                  onClick={() => {
                    setSelectedUser(null);
                    setFormData({ full_name: '', email: '', password: '', role: 'staff', departments: [], phone: '', birthday: '', profile_picture: '', punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00', telegram_id: '', is_active: true, status: 'active' });
                    setDialogOpen(true);
                  }}>
                  <Plus className="h-3 w-3" />Add
                </Button>
              )
            }
          />
          <div className="p-3 space-y-3">
            {/* Tab navigation */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'admin', label: 'Admins' },
                { id: 'manager', label: 'Managers' },
                { id: 'staff', label: 'Staff' },
                { id: 'rejected', label: 'Rejected' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap ${
                    activeTab === tab.id ? 'text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                  style={activeTab === tab.id ? { background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` } : {}}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search (debounced) */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search by name or email…" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 h-9 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:focus:ring-blue-900/40" />
            </div>

            {/* Virtualized Users List */}
            {filteredUsers.length === 0
              ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: `${COLORS.mediumBlue}10` }}>
                    <UsersIcon className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">No users found</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Try adjusting your search or filter</p>
                </div>
              )
              : (
                <List
                  height={600}
                  itemCount={filteredUsers.length}
                  itemSize={200}
                  width="100%"
                >
                  {Row}
                </List>
              )}
          </div>
        </SectionCard>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════════
          CREATE / EDIT DIALOG
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-0 border-0 shadow-2xl">
          {/* Dialog header banner */}
          <div className="sticky top-0 z-10 rounded-t-2xl overflow-hidden">
            <div className="px-6 py-5 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
                style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    {selectedUser ? <Pencil className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4 text-white" />}
                  </div>
                  <div>
                    <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
                      {selectedUser ? 'Edit Member' : 'New Member'}
                    </p>
                    <h2 className="text-base font-bold text-white">
                      {selectedUser ? selectedUser.full_name : 'Add Team Member'}
                    </h2>
                  </div>
                </div>
                <button onClick={() => setDialogOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all active:scale-90">
                  <XCircle className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6 bg-white dark:bg-slate-900">
            {/* Profile Photo */}
            <div className="flex justify-center">
              <label className="relative group cursor-pointer">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 shadow-md">
                  {formData.profile_picture
                    ? <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <UserIcon className="h-10 w-10 text-slate-300" />
                      </div>}
                </div>
                <div className="absolute bottom-0.5 right-0.5 bg-white dark:bg-slate-700 rounded-lg p-1.5 shadow border border-slate-200 dark:border-slate-600">
                  <Camera className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            </div>
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Full Name</label>
                <input name="full_name" value={formData.full_name} onChange={handleInput} placeholder="Full Name"
                  className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Email Address</label>
                <input type="email" name="email" value={formData.email} onChange={handleInput}
                  disabled={!isAdmin || (selectedUser && selectedUser.id === user?.id)}
                  placeholder="name@company.com"
                  className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 disabled:opacity-60" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Phone Number</label>
                <input name="phone" value={formData.phone} onChange={handleInput} placeholder="+91 98765 43210"
                  className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3" />{selectedUser ? 'New Password' : 'Initial Password'}
                </label>
                <input type="password" name="password" value={formData.password} onChange={handleInput}
                  placeholder={selectedUser ? 'Leave blank to keep current' : 'Secure password'}
                  className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
              </div>
            </div>
            {/* Shift Schedule */}
            <div className="rounded-xl p-4 border border-blue-100 dark:border-blue-900"
              style={{ background: 'linear-gradient(135deg, rgba(31,111,178,0.04), rgba(13,59,102,0.04))' }}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Work Shift Schedule</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[{ label: 'Punch In', name: 'punch_in_time' }, { label: 'Grace Period', name: 'grace_time' }, { label: 'Punch Out', name: 'punch_out_time' }].map(f => (
                  <div key={f.name}>
                    <label className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1 block">{f.label}</label>
                    <input type="time" name={f.name} value={formData[f.name]} onChange={handleInput}
                      className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" />
                  </div>
                ))}
              </div>
            </div>
            {/* Birthday + Telegram */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Birthday</label>
                <input type="date" name="birthday" value={formData.birthday} onChange={handleInput}
                  className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Telegram ID</label>
                <input type="number" name="telegram_id" value={formData.telegram_id} onChange={handleInput} placeholder="123456789"
                  className="w-full h-9 px-3 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
              </div>
            </div>
            {/* Admin Only Fields */}
            {isAdmin && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Role</label>
                    <Select value={formData.role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="h-9 rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
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
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Account Status</label>
                    <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v, is_active: v === 'active' }))}>
                      <SelectTrigger className="h-9 rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">Assigned Departments</label>
                  <div className="flex flex-wrap gap-2">
                    {DEPARTMENTS.map(dept => {
                      const active = formData.departments.includes(dept.value);
                      return (
                        <motion.button key={dept.value} type="button" onClick={() => toggleDept(dept.value)}
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96, transition: springPhysics.tap }}
                          className="h-8 px-3 rounded-xl text-xs font-bold border-2 transition-all"
                          style={active ? { background: dept.color, color: 'white', borderColor: 'transparent' }
                                        : { borderColor: '#e2e8f0', color: dept.color, background: dept.bg }}>
                          {dept.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          {/* Dialog Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
            <button onClick={() => setDialogOpen(false)}
              className="h-9 px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
              Cancel
            </button>
            <motion.button onClick={handleSubmit} disabled={loading}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97, transition: springPhysics.button }}
              className="h-9 px-5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}>
              {loading ? 'Saving…' : selectedUser ? 'Save Changes' : 'Create Member'}
            </motion.button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          PERMISSIONS DIALOG
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-0 border-0 shadow-2xl">
          {/* Permissions dialog banner */}
          <div className="sticky top-0 z-10 rounded-t-2xl overflow-hidden">
            <div className="px-6 py-5 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
                style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">Permissions</p>
                    <h2 className="text-base font-bold text-white">{selectedUserForPerms?.full_name}</h2>
                  </div>
                </div>
                <button onClick={() => setPermDialogOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all active:scale-90">
                  <XCircle className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5 bg-white dark:bg-slate-900">
            {/* Permission summary */}
            <PermissionMatrixSummary permissions={permissions} />
            {/* Quick Reset Buttons */}
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 self-center mr-1">Templates:</span>
              {['staff', 'manager', 'admin'].map(role => (
                <motion.button key={role} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                  onClick={() => resetPermissionsToRole(role)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all capitalize">
                  {role}
                </motion.button>
              ))}
            </div>
            {/* Permission Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {permTabs.map(tab => {
                const TabIcon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActivePermTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      activePermTab === tab.id ? 'text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                    style={activePermTab === tab.id ? { background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` } : {}}>
                    <TabIcon className="h-3.5 w-3.5" />{tab.label}
                  </button>
                );
              })}
            </div>
            {/* ── Modules Tab ─────────────────────────────────────────────── */}
            {activePermTab === 'modules' && (
              <div className="space-y-4">
                <SectionHeader icon={Zap} title="Module Access" color={COLORS.violet} />
                <div className="space-y-2">
                  <ModuleAccessCard icon={Target} title="Leads Pipeline" desc="Access and manage the leads dashboard"
                    permKey="can_view_all_leads" permissions={permissions} setPermissions={setPermissions} accentColor={COLORS.mediumBlue} />
                  <ModuleAccessCard icon={Receipt} title="Quotations" desc="Create and manage quotations"
                    permKey="can_create_quotations" permissions={permissions} setPermissions={setPermissions} accentColor={COLORS.violet} />
                  <ModuleAccessCard icon={KeyRound} title="Password Vault" desc="Access secure password storage"
                    permKey="can_view_passwords" permissions={permissions} setPermissions={setPermissions} accentColor={COLORS.amber}
                    badge={permissions.can_edit_passwords ? 'Read/Write' : 'Read Only'} />
                </div>
              </div>
            )}
            {/* ── View Tab ────────────────────────────────────────────────── */}
            {activePermTab === 'view' && (
              <div>
                <SectionHeader icon={Eye} title="View Permissions" color={COLORS.mediumBlue}
                  count={GLOBAL_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">
                  {GLOBAL_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </div>
              </div>
            )}
            {/* ── Operations Tab ──────────────────────────────────────────── */}
            {activePermTab === 'ops' && (
              <div>
                <SectionHeader icon={Settings} title="Operational Controls" color={COLORS.violet}
                  count={OPS_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">
                  {OPS_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </div>
              </div>
            )}
            {/* ── Edit Tab ────────────────────────────────────────────────── */}
            {activePermTab === 'edit' && (
              <div>
                <SectionHeader icon={Pencil} title="Modification Rights" color={COLORS.amber}
                  count={EDIT_PERMS.filter(p => permissions[p.key]).length} />
                <div className="space-y-2">
                  {EDIT_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc} icon={p.icon}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </div>
              </div>
            )}
            {/* ── Cross-User Tab ──────────────────────────────────────────── */}
            {activePermTab === 'cross' && (
              <div className="space-y-5">
                <SectionHeader icon={UsersIcon} title="Cross-User Data Access" color={COLORS.emeraldGreen} />
                <p className="text-xs text-slate-400 -mt-3">Select team members whose data this user can view</p>
                {[
                  { key: 'view_other_tasks', label: 'Tasks', icon: Layers, color: COLORS.mediumBlue },
                  { key: 'view_other_attendance', label: 'Attendance', icon: Clock, color: COLORS.violet },
                  { key: 'view_other_reports', label: 'Reports', icon: BarChart2, color: COLORS.amber },
                  { key: 'view_other_todos', label: 'Todos', icon: CheckCircle,color: COLORS.emeraldGreen},
                  { key: 'view_other_activity', label: 'Activity', icon: Activity, color: COLORS.coral },
                ].map(section => {
                  const SIcon = section.icon;
                  const selectedCount = (permissions[section.key] || []).length;
                  return (
                    <div key={section.key} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-700"
                        style={{ background: `${section.color}08` }}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${section.color}15` }}>
                            <SIcon className="h-3.5 w-3.5" style={{ color: section.color }} />
                          </div>
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{section.label}</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: `${section.color}15`, color: section.color }}>
                          {selectedCount} selected
                        </span>
                      </div>
                      <div className="p-3 flex flex-wrap gap-1.5">
                        {users.filter(u => u.id !== selectedUserForPerms?.id).map(u => {
                          const isSelected = (permissions[section.key] || []).includes(u.id);
                          return (
                            <motion.button key={u.id} whileTap={{ scale: 0.95 }}
                              onClick={() => setPermissions(prev => ({
                                ...prev,
                                [section.key]: isSelected
                                  ? (prev[section.key] || []).filter(id => id !== u.id)
                                  : [...(prev[section.key] || []), u.id],
                              }))}
                              className="px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all"
                              style={isSelected ? { background: section.color, color: 'white', borderColor: 'transparent' }
                                                : { borderColor: '#e2e8f0', color: '#64748b' }}>
                              {isSelected ? '✓ ' : ''}{u.full_name}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── Clients Tab ─────────────────────────────────────────────── */}
            {activePermTab === 'clients' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={Briefcase} title="Client Portfolio" color={COLORS.teal} />
                  {(permissions.assigned_clients || []).length > 0 && (
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => setPermissions(p => ({ ...p, assigned_clients: [] }))}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                      Clear All
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {(permissions.assigned_clients || []).length} clients assigned
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input type="text" placeholder="Search clients…" value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="w-full pl-9 pr-4 h-9 text-sm border rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
                </div>
                <div className="max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1" style={slimScroll}>
                  {clients.filter(c => (c.company_name || '').toLowerCase().includes(clientSearch.toLowerCase())).map(client => {
                    const isAssigned = (permissions.assigned_clients || []).includes(client.id);
                    return (
                      <motion.button key={client.id} whileTap={{ scale: 0.97 }}
                        onClick={() => setPermissions(prev => ({
                          ...prev,
                          assigned_clients: isAssigned
                            ? (prev.assigned_clients || []).filter(id => id !== client.id)
                            : [...(prev.assigned_clients || []), client.id],
                        }))}
                        className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm"
                        style={isAssigned
                          ? { borderColor: `${COLORS.emeraldGreen}50`, background: `${COLORS.emeraldGreen}08` }
                          : { borderColor: '#e2e8f0' }}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0`}
                          style={isAssigned ? { background: `${COLORS.emeraldGreen}20`, color: COLORS.emeraldGreen }
                                           : { background: '#f1f5f9', color: '#94a3b8' }}>
                          {isAssigned ? <CheckCircle className="h-3.5 w-3.5" /> : <Briefcase className="h-3.5 w-3.5" />}
                        </div>
                        <span className="text-xs font-medium leading-tight"
                          style={isAssigned ? { color: COLORS.emeraldGreen } : { color: '#475569' }}>
                          {client.company_name}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Permissions Dialog Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {Object.entries(permissions).filter(([k, v]) => k.startsWith('can_') && v === true).length} permissions enabled
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPermDialogOpen(false)}
                className="h-9 px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                Cancel
              </button>
              <motion.button onClick={handleSavePermissions} disabled={loading}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97, transition: springPhysics.button }}
                className="h-9 px-5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}>
                {loading ? 'Saving…' : 'Save Permissions'}
              </motion.button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
