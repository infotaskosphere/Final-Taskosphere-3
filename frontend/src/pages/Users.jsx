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
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye,
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase,
  Mail, Phone, Calendar, Camera, Clock, UserCheck, UserX,
  AlertCircle, KeyRound, Receipt, Target, Zap, Lock, ChevronRight,
  Activity, BarChart2, Star, Layers, Globe, FileText, Bell,
  Hash, ArrowUpRight, SlidersHorizontal, ShieldCheck,
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
                title="Manage Access">
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

        {/* Role access indicator */}
        {userData.role !== 'admin' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium capitalize">{userData.role} access</span>
            {userData.role === 'manager' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-100 dark:border-blue-800">
                <UsersIcon className="h-2.5 w-2.5" />
                {(userData.view_other_tasks || []).length} cross-view
              </span>
            )}
            {userData.role === 'staff' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-100 dark:border-emerald-800">
                <Briefcase className="h-2.5 w-2.5" />
                {(userData.assigned_clients || []).length} clients
              </span>
            )}
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

// ── Cross-visibility user selector ────────────────────────────────────────────
const UserSelector = ({ label, icon: Icon, color, selectedIds, allUsers, currentUserId, onChange }) => {
  const count = selectedIds.length;
  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{label}</p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
          {count} selected
        </span>
      </div>
      <div className="p-3 flex flex-wrap gap-2">
        {allUsers.filter(u => u.id !== currentUserId).map(u => {
          const sel = selectedIds.includes(u.id);
          return (
            <button key={u.id} type="button"
              onClick={() => onChange(sel ? selectedIds.filter(id => id !== u.id) : [...selectedIds, u.id])}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold border-2 transition-all shadow-sm hover:shadow-md ${
                sel
                  ? 'text-white border-transparent shadow-md scale-105'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300'
              }`}
              style={sel ? { background: color } : {}}>
              {sel ? '✓ ' : ''}{u.full_name}
            </button>
          );
        })}
        {allUsers.filter(u => u.id !== currentUserId).length === 0 && (
          <p className="text-xs text-slate-400 italic p-2">No other users available</p>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Users() {
  const { user, refreshUser } = useAuth();
  const isDark               = useDark();

  // ── Role-based access control (no boolean permissions) ───────────────────
  const isAdmin   = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isStaff   = user?.role === 'staff';

  const canViewUserPage      = isAdmin;
  const canEditUsers         = isAdmin;
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

  // ── Access settings state (replaces permissions state) ───────────────────
  const [crossVisibility, setCrossVisibility] = useState({
    view_other_tasks:  [],
    view_other_todos:  [],
    view_other_visits: [],
  });
  const [assignedClients, setAssignedClients] = useState([]);

  const [formData, setFormData] = useState({
    full_name: '', email: '', password: '', role: 'staff',
    departments: [], phone: '', birthday: '', profile_picture: '',
    punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
    telegram_id: '', is_active: true, status: 'active',
  });

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
    if (!isAdmin) { toast.error('No permission to delete users'); return; }
    if (id === user.id) { toast.error('You cannot delete your own account'); return; }
    if (!window.confirm('Permanently delete this user and all their data?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User removed');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete user'); }
  };

  // ── Open access settings dialog ──────────────────────────────────────────
  const openPermissionsDialog = (userData) => {
    setSelectedUserForPerms(userData);
    setCrossVisibility({
      view_other_tasks:  userData.view_other_tasks  || [],
      view_other_todos:  userData.view_other_todos  || [],
      view_other_visits: userData.view_other_visits || [],
    });
    setAssignedClients(userData.assigned_clients || []);
    setPermDialogOpen(true);
  };

  // ── Save access settings via user update endpoint ────────────────────────
  const handleSaveAccess = async () => {
    if (!canManagePermissions) { toast.error('Only administrators can update access settings'); return; }
    setLoading(true);
    try {
      const role = selectedUserForPerms?.role;
      const payload = role === 'manager'
        ? {
            view_other_tasks:  crossVisibility.view_other_tasks,
            view_other_todos:  crossVisibility.view_other_todos,
            view_other_visits: crossVisibility.view_other_visits,
          }
        : role === 'staff'
        ? { assigned_clients: assignedClients }
        : {};

      await api.put(`/users/${selectedUserForPerms.id}`, payload);
      if (selectedUserForPerms.id === user.id) await refreshUser();
      toast.success('✓ Access settings saved');
      setPermDialogOpen(false);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update access settings'); }
    finally { setLoading(false); }
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
            You need administrator access to view this page.
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
                        Role changed to <b className="capitalize">{formData.role}</b>. Update access settings after saving.
                      </span>
                      <button type="button" onClick={() => setRoleChanged(false)}
                        className="text-[11px] text-amber-500 hover:text-amber-700 font-semibold">OK</button>
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
          ACCESS SETTINGS DIALOG — Role-based, simplified
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">

          <div className="sticky top-0 z-10 rounded-t-3xl overflow-hidden">
            <div className="h-1.5 w-full" style={{ background: GRADIENT }} />
            <div className="p-6 bg-white dark:bg-slate-900 border-b dark:border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-xl font-black" style={{ color: COLORS.deepBlue }}>
                  {selectedUserForPerms?.full_name} — Access Settings
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-1">
                  Configure data access for this team member based on their role.
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
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">
                    {selectedUserForPerms?.role} · Data Access Control
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(selectedUserForPerms?.departments || []).map(d => (
                      <DeptPill key={d} dept={d} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="p-6 bg-white dark:bg-slate-900 space-y-6">

            {/* ── ADMIN: full access message ────────────────────────────── */}
            {selectedUserForPerms?.role === 'admin' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-4 p-5 rounded-3xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Crown className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-violet-800 dark:text-violet-300">Full System Access</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 leading-relaxed">
                    Admin users have unrestricted access to all records, clients, tasks, and system settings.
                    No additional configuration is needed.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── MANAGER: cross-visibility ─────────────────────────────── */}
            {selectedUserForPerms?.role === 'manager' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${COLORS.mediumBlue}15` }}>
                    <UsersIcon className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">Cross-User Visibility</p>
                    <p className="text-xs text-slate-400 mt-0.5">Select which team members' data this manager can access.</p>
                  </div>
                </div>

                <UserSelector
                  label="Task Visibility"
                  icon={Layers}
                  color="#3B82F6"
                  selectedIds={crossVisibility.view_other_tasks}
                  allUsers={users}
                  currentUserId={selectedUserForPerms?.id}
                  onChange={ids => setCrossVisibility(p => ({ ...p, view_other_tasks: ids }))}
                />
                <UserSelector
                  label="Todo Visibility"
                  icon={CheckCircle}
                  color="#10B981"
                  selectedIds={crossVisibility.view_other_todos}
                  allUsers={users}
                  currentUserId={selectedUserForPerms?.id}
                  onChange={ids => setCrossVisibility(p => ({ ...p, view_other_todos: ids }))}
                />
                <UserSelector
                  label="Visit Visibility"
                  icon={ArrowUpRight}
                  color="#8B5CF6"
                  selectedIds={crossVisibility.view_other_visits}
                  allUsers={users}
                  currentUserId={selectedUserForPerms?.id}
                  onChange={ids => setCrossVisibility(p => ({ ...p, view_other_visits: ids }))}
                />
              </motion.div>
            )}

            {/* ── STAFF: assigned clients ───────────────────────────────── */}
            {selectedUserForPerms?.role === 'staff' && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${COLORS.teal}15` }}>
                      <Briefcase className="h-4 w-4" style={{ color: COLORS.teal }} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100">Assigned Client Portfolio</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className="font-bold text-slate-600 dark:text-slate-300">{assignedClients.length}</span> clients assigned
                      </p>
                    </div>
                  </div>
                  {assignedClients.length > 0 && (
                    <button type="button"
                      onClick={() => setAssignedClients([])}
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
                      const assigned = assignedClients.includes(client.id);
                      return (
                        <button key={client.id} type="button"
                          onClick={() => setAssignedClients(prev =>
                            assigned ? prev.filter(id => id !== client.id) : [...prev, client.id]
                          )}
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

          <DialogFooter className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700 flex items-center justify-between gap-3 rounded-b-3xl">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Shield className="h-3.5 w-3.5" />
              {selectedUserForPerms?.role === 'admin'
                ? 'Full access — no restrictions'
                : selectedUserForPerms?.role === 'manager'
                ? `${crossVisibility.view_other_tasks.length} task + ${crossVisibility.view_other_todos.length} todo + ${crossVisibility.view_other_visits.length} visit cross-access`
                : `${assignedClients.length} clients in portfolio`}
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" className="rounded-2xl h-10 px-5 text-sm" onClick={() => setPermDialogOpen(false)}>
                Discard
              </Button>
              {selectedUserForPerms?.role !== 'admin' && (
                <Button onClick={handleSaveAccess} disabled={loading}
                  className="rounded-2xl h-10 px-7 font-bold shadow-lg hover:shadow-xl text-white text-sm transition-all"
                  style={{ background: GRAD_GREEN }}>
                  {loading ? 'Saving…' : 'Save Access'}
                </Button>
              )}
            </div>
          </DialogFooter>

        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
