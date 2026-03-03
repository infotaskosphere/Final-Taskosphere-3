import React, { useState, useEffect } from 'react';
import RoleGuard from "@/RoleGuard";
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye, EyeOff,
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase,
  MoreVertical, Mail, Phone, Calendar, Camera, Cake, Download, LayoutDashboard
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  lightBlue: '#E0F2FE',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};
// Department categories with colors (Synced with backend logic)
const DEPARTMENTS = [
  { value: 'GST', label: 'GST', color: '#1E3A8A' },
  { value: 'IT', label: 'IT', color: '#374151' },
  { value: 'ACC', label: 'ACC', color: '#065F46' },
  { value: 'TDS', label: 'TDS', color: '#1F2937' },
  { value: 'ROC', label: 'ROC', color: '#7C2D12' },
  { value: 'TM', label: 'TM', color: '#0F766E' },
  { value: 'MSME', label: 'MSME', color: '#92400E' },
  { value: 'FEMA', label: 'FEMA', color: '#334155' },
  { value: 'DSC', label: 'DSC', color: '#3F3F46' },
  { value: 'OTHER', label: 'OTHER', color: '#475569' },
];
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};
const DeptPill = ({ dept, size = 'sm' }) => {
  const deptInfo = DEPARTMENTS.find(d => d.value === dept);
  if (!deptInfo) return null;
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      }`}
      style={{
        background: `${deptInfo.color}15`,
        color: deptInfo.color,
        border: `1px solid ${deptInfo.color}30`
      }}
    >
      {deptInfo.label}
    </span>
  );
};
const UserCard = ({
  userData,
  onEdit,
  onDelete,
  onPermissions,
  currentUserId,
  COLORS,
  isAdmin,
  canEditUsers,
  canManagePermissions
}) => {
  const userDepts = userData.departments || [];
  const [showActions, setShowActions] = useState(false);
  const getRoleIcon = (role) => {
    switch(role?.toLowerCase()) {
      case 'admin': return <Crown className="h-3 w-3" />;
      case 'manager': return <Briefcase className="h-3 w-3" />;
      default: return <UserIcon className="h-3 w-3" />;
    }
  };
  const getRoleStyle = (role) => {
    switch(role?.toLowerCase()) {
      case 'admin': return { bg: 'bg-gradient-to-r from-purple-500 to-indigo-500', text: 'text-white' };
      case 'manager': return { bg: 'bg-gradient-to-r from-blue-500 to-cyan-500', text: 'text-white' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700' };
    }
  };
  const roleStyle = getRoleStyle(userData.role);
  return (
    <motion.div
      variants={itemVariants}
      className="group relative bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:shadow-xl hover:border-blue-200 transition-all duration-300 hover:-translate-y-1"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`absolute top-3 right-3 flex gap-1 transition-all duration-200 ${showActions ? 'opacity-100' : 'opacity-0 sm:opacity-0'}`}>
        {canManagePermissions && userData.role !== 'admin' && (
          <button
            onClick={() => onPermissions(userData)}
            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
            title="Permissions"
          >
            <Shield className="h-4 w-4" />
          </button>
        )}
        {canEditUsers && (
          <button
            onClick={() => onEdit(userData)}
            className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
            title="Edit"
          >
            <Edit className="h-4 w-4" />
          </button>
        )}
        {canEditUsers && userData.id !== currentUserId && (
          <button
            onClick={() => onDelete(userData.id)}
            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-start gap-3 sm:gap-4 mb-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shadow bg-slate-200 flex-shrink-0">
          {userData.profile_picture ? (
            <img
              src={userData.profile_picture}
              alt={userData.full_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-lg sm:text-xl font-bold"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
            >
              {userData.full_name?.charAt(0)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-outfit font-semibold text-slate-900 truncate">
            {userData.full_name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge className={`${roleStyle.bg} ${roleStyle.text} font-medium text-[10px] sm:text-xs capitalize flex items-center gap-1`}>
              {getRoleIcon(userData.role)}
              {userData.role}
            </Badge>
            <Badge className={`${userData.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} font-medium text-[10px] sm:text-xs`}>
              {userData.is_active !== false ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </div>
      {userDepts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {userDepts.map(dept => (
            <DeptPill key={dept} dept={dept} size="sm" />
          ))}
        </div>
      )}
      <div className="space-y-2 text-xs sm:text-sm text-slate-600">
        <p className="flex items-center gap-2 truncate">
          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{userData.email}</span>
        </p>
        <p className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
          {userData.phone || 'No phone'}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {userData.punch_in_time && (
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              In: {userData.punch_in_time}
            </p>
          )}
          {userData.punch_out_time && (
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              Out: {userData.punch_out_time}
            </p>
          )}
        </div>
        <p className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          Joined {userData.created_at ? format(new Date(userData.created_at), 'MMM dd, yyyy') : 'N/A'}
        </p>
      </div>
    </motion.div>
  );
};
export default function Users() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "admin";
  const canViewUserPage = hasPermission("can_view_user_page") || isAdmin;
  const canEditUsers = hasPermission("can_edit_users") || isAdmin;
  const canManagePermissions = hasPermission("can_manage_users") || isAdmin;
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  // Form State (Synced with Backend User Model)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff',
    departments: [],
    phone: '',
    birthday: '',
    profile_picture: '',
    punch_in_time: '',
    grace_time: '',
    punch_out_time: '',
    telegram_id: null,
    is_active: true
  });
  // Permissions State (Synced with Backend UserPermissions Model)
  const [permissions, setPermissions] = useState({
    can_view_all_tasks: false,
    can_view_all_clients: false,
    can_view_all_dsc: false,
    can_view_documents: false,
    can_view_all_duedates: false,
    can_view_reports: false,
    can_manage_users: false,
    can_assign_tasks: false,
    can_view_staff_activity: false,
    can_view_attendance: false,
    can_send_reminders: false,
    assigned_clients: [],
    can_view_user_page: false,
    can_view_audit_logs: false,
    can_edit_tasks: false,
    can_edit_dsc: false,
    can_edit_documents: false,
    can_edit_due_dates: false,
    can_edit_users: false,
    can_download_reports: false,
    can_view_selected_users_reports: false,
    can_view_todo_dashboard: false,
    view_other_tasks: [],
    view_other_attendance: [],
    view_other_reports: [],
    view_other_todos: [],
    view_other_activity: [],
    can_edit_clients: false,
    can_use_chat: false,
    can_view_all_leads: false, // NEW: Control access to Leads module
    can_edit_leads: false,      // NEW: Control edit/delete of leads
  });
  const [loading, setLoading] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  useEffect(() => {
    if (canViewUserPage) {
      fetchUsers();
      fetchClients();
    }
  }, [canViewUserPage]);
  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data || []);
    } catch (error) {
      toast.error('Failed to fetch users');
    }
  };
  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data || []);
    } catch (error) {
      console.error('Failed to fetch clients');
    }
  };
  const fetchPermissions = async (userId) => {
    try {
      const response = await api.get(`/users/${userId}/permissions`);
      setPermissions(prev => ({
        ...prev,
        ...(response.data || {})
      }));
    } catch (error) {
      console.error('Failed to fetch permissions');
      toast.error("Using default permission template");
    }
  };
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  const handleDepartmentChange = (dept) => {
    setFormData(prev => ({
      ...prev,
      departments: prev.departments.includes(dept)
        ? prev.departments.filter(d => d !== dept)
        : [...prev.departments, dept]
    }));
  };
  const handleProfilePictureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profile_picture: reader.result });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Failed to process image');
    }
  };
  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (selectedUser) {
        // Only sending backend-allowed fields for updates
        const updatePayload = {
          full_name: formData.full_name,
          role: formData.role,
          departments: formData.departments,
          phone: formData.phone,
          birthday: formData.birthday,
          punch_in_time: formData.punch_in_time,
          grace_time: formData.grace_time,
          punch_out_time: formData.punch_out_time,
          is_active: formData.is_active
        };
        await api.put(`/users/${selectedUser.id}`, updatePayload);
        toast.success('User details updated');
      } else {
        await api.post('/auth/register', formData);
        toast.success('New user registered successfully');
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };
  const handleEdit = (userData) => {
    setSelectedUser(userData);
    setFormData({
      full_name: userData.full_name,
      email: userData.email,
      password: '', // Hidden for security
      role: userData.role,
      departments: userData.departments || [],
      phone: userData.phone || '',
      birthday: userData.birthday ? format(new Date(userData.birthday), 'yyyy-MM-dd') : '',
      profile_picture: userData.profile_picture || '',
      punch_in_time: userData.punch_in_time || '',
      grace_time: userData.grace_time || '',
      punch_out_time: userData.punch_out_time || '',
      is_active: userData.is_active !== false
    });
    setDialogOpen(true);
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This will permanently delete the user and their logs.')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User removed');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };
  const openPermissionsDialog = async (userData) => {
    setSelectedUserForPermissions(userData);
    await fetchPermissions(userData.id);
    setPermissionsDialogOpen(true);
  };
  const handleSavePermissions = async () => {
    setLoading(true);
    try {
      await api.put(`/users/${selectedUserForPermissions.id}/permissions`, permissions);
      toast.success('System access rules updated');
      setPermissionsDialogOpen(false);
    } catch (error) {
      toast.error('Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };
  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'all' || u.role?.toLowerCase() === activeTab;
    return matchesSearch && matchesTab;
  });
  if (!canViewUserPage) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Card className="p-8 text-center max-w-md shadow-lg border-red-100">
          <Shield className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800">Permission Denied</h2>
          <p className="text-slate-500 mt-2">You don't have the "can_view_user_page" permission required for this module.</p>
        </Card>
      </div>
    );
  }
  return (
    <motion.div className="space-y-6 p-4 md:p-8" initial="hidden" animate="visible" variants={containerVariants}>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>User Directory</h1>
          <p className="text-slate-500 font-medium">Core team administration and access control</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {canEditUsers && (
            <DialogTrigger asChild>
              <Button
                className="rounded-xl font-bold h-12 shadow-lg transition-all hover:scale-105"
                style={{ background: COLORS.deepBlue }}
                onClick={() => {
                  setSelectedUser(null);
                  setFormData({
                    full_name: '', email: '', password: '', role: 'staff',
                    departments: [], phone: '', birthday: '', profile_picture: '',
                    punch_in_time: '09:30', grace_time: '00:15', punch_out_time: '18:30',
                    is_active: true
                  });
                }}
              >
                <Plus className="h-5 w-5 mr-2" />
                Create New Member
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-outfit font-bold" style={{ color: COLORS.deepBlue }}>
                {selectedUser ? 'Modify Member Profile' : 'Register New Member'}
              </DialogTitle>
              <DialogDescription>Input primary identity and shift schedule details below.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Profile Image Upload */}
              <div className="flex justify-center">
                <div className="relative group">
                  <div className="w-28 h-28 rounded-3xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center transition-all group-hover:border-blue-400">
                    {formData.profile_picture ? (
                      <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="h-14 w-14 text-slate-300" />
                    )}
                  </div>
                  <label htmlFor="profile-upload" className="absolute -bottom-2 -right-2 bg-white rounded-xl p-2.5 shadow-xl border border-slate-100 cursor-pointer hover:bg-slate-50">
                    <Camera className="h-5 w-5 text-blue-600" />
                    <input id="profile-upload" type="file" accept="image/*" className="hidden" onChange={handleProfilePictureChange} />
                  </label>
                </div>
              </div>
              {/* Identity Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Full Identity Name</Label>
                  <Input placeholder="e.g. Manthan Desai" name="full_name" value={formData.full_name} onChange={handleInputChange} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Corporate Email</Label>
                  <Input type="email" placeholder="name@firm.com" name="email" value={formData.email} onChange={handleInputChange} disabled={!!selectedUser} className="rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Contact Number</Label>
                  <Input placeholder="+91 00000 00000" name="phone" value={formData.phone} onChange={handleInputChange} className="rounded-xl" />
                </div>
                {!selectedUser && (
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">Initial Password</Label>
                    <Input type="password" name="password" value={formData.password} onChange={handleInputChange} className="rounded-xl" />
                  </div>
                )}
                {selectedUser && (
                  <div className="space-y-2 flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <Label className="text-slate-700 font-semibold">Account Status</Label>
                    <Switch checked={formData.is_active} onCheckedChange={(val) => setFormData({...formData, is_active: val})} />
                  </div>
                )}
              </div>
              {/* Shift Timing Details (Crucial for Attendance Logic) */}
              <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
                <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Duty Shift Parameters
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600">Standard Punch-In</Label>
                    <Input type="time" name="punch_in_time" value={formData.punch_in_time} onChange={handleInputChange} className="rounded-lg bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600">Grace Allowance (HH:MM)</Label>
                    <Input type="time" name="grace_time" value={formData.grace_time} onChange={handleInputChange} className="rounded-lg bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-600">Expected Punch-Out</Label>
                    <Input type="time" name="punch_out_time" value={formData.punch_out_time} onChange={handleInputChange} className="rounded-lg bg-white" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Birthdate</Label>
                  <Input type="date" name="birthday" value={formData.birthday} onChange={handleInputChange} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Primary System Role</Label>
                  <Select value={formData.role} onValueChange={(val) => setFormData({...formData, role: val})}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Associate / Staff</SelectItem>
                      <SelectItem value="manager">Dept. Manager</SelectItem>
                      <SelectItem value="admin">System Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Department Multi-Select */}
              <div className="space-y-3">
                <Label className="text-slate-700 font-semibold">Assigned Departments</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {DEPARTMENTS.map(dept => {
                    const isActive = formData.departments.includes(dept.value);
                    return (
                      <button
                        key={dept.value}
                        onClick={() => handleDepartmentChange(dept.value)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all border-2 ${
                          isActive ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-100 hover:border-slate-300'
                        }`}
                        style={{ background: isActive ? dept.color : 'transparent' }}
                      >
                        {dept.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-3 border-t pt-5">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl h-12">Discard</Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="rounded-xl h-12 px-8 font-bold shadow-lg"
                style={{ background: COLORS.emeraldGreen }}
              >
                {loading ? 'Processing...' : (selectedUser ? 'Save Updates' : 'Confirm Registration')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {/* Navigation & Search */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 rounded-2xl border-slate-200 shadow-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white p-1 rounded-2xl border shadow-sm self-start">
          <TabsList className="bg-transparent h-10">
            <TabsTrigger value="all" className="rounded-xl font-bold px-4">All</TabsTrigger>
            <TabsTrigger value="admin" className="rounded-xl font-bold px-4">Admins</TabsTrigger>
            <TabsTrigger value="manager" className="rounded-xl font-bold px-4">Managers</TabsTrigger>
            <TabsTrigger value="staff" className="rounded-xl font-bold px-4">Staff</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {/* Grid Display */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full py-24 text-center">
            <UsersIcon className="h-16 w-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-400">No members found matching criteria</h3>
          </div>
        ) : (
          filteredUsers.map((userData) => (
            <UserCard
              key={userData.id}
              userData={userData}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPermissions={openPermissionsDialog}
              currentUserId={user?.id}
              COLORS={COLORS}
              isAdmin={isAdmin}
              canEditUsers={canEditUsers}
              canManagePermissions={canManagePermissions}
            />
          ))
        )}
      </motion.div>
      {/* Permissions Dialog (Synced with UserPermissions Model) */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
          <div className="sticky top-0 z-10 p-6 bg-white border-b flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <DialogTitle className="text-xl font-outfit font-bold" style={{ color: COLORS.deepBlue }}>Access Governance</DialogTitle>
                <DialogDescription>Configuring <b>{selectedUserForPermissions?.full_name}</b></DialogDescription>
              </div>
            </div>
            <Button variant="ghost" className="rounded-xl" onClick={() => setPermissionsDialogOpen(false)}>Close</Button>
          </div>
          <div className="p-6 space-y-6">
            <Accordion type="multiple" defaultValue={['global']} className="w-full space-y-4">
             
              {/* Data Access Section */}
              <AccordionItem value="global" className="border rounded-2xl px-4 overflow-hidden shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3"><Eye className="h-5 w-5 text-blue-500" /> Global Visibility</div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-2">
                  {[
                    { key: 'can_view_all_tasks', label: 'Universal Task Access', desc: 'Can see tasks assigned to any user/dept' },
                    { key: 'can_view_all_clients', label: 'Master Client List', desc: 'Can see all company legal entities' },
                    { key: 'can_view_all_dsc', label: 'DSC Vault Access', desc: 'View all Digital Signatures in register' },
                    { key: 'can_view_documents', label: 'Document Library', desc: 'Access to physical document register' },
                    { key: 'can_view_all_duedates', label: 'Compliance Roadmap', desc: 'View all upcoming statutory due dates' },
                    { key: 'can_view_reports', label: 'Analytics Dashboard', desc: 'View performance and system reports' },
                    { key: 'can_view_todo_dashboard', label: 'Todo Dashboard', desc: 'Access to global team todo overview' },
                    { key: 'can_view_audit_logs', label: 'System Audit Trail', desc: 'View activity logs and record histories' },
                    { key: 'can_view_all_leads', label: 'Leads Pipeline Access', desc: 'Can view the global leads and sales dashboard' },
                    { key: 'can_edit_leads', label: 'Lead Management', desc: 'Permission to modify lead details and status' }
                  ].map((perm) => (
                    <div key={perm.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="pr-4">
                        <p className="text-sm font-bold text-slate-700">{perm.label}</p>
                        <p className="text-[10px] text-slate-500">{perm.desc}</p>
                      </div>
                      <Switch checked={permissions[perm.key]} onCheckedChange={(val) => setPermissions({...permissions, [perm.key]: val})} />
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
              {/* Operations & Management */}
              <AccordionItem value="management" className="border rounded-2xl px-4 overflow-hidden shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3"><Settings className="h-5 w-5 text-purple-500" /> Operational Powers</div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-2">
                  {[
                    { key: 'can_assign_tasks', label: 'Task Delegation', desc: 'Permission to assign tasks to other staff' },
                    { key: 'can_manage_users', label: 'User Governance', desc: 'Manage other team members and roles' },
                    { key: 'can_view_attendance', label: 'Attendance Management', desc: 'Review punch timings and late reports' },
                    { key: 'can_view_staff_activity', label: 'Staff Monitoring', desc: 'View app usage and screen activity logs' },
                    { key: 'can_send_reminders', label: 'Automated Reminders', desc: 'Trigger email/notification reminders' },
                    { key: 'can_download_reports', label: 'Export Data', desc: 'Download CSV/PDF versions of reports' }
                  ].map((perm) => (
                    <div key={perm.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="pr-4">
                        <p className="text-sm font-bold text-slate-700">{perm.label}</p>
                        <p className="text-[10px] text-slate-500">{perm.desc}</p>
                      </div>
                      <Switch checked={permissions[perm.key]} onCheckedChange={(val) => setPermissions({...permissions, [perm.key]: val})} />
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
              {/* Editing & Deletion */}
              <AccordionItem value="edits" className="border rounded-2xl px-4 overflow-hidden shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3"><Edit className="h-5 w-5 text-orange-500" /> Edit & Modification</div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-2">
                  {[
                    { key: 'can_edit_tasks', label: 'Modify Tasks', desc: 'Update/Delete task definitions' },
                    { key: 'can_edit_clients', label: 'Modify Clients', desc: 'Update client master data' },
                    { key: 'can_edit_dsc', label: 'Modify DSC', desc: 'Update certificate details' },
                    { key: 'can_edit_documents', label: 'Modify Documents', desc: 'Change document records' },
                    { key: 'can_edit_due_dates', label: 'Modify Due Dates', desc: 'Edit statutory timelines' },
                    { key: 'can_edit_users', label: 'Modify Users', desc: 'Update user profiles' }
                  ].map((perm) => (
                    <div key={perm.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="pr-4">
                        <p className="text-sm font-bold text-slate-700">{perm.label}</p>
                        <p className="text-[10px] text-slate-500">{perm.desc}</p>
                      </div>
                      <Switch checked={permissions[perm.key]} onCheckedChange={(val) => setPermissions({...permissions, [perm.key]: val})} />
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
              {/* CROSS-USER VISIBILITY (NEW BACKEND LOGIC) */}
              <AccordionItem value="cross-user" className="border rounded-2xl px-4 overflow-hidden shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3"><UsersIcon className="h-5 w-5 text-emerald-500" /> Cross-User Visibility</div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-6">
                  {[
                    { key: "view_other_tasks", label: "Tasks", icon: <CheckCircle className="h-3 w-3" /> },
                    { key: "view_other_attendance", label: "Attendance", icon: <Calendar className="h-3 w-3" /> },
                    { key: "view_other_reports", label: "Reports", icon: <Download className="h-3 w-3" /> },
                    { key: "view_other_todos", label: "Personal Todos", icon: <LayoutDashboard className="h-3 w-3" /> },
                    { key: "view_other_activity", label: "App Activity", icon: <Eye className="h-3 w-3" /> },
                  ].map((section) => (
                    <div key={section.key} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className="p-1.5 bg-slate-100 rounded-lg">{section.icon}</div>
                        <p className="text-sm font-bold text-slate-800">Allowed {section.label} Visibility</p>
                      </div>
                      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-2xl min-h-[50px]">
                        {users
                          .filter(u => u.id !== selectedUserForPermissions?.id)
                          .map((u) => {
                            const isSelected = permissions[section.key]?.includes(u.id);
                            return (
                              <Badge
                                key={u.id}
                                onClick={() =>
                                  setPermissions(prev => ({
                                    ...prev,
                                    [section.key]: isSelected
                                      ? prev[section.key].filter(id => id !== u.id)
                                      : [...prev[section.key], u.id]
                                  }))
                                }
                                className={`cursor-pointer px-3 py-1.5 rounded-lg border-2 transition-all ${
                                  isSelected
                                    ? "bg-emerald-500 border-emerald-600 text-white shadow-md scale-105"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                }`}
                              >
                                {u.full_name}
                              </Badge>
                            );
                          })}
                        {users.length <= 1 && <p className="text-xs text-slate-400 italic">No other users available</p>}
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
              {/* Client Assignment */}
              <AccordionItem value="clients" className="border rounded-2xl px-4 overflow-hidden shadow-sm">
                <AccordionTrigger className="hover:no-underline font-bold text-slate-800">
                  <div className="flex items-center gap-3"><Briefcase className="h-5 w-5 text-cyan-500" /> Assigned Portfolio</div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Filter company list..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="pl-10 h-10 rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {clients
                      .filter(c => c.company_name.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                      .map((client) => {
                        const isAssigned = (permissions.assigned_clients || []).includes(client.id);
                        return (
                          <div
                            key={client.id}
                            onClick={() => {
                              setPermissions(prev => ({
                                ...prev,
                                assigned_clients: isAssigned
                                  ? prev.assigned_clients.filter(id => id !== client.id)
                                  : [...prev.assigned_clients, client.id]
                              }));
                            }}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${
                              isAssigned ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isAssigned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                              {isAssigned ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
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
            <Button variant="ghost" className="rounded-xl h-12" onClick={() => setPermissionsDialogOpen(false)}>Discard</Button>
            <Button
              onClick={handleSavePermissions}
              disabled={loading}
              className="rounded-xl h-12 px-10 font-bold shadow-xl"
              style={{ background: COLORS.emeraldGreen }}
            >
              {loading ? 'Propagating...' : 'Update Permissions'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
