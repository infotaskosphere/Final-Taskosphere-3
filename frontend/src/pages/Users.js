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
  AlertCircle, KeyRound, Receipt, Target, Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  emeraldGreen:'#1FAF5A',
  lightGreen:  '#5CCB5F',
};

const DEPARTMENTS = [
  { value: 'GST',   label: 'GST',   color: '#1E3A8A' },
  { value: 'IT',    label: 'IT',    color: '#374151' },
  { value: 'ACC',   label: 'ACC',   color: '#065F46' },
  { value: 'TDS',   label: 'TDS',   color: '#1F2937' },
  { value: 'ROC',   label: 'ROC',   color: '#7C2D12' },
  { value: 'TM',    label: 'TM',    color: '#0F766E' },
  { value: 'MSME',  label: 'MSME',  color: '#92400E' },
  { value: 'FEMA',  label: 'FEMA',  color: '#334155' },
  { value: 'DSC',   label: 'DSC',   color: '#3F3F46' },
  { value: 'OTHER', label: 'OTHER', color: '#475569' },
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
    can_connect_email: true, can_view_own_data: true,
    can_create_quotations: true,
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
  assigned_clients: [], view_other_tasks: [], view_other_attendance: [],
  view_other_reports: [], view_other_todos: [], view_other_activity: [],
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const DeptPill = ({ dept, size = 'sm' }) => {
  const info = DEPARTMENTS.find(d => d.value === dept);
  if (!info) return null;
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
      style={{ background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}30` }}>
      {info.label}
    </span>
  );
};

const StatusBadge = ({ status, isActive }) => {
  const resolved = status || (isActive !== false ? 'active' : 'inactive');
  const map = {
    active:           { label: 'Active',          cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
    pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700 border-amber-200',      icon: <Clock className="h-3 w-3" /> },
    rejected:         { label: 'Rejected',          cls: 'bg-red-100 text-red-700 border-red-200',            icon: <XCircle className="h-3 w-3" /> },
    inactive:         { label: 'Inactive',          cls: 'bg-slate-100 text-slate-600 border-slate-200',      icon: <AlertCircle className="h-3 w-3" /> },
  };
  const cfg = map[resolved] || map.inactive;
  return (
    <Badge className={`${cfg.cls} border font-semibold text-[10px] sm:text-xs flex items-center gap-1`}>
      {cfg.icon}{cfg.label}
    </Badge>
  );
};

const PendingUserCard = ({ userData, onApprove, onReject, approving }) => (
  <motion.div variants={itemVariants} layout
    className={`relative rounded-2xl border-2 border-amber-200 p-5 shadow-sm hover:shadow-lg transition-all ${isDark?"bg-slate-800":"bg-white"}`}>
    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-amber-400 to-orange-400" />
    <div className="flex items-start gap-4 mb-4 pt-1">
      <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 flex-shrink-0 shadow">
        {userData.profile_picture
          ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
              {userData.full_name?.charAt(0)}
            </div>}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-base font-semibold truncate ${isDark?"text-slate-100":"text-slate-900"}`}>{userData.full_name}</h3>
        <p className="text-xs text-slate-500 truncate mt-0.5">{userData.email}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge className="bg-slate-100 text-slate-600 text-[10px] font-semibold capitalize">{userData.role}</Badge>
          <StatusBadge status={userData.status} isActive={userData.is_active} />
        </div>
      </div>
    </div>
    {(userData.departments || []).length > 0 && (
      <div className="flex flex-wrap gap-1.5 mb-4">{userData.departments.map(d => <DeptPill key={d} dept={d} />)}</div>
    )}
    <div className="text-xs text-slate-500 mb-4 space-y-1">
      <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{userData.phone || 'No phone'}</p>
      <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />
        Registered {userData.created_at ? format(new Date(userData.created_at), 'MMM dd, yyyy') : 'N/A'}
      </p>
    </div>
    <div className="flex gap-2 pt-3 border-t border-amber-100">
      <Button size="sm" disabled={approving === userData.id} onClick={() => onApprove(userData)}
        className="flex-1 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs gap-1.5 shadow">
        <UserCheck className="h-3.5 w-3.5" />{approving === userData.id ? 'Approving\u2026' : 'Approve'}
      </Button>
      <Button size="sm" disabled={approving === userData.id} onClick={() => onReject(userData)}
        variant="outline" className="flex-1 h-9 rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs gap-1.5">
        <UserX className="h-3.5 w-3.5" />Reject
      </Button>
    </div>
  </motion.div>
);

// ── NEW: Module access badge shown on each user card ──────────────────────────
const ModuleAccessBadges = ({ userData }) => {
  if (userData.role === 'admin') return null;
  const hasLeads      = !!(userData.permissions?.can_view_all_leads);
  const hasQuotations = !!(userData.permissions?.can_create_quotations);
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
        hasLeads ? 'bg-blue-50 text-blue-700 border-blue-200' : (isDark?'bg-slate-700 text-slate-400 border-slate-600':'bg-slate-50 text-slate-400 border-slate-200')}`}>
        <Target className="h-2.5 w-2.5" />Leads {hasLeads ? '\u2713' : '\u2717'}
      </span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
        hasQuotations ? 'bg-purple-50 text-purple-700 border-purple-200' : (isDark?'bg-slate-700 text-slate-400 border-slate-600':'bg-slate-50 text-slate-400 border-slate-200')}`}>
        <Receipt className="h-2.5 w-2.5" />Quotations {hasQuotations ? '\u2713' : '\u2717'}
      </span>
    </div>
  );
};

const UserCard = ({ userData, onEdit, onDelete, onPermissions, onApprove, onReject,
  currentUserId, isAdmin, canEditUsers, canManagePermissions, approving }) => {
  const [showActions, setShowActions] = useState(false);
  const isPending = userData.status === 'pending_approval';
  const roleStyle = {
    admin:   { bg: 'bg-gradient-to-r from-purple-500 to-indigo-500', text: 'text-white', icon: <Crown className="h-3 w-3" /> },
    manager: { bg: 'bg-gradient-to-r from-blue-500 to-cyan-500',     text: 'text-white', icon: <Briefcase className="h-3 w-3" /> },
    staff:   { bg: 'bg-slate-100', text: 'text-slate-700',            icon: <UserIcon className="h-3 w-3" /> },
  }[userData.role?.toLowerCase()] || { bg: 'bg-slate-100', text: 'text-slate-700', icon: <UserIcon className="h-3 w-3" /> };

  return (
    <motion.div variants={itemVariants} layout
      className={`group relative rounded-2xl border p-4 sm:p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${isDark?'bg-slate-800 border-slate-700':'bg-white'} ${
        isPending ? 'border-amber-300' : 'border-slate-200 hover:border-blue-200'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {isPending && <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-amber-400 to-orange-400" />}
      <div className={`absolute top-3 right-3 flex gap-1 transition-all duration-200 ${showActions ? 'opacity-100' : 'opacity-0'}`}>
        {canManagePermissions && userData.role !== 'admin' && !isPending && (
          <button onClick={() => onPermissions(userData)}
            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors" title="Manage Permissions">
            <Shield className="h-4 w-4" />
          </button>
        )}
        {(isAdmin || (canEditUsers && !isPending)) && (
          <button onClick={() => onEdit(userData)}
            className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors" title="Edit User">
            <Edit className="h-4 w-4" />
          </button>
        )}
        {(isAdmin || canEditUsers) && userData.id !== currentUserId && (
          <button onClick={() => onDelete(userData.id)}
            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors" title="Delete User">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-start gap-3 sm:gap-4 mb-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shadow bg-slate-200 flex-shrink-0">
          {userData.profile_picture
            ? <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-white text-lg sm:text-xl font-bold"
                style={{ background: isPending ? 'linear-gradient(135deg,#f59e0b,#f97316)' : `linear-gradient(135deg,${COLORS.emeraldGreen},${COLORS.lightGreen})` }}>
                {userData.full_name?.charAt(0)}
              </div>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-base sm:text-lg font-semibold truncate ${isDark?"text-slate-100":"text-slate-900"}`}>{userData.full_name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge className={`${roleStyle.bg} ${roleStyle.text} font-medium text-[10px] sm:text-xs capitalize flex items-center gap-1`}>
              {roleStyle.icon}{userData.role}
            </Badge>
            <StatusBadge status={userData.status} isActive={userData.is_active} />
          </div>
        </div>
      </div>
      {(userData.departments || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">{userData.departments.map(d => <DeptPill key={d} dept={d} size="sm" />)}</div>
      )}
      {/* ── NEW: Module access badges ── */}
      <ModuleAccessBadges userData={userData} />
      <div className="space-y-2 text-xs sm:text-sm text-slate-600">
        <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{userData.email}</span></p>
        <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 flex-shrink-0" />{userData.phone || 'No phone'}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {userData.punch_in_time  && <p className="text-[10px] text-slate-500">In: {userData.punch_in_time}</p>}
          {userData.punch_out_time && <p className="text-[10px] text-slate-500">Out: {userData.punch_out_time}</p>}
        </div>
        <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          Joined {userData.created_at ? format(new Date(userData.created_at), 'MMM dd, yyyy') : 'N/A'}
        </p>
      </div>
      {isPending && isAdmin && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-amber-100">
          <Button size="sm" disabled={approving === userData.id} onClick={() => onApprove(userData)}
            className="flex-1 h-8 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs gap-1 shadow">
            <UserCheck className="h-3.5 w-3.5" />{approving === userData.id ? 'Approving\u2026' : 'Approve'}
          </Button>
          <Button size="sm" disabled={approving === userData.id} onClick={() => onReject(userData)}
            variant="outline" className="flex-1 h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs gap-1">
            <UserX className="h-3.5 w-3.5" />Reject
          </Button>
        </div>
      )}
    </motion.div>
  );
};

// ── Permission toggle row ─────────────────────────────────────────────────────
const PermToggleRow = ({ permKey, label, desc, permissions, setPermissions }) => (
  <div className={`flex items-center justify-between p-3 rounded-xl transition-colors ${isDark?"bg-slate-700 hover:bg-slate-600":"bg-slate-50 hover:bg-slate-100"}`}>
    <div className="pr-4">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      <p className="text-[10px] text-slate-500">{desc}</p>
    </div>
    <Switch
      checked={!!permissions[permKey]}
      onCheckedChange={(val) =>
        setPermissions(prev => ({ ...prev, [permKey]: val }))
      }
    />
  </div>
);

// ── NEW: Module access card (large toggle card for Leads / Quotations) ─────────
const ModuleAccessCard = ({ icon: Icon, title, desc, permKey, permissions, setPermissions }) => {
  const isEnabled = !!permissions[permKey];
  return (
    <div
      onClick={() => setPermissions(p => ({ ...p, [permKey]: !p[permKey] }))}
      className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 select-none ${
        isEnabled
          ? 'shadow-sm'
          : (isDark?'border-slate-600 bg-slate-700 hover:border-slate-500 hover:bg-slate-600':'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50')
      }`}
      style={isEnabled ? {
        borderColor: '#a5b4fc',
        background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)',
      } : {}}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
        isEnabled ? 'text-white' : 'text-slate-400 bg-slate-100'}`}
        style={isEnabled ? { background: `linear-gradient(135deg,${COLORS.deepBlue},${COLORS.mediumBlue})` } : {}}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${isEnabled ? (isDark?'text-slate-100':'text-slate-800') : 'text-slate-500'}`}>{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm transition-all ${
        isEnabled ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>
        {isEnabled ? '\u2713' : '\u2717'}
      </div>
    </div>
  );
};

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// MAIN COMPONENT
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
export default function Users() {
  const { user, refreshUser } = useAuth();
  const isDark = useDark();
  const isAdmin              = user?.role === 'admin';
  const perms                = user?.permissions || {};
  const canViewUserPage      = isAdmin || !!perms.can_view_user_page;
  const canEditUsers         = isAdmin || !!perms.can_manage_users;
  const canManagePermissions = isAdmin;

  const [users,   setUsers]   = useState([]);
  const [clients, setClients] = useState([]);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [activeTab,       setActiveTab]       = useState('all');
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [permDialogOpen,  setPermDialogOpen]  = useState(false);
  const [selectedUser,          setSelectedUser]          = useState(null);
  const [selectedUserForPerms,  setSelectedUserForPerms]  = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [roleChanged,  setRoleChanged]  = useState(false);

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
        toast.success('\u2713 User updated successfully');
      } else {
        await api.post('/auth/register', {
          full_name:     formData.full_name.trim(),
          email:         formData.email.trim(),
          password:      formData.password,
          role:          formData.role,
          departments:   formData.departments,
          phone:         formData.phone || null,
          birthday:      formData.birthday || null,
          punch_in_time: formData.punch_in_time,
          grace_time:    formData.grace_time,
          punch_out_time:formData.punch_out_time,
          telegram_id:   formData.telegram_id !== '' ? Number(formData.telegram_id) : null,
          is_active:     false,
          status:        'pending_approval',
        });
        toast.success('\u2713 Member registered \u2014 awaiting approval');
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
        assigned_clients:      ensureArray(permissions.assigned_clients),
        view_other_tasks:      ensureArray(permissions.view_other_tasks),
        view_other_attendance: ensureArray(permissions.view_other_attendance),
        view_other_reports:    ensureArray(permissions.view_other_reports),
        view_other_todos:      ensureArray(permissions.view_other_todos),
        view_other_activity:   ensureArray(permissions.view_other_activity),
      };
      await api.put(`/users/${selectedUserForPerms.id}/permissions`, payload);
      if (selectedUserForPerms.id === user.id) await refreshUser();
      toast.success('\u2713 Permissions updated successfully');
      setPermDialogOpen(false);
      fetchUsers(); // refresh cards so badges update immediately
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update permissions'); }
    finally { setLoading(false); }
  };

  const resetPermissionsToRole = (role) => {
    setPermissions({ ...(DEFAULT_ROLE_PERMISSIONS[role] || EMPTY_PERMISSIONS) });
    toast.info(`Reset to ${role} defaults \u2014 click "Update Permissions" to save`);
  };

  const handleApprove = async (userData) => {
    if (!isAdmin) { toast.error('Only admins can approve users'); return; }
    setApprovingId(userData.id);
    try {
      await api.post(`/users/${userData.id}/approve`);
      toast.success(`\u2713 ${userData.full_name} approved`);
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

  const pendingUsers  = users.filter(u => u.status === 'pending_approval');
  const rejectedUsers = users.filter(u => u.status === 'rejected');
  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    const match = (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    if (activeTab === 'pending')  return match && u.status === 'pending_approval';
    if (activeTab === 'rejected') return match && u.status === 'rejected';
    if (activeTab === 'all')      return match;
    return match && u.role?.toLowerCase() === activeTab;
  });

  if (!canViewUserPage) {
    return (
      <div className={`flex items-center justify-center h-screen ${isDark?"bg-[#0f172a]":"bg-slate-50"}`}>
        <Card className="p-8 text-center max-w-md shadow-lg border-red-100">
          <Shield className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className={`text-2xl font-bold ${isDark?"text-slate-100":"text-slate-800"}`}>Access Restricted</h2>
          <p className="text-slate-500 mt-2">You need the <b>View User Directory</b> permission.</p>
        </Card>
      </div>
    );
  }

  // \u2500\u2500 Permission accordion sections \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // NOTE: can_view_all_leads and can_create_quotations remain in GLOBAL_PERMS
  // so they are also accessible via the accordion for fine-grained control,
  // but the Module Access cards at the top of the dialog are the primary UI.
  const GLOBAL_PERMS = [
    { key: 'can_view_all_tasks',              label: 'Universal Task Access',        desc: 'See tasks assigned to any user/dept' },
    { key: 'can_view_all_clients',            label: 'Master Client List',           desc: 'See all company legal entities' },
    { key: 'can_view_all_dsc',                label: 'DSC Vault Access',             desc: 'View all Digital Signatures' },
    { key: 'can_view_documents',              label: 'Document Library',             desc: 'Access physical document register' },
    { key: 'can_view_all_duedates',           label: 'Compliance Roadmap',           desc: 'View all upcoming statutory due dates' },
    { key: 'can_view_reports',                label: 'Analytics Dashboard',          desc: 'View performance and system reports' },
    { key: 'can_view_todo_dashboard',         label: 'Todo Dashboard',               desc: 'Access global team todo overview' },
    { key: 'can_view_audit_logs',             label: 'System Audit Trail',           desc: 'View activity logs and record histories' },
    { key: 'can_view_all_leads',              label: 'Leads Pipeline',               desc: 'View the global leads dashboard' },
    { key: 'can_view_user_page',              label: 'User Directory',               desc: 'View team members directory' },
    { key: 'can_view_selected_users_reports', label: 'Team Reports Access',          desc: 'View reports for selected users' },
    { key: 'can_view_staff_rankings',         label: 'Staff Rankings',               desc: 'View performance leaderboard' },
    { key: 'can_view_own_data',               label: 'View Own Data',                desc: 'Access own attendance, tasks and reports' },
    { key: 'can_create_quotations',           label: 'Quotations Module',            desc: 'Create, edit, export and WhatsApp share professional quotations' },
  ];

  const OPS_PERMS = [
    { key: 'can_assign_tasks',        label: 'Task Delegation',       desc: 'Assign tasks to other staff' },
    { key: 'can_assign_clients',      label: 'Client Assignment',     desc: 'Assign and reassign staff to clients' },
    { key: 'can_manage_users',        label: 'User Governance',       desc: 'Manage other team members and roles' },
    { key: 'can_view_attendance',     label: 'Attendance Management', desc: 'Review punch timings and late reports' },
    { key: 'can_view_staff_activity', label: 'Staff Monitoring',      desc: 'View app usage and screen activity' },
    { key: 'can_send_reminders',      label: 'Automated Reminders',   desc: 'Trigger email/notification reminders' },
    { key: 'can_download_reports',    label: 'Export Data',           desc: 'Download CSV/PDF versions of reports' },
    { key: 'can_manage_settings',     label: 'System Settings',       desc: 'Modify global system configuration' },
    { key: 'can_delete_data',         label: 'Delete Records',        desc: 'Permanently delete data entries' },
    { key: 'can_delete_tasks',        label: 'Delete Tasks',          desc: 'Delete any task regardless of ownership' },
    { key: 'can_connect_email',       label: 'Connect Email Accounts',desc: 'Link personal email via IMAP for event extraction' },
  ];

  const EDIT_PERMS = [
    { key: 'can_edit_tasks',     label: 'Modify Tasks',     desc: 'Update/delete task definitions' },
    { key: 'can_edit_clients',   label: 'Modify Clients',   desc: 'Update client master data' },
    { key: 'can_edit_dsc',       label: 'Modify DSC',       desc: 'Update certificate details' },
    { key: 'can_edit_documents', label: 'Modify Documents', desc: 'Change document records' },
    { key: 'can_edit_due_dates', label: 'Modify Due Dates', desc: 'Edit statutory timelines' },
    { key: 'can_edit_users',     label: 'Modify Users',     desc: 'Update user profiles' },
  ];

  return (
    <motion.div className={`space-y-6 p-4 md:p-8 min-h-screen rounded-2xl ${isDark?"bg-[#0f172a]":""}`} initial="hidden" animate="visible" variants={containerVariants}>

      {/* \u2500\u2500 Header \u2500\u2500 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: isDark?"#93c5fd":COLORS.deepBlue }}>User Directory</h1>
          <p className={`font-medium ${isDark?"text-slate-400":"text-slate-500"}`}>
            Team administration and access control
            {pendingUsers.length > 0 && isAdmin && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                <Clock className="h-3 w-3" />{pendingUsers.length} awaiting approval
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button className="rounded-xl font-bold h-12 shadow-lg hover:scale-105 transition-all"
            style={{ background: COLORS.deepBlue }}
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
            <Plus className="h-5 w-5 mr-2" />Create New Member
          </Button>
        )}
      </div>

      {/* \u2500\u2500 Edit / Create Dialog \u2500\u2500 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>
              {selectedUser ? `Edit \u2014 ${selectedUser.full_name}` : 'Register New Member'}
            </DialogTitle>
            <DialogDescription>
              {isAdmin ? 'Admin view \u2014 all fields editable.' : 'Update profile details below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Profile picture */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-28 h-28 rounded-3xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                  {formData.profile_picture
                    ? <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    : <UserIcon className="h-14 w-14 text-slate-300" />}
                </div>
                <label htmlFor="profile-upload"
                  className={`absolute -bottom-2 -right-2 rounded-xl p-2.5 shadow-xl border cursor-pointer ${isDark?"bg-slate-700 border-slate-600 hover:bg-slate-600":"bg-white border-slate-100 hover:bg-slate-50"}`}>
                  <Camera className="h-5 w-5 text-blue-600" />
                  <input id="profile-upload" type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="font-semibold">Full Name *</Label>
                <Input name="full_name" value={formData.full_name} onChange={handleInput}
                  placeholder="e.g. Manthan Desai" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">
                  Email {isAdmin ? '*' : <span className="text-slate-400 font-normal">(read only)</span>}
                </Label>
                <Input type="email" name="email" value={formData.email} onChange={handleInput}
                  placeholder="name@firm.com" className="rounded-xl"
                  disabled={!isAdmin || (selectedUser && selectedUser.id === user.id)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="font-semibold">Phone</Label>
                <Input name="phone" value={formData.phone} onChange={handleInput}
                  placeholder="+91 00000 00000" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  {selectedUser ? 'New Password' : 'Initial Password *'}
                  {selectedUser && <span className="text-slate-400 font-normal text-xs">(blank = keep current)</span>}
                </Label>
                <Input type="password" name="password" value={formData.password} onChange={handleInput}
                  placeholder={selectedUser ? 'Leave blank to keep unchanged' : 'Set initial password'}
                  className="rounded-xl" />
              </div>
            </div>

            {/* Shift schedule */}
            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
              <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4" /> Shift Schedule
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Punch-In Time',      name: 'punch_in_time'  },
                  { label: 'Grace Period (HH:MM)', name: 'grace_time'   },
                  { label: 'Punch-Out Time',      name: 'punch_out_time' },
                ].map(f => (
                  <div key={f.name} className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600">{f.label}</Label>
                    <Input type="time" name={f.name} value={formData[f.name]}
                      onChange={handleInput} className={`rounded-lg ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white"}`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="font-semibold">Birthday</Label>
                <Input type="date" name="birthday" value={formData.birthday}
                  onChange={handleInput} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Telegram ID</Label>
                <Input type="number" name="telegram_id" value={formData.telegram_id}
                  onChange={handleInput} placeholder="Numeric Telegram ID" className="rounded-xl" />
              </div>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="font-semibold">Role</Label>
                  <Select value={formData.role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {roleChanged && selectedUser && (
                    <div className="mt-2 flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-xs text-amber-700 font-semibold flex-1">
                        Role changed to <b className="capitalize">{formData.role}</b>. Reset permissions to match?
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
                        className="text-xs font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg whitespace-nowrap">
                        Reset
                      </button>
                      <button type="button" onClick={() => setRoleChanged(false)}
                        className="text-xs text-amber-500 hover:text-amber-700 font-semibold">Keep</button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">Account Status</Label>
                  <Select value={formData.status}
                    onValueChange={v => setFormData(p => ({ ...p, status: v, is_active: v === 'active' }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
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

            {isAdmin && (
              <div className="space-y-3">
                <Label className="font-semibold">Assigned Departments</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {DEPARTMENTS.map(dept => {
                    const active = formData.departments.includes(dept.value);
                    return (
                      <button key={dept.value} type="button" onClick={() => toggleDept(dept.value)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all border-2 ${
                          active ? 'text-white border-transparent' : (isDark?'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500':'bg-white text-slate-600 border-slate-100 hover:border-slate-300'}`}
                        style={{ background: active ? dept.color : 'transparent' }}>
                        {dept.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-3 border-t pt-5">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl h-12">Discard</Button>
            <Button onClick={handleSubmit} disabled={loading} className="rounded-xl h-12 px-8 font-bold shadow-lg"
              style={{ background: COLORS.emeraldGreen }}>
              {loading ? 'Saving\u2026' : selectedUser ? 'Save Updates' : 'Create Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* \u2500\u2500 Pending banner \u2500\u2500 */}
      <AnimatePresence>
        {isAdmin && pendingUsers.length > 0 && activeTab !== 'pending' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm">
            <div className="p-2 bg-amber-100 rounded-xl"><Clock className="h-5 w-5 text-amber-600" /></div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">
                {pendingUsers.length} registration{pendingUsers.length > 1 ? 's' : ''} pending approval
              </p>
              <p className="text-xs text-amber-600">These users cannot log in until approved.</p>
            </div>
            <Button size="sm" onClick={() => setActiveTab('pending')}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs h-8 shadow">
              Review Now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* \u2500\u2500 Search + Tabs \u2500\u2500 */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input placeholder="Search by name or email\u2026"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="pl-12 h-12 rounded-2xl border-slate-200 shadow-sm" />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}
          className={`p-1 rounded-2xl border shadow-sm self-start ${isDark?"bg-slate-800 border-slate-700":"bg-white"}`}>
          <TabsList className="bg-transparent h-10 flex flex-wrap gap-0.5">
            {['all', 'admin', 'manager', 'staff'].map(t => (
              <TabsTrigger key={t} value={t} className="rounded-xl font-bold px-4 capitalize">
                {t === 'all' ? 'All' : t + 's'}
              </TabsTrigger>
            ))}
            {isAdmin && (
              <TabsTrigger value="pending" className="rounded-xl font-bold px-3 relative">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />Pending
                  {pendingUsers.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
                      {pendingUsers.length}
                    </span>
                  )}
                </span>
              </TabsTrigger>
            )}
            {isAdmin && rejectedUsers.length > 0 && (
              <TabsTrigger value="rejected" className="rounded-xl font-bold px-3">
                <span className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-red-400" />Rejected
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>

      {/* \u2500\u2500 Pending grid \u2500\u2500 */}
      {activeTab === 'pending' && isAdmin && (
        filteredUsers.length === 0
          ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-24 text-center">
              <CheckCircle className="h-16 w-16 text-emerald-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-400">No pending approvals</h3>
            </motion.div>
          : <motion.div variants={containerVariants} initial="hidden" animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredUsers.map(u => (
                <PendingUserCard key={u.id} userData={u}
                  onApprove={handleApprove} onReject={handleReject} approving={approvingId} />
              ))}
            </motion.div>
      )}

      {/* \u2500\u2500 Main grid \u2500\u2500 */}
      {activeTab !== 'pending' && (
        <motion.div variants={containerVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredUsers.length === 0
            ? <div className="col-span-full py-24 text-center">
                <UsersIcon className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                <h3 className={`text-xl font-bold ${isDark?"text-slate-500":"text-slate-400"}`}>No members found</h3>
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

      {/* \u2500\u2500 PERMISSIONS DIALOG \u2500\u2500 */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
          <div className={`sticky top-0 z-10 p-6 border-b flex items-center justify-between ${isDark?"bg-slate-800 border-slate-700":"bg-white border-b"}`}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <Shield className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>
                  Access Governance
                </DialogTitle>
                <DialogDescription>
                  Configuring <b>{selectedUserForPerms?.full_name}</b> ({selectedUserForPerms?.role})
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" className="rounded-xl" onClick={() => setPermDialogOpen(false)}>Close</Button>
          </div>

          <div className="p-6 space-y-6">
            {/* Reset strip */}
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <span className="text-sm text-amber-800 font-semibold flex-1">
                Reset all toggles to <b className="capitalize">{selectedUserForPerms?.role}</b> role defaults?
              </span>
              <button type="button"
                onClick={() => resetPermissionsToRole(selectedUserForPerms?.role || 'staff')}
                className="text-xs font-bold px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl whitespace-nowrap">
                Reset to Role Defaults
              </button>
            </div>

            {/* \u2500\u2500 NEW: Module Access \u2014 prominent section at top of dialog \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
            <div className="rounded-2xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-xl">
                  <Zap className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-indigo-900">Module Access</p>
                  <p className="text-xs text-indigo-500">Grant access to Leads and/or Quotations independently</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleAccessCard
                  icon={Target}
                  title="Lead Management"
                  desc="View the global leads pipeline, create, edit and move leads through stages."
                  permKey="can_view_all_leads"
                  permissions={permissions}
                  setPermissions={setPermissions}
                />
                <ModuleAccessCard
                  icon={Receipt}
                  title="Quotations"
                  desc="Create, edit, export and WhatsApp-share professional quotations."
                  permKey="can_create_quotations"
                  permissions={permissions}
                  setPermissions={setPermissions}
                />
              </div>
              {permissions.can_view_all_leads && permissions.can_create_quotations && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  Both modules enabled \u2014 \u201cCreate Quotation\u201d button appears on lead cards, and quotations auto-link to leads.
                </div>
              )}
            </div>

            <Accordion type="multiple" defaultValue={['global']} className="w-full space-y-4">

              {/* \u2500\u2500 Global Visibility (includes Leads Pipeline + Quotations Module as toggles too) \u2500\u2500 */}
              <AccordionItem value="global" className="border rounded-2xl px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-blue-500" />Global Visibility
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-2">
                  {GLOBAL_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </AccordionContent>
              </AccordionItem>

              {/* \u2500\u2500 Operational Powers \u2500\u2500 */}
              <AccordionItem value="ops" className="border rounded-2xl px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 text-purple-500" />Operational Powers
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-2">
                  {OPS_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </AccordionContent>
              </AccordionItem>

              {/* \u2500\u2500 Edit & Modification \u2500\u2500 */}
              <AccordionItem value="edits" className="border rounded-2xl px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <Edit className="h-5 w-5 text-orange-500" />Edit & Modification
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-2">
                  {EDIT_PERMS.map(p => (
                    <PermToggleRow key={p.key} permKey={p.key} label={p.label} desc={p.desc}
                      permissions={permissions} setPermissions={setPermissions} />
                  ))}
                </AccordionContent>
              </AccordionItem>

              {/* \u2500\u2500 Cross-User Visibility \u2500\u2500 */}
              <AccordionItem value="cross" className="border rounded-2xl px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <UsersIcon className="h-5 w-5 text-emerald-500" />Cross-User Visibility
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-6">
                  {[
                    { key: 'view_other_tasks',      label: 'Tasks'          },
                    { key: 'view_other_attendance', label: 'Attendance'     },
                    { key: 'view_other_reports',    label: 'Reports'        },
                    { key: 'view_other_todos',      label: 'Personal Todos' },
                    { key: 'view_other_activity',   label: 'App Activity'   },
                  ].map(section => (
                    <div key={section.key} className="space-y-2">
                      <p className="text-sm font-bold text-slate-800 px-1">Allowed {section.label} Visibility</p>
                      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-2xl min-h-[50px]">
                        {users.filter(u => u.id !== selectedUserForPerms?.id).map(u => {
                          const sectionKey = section.key;
                          const sel = permissions[sectionKey]?.includes(u.id);
                          return (
                            <Badge key={u.id}
                              onClick={() => setPermissions(prev => ({
                                ...prev,
                                [sectionKey]: sel
                                  ? prev[sectionKey].filter(id => id !== u.id)
                                  : [...(prev[sectionKey] || []), u.id],
                              }))}
                              className={`cursor-pointer px-3 py-1.5 rounded-lg border-2 transition-all ${
                                sel
                                  ? 'bg-emerald-500 border-emerald-600 text-white scale-105 shadow-md'
                                  : (isDark?'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500':'bg-white border-slate-200 text-slate-600 hover:border-slate-300')
                              }`}>
                              {u.full_name}
                            </Badge>
                          );
                        })}
                        {users.length <= 1 && (
                          <p className="text-xs text-slate-400 italic">No other users available</p>
                        )}
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>

              {/* \u2500\u2500 Assigned Portfolio \u2500\u2500 */}
              <AccordionItem value="clients" className="border rounded-2xl px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-5 w-5 text-cyan-500" />Assigned Portfolio
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Filter company list\u2026" value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)} className={`pl-10 h-10 rounded-xl ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"border-slate-200"}`} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                    {clients
                      .filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
                      .map(client => {
                        const clientId = client.id;
                        const assigned = (permissions.assigned_clients || []).includes(clientId);
                        return (
                          <div key={clientId}
                            onClick={() => setPermissions(prev => ({
                              ...prev,
                              assigned_clients: assigned
                                ? prev.assigned_clients.filter(id => id !== clientId)
                                : [...(prev.assigned_clients || []), clientId],
                            }))}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${
                              assigned
                                ? 'bg-emerald-50 border-emerald-400'
                                : (isDark?'bg-slate-700/60 border-slate-600 hover:border-slate-500':'bg-white border-slate-100 hover:border-slate-200')}`}>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                              assigned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                              {assigned ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            </div>
                            <span className="text-xs font-bold text-slate-700 truncate">{client.company_name}</span>
                          </div>
                        );
                      })}
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </div>

          <div className="sticky bottom-0 p-6 bg-slate-50 border-t flex justify-end gap-3">
            <Button variant="ghost" className="rounded-xl h-12" onClick={() => setPermDialogOpen(false)}>
              Discard
            </Button>
            <Button onClick={handleSavePermissions} disabled={loading}
              className="rounded-xl h-12 px-10 font-bold shadow-xl"
              style={{ background: COLORS.emeraldGreen }}>
              {loading ? 'Saving\u2026' : 'Update Permissions'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
