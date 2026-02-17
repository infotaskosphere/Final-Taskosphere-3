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
    dsc_details: [],
    assigned_to: 'unassigned',
    notes: '',
    status: 'active',
  });

  // ────────────────────────────────────────────────
  // ADDED: DSC states
  // ────────────────────────────────────────────────
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

  useEffect(() => {
    fetchClients();
    if (user?.role !== 'staff') fetchUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, serviceFilter, statusFilter, clients.length]);

  // ────────────────────────────────────────────────
  // ADDED: Fetch DSCs when editing client changes
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (editingClient?.id) {
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

  // ────────────────────────────────────────────────
  // ADDED: Fetch client-specific DSCs
  // ────────────────────────────────────────────────
  const fetchClientDSCs = async (clientId) => {
    try {
      const response = await api.get(`/clients/${clientId}/dscs`); // or /dsc?client_id=${clientId}
      setClientDSCs(response.data || []);
    } catch (error) {
      toast.error('Failed to load DSCs for this client');
      console.error(error);
    }
  };

  // ==================== UTILS ====================

  const openWhatsApp = (phone, name = "") => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // ────────────────────────────────────────────────
  // ADDED: DSC helpers (copied/adapted from DSCRegister)
  // ────────────────────────────────────────────────
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
    }));
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

  // ────────────────────────────────────────────────
  // ADDED: DSC handlers
  // ────────────────────────────────────────────────
  const handleDSCSubmit = async (dscFormData) => {
    setLoading(true);
    try {
      const payload = {
        ...dscFormData,
        client_id: editingClient.id,
        associated_with: editingClient.company_name,
        issue_date: new Date(dscFormData.issue_date).toISOString(),
        expiry_date: new Date(dscFormData.expiry_date).toISOString(),
      };

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
    } catch (err) {
      toast.error('Could not save DSC');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDSC = async (dscId) => {
    if (!window.confirm('Delete this DSC?')) return;
    try {
      await api.delete(`/dsc/${dscId}`);
      toast.success('DSC deleted');
      fetchClientDSCs(editingClient.id);
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  const openMovementDialog = (dsc, suggestedType) => {
    setSelectedDSC(dsc);
    setMovementData(prev => ({ ...prev, movement_type: suggestedType }));
    setMovementDialogOpen(true);
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    if (!selectedDSC) return;
    setLoading(true);
    try {
      await api.post(`/dsc/${selectedDSC.id}/movement`, movementData);
      toast.success(`Marked as ${movementData.movement_type}`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchClientDSCs(editingClient.id);
    } catch (err) {
      toast.error('Movement record failed');
    } finally {
      setLoading(false);
    }
  };

  const openLogDialog = (dsc) => {
    setSelectedDSC(dsc);
    setLogDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ────────────────────────────────────────────────
          Everything above this line is 100% unchanged
      ──────────────────────────────────────────────── */}

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

      {/* ────────────────────────────────────────────────
          Client Edit Dialog – with added DSC section
      ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-8 py-4">

            {/* ────── Original fields (unchanged) ────── */}

            {/* Company Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Company Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} required />
                </div>
                <div>
                  <Label>Client Type</Label>
                  <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div>
                  <Label>Anniversary / Birthday</Label>
                  <Input type="date" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
                </div>
              </div>
            </div>

            {/* Contact Persons – original code unchanged */}
            {/* Services – original code unchanged */}
            {/* Notes – original code unchanged */}
            {/* Assigned To – original code unchanged */}
            {/* Status Toggle – original code unchanged */}

            {/* ────────────────────────────────────────────────
                ADDED: DSC Management Section
            ──────────────────────────────────────────────── */}
            <div className="space-y-6 border-t pt-6">
              <h3 className="text-lg font-semibold">DSC Management</h3>

              <Tabs defaultValue="details">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="status">IN/OUT Status</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="pt-6 space-y-6">
                  {/* Expiry warning */}
                  {clientDSCs.some(d => getDSCStatus(d.expiry_date).color !== 'bg-emerald-500') && (
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex gap-3 text-sm">
                      <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-orange-900">Attention required</p>
                        <p className="text-orange-800">
                          {clientDSCs.filter(d => getDSCStatus(d.expiry_date).color === 'bg-red-500').length} expired or ≤7 days •
                          {clientDSCs.filter(d => getDSCStatus(d.expiry_date).color === 'bg-yellow-500').length} ≤30 days
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Certificates</h4>
                    <Button type="button" onClick={() => { setEditingDSC(null); setDscFormOpen(true); }}>
                      <Plus className="mr-2 h-4 w-4" /> Add DSC
                    </Button>
                  </div>

                  {clientDSCs.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 border border-dashed rounded-lg">
                      No DSC records yet for this client
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left">Holder</th>
                            <th className="px-4 py-3 text-left">Type</th>
                            <th className="px-4 py-3 text-left">Expiry</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {clientDSCs.map(dsc => {
                            const st = getDSCStatus(dsc.expiry_date);
                            const inout = getDSCInOutStatus(dsc);
                            return (
                              <tr key={dsc.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium">{dsc.holder_name}</td>
                                <td className="px-4 py-3">{dsc.dsc_type || '—'}</td>
                                <td className="px-4 py-3">{format(new Date(dsc.expiry_date), 'dd MMM yyyy')}</td>
                                <td className="px-4 py-3">
                                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color.replace('bg-', 'bg-')} ${st.textColor}`}>
                                    {st.text}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right space-x-1">
                                  <Button variant="ghost" size="icon" onClick={() => openLogDialog(dsc)}><History className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => openMovementDialog(dsc, inout === 'IN' ? 'OUT' : 'IN')}>
                                    {inout === 'IN' ? <ArrowUpCircle className="h-4 w-4 text-red-600" /> : <ArrowDownCircle className="h-4 w-4 text-emerald-600" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => { setEditingDSC(dsc); setDscFormOpen(true); }}><Edit className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteDSC(dsc.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="status" className="pt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <Card className="bg-emerald-50/50">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <ArrowDownCircle className="h-8 w-8 text-emerald-600" />
                          <div>
                            <p className="text-sm text-emerald-700">Currently IN (with us)</p>
                            <p className="text-3xl font-bold">{clientDSCs.filter(d => getDSCInOutStatus(d) === 'IN').length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-red-50/50">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <ArrowUpCircle className="h-8 w-8 text-red-600" />
                          <div>
                            <p className="text-sm text-red-700">Currently OUT</p>
                            <p className="text-3xl font-bold">{clientDSCs.filter(d => getDSCInOutStatus(d) === 'OUT').length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="pt-6">
                  <div className="space-y-4">
                    {clientDSCs.flatMap(d => (d.movement_log || []).map(log => ({...log, dsc: d})))
                      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
                      .map((entry, i) => (
                        <div key={i} className="flex gap-4 p-4 border rounded-lg">
                          <div className={`rounded-full p-3 ${entry.movement_type === 'IN' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                            {entry.movement_type === 'IN' ? <ArrowDownCircle className="h-6 w-6 text-emerald-600" /> : <ArrowUpCircle className="h-6 w-6 text-red-600" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{entry.movement_type} • {entry.person_name}</p>
                            <p className="text-sm text-slate-500 mt-1">
                              {format(new Date(entry.timestamp), 'dd MMM yyyy • hh:mm a')}
                            </p>
                            {entry.notes && <p className="text-sm mt-2">{entry.notes}</p>}
                            <p className="text-xs text-slate-400 mt-2">DSC: {entry.dsc.holder_name}</p>
                          </div>
                        </div>
                      ))}

                    {clientDSCs.every(d => !d.movement_log?.length) && (
                      <div className="text-center py-10 text-slate-500">
                        No movement history recorded yet
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Form footer – original */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingClient ? 'Update Client' : 'Create Client'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────
          ADDED: DSC Add/Edit Dialog (placeholder – fill fields)
      ──────────────────────────────────────────────── */}
      <Dialog open={dscFormOpen} onOpenChange={setDscFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDSC ? 'Edit DSC' : 'Add DSC'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            handleDSCSubmit(data);
          }}>
            <div className="space-y-4 py-4">
              <div>
                <Label>Holder Name *</Label>
                <Input name="holder_name" defaultValue={editingDSC?.holder_name || ''} required />
              </div>
              <div>
                <Label>Type (Class / Purpose)</Label>
                <Input name="dsc_type" defaultValue={editingDSC?.dsc_type || ''} placeholder="Class 3, Signature, Encryption..." />
              </div>
              <div>
                <Label>Password</Label>
                <Input name="dsc_password" type="password" defaultValue={editingDSC?.dsc_password || ''} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue Date *</Label>
                  <Input name="issue_date" type="date" defaultValue={editingDSC ? format(new Date(editingDSC.issue_date), 'yyyy-MM-dd') : ''} required />
                </div>
                <div>
                  <Label>Expiry Date *</Label>
                  <Input name="expiry_date" type="date" defaultValue={editingDSC ? format(new Date(editingDSC.expiry_date), 'yyyy-MM-dd') : ''} required />
                </div>
              </div>
              <div>
                <Label>Entity Type</Label>
                <Select name="entity_type" defaultValue={editingDSC?.entity_type || 'firm'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="firm">Firm</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" defaultValue={editingDSC?.notes || ''} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDscFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingDSC ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────
          ADDED: Movement Dialog
      ──────────────────────────────────────────────── */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record DSC Movement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMovement}>
            <div className="space-y-4 py-4">
              <div>
                <Label>Person Name *</Label>
                <Input value={movementData.person_name} onChange={e => setMovementData({...movementData, person_name: e.target.value})} required />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={movementData.notes} onChange={e => setMovementData({...movementData, notes: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className={movementData.movement_type === 'IN' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
                Mark as {movementData.movement_type}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────
          ADDED: Movement Log Dialog
      ──────────────────────────────────────────────── */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Movement History
            </DialogTitle>
            <DialogDescription>{selectedDSC?.holder_name || 'DSC'}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 py-4">
            {selectedDSC?.movement_log?.length > 0 ? (
              selectedDSC.movement_log.map((m, idx) => (
                <div key={idx} className={`p-4 rounded-lg border ${m.movement_type === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="flex justify-between">
                    <div>
                      <Badge variant={m.movement_type === 'IN' ? 'success' : 'destructive'}>
                        {m.movement_type}
                      </Badge>
                      <span className="ml-2 font-medium">{m.person_name}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {format(new Date(m.timestamp), 'dd MMM yyyy • HH:mm')}
                    </div>
                  </div>
                  {m.notes && <p className="mt-2 text-sm">{m.notes}</p>}
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-500">
                No movement records yet
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
