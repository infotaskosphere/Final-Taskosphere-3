import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { 
  Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye, EyeOff, 
  CheckCircle, XCircle, Search, Users as UsersIcon, Crown, Briefcase, 
  MoreVertical, Mail, Phone, Calendar, Camera, Cake 
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

const UserCard = ({ userData, onEdit, onDelete, onPermissions, currentUserId, COLORS, isAdmin }) => {
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
            <Badge className="bg-slate-100 text-slate-700 font-medium text-[10px] sm:text-xs">
              {userData.status || 'Active'}
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
        {userData.birthday && (
          <p className="flex items-center gap-2 text-pink-500 font-medium">
            <Cake className="h-3.5 w-3.5 flex-shrink-0" />
            {format(new Date(userData.birthday), 'MMM dd')}
          </p>
        )}
        <p className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          Joined {userData.created_at ? format(new Date(userData.created_at), 'MMM dd, yyyy') : 'N/A'}
        </p>
      </div>
    </motion.div>
  );
};

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff',
    departments: [],
    phone: '',
    birthday: '',
    profile_picture: '',
  });
  const [permissions, setPermissions] = useState({
    can_view_all_tasks: false,
    can_view_all_clients: false,
    can_view_all_dsc: false,
    can_view_all_duedates: false,
    can_view_reports: false,
    can_manage_users: false,
    can_assign_tasks: false,
    assigned_clients: [],
    can_view_staff_activity: false,
    can_view_attendance_reports: false,
    can_view_staff_activity: false,
    can_send_reminders: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchClients();
    }
  }, [isAdmin]);

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
      setPermissions(response.data);
    } catch (error) {
      console.error('Failed to fetch permissions');
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
      toast.error('Failed to upload profile picture');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (selectedUser) {
        await api.put(`/users/${selectedUser.id}`, formData);
        toast.success('User updated successfully');
      } else {
        await api.post('/auth/register', formData);
        toast.success('User created successfully');
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
      password: '',
      role: userData.role,
      departments: userData.departments || [],
      phone: userData.phone || '',
      birthday: userData.birthday || '',
      profile_picture: userData.profile_picture || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const openPermissionsDialog = async (userData) => {
    setSelectedUserForPermissions(userData);
    await fetchPermissions(userData.id);
    setPermissionsDialogOpen(true);
  };

  const toggleClientAssignment = (clientId) => {
    setPermissions(prev => ({
      ...prev,
      assigned_clients: prev.assigned_clients.includes(clientId)
        ? prev.assigned_clients.filter(id => id !== clientId)
        : [...prev.assigned_clients, clientId]
    }));
  };

  const handleSavePermissions = async () => {
    setLoading(true);
    try {
      await api.put(`/users/${selectedUserForPermissions.id}/permissions`, permissions);
      toast.success('Permissions updated successfully');
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
    const matchesTab = activeTab === 'all' || u.role === activeTab;
    return matchesSearch && matchesTab;
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="p-8 text-center max-w-md">
          <UsersIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700">Access Restricted</h2>
          <p className="text-slate-500 mt-2">Only administrators can manage users.</p>
        </Card>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6" 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>Team Members</h1>
          <p className="text-slate-600 mt-1">Manage your team and their permissions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="rounded-xl font-medium text-white w-full md:w-auto"
              style={{ background: COLORS.deepBlue }}
              onClick={() => { setSelectedUser(null); setFormData({ full_name: '', email: '', password: '', role: 'staff', departments: [], phone: '', birthday: '', profile_picture: '' }); }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit text-xl sm:text-2xl" style={{ color: COLORS.deepBlue }}>
                {selectedUser ? 'Edit Team Member' : 'Add New Team Member'}
              </DialogTitle>
              <DialogDescription>
                {selectedUser ? 'Update team member details' : 'Create a new team member account'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                    {formData.profile_picture ? (
                      <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="h-12 w-12 text-slate-400" />
                    )}
                  </div>
                  <label htmlFor="profile-upload" className="absolute bottom-0 right-0 bg-white rounded-full p-2 shadow cursor-pointer">
                    <Camera className="h-4 w-4 text-slate-600" />
                    <input id="profile-upload" type="file" accept="image/*" className="hidden" onChange={handleProfilePictureChange} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input id="full_name" name="full_name" value={formData.full_name} onChange={handleInputChange} />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="password">{selectedUser ? 'New Password (optional)' : 'Password'}</Label>
                  <Input id="password" name="password" type="password" value={formData.password} onChange={handleInputChange} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" value={formData.phone} onChange={handleInputChange} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="birthday">Birthdate</Label>
                  <Input id="birthday" name="birthday" type="date" value={formData.birthday} onChange={handleInputChange} />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Departments</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-2">
                  {DEPARTMENTS.map(dept => (
                    <div
                      key={dept.value}
                      onClick={() => handleDepartmentChange(dept.value)}
                      className={`flex items-center justify-center p-2 rounded-xl cursor-pointer transition-all ${
                        formData.departments.includes(dept.value) ? 'text-white font-semibold' : 'bg-white border border-slate-200 hover:border-slate-300'
                      }`}
                      style={{ background: formData.departments.includes(dept.value) ? `linear-gradient(135deg, ${dept.color} 0%, ${dept.color}CC 100%)` : undefined }}
                    >
                      {dept.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl w-full sm:w-auto">Cancel</Button>
              <Button onClick={handleSubmit} disabled={loading} className="text-white rounded-xl w-full sm:w-auto" style={{ background: COLORS.emeraldGreen }}>
                {loading ? 'Saving...' : selectedUser ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 rounded-xl" />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 p-0">
            <TabsTrigger value="all">All ({users.length})</TabsTrigger>
            <TabsTrigger value="admin">Admins ({users.filter(u => u.role === 'admin').length})</TabsTrigger>
            <TabsTrigger value="manager">Managers ({users.filter(u => u.role === 'manager').length})</TabsTrigger>
            <TabsTrigger value="staff">Staff ({users.filter(u => u.role === 'staff').length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <UserIcon className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-lg">No team members found</p>
          </div>
        ) : (
          filteredUsers.map((userData) => (
            <UserCard key={userData.id} userData={userData} onEdit={handleEdit} onDelete={handleDelete} onPermissions={openPermissionsDialog} currentUserId={user.id} COLORS={COLORS} isAdmin={isAdmin} />
          ))
        )}
      </motion.div>

      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl sm:text-2xl flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Shield className="h-6 w-6" /> Permissions
            </DialogTitle>
            <DialogDescription>Configure access for {selectedUserForPermissions?.full_name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm"><Eye className="h-4 w-4" /> Data Access</h4>
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
                  <Switch checked={permissions[perm.key]} onCheckedChange={(checked) => setPermissions({ ...permissions, [perm.key]: checked })} />
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm"><UsersIcon className="h-4 w-4" /> Staff Management</h4>
              {[
                { key: 'can_view_staff_activity', label: 'View Staff Activity' },
                { key: 'can_view_attendance_reports', label: 'View Attendance Reports' },
                { key: 'can_send_reminders', label: 'Send Task Reminders' },
              ].map((perm) => (
                <div key={perm.key} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl">
                  <span className="text-sm text-slate-700">{perm.label}</span>
                  <Switch checked={permissions[perm.key]} onCheckedChange={(checked) => setPermissions({ ...permissions, [perm.key]: checked })} />
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm"><UserIcon className="h-4 w-4" /> Assigned Clients</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {clients.map((client) => {
                  const isAssigned = (permissions.assigned_clients || []).includes(client.id);
                  return (
                    <div key={client.id} onClick={() => toggleClientAssignment(client.id)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${isAssigned ? 'bg-emerald-100 border-2 border-emerald-300' : 'bg-white border-2 border-transparent hover:border-slate-200'}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isAssigned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        {isAssigned ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700 truncate">{client.company_name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)} className="rounded-xl w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSavePermissions} disabled={loading} className="text-white rounded-xl w-full sm:w-auto" style={{ background: COLORS.emeraldGreen }}>{loading ? 'Saving...' : 'Save Permissions'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
