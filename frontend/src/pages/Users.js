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
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Shield, User as UserIcon, Settings, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';
import { motion } from 'framer-motion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

// Department categories for CA/CS firms
const DEPARTMENTS = [
  { value: 'gst', label: 'GST' },
  { value: 'income_tax', label: 'INCOME TAX' },
  { value: 'accounts', label: 'ACCOUNTS' },
  { value: 'tds', label: 'TDS' },
  { value: 'roc', label: 'ROC' },
  { value: 'trademark', label: 'TRADEMARK' },
  { value: 'msme_smadhan', label: 'MSME SMADHAN' },
  { value: 'fema', label: 'FEMA' },
  { value: 'dsc', label: 'DSC' },
  { value: 'other', label: 'OTHER' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
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

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'staff',
    profile_picture: '',
    departments: [], // Multiple departments
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
  });

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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profile_picture: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'staff',
      profile_picture: '',
    });
    setEditingUser(null);
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

  const getRoleBadge = (role) => {
    const styles = {
      admin: 'bg-purple-100 text-purple-700 border-purple-300',
      manager: 'bg-blue-100 text-blue-700 border-blue-300',
      staff: 'bg-gray-100 text-gray-700 border-gray-300',
    };
    return styles[role] || styles.staff;
  };

  const getPermissionStatus = (userData) => {
    if (userData.role === 'admin') return { text: 'Full Access', color: 'text-purple-600' };
    if (!userData.permissions) return { text: 'Default (Assigned Only)', color: 'text-slate-500' };
    
    const p = userData.permissions;
    const hasCustom = p.can_view_all_tasks || p.can_view_all_clients || p.can_view_all_dsc || 
                      p.can_view_all_duedates || p.can_view_reports || p.can_manage_users ||
                      (p.assigned_clients && p.assigned_clients.length > 0);
    
    return hasCustom 
      ? { text: 'Custom Permissions', color: 'text-emerald-600' }
      : { text: 'Default (Assigned Only)', color: 'text-slate-500' };
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <Shield className="h-16 w-16 mx-auto text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-600 mt-2">Only administrators can manage users.</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-6" 
      data-testid="users-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>User Management</h1>
          <p className="text-slate-600 mt-1">Add and manage user accounts with custom permissions</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button
              className="text-white rounded-lg px-6 shadow-lg transition-all hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
              data-testid="add-user-btn"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl" style={{ color: COLORS.deepBlue }}>
                {editingUser ? 'Edit User' : 'Add New User'}
              </DialogTitle>
              <DialogDescription>
                {editingUser ? 'Update user details below.' : 'Create a new user account with credentials.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile_picture">Profile Picture</Label>
                <div className="flex items-center gap-4">
                  {formData.profile_picture && (
                    <img
                      src={formData.profile_picture}
                      alt="Profile"
                      className="w-16 h-16 rounded-full object-cover border-2 border-slate-200"
                    />
                  )}
                  <Input
                    id="profile_picture"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    data-testid="user-profile-picture-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  data-testid="user-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={editingUser}
                  data-testid="user-email-input"
                />
              </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create strong password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    data-testid="user-password-input"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                  data-testid="user-cancel-btn"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  style={{ background: COLORS.deepBlue }}
                  className="text-white"
                  data-testid="user-submit-btn"
                >
                  {loading ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Permissions Dialog */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Shield className="h-6 w-6" />
              Manage Permissions
            </DialogTitle>
            <DialogDescription>
              Configure data access permissions for {selectedUserForPermissions?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Data Access Permissions */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Data Access Permissions
                </CardTitle>
                <CardDescription className="text-xs">
                  Control what data this user can view across the system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <Label className="text-sm font-medium">View All Tasks</Label>
                    <p className="text-xs text-slate-500">Can see tasks assigned to other users</p>
                  </div>
                  <Switch
                    checked={permissions.can_view_all_tasks}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_all_tasks: checked })}
                    data-testid="perm-view-all-tasks"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <Label className="text-sm font-medium">View All Clients</Label>
                    <p className="text-xs text-slate-500">Can see all client records</p>
                  </div>
                  <Switch
                    checked={permissions.can_view_all_clients}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_all_clients: checked })}
                    data-testid="perm-view-all-clients"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <Label className="text-sm font-medium">View All DSC</Label>
                    <p className="text-xs text-slate-500">Can see all DSC certificates</p>
                  </div>
                  <Switch
                    checked={permissions.can_view_all_dsc}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_all_dsc: checked })}
                    data-testid="perm-view-all-dsc"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <Label className="text-sm font-medium">View All Due Dates</Label>
                    <p className="text-xs text-slate-500">Can see all due date reminders</p>
                  </div>
                  <Switch
                    checked={permissions.can_view_all_duedates}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_all_duedates: checked })}
                    data-testid="perm-view-all-duedates"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <Label className="text-sm font-medium">View Reports</Label>
                    <p className="text-xs text-slate-500">Can access efficiency and analytics reports</p>
                  </div>
                  <Switch
                    checked={permissions.can_view_reports}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_reports: checked })}
                    data-testid="perm-view-reports"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <Label className="text-sm font-medium">Manage Users</Label>
                    <p className="text-xs text-slate-500">Can create, edit, and delete user accounts</p>
                  </div>
                  <Switch
                    checked={permissions.can_manage_users}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_manage_users: checked })}
                    data-testid="perm-manage-users"
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label className="text-sm font-medium">Assign Tasks</Label>
                    <p className="text-xs text-slate-500">Can assign tasks to other staff members</p>
                  </div>
                  <Switch
                    checked={permissions.can_assign_tasks}
                    onCheckedChange={(checked) => setPermissions({ ...permissions, can_assign_tasks: checked })}
                    data-testid="perm-assign-tasks"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Assigned Clients */}
            <Card className="border border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Assigned Clients
                </CardTitle>
                <CardDescription className="text-xs">
                  Select specific clients this user can access (in addition to their task assignments)
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                            isAssigned 
                              ? 'bg-emerald-50 border border-emerald-200' 
                              : 'bg-slate-50 border border-slate-200 hover:border-slate-300'
                          }`}
                          data-testid={`client-assign-${client.id}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            isAssigned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {isAssigned ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{client.company_name}</p>
                            <p className="text-xs text-slate-500 truncate">{client.client_type}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPermissionsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={loading}
              style={{ background: COLORS.emeraldGreen }}
              className="text-white"
              data-testid="save-permissions-btn"
            >
              {loading ? 'Saving...' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Users Table */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-sm font-medium text-slate-600 uppercase tracking-wider">
              All Users ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {users.length === 0 ? (
              <div className="text-center py-12 text-slate-500" data-testid="no-users-message">
                <UserIcon className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No users found. Add your first user!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                        Name
                      </th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                        Email
                      </th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                        Role
                      </th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                        Permissions
                      </th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                        Created
                      </th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((userData) => {
                      const permStatus = getPermissionStatus(userData);
                      return (
                        <tr
                          key={userData.id}
                          className="hover:bg-slate-50 transition-colors"
                          data-testid={`user-row-${userData.id}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                                style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
                              >
                                {userData.full_name?.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900">{userData.full_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{userData.email}</td>
                          <td className="px-6 py-4">
                            <Badge className={`text-xs px-2 py-1 border ${getRoleBadge(userData.role)}`}>
                              {userData.role}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm ${permStatus.color}`}>
                              {permStatus.text}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {format(new Date(userData.created_at), 'MMM dd, yyyy')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1">
                              {userData.role !== 'admin' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openPermissionsDialog(userData)}
                                  data-testid={`permissions-user-${userData.id}`}
                                  className="hover:bg-emerald-50 hover:text-emerald-600"
                                  title="Manage Permissions"
                                >
                                  <Settings className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(userData)}
                                data-testid={`edit-user-${userData.id}`}
                                className="hover:bg-indigo-50 hover:text-indigo-600"
                                title="Edit User"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {userData.id !== user.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(userData.id)}
                                  data-testid={`delete-user-${userData.id}`}
                                  className="hover:bg-red-50 hover:text-red-600"
                                  title="Delete User"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
