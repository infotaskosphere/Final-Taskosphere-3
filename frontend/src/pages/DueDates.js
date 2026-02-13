import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Calendar, Building2, User, AlertCircle, CheckCircle, Clock, Filter } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { motion } from 'framer-motion';

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

// Categories
const CATEGORIES = ['GST', 'Income Tax', 'TDS', 'ROC', 'Audit', 'Trademark', 'RERA', 'FEMA', 'Other'];

// Status styles
const STATUS_STYLES = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
  upcoming: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Upcoming' },
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function DueDates() {
  const { user } = useAuth();
  const [dueDates, setDueDates] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    reminder_days: 30,
    category: '',
    assigned_to: 'unassigned',
    client_id: 'no_client',
    status: 'pending',
  });

  useEffect(() => {
    fetchDueDates();
    fetchClients();
    fetchUsers();
  }, []);

  const fetchDueDates = async () => {
    try {
      const response = await api.get('/duedates');
      setDueDates(response.data);
    } catch (error) {
      toast.error('Failed to fetch due dates');
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

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dueDateData = {
        ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
        client_id: formData.client_id === 'no_client' ? null : (formData.client_id || null),
        due_date: new Date(formData.due_date).toISOString(),
      };

      if (editingDueDate) {
        await api.put(`/duedates/${editingDueDate.id}`, dueDateData);
        toast.success('Due date updated successfully!');
      } else {
        await api.post('/duedates', dueDateData);
        toast.success('Due date created successfully!');
      }

      setDialogOpen(false);
      resetForm();
      fetchDueDates();
    } catch (error) {
      toast.error('Failed to save due date');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (dueDate) => {
    setEditingDueDate(dueDate);
    setFormData({
      title: dueDate.title,
      description: dueDate.description || '',
      due_date: format(new Date(dueDate.due_date), 'yyyy-MM-dd'),
      reminder_days: dueDate.reminder_days,
      category: dueDate.category || '',
      assigned_to: dueDate.assigned_to || 'unassigned',
      client_id: dueDate.client_id || 'no_client',
      status: dueDate.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this due date?')) return;

    try {
      await api.delete(`/duedates/${id}`);
      toast.success('Due date deleted successfully!');
      fetchDueDates();
    } catch (error) {
      toast.error('Failed to delete due date');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      due_date: '',
      reminder_days: 30,
      category: '',
      assigned_to: 'unassigned',
      client_id: 'no_client',
      status: 'pending',
    });
    setEditingDueDate(null);
  };

  const getUserName = (userId) => {
    const foundUser = users.find(u => u.id === userId);
    return foundUser?.full_name || 'Unassigned';
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.company_name || '-';
  };

  // Get display status based on date
  const getDisplayStatus = (dueDate) => {
    if (dueDate.status === 'completed') return 'completed';
    const daysLeft = differenceInDays(new Date(dueDate.due_date), new Date());
    if (daysLeft < 0) return 'overdue';
    if (daysLeft <= 7) return 'upcoming';
    return 'pending';
  };

  // Filter due dates
  const filteredDueDates = dueDates.filter(dd => {
    const matchesSearch = dd.title.toLowerCase().includes(searchQuery.toLowerCase());
    const displayStatus = getDisplayStatus(dd);
    const matchesStatus = filterStatus === 'all' || displayStatus === filterStatus;
    const matchesCategory = filterCategory === 'all' || dd.category === filterCategory;
    
    let matchesMonth = true;
    if (filterMonth !== 'all') {
      const dueMonth = new Date(dd.due_date).getMonth();
      matchesMonth = dueMonth === parseInt(filterMonth);
    }
    
    return matchesSearch && matchesStatus && matchesCategory && matchesMonth;
  });

  // Stats
  const stats = {
    total: dueDates.length,
    upcoming: dueDates.filter(dd => {
      const daysLeft = differenceInDays(new Date(dd.due_date), new Date());
      return dd.status !== 'completed' && daysLeft >= 0 && daysLeft <= 7;
    }).length,
    pending: dueDates.filter(dd => {
      const daysLeft = differenceInDays(new Date(dd.due_date), new Date());
      return dd.status !== 'completed' && daysLeft > 7;
    }).length,
    overdue: dueDates.filter(dd => {
      const daysLeft = differenceInDays(new Date(dd.due_date), new Date());
      return dd.status !== 'completed' && daysLeft < 0;
    }).length,
    completed: dueDates.filter(dd => dd.status === 'completed').length,
  };

  const months = [
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' },
  ];

  return (
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit" style={{ color: COLORS.deepBlue }}>Compliance Calendar</h1>
          <p className="text-slate-600 mt-1">Track and manage all compliance due dates</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button
              className="text-white rounded-lg px-6 shadow-lg transition-all hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
              data-testid="add-duedate-btn"
            >
              <Plus className="mr-2 h-5 w-5" />
              New Due Date
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl" style={{ color: COLORS.deepBlue }}>
                {editingDueDate ? 'Edit Due Date' : 'Add New Due Date'}
              </DialogTitle>
              <DialogDescription>
                {editingDueDate ? 'Update compliance due date details.' : 'Create a new compliance due date reminder.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., GST Return Filing"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category || undefined}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="due_date">Due Date *</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select
                    value={formData.client_id || 'no_client'}
                    onValueChange={(value) => setFormData({ ...formData, client_id: value === 'no_client' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_client">No Client</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select
                    value={formData.assigned_to}
                    onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reminder_days">Remind Before (days)</Label>
                  <Input
                    id="reminder_days"
                    type="number"
                    min="1"
                    value={formData.reminder_days}
                    onChange={(e) => setFormData({ ...formData, reminder_days: parseInt(e.target.value) || 30 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Additional notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} style={{ background: COLORS.deepBlue }} className="text-white">
                  {loading ? 'Saving...' : editingDueDate ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Stats Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setFilterStatus('all')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-3xl font-bold mt-1" style={{ color: COLORS.deepBlue }}>{stats.total}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'upcoming' ? 'ring-2 ring-blue-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'upcoming' ? 'all' : 'upcoming')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Upcoming</p>
            <p className="text-3xl font-bold mt-1 text-blue-600">{stats.upcoming}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'pending' ? 'ring-2 ring-amber-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'overdue' ? 'ring-2 ring-red-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
            <p className="text-3xl font-bold mt-1 text-red-600">{stats.overdue}</p>
          </CardContent>
        </Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${filterStatus === 'completed' ? 'ring-2 ring-emerald-400' : 'border-slate-200'}`} onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600">{stats.completed}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search and Filters */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search due dates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white"
          />
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-white">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-36 bg-white">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Due Dates Table */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Title</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Category</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Client</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Due Date</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Assigned To</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Days Left</th>
                  <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDueDates.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-500">
                      No due dates found
                    </td>
                  </tr>
                ) : (
                  filteredDueDates.map((dueDate) => {
                    const displayStatus = getDisplayStatus(dueDate);
                    const statusStyle = STATUS_STYLES[displayStatus];
                    const daysLeft = differenceInDays(new Date(dueDate.due_date), new Date());
                    
                    return (
                      <tr key={dueDate.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                            {displayStatus === 'completed' && <CheckCircle className="h-3 w-3" />}
                            {displayStatus === 'overdue' && <AlertCircle className="h-3 w-3" />}
                            {displayStatus === 'upcoming' && <Clock className="h-3 w-3" />}
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium" style={{ color: COLORS.deepBlue }}>{dueDate.title}</p>
                          {dueDate.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{dueDate.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" style={{ borderColor: COLORS.mediumBlue, color: COLORS.mediumBlue }}>
                            {dueDate.category || 'Other'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {dueDate.client_id ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-slate-400" />
                              {getClientName(dueDate.client_id)}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {format(new Date(dueDate.due_date), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-400" />
                            {getUserName(dueDate.assigned_to)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {dueDate.status === 'completed' ? (
                            <span className="text-sm text-emerald-600 font-medium">Done</span>
                          ) : (
                            <span className={`text-sm font-semibold ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-600'}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} days ago` : `${daysLeft} days`}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-blue-50"
                              onClick={() => handleEdit(dueDate)}
                            >
                              <Edit className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-red-50"
                              onClick={() => handleDelete(dueDate.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
