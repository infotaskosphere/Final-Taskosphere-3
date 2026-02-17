import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { 
  Plus, Edit, Trash2, Mail, Cake, X, UserPlus, 
  FileText, Calendar, Search, Filter, Users, 
  Briefcase, BarChart3, Archive, MessageCircle, Trash,
  AlertCircle, ArrowDownCircle, ArrowUpCircle, History
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import Papa from 'papaparse';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');

  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
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

  // DSC-specific states
  const [clientDSCs, setClientDSCs] = useState([]);
  const [dscDialogOpen, setDscDialogOpen] = useState(false);
  const [editingDSC, setEditingDSC] = useState(null);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedDSC, setSelectedDSC] = useState(null);
  const [movementData, setMovementData] = useState({
    movement_type: 'IN',
    person_name: '',
    notes: '',
  });
  const [editMovementData, setEditMovementData] = useState({
    movement_type: 'IN',
    person_name: '',
    notes: '',
  });
  const [editingMovement, setEditingMovement] = useState(null);

  useEffect(() => {
    fetchClients();
    if (user?.role !== 'staff') fetchUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, serviceFilter, statusFilter, clients.length]);

  useEffect(() => {
    if (editingClient) {
      fetchClientDSCs(editingClient.id);
    }
  }, [editingClient]);

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch (error) {
      toast.error('Failed to fetch clients');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchClientDSCs = async (clientId) => {
    try {
      const response = await api.get(`/clients/${clientId}/dscs`);
      setClientDSCs(response.data);
    } catch (error) {
      toast.error('Failed to fetch DSCs');
    }
  };

  // ==================== UTILS ====================

  const openWhatsApp = (phone, name = "") => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // DSC helpers
  const getDSCStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-700' };
    } else if (daysLeft <= 7) {
      return { color: 'bg-red-500', text: `${daysLeft} Days left`, textColor: 'text-red-700' };
    } else if (daysLeft <= 30) {
      return { color: 'bg-yellow-500', text: `${daysLeft} Days left`, textColor: 'text-yellow-700' };
    }
    return { color: 'bg-emerald-500', text: `${daysLeft} Days left`, textColor: 'text-emerald-700' };
  };

  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  // ==================== MEMOIZED DATA ====================

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter(c => (c.status || 'active') === 'active').length;
    const serviceCounts = {};
    clients.forEach(c => {
      if ((c.status || 'active') === 'active' && c.services) {
        c.services.forEach(s => {
          const name = s.startsWith('Other:') ? 'Other' : s;
          serviceCounts[name] = (serviceCounts[name] || 0) + 1;
        });
      }
    });
    return { totalClients, activeClients, serviceCounts };
  }, [clients]);

  const todayReminders = useMemo(() => {
    const today = startOfDay(new Date());
    return clients.filter(c => {
      if (c.birthday) {
        const anniv = new Date(c.birthday);
        if (anniv.getMonth() === today.getMonth() && anniv.getDate() === today.getDate()) return true;
      }
      return c.contact_persons?.some(cp => {
        if (!cp.birthday) return false;
        const bday = new Date(cp.birthday);
        return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
      });
    });
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = c.company_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           c.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           c.phone.includes(searchTerm);
      const matchesService = serviceFilter === 'all' || 
                            (c.services && c.services.some(s => s.toLowerCase().includes(serviceFilter.toLowerCase())));
      const matchesStatus = statusFilter === 'all' || (c.status || 'active') === statusFilter;
      return matchesSearch && matchesService && matchesStatus;
    });
  }, [clients, searchTerm, serviceFilter, statusFilter]);

  const currentClients = filteredClients.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);

  const getClientNumber = (index) => `#${String(((currentPage - 1) * ITEMS_PER_PAGE) + index + 1).padStart(3, '0')}`;

  // ==================== HANDLERS ====================

  const downloadTemplate = () => {
    const headers = ['company_name', 'client_type', 'email', 'phone', 'birthday', 'contact_name_1', 'contact_designation_1', 'contact_email_1', 'contact_phone_1', 'services', 'notes'];
    const csvContent = headers.join(',') + '\n' + '"ABC Enterprises","proprietor","company@example.com","+919876543210","2025-04-15","Rahul Sharma","Director","rahul@abc.com","GST,Income Tax","Notes"';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'clients-import-template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImportLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let count = 0;
        for (let row of results.data) {
          if (!row.company_name) continue;
          try {
            await api.post('/clients', {
              company_name: row.company_name,
              client_type: row.client_type || 'proprietor',
              email: row.email,
              phone: row.phone,
              birthday: row.birthday || '',
              services: row.services ? row.services.split(',').map(s => s.trim()) : [],
              contact_persons: [{ name: row.contact_name_1 || '', designation: row.contact_designation_1 || '', email: row.contact_email_1 || '', phone: row.contact_phone_1 || '', birthday: '' }],
              status: 'active'
            });
            count++;
          } catch (e) { console.error(e); }
        }
        setImportLoading(false);
        if (count > 0) { toast.success(`${count} clients imported!`); fetchClients(); }
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (otherService) {
        formData.services.push(`Other: ${otherService}`);
      }
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, formData);
        toast.success('Client updated successfully!');
      } else {
        await api.post('/clients', formData);
        toast.success('Client added successfully!');
      }
      setDialogOpen(false);
      resetForm();
      fetchClients();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      company_name: client.company_name,
      client_type: client.client_type || 'proprietor',
      contact_persons: client.contact_persons || [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
      email: client.email,
      phone: client.phone,
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

  const addContactPerson = () => {
    setFormData({
      ...formData,
      contact_persons: [...formData.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '' }],
    });
  };

  const updateContactPerson = (index, field, value) => {
    const updatedContacts = formData.contact_persons.map((cp, i) => 
      i === index ? { ...cp, [field]: value } : cp
    );
    setFormData({ ...formData, contact_persons: updatedContacts });
  };

  const removeContactPerson = (index) => {
    const updatedContacts = formData.contact_persons.filter((_, i) => i !== index);
    setFormData({ ...formData, contact_persons: updatedContacts });
  };

  const toggleService = (service) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service]
    });
  };

  const handleToggleStatus = async (clientId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/clients/${clientId}`, { status: newStatus });
      toast.success(`Client ${newStatus === 'active' ? 'activated' : 'archived'}`);
      fetchClients();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // DSC Handlers
  const handleDSCSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dscData = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        expiry_date: new Date(formData.expiry_date).toISOString(),
      };

      if (editingDSC) {
        await api.put(`/dsc/${editingDSC.id}`, dscData);
        toast.success('DSC updated successfully!');
      } else {
        dscData.associated_with = editingClient.company_name;
        dscData.client_id = editingClient.id;
        await api.post('/dsc', dscData);
        toast.success('DSC added successfully!');
      }

      setDscDialogOpen(false);
      resetDSCForm();
      fetchClientDSCs(editingClient.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save DSC');
    } finally {
      setLoading(false);
    }
  };

  const resetDSCForm = () => {
    setFormData({
      holder_name: '',
      dsc_type: '',
      dsc_password: '',
      associated_with: '',
      entity_type: 'firm',
      issue_date: '',
      expiry_date: '',
      notes: '',
    });
    setEditingDSC(null);
  };

  const handleDeleteDSC = async (dscId) => {
    if (!window.confirm('Are you sure you want to delete this DSC?')) return;

    try {
      await api.delete(`/dsc/${dscId}`);
      toast.success('DSC deleted successfully!');
      fetchClientDSCs(editingClient.id);
    } catch (error) {
      toast.error('Failed to delete DSC');
    }
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post(`/dsc/${selectedDSC.id}/movement`, movementData);
      toast.success(`DSC marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchClientDSCs(editingClient.id);
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (dsc, type) => {
    setSelectedDSC(dsc);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (dsc) => {
    setSelectedDSC(dsc);
    setLogDialogOpen(true);
  };

  const handleUpdateMovement = async (movementId) => {
    if (!editingDSC || !editMovementData.person_name) return;
    setLoading(true);

    try {
      await api.put(`/dsc/${editingDSC.id}/movement/${movementId}`, {
        movement_id: movementId,
        movement_type: editMovementData.movement_type,
        person_name: editMovementData.person_name,
        notes: editMovementData.notes,
      });
      toast.success('Movement log updated successfully!');
      setEditingMovement(null);
      
      // Refresh
      fetchClientDSCs(editingClient.id);
      const updatedDSC = clientDSCs.find(d => d.id === editingDSC.id);
      if (updatedDSC) {
        setEditingDSC(updatedDSC);
      }
    } catch (error) {
      toast.error('Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  const startEditingMovement = (movement) => {
    setEditingMovement(movement.id || movement.timestamp);
    setEditMovementData({
      movement_type: movement.movement_type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">Clients</h1>
          <p className="text-slate-600 mt-1">Manage your clients efficiently</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={downloadTemplate}><FileText className="h-4 w-4" /> Template</Button>
          <Button variant="outline" className="gap-2" disabled={importLoading} onClick={() => fileInputRef.current?.click()}>{importLoading ? 'Importing...' : <><FileText className="h-4 w-4" /> Import CSV</>}</Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"><Plus className="h-5 w-5" /> Add Client</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
              <div className="sticky top-0 bg-white z-10 border-b p-6">
                <DialogHeader>
                  <DialogTitle className="font-outfit text-2xl">{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
                  <DialogDescription>Fill in the client details below.</DialogDescription>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-8">
                {/* Company Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase text-slate-500">Company Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="company_name">Company Name</Label>
                      <Input id="company_name" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} required />
                    </div>
                    <div>
                      <Label htmlFor="client_type">Client Type</Label>
                      <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                    <div>
                      <Label htmlFor="birthday">Anniversary Date</Label>
                      <Input id="birthday" type="date" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
                    </div>
                  </div>
                </div>

                {/* Contact Persons */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold uppercase text-slate-500">Contact Persons</h3>
                    <Button type="button" variant="outline" className="gap-2" onClick={addContactPerson}><UserPlus className="h-4 w-4" /> Add Contact</Button>
                  </div>
                  {formData.contact_persons.map((cp, index) => (
                    <Card key={index} className="p-4 relative">
                      {index > 0 && <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-red-500" onClick={() => removeContactPerson(index)}><X className="h-4 w-4" /></Button>}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`cp_name_${index}`}>Name</Label>
                          <Input id={`cp_name_${index}`} value={cp.name} onChange={e => updateContactPerson(index, 'name', e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor={`cp_designation_${index}`}>Designation</Label>
                          <Input id={`cp_designation_${index}`} value={cp.designation} onChange={e => updateContactPerson(index, 'designation', e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor={`cp_email_${index}`}>Email</Label>
                          <Input id={`cp_email_${index}`} type="email" value={cp.email} onChange={e => updateContactPerson(index, 'email', e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor={`cp_phone_${index}`}>Phone</Label>
                          <Input id={`cp_phone_${index}`} value={cp.phone} onChange={e => updateContactPerson(index, 'phone', e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor={`cp_birthday_${index}`}>Birthday</Label>
                          <Input id={`cp_birthday_${index}`} type="date" value={cp.birthday} onChange={e => updateContactPerson(index, 'birthday', e.target.value)} />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Services */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase text-slate-500">Services</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {SERVICES.map(service => (
                      <Button 
                        key={service} 
                        variant={formData.services.includes(service) ? "default" : "outline"} 
                        className={`justify-start ${formData.services.includes(service) ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
                        onClick={() => toggleService(service)}
                      >
                        {service}
                      </Button>
                    ))}
                  </div>
                  {formData.services.includes('Other') && (
                    <div className="mt-4">
                      <Label htmlFor="other_service">Other Service Details</Label>
                      <Input id="other_service" value={otherService} onChange={e => setOtherService(e.target.value)} placeholder="Specify other service" />
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase text-slate-500">Notes</h3>
                  <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={4} />
                </div>

                {/* Assigned To (Admin/Manager only) */}
                {(user?.role === 'admin' || user?.role === 'manager') && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase text-slate-500">Assignment</h3>
                    <Select value={formData.assigned_to} onValueChange={v => setFormData({...formData, assigned_to: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assign to" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Status Toggle (Admin only) */}
                {user?.role === 'admin' && editingClient && (
                  <div className="flex items-center gap-3">
                    <Switch 
                      checked={formData.status === 'active'} 
                      onCheckedChange={checked => setFormData({...formData, status: checked ? 'active' : 'inactive'})}
                    />
                    <Label>Active Client</Label>
                  </div>
                )}

                {/* DSC Details Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase text-slate-500">DSC Details</h3>
                  {/* DSC Expiry Alert */}
                  {clientDSCs.filter(dsc => getDSCStatus(dsc.expiry_date).color !== 'bg-emerald-500').length > 0 && (
                    <Card className="border-2 border-orange-200 bg-orange-50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                          <div>
                            <h3 className="font-semibold text-orange-900">Attention Required</h3>
                            <p className="text-sm text-orange-700 mt-1">
                              {clientDSCs.filter(dsc => getDSCStatus(dsc.expiry_date).color === 'bg-red-500').length} certificate(s) expired or expiring within 7 days.
                              {clientDSCs.filter(dsc => getDSCStatus(dsc.expiry_date).color === 'bg-yellow-500').length} certificate(s) expiring within 30 days.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Tabs defaultValue="IN">
                    <TabsList>
                      <TabsTrigger value="IN">IN</TabsTrigger>
                      <TabsTrigger value="OUT">OUT</TabsTrigger>
                    </TabsList>
                    <TabsContent value="IN">
                      <DSCTable 
                        dscList={clientDSCs.filter(dsc => getDSCInOutStatus(dsc) === 'IN')}
                        onEdit={openEditDSC}
                        onDelete={handleDeleteDSC}
                        onMovement={openMovementDialog}
                        onViewLog={openLogDialog}
                        getDSCStatus={getDSCStatus}
                        type="IN"
                      />
                    </TabsContent>
                    <TabsContent value="OUT">
                      <DSCTable 
                        dscList={clientDSCs.filter(dsc => getDSCInOutStatus(dsc) === 'OUT')}
                        onEdit={openEditDSC}
                        onDelete={handleDeleteDSC}
                        onMovement={openMovementDialog}
                        onViewLog={openLogDialog}
                        getDSCStatus={getDSCStatus}
                        type="OUT"
                      />
                    </TabsContent>
                  </Tabs>
                </div>

                <DialogFooter className="sticky bottom-0 bg-white border-t p-6 z-10 flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                    {loading ? 'Saving...' : editingClient ? 'Update' : 'Save'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Same-Day Birthday Reminders (Admin/Manager Only) */}
      {(user?.role === 'admin' || user?.role === 'manager') && todayReminders.length > 0 && (
        <Card className="bg-pink-50 border-pink-100 animate-pulse">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-white rounded-full text-pink-500 shadow-sm"><Cake className="h-5 w-5" /></div>
            <div>
              <h4 className="text-sm font-bold text-pink-900">Today's Celebrations</h4>
              <div className="flex flex-wrap gap-2 mt-1">
                {todayReminders.map(c => <Badge key={c.id} className="bg-white text-pink-700 border-pink-200 shadow-sm">{c.company_name}</Badge>)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin Stats Dashboard Row */}
      {user?.role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Users className="h-5 w-5" /></div>
            <div><p className="text-[10px] uppercase text-slate-400 font-bold">Total Clients</p><h2 className="text-xl font-bold">{stats.totalClients}</h2></div>
          </Card>
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Briefcase className="h-5 w-5" /></div>
            <div><p className="text-[10px] uppercase text-slate-400 font-bold">Active</p><h2 className="text-xl font-bold">{stats.activeClients}</h2></div>
          </Card>
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><Archive className="h-5 w-5" /></div>
            <div><p className="text-[10px] uppercase text-slate-400 font-bold">Archived</p><h2 className="text-xl font-bold">{stats.totalClients - stats.activeClients}</h2></div>
          </Card>
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><BarChart3 className="h-5 w-5" /></div>
            <div className="overflow-hidden"><p className="text-[10px] uppercase text-slate-400 font-bold">Top Service</p><h2 className="text-sm font-bold truncate">{Object.entries(stats.serviceCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'N/A'}</h2></div>
          </Card>
        </div>
      )}

      {/* Search & Global Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" /><Input placeholder="Search company, email or phone..." className="pl-9 h-10 bg-slate-50 border-none focus-visible:ring-indigo-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-10 bg-slate-50 border-none w-[110px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Archived</SelectItem><SelectItem value="all">All</SelectItem></SelectContent></Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}><SelectTrigger className="h-10 bg-slate-50 border-none w-[150px] text-xs"><SelectValue placeholder="Service" /></SelectTrigger><SelectContent><SelectItem value="all">All Services</SelectItem>{SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      {/* Client Grid Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentClients.map((c, i) => (
          <Card key={c.id} className={`overflow-hidden transition-all border-slate-200 ${c.status === 'inactive' ? 'opacity-60 grayscale-[0.2]' : 'hover:shadow-md'}`}>
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <div className="flex justify-between items-start">
                <div><CardTitle className="text-base font-bold">{getClientNumber(i)} {c.company_name}</CardTitle><p className="text-[10px] text-slate-500">{CLIENT_TYPES.find(t => t.value === c.client_type)?.label || c.client_type}</p></div>
                <div className="flex gap-1">
                  {c.status === 'inactive' && <Badge variant="outline" className="text-[8px] uppercase text-slate-300 border-slate-200">Archived</Badge>}
                  {c.birthday && <Calendar className="h-4 w-4 text-blue-400" />}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="text-xs space-y-1 text-slate-600 font-medium">
                <p className="flex items-center gap-2"><Mail className="h-3 w-3 text-slate-400" /> {c.email}</p>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2"><Briefcase className="h-3 w-3 text-slate-400" /> {c.phone}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-full" onClick={() => openWhatsApp(c.phone, c.company_name)}><MessageCircle className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {c.services?.slice(0, 3).map(s => <Badge key={s} variant="secondary" className="text-[9px] bg-slate-100 text-slate-500 border-none px-2 rounded-full">{s.replace('Other: ', '')}</Badge>)}
                {c.services?.length > 3 && <span className="text-[9px] text-slate-400 ml-1">+{c.services.length - 3}</span>}
              </div>
              <div className="flex gap-2 pt-3 border-t justify-end">
                <Button variant="ghost" size="sm" className="h-8 text-indigo-600 hover:bg-indigo-50 px-3" onClick={() => handleEdit(c)}><Edit className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                {user?.role === 'admin' && <Button variant="ghost" size="sm" className="h-8 text-red-500 hover:bg-red-50 px-3" onClick={() => { if(confirm("Delete client record?")) api.delete(`/clients/${c.id}`).then(()=>fetchClients()) }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 pt-4">
          <Button variant="outline" size="sm" className="rounded-xl h-9 border-slate-200 text-slate-600" disabled={currentPage === 1} onClick={() => setCurrentPage(v => v - 1)}>Prev</Button>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" className="rounded-xl h-9 border-slate-200 text-slate-600" disabled={currentPage === totalPages} onClick={() => setCurrentPage(v => v + 1)}>Next</Button>
        </div>
      )}
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />
    </div>
  );
}

// DSC Table Component
function DSCTable({ dscList, onEdit, onDelete, onMovement, onViewLog, getDSCStatus, type }) {
  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-12">
              S.No
            </th> 
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[150px]">
              Holder Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[150px]">
              Associated With
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">
              Expiry Date
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-32">
              Status
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-36">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {dscList.map((dsc, index) => {
            const status = getDSCStatus(dsc.expiry_date);
            return (
              <tr
                key={dsc.id}
                className="hover:bg-slate-50 transition-colors"
                data-testid={`dsc-row-${dsc.id}`}
              >
                <td className="px-4 py-3 text-sm text-slate-500">
                  {index + 1}
                </td>
                
                <td className="px-4 py-3 text-sm font-medium text-slate-900 break-words leading-tight">
                  {dsc.holder_name}
                </td>

                <td className="px-4 py-3 text-sm text-slate-600 truncate">
                  {dsc.dsc_type || '-'}
                </td>

                <td className="px-4 py-3 text-sm text-slate-600 break-words leading-tight">
                  {dsc.associated_with || '-'}
                </td>

                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                  {format(new Date(dsc.expiry_date), 'MMM dd, yyyy')}
                </td>
                
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${status.color}`}></div>
                    <span className={`text-[12px] font-medium leading-none ${status.textColor}`}>
                      {status.text}
                    </span>
                  </div>
                </td>

                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewLog(dsc)}
                      className="h-8 w-8 p-0 hover:bg-slate-100"
                      title="View Log"
                    >
                      <History className="h-4 w-4 text-slate-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMovement(dsc, type === 'IN' ? 'OUT' : 'IN')}
                      className={`h-8 w-8 p-0 ${type === 'IN' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
                      title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                    >
                      {type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(dsc)}
                      className="h-8 w-8 p-0 hover:bg-indigo-50 text-indigo-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(dsc.id)}
                      className="h-8 w-8 p-0 hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

  // ─── DSC Dialog ──────────────────────────────────────────────────────────────

  <Dialog open={dscDialogOpen} onOpenChange={setDscDialogOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editingDSC ? 'Edit DSC' : 'Add New DSC'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleDSCSubmit}>
        <div className="space-y-4">
          <div>
            <Label>Holder Name *</Label>
            <Input value={formData.holder_name} onChange={e => setFormData({...formData, holder_name: e.target.value})} required />
          </div>
          <div>
            <Label>Type</Label>
            <Input value={formData.dsc_type} onChange={e => setFormData({...formData, dsc_type: e.target.value})} placeholder="e.g., Class 3, Signature, Encryption" />
          </div>
          <div>
            <Label>Password</Label>
            <Input value={formData.dsc_password} onChange={e => setFormData({...formData, dsc_password: e.target.value})} />
          </div>
          <div>
            <Label>Entity Type</Label>
            <Select value={formData.entity_type} onValueChange={v => setFormData({...formData, entity_type: v})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="firm">Firm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Issue Date *</Label>
              <Input type="date" value={formData.issue_date} onChange={e => setFormData({...formData, issue_date: e.target.value})} required />
            </div>
            <div>
              <Label>Expiry Date *</Label>
              <Input type="date" value={formData.expiry_date} onChange={e => setFormData({...formData, expiry_date: e.target.value})} required />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => setDscDialogOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : editingDSC ? 'Update DSC' : 'Add DSC'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  // ─── Movement Dialog ─────────────────────────────────────────────────────────

  <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Record DSC Movement</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleMovement}>
        <div className="space-y-4">
          <div>
            <Label>Person Name</Label>
            <Input value={movementData.person_name} onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })} required />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={movementData.notes} onChange={(e) => setMovementData({ ...movementData, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Recording...' : `Mark as ${movementData.movement_type}`}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  // ─── Log Dialog ──────────────────────────────────────────────────────────────

  <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Movement Log</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        {selectedDSC?.movement_log?.map((movement, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {movement.movement_type === 'IN' ? (
                    <Badge className="bg-emerald-600">IN</Badge>
                  ) : (
                    <Badge className="bg-red-600">OUT</Badge>
                  )}
                  <span className="text-sm font-medium">{movement.person_name}</span>
                </div>
                <p className="text-sm text-slate-600">
                  {movement.movement_type === 'IN' ? 'Delivered by' : 'Taken by'}: {movement.person_name}
                </p>
                <p className="text-xs text-slate-500">
                  Recorded by: {movement.recorded_by}
                </p>
                {movement.notes && (
                  <p className="text-sm text-slate-600 mt-2">{movement.notes}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">
                  {format(new Date(movement.timestamp), 'MMM dd, yyyy')}
                </p>
                <p className="text-xs text-slate-500">
                  {format(new Date(movement.timestamp), 'hh:mm a')}
                </p>
              </div>
            </div>
          </Card>
        )) || (
          <div className="text-center py-8 text-slate-500">
            <History className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p>No movement history yet</p>
          </div>
        )}
      </div>
    </DialogContent>
  </Dialog>
    </div>
  );
}
