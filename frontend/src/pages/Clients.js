import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress'; // ← make sure this component exists (shadcn/ui)
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Mail, Cake, X, UserPlus, FileText } from 'lucide-react';
import { format } from 'date-fns';
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

export default function Clients() {
  const { user } = useAuth();

  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [otherService, setOtherService] = useState('');

  // CSV import states
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    company_name: '',
    client_type: 'proprietor',
    contact_persons: [{ name: '', email: '', phone: '', designation: '' }],
    email: '',
    phone: '',
    birthday: '',
    services: [],
    dsc_details: [],
    assigned_to: 'unassigned',
    notes: '',
  });

  useEffect(() => {
    fetchClients();
    if (user?.role !== 'staff') fetchUsers();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await api.get('/clients');
      setClients(res.data);
    } catch {
      toast.error('Failed to load clients');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch {
      console.error('Failed to load users');
    }
  };

  // ────────────────────────────────────────────────
  //                   CSV HANDLING
  // ────────────────────────────────────────────────

  const downloadTemplate = () => {
    const headers = [
      'company_name','client_type','email','phone','birthday',
      'contact_name_1','contact_designation_1','contact_email_1','contact_phone_1',
      'contact_name_2','contact_designation_2','contact_email_2','contact_phone_2',
      'services','notes'
    ];

    const example = [
      'ABC Enterprises','proprietor','company@example.com','+919876543210','2025-04-15',
      'Rahul Sharma','Director','rahul@abc.com','+919812345678',
      'Priya Patel','Manager','priya@abc.com','+918923456789',
      'GST,Income Tax,Other: Consulting','Prefers WhatsApp'
    ];

    const csv = [headers.join(','), example.map(v => `"${v}"`).join(',')].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clients-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportProgress(0);
    setImportResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: async (results) => {
        if (results.errors.length > 0 && results.errors.some(err => err.type !== 'FieldMismatch')) {
          toast.error('Invalid CSV format. Please use the template.');
          setImportLoading(false);
          return;
        }

        const rows = results.data;
        const total = rows.length;
        let processed = 0;
        const errors = [];
        const created = [];

        for (const [index, row] of rows.entries()) {
          processed++;
          setImportProgress(Math.round((processed / total) * 100));

          const rowNum = index + 2;
          const rowErrors = [];

          // Required fields + basic format checks
          if (!row.company_name?.trim()) rowErrors.push('Company name required');
          if (!row.email?.trim()) rowErrors.push('Email required');
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
            rowErrors.push('Invalid email');
          }
          if (!row.phone?.trim()) rowErrors.push('Phone required');

          if (row.birthday?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.birthday.trim())) {
            rowErrors.push('Birthday format: YYYY-MM-DD');
          }

          const cType = (row.client_type || '').trim().toLowerCase();
          if (cType && !CLIENT_TYPES.some(t => t.value === cType)) {
            rowErrors.push(`Invalid client type: ${row.client_type}`);
          }

          if (rowErrors.length > 0) {
            errors.push(`Row ${rowNum}: ${rowErrors.join(', ')} (${row.company_name || '—'})`);
            continue;
          }

          try {
            const contacts = [];
            if (row.contact_name_1?.trim()) {
              contacts.push({
                name: row.contact_name_1.trim(),
                designation: row.contact_designation_1?.trim() || '',
                email: row.contact_email_1?.trim() || '',
                phone: row.contact_phone_1?.trim() || '',
              });
            }
            if (row.contact_name_2?.trim()) {
              contacts.push({
                name: row.contact_name_2.trim(),
                designation: row.contact_designation_2?.trim() || '',
                email: row.contact_email_2?.trim() || '',
                phone: row.contact_phone_2?.trim() || '',
              });
            }

            const services = row.services
              ? row.services.split(',').map(s => s.trim()).filter(Boolean)
              : [];

            const payload = {
              company_name: row.company_name.trim(),
              client_type: cType || 'proprietor',
              email: row.email.trim(),
              phone: row.phone.trim(),
              birthday: row.birthday?.trim() || '',
              contact_persons: contacts.length ? contacts : [{ name: '', email: '', phone: '', designation: '' }],
              services,
              notes: row.notes?.trim() || '',
              assigned_to: 'unassigned',
              dsc_details: [],
            };

            await api.post('/clients', payload);
            created.push(payload.company_name);
          } catch (err) {
            const msg = err.response?.data?.detail || err.message || 'Server error';
            errors.push(`Row ${rowNum}: ${msg} (${row.company_name || '—'})`);
          }
        }

        setImportLoading(false);
        setImportProgress(100);

        const result = {
          success: created.length,
          failed: errors.length,
          errors,
        };

        setImportResult(result);

        if (created.length > 0) {
          toast.success(`${created.length} client${created.length === 1 ? '' : 's'} added`);
          fetchClients();
        }

        if (errors.length > 0) {
          toast.warning(`${errors.length} row${errors.length === 1 ? '' : 's'} failed`);
        }
      },
      error: (err) => {
        setImportLoading(false);
        toast.error(`Could not read file: ${err.message}`);
      },
    });
  };

  // ────────────────────────────────────────────────
  //                   FORM SUBMIT / EDIT / DELETE
  // ────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
      };

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
      toast.error(err.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      company_name: client.company_name,
      client_type: client.client_type,
      contact_persons: client.contact_persons?.length ? client.contact_persons : [{ name: '', email: '', phone: '', designation: '' }],
      email: client.email,
      phone: client.phone,
      birthday: client.birthday ? format(new Date(client.birthday), 'yyyy-MM-dd') : '',
      services: client.services || [],
      dsc_details: client.dsc_details || [],
      assigned_to: client.assigned_to || 'unassigned',
      notes: client.notes || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this client?')) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success('Deleted');
      fetchClients();
    } catch {
      toast.error('Delete failed');
    }
  };

  const sendBirthdayEmail = async (id) => {
    try {
      await api.post(`/clients/${id}/send-birthday-email`);
      toast.success('Email sent');
    } catch {
      toast.error('Failed to send');
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      client_type: 'proprietor',
      contact_persons: [{ name: '', email: '', phone: '', designation: '' }],
      email: '',
      phone: '',
      birthday: '',
      services: [],
      dsc_details: [],
      assigned_to: 'unassigned',
      notes: '',
    });
    setEditingClient(null);
    setOtherService('');
  };

  const toggleService = (service) => {
    if (service === 'Other') {
      if (formData.services.includes('Other')) {
        setFormData(p => ({
          ...p,
          services: p.services.filter(s => s !== 'Other' && !s.startsWith('Other:')),
        }));
        setOtherService('');
      } else {
        setFormData(p => ({ ...p, services: [...p.services, 'Other'] }));
      }
      return;
    }

    setFormData(p => ({
      ...p,
      services: p.services.includes(service)
        ? p.services.filter(s => s !== service)
        : [...p.services, service],
    }));
  };

  const addOtherService = () => {
    if (!otherService.trim()) return;
    setFormData(p => ({
      ...p,
      services: [...p.services.filter(s => s !== 'Other'), `Other: ${otherService}`],
    }));
    setOtherService('');
  };

  const addContactPerson = () => {
    setFormData(p => ({
      ...p,
      contact_persons: [...p.contact_persons, { name: '', email: '', phone: '', designation: '' }],
    }));
  };

  const removeContactPerson = (index) => {
    if (formData.contact_persons.length <= 1) return;
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.filter((_, i) => i !== index),
    }));
  };

  const updateContactPerson = (index, field, value) => {
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      ),
    }));
  };

  const addDSC = () => {
    setFormData(p => ({
      ...p,
      dsc_details: [...p.dsc_details, {
        certificate_number: '', holder_name: '', issue_date: '', expiry_date: '', notes: ''
      }],
    }));
  };

  const removeDSC = (index) => {
    setFormData(p => ({
      ...p,
      dsc_details: p.dsc_details.filter((_, i) => i !== index),
    }));
  };

  const updateDSC = (index, field, value) => {
    setFormData(p => ({
      ...p,
      dsc_details: p.dsc_details.map((d, i) => i === index ? { ...d, [field]: value } : d),
    }));
  };

  const getUserName = (id) => users.find(u => u.id === id)?.full_name || 'Unassigned';

  const getClientTypeLabel = (type) => CLIENT_TYPES.find(t => t.value === type)?.label || type;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Client Management</h1>
          <p className="text-slate-600">Manage your clients and track their details</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg">
              <Plus className="mr-2 h-5 w-5" /> Add Client
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
              <DialogDescription>
                {editingClient ? 'Update client details.' : 'Fill in the details to add a new client.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name *</Label>
                    <Input
                      value={formData.company_name}
                      onChange={e => setFormData(s => ({ ...s, company_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Type *</Label>
                    <Select
                      value={formData.client_type}
                      onValueChange={v => setFormData(s => ({ ...s, client_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData(s => ({ ...s, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company Phone *</Label>
                    <Input
                      value={formData.phone}
                      onChange={e => setFormData(s => ({ ...s, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Company Birthday/Anniversary</Label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={e => setFormData(s => ({ ...s, birthday: e.target.value }))}
                  />
                </div>
              </div>

              {/* ────────────────────────────────────────────────
                  →→→ Insert your full Contact Persons, DSC Details, Services, Assign To, Notes sections here ←←←
                  (the code below is placeholder – replace with your actual implementation)
              ──────────────────────────────────────────────── */}

              <div className="space-y-4">
                <h3 className="font-semibold">Contact Persons</h3>
                {/* your contact persons cards + add/remove logic */}
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">DSC Details</h3>
                {/* your DSC cards + add/remove logic */}
              </div>

              <div className="space-y-2">
                <Label>Services</Label>
                {/* your service badges / toggle logic */}
              </div>

              {user?.role !== 'staff' && (
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select
                    value={formData.assigned_to}
                    onValueChange={v => setFormData(s => ({ ...s, assigned_to: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={e => setFormData(s => ({ ...s, notes: e.target.value }))}
                  rows={3}
                />
              </div>

              {/* Footer with CSV + actions */}
              <DialogFooter className="flex flex-col sm:flex-row justify-between gap-4 pt-6 border-t mt-6">
                {!editingClient && (
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={downloadTemplate}>
                      <FileText className="mr-2 h-4 w-4" />
                      Download CSV Template
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importLoading}
                    >
                      {importLoading ? 'Importing...' : 'Import from CSV'}
                    </Button>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading} className="min-w-[140px]">
                    {loading ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}
                  </Button>
                </div>
              </DialogFooter>
            </form>

            {/* Progress bar during import */}
            {importLoading && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Importing clients...</span>
                  <span>{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}

            {/* Import result summary */}
            {importResult && (
              <div className="mt-6 p-4 border rounded-lg bg-slate-50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Import Summary</h3>
                  <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <p className="font-medium text-green-700">Success</p>
                    <p>{importResult.success} clients</p>
                  </div>
                  <div>
                    <p className="font-medium text-red-700">Failed</p>
                    <p>{importResult.failed} rows</p>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="max-h-48 overflow-auto text-sm bg-white p-3 rounded border border-red-200">
                    <ul className="list-disc pl-5 space-y-1">
                      {importResult.errors.map((err, i) => (
                        <li key={i} className="text-red-800">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImportCSV}
          className="hidden"
        />
      </div>

      {/* Clients list / cards – keep your original rendering logic here */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map(client => (
          <Card key={client.id}>
            <CardHeader>
              <CardTitle>{client.company_name}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* your client card content */}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
