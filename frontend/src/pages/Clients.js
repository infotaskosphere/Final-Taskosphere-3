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
import { useLocation, useNavigate } from "react-router-dom";
import { 
  Plus, Edit, Trash2, Mail, Cake, X, UserPlus, 
  FileText, Calendar, Search, Users, 
  Briefcase, BarChart3, Archive, MessageCircle, Trash 
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid } from 'react-window';

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

export default function Clients() {
  const { user, hasPermission } = useAuth();
  const canViewAllClients = hasPermission("can_view_all_clients");
  const canDeleteData = hasPermission("can_delete_data");
  const canAssignClients = hasPermission("can_assign_clients");
  const [clients, setClients] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [otherService, setOtherService] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  // NEW PREVIEW STATES
  const [previewData, setPreviewData] = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);

  const [formData, setFormData] = useState({
    company_name: '',
    client_type: 'proprietor',
    contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
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
    if (canAssignClients) fetchUsers();
    const params = new URLSearchParams(location.search);
    if (params.get("openAddClient") === "true") {
      setDialogOpen(true);
    }
  }, [location]);

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data || []);
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

  // ==================== UTILS ====================
  const openWhatsApp = (phone, name = "") => {
    const cleanPhone = phone?.replace(/\D/g, '') || '';
    const message = encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  // ==================== MEMOIZED DATA ====================
  const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter(c => (c?.status || 'active') === 'active').length;
    const serviceCounts = {};
    clients.forEach(c => {
      if ((c?.status || 'active') === 'active' && c?.services) {
        c.services.forEach(s => {
          const name = s?.startsWith('Other:') ? 'Other' : s;
          serviceCounts[name] = (serviceCounts[name] || 0) + 1;
        });
      }
    });
    return { totalClients, activeClients, serviceCounts };
  }, [clients]);

  const todayReminders = useMemo(() => {
    const today = startOfDay(new Date());
    return clients.filter(c => {
      if (c?.birthday) {
        const anniv = new Date(c.birthday);
        if (anniv.getMonth() === today.getMonth() && anniv.getDate() === today.getDate()) return true;
      }
      return c?.contact_persons?.some(cp => {
        if (!cp?.birthday) return false;
        const bday = new Date(cp.birthday);
        return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
      }) ?? false;
    });
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = 
        (c?.company_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c?.phone || '').includes(searchTerm);
      const matchesService = serviceFilter === 'all' ||
        (c?.services ?? []).some(s => (s || '').toLowerCase().includes(serviceFilter.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || (c?.status || 'active') === statusFilter;
      return matchesSearch && matchesService && matchesStatus;
    });
  }, [clients, searchTerm, serviceFilter, statusFilter]);

  const getClientNumber = (index) => 
    String(index + 1).padStart(3, '0');

  // ==================== HANDLERS ====================
  const downloadTemplate = () => {
    const headers = [
      'company_name', 'client_type', 'email', 'phone', 'birthday', 'services',
      'contact_name_1', 'contact_designation_1', 'contact_email_1', 'contact_phone_1'
    ];
    const csvContent = headers.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'client_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          if (!row.company_name || !row.email || !row.phone) {
            console.warn("Skipping invalid row:", row);
            continue;
          }
          try {
            await api.post('/clients', {
              company_name: row.company_name?.trim(),
              client_type: [
                'proprietor',
                'pvt_ltd',
                'llp',
                'partnership',
                'huf',
                'trust',
                'other'
              ].includes(row.client_type)
                ? row.client_type
                : 'proprietor',
              email: row.email?.trim(),
              phone: row.phone?.replace(/\D/g, ""),
              birthday: row.birthday || null,
              services: row.services
                ? row.services.split(',').map(s => s.trim())
                : [],
              notes: null,
              assigned_to: null,
              contact_persons: [{
                name: row.contact_name_1 || "",
                designation: row.contact_designation_1 || null,
                email: row.contact_email_1?.trim() || null,
                phone: row.contact_phone_1
                  ? row.contact_phone_1.replace(/\D/g, "")
                  : null,
                birthday: null,
                din: null
              }],
              dsc_details: []
            });
            count++;
          } catch (e) { console.error("Import error:", e.response?.data || e); }
        }
        setImportLoading(false);
        if (count > 0) { toast.success(`${count} clients imported!`); fetchClients(); }
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        console.error(err);
        setImportLoading(false);
      }
    });
  };

  const handleImportExcel = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const workbook = XLSX.read(e.target.result, { type: 'binary' });
      const normalizeHeader = (header) => {
        if (!header) return '';
        return header.toString().toLowerCase().replace(/\s+/g, '*');
      };
      let combinedRows = [];
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: ''
        });
        if (rawRows.length < 2) return;
        const headers = rawRows[0].map(normalizeHeader);
        for (let i = 1; i < rawRows.length; i++) {
          const rowArray = rawRows[i];
          if (rowArray.every(cell => cell === '')) continue;
          let row = {};
          headers.forEach((h, idx) => {
            row[h] = rowArray[idx];
          });
          const companyName = 
            row.company_name || 
            row.companyname || 
            row['company name'] || 
            '';
          if (!companyName) continue;
          const detectedType = detectClientTypeFromName(companyName);
          combinedRows.push({
            sheet: sheetName,
            company_name: companyName,
            client_type: row.client_type || detectedType,
            email: row.email || '',
            phone: row.phone || '',
            birthday: row.birthday || '',
            services: row.services || '',
            notes: row.notes || ''
          });
        }
      });
      setPreviewHeaders([
        'sheet',
        'company_name',
        'client_type',
        'email',
        'phone',
        'birthday',
        'services',
        'notes'
      ]);
      setPreviewData(combinedRows);
      setPreviewOpen(true);
    };
    reader.readAsBinaryString(file);
  };

  // UPDATED handleSubmit with email?.trim() safety
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Remove raw "Other" tag and construct final services array
      let finalServices = [...formData.services];
      finalServices = finalServices.filter(s => !s.startsWith("Other:"));

      if (otherService.trim() && formData.services.includes("Other")) {
        finalServices.push(`Other: ${otherService.trim()}`);
      }

      // Clean main phone (digits only)
      const cleanPhone = formData.phone.replace(/\D/g, "");

      // Clean contact persons
      const cleanedContacts = formData.contact_persons.map(cp => ({
        name: cp.name || "",
        designation: cp.designation?.trim() || null,
        email: cp.email?.trim() ? cp.email.trim() : null,
        phone: cp.phone ? cp.phone.replace(/\D/g, "") : null,
        birthday: cp.birthday
          ? new Date(cp.birthday).toISOString().split("T")[0]
          : null,
        din: cp.din?.trim() || null
      }));

      // Construct backend-safe payload (DO NOT spread formData)
      const payload = {
        company_name: formData.company_name.trim(),
        client_type: formData.client_type,
        email: formData.email?.trim(),                    // ← FIXED: defensive optional chaining
        phone: cleanPhone,
        birthday: formData.birthday
          ? new Date(formData.birthday).toISOString().split("T")[0]
          : null,
        services: finalServices,
        notes: formData.notes?.trim() || null,
        assigned_to:
          formData.assigned_to === "unassigned"
            ? null
            : formData.assigned_to,
        contact_persons: cleanedContacts,
        dsc_details: formData.dsc_details || []
      };

      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
      } else {
        await api.post("/clients", payload);
      }

      setDialogOpen(false);
      resetForm();
      fetchClients();
      toast.success("Saved successfully!");

    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving client");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      ...client,
      contact_persons: client?.contact_persons?.map(cp => ({
        ...cp,
        birthday: cp?.birthday ? format(new Date(cp.birthday), 'yyyy-MM-dd') : '',
        din: cp?.din || ''
      })) || [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      birthday: client?.birthday ? format(new Date(client.birthday), 'yyyy-MM-dd') : '',
      status: client?.status || 'active',
      assigned_to: client?.assigned_to || 'unassigned',
      dsc_details: client?.dsc_details || []
    });
    const other = client?.services?.find(s => s.startsWith('Other: '));
    setOtherService(other ? other.replace('Other: ', '') : '');
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      client_type: 'proprietor',
      contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      email: '',
      phone: '',
      birthday: '',
      services: [],
      dsc_details: [],
      assigned_to: 'unassigned',
      notes: '',
      status: 'active'
    });
    setOtherService('');
    setEditingClient(null);
  };

  // ==================== DYNAMIC FIELDS ====================
  const updateContact = (idx, field, val) => setFormData(p => ({
    ...p,
    contact_persons: p.contact_persons.map((c, i) =>
      i === idx ? { ...c, [field]: val } : c
    )
  }));

  const addContact = () => setFormData(p => ({
    ...p,
    contact_persons: [...p.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '', din: '' }]
  }));

  const removeContact = (idx) => setFormData(p => ({
    ...p,
    contact_persons: p.contact_persons.filter((_, i) => i !== idx)
  }));

  const updateDSC = (idx, field, val) => setFormData(p => ({
    ...p,
    dsc_details: p.dsc_details.map((d, i) => i === idx ? { ...d, [field]: val } : d)
  }));

  const addDSC = () => setFormData(p => ({
    ...p,
    dsc_details: [...p.dsc_details, { certificate_number: '', holder_name: '', issue_date: '', expiry_date: '', notes: '' }]
  }));

  const removeDSC = (idx) => setFormData(p => ({
    ...p,
    dsc_details: p.dsc_details.filter((_, i) => i !== idx)
  }));

  const toggleService = (s) => setFormData(p => {
    const services = p.services.includes(s)
      ? p.services.filter(x => x !== s)
      : [...p.services, s];
    return { ...p, services };
  });

  const addOtherService = () => {
    if (otherService.trim()) {
      setFormData(prev => ({
        ...prev,
        services: [
          ...prev.services.filter(s => !s.startsWith('Other:')),
          `Other: ${otherService.trim()}`
        ]
      }));
      setOtherService('');
    }
  };

  const detectClientTypeFromName = (name = '') => {
    const lower = name.toLowerCase().trim();
    const normalized = lower.replace(/\s+/g, ' ');
    if (
      normalized.includes('private limited') ||
      normalized.includes('pvt ltd') ||
      normalized.includes('pvt. ltd') ||
      normalized.includes('pvt limited')
    ) {
      return 'pvt_ltd';
    }
    if (
      normalized.includes('limited liability partnership') ||
      normalized.includes('llp')
    ) {
      return 'llp';
    }
    if (
      normalized.endsWith(' ltd') ||
      normalized.endsWith(' limited') ||
      normalized.includes(' ltd ') ||
      normalized.includes(' limited ')
    ) {
      return 'pvt_ltd';
    }
    if (normalized.includes('partnership')) {
      return 'partnership';
    }
    if (normalized.includes('huf')) {
      return 'huf';
    }
    if (normalized.includes('trust')) {
      return 'trust';
    }
    return 'proprietor';
  };

  // ────────────────────────────────────────────────
  // REFINED Virtualized Client Card Renderer
  // ────────────────────────────────────────────────
  const ClientCard = ({ columnIndex, rowIndex, style, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    const client = filteredClients[index];
    if (index >= filteredClients.length || !client) return null;

    return (
      <div style={style} className="p-3 box-border">
        <Card className="h-full w-full rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 group relative">
          
          {/* Status Indicator */}
          {client.status === 'inactive' && (
            <div className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-700 rounded-full z-10">
              Archived
            </div>
          )}

          <div className="p-4 flex flex-col h-full">
            {/* Header */}
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400 font-medium tracking-tight">
                  {getClientNumber(index)}
                </span>
                <h3 className="font-semibold text-sm leading-tight truncate pr-8 text-slate-900">
                  {client.company_name}
                </h3>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">
                {CLIENT_TYPES.find(t => t.value === client.client_type)?.label || client.client_type}
              </p>
            </div>

            {/* Contact Info */}
            <div className="space-y-2 text-xs text-slate-600 flex-1">
              <div className="flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate font-medium">{client.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate">{client.email || '—'}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                {client.services?.length > 0 && (
                  <div className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] rounded-full font-medium">
                    {client.services[0].replace('Other: ', '').length > 16 
                      ? client.services[0].replace('Other: ', '').substring(0, 13) + '...' 
                      : client.services[0].replace('Other: ', '')}
                  </div>
                )}
              </div>

              {/* Action Buttons - Visible on Hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    openWhatsApp(client.phone, client.company_name); 
                  }}
                  className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors"
                  title="Message on WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleEdit(client); 
                  }}
                  className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-xl transition-colors"
                  title="Edit Client"
                >
                  <Edit className="h-4 w-4" />
                </button>
                {canDeleteData && (
                  <button
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (confirm("Delete this client permanently?")) {
                        api.delete(`/clients/${client.id}`).then(() => fetchClients());
                      }
                    }}
                    className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-colors"
                    title="Delete Client"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-outfit">Client Management</h1>
          <p className="text-slate-600 mt-1">Manage firm clients and track details</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={downloadTemplate} className="border-indigo-600 text-indigo-600">
            <FileText className="mr-2 h-4 w-4" />CSV Format
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={importLoading}
          >
            {importLoading ? 'Importing...' : 'Add CSV'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { 
            setDialogOpen(open); 
            if (!open) resetForm(); 
          }}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg transition-all">
                <Plus className="mr-2 h-5 w-5" /> Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto bg-white rounded-3xl border-none shadow-2xl">
              <div className="p-8 space-y-8">
                <DialogHeader className="flex flex-row justify-between items-center">
                  <div>
                    <DialogTitle className="text-2xl font-bold font-outfit">Client Entry</DialogTitle>
                    <DialogDescription>Enter core client information below.</DialogDescription>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Status: {formData.status}</Label>
                    <Switch 
                      checked={formData.status === 'active'} 
                      onCheckedChange={c => setFormData({...formData, status: c ? 'active' : 'inactive'})} 
                    />
                  </div>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-6">
                    <h3 className="text-base font-bold text-slate-800">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-slate-500">Company Name *</Label>
                        <Input 
                          className="bg-white border-slate-200 h-11" 
                          value={formData.company_name} 
                          onChange={e => setFormData({...formData, company_name: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-slate-500">Client Type *</Label>
                        <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v})}>
                          <SelectTrigger className="bg-white border-slate-200 h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-slate-500">Email *</Label>
                        <Input 
                          className="bg-white border-slate-200 h-11" 
                          type="email" 
                          value={formData.email} 
                          onChange={e => setFormData({...formData, email: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-slate-500">Phone *</Label>
                        <Input 
                          className="bg-white border-slate-200 h-11" 
                          value={formData.phone} 
                          onChange={e => setFormData({...formData, phone: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label className="text-xs font-semibold uppercase text-slate-500">Date of Incorporation / Birthday</Label>
                        <Input 
                          className="bg-white border-slate-200 h-11" 
                          type="date" 
                          value={formData.birthday} 
                          onChange={e => setFormData({...formData, birthday: e.target.value})} 
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-6">
                    <div className="flex justify-between items-end">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Contact Persons</h3>
                        <p className="text-xs text-slate-400">Manage associated contacts</p>
                      </div>
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={addContact} 
                        variant="outline" 
                        className="h-9 bg-white border-slate-200 rounded-lg"
                      >
                        <Plus className="h-4 w-4 mr-1.5" /> Add Contact
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {formData.contact_persons.map((cp, idx) => (
                        <div 
                          key={idx} 
                          className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm relative space-y-4"
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-700">Contact Person #{idx + 1}</span>
                            {formData.contact_persons.length > 1 && (
                              <Button 
                                type="button" 
                                size="icon" 
                                variant="ghost" 
                                onClick={() => removeContact(idx)} 
                                className="h-8 w-8 text-slate-300 hover:text-red-500"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Name</Label>
                              <Input 
                                value={cp.name} 
                                onChange={e => updateContact(idx, 'name', e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Designation</Label>
                              <Input 
                                value={cp.designation} 
                                onChange={e => updateContact(idx, 'designation', e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Email</Label>
                              <Input 
                                type="email" 
                                value={cp.email} 
                                onChange={e => updateContact(idx, 'email', e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Phone</Label>
                              <Input 
                                value={cp.phone} 
                                onChange={e => updateContact(idx, 'phone', e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">Birthday</Label>
                              <Input 
                                type="date" 
                                value={cp.birthday || ''} 
                                onChange={e => updateContact(idx, 'birthday', e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">DIN</Label>
                              <Input 
                                value={cp.din || ''} 
                                onChange={e => updateContact(idx, 'din', e.target.value)} 
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Services *</Label>
                    <div className="flex flex-wrap gap-2">
                      {SERVICES.map(s => (
                        <Badge 
                          key={s} 
                          variant={ 
                            formData.services.includes(s) || 
                            (s === 'Other' && formData.services.some(x => x.startsWith('Other:'))) 
                            ? "default" 
                            : "outline" 
                          } 
                          className="cursor-pointer px-4 py-1.5 rounded-full text-[11px]" 
                          onClick={() => toggleService(s)}
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                    {formData.services.includes('Other') && (
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-slate-500">Specify other service</Label>
                          <Input 
                            placeholder="e.g. IEC Registration, FEMA Compliance..." 
                            value={otherService} 
                            onChange={e => setOtherService(e.target.value)} 
                          />
                        </div>
                        <Button 
                          type="button" 
                          size="sm" 
                          onClick={addOtherService}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</Label>
                    <Textarea 
                      className="bg-slate-50 border-slate-100 min-h-[120px] rounded-xl" 
                      placeholder="Additional information, remarks, internal notes..." 
                      value={formData.notes} 
                      onChange={e => setFormData({...formData, notes: e.target.value})} 
                    />
                  </div>
                  {canAssignClients && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Assigned To</Label>
                      <Select 
                        value={formData.assigned_to} 
                        onValueChange={v => setFormData({...formData, assigned_to: v})} 
                      >
                        <SelectTrigger className="bg-white border-slate-200 h-11">
                          <SelectValue placeholder="Select staff member" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <DialogFooter className="sticky bottom-0 bg-white pt-6 pb-4 border-t flex flex-col sm:flex-row gap-3">
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="button" variant="outline" onClick={downloadTemplate}>
                        CSV Format
                      </Button>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button 
                        type="button" 
                        className="bg-indigo-600 text-white" 
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Add CSV
                      </Button>
                      <Button 
                        type="button" 
                        className="bg-indigo-600 text-white" 
                        disabled={importLoading} 
                        onClick={() => excelInputRef.current?.click()}
                      >
                        Add Master Data
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={loading} 
                        className="bg-indigo-900 text-white px-10"
                      >
                        {loading ? 'Saving...' : editingClient ? 'Update Client' : 'Create Client'}
                      </Button>
                    </div>
                  </DialogFooter>
                </form>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {canViewAllClients && todayReminders.length > 0 && (
        <Card className="bg-pink-50 border-pink-100 animate-pulse">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-white rounded-full text-pink-500 shadow-sm">
              <Cake className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-pink-900">Today's Celebrations</h4>
              <div className="flex flex-wrap gap-2 mt-1">
                {todayReminders.map(c => (
                  <Badge key={c.id} className="bg-white text-pink-700 border-pink-200 shadow-sm">
                    {c.company_name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canViewAllClients && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 font-bold">Total Clients</p>
              <h2 className="text-xl font-bold">{stats.totalClients}</h2>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 font-bold">Active</p>
              <h2 className="text-xl font-bold">{stats.activeClients}</h2>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400 font-bold">Archived</p>
              <h2 className="text-xl font-bold">{stats.totalClients - stats.activeClients}</h2>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3 bg-white border-slate-100 shadow-sm">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] uppercase text-slate-400 font-bold">Top Service</p>
              <h2 className="text-sm font-bold truncate">
                {Object.entries(stats.serviceCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A'}
              </h2>
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <Input 
            placeholder="Search company, email or phone..." 
            className="pl-9 h-10 bg-slate-50 border-none focus-visible:ring-indigo-500" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 bg-slate-50 border-none w-[110px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="h-10 bg-slate-50 border-none w-[150px] text-xs">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-[70vh] min-h-[500px] w-full border rounded-xl overflow-hidden bg-white shadow-sm">
        {filteredClients.length > 0 ? (
          <AutoSizer>
            {({ height, width }) => {
              const CARD_SIZE = 190;
              const columnCount = Math.max(1, Math.floor(width / CARD_SIZE));
              const columnWidth = CARD_SIZE;
              const rowHeight = CARD_SIZE;
              const rowCount = Math.ceil(filteredClients.length / columnCount);
              return (
                <Grid
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  height={height}
                  rowCount={rowCount}
                  rowHeight={rowHeight}
                  width={width}
                  overscanColumnCount={2}
                  overscanRowCount={3}
                >
                  {({ columnIndex, rowIndex, style }) => (
                    <ClientCard 
                      columnIndex={columnIndex} 
                      rowIndex={rowIndex} 
                      style={style} 
                      columnCount={columnCount} 
                    />
                  )}
                </Grid>
              );
            }}
          </AutoSizer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Users className="h-12 w-12 mb-2 opacity-20" />
            <p>No clients found. Click "Add Client" to start.</p>
          </div>
        )}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        accept=".csv" 
        onChange={handleImportCSV} 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={excelInputRef} 
        accept=".xlsx" 
        onChange={handleImportExcel} 
        className="hidden" 
      />

      {/* NEW EXCEL PREVIEW DIALOG */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Excel Preview Before Import</DialogTitle>
            <DialogDescription>
              Review and edit data before importing.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  {previewHeaders.map(h => (
                    <th key={h} className="p-2 border text-left uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {previewHeaders.map(header => (
                      <td key={header} className="border p-1">
                        <Input 
                          value={row[header] || ''} 
                          onChange={e => {
                            const updated = [...previewData];
                            updated[rowIndex][header] = e.target.value;
                            setPreviewData(updated);
                          }} 
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-indigo-600 text-white" 
              onClick={async () => {
                setImportLoading(true);
                let success = 0;
                for (let row of previewData) {
                  try {
                    await api.post('/clients', {
                      company_name: row.company_name?.trim(),
                      client_type: [
                        'proprietor',
                        'pvt_ltd',
                        'llp',
                        'partnership',
                        'huf',
                        'trust',
                        'other'
                      ].includes(row.client_type)
                        ? row.client_type
                        : 'proprietor',
                      email: row.email?.trim(),
                      phone: row.phone?.replace(/\D/g, ""),
                      birthday: row.birthday || null,
                      services: row.services
                        ? row.services.split(',').map(s => s.trim())
                        : [],
                      notes: row.notes?.trim() || null,
                      assigned_to: null,
                      contact_persons: [],
                      dsc_details: []
                    });
                    success++;
                  } catch (err) {
                    console.error(err);
                  }
                }
                toast.success(`${success} clients imported`);
                fetchClients();
                setPreviewOpen(false);
                setImportLoading(false);
              }}
            >
              Confirm Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
