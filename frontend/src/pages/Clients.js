import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Mail, Cake, MessageCircle, Users,
  Briefcase, BarChart3, Archive, Search, Calendar, History,
  ArrowDownCircle, ArrowUpCircle, AlertCircle
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import Papa from 'papaparse';

const CLIENT_TYPES = [
  { value: 'proprietor', label: 'Proprietor' },
  { value: 'pvt_ltd', label: 'Private Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'huf', label: 'HUF' },
  { value: 'trust', label: 'Trust' },
];

const SERVICES = [
  'GST', 'Trademark', 'Income Tax', 'ROC', 'Audit', 'Compliance',
  'Company Registration', 'Tax Planning', 'Accounting', 'Payroll', 'Other'
];

const ITEMS_PER_PAGE = 6;

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [otherService, setOtherService] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');

  // DSC states
  const [clientDSCs, setClientDSCs] = useState([]);
  const [dscFormOpen, setDscFormOpen] = useState(false);
  const [editingDSC, setEditingDSC] = useState(null);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedDSC, setSelectedDSC] = useState(null);
  const [movementData, setMovementData] = useState({
    movement_type: 'IN',
    person_name: '',
    notes: '',
  });

  const [formData, setFormData] = useState({
    company_name: '',
    client_type: 'proprietor',
    contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
    email: '',
    phone: '',
    birthday: '',
    services: [],
    dsc_details: [],
    assigned_to: 'unassigned',
    notes: '',
    status: 'active',
  });

  useEffect(() => {
    fetchClients();
    if (user?.role !== 'staff') fetchUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, serviceFilter, statusFilter, clients.length]);

  useEffect(() => {
    if (editingClient?.id) {
      fetchClientDSCs(editingClient.id);
      setOtherService(
        editingClient.services?.find(s => s.startsWith('Other:'))?.replace('Other: ', '') || ''
      );
    }
  }, [editingClient]);

  const fetchClients = async () => {
    try {
      const res = await api.get('/clients');
      setClients(res.data);
    } catch (err) {
      toast.error('Failed to fetch clients');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClientDSCs = async (clientId) => {
    try {
      const res = await api.get(`/clients/${clientId}/dscs`);
      setClientDSCs(res.data || []);
    } catch (err) {
      toast.error('Failed to load DSCs');
    }
  };

  // ─── Utils ────────────────────────────────────────────────

  const openWhatsApp = (phone, name = '') => {
    const clean = phone.replace(/\D/g, '');
    const msg = encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`);
    window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
  };

  const getDSCStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const days = Math.ceil((expiry - now) / (86400000));
    if (days < 0) return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-700' };
    if (days <= 7) return { color: 'bg-red-500', text: `${days} Days left`, textColor: 'text-red-700' };
    if (days <= 30) return { color: 'bg-yellow-500', text: `${days} Days left`, textColor: 'text-yellow-700' };
    return { color: 'bg-emerald-500', text: `${days} Days left`, textColor: 'text-emerald-700' };
  };

  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  // ─── Memoized ─────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = clients.length;
    const active = clients.filter(c => (c.status || 'active') === 'active').length;
    const serviceCounts = {};
    clients.forEach(c => {
      if ((c.status || 'active') === 'active' && c.services) {
        c.services.forEach(s => {
          const key = s.startsWith('Other:') ? 'Other' : s;
          serviceCounts[key] = (serviceCounts[key] || 0) + 1;
        });
      }
    });
    return { totalClients: total, activeClients: active, serviceCounts };
  }, [clients]);

  const todayReminders = useMemo(() => {
    const today = startOfDay(new Date());
    return clients.filter(c => {
      if (c.birthday) {
        const d = new Date(c.birthday);
        if (d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) return true;
      }
      return c.contact_persons?.some(cp => {
        if (!cp.birthday) return false;
        const d = new Date(cp.birthday);
        return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      });
    });
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const searchMatch =
        c.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm);

      const serviceMatch =
        serviceFilter === 'all' ||
        c.services?.some(s => s.toLowerCase().includes(serviceFilter.toLowerCase()));

      const statusMatch = statusFilter === 'all' || (c.status || 'active') === statusFilter;

      return searchMatch && serviceMatch && statusMatch;
    });
  }, [clients, searchTerm, serviceFilter, statusFilter]);

  const currentClients = filteredClients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);

  // ─── Handlers ─────────────────────────────────────────────

  const toggleService = (service) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service],
    }));
  };

  const addContactPerson = () => {
    setFormData(prev => ({
      ...prev,
      contact_persons: [...prev.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '' }],
    }));
  };

  const updateContactPerson = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      contact_persons: prev.contact_persons.map((cp, i) =>
        i === index ? { ...cp, [field]: value } : cp
      ),
    }));
  };

  const removeContactPerson = (index) => {
    setFormData(prev => ({
      ...prev,
      contact_persons: prev.contact_persons.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let finalServices = [...formData.services].filter(s => !s.startsWith('Other:'));
      if (otherService.trim() && formData.services.includes('Other')) {
        finalServices.push(`Other: ${otherService.trim()}`);
      }

      const payload = { ...formData, services: finalServices };

      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
        toast.success('Client updated');
      } else {
        await api.post('/clients', payload);
        toast.success('Client created');
      }

      setDialogOpen(false);
      resetForm();
      fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      company_name: client.company_name || '',
      client_type: client.client_type || 'proprietor',
      contact_persons: client.contact_persons?.length
        ? client.contact_persons
        : [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
      email: client.email || '',
      phone: client.phone || '',
      birthday: client.birthday || '',
      services: client.services || [],
      assigned_to: client.assigned_to || 'unassigned',
      notes: client.notes || '',
      status: client.status || 'active',
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      client_type: 'proprietor',
      contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
      email: '',
      phone: '',
      birthday: '',
      services: [],
      assigned_to: 'unassigned',
      notes: '',
      status: 'active',
    });
    setOtherService('');
    setEditingClient(null);
  };

  const handleToggleStatus = async (id, current) => {
    const next = current === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/clients/${id}`, { status: next });
      toast.success(`Client ${next === 'active' ? 'activated' : 'archived'}`);
      fetchClients();
    } catch {
      toast.error('Status update failed');
    }
  };

  // DSC handlers (kept minimal – expand as needed)

  const handleDSCSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);

    const payload = {
      ...data,
      client_id: editingClient.id,
      associated_with: editingClient.company_name,
      issue_date: new Date(data.issue_date).toISOString(),
      expiry_date: new Date(data.expiry_date).toISOString(),
    };

    try {
      if (editingDSC) {
        await api.put(`/dsc/${editingDSC.id}`, payload);
        toast.success('DSC updated');
      } else {
        await api.post('/dsc', payload);
        toast.success('DSC added');
      }
      setDscFormOpen(false);
      setEditingDSC(null);
      fetchClientDSCs(editingClient.id);
    } catch {
      toast.error('DSC save failed');
    }
  };

  // ... (rest of DSC handlers like handleDeleteDSC, openMovementDialog, etc. remain the same)

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Birthday reminders */}
      {(user?.role === 'admin' || user?.role === 'manager') && todayReminders.length > 0 && (
        <Card className="bg-pink-50 border-pink-100">
          <CardContent className="p-4 flex items-center gap-4">
            <Cake className="h-6 w-6 text-pink-600" />
            <div>
              <h4 className="font-semibold text-pink-900">Today's Birthdays</h4>
              <div className="flex flex-wrap gap-2 mt-1">
                {todayReminders.map(c => (
                  <Badge key={c.id} variant="outline" className="bg-white">
                    {c.company_name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats - Admin only */}
      {user?.role === 'admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Clients</p>
              <p className="text-2xl font-bold">{stats.totalClients}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{stats.activeClients}</p>
            </CardContent>
          </Card>
          {/* ... add more stats */}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, email, phone..."
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentClients.map((client, idx) => (
          <Card key={client.id} className="overflow-hidden">
            <CardHeader className="pb-3 bg-muted/40">
              <div className="flex justify-between">
                <div>
                  <CardTitle className="text-base">
                    #{String(idx + 1 + (currentPage - 1) * ITEMS_PER_PAGE).padStart(3, '0')} {client.company_name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {CLIENT_TYPES.find(t => t.value === client.client_type)?.label || client.client_type}
                  </p>
                </div>
                {client.status === 'inactive' && (
                  <Badge variant="secondary">Archived</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {client.email || '—'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openWhatsApp(client.phone, client.company_name)}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {client.services?.slice(0, 3).map(s => (
                  <Badge key={s} variant="outline">
                    {s.replace('Other: ', '')}
                  </Badge>
                ))}
                {client.services?.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{client.services.length - 3}</span>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(client)}>
                  <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-4 mt-6">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Previous
          </Button>
          <span className="py-2 px-4 bg-muted rounded">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* ─── Client Edit/Create Dialog ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Edit Client' : 'Add Client'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-8 py-4">
            {/* Company Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Company Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input
                    required
                    value={formData.company_name}
                    onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Client Type</Label>
                  <Select
                    value={formData.client_type}
                    onValueChange={v => setFormData({ ...formData, client_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Anniversary / Birthday</Label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={e => setFormData({ ...formData, birthday: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Contact Persons */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Contact Persons</h3>
                <Button type="button" variant="outline" size="sm" onClick={addContactPerson}>
                  <Plus className="h-4 w-4 mr-2" /> Add Person
                </Button>
              </div>
              {formData.contact_persons.map((cp, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 border p-4 rounded-lg relative">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={cp.name}
                      onChange={e => updateContactPerson(idx, 'name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Designation</Label>
                    <Input
                      value={cp.designation}
                      onChange={e => updateContactPerson(idx, 'designation', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={cp.email}
                      onChange={e => updateContactPerson(idx, 'email', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={cp.phone}
                      onChange={e => updateContactPerson(idx, 'phone', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Birthday</Label>
                    <Input
                      type="date"
                      value={cp.birthday || ''}
                      onChange={e => updateContactPerson(idx, 'birthday', e.target.value)}
                    />
                  </div>
                  {formData.contact_persons.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 text-red-600"
                      onClick={() => removeContactPerson(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Services */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Services</h3>
              <div className="flex flex-wrap gap-2">
                {SERVICES.map(s => (
                  <Button
                    key={s}
                    type="button"
                    variant={formData.services.includes(s) ? 'default' : 'outline'}
                    className="rounded-full"
                    onClick={() => toggleService(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>

              {formData.services.includes('Other') && (
                <div className="mt-4 p-4 bg-muted/40 rounded-lg border border-indigo-200">
                  <Label className="text-indigo-800">Specify other service</Label>
                  <Input
                    className="mt-2"
                    placeholder="e.g. IEC Registration, FEMA, MSME..."
                    value={otherService}
                    onChange={e => setOtherService(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional information..."
                rows={4}
              />
            </div>

            {/* Assigned To & Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {user?.role === 'admin' && (
                <div>
                  <Label>Assigned To</Label>
                  <Select
                    value={formData.assigned_to}
                    onValueChange={v => setFormData({ ...formData, assigned_to: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Label>Active</Label>
                <Switch
                  checked={formData.status === 'active'}
                  onCheckedChange={checked =>
                    setFormData({ ...formData, status: checked ? 'active' : 'inactive' })
                  }
                />
              </div>
            </div>

            {/* DSC Section – placeholder (add your full DSC UI here if needed) */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold">DSC Management</h3>
              <p className="text-sm text-muted-foreground mt-2">
                DSC features available when editing an existing client.
              </p>
              {/* → Insert your Tabs + DSC table + dialogs here */}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingClient ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DSC Add/Edit Dialog – minimal version */}
      <Dialog open={dscFormOpen} onOpenChange={setDscFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDSC ? 'Edit DSC' : 'Add DSC'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDSCSubmit}>
            {/* Add your DSC fields here */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDscFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Keep your other dialogs (movement, log) as they were */}
    </div>
  );
}
