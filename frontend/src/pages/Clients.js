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

  const [importLoading, setImportLoading] = useState(false);
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
    if (user?.role !== 'staff') {
      fetchUsers();
    }
  }, []);

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
  //                CSV FUNCTIONS
  // ────────────────────────────────────────────────

  const downloadTemplate = () => {
    const headers = [
      'company_name', 'client_type', 'email', 'phone', 'birthday',
      'contact_name_1', 'contact_designation_1', 'contact_email_1', 'contact_phone_1',
      'contact_name_2', 'contact_designation_2', 'contact_email_2', 'contact_phone_2',
      'services', 'notes'
    ];

    const example = [
      'ABC Enterprises', 'proprietor', 'company@example.com', '+919876543210', '2025-04-15',
      'Rahul Sharma', 'Director', 'rahul@abc.com', '+919812345678',
      'Priya Patel', 'Manager', 'priya@abc.com', '+918923456789',
      'GST,Income Tax,Other: Consulting', 'Prefers WhatsApp'
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

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data: rows }) => {
        let success = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            if (!row.company_name?.trim()) throw new Error('Missing company_name');
            if (!row.email?.trim()) throw new Error('Missing email');
            if (!row.phone?.trim()) throw new Error('Missing phone');

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
              client_type: CLIENT_TYPES.some(t => t.value === row.client_type?.trim())
                ? row.client_type.trim()
                : 'proprietor',
              email: row.email.trim(),
              phone: row.phone.trim(),
              birthday: row.birthday?.trim() || '',
              contact_persons: contacts.length > 0 ? contacts : [{ name: '', email: '', phone: '', designation: '' }],
              services,
              notes: row.notes?.trim() || '',
              assigned_to: 'unassigned',
              dsc_details: [],
            };

            await api.post('/clients', payload);
            success++;
          } catch (err) {
            errors.push(`Row ${i + 2}: ${err.message || err.response?.data?.detail || 'Unknown error'}`);
          }
        }

        setImportLoading(false);

        if (success > 0) {
          toast.success(`${success} client${success === 1 ? '' : 's'} imported`);
          fetchClients();
        }
        if (errors.length > 0) {
          toast.error(`${errors.length} row${errors.length === 1 ? '' : 's'} failed`);
          console.log('Import errors:', errors);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: () => {
        setImportLoading(false);
        toast.error('Failed to read CSV');
      },
    });
  };

  // ────────────────────────────────────────────────
  //                FORM HANDLERS (unchanged parts)
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
      toast.error(err.response?.data?.detail || 'Save failed');
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
      toast.success('Client deleted');
      fetchClients();
    } catch {
      toast.error('Delete failed');
    }
  };

  const sendBirthdayEmail = async (id) => {
    try {
      await api.post(`/clients/${id}/send-birthday-email`);
      toast.success('Birthday email sent');
    } catch {
      toast.error('Failed to send email');
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
      if (!formData.services.includes('Other')) {
        setFormData(p => ({ ...p, services: [...p.services, 'Other'] }));
      } else {
        setFormData(p => ({
          ...p,
          services: p.services.filter(s => s !== 'Other' && !s.startsWith('Other:')),
        }));
        setOtherService('');
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

  const removeContactPerson = (idx) => {
    if (formData.contact_persons.length <= 1) return;
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.filter((_, i) => i !== idx),
    }));
  };

  const updateContact = (idx, field, value) => {
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const addDSC = () => {
    setFormData(p => ({
      ...p,
      dsc_details: [...p.dsc_details, { certificate_number: '', holder_name: '', issue_date: '', expiry_date: '', notes: '' }],
    }));
  };

  const removeDSC = (idx) => {
    setFormData(p => ({
      ...p,
      dsc_details: p.dsc_details.filter((_, i) => i !== idx),
    }));
  };

  const updateDSC = (idx, field, value) => {
    setFormData(p => ({
      ...p,
      dsc_details: p.dsc_details.map((d, i) => i === idx ? { ...d, [field]: value } : d),
    }));
  };

  const getUserName = (id) => users.find(u => u.id === id)?.full_name || 'Unassigned';

  const getTypeLabel = (type) => CLIENT_TYPES.find(t => t.value === type)?.label || type;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Client Management</h1>
          <p className="text-muted-foreground">Manage your clients and track their details</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
              <DialogDescription>
                {editingClient ? 'Update the client details.' : 'Fill in the details to create a new client.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ─── Basic Information ─── */}
              <div className="space-y-4">
                <h3 className="font-semibold">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Company Name *</Label>
                    <Input
                      value={formData.company_name}
                      onChange={e => setFormData(s => ({ ...s, company_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label>Client Type *</Label>
                    <Select
                      value={formData.client_type}
                      onValueChange={v => setFormData(s => ({ ...s, client_type: v }))}
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Company Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData(s => ({ ...s, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label>Company Phone *</Label>
                    <Input
                      value={formData.phone}
                      onChange={e => setFormData(s => ({ ...s, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>Company Birthday / Anniversary</Label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={e => setFormData(s => ({ ...s, birthday: e.target.value }))}
                  />
                </div>
              </div>

              {/* ─── Contact Persons, DSC, Services, Assign To, Notes ─── */}
              {/* Keep your existing code for these sections here */}
              {/* For brevity I'm not repeating them – insert your current implementation */}

              {/* ─── Footer with CSV buttons on left, actions on right ─── */}
              <DialogFooter className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
                {!editingClient && (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={downloadTemplate}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Download CSV Template
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importLoading}
                    >
                      {importLoading ? 'Importing…' : 'Import from CSV'}
                    </Button>
                  </div>
                )}

                <div className="flex gap-3 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setDialogOpen(false); resetForm(); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="min-w-[120px]"
                  >
                    {loading
                      ? 'Saving…'
                      : editingClient
                      ? 'Update Client'
                      : 'Add Client'}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImportCSV}
          hidden
        />
      </div>

      {/* ─── Clients grid / list ─── */}
      {/* Keep your existing clients display code here */}
      {/* Example placeholder: */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {clients.map(client => (
          <Card key={client.id}>
            <CardHeader>
              <CardTitle>{client.company_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{client.email} • {client.phone}</p>
              {/* ... rest of card content ... */}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
