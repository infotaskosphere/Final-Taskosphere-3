import React, { useState, useEffect } from 'react';
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
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye, EyeOff, CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';
import { motion } from 'framer-motion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  lightBlue: '#E0F2FE',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

// Department categories with colors
const DEPARTMENTS = [
  { value: 'gst', label: 'GST', color: '#EF4444' },
  { value: 'income_tax', label: 'IT', color: '#F59E0B' },
  { value: 'accounts', label: 'ACC', color: '#10B981' },
  { value: 'tds', label: 'TDS', color: '#3B82F6' },
  { value: 'roc', label: 'ROC', color: '#8B5CF6' },
  { value: 'trademark', label: 'TM', color: '#EC4899' },
  { value: 'msme_smadhan', label: 'MSME', color: '#06B6D4' },
  { value: 'fema', label: 'FEMA', color: '#F97316' },
  { value: 'dsc', label: 'DSC', color: '#14B8A6' },
  { value: 'other', label: 'OTHER', color: '#6B7280' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

// Department Pill Component - Sleek and Trendy
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

// User Card Component - Modern Grid Card
const UserCard = ({ userData, onEdit, onDelete, onPermissions, currentUserId, COLORS }) => {
  const userDepts = userData.departments || [];
  const [showActions, setShowActions] = useState(false);
  
  const getRoleIcon = (role) => {
    switch(role) {
      case 'admin': return <Crown className="h-3 w-3" />;
      case 'manager': return <Briefcase className="h-3 w-3" />;
      default: return <UserIcon className="h-3 w-3" />;
    }
  };
  
  const getRoleStyle = (role) => {
    switch(role) {
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
      {/* Action Menu */}
      <div className={`absolute top-3 right-3 flex gap-1 transition-all duration-200 ${showActions ? 'opacity-100' : 'opacity-0 sm:opacity-0'}`}>
        {userData.role !== 'admin' && (
          <button
            onClick={() => onPermissions(userData)}
            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
            title="Permissions"
          >
            <Shield className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => onEdit(userData)}
          className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
          title="Edit"
        >
          <Edit className="h-4 w-4" />
        </button>
        {userData.id !== currentUserId && (
          <button
            onClick={() => onDelete(userData.id)}
            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Avatar & Name */}
      <div className="flex items-start gap-3 sm:gap-4 mb-4">
        <div 
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white text-lg sm:text-xl font-bold shadow-lg flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
        >
          {userData.full_name?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate text-sm sm:text-base">{userData.full_name}</h3>
          <p className="text-xs sm:text-sm text-slate-500 truncate">{userData.email}</p>
        </div>
      </div>

      {/* Role Badge */}
      <div className="mb-4">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${roleStyle.bg} ${roleStyle.text}`}>
          {getRoleIcon(userData.role)}
          {userData.role.charAt(0).toUpperCase() + userData.role.slice(1)}
        </span>
      </div>

      {/* Departments - Sleek Pills */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Departments</p>
        <div className="flex flex-wrap gap-1.5">
          {userDepts.length > 0 ? (
            <>
              {userDepts.slice(0, 4).map((dept) => (
                <DeptPill key={dept} dept={dept} size="sm" />
              ))}
              {userDepts.length > 4 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                  +{userDepts.length - 4}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">No departments assigned</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [formData, setFormData] = useState({
  email: '',
  password: '',
  full_name: '',
  role: 'staff',
  profile_picture: '',
  phone: '',
  birthdate: ''
  departments: [],
});
  const handlePhotoUpload = async (file) => {
  const formDataCloud = new FormData();
  formDataCloud.append("file", file);
  formDataCloud.append("upload_preset", "taskosphere_unsigned");

  try {
    const res = await fetch(
      "https://api.cloudinary.com/v1_1/dbb4263pa/image/upload",
      {
        method: "POST",
        body: formDataCloud,
      }
    );

    const data = await res.json();

    if (data.secure_url) {
      setFormData(prev => ({
        ...prev,
        profile_picture: data.secure_url
      }));
    }
  } catch (error) {
    console.error("Image upload failed:", error);
  }
};

  useEffect(() => {
    fetchUsers();
    fetchClients();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to fetch users');
    }
  };

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingUser) {
        const updateData = {
          full_name: formData.full_name,
          role: formData.role,
          departments: formData.departments,
        };
        await api.put(`/users/${editingUser.id}`, updateData);
        toast.success('User updated successfully!');
      } else {
        const token = localStorage.getItem('token');
        await axios.post(`${API}/auth/register`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('User created successfully!');
      }

      setDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (userToEdit) => {
    setEditingUser(userToEdit);
    setFormData({
      email: userToEdit.email,
      password: '',
      full_name: userToEdit.full_name,
      role: userToEdit.role,
      profile_picture: userToEdit.profile_picture || '',
      phone: userToEdit.phone || '',
      birthdate: userToEdit.birthdate || '',
      departments: userToEdit.departments || [],
    });
    setDialogOpen(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.delete(`/users/${userId}`);
      toast.success('User deleted successfully!');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'staff',
      profile_picture: '',
      departments: [],
    });
    setEditingUser(null);
  };

  const toggleDepartment = (deptValue) => {
    setFormData(prev => {
      const currentDepts = prev.departments || [];
      if (currentDepts.includes(deptValue)) {
        return { ...prev, departments: currentDepts.filter(d => d !== deptValue) };
      } else {
        return { ...prev, departments: [...currentDepts, deptValue] };
      }
    });
  };

  const openPermissionsDialog = (userData) => {
    setSelectedUserForPermissions(userData);
    setPermissions(userData.permissions || {
      can_view_all_tasks: false,
      can_view_all_clients: false,
      can_view_all_dsc: false,
      can_view_all_duedates: false,
      can_view_reports: false,
      can_manage_users: false,
      can_assign_tasks: false,
      assigned_clients: [],
    });
    setPermissionsDialogOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedUserForPermissions) return;
    
    setLoading(true);
    try {
      await api.put(`/users/${selectedUserForPermissions.id}/permissions`, permissions);
      toast.success('Permissions updated successfully!');
      setPermissionsDialogOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  const toggleClientAssignment = (clientId) => {
    const currentAssigned = permissions.assigned_clients || [];
    if (currentAssigned.includes(clientId)) {
      setPermissions({
        ...permissions,
        assigned_clients: currentAssigned.filter(id => id !== clientId)
      });
    } else {
      setPermissions({
        ...permissions,
        assigned_clients: [...currentAssigned, clientId]
      });
    }
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch = !searchQuery || 
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === 'all' || u.role === activeTab;
    
    return matchesSearch && matchesTab;
  });

  // Stats
  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    managers: users.filter(u => u.role === 'manager').length,
    staff: users.filter(u => u.role === 'staff').length,
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
          <Shield className="h-10 w-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600 max-w-md">Only administrators can manage users. Contact your admin for access.</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-4 sm:space-y-6" 
      data-testid="users-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>
            Team Members
          </h1>
          <p className="text-slate-600 mt-1 text-sm sm:text-base">Manage your team and their access permissions</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button
              className="text-white rounded-xl px-4 sm:px-6 shadow-lg transition-all hover:scale-105 hover:shadow-xl w-full sm:w-auto"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
              data-testid="add-user-btn"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit text-xl sm:text-2xl" style={{ color: COLORS.deepBlue }}>
                {editingUser ? 'Edit Member' : 'Add New Member'}
              </DialogTitle>
              <DialogDescription>
                {editingUser ? 'Update member details and departments.' : 'Create a new team member account.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="full_name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="h-11 rounded-xl"
                  data-testid="user-name-input"
                />
              </div>
              <div className="space-y-2">
              <Label>Profile Photo</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e.target.files[0])}
                className="h-11 rounded-xl"
              />

              {formData.profile_picture && (
              <img
               src={formData.profile_picture}
               alt="Preview"
               className="w-20 h-20 rounded-xl object-cover border mt-2"
             />
           )}
         </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={editingUser}
                  className="h-11 rounded-xl"
                  data-testid="user-email-input"
                />
              </div>
              <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="text"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
            <Label htmlFor="birthdate">Birthdate</Label>
            <Input
              id="birthdate"
              type="date"
              value={formData.birthdate}
              onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
              className="h-11 rounded-xl"
            />
          </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create strong password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    className="h-11 rounded-xl"
                    data-testid="user-password-input"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Role <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="h-11 rounded-xl" data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-purple-500" />
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-blue-500" />
                        Manager
                      </div>
                    </SelectItem>
                    <SelectItem value="staff">
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-slate-500" />
                        Staff
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Department Selection - Trendy Grid */}
              <div className="space-y-3">
                <Label>Departments</Label>
                <div className="grid grid-cols-5 gap-2">
                  {DEPARTMENTS.map((dept) => {
                    const isSelected = (formData.departments || []).includes(dept.value);
                    return (
                      <button
                        key={dept.value}
                        type="button"
                        onClick={() => toggleDepartment(dept.value)}
                        className={`p-2 rounded-xl text-xs font-semibold transition-all border-2 ${
                          isSelected 
                            ? 'shadow-md scale-105' 
                            : 'border-transparent bg-slate-50 hover:bg-slate-100 text-slate-600'
                        }`}
                        style={isSelected ? { 
                          background: `${dept.color}15`,
                          borderColor: dept.color,
                          color: dept.color
                        } : {}}
                        data-testid={`user-dept-${dept.value}`}
                      >
                        {dept.label}
                      </button>
                    );
                  })}
                </div>
                {(formData.departments || []).length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">
                    {(formData.departments || []).length} selected
                  </p>
                )}
              </div>

              <DialogFooter className="pt-4 flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setDialogOpen(false); resetForm(); }}
                  className="rounded-xl w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="text-white rounded-xl w-full sm:w-auto"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
                  data-testid="user-submit-btn"
                >
                  {loading ? 'Saving...' : editingUser ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <UsersIcon className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Crown className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.admins}</p>
              <p className="text-xs text-slate-500">Admins</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.managers}</p>
              <p className="text-xs text-slate-500">Managers</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <UserIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.staff}</p>
              <p className="text-xs text-slate-500">Staff</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Search & Filter Tabs */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-white border-slate-200"
          />
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-4 h-11 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <TabsTrigger value="all" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              All
            </TabsTrigger>
            <TabsTrigger value="admin" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              Admins
            </TabsTrigger>
            <TabsTrigger value="manager" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              Managers
            </TabsTrigger>
            <TabsTrigger value="staff" className="rounded-lg text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              Staff
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Users Grid */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <UserIcon className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-lg">No team members found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          filteredUsers.map((userData) => (
            <UserCard
              key={userData.id}
              userData={userData}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPermissions={openPermissionsDialog}
              currentUserId={user.id}
              COLORS={COLORS}
            />
          ))
        )}
      </motion.div>

      {/* Permissions Dialog */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl sm:text-2xl flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Shield className="h-6 w-6" />
              Permissions
            </DialogTitle>
            <DialogDescription>
              Configure access for {selectedUserForPermissions?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Data Access */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                <Eye className="h-4 w-4" />
                Data Access
              </h4>
              <div className="space-y-2">
                {[
                  { key: 'can_view_all_tasks', label: 'View All Tasks' },
                  { key: 'can_view_all_clients', label: 'View All Clients' },
                  { key: 'can_view_all_dsc', label: 'View All DSC' },
                  { key: 'can_view_all_duedates', label: 'View All Due Dates' },
                  { key: 'can_view_reports', label: 'View Reports' },
                  { key: 'can_manage_users', label: 'Manage Users' },
                  { key: 'can_assign_tasks', label: 'Assign Tasks' },
                ].map((perm) => (
                  <div key={perm.key} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl">
                    <span className="text-sm text-slate-700">{perm.label}</span>
                    <Switch
                      checked={permissions[perm.key]}
                      onCheckedChange={(checked) => setPermissions({ ...permissions, [perm.key]: checked })}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned Clients */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                <UserIcon className="h-4 w-4" />
                Assigned Clients
              </h4>
              {clients.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No clients available</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {clients.map((client) => {
                    const isAssigned = (permissions.assigned_clients || []).includes(client.id);
                    return (
                      <div
                        key={client.id}
                        onClick={() => toggleClientAssignment(client.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                          isAssigned 
                            ? 'bg-emerald-100 border-2 border-emerald-300' 
                            : 'bg-white border-2 border-transparent hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isAssigned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                        }`}>
                          {isAssigned ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        </div>
                        <span className="text-sm font-medium text-slate-700 truncate">{client.company_name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)} className="rounded-xl w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={loading}
              className="text-white rounded-xl w-full sm:w-auto"
              style={{ background: COLORS.emeraldGreen }}
            >
              {loading ? 'Saving...' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
